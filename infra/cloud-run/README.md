# Cloud Run — Stori Backend

## Service details

| Field | Value |
|-------|-------|
| Service name | `stori-backend` |
| Region | `us-central1` (provisional — revisit if R2 latency is better from `us-east1`) |
| Min instances | 0 (cost-first; flip to 1 if cold-start is painful) |
| Max instances | 10 (provisional; raise in Phase 05 if AutoPilot concurrency needs it) |
| Concurrency | 80 (Hono default) |
| Runtime | Node 22 on Cloud Run (managed) |
| Framework | Hono v4 |

## Deploy (manual — Phase 01)

```bash
# Authenticate
gcloud auth login
gcloud config set project <GCP_PROJECT_ID>

# Build + deploy from repo root
gcloud run deploy stori-backend \
  --source infra/cloud-run \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "SENTRY_DSN_CLOUDRUN=<YOUR_DSN>" \
  --port 8080
```

## Cold-start baseline

_(Record at phase exit)_

| Metric | Value |
|--------|-------|
| Cold-start time (first request) | 279ms |
| Region | us-central1 |
| Min-instances | 0 |
| Date measured | 2026-05-16 |

## Routes (Phase 01 only)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/health` | Health check — returns `{ ok, revision, ts }` |
| POST | `/v1/sentry-smoke` | Deliberate throw for Sentry verification |

All other `/v1/*` paths return 404 in this phase. Feature routes ship in Phase 02+.

## Deploy automation

Manual in Phase 01. CI/CD deploy automation ships in Phase 07 (ADR-04).
