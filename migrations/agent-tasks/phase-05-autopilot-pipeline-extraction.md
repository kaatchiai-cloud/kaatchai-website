# Phase 05 — AutoPilot Pipeline Extraction: Agent Task Brief

## Scope
- Build server-side async job infrastructure (jobs table, in-process worker, idempotency, polling) — ADR-02
- Create `/v1/projects/:id/launch`, `/v1/jobs/scene-images`, `/v1/jobs/animation`, `/v1/jobs/bgm`, `GET /v1/jobs/:id` endpoints on Cloud Run
- Create `/v1/audio/transcribe` (sync, ElevenLabs STT) and `/v1/audio/voices` (sync, ElevenLabs voice catalog) endpoints
- Migrate AutoPilot client to `callApi(...)`: `js/17a-create-api.js`, `js/17b-create-references.js`, `js/17c-create-pipeline.js`, `js/17d-create-languages.js`, `js/20-reels-creator.js`, `js/21-kling.js`, `js/17e-canvas-launch.js`
- Replace `generateKlingJWT()` + Kling BYOK keys in `js/21-kling.js` with server-side JWT signing
- Replace Gemini continuation-prompt call at `js/21-kling.js:356` with `callApi('/v1/gemini/generate-content')`
- Replace ElevenLabs STT (`js/17a-create-api.js:468`) and voice catalog (`js/17a-create-api.js:753`) with `callApi('/v1/audio/transcribe')` and `callApi('/v1/audio/voices')`
- Replace Lyria 3 BGM calls (`js/17c-create-pipeline.js:4238`, `js/20-reels-creator.js:4604`) with `callApi('/v1/jobs/bgm')`
- fal.ai LoRA inference in `js/17c-create-pipeline.js:2648-2750` is **deferred to P06** (M4 Option B carve-out)
- Animated AutoPilot path lives in P05 (option (a)): replace `17e-canvas-launch.js` Gemini + Kling calls with `callApi('/v1/...')`

## Files to modify
| File | Action | Verified line range | What changes |
|---|---|---|---|
| `js/17a-create-api.js` | MODIFY | ~1,981 lines (rev-5) | Replace `callGeminiAPI` call sites (16 hits) with `callApi(...)`. Replace ElevenLabs STT `:468` + voices `:753` direct fetches. Do NOT delete key-getters or `callGeminiAPI` definition — P07 owns. |
| `js/17b-create-references.js` | MODIFY | ~5,126 lines | Replace `callGeminiAPI` call sites (6 hits) with `callApi(...)`. |
| `js/17c-create-pipeline.js` | MODIFY | ~5,250 lines (post-P04) | Replace `callGeminiAPI` call sites (3 hits) + Lyria BGM `:4238` with `callApi(...)`. Do NOT touch fal.ai `:2648-2750` — P06 carve-out. |
| `js/17d-create-languages.js` | MODIFY | ~1,312 lines | Replace `callGeminiAPI` call sites with `callApi(...)`. |
| `js/17e-canvas-launch.js` | MODIFY | ~158 lines (P04-created) | Replace `_callGeminiForVideoPrompts` + Gemini/Kling calls in `cgFillVideoPrompts`/`cgLaunchVideoAgent` with `callApi(...)`. |
| `js/20-reels-creator.js` | MODIFY | ~5,847 lines | Replace `callGeminiAPI` call sites (16 hits) + Lyria BGM `:4604` with `callApi(...)`. |
| `js/21-kling.js` | MODIFY | See below | Delete `generateKlingJWT()` (`:12–~30`) + `localStorage` reads at `:13–14`. Replace `await generateKlingJWT()` at `:37` and `:70` with `callApi(...)`. Replace Gemini call at `:356` with `callApi('/v1/gemini/generate-content')`. |
| `infra/supabase/migrations/0003_jobs.sql` | CREATE | — | `jobs` table (id, project_id FK, type enum, status enum, idempotency_key unique, attempt_count, timestamps, error jsonb, output jsonb, progress jsonb) |
| `infra/cloud-run/routes/jobs.js` | CREATE | — | `/v1/jobs/*` route registration + `GET /v1/jobs/:id` |
| `infra/cloud-run/worker/loop.js` | CREATE | — | In-process worker: `setInterval(2000, tick)`, selects 5 pending jobs, dispatches by type, crash-safe reap at 30 min |
| `infra/cloud-run/providers/gemini.js` | CREATE | — | `geminiImageGen()`, `geminiGenerateContent()`, `geminiTts()` |
| `infra/cloud-run/providers/kling.js` | CREATE | — | `klingSubmit()`, `klingPoll()` |
| `infra/cloud-run/providers/veo3.js` | CREATE | — | Same shape as Kling (behind feature flag) |
| `infra/cloud-run/providers/lyria.js` | CREATE | — | `lyriaGenerate()` |
| `infra/cloud-run/providers/elevenlabs.js` | CREATE | — | `elevenlabsTranscribe()`, `elevenlabsVoices()` (cached TTL 24h) |
| `infra/cloud-run/runbooks/canary.md` | CREATE | — | Canary 5/50/100 drill log on no-op revision |

