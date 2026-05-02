# Stori Canvas-Graph Renderer — Greenfield Rebuild Plan

**Status:** draft for review (architect output, no commits, no code touched yet)
**Owner files (rebuilt):** `js/29-canvas-render.js`, `css/canvas-graph.css`
**Audience:** the implementer agent that will (1) empty both files to stubs, then (2) build them from scratch.
**Spec sources (do not relitigate):** `devDoc/00-phase-index.md`, `devDoc/phase-01..08-*.md`, `devDoc/adr/ADR-001..012-*.md`, `canvas-redesign-mock.html`, `index.html` (Aurora tokens), `css/themes.css` (light theme tokens).

This document consolidates the eight phase docs and twelve ADRs into a single buildable plan. It is **not** a re-design — every architectural decision lives in the phase docs / ADRs and is referenced here by file. Where the existing renderer is cited, it is cited as either (a) the public API contract that must be preserved verbatim or (b) an anti-pattern catalogue listing things the rebuild must NOT carry over.

---

## 1. Scope & boundaries

### 1.1 In scope

| File | Action |
|---|---|
| `js/29-canvas-render.js` | Empty to stub, rebuild greenfield |
| `css/canvas-graph.css`   | Empty to stub, rebuild greenfield |

### 1.2 Out of scope (do NOT touch)

| File | Why |
|---|---|
| `js/27-canvas-state.js`            | Data model + migration. Already correct (see §10 below). |
| `js/28-canvas-consistency.js`      | Image regen path. Already correct. |
| `js/17c-create-pipeline.js`        | Integration glue. Public-API contract to renderer. Read-only. |
| `js/17a-create-api.js`             | Agent panel row click → `CanvasGraph.panToColumn`. Read-only. |
| `js/17d-create-languages.js:706`   | Round-trip handoff to editor. Read-only. |
| `js/15-project.js`                 | Project save/load with `imageInstanceId` / `videoInstanceId` / `sourceImageInstanceId` round-trip fields. Read-only. |
| `js/21-kling.js`                   | Video generation. Read-only. |
| `index.html` (chrome scaffolding)  | `#create-canvas-panel`, `#create-canvas-step`, `.cg-top-pill`, `.cg-progress-strip`, `.cg-telemetry`, `.cg-zoom-dock`, `#create-agent-panel`, `:root` Aurora dark tokens, `--sock-*` palette. The DOM scaffolding stays; only the rendered content INSIDE `#create-canvas-step` changes. |
| `css/themes.css`                   | `html[data-theme="light"]` tokens including `--sock-*` palette. |
| `css/styles.css:404-418`           | `#create-page` Family A→B Aurora remap. |
| `js/20-reels-creator.js`           | Reels mount path; same public API; no changes needed. |
| `canvas-redesign-mock.html`        | Visual reference. Stays. |
| `devDoc/**/*.md`                   | Design rationale. Stays. |

### 1.3 What greenfield means here

The existing 4243-line `29-canvas-render.js` and 2527-line `canvas-graph.css` were assembled across 8 incremental phases. They contain (a) a working Aurora-token-driven core, (b) vestigial action columns (`.cg-actions-col`, `.cg-img-actions`), (c) a hybrid "card chrome" where new patterns sit beside older ones that should have been deleted, and (d) at least one cursor-mode regression where the comment claims "default = pan" but the code initializes `cgChrome.cursorMode = 'select'` (line 4004 of the existing renderer; see §15.1 below). Greenfield rebuild eliminates the hybrid in one move.

The rebuild is NOT free to redesign. Visual + behavioral spec is locked by the eight phase docs and twelve ADRs. The rebuild's freedom is purely structural — same outputs, cleaner construction.

---

## 2. Public API contract (preserved verbatim)

Every entry in this table is a method on `window.CanvasGraph` that lives outside of `js/29-canvas-render.js` and is called by another module. The rebuild MUST preserve every name, signature, and observable semantic. If a caller's call still works after the rebuild, the rebuild is correct on this axis.

| Method | Signature | Semantic | Caller(s) |
|---|---|---|---|
| `mount` | `mount(containerId, scenes, mode, opts)` | Build DOM into `#${containerId}`, run migration → ensurePending → normalize → syncMirrors → layout → render → curves → fitToView. Idempotent (`unmount()` first if already mounted to same id). `mode` ∈ {`'animated'`, `'illustrated'`}. `opts.geminiKey` (string), `opts.job` (jobState mirror — see ADR-2 §6 / `CanvasState.validateGates`). | `js/17c-create-pipeline.js:3261` (`openCanvasPanel`); `js/20-reels-creator.js:5103` |
| `unmount` | `unmount(containerId)` | Tear down DOM, listeners, RAFs, polls; clear singleton state; safe to call when unmounted. | `js/17c-create-pipeline.js:3280` (`closeCanvasPanel`); `js/20-reels-creator.js:5114` |
| `refresh` | `refresh()` | Re-run `runLayout()` then `renderAll()` against current `g.scenes`. No DOM rebuild. Used after data mutation that callers can't push through `notifyImageReady`. | called by integration code defensively |
| `notifyImageReady` | `notifyImageReady(sceneIdx)` | Called whenever `createScenes[sceneIdx]` mutated its legacy flat fields (`imgDataUrl`, `status`). Mirrors legacy → render-active `imageInstance`, calls `updateImgNode` for each image node in that scene's active SB. No layout, no full render. | `js/17c-create-pipeline.js:2735, 2757` (after every scene status flip) |
| `fitToView` | `fitToView()` | Compute bounding box of every node + chrome (Launch / BGM / Sub / Final) + tray; zoom/pan so it fits the wrapper safe-area at ≤ 1.0 zoom. Honours wrapper CSS padding. | `js/17c-create-pipeline.js:3271` (resize listener) |
| `panToColumn` | `panToColumn(colKey)` | `colKey ∈ { 'sb', 'img', 'vid', 'bgm', 'sub', 'final' }`. Pan horizontally to centre that column's middle X in the viewport (no zoom change, vertical pan preserved). | `js/17c-create-pipeline.js:3425` (agent panel row click via `onCreateAgentRowClick`) |
| `tidyLayout` | `tidyLayout()` | Reset all `canvasPosition` to defaults, animate nodes to new positions, save. Used by Tidy button in legacy chrome (the Tidy button itself goes away in §6 below; the API stays for callers that bind to it). | retained for compatibility |
| `getScenes` | `getScenes() → scenes \| null` | Return `g.scenes` reference or `null` when unmounted. | retained for compatibility (no current external caller) |
| `isActive` | `isActive() → boolean` | `true` iff renderer is currently mounted (`g !== null`). | `js/17c-create-pipeline.js:3083, 3270, 3279, 3424` (gates the resize listener and agent-panel routing) |
| `chromeShowProgress` | `chromeShowProgress(totalPct, nodePct)` | Show top-right progress strip with `Total ${totalPct}%`, fill bar to `totalPct`, `Node ${nodePct}%`. | `js/17c-create-pipeline.js:3384` |
| `chromeHideProgress` | `chromeHideProgress()` | Hide progress strip (set `hidden` attr). | `js/17c-create-pipeline.js:3386, 3389` |
| `chromeSetActiveCount` | `chromeSetActiveCount(n)` | Set the "N active" status pill text + active class. | `js/17c-create-pipeline.js:3367` |
| `_actions` | `{ addImageInstance, deleteSB, deleteImage, deleteVideo, regenImage, reanimateVideo, downloadImage, previewImage, runExport, sendToEditor, triggerSave, runLayout, renderAll }` | Internal namespace exposed for the `*Actions` IIFEs to wrap (ADR-6 §3). Underscore prefix = "internal, not stable API". | the `*Actions` registration block, lines 1319-1640 of existing renderer |
| `_cursorMode` | property; one of `'select' \| 'pan' \| 'connect'` | Read by some external code paths (line 4041 of existing renderer assigns it). The rebuild keeps this as a read-only mirror of `cgChrome.cursorMode`, **defaulting to `'pan'`** per §7.1 below. | weakly external — preserved for safety |

