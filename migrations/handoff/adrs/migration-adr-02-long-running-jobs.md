# ADR-02 — Long-running job architecture

> **Status:** Proposed (decision finalizes during Phase 05).
> **Date:** 2026-05-05.
> **Affected phases:** 01, 05, 06, 08.
> **Author:** architect-cycle (revision 2).

---

## Context

The migration moves AI-pipeline calls from browser to backend. Several of those pipelines are inherently long:

- **Kling video generation** — 3+ min per clip per redesign-plan.md L146 (unanchored claim — needs measurement, but order-of-magnitude correct).
- **Lyria BGM** — 30–60 s per migration-original-spec.md L150–154.
- **Gemini grid-gen** — up to 50 s per migration-original-spec.md L141.
- **Photopilot AI scene segmentation** — moderate (Gemini call); FX (Ken Burns) fast.
- **ElevenLabs voice rehearsal** — variable, can reach minutes.
- **Audio transcription** (Gemini) — variable.

Vercel Functions cap at 60 s on Pro. Cloud Run caps at 60 min. Override O3 mandates "Vercel Functions for short calls; Cloud Run for long jobs". Override O10 mandates canary 5/50/100 traffic-shift on Cloud Run revisions.

The pattern invented in Phase 05 (the heaviest extraction phase) is reused verbatim by Phase 06's six secondary pipelines. Getting it right here saves ~30 days of re-design later.

Decisions to make: queue substrate, idempotency, retry semantics, status reporting (polling vs Realtime), worker scaling, timeout strategy.

---

## Decision

### Queue substrate
**A `jobs` table in Supabase Postgres polled by an in-process worker on Cloud Run.** Every job is a row with status, idempotency key, and output column. The worker loop polls every 2 s for `status='pending'` rows, locks them via `UPDATE ... RETURNING` with `FOR UPDATE SKIP LOCKED`, dispatches by `type`, writes outputs.

**Schema:**
```sql
CREATE TABLE jobs (
  id uuid PK DEFAULT gen_random_uuid(),
  project_id uuid FK projects,
  type text NOT NULL,                    -- 'scene-images' | 'animation' | 'bgm' | 'photopilot' | 'voice-rehearsal' | 'transcribe' | ...
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'done' | 'error'
  idempotency_key text NOT NULL,
  attempt_count int NOT NULL DEFAULT 0,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  progress jsonb DEFAULT '{}'::jsonb,
  output jsonb NULL,
  error jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, idempotency_key)
);
```

### Idempotency
**`(project_id, idempotency_key)` unique constraint.** Client provides the key; canonical shape is `{type}:{semantic-version-of-input}` (e.g. `scene-images:v1:{run_seed}`). Re-firing the same job:
- If the existing row is `running` → return existing `id`, no new work.
- If the existing row is `done` → return existing `id` and cached `output`.
- If the existing row is `error` → re-execute (set `status='pending'`, increment `attempt_count`).

This protects against double-charging on AI calls (the single most important guarantee).

### Retry semantics
**No automatic retry.** Failed jobs stay `error`; the user re-fires manually via the same idempotency key (which transitions error → pending). Reasoning: AI calls are expensive ($0.10–$5 per call); silent retries burn budget. ADR-08 alerts the founder so they can decide.

### Status reporting
**Client polls `GET /v1/jobs/:id` at 3 s intervals.** No Server-Sent Events, no Supabase Realtime in this cycle. Reasoning: polling is simple, cheap (one DB read per poll), and Realtime adds a separate subscription channel + auth flow that doesn't justify the complexity at current scale. Phase 08 may revisit once production load is measured.

The `progress` JSONB column is updated by worker handlers when they have meaningful checkpoints (e.g., "3 of 4 scenes done"). The client reads it through the same poll endpoint.

### Worker scaling
**In-process worker on the Cloud Run service**, with `min-instances=1` to keep the worker warm. Concurrency=80 is the Hono default; the worker loop processes up to 5 jobs in parallel per tick (`SELECT ... LIMIT 5 FOR UPDATE SKIP LOCKED`).

If Phase 08 measures sustained queue depth > 20 for 5+ min, the next workstream should migrate to **Google Cloud Tasks** (separate worker service + push-based dispatch). Recorded as a follow-up; not in scope for this cycle.

