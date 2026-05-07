# Migration Plan Audit (Revision 4) — Critical Review

**Document reviewed:** `/Users/praveen/Desktop/stori/migrations/migration-plan.md` (rev 4, 2026-05-06)  
**Codebase audited:** `/Users/praveen/.local/share/opencode/worktree/4fbeb75f8fe20663a080eaed9c48e549890aae06/stellar-engine/`  
**Date:** 2026-05-06  
**Auditor role:** Senior Engineer  
**Verdict:** The plan is architecturally sound and significantly improved over the original `migration-original-spec.md`. It correctly addresses most of the issues from the first audit (6 provider key surfaces, missing files, `callGeminiAPI` centralization, Kling JWT server-side, all external service families). However, it introduces **3 critical errors, 5 significant issues, and 4 moderate issues** that will cause implementation failures if not corrected before P04 kickoff.

---

## CRITICAL ISSUES (Will Block Implementation)

### C1. P04 `js/17c-create-pipeline.js` exit guard math is catastrophically wrong

The plan states (P04 exit criteria):

> `(17c + 17e + 17f) ≈ 5199 ± 50`

And separately (P04 concrete ops):

> `js/17c-create-pipeline.js` → `js/17c-create-pipeline.js` (~3,200, AutoPilot core) + `js/17e-canvas-launch.js` (~145 lines) + `js/17f-tier2-lipsync-fal.js` (~180 lines)

