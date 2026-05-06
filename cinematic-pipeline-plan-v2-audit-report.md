# Cinematic Pipeline Plan v2 Audit Report

**Date:** 2026-05-06  
**Reviewer:** Senior engineer audit against the current codebase  
**Target:** `cinematic-pipeline-plan-v2.md`  
**Scope:** Logical consistency, migration sequencing, phase ordering, and code-backed implementation risk

---

## Executive Summary

The target architecture is directionally strong, but the current v2 plan still has **5 material logic issues** that should be resolved before implementation starts:

- **4 P1 issues**
- **1 P2 issue**

The biggest theme is not that the end-state design is wrong. The risk is that the **migration path is still internally inconsistent** in a few important places: new producers can get ahead of old readers, key scene fields are removed without a compatibility story, and the lip-sync scope is materially larger than the phase table implies.

---

## Findings

### 1. [P1] Phase 3 can land before readers understand multi-line scenes

**Plan location:** `cinematic-pipeline-plan-v2.md:929-931`  
**Why this matters:** the phase table allows the storyboard-agent rewrite to land after Phase 2a, but before Phase 2b. That is not actually safe with the compatibility mechanism the plan defines.

### What the plan says

- Phase 2a adds `dialogueLines[]` and a `scene.dialogue` shim.
- Phase 3 rewrites the storyboard agent to emit real `dialogueLines[]`.
- Phase 2b later migrates all readers away from `scene.dialogue`.

### Why the logic breaks

The shim defined in `cinematic-pipeline-plan-v2.md:252-265` returns only:

- `scene.dialogueLines[0]`

That means any unchanged reader will silently see only the first line in a multi-line scene.

### Current code that would misread multi-line scenes

- `js/33-audio-rehearsal.js:174-240` renders one audio row from `scene.dialogue`
- `js/29-canvas-render.js:562-606` builds the scene voice chip from `scene.dialogue`
- `js/17c-create-pipeline.js:3606-3610` gates Tier 1 lip sync from one `scene.dialogue`
- `js/17c-create-pipeline.js:3816-3818` gates Tier 2 lip sync from one `scene.dialogue`

### Impact

If Phase 3 emits true multi-line scenes before Phase 2b finishes, the app will not fail loudly. It will fail **quietly**:

- rehearsal UI shows only line 1
- lip-sync routing makes decisions from line 1 only
- canvas UI shows speaker/voice info for line 1 only

That is a dangerous migration shape because it can look superficially functional while dropping real content.

### Recommendation

One of these needs to become explicit in the plan:

1. **Make Phase 3 depend on Phase 2b**, or
2. **Constrain Phase 2a/3 producers** so they do not emit more than one line per scene until reader migration is complete

---

### 2. [P1] Duration cutover has no compatibility plan

**Plan location:** `cinematic-pipeline-plan-v2.md:197-200`  
**Why this matters:** the plan removes `scene.duration`, but only defines a compatibility shim for `scene.dialogue`.

### What the plan says

The new scene shape replaces:

- `scene.duration`

with:

- `durationSec`
- `durationTier`
- `segmentPlan[]`

### Why the logic breaks

The live code still uses `scene.duration` in many places, and the plan does not sequence or shim that cutover.

### Current code that still depends on `scene.duration`

- `js/33-audio-rehearsal.js:193-216` for rehearsal UI and duration status messaging
- `js/33-audio-rehearsal.js:528-531` for manual duration editing
- `js/33-audio-rehearsal.js:668-699` for duration drift and generation gating
- `js/29-canvas-render.js:553-555` for scene duration display
- `js/17c-create-pipeline.js:3620-3624` for lip-sync clip window boundaries
- `js/17c-create-pipeline.js:3840-3844` for Tier 2 lip-sync cost calculation
- `js/17d-create-languages.js:779-819` for animated export timeline construction

### Impact

This is not a cleanup detail. It is a core scene-contract migration with no compatibility story. As written, later phases assume the field is already gone, while large parts of the app still require it.

### Recommendation

Add an explicit duration migration strategy, for example:

- keep `scene.duration` as a derived compatibility field through the migration window
- add a helper/shim that maps `durationSec` / `durationTier` into legacy reads
- remove `scene.duration` only in a late cleanup phase after all readers are migrated

---

### 3. [P1] The new scene shape drops the clip contract the editor/export stack still needs

**Plan location:** `cinematic-pipeline-plan-v2.md:148-160`  
**Why this matters:** Phase 8 still promises per-segment behavior and fallback, but the proposed scene contract does not preserve the clip array structure that the rest of the app currently relies on.

### What the plan says

Section 5.2 preserves:

- `videoUrl`

But it does not explicitly preserve:

- `videoClips[]`
- `clipDuration`

### Why the logic breaks

Today the animated pipeline is not modeled as one flat video URL. Multiple downstream systems reconstruct or operate on per-clip data.

### Current code that depends on clip arrays

- `js/15-project.js:527-537` saves `videoClips` and `clipDuration`
- `js/15-project.js:1017-1029` restores animated scenes from `videoClipsData`
- `js/17d-create-languages.js:779-819` builds animated export timelines from clip arrays
- `js/27-canvas-state.js:97-103` mirrors canvas video state from `videoClips`
- `js/27-canvas-state.js:166-167` writes clip arrays back to scene state