### 2.1 Canonical action namespaces (preserved)

These five `window.*Actions` namespaces are populated by the renderer's `*Actions` registration IIFE and consumed by both the context menu and the floating selection toolbar (ADR-6). The rebuild MUST register the same handler names on the same namespaces.

| Namespace | Handlers (rebuild must register all) |
|---|---|
| `window.sbActions`    | `addVariant`, `delete`, `edit`, `addRef`, `regen`, `setDuration`, `setStyle` |
| `window.imgActions`   | `regen`, `addVariation`, `download`, `delete`, `setRatio`, `setSeed` |
| `window.vidActions`   | `regen`, `addVariation`, `download`, `delete`, `setDuration`, `setModel` |
| `window.bgmActions`   | `compose`, `library`, `skip`, `reset`, `setVolume`, `setStyle` |
| `window.finalActions` | `render`, `download`, `cancel`, `setResolution`, `setFps` |

Signatures, return types, side effects: see existing renderer lines 1166–1640 for the verbatim contract. The rebuild MUST keep idempotent registration (`if (!window.sbActions.delete) { ... }`) so any caller that registered a handler earlier wins.

### 2.2 External globals the renderer reads

These are project-wide globals the renderer pulls from at mount/render time. Reading them is fine; the rebuild MUST NOT redefine or own them.

- `window.createScenes` — scene array (passed in via `mount`)
- `window.createJobState` — `{ bgmReady, bgmSkipped, audioSubReady, audioSubSkipped }`
- `window.createBgmUrl` / `window.createBgmNodePosition`
- `window.createSubNodePosition` / `window.createFinalRenderPosition` / `window.createLaunchAgentPosition`
- `window.createVideoMode` (`'animated'` / `'illustrated'`)
- `window.createStylePreset`
- `window.regenerateScene(idx)` (from `js/17c-create-pipeline.js:2814`)
- `window.launchImageAgent` (from pipeline)
- `window.generateRunning` (cancel hook — pipeline writes `false` to abort)
- `window.animateScenes` (kling integration)
- `window.selectedNodeId` (mirror of `g.selectedId` for cross-module reads)

---

## 3. Module organization

`js/29-canvas-render.js` ships as one file (build pipeline constraint, ADR-8). Inside it, the rebuild organizes into named sections separated by section banners. Each section names what it owns, what it reads, what it exports.

```
// ════ SECTION 1 — Constants ════
//   CANVAS_LAYOUT_VERSION = 8 (bumped per ADR-3 — §10)
//   Node sizes (NODE_W, SB_H, IMG_H, VID_H, BGM_W/H, SUB_W/H, FINAL_W/H, LAUNCH_W/H)
//   Layout grid (COL_SB, COL_IMG, COL_VID, COL_LAUNCH, COL_BGM_*, COL_SUB_*, COL_FINAL_*)
//   Spacing (COL_GAP, ROW_GAP, BAND_PAD, BAND_GAP)
//   Variant-tray geometry (THUMB_W, THUMB_H, STRIP_GAP, STRIP_GAP_TOP, TRAY_PAD_BTM)
//   No hex codes. No mock palette literals.

// ════ SECTION 2 — Singleton state ════
//   `let g = null` carrying:
//     containerId, container, scenes, mode,
//     zoom, panX, panY,
//     selectedId, selectedIds (Set), hoveredNodeId,
//     marquee, dragging, spaceHeld, isPanning, panStart,
//     nodeEls (Map<instanceId, {el, type}>),
//     videoElCache (Map<vidId, HTMLVideoElement>),
//     launchEl/Pos, bgmEl/Pos, subEl/Pos, finalEl/Pos,
//     graphLayerEl, svgEl, wrapperEl, rightPaneEl,
//     sortedScenes, graphW, graphH,
//     saveTimer, bgmPollTimer, isAnimating,
//     geminiKey, job,
//     onKeyDown, onKeyUp, onMouseMove, onMouseUp.

// ════ SECTION 3 — DOM build ════
//   buildDOM(container) — wrapper / graph layer / svg / right pane only.
//   No top toolbar (chrome lives in index.html, P02).
//   No bottom pane (legacy `.cg-bottom-pane` is dropped).
//   Right pane is reduced — Properties + Preview only; restyled per P08.

// ════ SECTION 4 — Tokens & color helpers ════
//   getSockColor(type) — getComputedStyle().getPropertyValue('--sock-' + type).trim()
//   No hard-coded hex anywhere downstream. Curve / dot / overlay colors all
//   resolve through this helper.

// ════ SECTION 5 — Layout ════
//   runLayout() — assigns canvasPosition for SB / IMG / VID per band.
//   Single SB + single IMG + single VID slot per scene band.
//   Variant-tray geometry computed deterministically (bounding-box, no DOM
//   measurement) per ADR-5.
//   `_layoutVersion` mismatch resets stale canvasPosition (ADR-3).
//   tidyLayout() — public; resets + animates.

// ════ SECTION 6 — Rendering ════
//   renderAll() — bands → nodes → launch → bgm → subtitle → final → curves → chips.
//   renderBands() — section bg + warning chips.
//   renderNodes() — iterates scenes, ensures node DOM, places, calls update*.
//   ensureNode(id, type, buildFn) — DOM cache; build once, update on rerender.
//   buildSBNode / updateSBNode  (§5)
//   buildImgNode / updateImgNode (§5)
//   buildVidNode / updateVidNode (§5)
//   buildBgmNode / buildSubtitleNode / buildFinalNode / buildLaunchNode (§5)
//   ensureImgVariantTray / updateImgVariantTray (P05)
//   ensureVidVariantTray / updateVidVariantTray (P06)
//   pruneStaleVariantTrays / pruneVidTrayForScene
//   computeStripHeight(thumbCount)

// ════ SECTION 7 — Curves ════
//   redrawCurves() — full SVG rebuild per call.
//   bezierTyped(x1, y1, x2, y2, type, status, fromId, toId)
//   drawCurve / drawCurveXY
//   markCurvesConnectedTo / clearCurveHoverDim (hover-dim system)
//   Curve color: getSockColor(type); error → --red.
//   Selected node's curves stroke 1.8px (others 1.6px); pending statuses dashed.

// ════ SECTION 8 — Pan / zoom / fit ════
//   applyTransform() — sets graph layer transform + --cg-zoom CSS var.
//   handleZoom(delta, cx, cy) — clamp [0.25, 2.5]; zoom-at-pointer.
//   fitToView() — bbox compute, fit to wrapper safe-area, ≤ 1.0 zoom.
//   panToColumn(colKey) — public; centre column in viewport horizontally.

// ════ SECTION 9 — Interactions ════
//   attachEvents() — wheel, mousedown, mousemove, mouseup, click, keydown,
//                    keyup. Returns the four handler refs for unmount cleanup.
//   makeDraggable(el, id) — drag from `.cg-drag-handle` only (header).
//   selectNode(id, opts) — set selectedId + selectedIds; re-stroke curves;
//                          place selection toolbar.
//   applySelection(set) — multi-select replacement.
//   handleNodeClick / handleNodeContextMenu / handleNodeDblClick.
//   findInstance(id) → { type, scene, sb, img, vid }.

// ════ SECTION 10 — Context menu + selection toolbar ════
//   cgGetMenuItems(ctx) — type-keyed item arrays.
//   cgOpenContextMenu(clientX, clientY, ctx) — fixed position; auto-close.
//   cgCloseContextMenu() — listener teardown.
//   cgUpdateSelToolbar() — places toolbar 72px above selected card,
//                          counter-scaled via --cg-zoom (ADR-10).
//   cgRemoveSelToolbar() — DOM remove.

// ════ SECTION 11 — Marquee select ════
//   Started in mousedown when cursor mode = 'select' OR Shift-drag and
//   the click target is empty stage. Updated in mousemove. Hit-tested
//   in mouseup via getBoundingClientRect overlap; replaces selection
//   (or extends if Shift was held).

// ════ SECTION 12 — Floating chrome wiring ════
//   cgChrome state object: { mountTime, rafId, fpsLastT, fpsFrames, fpsValue,
//                            telemetryThrottle, cursorMode = 'pan', outsideClickHandler }.
//     ⚠️ NOTE: cursorMode default = 'pan' (not 'select' — fixes the regression).
//   cgChromeMount() — wire zoom dock dropdowns, telemetry rAF (throttled to ~10Hz),
//                     pill-pane-toggle, pill-batch-stepper bindings.
//   cgChromeUnmount() — cancelAnimationFrame, remove listeners.
//   cgChromeShowProgress / cgChromeHideProgress / cgChromeSetActiveCount.

// ════ SECTION 13 — Canonical *Actions registration ════
//   Five IIFEs: sbActions, imgActions, vidActions, bgmActions, finalActions.
//   Each handler is registered with `if (!window.<ns>.<name>)` so a caller
//   that pre-registered (e.g. P05/P06 imgActions.addVariation) wins.
//   Internal `do*` helpers: doAddImageInstance, doDeleteSB, doDeleteImage,
//   doDeleteVideo, doRegenImage, doReanimateVideo, doDownloadImage,
//   doPreviewImage, doExport, doSendToEditor.
//   Exposed via window.CanvasGraph._actions.

// ════ SECTION 14 — Mirror state to legacy fields ════
//   syncMirrorsAfterMutation(scene) — calls CanvasState.syncMirrorFields(scene, g.mode).
//   triggerSave() — debounced project save via projectAutosave.

// ════ SECTION 15 — Public API export ════
//   window.CanvasGraph = Object.assign(window.CanvasGraph || {}, {
//     mount, unmount, refresh, notifyImageReady,
//     fitToView, panToColumn, tidyLayout,
//     getScenes, isActive,
//     chromeShowProgress, chromeHideProgress, chromeSetActiveCount,
//     _cursorMode: 'pan',  // mirror of cgChrome.cursorMode
//   });
```

