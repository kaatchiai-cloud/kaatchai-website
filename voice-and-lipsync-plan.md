# Voice + Lip Sync Plan — Multi-Character Dialogue Pipeline

Status: design draft, locked decisions, not yet implemented.
Scope: enables filmmakers to bind per-character voices, generate multi-speaker dialogue with correct timing, and have the right character's mouth animate on the right line — at two quality tiers, on photoreal and stylized templates.

Sibling to [consistency-plan.md](consistency-plan.md). Depends on the talking-head dual-track work already shipped. Final lip-sync stage depends on the future server-pipeline migration (R2 + Cloudflare Containers + Supabase).

---

## 1. Goal

Three user-visible outcomes:

1. **Each character has their own voice.** Maya sounds different from Joe. The user picks voice per character at cast lock time, hears a sample before committing, and that voice carries through every line that character speaks.
2. **Mouths move on the right character at the right time.** When Maya speaks her TTS line, *her* mouth moves. When Joe replies, *his* mouth moves. When framing makes that impossible (back-of-head shot, off-screen), audio plays as voice-over without fake mouth animation.
3. **Two tiers of mouth animation.** Free tier = "Stori sync" (server-side MediaPipe + audio-driven sprite overlay, works on every template, no per-clip cost). Premium tier = "AI sync" (Kling LipSync via fal.ai, ~$0.014/sec, photoreal-quality on supported templates).

## 2. Non-goals (v1)

- Not phoneme-perfect lip sync on the free tier. Stori sync is mouth-flap timed to audio amplitude.
- Not multi-face-in-one-clip. Cut-on-speaker rule means each dialogue clip has one speaker on screen. Two-shots with both characters lip-syncing is v2.
- Not voice cloning from user-uploaded audio. v2 feature.
- Not real-time voice generation in the editor preview. Voices are bound at cast time, baked at storyboard time.
- Not multi-language voice swaps. Source language drives voice; per-character translations out of scope.

## 3. The full chain end-to-end

```
SCRIPT             CAST          STORYBOARD       TTS              AUDIO         FRAMING        VIDEO          LIPSYNC          MUX
──────             ────          ──────────       ───              ─────         ───────        ─────          ───────          ───
Maya: "Hi"   →   Maya:Aoede  →  cut-on-speaker → 2 calls       → per-scene  →  frontal CU  →  Kling i2v  →  Tier 1 or 2  →  final.mp4
Joe:  "Hello"    Joe:Charon     splits into     → 2 segments   →  WAVs +      of speaker     of speaker      mouth on
                                two scenes        with timing     speaker      enforced       only            speaker face
                                                                  metadata
```

Each stage produces inputs the next depends on. Failures cascade: cast voice not bound → fall back to narrator. Storyboard can't get speaker-visible framing → voice-over. Lip sync fails → raw clip + warning.

## 4. Pre-existing primitives reused

- **Cast lock pipeline** ([js/17b-create-references.js](js/17b-create-references.js)): per-character entity. Extended with `gender`, `voice` fields.
- **Narrator entity**: already has voice. Becomes project-wide fallback.
- **Storyboard agent** ([js/17c-create-pipeline.js](js/17c-create-pipeline.js)): emits per-scene JSON. Extended for `speaker:` tags + `framing` enum.
- **Bracket-token parser** (`castParseBracketTokens`): recognizes `[Maya]`. Used for inline-tag fallback.
- **Gemini TTS** (`generateTTSGemini(text, voiceId, key)`): already supports voice override per call.
- **Scribe word alignment**: provides sample-accurate word timestamps.
- **Bible cells**: locked appearance. Used as visual anchor for cut-on-speaker close-ups.
- **Talking-head narrator setup**: composite + Kling i2v from setup. Lip-sync layers on top.
- **Canvas chrome node pattern**: voice indicator surfaces as a small chip on dialogue-scene nodes (read-only).

## 5. Data model

All additive.

### 5.1 Character / narrator extension

```js
// window.createJobState.characters[i] (also presenter, narrator)
{
  // existing
  id, name, appearanceSheet, representativeImageDataUrl, locked, ...,

  // NEW
  gender: 'male' | 'female' | 'neutral',
  voice: {
    provider: 'gemini' | 'elevenlabs',
    voiceId: 'Aoede',
    voiceName: 'Aoede',
    speakingRate: 1.0,
    pitch: 0,
    sampleAudioId: 'idb_voicesample_Aoede',
  },
  voiceLockedAt: '<ISO>',
}
```

### 5.2 Project-level voice config

```js
window.createJobState.voiceConfig = {
  fallbackVoice: { provider: 'gemini', voiceId: 'Kore', voiceName: 'Kore' },
  defaultsByGender: {
    male:    { provider: 'gemini', voiceId: 'Charon', voiceName: 'Charon' },
    female:  { provider: 'gemini', voiceId: 'Aoede',  voiceName: 'Aoede'  },
    neutral: { provider: 'gemini', voiceId: 'Kore',   voiceName: 'Kore'   },
  },
  elevenlabsKeyConfigured: false,
};
```

### 5.3 Voice catalog

```js
window.VOICE_CATALOG = {
  gemini: [
    { id: 'Aoede',  name: 'Aoede',  gender: 'female',  tag: 'warm, conversational' },
    { id: 'Charon', name: 'Charon', gender: 'male',    tag: 'deep, authoritative' },
    { id: 'Kore',   name: 'Kore',   gender: 'neutral', tag: 'mid-range, neutral' },
    { id: 'Puck',   name: 'Puck',   gender: 'male',    tag: 'playful, mid-pitch' },
    { id: 'Fenrir', name: 'Fenrir', gender: 'male',    tag: 'gruff, weighty' },
    { id: 'Leda',   name: 'Leda',   gender: 'female',  tag: 'bright, youthful' },
    { id: 'Orus',   name: 'Orus',   gender: 'male',    tag: 'measured, professional' },
    { id: 'Zephyr', name: 'Zephyr', gender: 'neutral', tag: 'breezy, light' },
  ],
  elevenlabs: [],   // populated dynamically from /v1/voices
};
```

ElevenLabs catalog is fetched on key-set, cached in IDB, refreshable.

### 5.4 Speaker-tagged script segments

```js
{
  segmentIndex: 0,
  sceneDescription: '...',
  suggestNarrator: false,
  performance: {...},

  // NEW
  dialogue: {
    speakerCharacterId: 'char_maya' | 'narrator' | null,
    speakerName: 'Maya' | 'narrator' | null,
    text: 'I can\'t believe you said that.',
    isVoiceOver: false,
  },
  framing: 'frontal-close-up' | 'three-quarter' | 'over-shoulder-front' |
           'over-shoulder-back' | 'profile' | 'back-of-head' |
           'wide-establishing' | 'extreme-wide' | 'frontal-medium',
  speakerVisible: true,   // derived: true ONLY for {frontal-*, three-quarter, over-shoulder-front}
}
```

### 5.5 Speaker-turn timeline (per scene)

```js
scene.speakerTurns = [
  { speakerCharacterId: 'char_maya', startMs: 0,    endMs: 2000, voiceId: 'Aoede',  audioSegmentId: 'idb_seg_4_0' },
  { speakerCharacterId: 'char_joe',  startMs: 2300, endMs: 5000, voiceId: 'Charon', audioSegmentId: 'idb_seg_4_1' },
];
scene.combinedAudioId = 'idb_scene_4_audio';
scene.dialogueLength  = 5000;
```

