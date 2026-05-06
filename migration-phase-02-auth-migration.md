# Phase 02 — Auth Migration (Supabase Auth replaces stub)

> **Status:** ready-to-execute after Phase 01 exits. **Audience:** solo founder + 1–2 engineers. **Duration:** S (2–3 working weeks).
> **Goal in one line:** replace the fake auth stub with real Supabase Auth across web; mint JWTs ready for every future `/v1/*` endpoint.
> **Source:** `/Users/praveen/Desktop/stori/migration-plan.md` Part 2 row 02; coverage matrix rows 6, 7, 11; [OVERRIDES] O14.

---

## 1. Scope

### In scope
1. **Supabase Auth wired into web** with two sign-in methods: Google OAuth and magic-link email. Sign-out works.
2. **`js/00-auth.js`** created. Owns: Supabase client init, `getSession()`, `getUser()`, `signInWithGoogle()`, `signInWithMagicLink()`, `signOut()`, `onAuthStateChange` listener that updates the user-menu UI.
3. **`js/00-api-client.js`** created. Owns: a single `callApi(path, body)` wrapper that injects `Authorization: Bearer <jwt>` on every request and centrally handles 401 (session-expired → redirect to sign-in) and 429 (deferred — quota lives in the future credits workstream; for now treat 429 as a generic toast). Every fetch-to-backend call site in `js/` migrates to use this wrapper as part of Phases 03–06; Phase 02 only ships the wrapper itself + one consumer.

   **callApi() is the shared abstraction that replaces `callGeminiAPI()`** — fresh grep at audit time confirms `callGeminiAPI` is invoked **50 times across 9 files** (`js/17a-create-api.js` is the definition site + ~16 self-calls; `js/17b-create-references.js`, `js/17c-create-pipeline.js`, `js/20-reels-creator.js`, `js/24-photopilot.js`, `js/26-brainstorm.js`, `js/26b-llm-router.js`, `js/31-input-parser.js`, `js/32-audio-input.js` are call sites). P02 ships `callApi()`; **P05 replaces every `callGeminiAPI` call site in AutoPilot-pipeline files (17a–d, 20, 21)**; **P06 replaces every `callGeminiAPI` call site in secondary-pipeline files (24, 26, 26b, 31, 32)**; **P07 deletes the `callGeminiAPI` definition itself + the related key-getters and `trackCost` from `js/17a-create-api.js`** (see P07 deletion list).
3a. **Eager-load 00-auth.js + 00-api-client.js in `index.html` prelude.** Add `<script src="js/00-auth.js?v=2"></script>` and `<script src="js/00-api-client.js?v=2"></script>` to the **eager** `<script>` section in `index.html` (verified location: between `js/18-page-transition.js` (line ~4715) and `js/27-canvas-state.js` (line ~4717)) — they must run **before `js/15-project.js`** so the auth state and `callApi()` wrapper are available when 15-project.js runs its session checks. Lazy-loaded scripts (the `_editorScriptsLoaded` block at index.html:4724–4744) may reference `window.callApi(...)` only because the eager preamble has already executed by the time the lazy bundle runs. Document this loading-order dependency in `infra/cloud-run/README.md`.

3b. **`api/kling.js` CORS lock.** Patch the existing Vercel Function `api/kling.js` to lock `Access-Control-Allow-Origin` from `'*'` to the production domain allowlist (`https://kaatchiai.com`, `https://www.kaatchiai.com`, plus dev origins per ADR-05). Two patch sites — both `Allow-Origin: '*'` lines: **`api/kling.js:8`** (preflight branch) and **`api/kling.js:39`** (response branch). Closes the security gap during the 12+ week pre-replacement window before P05 introduces the server-side Kling JWT path.

