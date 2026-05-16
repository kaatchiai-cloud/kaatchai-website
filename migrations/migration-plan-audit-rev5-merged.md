# Migration Plan Audit — Revision-5 (Merged, Post-Feature Gap Analysis)

**Document reviewed:** `/Users/praveen/Desktop/stori/migrations/migration-plan.md` (rev 4, 2026-05-06)
**Prior audits merged:** `migration-plan-audit-rev5-post-feature-gap.md`, `migration-plan-post-may7-gap-audit.md`
**Codebase audited:** `/Users/praveen/Desktop/stori/` (HEAD = `d3a1a2b` + uncommitted edits, 2026-05-16)
**Status:** 3-pass audit, two-source merge — **5 CRITICAL, 6 HIGH, 4 MODERATE, 4 SUBTLE**

---

## Overall assessment

Three major features and one schema change were added to the codebase **after** the migration plan was finalised:

1. **LoRA Studio** (`js/34-lora-library.js`, **4,413 lines**) — entirely absent from the plan. Introduces a new AI provider pair (fal.ai expanded + Replicate), 1 new IndexedDB database, 5+ new localStorage keys, a full training/inference pipeline with its own submit/poll/done loop, and **deep cross-file integration** into 4 existing pipeline files (`01-core.js`, `17b`, `17c`, `28`). Migrating P05/P06 without migrating LoRA leaves the AutoPilot, Canvas, and References pipelines broken — it is a **hard dependency**, not an isolated 7th pipeline.
2. **Video Effects** (`js/35-video-effects.js`, **1,085 lines**) — pure client-side canvas FX engine; no external calls or storage; correct to leave client-side. Just needs an explicit "no migration" note.
3. **Object Detection** (`js/36-object-detection.js`, **213 lines**) — MobileSAM ONNX + MediaPipe Face/Hand/Pose; introduces a new IDB database (`fx-model-cache`) that is a **local-only carve-out**, not a cloud migration target.
4. **`videoInstance` schema additions** (`js/27-canvas-state.js`, uncommitted edits) — three new fields on every video instance: `effectInstances`, `tracks`, `animationPlan`. P03's `video_instances` table spec and ADR-01's column list predate these fields.

Additionally, `js/32-audio-input.js` and `js/33-audio-rehearsal.js` (flagged "phantom" in prior audits) **now exist**, validating P03's `audio_inputs`/`audio_rehearsals` tables. Existing files have grown significantly, invalidating line counts and extraction ranges in P04/P05/P06.

---

## CRITICAL (will break implementation)

### C1. `js/34-lora-library.js` (4,413 lines) — entire feature unaccounted for

The migration plan has **zero references** to LoRA, LoraLibrary, LoraStudio, or `34-lora-library.js`. This is the single largest gap.

**Sub-feature breakdown:**

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
- **IndexedDB:** `stori_lora_photos` database, `photos` store — training photos, preview images, voice samples, reference images.
- **localStorage keys:** `stori_lora_products_v1`, `stori_lora_characters_v1`, `stori_lora_items_v2`, `stori_lora_migrated_v2`, `stori_fal_api_key`, `stori_replicate_api_key`, `stori_elevenlabs_key`.

**Direct API calls (13 total `fetch()` to providers):**
- `fal.run/fal-ai/flux-lora` (inference) × 2
- `queue.fal.run/{endpoint}` (training submit) × 1
- `queue.fal.run/{endpoint}/requests/{id}/status` (poll) × 1
- `queue.fal.run/{endpoint}/requests/{id}` (result) × 1
- `fal.run/{endpoint}` (sync inference helper) × 1
- `api.elevenlabs.io/v1/voices/add` (voice clone) × 1
- `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` × 2 (appearance + training-image gen)
- Plus ~5 image URL fetches (fetching generated result URLs)

