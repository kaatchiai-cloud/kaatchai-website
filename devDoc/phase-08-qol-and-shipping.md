# Phase 08 — QoL Interactions + Build-Pipeline Shipping

> Slug: `qol-and-shipping` · Duration: S · Depends on: P07 · Successors: —

## 1 — Scope

Closing phase. Ship the QoL items, migrate `canvas-graph.css` into the build pipeline, finalize `CANVAS_LAYOUT_VERSION`, and restyle the Properties pane to Aurora translucency.

**In scope:**
- Marquee select on empty-stage drag (multi-select).
- Delete key on selection (final wiring; P07 establishes the handler).
- Double-click socket auto-creates next-stage node from defaults.
- Inline `canvas-graph.css` into `dist/index.html` via `build.js`.
- `CANVAS_LAYOUT_VERSION` bump if not done in P04 (coordinate).
- Properties pane restyle to Aurora `--lp-card` translucency (visual only).
- End-to-end smoke test in both themes.

**Out of scope:**
- New canvas features beyond the three QoL items above.
- Properties pane content/binding changes (visual only).
- Any new pipeline calls.

## 2 — Goals & non-goals

**Goals:** ship a deployable bundle with no `?v=` cache-bust hazard; close out the redesign with the QoL items; verify migration path for users on `LAYOUT_VERSION` 6 → 7.

**Non-goals:** re-architecture; new schema fields.

## 3 — Architecture & approach

### Marquee select

- `mousedown` on empty stage (target is `#graph` or `.canvas-stage`, NOT a node) AND no modifier (no Space-pan, no Connect-mode) → start marquee.
- Draw a translucent rectangle: `position: absolute` (in graph-space, so it accounts for pan/zoom), fill = `color-mix(in oklch, var(--accent) 12%, transparent)`, border = `1px solid var(--accent)`.
- On `mousemove` during drag, expand rectangle to current pointer.
- On `mouseup`, find all `.node` whose bounding boxes intersect the rectangle, mark them all SELECTED.
- Cursor-mode coordination: from P02's zoom-dock dropdown, `cursor mode = Select` enables marquee; `Pan` disables marquee (drag pans instead). Connect = no-op stub (per inventory unanchored claim #11).

### Delete key (final)

- P07 wires the listener and canonical handlers. P08 ensures:
  - Multi-select case: deleting multiple selected items in sequence; per-item `confirm()` consolidated to a single batch confirm if >1 selected.
  - Cannot-delete-last guard honored per `CanvasState.deleteImageInstance` returning false (js29:1957 comment).

### Double-click socket auto-creates next-stage node

