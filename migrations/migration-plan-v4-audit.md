# Migration Plan (Rev 4) — Audit Report

Date: 2026-05-06
Plan: `migration-plan.md` (revision 4, 2026-05-06)
Prior audit: `migration-plan-audit-report.md` (revision 3, 2026-05-06)
Status: **3 critical, 2 high, 3 moderate, 1 low**

---

## CRITICAL

### C1. P02 auth stub line range 1362–1404 is incorrect — no auth code exists at those lines

**Plan claims** (Part 2, P02 exit criteria):
> "existing fake-auth call sites at `js/15-project.js` lines **1362–1404** (verified — see Part 4 rationale) replaced with `js/00-auth.js`"

**Code reality**: Lines 1362–1404 in `js/15-project.js` contain:
- Lines 1362–1374: "Fix 4a" — restoring Create Story agent state (`updateCreateAgent` calls)
- Lines 1376–1383: `loadEditorScripts()` function
- Lines 1386–1404: Navigation/rendering (`navigateTo('editor')`, `refreshWaveform()`, etc.)

**There is no auth-related code anywhere in this range.** The file `js/15-project.js` is entirely about project save/load with IndexedDB and gallery management. The only auth-adjacent reference in the entire file is at line 1417 (`const btnSignIn = $('btn-sign-in')`) — a DOM binding, not an auth implementation.

The prior audit (from an earlier conversation) found the auth stub at lines 1362–1370 with sign-in/out handlers writing to/reading from `localStorage.stori_user`. **This appears to have been at a different line count or version of the file.** The current file at lines 1362–1404 has completely different content.

**Impact**: P02's entire scope definition is based on replacing auth code at specific lines that don't contain auth code. If the line numbers drifted between audits, P02 may target the wrong code or miss the actual auth stub entirely.

**Fix**: Re-verify the auth stub location in the current file. Search for `stori_user`, `btnSignIn`, `localStorage.setItem` with auth patterns, and `localStorage.removeItem` with auth patterns. The actual auth stub may have moved or may be in a different file entirely. P02 exit criteria should reference behavior ("every `/v1/*` endpoint enforces JWT verification, all fake-auth call sites replaced") rather than specific line ranges.

---

### C2. P04 17e extraction range (4892–5085) includes unrelated narrator clip function

**Plan claims** (Part 2, P04 concrete ops):
> `js/17e-canvas-launch.js` (~193 lines lifted from current `4892–5085`, owns `openCanvasPanel`/`closeCanvasPanel`/`_callGeminiForVideoPrompts`/`cgFillVideoPrompts`/`cgLaunchVideoAgent` plus the `window.openCanvasPanel`/`window.closeCanvasPanel` exports at 5082–5083)

**Code reality**: The range 4892–5085 includes:

| Lines | Function | Belongs in 17e? |
|-------|----------|-----------------|
| 4898–4931 | `openCanvasPanel` | **Yes** |
| 4932–4942 | `closeCanvasPanel` | **Yes** |
| 4943–4982 | `_callGeminiForVideoPrompts` | **Yes** |
| 4983–5003 | `window.cgFillVideoPrompts` | **Yes** |
| 5004–5036 | `window.cgLaunchVideoAgent` | **Yes** |
| 5041–5082 | `_generateNarratorClipsIfNeeded` | **No** — this is a talking-head narrator clip helper |
| 5084–5087 | `window` exports block | Partially yes (openCanvasPanel, closeCanvasPanel) |

**The `_generateNarratorClipsIfNeeded` function (lines 5041–5082)** is a narrator animation helper that has nothing to do with canvas launch. It's called from the animation pipeline (AutoPilot), not from the canvas panel.

**Additionally**: The range starts at 4892 but `openCanvasPanel` doesn't begin until line 4898. Lines 4892–4897 contain the tail of `launchImageAgent` — which is NOT targeted for extraction.

**Impact**: Extracting lines 4892–5085 as a single block into `17e-canvas-launch.js` would:
1. Move `_generateNarratorClipsIfNeeded` into the wrong module, breaking P05's AutoPilot extraction (which needs this function in `17c`)
2. Move the tail of `launchImageAgent` into the wrong module

**Fix**: The correct extraction range is **4898–5036** (~139 lines) plus the window exports at **5084–5087** (which include both canvas-related exports and potentially other exports that need classification). The `_generateNarratorClipsIfNeeded` function at lines 5041–5082 must **remain in `17c`**.

