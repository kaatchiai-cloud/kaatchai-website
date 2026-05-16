# Phase 03 — API Contract + Project State: Agent Task Brief

## Scope
- Define and ship the `/v1/*` API surface (OpenAPI/tRPC schema per ADR-03)
- Create 12+ Postgres tables with RLS (projects, scenes, storyboard_instances, image_instances, video_instances [+3 new JSONB columns], reel_projects, cast_references, reference_library, audio_inputs, audio_rehearsals, brand_assets, lora_items)
- Replace ALL 6 IndexedDB databases with cloud storage
- Ship `/v1/projects` CRUD + `/v1/projects/import-reel/:id` + R2-presigned-URL endpoints + cast/library/audio/brand-asset/lora endpoints

## New Postgres tables

### 5 Original tables (rev-2)
1. **projects** — `id PK, user_id FK auth.users, title, video_mode ENUM('illustrated','animated'), mode_locked_at nullable, schema_version, created_at, updated_at`
2. **scenes** — `id PK, project_id FK, scene_index int, title, duration, performance jsonb, bible_ref_ids text[], bible_version_used int nullable, bible_stale bool, front_role text default 'broll'`
3. **storyboard_instances** — `id PK text, project_id FK, scene_index int, prompt text, ref_image_r2_key nullable, is_active bool, canvas_position jsonb nullable, created_at`
4. **image_instances** — `id PK text, parent_storyboard_id FK, scene_index int, style text, style_overridden bool, img_r2_key nullable, status ENUM('pending','generating','done','error'), error text nullable, is_active bool, is_render_active bool, prompt_override text, generation_context jsonb, canvas_position jsonb nullable, created_at`
5. **video_instances** — `id PK text, project_id FK, scene_index int, source_image_instance_id FK nullable, motion_prompt text, duration int nullable, clips jsonb, status, error, task_id text nullable, is_active bool, is_render_active bool, role text default 'broll', canvas_position jsonb nullable, effects jsonb DEFAULT '[]'::jsonb, tracks jsonb DEFAULT '{}'::jsonb, animation_plan jsonb NULL, created_at`
   - **rev-5 additive columns:** `effects` (→ `effectInstances`), `tracks`, `animation_plan` — from `js/27-canvas-state.js` uncommitted edits; defaults match client migrator backfill at lines 63–65

### 5 Audit-flagged tables (rev-3)
6. **reel_projects** — `id PK, user_id FK, title, audio_r2_key, video_data_r2_key nullable, results jsonb, created_at, updated_at` — replaces `stori_db` IDB at `js/20-reels-creator.js:4363–4481, 5485–5790`. Spike Q: unify with `projects` via `project_kind` discriminator? → ADR-01
7. **cast_references** — `id PK, user_id FK, entity_kind text ('character'|'location'|'prop'|'logo'), entity_id text, role text ('representative'|'uploaded'|'logo'), r2_key text, metadata jsonb, created_at` — replaces cast-images IDB at `js/17b-create-references.js:683–760`
8. **reference_library** — `id PK, user_id FK [strict per-user RLS], slot int, kind text, payload jsonb, created_at` — replaces `stori_ref_library_v1` localStorage at `js/17b-create-references.js:4875` (`LIB_KEY`). Cap 30 entries/user (matches client `LIB_CAP=30`)
9. **audio_inputs** — `id PK, project_id FK nullable, user_id FK, r2_key text, mime text, duration_ms int, created_at` — replaces audio-input IDB at `js/32-audio-input.js:22`
10. **audio_rehearsals** — `id PK, project_id FK nullable, user_id FK, source_audio_input_id FK nullable, r2_key text, duration_ms int, status text, created_at` — replaces rehearsal-renders IDB at `js/33-audio-rehearsal.js:37`

