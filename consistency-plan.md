# Visual Consistency Plan — Bible + Cast Refs Pipeline

Status: design draft, locked decisions, not yet implemented.
Scope: enables serious filmmakers to produce multi-scene, multi-episode video with character / location / product / style continuity at production quality. **This is the feature that converts Stori from a video-gen toy into a long-form filmmaking tool.**

---

## 1. Goal

Lock visual continuity — characters, locations, product/brand IP, palette, lighting, rendering style — across:

- Within a single project's scenes (today's known weakness: drift across grid batches)
- Across regenerations of any single scene (today's known weakness: regen drifts away from neighbors)
- Across episodes of a series (future: enables serialized content; requires cross-project bible storage in Supabase)

The mechanism is a **project visual bible** — a Gemini-generated 9-cell grid that captures every locked entity in the chosen art style, cropped per-cell, and used as a content-addressed reference pool that the per-scene generation pipeline pulls from.

## 2. Non-goals

- Not a cost-reduction play. (That's a separate v2 effort with Flux 2 Flash.)
- Not a replacement for cast lock. Cast portraits stay; bible is layered on top.
- Not a manual storyboarding tool. Bible cells are AI-generated, not user-painted.
- Not multi-vendor in v1. Stays on Gemini Pro Image. Provider abstraction comes later.

## 3. Scope matrix

| | Autopilot (short-form) | Copilot (long-form) |
|---|---|---|
| **Film** | Bible mandatory + cast refs threaded into grid | Bible mandatory + cast refs + first-batch-as-style-anchor for batches 2+ |
| **Brand** | Bible mandatory (product-heavy layout) + product/presenter refs | Bible mandatory (product-heavy) + refs + style anchor batch 2+ |
| **Narration** | Today's flow + sequential-framing prompt | Today's flow + sequential-framing + first-batch-as-style-anchor for batches 2+ |

**Bible mandatory** for any project where `videoType ∈ {film, brand}` AND at least one entity is locked. Not optional. Generation is automatic at storyboard finalize. Project cannot proceed to scene generation without a successful bible.

Narration mode never generates a bible (no bracketed entities to index against).

## 4. Pre-existing primitives reused

- **Cast lock pipeline** ([js/17b-create-references.js](js/17b-create-references.js)): generates `representativeImageDataUrl` per locked entity. Stays as-is. Becomes the input to the bible call.
- **Grid call infrastructure** ([js/17c-create-pipeline.js#L2428](js/17c-create-pipeline.js#L2428) `generateGridImage`): used to generate the bible (one 9-cell grid call). Output dimensions and 2× upscale pattern preserved.
- **Cell crop pipeline** ([js/17c-create-pipeline.js](js/17c-create-pipeline.js) `createUpscaleAndCrop`): used to extract individual bible cells at 2K resolution.
- **Bracket token parser** ([js/17b-create-references.js](js/17b-create-references.js) `castParseBracketTokens`): used to identify entities per scene and look up matching bible cells.
- **`refParts` mechanism** in `generateImageGeminiFlash`: each ref is one `inlineData` + one `text` label. Already used for single-scene cast refs. Extended to grid calls for batch-level refs.
- **IndexedDB image storage** ([js/17b-create-references.js](js/17b-create-references.js)): used to persist bible composites and per-cell crops out of localStorage's 5MB cap.
- **Storyboard preamble** (`castBuildStoryboardPreamble`): identical text injected into every grid prompt. Bible adds a parallel preamble that injects ref-binding instructions.
- **Canvas chrome node pattern** ([js/29-canvas-render.js](js/29-canvas-render.js)): Bible chrome node mirrors the Launch Agent / Final Render / Narrator Setup pattern.
- **Project autosave** ([js/17c-create-pipeline.js](js/17c-create-pipeline.js) `autoSaveCreateState`): bible metadata rides on this; image data goes to IDB.

## 5. Data model

All additive; nothing removed.

```js
// Project state
window.createJobState.bible = {
  // Metadata (in localStorage via autosave)
  id: 'bible_<projectId>_<timestamp>',
  status: 'pending' | 'generating' | 'ready' | 'stale' | 'error',
  templateId: '<template-id-at-gen-time>',     // template lock — bible binds project to this
  styleFingerprint: '<hash>',                  // detect template/style changes
  generatedAt: <ISO timestamp>,
  lastError: null | string,

  // Pages — usually 1; 2 when entity count > 6
  pages: [
    {
      pageIdx: 0,
      gridImageId: 'idb_bible_<id>_p0_2k',     // 2K original (for refs)
      gridImageDisplayId: 'idb_bible_<id>_p0_4k', // 4K upscaled (for user display)
      slots: [                                  // 9 slots per page
        { idx: 0, name: 'Maya',     priority: 'entity',  locked: true,  cellImageId: 'idb_bible_<id>_p0_c0_2k', versions: [...] },
        { idx: 1, name: 'Joe',      priority: 'entity',  locked: true,  cellImageId: '...', versions: [...] },
        { idx: 2, name: 'Sara',     priority: 'entity',  locked: true,  cellImageId: '...', versions: [...] },
        { idx: 3, name: 'Kitchen',  priority: 'entity',  locked: true,  cellImageId: '...', versions: [...] },
        { idx: 4, name: 'Park',     priority: 'entity',  locked: true,  cellImageId: '...', versions: [...] },
        { idx: 5, name: 'product',  priority: 'entity',  locked: true,  cellImageId: '...', versions: [...] },  // brand only
        { idx: 6, name: 'hero',     priority: 'utility', locked: false, cellImageId: '...', versions: [...] },
        { idx: 7, name: 'palette',  priority: 'utility', locked: true,  cellImageId: '...', versions: [...] },  // never auto-replace
        { idx: 8, name: 'lighting', priority: 'utility', locked: false, cellImageId: '...', versions: [...] },
      ],
    },
  ],

  // Cross-page entity index (for fast lookup by bracket token)
  cellsByName: {
    'Maya':    { pageIdx: 0, slotIdx: 0 },
    'Joe':     { pageIdx: 0, slotIdx: 1 },
    // ...
    'palette': { pageIdx: 0, slotIdx: 7 },
  },

  canvasPosition: { x: COL_BIBLE, y: 0 },       // chrome node placement
};

// Per-slot version history (for undo)
slot.versions = [
  { cellImageId: 'idb_bible_<id>_p0_c0_v1_2k', generatedAt: '...', prompt: '...' },
  { cellImageId: 'idb_bible_<id>_p0_c0_v2_2k', generatedAt: '...', prompt: '...' },
];
// Cap at 2 versions; oldest dropped on next regen.

// Scene-level (createState.scenes[i])
scene.bibleRefIds = ['Maya', 'Kitchen'];        // resolved entity names; populated at gen time
scene.bibleVersionUsed = '<bible.id>@<bible.generatedAt>';  // staleness detection
scene.bibleStale = false;                       // surfaced as a banner in UI

// Template lock
window.createJobState.templateLocked = false;   // becomes true after bible generates
window.createJobState.templateLockedAt = null;
```

**IDB keys** (all bible images):
- `bible_<id>_p<n>_2k` — full grid 2K composite, used for refs
- `bible_<id>_p<n>_4k` — upscaled grid for display
- `bible_<id>_p<n>_c<m>_2k` — current cell crop, used as refPart
- `bible_<id>_p<n>_c<m>_v<v>_2k` — prior cell versions for undo (cap 2 per cell)

**Project autosave snapshot** stores only the metadata + IDB keys; image bytes never enter localStorage.

## 6. Architecture overview

```
┌────────────────────────────────────────────────────────────────────────┐
│  CAST LOCK (existing)                                                   │
│  Per-entity: representativeImageDataUrl + appearanceSheet              │
│  Cost: $0.039 × N_entities                                              │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │  cast portraits as refParts ↓
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  TEMPLATE LOCK (existing — extended)                                    │
│  Style + template + image dimensions chosen.                            │
│  Once bible generates, templateLocked = true (irreversible).            │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  STORYBOARD AGENT (existing)                                            │
│  Script → segments → scene prompts with [bracket] tokens                │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  BIBLE GENERATION (NEW — mandatory for film/brand with ≥1 entity)      │
│  • castBuildBibleSpec(): allocate slots for entities + utility cells    │
│  • castBuildBiblePrompts(): per-cell prompts with style anchor          │
│  • generateGridImage(): one 2K grid call, with cast portraits as refs   │
│  • createUpscaleAndCrop(): cells extracted at 2K from original;          │
│    upscale 2× to 4K only for user display                               │
│  • IDB store: 2K composite, 4K display, 9 cell crops at 2K              │
│  • templateLocked = true                                                │
│  Cost: $0.134 (1 page) or $0.268 (2 pages, when entities > 6)           │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  PER-SCENE GENERATION (existing — extended)                             │
│  For each scene's grid batch:                                           │
│  • Parse [bracket] tokens across all 9 cells                            │
│  • refsForBatch() = bible cells for those entities + palette anchor    │
│  • Cap 4 refs total; prioritize per-mode rule                           │
│  • For batches 2+ in Copilot: add downsampled batch-1 cell as 4th ref  │
│  • Pass refParts to generateGridImage()                                 │
│  Cost per batch: today's $0.134 grid call (no extra cost)               │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  REGEN PATHS                                                            │
│  • Single bible cell (with bible-as-ref): $0.039                        │
│  • Whole bible (template change, user request): $0.134/page             │
│  • Single scene (with bible refs + neighbor): $0.039                    │
│  • Batch of scenes (user nuclear option): $0.134                        │
│  • Add character (spare slot or overflow): $0.039 or $0.134             │
└────────────────────────────────────────────────────────────────────────┘
```

## 7. Cell layout rules per mode

The bible's 9 slots are allocated by `castBuildBibleSpec(jobState)` based on locked entities. The function returns a layout array of length 9 (one slot per cell).

### 7.1 Slot priority taxonomy

- `entity` — corresponds to a locked cast member (character, location, product, presenter, setting). Locked, name-keyed.
- `utility` — palette, lighting, hero composition. Locked (palette never auto-replaceable; hero and lighting can be repurposed in overflow).
- `extra` — additional angle of an existing entity (e.g., "extra-Maya" close-up). Repurposable.
- `spare` — empty slot reserved for future entity additions. First to be repurposed.

Repurpose priority order when adding a new entity: `spare` → `extra` → `utility (lighting)` → `utility (hero)` → escalate to second bible page. **`palette` is never auto-replaced** (it's the project's color anchor; replacing it invalidates the whole consistency story).

### 7.2 Layout per (mode, entity-count)

**Film mode** — characters + locations:

| Locked entities | Slot allocation | Spare |
|---|---|---:|
| 1 char | char + hero + palette + lighting + 5 spare | 5 |
| 1 char + 1 loc | char + loc + hero + palette + lighting + 4 spare | 4 |
| 2 char + 1 loc | 2×char + loc + hero + palette + lighting + 3 spare | 3 |
| 2 char + 2 loc | 2×char + 2×loc + hero + palette + lighting + 2 spare | 2 |
| 3 char + 2 loc | 3×char + 2×loc + hero + palette + lighting + 1 spare | 1 |
| 3 char + 3 loc | 3×char + 3×loc + hero + palette + lighting | 0 |
| 4 char + 2 loc | 4×char + 2×loc + hero + palette + lighting | 0 |
| 4 char + 3 loc | overflow → second page | — |
| 5+ chars OR 6+ entities | overflow → second page | — |

When spare slots exist, they're filled at gen time with **extra angles of existing entities** (e.g., character close-up, location alt-angle). These extras are still useful as additional refs, but flagged `priority: 'extra'` so they're first to be repurposed when a new entity is added.

**Brand mode** — product-heavy:

Product always gets 3 cells (front, ¾ angle, detail close-up). Even if user only locks one product entity, the bible spends 3/9 cells on it because product fidelity is the brand IP and worth the redundancy.

| Locked entities | Slot allocation | Spare |
|---|---|---:|
| product only | 3×product (3 angles) + hero + palette + lighting + logo + 2 spare | 2 |
| product + presenter | 3×product + presenter + hero + palette + lighting + logo + 1 spare | 1 |
| product + presenter + setting | 3×product + presenter + setting + hero + palette + lighting + logo | 0 |
| 2 products | overflow → second page (each product gets 3 cells) | — |

**Narration mode**: no bible. Function returns `null`. Skip generation entirely.

### 7.3 Overflow → second bible page

When `castBuildBibleSpec` cannot fit all entities into 9 useful slots (after collapsing utility cells), it returns `{ count: 2, layoutA: [...], layoutB: [...] }`.

Page A holds: top-priority entities + utility cells (palette, lighting, hero are global, on page A only).
Page B holds: overflow entities + extra angles. Palette/lighting/hero NOT duplicated on page B (waste of cells).

`cellsByName` index is built across both pages so per-scene ref selection works the same regardless of which page a cell lives on.

Cost: $0.134 per page. 2 pages = $0.268. Surfaced as confirm: *"This project has 7 entities (4 characters + 2 locations + 1 product). Bible needs 2 pages — total $0.27 for visual bible. Continue?"*

### 7.4 Cell prompt construction

Each of the 9 cells gets its own prompt assembled by `castBuildBiblePrompts(spec)`:

```js
function buildCellPrompt(slot, jobState) {
  const stylePrefix = castStylePrefix();         // existing
  if (slot.priority === 'entity') {
    const entity = lookupEntity(slot.name);
    return `${stylePrefix}. ${slot.name}: ${entity.appearanceSheet}. Canonical full-body framing for character / hero shot for product / wide establishing for location, eye-level, neutral lighting, plain background. Match this entity's locked appearance and style exactly.`;
  }
  if (slot.priority === 'extra') {
    const entity = lookupEntity(slot.baseEntityName);
    return `${stylePrefix}. ${entity.name}: ${entity.appearanceSheet}. Alternate angle: ${slot.angleVariation} (e.g., close-up, ¾ profile, action pose).`;
  }
  if (slot.name === 'hero')     return `${stylePrefix}. Cinematic hero composition representative of this project's tone and visual style. Wide establishing-shot framing, evocative lighting.`;
  if (slot.name === 'palette')  return `${stylePrefix}. Color palette and grade reference: dominant colors, secondary palette, gradient transitions. No subject — pure color-relationship study.`;
  if (slot.name === 'lighting') return `${stylePrefix}. Lighting reference: example of the canonical lighting setup for this project (key, fill, back, ambient). Subject can be a generic figure or environment.`;
  if (slot.name === 'logo')     return `${stylePrefix}. Brand logo presentation in the chosen style: clean, centered, on neutral background.`;
  if (slot.name === 'spare')    return `${stylePrefix}. Mood card: capture the project's emotional tone in a single evocative composition.`;
}
```

Bible call assembles 9 cell prompts → passes to `generateGridImage` along with cast portraits as `refParts`.

## 8. Bible lifecycle

### 8.1 Generation triggers

**Mandatory at storyboard finalize** for any project where:

```js
function bibleApplies() {
  const t = window.createJobState?.videoType;
  if (t !== 'film' && t !== 'brand') return false;       // narration excluded
  const hasEntities =
    (window.createJobState.characters || []).some(c => c.locked) ||
    (window.createJobState.locations || []).some(l => l.locked) ||
    !!(window.createJobState.product?.locked) ||
    !!(window.createJobState.presenter?.locked) ||
    !!(window.createJobState.setting?.locked);
  return hasEntities;
}
```

Storyboard finalize gate:

```
1. User clicks "Finalize storyboard"
2. Check bibleApplies()
3. If yes:
   a. Compute bible spec → check pages count
   b. Show modal: "Bible required: 1 page (X entities). Cost $0.13. Continue?"
   c. On confirm: generate bible (blocking, 30-60s with progress bar)
   d. On success: templateLocked = true; show bible chrome node on canvas
   e. On failure: surface error, allow retry; do NOT proceed to scene gen
4. If no (narration / no entities): proceed to scene gen directly
```

No "skip" option for applicable cases. Bible is mandatory.

### 8.2 Template lock (post-bible)

Once bible generates successfully, `templateLocked = true`. Effects:

- `applyTemplate()` and template-pick UI surface a confirm: *"Changing the template requires regenerating the visual bible ($0.13). Are you sure?"*
- On confirm: discard old bible (mark `status='stale'`), regenerate fresh in new template, mark all generated scenes as stale.
- Style preset edits within the same template (e.g., color tweaks to the prefix string) trigger the same path.

The template lock is the project's commitment to a visual style. Stori warns hard before unmaking it.

### 8.3 Staleness detection (Option C — surgical)

Bible mark-stale triggers:

| Trigger | What becomes stale |
|---|---|
| Template change (confirmed) | Whole bible + all generated scenes |
| Cast entity unlock | That cell + scenes featuring that entity (by bracket token) |
| Cast appearance edit (description change on locked entity) | That cell + scenes featuring that entity |
| Style prefix edit | Whole bible (palette/lighting may shift) |
| Bible cell single-regen | Only scenes featuring the regen'd entity |
| Bible whole regen | All scenes |
| Cast entity removed | Cell becomes orphan (kept in bible for re-add); existing scenes referencing it use NULL ref + bracket name only |

Staleness is surfaced per-scene as a banner and a regen button. Never auto-mass-regenerated. User chooses what to spend.

`scene.bibleStale` flag drives the UI. `scene.bibleVersionUsed` records which bible version generated this scene; staleness check compares that against current `bible.generatedAt`.

### 8.4 Cell-level regen (with bible-as-ref)

Cheapest, most common regen path. Used when:
- User dislikes one bible cell's render
- User edits one entity's appearance sheet
- User adds new character (regen one slot)

Implementation:

```js
async function regenBibleCell(pageIdx, slotIdx, opts) {
  const bible = window.createJobState.bible;
  const page = bible.pages[pageIdx];
  const slot = page.slots[slotIdx];
  const newPrompt = buildCellPrompt(slot, window.createJobState);

  // Save current as version-history before overwriting
  pushVersionHistory(slot, page.gridImageId);   // cap 2 versions

  // Use the existing bible as ref for style coherence
  const bibleRefBytes = await idbGet(page.gridImageId);   // 2K composite
  const refParts = [
    { inlineData: { mimeType: 'image/png', data: bibleRefBytes } },
    { text: `Reference: existing project bible. Match style, palette, lighting, rendering quality. Generate ONLY a single replacement cell for [${slot.name}]; do NOT replicate the grid layout.` }
  ];

  const newCellUrl = await generateImageGeminiFlash(newPrompt, key, {
    width: 768, height: 768,                   // single cell at typical bible cell resolution
    refParts,
  });

  await idbPut(slot.cellImageId + '_v_new', newCellUrl);
  slot.cellImageId = slot.cellImageId + '_v_new';
  // Composite the new cell back into the bible 2K image at slot's pixel rect
  // so subsequent uses of the full bible as ref reflect the new cell
  const newGridUrl = await compositeCellIntoGrid(page.gridImageId, slot.idx, newCellUrl);
  await idbPut(page.gridImageId, newGridUrl);

  // Mark scenes featuring this entity as stale (Option C)
  markScenesStaleByEntity(slot.name);

  trackCost('bibleCellRegen', 1);     // ~$0.039
  if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
}
```

The cell regen also rewrites the full grid image (composite operation) so the bible-as-ref still represents the current state for any *future* regens.

### 8.5 Whole-bible regen

Triggered by:
- Template change (confirmed)
- User explicitly requests "Regen entire bible" (button in chrome node)
- Style preset change

Implementation: re-run `generateBible()` from scratch, with current cast + spec. Old bible images deleted from IDB after new one succeeds. Old version-history per slot cleared. `templateId` updated. All scenes marked `bibleStale = true`.

Cost: $0.134 per page. Confirm dialog with itemized cost.

### 8.6 Cell version history + undo

Each cell keeps the previous version (cap 2 entries: current + previous).

```js
slot.versions = [
  { cellImageId: 'idb_..._v1', generatedAt: 'T1', prompt: '...' },  // previous
  { cellImageId: 'idb_..._v2', generatedAt: 'T2', prompt: '...' },  // current
];
```

UI on bible cell hover: `[↻ Regen] [↶ Revert]`. Revert swaps `slot.cellImageId` back to v1 and re-composites the full grid image. Free operation. Next regen drops the now-orphaned version.

### 8.7 Adding a character to bible

Path A — spare slot exists:

```
1. User locks new character via cast UI (existing flow, $0.039 individual portrait)
2. Storyboard or canvas detects new locked entity
3. Auto-finds spare/extra slot in bible
4. Single-cell regen with bible-as-ref ($0.039)
5. Bible's cellsByName index updated
6. Scenes (existing + new) using [NewChar] bracket get the new cell as ref
7. UI surfaces: "Added [NewChar] to bible · $0.04"
```

Path B — overflow (no slot):

```
1. User locks new character; no spare or extra slot available
2. Modal: "Bible is full. Choose:"
   - Replace lowest-priority cell (lighting → NewChar) — $0.04
   - Add second bible page — $0.13
   - Cancel
3. On choice: execute path
```

If user picks "Add second page," `bible.pages[1]` is generated with the new character + remaining cells repurposed (additional entity angles, additional palette study). Page 2 does NOT duplicate hero/lighting (they're page-1-global).

## 9. Per-scene reference binding

### 9.1 Bracket token resolution

For each scene's prompt:

```js
function buildSceneRefParts(scene, batch) {
  const tokens = castParseBracketTokens(scene.prompt).tokens;  // existing
  const bible = window.createJobState.bible;
  const refs = [];

  // Per-scene entity refs
  for (const t of tokens) {
    const ref = bible.cellsByName[t];
    if (!ref) continue;
    const cellUrl = await idbGet(bible.pages[ref.pageIdx].slots[ref.slotIdx].cellImageId);
    refs.push({
      inlineData: { mimeType: 'image/png', data: extractBase64(cellUrl) },
      text: `Reference [${t}]: match this entity's appearance, build, style exactly when [${t}] appears in any cell.`,
    });
  }

  // Always include palette anchor as bottom-priority ref
  if (bible.cellsByName.palette) {
    const palRef = bible.cellsByName.palette;
    const palUrl = await idbGet(bible.pages[palRef.pageIdx].slots[palRef.slotIdx].cellImageId);
    refs.push({
      inlineData: { mimeType: 'image/png', data: extractBase64(palUrl) },
      text: 'Reference: project color palette and grade. Match these colors and tonal relationships.',
    });
  }

  // Cap 4 refs (Gemini practical limit)
  return refs.slice(0, 4);
}
```

For grid batches (9 scenes), refs are the union of bracket tokens across all 9 cells, deduplicated. Same cap.

### 9.2 Prioritization when capped

When the natural ref list exceeds 4 entries:

**Film mode order** (most-important first, drop from bottom):
1. Characters appearing in this scene
2. Locations appearing in this scene
3. Palette anchor
4. Lighting anchor (if room)
5. Hero composition (if room)

If 5 entities mentioned in one scene's brackets, drop the lowest-narrative-weight character (least frequent across whole script). Bracket name still tells the model who's there; missing ref only weakens visual anchoring on rare appearances.

**Brand mode order**:
1. Product (always; it's the brand IP)
2. Other product cells (3 cells exist; rotate which serves as primary based on scene's framing cue)
3. Presenter (if in scene)
4. Setting (if in scene)
5. Palette

Product always wins ties. If presenter and setting both appear and product exhausts 3 slots, drop setting (least brand-critical).

### 9.3 First-batch-as-style-anchor (Copilot batches 2+)

For multi-batch projects, after batch 1 completes:

```js
// Stash batch 1's full grid image (downsampled to 1024 to keep payload reasonable)
const batch1AnchorParts = await downsampleAndPack(batch1GridUrl, 1024);
// For batches 2+, prepend this as ref slot 0 (always present)
// Then add per-batch entity refs from bible
// Cap remains 4 total
```

This is layered on top of bible refs. Order in batches 2+:

1. Batch-1 anchor (style/grade propagation across batches)
2. Bible cells for entities in this batch
3. Palette anchor

Batch-1 anchor consumes one of the 4 slots, so per-batch entity capacity is 3 in batches 2+ vs 3-4 in batch 1.

### 9.4 Failure fallback

If a scene gen call with refs fails (model error, ref not interpretable, etc.):

- Retry once with same refs
- If second failure: retry without refs (fall back to today's behavior)
- Surface a hint on the scene card: *"Regenerated without bible refs — quality may differ"*
- Track in telemetry: `bibleRefFailureRate`

Never silently fall back to bible-less generation. User must see when bible coverage is lost on a scene.

## 10. Regen UX

Three regen layers, each with per-unit and batch options:

```
BIBLE CHROME NODE (canvas)
  Per-cell:        [↻ Regen Maya cell]      ($0.04)  → on hover of each cell
  Per-cell undo:   [↶ Revert Maya cell]     (free)   → if version history exists
  Whole bible:     [↻ Regen entire bible]   ($0.13)  → confirm prompt
  Add character:   [+ Add to bible]         ($0.04 or $0.13) → modal flow

SCENE GRID (Step 7 / canvas video column)
  Per-scene:       [🔄 Regen]                ($0.04)  → with bible refs + neighbor; default
  Whole batch:     [↻ Regen this batch]     ($0.13)  → confirm prompt; nuclear option

EXISTING REGEN ENTRY POINTS (preserved)
  - Single-scene regen via canvas SB right-pane (existing)
  - Variant regen via canvas image variant tray (existing)
  Both extended to use bible refs automatically.
```

Cost label on every regen button. Confirm dialog for any action ≥ $0.10. Auto-mark stale visible as a yellow banner per scene with bracketed entities affected.

## 11. UI changes

### 11.1 Cast / refs panel (preexisting, minor extension)

Add bible status indicator:

```
🎬 Visual bible: not yet generated
[ Generate at storyboard finalize ]
```

After generation:

```
🎬 Visual bible: ready (1 page · 7 / 9 cells used)
[View bible]  [Regen entire bible $0.13]
```

### 11.2 Storyboard finalize step

New blocking modal when `bibleApplies()`:

```
┌─ Visual bible required ──────────────────────────────────────┐
│ This project has 3 characters + 2 locations.                 │
│ Generating a 1-page bible to lock visual consistency.        │
│                                                                │
│ Cost: $0.13                                                   │
│ Time: ~30-60 seconds                                          │
│ Once generated, your template will be locked.                │
│                                                                │
│ [Cancel]                              [Generate bible $0.13]  │
└──────────────────────────────────────────────────────────────┘
```

For 2-page bibles, the cost shows $0.27 with note: "7 entities require 2 bible pages."

During generation: progress bar, agent task line *"Composing visual bible…"*. Cannot proceed to scene gen until bible succeeds.

### 11.3 Canvas chrome node — Bible

Free-floating, position `COL_BIBLE = -800` (left of bands, sibling to Narrator Setup chrome node). Width ~360, height ~440 (large enough to show all 9 cells as a thumbnail grid).

```
┌─ 📖 Visual bible (1 page · 7/9) ────┐
│  ┌──────┬──────┬──────┐              │
│  │ Maya │ Joe  │ Sara │              │
│  ├──────┼──────┼──────┤              │
│  │Kitch │ Park │ hero │              │
│  ├──────┼──────┼──────┤              │
│  │palet │light │spare │              │
│  └──────┴──────┴──────┘              │
│                                       │
│  🔒 Locked to template: cinematic    │
│  Cells: 7 entities + 2 utility       │
│  [View full]  [↻ Regen all $0.13]    │
└──────────────────────────────────────┘
```

Click any cell → modal with full-size view + per-cell `[↻ Regen $0.04]` + `[↶ Revert]` (if history).

### 11.4 Step 7 dual-pane scene cells (preexisting from talking-head plan)

Stale banner appears on any scene with `bibleStale = true`:

```
┌─ Scene 4 · 0:08 ─── ⚠ Affected by bible regen ─────────────┐
│ ...                                                          │
│ [🔄 Regen this scene with new bible $0.04]                   │
└──────────────────────────────────────────────────────────────┘
```

Banner click triggers per-scene regen with current bible refs.

### 11.5 Template picker (preexisting, extended)

When `templateLocked = true`, template picker becomes a confirmation flow:

```
[ Change template ▾ ]
  → Click another template
  → Modal: "Change template from cinematic to watercolor?
            This regenerates the visual bible ($0.13) and marks
            all 30 scenes as stale (regen costs vary)."
            [Cancel] [Confirm change]
```

### 11.6 Autopilot bible (NEW)

Autopilot today doesn't surface a canvas. Bible is generated silently at storyboard finalize and represented as a small ref-status indicator in the autopilot progress UI:

```
✓ Visual bible · 5 entities locked (auto-generated)
```

User can click for full view (modal). Same bible mechanics, different surface presentation. Per-cell regen available via the bible modal.

## 12. Cost surface

| Operation | Cost | When |
|---|---:|---|
| Cast lock per entity | $0.039 | Existing, unchanged |
| Bible 1 page | $0.134 | Mandatory at storyboard finalize for film/brand with entities |
| Bible 2 pages | $0.268 | Mandatory when entities > 6 |
| Single bible cell regen | $0.039 | User clicks regen on one cell |
| Whole bible regen | $0.134 / page | Template change, user request |
| Add character (spare slot) | $0.039 | New entity into existing bible |
| Add character (overflow → 2nd page) | $0.134 | Bible full, user picks 2nd page |
| Single scene regen with refs | $0.039 | Default per-scene regen path |
| Whole-batch regen | $0.134 | User opt-in |
| Cell revert | $0 | Has version history |

**Total cost projections per project:**

| Project | Today | With bible (no regens) | With bible + 5 regens |
|---|---:|---:|---:|
| 9-scene film (3 chars + 1 loc) | $0.13 + $0.16 cast | $0.27 + $0.16 cast = $0.43 | $0.62 |
| 30-scene film (3 chars + 2 locs) | $0.52 + $0.20 cast | $0.65 + $0.20 cast = $0.85 | $1.04 |
| 60-scene film (4 chars + 3 locs) | $0.94 + $0.27 cast | $1.21 + $0.27 cast = $1.48 (1 page) | $1.67 |
| 60-scene film (5 chars + 3 locs) | $0.94 + $0.31 cast | $1.34 + $0.31 cast = $1.65 (2 pages) | $1.84 |
| 30-scene brand (product + presenter + setting) | $0.52 + $0.12 cast | $0.65 + $0.12 cast = $0.77 | $0.96 |
| 180-scene serial film (4 chars + 3 locs) | $2.68 + $0.27 cast | $2.81 + $0.27 cast = $3.08 (1 page) | $3.27 |
| 360-scene serial film | $5.36 + $0.27 cast | $5.49 + $0.27 cast = $5.76 (1 page) | $5.95 |

Bible is **5–10% of total project cost**, fixed regardless of length. The longer the project, the smaller the proportional spend on the consistency layer.

## 13. Implementation order

12 phases. Each phase is commit-sized and ships independently. Phases 1–6 deliver MVP bible. Phases 7–12 are refinements / regen UX.

| Phase | What | Files | Risk |
|---|---|---|---|
| **1. Data model + bible spec builder** | `castBuildBibleSpec()`, `bible.pages[]`, `bible.slots[]`, IDB keys, autosave/restore | js/17b, js/17c, js/27 | low |
| **2. Bible prompt composer** | `castBuildBiblePrompts(spec)` per cell | js/17b | low |
| **3. Bible generation pipeline** | `generateBible()`, `generateGridImage` extension to accept refParts, IDB store, cell crop, 2× upscale for display | js/17a, js/17c | medium |
| **4. Storyboard finalize gate** | Mandatory bible modal, blocking generation, agent task progress, error handling, retry | js/17c | medium |
| **5. Bible chrome node on canvas** | New chrome node, position, render, cell view, cast portraits as feed-in | js/29, css/canvas-graph | low |
| **6. Per-scene ref binding** | `buildSceneRefParts()`, integration with `generateGridImage` and `generateSceneImage` (single), prioritization, caps | js/17c | medium |
| **7. Cell-level regen** | `regenBibleCell()`, version history (cap 2), composite-back-to-grid | js/17c, js/17b | medium |
| **8. Cell-revert + per-cell UI** | Revert button, version-history reads, hover-action menu on bible chrome node | js/29 | low |
| **9. Whole-bible regen** | Template-lock confirm, mass-stale propagation, bible re-gen, scene staleness banners | js/17b, js/17c, js/29 | medium |
| **10. Add character flow** | Spare-slot allocator, overflow modal, second-page generation | js/17b, js/17c | medium |
| **11. First-batch anchor for batches 2+** | Stash + downsample batch-1 grid; thread as 4th ref into batches 2+ | js/17c | low |
| **12. Autopilot bible surface** | Inline status indicator, modal viewer, cell regen access from autopilot UI | js/20-reels-creator.js (or autopilot equivalent) | low |

Total: ~1500–1800 lines of code across ~10 files. ~3 days of implementation if uninterrupted.

## 14. Edge cases register

Comprehensive list with default behavior. Each edge case has a unique ID for cross-referencing in tests.

| ID | Edge case | Behavior |
|---|---|---|
| EC-01 | User reaches storyboard finalize with no cast locked (videoType=film) | Block: surface "Lock at least 1 character before generating bible." Cannot proceed. |
| EC-02 | User reaches storyboard finalize with videoType=narration | bibleApplies() returns false; proceed to scene gen with no bible (today's flow). |
| EC-03 | Bible generation fails (all 3 fallback models error) | Surface error, retry button, do NOT proceed to scene gen. Cannot ship without bible if applies. |
| EC-04 | Bible generates but cell crop fails | Treat whole bible as failed; user retries. |
| EC-05 | User changes template after bible exists | Confirm dialog → discard old bible, regen, mark all scenes stale. Template not changeable without confirm. |
| EC-06 | User changes style prefix (within same template) | Same as EC-05 (style fingerprint changes). |
| EC-07 | User unlocks one entity mid-project | That bible cell becomes orphan (kept in bible). Scenes featuring that entity (by bracket token) marked `bibleStale=true`. |
| EC-08 | User edits one entity's appearance sheet | Bible cell for that entity marked stale; surface "Regen Maya's cell + 5 affected scenes ($0.04 + $0.20)?" |
| EC-09 | User deletes a locked entity | Cell becomes orphan; existing scenes referencing the entity by bracket name lose their ref but keep the bracket token. Surface a warning: "Some scenes reference [DeletedChar] but no bible cell exists." |
| EC-10 | User adds character; spare slot available | Auto-find spare; single-cell regen; bible.cellsByName updated. |
| EC-11 | User adds character; no spare; user picks "repurpose lighting cell" | Lighting cell replaced with new char; lighting refs no longer available for scene gen but palette/hero remain. |
| EC-12 | User adds character; no spare; user picks "add 2nd bible page" | Second page generated with new char + 8 fresh slots (additional angles or spares). |
| EC-13 | User adds character; bible has 18 cells already (2 pages full) | Modal: "Bible is at maximum capacity. Remove an existing entity or contact support." (very rare; >12 entities is unusual.) |
| EC-14 | Scene with 6 bracket tokens; 4 ref cap exceeded | Drop refs in priority order (film/brand mode rules). Bracket names still in prompt; ref weight reduced for dropped entities. |
| EC-15 | Brand scene with [Product] only; no presenter/setting | Refs: 3 product cells (top priority is the most relevant angle for this scene's framing) + palette. 4 refs total. |
| EC-16 | Brand scene with [Product] + [Presenter] + [Setting] | Refs: 1 product cell (most relevant) + presenter + setting + palette. 4 refs. (Don't pass all 3 product cells when other entities exist.) |
| EC-17 | Single-scene regen — neighbor scene image not yet rendered | Skip neighbor ref; use only bible cells. |
| EC-18 | Whole-batch regen mid-pipeline (some scenes pending) | User must confirm; pending scenes' status reset to pending; nothing mid-flight is killed. |
| EC-19 | Bible image > 5 MB (rare on 4K) | Stored only in IDB; never enters localStorage. Project autosave never serializes bible bytes. |
| EC-20 | IDB unavailable (browser restriction, private mode) | Fall back to localStorage with warning: "Cast and bible images may be lost between sessions in this browser mode." (existing fallback pattern from cast.) |
| EC-21 | Scene regen during bible regen (race condition) | Bible regen acquires lock; scene regen calls during bible-regen wait until bible-regen completes; surface a status hint. |
| EC-22 | Two parallel bible regens (user double-clicks) | First call wins; second is dropped with status "Bible regen already in progress." |
| EC-23 | User deletes the project mid-bible-gen | All bible IDB keys cleaned up; orphan check runs at app boot. |
| EC-24 | Network failure mid-bible-upload (cast portraits as refs) | Retry once with backoff; if still fails, surface error. |
| EC-25 | Cell version history full (cap 2) and user regens | Oldest version (v1) IDB entry deleted; current becomes v1; new becomes v2 (current). |
| EC-26 | Cell revert with no history (e.g., never regen'd) | Revert button hidden. |
| EC-27 | User reverts then regens immediately | Reverted version becomes current; the previous "current" is lost (was already overwritten by the revert). Single-step undo only. |
| EC-28 | Bible exists, user edits scene prompt to add new bracket token for character not in bible | Scene gen will skip that ref; bracket name still in prompt. Surface warning at scene-edit time: "[NewChar] not in bible — visual identity may drift. Add to bible?" |
| EC-29 | Cross-project copy / template duplicate | Bible NOT carried over (per-project artifact in v1). New project starts with no bible; cast portraits can be reused via library. |
| EC-30 | Project export bundle | Bible included in export bundle (image bytes + metadata). Re-imports cleanly. |
| EC-31 | User has Gemini key but no quota for $0.13 bible call | Surface clear error: "Bible generation requires Gemini API quota. Check your billing or contact your admin." Do NOT silently fall back. |
| EC-32 | Talking-head narrator setup + bible coexist | Both chrome nodes shown on canvas; narrator setup is independent of bible (separate visual anchor for narrator clips). Narrator's setup composite is NOT used as a bible cell. |
| EC-33 | Brand mode with no product locked (only presenter or setting) | Bible spec adapts: no product cells; presenter/setting + utility cells fill 9 slots. (Rare; brand mode usually has product.) |
| EC-34 | Film mode with 0 entities locked | bibleApplies() returns false; today's flow runs. (Rare for serious filmmakers; possible for abstract/experimental.) |
| EC-35 | User regenerates bible immediately after cast lock without locking template | Block: "Lock template before generating bible." Bible commits to template style; can't generate without one. |
| EC-36 | Storyboard finalize triggered with stale bible (template was changed mid-storyboard) | Auto-regen bible before scene gen runs; surface "Bible was stale — regenerated to match template." |
| EC-37 | User force-quits during bible gen (browser refresh) | On reload: if bible.status === 'generating', surface "Bible gen was interrupted. Retry?" with current spec. |
| EC-38 | Multiple browser tabs / windows on same project | Last-write-wins on localStorage; IDB keys are project-scoped so no collisions. Recommend single-tab editing in docs. |
| EC-39 | Project with mixed-locked entities (some characters locked, others draft) | Bible only includes locked entities. Draft entities don't get cells. User gets warning if storyboard references draft entities. |
| EC-40 | Autopilot 9-scene project with no entities locked | bibleApplies() returns false; runs today's autopilot flow. |
| EC-41 | Autopilot bible regen mid-project | Same flow as Copilot but UI surfaces in autopilot context (modal, not chrome node). |
| EC-42 | User explicitly disables bible (advanced setting / future toggle) | NOT supported in v1. Bible is mandatory when applicable. (Future v2 may add an "expert mode" toggle.) |
| EC-43 | Stale bible at scene gen time | If bible.status === 'stale' when scene gen runs, block scene gen and prompt to regen bible first. |
| EC-44 | Scene gen call rate-limit hit while passing bible refs | Existing fallback (Pro → 3.1 Flash → 2.5 Flash → individual) applies. Refs threaded through all fallback levels. |
| EC-45 | Bible refs exceed Gemini's max image attachment size | Pre-flight check: each ref ≤ 4MB. If exceeded, downsample to 1024px. Surface warning. |

## 15. Telemetry

Track for every project:

```js
{
  bibleGenerated: true|false,
  biblePages: 1|2,
  bibleEntitiesCount: <int>,
  bibleGenLatencyMs: <int>,
  bibleGenCostUsd: 0.134 | 0.268,
  bibleRegens: <int>,
  bibleCellRegens: { 'Maya': 2, 'Kitchen': 1, ... },
  bibleAddCharCount: <int>,
  templateChangesAfterLock: <int>,
  sceneRegenWithBibleRefs: <int>,
  sceneRegenFailedFallbackToNoRefs: <int>,
  sceneStalePerEntity: { 'Maya': 5, 'Joe': 0, ... },
  bibleRefDropsDueToCap: <int>,
  totalBibleCostUsd: <float>,
}
```

This data goes into the local cost tracker (existing `trackCost`) and also into a future analytics surface for product decisions (which templates work best with bible? which projects regen bibles most? etc.).

## 16. Risks + open questions

### Risks

1. **Bible quality on illustration templates.** Gemini generally renders illustration well, but the bible's 9-cell composite needs careful prompt construction so cells don't blur into each other. Test with watercolor / anime / ukiyo-e templates before launch.

2. **Mandatory bible adds friction for first-time users.** Users with no entities locked won't trigger bible. But users with cast locked face a $0.13 mandatory spend at storyboard finalize. Mitigation: clear copy explaining the value, cost-tracker showing total project cost up front.

3. **Bible regen cascades on appearance edits.** A user editing Maya's description triggers Maya cell regen + N affected scene regens. Total cost could surprise them. Mitigation: show total expected cost in the regen confirm dialog before spending.

4. **First-batch-as-anchor doubles ref-payload growth in long-form.** Batches 2+ carry batch-1 image as ref. For 40-batch projects, every batch from #2 onwards has the batch-1 image attached. Network cost mostly absorbed (each call adds ~500KB). Watch latency.

5. **2K refs per cell increase API call payload.** Each scene's grid call now carries up to 4 × 2K cell refs. Roughly 3-5MB of additional payload per call. Verify Gemini accepts; downsample to 1024 if rejection rates rise.

6. **Mid-project workflow disruption when bible regenerates.** Surgical staleness mitigates but the user still has to click N regen buttons. Explore "Regen all stale scenes ($X total)" bulk action in v1.5.

### Open questions for future versions

1. **Cross-project bible inheritance** — pending Supabase migration. Once project storage moves to cloud, bibles can be saved alongside projects. A "duplicate project with bible" flow becomes the foundation for serialized content. v2.

2. **Bible inheritance to character library** — when a character is added to the cross-project library, do we also save their bible cell? Probably yes — it's the canonical visual representation of that character in a chosen style. Multi-style: per-template variants.

3. **Bible-driven Flux 2 Flash pipeline** — once provider abstraction lands, bible cells become the perfect ref source for Flux per-scene gen. Bible $0.134 + Flux $0.005 × N is the long-form economics that the consistency-plan unlocks.

4. **Bible templates / presets** — a "story bible" template (3 chars + 2 locs + product) vs. "documentary bible" (1 presenter + 5 locations) preset. Helps users not start from scratch.

5. **Bible diffing across regens** — show the user "what changed" when bible regenerates. Would require image comparison, possibly LLM-based summary.

6. **Per-scene bible weight slider** — power user can tune how strongly each scene anchors to bible (vs. creative drift). Currently fixed; future may expose.

## 17. Decision log

| Decision | Choice | Rationale |
|---|---|---|
| Bible mandatory or opt-in for film/brand? | Mandatory | Consistency is the core value proposition; opt-in defeats the point. |
| Generation timing? | At storyboard finalize | Layout adapts to which entities actually appear in script. |
| Template lock after bible? | Yes, hard lock | Bible commits project to its style. Template change must be intentional. |
| Stale propagation? | Surgical (Option C) | Only scenes with affected entities marked; user picks regen budget. |
| Cast portrait + bible? | Both layers | Portraits feed bible; bible feeds scenes. Two anchors, distinct roles. |
| Cell version history depth? | 2 (current + previous) | Bounded storage, single-step undo covers 90% of cases. |
| Trigger UX? | Mandatory modal at finalize | Educates users; cost is upfront. No "auto-generated, charged silently." |
| Second bible threshold? | Entity count > 6 | Bible cells are entity-addressable; entity count drives capacity, not scene count. |
| Bible image resolution? | 2K original (for refs) + 4K upscale (for display) | Matches existing grid pipeline; refs stay 2K to preserve quality without payload bloat. |
| Bible in Autopilot? | Yes (mandatory when applies) | Cross-episode consistency is the moat for serialized short-form. |
| Cross-project bible reuse? | v2, pending Supabase | Local IDB doesn't support cross-project; needs server. |

## 18. Acceptance criteria

The plan is complete when:

- [ ] All 6 cells in the matrix have their generation paths implemented and tested.
- [ ] All 45 edge cases (EC-01 through EC-45) have explicit handlers.
- [ ] Bible regenerates within 60s p95.
- [ ] Per-scene regen with bible refs succeeds at >90% rate (the rest fall back gracefully).
- [ ] Template lock cannot be bypassed without confirm dialog.
- [ ] Surgical staleness correctly identifies affected scenes (verified by entity-token diff).
- [ ] Cost preview matches actual spend within 5%.
- [ ] Cast lock + bible flow is end-to-end testable in <5 minutes for a 3-character + 2-location project.
- [ ] All bible images live in IDB; localStorage stays under 1 MB even for max-size projects.
- [ ] Project export/import round-trip preserves bible.
- [ ] Telemetry captures the 13 fields in §15.

When all acceptance criteria pass, this feature ships and Stori is positioned as a serious filmmaking tool for long-form content with character consistency at production quality.
