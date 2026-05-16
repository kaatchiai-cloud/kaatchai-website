# Phase 04 — Module Split (P05/P06 boundary refactor)

> **Rev-5 changes (2026-05-16):** File line counts updated per rev-5 audit (H1, M2). `js/17c-create-pipeline.js` is now 5,581 lines (was 5,139–5,206). `js/28-canvas-consistency.js` is now 404 lines (was 224) — includes Replicate face-swap code that stays in `28` (not extracted to `28a`). All absolute line-number references are stale (from rev-4); re-derive at P04 kickoff by grepping for function names. Exit guards updated: `(17c + 17e + 17f) ≈ 5,581 ± 50`, `(28 + 28a) ≈ 404 ± 30`.

> **Status:** ready-to-execute after Phase 03 exits. **Audience:** solo founder + 1–2 engineers. **Duration:** S (1–2 working weeks).
> **Goal in one line:** carve client-side boundaries that align with the upcoming server-side P05/P06 extraction so subsequent pipeline ports avoid file-level merge collisions.
> **Source:** `/Users/praveen/Desktop/stori/migrations/migration-plan.md` Part 2 row 04; revision-3 audit (`migration-plan-audit-report.md`); not in `migration-original-spec.md` — this phase exists to de-risk the heavy P05 refactor.

---

## 1. Scope

This phase is a **pure client-side refactor** (no behaviour change, no new endpoints, no server work). It exists because the audit (2026-05-06) flagged that two client files have grown to sizes where multiple downstream phases would all touch them simultaneously — recipe for collisions:

- `js/17c-create-pipeline.js` — **5,581 lines** (rev-5; was 5,139–5,206). P05 extracts the AutoPilot pipeline core; P06 extracts Tier-2 lipsync (line range stale — was ~3728–3900 in rev-4). Without the split, both phases edit the same file in conflicting ways.
- `js/28-canvas-consistency.js` — **404 lines** (rev-5; was 224). Two helpers (`generateStyleFingerprint`, `regenerateImageInstance`) share a Gemini-call shim that P05 (canvas validation server-side) and P06 (image-gen routing) both want to touch. Additionally, this file now contains Replicate face-swap code (`_getReplicateKey` ~line 145, `_replicateFaceSwap` ~lines 169–206, `applyFaceSwapToSceneImage` ~lines 211–298) and a LoRA character lookup (~lines 225–227) — all of which **stay in 28** (not a Gemini shim, not extracted to `28a`).

Splitting now isolates the units of change for each subsequent phase. `git diff --stat` for this phase should be near-zero net delta — code moves, doesn't disappear.

### In scope

1. **Split `js/17c-create-pipeline.js` (5,581 lines)** into three files:
   - `js/17c-create-pipeline.js` — AutoPilot pipeline core only. Approximate math: 5,581 − ~158 − ~173 ≈ 5,250 lines remain (exact counts depend on re-verified extraction ranges at kickoff).
   - **NEW** `js/17e-canvas-launch.js` — owns the canvas-launch surface:
      - `openCanvasPanel` (stale rev-4 ref: `js/17c-create-pipeline.js:4898`)
      - `closeCanvasPanel` (stale rev-4 ref: `js/17c-create-pipeline.js:4932`)
      - `_callGeminiForVideoPrompts` (stale rev-4 ref: `js/17c-create-pipeline.js:4943`)
      - `cgFillVideoPrompts` (stale rev-4 ref: `js/17c-create-pipeline.js:4983`)
      - `cgLaunchVideoAgent` (stale rev-4 ref: `js/17c-create-pipeline.js:5004`, ends ~5051)
      - The `window.openCanvasPanel = ...` / `window.closeCanvasPanel = ...` exports (stale rev-4 ref: `js/17c-create-pipeline.js:5097–5100`; inside an `if (typeof window !== 'undefined')` block).
      - **Total ~158 lines moved** (stale rev-4 verified ranges: `4898–5051` for canvas functions + `5097–5100` for export block — **re-derive at kickoff**).
      - **`_generateNarratorClipsIfNeeded` STAYS in `17c`** — it's a talking-head narrator animation helper called by the AutoPilot pipeline, NOT a canvas-launch concern. Do NOT move it to `17e`. Verify by grep at kickoff for the function declaration and its call sites.
   - **NEW** `js/17f-tier2-lipsync-fal.js` — owns Tier-2 lipsync (the fal.ai-hosted Kling LipSync path):
      - All code from the section header `// ─── Lip sync — Phase 8: Tier 2 (Kling LipSync via fal.ai) ─────────────` (stale rev-4 ref: line 3728) through its terminating section marker.
      - Includes the fal.ai submit, poll, result fetch helpers + per-scene Tier-2 sync + Tier-2 batch orchestrator.
      - **Total ~180 lines moved** (stale rev-4 range `3728–3900` — **re-derive at kickoff**). This whole module is destined for replacement by `/v1/jobs/lipsync` in P06; isolating it here means P06 can delete one file rather than carve out lines from a 5,581-line file.
   - File naming follows existing `17a / 17b / 17c / 17d` convention. New files are `17e` and `17f`.

