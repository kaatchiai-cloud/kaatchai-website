# Stori — Vercel + Supabase Migration Details

> **SUPERSEDED — see `migration-plan.md` revision 4 for current architecture. This document retains historical context only; do not implement from it.**


## Product Direction
- No BYOK (Bring Your Own Key)
- Stori hosts Gemini and Kling API keys
- Users access via subscription plans
- Hosted on Vercel Pro, Auth + DB via Supabase, Billing via Stripe
- **V1: Project data stays in browser localStorage/IndexedDB** — no cloud sync
- V2: Migrate projects to Supabase Storage (images/audio) + Supabase DB (metadata/prompts)

---

## Architecture

```
Browser (js/)
  ↓  Supabase JWT in Authorization header
Vercel Serverless Functions (api/)
  ↓  verify JWT → check quota → call upstream → log usage → return result
Google Gemini API / Kling API
  (keys stored only in Vercel env vars)
```

---

## Environment Variables

### Vercel (server-only — never in browser)
```
GEMINI_API_KEY
KLING_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY      ← admin DB access, never expose to browser
SUPABASE_JWT_SECRET            ← for verifying user JWTs server-side
```

### Browser (intentionally public)
```
SUPABASE_URL                   ← just a domain
SUPABASE_ANON_KEY              ← designed to be public; RLS protects data
```

---

## Supabase Database Schema

```sql
-- Users (extended profile, linked to Supabase auth.users)
create table public.users (
  id uuid references auth.users primary key,
  email text,
  plan text default 'free',             -- 'free' | 'starter' | 'pro'
  stripe_customer_id text,
  images_used int default 0,
  images_limit int default 20,          -- per billing period
  videos_used int default 0,
  videos_limit int default 0,
  period_start timestamptz default now(),
  period_end timestamptz,
  created_at timestamptz default now()
);

-- Subscriptions
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users,
  stripe_subscription_id text,
  plan text,
  status text,                          -- 'active' | 'canceled' | 'past_due'
  current_period_end timestamptz,
  created_at timestamptz default now()
);

-- Usage events (audit log + billing reference)
create table public.usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users,
  type text,                            -- 'imageGen' | 'gridGen' | 'tts' | 'lyria' | 'kling' | 'transcribe' | 'vision'
  count int default 1,
  estimated_cost numeric(10,4),
  model text,
  created_at timestamptz default now()
);

-- Projects table: V2 only (V1 uses IndexedDB)

-- Row-Level Security (CRITICAL — users can only see their own rows)
alter table public.users enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage enable row level security;

create policy "users_own" on public.users for all using (auth.uid() = id);
create policy "subs_own" on public.subscriptions for select using (auth.uid() = user_id);
create policy "usage_own" on public.usage for select using (auth.uid() = user_id);
```

---

## New Files to Create

### Frontend

**`js/00-auth.js`** (~80 lines)
- Initialize Supabase client with `SUPABASE_URL` + `SUPABASE_ANON_KEY`
- Export `getSession()`, `getUser()`, `signInWithGoogle()`, `signInWithMagicLink()`, `signOut()`
- On page load: check session, call `updateUserSection()`
- Listen to `supabase.auth.onAuthStateChange` to update UI
- Replaces the stub in `js/15-project.js:1174-1177`

**`js/00-api-client.js`** (~60 lines)
- Single `callApi(path, body)` wrapper used by all JS files
- Injects Supabase JWT (`Authorization: Bearer <token>`) on every request
- Handles 401 (session expired → redirect to sign-in) and 429 (quota exceeded → show message)
- All 19 fetch-to-Google call sites import this instead of calling fetch directly

### Backend (Vercel Serverless Functions)

**`api/_lib/auth.js`** (~30 lines)
- `verifyUser(req)` — extracts Bearer token, verifies with Supabase, returns user object
- Returns 401 if missing or invalid

**`api/_lib/quota.js`** (~50 lines)
- `checkAndDeductQuota(userId, type, count)` — atomically checks and decrements usage
- Uses Supabase RPC (postgres function) for atomic decrement to prevent race conditions
- Returns 429 with `{ error: 'quota_exceeded', limit, used }` if over limit

**`api/_lib/log.js`** (~20 lines)
- `logUsage(userId, type, count, cost, model)` — inserts into `usage` table

**`api/gemini/generateContent.js`** (~60 lines)
- Proxies: transcription, text generation, scene descriptions
- Auth → quota check (type: `transcribe`) → call Gemini → log → return

