# Canvas Talking-Head Plan — Dual-Track A-Roll / B-Roll

Status: design draft, not yet implemented.

## Goal

When narrator is `talking-head`, deliver two parallel video tracks:

- **B-roll** — continuous baseline, every chunk has a clip (existing per-scene flow).
- **Narrator** — sparse overlay, only on chunks AI suggested or user picked. Narrator audio (TTS) is a single continuous track.

Cuts (which lane is on top per chunk) are decided in canvas before generation, persisted on the scene record, editable in the editor with a round-trip back to canvas when a chunk needs a new narrator clip.

Hard constraint: **no inventing new systems**. Every primitive needed already exists in the editor; this plan mirrors them, it does not add an architecture layer.

## Pre-existing primitives we reuse

- **Independent track containers (DOM stack):** `#timeline-container` (photos), `#video-timeline-container` (animated B-roll), `#sub-timeline-container`, `#bgm-section` are sibling blocks today, each with its own playhead line. Adding a narrator container is the same shape.
- **Per-clip runtime array:** `videoTimelineItems[]` in `js/11-export.js` with `{ videoEl, startTime, duration, inPoint }`. We mirror it.
- **Per-tick clip switcher:** `js/11-export.js:167-189` already does "find the clip active at `elapsed` → seek → `drawImage`." We extend the same block.
- **PiP renderer:** `js/11-export.js:195` `renderPiP()` exists — kept available if we ever want narrator as a corner instead of full-frame.
- **Multi-track loop:** `js/11-export.js:253-260` already iterates parallel tracks for "Export All Languages."
- **Audio mix:** `js/11-export.js:99-114` already mixes voice + BGM. Narrator audio is the existing TTS buffer — no new audio source.
- **Canvas node graph:** `videoInstances[]` per scene exists (`js/27-canvas-state.js`). Adding `role: 'broll' | 'narrator'` is one new field.
- **Project-level chrome nodes:** Launch Agent, Final Render already float free of bands. Narrator Setup is the same pattern.

## Data model deltas

All additive; nothing removed.

```js
// Scene-level (createState.scenes[i])
scene.frontRole = 'broll' | 'narrator';     // default 'broll'

// Video instance (scene.videoInstances[i])
videoInstance.role = 'broll' | 'narrator';  // default 'broll'

// Project-level chrome
window.createJobState.narratorSetup = {
  prompt: '',                  // e.g. "behind a wood desk, warm key light"
  imageDataUrl: null,          // composite of narrator portrait + set
  locked: false,
  canvasPosition: { x, y }
};

// Editor runtime
narratorTimelineItems[];        // mirror of videoTimelineItems, sparse
```

`videoTimelineItems[]` keeps its today shape; new array holds narrator clips only. Both items carry a `lane` field for export-tick identification.

`scene.frontRole` is the cut decision and the only source of truth. Bulk presets, AI suggestion, editor flips all write to this field.

Backwards compat: if no `videoInstance.role` exists, treat as `'broll'`. If `frontRole` missing, treat as `'broll'`. Today's projects keep working.

## Canvas (node graph) changes

### 1. New chrome node — Narrator Setup

Free-floating, X around `COL_SB - 600`, sibling to Launch Agent / Final Render. Same DOM shell as those nodes. Edges drawn to each chunk's narrator video instance that exists.

Fields: prompt textarea, locked composite thumbnail, lock state, regen / edit-prompt actions. Generation: Gemini Flash Image with narrator portrait as ref + set prompt → composite. Locks like cast entities lock today.

### 2. Per-band — second video node alongside B-roll

Stack vertically inside `COL_VID`:

- Top slot — B-roll video instance(s). `role: 'broll'`. `sourceImageInstanceId` → that band's image instance. Existing flow.
- Bottom slot — Narrator video instance(s). `role: 'narrator'`. `sourceImageInstanceId` → project Narrator Setup. May be absent (placeholder with "Generate" CTA).

Badges:

- `🎯 ON SCREEN` on whichever role matches `scene.frontRole`.
- `☆ under` on the other (running underneath, hidden in final).

`isRenderActive` semantics scoped per role: radio across that role's variants. B-roll variant always ships. Narrator variant ships only when its instance exists AND `frontRole === 'narrator'`.

### 3. Bulk presets bar above the band stack

Single-row strip writing `scene.frontRole` across all bands:

- None · Open+Close · Open · Close · Middle · All · AI suggested · Custom
- Live cost preview: `N B-roll + M narrator = N+M clips`
- Generate button kicks off the existing per-scene gen, plus narrator gen for selected chunks only.

### 4. Storyboard agent change

One new field per chunk: `suggestNarrator: boolean`. AI flags emphasis chunks (openers, closers, direct address, questions). Becomes the default toggle state; user keeps or flips before Generate.

