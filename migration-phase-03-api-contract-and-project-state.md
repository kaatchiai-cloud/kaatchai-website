# Phase 03 — API Contract + Project State (Postgres + R2 — 10 tables)

> **Status:** ready-to-execute after Phase 02 exits. **Audience:** solo founder + 1–2 engineers. **Duration:** M+ (6–9 working weeks). **Revision-3:** expanded with 5 new tables (audit 2026-05-06) and a 7-day schema-design spike (was 3 days).
> **Goal in one line:** define the `/v1/*` API surface, ship the projects/instances schema, and replace IndexedDB with cloud storage end-to-end.
> **Source:** `/Users/praveen/Desktop/stori/migration-plan.md` Part 2 row 03; coverage matrix rows 2, 5, 6, 11, [OVERRIDES] O1, O3, O4, O8, O9, O14.

---

## 1. Scope

### In scope
1. **`/v1/*` API contract** documented and rendered. The contract format (OpenAPI YAML vs tRPC schema) is decided in **ADR-03** during this phase. Whichever wins, it is checked in, renders to a hosted spec page (Stoplight, Swagger UI, or tRPC's `@trpc/client` types — TBD by ADR), and is the single source of truth for every later phase.
2. **Postgres schema (10 tables)** for project state, derived from reading `js/27-canvas-state.js` directly (the real source of truth for the editor) plus the 5 audit-flagged sites surfaced in revision 3 (the real source of truth for reel-creator + cast/library + audio persistence). `redesign-plan.md` describes the editor shape but is not authoritative; see ADR-01.

   **The 5 original canonical tables (revision 2):**
   - `projects` (id, user_id FK auth.users, title, video_mode `illustrated|animated`, mode_locked_at nullable, schema_version, created_at, updated_at)
   - `scenes` (id PK, project_id FK, scene_index int, title, duration, performance jsonb, bible_ref_ids text[], bible_version_used int nullable, bible_stale bool, front_role text default 'broll')
   - `storyboard_instances` (id PK text, project_id FK, scene_index int, prompt text, ref_image_r2_key nullable, is_active bool, canvas_position jsonb nullable, created_at)
   - `image_instances` (id PK text, parent_storyboard_id FK, scene_index int, style text, style_overridden bool, img_r2_key nullable, status `pending|generating|done|error`, error text nullable, is_active bool, is_render_active bool, prompt_override text, generation_context jsonb, canvas_position jsonb nullable, created_at)
   - `video_instances` (id PK text, project_id FK, scene_index int, source_image_instance_id FK nullable, motion_prompt text, duration int nullable, clips jsonb, status, error, task_id text nullable, is_active bool, is_render_active bool, role text default 'broll', canvas_position jsonb nullable, created_at)

   **The 5 NEW tables added in revision 3 (audit 2026-05-06):**
   - `reel_projects` (id PK, user_id FK, title, audio_r2_key, video_data_r2_key nullable, results jsonb, created_at, updated_at) — replaces `stori_db` IndexedDB at `js/20-reels-creator.js:4363–4481, 5477–5515`. **Spike-deferred question:** unify with `projects` via a `project_kind` discriminator, or keep separate? See §5.1.
   - `cast_references` (id PK, user_id FK, entity_kind text `character|location|prop|logo`, entity_id text, role text `representative|uploaded|logo`, r2_key text, metadata jsonb, created_at) — replaces the cast-images IndexedDB at `js/17b-create-references.js:683–760`. Binary blobs go to R2; this row holds R2 keys + text-only metadata.
   - `reference_library` (id PK, user_id FK [strict per-user RLS], slot int, kind text, payload jsonb, created_at) — replaces the localStorage `stori_ref_library_v1` at `js/17b-create-references.js:4730–4785`. Cap at 30 entries per user (matches client `LIB_CAP=30`); oldest evicted. **Spike-deferred question:** strictly per-user, or shareable across a future team? See §5.1.
   - `audio_inputs` (id PK, project_id FK nullable, user_id FK, r2_key text, mime text, duration_ms int, created_at) — replaces audio-input IndexedDB at `js/32-audio-input.js:16–56`.
   - `audio_rehearsals` (id PK, project_id FK nullable, user_id FK, source_audio_input_id FK nullable, r2_key text, duration_ms int, status text, created_at) — replaces rehearsal-renders IndexedDB at `js/33-audio-rehearsal.js:30–71`.
3. **Active-flag invariants enforced server-side** per the contract observed in `js/27-canvas-state.js` lines 180–238:
   - `storyboard.is_active` — **radio per scene** (exactly one)
   - `image_instance.is_active` — **multi-select** (⭐ "use for video gen")
   - `image_instance.is_render_active` — **radio per active storyboard** (🎯 illustrated mode)
   - `video_instance.is_render_active` — **radio per scene** (🎯 animated mode)
   Each invariant enforced via either a check constraint, a unique partial index, or an after-trigger that normalizes (mirror of `normalizeSceneFlags` from `js/27-canvas-state.js:183-233`). ADR-01 picks the enforcement mechanism.
4. **RLS** on every project table: `auth.uid() = user_id` (or transitively, `auth.uid() = (select user_id from projects where id = project_id)` on child rows). All policies forward-only (override O9).
5. **R2 wiring** for binary fields: `ref_image_r2_key`, `img_r2_key`, video `clips[].url`. The R2 access pattern (presigned PUT direct from browser vs proxy through API) is decided in **ADR-07** during this phase. Lifecycle policies decided alongside.
6. **`/v1/projects` CRUD** endpoints:
   - `POST /v1/projects` → create new project
   - `GET /v1/projects` → list user's projects
   - `GET /v1/projects/:id` → fetch full project (with embedded scenes + instance trees)
   - `PUT /v1/projects/:id` → upsert project (idempotent, optimistic-concurrency via `updated_at` or `version`)
   - `DELETE /v1/projects/:id` → soft-delete (set `deleted_at`)
   - `POST /v1/projects/:id/r2-presign` → returns `{ put_url, get_url, key }` for a binary upload slot (parameterized by `intent: 'storyboard-ref' | 'image' | 'video-clip' | 'audio-input' | 'audio-rehearsal' | 'cast-reference'`)
6a. **Reel-to-Editor handoff** — replaces the IndexedDB blob handoff at `js/20-reels-creator.js:5796–5839` plus `index.html:4782–4800`. Two equivalent shapes; pick one in ADR-03:
   - Option A: `POST /v1/projects/import-reel/:reel_project_id` — server materializes a new `projects` row from a saved `reel_projects` row, returns the new project id. Atomic; no client-held blob.
   - Option B: `POST /v1/projects/handoff-token` (returns short-lived JWT-signed token) + `POST /v1/projects?handoff=<token>` — slightly more flexible but harder to audit.
   Default: **Option A** unless ADR-03 surfaces a reason otherwise. Either way, the IndexedDB `stori_db` handoff blob is **deleted** and the relevant code paths in `js/20-reels-creator.js` + `index.html` migrate to `callApi(...)`.
6b. **Cast / library / audio endpoints** — small set added to support the 5 new tables:
   - `GET|POST|DELETE /v1/cast-references` (scoped by `entity_kind` + `entity_id`)
   - `GET|POST|DELETE /v1/reference-library` (capped at 30; oldest auto-evicted server-side)
   - `GET|POST /v1/audio-inputs` and `GET|POST /v1/audio-rehearsals` (R2 keys; binaries via the presign endpoint)
7. **Mode-lock enforcement** at the API layer: `videoMode` is settable on creation; once `mode_locked_at` is set (server-side, atomically when Phase 05's "Launch Agents" endpoint fires), any `PUT` that mutates `video_mode` returns **409 Conflict**. ADR-06 is the canonical record; this phase ships the column + the enforcement check.
8. **Migrate all project-state and project-adjacent persistence (10 tables + reel handoff) to cloud.** Carve-outs that **stay** in browser storage (this phase does NOT touch them):
   - **Local-only UI preferences** — theme mode at `js/01-core.js:543` (`stori_theme_mode`); create-tab autosave at `js/17c-create-pipeline.js:1090, 1099, 1104` (`stori_create_autosave`); agent-panel collapsed pref at `js/17c-create-pipeline.js:5171, 5180` (`stori_agent_panel_collapsed`); brainstorm chat cache at `js/26-brainstorm.js` (per-session scratch).
   - **Browser-stored provider secrets** (BYOK key reads/writes) — P07 territory; P03 does not touch them.

   **In-scope persistence migration** — every IndexedDB / localStorage call site that backs **project / cast / library / audio** data is replaced. **Verified by grep at phase exit** across all six audit-flagged source files **plus `index.html`**:
   - `js/15-project.js` lines 16, 361 (gallery + library opens) — replaced by `/v1/projects/*` + `/v1/reference-library`.
   - **`js/20-reels-creator.js:5799, 5814` + `index.html:4787` — all three `indexedDB.open('stori_db', 1)` reel-handoff sites are ONE work item, replaced by a single `/v1/projects/import-reel/:id` endpoint** (item 6a). The `index.html` site (line 4787, inside the "If opened from Marketing Pipeline" block at lines 4782–4800) goes through the same API call as the two `js/20-reels-creator.js` sites.
   - `js/20-reels-creator.js` lines 4363–4481 + 5477–5515 (saved reel-builder projects) — replaced by `/v1/reel-projects` CRUD (or unified into `/v1/projects` with discriminator — see ADR-01 spike).
   - `js/17b-create-references.js` line 699 (`stori_cast_images_v1`) — replaced by `/v1/cast-references`.
   - `js/17b-create-references.js` lines 4730–4785 (`stori_ref_library_v1` localStorage) — replaced by `/v1/reference-library`.
   - `js/32-audio-input.js` line 22 (audio inputs IDB) — replaced by `/v1/audio-inputs`.
   - `js/33-audio-rehearsal.js` line 37 (rehearsals IDB) — replaced by `/v1/audio-rehearsals`.
   Existing IndexedDB code paths can stay as **disabled** fallbacks (per O13: zero customers; no migration needed; founder's local dogfood projects are recoverable). Default: delete entirely in Phase 07 with the rest of the cleanup unless founder asks to keep one as an offline-mode escape hatch.
9. **API contract documented as suitable for a future mobile consumer**: explicit versioning policy (`/v1/*` is stable contract; breaking changes ship as `/v2/*`), explicit error model (`{ error: { code, message } }` shape; never leak server internals), JSON-only (no protobuf), JWT auth flow that works with the Dart/Flutter Supabase SDK (just a Bearer header — already handled by Phase 02's middleware). **No mobile client built in this cycle.**
10. **Performance acceptance:** a 50-MB project (heavy embedded base64 reference images stored as R2 keys after migration; metadata + R2 keys total ≪ 50 MB) round-trips create → save → reload → render in under 5 seconds on cable broadband.

11. **`vercel.json` `/v1/*` routing.** Update `vercel.json` with rewrites for the `/v1/*` paths handled by **Vercel Functions** (short calls only — Brainstorm/Input-Parser/Auth-me/etc per ADR-03). Cloud Run-handled `/v1/*` paths (long jobs) **bypass `vercel.json`** entirely — they hit Cloud Run directly via the Cloud Run public URL or via a path-prefix proxy (TBD in ADR-03). Document the path partition (which `/v1/*` prefixes route to Vercel vs Cloud Run) in **ADR-03**.

### Explicitly out of scope (defer to later phases)
- **Pipeline endpoints (Gemini, Kling, AutoPilot job orchestration)** → Phase 05.
- **Other secondary pipelines (PhotoPilot, Brainstorm, Canvas validation server-side, Lipsync, Audio, Input-Parser)** → Phase 06. **Note:** the canvas-state schema lives here; the *server-side validation gate* (`validateGates` from `js/27-canvas-state.js:417-532`) moves server-side in Phase 06, not this phase.
- **BYOK code deletion / dollar-cost UI removal** → Phase 07.
- **Production launch readiness (Sentry dashboards, runbooks, canary drills)** → Phase 08.
- **Quota / billing columns on `users` table** → out-of-cycle (override O15).
- **Projects-table data migration from real users** → not needed (override O13: zero customers).
- **Realtime subscriptions (Supabase Realtime) for live multi-tab sync** → not needed for this cycle; status polling is enough. ADR-02 documents the choice.

---

## 2. Goal & exit criteria

| # | Exit criterion | How verified |
|---|----------------|--------------|
| 1 | API contract artifact (OpenAPI YAML or tRPC schema, per ADR-03) checked in at `infra/api-contract/v1.yaml` (or equivalent). Renders to a hosted spec page reachable at a URL recorded in `infra/README.md`. | URL renders; PR review passes. |
| 2 | Postgres migration applied: **all 10 tables** exist with correct columns, FKs, and indexes — the 5 originals (`projects`, `scenes`, `storyboard_instances`, `image_instances`, `video_instances`) **plus** the 5 added in revision 3 (`reel_projects` or unified, `cast_references`, `reference_library`, `audio_inputs`, `audio_rehearsals`). | `psql \d+ <table>` for each; `supabase db lint` green. |
| 3 | RLS policies attached to **all 10 tables**; tested by attempting a cross-user read with a different user's JWT and getting an empty result. `reference_library` strictly per-user (no team-share path in this cycle — spike-deferred Q closed: per-user-only). | Manual + integration test. |
| 4 | Active-flag invariants enforced — manual SQL `INSERT` violating the radio invariant fails (or is auto-normalized — pick one in ADR-01). `reference_library` 30-row cap enforced server-side via trigger or app-layer eviction. | Direct DB test. |
| 5 | All `/v1/*` endpoints live: 6 `/v1/projects/*` (CRUD + presign + import-reel) + 3 cast-reference + 3 reference-library + 4 audio (input + rehearsal CRUD); OpenAPI/tRPC contract matches actual behaviour; integration tests cover happy + error paths. | Integration suite. |
| 6 | R2 presign endpoint returns valid PUT/GET URLs that upload + download a 5-MB blob successfully across all 6 intents (`storyboard-ref`, `image`, `video-clip`, `audio-input`, `audio-rehearsal`, `cast-reference`). | E2E test. |
| 7 | Mode-lock check: a `PUT /v1/projects/:id` that flips `video_mode` after `mode_locked_at` is set returns 409. | Integration test. |
| 8 | **All project/cast/library/audio `indexedDB.open(...)` call sites replaced** with `callApi(...)`. **Grep gate at phase exit:** `grep -rn 'indexedDB\.open' js/ index.html` returns 0 hits in `js/15-project.js`, `js/20-reels-creator.js`, `js/17b-create-references.js`, `js/32-audio-input.js`, `js/33-audio-rehearsal.js`, **AND `index.html` (the `stori_db` reel-handoff at line 4787 must be gone)**. Local-only UI prefs (theme, create autosave, agent-panel collapsed, brainstorm cache) deliberately remain in localStorage. Web: opening any project page, editing a scene, saving, and reloading goes through `/v1/*` exclusively. 50-MB project round-trip < 5 s on cable. | Grep + manual + Sentry transaction trace. |
| 9 | Reel-to-Editor handoff: launching the editor from a saved reel-builder project (current IDB blob path) succeeds via `/v1/projects/import-reel/:id` (or token equivalent). The IDB-blob handoff code at `js/20-reels-creator.js:5796–5839` + `index.html:4782–4800` is **deleted**, not commented. | E2E test + grep on `stori_db` returns 0 hits in those line ranges. |
| 10 | Schema-design spike (**7 days** in revision 3 — was 3) artifact saved at `devDoc-migration/03-schema-spike.md` documenting which `js/27-canvas-state.js` and audit-flagged source-file fields became columns, which became JSONB, the answers to the two spike-deferred questions (`reel_projects` unification + `reference_library` RLS shape), and why. | PR review. |
| 11 | ADR-01 (expanded with 5 new tables), ADR-03 (now covering the reel-import endpoint shape), ADR-06, ADR-07 all written before this phase exits. | ADR files exist at `/Users/praveen/Desktop/stori/migration-adr-NN-*.md`. |

---

## 3. Architecture

```
┌────────────────────────────────────────────┐
│ Browser                                     │
│  js/15-project.js                           │
│  ├─ saveProject() → callApi('PUT /v1/projects/:id')
│  ├─ loadProject() → callApi('GET /v1/projects/:id')
│  └─ binary uploads:                         │
│     1. callApi('POST /v1/projects/:id/r2-presign', {intent})
│     2. fetch(put_url, body)  ← direct R2 PUT (per ADR-07)
└──────────────┬──────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────┐
│ Cloud Run Hono service                      │
│  /v1/projects (CRUD + presign)              │
│   ├─ verifyUser middleware (from P02)       │
│   ├─ project-state model (Drizzle/Knex/raw) │
│   ├─ active-flag invariant enforcement      │
│   ├─ mode-lock 409 enforcement              │
│   └─ R2 SDK presign helpers                 │
└────────┬──────────────────┬─────────────────┘
         │                  │
         ▼                  ▼
   ┌──────────┐         ┌──────────┐
   │ Supabase  │         │ R2       │
   │ Postgres  │         │ bucket   │
   │  + RLS    │         └──────────┘
   └──────────┘
```

**Why this shape:**
- The schema is derived from code, not from spec. `js/27-canvas-state.js` is the only correct reference; `redesign-plan.md` and the user-brief schema sketch are summaries with subtle drift (e.g., the brief mentions only `storyboardInstances` / `imageInstances` / `videoInstances` and misses `bible_ref_ids`, `front_role`, `is_render_active`).
- Every binary field (`refImageDataUrl`, `imgDataUrl`, video `clips[].url`) becomes an R2 key string. The browser uploads to R2 via presigned PUT (ADR-07's recommended path) so we don't pay Cloud Run egress and don't add latency to image uploads.
- Active-flag invariants live in two places: (a) the SQL constraints catch bad writes, (b) the server normalizes ambiguous states on read mirror of `normalizeSceneFlags`. This is the same belt-and-suspenders the client uses today.

---

## 4. Technology selection

| Concern | Choice | Rationale | Alternatives |
|---------|--------|-----------|--------------|
| API contract format | **TBD ADR-03** — recommend OpenAPI 3.1 YAML | Mobile-future requirement (override O8 + revision-2 mobile-future constraint) — Dart/Flutter codegen from OpenAPI is mature; tRPC requires TS clients. | tRPC: rejected for mobile-future reason. JSON Schema-only: rejected (no client codegen story). |
| ORM / query builder | **Drizzle** (recommend) | TS types from schema; cheap migrations; works with Postgres + RLS. | Knex (no types); Prisma (heavy + slow on Cloud Run cold start); raw SQL (works but more error-prone for active-flag invariants). |
| Migration tool | **Supabase migrations** (`supabase/migrations/*.sql`) + Drizzle migration generator | Supabase tool integrates RLS policy diffs; Drizzle generates the SQL. | Atlas: viable; extra vendor. |
| Optimistic concurrency | **`updated_at` epoch ms with `if-match`-style header** (or a numeric `version` column) | Cheap; works with PUT-as-upsert. Pick one in §5.2. | None; tradeoff is data races on concurrent edits — same client only, so risk is low. |
| Binary upload path | **Direct presigned PUT to R2** (per ADR-07) | Avoids Cloud Run egress + latency for big payloads. | Proxy through Cloud Run: fallback if presign perms get hairy. |
| ID generation | **String IDs from existing pattern** (`sb-<sceneId>-<n>`, `img-<sceneId>-<n>`, `vid-<sceneId>-<n>`) per `js/27-canvas-state.js:33-38` | Preserves existing client-generated IDs; deterministic; debuggable. | UUID: would force a client refactor; not worth it. |

---

## 5. Work breakdown

### 5.1 Schema-design spike (**7 days** — revision-3 expansion to cover 5 new tables + reel-import semantics; blocks everything else)
- [ ] Read `js/27-canvas-state.js` end-to-end. Enumerate every field in `scene`, `storyboardInstance`, `imageInstance`, `videoInstance`. Take note of:
  - Top-level scene fields: `id`, `prompt`, `imgDataUrl` (mirror — kept for back-compat), `videoUrl` (mirror), `videoClips` (mirror), `duration`, `frontRole`, `bibleRefIds[]`, `bibleVersionUsed`, `bibleStale`, `performance` (used at line 373 — `{ tone, gesture }`), `status` (mirror).
  - Storyboard fields: `id`, `prompt`, `refImageDataUrl`, `isActive`, `canvasPosition`, `createdAt`, `imageInstances[]`.
  - Image fields: `id`, `parentStoryboardId`, `style`, `styleOverridden`, `imgDataUrl`, `status`, `error`, `isActive`, `isRenderActive`, `canvasPosition`, `promptOverride`, `generationContext`, `createdAt`.
  - Video fields: `id`, `sourceImageInstanceId`, `motionPrompt`, `duration`, `clips`, `status`, `error`, `taskId`, `isActive`, `isRenderActive`, `role`, `canvasPosition`, `createdAt`.
- [ ] Write `devDoc-migration/03-schema-spike.md` mapping each JS field to a SQL column or JSONB key, with rationale (column = queried/indexed; JSONB = blob).
- [ ] Identify which fields are server-derived (e.g., `mode_locked_at`) vs. client-mirror (e.g., scene's `imgDataUrl` mirror — does NOT need a column, can be derived on read).
- [ ] **Decision points** that go into ADR-01:
  - Active-flag enforcement: check constraint vs trigger vs application-level normalize?
  - `clips` storage: JSONB vs separate `video_clip` table? (Recommend JSONB — clips are always read with their parent video).
  - `canvas_position`: JSONB vs separate `{x, y}` columns? (Recommend JSONB — only the canvas UI reads it).
  - Soft-delete model on `projects` only, or also on instance trees? (Recommend projects only — child trees are owned by the project).
- [ ] **Done when:** every field in `js/27-canvas-state.js` has a home in the SQL schema (column or JSONB), no orphans.

**Revision-3 additions (4 extra days, the reason the spike grew from 3 → 7):**
- [ ] Read `js/20-reels-creator.js:4363–4481, 5477–5515` to enumerate every field on a saved reel-builder project. Decide: **unified `projects` table with `project_kind` discriminator** vs **separate `reel_projects` table**. Default lean: separate (cleaner FK semantics for `audio_r2_key` + `results jsonb`); unify only if the spike surfaces ≥ 80% column overlap with `projects`. **Record decision in ADR-01.**
- [ ] Read `js/20-reels-creator.js:5796–5839` and `index.html:4782–4800` to understand the handoff blob shape. Pick reel-import endpoint shape (Option A vs B in §1 item 6a). **Record decision in ADR-03.**
- [ ] Read `js/17b-create-references.js:683–760` (cast images IDB) — enumerate fields. Map each to `cast_references` columns or JSONB. Decide whether `entity_kind` is an enum vs free text.
- [ ] Read `js/17b-create-references.js:4730–4785` (`stori_ref_library_v1`). Decide RLS shape: **strictly per-user** (default for this cycle) vs team-shareable (deferred). Record the closed-question rationale in ADR-01.
- [ ] Read `js/32-audio-input.js:16–56` and `js/33-audio-rehearsal.js:30–71` — enumerate fields. Most go to columns; raw audio bytes go to R2 via the `audio-input` / `audio-rehearsal` presign intents.
- [ ] **Spike-deferred questions** (closed by the end of §5.1, recorded in ADR-01 / ADR-03):
  1. `reel_projects` unified or separate? → ADR-01.
  2. `reference_library` per-user or team-shareable? → ADR-01 (closed: per-user-only for this cycle).
  3. Reel-import endpoint shape (Option A materialize vs Option B token)? → ADR-03 (default A).
- [ ] **Done when (revision-3 update):** every field in `js/27-canvas-state.js` AND in the 5 audit-flagged source files has a home in the SQL schema (column or JSONB), no orphans, and the 3 spike-deferred questions have ADR-recorded answers.

### 5.2 Migration files + RLS (2 days — revision 3, was 1; 10 tables now)
- [ ] Author `infra/supabase/migrations/0002_projects.sql` with the **5 original tables** + `infra/supabase/migrations/0003_extended_persistence.sql` with the **5 audit-flagged tables** (`reel_projects`-or-unified, `cast_references`, `reference_library`, `audio_inputs`, `audio_rehearsals`). FKs, indexes, RLS policies. Forward-only. Use `text` PKs for instance IDs (consistent with `js/27-canvas-state.js` ID generation pattern).
- [ ] Add active-flag enforcement per the spike conclusion (constraint or trigger).
- [ ] Apply locally with `supabase db reset`; verify with `\d+`.

### 5.3 ORM model + invariant tests (2 days)
- [ ] Set up Drizzle schema mirroring the SQL.
- [ ] Write a `projects.repository.ts` with `getProject(id, userId)`, `upsertProject(...)`, `softDelete(...)`, `presignR2(...)`.
- [ ] Write 20+ unit tests covering active-flag invariants (single radio, multi-select, etc) and mode-lock enforcement.

### 5.4 API contract artifact (1 day, after ADR-03)
- [ ] Wait for ADR-03 (decided early in this phase). Then author the contract artifact.
- [ ] Render it to a hosted spec page (Stoplight Studio free tier or Swagger UI from a static HTML file).
- [ ] Document the URL in `infra/README.md`.

### 5.5 Hono routes (5 days — revision 3, was 3; ~13 endpoints now)
- [ ] `POST /v1/projects` — create. Validates body against the contract.
- [ ] `GET /v1/projects` — list (user-scoped via RLS).
- [ ] `GET /v1/projects/:id` — fetch with embedded scenes + instances.
- [ ] `PUT /v1/projects/:id` — upsert with optimistic concurrency check.
- [ ] `DELETE /v1/projects/:id` — soft-delete.
- [ ] `POST /v1/projects/:id/r2-presign` — presign for **6 intents**: `storyboard-ref | image | video-clip | audio-input | audio-rehearsal | cast-reference`.
- [ ] **`POST /v1/projects/import-reel/:reel_project_id`** (revision-3 NEW) — materializes a saved reel-builder project into a new editor project; returns the new project id. Replaces `js/20-reels-creator.js:5796–5839` + `index.html:4782–4800` IDB handoff.
- [ ] **`GET|POST|DELETE /v1/cast-references`** (revision-3 NEW) — scoped by `entity_kind`+`entity_id`. Replaces `js/17b-create-references.js:683–760` IDB.
- [ ] **`GET|POST|DELETE /v1/reference-library`** (revision-3 NEW) — capped at 30 entries; oldest auto-evicted server-side. Replaces `js/17b-create-references.js:4730–4785` localStorage.
- [ ] **`GET|POST /v1/audio-inputs` and `GET|POST /v1/audio-rehearsals`** (revision-3 NEW) — R2 keys + metadata; binaries via the presign endpoint.
- [ ] **`GET|POST /v1/reel-projects`** (revision-3 NEW, conditional) — only if ADR-01 picks "separate `reel_projects` table"; if unified into `projects`, this is just a list-filtered view.
- [ ] Every route uses `verifyUser` middleware (from Phase 02).
- [ ] Mode-lock check on PUT path returns 409 if `video_mode` is mutated post-`mode_locked_at`.
- [ ] Error model standardized: `{ error: { code, message } }` (per ADR-03). Never leak server internals.

### 5.5a `vercel.json` `/v1/*` rewrites (0.5 day)
- [ ] Update `vercel.json` `rewrites` array with entries for **Vercel-Function-hosted** `/v1/*` paths (short calls only; finalized in ADR-03 — likely `/v1/me`, `/v1/brainstorm/chat`, `/v1/brainstorm/classify`, `/v1/parse-input`).
- [ ] Cloud Run-hosted `/v1/*` paths (`/v1/jobs/*`, `/v1/projects/*`, `/v1/audio/*`, etc.) **NOT in `vercel.json`** — those reach Cloud Run via direct URL or a path-prefix proxy (decision recorded in ADR-03).
- [ ] Verify with `curl https://<vercel-prod>/v1/me` returning the expected handler.

### 5.6 Web client cutover (5 days — revision 3, was 3; 6 IDB sites now)
- [ ] In `js/15-project.js` (lines 16, 361), replace the IndexedDB save/load helpers with `callApi(...)`. Keep IDB function names for now (`saveProjectToDb` etc) but wire them to the API. Phase 07 will rename + delete the IDB layer entirely.
- [ ] In `js/20-reels-creator.js` (lines 4363–4481, 5477–5515, 5799, 5814), replace the `stori_db` IDB writes with `callApi('/v1/reel-projects')` (or unified `/v1/projects` with `kind=reel`). Replace the handoff IDB blob (5796–5839) + `index.html:4782–4800` with `callApi('/v1/projects/import-reel/:id')`.
- [ ] In `js/17b-create-references.js` (line 699), replace the `stori_cast_images_v1` IDB with `callApi('/v1/cast-references')`. Replace the `stori_ref_library_v1` localStorage at lines 4730–4785 with `callApi('/v1/reference-library')`.
- [ ] In `js/32-audio-input.js` (line 22, range 16–56), replace IDB with `callApi('/v1/audio-inputs')` + R2 presign for binaries.
- [ ] In `js/33-audio-rehearsal.js` (line 37, range 30–71), replace IDB with `callApi('/v1/audio-rehearsals')` + R2 presign.
- [ ] Replace base64 `refImageDataUrl` and `imgDataUrl` storage with R2 keys: when the user uploads a reference image, hit `/r2-presign`, PUT the file to R2, store the returned `key` in the project. On read, the API returns the `key`; client converts to a GET-presigned URL for display.
- [ ] **Grep gate before phase exit:** `grep -rn 'indexedDB\.open' js/ index.html` returns 0 hits across the 5 audit-flagged JS files (`15-project.js`, `20-reels-creator.js`, `17b-create-references.js`, `32-audio-input.js`, `33-audio-rehearsal.js`) **AND `index.html`** (line 4787 `stori_db` site must be replaced). Any remaining IDB code must be a deliberate offline-mode escape hatch documented in `infra/README.md`.
- [ ] Verify a 50-MB project round-trips create → save → reload → render in <5s on cable. If it doesn't, profile (likely candidate: too many synchronous R2 GET-presigns during render — pre-batch them).

### 5.7 ADR finalization (parallel — 0.5 day each)
- [ ] **ADR-01** (project state model) — drafted at start of §5.1; finalized at end of §5.2.
- [ ] **ADR-03** (API contract) — drafted before §5.4; finalized at §5.5.
- [ ] **ADR-06** (mode-lock invariant) — drafted before §5.5 (PUT path); finalized when integration test passes.
- [ ] **ADR-07** (R2 storage strategy) — drafted before §5.5 (presign endpoint); finalized after §5.6.

### 5.8 Documentation + sign-off (0.5 day)
- [ ] Update `infra/README.md` with the contract URL + schema overview.
- [ ] Open tracking issue "Phase 03 done" with the 11 exit criteria.

**Estimated total (revision 3):** ~22 working days (was 14); calendar **6–9 weeks** (was 4–6) because the schema spike grew 3 → 7 days, the migration files grew 1 → 2 days, the routes grew 3 → 5 days, and the web cutover grew 3 → 5 days to cover the 5 new tables + 5 new IDB call sites surfaced in the audit.

---

## 6. Acceptance & test plan

### Smoke checklist
1. Create a project via Web UI → reload → project still there.
2. Direct DB read with another user's JWT returns 0 rows (RLS works).
3. `curl -X PUT .../v1/projects/<id>` flipping `video_mode` after launch returns 409.
4. R2 presign → PUT 5-MB file → GET → bytes match.
5. 50-MB project round-trip < 5 s.
6. OpenAPI / tRPC spec page renders.
7. All integration tests green in CI.

### Manual verification (post-impl)
- [ ] **Engineer:** dogfood — create 5 projects with varying scenes/instances; confirm UI parity with pre-migration state.
- [ ] **Founder:** confirm the API contract URL and mark it as the canonical reference for the future mobile cycle.

---

## 7. Dependencies

### Predecessors
- **Phase 02** for `verifyUser` middleware + `users` table FK target.

### Successors
- **Phase 05** consumes `/v1/projects/:id/launch` (which lives in P05, not here) and the `projects` + instance tables to write its outputs.
- **Phase 06** consumes the canvas-state schema (validation gates move server-side).
- **Phase 07** deletes the IndexedDB code paths.
- **Future mobile cycle** consumes the `/v1/*` API contract.

### Files this phase touches
- New: `infra/supabase/migrations/0002_projects.sql` (5 original tables), `infra/supabase/migrations/0003_extended_persistence.sql` (5 audit-flagged tables — revision 3), `infra/cloud-run/routes/{projects,cast-references,reference-library,audio-inputs,audio-rehearsals,reel-projects}.js`, `infra/cloud-run/repository/{projects,cast-references,reference-library,audio-inputs,audio-rehearsals}.js`, `infra/api-contract/v1.yaml` (or tRPC dir), `devDoc-migration/03-schema-spike.md`, ADRs 01, 03, 06, 07.
- Modified: `js/15-project.js` (save/load helpers — NOT the auth-stub block, that was deleted in Phase 02), **`js/20-reels-creator.js` (reel-projects + handoff)**, **`js/17b-create-references.js` (cast + library)**, **`js/32-audio-input.js`**, **`js/33-audio-rehearsal.js`**, `index.html` (only the `stori_db` reel-handoff `indexedDB.open` block at line 4787, lines 4782–4800), `infra/cloud-run/index.js` (mount routes), **`vercel.json` (rewrites for Vercel-hosted `/v1/*` short-call paths only — see §5.5a)**.
- Forbidden: any other `js/` file. Pipeline endpoints belong to Phase 05+06.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Schema misses a load-bearing field from `js/27-canvas-state.js` | M | H | The schema-design spike is dedicated 3 days; engineer must enumerate fields exhaustively, not by sampling. Code review for the spike doc by the founder before §5.2 starts. |
| Active-flag invariant enforcement is too strict and breaks normal client flows | M | M | Mirror the JS `normalizeSceneFlags` exactly: don't reject — *normalize*. Keep enforcement as triggers, not check constraints, so the server fixes ambiguous writes silently the way the client does today. |
| Mode-lock 409 fires on legitimate flows (e.g., draft project that hasn't launched yet) | L | M | `mode_locked_at` is null until the explicit launch action; the check is `if mode_locked_at IS NOT NULL AND new.video_mode != old.video_mode then 409`. Integration test covers both cases. |
| R2 presign URL signing fails in browser due to CORS on the bucket | M | M | Configure R2 bucket CORS rule to allow PUT from the production domain (and dev domain). Document in `infra/r2/README.md`. ADR-07 calls this out. |
| 50-MB round-trip is slower than 5 s | M | M | If the project body is JSON-only with R2 keys, 50 MB is mostly text — should be fast. If it's slow, profile (likely candidate: API serializes scenes one by one without streaming). |
| OpenAPI vs tRPC choice in ADR-03 has a long tail of consequences | L | H | ADR-03 is decided early; founder reviews. Default lean: OpenAPI (mobile-future requirement). Switching after Phase 03 is expensive — get this right the first time. |
| Soft-delete leaves orphaned R2 objects (no lifecycle rule yet) | L | L | ADR-07 includes a lifecycle rule scaffold; actual cleanup ships in Phase 08. |

---

## 9. Open questions

1. **OpenAPI 3.1 vs tRPC** — [non-blocking but must be answered inside this phase before §5.4]. ADR-03. Default: OpenAPI.
2. **Drizzle vs Knex vs raw SQL** — [non-blocking — pick Drizzle, finalize in §5.3].
3. **`canvas_position` storage — JSONB or separate `x, y` columns?** [non-blocking — JSONB; only the canvas UI reads it]. Recorded in ADR-01.
4. **Optimistic concurrency: `updated_at` epoch vs explicit `version` int?** [non-blocking — pick `updated_at` (simpler); upgrade to `version` if races appear]. Recorded in ADR-01.
5. **Should `scenes` be a separate table, or JSONB on `projects`?** [non-blocking — separate table; scenes are queried independently for canvas validation in P06]. Recorded in ADR-01.
6. **R2 CORS configuration — what origins to allow?** [**blocking** at end of phase]. Production domain (already known by Phase 02 exit) + dev/staging origins.
7. ~~**Hono request body size limit on Cloud Run** — default 1 MB will reject 50-MB projects. Set to ~100 MB explicitly, then verify Cloud Run accepts it.~~ **RESOLVED 2026-05-06: not needed.** Cloud Run hard-caps HTTP/1 request bodies at 32 MB platform-side — cannot be raised regardless of Hono config. Large binaries (images, audio, video clips up to 200 MB per ADR-07) **bypass Cloud Run entirely** via R2 presigned PUT URLs (browser → R2 directly). Only project metadata (JSON with R2 keys, not embedded base64) flows through Cloud Run, and that is well under 1 MB per request. Hono body limit can stay at default. The "50-MB project" acceptance test refers to total project size including R2-bound binaries; the JSON metadata round-trip is small.

---

## 10. Cross-cutting decisions raised by this phase

| Decision | Phases affected | ADR ref |
|----------|-----------------|---------|
| Project state model — Postgres schema, active-flag invariants, R2 binary key references | 03, 04, 05 | **ADR-01** |
| API contract — OpenAPI vs tRPC, versioning, error model, mobile-future accommodation | 03, 05, 06, 07 | **ADR-03** |
| Mode-lock invariant (`videoMode` immutable after Launch Agents, 409 on post-launch mutation) | 03, 05, 06 | **ADR-06** |
| File storage — R2 presigned PUT/GET vs proxy, lifecycle, CDN, public-vs-signed reads | 01, 03, 05, 06 | **ADR-07** |
| Long-running job pattern (status table, polling vs Realtime, idempotency) | 01, 05, 06, 08 | **ADR-02** (decided in P05 but the `status` column shape on `image_instances` and `video_instances` here is consistent with it) |

---

## 11. Links

- Phase index: `/Users/praveen/Desktop/stori/migration-plan.md`
- Predecessor: `/Users/praveen/Desktop/stori/migration-phase-02-auth-migration.md`
- Successor: `/Users/praveen/Desktop/stori/migration-phase-04-module-split.md`
- Source code (authoritative for schema): `/Users/praveen/Desktop/stori/js/27-canvas-state.js` (616 lines)
- Source spec: `/Users/praveen/Desktop/stori/migration-details.md` §Architecture L13–22 (V2 promoted to V1 per O1), §New Files §Backend L118–173 (Stripe rows excluded), §Phase 4 L330–335 (V2 → V1 per O1)
- Coverage matrix: rows 5 (schema, billing-stripped), 6 (proxy/project endpoints), 11 (security non-negotiables 1, 2, 5, 6 only)
- ADRs: `migration-adr-01-project-state-model.md`, `migration-adr-03-api-contract.md`, `migration-adr-06-mode-lock-invariant.md`, `migration-adr-07-file-storage-strategy.md`

*End of Phase 03 dev doc.*
