# ADR-06 — Mode-lock invariant (`videoMode`)

> **Status:** Proposed (finalizes during Phase 03; exercised in Phases 05 + 06).
> **Date:** 2026-05-05.
> **Affected phases:** 03, 05, 06.
> **Author:** architect-cycle (revision 2).

---

## Context

Every project has a `videoMode` that is one of `illustrated` or `animated`. The two modes drive different pipelines (Illustrated: image-only; Animated: image + Kling/Veo3 video). Per redesign-plan.md L39:

> `videoMode: 'illustrated' | 'animated'` set on Reel step 1; **immutable after Launch Agents**.

Switching mode after launch would require regenerating every scene's outputs and re-applying validation rules — silently rebuilding a project mid-flight is a recipe for data loss. The web client today enforces this in JS; the migration moves enforcement server-side so even a buggy or malicious client can't bypass it.

This is a small but load-bearing invariant. Decision: how exactly is "locked" represented and enforced?

---

## Decision

### Representation
A nullable timestamp column `mode_locked_at timestamptz` on the `projects` table.
- `null` → not yet locked; `video_mode` is mutable.
- non-null → locked at that timestamp; `video_mode` is immutable.

Reasoning: a single nullable timestamp gives both the boolean (locked vs not) and the audit info (when, for post-mortem). One column, no redundancy.

### When set
**Server-side, atomically, when `POST /v1/projects/:id/launch` succeeds** (in Phase 05). The launch endpoint:
1. Verifies project ownership (RLS + `verifyUser` middleware from Phase 02).
2. Validates the canvas state via `validateGates` (Phase 06's server-side validation; if not yet shipped in Phase 05, the client's pre-validation suffices for Phase 05 acceptance — Phase 06 closes the loop).
3. In a single transaction: `UPDATE projects SET mode_locked_at = now() WHERE id = ? AND mode_locked_at IS NULL` followed by enqueue of the scene-images job.
4. If `mode_locked_at` was already set (concurrent double-launch), the UPDATE affects 0 rows → return 409 with `{ code: 'ALREADY_LAUNCHED' }`.

Idempotency edge case: re-firing the launch endpoint with the same idempotency key returns the existing job (per ADR-02), NOT a new lock — `mode_locked_at` only gets set on the very first successful call.

### Enforcement on PUT
`PUT /v1/projects/:id` with a body that includes `video_mode`:
- If `project.mode_locked_at IS NULL` → accept the new value.
- If `project.mode_locked_at IS NOT NULL` AND `body.video_mode != project.video_mode` → return **409 Conflict** with `{ code: 'MODE_LOCKED', message: 'Cannot change video_mode after Launch Agents.', request_id }`.
- If `project.mode_locked_at IS NOT NULL` AND `body.video_mode == project.video_mode` → no-op (allowed; client may be re-sending the same value).

Implemented as a guard in the `PUT /v1/projects/:id` route handler (Phase 03) AND as a SQL trigger on the `projects` table (defense-in-depth). The SQL trigger raises an exception if `OLD.mode_locked_at IS NOT NULL AND NEW.video_mode != OLD.video_mode`; the route handler converts that into the 409 response.

### Enforcement on other mutations
**Adding/editing instances after lock is allowed.** The lock applies to `video_mode` specifically, NOT to scene/instance edits. Post-launch, the user can still:
- Add/edit storyboards and images.
- Adjust active flags (🎯, ⭐).
- Re-fire scene-image generation for new variants.
- Add audio, BGM, voiceover.

What the lock prevents is **switching the project's fundamental pipeline shape mid-flight**. The other Phase 06 mutation endpoints (PhotoPilot adding scenes, Canvas adding instances, Lipsync adding clips, Audio adding tracks) all check the lock only insofar as their work is appropriate for the current mode — e.g., the animation job handler refuses to fire if `video_mode='illustrated'`, returning `{ code: 'WRONG_MODE_FOR_JOB' }`.

### Unlock path
**There isn't one in this cycle.** Once locked, a project stays locked. To "switch modes", the user creates a new project. This is harsh but consistent.

A future workstream could add an explicit "fork project to switch mode" endpoint that copies the source project, drops the locked-mode-specific outputs, and ships the copy with a new `video_mode`. Not in scope.

---

## Consequences

### Positive
- Single nullable column = minimum schema noise + free audit timestamp.
- 409 status code is the HTTP-correct choice for "conflict with current state" — clients can branch on it cleanly.
- Defense-in-depth (route handler + SQL trigger) means even a buggy ORM call can't violate the invariant.
- Allowing post-launch instance edits matches the existing client UX — the user can still iterate.
- The "no unlock" decision keeps the surface tiny.

### Negative
- "Create a new project to switch modes" is friction for users who change their mind. Documented; founder accepts at zero-customer scale.
- The SQL trigger needs a careful raise-error message that round-trips into the API's `{ error: { code, message } }` shape. Mitigation: the trigger raises with a SQLSTATE the route handler can recognize (e.g., `'23514'` plus a custom MESSAGE).

### Neutral
- The "post-launch instance edits allowed" choice means the canvas-state schema doesn't carry "frozen" markers on individual rows — only the project-level lock matters. Simpler schema.

---

## Options considered

### A. Boolean `is_mode_locked` column
- **Pro:** simpler.
- **Con:** loses audit info.
- **Reject:** the timestamp wins on equal simplicity.

### B. Mode-lock per scene rather than per project
- **Pro:** more granular.
- **Con:** fundamentally wrong — the mode is a project property, not a scene property. Scenes are interchangeable within a mode.
- **Reject.**

### C. Allow unlock after a 30-day window
- **Pro:** more forgiving UX.
- **Con:** complicates every client check; users can still create a new project today.
- **Reject:** keep the surface small.

### D. Enforce at API layer only, no SQL trigger
- **Pro:** simpler.
- **Con:** any service-role-keyed admin script could violate the invariant (e.g., a future "fork project" endpoint that forgets the rule).
- **Reject:** belt-and-suspenders is cheap insurance.

### E (chosen) — `mode_locked_at` nullable timestamp + API-layer 409 + SQL trigger backstop

---

## Affected phases

- **Phase 03** ships the column, the SQL trigger, and the API-layer guard on the PUT route. Phase 03 is the canonical home of this ADR.
- **Phase 05** sets `mode_locked_at` atomically on `/v1/projects/:id/launch`. Includes the integration test that the second launch returns 409.
- **Phase 06** enforces the per-job mode appropriateness on every secondary endpoint that mutates project state (PhotoPilot, Canvas, Lipsync, Audio). The Track C audit in Phase 06 §5 enumerates each endpoint.

---

## Links

- Phase index: `/Users/praveen/Desktop/stori/migrations/migration-plan.md`
- Phase docs: 03 (canonical), 04 (sets the lock), 05 (audit across endpoints)
- Source spec: `/Users/praveen/Desktop/stori/app/redesign-plan.md` §2 L39 — the redesign plan is otherwise out-of-scope for this cycle, but this single line is the only place mode-lock semantics are stated. The `js/27-canvas-state.js` source code does not contain the `videoMode` field at the scene level — `videoMode` is a project-level field on the wider `createJobState` global (referenced at `js/27-canvas-state.js:370`).
- Related ADRs: ADR-01 (where the column lives in the schema), ADR-03 (the 409 error code shape)

*End of ADR-06.*
