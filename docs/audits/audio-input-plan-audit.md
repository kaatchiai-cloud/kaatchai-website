# Audit: Audio Input Plan

Auditor: Kilo | Date: 2026-05-05 | Status: design draft review
Scope: logical consistency, implementation feasibility, cross-plan coherence for audio-input-plan.md

---

## A. Logical Inconsistencies

### A1. `audioSegmentStart/End` uses seconds; all downstream consumers use milliseconds

§6.2 defines `audioSegmentStart: 0.5` and `audioSegmentEnd: 3.7` — these are seconds, matching Scribe's output format. But every downstream consumer uses milliseconds:
- audio-rehearsal-plan §5.1: `actualStartMs` / `actualEndMs`
- Existing `castGenerateMultiVoiceAudio` code (js/17b line 3192-3208): `startMs` / `endMs`
- voice-and-lipsync-plan §5.5: `startMs` / `endMs`

Any code that reads `dialogueLine` time fields will get different units depending on whether the project was text-input or audio-input. This is a silent, high-severity bug — durations will be off by 1000x.

**Fix:** Multiply Scribe's `word.start` and `word.end` by 1000 in `processOriginalAudio` (§9.1) before writing to `audioSegmentStart/End`. Rename fields to `audioSegmentStartMs` / `audioSegmentEndMs` to make the unit explicit. Document this conversion as a hard requirement.

### A2. `parsed` schema differs from text-input `parsed` schema despite "same pipeline" claim

The plan claims (§1.3): "same downstream pipeline regardless of input type." But the actual schemas differ:

| Field | Text input `dialogueLines[]` | Audio input `dialogueLines[]` |
|---|---|---|
| `isExtraSpeaker` | Present | **Missing** |
| `sourceLineNum` | Present | **Missing** |
| `sourceMode` | **Missing** | Present |
| `audioSegmentStart/End` | **Missing** | Present (Mode A) |
| `moodConfidence` | Always a number | "mode A: n/a" (undefined value) |

A downstream consumer iterating `dialogueLines` will hit `undefined` for different fields depending on input type. The "same pipeline" claim is architecturally aspirational, not factual.

**Fix:** Define a unified supertype that merges all fields from both input paths. Text input sets `audioSegmentStartMs: null`, `audioSegmentEndMs: null`, `sourceMode: 'text-input'`. Audio input sets `sourceLineNum: null`, `isExtraSpeaker` derived from the speaker map. `moodConfidence` must always be a number: use `1.0` for user-mapped Mode A (user confirmed the mapping), and whatever tone detection returns for Mode B.

### A3. Mode A schema example shows populated mood despite claiming mood is Mode-B-only

§6.2 code example shows `mood: 'angry'` for a Mode-A dialogue line, but the comment says "populated only in mode B." §4.1 says "Mood/voice override is disabled in this mode." If mood is disabled for Mode A, the example should not show a populated value.

**Fix:** Change the example to `mood: 'matter-of-fact'` (safe default). Add `moodConfidence: null` for Mode A (semantically: "not inferred, default only"). Document: Mode A always uses `'matter-of-fact'` for mood; this value may feed image-gen prompts but does not affect audio (which is original).

### A4. `speakerMap` and `aiSuggestedExtras` track overlapping state with no sync

§6.1 stores the mapping in two places:
- `speakerMap['speaker_2'].characterId = 'char_extra_1'`
- `aiSuggestedExtras[0].id = 'char_extra_1', sourceSpeakerId = 'speaker_2'`

If the user rejects an AI suggestion, both structures need coordinated updates. If only `aiSuggestedExtras[i].userAccepted` flips to `false` but `speakerMap['speaker_2'].characterId` still points to `char_extra_1`, the mapping is inconsistent. No sync function is specified.

**Fix:** Make `aiSuggestedExtras` the canonical source for AI-suggested character metadata. Add a `syncSpeakerMap()` function that re-derives `speakerMap` entries from `aiSuggestedExtras` after any accept/reject action. Called after every mutation to the extras list. Document the direction of data flow: extras → speakerMap (never reverse).

### A5. EC-DI-06 offers "switch to text input" but that transition is undeclared

If Scribe fails twice, the plan offers "mode switch to text input (paste transcript manually)." But:
1. `inputDoc.format` would need to change from `'audio'` to `'prose'`, which the input-formats-plan enum (`'prose' | 'screenplay'`) doesn't include `'audio'` as a value
2. `rawText` is `null` for audio input and there's no transcript to paste into
3. All audio-specific fields (`rawAudioId`, `diarizationResult`, `speakerMap`) would need clearing
4. This contradicts the "locked at submission" principle (§1, §4.3)

