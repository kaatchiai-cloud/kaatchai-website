# Stori Backend Migration — Phase Index

> **Audience:** Solo founder + 1–2 engineers. **Status:** revision 5 (post-feature-gap audit, 2026-05-16). Approved at gate; per-phase dev docs already written.
> **Out of scope:** all billing / Stripe / subscription / quota / pricing-tier work — explicitly deferred to a separate later workstream (override O15). **All mobile / Flutter / `redesign-plan.md` content is also out of scope** — mobile is a separate future architect cycle that consumes this cycle's P03 API contract as a constraint.

---

## Part 1 — Summary

```
Spec sources (in scope):     /Users/praveen/Desktop/stori/migrations/migration-original-spec.md
                             /Users/praveen/Desktop/stori/migrations/migration-plan-audit-report.md  (revision-3 audit, 2026-05-06)
                             /Users/praveen/Desktop/stori/migrations/migration-plan-audit-rev5-merged.md  (revision-5 audit, 2026-05-16)
Spec sources (deferred):     /Users/praveen/Desktop/stori/app/redesign-plan.md         (mobile-only — future cycle)
                             /Users/praveen/Desktop/stori/app/*-mobile-mockup.html     (mobile UI refs — future cycle)

Inventory:                   /Users/praveen/Desktop/stori/migrations/devDoc-migration/.architect/spec-inventory.md
Coverage matrix:             /Users/praveen/Desktop/stori/migrations/devDoc-migration/spec-coverage-matrix.md
Phase docs:                  /Users/praveen/Desktop/stori/migrations/migration-phase-NN-<slug>.md
ADRs:                        /Users/praveen/Desktop/stori/migrations/migration-adr-NN-<slug>.md

Phases:                      8   (cap = 9, lower-bound = 2)
Coverage:                    100% of in-scope inventory rows mapped to ≥ 1 phase
                             (15 of 38 inventory rows are explicitly out-of-scope: 2 billing rows + 13 mobile rows)
Out-of-scope sections:       15  (2 billing — directive O15; 13 mobile — deferred to future mobile cycle)
Cross-cutting ADRs signaled: 8   (ADR-01 expanded with 5 new tables in revision 3, plus `lora_items` table + 3 columns on `video_instances` in revision 5; no new ADRs added)
Estimated total duration:    L+ to XL  — realistic range 24–35 working weeks (≈ 6–8.75 months) for solo + 1–2 engineers, see Part 4
Out-of-scope confirmation:   pricing-plan.md NOT read; redesign-plan.md NOT consumed by any phase doc in this cycle; billing nowhere in this plan
Revision note:               This is **revision 5** (rev-5 fan-out 2026-05-16; post-feature-gap audit — no new phases, no new ADRs). Revision 4 (2026-05-06) was scope-clarification only. Revision 3 (also 2026-05-06) was a 7→8-phase replan; the 2026-05-06 audit (`migration-plan-audit-report.md`) surfaced (a) 6 unmigrated IndexedDB call sites that pushed P03's persistence surface from 5 to 10 tables, (b) an unaddressed multi-phase collision risk on `js/17c-create-pipeline.js` (5,199 lines) and `js/28-canvas-consistency.js` (224 lines). Revision 3 inserts a new **P04 Module Split** phase to de-risk the collisions and expands P03's schema-design spike from 3 → 7 days. Old P04–P07 are renumbered P05–P08. Total duration grew from 18–24 to 22–31 weeks. **Revision 4 (rev-4) deltas:** P05 owns the Animated AutoPilot launch path (incl. `js/17e-canvas-launch.js`) per option (a); P05 also owns the server-side Kling JWT migration in `js/21-kling.js`; P02 ships the `callApi()` shared abstraction + locks `api/kling.js` CORS at lines 8 + 39 + eager-loads `00-auth.js` + `00-api-client.js`; P03 storage scope reworded with explicit local-only carve-outs + the 3 `stori_db` reel-handoff sites (20:5807, 20:5822, index.html:4808) treated as ONE work item; P04 build/load contract corrected (no `MAIN_FILES` symbol); P06 adds a 1–2 day MediaPipe spike + fallback contract + 4 ElevenLabs endpoints + audio-input/audio-rehearsal coupling; P07 deletion list expanded with `callGeminiAPI` + 7 key-getters + `trackCost` (rev-4 pass-2: corrected to **53 call sites across 9 files**, not 3). No new phases, no new ADRs. **Rev-4 pass-2 (2026-05-06):** P03 schema bumps from 10 → 11 tables (added `brand_assets` for `stori_library` IDB at `js/15-project.js:356,361` per user decision "migrate, do not carve out"); auth-stub line range now behavioural (`grep stori_user` returns 0) since file growth shifts the actual line numbers; 17e extraction range narrowed to canvas functions only (4898–5051 + 5097–5100 exports), explicitly excluding `_generateNarratorClipsIfNeeded` at 5054+ which stays in 17c; `cast_references`/`audio_inputs`/`audio_rehearsals` noted as sharing ONE source IDB (`stori_cast_images_v1`) with key-prefix-split records. Plan duration unchanged at 22–31 weeks. **Revision 5 (rev-5, 2026-05-16):** post-feature-gap audit (`migration-plan-audit-rev5-merged.md`) surfaced three features added after the plan was finalised: (1) **LoRA Studio** (`js/34-lora-library.js`, 4,413 lines) — entirely absent from the plan; introduces fal.ai training/inference + ElevenLabs voice cloning + Gemini appearance-extraction pipelines, `stori_lora_photos` IndexedDB, and deep cross-file integration into `01-core.js`, `17b`, `17c`, `28`; (2) **Replicate face swap** (`js/28-canvas-consistency.js:133–298`) — 7th BYOK provider (`stori_replicate_api_key`, `api.replicate.com`) not in P07 scope; (3) **Object Detection** (`js/36-object-detection.js`, 213 lines) — opens `fx-model-cache` IDB (local-only carve-out). Also: `videoInstance` schema gains 3 new columns (`effects`, `tracks`, `animation_plan`); Jina Reader (`r.jina.ai`) is a keyless 8th provider; ElevenLabs STT (`/v1/audio/transcribe`) and voice catalog (`/v1/audio/voices`) endpoints missing from P05/P06; Brainstorm `bs-cost-tag` dollar-cost UI not in P07 deletion list; `js/21-kling.js:356` Gemini continuation-prompt call not in P05/P06 file list; `stori_bs_session` localStorage not in P03 carve-outs. **Rev-5 deltas:** P03 adds `lora_items` table (11 → 12+ tables) + 3 columns on `video_instances` + 6 IDB databases (was 4) + `fx-model-cache`/`stori_bs_session` local-only carve-outs + `js/34-lora-library.js`/`js/36-object-detection.js` to IDB grep list; P05 adds `js/21-kling.js` to Gemini call replacement + `/v1/audio/transcribe` endpoint + explicit Lyria 3 BGM mention + P05 carve-out for fal.ai LoRA inference in `17c:2648–2750` (deferred to P06 per M4 Option B); P06 adds LoRA Studio as 7th pipeline + 5 new endpoints (`/v1/jobs/lora-training`, `/v1/lora/inference`, `/v1/lora/voice-clone`, `/v1/lora/appearance-extract`, `/v1/canvas/face-swap`) + 3 more endpoints (`/v1/audio/transcribe`, `/v1/audio/voices`, `/v1/brainstorm/extract-url`) + Replicate face swap in Canvas scope + surface grows 9,322 → ~14,310 lines (+54%) + duration 6–9 → 8–13 wk + `js/34-lora-library.js` to zero-direct-fetch grep target; P07 expands to 7 BYOK + 1 keyless provider (Jina Reader) + `stori_replicate_api_key`/`api.replicate.com`/`r.jina.ai` to grep list + `bs-cost-tag` deletion + `_updateMeta`/`_getProviderPricing` to function grep + `js/21-kling.js` to Gemini URL grep + `marketing-pipeline/` exclusion note. Total duration grows 22–31 → 24–35 weeks. No new phases, no new ADRs. ADR-01 expanded internally (mirrors rev-3 pattern).
```

