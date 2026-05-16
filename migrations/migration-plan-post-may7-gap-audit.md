# Migration Plan — Post-2026-05-07 Gap Audit

> **Status:** Audit findings (revision-5 candidate). **Date:** 2026-05-16. **Auditor:** automated 3-pass audit against `migration-plan.md` + per-phase docs.
> **Scope:** features that landed in `js/` and the schema between 2026-05-07 (last `migration-plan.md` edit) and 2026-05-16 (today). **Out of scope:** anything covered cleanly by existing phase docs.
> **Outcome target:** revision-5 patch to `migration-plan.md` + targeted edits to P03, P06, P07, ADR-01. No new phase, no new ADR.

---

## Part 1 — Audit method (3 passes)

1. **Pass 1 — Inventory.** Diff `git log --since=2026-05-07` and `ls -la js/`. Identify every new module + every modified module since the plan was finalized. For each, capture: what it does, what providers it calls, what storage sites it writes (IndexedDB databases + localStorage keys).
2. **Pass 2 — Cross-reference.** For each new feature, walk the relevant phase doc(s) and verify whether the feature's *storage*, *provider*, *pipeline*, or *schema field* is named. Searches done by `grep` against the actual phase doc files — not from memory.
3. **Pass 3 — Confirm.** Re-read the phase doc around each suspected gap to ensure the feature is genuinely missing (vs covered implicitly by a broader scope statement). Only confirmed gaps are reported.

---

## Part 2 — Features added since 2026-05-07

| Source | Adds | Storage / providers |
|---|---|---|
| `js/34-lora-library.js` (NEW, 2026-05-13, 184 KB) | fal.ai LoRA training (product + character) + Library page + Step-4 picker; client-side submit→poll→fetch loop against `queue.fal.run` | IDB `stori_lora_photos`; LS `stori_lora_products_v1`, `stori_lora_characters_v1`, `stori_lora_items_v2`, `stori_lora_migrated_v2`, `stori_fal_api_key`, `stori_replicate_api_key` |
| `js/35-video-effects.js` (NEW, 2026-05-16, 42 KB) | Client-side video effects engine — 67+ effects across 8 categories (text, overlay, camera, object_bound, transition, brand, reaction, audio_reactive); canvas overlay manager + per-frame render loop | none — pure client |
| `js/36-object-detection.js` (NEW, 2026-05-16, 8 KB) | MobileSAM (ONNX Runtime Web) + MediaPipe Face/Hand/Pose Landmarkers; detection router + frame tracking; stub mode when `window.__FX_MOBILESAM_URL` is falsy | IDB `fx-model-cache` (ONNX weight cache) |
| `js/27-canvas-state.js` (MODIFIED, uncommitted) | `videoInstance` schema gains `effectInstances`, `tracks`, `animationPlan` fields | schema-only |
| `js/26-brainstorm.js` (2026-05-09 commits) | Brainstorm duration picker, narrator-choice screen, Storypilot product card | within existing brainstorm flow — no new providers / no new storage |
| `js/29-canvas-render.js`, `js/24-photopilot.js`, `js/17c-create-pipeline.js`, `js/10-preview.js`, `js/11-export.js` (uncommitted) | Wiring for effects + animationPlan into render/preview/export paths | no new providers, no new storage |

**Commit-level confirmation (post-2026-05-07):**

```
d3a1a2b 2026-05-16  LoRA Studio functional changes
c33482c 2026-05-13  LoRA Studio — full implementation (Phases 1–11)
7a2d1cb 2026-05-13  Add voice integration to LoRA Studio mocks and impl plan
e5b8a70 2026-05-09  Character LoRA system + brainstorm duration picker
9a50bbb 2026-05-09  LoRA: auto-generate preview image after training completes
0134b92 2026-05-09  Fix: LoRA trigger word saved at training, prepended to gen prompt
ee21737 2026-05-09  Fix: narrator lip sync missing from export renderer
3af9377 2026-05-09  Character consistency: face swap + product LoRA + Library page
6a54347 2026-05-09  Canvas graph, brainstorm enhancements, canvas state updates
82b4516 2026-05-09  Block real photo uploads for characters/avatars in PR/cinematic
7e918fb 2026-05-09  Narrator lip sync (MediaPipe Tier 1) + image_tail for pose
d8fd225 2026-05-07  Storypilot: product card pre-chat screen for Brand/Product
(uncommitted) js/35-video-effects.js, js/36-object-detection.js + 8 edited files
```

