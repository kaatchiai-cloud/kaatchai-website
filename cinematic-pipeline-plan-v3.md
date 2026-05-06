# Cinematic Pipeline Plan — v3

Status: design draft, not yet implemented. Supersedes [cinematic-pipeline-plan-v2.md](cinematic-pipeline-plan-v2.md) and [cinematic-pipeline-plan.md](cinematic-pipeline-plan.md).
Scope: replaces the current rendering pipeline's fixed assumptions with a provider-agnostic architecture where creative intent and rendering mechanics are independent.

Sibling to:
- [audio-rehearsal-plan.md](audio-rehearsal-plan.md)
- [audio-input-plan.md](audio-input-plan.md)
- [input-formats-plan.md](input-formats-plan.md)
- [voice-and-lipsync-plan.md](voice-and-lipsync-plan.md)
- [consistency-plan.md](consistency-plan.md)

Audit references:
- [cinematic-pipeline-plan-audit.md](cinematic-pipeline-plan-audit.md) — v1 audit (all 14 findings folded into v2)
- [cinematic-pipeline-plan-v2-audit-report.md](cinematic-pipeline-plan-v2-audit-report.md) — v2 audit (5 findings folded into this v3)

---

## 0. What changed from v2

| # | v2 issue | v3 fix |
|---|---|---|
| 1 | Phase 3 (storyboard agent rewrite) could land before Phase 2b (reader migration), causing the shim to silently drop lines 2+ in multi-line scenes | §6.1 Phases 3 and 3.5 split: Phase 3 keeps `castEnforceCutOnSpeaker` forced-split (single-speaker per scene) so producers never emit multi-line through the shim. Phase 3.5 lifts the constraint after Phase 2b completes. Shim hardened with console.warn on `dialogueLines.length > 1` access |
| 2 | `scene.duration` removed without compatibility shim while ~17 sites still depend on it | §6.3 adds explicit `scene.duration` shim with same `Object.defineProperty` pattern; getter resolves from `durationTier` / `durationSec` / legacy storage. Removed in late cleanup phase |
| 3 | `videoClips[]` and `clipDuration` fields dropped from the new scene shape; save/restore, animated export, canvas-state mirror all depend on them | §5.2 preserves `videoClips: [{ url, clipDuration }]` as first-class. `videoUrl` becomes the stitched output (or `videoClips[0].url` for single-segment). Phase 8 stitching produces both per-segment URLs and the stitched URL |
| 4 | Tier 1 multi-speaker scenes treated as a router tweak, but actual code is structurally single-speaker (leftmost-face matching, one sprite set per scene) | §13.2 + edge case #11: v1 forces multi-speaker visible scenes through cut-on-speaker (single-speaker scenes only). Multi-character face identity matching, per-character sprite stores, and frame-level speaker-to-face assignment are v1.5. Two-shot framings with simultaneous visible dialogue gated to v1.5 |
| 5 | `audioRegions[]` claimed precise timings but Mode B + multi-voice TTS don't produce per-line scene-local timings on the canonical contract | §8.4 adds explicit "timing finalization" sub-step in Phase 8: after audio rehearsal lock and before pass-2 `planSegments`, write `dialogueLines[i].withinSceneStartMs/EndMs` from canonical source. Mode A copies from existing `audioSegmentStartMs/EndMs`. Mode B + multi-voice TTS migrate from `seg.dialogue.actualStart/EndMs` ([js/17b-create-references.js:3484](js/17b-create-references.js#L3484)). `audioRegions[]` derived deterministically from these |

Plus secondary risks from v2 audit:

- **`STYLE_PRESETS` shared with Reels.** §17.3 keeps the old `STYLE_PRESETS` global as a back-compat alias for Reels until Reels gets its own style migration. Cleanup phase removes it from Copilot path only.
- **Calendar estimate revised.** §19 updates to 6–8 weeks single engineer (or 4–5 weeks split across two). Phase 2a alone is ~1.5 weeks with 42 reader sites.

---

## 1. Goal

Three user-visible outcomes:

1. **The agent picks framings by dramatic intent, not by lip-sync requirements.** Reaction shots, two-shots, wide establishing with dialogue, over-the-shoulder, profile — all valid. The pipeline routes lip sync per line based on whether the speaker is on screen and whether their mouth is visible.
2. **The script is not bent to fit the renderer.** A 7-second line stays a 7-second line. The renderer composes 5s and 10s segments to cover the audio, with prompt-aligned action per segment. Cuts at segment boundaries are mitigated by Gemini-derived continuity prompts.
3. **The video provider is a swappable component.** Kling, Veo, Runway, Pika, future providers all plug in via a single config object.

Behind the scenes, brainstorming, text input, and audio input all commit to the same creative frame (type / length / style) before generation begins, locked, and propagate that frame uniformly through every downstream stage.

## 2. Non-goals (v1)

- Not a generative model retraining effort.
- Not a multi-take / variant system. Each scene has one rendered video at a time.
- Not a real-time editing canvas.
- Not solving cross-scene action continuity. That's a consistency-plan concern.
- Not adding new lip-sync providers beyond existing Tier 1 (MediaPipe overlay) and Tier 2 (Kling LipSync via fal.ai).
- Not multi-language audio per scene.
- **Not multi-character lip sync per scene** — v3 narrows this. Multi-speaker scenes with simultaneous visible dialogue (two-shots where both faces lip-sync) are deferred to v1.5 (see §13.2). v1 forces multi-speaker scenes through cut-on-speaker, producing single-speaker scenes only.

## 3. Pre-existing primitives reused

