# Phase 01 — Backend Foundations (Supabase + Cloud Run + R2 + Sentry + Repo Bootstrap)

> **Status:** ready-to-execute. **Audience:** solo founder + 1–2 engineers. **Duration:** M (4–6 working weeks). **Revision-3:** added §5.8 bootstrap sub-track.
> **Goal in one line:** stand up the four infra pillars and prove a round-trip from each, with nothing else attached.
> **Source:** `/Users/praveen/Desktop/stori/migration-plan.md` Part 2 row 01; coverage matrix rows 3, 4, [OVERRIDES] O3–O7, O10, O14.

---

## 1. Scope

### In scope
1. **Supabase project** created. Empty `users` table (id uuid pk references `auth.users`, email text, created_at timestamptz). RLS enabled with `users_own` policy `auth.uid() = id`. No other tables — schema work for projects/instances belongs to Phase 03.
2. **Cloud Run service** deployed. One Hono app exposing `/v1/health` returning `{ ok: true, revision: <git-sha>, ts }`. Reachable from a public URL. Cold-start measured + recorded as a baseline number (informational only — not a SLO yet).
3. **Cloudflare R2 bucket** created. One smoke-test script in the repo (`scripts/smoke-r2.mjs`) does a presigned PUT then a presigned GET round-trip on a 1-KB blob. Bucket lifecycle rule scaffold in place (no rules attached yet — actual rules ship with ADR-07 in Phase 03).
4. **Sentry** wired to two destinations: web (browser SDK on a temporary `index.html` smoke page) and Cloud Run (Node SDK in the Hono app). Deliberately throw → event visible in the Sentry UI within 60s for both sources. DSNs stored as Cloud Run + Vercel env secrets, never in code.
5. **CI pipeline** (GitHub Actions) running `lint + typecheck + test` on a sample PR against `main`. Branch protection on `main` requires CI green. No deployment automation yet — that ships with ADR-04 in Phase 07.
6. **Env-var matrix** documented in `infra/README.md`: which secrets live where (Cloud Run env, Vercel env, GitHub Actions secret, never-in-browser list).
7. **Vendor-pricing reality check.** Confirm Vercel Pro $20/mo + Cloud Run cold-start cost band + R2 zero-egress claim against vendor pricing pages on the day of phase kickoff. Note dates in `infra/README.md`.

### Explicitly out of scope (defer to later phases)
- **Auth flow** (Google OAuth, magic link, JWT verification on `/v1/*`) → Phase 02.
- **Project / instance schema** and any `/v1/projects/*` endpoint → Phase 03.
- **Pipeline endpoints** (Gemini proxies, Kling, AutoPilot jobs) → Phases 05 + 06.
- **Feature-flag tooling vendor choice** (LaunchDarkly vs Supabase config vs ConfigCat) → ADR-04, decided as part of Phase 07.
- **Canary 5/50/100 traffic-shift automation** → ADR-04; first real drill happens in Phase 05, production drill in Phase 08.
- **R2 lifecycle policies** (cold storage, retention, public-vs-signed-read) → ADR-07; final values ship with Phase 03.
- **Billing, Stripe, quota, subscription plans, dollar-cost UI** → out-of-cycle (override O15).
- **Mobile / Flutter / Sentry Flutter SDK** → future mobile cycle (override revision 2).

---

## 2. Goal & exit criteria