### 5.6 Lip-sync tier selection

```js
window.createJobState.lipSyncTier = 'stori' | 'kling';   // default 'stori'
window.createJobState.lipSyncTierLockedAt = null;
```

### 5.7 Per-clip lip-sync metadata

```js
scene.lipSync = {
  tier: 'stori' | 'kling' | 'none' | 'failed',
  status: 'pending' | 'syncing' | 'ready' | 'error',
  syncedClipUrl: 'r2://...',
  overlayInstructions: { ... },     // Tier 1 metadata
  faceDetectionId: 'idb_face_4',    // Tier 1 cache
  lastError: null,
  costCharged: 0,
};
```

## 6. Cast panel UI extension

### 6.1 Row layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ [thumb] Maya                                          [Lock] [Edit]  │
│         Tall woman, mid-30s, dark curly hair…                        │
│         Gender: [♀ Female ▾]    Voice: [Aoede — warm, conv ▾] [▶]    │
└──────────────────────────────────────────────────────────────────────┘
```

Three new controls per row:

- **Gender dropdown**: `[♂ Male / ♀ Female / ⚧ Neutral]`. Auto-populated via Gemini name-inference at create time.
- **Voice dropdown**: filtered + reordered by gender (matched on top, "Other voices" below). Provider toggle pill at top: `[Gemini]` / `[ElevenLabs]` (latter disabled if key not set).
- **Play/pause button**: single-button toggle. ▶ idle, ⏸ during playback. Plays voice sample.

### 6.2 Source-tree placement

- **Render**: extend `renderCastRows` in [js/17b-create-references.js](js/17b-create-references.js) (~line 850) with voice strip injection.
- **Wire-up**: new `_wireCastVoiceControls(rowEl, item)` per row.
- **Data**: `item.voice`, `item.gender`.
- **Sample playback**: new `castPlayVoiceSample(provider, voiceId, btnEl)` in 17b. Single audio element pool (only one sample audible at a time).

### 6.3 Sample playback

Sources:

- **First-play**: Gemini-side: tiny TTS call with fixed sentence (`"Hello, I'm [voiceName]. This is how I sound in your story."`). ElevenLabs-side: prefer `/v1/voices` `previewUrl`; fall back to live TTS.
- **Subsequent plays**: serve from IDB cache.

Implementation:

```js
async function castPlayVoiceSample(provider, voiceId, btnEl) {
  const key = `voicesample_${provider}_${voiceId}`;
  if (window._castCurrentSampleAudio) {
    window._castCurrentSampleAudio.pause();
    if (window._castCurrentSampleBtn) window._castCurrentSampleBtn.textContent = '▶';
  }
  let url = await window.castIdb.get(key);
  if (!url) {
    btnEl.textContent = '⋯';
    if (provider === 'gemini') {
      const sentence = `Hello, I'm ${voiceId}. This is how I sound in your story.`;
      const result = await generateTTSGemini(sentence, voiceId, getCreateGeminiKey());
      url = `data:${result.mimeType};base64,${result.base64}`;
    } else {
      url = await elevenlabsGenerateSample(voiceId);
    }
    await window.castIdb.put(key, url);
  }
  const audio = new Audio(url);
  window._castCurrentSampleAudio = audio;
  window._castCurrentSampleBtn = btnEl;
  btnEl.textContent = '⏸';
  audio.onended = () => { btnEl.textContent = '▶'; };
  audio.onerror = () => { btnEl.textContent = '▶'; };
  audio.play();
}
```

### 6.4 Gender auto-detection

```js
async function inferGenderFromName(name, appearanceSheet, key) {
  const resp = await callGeminiAPI(['gemini-2.5-flash'], {
    contents: [{ parts: [{ text:
      `Given a character name and appearance description, return a single word: "male", "female", or "neutral".\n\n` +
      `Name: ${name}\nDescription: ${appearanceSheet || ''}\n\nAnswer:`
    }] }]
  }, key);
  const ans = resp.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();
  if (ans?.startsWith('male')) return 'male';
  if (ans?.startsWith('female')) return 'female';
  return 'neutral';
}
```

Cost: ~$0.0001 per character. Failure → `'neutral'`. Always editable.

### 6.5 Default voice assignment

```js
function assignDefaultVoice(item, gender) {
  const cfg = window.createJobState.voiceConfig?.defaultsByGender?.[gender]
    || { provider: 'gemini', voiceId: 'Kore', voiceName: 'Kore' };
  item.voice = { ...cfg, speakingRate: 1.0, pitch: 0 };
  item.gender = gender;
}
```

Run on character creation, on detect-from-script, on narrator init.

### 6.6 Project-level voice settings UI

```
┌─ Voice settings ─────────────────────────────────────────────────┐
│ Fallback voice: [Kore ▾] [▶]                                      │
│ ElevenLabs API key: [••••••••••••••••] [Test]   [Clear]           │
└──────────────────────────────────────────────────────────────────┘
```

ElevenLabs key shared with Scribe (existing). On set: fetch + cache `/v1/voices`. On clear: ElevenLabs voices removed from dropdowns, bound characters fall back to gender-default Gemini voice.

## 7. Storyboard agent extensions

### 7.1 Speaker-tag parsing — three patterns

**Pattern A (recommended)** — explicit `speaker:` prefix:
```
Maya: I can't believe you said that.
Joe: I had to.
```

Regex: `^([A-Z][A-Za-z0-9 _-]{0,30}):\s+(.+)$`. Speaker normalized for case-insensitive cast lookup.

**Pattern B** — bracket-tag inline narration:
```
[Maya] storms in. "I can't believe you said that."
[Joe] turns. "I had to."
```

Uses `castParseBracketTokens` + speech-verb regex (`says`, `said`, `replies`, `whispers`, `shouts`, `asks`).

**Pattern C** — agent inference (last-resort): marked `dialogue.confidence: 'inferred'`; user warned post-generation.

### 7.2 Storyboard agent prompt extension

Add to existing prompt (in [js/17c-create-pipeline.js](js/17c-create-pipeline.js) ~line 1171):

```
DIALOGUE PARSING:
For each segment, identify spoken dialogue (quoted strings, "speaker:" prefix,
or [character]+say-verb). Emit a "dialogue" object:
  {
    "speakerName": "Maya" | "narrator" | null,
    "text": "the spoken words only, no stage directions",
    "isVoiceOver": boolean
  }

If a segment has multiple speakers, SPLIT into multiple sub-segments.

FRAMING CLASSIFICATION:
Emit a "framing" enum per segment:
  - "frontal-close-up"      : speaker face fills frame, facing camera
  - "frontal-medium"        : speaker waist-up, facing camera
  - "three-quarter"         : ~30-45° off-axis, mouth visible
  - "over-shoulder-front"   : camera over listener's shoulder, speaker faces camera
  - "over-shoulder-back"    : camera behind speaker (back visible)
  - "profile"               : side profile
  - "back-of-head"          : entirely back to camera
  - "wide-establishing"     : full scene, characters small
  - "extreme-wide"          : aerial / landscape

SPEAKER VISIBILITY RULE:
speakerVisible=true ONLY when framing in
{frontal-close-up, frontal-medium, three-quarter, over-shoulder-front}.
Otherwise speakerVisible=false AND dialogue.isVoiceOver=true.

