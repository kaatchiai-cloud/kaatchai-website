# Critical Audit: Cinematic Pipeline Plan

**Date:** 2026-05-06  
**Auditor:** Senior engineer review against current codebase  
**Scope:** Logical consistency, cross-plan integration, implementation feasibility  

---

## Executive Summary

The plan is architecturally sound and well-structured, but I've identified **8 critical issues**, **6 significant inconsistencies**, **9 minor concerns**, and **4 cross-plan conflicts** that need resolution before implementation. Some issues involve logical contradictions within the plan itself; others are conflicts between this plan and its sibling plans that will cause integration failures.

---

## CRITICAL ISSUES

### C1. `dialogueLines[]` schema conflicts with existing `scene.dialogue` + `additionalTurns` across 3 sibling plans

The plan replaces `scene.dialogue` (singular object) with `scene.dialogueLines[]` (array). However:

- **voice-and-lipsync-plan** §5.4-5.5 defines `scene.dialogue` as a singular object with `speakerCharacterId, speakerName, text, isVoiceOver, speakerVisible, actualStartMs, actualEndMs, voiceOverride, regenCount, muted`. It also defines `scene.speakerTurns[]` as a flat timeline of turns. The cinematic plan introduces `dialogueLines[]` which has *different field shapes* — `isVoiceOver` is now derived (not agent-set), `mood` is added, `withinSceneStartMs/EndMs` replaces `actualStartMs/EndMs`.

- **audio-rehearsal-plan** §5.1 extensively documents `scene.dialogue` (singular) with `voiceOverride, regenCount, regenLockToken, muted`. The cinematic plan's `dialogueLines[]` inherits `regenCount, muted, voiceOverride` but reorganizes them. Audio rehearsal plan's §6.1 per-image card shows a *single-row* layout; the cinematic plan redesigns it as N-rows per line (§13). These are fundamentally different UI models.

- **audio-input-plan** §6.2 defines `dialogueLines[]` on the `inputDoc.parsed` shape (pre-storyboard) that already has `speakerName, text, isVoiceOver, mood, speakerConfidence`. But the cinematic plan's `dialogueLines[]` on the *scene* shape adds `audioBufferKey, regenCount, regenLockToken, voiceOverride, muted, withinSceneStartMs/EndMs` — fields that don't exist in the input parser's shape. **Who maps between these two `dialogueLines[]` shapes, and when?** The plan doesn't specify this mapping function or its location in the pipeline.

**Impact:** Every downstream consumer (lip sync, rehearsal, editor, export) reads `scene.dialogue` currently. Changing to `scene.dialogueLines[]` requires updating all consumers simultaneously or maintaining a compatibility shim. The plan mentions a "backward-compat shim for saved projects" (§18 Phase 2) but doesn't specify what the shim looks like or where it lives.

**Recommendation:** Define an explicit `dialogue → dialogueLines[]` migration function in Phase 2 and a `dialogueLines[] → dialogue` read-shim for any consumer not yet migrated. Add the field-mapping table between input-formats-plan's `parsed.dialogueLines[]` shape and the scene-level `dialogueLines[]` shape.

---

### C2. `scene.duration` replaced by `durationSec` + `durationTier` + `segmentPlan[]`, but no backward-compat path for the 7+ existing readers

Currently `scene.duration` is read/written by at least 7 distinct code paths:
- `33-audio-rehearsal.js`: `computeDurationStatus`, `_adjustBrollDuration`, `_showDriftPopup`, `canGenerateVideos`, `_lockAndGenerateVideos`
- `17c-create-pipeline.js`: segment building, storyboard agent output parsing, video generation duration passing
- `21-kling.js`: `buildClipPlan(duration)`, `_animateSingleScene`
- `29-canvas-render.js`: storyboard node sizing
- `11-export.js`: timeline composition

The plan replaces `duration` (continuous) with `durationSec` (creative target) + `durationTier` (mechanical ceil) + `segmentPlan[]` (computed segments). But:

- It doesn't specify a migration path for `scene.duration` readers during the transition period. If Phase 2 (schema migration) replaces the field, every file that reads `scene.duration` breaks until it's updated.
- `buildClipPlan` in `21-kling.js:163` currently takes a single numeric `duration` and returns an array of clip durations. The plan replaces this with the segment planner which takes `audioMs + provider`. During migration, both paths need to coexist until all callers are updated.