### Internal contradiction in the plan

Phase 8 explicitly says stitching failure can fall back to:

- per-segment playback in the editor

But per-segment playback requires a persisted per-segment output contract. The scene model in Section 5.2 does not state one.

### Impact

Without an explicit persisted segment-output shape, the plan:

- breaks editor fallback semantics
- underestimates save/restore changes
- underestimates export timeline changes

### Recommendation

The plan should explicitly retain either:

- `videoClips[]` as a first-class field, or
- a replacement structure such as `renderOutputs[]` that preserves per-segment URLs and durations alongside the stitched primary output

---

### 4. [P1] Tier 1 multi-speaker lip sync is much larger than a router tweak

**Plan location:** `cinematic-pipeline-plan-v2.md:756-764`  
**Why this matters:** Section 13 frames this as a routing update plus a face-position upgrade, but the live Tier 1 implementation is still structurally single-speaker.

### What the plan says

Section 13 assumes:

- per-line routing
- multi-speaker scenes force Tier 1
- Tier 1 then handles those scenes with a face-position upgrade

### Why the logic breaks

The current Tier 1 implementation does not yet have the primitives needed for true multi-speaker visible dialogue in one scene.

### Current single-speaker assumptions in code

- `js/17c-create-pipeline.js:3606-3613` reads one scene-level `dialogue`
- `js/17c-create-pipeline.js:3643-3646` resolves one speaker character
- `js/17c-create-pipeline.js:3693-3709` stores one speaker ID and one sprite set on `scene.lipSync`
- `js/30-lipsync.js:199-214` still matches the active face as leftmost/rightmost, not by real character identity
- `js/30-lipsync.js:247-279` builds overlay instructions from one active turn at a time and one chosen face

### Impact

Two-shots, over-shoulders, and free framing with multiple visible speakers require more than a router:

- per-character sprite selection
- real face identity or staging metadata
- frame-level speaker-to-face assignment that is not "leftmost wins"

That is a broader subsystem change than Section 13 currently budgets for.

### Recommendation

The plan should do one of these explicitly:

1. **Broaden Phase 10 scope** to include per-character sprite and identity matching work, or
2. **Narrow v1 behavior** so multi-speaker visible dialogue still gets split into single-visible-speaker scenes for Tier 1

---

### 5. [P2] `audioRegions[]` exactness is not backed by a scheduled timing producer

**Plan location:** `cinematic-pipeline-plan-v2.md:501-516`  
**Why this matters:** the split-prompt section claims pass 2 tells Gemini exactly where dialogue occurs, but the code today does not yet produce those exact scene-local timings for all inputs.

### What the plan says

Section 8.4 says `audioRegions[]` gives Gemini precise dialogue vs silence windows within the composed segment plan.

### Why the logic is incomplete

Current timing producers are uneven:

- `js/32-audio-input.js:971-980, 990-992`  
  Original-audio mode produces real `audioSegmentStartMs/EndMs`

- `js/32-audio-input.js:1131-1142`  
  Re-TTS mode returns `dialogueLines[]` with `audioSegmentStartMs` and `audioSegmentEndMs` as `null`

- `js/17b-create-references.js:3477-3485`  
  Multi-voice TTS writes `actualStartMs/actualEndMs` only onto temporary `seg.dialogue` objects, not onto the scene-level `dialogueLines[]` contract described by the plan

### Impact

So the plan's stated invariant is stronger than the scheduled work:

- original-audio path can be exact
- re-TTS path is not exact yet
- the plan does not assign an owner/phase for propagating exact line timings into `dialogueLines[].withinSceneStartMs/EndMs` before Phase 8 consumes them

### Recommendation

Add an explicit task, with owner and phase, that:

- computes scene-local line timings after audio is finalized
- writes them onto `dialogueLines[].withinSceneStartMs/EndMs`
- derives `audioRegions[]` from that canonical timing source before `planSegments` pass 2 and the Gemini split-prompt call

---

## Secondary Risks

### Shared style surface is broader than the plan table suggests

The style migration is not isolated to the cinematic create flow. Current `STYLE_PRESETS` is also consumed in shared/reel paths such as `js/20-reels-creator.js`, so removing the old global is a wider compatibility change than the v2 phase table currently advertises.

### Estimate looks light for the live dependency graph

The document's:

- `~12 files`
- `~4-5 weeks`

estimate feels optimistic relative to the current amount of shared state and cross-module coupling in:

- create flow
- audio rehearsal
- canvas/editor
- project persistence
- animated export

---

## Bottom Line

The destination architecture still looks viable. The main problem is the **transition plan**, not the product vision.

Before implementation starts, I would tighten these three things in the plan:

1. Make the **scene-schema migration order** stricter, especially around multi-line dialogue.
2. Add explicit **compatibility strategy** for `scene.duration` and animated clip outputs.
3. Re-scope **Tier 1 multi-speaker lip sync** as a larger subproject, or narrow v1 behavior so it stays within the current system's real limits.
