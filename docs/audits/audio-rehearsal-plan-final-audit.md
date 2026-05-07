# Audio Rehearsal Plan — Final Audit (Pass 3)

Date: 2026-05-05
Scope: Full logical-consistency audit of the updated `audio-rehearsal-plan.md` (1630 lines), cross-referenced against voice-and-lipsync-plan.md, consistency-plan.md, and existing codebase.

Prior issues: 16 original + 3 from pass 2. All resolved.
New findings: 1 medium, 5 low. Zero blocking.

---

## Prior Issues — Final Disposition

| ID | Severity | Status |
|---|---|---|
| H1–H5 | High | ✅ Resolved (pass 1 audit) |
| M1–M7 | Medium | ✅ Resolved (pass 1 audit) |
| L1, L3, L4 | Low | ✅ Resolved (pass 1 audit) |
| L2 | Low | ✅ Invalid (pass 1 audit) |
| M8 | Medium | ✅ Resolved — §8.7 implementation note + §12 Phase 2 updated + decision log + acceptance criteria |
| L5 | Low | ✅ Resolved — `actualStartMs` semantics documented in §5.1 + decision log + acceptance criteria |
| L6 | Low | ✅ Resolved — `totalVideoDurationMs` removed from project state; on-the-fly computation documented in §5.2 |

---

## New Issues

### M9 (Medium): Regen'd Scene's Own `endTime` and `deltaSec` Not Explicitly Updated

**Location:** §6.4, regen flow step 3

The regen flow correctly describes shifting downstream scenes' `startTime`/`endTime` by a delta, but doesn't specify two critical preceding steps:

1. **Define `deltaSec`:** The difference between old and new `audioActualDuration` is never formally assigned to a variable. An implementer must infer:
   ```js
   const oldDuration = scene.audioActualDuration;
   // ... regen happens, step 3e updates scene.audioActualDuration ...
   const deltaSec = scene.audioActualDuration - oldDuration;
   ```
   Without this, the "duration delta" referenced in step 3 is nebulous.

2. **Update the regen'd scene's own `endTime`:** Step 3 shifts `createScenes[j].startTime += deltaSec` for `j = i+1 ...`, but it never updates `createScenes[i].endTime`. The regen'd scene's `endTime` must become `startTime + newAudioActualDuration`. If this isn't done, the scene's own `endTime` stays at the old value, and the rehearsal preview's `findIndex(elapsed >= s.startTime && elapsed < s.endTime)` will show the wrong scene for too long (or too short) at that position.

The implicit expectation is that `endTime = startTime + audioActualDuration` is maintained as an invariant, but it's not stated anywhere and the downstream shift code only adjusts adjacent scenes — not the source scene itself.

**Impact:** If an implementer doesn't update the regen'd scene's `endTime`, the rehearsal preview will display incorrect scene boundaries at the regen point, and the scrubber's visual position will be wrong when crossing that scene.

**Recommendation:** Add between step 3e and the downstream shift loop:
```js
// Update the regen'd scene's own endTime to match new audio duration
const deltaSec = scene.audioActualDuration - oldAudioActualDuration;
scene.endTime = scene.startTime + scene.audioActualDuration;
```

---

### L7 (Low): Operator Precedence Bug in §6.7 Narration Duration Code

**Location:** §6.7, line 531

```js
scene.narrationOverlay.actualEndMs - scene.narrationOverlay.actualStartMs / 1000
```

JavaScript operator precedence makes `/` bind tighter than `-`, so this evaluates as:

```
actualEndMs - (actualStartMs / 1000)
```

But the intent is clearly:

```
(actualEndMs - actualStartMs) / 1000
```

With `actualStartMs = 0` this happens to produce the right result by accident (4500 - 0 = 4500, which numerically equals 4500ms / 1000 = 4.5s only if the reader assumes the value is already in seconds). But with any non-zero `actualStartMs`, the result would be wrong, and even with zero it produces a value in milliseconds, not seconds as claimed.

**Impact:** Low — this is a code sketch in a design doc, not implementation code. But implementers will copy it, and it will produce wrong results for non-zero `actualStartMs` (which §5.1 now explicitly supports).

**Recommendation:** Change to `(scene.narrationOverlay.actualEndMs - scene.narrationOverlay.actualStartMs) / 1000`.