- `dblclick` on `.sock.out` of a non-Final node → call canonical action with sensible defaults:
  - SB out → `imgActions.addVariation(scene, sb.id, defaults)` (defaults = scene's mode-appropriate prompt or empty)
  - IMG out → `vidActions.addVariation(scene, img.id, defaults)` if mode === 'animated'; no-op if illustrated
  - VID out → no-op (next stages BGM/Final are singletons)
  - BGM out → no-op (Final is a singleton, already exists)
- Per-source defaults documented in this phase doc.

### Build pipeline migration (per ADR-8)

- Today: `index.html:23` has `<link rel="stylesheet" href="css/canvas-graph.css?v=2">` — separate fetch + manual cache-bust.
- After P08: `build.js` inlines `canvas-graph.css` into `dist/index.html` next to `styles.css` and `themes.css`. The `<link>` tag is removed for `dist/` only (source `index.html` still has the link for dev-mode); the `?v=` cache-bust is no longer needed.
- Load order: `styles.css` → `canvas-graph.css` → `themes.css` (verify; the existing pattern is styles → themes inline, with themes loaded LAST to win specificity per `build.js:25` comment). New canvas CSS should sit between styles and themes — themes-light overrides win.

**Verify before implementing**: read `build.js` lines 14–120 to confirm the inline order and the regex pattern that finds the `<link>` tags. Add a third `<link>` replacement for `canvas-graph.css`.

### `CANVAS_LAYOUT_VERSION`

- P04 bumps from 6 → 7 (per its own scope).
- P08 verifies the bump is in place and `runLayout` (29:265) handles a v6→v7 migration cleanly.
- If P04 deferred the bump to here, P08 does it; coordinate with P04 to ensure ONE bump for the whole redesign.

### Properties pane restyle

- Properties pane is the right-side panel that shows fields for the SELECTED node. Existing in `index.html` (verify exact ID — likely `#create-properties-panel` or similar; grep `properties` in index.html).
- Restyle: translucent (`--lp-card`), dense rows, `--lp-card-bdr` borders, no big card chrome. Mock-aligned.
- Scope: visual restyle only; no content/binding change.
- Verified in BOTH themes per ADR-12.

## 4 — Files touched

| File | Change |
|---|---|
| `js/29-canvas-render.js` | Add marquee-select listener (mousedown on empty stage, draw rectangle, on mouseup mark intersecting `.node` as selected) |
| `js/29-canvas-render.js` | Multi-select Delete batch handling |
| `js/29-canvas-render.js` | Add `dblclick` listener on `.sock.out`; route to canonical action per source type |
| `js/29-canvas-render.js` | Verify / set `CANVAS_LAYOUT_VERSION = 7` (L20) — coordinate with P04 |
| `css/canvas-graph.css` | `.cg-marquee` rules (fill, border) |
| `css/canvas-graph.css` | Properties pane Aurora restyle (verify panel ID; add rules under `#create-page #<panel-id>`) |
| `build.js` | Add a third inline-replacement block for `canvas-graph.css`, after the themes.css block (verify order) |
| `index.html` | Remove `<link rel="stylesheet" href="css/canvas-graph.css?v=2">` from the path that flows into `dist/` (or leave in source and rely on `build.js` regex to strip it) — verify the existing pattern for styles.css/themes.css |

## 5 — Work breakdown

1. **Verify before implementing**:
   - Read `build.js:14–120` to understand the inline pipeline pattern. Confirm where to insert canvas-graph.css.
   - Verify `CANVAS_LAYOUT_VERSION` was bumped in P04 (`js/29-canvas-render.js:20`).
   - Find the Properties pane ID in `index.html`.
   - Read the cursor-mode dropdown wiring from P02 to coordinate marquee mode.
2. Implement marquee select.
3. Verify Delete key + multi-select batch flow.
4. Implement double-click socket → next-stage.
5. Add canvas-graph.css to `build.js` inline pipeline.
6. Restyle Properties pane.
7. Run a full smoke test: existing project loads → all entities render → Run pipeline produces a video → no console errors in either theme.

## 6 — Acceptance criteria

(a) Drag on empty stage with no modifier draws a marquee rectangle and selects all enclosed nodes (multi-select). Marquee fill = `color-mix(in oklch, var(--accent) 12%, transparent)`; marquee border = `1px solid var(--accent)`. Drag with current pan modifier still pans. Document the cursor-mode interaction (Select vs Pan from P02 zoom-dock dropdown).

(b) Delete key with one or more SELECTED cards triggers canonical delete handlers with confirmation, respecting the "cannot delete last" guard (`CanvasState.deleteImageInstance` returns false if it's the only image, js29:1957 comment).

(c) Double-click an out-socket on any non-Final node creates a new instance at the next pipeline stage with sensible defaults:
- SB out → new IMG via `imgActions.addVariation`
- IMG out → new VID via `vidActions.addVariation` (animated mode only; no-op in illustrated)
- VID out → no-op (BGM/Final are singletons)
- BGM out → no-op
Document defaults explicitly per source type in the phase doc.

(d) `canvas-graph.css` is added to `build.js` inline pipeline next to `styles.css` and `themes.css` (per ADR-8). The `<link rel="stylesheet" href="css/canvas-graph.css?v=…">` in `index.html` is removed (or stripped by the build) for `dist/`. Cache-bust query is removed.

(e) `CANVAS_LAYOUT_VERSION` (js29:20) is bumped to 7 (per ADR-3, coordinated with P04). `runLayout()` resets stale `canvasPosition` for users with old saved projects.

(f) End-to-end smoke test: existing project loaded → all element-map entities (per inventory Part 4) render correctly → Run pipeline produces a video → no console errors **in either `aurora.dark` OR `aurora.light`**.

(g) Properties pane (right side) restyle pass — translucent (`--lp-card`) + dense rows + `--lp-card-bdr` borders, no big card chrome (mock-aligned). Scope: visual restyle only; no content/binding change.

(h) **Verify in BOTH `aurora.dark` AND `aurora.light`** per ADR-12: marquee fill/border visible in both themes; Properties pane translucency readable in both; no FOUC or stale-token regression on theme toggle after the build-pipeline migration; LAYOUT_VERSION migration runs cleanly in both themes.

## 7 — Manual test plan (BOTH themes)

| Step | Expected (dark) | Expected (light) |
|---|---|---|
| 1. Run `node build.js` | `dist/index.html` contains canvas-graph.css inlined; no `<link>` to canvas-graph.css; no `?v=` query | same |
| 2. Open dist file in browser | All canvas styles applied; no FOUC | same |
| 3. Cursor mode = Select; drag-select two nodes | Marquee draws, both nodes get 1px ring | same |
| 4. Press Delete | Batch confirm; both deleted (if not last) | same |
| 5. Cursor mode = Pan; drag empty stage | Pans instead of marquee | same |
| 6. Double-click an SB node's out-socket | New IMG instance created and image-gen triggers | same |
| 7. Mode = animated; double-click IMG out-socket | New VID instance created and video-gen triggers | same |
| 8. Mode = illustrated; double-click IMG out-socket | No-op (no error) | same |
| 9. Open Properties pane on a selected node | Translucent panel; dense rows; readable fields | same |
| 10. Toggle theme | Properties pane re-paints; no field rendering breaks | same |
| 11. Load a v6-saved project | `runLayout` repositions nodes for v7; no overlap | same |
| 12. Full Run pipeline (storyboard → image → video → final) | Completes; video plays; no console errors | same |
| 13. Diff against v6 source: no regression in any chrome / node / curve / interaction | Pass | Pass |

## 8 — Rollback plan

Revert: marquee listener, dblclick listener, Properties pane CSS, build.js change. Keep LAYOUT_VERSION bump (rolling it back is more disruptive than keeping). The build-pipeline migration is the only commit-time change; revert the `build.js` block + restore the `<link>` tag in `index.html` for dist build.

## 9 — Risks & mitigations

| Risk | Mitigation |
|---|---|
| Marquee draw lags at high zoom (1000+ pixels per side) | Use a single absolute-positioned div, NOT per-frame DOM manipulation |
| Marquee selection misses partially-overlapping nodes | Use bounding-box intersection (axis-aligned), not center-point — match Figma/Photoshop convention |
| Double-click socket triggers if user mis-clicks twice on a node body | Bind dblclick specifically to `.sock.out`, NOT the node; verify with manual test |
| `build.js` regex doesn't match the canvas-graph link tag (tag has `?v=2`) | Test the regex; build it inclusive of `(\?v=[^"]+)?` |
| Removing `?v=` cache-bust orphans users on cached old canvas-graph.css | Inlining replaces the cache key with the file content; CDN must serve fresh `dist/index.html` — verify deploy pipeline invalidates HTML cache |
| Properties pane has child rules that don't inherit Aurora correctly | Audit specificity; add `body:has(#create-page.visible)` guards if needed |
| LAYOUT_VERSION bump applied twice (in both P04 and P08) | Coordinate; only one bump in 6 → 7 across the whole redesign |
| End-to-end smoke fails because of an unrelated upstream bug | Distinguish redesign-introduced regressions from pre-existing bugs; only block ship on the former |

## 10 — Open questions (for engineer to verify before implementing)

| # | Question | File / line |
|---|---|---|
| 1 | Was `CANVAS_LAYOUT_VERSION` bumped in P04 already? | `js/29-canvas-render.js:20` — confirm at start of P08 |
| 2 | What's the Properties pane element ID? | grep `properties` in `index.html` |
| 3 | Does `build.js` already inline `themes.css` AFTER `styles.css`? Where does canvas-graph.css go? | read `build.js:14–120` |
| 4 | What cursor-mode does P02 ship as default? Select or Pan? | per P02 phase doc decision |
| 5 | What happens if the user has Connect mode active and drags? | Connect is no-op; drag should fall through to marquee or do nothing |
| 6 | Multi-select Delete: per-item confirm or batch confirm? | UX decision; default: batch |
| 7 | Are there shortcut keys we should add (Cmd-A select all, Esc clear selection)? | nice-to-have; defer if not specified |

## 11 — References

- Mock §29 (zoom/pan, marquee implication), §35 (interactions narrative)
- ADR-3 (LAYOUT_VERSION bump strategy): `devDoc/adr/ADR-003-canvas-layout-version-bump.md`
- ADR-7 (Backwards compat — affects deletion of last item): `devDoc/adr/ADR-007-backwards-compat-saved-projects.md`
- ADR-8 (Build pipeline — implemented here): `devDoc/adr/ADR-008-build-pipeline.md`
- ADR-12 (Light-mode parity): `devDoc/adr/ADR-012-light-mode-parity.md`
- P02 (cursor-mode dropdown): `devDoc/phase-02-floating-chrome.md`
- P04 (LAYOUT_VERSION bump expected to happen there): `devDoc/phase-04-node-shell-and-curves.md`
- P05 / P06 (`imgActions.addVariation` / `vidActions.addVariation`): respective phase docs
- P07 (Delete key + canonical handlers): `devDoc/phase-07-card-interactions.md`
- `js/29-canvas-render.js`: L20 (LAYOUT_VERSION), L265 (runLayout), L1957 (deleteImageInstance comment)
- `js/27-canvas-state.js`: L222–346 (CRUD)
- `build.js`: L14–120 (inline pipeline)
- `index.html`: L23 (canvas-graph.css link with ?v=2)