---

### C3. P07 `trackCost` deletion scope claims "3 call sites" — actual count is ~45+

**Plan claims** (Part 2, P07 exit criteria):
> `grep -rnE "callGeminiAPI\|getCreateGeminiKey\|getPPApiKey\|getReelApiKey\|getFreeKey\|getPaidKey\|getReelFreeKey\|getReelPaidKey\|trackCost" js/ index.html` returns 0 hits

**Code reality for `trackCost` alone:**

| File | Call sites |
|------|-----------|
| `js/17a-create-api.js` | 3 (lines 623, 883, 936) |
| `js/17b-create-references.js` | 1 (line 132) |
| `js/17c-create-pipeline.js` | ~13 (lines 1212, 1574, 1579, 2923, 2924, 3155, 3439, 3544, 3847, 3851, 4147, 4446, 4458) |
| `js/17d-create-languages.js` | 2 (lines 634, 648) |
| `js/20-reels-creator.js` | ~21 (extensive) |
| `js/24-photopilot.js` | 5 (lines 684, 869, 899, 916, 940) |
| `js/33-audio-rehearsal.js` | 1 (line 495) |

**Total: ~45+ call sites** across 7 files. The plan's "3 call sites" is off by an order of magnitude.

**Impact**: P07's exit criteria include a grep for `trackCost` that must return 0 hits. If the deletion only targets 3 sites, 40+ sites would remain, and the exit criteria grep would still find hits, blocking P07 exit. More critically, these remaining `trackCost` calls would reference a deleted function, causing runtime errors.

**Fix**: The P07 exit criteria is correct (grep must return 0). The problem is that the **plan narrative** understates the scope by saying "3 call sites." The phase doc must enumerate all ~45+ `trackCost` call sites and plan their removal or replacement (likely replacing with a server-side cost tracking endpoint or removing entirely since billing is out of scope).

---

## HIGH

### H1. P03 missing two IndexedDB databases (`stori_projects`, `stori_library`)

**Plan claims** (Part 2, P03 exit criteria):
> "every `indexedDB.open(...)` call site replaced — verified by grep in `js/15-project.js`, `js/20-reels-creator.js`, `js/17b-create-references.js`, `js/32-audio-input.js`, `js/33-audio-rehearsal.js`"

**Code reality**: `js/15-project.js` opens **two** IndexedDB databases:

1. **`stori_projects`** at line 16 — database with `projects` store (keyPath: `id`). This is the **main project gallery** that saves/loads the user's project list. It's the primary reason the app works offline.
2. **`stori_library`** at line 361 — database with `library` store (keyPath: `id`). This stores the user's logo & frame library (3 slots each).

Neither of these databases appears in P03's explicit table of "10 tables." The plan lists 5 original tables (`projects`, `scenes`, `storyboard_instances`, `image_instances`, `video_instances`) and 5 revision-3 tables (`reel_projects`, `cast_references`, `reference_library`, `audio_inputs`, `audio_rehearsals`). 

