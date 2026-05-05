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
        sampleClipUrl: '<blob URL of 3s sample for the mapping UI>' },
      { id: 'speaker_1', wordCount: 89,  totalSec: 22.1, firstWordTime: 4.2,
        sampleClipUrl: '<...>' },
      // ...
    ],
    alignedWords: [<existing Scribe word output with speaker_id added>],
    unmappedSpeakers: ['speaker_3', 'speaker_4'],   // populated when count > cast + 5 cap
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

### 6.2 Per-scene parsed structure (same as text input path)

```js
window.createJobState.inputDoc.parsed = {
  sceneHeadings: null,                    // audio doesn't have explicit scene headings — agent infers
  sceneBreaks: null,                      // agent infers scene boundaries from transcript
  dialogueLines: [
    {
      speakerName: 'Maya',
      speakerCharacterId: 'char_maya',
      text: 'I really wish you\'d follow through on things.',
      performanceCue: null,               // audio-input mode A doesn't have textual cues
      mood: 'angry',                      // populated only in mode B (audio tone analysis)
      moodConfidence: 0.7,                // mode B only; mode A: n/a
      speakerConfidence: 1.0,             // 1.0 after user-mapping; 0.0 if speaker still unmapped
      sourceMode: 'audio-input',          // distinguishes from TTS-generated turns
      audioSegmentStart: 0.5,             // mode A only — slice offset in master buffer
      audioSegmentEnd: 3.7,
      isVoiceOver: false,
    },
  ],
  actionLines: [],                        // audio doesn't produce action lines — storyboard agent generates from transcript
  detectedSpeakers: [<reflected from speakerMap>],
};
```

### 6.3 Speaker mapping persistence

`inputDoc.speakerMap` and `inputDoc.aiSuggestedExtras` persist across:
- Storyboard regen (don't re-trigger mapping flow)
- Audio rehearsal regen (don't re-trigger)
- Project save / restore via autosave

If user starts a new project, the map clears with the rest of `inputDoc`.

## 7. AI-suggested extras flow (load-bearing rule)

This is the rule that persists across ALL input formats (text + audio) per the locked decision in #14 of the conversation thread.

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
    const charId = speakerMap[word.speaker_id]?.characterId;
    if (charId !== currentSpeaker) {
      // Speaker change — emit current line if any
      if (currentLine) dialogueLines.push(currentLine);
      currentLine = {
        speakerName: getCharacterName(charId),
        speakerCharacterId: charId,
        text: word.word,
        speakerConfidence: 1.0,           // user-mapped is 1.0 by definition
        sourceMode: 'audio-input',
        audioSegmentStart: word.start,
        audioSegmentEnd: word.end,
        isVoiceOver: false,
      };
      currentSpeaker = charId;
    } else {
      // Same speaker — extend line
      currentLine.text += ' ' + word.word;
      currentLine.audioSegmentEnd = word.end;
    }
  }
  if (currentLine) dialogueLines.push(currentLine);

  return dialogueLines;
}
```

The original `audioBuffer` becomes the project's master audio. Each `dialogueLines[i]` references a SLICE of the master buffer at `[audioSegmentStart, audioSegmentEnd]`. Mini-players in the audio-rehearsal step play these slices directly from the master buffer (per audio-rehearsal-plan §6.1 IDB-cached per-line buffer pattern, but here the source buffer is original audio not TTS).

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
    const charId = speakerMap[word.speaker_id]?.characterId;
    if (charId !== currentSpeaker) {
      if (currentText) {
        lines.push({ speakerCharacterId: currentSpeaker, text: currentText.trim(),
                     originalStart: currentStart, originalEnd: currentEnd });
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
  if (currentText) lines.push({ speakerCharacterId: currentSpeaker, text: currentText.trim(),
                                originalStart: currentStart, originalEnd: currentEnd });

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

### 9.3 Tone detection from original audio (Mode B optional)

For each per-line audio segment, call Gemini with the audio chunk:

```
"Classify the emotional tone of this voice clip. Choose ONE from:
 [matter-of-fact, calm, warm, serious, excited, angry, sad, whispered,
  playful, concerned, urgent, sarcastic]

 Respond with the single tone word."
```

Cost: ~$0.001 per line. Adds ~10s latency for a 30-line script. Optional — skip if user wants speed over fidelity (toggle in mode-select UI).

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
| **2. Scribe with diarize: true** | Flip diarize flag in `alignWordsWithScribe`; extend output schema for speaker labels | js/17a-create-api.js | low |
| **3. Mode-select UI (Stage 3)** | Modal at upload completion; persist `audioMode` lock | js/17c, css/styles | low |
| **4. Speaker-mapping UI (Stage 4)** | Audio sample generation per speaker; mapping dropdowns; auto-suggest matching | js/17b, js/17c, css/styles | medium |
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
| EC-AU-04 | Stereo audio | Downmix to mono before Scribe (Scribe handles either but mono is more reliable for diarization) |
| EC-AU-05 | File size > 25 MB | Compress/transcode client-side before upload to fit Scribe limits |
| EC-AU-06 | Audio with very low volume | Surface warning at upload; recommend re-recording or amplification |
| EC-AU-07 | Audio with heavy background music | Diarization quality degrades; surface warning post-Scribe if confidence is low |

### Scribe diarization

| ID | Case | Behavior |
|---|---|---|
| EC-DI-01 | Single speaker only | Skip Stage 4 mapping UI; auto-map speaker_0 to narrator; proceed to Stage 5 |
| EC-DI-02 | More speakers detected than user-cast (and no ai-suggest extras yet) | Trigger AI-suggest-extras flow per §7; user accepts/rejects |
| EC-DI-03 | Speakers detected > 5 + cast count (cap exceeded) | Auto-merge lowest-line-count speakers to narrator; surface UI per §7.2 |
| EC-DI-04 | Same-gender speakers misdiarized as one speaker | Detected as fewer speakers than expected; user can split via "this is actually two people" UI in Stage 4 (v1.5 — for now, surface warning if cast > detected count) |
| EC-DI-05 | Same speaker diarized as two (tonal shift mid-recording) | User maps both to same cast character — system treats them as one speaker downstream |
| EC-DI-06 | Scribe call fails | Retry once with backoff; on second failure, surface error and offer mode switch to text input (paste transcript manually) |
| EC-DI-07 | Scribe returns no speaker labels (diarize: true ignored) | Treat as single-speaker recording; map all to narrator; surface hint about Scribe configuration |
| EC-DI-08 | Diarized speaker has < 3s of audio | Sample clip generation falls back to all available audio; mapping UI works |

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
| EC-LH-03 | Project autosave during diarization | Persist progress; on reload, resume from last completed stage |

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
