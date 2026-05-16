# ADR-08 — Observability (Sentry across web + Cloud Run)

> **Status:** Proposed (finalizes during Phase 07; consumed in Phase 08).
> **Date:** 2026-05-05.
> **Affected phases:** 01, 07, 08.
> **Author:** architect-cycle (revision 2).

---

## Context

Override O5 mandates Sentry for error tracking. Original O5 listed three SDKs (web, Cloud Run, Flutter); revision 2 dropped Flutter (mobile is a future cycle). This cycle scopes Sentry to **web + Cloud Run only**.

Decisions: SDK setup conventions, error grouping rules, log aggregation, dashboard layout, alert thresholds.

The error-budget decision (< 0.5% 5xx on `/v1/*`) was made in Phase 07 §1 in scope item 8; this ADR records it as the canonical statement.

---

## Decision

### Two Sentry projects
- `stori-web` — browser SDK on the production web app.
- `stori-cloudrun` — Node SDK on the Cloud Run Hono service. (Vercel Functions for short calls — also Node SDK; same project to keep server-side errors unified, OR separate `stori-vercel` project — pick at Phase 07 kickoff. Default: same `stori-cloudrun` project, distinguished by tag.)

No `stori-flutter` project this cycle. Future mobile cycle adds it.

### SDK initialization
**Web** (`js/00-sentry.js` — new file in Phase 07):
```js
import * as Sentry from '@sentry/browser';
Sentry.init({
  dsn: window.STORI_ENV.SENTRY_WEB_DSN,
  release: window.STORI_ENV.GIT_SHA,
  environment: window.STORI_ENV.NAME,            // 'prod' | 'staging' | 'dev'
  tracesSampleRate: 0.1,                          // 10% of transactions
  beforeSend(event) {
    // strip secrets, in case any leak
    return event;
  },
});
```

**Cloud Run** (`infra/cloud-run/sentry.js`):
```js
import * as Sentry from '@sentry/node';
Sentry.init({
  dsn: process.env.SENTRY_CLOUDRUN_DSN,
  release: process.env.K_REVISION,                // Cloud Run revision label
  environment: process.env.STORI_ENV,
  tracesSampleRate: 0.2,
});
```

DSNs are env vars, never in the repo.

### Tags applied to every event
- `release` — git SHA (web) or Cloud Run revision label (server).
- `environment` — `prod`, `staging`, `dev`.
- `feature` — coarse module: `auth`, `projects`, `autopilot`, `photopilot`, `brainstorm`, `canvas`, `lipsync`, `audio`, `infra`.
- `error_class` — one of `client` (browser-side bug), `server` (Cloud Run/Vercel bug), `network` (timeout, DNS, connection), `provider` (upstream AI provider returned an error or rate-limit), `validation` (user input rejected).
- `provider` — when `error_class=provider`: `gemini`, `kling`, `veo3`, `lyria`, `elevenlabs`.
- `route` — for server: `/v1/projects`, `/v1/jobs/animation`, etc. Auto-tagged via Hono middleware.
- `user_id` — set after `verifyUser` — but use `Sentry.setUser({ id, email })` so Sentry's PII handling respects opt-in.
- `request_id` — correlation ID, also returned in the API error response (per ADR-03).

### Error grouping
Sentry's default fingerprint (stack trace + module path + error type) works for ~all cases. Custom rules:
- Provider errors: fingerprint by `provider` tag + HTTP status (e.g., "kling-429", "gemini-503") so we don't drown in distinct stack traces for the same upstream issue.
- Network timeouts: fingerprint by `route` tag (e.g., "timeout-/v1/jobs/animation") so route-specific timeouts are visible.
- Validation errors: fingerprint by `error.code` (per ADR-03 error model) so `MODE_LOCKED` errors group under one issue.

### Log aggregation
- **Cloud Run native logging** for stdout/stderr — Google Cloud Logging captures everything. Sentry captures errors; Cloud Logging captures the rest. Don't ship logs to Sentry (cost).
- **Vercel native logging** for Vercel Functions.
- **No third-party log shipping** (Datadog, Logtail, etc) in this cycle.
- Important events double-logged: every `/v1/jobs/*` enqueue + completion writes a structured log line at INFO level (visible in Cloud Logging) AND a Sentry breadcrumb (visible if a later error happens).

### Dashboards (built in Phase 08)
**`stori-web` dashboard widgets:**
1. Top issues by `feature` tag (last 24 h).
2. Error budget burn-rate gauge — % of 5xx vs total requests, rolling 7-day. Alerts when > 0.5%.
3. Top transactions by p95 duration.
4. New issues created in last 1 h.