**Fix:** Remove this fallback. Scribe failure should offer two options: (a) retry Scribe, (b) start a new project as text input. Mid-project input-type switching violates the lock contract and creates undeclared state transitions. A "start new project as text input" deep-link is the correct UX — it pre-fills the transcript from `diarizationResult.alignedWords` into the new project's `rawText`, but as a fresh project, not a mutation of the current one.

---

## B. Missing Specifications (Gaps That Will Block Implementation)

### B1. No diarization confidence score or quality gate

Text input has a 6-stage pipeline with confidence scoring (input-formats-plan §4 Stages 4-5) that gates user review. Audio input has no equivalent. Scribe might detect 3 speakers when there are 5 (EC-DI-04), but the user sees no "diarization confidence: 42%" warning. The speaker-mapping UI assumes the diarization is correct and asks users to map speakers — but if Scribe merged two speakers into one, the mapping UI cannot represent that split.

Risks §14.1 mentions "surface diarization confidence" as a mitigation, but it is not specified as a feature or a data model field. It is a risk note that was never promoted to a design element.

**Fix:** Add a `diarizationResult.confidence` field. Suggested heuristic:
```js
diarizationResult.confidence = computeDiarizationConfidence(speakers, alignedWords);
// Factors: avg segment length (short = noisy), speaker-switch frequency,
// ratio of single-word segments to total, speaker label stability across segments
```
Surface a warning in the mapping UI when confidence < 0.7: "Speaker detection may be inaccurate. Review carefully." Add an EC entry: "diarization confidence below threshold → surface warning, optionally offer text-input fallback."

### B2. `actionLines: []` leaves storyboard agent with no visual information

§6.2 sets `actionLines: []` for audio. Text input provides action lines like "Maya storms into the kitchen" that feed image-generation prompts. Audio input provides only spoken dialogue — no visual context at all. The plan says "storyboard agent generates from transcript" but doesn't specify *how*. The existing storyboard agent (voice-and-lipsync-plan §7.2) takes text descriptions as input; it does not have an "infer visuals from dialogue" mode.

**Fix:** Add an explicit AI call at Stage 5 that infers action/setting from dialogue content. Suggested:
```
Given these dialogue lines between characters, infer:
- The setting (location, time of day, indoor/outdoor)
- Character actions and body language for each segment
- Overall atmosphere and mood

Dialogue:
Speaker 0 (Maya): "I really wish you'd follow through on things."
Speaker 1 (Joe): "I had to."
...

Return JSON: [{ segmentIndex, setting, actions, atmosphere }]
```
Cost: ~$0.01-0.03 per project. Map output to `actionLines[]` and `sceneHeadings[]`.

### B3. Mode B triggers `castGenerateMultiVoiceAudio` at Stage 5 but storyboard step will trigger it again

The existing pipeline (voice-and-lipsync-plan §8, audio-rehearsal-plan §3) is:
```
Script → Storyboard → Multi-voice TTS → Audio Rehearsal → Video
```

Audio-input Mode B runs `castGenerateMultiVoiceAudio` at **input Stage 5** (before storyboard). But the storyboard step's standard flow would then run it **again**. This doubles TTS cost and may produce different audio (different mood defaults, different text segmentation). The plan doesn't state that the storyboard step should skip TTS for Mode B projects.

**Fix:** Add an explicit contract: "When `inputDoc.audioMode === 're-tts'` AND `inputDoc.locked === true`, the storyboard step skips `castGenerateMultiVoiceAudio` and uses the audio already produced at input Stage 5." Document this in both this plan and in a note to voice-and-lipsync-plan §8. Add the guard to the implementation order Phase 8.

### B4. Sample clip blob URLs don't survive page reload

§6.1 stores `sampleClipUrl: '<blob URL of 3s sample>'` in `diarizationResult.speakers[]`. Blob URLs are revoked when the creating context is torn down (page navigate, tab close). On autosave + reload (EC-LH-03), these blob URLs are stale — the ▶ button in the mapping UI produces a broken audio element.

**Fix:** Store sample clips in IDB (`idb_speaker_sample_speaker_0`) as data URLs (base64) instead of blob URLs. Data URLs persist across navigations. Blob URLs are acceptable for in-session use only; `sampleClipUrl` should be regenerated from IDB on page load.

### B5. `processOriginalAudio` doesn't handle unmapped speakers

§9.1 iterates `alignedWords`, looks up `speakerMap[word.speaker_id]?.characterId`. If a speaker was rejected (lines → narrator), `characterId` would be `null` or `'narrator'`. But the code doesn't handle these cases — `getCharacterName(null)` would fail, and the function doesn't check for null `charId` before constructing `currentLine`.

