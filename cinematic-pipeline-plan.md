# Cinematic Pipeline Plan — Decoupled Storyboard, Provider-Agnostic Render

Status: design draft, not yet implemented.
Scope: replaces the current rendering pipeline's fixed assumptions (Kling-specific tiers, forced close-up framings for dialogue, single-speaker scenes, audio rehearsal drift detection / soundtouch time-stretch) with a provider-agnostic architecture where creative intent and rendering mechanics are independent.

Sibling to:
- [audio-rehearsal-plan.md](audio-rehearsal-plan.md) — per-scene audio iteration + preview gate (touched by removal of soundtouch/drift, addition of multi-line-per-card UI)
- [audio-input-plan.md](audio-input-plan.md) — diarization + speaker mapping + two-mode branch (touched by style gate insertion before storyboard agent)
- [input-formats-plan.md](input-formats-plan.md) — prose + screenplay parsing (touched by style gate + storyboard agent prompt rewrite)
- [voice-and-lipsync-plan.md](voice-and-lipsync-plan.md) — multi-voice TTS + lip sync (touched by per-line lip-sync routing, Tier 1 / Tier 2 selection logic, multi-speaker scene handling)
- [consistency-plan.md](consistency-plan.md) — visual bible (compatible — `visualSubjectIds` field is consumed by consistency checks)

---

## 1. Goal

Three user-visible outcomes:

1. **The agent picks framings by dramatic intent, not by lip-sync requirements.** Reaction shots, two-shots, wide establishing with dialogue, over-the-shoulder, profile — all valid. The pipeline routes lip sync per line based on whether the speaker is on screen and whether their mouth is visible.
2. **The script is not bent to fit the renderer.** A 7-second line stays a 7-second line. The renderer composes 5s and 10s segments to cover the audio, with prompt-aligned action per segment. Cuts at segment boundaries are mitigated by Gemini-derived continuity prompts.
3. **The video provider is a swappable component.** Kling, Veo, Runway, Pika, future providers all plug in via a single config object. No provider-specific code outside the provider config.

Behind the scenes, the same architectural shift unifies how brainstorming, text input, and audio input feed the pipeline — every path commits to the same creative frame (type / length / style) before generation begins, locked, and propagates that frame uniformly through every downstream stage.

## 2. Non-goals (v1)

- Not a generative model retraining effort. We work within Kling / Veo / etc.'s existing capabilities (image-to-video continuation, fixed duration tiers, audio-conditioning constraints).
- Not a multi-take / variant system. Each scene has one rendered video at a time. Variants come from regen, not from parallel generations.
- Not a real-time editing canvas where the user drags scenes around the timeline; that's the editor's job. This plan covers up to the editor handoff.
- Not solving cross-scene action continuity (a character carrying an object from scene 1 to scene 2). That's a consistency-plan concern.
- Not adding new lip-sync providers. Existing Tier 1 (MediaPipe overlay) and Tier 2 (Kling LipSync via fal.ai) cover v1.
- Not multi-language audio per scene. One language per project.

## 3. Pre-existing primitives reused