**`api/gemini/imageGen.js`** (~60 lines)
- Proxies: single image generation (individual scenes, regenerate)
- Auth → quota check (type: `imageGen`) → call Gemini → log → return

**`api/gemini/imageGenGrid.js`** (~90 lines)
- Proxies: 3×3 grid image generation
- Async: stores job in Supabase, returns `{ jobId }` immediately
- Client polls `/api/job/[id]` for result
- Auth → quota check (type: `gridGen`) → call Gemini (up to 50s) → store result → log

**`api/gemini/tts.js`** (~50 lines)
- Proxies: Gemini TTS for voiceover generation
- Auth → quota check (type: `tts`) → call Gemini → return base64 audio

**`api/gemini/lyria.js`** (~70 lines)
- Proxies: Lyria 3 BGM generation
- Async (can take 30-60s): stores job, returns `{ jobId }`
- Client polls `/api/job/[id]`

**`api/gemini/vision.js`** (~40 lines)
- Proxies: auto-describe reference images (V2 — keep stub for now)

**`api/kling.js`** — already exists, add JWT verification + quota check

**`api/job/[id].js`** (~30 lines)
- Polls job status from Supabase
- Returns `{ status: 'pending' | 'done' | 'error', result? }`

**`api/stripe/checkout.js`** (~50 lines)
- Creates Stripe Checkout session for a plan
- Redirects user to Stripe-hosted payment page

**`api/stripe/webhook.js`** (~70 lines)
- Verifies `stripe-signature` header (CRITICAL — prevents spoofed events)
- Handles: `checkout.session.completed` → activate plan, `invoice.payment_failed` → downgrade, `customer.subscription.deleted` → cancel

**`api/stripe/portal.js`** (~20 lines)
- Creates Stripe Customer Portal session (handles plan changes, cancellations — no custom UI needed)

---

## Modified Files

### `js/15-project.js`
- **Remove**: fake auth stub (lines 1174-1177), `localStorage.setItem('stori_user', ...)`
- **Remove**: `updateUserSection()` (moves to `js/00-auth.js`)
- **Keep**: all IndexedDB save/load logic unchanged (V1 stays local)
- **Lines changed**: ~20

### `js/17a-create-api.js`
- **Remove**: `getCreateGeminiKey()` function and all callers (key comes from server now)
- **Remove**: BYO-key input field references (`stori_key_paid`, `stori_key_free`)
- **Replace**: cost display logic — show "X images remaining" from user quota instead of dollar estimates
- **Lines changed**: ~40

### `js/17c-create-pipeline.js`
- **Replace**: 10 direct `fetch('https://generativelanguage...')` calls with `callApi('/api/gemini/...')`
- **Remove**: `?key=${key}` params from all calls
- **Add**: polling loop for async endpoints (grid gen, lyria)
- **Lines changed**: ~50

### `js/20-reels-creator.js`
- **Replace**: 6 direct Google API fetch calls with `callApi()`
- **Lines changed**: ~20

### `js/17d-create-languages.js`
- **Replace**: 1 TTS fetch call with `callApi('/api/gemini/tts')`
- **Lines changed**: ~5

### `js/21-kling.js`
- **Add**: Auth header to requests (already goes through `/api/kling`)
- **Lines changed**: ~5

