# Phase 03 — Restyled Left Agent Panel

> Slug: `agent-panel-restyle` · Duration: S · Depends on: P01 · Successors: feeds none directly; runs in parallel with P02 / P04

## 1 — Scope

Restyle the existing `#create-agent-panel` (`index.html:1974`) to translucent narrow form with socket-color status dots and collapsible 56px icon strip. Keep all existing agent-step content and click handlers; chrome from Aurora `--lp-*`, status dots from `--sock-*` palette per ADR-1.

**In scope:**
- Visual restyle: ~220–240px expanded width with translucent `--lp-card` background.
- Per-step status dot mapped to socket palette colors.
- Collapse/expand toggle to 56px icon strip; state persists across canvas mount/unmount.
- Click-to-jump-to-column behavior (pan/zoom canvas to that step's column band).
- Verified in BOTH themes per ADR-12.

**Out of scope:**
- Mock's generic 56px icon rail (mock §3 / §22) — explicitly NOT used in production (ADR-1, conflict #12 fold).
- Agent-step content / data binding changes (existing `updateStepStates` at `js/17c-create-pipeline.js:807` is consumed as-is).
- Properties pane work (P08).

## 2 — Goals & non-goals

**Goals:** keep the existing agent panel DOM identity (`#create-agent-panel`) and click handlers; replace only the visual chrome and status-dot styling; add collapsibility and click-to-jump.

**Non-goals:** rewriting agent-step state machine; introducing new agent types; merging with `#create-canvas-panel`.

## 3 — Architecture & approach

The panel sits in `index.html:1974` as a sibling of `#create-workflow` (L1998) and `#create-canvas-panel` (L2476). It is OUTSIDE `#create-canvas-panel`, so it is unaffected by canvas zoom — naturally zoom-invariant per ADR-9.

The current panel already has Aurora-aware styling at `css/styles.css:2980+` (`#create-page #create-agent-panel { ... }`). This phase **revises** that block — it does NOT add a parallel block in `canvas-graph.css` (which would risk specificity collisions). Reason: the panel is owned by `#create-page`, not by `#create-canvas-step`, and the existing rules already use Aurora tokens.

**Width / collapse contract:**
- Expanded: `width: clamp(220px, 22vw, 240px)` (or fixed 232px — verify mock alignment)
- Collapsed: `width: 56px` (matches mock left-rail width for visual consistency, even though we're NOT using the mock's rail content)
- Transition: `width 0.18s ease`
- Persistence: `localStorage.setItem('stori_agent_panel_collapsed', '1' | '0')` — read on page load (FOUC-safe, set BEFORE first paint via the existing pattern in `index.html:17–21`)

**Status-dot color mapping** (per ADR-1, post-collision-resolution):

| Agent step | Dot color | Token |
|---|---|---|
| Storyboard / Script | yellow | `--sock-script` |
| Image / Visualize | orange | `--sock-image` |
| Animation / Video | purple | `--sock-video` |
| BGM / Music | teal/mint | `--sock-audio` (NOT cyan, per ADR-1) |
| Render / Export | blue | `--sock-final` |

Dot states (consume existing agent-step state from `updateStepStates`):
- pending: `--text-muted` (= `--lp-faint`)
- running: socket color + 1.2s pulse animation (matches mock running pattern)
- done: socket color + full opacity, no pulse
- error: `--red` (Family A) — verify contrast in both themes

**Click-to-jump** behavior:
- Click on agent-step row → call `CanvasGraph.fitToView()` filtered to a column band.
- Column constants are in `js/29-canvas-render.js`: `COL_LAUNCH`, `COL_BGM_*`, `COL_FINAL_*`. **Verify before implementing**: read js29 lines 1–280 to find the exact constant names and column-X values for SB / IMG / VID / BGM / Final stages. Document the mapping verbatim in this phase doc once confirmed.
- Initial mapping (verify before relying on these names):
  - Storyboard click → SB column band
  - Image click → IMG column band
  - Animation click → VID column band
  - BGM click → BGM column
  - Render click → Final column

If the column constants don't exist by these names, this phase HALTS and surfaces the mismatch as an open question; we do NOT invent column names.

## 4 — Files touched

| File | Change |
|---|---|
| `index.html` | Add a collapse toggle button at the top of `#create-agent-panel` (verify exact location L1974+); add status-dot `<span class="agent-step-dot">` to each agent-step row template if not already present |
| `css/styles.css` | Revise `#create-page #create-agent-panel { ... }` block at L2980+: translucent bg (`--lp-card`), narrow width (`clamp(220px, 22vw, 240px)`), `backdrop-filter: blur(var(--cg-pill-blur))` for parity with chrome from P02 |
| `css/styles.css` | Add `#create-page #create-agent-panel.collapsed { width: 56px; ... }` rules — hide labels, keep dot + icon |
| `css/styles.css` | Add `.agent-step-dot { width: 8px; height: 8px; border-radius: 50%; ... }` with per-step modifier classes (`.agent-step-dot--script`, `--image`, `--video`, `--audio`, `--final`) bound to the `--sock-*` tokens |
| `css/styles.css` | Add running-state pulse keyframes (or reuse if Aurora already has one — grep `@keyframes pulse`) |
| `js/17c-create-pipeline.js` | In `updateStepStates` (L807) or its caller, set the appropriate `.agent-step-dot--{type}` class and toggle `.agent-step-dot--running / --done / --error` based on agent-step state |
| `js/01-core.js` (or wherever the canvas mount happens) | Add the collapse toggle handler: read/write localStorage; toggle `.collapsed` class |
| `js/01-core.js` (or `js/17c-create-pipeline.js`) | Bind agent-step row click → call `CanvasGraph.fitToView` (or new `panToColumn(name)` API if `fitToView` doesn't accept a column filter — verify) |

## 5 — Work breakdown

1. **Verify before implementing**:
   - Read `index.html:1974+` and identify the exact agent-step row markup. Are dots already present, or do we need to add them?
   - Read `js/17c-create-pipeline.js:807 (updateStepStates)` to understand current state-class application.
   - Read `js/29-canvas-render.js` for `COL_*` column constants and `fitToView` API.
   - Read `css/styles.css:2980+` for the existing agent-panel block — what's already Aurora-aware, what isn't.
2. Add the collapse toggle button + status dots to the markup.
3. Restyle the panel block to translucent narrow + collapsed-state rules.
4. Add the dot color modifiers reading `--sock-*`.
5. Wire `updateStepStates` to set the right dot color + state class.
6. Wire collapse toggle (localStorage + class flip).
7. Wire click-to-jump (after column constants verified).
8. Manual smoke in both themes.

## 6 — Acceptance criteria

(a) Panel renders at ~220–240px expanded width with translucent background (`--lp-card` or derived) — theme-aware. Collapse toggle visible.

(b) Each agent-step row shows a status dot whose color comes from `--sock-*`:
- Storyboard → `--sock-script` (yellow)
- Image → `--sock-image` (orange)
- Animation → `--sock-video` (purple)
- BGM → `--sock-audio` (teal/mint, NOT cyan, per ADR-1)
- Render → `--sock-final` (blue)
- Script row reuses `--sock-script`

(c) Collapse/expand toggle morphs panel between full-width and 56px icon strip; state persists across canvas mount/unmount via localStorage.

(d) Existing agent-step click handlers continue to work — `updateStepStates` (L807) state binding is preserved. No regression in step-progress UI.

(e) Click on an agent-step row pans/zooms the canvas to that step's column band — `COL_LAUNCH` / `COL_BGM_*` / `COL_FINAL_*` mapping is **explicit, not inferred**, and documented in this phase doc once verified.

(f) Mock's generic 56px icon rail (mock:80–110) is NOT introduced in production — this phase explicitly replaces the rail with the restyled agent panel (per ADR-1).

(g) **Verify in BOTH `aurora.dark` AND `aurora.light`** per ADR-12: panel translucency reads correctly (dark = white-on-dark glass; light = dark-on-light glass — note Aurora's `--lp-card` flips from transparent-white to opaque-white between themes, so the glass effect is asymmetric); all 5 socket dots are visually distinct from the brand accent and from each other in BOTH themes; collapsed-strip icons remain visible.

## 7 — Manual test plan (BOTH themes)

| Step | Expected (dark) | Expected (light) |
|---|---|---|
| 1. Load canvas, theme = dark | Agent panel renders translucent, ~232px wide; 5 step rows with colored dots | n/a |
| 2. Click collapse toggle | Panel narrows to 56px; labels hide; dots + icons remain | same |
| 3. Reload page | Collapse state persists | same |
| 4. Click Run; while running, observe Image step dot | Pulses orange (`--sock-image`) | same |
| 5. After image completes, observe dot | Solid orange (`--sock-image`) at full opacity | same |
| 6. Click on BGM step row | Canvas pans/zooms to BGM column band | same |
| 7. Toggle to light | Panel becomes white-translucent; all 5 dot colors remain distinct from cyan accent | n/a |
| 8. Side-by-side: BGM dot (`--sock-audio` teal) vs Run button (`--accent` cyan) | Clearly different colors in both themes | same |
| 9. Visual sanity: Render dot blue, Image dot orange, Animation dot purple — none clash with Aurora accent | Pass | Pass |

## 8 — Rollback plan

Revert the panel-block CSS revisions and the new dot markup. The collapse toggle and click-to-jump are additive features — removing them does not affect prior behavior. localStorage key can be left orphaned with no impact.

## 9 — Risks & mitigations

| Risk | Mitigation |
|---|---|
| Click-to-jump column constants don't exist by name | Verify before implementing; HALT and surface as open question if mismatch |
| Pulse animation conflicts with existing Aurora pulse keyframes | Grep `@keyframes`; reuse existing if compatible; namespace new ones (`agent-step-pulse`) |
| Collapse state localStorage read happens after first paint (FOUC) | Read in the same inline-script slot as `data-theme` (`index.html:17–21`); apply class before stylesheet |
| Light-mode `--sock-audio` teal dot reads as cyan against white card | Verify visually; if needed, slightly shift hue per P01 open question #2 |
| Existing `#create-page #create-agent-panel` rules at L2980+ have higher specificity than expected | Audit cascade; if conflict, add `body:has(...)` guard or scope new rules properly |

## 10 — Open questions (for engineer to verify before implementing)

| # | Question | File / line |
|---|---|---|
| 1 | What are the exact `COL_*` constant names and X-coordinates for SB / IMG / VID / BGM / Final? | `js/29-canvas-render.js` lines ~1–280 |
| 2 | Does `fitToView` accept a column filter, or do we need a new `panToColumn(name)` API? | `js/29-canvas-render.js:1694` |
| 3 | Are agent-step dots already present in markup, or do we need to add them? | `index.html:1974+` |
| 4 | Does `updateStepStates` already toggle a class per state, or does it write inline styles? | `js/17c-create-pipeline.js:807` |
| 5 | Is there an existing pulse keyframe to reuse, or do we add one? | grep `@keyframes` in styles.css + canvas-graph.css |
| 6 | What is the exact list of agent steps today? (the mapping in Section 3 assumes 5 — Script/Storyboard, Image, Animation, BGM, Render — but the list could be 4 or 6) | read panel markup |

## 11 — References

- Mock §3 / §22 (left rail — explicitly NOT used; ADR-1 fold)
- Index DOM: `index.html:1974` (`#create-agent-panel`)
- Existing panel styles: `css/styles.css:2980+`
- ADR-1 (Theme tokens, panel-identity fold): `devDoc/adr/ADR-001-theme-token-namespace.md`
- ADR-9 (Zoom-invariant chrome — agent panel is naturally outside graph): `devDoc/adr/ADR-009-zoom-invariant-chrome.md`
- ADR-12 (Light-mode parity): `devDoc/adr/ADR-012-light-mode-parity.md`
- P01 token table: `devDoc/phase-01-theme-tokens.md` Section 4
- Pipeline binding: `js/17c-create-pipeline.js:807` (`updateStepStates`)
- Canvas API: `js/29-canvas-render.js:1694` (`fitToView`), `:344` (`tidyLayout`)
