# Phase 02 — Auth Migration: Agent Task Brief

## Scope
- Wire Supabase Auth (Google OAuth + magic link) into web; sign-out works
- Create `js/00-auth.js` (Supabase client, session/user getters, sign-in/out, `onAuthStateChange` listener, `updateUserSection`)
- Create `js/00-api-client.js` (`callApi()` wrapper with Bearer JWT, 401/429/5xx handling)
- Delete fake-auth stub from `js/15-project.js` (~lines 1417–1472; behavioural: `grep stori_user` returns 0)
- Add `verifyUser` JWT middleware on Cloud Run + `/v1/me` endpoint; lock CORS to production domain

## Files to create
| File | Action | Purpose |
|---|---|---|
| `js/00-auth.js` | CREATE | Supabase client init, `getSession()`, `getUser()`, `signInWithGoogle()`, `signInWithMagicLink(email)`, `signOut()`, `onAuthStateChange` → `updateUserSection()`, `updateUserSection()` (moved from 15-project.js) |
| `js/00-api-client.js` | CREATE | `callApi(path, body, opts)` — injects `Authorization: Bearer <jwt>`, handles 401→redirect, 429→toast, 5xx→setStatus+rethrow |
| `infra/cloud-run/middleware/auth.js` | CREATE | `verifyUser` middleware — extracts Bearer token, verifies via `jose` + `SUPABASE_JWT_SECRET`, attaches `user` to context, returns 401 if invalid |
| `tests/e2e/auth.spec.js` | CREATE | Playwright E2E: magic-link sign-in → `/v1/me` 200 → sign-out; unauthenticated `/v1/me` 401 |

## Files to modify
| File | Action | Verified line range | What changes |
|---|---|---|---|
| `js/15-project.js` | MODIFY | ~1417–1472 (anchor: `localStorage.setItem('stori_user'`) | Delete auth-stub block: `btnSignIn`/`btnSignOut`/`btnManageSub` handlers, `updateUserSection()` definition + invocation, all `stori_user` refs. Re-wire buttons to `js/00-auth.js` exports |
| `index.html` | MODIFY | ~4715–4717 (between `js/18-page-transition.js` and `js/27-canvas-state.js`) | Add 3 eager `<script>` tags: Supabase CDN in `<head>`, `js/00-auth.js?v=2`, `js/00-api-client.js?v=2` before `js/15-project.js`. Do NOT touch BYOK UI or other DOM |
| `infra/cloud-run/index.js` | MODIFY | Hono entrypoint | Add `verifyUser` middleware import, `/v1/me` route guarded by it, CORS middleware locked to production domain allowlist |
| `api/kling.js` | MODIFY | Lines 8, 39 | Replace both `Access-Control-Allow-Origin: '*'` with origin allowlist (`https://kaatchiai.com`, `https://www.kaatchiai.com`, `http://localhost:3000`, `http://localhost:5173`) |
| `.github/workflows/ci.yml` | MODIFY | — | Add e2e job (`pnpm test:e2e`) |
| `infra/cloud-run/README.md` | MODIFY | — | Document `verifyUser` as required wrapper for every `/v1/*` endpoint; record loading-order dependency for `00-auth.js` + `00-api-client.js` |
| `infra/README.md` | MODIFY | — | Record production domain value (P01 OQ #3), JWT verification flow, CORS allowlist |

## New endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/me` | Returns `{ id, email }` from verified JWT; guarded by `verifyUser` middleware |

## Exit criteria
```
grep -n "stori_user" js/15-project.js          # must return 0 hits
grep -n "updateUserSection" js/15-project.js    # must return 0 hits
grep -n "btnSignIn\|btnSignOut\|btnManageSub" js/15-project.js  # must return 0 hits
grep -n "Access-Control-Allow-Origin.*'\*'" api/kling.js       # must return 0 hits
grep "00-auth.js" index.html                     # must return 1+ hit
grep "00-api-client.js" index.html               # must return 1+ hit
pnpm test:e2e                                    # must pass
curl -H "Authorization: Bearer <valid-jwt>" <cloudrun>/v1/me   # 200 + {id,email}
curl <cloudrun>/v1/me                                            # 401
curl -H "Origin: https://example.com" -X OPTIONS <cloudrun>/v1/me  # no Access-Control-Allow-Origin header
```

## Constraints
- ADR-05 governs auth/session decisions (JWT lifetime, refresh strategy, CORS lock, RLS baseline)
- `callApi()` replaces `callGeminiAPI()` — but P02 only ships the wrapper; call-site migration is P05/P06/P07
- CORS must NOT be `Access-Control-Allow-Origin: *` (security non-negotiable #2)
- `verifyUser` middleware must be applied to every future `/v1/*` endpoint (ADR-03 in P03 codifies this)
- Do NOT touch any file in `js/` other than `00-auth.js`, `00-api-client.js`, and `15-project.js`
- Do NOT touch BYOK key code, dollar-cost UI, or settings UI — those are P07 territory
- Use `jose` for JWT verification (offline, no Supabase round-trip per request)

## Dependencies
- P01 must exit first (Supabase project, `users` table, RLS policy, Cloud Run service, `SUPABASE_JWT_SECRET` env var, production-domain decision)

## Key files to read before starting
- `/Users/praveen/Desktop/stori/migrations/migration-phase-02-auth-migration.md`
- `/Users/praveen/Desktop/stori/migrations/migration-adr-05-auth-and-session.md`
- `/Users/praveen/Desktop/stori/js/15-project.js` (lines 1350–1500 for auth-stub context)
- `/Users/praveen/Desktop/stori/api/kling.js` (full file; CORS at lines 8, 39)
- `/Users/praveen/Desktop/stori/index.html` (lines ~4710–4750 for script-tag ordering)
- `/Users/praveen/Desktop/stori/infra/cloud-run/index.js` (Hono entrypoint)
- `/Users/praveen/Desktop/stori/build.js` (lines 69–80 for static-script-tag discovery)