**But** `stori_projects.projects` IS the `projects` table (table #1 in P03's list). So it IS covered — just not explicitly called out as an IndexedDB site in the grep list. And `stori_library.library` is NOT in the 10-table list at all.

**Impact**: `stori_library` (logo/frame library) is NOT in P03's migration scope. If P03 doesn't migrate it to Postgres/R2, the library feature will continue using IndexedDB while everything else uses cloud storage. This is probably intentional (library is less critical), but should be explicitly noted as a P03 carve-out, similar to how `stori_db` is handled for the reel handoff.

**Fix**: Add `stori_library` to P03's "local-only carve-outs" alongside the 3 `stori_db` reel-handoff sites. The logo/frame library can migrate in a later phase or stay in localStorage/IndexedDB as a local-only feature.

---

### H2. P03 `stori_cast_images_v1` is shared across 3 consumers, not 3 independent stores

**Plan claims** (Part 2, P03 revision-3 expansion table):
> `cast_references` at `js/17b-create-references.js:683-760`
> `audio_inputs` at `js/32-audio-input.js:16-56`
> `audio_rehearsals` at `js/33-audio-rehearsal.js:30-71`

These are listed as 3 separate table entries in P03's 10-table schema.

**Code reality**: All three consumers open the **same IndexedDB database** (`stori_cast_images_v1`) with the **same store** (`images`). They share the database via:
- `js/17b-create-references.js:710` — `indexedDB.open('stori_cast_images_v1', 1)`
- `js/32-audio-input.js:22` — `indexedDB.open(AUDIO_IDB_DB, 1)` where `AUDIO_IDB_DB = 'stori_cast_images_v1'`
- `js/33-audio-rehearsal.js:37` — `indexedDB.open(IDB_NAME, 1)` where `IDB_NAME = 'stori_cast_images_v1'`

They differentiate their data by key prefixes, not by separate stores.

**Impact**: P03's schema design must account for this — migrating `stori_cast_images_v1` means migrating all three data types together, not as independent tables. The 3 Postgres tables (`cast_references`, `audio_inputs`, `audio_rehearsals`) will have different schemas but share the same migration entry point (the IDB `images` store). The schema-design spike must plan for key-prefix-based record splitting.

**Fix**: P03's schema spike should explicitly note that `stori_cast_images_v1.images` is a shared store with key-prefix-delineated records. The migration must read all records, classify them by key prefix, and distribute them to the appropriate Postgres table.

---

## MODERATE

### M1. P03 reel-creator IndexedDB line ranges are significantly off

**Plan claims**:
> `js/20-reels-creator.js:4363-4481, 5485-5790`

**Code reality**: 
- Lines 4363–4481 contain `saveProjectToGallery()` and File System Access API code — NOT IndexedDB calls
- Lines 5485–5790 contain `loadReelProject()` — NOT IndexedDB calls
- The actual `indexedDB.open('stori_db', 1)` calls are at lines **5807** and **5822**
- The `idbRead()` / `idbDelete()` / `checkPipelineJob()` functions span lines **5805–5847**

**Impact**: P03's phase doc will reference the wrong line ranges when enumerating migration sites. This won't break anything (the phase doc will grep for `indexedDB.open`), but it makes the plan harder to follow and verify.

**Fix**: Update the line ranges to 5805–5847 for the `stori_db` IndexedDB code in the reel-creator. The reel-to-editor handoff code (`index.html:4808`) is correctly cited.

---

### M2. P04 17f extraction range (3721–3900) includes pre-function code

**Plan claims**: `js/17f-tier2-lipsync-fal.js` (~180 lines from current 3721–3900)

**Code reality**: Lines 3721–3727 contain the end of a prior function (`window.prepareLipSyncForExport = prepareLipSyncForExport;` export at 3725). The actual Tier-2 lipsync block starts at line 3728 with a comment. The target function `prepareLipSyncTier2` doesn't start until approximately line 3868.

**Impact**: Less severe than C2 — extracting lines 3721–3727 would pull in a stray export line that belongs to the Tier-1 lipsync code in `17c`.

**Fix**: Adjust the P04 extraction range for 17f to start at line **3728** (the comment block) rather than 3721.

---

### M3. `marketing-pipeline/index.html` has BYOK keys and `stori_db` IndexedDB that P07's grep gate must explicitly exclude

**Code reality**: `marketing-pipeline/index.html` (line 5150) opens `stori_db` IndexedDB and contains `stori_key_paid`, `stori_kling_*`, `stori_elevenlabs_key`, `stori_openai_key`, and `stori_fal_key` references.

**Plan stance** (Part 5, out-of-scope items 5–13): Mobile is explicitly out of scope. But `marketing-pipeline/` is not mobile — it's a separate marketing site.

**Impact**: P07's exit criteria grep runs against `js/` and `index.html`. If `marketing-pipeline/index.html` is in the repo, the grep will find matching keys. The plan must either: (a) explicitly exclude `marketing-pipeline/` from the P07 grep gate, or (b) note that the marketing site is a separate deployment with its own BYOK flow (not in scope for this migration).

**Fix**: Add `marketing-pipeline/` to P07's grep exclude list, or note that P07's grep specifically targets `js/` and root `index.html` (not `marketing-pipeline/`).

---

## LOW

### L1. Line count drift

| File | Plan Claims | Actual | Delta |
|------|------------|--------|-------|
| `js/20-reels-creator.js` | 5,839 | 5,847 | +8 |
| `js/17c-create-pipeline.js` | 5,200 | 5,206 | +6 |

Minor drift; not a blocker. Phase docs should `wc -l` at kickoff.

---

*End of audit.*