# ADR-007 — Backwards compat for saved projects

- **Status:** Accepted (2026-05-01)
- **Affected phases:** P04, P05, P06, P08

## Context

Stori projects saved before the instance-based schema landed used flat per-scene fields:
- `scene.imgDataUrl` — single image data URL
- `scene.status` — single status string
- `scene.videoUrl` — single video URL
- `scene.videoClips` — array of video URLs

The current schema uses arrays of instances:
- `scene.storyboardInstances[]`
- `scene.imageInstances[]` (nested under storyboards)
- `scene.videoInstances[]` (flat on scene; per ADR-2)

Two functions reconcile the two:
- `migrateAllScenes(scenes, defaults)` at `js/27-canvas-state.js:110` — runs once at load; converts legacy flat fields into instances.
- `syncMirrorFields(scene, mode)` at `js/27-canvas-state.js:123` — runs after CRUD changes; **writes back FROM instances to legacy fields** so older code paths that still read `scene.imgDataUrl` etc continue to work.

The redesign is layered on top of these. The redesign reads from instances (per ADR-2). It does NOT need to read legacy fields. But other parts of the app (Reel page renderer, share-export flow, possibly more) may still read legacy fields — that's why `syncMirrorFields` exists and writes back.

Two concerns:
1. **Mirror direction confusion.** Legacy → instances is one-way migration (`migrateAllScenes`). Instances → legacy is the ongoing mirror sync (`syncMirrorFields`). Engineers must NOT reverse the directions or both data forms drift.
2. **Removal timeline.** When can `syncMirrorFields` and the legacy fields be retired? The redesign doesn't trigger removal but should not entrench legacy field readers further.

## Decision

### 1 — Mirror direction stays one-way for migration; ongoing sync writes from instances back

- **Migration (one-time per scene):** `migrateAllScenes` reads legacy fields, populates instance arrays, marks the scene as migrated. Legacy fields are NOT cleared.
- **Ongoing sync:** after every CRUD operation that mutates instances, `syncMirrorFields(scene, mode)` runs and writes the canonical legacy field values FROM the active-render instances back to the legacy fields. This keeps legacy readers (Reel, export, etc.) consuming current data.
- **The redesign never writes legacy fields directly.** Only `syncMirrorFields` does; the redesign mutates instances and lets the sync hook handle mirroring.

### 2 — The redesign does not regress mirror coverage

P04 / P05 / P06 / P07 / P08 phases all mutate instances. After their CRUD calls, `syncMirrorFields` must run automatically (it does today, called from inside `migrateAllScenes` at `js/27-canvas-state.js:158`). Verify before implementing each phase's CRUD changes that the mutation path still funnels through `CanvasState.*` APIs (which call `syncMirrorFields` at the right time).

If a phase introduces a new mutation path (e.g. P06's `vidActions.addVariation`), it must explicitly call `syncMirrorFields(scene, mode)` after the mutation. P06's wrapper documents this.

### 3 — Mode toggle does not delete cross-mode data

When the user toggles illustrated ↔ animated:
- `videoInstances[]` is preserved on the scene during illustrated mode (not deleted).
- `imageInstances[].isActive` flag (the "use for video gen" multi-select) is preserved during illustrated mode.
- Re-toggling to animated resurfaces all data correctly.

This was confirmed in P06 acceptance criterion (e). It is part of the backwards-compat contract.

### 4 — Cannot-delete-last guard

`CanvasState.deleteImageInstance` returns `false` if it's the only image (`js/29-canvas-render.js:1957` comment confirms). The canonical handlers honor this; UI shows an error toast on `false` return.

This guard exists because legacy `imgDataUrl` semantics assumed at least one image; removing the last image would orphan the legacy field.

### 5 — Removal timeline

Legacy fields and `syncMirrorFields` are NOT removed in this redesign. Removal requires:
- All readers of legacy fields ported to instances (audit needed; out of scope).
- A version bump on saved-project-format (separate from `CANVAS_LAYOUT_VERSION`).
- A migration-only-skip-mirror code path.

The redesign defers this to a follow-up. Document in this ADR that removal is OUT OF SCOPE.

## Rationale

- **Legacy readers exist.** Reel page, share/export, possibly autopilot — they read legacy fields. Breaking them mid-redesign is a regression.
- **Mirror direction is settled.** Legacy → instances is migration; instances → legacy is sync. The two functions are named appropriately and the semantics match.
- **Phase docs cite this ADR** so engineers don't introduce a third direction by accident (e.g. writing `scene.imgDataUrl` from a new CRUD path).
- **Removal is a separate project.** Doing it within the redesign would multiply scope.

## Alternatives considered

1. **Remove legacy fields as part of P08.** Rejected: out of scope; risks breaking unrelated readers.
2. **Stop running `syncMirrorFields` after CRUD (let legacy fields drift).** Rejected: legacy readers serve users today; drift = bugs.
3. **Make canonical handlers write legacy fields directly.** Rejected: forks the mirror direction; introduces drift; violates single-responsibility.
4. **Schema migration: convert all saved projects to instances-only and bump version.** Rejected: heavy-lift; users would need a one-time migration with risk of corruption; not worth the win at this stage.

## Consequences

### Positive
- Existing legacy readers keep working.
- Redesign doesn't introduce data corruption risk.
- Mirror direction is documented and unambiguous.
- Cannot-delete-last guard preserved.

### Negative
- `syncMirrorFields` must be called after every new mutation path. Mitigated by routing all mutations through `CanvasState.*` APIs and by explicit calls in canonical wrappers (P06).
- Two parallel data forms (instances + legacy) must stay in sync. Cost: minor — sync function is small.
- Removal of legacy fields is deferred indefinitely until the audit happens. Acceptable; documented.

## References

- `js/27-canvas-state.js:42–108` (legacy fields)
- `js/27-canvas-state.js:110–164` (`migrateAllScenes`, `syncMirrorFields`)
- `js/27-canvas-state.js:158` (sync called from migrate)
- `js/29-canvas-render.js:1957` (cannot-delete-last comment)
- ADR-2 (schema source of truth)
- ADR-6 (canonical handlers respect this contract)
- P06 (`vidActions.addVariation` calls `syncMirrorFields`)
- P08 (smoke test verifies legacy readers still work)
