# Illustrated-mode canvas integration — full work plan

**Status:** Specification, not yet implemented
**Scope:** Extend node-graph canvas to Copilot illustrated-only flow + Autopilot illustrated reels
**Out of scope (v1):** Marketing pipeline, Photo Pilot
**Last revised:** 2026-05-01

## Pre-flight audit (what was missed in the first pass)

- **Two different "active" stars on image nodes** — ⭐ "video-gen" must be hidden in illustrated, 🎯 "render" must be promoted to primary.
- **Auto-star behaviour** in `CanvasState.normalizeSceneFlags` — already auto-sets first 🎯 when none active. ✓ free.
- **Validation gates** — `validateGates` is already mode-aware (illustrated path checks `🎯 image`); `launchEnabled` is computed but irrelevant since launch button is hidden. ✓ no change.
- **Storyboard scene-grid in legacy UI** — `create-scene-grid` is the prompt-editor cards. When canvas mounts for illustrated, this MUST be hidden, otherwise prompts can be edited in two places with diverging state.
- **Properties pane image row** — currently shows both ⭐ and 🎯. Hide ⭐ row in illustrated.
- **Bottom-pane job chips** — "🎬 N videos ready" makes no sense in illustrated. Replace with "🖼 N images ready".
- **Full Preview pane** — concatenation of clips makes no sense without videos. Disable button or relabel as a still-slideshow (deferred — disabling is the safe v1 choice).
- **Reels mode detection** — Autopilot's "Open in canvas" hardcodes `mode: 'animated'`. Must derive from whether reel scenes carry `videoUrl`/`videoClips`.
- **Persisted positions cross-mode** — `launchAgentPosition` written by an animated session is meaningless when reopened as illustrated. Read but ignore in illustrated mode (don't render Launch).
- **Migration safety** — `migrateScene` is mode-agnostic; in illustrated mode `videoInstances` ends up `[]`. ✓ free.
- **Mirror writes** — `syncMirrorFields` already branches: illustrated writes `scene.imgDataUrl` from 🎯 image, doesn't touch `scene.videoUrl`. ✓ free.
- **Gate enforcement on Send-to-Editor (17d)** — currently animated-only. Must add an illustrated branch (every section must have a 🎯 image).
- **`launchVideoAgent()` defensive guard** — must early-return if `g.mode === 'illustrated'` so even programmatic callers can't trigger it.
- **Layout columns** — `COL_LAUNCH` and `COL_FINAL` constants are baked-in. Need a runtime `colFinal` computation.
- **`fitToView`** — already iterates over actually-existing nodes only, so it computes correct bounds from `[SB, Img, Final]` without changes. ✓ free.
- **Keyboard shortcut `R`** — image regen works; video reanim irrelevant. ✓ free.
- **Keyboard shortcut `Delete`** — works for SB/Img; video branch unreachable. ✓ free.

## Detailed change list

### Phase A — Canvas internals (`js/29-canvas-render.js`)

**A1. Mode-aware column positions** (in `runLayout()` and `tidyLayout()`):
```js
const colFinal = g.mode === 'illustrated' ? COL_VID : COL_FINAL;
const graphRight = colFinal + FINAL_W + 60;
// use colFinal for g.finalPos.x default; use graphRight for g.graphW
// In illustrated: skip launchPos computation entirely (g.launchPos = null)
```
Result: `[SB(60)]──[Img(340)]──[Final(620)]` width 880 vs animated 1430.

**A2. `renderLaunchNode()` — early-return for illustrated:**
```js
if (g.mode === 'illustrated') {
  if (g.launchEl) g.launchEl.style.display = 'none';
  return;
}
```

**A3. `renderFinalNode()` — visibility off image presence:**
```js
const hasContent = g.mode === 'illustrated'
  ? g.scenes.some(s => (s.storyboardInstances||[]).some(sb => (sb.imageInstances||[]).length > 0))
  : g.scenes.some(s => (s.videoInstances||[]).length > 0);
if (!hasContent) { if (g.finalEl) g.finalEl.style.display='none'; return; }
```

**A4. `redrawCurves()` — illustrated path:**
```js
if (g.mode === 'illustrated') {
  if (g.finalEl?.style.display !== 'none') {
    for (const scene of g.sortedScenes) {
      const sb = (scene.storyboardInstances||[]).find(s => s.isActive);
      const renderImg = sb?.imageInstances.find(i => i.isRenderActive);
      if (renderImg?.status === 'done') {
        drawCurveXY(renderImg.id, NODE_W, IMG_H, g.finalPos.x, g.finalPos.y + FINAL_H/2, '#10b981', 'done');
      }
    }
  }
  // skip: Image→Video (vids empty anyway), ⭐Image→Launch (launch hidden anyway)
}
```
The existing animated branch stays untouched.

**A5. `updateImgNode()` — star visibility flip:**
```js
const starBtn = el.querySelector('[data-action=img-star]');
if (starBtn) {
  starBtn.style.display = g.mode === 'illustrated' ? 'none' : '';
  starBtn.textContent = img.isActive ? '⭐' : '☆';
}
const renderBtn = el.querySelector('[data-action=img-render]');
if (renderBtn) {
  renderBtn.style.display = ''; // always show; in illustrated it's the primary
  renderBtn.textContent = img.isRenderActive ? '🎯' : '◎';
}
// active class drives by render flag in illustrated, by ⭐ flag in animated
el.classList.toggle('cg-node-active', g.mode === 'illustrated' ? !!img.isRenderActive : !!img.isActive);
```

**A6. `launchVideoAgent()` — defensive guard at top:**
```js
if (g.mode === 'illustrated') return;
```

**A7. `updateJobChips()` — image count for illustrated:**
```js
const nImgs = g.scenes.reduce((a, s) => a + (s.storyboardInstances||[]).reduce(
  (b, sb) => b + (sb.imageInstances||[]).filter(i => i.status === 'done').length, 0), 0);
const ready = g.mode === 'illustrated'
  ? `<span class="cg-chip">🖼 ${nImgs} image${nImgs!==1?'s':''} ready</span>`
  : (nVids > 0 ? `<span class="cg-chip">🎬 ${nVids} video${nVids!==1?'s':''} ready</span>` : '');
```

**A8. `renderProps()` — hide ⭐ row in illustrated:**
In the `found.type === 'img'` branch, wrap the `⭐ Video gen` row in `${g.mode !== 'illustrated' ? '...' : ''}`.

**A9. `buildFullPreview()` — disable for illustrated:**
```js
if (g.mode === 'illustrated') { alert('Full preview is animated-only in v1.'); return; }
```
Plus hide the Preview button at mount time:
```js
// in buildDOM right pane — add data-mode-animated attribute, OR after mount:
if (g.mode === 'illustrated') {
  const pb = document.getElementById('cg-btn-preview'); if (pb) pb.style.display = 'none';
}
```

**A10. `buildSBNode()` — header title** stays the same. SB controls (prompt textarea, ref upload, add image, delete) all work as-is. ✓

### Phase B — Copilot mount (`js/17c-create-pipeline.js`)

**B1. After `runImageGeneration` completes, branch on mode:**
Replace the current `if (createVideoMode === 'animated')` block with:
```js
if (createVideoMode === 'animated' || createVideoMode === 'illustrated') {
  const mode = createVideoMode === 'animated' ? 'animated' : 'illustrated';
  const scenesWithImages = createScenes.filter(s => s.imgDataUrl);
  if (scenesWithImages.length > 0 && typeof CanvasState !== 'undefined' && typeof CanvasGraph !== 'undefined') {
    try {
      CanvasState.migrateAllScenes(createScenes, { stylePreset: createStylePreset || '' });
      CanvasState.normalizeAll(createScenes, mode);
      CanvasState.syncAllMirrors(createScenes, mode);

      const canvasStep = $('create-canvas-step');
      const videoStep  = $('create-video-step');
      const sceneGrid  = $('create-scene-grid');                  // NEW: hide legacy storyboard cards
      if (videoStep)  videoStep.style.display  = 'none';
      if (sceneGrid && mode === 'illustrated') sceneGrid.style.display = 'none';
      if (canvasStep) {
        canvasStep.style.display = '';
        CanvasGraph.mount('create-canvas-step', createScenes, mode, { geminiKey: getCreateGeminiKey() });
      }
      updateCreateAgent('animation', 'idle',
        mode === 'animated' ? 'Use canvas to generate videos' : 'Fine-tune images in canvas');
      updateStepStates();
      return;
    } catch (canvasErr) {
      console.error('Canvas mount failed:', canvasErr);
      // Fall through to legacy auto-animate ONLY for animated mode
      if (mode === 'illustrated') return;
    }
  }
  // Legacy fallback (animated only)
  if (createVideoMode === 'animated' && typeof animateScenes === 'function') { /* existing fallback */ }
}
```

**B2. "Back to canvas" handling** — When user navigates back to Create page after using canvas, the existing flow restores `cameFromCreate`. Need to re-show canvas if `createVideoMode === 'illustrated' && createScenes.some(s => s.storyboardInstances)`. Add this hook in the existing back-to-create flow (currently re-renders scene cards). Concretely: in the same place where `renderCreateVideoCards()` is called for animated (line ~1023 of `15-project.js`), add a parallel call to remount canvas in illustrated mode if instance data is present.

### Phase C — Send-to-Editor gate (`js/17d-create-languages.js`)

**C1. Add illustrated branch to the gate check:**
```js
if (typeof CanvasState !== 'undefined' &&
    (createVideoMode === 'animated' || createVideoMode === 'illustrated') &&
    createScenes.some(s => Array.isArray(s.storyboardInstances))) {
  CanvasState.syncAllMirrors(createScenes, createVideoMode);
  const gates = CanvasState.validateGates(createScenes, createVideoMode);
  if (!gates.renderEnabled) {
    alert('Cannot send to editor:\n\n' + gates.renderBlockers.join('\n') + '\n\nUse the canvas Final Render node to fix.');
    return;
  }
}
```

### Phase D — Autopilot mode detection (`js/20-reels-creator.js`)

**D1. Detect mode from reel scenes before mounting:**
```js
const hasVideo = reelScenes.some(s => s.videoUrl || (s.videoClips && s.videoClips.length));
const reelMode = hasVideo ? 'animated' : 'illustrated';
CanvasState.migrateAllScenes(reelScenes, { stylePreset: reelStyleEl?.value || '' });
CanvasState.normalizeAll(reelScenes, reelMode);
CanvasState.syncAllMirrors(reelScenes, reelMode);
CanvasGraph.mount('reel-canvas-mount', reelScenes, reelMode, { geminiKey: ... });
```

### Phase E — Project load (`js/15-project.js`)

**E1. Re-mount canvas on project load for illustrated mode** — current load only re-renders animated video cards. Add a parallel block:
```js
// After scenes restored + canvas migration runs (existing code in load handler):
if (createVideoMode === 'illustrated' && createScenes.some(s => s.storyboardInstances) &&
    typeof CanvasGraph !== 'undefined') {
  // Defer until user navigates back to Create page; hooked in updateCreateAgent or back-to-create
  // (Same hook point used for animated canvas remount.)
}
```
This only applies if Phase B2 above is implemented; otherwise the project loads to legacy scene grid until user re-runs canvas mount.

### Phase F — CSS (`css/canvas-graph.css`) — optional polish

No structural changes needed (existing classes work for both modes). Optional: add a `.cg-root[data-mode=illustrated] .cg-node-img.cg-node-active` rule to give the 🎯 active state a distinct emerald glow (matches Final Render color, signals "this is what gets exported").

## Element-by-element coverage map

| Element | Action |
|---|---|
| SB node | unchanged |
| SB → Img curve | unchanged |
| Img node ⭐ button | hidden in illustrated (A5) |
| Img node 🎯 button | promoted to primary in illustrated (A5) |
| Img → Vid curve | naturally absent (vids empty) |
| Vid node | naturally absent |
| Vid controls / re-animate / delete | naturally absent |
| ⭐Img → Launch curve | naturally absent (Launch hidden) |
| Launch Video Agent node | hidden (A2) + guarded (A6) |
| Vid → Final curve | naturally absent |
| **🎯 Img → Final curve** | **NEW — added (A4)** |
| Final Render node | shown when ≥1 image exists (A3); slid left to COL_VID (A1) |
| Final Render Export button | works via mirror imgDataUrl + existing pipeline |
| Final Render Editor button | works via existing sendCreateToEditor + mirror |
| Section bands | unchanged (height auto-shrinks via vids.length=0) |
| Pan/zoom | unchanged |
| Drag | unchanged |
| Tidy | uses A1 mode-aware columns |
| Fit-to-view | unchanged (auto-fits whatever nodes exist) |
| Properties pane image row | ⭐ row hidden in illustrated (A8) |
| Bottom chips | "image count" replaces "video count" (A7) |
| Full Preview button | hidden + guarded (A9) |
| Save (15-project.js save side) | unchanged (mode-agnostic serialize) |
| Load (15-project.js load side) | unchanged for data; needs re-mount hook (E1) |
| `migrateScene` | unchanged (correctly produces empty videoInstances) |
| `syncMirrorFields` | unchanged (mode-aware, illustrated reads img) |
| `validateGates` | unchanged (mode-aware, illustrated checks 🎯 image) |
| `normalizeSceneFlags` | unchanged (auto-sets 🎯 already) |
| `listImagesAwaitingVideo` | not called in illustrated mode (Launch hidden) |
| `launchVideoAgent` | guarded (A6) |
| Keyboard `Delete`/`R`/`F`/`Esc`/`Space`/`1-9` | all work without change |
| 17c mount point | mode-branched (B1) + hides scene grid |
| 17d Send-to-Editor gate | mode-branched (C1) |
| 20-reels Open in Canvas | mode-detected (D1) |
| Legacy `create-scene-grid` | hidden when illustrated canvas mounts (B1) |
| Legacy `create-video-step` | already hidden (existing animated path) |
| Reel canvas-close handler | unchanged (works for both modes) |

## Files touched

| File | Lines changed (est.) | Phases |
|---|---|---|
| `js/29-canvas-render.js` | ~50 | A1–A9 |
| `js/17c-create-pipeline.js` | ~10 | B1, B2 |
| `js/17d-create-languages.js` | ~3 | C1 |
| `js/20-reels-creator.js` | ~3 | D1 |
| `js/15-project.js` | ~5 (optional, only if B2 needs it) | E1 |
| `css/canvas-graph.css` | optional, ~10 | F |

## Loose ends called out (so they don't surprise us)

- **Slideshow preview** for illustrated full-preview — deferred to v2; v1 just hides the button.
- **Cross-mode project reload** (saved animated, opened illustrated) — video instances persist as inert data; harmless. Mirror writes branch correctly.
- **Persisted Launch position** in illustrated saves — written but never read; takes ~16 bytes of storage. Acceptable.
- **`renderProps` for video node** — unreachable in illustrated; no change needed but won't break if somehow called.
- **`tidyLayout` resets `g.launchPos = null`** — in illustrated, this is fine because A2 prevents the launch element from rendering at any position.
- **Theme variables** for `🎯` active glow — A5 keeps the existing `.cg-node-active` class; if visual differentiation between ⭐ and 🎯 active is wanted, add F.
