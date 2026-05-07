# ADR-01 — Project state model (Postgres schema + R2 binary references)

> **Status:** Proposed (decision finalizes during Phase 03 schema-design spike — **7 days** in revision 3, was 3).
> **Date:** 2026-05-05; **revision 3:** 2026-05-06 (5 new tables added per audit).
> **Affected phases:** 03, 05, 06.
> **Author:** architect-cycle (revision 3 — was revision 2).

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

- **Phase 03** ships this schema, the migrations file, the RLS policies, and the active-flag triggers.
- **Phase 05** writes `image_instances` and `video_instances` rows from worker handlers; respects `is_active`/`is_render_active` flags when reading "what to generate".
- **Phase 06** runs `validateGates` server-side — depends on every column being correctly populated.
- **Future mobile cycle** consumes the API contract that fronts this schema (ADR-03); the schema design here is intentionally accommodating of an eventual mobile client.

---

## Links

- Source code (authoritative): `/Users/praveen/Desktop/stori/js/27-canvas-state.js` (616 lines)
- Source spec: `/Users/praveen/Desktop/stori/migrations/migration-original-spec.md` §Schema L47–97 (billing rows excluded per O15)
- Phase docs: 03 (canonical home — schema lives here), 05 (consumes — writes `image_instances` and `video_instances`), 06 (consumes — server-side `validateGates` reads the schema)
- Related ADRs: ADR-03 (API contract), ADR-06 (mode-lock), ADR-07 (R2 file storage)

*End of ADR-01.*
