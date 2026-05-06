# Phase 05 — AutoPilot Pipeline Extraction

> **Status:** ready-to-execute after Phase 04 exits. **Audience:** solo founder + 1–2 engineers. **Duration:** L (6–10 working weeks). **The heavy phase.**
> **Goal in one line:** re-platform the AutoPilot Reel pipeline (≈19,115 lines across 5 files) from browser to Cloud Run + Vercel Functions, behind `/v1/jobs/*`.
> **Source:** `/Users/praveen/Desktop/stori/migration-plan.md` Part 2 row 04; coverage matrix pipeline-extraction inventory row "AutoPilot Reel pipeline"; [OVERRIDES] O3, O10, O16.

---

## 1. Scope

### In scope
1. **`/v1/projects/:id/launch`** — fires the Launch Agents step. Atomically sets `mode_locked_at` (per ADR-06), enqueues the scene-image-generation job(s), returns `{ job_ids: [...] }`.
2. **`/v1/jobs/scene-images`** — long-running job that generates scene images for every active storyboard in the project. Server-side calls to Gemini imageGen (per migration-details.md L136–144 grid-gen pattern, but updated for Cloud Run instead of Vercel since grid gen can take 50+ seconds and we want headroom for retries).
3. **`/v1/jobs/animation`** — long-running job that takes the 🎯/⭐ images and submits them to Kling (or Veo3 — provider routing, see ADR-02). Polls Kling task IDs every N seconds; updates `video_instances.status` and `video_instances.task_id` columns. Returns when all clips are `done` or `error`.
4. **Long-job pattern invented here, used everywhere later** — formalized in **ADR-02**:
   - **`jobs` table** (id PK, project_id FK, type, status `pending|running|done|error`, idempotency_key text unique, attempt_count int, started_at, finished_at, error jsonb, output jsonb).
   - **Idempotency keys** — client generates `{project_id}:{job_type}:{seed}` per job; server upserts on conflict.
   - **Status polling endpoint** `GET /v1/jobs/:id` — returns `{ status, progress?, output? }`.
   - **Retry semantics** — failed jobs are NOT auto-retried (charge expensive AI calls); user re-fires the job, same idempotency key only re-executes if the previous attempt failed.
   - **Timeout** — Cloud Run job timeout = 60 min hard cap; logical timeout per job type ≤ 30 min, fail fast.
   - **Polling vs Realtime** — polling at 3s intervals client-side; Supabase Realtime considered + rejected for now (extra complexity, not load-bearing for current scale). ADR-02 records.
5. **AutoPilot Reel client cutover** — `js/20-reels-creator.js` (5,839 lines) and the four `js/17a-d-create-*.js` files (1,830 + 4,935 + 5,199 + 1,312 = 13,276 lines) replace every direct `fetch('https://generativelanguage.googleapis.com/...')` and direct Kling call with `callApi(...)`. Verified counts (fresh grep this phase): see §6.
6. **Provider routing for Gemini + Kling + Veo3 + Lyria** — server-side router in `infra/cloud-run/providers/`. Each provider has its own auth + rate-limit handling. Replaces direct `?key=...` URLs.
7. **BGM (Lyria) generation** — `/v1/jobs/bgm` long-job for the BGM step within AutoPilot. Stores output to R2; project references the R2 key.
8. **Feature flag `autopilot_animated_mode`** — set in the chosen flag tooling (ADR-04). Phase-internal milestone: **Illustrated mode ships first** (no Kling, no animation step), then **Animated mode** (full Kling/Veo3 path) is enabled behind the flag. Both end-to-end tests pass before phase exit.

8a. **Animated AutoPilot end-to-end lives inside P05 (decision: option (a)).** That means **`js/17e-canvas-launch.js`** (the P04-split canvas-launch UI module that owns `cgFillVideoPrompts` + `cgLaunchVideoAgent`) **is touched in P05**, not P06. Specifically: the Animated path's `cgFillVideoPrompts` + `cgLaunchVideoAgent` + `animateScenes` + Kling submit/poll all flow through `/v1/*` endpoints by P05 exit. The P04 split kept `17e` out of `17c` so P05 could replace the canvas-launch Gemini calls + Kling calls without colliding with the Tier-2 lipsync block. **`js/17e-canvas-launch.js` is ALLOWED in P05** (rev-4 boundary correction). `js/17f-tier2-lipsync-fal.js` remains forbidden in P05 — that's P06 territory.

