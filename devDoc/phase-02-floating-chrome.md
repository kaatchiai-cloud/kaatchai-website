# Phase 02 — Floating Chrome (Top Pill, Zoom Dock, Progress Strip & Telemetry)

> Slug: `floating-chrome` · Duration: S · Depends on: P01 · Successors: feed into P07 (selection toolbar coexistence)

## 1 — Scope

Replace the existing canvas header chrome with four floating, theme-aware, zoom-invariant chrome elements from the mock, all sourced from Aurora `--lp-*` tokens (per ADR-1).

**In scope:**
- Top action pill (12 controls): Project / Star / Undo / Redo / Share / drag-handle / batch stepper / Run / Run▾ / Cancel ✕ / "N active" status pill / right-pane toggle.
- Bottom-right zoom dock: cursor-mode dropdown (Select/Pan/Connect — Connect is no-op stub) / Fit / Zoom% / Minimap (no-op stub) / Reset.
- Top-right progress strip: live `Total: x%` + bar + `Node: y%`, hidden when idle.
- Bottom-left telemetry block: T / I / N / V / FPS in mono font.

**Out of scope:**
- Agent panel restyle (P03).
- Anything inside `#graph` (nodes, sockets, curves — P04+).
- Selection toolbar (lives inside graph layer, P07).
- New pipeline functionality — only re-binds existing entry points (`launchImageAgent` etc).

## 2 — Goals & non-goals

**Goals:** all four chrome elements `position: fixed/absolute` outside `#graph` (per ADR-9, zoom-invariant); all chrome chrome (translucency, borders, accent, text) sourced from Aurora `--lp-*`; verified in BOTH themes per ADR-12.

**Non-goals:** changing how the canvas zoom or pan works internally; introducing new pipeline functions; replacing the existing Run / Cancel logic.

## 3 — Architecture & approach

Each chrome element is a separate fixed/absolute container appended to `#create-canvas-step` (or `#create-canvas-panel` if the existing layout uses that as the absolute root — verify before implementing). They live OUTSIDE the `#graph` zoom-transformed layer, per ADR-9.

**Zoom-invariance contract:** chrome must NOT be inside any element that gets `transform: scale(...)` from `js/29-canvas-render.js:1668 (applyTransform)`. Confirmed by inspecting that `applyTransform` writes to `#graph` only (verify before implementing — read the function body and document which element receives the transform).

**Token bindings (all from P01 token table):**
- Pill bg: `--lp-card` + `backdrop-filter: blur(var(--cg-pill-blur))`
- Pill border: `--lp-card-bdr`
- Run primary button bg: `--accent` (= `--lp-accent`, Aurora cyan)
- Run hover: `--accent-hover`
- Cancel: `--red` (Family A; or `--cg-danger` if introduced in P01)
- Progress bar fill: `--accent` (= `--lp-accent`)
- Progress bar track: `--lp-card-bdr`
- Telemetry text: `--lp-faint`
- Status pill "N active" dot: `--sock-script` (running yellow) with pulse, `--lp-faint` when idle

## 4 — Files touched

| File | Change |
|---|---|
| `index.html` | Add four new top-level fixed containers inside `#create-canvas-panel` (or move existing scattered chrome into them): `.cg-top-pill`, `.cg-zoom-dock`, `.cg-progress-strip`, `.cg-telemetry`. **Verify** the existing top header (Tidy/−/%/+/Fit row) location before deleting — replace it; do not duplicate. |
| `css/canvas-graph.css` | Add four rule blocks: `#create-canvas-step .cg-top-pill { ... }`, `.cg-zoom-dock { ... }`, `.cg-progress-strip { ... }`, `.cg-telemetry { ... }`. Apply specificity guard per ADR-11 (`#create-canvas-step` prefix) for any `<button>` / `<select>` / `<input>` inside them, since `#create-page button` etc may exist. |
| `js/29-canvas-render.js` (or wherever the existing zoom/cursor-mode wiring lives) | Rewire Fit / Zoom% / Reset / Cursor-mode dropdown to the new `.cg-zoom-dock` controls. Preserve `handleZoom(delta, cx, cy)` (L1678) clamp range — verify it matches mock's 0.25–2.5 (inventory unanchored claim #3). |
| `js/17c-create-pipeline.js` (or wherever the existing Run trigger lives) | Bind the new pill's Run button to `launchImageAgent` (L3216). Bind Cancel ✕ to whatever cancel hook exists today — **verify before implementing**: grep for `cancel`, `abort`, `stop` in 17c; if no canonical cancel hook exists, document it as a P02 open question and ship a Cancel button that visibly disables itself + logs to console (do NOT invent a cancel pipeline). |
| `js/29-canvas-render.js` | Add a small telemetry rAF loop that writes `T / I / N / V / FPS` text into `.cg-telemetry`. Mount in `mount()`, unmount cleanly in `unmount()`. |
| `js/29-canvas-render.js` | Add a progress-strip update path. **Verify before implementing**: source events for `Total%` vs `Node%` — most likely candidates are `updateSceneCardStatus` (17c L2753) and `notifyImageReady` (29-canvas-render L154); the architect prompt does not specify, and inventory unanchored claim #8 flags this. Document the decision in this phase doc once verified. |

