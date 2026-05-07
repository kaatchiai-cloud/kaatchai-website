# Cinematic Pipeline Plan v4 — Audit Report

Date: 2026-05-06
Plan: `cinematic-pipeline-plan-v4.md` (1237 lines)
Prior audits: v1 (14 findings), v2 (5 findings), v3 (5C+4H+3M+5O), v4-pre-fix (4C+5H+6M+5O)
Status: **3 critical, 4 high, 3 medium, 5 minor**

The v4 plan is substantially improved from v3. All prior audit findings have been addressed with specific code fixes. The remaining issues are new findings from this pass.

---

## CRITICAL

### C1. `legacyDialogueToLine` omits `speakerName` — breaks audio pipeline (§6.4)

**The bug**: `legacyDialogueToLine` at §6.4 maps 9 fields from `legacyDialogue` to the new `dialogueLines` entry, but **`speakerName` is missing**. The current `scene.dialogue` object has `speakerCharacterId` AND `speakerName` (verified at js/33-audio-rehearsal.js:163, :185, :1092 and js/17b-create-references.js:3032). The shim returns `lines[0]`, so any reader accessing `scene.dialogue.speakerName` through the shim gets `undefined`.

**Impact**: Multiple readers depend on `speakerName`:
- `castResolveVoiceForSpeaker(scene.dialogue.speakerCharacterId, scene.dialogue.speakerName)` at js/33-audio-rehearsal.js:163 — voice resolution for TTS, will receive `undefined` for `speakerName`
- `castBuildFramingMotionPrompt` at js/17b-create-references.js:3032 — reads `scene.dialogue.speakerName` for prompt substitution
- `planTtsCalls` — groups TTS calls by speaker, needs `speakerName`
- Audio rehearsal UI at js/33-audio-rehearsal.js:1092 — displays speaker name

Every legacy project restored through the shim will lose `speakerName` — this means voice resolution fails (no voice selected), audio playback labels break, and the framing motion prompt emits "the speaker" instead of the actual name.

**Fix**: Add `speakerName` to `legacyDialogueToLine`:
```js
speakerName: legacyDialogue.speakerName || null,
```
Also add `speakerName` to the `dialogueLines` entry schema in §5.2 — it's currently missing from the declared fields.

---

### C2. `dialogueLines` schema in §5.2 omits `speakerName` — cascading omission from C1

**The schema** at §5.2 lists these fields for `dialogueLines[]` entries:
> `speakerCharacterId, text, mood, isVoiceOver, withinSceneStartMs, withinSceneEndMs, audioBufferKey, regenCount, regenLockToken, voiceOverride, muted`

**Missing**: `speakerName`. This is not just a shim issue (C1) — the **canonical schema** for new scenes also omits it. But the storyboard agent (§12.3) says the agent emits `dialogueLines` — what fields does it emit? The plan says the agent emits "`speakerName`" in the `castBuildDialogueAndFramingHint` rewrite (§6.6: "dialogueLines: [{ speakerName, speakerCharacterId, text, mood, isVoiceOver }]"). So the agent DOES produce `speakerName`, but the §5.2 schema doesn't document it.

This is a documentation/schema contract issue that will cause implementors to omit the field in new code.

**Fix**: Add `speakerName` to the §5.2 schema:
```js
dialogueLines: [
  {
    speakerCharacterId: 'char_joe',
    speakerName:        'Joe',          // ADD THIS
    text:               'I had to.',
    ...
  }
]
```

---

### C3. `planTtsCalls` migration at §6.7 references `seg.performance` and `window.deriveSceneMood` — unverified existence

**The migration code** at §6.7 for `planTtsCalls` includes:
```js
const mood = (line.voiceOverride && line.voiceOverride.mood)
  || (seg.performance && (window.deriveSceneMood ? window.deriveSceneMode(seg) : 'matter-of-fact'))
  || 'matter-of-fact';
```

**Problem**: `window.deriveSceneMood` and `seg.performance` are referenced but not verified to exist. The current `planTtsCalls` function at js/17b-create-references.js:3157 falls back to scene-level mood derivation. The migration should preserve this behavior, but:
1. `seg.performance` is not documented as a standard field on segments/scenes.
2. `window.deriveSceneMood` is not cited with a verified file:line reference (unlike other function references in the plan).
3. The plan's §22 verification log does not include this reference.