DIALOGUE PLACEMENT RULES (CRITICAL):
1. NEVER render speaking mouth on back-of-head, profile, or extreme-wide.
   Either reframe to frontal close-up, OR keep framing AND mark voice-over.
2. NEVER place two speakers in one frontal-close-up. Split into separate cuts.
3. Two-shot framing must use over-shoulder-front, not frontal-medium with both.
```

### 7.3 Cut-on-speaker enforcement

Client-side post-process guards against agent mistakes:

```js
function enforceSpeakerSplits(segments) {
  const out = [];
  for (const seg of segments) {
    if (!seg.dialogue || !seg.dialogue.speakerName) { out.push(seg); continue; }
    if (Array.isArray(seg.dialogue.turns) && seg.dialogue.turns.length > 1) {
      seg.dialogue.turns.forEach((turn) => {
        out.push({
          ...seg,
          dialogue: { speakerName: turn.speakerName, text: turn.text, isVoiceOver: false },
          framing: 'frontal-close-up',
          startMs: turn.startMs,
          endMs: turn.endMs,
        });
      });
    } else { out.push(seg); }
  }
  return out;
}
```

### 7.4 Voice-over detection

When framing makes mouth visibility impossible, the segment becomes voice-over:
- `dialogue.isVoiceOver: true`
- Lip sync stage skipped entirely
- TTS still runs with speaker's voice
- Scene continues to render with chosen framing

## 8. TTS pipeline rewrite — multi-voice generation

### 8.1 Today (single-voice)

```js
const ttsResult = await generateTTSGemini(ttsText, 'Kore', key);
```

### 8.2 New (multi-voice, per-line)

```js
async function generateMultiVoiceAudio(segments, characters, narrator, voiceConfig, geminiKey, elevenlabsKey) {
  const audioSegments = [];
  for (const seg of segments) {
    const speakerId = seg.dialogue?.speakerCharacterId;
    const speakerName = seg.dialogue?.speakerName;
    const voice = resolveVoiceForSpeaker(speakerId, speakerName, characters, narrator, voiceConfig);
    const text = seg.dialogue?.text || seg.text;
    const audio = await callTTSProvider(voice, text, geminiKey, elevenlabsKey);
    audioSegments.push({
      segmentIndex: seg.segmentIndex,
      speakerName: speakerName || 'narrator',
      speakerCharacterId: speakerId || 'narrator',
      voiceId: voice.voiceId,
      provider: voice.provider,
      audioBuffer: audio.buffer,
      durationMs: audio.durationMs,
    });
  }
  return audioSegments;
}

function resolveVoiceForSpeaker(speakerId, speakerName, characters, narrator, voiceConfig) {
  if (speakerId) {
    const char = characters.find(c => c.id === speakerId);
    if (char?.voice) return char.voice;
  }
  if (speakerName) {
    const lc = speakerName.toLowerCase();
    const char = characters.find(c => c.name?.toLowerCase() === lc);
    if (char?.voice) return char.voice;
    if (lc === 'narrator' && narrator?.voice) return narrator.voice;
  }
  if (narrator?.voice) return narrator.voice;
  return voiceConfig.fallbackVoice;
}
```

### 8.3 Per-line vs per-character batched

Per-line wins for v1. Higher fidelity, simpler, acceptable cost. ~60 calls for 30-scene short = free at Gemini scale, ~$3 ElevenLabs.

### 8.4 Per-scene audio assembly

```js
async function assembleSceneAudio(scene, audioSegments) {
  const sceneSegs = audioSegments.filter(a => a.sceneId === scene.id);
  const sampleRate = 24000;
  const totalSamples = Math.round(scene.durationMs * sampleRate / 1000);
  const buffer = audioContext.createBuffer(1, totalSamples, sampleRate);
  const channel = buffer.getChannelData(0);
  const turns = [];
  let cursorMs = 0;
  for (const seg of sceneSegs) {
    const startSample = Math.round(cursorMs * sampleRate / 1000);
    channel.set(seg.audioBuffer.getChannelData(0), startSample);
    turns.push({
      speakerCharacterId: seg.speakerCharacterId,
      voiceId: seg.voiceId,
      startMs: cursorMs,
      endMs: cursorMs + seg.durationMs,
      audioSegmentIdx: turns.length,
    });
    cursorMs += seg.durationMs + 200;   // 200ms cut-beat between speakers
  }
  scene.combinedAudio = buffer;
  scene.speakerTurns = turns;
  scene.dialogueLength = cursorMs;
  return buffer;
}
```

### 8.5 Scribe alignment refinement

After assembly, run Scribe per scene to refine `speakerTurns` boundaries from TTS-estimated to sample-accurate:

```js
const alignedWords = await alignWordsWithScribe(scene.combinedAudio, langCode);
for (const word of alignedWords) {
  const turn = scene.speakerTurns.find(t => word.start * 1000 >= t.startMs && word.end * 1000 <= t.endMs);
  if (turn) word.speakerId = turn.speakerCharacterId;
}
scene.alignedWords = alignedWords;
```

## 9. Framing → Kling i2v prompt

### 9.1 Prompt template by framing

```js
const FRAMING_PROMPTS = {
  'frontal-close-up':
    'Tight medium close-up. {speaker} faces the camera directly throughout the entire shot. ' +
    'Mouth clearly visible to camera at all times. Eye contact with camera. {speaker} is speaking — ' +
    'natural conversational mouth movement, lips opening and closing. No head turns away. No framing changes.',

  'frontal-medium':
    'Frontal medium shot, waist-up. {speaker} faces the camera, mouth visible. Speaking — natural mouth movement. ' +
    'Slight body shift allowed; head stays toward camera.',

  'three-quarter':
    '¾ angle medium shot. {speaker} angled approximately 30° off-axis, mouth still clearly visible to camera. ' +
    'Speaking — mouth opens and closes naturally. Head stays at this angle; no full turn away.',

  'over-shoulder-front':
    'Over-the-shoulder shot from {listener}\'s perspective looking at {speaker}. {speaker} faces the camera, ' +
    'mouth visible past listener\'s shoulder. {listener} is in soft foreground, not speaking.',

  'over-shoulder-back':
    'Over-the-shoulder shot from behind {speaker}. Back/side of head visible, looking at the scene beyond. ' +
    'NO mouth animation; treat as voice-over.',

  'profile':
    'Side profile of {speaker}. Mouth partially visible. NO mouth animation — voice-over framing.',

  'back-of-head':
    'Camera behind {speaker}; only back of head visible. Voice-over framing — no mouth animation.',

  'wide-establishing':
    'Wide establishing shot of the scene. Characters small in frame. Voice-over framing.',

  'extreme-wide':
    'Extreme wide / aerial / landscape. Characters tiny or absent.',
};
```

### 9.2 Why this matters

Framing decided at storyboard time, honored at Kling time. Eliminates "back-of-head talking" failure mode. Voice-over framings skip lip sync entirely — voice plays as narration over Kling's chosen visuals.

## 10. Lip sync — the two tiers

### 10.1 Tier 1 — "Stori sync" (default, free)

**Pipeline:**

```
Input:
  - scene_clip.mp4 (Kling output)
  - scene combined audio
  - speakerTurns metadata
  - speaker character IDs and bible cell refs

