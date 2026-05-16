# Phase 04 — Module Split: Agent Task Brief

## Scope
- Split `js/17c-create-pipeline.js` (5,581 lines) into three files: `17c` (AutoPilot core ~5,250), `17e-canvas-launch.js` (~158 lines), `17f-tier2-lipsync-fal.js` (~180 lines)
- Extract shared Gemini image-gen shim from `js/28-canvas-consistency.js` (404 lines) into `js/28a-image-gen-shim.js` (~35 lines)
- Replicate face-swap code (`_getReplicateKey`, `_replicateFaceSwap`, `applyFaceSwapToSceneImage`) and LoRA character lookup stay in `28` — NOT extracted to `28a`
- Wire three new files into `index.html` loader (dynamic loader array + eager `<script>` block); `build.js` auto-discovers — do NOT edit `build.js`
- Pure client-side refactor: zero behaviour change, zero new endpoints, zero server code, ~0 net line delta

## Files to modify
| File | Action | Verified line range | What changes |
|---|---|---|---|
| `js/17c-create-pipeline.js` | MODIFY | 5,581 lines (rev-5) | Remove canvas-launch block (~158 lines) and Tier-2 lipsync block (~180 lines). **Line ranges STALE — re-derive by grepping for function names at kickoff.** |
| `js/28-canvas-consistency.js` | MODIFY | 404 lines (rev-5) | Replace inline Gemini fetch in `generateStyleFingerprint` + `regenerateImageInstance` with `window.imageGenWithGemini(...)`. Replicate face-swap code stays untouched. |
| `index.html` | MODIFY | Dynamic loader ~4752–4766; eager scripts ~4735–4740 | Add `17e`, `17f` to dynamic loader array; add `28a` as eager `<script>` before `28` |
| `js/17e-canvas-launch.js` | CREATE | ~158 lines | `openCanvasPanel`, `closeCanvasPanel`, `_callGeminiForVideoPrompts`, `cgFillVideoPrompts`, `cgLaunchVideoAgent` + window exports |
| `js/17f-tier2-lipsync-fal.js` | CREATE | ~180 lines | Tier-2 fal.ai Kling LipSync block (section header `// ─── Lip sync — Phase 8: Tier 2`) |
| `js/28a-image-gen-shim.js` | CREATE | ~35 lines | `imageGenWithGemini({ prompt, refImages, style, geminiKey })` + `window.imageGenWithGemini` export |

## New endpoints
None. P04 ships zero `/v1/*` routes.

## Instance Checkpoints

### CP-04-1: 17c split complete (Wk 1)
`17e-canvas-launch.js` + `17f-tier2-lipsync-fal.js` extracted; line counts match expected totals.
```
ls js/17e-canvas-launch.js js/17f-tier2-lipsync-fal.js
# → both exist
wc -l js/17c-create-pipeline.js js/17e-canvas-launch.js js/17f-tier2-lipsync-fal.js
# → (17c + 17e + 17f) ≈ 5,581 ± 50
grep -n "openCanvasPanel\|closeCanvasPanel\|_callGeminiForVideoPrompts" js/17c-create-pipeline.js
# → 0 hits (moved to 17e)
```
HALT: if line count delta > 50 from expected → re-derive extraction ranges from function names.

### CP-04-2: 28 split + loader update (Wk 1–2)
`28a-image-gen-shim.js` extracted; `index.html` loader updated; `dist/` builds identically; dogfood smoke passes.
```
ls js/28a-image-gen-shim.js
# → exists
git diff --stat HEAD~1
# → ~0 net delta
node build.js
# → exit 0
```
Dogfood smoke (ALL must pass):
1. Illustrated AutoPilot: create story → generate images → verify output
2. Animated AutoPilot: launch canvas → generate video prompts → verify video
3. Tier-2 lipsync: apply lipsync → verify lip movement
4. Canvas consistency regen: right-click image → regenerate → verify replacement
HALT: any dogfood smoke fails → revert the split commit, re-derive line ranges, re-attempt.

