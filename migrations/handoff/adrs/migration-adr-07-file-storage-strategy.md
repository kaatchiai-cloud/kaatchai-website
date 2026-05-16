# ADR-07 — File storage strategy (Cloudflare R2)

> **Status:** Proposed (finalizes during Phase 03).
> **Date:** 2026-05-05.
> **Affected phases:** 01, 03, 05, 06.
> **Author:** architect-cycle (revision 2).

---

## Context

Override O4 mandates Cloudflare R2 (zero egress fees) for binary storage, replacing the migration-original-spec.md mention of Supabase Storage. Affected binary types:

- Reference images uploaded by the user (`refImageDataUrl` → `ref_image_r2_key`).
- Generated scene images (`imgDataUrl` → `img_r2_key`).
- Generated videos (`clips[].url` → R2 keys).
- BGM audio (`bgm_r2_key`).
- User-uploaded audio (Phase 06 audio pipelines).
- Voice-rehearsal TTS outputs (Phase 06).
- Photopilot source photos (Phase 06).

Decisions: how do clients upload (direct vs proxy)? How do they download (public vs signed)? Lifecycle policies (retention, cold storage)? CDN strategy?

The "presigned URL vs proxy through API" choice is the one that ripples furthest — it affects every file-touching code path on both web and (eventually) mobile.

---

## Decision