`css/canvas-graph.css` mirrors the same logical sections in CSS comments. No DOM rule lives in two sections; if a rule applies to multiple node types, it lives under "Node base" and uses class selectors.

---

## 4. Render pipeline

### 4.1 `mount(containerId, scenes, mode, opts)`

Canonical order — every rebuild must execute exactly this sequence:

1. `unmount(containerId)` — idempotent guard.
2. Resolve container; warn-and-return if missing.
3. Initialize `g` singleton with `scenes`, `mode`, default zoom 1, default pan 0/0, empty `nodeEls`, empty `selectedIds`, default `cgChrome.cursorMode = 'pan'`.
4. Mirror to `window.createJobState` so project save sees it.
5. `CanvasState.migrateAllScenes(scenes, { stylePreset })` — already invoked by caller in `openCanvasPanel`, but defensive call here is no-op (idempotent — js27:42).
6. `CanvasState.ensurePendingImages(scenes, { stylePreset })` — ditto.
7. `CanvasState.normalizeAll(scenes, mode)` — ditto.
8. `CanvasState.syncAllMirrors(scenes, mode)` — ditto.
9. `buildDOM(container)` — wrapper, graph layer, svg, right pane (no toolbar, no bottom pane).
10. `runLayout()` — assign positions; resets `_layoutVersion` mismatches (ADR-3).
11. Initial view: `g.zoom = 1.0`; pan so first scene SB lands top-left of safe area.
12. `applyTransform()` — set transform + `--cg-zoom`.
13. `renderAll()` — full first-paint.
14. `redrawCurves()` — initial paths.
15. `cgChromeMount()` — wire chrome (zoom dock, telemetry rAF).
16. `attachEvents()` — global listeners (mouse/key + wrapper).

### 4.2 `renderAll()`

Order matters; do not reorder:

1. `renderBands()` — section bg rectangles + warning chips.
2. `renderNodes()` — for each scene: SB → IMG → VID; ensure-and-update each; place via `placeNode`; ensure variant trays per active SB/IMG.
3. `renderLaunchNode()` — animated mode only.
4. `renderBgmNode()` — both modes; hidden when `g.job.bgmSkipped`.
5. `renderSubtitleNode()` — illustrated mode optional; animated has it as Audio+Sub combined.
6. `renderFinalNode()` — always.
7. `redrawCurves()` — see §4.4.
8. `updateJobChips()` — bottom-left chips (BGM ready, audio ready, etc).
9. `cgUpdateSelToolbar()` — keep toolbar pinned to current selectedId after any reflow.

### 4.3 `runLayout()`

1. Sort scenes by `startTime`.
2. For each scene whose `_layoutVersion !== CANVAS_LAYOUT_VERSION` (= 8), wipe `canvasPosition` for sb / img / vid AND wipe `g.launchPos` / `g.bgmPos` / `g.subPos` / `g.finalPos`. Set `_layoutVersion = 8`.
3. Walk scenes top-down, computing per-band height = `BAND_PAD * 2 + max(SB_H, IMG_H + imgTrayExtra, vidSlotH + vidTrayExtra)`.
4. Per band: SB at `(COL_SB, bandY + BAND_PAD)`; all imageInstances of all storyboards at `(COL_IMG, bandY + BAND_PAD)` (only the active one paints — others share the slot but are hidden); all videoInstances at `(COL_VID, bandY + BAND_PAD)` likewise.
5. Compute `graphH = curY` after last band.
6. Place chrome nodes (Launch / BGM / Sub / Final) at column-X derived from mode (illustrated vs animated) and Y = `graphH / 2 - nodeH / 2`, unless a saved position exists in the project state (`window.createBgmNodePosition` etc).
7. Compute `graphW = colFinal + FINAL_W + 60`.

Variant-tray rectangles are computed deterministically inside `updateImgVariantTray` / `updateVidVariantTray` from the slot anchor + thumb count + thumb stride — never read from DOM. ADR-5.

### 4.4 `redrawCurves()`

Per `g.sortedScenes`:

- **SB → IMG** (every IMG in every SB): type `'image'`, status from img.status.
- **IMG → VID** (every videoInstance via `sourceImageInstanceId`): type `'video'`.
- **⭐ images → Launch** (animated only, when ⭐ image is `done`): type `'video'`.
- **🎯 → BGM**:
  - animated: active VID → BGM (audio); fallback active IMG → BGM if no VID exists for active IMG.
  - illustrated: 🎯 IMG → BGM (audio).
- **BGM → Sub** (both modes when both visible): type `'audio'`.
- **Sub → Final** (when both visible): type `'final'`.
- **BGM → Final** (subtitle hidden fallback): type `'final'`.
- **Illustrated edge**: 🎯 IMG → Final directly when BGM hidden.

