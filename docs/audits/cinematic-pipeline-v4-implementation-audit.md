# Cinematic Pipeline Plan v4 — Implementation Audit Report

Date: 2026-05-07 (initial), 2026-05-07 (re-verified)
Audited against: `cinematic-pipeline-plan-v4.md` (rev 4, audit-fix revision)
Codebase: `/Users/praveen/Desktop/stori/js/`

**Re-verified 2026-05-07 against live codebase.** Many findings from the initial report were based on the plan document's descriptions rather than the actual implementation code. Re-reading the source files confirmed that 8 of the original 17 findings are **already fixed in the codebase**. The status below reflects the current code.

---

## Status Summary

| ID | Finding | Initial Severity | Re-verified Status |
|---|---------|-----------------|-------------------|
| C-1 | `castGenerateMultiVoiceAudio` timing overwrite | Critical | **NOT A BUG** — code uses array-of-arrays, not scalar overwrite |
| C-2 | `planSegments` empty array for zero/negative input | Critical | **ALREADY FIXED** — guard at line 279 |
| H-1 | `scene.speakerVisible === false` reads deprecated field | High | **STILL PRESENT** — deferred to Phase 12 |
| H-2 | `legacyDialogueToLine` drops top-level `mood` | High | **ALREADY FIXED** — line 5020 has fallback |
| H-3 | Orphaned `durationStatus`/`durationDriftPct` | High | **STILL PRESENT** — deferred to Phase 12 |
| M-1 | `scene.durationSec || scene.duration || 5` fallback | Medium | **ALREADY FIXED** — code uses `??` not `\|\|` |
| M-2 | `planSegments` threshold `>` vs `>=` | Medium | **NOT A BUG** — `>` matches plan §8.3 selection table |
| M-3 | `finalizeSceneTimings` NaN guard for null `audioSegmentEndMs` | Medium | **ALREADY FIXED** — filter checks both fields |
| M-4 | `autoSaveCreateState` missing new fields | Medium | **ALREADY FIXED** — lines 1042-1049 persist all new fields |
| M-5 | `backfillVisualSubjectIds` only uses first line | Medium | **ALREADY FIXED** — iterates all lines with `Set` |
| L-1 | Stale `speakerVisible` comments | Low | **STILL PRESENT** — hygiene fix pending |
| L-2 | JSDoc `duration` → `durationSec` | Low | **STILL PRESENT** — hygiene fix pending |
| L-3 | `dist/index.html` stale bundle | Low | **NOT A SOURCE BUG** — rebuild before deploy |
| L-4 | Brainstorm `sc.dialogue` different schema | Low | **INTENTIONAL** — no action |
| L-5 | B-roll pass-2 skip | Low | **BY DESIGN** — no action |
| L-6 | `durationDriftPct = 0` dead write | Low | **STILL PRESENT** — Phase 12 cleanup |
| L-7 | `durationStatus = 'matched'` never persisted | Low | **STILL PRESENT** — Phase 12 cleanup |

**Remaining actionable issues: 1 high + 1 high (scheduled) + 2 low (scheduled) + 2 low (hygiene)**

---

## Context

The cinematic pipeline plan v4 has been implemented in the codebase. The plan's line 3 was updated from "design draft, not yet implemented" to "implemented (Phase 12 cleanup pending)" based on this audit's findings.

This audit verifies the implementation against the plan and checks for bugs, broken code, and inconsistencies introduced during the refactoring.

---

## CRITICAL — BOTH RESOLVED

### C-1. ~~`castGenerateMultiVoiceAudio` overwrites per-line timing for multi-line segments~~ — NOT A BUG

**File:** `js/17b-create-references.js`, lines 3365, 3426, 3515

**Initial report claimed:** `segmentResults[segIdx]` was a scalar overwrite, so multi-line TTS calls targeting the same segment would lose earlier line timings.

**Re-verified — code is correct.** The actual implementation uses an **array-of-arrays** pattern:

```javascript
// Line 3365 — initialized as array-of-arrays:
const segmentResults = Array.from({ length: segments.length }, () => []);

// Line 3426 — pushes into the array, not overwriting:
segmentResults[segIdx].push({
    audioBuffer: buf,
    durationMs: buf.duration * 1000,
    speakerId: call.speakerId,
    speakerName: call.speakerName,
    voiceId: call.voice.voiceId,
    provider: call.voice.provider,
    lineIdx,
});

// Lines 3515-3532 — iterates all entries per segment, writes per-lineIdx:
for (const sr of srs) {
    // ...
    if (seg && Array.isArray(seg.dialogueLines) && typeof sr.lineIdx === 'number' && seg.dialogueLines[sr.lineIdx]) {
        seg.dialogueLines[sr.lineIdx].withinSceneStartMs = startMs;
        seg.dialogueLines[sr.lineIdx].withinSceneEndMs   = endMs;
    }
}
```

Multi-line TTS calls targeting the same segment correctly push multiple entries into `segmentResults[segIdx]`, and the assembly loop iterates all of them, writing per-`lineIdx` timings. **No data is lost.**

**Action:** None. Original finding was based on the plan document's scalar pattern, not the actual array-of-arrays implementation.

### C-2. ~~`planSegments` produces empty array for zero/negative `sourceMs`~~ — ALREADY FIXED

**File:** `js/21-kling.js`, lines 279-282

**Re-verified — guard is present:**

```javascript
if (sourceMs <= 0) {
    const _P = { 5: 0.20, 10: 0.40 };
    return { segments: [{ idx: 0, durationSec: tiers[0], role: 'main' }], audioRegions: null, totalGenSec: tiers[0], croppedTailSec: 0, expectedCost: _P[tiers[0]] || 0, fallbackPlan: null };
}
```

**Action:** None. The defensive guard was already implemented.

---

## HIGH — REMAINING ISSUES

### H-1. `scene.speakerVisible === false` reads deprecated field

**File:** `js/29-canvas-render.js`, line 596

**Current code:**
```javascript
const voiceOver = (dlg && dlg.isVoiceOver) || (scene.speakerVisible === false);
```

**Bug:** `castApplyFramingDerived` no longer writes `speakerVisible` (it computes per-line `isVoiceOver` instead). For new scenes, `speakerVisible` is `undefined`, so `=== false` is harmless. For **restored legacy projects** with `speakerVisible: false` persisted, this stale read overrides per-line `isVoiceOver`, producing incorrect voice-over labels.

**Fix:**
```javascript
const voiceOver = dlg && dlg.isVoiceOver;
```

**Schedule:** Deferred to Phase 12 cleanup (per `cinematic-pipeline-plan-v4.md §17.1`).

### H-2. ~~`legacyDialogueToLine` drops top-level `mood` field~~ — ALREADY FIXED

**File:** `js/17b-create-references.js`, line 5020

**Re-verified — code is correct:**

```javascript
mood: (legacyDialogue.voiceOverride && legacyDialogue.voiceOverride.mood) || legacyDialogue.mood || 'matter-of-fact',
```

The `legacyDialogue.mood` fallback is present. **Action:** None.

### H-3. Orphaned `durationStatus` / `durationDriftPct` — read of field values that are never set

**File:** `js/33-audio-rehearsal.js`, lines 533–534 (writes), 738 (reads)

**Current code:**
```javascript
// Line 533-534 — writes values that nothing computes:
scene.durationStatus = 'matched';
scene.durationDriftPct = 0;

// Line 738 — reads values that no code ever sets:
} else if (s.durationStatus === 'pending' || s.durationStatus === 'error') {
```

**Bug:** `computeDurationStatus` was removed (0 matches across codebase). Nothing sets `durationStatus` to `'pending'` or `'error'`, so the branch at line 738 is **unreachable**. `durationDriftPct` is written but never consumed. `durationStatus` is never persisted in project save, making it `undefined` after reload.

**Fix options:**
1. Remove the dead writes (lines 533-534) and the dead read branch (line 738).
2. Re-implement status computation using `segmentPlanPass` and `audioActualDuration`.

**Schedule:** Deferred to Phase 12 cleanup (overlaps with L-6 and L-7).

---

## MEDIUM — ALL RESOLVED