2. **Decouple `js/28-canvas-consistency.js` (404 lines)** by extracting the shared Gemini-call shim:
   - `generateStyleFingerprint` and `regenerateImageInstance` both perform a structurally similar Gemini imageGen call. P05 needs to wrap this shim with `callApi('/v1/...')`; P06 needs to delete the BYOK key reads. Stale rev-4 line refs: helpers at lines 95, 148 — **re-derive at kickoff**.
   - The following code **stays in `28`** (not extracted to `28a` — it is Replicate/Gemini face-swap code, not a Gemini image-gen shim):
      - `_getReplicateKey()` (~line 145) — Replicate BYOK key reader.
      - `_replicateFaceSwap()` (~lines 169–206) — direct `fetch('https://api.replicate.com/v1/predictions')` submit→poll→done loop.
      - `applyFaceSwapToSceneImage()` (~lines 211–298) — face-swap integration orchestrator.
      - LoRA character lookup (~lines 225–227) — reads `window.LoraLibrary.getCharacterById()`.
   - **NEW** `js/28a-image-gen-shim.js` — exports a single `imageGenWithGemini({ prompt, refImages, style, geminiKey })` function used by both `generateStyleFingerprint` and the Gemini-call portion of `regenerateImageInstance`.
   - `js/28-canvas-consistency.js` shrinks to call this shim instead of inlining the Gemini fetch. The Replicate face-swap code remains untouched in `28`.
   - File naming follows existing `28` / `28a` convention (similar to `26` / `26b-llm-router.js` already in the codebase).

3. **Wire the three new files into the `index.html` loader.** There is **no `MAIN_FILES` symbol in `build.js`**; verified at audit time — `build.js` auto-discovers JS files by scanning `index.html` directly:
   - **Static eager scripts** — regex `<script src="js/...">` at `build.js:69–78`
   - **Dynamic loader** — `var scripts = [...]` array at `build.js:82–90`

   The actual contract is therefore to edit `index.html`, not `build.js`:
   - Add **`js/17e-canvas-launch.js`** to the dynamic loader list at `index.html:4752–4766` (alongside the other `17a/17b/17c/17d` entries).
   - Add **`js/17f-tier2-lipsync-fal.js`** to the same dynamic loader list (it is editor-time only — no need eager).
   - Add **`js/28a-image-gen-shim.js`** to **either** the eager `<script>` section (alongside `js/28-canvas-consistency.js` at `index.html:4739` — currently eager) **or** the dynamic loader. **Verify at kickoff** by tracing the call path: if `28-canvas-consistency.js` ever runs at top-level before user navigates to the editor, the shim must be eager. Default lean: **eager**, sibling to its caller.
   - `build.js` will then auto-discover all three files via its existing scans; `dist/index.html` rebuilds identically modulo the three new `<script>` tags.
   - Smoke: `node build.js` exits 0; `dist/index.html` contains all three filenames.

### Explicitly out of scope (defer to later phases)