## 5 — Work breakdown

1. **Verify before implementing** (do this BEFORE writing any code):
   - Find the current canvas header (Tidy / − / % / + / Fit) in `index.html` — line range and parent.
   - Confirm `applyTransform` writes only to `#graph` and not to a parent.
   - Confirm `handleZoom` clamp values (0.25–2.5 per mock — see inventory unanchored claim #3).
   - Find the Run trigger today (whether it's a button somewhere in the agent panel that calls `launchImageAgent`, or wired elsewhere).
   - Find/lack-of cancel hook.
   - Find/lack-of progress event source for Total% / Node%.
2. Add the four chrome containers to `index.html` inside `#create-canvas-panel` (NOT inside `#graph`).
3. Style with the Aurora token map from P01. Apply `#create-canvas-step` prefix on form-element rules (ADR-11).
4. Wire Run, Cancel, Fit, Zoom, Reset, theme toggle (already exists), right-pane toggle.
5. Add telemetry rAF loop + progress-strip updater.
6. Mount only when `body.canvas-active` (use the same gate as `#create-canvas-step`).
7. Manual smoke in both themes.

## 6 — Acceptance criteria

(a) **Top action pill** renders all 12 controls; pill bg = `--lp-card` glass + `backdrop-filter: blur(var(--cg-pill-blur))`; Run bg = `--lp-accent` (Aurora cyan); Cancel color = Aurora `--red`; "N active" status dot pulses when active. Run wired to `launchImageAgent`. Cancel wired to existing cancel hook (or visibly stubbed if none — see open questions).

(b) **Bottom-right zoom dock** replaces the existing Tidy/−/%/+/Fit row; cursor-mode dropdown (Select / Pan / Connect — Connect explicitly no-op or visibly disabled, per inventory unanchored claim #11); Fit calls `fitToView` (L1694); Zoom% reflects current `view.zoom`; Reset zooms to 1.0 + center; dock chrome = `--lp-card` glass.

(c) **Top-right progress strip** shows live `Total: x%` + bar + `Node: y%` during a run, hidden when idle. Progress bar fill = `--lp-accent`. Source events documented (verify before implementing — see Section 4 Files Touched).

(d) **Bottom-left telemetry** shows T / I / N / V / FPS in 11px SF Mono / Menlo / Consolas; text color = `--lp-faint`; pointer-events: none; updates via rAF probe at ~10Hz (rAF loop with throttle).

(e) **All chrome elements** are `position: fixed` (or `position: absolute` if scoped to `#create-canvas-panel` with that as the offset parent) — outside `#graph` per ADR-9. Verify by zooming canvas to 0.25 and 2.5: chrome must NOT scale.

(f) **Verify in BOTH `aurora.dark` AND `aurora.light`** per ADR-12: chrome translucency reads (glass effect visible, content under glass dims appropriately); blur radius adequate; accent button hover/focus rings visible; status pill, progress fill, telemetry text all have AA contrast against the page bg under the glass.

## 7 — Manual test plan (BOTH themes)

| Step | Expected (dark) | Expected (light) |
|---|---|---|
| 1. Load canvas, theme = dark | All four chrome elements visible, glass translucent, accent cyan | n/a yet |
| 2. Toggle to light | Glass becomes white-translucent (`rgba(255,255,255,0.85)`); accent cyan deepens; telemetry text remains readable | All four chrome visible, deeper-cyan accent |
| 3. Click Run on top pill | `launchImageAgent` triggers; status pill "1 active" dot pulses yellow (`--sock-script`); Cancel becomes active; progress strip appears | same |
| 4. While running, watch progress strip | Total% and Node% update live; bar fill = cyan accent | same |
| 5. Click Cancel | If wired, run aborts; if stubbed, button is visibly disabled and console-logs | same |
| 6. Wheel-zoom canvas to 25% | Chrome stays at full size (zoom-invariant) | same |
| 7. Wheel-zoom canvas to 250% | Chrome stays at full size | same |
| 8. Click Fit in zoom dock | All nodes fit to view with safe-area inset for chrome (verify inset value, inventory unanchored #4) | same |
| 9. Theme toggle while progress strip is active | Bar repaints to new accent; no flicker | same |

## 8 — Rollback plan

Revert the four containers in `index.html` and the four CSS rule blocks. JS rewiring of Run / Cancel / Fit / Zoom can also be reverted without data loss. The telemetry rAF loop is self-contained — its presence does not affect data.

## 9 — Risks & mitigations

| Risk | Mitigation |
|---|---|
| Existing Run trigger is bound elsewhere; new pill button bypasses it | Verify call site before wiring; do not duplicate the binding |
| Cancel hook does not exist | Stub visibly (button disabled + console-log); flag as open question; do not invent pipeline |
| Progress events source unclear | Verify; if not derivable, ship the strip with placeholder/stub values until P05+P06 add events; document explicitly |
| `position: fixed` conflicts with existing `#create-canvas-panel` overflow | Use `position: absolute` against `#create-canvas-panel` if it's the offset parent; verify before implementing |
| Specificity collision with `#create-page button` rules | Apply `#create-canvas-step` prefix per ADR-11 |
| Light glass reads as muddy when content is busy underneath | If verification fails, lift `--lp-card` light value or reduce blur — coordinate with P01 |

## 10 — Open questions (for engineer to verify before implementing)

| # | Question | File / line |
|---|---|---|
| 1 | Where is the Run trigger today? (top of agent panel? or part of Launch Render Setup card?) | grep `launchImageAgent` calls in `js/17c-create-pipeline.js` |
| 2 | Is there a canonical cancel hook? | grep `cancel`, `abort`, `stop`, `controller.abort` in `js/17c-create-pipeline.js` |
| 3 | What events drive Total% vs Node%? | `updateSceneCardStatus` (17c:2753) + `notifyImageReady` (29:154) are first guesses — verify by tracing existing progress UI |
| 4 | Does `handleZoom` (29:1678) clamp 0.25–2.5 like mock? | read function body |
| 5 | Does `fitToView` (29:1694) take a safe-area inset? | read function body; if not, decide whether to add a chrome-aware inset |
| 6 | Does the zoom dock's "Fit" should call `fitToView` directly, or `tidyLayout` (29:344)? | the mock implies Fit = recompute bounds + scale; tidyLayout repositions nodes — different semantics; document choice |
| 7 | Where does `applyTransform` (29:1668) write the transform? | confirm it's `#graph`; chrome must not be a descendant |

## 11 — References

- Mock §5 (top pill, mock 125–171), §6 (progress strip, 173–190), §7 (telemetry, 192–201), §8 (zoom dock, 203–220), §29 (zoom/pan, 673–721)
- ADR-9 (Zoom-invariant chrome): `devDoc/adr/ADR-009-zoom-invariant-chrome.md`
- ADR-10 (Font-zoom counter-scale, applies to selection toolbar in P07 not to chrome here): `devDoc/adr/ADR-010-font-zoom-counter-scale.md`
- ADR-11 (Specificity guard): `devDoc/adr/ADR-011-specificity-guard.md`
- ADR-12 (Light-mode parity): `devDoc/adr/ADR-012-light-mode-parity.md`
- P01 token map: `devDoc/phase-01-theme-tokens.md` Section 4
- `js/29-canvas-render.js` zoom: L1668 (applyTransform), L1678 (handleZoom), L1694 (fitToView), L344 (tidyLayout)
- `js/17c-create-pipeline.js`: L3216 (launchImageAgent), L2753 (updateSceneCardStatus), L807 (updateStepStates)
