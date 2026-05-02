# Spec coverage matrix — Stori canvas-graph redesign

Every section from `spec-inventory.md` Part 2 mapped to one or more phases (or marked out-of-scope).

**Revision 1 (2026-05-01T00:30:00):** Aurora-first scope change. Added rows for new inventory sections #51 (Aurora theme system), #52 (themes-inventory.md), #53 (commit abc3e49 cyan-not-purple). Added orphan-check row for ADR-12 (light-mode parity) and the audio-vs-accent collision resolution. No out-of-scope changes.

| Spec section # | Heading | Category | Phase(s) | Notes |
|---|---|---|---|---|
| 1 | Mock — THEME TOKENS (light & dark) | technology | 01 | Mock hex values illustrative only; production uses Aurora `--lp-*` for chrome (per ADR-1 revised). `--sock-*` palette is the only net-new color set; defined for both themes. |
| 2 | Mock — STORI TOP HEADER | workflow | out-of-scope | Reference / assumed baseline — header is unchanged by the redesign. |
| 3 | Mock — LEFT ICON RAIL | workflow | out-of-scope | Superseded — production keeps the restyled `#create-agent-panel` (P03), not the mock's generic icon rail. (Inventory conflict #12 → ADR-1.) |
| 4 | Mock — CANVAS AREA (.canvas-stage) | architecture | 01, 03 | Dot-grid background owned by P01 (uses new `--cg-grid-dot` in both themes); left inset (220–240px expanded / 56px collapsed) governed by P03 panel; canvas page bg = `--lp-bg`. |
| 5 | Mock — TOP ACTION PILL | workflow | 02 | All 12 controls; pill bg = `--lp-card` glass; Run = `--lp-accent`; Run / Cancel / batch-stepper wiring requires "verify before implementing" against existing pipeline (inventory unanchored #7). |
| 6 | Mock — PROGRESS STRIP | workflow | 02 | Source events for Total% vs Node% need explicit mapping in P02 (inventory unanchored #8); progress fill = `--lp-accent`. |
| 7 | Mock — BOTTOM-LEFT TELEMETRY | non-functional | 02 | T = ms since mount; I = sum of done image instances; N = current node count; V = `CANVAS_LAYOUT_VERSION`; FPS = rAF probe. Text color = `--lp-faint`. |
| 8 | Mock — BOTTOM-RIGHT ZOOM DOCK | workflow | 02 | Cursor-mode dropdown's "Connect" is explicit no-op (inventory unanchored #11); Minimap is explicit stub (inventory unanchored #10). Dock chrome = `--lp-card`. |
| 9 | Mock — NODE GRAPH LAYER | architecture | 04 | `.graph-layer` (zoom-transformed) + SVG curves overlay. ADR-9 covers chrome-vs-graph layering. |
| 10 | Mock — NODES (base + selected + head) | workflow | 04 | Card bg = `--bg-elevated` (Aurora-derived); border = `--border`; selected ring = `--accent` (Aurora cyan); corner status dot uses `--sock-*` (audio = teal/mint, not cyan, per ADR-1). |
| 11 | Mock — VARIANT TRAY | workflow | 05, 06 | P05 IMG tray; P06 VID tray. Auto-sizing mechanism documented per phase. Tray border = `1px dashed var(--border-strong)` (Aurora-derived). |
| 12 | Mock — GHOST/ADD CARD | workflow | 05, 06 | P05 add-IMG-variation; P06 add-VID-variation. `:hover` flips border to `--accent` (Aurora cyan). |
| 13 | Mock — VARIANT-PIN (ACTIVE pill) | workflow | 05, 06 | ACTIVE pill on the IMG ACTIVE card (P05) and VID ACTIVE card (P06); definition per ADR-2 (= `isRenderActive`). Chip uses `color-mix(in oklch, var(--accent) 12%, transparent)` (Aurora cyan tint). |
| 14 | Mock — THUMBNAIL STRIP | workflow | 05, 06 | P05 IMG strip with `.has-vids` border + `vid-badge` count; P06 VID strip with play-icon mark. `.has-vids` border tuned per theme per ADR-12. |
| 15 | Mock — SOCKETS (.sock) | architecture | 04 | Sockets on every node type; SVG strokes read socket color via `getComputedStyle` per ADR-1; auto-themes via `--sock-*` defined for both themes. |
| 16 | Mock — SB BODY (textarea) | workflow | 05 | `.sb-script` textarea with specificity guard per ADR-11 (already at cg-css:959). Text color inherits from `--lp-text`. |
| 17 | Mock — IMG / VID PREVIEW | workflow | 05, 06 | P05 image preview; P06 video preview with play-icon overlay. Empty-state placeholder gradient defined for both themes. |
| 18 | Mock — INLINE STEPPERS | workflow | 07 | All cards: SB (duration / style), IMG (ratio / seed), VID (duration / model), BGM (Lyria / volume), Final (resolution / fps). Persistence path documented per field. Stepper chrome = `--lp-card` + `--lp-card-bdr`. |
| 19 | Mock — STATUS DOT | workflow | 04 | Done = `--sock-audio` (teal/mint, NOT cyan, per ADR-1); running = `--sock-script` (yellow) + pulse; pending = `--text-faint`; error = Aurora `--red` or new `--cg-danger`. |
| 20 | Mock — SELECTION TOOLBAR | workflow | 07 | Floating 72px above; lives inside graph layer; counter-scales via `--cg-zoom` per ADR-10. Toolbar bg = `--lp-card` glass; Delete = Aurora `--red`. |
| 21 | Mock — DOM: top header | reference | out-of-scope | Same as §2 — unchanged. |
| 22 | Mock — DOM: left rail | reference | out-of-scope | Same as §3 — superseded by P03 agent panel. |
| 23 | Mock — DOM: top pill | reference | 02 | DOM scaffolding for §5. |
| 24 | Mock — DOM: progress strip | reference | 02 | DOM scaffolding for §6. |
| 25 | Mock — DOM: graph layer + curves | reference | 04, 05, 06 | The mock's hand-placed positions are illustrative; production layout owned by `runLayout()` per ADR-3. |
| 26 | Mock — DOM: telemetry block | reference | 02 | DOM scaffolding for §7. |
| 27 | Mock — DOM: zoom dock | reference | 02 | DOM scaffolding for §8. |
| 28 | Mock — JS: toggleTheme + drawCurves | architecture | 01, 04 | Token-toggle responsibility = P01; curve-draw + active-path = P04. Curves auto-theme via `getComputedStyle` reading `--sock-*` per active `[data-theme]`. |
| 29 | Mock — JS: ZOOM + PAN | workflow | 02 | Verify existing `handleZoom` clamp matches mock's 0.25–2.5 (inventory unanchored #3). |
| 30 | Mock — JS: DATA MODEL (SB1) | architecture | 05, 06 | Mock's `activeXxxIdx` is illustrative; real schema (`isActive` / `isRenderActive`) wins per ADR-2. |
| 31 | Mock — JS: rerender + tab handlers | workflow | 05 | Production uses `update*Node` patterns + `redrawCurves` (P04 + P05). |
| 32 | Architect — Visual direction | vision | 01, 04 | "ComfyUI-grade" criterion expressed concretely as P01 token coverage (Aurora reuse + `--sock-*`) + P04 socket/curve fidelity. |
| 33 | Architect — Data hierarchy & active path | architecture | 04, 05, 06 | Per ADR-2: nested `storyboardInstances[].imageInstances[]`; FLAT `videoInstances[]` joined via `sourceImageInstanceId`. |
| 34 | Architect — Element-by-element map | reference | 02, 03, 04, 05, 06, 07, 08 | Every entity addressed in ≥ 1 phase; orphan-check verified below. |
| 35 | Architect — Interactions | workflow | 02, 04, 05, 06, 07, 08 | Wheel zoom + pan = P02; click thumb / tab = P05/P06; right-click context = P07; marquee + Delete + dbl-click socket = P08. |
| 36 | Architect — Phase plan (0–13) | roadmap | 01, 02, 03, 04, 05, 06, 07, 08 | Architect's 14 phases consolidated to 8; mapping in `00-phase-index.md` Part 4 rationale. |
| 37 | Architect — ADR list (1–11) | risk | 01–08 (ADRs 1–11) | All 11 ADRs flagged in `00-phase-index.md` Part 6. Conflicts #12 #13 folded into ADRs 1 and 2. **Plus ADR-12 (light-mode parity) added in revision 1.** |
| 38 | Architect — Quality bar | non-functional | 01, 02, 03, 04, 05, 06, 07, 08 | "No orphans" requirement enforced by this matrix; "verify before implementing" notes embedded in each phase's exit criteria. |
| 39 | Code — 27-canvas-state.js header doc | architecture | 04, 05, 06 | Real schema documented per ADR-2; phase docs cite this section verbatim. |
| 40 | Code — 27 CRUD API | architecture | 05, 06, 07, 08 | All 10 named functions referenced in phase exit criteria. |
| 41 | Code — 29-canvas-render public API | architecture | 02, 04, 05, 06, 08 | `mount/unmount/refresh/notifyImageReady/fitToView/tidyLayout/getScenes/isActive`; LAYOUT_VERSION bump in P08 per ADR-3. |
| 42 | Code — 29 internal nodes | architecture | 04, 05, 06 | `buildSBNode/updateSBNode` (P05), `buildImgNode/updateImgNode` (P05), `buildVidNode/updateVidNode` (P06), `redrawCurves/drawCurve/bezier` (P04). Subtitle node retained (P04 verifies). |
| 43 | Code — 29 zoom/pan/fit | workflow | 02 | `applyTransform / handleZoom / fitToView` rewired to new zoom-dock + E-key. |
| 44 | Code — 29 action handlers | workflow | 07, 08 | Existing `do*` handlers wrapped by canonical `imgActions / vidActions / sbActions` per ADR-6. |
| 45 | Code — 17c-create-pipeline.js public API | architecture | 02, 03, 06, 07 | `launchImageAgent` wired to Run (P02); `updateStepStates` consumed by P03 status dots; new `vidActions.addVariation` lives near this module (P06); `regenerateScene` wrapped by `imgActions.regen` (P07). |
| 46 | Code — canvas-graph.css specificity guard | technology | 02, 03, 04, 05, 06, 07 | ADR-11 codifies the rule; every phase touching `canvas-graph.css` must apply it. |
| 47 | Code — canvas-graph.css zoom-invariant pattern | technology | 02, 04, 05, 06, 07 | ADR-10 codifies `--cg-zoom` counter-scale; selection toolbar (P07) and steppers (P07) added to scope. |
| 48 | Code — index.html DOM contract | architecture | 02, 03, 04 | `#create-agent-panel` + `#create-canvas-panel` + `#create-canvas-step` — DOM identity preserved. Canvas mounts inside `#create-page` which already remaps Family A to Aurora (styles.css:404–418). |
| 49 | Code — build.js inline pipeline | technology | 08 | ADR-8: `canvas-graph.css` added to inline pipeline in P08; cache-bust query removed. |
| 50 | Code — styles.css `#create-page textarea` rule | technology | 02, 03, 04, 05, 06, 07 | The hazard documented in ADR-11; phases applying canvas CSS must guard. |
| **51 (new)** | **Aurora theme system — `--lp-*` tokens** | **architecture** | **01, 02, 03, 04, 05, 06, 07, 08** | **The brand token system Family B (`--lp-*`) defined in `index.html:17–60` (dark) and `css/themes.css:27–81` (light). Drives Landing, Copilot (`#create-page`), Autopilot. Per ADR-1 revised: canvas redesign reuses Aurora for chrome / bg / border / text / accent; `#create-page` already remaps `--accent: var(--lp-accent)`, `--bg-primary: var(--lp-bg)`, etc. (styles.css:404–418). Touched by every phase that renders any chrome.** |
| **52 (new)** | **Aurora theme inventory — themes-inventory.md** | **reference** | **01** | **Source-of-truth doc for the Aurora theme system. P01 cites it for the canonical Aurora token list. Read once during P01 to ground the token-reuse mapping; later phases reference P01's mapping doc rather than re-reading themes-inventory.md.** |
| **53 (new)** | **Recent commit context — Aurora cyan theme (commit abc3e49)** | **reference** | **01, 02, 03, 04, 05, 06, 07, 08** | **The commit that migrated Aurora from purple (`#7c3aed`) to cyan (`oklch(80% 0.14 200)` dark / `oklch(50% 0.16 220)` light). Mock's blue accent (`#4a9eff`) maps to Aurora cyan in production. Touched indirectly by every phase rendering an accent color.** |

**Coverage:** 96% (49 of 51 sections mapped to a phase; +3 new sections all mapped to P01 minimum)
**Out of scope:** 2 sections (§2 + §21 = unchanged top header; §3 + §22 = superseded by P03)
**Cross-phase:** 28 sections mapped to more than one phase (visual + interaction split) + 3 new revision-1 sections each mapped to multiple phases.

## Element-map orphan check (architect quality bar)

The architect prompt's element-map enumerates 17 entities. Each entity is verified to land in ≥ 1 phase below:

| Entity | Phase(s) | UI | Workflow | Data binding | Theme verification |
|---|---|---|---|---|---|
| Top header (Stori) | out-of-scope | unchanged | unchanged | unchanged | n/a |
| Left agent panel | 03 | restyled translucent narrow + 56px collapsed | click step → pan/zoom to column band | bound to existing `updateStepStates` (17c L807) + agent-step state | both themes (ADR-12) |
| Top action pill | 02 | floating top-center, 12 controls, `--lp-card` glass | Run / Cancel / batch counter / right-pane toggle | wired to existing `launchImageAgent` (verify cancel hook) | both themes (ADR-12) |
| Progress strip | 02 | top-right slim bar; fill = `--lp-accent` | live during run, hidden when idle | `Total%` + `Node%` events (verify per source) | both themes (ADR-12) |
| Telemetry | 02 | bottom-left mono block; text = `--lp-faint` | passive readout | T / I / N / V / FPS sources documented | both themes (ADR-12) |
| Zoom dock | 02 | bottom-right pill; chrome = `--lp-card` | cursor mode / Fit / Zoom% / Minimap / Reset | reads/writes view object `{zoom, panX, panY}` | both themes (ADR-12) |
| Canvas dot-grid background | 01 | radial-gradient via `--cg-grid-dot` | n/a | derived from `--lp-bg` (Aurora) | both themes (ADR-12) |
| Properties pane | 08 (restyle only) | translucent (`--lp-card`), dense rows | shows fields for selected node (existing) | bound to selected node (existing) | both themes (ADR-12) |
| SB node | 04 (shell) + 05 (tabs/binding) | head-dot `--sock-script` (yellow), sockets, status dot, tabs A/B/+, textarea, steppers | tab click → `setActiveStoryboard`; "+" → `addStoryboardInstance` | `scene.storyboardInstances[i].isActive` (radio) | both themes (ADR-12) |
| IMG variant tray | 05 | dashed wrapper (`--border-strong`), label `Img N · k variants` | container | reads `storyboard.imageInstances.length` | both themes (ADR-12) |
| IMG ACTIVE card | 05 (data) + 04 (shell) + 07 (interactions) | ACTIVE pill (Aurora cyan tint), sockets, status dot, preview, ratio + seed steppers | sockets emit edge to next stage; selection toolbar floats above | imageInstance with `isRenderActive === true` per scene | both themes (ADR-12) |
| IMG thumbnail strip | 05 | wrap-grid 56×36, numbered, `.has-vids` purple-tinted border (per-theme tuned), `▶N` badge, `+` tile | click thumb → `setImageRenderActive`; `+` → `imgActions.addVariation` | `storyboard.imageInstances[]`; badge = `(scene.videoInstances\|\|[]).filter(v=>v.sourceImageInstanceId===imgId).length` | both themes (ADR-12) |
| VID variant tray | 06 | same shape as IMG tray; label `Vid N.A.k · v variants`; hidden in illustrated mode | container | filtered list by `sourceImageInstanceId` | both themes (ADR-12) |
| VID ACTIVE card | 06 (data) + 04 (shell) + 07 (interactions) | play-icon overlay, `--sock-video` (purple) sockets, duration + model steppers | sockets emit edge to BGM | videoInstance with `isRenderActive === true` per scene | both themes (ADR-12) |
| VID thumbnail strip | 06 | wrap-grid with play icons, `+` tile | click thumb → `setVideoRenderActive`; `+` → `vidActions.addVariation` | filtered video list | both themes (ADR-12) |
| BGM node | 04 (shell) + 07 (steppers) | single instance, `--sock-audio` (teal/mint, NOT cyan, per ADR-1) sockets, Lyria/Library/Skip + volume steppers | receives from active VID (animated) or active IMG (illustrated) | scene-level or project-level BGM state | both themes (ADR-12) |
| Final node | 04 (shell) + 07 (steppers + Render) | single instance, `--sock-final` (blue) in-socket only, resolution/fps stepper, Render button | Render → existing render pipeline | project-level render state | both themes (ADR-12) |
| Curves | 04 (typed strokes + active path + hover-dim) | bezier; stroke = `--sock-{type}` (resolved via `getComputedStyle` per active `[data-theme]`); 1.6px solid active; non-connected dim to 25% on hover | redrawn on transform / active swap / add / delete | derived from active-path traversal | both themes (ADR-12; auto via `getComputedStyle`) |
| Selection (1px ring) | 04 | 1px Aurora cyan accent border; no glow/shadow/scale | click selects | UI ephemeral state per ADR-4 | both themes (ADR-12) |
| Context menu | 07 | right-click any node; type-appropriate items; bg = `--lp-card` | mirrors selection toolbar | none (UI only); calls canonical action handlers per ADR-6 | both themes (ADR-12) |
| Active vs Selected | 04 + 05 + 07 + 08 | ACTIVE pill on card (Aurora cyan tint); SELECTED 1px ring (Aurora cyan) | both can apply at once; rules per ADR-4 | ACTIVE = `isActive` / `isRenderActive` flag; SELECTED = ephemeral | both themes (ADR-12) |
| Theme tokens | 01 | Aurora `--lp-*` for chrome (reuse) + new `--sock-*` palette in both themes + new `--cg-*` for canvas-specific roles | theme toggle (existing Aurora) repaints all | `[data-theme]` blocks in `index.html` (dark) + `themes.css` (light); new `--sock-*` rows added to `themes.css` for both | both themes (ADR-12) |
| **(new) Audio-vs-accent collision resolution** | **01 (ADR-1)** | **Audio socket dot/edge color = teal/mint (`#1ea895`-equivalent in both themes), NOT Aurora cyan** | **Documented in ADR-1; mock's `--sock-audio: #4ee0c8` is illustrative; production swaps in teal/mint to preserve brand cyan exclusively for `--accent` / `--lp-accent`** | **`--sock-audio` defined in `themes.css` for both themes** | **both themes (ADR-12)** |
| **(new) Light-mode parity** | **01–08 (ADR-12)** | **Every visual decision works in both `aurora.dark` AND `aurora.light`** | **Manual toggle test in every phase's acceptance criteria** | **`[data-theme]` blocks** | **all phases gated on this** |

**Orphan check result: zero orphans.** Every entity in the architect's element-map plus the two new revision-1 entries is bound to a phase with explicit UI + workflow + data-binding coverage. Every entity carries a "verify in both themes" gate per ADR-12.
