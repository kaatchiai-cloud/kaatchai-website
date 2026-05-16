# Phase 01 — Backend Foundations: Agent Task Brief

## Scope
- Stand up Supabase project with `users` table + RLS; no other schema
- Deploy Cloud Run Hono service with `/v1/health` and `/v1/sentry-smoke` routes
- Create R2 bucket with presigned-URL round-trip smoke test
- Wire Sentry to browser smoke page + Cloud Run; verify events land in both projects
- Bootstrap monorepo (pnpm workspaces, TS project refs, vitest, playwright, eslint flat config, prettier, CI)

## Files to create
| File | Action | Purpose |
|---|---|---|
| `infra/README.md` | CREATE | Env-var matrix, dated pricing checks, exit-criterion checklist |
| `infra/supabase/0001_users.sql` | CREATE | Forward-only migration: `users` table + `users_own` RLS policy |
| `infra/cloud-run/index.ts` | CREATE | Hono app: `/v1/health`, `/v1/sentry-smoke` |
| `infra/cloud-run/Dockerfile` | CREATE | Node 22 slim image for Cloud Run deploy |
| `infra/cloud-run/cloudbuild.yaml` | CREATE | Cloud Build config for `gcloud run deploy --source .` |
| `infra/cloud-run/tsconfig.json` | CREATE | Extends `infra/tsconfig.base.json` |
| `infra/cloud-run/README.md` | CREATE | Deploy command, cold-start baseline, region decision |
| `infra/api/tsconfig.json` | CREATE | Vercel Functions workspace (placeholder, extends tsconfig.base) |
| `infra/tsconfig.base.json` | CREATE | Shared strict TS config (`strict`, `noUncheckedIndexedAccess`) |
| `infra/r2/README.md` | CREATE | Bucket name, auto-region result, smoke-test success record |
| `infra/sentry/web-smoke/index.html` | CREATE | Isolated browser smoke page with Sentry SDK + throw button |
| `infra/sentry/README.md` | CREATE | DSN handling, project names, event screenshot placeholders |
| `scripts/smoke-r2.mjs` | CREATE | Presigned PUT then GET on 1-KB blob via AWS S3 SDK (R2-compatible) |
| `root package.json` | CREATE | pnpm workspaces, `engines.node` ≥22, scripts: lint/typecheck/test/test:e2e |
| `root tsconfig.json` | CREATE | Project references into `infra/cloud-run` and `infra/api` |
| `root vitest.config.ts` | CREATE | Two projects: `infra` (Node), `web` (jsdom); placeholder tests |
| `root playwright.config.ts` | CREATE | `web-smoke` project against static index.html; placeholder for P02 auth E2E |
| `root eslint.config.js` | CREATE | Flat config; TS rules for `infra/**/*.ts`, JS rules for `js/**/*.js` |
| `root prettier.config.js` | CREATE | `singleQuote`, `trailingComma: 'all'`, `printWidth: 100` |
| `pnpm-workspace.yaml` | CREATE | Workspace globs for `infra/cloud-run`, `infra/api`, root |
| `.nvmrc` | CREATE | `22` |
| `.github/workflows/ci.yml` | CREATE | checkout → pnpm → node 22 → install → lint → typecheck → test → test:e2e |
| `infra/cloud-run/tests/health.test.ts` | CREATE | Placeholder vitest for Cloud Run workspace |
| `tests/web/placeholder.test.js` | CREATE | Placeholder vitest for web workspace |

## Files to modify
| File | Action | What changes |
|---|---|---|
| `vercel.json` | MODIFY | No changes in this phase — leave as-is |
| `.gitignore` | MODIFY | Add `node_modules/`, `dist/`, `.env*` |

## New infrastructure
- Supabase project: empty project; `users` table (id uuid pk → auth.users, email text, created_at timestamptz); RLS enabled with `users_own` policy `auth.uid() = id`; record project ref + anon key + service-role key + JWT secret
- Cloud Run service: Hono on Node 22; region `us-central1` (provisional); min-instances=0; concurrency=80; routes `/v1/health` + `/v1/sentry-smoke`; record public URL + cold-start baseline
- R2 bucket: `stori-dev` (promote to `stori-prod` later); API token scoped to bucket; no lifecycle rules yet
- Sentry org: two projects `stori-web` (browser SDK) + `stori-cloudrun` (Node SDK); DSNs as env secrets only

## Exit criteria (must ALL pass)
```
# 1. Supabase: users table + RLS
psql "$SUPABASE_URL" -c "select count(*) from public.users;"
# → returns 0 rows
psql "$SUPABASE_URL" -c "select * from pg_policies where tablename='users';"
# → shows users_own policy

# 2. Cloud Run health
curl -s https://<CLOUDRUN_URL>/v1/health | jq
# → { "ok": true, "revision": "<sha>", "ts": <num> }

# 3. R2 round-trip
node scripts/smoke-r2.mjs
# → exits 0; prints "PUT ok ... GET ok ... bytes match"

# 4. Sentry Cloud Run
curl -X POST https://<CLOUDRUN_URL>/v1/sentry-smoke
# → 500; event visible in Sentry stori-cloudrun project within 60s

# 5. Sentry browser (manual: visit infra/sentry/web-smoke/index.html, click throw)
# → event visible in Sentry stori-web project within 60s

# 6. CI green on sample PR
# → GitHub Actions check mark on sample PR

# 7. Branch protection
git push --no-verify origin main
# → rejected

# 8. Repo bootstrap
pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
# → all green locally and in CI
```

## Constraints
- ADR-02 (long-running job architecture): not decided this phase; Cloud Run worker pattern deferred
- ADR-04 (trunk-based dev + canary + feature flags): not decided this phase; deploy automation deferred to P07
- ADR-07 (file storage strategy): R2 lifecycle rules and public-vs-signed reads deferred to P03
- ADR-08 (observability): Sentry SDK conventions deferred; wire minimal integration only
- Forward-only SQL migrations (override O9): no ALTER on 0001_users.sql after apply
- Service-role key: never imported into any `js/` frontend file
- Do NOT touch any file in `js/` or the root `index.html`
- Do NOT convert `js/*.js` to TypeScript — TS lives behind `infra/` only
- Do NOT add R2 lifecycle rules
- Do NOT add auth flow or project/instance schema
- DSNs stored as Cloud Run + Vercel env secrets, never in code
- Production domain: `kaatchiai.com` (not `stori.app`)
- R2 custom domain: `r2.kaatchiai.com`
- Prettier runs on `infra/**/*.{ts,js,json,md}` only — leave `js/*.js` alone

## Dependencies
- None (first phase)

## Key files to read before starting
- `/Users/praveen/Desktop/stori/migrations/migration-phase-01-backend-foundations.md` — full phase spec
- `/Users/praveen/Desktop/stori/vercel.json` — current Vercel config (do not modify this phase)
- `/Users/praveen/Desktop/stori/build.js` — existing build system (understand but don't modify)
- `/Users/praveen/Desktop/stori/api/kling.js` — existing Vercel Function (reference for `infra/api` workspace)
- `/Users/praveen/Desktop/stori/index.html` — production HTML (do NOT modify; Sentry smoke uses isolated copy)
