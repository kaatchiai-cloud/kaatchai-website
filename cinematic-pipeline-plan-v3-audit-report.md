# Cinematic Pipeline Plan v3 Audit Report

**Date:** 2026-05-06  
**Reviewer:** Senior engineer audit against the current codebase  
**Target:** `cinematic-pipeline-plan-v3.md`  
**Scope:** Logical consistency, migration sequencing, state-model correctness, restore/persistence behavior, and code-backed feasibility

---

## Executive Summary

v3 is a real improvement over v2. It closes several of the migration holes that were still open before:

- explicit `scene.duration` shim
- preserved `videoClips[]` contract
- timing-finalization step
- narrowed v1 lip-sync scope

That said, **4 material issues still remain**:

- **2 P1 issues**
- **2 P2 issues**

The recurring pattern is that the plan is strongest on destination architecture, but still a little unstable in the **transition contract** between old readers and new scene semantics.

---

## Findings And Fixes

### 1. [P1] `scene.duration` still collapses incompatible meanings into one field

**Plan location:** `cinematic-pipeline-plan-v3.md:298-316`

### Why this is still broken

The v3 shim makes legacy `scene.duration` resolve like this:

1. `durationTier`
2. `durationSec`
3. `_legacyDuration`

That looks neat, but it still mixes together **different concepts**:

- **visible scene length**: how long the user thinks the scene is
- **generated mechanical budget**: how much video is rendered across segments
- **stitched total before crop**: the rendered length including the tail that is never seen

Those are not interchangeable once continuation exists.

The plan itself proves the mismatch:

- `croppedTailSec` exists because generated video can be longer than the visible scene
- edge case #4 says `10.1s -> [10s, 5s]` with `4.9s` cropped

So if `scene.duration` resolves to `durationTier` or generated total after pass 2, it is **not** the same value legacy readers use today.

### Current code that depends on `scene.duration` meaning “visible scene length”

- [js/17d-create-languages.js](/Users/praveen/Desktop/stori/js/17d-create-languages.js:779)
- [js/29-canvas-render.js](/Users/praveen/Desktop/stori/js/29-canvas-render.js:554)
- [js/33-audio-rehearsal.js](/Users/praveen/Desktop/stori/js/33-audio-rehearsal.js:193)

### Additional migration bug

The setter is not actually backward compatible for current editors:

- [js/29-canvas-render.js](/Users/praveen/Desktop/stori/js/29-canvas-render.js:3115)
- [js/33-audio-rehearsal.js](/Users/praveen/Desktop/stori/js/33-audio-rehearsal.js:528)

Those write `scene.duration`. But once `durationTier` exists, the getter ignores `_legacyDuration`, so old writes become effectively invisible until some later planner rerun.

### Required fix

The plan should stop using one field to carry multiple meanings.

### Proposed plan-level correction

Use this split consistently:

- `durationSec`
  - **visible scene length**
  - what users edit
  - what old `scene.duration` readers should see during migration

- `generatedDurationSec`
  - sum of `segmentPlan[].durationSec`
  - the mechanical rendered total

- `croppedTailSec`
  - `generatedDurationSec - durationSec`

- `durationTier`
  - optional shorthand for the dominant provider tier choice if still useful
  - should **not** be treated as visible scene length

### Required shim change

The compatibility getter for `scene.duration` should resolve to:

1. `durationSec`
2. `_legacyDuration`

and **never** to `durationTier`.

### Required writer change in the plan

Legacy writes to `scene.duration` must:

- update `durationSec`
- mark `segmentPlan` stale
- force pass-2 planner recomputation before any next render/export step

### Why this fix is the safest

It preserves the meaning old readers already assume, while keeping the new rendered-budget math explicit instead of hidden behind a compatibility alias.

---

### 2. [P1] Phase 3.5 and the v1 lip-sync scope still disagree about two-shot dialogue

**Plan location:** `cinematic-pipeline-plan-v3.md:650-657`

### Why this is still broken

