# Cinematic Pipeline v4 — Full Codebase Logic Audit Report

Date: 2026-05-07
Audited against: Live codebase at `/Users/praveen/Desktop/stori/js/`
Prior audit: `cinematic-pipeline-v4-implementation-audit.md` (H-1, H-3/L-6/L-7 resolved)

**Status: 4 critical, 5 high, 8 medium, 8 low**

All findings verified against live source code with exact line numbers and code snippets.

---

## CRITICAL — Runtime crash risks or data corruption bugs

### C-1. `castApplyFramingDerived` calls `window.castDeriveSpeakerVisible` without existence check — will crash if function not loaded

**File:** `js/17b-create-references.js`, line 3560

**Current code:**
```javascript
const visible = window.castDeriveSpeakerVisible(seg.framing);
```

**Bug:** If `window.castDeriveSpeakerVisible` is not yet defined (script load order, partial load, or module isolation), this line throws a `TypeError: window.castDeriveSpeakerVisible is not a function`, which aborts the entire `castApplyFramingDerived` call. All `isVoiceOver` flags would remain unset, causing lip-sync to run on every line (including voice-over lines that should be skipped).

**Contrast with** the correct pattern used in `castEnforceCutOnSpeaker` (lines 2980–2982):
```javascript
const framingShowsMouth = window.castDeriveSpeakerVisible
  ? window.castDeriveSpeakerVisible(seg.framing)
  : false;
```

**Fix:**
```javascript
const visible = window.castDeriveSpeakerVisible
  ? window.castDeriveSpeakerVisible(seg.framing)
  : false;
```

**Severity:** CRITICAL — aborts framing derivation entirely, causing all scenes to default to visible (no voice-over lip-sync skipping).

---

### C-2. `_animateSingleScene` leaves `scene.videoClips` and `scene.videoUrl` inconsistent on submit failure

**File:** `js/21-kling.js`, lines 156–175

**Current code:**
```javascript
let firstTaskId;
try {
  firstTaskId = await submitKlingI2V(scene.imgDataUrl, motionPrompt, segPlan[0].durationSec, scene.negativePrompt);
} catch (err) {
  console.error(`[Kling] Scene ${sceneIdx + 1} submit failed:`, err.message);
  scene.videoError = err.message;
  return;                          // <— videoClips/videoUrl NOT cleared
}

scene.videoClips = [];              // only reached on success

try {
  const cdnUrl = await pollKlingTask(firstTaskId);
  // ...
} catch (err) {
  scene.videoError = err.message;
  return;                          // <— videoClips = [] but videoUrl still stale
}
// ...
scene.videoUrl = scene.videoClips[0]?.url || null;  // line 194, only on success
```

**Bug:** On `submitKlingI2V` failure, `scene.videoClips` and `scene.videoUrl` are NOT cleared. If the scene had stale clips from a previous attempt, they remain. On poll failure, `videoClips = []` (empty) but `videoUrl` still holds whatever it was before.

**Fix:** Add cleanup on both error paths:
```javascript
} catch (err) {
  console.error(`[Kling] Scene ${sceneIdx + 1} submit failed:`, err.message);
  scene.videoError = err.message;
  scene.videoClips = null;
  scene.videoUrl = null;
  return;
}
```
And similarly for the poll failure path.

**Severity:** CRITICAL — stale video data causes the UI to show a previous clip as if the current generation succeeded.

---

### C-3. `generatedDurationSec` and `croppedTailSec` not persisted in project save — lost on save/restore cycle

**File:** `js/15-project.js`, lines 528–537 (save path)

**Current code (save path):**
```javascript
const base = { id: s.id, prompt: s.prompt, startTime: s.startTime, endTime: s.endTime,
  // ...
  dialogueLines:      s.dialogueLines      || null,
  visualSubjectIds:   s.visualSubjectIds   || null,
  durationSec:        (typeof s.durationSec === 'number') ? s.durationSec : null,
  durationTier:       (typeof s.durationTier === 'number') ? s.durationTier : null,
  segmentPlan:        s.segmentPlan         || null,
  segmentPlanPass:    s.segmentPlanPass     || null,
  audioRegions:       s.audioRegions        || null,
  // generatedDurationSec — MISSING
  // croppedTailSec — MISSING
};
```