Steps:
  1. For each frame: MediaPipe Face Mesh → 478 landmarks per face
     - Compute head pose (yaw, pitch, roll) via PnP solve
     - Compute mouth bbox from lip landmarks (61, 291, etc.)
     - Mouth-visible bool: yaw < 25° AND mouth landmarks have non-zero area
  2. Identity-match each detected face to a known character:
     - Storyboard position prior ("Maya is on the left")
     - Optional: CLIP embedding match against bible cell portrait
  3. For each speaker turn:
     - Lookup speaker's matched face
     - For each frame in the turn's window:
       * If face visible AND mouth-visible: paint mouth sprite
       * Else: skip (Kling motion shows through)
  4. Drive sprite openness from audio amplitude:
     - Web Audio AnalyserNode, 30Hz envelope
     - Map amplitude → sprite frame: closed (<0.2), half (0.2-0.6), open (>0.6)
  5. Composite sprites via ffmpeg overlay (server) OR canvas at MediaRecorder tick (client)

Output:
  - synced_clip.mp4 with mouth animation overlaid on detected speaker face
  - per-frame overlay JSON (cached for re-render without re-detection)
```

**Mouth sprites** — generated once per character per template via Gemini single-image edits:

```js
async function generateMouthSpritesForCharacter(character, template, geminiKey) {
  const portrait = character.representativeImageDataUrl;
  const variants = [
    { suffix: 'closed', prompt: 'Same character, lips closed neutrally. No teeth. Same head angle, same lighting.' },
    { suffix: 'half',   prompt: 'Same character, lips slightly parted, mid-position.' },
    { suffix: 'open',   prompt: 'Same character, mouth open as if speaking. Some teeth visible.' },
  ];
  const sprites = {};
  for (const v of variants) {
    const cellPrompt = `${castStylePrefix()}. ${v.prompt}`;
    const dataUrl = await generateImageGeminiFlash(cellPrompt, geminiKey, {
      width: 768, height: 768,
      refParts: [{ inlineData: { mimeType: 'image/png', data: extractBase64(portrait) } }],
    });
    sprites[v.suffix] = dataUrl;
  }
  for (const k in sprites) await castIdb.put(`mouthsprite_${character.id}_${template.id}_${k}`, sprites[k]);
  return sprites;
}
```

Cost: ~$0.039 × 3 = ~$0.12 per character per template. Lazy on first dialogue scene. One-time per project.

**Sprite compositing per frame:**

```js
function compositeMouthSpriteOnFrame(ctx, frameTime, scene, speakerTurn, sprites, faceData) {
  const localT = frameTime - speakerTurn.startMs;
  const amplitude = sampleAudioAmplitude(scene.combinedAudio, frameTime / 1000);
  const spriteKey = amplitude < 0.2 ? 'closed' : amplitude < 0.6 ? 'half' : 'open';
  const sprite = sprites[spriteKey];
  const { mouthCenter, mouthSize, headYaw } = faceData;
  if (Math.abs(headYaw) > 25 || !mouthSize) return;
  const sx = mouthCenter.x - mouthSize.w * 1.2;
  const sy = mouthCenter.y - mouthSize.h * 1.2;
  ctx.drawImage(sprite, sx, sy, mouthSize.w * 2.4, mouthSize.h * 2.4);
}
```

Integrated into [js/11-export.js](js/11-export.js) export pipeline.

**Server vs client:**
- v1 (today): browser MediaPipe via WASM
- v1.5 (server-side migration): Python `mediapipe` in Cloudflare Container, overlay JSON in R2

### 10.2 Tier 2 — "AI sync" (Kling LipSync via fal.ai)

**Pipeline:**

```
Input:
  - scene_clip.mp4 (Kling output, R2 URL)
  - scene combined audio (R2 URL)

Steps:
  1. POST fal-ai/kling-video/lipsync/audio-to-video
     Body: { video_url, audio_url }
     Constraints: video 2-10s 720p-1080p, audio MP3/WAV ≤5MB, ≤60s
  2. Poll for completion (~10-30s)
  3. Download synced video
  4. Upload to R2: projects/{id}/clips/{id}/synced.mp4
  5. Mark scene.lipSync = { tier: 'kling', status: 'ready', syncedClipUrl: '...' }

Cost: ~$0.014/sec, billed in 5-sec increments → $0.07 minimum.
```

**Skip conditions:**
- Scene has no dialogue OR `dialogue.isVoiceOver === true`
- Framing not in `{frontal-*, three-quarter, over-shoulder-front}`
- Clip > 10s → split into ≤10s chunks
- Stylized template + user hasn't opted into "force AI sync on stylized"

**Fallback when Kling LipSync errors:**
1. Retry once with backoff
2. Silent fall-back to Tier 1 for this clip; per-scene warning surfaced
3. No charge for failed Tier 2; standard charge for Tier 1 fallback

### 10.3 Tier selection UX

```
┌─ Lip sync ───────────────────────────────────────────────────────┐
│ Quality:                                                          │
│   ● Stori sync (default — free, works on every template)          │
│   ○ AI sync   (~$0.07-0.30 per dialogue scene, photoreal best)    │
│                                                                    │
│ Estimated extra cost for current project: $0.67                   │
│ (12 dialogue scenes × ~4s avg × $0.014/s)                         │
└───────────────────────────────────────────────────────────────────┘
```

Soft warning if any stylized-template scene + Tier 2. Tier toggle sticky per-project; flip re-runs sync on flip with cost adjustment.

### 10.4 Per-scene tier override (canvas correction flow)

**Critical for filmmaker workflows.** Project-level tier is the default; per-scene override lets users fix individual scenes without re-running the whole project.

**Use case:** project on Tier 1 (free). User reviews export, finds scene 4's mouth is mistimed (MediaPipe identity mismatch, low confidence on stylized template, etc.). User wants to fix just scene 4 without flipping the whole project to Tier 2.

**Per-scene UI on canvas dialogue scene nodes (and Step 7 scene cards):**

```
┌─ Scene 4 · 0:08 · Maya speaking ─────────────┐
│ [video preview]                               │
│                                               │
│ 🎙️ Maya · Aoede   [Edit voice in cast]        │   ← read-only voice display
│                                               │
│ Lip sync: ● Stori sync (current, free)        │
│           ○ AI sync ($0.07)                   │   ← editable per-scene
│           ○ Voice-over (no animation, free)   │
│                                               │
│ [↻ Re-sync this clip]                         │
└───────────────────────────────────────────────┘
```

Three controls:

- **Voice display (read-only)** — shows whose voice plays in this scene. "Edit voice in cast" deep-links to cast panel for that character (voice is identity, not output, so editing happens in cast — see Decision Log).
- **Per-scene tier radio** — three options. Defaults to project setting. Editable freely.
- **Re-sync button** — re-runs current tier on this scene (free for Tier 1, charges for Tier 2). Useful when audio changed, prompt edited, or sprite drift detected. Always available.

**Behavior on tier flip per scene:**

```
Tier 1 → Tier 2 (upgrade):
  1. Confirm dialog: "Re-sync scene 4 with AI sync? Cost: $0.07"
  2. On confirm: queue Kling LipSync call for scene 4 only
  3. ~10-30s later: synced clip replaces raw Kling output in R2/IDB
  4. scene.lipSync.tier = 'kling', costCharged += $0.07
  5. Editor preview swaps to synced clip
  6. Other scenes untouched

Tier 2 → Tier 1 (downgrade):
  1. Confirm dialog: "Re-sync scene 4 with Stori sync? (Free; refund $0.07)"
  2. On confirm: run MediaPipe + sprite overlay on scene 4
  3. scene.lipSync.tier = 'stori', costRefunded += $0.07 (if within refund window)
  4. Editor preview swaps to flap-synced clip

