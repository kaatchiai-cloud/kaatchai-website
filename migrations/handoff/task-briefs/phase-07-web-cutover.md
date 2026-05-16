# Phase 07 — Web Cutover: Agent Task Brief

## Scope
- Delete all 7 BYOK provider key surfaces + 1 keyless (Jina Reader) from `js/` and `index.html`
- Delete full key-getter + `callGeminiAPI` + `trackCost` suite from `js/17a-create-api.js` (53 call sites across 9 files)
- Delete Replicate face-swap suite (`_getReplicateKey`, `_replicateFaceSwap`, `applyFaceSwapToSceneImage`) from `js/28-canvas-consistency.js`
- Delete fal.ai helper functions (`_falRunSync`, `_falSubmit`, `_falPollStatus`, `_falFetchResult`) from `js/34-lora-library.js`
- Delete `_loadJSZip()` CDN loader from `js/34-lora-library.js:3994`
- Delete `_pcExtract()` (Jina Reader) from `js/26-brainstorm.js`
- Remove dollar-cost UI: `bs-cost-tag`, `_updateMeta`, `_getProviderPricing`, model price tags, cost displays
- Remove BYOK `<input>` elements for all 7 providers from `index.html`
- Flip production feature flag `v1_backend = primary`
- Set up Sentry error grouping + error budget
- Execute rollback drill (< 10 min revert)
- Finalize ADR-04, write ADR-08

## Files to modify
| File | Action | Verified line range | What changes |
|---|---|---|---|
| `js/17a-create-api.js` | MODIFY | ~1,981 lines | Delete `callGeminiAPI` definition, `getCreateGeminiKey` (`:288`), `getPPApiKey`, `getReelApiKey`, `getFreeKey` (`:291`), `getPaidKey` (`:292`), `getReelFreeKey`, `getReelPaidKey`, `trackCost` definition + ~53 call sites |
| `js/17b-create-references.js` | MODIFY | ~5,126 lines | Delete `trackCost` call site(s) |
| `js/17c-create-pipeline.js` | MODIFY | ~5,250 lines | Delete `trackCost` call sites (~13); delete `generateLoraImage()` fal.ai remnants if any |
| `js/17d-create-languages.js` | MODIFY | ~1,312 lines | Delete `trackCost` call sites |
| `js/20-reels-creator.js` | MODIFY | ~5,847 lines | Delete `trackCost` call sites (~21) |
| `js/24-photopilot.js` | MODIFY | ~2,740 lines | Delete `trackCost` call sites (5) |
| `js/21-kling.js` | MODIFY | — | Confirm `generateKlingJWT` + `stori_kling_*` already gone (P05); confirm Gemini `:356` replaced |
| `js/26-brainstorm.js` | MODIFY | ~2,228 lines | Delete `_pcExtract()` (`:637` Jina); delete `_updateMeta()` cost logic (`:1435-1450`); delete `_getProviderPricing()` |
| `js/26b-llm-router.js` | MODIFY | ~165 lines | Delete `trackCost` call site; confirm OpenAI/Anthropic BYOK gone |
| `js/28-canvas-consistency.js` | MODIFY | ~404 lines | Delete `_getReplicateKey` (`:146`), `_replicateFaceSwap` (`:170,188`), `applyFaceSwapToSceneImage` — replaced by P06 `/v1/canvas/face-swap` |
| `js/32-audio-input.js` | MODIFY | ~1,229 lines | Delete `trackCost` call site(s) |
| `js/33-audio-rehearsal.js` | MODIFY | ~1,169 lines | Delete `trackCost` call site |
| `js/34-lora-library.js` | MODIFY | ~4,413 lines | Delete `_falRunSync` (`:3164`), `_falSubmit`/`_falPollStatus`/`_falFetchResult` (`:371-403`), `_loadJSZip()` (`:3994`), `trackCost` call sites, BYOK key reads |
| `js/15-project.js` | MODIFY | — | Delete remaining BYOK `localStorage` reads |
| `js/01-core.js` | MODIFY | — | Delete `trackCost` call site if present |
| `index.html` | MODIFY | — | Remove BYOK `<input>` elements for 7 providers (`:2184-2193, 2954-2963` etc); remove `bs-cost-tag` (`:4248`); remove model price tags |
| `infra/supabase/migrations/0004_feature_flags.sql` | CREATE | — | `feature_flags` table (id PK, name unique, value jsonb, env text, updated_at) |
| `infra/sentry/error-budget.md` | CREATE | — | Error budget: < 0.5% 5xx on `/v1/*` over 7-day rolling window |
| `infra/cloud-run/runbooks/rollback.md` | CREATE | — | Rollback drill documentation |
| `infra/cloud-run/routes/flags.js` | CREATE | — | `GET /v1/flags` endpoint |
| ADR-04 | FINALIZE | — | Trunk-based dev + canary + feature-flag tooling |
| ADR-08 | CREATE | — | Sentry SDK, error grouping, log aggregation |

