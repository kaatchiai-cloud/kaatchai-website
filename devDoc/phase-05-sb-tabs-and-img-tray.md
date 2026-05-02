# Phase 05 — SB Tabs + IMG Variant Tray + Thumbnail Strip

> Slug: `sb-tabs-and-img-tray` · Duration: M · Depends on: P04 · Successors: P06, P07

## 1 — Scope

Deliver multi-storyboard tabs A/B/+ on SB nodes and the IMG variant tray (dashed wrapper + ACTIVE card + thumbnail strip with vid-count badges + has-vids border + add tile) bound end-to-end to the real `isActive` / `isRenderActive` data model. All tray/thumb chrome derives from Aurora; `.has-vids` border uses `color-mix` against Aurora-derived `--border`.

**In scope:**
- SB tab strip `[A][B][+]` in `node-head` (mock:264–276).
- IMG variant tray (dashed wrapper) per storyboard.
- ACTIVE IMG card with `ACTIVE` pill, image preview, inline ratio + seed steppers.
- IMG thumbnail strip with `▶N` vid-count badges, `.has-vids` border, `+` add tile.
- Click-tab → `setActiveStoryboard`; click-thumb → `setImageRenderActive`; `+` tab → `addStoryboardInstance`; `+` thumb → `addImageInstance`.
- Curves redraw on active swap (via P04's `redrawCurves`).

**Out of scope:**
- VID variant tray (P06).
- Pipeline glue for actually generating new images / videos (P06 introduces `vidActions.addVariation`; image add wires through existing `addImageInstance` + existing image-gen pipeline).
- Context menus / selection toolbar / inline-stepper handlers wired to canonical action handlers (P07 — this phase ships the inline steppers' DOM and visual chrome but the handler binding goes through whatever exists today; P07 consolidates).
- Right-click / Delete-key (P07 / P08).

## 2 — Goals & non-goals

**Goals:** SB tabs and IMG tray are bound to the real `isActive` / `isRenderActive` schema (per ADR-2); morphing on tab/thumb click works correctly; all chrome derives from Aurora `--lp-*` tokens.

**Non-goals:** new pipeline calls; new schema fields; fixing pre-existing bugs in `addImageInstance`.

## 3 — Architecture & approach

**Active-path source of truth (per ADR-2):** the schema is `scene.storyboardInstances[].imageInstances[]` (nested) with `videoInstances[]` FLAT on `scene` joined via `sourceImageInstanceId`. Active flags (per `js/27-canvas-state.js:23–26` header doc):
- `storyboard.isActive` — RADIO (one per scene)
- `imageInstance.isActive` — MULTI-SELECT ("⭐ Use for video gen")
- `imageInstance.isRenderActive` — RADIO (illustrated mode chosen render)
- `videoInstance.isRenderActive` — RADIO (animated mode chosen render)

Mock's `activeXxxIdx` numeric idx fields (mock:730–752) are **illustrative only**; production uses the flag model.

**SB tabs** — append to `node-head` in `buildSBNode` (29:523) / `updateSBNode` (29:585):
- One `<button class="sb-tab">A</button>` per storyboard instance, in canvas-order
- `.sb-tab.active` for the one with `isActive === true`
- `<button class="sb-tab sb-tab--add">+</button>` at the end
- Click `.sb-tab` → `CanvasState.setActiveStoryboard(scene, sbId)` (js27:222) → re-render
- Click `+` → `CanvasState.addStoryboardInstance(scene, opts)` (js27:245) → re-render

**IMG variant tray** — wraps the ACTIVE IMG card + thumb-strip:
- Outer container `.variant-tray.variant-tray--img` with `border: 1px dashed var(--border-strong)` (which is `--border-hover` = `--lp-card-bdr-h`; verify naming, mock uses `--border-strong`)
- Tray label top-left: `<div class="tray-label">Img N · k variants</div>` where N is storyboard tab letter, k is `imageInstances.length`
- Tray rectangle auto-sizes via flex-column wrapping: tray's `display: flex; flex-direction: column; gap: 8px` and the IMG card + thumb-strip are children. **Verify before implementing**: this works because `runLayout` (29:265) places the ACTIVE IMG card; the tray wraps around it; if `runLayout` instead places child cards individually (not wrapping), the tray needs a manual bounding-box calc — flag and resolve.

**ACTIVE IMG card** (mock:306–313):
- `ACTIVE` pill chip top-right corner: `color-mix(in oklch, var(--accent) 12%, transparent)` with cyan accent text
- Image preview (existing functionality from `updateImgNode`)
- Inline ratio + seed steppers (DOM only; handlers in P07)
- ACTIVE = imageInstance with `isRenderActive === true` for that storyboard (illustrated mode)

**Thumbnail strip** (mock:315–366):
- Wrap-grid 56×36 thumbs, gap 6px, padding 10px×12px
- Each thumb shows the index number
- `.has-vids` modifier when `videoInstances` filtered by `sourceImageInstanceId` is non-empty: border = `color-mix(in oklch, var(--sock-video) 60%, var(--border))`. **Per ADR-12, verify mix percentage in BOTH themes**; tune separately if needed.
- `.vid-badge` (mock:343–353): `▶N` count chip bottom-right of thumb; bg = `color-mix(in oklch, var(--sock-video) 80%, var(--bg-elevated))`; count = `(scene.videoInstances || []).filter(v => v.sourceImageInstanceId === imgId).length`
- `.thumb.add`: dashed `+` tile, calls `CanvasState.addImageInstance(scene, sbId, opts)` (js27:276) on click; **per ADR-6, this phase introduces the `imgActions.addVariation` canonical wrapper** that wraps `addImageInstance` plus the existing image-gen pipeline call (verify which existing call site triggers image generation — most likely a function inside `js/17c-create-pipeline.js`)

**Click-thumb interaction** (per ADR-4):
- Click on a thumb → both ACTIVE and SELECTED in one gesture
- `CanvasState.setImageRenderActive(scene, imgId)` (js27:234)
- Re-render IMG ACTIVE card and VID tray below it (VID tray DOM is added in P06; until then, just re-render IMG card)
- Curves redraw via `redrawCurves` (P04) since active path changed

## 4 — Files touched

| File | Change |
|---|---|
| `js/29-canvas-render.js` | `buildSBNode` (L523) — append SB tab strip to `node-head` |
| `js/29-canvas-render.js` | `updateSBNode` (L585) — sync tab `.active` class to `isActive`; insert/remove tabs as instances added/removed |
| `js/29-canvas-render.js` | New helper `buildImgVariantTray(sb)` — returns DOM for the dashed tray + thumb strip; called from the SB-IMG render pass |
| `js/29-canvas-render.js` | New helper `buildImgThumbStrip(sb)` — wrap-grid of thumbs + add-tile |
| `js/29-canvas-render.js` | `buildImgNode` (L623) — add the `ACTIVE` pill chip if `img.isRenderActive`; add inline-stepper DOM scaffolding (handlers in P07) |
| `js/29-canvas-render.js` | `updateImgNode` (L675) — sync `ACTIVE` pill visibility to `isRenderActive`; sync stepper values |
| `js/29-canvas-render.js` | New canonical `imgActions.addVariation(scene, sbId)` wrapper around `addImageInstance` + image-gen call (per ADR-6) |
| `js/29-canvas-render.js` (or layout module) | Verify `runLayout` knows to place SB+IMG-tray as a column; if not, adapt — flag if it requires structural work beyond this phase |
| `css/canvas-graph.css` | `.sb-tab` rules (pill bg = `--lp-card`, active state = `color-mix(in oklch, var(--accent) 18%, transparent)` + accent text, padding/border-radius) |
| `css/canvas-graph.css` | `.variant-tray--img` rules (dashed border, tray label chip) |
| `css/canvas-graph.css` | `.thumb` rules (56×36, padding, border, hover) + `.thumb.has-vids` + `.thumb .vid-badge` + `.thumb.add` |
| `css/canvas-graph.css` | `.variant-pin.variant-pin--active` (= ACTIVE pill chip): bg = cyan tint, text = `--accent`, mono font |
| `css/canvas-graph.css` | Apply `#create-canvas-step` prefix per ADR-11 on any rule that targets `<button>` / `<input>` |
| `js/27-canvas-state.js` | (verify only — should not need changes since CRUD APIs already exist at L222/234/245/276) |

## 5 — Work breakdown

1. **Verify before implementing**:
   - Read `js/27-canvas-state.js:222–346` to confirm CRUD API signatures and return values.
   - Read `js/29-canvas-render.js:523–815` to understand current SB / IMG node build/update flow.
   - Read `runLayout` (29:265) to confirm how it handles SB → IMG layout (does it place each card by `canvasPosition`, or compute a column?).
   - Find the existing image-generation call site (the function that, given a storyboard + image-instance, kicks off image generation). Most likely in `js/17c-create-pipeline.js`; document the exact function name in this phase doc.
   - Confirm there's no existing `imgActions.addVariation` (per ADR-6 inventory: there isn't).
2. Build the SB tab strip; wire `setActiveStoryboard` and `addStoryboardInstance`.
3. Build the IMG variant tray; ensure `runLayout` integration works.
4. Build the IMG thumb strip with vid-badge, `.has-vids`, and `.add` tile.
5. Wire click-thumb to `setImageRenderActive` + re-render.
6. Add the `ACTIVE` pill chip on the active IMG card.
7. Introduce `imgActions.addVariation` canonical wrapper.
8. Wire `+` thumb tile to `imgActions.addVariation`.
9. CSS pass with Aurora token bindings.
10. Manual smoke in both themes.

## 6 — Acceptance criteria

(a) SB nodes render the `[A][B][+]` tab strip in `node-head` (per mock:264–276). Click tab → `CanvasState.setActiveStoryboard` (js27:222), re-render IMG tray. "+" → `CanvasState.addStoryboardInstance` (js27:245). Tab pill colors derive from `--lp-card` (inactive) / `--accent` tint (active).

(b) Each storyboard's IMG tray (dashed `.variant-tray`, mock:278–292) wraps the ACTIVE IMG card + thumb-strip; tray label reads `Img N · k variants`; tray border = `1px dashed var(--border-strong)` (Aurora-derived). Tray rectangle auto-sizes to wrap content (mechanism documented — flex-column wrap, NOT hand-placed).

(c) ACTIVE IMG card shows the `ACTIVE` pill (mock:306–313) using `color-mix(in oklch, var(--accent) 12%, transparent)` (Aurora cyan tint) and the image preview / inline ratio + seed steppers. ACTIVE = imageInstance with `isRenderActive === true` for that storyboard (illustrated mode) per ADR-2.

(d) Thumb strip renders all sibling images as 56×36 numbered thumbs (mock:315–340). Click thumb → `CanvasState.setImageRenderActive` (js27:234), re-render IMG ACTIVE card and VID tray below it (VID tray comes in P06). "+" tile → `imgActions.addVariation` canonical handler introduced in this phase per ADR-6.

(e) Each thumb shows the `▶N` `vid-badge` count (mock:343–353) sourced from `(scene.videoInstances || []).filter(v => v.sourceImageInstanceId === imgId).length` (the FLAT schema join, ADR-2); badge bg = `color-mix(in oklch, var(--sock-video) 80%, var(--bg-elevated))`. Thumbs with N > 0 carry the `.has-vids` purple-tinted border via `color-mix(in oklch, var(--sock-video) 60%, var(--border))`. **Verify the mix percentage produces a visible-but-subtle border in BOTH `aurora.dark` AND `aurora.light`; tune per theme if needed.**

(f) Switching active SB morphs IMG tray + VID tray below it; switching active IMG morphs VID tray. Curves redraw to follow the new active path (P04's `redrawCurves` is sufficient).

(g) Clicking a thumb sets that variant ACTIVE and SELECTED in the same gesture per ADR-4.

(h) **Verify in BOTH `aurora.dark` AND `aurora.light`** per ADR-12: tray dashed border visible in both themes; ACTIVE pill chip readable in both; vid-badge count chip readable in both (purple-on-dark vs purple-on-light); `.has-vids` border distinguishable from the default border in both.

## 7 — Manual test plan (BOTH themes)

| Step | Expected (dark) | Expected (light) |
|---|---|---|
| 1. Load scene with 1 SB | Tab strip shows `[A][+]`; A is active | n/a |
| 2. Click `+` tab | New SB B added; tab strip = `[A][B][+]`; B becomes active; IMG tray morphs | same |
| 3. Click tab A | A active again; IMG tray morphs back; curves redraw | same |
| 4. Inside A's IMG tray, see 3 image thumbs | Numbered 1/2/3; ACTIVE card shows `isRenderActive` image with cyan tint pill | same |
| 5. Click thumb 2 | ACTIVE pill moves to image 2's preview; thumb 2 becomes selected | same |
| 6. Click `+` thumb tile | New image instance added; image-gen pipeline triggers (P07 will polish handler; P05 just verifies wiring) | same |
| 7. Verify vid-badge on thumb 1 | If `videoInstances` filter = 2, badge shows `▶2` | same |
| 8. Verify `.has-vids` border on thumb 1 | Subtle purple-tinted border (different from thumb 2's plain border) | verify mix % works on light card |
| 9. Toggle to light | Tray dashed border visible; ACTIVE pill cyan tint visible; vid-badge purple-on-white-card readable | n/a |
| 10. Side-by-side: active-tab pill (cyan tint) vs ACTIVE pill (cyan tint) — both cyan, distinct contexts | OK | OK |

## 8 — Rollback plan

Revert the SB tab DOM, the IMG tray helper, the thumb-strip helper, the `ACTIVE` pill, the `imgActions.addVariation` wrapper, and the CSS additions. Schema is unchanged — no data rollback.

## 9 — Risks & mitigations

| Risk | Mitigation |
|---|---|
| `runLayout` doesn't naturally wrap SB+IMG into a column | Verify before implementing; if structural change needed, flag and consider deferring to P08 |
| Existing image-gen call site is not factored as a callable function | Wrap whatever exists; if it's inline in a button-handler, extract a function in `imgActions.addVariation` (ADR-6) |
| `color-mix` browser support gap | Aurora already uses `color-mix`; if production targets don't support it, tokens cascade to fallback via the `var()` chain. Verify target browser matrix. |
| `.has-vids` mix produces invisible border on light | Tune light value separately; ADR-12 gates this |
| ACTIVE pill chip washes out on light cards | Cyan-on-white is more distinct than cyan-on-dark; verify visually |
| Tray dashed border collides with `.node` border | Tray is the parent of `.node`; nested borders OK; verify visually |
| Click-thumb double-fires (sets active AND triggers default browser focus) | `e.preventDefault()` + `e.stopPropagation()` on thumb handler |

## 10 — Open questions (for engineer to verify before implementing)

| # | Question | File / line |
|---|---|---|
| 1 | What's the exact existing image-generation call site for "add variation"? | grep `addImageInstance` callers + image gen calls in `js/17c-create-pipeline.js` |
| 2 | Does `runLayout` (29:265) place SB+IMG as a column, or are they hand-positioned by `canvasPosition`? | read 29:265+ |
| 3 | What is the Aurora light value for `.has-vids` mix percentage? Does 60% on light produce a visible border? | visual verify |
| 4 | Does `addStoryboardInstance` (js27:245) auto-set the new instance to `isActive`? | read function body |
| 5 | Does `addImageInstance` (js27:276) auto-set the new instance to `isRenderActive`? | read function body |
| 6 | Does mock-style `--border-strong` map to Aurora's `--lp-card-bdr-h` or to a new value? | confirm in P01's token table; if undefined, define in P01 mapping |
| 7 | Is there a maximum number of SB tabs? (UX: at 5+ tabs the strip may overflow `node-head`) | product decision; document if needed |
| 8 | When clicking a thumb, should the image preview animate the swap (fade), or hard-cut? | product decision; default: hard-cut for v1 |

## 11 — References

- Mock §11 (variant tray), §12 (ghost/add card), §13 (variant-pin/ACTIVE pill), §14 (thumbnail strip), §16 (SB body), §17 (IMG preview)
- ADR-1 (Theme tokens): `devDoc/adr/ADR-001-theme-token-namespace.md`
- ADR-2 (Active-path source of truth, schema flat join): `devDoc/adr/ADR-002-active-path-source-of-truth.md`
- ADR-4 (Active vs Selected): `devDoc/adr/ADR-004-active-vs-selected.md`
- ADR-5 (Variant-tray rendering — DOM for MVP): `devDoc/adr/ADR-005-variant-tray-rendering.md`
- ADR-6 (Action pipeline integration — `imgActions.addVariation` introduced here): `devDoc/adr/ADR-006-action-pipeline-integration.md`
- ADR-7 (Backwards compat for saved projects): `devDoc/adr/ADR-007-backwards-compat-saved-projects.md`
- ADR-10 (Font zoom counter-scale — applies to thumb labels at low zoom): `devDoc/adr/ADR-010-font-zoom-counter-scale.md`
- ADR-11 (Specificity guard): `devDoc/adr/ADR-011-specificity-guard.md`
- ADR-12 (Light-mode parity): `devDoc/adr/ADR-012-light-mode-parity.md`
- P01 token table: `devDoc/phase-01-theme-tokens.md` Section 4
- `js/27-canvas-state.js`: L222 (setActiveStoryboard), L234 (setImageRenderActive), L245 (addStoryboardInstance), L276 (addImageInstance), L315 (addVideoInstance — used in P06)
- `js/29-canvas-render.js`: L523 (buildSBNode), L585 (updateSBNode), L623 (buildImgNode), L675 (updateImgNode), L1450 (redrawCurves)