8b. **`js/21-kling.js` server-side JWT migration (P05 own).** The current client-side `generateKlingJWT()` at `js/21-kling.js:12` reads `stori_kling_access_key` (`:13`) and `stori_kling_secret_key` (`:14`) from `localStorage`, signs a JWT in the browser, and calls Kling directly. **This entire path moves server-side in P05.** Concretely:
   - Remove `generateKlingJWT()` from `js/21-kling.js` (function body lines 12–~30 in the current file). The two `localStorage.getItem('stori_kling_access_key' | 'stori_kling_secret_key')` reads at `:13–14` are deleted along with it.
   - Replace the two browser-side Kling fetch sites (`await generateKlingJWT()` is invoked at `js/21-kling.js:37` and `:70`) with `callApi('/v1/jobs/animation', { ... })` (submit) and `callApi('/v1/jobs/<id>')` (poll).
   - The Cloud Run worker owns the Kling auth flow: server reads `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` from Cloud Run env, signs the JWT server-side, hits Kling, polls Kling, writes results to R2 + DB.
   - **Exit criterion grep:** `grep -nE "stori_kling_access_key|stori_kling_secret_key|generateKlingJWT" js/21-kling.js` returns **0 hits** at phase exit.

8c. **`callGeminiAPI()` replacement strategy (P05 own).** Fresh grep at audit time: `callGeminiAPI` is invoked **50 times across 9 files** (the definition lives in `js/17a-create-api.js`). P05 replaces every `callGeminiAPI(...)` call site in **AutoPilot-pipeline files only**: `js/17a-create-api.js` (16 hits — call sites + the recursive definition can stay until P07), `js/17b-create-references.js` (6), `js/17c-create-pipeline.js` (3), `js/20-reels-creator.js` (16). **Secondary-pipeline files (`24-photopilot.js`, `26-brainstorm.js`, `26b-llm-router.js`, `31-input-parser.js`, `32-audio-input.js`) remain untouched in P05 — those are P06 territory.** P07 deletes the `callGeminiAPI` definition itself from `17a-create-api.js` along with `getCreateGeminiKey`, `getPPApiKey`, `getReelApiKey`, `getFreeKey`, `getPaidKey`, `getReelFreeKey`, `getReelPaidKey`, and `trackCost` (the latter has 3 call sites at `:472, :730, :785`).
9. **Canary 5/50/100 traffic-shift drill** on a no-op revision of the Cloud Run service. Document the drill in `infra/cloud-run/runbooks/canary.md`. (Production canary on a real revision lives in Phase 08.)
10. **Acceptance test:** a 4-scene Animated reel round-trips end-to-end including BGM and exports a playable MP4. Acceptance test for Illustrated runs first; Animated runs after the flag flips.

