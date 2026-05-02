# Phase 06 — VID Variant Tray + Pipeline Glue (animated mode)

> Slug: `vid-tray-and-pipeline-glue` · Duration: M · Depends on: P05 · Successors: P07, P08

## 1 — Scope

Add the VID variant tray (mirror of IMG tray with play-icon overlay) for animated mode and add the missing pipeline-level `addVideoVariation` glue that wraps `CanvasState.addVideoInstance` end-to-end. All chrome from Aurora; play-icon overlay color = `--sock-video` purple in both themes.

**In scope:**
- VID variant tray DOM + chrome (mirror of IMG tray from P05; visible only in animated mode).
- ACTIVE VID card with play-icon overlay, `--sock-video` sockets, inline duration + model steppers (DOM only; handlers in P07).
- VID thumbnail strip filtered by `sourceImageInstanceId` (FLAT schema join per ADR-2).
- New canonical `vidActions.addVariation(scene, sourceImageInstanceId)` wrapper around `addVideoInstance` + existing video-gen pipeline (per ADR-6).
- Mode switch (illustrated ↔ animated): show/hide VID tray without orphaning data.
- Verified in BOTH themes per ADR-12.

**Out of scope:**
- IMG tray (P05).
- Context menus / selection toolbar / handlers wired to canonical actions (P07; this phase only ships the canonical wrapper for video add-variation).
- Right-click / Delete-key (P07 / P08).
- Properties pane (P08).

## 2 — Goals & non-goals

**Goals:** VID tray is a clean mirror of IMG tray; `vidActions.addVariation` is a single canonical handler that wraps `addVideoInstance` + video-gen pipeline (per ADR-6); animated-vs-illustrated mode switch is clean (no orphan data).

**Non-goals:** changing `addVideoInstance` (js27:315) signature; introducing new schema fields; changing video-gen pipeline internals.

## 3 — Architecture & approach

**Schema reminder (per ADR-2):** `videoInstances[]` is **FLAT on the scene**, joined to imageInstance via `sourceImageInstanceId`. This phase consumes that flat array and renders videos grouped by source image at render time.

**Mode gating:**
- `illustrated` mode: hide VID tray; the chain is SB → IMG → BGM → Final.
- `animated` mode: show VID tray; the chain is SB → IMG → VID → BGM → Final.
- Mode source: project-level mode flag (verify before implementing — most likely `project.mode` or similar; grep for the existing mode toggle in the editor UI).
- DOM behavior: VID tray DOM is always built; visibility toggled via `body.canvas-active[data-canvas-mode="animated"]` selector or per-scene class. Avoid DOM thrash on mode toggle.

**ACTIVE VID card** (mock:556–576):
- Mirrors IMG ACTIVE shape: image-area-equivalent shows the video preview poster with a play-icon overlay (SVG triangle, `--sock-video` purple)
- Sockets: in (left, `--sock-video` purple) + out (right, `--sock-video` purple) — set in P04
- Inline steppers: duration (e.g. `2s ▸ 4s ▸ 6s`), model (e.g. `Veo3 ▸ Veo3-fast ▸ Kling2.5`)
- ACTIVE = videoInstance with `isRenderActive === true` per scene per ADR-2