| # | Exit criterion | How verified |
|---|----------------|--------------|
| 1 | Supabase project provisioned; `users` table exists with `users_own` RLS policy attached. | `psql` query against the project; `supabase db lint` green. |
| 2 | Cloud Run service deployed; `curl https://<service>.run.app/v1/health` returns `{ ok: true, revision, ts }` from any public network. | Manual curl from two networks (laptop + phone tether). |
| 3 | R2 bucket created; smoke-test script PUTs and GETs a 1-KB blob via presigned URLs. | `node scripts/smoke-r2.mjs` exits 0 and prints both URLs. |
| 4 | Sentry: a deliberate `throw new Error('smoke-test-cloud-run')` from `/v1/sentry-smoke` produces a Sentry event grouped under that fingerprint within 60s. Same for `index.html` smoke page (window.onerror path). | Visual check in Sentry UI; screenshot pasted into `infra/README.md`. |
| 5 | CI green on a sample PR running `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` (smoke-only Playwright at this phase). | GitHub Actions check mark on the sample PR. |
| 6 | `main` branch protected; direct push fails for the founder's user. | One deliberate push attempt rejected. |
| 7 | `infra/README.md` lists every env var, where it lives, and the dated pricing-confirmation footnotes for Vercel Pro + R2 + Cloud Run cold-start. | Code review. |
| 8 | **Repo bootstrap (§5.8)** — root `package.json` + workspaces; Node 22 LTS pinned (`engines.node` + `.nvmrc`); root `tsconfig.json` with project refs into `infra/*`; `vitest.config.ts`; `playwright.config.ts`; `eslint.config.js` (flat); `prettier.config.js`; `pnpm-workspace.yaml`. | `pnpm install --frozen-lockfile` + `pnpm typecheck` + `pnpm lint` all green locally and in CI. |

A phase is **not** complete until every row above is checked. No "we'll come back to it." If a row slips, raise a phase-doc revision before crossing into Phase 02.

---

## 3. Architecture

```
                ┌────────────────────────────────────────────────────────┐
                │  Developer laptop                                       │
                │  - GitHub repo (this repo)                              │
                │  - Sample PR triggers CI                                │
                └────────┬───────────────────────────────────┬───────────┘
                         │                                   │
                  push   ▼                                   ▼ scripts/smoke-r2.mjs
            ┌────────────────────┐                    ┌──────────────┐
            │  GitHub Actions     │                    │  Cloudflare   │
            │  lint+typecheck+test│                    │  R2 bucket    │
            └────────────────────┘                    └──────────────┘
                                                              ▲
                                                  presigned   │
                                                              │
            ┌──────────────────┐         JWT?(no, P02)  ┌────────────┐
            │  Browser          │  ────────────────►   │ Cloud Run   │
            │  index.html       │                       │ Hono /v1/health
            │  (smoke page)     │  ◄────────────────    │ /v1/sentry-smoke
            └──────────────────┘     200 OK             └────────────┘
                  │                                            │
                  │ Sentry browser SDK                         │ Sentry node SDK
                  ▼                                            ▼
            ┌─────────────────────────────────────────────────────┐
            │ Sentry org / two projects: stori-web / stori-cloudrun │
            └─────────────────────────────────────────────────────┘

            ┌────────────────────────────────────────────────────┐
            │ Supabase project (auth + Postgres only — no schema  │
            │ beyond `users` table; project tables ship in P03)   │
            └────────────────────────────────────────────────────┘
```

**Why this shape:**
- Four pillars are mutually independent during stand-up. Bundling them avoids ceremony repetition (account approval, billing alerts, IAM bootstrap).
- The `/v1/*` namespace is established here so Phase 02 doesn't have to retrofit it. `/v1/health` and `/v1/sentry-smoke` are the only routes; everything else returns 404.
- Cloud Run is the sole long-job host; Vercel Functions are reserved for the short-call surface added in Phase 06. Both targets live behind the `/v1/*` namespace via path-based routing in Phase 03 (this phase only ships Cloud Run).
- R2 is provisioned here but not yet wired to any feature path. Lifecycle policies and public-vs-signed reads are decided in ADR-07 once Phase 03 names the actual access patterns.

---

## 4. Technology selection