---

## Part 3 — Confirmed gaps

### Gap 1 — P03 schema missing LoRA library (🔴 High)

**Feature:** LoRA product + character library, trained-model URLs, training jobs.

**Where it lives now:** `js/34-lora-library.js`.

**Evidence of gap:**

- `migration-phase-03-api-contract-and-project-state.md` lists 11 tables: `projects`, `scenes`, `storyboard_instances`, `image_instances`, `video_instances`, `reel_projects`, `cast_references`, `reference_library`, `audio_inputs`, `audio_rehearsals`, `brand_assets`. **None has columns for LoRA products, trained LoRA URLs, training status, or training jobs.**
- P03 exit gate: "every `indexedDB.open(...)` call site replaced — verified by grep in `js/15-project.js`, `js/20-reels-creator.js`, `js/17b-create-references.js`, `js/32-audio-input.js`, `js/33-audio-rehearsal.js`." **`js/34` is not in this list**, yet `js/34-lora-library.js:122` calls `indexedDB.open(IDB_DB_NAME, IDB_VERSION)` against `stori_lora_photos`.
- P03 local-only carve-out lists UI prefs (`stori_theme_mode`, `stori_create_autosave`, etc.) — **does not name `stori_lora_*` keys**, so their migration status is undefined.

**Remedy (revision-5):**

