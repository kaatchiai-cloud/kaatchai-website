# ADR-04 — Trunk-based development + canary deployment + feature flags

> **Status:** Proposed (drafted Phase 05, finalized Phase 07).
> **Date:** 2026-05-05.
> **Affected phases:** 01 (CI bootstrap — explicit in revision 3), 05 (first canary drill), 07 (rollback drill, vendor choice), 08 (first real canary).
> **Author:** architect-cycle (revision 2).

---

## Context

Overrides O6, O7, O9, O10 mandate:
- Trunk-based development; small PRs; main always shippable.
- Feature flags wrap every non-trivial feature.
- Forward-only DB migrations (nullable columns; rename-then-drop for breaking schema changes).
- Cloud Run canary deploys: 5% → 50% → 100% revision traffic shift.

Override O11 (mobile phased rollouts) and O12 (remote-flag override for mobile hotfix) are **deferred** to the future mobile cycle. This ADR is web + backend only.

Decisions: branch protection rules, CI checks, feature-flag tooling vendor, canary bake-times, web cutover policy, hotfix flow.

The flag-tooling decision matters because it touches every phase. Three candidates: LaunchDarkly, Supabase config table, ConfigCat. Vendor-pricing matrix not stated in spec (inventory unanchored claim #9).

---

## Decision

### Branch protection on `main`
- All changes via pull request — no direct push.
- Required CI checks: `lint`, `typecheck`, `test`, `e2e` (added in Phase 02).
- Linear history: rebase or squash, no merge commits.
- Force-push disabled.
- One reviewer required for any change to `infra/`, `js/15-project.js`, `js/00-auth.js`, `js/00-api-client.js`, `infra/cloud-run/` routes/middleware. (Solo founder reviews engineer PRs; engineer reviews founder PRs.)
- Stale-branch detection: branches without activity for 14 days get auto-deleted (after warning).

### CI requirements

> **CI bootstrap is explicit in P01 (revision 3).** Phase 01 §5.8 ships the full monorepo bootstrap — root `package.json` workspaces, Node 22 LTS pinning (`engines.node` + `.nvmrc`), root `tsconfig.json` with project refs into `infra/*`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js` (flat), `prettier.config.js`, `pnpm-workspace.yaml`. The CI workflow at `.github/workflows/ci.yml` runs `lint + typecheck + vitest + playwright (smoke)` on a sample PR with branch protection on `main`. Every later phase consumes that bootstrap; this ADR lists the *additions* layered onto it.

- **Web:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` (the latter using a Supabase local stack via `supabase start`). All four commands ship in P01 §5.8 (smoke-only Playwright in P01; expanded E2E suite added in P02 onwards).
- **Cloud Run / Vercel Functions:** the same lint/typecheck/test pipeline (config shared via P01's project refs). Plus a contract-validator step (see ADR-03) that diffs the OpenAPI spec against runtime route signatures.
- **Migration check:** `supabase db lint` on every PR that touches `infra/supabase/migrations/`.
- **Forward-only migration enforcer:** a CI lint that rejects any migration containing `DROP COLUMN` or `DROP TABLE` without an accompanying `-- DEPRECATION:` comment + a follow-up issue link. Honours O9.

### Feature-flag tooling
**Supabase config table.** Schema:
```sql
CREATE TABLE feature_flags (
  id uuid PK,
  name text UNIQUE NOT NULL,
  value jsonb NOT NULL,         -- can be bool, string, or shaped object
  env text NOT NULL,             -- 'dev' | 'staging' | 'prod'
  description text,
  updated_at timestamptz DEFAULT now()
);
```
Read pattern:
- Server: `infra/cloud-run/flags/get.js` reads from DB on boot, refreshes every 60 s. Cache miss → DB hit. (Trivially fast at our scale.)
- Web: `GET /v1/flags?env=prod` returns the flag set for the env at boot; cached in `sessionStorage` for the page session. Forced refresh on `Ctrl+Shift+R`.

**Why Supabase config table over LaunchDarkly / ConfigCat:**
- **Cost:** LaunchDarkly starts at hundreds of dollars/month; ConfigCat free tier is limited. Supabase table is free (column on existing DB).
- **Simplicity:** SQL queryable, version-controllable via migrations.
- **No new vendor:** every additional vendor is a new dashboard, a new bill, a new cred to rotate.
- **Trade-off accepted:** no built-in percentage rollouts (we'd have to implement client-side hashing of `user_id % 100 < pct`). For this cycle the only "rollout" we need is the canary flag (binary: cohort A vs cohort B), and Cloud Run handles real traffic-percentage rollouts at the platform level — flag-side percentage rollouts are not actually needed.

LaunchDarkly remains a future option if percentage rollouts or A/B testing become first-class needs. Switching cost: ~3 days. Recorded.

### Canary policy on Cloud Run
**5% → 50% → 100% with these bake-times:**
- 5% for **30 minutes** (catches obvious 5xx spikes, cold-start regressions).
- 50% for **6 hours** (catches latency regressions, daily-pattern issues, slow leaks).
- 100% **manual promotion** (engineer flips after observing the 50% window — no auto-promote).

Implemented via `gcloud run services update-traffic --to-revisions <new>=5,<prev>=95` and so on. Wrapped in a script at `infra/cloud-run/scripts/canary.sh`.

**Bake-times rationale:** 30 min / 6 h / manual is conservative; tightens with data once Phase 08 has observed real production traffic patterns. Carried as Phase 08 OQ #2.

**Auto-rollback trigger:** if 5xx rate on the canary revision exceeds 2% of requests over a 5-min rolling window during the 5% or 50% bake, an alert fires (Sentry → founder); rollback is one command (`gcloud run services update-traffic --to-revisions <prev>=100`). NOT auto-executed — founder confirms before flipping. Solo-founder context: false-positive auto-rollback is more painful than 5 extra minutes of bad traffic.

### Web cutover policy (Vercel)
Vercel doesn't have a Cloud Run-style traffic-shift primitive (it has Preview deployments, not gradual percentage rollouts of production). Instead:
- Production deploys go to Vercel from `main` automatically.
- **Feature flags carry the rollout** — new web behaviour is gated behind a flag; the flag is flipped off → small cohort → on. Same effect, different mechanism.
- Rollback path: Vercel's "Promote previous deployment" button, or feature-flag flip if the change is flag-gated.
- The Phase 07 rollback drill exercises both paths.

### Hotfix flow
1. Branch from `main` named `hotfix/<short-name>`.
2. Single commit, single PR, expedited review (single approver suffices — solo founder calls).
3. CI must pass; no skipping hooks (--no-verify).
4. Squash-merge to `main`.
5. Cloud Run: deploy with **shorter bake times** (5 min at 5%, 30 min at 50%, then 100%) — explicit deviation from standard canary.
6. Web: feature flag flip if applicable; otherwise Vercel auto-deploy.
7. Post-mortem within 7 days (template at `infra/runbooks/post-mortem-template.md`).

For mobile hotfix path (override O12), defer entirely to the future mobile cycle.

### Migration discipline
- Forward-only per O9.
- Pattern for breaking schema changes:
  1. Add new column nullable; ship.
  2. Backfill from old column over time.
  3. Update reads to prefer new column with fallback.
  4. After deprecation window, drop old column in a separate PR with `-- DEPRECATION:` comment.
- Renames use the rename-then-drop pattern: add new column → dual-write → migrate reads → drop old.

---

## Consequences

### Positive
- Trunk-based + small PRs + CI gates → most regressions caught at PR time, not in production.
- Supabase config table for flags = zero new vendor, ~$0/month.
- Canary 5/50/100 with conservative bake-times catches the common failure modes (cold-start spikes, latency regressions).
- Forward-only migrations honour O9 and prevent the worst class of production accidents.
- Hotfix flow has shorter bake times but the same gates — no "panic mode" that skips review.

### Negative
- Hand-rolled flag system means features that need percentage rollouts have to implement them. Mitigated: at current scale, percentage rollouts aren't a real requirement.
- Manual promotion at 100% means engineer presence required for the full 6.5-hour bake. Acceptable for solo-founder/small-team scale; revisit when team grows.
- No auto-rollback means false positives in the alert can let bad traffic through for a few extra minutes while founder acknowledges. Trade-off accepted.

### Neutral
- The choice to use Cloud Run-native traffic shifts (rather than a service-mesh layer) keeps deploy ops simple. Switching to Istio or similar isn't justified at current scale.

---

## Options considered

### Flag tooling
- **A. LaunchDarkly** — best DX, most expensive. Rejected on cost.
- **B. ConfigCat** — cheaper than LaunchDarkly, still extra vendor. Rejected on simplicity.
- **C. Supabase config table (chosen)** — cheapest, simplest, sufficient.
- **D. Build-time constants only** — too coarse; rebuild required for every flip. Rejected.

### Deploy strategy
- **A. Blue-green** — full duplicate environment; expensive for solo founder. Rejected.
- **B. Canary 5/50/100 (chosen)** — Cloud Run native; inexpensive.
- **C. Direct cutover** — no safety net. Rejected.

### Rollback
- **A. Auto-rollback on metric threshold** — too risky for false positives. Rejected.
- **B. One-command rollback (chosen)** — fast enough, human in the loop.

---

## Affected phases

- **Phase 01** sets up branch protection + the **full CI bootstrap** (root `package.json` workspaces, TypeScript project refs, vitest, playwright, eslint flat config, prettier, pnpm-workspace, `.github/workflows/ci.yml`). Revision 3 elevates this from an implicit prereq to an explicit P01 §5.8 sub-track. Does NOT do canary (drill comes later).
- **Phase 05** runs the first canary drill on a no-op revision; confirms the script works. Drafts this ADR (revision 2 had it drafted in old P04, now P05).
- **Phase 07** finalizes this ADR — picks the flag tooling vendor (Supabase config), defines bake-times, writes the rollback drill.
- **Phase 08** runs the first real canary on a feature-bearing revision.

---

## Links

- Phase index: `/Users/praveen/Desktop/stori/migrations/migration-plan.md`
- Phase docs: 01, 07 (canonical), 07
- Related ADRs: ADR-08 (alerting feeding the rollback decision)
- Source: overrides O6, O7, O9, O10 (O11/O12 deferred to future mobile cycle); inventory unanchored claim #9 (vendor choice), #10 (bake-times)

*End of ADR-04.*