Section 12.1 says:

- Phase 3.5 preserves two-shot framings
- multi-line scenes are allowed in production

But Section 13.2 and edge case #7 say the opposite for v1:

- multi-speaker visible scenes still force cut-on-speaker
- true multi-character visible lip sync is deferred to v1.5

The current code supports the **narrower** interpretation only:

- [js/17c-create-pipeline.js](/Users/praveen/Desktop/stori/js/17c-create-pipeline.js:3606)
- [js/17c-create-pipeline.js](/Users/praveen/Desktop/stori/js/17c-create-pipeline.js:3703)
- [js/30-lipsync.js](/Users/praveen/Desktop/stori/js/30-lipsync.js:199)
- [js/30-lipsync.js](/Users/praveen/Desktop/stori/js/30-lipsync.js:247)

Today Tier 1 still fundamentally assumes:

- one scene-level visible speaker
- one sprite set
- one matched face at a time

### Required fix

The plan needs **one** explicit v1 rule and it should match the current system’s real capability.

### Recommended rule for v1

Keep this hard constraint through all of v1:

- **Any scene with multiple visible speaking characters must still be split by `castEnforceCutOnSpeaker`.**

Allow multi-line scenes in v1 **only** when they do not require multi-character visible lip sync, for example:

- one visible speaker + one voice-over line
- one visible speaker + off-screen reaction/narration
- single-speaker scenes with multiple lines

### Concrete plan changes needed

1. Section 12.1:
   - change “preserve two-shot framings” to:
   - “preserve multi-line scenes only when at most one speaker is visibly lip-synced”

2. Section 13.2:
   - keep current v1 scope exactly as written

3. Edge cases:
   - update #7 and #30 so there is no scenario where preserved visible two-shot dialogue is implied in v1

4. Phase table:
   - Phase 3.5 should be described as:
   - “lift cut-on-speaker for safe multi-line cases”
   - not “multi-line scenes finally allowed in production” without qualification

### Alternative fix

If the intent is to truly preserve visible two-shot dialogue in v1, then Phase 10 must absorb the v1.5 multi-character lip-sync project. That is a much larger scope and is not supported by the current codebase.

---

### 3. [P2] Mode A timing finalization assumes scene-local timings that current audio-input semantics do not guarantee

**Plan location:** `cinematic-pipeline-plan-v3.md:497-512`

### Why this is still incomplete

The plan says original-audio mode can copy:

- `audioSegmentStartMs`
- `audioSegmentEndMs`

directly into:

- `withinSceneStartMs`
- `withinSceneEndMs`

because Mode A scene structure mirrors speaker-boundary segmentation.

That is not guaranteed by the current flow.

### Current behavior

Mode A creates project-level dialogue line timings here:

- [js/32-audio-input.js](/Users/praveen/Desktop/stori/js/32-audio-input.js:979)
- [js/32-audio-input.js](/Users/praveen/Desktop/stori/js/32-audio-input.js:992)

Then it separately groups consecutive lines into scene-like visual context here:

- [js/32-audio-input.js](/Users/praveen/Desktop/stori/js/32-audio-input.js:1004)
- [js/32-audio-input.js](/Users/praveen/Desktop/stori/js/32-audio-input.js:1023)

And stores that structure here:

- [js/32-audio-input.js](/Users/praveen/Desktop/stori/js/32-audio-input.js:928)

So the existing semantics are:

- line timings are project-level
- scene grouping is a later step

Those are not automatically scene-local.

### Required fix

The plan should not claim direct copy unless it also locks a one-line-per-scene invariant for Mode A.

### Safer fix to put in the plan

Add an explicit normalization step for Mode A:

1. Keep `audioSegmentStartMs/EndMs` as **project-level canonical timings**
2. During scene construction, record which input lines feed each scene
3. Compute:
   - `scene.absoluteStartMs = min(line.audioSegmentStartMs)`
