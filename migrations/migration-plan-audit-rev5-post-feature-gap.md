# Migration Plan Audit — Post-Feature Gap Analysis

**Document reviewed:** `/Users/praveen/Desktop/stori/migrations/migration-plan.md` (rev 4, 2026-05-06)
**Prior audits:** `migration-plan-audit-rev4-pass2.md`, `migration-plan-v4-audit.md`
**Codebase audited:** `/Users/praveen/Desktop/stori/` (current HEAD)
**Date:** 2026-05-16
**Status:** 3-pass audit — 5 CRITICAL, 5 HIGH, 4 MODERATE, 4 SUBTLE

**Overall assessment:** Three major features were added to the codebase after the migration plan was finalised. The largest — **LoRA Studio** (`js/34-lora-library.js`, 4,413 lines) — is entirely absent from the plan and introduces 2 new AI providers (Replicate, expanded fal.ai), 1 new IndexedDB database, 5 new localStorage keys, deep cross-file integration with 4 existing pipeline files, and a full training/inference pipeline that must be migrated. Two smaller features — **Video Effects** and **Object Detection** — add an IndexedDB database and a new dependency. Additionally, `js/32-audio-input.js` and `js/33-audio-rehearsal.js` now exist (earlier audits said they didn't), validating P03's `audio_inputs`/`audio_rehearsals` tables. Existing files have grown significantly, invalidating line counts and extraction ranges in P04/P05/P06.

---

## CRITICAL (Will Break Implementation)

### C1. `js/34-lora-library.js` (4,413 lines) — Entire feature unaccounted for

The migration plan has **zero references** to LoRA, LoraLibrary, LoraStudio, or `34-lora-library.js`. This is the single largest gap in the plan.

**What it contains:**

| Sub-feature | Lines (approx) | Provider | API pattern |
|---|---|---|---|
| Product LoRA training (V1 legacy) | ~435–542 | fal.ai | submit → poll → done |
| Character LoRA training (V1 legacy) | ~242–340 | fal.ai | submit → poll → done |
| V2 unified training pipeline | ~3989–4180 | fal.ai | submit → poll → done |
| Training image generation (3×3 Gemini grid) | ~3715–3834 | Gemini | direct fetch |
| LoRA inference (Flux + Qwen) | ~3160–3287 | fal.ai | sync fetch |
| Flux 2 refine pass | ~3176–3201 | fal.ai | sync fetch |
| Voice cloning (ElevenLabs IVC) | ~2451–2700 | ElevenLabs | direct fetch |
| Voice library picker | ~2709–2856 | ElevenLabs | catalog read |
| Appearance extraction (Gemini Vision) | ~3556–3617 | Gemini | direct fetch |
| Review modal + image management | ~3836–3970 | — | IDB read/write |
| Studio card grid + tuning panel | ~570–3700 | — | localStorage CRUD |

**Storage surface:**
- **IndexedDB:** `stori_lora_photos` database, `photos` store — stores training photos, preview images, voice samples, reference images
- **localStorage keys:** `stori_lora_products_v1`, `stori_lora_characters_v1`, `stori_lora_items_v2`, `stori_lora_migrated_v2`, `stori_fal_api_key`, `stori_replicate_api_key`, `stori_elevenlabs_key`

**Direct API calls (13 total `fetch()` calls to providers):**
- `fal.run/fal-ai/flux-lora` (inference) × 2
- `queue.fal.run/{endpoint}` (training submit) × 1
- `queue.fal.run/{endpoint}/requests/{id}/status` (poll) × 1
- `queue.fal.run/{endpoint}/requests/{id}` (result) × 1
- `fal.run/{endpoint}` (sync inference helper) × 1
- `api.elevenlabs.io/v1/voices/add` (voice clone) × 1
- `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` (appearance extraction + training image generation) × 2
- Plus ~5 image URL fetch calls (fetching generated result URLs)

**Cross-file integration (will break if LoRA not migrated):**
- `js/01-core.js:456-457` — seeds `window.createJobState.loraAssignments`
- `js/17c-create-pipeline.js:2691-2713` — `_getSceneLoraContext()` reads `window.LoraLibrary.*`
- `js/17c-create-pipeline.js:2648-2750` — `generateLoraImage()` calls fal.ai with LoRA URLs
- `js/17c-create-pipeline.js:4449` — reads `window.LoraLibrary.getFalKey()` for fal.ai key
- `js/17c-create-pipeline.js:1734-1735` — calls `window.LoraLibrary.renderAssetsSection()` and `.updateLaunchImageButton()`
- `js/28-canvas-consistency.js:225-227` — reads `window.LoraLibrary.getCharacterById()` for character consistency
- `js/28-canvas-consistency.js:353-356` — reads `window.LoraLibrary.getFalKey()` for LoRA inference
- `js/17b-create-references.js:2561-2562` — calls `window.LoraLibrary._openVoicePicker()`
- `js/17b-create-references.js:3198` — calls `window.LoraLibrary.getItemById()`

**Impact:** If P05/P06 migrate AutoPilot/Canvas/Brainstorm but leave `34-lora-library.js` unmigrated, the web client will still make direct fal.ai, ElevenLabs, and Gemini API calls, and browser-stored BYOK keys will remain. P07's exit criteria ("grep returns 0 hits for all provider keys/URLs") will fail because LoRA code still holds them. P03's IndexedDB exit criteria will miss `stori_lora_photos`.

**Fix:**
1. Add `js/34-lora-library.js` as a P06 secondary pipeline (LoRA Studio pipeline).
2. Add 3 new P06 endpoints: `/v1/jobs/lora-training` (async), `/v1/lora/inference` (sync), `/v1/lora/voice-clone` (async).
3. Add `/v1/lora/appearance-extract` for Gemini Vision calls.
4. P03 must add `stori_lora_photos` to its IndexedDB migration surface and `lora_items` to its table list.
5. P07 must add `stori_fal_api_key`, `stori_replicate_api_key`, `stori_elevenlabs_key` (expanded), `fal.run`, and `api.replicate.com` to its grep gate.
6. Update P06 line count to include 4,413 from 34-lora-library.js.

### C2. Replicate is a 7th AI provider — not in P07's "six provider" deletion scope

**Plan claims** (Part 2, P07 exit criteria):
> "all six provider key prefixes" and "all six provider URLs"

**Code reality:** Replicate (`api.replicate.com`) is now a provider with:
- Direct browser `fetch('https://api.replicate.com/v1/predictions')` at `js/28-canvas-consistency.js:170`
- Direct browser `fetch(pollUrl)` at `js/28-canvas-consistency.js:188`
- BYOK key: `stori_replicate_api_key` stored in localStorage at `js/28-canvas-consistency.js:146` and `js/34-lora-library.js:1751-1753`
- Key input UI in `js/34-lora-library.js` (Replicate key section)

**Impact:** P07's exit criteria grep will miss `stori_replicate_api_key` and `api.replicate.com`, leaving direct Replicate API calls and BYOK keys in the browser after P07 ships.

**Fix:** Update P07 to reference **seven** providers. Add to P07 grep list:
- Key prefix: `stori_replicate_api_key`
- URL: `api.replicate.com`
- Function references: `_getReplicateKey`, `_replicateFaceSwap`

### C3. `stori_fal_api_key` is a BYOK key not in P07's "six provider key prefixes" list

**Plan claims** (Part 2, P07 exit criteria — rev-4):
> `stori_key_paid`/`stori_key_free`/`stori_kling_*`/`stori_elevenlabs_key`/`stori_openai_key`/`stori_anthropic_key`/`stori_fal*`

The rev-4 plan added `stori_fal*` but:
- `stori_fal_api_key` is used in `js/17c-create-pipeline.js:4057` and `js/34-lora-library.js:15,359-360`
- The `*` wildcard in the grep pattern would match, BUT only if the grep is `stori_fal` (not `stori_fal_key`)
- There are now **many more** `fal.run` URLs than the plan accounts for (LoRA training, LoRA inference, lipsync)

**Impact:** The rev-4 `stori_fal*` glob likely catches the key, but the `fal.run` URL count has exploded from 2 sites (lipsync) to ~13+ sites (lipsync + LoRA training + LoRA inference). The P07 URL grep for `fal.run` must be explicit.

**Fix:** Confirm P07's grep pattern is `stori_fal` (catches `stori_fal_api_key`). Add explicit `fal.run` to the URL grep list. Count and enumerate all `fal.run` call sites at P07 kickoff.

### C4. `stori_lora_photos` IndexedDB database not in P03 migration surface

**Plan claims** (Part 2, P03 exit criteria):
> "every `indexedDB.open(...)` call site replaced"

**Code reality:** `js/34-lora-library.js:122` opens `indexedDB.open('stori_lora_photos', 1)` with a `photos` store. This database stores:
- Training photos: `lora_v2_{itemId}_photo_{i}`
- Training images (generated): `lora_v2_{itemId}_train_{i}`
- Preview images: `lora_v2_{itemId}_preview_{i}`
- Voice samples: `lora_v2_{itemId}_voice_sample`
- Character photos (legacy): `lora_char_{charId}_photo_{i}`, `lora_char_{charId}_preview`

This is binary data (images, audio) that must migrate to R2, with metadata in a `lora_items` Postgres table.

**Impact:** P03's IndexedDB grep verification will miss this database. LoRA photos remain in browser storage while everything else migrates to cloud. LoRA feature breaks for users who expect their trained LoRAs to persist across devices.

**Fix:**
1. Add `stori_lora_photos` to P03's IndexedDB migration surface.
2. Add `lora_items` table to P03's schema (stores: id, userId, name, type, loraUrl, triggerWord, loraStatus, voiceProfile, appearanceBlock, tuningParams, compatibleWith, etc.).
3. Binary blobs (photos, previews, voice samples) → R2 with key references in `lora_items`.
4. P03 exit criteria grep must include `js/34-lora-library.js`.
5. Update P03 table count from 10-11 to 12+ (add `lora_items` + `lora_photos` metadata or R2 key refs).

### C5. `js/36-object-detection.js` opens `fx-model-cache` IndexedDB — not in P03

**Code reality:** `js/36-object-detection.js:63` opens `indexedDB.open('fx-model-cache', 1)` with a `models` store. This caches MobileSAM ONNX model weights (~50-100MB).

**Impact:** This is a local-only ML model cache. It should be a **P03 local-only carve-out** (like `stori_library`), not a cloud migration target. But it must be explicitly noted so P03's exit criteria (`every indexedDB.open call site replaced`) doesn't try to migrate it.

**Fix:** Add `fx-model-cache` to P03's "local-only carve-outs" list alongside `stori_library`. Note that this is an ML model cache that stays client-side.

---

## HIGH (Will Cause Scope Confusion)

### H1. `js/17c-create-pipeline.js` is now 5,581 lines, not 5,139-5,206

| File | Plan claims | Actual (2026-05-16) | Delta |
|---|---|---|---|
| `js/17c-create-pipeline.js` | 5,139–5,206 | **5,581** | +375–442 |
| `js/17b-create-references.js` | ~4,656 | **5,126** | +470 |
| `js/28-canvas-consistency.js` | 224 | **404** | +180 |
| `js/17a-create-api.js` | 1,765–1,830 | **1,981** | +151–216 |
| `js/26-brainstorm.js` | 1,716 | **2,228** | +512 |

**Impact on P04:** The 17e/17f extraction ranges, exit guard math, and `wc -l` baselines are all stale. The LoRA integration code in 17c (lines ~2648-2750, ~2691-2713, ~4449) was added after the plan and is not accounted for in the P04 split.

**Impact on P05:** P05's total surface (19,309 or 18,711 in prior audits) is now higher. The four 17* files total 14,000 lines (not 12,872 or 13,276).

**Impact on P06:** Brainstorm is now 2,228 lines (not 1,716). Canvas consistency is 404 lines (not 224). Canvas pipeline total is 1,020 lines (616 + 404, not 840).

**Fix:** Re-run `wc -l` on all target files at P04/P05/P06 kickoff. Update all line count references.

### H2. P06 secondary pipeline surface is significantly underestimated

**Plan claims** (Part 2, P06): 6 pipelines, 9,142 + ~180 lines total.

**Actual P06 surface with new features:**

| Pipeline | Plan | Actual | Notes |
|---|---|---|---|
| PhotoPilot | 2,740 | 2,745 | +5 |
| Brainstorm | 1,881 (1,716 + 165) | **2,393** (2,228 + 165) | +512 growth |
| Canvas | 840 (616 + 224) | **1,020** (616 + 404) | +180 face swap |
| Lipsync | 532 (352 + ~180) | 532 | unchanged |
| Audio | 2,520 | ~2,398 (1,229 + 1,169) | now verified |
| Input-Parser | 809 | 809 | unchanged |
| **NEW: LoRA Studio** | **0** | **4,413** | **entirely missing** |
| **Total** | **9,322** | **~14,310** | **+4,988 (+54%)** |

**Impact:** P06 duration estimate (6–9 weeks) is based on 9,142 lines. The actual surface is ~14,310 lines — a 54% increase. LoRA Studio alone is 4,413 lines, larger than any existing secondary pipeline except Audio.

**Fix:** Add LoRA Studio to P06's pipeline list. Recalculate P06 duration (likely 8–13 weeks). Consider splitting P06 into P06a (existing 6 pipelines) and P06b (LoRA Studio) if the total exceeds comfort.

### H3. `js/28-canvas-consistency.js` now includes Replicate face swap — not in P06 Canvas scope

**Plan claims** (Part 2, P06): Canvas = `27-canvas-state.js` (616) + `28-canvas-consistency.js` (224).

**Code reality:** `28-canvas-consistency.js` (404 lines) now includes:
- `_getReplicateKey()` at line 145
- `_replicateFaceSwap()` at lines 169-206 — direct `fetch('https://api.replicate.com/v1/predictions')`
- Face swap integration in `regenerateImageInstance()` at lines 213-277
- LoRA character consistency integration at lines 225-227

**Impact:** P06's Canvas pipeline must now migrate:
1. Replicate face swap API calls → `/v1/canvas/face-swap` or similar
2. LoRA character references → `/v1/lora/items/:id` reads
3. The `28a-image-gen-shim.js` extraction in P04 must account for this growth

**Fix:** Add Replicate face swap to P06 Canvas scope. Add `/v1/canvas/face-swap` endpoint. Update Canvas line count to 1,020.

### H4. P03 exit criteria file list is still missing `js/34-lora-library.js` and `js/36-object-detection.js`

Prior audit (M2) flagged missing files. The actual IndexedDB call sites are now:

| File | Line | Database | In plan's list? |
|---|---|---|---|
| `js/15-project.js` | 16 | `stori_projects` | Partially (implied) |
| `js/15-project.js` | 361 | `stori_library` | NO (local carve-out) |
| `js/17b-create-references.js` | 719 | `stori_cast_images_v1` | Partially |
| `js/20-reels-creator.js` | 5808 | `stori_db` | YES |
| `js/20-reels-creator.js` | 5823 | `stori_db` | YES |
| `js/32-audio-input.js` | 22 | `stori_cast_images_v1` | Previously "phantom" — now real |
| `js/33-audio-rehearsal.js` | 37 | `stori_cast_images_v1` | Previously "phantom" — now real |
| `index.html` | ~4766 | `stori_db` | NO (flagged in prior audit) |
| **`js/34-lora-library.js`** | **122** | **`stori_lora_photos`** | **NO — entirely missing** |
| **`js/36-object-detection.js`** | **63** | **`fx-model-cache`** | **NO — entirely missing** |

There are **6 distinct IndexedDB databases** (not 4):
1. `stori_projects` (js/15-project.js)
2. `stori_library` (js/15-project.js)
3. `stori_db` (js/20-reels-creator.js × 2, index.html)
4. `stori_cast_images_v1` (js/17b-create-references.js, js/32-audio-input.js, js/33-audio-rehearsal.js)
5. **`stori_lora_photos`** (js/34-lora-library.js) — NEW
6. **`fx-model-cache`** (js/36-object-detection.js) — NEW (local-only carve-out)

**Fix:** Update P03 exit criteria to list all 6 databases and all 8+ files with `indexedDB.open()` call sites.

### H5. `js/32-audio-input.js` and `js/33-audio-rehearsal.js` now exist — prior audit's C3 is resolved

The rev-4 pass-2 audit (C3) flagged these as "phantom files that don't exist." They now exist:
- `js/32-audio-input.js`: 1,229 lines, opens `stori_cast_images_v1` at line 22
- `js/33-audio-rehearsal.js`: 1,169 lines, opens `stori_cast_images_v1` at line 37

This means:
- P03's `audio_inputs` and `audio_rehearsals` tables are **real**, not phantom
- P03's table count of 10-11 tables is valid (assuming `brand_assets` from `stori_library` is included)
- P03's IndexedDB grep for these files is **no longer vacuous** — it will actually verify something

**Fix:** Remove the "to-be-created" note from the plan. Mark C3 from the prior audit as resolved. Confirm table count.

---

## MODERATE (Correctable Without Scope Risk)

### M1. P07 "six provider" language must become "seven providers"

All references to "six provider key prefixes" and "six provider URLs" in P07 must be updated to seven, adding:
- Key prefix: `stori_replicate_api_key`
- URL: `api.replicate.com`
- Functions: `_getReplicateKey`, `_replicateFaceSwap`

Updated full list for P07 grep:

| # | Provider | Key prefix(es) | URL pattern |
|---|---|---|---|
| 1 | Gemini | `stori_key_paid`, `stori_key_free` | `generativelanguage.googleapis.com` |
| 2 | Kling | `stori_kling_access_key`, `stori_kling_secret_key` | Kling endpoints |
| 3 | ElevenLabs | `stori_elevenlabs_key` | `api.elevenlabs.io` |
| 4 | OpenAI | `stori_openai_key` | `api.openai.com` |
| 5 | Anthropic | `stori_anthropic_key` | `api.anthropic.com` |
| 6 | fal.ai | `stori_fal_api_key` | `fal.run`, `queue.fal.run` |
| 7 | **Replicate** | **`stori_replicate_api_key`** | **`api.replicate.com`** |

### M2. P04 `28-canvas-consistency.js` split must account for face swap code

The P04 module split extracts a shared Gemini-call shim from `28-canvas-consistency.js` into `28a-image-gen-shim.js`. With the file now at 404 lines (was 224), the extraction must account for:
- `_getReplicateKey()` (line 145) — stays in 28 (it's not a Gemini shim)
- `_replicateFaceSwap()` (lines 169-206) — stays in 28 (Replicate, not Gemini)
- LoRA character lookup (lines 225-227) — stays in 28

The 28a shim should still extract `generateStyleFingerprint` and `regenerateImageInstance` (or their Gemini-call portions), but the line ranges have shifted significantly.

### M3. `stori_lora_items_v2` / `stori_lora_products_v1` / `stori_lora_characters_v1` are data localStorage keys that must migrate

These are not BYOK keys — they store user data (LoRA item metadata, product lists, character lists). They need P03 migration:
- `stori_lora_items_v2` → `lora_items` Postgres table (primary data store)
- `stori_lora_products_v1` → migrated into `lora_items` (V1→V2 migration already done in code at line 1782)
- `stori_lora_characters_v1` → migrated into `lora_items` (V1→V2 migration at line 1826)

After migration, these localStorage keys should be empty/deleted. P07 should verify they return 0 meaningful entries.

### M4. P05 AutoPilot scope now includes LoRA image generation in `17c`

`js/17c-create-pipeline.js` lines ~2648-2750 contain `generateLoraImage()` which calls fal.ai directly. P05 claims "zero direct fetches to Google in [the listed files]" but doesn't mention fal.ai fetches in 17c that are part of the AutoPilot image generation flow.

The AutoPilot image generation path now:
1. Generates base images (Gemini) — P05 replaces with `callApi()`
2. Optionally applies LoRA (fal.ai) — **must also be replaced with `callApi()`**
3. Optionally applies Tier-2 lipsync (fal.ai) — P06 replaces with `callApi()`

**Fix:** P05 exit criteria must also verify `fal.run` references in 17c are replaced for the LoRA inference path (not just the lipsync path which is P06). Or explicitly scope P05 as "Gemini fetches only" and defer 17c fal.ai to P06.

---

## SUBTLE (Edge Cases That May Surface During Implementation)

### S1. `stori_elevenlabs_key` usage has expanded from 2 files to 3

Previously: `js/17a-create-api.js` + `js/33-audio-rehearsal.js`
Now also: `js/34-lora-library.js` (voice cloning + voice library picker)

P07's `trackCost` deletion already targets `js/33-audio-rehearsal.js`, but the LoRA voice cloning code in 34 is new surface.

### S2. `window.LoraLibrary.*` is called from 4 files during AutoPilot execution

When P05 replaces AutoPilot's direct Gemini calls with `callApi()`, it must also handle the LoRA integration points in `17c-create-pipeline.js` that call `window.LoraLibrary.*`. These integration points will need to be preserved (the server-side LoRA endpoint must return the same data the client currently reads from localStorage/IDB).

### S3. `js/35-video-effects.js` is pure client-side — no migration needed

1,086 lines of canvas rendering effects. No API calls, no IndexedDB, no localStorage. Stays client-side. Must be listed as "in-scope, no extraction needed" to avoid confusion.

### S4. `js/25-photopilot-fx.js` is a helper module — no migration needed

707 lines of PhotoPilot effect definitions. No API calls, no storage. Stays client-side. Listed in `index.html` loader array alongside `24-photopilot.js`.

---

## ACTIONABLE CHANGES (Prioritized)

| # | What | Severity | Plan Section | Fix |
|---|------|----------|---|---|
| 1 | Add LoRA Studio pipeline to P06 | **CRITICAL** | P06 table + rationale | Add `js/34-lora-library.js` (4,413 lines) as 7th pipeline; add `/v1/jobs/lora-training`, `/v1/lora/inference`, `/v1/lora/voice-clone`, `/v1/lora/appearance-extract` endpoints |
| 2 | Add Replicate as 7th provider to P07 | **CRITICAL** | P07 exit criteria | Add `stori_replicate_api_key`, `api.replicate.com`, `_getReplicateKey`, `_replicateFaceSwap` to grep list |
| 3 | Add `stori_lora_photos` IDB to P03 | **CRITICAL** | P03 exit criteria + table list | Add `lora_items` table + R2 binary storage; add `js/34-lora-library.js` to IndexedDB grep list |
| 4 | Add `fx-model-cache` IDB to P03 local carve-outs | **CRITICAL** | P03 exit criteria | Explicitly exclude `fx-model-cache` (ML model cache, stays client-side) |
| 5 | Update P07 from "six" to "seven" providers | **HIGH** | P07 exit criteria | Enumerate all 7 providers with keys + URLs |
| 6 | Update P06 line counts + duration | **HIGH** | P06 table + rationale | Surface grows from ~9,142 to ~14,310 lines; duration likely 8–13 wk |
| 7 | Update P06 Canvas scope for face swap | **HIGH** | P06 table | Canvas = 1,020 lines (not 840); add `/v1/canvas/face-swap` endpoint |
| 8 | Update P03 IndexedDB database list | **HIGH** | P03 exit criteria | 6 databases (not 4); 8+ files with `indexedDB.open()` |
| 9 | Resolve prior audit C3 — audio files now exist | **HIGH** | P03 table count | `audio_inputs` and `audio_rehearsals` tables are real; confirm table count |
| 10 | Update P07 `stori_fal_api_key` explicit grep | **MODERATE** | P07 exit criteria | Confirm `stori_fal` pattern catches `stori_fal_api_key`; enumerate all `fal.run` sites |
| 11 | Update P04 28a extraction for file growth | **MODERATE** | P04 concrete ops | `28-canvas-consistency.js` is 404 lines (not 224); account for face swap code staying in 28 |
| 12 | Add `stori_lora_*` localStorage keys to P03/P07 | **MODERATE** | P03 + P07 | Data keys migrate in P03; P07 verifies empty |
| 13 | Clarify P05 vs P06 scope for 17c fal.ai calls | **MODERATE** | P05 exit criteria | LoRA inference in 17c (fal.ai) — P05 or P06? |
| 14 | Update all file line counts | **SUBTLE** | Throughout | 17c=5,581, 17b=5,126, 28=404, 17a=1,981, 26=2,228 |

---

## SUMMARY OF NEW MIGRATION SURFACE

### New IndexedDB databases (P03)

| Database | File | Store | Content | Migration target |
|---|---|---|---|---|
| `stori_lora_photos` | 34-lora-library.js:122 | `photos` | Training photos, previews, voice samples | R2 (binaries) + `lora_items` (metadata) |
| `fx-model-cache` | 36-object-detection.js:63 | `models` | ONNX model weights | **Local-only carve-out** |

### New Postgres tables (P03)

| Table | Source | Notes |
|---|---|---|
| `lora_items` | `stori_lora_items_v2` localStorage | Unified items (products + characters + all types) |

### New API endpoints (P06)

| Endpoint | Method | Replaces | Pattern |
|---|---|---|---|
| `/v1/jobs/lora-training` | POST | `_falSubmit(endpoint, input)` in 34-lora-library.js | Async (submit → poll → done) |
| `/v1/lora/inference` | POST | `_falRunSync('fal-ai/flux-lora', ...)` in 34-lora-library.js | Sync |
| `/v1/lora/voice-clone` | POST | `fetch('api.elevenlabs.io/v1/voices/add')` in 34-lora-library.js | Async |
| `/v1/lora/appearance-extract` | POST | `fetch('generativelanguage.googleapis.com/.../generateContent')` in 34-lora-library.js | Sync |
| `/v1/canvas/face-swap` | POST | `_replicateFaceSwap()` in 28-canvas-consistency.js | Async (submit → poll → done) |

### New BYOK keys to delete (P07)

| Key | Files | Provider |
|---|---|---|
| `stori_fal_api_key` | 17c-create-pipeline.js:4057, 34-lora-library.js:15,359 | fal.ai |
| `stori_replicate_api_key` | 28-canvas-consistency.js:146, 34-lora-library.js:1751 | Replicate |
| `stori_elevenlabs_key` (expanded) | 17a-create-api.js:447, 34-lora-library.js:2443 | ElevenLabs |

### New provider URLs to delete (P07)

| URL | Files |
|---|---|
| `api.replicate.com` | 28-canvas-consistency.js:170,188 |
| `fal.run` (expanded) | 34-lora-library.js:310,501,3164, 17c-create-pipeline.js:2666 |
| `queue.fal.run` (expanded) | 34-lora-library.js:375,385,393, 17c-create-pipeline.js:4062 |

---

*End of audit. 3-pass post-feature gap analysis — 2026-05-16.*