These fields ARE saved by auto-save (`js/17c-create-pipeline.js`, lines 1047–1048):
```javascript
generatedDurationSec: s.generatedDurationSec ?? null,
croppedTailSec:     s.croppedTailSec ?? null,
```

But the project save path never writes them, and the restore path never reads them. After a project save and restore, these fields are `undefined` on every scene.

**Impact:** `generatedDurationSec` and `croppedTailSec` are calculated by `planSegments` pass-1 (estimate) and pass-2 (actual). Losing them means:
- The UI can't display "actual vs estimated" duration after reload
- Any code that reads `scene.generatedDurationSec` for display calculations falls back to `undefined`
- The segment plan's total duration must be recomputed from scratch instead of being cached

**Fix:** Add to the save path after `audioRegions`:
```javascript
generatedDurationSec: s.generatedDurationSec ?? null,
croppedTailSec:       s.croppedTailSec ?? null,
```
And add to the restore path accordingly.

**Severity:** CRITICAL — data loss on every project save/restore cycle.

---

### C-4. `narrationMode`, `subStyle`, and `visualTreatment` not persisted in auto-save — lost on browser crash

**File:** `js/17c-create-pipeline.js`, lines 1034–1112 (autoSaveCreateState)

The auto-save state object includes `videoType`, `characters`, `bible`, etc. but does NOT include:
- `narrationMode`
- `subStyle`
- `visualTreatment`

These ARE persisted in the project save path (`js/15-project.js`, lines 625–627):
```javascript
subStyle:         window.createJobState.subStyle         || null,
visualTreatment:  window.createJobState.visualTreatment  || null,
narrationMode:    window.createJobState.narrationMode     || null,
```

**Impact on browser crash + auto-restore:**
- `narrationMode` resets to `undefined` → lip-sync routing skips or runs incorrectly
- `subStyle` resets to `null` → style picker re-appears, style-dependent prompts lose their treatment
- `visualTreatment` resets to `null` → visual rendering differences

**Fix:** Add to autoSaveCreateState:
```javascript
narrationMode: window.createJobState?.narrationMode || null,
subStyle: window.createJobState?.subStyle || null,
visualTreatment: window.createJobState?.visualTreatment || null,
```
And add corresponding restore logic in the auto-restore path.

**Severity:** CRITICAL — user-visible state loss on browser crash.

---

## HIGH — Logic errors producing wrong results

### H-1. `planSegments` off-by-one at tier boundary — exactly 7.0s gets a single 10s clip

**File:** `js/21-kling.js`, line 287

```javascript
tier = (remainingMs / 1000 > SPLIT_THRESHOLD && fits > tiers[0]) ? tiers[0] : fits;
```

At `remainingMs = 7000` (exactly 7.0 seconds): `7.0 > 7.0` → `false`, producing a single 10s clip. At `7001ms`: `7.001 > 7.0` → `true`, producing `[5s, 2.001s]`.

**Note:** The plan's §8.3 selection table explicitly states "7.0s → [10] 3.0s crop $0.40", so the current `>` operator matches the specification. This is a design concern, not a bug.

**Severity:** HIGH (specification-compliant but produces cost discontinuity)

---

### H-2. `_animateSingleScene` can pass `undefined` as duration if `segmentPlan` contains null entries

**File:** `js/21-kling.js`, lines 142–158

```javascript
let segPlan = Array.isArray(scene.segmentPlan) && scene.segmentPlan.length > 0
  ? scene.segmentPlan
  : planSegments({ audioMs: null, provider, scene, pass: 'estimate' }).segments;
// ...
firstTaskId = await submitKlingI2V(scene.imgDataUrl, motionPrompt, segPlan[0].durationSec, scene.negativePrompt);
```

If `scene.segmentPlan` is `[null]` or contains objects without `durationSec`, `segPlan[0].durationSec` would be `undefined`, causing an API error or silent default.

**Fix:** Add a validation guard:
```javascript
if (!segPlan || !segPlan[0] || typeof segPlan[0].durationSec !== 'number') {
  scene.videoError = 'Invalid segment plan';
  return;
}
```

**Severity:** HIGH

---