### Timeout strategy
- **Cloud Run job timeout:** 60 min hard ceiling (Cloud Run platform limit; we don't push it).
- **Logical per-type timeout:** ≤ 30 min, fail fast. Specific values:
  - `scene-images`: 10 min (Gemini imageGen × 12 max scenes ≈ 5 min worst case).
  - `animation`: 30 min (Kling polling can stretch; 30 min is the ceiling).
  - `bgm`: 5 min (Lyria 30–60 s × 2 retries internal to the handler).
  - `photopilot`: 10 min.
  - `voice-rehearsal`: 15 min.
  - `transcribe`: 10 min.
- **Stuck-job reaper:** rows with `status='running'` AND `started_at < now() - interval '30 min'` get auto-flipped to `status='error', error: '{reason: "stuck", reaped_at: ...}'` by a cron sweep every 5 min. Reasoning: Cloud Run restarts can leave orphan `running` rows; the reaper recovers them.

### Canary policy
Deferred to **ADR-04**. (This ADR establishes the runtime substrate; ADR-04 establishes the deploy pipeline.)

---

## Consequences

### Positive
- Postgres as queue is operationally simple — one less moving part than Redis/SQS/Cloud Tasks.
- Idempotency keys prevent duplicate AI charges, the highest-cost failure mode.
- Cloud Run min-instances=1 keeps the worker warm; cold starts only affect HTTP requests, not job dispatch.
- Polling is debuggable: inspect with `psql`, no specialized tooling needed.
- The 30-min ceiling per type matches realistic provider latencies; longer jobs would be a different shape (background data jobs, not user-facing pipelines).

### Negative
- **Polling overhead.** At 3 s client poll + N concurrent jobs across M users, DB reads grow linearly. At current dogfood scale (single-digit users) this is ~1 read/sec — trivial. At 100 concurrent users with 3 jobs each = 100 reads/sec — still well within Postgres capacity, but worth measuring in Phase 08.
- **Worker is a single point of failure** if Cloud Run min-instances=1 and that one instance crashes. Cloud Run auto-restarts instances; the reaper recovers stuck `running` rows. Acceptable for current scale.
- **No automatic retry** means a transient provider hiccup leaves the user with a failed job and a manual re-fire. Reasoning above; revisit if it becomes a UX problem.
- **JSONB output column** can grow large (e.g., a Gemini grid response). Postgres handles MB-scale JSONB fine, but very large outputs (full image bytes) should go to R2 with the `output.r2_keys` field referencing them — established by Phase 05 conventions.

### Neutral
- The choice to NOT use Supabase Realtime is a future-revisitable lever. If polling-cost becomes meaningful, swap it in without changing the underlying data model.
- The choice to NOT use Cloud Tasks is a future-revisitable lever — same data model, push-instead-of-pull dispatch. Sprint cost ~3 days when needed.

---

## Options considered

### Option A — Cloud Tasks + push-based worker
- **Pro:** scales horizontally without polling overhead; HTTP-push fan-out.
- **Con:** extra service, extra IAM, extra debugging surface; job state lives in two places (Cloud Tasks queue + DB) which can drift.
- **Reject for this cycle, revisit at scale.**

### Option B — Redis + BullMQ (or similar)
- **Pro:** Battle-tested job-queue ergonomics.
- **Con:** new vendor (Redis), new dependency (BullMQ), state in two stores. Solo founder doesn't need it.
- **Reject.**

### Option C — Supabase Realtime subscriptions for job-status push
- **Pro:** lower client latency for "job done" notifications.
- **Con:** extra subscription channel, extra auth flow, harder to debug.
- **Reject for this cycle.** Polling is good enough.

### Option D — Synchronous endpoints + browser-side long polling
- **Pro:** no jobs table.
- **Con:** Cloud Run keeps a connection open for 30 min; expensive, fragile, and breaks if the user's network blips.
- **Reject.**

### Option E (chosen) — Postgres-as-queue, polling client, in-process worker, no auto-retry

---

## Affected phases

- **Phase 01** sets up the Cloud Run service that hosts the worker; min-instances decision (=1) recorded here.
- **Phase 05** writes the migration, the worker loop, the idempotency upsert, and the first set of handlers (scene-images, animation, bgm). Authors this ADR.
- **Phase 06** drops in additional handlers (photopilot, voice-rehearsal, transcribe, **lipsync**) — zero re-design. Lipsync uses MediaPipe-Node (`@mediapipe/tasks-vision`) + FFmpeg server-side (resolved 2026-05-06; runs as a long job because per-frame Face Landmarker on a 5-second clip takes 30–60 s).
- **Phase 08** measures polling overhead under real production load and decides whether to migrate to Cloud Tasks.

---

## Links

- Source spec: `/Users/praveen/Desktop/stori/migrations/migration-original-spec.md` §Notes L351–356; redesign-plan.md L146 (Kling polling latency, unanchored — verify in P05).
- Phase docs: 04 (canonical), 05 (consumes), 07 (measures).
- Related ADRs: ADR-04 (canary deploy), ADR-08 (alerting on job failures).

*End of ADR-02.*
