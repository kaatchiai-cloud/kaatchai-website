# Phase 07 — Context Menu, Selection Toolbar, and Inline Steppers

> Slug: `card-interactions` · Duration: M · Depends on: P04, P05, P06 · Successors: P08

## 1 — Scope

Add right-click context menus + the floating selection toolbar (Regen / Variation / Download / Delete) above selected cards, and wire inline `◀ value ▶` steppers on every card body to the underlying instance fields. Both context menu and selection toolbar route through one canonical handler set per action (per ADR-6). Toolbar/menu chrome from Aurora `--lp-card` glass + Aurora accent for action buttons; Delete uses Aurora `--red`/`--cg-danger`.

**In scope:**
- Right-click context menu on every node type (SB / IMG / VID / BGM / Final).
- Floating selection toolbar (mock:422–436), 72px above selected card, lives inside graph layer with zoom counter-scale (per ADR-10).
- Canonical handlers: `imgActions.regen / addVariation / download / delete`, `vidActions.regen / addVariation / download / delete`, `sbActions.addVariant / delete`. Both UIs route through them.
- Inline steppers wired to underlying instance fields.
- Delete key while a card is SELECTED triggers the canonical delete handler with confirmation.
- Verified in BOTH themes per ADR-12.

**Out of scope:**
- Marquee select (P08).
- Double-click socket auto-creates next-stage node (P08).
- Properties pane content/binding changes (P08 is restyle only).

## 2 — Goals & non-goals

**Goals:** one canonical handler per action used by both the context menu AND the selection toolbar; inline steppers persist the underlying instance field; ACTIVE vs SELECTED separation upheld per ADR-4.

**Non-goals:** changing instance schema; introducing new pipeline functions (P06 already added `vidActions.addVariation`; P05 already added `imgActions.addVariation`).

## 3 — Architecture & approach

### Canonical handlers (per ADR-6)

```js
window.imgActions = {
  regen:        async (scene, sb, img) => /* wraps window.regenerateScene (17c:2814) */,
  addVariation: async (scene, sbId, opts) => /* introduced P05; reused here */,
  download:     (img) => /* wraps doDownloadImage (29:2015) */,
  delete:       (scene, sb, img) => /* wraps doDeleteImage (29:1956) with confirm */
};

window.vidActions = {
  regen:        async (scene, vid) => /* wraps existing video-regen path; verify */,
  addVariation: async (scene, sourceImgId, opts) => /* introduced P06 */,
  download:     (vid) => /* wraps existing video download or extends doDownloadImage pattern */,
  delete:       (scene, vid) => /* wraps doDeleteVideo (29:1962) with confirm */
};

window.sbActions = {
  addVariant: (scene, opts) => /* wraps addStoryboardInstance (js27:245) */,
  delete:     (scene, sbId) => /* wraps doDeleteSB (29:1950) with confirm */
};
```

These are exposed on `window` so the context-menu DOM and the selection-toolbar DOM both call them by name. **Idempotent**: calling `window.imgActions = window.imgActions || {}` first lets P05/P06's earlier `addVariation` registrations survive — this phase fills in the rest of the surface.

**Verify before implementing**:
- `window.regenerateScene` (17c:2814) exists. Does it accept `(idx)` (scene index) or `(scene, ...)`? Read signature.
- Whether a video-regen path exists. The architect prompt names `regenImage` / similar; for video, likely `regenerateScene` covers both via mode flag — verify.
- `doDeleteImage` (29:1956), `doDeleteVideo` (29:1962), `doDeleteSB` (29:1950), `doDownloadImage` (29:2015) are all closure-scoped per inventory Part 4 #6. The canonical handlers must call them via expose-to-window pattern OR via direct extraction. Read the closure structure and decide:
  - Option A: re-expose each `do*` on `window.CanvasGraph` (cleanest).
  - Option B: re-implement in the canonical handler (risk of drift).
  - Recommend Option A.

### Context menu

- Right-click any node → `event.preventDefault()`, position menu at click coords.
- Menu DOM: `<ul class="cg-context-menu">` with type-appropriate `<li class="cg-menu-item">` items. Menu bg = `--lp-card`, border = `--lp-card-bdr`, item hover = `--accent` tint (`color-mix(in oklch, var(--accent) 12%, transparent)`).
- Items per type:
  - SB: Regen / Add Variant / Delete
  - IMG: Regen / Variation / Download / Delete
  - VID: Regen / Variation / Download / Delete
  - BGM: Regen / Skip
  - Final: Render
- Lives OUTSIDE the graph layer (or on a higher z-index layer). It is **chrome** in zoom-invariance terms (per ADR-9) — should NOT counter-scale and should NOT be zoom-transformed.