Tier 1 or Tier 2 → Voice-over:
  1. No confirm needed (free, reversible)
  2. scene.lipSync.tier = 'none'
  3. Mouth animation suppressed; audio plays over raw Kling clip
  4. dialogue.isVoiceOver = true (manually set, overrides framing-derived value)

Re-sync (same tier):
  1. Confirm dialog showing cost (free for Tier 1, $0.07 for Tier 2)
  2. Re-runs current tier's pipeline on this scene
  3. Replaces synced clip / overlay JSON
```

**Multi-select correction:**

User can select multiple dialogue scene nodes in the canvas (existing multi-select mechanism), open the lip-sync chip on the selection, and apply the tier flip to all selected at once. Cost preview sums across the selection. One bulk operation, one cost confirmation.

**Cost surfacing in credit ledger:**

```
Scene generation (12 scenes)              $1.56
Voice generation (60 lines, Gemini TTS)   $0.00
Lip sync (Tier 1, project default)        $0.12   (mouth sprites)
Lip sync corrections:
  Scene 4 → AI sync                       $0.07
  Scene 11 → AI sync                      $0.07
  Scene 23 → AI sync                      $0.07
Total                                     $1.89
```

User sees exactly what they paid for. Per-scene corrections are itemized so a user can see "I spent $0.21 fixing 3 scenes" rather than the cost being buried in a project-wide tier flip.

### 10.5 Manual voice-over override

The plan's `dialogue.isVoiceOver` is currently derived only from framing (back-of-head, profile, wide → automatic voice-over). Extend it to support **manual user-set value** as the third option in the per-scene tier radio (§10.4).

**When useful:**
- Both Tier 1 and Tier 2 produce bad output on a scene (rare but real on heavy stylization)
- User wants intentional voice-over for cinematic effect (internal monologue, contemplative beat) on a scene that the agent classified as frontal
- Mouth animation distracts from the visual moment

**Implementation:** add `scene.lipSync.userOverrideVoiceOver: bool` field, separate from `dialogue.isVoiceOver` (framing-derived). Both contribute to the runtime decision: lip sync skipped if either is true. User override is sticky across regenerations of the same scene's clip.

### 10.6 Provider abstraction

```js
const lipSyncProviders = {
  'stori-flap':    { sync: storiFlapSync },
  'kling-lipsync': { sync: klingLipSyncFal },
  // future: 'sync-so', 'hedra', 'self-hosted-wav2lip'
};

