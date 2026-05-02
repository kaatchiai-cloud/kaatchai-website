# Phase 04 — Node Shell, Sockets, Typed Curves, and Selection Outline

> Slug: `node-shell-and-curves` · Duration: M · Depends on: P01 · Successors: P05, P07, P08

## 1 — Scope

Rebuild the node base style: edge sockets on every node, type-colored bezier curves, 1px accent selection ring (no glow/shadow/scale), corner status dot, hover-dim of non-connected curves to 25%. All colors from Aurora + `--sock-*` per ADR-1; selection ring = `--accent` (Aurora cyan in production).

**In scope:**
- Sockets on SB / IMG / VID / BGM / Final / Launch / Subtitle (verify Subtitle stays).
- Card chrome shrink: bg = `--bg-elevated`, border = `--border`, no glow/shadow/scale on `.selected`.
- 1px `--accent` selection ring (replaces existing scale/shadow effect).
- Corner status dot (top-right, 6px) with done/running/pending/error color states.
- `redrawCurves` (29:1450) emits typed bezier strokes that auto-theme via `getComputedStyle` reading `--sock-*`.
- Hover-dim non-connected curves to 25% opacity.
- LAYOUT_VERSION bump (per ADR-3) — coordinated with P08 (which also touches it).

**Out of scope:**
- SB tabs (P05), IMG/VID variant trays (P05/P06), pipeline glue (P06), interactions/menus/steppers (P07), QoL (P08).
- Properties pane (P08).

## 2 — Goals & non-goals

**Goals:** every node has a socket, every active-path curve is typed-colored, selection is a 1px ring (no glow), all colors derive from Aurora + `--sock-*`, theme toggle re-paints everything via the token chain.

**Non-goals:** changing node positions / `runLayout`; changing zoom math; introducing new instance fields.

## 3 — Architecture & approach