### Explicitly out of scope (defer to later phases)
- **PhotoPilot, Brainstorm, Canvas validation server-side, Lipsync, Audio, Input-Parser** → Phase 06.
- **BYOK code deletion sweep** → Phase 07. Phase 05 only changes `fetch(...)` call sites to `callApi(...)`; the `getCreateGeminiKey()` helpers and the BYOK `<input>` UI stay until Phase 07.
- **Dollar-cost UI removal** → Phase 07.
- **Production Sentry dashboards / runbooks** → Phase 08. Phase 05 does have basic Sentry telemetry on every `/v1/jobs/*` call (already wired in Phase 01) — but the polished alerting + dashboards live in Phase 08.
- **Mobile / Flutter consumer of `/v1/jobs/*`** → future mobile cycle (will consume the same endpoints — that's why ADR-03 mandates a stable contract).

---

## 2. Goal & exit criteria

| # | Exit criterion | How verified |
|---|----------------|--------------|
| 1 | `/v1/projects/:id/launch`, `/v1/jobs/scene-images`, `/v1/jobs/animation`, `/v1/jobs/bgm`, `GET /v1/jobs/:id` all live; all guarded by `verifyUser`. | Integration suite. |
| 2 | `jobs` table migration applied; status flow `pending → running → done|error` test-covered. | DB inspection + tests. |
| 3 | Idempotency: re-firing the same job with the same key while the prior is `running` returns the existing job; re-firing after `error` re-executes; re-firing after `done` returns the existing `done` row. | Integration test. |
| 4 | Zero direct `fetch` to `generativelanguage.googleapis.com` in `js/17a-create-api.js`, `js/17b-create-references.js`, `js/17c-create-pipeline.js`, `js/17d-create-languages.js`, `js/20-reels-creator.js`. (Direct Kling calls in `js/21-kling.js` also gone.) Verified by `grep`. | Fresh grep. |
| 5 | Illustrated reel round-trip end-to-end (4 scenes; flag `autopilot_animated_mode=false`): launch → scene-images → BGM → MP4 export ≤ X minutes total. | Manual + recorded run. |
| 6 | Animated reel round-trip end-to-end (4 scenes; flag `autopilot_animated_mode=true`): launch → scene-images → animation (Kling) → BGM → MP4 export ≤ Y minutes total. | Manual + recorded run. |
| 7 | Canary 5/50/100 drill executed on a no-op Cloud Run revision; runbook checked in. | Drill log in `infra/cloud-run/runbooks/canary.md`. |
| 8 | ADR-02 written and merged before phase exit. | File exists. |
| 9 | Sentry shows job-level traces for every `/v1/jobs/*` call grouped by `type`. | Sentry dashboard inspection. |
| 10 | **(rev-4)** `grep -nE "stori_kling_access_key\|stori_kling_secret_key\|generateKlingJWT" js/21-kling.js` returns **0 hits**. Server-side Kling JWT migration complete. | `grep`. |
| 11 | **(rev-4 option (a))** Full Animated AutoPilot path in `js/17e-canvas-launch.js` round-trips via `/v1/*` — `cgFillVideoPrompts` + `cgLaunchVideoAgent` + `animateScenes` no longer call Gemini or Kling directly. | `grep -nE "generativelanguage.googleapis.com\|api.kling.com" js/17e-canvas-launch.js` returns 0 hits. |

---

## 3. Architecture

```
                            (P02 verifyUser middleware)
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────┐
│ Cloud Run Hono                                                  │
│                                                                  │
│  /v1/projects/:id/launch  ──┐                                    │
│  /v1/jobs/scene-images    ──┤                                    │
│  /v1/jobs/animation       ──┤── enqueue → jobs table             │
│  /v1/jobs/bgm             ──┤                                    │
│  GET /v1/jobs/:id         ──┘                                    │
│                                                                  │
│  Worker (in-process for now — evolve to GCP Tasks if needed):    │
│   - poll jobs WHERE status='pending' LIMIT 5                     │
│   - lock + run → call providers → write outputs to R2 + DB       │
└────────┬───────────────────────────────────────────────┬─────────┘
         │                                               │
         ▼                                               ▼
   ┌──────────┐                           ┌──────────────────────────┐
   │ Postgres │                           │ Provider router           │
   │ jobs     │                           │  - Gemini (image, text)   │
   │ projects │                           │  - Kling (video)          │
   │ instances│                           │  - Veo3 (video alt)       │
   └──────────┘                           │  - Lyria (BGM)            │
                                          │  - ElevenLabs (TTS later) │
                                          └──────────┬────────────────┘
                                                     │
                                                     ▼
                                           upstream AI providers
```

**Why this shape:**
- All long jobs live on Cloud Run (per override O3 — Vercel's 60-second cap is too tight). Vercel Functions are reserved for short-call surfaces (P06 Brainstorm, Input-Parser).
- The `jobs` table + polling pattern is deliberately the simplest thing that works. Realtime subscriptions are an optimization, not a necessity, for current scale.
- Idempotency keys protect against double-charges on AI calls. This is the single most important guarantee of the long-job system.

---

## 4. Technology selection

| Concern | Choice | Rationale | Alternatives |
|---------|--------|-----------|--------------|
| Job queue | **In-process worker on Cloud Run + Postgres `jobs` table polling** | Simplest thing that works; no extra vendor; Cloud Run min-instances=1 keeps the worker warm. Once we hit scale, evolve to GCP Cloud Tasks. | Cloud Tasks: viable but adds complexity. BullMQ + Redis: extra infra. |
| Provider HTTP client | **`undici`** | Fastest Node HTTP client; Cloud Run cold-start friendly. | Native `fetch`: works. Axios: heavier. |
| Feature flag tooling | **TBD ADR-04** — recommend **Supabase config table** for solo-founder simplicity | Cheapest; no extra vendor; SQL queryable. | LaunchDarkly: $$, overkill. ConfigCat: extra vendor. |
| Polling interval | **3s client-side**, **2s server-side worker loop** | Balances UI snappiness with API quota burn. | 1s: too aggressive; 10s: laggy UX. |
| Retry policy | **No auto-retry**; user re-fires manually | AI calls are expensive; silent retries burn budget. Idempotency key dedupes. | Exponential backoff: defer until we have data. |
| Job-progress reporting | **`progress` JSONB column** updated by the worker; client reads via polling | No-frills. | Server-Sent Events: overkill. |

---

## 5. Work breakdown

The phase splits naturally into 4 tracks. Two engineers can run tracks A+B in parallel; track C waits on A+B; track D is documentation in parallel throughout.

### Track A — Long-job infrastructure (1 engineer, ~2 weeks)

#### A.1 `jobs` table + ORM model + idempotency
- [ ] Migration `0003_jobs.sql`: `id`, `project_id` FK, `type` enum, `status` enum, `idempotency_key` unique, `attempt_count`, `started_at`, `finished_at`, `error` jsonb, `output` jsonb, `progress` jsonb.
- [ ] Drizzle model + repository.
- [ ] Idempotency upsert helper: `enqueueJob({project_id, type, idempotency_key, ...})`.

#### A.2 Worker loop
- [ ] In `infra/cloud-run/worker/loop.js`, run a `setInterval(2000, tick)`.
- [ ] `tick()` selects up to 5 `pending` jobs, marks them `running` with `started_at = now()`, dispatches by `type`.
- [ ] Each job handler returns `{ output }` or throws; loop writes to DB.
- [ ] Sentry transaction wrapped around each handler call.
- [ ] Crash-safe: on Cloud Run restart, any `running` job older than 30 min gets reaped to `error: 'crashed'`.

#### A.3 `GET /v1/jobs/:id`
- [ ] Route returns `{ status, progress, output, error }`. Auth via `verifyUser` + project ownership check.

### Track B — Provider router (1 engineer, ~1.5 weeks)

#### B.1 `infra/cloud-run/providers/gemini.js`
- [ ] `geminiImageGen({prompt, refImages, style})` → returns image bytes.
- [ ] `geminiGenerateContent({prompt, ...})` → returns text.
- [ ] `geminiTts({text, voice})` → returns audio bytes.
- [ ] Reads `GEMINI_API_KEY` from Cloud Run env.
- [ ] Per-call Sentry breadcrumb.

#### B.2 `infra/cloud-run/providers/kling.js`
- [ ] `klingSubmit({imgKey, motionPrompt, duration})` → returns `{ task_id }`.
- [ ] `klingPoll(task_id)` → `{ status, video_url? }`.
- [ ] **Polling latency note** — redesign-plan.md L146 cites "3+ min/clip" as an unanchored claim. The Kling job handler in A.2 must allow up to 10 min per clip with a hard 30-min ceiling per job type.

#### B.3 `infra/cloud-run/providers/veo3.js`
- [ ] Same shape as Kling. Provider routing key on a per-project basis (default Kling; Veo3 behind a flag).

#### B.4 `infra/cloud-run/providers/lyria.js`
- [ ] `lyriaGenerate({prompt, durationSeconds})` → returns audio bytes (30–60s typical).

### Track C — AutoPilot endpoints + client cutover (engineers A+B together, ~3 weeks)

#### C.1 `/v1/projects/:id/launch`
- [ ] Verifies project ownership.
- [ ] If `mode_locked_at` is null, atomically sets it to `now()`.
- [ ] Enqueues a `scene-images` job. Idempotency key `{project_id}:scene-images:{run_seed}`.
- [ ] Returns `{ job_ids: [...] }`.

#### C.2 `scene-images` job handler
- [ ] Reads project's active storyboards.
- [ ] For each scene's active storyboard, calls Gemini imageGen for every ⭐ image instance still in `pending` status.
- [ ] Writes outputs to R2 (`projects/{id}/scenes/{idx}/images/{img_id}.png`).
- [ ] Updates `image_instances.img_r2_key` + `status='done'`.
- [ ] Idempotency: re-firing skips already-done images (status check before provider call).

#### C.3 `animation` job handler (Animated mode only — gated by feature flag)
- [ ] For each ⭐ image with no associated `video_instance`, creates a `video_instance` and submits to Kling.
- [ ] Stores `task_id` on the row; polls Kling every N seconds.
- [ ] On done: downloads MP4, uploads to R2, sets `clips[].url` to the R2 GET-presigned URL pattern.

#### C.4 `bgm` job handler
- [ ] Calls Lyria for the project's BGM duration.
- [ ] Stores output to R2; project metadata gets `bgm_r2_key`.

#### C.5 Client cutover — `js/20-reels-creator.js` + `js/17[a-e]-create-*.js` + `js/21-kling.js`
- [ ] Replace every `fetch('https://generativelanguage.googleapis.com/...')` with `callApi('/v1/...')` per the contract from ADR-03.
- [ ] Replace every `callGeminiAPI(...)` call site in **AutoPilot-pipeline files only** (`17a-create-api.js`, `17b-create-references.js`, `17c-create-pipeline.js`, `17d-create-languages.js`, `17e-canvas-launch.js`, `20-reels-creator.js`) with `callApi('/v1/...')`. Secondary pipelines (`24`, `26`, `26b`, `31`, `32`) remain untouched here — P06 owns them.
- [ ] **`js/17e-canvas-launch.js` (rev-4 option (a)):** replace `_callGeminiForVideoPrompts` + the Gemini calls inside `cgFillVideoPrompts` and `cgLaunchVideoAgent` with `callApi('/v1/jobs/scene-images' | '/v1/jobs/animation' | '/v1/projects/:id/launch')` so the full Animated AutoPilot path round-trips through `/v1/*`.
- [ ] **`js/21-kling.js` server-side JWT migration:**
  - [ ] Delete `generateKlingJWT()` (lines 12–~30) **including** the two `localStorage.getItem('stori_kling_access_key' | 'stori_kling_secret_key')` reads at `:13–14`.
  - [ ] Replace the two `await generateKlingJWT()` call sites at `:37` (submit) and `:70` (poll) with `callApi('/v1/jobs/animation', { ... })` and `callApi('/v1/jobs/<id>')` respectively.
  - [ ] Cloud Run worker owns the Kling JWT signing using `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` from env.
  - [ ] **Exit grep:** `grep -nE "stori_kling_access_key|stori_kling_secret_key|generateKlingJWT" js/21-kling.js` returns 0 hits.
- [ ] Add a feature-flag check: if `autopilot_animated_mode` is false, skip the animation submit step, render Illustrated mode reel.
- [ ] Do NOT touch the **Gemini** BYOK key code (`getCreateGeminiKey`, BYOK input fields). Phase 07 owns that cleanup. The grep at exit checks for direct `fetch` calls + the Kling-key reads (which P05 owns) only — Gemini BYOK helpers can remain dangling until P07.

### Track D — Drills + ADRs (parallel)

- [ ] **ADR-02** drafted at start; finalized at end of Track A.
- [ ] **Canary drill** — deploy a no-op revision to Cloud Run, shift traffic 5% → wait → 50% → wait → 100%. Use `gcloud run services update-traffic`. Document each step + rollback verification in `infra/cloud-run/runbooks/canary.md`.
- [ ] **Phase doc revision** if anything material is discovered (e.g., Kling polling really takes 10+ min and the timeout strategy needs adjusting).

**Estimated total:** ~30 working days of dev time across two engineers; calendar 6–10 weeks because (a) provider integration debugging always takes longer than expected, (b) the canary drill has wait windows, (c) the Animated-mode end-to-end test will surface bugs the Illustrated path didn't.

---

## 6. Acceptance & test plan

### Smoke checklist
1. `POST /v1/projects/<id>/launch` enqueues a `scene-images` job; `GET /v1/jobs/<id>` shows `running`, then `done`.
2. Idempotency: re-firing launch with same key while `running` returns same job_id.
3. `grep -rn "generativelanguage.googleapis.com" js/17a-create-api.js js/17b-create-references.js js/17c-create-pipeline.js js/17d-create-languages.js js/20-reels-creator.js` returns 0 hits at end of phase. (Other files like `21-kling.js`, `28-canvas-consistency.js`, `26-brainstorm.js`, `30-lipsync.js`, `32-audio-input.js`, `33-audio-rehearsal.js` may still have direct calls — those are Phase 06's responsibility. Per fresh grep at start of phase: total `generativelanguage.googleapis.com` refs = 21 across 6 files — the AutoPilot files account for some subset, to be itemized at kickoff.)
4. Canary drill executed; runbook checked in.
5. 4-scene Illustrated reel round-trips and exports MP4.
6. 4-scene Animated reel (flag on) round-trips, including BGM, and exports MP4.

### Manual verification (post-impl)
- [ ] **Engineer:** verify `GEMINI_API_KEY` and `KLING_API_KEY` are not present in any browser network request (DevTools → Network tab).
- [ ] **Founder:** dogfood — produce one full Animated reel from launch to MP4. Note any UX regressions vs the pre-migration flow.
- [ ] **Engineer:** run a deliberate Kling polling timeout to confirm the 30-min hard cap kicks in and the job ends `error` cleanly.

---

## 7. Dependencies

### Predecessors
- **Phase 04 (Module Split)** is the immediate predecessor. P04 already lifted `openCanvasPanel` / `closeCanvasPanel` / `_callGeminiForVideoPrompts` / `cgFillVideoPrompts` / `cgLaunchVideoAgent` out of `js/17c-create-pipeline.js` into `js/17e-canvas-launch.js`, and the Tier-2 fal.ai lipsync block (current `3721–3900` in `17c`) into `js/17f-tier2-lipsync-fal.js`. **This phase does NOT touch `17e` or `17f`** — those belong to the editor (still client-side) and to P06 (server replacement) respectively. Without P04 having run, this phase would collide with both.
- **Phase 03** for project/instance schema, R2 presign, mode-lock. The job's outputs write into the schema P03 ships.

### Successors
- **Phase 06** uses the long-job pattern Phase 05 invents (zero re-design — drop in new handler types: photopilot, lipsync, audio).
- **Phase 07** can't delete the BYOK code until P05 (and P06) finishes — pipelines must call `/v1/*` exclusively first.
- **Phase 08** runs the production canary on a real revision; Phase 05's drill on a no-op revision is the rehearsal.

### Files this phase touches
- New: `infra/supabase/migrations/0003_jobs.sql`, `infra/cloud-run/routes/jobs.js`, `infra/cloud-run/worker/loop.js`, `infra/cloud-run/providers/{gemini,kling,veo3,lyria}.js`, `infra/cloud-run/runbooks/canary.md`, ADR-02, ADR-04 (drafted in P05, finalized in P07).
- Modified: `js/17a-create-api.js`, `js/17b-create-references.js`, `js/17c-create-pipeline.js` (now ~3,200 lines after P04 split), `js/17d-create-languages.js`, **`js/17e-canvas-launch.js`** (rev-4: option (a) — Animated AutoPilot path lives in P05; replace `_callGeminiForVideoPrompts` + `cgFillVideoPrompts` + `cgLaunchVideoAgent` direct Gemini calls with `callApi('/v1/...')`), `js/20-reels-creator.js`, **`js/21-kling.js`** (rev-4: delete `generateKlingJWT()` + the two `stori_kling_*` localStorage reads at `:13–14`; replace the two `await generateKlingJWT()` call sites at `:37, :70` with `callApi('/v1/jobs/animation' | /v1/jobs/<id>)`; server-side Kling auth lives in Cloud Run env). (Hands off the BYOK helper functions for Gemini; only `fetch` + `callGeminiAPI` call sites change in the four `17*` + `20` files.)
- Forbidden: any other `js/` file in this phase — including **`js/17f-tier2-lipsync-fal.js` (P04-split, P06 territory for replacement)** and **`js/28a-image-gen-shim.js` (P04-split, P06 territory)**. Brainstorm / photopilot / lipsync / audio / canvas-state / canvas-consistency files belong to P06. **`js/17e-canvas-launch.js` is ALLOWED in P05 (rev-4: option (a) keeps the full Animated AutoPilot path inside P05).**

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Kling polling exceeds 10-min ceiling for some clips | M | M | Set the per-job timeout to 30 min; start there and tighten only with data. ADR-02 records. |
| In-process worker can't keep up with concurrent Animated launches | L | M | Cloud Run scales horizontally; concurrency=80 + min-instances=1 covers small dogfood load. Migrate to Cloud Tasks if we hit this. |
| Idempotency key collision (two users picking same seed) | L | H | Idempotency key includes `project_id` (which is namespaced by user via RLS). Cross-user collision is impossible. Same-user re-runs are intentional. |
| Animated-mode flag logic gets tangled with Illustrated path | M | M | Ship Illustrated end-to-end first; only after all Illustrated tests pass, layer in the Animated branch. Don't do both at once. |
| Gemini/Kling/Lyria free-tier exhaustion blocks dev | M | L | Founder commits to a paid Gemini/Kling tier early in the phase. Cost monitoring in Sentry breadcrumbs. |
| Provider router becomes a god-class | M | M | One file per provider; no shared "smart router". Each is dumb. |
| Reaping a `running` job that's still actually running | L | H | The 30-min reap window is comfortably > the 30-min logical timeout. If a job legitimately exceeds that, it's a bug, not a race. |

---

## 9. Open questions

1. **Worker — in-process or Cloud Tasks?** [non-blocking — start in-process; revisit if Cloud Run instance count grows].
2. ~~**Feature-flag tool — Supabase config table vs LaunchDarkly vs ConfigCat?**~~ **RESOLVED 2026-05-06: Supabase config table** (locked in ADR-04). Zero new vendor, SQL-queryable, free. LaunchDarkly remains a future option if percentage rollouts or A/B testing become first-class needs (~3 day switching cost).
3. **Kling polling actual latency** — needs measurement, not estimation. [non-blocking — measure during §C.3].
4. **Veo3 vs Kling default** — Kling is mentioned in migration-details.md L20; Veo3 is mentioned in redesign-plan.md L92. Both are listed as options. [non-blocking — start with Kling-only; add Veo3 in Phase 06 or a follow-up if dogfood demands it].
5. **MP4 export — client-side `ffmpeg.wasm` or server-side?** Currently client-side per `js/11-export.js`. [non-blocking — keep client-side for now; server-side export is its own future workstream].
6. **Lyria duration cap — what's the project's max BGM duration?** [non-blocking — start with 60s cap; revisit].
7. **Canary bake-times: 1h, 24h, manual?** [carried from inventory unanchored claim #10; **blocking** for phase 07; non-blocking for the §Track D drill which can be 5min/stage rehearsal].

---

## 10. Cross-cutting decisions raised by this phase

| Decision | Phases affected | ADR ref |
|----------|-----------------|---------|
| Long-running job pattern (Cloud Run worker, status table, polling, idempotency, retry) | 01, 05, 06, 08 | **ADR-02** (canonical home is this phase) |
| Trunk-based dev + canary deployment + feature-flag tooling vendor | 01, 07, 08 | **ADR-04** (drafted here, finalized in Phase 07) |
| API contract — `/v1/jobs/*` shape, error model | 03, 05, 06, 07 | **ADR-03** (already in Phase 03; this phase consumes it) |
| Mode-lock 409 enforcement on `/launch` | 03, 05, 06 | **ADR-06** (already in Phase 03; this phase exercises it) |
| File storage — R2 keys for image/video/BGM outputs | 01, 03, 05, 06 | **ADR-07** (already in Phase 03; this phase consumes it) |

---

## 11. Links

- Phase index: `/Users/praveen/Desktop/stori/migration-plan.md`
- Predecessor: `/Users/praveen/Desktop/stori/migration-phase-03-api-contract-and-project-state.md`
- Successor: `/Users/praveen/Desktop/stori/migration-phase-06-secondary-pipelines-extraction.md`
- Source code: `/Users/praveen/Desktop/stori/js/20-reels-creator.js`, `/Users/praveen/Desktop/stori/js/17a-create-api.js`, `/Users/praveen/Desktop/stori/js/17b-create-references.js`, `/Users/praveen/Desktop/stori/js/17c-create-pipeline.js`, `/Users/praveen/Desktop/stori/js/17d-create-languages.js`, `/Users/praveen/Desktop/stori/js/21-kling.js`
- Source spec: `/Users/praveen/Desktop/stori/migration-details.md` §New Files §Backend L132–158, §Modified Files L191–207, §Notes L351–356; coverage matrix pipeline-extraction inventory row 1.
- ADRs: `migration-adr-02-long-running-jobs.md`, `migration-adr-04-trunk-based-canary.md` (drafted here, finalized in P07)

*End of Phase 05 dev doc.*