async function syncSceneClip(scene, tier) {
  const provider = lipSyncProviders[tier === 'kling' ? 'kling-lipsync' : 'stori-flap'];
  return await provider.sync(scene);
}
```

Each provider returns `{ tier, status, syncedClipUrl?, overlayInstructions?, costCharged }`. Mux is provider-agnostic.

## 11. ElevenLabs integration

### 11.1 Catalog fetch

```js
async function elevenlabsFetchVoices(apiKey) {
  const resp = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  });
  if (!resp.ok) throw new Error(`ElevenLabs voices fetch failed: ${resp.status}`);
  const data = await resp.json();
  return data.voices.map(v => ({
    id: v.voice_id,
    name: v.name,
    gender: v.labels?.gender || 'neutral',
    tag: v.labels?.description || v.labels?.accent || '',
    previewUrl: v.preview_url,
  }));
}
```

Cache result in `window.VOICE_CATALOG.elevenlabs` and IDB.

### 11.2 ElevenLabs TTS call

```js
async function generateTTSElevenLabs(text, voiceId, apiKey) {
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
    }),
  });
  if (!resp.ok) throw new Error(`ElevenLabs TTS failed: ${resp.status} ${await resp.text()}`);
  const arrayBuffer = await resp.arrayBuffer();
  const audioCtx = new AudioContext();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  return { buffer: audioBuffer, durationMs: audioBuffer.duration * 1000 };
}
```

### 11.3 Sample playback (ElevenLabs)

Prefer `previewUrl` from `/v1/voices`. Fall back to live TTS:

```js
async function elevenlabsGenerateSample(voiceId) {
  const voice = window.VOICE_CATALOG.elevenlabs.find(v => v.id === voiceId);
  if (voice?.previewUrl) {
    const resp = await fetch(voice.previewUrl);
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  }
  const sample = await generateTTSElevenLabs(`Hello, I'm ${voice?.name || 'this voice'}.`, voiceId, getElevenLabsKey());
  return audioBufferToBlobUrl(sample.buffer);
}
```

### 11.4 Cost tracking

```js
function trackElevenLabsCost(text) {
  const chars = (text || '').length;
  const usd = (chars / 1000) * 0.30;
  if (typeof trackCost === 'function') trackCost('elevenlabsTts', usd);
}
```

### 11.5 Same key as Scribe

Single ElevenLabs subscription, single key entry. Reused across Scribe alignment + voice TTS.

## 12. Cost surface

Per-character one-time:

| Operation | Cost |
|---|---:|
| Gender inference (Gemini) | ~$0.0001 |
| Voice sample (Gemini, first play) | ~free |
| Voice sample (ElevenLabs, first play) | ~$0.001 |
| Mouth sprites (3 × $0.039) | ~$0.12 |

Per-line:

| Operation | Cost |
|---|---:|
| Gemini TTS per line (200 chars) | ~free |
| ElevenLabs TTS per line (200 chars) | ~$0.06 |

Per-scene:

| Operation | Cost |
|---|---:|
| Tier 1 — MediaPipe + sprite overlay | ~$0 (CPU) |
| Tier 2 — Kling LipSync (4s clip via fal.ai) | ~$0.07 |
| Tier 2 — Kling LipSync (10s clip via fal.ai) | ~$0.14 |

30-scene short film, 12 dialogue × 4s = 48s dialogue:

| Configuration | Voice | Lip-sync | Total | vs. baseline |
|---|---:|---:|---:|---:|
| Gemini + Stori sync | ~$0.001 | ~$0.12 | ~$2.72 | +5% |
| ElevenLabs + Stori sync | ~$3.60 | ~$0.12 | ~$6.32 | +143% |
| Gemini + Kling LipSync | ~$0.001 | ~$0.67 | ~$3.27 | +26% |
| ElevenLabs + Kling LipSync | ~$3.60 | ~$0.67 | ~$6.87 | +163% |

ElevenLabs is the cost driver, not lip sync.

## 13. Implementation order

10 phases.

| Phase | What | Files | Risk |
|---|---|---|---|
| 1. Voice schema + cast UI | `gender`, `voice` fields; cast row UI; gender + voice dropdowns + sample button; auto-defaults | js/17b, css/styles | low |
| 2. Voice catalog + sample playback | `VOICE_CATALOG.gemini`; `castPlayVoiceSample`; IDB cache; single-audible | js/17b, js/17a | low |
| 3. ElevenLabs integration | BYOK key entry; `/v1/voices` fetch; catalog merge; provider toggle; TTS helper | js/17a, js/17b | medium |
| 4. Storyboard agent — speaker tags + framing | Prompt extension; `dialogue` + `framing` fields; cut-on-speaker post-process | js/17c | medium |
| 5. Multi-voice TTS pipeline | `generateMultiVoiceAudio` per-line; per-scene assembly; speaker-turn metadata; Scribe refinement | js/17c | medium |
| 6. Framing → Kling prompt mapping | `FRAMING_PROMPTS`; `buildSceneMotionPrompt`; voice-over routing | js/17c, js/21 | low |
| 7. Tier 1 lip sync (Stori flap) | Browser MediaPipe; mouth sprites; speaker-turn → frame mapping; sprite overlay in export tick | js/11, js/17c, new js/30-lipsync.js | high |
| 8. Tier 2 lip sync (Kling LipSync) | fal.ai integration; provider abstraction; per-clip POST + poll + R2 upload; tier toggle UI; fallback | js/17c, js/30-lipsync.js | medium |
| 9. Server migration of Tier 1 | MediaPipe in Cloudflare Container; R2 storage; overlay JSON contract | server/lipsync-worker | high (depends on server-pipeline) |
| 10. Voice indicator on canvas | Read-only voice chip on dialogue scene nodes; deep-link to cast for editing | js/29 | low |

Total: ~2500-3000 lines across ~12 files. ~4-5 days uninterrupted.

## 14. Edge cases register

50 numbered cases, grouped by stage.

### Voice / cast definition

| ID | Edge case | Behavior |
|---|---|---|
| EC-V01 | New character, no voice bound | Auto-assign by gender; default Kore if unclear. |
| EC-V02 | Gender inference fails | Default `'neutral'` → Kore. |
| EC-V03 | ElevenLabs voice picked without key | Option disabled in dropdown with hint. |
| EC-V04 | ElevenLabs key cleared, characters bound | One-time warning; auto-fall-back to gender-default Gemini. |
| EC-V05 | Same voice for two characters | Allowed; warning surfaced. |
| EC-V06 | Voice dropdown opened during sample playback | Stops current sample. |
| EC-V07 | Sample playback fails (network) | Button reverts; error toast; non-blocking. |
| EC-V08 | ElevenLabs `/v1/voices` empty | Provider toggle disabled with hint. |
| EC-V09 | Character renamed after voice locked | Voice binding stays. |
| EC-V10 | Character deleted | Voice binding lost; references fall back to narrator. |

### Storyboard / dialogue parsing

| ID | Edge case | Behavior |
|---|---|---|
| EC-D01 | `Maya:` prefix but Maya not in cast | Auto-create Maya as draft with default voice; warn user. |
| EC-D02 | Speaker prefix matches multiple cast (case mismatch) | Match case-insensitive; first wins; warning if ambiguous. |
| EC-D03 | Dialogue but no speaker tag | Fall back to narrator; mark `confidence: 'inferred'` when applicable. |
| EC-D04 | Alternating speakers in one segment | Agent splits; client-side post-process enforces. |
| EC-D05 | Three+ speakers in rapid exchange | Each gets single-character close-up cut. |
| EC-D06 | Speaker tag with punctuation/unicode | Regex tolerates; fall back to narrator if unparseable. |
| EC-D07 | Narration interspersed with dialogue | Narration → narrator voice + non-speaker framings; dialogue → speaker close-ups. |
| EC-D08 | Agent emits back-of-head + isVoiceOver=false | Client validator overrides isVoiceOver=true. |
| EC-D09 | Frontal close-up for narrator-only segment | Allowed; talking-head narrator on camera. |
| EC-D10 | User edits speaker tag after storyboard run | Affects next regen only; existing audio bound to old speaker. |

### TTS / audio assembly

| ID | Edge case | Behavior |
|---|---|---|
| EC-T01 | Per-line TTS fails mid-batch | Retry once with backoff; if still failing, placeholder; user retries from editor. |
| EC-T02 | ElevenLabs rate limit | Queue with backoff; surface progress hint. |
| EC-T03 | Two consecutive lines from same speaker | Concat without cut-beat; merge speakerTurns. |
| EC-T04 | Per-line audio exceeds scene allocated time | Compress speaking rate within 0.85-1.15; if still over, extend scene 20% with confirm. |
| EC-T05 | ElevenLabs returns wrong sample rate | Resample to 24kHz on client. |
| EC-T06 | Gemini TTS returns NULL audio | Retry with simplified text; if still NULL, silent placeholder + warning. |
| EC-T07 | Scribe alignment fails | Use TTS-reported durations as `speakerTurns` boundaries. |
| EC-T08 | User regenerates one character's voice mid-project | Re-TTS that character's lines; mark affected scenes audioStale. |
| EC-T09 | Mid-flight TTS interrupted (refresh) | On reload: detect partial; re-run only missing lines. |
| EC-T10 | Audio assembly > 5MB (Kling LipSync limit) | Split scene into multiple sync calls. |

### Lip sync — Tier 1

| ID | Edge case | Behavior |
|---|---|---|
| EC-S01 | MediaPipe finds no faces | Skip overlay; voice-over fallback. |
| EC-S02 | Multiple faces, identity ambiguous | Use storyboard position prior; if still ambiguous, skip overlay. |
| EC-S03 | Speaker face yaw > 25° throughout turn | Skip overlay; voice-over fallback. |
| EC-S04 | Face exits frame mid-turn | Skip frames where face absent; resume on return. |
| EC-S05 | Mouth sprites not generated | Lazy-generate at first dialogue scene; cache. |
| EC-S06 | Mouth sprite generation fails | Use generic SVG oval as fallback; warn user. |
| EC-S07 | Stylized template — MediaPipe low confidence | Fall back to Gemini Vision query; cache. |
| EC-S08 | Audio amplitude analysis fails | Use estimated phoneme cadence (3 Hz). |
| EC-S09 | Two characters in frame, one speaking | Detect both; only animate speaker via speakerTurn matching. |
| EC-S10 | Server MediaPipe worker crashes mid-clip | Retry on fresh worker; fall back to client / skip. |

### Lip sync — Tier 2

| ID | Edge case | Behavior |
|---|---|---|
| EC-K01 | Kling LipSync rate-limited | Queue with backoff up to 3 retries; fall back to Tier 1. |
| EC-K02 | Clip > 10s | Pre-split into ≤10s; lip-sync each; concat at mux. |
| EC-K03 | Audio > 5MB | Re-encode lower bitrate; if still over, split. |
| EC-K04 | Returns wrong duration | Fall back to Tier 1; flag as "AI sync mismatched". |
| EC-K05 | Tier flip mid-project | Re-run lip-sync on all dialogue scenes; cost adjusted; old sprites cleaned. |
| EC-K06 | Stylized template + Tier 2 selected | Pre-flight warning; allow override. |
| EC-K07 | Tier 2 enabled, no dialogue | No-op; no charges. |
| EC-K08 | Voice-over scene routed to Tier 2 by mistake | Server validator catches isVoiceOver=true; skips. |
| EC-K09 | fal.ai endpoint deprecation | Log; ops rotates URL via config. |
| EC-K10 | R2 upload network failure | Retry; if persistent, leave status='error', raw clip usable. |

### Tier interaction

| ID | Edge case | Behavior |
|---|---|---|
| EC-X01 | Project mixes photoreal + stylized templates | Per-scene tier eval: photoreal → Tier 2, stylized → Tier 1, all in one project. |
| EC-X02 | Scene prompt edited after lip sync | `lipSync.status='stale'`; per-scene re-sync affordance. |
| EC-X03 | Character voice edited after lip sync | Featuring scenes audioStale; lip sync auto-stale. |
| EC-X04 | Tier change mid-project | Re-run on all dialogue scenes; refund unused Tier 2; see EC-K05. |
| EC-X05 | Final mux with mixed tier results | Mux uses each scene's `syncedClipUrl` if present, else raw Kling. |
| EC-X06 | Cost preview drift > 5% from actual | Telemetry alert. |
| EC-X07 | Per-scene tier override (Tier 1 → Tier 2) on a single scene | Only that scene re-runs; cost charged only for that scene; project default unchanged; other scenes untouched. |
| EC-X08 | Per-scene tier override (Tier 2 → Tier 1) on a single scene | Only that scene re-runs; Tier 2 charge refunded for that scene (within refund window); project default unchanged. |
| EC-X09 | User overrides framing-derived voice-over to enable Tier 2 | Pre-flight warning ("framing may not support good lip sync"); allow override; surface result quality warning if Kling LipSync confidence is low. |
| EC-X10 | Per-scene override conflicts with later project-level tier flip | Modal: "Apply project-wide change to all scenes including overrides?" with options [Apply to all] [Keep my per-scene overrides] [Cancel]. |
| EC-X11 | Multi-select scene tier flip in canvas | Cost preview sums across selection; one confirmation; per-scene re-runs queued in parallel respecting fal.ai rate limit. |
| EC-X12 | User flips a scene to voice-over manually | `scene.lipSync.userOverrideVoiceOver = true`; mouth animation suppressed; sticky across regen of same scene's clip; can be cleared by selecting a tier again. |

## 15. Telemetry

```js
{
  // Voice
  charactersWithCustomVoice, charactersUsingDefault,
  voiceProviderMix: { gemini, elevenlabs },
  voiceSamplesPlayed, genderInferenceFailures,
  elevenlabsKeyChangesMidProject,

  // Storyboard
  dialogueLinesParsed,
  dialogueParsePattern: { 'speaker-prefix', 'bracket-inline', 'inferred' },
  cutOnSpeakerSplits, voiceOverFallbacks,
  framingMix: { 'frontal-close-up', 'three-quarter', ... },

  // TTS
  ttsCallsTotal, ttsCallsByProvider: { gemini, elevenlabs },
  ttsCharCount, ttsCostUsd,
  scribeAlignmentSuccess, scribeAlignmentFallback,

  // Lip sync
  lipSyncTier, scenesEligibleForSync, scenesSynced, scenesVoiceOverFallback,
  faceDetectionFailures, identityMatchFailures,
  klingLipsyncCalls, klingLipsyncFailures, klingLipsyncFallbackToTier1,
  totalLipSyncCostUsd, mouthSpriteGenCount,
}
```

## 16. Risks + open questions

### Risks

1. **Per-line TTS volume.** 60-line short = 60 calls. Latency stacks (~500ms Gemini, ~1-2s ElevenLabs). Total: 30-120s wall clock. Mitigate via 5-10 concurrent calls. Worst case 2min wait.

2. **Stylized template lip-sync quality.** Kling LipSync is photoreal-biased. MediaPipe often fails on heavy stylization. Mitigation: Gemini Vision fallback. Real risk: heavy anime / abstract may have no working path.

3. **Voice-over fallback frequency.** If agent over-uses voice-over framings, "telling not showing" feel. Mitigation: prompt rule "prefer frontal close-ups for emotionally important beats."

4. **Voice + bible interaction.** Both unlock independently. Voice change doesn't invalidate bible cells; bible regen doesn't invalidate voice.

5. **Mouth sprite drift.** 3 sprites generated once. If bible regenerated (style change), sprites become inconsistent. Mitigation: regen sprites alongside bible regen.

6. **ElevenLabs cost runaway.** Per-line ElevenLabs adds up. Surface cost preview in cast UI before user locks ElevenLabs voices.

7. **Multi-tab edits.** Race conditions on TTS regen. Mitigated by single-tab convention + autosave timestamps.

### Open questions for v2+

1. Voice cloning from user upload (ElevenLabs supports). UX + ToS guardrails.
2. Two-shot lip sync via Kling `lipsync-pro` multi-face (~3x cost).
3. Per-scene voice override (whisper in scene 4 only).
4. Voice direction cues (`(whispered)`, `(angry)`) → SSML / voice settings.
5. Real-time voice preview in editor.
6. Multi-language voice fidelity (ElevenLabs multilingual handles; Gemini English-leaning).
7. Cross-project voice library (pairs with cross-project bible inheritance).
8. Lip sync as finishing pass (Tier 1 during iteration, Tier 2 only at final export).

## 17. Decision log

| Decision | Choice | Rationale |
|---|---|---|
| Where does voice picking live? | Cast definition panel (top-down) | Voice is identity, not output; pairs with name + appearance. |
| Default voice when not specified? | Auto-assign by gender; user-editable | Zero-friction onboarding. |
| Gender values? | male / female / neutral | Three buckets cover all voice catalogs. |
| TTS provider mix? | Allow per-character mix (Gemini + ElevenLabs in one project) | Power-user flexibility; cost surfaced. |
| Per-line vs batched TTS? | Per-line | Precise speaker-turn timing; cost acceptable. |
| Speaker-tag parsing? | `speaker:` primary, `[bracket]` fallback, agent-inferred last | Three patterns cover screenplay, prose, free-form. |
| Cut-on-speaker enforcement? | Universal (both tiers) | Simplifies lip sync; matches real production grammar. |
| Lip-sync tiers? | Two (Stori sync, Kling LipSync via fal.ai) | Free baseline + paid premium. Sync.so deferred (too expensive). |
| Tier selection UX? | Project-level toggle; default Tier 1 | One mental model per project. |
| Tier 2 fallback? | Silent fall-back to Tier 1 with per-scene warning | No hard failures. |
| Voice-over framing → lip sync? | Skipped entirely | Cinematically valid. |
| Mouth sprite generation? | Lazy at first dialogue scene; cached | No cost for narration-only projects. |
| Voice on canvas? | Read-only; deep-link to cast for editing | No duplicate edit affordances. |
| ElevenLabs key sharing? | Same key as Scribe | One subscription, one BYOK. |
| Bible vs voice independence? | Independent unlocks | Visual and audio identity orthogonal. |

## 18. Acceptance criteria

The plan is complete when:

- [ ] User can pick gender + voice for every character in cast panel with sample playback.
- [ ] Sample playback uses single-button play/pause, only one audible at a time.
- [ ] Auto-default voice by gender at character creation, editable anytime.
- [ ] ElevenLabs voices appear when key configured, disappear when cleared.
- [ ] Storyboard agent parses `speaker:` prefix in 95%+ well-formed scripts.
- [ ] Storyboard agent emits `framing` enum every segment.
- [ ] Voice-over framings auto-set `dialogue.isVoiceOver: true`.
- [ ] Cut-on-speaker enforced: no clip has two speakers in frame.
- [ ] Multi-voice TTS generates per-line audio with right voice.
- [ ] Per-scene audio assembly preserves speaker-turn timing within ±50ms of TTS-reported durations.
- [ ] Scribe refines speaker-turn boundaries when available.
- [ ] Tier 1 animates the right character's mouth on the right line in 90%+ of frontal close-ups.
- [ ] Tier 2 produces synced clips within 60s p95 per scene.
- [ ] Tier 2 fallback to Tier 1 works correctly on errors.
- [ ] Cost preview matches actual within 5%.
- [ ] Voice change marks affected scenes audio-stale.
- [ ] All 50 edge cases have explicit handlers.
- [ ] Telemetry captures all 23 fields.

When all criteria pass, Stori positions as a serious filmmaking tool with multi-character dialogue, per-character voices, and cinematically-correct lip sync at two quality tiers.

---

## 19. Theming — Aurora dark + light compliance

All new UI from this plan **must** render correctly in both Aurora dark and Aurora light themes, with no hardcoded colors except for vendor-required values (e.g., status icons that map to fixed semantic colors). This section is non-negotiable: theme-broken UI breaks the bar Stori is positioning for.

### 19.1 Theme tokens to use

Tokens live in [css/themes.css](css/themes.css) and auto-swap based on `html[data-theme="light"]`/`dark`. Always use these via `var(--token-name, fallback)`.

**Surface / structure:**
- `var(--bg-primary, var(--lp-bg))` — outermost background
- `var(--bg-elevated, var(--lp-bg2))` — raised panels (cast panel, chrome node body)
- `var(--bg-card, var(--lp-card))` — card surfaces (each cast row, dialogue scene chip)
- `var(--border, var(--lp-card-bdr))` — borders, dividers
- `var(--accent, var(--lp-accent))` — Stori brand cyan; selection rings, hover, active state
- `var(--accent2, var(--lp-accent2))` — secondary accent for variant emphasis if needed

**Text:**
- `var(--text, var(--lp-text))` — primary copy
- `var(--text-secondary, var(--lp-dim))` — secondary copy
- `var(--text-muted, var(--lp-faint))` — captions, meta, placeholder

**Semantic (status):**
- `var(--green)` + `var(--green-soft)` — ready / success states (e.g., "✓ Ready" on lip-sync chip, voice locked)
- `var(--red)` + `var(--red-soft)` — error / failed states (e.g., "Tier 2 failed", "TTS error")
- `var(--amber)` + `var(--amber-soft)` — stale / warning states (e.g., "audio stale", "framing mismatch")

These semantic tokens have built-in dark/light variants at [css/themes.css:69-75](css/themes.css#L69-L75) and [css/styles.css:14-19](css/styles.css#L14-L19) — they swap automatically.

### 19.2 Fonts

- **Body / labels / buttons:** `font-family: inherit;` — picks up Poppins from `body`. Never hardcode `'Poppins'` in component CSS.
- **Code / error / monospace blocks:** `font-family: 'SF Mono', 'Fira Code', monospace;` — matches the rest of the app's mono usage.
- **Voice sample text in TTS calls:** plain text, no font concern; the audio is what matters.

### 19.3 Component theming requirements

Per UI element added in this plan:

**Cast row voice strip** (§6.1):
- Gender dropdown, voice dropdown: native `<select>` styled with `background: var(--bg-card); color: var(--text); border: 1px solid var(--border);`
- Play/pause button: matches existing cast row buttons. Background `color-mix(in oklch, var(--bg-elevated) 75%, transparent)`, hover → `border-color: var(--accent); color: var(--accent);`
- During playback (⏸ state): button gets `color: var(--accent)` to indicate active state
- Provider toggle pill (Gemini / ElevenLabs): pill-shaped buttons; active pill = `background: var(--accent); color: var(--bg-primary);`, inactive = `background: var(--bg-card); color: var(--text-secondary);`

**Project-level voice settings panel** (§6.6):
- Card uses `background: var(--bg-card); border: 1px solid var(--border);`
- ElevenLabs key input: existing BYOK key input styles; no new theming needed
- "Test" / "Clear" buttons: same as cast row buttons

**Project-level lip sync toggle** (§10.3):
- Radio group inside an Aurora card
- Active radio dot: `background: var(--accent);` outer ring `border: 2px solid var(--accent);`
- Estimated cost line: `color: var(--text-secondary);`

**Per-scene lip sync chip on canvas** (§10.4):
- Chip background: `var(--bg-card)`; border: `1px solid var(--border)`
- Voice display row (read-only): `color: var(--text);` icon emoji standard; "Edit voice in cast" link styled with `color: var(--accent);` hover underline
- Tier radio (3 options): same theming as project-level radio
- Re-sync button: same theming as cast row buttons
- Stale state badge: `background: var(--amber-soft); color: var(--amber);`
- Failed state badge: `background: var(--red-soft); color: var(--red);`
- Ready state badge: `background: var(--green-soft); color: var(--green);`

**Storyboard agent task lines** (during voice generation, lip sync, etc.):
- Reuse existing agent-task styles (already theme-compliant from prior work)
- New task IDs: `'voice-tts'`, `'voice-assembly'`, `'lipsync-tier1'`, `'lipsync-tier2'`
- Status colors: running = `var(--sock-script)` (existing yellow), done = `var(--green)`, error = `var(--red)`

**Mouth sprites preview (if/when shown to user):**
- Sprite thumbnails inside an Aurora card, similar to bible cell thumbs
- Empty placeholder: `background: color-mix(in oklch, var(--text) 6%, transparent);`

### 19.4 Forbidden patterns

These are mistakes that broke the bible chrome node initially. Do not repeat them.

- ❌ Hardcoded hex colors for status (`#16a34a`, `#dc2626`, `#d97706`) — use semantic tokens instead.
- ❌ Hardcoded `#fff` text on light/translucent backgrounds — use `var(--text)` so it inverts in light theme.
- ❌ Solid black overlays (`rgba(0,0,0,0.65)`) without a theme-aware fallback — use `color-mix(in oklch, var(--bg-elevated) 75%, transparent)` instead.
- ❌ Fixed monospace fallback (`var(--font-mono, monospace)`) — that token doesn't exist in this app; use `'SF Mono', 'Fira Code', monospace` directly.
- ❌ Missing `font-family: inherit` on buttons/inputs inside Aurora cards — they'd revert to system default and look off.
- ❌ Hardcoded backgrounds like `rgba(127,127,127,0.08)` — use `color-mix(in oklch, var(--text) 6%, transparent)` so the contrast holds in both modes.