**Recommendation:** The plan should specify that `scene.duration` is kept as a *derived* field (`durationSec` rounded to `durationTier`) during Phase 2, with a `getSceneDuration(scene)` helper that returns `scene.durationSec ?? scene.duration` for backward compat. Mark `scene.duration` as deprecated but not removed until all consumers are migrated.

---

### C3. `audioRegions[]` design has no producer — who computes `withinSceneStartMs/EndMs`?

§5.2 defines `dialogueLines[].withinSceneStartMs/EndMs` and `audioRegions[]` with silence regions and line references. But the plan never specifies:

1. **Who computes `withinSceneStartMs/EndMs` for each line?** Currently, `castGenerateMultiVoiceAudio` (17b:3308) computes `speakerTurns` with `startMs/endMs` relative to the *combined audio buffer*, not per-scene. The plan wants per-scene-relative timing, but doesn't specify where the mapping from absolute to scene-relative happens.

2. **Who builds `audioRegions[]`?** The storyboard agent emits `dialogueLines[]` with text and `isVoiceOver`, but no timing. TTS produces audio durations. The assembly of silence + dialogue regions into a timeline is the core audio-layout choreography — and the plan doesn't specify this function.

3. **Silence region computation:** `pre-roll-silence` and `post-roll-silence` in `audioRegions[]` suggest the plan wants designed silence (not just zero-padding). But the plan doesn't specify silence durations. Who decides that 1.5s of pre-roll silence goes before a line? The agent? A heuristic?

**Impact:** Without this specification, Phase 8 (per-image-card N-rows) and Phase 9 (lip-sync routing) can't be implemented because they depend on per-line timing.

**Recommendation:** Add a §7.6 or separate section that defines the `computeSceneAudioRegions(scene, ttsResult)` function. Specify silence defaults (e.g., 300ms pre-line, 200ms post-line, 500ms between speakers) and note that the storyboard agent can override these.

---

### C4. Segment planner §7.2 — split-threshold contradicts §7.1 pseudocode and creates an audio-clipping edge case

The pseudocode in §7.2 says:
```
pickSingleTierFit returns the smallest tier ≥ remainingMs/1000
```

And the examples show:
- audio 4.0s → main = 5s ✓
- audio 6.0s → main = 10s ✓
- **audio 7.0s → main = 5s + continuation 5s = 10s, 3s cropped**
- audio 9.5s → main = 10s ✓

But the text below says: *"The split threshold (8.5s) is a tunable; v1 default is 7.0s. Below this, audio is small enough that splitting helps; above it, single-tier is better."*

This creates a **dead zone**: audio of 5.1s–6.9s would use a 10s clip (wasting 3–5s of generation capacity), while audio of 7.0s uses a 5s+5s split. This jump from 10s generated → 10s generated at the boundary is fine, but consider audio of 5.1s:

- `pickSingleTierFit(5100, [5,10])` returns 10 (since 5s < 5100ms). But the plan says "Below [7.0s] splitting helps" — this contradicts the tier selection at 5.1s which would pick a single 10s tier, not a split.

The actual logic implied by the examples and text: For audio ≤ 5.0s: use single 5s tier. For audio 5.0s–~7.0s: use single 10s tier (wasteful but simpler). For audio 7.0s–10.0s: **split into 5+5** (7.0–8.5) or **single 10s** (8.5–10.0). But the pseudocode only has `pickSingleTierFit` and `pickSmallestTier` — there's no threshold check.

**Recommendation:** Rewrite the pseudocode to explicitly show the three-tier decision:
```
if audioMs ≤ minTier * 1000:
    single segment = minTier
elif audioMs ≤ splitThresholdMs:
    single segment = smallest tier ≥ audioMs
else:
    split: first = minTier, rest = fill segments
```
This makes the 5.0–7.0s bucket explicit and eliminates the ambiguity.

---

### C5. `narrationMode` is computed post-storyboard but style gate is pre-storyboard — circular dependency

§15.1 says `narrationMode` is "computed at scene generation time (after the storyboard agent commits)." But §10 says the style gate fires **before** the storyboard agent. The style gate's mode awareness (§10.4) shows different presets based on the project mode (film/brand/copilot/autopilot).