- **Any new endpoint** — P04 ships zero `/v1/*` routes. All endpoints live in P05+.
- **Any server-side code** — `infra/cloud-run/`, `infra/api/` untouched.
- **BYOK key reads** — `getCreateGeminiKey()` and the `localStorage.getItem('stori_key_paid' | 'stori_key_free')` calls remain in place. P07 deletes them.
- **`js/27-canvas-state.js`** — only the `js/28-canvas-consistency.js` consistency helpers move. Canvas state is untouched until P06 (server-side validation).
- **Auto-formatting / lint cleanup** — leave style as-is to keep diffs minimal.
- **Dead-code removal** — if a moved function references a now-orphaned helper, leave the helper in place. P07 cleans up.

---

## 2. Goal & exit criteria

| # | Exit criterion | How verified |
|---|----------------|--------------|
| 1 | `js/17c-create-pipeline.js` is reduced to AutoPilot pipeline core (~5,250 lines remain — approximate math: 5,581 − ~158 − ~173 ≈ 5,250; exact count depends on re-verified extraction ranges). | `wc -l js/17c-create-pipeline.js` returns 5,250 ± 50. |
| 2 | `js/17e-canvas-launch.js` exists and exports `openCanvasPanel`, `closeCanvasPanel`, `cgFillVideoPrompts`, `cgLaunchVideoAgent` on `window`. | `grep -n "window.openCanvasPanel\|window.closeCanvasPanel\|window.cgFillVideoPrompts\|window.cgLaunchVideoAgent" js/17e-canvas-launch.js` returns 4 hits. |
| 2a | **17e intentionally retains live Gemini calls at P04 exit** (`_callGeminiForVideoPrompts`, `cgFillVideoPrompts` still call Gemini directly). P04 is a code-move only — P05 owns replacing those calls with `callApi(...)`. Do NOT attempt to replace them here. `grep -n "generativelanguage.googleapis.com" js/17e-canvas-launch.js` returning hits is expected and correct at P04 exit. | Visual confirmation only — non-zero hits is the passing state. |
| 3 | `js/17f-tier2-lipsync-fal.js` exists and contains the fal.ai Tier-2 lipsync code block. | `grep -n "fal.run\|fal-ai/kling-video/lipsync" js/17f-tier2-lipsync-fal.js` returns ≥ 2 hits; same grep on `js/17c-create-pipeline.js` returns 0 hits. |
| 4 | `js/28a-image-gen-shim.js` exists and exports `imageGenWithGemini`. `js/28-canvas-consistency.js` calls it. | `grep -n "imageGenWithGemini" js/28a-image-gen-shim.js js/28-canvas-consistency.js` shows the export site + ≥ 2 call sites. |
| 5 | `node build.js` succeeds; `dist/index.html` is rebuilt and contains the new files. | `node build.js` exits 0; `grep "17e-canvas-launch\|17f-tier2-lipsync-fal\|28a-image-gen-shim" dist/index.html` returns ≥ 3 hits. |
| 6 | `git diff --stat HEAD` shows ~0 net line delta across the affected files (lines moved, not deleted). Tolerance: ± 50 lines net (export/import scaffolding). | `git diff --stat` review at PR time. |
| 7 | Smoke pass: Illustrated AutoPilot, Animated AutoPilot, Tier-2 lipsync, canvas consistency regen all work identically post-split. | One engineer-day dogfood smoke (see §6). |
| 8 | No new lint or typecheck errors. | CI green. |

A phase is **not** complete until every row above is checked. If a row slips, raise a phase-doc revision before crossing into Phase 05.

---

## 3. Architecture