If `deriveSceneMood` doesn't exist, the migration would produce `undefined` as the mood for lines without `voiceOverride.mood`, falling through to `'matter-of-fact'`. This is probably safe, but the reference should be verified.

**Fix**: Verify that `window.deriveSceneMood` exists at the referenced location, or replace with the actual mood-resolution pattern from the current `planTtsCalls` code. Add to §22 verification log.

---

## HIGH

### H1. Phase 8 `generatedDurationSec` and `croppedTailSec` are set on the scene but `planSegments` output doesn't document them being written back to the scene

§5.2 declares these fields on the scene:
```js
generatedDurationSec: 10.0,     // rendered total = sum(segmentPlan[].durationSec)
croppedTailSec:       2.6,       // generatedDurationSec - durationSec
durationTier:         10,        // dominant provider tier choice (informational)
```

§8.2 lists `planSegments` output as:
```js
segments, audioRegions, totalGenSec, croppedTailSec, expectedCost, fallbackPlan
```

But the plan doesn't document the code that writes `planSegments`'s output back to the scene object. Specifically:
- Who sets `scene.generatedDurationSec = totalGenSec`?
- Who sets `scene.croppedTailSec = croppedTailSec`?
- Who sets `scene.durationTier`?

The `durationTier` field is described as "informational" but it's used by the `scene.duration` shim getter (which resolves to `durationSec`, not `durationTier`). The plan explicitly says the shim "never resolves to `durationTier`." So `durationTier` is potentially dead code on the scene object — it's written but never read (the shim reads `durationSec` instead).

**Impact**: `generatedDurationSec` is needed by the animated export timeline (js/17d-create-languages.js currently uses `scene.duration` and `scene.videoClips[].clipDuration`). After migration, the timeline needs `generatedDurationSec` or `videoClips[].clipDuration` to compute clip boundaries. If nobody writes it to the scene, the timeline breaks.

**Fix**: Add an explicit step in Phase 8: after `planSegments` returns, write `scene.generatedDurationSec = totalGenSec`, `scene.croppedTailSec = croppedTailSec`, and `scene.durationTier = <computed tier>`. Remove `durationTier` from the scene shape if it's truly not read anywhere, or document its consumers.

---

### H2. `castGenerateMultiVoiceAudio` timing-write migration timing: listed in both Phase 2b (§6.7) and Phase 8 (§6.6)

§6.6 lists `castGenerateMultiVoiceAudio` as a "Phase 8" migration target: "Phase 8 wraps to derive `withinSceneStartMs/EndMs` for each `dialogueLines[]` entry."

§6.7 says it's migrated to "write `seg.dialogueLines[lineIdx].withinSceneStartMs/EndMs` instead of `seg.dialogue.actualStartMs/EndMs`" and that "This obsoletes the separate timing-finalization step for Mode B / re-TTS / text-input paths."

These two statements are contradictory. Either:
- (a) Phase 2b migrates the timing write, and Phase 8 doesn't need to do anything for TTS paths (only Mode A timing finalization remains), OR
- (b) Phase 8 wraps the existing timing write to derive `withinSceneStartMs/EndMs`.

The §6.7 description is more detailed and appears canonical — it says the migration happens in Phase 2b as part of `planTtsCalls` restructuring, and that `castGenerateMultiVoiceAudio` writes timings directly onto `dialogueLines[lineIdx]`. This makes Phase 8's "wrapping" unnecessary for TTS paths.

**Fix**: §6.6 should remove `castGenerateMultiVoiceAudio` from the Phase 8 migration target and note that Phase 2b handles TTS timing migration. §8.4 should clarify that the timing-finalization sub-step only applies to Mode A (Scribe diarization), not to TTS paths.

---

### H3. Audio rehearsal lock write site at js/33-audio-rehearsal.js:1136 needs `durationSec` update AND pass-2 trigger, but the lock step does more than just writing duration

§6.5 and §17.1 say the lock at line 1136 is rewritten from `s.duration = s.audioActualDuration` to `s.durationSec = s.audioActualDuration` and trigger pass-2 `planSegments`.

But the actual lock step at line 1136 is inside `_lockAndGenerateVideos()`, which does much more than writing duration:
- It computes audio actual duration
- It writes duration status
- It fires video generation

