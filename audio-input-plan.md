# Audio Input Plan — Diarization + Speaker Mapping + Two-Mode Branch

Status: design draft, locked decisions, not yet implemented.
Scope: how Stori ingests user-uploaded audio (recordings, podcasts, interviews), diarizes it via Scribe, maps detected speakers to cast characters, and routes to either original-audio playback or re-TTS-as-script-reference.

Sibling to [input-formats-plan.md](input-formats-plan.md), [audio-rehearsal-plan.md](audio-rehearsal-plan.md), and [voice-and-lipsync-plan.md](voice-and-lipsync-plan.md). Audio input is a parallel ingestion path to text input — both produce the same canonical structured data (`dialogue` per scene with `speakerCharacterId`, `text`, etc.) that downstream pipelines (storyboard agent, multi-voice TTS, audio rehearsal) consume identically.

---

## 1. Goal

Three user-visible outcomes:

1. **Filmmakers can upload a recorded conversation as project input.** Podcasts, interviews, voice memos, scratch performances. Stori auto-diarizes and asks the user to map detected speakers to cast characters.
2. **Two upload modes — original audio OR re-TTS-as-script-reference.** Original mode keeps the user's actual voices in the final video (podcast / documentary use case). Re-TTS mode discards the original audio and regenerates with cast voices (animated film use case where the user voices a scratch performance).
3. **Same downstream pipeline regardless of input type.** Audio input produces the same `dialogue` + `speakerTurns` structure as text input. Storyboard agent, multi-voice TTS, audio rehearsal, lip sync — all work identically.

Audio input is **locked at submission** like text input — once submitted, it can't be edited inline; re-input requires a new project.

## 2. Non-goals (v1)

- Not voice-to-text-to-screenplay reformat — audio diarization produces structured dialogue directly; users wanting screenplay format use text input
- Not voice cloning from upload (user voices Maya, AI creates a Maya-cloned voice) — v2 ElevenLabs IVC integration
- Not real-time recording inside Stori — paste-uploaded WAV/MP3/M4A only in v1
- Not multi-language audio (mixed-language recordings) — single primary language per upload
- Not audio editing (trim, denoise) inside Stori — assume input is reasonably clean
- Not handling audio > 60 minutes — Scribe accepts long files but project-scope limits are sane
- Not auto-matching diarized speakers to cast via voice-fingerprint — v1 requires manual user mapping

## 3. Pre-existing primitives reused

- **ElevenLabs Scribe** ([js/17a-create-api.js](js/17a-create-api.js) `alignWordsWithScribe`): existing word-alignment helper. Extended in this plan to enable `diarize: true` and produce per-segment speaker labels.
- **Cast lock pipeline** ([js/17b-create-references.js](js/17b-create-references.js)): user-locked characters are the preferred targets for speaker mapping. Existing `castDetectFromScript` can be reused for AI-extra-suggestion path.
- **Multi-voice TTS pipeline** ([js/17b-create-references.js](js/17b-create-references.js) `castGenerateMultiVoiceAudio`): triggered for re-TTS mode; consumes the same per-line structure.
- **Audio rehearsal step** ([audio-rehearsal-plan.md](audio-rehearsal-plan.md) §7): consumes the produced structure regardless of mode.
- **Voice picker UI** (cast row, voice-and-lipsync-plan §6): reused for assigning voices to AI-suggested extra characters.
- **Web Audio API**: existing audio decoding + buffer slicing infrastructure for original-audio mode.
- **MOOD_ENUM** (audio-rehearsal-plan §5.4): consistent across audio + text input paths.

## 4. The two upload modes

User picks at upload time. Default = **original-audio**.

### 4.1 Mode A — Original audio (default)

Use case: podcasts, interviews, documentary footage, talking-head videos where the user's actual voice is the deliverable.

Flow:
1. User uploads audio
2. Scribe transcribes + diarizes
3. User maps each detected speaker to a cast character (or accepts AI-suggested extras)
4. Original audio is preserved as the project's master audio
5. Per-character segments are sliced from the master at scribe-detected boundaries
6. Storyboard agent generates visual scene descriptions FROM the transcript
7. Audio rehearsal step shows mini-players with disabled mood/regen controls (audio is fixed)
8. Lip sync runs against the original-audio segments

Mood/voice override is **disabled** in this mode — the audio came from the user. Re-recording requires a new project.

### 4.2 Mode B — Re-TTS as script reference

Use case: animated film workflow where the user voices a scratch performance to convey script + intent faster than typing.

Flow:
1. User uploads audio
2. Scribe transcribes + diarizes
3. User maps each detected speaker to a cast character
4. **Original audio is discarded** (kept in IDB for potential undo, but not used downstream)
5. Per-line text is extracted from the transcript
6. Optional: AI tone-detection per line from the original audio (which delivery cues to inherit)
7. Multi-voice TTS regenerates audio with cast voices (per voice-and-lipsync-plan §8.7)
8. Audio rehearsal works identically to text-input mode (full mood/regen controls)
9. Lip sync runs against the re-TTS'd audio

Mood/voice controls are **fully enabled** in this mode.

### 4.3 Mode selection UX

At audio upload completion + diarization (one-time gate):

```
┌─ How should we use this audio? ─────────────────────────────────┐
│                                                                  │
│ We detected 3 speakers in your 4:32 recording.                   │
│                                                                  │
│ ● Use my recordings (default — podcast / interview style)         │
│   Original voices play in the final video. Mood and voice can't  │
│   be changed since this is your actual recording.                 │
│   → Best for: podcasts, documentaries, talking-head videos        │
│                                                                  │
│ ○ Use as a script reference (animated film style)                │
│   Stori extracts text + speaker assignments + delivery cues,      │
│   then regenerates audio with cast voices. Original recording is  │
│   discarded.                                                       │
│   → Best for: animated film, where you voice a scratch take       │
│                                                                  │
│ [← Re-upload audio]                              [Continue →]    │
└──────────────────────────────────────────────────────────────────┘
```

Persisted on `inputDoc.audioMode` (locked at confirmation).

## 5. Architecture

```
   ┌──────────────────────────────────────┐
   │ Stage 1: Audio upload + validation    │
   │   format check, duration, size        │
   └──────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────┐
   │ Stage 2: Scribe transcription +       │
   │          diarization                  │
   │   diarize: true; per-word speaker IDs │
   └──────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────┐
   │ Stage 3: Mode selection UI            │
   │   user picks: original vs re-TTS      │
   └──────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────┐
   │ Stage 4: Speaker-mapping UI           │
   │   user maps speaker_0/1/2 to cast     │
   │   AI suggests extras (max 5) for      │
   │   unmapped speakers                   │
   └──────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────┐
   │ Stage 5: Mode-specific processing     │
   │   Mode A: slice original at speaker   │
   │           boundaries; preserve buffer │
   │   Mode B: extract text per speaker;   │
   │           run multi-voice TTS         │
   └──────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────┐
   │ Stage 6: Lock + hand to storyboard    │
   │   parsed structure becomes immutable  │
   └──────────────────────────────────────┘
```

## 6. Data model

### 6.1 Audio-specific input doc fields