| Concern | Choice | Rationale | Alternatives considered |
|---------|--------|-----------|-------------------------|
| Auth + Postgres | **Supabase** | Spec mandates (overrides O3, O5 implicit; migration-details L34). Comes with RLS + magic link OAuth out of the box. | Self-hosted Postgres + Lucia: rejected (more infra). |
| Long-job host | **Google Cloud Run** | Spec mandates (override O3); 60-min max comfortably covers Kling polling (3+ min/clip per redesign-plan L146 unanchored claim). | Render, Fly: viable but no spec mandate; staying with mandated stack. |
| Web framework on Cloud Run | **Hono** | User brief recommendation; tiny, fast, edge-and-node compatible. | Express, Fastify: heavier; Elysia: Bun-only. **Note:** unanchored claim #8 — recommendation lacks comparative rationale; we accept it because Hono's footprint is the smallest of the four and the surface is small enough that switching costs are cheap if we change minds in P04. |
| Object storage | **Cloudflare R2** | Spec mandates (override O4); zero-egress claim is the load-bearing reason. | S3: rejected (egress cost); GCS: rejected (egress cost + GCP-only convenience). |
| Error tracking | **Sentry** | Spec mandates (override O5). | Datadog: too heavy for solo founder budget; OpenTelemetry self-host: too much ops. |
| CI | **GitHub Actions** | Repo lives on GitHub already; zero new vendor. | CircleCI, Buildkite: no benefit. |
| Package manager | **pnpm** (recommended) — finalize at kickoff. | Smaller node_modules; better for monorepo if backend gets split out. | npm/yarn: viable; pnpm wins on disk usage. |
| Node version | **Node 22 LTS** | Newest LTS. | Node 20: still supported; 22 ships before our launch window. |

**Open at this phase:** Cloud Run region (`us-central1` vs `us-east1` — cold-start vs proximity to R2 endpoint). See Open Questions §9.

---

## 5. Work breakdown

Roughly ordered by dependency. Items in the same bullet group can run in parallel between two engineers.

### 5.1 Repo scaffolding (0.5 day)
- [ ] Add `infra/` directory with subfolders `cloud-run/`, `supabase/`, `r2/`, `sentry/`, `ci/`.
- [ ] Add `infra/README.md` skeleton with section headers for each pillar.
- [ ] Add `scripts/` with `smoke-r2.mjs` placeholder.

