# Senior Engineer Audit: Migration Plan Logical Consistency Review

**Date:** 2026-05-06  
**Reviewer:** Senior Engineer Audit  
**Scope:** Critical review of `migration-plan.md`, all phase docs, ADRs, and codebase verification

---

## Executive Summary

The migration plan is well-structured with clear phase boundaries, sensible dependency ordering, and thorough ADRs. However, I've identified **7 critical issues**, **5 significant issues**, and **several minor items** that could cause problems during execution. The most dangerous gaps are around incomplete BYOK deletion scope, the `callGeminiAPI` abstraction layer being misunderstood, MediaPipe server-side feasibility, and an architectural gap in how `17a-create-api.js` functions as a shared dependency across pipelines.

---

## 🔴 CRITICAL ISSUES

### 1. BYOK Key Deletion Scope Is Incomplete — `stori_kling_*` and `stori_elevenlabs_key` Are Missing

**The plan's P06 deletion sweep only targets `stori_key_paid` / `stori_key_free`.** The codebase actually has **three** BYOK key families:

| Key family | References | Location |
|------------|------------|----------|
| `stori_key_paid` / `stori_key_free` | 13 in JS, ~3 in HTML | `15-project.js`, `17a-create-api.js`, `20-reels-creator.js`, `24-photopilot.js`, `index.html` |
| `stori_kling_access_key` / `stori_kling_secret_key` | 4 in JS, 4 in HTML | `21-kling.js`:13-14, `17a-create-api.js`:822-823, `index.html`:2188,2193,2958,2963 |
| `stori_elevenlabs_key` | 2 in JS, 6 in HTML | `17a-create-api.js`:296,583, `index.html` (2 input fields + 2 save buttons + 2 status spans) |

P06 exit criteria grep for `stori_key_paid|stori_key_free` returning 0 would pass while **6 Kling key references and 2 ElevenLabs key references (plus 6 HTML elements) remain in production**. This is a data exfiltration risk — these keys would still be stored in `localStorage` and could still be read by JS.

**Fix:** P06 exit criteria must grep for all three key families. The P06 deletion sweep must cover:
- `stori_kling_access_key`, `stori_kling_secret_key`, `stori_elevenlabs_key`
- Kling key input sections in `index.html`
- ElevenLabs key input sections in `index.html`
- `saveKlingKey()`, `saveElevenLabsKey()`, `getElevenLabsKey()`, `generateKlingJWT()`, `getPPApiKey()` helper functions

---

### 2. `callGeminiAPI()` Is a Shared Abstraction, Not Just a Call Pattern — P04/P05 Underestimate the Coupling

The plan treats the extraction as "replace `fetch('googleapis.com/...')` with `callApi()`." But the codebase already has an abstraction layer: **`callGeminiAPI()` in `17a-create-api.js`** is called from **50+ sites** across at least 8 files:

- `17a-create-api.js` (definer + internal callers)
- `17b-create-references.js` (3 calls)
- `17c-create-pipeline.js` (9 calls)
- `20-reels-creator.js` (16 calls)
- `24-photopilot.js` (6 calls)
- `26-brainstorm.js` (1 call)
- `26b-llm-router.js` (1 call)
- `31-input-parser.js` (2 calls)
- `32-audio-input.js` (6 calls)

This is not just "replace direct fetches." `callGeminiAPI()` is a function that:
1. Looks up the API key via `getCreateGeminiKey()` (BYOK path)
2. Iterates over model fallbacks with rate-limit retry
3. Calls `trackCost()` for cost tracking
4. Calls `generativelanguage.googleapis.com` with `?key=` (key-in-URL, not Bearer)

The `js/00-api-client.js` planned in P02 (a thin `callApi(path, body)` wrapper) is architecturally different from `callGeminiAPI()`. The plan needs to address:
- Will `callGeminiAPI()` be replaced entirely by `callApi()`, or will it be refactored to call `callApi()` internally?
- `callGeminiAPI()` is defined in `17a-create-api.js` but called from files that belong to P04 (reels-creator) **and** P05 (photopilot, brainstorm, audio-input, input-parser). P04 extracting only its own files while leaving `callGeminiAPI()` in `17a-create-api.js` as a shared dependency across phase boundaries creates a coupling problem.
- `getCreateGeminiKey()`, `getPPApiKey()`, `getReelApiKey()`, `getFreeKey()`, `getPaidKey()`, `getReelFreeKey()`, `getReelPaidKey()` — all defined in `17a-create-api.js` — must all be replaced, not just the `fetch` calls.