## New endpoints
| Method | Path | Replaces | Sync/Async |
|---|---|---|---|
| GET | `/v1/flags` | — | Sync (feature flags read at boot) |

## Instance Checkpoints

### CP-07-1: BYOK deletion sweep (Wk 1–2)
All 7 provider key prefixes + 8 provider URLs gone; `callGeminiAPI` + key-getters + `trackCost` definitions deleted; 53 call sites swept.
```
grep -rnE "stori_key_paid|stori_key_free|stori_kling_access_key|stori_kling_secret_key|stori_elevenlabs_key|stori_openai_key|stori_anthropic_key|stori_fal_api_key|stori_replicate_api_key" js/ index.html
# → 0 hits
grep -rnE "getCreateGeminiKey|getPPApiKey|getReelApiKey|getFreeKey|getPaidKey|getReelFreeKey|getReelPaidKey|callGeminiAPI|trackCost|_getReplicateKey|_replicateFaceSwap|applyFaceSwapToSceneImage|_loadJSZip|_falRunSync|_falSubmit|_falPollStatus|_falFetchResult|_pcExtract" js/ index.html
# → 0 hits
```
Smoke: app loads → no `ReferenceError` in console; all features work (AutoPilot, Brainstorm, PhotoPilot, Canvas, Lipsync, Audio, LoRA); no API key input fields in settings UI.
HALT: if any `ReferenceError` on load → missed a call site; grep for the function name that errored.

### CP-07-2: Cost UI + feature flags + Sentry (Wk 2–3)
`bs-cost-tag` + cost displays gone; feature flags wired; Sentry error grouping; error budget defined.
```
grep -rnE "bs-cost-tag|_updateMeta|_getProviderPricing|createDollarCost|estimateCost|costInDollars" js/ index.html
# → 0 hits
curl -sf https://$CLOUDRUN_URL/v1/flags | jq .
# → returns flag config
```
Smoke: verify no cost displays anywhere in UI; verify feature flag read at boot.
HALT: if `bs-cost-tag` grep still hits → deletion incomplete; re-sweep.

### CP-07-3: Rollback drill + ADRs (Wk 3–4)
Rollback < 10 min; ADR-04 + ADR-08 finalized.
```
ls infra/cloud-run/runbooks/rollback.md
# → file exists; drill log confirms < 10 min
```
Smoke: deploy a change → trigger rollback via Vercel + Cloud Run revision → verify < 10 min.
HALT: if rollback > 10 min → investigate bottleneck (Vercel deploy time? Cloud Run revision promotion?).