### Selection toolbar

- Floating pill 72px above selected card (mock:422–436).
- Lives INSIDE the graph layer (transforms with the node). Per ADR-10, counter-scales font: button labels use `font-size: calc(11px + 11px / var(--cg-zoom, 1))` so they remain readable at zoom 0.25.
- Toolbar bg = `--lp-card` glass; border = `--lp-card-bdr`; Delete button color = `--red` (Family A) or `--cg-danger`.
- Buttons per type: same as context menu.
- Clicking a button calls the same canonical handler the menu calls.
- Hidden when no node is SELECTED.

### Inline steppers

- Existing DOM is `<div class="stepper"><span class="arr">◀</span><span class="val">3s</span><span class="arr">▶</span></div>` (P05 / P06 ship the DOM).
- This phase wires the click handlers:
  - `imgActions.setRatio(img, delta)` cycles through `['16:9', '9:16', '1:1', '4:5']`
  - `imgActions.setSeed(img, delta)` increments by 1 (or randomizes if Shift-held)
  - `vidActions.setDuration(vid, delta)` cycles `[2, 4, 6, 8]` seconds
  - `vidActions.setModel(vid, delta)` cycles available models (e.g. `['veo3', 'veo3-fast', 'kling2.5']`)
  - `sbActions.setDuration(sb, delta)`, `sbActions.setStyle(sb, delta)`
  - `bgmActions.setSource(scene, delta)` cycles `['lyria', 'library', 'skip']`
  - `bgmActions.setVolume(scene, delta)` increments 10%
  - `finalActions.setResolution(scene, delta)` cycles `['720p', '1080p', '4k']`
  - `finalActions.setFps(scene, delta)` cycles `[24, 30, 60]`
- Each handler:
  1. Reads current value
  2. Computes next value
  3. Writes to instance field
  4. Calls `CanvasState.markDirty()` or equivalent persistence trigger (verify which CRUD path persists today)
  5. Calls `update*Node` to refresh the value-text in DOM
- **Verify before implementing**: how does the project persist instance changes today? Is there a single `markDirty` / `saveProject` call, or do CRUD APIs call it internally? Document the persistence path per stepper field.

### ACTIVE vs SELECTED separation (per ADR-4)

- Click a node → SELECTED (1px ring from P04).
- Click a thumbnail → BOTH ACTIVE (`isRenderActive = true`) AND SELECTED in one gesture.
- Click empty stage → SELECTED clears, ACTIVE unchanged.
- This phase enforces the rule via the click handler chain, NOT the data model (data model has both fields independently).

### Delete key

- `keydown` listener on canvas: if key === 'Delete' or 'Backspace' AND a node is SELECTED AND active element is not a textarea/input, call canonical delete handler for that node type, with `confirm()` prompt.
- Cannot-delete-last guard: `CanvasState.deleteImageInstance` returns false if it's the only image (js29:1957 comment); honor the return value and show a toast/error message if delete is denied.

## 4 — Files touched

| File | Change |
|---|---|
| `js/29-canvas-render.js` | Expose `doDeleteImage` / `doDeleteVideo` / `doDeleteSB` / `doDownloadImage` / `doAddImageInstance` via `window.CanvasGraph._actions` (or similar internal namespace) so canonical handlers can invoke them |
| `js/29-canvas-render.js` | Author `window.imgActions`, `window.vidActions`, `window.sbActions`, `window.bgmActions`, `window.finalActions` namespaces (filling around P05/P06 registrations) |
| `js/29-canvas-render.js` | Add right-click handler on each node: build context menu DOM, position at click coords, attach click handlers to canonical actions |
| `js/29-canvas-render.js` | Add selection-toolbar DOM appended inside the graph layer; show/hide based on SELECTED state; reposition on each frame (or on `applyTransform`) |
| `js/29-canvas-render.js` | Add `keydown` listener on canvas for Delete key |
| `js/29-canvas-render.js` | Wire inline-stepper click handlers in each card's `update*Node` (or via event delegation on `#create-canvas-step .stepper`) |
| `css/canvas-graph.css` | `.cg-context-menu` rules (bg = `--lp-card`, border, item hover) |
| `css/canvas-graph.css` | `.cg-selection-toolbar` rules (bg = `--lp-card` glass, font-size with `--cg-zoom` counter-scale, position relative to selected card) |
| `css/canvas-graph.css` | `.stepper .arr` hover/active rules (color = `--accent`) |
| `css/canvas-graph.css` | `.cg-toolbar-btn--delete` rules (color = `--red` or `--cg-danger`) |
| `css/canvas-graph.css` | Apply `#create-canvas-step` prefix per ADR-11 on `<button>`/`<input>`/`<ul>`/`<li>` rules |