### M-1. ~~`scene.duration` fallback uses `||` instead of `??`~~ — ALREADY FIXED

**File:** `js/20-reels-creator.js`, lines 5226, 5447, 5454

**Re-verified — code uses `??`:**
```javascript
startTime: scene.startTime, duration: scene.durationSec ?? 5,
```

The `|| scene.duration` fallback has been removed and replaced with `?? 5`. **Action:** None.

### M-2. ~~`planSegments` has a threshold discontinuity at exactly 7.0 seconds~~ — NOT A BUG

**File:** `js/21-kling.js`, line 287

**Current code:**
```javascript
tier = (remainingMs / 1000 > SPLIT_THRESHOLD && fits > tiers[0]) ? tiers[0] : fits;
```

The `>` operator correctly implements the plan's §8.3 selection table: "7.0s → [10] 3.0s crop $0.40". Changing to `>=` would split a 7.0s scene into `[5s, 2s]`, contradicting the plan. **Action:** None.

### M-3. ~~`finalizeSceneTimings` can produce `NaN` for null `audioSegmentEndMs`~~ — ALREADY FIXED

**File:** `js/21-kling.js`, line 312

**Re-verified — filter checks both fields:**
```javascript
const linesWithSrc = (scene.dialogueLines || []).filter(l => l.audioSegmentStartMs != null && l.audioSegmentEndMs != null);
```

The `&& l.audioSegmentEndMs != null` guard is present. **Action:** None.

### M-4. ~~`autoSaveCreateState` doesn't persist new fields~~ — ALREADY FIXED

**File:** `js/17c-create-pipeline.js`, lines 1042-1049

**Re-verified — all fields persisted:**
```javascript
dialogueLines: s.dialogueLines || null,
visualSubjectIds: s.visualSubjectIds || null,
segmentPlan: s.segmentPlan || null,
segmentPlanPass: s.segmentPlanPass ?? null,
audioRegions: s.audioRegions || null,
generatedDurationSec: s.generatedDurationSec ?? null,
croppedTailSec: s.croppedTailSec ?? null,
durationTier: s.durationTier ?? null,
```

**Action:** None.

### M-5. ~~`backfillVisualSubjectIds` only uses first dialogue line~~ — ALREADY FIXED

**File:** `js/17b-create-references.js`, lines 5049-5059

**Re-verified — iterates all lines with `Set`:**
```javascript
function backfillVisualSubjectIds(scene) {
  if (Array.isArray(scene.visualSubjectIds)) return;
  const ids = new Set();
  for (const line of (scene.dialogueLines || [])) {
    if (line.speakerCharacterId && line.speakerCharacterId !== 'narrator') {
      ids.add(line.speakerCharacterId);
    } else if (line.speakerName && line.speakerName.toLowerCase() !== 'narrator') {
      const resolved = resolveSpeakerFromName(line.speakerName);
      if (resolved) ids.add(resolved);
    }
  }
  scene.visualSubjectIds = [...ids];
}
```

**Action:** None.

---

## LOW — REMAINING ISSUES

### L-1. Stale comments referencing deprecated `speakerVisible`

**Files:** `js/17c-create-pipeline.js` lines 1304, 1391; `js/17b-create-references.js` lines 3023, 3547

Comments still reference `speakerVisible` as a live concept. Update to reference per-line `isVoiceOver` derivation.

**Schedule:** Hygiene fix, pending.

### L-2. `_animateSingleScene` JSDoc references `duration` instead of `durationSec`

**File:** `js/21-kling.js`, line 198

```javascript
// scenes: array of scene objects with { imgDataUrl, prompt, duration }
```

Should read `durationSec`.

**Schedule:** Hygiene fix, pending.

### L-3. ~~`dist/index.html` contains stale bundled code~~ — NOT A SOURCE BUG

`dist/` is a build artifact. Run `node build.js` before deploy. **No source action needed.**

### L-4. ~~Brainstorm wizard uses `sc.dialogue` as a different schema~~ — INTENTIONAL

The brainstorm wizard uses `sc.dialogue` as its own schema (`[{character, line}]`), unrelated to `scene.dialogueLines[]`. §6.2 of the plan documents this exclusion. **No action.**

