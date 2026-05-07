# Migration Plan Audit — Revision 4 (Pass 2)

**Document reviewed:** `/Users/praveen/Desktop/stori/migrations/migration-plan.md` (rev 4, 2026-05-06)  
**Codebase audited:** `/Users/praveen/.local/share/opencode/worktree/4fbeb75f8fe20663a080eaed9c48e590aae06/stellar-engine/`  
**Date:** 2026-05-06  
**Status:** Pass 2 — verification of rev-4 corrections against prior audit  

**Overall assessment:** The rev-4 plan incorporated many corrections from the prior audit (P04 math, P06 line counts, `callGeminiAPI` + key-getters in P07, `26b-llm-router` included, photopilot corrected). However, **3 critical line-range errors persist** that will cause implementation failures in P04, and **2 critical phantom-file references remain** in P03. The P05/P06 total line counts are still based on stale figures.

---

## CRITICAL (Will Break Implementation)

### C1. 17e extraction range 4892–5079 misses 3 of 5 named functions

The plan names 5 functions for extraction into `17e-canvas-launch.js`: `openCanvasPanel`, `closeCanvasPanel`, `_callGeminiForVideoPrompts`, `cgFillVideoPrompts`, `cgLaunchVideoAgent`.

**Actual locations in `js/17c-create-pipeline.js`:**

| Function | Line | Inside range 4892–5079? |
|---|---|---|
| `openCanvasPanel` | **4831** | NO — 61 lines before start |
| `closeCanvasPanel` | **4865** | NO — 27 lines before start |
| `_callGeminiForVideoPrompts` | **4876** | NO — 16 lines before start |
| `window.cgFillVideoPrompts` | 4916 | Yes |
| `window.cgLaunchVideoAgent` | 4937 | Yes |

The range 4892–5079 starts **inside** `_callGeminiForVideoPrompts` (which begins at 4876) and would split it mid-function. It also entirely misses `openCanvasPanel` and `closeCanvasPanel`.

**The correct extraction range is 4831–~4969** (from `openCanvasPanel` declaration through the closing of `cgLaunchVideoAgent`). The range should NOT extend to 5079, which would capture unrelated agent-row click handlers (`onCreateAgentRowClick` at ~5070, `setCreateAgentPanelCollapsed` at ~5088).

**Also: `window.openCanvasPanel = openCanvasPanel;` and `window.closeCanvasPanel = closeCanvasPanel;` are exported at lines 5018–5019, outside the 4831–4969 range.** These exports must either be included in 17e or moved to `17c` (calling into 17e via import).

**Revised line count:** The extraction is ~139 lines (4831–4969), not ~187. Plus 2 window export lines (5018–5019) that need to be accounted for.

### C2. 17f extraction range 3721–3900 misses helpers and overshoots into BGM code

**Actual Tier-2 lipsync code spans lines 3670–3839:**

| Function | Lines | Inside 3721–3900? |
|---|---|---|
| `getFalApiKey` | 3670–3673 | NO — starts 51 lines before 3721 |
| `window.getFalApiKey = getFalApiKey` | 3673 | NO |
| `_falQueueSubmit` | 3675–3687 | NO |
| `_falPollUntilDone` | 3688–3708 | NO |
| `_falFetchResult` | 3709–3723 | Partially inside |
| `klingLipSyncCall` | 3725–3747 | Yes |
| `syncSceneWithKlingLipSync` | 3754–3795 | Yes |
| `prepareLipSyncTier2` | 3801–3838 | Yes |
| `window.prepareLipSyncTier2` | 3839 | Yes |
| "// ─── End Lip sync Phase 8 ───" | 3840 | Yes (boundary marker) |
| `generateLyriaBgm` (BGM, NOT lipsync) | 3844+ | OUTSIDE — starts after boundary |

The 4 fal.ai helper functions (3670–3723) are **dependencies** of `klingLipSyncCall`. Extracting from 3721 would orphan `getFalApiKey`, `_falQueueSubmit`, `_falPollUntilDone`, and `_falFetchResult` — they would remain in `17c` while the code that calls them moves to `17f`, causing a runtime error.

The range 3900 overshoots by ~60 lines, including `generateLyriaBgm` (BGM generation, which belongs in P05 AutoPilot core, NOT P06 lipsync).

**Correct range: 3670–3839** (~170 lines, ending at the "End Lip sync Phase 8" marker).

### C3. `js/32-audio-input.js` and `js/33-audio-rehearsal.js` still referenced in P03 exit criteria

These files **do not exist** in the codebase. The `js/` directory has files numbered 01–30 only. There is no `32-` or `33-` prefix file.

Referenced in two places:
- **P03 exit criteria** (Part 2, row 03): "verified by grep in `js/32-audio-input.js`, `js/33-audio-rehearsal.js`"
- **P03 new tables** (Part 4): `audio_inputs` sourced from `js/32-audio-input.js:16-56` and `audio_rehearsals` sourced from `js/33-audio-rehearsal.js:30-71`