### Rev-4 pass-2 addition
11. **brand_assets** — `id PK, user_id FK auth.users [strict per-user RLS], kind text ('logo'|'frame'), slot int, r2_key text, mime text, created_at` — replaces `stori_library` IDB at `js/15-project.js:356,361`. 3 logo slots + 3 frame slots = 6 R2 binaries per user. Endpoints: `GET|POST|DELETE /v1/brand-assets`

### Rev-5 addition
12. **lora_items** — `id PK, user_id FK auth.users, name text, kind ENUM('product','talking-head','scene-real','scene-ai'), trigger_phrase text nullable, trainer_endpoint text nullable, inference_endpoint text nullable, lora_url text nullable, lora_status ENUM('idle','generating','reviewing','training','ready','error'), fal_request_id text nullable, voice_profile jsonb nullable, appearance_block jsonb nullable, tuning_params jsonb, compatible_with text nullable, created_at, updated_at`
   - **ENUM values from code:** `kind` from `js/34-lora-library.js:608-613` (`TYPE_LABELS`); `lora_status` from `js/34-lora-library.js` call sites — actual values in code are `'idle','generating','reviewing','training','ready','error'` (note: code uses `'idle'` not `'uploading'`, and `'error'` not `'failed'`)
   - Postgres ENUMs are not easily altered — verify these values are correct at DDL time
   - Binary blobs (training photos, preview images, voice samples) → R2 with key references in `lora_items`
   - Replaces `stori_lora_items_v2` localStorage + `stori_lora_photos` IDB at `js/34-lora-library.js:122`
   - Endpoints: `GET|POST|PUT|DELETE /v1/lora-items`

## IndexedDB databases to migrate