### 5.2 Supabase pillar (1 day)
- [ ] Create Supabase project. Record project ref, anon key, service-role key, JWT secret.
- [ ] Create `users` table per migration-details.md L51–63, **stripped of `plan` / `stripe_customer_id` / `images_limit` / `videos_limit` / `period_*`** (override O15 — billing columns out).
- [ ] Apply RLS: `alter table public.users enable row level security; create policy users_own on public.users for all using (auth.uid() = id);`.
- [ ] Document SQL migration file at `infra/supabase/0001_users.sql`. Forward-only per override O9.
- [ ] Document service-role key handling: never imported into any `js/` frontend file (security non-negotiable #6, migration-details L291–292).

### 5.3 Cloud Run pillar (1.5 days)
- [ ] Create GCP project + billing alert ($50/mo soft alert, $200 hard).
- [ ] Decide region: see §9 open question. Default to `us-central1` until we have data.
- [ ] Scaffold `infra/cloud-run/` Node service: Hono app, `/v1/health`, `/v1/sentry-smoke` (deliberate throw).
- [ ] Dockerfile + `cloudbuild.yaml`. Min-instances = 0 (cost-first). Concurrency = 80 (Hono default).
- [ ] First deploy: manual `gcloud run deploy --source .`. Record cold-start time (informational).
- [ ] Document the deploy command in `infra/cloud-run/README.md`. Deploy automation lives in Phase 07.

### 5.4 R2 pillar (0.5 day)
- [ ] Create R2 bucket `stori-prod` (or `stori-dev` first, then promote).
- [ ] Generate API token scoped to that bucket.
- [ ] Write `scripts/smoke-r2.mjs` using the AWS SDK (R2 is S3-compatible) — presigned PUT, then presigned GET, then assert content matches.
- [ ] Run smoke script; record success in `infra/r2/README.md`. Region note: R2 is auto-region; record what auto-resolved.
- [ ] **Do not** define lifecycle rules yet — defer to ADR-07 / Phase 03.

### 5.5 Sentry pillar (0.5 day)
- [ ] Create Sentry org. Two projects: `stori-web` (browser), `stori-cloudrun` (Node).
- [ ] Add Sentry browser SDK init to a smoke `infra/sentry/web-smoke/index.html` (NOT the production `index.html` — keep this isolated).
- [ ] Add `@sentry/node` to the Hono app. Wrap with `Sentry.setupExpressErrorHandler` equivalent for Hono.
- [ ] Add `/v1/sentry-smoke` route that throws.
- [ ] Hit it; verify event lands in Sentry within 60s. Screenshot into `infra/sentry/README.md`.

### 5.6 CI pillar (1 day)
- [ ] Create `.github/workflows/ci.yml`. Steps: checkout, setup-node@22, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- [ ] Add a placeholder `pnpm test` that runs one trivial assertion (test infrastructure proper ships with first feature in Phase 02 or 03).
- [ ] Configure branch protection on `main`: require CI green, require linear history, no force pushes (override O6).
- [ ] Open a sample PR (e.g. add a comment to a file) to verify the workflow runs. Merge after green.

### 5.7 Documentation + sign-off (0.5 day)
- [ ] Fill out `infra/README.md`: env-var matrix (where each secret lives), dated vendor-pricing notes, exit-criterion checklist with each row checked + dated.
- [ ] Open a tracking issue "Phase 01 done" referencing this doc and listing the 8 exit criteria with check marks.

### 5.8 Repo bootstrap sub-track (3–5 working days, NEW in revision 3)

> **Why this exists:** every later phase (P02 auth E2E test, P03 schema-design spike, P04 module split's `build.js` change, P05+ Cloud Run handlers in TypeScript) silently assumes the monorepo bootstrap is in place. Revision 2 buried it inside §5.6 "CI pillar"; the audit (2026-05-06) flagged that the implicit prereq was costing later phases ~1–2 weeks each in unplanned setup. Revision 3 makes it an explicit P01 sub-track.

> **Scope:** **infra-side only.** Web `js/*.js` stays plain JavaScript bundled by the existing `build.js`. TypeScript lives behind `infra/` workspaces; do **not** convert `js/` to TypeScript in this phase (that would touch every later phase's surface and is out of scope for the migration).

- [ ] **Root `package.json`** with `pnpm` workspaces: `infra/cloud-run`, `infra/api` (Vercel Functions), and a root workspace for web smoke tests. Pin **Node 22 LTS** via `engines.node` and a top-level `.nvmrc` containing `22`.
- [ ] **Root `tsconfig.json`** using TypeScript project references (`composite: true`) into `infra/cloud-run/tsconfig.json` and `infra/api/tsconfig.json`. Each child tsconfig extends a shared `infra/tsconfig.base.json`. Strict mode on (`strict: true`, `noUncheckedIndexedAccess: true`).
- [ ] **`vitest.config.ts`** at repo root (workspaces-aware). Two projects: `infra` (Node env, runs unit + integration tests under `infra/**/*.test.ts`) and `web` (jsdom env, runs `tests/web/**/*.test.js` if/when web tests appear). Add a passing placeholder test in each project so the runner has something to do in CI.
- [ ] **`playwright.config.ts`** at repo root. One project (`web-smoke`) pointing at the static `index.html` served via `pnpm preview`; one project placeholder for E2E auth tests added in Phase 02. Browsers: Chromium only for CI; Firefox + WebKit added in Phase 08 if needed.
- [ ] **`eslint.config.js`** in **flat config** form (ESLint 9+). Rule sets: `@typescript-eslint/recommended` for `infra/**/*.ts`; `eslint:recommended` only for `js/**/*.js` (loose rules — the legacy code is large and we don't want to gate Phase 04 module split on a lint cleanup). Ignore `dist/` and `build/`.
- [ ] **`prettier.config.js`** with default-ish settings (`singleQuote: true`, `trailingComma: 'all'`, `printWidth: 100`). Run prettier on `infra/**/*.{ts,js,json,md}` only — leave `js/*.js` alone (revision 3 user decision: don't risk reformatting the 33-file legacy surface mid-migration).
- [ ] **`pnpm-workspace.yaml`** declaring the workspace globs. Use pnpm (not npm/yarn) for deterministic installs and faster CI cache hits.
- [ ] **`.github/workflows/ci.yml`** updated from §5.6 placeholder to the full pipeline:
  ```yaml
  jobs:
    ci:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v3
        - uses: actions/setup-node@v4
          with: { node-version-file: '.nvmrc', cache: 'pnpm' }
        - run: pnpm install --frozen-lockfile
        - run: pnpm lint
        - run: pnpm typecheck    # tsc -b across project refs
        - run: pnpm test         # vitest run
        - run: pnpm test:e2e     # playwright test --project=web-smoke (smoke only in P01)
  ```
- [ ] Verify `pnpm install` is reproducible (commit `pnpm-lock.yaml`); CI runs all five steps green on the sample PR.
- [ ] Document the bootstrap layout + commands in `infra/README.md` "Bootstrap" section so later phases don't re-derive it.

**Sub-track exit guard:** every command above runs locally **and** in CI on a sample PR. Any failure is fixed before P01 exits.

**Out of scope for §5.8:**
- Converting any `js/*.js` file to TypeScript (would scope-creep into every later phase).
- Building a real test for any feature endpoint (no feature endpoints exist yet).
- Choosing a feature-flag tooling vendor (ADR-04 / Phase 07 territory).

**Estimated total:** ~8.5 working days of dev time (5.5 + 3 for §5.8), stretched to 4–6 calendar weeks for solo founder + 1 engineer because vendor account-approval lead times (R2 bucket creation, GCP billing approval, Cloud Run quota) are intermittent waits, not work.

---

## 6. Acceptance & test plan

### Smoke checklist (must pass before declaring exit)
1. `curl -s https://<cloudrun-url>/v1/health | jq` → `{ ok: true, revision: "<sha>", ts: <num> }`.
2. `psql "$SUPABASE_URL" -c "select count(*) from public.users;"` → returns 0 rows; `select * from pg_policies where tablename='users';` → shows `users_own`.
3. `node scripts/smoke-r2.mjs` → exits 0; prints "PUT ok ... GET ok ... bytes match".
4. Visit smoke `index.html`, click the "throw" button → Sentry web project shows event in <60s.
5. `curl -X POST https://<cloudrun-url>/v1/sentry-smoke` → 500; Sentry cloudrun project shows event in <60s.
6. Sample PR shows CI ✅ on GitHub.
7. `git push --no-verify origin main` (without PR) → rejected by branch protection.

### Manual verification checks (post-impl, surface to user)
- [ ] **Founder:** confirm Vercel Pro $20/mo on a recent invoice; record date in `infra/README.md`.
- [ ] **Founder:** confirm R2 zero-egress on Cloudflare's pricing page on the day of phase exit; paste URL+date into `infra/r2/README.md`.
- [ ] **Engineer 1:** sit on the Cloud Run service for 24h; record cold-start frequency at min-instances=0. Decide whether min-instances=1 is worth the $/month before Phase 02 starts.

---

## 7. Dependencies

### Predecessors
- **None.** This is the first phase.

### Successors
- **Phase 02 (Auth Migration)** consumes the empty `users` table, the deployed Cloud Run service, and the JWT secret env var. No other phase has a hard predecessor on Phase 01 alone — Phases 03–08 inherit the foundations transitively.

### Files this phase touches
- New: `infra/` (whole tree), `scripts/smoke-r2.mjs`, `.github/workflows/ci.yml`.
- Modified: none in `js/`. Editor/UI files explicitly stay untouched per overrides (extraction inventory note).
- The production `index.html` is **not** edited — the Sentry web smoke uses an isolated `infra/sentry/web-smoke/index.html`.

### Files this phase must NOT touch
- Any file in `js/`.
- Production `index.html` (already in repo root).
- `pricing-plan.md`, `redesign-plan.md`, `app/*-mobile-mockup*.html` (out of scope per overrides).
- `migration-details.md` (read-only historical input).

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GCP billing approval / quota delay (Cloud Run) | M | M | Apply for billing/quota on day 1; founder runs the application personally to avoid email chains. Have a backup plan: deploy to Render or Fly behind a feature flag to unblock Phase 02 if Cloud Run is stuck >2 weeks (see ADR-02 alternative-host paragraph). |
| R2 region/auto-region surprises | L | L | Smoke-test script fails fast if presign fails; switching buckets is trivial at this stage. |
| Sentry quota (free tier 5K events/mo) too tight for production | L | L | Note in `infra/sentry/README.md`. Phase 08 will revisit when production traffic exists. |
| Hono recommendation turns out wrong in Phase 05 | L | M | Surface area is just `/v1/health` + `/v1/sentry-smoke` here. Switching frameworks costs <1 day at this scale. Re-evaluate if Phase 05 hits a Hono limitation. |
| Vercel Pro pricing changed since spec was written (unanchored claim #4) | L | L | Verify on day-of pricing check during §5.7. If Vercel Pro is gone or repriced, surface as a phase-doc revision before Phase 05. |
| Min-instances=0 cold-start is too painful for `/v1/health` to be useful | L | L | Min-instances=1 costs ~$5–15/mo at idle. Re-decide at the §6 24h observation. |
| CI flake (pnpm cache, node version mismatch) blocks the team | L | M | Pin Node version in `.nvmrc` AND `actions/setup-node@v4 with: node-version-file: .nvmrc`. |

---

## 9. Open questions

> Marked `[blocking]` if the question must be answered before this phase exits. Otherwise it's a deferred question that will not stop forward motion. **Blocking** ones go into the architect-cycle final handoff report.

1. **Cloud Run region: `us-central1` vs `us-east1`?** [non-blocking — pick `us-central1` provisionally; revisit if R2 latency from `us-east1` is materially better]. R2 is auto-region; latency between auto-region R2 and `us-central1` Cloud Run has not been measured in this codebase.
2. **Min-instances on Cloud Run: 0 or 1?** [non-blocking — start at 0; flip to 1 if cold-start during Phase 02 dev iteration is annoying].
3. ~~**Production domain — is it `https://stori.app` or something else?**~~ **RESOLVED 2026-05-06: production domain is `https://kaatchiai.com`** (apex). Use `https://kaatchiai.com` and `https://www.kaatchiai.com` in CORS allowlist; add `http://localhost:<port>` and Vercel preview domains for dev. R2 custom-domain bucket: `r2.kaatchiai.com`. Status page: `https://kaatchiai.com/status`. The earlier `migration-details.md L260` reference to `stori.app` is obsolete.
4. **Sentry SDK pricing tier — does free 5K events/mo suffice for current dogfood traffic?** [non-blocking]. Will be re-checked in Phase 08.
5. **`vercel.json` config — does this cycle need it at all if Cloud Run hosts the long surface and Vercel only hosts the static web?** [non-blocking]. The `vercel.json` rewrites in migration-details.md L216–231 are a Vercel-Functions-only architecture; with Cloud Run as the long-job host, most of those routes move to Cloud Run. Final shape lives in Phase 03's API contract (ADR-03).
6. **CI test framework choice** (Vitest vs Node:test vs Jest) [non-blocking — pick Vitest unless engineer 1 has a strong preference; finalize when first real test is written in Phase 02 or 03].

---

## 10. Cross-cutting decisions raised by this phase

The following decisions surfaced during scoping have implications across two or more phases. They are NOT decided in this phase doc; they are flagged for ADR capture.

| Decision | Phases affected | ADR ref |
|----------|-----------------|---------|
| Long-running job architecture (Cloud Run worker pattern, status table, polling vs Realtime, idempotency, retry) | 01, 05, 06, 08 | **ADR-02** |
| Trunk-based dev + canary deployment + feature-flag tooling vendor | 01, 07, 08 | **ADR-04** |
| File storage strategy (R2 presigned PUT/GET vs proxy, lifecycle, CDN, public vs signed reads) | 01, 03, 05, 06 | **ADR-07** |
| Observability (Sentry SDK conventions, error grouping, alert thresholds) | 01, 07, 08 | **ADR-08** |

---

## 11. Links

- Phase index: `/Users/praveen/Desktop/stori/migration-plan.md`
- Coverage matrix: `/Users/praveen/Desktop/stori/devDoc-migration/spec-coverage-matrix.md`
- Spec inventory: `/Users/praveen/Desktop/stori/devDoc-migration/.architect/spec-inventory.md`
- Source spec: `/Users/praveen/Desktop/stori/migration-details.md` §Architecture L13–22, §Environment Variables L26–43, §Notes L351–358 (billing rows excluded per O15)
- ADRs (when captured): `/Users/praveen/Desktop/stori/migration-adr-02-long-running-jobs.md`, `…-04-trunk-based-canary.md`, `…-07-file-storage-strategy.md`, `…-08-observability.md`
- Successor phase: `/Users/praveen/Desktop/stori/migration-phase-02-auth-migration.md`

*End of Phase 01 dev doc.*