### `index.html`
- **Remove**: BYO API key input fields and settings section
- **Replace**: Login button → Google OAuth button + magic link option
- **Add**: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`
- **Lines changed**: ~30

### `vercel.json`
```json
{
  "functions": {
    "api/gemini/imageGenGrid.js": { "maxDuration": 60 },
    "api/gemini/lyria.js":        { "maxDuration": 60 },
    "api/gemini/generateContent.js": { "maxDuration": 60 },
    "api/gemini/tts.js":          { "maxDuration": 60 },
    "api/kling.js":               { "maxDuration": 30 }
  },
  "rewrites": [
    { "source": "/api/gemini/:path*",   "destination": "/api/gemini/:path*" },
    { "source": "/api/job/:path*",      "destination": "/api/job/:path*" },
    { "source": "/api/stripe/:path*",   "destination": "/api/stripe/:path*" },
    { "source": "/api/kling/:path*",    "destination": "/api/kling" }
  ]
}
```

---

## Deleted Code

| What | Where | Reason |
|---|---|---|
| `stori_key_paid` / `stori_key_free` localStorage | 36 refs across 6 files | Keys now server-side |
| BYO-key settings UI | `index.html`, `17a-create-api.js` | No longer needed |
| Dollar cost estimate functions | `17a-create-api.js` | Replaced by quota display |
| Fake auth stub | `js/15-project.js:1174-1177` | Replaced by Supabase auth |
| `updateUserSection()` (old) | `js/15-project.js` | Rewritten in `00-auth.js` |

---

## Security Non-Negotiables

### 1. JWT verification on every endpoint
```javascript
// Every api/ function must start with:
const user = await verifyUser(req);
if (!user) return res.status(401).json({ error: 'Unauthorized' });
```
Without this, anyone knowing the URL can call your proxy and burn your Gemini budget.

### 2. CORS locked to your domain
```javascript
res.setHeader('Access-Control-Allow-Origin', 'https://stori.app'); // NOT '*'
res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
```

### 3. Quota enforced server-side via atomic DB operation
```sql
-- Supabase RPC — prevents race condition where 2 parallel requests both pass
create or replace function deduct_quota(p_user_id uuid, p_type text, p_count int)
returns boolean language plpgsql as $$
declare remaining int;
begin
  select (images_limit - images_used) into remaining from users where id = p_user_id;
  if remaining < p_count then return false; end if;
  update users set images_used = images_used + p_count where id = p_user_id;
  return true;
end;
$$;
```

### 4. Stripe webhook signature verification
```javascript
const event = stripe.webhooks.constructEvent(
  req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET
);
// If this throws, reject the request — it's a spoofed event
```

### 5. Row-Level Security on all Supabase tables
Every table has `user_id = auth.uid()` policy. Users cannot read each other's projects or usage data even if they craft direct Supabase queries.

### 6. Service role key — server only
`SUPABASE_SERVICE_ROLE_KEY` must only appear in `api/_lib/` files. Never import it in any `js/` frontend file.

---

## Subscription Plans (example)

| Plan | Price | Images/mo | Videos/mo |
|---|---|---|---|
| Free | $0 | 20 | 0 |
| Starter | $X/mo | 300 | 10 |
| Pro | $Y/mo | 1000 | 50 |

Limits enforced in `api/_lib/quota.js`. Show remaining quota in user dropdown UI.

---

## Implementation Phases

### Phase 1 — Auth + one proxied endpoint (prove the pattern)
1. Set up Supabase project, create `users` table + RLS
2. Wire Google OAuth into existing Login button via `js/00-auth.js`
3. Build `api/_lib/auth.js` + `api/gemini/imageGen.js`
4. Replace one image gen call in `17c-create-pipeline.js` with `callApi()`
5. Verify key never appears in browser, request works end-to-end

### Phase 2 — All Gemini endpoints + quota
1. Build remaining proxy functions (generateContent, tts, lyria, vision)
2. Build `api/_lib/quota.js` with atomic Supabase RPC
3. Create `usage` table, wire `api/_lib/log.js`
4. Replace all 19 fetch call sites across 5 JS files
5. Add quota display to user dropdown

### Phase 3 — Stripe billing
1. Create plans in Stripe dashboard
2. Build `api/stripe/checkout.js` + `api/stripe/webhook.js` + `api/stripe/portal.js`
3. Webhook updates `users.plan` + `users.images_limit` on payment
4. Gate features by plan in quota check

### Phase 4 — Project sync (V2 only — deferred)
Project data stays in browser IndexedDB for V1. Users' work is local to their device.
When ready for V2:
- Binary files (images, audio) → Supabase Storage
- Metadata + prompts → Supabase DB `projects` table
- Replace IndexedDB save/load in `js/15-project.js` with API calls

---

## Effort Estimate (V1)

| Phase | Working days |
|---|---|
| Phase 1 (auth + 1 endpoint) | 1.5 |
| Phase 2 (all endpoints + quota) | 4 |
| Phase 3 (Stripe) | 2 |
| CORS, rate limiting, testing | 1 |
| **Total** | **~8.5 days** |

---

## Notes
- Vercel Pro required ($20/mo flat) for 60s function timeout on grid gen and Lyria
- `api/kling.js` already exists and proves the proxy pattern — expand from there
- Grid gen and Lyria must be async (submit → poll) due to 30-60s generation time
- V2: re-enable reference agent (currently commented out) once proxy pattern is stable
- All cost tracking moves from client-side estimates to server-side actual Gemini token counts
- V1 project data stays in IndexedDB — no cloud sync, no cross-device access
- V2 project sync: images/audio → Supabase Storage, metadata/prompts → Supabase DB