```
                     Before (pre-split)
   ┌──────────────────────────────────────────────────────────┐
   │ js/17c-create-pipeline.js (5,581 lines)                   │
   │  ├─ AutoPilot pipeline core              (stale refs)     │
   │  ├─ Tier-2 lipsync (fal.ai)              (stale ~3728–3900)│  ← P06 territory
   │  ├─ AutoPilot pipeline core, continued   (stale refs)     │
   │  └─ Canvas-launch helpers                (stale ~4889–5079)│  ← used by canvas UI, not pipeline
   └──────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────┐
   │ js/28-canvas-consistency.js (404 lines)                    │
   │  ├─ generateStyleFingerprint           (stale ~line 95)  │  ← inline Gemini fetch
   │  ├─ _getReplicateKey                   (~line 145)        │  ← stays in 28
   │  ├─ _replicateFaceSwap                  (~lines 169–206)  │  ← stays in 28 (Replicate)
   │  ├─ applyFaceSwapToSceneImage           (~lines 211–298)  │  ← stays in 28
   │  ├─ LoRA character lookup              (~lines 225–227)  │  ← stays in 28
   │  └─ regenerateImageInstance             (stale ~line 148) │  ← inline Gemini fetch
   └──────────────────────────────────────────────────────────┘

                     After (post-split)
   ┌────────────────────────────────────┐
   │ js/17c-create-pipeline.js (~5,250) │  AutoPilot core only — P05 ports this
   └────────────────────────────────────┘
   ┌────────────────────────────────────┐
   │ js/17e-canvas-launch.js  (~158)   │  canvas-panel UI launcher — P05 owns
   │                                    │  per rev-4 option (a) for Animated path
   └────────────────────────────────────┘
   ┌────────────────────────────────────┐
   │ js/17f-tier2-lipsync-fal.js (~180) │  Tier-2 fal.ai lipsync — P06 deletes/replaces
   └────────────────────────────────────┘

   ┌────────────────────────────────────┐
   │ js/28-canvas-consistency.js (~370) │  orchestration + face-swap; calls 28a shim
   └────────────────────────────────────┘
   ┌────────────────────────────────────┐
   │ js/28a-image-gen-shim.js  (~35)   │  one Gemini-call function, two callers
   └────────────────────────────────────┘
```

**Why this shape:**
- The split mirrors the upcoming server-side boundaries. P05 extracts AutoPilot core; P06 deletes Tier-2 lipsync (replaced by `/v1/jobs/lipsync`). With the file split done now, each downstream phase touches one file each instead of three phases all editing `17c-create-pipeline.js`.
- Canvas-launch is genuinely UI code (panel open/close, video-prompt fill, agent launch) — not pipeline code. Keeping it in `17c-create-pipeline.js` was historical accident; the split makes the file's name match its contents.
- `28a-image-gen-shim.js` is the smallest abstraction that lets P05 swap the Gemini direct-fetch for `callApi(...)` in one place rather than two.

---

## 4. Technology selection

No new technology. This is purely a file-organization refactor in vanilla JS.

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Module pattern | **Same as existing `js/*.js` files** — `window.X = X` for cross-file globals; no ES module imports. | Matches existing codebase convention. The migration to ES modules (if ever) is a separate workstream. |
| File ordering in `dist/index.html` | **Maintain existing load order**: 17a → 17b → 17c → 17d → 17e → 17f (in the dynamic loader array at `index.html:4752–4766`), and `28a` eager-before `28` (in the eager `<script>` block around `index.html:4735–4740`). | New files load BEFORE files that reference them on `window`. Verify ordering at §5.4 by tracing load sequence in `index.html`. |
| Build pipeline | **`node build.js`** unchanged. **No `MAIN_FILES` symbol exists** — `build.js` auto-discovers via the static-script regex (`build.js:69–78`) and the dynamic-loader scan (`build.js:82–90`). The edit is in `index.html`, not `build.js`. | No build changes; only data changes. |

---

## 5. Work breakdown

Roughly ordered by dependency. One engineer can do this in 4–7 working days; pad calendar to 1–2 weeks for review + smoke.

### 5.1 Pre-flight verification (0.5 day)

> **⚠️ Kickoff instruction (rev-5):** Re-run `wc -l` on all target files and re-derive extraction ranges by grepping for function names. The absolute line numbers in this doc are from rev-4 and are stale — the codebase has grown since then (17c: 5,581 lines, 28: 404 lines).