## Top-down content section (post-canvas Create panel) changes

After Send-to-Timeline, the Create panel runs through five vertically stacked steps. Narrator videos surface in **only one** of them — Step 7. Steps 5, 6, and 8 are untouched.

| Step | DOM | Today | Talking-head change |
|------|-----|-------|---------------------|
| 5 — Scene Images | [`#create-generate-step`](index.html#L2614) → `#create-scene-grid` | One image card per scene | none |
| 6 — BGM agent | [`#create-bgm-step`](index.html#L2636) | Single BGM track + faux waveform + volume | none |
| **7 — Animate Scenes** | [`#create-video-step`](index.html#L2698) → `#create-video-grid` rendered by [`renderCreateVideoCards()`](js/17c-create-pipeline.js#L3220) | One `<video src="scene.videoUrl">` card per scene with ▶ ⏸ ⏹ + seek + Regen | **Each scene card becomes a dual-pane cell (B-roll + Narrator) with a Front toggle on the cell header. Bulk presets bar inserted between the step header and the grid.** |
| 8 — Voiceover & Translation | [`#create-language-step`](index.html#L2714) → `#language-primary` rendered by [`renderPrimaryAudioCard()`](js/17d-create-languages.js#L430) | One primary audio card + alternate language cards. Subtitle dropdown lives **inside** each language card. | Label string only: `🎙️ Narrator (TTS)` when narrator is locked. No new card. |
| 8 — Review & Export | [`#create-send-step`](index.html#L2729) | Save Project + Send to Editor | none |

### Why voiceover and subtitle don't change

Narrator's TTS *is* the primary audio. Talking-head doesn't introduce a second voice — one narrator, one audio source, one set of subtitles. The existing `#language-primary` card already carries it; the `Subtitle Language` dropdown inside that card already covers subtitle generation.

### Step 7 dual-pane scene cell

Each `.scene-card` in `#create-video-grid` splits horizontally when narrator is talking-head:

```
┌─ Scene 4 · 0:06 · AI: narrator · FRONT: ○ B-roll  ◉ Narrator ────────────┐
│ ┌─ B-ROLL (under) ──────────┐   ┌─ NARRATOR (★ on screen) ─────────────┐ │
│ │  [▶ video]                  │   │  [▶ setup composite]                  │ │
│ │  ▶ ⏸ ⏹  [───seek───]       │   │  ▶ ⏸ ⏹  [───seek───]                   │ │
│ │  Scene 4 · 6.4s              │   │  Narrator · 6.4s · emphatic            │ │
│ │  [🔄 Regen]                   │   │  [🔄 Regen tone]                       │ │
│ └─────────────────────────────┘   └───────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

For B-roll-only chunks, the narrator pane is a placeholder with a Generate CTA:

```
┌─ Scene 2 · 0:04.5 · AI: broll · FRONT: ◉ B-roll  ○ Narrator ─────────────┐
│ ┌─ B-ROLL (★ on screen) ────┐   ┌─ NARRATOR (not generated) ──────────┐ │
│ │  [▶ video]                  │   │   AI didn't suggest narrator         │ │
│ │  Scene 2 · 4.5s              │   │   for this chunk                      │ │
│ │  [🔄 Regen]                  │   │   [+ Generate narrator alt]           │ │
│ └─────────────────────────────┘   └───────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

Front toggle on the cell header writes `scene.frontRole` for that chunk. Each pane reuses the existing `<video>` element pattern + `wireCreateVideoCard()` wiring; nothing new in the player code.

Pane choice rationale: dual-pane per cell (rejected: twin grids stacked) because the cut decision is per-scene — toggle belongs *on* the scene cell, not in a global side panel. Visual pairing makes "B-roll runs underneath, narrator on top" obvious without cross-referencing two grids by scene number.

### Bulk presets bar (Step 7 only)

One new strip between the existing `<div class="agent-step-header">` (line 2699) and `#create-video-grid` (line 2707):

```
┌─ Cut plan · 8 scenes · narrator on 2 (AI suggested) ─────────────────┐
│ Bulk: [None] [Open+Close] [Open] [Close] [Middle] [All] [AI ✓]      │
│ Cost: 8 B-roll + 2 narrator = 10 clips           [→ Generate]        │
└──────────────────────────────────────────────────────────────────────┘
```

Writes `scene.frontRole` across all scenes. Cost preview live-updates from current `frontRole` distribution. Generate button runs B-roll for all chunks (existing flow) + narrator only for chunks where `frontRole === 'narrator'`.

### Voice-only / absent narrator

`renderCreateVideoCards()` falls back to today's single-pane card layout. Bulk presets bar hidden. Step 7 looks unchanged. Same fallback principle as the editor view.

## Editor (timeline) changes

### 1. New sibling DOM container — narrator lane

Insert between `#video-drop-zone` and `#sub-drop-zone` in `index.html`. Mirror of the existing video lane:

```html
<div class="section-label mt-md" id="narrator-section-label" style="display:none;">
  Video Timeline · Narrator
  <span class="badge" id="narrator-count">0 clips</span>
  <button id="btn-add-narrator" class="btn-sm">🎙 Add Narrator</button>
</div>
<div id="narrator-drop-zone" class="empty" style="display:none;">
  <div id="narrator-timeline-container">
    <div id="narrator-playhead-line"></div>
  </div>
</div>
```

Hidden by default. Shown only when `narrator.onScreenStyle === 'talking-head'` and at least one narrator instance exists.

Relabel existing `Video Timeline` section to `Video Timeline · B-roll` when narrator lane is active.

### 2. New thin strip — `#cuts-row`

Sibling below `#narrator-drop-zone`. Renders one cell per scene showing N (narrator on top) / B (B-roll on top), with click-to-flip and drag-boundary-to-split affordances.

Width per cell scales by scene duration. Same horizontal scale as the time ruler.

### 3. Per-clip props panel — lane block

Inside existing `#video-props-extra` (`index.html:4227`), add ~30 lines:

```
─── Lane ───
Lane:  ◉ Narrator    ○ B-roll
Front this chunk:
   ◉ Narrator on top
   ○ B-roll on top
[↻ Edit cuts in Canvas →]
```

Writes `scene.frontRole` for the chunk the selected clip belongs to. The "Edit in Canvas" button surfaces only when the user wants narrator-front on a chunk that has no narrator clip yet — round-trips to canvas, opens the band's narrator slot, runs gen, returns.

### 4. Voice-only / absent narrator

`#narrator-section-label`, `#narrator-drop-zone`, `#cuts-row` all `display:none`. Editor reverts to today's stack exactly. Lane block in props panel hidden.

## Export pipeline changes

Single touch in `js/11-export.js:167-189`. Extend the existing block:

```js
if (isAnimatedExport) {
  const brollIdx = videoTimelineItems.findIndex(c =>
    elapsed >= c.startTime && elapsed < c.startTime + c.duration);
  const narrIdx = narratorTimelineItems.findIndex(c =>
    elapsed >= c.startTime && elapsed < c.startTime + c.duration);

  // existing pause/play swap logic — apply to BOTH arrays

  // baseline: always draw B-roll
  if (brollIdx >= 0) drawClip(ctx, videoTimelineItems[brollIdx].videoEl, ew, eh);

  // overlay: draw narrator over only when frontRole says so AND a clip exists
  const sceneId = videoTimelineItems[brollIdx]?.sceneId;
  const scene   = createScenes.find(s => s.id === sceneId);
  if (scene?.frontRole === 'narrator' && narrIdx >= 0) {
    drawClip(ctx, narratorTimelineItems[narrIdx].videoEl, ew, eh);
  }
}
```

`drawClip` factors out the existing draw block (~10 lines from 181-189). Pause/play swap logic at 169-178 cloned for narrator array.

Audio mix unchanged — single TTS source.

PiP renderer unchanged — narrator overlay path is full-frame composite, not PiP. PiP stays available for unrelated user-added overlays.

## Send-to-Timeline payload extension

`window._cgSendToTimeline` (`js/29-canvas-render.js:2916`) walks `scene.videoInstances` and routes by role:

- `role === 'broll'` → push to `videoTimelineItems[]` (today's behavior)
- `role === 'narrator'` → push to `narratorTimelineItems[]`

Both arrays use the same `{ videoEl, startTime, duration, inPoint, sceneId, lane }` shape. `startTime` derived from cumulative chunk audio durations (single audio timeline drives everything).

If `narratorTimelineItems` is empty after routing, lane stays hidden — same code path as voice-only narrator.

## Narrator setup capture step (cast / refs)

When narrator is locked with `onScreenStyle === 'talking-head'`, surface a new in-line setup capture step in the cast panel before any narrator clip can generate:

1. User picks or types a set description. Presets to seed: Studio desk, Kitchen counter, Outdoor park, Abstract gradient backdrop. Free text always allowed.
2. Compose: Gemini Flash Image call with narrator's `representativeImageDataUrl` as a ref + set prompt → produces `narratorSetup.imageDataUrl`.
3. Lock. Until this is locked, narrator video instances cannot generate.

Same lock mechanic as cast entities today (`representativeImageDataUrl` + `appearanceSheet` lock pattern in `js/17b-create-references.js`).

## Generation flow

Triggered by canvas Generate button after selections lock:

1. **B-roll** — generate clip for every chunk via the existing per-scene pipeline. `videoInstance.role = 'broll'`, `sourceImageInstanceId` → that chunk's image. (No change.)
2. **Narrator** — generate clip only for chunks where `scene.frontRole === 'narrator'`. Kling i2v on `narratorSetup.imageDataUrl` as start frame. Prompt = format anchor + per-chunk performance cue. `videoInstance.role = 'narrator'`, `sourceImageInstanceId` → narrator setup id. Low `cfg_scale` to preserve identity.
3. Total clip cost: `N + M` where `M = count(scene.frontRole === 'narrator')`.

Per-chunk performance cue is one extra storyboard-agent field: `{ tone: 'warm'|'serious'|'excited'|'matter-of-fact'|'playful'|'concerned', gesture: 'neutral'|'explanatory'|'emphatic' }`.

Editor-driven regen: flipping a chunk in the editor from B-roll to narrator surfaces "Edit in Canvas" CTA. Round-trip generates the missing narrator clip and returns.

## Round-trip persistence

`scene.frontRole` is the single source of truth. Written by:

- Canvas bulk presets bar
- Canvas per-band Front toggle
- Editor per-clip Lane block

All three paths write the same field; reads everywhere see the same value. Project autosave already persists scene fields — `frontRole` rides for free.

## What's net-new vs. mirrored

**Mirrored (existing patterns reused):**
- Narrator lane DOM block (clone of `#video-drop-zone`)
- `narratorTimelineItems[]` (clone of `videoTimelineItems[]`)
- Narrator video instance flow (clone of B-roll, different ref source)
- Narrator Setup chrome node (clone of Launch Agent / Final Render shell)
- Editor lane swap on tick (extension of existing find-and-draw block)

**Net new:**
- `scene.frontRole` field (1 key, default `'broll'`)
- `videoInstance.role` field (1 key, default `'broll'`)
- `narratorSetup` chrome state (small object)
- `#cuts-row` thin strip (new but tiny — single horizontal flex row)
- "Lane" block in props panel (~30 lines inside existing `#video-props-extra`)
- Storyboard agent fields: `suggestNarrator`, `performance` (~2 keys per chunk)

No new track abstraction, no new playhead, no new audio engine, no new export pipeline, no FFmpeg, no DAW.

## Limits / honest caveats

- **Mid-chunk cut splits** (narrator covers first 2s of chunk 4, B-roll covers last 3s): not in v1. Today's per-tick resolver flips at scene boundaries. Adding mid-chunk splits = `frontRole` becomes `[{startMs, role}]` array + ~5 lines in export tick. Punted.
- **Lip-sync fidelity** — Kling v2.5 doesn't drive lips from audio. Lips are generic; audio overlaid. Acceptable for v1; D-ID/HeyGen swap reserved for v2 behind same `clipUrl` field.
- **Narrator setup regen** invalidates all narrator clips — they reference the old start frame. Surface a confirm prompt; auto-mark all narrator clips as `needsRegen`.
- **Cost ceiling** — `frontRole='narrator'` on every chunk = 2N clips. UI shows live count; user can dial back before Generate.

## Implementation order

1. **Data model + Narrator Setup chrome node + setup image gen.** Extend `videoInstance` with `role`. Add `scene.frontRole`. New chrome node renders, edges drawn (purely visual). Lock mechanic mirrors cast.
2. **Storyboard agent fields.** `suggestNarrator`, `performance` per chunk.
3. **Canvas dual-video stack in `COL_VID`.** Render two video nodes per band. Front toggle on band header writes `scene.frontRole`. Bulk presets bar (canvas variant).
4. **Generation routing.** Existing pipeline generates B-roll for all chunks. New narrator gen path uses setup image as start frame, runs only on `frontRole === 'narrator'` chunks.
5. **Step 7 dual-pane scene cells.** Extend [`renderCreateVideoCards()`](js/17c-create-pipeline.js#L3220) so each card splits when narrator is talking-head. Front toggle, bulk presets bar above grid, B-roll-only fallback for non-talking-head projects.
6. **Step 8 voiceover label string.** Switch `#language-primary` label to `🎙️ Narrator (TTS)` when narrator locked. No structural change.
7. **`_cgSendToTimeline` payload split.** Walk `videoInstances`, route to `videoTimelineItems[]` or `narratorTimelineItems[]` by role.
8. **Editor narrator lane DOM + cuts row.** Hidden by default; shown when narrator instances present.
9. **Export tick extension.** Find and overlay narrator clip per `frontRole`.
10. **Editor props panel — Lane block.** Round-trip CTA back to canvas.

Each step ships independently; nothing breaks existing projects (all defaults route to B-roll-only behavior).