### 19.5 Light-mode-specific gotchas

Aurora light has higher background luminance than dark. Three things that look fine in dark but break in light unless handled:

- **White text** — invisible on light cards. Always use `var(--text)`.
- **Drop shadows on dark elements** — disappear on light backgrounds. Use `box-shadow` with theme-aware opacity: `0 2px 8px color-mix(in oklch, var(--text) 12%, transparent);`
- **Translucent backdrops on overlay buttons** — the `rgba(0,0,0,0.65)` pattern produces unreadable text in light mode. Always use `color-mix` against `--bg-elevated`.

### 19.6 Acceptance check (theming)

For every new UI element added in this plan, the implementer must verify:

- [ ] Renders correctly in `html[data-theme="dark"]`
- [ ] Renders correctly in `html[data-theme="light"]`
- [ ] No hardcoded hex colors in component CSS (vendor logos / status icons exempt)
- [ ] Body/buttons use `font-family: inherit` (Poppins picked up from `body`)
- [ ] Mono blocks use `'SF Mono', 'Fira Code', monospace`
- [ ] Status states use semantic tokens (`--green/--red/--amber` + `*-soft` variants)
- [ ] Hover states use `--accent`, not arbitrary brand-cyan literals
- [ ] Theme inspector tested by toggling `data-theme` attribute live in DevTools — UI doesn't break

Before any voice or lip-sync UI ships, both themes must be visually inspected. Add a screenshot diff to the PR if substantial CSS changes.
