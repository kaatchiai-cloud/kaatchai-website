# ADR-03 — API contract (`/v1/*` namespace, OpenAPI, error model)

> **Status:** Proposed (decision finalizes during Phase 03).
> **Date:** 2026-05-05.
> **Affected phases:** 03 (canonical home — endpoint set expanded in revision 3 to cover 5 new persistence tables + reel-import), 05, 06, 07.
> **Author:** architect-cycle (revision 2).

---

## Context

The web client today calls Google Gemini, Kling, and other providers directly. The migration replaces those direct calls with a Stori-owned API. Override O8 mandates a versioned API namespace (`/v1/*`) so old clients never break.

Crucially: **a future mobile cycle (Dart/Flutter) will consume the same API.** No mobile client is built in this migration cycle, but the contract here must accommodate it without forcing a `/v2/*` migration. That means:
- Stable JSON shapes the Dart client can codegen against.
- An auth flow that works with the Supabase Flutter SDK (already supported via Bearer JWT — no changes needed beyond Phase 02's middleware).
- An error model that doesn't leak server internals.
- Versioning policy that defines what's a breaking change.

The contract format choice (OpenAPI YAML vs tRPC schema) is the major decision. tRPC is appealing for TypeScript ergonomics but has no first-class Dart codegen story. OpenAPI works for everyone but loses some TS niceties.

---

## Decision

### Format
**OpenAPI 3.1 YAML**, single source of truth at `infra/api-contract/v1.yaml`. Renders to a hosted spec page (Stoplight Studio or static Swagger UI HTML; pick at Phase 03 §5.4). Both web client (TypeScript) and the future Dart client consume codegen output from this spec.

### Namespace
All endpoints under `/v1/*`. Public (no auth) routes are explicitly enumerated:
- `GET /v1/health`
- `GET /v1/status`
- `GET /v1/flags` (returns flags scoped to caller's IP/origin — flag values, no secrets)
- `POST /v1/sentry-smoke` (deliberate-throw smoke endpoint; production removes or token-locks)

Every other `/v1/*` endpoint requires `Authorization: Bearer <jwt>` (verified per ADR-05).

### Versioning policy
- **`/v1/*` is the stable contract.** Once a field is in a response shape, it stays for the life of `/v1`.
- **Breaking changes ship as `/v2/*` paths**, not as removals from `/v1`. The migration period is at least 90 days from `/v2` ship to `/v1` deprecation announcement.
- **Additive changes are allowed inside `/v1`:** new optional response fields, new optional request fields, new endpoints — all OK.
- **Status code semantics are stable:** 200/201 = success; 400 = client error; 401 = auth; 403 = authorized but forbidden (e.g., RLS); 404 = not found; 409 = state conflict (e.g., mode-lock); 429 = rate limit; 500 = server bug; 502/503 = upstream provider issue.

### Error model
Every non-2xx response returns:
```json
{
  "error": {
    "code": "MODE_LOCKED",
    "message": "Cannot change video_mode after Launch Agents has fired.",
    "request_id": "01J3..."
  }
}
```
- `code` is a stable enum (e.g., `MODE_LOCKED`, `QUOTA_EXCEEDED`, `INVALID_TOKEN`, `UPSTREAM_PROVIDER_ERROR`, `JOB_IDEMPOTENCY_CONFLICT`). Client logic switches on `code`, never on `message`.
- `message` is human-readable, English. Localization is out of scope for this cycle.
- `request_id` is the Sentry/Cloud Run correlation ID — clients log it; founder uses it to trace.

**Server internals (stack traces, SQL errors, file paths) NEVER leak.** Sentry captures the full stack server-side; the client gets only the sanitized payload.

### Auth flow
Mobile-future-friendly:
- Client obtains JWT via Supabase Auth (web: `supabase-js`; future mobile: `supabase_flutter`).
- Client sends `Authorization: Bearer <jwt>` on every request.
- Server verifies via `SUPABASE_JWT_SECRET` (per ADR-05 — direct `jose` verify, no Supabase SDK round-trip).
- 401 on missing/invalid; client re-auths.
- Refresh handled by Supabase SDK transparently.

This matches both the web SDK and the Flutter SDK without per-platform special cases.

### Request/response shapes
- **Always JSON.** No protobuf, no msgpack. Future mobile + observability tooling both prefer JSON.
- **camelCase keys in request and response** — matches both JS and Dart conventions.
- **ISO 8601 timestamps as strings**, NOT epoch numbers. Timezone always `Z` (UTC).
- **Numeric IDs and string IDs both supported** — `id` is `string` in OpenAPI for instance tables (preserves existing `sb-NN`, `img-NN` shape) and `uuid` for project/scene tables.
- **Pagination:** cursor-based, always. `?cursor=<opaque>&limit=<int>` → `{ items: [...], next_cursor: <opaque|null> }`.

### Endpoint inventory in this cycle
Authored across phases; collected here:

| Phase | Endpoint | Method | Notes |
|-------|----------|--------|-------|
| 01 | `/v1/health` | GET | Public. |
| 01 | `/v1/sentry-smoke` | GET/POST | Public; deliberate-throw smoke. Token-lock or remove in P08. |
| 02 | `/v1/me` | GET | Returns auth'd user. |
| 03 | `/v1/projects` | GET, POST | List + create. |
| 03 | `/v1/projects/:id` | GET, PUT, DELETE | Full CRUD. PUT enforces optimistic concurrency + mode-lock 409. |
| 03 | `/v1/projects/:id/r2-presign` | POST | Per `intent: storyboard-ref|image|video-clip|audio-input|audio-rehearsal|cast-reference|bgm` (revision-3: 3 new intents for `audio_inputs`/`audio_rehearsals`/`cast_references` tables). |
| 03 | `/v1/projects/import-reel/:reel_project_id` | POST | **NEW in revision 3.** Replaces the `stori_db` IDB handoff at `js/20-reels-creator.js:5796–5839` + `index.html:4782–4800`. Materializes a `projects` row from a `reel_projects` row atomically. Default endpoint shape (Option A). |
| 03 | `/v1/cast-references` | GET, POST, DELETE | **NEW in revision 3.** Scoped by `entity_kind`+`entity_id`. Replaces `js/17b-create-references.js:683–760` IDB. |
| 03 | `/v1/reference-library` | GET, POST, DELETE | **NEW in revision 3.** Capped at 30 entries; oldest auto-evicted server-side. Replaces `js/17b-create-references.js:4730–4785` localStorage. |
| 03 | `/v1/audio-inputs` | GET, POST | **NEW in revision 3.** R2 keys + metadata; binaries via the presign endpoint. Replaces `js/32-audio-input.js:16–56` IDB. |
| 03 | `/v1/audio-rehearsals` | GET, POST | **NEW in revision 3.** R2 keys + metadata. Replaces `js/33-audio-rehearsal.js:30–71` IDB. |
| 03 | `/v1/reel-projects` | GET, POST, DELETE | **NEW in revision 3, conditional.** Only if ADR-01 spike picks "separate `reel_projects` table"; if unified into `projects` with discriminator, this becomes a list-filtered view of `/v1/projects?kind=reel`. |
| 05 | `/v1/projects/:id/launch` | POST | Sets `mode_locked_at`; enqueues scene-images job. |
| 05 | `/v1/jobs/scene-images` | POST | Enqueue. |
| 05 | `/v1/jobs/animation` | POST | Enqueue (Kling/Veo3). |
| 05 | `/v1/jobs/bgm` | POST | Enqueue (Lyria). |
| 05 | `/v1/jobs/:id` | GET | Status poll. |
| 06 | `/v1/brainstorm/chat` | POST | On Vercel Functions. |
| 06 | `/v1/brainstorm/classify` | POST | On Vercel Functions. |
| 06 | `/v1/parse-input` | POST | On Vercel Functions. |
| 06 | `/v1/projects/:id/canvas/validate` | POST | Returns gate state. |
| 06 | `/v1/projects/:id/canvas/normalize` | POST | Server-side normalize. |
| 06 | `/v1/jobs/photopilot` | POST | Enqueue. |
| 06 | `/v1/jobs/lipsync` | POST | Conditional — see P06 §B.2 spike. |
| 06 | `/v1/audio/upload` | POST | Presign. |
| 06 | `/v1/audio/transcribe` | POST | Enqueue. |
| 06 | `/v1/jobs/voice-rehearsal` | POST | Enqueue (ElevenLabs). |
| 07 | `/v1/flags` | GET | Public. |
| 08 | `/v1/status` | GET | Public; for status.html polling. |

### Hosting split (per O3)
Even though all endpoints share the `/v1/*` namespace, they're hosted on two backends:
- **Vercel Functions** for short calls (< 60 s): brainstorm, parse-input, projects CRUD (small bodies), me, health, status, flags. — wait, projects can be 50 MB; those go to Cloud Run.
- **Cloud Run** for: anything that uploads/downloads project bodies (50 MB), all `/v1/jobs/*`, canvas validate/normalize, r2-presign, launch.

Path-based routing at the edge (Vercel rewrites for short-call paths; Cloud Run for the rest). Final routing config lands in Phase 03 §5.5.

---

## Consequences

### Positive
- OpenAPI is the lingua franca. Web TS client codegen via `openapi-typescript`. Future Dart client codegen via `openapi-generator-cli`.
- Stable error codes let client logic branch cleanly without parsing English messages.
- The mobile-future constraint is baked in — no nasty surprise when the mobile cycle starts.
- Versioning policy means we can evolve the API without ever breaking a deployed client.
- Hosting split per O3 honoured.

### Negative
- OpenAPI hand-authoring is tedious; rejected the temptation to generate-from-code (e.g., from Drizzle schemas) because it tightly couples spec to implementation. Authoring discipline required.
- Keeping the spec and the implementation in sync is a continuous chore. Mitigation: schema validators on every endpoint (e.g., `zod` schemas derived from the OpenAPI types) — drift becomes a CI failure.
- Path-based routing across two backends adds an edge-config touchpoint. Vercel rewrites are configured in `vercel.json`; Cloud Run is the catch-all.

### Neutral
- The "no protobuf, JSON only" choice forecloses a future binary-protocol optimization, but at our scale that's not a real loss.
- camelCase across the board makes the API "JS-like" but Dart developers are comfortable with it (Dart also conventionally camelCases).

---

## Options considered

### Option A — tRPC schema as source of truth
- **Pro:** beautiful TS DX; types flow end-to-end.
- **Con:** no first-class Dart codegen. Future mobile cycle would need a hand-written adapter. Mobile-future constraint is the load-bearing reason this is the wrong choice.
- **Reject.**

### Option B — gRPC + protobuf
- **Pro:** strict types, multi-language codegen, smaller payloads.
- **Con:** browser support is awkward (gRPC-Web proxy required); operational complexity not justified at our scale.
- **Reject.**

### Option C — JSON Schema only (no full OpenAPI)
- **Pro:** simpler; just types.
- **Con:** loses endpoint paths, methods, status codes, examples — those are exactly what mobile codegen needs.
- **Reject.**

### Option D — REST without a contract artifact, just docs
- **Pro:** minimum ceremony.
- **Con:** mobile cycle will hate us; no codegen path.
- **Reject.**

### Option E (chosen) — OpenAPI 3.1 YAML, hand-authored, single source of truth, validators in CI

---

## Affected phases

- **Phase 03** authors the artifact, ships the first batch of endpoints (projects CRUD, presign).
- **Phase 03 (revision 3 expansion)** ships, in addition to the original endpoint batch: `/v1/projects/import-reel/:id`, `/v1/cast-references`, `/v1/reference-library`, `/v1/audio-inputs`, `/v1/audio-rehearsals`, and conditionally `/v1/reel-projects` — all replacing audit-flagged IndexedDB / localStorage call sites.
- **Phase 05** extends with `/v1/jobs/*` and `/launch`.
- **Phase 06** extends with brainstorm, parse-input, canvas, photopilot, audio, voice-rehearsal.
- **Phase 07** ensures every web call site uses the contract; deletes anything that doesn't.
- **Future mobile cycle** consumes the rendered spec page as a constraint, not as a request for changes.

---

## Links

- Phase index: `/Users/praveen/Desktop/stori/migration-plan.md`
- Phase docs: 03 (canonical), 05, 06, 07
- Related ADRs: ADR-05 (auth flow this contract assumes), ADR-06 (mode-lock 409 enforcement returned by this contract), ADR-07 (R2 presign endpoint shape)
- Source spec: `/Users/praveen/Desktop/stori/migration-details.md` §New Files §Backend L118–173 (Stripe rows excluded), §Security Non-Negotiables L248–292 (rows 1, 2, 5, 6)

*End of ADR-03.*
