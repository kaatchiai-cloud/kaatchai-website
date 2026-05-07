# Audio Rehearsal Plan — Critical Review of Logical Consistency

Status: review findings, 16 issues identified across 3 severity tiers.
Scope: cross-references the audio-rehearsal-plan, voice-and-lipsync-plan, and consistency-plan documents. Focuses exclusively on logical consistency — contradictions, undefined references, under-specified behaviors, and data-model gaps.

---

## High Severity — Blocks Correct Implementation

### H1. Missing §8.7 — Undefined Tone-Aware Break Rule

**Location:** §4 of audio-rehearsal-plan.md

The plan states: *"v1 ships with per-character batching with tone-aware break rule (see §8.7 below) — supersedes voice-plan §8.3"*. Section 8 of the audio-rehearsal-plan has subsections 8.1–8.6 only; there is no §8.7.

The "tone-aware break rule" governs how per-character batching handles inter-line pauses and mood changes within a character's batch. This is the core mechanism that replaces per-line TTS batching. Without it, there is no specification for:

- How long the pause is between two lines from the same character in different moods
- How the batch concatenates lines with different `MOOD_PROFILES` (e.g., Maya speaking calmly in scene 2, then angrily in scene 7)
- Whether the break rule affects `speakerTurns` boundary placement
- How the initial batch call produces per-line sub-buffers (see H2)

**Impact:** The implementation cannot proceed on Phase 2 (mood enum + voice override application) or Phase 1 (data model) without knowing whether per-character batching produces one monolithic `AudioBuffer` or individual per-line buffers. The entire regen mechanism (§6.4) depends on per-line replaceability.

**Recommendation:** Add a §8.7 that specifies: (a) that per-character batching is actually sequential per-line calls with inter-line silence insertion, (b) the silence duration between lines (200ms consistent with voice-plan §8.4 cut-beat, or different for mood transitions), and (c) how the batched result is split back into per-line AudioBuffers stored in IDB.

---

### H2. Per-Line Regen vs Per-Character Batching — Two Code Paths, No Splice Specification

**Location:** §4 and §6.4 of audio-rehearsal-plan.md, §8.3 of voice-and-lipsync-plan.md

The voice plan §8.3 states: *"Per-line wins for v1."* The audio-rehearsal plan §4 supersedes this with per-character batching. But §6.4 (regen flow) calls `castGenerateLineTTS` — a **per-line** helper.

This creates two fundamentally different code paths:

| Path | When | What |
|---|---|---|
| Per-character batch | Initial generation | All of Maya's lines generated in one batch |
| Per-line | Regen | Single line regenerated |

The plan assumes per-line `AudioBuffer` sub-buffers exist (§5.5 IDB keys: `audio_line_<sceneId>_<turnIdx>`), but never specifies how the initial per-character batch produces these per-line sub-buffers. If the initial generation makes one continuous TTS call for all of Maya's lines, there is no natural boundary to split at — the batch result is a single `AudioBuffer`.

**Impact:** The regen flow in §6.4 step 2d says "Old per-line buffer in master combined buffer is REPLACED with new buffer." But if per-character batching doesn't produce per-line buffers, there's nothing to replace.

**Recommendation:** Either (a) specify that "per-character batching" means sequential per-line calls grouped by character (with batch-optimized caching), where each call still produces a separate `AudioBuffer`, or (b) define a splice mechanism that can extract and replace a time range from the master combined buffer when the initial generation produces monolithic per-character buffers.

---

### H3. Singular `dialogue` Model Can't Represent Multi-Audio Scenes

**Location:** §5.1, §6.1, §6.7 of audio-rehearsal-plan.md, §5.4 of voice-and-lipsync-plan.md

§5.1 defines `dialogue` as a singular object with one `voiceOverride`:

```js
dialogue: {
  speakerCharacterId, speakerName, text, isVoiceOver,
  voiceOverride: { mood, voiceId, voiceProvider, ... }
}
```

But §6.7 acknowledges scenes with multiple audio sources:
- "B-roll with narrator over it" — a scene has both b-roll visuals and narrator audio
- The voice plan §5.5 shows `scene.speakerTurns[]` as an array with multiple entries per scene
- §6.1's card mockup shows `🎙️ Maya · Aoede (Gemini)` as a single speaker

A scene with Maya speaking AND narrator voice-over needs two mood selectors, two regen buttons, and two `voiceOverride` objects. The singular `dialogue` model doesn't support this.

