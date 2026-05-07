# Cinematic Pipeline Plan — v2

Status: design draft, not yet implemented. Supersedes [cinematic-pipeline-plan.md](cinematic-pipeline-plan.md) (v1).
Scope: replaces the current rendering pipeline's fixed assumptions (Kling-specific tiers, forced close-up framings for dialogue, single-speaker scenes, audio rehearsal drift detection / soundtouch time-stretch) with a provider-agnostic architecture where creative intent and rendering mechanics are independent.

Sibling to:
- [audio-rehearsal-plan.md](audio-rehearsal-plan.md)
- [audio-input-plan.md](audio-input-plan.md)
- [input-formats-plan.md](input-formats-plan.md)
- [voice-and-lipsync-plan.md](voice-and-lipsync-plan.md)
- [consistency-plan.md](consistency-plan.md)

Audit reference: [cinematic-pipeline-plan-audit.md](cinematic-pipeline-plan-audit.md). All findings folded into this revision.

---

## 0. What changed from v1

| # | v1 issue | v2 fix |
|---|---|---|
| 1 | Provider config baked in legacy ≤12s tier-selection rule | Provider config defines *available* tiers only; tier-selection algorithm lives in `planSegments` |
| 2 | `castEnforceCutOnSpeaker` migration risk hidden inside Phase 3 | Phase 2 split into 2a (schema + shim + writer migration) and 2b (reader migration) |
| 3 | Tier promotion timing under-specified | Two-pass segment planner: pre-storyboard estimate, post-audio-lock actual; tier change triggers Class B cascade |
| 4 | `narrationMode` computed at storyboard commit time (broken for incremental scene gen) | Lazy computation at lip-sync stage entry; back-compute on project load |
| 5 | Brand/Film bypass the wizard entirely (audit catch) | New §10.6: inline style picker after the existing narrator-choice screen for Brand/Film direct-entry; wizard step 3 only for Quick mode |
| 6 | MSE blob can't be submitted to Tier 2 fal.ai (no public URL) | §8 bifurcates stitching: server-side R2/CF for Tier 2; client-side MSE for Tier 1 / no-lip-sync. Tier 2 is gated on R2 infra availability |
| 7 | `audioRegions[]` defined but no producer/consumer | Wired as input to Gemini split-prompt call (the natural consumer); produced by the segment planner during pass 2 |
| 8 | "Asymmetric tolerance" claim was fabricated (current tolerance is symmetric) | Retracted; §17.1 says "symmetric 3% drift gate" |
| 9 | Existing `generateContinuationPrompt` at [js/21-kling.js:137](js/21-kling.js#L137) not acknowledged | §8.3 explicitly identifies this function as the precursor to the new split-prompt call; Phase 7 deletes it |
| 10 | Old `STYLE_PRESETS` migration table missing | §17.3 provides explicit mapping for all 20 entries: 5 to film sub-styles, 4 to brand sub-styles, 11 become orthogonal *visual treatments* layered on top of any sub-style |
| 11 | Phase 2 risk under-rated (42 grep hits) | Marked **high risk**; explicit `Object.defineProperty` shim spec in §6.5 |
| 12 | `narrationMode` back-compute on project load missing | §16.3 specifies the back-compute algorithm |
| 13 | Phase 7 + Phase 9 marked parallelizable but not | Marked sequential in §19; Phase 9 depends on Phase 7's stitching mechanism |
| 14 | Edge case wording (#2) and validation site (#29) under-specified | §18 cleanup of edge case wording; §10.3 specifies validation site |

Two additional items the audit flagged as minor:
- Sample image asset pipeline for ~30 presets is now an explicit work item in §19.
- Gemini split-prompt model (`gemini-2.5-flash`) and pricing assumption documented in §8.3.

---

## 1. Goal

Three user-visible outcomes:

1. **The agent picks framings by dramatic intent, not by lip-sync requirements.** Reaction shots, two-shots, wide establishing with dialogue, over-the-shoulder, profile — all valid. The pipeline routes lip sync per line based on whether the speaker is on screen and whether their mouth is visible.
2. **The script is not bent to fit the renderer.** A 7-second line stays a 7-second line. The renderer composes 5s and 10s segments to cover the audio, with prompt-aligned action per segment. Cuts at segment boundaries are mitigated by Gemini-derived continuity prompts.
3. **The video provider is a swappable component.** Kling, Veo, Runway, Pika, future providers all plug in via a single config object. No provider-specific code outside the provider config.

Behind the scenes, the same architectural shift unifies how brainstorming, text input, and audio input feed the pipeline — every path commits to the same creative frame (type / length / style) before generation begins, locked, and propagates that frame uniformly through every downstream stage.

## 2. Non-goals (v1)

- Not a generative model retraining effort. We work within Kling / Veo / etc.'s existing capabilities.
- Not a multi-take / variant system. Each scene has one rendered video at a time.
- Not a real-time editing canvas where the user drags scenes around the timeline.
- Not solving cross-scene action continuity. That's a consistency-plan concern.
- Not adding new lip-sync providers beyond existing Tier 1 (MediaPipe overlay) and Tier 2 (Kling LipSync via fal.ai).
- Not multi-language audio per scene. One language per project.

## 3. Pre-existing primitives reused

- **Storyboard agent prompt builder** at [js/17b-create-references.js:2906](js/17b-create-references.js#L2906) (`castBuildDialogueAndFramingHint`) — its forced-close-up rule is removed; the schema is extended.
- **`castEnforceCutOnSpeaker`** at [js/17b-create-references.js:2946](js/17b-create-references.js#L2946) — generalized: only splits when the agent's chosen framing is single-character; preserves two-shot framings unchanged. This is a Phase 2a writer migration.
- **Multi-voice TTS** at [js/17b-create-references.js:3301](js/17b-create-references.js#L3301) (`castGenerateMultiVoiceAudio`) — input shape changes from `dialogue` (singular) to `dialogueLines[]` per scene.
- **Existing continuation logic** at [js/21-kling.js:137](js/21-kling.js#L137) (`generateContinuationPrompt`) and [js/21-kling.js:163](js/21-kling.js#L163) (`buildClipPlan`) — both replaced by the new provider-agnostic segment planner. Phase 7 deletes them.
- **Last-frame extraction** at [js/21-kling.js:107](js/21-kling.js#L107) (`extractLastFrame`) — kept, generalized to provider-agnostic.
- **Audio rehearsal step** at [js/33-audio-rehearsal.js](js/33-audio-rehearsal.js) — drift detection / soundtouch / 3% gate / degraded-mode banner all removed; per-image-card extended to N audio rows.
- **Brainstorm wizard** at [js/26-brainstorm.js:443](js/26-brainstorm.js#L443) (`wizardAnswers`) — extended with a third pickable step for Quick mode only. Brand/Film modes get an inline style picker bolted onto the existing narrator-choice screen (see §10.6).
- **Style preset machinery** at [js/17a-create-api.js:49](js/17a-create-api.js#L49) — replaced by a richer mode-aware preset library plus orthogonal visual treatments (see §17.3).

## 4. Core architectural shifts

| # | Old assumption | New rule |
|---|---|---|
| 1 | Scene has one `dialogue` object (single speaker) | Scene has `dialogueLines[]` (zero-to-many speakers) |
| 2 | Dialogue scenes use close-up framings (rule in agent prompt) | Framings are free; lip sync routes per line based on speaker visibility |
| 3 | Scene duration is continuous (rounded at video gen time) | Scene composed of 5s/10s segments (provider tiers); audio not padded — segments stitched |
| 4 | Kling-specific code paths | Provider config is a swappable object; tier-selection algorithm lives in the planner |
| 5 | Audio rehearsal does drift detection + soundtouch time-stretch | Audio is real-time; segment count adapts to audio length; drift becomes a tier-fit check |
| 6 | Style is a flat global, set late | Style is layered (flow / sub-style + orthogonal visual treatment / per-scene override), set in wizard or style gate before any generation |

## 5. Data model

### 5.1 Project-level fields (new + changed)

```js
window.createJobState = {
  // existing
  videoType: 'film' | 'brand',

  // new — narration mode is lazy, computed at lip-sync stage entry
  narrationMode: null | 'pending' | 'dialogue' | 'voice-over' | 'mixed',
    // null until back-computed (project load) or first computed (lip-sync entry)
    // 'pending' during incremental scene generation
    // computed by reading scene.dialogueLines[*].isVoiceOver across all scenes

  subStyle: {
    preset:           '<preset name from mode-specific library>' | 'custom',
    description:      '<freeform 1-2 sentences, always populated>',
    motionGrammar:    '<phrase>' | null,
    lighting:         '<phrase>' | null,
    color:            '<phrase>' | null,
    composition:      '<phrase>' | null,
  },

  // new — orthogonal visual treatment (separate axis from sub-style)
  visualTreatment: {
    treatment:   'photorealistic' | 'watercolor' | 'oil-painting' | 'anime' | 'comic' |
                 'pixel-art' | '3d-render' | 'sketch' | 'ukiyo-e' | 'stained-glass' |
                 'illustrated' | null,
    description: '<freeform 1 sentence describing the visual treatment>' | null,
  },

  videoProvider: {
    id:                'kling-v1.6' | 'veo-3' | 'runway-gen3' | 'pika-1' | ...,
    durationTiers:     [5, 10],     // available — selection is the planner's job (v2 fix #1)
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
  durationSec:       7.4,            // creative target chosen by agent (continuous)
  durationTier:      10,              // mechanical: provider tier covering segments
  segmentPlan:       [                 // computed by segment planner (two-pass)
    { idx: 0, durationSec: 5, role: 'main',         prompt: '<per-segment>' },
    { idx: 1, durationSec: 5, role: 'continuation', prompt: '<per-segment>' },
  ],
  segmentPlanPass:   'estimate' | 'actual',  // tracks which pass produced this plan
  croppedTailSec:    3,                 // 5+5 = 10s output; audio is 7s; last 3s never seen

  // new — visual decoupling
  visualSubjectIds:  ['char_maya'],     // who's on-screen, independent of who speaks

  // new — dialogue is an array
  dialogueLines:     [                  // see §6.5 shim for `scene.dialogue` access
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

  // new — silence regions, produced by segment planner pass 2 (v2 fix #7)
  // Consumer: Gemini split-prompt call uses these to know where dialogue vs silence
  // falls within each segment window, so trailing silence is designed as low-motion.
  audioRegions:      [
    { startMs: 0,    endMs: 1500, type: 'pre-roll-silence' },
    { startMs: 1500, endMs: 6200, type: 'dialogue', lineIdx: 0 },
    { startMs: 6200, endMs: 7000, type: 'post-roll-silence' },
  ],

  // new — per-scene style override (rare; null on most scenes)
  styleOverride:     <subStyle object> | null,

  // new — derived per-scene from framing + visualSubjectIds + lineCount
  continuityImportance: 'low' | 'medium' | 'high',

  // removed
  // dialogue:  <single object>     ← replaced by dialogueLines[] (with shim per §6.5)
  // duration:  <continuous>        ← replaced by durationSec + durationTier
  // durationStatus, durationDriftPct, audioStale  ← all removed (drift detection deleted)
}
```

### 5.3 Brainstorm finalise schema (changed)

A new `visualStyle` and `visualTreatment` object on all four mode schemas. Always populated — even for sessions where style was set in the wizard before chat begins (in which case the wizard pick wins; the AI just carries it through).

```js
finalScript = {
  title, tone, scenes, ...                              // existing

  visualStyle:     <same shape as createJobState.subStyle>,
  visualTreatment: <same shape as createJobState.visualTreatment>,
}
```

### 5.4 Wizard state (changed for Quick mode only)

```js
brainstormState.wizardAnswers = {
  type:             'social' | 'tutorial',          // Quick mode types only
  length:           '30s' | '60s' | '90s',
  visualStyle:      <subStyle shape>,                 // new — Quick mode wizard step 3
  visualTreatment:  <visualTreatment shape>,          // new — paired with style pick
}

// For Brand/Film direct-entry modes (hero cards), style is set on a separate
// inline picker that mounts after the existing narrator-choice screen.
// See §10.6.
brainstormState.narratorChoice = {
  enabled: bool,
  name: '<string>',
  onScreenStyle: 'voice-only' | 'talking-head'
};
brainstormState.visualStyle      = <subStyle shape>;       // set by Brand/Film inline picker
brainstormState.visualTreatment  = <visualTreatment shape>; // set by Brand/Film inline picker
```

## 6. Schema migration (Phase 2 — high risk)

This is the lynchpin phase, marked **high risk** (v2 fix #11). All 42 `scene.dialogue` reference sites must continue working through the migration window.

### 6.1 Subdivision: Phase 2a vs 2b

- **Phase 2a — Schema + shim + writer migration.** Lands first. Adds `dialogueLines[]`, `visualSubjectIds`, `durationSec`, `durationTier`, `segmentPlan`, `croppedTailSec`, `audioRegions`, `styleOverride`, `continuityImportance` to scene shape. Installs the `Object.defineProperty` shim on every scene object so legacy reads of `scene.dialogue` continue to resolve. Migrates **writer-class consumers**: `castEnforceCutOnSpeaker`, the storyboard agent's JSON output handling, `processOriginalAudio`, `processReTTS`, any code path that produces scenes.

- **Phase 2b — Reader migration.** All sites that read `scene.dialogue`, `scene.dialogue.text`, `scene.dialogue.speakerCharacterId`, etc. migrated to read `scene.dialogueLines[i]`. The shim still exists during 2b for safety; gets removed at the end of 2b after all readers are migrated.

### 6.2 The `Object.defineProperty` shim (v2 fix #11)

```js
function attachDialogueShim(scene) {
  if (Object.getOwnPropertyDescriptor(scene, 'dialogue')) return;  // idempotent

  Object.defineProperty(scene, 'dialogue', {
    configurable: true,
    enumerable:   false,           // doesn't surface in JSON.stringify (avoids round-trip duplication)
    get() {
      return (this.dialogueLines && this.dialogueLines[0]) || null;
    },
    set(value) {
      // Legacy writer wrote a single dialogue object — translate
      this.dialogueLines = value ? [legacyDialogueToLine(value)] : [];
    },
  });
}

function legacyDialogueToLine(legacyDialogue) {
  return {
    speakerCharacterId: legacyDialogue.speakerCharacterId,
    text:               legacyDialogue.text,
    mood:               legacyDialogue.voiceOverride?.mood || 'matter-of-fact',
    isVoiceOver:        legacyDialogue.isVoiceOver || false,
    withinSceneStartMs: 0,
    withinSceneEndMs:   (legacyDialogue.audioActualDuration || 0) * 1000,
    audioBufferKey:     null,
    regenCount:         legacyDialogue.regenCount || 0,
    regenLockToken:     legacyDialogue.regenLockToken || null,
    voiceOverride:      legacyDialogue.voiceOverride || null,
    muted:              legacyDialogue.muted || false,
  };
}
```

The shim is installed every time a scene is created or loaded:

- New scenes from the storyboard agent: shim attached after JSON parse.
- Scenes restored from saved projects: shim attached during project load.
- Scenes with `additionalTurns`: `castEnforceCutOnSpeaker` migration in Phase 2a converts them to `dialogueLines[]` directly; shim isn't needed.

This lets every reader site continue working unchanged through Phase 2a. Phase 2b then rewrites readers to use `dialogueLines[]` directly; the shim is removed at the end of 2b.

### 6.3 Writer migration in Phase 2a

The writer-class sites (must migrate in Phase 2a):

| Site | What it writes | Migration |
|---|---|---|
| Storyboard agent JSON output → scene constructor | One `dialogue` object per scene | Construct `dialogueLines: [<one entry>]` directly; populate from agent's new `dialogueLines[]` schema once the agent prompt rewrite (Phase 3) lands |
| `castEnforceCutOnSpeaker` | Splits one scene with `additionalTurns` into N close-up scenes | Reads `additionalTurns` (legacy) for one phase window; if scene has `dialogueLines[]`, branches based on framing per §11.4 (preserve two-shots, split close-ups) |
| `processOriginalAudio` (audio input Mode A) | Already produces `dialogueLines[]` per [audio-input-plan.md §9.1](audio-input-plan.md) — already aligned |
| `processReTTS` (audio input Mode B) | Already produces `dialogueLines[]` per audio-input-plan §9.2 — already aligned |
| Project autosave / restore | Round-trips scenes through JSON | Restore writes `dialogueLines[]`; shim attaches on read; legacy projects with `dialogue` get migrated lazily on first edit |

### 6.4 Reader migration in Phase 2b

The 42 grep hits for `scene.dialogue` resolve through the shim during 2a. In Phase 2b, each is migrated explicitly:

| Site (file:line approximate) | What it reads | Migration target |
|---|---|---|
| `buildAudioSection` (33-audio-rehearsal) | `scene.dialogue.{speakerCharacterId, text, isVoiceOver, muted}` | Iterate `scene.dialogueLines[]` rendering one row per line (§13.1) |
| `_regenSceneAudio` (33-audio-rehearsal) | All dialogue keys | Per-line regen targeting `scene.dialogueLines[lineIdx]` |
| `_showDriftPopup` (33-audio-rehearsal) | `scene.dialogue` | Removed entirely (drift detection deleted) |
| `prepareLipSyncForExport` | `scene.dialogue.{speakerCharacterId, isVoiceOver}` | Loop through `dialogueLines[]`, route per line via §12.1 |
| `castBuildFramingMotionPrompt` | `scene.dialogue` | Read `dialogueLines[]`; framing intent now driven by agent's choice, not derived from dialogue presence |
| `castShouldUseMultiVoice` | `scene.dialogue` | Reads `dialogueLines.length > 0 && dialogueLines.some(l => !l.isVoiceOver)` |
| `_showVoiceOverflowMenu`, `_showRegionContextMenu` | `scene.dialogue` | Per-line context (lineIdx provided by caller) |
| `castGenerateMultiVoiceAudio` (caller) | `segment.dialogue.{speakerCharacterId, text}` | Caller passes `segments` constructed from `dialogueLines[]` directly |

End of Phase 2b: shim removed. Saved projects from before Phase 2a still load correctly because the shim's `set` path translates on first write.

### 6.5 Migration testing requirement

Phase 2a lands behind a feature flag. Integration tests cover every reader site listed in §6.4 to verify the shim resolves correctly. Tests run on:
- A fresh project created post-2a (uses `dialogueLines[]` natively).
- A saved project from before 2a (loaded via shim).
- A project mid-edit where some scenes have legacy structure and some have new (worst case during incremental migration).

Phase 2b lands only after every reader is migrated and tests pass.

## 7. Provider abstraction (v2 fix #1)

The `videoProvider` config object is the single point of provider-specific knowledge — but it does NOT encode the tier-selection algorithm. Selection lives in the planner.

### 7.1 What the config holds

```js
videoProvider = {
  id:                'kling-v1.6',
  durationTiers:     [5, 10],        // available tiers — sorted ascending
  minClipSec:        5,
  maxClipSec:        10,
  continuation: {
    supported:           true,
    mode:                'last-frame-i2v',
    overlapSec:          0,
  },
  lipSyncCompatibility: {
    tier1MediaPipe:      true,
    tier2Provider:       'kling-fal',  // null if no Tier 2
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

The config is **declarative** — it describes what the provider supports. There is no `selectTier(audioMs)` function on the config. Tier selection is the planner's responsibility (§8.2).

### 7.2 What's NOT in the config (v2 fix #1)

- No tier-selection algorithm. Phase 1 wraps existing Kling submit/poll into the new uniform interface but does not encode the legacy `buildClipPlan` ≤12s rule into the config. Phase 7 introduces the new tier-selection rule cleanly into `planSegments` without breaking the Phase 1 contract.
- No prompt construction. The planner constructs prompts (with Gemini split-prompt help). Provider just receives them.
- No stitching. Stitching is a pipeline-level concern (§8.4); the provider returns individual clip URLs.

### 7.3 Uniformed interface

```js
provider.submit(imgDataUrl, prompt, durationSec, opts)  → { taskId }
provider.pollTask(taskId)                                → { status, videoUrl }
```

For Phase 1 (Kling-v1.6), these wrap [js/21-kling.js:35](js/21-kling.js#L35) `submitKlingI2V` and the existing pollKlingTask. For future providers, new wrappers follow the same shape.

## 8. Segment planner (Phase 7)

### 8.1 Two-pass model (v2 fix #3)

Tier choice depends on actual audio duration. Audio doesn't exist at storyboard time. So the planner runs twice:

**Pass 1 — Estimate (at storyboard time):**
- Input: `scene.durationSec` (agent's creative target estimate)
- Output: initial `segmentPlan` (likely correct for >85% of scenes)
- `scene.segmentPlanPass = 'estimate'`

**Pass 2 — Actual (at audio rehearsal lock time):**
- Input: actual `audioMs` from TTS / user audio recording
- Output: revised `segmentPlan` with actual segment count and `audioRegions[]`
- `scene.segmentPlanPass = 'actual'`
- If tier promotion needed (estimate said 5s tier, actual TTS is 5.4s → 10s tier), trigger Class B cascade with confirmation if downstream scenes already have video generated.

The pass-2 trigger lives in the audio rehearsal lock step. Every scene runs through pass 2 before video generation; tier mismatches escalate to confirm dialogs.

### 8.2 The planner function

```js
planSegments({
  audioMs,                                     // null in pass 1 (use scene.durationSec * 1000)
  provider,                                    // videoProvider config
  scene,                                       // for prompt + framing + visualSubjects + dialogueLines
  requiresLipSync,                             // computed: any line with isVoiceOver === false
  continuityImportance,                        // 'low' | 'medium' | 'high'
  pass:                'estimate' | 'actual',
}) → {
  segments: [
    { idx: 0, durationSec: 5, role: 'main',         prompt: '<per-segment>' },
    { idx: 1, durationSec: 5, role: 'continuation', prompt: '<per-segment>' },
  ],
  audioRegions:    [...],                       // populated in pass 2 only
  totalGenSec:     10,
  croppedTailSec:  3,                           // pass 2 only
  expectedCost:    0.40,
  fallbackPlan:    <plan if continuation fails>,
}
```

### 8.3 Tier-selection algorithm

The selection rule lives here (NOT in provider config — v2 fix #1):

```
const splitThreshold = 7.0;            // tunable; see edge case discussion
const sourceMs = audioMs ?? scene.durationSec * 1000;

let remainingMs = sourceMs;
let segments = [];
let isFirst = true;

while (remainingMs > 0) {
  let tier;

  if (isFirst) {
    // First-segment policy: prefer single tier when audio fits below split threshold
    const fitsTier = pickSmallestTierAbove(provider.durationTiers, remainingMs / 1000);
    const splittable = remainingMs / 1000 > splitThreshold;

    if (splittable && fitsTier > provider.durationTiers[0]) {
      // Split: use smallest tier as base, continuation handles tail
      tier = provider.durationTiers[0];
    } else {
      // Single tier covers it cleanly
      tier = fitsTier;
    }
  } else {
    // Continuation: always smallest tier
    tier = provider.durationTiers[0];
  }

  segments.push({ idx: segments.length, durationSec: tier, role: isFirst ? 'main' : 'continuation' });
  remainingMs -= tier * 1000;
  isFirst = false;
}

const totalGenMs = segments.reduce((s, x) => s + x.durationSec * 1000, 0);
const croppedTailSec = (totalGenMs - sourceMs) / 1000;
```

For `durationTiers: [5, 10]` and `splitThreshold: 7.0`:

| Audio | Plan | Cropped | Reason |
|---|---|---|---|
| 4.0s | [5s] | 1.0s | Fits 5s tier |
| 5.0s | [5s] | 0.0s | Exact fit |
| 5.5s | [10s] | 4.5s | 5.5 < splitThreshold → single tier |
| 6.5s | [10s] | 3.5s | 6.5 < splitThreshold → single tier |
| 7.0s | [10s] | 3.0s | At threshold → single tier |
| 7.5s | [5s, 5s] | 2.5s | > threshold → split for prompt-pacing |
| 9.5s | [5s, 5s] | 0.5s | > threshold → split |
| 10.0s | [5s, 5s] | 0.0s | > threshold → split (or 10s tier — see edge case #2 below) |
| 10.5s | [10s, 5s] | 4.5s | Forced continuation |
| 12.0s | [10s, 5s] | 3.0s | Forced continuation |

The threshold is a tunable. v1 default is 7.0s; can be lowered to favor more splits or raised to favor single-tier rendering. Telemetry tracks tier-promotion rate to inform tuning.

### 8.4 Gemini split-prompt call (replaces `generateContinuationPrompt` — v2 fix #9)

When `segments.length > 1`, the planner makes a Gemini call to derive per-segment prompts. This **replaces** the existing `generateContinuationPrompt` at [js/21-kling.js:137](js/21-kling.js#L137); Phase 7 deletes that function and the legacy continuation loop in `_animateSingleScene`.

Model: **gemini-2.5-flash** (consistent with other Stori Gemini calls). Cost: ~$0.001 per scene that needs splitting (input ~1k tokens, output ~500 tokens). Latency: 1–2s, runs in parallel with image gen for the same scene.

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
  audioMs:               7000,
  audioRegions: [                        // input from segment planner pass 2 (v2 fix #7)
    { startMs: 0,    endMs: 1500, type: 'pre-roll-silence' },
    { startMs: 1500, endMs: 6200, type: 'dialogue', lineIdx: 0 },
    { startMs: 6200, endMs: 7000, type: 'post-roll-silence' },
  ],
  continuityImportance:  'high',
  styleHint:             '<subStyle.description>',
  treatmentHint:         '<visualTreatment.description>',
}
```

The Gemini prompt enforces:

- **Continuation segments anchor on prior frame.** Anchor strength tuned by `continuityImportance`.
- **Trailing tail designed as low-motion.** Critical for clean cropping.
- **Dialogue beats placed within segment windows.** The `audioRegions[]` input tells Gemini exactly where the dialogue happens within the 10s composed window, so silence regions get explicit motion design (breath, eyeline shift, settled pose) instead of generic filler.
- **Lines spanning segment boundaries referenced in both segments' prompts.**

### 8.5 Stitching strategy (v2 fix #6)

Stitching is **bifurcated** by lip-sync routing:

| Lip-sync route | Stitching method | Reason |
|---|---|---|
| Tier 2 (Kling LipSync via fal.ai) | **Server-side ffmpeg via R2/CF** | fal.ai requires a public HTTP URL for the video |
| Tier 1 (MediaPipe overlay) | Client-side MediaSource Extensions | Local rendering only; in-memory blob is fine |
| No lip sync (voice-over project, b-roll) | Either path acceptable | Whichever is faster; default to MSE |

This means **Tier 2 is gated on R2/CF infrastructure availability** (currently deferred per voice-and-lipsync-plan Phase 9). For v1 of this plan, two options:

1. **Ship Phase 9 (R2/CF infra) before this plan's Phase 7.** Cleanest. All scenes can use Tier 2 if applicable.
2. **Ship this plan with Tier 2 disabled for multi-segment scenes.** Single-segment scenes still use Tier 2 (one Kling clip, fal.ai-reachable URL exists). Multi-segment scenes fall back to Tier 1. v1.5 enables Tier 2 across multi-segment when R2 ships.

v1 of this plan adopts option 2 (ship without R2 dependency, accept Tier 1 fallback for multi-segment lip-sync scenes). v1.5 lifts the restriction once R2 lands.

### 8.6 Failure handling

- **Continuation clip fails:** retry once. On second failure, use `fallbackPlan` (single-tier rendering with stretched action). User notice in rehearsal step.
- **Last-frame extraction fails:** same fallback.
- **Stitching fails (server or client):** retry once; fall back to per-segment playback in the editor (segments play sequentially without seamless join).
- **Gemini split-prompt fails:** deterministic fallback — segment 0 uses original motion prompt verbatim, segment 1 gets a generic continuity suffix.

## 9. Style system (three layers + orthogonal treatment)

### 9.1 Layer 1 — Flow style (`videoType` constants)

Same as v1 §8.1. Code constants per `videoType`, not user-editable.

### 9.2 Layer 2 — Sub-style (user pick from preset library)

A mode-aware preset library. v2 introduces an explicit decomposition: **sub-style** describes cinematic genre (drama / luxury / documentary), while **visual treatment** describes the rendering aesthetic (photorealistic / watercolor / anime). They are orthogonal (v2 fix #10).

```js
const SUB_STYLE_PRESETS = {
  film: {
    drama:         { description, motionGrammar, lighting, color, composition, sampleImage },
    thriller:      { ... },
    romance:       { ... },
    action:        { ... },
    documentary:   { ... },
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

### 9.3 Visual treatment (orthogonal axis — new in v2)

```js
const VISUAL_TREATMENTS = {
  photorealistic:  { description: 'Photorealistic rendering' },
  watercolor:      { description: 'Watercolor painting style' },
  'oil-painting':  { description: 'Oil painting style' },
  anime:           { description: 'Anime / Japanese animation style' },
  comic:           { description: 'Comic book / graphic novel illustration' },
  'pixel-art':     { description: 'Pixel art / retro game style' },
  '3d-render':     { description: 'Stylized 3D render' },
  sketch:          { description: 'Pencil / charcoal sketch' },
  'ukiyo-e':       { description: 'Japanese woodblock print style' },
  'stained-glass': { description: 'Stained glass aesthetic' },
  illustrated:     { description: 'Hand-drawn illustration' },
};
```

Treatment is independent of sub-style: a "film-drama in watercolor" is valid; "brand-luxury in 3d-render" is valid. The user picks both — sub-style first (cinematic frame), treatment second (rendering aesthetic). Most users pick `photorealistic` as treatment; the others are stylistic exceptions.

### 9.4 Layer 3 — Per-scene override

`scene.styleOverride` defaults null; replaces Layers 1+2 when set. Surfaced only in the storyboard editing UI as Class B edit.

### 9.5 Style injection points

Six points across the pipeline. Each reads `mergedStyle = scene.styleOverride || project.subStyle` and `mergedTreatment = project.visualTreatment`. (Treatment is project-level only; per-scene treatment override is v2 nice-to-have, not core.)

| Injection point | Style fields used |
|---|---|
| Storyboard agent system prompt | mergedStyle (all fields) + mergedTreatment.description |
| Image generation prompt | mergedStyle (description + lighting + color + composition) + mergedTreatment (description) |
| Motion prompt builder | mergedStyle (description + motionGrammar) appended to agent's motion prompt |
| Gemini split-prompt call | mergedStyle (all) + mergedTreatment passed in as context |
| Continuity prompt for multi-segment | mergedStyle.motionGrammar informs continuity tone |
| Brainstorm chat AI system prompt | mergedStyle + mergedTreatment as locked context |

## 10. Wizard / style-gate UX (v2 fix #5)

### 10.1 Quick mode (autopilot, social/tutorial) — three-step wizard

```
Step 1: Type      [social | tutorial]
Step 2: Length    [30s | 60s | 90s | custom]
Step 3: Style     [grid of autopilot sub-style presets + treatment picker + Custom + Advanced]

         ↓ Confirm and start

Step 4: Chat      [type + length + style displayed read-only in side panel]
```

The wizard chip mechanism at [js/26-brainstorm.js:434](js/26-brainstorm.js#L434) (`_handleWizardChip`) gets a third question (`style`). The `wizardAnswers` object grows by two keys (`visualStyle`, `visualTreatment`).

### 10.2 Brand and Film modes (hero card direct entry) — inline style picker

This is the v1 gap the audit caught. Brand and Film bypass the Quick wizard entirely (per [js/26-brainstorm.js:289-292](js/26-brainstorm.js#L289-L292)). They go: hero card click → `_confirmMode` → existing narrator-choice screen → chat.

The fix: insert an inline style picker **after the existing narrator-choice screen**, **before chat begins**. Flow becomes:

```
Brand or Film hero card
  ↓
_confirmMode('brand-product' | 'film-narrative', 'copilot')
  ↓
Existing narrator-choice screen (already exists)
  ↓
★ Inline style picker (new — same UI component as Quick wizard step 3)
  ↓
Chat begins (with style locked in system prompt)
```

The narrator-choice screen wiring at [js/26-brainstorm.js:316](js/26-brainstorm.js#L316) (`_wireNarratorChoiceScreen`) gets a continuation hook: after the user confirms narrator (or no narrator), the inline style picker mounts. Picking style + clicking "Confirm" transitions to chat.

The picker UI is the same component used in Quick mode wizard step 3 — same preset grid, same treatment picker, same "Custom" + Advanced disclosure. Only the mounting point differs. Style writes to `brainstormState.visualStyle` and `brainstormState.visualTreatment` (not into `wizardAnswers` since Brand/Film don't use the wizard chip flow).

### 10.3 Style picker UI component

A grid of preset cards, treatment picker dropdown, optional Advanced fields. The component is shared across:
- Quick wizard step 3
- Brand/Film inline picker (after narrator choice)
- Style gate in text input flow (§11.1)
- Style gate in audio input flow (§11.2)

**Validation site (v2 fix #14, edge case #29):** the picker component owns its own validation. "Custom" requires ≥10 chars in description; structured fields default to preset values. The component exposes a `validate()` method returning `{ valid, errors[] }` that the embedding screen calls before allowing "Continue."

### 10.4 Locked frame — no mid-session change

Once chat begins (in any mode), the locked frame (type / length / style / treatment) is immutable for that session. Side panel shows it read-only. The only escape: start a new session. (Same as v1.)

### 10.5 Chat AI system prompt receives the locked frame

(Same as v1 §9.3 — chat AI references but never re-elicits style.)

### 10.6 Brand/Film flow integration detail

`_confirmMode` at [js/26-brainstorm.js:502](js/26-brainstorm.js#L502) currently:
1. Sets `brainstormState.mode` and `pipeline`.
2. Routes to narrator-choice screen for Brand/Film.

After v2:
1. Same.
2. Same — but after narrator confirm, route to inline style picker, then to chat.

The narrator-choice screen UI (DOM ID `bs-narrator-choice` or similar) gets a "Next" button at the bottom that, when clicked, hides itself and shows the inline style picker mount point. Picker's "Confirm" button hides the picker and shows the chat screen.

This is a small additive change to the existing screen graph. No restructuring of the wizard flow needed.

## 11. Style gate for text + audio input

### 11.1 Text input flow

```
1. User pastes text
2. Parser extracts scenes / dialogue / characters
3. User reviews parsed structure (existing review gate)
4. ★ Style gate (new — same picker component as §10.3)
5. Storyboard agent fires
```

### 11.2 Audio input flow

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

### 11.3 Skip detection: brainstorm finalise → Copilot

If `createJobState.subStyle` and `createJobState.visualTreatment` are already populated (came from brainstorm wizard / Brand-Film inline picker), the style gate is skipped. Otherwise, gate fires.

### 11.4 Optional: AI suggestion (v1 nice-to-have)

A small Gemini-2.5-flash call analyzes input content (~500 chars) + the preset list, returns one suggested preset. ~$0.001 per project, ~1s latency. User still picks.

## 12. Storyboard agent rewrite (Phase 3)

### 12.1 Removed rule

The forced-close-up rule at [js/17b-create-references.js:2931](js/17b-create-references.js#L2931) is removed.

### 12.2 New schema and instructions

Same as v1 §11.2. Agent emits `durationSec`, `visualSubjectIds`, `framing` (free choice), `motionPrompt`, `dialogueLines[]` with per-line `isVoiceOver`.

Style + treatment hints injected from `createJobState.subStyle` and `createJobState.visualTreatment`.

### 12.3 Validator stage

Same as v1 §11.3. Auto-corrects `isVoiceOver` inconsistencies, splits >2-speaker scenes, validates `visualSubjectIds`.

### 12.4 `castEnforceCutOnSpeaker` updated (Phase 2a writer migration)

Same logic as v1 §11.4 — preserves two-shot framings unchanged, splits only single-character framings with multiple speakers. Implementation lands in Phase 2a as part of the writer migration.

### 12.5 New framings added

`two-shot-medium`, `two-shot-wide`, `over-shoulder-back-listening`.

## 13. Lip sync routing per line

### 13.1 The router

Same as v1 §12.1. Per-line `isVoiceOver` gates lip sync; multi-speaker scenes force Tier 1.

### 13.2 Tier 1 (MediaPipe) face-position upgrade

Same as v1 §12.2.

### 13.3 Tier 2 (Kling LipSync) gating

Same as v1 §12.3 + the v2 stitching constraint (§8.5): Tier 2 multi-segment scenes are deferred to v1.5 when R2/CF infra ships. Single-segment scenes use Tier 2 normally.

### 13.4 Voice-over project shortcut (v2 fix #4)

`narrationMode === 'voice-over'` skips Tier 1 + Tier 2 entirely. **Lazy computation:** `narrationMode` is computed when the lip-sync stage entry point is reached, not at storyboard commit time.

```js
function computeNarrationMode(scenes) {
  let hasOnScreen = false;
  let hasVoiceOver = false;
  for (const scene of scenes) {
    for (const line of (scene.dialogueLines || [])) {
      if (line.isVoiceOver) hasVoiceOver = true;
      else hasOnScreen = true;
    }
  }
  if (!hasOnScreen && !hasVoiceOver) return 'voice-over';   // no dialogue at all = treat as VO (b-roll)
  if (!hasOnScreen)                  return 'voice-over';
  if (!hasVoiceOver)                 return 'dialogue';
  return 'mixed';
}
```

This runs:
1. At lip-sync stage entry (after audio rehearsal lock, before lip-sync work begins).
2. After any user edit that flips `isVoiceOver` on any line — re-computed and cached on `createJobState.narrationMode`.
3. Lazily on project load (§16.3) to back-compute for legacy saved projects.

## 14. Per-image-card UI

Same as v1 §13.

## 15. Edit cascades (Class A / B / C)

Same as v1 §14, with the addition that **tier promotion is an explicit Class B trigger** (v2 fix #3): if pass-2 `planSegments` returns a different tier than pass-1, the user sees a Class B confirmation modal listing motion-prompt regen + video regen + downstream startTime shift cost.

## 16. Voice-over project shortcut

### 16.1 Detection

Lazy, per §13.4.

### 16.2 Shortcuts when `'voice-over'`

Same as v1 §15.2.

### 16.3 Back-computation for saved projects (v2 fix #12)

On project load:

```js
function backfillNarrationMode(state) {
  if (state.narrationMode != null) return;             // already set
  const scenes = state.scenes || [];
  state.narrationMode = computeNarrationMode(scenes);
}
```

Called at the end of project restore, before any rendering or lip-sync work begins. Handles projects saved before this feature shipped.

## 17. Cleanup / removals

### 17.1 Code paths removed

- **Drift detection**: the **symmetric 3% gate** in `canGenerateVideos()` ([js/33-audio-rehearsal.js:687](js/33-audio-rehearsal.js#L687)) is replaced by a per-scene tier-fit check. (v2 fix #8 — characterized correctly as symmetric, not asymmetric.)
- `computeDurationStatus` truth table (matched/stretched/compressed/exceeds) — gone.
- `audioRehearsal.audioStale` flag and propagation logic — gone.
- soundtouch-js dynamic loader and `timeStretchAudioBuffer` — gone.
- `degraded-mode-banner` — gone (no soundtouch to fail).
- `buildClipPlan` and `_animateSingleScene`'s continuation loop ([js/21-kling.js:175-235](js/21-kling.js#L175-L235)) — replaced by `planSegments` + provider abstraction.
- `generateContinuationPrompt` ([js/21-kling.js:137](js/21-kling.js#L137)) — replaced by Gemini split-prompt call (v2 fix #9).

### 17.2 Schema fields removed (after Phase 2b shim removal)

- `scene.dialogue` (singular) — replaced by `dialogueLines[]`
- `scene.duration` — replaced by `durationSec` + `durationTier`
- `scene.durationStatus`, `scene.durationDriftPct`, `scene.audioStale` — drift detection deleted

### 17.3 `STYLE_PRESETS` migration table (v2 fix #10)

Old global at [js/17a-create-api.js:49](js/17a-create-api.js#L49) had 20 entries. Each maps either to a new sub-style preset, a visual treatment, or both:

| Old preset | Maps to (sub-style) | Maps to (treatment) | Notes |
|---|---|---|---|
| `cinematic` | film/drama (default) | photorealistic | Default for film projects |
| `noir` | film/thriller | photorealistic | High-contrast lighting cue carried in sub-style |
| `gothic` | film/thriller | photorealistic | Atmospheric darkness in sub-style |
| `vintage` | film/drama | photorealistic | Period-aesthetic in style description |
| `surrealism` | film/experimental | photorealistic | |
| `flat-design` | brand/tech-saas | illustrated | Treatment is explicit illustration |
| `minimalist` | brand/luxury | photorealistic | Restraint cue in sub-style |
| `pop-art` | brand/indie | comic | Treatment is comic |
| `pastel` | brand/beauty | photorealistic | Color palette cue in sub-style |
| `corporate` | brand/corporate | photorealistic | Direct mapping |
| `watercolor` | (preserves existing sub-style) | watercolor | Treatment only |
| `oil-painting` | (preserves) | oil-painting | Treatment only |
| `anime` | (preserves) | anime | Treatment only |
| `comic` | (preserves) | comic | Treatment only |
| `pixel-art` | (preserves) | pixel-art | Treatment only |
| `3d-render` | (preserves) | 3d-render | Treatment only |
| `sketch` | (preserves) | sketch | Treatment only |
| `digital-art` | (preserves) | illustrated | Treatment only |
| `ukiyo-e` | (preserves) | ukiyo-e | Treatment only |
| `stained-glass` | (preserves) | stained-glass | Treatment only |

The 5 entries in the first group (cinematic/noir/gothic/vintage/surrealism) replace both axes — they imply both a sub-style and the photorealistic treatment. The 5 in the second group (flat-design/minimalist/pop-art/pastel/corporate) similarly imply both. The 10 in the third group are pure treatment overrides — they preserve whatever sub-style the project already has and override only the rendering aesthetic.

For projects opened post-v2 with one of these old presets:
- Group 1 + 2: auto-mapped as shown; user reviews on first edit.
- Group 3: treatment auto-set; sub-style defaults to mode's most generic preset (film → drama, brand → corporate, etc.); user reviews on first edit.

`photorealistic` is added explicitly to the treatment list because the v1 `STYLE_PRESETS` already had it and many projects used it.

## 18. Edge cases

| # | Case | Behavior |
|---|---|---|
| 1 | Audio exactly 5.0s | One 5s segment. No split. |
| 2 | Audio between 5.1s and 7.0s (below split threshold) | Single 10s tier (smallest tier ≥ audio). No split, action stretched. (v2 fix #14 wording — clear that "below threshold = single tier", not vice versa.) |
| 3 | Audio 9.5s (above threshold) | Split [5s, 5s]. Stitched. |
| 4 | Audio 10.1s | Forced continuation: [10s, 5s]. 4.9s cropped. |
| 5 | Audio > 25s | Recursive continuation chain: [10s, 10s, ...]. |
| 6 | Reaction shot — speaker off-screen | `isVoiceOver: true` derived; lip sync skipped for that line. |
| 7 | Two-shot, both speakers on-screen, alternating | Tier 1 only. Tier 2 can't disambiguate. |
| 8 | Wide-establishing with dialogue | `isVoiceOver: true` derived; mouth not resolvable at scale. |
| 9 | Long monologue > 15s | Forced continuation. Agent picks natural sentence boundary if user-visible split needed. |
| 10 | TTS estimate wrong (pass 1 said 5s, actual TTS 5.4s) | Pass 2 promotes to 10s tier. Class B cascade with confirmation if downstream scenes have video. |
| 11 | User edits to add a third dialogue line | Class A initially; tier promotion → escalates to Class B. |
| 12 | User changes line speaker from on-screen to off-screen | `isVoiceOver` flips; lip sync teardown; image/video unchanged. Cheap. |
| 13 | User changes `visualSubjectIds` from `[maya]` to `[maya, joe]` | Class B. Image regen needed. All lines recompute `isVoiceOver`. |
| 14 | User splits a scene mid-line | Forbidden. Splits land on line boundaries only. |
| 15 | Audio input Mode A | Audio durations fixed. Tier rounded up; remaining silence is real silence in recording. Style gate inserts before storyboard. |
| 16 | Audio input Mode B | Same as text input post-TTS. Style gate inserts before storyboard. |
| 17 | Voice-over narrator scene | All lines `isVoiceOver: true`. Tier rounded up; padding is silence. No lip sync. |
| 18 | B-roll with no audio | Scene tier is agent's choice. Pad audio with silence. Lowest cost. |
| 19 | Three+ speakers in rapid exchange | Forbidden in one scene. Validator splits. |
| 20 | Continuation Kling clip fails | Retry once. Fallback to single-tier rendering with notice. |
| 21 | Last-frame extraction fails | Same fallback. |
| 22 | Stitching fails | Retry once; degrade to per-segment playback in editor. |
| 23 | Gemini split-prompt fails | Deterministic fallback split. |
| 24 | Cost estimate jumps mid-edit | Pre-commit cost preview always shown for Class B + C. |
| 25 | User restarts brainstorm session mid-flow | Session discarded, no cost. |
| 26 | Saved session restore (pre-feature) | Style migration prompt; `narrationMode` back-computed lazily (§16.3). |
| 27 | Brainstorm finalise → Copilot → user wants different style | Storyboard editing UI Class B path. |
| 28 | Style picker enforced (no skip) | Both wizard step 3, Brand/Film inline picker, and text/audio gates require a pick. |
| 29 | User picks "Custom" with no description | Picker component validates: minimum 10 chars in description. (v2 fix #14 — validation lives in the shared style picker component.) |
| 30 | Two-shot with Tier 2 requested | Auto-falls back to Tier 1. Notice in editor. |
| 31 | Per-scene `styleOverride` clashes with project style | Allowed (intentional). |
| 32 | Mood per line contradicts project style | Allowed. Mood = voice; style = visual. Coexist. |
| 33 | Provider doesn't support continuation | Multi-segment scenes use independent clips with hard cuts. Continuity-importance `low` only; `medium`/`high` warn. |
| 34 | Provider's only tier is 5s | Long scenes chain many 5s segments. |
| 35 | Provider supports variable durations (e.g., Veo 3) | `durationTiers` becomes a continuous range or richer set. Planner picks exact match. |
| 36 | Tier 2 lip sync requested but R2 infra not yet shipped | v1 falls back to Tier 1 for multi-segment scenes; single-segment scenes still use Tier 2. v1.5 lifts the restriction. |

## 19. Phases / order of work

Reordered per audit findings:

| # | Phase | Deliverables | Risk | Depends on |
|---|---|---|---|---|
| **1** | Provider abstraction (interface only) | `js/providers/video-providers.js` with Kling-v1.6 config (tiers + capabilities only); uniformed `submit/poll` interface; existing Kling code wrapped. **Does NOT encode legacy tier-selection rule** (v2 fix #1). | low | none |
| **2a** | Schema + shim + writer migration | Add new scene fields (`dialogueLines[]`, `visualSubjectIds`, `durationSec`, `durationTier`, `segmentPlan`, `audioRegions`, `styleOverride`, `continuityImportance`); install `Object.defineProperty` shim for `scene.dialogue`; migrate writers (`castEnforceCutOnSpeaker`, storyboard agent JSON consumer, autosave). Integration tests cover every reader site. | **high** | 1 |
| **2b** | Reader migration | Migrate all 42 `scene.dialogue` reader sites to `scene.dialogueLines[]`. Remove shim at end. | medium | 2a |
| **3** | Storyboard agent prompt rewrite | Remove forced-close-up rule; add `isVoiceOver` derivation, free framing, two-shot framings; validator stage. | medium | 2a |
| **4** | Style system + preset library | Mode-aware `SUB_STYLE_PRESETS` library; orthogonal `VISUAL_TREATMENTS`; merged-style helper; six injection points wired. **Curated sample images** for ~30 presets — separate asset work item, parallel work. | medium | 3 |
| **5** | Brainstorm wizard step 3 (Quick mode) | Style picker in Quick wizard; `wizardAnswers.visualStyle` + `visualTreatment`; chat AI system prompt update. | low | 4 |
| **6** | Brand/Film inline style picker (v2 fix #5) | Inline picker mounts after `_wireNarratorChoiceScreen`; same component as wizard step 3; `brainstormState.visualStyle` + `visualTreatment` set there. | low | 4, 5 |
| **7** | Style gate for text + audio input | Same picker component; gate insertion in both flows; skip-when-already-set logic. | low | 4 |
| **8** | Segment planner + Gemini split-prompt | `planSegments` two-pass function; split-prompt Gemini call; provider-agnostic stitching strategy (server-side R2 or client-side MSE based on lip-sync route); `audioRegions[]` produced in pass 2 and consumed by split-prompt; failure fallbacks; **explicit deletion of `generateContinuationPrompt` and `_animateSingleScene` continuation loop** (v2 fix #9). | high | 1, 2a |
| **9** | Per-image-card N-rows audio | Multi-line UI; per-line controls; speaker visibility icons; status aggregation. | medium | 2b |
| **10** | Lip-sync routing per line | Router based on `isVoiceOver` + multi-speaker detection; Tier 1 position-based face matching upgrade; **lazy `narrationMode` computation** (v2 fix #4); back-computation on load (v2 fix #12); voice-over project shortcut. | medium | 8 (sequential — v2 fix #13) |
| **11** | Edit cascades UI | Class A / B / C edit surfaces with cost previews; structural edit mode. Tier promotion flagged as Class B. | medium | 9, 10 |
| **12** | Cleanup | Remove soundtouch-js, drift detection, symmetric 3% gate, degraded-mode banner, `buildClipPlan`, `generateContinuationPrompt`, old `STYLE_PRESETS` flat global. Migration writes for old presets per §17.3. | low | 11 |

**Sequential dependencies:** 1 → 2a → 2b. 1 → 8 → 10 (v2 fix #13: 8 and 10 cannot be parallelized; lip-sync routing depends on stitched-video output from segment planner). Phases 5/6/7 parallel to each other but all depend on 4. Phase 4 depends on 3.

**Total scope (revised):** ~3500 lines of new + changed code, ~900 lines deleted (Phase 12). Net add ~2600 lines. Across ~12 files.

**Calendar estimate:** 4–5 weeks single-engineer focused work. Phase 2a is the highest-risk single phase (~1 week alone with thorough integration testing). Phases 5–7 partially parallelizable; 8 → 10 sequential.

**Sample image asset pipeline:** ~30 presets need licensed-clear or commissioned reference stills. Parallel work: 1 week of curation + licensing or 2 weeks of commissioned generation. Doesn't gate code phases.

## 20. Theming considerations

Same as v1 §19. All new UI follows Aurora dark/light tokens.

## 21. Telemetry

Same as v1 §20, with one addition: track `pass1TierEstimateAccuracy` — the rate at which pass-1 estimate matches pass-2 actual without tier promotion. Drives the split-threshold tunable.

```js
{
  // ... existing v1 telemetry ...

  // New v2 telemetry
  segmentPlanPass1Tier:  { sceneId, tier },             // estimate
  segmentPlanPass2Tier:  { sceneId, tier },             // actual
  tierPromotionRate:     <ratio>,                        // pass-1 ≠ pass-2
  splitThresholdActive:  7.0,                            // current value of tunable
}
```

---

## Appendix A — Cross-plan integration touchpoints

(Same as v1 Appendix A.)

## Appendix B — Open questions deferred to v2 (now v2.5+)

1. Crossfade between segments — v2.5 quality improvement.
2. Multi-provider per project — v2.5.
3. Provider auto-selection per scene — v2.5.
4. Audio-conditioned video generation (when providers support it) — wait for provider capability.
5. Per-line style override — v2.5.
6. Brainstorm wizard for text/audio paths — v2.5 if user research warrants.
7. AI-suggested style based on input content — v1 nice-to-have, can ship in Phase 7.
8. Per-scene visual treatment override — v2.5.

## Appendix C — Audit response summary

The 14 audit findings from [cinematic-pipeline-plan-audit.md](cinematic-pipeline-plan-audit.md) are addressed in this v2 as follows:

| Audit # | Severity | v2 section addressing | Resolution |
|---|---|---|---|
| 1 | Critical | §7.2 | Provider config holds tiers only; selection in planner |
| 2 | Critical | §6.1 | Phase 2 split into 2a (writers) + 2b (readers) |
| 3 | Critical | §8.1 | Two-pass planner explicit |
| 4 | Critical | §13.4, §16.3 | Lazy + back-compute |
| 5 | Critical | §10.2, §10.6 | Inline style picker for Brand/Film |
| 6 | Critical | §8.5 | Bifurcated stitching; Tier 2 multi-segment deferred to v1.5 |
| 7 | Critical | §8.4 | `audioRegions[]` wired into split-prompt call |
| 8 | High | §17.1 | Retracted; characterized as symmetric |
| 9 | High | §3, §8.4, §17.1 | `generateContinuationPrompt` explicit replacement + deletion |
| 10 | Medium | §17.3 | Full mapping table for 20 entries |
| 11 | Medium | §6.1, §6.2, §19 | Phase 2 high risk; explicit shim |
| 12 | Medium | §16.3 | Back-computation algorithm |
| 13 | Phase ordering | §19 | 8 → 10 marked sequential |
| 14 | Minor | §10.3, §18 | Validation in picker component; edge case wording cleanup |

Plus the auditor's noted minor items:
- Sample image asset pipeline → §19 explicit work item
- Gemini model + pricing → §8.4 specifies gemini-2.5-flash, ~$0.001 per scene

---

End of v2 plan.