**Sockets** are CSS-only DOM elements (`<span class="sock in">` / `<span class="sock out">`) appended inside each node by the per-type build functions in `js/29-canvas-render.js`:
- `buildSBNode` (L523) — out-socket only (SB starts the chain)
- `buildImgNode` (L623) — in + out
- `buildVidNode` (L736) — in + out
- `renderBgmNode` (verify location) — in + out
- `renderFinalNode` (verify location) — in-socket only
- `renderLaunchNode` (verify location) — out-socket only (or n/a if it doesn't connect)
- `renderSubtitleNode` (verify location) — confirm if it's still in scope; may keep both sockets

Socket geometry from mock §15 (mock:368–380): 12px circle, `top: 16px`; `.in` `left: -8px`; `.out` `right: -8px`. Color from `--sock-{type}` modifier class (`.sock--script`, `--image`, `--video`, `--audio`, `--final`).

**Curves** in `redrawCurves` (29:1450) → `drawCurve` (29:1562) → `bezier` (29:1575). Stroke color comes from `getComputedStyle(canvasStep).getPropertyValue('--sock-' + type).trim()` — the same pattern as mock:651–652. Because `getComputedStyle` resolves against the active `[data-theme]` and `--sock-*` is defined in both themes (P01), curves auto-theme on toggle without any JS change.

Stroke widths (mock §28, mock:633–671):
- Active path: 1.6px solid, opacity 0.9
- Non-active: 1.2px dashed (`stroke-dasharray: 4 3`), opacity 0.45
- Hover-dim non-connected: opacity 0.25 (transition 0.12s)

**Card chrome:**
- bg = `--bg-elevated` (= `color-mix(in oklch, var(--lp-bg) 55%, transparent)` from `#create-page` remap)
- border = `--border` (= `--lp-card-bdr`)
- border-radius = 10px
- no `box-shadow`, no `transform: scale(...)` on `.selected`
- `.selected` adds `border-color: var(--accent)` only (1px, no thickness change)

**Status dot** (mock §19, mock:413–420): 6px circle, top-right corner, color states:
- `.done` → `--sock-audio` (teal/mint, NOT cyan, per ADR-1 collision resolution)
- `.running` → `--sock-script` (yellow) + 1.2s pulse
- `.pending` → `--text-muted` (= `--lp-faint`)
- `.error` → `--red` (Family A) or `--cg-danger` (verify per P01 open question #1)

**Hover-dim:** when any node is hovered, curves whose endpoints are NOT this node's neighbors fade to 25% opacity. Implementation: add `data-hover-source` attribute to hovered node; on hover, walk active-path graph; mark connected curves with `.connected`; CSS uses `.cg-curve:not(.connected) { opacity: 0.25 }` while `[data-hover-active]` is set on the graph layer.

**Specificity guard** (per ADR-11): any selector targeting `<textarea>`, `<input>`, `<button>`, or `<select>` inside a card must use `#create-canvas-step` prefix. Already applied for `.cg-prompt` (cg-css:957–974); same rule for new `.sock`, `.status-dot`, `.node` rules — verify there's no `#create-page span` rule that conflicts (probably not, but check).

**Zoom counter-scale** (per ADR-10): existing `--cg-zoom` pattern (cg-css:1135–1148) is preserved; sockets and curves themselves are NOT counter-scaled (they should scale with the graph), but the status dot may need to stay readable at low zoom — leave for P07 if it becomes an issue (status dot is a position marker, not text, so probably fine).

## 4 — Files touched

| File | Change |
|---|---|
| `js/29-canvas-render.js` | Modify `buildSBNode` (L523) to append `.sock.out`. Verify if it already does — if so, just update the modifier class to `.sock--script`. |
| `js/29-canvas-render.js` | Modify `buildImgNode` (L623) to append `.sock.in` + `.sock.out` with `.sock--image` modifier |
| `js/29-canvas-render.js` | Modify `buildVidNode` (L736) similarly with `.sock--video` |
| `js/29-canvas-render.js` | Modify `renderBgmNode` / `renderFinalNode` / `renderLaunchNode` / `renderSubtitleNode` similarly (verify each function exists and where) |
| `js/29-canvas-render.js` | Append corner status dot to each node's build function: `<span class="status-dot status-dot--{state}"></span>` |
| `js/29-canvas-render.js` | Update each node's `update*Node` to flip the status-dot class based on instance state |
| `js/29-canvas-render.js` | Modify `redrawCurves` (L1450) to read `--sock-{type}` via `getComputedStyle` (verify this is already happening; if so, ensure the `type` argument is passed correctly per node-pair) |
| `js/29-canvas-render.js` | Add hover-dim listener: on node `mouseenter`, set `data-hover-active` on graph layer + mark connected curves; on `mouseleave`, clear |
| `js/29-canvas-render.js` | Bump `CANVAS_LAYOUT_VERSION` from `6` (L20) to `7` per ADR-3 — coordinate with P08 (only ONE bump for the whole redesign; if P08 is shipping the build pipeline change in a separate commit, keep the bump in P04 since P04 is the first phase that visibly invalidates saved positions due to socket-bumps changing `.node` geometry) |
| `css/canvas-graph.css` | Add `.sock { width: 12px; height: 12px; border-radius: 50%; position: absolute; top: 16px; }` + `.sock.in { left: -8px }`, `.sock.out { right: -8px }`, modifier-class colors `.sock--script { background: var(--sock-script); }` (×5) |
| `css/canvas-graph.css` | Update `.node { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px; }` |
| `css/canvas-graph.css` | Replace any existing `.node.selected { transform: scale(...); box-shadow: ... }` with `.node.selected { border-color: var(--accent); }` (1px ring, no thickness change) |
| `css/canvas-graph.css` | Add `.status-dot { width: 6px; height: 6px; border-radius: 50%; position: absolute; top: 8px; right: 8px; }` + state modifiers (`--done`, `--running`, `--pending`, `--error`) |
| `css/canvas-graph.css` | Add `.status-dot--running` pulse animation (1.2s) — namespace `cg-status-pulse` |
| `css/canvas-graph.css` | Add `.cg-curve:not(.connected)` rule under `[data-hover-active] .cg-svg-layer` selector — opacity 0.25, transition 0.12s |
| `css/canvas-graph.css` | Apply `#create-canvas-step` prefix on all new rules touching `<span>`, `<svg>`, `<path>` per ADR-11 |

## 5 — Work breakdown

1. **Verify before implementing**:
   - Read each `build*Node` and `update*Node` function in `js/29-canvas-render.js` (L523–815 + later for Bgm/Final/Launch/Subtitle).
   - Read `redrawCurves` (L1450) → `drawCurve` (L1562) → `bezier` (L1575).
   - Confirm sockets aren't already in the DOM (mock has them; live code may or may not).
   - Confirm Subtitle node is in scope (architect prompt §39 flags it as "verify"; if Subtitle is being deprecated, deprioritize its socket).
   - Confirm what `runLayout` does with `_layoutVersion` (29:265) and verify the bump invalidates positions correctly.
2. Add socket DOM in each `build*Node` function.
3. Add status-dot DOM in each `build*Node` function; wire state in each `update*Node`.
4. Update `redrawCurves` (if needed) to pull stroke from `--sock-{type}` per active-path edge.
5. Write `.sock`, `.status-dot`, `.node`, `.node.selected`, `.cg-curve:not(.connected)` rules in `canvas-graph.css`.
6. Bump `CANVAS_LAYOUT_VERSION` to 7.
7. Add hover-dim listener.
8. Manual smoke in both themes at zoom 0.25 / 1.0 / 2.5.

## 6 — Acceptance criteria

(a) Every node type (SB, IMG, VID, BGM, Final, Launch, Subtitle if in scope) has `.sock.in` and/or `.sock.out` bumps positioned per mock (12px circle, top:16px, in left:-8px / out right:-8px) with the correct type color from `--sock-*`.

(b) `redrawCurves` (29:1450) emits beziers between active-path pairs only; stroke comes from `getComputedStyle().getPropertyValue('--sock-' + type).trim()`; 1.6px solid for active, 1.2px dashed for non-active path. Final-node has in-socket only. Because `getComputedStyle` resolves against the active `[data-theme]` and `--sock-*` is defined in both themes (P01), curves auto-theme on toggle.

(c) Card chrome shrink: card bg = `--bg-elevated`, card border = `--border`; remove existing glow/shadow/scale on `.node.selected`; replace with 1px `--accent` border ring (per mock:247–250).

(d) Per-card status dot at top-right corner (per mock:413–420). States (per ADR-1 collision resolution applied): done = `--sock-audio` (teal/mint, NOT cyan); running = `--sock-script` (yellow) + pulse; pending = `--text-faint`; error = `--cg-danger` (or Aurora `--red`).

(e) Hover any node → non-connected curves dim to 25% opacity; previous band/highlight system removed if it conflicts.

(f) Theme toggle re-paints all sockets, curves, and selection rings via the token chain (no hard-coded colors anywhere in this phase's code).

(g) Existing `--cg-zoom` counter-scale pattern (cg-css:1135–1148) preserved — no regression at zoom 0.25 / 1.0 / 2.5.

(h) Specificity guard: any new selectors that target an element type also styled by `#create-page X` rules (styles.css:3677) use the `#create-canvas-step` prefix per ADR-11.

(i) **Verify in BOTH `aurora.dark` AND `aurora.light`** per ADR-12: all 5 socket colors clearly visible against the card bg in both themes; selection ring contrast readable in both; status dots distinguishable from each other AND from the brand accent in both themes; curve strokes have sufficient contrast against dot-grid background in both themes.

(j) `CANVAS_LAYOUT_VERSION` bumped from 6 → 7. On reload of an existing project, `runLayout` (29:265) re-positions nodes with the new socket-aware geometry; user's saved-positions are recomputed.

## 7 — Manual test plan (BOTH themes)

| Step | Expected (dark) | Expected (light) |
|---|---|---|
| 1. Load existing scene with SB+IMG+VID+BGM+Final | All nodes have sockets at edges; curves are typed-colored | n/a |
| 2. Inspect a curve in DevTools | Stroke = computed `--sock-image` (orange) for SB→IMG edge | same color, light-tuned |
| 3. Click a node | 1px cyan ring; no scale or shadow | same, deeper cyan |
| 4. Hover a node | Non-connected curves fade to 25% | same |
| 5. While generation is running on Image node | Status dot pulses yellow (`--sock-script`) | same |
| 6. After Image done | Status dot solid teal (`--sock-audio`) | same |
| 7. Toggle to light | All sockets / curves / status dots / selection rings repaint via token chain — no hard-coded colors break | n/a |
| 8. Zoom to 0.25 | Sockets + curves scale with graph; status dot remains visible (not text) | same |
| 9. Zoom to 2.5 | No regression; sockets stay 12px in graph-space (scaled up to 30px on screen) | same |
| 10. Visual sanity: BGM in-socket teal vs Run button cyan | Distinct colors in both themes | same |
| 11. Reload project from before LAYOUT_VERSION bump | `runLayout` re-positions nodes; no overlap with sockets | same |

## 8 — Rollback plan

Revert: socket DOM appends in `build*Node`, status-dot appends, `redrawCurves` stroke change (if changed), CSS additions, LAYOUT_VERSION bump (decrement to 6).

If LAYOUT_VERSION bump is shipped and rolled back, users will be on v7 → revert to v6 means `runLayout` re-runs once (v6 < user's v7 doesn't trigger a reset; users stay at v7 positions). Net effect: rollback is safe but users keep new positions.

## 9 — Risks & mitigations

| Risk | Mitigation |
|---|---|
| Socket DOM additions overlap with existing card content | Verify by visual inspection; adjust `.node` padding if needed |
| `redrawCurves` already pulls colors from somewhere other than `getComputedStyle` | Verify; if so, refactor to use `getComputedStyle` (mock pattern) for free theme support |
| Subtitle node is being deprecated; this phase wastes effort styling it | Verify scope before implementing; if Subtitle is out, skip it explicitly |
| LAYOUT_VERSION bump invalidates user positions mid-session | Bump happens once; `runLayout` re-positions immediately on next mount; document in P08 user-comm |
| `.node.selected` removing scale breaks hit-testing | Hit-test uses bounding box; 1px ring change doesn't affect bbox |
| Hover-dim performance at 50+ nodes | Use `data-hover-active` flag + CSS `:not(.connected)` — single class flip, no per-curve JS |
| Specificity collision with `#create-page` rules on new card-internal elements | Apply `#create-canvas-step` prefix per ADR-11 |
| Light-mode socket colors fail AA contrast against white card bg | P01 already shifts light socket values darker; verify in this phase |

## 10 — Open questions (for engineer to verify before implementing)

| # | Question | File / line |
|---|---|---|
| 1 | Where is `renderBgmNode` / `renderFinalNode` / `renderLaunchNode` / `renderSubtitleNode` defined? | grep in `js/29-canvas-render.js` |
| 2 | Are sockets already in the DOM today? | grep `.sock` in `js/29-canvas-render.js` |
| 3 | Does `redrawCurves` already use `getComputedStyle`, or does it use literal hex? | read L1450–1600 |
| 4 | Is Subtitle node still in scope? | architect prompt + product context |
| 5 | Are there existing `box-shadow`/`transform` rules on `.node.selected` to remove? | grep in `css/canvas-graph.css` |
| 6 | Does `runLayout` (29:265) handle a version mismatch (v6 saved → v7 code) cleanly? | read 29:265+ |
| 7 | What's the exact `type` argument signature on `drawCurve` (29:1562)? | read function signature |
| 8 | Are there pre-existing band/highlight rules to remove for hover-dim? | grep `band`, `highlight` in `canvas-graph.css` |

## 11 — References

- Mock §10 (nodes), §15 (sockets), §19 (status dot), §28 (curves)
- ADR-1 (Theme tokens, post-collision-resolution): `devDoc/adr/ADR-001-theme-token-namespace.md`
- ADR-2 (Active-path source of truth): `devDoc/adr/ADR-002-active-path-source-of-truth.md`
- ADR-3 (LAYOUT_VERSION bump): `devDoc/adr/ADR-003-canvas-layout-version-bump.md`
- ADR-4 (Active vs Selected separation): `devDoc/adr/ADR-004-active-vs-selected.md`
- ADR-9 (Zoom-invariant chrome — does NOT apply to nodes/curves): `devDoc/adr/ADR-009-zoom-invariant-chrome.md`
- ADR-11 (Specificity guard): `devDoc/adr/ADR-011-specificity-guard.md`
- ADR-12 (Light-mode parity): `devDoc/adr/ADR-012-light-mode-parity.md`
- P01 token table: `devDoc/phase-01-theme-tokens.md` Section 4
- `js/29-canvas-render.js`: L20 (LAYOUT_VERSION), L265 (runLayout), L523 (buildSBNode), L585 (updateSBNode), L623 (buildImgNode), L675 (updateImgNode), L736 (buildVidNode), L801 (updateVidNode), L1450 (redrawCurves), L1562 (drawCurve), L1575 (bezier)
- `css/canvas-graph.css`: L957–974 (specificity-guard precedent), L1135–1148 (zoom-invariant pattern)