- **Storyboard agent prompt builder** at [js/17b-create-references.js:2906](js/17b-create-references.js#L2906) (`castBuildDialogueAndFramingHint`) — forced-close-up rule removed; schema extended.
- **`castEnforceCutOnSpeaker`** at [js/17b-create-references.js:2946](js/17b-create-references.js#L2946) — kept; behavior gated by phase: Phase 3 keeps unconditional split (preserves v1 single-speaker invariant); Phase 3.5 lifts to allow multi-line two-shot scenes.
- **Multi-voice TTS** at [js/17b-create-references.js:3301](js/17b-create-references.js#L3301) (`castGenerateMultiVoiceAudio`) — input shape changes; per-line timing data at [js/17b-create-references.js:3484](js/17b-create-references.js#L3484) (`seg.dialogue.actualStartMs/EndMs`) becomes the source for `withinSceneStartMs/EndMs`.
- **Existing continuation logic** at [js/21-kling.js:137](js/21-kling.js#L137) (`generateContinuationPrompt`) and [js/21-kling.js:163](js/21-kling.js#L163) (`buildClipPlan`) — both replaced by the new provider-agnostic segment planner. Phase 8 deletes them.
- **Last-frame extraction** at [js/21-kling.js:107](js/21-kling.js#L107) (`extractLastFrame`) — kept, generalized to provider-agnostic.
- **Audio rehearsal step** at [js/33-audio-rehearsal.js](js/33-audio-rehearsal.js) — drift detection / soundtouch / 3% gate / degraded-mode banner all removed; per-image-card extended to N audio rows.
- **Brainstorm wizard** at [js/26-brainstorm.js:443](js/26-brainstorm.js#L443) — extended with a third pickable step for Quick mode only. Brand/Film modes get an inline style picker after the existing narrator-choice screen (§10.6).
- **Style preset machinery** at [js/17a-create-api.js:49](js/17a-create-api.js#L49) — replaced by mode-aware preset library + orthogonal visual treatments. **Old `STYLE_PRESETS` global retained** as back-compat alias for Reels at [js/20-reels-creator.js:290,1344,3104](js/20-reels-creator.js#L290) until Reels gets its own style migration.

## 4. Core architectural shifts

| # | Old assumption | New rule |
|---|---|---|
| 1 | Scene has one `dialogue` object | Scene has `dialogueLines[]` (zero-to-many speakers) |
| 2 | Dialogue scenes use close-up framings (rule in agent prompt) | Framings are free; lip sync routes per line based on speaker visibility |
| 3 | Scene duration is continuous (rounded at video gen time) | Scene composed of 5s/10s segments (provider tiers); audio not padded — segments stitched |
| 4 | Kling-specific code paths | Provider config is a swappable object; tier-selection lives in the planner |
| 5 | Audio rehearsal does drift detection + soundtouch time-stretch | Audio is real-time; segment count adapts to audio length; drift becomes a tier-fit check |
| 6 | Style is a flat global, set late | Style is layered (flow / sub-style + orthogonal visual treatment / per-scene override), set in wizard or style gate before any generation |

## 5. Data model

### 5.1 Project-level fields

```js
window.createJobState = {
  videoType: 'film' | 'brand',                     // existing

  narrationMode: null | 'pending' | 'dialogue' | 'voice-over' | 'mixed',  // lazy

  subStyle: {
    preset:        '<name>' | 'custom',
    description:   '<freeform 1-2 sentences, always populated>',
    motionGrammar: '<phrase>' | null,
    lighting:      '<phrase>' | null,
    color:         '<phrase>' | null,
    composition:   '<phrase>' | null,
  },

  visualTreatment: {
    treatment:   'photorealistic' | 'watercolor' | 'oil-painting' | 'anime' |
                 'comic' | 'pixel-art' | '3d-render' | 'sketch' | 'ukiyo-e' |
                 'stained-glass' | 'illustrated' | null,
    description: '<freeform>' | null,
  },

  videoProvider: {
    id:               'kling-v1.6' | 'veo-3' | 'runway-gen3' | 'pika-1' | ...,
    durationTiers:    [5, 10],     // available — selection is the planner's job
    minClipSec:       5,
    maxClipSec:       10,
    continuation: {
      supported:      true,
      mode:           'last-frame-i2v' | 'last-frames-conditioning' | 'embedding' | 'none',
      overlapSec:     0,
    },
    lipSyncCompatibility: {
      tier1MediaPipe: true,
      tier2Provider:  'kling-fal' | null,
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

### 5.2 Scene shape (v3 — preserves clip contract)

```js
scene = {
  // existing — kept
  id, timeRange, framing, motionPrompt, imgDataUrl, ...

  // existing — kept (was at risk of being dropped in v2)
  videoUrl,                                // stitched output URL (or videoClips[0].url for single-segment)
  videoClips: [                             // PRESERVED as first-class — v3 fix #3
    { url: '<segment 0 URL>', clipDuration: 5.0 },
    { url: '<segment 1 URL>', clipDuration: 5.0 },
  ],

  // legacy compatibility — exposed via shim during migration window (§6.3)
  // duration:   <continuous>          ← shimmed, eventually removed

  // new — duration model
  durationSec:       7.4,                   // creative target (continuous, agent's choice)
  durationTier:      10,                    // mechanical: max segment-plan total in seconds
  segmentPlan:       [                       // computed by segment planner (two-pass)
    { idx: 0, durationSec: 5, role: 'main',         prompt: '<per-segment>' },
    { idx: 1, durationSec: 5, role: 'continuation', prompt: '<per-segment>' },
  ],
  segmentPlanPass:   'estimate' | 'actual',
  croppedTailSec:    3,

  // new — visual decoupling
  visualSubjectIds:  ['char_maya'],

  // new — dialogue is an array (legacy `scene.dialogue` shimmed per §6.2)
  dialogueLines:     [
    {
      speakerCharacterId: 'char_joe',
      text:               'I had to.',
      mood:               'serious',
      isVoiceOver:        true,
      withinSceneStartMs: 1500,            // populated by Phase 8 timing-finalization sub-step
      withinSceneEndMs:   6200,
      audioBufferKey:     'audio_line_<sceneId>_0',
      regenCount:         0,
      regenLockToken:     null,
      voiceOverride:      null,
      muted:              false,
    }
  ],

  // new — derived from dialogueLines + tier (Phase 8 timing-finalization)
  audioRegions:      [
    { startMs: 0,    endMs: 1500, type: 'pre-roll-silence' },
    { startMs: 1500, endMs: 6200, type: 'dialogue', lineIdx: 0 },
    { startMs: 6200, endMs: 7000, type: 'post-roll-silence' },
  ],

  // new — per-scene style override (rare; null on most scenes)
  styleOverride:     <subStyle object> | null,

  // new — derived per-scene
  continuityImportance: 'low' | 'medium' | 'high',

  // existing — kept
  startTime, endTime, lipSync, ...

  // removed (after late cleanup phase)
  // durationStatus, durationDriftPct, audioStale  ← drift detection deleted
}
```

**Key v3 distinctions from v2:**
- `videoClips[]` and `clipDuration` are **explicitly first-class** (audit finding #3).
- `videoUrl` is the stitched output for multi-segment scenes; for single-segment it equals `videoClips[0].url` (preserves today's behavior).
- `scene.duration` is **shimmed** during migration (§6.3), not silently removed.

### 5.3 Brainstorm finalise schema

```js
finalScript = {
  title, tone, scenes, ...                              // existing

  visualStyle:     <same shape as createJobState.subStyle>,
  visualTreatment: <same shape as createJobState.visualTreatment>,
}
```

### 5.4 Wizard state

```js
brainstormState.wizardAnswers = {
  type:             'social' | 'tutorial',          // Quick mode types only
  length:           '30s' | '60s' | '90s',
  visualStyle:      <subStyle shape>,
  visualTreatment:  <visualTreatment shape>,
}

// Brand/Film direct-entry — set on inline picker after narrator-choice screen
brainstormState.visualStyle      = <subStyle shape>;
brainstormState.visualTreatment  = <visualTreatment shape>;
```

## 6. Schema migration (Phase 2 — high risk)

This is the lynchpin phase. All 42 `scene.dialogue` reference sites and all 17 `scene.duration` reference sites must continue working through the migration window. The phase divides into three sub-phases.

### 6.1 Phase subdivision (v3 fix #1)

**Phase 2a — Schema + shims + writer migration.** Adds the new scene fields and installs `Object.defineProperty` shims for `scene.dialogue` (§6.2) and `scene.duration` (§6.3). Migrates writers (`castEnforceCutOnSpeaker`, storyboard agent JSON consumer, autosave restore, `processOriginalAudio`, `processReTTS`).

**Phase 3 — Storyboard agent prompt rewrite (with cut-on-speaker constraint).** Removes the forced-close-up rule, introduces `isVoiceOver` derivation, free framing, two-shot framings, validator stage. **Critical constraint:** `castEnforceCutOnSpeaker` continues to unconditionally split multi-speaker scenes into single-speaker scenes. This preserves the v1 invariant of one line per scene through the migration window.

**Phase 2b — Reader migration.** All 42 `scene.dialogue` reader sites and all 17 `scene.duration` reader sites migrated to `dialogueLines[]` and `durationSec`/`durationTier` respectively. Shims still in place (insurance).

**Phase 3.5 — Lift cut-on-speaker constraint.** With readers migrated, `castEnforceCutOnSpeaker` updated to preserve two-shot framings unchanged (split only single-character framings with multiple speakers). This is when scenes can finally have `dialogueLines.length > 1` in production.

**Phase 12 (cleanup) — Shim removal.** Both `scene.dialogue` and `scene.duration` shims removed.

This subdivision ensures producers (Phase 3) never emit data shape that readers (still on `scene.dialogue` until 2b) can't handle. Through Phases 2a → 3 → 2b → 3.5, every scene has at most one `dialogueLines` entry.

### 6.2 The `scene.dialogue` shim

```js
function attachDialogueShim(scene) {
  if (Object.getOwnPropertyDescriptor(scene, 'dialogue')) return;  // idempotent

  Object.defineProperty(scene, 'dialogue', {
    configurable: true,
    enumerable:   false,           // doesn't surface in JSON.stringify (no round-trip duplication)
    get() {
      const lines = this.dialogueLines || [];
      // v3 hardening: warn if a reader sees a multi-line scene through the shim
      if (lines.length > 1 && !this._dialogueShimWarned) {
        console.warn(
          `[migration] scene.dialogue accessed on multi-line scene (${lines.length} lines). ` +
          `Reader should migrate to scene.dialogueLines[]. Scene id: ${this.id}`
        );
        this._dialogueShimWarned = true;
      }
      return lines[0] || null;
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

The console.warn (v3 fix #1) acts as a beacon during the migration window. If any reader slips through Phase 2b unmigrated and a multi-line scene appears in Phase 3.5, the warning fires once per scene and tells us exactly which reader hasn't been migrated. Production-safe (warn, not throw).

### 6.3 The `scene.duration` shim (v3 fix #2)

```js
function attachDurationShim(scene) {
  if (Object.getOwnPropertyDescriptor(scene, 'duration')) return;

  Object.defineProperty(scene, 'duration', {
    configurable: true,
    enumerable:   false,
    get() {
      // Resolution priority: durationTier (post-pass-2) > durationSec (pre-pass) > legacy field
      if (typeof this.durationTier === 'number') return this.durationTier;
      if (typeof this.durationSec  === 'number') return this.durationSec;
      return this._legacyDuration || 0;
    },
    set(value) {
      // Legacy writers set scene.duration directly (e.g. user-editing UI before migration)
      // Stash on _legacyDuration; new code reads durationTier/durationSec
      this._legacyDuration = value;
    },
  });
}
```

Resolution priority handles three states correctly:

- **Pass-1 segment plan computed** (storyboard agent has emitted): `durationSec` is set, `durationTier` may not be yet. Reader gets `durationSec`.
- **Pass-2 segment plan computed** (audio rehearsal locked): `durationTier` is set with the actual mechanical tier. Reader gets `durationTier`.
- **Legacy project loaded** (pre-feature): `durationSec` and `durationTier` are absent; `_legacyDuration` carries the old value. Reader gets the legacy value until pass-1 runs.

This lets all 17 reader sites (verified at [js/15-project.js:1029](js/15-project.js#L1029), [js/17d-create-languages.js:773-819](js/17d-create-languages.js#L773-L819), [js/27-canvas-state.js:348,379](js/27-canvas-state.js#L348), [js/33-audio-rehearsal.js:193-216,668-699](js/33-audio-rehearsal.js#L193-L216)) keep working during the migration window.

### 6.4 Writer migration in Phase 2a

| Site | What it writes | Migration |
|---|---|---|
| Storyboard agent JSON output → scene constructor | One `dialogue` object per scene | Constructs `dialogueLines: [<one entry>]`. Phase 3 lands the agent rewrite that knows the new schema. |
| `castEnforceCutOnSpeaker` | Splits multi-speaker scenes into single-speaker close-up scenes | Updated to read `additionalTurns` (legacy) OR `dialogueLines.length > 1` (new); produces `dialogueLines` array of length 1. **Phase 3 keeps unconditional split.** **Phase 3.5 lifts to preserve two-shots.** |
| `processOriginalAudio` (audio input Mode A) | Already produces `dialogueLines[]` per audio-input-plan §9.1 | Already aligned |
| `processReTTS` (audio input Mode B) | Already produces `dialogueLines[]` per audio-input-plan §9.2 | Already aligned, but populates `withinSceneStartMs/EndMs = null` today; v3 timing-finalization (§8.4) fills these |
| `castGenerateMultiVoiceAudio` | Writes `seg.dialogue.actualStartMs/EndMs` to temp segments | Wraps the existing call to derive `withinSceneStartMs/EndMs` for each line in `dialogueLines[]` (v3 timing-finalization sub-step) |
| Project autosave/restore | Round-trips through JSON | Restore writes `dialogueLines[]` and `videoClips[]`; shim attaches on read; legacy projects with `dialogue` get migrated lazily on first edit |
| User-editing UI for duration | Writes `scene.duration` directly | Continues to write through the shim's `set` path (lands on `_legacyDuration`); pass-1 planner picks up |

### 6.5 Reader migration in Phase 2b

42 `scene.dialogue` reader sites + 17 `scene.duration` reader sites resolve through shims during 2a → 3. In Phase 2b, each is migrated explicitly:

| Site (file) | What it reads | Migration target |
|---|---|---|
| `buildAudioSection` (33-audio-rehearsal) | `scene.dialogue.{speakerCharacterId, text, isVoiceOver, muted}` + `scene.duration` | Iterate `scene.dialogueLines[]`; read `scene.durationTier` |
| `_regenSceneAudio` (33-audio-rehearsal) | All dialogue keys + `scene.duration` for downstream shifts | Per-line regen targeting `scene.dialogueLines[lineIdx]`; scene-total duration from `scene.durationTier` |
| `_showDriftPopup` (33-audio-rehearsal) | `scene.dialogue` + drift fields | Removed entirely (drift detection deleted in cleanup) |
| `prepareLipSyncForExport` | `scene.dialogue.{speakerCharacterId, isVoiceOver}` | Loop `dialogueLines[]`, route per line via §12.1 |
| `castBuildFramingMotionPrompt` | `scene.dialogue` | Read `dialogueLines[]`; framing intent from agent's choice |
| `castShouldUseMultiVoice` | `scene.dialogue` | `dialogueLines.length > 0 && dialogueLines.some(l => !l.isVoiceOver)` |
| `_showVoiceOverflowMenu`, `_showRegionContextMenu` | `scene.dialogue` | Per-line context (lineIdx provided by caller) |
| `castGenerateMultiVoiceAudio` (caller) | `segment.dialogue.{speakerCharacterId, text}` | Caller passes segments constructed from `dialogueLines[]` |
| `15-project.js` save/restore | `scene.duration`, `scene.videoClips`, `scene.clipDuration` | Read `durationTier`, `videoClips[]`, `videoClips[i].clipDuration` (existing field name preserved) |
| `17d-create-languages.js` animated export timeline | `scene.duration`, `scene.videoClips`, `clipDuration` | Same — `videoClips[]` is preserved as first-class field per v3 §5.2 |
| `27-canvas-state.js` mirror | `scene.videoClips`, `scene.duration` | Same |
| `33-audio-rehearsal.js:528-531` manual duration editing | Writes `scene.duration` | Writes `scene.durationSec`; pass-2 planner re-runs on next rehearsal lock |

End of Phase 2b: every reader uses the new fields directly. Shims still in place as belt-and-suspenders. Phase 12 (late cleanup) removes them.

### 6.6 Migration testing requirement

Phase 2a lands behind a feature flag. Integration tests cover every reader site listed in §6.5 to verify:

- Both shims resolve correctly for legacy projects (saved before 2a).
- Both shims resolve correctly for new projects (created post-2a).
- Mid-migration projects (some scenes legacy structure, some new) load and edit correctly.
- The `console.warn` fires for multi-line shim access — assertion-based test catches any reader that hasn't migrated.

Phase 2b lands only after every reader is migrated and tests pass.

## 7. Provider abstraction

Same as v2 §7. Provider config holds tiers + capabilities only; tier-selection lives in the planner.

```js
videoProvider = {
  id:                'kling-v1.6',
  durationTiers:     [5, 10],
  minClipSec:        5,
  maxClipSec:        10,
  continuation: {
    supported:           true,
    mode:                'last-frame-i2v',
    overlapSec:          0,
  },
  lipSyncCompatibility: {
    tier1MediaPipe:      true,
    tier2Provider:       'kling-fal',
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

Uniformed interface:

```js
provider.submit(imgDataUrl, prompt, durationSec, opts)  → { taskId }
provider.pollTask(taskId)                                → { status, videoUrl }
```

Phase 1 wraps existing Kling submit/poll into this interface. No tier-selection logic baked into the config.

## 8. Segment planner (Phase 8)

### 8.1 Two-pass model

**Pass 1 — Estimate (storyboard time):**
- Input: `scene.durationSec` (agent's creative target)
- Output: initial `segmentPlan` for >85% of scenes
- `scene.segmentPlanPass = 'estimate'`

**Pass 2 — Actual (audio rehearsal lock time):**
- Prerequisite: timing-finalization sub-step (§8.4) populates `dialogueLines[i].withinSceneStartMs/EndMs` from canonical source
- Input: actual `audioMs` from finalized timings
- Output: revised `segmentPlan` + `audioRegions[]`
- `scene.segmentPlanPass = 'actual'`
- Tier change vs pass 1 → Class B cascade with confirmation if downstream scenes have video

### 8.2 The planner function

```js
planSegments({
  audioMs,                                     // null in pass 1 (use scene.durationSec * 1000)
  provider,
  scene,
  requiresLipSync,
  continuityImportance,
  pass:  'estimate' | 'actual',
}) → {
  segments: [...],                             // [{idx, durationSec, role, prompt}]
  audioRegions: [...],                          // pass 2 only
  totalGenSec, croppedTailSec, expectedCost,
  fallbackPlan,
}
```

### 8.3 Tier-selection algorithm

```
const splitThreshold = 7.0;
const sourceMs = audioMs ?? scene.durationSec * 1000;

let remainingMs = sourceMs;
let segments = [];
let isFirst = true;

while (remainingMs > 0) {
  let tier;
  if (isFirst) {
    const fitsTier   = pickSmallestTierAbove(provider.durationTiers, remainingMs / 1000);
    const splittable = remainingMs / 1000 > splitThreshold;
    tier = (splittable && fitsTier > provider.durationTiers[0])
      ? provider.durationTiers[0]
      : fitsTier;
  } else {
    tier = provider.durationTiers[0];
  }
  segments.push({ idx: segments.length, durationSec: tier, role: isFirst ? 'main' : 'continuation' });
  remainingMs -= tier * 1000;
  isFirst = false;
}

const totalGenMs    = segments.reduce((s, x) => s + x.durationSec * 1000, 0);
const croppedTailSec = (totalGenMs - sourceMs) / 1000;
```

Selection table for `durationTiers: [5, 10]` and `splitThreshold: 7.0`:

| Audio | Plan | Cropped |
|---|---|---|
| 4.0s | [5s] | 1.0s |
| 5.0s | [5s] | 0.0s |
| 5.5s | [10s] | 4.5s |
| 7.0s | [10s] | 3.0s |
| 7.5s | [5s, 5s] | 2.5s |
| 9.5s | [5s, 5s] | 0.5s |
| 10.5s | [10s, 5s] | 4.5s |
| 12.0s | [10s, 5s] | 3.0s |

### 8.4 Timing finalization sub-step (v3 fix #5)

Runs at the boundary between audio rehearsal lock and pass-2 `planSegments`. Populates `dialogueLines[i].withinSceneStartMs/EndMs` from canonical source per input path:

| Source | Algorithm |
|---|---|
| Audio input Mode A (original recording) | Copy from existing `dialogueLines[i].audioSegmentStartMs/EndMs` (already populated at [js/32-audio-input.js:979](js/32-audio-input.js#L979)) — these are scene-local because Mode A's scene structure mirrors speaker-boundary segmentation |
| Audio input Mode B (re-TTS) | Pull from `seg.dialogue.actualStartMs/EndMs` written by [js/17b-create-references.js:3484](js/17b-create-references.js#L3484) during multi-voice TTS, normalize to scene-local timestamps (subtract scene's offset within the master buffer) |
| Text input + multi-voice TTS | Same as Mode B path — multi-voice TTS produces `actualStartMs/EndMs`; normalize scene-local |
| Brainstorm finalise + multi-voice TTS | Same as text input path |
| B-roll / no dialogue | `dialogueLines` is empty; skip |

Pseudo-code:

```js
function finalizeSceneTimings(scene) {
  const sceneStartMs = scene.startTime * 1000;
  for (const line of (scene.dialogueLines || [])) {
    if (line.audioSegmentStartMs != null) {
      // Mode A path — already scene-local
      line.withinSceneStartMs = line.audioSegmentStartMs;
      line.withinSceneEndMs   = line.audioSegmentEndMs;
    } else {
      // Mode B / text-input path — pull from multi-voice TTS metadata
      const ttsMeta = findTtsMetaForLine(scene, line);
      if (ttsMeta) {
        line.withinSceneStartMs = Math.max(0, ttsMeta.actualStartMs - sceneStartMs);
        line.withinSceneEndMs   = Math.max(0, ttsMeta.actualEndMs   - sceneStartMs);
      } else {
        // Fallback: distribute lines uniformly across scene duration
        line.withinSceneStartMs = (lineIdx     / scene.dialogueLines.length) * scene.durationSec * 1000;
        line.withinSceneEndMs   = ((lineIdx+1) / scene.dialogueLines.length) * scene.durationSec * 1000;
        console.warn(`[timing] No TTS metadata for line ${line.audioBufferKey}; used uniform fallback`);
      }
    }
  }
}
```

The fallback uniform distribution is a safety net — it should rarely fire because every dialogue line has a canonical timing source. If it does fire, the `console.warn` flags it for investigation.

After timing finalization, `audioRegions[]` is computed deterministically:

```js
function computeAudioRegions(scene) {
  const regions = [];
  let cursorMs = 0;
  const sortedLines = [...scene.dialogueLines].sort((a, b) => a.withinSceneStartMs - b.withinSceneStartMs);
  for (const [idx, line] of sortedLines.entries()) {
    if (line.withinSceneStartMs > cursorMs) {
      regions.push({
        startMs: cursorMs,
        endMs:   line.withinSceneStartMs,
        type:    idx === 0 ? 'pre-roll-silence' : 'inter-line-silence',
      });
    }
    regions.push({
      startMs: line.withinSceneStartMs,
      endMs:   line.withinSceneEndMs,
      type:    'dialogue',
      lineIdx: scene.dialogueLines.indexOf(line),
    });
    cursorMs = line.withinSceneEndMs;
  }
  const totalSceneMs = scene.durationTier * 1000;
  if (cursorMs < totalSceneMs) {
    regions.push({ startMs: cursorMs, endMs: totalSceneMs, type: 'post-roll-silence' });
  }
  return regions;
}
```

`audioRegions[]` is then passed to the Gemini split-prompt call (§8.5) so segments know exactly where dialogue vs silence falls within their windows.

### 8.5 Gemini split-prompt call

Replaces `generateContinuationPrompt` at [js/21-kling.js:137](js/21-kling.js#L137); Phase 8 deletes that function and the legacy continuation loop in `_animateSingleScene`.

Model: **gemini-2.5-flash**. Cost ~$0.001 per scene with split. Latency ~1–2s, parallelizable with image gen.

Input:

```js
{
  scene: {
    fullMotionPrompt:    '<scene.motionPrompt>',
    framing:             '<scene.framing>',
    visualSubjectIds:    [...],
    durationSec:         <agent's creative target>,
    dialogueLines:       [...],
  },
  segmentPlan: [...],
  audioMs:               7000,
  audioRegions:          [...],                // input from timing-finalization
  continuityImportance:  'high',
  styleHint:             '<subStyle.description>',
  treatmentHint:         '<visualTreatment.description>',
}
```

Enforces:
- Continuation segments anchor on prior frame; anchor strength tuned by `continuityImportance`.
- Trailing tail designed as low-motion (using `audioRegions[]` to know which time windows are silence).
- Lines spanning segment boundaries referenced in both segments' prompts.

### 8.6 Stitching strategy

Bifurcated by lip-sync routing (per v2 §8.5):

| Lip-sync route | Stitching method |
|---|---|
| Tier 2 (Kling LipSync) | Server-side ffmpeg via R2/CF (gated on infra availability) |
| Tier 1 (MediaPipe) | Client-side MSE |
| No lip sync | Either; default to MSE |

**Output contract for stitched scenes** (v3 fix #3):
- `scene.videoClips[i] = { url, clipDuration }` — per-segment URLs, persisted as first-class
- `scene.videoUrl` — the stitched output URL (or `videoClips[0].url` for single-segment scenes)
- Stitching writes BOTH the per-segment URLs (in `videoClips[]`) AND the stitched URL (in `videoUrl`)

This preserves the contract that save/restore, animated export, and canvas-state mirror all rely on. For single-segment scenes, `videoUrl === videoClips[0].url` and `videoClips.length === 1` — same shape as today.

For multi-segment scenes, the stitched-playback fallback (when stitching fails) reads `videoClips[]` directly and plays them sequentially.

### 8.7 Failure handling

Same as v2 §8.6.

## 9. Style system (three layers + orthogonal treatment)

Same as v2 §9.

### 9.1 Layer 1 — Flow style (constants per `videoType`)
### 9.2 Layer 2 — Sub-style (mode-aware preset library)
### 9.3 Visual treatment (orthogonal axis)
### 9.4 Layer 3 — Per-scene override
### 9.5 Style injection points (six)

(Sections elided for brevity — see v2 §9.)

## 10. Wizard / style-gate UX

Same as v2 §10.

### 10.1 Quick mode three-step wizard
### 10.2 Brand and Film inline picker after narrator-choice screen
### 10.3 Shared style picker component with self-validation
### 10.4 Locked frame — no mid-session change
### 10.5 Chat AI receives locked frame
### 10.6 Brand/Film flow integration detail

## 11. Style gate for text + audio input

Same as v2 §11.

## 12. Storyboard agent rewrite (Phase 3)

Same as v2 §12, with **critical addition**:

### 12.1 Cut-on-speaker constraint during migration window (v3 fix #1)

`castEnforceCutOnSpeaker` at [js/17b-create-references.js:2946](js/17b-create-references.js#L2946) has two behavioral modes:

- **Phase 3 (during migration window):** unconditional split. Every multi-speaker scene becomes N single-speaker scenes, regardless of framing. This preserves the v1 invariant of one line per scene through Phase 2b reader migration. Legacy readers (still on `scene.dialogue` until 2b finishes) only ever see single-line scenes.
- **Phase 3.5 (post-2b):** preserve two-shot framings. Multi-speaker scenes with two-shot framings (`two-shot-medium`, `two-shot-wide`, `over-shoulder-front`, `over-shoulder-back`) keep multi-line `dialogueLines[]`. Multi-speaker scenes with single-character framings still split.

This is the load-bearing safety mechanism. The console.warn in the dialogue shim (§6.2) acts as a beacon: if Phase 3.5 ships and any reader hasn't migrated, the warn fires immediately.

### 12.2 Validator stage
### 12.3 New framings added (`two-shot-medium`, `two-shot-wide`, `over-shoulder-back-listening`)

(Same as v2.)

## 13. Lip sync routing per line

### 13.1 The router

Same as v2 §13.1.

### 13.2 v1 scope: forced cut-on-speaker for multi-speaker visible scenes (v3 fix #4)

The audit correctly flagged that v2's "Tier 1 face-position upgrade" understated the work. Real multi-character lip sync requires:

- Per-character sprite stores (each character's mouth shapes generated separately)
- Frame-level character-identity face matching (not "leftmost wins" — actual identity matching, possibly via stored character reference images + per-frame embedding comparison)
- Position metadata in storyboard agent output (e.g., `framePositions: { char_maya: 'left', char_joe: 'right' }`)
- `lipSync` state extended from `{ speakerId, sprites }` (one of each) to `{ speakers: [{ speakerId, sprites }] }` (per-character)

**v1 narrows scope:** multi-speaker visible scenes (two-shots, OTS-front with both faces visible) are forced through cut-on-speaker into single-speaker scenes. Each resulting scene has one on-screen speaker; existing single-speaker Tier 1 / Tier 2 architecture handles them unchanged.

This means:
- A 7s two-shot dialogue exchange that today would render as one two-shot scene becomes two single-speaker close-up scenes (3.5s + 3.5s, or with cut-on-speaker timing per scene length).
- Two-shot framings ARE still available in the agent's framing enum (§12.3), but the cut-on-speaker post-processor splits them when multiple speakers want to dialogue within. Two-shot is reserved for moments where only one character speaks (other is reaction-only).
- Over-shoulder framings work as today.

**v1.5 lifts the constraint:** when Tier 1 multi-speaker work lands as a separate sub-project (per-character sprites, identity-based face matching, frame-level speaker assignment), `castEnforceCutOnSpeaker` allows multi-line two-shots through.

The Tier 1 multi-speaker project is **out of scope** for this plan. It's a peer plan to be written separately, with its own audit and phasing.

### 13.3 Tier 2 (Kling LipSync) gating

Same as v2 §13.3 — Tier 2 multi-segment scenes deferred to v1.5 when R2/CF infra ships. Single-segment scenes still use Tier 2.

### 13.4 Voice-over project shortcut (lazy `narrationMode`)

Same as v2 §13.4 + §16.3.

## 14. Per-image-card UI

Same as v2 §14.

## 15. Edit cascades (Class A / B / C)

Same as v2 §15.

## 16. Voice-over project shortcut

Same as v2 §16.

## 17. Cleanup / removals

### 17.1 Code paths removed

- Drift detection: the **symmetric 3% gate** in `canGenerateVideos()` ([js/33-audio-rehearsal.js:687](js/33-audio-rehearsal.js#L687)) replaced by per-scene tier-fit check.
- `computeDurationStatus` truth table — gone.
- `audioRehearsal.audioStale` flag — gone.
- soundtouch-js dynamic loader and `timeStretchAudioBuffer` — gone.
- `degraded-mode-banner` — gone.
- `buildClipPlan` and `_animateSingleScene` continuation loop ([js/21-kling.js:175-235](js/21-kling.js#L175-L235)) — replaced by `planSegments`.
- `generateContinuationPrompt` ([js/21-kling.js:137](js/21-kling.js#L137)) — replaced by Gemini split-prompt call.

### 17.2 Schema fields removed (after Phase 12 cleanup)

- `scene.dialogue` (singular) — replaced by `dialogueLines[]`; shim removed in Phase 12
- `scene.duration` — replaced by `durationSec` + `durationTier`; shim removed in Phase 12
- `scene.durationStatus`, `scene.durationDriftPct`, `scene.audioStale` — drift detection deleted

### 17.3 `STYLE_PRESETS` migration table

Same 20-entry mapping table as v2 §17.3. **Difference (v3 secondary risk fix):** the old `STYLE_PRESETS` global at [js/17a-create-api.js:49](js/17a-create-api.js#L49) is **kept as a back-compat alias for Reels** consumed at [js/20-reels-creator.js:290,1344,3104](js/20-reels-creator.js#L290), [js/17a-create-api.js:164,224](js/17a-create-api.js#L164). Cleanup removes Copilot's dependency on it; Reels keeps using it until the Reel pipeline gets its own style migration (out of scope for this plan).

The Copilot path migrates fully to the new mode-aware library + visual treatments. Old preset values in saved Copilot projects are auto-mapped per the v2 §17.3 table on first load.

## 18. Edge cases

| # | Case | Behavior |
|---|---|---|
| 1 | Audio exactly 5.0s | One 5s segment. |
| 2 | Audio between 5.1s and 7.0s | Single 10s tier (smallest tier ≥ audio). No split, action stretched. |
| 3 | Audio 9.5s | Split [5s, 5s]. Stitched. |
| 4 | Audio 10.1s | Forced continuation: [10s, 5s]. 4.9s cropped. |
| 5 | Audio > 25s | Recursive continuation chain. |
| 6 | Reaction shot — speaker off-screen | `isVoiceOver: true` derived; lip sync skipped for that line. |
| 7 | Two-shot, both speakers on-screen, alternating dialogue | **v1: forced through cut-on-speaker into single-speaker scenes.** v1.5: preserved as multi-line two-shot scene. |
| 8 | Wide-establishing with dialogue | `isVoiceOver: true` derived; mouth not resolvable. |
| 9 | Long monologue > 15s | Forced continuation. Agent picks natural sentence boundary if user-visible split needed. |
| 10 | TTS estimate wrong (pass 1: 5s tier, actual: 5.4s) | Pass 2 promotes to 10s. Class B cascade with confirmation if downstream scenes have video. |
| 11 | User edits to add a third dialogue line | **v1:** scene splits via cut-on-speaker (still single-speaker scenes). **v1.5:** if scene is multi-line two-shot, line added in place; tier promotion check. |
| 12 | User changes line speaker from on-screen to off-screen | `isVoiceOver` flips; lip sync teardown; image/video unchanged. Cheap. |
| 13 | User changes `visualSubjectIds` from `[maya]` to `[maya, joe]` | Class B. Image regen. All lines recompute `isVoiceOver`. **v1: scene auto-splits if dialogueLines has 2+ speakers.** |
| 14 | User splits scene mid-line | Forbidden. Splits land on line boundaries only. |
| 15 | Audio input Mode A | Audio durations fixed. Tier rounded up. Style gate inserts before storyboard. |
| 16 | Audio input Mode B | Same as text input post-TTS. Style gate inserts before storyboard. |
| 17 | Voice-over narrator scene | All lines `isVoiceOver: true`. Tier rounded up. No lip sync. |
| 18 | B-roll with no audio | Scene tier is agent's choice. Pad audio with silence. |
| 19 | Three+ speakers in rapid exchange | Forbidden in one scene. Validator splits. |
| 20 | Continuation clip fails | Retry once. Fallback to single-tier rendering. |
| 21 | Last-frame extraction fails | Same fallback. |
| 22 | Stitching fails | Retry once; degrade to per-segment playback (`scene.videoClips[]` plays sequentially). |
| 23 | Gemini split-prompt fails | Deterministic fallback split. |
| 24 | Cost estimate jumps mid-edit | Pre-commit cost preview always shown for Class B + C. |
| 25 | User restarts brainstorm session mid-flow | Session discarded. |
| 26 | Saved session restore (pre-feature) | Style migration prompt; `narrationMode` back-computed lazily; both shims active. |
| 27 | Brainstorm finalise → Copilot → user wants different style | Class B path. |
| 28 | Style picker enforced (no skip) | Wizard step 3, Brand/Film inline picker, text/audio gates all require pick. |
| 29 | User picks "Custom" with no description | Picker validates: minimum 10 chars in description. |
| 30 | Two-shot with Tier 2 requested | **v1: scene auto-split before Tier 2 even applies; each split scene has one speaker.** v1.5: Tier 2 disambiguation work. |
| 31 | Per-scene `styleOverride` clashes with project style | Allowed (intentional). |
| 32 | Mood per line contradicts project style | Allowed. Mood = voice; style = visual. |
| 33 | Provider doesn't support continuation | Multi-segment scenes use independent clips with hard cuts. Continuity-importance `low` only; `medium`/`high` warn. |
| 34 | Provider's only tier is 5s | Long scenes chain many 5s segments. |
| 35 | Provider supports variable durations | `durationTiers` becomes a continuous range. Planner picks exact match. |
| 36 | Tier 2 lip sync requested but R2 infra not yet shipped | v1 falls back to Tier 1 for multi-segment; single-segment uses Tier 2. v1.5 lifts. |
| 37 | Reels project loaded with old `STYLE_PRESETS` value | Reels continues to use the old global as alias. Out of scope for this plan. |
| 38 | Multi-line scene leaks through to a Phase 2b reader that hasn't been migrated | Shim's `console.warn` fires. Catch this in integration tests; surfaces in production telemetry. |
| 39 | Pass-2 timing-finalization can't find TTS metadata for a line | Uniform-distribution fallback with `console.warn`. Should never happen in normal flow. |

## 19. Phases / order of work

| # | Phase | Deliverables | Risk | Depends on |
|---|---|---|---|---|
| **1** | Provider abstraction (interface only) | `js/providers/video-providers.js` with Kling-v1.6 config (tiers + capabilities only); uniformed `submit/poll` interface; existing Kling code wrapped. **Does NOT encode legacy tier-selection rule.** | low | none |
| **2a** | Schema + dual shims + writer migration | Add new scene fields (`dialogueLines[]`, `visualSubjectIds`, `durationSec`, `durationTier`, `segmentPlan`, `audioRegions`, `styleOverride`, `continuityImportance`, `videoClips[]` preservation); install `Object.defineProperty` shims for `scene.dialogue` (§6.2) and `scene.duration` (§6.3) with console.warn beaconing; migrate writers (`castEnforceCutOnSpeaker` with **unconditional split**, storyboard agent JSON consumer, autosave restore, `processOriginalAudio`, `processReTTS`, `castGenerateMultiVoiceAudio` wrapper for timing finalization). Integration tests cover every reader site. | **high** | 1 |
| **3** | Storyboard agent prompt rewrite + cut-on-speaker constraint | Remove forced-close-up rule; add `isVoiceOver` derivation, free framing, two-shot framings, validator stage. **`castEnforceCutOnSpeaker` continues unconditional split** — every produced scene has at most one `dialogueLines` entry. | medium | 2a |
| **2b** | Reader migration | Migrate all 42 `scene.dialogue` reader sites + 17 `scene.duration` reader sites + `videoClips[]` reader sites to new fields. Shims still in place as belt-and-suspenders. | medium | 3 |
| **3.5** | Lift cut-on-speaker constraint | `castEnforceCutOnSpeaker` updated to preserve two-shot framings. Multi-line scenes finally allowed in production. **Phase 13 multi-speaker work** out of scope; v1 supports only single-speaker visible scenes via cut-on-speaker (multi-line scenes still emit but the multi-speaker visible case forces split). | medium | 2b |
| **4** | Style system + preset library | Mode-aware `SUB_STYLE_PRESETS` + orthogonal `VISUAL_TREATMENTS`; merged-style helper; six injection points wired. **Curated sample images** for ~30 presets — separate parallel work item. | medium | 3 |
| **5** | Brainstorm wizard step 3 (Quick mode) | Style picker in Quick wizard; chat AI system prompt update. | low | 4 |
| **6** | Brand/Film inline style picker | Inline picker mounts after `_wireNarratorChoiceScreen`; same component as wizard step 3. | low | 4, 5 |
| **7** | Style gate for text + audio input | Same picker component; gate insertion in both flows. | low | 4 |
| **8** | Segment planner + Gemini split-prompt + timing finalization | `planSegments` two-pass function; **timing finalization sub-step (§8.4)** producing `withinSceneStartMs/EndMs` and `audioRegions[]`; split-prompt call; provider-agnostic stitching; explicit deletion of `generateContinuationPrompt` and `_animateSingleScene` continuation loop; **stitching produces both `videoClips[]` and `videoUrl`**. | high | 1, 2a |
| **9** | Per-image-card N-rows audio | Multi-line UI; per-line controls; speaker visibility icons; status aggregation. | medium | 2b |
| **10** | Lip-sync routing per line (single-speaker only) | Router based on `isVoiceOver`; **v1 scope: only single-speaker visible scenes** (multi-speaker visible scenes already forced-split by cut-on-speaker); lazy `narrationMode` computation; back-compute on load; voice-over shortcut. | medium | 8 (sequential) |
| **11** | Edit cascades UI | Class A / B / C edit surfaces; tier-promotion as Class B. | medium | 9, 10 |
| **12** | Cleanup | Remove drift detection, soundtouch-js, symmetric 3% gate, degraded-mode banner, `buildClipPlan`, `generateContinuationPrompt`, both shims (§6.2 + §6.3), Copilot's dependency on old `STYLE_PRESETS`. **Reels keeps `STYLE_PRESETS` as alias.** | low | 11 |

**Sequential dependencies:**
- 1 → 2a → 3 → 2b → 3.5 (the migration spine; cut-on-speaker constraint enforces safety through this chain)
- 1 → 8 → 10 (segment planner output is sequential dependency for lip-sync routing)
- 4 ← {5, 6, 7} (parallel within style work)
- 11 ← {9, 10} (edit cascades depend on the reader-migrated UI + lip-sync stage)

**Total scope (revised):** ~3500 lines net change across ~13 files. Phase 2a dominates risk; ~1.5 weeks alone with thorough integration tests across 42 + 17 reader sites.

**Calendar estimate (revised):** **6–8 weeks single engineer**, or 4–5 weeks across two engineers with parallel work on 5/6/7 and asset pipeline. The estimate revision (from v2's 4–5 weeks) reflects:
- Phase 2 risk underrating in v2 (now realistic).
- Phase 8 + Phase 10 sequential constraint (was marked parallelizable).
- Phase 3 + 3.5 split adds coordination overhead.
- Sample image asset pipeline parallel work (~2 weeks of curation/commission).

## 20. Theming considerations

Same as v2 §20.

## 21. Telemetry

Same as v2 §21, plus:

```js
{
  // v3 addition: shim safety telemetry
  dialogueShimWarnings: int,                   // count of multi-line scene access through shim
  durationShimUsage:    { legacy: int, current: int },

  // v3 addition: timing finalization
  timingFinalizationFallbacks: int,            // uniform-distribution fallback fires
}
```

The `dialogueShimWarnings` counter is the load-bearing safety signal. If non-zero post-Phase-3.5 launch, a reader site missed migration. Treat as P1 incident.

---

## Appendix A — Cross-plan integration touchpoints

(Same as v2.)

## Appendix B — Open questions deferred to v2.5+

1. Crossfade between segments.
2. Multi-provider per project.
3. Provider auto-selection per scene.
4. Audio-conditioned video generation.
5. Per-line style override.
6. Brainstorm wizard for text/audio paths.
7. AI-suggested style based on input content (can ship in Phase 7 as nice-to-have).
8. Per-scene visual treatment override.
9. **Multi-character lip sync (Tier 1 multi-speaker visible scenes).** Out of scope for v1. Separate plan: per-character sprite stores, identity-based face matching, frame-level speaker assignment, two-shot multi-line preservation in `castEnforceCutOnSpeaker`.
10. **Tier 2 multi-segment lip sync.** Gated on R2/CF infra (voice-and-lipsync-plan Phase 9). v1.5 once infra ships.
11. Reels style migration to mode-aware library.

## Appendix C — Audit response summary

**v1 audit:** 14 findings, all folded into v2.

**v2 audit:** 5 findings + 2 secondary risks, all folded into this v3:

| Audit # | Severity | v3 section | Resolution |
|---|---|---|---|
| 1 | P1 | §6.1, §12.1 | Phase 3/3.5 split with cut-on-speaker constraint preserving v1 single-speaker invariant; shim warns on multi-line access |
| 2 | P1 | §6.3 | `scene.duration` shim with same `Object.defineProperty` pattern; resolves from `durationTier` / `durationSec` / legacy |
| 3 | P1 | §5.2, §8.6 | `videoClips[]` and `clipDuration` preserved as first-class; stitching produces both per-segment URLs and stitched URL |
| 4 | P1 | §13.2 | v1 narrows scope: multi-speaker visible scenes forced through cut-on-speaker; multi-character lip sync becomes separate v1.5 plan |
| 5 | P2 | §8.4 | Timing finalization sub-step in Phase 8; canonical source per input path; deterministic `audioRegions[]` derivation |
| Secondary 1 | — | §17.3 | `STYLE_PRESETS` global kept as back-compat alias for Reels |
| Secondary 2 | — | §19 | Calendar revised to 6–8 weeks single engineer |

---

End of v3 plan.
