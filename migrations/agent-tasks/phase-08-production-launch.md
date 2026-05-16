# Phase 08 — Production Launch: Agent Task Brief

## Scope
- Create Sentry dashboards: `stori-web` (top errors by feature, error budget burn rate, p95 transactions) + `stori-cloudrun` (top errors by route, p95 latency, job success rate by type)
- Author on-call runbook (`infra/runbooks/oncall.md`) covering 4 scenarios: auth outage, Cloud Run job stuck, R2 region failure, AI provider rate-limit
- Execute real production canary on feature-bearing Cloud Run revision (5% → 30 min → 50% → 6 h → 100% per ADR-04)
- Deploy static `status.html` at `/status` with `/v1/status` health endpoint polling
- Run mock-incident dry-run (recommend: Cloud Run job stuck scenario); file post-mortem
- Author production-launch readiness checklist
- Vendor-pricing reality check at production scale
- Flip `public_signup = true` for soft launch (single-digit users in first week)

## Files to modify
| File | Action | Verified line range | What changes |
|---|---|---|---|
| `infra/runbooks/oncall.md` | CREATE | — | 4 scenarios: auth outage, job stuck, R2 failure, AI rate-limit. Each: symptoms, diagnosis, mitigation, recovery, comms template |
| `infra/runbooks/post-mortem-template.md` | CREATE | — | Template: what was simulated, runbook steps, what happened, gaps, action items |
| `infra/runbooks/launch-checklist.md` | CREATE | — | Go/no-go checklist: Sentry dashboards, error budget, runbook, mock incident, on-call, DNS, SSL, R2 lifecycle |
| `infra/runbooks/dry-runs/2026-NN-NN-mock-incident.md` | CREATE | — | Post-mortem from mock-incident dry-run |
| `infra/sentry/dashboards.md` | CREATE | — | Dashboard URLs + widget descriptions |
| `status.html` | CREATE | — | Static status page: Auth, API, Jobs, Storage, AI providers lights; recent incidents; planned maintenance |
| `infra/cloud-run/routes/status.js` | CREATE | — | `GET /v1/status` → `{ auth: 'ok', api: 'ok', jobs_p95_ms: <num>, storage: 'ok' }` |
| `infra/cloud-run/runbooks/canary.md` | MODIFY | — | Extend P05 no-op drill log with real revision canary log |
| `infra/README.md` | MODIFY | — | Vendor-pricing footnotes with dated reality check |

## New endpoints
| Method | Path | Replaces | Sync/Async |
|---|---|---|---|
| GET | `/v1/status` | — | Sync (health check for status page) |

## Exit criteria
```
# 1. Sentry web dashboard renders
# → screenshot shows widgets with non-zero data

# 2. Sentry Cloud Run dashboard renders
# → screenshot shows widgets

# 3. On-call runbook checked in
grep -c "auth outage\|Cloud Run job stuck\|R2 region failure\|AI provider rate-limit" infra/runbooks/oncall.md
# → ≥ 4 (one per scenario)

# 4. Production canary executed
grep -c "5%\|50%\|100%" infra/cloud-run/runbooks/canary.md
# → ≥ 3 entries

# 5. Status page deployed
curl -s https://<PRODUCTION>/status | head -5
# → returns HTML

# 6. Mock-incident dry-run done
ls infra/runbooks/dry-runs/
# → at least one mock-incident file

# 7. Launch checklist all-green
grep -c "\[x\]" infra/runbooks/launch-checklist.md
# → all items checked

# 8. Public signup enabled
# → first external sign-up event in Sentry

# 9. Vendor-pricing dated
grep "2026" infra/README.md
# → dated pricing entries
```

## Constraints
- ADR-02 (long jobs): consumed — production worker observed under real load
- ADR-04 (trunk-based + canary): consumed — bake-times per finalized ADR
- ADR-05 (auth + session): consumed — production-grade RLS + CORS verified
- ADR-08 (observability): consumed — dashboards + alerting from P07
- No `js/` file changes — Phase 08 is operational-only
- No billing / Stripe / credits work (override O15)
- No mobile / Flutter rollout (future cycle)
- No 24/7 paid on-call — solo founder is on-call; document downtime windows in `status.html`
- No compliance (SOC 2, HIPAA, GDPR) — note in runbook
- Mock-incident scenario: recommend Cloud Run job stuck (highest learning value)
- Canary first revision: pick a low-risk change (logging tweak, not behavioral)
- R2 is single-region — no failover; documented in runbook as accepted risk
- Public launch: soft launch only, tens of users in first week, founder's social channels

## Dependencies
- Phase 07 must exit first (web live behind feature flag, Sentry tags work, error budget defined, rollback drill done)

## Key files to read before starting
- `/Users/praveen/Desktop/stori/migrations/migration-phase-08-production-launch.md` — full phase spec
- `/Users/praveen/Desktop/stori/infra/cloud-run/runbooks/canary.md` — P05 canary drill log to extend
- `/Users/praveen/Desktop/stori/infra/sentry/error-budget.md` — P07 error budget definition
- `/Users/praveen/Desktop/stori/infra/README.md` — existing infra docs + pricing notes
- `/Users/praveen/Desktop/stori/migrations/migration-adr-04-trunk-based-canary.md` — finalized canary policy
- `/Users/praveen/Desktop/stori/migrations/migration-adr-08-observability.md` — Sentry conventions