---

### L8 (Low): `hasUnresolvedScenes` Field Never Written or Read

**Location:** §5.2, line 146

```js
hasUnresolvedScenes: false,         // gate flag for "Generate videos" button
```

This field is declared as a "gate flag" but:
- No code in the plan ever sets it to `true` or `false`
- `canGenerateVideos()` (§7.6) doesn't reference it — it recomputes gate status from per-scene `durationStatus` directly
- No UI component reads it
- No edge case mentions it

It appears to be a leftover from an earlier design iteration where the gate was computed once and cached. The current design computes the gate on-the-fly each time it's needed.

**Impact:** Low — a dead field won't cause bugs, but it adds confusion to the data model.

**Recommendation:** Remove `hasUnresolvedScenes` from §5.2 or add a note: `// deprecated — gate computed on-the-fly in canGenerateVideos()`.

---

### L9 (Low): Cascade Dialog Overclaims Drift Impact on Downstream Scenes

**Location:** §6.4, cascade impact dialog

The dialog states:

> "The 12 dialogue scenes in 5–30 with existing video clips will now have audio drifting against their video."

But downstream scenes' `audioActualDuration` and `videoActualDuration` are unchanged — only their `startTime`/`endTime` positions shift. Per the drift definition in §8.3a: `drift = (audioActualDuration - videoActualDuration) / videoActualDuration`, this means **per-scene drift does not change for downstream scenes**.

The actual cascade effect is:
- **Positional shift**: downstream scenes start 1.3s later in the master audio timeline
- **Rehearsal preview**: image-audio sync is correct because BOTH image positions and audio positions shift together
- **Per-scene duration drift**: unchanged for downstream scenes
- **Export assembly**: if the muxer positions video clips sequentially, the 1.3s shift naturally propagates without creating per-clip drift

Step 4 of the regen flow says "Recompute `durationStatus` and `durationDriftPct` on the regen'd scene AND on every adjacent scene." The recomputation on adjacent scenes would find their drift unchanged and is therefore unnecessary (though harmless).

**Impact:** Low — the dialog text may cause implementers to build drift-warning UI on scenes that don't actually have drift. More importantly, it may confuse users into thinking they need to fix drift on scenes that are fine.

**Recommendation:** Reframe the cascade dialog to accurately describe what happens:
```
This will:
 • Shift scenes 5–30 timing by +1.3s in the master audio
 • Subtitles for scenes 5–30 will re-align to new timing
 • Scene 4's own audio-video drift has changed — review in rehearsal
```
And change step 4 to: "Recompute `durationStatus` and `durationDriftPct` on the regen'd scene (adjacent scenes' drift is unchanged — recomputation is optional but harmless)."

---

### L10 (Low): `scene.manualDuration` Not in §5.1 Data Model

**Location:** §6.7 vs §5.1

§6.7 references `scene.manualDuration` in the stepper precedence code (line 530) and in the precedence table (line 537). But §5.1's data model doesn't include `manualDuration` as a field on `createScenes[i]`.