```js
window.createJobState.inputDoc = {
  // existing from input-formats-plan.md (text input):
  format: 'audio',                       // new value alongside 'prose' | 'screenplay'
  rawText: null,                         // not applicable for audio
  rawAudioId: 'idb_audio_input_<projectId>',  // IDB key for original audio buffer
  audioFileName: 'interview.mp3',
  audioDurationSec: 272.4,
  audioSampleRate: 44100,

  // Mode lock (audio-specific)
  audioMode: 'original' | 're-tts' | null,    // null until user picks at Stage 3
  audioModeLockedAt: null | '<ISO>',

  // Diarization output
  diarizationResult: {
    speakers: [
      { id: 'speaker_0', wordCount: 152, totalSec: 38.4, firstWordTime: 0.5,
        sampleClipIdbKey: 'speaker_sample_speaker_0' },   // IDB key (data URL persists across reload)
                                                          // Per audit fix B4 — was blob URL, didn't survive reload
      { id: 'speaker_1', wordCount: 89,  totalSec: 22.1, firstWordTime: 4.2,
        sampleClipIdbKey: 'speaker_sample_speaker_1' },
      // ...
    ],
    alignedWords: [<existing Scribe word output with speaker_id added>],
    unmappedSpeakers: ['speaker_3', 'speaker_4'],   // populated when count > cast + 5 cap
    confidence: 0.85,                               // diarization quality score (per audit fix B1)
                                                    // computed from: avg segment length, switch frequency,
                                                    // single-word-segment ratio, label stability
  },

  // Speaker mapping (set during Stage 4)
  speakerMap: {
    'speaker_0': { characterId: 'char_maya', source: 'user-mapped' },
    'speaker_1': { characterId: 'char_joe',  source: 'user-mapped' },
    'speaker_2': { characterId: 'char_extra_1', source: 'ai-suggested-accepted' },
  },

  // AI-suggested extras created during Stage 4
  aiSuggestedExtras: [
    { id: 'char_extra_1', name: 'Bartender', voice: { provider: 'gemini', voiceId: 'Fenrir' },
      sourceSpeakerId: 'speaker_2', userAccepted: true, sourceLineSnippet: 'What\'ll it be?' },
  ],

  // Lock flag
  locked: false,
  lockedAt: null,
};
```

### 6.2 Unified parsed-structure schema (per audit fix A2)

The `parsed` schema is **a single supertype** consumed identically by storyboard agent / multi-voice TTS / audio rehearsal regardless of input source. Text input (input-formats-plan §5.2) and audio input (this plan) both produce instances of this schema. Fields not relevant to a given source are explicitly `null` rather than `undefined`.

```js
window.createJobState.inputDoc.parsed = {
  sceneHeadings: null | [<inferred>],     // null for prose; null for audio when Stage 5 inference (§9.1a) is skipped or fails;
                                          // populated for screenplay (deterministic from INT./EXT. headings) AND for audio
                                          // when Stage 5 setting-inference succeeds (audit fix B2 — gives image gen visual context)
  sceneBreaks: null,                      // screenplay-only; null for prose AND audio (storyboard agent infers downstream)
  dialogueLines: [
    {
      // Universal fields (always present, both input sources):
      speakerName: 'Maya',
      speakerCharacterId: 'char_maya',
      text: 'I really wish you\'d follow through on things.',
      speakerConfidence: 1.0,
      mood: 'matter-of-fact',             // ALWAYS populated. Mode A defaults to 'matter-of-fact'
                                          // (audio mood not regen-able); Mode B uses tone-detection result;
                                          // text input uses AI-classify or default.
      moodConfidence: null,               // null = no inference attempted (Mode A). Mode B / text input: 0.0-1.0.
      isVoiceOver: false,                 // dynamically computed: true when speakerCharacterId === 'narrator';
                                          // see §9.1 (Mode A) and §9.2 (Mode B) computation sites
      sourceMode: 'text-input' | 'audio-input',   // distinguishes provenance
      muted: false,                       // audio-rehearsal-plan compat
      regenCount: 0,
      regenLockToken: null,

      // Text-input-only fields (null for audio input):
      performanceCue: null,               // raw parenthetical text from screenplay; null for audio
      sourceLineNum: null,                // source-text line number; null for audio
      isExtraSpeaker: false,              // derived from speakerMap.source === 'ai-suggested-accepted'

      // Audio-input-only fields (null for text input):
      audioSegmentStartMs: null,          // slice offset in master buffer (Mode A only); null for text input + Mode B
      audioSegmentEndMs: null,
    },
  ],
  actionLines: [],                        // populated by text input parser; audio input uses Stage 5 setting-inference (§9.4)
  detectedSpeakers: [<reflected from speakerMap>],
};
```

**Schema divergence elimination:** every consumer reads from this single schema. Audio input sets text-only fields to null; text input sets audio-only fields to null. No `undefined` values. `moodConfidence` is always a number or explicit null — never undefined.

### 6.3 Speaker mapping persistence