**Fix:** The phase docs need an explicit "shared dependency" item that covers `17a-create-api.js`. P02 creates the `callApi()` wrapper. P04 replaces `callGeminiAPI()` and friends in the P04 pipeline files. P05 replaces them in P05 pipeline files. P06 deletes `callGeminiAPI()`, all key-getter functions, and the BYOK scaffolding from `17a-create-api.js`. The current plan doesn't articulate this clearly; it risks P04 leaving `callGeminiAPI()` in a broken half-migrated state.

---

### 3. `21-kling.js` Uses a BYOK Key Pattern That P04's Architecture Doesn't Account For

`21-kling.js` has a fundamentally different BYOK pattern from the Gemini keys:

```javascript
// Lines 13-14: Client-side JWT generation from Kling keys stored in localStorage
const ak = localStorage.getItem('stori_kling_access_key');
const sk = localStorage.getItem('stori_kling_secret_key');
// Then: generateKlingJWT() creates an HMAC-SHA256 JWT using the secret key
// Then: fetch(`${KLING_BASE}/videos/image2video`, { headers: { Authorization: `Bearer ${jwt}` } })
```

This is **client-side JWT generation** — the browser creates a signed JWT using the Kling secret key and sends it to the proxy. The proxy at `/api/kling` currently just forwards `Authorization: Bearer <jwt>` headers.