### L-5. ~~`_lockAndGenerateVideos` skips B-roll scenes for pass-2~~ — BY DESIGN

B-roll scenes without audio retain their pass-1 `segmentPlan`. No code change needed. **No action.**

### L-6. `durationDriftPct = 0` is a dead write

**File:** `js/33-audio-rehearsal.js`, line 534

With `computeDurationStatus` removed, `durationDriftPct` is never read. Dead write.

**Schedule:** Phase 12 cleanup (same item as H-3 and L-7).

### L-7. `durationStatus = 'matched'` is never persisted

**File:** `js/33-audio-rehearsal.js`, line 533

`durationStatus` is set to `'matched'` but never saved. On reload it's `undefined`, and `'pending'`/`'error'` are never set. The badge system is non-functional.

**Schedule:** Phase 12 cleanup (same item as H-3 and L-6).

---

## Implementation Confirmation Summary

| Plan Section | What | Status |
|---|---|---|
| §6.2–6.7 | `dialogueLines[]` schema, `visualSubjectIds`, `durationSec`, `generatedDurationSec`, `segmentPlan`, `audioRegions` | ✅ Fully implemented |
| §6.3–6.4 | `legacyDialogueToLine` with `speakerName` and `mood` fallback | ✅ Implemented correctly (H-2 was already fixed) |
| §6.5 | `durationSec` / `_legacyDuration` migration (one-time, no shim) | ✅ Implemented correctly (M-1 `??` fallback already fixed) |
| §6.6 | `castBuildDialogueAndFramingHint` produces `dialogueLines[]` + `visualSubjectIds` | ✅ Implemented |
| §6.7 | `planTtsCalls` iterates `dialogueLines[]` with `{seg, lineIdx}` and array-of-arrays `segmentResults` | ✅ Implemented correctly (C-1 was not a bug) |
| §12.1 | `castEnforceCutOnSpeaker` Phase 3.5 narrowed rule | ✅ Implemented |
| §12.4 | `castApplyFramingDerived` per-line `isVoiceOver` | ✅ Implemented |
| §12.5a | `backfillVisualSubjectIds` iterates all lines with `Set` | ✅ Implemented correctly (M-5 was already fixed) |
| §8.2 | `planSegments` two-pass model with zero/negative guard | ✅ Implemented correctly (C-2 guard present) |
| §8.3 | Split threshold `>` at 7.0s — correct per plan | ✅ Correct (M-2 was not a bug) |
| §8.4 | `finalizeSceneTimings` Mode A normalization with `endMs` null guard | ✅ Implemented correctly (M-3 guard present) |
| §8.7 | `stitchedVideoData` + `_stitchedVideoMissing` | ✅ Implemented |
| §13.4 | `computeNarrationMode` + lazy triggers | ✅ Implemented |
| §17.1 | Removes: `buildClipPlan`, `generateContinuationPrompt`, `canGenerateVideos`, `soundtouch-js` | ✅ All removed |
| §17.1 | `_lockAndGenerateVideos` rewrite with pass-2 `planSegments` | ✅ Implemented |
| §17.1 | `s.durationSec = s.audioActualDuration` | ✅ Implemented |
| §7 | Provider abstraction `KLING_PROVIDER` | ✅ Implemented |
| Save/restore | `autoSaveCreateState` persists all new fields | ✅ Implemented correctly (M-4 was already fixed) |
| §21 | Telemetry counters (`_cinematicShimWarnings`) | ❌ Not implemented (design deviation — one-time migration instead of shims) |

### Remaining Action Items (not yet in code)

| ID | Description | Schedule |
|---|---|---|
| H-1 | Remove `scene.speakerVisible === false` fallback at `29-canvas-render.js:596` | Phase 12 |
| H-3/L-6/L-7 | Remove orphaned `durationStatus`/`durationDriftPct` writes and dead read branch | Phase 12 |
| L-1 | Update stale `speakerVisible` comments (4 locations) | Hygiene, pending |
| L-2 | Fix JSDoc `duration` → `durationSec` at `21-kling.js:198` | Hygiene, pending |

---

*End of implementation audit report. Re-verified 2026-05-07.*