- **Storyboard agent prompt builder** at [js/17b-create-references.js:2906](js/17b-create-references.js#L2906) (`castBuildDialogueAndFramingHint`) — its forced-close-up rule is removed; the schema is extended; the scene shape returned is updated.
- **`castEnforceCutOnSpeaker`** at [js/17b-create-references.js:2946](js/17b-create-references.js#L2946) — kept but generalized: only splits when the agent's chosen framing can't accommodate multiple speakers (close-up of one face), respects two-shot framings unchanged.
- **Multi-voice TTS** ([js/17b-create-references.js:3301](js/17b-create-references.js#L3301) `castGenerateMultiVoiceAudio`) — input shape changes from `dialogue` (singular) to `dialogueLines[]` per scene.
- **Kling clip plan** ([js/21-kling.js:163](js/21-kling.js#L163) `buildClipPlan`) — generalized into a provider-agnostic segment planner that always stitches when audio exceeds a single tier.
- **Last-frame extraction** for image-to-video continuation (already used for >12s scenes via `extractLastFrame`) — extended to be the default path for any multi-segment scene.
- **Audio rehearsal step** ([js/33-audio-rehearsal.js](js/33-audio-rehearsal.js)) — drift detection / soundtouch / 3% gate / asymmetric-tolerance / degraded-mode banner all removed; per-image-card extended to N audio rows for multi-speaker scenes.
- **Brainstorm wizard** ([js/26-brainstorm.js:443](js/26-brainstorm.js#L443) `wizardAnswers`) — extended with a third pickable step (visual style).
- **Style preset machinery** (current `STYLE_PRESETS` in `01-core.js` / `17a-create-api.js`) — replaced by a richer mode-aware preset library.

## 4. Core architectural shifts

The plan changes six load-bearing assumptions in the current code:

| # | Old assumption | New rule |
|---|---|---|
| 1 | Scene has one `dialogue` object (single speaker) | Scene has `dialogueLines[]` (zero-to-many speakers) |
| 2 | Dialogue scenes use close-up framings (rule in agent prompt) | Framings are free; lip sync routes per line based on speaker visibility |
| 3 | Scene duration is continuous (rounded at video gen time) | Scene composed of 5s/10s segments (provider tiers); audio not padded — segments stitched |
| 4 | Kling-specific code paths (`buildClipPlan`, fal.ai endpoint hardcoded) | Provider config is a swappable object; all video logic reads from it |
| 5 | Audio rehearsal does drift detection + soundtouch time-stretch | Audio is real-time; segment count adapts to audio length; drift becomes a single gate (estimate vs actual TTS) |
| 6 | Style is a flat `STYLE_PRESETS` global, set late | Style is layered (flow / sub-style / per-scene override), set in wizard / style gate before any generation |

These six shifts compose into one architecture; they're not independent.

## 5. Data model

### 5.1 Project-level fields (new + changed)

```js
window.createJobState = {
  // existing
  videoType: 'film' | 'brand',

  // new
  narrationMode: 'dialogue' | 'voice-over' | 'mixed',
    // derived from scenes' isVoiceOver flags after first scene generation;
    // 'voice-over' = ALL lines are isVoiceOver: true; lip sync stage skipped entirely

  subStyle: {
    preset:        '<preset name from mode-specific library>' | 'custom',
    description:   '<freeform 1-2 sentences, always populated>',
    motionGrammar: '<phrase>' | null,
    lighting:      '<phrase>' | null,
    color:         '<phrase>' | null,
    composition:   '<phrase>' | null,
  },

  videoProvider: {
    id:                'kling-v1.6' | 'veo-3' | 'runway-gen3' | 'pika-1' | ...,
    durationTiers:     [5, 10],
    minClipSec:        5,
    maxClipSec:        10,
    continuation: {
      supported:               true,
      mode:                    'last-frame-i2v' | 'last-frames-conditioning' | 'embedding' | 'none',
      overlapSec:              0,
    },
    lipSyncCompatibility: {
      tier1MediaPipe:  true,
      tier2Provider:   'kling-fal' | null,
    },
    pricing: {
      tier:              { 5: 0.20, 10: 0.40 },
      continuationDelta: 0,
    },
    capabilities: {
      handlesComplexMotion:        'good' | 'fair' | 'poor',
      handlesFaceContinuity:       'good' | 'fair' | 'poor',
      handlesEnvironmentContinuity:'good' | 'fair' | 'poor',
    },
  },

  // unchanged
  characters, product, presenter, voiceConfig, ...
}
```

### 5.2 Scene shape (changed)

```js
scene = {
  // existing
  id, timeRange, framing, motionPrompt, imgDataUrl, videoUrl, ...

  // new — duration model
  durationSec:     7.4,        // creative target (continuous, set by agent)
  durationTier:    10,          // mechanical: ceil to nearest provider.durationTiers
  segmentPlan:     [             // computed by segment planner
    { idx: 0, durationSec: 5, role: 'main',         prompt: '<per-segment>' },
    { idx: 1, durationSec: 5, role: 'continuation', prompt: '<per-segment>' },
  ],
  croppedTailSec:  3,             // 5+5 = 10s output; audio is 7s; last 3s never seen

  // new — visual decoupling
  visualSubjectIds: ['char_maya'],  // who's on-screen, independent of who speaks

  // new — dialogue is an array
  dialogueLines: [
    {
      speakerCharacterId: 'char_joe',
      text:               'I had to.',
      mood:               'serious',
      isVoiceOver:        true,         // derived: speaker not in visualSubjectIds OR mouth not in framing
      withinSceneStartMs: 1500,
      withinSceneEndMs:   6200,
      audioBufferKey:     'audio_line_<sceneId>_0',
      regenCount:         0,
      regenLockToken:     null,
      voiceOverride:      null,
      muted:              false,
    }
  ],

  // new — silence regions designed by agent (not "filler")
  audioRegions: [
    { startMs: 0,    endMs: 1500, type: 'pre-roll-silence' },
    { startMs: 1500, endMs: 6200, type: 'dialogue', lineIdx: 0 },
    { startMs: 6200, endMs: 7000, type: 'post-roll-silence' },
  ],

  // new — per-scene style override (rare; null on most scenes)
  styleOverride: <subStyle object> | null,

  // existing — but now derived per-scene from framing + visualSubjectIds + lineCount
  continuityImportance: 'low' | 'medium' | 'high',

  // removed
  // dialogue:  <single object>     ← replaced by dialogueLines[]
  // duration:  <continuous>        ← replaced by durationSec + durationTier
  // durationStatus, durationDriftPct, audioStale  ← all removed (drift detection deleted)
}
```

### 5.3 Brainstorm finalise schema (changed)

A new `visualStyle` object on all four mode schemas (autopilot, copilot, brand-product, film-narrative). Identical shape to `subStyle` above. Always populated — even for sessions where style was never discussed (in which case the wizard pick wins, since style is now picked before chat begins).

```js
finalScript = {
  // existing
  title, tone, scenes, ...

  // new
  visualStyle: <same shape as createJobState.subStyle>,
}
```

### 5.4 Wizard state (changed)

```js
brainstormState.wizardAnswers = {
  type:        'film-narrative' | 'brand-product' | 'copilot' | 'autopilot',
  length:      '2:30',
  visualStyle: <subStyle shape>,    // new — required, no skip
}
```

## 6. Provider abstraction

The `videoProvider` config object is the single point of provider-specific knowledge. Every video-related code path reads from it.

### 6.1 The interface

```js
videoProvider = {
  id:                    'kling-v1.6',
  durationTiers:         [5, 10],
  minClipSec:            5,
  maxClipSec:            10,
  continuation: {
    supported:           true,
    mode:                'last-frame-i2v',
    overlapSec:          0,
  },
  lipSyncCompatibility: {
    tier1MediaPipe:      true,                   // always true — Tier 1 is provider-agnostic
    tier2Provider:       'kling-fal',            // null if no Tier 2 available
  },
  pricing: {
    tier:                { 5: 0.20, 10: 0.40 },
    continuationDelta:   0,
  },
  capabilities: {
    handlesComplexMotion:         'good',
    handlesFaceContinuity:        'good',
    handlesEnvironmentContinuity: 'fair',
  },
}
```

### 6.2 Where the abstraction lives

- A single module (`js/providers/video-providers.js`, or appended to existing pipeline file) exports the registered provider configs and a `getActiveVideoProvider()` function that reads the current selection from settings.
- Provider-specific submission helpers (`submitKlingI2V`, `submitVeoI2V`, etc.) live behind a uniform interface: `provider.submit(imgDataUrl, prompt, durationSec, opts)` returns `{ taskId }`.
- Polling and result-fetching are similarly uniformed: `provider.pollTask(taskId)` returns `{ status, videoUrl }`.
- Last-frame extraction is generic (works on any returned video URL).

### 6.3 Provider selection

For v1, provider is set in user settings (BYOK or system default). One provider per project at lock time. Multi-provider per project (e.g., Kling for Scene 1, Veo for Scene 2) is out of scope.

### 6.4 Migration path

Today's Kling-specific code in [js/21-kling.js](js/21-kling.js) becomes the "kling-v1.6" provider config + submit/poll helpers. No behavioral change for users on Kling; they're now opting into the abstracted path automatically.

## 7. Segment planner

### 7.1 The function

```js
planSegments({
  audioMs,                                     // total audio duration for the scene
  provider,                                    // videoProvider config
  scene,                                       // for prompt + framing + visualSubjects context
  requiresLipSync,                             // computed: any line with isVoiceOver === false
  continuityImportance,                        // 'low' | 'medium' | 'high', derived per scene
}) → {
  segments: [
    { idx: 0, durationSec: 5, role: 'main',         prompt: '<per-segment>' },
    { idx: 1, durationSec: 5, role: 'continuation', prompt: '<per-segment>' },
  ],
  totalGenSec:    10,
  croppedTailSec: 3,
  expectedCost:   0.40,
  fallbackPlan:   <plan if continuation fails>,
}
```

### 7.2 Tier selection rule

```
let remainingMs = audioMs;
let segments = [];
let isFirst = true;

while (remainingMs > 0) {
  // Pick the largest tier that doesn't waste too much
  // Bias for first segment: prefer to fit audio in single tier if possible
  // Bias for continuation: always 5s (smallest tier covers any tail)

  const tier = isFirst
    ? pickSingleTierFit(remainingMs, provider.durationTiers)
    : pickSmallestTier(provider.durationTiers);

  segments.push({ idx: segments.length, durationSec: tier, role: isFirst ? 'main' : 'continuation' });
  remainingMs -= tier * 1000;
  isFirst = false;
}

const croppedTailSec = (segments.reduce((s, x) => s + x.durationSec, 0) * 1000 - audioMs) / 1000;
```

`pickSingleTierFit` returns the smallest tier ≥ `remainingMs/1000`, or the largest tier if no single tier fits (forces continuation). For `durationTiers: [5, 10]`:

- audio 4.0s → main = 5s, no continuation
- audio 6.0s → main = 10s, no continuation (single tier fits)
- audio 7.0s → main = 5s + continuation 5s = 10s, 3s cropped (split for prompt-pacing)
- audio 9.5s → main = 10s, no continuation
- audio 12s → main = 10s + continuation 5s = 15s, 3s cropped

The 7s vs 9.5s difference is the load-bearing decision: when audio is **clearly mid-tier** (say 5.5s–8.5s), splitting into 5s+5s gives prompt-aligned action in each segment instead of stretching one prompt across 10s. When audio is close to a tier ceiling (8.5s–10s), one 10s clip is fine because the agent's motion prompt naturally paces to 10s.

The split threshold (8.5s) is a tunable; v1 default is 7.0s. Below this, audio is small enough that splitting helps; above it, single-tier is better.

### 7.3 Gemini split-prompt call

When `segments.length > 1`, the planner makes a Gemini call to derive per-segment prompts.

```js
{
  scene: {
    fullMotionPrompt:    '<scene.motionPrompt>',
    framing:             '<scene.framing>',
    visualSubjectIds:    [...],
    durationSec:         <agent's creative target>,
    dialogueLines:       [...],
  },
  segmentPlan: [
    { idx: 0, durationSec: 5, role: 'main',         windowMs: [0,    5000]  },
    { idx: 1, durationSec: 5, role: 'continuation', windowMs: [5000, 10000] },
  ],
  audioMs:               7000,                  // last segment crops at 7000 of 10000
  continuityImportance:  'high',                // tunes the Gemini output
  styleHint:             '<subStyle.description>',
}
```

Returns:

```js
{
  segments: [
    { idx: 0, prompt: 'Maya pours wine slowly into the glass, holding the bottle close to her chest. Lighting: low warm key from screen-left.' },
    { idx: 1, prompt: 'Maya continues from the prior frame; she raises the glass to her lips and takes a slow, deliberate sip [main, 0–2s]. She lowers the glass with closed eyes, savoring the moment, body still [settle, 2–5s].' },
  ],
}
```

The Gemini system prompt enforces:

- **Every continuation segment opens with a "continue from prior frame" anchor.** The strength of this anchor is tuned by `continuityImportance`: `high` → "preserve identical framing, lighting, pose, and eyeline; only the action evolves"; `medium` → "continue from the prior frame's setup, the action evolves naturally"; `low` → "this segment is a new shot; frame freely."
- **The last segment's tail is designed as low-motion.** The Gemini prompt explicitly instructs: "the final 2–3 seconds of the last segment must be low-motion settle (held pose, breath, gaze settling) so that cropping does not cut a dynamic action."
- **Dialogue lines that span segment boundaries are referenced in both segments' prompts.** If a 7-second line spans 1.5s–6.5s within a 10-second composed window (5s+5s split at 5s), both segments' prompts mention the line is in progress.

Cost: ~$0.001 per scene that needs splitting (single Gemini call). Latency: ~1–2s, can run in parallel with image gen for the same scene.

### 7.4 Stitching

When `segments.length > 1`, the rendered Kling clips are stitched into a single video before lip sync runs. Stitching is done client-side (MediaSource Extensions) for v1, or server-side (ffmpeg via R2/Cloudflare Workers) when Phase 9 of voice-and-lipsync-plan ships.

Stitching boundaries: hard cut at segment boundary (no crossfade), since the continuation prompt enforces visual continuity through the cut. Crossfade is a v2 quality improvement.

### 7.5 Failure handling

- **Continuation Kling clip fails:** retry once. On second failure, fall back to single-tier rendering (`fallbackPlan`) — one 10s clip with the full motion prompt, accepting the stretched-pacing cost. User sees a notice in the rehearsal step.
- **Last-frame extraction fails:** same fallback path.
- **Stitching fails (rare):** retry once, then degrade to per-segment playback in the editor (segments play sequentially without seamless stitching). User sees a notice.
- **Gemini split-prompt fails:** fall back to a deterministic split — segment 0 uses the original motion prompt verbatim, segment 1 uses a generic "continue from prior frame; action settles" suffix. Quality degrades but pipeline succeeds.

## 8. Style system (three layers)

### 8.1 Layer 1 — Flow style (`videoType` constant)

```js
flowStyles = {
  film: {
    motionGrammarBase:     'narrative cinematography — tracking, dolly, sustained holds, handheld for intensity',
    compositionBase:       'rule of thirds, character-driven framing, eye-line matches, depth-of-field',
    lightingBase:          'atmospheric, mood-aware, source-motivated',
    colorBase:             'narrative palette',
    pacingBase:            'beat-driven',
    forbiddenPatterns:     'no clinical product lighting, no commercial pacing',
  },
  brand: {
    motionGrammarBase:     'polished commercial — smooth dolly, slow rotation, parallax, hero zooms; no handheld unless lifestyle',
    compositionBase:       'product-centered or presenter-frontal, clean negative space, brand-appropriate framing',
    lightingBase:          'premium, bright, soft shadows, evenly lit',
    colorBase:             'brand-palette aware',
    pacingBase:            'structured rhythm — problem/product/benefit',
    forbiddenPatterns:     'no narrative ambiguity, no atmospheric darkness unless luxury sub-style',
  },
}
```

These are constants in code, not user-editable. They define what "film" and "brand" mean structurally for the storyboard agent.

### 8.2 Layer 2 — Sub-style (user pick)

A mode-aware preset library:

```js
const STYLE_PRESETS = {
  film: {
    drama:         { description, motionGrammar, lighting, color, composition, sampleImage },
    thriller:      { ... },
    romance:       { ... },
    action:        { ... },
    documentary:   { ... },
    animation:     { ... },
    'music-video': { ... },
    experimental:  { ... },
  },
  brand: {
    luxury:          { ... },
    lifestyle:       { ... },
    'tech-saas':     { ... },
    'sports-energy': { ... },
    beauty:          { ... },
    food:            { ... },
    corporate:       { ... },
    indie:           { ... },
  },
  copilot: {
    explainer:       { ... },
    documentary:     { ... },
    essay:           { ... },
    lecture:         { ... },
    interview:       { ... },
    'narrative-doc': { ... },
  },
  autopilot: {
    'tiktok-native':  { ... },
    'ig-polished':    { ... },
    'youtube-shorts': { ... },
    stylized:         { ... },
    'ugc-handheld':   { ... },
  },
};
```

Each preset has:
- `description`: 1–2 sentence freeform style summary, used directly as prompt text.
- `motionGrammar`: motion direction phrase, merges with Layer 1 base.
- `lighting`: lighting direction phrase.
- `color`: color direction phrase.
- `composition`: composition bias phrase.
- `sampleImage`: path to a representative still (curated, licensed-clear or commissioned).

A "Custom" entry per mode lets the user write freeform text — `preset: 'custom'`, `description: <user-text>`, structured fields stay null.

### 8.3 Layer 3 — Per-scene override

`scene.styleOverride` defaults to null; when set, replaces Layers 1+2 for that scene only. Surfaced in the storyboard editing UI as a per-scene "Use a different style for this scene" control. Brainstorm output never sets it; the storyboard agent never infers it; only user edits set it.

### 8.4 Where style gets injected

Six injection points across the pipeline. Each reads from a single style fragment computed per scene as `mergedStyle = scene.styleOverride || project.subStyle`:

| Injection point | Style fields used |
|---|---|
| Storyboard agent system prompt | All structured fields + description; passed as creative-frame context |
| Image generation prompt | `description` + `lighting` + `color` + `composition` appended after the per-scene image prompt |
| Motion prompt builder (per-scene, before video provider submission) | `description` + `motionGrammar` appended after the agent's motion prompt |
| Gemini split-prompt call | All fields passed in; segments inherit the style |
| Continuity prompt (multi-segment scenes) | `motionGrammar` informs the continuity tone (luxury → "slow elegant continuation"; thriller → "tense push-in continues") |
| Brainstorm chat AI system prompt (when style was picked in wizard before chat) | All fields, as locked context — chat AI never re-elicits |

The shared helper `getMergedStyle(scene)` computes the merged object once per scene; all six injection points call it.

## 9. Brainstorm wizard updates

### 9.1 Three-step lock model

```
Step 1: Type      [autopilot | copilot | brand-product | film-narrative]
Step 2: Length    [30s | 60s | 90s | 2:00 | 3:00 | 5:00 | custom]
Step 3: Style     [grid of mode-relevant presets + Custom + Advanced disclosure]

         ↓ Confirm and start

Step 4: Chat      [type + length + style displayed read-only in side panel]
```

The user picks all three before chat begins. Once the user clicks "Confirm and start," the answers freeze for the session. No mid-session mutation.

### 9.2 Style picker UI

A grid of preset cards. Each card:

```
┌────────────────────────┐
│  [sample still image]  │
├────────────────────────┤
│  <preset name>         │
│  <description, 1 line> │
└────────────────────────┘
```

Click → selects. A "Custom" card at the end opens a freeform textarea (used as `description` directly).

Below the grid, an "Advanced (optional)" disclosure exposes the structured sub-fields, pre-filled from the picked preset and editable:

```
Motion:        [<motionGrammar>]
Lighting:      [<lighting>]
Color:         [<color>]
Composition:   [<composition>]
```

### 9.3 Chat AI system prompt (updated)

The system prompt for each mode receives the locked frame as fixed context at chat start:

```
The user has picked the following project visual style:
- Preset: <visualStyle.preset>
- Description: <visualStyle.description>
- Motion: <visualStyle.motionGrammar>
- Lighting: <visualStyle.lighting>
- Color: <visualStyle.color>
- Composition: <visualStyle.composition>

Reference this style naturally when developing the script. Do NOT probe
the user for style choices — that decision is locked. If their script
direction conflicts with the picked style, say so once and let them
decide whether to continue within the locked style or restart a new
session with a different style.
```

The chat AI:

- References style when proposing scenes.
- Stays within the style when making creative suggestions.
- Doesn't probe for style.
- Notes contradictions once if they arise; never silently mutates style.
- Tells the user that style is session-locked when explicitly asked to change.

### 9.4 Side panel

During chat:

```
┌─ Project (locked) ─────┐
│ Type: Film/Narrative   │
│ Length: 2:30           │
│ Style: Thriller        │
│                        │
│ To change these,       │
│ start a new session.   │
└────────────────────────┘
```

Read-only. The "New Session" button (already in the brainstorm UI) is the only path to change the locked frame.

### 9.5 Finalise output

`finalScript.visualStyle` is populated directly from `wizardAnswers.visualStyle`. The finalise prompt no longer asks the AI to derive style from conversation — it just carries the locked value through.

## 10. Style gate for text/audio input

### 10.1 The gate

For paths that don't go through brainstorm wizard (text input, audio input), insert a single style-pick step before the storyboard agent fires.

**Text input flow:**
```
1. User pastes text
2. Parser extracts scenes / dialogue / characters
3. User reviews parsed structure (existing review gate)
4. ★ Style gate (new — single step, same UI as brainstorm step 3)
5. Storyboard agent fires
```

**Audio input flow:**
```
1. User uploads audio
2. Scribe diarizes
3. User picks Mode A or B
4. User maps speakers to cast
5. User accepts/rejects AI-suggested extras
6. ★ Style gate (new)
7. processOriginalAudio / processReTTS runs
8. Storyboard agent fires
```

### 10.2 Same component, same data model

The style-picker UI is shared between brainstorm wizard step 3 and the text/audio style gate. Picked style writes to `createJobState.subStyle`. Locked at pick time. Mutable later only via storyboard editing UI.

### 10.3 Optional: AI suggestion

A small Gemini call analyzes input content (~500 chars) + the preset list, returns one preset name. Visually marks it as "Suggested for your script." User still picks (no auto-apply).

```
Suggested for your script:
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Drama ★  │ │ Thriller │ │ Romance  │
  └──────────┘ └──────────┘ └──────────┘
```

Cost ~$0.001 per project, latency ~1s. Reduces cognitive load. v1 nice-to-have.

### 10.4 Mode awareness

The gate shows mode-relevant presets. A user who's in the brand UI mode (product + presenter slots) sees brand presets only. A user in the film UI mode sees film presets only. No mixing.

### 10.5 Skip detection: when brainstorm already set style

If the user came from a brainstorm finalise that already populated `createJobState.subStyle`, the style gate is skipped automatically. Otherwise (text input from scratch, audio input from scratch), gate fires.

## 11. Storyboard agent rewrite

### 11.1 What goes away

The forced-close-up rule in the current agent prompt at [js/17b-create-references.js:2931](js/17b-create-references.js#L2931):

> "When a segment contains dialogue spoken by a visible cast member, prefer 'frontal-close-up' or 'three-quarter' framing so the speaker's mouth is on camera."

This rule is removed. Framing is no longer constrained by lip-sync requirements.

### 11.2 What gets added to the agent prompt

```
For each scene, output:
- durationSec:        creative target in seconds (5–15 typical; agent's judgment)
- visualSubjectIds:   array of character IDs visible on camera in this scene
- framing:            shot type from the full enum (any choice based on dramatic intent)
- motionPrompt:       single coherent action prompt covering durationSec
- dialogueLines:      array of speaker turns, possibly empty for action-only scenes

For each line in dialogueLines, set isVoiceOver:
- TRUE if speakerCharacterId is NOT in visualSubjectIds (speaker off-screen)
- TRUE if framing does not show the speaker's mouth (back-of-head, profile-no-mouth,
  extreme-wide, wide-establishing where face is unresolvable)
- FALSE otherwise (on-screen speaker with visible mouth)

Cinematic guidance:
- Choose framings by dramatic intent. Reaction shots, two-shots, OTS, wide
  establishing — all valid for dialogue scenes.
- Silence regions within a scene are dramatic, not filler. Design them with motion
  prompts that include reaction, breath, eyeline shifts, body language.
- For rapid back-and-forth dialogue, consider merging into one shared scene with
  two-shot or OTS framing.

Style frame (locked at project level):
- Preset: <subStyle.preset>
- Description: <subStyle.description>
- Motion grammar: <subStyle.motionGrammar>
- Lighting / color / composition: <subStyle fields>

Pacing constraint:
- Estimate dialogue duration at ~150 wpm + 0.4s per breath, plus 15% safety margin.
- For each scene, durationSec accommodates dialogue + visual breathing room.
- The pipeline will round durationSec UP to provider tier; agent need not match tiers.
```

### 11.3 Validator stage

After the agent returns its JSON, a validator runs:

- **`isVoiceOver` consistency check.** If agent said `isVoiceOver: false` but framing is `back-of-head` or `extreme-wide`, flip to true and log. If agent said `isVoiceOver: true` but speaker is in `visualSubjectIds` and framing is mouth-visible, flip to false and log.
- **Three-speaker scene check.** Forbid >2 speakers in one scene — split into separate scenes.
- **Tier sanity check.** If `durationSec > maxClipSec * 2`, force a continuation split (prevents runaway scene durations).
- **Visual subject existence check.** Every ID in `visualSubjectIds` must exist in `createJobState.characters` or `presenter`.

Fixable errors are auto-corrected silently. Unfixable errors surface to the user with a "regenerate this scene" prompt.

### 11.4 `castEnforceCutOnSpeaker` updated

Currently splits any scene with `additionalTurns` into per-speaker close-ups. After this plan:

- If the scene's framing is a two-shot or OTS variant that supports multiple speakers (`two-shot-medium`, `two-shot-wide`, `over-shoulder-front`, `over-shoulder-back`), preserve the multi-speaker scene unchanged.
- If the scene's framing is a single-character close-up but `dialogueLines` has ≥2 speakers, split into separate scenes (one per speaker), each inheriting the close-up framing for its respective speaker.
- The post-processor reads the agent's framing intent before deciding to split.

### 11.5 New framings added to the enum

- `two-shot-medium` — both characters in frame, mid-distance, both faces visible.
- `two-shot-wide` — both characters in frame, wide, environment visible.
- `over-shoulder-back-listening` — explicit reaction-shot framing (listener in front, speaker's back/shoulder occupies foreground).

These let the agent express two-shot reaction patterns that the current enum can't cleanly represent.

## 12. Lip sync routing per line

### 12.1 The router

Each dialogue line's `isVoiceOver` flag determines lip-sync handling:

```
for each dialogueLine in scene.dialogueLines:
  if dialogueLine.isVoiceOver === true:
    skip lip sync for this line — audio plays under whatever's on screen
  else:
    if scene has multiple on-screen speakers (two-shot with 2+ active speakers):
      use Tier 1 (MediaPipe) — Tier 2 can't disambiguate speakers
    else if provider.lipSyncCompatibility.tier2Provider !== null:
      use Tier 2 (provider's lip sync API) — preferred
    else:
      use Tier 1 fallback
```

### 12.2 Tier 1 (MediaPipe) upgrade

Currently matches faces by leftmost-by-default policy. For multi-speaker scenes with two-shot framing, this is wrong. The upgrade:

- Detect all faces in the scene's video.
- For each detected face, assign a stable "position cluster" (left third / center / right third of frame).
- The agent's `visualSubjectIds[]` order provides speaker-to-position hints (first ID → left, second ID → right, when there are exactly 2).
- For each `dialogueLine`, look up the position assigned to its `speakerCharacterId` and overlay mouth sprites only on that position's face.

When the position assignment is ambiguous (e.g., 3 faces detected when `visualSubjectIds` has 2), fall back to leftmost-first and log.

### 12.3 Tier 2 (provider lip sync) gate

Tier 2 takes a single video URL + single audio URL and returns a synced video. It can't tell which character is speaking when. So Tier 2 only runs when:

- Scene has exactly one on-screen speaker for the entire scene (`visualSubjectIds.length === 1` AND all `dialogueLines[i].isVoiceOver === false` lines have the same `speakerCharacterId`), OR
- Scene's only non-VO line is from a single speaker who's on-screen.

For multi-speaker on-screen scenes, fall back to Tier 1.

For voice-over-only projects (`narrationMode === 'voice-over'`), both Tier 1 and Tier 2 are skipped entirely. No MediaPipe load, no fal.ai calls, no overlay JSON.

### 12.4 Stitched-video lip sync

When a scene has multiple segments stitched together, lip sync runs on the stitched concatenation, not per-segment. This preserves mouth continuity across the cut.

For Tier 2 (one-shot video + audio call): submit the stitched video + the full scene audio.

For Tier 1 (MediaPipe per-frame): run detection on the stitched video; the overlay JSON spans the full stitched timeline.

## 13. Per-image-card UI

### 13.1 N audio rows per scene

Each image card's audio section iterates `scene.dialogueLines[]` and renders one row per line:

```
┌─ Scene 7 — Maya close-up, 5s tier ─────────────┐
│ [generated 1024×576 image]                     │
│ Framing: two-shot-medium  · 5s                 │
└────────────────────────────────────────────────┘

  Audio (2 lines · 4.6s spoken · 0.4s silence)

  ┌────────────────────────────────────────┐
  │ 🎙 Maya  "Did you do it?"        1.2s  │
  │   ▶━━━━━━━━ [matter-of-fact ▾] [↻]    │
  └────────────────────────────────────────┘
  ┌────────────────────────────────────────┐
  │ 🎙 Joe   "I had to."             0.8s  │
  │   ▶━━━━━━━━ [serious ▾]          [↻]  │
  └────────────────────────────────────────┘

  Status: ✓ ready · 5s tier
```

### 13.2 Speaker visibility icons

Per row:

- 🎙 (microphone with face) = `isVoiceOver: false` — speaker on-screen, lip sync runs
- 🔉 (voice-over icon) = `isVoiceOver: true` — speaker off-screen or framing hides mouth, lip sync skipped

This tells the user at a glance which lines drive lip sync.

### 13.3 Per-row controls

Same as today's single-dialogue card, scaled per row:

- Play / pause button (slices master audio at line's `withinSceneStartMs/EndMs`)
- Mood selector (per line)
- Regen button (regen this line only)
- Voice override (per line)
- Mute toggle (per line)

### 13.4 Status badge belongs to the scene

The scene-level status badge (`✓ ready`, `⏳ generating`, `⚠ stale`) is computed by AND-ing all line states. The card answers "is this scene ready?" rather than per-line.

### 13.5 B-roll / no-dialogue scenes

Zero audio rows. The card shows the duration tier and the motion prompt summary. A duration stepper lets the user adjust the tier within `provider.durationTiers`.

### 13.6 Voice-over-only project shortcut

When `narrationMode === 'voice-over'`, every line is VO. The card still shows N rows, but every row uses the 🔉 icon. Lip-sync visualization elements (mouth-visibility hints, etc.) are hidden.

## 14. Edit cascades

User edits to scenes after the storyboard agent has run fall into three classes with very different cascade costs.

### 14.1 Class A — Line-level edits (cheap, in-place)

| Edit | Cascade | Cost |
|---|---|---|
| Change line text | Re-TTS this line, recompute scene audio total, possibly tier-promote | $0.001–0.005 + ~3s |
| Change line mood | Re-TTS this line | $0.001–0.005 + ~3s |
| Change line voice | Re-TTS this line | $0.001–0.005 + ~3s |
| Mute / unmute line | None (toggles playback only) | Free |
| Add or remove a line | Re-TTS affected lines, recompute scene total, possibly tier-promote | $0.001–0.020 + ~10s |

Inline-editable in the per-image-card UI. Confirms only when tier promotion would trigger downstream cascade.

### 14.2 Class B — Scene-level edits (medium, image+video regen)

| Edit | Cascade | Cost |
|---|---|---|
| Change `visualSubjectIds` | Image regen, `isVoiceOver` recomputed for all lines, video regen, lip sync regen | ~$0.45 + ~90s |
| Change framing | Same as above (image regen because composition shifts) | ~$0.45 + ~90s |
| Change `motionPrompt` | Video regen only (image unchanged) | ~$0.40 + ~70s |
| Change scene-level `styleOverride` | Image regen, video regen, motion prompt re-derived | ~$0.45 + ~90s |
| Tier promotion (audio exceeds tier) | Motion prompt regen, video regen, downstream startTime shifts | ~$0.40 + ~80s + downstream |

Confirm modal with cost preview before applying.

### 14.3 Class C — Structural edits (heavy, downstream cascade)

| Edit | Cascade | Cost |
|---|---|---|
| Insert new scene at index N | All scenes ≥ N shift `startTime`; subtitle re-stamp; new scene generated end-to-end | ~$0.45 + ~90s + downstream re-stamp |
| Delete scene at index N | Same cascade in reverse | Free + downstream re-stamp |
| Split a scene at a line boundary | Two new scenes generated; original deleted | ~$0.90 + ~3 minutes |
| Merge two consecutive scenes | One new scene generated; originals deleted | ~$0.45 + ~90s |
| Reorder scenes | All affected scenes' `startTime` re-stamped | Free + downstream re-stamp |
| Change project-level `subStyle` | Optional: regen all scenes' images + videos OR apply only to subsequently regenerated scenes | User chooses scope |

Class C edits require explicit confirmation with a dependency-graph preview before committing.

### 14.4 Edit UI surface

The storyboard editing step exposes Class A as inline edits, Class B as scene-card edit modals, and Class C as a "structural edit mode" with a separate UI. Cost preview is always shown before commit.

## 15. Voice-over project shortcut

### 15.1 Detection

`narrationMode` is computed at scene generation time (after the storyboard agent commits):

- `'voice-over'` if every dialogue line in every scene has `isVoiceOver: true`
- `'dialogue'` if every dialogue line has `isVoiceOver: false`
- `'mixed'` otherwise

### 15.2 Pipeline shortcuts when `'voice-over'`

- Lip-sync stage entirely skipped — no MediaPipe load, no Tier 2 calls, no overlay JSON generation
- Per-image-card hides lip-sync-relevant UI (visibility icons unified, no Tier 1/2 selection logic exposed)
- Audio rehearsal step doesn't show speaker-region overlays on the master audio track (no character-mouth-visibility info to display)
- Storyboard agent's framing freedom is total — no mouth-visibility hint needed in the prompt

### 15.3 Mid-project transitions

If the user edits a scene to make a previously-VO line on-screen (changes framing or visualSubjectIds), the project's `narrationMode` may flip from `'voice-over'` to `'mixed'`. The lip-sync stage activates for that scene. Other scenes (still all-VO) stay in their shortcut path.

## 16. Cleanup / removals

### 16.1 Code paths removed

- **`buildClipPlan` continuation logic for >12s scenes.** Replaced by general segment planner.
- **soundtouch-js** dynamic loading + `timeStretchAudioBuffer` in `33-audio-rehearsal.js`. Time stretch is gone — segments fill their own time.
- **Drift detection percentage gate** (`computeDurationStatus`, the matched/stretched/compressed/exceeds truth table). Replaced by a binary "did TTS exceed estimated tier?" check.
- **`audioRehearsal.audioStale` flag and propagation logic.** Audio staleness was a consequence of the time-stretch model; with tier-based segments, audio is either current or being regenerated.
- **`degraded-mode-banner` for soundtouch failure.** Soundtouch is gone.
- **The asymmetric tolerance + 3% gate logic** in `canGenerateVideos()`. Replaced by a per-scene tier-fit check.

### 16.2 Schema fields removed

- `scene.durationStatus` (no more matched/stretched/etc.)
- `scene.durationDriftPct`
- `scene.audioStale`
- `scene.dialogue` (singular — replaced by `dialogueLines[]`)

### 16.3 The `STYLE_PRESETS` global

Today's flat global is replaced by the new mode-aware preset library. Old presets (cinematic / anime / watercolor / photorealistic) become *visual treatments* available within sub-styles, not the primary style mechanism. Migration: old projects with a flat preset value (e.g., `'cinematic'`) get auto-mapped to the closest new preset (e.g., film → drama, brand → corporate). User reviews on first edit.

## 17. Edge cases

| # | Case | Behavior |
|---|---|---|
| 1 | Audio exactly 5.0s | One 5s segment. No split. |
| 2 | Audio 5.1s | Threshold-based: below 7.0s split-threshold → use 10s tier (single). 7.1s → split into 5+5. |
| 3 | Audio 9.5s | Single 10s tier. No split. |
| 4 | Audio 10.1s | Forced split: 10 + 5, 4.9s cropped. |
| 5 | Audio > 25s | Multiple chained continuations: 10 + 10 + ... (recursive plan). |
| 6 | Reaction shot — speaker off-screen | `isVoiceOver: true` derived; lip sync skipped. |
| 7 | Two-shot, both speakers on-screen, alternating | Lip sync Tier 1 only (Tier 2 can't disambiguate). |
| 8 | Wide-establishing with dialogue | `isVoiceOver: true` derived; mouth not resolvable at scale. |
| 9 | Long monologue > 15s | Forced into continuation chain. Agent picks natural sentence boundary for any user-visible split. |
| 10 | TTS estimate wrong (agent picked 5s, actual 5.4s) | Tier promotion to 10s. Motion prompt regen, video regen, downstream cascade with confirmation. |
| 11 | User edits to add a third dialogue line | Class A initially; if total exceeds tier, escalates to Class B. UI explains. |
| 12 | User changes line speaker from on-screen to off-screen | `isVoiceOver` flips; lip sync teardown for that line; image/video unchanged. Cheap. |
| 13 | User changes `visualSubjectIds` from `[maya]` to `[maya, joe]` | Class B. Image regen needed. All lines recompute `isVoiceOver`. |
| 14 | User splits a scene mid-line | Forbidden. Splits land on line boundaries only. |
| 15 | Audio input Mode A (original recording) | Audio durations fixed. Tier rounded up; remaining silence is real silence in recording. Style gate inserts before storyboard. |
| 16 | Audio input Mode B (re-TTS) | Same as text input post-TTS. Style gate inserts before storyboard. |
| 17 | Voice-over narrator scene | `isVoiceOver: true` for all lines. Tier rounded up; padding is silence. No lip sync. |
| 18 | B-roll with no audio | Scene tier is agent's choice. Pad audio with silence. Lowest cost. |
| 19 | Three+ speakers in rapid exchange | Forbidden as one scene. Validator splits. |
| 20 | Continuation Kling clip fails | Retry once. Fallback to single-tier rendering with notice. |
| 21 | Last-frame extraction fails (rare) | Same fallback. |
| 22 | Stitching fails | Retry once; degrade to per-segment playback in editor with notice. |
| 23 | Gemini split-prompt fails | Deterministic fallback split (segment 0 = original prompt, segment 1 = generic continue suffix). |
| 24 | Cost estimate jumps unexpectedly mid-edit | Pre-commit cost preview always shown for Class B + Class C. |
| 25 | User restarts brainstorm session mid-flow | Session discarded, no cost. |
| 26 | Saved session restore (pre-feature) | Migration: prompts user once for style pick, locks immediately. |
| 27 | Brainstorm finalise → Copilot pipeline → user wants different style | Storyboard editing UI Class B path: change `subStyle`, accept regen cost. |
| 28 | Style picker enforced (no skip) | Both wizard step 3 and text/audio gate require a pick before "Continue." |
| 29 | User picks "Custom" style and writes nothing | Validation: minimum 10 chars in description before allowing "Continue." |
| 30 | Two-shot scene with Tier 2 lip sync requested | Auto-falls back to Tier 1. Notice in editor. |
| 31 | Per-scene `styleOverride` clashes with project-level style | Allowed (intentional creative choice). User own the dissonance. |
| 32 | Mood per line contradicts project style | Allowed. Mood is voice-only; style is visual. They coexist (e.g., warm mood line in thriller project = warm voice over kinetic visuals). |
| 33 | Provider doesn't support continuation (`continuation.supported === false`) | Multi-segment scenes fall back to multiple independent clips with hard cuts. Continuity-importance `low` projects only; `medium`/`high` projects warn and offer to switch provider. |
| 34 | Provider's only tier is 5s (e.g., a hypothetical 5s-only model) | Long scenes chain many 5s segments. Cuts more frequent; continuity prompt density higher. Same architecture. |
| 35 | Provider supports variable durations (e.g., Veo 3 with 1–10s flexible) | `durationTiers` becomes a continuous range. Segment planner picks exact duration matching audio. No tier rounding. Single segment usually suffices. |

## 18. Phases / order of work

| # | Phase | Deliverables | Risk |
|---|---|---|---|
| **1. Provider abstraction** | `js/providers/video-providers.js` with Kling-v1.6 config; uniformed `submit/poll` interface; existing Kling code wrapped | low (refactor; no behavioral change) |
| **2. Schema migration** | `scene.dialogue → dialogueLines[]`, add `visualSubjectIds`, `durationSec` + `durationTier`; backward-compat shim for saved projects | medium (touches many readers) |
| **3. Storyboard agent prompt rewrite** | Remove forced-close-up rule; add `isVoiceOver` derivation, free framing, two-shot framings; validator stage | medium (agent quality risk) |
| **4. Style system + preset library** | Mode-aware `STYLE_PRESETS` library; merged-style helper; six injection points wired | medium |
| **5. Brainstorm wizard step 3** | Style picker UI; `wizardAnswers.visualStyle` field; chat AI system prompt update; finalise schema update | low |
| **6. Style gate for text + audio input** | Same picker UI; gate insertion in both flows; skip-when-already-set logic | low |
| **7. Segment planner + Gemini split-prompt** | `planSegments` function; split-prompt Gemini call; provider-agnostic stitching; failure fallbacks | high (new code, quality-sensitive) |
| **8. Per-image-card N-rows audio** | Multi-line UI; per-line controls; speaker visibility icons; status aggregation | medium |
| **9. Lip-sync routing per line** | Router based on `isVoiceOver` + multi-speaker detection; Tier 1 position-based face matching upgrade; voice-over project shortcut | medium |
| **10. Edit cascades UI** | Class A / B / C edit surfaces with cost previews; structural edit mode | medium |
| **11. Cleanup** | Remove soundtouch-js, drift detection, asymmetric tolerance, degraded-mode banner, old `STYLE_PRESETS` flat global | low (deletions) |

Phases 1–4 are foundational. Phases 5–6 unlock user-visible style commitment. Phases 7–9 deliver the rendering quality wins. Phases 10–11 close the loop.

Total: ~3000 lines of new + changed code, ~800 lines of deleted legacy code. Net add ~2200 lines. Across approximately 10–12 files (`js/17b-create-references.js`, `js/17c-create-pipeline.js`, `js/21-kling.js` → `js/providers/video-providers.js`, `js/26-brainstorm.js`, `js/30-lipsync.js`, `js/31-input-parser.js`, `js/32-audio-input.js`, `js/33-audio-rehearsal.js`, plus `css/styles.css` and `index.html`).

Estimated calendar time: 3–4 weeks single-engineer focused work. Phases 1–6 sequential; phases 7–9 partially parallelizable.

## 19. Theming considerations

All new UI (style picker grid, per-image-card N rows, edit cascade modals, structural edit mode) follows the Aurora dark/light token system per [audio-rehearsal-plan.md](audio-rehearsal-plan.md) §14.

Specific:

- Style picker preset cards use `var(--bg-card)` background, `var(--border)` border, `var(--accent)` for selected ring.
- Sample-image preset cards include theme-aware overlay tint at 8% accent for hover, 16% for selected.
- Per-image-card audio rows use the existing audio-rehearsal styles, replicated per row.
- 🎙 vs 🔉 speaker icons use semantic colors (`var(--accent)` for on-screen, `var(--text-muted)` for voice-over).
- Cost preview modals use existing modal chrome from audio-input modals (`.modal-overlay` + `.modal-box`).

`font-family: inherit` on every interactive element; status badges use `var(--green)`, `var(--amber)`, `var(--red)` semantic tokens.

## 20. Telemetry

Track per project:

```js
{
  // Wizard usage
  wizardStyleChosen:           '<preset>',
  wizardStyleSource:           'preset' | 'custom',
  wizardCompletedAt:           '<ISO>',

  // Style picker usage outside wizard
  textInputStyleGateShown:     bool,
  audioInputStyleGateShown:    bool,
  styleGateAISuggestionUsed:   bool,
  styleGateUserOverrodeAI:     bool,

  // Segment planner stats per scene
  segmentPlanStats: [
    { sceneId, audioMs, segmentCount, totalGenSec, croppedTailSec, splitPromptLatencyMs, fallbackUsed }
  ],

  // Lip-sync routing stats
  totalDialogueLines:          int,
  voiceOverLines:              int,
  tier1LipSyncLines:           int,
  tier2LipSyncLines:           int,

  // Edit cascade stats
  classAEditsCount:            int,
  classBEditsCount:            int,
  classCEditsCount:            int,
  tierPromotionCount:          int,           // how often estimate was wrong

  // Provider stats
  providerId:                  '<id>',
  providerContinuationFailures: int,
  providerStitchFailures:      int,

  // Voice-over shortcut
  narrationMode:               'voice-over' | 'mixed' | 'dialogue',
  lipSyncStageSkippedEntirely: bool,

  // Cost
  totalRenderCost:             float,
  totalGenLatencyMs:           int,
}
```

Sent at `audioRehearsal.status === 'locked'` time, then again at editor handoff. Drives quality monitoring (split-prompt continuity quality, tier promotion frequency, provider failure rates) and helps tune the 7s split-threshold over time.

---

## Appendix A — Cross-plan integration touchpoints

This plan modifies behavior in five sibling plans:

**[audio-rehearsal-plan.md](audio-rehearsal-plan.md)**:
- Removes drift detection (§8.3a, §8.4), soundtouch-js (§8.5), 3% gate (§7.6, §8.4a), degraded-mode banner.
- Replaces single-dialogue card layout (§6.1) with N-rows-per-line.
- The "matched / stretched / compressed / exceeds" status enum becomes "matched" or "tier-promotion-needed."
- Audio rehearsal lock step still computes silence padding and freezes scene durations, but at the segment level.

**[audio-input-plan.md](audio-input-plan.md)**:
- Adds style gate as Stage 5.5 (between speaker mapping and processing).
- Mode A's `processOriginalAudio` schema for `dialogueLines[]` matches this plan's shape (already aligned via prior work).
- Mode B's `processReTTS` similarly aligned.

**[input-formats-plan.md](input-formats-plan.md)**:
- Adds style gate after parser review.
- Storyboard agent prompt changes apply to both prose and screenplay parser outputs.
- The `parsed.dialogueLines[]` shape matches scene `dialogueLines[]` (already aligned).

**[voice-and-lipsync-plan.md](voice-and-lipsync-plan.md)**:
- Lip-sync routing per line (§12.1) replaces blanket per-scene routing.
- Tier 1 face-matching upgrade (§12.2) is a quality enhancement to existing MediaPipe path.
- Tier 2 multi-speaker fallback (§12.3) is a new gate.
- Voice-over project shortcut (§15) skips both tiers for entire-VO projects.

**[consistency-plan.md](consistency-plan.md)**:
- `visualSubjectIds[]` is consumed by consistency checks (already-locked characters appearing in scene must visually match their bible).
- No changes required to consistency machinery; new field flows through naturally.

## Appendix B — Open questions deferred to v2

1. **Crossfade between segments.** Hard cuts are v1; crossfade is v2 quality improvement.
2. **Multi-provider per project.** Kling for some scenes, Veo for others. v1 is single-provider per project.
3. **Provider auto-selection based on scene needs.** Let the system pick the best provider per scene (e.g., Veo for face-heavy, Kling for environment). v2.
4. **Audio-conditioned video generation.** When/if any provider supports audio as a conditioning input (so Kling-equivalent knows when dialogue happens), revisit segment planner to use that conditioning.
5. **Per-line style override.** Currently style override is per-scene. Per-line variation (e.g., a flashback within a scene) is v2.
6. **Brainstorm wizard for text/audio paths.** Currently text/audio paths only get the style gate. A full 3-step wizard (with explicit length picker) for text/audio is v2 if user research shows it helps.
7. **AI-suggested style based on input content.** v1 nice-to-have; v2 standard.

---

End of plan.