But `narrationMode` is `'voice-over' | 'dialogue' | 'mixed'` which determines lip-sync behavior. It's computed from the *storyboard agent's output* (whether all lines have `isVoiceOver: true`). This means:

1. The style gate can't gate lip-sync behavior because it runs before the storyboard.
2. The brain wizard (§9) picks style before the storyboard, so it can't know `narrationMode`.
3. The lip-sync skip (§15.2) happens at generation time, which is fine — but the UI needs to show lip-sync-relevant controls *after* storyboard, not in the style gate.

This is actually fine architecturally (the style gate affects visual style, not lip-sync routing), but the plan doesn't make this temporal dependency clear. The text in §15.1 says "computed at scene generation time" — this is ambiguous. It should specify exactly when in the pipeline `narrationMode` gets set and what triggers it.

**Recommendation:** Add a pipeline step number in §15 that says: "After storyboard agent commit (between Phase 4 and Phase 5 in the implementation order), compute `narrationMode` from all `dialogueLines[].isVoiceOver` flags. Store on `createJobState.narrationMode`. This must happen before lip-sync routing (Phase 9)."

---

### C6. Stitching (§7.4) says "client-side (MediaSource Extensions) for v1" — this won't work for seamless playback

MediaSource Extensions (MSE) can concatenate video segments, but:
1. MSE works with *fragmented MP4* (fMP4) containers, not raw video blobs from Kling/fal.ai which return MP4 or MOV.
2. Even with fMP4, you need matching codec parameters, resolution, and timing metadata across segments — which can't be guaranteed when the continuation segment was generated from a different seed image.
3. MSE is designed for adaptive streaming, not seamless concatenation of independently-generated clips. Frame-level discontinuity at segment boundaries will cause visible glitches.

The plan also says "hard cut at segment boundary (no crossfade), since the continuation prompt enforces visual continuity through the cut." This is optimistic — visual continuity at a hard cut in video is *perceptible* even with good continuation prompts. Two independently-generated 5s clips will have different noise patterns, micro-lighting variations, and temporal rhythms that make hard cuts jarring.

**Recommendation:** For v1, use server-side ffmpeg concat (re-encode to ensure consistent headers) or WebCodecs for frame-accurate concatenation. Document that hard cuts are a v1 quality concession and crossfade is v2. The fallback to "per-segment playback" for stitching failure is acceptable but should be acknowledged as a UX degradation, not just a "notice" to the user.

---

### C7. `visualSubjectIds` has no agent prompt field specification — how does the storyboard agent emit it?

§5.2 defines `scene.visualSubjectIds: ['char_maya']` but §11.2 (agent prompt additions) only says:
```
- visualSubjectIds: array of character IDs visible on camera in this scene
```

The storyboard agent needs explicit guidance on how to populate this field. Currently, the agent prompt (`castBuildDialogueAndFramingHint`) lists locked characters by name. But `visualSubjectIds` requires the agent to decide which characters are *visible* in a given scene — a creative decision that depends on framing.

The validator (§11.3) checks that `visualSubjectIds` IDs exist in `createJobState.characters`, but doesn't validate the *completeness* of the list. If a two-shot scene has `visualSubjectIds: ['char_maya']` (missing Joe), the validator won't catch this — and lip sync would incorrectly skip Joe's on-screen mouth animation.

**Recommendation:** Add a validator rule: "If `dialogueLines[i].isVoiceOver === false` for a speaker, that speaker's ID MUST appear in `visualSubjectIds`. Otherwise, flip `isVoiceOver` to `true` and log." This is partially stated in §11.3 but not as a hard constraint — it should be.

---

### C8. Multi-provider `continuation.mode` types are underspecified for video gen logic

§6.1 defines `continuation.mode` with four values: `'last-frame-i2v' | 'last-frames-conditioning' | 'embedding' | 'none'`. But the plan only implements `last-frame-i2v` (the current Kling path). The other three modes imply different submission logic:

- `'last-frames-conditioning'` — requires sending the last N frames as a sequence, not just one.
- `'embedding'` — requires sending a latent embedding from the previous clip, which implies provider access to internal model states.
- `'none'` — no continuation at all; the fallback is independently-generated clips.

The segment planner (§7.1) always assumes `last-frame-i2v` mode. If `continuation.mode === 'none'`, multi-segment scenes would need different stitching behavior (the continuation prompt doesn't apply, since there's no frame continuity).