The cut-on-speaker rule from the voice plan means most dialogue scenes are split into single-speaker segments, but §6.7's "b-roll with narrator over it" case violates that rule by design — the narrator audio overlays the b-roll without splitting the scene.

**Impact:** UI cannot render per-turn controls for multi-audio scenes. Regen for "the narrator's line in scene 5" is ambiguous when scene 5 also has character dialogue or is a b-roll with narrator overlay.

**Recommendation:** Change `dialogue` from a single object to `dialogue: [...]` (array of turn objects), each with its own `voiceOverride`, or define a separate `narration` field for overlay audio. Update the card mockup to show multiple audio sections when multiple turns exist.

---

### H4. `scene.duration` Semantic Overloading Across Pipeline Stages

**Location:** §5.1, §7.6, §8 of audio-rehearsal-plan.md

`scene.duration` is used with different semantics at different pipeline stages:

| Stage | `scene.duration` meaning |
|---|---|
| Pre-lock (rehearsal) | Set to `audioActualDuration` per §7.6 |
| Post-video-gen | Overwritten with Kling output video duration |
| Drift calculation | Compared against `audioActualDuration` |

After video generation, `scene.duration` holds the video duration. When the user returns to image-gen and regenerates audio, the newly computed `audioActualDuration` differs from `scene.duration` (the video duration). This creates drift.

But what if the user then re-enters rehearsal and locks audio again? Per §7.6 step 3: `scene.duration = scene.audioActualDuration` — this **overwrites the video duration**, losing the reference point needed for drift calculation.

**Impact:** After a re-lock, drift cannot be computed because the video duration has been overwritten by the new audio duration. The `durationStatus` field becomes meaningless.