## Exit criteria
```
# 1. Zero browser-stored provider secrets
grep -rnE "stori_key_paid|stori_key_free|stori_kling_access_key|stori_kling_secret_key|stori_elevenlabs_key|stori_openai_key|stori_anthropic_key|stori_fal_api_key|stori_replicate_api_key" js/ index.html
# → 0 hits

# 2. Zero direct provider fetches
grep -rnE "generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|api\.elevenlabs\.io|fal\.run|queue\.fal\.run|api\.replicate\.com|r\.jina\.ai" js/ index.html
# → 0 hits

# 3. Zero legacy function definitions
grep -rnE "getCreateGeminiKey|getPPApiKey|getReelApiKey|getFreeKey|getPaidKey|getReelFreeKey|getReelPaidKey|callGeminiAPI|trackCost|_getReplicateKey|_replicateFaceSwap|applyFaceSwapToSceneImage|_loadJSZip|_falRunSync|_falSubmit|_falPollStatus|_falFetchResult|_pcExtract" js/ index.html
# → 0 hits

# 4. Dollar-cost UI gone
grep -rnE "bs-cost-tag|_updateMeta|_getProviderPricing|createDollarCost|estimateCost|costInDollars" js/ index.html
# → 0 hits

# 5. BYOK inputs removed from index.html (manual DOM inspection)
# → no API key input fields visible in settings panels

# 6. Production flag set
grep -rn "v1_backend" js/
# → flag read at boot; value = primary

# 7. Sentry tags present
# → events grouped by release + feature + error_class

# 8. Error budget file exists
ls infra/sentry/error-budget.md
# → file exists

# 9. Rollback drill done
ls infra/cloud-run/runbooks/rollback.md
# → file exists; drill log confirms < 10 min

# 10. ADRs written
ls migrations/migration-adr-04-trunk-based-canary.md migrations/migration-adr-08-observability.md
# → both exist
```

## Constraints
- **Grep-gate scope: `js/` and root `index.html` ONLY** — NOT `marketing-pipeline/`. Marketing-pipeline has its own BYOK keys (`stori_kling_key`, `stori_fal_key`, `stori_kling_provider`) that do NOT appear in `js/` or `index.html`
- ADR-04 (trunk-based + canary): finalized here. Bake-times default: 5% for 30 min → 50% for 6 h → 100% manual
- ADR-08 (observability): authored here. Sentry web + Cloud Run SDK only; no Flutter SDK
- Do NOT touch `cost-estimator.html`, `cost-estimator-plan.md`, `cost-estimator-mock.html` in repo root — scratch artifacts (override O15)
- Do NOT touch `marketing-pipeline/` — separate deployment, own BYOK flow
- Do NOT touch `migration-original-spec.md`, `app/redesign-plan.md`
- `trackCost` has ~53 call sites across 9 files — sweep ALL or runtime `ReferenceError`
- Feature flag: read once at boot via `GET /v1/flags`; cache in sessionStorage; compile-time fallback for first-load resilience
- Error budget: < 0.5% 5xx on `/v1/*` over rolling 7-day window
- Rollback: Vercel revert button (static web) + Cloud Run revision traffic flip (backend)
- ElevenLabs voice catalog (`js/17a-create-api.js:753`) must already be replaced by P05/P06's `/v1/audio/voices` — confirm at exit

## Dependencies
- Phase 06 must exit first (all 7 secondary pipelines routing through `/v1/*`)

## Key files to read before starting
- `/Users/praveen/Desktop/stori/migrations/migration-phase-07-web-cutover.md` — full phase spec
- `/Users/praveen/Desktop/stori/js/17a-create-api.js` — key-getters, `callGeminiAPI`, `trackCost` definition
- `/Users/praveen/Desktop/stori/js/21-kling.js` — confirm P05 already deleted Kling JWT + keys
- `/Users/praveen/Desktop/stori/js/26-brainstorm.js` — `_pcExtract`, `_updateMeta`, `_getProviderPricing`
- `/Users/praveen/Desktop/stori/js/28-canvas-consistency.js` — face-swap functions to delete
- `/Users/praveen/Desktop/stori/js/34-lora-library.js` — fal.ai helpers, `_loadJSZip`
- `/Users/praveen/Desktop/stori/js/20-reels-creator.js` — `trackCost` call sites (~21)
- `/Users/praveen/Desktop/stori/js/24-photopilot.js` — `trackCost` call sites (5)
- `/Users/praveen/Desktop/stori/js/15-project.js` — remaining BYOK localStorage reads
- `/Users/praveen/Desktop/stori/index.html` — BYOK input elements, `bs-cost-tag` at `:4248`, model price tags
