# Cast Gap Fixes — Implementation Plan

> Scope: all cast/character/storage gaps from the implementation review, plus
> ADRs and schema migration docs. Movie mode (`#11`) explicitly out of scope —
> see `canvas-movie-mode-plan.md`.

---

## 1. Scope

| # | Gap | Risk | LOC | Order |
|---|---|---|---|---|
| G1 | Project restore from autosave | low | ~80 | 2 |
| G2 | `autoSaveCreateState` schema completeness | low | ~30 | (with G1) |
| G3 | IndexedDB image storage | medium | ~140 | 8 |
| G4 | Brand product hero-shot prompt | low | ~15 | 3 |
| G5 | Brand-mode name-collision check | low | ~15 | 6 |
| G6 | Decouple legacy `regenSceneImageAndVideo` | very low | ~5 | 1 |
| G7 | Detect-from-script preserves dismissals | low | ~30 | 7 |
| G8 | AI rewrite throttle (per-scene + global cap) | low | ~30 | 5 |
| D1 | ADR-cluster-as-data-primitive | docs | ~80 | 9 |
| D2 | ADR-runtime-axis-layout | docs | ~80 | 9 |
| D3 | ADR-virtual-stitch | docs | ~60 | 9 |
| D4 | ADR-editor-roundtrip-contract | docs | ~70 | 9 |
| D5 | Schema migration plan | docs | ~120 | 10 |

**Total code**: ~345 lines. **Total docs**: ~410 lines. Each fix independent.

> #2 (AI rewrite undo) is obsolete — replaced by the manual AI rewrite flow
> per the "undo is not required" decision.

---

## 2. Files Touched

| File | G1 | G2 | G3 | G4 | G5 | G6 | G7 | G8 |
|---|---|---|---|---|---|---|---|---|
| `js/17c-create-pipeline.js` | ✓ | ✓ | ✓ | | | ✓ | | |
| `js/17b-create-references.js` | ✓ | | ✓ | | ✓ | | ✓ | ✓ |
| `js/17a-create-api.js` | | | | ✓ | | | | |
| `css/styles.css` | | | | | | | ✓ | |
| `devDoc/ADR-*.md` (D1-D4) | | | | | | | | |
| `devDoc/movie-mode-migration.md` (D5) | | | | | | | | |

---

## 3. Sequencing & Detailed Plan

### Step 1 — G6: Decouple legacy `regenSceneImageAndVideo` (5 min)

