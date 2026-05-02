# ADR-009 — Zoom-invariant chrome vs zoom-transformed graph

- **Status:** Accepted (2026-05-01)
- **Affected phases:** P02 (chrome), P03 (agent panel), P04 (graph + sockets + curves), P07 (selection toolbar — special case)

## Context

The canvas has a zoom-and-pan transform. Wheel-zoom and drag-pan write to a `view = { zoom, panX, panY }` object; `applyTransform()` (`js/29-canvas-render.js:1668`) writes `transform: translate(...) scale(...)` to the `#graph` element. Children of `#graph` (nodes, sockets, curves SVG) all scale together.

Chrome elements do NOT scale:
- Top action pill (P02) — top-center, fixed
- Zoom dock (P02) — bottom-right, fixed
- Progress strip (P02) — top-right, fixed
- Telemetry (P02) — bottom-left, fixed
- Agent panel (P03) — left side, sibling of `#create-canvas-panel`, also outside `#graph`

If chrome were inside `#graph`, zooming would shrink/grow chrome buttons proportionally — at zoom 0.25, a 40px button becomes 10px and is unclickable; at zoom 2.5, the same button becomes 100px and dominates the viewport.

The selection toolbar (P07) is a **special case**: it appears 72px above the SELECTED node and follows it during pan/zoom. So it MUST live inside `#graph` (transforms with the node) — but its font and click target must remain readable, addressed by ADR-10's counter-scale pattern.

## Decision

### 1 — Chrome lives outside `#graph`

All four floating chrome elements (top pill, zoom dock, progress strip, telemetry) are `position: fixed` (or `position: absolute` against `#create-canvas-panel` if that's the offset parent). They are appended as siblings of `#graph`, NOT children. Confirmed visually by the mock (`canvas-redesign-mock.html:128, 224, 422` — chrome and graph are siblings inside `.canvas-stage`).

Agent panel (`#create-agent-panel`, `index.html:1974`) is naturally outside `#create-canvas-panel` (sibling), so it's also unaffected by zoom.

### 2 — Graph and its children scale

Nodes (cards, tabs, sockets), curves (SVG), and the dot-grid background all live inside `#graph` and scale via the single `transform: scale()` on `#graph`. This is the existing `applyTransform` pattern.

### 3 — Selection toolbar is the exception

The selection toolbar lives INSIDE `#graph` because it positions relative to the selected card (which is also inside `#graph`). When the user zooms, the toolbar moves with the card. To keep the toolbar font readable at low zoom, ADR-10 specifies a `--cg-zoom` counter-scale pattern (e.g. `font-size: calc(11px + 11px / var(--cg-zoom, 1))`).

### 4 — Context menu is chrome (zoom-invariant)

The right-click context menu (P07) is positioned at viewport coordinates (where the user clicked), not card-relative. It lives outside `#graph` (or on a higher z-index layer). It does NOT scale with zoom.

### 5 — Properties pane is chrome (zoom-invariant)

The Properties pane (P08 restyle) is part of the editor frame, not the canvas. Zoom doesn't apply to it. Confirmed by its existing DOM placement.

### 6 — Future-proofing rule

When adding a new UI element to the canvas, ask: "is this element relative to a card (selection toolbar, hover tooltip on a card) or to the viewport (top pill, zoom dock)?"
- Card-relative → INSIDE `#graph`, may need ADR-10 counter-scale.
- Viewport-relative → OUTSIDE `#graph`, naturally zoom-invariant.

Phase docs cite this ADR for any new chrome addition.

## Rationale

- **Mock confirms the pattern.** The mock author deliberately split chrome from graph at the DOM level (mock:222 `.graph-layer` vs mock:128 `.top-pill`).
- **Wheel zoom on chrome would be terrible UX.** Zooming should affect the work surface, not the controls.
- **Selection toolbar is genuinely card-relative.** Its position has no meaning without the card; it must transform with the card.
- **Counter-scale (ADR-10) handles the toolbar's readability problem cleanly.** No need to special-case toolbar placement.

## Alternatives considered

1. **All chrome inside `#graph` with a "no-zoom" CSS class.** Rejected: would require fighting the parent transform with `transform: scale(calc(1/var(--cg-zoom)))` on every chrome element; counter-scale is fragile; fixed-position is simpler.
2. **Selection toolbar outside `#graph`, repositioned in JS on every frame.** Rejected: per-frame JS positioning is expensive at 60fps; CSS transform is free.
3. **Chrome lives inside `#create-canvas-panel` but at a higher z-index than `#graph`.** Acceptable; this is essentially what `position: absolute` against `#create-canvas-panel` achieves. Use this pattern.
4. **Use Visual Viewport API for chrome positioning.** Rejected: overkill; viewport-fixed positioning with CSS works.

## Consequences

### Positive
- Clean DOM contract: chrome is sibling of graph, not child.
- No per-frame JS positioning.
- Counter-scale pattern (ADR-10) confined to selection toolbar.
- Properties pane / agent panel naturally invariant.

### Negative
- Engineers must remember the rule when adding new UI. Mitigated by phase docs and ADR.
- Selection toolbar at zoom 0.25 may appear close to its card (72px in graph-space = 18px on screen at 0.25). Mitigated by counter-scaling the toolbar's vertical offset OR accepting the proximity as the price of card-relative positioning. P07 documents the choice.
- Future "minimap" feature (currently no-op stub) will need to be carefully placed — minimap is chrome-style but its content shows graph state. Out of scope for v1.

## References

- Mock §9 (graph layer), §5/§6/§7/§8 (chrome elements): `canvas-redesign-mock.html:128, 177, 195, 207, 224, 422`
- `js/29-canvas-render.js:1668` (`applyTransform`)
- ADR-10 (font counter-scale for inside-graph elements)
- P02 phase doc (chrome implementation)
- P03 phase doc (agent panel — naturally outside)
- P07 phase doc (selection toolbar — special case)