**Fix:** Add a guard:
```js
const charId = speakerMap[word.speaker_id]?.characterId || 'narrator';
```
When charId is `'narrator'`, set `isVoiceOver: true` on the dialogue line. Also handle the case where `speakerMap[word.speaker_id]` is entirely undefined (shouldn't happen post-mapping, but defensive).

### B6. Tone detection batching strategy for > 30 lines is unspecified

§9.3 says "cap at 30 lines per call (batch)" but doesn't specify what happens when there are > 30 lines. Does it make multiple Gemini calls? Does it truncate? A 10-minute interview could easily have 80+ lines.

**Fix:** Specify the batching strategy: chunk into groups of 30 lines, make N sequential Gemini calls, total latency = N x ~10s. Add the chunking to pseudocode:
```js
const BATCH = 30;
const lineMoods = [];
for (let i = 0; i < lines.length; i += BATCH) {
  const batch = lines.slice(i, i + BATCH);
  const moods = await classifyLineMoodsFromAudio(audioBuffer, batch);
  lineMoods.push(...moods);
}
```
Adjust cost estimate: ~$0.001 per line regardless of count, but latency scales linearly past 30 lines.

---

## C. Design Concerns

### C1. Single-speaker auto-map to narrator is semantically wrong

EC-DI-01: "Single speaker only → Skip Stage 4 mapping UI; auto-map speaker_0 to narrator." But "narrator" in Stori is the voice-over entity (voice-and-lipsync-plan §4). A single-speaker podcast is a *person speaking*, not narration. Mapping to narrator sets `isVoiceOver: true` and `speakerVisible: false`, meaning no character will appear on screen while the person talks — wrong for talking-head videos.

**Fix:** For single-speaker recordings: show a simplified mapping UI with the user's cast characters as options, defaulting to the `presenter` character. Only auto-map to narrator if the user has no cast at all, and surface a note: "No cast character set — audio will play as narrator voice-over with no on-screen character."

### C2. Double-lock state space is under-specified

Two separate lock points create 4 logical states:

| `audioMode` | `inputDoc.locked` | Valid? |
|---|---|---|
| `null` | `false` | Yes (initial) |
| `'original'` or `'re-tts'` | `false` | Yes (between Stage 3 and Stage 6) |
| `null` | `true` | **No** — impossible, can't lock before mode is picked |
| `'original'` or `'re-tts'` | `true` | Yes (final) |

The impossible state (`audioMode: null, locked: true`) has no guard. A crash between Stage 3 and Stage 6, followed by buggy resume logic, could produce it.

**Fix:** Add an invariant: `if (inputDoc.locked) assert(inputDoc.audioMode !== null)`. In the resume logic (EC-LH-03), if `audioMode === null`, always resume at Stage 3 regardless of other persisted state. Never jump to Stage 5 or 6 without a confirmed mode.

### C3. 5-extras cap enforcement is specified only in the audio plan

The extras flow (§7) claims persistence "across ALL input formats (text + audio)." But it is specified entirely in the audio plan. The input-formats-plan doesn't reference the 5-cap, the extras UI, or the "rejected → narrator" rule anywhere in its data model, edge cases, or implementation phases. EC-RG-02 mentions "Triggers AI-suggest-extras flow" but doesn't mention the cap or the rejection behavior.

**Fix:** Either extract the AI-suggested-extras spec into a shared document (e.g., `ai-suggested-extras-plan.md`) referenced by both, or duplicate the essential contract (cap, voice picker, rejection rule, UI pattern) in the input-formats-plan with a "canonical source: audio-input-plan §7" pointer.

### C4. Phase 2 risk ("Flip diarize flag") is underestimated as "low"

The actual change to `alignWordsWithScribe` (verified in codebase at js/17a line 301-331) is significant:

1. The function currently hardcodes `diarize: 'false'` (line 311)
2. The output mapper strips all fields except `{ word, start, end }` (line 326) — `speaker_id` is dropped
3. The function is called from 3 files (17a, 17c, 20-reels-creator) — all consumers need the new field or need backward compatibility
4. Adding `speaker_id` changes the shape of the returned array, which could break typed or validated consumers

**Fix:** Phase 2 risk should be **medium**. Add `diarize` as an explicit parameter defaulting to false:
```js
async function alignWordsWithScribe(audioBuffer, langCode, { diarize = false } = {})
```
Only include `speaker_id` in word objects when `diarize: true`. This preserves backward compatibility for existing callers that don't pass the option.

### C5. Stereo downmix for Scribe may destroy Mode A playback fidelity

EC-AU-04 says "Downmix to mono before Scribe." But `rawAudioId` stores the audio buffer that Mode A plays back. If the stored buffer is the downmixed mono version, a stereo recording loses its spatial separation in the final video. If the stored buffer is the original stereo, then slicing logic must reference the correct buffer for Scribe vs playback.

**Fix:** Store the original (possibly stereo) buffer in `rawAudioId`. Create a temporary mono buffer for Scribe at Stage 2, discard it after diarization. Mode A slicing and playback always use the original buffer. Explicitly document: "Scribe receives a temporary mono downmix; the persisted master is the original upload."

### C6. Missing edge cases

§12 claims "35+ numbered cases." Actual count: EC-AU (7) + EC-DI (8) + EC-MS (3) + EC-SM (7) + EC-OA (4) + EC-RT (5) + EC-LH (3) = 37. The count is accurate, but several high-impact edge cases are missing:

- **No edge case for overlapping speaker segments.** Scribe might return two speakers assigned the same time range (simultaneous speech). The current `processOriginalAudio` logic (§9.1) would silently drop one speaker or produce garbled entries.
- **No edge case for tab close / page navigation during diarization.** A user uploads audio, Scribe starts processing (5-30s), user closes the tab. On reload, what stage do they resume at? EC-LH-03 covers autosave "during" diarization but doesn't specify the resume point.
- **No edge case for suspended AudioContext.** Browsers require a user gesture to resume a suspended AudioContext. Any audio playback (sample clips, mini-players) will silently fail without one. The plan relies on audio playback in Stages 3, 4, 5, and 8.
- **No edge case for ElevenLabs key not set.** The existing `alignWordsWithScribe` (js/17a line 302-303) returns `null` if the ElevenLabs key is not configured: `if (!key) return null`. The entire audio-input pipeline depends on Scribe working. If the user hasn't set their ElevenLabs key, Scribe returns null and the pipeline stalls with no alternative.

**Fix:** Add these edge cases:
- EC-DI-09: Overlapping speaker segments → merge overlapping words into a single multi-speaker segment, surface warning
- EC-AU-08: Tab close during Scribe processing → persist upload + partial state; on reload, re-trigger Scribe (results are deterministic)
- EC-AU-09: AudioContext suspended → add resume-on-gesture wrapper to all play buttons; surface "Click to enable audio" if context is suspended
- EC-AU-10: No ElevenLabs key → block audio upload at Stage 1 with "Audio input requires an ElevenLabs API key. Set your key in Voice Settings." (Do not let the user upload then fail at Stage 2.)

### C7. Missing telemetry fields

EC-DI-06 offers a fallback to text input. EC-LH-02 offers copying transcript from `alignedWords`. Neither is tracked in telemetry. If these fallbacks fire frequently, the design needs adjustment, but without telemetry there's no signal.

**Fix:** Add to telemetry schema (§13):
```js
audioToTextFallbackOffered: bool,
audioToTextFallbackAccepted: bool,
transcriptCopiedToClipboard: int,
diarizationConfidence: <float>,
```

### C8. Tone detection prompt is fragile

§9.3 uses a prompt asking Gemini to "Choose ONE from: [list]" and "Respond with the single tone word." Gemini is prone to adding conversational preamble ("The tone of this clip is angry") rather than returning a bare word. Without structured-output mode, parsing may fail on every call.

**Fix:** Use Gemini's structured-output mode with `responseMimeType: 'application/json'` and a schema like `{ tone: string, confidence: number }`. Or batch all lines into a single call with JSON array output (consistent with input-formats-plan's approach for mood classification at §8.1). Batching also reduces per-line latency from ~10s total to ~10s for a 30-line batch.

---

## Summary

| Category | Count | Severity |
|---|---|---|
| Logical inconsistencies | 5 | A1 (high), A2 (high), A3 (low), A4 (medium), A5 (medium) |
| Missing specifications | 6 | B1 (medium), B2 (high), B3 (high), B4 (medium), B5 (medium), B6 (low) |
| Design concerns | 8 | C1 (medium), C2 (low), C3 (medium), C4 (medium), C5 (low), C6 (high), C7 (low), C8 (medium) |

**Must-fix before implementation:** A1 (units mismatch — will cause x1000 bug), A2 (schema divergence breaks downstream), B2 (no action lines = inferior storyboards), B3 (double TTS run in Mode B), C6 (missing edge cases including ElevenLabs key gate). Estimated additional spec work: ~3 days.