1. Decide in-scope vs carve-out. Recommended: **in-scope** (cross-project LoRA reuse is the feature's whole point — it must be cloud-synced once mobile consumes the API).
2. Add to P03 schema: **`lora_products`** table (id PK, user_id FK, kind ENUM('product'|'character'), name, trigger_phrase, trainer_endpoint, inference_endpoint, status ENUM('uploading'|'training'|'ready'|'failed'), lora_url, fal_request_id, tuning_params JSONB, created_at, updated_at) + **`lora_training_photos`** R2-keyed table (id, lora_product_id FK, r2_key, ordinal, created_at).
3. Bump P03 table count from 11 → **13** (or 12 if photos modelled as JSONB on the product row).
4. Extend P03 grep gate to include `js/34-lora-library.js`.
5. Update Part 1 summary block in `migration-plan.md` accordingly (current text says "10 tables" but P03 already moved to 11 in rev-4 pass-2; this becomes 13).

---

### Gap 2 — P05/P06 missing LoRA training pipeline (🔴 High)

**Feature:** Client-side submit/poll loop directly against fal.ai for LoRA training; ~20-minute long job; needs idempotency + status surface — exactly the pattern P05 invented for AutoPilot.

**Where it lives now:** `js/34-lora-library.js:371-403` (`_falSubmit`, `_falPollStatus`, `_falFetchResult` against `https://queue.fal.run/...`).

**Evidence of gap:**

- P05 scope: `/v1/projects/:id/launch`, `/v1/jobs/scene-images`, `/v1/jobs/animation`. **No `/v1/jobs/lora-training`.**
- P06 scope: PhotoPilot, Brainstorm, Canvas, Lipsync, Audio, Input-Parser. **LoRA not listed.**
- P07 exit grep targets "all six provider URLs ... `fal.run` ... returns 0 hits in `js/` and `index.html`." `js/34-lora-library.js:310, 375, 385, 393, 501` all call `https://(queue.)fal.run/...` — P07's grep would fail unless this is migrated to a `/v1/*` endpoint before P07 runs.

**Remedy (revision-5):**

1. Add to P06 pipeline list: **LoRA training** as the 7th secondary pipeline.
2. New endpoints (server proxies fal.ai queue, runs the poll loop on Cloud Run, stores result row in `lora_products`):
   - `POST /v1/lora-training` — body: `{ kind, name, trigger_phrase, trainer_endpoint, photos: [r2_key], tuning }` → returns `{ job_id, lora_product_id }`.
   - `GET /v1/jobs/:job_id` — reuses P05 job-status table.
   - `GET /v1/lora-products` — list trained products for the user.
   - `DELETE /v1/lora-products/:id` — soft-delete.
3. Replace `_falSubmit/_falPollStatus/_falFetchResult` in `js/34` with `callApi(...)`. Confirm `js/34` calls `fal.run/fal-ai/flux-lora` inference (lines 310, 501) are folded into a separate inference endpoint or already covered by an existing image-gen route.
4. P05 line ~3 ("the first and heaviest consumer") is unchanged; LoRA is a *second* consumer in P06.
5. Add row to P06 "zero direct fetches" grep target list including `js/34`.

---

### Gap 3 — P07 deletion missing Replicate provider (🟡 Medium)

**Feature:** A 7th BYOK provider was introduced (Replicate), used as a key holder today; not yet wired to an inference call, but the surface exists and must be deleted in P07.

**Where it lives now:** `js/34-lora-library.js:1751-1753`:
```
input.value = localStorage.getItem('stori_replicate_api_key') || '';
localStorage.setItem('stori_replicate_api_key', input.value.trim());
```
Plus the corresponding `<input>` in `index.html`.

**Evidence of gap:**

- `migration-plan.md` Part 1 summary line 28 and P07 exit criterion line ~64 enumerate exactly **six** provider key prefixes: `stori_key_paid/free`, `stori_kling_*`, `stori_elevenlabs_key`, `stori_openai_key`, `stori_anthropic_key`, `stori_fal*`. **`stori_replicate_api_key` is not listed.**
- P07 exit grep (`grep -nE "stori_key_paid|...|stori_fal*"`) **will return 0 hits even with the Replicate key still present**, falsely passing the gate.

**Remedy (revision-5):**

1. Promote provider count 6 → **7** in `migration-plan.md` Part 1 + P07 §scope + P07 exit criterion #1.
2. Add `stori_replicate_api_key` to the prefix grep.
3. Add `replicate.com` / `api.replicate.com` (or whichever Replicate URLs apply) to the "six provider URLs" grep — bump to seven.
4. Confirm Replicate BYOK UI element is in the P07 deletion list.

---

### Gap 4 — P03 schema additions to `video_instances` (🟡 Medium)

**Feature:** Video instances now carry effect tracks + an animation plan, populated by the new video-effects engine.

**Where it lives now:** `js/27-canvas-state.js:19, 63-65, 116-118, 375-377, 409-411` — every `videoInstance` factory and migrator adds `effectInstances: []`, `tracks: {}`, `animationPlan: null`.

**Evidence of gap:**

- P03 `video_instances` column list does not name `effectInstances`, `tracks`, or `animationPlan`.
- `migration-adr-01-project-state-model.md` ditto — the active-flag invariants and column list predate these fields.

**Remedy (revision-5):**

1. Add to P03 `video_instances` schema spec:
   - `effects JSONB DEFAULT '[]'::jsonb` (or normalised `video_instance_effects` table if the spike decides; default to JSONB unless cross-row queries are needed).
   - `tracks JSONB DEFAULT '{}'::jsonb`.
   - `animation_plan JSONB NULL`.
2. Mirror the column additions in ADR-01 schema appendix.
3. No new endpoints — these are read/written via the existing project save/load surface.
4. Note in P03: these are *additive* columns; no migration concern for already-persisted rows.

---

### Gap 5 — P03 ambiguous on `fx-model-cache` IDB (🟢 Low)

**Feature:** Client-side ML model binary cache (ONNX MobileSAM weights).

**Where it lives now:** `js/36-object-detection.js:63` calls `indexedDB.open('fx-model-cache', 1)`.

**Evidence of gap:**

- Not user data — pure model-binary cache, deterministically rebuildable from `window.__FX_MOBILESAM_URL`.
- P03's local-only carve-out names `stori_theme_mode`, `stori_create_autosave`, `stori_agent_panel_collapsed`, `stori_brainstorm_cache` — **does not name `fx-model-cache`**, so its status is undefined.
- P03 grep gate targets specific files; **`js/36` is not in the gate list**, so the gate would pass even with this IDB call unmitigated. The risk is silent: not a correctness bug, just an undocumented carve-out.

**Remedy (revision-5):**

1. Add one line to P03 local-only carve-out: "**`fx-model-cache`** (`js/36-object-detection.js:63`) — ONNX model binary cache for client-side ML inference; local-only by design, not user data, deterministically rebuildable from `window.__FX_MOBILESAM_URL`."
2. No schema change. No endpoint. Documentation-only fix.

---

## Part 4 — Non-gaps (verified covered)

| Feature | Where covered | Note |
|---|---|---|
| Video effects engine (`js/35`) | implicitly client-side | P04/P06 assume client-side renderer; no API. Optional one-line note in P06 to make the assumption explicit. |
| Narrator lip sync (MediaPipe Tier 1 + Tier 2) | P06 `/v1/jobs/lipsync` | already replaces both client MediaPipe and Tier-2 fal.ai per P06 §1. |
| Canvas graph renderer + canvas state updates | P06 `/v1/projects/:id/canvas/validate` + `js/29` stays client-side per P06 inventory | the visual renderer is not extracted; the validator is. |
| Brainstorm duration picker, narrator-choice screen, Storypilot product card | P06 Brainstorm pipeline | UI/preset details inside an already-in-scope pipeline. |
| Block real photo uploads for characters in PR/cinematic mode | client-side validation | no API surface needed. |

---

## Part 5 — Suggested revision-5 patch summary

| Patch | File | Diff size estimate |
|---|---|---|
| Bump table count (11 → 13) + add `lora_products` + `lora_training_photos` | `migration-plan.md` Part 1 + Part 2 P03 row + `migration-phase-03-...md` §schema + `migration-adr-01-...md` | ~60 lines |
| Add LoRA pipeline to P06 + new endpoints | `migration-plan.md` Part 2 P06 row + `migration-phase-06-...md` | ~40 lines |
| Promote provider count 6 → 7 (add Replicate) | `migration-plan.md` Part 1 summary + `migration-phase-07-...md` | ~15 lines |
| Add `effects`/`tracks`/`animation_plan` columns to `video_instances` | `migration-phase-03-...md` §schema + `migration-adr-01-...md` | ~20 lines |
| Add `fx-model-cache` to P03 local-only carve-out | `migration-phase-03-...md` §local-only carve-out | ~3 lines |

**Total estimated working-week impact:** +0 wk for documentation; +1–2 wk added to P06 for LoRA pipeline endpoints + Cloud Run worker. New plan duration: **23–33 wk** (was 22–31).

**No new phase. No new ADR.** ADR-01 expanded (mirrors the rev-3 pattern of expanding ADR-01 internally). No new cross-cutting decisions surface.

---

## Part 6 — Out of scope for this audit

- Whether the new modules are good code (separate auditor job).
- Whether the LoRA Studio UX is right (separate UX job).
- Whether Replicate should ever be wired up at all (product decision).
- Whether `js/35` or `js/36` need their own ADRs (no — they are client-side utilities with no cross-phase decision surface).

---

*End of audit. Revision-5 patch not yet applied. Awaiting approval to draft the patch against `migration-plan.md` and the four affected phase/ADR docs.*