**Problem**: [js/17c-create-pipeline.js:3093-3100](js/17c-create-pipeline.js#L3093) auto-fires
`animateScenes` after image regen in the legacy video grid. Contradicts the
canvas decoupling work.

**Fix**: delete the auto-trigger block; replace with comment explaining canvas is
the new path.

**Smoke test G6-1**:
1. Animated mode, scenes have images + videos
2. Click 🔄 Regen on a scene card in `create-video-step`
3. Image regenerates ✓
4. Video does NOT regenerate ✓

---

### Step 2 — G1+G2: Cast restore from autosave (1 hr)

**Problem**: `restoreAutoSaveIfAvailable` is dead code. Save side missing
`videoType`, `videoTypeLocked`, `product`, `presenter`, `setting`, `styleLocked`.

**Fix part A** — extend `autoSaveCreateState` to write all `createJobState`
fields (text-only — images come from G3 via IDB later, or stay in localStorage
until G3 ships).

**Fix part B** — add `_castRestoreFromAutosave()` in cast IIFE init:

```js
function _castRestoreFromAutosave() {
  const state = (typeof restoreAutoSaveIfAvailable === 'function') ? restoreAutoSaveIfAvailable() : null;
  if (!state) return;
  if (state.videoType) {
    window.createJobState.videoType = state.videoType;
    window.createJobState.videoTypeLocked = !!state.videoTypeLocked;
  }
  window.createJobState.styleLocked = !!state.styleLocked;
  if (Array.isArray(state.castCharacters)) window.createJobState.characters = state.castCharacters.map(_rehydrate);
  if (Array.isArray(state.castLocations))  window.createJobState.locations  = state.castLocations.map(_rehydrate);
  if (state.product)   window.createJobState.product   = _rehydrate(state.product);
  if (state.presenter) window.createJobState.presenter = _rehydrate(state.presenter);
  if (state.setting)   window.createJobState.setting   = _rehydrate(state.setting);
  if (typeof window._castSyncToLegacy === 'function') window._castSyncToLegacy();
  if (typeof window.applyVideoTypeVisibility === 'function') window.applyVideoTypeVisibility();
  if (typeof window.castRenderRows === 'function') window.castRenderRows();
  if (typeof window.brandRenderSlots === 'function') window.brandRenderSlots();
  if (typeof window.renderRefsPanel === 'function') window.renderRefsPanel('timeline');
}
```

Wire to `_initStatic` (cast IIFE) — fires once on DOM ready.

**Smoke tests G1-1, G1-2, G1-3**:
- Lock 2 chars + 1 loc → reload → all back, locked
- Brand: lock product + presenter → reload → both back
- Manually expire timestamp → reload → clean slate (existing 24h TTL)

---

### Step 3 — G4: Brand product hero-shot prompt (5 min)

**Problem**: products use character framing in image prompt
(`generateRepresentativeImage(item, 'character', ...)` in `_brandGenerateOne`).

**Fix part A** — `js/17a-create-api.js`:

```js
// generateRepresentativeImage: add product branch
const subject = (kind === 'product')
  ? 'Hero product shot, centered on a clean neutral background, soft three-point studio lighting, eye-level. No people in frame.'
  : (kind === 'character')
    ? 'Full-body character portrait, subject centered, plain neutral background, eye-level shot, full body visible.'
    : 'Establishing shot of the location, no people, neutral overcast lighting if outdoors, eye-level angle.';

// generateAppearanceSheet: add product branch — focuses on form factor / brand presentation
```

**Fix part B** — `js/17b-create-references.js _brandGenerateOne` and `_brandRegenImage`: drop the
`kind === 'product' ? 'character' : kind` mappings.

**Smoke test G4-1**: brand mode, generate product → image is hero shot, not portrait.

---

### Step 4 — G8: AI rewrite throttle (15 min)

**Problem**: chip add/remove fires Gemini per click. Manual flow already has
per-scene `_aiBusy` guard, but no global cap. User clicking AI update on 5
scenes simultaneously fires 5 concurrent Gemini calls.

**Fix**: add global concurrency cap (max 2 parallel) in 17b:

```js
const AI_REWRITE_MAX_CONCURRENT = 2;
let _aiInflightCount = 0;
const _aiQueue = [];

async function _aiAcquireSlot() {
  return new Promise((resolve) => {
    if (_aiInflightCount < AI_REWRITE_MAX_CONCURRENT) {
      _aiInflightCount++;
      resolve();
    } else {
      _aiQueue.push(resolve);
    }
  });
}
function _aiReleaseSlot() {
  _aiInflightCount--;
  const next = _aiQueue.shift();
  if (next) { _aiInflightCount++; next(); }
}

// Wrap in chip-ai-update handler:
await _aiAcquireSlot();
try { /* AI call */ } finally { _aiReleaseSlot(); }
```

**Smoke test G8-1**: trigger AI update on 5 scenes simultaneously → only 2
spinners active at a time → others queue → all resolve in order.

---

### Step 5 — G5: Brand-mode name-collision (10 min)

**Problem**: `_lockItem` checks collisions; `_brandLock` doesn't.

**Fix**: extract shared helper:

```js
window._castNameCollision = function(name, excludeId) {
  if (!name) return false;
  const lc = name.trim().toLowerCase();
  const all = [
    ...(createJobState.characters || []),
    ...(createJobState.locations || []),
    createJobState.product, createJobState.presenter, createJobState.setting,
  ].filter(Boolean);
  return all.some(x => x.id !== excludeId && x.locked
    && (x.name || '').trim().toLowerCase() === lc);
};
```

Call from both `_lockItem` and `_brandLock` before locking.

**Smoke test G5-1**: brand product "Joe" + presenter "Joe" → second lock blocked.

---

### Step 6 — G7: Detect-from-script preserves dismissals (30 min)

**Problem**: re-detect replaces all unlocked rows; dismissals not persisted.

**Fix**:

1. Schema: `createJobState.dismissedDetections = [{ name, kind }]`
2. Persist via autosave (fold into G2)
3. Detect handler filters out dismissed names before adding rows
4. `✕ Not a character` button on detected rows (where `item._detected = true`) adds to dismissals
5. On lock, clear matching dismissal (so future detects could re-suggest)

**Smoke tests G7-1, G7-2**: dismiss → re-detect skips; lock with same name → dismissal cleared.

---

### Step 7 — G3: IndexedDB image storage (2 hrs)

**Problem**: ~6 entities × ~300KB images + library = localStorage 5MB risk.

**Fix**: move all images to IndexedDB, keep text-only metadata in localStorage.

**Module**: `js/17b-create-references.js` (new IIFE or extend existing):

```js
const IDB_DB = 'stori_cast_images_v1';
const IDB_STORE = 'images';
async function _idbOpen() { /* open with onupgradeneeded creating store */ }
async function _idbPut(key, dataUrl) { /* */ }
async function _idbGet(key) { /* */ }
async function _idbDelete(key) { /* */ }
```

**Save side**:
- Strip image fields from saved state before serialize
- Fire `_idbPut('rep_'+id, dataUrl)` for each item, fire-and-forget

**Restore side** (extends G1):
- After `_castRestoreFromAutosave`, hydrate images via `_idbGet('rep_'+id)` per item
- UI shows placeholder during async load; updates as IDB resolves

**Library**:
- `_libSave`: strip images, write to IDB key `lib_<libraryId>_rep`
- Library picker grid: lazy-load thumbnails per card via IDB

**Fallback**: if `typeof indexedDB === 'undefined'`, all `_idb*` no-op; save falls back to localStorage with images (old behavior).

**One-time migration**: on first IDB-aware load, copy any localStorage-embedded
base64 images to IDB, then strip from localStorage.

**Smoke tests G3-1, G3-2, G3-3**:
- 6 locked chars with images → localStorage <50KB
- Heavy project → no QuotaExceeded
- IDB disabled → localStorage fallback works

---

### Step 8 — D1-D4: ADRs (1 hr)

Four short architecture decision records in `devDoc/`:

| File | Captures |
|---|---|
| `devDoc/ADR-cluster-as-data-primitive.md` | `scene.clusterId` + `clusters[]`; why first-class |
| `devDoc/ADR-runtime-axis-layout.md` | X-axis = runtime; Option A over B |
| `devDoc/ADR-virtual-stitch.md` | URL-list to editor; concat only at download |
| `devDoc/ADR-editor-roundtrip-contract.md` | What round-trips back; what stays editor-only |

Standard template per ADR: Context → Decision → Consequences → Alternatives.
Decisions extracted from `canvas-movie-mode-plan.md` (already captured there;
ADRs make them findable).

**No code; pure markdown. Risk: zero.**

---

### Step 9 — D5: Schema migration plan (30 min)

`devDoc/movie-mode-migration.md`:

- **Migration path**: existing flat-scene projects → single default cluster on first load
- **Code sketch**:
  ```js
  if (createScenes.length > 0 && !createJobState.clusters) {
    const def = { id: 'cl_default', name: 'Movie', sceneIds: createScenes.map(s => s.id), createdAt: Date.now() };
    createJobState.clusters = [def];
    createScenes.forEach(s => s.clusterId = 'cl_default');
  }
  ```
- **Schema version**: add `createJobState.schemaVersion: 2` for future migrations
- **Cluster duration**: `cluster.duration = sum(scenes.duration)`, derived not stored
- **Backwards compat**: old localStorage missing `clusters[]` → auto-migrates on first load
- **Forward compat**: future migrations check `schemaVersion`
- **Test cases**: empty project, 1-scene, 50-scene, podcast with chapters
- **Rollback**: how to remove `clusters[]` and restore flat scene list

**Pure markdown.**

---

## 4. Verification

### Schema invariants (run in dev mode)

```js
function assertCastInvariants() {
  if (createJobState.videoTypeLocked) console.assert(createJobState.videoType, 'Locked but no type');
  if (createJobState.videoType === 'narration') {
    console.assert((createJobState.characters || []).length === 0, 'Narration with cast');
    console.assert(!createJobState.product, 'Narration with product');
  }
  const allLocked = [
    ...(createJobState.characters || []),
    ...(createJobState.locations || []),
    createJobState.product, createJobState.presenter, createJobState.setting,
  ].filter(x => x && x.locked);
  allLocked.forEach(x => {
    console.assert(x.appearanceSheet, `Locked ${x.name} missing appearance`);
  });
  const names = allLocked.map(x => (x.name || '').toLowerCase());
  console.assert(new Set(names).size === names.length, 'Name collision');
}
```

### Storage health (G3)

```js
async function assertStorageHealth() {
  const saved = localStorage.getItem('stori_create_autosave');
  if (!saved) return;
  console.assert(saved.length < 1024 * 1024, `localStorage > 1MB: ${(saved.length / 1024 / 1024).toFixed(2)}MB`);
  console.assert(!saved.includes('data:image'), 'base64 image leaked into localStorage');
}
```

### AI throttle (G8)

```js
function assertAiThrottle() {
  console.assert(_aiInflightCount <= AI_REWRITE_MAX_CONCURRENT, 'Throttle breached');
}
```

---

## 5. Smoke Tests Master List

| ID | Step | Description |
|---|---|---|
| G6-1 | 1 | Legacy regen no longer fires video gen |
| G1-1 | 2 | Locked cast survives reload |
| G1-2 | 2 | Brand product+presenter survives reload |
| G1-3 | 2 | 24h-expired autosave purged |
| G4-1 | 3 | Brand product gets hero-shot framing |
| G8-1 | 4 | Concurrent AI updates throttled to 2 |
| G5-1 | 5 | Cross-bucket name collision blocked |
| G5-2 | 5 | Library + brand collision blocked |
| G7-1 | 6 | Dismissed detection suppressed |
| G7-2 | 6 | Manual lock clears dismissal |
| G3-1 | 7 | Locked images survive in IDB |
| G3-2 | 7 | Heavy projects no quota error |
| G3-3 | 7 | Browsers without IDB fall back |

13 smoke tests, each <2 min manual.

---

## 6. Phased Build Order

| Phase | Steps | Time | Commit message |
|---|---|---|---|
| **A — Quick wins** | G6 → G4 | ~10 min | "Cast: decouple legacy regen, brand product hero-shot framing" |
| **B — Restore correctness** | G1 + G2 | ~1 hr | "Cast: autosave restore + extended schema" |
| **C — Throttle + collision** | G8 + G5 | ~25 min | "Cast: AI rewrite throttle + brand name collision" |
| **D — Polish** | G7 | ~30 min | "Cast: detect-from-script preserves dismissals" |
| **E — Storage hardening** | G3 | ~2 hrs | "Cast: images move to IndexedDB" |
| **F — Documentation** | D1-D5 | ~1.5 hrs | "Movie mode ADRs + schema migration plan" |

Each phase ends with `node build.js` clean + listed smoke tests pass.

---

## 7. Open Items / Decisions

1. **localStorage → IDB migration** (G3): one-time copy on first IDB load? Default **yes**.
2. **IDB quota strategy**: hard cap library at 30 (already shipped); console warning only on quota error. Default **yes**.
3. **Async autosave with images**: fire-and-forget (don't block save commit). Default **yes**.
4. **`midProject` flag** persistence across reload: keep. Default **yes**.

Accept defaults unless noted.

---

## 8. Out of Scope

- AI rewrite undo (#2) — obsoleted by manual AI rewrite flow
- Movie mode (#11) — see `canvas-movie-mode-plan.md`
- Voice/motion metadata per character (R10 v2)
- Tier model (principal/named-extra/background)
- Cross-mode persistence warning beyond what already exists
- AI continuity check
- Per-scene → editor send

---

## 9. Definition of Done

A gap fix is "done" when:
1. Code lands and `node build.js` succeeds
2. Listed smoke tests pass manually
3. Schema invariants run clean (dev mode)
4. No regression on existing smoke tests (ST-01 through ST-30)
5. Committed with the phase commit message

---

## 10. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| IDB upgrade race on first load | low | `onupgradeneeded` waits for store creation |
| Restore fires before DOM ready | low | Already deferred via `DOMContentLoaded` |
| Autosave hammers IDB on rapid edits | medium | Existing 500ms debounce |
| Library and project share entity image — delete leaks | low | IDB keys scoped (`rep_<id>`, `lib_<libId>_rep`) |
| Brand product in old library marked `kind: 'character'` | low | Migration normalizes on load |
| Concurrent restore + user typing | very low | Restore only sets if `createJobState.characters` empty |
| AI throttle queue starves | low | Queue is FIFO; longest wait bounded by AI latency × queue depth |