**Cross-file integration (will break if LoRA not migrated):**
- [js/01-core.js:456-457](js/01-core.js#L456-L457) — seeds `window.createJobState.loraAssignments`.
- [js/17c-create-pipeline.js:2691-2713](js/17c-create-pipeline.js#L2691-L2713) — `_getSceneLoraContext()` reads `window.LoraLibrary.*`.
- [js/17c-create-pipeline.js:2648-2750](js/17c-create-pipeline.js#L2648-L2750) — `generateLoraImage()` calls fal.ai with LoRA URLs.
- [js/17c-create-pipeline.js:4449](js/17c-create-pipeline.js#L4449) — reads `window.LoraLibrary.getFalKey()` for fal.ai key.
- [js/17c-create-pipeline.js:1734-1735](js/17c-create-pipeline.js#L1734-L1735) — calls `window.LoraLibrary.renderAssetsSection()` and `.updateLaunchImageButton()`.
- [js/28-canvas-consistency.js:225-227](js/28-canvas-consistency.js#L225-L227) — reads `window.LoraLibrary.getCharacterById()` for character consistency.
- [js/28-canvas-consistency.js:353-356](js/28-canvas-consistency.js#L353-L356) — reads `window.LoraLibrary.getFalKey()` for LoRA inference.
- [js/17b-create-references.js:2561-2562](js/17b-create-references.js#L2561-L2562) — calls `window.LoraLibrary._openVoicePicker()`.
- [js/17b-create-references.js:3198](js/17b-create-references.js#L3198) — calls `window.LoraLibrary.getItemById()`.

**Impact:** P07's exit criteria ("grep returns 0 hits for all provider keys/URLs") will fail because LoRA code still holds them. P03's IndexedDB exit criteria will miss `stori_lora_photos`. P05/P06 migrations will leave AutoPilot/Canvas/References half-broken.

**Fix:**
1. Add `js/34-lora-library.js` as a P06 secondary pipeline ("LoRA Studio pipeline").
2. Add 4 new P06 endpoints: `/v1/jobs/lora-training` (async), `/v1/lora/inference` (sync), `/v1/lora/voice-clone` (async), `/v1/lora/appearance-extract` (sync).
3. P03 must add `stori_lora_photos` IDB to its migration surface and `lora_items` to its table list.
4. P07 must add `stori_fal_api_key`, `stori_replicate_api_key`, `stori_elevenlabs_key` (expanded), `fal.run`, and `api.replicate.com` to its grep gate.
5. P06 line-count surface grows by 4,413 lines (see H2).

---

### C2. Replicate is a 7th AI provider — not in P07's "six provider" scope

**Verified use case:** **post-process face swap** on photorealistic/cinematic scene images via Replicate's `codeplugtech/face-swap` pinned model. Full submit→poll→done loop (3s poll interval, 120s timeout, model pinning, skip-condition logic). Replicate is **not** used for LoRA training or inference — those go to fal.ai.

**Where:** [js/28-canvas-consistency.js:133-298](js/28-canvas-consistency.js#L133-L298)
- Pinned model: `codeplugtech/face-swap` version `278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34`.
- Direct browser `fetch('https://api.replicate.com/v1/predictions')` at [js/28-canvas-consistency.js:170](js/28-canvas-consistency.js#L170).
- Poll loop with 3s interval, 120s timeout at [js/28-canvas-consistency.js:186-206](js/28-canvas-consistency.js#L186-L206).
- BYOK key `stori_replicate_api_key` at [js/28-canvas-consistency.js:146](js/28-canvas-consistency.js#L146) and [js/34-lora-library.js:1751-1753](js/34-lora-library.js#L1751-L1753) (key input UI is co-located with LoRA UI in `index.html`).

**Skip conditions:** not photoreal/cinematic → skip; no Replicate key → skip; character has a ready LoRA assigned → skip for that character (LoRA handles identity if available; face swap is the fallback).

**Plan claims** (P07 exit criteria, rev-4): "all six provider key prefixes" and "all six provider URLs".

**Impact:** P07's grep will miss `stori_replicate_api_key` and `api.replicate.com`, leaving direct Replicate API calls and BYOK keys in the browser after P07 ships.

**Fix:** Promote provider count 6 → 7 in P07. Add:
- Key prefix: `stori_replicate_api_key`
- URL: `api.replicate.com`
- Function references: `_getReplicateKey`, `_replicateFaceSwap`, `applyFaceSwapToSceneImage`
- New P06 endpoint: `/v1/canvas/face-swap` (async, server proxies to Replicate)

---

### C3. `stori_fal_api_key` grep coverage is right, but `fal.run` URL surface has exploded

**Plan claims** (P07 exit criteria, rev-4): grep pattern includes `stori_fal*`.

**Code reality (verified):**
- `stori_fal_api_key` is used in [js/17c-create-pipeline.js:4057](js/17c-create-pipeline.js#L4057), [js/34-lora-library.js:15](js/34-lora-library.js#L15), [js/34-lora-library.js:359-360](js/34-lora-library.js#L359-L360). The `stori_fal*` glob catches all three.
- `fal.run` URL count has grown from 2 sites (lipsync) to **~13+ sites** (lipsync + LoRA training queue + LoRA inference + AutoPilot LoRA image generation in 17c).

**Impact:** The key-prefix grep is fine, but the URL grep is at risk of being undercounted. P07's exit gate must enumerate all `fal.run` and `queue.fal.run` call sites at kickoff, not assume the original count of 2.

**Fix:** Confirm P07 grep pattern is `stori_fal` (catches `stori_fal_api_key`). Add explicit `fal.run` and `queue.fal.run` to the URL grep list. Enumerate all 13+ call sites at P07 kickoff. Verify the LoRA inference call in [js/17c-create-pipeline.js:2648-2750](js/17c-create-pipeline.js#L2648-L2750) is migrated as part of P06 (not P05).

---

### C4. `stori_lora_photos` IndexedDB database not in P03 migration surface

**Plan claims** (P03 exit criteria): "every `indexedDB.open(...)` call site replaced".

**Code reality:** [js/34-lora-library.js:122](js/34-lora-library.js#L122) opens `indexedDB.open('stori_lora_photos', 1)` with a `photos` store. This database stores:
- Training photos: `lora_v2_{itemId}_photo_{i}`
- Training images (generated): `lora_v2_{itemId}_train_{i}`
- Preview images: `lora_v2_{itemId}_preview_{i}`
- Voice samples: `lora_v2_{itemId}_voice_sample`
- Character photos (legacy): `lora_char_{charId}_photo_{i}`, `lora_char_{charId}_preview`

These are binary blobs (images, audio) that must migrate to R2, with metadata in a `lora_items` Postgres table.

**Impact:** P03's IndexedDB grep verification will miss this database. LoRA photos remain in browser storage while everything else migrates to cloud. LoRA feature breaks for users who expect their trained LoRAs to persist across devices.

**Fix:**
1. Add `stori_lora_photos` to P03's IndexedDB migration surface.
2. Add `lora_items` table to P03's schema (columns: `id`, `user_id`, `name`, `kind` ENUM('product','talking-head','scene-real','scene-ai'), `trigger_phrase`, `trainer_endpoint`, `inference_endpoint`, `lora_url`, `lora_status` ENUM('uploading'|'generating'|'reviewing'|'training'|'ready'|'failed'), `fal_request_id`, `voice_profile`, `appearance_block`, `tuning_params JSONB`, `compatible_with`, `created_at`, `updated_at`). The ENUM values come from `js/34-lora-library.js:41-69` (`TRAINERS_V2` keys) and `34-lora-library.js:608-613` (`TYPE_LABELS`). Postgres ENUMs are not easily altered after creation — these 4 values must be correct at DDL time.
3. Binary blobs (photos, previews, voice samples) → R2 with key references stored in `lora_items` (or a separate `lora_training_photos` table if normalised).
4. P03 exit-criteria grep target list must include `js/34-lora-library.js`.
5. Update P03 table count from 11 → **12+** (add `lora_items`; optionally `lora_training_photos`).

---

### C5. `js/36-object-detection.js` opens `fx-model-cache` IndexedDB — not in P03

**Code reality:** [js/36-object-detection.js:63](js/36-object-detection.js#L63) opens `indexedDB.open('fx-model-cache', 1)` with a `models` store. Caches MobileSAM ONNX model weights (~50–100 MB).

**Impact:** This is a local-only ML model cache (deterministically rebuildable from `window.__FX_MOBILESAM_URL`). It should be a **P03 local-only carve-out** (like `stori_library`), not a cloud migration target. But it must be explicitly noted so P03's exit criteria ("every `indexedDB.open` call site replaced") doesn't try to migrate it or falsely fail.

**Fix:** Add `fx-model-cache` to P03's "local-only carve-outs" list alongside `stori_library`. One-line note: "ML model binary cache for client-side ONNX inference; local-only by design, not user data."

---

## HIGH (will cause scope confusion)

### H1. File line counts have grown — invalidates P04 extraction ranges

| File | Plan claims | Actual (2026-05-16) | Delta |
|---|---|---|---|
| `js/17c-create-pipeline.js` | 5,139–5,206 | **5,581** | +375–442 |
| `js/17b-create-references.js` | ~4,656 | **5,126** | +470 |
| `js/28-canvas-consistency.js` | 224 | **404** | +180 |
| `js/17a-create-api.js` | 1,765–1,830 | **1,981** | +151–216 |
| `js/26-brainstorm.js` | 1,716 | **2,228** | +512 |

**Impact on P04:** The 17e/17f extraction ranges (`4898–5051`, `5097–5100`, `3728–3900`), exit guard math (`5,206 ± 50`), and `wc -l` baselines are all stale. The LoRA integration code in `17c` (lines ~2648–2750, ~2691–2713, ~4449) was added after the plan and is not accounted for in the P04 split.

**Impact on P05:** P05's total surface (19,309 in prior audits) is now higher. The four `17*` files total ~14,000 lines (not 12,872 / 13,276).

**Impact on P06:** Brainstorm is now 2,228 lines (not 1,716). Canvas consistency is 404 lines (not 224). Canvas pipeline total is 1,020 lines (616 + 404, not 840).

**Fix:** Re-run `wc -l` on all target files at P04/P05/P06 kickoff. Update all line-count references in the plan and phase docs. Re-derive P04 extraction ranges by `grep` for the named function boundaries, not the stale absolute line numbers.

---

### H2. P06 secondary-pipeline surface is significantly underestimated

**Plan claims** (P06 rationale): 6 pipelines, **9,142 + ~180** lines total → 6–9 weeks.

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

**Impact:** P06 duration estimate (6–9 weeks) is based on 9,142 lines. The actual surface is ~14,310 lines — a **54% increase**. LoRA Studio alone is 4,413 lines, larger than any existing secondary pipeline except Audio.

**Fix:** Add LoRA Studio to P06's pipeline list. Recalculate P06 duration (likely **8–13 weeks**). Consider splitting P06 into P06a (existing 6 pipelines) and P06b (LoRA Studio) if the total exceeds comfort. Update plan total duration from 22–31 to **24–35 weeks** (or trigger a re-partition gate if the user prefers).

---

### H3. `js/28-canvas-consistency.js` now includes Replicate face swap — not in P06 Canvas scope

**Plan claims** (P06 Canvas): Canvas = `27-canvas-state.js` (616) + `28-canvas-consistency.js` (224).

**Code reality:** `28-canvas-consistency.js` is now 404 lines and includes:
- `_getReplicateKey()` at [js/28-canvas-consistency.js:145](js/28-canvas-consistency.js#L145).
- `_replicateFaceSwap()` at [js/28-canvas-consistency.js:169-206](js/28-canvas-consistency.js#L169-L206) — direct `fetch('https://api.replicate.com/v1/predictions')`.
- Face-swap integration in `applyFaceSwapToSceneImage()` at [js/28-canvas-consistency.js:211-298](js/28-canvas-consistency.js#L211-L298).
- LoRA character consistency integration at [js/28-canvas-consistency.js:225-227](js/28-canvas-consistency.js#L225-L227).

**Impact:** P06's Canvas pipeline must now migrate:
1. Replicate face-swap API calls → `/v1/canvas/face-swap` (or similar).
2. LoRA character references → `/v1/lora/items/:id` reads.
3. The `28a-image-gen-shim.js` extraction in P04 must account for this growth — the Replicate code stays in `28` (not a Gemini shim), so the extraction line ranges shift.

**Fix:** Add Replicate face swap to P06 Canvas scope. Add `/v1/canvas/face-swap` endpoint. Update Canvas line count to 1,020.

---

### H4. P03 exit criteria file list is still missing `js/34-lora-library.js` and `js/36-object-detection.js`

Prior audit (rev-4 pass-2 M2) flagged missing files. The actual IndexedDB call sites are now:

| File | Line | Database | In plan's list? |
|---|---|---|---|
| `js/15-project.js` | 16 | `stori_projects` | Partially (implied) |
| `js/15-project.js` | 361 | `stori_library` | NO (local carve-out, needs explicit note) |
| `js/17b-create-references.js` | 719 | `stori_cast_images_v1` | Partially |
| `js/20-reels-creator.js` | 5808, 5823 | `stori_db` | YES |
| `js/32-audio-input.js` | 22 | `stori_cast_images_v1` | Previously "phantom" — now real |
| `js/33-audio-rehearsal.js` | 37 | `stori_cast_images_v1` | Previously "phantom" — now real |
| `index.html` | ~4766 | `stori_db` | NO (flagged in prior audit) |
| **`js/34-lora-library.js`** | **122** | **`stori_lora_photos`** | **NO — entirely missing** |
| **`js/36-object-detection.js`** | **63** | **`fx-model-cache`** | **NO — entirely missing (local-only carve-out)** |

There are **6 distinct IndexedDB databases** (not 4):

1. `stori_projects` (`js/15-project.js`)
2. `stori_library` (`js/15-project.js`) — local-only carve-out
3. `stori_db` (`js/20-reels-creator.js` × 2, `index.html`)
4. `stori_cast_images_v1` (`js/17b-create-references.js`, `js/32-audio-input.js`, `js/33-audio-rehearsal.js`)
5. **`stori_lora_photos`** (`js/34-lora-library.js`) — **NEW, migrates to R2 + `lora_items`**
6. **`fx-model-cache`** (`js/36-object-detection.js`) — **NEW, local-only carve-out**

**Fix:** Update P03 exit criteria to list all 6 databases and all 8+ files with `indexedDB.open()` call sites.

---

### H5. `videoInstance` schema gains three new fields — not in P03 or ADR-01

**Code reality (uncommitted edits to `js/27-canvas-state.js`):**
- [js/27-canvas-state.js:19](js/27-canvas-state.js#L19) — schema comment now includes `effectInstances, tracks, animationPlan` on every `videoInstance`.
- [js/27-canvas-state.js:63-65](js/27-canvas-state.js#L63-L65) — migrator backfills `effectInstances: []`, `tracks: {}`, `animationPlan: null` on existing instances.
- [js/27-canvas-state.js:116-118](js/27-canvas-state.js#L116-L118), [375-377](js/27-canvas-state.js#L375-L377), [409-411](js/27-canvas-state.js#L409-L411) — all three factory paths (`migrateScene`, `addVideoInstance`, `ensureNarratorVideoInstance`) initialise the fields.

**Plan reality:** P03 `video_instances` column list does not name `effectInstances`, `tracks`, or `animationPlan`. ADR-01's column appendix predates these fields.

**Impact:** When P03 ships, video-instance rows will be missing three fields the client expects. Client falls back to defaults via the migrator, but new effect timelines, animation plans, and overlay tracks won't persist round-trip.

**Fix:**
1. Add to P03 `video_instances` schema spec:
   - `effects JSONB DEFAULT '[]'::jsonb` (or normalised `video_instance_effects` table if cross-row queries needed; default to JSONB).
   - `tracks JSONB DEFAULT '{}'::jsonb`.
   - `animation_plan JSONB NULL`.
2. Mirror the additions in `migration-adr-01-project-state-model.md`.
3. These are *additive* columns — no migration concern for already-persisted rows; default values match the client migrator.

---

### H6. `js/32-audio-input.js` and `js/33-audio-rehearsal.js` exist — prior audit's C3 is resolved

The rev-4 pass-2 audit (C3) flagged these as "phantom files that don't exist." They now exist:
- `js/32-audio-input.js`: 1,229 lines, opens `stori_cast_images_v1` at [js/32-audio-input.js:22](js/32-audio-input.js#L22).
- `js/33-audio-rehearsal.js`: 1,169 lines, opens `stori_cast_images_v1` at [js/33-audio-rehearsal.js:37](js/33-audio-rehearsal.js#L37).

This means:
- P03's `audio_inputs` and `audio_rehearsals` tables are **real**, not phantom.
- P03's table count of 11 tables is valid (assuming `brand_assets` from `stori_library` is included).
- P03's IndexedDB grep for these files is **no longer vacuous** — it will actually verify something.

**Fix:** Remove the "to-be-created" note from the plan. Mark rev-4 pass-2 C3 as resolved.

---

## MODERATE (correctable without scope risk)

### M1. P07 "six provider" language must become "seven providers"

All references to "six provider key prefixes" and "six provider URLs" in P07 must update to seven:

| # | Provider | Key prefix(es) | URL pattern |
|---|---|---|---|
| 1 | Gemini | `stori_key_paid`, `stori_key_free` | `generativelanguage.googleapis.com` |
| 2 | Kling | `stori_kling_access_key`, `stori_kling_secret_key` | Kling endpoints |
| 3 | ElevenLabs | `stori_elevenlabs_key` | `api.elevenlabs.io` |
| 4 | OpenAI | `stori_openai_key` | `api.openai.com` |
| 5 | Anthropic | `stori_anthropic_key` | `api.anthropic.com` |
| 6 | fal.ai | `stori_fal_api_key` | `fal.run`, `queue.fal.run` |
| 7 | **Replicate** | **`stori_replicate_api_key`** | **`api.replicate.com`** |

### M2. P04 `28-canvas-consistency.js` split must account for face-swap code

The P04 split extracts a shared Gemini-call shim from `28-canvas-consistency.js` into `28a-image-gen-shim.js`. With the file now at 404 lines (was 224), the extraction must account for:

- `_getReplicateKey()` ([js/28-canvas-consistency.js:145](js/28-canvas-consistency.js#L145)) — **stays in 28** (not a Gemini shim).
- `_replicateFaceSwap()` ([js/28-canvas-consistency.js:169-206](js/28-canvas-consistency.js#L169-L206)) — **stays in 28** (Replicate, not Gemini).
- `applyFaceSwapToSceneImage()` ([js/28-canvas-consistency.js:211-298](js/28-canvas-consistency.js#L211-L298)) — stays in 28.
- LoRA character lookup ([js/28-canvas-consistency.js:225-227](js/28-canvas-consistency.js#L225-L227)) — stays in 28.

The `28a` shim should still extract `generateStyleFingerprint` and the Gemini-call portion of `regenerateImageInstance`, but the line ranges have shifted significantly from the rev-4 plan's stale numbers.

### M3. `stori_lora_*` localStorage keys are user-data, must migrate in P03

These are **not** BYOK keys — they store user data:

- `stori_lora_items_v2` → `lora_items` Postgres table (primary data store).
- `stori_lora_products_v1` → migrated into `lora_items` (V1→V2 client migration already done at [js/34-lora-library.js:1782](js/34-lora-library.js#L1782)).
- `stori_lora_characters_v1` → migrated into `lora_items` (V1→V2 migration at [js/34-lora-library.js:1826](js/34-lora-library.js#L1826)).

After cloud migration, these localStorage keys should be empty/deleted. P07 should verify they return 0 meaningful entries.

### M4. P05 vs P06 boundary for fal.ai calls inside `17c`

[js/17c-create-pipeline.js:2648-2750](js/17c-create-pipeline.js#L2648-L2750) contains `generateLoraImage()` which calls fal.ai directly. P05 claims "zero direct fetches to Google in [the listed files]" but doesn't mention fal.ai fetches in `17c` that are part of the AutoPilot image-generation flow.

The AutoPilot image-generation path now:
1. Generates base images (Gemini) — P05 replaces with `callApi()`.
2. **Optionally applies LoRA (fal.ai)** — must also be replaced with `callApi()`.
3. Optionally applies Tier-2 lipsync (fal.ai) — P06 replaces with `callApi()`.

**Fix — two options with tradeoffs:**

- **Option A: Broaden P05 exit criteria** from "zero Gemini fetches in [list]" to "zero direct AI fetches in [list]." Pro: P05 leaves `17c` clean of all direct AI calls. Con: P05 is already the heaviest phase (5,581 lines in `17c` alone); adding fal.ai LoRA inference migration increases P05 scope and duration. The LoRA inference code (~100 lines in `17c:2648-2750`) would need its own `callApi()` replacement and a temporary server-side fal.ai proxy (or early wiring of the P06 `/v1/lora/inference` endpoint).
- **Option B: Explicit P05 carve-out.** P05 exit criteria remains "zero Gemini fetches in [list]" with an explicit note: "fal.ai LoRA inference calls in `17c:2648-2750` are deferred to P06 (LoRA Studio pipeline)." Pro: keeps P05 scope bounded. Con: `17c` ships with a mix of `callApi()` (Gemini) and direct `fetch` (fal.ai LoRA) until P06 completes.

**Recommendation:** Option B is safer — P05 is already the longest phase. Add the carve-out note and verify that the direct fal.ai calls are behind a feature flag or conditional (they are: LoRA inference only fires when `window.LoraLibrary` reports a ready LoRA).

---

## SUBTLE (edge cases that may surface during implementation)

### S1. `stori_elevenlabs_key` usage has expanded from 2 files to 3

Previously: `js/17a-create-api.js` + `js/33-audio-rehearsal.js`.
Now also: `js/34-lora-library.js` (voice cloning + voice library picker).

P07's `trackCost` deletion already targets `js/33-audio-rehearsal.js`, but the LoRA voice-cloning code in `34` is new surface.

### S2. `window.LoraLibrary.*` is called from 4 files during AutoPilot execution

When P05 replaces AutoPilot's direct Gemini calls with `callApi()`, it must also handle the LoRA integration points in `17c-create-pipeline.js` that call `window.LoraLibrary.*`. These integration points must be preserved — the server-side LoRA endpoint must return the same data shape the client currently reads from localStorage/IDB (or a thin client-side adapter wraps the new API to match the old `window.LoraLibrary` surface).

### S3. `js/35-video-effects.js` is pure client-side — no migration needed

1,085 lines of canvas rendering effects. No API calls, no IndexedDB, no localStorage. Stays client-side. Must be listed as **"in-scope, no extraction needed"** in the plan to avoid confusion.

### S4. `js/25-photopilot-fx.js` is a helper module — no migration needed

707 lines of PhotoPilot effect definitions. No API calls, no storage. Stays client-side. Listed in `index.html` loader array alongside `24-photopilot.js`.

---

## Actionable changes (prioritised, 15 rows)

| # | What | Severity | Plan section | Fix |
|---|------|----------|---|---|
| 1 | Add LoRA Studio pipeline to P06 | **CRITICAL** | P06 table + rationale | Add `js/34-lora-library.js` (4,413 lines) as 7th pipeline; add `/v1/jobs/lora-training`, `/v1/lora/inference`, `/v1/lora/voice-clone`, `/v1/lora/appearance-extract` endpoints |
| 2 | Add Replicate as 7th provider to P07 | **CRITICAL** | P07 exit criteria | Add `stori_replicate_api_key`, `api.replicate.com`, `_getReplicateKey`, `_replicateFaceSwap`, `applyFaceSwapToSceneImage` to grep list; add `/v1/canvas/face-swap` endpoint to P06 |
| 3 | Add `stori_lora_photos` IDB to P03 | **CRITICAL** | P03 exit criteria + table list | Add `lora_items` table + R2 binary storage; add `js/34-lora-library.js` to IndexedDB grep list |
| 4 | Add `fx-model-cache` IDB to P03 local carve-outs | **CRITICAL** | P03 exit criteria | Explicitly exclude `fx-model-cache` (ML model cache, stays client-side) |
| 5 | Update P07 from "six" to "seven" providers | **HIGH** | P07 exit criteria | Enumerate all 7 providers with keys + URLs (table in M1) |
| 6 | Update P06 line counts + duration | **HIGH** | P06 table + rationale | Surface grows from ~9,142 to ~14,310 lines; duration likely 8–13 wk; total plan duration 24–35 wk |
| 7 | Update P06 Canvas scope for face swap | **HIGH** | P06 table | Canvas = 1,020 lines (not 840); add `/v1/canvas/face-swap` endpoint |
| 8 | Update P03 IndexedDB database list | **HIGH** | P03 exit criteria | 6 databases (not 4); 8+ files with `indexedDB.open()` |
| 9 | **Add `effects`/`tracks`/`animation_plan` columns to `video_instances`** | **HIGH** | P03 schema + ADR-01 | Three additive JSONB columns; mirror in ADR-01 |
| 10 | Resolve prior audit C3 — audio files now exist | **HIGH** | P03 table count | `audio_inputs`/`audio_rehearsals` real; confirm table count |
| 11 | Confirm P07 `stori_fal_api_key` explicit grep | **MODERATE** | P07 exit criteria | Confirm `stori_fal` pattern catches `stori_fal_api_key`; enumerate all 13+ `fal.run` sites |
| 12 | Update P04 `28a` extraction for file growth | **MODERATE** | P04 concrete ops | `28-canvas-consistency.js` is 404 lines (not 224); face-swap code stays in 28 |
| 13 | Add `stori_lora_*` localStorage keys to P03/P07 | **MODERATE** | P03 + P07 | Data keys migrate in P03; P07 verifies empty |
| 14 | Clarify P05 vs P06 scope for 17c fal.ai calls | **MODERATE** | P05 exit criteria | Broaden P05 from "zero Gemini fetches" to "zero direct AI fetches" |
| 15 | Update all file line counts | **SUBTLE** | Throughout | 17c=5,581, 17b=5,126, 28=404, 17a=1,981, 26=2,228 |

---

## Summary of new migration surface

### New IndexedDB databases (P03)

| Database | File | Store | Content | Migration target |
|---|---|---|---|---|
| `stori_lora_photos` | [js/34-lora-library.js:122](js/34-lora-library.js#L122) | `photos` | Training photos, previews, voice samples | R2 (binaries) + `lora_items` (metadata) |
| `fx-model-cache` | [js/36-object-detection.js:63](js/36-object-detection.js#L63) | `models` | ONNX model weights | **Local-only carve-out** |

### New Postgres tables (P03)

| Table | Source | Notes |
|---|---|---|
| `lora_items` | `stori_lora_items_v2` localStorage + V1 migrations | Unified items (products + characters + all types) |
| `video_instances` (additive columns) | `js/27-canvas-state.js` schema additions | `effects JSONB`, `tracks JSONB`, `animation_plan JSONB` |

### New API endpoints (P06)

| Endpoint | Method | Replaces | Pattern |
|---|---|---|---|
| `/v1/jobs/lora-training` | POST | `_falSubmit(endpoint, input)` in `34-lora-library.js` | Async (submit → poll → done) |
| `/v1/lora/inference` | POST | `_falRunSync('fal-ai/flux-lora', ...)` in `34-lora-library.js` | Sync |
| `/v1/lora/voice-clone` | POST | `fetch('api.elevenlabs.io/v1/voices/add')` in `34-lora-library.js` | Async |
| `/v1/lora/appearance-extract` | POST | `fetch('generativelanguage.googleapis.com/.../generateContent')` in `34-lora-library.js` | Sync |
| `/v1/canvas/face-swap` | POST | `_replicateFaceSwap()` in `28-canvas-consistency.js` | Async (submit → poll → done) |

### New BYOK keys to delete (P07)

| Key | Files | Provider |
|---|---|---|
| `stori_fal_api_key` | [js/17c-create-pipeline.js:4057](js/17c-create-pipeline.js#L4057), [js/34-lora-library.js:15, 359](js/34-lora-library.js#L15) | fal.ai |
| `stori_replicate_api_key` | [js/28-canvas-consistency.js:146](js/28-canvas-consistency.js#L146), [js/34-lora-library.js:1751](js/34-lora-library.js#L1751) | Replicate |
| `stori_elevenlabs_key` (expanded) | `js/17a-create-api.js:447`, [js/34-lora-library.js:2443](js/34-lora-library.js#L2443) | ElevenLabs |

### New provider URLs to delete (P07)

| URL | Files |
|---|---|
| `api.replicate.com` | [js/28-canvas-consistency.js:170, 188](js/28-canvas-consistency.js#L170) |
| `fal.run` (expanded) | [js/34-lora-library.js:310, 501, 3164](js/34-lora-library.js#L310), [js/17c-create-pipeline.js:2666](js/17c-create-pipeline.js#L2666) |
| `queue.fal.run` (expanded) | [js/34-lora-library.js:375, 385, 393](js/34-lora-library.js#L375), [js/17c-create-pipeline.js:4062](js/17c-create-pipeline.js#L4062) |

### Plan summary updates (revision-5)

| Field | Rev-4 value | Rev-5 value |
|---|---|---|
| Provider count | 6 | **7** (add Replicate) |
| P03 table count | 11 | **12+** (add `lora_items`; +3 columns on `video_instances`) |
| P03 IDB databases listed | 4 | **6** (add `stori_lora_photos`, `fx-model-cache`) |
| P06 pipeline count | 6 | **7** (add LoRA Studio) |
| P06 surface (lines) | 9,322 | **~14,310** (+54%) |
| P06 duration | 6–9 wk | **8–13 wk** |
| Total plan duration | 22–31 wk | **24–35 wk** |

---

## Out of scope for this audit

- Whether the new modules are good code (separate auditor job).
- Whether the LoRA Studio UX is right (separate UX job).
- Whether Replicate is the right provider for face swap (product decision; could be migrated to fal.ai or a server-hosted model in the future).
- Whether `js/35` or `js/36` need their own ADRs (no — they are client-side utilities with no cross-phase decision surface).

---

## Recommendation

Treat this document as the basis for a **revision-5 patch** to `migration-plan.md` + targeted edits to:

- `migration-phase-03-api-contract-and-project-state.md` (schema, IDB list, carve-outs)
- `migration-phase-04-module-split.md` (line counts, 28a extraction ranges)
- `migration-phase-05-autopilot-pipeline-extraction.md` (exit criteria — broaden to "zero direct AI fetches")
- `migration-phase-06-secondary-pipelines-extraction.md` (LoRA Studio, face swap, line counts, duration)
- `migration-phase-07-web-cutover.md` (7 providers, expanded grep)
- `migration-adr-01-project-state-model.md` (lora_items, video_instances column additions)

**No new phase, no new ADR.** ADR-01 expanded internally (mirrors the rev-3 pattern). Total plan duration grows from 22–31 to **24–35 weeks**.

---

## Supplemental pass — deep sweep findings (2026-05-16)

A fourth pass was run after the merged audit to catch anything missed by sweeping the entire codebase for: (a) every `fetch()` to an external URL, (b) every `localStorage` key, (c) every `indexedDB.open()`, (d) every BYOK key input in `index.html`, (e) `marketing-pipeline/`, (f) external dependencies, (g) dollar-cost UI.

---

### S5. Jina AI Reader (`r.jina.ai`) — 8th provider, not in P07 scope

[js/26-brainstorm.js:637](js/26-brainstorm.js#L637) makes a direct browser `fetch('https://r.jina.ai/' + encodeURIComponent(url))` with `Accept: text/plain`. Used by the Storypilot product-card feature to extract text from a user-provided URL.

**Key details:**
- No BYOK key — Jina Reader API is free-tier (no auth header sent).
- Called from Brainstorm's `_pcExtract()` function.
- Returns plain text, truncated to 2,500 chars.

**Impact on migration:**
- P07's URL grep does not include `r.jina.ai`. After P07, this direct call would remain.
- This is **not** a BYOK provider (no client-stored key), but it IS a direct browser-to-external-API call that violates the "web ships against `/v1/*` exclusively" exit criterion.
- If Jina Reader is kept, it needs a `/v1/brainstorm/extract-url` proxy in P06. If deprecated, P07 must delete the call.

**Fix:** Add `r.jina.ai` to P07 URL grep list. Add a P06 Brainstorm endpoint `/v1/brainstorm/extract-url` or mark as deprecated. Update provider count language from "7 providers (BYOK)" to "7 BYOK providers + 1 keyless provider (Jina Reader)."

---

### S6. ElevenLabs Speech-to-Text (`scribe_v1`) — not in P06 Audio scope

[js/17a-create-api.js:468](js/17a-create-api.js#L468) makes a direct browser `fetch('https://api.elevenlabs.io/v1/speech-to-text')` with `xi-api-key` header. This is the **Scribe v1** transcription endpoint used in the Create Story agent pipeline (Step 1).

**Key details:**
- Model: `scribe_v1` with word-level timestamps + optional diarization.
- Has a Gemini fallback (transcribe via Gemini at [js/17a-create-api.js:493](js/17a-create-api.js#L493)) that runs if ElevenLabs STT fails.
- Uses the same `stori_elevenlabs_key` BYOK key as TTS.

**Impact:** The migration plan's P06 Audio scope lists `/v1/audio/*` and `/v1/jobs/voice-rehearsal` but does NOT list an STT/transcription endpoint. The Create Story agent's transcription step (P05 territory) directly calls ElevenLabs STT from `17a`. If P05 replaces Gemini calls with `callApi()` but leaves ElevenLabs STT untouched, the web still makes a direct `api.elevenlabs.io` call after P07 — violating P07's exit criteria.

**Fix:** Add `/v1/audio/transcribe` (or `/v1/jobs/transcribe`) to P05 or P06 endpoints. This is a sync endpoint (transcription returns inline, not async). Update P05 exit criteria: "zero direct AI fetches in `17a`" must include ElevenLabs STT.

---

### S7. ElevenLabs Voice Catalog fetch — direct browser call

[js/17a-create-api.js:753](js/17a-create-api.js#L753) makes `fetch('https://api.elevenlabs.io/v1/voices')` to populate the `VOICE_CATALOG.elevenlabs` array. Cached in `stori_cast_images_v1` IDB (`castIdb.put('elevenlabs_voice_catalog', ...)` at [js/17a-create-api.js:794](js/17a-create-api.js#L794)).

**Impact:** After P07 deletes `stori_elevenlabs_key` and the `api.elevenlabs.io` URL, this catalog fetch breaks. The voice catalog must either:
1. Be fetched server-side and returned via `/v1/audio/voices` (recommended — catalog is static and small).
2. Be hardcoded as a JSON fixture on the server (ElevenLabs catalog changes rarely).

The `stori_cast_images_v1` IDB caching (`elevenlabs_voice_catalog` key) adds a cross-database dependency: the LoRA voice picker in `34-lora-library.js:2792` reads `window.VOICE_CATALOG.elevenlabs`, which is populated by this fetch. If the catalog endpoint moves server-side, the client-side VOICE_CATALOG initialization must be updated.

**Fix:** Add `/v1/audio/voices` to P06 Audio endpoints. Update `17a` to populate `VOICE_CATALOG.elevenlabs` from `callApi('/v1/audio/voices')` instead of direct fetch.

---

### S8. Brainstorm cost display (`bs-cost-tag`) — dollar-cost UI not flagged for P07

[js/26-brainstorm.js:1435-1450](js/26-brainstorm.js#L1435-L1450) computes per-session dollar cost (`~$X.XXX used`) and displays it in `bs-cost-tag` in [index.html:4248](index.html#line4248). Uses hardcoded per-token pricing: `{ gemini: { in: 0.000000075, out: 0.000000300 }, openai: { in: 0.000000005, out: 0.000000015 }, anthropic: { in: 0.000000003, out: 0.000000015 } }`.

**Impact:** P07 already removes the global dollar-cost UI. But the Brainstorm session-specific cost display is a separate UI element. P07 must also delete `bs-cost-tag` from `index.html` and `_updateMeta()` from `26-brainstorm.js`.

**Fix:** Add `bs-cost-tag` to P07 deletion list. Add `_updateMeta`/`_getProviderPricing` to P07 grep targets.

---

### S9. `stori_kling_key` + `stori_kling_provider` + `stori_fal_key` — marketing-pipeline-only BYOK keys

The marketing pipeline (`marketing-pipeline/index.html`) uses key names that differ from the main app:
- `stori_kling_key` (vs main app's `stori_kling_access_key`/`stori_kling_secret_key`)
- `stori_fal_key` (vs main app's `stori_fal_api_key`)
- `stori_kling_provider` (provider selector state)
- `stori_openai_key`, `stori_elevenlabs_key`, `stori_key_paid` (shared with main app)

**Impact:** The marketing pipeline is explicitly excluded from migration scope (prior audit M3 confirmed this). However, P07's exit criteria grep targets `js/` and root `index.html` only — it does NOT grep `marketing-pipeline/`. If P07 accidentally includes `marketing-pipeline/` in its grep, it would find hits and fail.

**Fix:** P07 exit criteria must explicitly state: "grep targets `js/` and root `index.html` only — `marketing-pipeline/` is excluded (separate deployment with its own BYOK flow, not in scope for this migration)."

---

### S10. `stori_bs_session` — Brainstorm session state in localStorage

[js/26-brainstorm.js:263](js/26-brainstorm.js#L263) defines `BS_STORAGE_KEY = 'stori_bs_session'`. Stores active brainstorm session state (messages, provider, token counts) in localStorage. Not in the plan's local-only carve-out list.

**Impact:** This is session/ephemeral data, not persistent user data. Should be a P03 local-only carve-out (like `stori_brainstorm_cache`). Not migrating it is fine, but it must be explicitly noted.

**Fix:** Add `stori_bs_session` to P03 local-only carve-outs.

---

### S11. JSZip dynamically loaded from CDN — external dependency in LoRA training

[js/34-lora-library.js:3998](js/34-lora-library.js#L3998) dynamically loads `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js` for the Qwen trainer path (ZIP creation for training data upload).

**Impact:** After migration, if LoRA training moves server-side, JSZip is no longer needed in the browser. But during the transition period (pre-P06), the client still loads it. Post-P07, a dynamic CDN load from the client would be unusual. P07 must either:
1. Remove the dynamic CDN loader (since server-side training handles ZIP creation), or
2. Vendor JSZip in `vendor/` alongside wavesurfer.

**Fix:** Note in P06: when `/v1/jobs/lora-training` replaces client-side fal.ai training, the `_loadJSZip()` function and CDN fetch become dead code — P07 deletes it. If interim support is needed, vendor JSZip locally instead of loading from CDN.

---

### S12. Lyria 3 BGM — direct Gemini API call for audio generation

[js/17c-create-pipeline.js:4238](js/17c-create-pipeline.js#L4238) calls `generativelanguage.googleapis.com/v1beta/models/lyria-3-clip-preview:generateContent?key=${key}` for BGM generation. Also called from [js/20-reels-creator.js:4604](js/20-reels-creator.js#L4604).

**Impact:** The plan covers Lyria under P05's "AutoPilot" scope and P06's "Audio" pipeline, but the Lyria call in `20-reels-creator.js` (the reel BGM path) is not explicitly mentioned. P05 claims "zero direct fetches to Google in `20-reels-creator.js`" — this Lyria call is included implicitly, but it's worth noting because Lyria is a **different model** than the text/image generation models, and it returns audio binary, not JSON.

**Fix:** Confirm P05's endpoint `/v1/jobs/animation` (or a dedicated `/v1/audio/bgm` endpoint) covers Lyria 3 BGM generation for both the Create Story and Reel BGM paths. Add explicit Lyria mention to P05 exit criteria.

---

### S13. `js/21-kling.js:356` — Gemini continuation-prompt call inside Kling module

[js/21-kling.js:356](js/21-kling.js#L356) makes a direct `fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}')` call. This is used to generate a "continuation prompt" for the next video clip by analysing the last frame of the current clip.

**Impact:** This Gemini call inside the Kling module is not listed in any phase doc. P05 says it replaces Gemini calls in `17c`, `17a`, `17b`, `17d`, `20`, and `17e` — but `21-kling.js` is not in that list. The Gemini call in `21-kling.js` would remain after P05, and P07's grep for `generativelanguage.googleapis.com` would find it.

**Fix:** Add `js/21-kling.js` to P05's (or P06's) file list for Gemini call replacement. This call should become `callApi('/v1/gemini/generate-content')` or be folded into the existing `/v1/jobs/animation` endpoint.

---

### Updated complete `fetch()` inventory (all direct browser→provider calls)

| File | Line | URL | Provider | Plan phase? |
|---|---|---|---|---|
| `17a-create-api.js` | 468 | `api.elevenlabs.io/v1/speech-to-text` | ElevenLabs | **NO — new finding S6** |
| `17a-create-api.js` | 620 | `generativelanguage.googleapis.com/.../generateContent` | Gemini | P05 |
| `17a-create-api.js` | 753 | `api.elevenlabs.io/v1/voices` | ElevenLabs | **NO — new finding S7** |
| `17a-create-api.js` | 847 | `api.elevenlabs.io/v1/text-to-speech/:id` | ElevenLabs | P06 Audio |
| `17a-create-api.js` | 898 | `api.elevenlabs.io/v1/text-to-speech/:id/with-timestamps` | ElevenLabs | P06 Audio |
| `17c-create-pipeline.js` | 1557 | `generativelanguage.googleapis.com/.../generateContent` | Gemini | P05 |
| `17c-create-pipeline.js` | 1687 | `generativelanguage.googleapis.com/.../generateContent` | Gemini | P05 |
| `17c-create-pipeline.js` | 1893 | `generativelanguage.googleapis.com/.../generateContent` | Gemini | P05 |
| `17c-create-pipeline.js` | 2047 | `generativelanguage.googleapis.com/.../generateContent` | Gemini | P05 |
| `17c-create-pipeline.js` | 2128 | `generativelanguage.googleapis.com/.../generateContent` | Gemini | P05 |
| `17c-create-pipeline.js` | 2361 | `generativelanguage.googleapis.com/.../generateContent` | Gemini | P05 |
| `17c-create-pipeline.js` | 2666 | `fal.run/fal-ai/flux-lora` | fal.ai | P06 LoRA |
| `17c-create-pipeline.js` | 355 | `generativelanguage.googleapis.com/.../generateContent` | Gemini (TTS) | P05 |
| `17c-create-pipeline.js` | 4062 | `queue.fal.run/...` | fal.ai (lipsync) | P06 |
| `17c-create-pipeline.js` | 4238 | `generativelanguage.googleapis.com/.../lyria-3-clip-preview` | Gemini (Lyria) | P05 |
| `17c-create-pipeline.js` | 5310 | `generativelanguage.googleapis.com/.../generateContent` | Gemini | P05 |
| `17d-create-languages.js` | 192 | `generativelanguage.googleapis.com/.../generateContent` | Gemini | P05 |
| `20-reels-creator.js` | 1198 | `generativelanguage.googleapis.com/.../generateContent` | Gemini (TTS) | P05 |
| `20-reels-creator.js` | 1552 | `generativelanguage.googleapis.com/.../generateContent` | Gemini (TTS) | P05 |
| `20-reels-creator.js` | 1639 | `generativelanguage.googleapis.com/.../generateContent` | Gemini (TTS) | P05 |
| `20-reels-creator.js` | 2731 | `generativelanguage.googleapis.com/.../generateContent` | Gemini (TTS) | P05 |
| `20-reels-creator.js` | 3699 | `generativelanguage.googleapis.com/.../generateContent` | Gemini (TTS) | P05 |
| `20-reels-creator.js` | 4604 | `generateLyriaBgm()` | Gemini (Lyria) | P05 |
| `21-kling.js` | 356 | `generativelanguage.googleapis.com/.../generateContent` | Gemini | **NO — new finding S13** |
| `26-brainstorm.js` | 637 | `r.jina.ai/...` | Jina Reader | **NO — new finding S5** |
| `26b-llm-router.js` | 60 | `api.openai.com/v1/chat/completions` | OpenAI | P06 Brainstorm |
| `26b-llm-router.js` | 94 | `api.anthropic.com/v1/messages` | Anthropic | P06 Brainstorm |
| `28-canvas-consistency.js` | 170 | `api.replicate.com/v1/predictions` | Replicate | P06 Canvas (C2) |
| `34-lora-library.js` | 310 | `fal.run/fal-ai/flux-lora` | fal.ai | P06 LoRA (C1) |
| `34-lora-library.js` | 375 | `queue.fal.run/...` | fal.ai | P06 LoRA (C1) |
| `34-lora-library.js` | 385 | `queue.fal.run/.../status` | fal.ai | P06 LoRA (C1) |
| `34-lora-library.js` | 393 | `queue.fal.run/.../requests/:id` | fal.ai | P06 LoRA (C1) |
| `34-lora-library.js` | 501 | `fal.run/fal-ai/flux-lora` | fal.ai | P06 LoRA (C1) |
| `34-lora-library.js` | 2668 | `api.elevenlabs.io/v1/voices/add` | ElevenLabs | P06 LoRA (C1) |
| `34-lora-library.js` | 3164 | `fal.run/...` | fal.ai | P06 LoRA (C1) |
| `34-lora-library.js` | 3590 | `generativelanguage.googleapis.com/.../generateContent` | Gemini | P06 LoRA (C1) |

**Total: 36 direct browser→provider fetch calls.** Prior audit counted ~13 for LoRA alone; this full inventory shows the true scope across all files.

---

### Updated supplemental actionable changes

| # | What | Severity | Fix |
|---|------|----------|---|
| 16 | Add Jina Reader (`r.jina.ai`) to P07 URL grep + P06 Brainstorm endpoint | **HIGH** | `/v1/brainstorm/extract-url` or deprecation |
| 17 | Add ElevenLabs STT (`/v1/speech-to-text`) to P05/P06 scope | **HIGH** | New endpoint `/v1/audio/transcribe`; update P05 file list to include `17a` |
| 18 | Add ElevenLabs voice catalog fetch to P06 Audio scope | **HIGH** | New endpoint `/v1/audio/voices`; update VOICE_CATALOG init |
| 19 | Add Brainstorm `bs-cost-tag` to P07 dollar-cost deletion | **MODERATE** | Delete `_updateMeta` cost logic + `bs-cost-tag` UI |
| 20 | Add `js/21-kling.js` to P05/P06 file list for Gemini call replacement | **HIGH** | `21-kling.js:356` continuation-prompt call must become `callApi()` |
| 21 | Add `stori_bs_session` to P03 local-only carve-outs | **LOW** | Documentation-only |
| 22 | Note JSZip CDN dynamic load in P06/P07 | **LOW** | Becomes dead code after P06; P07 deletes `_loadJSZip` |
| 23 | Confirm Lyria 3 BGM coverage in P05 for both `17c` and `20-reels-creator.js` | **MODERATE** | Explicit mention in P05 exit criteria |

---

*End of merged audit + supplemental deep sweep — 2026-05-16.*