4. Then derive:
   - `withinSceneStartMs = line.audioSegmentStartMs - scene.absoluteStartMs`
   - `withinSceneEndMs = line.audioSegmentEndMs - scene.absoluteStartMs`

### Concrete wording change

Replace:

- “these are scene-local because Mode A's scene structure mirrors speaker-boundary segmentation”

with:

- “these are the canonical project-level timings for Mode A lines; if a scene contains more than one source line, timing finalization must normalize them relative to that scene’s absolute start”

### Alternative narrow fix

If you want to keep the plan simpler, explicitly lock v1 Mode A to:

- **one input line -> one scene**

But that is a functional narrowing, not just a documentation fix.

---

### 4. [P2] Preserving `videoClips[]` alone does not preserve the stitched playback contract across restore

**Plan location:** `cinematic-pipeline-plan-v3.md:606-611`

### Why this is still incomplete

v3 correctly preserves:

- `videoClips[]`
- `clipDuration`

But it still overstates what that buys you for reopen/restore behavior.

### Current restore behavior

On restore, multi-clip scenes are rebuilt like this:

- recreate `scene.videoClips`
- set `scene.videoUrl = scene.videoClips[0].url`

See:

- [js/15-project.js](/Users/praveen/Desktop/stori/js/15-project.js:1017)

Current preview surfaces still use `scene.videoUrl` as the primary playback/rendered asset:

- [js/29-canvas-render.js](/Users/praveen/Desktop/stori/js/29-canvas-render.js:2442)
- [js/29-canvas-render.js](/Users/praveen/Desktop/stori/js/29-canvas-render.js:3388)
- [js/20-reels-creator.js](/Users/praveen/Desktop/stori/js/20-reels-creator.js:2927)
- [js/20-reels-creator.js](/Users/praveen/Desktop/stori/js/20-reels-creator.js:3066)

So if the project is reopened and the stitched asset is not separately restored, the experience still regresses to:

- first clip playback

### Required fix

The plan needs a restore-time rule for the stitched output, not just for raw segment outputs.

### Recommended fix to add to the plan

Persist both:

- `videoClipsData[]`
- `stitchedVideoData`

and restore them distinctly:

1. If `stitchedVideoData` exists:
   - rebuild `scene.videoUrl` from it
2. Else if only `videoClipsData[]` exists:
   - restore `scene.videoClips[]`
   - mark stitched playback as missing
   - either:
     - restitch on load, or
     - explicitly fall back to sequential clip playback in preview UI

### Required phase-table change

Add explicit ownership for this work in one of:

- Phase 2a save/restore migration
- or Phase 8 stitching contract

Right now the plan says save/restore will “read `videoClips[]`”, but it does not assign responsibility for reconstructing the **primary stitched playback artifact**.

### Best practical version

The cleanest v1 behavior is:

- persist stitched output whenever it exists
- preview surfaces prefer stitched output
- sequential-clip fallback is used only when stitched output is absent or failed

---

## Recommended Plan Edits Summary

If I were tightening the plan before implementation, I would make these 4 edits immediately:

1. **Redefine duration semantics**
   - `durationSec` = visible scene length
   - `generatedDurationSec` = rendered total
   - `scene.duration` shim resolves to visible length only

2. **Narrow Phase 3.5**
   - v1 still splits any multi-speaker visible dialogue scene
   - multi-line preserved scenes allowed only when lip-sync remains single-speaker

3. **Normalize Mode A timings explicitly**
   - treat existing line timings as project-level source timings
   - derive scene-local offsets during scene construction / timing-finalization

4. **Add stitched restore contract**
   - persist and restore stitched output separately from segment clips
   - define preview fallback when stitched asset is unavailable

---

## Bottom Line

v3 is close. The remaining work is mostly about making the plan's **compatibility semantics** unambiguous:

- what `duration` means
- when multi-line/two-shot scenes are actually allowed
- whether timings are project-local or scene-local
- what artifact is treated as the authoritative video on restore

Once those are tightened, the plan will be much more implementation-safe.
