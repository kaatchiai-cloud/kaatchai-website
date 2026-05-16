# ADR-01 — Project state model (Postgres schema + R2 binary references)

> **Status:** Proposed (decision finalizes during Phase 03 schema-design spike — **7 days** in revision 3, was 3).
> **Date:** 2026-05-05; **revision 3:** 2026-05-06 (5 new tables added per audit); **revision 4 pass-2:** 2026-05-06 (`brand_assets` table added per user decision); **revision 5:** 2026-05-16 (`lora_items` table + 3 additive columns on `video_instances` added per post-feature-gap audit).
> **Affected phases:** 03, 05, 06.
> **Author:** architect-cycle (revision 5 — was revision 4 pass-2).

---

## Context

The web client has a fully-formed in-memory project state model in `js/27-canvas-state.js` (616 lines, authoritative source-of-truth — read it directly; do not rely on `redesign-plan.md` summaries). The model is:

```
scene = {
  id, prompt, duration, frontRole, performance: { tone, gesture },
  bibleRefIds[], bibleVersionUsed, bibleStale,
  // mirror fields (back-compat for export/editor):
  imgDataUrl, videoUrl, videoClips, status,

  storyboardInstances: [{
    id, prompt, refImageDataUrl, isActive (radio per scene),
    canvasPosition, createdAt,
    imageInstances: [{
      id, parentStoryboardId, style, styleOverridden,
      imgDataUrl, status, error,
      isActive (multi-select ⭐ "use for video gen"),
      isRenderActive (radio per active SB — 🎯 illustrated mode),
      promptOverride, generationContext, canvasPosition, createdAt
    }]
  }],

  videoInstances: [{
    id, sourceImageInstanceId, motionPrompt, duration,
    clips: [{ url, clipDuration }], status, error, taskId,
    isActive, isRenderActive (radio per scene — 🎯 animated mode),
    role (default 'broll'; or 'narrator'), canvasPosition, createdAt
  }]
}
```

Override O1 promotes "V2 project sync" to V1 — IndexedDB is no longer acceptable as the only persistence layer. Override O4 mandates Cloudflare R2 for binary storage. Override O9 mandates forward-only migrations.

The schema choice is load-bearing because (a) Phase 05 writes pipeline outputs into these tables, (b) Phase 06 ports the canvas validation gates server-side and reads them back, (c) the future mobile cycle will consume the same shape via the API contract (ADR-03).

---

## Decision

**Five tables** in Postgres (all with `auth.uid() = user_id` RLS, transitively via `project_id` on child rows):