**Recommendation:** Either:
(a) Remove the other modes from v1 (YAGNI) and only support `last-frame-i2v`, or  
(b) Add a `§7.6 Continuation mode fallback` section that specifies what happens for each mode.

Given this is a v1 plan with only Kling implemented, option (a) is safer.

---

## SIGNIFICANT INCONSISTENCIES

### S1. `scene.audioActualDuration` vs `scene.durationSec` semantic overlap

The audio-rehearsal-plan defines `scene.audioActualDuration` as the canonical TTS output duration (in seconds). The cinematic plan introduces `scene.durationSec` as "creative target (continuous, set by agent)."

What happens when TTS output is 7.2s but the agent set `durationSec: 5`? The segment planner takes `audioMs` as input (presumably `audioActualDuration * 1000`), not `durationSec`. But `durationSec` is the "creative target" — what if the agent's creative target and actual TTS diverge significantly?

The plan doesn't specify the source of `audioMs` in the segment planner. Is it `audioActualDuration * 1000` or `durationSec * 1000`? Given the plan removes drift tolerance and soundtouch, it must be `audioActualDuration` — but this should be explicit.

**Fix:** §7.1 should state: "audioMs = scene.audioActualDuration × 1000 (canonical TTS output duration). scene.durationSec is the agent's pre-TTS estimate and is advisory only."

---

### S2. Plan removes `dialogue.additionalTurns` but voice-and-lipsync-plan depends on it

§16.2 removes `scene.dialogue.additionalTurns` since `dialogueLines[]` replaces it. But the current `castEnforceCutOnSpeaker` (17b:2953) reads `additionalTurns` to decide whether to split. The plan says `castEnforceCutOnSpeaker` is "kept but generalized" (§3), but the input it reads (`additionalTurns`) is gone.

The plan should specify that `castEnforceCutOnSpeaker` is updated to read `dialogueLines` with `speakers.length > 1` instead of `additionalTurns.length > 0`. This is implied by §11.4 but not explicit in the removal list.

---

### S3. Wizard type values don't match codebase

§9.1 defines wizard step 1 as: `autopilot | copilot | brand-product | film-narrative`. But the current `brainstormState.wizardAnswers.type` uses `social | tutorial | brand-product | film-narrative` (from 26-brainstorm.js). `social` and `tutorial` are the current values for the quick-pick wizard, not `autopilot` and `copilot`.

The plan should clarify: are `autopilot`/`copilot` replacing `social`/`tutorial`, or are they in addition? The current codebase has `brainstormState.mode` (the pipeline recommendation) as `autopilot | copilot`, and `brainstormState.wizardAnswers.type` as `social | tutorial`. The plan conflates these two separate concepts.

---

### S4. `durationTier` ceiling rounding vs segment planner's `pickSingleTierFit`

§5.2 says `durationTier: 10, // mechanical: ceil to nearest provider.durationTiers`. But §7.2's `pickSingleTierFit` uses `smallest tier ≥ duration/1000` which for `durationSec: 5.1` returns tier 10, not tier 5. The `ceil` semantics and `pickSingleTierFit` semantics agree for values > smallest tier, but for `durationSec: 4.0`, `ceil to nearest` would give 5, while `pickSingleTierFit(4000, [5,10])` also gives 5 — consistent. However, `durationTier` as a field implies it's stored on the scene *before* the segment planner runs. When is it computed relative to TTS?

**Fix:** Clarify that `durationTier` is computed by the segment planner after TTS output, not by the storyboard agent. Or, remove `durationTier` from the scene shape and make it an output of `planSegments()` only.

---

### S5. Edit cascades (§14) don't account for `dialogueLines[]` multi-speaker complexity

§14.1 Class A edits treat line-level edits as "cheap, in-place." But changing a line's text in a multi-speaker scene can shift `withinSceneStartMs/EndMs` for ALL subsequent lines in that scene (if audio duration changes). This requires recomputing `audioRegions[]` for the whole scene, not just the edited line.

The plan says "Recompute scene audio total" but doesn't specify that `audioRegions[]` and all downstream `withinSceneStartMs/EndMs` must also be recomputed.

---

### S6. `subStyle` is project-level but `visualStyle` is on `finalScript` — when are they reconciled?

