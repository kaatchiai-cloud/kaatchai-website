# ADR-001 — Theme token namespace (Aurora-first)

- **Status:** Accepted (2026-05-01, revised from prior version 2026-05-01T00:30)
- **Affected phases:** P01, P02, P03, P04, P05, P06, P07, P08 (every phase)
- **Supersedes:** prior architect ADR-1 ("`--cg-*` canvas-scoped vs `--sock-*` socket-typed")
- **Folds in:** inventory Part 4 conflict #12 (left-panel identity)

## Context

The redesign mock encodes its visual choices as CSS custom properties in two `[data-theme]` blocks (`mock:7–49`). The mock provides hex values for chrome (`--bg-base`, `--accent`, etc.) and a socket palette (`--sock-script` yellow, `--sock-image` orange, `--sock-video` purple, `--sock-audio` cyan-teal `#4ee0c8`, `--sock-final` blue).

Stori already ships a brand token system — **Aurora** (the `--lp-*` namespace). Aurora is defined for both `aurora.dark` (`index.html:31–64`) and `aurora.light` (`css/themes.css:27–81`) and drives Landing, Copilot (`#create-page`), and Autopilot today. The `#create-page` Family A → Family B remap at `css/styles.css:404–418` already binds Family A tokens (`--accent`, `--bg-primary`, `--bg-elevated`, `--border`, `--border-hover`, `--text-primary`, `--text-secondary`, `--text-muted`) to the corresponding Aurora `--lp-*` values, so the canvas (which mounts inside `#create-page`) inherits Aurora theming for free.

Two facts force a decision:

1. **Mock-first vs Aurora-first.** If the redesign uses the mock's hex codes directly, we ship a parallel palette that doesn't honor Aurora and will drift from brand. If we use Aurora, the mock becomes "illustrative for layout/structure only" — its colors are reference, not authority.
2. **Audio-vs-accent collision.** Mock's `--sock-audio: #4ee0c8` (cyan-teal) collides visually with Aurora's cyan accent (`oklch(80% 0.14 200)` dark, `oklch(50% 0.16 220)` light). If both ship, BGM nodes and Run buttons are nearly the same color, breaking the type-coloring contract (sockets should be a distinct color per data type, not the brand accent).

A user directive (2026-05-01) made the choice explicit: "we should use aurora theme. have it in plan. both dark and light." This ADR codifies that choice.