Stroke color = `getSockColor(type)` resolving `--sock-image / --sock-video / --sock-audio / --sock-final / --sock-script` from the current `[data-theme]`. Auto-themes on toggle. Status `'error'` → stroke from `--red` / `--cg-danger`. Stroke 1.8px when either endpoint is `g.selectedId`, else 1.6px. Statuses `pending / generating / polling / submitted` → `stroke-dasharray: 5 4`. After draw, re-apply hover-dim if `g.hoveredNodeId` is set (line 2929 of existing renderer pattern).

### 4.5 `applyTransform()`

```
g.graphLayerEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
g.graphLayerEl.style.setProperty('--cg-zoom', String(zoom));
```

Update zoom-pct labels in chrome (`#cg-zoom-pct`, `#cg-zoom-pct-label`).

---

## 5. Node specifications

Every node lives at an absolute `(x, y)` inside `#graph` (the zoom-transformed layer). Drag handle = `.cg-drag-handle` ON THE HEADER ONLY. Body / preview / steppers do not initiate drag.

### 5.1 SB (Storyboard) node

- **DOM**:
  ```
  <div class="cg-node cg-node--sb" data-id="${sb.id}" data-type="sb">
    <div class="cg-node-head cg-drag-handle">
      <span class="cg-head-dot" data-sock="script"></span>
      <span class="cg-node-title">SB ${idx+1}</span>
      <div class="cg-tabs" data-sb-tabs="${scene.id}">
        <button class="cg-tab cg-tab--A active" data-sb="${sbAId}">A</button>
        <button class="cg-tab cg-tab--B"        data-sb="${sbBId}">B</button>
        <button class="cg-tab cg-tab--add">+</button>
      </div>
    </div>
    <span class="cg-sock cg-sock--in  cg-sock--script"></span>
    <span class="cg-sock cg-sock--out cg-sock--script"></span>
    <span class="cg-status-dot cg-status-dot--${status}" data-role="status-dot"></span>
    <div class="cg-node-body">
      <textarea class="cg-prompt"></textarea>
      <input type="file" hidden accept="image/*">  <!-- addRef target -->
      <div class="cg-stepper-row">
        <div class="cg-stepper" data-field="duration">
          <button class="cg-arr">◀</button><span class="cg-val">${dur}s</span><button class="cg-arr">▶</button>
        </div>
        <div class="cg-stepper" data-field="style">
          <button class="cg-arr">◀</button><span class="cg-val">${style}</span><button class="cg-arr">▶</button>
        </div>
      </div>
    </div>
  </div>
  ```
- **Sockets**: in/out, type `script`. Color `--sock-script` (yellow).
- **Tabs** (P05): one tab per `storyboardInstance` in this scene; `+` adds a new SB (`sbActions.addVariant`). Tab click → `CanvasState.setActiveStoryboard`, then `runLayout()` + `renderAll()`. ACTIVE tab = `sb.isActive === true`.
- **Status dot**: `pending` / `running` (yellow pulse) / `done` (teal/mint, NOT cyan — ADR-1) / `error` (`--cg-danger`).
- **Click**: select the SB (`selectNode(sb.id)`).
- **Right-click**: open context menu with `sb-edit / sb-addref / sb-regen / sb-add / sb-delete`.
- **Dbl-click out-socket**: pan to IMG column (P07 / existing line 620).
- **Drag**: header only.
- **Steppers**: `sbActions.setDuration`, `sbActions.setStyle`.

### 5.2 IMG (Image) node

ACTIVE IMG is the imageInstance with `isRenderActive === true` for the ACTIVE storyboard. Other images in that SB live in the thumbnail strip below the active card; they do NOT render as full cards (this is the key shape change vs the old hybrid renderer).

- **DOM**: same shell pattern. Body contains `.cg-img-preview` (16:9, background-image from `imgDataUrl`), inline steppers `aspect ratio` / `seed`, ACTIVE pill (`<span class="cg-variant-pin">ACTIVE</span>`).
- **Sockets**: in/out, type `image`. Color `--sock-image` (orange).
- **Variant tray** (P05): dashed `border` rectangle with class `cg-variant-tray cg-variant-tray--img`. Computed bbox wraps the active IMG card + thumb strip below it. Top-left label chip reads `Img ${sceneIdx+1} · ${count} variants`.
- **Thumbnail strip** (P05): below the active card, grid of `.cg-thumb` 56×36 each. Active thumb gets `.is-active` (1px accent ring). Thumbs with N>0 dependent videos get `.has-vids` (purple-tinted border via `color-mix(in oklch, var(--sock-video) 60%, var(--border))` per phase doc §5(f)). Each `.has-vids` thumb shows `▶N` `.cg-vid-badge` bottom-right (badge bg = `color-mix(in oklch, var(--sock-video) 80%, var(--bg-elevated))`). Click thumb → `CanvasState.setImageRenderActive` then re-render this scene's cards + curves. `+` tile → `imgActions.addVariation`.
- **Status dot**: same scheme.
- **Click**: select the IMG.
- **Right-click**: `img-regen / img-add / img-dl / img-delete`.
- **Dbl-click out-socket**: pan to VID column (animated) or no-op (illustrated).
- **NO in-card action grid** — no `.cg-img-actions`, no 2x2 button cluster. Actions go through context menu + selection toolbar (ADR-6).

### 5.3 VID (Video) node

Animated mode only. Sourced from active IMG.

- **DOM**: same shell. Body `.cg-vid-preview` is a 16:9 frame with a centered ▶ overlay (color `--sock-video` purple). Inline steppers `duration` / `model`.
- **Sockets**: in/out, type `video`. Color `--sock-video` (purple).
- **Variant tray** (P06): mirror of IMG tray. Label `Vid ${sceneIdx+1}.${tab}.${imgIdx} · ${count} variants`. Dashed border.
- **Thumb strip** (P06): videos filtered by `sourceImageInstanceId === activeImg.id`. Each thumb has play-mark overlay. Click → `CanvasState.setVideoRenderActive`. `+` → `vidActions.addVariation`.
- **Mode swap**: illustrated → animated reveals the VID column tray; animated → illustrated hides it without orphaning data (`videoInstances` array preserved on scene).
- **Right-click**: `vid-regen / vid-add / vid-dl / vid-delete`.

### 5.4 BGM (Audio) node

Singleton per project. Type `audio`.

- **Sockets**: in/out type `audio` (teal/mint, NOT cyan — ADR-1).
- **Body**: stepper `style` (Lyria | Library | Skip), stepper `volume`.
- **Right-click**: `bgm-compose / bgm-library / bgm-skip / bgm-reset`.
- **Hidden when** `g.job.bgmSkipped === true`.
- **Status dot**: pending until generated.

### 5.5 Subtitle node

Singleton. Type `audio` for in-edge; type `final` for out-edge.

- **Body**: language picker + format picker.
- **Hidden** when audio/sub skipped.

### 5.6 Final (Render) node

Singleton. In-socket type `final`. No out-socket.

- **Body**: stepper resolution / fps; `▶ Render` button calls `finalActions.render`.

### 5.7 Launch node

Animated mode only. Sits between IMG column and VID column. Aggregates all ⭐ images for video-gen kickoff. Click triggers `launchImageAgent` (or its animated counterpart).

- **In-socket**: aggregates ⭐ images; curves drawn from each ⭐ image's right edge to launch's left edge.
- **Out-socket**: type `video`.