After migration:
- The Kling keys must be removed from client-side (they'd be server-side env vars)
- The JWT must be generated server-side, not client-side
- `generateKlingJWT()` and `fetchClipAsUrl()` must move to Cloud Run
- `21-kling.js` (259 lines) calls the **existing `/api/kling` Vercel proxy** — NOT Google directly

The P04 doc says "zero direct `fetch` to `generativelanguage.googleapis.com` in `js/21-kling.js`" (exit criterion 4), but `21-kling.js` doesn't call Google — it calls the existing `/api/kling` proxy. The exit criterion is checking for the wrong thing. The actual migration target is replacing the client-side Kling key + JWT generation with a `callApi('/v1/jobs/animation')` flow.

**Fix:** P04 exit criteria must verify:
- `stori_kling_access_key` and `stori_kling_secret_key` are no longer read from `localStorage`
- `generateKlingJWT()` is removed from `21-kling.js`
- Client calls `/v1/jobs/animation` and polls `/v1/jobs/:id` instead of calling `/api/kling` directly

---

### 4. ElevenLabs Direct API Calls Are Not in Any Pipeline's Extraction Scope

`js/17a-create-api.js` has **4 direct `fetch` calls** to `api.elevenlabs.io`:
- `https://api.elevenlabs.io/v1/speech-to-text` (line 317)
- `https://api.elevenlabs.io/v1/voices` (line 602)
- `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}` (line 696)
- `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps` (line 747)

The P05 phase doc specifies `/v1/jobs/voice-rehearsal` (ElevenLabs TTS) and `/v1/audio/transcribe` (Gemini) but **doesn't enumerate what happens to the existing ElevenLabs speech-to-text (`/v1/speech-to-text`) and voice catalog (`/v1/voices`) endpoints**. These are used for subtitle alignment, not voice rehearsal. The P05 doc's endpoint inventory doesn't include these.

Also, the existing code in `17a-create-api.js` is shared across P04 (AutoPilot, which uses some `callGeminiAPI`) and P05 (Audio/Brainstorm/Photopilot). The "shared file" problem means P04 can't fully extract AutoPilot without also touching `17a-create-api.js`, which serves P05's pipelines too.

**Fix:** P05 must explicitly include server-side ElevenLabs proxy endpoints for:
- `/v1/audio/transcribe` (replacing `api.elevenlabs.io/v1/speech-to-text`)
- `/v1/audio/voices` (replacing `api.elevenlabs.io/v1/voices`)

The plan and P05 exit criteria must grep for `api.elevenlabs.io` in addition to `generativelanguage.googleapis.com`.

---

### 5. P03 Line Count Claim for Canvas Is Misleading — 3,658 of 4,498 Lines Stay Client-Side

The plan and P05 both cite "Canvas 4,498 lines" as part of the extraction surface. But:
- `29-canvas-render.js` = 3,658 lines
- `27-canvas-state.js` = 616 lines
- `28-canvas-consistency.js` = 224 lines

P05 itself explicitly says `29-canvas-render.js` stays client-side ("the canvas DOM/SVG renderer and is editor/UI, not extraction surface"). Yet P05 still claims to extract **Canvas 4,498 lines**. The actual extraction surface for Canvas is `27-canvas-state.js` (616 lines — schema + validation) + `28-canvas-consistency.js` (224 lines — validation gate), totaling **840 lines**, not 4,498.

This inflates P05's line count by ~3,658 lines and makes the phase look heavier than it is. The actual P05 extraction surface is closer to **~10,207 lines**, not 13,507.

**Fix:** In the plan, separate "Canvas extraction surface" (840 lines: state + consistency) from "Canvas total" (4,498 lines). P05 effort estimate should reflect the true extraction surface.

---

### 6. P02's Auth Stub Line Range Is Wrong — Plan Corrects `1174-1177` to `1363-1404`, But the Actual Block Spans `1362-1404`

The plan (Part 4, P02 rationale) says the verified line range is **1363–1404**. But examining the actual file:

```
1362: if (btnSignIn) btnSignIn.addEventListener('click', () => {
1363:   localStorage.setItem('stori_user', JSON.stringify({ name: 'User', email: 'user@email.com' }));
...
1404: updateUserSection();
```

The `if (btnSignIn)` line at 1362 is part of the auth stub block (it binds the click handler that writes the fake auth). The plan says "1363-1404" but should say "1362-1404" to include the `if` statement line. This is minor but could cause P02 verification grep to miss the event listener binding.

---

### 7. P05 Claims Lipsync Is a "Long Job" — MediaPipe Is Architecturally Problematic as Server-Side

`30-lipsync.js` (352 lines) uses **browser MediaPipe Face Landmarker** loaded from a CDN (`cdn.jsdelivr.net/npm/@mediapipe/tasks-vision`). The P05 doc says "MediaPipe runs server-side on Cloud Run" and "MediaPipe-Node binary footprint adds ~80 MB."

**Problems:**
1. `@mediapipe/tasks-vision` is a **browser/WASM module**. `@mediapipe/tasks-vision` for Node.js (`mediapipe` npm package) is a different package with different API surface. Porting the browser code to server-side MediaPipe is not a drop-in replacement — it's essentially a rewrite of the detection logic.
2. The current `30-lipsync.js` does: frame extraction from video → MediaPipe Face Landmarker detection (in browser) → overlay JSON generation → mouth sprite compositing on a canvas. Moving this server-side means the server must also handle video demuxing, frame-by-frame processing, and composited output — a much more complex pipeline than P05 estimates suggest.
3. The ~80 MB claim for "MediaPipe-Node" is unverified. The actual `@mediapipe/tasks-vision` Node WASM bundle plus model files could be significantly different.

P05 resolves this on 2026-05-06 ("server-side via MediaPipe-Node") but the resolution underestimates the porting effort. The 352-line figure is the **browser implementation** — the server-side port could be 2-3x larger.

**Fix:** Add explicit risk to P05 that the MediaPipe server-side port requires a feasibility spike (1-2 days). If MediaPipe-Node can't handle the same landmark quality as browser MediaPipe, the fallback position should be keeping lipsync client-side and only proxying the output data through the API.

---

## 🟠 SIGNIFICANT ISSUES

### 8. `15-project.js` Auth Stub Line References Are Inconsistent Across Documents

| Document | Claimed Line Range |
|----------|---------------------|
| migration-details.md L110, L243 | 1174-1177 |
| Plan P02 rationale | 1363-1404 |
| Plan P02 exit criterion 4 | "Lines 1362-1404" (actual) |
| P02 phase doc §1.4 | "lines 1362-1404" |
| Inventory unanchored claim #1 | "1363, 1367, 1374, 1404" |

The migration-details.md still says 1174-1177 (the old, wrong range). The plan corrects it to 1363-1404 but misses line 1362 (`if (btnSignIn)`). The inventory says "1363, 1367, 1374, 1404" which are just the `stori_user` lines, not the full block.

**Fix:** Update migration-details.md line references. Use "lines 1362-1404" consistently everywhere.

---

### 9. `migration-details.md` Is Significantly Stale and Conflicts With the Plan

The migration-details.md (358 lines) was the original spec but now conflicts with the plan in multiple ways:
- **Architecture:** Says "Vercel Functions" only; plan says "Vercel + Cloud Run" (override O3)
- **Project state:** Says "V1 stays in IndexedDB"; plan says "Postgres + R2 from day 1" (override O1)
- **File list:** Lists `api/_lib/quota.js`, Stripe endpoints — all out of scope (O15)
- **Phasing:** Says 4 phases over 8.5 days; plan says 7 phases over 18-24 weeks
- **Schema:** Includes billing columns stripped from the plan
- **Line references:** Wrong auth-stub range (1174-1177 vs 1362-1404)
- **Call sites:** Says "19 fetch-to-Google call sites" but actual count is 21+ in 6 files
- **Deleted code count:** Says "36 refs across 6 files" for BYOK keys; actual is 13 across 4 JS files + HTML

**Fix:** Add a prominent header banner to migration-details.md stating it is superseded by the migration plan and ADR documents. The plan's out-of-scope table (Part 5) marks these as "deferred" or "superseded" but doesn't warn a reader that the document's architecture section is actively misleading.

---

### 10. `index.html` Only Loads 5 JS Files at Parse — The Other 19+ Are Lazy-Loaded

The plan references script-loading patterns in `index.html`, but the actual loading architecture is:
1. Only 5 scripts load at parse time: `01-core.js`, `18-page-transition.js`, `27-canvas-state.js`, `28-canvas-consistency.js`, `15-project.js`
2. The remaining 19+ scripts load lazily via `loadEditorScripts()` (triggered by navigation events)

This means:
- `js/00-auth.js` and `js/00-api-client.js` (planned in P02) must be either loaded eagerly (in the 5-script prelude) or the lazy loader must be restructured. Auth can't be lazy — it's needed before any user interaction.
- `callGeminiAPI()` currently lives in `17a-create-api.js` which is lazily loaded. This means P05's Brainstorm file (`26-brainstorm.js`) calls `callGeminiAPI()` only after the editor loads. The replacement `callApi()` from `00-api-client.js` must be available before or at the same time.

**Fix:** P02 must specify that `00-auth.js` and `00-api-client.js` are **eager-loaded** in the `<script>` prelude section of `index.html` (before the lazy loader), not part of the lazy bundle. The current P02 doc doesn't address this loading order issue.

---

### 11. The Existing `/api/kling` Proxy CORS Configuration Allows `*`

The existing `api/kling.js` (lines 7-9) sets `Access-Control-Allow-Origin: *`. This is acknowledged as a security issue in migration-details.md ("CORS locked to `https://stori.app` — NOT `*`"). However:
- P01 and P02 both establish CORS locking as a security non-negotiable
- But there's no explicit task to **modify the existing `/api/kling` endpoint** to lock its CORS
- The proxy is live in production, accepting any origin
- P04 replaces the Kling proxy with `/v1/jobs/animation`, but until P04 exits, the existing proxy is an open CORS hole

**Fix:** P02 (auth migration) or P01 (backend foundations) should add an explicit task to lock the existing `/api/kling` CORS to the production domain. This is a quick fix (3 lines) that should happen before P04.

---

### 12. `api/kling.js` Has No Auth — This Is a Security Gap That No Phase Currently Addresses

The existing `api/kling.js` (line 8: `Access-Control-Allow-Origin: *`, no JWT check) is a fully open proxy that anyone can call. During P01-P03, this proxy remains open. The plan says P04 replaces it, but there's no interim mitigation. Given override O13 ("no customers"), this is arguably acceptable, but it should be an explicit documented risk — not an implicit one.

---

## 🟡 MINOR ISSUES

### 13. P06's BYOK Reference Count (13 across 4 files) Is Already Stale

P06 claims "13 references across 4 files: `js/15-project.js`, `js/24-photopilot.js`, `js/17a-create-api.js`, `js/20-reels-creator.js`." My actual grep finds **13 in JS only**, but the file count should include `index.html` (3 more BYOK key input fields for Gemini, 4 for Kling, 6 for ElevenLabs). By P06 kickoff, these numbers will have shifted. P06 acknowledges this ("re-verify at kickoff"), so this is fine — just note that the current baseline in the doc is already stale.

---

### 14. `callGeminiAPI()` Track-Cost Function Is Unaddressed

`17a-create-api.js:472` calls `trackCost('textGeneration', 1)` inside `callGeminiAPI()`. This is a client-side cost tracking function. It's not listed in the "Deleted Code" section of migration-details.md, and no phase doc explicitly says what happens to it. Since the migration moves all cost tracking server-side (override O15 defers billing), this function and all its call sites need explicit deletion in P06.

---

### 15. `vercel.json` Routing Strategy for Cloud Run Is Not Addressed

The existing `vercel.json` has `/api/kling` as a Vercel Function with 30s max duration. As the migration adds Cloud Run handlers for `/v1/*`, the routing strategy (ADR-03 mentions "path-based routing at the edge") needs an explicit plan for which paths go to Vercel Functions vs Cloud Run. The current `vercel.json` doesn't address this, and neither does any phase doc specify how the routing is configured.

**Fix:** Phase 01 or 03 should set up the `vercel.json` path rewrites for `/v1/*` → Cloud Run. ADR-03 mentions it but the phase docs don't have a concrete task item.

---

### 16. P03 Claims `js/15-project.js` Save/Load "Fully Replaced" But IndexedDB Is Deeply Embedded

`15-project.js` (1,404 lines) is deeply intertwined with IndexedDB. It has:
- A `GALLERY_DB_NAME` and gallery database (line 16)
- A `LIBRARY_DB_NAME` and library database (line 355)
- Complex save/load patterns throughout the file

P03's exit criterion says "no remaining IndexedDB writes for new projects." But the gallery and library databases are used for local project storage. The plan says "Existing IndexedDB code paths can stay as a fallback" — but given O13 (zero customers), there are no real users with existing local projects. The code complexity of maintaining dual paths (IDB + API) across P03-P06 needs to be explicitly acknowledged.

---

### 17. Override O2 ("Mobile launches alongside web") Contradicts the Plan

Override O2 in the spec inventory says "Mobile launches alongside web (not after)." But the plan explicitly drops the mobile phase from this cycle, making O2 a future-cycle concern. The spec inventory still lists O2 as an active override. This isn't a bug per se (the plan notes mobile is deferred), but it's confusing to someone reading the inventory.

**Fix:** Mark O2 as "deferred to future mobile cycle" in the inventory, similar to how O11 and O12 are marked.

---

## ✅ WHAT THE PLAN GETS RIGHT

1. **Phase ordering is sound.** The strict linear chain P01→P02→P03→P04→P05→P06→P07 is correct. Auth before API endpoints, project state before pipeline outputs, heavy extraction before secondary extraction, cutover last.

2. **ADR-02 (long-running jobs) is well-designed.** The in-process worker with `FOR UPDATE SKIP LOCKED`, idempotency keys, and no-auto-retry is pragmatic and correct for current scale.

3. **ADR-06 (mode-lock invariant) is precisely specified.** The `mode_locked_at` timestamp column, 409 enforcement, and defense-in-depth (SQL trigger + route handler) are excellent engineering.

4. **The P03 schema-design spike (3 days) reading `27-canvas-state.js` directly is the right call.** The code is the source of truth, not the spec documents.

5. **ADR-07 (R2 presigned URLs) choosing direct browser-to-R2 upload avoids the Cloud Run 32 MB body limit and egress costs.** This is architecturally sound.

6. **The explicit billing/quota exclusion (O15) is cleanly handled.** No `quota.js`, no Stripe, no subscription tables in any ADR or phase doc, and every reference is marked as out-of-scope.

---

## RECOMMENDED ACTIONS (Priority Order)

### Must Fix Before Execution (Critical)

1. **P06 exit criteria must cover all three BYOK key families** (`stori_key_*`, `stori_kling_*`, `stori_elevenlabs_*`), the Kling JWT generation, and the ElevenLabs API key inputs in `index.html`. This is a security issue.

2. **Add an explicit "shared dependency migration strategy" for `17a-create-api.js`** — `callGeminiAPI()` and its key-getter helpers are used across P04 and P05 pipeline files. P02 creates `callApi()`, but each subsequent phase needs a clear item: "refactor `callGeminiAPI()` callers in file X to use `callApi()` and delete the local `getCreateGeminiKey()` / `getPPApiKey()` / `getReelApiKey()` calls."

3. **P04 must explicitly address `21-kling.js` migration** — the current proxy architecture (client-side JWT from BYOK keys → existing `/api/kling` Vercel proxy) is fundamentally different from the planned `callApi('/v1/jobs/animation')` pattern. The JWT generation must move server-side. Add this as an explicit task item in P04.

4. **P05 must include `api.elevenlabs.io` endpoints** (speech-to-text, voice catalog, TTS) in its extraction scope and exit criteria. Add grep for `api.elevenlabs.io` alongside `generativelanguage.googleapis.com`.

5. **Add a MediaPipe server-side feasibility spike** (1-2 days) at the start of P05 Track B.2 before committing to server-side lipsync. If the spike fails, keep lipsync client-side with output data going through the API.

6. **P02 must eagerly load `00-auth.js` and `00-api-client.js`** in the `<script>` prelude of `index.html`, before the lazy editor scripts. Document this loading order requirement.

7. **Lock CORS on `api/kling.js`** early (P01 or P02) as a security quick-fix, even before P04 replaces it entirely.

### Should Fix (Significant)

8. **Update migration-details.md** with a prominent banner stating it's superseded. Fix the stale line references (1174-1177 → 1362-1404), stale call-site counts, and conflicting architecture description.

9. **Correct P03's Canvas line count claim** from 4,498 to 840 for the actual extraction surface (state + consistency files only).

10. **Add `vercel.json` routing task** to Phase 01 or 03 for `/v1/*` → Cloud Run path rewrites.

### Nice to Have (Minor)

11. **Mark Override O2 as deferred** in the inventory to avoid confusion.

12. **Acknowledge the IndexedDB dual-path complexity** in P03 — either commit to deleting it entirely or explain why the complexity is acceptable.

---

## VERIFIED ACCURATE CLAIMS

The following claims from the plan verified against the codebase:

- ✅ P04 line count: `20-reels-creator.js` (5,839) + `17a-create-api.js` (1,830) + `17b-create-references.js` (4,935) + `17c-create-pipeline.js` (5,199) + `17d-create-languages.js` (1,312) = **19,115 lines**
- ✅ P05 line counts: PhotoPilot (3,447), Brainstorm (1,881), Input-Parser (809), Audio (2,520), Canvas (actual extraction: 840, not 4,498)
- ✅ `callGeminiAPI()` has 50+ call sites across 8+ files
- ✅ Direct `generativelanguage.googleapis.com` URLs: 21 occurrences across 6 files
- ✅ Auth stub fake user code at `15-project.js:1362-1404`
- ✅ BYOK key patterns: 3 key families, not 2
- ✅ `21-kling.js` calls `/api/kling` proxy, not Google directly

---

## END OF AUDIT

This audit was conducted by examining:
- All phase docs (`migration-phase-01` through `migration-phase-07`)
- All ADRs (`migration-adr-01` through `migration-adr-08`)
- The migration plan (`migration-plan.md`)
- The migration details spec (`migration-details.md`)
- The spec inventory and coverage matrix
- All relevant JS source files (18 pipeline + auth files)
- `index.html` script loading patterns
- Existing `api/kling.js` proxy