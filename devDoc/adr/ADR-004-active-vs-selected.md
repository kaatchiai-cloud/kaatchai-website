# ADR-004 — Active vs Selected separation

- **Status:** Accepted (2026-05-01)
- **Affected phases:** P04 (visual ring), P05 (click-thumb), P07 (interactions), P08 (clear-selected on empty stage)

## Context

The redesign introduces two distinct state concepts that look similar but mean different things:

- **ACTIVE** — "this branch's chosen variant." Persisted to scene state via `isActive` (radio for storyboard) or `isRenderActive` (radio for image/video). Affects the active-path traversal that drives curve drawing and the final render. Visible as the `ACTIVE` pill chip on the card top-right (mock §13).
- **SELECTED** — "the user clicked this." UI ephemeral; not persisted. Affects which card receives the floating selection toolbar (P07) and which cards Delete-key applies to. Visible as the 1px Aurora-cyan ring on the card border (mock §10 selected variant).

Both states can apply at once (a thumbnail is ACTIVE and the user clicked it, so it's SELECTED). The rules for click-interactions need a single owner so the redesign doesn't introduce ambiguity.

## Decision

### 1 — Separate state, separate visual

- ACTIVE = persisted instance flag (`isActive` or `isRenderActive`); visual = ACTIVE pill chip top-right (cyan tint per ADR-1).
- SELECTED = ephemeral UI state held by the canvas module; visual = 1px Aurora-cyan ring on `.node.selected` border (no glow, no shadow, no scale, per P04).

Both can apply to the same node; visual elements stack (pill + ring).

### 2 — Click rules

| Gesture | Effect on ACTIVE | Effect on SELECTED |
|---|---|---|
| Click on a node body (not a thumb) | unchanged | sets that node to SELECTED; clears prior |
| Click on a thumbnail in IMG strip | sets `setImageRenderActive` (radio) | also sets the underlying ACTIVE card to SELECTED |
| Click on a thumbnail in VID strip | sets `setVideoRenderActive` (radio) | also sets the underlying ACTIVE VID card to SELECTED |
| Click on a SB tab | sets `setActiveStoryboard` (radio) | does NOT touch SELECTED (tabs are inside `node-head`; clicking them shouldn't blow away a selection elsewhere) |
| Click on empty stage | unchanged | clears SELECTED |
| Marquee drag (P08) | unchanged | replaces SELECTED with the set of enclosed nodes |
| Right-click | unchanged | sets SELECTED to the right-clicked node, then opens context menu |
| Cmd-click / Ctrl-click on a node | unchanged | adds/removes that node from SELECTED set (multi-select) |
| Esc | unchanged | clears SELECTED |

### 3 — SELECTED is multi-cardinality

The data type is a `Set<NodeId>`. Most actions act on the set:
- Selection toolbar appears only when `|SELECTED| === 1` (or shows multi-select variant when > 1; v1 ships single-select only).
- Delete key acts on all nodes in SELECTED (P07/P08 batch confirm).
- Toolbar position: floats above the bounding box of all selected nodes (or just the single selected; v1 single only).

For v1, the toolbar only renders for single-select; multi-select is supported for Delete only. Document this scope.

### 4 — Persistence

- ACTIVE state is persisted as part of the scene save (existing behavior).
- SELECTED state is NOT persisted across mount/unmount or theme toggle. On canvas mount, SELECTED starts empty.

## Rationale

- **Two concepts, two state-stores.** Conflating them produces UX bugs ("why did clicking a thumb deselect my other card?").
- **Click-thumb sets both** because the user gesture is "I want this variant AND I'm now interacting with it" — splitting that into two clicks is friction.
- **Click-empty-stage clearing only SELECTED** preserves the pin (ACTIVE) on the chosen variant, matching mock §10 (the variant-pin persists; selection-ring is the transient marker).
- **Multi-select via Cmd/Ctrl-click** is a Figma-style convention; familiar to creator audience.
- **Esc clears SELECTED** is universal and discoverable.

## Alternatives considered

1. **One unified state ("what the user is looking at").** Rejected: doesn't distinguish ACTIVE-but-not-SELECTED (the persisted choice you're not currently editing) from SELECTED-but-not-ACTIVE (a card you clicked but hasn't been promoted).
2. **Click-thumb sets ACTIVE only, requires second click to SELECT.** Rejected: friction; unrequired; user already expressed intent.
3. **Click-empty clears both ACTIVE and SELECTED.** Rejected: ACTIVE is a persisted choice; clearing it would orphan the active path.
4. **Multi-select via marquee only (no Cmd-click).** Acceptable; v1 ships marquee (P08) and single-click. Cmd-click can be deferred. Document if not in v1.

## Consequences

### Positive
- Clean mental model.
- Toolbar/menu logic is "selected set" → "actions" — composes cleanly.
- Future multi-select (e.g. batch delete, batch regen) has a state model already.

### Negative
- Two visual cues (pill + ring) on a single node when both apply. Mitigated: pill is corner chip; ring is border outline; they coexist visually.
- Engineers must remember to call `setImageRenderActive` AND set SELECTED on click-thumb; easy to miss one. Mitigated by making the SELECTED set a named parameter in the canonical click handler.

## References

- Mock §10 (`.node.selected`): `canvas-redesign-mock.html:247–250`
- Mock §13 (`.variant-pin`): `canvas-redesign-mock.html:307–313`
- ADR-2 — schema source for `isActive` / `isRenderActive`
- ADR-6 — canonical click handlers route through these rules
- P04 — selection ring rendering
- P05 — click-thumb sets ACTIVE+SELECTED
- P07 — toolbar/menu coordinated by SELECTED state
- P08 — marquee multi-select