## Exit criteria
```
# 1. 17c line count reduced
wc -l js/17c-create-pipeline.js
# → 5,250 ± 50

# 2. 17e exports exist
grep -n "window.openCanvasPanel\|window.closeCanvasPanel\|window.cgFillVideoPrompts\|window.cgLaunchVideoAgent" js/17e-canvas-launch.js
# → 4 hits

# 2a. 17e still has live Gemini calls at P04 exit (P05 replaces them) — NON-ZERO is passing
grep -n "generativelanguage.googleapis.com" js/17e-canvas-launch.js
# → ≥ 1 hit (expected, correct)

# 3. 17f has fal.ai code; 17c has zero
grep -n "fal.run\|fal-ai/kling-video/lipsync" js/17f-tier2-lipsync-fal.js
# → ≥ 2 hits
grep -n "fal.run\|fal-ai/kling-video/lipsync" js/17c-create-pipeline.js
# → 0 hits

# 4. 28a shim exported and called from 28
grep -n "imageGenWithGemini" js/28a-image-gen-shim.js js/28-canvas-consistency.js
# → export site + ≥ 2 call sites

# 5. Build succeeds; dist has new files
node build.js
# → exit 0
grep "17e-canvas-launch\|17f-tier2-lipsync-fal\|28a-image-gen-shim" dist/index.html
# → ≥ 3 hits

# 6. Near-zero net line delta
git diff --stat HEAD
# → ± 50 lines net across affected files

# 7. _generateNarratorClipsIfNeeded stays in 17c
grep -n "_generateNarratorClipsIfNeeded" js/17c-create-pipeline.js
# → ≥ 1 hit (NOT moved to 17e)

# 8. Replicate face-swap stays in 28
grep -n "_getReplicateKey\|_replicateFaceSwap\|applyFaceSwapToSceneImage" js/28-canvas-consistency.js
# → ≥ 3 hits (still in 28, NOT in 28a)
```

## Constraints
- **Line ranges are STALE** — all absolute line numbers in the phase doc are from rev-4. Re-derive at kickoff by grepping for function names (`openCanvasPanel`, `closeCanvasPanel`, `_callGeminiForVideoPrompts`, `cgFillVideoPrompts`, `cgLaunchVideoAgent`, `// ─── Lip sync — Phase 8: Tier 2`, `generateStyleFingerprint`, `regenerateImageInstance`)
- `28-canvas-consistency.js` is now 404 lines (was 224) — includes Replicate face-swap code that stays in `28`
- Do NOT extract face-swap code to `28a` — it is Replicate, not Gemini image-gen
- Do NOT move `_generateNarratorClipsIfNeeded` to `17e` — it is a talking-head narrator helper, not canvas-launch
- `17e` intentionally retains live Gemini calls at P04 exit — P05 owns replacing them
- No `MAIN_FILES` symbol in `build.js` — it auto-discovers from `index.html` via static-tag regex (lines 69–78) and dynamic-loader scan (lines 82–90). Edit `index.html`, NOT `build.js`
- No new endpoints
- No server-side code (`infra/` untouched)
- No BYOK key changes (`getCreateGeminiKey`, `localStorage.*stori_*` stay — P07 owns)
- No `js/27-canvas-state.js` edits
- No auto-formatting / lint cleanup / dead-code removal beyond the extraction
- Net line delta budget: ± 50 lines (lines moved, not deleted)

## Dependencies
- Phase 03 must exit first (API Contract + Project State)

## Key files to read before starting
- `/Users/praveen/Desktop/stori/migrations/migration-phase-04-module-split.md` — full phase spec
- `/Users/praveen/Desktop/stori/js/17c-create-pipeline.js` — 5,581 lines; primary split target
- `/Users/praveen/Desktop/stori/js/28-canvas-consistency.js` — 404 lines; shim extraction target
- `/Users/praveen/Desktop/stori/index.html` — loader array at 4752–4766; eager scripts at ~4735–4740
- `/Users/praveen/Desktop/stori/build.js` — auto-discovery logic at lines 69–78 (static regex) and 82–90 (dynamic scan); do NOT edit
- `/Users/praveen/Desktop/stori/js/17a-create-api.js` — understand `callGeminiAPI` pattern (not modified this phase)