These are planned future files (referenced in `audio-input-plan.md` and `audio-rehearsal-plan.md` as "new module"). They will be created by a separate feature plan, not by P03. An exit criterion that greps for `indexedDB.open` in nonexistent files is vacuously true and provides no verification.

**Fix:** Add a note: "These files don't exist yet; the `audio_inputs` and `audio_rehearsals` tables will be created when the audio-input/audio-rehearsal features are implemented (planned in `audio-input-plan.md` and `audio-rehearsal-plan.md`). P03 exit criteria for IndexedDB verification are limited to the 5 currently-existing files."

This also means P03's table count claim of **10 tables** includes 2 tables from code that doesn't exist yet. The actual table count for P03 deliverables is **8 tables** (5 original + 3 verified new: `reel_projects`, `cast_references`, `reference_library`), with `audio_inputs` and `audio_rehearsals` deferred to the audio-input/audio-rehearsal plan implementation.

---

## HIGH (Will Cause Scope Confusion)

### H1. `js/17c-create-pipeline.js` is 5,139 lines, not 5,200

Verified by `wc -l`: **5,139 lines**. The plan now says 5,200 throughout (P04 table, P04 rationale, exit guard formula). This is **61 lines outside the stated ±50 tolerance**.

Downstream impact:
- P04 math: "5,200 − 187 − 180 = ~4,833" should be **5,139 − 170 − 170 ≈ 4,799** (using corrected extraction sizes)
- Exit guard: `(17c + 17e + 17f) ≈ 5,200 ± 50"` should be **`≈ 5,139 ± 50`**

### H2. `reference_library` line range 4730–4785 exceeds the file

`js/17b-create-references.js` has **4,656 lines total**. The range 4730–4785 exceeds the file by 74–129 lines.

Actual location: the `stori_ref_library_v1` code starts at **line 4450** (section comment "Phase 6 — Cross-project reference library") with the constant at line **4454**. The range should be approximately **4450–4656** (to end of file).

### H3. `loadReelProject` range 5477–5515 is far too narrow

The function `loadReelProject` in `js/20-reels-creator.js` starts at line 5477 but extends to line **5782** — a ~305-line function, not ~38 lines. The plan's end range of 5515 captures only the initial settings-restore portion, missing audio restoration, video restoration, scene/word rebuilding, frame/overlay/BGM restoration, multi-result reconstruction, and UI updates.

Correct range: **5477–5782**.

### H4. `stori_db` handoff in `index.html` is at line 4766, not 4787 or 4782

The plan gives three different wrong line numbers for the same construct:
- Part 1 rev-4 note: "index.html:4787" — **actual: 4766**
- P03 rationale: "index.html:4782–4800" — **actual full block: 4762–4784**

The `indexedDB.open('stori_db', 1)` call is at **line 4766**.

### H5. P05 total surface is 18,711, not 19,115

| File | Plan | Actual |
|---|---|---|
| 20-reels-creator.js | 5,839 | 5,839 ✓ |
| 17a-create-api.js | — | 1,765 |
| 17b-create-references.js | — | 4,656 |
| 17c-create-pipeline.js | 5,200 | **5,139** |
| 17d-create-languages.js | — | 1,312 |
| **Four-file total** | **13,276** | **12,872** |
| **Grand total** | **19,115** | **18,711** |

Similarly, P05 says it touches "17c (~4,830 lines remain after the P04 split)" but the actual figure is **4,799** (5,139 − 170 [17e] − 170 [17f]).

---

## MODERATE (Correctable Without Scope Risk)

### M1. P04 index.html loader line ranges are wrong

The plan says:
- "dynamic loader array at lines 4731–4744" → **actual: 4713–4724** (off by ~18 lines)
- "eager `<script>` block around lines 4717–4718" → **actual: 4696–4701** (off by ~20 lines)

### M2. P03 IndexedDB exit criteria file list is incomplete

The plan lists 5 files for IndexedDB grep verification, but the actual `indexedDB.open()` call sites are:

| File | Line | Database | In plan's list? |
|---|---|---|---|
| `js/15-project.js` | 16 | `stori_projects` | YES (implied) |
| `js/15-project.js` | 361 | `stori_library` | NO — separate database |
| `js/17b-create-references.js` | 699 | `stori_cast_images_v1` | YES (implied) |
| `js/20-reels-creator.js` | 5799 | `stori_db` | YES |
| `js/20-reels-creator.js` | 5814 | `stori_db` | YES |
| `index.html` | 4766 | `stori_db` | **NO** |
| `marketing-pipeline/index.html` | 5150 | `stori_db` | NO (local carve-out) |