The plan's drift detection removal (§17.1) deletes `computeDurationStatus` and `canGenerateVideos`, but the lock step also orchestrates the video generation flow. Rewriting just the duration write without addressing the full lock flow could break the video generation pipeline.

**Fix**: Phase 12 (cleanup) should specify the full rewrite scope for `_lockAndGenerateVideos`: replace drift/status computation with the tier-fit check and pass-2 `planSegments` trigger, then proceed to video generation. The current description suggests a surgical line change but the actual scope is the entire lock function.

---

### H4. `backfillVisualSubjectIds` at §12.5a uses `scene.dialogueLines[0]` but doesn't account for `speakerCharacterId` being unresolved in some legacy scenes

§12.5a:
```js
const firstLine = (scene.dialogueLines && scene.dialogueLines[0]) || null;
if (firstLine && firstLine.speakerCharacterId && firstLine.speakerCharacterId !== 'narrator') {
  scene.visualSubjectIds = [firstLine.speakerCharacterId];
```

**Problem**: In legacy projects, `scene.dialogue.speakerCharacterId` may be `null` in cases where only `speakerName` was set (and `castApplyFramingDerived` was supposed to resolve it from the name). The old code at js/17b-create-references.js:3513-3524 does this resolution — it maps `speakerName` to `speakerCharacterId` by looking up the character list. If this resolution never happened for a scene (e.g., it was saved before the pipeline ran), `speakerCharacterId` would be `null`.

The backfill function would then set `visualSubjectIds = []` for a scene that actually has a visible speaker, making the speaker invisible to the lip-sync routing.

**Fix**: The backfill should also attempt `speakerName` resolution:
```js
if (firstLine && firstLine.speakerCharacterId && firstLine.speakerCharacterId !== 'narrator') {
  scene.visualSubjectIds = [firstLine.speakerCharacterId];
} else if (firstLine && firstLine.speakerName) {
  const resolved = resolveSpeakerCharacterId(firstLine.speakerName);
  scene.visualSubjectIds = resolved ? [resolved] : [];
} else {
  scene.visualSubjectIds = [];
}
```
Or, since `castApplyFramingDerived` runs in the pipeline and populates `speakerCharacterId` for scenes that went through the pipeline, the backfill is only needed for scenes that never went through the pipeline. In practice, this means scenes from brainstorm finalise that weren't processed by `castApplyFramingDerived` yet. These scenes would have `speakerCharacterId` resolved by the pipeline before lip-sync runs. So the risk is low but real: if a user loads a pre-v4 project and tries to edit a scene before running the pipeline, `visualSubjectIds` would be wrong. Flag this as an edge case in the plan.

---

## MEDIUM

### M1. `scene.audioActualDuration` is listed as "existing — kept" in §5.2 but will conflict with `durationSec` semantics after migration