### H-3. `castEnforceCutOnSpeaker` uses `Object.assign` for shallow clone — shared mutable references

**File:** `js/17b-create-references.js`, lines 3009–3016

```javascript
const cloned = Object.assign({}, seg, {
  startTime:        start + per * i,
  endTime:          start + per * (i + 1),
  dialogueLines:    [Object.assign({}, line)],
  visualSubjectIds: splitVisualSubjects,
  framing:          'frontal-close-up',
  _cutFromSpeakerSplit: true,
});
```

`Object.assign({}, seg, ...)` copies all own enumerable properties from `seg`, but only `dialogueLines`, `visualSubjectIds`, `startTime`, `endTime`, `framing`, and `_cutFromSpeakerSplit` are overridden. Other properties like `segmentPlan`, `audioRegions`, `performance`, `imgDataUrl`, and nested objects are shared references. If downstream code mutates these on the clone, the original segment would also be mutated.

**Severity:** HIGH

---

### H-4. `_lockAndGenerateVideos` does not update `durationTier` after recomputing `segmentPlan`

**File:** `js/33-audio-rehearsal.js`, lines 992–1006

```javascript
for (const s of scenes) {
  if (s.audioActualDuration) {
    s.durationSec = s.audioActualDuration;
    if (provider && typeof window.planSegments === 'function') {
      const r = window.planSegments({ audioMs: s.audioActualDuration * 1000, provider, scene: s, pass: 'actual' });
      s.segmentPlan        = r.segments;
      s.segmentPlanPass    = 'actual';
      s.generatedDurationSec = r.totalGenSec;
      s.croppedTailSec     = r.croppedTailSec;
      // durationTier NOT updated
    }
  }
}
```

Compare with storyboard pipeline (`js/17c-create-pipeline.js`, lines 1641–1646):
```javascript
s.durationTier = _r.segments[0]?.durationSec ?? ...;
```

After audio rehearsal locks actual audio duration, `segmentPlan` is recomputed but `durationTier` stays at its estimate-phase value.

**Fix:** Add `s.durationTier = r.segments[0]?.durationSec ?? s.durationTier;` after `croppedTailSec` assignment.

**Severity:** HIGH

---

### H-5. `castGenerateMultiVoiceAudio` uses `segments.indexOf(seg)` for reference equality — may fail after clone

**File:** `js/17b-create-references.js`, lines 3379 and 3422–3424

```javascript
const segIdx = segments.indexOf(seg);
```

After `castEnforceCutOnSpeaker` creates `Object.assign` clones, if the segments array was re-mapped between `planTtsCalls` and `castGenerateMultiVoiceAudio`, `indexOf` would return -1. Line 3424 (`if (segIdx < 0) continue;`) silently skips those segments, causing missing audio.

In the current codebase, `seg` objects retain their reference from the original array, so `indexOf` works. But this is fragile.

**Severity:** HIGH

---

## MEDIUM — Inconsistencies or edge cases

### M-1. `computeNarrationMode` called before `castApplyFramingDerived` during project restore

**File:** `js/15-project.js`, lines 1107–1126

During project restore, `backfillVisualSubjectIds` is called at line 1107, but `castApplyFramingDerived` (which sets per-line `isVoiceOver`) may not have run yet. `computeNarrationMode` at lines 1123–1125 reads `isVoiceOver` from `dialogueLines`. For saved projects with correct `isVoiceOver` values, this is fine. For legacy projects where `isVoiceOver` was never saved, the narration mode may be computed incorrectly.

**Severity:** MEDIUM

---

### M-2. `backfillVisualSubjectIds` early-returns on existing arrays — stale IDs never removed

**File:** `js/17b-create-references.js`, lines 5048–5060

```javascript
if (Array.isArray(scene.visualSubjectIds)) return;  // early return
```

If `visualSubjectIds` contains stale IDs from a previous computation (e.g., a character was removed from the cast), they are never cleaned up.

**Severity:** MEDIUM

---

### M-3. Canvas duration stepper doesn't invalidate `segmentPlan`

**File:** `js/29-canvas-render.js`, lines 3118–3122

```javascript
window.sbActions.setDuration = function (scene, sb, dir) {
  const cur = typeof scene.durationSec === 'number' ? scene.durationSec : 6;
  scene.durationSec = Math.max(1, Math.min(60, cur + dir));
  renderAll();
  triggerSave();
};
```

