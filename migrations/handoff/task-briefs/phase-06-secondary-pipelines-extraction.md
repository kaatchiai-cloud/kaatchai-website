# Phase 06 — Secondary Pipelines Extraction: Agent Task Brief

## Scope
- Migrate 7 feature pipelines (~14,310 lines) to `/v1/*`: PhotoPilot, Brainstorm, Canvas (validate + normalize + face-swap), Lipsync, Audio, Input-Parser, LoRA Studio
- Replace every direct `fetch()` to `generativelanguage.googleapis.com`, `api.elevenlabs.io`, `api.openai.com`, `api.anthropic.com`, `api.replicate.com`, `fal.run`, `queue.fal.run`, and `r.jina.ai` in secondary-pipeline files
- Replace deferred fal.ai LoRA inference in `js/17c-create-pipeline.js:2648-2750` (P05 carve-out)
- Replace `callGeminiAPI` call sites in secondary files (24, 26, 26b, 31, 32, 34) — do NOT delete the definition
- MediaPipe-Node port for server-side lipsync (gated by spike: §B.2.0)
- Mode-lock audit across all 7 pipelines' mutation endpoints
- Files that stay client-side (no extraction): `js/35-video-effects.js`, `js/25-photopilot-fx.js`, `js/36-object-detection.js`, `js/29-canvas-render.js`

## Files to modify
| File | Action | Verified line range | What changes |
|---|---|---|---|
| `js/24-photopilot.js` | MODIFY | 2,740 lines | Replace `callGeminiAPI` (6 hits) + direct Gemini fetches with `callApi('/v1/jobs/photopilot')`. |
| `js/25-photopilot-fx.js` | MODIFY | 707 lines | **No extraction — stays client-side.** Pure FX definitions, no API calls. |
| `js/26-brainstorm.js` | MODIFY | 2,228 lines | Replace `callGeminiAPI` (6 hits) + Jina `r.jina.ai` fetch at `:637` with `callApi('/v1/brainstorm/chat')`, `/classify`, `/extract-url`. |
| `js/26b-llm-router.js` | MODIFY | 165 lines | Replace direct `api.openai.com` (`:60-64`) + `api.anthropic.com` (`:94-103`) fetches with `callApi('/v1/brainstorm/chat', { provider })`. |
| `js/27-canvas-state.js` | MODIFY | 616 lines | Add server-side `validateGates` call; keep local as fast-path UX. Port `validateGates` (`:417-532`) and `normalizeAll` (`:235-238`) to server. |
| `js/28-canvas-consistency.js` | MODIFY | 404 lines | Replace `_replicateFaceSwap` (`:169-206`) + `applyFaceSwapToSceneImage` (`:211-298`) with `callApi('/v1/canvas/face-swap')`. |
| `js/28a-image-gen-shim.js` | MODIFY | ~35 lines (P04-created) | Rewire `imageGenWithGemini` to `callApi('/v1/...')`. |
| `js/30-lipsync.js` | MODIFY | 352 lines | Replace client-side MediaPipe calls with `callApi('/v1/jobs/lipsync', { tier: 'mediapipe' })`. |
| `js/17f-tier2-lipsync-fal.js` | MODIFY | ~180 lines (P04-created) | Replace fal.ai direct calls with `callApi('/v1/jobs/lipsync', { tier: 'fal' })`. |
| `js/31-input-parser.js` | MODIFY | 809 lines | Replace `callGeminiAPI` (2 hits) + direct fetches with `callApi('/v1/parse-input')`. |
| `js/32-audio-input.js` | MODIFY | 1,229 lines | Replace direct ElevenLabs + Gemini fetches with `callApi('/v1/audio/upload')`, `/transcribe`. Coupled to `33-audio-rehearsal.js` (`window.persistPerSceneAudio` at `:1127-1128`). |
| `js/33-audio-rehearsal.js` | MODIFY | 1,169 lines | Replace direct ElevenLabs TTS fetches with `callApi('/v1/audio/tts')`, `/tts-with-timestamps`, `/v1/jobs/voice-rehearsal`. |
| `js/34-lora-library.js` | MODIFY | 4,413 lines | Replace `_falSubmit`/`_falPollStatus`/`_falFetchResult` (`:371-403`), `_falRunSync` (`:3164`), fal.ai direct calls (`:310,501`), ElevenLabs voice clone (`:2668`), Gemini appearance extraction (`:3589-3593`), IDB + localStorage reads with `callApi`. |
| `js/17c-create-pipeline.js` | MODIFY | ~5,250 lines (post-P04) | Replace deferred `generateLoraImage()` fal.ai calls at `:2648-2750` and `:2666` with `callApi('/v1/lora/inference')`. |
| `api/brainstorm/chat.js` | CREATE | — | Vercel Function: multi-turn chat, provider routing |
| `api/brainstorm/classify.js` | CREATE | — | Vercel Function: AutoPilot vs Copilot classification |
| `api/brainstorm/extract-url.js` | CREATE | — | Vercel Function: proxies `r.jina.ai` (keyless) |
| `api/parse-input.js` | CREATE | — | Vercel Function: input parsing |
| `api/lora/inference.js` | CREATE | — | Vercel Function: sync fal.ai LoRA inference proxy |
| `api/lora/appearance-extract.js` | CREATE | — | Vercel Function: sync Gemini Vision proxy |
| `infra/cloud-run/jobs/photopilot.js` | CREATE | — | Long job: Gemini segmentation + Ken Burns |
| `infra/cloud-run/jobs/lipsync.js` | CREATE | — | Long job: MediaPipe-Node + FFmpeg composite |
| `infra/cloud-run/jobs/voice-rehearsal.js` | CREATE | — | Long job: ElevenLabs TTS per voice/line |
| `infra/cloud-run/jobs/transcribe.js` | CREATE | — | Long job: Gemini transcription |
| `infra/cloud-run/jobs/lora-training.js` | CREATE | — | Long job: fal.ai queue proxy for V1+V2 training |
| `infra/cloud-run/jobs/lora-voice-clone.js` | CREATE | — | Long job: ElevenLabs IVC proxy |
| `infra/cloud-run/canvas/validate.js` | CREATE | — | Server-side `validateGates` |
| `infra/cloud-run/canvas/normalize.js` | CREATE | — | Server-side `normalizeAll` |
| `infra/cloud-run/canvas/face-swap.js` | CREATE | — | Async: Replicate `codeplugtech/face-swap` proxy |