- [ ] Run `wc -l js/17c-create-pipeline.js js/28-canvas-consistency.js` and record current line counts.
- [ ] Run `grep -n "openCanvasPanel\|closeCanvasPanel\|_callGeminiForVideoPrompts\|cgFillVideoPrompts\|cgLaunchVideoAgent" js/17c-create-pipeline.js` and re-derive the canvas-launch block range. (Stale rev-4 refs cited 4889–5079; line numbers have shifted due to ~375 lines of growth since rev-4.)
- [ ] Run `grep -n "// ─── Lip sync — Phase 8" js/17c-create-pipeline.js` to find Tier-2 start (stale rev-4 ref: line 3728 — re-derive).
- [ ] Run `grep -n "generateStyleFingerprint\|regenerateImageInstance\|_getReplicateKey\|_replicateFaceSwap\|applyFaceSwapToSceneImage" js/28-canvas-consistency.js` and re-verify all function boundaries. Stale rev-4 refs: `generateStyleFingerprint` at ~95, `regenerateImageInstance` at ~148; new code: `_getReplicateKey` at ~145, `_replicateFaceSwap` at ~169–206, `applyFaceSwapToSceneImage` at ~211–298.
- [ ] Document pre-split line counts in a temporary `phase-04-pre-split.md` (not committed long-term).

### 5.2 Split `js/17c-create-pipeline.js` into three files (1.5 days)

#### 5.2.1 Extract `js/17e-canvas-launch.js`
- [ ] Create `js/17e-canvas-launch.js`.
- [ ] Grep for function boundaries at kickoff to identify the exact line range. (Stale rev-4 range: `4889–5079` — do NOT trust these absolute numbers.)
- [ ] Copy the verified range verbatim into the new file.
- [ ] At the top of the new file, add a header comment: `// Canvas-launch panel UI — extracted from 17c-create-pipeline.js in Phase 04 (module split).`
- [ ] Copy any small helpers ONLY referenced inside this block. If a helper is also used by AutoPilot pipeline core, leave it in `17c-create-pipeline.js` and reference it via `window.<helper>` from `17e`.
- [ ] Delete the moved lines from `js/17c-create-pipeline.js`.
- [ ] Verify all references to `openCanvasPanel`, `closeCanvasPanel`, `cgFillVideoPrompts`, `cgLaunchVideoAgent` in OTHER `js/*.js` files and `index.html` resolve to `window.<name>` (i.e., still work cross-file).

#### 5.2.2 Extract `js/17f-tier2-lipsync-fal.js`
- [ ] Create `js/17f-tier2-lipsync-fal.js`.
- [ ] Copy the Tier-2 lipsync block (stale rev-4 range: lines `3728–3900` — **re-derive at kickoff** by grepping for the section header; plus any helpers that ONLY this block uses) verbatim.
- [ ] Header comment: `// Tier-2 lipsync via fal.ai (Kling LipSync) — extracted from 17c-create-pipeline.js in Phase 04. Will be replaced by /v1/jobs/lipsync server-side in Phase 06.`
- [ ] Confirm cross-file references via `window.<name>`. The Tier-2 batch orchestrator likely exports `window.runTier2LipSyncBatch` or similar — keep the export.
- [ ] Delete the moved lines from `js/17c-create-pipeline.js`.

#### 5.2.3 Verify `js/17c-create-pipeline.js` post-split
- [ ] Final line count should be approximately `5,581 − ~158 − ~173 ≈ 5,250`. Run `wc -l js/17c-create-pipeline.js` and confirm the result is in the range 5,250 ± 50. (The earlier rev-3 figure of "~3,200 lines remain" was a target that assumed additional unspecified extractions — rev-4/rev-5 corrects to the verified arithmetic. **Do not move more code than the spec lists** to chase the 3,200 target.)

### 5.3 Split `js/28-canvas-consistency.js` into two files (1 day)

