# ADR-003 — `CANVAS_LAYOUT_VERSION` bump strategy

- **Status:** Accepted (2026-05-01)
- **Affected phases:** P04 (executes the bump), P08 (verifies and ships)

## Context

`CANVAS_LAYOUT_VERSION` is a module-level constant at `js/29-canvas-render.js:20`, currently `6`. It is bumped whenever geometry constants (column X, row spacing, node padding, socket offsets) change in a way that invalidates user-saved positions.

`runLayout()` at `js/29-canvas-render.js:265` checks each scene's `_layoutVersion` against the constant; on mismatch (`scene._layoutVersion !== CANVAS_LAYOUT_VERSION`), it null-clears stale `canvasPosition` so nodes are re-placed from scratch (`L277, L283`).

The redesign:
- P04 adds 12px-diameter sockets on node edges (`top: 16px`, `in left: -8px`, `out right: -8px`). Card chrome shrinks (border thickness change). Selection ring becomes 1px in-bounds (no scale). Status dot moves to top-right corner.
- P05 adds the IMG variant tray (dashed wrapper around ACTIVE card + thumbnail strip).
- P06 adds the VID variant tray.

These changes alter the geometry that `runLayout` uses to place nodes. A user with v6-saved positions will see overlap or empty space. The `_layoutVersion` mechanism handles this — but only if the constant is bumped.

Two questions:
1. **When to bump?** Bumping early means migration runs immediately; bumping late means users with saved-positions get incorrect layout until P04 ships.
2. **One bump or many?** P04 changes node geometry; P05 adds tray geometry; P06 adds tray; P08 closes out. Bumping at each phase forces multiple migrations.

## Decision

### 1 — Bump from `6` to `7` exactly once, in P04

P04 is the first phase that visibly invalidates saved positions (sockets change card boundaries, selection ring changes occupied space). The bump happens in P04's commit:

```js
// js/29-canvas-render.js
const CANVAS_LAYOUT_VERSION = 7;  // was 6 (P04 — sockets + card chrome shrink)
```

P05 / P06 / P07 / P08 do NOT bump again, even though they add DOM. Their additions are children of the existing nodes (tabs inside `node-head`, trays inside the column band) and do NOT change the `runLayout` geometry contract.

### 2 — `runLayout` migration semantics

When a v6-saved scene loads under v7:
- `runLayout` sees `scene._layoutVersion === 6` ≠ `7`.
- It clears stale `canvasPosition` on each storyboard / image / video instance for that scene (`js/29-canvas-render.js:277` block).
- It runs auto-layout with v7 geometry.
- It writes `scene._layoutVersion = 7` (`L283`).
- The scene is now v7-positioned for all future loads.

This is a **one-way** migration: we do NOT keep both v6 and v7 positions. Once a scene is v7, it stays v7. If we ever need to roll back the redesign, decrementing the constant alone is NOT enough — users' v7 positions remain (`6 < 7`, so `runLayout` does not re-run for users on v7).

### 3 — Mid-redesign user data semantics

Users who load a project mid-redesign (e.g. after P04 lands but before P05) will:
- See their nodes auto-layouted with v7 geometry (sockets visible, cards smaller).
- NOT see SB tabs / IMG variant tray (those come in P05).
- See no errors, no orphan state.

This is acceptable because each phase is shippable independently and the user experience is "redesign in progress, more to come."

### 4 — P08 verification

P08 verifies the bump is in place at ship time and that `runLayout` migrates v6 → v7 cleanly in BOTH themes. If P04 deferred the bump (e.g. because socket geometry was implemented but didn't actually break layout), P08 ships the bump.

## Rationale

- **One bump = one migration event for users.** A user who loads a project once during the redesign migrates exactly once; they don't see successive layout shifts.
- **P04 is the visible-break point.** Sockets and chrome changes are user-visible; that's the right anchor for the bump.
- **`_layoutVersion` is monotonic.** Bumping forward is safe; bumping backward leaves stale positions on user data. We accept that.
- **P05/P06/P07 are additive within the existing node footprint.** Tabs and trays don't move the node's center or change `canvasPosition` semantics — they add children inside.

## Alternatives considered

1. **Bump per-phase (6 → 7 → 8 → 9).** Rejected: forces N migration events per user; no benefit.
2. **Bump only in P08 at ship time.** Rejected: users on partial-redesign builds (P04 landed, P05 not yet) see broken layout (sockets misalign with v6 positions).
3. **Skip the bump entirely; rely on visual tolerance.** Rejected: socket additions push card boundaries; v6 positions cause socket-overlap with adjacent nodes.
4. **Migrate by computing v6→v7 offset in JS.** Rejected: more complex; auto-layout already exists and is the canonical path.

## Consequences

### Positive
- Clean migration; one event per user.
- `_layoutVersion` mechanism does the heavy lifting.
- No data loss (legacy fields untouched; only `canvasPosition` is recomputed).

### Negative
- Users lose their hand-tuned positions. Mitigated by: most users haven't hand-tuned; auto-layout is good enough; user can drag-reposition after.
- Rollback of the redesign post-ship is awkward (users on v7 stay on v7 unless we add a v8 = "back to v6 layout" bump). Document this in the rollback plan if needed.
- Saved-position semantics across multiple machines: a user opens a project on machine A (migrated to v7), then opens on machine B (also migrated). They won't conflict because `_layoutVersion` is per-scene-on-load. Acceptable.

## References

- `js/29-canvas-render.js:20` — `CANVAS_LAYOUT_VERSION` constant
- `js/29-canvas-render.js:265` — `runLayout()`
- `js/29-canvas-render.js:277, L283` — version check + write
- P04 phase doc: `devDoc/phase-04-node-shell-and-curves.md`
- P08 phase doc: `devDoc/phase-08-qol-and-shipping.md`