**The math doesn't work.** If you extract ~145 + ~180 = ~325 lines from a 5,199-line file, the remainder is:
- **5,199 − 325 = 4,874 lines** (using the plan's stated 5,199)
- **5,139 − 325 = 4,814 lines** (using the actual current line count — see C2 below)

Neither is close to the claimed ~3,200. The claim of ~3,200 implies **~1,999 additional lines** would need to be extracted beyond the two named extractions — but no such extraction is specified anywhere in the plan.

**Impact on P05:** P05's scope estimate ("P05 only touches `js/17c-create-pipeline.js` (now ~3,200 lines after the P04 split)") understates the actual extraction surface by **~50%**. P05 is already the longest phase at 6–10 weeks; this makes it significantly harder. The P05 exit criteria and effort estimate are built on the ~3,200 figure and will be wrong.

**Fix:** Either (a) specify what additional ~1,900 lines are being extracted out of 17c during P04 (there would need to be more modules extracted — e.g., TTS, BGM generation, image generation grids, or other self-contained pipelines), or (b) correct the figure to ~4,814 lines and adjust P05's duration estimate upward. The exit guard formula must also change from `≈ 5199 ± 50` to `≈ 5139 ± 50` (see C2).

### C2. `js/17c-create-pipeline.js` is 5,139 lines, not 5,199

**Actual line count: 5,139** (verified by `wc -l`). The plan claims 5,199.

This is **60 lines outside the stated ±50 tolerance** on P04's exit guard. Since the exact line count is used as a regression guard (`(17c + 17e + 17f) ≈ 5199 ± 50`), this number must be corrected or the tolerance widened.

### C3. Files `js/32-audio-input.js` and `js/33-audio-rehearsal.js` do not exist yet

The P03 exit criteria state:

> **every** `indexedDB.open(...)` call site replaced — verified by grep in `js/15-project.js`, `js/20-reels-creator.js`, `js/17b-create-references.js`, `js/32-audio-input.js`, `js/33-audio-rehearsal.js`

These two files are referenced in P03's exit criteria but **do not exist in the codebase**. They are planned future files referenced in `audio-input-plan.md` (§6, §7) and `audio-input-plan-audit.md` as "new module" files that will be created by the audio-input feature plan.

The P06 exit criteria also references them:

> `/v1/audio/*`, `/v1/jobs/voice-rehearsal` all live and called by web

And P06's scope lists "Audio 2,520" and "Input-Parser 809" presumably derived from these files.

**Impact:** P03's exit criteria grepping for `indexedDB.open` in non-existent files will always pass vacuously — those files aren't there to verify. This creates a false exit gate. If P03 exits without audio-input/audio-rehearsal ever being implemented, the IndexedDB migration for audio data will never be verified.

**Fix:** Either (a) make P03's IndexedDB exit criteria conditional: "every `indexedDB.open` call site in currently-existing files is replaced; audio-input and audio-rehearsal IndexedDB migration is deferred to P06 when those files are first created," or (b) explicitly block P03 on `audio-input-plan` and `audio-rehearsal-plan` implementation and add those files as P03 dependencies.

---

## SIGNIFICANT ISSUES (Will Cause Scope Creep or Rework)

### S1. P04 canvas-launch extraction range starts too late — `openCanvasPanel` would be orphaned

The plan claims (P04 concrete ops):

> `js/17e-canvas-launch.js` (~145 lines lifted from current `4889–5029`)

Actual code audit shows:
- `openCanvasPanel` starts at **line 4831**
- `closeCanvasPanel` starts at **line 4865**
- `_callGeminiForVideoPrompts` starts at **line 4876**

The plan's extraction range of lines 4889–5029 **starts from the middle of the `_callGeminiForVideoPrompts` function** (8 lines after it begins). This means `openCanvasPanel` (lines 4831–4863, 33 lines) and `closeCanvasPanel` (lines 4865–4872, 8 lines) would be left behind in `17c-create-pipeline.js` as orphans — they depend on the canvas panel UI that 17e is supposed to own.

**Actual extraction range:** lines ~4831–5020 (~190 lines, not ~145).

**Fix:** Start the extraction at line 4831 to include `openCanvasPanel` and `closeCanvasPanel`, or specify which other functions depend on these and should also move.

### S2. P04 Tier-2 lipsync extraction range includes Lyria BGM code

The plan claims (P04 concrete ops):

> `js/17f-tier2-lipsync-fal.js` (~180 lines lifted from current `3721–3900`)

Actual code shows:
- `getFalApiKey` at **line 3670** — 51 lines before the claimed start
- `_falQueueSubmit` at line 3675
- `_falPollUntilDone` at line 3688
- `_falFetchResult` at line 3709
- `klingLipSyncCall` (the main lipsync entry) at line 3725
- "End Lip sync Phase 8" at **line 3840**
- `runCreateBgm()` (Lyria BGM — NOT lipsync) starts at **line 3878**

Starting the extraction at 3721 **orphaned the four fal.ai helper functions** (lines 3670–3720). Ending at 3900 **incorrectly includes ~60 lines of Lyria BGM code** (`runCreateBgm`), which is NOT Tier-2 lipsync — it belongs in P05's AutoPilot core.

**Fix:** The correct range is approximately **3670–3840** (~170 lines), which captures all lipsync code without accidentally including BGM generation.

### S3. Four IndexedDB databases exist, not three — `stori_cast_images_v1` is missing from the plan

The P03 schema section lists 5 "new" tables including `cast_references` and references `js/17b-create-references.js:683-760`, but it does not explicitly list the `stori_cast_images_v1` IndexedDB database that lives at `js/17b-create-references.js:689`. This database has its own `objectStore` (`images`), `open`, `put`, `get`, and `delete` operations.

**The database inventory should read:**

| Database | File | Purpose |
|---|---|---|
| `stori_projects` | `js/15-project.js:16` | Project gallery |
| `stori_library` | `js/15-project.js:361` | Logo/frame library |
| `stori_db` | `js/20-reels-creator.js:5799,5814` + `index.html:4766` | Pipeline job handoff |
| `stori_cast_images_v1` | `js/17b-create-references.js:689` | Cast image binaries |

P03 must account for all four databases in its IndexedDB migration. The `cast_references` table in P03's schema should explicitly describe how `stori_cast_images_v1` blob data maps to R2 storage (presumably: blob → R2 presigned URL, metadata → Postgres `cast_references` row).

### S4. P03 IndexedDB exit criteria file list is incomplete and references non-existent files

The P03 exit criteria say:

> verified by grep in `js/15-project.js`, `js/20-reels-creator.js`, `js/17b-create-references.js`, `js/32-audio-input.js`, `js/33-audio-rehearsal.js`

Problems:
1. `js/32-audio-input.js` — **does not exist** (see C3)
2. `js/33-audio-rehearsal.js` — **does not exist** (see C3)
3. `index.html` — **missing** from the list, but contains `indexedDB.open('stori_db', 1)` at line 4766
4. `marketing-pipeline/index.html` — **missing**, but contains `indexedDB.open('stori_db', 1)` at line 5150

**Fix:** Correct the list to: `js/15-project.js`, `js/20-reels-creator.js`, `js/17b-create-references.js`, `index.html`, `marketing-pipeline/index.html`. Remove `js/32-audio-input.js` and `js/33-audio-rehearsal.js` (or make them conditional on their creation).

### S5. P06 line counts are significantly wrong for PhotoPilot

The plan claims `js/24-photopilot.js` is 3,447 lines. **Actual: 2,740 lines** — overstated by 707 lines (26%).

This affects:
- P06 total: claimed "9,849 + ~180 lines" — the actual total for verified files is lower
- More importantly, it overstates P06 scope, potentially inflating the duration estimate

Similarly, `js/26-brainstorm.js` is claimed as 1,881 but actual is **1,716**. Combined with `26b-llm-router.js` at 165 (not counted in the plan), the brainstorm module is 1,881 total — this matches only if 26b is included, but 26b isn't mentioned in the scope.

---

## MODERATE ISSUES

### M1. P03 `stori_db` handoff line numbers are wrong

The plan says:

> the 3 `stori_db` reel-handoff sites (20:5799, 20:5814, index.html:4787)

Actual:
- `js/20-reels-creator.js:5799` — **correct**
- `js/20-reels-creator.js:5814` — **correct**
- `index.html:4766` — **wrong** (plan says 4787, off by 21 lines)

The `index.html` handoff code starts at line 4762, not 4787. The `indexedDB.open('stori_db', 1)` call is at line 4766.

### M2. `stori_ref_library_v1` localStorage line number is wrong

The plan references:

> `js/17b-create-references.js:4730–4785` (per-user cross-project reference library, currently in localStorage `stori_ref_library_v1`)

Actual location: `LIB_KEY = 'stori_ref_library_v1'` is at **line 4454**, with the reference library code (`_libRead`, `_libWrite`, etc.) starting around line 4457. The plan is off by ~275 lines.

### M3. Canvas launch extraction is ~190 lines, not ~145

As detailed in S1, the actual code to extract for `17e-canvas-launch.js` spans from `openCanvasPanel` (line 4831) through the window exports (line ~5020), totaling approximately **190 lines**, not 145.

### M4. P06 secondary pipeline scope doesn't mention `js/26b-llm-router.js`

`js/26b-llm-router.js` (165 lines) contains direct `fetch()` calls to OpenAI (`api.openai.com`) and Anthropic (`api.anthropic.com`), both with localStorage API keys (`stori_openai_key`, `stori_anthropic_key`). These are P06 extraction surface — the plan mentions OpenAI and Anthropic in P07's grep criteria but doesn't list `26b-llm-router.js` in P06's scope.

The P07 exit criteria correctly target `stori_openai_key`, `stori_anthropic_key`, and the provider URLs. But P06 needs to explicitly own building the `/v1/brainstorm/classify` and `/v1/brainstorm/*` endpoints that will replace the direct calls in `26b-llm-router.js`.

---

## LINE-LEVEL FACTUAL ERRORS SUMMARY

| Plan Claim | Actual | Delta | Severity |
|---|---|---|---|
| 17c is 5,199 lines | 5,139 lines | −60 (outside ±50 tolerance) | CRITICAL (exit guard) |
| 17c post-split ≈ 3,200 lines | ≈ 4,814 lines | −1,614 (33% underestimate) | **CRITICAL** (P05 scope) |
| 17e extraction lines 4889–5029 | 4831–5020 | Starts 58 lines too late | HIGH (orphaned functions) |
| 17e extraction ~145 lines | ~190 lines | +45 lines | MODERATE |
| 17f extraction lines 3721–3900 | 3670–3840 | Both bounds wrong; includes Lyria BGM | HIGH (wrong scope) |
| 17f extraction ~180 lines | ~170 lines | −10 | LOW |
| js/24-photopilot.js = 3,447 lines | 2,740 lines | −707 (26% overstated) | HIGH |
| js/26-brainstorm.js = 1,881 lines | 1,716 lines | −165 | MODERATE |
| 4×17* files = 13,276 lines | 12,773 (or 12,937 with 26b) | −503 (or −339) | MODERATE |
| P05 total surface = 19,115 lines | 18,613 (or 18,777 with 26b) | −502 (or −338) | MODERATE |
| `stori_ref_library_v1` at lines 4730–4785 | Lines ~4454–4530 | −275 | MODERATE |
| index.html handoff at line 4787 | Line 4766 | −21 | LOW |
| `js/32-audio-input.js` referenced in P03 exit criteria | **Does not exist** | N/A | **CRITICAL** |
| `js/33-audio-rehearsal.js` referenced in P03 exit criteria | **Does not exist** | N/A | **CRITICAL** |

---

## ARCHITECTURAL NOTES (Not bugs, but worth flagging)

### A1. The `callApi()` shared abstraction is correctly placed in P02

The rev-4 note says "P02 ships the `callApi()` shared abstraction." This is architecturally sound — it means every subsequent phase uses a known auth+proxy layer. However, `00-api-client.js` must also be loaded before `28-canvas-consistency.js` (which makes a direct Gemini call at line 119 during page load, before the editor). The plan addresses this by saying P02 "eager-loads `00-auth.js` + `00-api-client.js`" which would solve the loading-order problem if `28-canvas-consistency.js` is also in the eager block. The current HTML already loads it eagerly (lines 4717–4718), so this should work — but it's a subtle dependency that the P02 phase doc should call out explicitly.

### A2. Billing/quota deferral is correctly isolated but creates an auth gap

Override O15 defers all billing, subscriptions, quotas, and pricing. This means that between P02 (auth) and the future billing workstream:
- Every authenticated user has unlimited API access
- There is no `subscriptions` or `usage` table in the P03 schema
- There is no rate limiting beyond Vercel's default

This is explicitly out of scope per the plan, but it means the P05/P06 backend endpoints must be designed with quota-enforcement hooks even if they're not active yet. The `migration-original-spec.md` `deduct_quota()` RPC should be a no-op placeholder in P05/P06 that can be activated by the future billing workstream.

### A3. The `stori_db` reel-handoff replacement has two competing designs

P03 exit criteria say `/v1/projects/import-reel/:id` (or session-state token). The two approaches have different tradeoffs:
- **API call**: Requires the reel to be saved server-side first (which requires P03's project state to be live), then imported via API
- **Session-state token**: Keeps the handoff client-side but uses a short-lived token instead of IndexedDB

The plan says "or" — this ADR is still open and should be resolved in the P03 phase doc.

### A4. `marketing-pipeline/index.html` has its own `indexedDB.open('stori_db')` call

At `marketing-pipeline/index.html:5150`. This is a separate entry point from the main `index.html`. P03 must decide whether to migrate this as well or leave `marketing-pipeline` on IndexedDB (it may have different lifecycle/requirements).

---

## RECOMMENDATIONS

1. **Fix the P04 exit guard math immediately.** Either update the ~3,200 claim to ~4,814, or specify what additional ~1,900 lines are being extracted. The exit guard formula must be `≈ 5139 ± 50` (not 5199). This is the most impactful error in the plan because it understates P05 scope by ~50%.

2. **Correct the 17e extraction range** from "4889–5029" to "4831–5020" and update the line count from ~145 to ~190.

3. **Correct the 17f extraction range** from "3721–3900" to "3670–3840" to avoid orphaning fal.ai helpers and including Lyria BGM code.

4. **Remove `js/32-audio-input.js` and `js/33-audio-rehearsal.js` from P03 exit criteria** — these files don't exist yet and are created by separate feature plans (`audio-input-plan.md`, `audio-rehearsal-plan.md`). Add a conditional or explicit dependency note.

5. **Add `index.html` to the P03 IndexedDB migration file list** (it has `indexedDB.open('stori_db', 1)` at line 4766). Decide on `marketing-pipeline/index.html` as well.

6. **Add `stori_cast_images_v1` to the IndexedDB database inventory** in P03 — it's a fourth database not currently listed.

7. **Correct file line counts:** `17c` = 5,139 (not 5,199); `24-photopilot.js` = 2,740 (not 3,447); include `26b-llm-router.js` (165 lines) in P06 scope.

8. **Fix line-number references:** `stori_ref_library_v1` at ~4454 (not 4730); index.html handoff at line 4766 (not 4787).

9. **Adjust P05 duration estimate upward** — the remaining 17c after P04 will be ~4,814 lines, not ~3,200. This is 50% more scope than estimated and likely adds 2–3 weeks to P05.

10. **Add quota-enforcement hooks** as no-op placeholders in P05/P06 API endpoints even though billing is deferred, so the future billing workstream can activate them without modifying endpoint code.