§5.1 puts `subStyle` on `createJobState` (project-level). §9.5 says `finalScript.visualStyle` is populated from `wizardAnswers.visualStyle`. §10.2 says the style gate picker writes to `createJobState.subStyle`.

But the plan never specifies when `finalScript.visualStyle` is reconciled with `createJobState.subStyle`. If the brainstorm's `finalScript.visualStyle` is `{preset: 'thriller', description: '...'}`, and then the user changes `createJobState.subStyle` via the style gate, which wins? The plan says "if the user came from brainstorm, skip the style gate" (§10.5), but what about style edits via the storyboard editing UI (§8.3)?

**Fix:** Add an explicit rule: `createJobState.subStyle` is the single source of truth at all times after initial set. `finalScript.visualStyle` is a one-time carrier that gets written to `subStyle` at finalise time and is never read again.

---

## MINOR CONCERNS

1. **§4 Shift #5 removes drift detection but `canGenerateVideos()` (33:687) is the video-gen gate.** The plan doesn't specify what replaces it. A simple "all scenes have audio" check? Or "all scenes have `segmentPlan` computed"?

2. **§12.2 Tier 1 MediaPipe upgrade — face position clustering by thirds.** This is a significant computer vision change. The current `matchFaceToSpeaker` uses leftmost-default. Position clustering requires running face detection on multiple frames, building a spatial model, and clustering. The plan doesn't specify the algorithm or which frames to sample.

3. **§13.1 UI — N audio rows per scene.** Each row has a mini-player with play/pause/slice controls. With 4 lines per scene × 30 scenes, that's 120 mini-players. Performance impact isn't addressed.

4. **§7.3 Gemini split-prompt cost estimate of ~$0.001/scene is optimistic.** Gemini 2.0 Flash pricing is input $0.075/1M tokens, output $0.30/1M. A scene context + motion prompt could easily be 2K+ tokens input and 500+ output tokens, making it closer to $0.001–0.002 per call. Not a blocker, but the estimate is at the low end.

5. **§16.1 says "degraded-mode-banner" is removed.** The actual CSS class in the codebase is `rehearsal-degraded-banner`, not `degraded-mode-banner`. Minor naming mismatch, but worth noting for code search.

6. **§8.2 `STYLE_PRESETS` sub-styles are mode-aware (film, brand, copilot, autopilot) but there's no "narration" mode.** The current codebase has `videoType: 'narration'` as a valid mode, but the plan's preset library doesn't include narration presets. `flowStyles` only defines `film` and `brand`.

7. **§11.5 adds three new framing values** (`two-shot-medium`, `two-shot-wide`, `over-shoulder-back-listening`), but the existing `FRAMING_PROMPTS` map in 17b:3003 has 9 values. New framings need prompt templates for both Kling image gen and motion prompts. The plan doesn't specify these templates.

8. **§10.5 skip detection says style gate is skipped when `subStyle` is already set** (from brainstorm). But if the user starts a new brainstorm session (§9.4 "New Session" button), `subStyle` needs to be cleared. The plan doesn't specify this cleanup.

9. **§5.2 `croppedTailSec` field.** This is computed as `totalGenSec - audioSec`. But the plan never specifies what *consumes* this field. Is it used by the video player to stop playback at the audio end? By the editor? By the subtitle aligner? Without a consumer specification, this field could become dead data.

---

## CROSS-PLAN CONFLICTS

### X1. Audio-rehearsal-plan depends on `dialogue` (singular) throughout

The audio-rehearsal-plan's entire §6 per-image card, §6.4 regen flow, and §5.1 data model all reference `scene.dialogue` as a singular object with `voiceOverride, regenCount, regenLockToken, muted`. The cinematic plan replaces this with `scene.dialogueLines[]` where each line has its own `voiceOverride, regenCount, regenLockToken, muted`. This requires a coordinated rewrite of all audio-rehearsal-plan code.

**Severity:** High — audio-rehearsal-plan must be updated in lockstep with Phase 2 (schema migration).

### X2. Voice-and-lipsync-plan §9 defines 9 framing values; cinematic plan adds 3

The `FRAMING_PROMPTS` map in voice-and-lipsync-plan §9.1 has 9 entries. The cinematic plan §11.5 adds `two-shot-medium`, `two-shot-wide`, `over-shoulder-back-listening`. These need prompt templates in both image gen and video gen paths. Voice-and-lipsync-plan needs updating.

