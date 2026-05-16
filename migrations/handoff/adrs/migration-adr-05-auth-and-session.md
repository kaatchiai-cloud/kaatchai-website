# ADR-05 — Auth & session (Supabase Auth, JWT lifetime, RLS, CORS)

> **Status:** Proposed (decision finalizes during Phase 02).
> **Date:** 2026-05-05.
> **Affected phases:** 02, 03, 08.
> **Author:** architect-cycle (revision 2).

---

## Context

Phase 02 replaces the fake auth stub at `js/15-project.js:~1417–1472 (rev-4 pass-2 — see behavioural exit criterion)` (verified line range — the user brief's `1174-1177` was wrong; lines 1174–1177 are PiP video restoration code). Replacement is Supabase Auth. Decisions to make: sign-in methods, JWT verification implementation, lifetime/refresh, CORS lock, RLS baseline.

Mobile-future constraint: this auth flow must work for a Dart/Flutter Supabase SDK consumer eventually. Since Supabase Auth is multi-platform by design (web, iOS, Android, Flutter), this constraint is satisfied as long as we don't add web-specific glue.

---

## Decision

### Sign-in methods
**Google OAuth + magic-link email.** No password sign-in (no password storage attack surface). No social providers beyond Google (defer to mobile cycle if Apple sign-in becomes a requirement).

### JWT verification on server
**Direct `jose` verification** with `SUPABASE_JWT_SECRET` (HS256). Faster than calling `supabase.auth.getUser(token)` because it's offline-verifiable — no Supabase round-trip per request.

```js
// infra/cloud-run/middleware/auth.js (sketch)
import * as jose from 'jose';
const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
export async function verifyUser(c, next) {
  const auth = c.req.header('authorization');
  if (!auth?.startsWith('Bearer ')) return c.json({ error: { code: 'NO_TOKEN' } }, 401);
  try {
    const { payload } = await jose.jwtVerify(auth.slice(7), secret);
    c.set('user', { id: payload.sub, email: payload.email });
    return next();
  } catch (_e) {
    return c.json({ error: { code: 'INVALID_TOKEN' } }, 401);
  }
}
```

Public routes (`/v1/health`, `/v1/status`, `/v1/flags`, `/v1/sentry-smoke`) skip the middleware. Every other `/v1/*` requires it.

### JWT lifetime
**Supabase defaults — kept.** Access token: 1 hour. Refresh token: 7 days. Refresh handled transparently by the Supabase JS SDK; the client (`js/00-api-client.js`) calls `getSession()` which returns a non-stale access token.

Reasoning: 1-hour access matches typical web-session ergonomics; 7-day refresh balances "stay signed in" against "compromise window". For a higher-security future cycle (e.g. with paying customers), shorten access to 15 min; not needed now.

### Session refresh strategy
- Supabase SDK handles automatic refresh in the background.
- `js/00-api-client.js` always pulls a fresh access token via `getSession()` before each call (cached for the in-flight request only).
- On 401 from server, client clears local session and reloads to a sign-in screen.
- `onAuthStateChange` events: `SIGNED_OUT` → reload UI; `TOKEN_REFRESHED` → no UI change needed; `SIGNED_IN` → update UI.

### RLS baseline
- **Every table with user-scoped data has RLS enabled** with `auth.uid() = user_id` (or transitively through `project_id` on child tables).
- Phase 03 ships RLS for `projects`, `scenes`, `storyboard_instances`, `image_instances`, `video_instances`, `jobs` (via `project_id`), `feature_flags` (read-only by `env`).
- Service-role key (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS — used only by server-side code in `infra/cloud-run/` and `api/` (Vercel Functions). NEVER imported into any `js/` file. Lint rule in CI catches the import.

### CORS lock
- Allowed origins: `https://kaatchiai.com` and `https://www.kaatchiai.com` (production), plus Vercel preview URLs. NOT `*`. (Phase 01 OQ #3 resolved 2026-05-06 → `kaatchiai.com`.)
- Allowed methods: `GET, POST, PUT, DELETE, OPTIONS`.
- Allowed headers: `Authorization, Content-Type, If-Match`.
- Credentials: `true` only if cookies are used (current plan: no cookies — JWT in header — so this can stay `false`; revisit if cookie-auth is added).
- For dev: add `http://localhost:<port>` as additional allowed origins via a build-time env split (`CORS_ALLOWED_ORIGINS=https://kaatchiai.com,https://www.kaatchiai.com,http://localhost:5173,http://localhost:3000`).

### Sign-in/up flow specifics
- Google OAuth callback URL: `https://<domain>/auth/callback` (Supabase manages the OAuth dance). Document the exact URL in Supabase dashboard config and `infra/README.md`.
- Magic-link redirect URL: same callback path.
- New user creation triggers a Supabase function (or `auth.users` `INSERT` trigger) that mirrors a row into `public.users` with id+email+created_at. No quota fields — those are credits-workstream territory (override O15).

### Sign-out flow
- `signOut()` calls `supabase.auth.signOut()` → clears local session → reloads.
- Server has no explicit sign-out endpoint (JWT is stateless; access token naturally expires within 1 h). For "force sign-out" of a compromised session, we would need a token blocklist — not in scope this cycle.

---

## Consequences

### Positive
- Direct `jose` verify is the fastest server-side option. Cloud Run cold-starts stay light (no Supabase SDK in the hot path).
- Supabase defaults for JWT lifetime are well-tuned for web; no premature optimization.
- RLS as defense-in-depth means even an exploited API endpoint can't leak cross-user data.
- CORS lock to production domain prevents random other origins from hitting our API directly via authenticated browsers.
- Mobile-future constraint satisfied: Supabase Flutter SDK uses the exact same `Authorization: Bearer <jwt>` flow.

### Negative
- 7-day refresh window means a compromised refresh token gives an attacker 7 days of access. Acceptable at zero-customer / dogfood stage; tighten when paying customers exist.
- No "sign out everywhere" feature — would require a server-side token blocklist or rotating `SUPABASE_JWT_SECRET` (the latter invalidates ALL sessions, blunt instrument). Not in scope.
- No cookie-based auth means CSRF is irrelevant (no ambient credentials in the browser); but it also means we can't use httpOnly cookies for added XSS protection. Trade-off accepted; XSS protection comes from CSP headers and code review.

### Neutral
- The choice to do offline JWT verification vs Supabase round-trip is a future-revisitable lever — we get a small latency win now; could swap if Supabase introduces a feature that requires the round-trip.

---

## Options considered

### JWT verification mechanism
- **A. `supabase.auth.getUser(token)` server-side** — extra round-trip per request; rejected.
- **B. `jose` direct verify (chosen)** — fastest, offline.
- **C. Custom JWT (sign with our own key)** — pointless; we'd recreate Supabase's offering.

### Sign-in methods
- **A. Email/password + Google + magic link** — adds password storage attack surface. Rejected.
- **B. Magic link only** — friction for repeat sign-ins. Rejected.
- **C. Google OAuth + magic link (chosen)** — covers ~all founder/dogfood use cases.

### Session storage
- **A. Cookies (httpOnly + SameSite=Strict)** — better XSS posture; complicates the mobile cycle (cookies aren't natural in mobile HTTP clients). Rejected for mobile-future reason.
- **B. localStorage via Supabase SDK (chosen)** — what Supabase ships by default; works identically on web and mobile.
- **C. Hybrid** — too clever; rejected.

---

## Affected phases

- **Phase 02** ships the middleware, the `js/00-auth.js` + `js/00-api-client.js` files, deletes the auth stub at `js/15-project.js:~1417–1472 (rev-4 pass-2 — see behavioural exit criterion)`, locks CORS.
- **Phase 03** consumes the middleware on every `/v1/projects/*` endpoint; adds RLS to all project tables.
- **Phase 08** verifies the production CORS lock against the actual public domain; ensures SSL is valid; ensures sign-in works from at least 2 networks.

---

## Links

- Phase index: `/Users/praveen/Desktop/stori/migrations/migration-plan.md`
- Phase docs: 02 (canonical), 03, 08
- Source spec: `/Users/praveen/Desktop/stori/migrations/migration-original-spec.md` §Architecture L13–22, §New Files §Frontend L103–116, §Security Non-Negotiables L248–292 rows 1, 2, 5, 6
- Verified line range: `js/15-project.js:~1417–1472 (rev-4 pass-2 — see behavioural exit criterion)` for the auth stub (spec's `1174-1177` is incorrect — see inventory Part 5 unanchored claim #1)
- Related ADRs: ADR-03 (API contract that this auth flow gates), ADR-08 (Sentry tagging on auth failures)

*End of ADR-05.*
