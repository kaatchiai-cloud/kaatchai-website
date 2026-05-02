# Phase 01 — Aurora-derived Theme Tokens & Canvas Background

> Slug: `theme-tokens` · Duration: XS · Depends on: — · Successors: P02, P03, P04 (every later phase reads from this)

## 1 — Scope

Establish the chrome + socket palette and dot-grid background that every later phase reads from.

**In scope:**
- Reuse Aurora `--lp-*` tokens for chrome / bg / border / text / accent (covered by existing `#create-page` remap at `css/styles.css:404–418`).
- Add the new `--sock-*` socket palette (5 type colors) for both `aurora.dark` and `aurora.light`.
- Add canvas-only `--cg-*` tokens (`--cg-grid-dot`, `--cg-pill-blur`, optionally `--cg-danger`) for both themes.
- Resolve audio-vs-accent collision: socket-audio remaps to teal/mint; brand cyan stays exclusive to `--accent` / `--lp-accent`.
- Render the canvas dot-grid background using `--cg-grid-dot` against `--lp-bg` in both themes.

**Out of scope:**
- Any chrome/node restyle that consumes the tokens (P02, P03, P04 do that).
- Any DOM change inside `#create-canvas-step`.
- Properties pane work (deferred to P08).

## 2 — Goals & non-goals

**Goals:** zero new chrome colors invented where Aurora already covers the role; one `--sock-*` namespace defined identically-named in both `[data-theme="dark"]` and `[data-theme="light"]`; theme toggle (existing Aurora toggle) repaints canvas background, sockets, and curves without page reload.

**Non-goals:** changing any Aurora token; landing-page or Properties-pane theming; DOM restyle.

## 3 — Architecture & approach

The canvas mounts inside `#create-page`, which already runs the Family A → Family B remap at `css/styles.css:404–418`. That remap binds `--accent: var(--lp-accent)`, `--bg-primary: var(--lp-bg)`, `--bg-elevated: color-mix(in oklch, var(--lp-bg) 55%, transparent)`, `--border: var(--lp-card-bdr)`, `--border-hover: var(--lp-card-bdr-h)`, `--text-primary: var(--lp-text)`, `--text-secondary: var(--lp-dim)`, `--text-muted: var(--lp-faint)`. The canvas inherits all of these for free.

Net-new tokens are added in **two places**:

1. **`css/themes.css`** — the socket palette `--sock-*`, defined under `html[data-theme="light"]` and (via paired addition in `index.html:31–64` `:root`) under dark. This placement guarantees the theme-toggle code path repaints them. SVG curves read these via `getComputedStyle().getPropertyValue('--sock-' + type)` per `js/29-canvas-render.js:1450 (redrawCurves)`.
2. **`css/canvas-graph.css`** — the canvas-only `--cg-*` tokens scoped to `#create-canvas-step` (so they don't leak to other pages). These are: `--cg-grid-dot` (radial-gradient dot alpha), `--cg-pill-blur` (chrome backdrop-filter blur radius), and `--cg-danger` if and only if Aurora's existing `--red` does not produce sufficient contrast on the canvas dot-grid background.

**Audio-vs-accent collision resolution** (per ADR-1): mock encodes `--sock-audio: #4ee0c8` (cyan-teal), which collides with Aurora cyan accent. Production remaps audio to teal/mint:
- Light: `#1ea895` (matches mock light line 41)
- Dark: an oklch equivalent in the same hue family — proposed `oklch(72% 0.13 175)` which yields teal/mint distinct from Aurora cyan (`oklch(80% 0.14 200)`). **Verify before implementing**: render both side-by-side against the dot-grid in dark and light and confirm visual distinction; tune lightness/chroma if either reads as "cyan" or "green" instead of "teal/mint".

## 4 — Files touched

| File | Change | Anchor / line |
|---|---|---|
| `index.html` | Add `--sock-script / --sock-image / --sock-video / --sock-audio / --sock-final` to the `:root` Aurora-dark block | after existing `--lp-*` block, before `--lp-font-display` (currently L31–64) |
| `css/themes.css` | Add the same five `--sock-*` rows under `html[data-theme="light"]` | after the `--text-muted` row (currently L80) |
| `css/canvas-graph.css` | Add `#create-canvas-step { --cg-grid-dot: …; --cg-pill-blur: …; }` block, plus optional `--cg-danger`, **with both `[data-theme="dark"]` and `[data-theme="light"]` variants if alpha differs by theme** | top of file, after the existing `:root` if any (current L1233 `#create-canvas-step` rule is the natural anchor) |
| `css/canvas-graph.css` | Update `.canvas-stage` (or the existing graph-layer background rule) to use `radial-gradient(circle at 1px 1px, var(--cg-grid-dot) 1px, transparent 0) 0 0 / 24px 24px` per mock:117–119 | locate by grep for the existing dot-grid rule; if no rule exists, add to `#create-canvas-step` block |

**Token mapping table — must appear verbatim in the phase doc footer for downstream phases to cite (per ADR-1).** This is the canonical Aurora reuse vs net-new map:

| Role (canvas semantic) | Source token | Notes |
|---|---|---|
| Page background | `--lp-bg` | dark `#050814`, light `#eef2f7` |
| Card / pill background | `--lp-card` | dark `rgba(255,255,255,0.035)`, light `rgba(255,255,255,0.85)` |
| Card border (default) | `--border` (= `--lp-card-bdr`) | via `#create-page` remap |
| Card border (hover/strong) | `--border-hover` (= `--lp-card-bdr-h`) | via `#create-page` remap |
| Card elevated bg | `--bg-elevated` (= `color-mix(in oklch, var(--lp-bg) 55%, transparent)`) | via `#create-page` remap |
| Body text | `--text-primary` (= `--lp-text`) | via remap |
| Dim text | `--text-secondary` (= `--lp-dim`) | via remap |
| Faint / caption | `--text-muted` (= `--lp-faint`) | via remap |
| Brand accent | `--accent` (= `--lp-accent`) | Aurora cyan in both themes |
| Accent hover | `--accent-hover` (= `color-mix(in oklch, var(--lp-accent) 80%, white)`) | via remap |
| Accent glow | `--accent-glow` (= `--lp-glow`) | via remap |
| Danger / delete | `--red` (Family A) or new `--cg-danger` if needed | verify contrast in P07 |
| Socket — script (yellow) | `--sock-script` | net-new; defined both themes |
| Socket — image (orange) | `--sock-image` | net-new; defined both themes |
| Socket — video (purple) | `--sock-video` | net-new; defined both themes |
| Socket — audio (teal/mint) | `--sock-audio` | net-new; **NOT cyan** (collision-resolved) |
| Socket — final (blue) | `--sock-final` | net-new; defined both themes |
| Dot-grid alpha | `--cg-grid-dot` | net-new; canvas-only |
| Chrome blur radius | `--cg-pill-blur` | net-new; canvas-only |

Suggested values (verify visually before committing):

```css
/* index.html :root (aurora.dark) */
--sock-script: #f5c84b;   /* yellow */
--sock-image:  #ff8a3d;   /* orange */
--sock-video:  #b073ff;   /* purple */
--sock-audio:  oklch(72% 0.13 175);  /* teal/mint — NOT cyan */
--sock-final:  #4a9eff;   /* blue */

/* css/themes.css html[data-theme="light"] */
--sock-script: #d9a200;   /* deeper yellow for AA on light card */
--sock-image:  #d6671e;
--sock-video:  #8a4ddb;
--sock-audio:  #1ea895;   /* matches mock light:41 */
--sock-final:  #2a78d6;

/* css/canvas-graph.css #create-canvas-step (dark default) */
--cg-grid-dot: rgba(255,255,255,0.06);
--cg-pill-blur: 14px;

/* css/canvas-graph.css html[data-theme="light"] #create-canvas-step */
--cg-grid-dot: rgba(10,22,40,0.08);
--cg-pill-blur: 14px;
```

> All hex/oklch values above are **suggested** — the engineer must visually verify in BOTH themes against the live `--lp-bg` before committing. Per ADR-12, do not ship until both themes pass the eye-test.

## 5 — Work breakdown

1. Read `css/themes-inventory.md` once to confirm Aurora token coverage. Do NOT re-read it in later phases.
2. Add `--sock-*` rows to `:root` in `index.html` (dark) and to `html[data-theme="light"]` in `css/themes.css`.
3. Add `--cg-grid-dot` and `--cg-pill-blur` to `#create-canvas-step` in `canvas-graph.css` for both themes.
4. Add or update the dot-grid background rule on the canvas stage to consume `--cg-grid-dot`.
5. Manual smoke: load `index.html`, navigate to canvas, toggle theme — confirm background, sockets (when present from later phases), and curves repaint without reload.
6. Write the token mapping table (above) into a section of this phase doc that downstream phases cite by reference.

## 6 — Acceptance criteria

(a) **Aurora chrome reuse mapping documented.** Section 4 above lists every canvas role and the Aurora token it consumes — verified in both themes. No new `--cg-bg-*` / `--cg-text-*` variables invented where Aurora already covers the role.

(b) **`--sock-*` palette defined for both themes.** Five socket types in both `[data-theme="dark"]` and `[data-theme="light"]`. `--sock-audio` = teal/mint, NOT Aurora cyan, per ADR-1 collision resolution.

(c) **Canvas-specific `--cg-*` tokens** for both themes: `--cg-grid-dot` (alpha tuned per theme), `--cg-pill-blur` (single value, no per-theme tuning needed). `--cg-danger` introduced ONLY if Aurora `--red` proves inadequate.

(d) **Canvas stage dot-grid renders** in both `aurora.dark` AND `aurora.light` — pixel-perfect: 24px spacing, 1px dot, alpha matches theme. Manually verify both themes.

(e) **Theme toggle repaints** canvas background, sockets, and curves without page reload — verify dark→light AND light→dark.

(f) **No visual regression** in pre-existing canvas in either theme. Diff against the current canvas (with `body.canvas-active` flipped on) — no color shifts on existing chrome.

(g) **Phase doc lists Aurora reuse vs net-new** with rationale per token (this section, table in Section 4).

## 7 — Manual test plan (BOTH themes — per ADR-12)

| Step | Expected (dark) | Expected (light) |
|---|---|---|
| 1. Load `index.html`, click "Create" → canvas mounts | Dot-grid visible, alpha ~6% on `#050814` | Dot-grid visible, alpha ~8% on `#eef2f7` |
| 2. Open DevTools, inspect `#create-canvas-step` computed style | `--cg-grid-dot` resolves; `--lp-bg` resolves to dark hex | `--cg-grid-dot` resolves; `--lp-bg` resolves to light hex |
| 3. Inspect `:root` (dark) or `html[data-theme="light"]` for the 5 `--sock-*` rows | All 5 present | All 5 present |
| 4. Toggle theme via existing Aurora theme toggle | Background, dot color, all `--lp-*` repaint | Background, dot color, all `--lp-*` repaint |
| 5. Render any node from a saved scene (P04 not landed yet, but if a Subtitle node exists pre-redesign, verify it doesn't regress) | No color shift on existing card | No color shift |
| 6. Visual sanity: do `--sock-audio` (teal/mint) and `--accent` (cyan) read as **distinctly different** colors in both themes? | YES — teal vs cyan gap visible | YES — teal vs cyan gap visible |

## 8 — Rollback plan

The phase is purely additive (CSS variables only). Rollback = revert the additions in `index.html`, `css/themes.css`, and `css/canvas-graph.css`. No data migration; no JS change; no risk of orphan state.

## 9 — Risks & mitigations

| Risk | Mitigation |
|---|---|
| Audio teal/mint reads as cyan in one theme but not the other (eye perceives `oklch` differently against different backgrounds) | Per-theme tuning: pick the dark oklch to read as teal on `#050814` and pick the light hex to read as teal on `#eef2f7`; do not assume one value works for both |
| `--cg-grid-dot` too faint on light → invisible grid | Light-theme alpha ≥ 0.08; verify on the actual `--lp-bg` (`#eef2f7`) — alpha that works on white is too faint on light blue-grey |
| Socket palette saturates poorly on light card backgrounds (Aurora `--bg-elevated` is white on light) | Light-theme socket hex values are darker (suggested above); verify AA contrast against white |
| Future canvas widgets re-introduce mock hex codes by accident | Phase docs cite the token table in Section 4 by reference; ADR-1 codifies the rule |

## 10 — Open questions (for engineer to verify before implementing)

| # | Question | Resolution path |
|---|---|---|
| 1 | Does Aurora's existing `--red` (`#c03c3c` light, dark equivalent in styles.css) read OK on the canvas dot-grid for the error status dot and Delete button? | Render a 6px error dot on `#create-canvas-step` against `--lp-bg` in both themes; if it disappears or clashes, introduce `--cg-danger` (canvas-scoped) and document why |
| 2 | Does the dark socket-audio oklch (`oklch(72% 0.13 175)` proposed) actually look teal/mint to the eye, or does it drift toward green/cyan? | Side-by-side render with `--accent` and `--sock-final` (blue); tune chroma/hue until clearly distinct |
| 3 | Should `--cg-pill-blur` differ per theme? Light backgrounds may need less blur to keep glass legible | Default 14px both; if light glass reads as muddy, tune light to 10px |

## 11 — References

- Mock layout / structure: `/Users/praveen/Desktop/stori/canvas-redesign-mock.html` (themes block 7–49; dot-grid 117–119; sockets 368–380; curves 633–671)
- Aurora dark tokens: `index.html:31–64`
- Aurora light tokens: `css/themes.css:27–81`
- Aurora theme inventory: `css/themes-inventory.md`
- `#create-page` Family A → Family B remap: `css/styles.css:404–418`
- ADR-1 (Theme token namespace, Aurora-first): `devDoc/adr/ADR-001-theme-token-namespace.md`
- ADR-12 (Light-mode parity guarantee): `devDoc/adr/ADR-012-light-mode-parity.md`
- ADR-8 (Build pipeline — affects when these tokens become inlined): `devDoc/adr/ADR-008-build-pipeline.md`