## New endpoints
| Method | Path | Replaces | Sync/Async |
|---|---|---|---|
| POST | `/v1/jobs/photopilot` | Client Gemini segmentation in `24-photopilot.js` | Async |
| POST | `/v1/brainstorm/chat` | Direct Gemini/OpenAI/Anthropic in `26-brainstorm.js` + `26b-llm-router.js` | Sync |
| POST | `/v1/brainstorm/classify` | Client-side classifier | Sync |
| POST | `/v1/brainstorm/extract-url` | Direct `r.jina.ai` in `26-brainstorm.js:637` | Sync |
| POST | `/v1/canvas/face-swap` | Direct `api.replicate.com` in `28-canvas-consistency.js:169-298` | Async |
| POST | `/v1/projects/:id/canvas/validate` | Client `validateGates` in `27-canvas-state.js:417-532` | Sync |
| POST | `/v1/projects/:id/canvas/normalize` | Client `normalizeAll` in `27-canvas-state.js:235-238` | Sync |
| POST | `/v1/jobs/lipsync` | Client MediaPipe (`30-lipsync.js`) + fal.ai (`17f-tier2-lipsync-fal.js`) | Async |
| POST | `/v1/audio/upload` | — (R2 presign, same pattern as P03 image upload) | Sync |
| POST | `/v1/audio/transcribe` | Direct `api.elevenlabs.io/v1/speech-to-text` | Async |
| GET | `/v1/audio/voices` | Direct `api.elevenlabs.io/v1/voices` | Sync |
| POST | `/v1/audio/tts` | Direct `api.elevenlabs.io/v1/text-to-speech/{voice_id}` | Sync |
| POST | `/v1/audio/tts-with-timestamps` | Direct `api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps` | Sync |
| POST | `/v1/jobs/voice-rehearsal` | Client-side rehearsal orchestration in `33-audio-rehearsal.js` | Async |
| POST | `/v1/parse-input` | Client `callGeminiAPI` in `31-input-parser.js` | Sync |
| POST | `/v1/jobs/lora-training` | Direct `fal.run` queue in `34-lora-library.js:371-403` | Async |
| POST | `/v1/lora/inference` | Direct `fal.run` sync in `34-lora-library.js:3164,310,501` + `17c:2648-2750,2666` | Sync |
| POST | `/v1/lora/voice-clone` | Direct `api.elevenlabs.io/v1/voices/add` in `34-lora-library.js:2668` | Async |
| POST | `/v1/lora/appearance-extract` | Direct Gemini Vision in `34-lora-library.js:3589-3593` | Sync |

## Instance Checkpoints

