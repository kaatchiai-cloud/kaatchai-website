# ADR-010 — Font sizing at low zoom (`--cg-zoom` partial counter-scale)

- **Status:** Accepted (2026-05-01)
- **Affected phases:** P02 (does NOT apply — chrome is outside graph), P04 (sockets/curves — no text, n/a), P05 (thumb labels at low zoom), P06 (VID tray labels), P07 (selection toolbar + steppers — primary application)

## Context

When the canvas zooms to 0.25, all text inside `#graph` shrinks to 25% of its CSS size. A 13px label becomes ~3px on screen — unreadable.

The existing CSS at `css/canvas-graph.css:967` already addresses this for the SB textarea (`.cg-prompt`):

```css
#create-canvas-step textarea.cg-prompt {
  font-size: calc(8px + 8px / var(--cg-zoom, 1));
  /* at zoom=1.0:  font-size = 16px (reads as 16px on screen)
     at zoom=0.5:  font-size = 24px (reads as 12px on screen)
     at zoom=0.25: font-size = 40px (reads as 10px on screen)
   */
}
```

The pattern is **partial inverse scaling**: a base size + an inverse-zoom term. At zoom=1, font-size = 2×base. At zoom < 1, font-size grows but scales-down on screen still produces a readable size (10–12px on screen at zoom 0.25).

The variable `--cg-zoom` is set by JS in `applyTransform` (`js/29-canvas-render.js:1668`) — written to the `#graph` element's inline style on every transform update.

The redesign introduces several text-bearing elements inside `#graph` that need this treatment:
- Selection toolbar buttons (P07) — labels "Regen", "Variation", "Download", "Delete"
- Inline steppers (P07) — `◀ value ▶` text
- Thumb index numbers and `vid-badge` count chips (P05/P06)
- ACTIVE pill chip text (P05/P06)
- Tray labels "Img N · k variants" (P05/P06)

## Decision

### 1 — Reusable counter-scale formula

Establish two variants of the formula:

**Strong** (large readable at low zoom; for primary controls):
```css
font-size: calc(11px + 11px / var(--cg-zoom, 1));
/* zoom=1.0: 22px on canvas, 22px on screen
   zoom=0.5: 33px on canvas, 16.5px on screen
   zoom=0.25: 55px on canvas, 13.75px on screen */
```

**Light** (smaller, for labels/captions; matches existing `.cg-prompt` pattern):
```css
font-size: calc(8px + 8px / var(--cg-zoom, 1));
/* zoom=1.0: 16px on canvas, 16px on screen
   zoom=0.25: 40px on canvas, 10px on screen */
```

### 2 — Apply to elements inside `#graph` that bear text

| Element | Variant | Phase |
|---|---|---|
| Selection toolbar button labels | Strong | P07 |
| Inline stepper value text | Light | P07 |
| Inline stepper arrow `◀▶` | Strong (bigger touch target) | P07 |
| Thumb index number | Light | P05 |
| `vid-badge` count chip text | Light | P05 |
| Tray label "Img N · k variants" | Light | P05/P06 |
| ACTIVE pill chip "ACTIVE" text | Light | P05/P06 |
| SB tab letters `[A][B]` | Strong (clickable target) | P05 |

### 3 — Do NOT apply to

- Chrome elements (top pill, zoom dock, progress strip, telemetry, agent panel) — they're outside `#graph`, naturally invariant. Use plain `font-size`.
- Curves (no text).
- Sockets (no text).
- Status dots (visual marker, not text).

### 4 — `--cg-zoom` write contract

`applyTransform` (`js/29-canvas-render.js:1668`) MUST write `--cg-zoom` to the `#graph` element's inline style on every zoom change. Verify this is the case in P02 (the phase that touches zoom wiring); if not, add it.

The default value `var(--cg-zoom, 1)` ensures sane behavior if the variable isn't set yet (initial paint before first transform).

### 5 — Click target size

In addition to font, click targets at low zoom need padding that scales similarly. Pattern:

```css
#create-canvas-step .cg-toolbar-btn {
  font-size: calc(11px + 11px / var(--cg-zoom, 1));
  padding: calc(4px + 4px / var(--cg-zoom, 1)) calc(8px + 8px / var(--cg-zoom, 1));
}
```

Engineer judgment: not every text element needs counter-scaled padding. The SB tab letters DO (they're clickable); the ACTIVE pill chip does NOT (it's read-only).

## Rationale

- **Existing pattern works.** `.cg-prompt` has used this for months without complaint; extending it is low-risk.
- **`--cg-zoom` is a single source.** Setting it once in `applyTransform` covers all consumers.
- **Two variants cover the cases.** Light for labels, Strong for clickable. More granularity is overkill.
- **Default fallback `var(--cg-zoom, 1)`** prevents broken layouts on first paint.
- **Selective application** avoids visual oddity (e.g. the ACTIVE pill text doesn't need to stay readable at zoom 0.25; the user at that zoom is looking at structure, not chip text).

## Alternatives considered

1. **Full inverse scale `font-size: calc(13px / var(--cg-zoom, 1))`.** Rejected: at zoom 2.5, font shrinks to 5px on canvas and 12.5px on screen — actually OK at high zoom, but at low zoom the font becomes huge in canvas space which messes with line wrapping and layout calculations.
2. **Step function (different base sizes at zoom thresholds).** Rejected: requires JS toggle; CSS is cleaner.
3. **Use `cqi`/`cqb` container query units.** Rejected: containers don't track parent transform; doesn't help.
4. **Don't counter-scale; rely on user zooming chrome instead.** Rejected: defeats the purpose of having a card-relative toolbar.

## Consequences

### Positive
- Reusable formula across phases.
- Existing `.cg-prompt` precedent confirms the pattern is sound.
- Two variants cover most cases without proliferating special rules.
- Click targets remain hittable at low zoom.

### Negative
- Font size at zoom=1 is larger than the visual design (mock) intended (mock specifies 11px; counter-scale renders 22px). Mitigated by lowering the base: `calc(7px + 7px / var(--cg-zoom, 1))` produces 14px at zoom=1, 14×2=28px on screen — closer to mock at zoom=1, still readable at 0.25. Engineer to tune per element.
- More CSS variables to track.
- At zoom > 1, counter-scaled text shrinks (e.g. zoom=2: 11+5.5=16.5px on canvas, 33px on screen — bigger than zoom=1 in screen-space). Acceptable.
- `--cg-zoom` write must be exact; a missed update produces stale font sizes. Verify in P02.

## References

- `css/canvas-graph.css:967` (existing `.cg-prompt` precedent)
- `css/canvas-graph.css:1135–1148` (counter-scale region)
- `js/29-canvas-render.js:1668` (`applyTransform` — must set `--cg-zoom`)
- ADR-9 (zoom-invariant chrome — chrome doesn't need this; selection toolbar does)
- P02 (verify `--cg-zoom` is written)
- P05/P06 (thumb labels)
- P07 (toolbar + steppers)