## New endpoints
| Method | Path | Replaces | Sync/Async |
|---|---|---|---|
| POST | `/v1/projects/:id/launch` | Client-side AutoPilot launch | Async (enqueues jobs) |
| POST | `/v1/jobs/scene-images` | Client-side Gemini image-gen | Async (long job) |
| POST | `/v1/jobs/animation` | Client-side Kling submit/poll | Async (long job) |
| POST | `/v1/jobs/bgm` | Client-side Lyria BGM call | Async (long job) |
| GET | `/v1/jobs/:id` | — | Sync (status poll) |
| POST | `/v1/audio/transcribe` | Direct `api.elevenlabs.io/v1/speech-to-text` | Sync |
| GET | `/v1/audio/voices` | Direct `api.elevenlabs.io/v1/voices` | Sync |
| POST | `/v1/gemini/generate-content` | Direct Gemini continuation-prompt at `21-kling.js:356` | Sync |

## Exit criteria
```
# 1. All endpoints live
curl -s https://<CLOUDRUN_URL>/v1/health | jq .ok
# → true

# 2. Jobs table exists
psql "$SUPABASE_URL" -c "select count(*) from jobs;"
# → returns 0+ rows

# 3. Zero direct Gemini fetch in AutoPilot files
grep -rn "generativelanguage.googleapis.com" js/17a-create-api.js js/17b-create-references.js js/17c-create-pipeline.js js/17d-create-languages.js js/20-reels-creator.js js/21-kling.js
# → 0 hits

# 3a. Gemini continuation-prompt in 21-kling replaced
grep -n "generativelanguage.googleapis.com" js/21-kling.js
# → 0 hits

# 3b. ElevenLabs direct fetches gone from 17a
grep -n "api.elevenlabs.io" js/17a-create-api.js
# → 0 hits

# 4. Kling JWT + BYOK keys gone from 21-kling
grep -nE "stori_kling_access_key|stori_kling_secret_key|generateKlingJWT" js/21-kling.js
# → 0 hits

# 5. 17e canvas-launch no longer calls Gemini/Kling directly
grep -nE "generativelanguage.googleapis.com|api.kling.com" js/17e-canvas-launch.js
# → 0 hits

# 5a. Lyria BGM round-trip via /v1/jobs/bgm (manual verification)
# → Create Story (17c) + Reel BGM (20) both work

# 6. trackCost call sites intentionally left — non-zero is expected
grep -rn "trackCost" js/17a-create-api.js js/17b-create-references.js js/17c-create-pipeline.js js/20-reels-creator.js
# → non-zero hits (P07 owns deletion)

# 7. fal.ai LoRA calls in 17c intentionally left — P06 carve-out
grep -n "fal.run" js/17c-create-pipeline.js
# → may have hits (expected at P05 exit, P06 territory)

# 8. ADR-02 written
ls migrations/migration-adr-02-long-running-jobs.md
# → file exists

# 9. Canary drill done
grep -l "canary" infra/cloud-run/runbooks/canary.md
# → file exists
```

## Constraints
- ADR-02 (long-running jobs): authored this phase — jobs table, in-process worker, idempotency keys, 3s client poll, no auto-retry, 30 min timeout
- ADR-04 (feature flags): drafted here, finalized in P07. Supabase config table recommended
- ADR-06 (mode-lock): `/v1/projects/:id/launch` atomically sets `mode_locked_at`
- ADR-07 (file storage): outputs to R2; `projects/{id}/scenes/{idx}/images/{img_id}.png`
- Do NOT touch `js/17f-tier2-lipsync-fal.js` — P06 territory
- Do NOT touch `js/28a-image-gen-shim.js` — P06 territory
- Do NOT touch secondary-pipeline files (`24`, `26`, `26b`, `28`, `30`, `31`, `32`, `33`, `34`) — P06 territory
- Do NOT delete `callGeminiAPI` definition, key-getters (`getCreateGeminiKey`, `getPPApiKey`, `getReelApiKey`, `getFreeKey`, `getPaidKey`, `getReelFreeKey`, `getReelPaidKey`), or `trackCost` — P07 owns
- fal.ai LoRA calls in `js/17c:2648-2750` (`generateLoraImage()`) deferred to P06 — do NOT replace
- Vercel 60s cap: long jobs on Cloud Run; short sync calls can use Vercel Functions
- Cloud Run worker: in-process `setInterval` (evolve to GCP Tasks if needed)
- Kling polling: allow up to 10 min/clip, 30 min hard cap per job type
- Feature flag `autopilot_animated_mode`: Illustrated ships first, Animated behind flag

## Dependencies
- Phase 04 must exit first (Module Split — `17e` and `17f` must exist)
- Phase 03 (transitively via P04) for project/instance schema, R2 presign, mode-lock

## Key files to read before starting
- `/Users/praveen/Desktop/stori/migrations/migration-phase-05-autopilot-pipeline-extraction.md` — full phase spec
- `/Users/praveen/Desktop/stori/js/17a-create-api.js` — `callGeminiAPI` definition, key-getters, ElevenLabs call sites
- `/Users/praveen/Desktop/stori/js/17b-create-references.js` — reference generation
- `/Users/praveen/Desktop/stori/js/17c-create-pipeline.js` — AutoPilot core (post-P04 ~5,250 lines); Lyria at ~4238; fal.ai carve-out at ~2648-2750
- `/Users/praveen/Desktop/stori/js/17d-create-languages.js` — language generation
- `/Users/praveen/Desktop/stori/js/17e-canvas-launch.js` — canvas-launch UI (P04-created)
- `/Users/praveen/Desktop/stori/js/20-reels-creator.js` — reel creation
- `/Users/praveen/Desktop/stori/js/21-kling.js` — `generateKlingJWT` at `:12`, `localStorage` at `:13–14`, call sites at `:37`/`:70`, Gemini continuation at `:356`
- `/Users/praveen/Desktop/stori/js/00-api-client.js` — `callApi()` wrapper from P02