**`stori-cloudrun` dashboard widgets:**
1. Top issues by `route` tag.
2. p95 latency by route.
3. Job success rate by `type` (computed: 1 - (count of `error_class=server` AND `route=/v1/jobs/*` events / total job-end events)).
4. Provider failure rate by `provider` tag.
5. Slowest 10 transactions in last 1 h.

### Alert rules (configured in Phase 07; tuned in Phase 08)
**Phase 07 conservative defaults:**
- Error rate > 5% over 5-min rolling window → email + Sentry mobile push to founder.
- A new issue (first occurrence) tagged `error_class=server` → email.
- Provider rate-limit (`error_class=provider, status=429`) ≥ 10 events in 5 min → email (founder must throttle / pause).

**Phase 08 production tightening (after observation):**
- Error rate > 1% over 5-min rolling → alert.
- Error budget breach (< 0.5% 7-day rolling) → alert + halt new feature work per Phase 07 §5.6 process.

### Error budget
**< 0.5% of `/v1/*` requests return 5xx over a rolling 7-day window.** Recorded in `infra/sentry/error-budget.md` (Phase 07 deliverable). Process for breach: pause new feature work, investigate, fix; resume when burn-rate returns to nominal.

For zero-customer / dogfood traffic, this is mostly aspirational — true measurement starts after the first real production cohort lands in Phase 08.

### PII handling
- `Sentry.setUser({ id, email })` — Sentry hashes email by default; founder is OK with this for current scope.
- No project content (prompts, generated images, BGM audio) sent to Sentry. `beforeSend` hook strips any field whose name matches `/prompt|image|audio|video|key/i` from event extras.
- Per O15, no billing data exists → no PCI / payment-card concern.

### Sample rates
- Web: 10% of transactions (`tracesSampleRate: 0.1`). 100% of errors.
- Cloud Run: 20% of transactions. 100% of errors.

These keep us comfortably inside Sentry's free-tier event quota (5K events/mo) at current scale. Phase 08 re-evaluates against real traffic.

### Cost ceiling
Sentry free tier is 5K events/mo. If we breach during Phase 08, **upgrade to Team tier ($26/mo)** — recorded as the spend ceiling for this cycle. Beyond Team, evaluate sample-rate cuts before paying more.

---

## Consequences

### Positive
- Two SDKs (web + Cloud Run/Vercel server) cover the whole production surface.
- Tag conventions make cross-cutting analysis cheap (e.g., "all `provider=kling` errors in last 24 h").
- Error grouping rules avoid Sentry-issue-spam for upstream issues.
- Native logging keeps logs cheap (no Datadog bill).
- Error budget is concrete and actionable.

### Negative
- Hand-tagging every event with `feature`, `error_class`, etc. requires discipline — a missed tag becomes an unsearchable event. Mitigation: every Hono middleware and every web call site uses helpers (`captureWithFeature(...)`) instead of raw `Sentry.captureException`.
- 10–20% transaction sampling means slow-but-non-erroring requests have only partial coverage. Acceptable at our scale.
- No log aggregation means cross-correlating logs across Cloud Run + Vercel requires two browser tabs in Cloud/Vercel UIs. Tolerable for solo founder; will add a tool when team grows.

### Neutral
- The choice to NOT use Datadog / Honeycomb / OpenTelemetry-self-host is a future-revisitable lever. Sentry covers errors well; APM gaps would push us to add OpenTelemetry later.

---

## Options considered

### A. Datadog APM + logs + errors
- **Pro:** unified surface.
- **Con:** $$$$ at any non-trivial volume; overkill for solo founder.
- **Reject.**

### B. OpenTelemetry self-hosted (Tempo + Loki + Prometheus)
- **Pro:** vendor-free.
- **Con:** ops burden too high.
- **Reject.**

### C. Sentry only, no separate logs
- **Pro:** simplest.
- **Con:** logs in Sentry are expensive per-event; Cloud Run / Vercel native logging is free.
- **Reject:** native logging + Sentry errors = right split.

### D (chosen) — Sentry for errors + transactions; Cloud Run / Vercel native logging; no third-party log aggregator

---

## Affected phases

- **Phase 01** wires the SDKs to deliberate-throw smoke endpoints — proves event delivery works.
- **Phase 07** finalizes the tag conventions, alert rules, dashboards, error budget. Authors this ADR.
- **Phase 08** ships dashboards in the Sentry UI, runs the mock-incident dry-run that exercises the alert path, tunes thresholds against real traffic.

---

## Links

- Phase index: `/Users/praveen/Desktop/stori/migrations/migration-plan.md`
- Phase docs: 01, 07 (canonical), 07
- Related ADRs: ADR-02 (job failure tagging fed into Sentry), ADR-03 (error model + `request_id` correlation), ADR-04 (canary alert thresholds)
- Source: override O5 (Sentry mandated) — Flutter SDK component deferred per revision 2

*End of ADR-08.*
