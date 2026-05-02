# ADR-002 — Active-path single source of truth + flat videoInstances schema

- **Status:** Accepted (2026-05-01)
- **Affected phases:** P04, P05, P06, P07, P08
- **Folds in:** inventory Part 4 conflict #13 (videoInstances flat-vs-nested)

## Context

The redesign mock encodes the active-path data model with **numeric idx fields**:
- `SB1.activeTab` — string letter ("A", "B")
- `SB1.tabs[X].activeImg` — number (image index)
- `SB1.tabs[X].vids[imgIdx] = { active, list }` — `active` is a number (video index)

Mock `js:723–771` (`canvas-redesign-mock.html`).

The production code at `js/27-canvas-state.js:1–26` documents a different model:
- `storyboard.isActive` — RADIO boolean (one per scene)
- `imageInstance.isActive` — MULTI-SELECT boolean ("⭐ Use for video gen")
- `imageInstance.isRenderActive` — RADIO boolean (illustrated mode chosen render)
- `videoInstance.isRenderActive` — RADIO boolean (animated mode chosen render)

Furthermore, the production schema stores **videoInstances FLAT on the scene** (not nested under imageInstance):
- `scene.storyboardInstances[].imageInstances[]` — nested
- `scene.videoInstances[]` — flat at scene level
- Each video has `sourceImageInstanceId` joining it back to the source image

This is documented at `js/27-canvas-state.js:17` and confirmed by the CRUD signature `addVideoInstance(scene, sourceImgId, opts)` at `js/27-canvas-state.js:315`.

The architect prompt's "Data hierarchy & active path" section describes the schema as `imageInstances[].videoInstances[]` (nested). This conflicts with the production code.

Two resolutions are needed: (1) which active-path model wins; (2) which video schema wins.

## Decision

### 1 — Real-code active-path model wins

Production uses `isActive` and `isRenderActive` boolean flags on instances. The mock's `activeXxxIdx` numeric fields are **illustrative for the layout/interaction pattern only**. The redesign:
- Renders ACTIVE state from instance flags, not from idx pointers.
- Sets ACTIVE state via the existing CRUD APIs (`setActiveStoryboard`, `setImageRenderActive`, `setVideoRenderActive`).
- Reads `isActive` for storyboard radio selection and for image multi-select ("use for video gen").
- Reads `isRenderActive` for the chosen render variant per scene/mode.
- Migration of existing scenes: no change. The schema is already in production.

### 2 — Real-code flat videoInstances schema wins

Production stores `videoInstances[]` at the scene level, joined via `sourceImageInstanceId`. The architect prompt's nested description is corrected. The redesign:
- Renders the VID variant strip (P06) by filtering `(scene.videoInstances || []).filter(v => v.sourceImageInstanceId === activeImg.id)`.
- Renders the IMG thumb's `▶N` vid-badge (P05) by counting that same filter.
- Adds new videos via `CanvasState.addVideoInstance(scene, sourceImageInstanceId, opts)` (`js/27-canvas-state.js:315`).
- Mode-toggle illustrated→animated does NOT mutate the schema — videos persist on the scene, hidden in illustrated mode.

## Rationale

- **The schema is already shipped.** Migrating existing user data to a different schema would require a migration step, risk data loss, and gain nothing.
- **Flag-based active state composes correctly.** Multi-select on image instances (`isActive` for "use for video gen") is a feature; numeric idx pointers cannot express multi-select.
- **The flat join is queryable.** `videoInstances[].sourceImageInstanceId` is a foreign key; rendering by filter is straightforward and idempotent.
- **Mock illustrative-only is fine.** The mock author was prototyping interaction; the data model in the mock was a stub.

## Alternatives considered

1. **Adopt the mock's idx model.** Rejected: requires a schema migration; breaks the multi-select flag pattern.
2. **Nest videoInstances under imageInstance.** Rejected: requires a migration; doubles ID-to-array bookkeeping; doesn't enable any feature.
3. **Mirror both models for compatibility.** Rejected: redundant data + drift risk.

## Consequences

### Positive
- No schema migration.
- No breaking change to saved projects.
- CRUD API already canonical (10 named functions on `window.CanvasState`).
- VID variant strip filter is one-liner.

### Negative
- Engineers reading the mock must remember the schema mapping (idx → flag, nested → flat). Phase docs cite this ADR.
- Cross-image video grouping at render time requires a filter pass. Acceptable performance for v1 (typical scene < 50 videos); revisit at scale per ADR-5.
- The architect prompt's wording is corrected by this ADR — engineers should consult ADR text, not architect prose, when in doubt.

## References

- `js/27-canvas-state.js:1–26` — schema doc header
- `js/27-canvas-state.js:17` — flat `videoInstances` array
- `js/27-canvas-state.js:222` — `setActiveStoryboard`
- `js/27-canvas-state.js:227` — `toggleImageVideoGenActive`
- `js/27-canvas-state.js:234` — `setImageRenderActive`
- `js/27-canvas-state.js:240` — `setVideoRenderActive`
- `js/27-canvas-state.js:315` — `addVideoInstance(scene, sourceImgId, opts)`
- Mock illustrative model: `canvas-redesign-mock.html:723–771`
- Phase docs that consume this: P04 (selection ring), P05 (IMG ACTIVE pill), P06 (VID tray filter), P07 (canonical handlers respect both flags), P08 (smoke test)
- ADR-7 (Backwards compat for saved projects): related — mirror direction for legacy fields