#### 5.3.1 Extract `js/28a-image-gen-shim.js`
- [ ] Grep for `generateStyleFingerprint` and `regenerateImageInstance` in `js/28-canvas-consistency.js` to find exact line ranges at kickoff. (Stale rev-4 refs: lines 95–193 — line numbers have shifted due to 180 lines of growth.)
- [ ] Identify the shared Gemini-fetch pattern. Both helpers do approximately:
  ```
  const url = `https://generativelanguage.googleapis.com/v1beta/.../generateContent?key=${geminiKey}`;
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify({...}) });
  ...
  ```
- [ ] Create `js/28a-image-gen-shim.js` with a single function:
  ```js
  // js/28a-image-gen-shim.js
  // Shared Gemini imageGen call — extracted in Phase 04 so P05 can swap to callApi() in one place.
  async function imageGenWithGemini({ prompt, refImages, style, geminiKey }) {
    // body of the shared fetch
  }
  window.imageGenWithGemini = imageGenWithGemini;
  ```
- [ ] In `js/28-canvas-consistency.js`, replace the inline `fetch(...)` calls inside `generateStyleFingerprint` and `regenerateImageInstance` with `await window.imageGenWithGemini({ ... })`.
- [ ] **Do NOT extract** Replicate face-swap code to `28a` — `_getReplicateKey()`, `_replicateFaceSwap()`, and `applyFaceSwapToSceneImage()` stay in `28` (they are Replicate calls, not Gemini image-gen calls). Similarly, the LoRA character lookup at ~lines 225–227 stays in `28`.
- [ ] Verify the two helpers still produce identical output (compare a manual run before/after on the same input).

### 5.4 Wire new files into `index.html` loader (0.5 day)
**Note:** there is **no `MAIN_FILES` symbol in `build.js`** — verified at audit time. `build.js` auto-discovers files by scanning `index.html` directly via two paths: a static-script-tag regex (`build.js:69–78`) and a dynamic-loader array scan (`build.js:82–90`). The actual edit lives in `index.html`, not `build.js`.

- [ ] Open `index.html`. Locate the **dynamic loader** at lines 4752–4766 (the `var scripts = [...]` array inside `loadEditorScripts`).
- [ ] Insert `'js/17e-canvas-launch.js'` in the loader array immediately after `'js/17d-create-languages.js'`.
- [ ] Insert `'js/17f-tier2-lipsync-fal.js'` immediately after `'js/17e-canvas-launch.js'`.
- [ ] **For `js/28a-image-gen-shim.js`**: locate the **eager** `<script>` block where `js/28-canvas-consistency.js` sits at line 4739 (currently eager).
  - **Default lean: eager.** Insert `<script src="js/28a-image-gen-shim.js?v=2"></script>` **before** `<script src="js/28-canvas-consistency.js?v=2"></script>` so the shim is defined before its first caller resolves. Verify experimentally at kickoff: if any code path reads `window.imageGenWithGemini` at module-top in `28-canvas-consistency.js`, eager-before is mandatory.
  - Fallback: if `28-canvas-consistency.js` only invokes the shim inside lazy callbacks, place `28a-image-gen-shim.js` in the dynamic loader array near `28-canvas-consistency.js` instead.
- [ ] Run `node build.js` and confirm exit 0. Verify `build.js` auto-discovers the three new files via its static-tag regex and dynamic-loader scan.
- [ ] Inspect `dist/index.html`: all three new filenames must appear in the inlined script section.

### 5.5 Smoke pass (1 day)
- [ ] Open the production-equivalent `dist/index.html` in the browser. Sign in with the founder account.
- [ ] Run an Illustrated AutoPilot reel end-to-end (4 scenes). Verify scene-image generation and reel export work identically to pre-split.
- [ ] Run an Animated AutoPilot reel end-to-end (4 scenes, including Kling). Verify animation step works identically.
- [ ] Run Tier-2 lipsync on one scene that has both a Kling clip and an audio track. Verify the fal.ai-mediated path still produces a synced output. (This is the single most fragile test of the split because it isolates the moved Tier-2 code.)
- [ ] Open a project with multiple scenes, click "regenerate consistency" on an image instance, verify `js/28-canvas-consistency.js` → `js/28a-image-gen-shim.js` → Gemini call still works.
- [ ] Open the canvas panel via `cgLaunchVideoAgent`, fill prompts via `cgFillVideoPrompts`, close. Verify cross-file `window.*` exports still wire up.
- [ ] No console errors anywhere during the smoke.

### 5.6 Documentation + sign-off (0.5 day)
- [ ] Add a note to `infra/README.md` (or a new `js/README.md`) listing the file boundaries and which files each downstream phase will touch. Helps the next engineer.
- [ ] Open tracking issue "Phase 04 done" referencing this doc and listing the 8 exit criteria checked.

**Estimated total:** ~5 working days; calendar 1–2 weeks for review + dogfood smoke.

---

## 6. Acceptance & test plan

### Smoke checklist (must pass before declaring exit)
1. `node build.js` exits 0; new filenames present in `dist/index.html`.
2. `wc -l js/17c-create-pipeline.js` shows substantial reduction (≥ 300 lines smaller from 5,581 baseline).
3. `wc -l js/17e-canvas-launch.js js/17f-tier2-lipsync-fal.js js/28a-image-gen-shim.js` all exist with non-zero content.
4. `git diff --stat` shows ~0 net line delta across affected files.
5. Illustrated AutoPilot 4-scene reel end-to-end works.
6. Animated AutoPilot 4-scene reel end-to-end works (with Kling).
7. Tier-2 lipsync on one scene works (fal.ai path).
8. Canvas-consistency regen on an image instance works.
9. Canvas-launch open/close + `cgFillVideoPrompts` + `cgLaunchVideoAgent` work.
10. No new console errors; no new lint or typecheck errors.

### Manual verification (post-impl, surface to user)
- [ ] **Engineer:** record post-split line counts of all five affected files in `phase-04-post-split-counts.md` (working file). Confirm `wc -l` totals for `(17c + 17e + 17f) ≈ 5,581 ± 50` and `(28 + 28a) ≈ 404 ± 30` — i.e., near-zero net delta.
- [ ] **Founder:** dogfood one full Animated reel + one Tier-2 lipsync after the split lands. Note any subtle regressions (e.g., a function that worked pre-split but errors post-split because a `window.*` reference resolved at a different time).

---

## 7. Dependencies

### Predecessors
- **Phase 03** (API Contract + Project State). The split is a pure client refactor; it doesn't strictly need P03's schema, but doing it after P03 means we don't have to re-sequence work if the split surfaces a hidden coupling that P03 needed.

### Successors
- **Phase 05 (AutoPilot Pipeline Extraction)** — touches `js/17c-create-pipeline.js` (now smaller), `js/17a/b/d-create-*.js`, `js/20-reels-creator.js`, `js/21-kling.js`. Does NOT touch `js/17e-canvas-launch.js` (canvas UI is editor-side). Does NOT touch `js/17f-tier2-lipsync-fal.js` (P06 territory).
- **Phase 06 (Secondary Pipelines Extraction)** — touches `js/17f-tier2-lipsync-fal.js` (replacing it with `/v1/jobs/lipsync`), `js/28-canvas-consistency.js` (replacing the shim call with `callApi`), and the other secondary-pipeline files.
- **Phase 07 (Web Cutover)** — deletes `js/17f-tier2-lipsync-fal.js` entirely (or at least the BYOK key reads inside it) once `/v1/jobs/lipsync` is live; deletes `js/28a-image-gen-shim.js` if `js/28-canvas-consistency.js` ends up calling `/v1/...` directly.

### Files this phase touches
- New: `js/17e-canvas-launch.js`, `js/17f-tier2-lipsync-fal.js`, `js/28a-image-gen-shim.js`.
- Modified: `js/17c-create-pipeline.js`, `js/28-canvas-consistency.js`, **`index.html` (loader array at 4752–4766 + eager `<script>` block at ~4735–4740)**. **`build.js` is NOT modified** — there is no `MAIN_FILES` symbol; build.js auto-discovers via its existing scans.
- Generated: `dist/index.html` (via `node build.js`).

### Files this phase must NOT touch
- Any `infra/` file.
- `js/27-canvas-state.js`, `js/29-canvas-render.js` (canvas state/render — separate from the consistency split).
- Any other `js/*.js` file beyond the listed two.
- BYOK key code (`getCreateGeminiKey`, `localStorage.*stori_*`) — P07 owns.
- `migration-original-spec.md`, `migration-plan.md`, `app/redesign-plan.md`, `app/*-mobile-mockup*.html`.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Moved function has an undeclared dependency on something else in `17c-create-pipeline.js`; post-split call fails at runtime | M | M | Smoke pass §5.5 exercises every moved function. If a hidden dep surfaces, copy the dep into the new file too (or leave the function in 17c if the dep is too entangled). |
| `window.*` cross-file timing issue — new file loads after a consumer reads the export | L | M | `build.js` controls load order; verify `MAIN_FILES` ordering in §5.4. If timing surfaces, reorder. |
| `git diff --stat` shows a large net line delta — indicates either accidental deletion or accidental addition | L | M | Pre-flight line counts in §5.1 + post-impl recount in §6. Diff-stat budget ± 50 lines net. |
| Tier-2 lipsync fal.ai call has subtle dependency on `js/17c-create-pipeline.js` internal state (e.g., a shared progress callback) | L | M | The audit identifies this code as already self-contained (uses fetch/setTimeout, no shared state). Verify in §5.5 smoke. |
| `build.js` doesn't pick up new files due to a glob/list mismatch | L | L | Manual edit of `MAIN_FILES` (§5.4) is explicit; verify `dist/index.html` after build. |
| Founder dogfoods on a project saved pre-split; some IndexedDB blob references a removed function name | L | L | Per O13, no real users; founder can recreate the project. Document in `phase-04-post-split-counts.md`. |
| The split surfaces additional candidates for splitting (e.g., 17a-create-api.js feels like it should also be split) | L | L | Resist scope creep. Phase 04 splits exactly the two listed files; further splits are a separate revision if needed. |

---

## 9. Open questions

> Marked `[blocking]` if the question must be answered before this phase exits. Otherwise it's a deferred question that will not stop forward motion.

1. **Exact line range of the canvas-launch block** — stale rev-4 refs cited `4889–5029` / `4891–5079`; file has grown to 5,581 lines since. [non-blocking — re-derive at §5.1 kickoff with `grep`].
2. **Should we also split `js/20-reels-creator.js` (5,847 lines)?** [non-blocking — NO. P05 ports this whole file server-side; splitting now would be wasted churn.]
3. **Should the new `28a-image-gen-shim.js` module export via `window.imageGenWithGemini` (current convention) or via a future ES module export?** [non-blocking — `window` for now; ES modules are out of scope].
4. **Will `js/17e-canvas-launch.js` survive the migration at all, or does the canvas panel itself eventually move to a server-rendered piece?** [non-blocking — survives; canvas UI is explicitly client-side per P05/P06 scope].
5. **Are there other multi-phase-collision hotspots the audit missed?** [non-blocking — none identified beyond the two named files. If P05/P06 surface a third, that's a phase-doc revision].

---

## 10. Cross-cutting decisions raised by this phase

The following decisions surfaced during scoping have implications across two or more phases. They are NOT decided in this phase doc.

| Decision | Phases affected | ADR ref |
|----------|-----------------|---------|
| (None.) Phase 04 raises no new ADR-worthy decisions — it is a mechanical refactor that aligns the client codebase with already-decided server-side boundaries (ADR-01 schema, ADR-02 long-job pattern, ADR-03 API contract, ADR-07 file-storage strategy). | — | — |

---

## 11. Links

- Phase index: `/Users/praveen/Desktop/stori/migrations/migration-plan.md`
- Coverage matrix: `/Users/praveen/Desktop/stori/migrations/devDoc-migration/spec-coverage-matrix.md`
- Audit driving this phase: `/Users/praveen/Desktop/stori/migrations/migration-plan-audit-report.md`
- Predecessor: `/Users/praveen/Desktop/stori/migrations/migration-phase-03-api-contract-and-project-state.md`
- Successor: `/Users/praveen/Desktop/stori/migrations/migration-phase-05-autopilot-pipeline-extraction.md`
- Source code (rev-5 line counts; line-range refs stale from rev-4 — re-derive at kickoff):
   - `/Users/praveen/Desktop/stori/js/17c-create-pipeline.js` (5,581 lines; stale rev-4 canvas-launch at ~4889–5079, Tier-2 lipsync at ~3728–3900)
   - `/Users/praveen/Desktop/stori/js/28-canvas-consistency.js` (404 lines; stale rev-4 helpers at ~95, ~148; now also contains Replicate face-swap code at ~145–298 and LoRA lookup at ~225–227)
  - `/Users/praveen/Desktop/stori/build.js` (auto-discovers from `index.html`; static-tag regex at lines 69–78, dynamic-loader scan at 82–90 — **no `MAIN_FILES` symbol**; do not edit `build.js`)
  - `/Users/praveen/Desktop/stori/index.html` (loader array at 4752–4766; eager `<script>` block at ~4735–4740 — this is where the three new files get wired in)

*End of Phase 04 dev doc.*