When the user changes `durationSec` via the stepper, `segmentPlanPass` is NOT set to `null` to trigger a re-plan. The plan §6.5 duration shim's setter marks `segmentPlanPass = null`, but the stepper writes directly to `durationSec`, bypassing the shim.

**Fix:** Add `scene.segmentPlanPass = null;` after updating `durationSec`.

**Severity:** MEDIUM

---

### M-4. Auto-restore doesn't run scene field migration

**File:** `js/17c-create-pipeline.js`, lines 1119–1131

`restoreAutoSaveIfAvailable` returns raw state JSON. The project restore path in `15-project.js` (lines 1085–1112) runs `backfillVisualSubjectIds` and `computeNarrationMode`. The auto-restore path does NOT call these functions, meaning auto-restored scenes may be missing backfilled `visualSubjectIds` and `narrationMode`.

**Severity:** MEDIUM

---

### M-5. Auto-save omits `id`, `framing`, `performance`, `motionPrompt`, `negativePrompt`

**File:** `js/17c-create-pipeline.js`, lines 1039–1051

Auto-save scene serialization doesn't include `id`, `framing`, `performance`, `motionPrompt`, or `negativePrompt`. On crash recovery:
- Scenes have no `id` — breaks storyboardInstances/videoInstances correlation
- Scenes have no `framing` — breaks framing-dependent prompts and `castBuildFramingMotionPrompt`
- Scenes have no `motionPrompt` — falls back to generic prompt
- Scenes have no `negativePrompt` — Kling submits without negative prompt

**Severity:** MEDIUM

---

### M-6. Legacy `scene.duration` fallback could produce `clipDuration: undefined`

**File:** `js/15-project.js`, line 1062

```javascript
scene.videoClips = [{ url: scene.videoUrl, clipDuration: s.durationSec || s.duration }];
```

If a legacy project has both `durationSec` and `duration` as `0` or `null/undefined`, `clipDuration` would be `undefined`. Safer: `clipDuration: s.durationSec || s.duration || 5`.

**Severity:** MEDIUM

---

### M-7. `stitchedVideoData` save silently loses data on blob fetch failure

**File:** `js/15-project.js`, lines 550–556

The `stitchedVideoData` save uses `await fetch(s.videoUrl)` which can fail if the blob URL has been revoked. The `try/catch` catches the error and logs a warning, but the scene is still saved with `stitchedVideoData` missing. On restore, `_stitchedVideoMissing` is set to `true`, which is correct fallback behavior, but there's no retry mechanism or user notification.

**Severity:** MEDIUM (correct fallback behavior, but silently loses stitched video data)

---

### M-8. B-roll scenes keep stale `segmentPlan` after audio lock

**File:** `js/33-audio-rehearsal.js`, lines 991–1002

B-roll scenes without audio (`!s.audioActualDuration`) skip the `planSegments` pass-2 recomputation entirely. Their `segmentPlanPass` stays at `'estimate'` and `generatedDurationSec`/`croppedTailSec` stay at pass-1 values. If the user changed a B-roll scene's `durationSec` via the stepper after pass-1, the `segmentPlan` would be stale.

**Severity:** MEDIUM

---

## LOW — Minor issues, dead code, or documentation inconsistencies

### L-1. Brainstorm `sc.dialogue` is a different schema — NOT scene.dialogue

**File:** `js/26-brainstorm.js`, lines 1466, 1617, 1723

The brainstorm wizard uses `sc.dialogue` as an array of `{character, line}` entries — a different schema from `scene.dialogueLines[]`. Intentional and documented in plan §6.2.
**No action.**

---

### L-2. Reels-creator uses `duration` key (not `durationSec`) in internal format

**File:** `js/20-reels-creator.js`, line 142

```javascript
duration: s.durationSec,
```

The reel format uses `duration` as its own field. Not a migration bug.
**No action.**

---

### L-3. `planSegments` has a hardcoded price table that duplicates `KLING_PROVIDER.pricing`

**File:** `js/21-kling.js`, lines 280–283, 298

```javascript
const _P = { 5: 0.20, 10: 0.40 };
// ...
const PRICE = { 5: 0.20, 10: 0.40 };
```