---

## 6. Chrome rebuild

All chrome lives in `index.html` already (lines 2496–2564). The CSS in `css/canvas-graph.css` styles those static IDs. **Chrome does NOT live inside `#graph`** — it lives outside the zoom-transformed layer (ADR-9).

| Element | DOM ID (already in index.html) | What rebuild styles |
|---|---|---|
| Top action pill         | `#cg-top-pill`         | bg = `--lp-card`, blur `var(--cg-pill-blur)`; primary button uses `--lp-accent`; danger uses `--red` / `--cg-danger`; status dot pulses `--lp-accent` |
| Progress strip          | `#cg-progress-strip`   | top-right; `hidden` toggled by `chromeShow/HideProgress`; bar fill = `--lp-accent` |
| Telemetry               | `#cg-telemetry`        | bottom-left; mono font; text `--lp-faint` |
| Zoom dock               | `.cg-zoom-dock`        | bottom-right; cursor-mode dropdown (Select / Pan / Connect-disabled); zoom-pct dropdown; Fit / Minimap (stub) / Reset |
| Selection toolbar       | dynamically created    | INSIDE `#graph`; counter-scaled via `--cg-zoom`; bg = `--lp-card` glass |
| Context menu            | dynamically created    | OUTSIDE `#graph` (clientX/clientY); bg = `--lp-card` |
| Agent panel             | `#create-agent-panel`  | restyled — translucent narrow; status dots from `--sock-*` (ADR-1 collision-resolved); collapse persists in `localStorage stori_agent_panel_collapsed` |

The legacy in-renderer toolbar (`.cg-toolbar` with Tidy / − / 100% / + / Fit) and bottom pane (`.cg-bottom-pane` with chips) are **NOT** rebuilt. Tidy is no longer surfaced as a button; `tidyLayout()` API is preserved but unbound. Chips move into the Properties pane or are dropped (the warning chips remain in the band rendering itself, P02 §3 of phase doc).

---

## 7. Interactions

### 7.1 Cursor modes (FIXES THE REGRESSION)

`cgChrome.cursorMode` defaults to **`'pan'`**, NOT `'select'`. Initialization in §3 SECTION 12. The existing renderer initializes to `'select'` at line 4004; this is a bug per ADR-2 / phase 04 expectation. The rebuild MUST default to `'pan'`.

| Cursor mode | Plain drag on empty stage | Shift-drag on empty stage |
|---|---|---|
| `pan` (default) | Pan canvas (`grabbing`) | Pan canvas |
| `select` | Marquee select | Marquee select (extends current selection) |
| `connect` | reserved; disabled in dropdown | reserved |

Spacebar held = forces pan regardless of cursor mode.

### 7.2 Selection (per ADR-4)

- Single-select: click any node → `g.selectedId = id; g.selectedIds = new Set([id])`. Emit ring + selection toolbar.
- Multi-select: shift-click adds; marquee-drag selects all enclosed; shift-marquee extends.
- Click empty stage → clear `selectedId` and `selectedIds`. Does NOT clear ACTIVE flags (ADR-4).
- Esc → clears `selectedId` and `selectedIds`. Removes selection toolbar. Does NOT clear ACTIVE.

### 7.3 ACTIVE vs SELECTED

ACTIVE is persisted (`isActive` / `isRenderActive`); SELECTED is ephemeral (`g.selectedId/Ids`). Clicking a thumbnail does BOTH: sets `isRenderActive = true` AND `selectedId = thumbnailedNode.id`. Clicking empty stage clears SELECTED only. (ADR-4 §3.)

### 7.4 Keyboard

| Key | Behavior |
|---|---|
| `Space` (hold) | Force pan cursor + grab cursor |
| `F` | `fitToView()` |
| `Esc` | Clear selection |
| `Delete` / `Backspace` | Delete selected (single or multi) via `*Actions.delete`; batch confirm; singletons skip with toast |
| `R` | Regen selected IMG or reanimate selected VID |
| `1`–`9` | Jump to section (idx-1) — preserves the existing `jumpToSection` helper |

### 7.5 Mouse

| Action | Behavior |
|---|---|
| Wheel | Zoom-at-pointer; clamp [0.25, 2.5] |
| Click node | Select |
| Shift-click node | Toggle in selection set |
| Drag node header | Move (`canvasPosition` updates; redraw curves; selection toolbar follows) |
| Right-click node | Context menu at `clientX, clientY` |
| Dbl-click out-socket | Pan to next stage if exists, else `imgActions.addVariation` (SB out) / `vidActions.addVariation` (IMG out) |
| Click thumb in IMG strip | `setImageRenderActive` + select that thumb's image |
| Click thumb in VID strip | `setVideoRenderActive` + select that video |
| Click `+` thumb in IMG strip | `imgActions.addVariation` |
| Click `+` thumb in VID strip | `vidActions.addVariation` |
| Click SB tab | `setActiveStoryboard` |
| Click SB `+` tab | `sbActions.addVariant` |

### 7.6 Selection toolbar

Lives INSIDE `#graph`. Positioned 72px above the selected card's top edge (or below if the card is at the top of the viewport). Counter-scaled font via `calc(11px + 11px * (1 / var(--cg-zoom, 1)) * 0)` pattern from ADR-10. Auto-removed on click-empty / Esc / Delete. Must follow the card during drag (existing line 3313 pattern).

Toolbar items mirror the context menu for the selected node's type. Color: `--lp-card` glass + `--lp-accent` for primary buttons + `--red` / `--cg-danger` for delete.

---

## 8. Canonical action handlers

See §2.1 above for the full list. Each handler:

1. Validates `scene` / `sb` / `img` / `vid` reference is non-null.
2. Mutates state via `CanvasState` (NEVER directly).
3. Calls `CanvasState.syncMirrorFields(scene, g.mode)` if mirror state matters.
4. If layout changed (add/delete), calls `runLayout()`; in either case calls `renderAll()` and `triggerSave()`.
5. Returns whatever the existing handler returns (mostly void or boolean — see line 1166–1640 of existing renderer for verbatim contracts).

Error cases: deleting last instance returns `false` (CanvasState guards). Confirms via `window.confirm` unless `window.__cgBatchDelete === true` (set during multi-select Delete).

---

## 9. Theme & tokens

### 9.1 Aurora token reuse (ADR-1)

Every chrome / bg / border / text / accent / danger token resolves through the existing Aurora `--lp-*` palette via the `#create-page` Family A→B remap at `css/styles.css:404-418`. The rebuild MUST NOT introduce parallel `--cg-bg-*` / `--cg-text-*` etc. variables.

| Role | Token (resolves to Aurora via `#create-page` remap) |
|---|---|
| Stage bg | `--bg-base` |
| Card bg  | `--bg-elevated` |
| Pill bg  | derived; defined as `--lp-card` |
| Border   | `--border` (= `--lp-card-bdr`) |
| Border strong | `--border-strong` |
| Text     | `--text-primary` |
| Text dim | `--text-secondary` (or `--lp-faint` for chrome) |
| Accent   | `--accent` (= `--lp-accent`, Aurora cyan) |
| Danger   | `--red` (or `--cg-danger`) |

### 9.2 Net-new tokens (defined in BOTH `aurora.dark` AND `aurora.light`, ADR-12)