---

## Part 2 — Phase table

| #  | Slug                              | Name                                                | Goal (1 line)                                                                                                            | Entry criteria                                                                       | Exit criteria                                                                                                                                                                                                                                                                                              | Duration | Depends on |
|----|-----------------------------------|-----------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|------------|
| 01 | backend-foundations               | Backend Foundations (Supabase + Cloud Run + R2 + Sentry + Repo Bootstrap) | Stand up the four infra pillars and the monorepo bootstrap; prove a round-trip from each pillar. | None.                                                                                | Supabase project created with empty `users` table + RLS; Cloud Run service deployed with one Hono `/v1/health` endpoint reachable from public URL; one signed-URL upload + download to R2 working from a smoke-test script; Sentry events flowing from a deliberately-thrown error in Cloud Run + a test web page; **repo bootstrap done** — root `package.json` (workspaces), Node 22 LTS pinned (`engines` + `.nvmrc`), root `tsconfig.json` with project refs into `infra/*`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js` (flat) + `prettier.config.js`, `pnpm-workspace.yaml`; CI (`.github/workflows/ci.yml`) running `lint + typecheck + vitest + playwright (smoke)` on a sample PR with branch protection on `main`. | M (4–6 wk)        | —          |
| 02 | auth-migration                    | Auth Migration (Supabase Auth replaces stub)        | Replace the fake auth stub with real Supabase Auth across web; mint JWTs ready for future mobile consumer.              | P01 exits.                                                                            | Google OAuth + magic-link sign-in works end-to-end on web; existing fake-auth call sites at `js/15-project.js` lines **~1417–1472 (behavioural exit: `grep -n stori_user js/15-project.js` returns 0)** (verified — see Part 4 rationale) replaced with `js/00-auth.js`; every `/v1/*` endpoint enforces JWT verification (returns 401 without it); session refresh round-trips; CORS locked to declared production domain; a Cypress / Playwright E2E test signs in, calls a protected endpoint, signs out. | S (2–3 wk)        | 01         |
| 03 | api-contract-and-project-state    | API Contract + Project State (Postgres + R2)        | Define the `/v1/*` API surface, ship the projects/instances schema (12+ tables — 5 from original audit + 5 surfaced in revision 3 + `brand_assets` from rev-4 + `lora_items` from rev-5; +3 additive columns on `video_instances`), and replace **every** IndexedDB / localStorage write site with cloud storage (explicit local-only carve-outs excluded). | P02 exits.                                                                            | OpenAPI (or tRPC schema, ADR-3) checked in and renders; **12+ tables** migrated with RLS + active-flag invariants — the original 5 (`projects`, `scenes`, `storyboard_instances`, `image_instances`, `video_instances`) plus 5 from rev-3 (`reel_projects`, `cast_references`, `reference_library`, `audio_inputs`, `audio_rehearsals`) plus `brand_assets` (rev-4) plus `lora_items` (rev-5 — unified items table for LoRA products/characters/all types; columns: `id`, `user_id`, `name`, `kind` ENUM, `trigger_phrase`, `trainer_endpoint`, `inference_endpoint`, `lora_url`, `lora_status` ENUM, `fal_request_id`, `voice_profile`, `appearance_block`, `tuning_params JSONB`, `compatible_with`, `created_at`, `updated_at`); `video_instances` gains 3 additive JSONB columns: `effects JSONB DEFAULT '[]'::jsonb`, `tracks JSONB DEFAULT '{}'::jsonb`, `animation_plan JSONB NULL`; **6 IndexedDB databases** enumerated (was 4): `stori_projects`, `stori_library`, `stori_db`, `stori_cast_images_v1`, `stori_lora_photos` (rev-5), `fx-model-cache` (rev-5); **local-only carve-outs** (not migrated, stay client-side): `stori_library` (brand assets — rev-4 elected to migrate, so `brand_assets` table exists but the IDB `stori_library` read at `js/15-project.js:361` is replaced), `fx-model-cache` (ML model binary cache for client-side ONNX inference — local-only by design, not user data), `stori_bs_session` (Brainstorm session state — ephemeral, not persistent user data); `/v1/projects` CRUD + `/v1/projects/import-reel/:id` (or session-state token) + R2-presigned-URL endpoints live; **every** `indexedDB.open(...)` call site replaced (or confirmed local-only carve-out) — verified by grep in `js/15-project.js`, `js/20-reels-creator.js`, `js/17b-create-references.js`, `js/32-audio-input.js`, `js/33-audio-rehearsal.js`, **`js/34-lora-library.js`** (rev-5), **`js/36-object-detection.js`** (rev-5 — confirmed local-only carve-out); web `js/15-project.js` save/load fully replaced; a 50-MB project round-trips create → save → reload → render under 5 s on cable; **API contract documented as suitable for a future mobile consumer (versioning + auth + error model accommodate Dart/Flutter clients eventually) — no mobile client built in this cycle.** | M+ (6–9 wk)        | 02         |
| 04 | module-split                      | Module Split (P05/P06 boundary refactor — pure client refactor) | Carve client-side boundaries on `js/17c-create-pipeline.js` and `js/28-canvas-consistency.js` so subsequent server-side pipeline ports avoid file-level merge collisions. No behaviour change. | P03 exits.                                                                            | `js/17c-create-pipeline.js` (5,206 lines) split into `js/17c-create-pipeline.js` (~4,875 lines remain, AutoPilot core — math: 5,206 − 158 − 173 = 4,875 ± normalisation), **`js/17e-canvas-launch.js`** (~158 lines lifted from `4898–5051` (canvas functions block) + `5097–5100` (window export block), owns `openCanvasPanel`/`closeCanvasPanel`/`_callGeminiForVideoPrompts`/`cgFillVideoPrompts`/`cgLaunchVideoAgent` plus the `window.openCanvasPanel`/`window.closeCanvasPanel` exports at 5082–5083), and **`js/17f-tier2-lipsync-fal.js`** (~180 lines, Tier-2 fal.ai lipsync — destined for `/v1/jobs/lipsync` replacement in P06); `js/28-canvas-consistency.js` shared Gemini-call shim extracted into **`js/28a-image-gen-shim.js`**; `index.html` loader updated (the dynamic loader array at lines 4752–4766 + the eager `<script>` block around lines 4735–4740) — **no `MAIN_FILES` symbol exists**; `build.js` auto-discovers via its existing scans; `dist/index.html` builds identically; `git diff --stat` shows ~0 net line delta; founder-dogfood smoke passes (Illustrated AutoPilot, Animated AutoPilot, Tier-2 lipsync, canvas consistency regen all behave identically). | S (1–2 wk)         | 03         |
| 05 | autopilot-pipeline-extraction     | Async Job Infrastructure + AutoPilot Migration (the heavy phase) | Build the server-side async job infrastructure (submit → poll → done, idempotency, Cloud Run workers, R2 storage, provider routing) and migrate AutoPilot as the first consumer to prove the pattern end-to-end. P06 reuses this infrastructure for all remaining pipelines. | P04 exits (boundaries already split — P05 owns AutoPilot core in `17c` **and the Animated AutoPilot launch path in `17e`** per rev-4 option (a); P05 does NOT touch `17f` Tier-2 lipsync — that's P06).  | `/v1/projects/:id/launch`, `/v1/jobs/scene-images`, `/v1/jobs/animation` live; long jobs (Kling, Veo3) run on Cloud Run with status table + polling endpoint + idempotency keys; web autopilot path calls API exclusively (zero direct fetches to Google in `20-reels-creator.js`, `17a-create-api.js`, `17b-create-references.js`, `17c-create-pipeline.js`, `17d-create-languages.js`, **and `17e-canvas-launch.js`** per rev-4 option (a), **and `js/21-kling.js`** per rev-5 — the Gemini continuation-prompt call at `js/21-kling.js:356` must become `callApi()`); **`grep -nE "stori_kling_access_key\|stori_kling_secret_key\|generateKlingJWT" js/21-kling.js` returns 0 hits** (rev-4: server-side Kling JWT migration); **ElevenLabs STT** (`js/17a-create-api.js:468` direct `fetch('api.elevenlabs.io/v1/speech-to-text')`) replaced with `/v1/audio/transcribe` (sync endpoint, Create Story Step 1); **Lyria 3 BGM** generation covered for both `js/17c-create-pipeline.js:4238` and `js/20-reels-creator.js:4604` (explicit mention — Lyria returns audio binary, not JSON, and uses a different model than text/image generation); **P05 carve-out (rev-5 per M4 Option B):** fal.ai LoRA inference calls in `js/17c-create-pipeline.js:2648–2750` (`generateLoraImage()`) are deferred to P06 (LoRA Studio pipeline) — they remain as direct `fetch` calls behind a feature flag (LoRA inference only fires when `window.LoraLibrary` reports a ready LoRA); a 4-scene Animated reel round-trips end-to-end including BGM (Lyria 3) and exports a playable MP4; **Illustrated mode shipped first behind a feature flag, Animated mode shipped second** as a phase-internal milestone; canary 5/50/100 traffic-shift drill executed on a no-op revision. | L (6–10 wk)       | 04         |
| 06 | secondary-pipelines-extraction    | Secondary Pipelines (PhotoPilot, Brainstorm, Canvas, Lipsync, Audio, Input-Parser, LoRA Studio) | Move the remaining 7 feature pipelines + the Tier-2 lipsync slot to `/v1/*` so the web client never calls Google, fal.ai, Replicate, or ElevenLabs directly. | P05 exits (the heavy AutoPilot pattern is proven).                                     | `/v1/jobs/photopilot`, `/v1/brainstorm/*`, `/v1/brainstorm/classify`, `/v1/brainstorm/extract-url` (rev-5: Jina Reader proxy, replaces direct `r.jina.ai` fetch in `26-brainstorm.js:637`), `/v1/projects/:id/canvas`, `/v1/canvas/face-swap` (rev-5: async, server proxies to Replicate for post-process face swap on photorealistic/cinematic scene images), `/v1/jobs/lipsync` (replaces both client MediaPipe **and** the P04-isolated `js/17f-tier2-lipsync-fal.js`), `/v1/parse-input`, `/v1/audio/*`, `/v1/audio/transcribe` (rev-5: ElevenLabs STT sync endpoint, replaces direct `api.elevenlabs.io/v1/speech-to-text` fetch), `/v1/audio/voices` (rev-5: ElevenLabs voice catalog, replaces direct `api.elevenlabs.io/v1/voices` fetch), `/v1/jobs/voice-rehearsal`, `/v1/jobs/lora-training` (rev-5: async, fal.ai LoRA training submit→poll→done), `/v1/lora/inference` (rev-5: sync, fal.ai Flux+LoRA inference), `/v1/lora/voice-clone` (rev-5: async, ElevenLabs IVC voice cloning), `/v1/lora/appearance-extract` (rev-5: sync, Gemini Vision appearance extraction) all live and called by web; canvas-state validation gates (`sectionWarnings`, `launchBlockers`) computed server-side; **`video_mode` immutability** enforced server-side (any attempt to mutate `video_mode` after launch returns 409 — instance/audio/BGM/storyboard edits remain legal per ADR-06); **zero direct fetches** to any AI provider from `js/24-photopilot.js`, `js/26-brainstorm.js`, `js/26b-llm-router.js`, `js/27-canvas-state.js`, `js/28-canvas-consistency.js`, `js/30-lipsync.js`, `js/17a-create-api.js`, `js/32-audio-input.js`, `js/33-audio-rehearsal.js`, **`js/34-lora-library.js`** (rev-5); end-to-end smoke test runs each feature once and writes outputs to R2.       | L (8–13 wk)        | 05         |
| 07 | web-cutover                       | Web Cutover (delete BYOK, ship versioned API only)  | Strip the legacy client of all direct AI calls and **all browser-stored provider secrets** (Gemini, Kling, ElevenLabs, OpenAI, Anthropic, fal.ai, Replicate — 7 BYOK providers + 1 keyless provider Jina Reader); web ships against `/v1/*` exclusively.                    | P06 exits.                                                                            | Fresh grep across **all seven BYOK provider key prefixes** (`stori_key_paid`/`stori_key_free`/`stori_kling_*`/`stori_elevenlabs_key`/`stori_openai_key`/`stori_anthropic_key`/`stori_fal_api_key`/`stori_replicate_api_key`) **and** all seven BYOK provider URLs (`generativelanguage.googleapis.com`/`api.openai.com`/`api.anthropic.com`/`api.elevenlabs.io`/`fal.run`/`queue.fal.run`/Kling endpoints/`api.replicate.com`) **and** the keyless provider URL (`r.jina.ai`) returns 0 hits in `js/` and `index.html` (**`marketing-pipeline/` is explicitly excluded** — separate deployment with its own BYOK flow, not in scope for this migration); BYOK settings UI removed from `index.html` for all seven providers; **dollar-cost UI removed (web shows no cost info between this phase and the future credits workstream — confirmed acceptable)** — includes Brainstorm `bs-cost-tag` deletion from `index.html` and `_updateMeta`/`_getProviderPricing` deletion from `js/26-brainstorm.js` (rev-5); **(rev-4)** `grep -rnE "callGeminiAPI\|getCreateGeminiKey\|getPPApiKey\|getReelApiKey\|getFreeKey\|getPaidKey\|getReelFreeKey\|getReelPaidKey\|trackCost" js/ index.html` returns 0 hits; **(rev-5)** `grep -rnE "_getReplicateKey\|_replicateFaceSwap\|applyFaceSwapToSceneImage\|_updateMeta\|_getProviderPricing" js/ index.html` returns 0 hits; `grep -rnE "generativelanguage.googleapis.com" js/21-kling.js` returns 0 hits (Gemini continuation-prompt call replaced); web shipped to production behind a feature flag with monitoring (Sentry events grouped, error budget defined); rollback drill executed (revert release in < 10 min via Vercel + feature flag flip).            | S (2–3 wk)        | 06         |
| 08 | production-launch                 | Production Launch + Operational Readiness (web + backend) | Ship web + backend to public users with monitoring, runbooks, canaries, and a phased rollout plan — web stack only.   | P07 exits.                                                                            | Sentry dashboards live for web + Cloud Run (no Flutter dashboards in this cycle); on-call runbook checked in (auth outage, Cloud Run job stuck, R2 region failure, AI provider rate-limit); canary 5/50/100 release drill on the real production Cloud Run service for at least one revision; one-page operational status doc on a public/internal URL; a mock-incident dry-run executed and post-mortem template filed; **mobile launch is explicitly NOT part of this phase — handled by the separate future mobile cycle.** | M (3–5 wk)        | 07         |

**Total estimated working duration (sequential dependency chain):** 24–35 working weeks (≈ 6–8.75 months) for solo founder + 1–2 engineers. With mobile dropped from this cycle, there is no parallel workstream to compress the timeline — the chain is fully sequential. P04 (module split, 1–2 wk) is short but mandatory before P05; revision 3 added 4–7 working weeks net vs revision 2 (1–2 wk for P04 + 2–3 wk for P03 expansion + 1–2 wk for P01 bootstrap sub-track). Revision 5 adds a further 2–4 working weeks net vs revision 4 (P06 surface +54% due to LoRA Studio pipeline, P06 duration 6–9 → 8–13 wk).

---

## Part 3 — Dependency DAG

```mermaid
flowchart LR
  P01[01 · Backend Foundations + Bootstrap] --> P02[02 · Auth Migration]
  P02 --> P03[03 · API Contract + Project State (12+ tables)]
  P03 --> P04[04 · Module Split]
  P04 --> P05[05 · Async Job Infrastructure + AutoPilot Migration]
  P05 --> P06[06 · Secondary Pipelines Extraction]
  P06 --> P07[07 · Web Cutover]
  P07 --> P08[08 · Production Launch]
```

**Edge legend:**
- All arrows are hard dependencies (predecessor must exit before successor enters).
- The DAG is a clean linear chain: P01 → P02 → P03 → P04 → P05 → P06 → P07 → P08. With mobile dropped, the previous soft P03 → P07-mobile and hard P05 → P07-mobile edges are gone.

**Parallelizable work:**
- Within P06, the seven secondary pipelines are mutually independent and can be split across two engineers. The order suggested in the phase doc will prioritise Brainstorm + Canvas (no long jobs) before Lipsync + Audio + LoRA Studio (long jobs that mirror P05's pattern, plus LoRA Studio's training submit→poll→done loop).
- Within P01, the four infra pillars (Supabase, Cloud Run, R2, Sentry) and the bootstrap sub-track can run in parallel for the first 1–2 weeks; integration is the last 1–2 weeks.
- No cross-phase parallelism remains. Mobile parallelism is no longer a lever (mobile is out of scope for this cycle).

---

## Part 4 — Rationale

### P01 — Backend Foundations (+ Repo Bootstrap)
**Why a phase:** five pieces of infra (Supabase, Cloud Run, R2, Sentry, repo bootstrap) are mutually independent but all required before any feature work. Bundling them avoids back-and-forth context switches and exposes integration friction early.
**Why this boundary:** stops at "one round-trip works for each pillar" + "CI is green on a sample PR" — no schemas, no auth, no API surface. Anything beyond that is the next phase.
**Why first:** override O14 is explicit; also, Cloud Run cold-start cost and R2 region selection have surprising lead times (account approval, billing alerts, IAM) that block everything else.
**Revision-3 addition:** the original P01 specified CI but said nothing about the monorepo bootstrap (TypeScript project refs, vitest config, playwright config, lint+prettier, pnpm workspaces). That was an implicit prerequisite for every later phase. Revision 3 makes it an explicit P01 sub-track (§5.8 in the phase doc), which is why duration grew from 3–5 wk to 4–6 wk.

### P02 — Auth Migration
**Why a phase:** auth is a discrete, high-risk slice that touches every future API call. Worth isolating so its rollout (incl. CORS lock, JWT lifetime, refresh) can be reviewed independently.
**Why this boundary:** stops at "JWT round-trips on a protected `/v1/*` route" — does not include any feature endpoints (those live in P03+).
**Why second:** without verified JWTs every later endpoint would be either insecure or built-on-mock — both are wasted work.
**Verified line-range fix:** the user brief and `migration-original-spec.md` cite the fake-auth stub at `js/15-project.js:1174-1177`; we verified by `grep` that the stub actually lives at lines **~1417–1472 (behavioural exit: `grep -n stori_user js/15-project.js` returns 0)** (lines 1174–1177 are PiP video restoration). Phase doc uses the corrected range.

### P03 — API Contract + Project State (Postgres + R2) — **expanded in revision 3, revised in revision 5**
**Why a phase:** project state is the data layer everything else writes to. Override O1 explicitly promotes it from V2 to V1 — no IndexedDB-only path is acceptable. Pairing it with the API contract (OpenAPI/tRPC choice + `/v1/*` namespace) means we ship one cohesive surface rather than two half-baked ones.
**Why this boundary:** does not extract any pipelines (P05, P06); only project CRUD + R2 presign + canvas-state schema + the 5 newly-surfaced persistence tables. Schema-design spike stays inline (no P03a sub-phase); spike budget grew **3 → 7 days** in revision 3 to cover the wider table set + reel-to-project import semantics.
**Why third:** every pipeline extraction needs a place to write outputs. Without project state shipped, P05 either stubs with mocks or rebuilds the IndexedDB write path — both are throwaway work.
**Future-mobile constraint:** the API contract must be designed so a future mobile (Dart/Flutter) consumer can pick it up without forcing a `/v2/*` migration. That means: stable JSON shapes, explicit versioning policy, error model that doesn't leak server internals, and auth flow that supports OAuth on mobile platforms. **No mobile client is built in this cycle** — the constraint is purely "don't paint into a corner."
**Revision-3 expansion (5 new tables, audit 2026-05-06):**
| New table | Source IndexedDB / localStorage site |
|---|---|
| `reel_projects` | **IDB call sites:** `js/20-reels-creator.js:5807, 5822` (`indexedDB.open('stori_db', 1)` — the actual call sites that need replacement). **Save/load handler context:** `js/20-reels-creator.js:4363–4481` (`saveProjectToGallery` handler) and `js/20-reels-creator.js:5485–5790` (`loadReelProject` function) shape the saved-project schema; both read/write the same `stori_db` store via the IDB calls cited above. |
| `cast_references` | `js/17b-create-references.js:683–760` (cast-image binaries — R2 keys with text-only metadata in this row) |
| `reference_library` | `js/17b-create-references.js:4797–5004` (`LIB_KEY` at 4801; per-user cross-project reference library, currently in localStorage `stori_ref_library_v1`) |
| `audio_inputs` | `js/32-audio-input.js:16–56` (audio-blob R2 keys) |
| `audio_rehearsals` | `js/33-audio-rehearsal.js:30–71` (rehearsal-render R2 keys) |

**Revision-5 expansion (`lora_items` table + `video_instances` columns, audit 2026-05-16):**

| New table | Source IndexedDB / localStorage site |
|---|---|
| `lora_items` | `stori_lora_items_v2` localStorage + `stori_lora_photos` IndexedDB (`js/34-lora-library.js:122`). Unified items table for LoRA products, characters, and all types. Columns: `id`, `user_id`, `name`, `kind` ENUM('product','talking-head','scene-real','scene-ai'), `trigger_phrase`, `trainer_endpoint`, `inference_endpoint`, `lora_url`, `lora_status` ENUM('uploading'|'generating'|'reviewing'|'training'|'ready'|'failed'), `fal_request_id`, `voice_profile`, `appearance_block`, `tuning_params JSONB`, `compatible_with`, `created_at`, `updated_at`. Binary blobs (training photos, previews, voice samples) migrate to R2 with key references stored in `lora_items` (or a separate `lora_training_photos` table if normalised). |

| Modified table | New columns |
|---|---|
| `video_instances` | `effects JSONB DEFAULT '[]'::jsonb`, `tracks JSONB DEFAULT '{}'::jsonb`, `animation_plan JSONB NULL` — three additive columns sourced from `js/27-canvas-state.js` uncommitted edits (lines 19, 63–65, 116–118, 375–377, 409–411). No migration concern for already-persisted rows; default values match the client migrator. |

**New local-only carve-outs (rev-5):**
| Carve-out | IDB database | Source | Rationale |
|---|---|---|---|
| `fx-model-cache` | `fx-model-cache` | `js/36-object-detection.js:63` | ML model binary cache (MobileSAM ONNX ~50–100 MB) for client-side inference; local-only by design, deterministically rebuildable from `window.__FX_MOBILESAM_URL`. Not user data. |
| `stori_bs_session` | (localStorage, not IDB) | `js/26-brainstorm.js:263` | Brainstorm session state (messages, provider, token counts) — ephemeral, not persistent user data. |

**IndexedDB databases — full enumeration (6, was 4):**
1. `stori_projects` (`js/15-project.js`)
2. `stori_library` (`js/15-project.js:361`) — brand assets; rev-4 elected to migrate → `brand_assets` table
3. `stori_db` (`js/20-reels-creator.js` × 2, `index.html:4808`)
4. `stori_cast_images_v1` (`js/17b-create-references.js`, `js/32-audio-input.js`, `js/33-audio-rehearsal.js`)
5. `stori_lora_photos` (`js/34-lora-library.js:122`) — **rev-5**, migrates to R2 + `lora_items`
6. `fx-model-cache` (`js/36-object-detection.js:63`) — **rev-5**, local-only carve-out
**Reel→Editor handoff:** the IndexedDB `stori_db` blob handoff at `js/20-reels-creator.js:5805–5847` plus `index.html:~4804–4825` (the `indexedDB.open('stori_db', 1)` call is at `index.html:4808`) is replaced with an API call (`/v1/projects/import-reel/:id` or a short-lived session-state token). No local handoff blob.
**Spike-deferred questions** (carried into the schema-design spike, recorded as ADR-01 open questions):
1. Should `reel_projects` be a separate table or unified with `projects` via a `project_kind` discriminator? Defer to spike.
2. What is the RLS shape of `reference_library` — strictly per-user, or shareable across a future team? Defer to spike (per-user-only for now).
**Tradeoff surfaced:** schema for active flags (🎯 single-select, ⭐ multi-select), instance hierarchies (storyboard → image → video), and the 5 new tables is not enumerated in any spec. Phase doc reads `js/27-canvas-state.js` (616 lines) + the 5 new audit-flagged source files directly and emits the canonical schema. Risk: schema choice affects P05/P06 and the future mobile cycle; getting this wrong forces a forward-only migration mid-flight (override O9).

### P04 — Module Split — **NEW in revision 3**
**Why a phase:** the audit (2026-05-06) flagged that `js/17c-create-pipeline.js` (5,199 lines) and `js/28-canvas-consistency.js` (224 lines) sit at the intersection of three downstream phases. Without a refactor first, P05 (AutoPilot extraction), P06 (secondary pipelines + Tier-2 lipsync replacement), and P07 (BYOK deletion) would all edit the same files in conflicting ways. The split isolates the units of change so each phase touches a different file.
**Why this boundary:** pure client-side refactor — splits two files, extracts one shim, updates `build.js`. **No new endpoints, no behaviour change, no BYOK touch.**
**Why fourth:** has to come *after* P03 (so we don't have to re-sequence work if the split surfaces a hidden coupling P03 needed) and *before* P05 (so P05 doesn't waste effort).
**Concrete ops:**
- `js/17c-create-pipeline.js` (5,206 lines) → `js/17c-create-pipeline.js` (~4,875 lines remain, AutoPilot core) + **`js/17e-canvas-launch.js`** (~158 lines lifted from current `4898–5051` + `5097–5100`: `openCanvasPanel`, `closeCanvasPanel`, `_callGeminiForVideoPrompts`, `cgFillVideoPrompts`, `cgLaunchVideoAgent` plus `window.openCanvasPanel`/`window.closeCanvasPanel` exports at 5082–5083) + **`js/17f-tier2-lipsync-fal.js`** (~180 lines lifted from current `3728–3900`: Tier-2 lipsync via fal.ai). Math: 5,206 − 158 − 173 = ~4,875. Earlier rev-3 cited "~3,200 remain" — that figure was a target that assumed additional unspecified extractions; rev-4 corrects to the verified `wc -l` reality. **Rev-4 pass-2 (2026-05-06)** refined the 17e extraction range to canvas functions only (4898–5051 + 5097–5100 export block, ~158 lines) and explicitly excludes `_generateNarratorClipsIfNeeded` at lines 5054–~5095 which stays in 17c. 17f range start moved 3721 → 3728 to skip the trailing `prepareLipSyncForExport` export from the prior Phase-7c block.
- `js/28-canvas-consistency.js` shared Gemini-call shim → **`js/28a-image-gen-shim.js`**, called by both `generateStyleFingerprint` (current line 95) and `regenerateImageInstance` (current line 148). **Rev-5 note:** `28-canvas-consistency.js` is now 404 lines (was 224). The Replicate face-swap code (`_getReplicateKey`, `_replicateFaceSwap`, `applyFaceSwapToSceneImage`, LoRA character lookup at lines 225–227) stays in `28` — it is not a Gemini shim. Line ranges for the `28a` extraction have shifted from the rev-4 plan's stale numbers; re-derive by `grep` for the named function boundaries at P04 kickoff.
- `index.html` loader updated (deferred loader array at lines 4752–4766 + eager `<script>` block at ~4735–4740, with `28-canvas-consistency.js` at line 4739). No `MAIN_FILES` symbol exists in `build.js`; `build.js` auto-discovers via its existing `<script>`-tag scans. `dist/index.html` rebuild produces an identical bundle.
**Exit guard:** `git diff --stat` near-zero net delta; `(17c + 17e + 17f) ≈ 5,581 ± 50` (rev-5: 17c line count updated per audit H1); `(28 + 28a) ≈ 404 ± 30` (rev-5: 28 line count updated per audit H1); founder dogfood smoke passes (Illustrated AutoPilot, Animated AutoPilot, Tier-2 lipsync, canvas regen all work identically).
**Considered and rejected naming:** "P03.5 module split" — rejected; a sub-phase number breaks the partition's linear convention. "Inline the split into P05" — rejected; P05 is already the longest phase and adding refactor scope would compress engineering time.

### P05 — Async Job Infrastructure + AutoPilot Migration (the heavy phase)
**Why a phase:** AutoPilot Reel is the single largest extraction surface — `20-reels-creator.js` (5,847) + the four `17*-create-*.js` files (13,462; rev-4 pass-2: 17b=5,126 + 17c=5,581 + 17a=1,981 + 17d=1,312; rev-5: line counts updated per audit H1 — re-run `wc -l` at kickoff for exact figures) = **~19,400 lines**, more than half of the total extraction surface. Mixing it with the other seven pipelines would make the phase span impossible to estimate and would defer the riskiest decisions (idempotency, retry, canary on Cloud Run jobs).
**Why this boundary:** stops at "AutoPilot reel round-trips end-to-end with BGM and exports MP4" — does NOT include PhotoPilot / Brainstorm / Canvas / Lipsync / Audio / Input-Parser / LoRA Studio. P05 touches `js/17c-create-pipeline.js` (~4,875 lines remain after the P04 split), `js/17a/b/d-create-*.js`, `js/20-reels-creator.js`, `js/21-kling.js`, **and `js/17e-canvas-launch.js`** (rev-4 option (a) — Animated AutoPilot path lives in P05; replace `_callGeminiForVideoPrompts`/`cgFillVideoPrompts`/`cgLaunchVideoAgent` direct calls with `callApi`). **Does NOT touch** `js/17f-tier2-lipsync-fal.js` (P06 territory) — that isolation is why P04 exists.
**Rev-5 additions:** P05 also replaces the Gemini continuation-prompt call in `js/21-kling.js:356` (used to generate the next-video-clip prompt by analysing the last frame) with `callApi()`. P05 replaces the direct ElevenLabs STT fetch at `js/17a-create-api.js:468` (`api.elevenlabs.io/v1/speech-to-text`) with `/v1/audio/transcribe` (sync endpoint). **Lyria 3 BGM** is explicitly covered: both `js/17c-create-pipeline.js:4238` (Create Story path) and `js/20-reels-creator.js:4604` (Reel BGM path) call `generativelanguage.googleapis.com/v1beta/models/lyria-3-clip-preview:generateContent` — Lyria returns audio binary (not JSON) and uses a different model than text/image generation; P05's existing `/v1/jobs/animation` endpoint (or a dedicated `/v1/audio/bgm` endpoint) covers both call sites.
**Rev-5 carve-out (M4 Option B):** fal.ai LoRA inference calls in `js/17c-create-pipeline.js:2648–2750` (`generateLoraImage()`) are **deferred to P06** (LoRA Studio pipeline). These remain as direct `fetch` calls in `17c` until P06 completes. This is safe because LoRA inference only fires when `window.LoraLibrary` reports a ready LoRA (behind a feature flag / conditional). Keeps P05 scope bounded — P05 is already the longest phase.
**Why fifth:** the long-job pattern (status table, polling, idempotency, canary 5/50/100) is invented here once and reused in P06. Doing the heaviest extraction first means subsequent pipelines slot into a proven pattern.
**Tradeoff surfaced:** P05 is the longest phase. Compression strategy: ship Illustrated mode first behind a feature flag and Animated mode second within the phase, treating Animated as a phase-internal milestone — gives an early shippable. The previous "start mobile in parallel" lever no longer applies (mobile out of scope).

### P06 — Secondary Pipelines Extraction
**Why a phase:** seven feature pipelines (PhotoPilot 2,745 lines, Brainstorm 2,393 (2,228 + 165 from `26b-llm-router.js`), **Canvas 1,020** [27-canvas-state.js 616 + 28-canvas-consistency.js 404; rev-5: +180 lines for Replicate face swap at `28:133–298` + LoRA character lookup at `28:225–227`; `js/29-canvas-render.js` 3,658 stays client-side per inventory and is NOT in the extraction surface], Lipsync 532 (352 + ~180 from P04-isolated `17f`), Audio ~2,398 (1,229 + 1,169; now verified real), Input-Parser 809, **LoRA Studio 4,413** [`js/34-lora-library.js` — rev-5 addition: fal.ai training/inference + ElevenLabs voice cloning + Gemini appearance extraction + Gemini training-image generation + IDB photo management + localStorage item CRUD]) — **~14,310 lines** combined. They share the AutoPilot pattern from P05 and are mutually independent, so they parallelise cleanly across two engineers.
**Why this boundary:** ends at "all client features hit `/v1/*` exclusively for AI calls" — does NOT delete client BYOK code or rip out `index.html` (that's P07's cleanup).
**Why sixth:** each pipeline reuses P05's job pattern. Doing them after P05 means zero re-design. Boundaries are clean post-P04 — `/v1/jobs/lipsync` slot replaces both `js/30-lipsync.js` (server MediaPipe) and `js/17f-tier2-lipsync-fal.js` (server fal.ai). No collisions with P05 pipeline files.
**Rev-5 LoRA Studio pipeline detail:** `js/34-lora-library.js` (4,413 lines) introduces 13 direct browser→provider `fetch()` calls (2× fal.ai inference, 1× fal.ai training submit, 1× training poll, 1× training result, 1× fal.ai sync helper, 1× ElevenLabs voice clone, 2× Gemini generateContent, plus ~5 image URL fetches). Storage surface: `stori_lora_photos` IDB (training photos, previews, voice samples → R2) + `stori_lora_items_v2`/`stori_lora_products_v1`/`stori_lora_characters_v1` localStorage → `lora_items` Postgres table (created in P03). Cross-file integration: `window.LoraLibrary.*` called from `01-core.js:456–457`, `17c:2691–2713,2648–2750,4449,1734–1735`, `28:225–227,353–356`, `17b:2561–2562,3198`. Four new P06 endpoints: `/v1/jobs/lora-training` (async submit→poll→done), `/v1/lora/inference` (sync), `/v1/lora/voice-clone` (async), `/v1/lora/appearance-extract` (sync). The fal.ai LoRA inference calls in `17c:2648–2750` (deferred from P05 per M4 Option B) are also migrated here.
**Rev-5 Canvas face swap detail:** `js/28-canvas-consistency.js:133–298` includes Replicate face swap via `codeplugtech/face-swap` pinned model. Direct `fetch('https://api.replicate.com/v1/predictions')` with 3s poll loop, 120s timeout. New P06 endpoint: `/v1/canvas/face-swap` (async, server proxies to Replicate). Skip conditions: not photoreal/cinematic → skip; no Replicate key → skip; character has ready LoRA → skip (LoRA handles identity; face swap is fallback).
**Rev-5 additional P06 endpoints:** `/v1/audio/transcribe` (ElevenLabs STT, sync), `/v1/audio/voices` (ElevenLabs voice catalog, sync), `/v1/brainstorm/extract-url` (Jina Reader URL extraction proxy, replaces direct `r.jina.ai` fetch in `26-brainstorm.js:637`). JSZip CDN dynamic load at `js/34-lora-library.js:3998` becomes dead code after P06 — P07 deletes `_loadJSZip`.
**In-scope files with no extraction needed (rev-5):** `js/35-video-effects.js` (1,085 lines — pure client-side canvas FX engine; no API calls, no IDB, no localStorage; stays client-side); `js/36-object-detection.js` (213 lines — MobileSAM ONNX + MediaPipe Face/Hand/Pose; opens `fx-model-cache` IDB which is a P03 local-only carve-out; no external API calls; stays client-side); `js/25-photopilot-fx.js` (707 lines — PhotoPilot effect definitions; no API calls, no storage; stays client-side).
**Considered and rejected:** splitting into 2 phases (e.g. "no-long-jobs: Brainstorm + Canvas + Input-Parser" then "long-jobs: PhotoPilot + Lipsync + Audio + LoRA Studio") — rejected because (1) it pushes phase count to 9 with no engineering benefit; (2) the no-long-jobs pipelines are tiny (Brainstorm 2,393 + **Canvas 1,020** + Input-Parser 809 = 4,222 lines) and can simply be parallelised within P06. LoRA Studio, at 4,413 lines, is larger than any other secondary pipeline but follows the same submit→poll→done pattern proven in P05.

### P07 — Web Cutover
**Why a phase:** deletion is its own discipline. Mixing it into P06 risks half-deleted BYOK code shipping. A standalone phase forces a clean grep for all seven BYOK provider key prefixes, one keyless provider URL, and any remaining direct fetch calls.
**Why this boundary:** code deletion + BYOK UI removal (all seven BYOK providers) + dollar-cost UI removal (including Brainstorm `bs-cost-tag` and `_updateMeta`/`_getProviderPricing`) + production feature-flag flip on web. Does NOT include mobile (out of scope) or production launch (P08).
**Why seventh:** P06 must be done; you can't delete the BYOK fallback while a pipeline still depends on it.
**Rev-5 provider expansion (7 BYOK + 1 keyless):**
| # | Provider | Key prefix(es) | URL pattern |
|---|---|---|---|
| 1 | Gemini | `stori_key_paid`, `stori_key_free` | `generativelanguage.googleapis.com` |
| 2 | Kling | `stori_kling_access_key`, `stori_kling_secret_key` | Kling endpoints |
| 3 | ElevenLabs | `stori_elevenlabs_key` | `api.elevenlabs.io` |
| 4 | OpenAI | `stori_openai_key` | `api.openai.com` |
| 5 | Anthropic | `stori_anthropic_key` | `api.anthropic.com` |
| 6 | fal.ai | `stori_fal_api_key` | `fal.run`, `queue.fal.run` |
| 7 | **Replicate** | **`stori_replicate_api_key`** | **`api.replicate.com`** |
| 8 | **Jina Reader** (keyless) | — | **`r.jina.ai`** |
**Rev-5 additional grep targets:** `_getReplicateKey`, `_replicateFaceSwap`, `applyFaceSwapToSceneImage` (Replicate face swap in `28-canvas-consistency.js`); `_updateMeta`, `_getProviderPricing` (Brainstorm cost logic in `26-brainstorm.js`); `js/21-kling.js` added to Gemini URL grep (continuation-prompt call at `21-kling.js:356` must show 0 hits for `generativelanguage.googleapis.com`).
**Rev-5 `marketing-pipeline/` exclusion:** grep targets `js/` and root `index.html` only — `marketing-pipeline/` is explicitly excluded (separate deployment with its own BYOK flow using different key names like `stori_kling_key`/`stori_fal_key`, not in scope for this migration).
**Stale grep numbers (revision-3 audit fix already applied):** the original spec cited "36 refs across 6 files" for `stori_key_paid` / `stori_key_free` only — that count missed five other provider key surfaces (now six other surfaces with Replicate). The phase doc now itemises all seven provider keys + URLs + the keyless Jina Reader URL. Re-run all eight provider greps at phase kickoff.
**Cost-estimator UI:** the existing client-side cost estimator (`cost-estimator.html`, `cost-estimator-plan.md`, `cost-estimator-mock.html` referenced in working tree but not in scope) is currently dollar-figure-based. This phase removes it from the production UI entirely; the future credits workstream will replace it. **User confirmed: web shows no cost info between this phase and the future credits/billing workstream.** Phase doc is explicit: this is not "the credits feature lives here" — it is "the dollar-cost UI is removed; the credits feature is a separate later workstream." **Rev-5 addition:** Brainstorm's per-session dollar cost display (`bs-cost-tag` in `index.html:4248`, computed by `_updateMeta()`/`_getProviderPricing()` in `js/26-brainstorm.js:1435–1450` using hardcoded per-token pricing) is also deleted — it is a separate UI element from the global cost estimator and was not previously flagged.

### P08 — Production Launch + Operational Readiness (web + backend only)
**Why a phase:** "ship to users" is not free. Sentry dashboards, runbooks, canary drills, and an on-call rotation are not implicit; they have to be built and tested.
**Why this boundary:** infra → web feature shipped to a small public cohort with rollback proven. Does NOT include billing (out of scope), mobile rollout (deferred to future mobile cycle), or post-launch growth instrumentation. Sentry coverage is web SDK + Cloud Run SDK only — Flutter SDK setup moves to the future mobile cycle.
**Why last:** by definition, can't ship until P07 (web ready) is done.

### Considered and rejected partitions
- **A "billing" phase** — explicitly forbidden by override O15. Out of plan.
- **A "mobile" phase in this cycle** — rejected per user course correction. Mobile is a separate workstream that **consumes** the migrated backend; it is not part of the migration itself. Mobile will get its own architect cycle later, with `redesign-plan.md` as input and this cycle's P03 API contract as a constraint. (Revision 1 of this partition included a P07 mobile phase and a P08 launch phase; user course-corrected before fan-out.)
- **Splitting P01 into "Supabase" / "Cloud Run+R2" / "Sentry" / "Bootstrap"** — rejected; that would be 4 phases of mostly-account-setup ceremony with the same exit criterion. Bundling them into one foundations phase (with parallel tracks) is the right granularity.
- **Splitting P03 into "API contract" / "Project state schema" / "R2 wiring"** — rejected; the three are tightly coupled (the schema lives in the API contract; R2 URLs are part of project responses) and splitting them would create false dependencies. Schema spike stays inline (now 7 days) per user confirmation.
- **Numbering P04 module-split as P03.5** — rejected; user chose linear renumbering (Option A in revision-3 gate). Sub-phase numbers break the partition's linear convention.
- **Combining P02 (Auth) with P01 (Foundations)** — rejected; auth has its own E2E test surface and JWT-lifetime decisions that warrant a phase boundary. Also lets us ship the JWT-verification middleware as a clean layer before any feature endpoint relies on it.
- **Combining P05 + P06 into one "pipeline extraction" phase** — rejected; the size disparity (~19,400 vs ~14,310 lines) and the risk concentration in AutoPilot warrant the split. Doing them together would also delay the "long-job pattern" learning until the very end.
- **Combining P07 (Web Cutover) with P06** — rejected; deletion needs its own discipline (see rationale above). Saves zero working time and increases risk.
- **Inlining the P04 split into P05** — rejected; P05 is already the longest phase. Adding a 1–2 wk refactor to it would compress feature-extraction time and increase merge-collision risk. Splitting first is cheaper.

### Coverage and risk callouts
- Coverage = 100% of in-scope inventory rows mapped to ≥ 1 phase. 15 of 38 inventory rows are explicitly out-of-scope (2 billing per O15, 13 mobile per the revision).
- 8 cross-cutting decisions flagged for ADRs (unchanged from revision 2 — ADR-01 expanded with 5 new tables in revision 3 and `lora_items` + 3 columns on `video_instances` in revision 5, but no new ADRs added). P04 raises no new ADR-worthy decisions; it is a mechanical refactor that aligns with already-decided server-side boundaries (ADR-01, ADR-02, ADR-03, ADR-07).
- Unanchored-claim risks from the inventory (15 total; 10 still relevant after dropping mobile rows) will be carried into the relevant phase docs as "Open Questions" — none are blocking the partition.
- Highest schedule risk: P05 (AutoPilot extraction). Highest behavioural risk: P03 (project state schema choice — gets locked in early; mistakes are expensive to fix later, especially because the future mobile client must consume the same API). Highest correctness risk: P04 (a regression in the split would silently break Tier-2 lipsync or canvas regen — mitigated by the dogfood smoke gate).

---

## Part 5 — Out of scope

| #  | Spec section / source                                                                                       | Why out of scope                                                                                                                                                                              |
|----|-------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | `migration-original-spec.md` §"Subscription Plans" L296–304                                                       | **Deferred** — explicit billing content. Override O15: billing is a separate later workstream.                                                                                                |
| 2  | `migration-original-spec.md` §"Stripe" — `api/stripe/checkout.js`, `api/stripe/webhook.js`, `api/stripe/portal.js` (L164–173); §"Phase 3 Stripe" L324–328; §"Effort Estimate" billing rows L344 | **Deferred** — Stripe surface entirely. Override O15.                                                                                                                                          |
| 3  | `migration-original-spec.md` §"Schema" — `subscriptions` table; `users.plan`, `users.images_limit`, `users.videos_limit`, `users.period_*`; `api/_lib/quota.js`; quota deduct RPC | **Deferred** — quota / billing schema. Override O15.                                                                                                                                          |
| 4  | `pricing-plan.md`                                                                                            | **Deferred** — not read at all per directive. Will not be referenced anywhere downstream.                                                                                                     |
| 5  | `redesign-plan.md` (entire file)                                                                              | **Deferred — mobile-only spec.** Covered in a separate future architect cycle that will consume this cycle's P03 API contract as a constraint. No phase doc in this cycle reads from `redesign-plan.md`.                                 |
| 6  | `redesign-plan.md` §1 Goals & Scope L7–31                                                                     | **Deferred** — mobile-only. See row 5.                                                                                                                                                         |
| 7  | `redesign-plan.md` §2 Architecture & Data L34–43                                                              | **Deferred** — mobile-only. (Active-flag schema and instance hierarchy are independently captured in P03 by reading `js/27-canvas-state.js` directly, not via `redesign-plan.md`.)             |
| 8  | `redesign-plan.md` §3 Screen Inventory L46–61                                                                 | **Deferred** — mobile-only. See row 5.                                                                                                                                                         |
| 9  | `redesign-plan.md` §4 Phased Plan L65–138 (all sub-phases P0–P7)                                              | **Deferred** — mobile-only. See row 5.                                                                                                                                                         |
| 10 | `redesign-plan.md` §5 Engineering Risks L142–151                                                              | **Deferred** — mobile-only. (Cross-cutting risks like Kling polling latency are independently captured in P05's risk table from `migration-original-spec.md`.)                                       |
| 11 | `redesign-plan.md` §6 Suggested Total Effort L155–157                                                         | **Deferred** — mobile-only headcount/duration estimate.                                                                                                                                        |
| 12 | `redesign-plan.md` §7 Reference Files L161–168                                                                | **Reference** — pure citation list, mobile only.                                                                                                                                              |
| 13 | Mockup HTML files (`*-mobile-mockup.html` in `app/`)                                                           | **Deferred — mobile UI fidelity references.** Covered in future mobile cycle. Not edited and not directly mapped to any phase exit criterion in this cycle.                                   |
| 14 | `migration-original-spec.md` §"Notes" L351–358 (V1/V2 split commentary)                                            | **Reference** — superseded narrative; the V2-now-V1 promotion is captured in the phase plan, the legacy commentary is reference only.                                                          |
| 15 | Cost-estimator working files (`cost-estimator.html`, `cost-estimator-mock.html`, `cost-estimator-plan.md` in repo root) | **Deferred** — pre-existing client-side dollar-cost UI; will be removed in P07. The replacement (credits feature) is the future billing workstream. Phase doc covers the *removal* in P07; the replacement is out of scope. |

---

## Part 6 — Flagged ADR candidates

| #  | Decision topic                                       | Phases affected                            | Recommendation |
|----|------------------------------------------------------|--------------------------------------------|----------------|
| 1  | Project state model (Postgres + R2) — **expanded in revision 3** to 10 tables, **revised in revision 5** to 12+ tables (`lora_items` + 3 columns on `video_instances`) | P03, P05, P06           | **ADR-01**     |
| 2  | Long-running job architecture (Cloud Run worker)     | P01, P05, P06, P08                         | **ADR-02**     |
| 3  | Web/mobile API contract — versioning strategy must accommodate future mobile clients eventually | P03, P05, P06, P07              | **ADR-03**     |
| 4  | Trunk-based dev + canary deployment + feature flag tooling — **CI bootstrap explicit in P01** | P01, P07, P08              | **ADR-04**     |
| 5  | Auth & session (Supabase Auth, JWT lifetime, RLS)    | P02, P03, P08                              | **ADR-05**     |
| 6  | Mode lock invariant (`videoMode` immutability)        | P03, P05, P06                              | **ADR-06**     |
| 7  | File storage strategy (R2 presigned vs proxy + lifecycle + CDN) | P01, P03, P05, P06                | **ADR-07**     |
| 8  | Observability (Sentry across web + Cloud Run only — Flutter SDK deferred to future mobile cycle) | P01, P07, P08            | **ADR-08**     |

**Dropped from this cycle (vs revision 1):**
- ADR-04 (revision-1 numbering) — Mobile version compatibility / force-update + remote feature flags. Belongs to the future mobile architect cycle.
- Inline #10 (revision-1) — Mobile classification heuristic vs Gemini for Brainstorm. Was P07-mobile only; deferred.
- Inline #11 (revision-1) — Mobile FFmpeg framework footprint. Was P07-mobile only; deferred.

**ADR file naming (per architect directive):** `migration-adr-NN-<slug>.md` at `/Users/praveen/Desktop/stori/`. ADRs 01–08 already captured.

**Final ADR count: 8** (unchanged across revisions 2, 3, 4, and 5 — ADR-01 expanded internally in rev-3 and rev-5; no new ADRs added).

---

## Part 7 — Verification & Checkpoints

### 7.1 Checkpoint Levels

| Level | Name | When | Who | Pass criteria |
|-------|------|------|-----|----------------|
| L0 | Instance checkpoint | Mid-phase sub-milestone | Agent (automated) | Grep gates + smoke pass; record in `migrations/checkpoint-log.md` |
| L1 | Phase exit gate | End of phase | Agent + human review | Full exit criteria from task brief; human approves before next phase starts |
| L2 | Cross-phase regression | After P05, P07 | Agent + human | Previously-completed phases still functional; no regressions |

**Instance checkpoints** are defined in each task brief (e.g., CP-05-1 through CP-05-5 for P05). Agents must complete every L0 in order before declaring L1 done.

**HALT rule:** any L0 grep gate with unexpected hits → STOP, fix before continuing. 3 consecutive L0 failures on the same checkpoint → ESCALATE to human.

### 7.2 Cross-Phase Integration Gates (L2)

**L2-05: After P05, verify P01–P04 still intact**
```bash
# P01: infra healthy
curl -sf https://$CLOUDRUN_URL/v1/health | jq .ok
# → true

# P02: auth enforces JWT
curl -sf https://$CLOUDRUN_URL/v1/me | jq .statusCode
# → 401

# P03: project CRUD works
curl -sf -H "Authorization: Bearer $JWT" https://$CLOUDRUN_URL/v1/projects | jq .length
# → 0+

# P04: split files still present
ls js/17e-canvas-launch.js js/17f-tier2-lipsync-fal.js js/28a-image-gen-shim.js
# → all exist
```

**L2-07: After P07, full regression (most critical — P07 deletes a lot of code)**
```bash
# P01: infra healthy
curl -sf https://$CLOUDRUN_URL/v1/health | jq .ok

# P02: auth + JWT
curl -sf https://$CLOUDRUN_URL/v1/me | jq .statusCode
# → 401 without JWT

# P03: project CRUD + R2 presign round-trip
curl -sf -H "Authorization: Bearer $JWT" https://$CLOUDRUN_URL/v1/projects

# P05: AutoPilot end-to-end (Illustrated + Animated)
# Create project → launch → poll jobs → verify images/video produced

# P06: 7 secondary pipelines quick smoke
# Brainstorm, photopilot, canvas, lipsync, audio, input-parser, lora

# P07: zero regressions (BYOK grep still 0)
grep -rnE "stori_key_paid|stori_key_free" js/ index.html
# → 0 (still 0, not re-introduced)
```

Full regression checklist for L2-07: sign-in, project CRUD, AutoPilot Illustrated, AutoPilot Animated, Brainstorm, PhotoPilot, Canvas validate + face swap, Lipsync, Audio, Input parser, LoRA inference, and verify zero console `ReferenceError`.

### 7.3 Verification Layers

| Layer | What | When |
|-------|------|------|
| A — Grep gates | Pattern-based source code verification | Every L0 + L1 |
| B — Integration tests | API round-trip tests (vitest + playwright) | Every L0 + L1 |
| C — Manual smoke | End-to-end feature verification in browser | L1 + L2 |

**Grep gate rules:**
1. Every command is copy-pasteable — no interpretation needed.
2. Expected output always stated (`# → 0 hits`, `# → non-zero`).
3. Carve-out exceptions explicit (e.g., "fal.ai at 17c:2648-2750 expected non-zero").
4. Grep scope explicit: `js/` + `index.html` only (NOT `marketing-pipeline/`).

**Minimum integration tests per phase:** P01=4, P02=2, P03=5, P04=2, P05=5, P06=8, P07=3, P08=2.

### 7.4 Smoke Test Infrastructure

```
scripts/smoke/
├── smoke-lib.sh              ← shared: get_jwt, assert_grep_zero, assert_http_status
├── smoke-01-foundations.sh
├── smoke-02-auth.sh
├── smoke-03-api-contract.sh
├── smoke-04-module-split.sh
├── smoke-05-autopilot.sh
├── smoke-06-secondary.sh
├── smoke-07-cutover.sh
├── smoke-08-launch.sh
├── smoke-L2-regression.sh
└── smoke-all.sh              ← runs all for current phase
```

### 7.5 Checkpoint Log

All checkpoint results are recorded in `migrations/checkpoint-log.md`:
```
## CP-05-2: Illustrated AutoPilot Migrated
- **Date:** 2026-XX-XX
- **Agent:** <agent-id>
- **VERIFY:** PASS (0 hits on all grep gates)
- **SMOKE:** PASS (Illustrated AutoPilot full run successful)
- **HALT:** none triggered
- **Notes:** 26 callGeminiAPI sites replaced with callApi; fal.ai carve-out intact
```

### 7.6 Rollback Rules

| Condition | Action |
|-----------|--------|
| L0 VERIFY unexpected hits | STOP, fix within same instance |
| L0 SMOKE fails | STOP, investigate; if data-corrupting, revert last commit |
| 3× L0 failure on same checkpoint | ESCALATE to human |
| L1 exit gate fails | BLOCK next phase; human approves remediation |
| L2 regression fails | ROLLBACK to last known-good L1; re-verify |

---

*End of phase index. Revision 5 — 2026-05-16.*