## 5 — Work breakdown

1. **Verify before implementing**:
   - Read `js/29-canvas-render.js:1942–2020` (the `do*` handlers) to understand each one's signature and side effects.
   - Read `window.regenerateScene` (17c:2814) signature.
   - Find the project persistence path (markDirty / saveProject).
   - Read existing inline-stepper DOM in `js/29-canvas-render.js` (P05 / P06 should have shipped DOM scaffolding).
2. Expose `do*` handlers via a namespace on `window.CanvasGraph._actions`.
3. Author canonical handler namespaces (`imgActions`, `vidActions`, `sbActions`, `bgmActions`, `finalActions`).
4. Build context menu DOM + click handlers.
5. Build selection toolbar DOM + positioning logic.
6. Wire inline steppers to canonical setter handlers.
7. Wire Delete key.
8. Wire ACTIVE-vs-SELECTED click-empty-stage clearing.
9. Verify ALL handler invocations use the canonical names — no stray `do*` calls in UI.
10. Manual smoke in both themes at zoom 0.25 / 1.0 / 2.5.

## 6 — Acceptance criteria

(a) Click-to-select on any node sets the SELECTED visual state (1px Aurora-cyan accent ring from P04). Right-click any node opens a type-appropriate context menu (SB: Regen/Add Variant/Delete; IMG: Regen/Variation/Download/Delete; VID: Regen/Variation/Download/Delete; BGM: Regen/Skip; Final: Render). Menu bg = `--lp-card` glass; menu border = `--lp-card-bdr`.

(b) Floating selection toolbar (mock:422–436) appears 72px above the selected card, mirrors the context menu items for that type. Toolbar lives inside the graph layer and counter-scales font via `--cg-zoom` per ADR-10 — readable at zoom 0.25. Toolbar bg = `--lp-card` glass; Delete button color = Aurora `--red` (or `--cg-danger`).

(c) Both UIs call canonical handlers: `imgActions.regen / addVariation / download / delete`, `vidActions.regen / addVariation / download / delete`, `sbActions.addVariant / delete`. Each handler is defined once and wraps the existing implementation (`doDownloadImage` js29:2015; `doDeleteImage` js29:1956; `doDeleteVideo` js29:1962; `doDeleteSB` js29:1950; `doAddImageInstance` js29:1942; `window.regenerateScene` js17c:2814) plus the new `vidActions.addVariation` from P06. Where a handler does not yet exist, this phase adds it per ADR-6.

(d) Inline steppers (`◀ value ▶`) are wired on every applicable card body: SB (duration, style preset), IMG (aspect ratio, seed), VID (duration, model), BGM (Lyria/Library/Skip + volume), Final (resolution/fps). Stepper chrome uses `--lp-card` + `--lp-card-bdr`; arrow hover uses `--accent`. Click `◀` decrements / `▶` increments the underlying instance field with the persistence path documented per field.

(e) Pressing Delete key while a card is SELECTED triggers the canonical delete handler with confirmation (P08 also touches this; this phase establishes the handler).

(f) Active vs Selected separation upheld per ADR-4: clicking a thumbnail makes that variant both ACTIVE and SELECTED; clicking on empty stage clears SELECTED but leaves ACTIVE alone.

(g) **Verify in BOTH `aurora.dark` AND `aurora.light`** per ADR-12: toolbar/menu glass readable in both themes; Delete `--red`/`--cg-danger` color contrast adequate in both; stepper arrow hover state visible in both; focus rings on toolbar buttons readable in both.

## 7 — Manual test plan (BOTH themes)

| Step | Expected (dark) | Expected (light) |
|---|---|---|
| 1. Click an IMG node | 1px cyan ring (selected); selection toolbar appears 72px above | n/a |
| 2. Toolbar shows Regen / Variation / Download / Delete | Glass bg; cyan accent on Regen / Variation; red on Delete | n/a |
| 3. Right-click same IMG node | Context menu opens at cursor with same items | n/a |
| 4. Click Delete in toolbar AND in menu | Same confirm dialog; same handler runs | n/a |
| 5. Press Delete key with IMG selected | Same confirm + delete | same |
| 6. Try Delete on the LAST image (only one in scene) | Delete denied; toast/error | same |
| 7. Click `◀` on duration stepper of VID card | Duration decrements; persisted; DOM value updates | same |
| 8. Click empty stage | SELECTED clears; toolbar disappears; ACTIVE unchanged (cyan ACTIVE pill remains on the active variant) | same |
| 9. Click an IMG thumbnail | ACTIVE pill moves to that thumb's image; that image's card is also SELECTED (1px ring) | same |
| 10. Zoom to 0.25 | Selection toolbar font remains ~22px (counter-scaled) | same |
| 11. Toggle to light | Toolbar/menu glass becomes white-translucent; Delete still readable red; arrow hover still visible cyan | n/a |