| Token | Dark | Light | Notes |
|---|---|---|---|
| `--sock-script` | yellow `#f5d04a` | `#c69a18` | Script type |
| `--sock-image`  | orange `#ff7a59` | `#d65b3a` | Image type |
| `--sock-video`  | purple `#b675f5` | `#8a4dc5` | Video type |
| `--sock-audio`  | teal/mint `#1ea895` (oklch-equiv dark) | `#1ea895` | **Remapped from cyan to avoid Aurora-accent collision** |
| `--sock-final`  | blue `#4a9eff` | `#2c80e6` | Final type |
| `--cg-grid-dot` | `rgba(255,255,255,0.07)` | `rgba(0,0,0,0.08)` | Dot grid alpha |
| `--cg-pill-blur`| `14px` | `14px` | Backdrop blur for chrome glass |
| `--cg-danger`   | (optional, fallback to `--red`) | (optional) | Canvas error semantic |

These tokens are already defined per ADR-1 / phase 01. The rebuild only consumes them — it does NOT redefine them in `css/canvas-graph.css`.

### 9.3 Color access in JS

All curve / overlay / status colors resolve via:

```js
function getSockColor(type) {
  return getComputedStyle(document.getElementById('create-canvas-step') || document.documentElement)
           .getPropertyValue('--sock-' + type)
           .trim();
}
```

Reading from `#create-canvas-step` ensures the `#create-page` remap is in scope (so chrome tokens resolve correctly too if needed). Auto-themes on `data-theme` toggle because `--sock-*` is defined per `[data-theme]`.

### 9.4 No hex codes anywhere downstream

Anti-pattern (do NOT do): `path.setAttribute('stroke', '#ff7a59')`. Pattern (do): `path.setAttribute('stroke', getSockColor('image'))`. Likewise for thumb gradients, badges, status dots — all via tokens or `color-mix`.

---

## 10. Layout & state versioning

### 10.1 `CANVAS_LAYOUT_VERSION = 8`

Bumped from 7 to **8** for the rebuild (per ADR-3). Geometry constants change in the rebuild because old action columns disappear, so existing scenes' saved `canvasPosition` would point to dead columns. Bumping invalidates them cleanly:

- For any scene with `_layoutVersion !== 8`, `runLayout()` wipes `canvasPosition` for sb / img / vid AND wipes `g.launchPos` / `g.bgmPos` / `g.subPos` / `g.finalPos`, then assigns fresh positions. Sets `_layoutVersion = 8`.
- The version write is opportunistic — first `runLayout()` call after a project load picks it up. No migration script needed.

### 10.2 Mount lifecycle (canonical order)

```
migrateAllScenes
  → ensurePendingImages
  → normalizeAll
  → syncAllMirrors
  → buildDOM
  → runLayout            (resets stale _layoutVersion, assigns positions)
  → applyTransform       (initial pan/zoom; sets --cg-zoom)
  → renderAll            (bands → nodes → chrome nodes → curves → chips)
  → cgChromeMount        (zoom dock, telemetry rAF, dropdowns)
  → attachEvents         (mouse, key, marquee, drag)
```

### 10.3 Round-trip merge fields (already correct in `js/15-project.js`)

The renderer must continue to maintain these fields on every mutation via `CanvasState.syncMirrorFields`:

- `scene.imgDataUrl` — from render-active imageInstance
- `scene.videoUrl` / `scene.videoClips` — from render-active videoInstance (animated mode)
- `scene.prompt` — from active SB

The renderer must NEVER write these directly. All mirror writes go through `CanvasState.syncMirrorFields`.

The IDs used by the round-trip are also preserved by `CanvasState`:

- `imageInstance.id` (e.g. `img-0-0`) → persisted; editor reads via `js/17d-create-languages.js:706` button `btn-create-send-editor`.
- `videoInstance.id`, `videoInstance.sourceImageInstanceId` → persisted; round-trip merge in `js/15-project.js:570/650`.

The renderer never invents IDs; it always calls `CanvasState.addImageInstance` / `addVideoInstance` / `addStoryboardInstance` which call `nextInstanceId(...)`.

---

## 11. Stub state (before rebuild)

Both files are emptied to the minimum that does NOT break the rest of the app on load.

### 11.1 `js/29-canvas-render.js` stub

```js
// ══════════════════════════════════════════
//  CANVAS GRAPH RENDERER — REBUILD STUB
//  Public API placeholder. Real renderer follows.
// ══════════════════════════════════════════
(function () {
'use strict';

window.CanvasGraph = Object.assign(window.CanvasGraph || {}, {
  mount:                () => {},
  unmount:              () => {},
  refresh:              () => {},
  notifyImageReady:     () => {},
  fitToView:            () => {},
  panToColumn:          () => {},
  tidyLayout:           () => {},
  getScenes:            () => null,
  isActive:             () => false,
  chromeShowProgress:   () => {},
  chromeHideProgress:   () => {},
  chromeSetActiveCount: () => {},
  _cursorMode:          'pan',
  _actions:             {},
});

// Empty action namespaces so callers that read window.sbActions etc. don't crash.
window.sbActions    = window.sbActions    || {};
window.imgActions   = window.imgActions   || {};
window.vidActions   = window.vidActions   || {};
window.bgmActions   = window.bgmActions   || {};
window.finalActions = window.finalActions || {};

})();
```

### 11.2 `css/canvas-graph.css` stub

```css
/* canvas-graph.css — rebuild stub. Real styles follow. */
```