1. **`projects`** — top-level container.
   - `id uuid PK`, `user_id uuid FK auth.users`, `title text`, `video_mode text CHECK (video_mode IN ('illustrated','animated'))`, `mode_locked_at timestamptz NULL`, `schema_version int NOT NULL DEFAULT 1`, `bgm_r2_key text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, `deleted_at timestamptz NULL` (soft-delete).
2. **`scenes`** — per-project ordered list.
   - `id uuid PK`, `project_id uuid FK projects ON DELETE CASCADE`, `scene_index int NOT NULL`, `title text`, `duration int`, `prompt text`, `performance jsonb DEFAULT '{}'::jsonb` (holds `{tone, gesture}`), `bible_ref_ids text[] DEFAULT '{}'`, `bible_version_used int NULL`, `bible_stale bool DEFAULT false`, `front_role text DEFAULT 'broll'`, `created_at timestamptz`.
   - Unique `(project_id, scene_index)`.
3. **`storyboard_instances`** — keyed by string ID (`sb-<sceneId>-<n>` per `js/27-canvas-state.js:33-38`).
   - `id text PK`, `scene_id uuid FK scenes ON DELETE CASCADE`, `prompt text`, `ref_image_r2_key text NULL`, `is_active bool NOT NULL DEFAULT false`, `canvas_position jsonb`, `created_at timestamptz`.
   - **Active-flag invariant:** unique partial index `(scene_id) WHERE is_active = true` enforces "exactly one per scene".
4. **`image_instances`**.
   - `id text PK`, `parent_storyboard_id text FK storyboard_instances ON DELETE CASCADE`, `style text`, `style_overridden bool DEFAULT false`, `img_r2_key text NULL`, `status text CHECK (status IN ('pending','generating','done','error'))`, `error text NULL`, `is_active bool DEFAULT false` (⭐ multi-select), `is_render_active bool DEFAULT false` (🎯 radio), `prompt_override text DEFAULT ''`, `generation_context jsonb DEFAULT '{}'::jsonb`, `canvas_position jsonb`, `created_at timestamptz`.
   - **Active-flag invariant:** unique partial index `(parent_storyboard_id) WHERE is_render_active = true` — enforced ONLY when `parent_storyboard_id` belongs to a `storyboard_instances` row with `is_active = true`. Implemented as a deferrable trigger (see Consequences).
5. **`video_instances`**.
   - `id text PK`, `scene_id uuid FK scenes ON DELETE CASCADE`, `source_image_instance_id text FK image_instances NULL`, `motion_prompt text`, `duration int NULL`, `clips jsonb DEFAULT '[]'::jsonb` (array of `{url, clipDuration}`), `status text CHECK (status IN ('pending','generating','done','error'))`, `error text NULL`, `task_id text NULL`, `is_active bool DEFAULT false`, `is_render_active bool DEFAULT false`, `role text DEFAULT 'broll'`, `canvas_position jsonb`, `created_at timestamptz`.
   - **Active-flag invariant:** unique partial index `(scene_id) WHERE is_render_active = true`.

**Binary fields are R2 keys, not bytes.** `ref_image_r2_key`, `img_r2_key`, video `clips[].url` (which becomes a key after R2 migration; presigned GET URL on read), and `bgm_r2_key` are all opaque strings that resolve to R2 objects via the storage strategy in ADR-07.

**Mirror fields (`scene.imgDataUrl` / `scene.videoUrl` / `scene.videoClips` / `scene.status`) are NOT persisted as columns** — they are derived on read by the API layer mirroring the JS `syncMirrorFields` function (`js/27-canvas-state.js:132-173`). Persisting them is redundant and risks drift.

**Active-flag normalization mirrors `normalizeSceneFlags` in `js/27-canvas-state.js:183-233`** — server normalizes ambiguous states (zero-active becomes first-active; multiple-active becomes first-active) on read AND on write. The unique partial indexes catch hard violations; the trigger normalizes soft ambiguities.

**`canvas_position` is JSONB** — only the canvas UI reads it; never queried.
**`clips` is JSONB** — always read with parent video; never independently queried.
**`generation_context` is JSONB** — opaque to the schema; client/server both treat as a blob.

**Optimistic concurrency** uses `updated_at` epoch ms — clients send `If-Match: <updated_at>` on PUT; server returns 409 if mismatch. Upgrade to `version int` if races appear; not needed at single-user scale.

**Soft-delete on `projects` only** — child rows cascade-delete physically. Soft-deleted projects retain their R2 objects until ADR-07's lifecycle rule (Phase 03 + Phase 08) reaps them after 30 days.

---

## Decision (revision 3) — 5 additional tables surfaced by audit 2026-05-06

The original decision (above) covered the editor's project-state model. The 2026-05-06 audit (`migration-plan-audit-report.md`) surfaced **6 unmigrated IndexedDB / localStorage call sites** that none of the original 5 tables address. Without explicit homes for these, P03 would ship a partial persistence layer and P05/P06/P07 would each have to back-fill ad-hoc tables — a guaranteed schema-divergence accident.

Revision 3 adds **5 tables** to the schema. Cumulative table count: **10**. The 5 new tables and their source IndexedDB / localStorage call sites:

6. **`reel_projects`** — saved reel-builder projects.
   - `id uuid PK`, `user_id uuid FK auth.users`, `title text`, `audio_r2_key text`, `video_data_r2_key text NULL`, `results jsonb` (mirrors `window._reelMultiResults`), `original_audio_r2_key text NULL`, `created_at timestamptz`, `updated_at timestamptz`, `deleted_at timestamptz NULL`.
   - **Source:** `js/20-reels-creator.js:4363–4481` (save handler), `js/20-reels-creator.js:5485–5790` (`loadReelProject` function, ~305 lines).
   - **Spike-deferred question (revision 3):** unify with `projects` via a `project_kind` discriminator column, or keep separate? Default lean: **separate** (cleaner FK semantics for `audio_r2_key` + `results jsonb`); unify only if the schema spike surfaces ≥ 80% column overlap with `projects`. **Closed in P03 spike before exit.**

7. **`cast_references`** — cast-image binaries (representative / uploaded / logo).
   - `id uuid PK`, `user_id uuid FK auth.users`, `entity_kind text CHECK (entity_kind IN ('character','location','prop','logo'))`, `entity_id text`, `role text CHECK (role IN ('representative','uploaded','logo'))`, `r2_key text NOT NULL`, `metadata jsonb DEFAULT '{}'::jsonb`, `created_at timestamptz`.
   - **Source:** `js/17b-create-references.js:683–760` (cast-images IDB `stori_cast_images_v1`).
   - Binaries go to R2; this row holds R2 keys + text-only metadata.

8. **`reference_library`** — per-user cross-project reference library (currently localStorage `stori_ref_library_v1`).
   - `id uuid PK`, `user_id uuid FK auth.users [strict per-user RLS]`, `slot int`, `kind text`, `payload jsonb`, `created_at timestamptz`.
   - **Source:** `js/17b-create-references.js:4797–5004 (`LIB_KEY` at 4801)` (`LIB_KEY = 'stori_ref_library_v1'`, `LIB_CAP = 30`).
   - **30-row cap** enforced server-side via trigger or app-layer eviction (oldest by `created_at`).
   - **Spike-deferred question (revision 3):** strictly per-user, or shareable across a future team? **Closed: strictly per-user** for this cycle. Team-share is a future-mobile-cycle concern (out of scope here).

9. **`audio_inputs`** — audio-blob R2 keys.
   - `id uuid PK`, `project_id uuid FK projects ON DELETE CASCADE NULL`, `user_id uuid FK auth.users`, `r2_key text NOT NULL`, `mime text`, `duration_ms int`, `created_at timestamptz`.
   - **Source:** `js/32-audio-input.js:16–56` (audio-input IDB `AUDIO_IDB_DB`).

10. **`audio_rehearsals`** — rehearsal-render R2 keys.
    - `id uuid PK`, `project_id uuid FK projects ON DELETE CASCADE NULL`, `user_id uuid FK auth.users`, `source_audio_input_id uuid FK audio_inputs NULL`, `r2_key text NOT NULL`, `duration_ms int`, `status text`, `created_at timestamptz`.
    - **Source:** `js/33-audio-rehearsal.js:30–71` (rehearsal-renders IDB `IDB_NAME`).

11. **`brand_assets`** — per-user logo + frame library binaries (rev-4 pass-2 addition; user decision 2026-05-06: "migrate, do not carve out").
    - `id uuid PK`, `user_id uuid FK auth.users [strict per-user RLS]`, `kind text NOT NULL CHECK (kind IN ('logo','frame'))`, `slot int NOT NULL CHECK (slot BETWEEN 1 AND 3)`, `r2_key text NOT NULL`, `mime text`, `created_at timestamptz`.
    - `UNIQUE (user_id, kind, slot)` — at most 3 logos and 3 frames per user.
    - **Source:** `js/15-project.js:356, 361` (`LIBRARY_DB_NAME = 'stori_library'`, store `library` keyed by `id`).
    - **Endpoints:** `GET|POST|DELETE /v1/brand-assets` — one row per slot; binary at `r2_key`.
    - **Why migrate (not carve out):** preserves the rev-3 "all IDB → cloud" commitment. Cross-device sync for brand assets becomes free when mobile launches. ~6 small images per user, low schema cost.

**(rev-4 pass-2): `cast_references` (#7), `audio_inputs` (#9), and `audio_rehearsals` (#10) share ONE source IDB store.** All three open `stori_cast_images_v1` (verified call sites: `js/17b-create-references.js:700`, `js/32-audio-input.js:9`, `js/33-audio-rehearsal.js:32` all assign `'stori_cast_images_v1'` as the DB name). Records inside the shared `images` store are differentiated by **key prefix** (cast keys vs audio-input keys vs audio-rehearsal keys). The migration script reads the source store ONCE, classifies each record by key prefix, and fans out to the three Postgres tables. Schema-design spike (P03 §5.1) must explicitly plan this key-prefix-based migration.

**Reel→Editor handoff (now an API call, not a table):** the IndexedDB `stori_db` blob handoff at `js/20-reels-creator.js:5805–5847` plus `index.html:~4804–4825` (the `indexedDB.open('stori_db', 1)` call is at `index.html:4808`) is replaced by `POST /v1/projects/import-reel/:reel_project_id` (or a session-state token — final shape decided in ADR-03). No new table; the endpoint materializes a `projects` row from a `reel_projects` row atomically. **Spike-deferred question (revision 3):** Option A (server-materialize) vs Option B (handoff token). **Closed: default A** unless ADR-03 surfaces a reason otherwise.

**RLS on the 6 new tables** (5 rev-3 + 1 rev-4-pass-2) is `auth.uid() = user_id` (or transitively via `project_id` for `audio_inputs` / `audio_rehearsals`). `reference_library` and `brand_assets` are **strictly per-user** — no team / project scoping.

**Cap enforcement** on `reference_library` is via a `BEFORE INSERT` trigger that deletes the oldest row when count would exceed 30, mirroring the client `_libRead/_libWrite` cap eviction at `js/17b-create-references.js:4797–5004 (`LIB_KEY` at 4801)`. **`brand_assets`** uses a `UNIQUE (user_id, kind, slot)` constraint instead — overwrite-on-upsert semantics for slot reuse.

---

## Decision (revision 5) — `lora_items` table + 3 additive columns on `video_instances` (audit 2026-05-16)

The 2026-05-16 post-feature-gap audit (`migration-plan-audit-rev5-merged.md`) surfaced three features added to the codebase **after** revision 4 was finalised. One of them — **LoRA Studio** (`js/34-lora-library.js`, 4,413 lines) — has its own IndexedDB database (`stori_lora_photos`) and a localStorage data store (`stori_lora_items_v2`) that none of the rev-3 / rev-4 tables address. Without a home for it, P03 ships a partial persistence layer and the LoRA pipeline (P06) has no schema to write into. Additionally, `js/27-canvas-state.js` (the canonical client model) gained three new fields on every `videoInstance` (`effectInstances`, `tracks`, `animationPlan`) sourced from the new Video Effects engine — the existing `video_instances` table spec predates these fields.

Revision 5 adds **1 new table** + **3 additive columns** on the existing `video_instances` table. Cumulative table count: **12**.

### 12. `lora_items` — unified LoRA library (products + characters + all training types)

```
id            uuid PK
user_id       uuid FK auth.users [strict per-user RLS]
name          text NOT NULL
kind          ENUM('product','talking-head','scene-real','scene-ai') NOT NULL
trigger_phrase    text NULL
trainer_endpoint  text NULL       -- e.g. 'fal-ai/flux-lora-portrait-trainer', 'fal-ai/qwen-image-trainer', 'fal-ai/flux-lora-fast-training'
inference_endpoint text NULL      -- e.g. 'fal-ai/flux-lora', 'fal-ai/qwen-image'
lora_url      text NULL           -- populated when training completes; the URL of the trained .safetensors / diffusers_lora_file
lora_status   ENUM('uploading','generating','reviewing','training','ready','failed') NOT NULL DEFAULT 'uploading'
fal_request_id text NULL          -- the fal.ai queue request id for polling
voice_profile jsonb NULL          -- ElevenLabs voice ID + sample R2 keys (used by LoRA Studio voice picker)
appearance_block jsonb NULL       -- Gemini-vision-extracted appearance description (~200 words)
tuning_params jsonb NOT NULL DEFAULT '{}'::jsonb   -- lora_scale, guidance_scale, seed, refineEnabled, learning_rate, etc.
compatible_with text NULL         -- compatibility hints (e.g. 'flux','qwen','any')
created_at    timestamptz NOT NULL DEFAULT now()
updated_at    timestamptz NOT NULL DEFAULT now()
```

**Source:** `stori_lora_items_v2` localStorage + `stori_lora_photos` IndexedDB at `js/34-lora-library.js:122`. V1 migrations from `stori_lora_products_v1` (at `js/34-lora-library.js:1782`) and `stori_lora_characters_v1` (at `js/34-lora-library.js:1826`) already fold into the V2 unified items shape client-side, so the Postgres `lora_items` table receives the V2 shape directly.

**ENUM value sources (must be correct at DDL time — Postgres ENUMs are not easily altered):**
- `kind` ENUM values come from `js/34-lora-library.js:608–613` (`TYPE_LABELS`):
  - `'product'` — product LoRA (objects, branded items)
  - `'talking-head'` — character LoRA for talking-head video (face + upper body)
  - `'scene-real'` — character LoRA for real-photo scenes (full body)
  - `'scene-ai'` — character LoRA for AI-generated scenes (full body)
- `lora_status` ENUM values come from `js/34-lora-library.js:41–69` (`TRAINERS_V2`) state machine:
  - `'uploading'` → user is uploading training photos
  - `'generating'` → trainer is generating the 3×3 grid of training images (Gemini)
  - `'reviewing'` → user reviews + selects training images before submit
  - `'training'` → submitted to fal.ai, polling
  - `'ready'` → training complete, `lora_url` populated
  - `'failed'` → training failed; `error` text NULL allowed via separate audit column if needed (or fold into `tuning_params.last_error`)

**Binary blobs** (training photos, generated training images, preview images, voice samples) → R2. R2 key references are stored in `lora_items` (or, if normalised, in a separate `lora_training_photos` table — schema spike decides). Key prefix convention from `js/34-lora-library.js` IDB:
- `lora_v2_{itemId}_photo_{i}` → training photos uploaded by user
- `lora_v2_{itemId}_train_{i}` → generated training images (3×3 grid)
- `lora_v2_{itemId}_preview_{i}` → preview images shown post-training
- `lora_v2_{itemId}_voice_sample` → voice sample for ElevenLabs IVC voice cloning
- `lora_char_{charId}_photo_{i}` / `lora_char_{charId}_preview` → legacy V1 character paths

**Endpoints (defined in P06 — LoRA Studio pipeline):**
- `GET|POST|PUT|DELETE /v1/lora-items` — metadata CRUD; binaries via the existing R2 presign endpoint with intent `lora-training-photo` / `lora-training-image` / `lora-preview` / `lora-voice-sample`.
- `POST /v1/jobs/lora-training` — async (submit → poll → done). Server proxies fal.ai queue, polls on Cloud Run, writes back to `lora_items.lora_url` + `lora_items.lora_status='ready'`.
- `POST /v1/lora/inference` — sync. Server calls `fal-ai/flux-lora` (or `fal-ai/qwen-image`) using the `inference_endpoint` from `lora_items`.
- `POST /v1/lora/voice-clone` — async. ElevenLabs IVC voice cloning; result is the ElevenLabs `voice_id` stored in `voice_profile`.
- `POST /v1/lora/appearance-extract` — sync. Gemini Vision call that returns the ~200-word appearance description for `appearance_block`.

**RLS:** strictly per-user (`auth.uid() = user_id`). LoRAs are not project-scoped — they live in a per-user library and can be assigned to multiple projects via `window.createJobState.loraAssignments` (which becomes a serialisation concern at the API contract layer, not a schema column).

**Cross-file integration constraint:** the `lora_items` API response shape must preserve the data fields the existing client `window.LoraLibrary.*` surface returns, because four files read it during AutoPilot execution (`js/01-core.js:456–457`, `js/17c:1734–1735, 2691–2713, 2648–2750, 4449`, `js/28-canvas-consistency.js:225–227, 353–356`, `js/17b-create-references.js:2561–2562, 3198`). The server endpoint must return the same shape the existing `getItemById` / `getCharacterById` / `getSelectedProductIds` / `getProducts` / `getFalKey` accessors expose, OR a thin client-side adapter wraps the new API to match. Either path is acceptable; closed in P06 design.

### `video_instances` — 3 additive JSONB columns (rev-5)

`js/27-canvas-state.js` uncommitted edits add three new fields to every `videoInstance`:
- `effectInstances: []` — list of effect instances applied to this video clip (Video Effects engine, `js/35-video-effects.js`).
- `tracks: {}` — overlay tracks keyed by track ID (text, image, audio overlays).
- `animationPlan: null` — animation plan object describing per-effect timing / easing / target objects.

Source references: `js/27-canvas-state.js:19` (schema doc comment), `:63–65` (migrator backfill on existing instances), `:116–118` (`migrateScene` factory), `:375–377` (`addVideoInstance` factory), `:409–411` (`ensureNarratorVideoInstance` factory). All three factories initialize the fields; the migrator backfills them on load.

**Column additions to existing `video_instances` table:**
```
effects        jsonb NOT NULL DEFAULT '[]'::jsonb        -- maps to scene.videoInstances[].effectInstances
tracks         jsonb NOT NULL DEFAULT '{}'::jsonb        -- maps to scene.videoInstances[].tracks
animation_plan jsonb NULL                                -- maps to scene.videoInstances[].animationPlan
```

**Why JSONB, not normalized tables:** the effects list is never queried cross-row; it's always read with its parent video instance. The animation plan is opaque to the schema — only the client's render engine interprets it. Normalising would add three FK-constrained child tables with no query benefit. Same rationale as `clips jsonb` (line 64) and `canvas_position jsonb` (line 64).

**Migration concern: none.** These are *additive* columns with default values that match the client migrator's backfill (`[]`, `{}`, `null`). Already-persisted rows get the defaults; new rows get populated from the client. No data migration required.

**Spike note:** if the effect-instance list ever needs cross-row queries (e.g. "show me all videos using the 'glitch' effect"), normalize via a `video_instance_effects` table at that point — additive, doesn't break the JSONB column. Schema spike marks this as a deferred decision.

---

## Consequences

### Positive
- The schema is a faithful 1:1 mapping of the existing client model. No client refactor needed beyond the API call sites (which Phase 03 and 04+05 do anyway).
- RLS on every table provides defense-in-depth — even a buggy API can't accidentally leak cross-user data.
- String IDs preserved → existing client logic (CSS selectors, debug logs, etc.) keeps working.
- Forward-only migrations are easy here: any future schema change adds nullable columns or new tables; old code keeps working through a deprecation window.
- Active-flag invariants enforced in the database — bugs in the API layer can't ship inconsistent state.

### Negative
- The deferrable trigger for `image_instances.is_render_active` is non-trivial to author correctly; it must check the parent storyboard's `is_active` state at commit time. Approach: trigger function selects parent SB; if SB is active, enforce the unique constraint by setting other siblings' `is_render_active = false` (mirror of `normalizeSceneFlags` line 200–211).
- Storing R2 keys as strings (no FK) means orphan detection requires a periodic sweep job (Phase 08 lifecycle work).
- JSONB for `clips`, `canvas_position`, `generation_context`, `performance` makes those fields invisible to SQL queries — acceptable trade because they're never queried.

### Neutral
- The `mode_locked_at NULL` design (vs a separate `is_mode_locked` bool) saves a column and gives us a free timestamp. `null = not locked`; `set = locked at this time`.
- The mirror-field non-persistence design means clients must always read the API's full project response to render — they can't optimize by reading only mirror fields. Accepted because it eliminates a class of drift bugs.

---

## Options considered

### Option A — JSONB blob for the whole instance tree on the `projects` row
- **Pro:** simplest schema (1 table, 1 jsonb column).
- **Con:** can't index/query by status, can't enforce active-flag invariants in DB, can't grow without rewriting the entire blob on every save (50-MB project becomes 50-MB write for a single field change).
- **Reject:** scaling cliff is too steep.

### Option B — One table per instance type, JSONB blob inside (hybrid)
- **Pro:** balances normalization with simplicity.
- **Con:** active-flag invariants harder to enforce; queries on `status` (e.g., for the worker loop) require JSONB extraction.
- **Reject:** marginal benefit over the chosen option.

### Option C — UUID PKs on instance tables instead of string IDs
- **Pro:** "more correct" RDBMS-style.
- **Con:** breaks every client log statement, debug breadcrumb, and CSS selector that uses the existing `sb-<sceneId>-<n>` shape. Forces a client-side ID-mapping layer.
- **Reject:** churn cost outweighs aesthetic benefit.

### Option D (chosen) — Five tables, string IDs preserved, JSONB only for never-queried blobs

---

## Affected phases

- **Phase 03** ships this schema, the migrations file, the RLS policies, and the active-flag triggers. Rev-5: also ships `lora_items` table + 3 additive JSONB columns on `video_instances` (`effects`, `tracks`, `animation_plan`).
- **Phase 05** writes `image_instances` and `video_instances` rows from worker handlers; respects `is_active`/`is_render_active` flags when reading "what to generate". Rev-5: P05 carve-out — fal.ai LoRA inference calls in `js/17c-create-pipeline.js:2648–2750` are deferred to P06 (these write to `lora_items` indirectly via the LoRA inference endpoint).
- **Phase 06** runs `validateGates` server-side — depends on every column being correctly populated. Rev-5: P06 LoRA Studio pipeline writes the full `lora_items` lifecycle (training submit → poll → ready); P06 Canvas pipeline writes `video_instances.effects` / `video_instances.tracks` / `video_instances.animation_plan` via the project save/load surface (no new endpoint needed — existing `/v1/projects/:id` PUT covers it).
- **Future mobile cycle** consumes the API contract that fronts this schema (ADR-03); the schema design here is intentionally accommodating of an eventual mobile client.

---

## Links

- Source code (authoritative): `/Users/praveen/Desktop/stori/js/27-canvas-state.js` (616 lines, video-instance schema additions at lines 19, 63–65, 116–118, 375–377, 409–411)
- Source code (rev-5 LoRA): `/Users/praveen/Desktop/stori/js/34-lora-library.js` (4,413 lines, ENUM source lines 41–69 + 608–613, IDB at line 122)
- Source spec: `/Users/praveen/Desktop/stori/migrations/migration-original-spec.md` §Schema L47–97 (billing rows excluded per O15)
- Rev-5 audit source: `/Users/praveen/Desktop/stori/migrations/migration-plan-audit-rev5-merged.md` (findings C1, C4, H5 drive this revision)
- Phase docs: 03 (canonical home — schema lives here), 05 (consumes — writes `image_instances` and `video_instances`), 06 (consumes — server-side `validateGates` reads the schema; LoRA Studio pipeline writes `lora_items`)
- Related ADRs: ADR-03 (API contract), ADR-06 (mode-lock), ADR-07 (R2 file storage)

*End of ADR-01. Revision 5 — 2026-05-16.*