The `audioActualDuration` field is currently how the pipeline records actual audio duration. After migration, `durationSec` is set to `audioActualDuration` during the lock step. Both `audioActualDuration` and `durationSec` would contain the same value post-lock, differing only pre-lock (where `durationSec` is the agent's estimate and `audioActualDuration` is null).

This is fine functionally but could cause confusion: two fields with the same value post-lock. The plan should document whether `audioActualDuration` remains the canonical source for post-lock duration, or whether `durationSec` takes over.

**Fix**: Add a note: "Post-lock, `durationSec === audioActualDuration`. `audioActualDuration` is kept for backward compatibility with audio-rehearsal code that reads it; new code reads `durationSec`."

---

### M2. The Phase 12 cleanup removes `canGenerateVideos()` but commands that gate on it need replacement logic

`canGenerateVideos()` at js/33-audio-rehearsal.js:687 is used to gate the "Generate Videos" button (line 836). Removing it without a replacement means the UI would allow video generation at any time, even before audio is locked or segments are planned.

**Fix**: The plan should specify the replacement gate. Post-drift-removal, the new gate should be: "every scene has `segmentPlanPass === 'actual'` AND every scene has `audioActualDuration > 0` OR `dialogueLines.length === 0` (B-roll)."

---

### M3. The `segmentPlanPass` field is set to `'estimate'` or `'actual'` but has no `'stale'` or `null` state for after user edits

When a user edits `scene.durationSec` (via the UI stepper at js/29-canvas-render.js:3116), the duration shim setter sets `segmentPlanPass = null` (§6.5). This invalidates the segment plan. But there's no mechanism to re-trigger pass-1 `planSegments` after a duration edit.

The edit cascade (§15) says:
- Change `motionPrompt` → video regen only (Class B)
- Change duration → "Motion prompt regen, video regen, downstream cascade with confirmation" (Class B)

But the plan doesn't specify that editing `durationSec` triggers `planSegments` pass-1 re-run. The shim setter invalidates `segmentPlanPass` (sets to `null`), but pass-1 doesn't automatically re-run — the user would need to trigger it.

**Fix**: Specify that Class B edits to `durationSec` trigger a pass-1 `planSegments` re-run. The re-run uses the new `durationSec` as the estimate. After audio rehearsal lock, pass-2 re-runs with actual audio duration.

---

## MINOR

### O1. The `speakerName` field should also be in `castEnforceCutOnSpeaker`'s Phase 3 rewrite

The Phase 3 rewrite at §12.1 creates `dialogueLines: [Object.assign({}, line)]`. If the agent produces `speakerName` in dialogueLines, it's preserved by `Object.assign`. But the Phase 3.5 rewrite at §12.5 also creates `dialogueLines: [Object.assign({}, line)]`. Both rely on the source `line` having `speakerName`. The agent needs to include it — and per C2, the schema should document it.

### O2. `processReTTS` at §6.6 is listed as "Writer keeps writing `dialogue` shape (TTS expects it)" — but `processReTTS` also produces `dialogueLines[]`

The plan says at §6.6 line 414: "Writer keeps writing dialogue shape (TTS expects it); shim ensures dialogueLines[] is also populated. Output dialogueLines[] (line 1132) preserved."

But at js/32-audio-input.js:1132, `processReTTS` returns `dialogueLines` with `audioSegmentStartMs: null`. This return value is the scene's `dialogueLines` array. The `dialogue` field in the TTS segment input is a different thing — it's the per-segment TTS input shape, not the scene-level field. The plan should clarify that the `dialogue` in the TTS segment input is NOT `scene.dialogue` but a different shape.

### O3. The `_stitchedVideoMissing` flag and sequential playback fallback (§8.7) is a significant new UX behavior that needs design specification

Currently, videos play from `scene.videoUrl` — a single URL. The plan adds a `_stitchedVideoMissing` flag and sequential clip playback. But the four preview sites listed (js/29-canvas-render.js:2442, :3388; js/20-reels-creator.js:2927, :3066) don't have sequential playback capability today. Implementing this requires:
- A clip-queue player that plays `videoClips[0]`, then queues `videoClips[1]`, etc.
- Smooth transition between clips (or hard cut with brief visual stutter).
- Subtitle timing adjustment across clip boundaries.

This is non-trivial and should be a tracked sub-deliverable in Phase 8.

### O4. The plan uses `gemini-2.5-flash` for the split-prompt call (§8.5) but the current `generateContinuationPrompt` uses `gemini-2.0-flash`

The plan acknowledges this upgrade at §8.5 and in §22. This is fine, but `gemini-2.5-flash` should be verified as available and cost-competitive. If it's not yet available, the plan should specify a fallback to `gemini-2.0-flash`.

### O5. The `project-level` vs `scene-level` `absoluteStartMs` computation in §8.4 needs verification

§8.4 defines: `scene.absoluteStartMs = min(line.audioSegmentStartMs)` across the scene's lines. This assumes that all lines in a scene have their `audioSegmentStartMs` relative to the project timeline, not relative to the scene start. Verified at js/32-audio-input.js:979 that Mode A produces project-level timestamps. But for multi-voice TTS paths (Mode B, text input, brainstorm), the plan says these paths write `withinSceneStartMs/EndMs` directly (§8.4 "No separate timing-finalization needed"). This is consistent.

However, if a project mixes Mode A scenes with TTS-generated scenes (e.g., user uploads some audio but types text for other scenes), the `absoluteStartMs` computation for Mode A scenes must account for the project-level offset, while TTS scenes use scene-local offsets. The timing-finalization function at §8.4 only handles Mode A — this is correct but should be explicitly documented as "Mode A only; TTS paths are already scene-local."

---

*End of audit.*