### X3. Voice-and-lipsync-plan §2 non-goals say "Not multi-face-in-one-clip"

The cinematic plan's §12.1 explicitly enables multi-speaker-on-screen scenes with Tier 1 lip sync. This contradicts voice-and-lipsync-plan's explicit v1 non-goal: *"Not multi-face-in-one-clip. Cut-on-speaker rule means each dialogue clip has one speaker on screen. Two-shots with both characters lip-syncing is v2."* Since the cinematic pipeline plan is newer, voice-and-lipsync-plan needs its non-goals updated.

### X4. Audio-input-plan's `processOriginalAudio` writes to `scene.dialogue` (singular)

Both Mode A and Mode B of audio input write `scene.dialogue = { speakerName, text, isVoiceOver, ... }`. With `dialogueLines[]`, this needs rewriting.

---

## PHASE DEPENDENCY RISKS

### P1. Phase 2 (Schema Migration) is the linchpin — every subsequent phase depends on it

Phase 2 changes `scene.dialogue → dialogueLines[]`, adds `visualSubjectIds`, `durationSec + durationTier`, `segmentPlan`, `audioRegions`, `subStyle`, `narrationMode`. **Every downstream consumer must be updated before any of these new features can be exercised.** The plan says "backward-compat shim for saved projects" but the shim needs to be comprehensive enough to handle all 7+ readers currently in `scene.dialogue`.

**Recommendation:** Phase 2 is where the highest risk lives. Consider making it two sub-phases:
1. **Phase 2a:** Add new fields as additive (non-breaking). Add `dialogueLines`, `visualSubjectIds`, `durationSec` alongside `dialogue`. All readers continue using `dialogue` until their Phase is reached.
2. **Phase 2b:** After all consumers are migrated, remove `dialogue` and add `durationTier/segmentPlan`.

### P2. Phases 7–9 are marked "partially parallelizable" but have sequential data dependencies

- Phase 7 (segment planner) produces `segmentPlan[]` that Phase 9 (lip sync routing) consumes for stitched-video routing.
- Phase 8 (N-rows UI) needs `dialogueLines[].withinSceneStartMs/EndMs` that are computed during audio assembly (which depends on the segment planner for timing).
- Phase 9 (lip sync) needs `isVoiceOver` flags that come from the storyboard agent (Phase 3).

These can be developed in parallel but must be tested sequentially.

---

## SUMMARY TABLE

| Category | Count | Severity |
|----------|-------|----------|
| Critical issues | 8 | Must fix before implementation |
| Significant inconsistencies | 6 | Must address in plan revision |
| Minor concerns | 9 | Should address, not blocking |
| Cross-plan conflicts | 4 | Requires sibling plan updates |
| Phase dependency risks | 2 | Needs Phase 2 sub-phasing |

---

## RECOMMENDED ACTIONS (Priority Order)

1. **Resolve C1 + X1:** Define the `dialogueLines[]` migration path and field mapping table between input-parser shape and scene shape. Update audio-rehearsal-plan and voice-and-lipsync-plan to reference `dialogueLines[]`.
2. **Resolve C3:** Add a `computeSceneAudioRegions()` specification with silence defaults and timing derivation.
3. **Resolve C4:** Rewrite segment planner pseudocode with explicit three-tier decision logic and remove the contradictory "8.5s threshold" text.
4. **Resolve C2:** Add backward-compat helper `getSceneDuration()` and specify Phase 2a/2b sub-phasing.
5. **Resolve C5:** Add explicit pipeline step ordering for `narrationMode` computation.
6. **Resolve C7:** Add hard validator constraint linking `isVoiceOver === false` speakers to `visualSubjectIds`.
7. **Resolve C6:** Replace MSE stitching with ffmpeg concat or acknowledge hard-cut as v1 limitation.
8. **Resolve S1 + S4 + S6:** Clarify `durationSec` vs `audioActualDuration` semantics, `durationTier` compute timing, and `subStyle` source-of-truth rule.
9. **Resolve X3:** Update voice-and-lipsync-plan non-goals to remove "Not multi-face-in-one-clip."
10. **Resolve C8:** Remove `last-frames-conditioning` and `embedding` continuation modes from v1 spec.