Both duplicate `KLING_PROVIDER.pricing.tier`. If provider pricing changes, both must be updated. Also, `planSegments` accepts any `provider` parameter but always uses the hardcoded price table.

**Severity:** LOW

---

### L-4. `computeNarrationMode` throws on null/undefined scenes argument

**File:** `js/17c-create-pipeline.js`, line 3653

```javascript
function computeNarrationMode(scenes) {
  for (const scene of scenes) {  // throws if scenes is null/undefined
```

The project restore path guards this with `createScenes || []`, but direct calls with null would throw.

**Severity:** LOW

---

### L-5. Auto-save scene serialization missing `id` field

**File:** `js/17c-create-pipeline.js`, lines 1039–1051

Auto-save doesn't include `s.id`. Scenes are processed by array index on restore, so the missing `id` is technically OK for the pipeline, but `storyboardInstances` and `videoInstances` reference scenes by ID.

**Severity:** LOW

---

### L-6. `null` vs `[]` inconsistency for `dialogueLines` between save and restore

**File:** `js/15-project.js`

Save path: `s.dialogueLines || null` — saves `null` for empty arrays.
Restore path always produces `[]` for empty dialogueLines (lines 1102–1103).

Code that does `scene.dialogueLines || []` handles both, but `scene.dialogueLines.length` would crash on `null`.

**Severity:** LOW (restore always converts to `[]`, so `null` is always transient)

---

### L-7. `_stitchedVideoMissing` is runtime-only flag — correctly never persisted

**File:** `js/15-project.js`, line 550

The flag is re-derived from restore state. Not a bug.
**No action.**

---

### L-8. `callForSeg` uses `===` reference equality after `Object.assign` clones

**File:** `js/17b-create-references.js`, line 3473

```javascript
const callForSeg = calls.find(c => c.segments.some(s => s.seg === segments[i]));
```

After `castEnforceCutOnSpeaker` creates `Object.assign` clones, this reference equality could fail if the segments array was cloned between `planTtsCalls` and `castGenerateMultiVoiceAudio`. In practice, they share the same array, so this works. But it's fragile.

**Severity:** LOW

---

## Summary

| Severity | Count | Key Issues |
|----------|-------|-----------|
| CRITICAL | 4 | C-1: `castDeriveSpeakerVisible` crash without guard; C-2: stale videoClips/videoUrl on error; C-3: `generatedDurationSec`/`croppedTailSec` not persisted in project save; C-4: `narrationMode`/`subStyle`/`visualTreatment` not in auto-save |
| HIGH | 5 | H-1: 7.0s boundary (spec-compliant, design concern); H-2: undefined duration in segPlan; H-3: shallow clone shared refs; H-4: `durationTier` not updated in pass-2; H-5: indexOf reference fragility |
| MEDIUM | 8 | M-1: narrationMode before framing; M-2: stale IDs not removed; M-3: stepper doesn't invalidate segmentPlan; M-4: auto-restore missing backfill; M-5: auto-save missing fields; M-6: clipDuration undefined; M-7: stitched video fetch error; M-8: B-roll stale segmentPlan |
| LOW | 8 | L-1: brainstorm dialogue schema (intentional); L-2: reels duration key (intentional); L-3: hardcoded prices; L-4: null guard; L-5: missing id; L-6: null vs []; L-7: _stitchedVideoMissing (correct); L-8: indexOf ref fragility |

**Top priority fixes:**
1. **C-1**: Add `window.castDeriveSpeakerVisible ? ... : false` guard
2. **C-2**: Clear `scene.videoClips` and `scene.videoUrl` on error paths
3. **C-3**: Add `generatedDurationSec` and `croppedTailSec` to project save/restore path
4. **C-4**: Add `narrationMode`, `subStyle`, `visualTreatment` to auto-save and auto-restore
5. **H-3**: Consider deep-cloning mutable properties in `castEnforceCutOnSpeaker`
6. **H-4**: Add `s.durationTier = r.segments[0]?.durationSec ?? s.durationTier;` in `_lockAndGenerateVideos`
7. **M-3**: Add `scene.segmentPlanPass = null;` in duration stepper

---

*End of full codebase logic audit report.*