**VID thumbnail strip** (mock:824–826 illustrative):
- Wrap-grid same dimensions as IMG strip (56×36, gap 6px)
- Each thumb shows a play-icon mark at center (smaller than the ACTIVE card's overlay)
- Source list: `(scene.videoInstances || []).filter(v => v.sourceImageInstanceId === activeImg.id)`
- Click thumb → `CanvasState.setVideoRenderActive(scene, vidId)` (js27:240)
- `+` tile → `vidActions.addVariation(scene, activeImg.id)`

**`vidActions.addVariation` canonical wrapper (per ADR-6):**

```js
window.vidActions = window.vidActions || {};
window.vidActions.addVariation = async function(scene, sourceImageInstanceId, opts) {
  // 1. Create the instance shell
  const vid = CanvasState.addVideoInstance(scene, sourceImageInstanceId, opts);
  // 2. Trigger video generation against the existing pipeline
  //    (verify exact call site — most likely a function in 17c-create-pipeline.js
  //     that takes a video instance + source image and produces a videoUrl)
  await /* existing video-gen call */;
  // 3. Re-render canvas
  CanvasGraph.refresh();
  return vid;
};
```

**Verify before implementing**: the exact existing video-gen call site. The architect prompt names `addVideoVariation` — that does NOT exist by that name. State-level `addVideoInstance` (js27:315) exists. The pipeline-level call (whatever generates the video bytes from VEO/Kling/etc) is somewhere in `js/17c-create-pipeline.js`; grep for `veo`, `kling`, `videoUrl`, `generateVideo` before authoring the wrapper.

**Mode switch hygiene:**
- Switching illustrated → animated: VID tray appears for each scene; if a scene already has `videoInstances`, they render. If empty, the tray shows the ACTIVE VID placeholder + `+` thumb only.
- Switching animated → illustrated: VID tray hidden; `videoInstances` are NOT deleted (per ADR-7 backwards compat); they persist but don't render.
- No orphan data: this is the rule, not the implementation. Verify by toggling mode 5x and confirming no leaked DOM, no ghost curves.

## 4 — Files touched

| File | Change |
|---|---|
| `js/29-canvas-render.js` | New helper `buildVidVariantTray(activeImg)` — returns DOM for the dashed tray + thumb strip + add tile |
| `js/29-canvas-render.js` | New helper `buildVidThumbStrip(activeImg)` — wrap-grid of video thumbs with play-icon mark, filtered by `sourceImageInstanceId` |
| `js/29-canvas-render.js` | `buildVidNode` (L736) — append play-icon overlay; ACTIVE pill if `vid.isRenderActive`; inline-stepper DOM scaffolding |
| `js/29-canvas-render.js` | `updateVidNode` (L801) — sync ACTIVE pill, stepper values, sockets per P04 |
| `js/29-canvas-render.js` | New canonical `vidActions.addVariation(scene, sourceImageInstanceId, opts)` per ADR-6; expose on `window.vidActions` |
| `js/29-canvas-render.js` (or layout module) | Mode-aware visibility toggling for VID tray DOM |
| `css/canvas-graph.css` | `.variant-tray--vid` rules (mirror IMG tray; same dashed border) |
| `css/canvas-graph.css` | `.thumb--vid` rules (with play-icon mark) |
| `css/canvas-graph.css` | `.vid-play-overlay` (SVG triangle, color = `var(--sock-video)`) on ACTIVE VID card preview |
| `css/canvas-graph.css` | Mode-aware visibility: `body[data-canvas-mode="illustrated"] .variant-tray--vid { display: none }` (verify exact attribute name) |

## 5 — Work breakdown

1. **Verify before implementing**:
   - Confirm `js/27-canvas-state.js:315 (addVideoInstance)` signature: `(scene, sourceImgId, opts) => videoInstance`. Read the function body.
   - Find the existing video-gen call site. Most-likely files: `js/17c-create-pipeline.js`. Grep `generateVideo`, `videoUrl`, `veo`, `kling`. Document the exact function and its signature.
   - Find the mode flag (illustrated vs animated). Grep `mode === 'animated'`, `mode === 'illustrated'`, `project.mode`, `data-canvas-mode`.
   - Confirm `setVideoRenderActive` (js27:240) signature.
2. Build the VID tray helper.
3. Build the VID thumb strip helper.
4. Add play-icon overlay + ACTIVE pill on the ACTIVE VID card.
5. Wire click-thumb to `setVideoRenderActive` + re-render.
6. Author `vidActions.addVariation` wrapper.
7. Wire `+` tile to `vidActions.addVariation`.
8. Mode-aware visibility CSS.
9. Manual smoke in both themes + both modes.

## 6 — Acceptance criteria

(a) In animated mode, a VID variant tray appears next to the active IMG card; tray label `Vid N.A.k · v variants` (per mock:556–558). Hidden in illustrated mode. Tray border = `1px dashed var(--border-strong)` matching IMG tray.

(b) ACTIVE VID card mirrors IMG ACTIVE shape with play-icon overlay on preview, `--sock-video` (purple) type color and sockets, inline duration + model steppers (mock:560–576). ACTIVE = videoInstance with `isRenderActive === true` per scene per ADR-2.

(c) VID thumb strip renders sibling videos for the active IMG only (filter by `sourceImageInstanceId`); each thumb has a play-icon mark. Click → `CanvasState.setVideoRenderActive` (js27:240).

(d) "+" tile in VID strip generates a new video from the active IMG. This phase introduces a canonical pipeline-level handler `vidActions.addVariation(scene, sourceImageInstanceId)` that wraps `CanvasState.addVideoInstance` (js27:315) plus the existing video-generation pipeline. ADR-6 records this naming.

(e) Switching active IMG morphs VID tray correctly. Switching mode (illustrated ↔ animated) shows/hides VID tray without orphaning data — `videoInstances` persist on the scene during illustrated mode (not deleted), and resurface when toggling back.

(f) **Verify in BOTH `aurora.dark` AND `aurora.light`** per ADR-12: play-icon overlay readable on video preview in both themes (SVG triangle = `--sock-video` purple); VID-tray dashed border + label chip readable in both; thumb play-mark visible against thumb bg in both.

## 7 — Manual test plan (BOTH themes)

| Step | Expected (dark) | Expected (light) |
|---|---|---|
| 1. Project mode = animated; load scene with 1 IMG, 0 videos | VID tray visible next to IMG; ACTIVE VID = placeholder; `+` tile | n/a |
| 2. Click `+` VID tile | `vidActions.addVariation` triggered; new videoInstance created; video-gen pipeline starts; status dot pulses | same |
| 3. Generation completes | ACTIVE VID card shows poster + play-icon overlay (purple); status dot done (teal/mint per ADR-1) | same |
| 4. Click another IMG thumb | VID tray morphs: shows videos with `sourceImageInstanceId === newActiveImg.id` only | same |
| 5. Toggle mode to illustrated | VID tray disappears; SB→IMG→BGM→Final chain renders; videos are NOT deleted from `scene.videoInstances` (verify in DevTools) | same |
| 6. Toggle back to animated | VID tray re-appears; video data resurfaces correctly | same |
| 7. Toggle theme dark↔light while in animated mode | Play-icon overlay re-paints purple in both themes; tray dashed border visible | n/a |
| 8. Visual sanity: VID-tray dashed border vs IMG-tray dashed border | Same border, different content; visually consistent | OK |
| 9. Visual sanity: VID purple sockets vs Animation step dot purple | Same color (both `--sock-video`) | OK |
| 10. Verify no DOM orphan: toggle mode 10x, then inspect — `.variant-tray--vid` count = number of scenes (no extras) | Pass | Pass |

## 8 — Rollback plan

Revert the VID tray helpers, the play-icon overlay, the canonical wrapper, and CSS additions. `addVideoInstance` (js27:315) is unchanged; existing data is unaffected.

## 9 — Risks & mitigations

| Risk | Mitigation |
|---|---|
| Existing video-gen call site is hard to factor cleanly | Verify before implementing; if pipeline is monolithic (e.g. inline in a button handler), refactor minimally — extract just the video-gen step into a function the wrapper can call |
| `vidActions.addVariation` partial-success (state added, gen failed) leaves orphan instance | Wrap in try/catch; on failure, call `CanvasState.deleteVideoInstance` to clean up; document the cleanup contract |
| Mode toggle thrashes DOM | Use CSS `display: none` toggle, NOT element removal/recreation |
| Play-icon overlay color clashes with video poster (dark scene image) | Add a thin white halo via `filter: drop-shadow(0 0 1px rgba(0,0,0,0.5))` for visibility on bright posters |
| `sourceImageInstanceId` filter returns wrong videos if IDs collide | Verify `addImageInstance` and `addVideoInstance` produce unique IDs (probably crypto.randomUUID() — confirm) |
| Mode flag doesn't exist as a single source | If mode is computed from multiple fields, document the rule; if flag is missing, this phase HALTS pending product decision |

## 10 — Open questions (for engineer to verify before implementing)

| # | Question | File / line |
|---|---|---|
| 1 | What is the existing video-gen call site? | grep `generateVideo`, `veo`, `kling` in `js/17c-create-pipeline.js` |
| 2 | What is the project mode flag? Single field or computed? | grep `mode === 'animated'` in editor JS |
| 3 | What's the exact signature of `addVideoInstance`? | `js/27-canvas-state.js:315` |
| 4 | Does `addVideoInstance` auto-set `isRenderActive`? | read function body |
| 5 | Should switching active IMG also move `isRenderActive` on a video to a sibling? | product decision; default: keep video active state independent — switching IMG just shows/hides different videos |
| 6 | Is the ACTIVE VID card's preview a static poster, or an autoplay loop? | product decision; v1: static poster + play-icon; clicking opens preview modal (existing) |
| 7 | When mode switches illustrated→animated and a scene has no videos yet, does `+` thumb auto-trigger or wait for user? | product decision; default: wait for user |
| 8 | Are there shared inline-stepper handlers between IMG and VID, or do they need separate ones? | P07 will canonicalize; P06 just ships DOM |

## 11 — References

- Mock §11 (variant tray), §13 (variant-pin), §14 (thumbnail strip), §17 (VID preview), §28 (curves)
- ADR-1 (Theme tokens — VID purple from `--sock-video`): `devDoc/adr/ADR-001-theme-token-namespace.md`
- ADR-2 (Active-path source of truth, FLAT videoInstances join): `devDoc/adr/ADR-002-active-path-source-of-truth.md`
- ADR-4 (Active vs Selected): `devDoc/adr/ADR-004-active-vs-selected.md`
- ADR-5 (Variant-tray rendering — DOM for MVP): `devDoc/adr/ADR-005-variant-tray-rendering.md`
- ADR-6 (Action pipeline integration — `vidActions.addVariation` introduced here): `devDoc/adr/ADR-006-action-pipeline-integration.md`
- ADR-7 (Backwards compat — mode toggle does not delete videos): `devDoc/adr/ADR-007-backwards-compat-saved-projects.md`
- ADR-12 (Light-mode parity): `devDoc/adr/ADR-012-light-mode-parity.md`
- P05 (IMG tray pattern this phase mirrors): `devDoc/phase-05-sb-tabs-and-img-tray.md`
- `js/27-canvas-state.js`: L240 (setVideoRenderActive), L315 (addVideoInstance), L325 (deleteVideoInstance — verify line)
- `js/29-canvas-render.js`: L736 (buildVidNode), L801 (updateVidNode)