The field is functionally necessary (storing the user's stepper value independently from `audioActualDuration` so it can be restored when narrator audio is removed), but it's not formally defined with type, default, or description.

**Impact:** Low — implementers will add it naturally, but the schema is incomplete without it.

**Recommendation:** Add to §5.1:
```js
manualDuration: null,  // seconds; user-set stepper value for b-roll scenes
                       // null for dialogue scenes
                       // When narrationOverlay exists, audioActualDuration uses
                       // narrationOverlay duration instead; manualDuration is preserved
                       // for fallback when narration is removed.
```

---

### L11 (Low): §7.6 Lock Step 3 Says "for Dialogue Scenes" — B-Roll Ambiguity

**Location:** §7.6, "Click 'Generate videos'" step 3

> "Lock per-scene `scene.duration = scene.audioActualDuration` for dialogue scenes"

The "for dialogue scenes" qualifier implies b-roll scenes are handled differently at lock time. But:

- Pre-lock, §7.6 says `duration` is "mirrored from `audioActualDuration` continuously" for ALL scenes
- B-roll scenes have `audioActualDuration = manualDuration` per §6.7
- Kling video generation needs a duration for every scene, including b-roll

If the lock step explicitly sets `scene.duration = scene.audioActualDuration` only for dialogue scenes, b-roll scenes' `duration` would remain at whatever it was pre-lock (already mirrored from `audioActualDuration`). So functionally, the outcome is the same — b-roll scenes' `duration` already equals their `audioActualDuration`. But the phrasing creates ambiguity: is the lock step merely confirming what's already true, or is it actively setting something that wasn't set before?

**Impact:** Low — functionally no difference. But the "for dialogue scenes" qualifier suggests there's a different path for b-roll, which could confuse implementers.

**Recommendation:** Change step 3 to: "Lock per-scene `scene.duration = scene.audioActualDuration` for ALL scenes (b-roll scenes' `duration` already equals `manualDuration` via the continuous mirror, but this step formalizes the freeze)."

---

## Full Cross-Reference Verification

| Check | Result |
|---|---|
| §5.1 data model ↔ §6.4 regen flow | ✅ Consistent (except `endTime` update gap in M9 and `manualDuration` in L10) |
| §5.1 data model ↔ §6.7 b-roll/narrator | ⚠ `manualDuration` missing from §5.1 (L10); operator precedence bug (L7) |
| §5.2 project state ↔ §7.6 gate | ✅ `totalVideoDurationMs` removed; `hasUnresolvedScenes` dead (L8) |
| §5.2 state machine ↔ §6.4 regen revert | ✅ Consistent |
| §8.3a truth table ↔ §7.7 status badges | ✅ Consistent |
| §8.4a degraded mode ↔ EC-TS-02 | ✅ Consistent — both say any non-zero drift blocks |
| §8.7 batching ↔ §12 Phase 2 | ✅ Consistent — refactor scope documented |
| §8.7a splitter ↔ §8.7b precision table | ✅ Consistent |
| §4 primitives ↔ existing code (js/17b, js/17c) | ✅ Consistent — `_createSpeakerTurns`, `castGenerateLineTTS`, `castGenerateMultiVoiceAudio` all referenced correctly |
| §9 editor ↔ §6.4 regen deep-link | ✅ Consistent — editor → image-gen card ↩ pattern |
| §14 theming ↔ §14.4 forbidden patterns | ✅ Consistent — `#0a0a0a` and `rgba(0,0,0,0.6)` on preview area documented as explicit exceptions |
| §15 telemetry ↔ §5.2 state machine | ✅ Consistent — `audioRehearsalCompleted` is derived, `audioRehearsalRevertCount` tracks state flips |
| Decision log (§17) ↔ spec body | ✅ Consistent — all 30+ decisions match their corresponding spec sections |
| Acceptance criteria (§18) ↔ spec body | ✅ Consistent — all 50+ criteria trace to specific spec sections |
| Voice plan §8.3 ↔ §8.7 reconciliation | ✅ Documented; voice plan update deferred to implementation |

---

## Summary

| ID | Severity | Section | Issue |
|---|---|---|---|
| M9 | Medium | §6.4 | Regen'd scene's own `endTime` not updated; `deltaSec` not formally defined |
| L7 | Low | §6.7:531 | Operator precedence bug: `actualEndMs - actualStartMs / 1000` should be `(actualEndMs - actualStartMs) / 1000` |
| L8 | Low | §5.2:146 | `hasUnresolvedScenes` declared but never written or read — dead field |
| L9 | Low | §6.4 | Cascade dialog overclaims per-scene drift on downstream scenes; step 4 recomputes drift on scenes that haven't changed |
| L10 | Low | §6.7 vs §5.1 | `scene.manualDuration` referenced in §6.7 but missing from §5.1 data model |
| L11 | Low | §7.6:723 | Lock step "for dialogue scenes" is ambiguous — b-roll scenes need same treatment or explicit rationale for exclusion |

**Cumulative across all 3 audit passes:**
- Issues found: 22
- Resolved: 16
- Invalid: 1
- Open (this pass): 6 (1 medium, 5 low)
- Blocking issues: **0**

The plan is internally consistent and implementation-ready. The one medium-severity item (M9 — missing `endTime` update in regen flow) is a straightforward gap that an implementer would naturally fill, but making it explicit prevents a common category of timing bugs in the rehearsal preview.