### CP-06-1: Brainstorm + Canvas + Input-Parser (Wk 1–3)
No-long-job pipelines migrated: `26`, `26b`, `27`, `28`, `28a`, `31` all call `/v1/*`.
```
grep -rn "generativelanguage.googleapis.com" js/26-brainstorm.js js/26b-llm-router.js js/27-canvas-state.js js/28-canvas-consistency.js js/31-input-parser.js
# → 0 hits
grep -rnE "api\.openai\.com|api\.anthropic\.com" js/26b-llm-router.js
# → 0 hits
grep -rn "r.jina.ai" js/26-brainstorm.js
# → 0 hits
grep -rnE "api\.replicate\.com" js/28-canvas-consistency.js
# → 0 hits
```
Smoke: Brainstorm chat + URL extract; Canvas validate + face swap; Input parser parse.
HALT: if Brainstorm returns empty responses → check provider routing in `/v1/brainstorm/chat`.

### CP-06-2: PhotoPilot + Lipsync + Audio (Wk 3–6)
Long-job pipelines migrated; MediaPipe-Node on Cloud Run.
```
grep -rn "generativelanguage.googleapis.com" js/24-photopilot.js
# → 0 hits
grep -rn "api.elevenlabs.io" js/32-audio-input.js js/33-audio-rehearsal.js
# → 0 hits
```
Smoke: PhotoPilot full run; Lipsync 5-sec clip ≤ 60s; Audio upload + transcribe + TTS.
HALT: if MediaPipe-Node fails to install on Cloud Run → check spike results; fallback to client-side landmark detection.

### CP-06-3: LoRA Studio pipeline (Wk 6–9)
`34-lora-library.js` all 13 direct fetches replaced; deferred `17c:2648-2750` fal.ai calls replaced; 4 new endpoints live.
```
grep -rnE "fal\.run|queue\.fal\.run" js/34-lora-library.js js/17c-create-pipeline.js
# → 0 hits
grep -rn "api.elevenlabs.io" js/34-lora-library.js
# → 0 hits
grep -rn "generativelanguage.googleapis.com" js/34-lora-library.js
# → 0 hits
```
Smoke: LoRA training submit → poll → done; LoRA inference generate image; voice clone; appearance extract.
HALT: if LoRA training never reaches `ready` status → check fal.ai API key + training params.

### CP-06-4: Exit gate + mode-lock audit (Wk 9–13)
All exit criteria pass; mode-lock enforced across all 7 pipelines' mutation endpoints.
```
# Mode-lock check on secondary pipeline endpoints (example)
curl -sf -H "Authorization: Bearer $JWT" -X POST https://$CLOUDRUN_URL/v1/jobs/lipsync -d '{"project_id":"locked-project"}' | jq .statusCode
# → 409 if project mode locked
```
Smoke: run ALL 7 pipelines quickly — brainstorm, photopilot, canvas, lipsync, audio, input-parser, lora.
HALT: if any mutation endpoint allows changes on a locked project → missing mode-lock check.

## Exit criteria
```
# 1. All endpoints live (integration suite)
# → all listed /v1/* return 200/202 with JWT

# 2. Server-side validateGates matches client for 20+ fixtures
# → snapshot tests pass

# 3. validateGates blocks Launch on blockers
# → /launch returns 409 with launchBlockers

# 4. Zero direct Gemini fetch in secondary files
grep -rn "generativelanguage.googleapis.com" js/24-photopilot.js js/26-brainstorm.js js/26b-llm-router.js js/27-canvas-state.js js/28-canvas-consistency.js js/30-lipsync.js js/31-input-parser.js js/32-audio-input.js js/33-audio-rehearsal.js js/34-lora-library.js
# → 0 hits

# 5a. Zero ElevenLabs direct fetches
grep -rn "api.elevenlabs.io" js/ index.html
# → 0 hits

# 5b. Zero OpenAI/Anthropic direct fetches
grep -rnE "api\.openai\.com|api\.anthropic\.com" js/ index.html
# → 0 hits

# 5d. Zero Replicate direct fetches
grep -rnE "api\.replicate\.com" js/ index.html
# → 0 hits

# 5e. Zero fal.ai direct calls in LoRA + 17c
grep -rnE "fal\.run|queue\.fal\.run" js/34-lora-library.js js/17c-create-pipeline.js
# → 0 hits

# 5f. Zero Jina Reader direct calls
grep -rn "r.jina.ai" js/
# → 0 hits

# 5c. trackCost intentionally left — P07 owns
grep -rn "trackCost" js/24-photopilot.js js/26-brainstorm.js js/26b-llm-router.js js/32-audio-input.js js/33-audio-rehearsal.js js/34-lora-library.js
# → non-zero hits (expected at P06 exit)

# 6. E2E smoke: 7 pipelines pass
# → Brainstorm, PhotoPilot, Canvas, Lipsync, Audio, Input-parser, LoRA Studio

# 7. MediaPipe-Node on Cloud Run; lipsync job end-to-end
# → 5-second clip + 1 line of dialogue round-trips in ≤ 60s
```