| # | IDB database | `indexedDB.open` call site | Constant / literal | Target replacement |
|---|---|---|---|---|
| 1 | `stori_projects` | `js/15-project.js:16` | `GALLERY_DB_NAME` (defined at line 9) | `/v1/projects/*` |
| 2 | `stori_library` | `js/15-project.js:361` | `LIBRARY_DB_NAME` (defined at line 356) | `/v1/brand-assets` (rev-4: migrated, not carved out) |
| 3 | `stori_db` | `js/20-reels-creator.js:5808` | literal `'stori_db'` | `/v1/reel-projects` + `/v1/projects/import-reel` |
| 3b | `stori_db` | `js/20-reels-creator.js:5823` | literal `'stori_db'` | Same as above (handoff site #2) |
| 3c | `stori_db` | `index.html:5129` | literal `'stori_db'` | Same as above (marketing-pipeline handoff in editor) |
| 4 | `stori_cast_images_v1` | `js/17b-create-references.js:719` | `IDB_DB_NAME` (defined at line 709) | `/v1/cast-references` |
| 4b | `stori_cast_images_v1` | `js/32-audio-input.js:22` | `AUDIO_IDB_DB` (defined at line 9) | `/v1/audio-inputs` |
| 4c | `stori_cast_images_v1` | `js/33-audio-rehearsal.js:37` | `IDB_NAME` (defined at line 32) | `/v1/audio-rehearsals` |
| 5 | `stori_lora_photos` | `js/34-lora-library.js:122` | `IDB_DB_NAME` (defined at line 16) | R2 binaries + `/v1/lora-items` |

**CRITICAL — Shared IDB store:** Databases 4, 4b, 4c all open `stori_cast_images_v1` with the same `images` store, differentiated by **key prefix** (cast keys vs audio-input keys vs audio-rehearsal keys). The migration script must read the shared store ONCE, classify each record by key prefix, and fan out to the three Postgres tables. Do NOT treat as three independent reads — that produces duplicates or misses records.

**`stori_db` has 3 call sites** (lines 5808, 5823 in `js/20-reels-creator.js` + line 5129 in `index.html`) — these are ONE work item replaced by a single `/v1/projects/import-reel/:id` endpoint.

**NOTE:** `marketing-pipeline/index.html:5150` is OUT OF SCOPE — that page stays local with IndexedDB.

## Local-only carve-outs (DO NOT migrate)

| Storage | Location | Reason |
|---|---|---|
| `stori_library` → now **migrated** | `js/15-project.js:361` | Rev-4 user decision: migrate as `brand_assets` table |
| `fx-model-cache` IDB | `js/36-object-detection.js:63` | ONNX model binary cache, deterministically rebuildable from `window.__FX_MOBILESAM_URL`. Not user data; stays in IDB |
| `stori_bs_session` localStorage | `js/26-brainstorm.js:263` (`BS_STORAGE_KEY`) | Brainstorm session state, ephemeral per-session scratch. Not persistent user data; stays in localStorage |
| UI preferences (theme, autosave, agent-panel) | `js/01-core.js:543` (`stori_theme_mode`), `js/17c-create-pipeline.js:1090,1099,1104` (`stori_create_autosave`), `js/17c-create-pipeline.js:5171,5180` (`stori_agent_panel_collapsed`) | Local UI state only; stays in localStorage |
| BYOK provider secrets | Various | P07 territory; P03 does NOT touch them |

## localStorage data keys to migrate

| Key | Location | Target |
|---|---|---|
| `stori_ref_library_v1` | `js/17b-create-references.js:4875` (`LIB_KEY`) | `reference_library` Postgres table |
| `stori_lora_items_v2` | `js/34-lora-library.js:27` (`ITEMS_KEY`) | `lora_items` Postgres table (primary data store) |
| `stori_lora_products_v1` | `js/34-lora-library.js:13` (`PRODUCTS_KEY`) | Migrated into `lora_items` (V1→V2 client migration already done at `js/34-lora-library.js:1782`) — replace with no-op |
| `stori_lora_characters_v1` | `js/34-lora-library.js:14` (`CHARACTERS_KEY`) | Migrated into `lora_items` (V1→V2 client migration at `js/34-lora-library.js:1826`) — replace with no-op |
| `stori_lora_migrated_v2` | `js/34-lora-library.js:28` (`MIGRATED_KEY`) | Migration flag; clear after cloud migration |

## Instance Checkpoints

### CP-03-1: Schema spike complete (Wk 1)
ADR-01 open questions resolved; DDL for 12+ tables written; API contract format decided (ADR-03).
```
ls infra/supabase/migrations/0002_schema.sql
# → file exists
ls migrations/migration-adr-01-project-state-model.md migrations/migration-adr-03-api-contract.md
# → both exist
```
HALT: if `reel_projects` unified-vs-separate undecided after 7 days → default to separate table (less risky to merge later).

### CP-03-2: IDB → Postgres migration (Wk 2–4)
All 5 migrated IDB databases replaced; shared `stori_cast_images_v1` fan-out works; localStorage data keys migrated.
```
grep -n 'indexedDB\.open' js/15-project.js js/20-reels-creator.js js/17b-create-references.js js/32-audio-input.js js/33-audio-rehearsal.js js/34-lora-library.js index.html
# → 0 hits
grep -n 'indexedDB\.open' js/36-object-detection.js
# → 1 hit (fx-model-cache — expected carve-out)
grep -rn "stori_ref_library_v1\|stori_lora_items_v2\|stori_lora_products_v1\|stori_lora_characters_v1" js/
# → 0 hits
```
Smoke: create project → save → reload → verify data round-trips. Upload cast image → verify in references panel. Import reel → verify handoff works (no `stori_db` IDB).
HALT: if `stori_cast_images_v1` shared-store fan-out produces duplicates → re-read key-prefix classification logic.

### CP-03-3: API endpoints + R2 presign + mode-lock (Wk 4–7)
All `/v1/*` CRUD endpoints live; R2 presign works for all 7 intents; mode-lock returns 409; 50-MB round-trip < 5s.
```
# Mode-lock test (example)
curl -sf -H "Authorization: Bearer $JWT" -X PUT https://$CLOUDRUN_URL/v1/projects/$PID -d '{"video_mode":"animated"}' | jq .statusCode
# → 409 (after mode_locked_at set)
```
Smoke: 50-MB project round-trip < 5s on cable. R2 presign upload → download → verify bytes match.
HALT: if mode-lock doesn't return 409 → `mode_locked_at` check missing in PUT handler.

## Exit criteria

### Grep gate 1: ALL `indexedDB.open` call sites replaced
```bash
# Must return 0 hits in these files (project/cast/audio/lora data):
grep -n 'indexedDB\.open' js/15-project.js js/20-reels-creator.js js/17b-create-references.js js/32-audio-input.js js/33-audio-rehearsal.js js/34-lora-library.js index.html

# Only permitted remaining hits (local-only carve-outs):
#   js/36-object-detection.js:63  — 'fx-model-cache' (ONNX model cache)
grep -n 'indexedDB\.open' js/36-object-detection.js
# ^^ this one MUST still exist (carve-out)
```

### Grep gate 2: ALL migrated localStorage key reads replaced
```bash
# Must return 0 hits for these keys in js/:
grep -rn "stori_ref_library_v1\|stori_lora_items_v2\|stori_lora_products_v1\|stori_lora_characters_v1\|stori_lora_migrated_v2" js/

# Must still exist (local-only, DO NOT touch):
grep -rn "stori_bs_session\|stori_theme_mode\|stori_create_autosave\|stori_agent_panel_collapsed" js/
```

### Grep gate 3: `stori_db` references eliminated in handoff code
```bash
grep -n 'stori_db' js/20-reels-creator.js index.html
# Must return 0 hits (lines 5805-5847 in reels-creator, ~4804-4825 in index.html deleted)
```

### Grep gate 4: `stori_cast_images_v1` references eliminated
```bash
grep -rn 'stori_cast_images_v1' js/
# Must return 0 hits
```

### Grep gate 5: `stori_lora_photos` references eliminated
```bash
grep -rn 'stori_lora_photos' js/
# Must return 0 hits
```

### Structural exit criteria
1. API contract artifact (OpenAPI YAML or tRPC schema per ADR-03) checked in at `infra/api-contract/v1.yaml`; renders to hosted spec page; URL recorded in `infra/README.md`
2. All 12+ tables exist with correct columns, FKs, indexes: `psql \d+ <table>` for each; `supabase db lint` green
3. RLS on all 12+ tables: cross-user JWT read returns empty
4. Active-flag invariants enforced (radio/multi-select per `js/27-canvas-state.js:180-238`); `reference_library` 30-row cap enforced server-side
5. All `/v1/*` endpoints live: 6 project CRUD + presign + import-reel, 3 cast-ref, 3 ref-library, 4 audio, 4 brand-assets, 4 lora-items, (conditional) 2 reel-projects
6. R2 presign works across all 7 intents: `storyboard-ref`, `image`, `video-clip`, `audio-input`, `audio-rehearsal`, `cast-reference`, `lora-training-photo`
7. Mode-lock: `PUT /v1/projects/:id` flipping `video_mode` after `mode_locked_at` set returns 409
8. 50-MB project round-trip (create → save → reload → render) < 5s on cable
9. Schema-design spike artifact at `devDoc-migration/03-schema-spike.md`
10. ADR-01, ADR-03, ADR-06, ADR-07 all written

## Constraints

- **ADR-03** decides API contract format (OpenAPI vs tRPC) — must be decided before §5.4 work starts. Default: OpenAPI (mobile-future requirement, Dart/Flutter codegen from OpenAPI is mature)
- **ADR-01** decides: active-flag enforcement mechanism, `reel_projects` unified vs separate, `reference_library` per-user vs team-shareable, `clips` JSONB vs separate table, `canvas_position` JSONB vs x/y columns
- **ADR-06** decides mode-lock enforcement details
- **ADR-07** decides R2 presign path (direct browser→R2 PUT vs proxy through Cloud Run)
- **MUST NOT** touch `marketing-pipeline/index.html` — stays local with IndexedDB
- **MUST NOT** touch `js/36-object-detection.js` — `fx-model-cache` is a local-only carve-out
- **MUST NOT** touch BYOK/secret key code — P07 territory
- **MUST NOT** ship pipeline endpoints (Gemini, Kling, AutoPilot) — Phase 05
- **MUST NOT** ship canvas validation server-side (`validateGates`) — Phase 06
- **MUST NOT** create offline-mode escape hatches unless founder requests — O13: zero customers
- **Forward-only migrations** — no rollback scripts
- **String PKs** for instance IDs (match `js/27-canvas-state.js:33-38` pattern: `sb-<sceneId>-<n>`, `img-<sceneId>-<n>`, `vid-<sceneId>-<n>`)

## Dependencies

- **Phase 02 must exit first** — provides `verifyUser` middleware + `users` table FK target
- **Phase 05** consumes `/v1/projects/:id/launch` and the projects + instance tables (P05 owns the launch endpoint, not P03)
- **Phase 06** consumes the canvas-state schema for server-side validation gates
- **Phase 07** deletes the IndexedDB code paths entirely
- **Future mobile cycle** consumes the `/v1/*` API contract

## Key files to read before starting

| File | What to extract |
|---|---|
| `js/27-canvas-state.js` | **616 lines** — the ONLY authoritative source for the editor schema. Enumerate every field in `scene`, `storyboardInstance`, `imageInstance`, `videoInstance`. Pay special attention to lines 33-38 (ID generation), 180-238 (`normalizeSceneFlags` — active-flag invariants), 417-532 (`validateGates` — stays client-side this phase, moves server-side in P06) |
| `js/15-project.js` | Lines 9 (`GALLERY_DB_NAME = 'stori_projects'`), 16 (`indexedDB.open`), 356 (`LIBRARY_DB_NAME = 'stori_library'`), 361 (`indexedDB.open`) — project gallery + brand assets |
| `js/17b-create-references.js` | Lines 709 (`IDB_DB_NAME = 'stori_cast_images_v1'`), 719 (`indexedDB.open`), 683-760 (cast images IDB), 4875 (`LIB_KEY = 'stori_ref_library_v1'`), 4797-5004 (reference library localStorage) |
| `js/20-reels-creator.js` | Lines 4363-4481 + 5485-5790 (saved reel projects), 5805-5847 + 5808 + 5823 (`stori_db` handoff + saved reels) |
| `js/32-audio-input.js` | Line 9 (`AUDIO_IDB_DB = 'stori_cast_images_v1'`), 22 (`indexedDB.open`), 16-56 (audio input IDB schema) |
| `js/33-audio-rehearsal.js` | Line 32 (`IDB_NAME = 'stori_cast_images_v1'`), 37 (`indexedDB.open`), 30-71 (rehearsal IDB schema) |
| `js/34-lora-library.js` | Lines 13-28 (constants: `PRODUCTS_KEY`, `CHARACTERS_KEY`, `IDB_DB_NAME`, `ITEMS_KEY`, `MIGRATED_KEY`), 41-69 (`TRAINERS_V2` — trainer endpoint map), 122 (`indexedDB.open('stori_lora_photos')`), 608-613 (`TYPE_LABELS` — 4 kind values), 1782 + 1826 (V1→V2 client migration code), 3731/3813/3982/4070/4114/4163 (loraStatus transitions) |
| `js/36-object-detection.js` | Line 63 (`indexedDB.open('fx-model-cache')`) — **DO NOT TOUCH**; local-only carve-out |
| `index.html` | Line 5129 (`indexedDB.open('stori_db')`) — reel handoff into editor; lines ~4804-4825 (handoff block); must be replaced with `callApi('/v1/projects/import-reel/:id')` |