4. **Fake-auth-stub removal at the verified location.** The user brief and migration-details.md L110, L180, L243 cite the stub at `js/15-project.js:1174-1177`; this is wrong. The actual stub is at **lines 1362–1404** (verified — `localStorage.setItem('stori_user', ...)` is on line 1363; `updateUserSection()` definition runs through line 1402; the bottom `updateUserSection()` invocation is on line 1404). Phase 02 deletes this block and replaces it with the `js/00-auth.js`-driven flow.
5. **JWT verification middleware** on Cloud Run. `verifyUser(req)` extracts the Bearer token, verifies the Supabase JWT via `SUPABASE_JWT_SECRET`, attaches `user` to the request context, returns 401 otherwise. One representative protected endpoint (`/v1/me`) returns `{ id, email }` from the verified JWT. Every future `/v1/*` endpoint is required to apply this middleware (gate-checked in Phase 03).
6. **CORS** locked to the production domain. Production-domain decision must arrive from the Phase 01 [blocking] open question before this phase exits. Allowed methods: `POST, GET, OPTIONS`. Allowed headers: `Authorization, Content-Type`. NOT `Access-Control-Allow-Origin: *` (security non-negotiable #2, migration-details L259–262).
7. **Session refresh round-trips.** Verify Supabase auto-refresh works across a 1+ hour idle period; the JWT in `callApi` always carries the freshest token.
8. **E2E test** (Playwright recommended) signs in via magic link, calls `/v1/me`, signs out. Runs in CI on every PR.

### Explicitly out of scope (defer to later phases)
- **Project / instance schema, `/v1/projects/*` endpoints** → Phase 03.
- **Pipeline endpoints (Gemini, Kling, AutoPilot)** → Phases 05 + 06.
- **BYOK code deletion sweep** (`stori_key_paid` / `stori_key_free` / `stori_kling_*` / `stori_elevenlabs_key` / `stori_openai_key` / `stori_anthropic_key` / fal.ai cleanup) → Phase 07. Phase 02 only deletes the auth stub block + locks `api/kling.js` CORS; the BYOK key code paths (including `stori_elevenlabs_key` reads at `js/17a-create-api.js:296, 583, 636, 810` and the other provider keys) still serve client-side AI calls until Phases 05/06 cut over and P07 deletes the key-getters.
- **Dollar-cost UI removal** → Phase 07.
- **Quota / 429 handling beyond a generic toast** → out-of-cycle (override O15).
- **Email-template branding, password sign-in, social providers beyond Google** → not requested; defer.
- **RLS policies on tables other than `users`** → Phase 03 (project state ships those).
- **Mobile auth flow / Flutter Supabase SDK** → future mobile cycle.

---

## 2. Goal & exit criteria

| # | Exit criterion | How verified |
|---|----------------|--------------|
| 1 | Google OAuth sign-in works end-to-end on web. | Manual: click "Sign in with Google" → Google consent → redirected back signed in. |
| 2 | Magic-link sign-in works end-to-end on web. | Manual: enter email → receive email → click link → signed in. |
| 3 | Sign-out clears session and reverts user-menu UI to signed-out state. | Manual + E2E test. |
| 4 | Lines 1362–1404 of `js/15-project.js` (the fake-auth block plus `updateUserSection`) are deleted; equivalent behaviour lives in `js/00-auth.js`. `grep -n stori_user js/15-project.js` returns zero matches. | `grep` + diff review. |
| 5 | `/v1/me` on Cloud Run returns 200 with `{ id, email }` when called with a valid Bearer token; returns 401 with no token; returns 401 with a malformed token. | `curl` + Playwright. |
| 6 | CORS preflight from production domain succeeds; from any other origin returns no `Access-Control-Allow-Origin` header. | `curl -H "Origin: ..." -X OPTIONS`. |
| 7 | Session refresh: leave a tab idle for 65 minutes, then call `/v1/me` — succeeds without re-sign-in. | Manual long-running test + recorded date. |
| 8 | E2E test (Playwright) green in CI on a sample PR. | GitHub Actions check. |
| 9 | Production-domain value (Phase 01 open question #3) recorded in `infra/README.md`. | Code review. |

---

## 3. Architecture

```
                ┌──────────────────────────────────────┐
                │ Browser                              │
                │ index.html                           │
                │ ├─ js/00-auth.js  (Supabase client)  │
                │ ├─ js/00-api-client.js (callApi)     │
                │ └─ js/15-project.js (auth-stub GONE) │
                └────┬─────────────────────────────────┘
                     │ Authorization: Bearer <jwt>
                     ▼
        ┌────────────────────────────────────────┐
        │ Cloud Run (Hono)                        │
        │ ├─ middleware: verifyUser → ctx.user    │
        │ ├─ /v1/health         (public)          │
        │ ├─ /v1/sentry-smoke   (public)          │
        │ └─ /v1/me             (verifyUser → 200) │
        └────────────────────────────────────────┘
                     │
                     │ verifies via SUPABASE_JWT_SECRET
                     ▼
        ┌────────────────────────────────────────┐
        │ Supabase Auth                           │
        │ (issues JWTs, manages sessions,         │
        │ Google OAuth + magic link)              │
        └────────────────────────────────────────┘
```

**Why this shape:**
- Auth is the gate every later endpoint passes through. Building it as a clean middleware layer before any feature endpoint exists means we never ship a feature endpoint that "forgot" auth.
- `js/00-auth.js` and `js/00-api-client.js` are numbered `00-` so they load before everything else in the existing script-tag ordering pattern (visible in `index.html`).
- The `localStorage.getItem('stori_user')` pattern (line 1376) is replaced by Supabase session storage (Supabase JS SDK manages localStorage under its own key — no manual juggling).

---

## 4. Technology selection

| Concern | Choice | Rationale | Alternatives |
|---------|--------|-----------|--------------|
| Auth provider | **Supabase Auth** | Spec mandates (migration-details L13). | Auth0, Clerk: extra vendor, extra cost. |
| Sign-in methods | **Google OAuth + magic link** | Two methods cover ~all founder/dogfood scenarios; no password storage. | Add Apple sign-in: defer to mobile cycle. |
| JWT verification on server | **Supabase JS server SDK** (`@supabase/supabase-js` with `auth.getUser(token)`) OR **direct `jose` verify** with `SUPABASE_JWT_SECRET` | Direct `jose` is faster (no Supabase round-trip per request) and offline-verifiable; recommended. | Supabase server SDK: 1 extra hop per request. |
| E2E framework | **Playwright** | Best-in-class browser automation; works with Supabase magic-link by intercepting the email URL via Mailpit or a Supabase test inbox. | Cypress: viable; Playwright preferred for parallel browser support. |
| Magic-link email delivery in dev | **Supabase Inbucket** (default) | Supabase ships an inbox preview for dev; no SMTP setup needed. | Mailpit, Mailtrap. Use Inbucket for local; production uses Supabase's built-in SMTP relay. |

**ADR-05** captures the JWT lifetime / refresh-strategy / RLS-baseline decisions formally.

---

## 5. Work breakdown

### 5.0 Eager-load preamble in `index.html` (0.25 day)
- [ ] In `index.html` between line ~4715 (`js/18-page-transition.js`) and line ~4717 (`js/27-canvas-state.js`), insert two eager `<script>` tags: `js/00-auth.js?v=2` first, then `js/00-api-client.js?v=2`. They must precede `js/15-project.js` (currently eager at line 4719) so the auth state and `callApi()` wrapper are available when `15-project.js` runs.
- [ ] Verify `build.js` auto-discovers them via the static-script-tag regex (`build.js:69–80`). No `MAIN_FILES` symbol exists; build.js scans `<script src="js/...">` and the dynamic loader array directly.
- [ ] Smoke: `node build.js` exits 0 and `dist/index.html` contains the two new files in eager order.

### 5.0a `api/kling.js` CORS lock (0.25 day)
- [ ] Read `/Users/praveen/Desktop/stori/api/kling.js`. Confirm two `Access-Control-Allow-Origin: '*'` sites at lines 8 (preflight) and 39 (response).
- [ ] Replace both with an origin allowlist function:
  ```js
  const allowed = ['https://kaatchiai.com','https://www.kaatchiai.com','http://localhost:3000','http://localhost:5173'];
  const origin = req.headers.origin || '';
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  ```
- [ ] No other change in `api/kling.js` — server-side Kling JWT migration is P05 territory.
- [ ] Manual: `curl -H 'Origin: https://example.com' -X OPTIONS https://<vercel-prod>/api/kling` returns no `Access-Control-Allow-Origin` header (or returns one ≠ example.com).

### 5.1 `js/00-auth.js` (1 day)
- [ ] Create the file. Add `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>` to `index.html` head (per migration-details L212).
- [ ] Init Supabase client with `SUPABASE_URL` + `SUPABASE_ANON_KEY` from a build-time-injected `window.STORI_ENV` global (or `<meta>` tag — finalize at kickoff).
- [ ] Export: `getSession()`, `getUser()`, `signInWithGoogle()`, `signInWithMagicLink(email)`, `signOut()`.
- [ ] On page load: `getSession()` → call `updateUserSection()` (relocated from `js/15-project.js`).
- [ ] Subscribe to `supabase.auth.onAuthStateChange((event, session) => updateUserSection())`.
- [ ] Ensure `updateUserSection()` lives here, not in `js/15-project.js`. It must NOT read `stori_key_paid` / `stori_key_free` (those are read in line 1391 of the current stub) — defer that paid-status display to the future credits workstream; for Phase 02 the user dropdown shows just name + email.

### 5.2 `js/00-api-client.js` (0.5 day)
- [ ] Single export: `callApi(path, body, opts)`.
- [ ] Pulls JWT from `await getSession()` (cached for the session duration; Supabase SDK handles refresh).
- [ ] Sets `Authorization: Bearer <jwt>` and `Content-Type: application/json`.
- [ ] On 401: clear local session, reload to a sign-in screen.
- [ ] On 429: emit a `setStatus('Rate limit hit — try again in a moment.')` (deferred quota work).
- [ ] On 5xx: emit a `setStatus('Server error — Sentry is on it.')` and rethrow.
- [ ] No retry logic — leave to caller per ADR-02 idempotency story (deferred to Phase 05).

### 5.3 Cloud Run middleware + `/v1/me` (1 day)
- [ ] Add `verifyUser` middleware to the Hono app. Use `jose` to verify against `SUPABASE_JWT_SECRET`. Reject early if missing/invalid.
- [ ] Add `/v1/me` route guarded by the middleware; returns `{ id, email }` from the JWT claims.
- [ ] Add CORS middleware locked to the production domain (value from Phase 01 open question #3). Methods + headers as in §1 in scope item 6.
- [ ] Document the middleware as a required wrapper for every future `/v1/*` endpoint in `infra/cloud-run/README.md`. (Phase 03 ADR-03 will codify this in the API contract.)

### 5.4 Auth-stub deletion in `js/15-project.js` (0.5 day)
- [ ] Read lines 1350–1410 of `js/15-project.js` first to confirm the surrounding context (user-menu DOM wiring, sign-out button handler) is preserved.
- [ ] Delete the block 1362–1404 (the `btnSignIn` / `btnSignOut` handlers that fake-write to `localStorage`, plus the `updateUserSection()` definition + its trailing invocation on line 1404).
- [ ] Wire the buttons in `index.html` via `js/00-auth.js` instead — `btnSignIn` calls `signInWithGoogle()` (or opens a small magic-link prompt), `btnSignOut` calls `signOut()`.
- [ ] Verify nothing else in `js/15-project.js` calls the removed `updateUserSection`. (`grep -n updateUserSection js/15-project.js` should be empty after the edit.)

### 5.5 `index.html` minimal touch-up (0.5 day)
- [ ] Add the Supabase CDN script tag (per migration-details L212).
- [ ] Add `<script src="js/00-auth.js"></script>` and `<script src="js/00-api-client.js"></script>` at the appropriate place in the existing script load order (before `js/15-project.js`).
- [ ] Do NOT touch the user-menu DOM, the BYOK settings UI, or any other element in `index.html` — that cleanup belongs to Phase 07.

### 5.6 E2E test (1 day)
- [ ] Add Playwright to `devDependencies`. Add `pnpm test:e2e` script.
- [ ] Test 1: navigate to app → click sign in with magic link → grab the link from Supabase Inbucket inbox → follow it → assert signed-in UI → assert `/v1/me` returns 200 → click sign out → assert signed-out UI.
- [ ] Test 2 (smaller): unauthenticated `fetch('/v1/me')` returns 401.
- [ ] Wire `pnpm test:e2e` into CI (uses Supabase local stack via `supabase start`).

### 5.7 Phase 01 open question resolution + docs (0.5 day)
- [ ] Founder confirms production domain (Phase 01 OQ #3). Record in `infra/README.md`.
- [ ] Update `infra/README.md` with the JWT-verification flow + CORS allowlist.
- [ ] Open tracking issue "Phase 02 done" with the 9 exit criteria.

**Estimated total:** ~5 working days; calendar 2–3 weeks for solo founder + 1 engineer (CORS wrangling, OAuth callback URL config, magic-link inbox setup all cost real wall-clock time even if dev time is small).

---

## 6. Acceptance & test plan

### Smoke checklist
1. Sign in with Google → user-menu shows email → `/v1/me` returns `{ id, email }`.
2. Sign in with magic link → same.
3. Sign out → user-menu reverts to signed-out state → `/v1/me` returns 401.
4. `grep -n stori_user js/15-project.js` returns nothing.
5. `grep -n updateUserSection js/15-project.js` returns nothing.
6. Playwright E2E green in CI.
7. CORS: `curl -H "Origin: https://example.com" -X OPTIONS https://<cloudrun>/v1/me` returns no `Access-Control-Allow-Origin` (or returns one ≠ example.com).

### Manual verification (post-impl)
- [ ] **Engineer:** leave a tab open with a valid session for 65 minutes; refresh; `/v1/me` still returns 200 (validates session refresh).
- [ ] **Founder:** verify the OAuth consent screen displays correct branding (app name, logo, support email).

---

## 7. Dependencies

### Predecessors
- **Phase 01** must exit. Specifically: Supabase project + `users` table + RLS policy + Cloud Run service + JWT secret env var + production-domain decision.

### Successors
- **Phase 03** (API Contract + Project State) requires `verifyUser` middleware to be in place for every `/v1/projects/*` endpoint.
- **Phases 05, 05, 06, 07** all transitively require Phase 02.

### Files this phase touches
- New: `js/00-auth.js`, `js/00-api-client.js`, `infra/cloud-run/middleware/auth.js` (or wherever the Hono middleware lands), `tests/e2e/auth.spec.js` (or .ts).
- Modified:
  - `js/15-project.js` — delete lines 1362–1404 (auth stub + `updateUserSection`).
  - `index.html` — add 3 script tags; do NOT touch BYOK UI or any other DOM.
  - `infra/cloud-run/index.js` (or whatever the Hono entrypoint is named) — add middleware + `/v1/me`.
  - **`api/kling.js`** — patch CORS at lines 8 + 39: replace `Access-Control-Allow-Origin: '*'` with origin allowlist (`https://kaatchiai.com` + `https://www.kaatchiai.com` + dev origins). No other changes — server-side Kling JWT migration is P05 territory.
  - `.github/workflows/ci.yml` — add e2e job.
- Forbidden: any other file in `js/`. Phase 02 is auth-only.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OAuth callback URL mismatch (common foot-gun) | M | M | Document the exact URL in `infra/README.md`. Test against staging Supabase project first; only flip prod after staging works. |
| Magic-link email lands in spam during dogfooding | M | L | Use Supabase Inbucket for dev; Supabase shared SMTP for prod is enough for current zero-customer state (override O13). |
| `js/15-project.js` line numbers have shifted since Phase 01 (someone unrelated edited the file) | L | M | First step in §5.4 is to re-read lines 1350–1410 and confirm the block is still where we expect. If shifted, re-anchor by string match on the literal `localStorage.setItem('stori_user'` rather than by line number. |
| Auto-refresh fails silently and user appears signed in but JWT is stale | L | H | Subscribe to `onAuthStateChange` and to Supabase's `TOKEN_REFRESHED` event; on `SIGNED_OUT` event, force a UI reload. Long-idle test in §6 catches the bug. |
| CORS misconfig blocks the web app entirely | M | H | Test with the staging Supabase + Cloud Run before flipping prod; lock CORS in code, not in Cloud Run config UI. |
| `verifyUser` middleware accidentally not applied to a future endpoint | M | H | Phase 03 ADR-03 will define the API contract such that the route loader applies the middleware globally to `/v1/*` (whitelist `/v1/health` and `/v1/sentry-smoke` as the only public routes). Audit-grep for `app.get|post|put` without the wrapper as a CI lint rule (Phase 03 work). |

---

## 9. Open questions

1. **Production domain confirmed?** [**blocking** — must be answered before Phase 02 exit; carried forward from Phase 01 OQ #3.] **Founder action required.**
2. **Use direct `jose` verify or `@supabase/supabase-js` server-side `auth.getUser`?** [non-blocking — recommend `jose` for latency; finalize at §5.3]. ADR-05 will record the call.
3. **Magic-link redirect URL — single page or environment-aware?** [non-blocking]. Default to single-page; revisit if dev/staging/prod URLs diverge.
4. **JWT lifetime: keep Supabase default (1 hour access, 7-day refresh) or shorten?** [non-blocking — keep defaults; ADR-05 records this].
5. **Should `/v1/me` cache user lookups?** [non-blocking — no, JWT itself carries id+email; no DB hit needed].

---

## 10. Cross-cutting decisions raised by this phase

| Decision | Phases affected | ADR ref |
|----------|-----------------|---------|
| Auth & session — Supabase Auth flow, JWT lifetime, refresh strategy, RLS baseline, CORS lock to production domain | 02, 03, 07 | **ADR-05** |
| API contract — `/v1/*` namespace + versioning + auth flow + error model (must accommodate future mobile consumer) | 03, 04, 05, 06 | **ADR-03** (decision is in Phase 03; this phase only ships the JWT verification piece of it) |

---

## 11. Links

- Phase index: `/Users/praveen/Desktop/stori/migration-plan.md`
- Predecessor: `/Users/praveen/Desktop/stori/migration-phase-01-backend-foundations.md`
- Successor: `/Users/praveen/Desktop/stori/migration-phase-03-api-contract-and-project-state.md`
- Source spec: `/Users/praveen/Desktop/stori/migration-details.md` §New Files Frontend L103–116, §Modified Files §`js/15-project.js` L179–183 (line range corrected — see Part 4 of phase index), §Security Non-Negotiables L248–292 (rows 1, 2, 5, 6 only — billing rows 3 + 4 stripped per O15)
- Verified line range: `js/15-project.js:1362–1404` (auth stub + `updateUserSection`); spec's `1174-1177` is wrong (lines 1174–1177 are PiP video restoration). See `/Users/praveen/Desktop/stori/devDoc-migration/.architect/spec-inventory.md` Part 5 unanchored claim #1.
- ADRs: `/Users/praveen/Desktop/stori/migration-adr-05-auth-and-session.md`, `/Users/praveen/Desktop/stori/migration-adr-03-api-contract.md`

*End of Phase 02 dev doc.*