**Recommendation:** Add an explicit `videoActualDuration` field to the data model. Drift calculation becomes `(audioActualDuration - videoActualDuration) / videoActualDuration`. `scene.duration` then represents "locked target duration" (the value sent to Kling for generation), which equals `audioActualDuration` at lock time but is distinct from `videoActualDuration` (Kling's output).

---

### H5. Post-Video Regeneration Workflow and State Transitions Undefined

**Location:** §7, §8, §9 of audio-rehearsal-plan.md

After video generation, the user can go back to image-gen, regenerate audio for a scene, and return to rehearsal. The plan mentions this scenario (§8.1) and defines drift badges (§8.3), but doesn't specify:

1. **What happens to already-generated video clips?** They remain in IDB/R2 but are now mismatched with the new audio duration. Does the editor preview play the old video + stretched audio?

2. **What happens in the editor?** If the user was in the editor after video gen and goes back to image-gen for audio changes, the editor timeline and clips are now stale.

3. **How does `durationStatus` transition?** Post-video scenes start as `matched`. After audio regen, they shift to `stretched`/`compressed`/`exceeds`. But the plan doesn't describe the UI flow for this transition — does the system automatically recompute drift, or require the user to re-enter rehearsal?

4. **What happens to the `audioRehearsal.status`?** It was `locked` after step 7. Does it go back to `reviewed`? How does the user re-lock after fixing drift?

5. **EC-ED-04** mentions "Navigate to create-page image-gen step; flash highlight. User loses editor undo stack — surface confirm." But doesn't address what happens to video clips, timeline composition, or export state.

**Impact:** The entire post-video regen loop — which is the primary value proposition of the rehearsal gate — has no defined state machine. Users could get stuck in ambiguous states where audio is re-locked but video doesn't match, and there's no clear path forward.

**Recommendation:** Define a state machine for `audioRehearsal.status`:
```
pending → reviewed → locked → (video gen) → (audio regen triggers) → unlocked → reviewed → locked
```
And specify what happens to each downstream artifact (IDB videos, editor timeline, export state) at each transition.

---

## Medium Severity — Causes Incorrect Behavior or UX Gaps

### M1. `audioActualDuration` vs `dialogueLength` — Duplicate or Distinct?

**Location:** §5.1 of audio-rehearsal-plan.md, §8.4 of voice-and-lipsync-plan.md

The voice plan computes `scene.dialogueLength = cursorMs` (in milliseconds). The audio rehearsal plan defines `scene.audioActualDuration` (in seconds, e.g., `3.234`). Both represent the duration of the scene's assembled audio.

Issues:
- **Units differ**: `dialogueLength` is ms, `audioActualDuration` is seconds
- **Neither plan acknowledges the other's field**
- **For b-roll scenes**: `dialogueLength` isn't defined (no dialogue), while `audioActualDuration` is explicitly set to a stepper value
- **Drift calculation** in §7.6 uses `scene.audioActualDuration`, but the existing assembly code writes `scene.dialogueLength`

**Recommendation:** If `audioActualDuration` replaces `dialogueLength`, update the voice plan and define the conversion. If they coexist, specify when each is canonical. Choose one unit convention (seconds with decimals is more precise and human-readable; ms is the Web Audio API convention).

---

### M2. Pre-Video Drift Status Is Always "Matched" — Vacuous First-Pass UI

**Location:** §7.6, §7.7 of audio-rehearsal-plan.md

§7.6 states: *"Pre-video-gen, video duration doesn't exist yet — scene.duration is set to audioActualDuration directly when audio is locked, so per-scene match is automatic at this stage."*

This means at rehearsal time (pre-video), every scene shows `✓ matched` by definition. The per-scene status panel (§7.2) — showing matched/stretched/compressed/exceeds — provides no information on first pass. The "Generate videos" gate is always satisfied because `matched` is the only possible state.

The stated purpose of the rehearsal step is for the user to *"preview your project before generating videos"* with drift assessment (§7.1 goal 3). But drift assessment is vacuous before video exists.

**Recommendation:** Acknowledge this explicitly. Simplify first-pass rehearsal to show audio-completion status (✓ ready / ⏳ generating / ❌ failed) instead of drift status. Reserve drift badges for post-video re-rehearsal. The "Generate videos" gate at first pass should simply check that all audio is generated and no scenes have errors, not pretend it's assessing drift.

---

### M3. Soundtouch Fallback Drops Threshold from 3% to 0.5% — Degraded Mode Undocumented in Main Body

**Location:** §8.2, EC-TS-02 of audio-rehearsal-plan.md

§8.2 defines a ±3% tolerance. EC-TS-02 says: *"Fall back to no stretch; treat any drift > 0.5% as ⛔ exceeds; force regen path."*

Without soundtouch-js (CDN failure, offline mode, corporate firewall), the effective threshold drops from 3% to 0.5% — a 6× tightening. A project that was perfectly fine at 2.5% drift suddenly becomes entirely blocked from video generation because soundtouch failed to load.

This degraded-mode behavior is buried in an edge case table and not mentioned in the main §8 specification.

Additionally, the 0.5% threshold is inconsistent with §8.3 which says the badge is "always-visible" from `> 0.5%`. Without soundtouch, that same 0.5% becomes a hard block instead of a soft indicator.

**Recommendation:** Surface the degraded-mode behavior in §8 main body, not just EC-TS-02. Add a UI indication when soundtouch is unavailable: "Audio time-stretch library unavailable — stricter drift tolerance active (0.5% instead of 3%)." Document the two-tier threshold explicitly.

---

### M4. B-Roll Duration Stepper vs Narrator Audio Duration — Precedence Undefined

**Location:** §6.7 of audio-rehearsal-plan.md

§6.7 defines:

| Case | `audioActualDuration` source |
|---|---|
| Pure b-roll (no dialogue, no narrator) | Manual stepper value |
| B-roll with narrator over it | Narrator TTS actual duration |

Unresolved questions:
- If the user has a b-roll scene with a manual duration of 5s and then narrator audio is generated at 7s, does the narrator override the manual value?
- Can the user still adjust the stepper after narrator audio exists?
- If narrator sets duration to 7s and the user changes the stepper back to 5s, which wins?
- What if the user removes narrator audio — does the duration revert to the last manual stepper value?

**Recommendation:** Define explicit precedence rules. Suggested: (a) When narrator audio exists, narrator duration overrides the stepper; stepper is disabled with a tooltip "Duration set by narrator audio." (b) When narrator audio is removed, stepper reverts to last manual value. (c) Store both `manualDuration` and `narratorDuration` so the system can fall back correctly.

---

### M5. Cascade Effects of Audio Regen on Subsequent Scenes Under-Specified

**Location:** §6.4 of audio-rehearsal-plan.md

§6.4 describes the regen flow and includes:
```js
for (let j = i+1; j < createScenes.length; j++) {
  createScenes[j].startTime += deltaSec;
  createScenes[j].endTime += deltaSec;
}
```

When regenerating scene 4's audio (e.g., 3.2s → 4.5s), every scene 5–30 shifts by +1.3s. This affects:

1. **Master combined audio buffer** — needs full reconstruction
2. **All `startTime`/`endTime`** fields for scenes 5–30
3. **`speakerTurns` boundaries** in the global window object
4. **Subtitle timestamps** for all subsequent scenes
5. **Rehearsal preview** — must be re-loaded
6. **Per-image card mini-players** for ALL subsequent scenes (different time ranges off the master buffer)
7. **Already-generated video clips** — their durations DON'T shift, creating new drift for every scene after the regen'd one

Risk #4 in §16 mentions this briefly, but the main flow description (§6.4) treats it as a simple loop. The plan doesn't specify:

- Whether the user is warned about cascade effects before confirming a regen
- Whether the rehearsal preview automatically invalidates after any audio regen
- What happens to video durations of already-generated scenes (they DON'T shift)
- Whether `audioStale` is set on all downstream scenes or only on the regen'd scene

**Recommendation:** Add cascade-warning UI: "Regenerating this line will shift 26 subsequent scenes by +1.3s. This may affect audio-video sync for scenes with existing video. Continue?" Also define whether downstream scenes need drift recomputation post-regen.

---

### M6. `muted` Field Missing from Data Model

**Location:** §5.1 vs §9.2 vs EC-ED-03

EC-ED-03 defines behavior: *"dialogue.muted = true; line skipped at export tick; subtitles for that line hidden."* §9.2 includes "🔇 Mute this line" in the editor context menu for v1.

But the §5.1 data model shows `dialogue` without a `muted` field:
```js
dialogue: {
  speakerCharacterId, speakerName, text, isVoiceOver,
  voiceOverride: { ... }
}
```

**Recommendation:** Add `muted: false` to the `dialogue` data model in §5.1, with description: *"true when user has muted this line; line is skipped at export and subtitles are hidden."*

---

### M7. `performance.tone` Field Undefined — No Mapping to Mood Enum

**Location:** §6.3, §5.4 of audio-rehearsal-plan.md, §5.4 of voice-and-lipsync-plan.md

§6.3 states: *"Mood dropdown — fixed enum from §5.4. Pre-filled from storyboard agent's `performance.tone`."*

But:
- Neither the voice plan nor the consistency plan defines a `performance.tone` field schema
- The voice plan §5.4 shows `performance: {...}` but doesn't enumerate sub-fields
- With 12 moods and no defined mapping from arbitrary text (e.g., "dramatic intensity") to the mood enum, the pre-fill logic is undefined

**Recommendation:** Define the `performance.tone` field schema and provide an explicit mapping function from agent-generated tone text to `MOOD_ENUM` entries. Options: (a) The storyboard agent is constrained to emit one of the 12 mood IDs directly, (b) a mapping table converts common agent tone strings to mood IDs, or (c) a fallback to "matter-of-fact" when no mapping exists.

---

## Low Severity — Clarity and Consistency Improvements

### L1. Crossfade Duration Breaks for Very Short Scenes — No Minimum Defined

**Location:** §7.4, EC-RH-08

§7.4 specifies a 200ms crossfade. EC-RH-08 says crossfades are clamped to 50% of the shortest adjacent scene.

For a 150ms scene with 200ms crossfade, the crossfade would be clamped to 75ms, meaning the scene displays for only 100ms of stable image with 75ms transitions on each side — approximately 3 frames. This is essentially invisible.

The voice plan §8.4 uses 200ms cut-beats between speakers, making scenes shorter than 400ms theoretically possible.

**Recommendation:** Define a minimum `audioActualDuration` for scenes (e.g., 1.0s) and warn the user if a scene would be too short for meaningful crossfade. Alternatively, reduce crossfade to 0ms (hard cut) for scenes shorter than 500ms.

---

### L2. Dependency Claim Contradicts Sibling Plan Status

**Location:** §1 of audio-rehearsal-plan.md

§1 states: *"Depends on the multi-voice pipeline (Phase 5) being live, which it is."*

But the voice plan's status line reads: *"Status: design draft, locked decisions, not yet implemented."*

If Phase 5 isn't actually implemented, the audio rehearsal plan's references to existing primitives (`castGenerateMultiVoiceAudio`, `window._createSpeakerTurns`, `castGenerateLineTTS`) don't exist yet, and the implementation order in §12 assumes they do.

**Recommendation:** Align the status line with reality. If Phase 5 is not yet implemented, change the dependency note to "Depends on the multi-voice pipeline (Phase 5), which must be implemented first." Update the implementation order in §12 to include Phase 5 as an explicit prerequisite.

---

### L3. Drift Sign Convention vs Status Enum — Missing Explicit Mapping

**Location:** §5.1, §7.7, §8.4

§5.1 defines `durationDriftPct` as `(audio - video) / video` — signed. Positive = audio longer, negative = audio shorter.

§7.7 defines status badges: `✓ matched`, `⚠ stretched X%`, `⚠ compressed X%`, `⛔ exceeds X%`.

§8.4 describes:
- "Stretch" = audio shorter than video (negative drift)
- "Compress" = audio longer than video (positive drift)

But the mapping from drift percentage to status enum is never written as code or a truth table. An implementer could easily invert "stretched" and "compressed" or misplace the boundary between `matched` and `stretched`.

**Recommendation:** Add an explicit mapping table:
```js
if (Math.abs(driftPct) <= 0.005) → 'matched'
else if (driftPct < -0.005 && driftPct >= -0.03) → 'stretched'  // audio shorter
else if (driftPct > 0.005 && driftPct <= 0.03) → 'compressed'     // audio longer
else → 'exceeds'
```
Also clarify: the `⚠ stretched 2.1%` badge in §7.7 and §8.3 shows `stretched` when audio has been stretched (made longer) to fit video, which happens when `audioActualDuration < videoActualDuration`. The English "stretched" matches the operation, not the drift direction. This naming is confusing and should be documented explicitly.

---

### L4. Global `window._createSpeakerTurns` vs Per-Scene `scene.speakerTurns[]` — Canonical Source Ambiguous

**Location:** §4 vs §6.4 vs §7.4 of audio-rehearsal-plan.md, §5.5 of voice-and-lipsync-plan.md

§4 lists `window._createSpeakerTurns` as a pre-existing primitive — a global array. The voice plan §5.5 defines `scene.speakerTurns[]` as per-scene arrays.

§6.4 step 2h says regen rebuilds `window._createSpeakerTurns`, and §7.4 uses `window._createMasterAudio` + `startMs`/`endMs` from `createScenes` for playback.

The relationship between the global array and per-scene arrays is never clarified. Are they redundant? Is the global array built by concatenating per-scene arrays? After regen (§6.4), does each scene's local `speakerTurns` also get rebuilt, or only the global one?

**Recommendation:** Specify that `window._createSpeakerTurns` is the canonical source and is rebuilt by concatenating all `scene.speakerTurns[]` arrays in scene order. Per-scene arrays are derived from the global array by filtering on `segmentIndex`. After regen, both are updated synchronously.

---

## Summary Matrix

| ID | Severity | Section | Issue |
|---|---|---|---|
| H1 | High | §4, §8 | Missing §8.7 — tone-aware break rule undefined |
| H2 | High | §4, §6.4 | Per-character batching vs per-line regen — no splice spec |
| H3 | High | §5.1, §6.7 | Singular `dialogue` can't represent multi-audio scenes |
| H4 | High | §5.1, §7.6, §8 | `scene.duration` semantic overloading across stages |
| H5 | High | §7, §8, §9 | Post-video regen workflow and state machine undefined |
| M1 | Medium | §5.1, voice §8.4 | `audioActualDuration` vs `dialogueLength` — duplicate field |
| M2 | Medium | §7.6, §7.7 | Pre-video drift status always "matched" — vacuous UI |
| M3 | Medium | §8.2, EC-TS-02 | Soundtouch fallback drops threshold from 3% to 0.5% |
| M4 | Medium | §6.7 | B-roll stepper vs narrator duration — precedence undefined |
| M5 | Medium | §6.4 | Audio regen cascade effects under-specified |
| M6 | Medium | §5.1, EC-ED-03 | `muted` field missing from data model |
| M7 | Medium | §6.3, §5.4 | `performance.tone` undefined — no mood enum mapping |
| L1 | Low | §7.4, EC-RH-08 | No minimum scene duration — crossfades break on short scenes |
| L2 | Low | §1 | Dependency claim contradicts sibling plan status |
| L3 | Low | §5.1, §8.4 | Drift sign convention ↔ status enum needs explicit mapping |
| L4 | Low | §4, §6.4, §7.4 | Global vs per-scene `speakerTurns` canonical source ambiguous |

**High: 5 issues · Medium: 7 issues · Low: 4 issues · Total: 16 issues**