## 8 — Rollback plan

Revert: `imgActions / vidActions / sbActions` namespace registrations, context menu DOM/handlers, selection toolbar DOM/positioning, stepper handlers, Delete key listener. The `do*` exposure on `window.CanvasGraph._actions` is harmless to leave in place.

## 9 — Risks & mitigations

| Risk | Mitigation |
|---|---|
| Closure-scoped `do*` handlers not exposable cleanly | Use the `window.CanvasGraph._actions` internal namespace; underscore-prefixed signals "internal, not stable API" |
| Context menu and selection toolbar drift in items / behavior | Both consume the same per-type item list; build a single `getMenuItems(node)` function used by both |
| Selection toolbar at zoom 0.25 overlaps the card itself | The 72px offset is in graph-space; at low zoom, screen-space distance is smaller — verify with mock; if too close, increase to 96px |
| Stepper arrow tap target too small at low zoom | Counter-scale the arrow size as well (or just the font); test at zoom 0.25 |
| Delete confirm dialog blocks user mid-edit | `confirm()` is acceptable for v1; if UX flags this, switch to a non-blocking toast with undo |
| Keydown listener on canvas captures Delete in textareas inside cards | Check `document.activeElement.tagName` — skip if TEXTAREA/INPUT |
| Persistence path not uniform across CRUD calls | Audit each setter; if some CRUD APIs persist internally and some don't, normalize via a wrapper |

## 10 — Open questions (for engineer to verify before implementing)

| # | Question | File / line |
|---|---|---|
| 1 | Are `do*` handlers (29:1942–2020) closure-scoped? Confirm exposure path | read 29 module structure |
| 2 | What's the project persistence call? `markDirty`, `saveProject`, autosave? | grep `markDirty`, `saveProject`, `localStorage.setItem.*project` |
| 3 | Is there an existing video-regen path, or does `window.regenerateScene` (17c:2814) handle both image and video by mode? | read 17c:2814+ |
| 4 | Does an image-regen handler exist by any name? (`regenImage` per ADR-6 inventory does NOT exist) | grep `regen` in `js/17c-create-pipeline.js` and `js/29-canvas-render.js` |
| 5 | What's the right way to trigger a re-render after a stepper change? `CanvasGraph.refresh`, or per-node `update*Node`? | read public API at 29:2377 |
| 6 | Are there existing video download handlers? | grep `download.*video`, `doDownloadVideo` |
| 7 | What model list is supported for VID? | grep `veo3`, `kling`, model lists in 17c |
| 8 | What aspect-ratio list for IMG? | grep `aspect`, `ratio`, `16:9` in 17c |
| 9 | What style-preset list for SB? | product / spec ref |

## 11 — References

- Mock §10 (selected nodes), §18 (steppers), §19 (status dots), §20 (selection toolbar)
- ADR-1 (Theme tokens — toolbar/menu chrome): `devDoc/adr/ADR-001-theme-token-namespace.md`
- ADR-4 (Active vs Selected — click-empty-stage rule): `devDoc/adr/ADR-004-active-vs-selected.md`
- ADR-6 (Action pipeline integration — canonical handlers): `devDoc/adr/ADR-006-action-pipeline-integration.md`
- ADR-9 (Zoom-invariant chrome — context menu is chrome, toolbar is graph-layer): `devDoc/adr/ADR-009-zoom-invariant-chrome.md`
- ADR-10 (Font zoom counter-scale — applied here): `devDoc/adr/ADR-010-font-zoom-counter-scale.md`
- ADR-11 (Specificity guard): `devDoc/adr/ADR-011-specificity-guard.md`
- ADR-12 (Light-mode parity): `devDoc/adr/ADR-012-light-mode-parity.md`
- P05 (`imgActions.addVariation` introduced): `devDoc/phase-05-sb-tabs-and-img-tray.md`
- P06 (`vidActions.addVariation` introduced): `devDoc/phase-06-vid-tray-and-pipeline-glue.md`
- `js/29-canvas-render.js`: L1942 (doAddImageInstance), L1950 (doDeleteSB), L1956 (doDeleteImage), L1962 (doDeleteVideo), L2015 (doDownloadImage), L2020 (doPreviewImage), L2377 (window.CanvasGraph)
- `js/17c-create-pipeline.js`: L2814 (window.regenerateScene), L3216 (launchImageAgent)
