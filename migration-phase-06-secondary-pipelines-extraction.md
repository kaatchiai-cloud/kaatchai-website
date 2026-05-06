# Phase 06 — Secondary Pipelines (PhotoPilot, Brainstorm, Canvas, Lipsync, Audio, Input-Parser)

> **Status:** ready-to-execute after Phase 05 exits. **Audience:** solo founder + 1–2 engineers. **Duration:** L (6–9 working weeks).
> **Goal in one line:** move the remaining six feature pipelines (≈9,849 lines — Canvas count corrected in revision 4: 27-canvas-state 616 + 28-canvas-consistency 224 = 840; `js/29-canvas-render.js` 3,658 stays client-side and is NOT in the extraction surface) to `/v1/*` so the web client never calls Google directly.
> **Source:** `/Users/praveen/Desktop/stori/migration-plan.md` Part 2 row 05; coverage matrix pipeline-extraction inventory rows 2–7; [OVERRIDES] O3, O16.

---

## 1. Scope

### In scope
1. **PhotoPilot pipeline** — `js/24-photopilot.js` (2,740 lines) + `js/25-photopilot-fx.js` (707 lines). Server-side endpoint `/v1/jobs/photopilot` (long job: AI scene segmentation via Gemini moderate; Ken Burns FX fast). Outputs go to R2; project metadata gets photopilot scene tree.
2. **Brainstorm pipeline** — `js/26-brainstorm.js` (1,716 lines) + `js/26b-llm-router.js` (165 lines). Server-side endpoints:
   - `/v1/brainstorm/chat` (no long job; multi-turn chat — short calls < 30s, runs on **Vercel Functions** since they're cheap and fast for short calls per override O3)
   - `/v1/brainstorm/classify` (no long job; classifies a chat session into AutoPilot vs Copilot)
3. **Canvas state validation server-side** — port `validateGates()` from `js/27-canvas-state.js:417-532` to `infra/cloud-run/canvas/validate.js` and expose as:
   - `POST /v1/projects/:id/canvas/validate` → returns `{ ok, sectionWarnings, launchEnabled, launchBlockers, bgmEnabled, bgmBlockers, audioSubEnabled, audioSubBlockers, renderEnabled, renderBlockers }`
   - `POST /v1/projects/:id/canvas/normalize` → applies the active-flag normalization (mirror of `normalizeSceneFlags`) and returns the updated project.
   The client can still run `validateGates()` locally for instant UX feedback, but the **server-side check is the gate** that blocks Launch (i.e., `/v1/projects/:id/launch` from Phase 05 calls `validate` internally and rejects on blockers).
4. **Mode-lock invariant enforced server-side everywhere** — every `/v1/*` endpoint that mutates project state checks `mode_locked_at` per ADR-06. Phase 03 shipped the column + the 409 on PUT; this phase ensures every other mutation point (PhotoPilot adding scenes, Canvas adding instances, Lipsync adding clips) honours it.
5. **Lipsync pipeline** — `js/30-lipsync.js` (352 lines, server MediaPipe path) **+** `js/17f-tier2-lipsync-fal.js` (~180 lines, Tier-2 fal.ai path — isolated by P04 module split). MediaPipe runs server-side on Cloud Run (long job — see ADR-02 for deployment shape; MediaPipe-Node binary footprint adds ~80 MB to the Cloud Run image). The single endpoint `/v1/jobs/lipsync` accepts a `tier: 'mediapipe'|'fal'` parameter; the server picks the provider. **`js/17f-tier2-lipsync-fal.js` is replaced (or deleted, per P07's BYOK sweep) once `/v1/jobs/lipsync` accepts both tiers.**
6. **Audio pipelines** — `js/32-audio-input.js` (1,226) + `js/33-audio-rehearsal.js` (1,294). Server-side endpoints:
   - `/v1/audio/upload` (presigns R2 PUT; identical pattern to image upload from Phase 03)
   - **`/v1/audio/transcribe`** (long job; **replaces direct fetch to `api.elevenlabs.io/v1/speech-to-text`** — verified call site in `js/17a-create-api.js`)
   - **`/v1/audio/voices`** (replaces direct fetch to `api.elevenlabs.io/v1/voices`)
   - **`/v1/audio/tts`** (replaces direct fetch to `api.elevenlabs.io/v1/text-to-speech/{voice_id}`)
   - **`/v1/audio/tts-with-timestamps`** (replaces direct fetch to `api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps`)
   - `/v1/jobs/voice-rehearsal` (long job: per-scene rehearsal render orchestrator — calls `/v1/audio/tts` and `/v1/audio/tts-with-timestamps` server-side, per O16 — Gemini-TTS reference superseded)

   **(rev-4) Audio coupling note:** `js/32-audio-input.js:1127–1128` calls `window.persistPerSceneAudio`, defined at `js/33-audio-rehearsal.js:107–129`. Treat **audio-input + audio-rehearsal as ONE ownership slice** in P06 — not two independent threads. The server-side replacement must preserve the cross-file handoff: the rehearsal endpoint receives the per-scene segment list + speakerTurns from the input pipeline.
7. **Input parsing** — `js/31-input-parser.js` (809 lines). Server-side endpoint `/v1/parse-input` (Vercel Functions; short call).
8. **Web cutover** — every direct AI-call site in the six pipelines replaced with `callApi(...)`. Per fresh grep at start of phase, `generativelanguage.googleapis.com` direct calls remain in `js/28-canvas-consistency.js`, `js/17[a-d]-create-*.js` (those should already be 0 after Phase 05 — re-verify), `js/26-brainstorm.js` (likely), `js/30-lipsync.js`, `js/32-audio-input.js`, `js/33-audio-rehearsal.js`. Phase exit: zero direct calls in any of these six pipeline files.

   **(rev-4) `callGeminiAPI()` replacement strategy (P06 own for secondary files):** P05 replaced `callGeminiAPI` invocations in AutoPilot-pipeline files (`17a–17e`, `20`). P06 replaces the remaining call sites in **secondary-pipeline files**: `js/24-photopilot.js` (6 hits), `js/26-brainstorm.js` (6 hits), `js/26b-llm-router.js` (3 hits), `js/31-input-parser.js` (2 hits), `js/32-audio-input.js` (3 hits), and the `js/28-canvas-consistency.js` shim (rewires through `js/28a-image-gen-shim.js` thanks to the P04 split). **P06 does NOT delete the `callGeminiAPI` definition** in `js/17a-create-api.js` — P07 owns the deletion of the definition + key-getters (`getCreateGeminiKey`, `getPPApiKey`, `getReelApiKey`, `getFreeKey`, `getPaidKey`, `getReelFreeKey`, `getReelPaidKey`) + `trackCost`.
9. **End-to-end smoke test** — run each feature once through the API and assert outputs land in R2 with valid keys and the project state reflects the run.

### Explicitly out of scope (defer to later phases)
- **AutoPilot Reel pipeline** → already done in Phase 05.
- **BYOK code deletion sweep + dollar-cost UI removal** → Phase 07.
- **Canvas RENDER pipeline** (`js/29-canvas-render.js`, 3,658 lines) → stays client-side. Per the user's "Editor/UI files explicitly stay client-side" note in inventory Part 2 line 116. Only `27-canvas-state.js` (state) and `28-canvas-consistency.js` (consistency check) move server-side — `29-canvas-render.js` is the canvas DOM/SVG renderer and is editor/UI, not extraction surface.
- **Mobile / Flutter consumer of secondary endpoints** → future mobile cycle.
- **Production launch readiness** → Phase 08.
- **Brainstorm classifier — heuristic vs Gemini choice** → migration-details.md silent; redesign-plan.md L120 lists it as an open question. **In this cycle: server-side Gemini call** (override O16 + the migration goal of "no client-side AI calls"). The mobile cycle can revisit if mobile-on-device classification ever becomes a requirement (deferred per inventory Part 4 row 10).

---

## 2. Goal & exit criteria

| # | Exit criterion | How verified |
|---|----------------|--------------|
| 1 | All listed `/v1/*` endpoints live and JWT-guarded. | Integration suite. |
| 2 | Server-side `validateGates()` returns identical results to the client implementation for a corpus of 20+ canvas-state fixtures. | Snapshot tests. |
| 3 | Server-side `validateGates` blocks Launch when `launchBlockers` is non-empty (the `/launch` endpoint from P05 returns 409 with the blockers list). | Integration test. |
| 4 | Mode-lock 409 fires for any post-launch mutation across all 6 pipelines (PhotoPilot adding scenes, Canvas adding instances, Lipsync adding clips, Audio adding tracks). | 6 integration tests. |
| 5 | Zero direct `generativelanguage.googleapis.com` fetch in `js/24-photopilot.js`, `js/25-photopilot-fx.js`, `js/26-brainstorm.js`, `js/26b-llm-router.js`, `js/27-canvas-state.js`, `js/28-canvas-consistency.js`, `js/30-lipsync.js`, `js/31-input-parser.js`, `js/32-audio-input.js`, `js/33-audio-rehearsal.js`. | `grep -rn` script in CI. |
| 5a | **(rev-4)** `grep -rn "api.elevenlabs.io" js/ index.html` returns **0 hits** — all four ElevenLabs endpoint surfaces (`/v1/speech-to-text`, `/v1/voices`, `/v1/text-to-speech/{id}`, `/v1/text-to-speech/{id}/with-timestamps`) routed through the new `/v1/audio/*` server-side proxy. | `grep`. |
| 6 | E2E smoke runs all 6 features once, asserts R2 outputs + DB state. | E2E suite. |
| 7 | MediaPipe-Node bundle baked into Cloud Run image; lipsync job runs end-to-end. | Manual + cold-start measurement (the larger image will increase cold-start by ~1–3 s). |

---

## 3. Architecture

```
┌──────────────────────────────────────┐
│ Browser                              │
│  js/24-photopilot.js   ──┐           │
│  js/25-photopilot-fx.js  │           │
│  js/26-brainstorm.js     ├─ callApi  │
│  js/27-canvas-state.js   │   (per    │
│  js/28-canvas-consistency.js  Phase 02 wrapper)
│  js/30-lipsync.js        │           │
│  js/31-input-parser.js   │           │
│  js/32-audio-input.js    │           │
│  js/33-audio-rehearsal.js┘           │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│ Vercel Functions (short calls)                        │
│  /v1/brainstorm/chat                                  │
│  /v1/brainstorm/classify                              │
│  /v1/parse-input                                      │
└──────────────────────────────────────────────────────┘
         │
┌──────────────────────────────────────────────────────┐
│ Cloud Run Hono (long jobs + canvas)                   │
│  /v1/jobs/photopilot                                  │
│  /v1/jobs/lipsync                                     │
│  /v1/jobs/voice-rehearsal                             │
│  /v1/audio/upload                                     │
│  /v1/audio/transcribe                                 │
│  /v1/projects/:id/canvas/validate                     │
│  /v1/projects/:id/canvas/normalize                    │
│  (reuses jobs table + worker loop from P05)           │
└──────────────────────────────────────────────────────┘
```

**Why this shape:**
- Vercel Functions handle short calls (Brainstorm chat, classify, input-parse) because the 60s cap is plenty and Vercel cold-start is faster than Cloud Run for tiny calls. This honours override O3.
- Cloud Run hosts the long jobs + canvas (canvas validate is cheap but lives next to the job code so all server-side state logic is in one place).
- MediaPipe on Cloud Run adds ~80 MB to the image, which adds ~1–3 s to cold-start. Acceptable given the wins (consistent results across devices, mobile clients don't need to bundle MediaPipe ~15 MB).

**Lipsync decision (resolved 2026-05-06): server-side via MediaPipe-Node.** Rationale:
- Mobile (Flutter) clients would otherwise need to bundle MediaPipe (~15 MB add to app binary).
- Browser MediaPipe needs WebGPU/WebGL2 — older devices fail silently.
- Different devices produce different landmark accuracy — server-side is consistent.
- FFmpeg already runs server-side for export; frame extraction is free.
- Generated Animated-mode clips (Kling/Veo3) already live on R2; we process them in place without re-upload.

**Pipeline shape on Cloud Run:**
1. Job receives R2 URL of source video clip + phoneme/audio track.
2. FFmpeg extracts frames at ~5 fps for landmark detection.
3. `@mediapipe/tasks-vision` (Node-compatible WASM) runs Face Landmarker per frame → 478 landmark points + blendshapes.
4. Server matches mouth shapes to phoneme sequence → animation curves.
5. FFmpeg composites animated mouth back onto the source clip → upload result MP4 to R2.

The `/v1/jobs/lipsync` endpoint **stays in scope** for this phase. The earlier "spike-to-decide-client-vs-server" open question is closed.

---

## 4. Technology selection

| Concern | Choice | Rationale | Alternatives |
|---------|--------|-----------|--------------|
| Brainstorm chat host | **Vercel Functions** | Short calls; cheaper than warming a Cloud Run instance. Per O3. | Cloud Run: viable; just heavier. |
| Brainstorm classifier | **Server-side Gemini** | Centralizes the AI call; mobile cycle can override later. | Heuristic on client: defer to mobile cycle. |
| TTS provider | **ElevenLabs** | Per override O16. Replaces Gemini-TTS reference. | Gemini-TTS: superseded. |
| Audio transcription | **Gemini** | Per migration-details L80, L132. | Whisper API: viable alternative; defer. |
| MediaPipe deployment | **Cloud Run + MediaPipe-Node** (`@mediapipe/tasks-vision`) | Mobile clients won't bundle MediaPipe (~15 MB save); landmark accuracy stays consistent across devices; FFmpeg + R2 already on the server. Resolved 2026-05-06. | Stay client-side: rejected — would force mobile bundle and accept device-variance. |
| Canvas validate | **Cloud Run** | Lives next to the project repository code; cheap call but consistent location. | Vercel Functions: viable; pick Cloud Run for code locality. |

---

## 5. Work breakdown

Two engineers can split as follows. Order within each track is mostly internal; cross-track coordination happens via the daily standup.

### Track A — Brainstorm + Input-parser + Canvas-validate (engineer 1, ~2.5 weeks)

#### A.1 `/v1/brainstorm/chat` and `/v1/brainstorm/classify` (Vercel Functions)
- [ ] Read `js/26-brainstorm.js` end-to-end. Identify the chat-loop entry point and the classifier entry point.
- [ ] Author `api/brainstorm/chat.js` and `api/brainstorm/classify.js` Vercel Functions. JWT-verified per Phase 02.
- [ ] Replace `fetch('https://generativelanguage.googleapis.com/...')` calls in `js/26-brainstorm.js` and `js/26b-llm-router.js` with `callApi('/v1/brainstorm/...')`.

#### A.2 `/v1/parse-input` (Vercel Function)
- [ ] Read `js/31-input-parser.js`. Identify input-parsing entry point.
- [ ] Author `api/parse-input.js`. Replace direct calls in `js/31-input-parser.js`.

#### A.3 Canvas validate + normalize (Cloud Run)
- [ ] Port `validateGates(scenes, mode, jobState)` from `js/27-canvas-state.js:417-532` to `infra/cloud-run/canvas/validate.js`. Same return shape.
- [ ] Port `normalizeAll(scenes, mode)` from `js/27-canvas-state.js:235-238` (delegating to `normalizeSceneFlags` 183–233) to `infra/cloud-run/canvas/normalize.js`.
- [ ] Add 20 snapshot tests using the same fixtures from any client-side tests (or generate fresh fixtures by running the client function on real projects).
- [ ] Add the two routes; both JWT-guarded; both project-ownership-guarded.
- [ ] Update Phase 05's `/v1/projects/:id/launch` to call `validate` internally and return 409 with `{ launchBlockers }` if non-empty.

### Track B — PhotoPilot + Lipsync + Audio + Voice-rehearsal (engineer 2, ~3 weeks)

#### B.1 `/v1/jobs/photopilot`
- [ ] Read `js/24-photopilot.js` + `js/25-photopilot-fx.js` end-to-end. Map the flow: photo upload → Gemini segmentation → scene generation → Ken Burns FX.
- [ ] Author `infra/cloud-run/jobs/photopilot.js` worker handler. Reuse the jobs table + worker loop from Phase 05.
- [ ] Endpoint: `/v1/jobs/photopilot` enqueues; `GET /v1/jobs/:id` polls.
- [ ] Outputs to R2; project metadata updated with photopilot scene tree.
- [ ] Replace direct Gemini calls in the two source files with `callApi('/v1/jobs/photopilot')`.

#### B.2 `/v1/jobs/lipsync` (server-side via MediaPipe-Node — gated by spike)

**B.2.0 MediaPipe Node-port spike (1–2 days, BLOCKING — runs BEFORE any committal work in §B.2.1+).**
- [ ] Spin up a local Node prototype that imports `@mediapipe/tasks-vision` and runs the `FaceLandmarker` task on a 1-second test clip.
- [ ] **Spike checks (all must pass before §B.2.1 begins):**
  1. **Node API surface vs browser** — does `@mediapipe/tasks-vision` expose the same Face Landmarker pipeline server-side? If a critical method (e.g., async-init, blendshape extraction, GL-context fallback) only exists in the browser variant, the spike fails.
  2. **Landmark quality parity** — landmark coordinates and blendshape weights from the Node port must match the browser output for the same input frame to within ≤ 1% delta. Bigger drift means the visual output won't match what dogfood produced today.
  3. **Bundle size vs the ~80 MB claim** — verify the actual added bytes to the Cloud Run image. The 80 MB figure is the audit's estimate; the spike measures the real number. If it's > 200 MB, re-evaluate the pre-warm + min-instances strategy.
  4. **Cold-start impact** — measure cold-start delta with the MediaPipe layer included. Acceptable if ≤ 3 s; > 5 s triggers the fallback path.
- [ ] **Fallback contract (if any spike check fails):** keep MediaPipe **client-side** in `js/30-lipsync.js` for the actual landmark detection; the `/v1/jobs/lipsync` endpoint receives the already-computed landmark JSON + audio + clip URL from the client, performs only the FFmpeg composite + R2 upload server-side. Mobile clients (future cycle) would still need to bundle MediaPipe in this fallback world — that constraint is documented but does not block this cycle's web-only delivery.
- [ ] Spike artefact: write `devDoc-migration/06-mediapipe-spike.md` with the four measured numbers and the go/no-go decision. Founder review before any code lands.

**B.2.1 onward runs only on a green spike (full server-side path):**
- [ ] Read `js/30-lipsync.js` end-to-end to map current client-side flow (frame extraction, MediaPipe Face Landmarker, mouth-shape → phoneme matching, compositing).
- [ ] Add `@mediapipe/tasks-vision` as a Node dep in the Cloud Run image. Verify image size impact (~80 MB add per the audit; spike confirms the real number) and update cold-start expectations.
- [ ] Author `infra/cloud-run/jobs/lipsync.js` worker handler:
  - Reads R2 URL of source clip + R2 URL of phoneme/audio track from job payload.
  - FFmpeg extracts frames at ~5 fps to a temp dir.
  - Runs Face Landmarker per frame; collects 478 landmark points + blendshapes per frame.
  - Maps mouth-shape sequence to phoneme timeline → animation curves.
  - FFmpeg composites animated mouth back onto source frames; encodes output MP4.
  - Uploads result to R2; updates project state.
- [ ] Endpoint: `/v1/jobs/lipsync` enqueues; `GET /v1/jobs/:id` polls. JWT-guarded + project-ownership-guarded.
- [ ] Replace direct MediaPipe calls in `js/30-lipsync.js` with `callApi('/v1/jobs/lipsync', { clipUrl, audioUrl })`. Web no longer ships MediaPipe.
- [ ] Cold-start mitigation: keep min-instances ≥ 1 on the lipsync revision OR pre-warm via a low-priority canary endpoint.
- [ ] Smoke test: 5-second clip + 1 line of dialogue round-trips end-to-end in ≤ 60 s.

#### B.3 `/v1/audio/upload` + `/v1/audio/transcribe`
- [ ] Author `/v1/audio/upload` — presigns R2 PUT (reuse pattern from Phase 03 `r2-presign`).
- [ ] Author `/v1/audio/transcribe` long job — Gemini transcription; output to project state.
- [ ] Replace direct calls in `js/32-audio-input.js` with `callApi(...)`.

#### B.4 `/v1/jobs/voice-rehearsal`
- [ ] Author worker handler that calls **ElevenLabs** (NOT Gemini-TTS — per O16) for each voice/line in the rehearsal.
- [ ] Output WAV/MP3 to R2.
- [ ] Replace direct calls in `js/33-audio-rehearsal.js` with `callApi(...)`.

### Track C — Mode-lock audit (engineer 1, parallel to A.3, ~1 day)

- [ ] Audit every mutation endpoint added in Phase 03, 04, and this phase. Add `if (project.mode_locked_at && new.video_mode !== old.video_mode) return 409` (or the equivalent for whatever field is being mutated). Phase 03 covered project-PUT; this audit covers PhotoPilot scene-add, Canvas instance-add (ADR-06 says: instance edits OK after lock; mode flip not OK), Lipsync clip-add, Audio track-add.
- [ ] One integration test per endpoint asserting the 409.

### Track D — End-to-end smoke + sign-off (~3 days)

- [ ] Author `tests/e2e/secondary-pipelines.spec.ts`: 6 tests, one per pipeline, each running the feature end-to-end and asserting the R2 + DB outputs.
- [ ] Re-run grep for direct `generativelanguage.googleapis.com` and direct Kling URLs in the 10 pipeline files. Score them at zero before phase exit.
- [ ] Update `infra/README.md` with the secondary endpoints.
- [ ] Open tracking issue "Phase 06 done".

**Estimated total:** ~28 working days; calendar 6–9 weeks because (a) MediaPipe-Node port + cold-start tuning is a new build path, (b) ElevenLabs integration is a new vendor with its own auth/rate-limit, (c) two engineers run in parallel but Track C's mode-lock audit blocks finishing. (Lipsync server-port adds ~3 days vs the earlier client-stays plan.)

---

## 6. Acceptance & test plan

### Smoke checklist
1. Brainstorm chat works end-to-end (no direct Gemini fetch in `js/26-brainstorm.js`).
2. PhotoPilot job runs, outputs to R2, project state updated.
3. Lipsync runs (per the §B.2 decision — client-side or `/v1/jobs/lipsync`).
4. Audio upload + transcribe round-trips.
5. Voice rehearsal generates ElevenLabs TTS per voice.
6. Canvas validate returns same gates as client; mismatches are bugs.
7. Mode-lock 409 across all 6 pipelines on post-launch mutation.
8. All grep targets clean.

### Manual verification (post-impl)
- [ ] **Engineer:** dogfood — produce one project that exercises every pipeline in sequence (Brainstorm input → PhotoPilot → Canvas adjust → AutoPilot launch — already proven in P05 — → audio/voice → lipsync if applicable). Note any regressions.
- [ ] **Founder:** verify ElevenLabs voice quality matches expectation (vs the previous Gemini-TTS output).

---

## 7. Dependencies

### Predecessors
- **Phase 05** for the long-job pattern (jobs table, worker loop, idempotency, polling).
- **Phase 04 (Module Split, transitively via P05)** for: (a) `js/17f-tier2-lipsync-fal.js` already isolated as a deleteable unit (this phase replaces it with `/v1/jobs/lipsync` `tier=fal`); (b) `js/28a-image-gen-shim.js` already isolated as the single Gemini-call shim (this phase wraps it with `callApi('/v1/...')`); (c) `js/17e-canvas-launch.js` exists as the editor-side canvas-launch UI and is **not** touched here (still client-side; canvas validation moves server-side via the new `/v1/projects/:id/canvas/validate` endpoint, but the canvas-panel UI stays in `17e`).

### Successors
- **Phase 07** (Web Cutover) starts the moment all 6 pipelines route through `/v1/*`.

### Files this phase touches
- New: `api/brainstorm/{chat,classify}.js`, `api/parse-input.js`, `infra/cloud-run/jobs/{photopilot,voice-rehearsal,transcribe,lipsync}.js`, `infra/cloud-run/canvas/{validate,normalize}.js`, `infra/cloud-run/routes/{photopilot,audio,lipsync,canvas}.js`.
- Modified: `js/24-photopilot.js`, `js/25-photopilot-fx.js`, `js/26-brainstorm.js`, `js/26b-llm-router.js`, `js/27-canvas-state.js` (only to call server validate; keep local validate as a fast-path), `js/28-canvas-consistency.js`, `js/28a-image-gen-shim.js` (rewire shim to `callApi('/v1/...')` — single edit point thanks to P04), `js/30-lipsync.js` (replace MediaPipe calls with `callApi('/v1/jobs/lipsync', { tier: 'mediapipe' })`), **`js/17f-tier2-lipsync-fal.js`** (replace fal.ai direct calls with `callApi('/v1/jobs/lipsync', { tier: 'fal' })` — P04 isolated this; P07 may delete the file outright once BYOK is gone), `js/31-input-parser.js`, `js/32-audio-input.js`, `js/33-audio-rehearsal.js`.
- Forbidden: AutoPilot files (`js/17[a-d]-*`, `js/20-reels-creator.js`, `js/21-kling.js`) — already done in P05.
- Forbidden: **`js/17e-canvas-launch.js`** — P04-split canvas-launch UI is editor-side and stays client-side. P06 does NOT touch it.
- Forbidden: editor files (`js/01-core.js` through `js/19-video-timeline.js`) — explicitly client-side per inventory Part 2 line 116.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MediaPipe-Node on Cloud Run adds ~80 MB to image; cold-start +1–3 s | M | M | Pre-warm via min-instances ≥ 1 on the lipsync revision OR low-priority canary endpoint. Acceptable trade-off for cross-platform consistency. |
| **(rev-4)** MediaPipe Node port doesn't match browser landmark quality | M | H | §B.2.0 spike (1–2 days) measures parity to ≤ 1% delta. Fallback contract: keep landmark detection client-side; only proxy composite step through `/v1/jobs/lipsync`. Mobile bundle constraint deferred to future mobile cycle. |
| **(rev-4)** Bundle size exceeds 200 MB or cold-start exceeds 5 s | L | M | §B.2.0 spike measures real numbers (audit's 80 MB is an estimate). If thresholds breach, fallback to client-side landmark detection with server-side composite only. |
| ElevenLabs voice quality regression vs Gemini-TTS | M | M | Side-by-side dogfood compare before exit. If regression, halt + re-evaluate (could be ADR change). |
| Server-side `validateGates` and client `validateGates` drift | M | H | Snapshot tests with shared fixtures; CI runs both implementations on the same fixtures and compares. Make the server implementation the canonical one — client copy is allowed-stale-by-design (it's UX feedback only). |
| Brainstorm classifier accuracy regression vs old client heuristic | L | M | A/B compare on 20 sample chats before flipping the flag. |
| PhotoPilot Gemini segmentation quality varies across photo types | M | M | Out of scope to fix; document any regressions and accept (override O13: no customers, can iterate). |
| Mode-lock audit misses a mutation endpoint | L | H | Author a CI lint that grep-asserts every Cloud Run/Vercel route file imports the mode-lock check helper. |
| Canvas `normalize` server endpoint races with client `normalize` | L | M | Server normalize is the canonical state; client runs locally for speed but every save round-trip applies the server result. |

---

## 9. Open questions

1. ~~**Lipsync — client-side or server-side?**~~ **RESOLVED 2026-05-06 (provisional, gated by spike): server-side via MediaPipe-Node on Cloud Run.** Mobile clients won't bundle MediaPipe; landmark accuracy stays consistent across devices; FFmpeg + R2 already on the server. **Rev-4 addition: a 1–2 day MediaPipe Node-port spike runs at the start of Track B.2 (§B.2.0)** to verify Node API surface, landmark quality parity, bundle size, and cold-start impact. **Fallback path** if the spike fails: keep landmark detection client-side; only proxy the output JSON + composite step through `/v1/jobs/lipsync`. See §B.2 for pipeline shape and the spike contract.
2. **Brainstorm classifier on Vercel — does Gemini latency for classification fit in Vercel's 60s cap?** [non-blocking — should fit comfortably (classification is a few hundred tokens), but measure].
3. **ElevenLabs voice library — which voices to provision?** [non-blocking, founder picks during §B.4].
4. **Should the canvas-render module (`js/29-canvas-render.js`, 3,658 lines) be touched at all?** Decision: NO — it's the renderer, lives client-side, no extraction needed. Recorded here for clarity.
5. **PhotoPilot — preserve the existing Ken Burns FX timing logic verbatim or re-implement on server?** [non-blocking — re-implement minimally; client still owns the playback path].

---

## 10. Cross-cutting decisions raised by this phase

| Decision | Phases affected | ADR ref |
|----------|-----------------|---------|
| Long-running job pattern (consumed, not authored, here) | 01, 05, 06, 08 | **ADR-02** (canonical home is Phase 05) |
| API contract — request/response shapes for the secondary endpoints follow the same versioning + error model | 03, 05, 06, 07 | **ADR-03** |
| Mode-lock invariant — every mutation endpoint must check it | 03, 05, 06 | **ADR-06** |
| File storage — R2 keys for photopilot outputs, audio uploads, voice-rehearsal outputs | 01, 03, 05, 06 | **ADR-07** |

(No new cross-cutting ADRs introduced by this phase — the patterns are inherited.)

---

## 11. Links

- Phase index: `/Users/praveen/Desktop/stori/migration-plan.md`
- Predecessor: `/Users/praveen/Desktop/stori/migration-phase-05-autopilot-pipeline-extraction.md`
- Successor: `/Users/praveen/Desktop/stori/migration-phase-07-web-cutover.md`
- Source code: `/Users/praveen/Desktop/stori/js/24-photopilot.js`, `/Users/praveen/Desktop/stori/js/25-photopilot-fx.js`, `/Users/praveen/Desktop/stori/js/26-brainstorm.js`, `/Users/praveen/Desktop/stori/js/26b-llm-router.js`, `/Users/praveen/Desktop/stori/js/27-canvas-state.js`, `/Users/praveen/Desktop/stori/js/28-canvas-consistency.js`, `/Users/praveen/Desktop/stori/js/30-lipsync.js`, `/Users/praveen/Desktop/stori/js/31-input-parser.js`, `/Users/praveen/Desktop/stori/js/32-audio-input.js`, `/Users/praveen/Desktop/stori/js/33-audio-rehearsal.js`
- Source spec: `/Users/praveen/Desktop/stori/migration-details.md` §New Files §Backend L132–155, §Modified Files L185–204; `redesign-plan.md` was deferred as out-of-scope but the schema reference (active flags 🎯 ⭐) is independently captured here from `js/27-canvas-state.js:22-26`.
- ADRs: `migration-adr-02-long-running-jobs.md`, `migration-adr-03-api-contract.md`, `migration-adr-06-mode-lock-invariant.md`, `migration-adr-07-file-storage-strategy.md`

*End of Phase 06 dev doc.*