After the stub is in place, the app should:
- Load without console errors.
- `openCanvasPanel` becomes a no-op visually (mount is a stub).
- `closeCanvasPanel` is a no-op.
- The existing chrome scaffolding in `index.html` (top pill, telemetry, zoom dock, progress strip) renders unstyled.
- The Back-to-storyboard button still works (it's wired in `17c-create-pipeline.js`).

This is the floor the rebuild starts from.

---

## 12. Implementation sequencing

The implementer should build the rebuild in this order so partial state is testable at each gate.

| Step | Output | Smoke test |
|---|---|---|
| 1 | Section banners + constants + singleton state stub + DOM skeleton (wrapper + graph layer + svg) | Mount to canvas; empty graph layer renders with dot grid bg in both themes. |
| 2 | `runLayout` + `applyTransform` + initial view + `cgChromeMount` (chrome already in DOM) | Mount; chrome is visible and theme-aware; pan with spacebar works; zoom-pct updates on wheel. |
| 3 | SB node build + update + place + select | One scene shows one SB card; click selects (1px accent ring); drag header moves card. |
| 4 | IMG node build + update + variant tray + thumb strip | Click thumb in strip → render-active flips; ACTIVE pill moves; tray label updates. |
| 5 | Curves (SB → IMG only) + hover-dim | Hovering SB or IMG dims unrelated curves; curve color = orange (Aurora `--sock-image`). |
| 6 | VID node + tray + thumb strip + IMG → VID curves | Animated mode shows full active path; mode swap shows/hides VID column. |
| 7 | BGM / Sub / Final / Launch nodes + chains to curves | Full active path SB→IMG→VID→BGM→Sub→Final draws. |
| 8 | Pan / zoom / fit / panToColumn | All mouse/keyboard interactions; agent panel row click pans. |
| 9 | Marquee select + multi-select Delete | Drag empty stage in select mode (or shift-drag in pan mode); marquee selects intersecting nodes. |
| 10 | Context menu + selection toolbar + Esc/Click-empty clear | Right-click any node opens menu; click sets toolbar 72px above; Esc removes both. |
| 11 | Canonical *Actions registration (sb/img/vid/bgm/final) | Each toolbar / menu item runs the correct handler; Delete-key batch confirm works. |
| 12 | `notifyImageReady` + chrome progress hooks + active count | Run pipeline; placeholders flip to images one-by-one; progress strip animates; "N active" updates. |
| 13 | Steppers wired + persistence via syncMirrorFields | Edit duration / aspect / seed / model; reload project; values survive. |
| 14 | tidyLayout + fitToView + LAYOUT_VERSION migration | Load a project saved under V7; `runLayout` resets stale positions; nodes re-place cleanly. |
| 15 | Properties pane restyle (right pane content stays; only chrome) | Pane translucency / dense rows; both themes. |

Each step ends with: visual check in `aurora.dark` AND `aurora.light` (ADR-12), no console errors, no FOUC on theme toggle.

---

## 13. Acceptance criteria

### 13.1 Functional acceptance — every prior public API call still works

- `CanvasGraph.mount('create-canvas-step', createScenes, mode, opts)` — mounts visibly.
- `CanvasGraph.unmount('create-canvas-step')` — tears down cleanly; no leaked listeners (verify with `getEventListeners` in DevTools after unmount).
- `CanvasGraph.notifyImageReady(idx)` — placeholder image flips to real image without full re-render.
- `CanvasGraph.isActive()` — returns `true` between mount and unmount.
- `CanvasGraph.fitToView()` / `CanvasGraph.panToColumn(colKey)` / `CanvasGraph.tidyLayout()` / `CanvasGraph.refresh()` — all run without errors.
- `CanvasGraph.chromeShowProgress(t,n)` / `chromeHideProgress()` / `chromeSetActiveCount(n)` — chrome reflects.
- `CanvasGraph._actions.{deleteSB, deleteImage, deleteVideo, regenImage, ...}` — all callable.
- `window.sbActions`, `imgActions`, `vidActions`, `bgmActions`, `finalActions` — all present with all handlers from §2.1.

### 13.2 Visual acceptance — every spec section renders correctly in BOTH themes

- Dot grid background: `--cg-grid-dot` resolves correctly in both themes.
- Top pill / progress strip / telemetry / zoom dock: glass blur readable; primary button = Aurora cyan; danger = `--red`.
- Agent panel: 5 socket-color status dots distinguishable from each other and from accent in both themes.
- Node card chrome: 1px Aurora-cyan selection ring (no glow / no shadow / no scale).
- Sockets: 5 colors clearly visible in both themes against card bg.
- Curves: 5 type colors with adequate contrast against dot grid in both themes; auto-theme on toggle.
- Variant trays: dashed border visible in both themes.
- ACTIVE pill chip: readable in both themes.
- `.has-vids` thumb border: visibly different from default border in both themes.
- VID badge: purple-on-dark vs purple-on-light both readable.
- Marquee fill: subtle accent tint visible in both themes.
- Selection toolbar / context menu: glass readable in both themes.

### 13.3 Behavioral acceptance

- **Cursor default = pan** (regression fix). Plain drag on empty stage pans.
- Scroll-wheel zoom-at-pointer; clamp [0.25, 2.5].
- Click node selects; Shift-click multi-selects; marquee (in select mode or shift-drag) replaces / extends selection.
- Esc clears selection; does NOT clear ACTIVE.
- Delete key with selection → batch confirm → canonical *Actions.delete; singletons (Launch / BGM / Sub / Final) get toast and skip.
- Tab click on SB → `setActiveStoryboard`; IMG tray morphs.
- Thumb click on IMG strip → `setImageRenderActive`; ACTIVE IMG card body swaps; VID tray morphs.
- Thumb click on VID strip → `setVideoRenderActive`; ACTIVE VID card body swaps.
- Right-click any node → type-appropriate context menu.
- Selection toolbar 72px above selected card; mirrors menu; counter-scales font readable at zoom 0.25.
- Dbl-click out-socket → pan to next stage if exists, else create variant.
- `F` fits to view.
- `1`–`9` jumps to section.
- Theme toggle repaints sockets, curves, chrome without page reload.

### 13.4 Round-trip acceptance

1. Open project; canvas mounts; pipeline generates images; placeholders flip via `notifyImageReady`.
2. Click ⭐ on an image; click Launch; videos generate; VID nodes flip to ready.
3. Click `btn-create-send-editor` (`js/17d-create-languages.js:706`); editor reads `imageInstanceId` / `videoInstanceId`.
4. Editor edits a scene's clip; user clicks back-to-canvas; edits land in `js/15-project.js` round-trip merge.
5. User swaps active variant in canvas; clicks send-to-editor again; previously-edited clip survives the merge (matches by `(sceneIdx, imageInstanceId | videoInstanceId)`).

### 13.5 No vestigial DOM

After mount, `body.canvas-active` mode shows ONLY:

- Chrome: `.cg-top-pill`, `.cg-progress-strip`, `.cg-telemetry`, `.cg-zoom-dock`, `#create-agent-panel` (restyled).
- Graph layer: `.cg-graph-layer` containing `<svg class="cg-svg">` + `.cg-node` (×N) + `.cg-variant-tray` (×N) + `.cg-thumb-strip` (×N) + `.cg-band` (×N) + `.cg-marquee` (only during drag).
- Selection UI: `.cg-sel-toolbar` (only when something is selected); `.cg-context-menu` (only while open).
- Right pane: `.cg-right-pane` with restyled Properties + Preview.

The following classes MUST NOT appear in any rebuild output (they're vestigial):

- `.cg-actions-col` (left action column)
- `.cg-img-actions` (in-card 2x2 button grid)
- `.cg-band-warn-chip` (replaced by band-internal warning rendering)
- `.cg-toolbar` (legacy top toolbar — chrome is now in index.html)
- `.cg-bottom-pane` (legacy chip strip)
- Any duplicated selection-glow class on `.cg-node-selected`

Verify with: `document.querySelector('.cg-actions-col, .cg-img-actions, .cg-toolbar, .cg-bottom-pane') === null` after mount.

---

## 14. Risks & verify-before-implementing

The implementer MUST grep the existing code before relying on these claims. Each risk lists the specific verification.

| # | Risk | Verify by reading |
|---|---|---|
| 1 | `notifyImageReady` is called per-scene-flip and expects `g.scenes[sceneIdx]` to be the live array (NOT a copy) | `js/17c-create-pipeline.js:2735, 2757` (caller); `js/29-canvas-render.js:171-190` (current implementation) |
| 2 | `_actions` namespace is read by external callers? | `grep -n "CanvasGraph._actions" js/` — current grep shows only the renderer registers + reads. Internal-only. Safe to rebuild as-is. |
| 3 | `panToColumn` colKey vocabulary | existing renderer line 3965-3989 enumerates `'sb' \| 'img' \| 'vid' \| 'bgm' \| 'sub' \| 'final'`; agent panel callers pass these strings literally |
| 4 | `_cursorMode` reader outside renderer? | `grep -n "_cursorMode" js/` — only the renderer assigns at line 4041. Safe to keep as a mirror. |
| 5 | `tidyLayout` external caller? | `grep -n "tidyLayout" js/` — only internal Tidy button (which goes away in P02). API kept for safety; can become a no-op-but-callable if necessary. |
| 6 | `getScenes` external caller? | `grep -n "CanvasGraph.getScenes\|getScenes()" js/` — none in `js/` outside the renderer itself. Kept for safety. |
| 7 | Project-load-pre-rebuild user data shape | `js/15-project.js:479, 570, 650, 1247` — keys `sceneIdx`, `imageInstanceId`, `videoInstanceId`, `sourceImageInstanceId`, `clipIdx` are persisted. `CanvasState.migrateAllScenes` is idempotent (js27:42-63 short-circuits when `storyboardInstances` already exists). LAYOUT_VERSION bump only resets `canvasPosition`, NOT instance data. |
| 8 | Agent panel collapse state persistence | existing localStorage key `stori_agent_panel_collapsed`; restyle in P03 keeps the same key. Verify in `index.html:21` (FOUC-safe collapse) before changing. |
| 9 | `generateRunning` cancel hook | `js/17c-create-pipeline.js:3334-3336` — sets `generateRunning = false`; loops in `runImageGeneration` check the flag at every iteration. No AbortController on in-flight HTTP. Document as known limitation. |
| 10 | rAF probe lifecycle | `cgChromeMount` starts; `cgChromeUnmount` MUST `cancelAnimationFrame(cgChrome.rafId)`. Existing renderer line 4008-4060 throttles to ~10Hz. |
| 11 | Mid-flight generation when canvas re-mounts | `g.scenes` is the same array reference as `createScenes`; re-mount sees in-progress `status` flips. `notifyImageReady` continues to fire; rebuild `updateImgNode` must handle `pending → generating → done → error` without leaking listeners. |
| 12 | Illustrated vs animated mode swap mid-session | `closeCanvasPanel` + reopen in different mode → `unmount` then `mount` with different `mode` arg. Rebuild MUST handle clean teardown of VID column DOM when illustrated mode mounts. |
| 13 | Empty scenes (zero-length scenes array) | `CanvasGraph.mount(id, [], mode, opts)` — `runLayout` short-circuits on empty sortedScenes; `renderAll` paints chrome nodes only. Verify no NaN in `g.graphH` (initialize curY = 20 even when no bands). |

---

## 15. Anti-pattern catalogue (do NOT carry over)

The implementer should read these existing renderer regions ONLY to confirm what NOT to reproduce.

| Anti-pattern | Location in existing renderer | Why drop |
|---|---|---|
| Cursor-mode default `'select'` | line 4004 (`cursorMode: 'select'`) AND line 4237 (`_cursorMode: 'select'`) | Comment at line 3246-3248 claims default is pan; code says select. Pan default is the correct behavior per ADR-2 / phase 04. |
| `.cg-actions-col` left action column | search `cg-actions-col` in the file | Replaced by context menu + selection toolbar (ADR-6). |
| `.cg-img-actions` 2x2 in-card button grid | search `cg-img-actions` | Same — actions go through ADR-6 channels. |
| `.cg-toolbar` top toolbar | line 198 (`mk('div', 'cg-toolbar')`) | Replaced by `index.html` top pill (P02). |
| `.cg-bottom-pane` legacy chip strip | line 265 (`mk('div', 'cg-bottom-pane')`) | Dropped; chips move to band rendering or properties pane. |
| Hardcoded hex curve strokes | Any `path.setAttribute('stroke', '#...')` | Use `getSockColor(type)` reading `--sock-*` (ADR-1). |
| Mode-conditional special cases | search `g.mode === 'illustrated'` and `g.mode === 'animated'` | Many can collapse via the ADR-2 unified `isRenderActive` flag system. Only mode-specific rendering (curve to BGM, VID column visibility) should remain mode-conditional. |
| Dual selection-glow on `.cg-node-selected` | inspect `.cg-node-selected` rules in `css/canvas-graph.css` | Single 1px Aurora-cyan ring, no glow / no shadow / no scale (per phase 04 §3(c)). |
| `.cg-band-warn-chip` band warning chips | search class | Folded into renderBands inline. |
| Hardcoded `CANVAS_LAYOUT_VERSION = 7` | line 20 | Bump to 8 in rebuild. |

---

## 16. Cross-references

The rebuild's design rationale lives in:

| Topic | Source |
|---|---|
| Theme tokens / Aurora reuse / `--sock-*` palette | `devDoc/phase-01-theme-tokens.md`, `devDoc/adr/ADR-001-theme-token-namespace.md`, `devDoc/adr/ADR-012-light-mode-parity.md` |
| Floating chrome (top pill / zoom dock / progress / telemetry) | `devDoc/phase-02-floating-chrome.md`, `devDoc/adr/ADR-009-zoom-invariant-chrome.md` |
| Agent panel restyle | `devDoc/phase-03-agent-panel-restyle.md` |
| Node shell / sockets / curves / selection ring | `devDoc/phase-04-node-shell-and-curves.md`, `devDoc/adr/ADR-002-active-path-source-of-truth.md`, `devDoc/adr/ADR-003-canvas-layout-version-bump.md`, `devDoc/adr/ADR-004-active-vs-selected.md` |
| SB tabs + IMG variant tray + thumb strip | `devDoc/phase-05-sb-tabs-and-img-tray.md`, `devDoc/adr/ADR-005-variant-tray-rendering.md` |
| VID variant tray + pipeline glue | `devDoc/phase-06-vid-tray-and-pipeline-glue.md`, `devDoc/adr/ADR-006-action-pipeline-integration.md`, `devDoc/adr/ADR-007-backwards-compat-saved-projects.md` |
| Card interactions / context menu / selection toolbar / steppers | `devDoc/phase-07-card-interactions.md`, `devDoc/adr/ADR-006-action-pipeline-integration.md`, `devDoc/adr/ADR-010-font-zoom-counter-scale.md` |
| QoL / build pipeline / LAYOUT_VERSION bump | `devDoc/phase-08-qol-and-shipping.md`, `devDoc/adr/ADR-008-build-pipeline.md`, `devDoc/adr/ADR-011-specificity-guard.md` |
| Phase × ADR matrix and dependency DAG | `devDoc/00-phase-index.md` Part 7 |

The visual + interaction reference: `canvas-redesign-mock.html` (illustrative — color values are placeholders; production reads from Aurora).

---

## 17. Out-of-band items (carry forward, do not relitigate)

These are decisions the rebuild inherits without revisiting:

- `CANVAS_SCHEMA_VERSION = 1` (data model). Owned by `CanvasState`. Renderer never bumps this.
- `CANVAS_LAYOUT_VERSION = 8` (geometry). Owned by renderer. Bumped per ADR-3.
- `localStorage` keys: `stori_agent_panel_collapsed`. Renderer reads / writes via existing helper.
- Project autosave debounce: existing `triggerSave` calls `projectAutosave` (defined elsewhere); renderer keeps the same call pattern.
- `--cg-zoom` CSS variable: written by `applyTransform`; read by counter-scaled UI (selection toolbar, future zoom-invariant elements). ADR-10.
- `#create-canvas-step` is the mount target. The renderer never assumes any other container.
- `body.canvas-active` class is owned by `js/17c-create-pipeline.js` (`openCanvasPanel` / `closeCanvasPanel`). Renderer never adds / removes this class.
- The build pipeline — when the rebuild is shipping, ADR-8 says inline `canvas-graph.css` via `build.js`. That migration is part of phase 08 deliverable; it can happen in the same PR as the rebuild or a follow-up. The rebuild itself does NOT modify `build.js`; if a separate task is needed, it's filed separately.

---

## 18. Sign-off summary

After review of this plan and approval, the implementer agent will:

1. Empty `js/29-canvas-render.js` to the §11.1 stub.
2. Empty `css/canvas-graph.css` to the §11.2 stub.
3. Smoke test: app loads, no console errors, `body.canvas-active` mode visually empty, Back-to-storyboard works.
4. Build the rebuild in §12 sequence.
5. Verify §13 acceptance gates at each milestone.
6. NO commits during steps 1–5; user reviews and stages changes.

This document is the contract between the architect and the implementer. Any deviation requires a written addendum here BEFORE coding it.