A separate but related conflict (inventory Part 4 #12) is **left-panel identity**: the mock's generic 56px icon rail vs the architect's directive to keep the existing 220–240px `#create-agent-panel`. Folded into this ADR because both are "what comes from the mock vs what comes from production reality" decisions.

## Decision

### 1 — Reuse Aurora for chrome / bg / border / text / accent

The canvas redesign reuses Aurora `--lp-*` tokens for all chrome roles. Specifically:

| Canvas role | Source token (in `#create-page` scope) | Underlying Aurora |
|---|---|---|
| Page background | `--bg-primary` | `--lp-bg` |
| Card / pill background | `--bg-card` | `--lp-card` |
| Card elevated bg | `--bg-elevated` | `color-mix(in oklch, var(--lp-bg) 55%, transparent)` |
| Card border (default) | `--border` | `--lp-card-bdr` |
| Card border (hover/strong) | `--border-hover` | `--lp-card-bdr-h` |
| Body text | `--text-primary` | `--lp-text` |
| Dim text | `--text-secondary` | `--lp-dim` |
| Faint / caption | `--text-muted` | `--lp-faint` |
| Brand accent | `--accent` | `--lp-accent` (Aurora cyan) |
| Accent hover | `--accent-hover` | `color-mix(in oklch, var(--lp-accent) 80%, white)` |
| Accent glow | `--accent-glow` | `--lp-glow` |
| Danger / delete | `--red` (Family A) | static; verify contrast in both themes |

No new `--cg-bg-*`, `--cg-text-*`, `--cg-border-*`, or `--cg-accent-*` tokens are invented.

### 2 — Add `--sock-*` palette as net-new (both themes)

Five socket-type tokens are net-new and added to BOTH `:root` (in `index.html` for `aurora.dark`) AND `html[data-theme="light"]` (in `css/themes.css`):

| Token | Dark value (suggested) | Light value (suggested) | Notes |
|---|---|---|---|
| `--sock-script` | `#f5c84b` | `#d9a200` | yellow |
| `--sock-image` | `#ff8a3d` | `#d6671e` | orange |
| `--sock-video` | `#b073ff` | `#8a4ddb` | purple |
| `--sock-audio` | `oklch(72% 0.13 175)` (teal/mint) | `#1ea895` (teal/mint) | **NOT cyan** — collision-resolved |
| `--sock-final` | `#4a9eff` | `#2a78d6` | blue |

Engineer must visually verify these against the live `--lp-bg` in BOTH themes (per ADR-12) before committing.

### 3 — Add `--cg-*` ONLY for canvas-specific roles Aurora doesn't cover

Three canvas-only tokens are introduced, scoped to `#create-canvas-step` so they don't leak:
- `--cg-grid-dot` — the radial-gradient dot alpha (theme-tuned: dark `rgba(255,255,255,0.06)`, light `rgba(10,22,40,0.08)`)
- `--cg-pill-blur` — chrome `backdrop-filter: blur()` radius (single value across themes; default 14px; tune per theme if light glass reads as muddy)
- `--cg-danger` — only if Aurora's `--red` proves inadequate for the canvas error semantic on the dot-grid background. Default: do NOT introduce; rely on `--red`. Re-evaluate during P04 / P07 implementation.

### 4 — Audio-vs-accent collision resolution

Mock's `--sock-audio: #4ee0c8` (cyan-teal) is replaced in production with **teal/mint** values that are clearly distinct from Aurora cyan:
- Light: `#1ea895` (matches mock-light line 41)
- Dark: `oklch(72% 0.13 175)` (engineer to verify reads as teal/mint, not green/cyan)

Brand cyan stays exclusive to `--accent` / `--lp-accent`.

### 5 — Left-panel identity (folded in)

Mock's generic 56px icon rail (mock §3, mock:80–110) is **NOT** used in production. P03 keeps and restyles `#create-agent-panel` (`index.html:1974`, ~220–240px expanded; 56px collapsed). The mock's icons are illustrative for layout-only.

## Rationale

- **Aurora is the production token system.** Stori already toggles Aurora dark/light via the existing theme toggle. Building a parallel palette would multiply maintenance and guarantee drift.
- **The remap already exists.** `#create-page` (`css/styles.css:404–418`) binds Family A → Family B. Canvas mounts inside `#create-page`. Reuse is free.
- **SVG curves auto-theme.** `redrawCurves` (`js/29-canvas-render.js:1450`) reads `--sock-{type}` via `getComputedStyle` at draw time. As long as `--sock-*` is defined in both `[data-theme]` blocks, curves repaint automatically.
- **Sockets are net-new and have no Aurora equivalent.** Type-colored data flow is a canvas-specific concept; defining `--sock-*` is the right abstraction.
- **Audio collision is real and shippable.** Eye-test confirms a node colored `#4ee0c8` is hard to distinguish from a Run button colored Aurora cyan, especially in dark mode. Teal/mint preserves the "audio = aquatic" semantic the mock author intended without colliding with brand accent.
- **Restyled agent panel honors product reality.** The mock's icon rail has no semantic content; `#create-agent-panel` already encodes the agent-step state machine. Replacing the panel would discard working data binding.

## Alternatives considered

1. **Mock-first (use mock hex codes directly).** Rejected: ships a parallel palette; no theme toggle for the canvas; drifts from brand.
2. **Aurora-first but defer light theme.** Rejected: user directive requires both themes first-class. Aurora light is shipped today; the redesign cannot regress it. ADR-12 codifies parity.
3. **Keep `--sock-audio` cyan-teal and shift Aurora accent to a different hue.** Rejected: Aurora cyan is the brand identity (settled by commit `abc3e49`, "Aurora cyan theme"). Shifting brand accent to accommodate a socket color is the wrong direction.
4. **Use the mock's icon rail AND the agent panel side-by-side.** Rejected: redundant chrome; doubles the left-edge footprint; no semantic reason to ship both.
5. **Only define `--sock-*` for dark mode and let `--lp-*` overrides "naturally" carry to light.** Rejected: there is no `--lp-sock-*`; if `--sock-*` isn't defined per theme, the light theme inherits the dark values and contrast breaks.

## Consequences

### Positive
- Single token system across the app (Aurora + minimal canvas additions).
- Theme toggle "just works" for canvas chrome and curves.
- No mock drift — mock changes don't require code changes.
- Audio socket distinguishable from brand accent.
- Agent panel state machine preserved.

### Negative
- Engineers reading the mock must remember "colors are illustrative; check Aurora for production values." Mitigated by phase docs explicitly listing the Aurora reuse table (P01 Section 4).
- Per-theme tuning required for `--sock-*` and `--cg-grid-dot` — not a one-shot define. Mitigated by ADR-12 verification gate.
- `color-mix` (used for `--accent` hover and `--has-vids` thumb border) requires per-theme verification because the base color shifts. Phase docs flag this.
- The `--cg-danger` decision is deferred — engineers will need to make a contrast judgment during P04/P07. Acceptable; documented.

## References

- Aurora dark: `index.html:31–64`
- Aurora light: `css/themes.css:27–81`
- Aurora theme inventory: `css/themes-inventory.md`
- `#create-page` Family A→B remap: `css/styles.css:404–418`
- Mock theme tokens: `canvas-redesign-mock.html:7–49`
- Agent panel DOM: `index.html:1974`
- Aurora cyan migration commit: `abc3e49` ("Aurora cyan theme: replace purple accents")
- Curves read computed style: `js/29-canvas-render.js:1450 (redrawCurves)`; mock pattern at `canvas-redesign-mock.html:651–652`
- ADR-12 (light-mode parity): the gating mechanism for "verify in both themes"
