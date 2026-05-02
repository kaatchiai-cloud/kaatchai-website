# ADR-005 — Variant-tray rendering strategy

- **Status:** Accepted (2026-05-01)
- **Affected phases:** P05 (IMG tray), P06 (VID tray)

## Context

Each storyboard's IMG variant tray and each active-image's VID variant tray render a thumbnail strip of sibling variants:
- IMG strip: `storyboardInstance.imageInstances[]` (typically 1–10 thumbs in v1)
- VID strip: `(scene.videoInstances || []).filter(v => v.sourceImageInstanceId === activeImg.id)` (typically 1–5 thumbs in v1)

Each thumbnail is 56×36 px, decorated with index number, optional `vid-badge` count chip, optional `.has-vids` purple-tinted border, and an interactive hit area for click-to-set-active.

Two implementations are possible:
1. **DOM nodes** — one `<div class="thumb">` per variant, styled with CSS, hit-tested by browser.
2. **Canvas (HTML `<canvas>`)** — paint the strip as bitmaps; hit-test in JS.

DOM is simpler and inherits theming for free; canvas is faster at scale.

## Decision

**DOM nodes for MVP.** Each thumb is a `<div class="thumb">` (or `<button>` for accessibility) styled per `css/canvas-graph.css` rules added in P05/P06.

**Threshold for revisit:** when a single strip exceeds ~50 thumbs and visible performance degrades (scroll lag, click delay), reconsider canvas/virtualization. Until then, DOM is the canonical path.

## Rationale

- **Aurora theming is free.** DOM thumbs inherit `--lp-card`, `--border`, `--sock-video` via `var()` — no draw-time color resolution. Theme toggle re-paints automatically.
- **`color-mix` works in CSS.** `.has-vids` border = `color-mix(in oklch, var(--sock-video) 60%, var(--border))` and `vid-badge` bg = `color-mix(in oklch, var(--sock-video) 80%, var(--bg-elevated))` are CSS-native — no canvas analog without manual color math.
- **Hit-testing is free.** Click handlers attach via event delegation on the strip container; no manual bounding-box logic.
- **Accessibility is free.** Keyboard focus, screen-reader labels work natively on `<button>`.
- **v1 strip sizes are small.** Typical scene has 3–5 image variants and 0–3 video variants per image. Even at 10 strips × 5 thumbs = 50 nodes, DOM is fine.
- **Painting performance is not the bottleneck at v1 scale.** The dominant cost is image-thumbnail-rendering (image decode + bitmap rasterize), not DOM node count.

## Alternatives considered

1. **Canvas-backed thumb strip from day one.** Rejected: more code for v1 with no measured need; loses CSS-native theming; loses keyboard accessibility; loses `color-mix` ergonomics.
2. **Virtualization (windowed list of DOM thumbs).** Rejected: overkill for 5–10 thumbs; only worth it past 50.
3. **WebGL-based strip.** Rejected: heavy dependency; no v1 justification.
4. **HTML `<img>` tags directly without wrapping `<div>`.** Rejected: can't style border / overlay / index-number / vid-badge cleanly without a wrapper.

## Consequences

### Positive
- Fast to implement.
- Theme toggle works immediately.
- Accessibility for free.
- No new rendering pipeline to maintain.

### Negative
- Performance ceiling around 50 thumbs per strip. Mitigated: at v1 we don't approach this; ADR re-evaluates if we do.
- Layout reflows on strip update (add/remove thumb). Mitigated: strip updates are gesture-driven, not 60fps; reflow cost is negligible at small scale.
- Each thumb is a separate DOM node (memory footprint ~1KB per thumb). At 50 thumbs/strip × 10 strips × 5 scenes = 2500 nodes. Acceptable.

## Revisit triggers

Revisit this ADR (consider canvas / virtualization) when ANY of:
- A single IMG strip exceeds 30 thumbs in production usage.
- Scrolling/clicking a strip introduces measurable lag (>16ms per gesture).
- Memory profile shows the canvas module exceeds 50MB on a typical project.

If any trigger fires, open ADR-005-revision-1 with measurements and the new approach.

## References

- Mock §14 (thumbnail strip): `canvas-redesign-mock.html:315–366`
- ADR-2 (schema — strip data sources)
- ADR-12 (light-mode parity — DOM theming benefit)
- P05 phase doc — IMG strip
- P06 phase doc — VID strip