## Constraints
- ADR-02 (long jobs): reuse jobs table + worker loop from P05 — zero redesign
- ADR-03 (API contract): same versioning + error model
- ADR-06 (mode-lock): every mutation endpoint checks `mode_locked_at`; only `video_mode` mutations return 409
- ADR-07 (file storage): R2 for photopilot, audio, voice-rehearsal, lipsync, LoRA outputs
- Do NOT delete `callGeminiAPI` definition in `js/17a-create-api.js` — P07 owns
- Do NOT delete key-getters or `trackCost` — P07 owns
- Do NOT touch AutoPilot files (`17a-d`, `20`, `21`) — already done in P05
- Do NOT touch `js/17e-canvas-launch.js` — editor-side, stays client-side
- Do NOT touch editor files (`01-core.js` through `19-video-timeline.js`)
- `js/29-canvas-render.js` (3,658 lines) stays client-side — NOT extraction surface
- `js/35-video-effects.js`, `js/25-photopilot-fx.js`, `js/36-object-detection.js` stay client-side
- Audio-input + audio-rehearsal are ONE ownership slice (cross-file coupling at `window.persistPerSceneAudio`)
- MediaPipe-Node spike (§B.2.0) must pass before server-side lipsync commitment; fallback: keep landmark detection client-side
- LoRA IDB (`stori_lora_photos`) migrates to R2 + `lora_items` Postgres; P03 must add table schema
- `_loadJSZip()` in `js/34-lora-library.js:3994` becomes dead code — P07 deletes it
- Replicate face-swap model pin: `codeplugtech/face-swap` version `278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34`
- `trackCost` call sites left in place — P07 owns the full 53-call-site sweep
- BYOK key inputs (`stori_fal_api_key`, `stori_replicate_api_key`, etc.) stay — P07 deletes

## Dependencies
- Phase 05 must exit first (long-job infrastructure + AutoPilot cutover complete)

## Key files to read before starting
- `/Users/praveen/Desktop/stori/migrations/migration-phase-06-secondary-pipelines-extraction.md` — full phase spec
- `/Users/praveen/Desktop/stori/js/24-photopilot.js` — PhotoPilot (2,740 lines)
- `/Users/praveen/Desktop/stori/js/25-photopilot-fx.js` — PhotoPilot FX (707 lines, stays client-side)
- `/Users/praveen/Desktop/stori/js/26-brainstorm.js` — Brainstorm (2,228 lines); Jina at `:637`
- `/Users/praveen/Desktop/stori/js/26b-llm-router.js` — LLM router (165 lines); OpenAI `:60-64`, Anthropic `:94-103`
- `/Users/praveen/Desktop/stori/js/27-canvas-state.js` — Canvas state (616 lines); `validateGates` `:417-532`, `normalizeAll` `:235-238`
- `/Users/praveen/Desktop/stori/js/28-canvas-consistency.js` — Canvas consistency (404 lines); face-swap `:169-298`
- `/Users/praveen/Desktop/stori/js/28a-image-gen-shim.js` — Gemini shim (P04-created)
- `/Users/praveen/Desktop/stori/js/30-lipsync.js` — Lipsync (352 lines)
- `/Users/praveen/Desktop/stori/js/17f-tier2-lipsync-fal.js` — Tier-2 fal.ai lipsync (P04-created, ~180 lines)
- `/Users/praveen/Desktop/stori/js/31-input-parser.js` — Input parser (809 lines)
- `/Users/praveen/Desktop/stori/js/32-audio-input.js` — Audio input (1,229 lines); coupling at `:1127-1128`
- `/Users/praveen/Desktop/stori/js/33-audio-rehearsal.js` — Audio rehearsal (1,169 lines); `persistPerSceneAudio` at `:107-129`
- `/Users/praveen/Desktop/stori/js/34-lora-library.js` — LoRA Studio (4,413 lines); fal.ai `:371-403,3164,310,501`; ElevenLabs `:2668`; Gemini `:3589-3593`; `_loadJSZip` at `:3994`
- `/Users/praveen/Desktop/stori/js/35-video-effects.js` — Video effects (1,085 lines, stays client-side)
- `/Users/praveen/Desktop/stori/js/36-object-detection.js` — Object detection (213 lines, stays client-side)
- `/Users/praveen/Desktop/stori/js/29-canvas-render.js` — Canvas render (3,658 lines, stays client-side)
- `/Users/praveen/Desktop/stori/js/17c-create-pipeline.js` — deferred LoRA inference at `:2648-2750`, `:2666`