### Upload path: direct presigned PUT from browser to R2
**Client flow:**
1. Client calls `POST /v1/projects/:id/r2-presign` with body `{ intent: 'storyboard-ref' | 'image' | 'video-clip' | 'audio' | 'bgm', content_type, content_length }`.
2. Server validates intent + size limit + project ownership; returns `{ key, put_url, get_url, expires_at }`.
3. Client `fetch(put_url, { method: 'PUT', body: file })`.
4. On success, client persists `key` into the project state via the relevant API mutation (e.g., updating an `image_instances` row's `img_r2_key`).

**Why:** Cloud Run egress isn't free of CPU/memory/wall-time even if Cloudflare egress is. Proxying a 50-MB upload through Cloud Run wastes the worker for the duration. Direct PUT skips the worker entirely.

### Download path: presigned GET URLs (short-lived)
- Server returns `key` strings on project read.
- Client requests `GET /v1/projects/:id/r2-presign?key=<key>&intent=download` to mint a 15-min presigned GET URL.
- For batch reads (e.g., loading 30 image keys in a project), expose `POST /v1/projects/:id/r2-presign-batch` with an array.
- Browser uses the presigned URL directly in `<img src>` / `<video src>`.

**Why short-lived (15 min):** balances UX (long enough for the page to load and play) with security (a leaked URL doesn't grant indefinite access). Refresh is implicit on next page load.

### NOT public-read
R2 buckets stay private; reads are always signed. Reasoning:
- Project content is per-user; public reads would defeat RLS-equivalent privacy.
- Zero-customer state today doesn't make this hypothetical.
- If a future use case needs public assets (e.g., a marketing image), use a separate `stori-public` bucket with public-read enabled.

### Bucket layout
**One bucket per env**, key namespacing inside:
- `stori-prod` — production bucket.
- `stori-staging` — staging.
- `stori-dev` — local dev (or use Minio locally — pick at Phase 01 §5.4 kickoff).

Key shape: `{user_id}/{project_id}/{intent}/{instance_id}.{ext}`. Examples:
- `0a9f.../proj-123/image/img-12-0.png`
- `0a9f.../proj-123/video-clip/vid-12-0/00.mp4`
- `0a9f.../proj-123/bgm/proj-123.mp3`
- `0a9f.../proj-123/audio/upload-1715123.wav`

User_id prefix gives us a natural per-user "directory" — useful for delete-user operations and for spotting usage patterns.

### Size limits per intent
Enforced server-side in the presign endpoint:
- `storyboard-ref`: 20 MB.
- `image`: 10 MB (generated images are typically < 2 MB; cap covers margin).
- `video-clip`: 200 MB (Kling outputs typically 50–100 MB per clip).
- `audio`: 50 MB.
- `bgm`: 20 MB (Lyria 60 s output is typically a few MB).

Rejecting before presign means we never mint a URL that R2 might not honour.

### Lifecycle policies
Configured on the R2 bucket(s) directly (Cloudflare R2 supports lifecycle rules):
- Soft-deleted projects: 30 days retention then delete (sweep job in Phase 08 issues `DELETE` against R2 keys after deleting the row).
- No tiered storage in this cycle (R2 doesn't have a "Glacier" tier yet; if it adds one, revisit).
- Versioning: NOT enabled. Override O13 says no compat shims; we don't need version history.

### CDN strategy
**Cloudflare's R2 + custom-domain access already gives CDN-quality edge serving for free.** We don't need a separate CDN layer (Cloudflare is the CDN). Custom domain attached to the bucket: `r2.kaatchiai.com` (resolved 2026-05-06).

For privacy: presigned URLs include the auth signature; the CDN serves the bytes; signature verification happens at R2's edge.

### Bucket CORS
Configured to allow:
- `Origin: <production-domain>` (and `<staging-domain>` and `localhost` for dev).
- Methods: `PUT, GET, HEAD`.
- Headers: `Content-Type, Authorization`.
- Response headers exposed: `ETag`.

CORS is a frequent failure mode at first deploy; Phase 03 §9 OQ #6 lists it as a [blocking] question.

### Orphan cleanup
Soft-deleted projects retain R2 objects for 30 days. A weekly sweep job (Phase 08):
- Finds projects with `deleted_at < now() - 30 days`.
- Issues bulk-delete to R2 keys under that user_id/project_id prefix.
- Hard-deletes the project row.

Orphan objects from failed uploads (presign minted, PUT never completed) are tolerated as cost noise at current scale; can add a "presign log + reaper" pattern later if cost becomes meaningful.

---

## Consequences

### Positive
- Direct PUT/GET avoids Cloud Run as a bottleneck for binary movement.
- Per-user/per-project key prefixes make bulk-delete trivial.
- Short-lived signed URLs are a reasonable default for privacy.
- Cloudflare-native CDN means no extra vendor or config.
- Lifecycle rules + sweep job keep storage cost bounded.

### Negative
- Direct PUT means the server doesn't see the upload bytes — no server-side virus scan, no server-side EXIF strip, no server-side resize. Acceptable at zero-customer state; would need to add a post-upload async pipeline (lambda-on-upload) if abuse becomes a problem.
- Presigned URLs are ephemeral; pages with stale URLs fail until refresh. Mitigation: client refreshes presigns on visibility-change events for long-lived tabs.
- Cloudflare's R2 + custom domain access has subtle edge cases (e.g., zone-level WAF rules can interfere with PUT). Document any quirks in `infra/r2/README.md`.
- Per-user prefix means user_id changes break every key — but Supabase user_ids are immutable, so this is a non-issue.

### Neutral
- Choosing R2 over S3 follows override O4 — egress cost is the load-bearing reason. If future workstream introduces extreme egress patterns (e.g., a public CDN-served asset), that's still served free by R2.

---

## Options considered

### A. Proxy uploads through Cloud Run
- **Pro:** server can scan/transform bytes.
- **Con:** 50-MB upload ties up a Cloud Run worker for the duration; latency added.
- **Reject:** scan/transform isn't needed yet.

### B. Public-read bucket
- **Pro:** simpler download path (no presign needed).
- **Con:** privacy violation; project content shouldn't be publicly readable.
- **Reject.**

### C. Long-lived presigned URLs (e.g., 24 h)
- **Pro:** UX simplicity (no refresh needed).
- **Con:** leaked URL gives 24 h of access.
- **Reject:** 15-min default + on-demand refresh is the right balance.

### D. Per-project bucket
- **Pro:** strong isolation.
- **Con:** Cloudflare R2 has bucket creation overhead and limits; one bucket per env with key-prefix isolation is the standard pattern.
- **Reject.**

### E (chosen) — Direct presigned PUT/GET, 15-min lifetime, per-user/per-project key prefixes, Cloudflare CDN, 30-day soft-delete retention

---

## Affected phases

- **Phase 01** creates the bucket and runs the smoke test. Lifecycle rules are stubbed but not configured — that's Phase 03 work after the access patterns crystallize.
- **Phase 03** ships the `/v1/projects/:id/r2-presign` endpoint, the schema integration (R2 keys instead of base64 in DB), and the bucket CORS configuration. Lifecycle rules attached.
- **Phase 05** writes scene-image / animation / BGM outputs to R2 from worker handlers.
- **Phase 06** uses the same presign pattern for PhotoPilot, audio, voice-rehearsal outputs.
- **Phase 08** ships the orphan-cleanup sweep job.

---

## Links

- Phase index: `/Users/praveen/Desktop/stori/migrations/migration-plan.md`
- Phase docs: 01, 03 (canonical), 05, 06, 08
- Related ADRs: ADR-01 (schema columns that hold R2 keys), ADR-03 (presign endpoint shape in the API contract)
- Source: override O4 (R2 mandated), inventory Part 4 row 8 (load-bearing decision)

*End of ADR-07.*