`inputDoc.speakerMap` and `inputDoc.aiSuggestedExtras` persist across:
- Storyboard regen (don't re-trigger mapping flow)
- Audio rehearsal regen (don't re-trigger)
- Project save / restore via autosave

If user starts a new project, the map clears with the rest of `inputDoc`.

### 6.4 Canonical-source rule + sync function (per audit fix A4)

`aiSuggestedExtras` is the canonical source for AI-suggested character metadata. `speakerMap` is a derived view re-built from `aiSuggestedExtras` after any mutation. Direction of data flow: extras → speakerMap, never reverse.

```js
function syncSpeakerMap(inputDoc) {
  // Re-derive speakerMap entries for AI-suggested AND user-created extras based
  // on current state. Direct user-mapped entries (source === 'user-mapped') are
  // untouched — they point to existing locked cast and don't go through extras.
  //
  // The aiSuggestedExtras array is the canonical source for BOTH:
  //   - AI-suggested extras the user accepted (source: 'ai-suggested-accepted')
  //   - User-created characters added via "+ Create new character" UI (source: 'user-created')
  // Both flows write to aiSuggestedExtras with userAccepted: true on creation.
  for (const extra of inputDoc.aiSuggestedExtras) {
    if (!extra.userAccepted) {
      // Rejected — remove from speakerMap (lines fall through to narrator)
      delete inputDoc.speakerMap[extra.sourceSpeakerId];
    } else {
      // Accepted (either AI-suggested or user-created) — ensure speakerMap reflects current characterId
      inputDoc.speakerMap[extra.sourceSpeakerId] = {
        characterId: extra.id,
        source: extra.source || 'ai-suggested-accepted',  // preserves user-created vs ai-suggested-accepted
      };
    }
  }
  // Cleanup: any speakerMap entry pointing to a non-existent character (e.g.,
  // user deleted character mid-project) → reset to narrator
  for (const [speakerId, mapping] of Object.entries(inputDoc.speakerMap)) {
    if (mapping.source === 'ai-suggested-accepted' || mapping.source === 'user-created') {
      const stillExists = inputDoc.aiSuggestedExtras.some(
        e => e.id === mapping.characterId && e.userAccepted
      );
      if (!stillExists) {
        // Character was rejected or removed — fall back to narrator
        inputDoc.speakerMap[speakerId] = { characterId: 'narrator', source: 'rejected-fallback' };
      }
    }
  }
}
```

Called after:
- User accepts an AI-suggested extra
- User rejects an AI-suggested extra
- User changes the voice for an accepted extra
- User explicitly deletes an accepted extra mid-project
- Project autosave restore (re-derive on load)

## 7. AI-suggested extras flow (load-bearing rule — canonical source for both audio AND text input)

This section is the canonical specification for the AI-suggested extras flow. It applies identically to text input (input-formats-plan) and audio input (this plan). Per audit fix C3, the input-formats-plan EC-RG-02 references this section as the source of truth — anyone implementing extras flow should read this section regardless of which input format they're working on.

The rule persists across ALL input formats (text + audio) per the locked decision in #14 of the conversation thread.

### 7.1 The rule

1. **User-locked cast members are primary.** When mapping speakers, the user-locked cast (Maya, Joe, narrator) appear at the top of every dropdown.
2. **Extra speakers detected in input go through AI-suggest flow.** Whether the speaker comes from screenplay character cue ("BARTENDER"), prose tag (`[Bartender] said`), or audio diarization (`speaker_3` unmapped to existing cast), AI suggests creating a new character.
3. **Hard cap: 5 extras per project.** User-cast + AI-suggested ≤ user-cast + 5.
4. **Voice picker per accepted extra.** When user accepts an AI suggestion, they pick a voice (Gemini default options + ElevenLabs if configured).
5. **Rejected extras → lines reassigned to narrator.** Per locked decision (a). Lines spoken by the rejected extra become narrator voice-over in the final output.

### 7.2 The UI surface (shared across input formats)

When AI suggests extras (text or audio input):

```
┌─ AI detected additional characters ──────────────────────────────┐
│                                                                   │
│ Your input has 2 speakers Stori didn't recognize from your cast.  │
│ For each, accept (creates a new character) or reject (lines       │
│ become narrator voice-over).                                       │
│                                                                   │
│ ┌─ "BARTENDER" ──────────────────────────────────────────────┐  │
│ │ ▶ 3s sample                                                   │  │
│ │ First line: "What'll it be?"                                  │  │
│ │ Lines in input: 4                                             │  │
│ │                                                                │  │
│ │ Accept as new character?                                      │  │
│ │  [✓ Accept]   Voice: [ Fenrir — gruff, weighty ▾ ]            │  │
│ │  [✗ Reject]   (4 lines become narrator voice-over)           │  │
│ └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│ ┌─ "FEMALE PASSERBY" ─────────────────────────────────────────┐  │
│ │ ▶ 3s sample                                                   │  │
│ │ First line: "Excuse me, do you know..."                       │  │
│ │ Lines in input: 1                                             │  │
│ │                                                                │  │
│ │ Accept as new character?                                      │  │
│ │  [✓ Accept]   Voice: [ Aoede — warm, conversational ▾ ]       │  │
│ │  [✗ Reject]                                                    │  │
│ └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│ Cap: 2 / 5 extras allowed                                          │
│ [← Back]                              [Continue with mapping →]   │
└───────────────────────────────────────────────────────────────────┘
```

When detected count exceeds cap (>5 unmapped):

```
⚠ Too many speakers detected — Stori supports at most 5 extra characters.
   Speakers with the most lines are prioritized. The 2 lowest-line-count
   speakers will be merged into narrator voice-over.

   Accepted automatically: BARTENDER, FEMALE PASSERBY, MAN_AT_BAR, WAITER, BOUNCER
   Merged to narrator: SHADOW_SPEAKER (1 line), DISTANT_VOICE (1 line)

   [Adjust priorities]   [Continue]
```

User can click "Adjust priorities" to manually pick which 5 to keep.

### 7.3 Voice for accepted extras

Gemini voices are free defaults — show the 8-voice catalog with gender filter (per voice-and-lipsync-plan §6.3 same UI pattern). ElevenLabs voices appear only if configured. Audio sample play button next to each option.

When `audioMode === 'original'` (Mode A), the voice picker is **disabled** for AI-suggested extras — the original audio plays, no TTS occurs. Voice is set to "n/a — original recording" but stored in case mode switches to Mode B mid-project (not allowed in v1, but data model preserves the field for v2).

## 8. Stage 4 — Speaker-mapping UI in detail

### 8.1 Layout

```
┌─ Map detected speakers to your cast ─────────────────────────────┐
│                                                                   │
│ We diarized 3 distinct voices. Map each one to a cast character   │
│ or accept AI suggestions for new characters.                       │
│                                                                   │
│ ┌─ Speaker 1 ───────────────────────────────────────────────┐    │
│ │ ▶ ─────●──────── 0:03                                          │    │
│ │ First line: "I can't believe you said that."                   │    │
│ │ 12 lines in this recording                                     │    │
│ │                                                                 │    │
│ │ Map to: [ Maya (cast) ▾ ]                                       │    │
│ │         ↑ defaults to top user-cast match if name appears      │    │
│ │           in transcript; otherwise empty (user must pick)      │    │
│ └───────────────────────────────────────────────────────────────┘    │
│                                                                   │
│ ┌─ Speaker 2 ───────────────────────────────────────────────┐    │
│ │ ▶ ─────●──────── 0:03                                          │    │
│ │ First line: "I had to."                                         │    │
│ │ 8 lines in this recording                                       │    │
│ │                                                                 │    │
│ │ Map to: [ Joe (cast) ▾ ]                                        │    │
│ └───────────────────────────────────────────────────────────────┘    │
│                                                                   │
│ ┌─ Speaker 3 ───────────────────────────────────────────────┐    │
│ │ ▶ ─────●──────── 0:03                                          │    │
│ │ First line: "What'll it be?"                                    │    │
│ │ 4 lines in this recording                                       │    │
│ │                                                                 │    │
│ │ Map to: [ + Create new character ▾ ]                            │    │
│ └───────────────────────────────────────────────────────────────┘    │
│                                                                   │
│ [← Back to mode select]              [Continue with mapping →]   │
└───────────────────────────────────────────────────────────────────┘
```

### 8.1a Diarization confidence + warning banner (per audit fix B1)

After Scribe completes, compute a diarization confidence score from structural signals:

```js
function computeDiarizationConfidence(speakers, alignedWords, totalAudioSec) {
  // totalAudioSec passed in by caller (typically from inputDoc.audioDurationSec or
  // derived from alignedWords[alignedWords.length - 1].end).
  // Factor 1: Average segment length (short segments = noisy diarization)
  const avgSegmentSec = totalAudioSec / Math.max(1, speakers.length);
  const lengthScore = Math.min(1.0, avgSegmentSec / 5.0);   // 5s avg = full marks
  // Factor 2: Single-word-segment ratio (high ratio = label thrashing)
  const singleWordSegments = countSingleWordSegments(alignedWords);
  const thrashScore = 1.0 - Math.min(1.0, singleWordSegments / Math.max(1, alignedWords.length));
  // Factor 3: Speaker switch frequency (>1 switch/sec = suspicious)
  const switchesPerSec = countSpeakerSwitches(alignedWords) / Math.max(0.001, totalAudioSec);
  const switchScore = Math.max(0, 1.0 - switchesPerSec);
  // Factor 4 (label stability) deferred to v1.5. v1 redistributes the 0.10
  // weight across the three implemented factors per pass-2 audit fix B2 to
  // avoid baking in a constant 1.0 free score.

  return (lengthScore * 0.40) + (thrashScore * 0.40) + (switchScore * 0.20);
}

// Helper: count segments where a speaker speaks only one word before another
// speaker takes over (high count = label thrashing, diarization noise).
function countSingleWordSegments(alignedWords) {
  let count = 0;
  let currentSpeaker = null;
  let wordCount = 0;
  for (const word of alignedWords) {
    if (word.speaker_id !== currentSpeaker) {
      if (wordCount === 1) count++;
      currentSpeaker = word.speaker_id;
      wordCount = 1;
    } else {
      wordCount++;
    }
  }
  if (wordCount === 1) count++;   // tail segment
  return count;
}

// Helper: count points where the speaker label changes between adjacent words.
function countSpeakerSwitches(alignedWords) {
  let switches = 0;
  for (let i = 1; i < alignedWords.length; i++) {
    if (alignedWords[i].speaker_id !== alignedWords[i - 1].speaker_id) {
      switches++;
    }
  }
  return switches;
}
```

**UI surface when `confidence < 0.7`:** persistent banner in the speaker-mapping UI (§8.1):

```
⚠ Speaker detection confidence: 58% — review carefully
  Stori may have merged similar voices or split a single speaker. If the
  detected speaker count looks wrong, consider re-recording with clearer
  separation between speakers, or start a new project as text input.
  [Re-record]   [Start new as text]   [Continue with current detection]
```

When `confidence < 0.5`: hard-warn + offer the same options. User can still proceed; quality is their call. Doesn't block.

### 8.2 Auto-suggest matching

Before showing the mapping UI, run a heuristic: if the transcript contains "Maya:" or "MAYA" or `[Maya]` style tags within the first ~5 lines of a speaker's content, pre-fill the dropdown to that cast character. Saves clicks for screenplay-style recorded performances (e.g., a voice memo of someone reading a screenplay aloud, names mentioned aloud).

Confidence indicator on auto-matches: `(suggested)` text next to the dropdown. User can change.

### 8.3 "Create new character" flow

When user picks "+ Create new character" in the dropdown:

1. Inline form expands: name input + audio sample replays + character description (optional)
2. User clicks "Create" → adds to `inputDoc.aiSuggestedExtras` array (with `userAccepted: true`, `source: 'user-created'`)
3. Voice picker appears (Mode A: disabled with original-audio note; Mode B: full voice-and-lipsync §6 picker)
4. New character also gets added to `window.createJobState.characters` for downstream cast access

This flow is also triggered automatically for unmapped speakers exceeding the cast — the AI-suggested-extras §7 modal runs first, then this UI for user-confirmed acceptances.

### 8.4 Validation before proceeding

- Every detected speaker must be mapped (either to a cast character, an AI-suggested extra, or marked rejected → narrator)
- 5-extras cap enforced
- "Continue with mapping" button disabled until all speakers resolved

## 9. Stage 5 — Mode-specific processing

### 9.1 Mode A — Original audio

```js
async function processOriginalAudio(audioBuffer, alignedWords, speakerMap) {
  const dialogueLines = [];
  let currentSpeaker = null;
  let currentLine = null;

  for (const word of alignedWords) {
    // Per audit fix B5: handle null/missing speakerMap entries with narrator fallback.
    // - undefined map entry happens if Scribe returns a speaker_id that wasn't in the
    //   diarization preview (rare but defensive)
    // - rejected extras have entries pointing to 'narrator' via syncSpeakerMap (§6.4)
    const charId = (speakerMap[word.speaker_id] && speakerMap[word.speaker_id].characterId)
                   || 'narrator';
    const isVoiceOver = (charId === 'narrator');
    if (charId !== currentSpeaker) {
      // Speaker change — emit current line if any
      if (currentLine) dialogueLines.push(currentLine);
      currentLine = {
        speakerName: getCharacterName(charId),       // returns 'narrator' for charId === 'narrator'
        speakerCharacterId: charId,
        text: word.word,
        speakerConfidence: 1.0,           // user-mapped is 1.0 by definition
        mood: 'matter-of-fact',           // Mode A default per A3
        moodConfidence: null,
        sourceMode: 'audio-input',
        audioSegmentStartMs: word.start * 1000,   // Scribe returns seconds → convert to ms (per audit fix A1)
        audioSegmentEndMs: word.end * 1000,
        isVoiceOver,                       // true when charId === 'narrator'
        muted: false,
        regenCount: 0,
        regenLockToken: null,
        // Text-only fields for unified schema:
        performanceCue: null,
        sourceLineNum: null,
        isExtraSpeaker: speakerMap[word.speaker_id]?.source === 'ai-suggested-accepted',
      };
      currentSpeaker = charId;
    } else {
      // Same speaker — extend line
      currentLine.text += ' ' + word.word;
      currentLine.audioSegmentEndMs = word.end * 1000;   // Scribe seconds → ms
    }
  }
  if (currentLine) dialogueLines.push(currentLine);

  return dialogueLines;
}
```

The original `audioBuffer` becomes the project's master audio. Each `dialogueLines[i]` references a SLICE of the master buffer at `[audioSegmentStartMs, audioSegmentEndMs]` (canonical field names per §6.2). Mini-players in the audio-rehearsal step play these slices directly from the master buffer (per audio-rehearsal-plan §6.1 IDB-cached per-line buffer pattern, but here the source buffer is original audio not TTS).

### 9.1a Setting + action inference for image-gen prompts (per audit fix B2)

Audio input has no narrative description — just spoken dialogue. The storyboard agent (and downstream image-gen) needs visual context. Run an explicit Gemini call BEFORE handoff to storyboard:

```js
async function inferSettingAndActionsFromDialogue(dialogueLines, geminiKey) {
  const transcript = dialogueLines.map(d => `${d.speakerName}: "${d.text}"`).join('\n');
  const prompt = `
Given this dialogue transcript, infer the visual context for each segment.
Return ONLY JSON, no commentary.

For each segment, infer:
- setting: location + time of day + indoor/outdoor (concise phrase)
- actions: characters' physical actions and body language (concise list)
- atmosphere: overall tone/mood of the scene

Group consecutive lines into scene-like segments where the setting feels stable.

Schema:
[{ "segmentIndex": 0, "lineIndices": [0, 1, 2], "setting": "Kitchen, morning, indoor",
   "actions": "Maya stands at counter; Joe enters from doorway",
   "atmosphere": "tense, charged" }]

Transcript:
${transcript}
  `;
  const resp = await callGeminiAPI(['gemini-2.5-flash'], {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  }, geminiKey);
  return parseGeminiJson(resp);
}
```

**Output mapping:** populate `parsed.actionLines[]` and `parsed.sceneHeadings[]` from the inference. Storyboard agent then has visual context to feed image-gen.

**Cost:** ~$0.01-0.03 per project, single call regardless of recording length (chunk only if total transcript >30K chars). One-time at Stage 5.

**Fallback when Gemini call fails:** populate `actionLines` with generic placeholders ("Characters speaking in conversation") + log warning. Image gen will work but with weaker prompts.

### 9.2 Mode B — Re-TTS as script reference

```js
async function processReTTS(audioBuffer, alignedWords, speakerMap, audioMode) {
  // Step 1: extract per-line text by speaker
  const lines = [];
  let currentSpeaker = null;
  let currentText = '';
  let currentStart = 0;
  let currentEnd = 0;

  for (const word of alignedWords) {
    // Per audit fix B5 (extended to Mode B per pass-3 finding #12): narrator fallback
    // when speakerMap entry is missing or rejected. Mode A handles this in §9.1; Mode B
    // must match.
    const charId = (speakerMap[word.speaker_id] && speakerMap[word.speaker_id].characterId)
                   || 'narrator';
    if (charId !== currentSpeaker) {
      if (currentText) {
        // Per pass-4 NEW-ISSUE-1: isVoiceOver must be set on every line (Mode A
        // sets it in §9.1; Mode B was missing it). Downstream consumers
        // (audio rehearsal mood/regen disable, lip sync skip) read this field.
        lines.push({
          speakerCharacterId: currentSpeaker,
          text: currentText.trim(),
          originalStart: currentStart,
          originalEnd: currentEnd,
          isVoiceOver: (currentSpeaker === 'narrator'),
        });
      }
      currentSpeaker = charId;
      currentText = word.word;
      currentStart = word.start;
      currentEnd = word.end;
    } else {
      currentText += ' ' + word.word;
      currentEnd = word.end;
    }
  }
  if (currentText) lines.push({
    speakerCharacterId: currentSpeaker,
    text: currentText.trim(),
    originalStart: currentStart,
    originalEnd: currentEnd,
    isVoiceOver: (currentSpeaker === 'narrator'),
  });

  // Step 2: optional tone detection per line from original audio
  // For each line, slice the original audio + send to Gemini for mood classification
  // Cost: ~$0.001 per line; cap at 30 lines per call (batch)
  const lineMoods = await classifyLineMoodsFromAudio(audioBuffer, lines);

  // Step 3: hand to multi-voice TTS pipeline (voice-and-lipsync-plan §8.7)
  // Each line gets generated with cast voice + detected mood
  // Output replaces audioBuffer
  const reTtsResult = await castGenerateMultiVoiceAudio(
    lines.map((l, i) => ({
      dialogue: { speakerCharacterId: l.speakerCharacterId, text: l.text },
      performance: { tone: lineMoods[i] },
    })),
    { ... }
  );

  // Step 4: replace inputDoc.rawAudioId master with re-TTS output
  await castIdb.put(`audio_master_<projectId>`, reTtsResult.combinedAudioBuffer);

  return reTtsResult.dialogueLines;  // structured output for downstream
}
```

After Mode B processing, the original audio is **kept in IDB** (under `audio_input_original_<projectId>`) for potential v2 undo/comparison features. Master audio for the project is the re-TTS output.

**Storyboard-step TTS skip contract (per audit fix B3):**

When `inputDoc.audioMode === 're-tts'` AND `inputDoc.locked === true`, the storyboard step MUST skip its `castGenerateMultiVoiceAudio` call. The TTS already ran at Stage 5; running it again would:
- Double the TTS cost
- Produce different audio (different mood defaults, segmentation drift)
- Overwrite the master buffer that Stage 5 produced

```js
// Storyboard step entry (existing path) — add this guard at the top:
if (window.createJobState?.inputDoc?.audioMode === 're-tts'
    && window.createJobState?.inputDoc?.locked === true) {
  // Audio already produced at audio-input Stage 5; skip TTS.
  // The combined buffer + speakerTurns are already in window._createSpeakerTurns
  // and createAudioBuffer.
  return;
}
```

Cross-reference this contract in voice-and-lipsync-plan §8 + audio-rehearsal-plan §11.3 so future implementers don't accidentally re-run TTS.

### 9.3 Tone detection from original audio (Mode B optional)

For each per-line audio segment, call Gemini with the audio chunk via Gemini's structured-output JSON mode (per audit fix C8 — bare-word prompts are fragile):

```
Classify the emotional tone of these voice clips. For each clip, return one
mood from the enum below.

Enum:
[matter-of-fact, calm, warm, serious, excited, angry, sad, whispered,
 playful, concerned, urgent, sarcastic]

Return JSON conforming to schema: [{ "lineIdx": int, "tone": string,
"confidence": number 0..1 }]
```

With `responseMimeType: 'application/json'` set in `generationConfig`.

**Batching strategy (per audit fix B6):** chunk lines into groups of 30 per Gemini call. For 80+-line recordings, multiple sequential calls.

```js
const BATCH = 30;
const lineMoods = [];
for (let i = 0; i < lines.length; i += BATCH) {
  const batch = lines.slice(i, i + BATCH);
  const moods = await classifyLineMoodsFromAudio(audioBuffer, batch);  // single Gemini call w/ 30 lines audio
  lineMoods.push(...moods);
}
```

**Cost:** ~$0.001 per line, regardless of total count.
**Latency:** ~10s per batch of 30 — scales linearly past 30 lines (60 lines = ~20s; 90 lines = ~30s).
**Optional:** user can disable in mode-select UI to skip the latency. Disabled → all moods default to `'matter-of-fact'`.

## 10. Cost surface

Per audio-input project, one-time:

| Operation | Cost |
|---|---:|
| Scribe transcription + diarization (60s recording) | ~$0.0037 |
| Scribe transcription + diarization (10min interview) | ~$0.037 |
| Speaker-mapping UI sample generation (in-memory, free) | $0 |
| AI tone detection per line (Mode B, optional, ~30 lines) | ~$0.03 |
| Multi-voice TTS regen (Mode B, per voice plan §8.7) | ~$0.001-1.20 depending on character count + provider mix |

**Mode A total (original audio): ~$0.004 - $0.05** depending on recording length.
**Mode B total (re-TTS): ~$0.05 + cost of multi-voice TTS** for the project.

Both are negligible relative to per-project total ($5-15 typical).

## 11. Implementation order

8 phases. ~4-5 days uninterrupted.

| Phase | What | Files | Risk |
|---|---|---|---|
| **1. Audio upload + validation** | File picker; format detection (WAV/MP3/M4A); size/duration limits; IDB persistence | js/17c, js/01-core, css/styles | low |
| **2. Scribe with diarize: true (backward-compat)** | Add `diarize` as optional parameter (defaults `false`) to `alignWordsWithScribe`. Output mapper preserves `speaker_id` when `diarize: true`, omits it otherwise. Verify all 3 existing callers (17a, 17c, 20-reels-creator) work unchanged with default. | js/17a-create-api.js | **medium** (re-rated from low per audit fix C4 — output schema change risks breaking existing typed/validated consumers) |
| **3. Mode-select UI (Stage 3)** | Modal at upload completion; persist `audioMode` lock | js/17c, css/styles | low |
| **4. Speaker-mapping UI (Stage 4)** | Audio sample generation per speaker — store as data URLs in IDB (`speaker_sample_<speakerId>`) per audit fix B4 (was blob URLs, didn't survive page reload); mapping dropdowns; auto-suggest matching; AudioContext resume-on-gesture wrapper per EC-DI-11 | js/17b, js/17c, css/styles | medium |
| **5. AI-suggested extras flow (§7)** | Detect unmapped speakers; suggest creating new characters; voice picker; 5-cap enforcement; cross-format consistency (text + audio) | js/17b, js/17c | medium |
| **6. Mode A — original audio processing** | Speaker-boundary slicing; master buffer reference; per-line buffer access for mini-player | new js/32-audio-input.js, js/17b | medium |
| **7. Mode B — re-TTS pipeline** | Per-line text extraction; optional tone detection; multi-voice TTS handoff; master replacement | new js/32-audio-input.js, js/17b | high |
| **8. Lock + downstream handoff** | `inputDoc.locked = true`; storyboard agent + audio rehearsal consume `parsed` directly; mini-player mood/regen disable in Mode A | js/17c | medium |

Total: ~1500-1800 lines across ~6 files.

## 12. Edge cases register

35+ numbered cases.

### Audio upload + validation

| ID | Case | Behavior |
|---|---|---|
| EC-AU-01 | Unsupported format (e.g., .flac, .ogg) | Reject with hint: "Supported formats: WAV, MP3, M4A. Convert your file." |
| EC-AU-02 | Audio > 60 minutes | Allow upload but warn: "Long recordings may diarize less accurately. Consider splitting." Scribe handles up to 4hr. |
| EC-AU-03 | Audio < 5 seconds | Reject: "Recording too short. Stori needs at least 5 seconds of audio for diarization." |
| EC-AU-04 | Stereo audio | **Per audit fix C5:** preserve original (possibly stereo) buffer in `rawAudioId` — that's what Mode A plays back in the final video. Create a temporary mono downmix ONLY for Scribe at Stage 2 (Scribe gets cleaner diarization on mono); discard the temp buffer after Scribe returns. Mode A slicing and playback always reference the original `rawAudioId` buffer (stereo if uploaded as stereo). Mode B's re-TTS produces mono regardless (TTS engines are mono-by-design). |
| EC-AU-05 | File size > 25 MB | Compress/transcode client-side before upload to fit Scribe limits |
| EC-AU-06 | Audio with very low volume | Surface warning at upload; recommend re-recording or amplification |
| EC-AU-07 | Audio with heavy background music | Diarization quality degrades; surface warning post-Scribe if confidence is low |

### Scribe diarization

| ID | Case | Behavior |
|---|---|---|
| EC-DI-01 | Single speaker only | Skip Stage 4 mapping UI; default mapping is **videoType-aware** (per audit fix C1, refined): for `videoType: 'narration'` → narrator; for `videoType: 'brand'` with locked presenter → presenter; for `videoType: 'film'` with locked characters → first character; if NO cast at all → narrator with surfaced note "No cast — audio plays as narrator voice-over with no on-screen character." User can override in a confirm step before proceeding. |
| EC-DI-02 | More speakers detected than user-cast (and no ai-suggest extras yet) | Trigger AI-suggest-extras flow per §7; user accepts/rejects |
| EC-DI-03 | Speakers detected > 5 + cast count (cap exceeded) | Auto-merge lowest-line-count speakers to narrator; surface UI per §7.2 |
| EC-DI-04 | Same-gender speakers misdiarized as one speaker | Detected as fewer speakers than expected; user can split via "this is actually two people" UI in Stage 4 (v1.5 — for now, surface warning if cast > detected count) |
| EC-DI-05 | Same speaker diarized as two (tonal shift mid-recording) | User maps both to same cast character — system treats them as one speaker downstream |
| EC-DI-06 | Scribe call fails | Retry once with backoff. On second failure, surface error with two options: (a) "Retry Scribe" (re-runs the call), (b) "Start new project as text input" (deep-link that pre-fills `rawText` from any partial `diarizationResult.alignedWords` text into a NEW project — does NOT mutate the current locked-by-design audio project). Per audit fix A5: mid-project type-switching violates the lock contract; only "start new project" is valid. |
| EC-DI-07 | Scribe returns no speaker labels (diarize: true ignored) | Treat as single-speaker recording; map all to narrator; surface hint about Scribe configuration |
| EC-DI-08 | Diarized speaker has < 3s of audio | Sample clip generation falls back to all available audio; mapping UI works |
| EC-DI-09 | Overlapping speaker segments (Scribe assigns same time range to multiple speakers — simultaneous speech) | Per audit fix C6: merge overlapping words into a single multi-speaker segment with `multipleSpeakers: true` flag; surface warning in mapping UI: "Detected overlap at 0:24-0:27 — Stori plays this as a single segment in v1." Cut-on-speaker rule still treats it as one beat. |
| EC-DI-10 | Tab close during Scribe processing | Per audit fix C6: persist upload + partial state to IDB when Scribe call begins. On reload, if Scribe wasn't completed, re-trigger from scratch (results are deterministic; cost charged once on success only). [Renumbered from EC-AU-08 in pass-3 — sits in the diarization section, not upload.] |
| EC-DI-11 | AudioContext suspended (browser requires user gesture) | Per audit fix C6: wrap all play buttons (sample clips, mini-players in §8.1, rehearsal preview) with resume-on-gesture. If `audioContext.state === 'suspended'`, surface "Click to enable audio" overlay; first user click resumes context + starts playback. [Renumbered from EC-AU-09.] |
| EC-DI-12 | ElevenLabs key not configured at audio upload time | Per audit fix C6: gate at Stage 1 — when user attempts audio upload but `getElevenLabsKey()` returns null, block with: "Audio input requires an ElevenLabs API key. Configure it in Voice Settings before uploading." Do NOT let upload proceed only to fail at Scribe (waste of user time + uploaded bytes). When credit-system migration lands (per project_credit_system_only memory), this becomes "Audio input is a credit-billed feature — your credit balance is X." [Renumbered from EC-AU-10.] |

### Mode selection

| ID | Case | Behavior |
|---|---|---|
| EC-MS-01 | User picks Mode A then later wants to switch to Mode B | NOT supported in v1 — input is locked. New project required. (Per #7 of original lock thread.) |
| EC-MS-02 | User closes mode-select modal without picking | No proceed; modal stays sticky; "Continue" disabled until mode picked |
| EC-MS-03 | Single-speaker recording in Mode B (re-TTS) | Allowed; runs single-voice TTS regen; no diarization mapping needed |

### Speaker mapping

| ID | Case | Behavior |
|---|---|---|
| EC-SM-01 | Auto-suggest mismatches user intent (transcript says "Maya" but it's actually Joe's voice) | User overrides via dropdown; saved choice persists |
| EC-SM-02 | User maps two diarized speakers to the same cast character | Allowed; system merges their lines into single character flow downstream |
| EC-SM-03 | User maps zero diarized speakers | Validation blocks proceed; "Continue" stays disabled |
| EC-SM-04 | User accepts AI-suggested extra then immediately rejects | Extras count rolls back; lines move to narrator |
| EC-SM-05 | AI-suggested extra has same name as user-cast member (collision) | Block creation; show "name already used"; user picks different name or maps to existing cast |
| EC-SM-06 | User uses "+ Create new character" in mapping UI for a speaker that already has AI suggestion | AI suggestion replaced with user-created (manual takes precedence) |
| EC-SM-07 | User tries to create more than 5 extras | Block with "Cap reached: 5 extras max. Reject an existing extra to add this one." |

### Mode A — original audio processing

| ID | Case | Behavior |
|---|---|---|
| EC-OA-01 | User attempts to regen a line in audio rehearsal | Mood/regen controls disabled with tooltip: "Original recording — to change tone, re-record the audio in a new project." |
| EC-OA-02 | User attempts to change voice for a speaker post-mapping | Allowed if Mode B; blocked if Mode A (voice is the user's actual recording) |
| EC-OA-03 | Original audio sample rate doesn't match Web Audio context | Resample to 24000 Hz on import to match TTS sample rate (consistency with text-input projects) |
| EC-OA-04 | Per-line slice has cut-mid-word | Use Scribe word boundaries — slice cleanly at word.start / word.end |

### Mode B — re-TTS processing

| ID | Case | Behavior |
|---|---|---|
| EC-RT-01 | Tone detection per line is enabled but Gemini call fails | Default all moods to "matter-of-fact"; surface warning |
| EC-RT-02 | User skips tone detection (toggle off) | All lines default to "matter-of-fact" mood; can be overridden in audio rehearsal |
| EC-RT-03 | Re-TTS produces line shorter than original audio | Original audio is discarded; only re-TTS duration matters; scene timing follows re-TTS |
| EC-RT-04 | Re-TTS fails for one character's voice | Per voice-plan §8.7 fallback chain; if all fail, hard error; user retries |
| EC-RT-05 | Mode B with no cast voices configured (all extras need voices) | Block proceed; force user to set voices for all detected speakers |

### Lock + handoff

| ID | Case | Behavior |
|---|---|---|
| EC-LH-01 | User attempts to upload new audio after lock | Block; "Input is locked. Start a new project to use different audio." |
| EC-LH-02 | Storyboard agent crashes on transcript | Surface error; offer to switch to text input (paste transcript manually); user can copy from `inputDoc.diarizationResult.alignedWords` |
| EC-LH-03 | Project autosave during diarization | Persist progress; on reload, resume from last completed stage. **Lock-state invariant (per audit fix C2):** `if (inputDoc.locked) assert(inputDoc.audioMode !== null)`. On reload, if `audioMode === null` regardless of other persisted state, ALWAYS resume at Stage 3 (mode select). Never jump to Stage 5 or 6 without a confirmed mode. The impossible state (`audioMode: null, locked: true`) is guarded against by this invariant. |

## 13. Telemetry

```js
{
  // Upload
  audioInputUploaded: bool,
  audioInputFormat: 'wav' | 'mp3' | 'm4a',
  audioInputDurationSec: <int>,
  audioInputSizeBytes: <int>,

  // Diarization
  scribeDiarizationCalls: <int>,
  scribeDiarizationFailures: <int>,
  detectedSpeakerCount: <int>,
  scribeProcessingTimeMs: <int>,

  // Mode selection
  audioMode: 'original' | 're-tts',
  modeSwitchAttempts: <int>,           // EC-MS-01 (always 0 in v1; tracked for future)

  // Speaker mapping
  autoSuggestMatches: <int>,           // count of speakers auto-pre-filled from transcript names
  userOverrides: <int>,                // count of auto-suggestions user changed
  aiSuggestedExtrasCount: <int>,
  aiSuggestedExtrasAccepted: <int>,
  aiSuggestedExtrasRejected: <int>,
  capExceededEvents: <int>,            // EC-DI-03

  // Mode A
  originalAudioSlicesCreated: <int>,
  miniPlayerControlsDisabledFollowups: <int>,  // user attempts EC-OA-01

  // Mode B
  toneDetectionEnabled: bool,
  toneDetectionCallsCount: <int>,
  toneDetectionFailures: <int>,
  reTtsTotalCost: <float>,

  // Cost
  scribeCostUsd: <float>,
  toneDetectionCostUsd: <float>,
  reTtsCostUsd: <float>,
  totalAudioInputCostUsd: <float>,

  // Audit fix C7 — fallback paths and quality signals
  audioToTextFallbackOffered: bool,        // EC-DI-06 retry-failed path surfaced
  audioToTextFallbackAccepted: bool,       // user clicked "Start new project as text input"
  transcriptCopiedToClipboard: <int>,      // count of copy-transcript actions
  diarizationConfidence: <float>,          // computed score from §8.1a
  diarizationConfidenceWarningShown: <int>, // count of <0.7 warnings surfaced
  audioContextResumeRequired: <int>,       // EC-DI-11 — count of "click to enable audio" surfacings
  elevenlabsKeyMissingAtUpload: <int>,     // EC-DI-12 — gates fired at Stage 1
  overlappingSegmentsDetected: <int>,      // EC-DI-09 — merged overlap events
  tabCloseDuringScribeRecoveries: <int>,   // EC-DI-10 — Scribe restart on reload
}
```

## 14. Risks + open questions

### Risks

1. **Scribe diarization quality on real recordings.** Verified pricing + cap; quality on similar-voice / noisy / overlapping speech is unbenchmarked at our specific use case. Mitigation: surface diarization confidence; provide manual override in Stage 4; offer "this is actually two speakers" split flow in v1.5.

2. **Mode B latency.** Re-TTS regen on a 5-min recording with 60 lines = 60 TTS calls (or fewer with batching). Could be 30-90s wall clock. Mitigation: per voice-plan §8.7 per-character batching reduces this by 30-50%.

3. **Tone detection accuracy from audio.** Gemini's audio tone classification isn't benchmarked. Mitigation: optional toggle; default to "matter-of-fact" if user disables.

4. **5-extras cap is too restrictive for ensemble cast recordings.** A radio drama with 8 voices would force merges. v1.5 may raise cap to 10 with confirmation.

5. **Original audio quality drives final video quality.** Mitigation: surface upload-time hints about recording conditions; v2 may add denoise step.

### Open questions for v2+

1. **Voice cloning from upload** — user records as Maya for 30s; ElevenLabs IVC creates a Maya voice clone; future TTS uses the cloned voice. Major capability. v2.
2. **Mode switch mid-project** — user starts Mode A, decides they want Mode B. Currently blocked. v2 if filmmakers ask.
3. **Multi-language audio** — code-switching between languages mid-recording. Scribe is single-language per call. v2.
4. **Real-time recording inside Stori** — record-then-process flow. v2.
5. **Voice fingerprint auto-matching** — Stori records each cast character's voice once; auto-maps detected speakers to closest fingerprint. Saves manual mapping. v2.
6. **"This speaker is actually two people" split** — for misdiarized same-gender speakers. v1.5.
7. **Cap raise (5 → 10 with confirmation)** — v1.5 if filmmakers ask.

## 15. Decision log

| Decision | Choice | Rationale |
|---|---|---|
| Two upload modes (original vs re-TTS) | Yes — both supported | Different filmmaker workflows: podcast (original) vs animated film (re-TTS scratch). |
| Default mode? | **Original-audio** | Conservative — preserves user's recording; re-TTS would surprise users by replacing their voice. |
| Speaker mapping UI shape? | **Audio sample primary, text snippet supporting** | Voice is the source of truth for speaker identification; audio sample > text. |
| AI-suggested extras flow? | Same as text input — voice plan §6.5 pattern, max 5 extras | Cross-format consistency; users see the same UX whether input is text or audio. |
| Hard cap on extras? | **5** | Locked. Prevents runaway character creation; v1.5 may revisit. |
| Rejected extras' lines? | **Become narrator voice-over** (option a) | Locked. Clean fallback; doesn't require manual reassignment per line. |
| Diarization provider? | **Scribe (ElevenLabs) — required default** | Per locked architecture; Gemini diarization is unreliable for >10min audio and lacks word-level timing. |
| Tone detection in Mode B? | Optional toggle, on by default | Improves naturalness but adds latency + cost; user can opt out for speed. |
| Auto-match speakers via voice fingerprint? | **No (v1)** — manual mapping required | We don't have voice samples for cast characters yet. v2 once voice cloning lands. |
| Mode switch mid-project? | **No (v1)** — locked at submission per #7 of conversation | New project required to switch modes. |
| Mini-player controls in Mode A? | **Disabled** for mood/regen — display only | Original audio can't be regen'd; voice override would lie. |
| Audio file format support? | WAV, MP3, M4A | Common formats; covers 95% of user uploads. |
| Time field units? | All `audioSegmentStartMs/EndMs` in milliseconds; Scribe seconds × 1000 at the boundary | Per audit fix A1 — unit naming made explicit to prevent silent ×1000 bugs. |
| Schema unification across input types? | Single supertype; null fields where not applicable; never undefined | Per audit fix A2 — text + audio paths produce identical shape consumers can iterate. |
| Mode A mood field? | Always `'matter-of-fact'`; `moodConfidence: null` | Per audit fix A3 — disabled regen means mood semantically n/a. |
| `speakerMap` ↔ `aiSuggestedExtras` sync? | `aiSuggestedExtras` canonical; `speakerMap` derived; explicit `syncSpeakerMap()` after every mutation | Per audit fix A4. |
| Scribe failure mid-project fallback? | Two options: retry, OR start new project as text input (deep-link with pre-filled rawText). NOT in-place type switch. | Per audit fix A5 — preserves lock contract. |
| Diarization confidence score? | Computed from segment length + thrash + switch frequency + label stability; surfaced as banner when < 0.7 | Per audit fix B1 — was a risk note, now a design feature. |
| Action lines for image-gen prompts? | Inferred via Gemini call from dialogue transcript at Stage 5 | Per audit fix B2 — audio doesn't produce action lines naturally; image gen needs visual context. |
| TTS skip contract for Mode B at storyboard step? | Skip when `audioMode === 're-tts' && locked`; cross-referenced in voice + audio-rehearsal plans | Per audit fix B3 — prevents double TTS run. |
| Sample clip persistence? | Data URLs in IDB; not blob URLs | Per audit fix B4 — blob URLs don't survive reload. |
| `processOriginalAudio` null guard? | Defensive `|| 'narrator'` fallback; sets `isVoiceOver: true` on narrator-fallback lines | Per audit fix B5. |
| Tone detection batching for >30 lines? | 30-line batches in series; latency scales linearly | Per audit fix B6. |
| Single-speaker default mapping? | videoType-aware: narration → narrator; brand → presenter; film → first character; no cast → narrator with note | Per audit fix C1. |
| Lock-state invariant? | `if locked, audioMode !== null` enforced; resume always at Stage 3 if mode null | Per audit fix C2. |
| 5-extras canonical source? | This plan §7 (referenced by input-formats-plan EC-RG-02) | Per audit fix C3. |
| `alignWordsWithScribe` API change? | Optional `diarize` param; defaults false; speaker_id only emitted when true | Per audit fix C4 — backward-compat with 3 existing callers. |
| Stereo audio handling? | Original buffer in `rawAudioId` (stereo preserved for playback); temporary mono downmix for Scribe only | Per audit fix C5. |
| Tone detection prompt? | Gemini structured-output JSON mode (`responseMimeType: 'application/json'`); batched 30-per-call | Per audit fix C8. |

## 16. Acceptance criteria

The plan is complete when:

- [ ] User can upload WAV/MP3/M4A; format/size/duration validated.
- [ ] Scribe is called with `diarize: true`; per-segment speaker labels returned.
- [ ] Mode-select UI surfaces post-diarization with both options + clear use-case framing.
- [ ] Default mode = original-audio.
- [ ] Mode is locked at user confirmation; mid-project switch blocked.
- [ ] Speaker-mapping UI shows audio sample (▶ button) + first-line text snippet + cast dropdown for each detected speaker.
- [ ] Auto-suggest pre-fills cast match when transcript contains the cast character's name; user can override.
- [ ] AI-suggest-extras flow runs for unmapped speakers; max 5 enforced; voice picker per accepted extra.
- [ ] Rejected extras' lines reassigned to narrator voice-over.
- [ ] Cap-exceeded path auto-merges lowest-line-count speakers to narrator with user-facing notice.
- [ ] Mode A processing slices original audio at Scribe word boundaries; preserves master buffer; downstream mini-players read slices.
- [ ] Mode A rehearsal cards have mood/regen disabled with informative tooltip.
- [ ] Mode B processing extracts per-line text + optional tone detection + runs multi-voice TTS regen via voice-plan §8.7.
- [ ] Mode B output replaces project master audio; original retained in IDB for v2 undo.
- [ ] Storyboard agent consumes the produced `parsed` structure identically across text-input and audio-input projects.
- [ ] Cap of 5 AI-suggested extras enforced consistently across text input AND audio input.
- [ ] All 35+ edge cases (EC-AU, EC-DI, EC-MS, EC-SM, EC-OA, EC-RT, EC-LH) have explicit handlers.
- [ ] Telemetry captures all 25+ fields in §13.
- [ ] Aurora dark + light theme tokens applied to mode-select modal, speaker-mapping UI, AI-suggested extras flow per voice-and-lipsync-plan §19.
- [ ] Total Mode A cost stays under $0.05; Mode B cost dominated by multi-voice TTS regen (per voice-plan §12 cost surface).
- [ ] All time fields use `audioSegmentStartMs/EndMs` (ms units); Scribe `word.start/end` (seconds) × 1000 at the boundary.
- [ ] `parsed.dialogueLines` schema unified across text-input and audio-input; null where not applicable, never undefined.
- [ ] Mode A `mood` always = 'matter-of-fact'; `moodConfidence` always null.
- [ ] `aiSuggestedExtras` is canonical; `speakerMap` re-derived via `syncSpeakerMap()` after every mutation.
- [ ] Scribe failure offers retry + start-new-project-as-text (NOT in-place type switch).
- [ ] `diarizationResult.confidence` computed; <0.7 surfaces warning banner with re-record/text-fallback options.
- [ ] Setting + actions inferred via Gemini call at Stage 5; populates `actionLines[]` and `sceneHeadings[]`.
- [ ] Storyboard step skips `castGenerateMultiVoiceAudio` when `audioMode === 're-tts' && locked === true`.
- [ ] Sample clips stored as data URLs in IDB at `speaker_sample_<speakerId>`; survive reload.
- [ ] `processOriginalAudio` defensive guards: `|| 'narrator'` fallback when speakerMap returns undefined; sets `isVoiceOver: true` on narrator-fallback.
- [ ] Tone detection batched 30 lines per call when audio has >30 lines; sequential calls for >30.
- [ ] Single-speaker default mapping is videoType-aware (narration → narrator; brand → presenter; film → first character).
- [ ] Lock-state invariant: `if locked, audioMode !== null` enforced; resume always at Stage 3 when audioMode null.
- [ ] `alignWordsWithScribe` accepts optional `{ diarize }` param defaulting false; existing 3 callers unaffected.
- [ ] Stereo audio: original preserved in `rawAudioId`; temporary mono downmix for Scribe only.
- [ ] Tone detection uses Gemini JSON mode (`responseMimeType: 'application/json'`); not bare-word prompts.
- [ ] EC-DI-09 overlapping speakers, EC-DI-10 tab close during Scribe, EC-DI-11 AudioContext suspended, EC-DI-12 ElevenLabs key gate — all handled.
- [ ] Telemetry captures: diarizationConfidence, audioContextResumeRequired, elevenlabsKeyMissingAtUpload, overlappingSegmentsDetected, tabCloseDuringScribeRecoveries, audioToTextFallbackOffered/Accepted, transcriptCopiedToClipboard.
