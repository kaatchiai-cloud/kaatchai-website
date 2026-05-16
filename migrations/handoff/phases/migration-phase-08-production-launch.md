# Phase 08 — Production Launch + Operational Readiness (web + backend)

> **Status:** ready-to-execute after Phase 07 exits. **Audience:** solo founder + 1–2 engineers. **Duration:** M (3–5 working weeks).
> **Goal in one line:** ship web + backend to public users with monitoring, runbooks, canaries, and a phased rollout plan — web stack only (mobile is the future cycle's launch).
> **Source:** `/Users/praveen/Desktop/stori/migrations/migration-plan.md` Part 2 row 07; coverage matrix [OVERRIDES] O5, O6–O12 (excluding O11/O12 mobile-rollout rows).

---

## 1. Scope

### In scope
1. **Sentry dashboards live** for web and Cloud Run. Two dashboards in the Sentry UI:
   - `stori-web` — top errors by feature, error budget burn rate, top slow transactions.
   - `stori-cloudrun` — top errors by route, p95 latency by route, job-success rate by `type`.
   No Flutter dashboards in this cycle (revision 2: mobile deferred).
2. **On-call runbook** at `infra/runbooks/oncall.md`. Covers four scenarios:
   - **Auth outage** (Supabase Auth down or token verification failing 401-storm) — diagnose, fall back to a maintenance page, comms.
   - **Cloud Run job stuck** (a `running` job past its expected duration; how to inspect, kill via DB update + reap, retry).
   - **R2 region failure** (R2 returns 503 for a sustained period) — diagnose, communicate, no fallback (R2 is single-region by default; document the impact).
   - **AI provider rate-limit** (Gemini / Kling / Lyria / ElevenLabs) — detect via Sentry tag `provider`, throttle client-side, comms to active users.
3. **Real production canary** on the production Cloud Run service for at least one revision. The drill in Phase 05 was on a no-op revision; this is the first one with feature-bearing code. Apply the bake-times decided in ADR-04 (default: 5% for 30 min → 50% for 6 h → 100% with manual promotion).
4. **One-page operational status doc** at a public/internal URL. Recommended: a static `status.html` in the repo, hosted at `https://kaatchiai.com/status`. Lists current uptime, recent incidents, planned maintenance. Not a third-party status page (Statuspage.io etc) — solo founder doesn't need that yet.
5. **Mock-incident dry-run** — pick a scenario from the runbook, simulate it (e.g., manually mark all `running` jobs as `error: 'simulated outage'`), execute the runbook end-to-end, file a post-mortem using a template at `infra/runbooks/post-mortem-template.md`. Result of the dry-run goes into `infra/runbooks/dry-runs/2026-NN-NN-mock-incident.md`.
6. **Production-launch readiness checklist** — comprehensive go/no-go checklist authored at `infra/runbooks/launch-checklist.md`. Contains items like: Sentry dashboards loaded, error budget defined, runbook written, mock incident done, on-call schedule defined (even if just "founder 24/7"), public domain DNS confirmed, SSL valid > 30 days, R2 bucket lifecycle rules attached.
7. **Vendor-pricing reality check** at production scale — confirm Vercel Pro, Cloud Run cost band, R2 cost, Supabase tier, Sentry tier, ElevenLabs tier, Gemini paid tier all accommodate launch traffic. Record dates in `infra/README.md`.
8. **Public launch (small cohort)** — flip the production feature flag `public_signup = true`. Soft launch: announcement on the founder's channels (whatever those are), no marketing push. Capacity expectation: tens of users in the first week.

### Explicitly out of scope (defer to later or explicitly out)
- **Billing / Stripe / credits** → out-of-cycle (override O15).
- **Mobile / Flutter rollout** → future mobile cycle (revision 2 — overrides O11, O12 deferred).
- **Post-launch growth instrumentation** (analytics, A/B testing tooling, conversion funnels) → not in this cycle's mandate.
- **Marketing site, landing-page experiments** → not in scope.
- **24/7 paid on-call** — solo founder is the on-call; defer paid rotation until customer base justifies it.
- **Compliance (SOC 2, HIPAA, GDPR DSAR)** → not in this cycle. Note in `infra/runbooks/oncall.md` that no compliance certifications are claimed.

---

## 2. Goal & exit criteria

| # | Exit criterion | How verified |
|---|----------------|--------------|
| 1 | Sentry web dashboard renders. | Screenshot. |
| 2 | Sentry Cloud Run dashboard renders. | Screenshot. |
| 3 | `infra/runbooks/oncall.md` checked in covering all 4 scenarios. | PR review. |
| 4 | Production canary 5/50/100 executed on a real Cloud Run revision; bake-times honoured per ADR-04. | Drill log. |
| 5 | `status.html` deployed and accessible. | Manual visit. |
| 6 | Mock-incident dry-run executed; post-mortem filed. | Dry-run log. |
| 7 | Launch checklist all-green. | Checklist file. |
| 8 | Production feature flag `public_signup = true` flipped; first external user sign-up landed. | Sentry "first sign-up" event. |
| 9 | Vendor-pricing reality check dated and recorded. | `infra/README.md`. |

---

## 3. Architecture

```
                          (no architectural changes — only operational hardening)

Browser                           Vercel + Cloud Run + Supabase + R2
                                            │
                                            ▼
                         ┌──────────────────────────────────────┐
                         │ Sentry (web + cloudrun dashboards)    │
                         │  ├─ release tags                      │
                         │  ├─ feature tags                      │
                         │  ├─ error_class tags                  │
                         │  ├─ provider tags (gemini/kling/...)  │
                         │  └─ alert rules → founder channel     │
                         └──────────────────────────────────────┘

                         ┌──────────────────────────────────────┐
                         │ Cloud Run runbooks                    │
                         │  - auth outage                        │
                         │  - cloud-run job stuck                │
                         │  - R2 region failure                  │
                         │  - AI provider rate-limit             │
                         │  - rollback drill (from P07)          │
                         │  - canary drill (from P05)            │
                         └──────────────────────────────────────┘

                         ┌──────────────────────────────────────┐
                         │ Public status page                    │
                         │  static status.html at /status        │
                         └──────────────────────────────────────┘
```

**Why this shape:** every primitive needed for production is already built (auth, API, jobs, deletion sweep, Sentry init, error budget definition). Phase 08 wires them together into a launchable shape — dashboards, runbooks, mock incidents, the actual "flip the switch" moment.

---

## 4. Technology selection

| Concern | Choice | Rationale | Alternatives |
|---------|--------|-----------|--------------|
| Status page | **Static `status.html` in repo, hosted on Vercel** | Free; founder-controllable; sufficient for solo + tens-of-users scale. | Statuspage.io ($30+/mo): premature. Better Uptime: same. |
| On-call alerting channel | **Founder's email + a phone-push notification via Sentry mobile app** | Solo founder is the on-call; no rotation tooling needed. | PagerDuty: premature. |
| Mock-incident scenario picker | **Pick the most likely scenario** (Cloud Run job stuck — exposes the most surface area) | Highest learning value. | Auth outage: also a strong choice; pick whichever is more pressing at kickoff. |
| Public-launch comms | **Founder's social channels (whatever they are)** | Soft launch, no marketing dollars. | Email blast: defer until email list exists. |
| Real canary tooling | **`gcloud run services update-traffic`** | Built-in; no extra vendor. | Cloud Deploy: overkill for solo founder. |

---

## 5. Work breakdown

### 5.1 Sentry dashboards (1 day)
- [ ] In Sentry UI, create dashboard `stori-web`. Widgets:
  - Top issues by `feature` tag, last 24 h.
  - Error budget burn rate (custom query against the < 0.5% rule from Phase 07).
  - Top transactions by p95 duration.
  - Issue freshness (count of issues created in last 1 h).
- [ ] Create dashboard `stori-cloudrun`. Widgets:
  - Top issues by `route` tag.
  - p95 latency by route.
  - Job success rate by `type` (computed from `error_class: 'job-failure'` events vs total).
  - Provider failure rate by `provider` tag.
- [ ] Save URLs in `infra/sentry/dashboards.md`.

### 5.2 On-call runbook (2 days)
- [ ] Author `infra/runbooks/oncall.md`. One section per scenario:
  - **Auth outage** — symptoms (401 storm in Sentry), diagnosis steps (Supabase status page; JWT secret rotation), mitigation (post a maintenance banner on `index.html`; tell active users), recovery (verify a fresh sign-in works), post-mortem section.
  - **Cloud Run job stuck** — symptoms (`jobs` table has `running` rows past expected duration), diagnosis (`SELECT id, type, started_at FROM jobs WHERE status='running' AND started_at < now()-interval '30 min'`), mitigation (DB update to `status='error', error='manual-reap'`; restart the Cloud Run service if the worker is wedged), recovery (re-fire idempotency key from client).
  - **R2 region failure** — symptoms (R2 5xx in Sentry tagged `provider: r2`), diagnosis (Cloudflare status page), mitigation (no automatic failover; post status page banner; pause new uploads via feature flag `r2_writes_paused = true`), recovery (resume when R2 recovers).
  - **AI provider rate-limit** — symptoms (`provider` tag 429s in Sentry), diagnosis (which provider; how long), mitigation (client throttle via flag; prioritize active sessions over new), recovery (verify rate-limit reset).
- [ ] Each section ends with: "Comms template: ____" (the exact words to post on status page + social).

### 5.3 Real production canary drill (0.5 day)
- [ ] Pick a small change (e.g., a logging tweak in Cloud Run). Build + deploy a new revision.
- [ ] Apply ADR-04's bake-times: 5% traffic for 30 min, monitor Sentry; promote to 50% for 6 h, monitor; promote to 100% manually.
- [ ] Document the drill in `infra/cloud-run/runbooks/canary.md` (extending Phase 05's no-op drill log).

### 5.4 Status page (0.5 day)
- [ ] Author `status.html` (static) listing: "all systems operational" lights for [Auth, API, Jobs, Storage, AI providers], a "recent incidents" section (initially empty), planned maintenance section (empty).
- [ ] Wire up a tiny `/v1/status` Cloud Run endpoint that returns `{ auth: 'ok', api: 'ok', jobs_p95_ms: <num>, storage: 'ok' }` — `status.html` polls this every 60 s and lights green/yellow/red.
- [ ] Deploy `status.html` to Vercel at `/status`.

### 5.5 Mock-incident dry-run (1 day)
- [ ] Pick scenario (recommend: Cloud Run job stuck).
- [ ] Schedule a 90-min window. Engineer-2 simulates the incident; engineer-1 + founder run the runbook.
- [ ] At end of dry-run, file a post-mortem in `infra/runbooks/dry-runs/2026-NN-NN-mock-incident.md` using the template at `infra/runbooks/post-mortem-template.md`. Include: what was simulated, what the runbook said to do, what actually happened, gaps identified, action items.
- [ ] Update the runbook with any lessons learned.

### 5.6 Launch checklist + vendor-pricing reality check (0.5 day)
- [ ] Author `infra/runbooks/launch-checklist.md` with all the boxes from §1 in scope item 6.
- [ ] Tick each box, recording date and (where relevant) URL/screenshot.
- [ ] Update `infra/README.md` vendor-pricing footnotes with today's date.

### 5.7 Public launch (0.5 day)
- [ ] Flip `public_signup = true` flag.
- [ ] Verify the home page allows new sign-ups (the path was tested with founder's account; this is the public-facing version).
- [ ] Wait for first external sign-up; verify Sentry receives the user creation event.
- [ ] Open tracking issue "Phase 08 done" with the 9 exit criteria.

**Estimated total:** ~6 working days; calendar 3–5 weeks because (a) Sentry dashboard tweaking is iterative, (b) runbook accuracy depends on observation, (c) the mock-incident dry-run requires schedule alignment, (d) the public-launch step is the founder's call and may have a soft deadline.

---

## 6. Acceptance & test plan

### Smoke checklist
1. Visit Sentry web dashboard → renders with non-zero data.
2. Visit Sentry Cloud Run dashboard → renders.
3. Read `infra/runbooks/oncall.md` → all 4 scenarios complete.
4. Find drill log for production canary → 5/50/100 documented.
5. Visit `https://<production>/status` → loads, lights are green.
6. Find dry-run post-mortem → filed.
7. Launch checklist all green.
8. Production sign-up by an external user → Sentry shows the event.

### Manual verification (post-impl)
- [ ] **Founder:** ensure your phone gets Sentry push for a deliberate test alert before going public.
- [ ] **Engineer:** SSL cert on production domain ≥ 30 days from expiry.
- [ ] **Founder:** make sure the public-domain DNS resolves correctly from at least 2 networks (laptop + phone tether).

---

## 7. Dependencies

### Predecessors
- **Phase 07** must exit. Specifically: web is live behind feature flag, Sentry tags work, error budget written, rollback drill done.

### Successors
- **None in this cycle.** Future workstreams (mobile cycle, billing/credits cycle) consume Phase 08's launched backend as a constraint.

### Files this phase touches
- New: `infra/runbooks/oncall.md`, `infra/runbooks/post-mortem-template.md`, `infra/runbooks/launch-checklist.md`, `infra/runbooks/dry-runs/2026-NN-NN-mock-incident.md`, `infra/sentry/dashboards.md`, `status.html`, `infra/cloud-run/routes/status.js` (the `/v1/status` endpoint).
- Modified: `infra/cloud-run/runbooks/canary.md` (extended), `infra/README.md` (pricing dates).
- Forbidden: any `js/` file. Phase 08 is operational-only; no new code surface in `js/`.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mock-incident reveals a runbook gap that takes a real incident to fix | M | M | The dry-run is exactly to surface gaps. Budget time in §5.5 for runbook revision. |
| Production canary drill triggers a real bug in the test revision | L | H | Pick a low-risk first revision (logging tweak, not a behavioral change). Have the rollback runbook in hand. |
| Sentry alert fatigue — too many false positives in the first week | M | M | Start with conservative alert thresholds (error rate > 5%, not > 0.5%); tighten with data. |
| First external user hits a bug we didn't see in dogfood | M | H | Keep the cohort small (single-digit users in week 1); be ready to roll back via Phase 07's drill. |
| AI provider rate limits become a customer-facing issue at launch volume | M | M | Pre-launch, confirm paid tiers for Gemini, Kling, ElevenLabs are sized for expected concurrency. Document quota ceilings in `infra/runbooks/oncall.md`. |
| Solo founder can't sustain 24/7 on-call | H | M | Document downtime windows in `status.html` ("Best-effort response 9am–9pm Pacific weekdays"). Set customer expectations honestly. |
| R2 single-region — extended outage has no failover | L | H | Documented in runbook; accepted risk for this cycle (no replication infrastructure). Revisit if outage actually happens. |

---

## 9. Open questions

1. **Public domain confirmed?** Carried from Phase 01 OQ #3. Should already be answered by now; if not, [**blocking** for §5.4 status page deployment].
2. **Bake-times in ADR-04 — keep at 30 min / 6 h / manual or tighten?** [non-blocking — start at the recorded values, tighten after observing first real revision].
3. **Mock-incident scenario — Cloud Run job stuck vs auth outage vs R2 outage?** [non-blocking — pick at §5.5 kickoff. Recommend Cloud Run job stuck for highest learning].
4. **Public launch comms channel** — founder picks. [non-blocking].
5. **First-week capacity expectation** — single digit, low double digit, higher? [non-blocking — confirms whether vendor tiers suffice]. Default: single-digit users.
6. **Should we set up an email list for incident comms?** [non-blocking — defer; Twitter/equivalent + status page suffice for soft launch].
7. **Is there a marketing-side go/no-go gate that this checklist needs to feed into?** [non-blocking — assume founder coordinates marketing separately].

---

## 10. Cross-cutting decisions raised by this phase

| Decision | Phases affected | ADR ref |
|----------|-----------------|---------|
| Observability — Sentry dashboards live, alerting thresholds tuned for production | 01, 07, 08 | **ADR-08** (consumed; finalized in P07) |
| Trunk-based dev + canary deployment — first real production canary executed | 01, 07, 08 | **ADR-04** (consumed; finalized in P07) |
| Auth & session — production-grade RLS + CORS verified | 02, 03, 08 | **ADR-05** (consumed) |
| Long-running jobs — production worker observed under real load | 01, 05, 06, 08 | **ADR-02** (consumed) |

(No new cross-cutting ADRs introduced by this phase — Phase 08 is entirely operational hardening of decisions already made.)

---

## 11. Links

- Phase index: `/Users/praveen/Desktop/stori/migrations/migration-plan.md`
- Predecessor: `/Users/praveen/Desktop/stori/migrations/migration-phase-07-web-cutover.md`
- Successor: **None in this cycle.** Future mobile cycle (separate architect cycle) consumes the API contract from Phase 03; future billing/credits cycle replaces the dollar-cost UI removed in Phase 07.
- Source spec: `/Users/praveen/Desktop/stori/migrations/migration-original-spec.md` does not enumerate operational readiness; this phase is driven by overrides O5 (Sentry), O6–O10 (trunk-based, canary, feature flags), and the architect-level decision to make production-launch a phase boundary rather than an implicit "ship when ready".
- ADRs: `migration-adr-02-long-running-jobs.md`, `migration-adr-04-trunk-based-canary.md`, `migration-adr-05-auth-and-session.md`, `migration-adr-08-observability.md`

*End of Phase 08 dev doc.*
