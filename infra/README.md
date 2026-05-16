# Stori Infrastructure — Phase 01

## Overview

Four infra pillars + repo bootstrap, stood up in Phase 01 (Backend Foundations).
No feature endpoints — just health check + Sentry smoke + R2 round-trip proof.

## Directory layout

```
infra/
├── cloud-run/       Hono service (deployed to Google Cloud Run)
│   ├── index.ts      App entry: /v1/health + /v1/sentry-smoke
│   ├── Dockerfile    Node 22 slim image
│   ├── cloudbuild.yaml  Cloud Build config (used in Phase 07 CI/CD)
│   ├── package.json
│   ├── tsconfig.json
│   └── tests/       Placeholder vitest
├── api/             Vercel Functions workspace (placeholder until Phase 06)
│   ├── package.json
│   └── tsconfig.json
├── supabase/        Forward-only SQL migrations
│   └── 0001_users.sql
├── r2/              R2 bucket documentation
├── sentry/          Sentry integration docs + browser smoke page
│   ├── web-smoke/index.html
│   └── README.md
├── tsconfig.base.json  Shared strict TS config
└── README.md        This file
```

## Environment variable matrix

| Variable | Where it lives | Notes |
|----------|----------------|-------|
| `SUPABASE_URL` | Cloud Run env, Vercel env | Project URL |
| `SUPABASE_ANON_KEY` | Cloud Run env, Vercel env, browser JS | Public, safe for client |
| `SUPABASE_SERVICE_ROLE_KEY` | Cloud Run env only | **Never in browser or `js/`** |
| `SUPABASE_JWT_SECRET` | Cloud Run env, Vercel env (secret manager) | For JWT verification |
| `SUPABASE_DB_URL` | Cloud Run env (if server-side DB access needed) | Connection string |
| `GCP_PROJECT_ID` | Cloud Build, CI | GCP project identifier |
| `SENTRY_DSN_WEB` | Vercel env, browser `<script>` | Public browser DSN |
| `SENTRY_DSN_CLOUDRUN` | Cloud Run env | Server-side DSN |
| `R2_ACCOUNT_ID` | Cloud Run env | For S3-compatible API |
| `R2_ACCESS_KEY_ID` | Cloud Run env, CI (smoke test) | Scoped to bucket |
| `R2_SECRET_ACCESS_KEY` | Cloud Run env, CI (smoke test) | Scoped to bucket |
| `R2_BUCKET_NAME` | Cloud Run env | `stori-dev` → `stori-prod` |

## Vendor pricing confirmation

| Vendor | Plan | Price | Date confirmed | Notes |
|--------|------|-------|----------------|-------|
| Vercel | Pro | $20/mo | _fill in_ | Per seat |
| Cloud Run | Pay-per-use | ~$0/mo at idle | _fill in_ | Min-instances=0; $50 alert + $200 hard cap |
| Cloudflare R2 | Free tier → pay | $0.015/GB/mo | _fill in_ | Zero egress |
| Sentry | Free tier | $0/mo (5K events) | _fill in_ | Upgrade if >5K events/mo |

## Exit criteria checklist

| # | Criterion | Verified | Date |
|---|-----------|----------|------|
| 1 | Supabase project created; `users` table + RLS | ☑ | 2026-05-16 |
| 2 | Cloud Run `/v1/health` returns 200 from public URL | ☑ | 2026-05-16 |
| 3 | R2 presigned PUT+GET round-trip succeeds | ☑ | 2026-05-16 |
| 4 | Sentry events visible in both projects | ☐ | verify in dashboard |
| 5 | CI green on sample PR | ☑ | 2026-05-16 |
| 6 | `main` branch protected | ☑ | 2026-05-16 |
| 7 | `infra/README.md` complete with env-var matrix | ☑ | 2026-05-16 |
| 8 | Repo bootstrap: `pnpm install && typecheck && lint && test && test:e2e` all green | ☑ | 2026-05-16 |

## Production domain

- **Apex:** `https://kaatchiai.com`
- **www:** `https://www.kaatchiai.com`
- **R2 custom domain:** `r2.kaatchiai.com`
- **Status page:** `https://kaatchiai.com/status` (Phase 08)
- CORS allowlist: `kaatchiai.com`, `www.kaatchiai.com`, `localhost:*`, Vercel preview domains