Missing from the list: `index.html` (which has a direct `stori_db` call), and `js/15-project.js`'s second database `stori_library` (which is a separate IndexedDB that P03 must migrate).

There are **4 distinct IndexedDB databases** (not 3):
1. `stori_projects` (js/15-project.js)
2. `stori_library` (js/15-project.js)
3. `stori_db` (js/20-reels-creator.js × 2, index.html)
4. `stori_cast_images_v1` (js/17b-create-references.js)

The plan only explicitly discusses `stori_db` in the reel handoff. P03 must also account for `stori_projects`, `stori_library`, and `stori_cast_images_v1`.

### M3. `cast_references` table sourced from the wrong IndexedDB name

The plan says `cast_references` is sourced from `js/17b-create-references.js:683–760` (cast-image binaries — R2 keys with text-only metadata). The IndexedDB database at line 689 is actually named `stori_cast_images_v1`, not `cast_references` (which is the planned Postgres table name). The line range is approximately correct (682–760), but the plan should note that the source database name differs from the target table name.

### M4. P06 total corrected but still uses stale P05 surface

The P06 rationale says "the size disparity (19,115 vs 9,142 lines)" for supporting the P05/P06 split. The actual P05 surface is 18,711, not 19,115. The relative disparity argument still holds (18,711 vs 9,142 is still more than 2:1), but the precise number should be corrected.

---

## CORRECT (Verified Against Codebase)

✓ `js/28-canvas-consistency.js` = 224 lines  
✓ `generateStyleFingerprint` at line 95, `regenerateImageInstance` at line 148  
✓ Fake auth stub at `js/15-project.js` lines 1362–1404  
✓ `api/kling.js` CORS at lines 8 + 39  
✓ `build.js` auto-discovers via `<script>` tag scans (no `MAIN_FILES` symbol)  
✓ `js/24-photopilot.js` = 2,740 lines (rev-4 correction applied)  
✓ `js/26-brainstorm.js` = 1,716, `js/26b-llm-router.js` = 165  
✓ `js/27-canvas-state.js` = 616, `js/28-canvas-consistency.js` = 224  
✓ `js/29-canvas-render.js` = 3,658, `js/30-lipsync.js` = 352  
✓ `stori_db` handoff at `js/20-reels-creator.js:5799,5814`  
✓ P02 `callApi()` shared abstraction correctly placed before P05  
✓ P07 expanded grep now includes `callGeminiAPI`, 7 key-getters, `trackCost`  
✓ `js/26b-llm-router.js` (165 lines) now counted in P06 scope  
✓ Marketing pipeline excluded from scope per user directive  

---

## ACTIONABLE CHANGES (Prioritized)

| # | What | Severity | Fix |
|---|------|----------|-----|
| 1 | 17e range 4892–5079 misses `openCanvasPanel` (4831), `closeCanvasPanel` (4865), `_callGeminiForVideoPrompts` (4876) | **CRITICAL** | Change to **4831–4969** (~139 lines); account for window exports at 5018–5019 |
| 2 | 17f range 3721–3900 orphans 4 helper functions and includes BGM code | **CRITICAL** | Change to **3670–3839** (~170 lines) |
| 3 | `js/32-audio-input.js` and `js/33-audio-rehearsal.js` don't exist | **CRITICAL** | Add explicit "to-be-created" note; reduce P03 table count from 10 to 8 for this phase; add conditional exit criteria |
| 4 | 17c line count: 5,139 not 5,200 | **HIGH** | Correct all instances; exit guard `≈ 5,139 ± 50`; P05 remainder ≈ 4,799 not 4,833 |
| 5 | `reference_library` range 4730–4785 exceeds file length (4,656) | **HIGH** | Change to **4450–4656** |
| 6 | `loadReelProject` range 5477–5515 is ~38 lines; actual is ~305 lines | **HIGH** | Change to **5477–5782** |
| 7 | `index.html stori_db` line wrong everywhere (4787 in summary, 4782–4800 in rationale) | **HIGH** | Change all references to **4766** for the `indexedDB.open` call; full block is 4762–4784 |
| 8 | P05 total 19,115 is actually 18,711; four 17* files total 12,872 not 13,276 | **MODERATE** | Correct both figures throughout |
| 9 | P03 exit criteria missing `index.html` from IndexedDB grep list | **MODERATE** | Add `index.html`; add explicit `stori_projects`, `stori_library`, `stori_cast_images_v1` database names |
| 10 | index.html loader lines in P04 off by ~18–20 lines | **MODERATE** | Correct to 4696–4701 (eager), 4713–4724 (loader array) |
| 11 | P03 "10 tables" claim includes 2 from nonexistent code | **MODERATE** | Note that `audio_inputs` and `audio_rehearsals` are deferred; effective P03 deliverable is 8 tables |

---

*End of audit. Pass 2 — 2026-05-06.*