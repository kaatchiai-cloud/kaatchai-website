# Cinematic Pipeline Plan — v4 (audit-fix revision)

Status: design draft, not yet implemented. Supersedes v3, v2, v1. **Updated in place after two audit passes: v4 pre-fix (20 issues) and v4 post-audit (3C+4H+3M+5O).** See §0.1 and §0.2 for audit-fix changelogs.

Scope: replaces the current rendering pipeline's fixed assumptions with a provider-agnostic architecture where creative intent and rendering mechanics are independent.

Audit references:
- [cinematic-pipeline-plan-audit.md](cinematic-pipeline-plan-audit.md) — v1 audit (14 findings)
- [cinematic-pipeline-plan-v2-audit-report.md](cinematic-pipeline-plan-v2-audit-report.md) — v2 audit (5 findings)
- [cinematic-pipeline-plan-v3-audit-report.md](cinematic-pipeline-plan-v3-audit-report.md) — v3 audit, narrative form (4 findings)
- [cinematic-pipeline-plan-v3-audit.md](cinematic-pipeline-plan-v3-audit.md) — v3 audit, granular form (5 critical + 4 high + 3 medium + 5 minor)
- [cinematic-pipeline-plan-v4-audit.md](cinematic-pipeline-plan-v4-audit.md) — v4 audit (4 critical + 5 high + 6 medium + 5 minor)

**v4 methodology change:** every code claim in this document was originally verified by grep or `Read` against the live codebase before writing. The audit caught residual line-drift, count undercounts, and architectural gaps. The audit-fix revision (§0.1) re-verified every claim and corrected the document in place.

Sibling to:
- [audio-rehearsal-plan.md](audio-rehearsal-plan.md)
- [audio-input-plan.md](audio-input-plan.md)
- [input-formats-plan.md](input-formats-plan.md)
- [voice-and-lipsync-plan.md](voice-and-lipsync-plan.md)
- [consistency-plan.md](consistency-plan.md)

---

## 0. What changed from v3

| # | v3 issue | v4 fix |
|---|---|---|
| C1 | `legacyDialogueToLine` reads `audioActualDuration` from dialogue object — always undefined since it lives on scene | §6.4: shim leaves `withinSceneEndMs: null`; Phase 8 timing-finalization populates it from canonical source |
| C2 | Duration reader count claimed 17, actually 23+ across 7 files | §6.5: enumerated all sites with file:line. Telemetry counter on shim fall-through to `_legacyDuration` |
| C3 | 7.0s split-threshold introduces behavioral change for legacy projects (existing audio at 5.5s gets [10s] today; gets [10s] in v4 too — but 7.5s changes from [10s] today to [5s,5s] in v4) | §8.4 documents the behavioral change explicitly; Phase 8 integration test |
| C4 | New Gemini call in Phase 8 conflicts with migration plan's server-AI cutover | §8.5: Gemini split-prompt uses same key path as existing `generateContinuationPrompt` ([js/21-kling.js:137](js/21-kling.js#L137)); cross-plan note added |
| C5 | Phase 4 (style) depends on Phase 3 (agent rewrite); reverse is true | §19: Phase 2a adds `subStyle`/`visualTreatment` field stubs on `createJobState`; Phase 3 reads them; Phase 4 fills the preset library |
| H1 | `castEnforceCutOnSpeaker` hardcodes `isVoiceOver: false` ([js/17b-create-references.js:2979](js/17b-create-references.js#L2979)) | §12.1: function preserves `seg.dialogue.isVoiceOver` for the primary turn; for additional turns, uses each turn's own `isVoiceOver` if present, else inherits from primary |
| H2 | `castApplyFramingDerived` ([js/17b-create-references.js:3503](js/17b-create-references.js#L3503)) reads `seg.dialogue` (singular) and writes scene-level `speakerVisible`; v3 migration scope omitted it | §12.4: function rewritten to iterate `dialogueLines[]`, derive per-line `isVoiceOver`; scene-level `speakerVisible` deprecated in favor of per-line semantics |
| H3 | Duration shim getter conflates `durationTier` (mechanical) and `durationSec` (creative) | §5.2 + §6.5: separate field model. `durationSec` = visible scene length (always). `generatedDurationSec` = rendered total. `croppedTailSec = generatedDurationSec - durationSec`. Shim resolves only to `durationSec` / `_legacyDuration`, never `durationTier` |
| H4 | `STYLE_PRESETS` consumers in `create-api.js:164,224` are shared (Copilot template path), not Reels-only | §17.3: Copilot bypasses old global by reading `createJobState.subStyle` directly. Old `STYLE_PRESETS` global stays indefinitely as alias for Reels and template-handling code paths. Phase 12 cleanup removes only Copilot's reading path, not the global itself |
| Audit-1 #1 | Duration shim collapses three meanings (visible / generated / cropped) | Same fix as H3 — separate fields |
| Audit-1 #2 | Phase 3.5 ("preserve two-shots") and §13.2 ("force cut for multi-speaker visible") still disagree | §12.5: Phase 3.5 narrowed. Multi-line scenes preserved ONLY when ≤1 speaker is visibly lip-synced (multi-VO scenes, single-speaker multi-line scenes, mixed visible+VO scenes). Multi-speaker visible scenes still split. v1.5 lifts |
| Audit-1 #3 | Mode A timings claimed scene-local but are project-level | §8.4: explicit project-level → scene-local normalization in timing-finalization sub-step. `scene.absoluteStartMs` derived; `withinSceneStartMs = audioSegmentStartMs - scene.absoluteStartMs` |
| Audit-1 #4 | `videoClips[]` preserved but stitched playback restore contract incomplete | §8.7: persist `stitchedVideoData` separately from `videoClipsData[]`. Restore prefers stitched; fallback flag set if stitched absent |
| M1 | `scene.videoClips` is already an array; v3 framing as "preservation" was confused | §5.2 reframed as "preserved (already first-class)". No new persistence — existing path |
| M2 | Mode A line-level vs word-level timings | **Verified:** [js/32-audio-input.js:961-997](js/32-audio-input.js#L961-L997) `processOriginalAudio` produces line-level timings (start = first word's start; end extended to last word's end as words accumulate within a line). Audit M2 is **wrong**; M2 dropped |
| M3 | `narrationMode` lazy trigger unspecified | §13.4: explicit trigger after storyboard agent commits all scenes. Recomputed on Class B/C edits that flip `isVoiceOver` or `visualSubjectIds` |
| O1 | `castEnforceCutOnSpeaker` called from two pipeline sites | §12.1: both sites at [js/17c-create-pipeline.js:1287, 1372](js/17c-create-pipeline.js#L1287) migrate consistently |
| O2 | `additionalTurns` field can be deleted post-3.5 | §17.2: Phase 12 cleanup deletes `additionalTurns` from agent prompt schema and from `castEnforceCutOnSpeaker` |
| O3 | `speakerVisible` is scene-level; new `isVoiceOver` is per-line | §12.4: scene-level `speakerVisible` deprecated in Phase 3.5; replaced by per-line `isVoiceOver` derivation. Both `castDeriveSpeakerVisible` and `castApplyFramingDerived` migrate together |
| O4 | `_lockAndGenerateVideos` writes `s.duration = audioActualDuration` | §17.1: cleanup phase rewrites this lock step to write `durationSec` and trigger pass-2 `planSegments` |
| O5 | `motionPrompt` vs `prompt` field naming | §8.6: clarifies `scene.motionPrompt` is the canonical field ([js/21-kling.js:179-181](js/21-kling.js#L179-L181)); `fullMotionPrompt` is renamed to `motionPrompt` in the split-prompt input schema for consistency |

## 0.1 Audit-fix changelog (post-v4 audit pass — pre-this-revision)

The v4 audit ([cinematic-pipeline-plan-v4-audit.md](cinematic-pipeline-plan-v4-audit.md)) found 20 issues. All folded into this document.

## 0.2 Audit-fix changelog (this revision — v4 post-audit pass)

3 critical + 4 high + 3 medium + 5 minor findings from the v4 post-implementation review. All folded into this document.

| Audit finding | Severity | Section(s) updated | Resolution |
|---|---|---|---|
| C1 | Critical | §6.4, §5.2 | `legacyDialogueToLine` missing `speakerName` — added to shim setter and §5.2 schema |
| C2 | Critical | §5.2, §12.3, §6.7 | `speakerName` omitted from `dialogueLines[]` schema — added to §5.2, §12.3 references |
| C3 | Critical | §6.7 | `planTtsCalls` migration references `window.deriveSceneMood` — verified at [js/17b:3086](js/17b-create-references.js#L3086), reads `scene.performance.tone`. Migration code corrected to use exact current pattern with `typeof` guard |
| H1 | High | §5.2, §8.2 | `generatedDurationSec` and `croppedTailSec` have no documented writer — added explicit write-back step in §8.2. `durationTier` marked as informational-only; consumers documented |
| H2 | High | §6.6, §8.4 | `castGenerateMultiVoiceAudio` timing migration listed in both Phase 2b (§6.7) and Phase 8 (§6.6) — §6.6 updated to Phase 2b only; §8.4 clarified as Mode A only |
| H3 | High | §17.1 | Lock rewrite scope expanded from line change to full `_lockAndGenerateVideos` function |
| H4 | High | §12.5a | `backfillVisualSubjectIds` doesn't handle unresolved `speakerCharacterId` — added `speakerName` fallback with resolution chain |
| M1 | Medium | §5.2 | Post-lock `audioActualDuration === durationSec` semantics documented |
| M2 | Medium | §17.1 | `canGenerateVideos()` replacement gate specified |
| M3 | Medium | §6.5, §15 | `segmentPlanPass` re-trigger after duration edits specified |
| O1 | Minor | §12.1, §12.5 | `speakerName` preserved by `Object.assign({}, line)` in both cut-on-speaker rewrites — noted |
| O2 | Minor | §6.6 | Clarified `dialogue` in TTS segment input is a different shape from `scene.dialogue` |
| O3 | Minor | §8.7 | Sequential clip playback added as Phase 8 tracked sub-deliverable |
| O4 | Minor | §8.5 | `gemini-2.5-flash` availability fallback noted |
| O5 | Minor | §8.4 | Mode A only for timing finalization explicitly documented |

## 0.1 Audit-fix changelog (post-v4 audit pass)

The v4 audit ([cinematic-pipeline-plan-v4-audit.md](cinematic-pipeline-plan-v4-audit.md)) found 20 issues. All folded into this document. Summary of changes:

| Audit finding | Severity | Section(s) updated | Resolution |
|---|---|---|---|
| F-01 | Critical | §12.1, §6.6 | Phase 3 `castEnforceCutOnSpeaker` rewritten to read `seg.dialogueLines[]` instead of dead `additionalTurns` path. Migration window guarantee now actually holds. |
| F-02 | Critical | §3, §6.6 | `castBuildDialogueAndFramingHint` ([js/17b:2906](js/17b-create-references.js#L2906)) added as Phase 3 root writer migration target. |
| F-03 | Critical | §6.2, §6.7 (new) | `planTtsCalls` (3161-3334) and `castBuildFramingMotionPrompt` (3032) enumerated in §6.2 with explicit migration patterns in new §6.7. `castGenerateMultiVoiceAudio` timing writes (3483-3485) migrated to write directly onto `dialogueLines[]`. |
| F-04 | Critical | §6.6 | `dialogueLines` + new fields added to save path at [js/15-project.js:528](js/15-project.js#L528) and restore path at lines 1015-1029. |
| F-05 | High | §6.1, §6.2, §19, §22 | Dialogue site count corrected: 51 → 72. Per-file enumeration with verified line lists. |
| F-06 | High | §6.1, §6.2, §19, §22 | Duration site count corrected: 23+ → 48. Per-file enumeration with verified line lists. |
| F-07 | High | §12.4 | Two `castApplyFramingDerived` call sites at [17c:1291, 1376](js/17c-create-pipeline.js#L1291) explicitly enumerated. |
| F-08 | High | §6.2 | 17c dialogue table corrected: 3610/3818 removed (not dialogue access); 1274 added (writer — agent JSON consumer). |
| F-09 | High | §8.4, §6.7 | `findTtsMetaForLine` undefined function eliminated by migrating `castGenerateMultiVoiceAudio` to write timings directly onto `dialogueLines[lineIdx]`. Mode B / text-input / brainstorm paths no longer need timing-finalization (only Mode A retains it). |
| F-10 | Medium | §3, §10.2, §19, §22 | `_showNarratorChoice` line 521 → 520. |
| F-11 | Medium | §3, §6.6 | `castGenerateMultiVoiceAudio` line 3301 → 3308. |
| F-12 | Medium | §3, §8.5, §22 | `gemini-2.0-flash` URL line 151 → 150. |
| F-13 | Medium | §3, §8.4, §22 | `processReTTS` null timings 1138-1142 → 1140-1141 (return statement at 1132). |
| F-14 | Medium | §3, §22 | `STYLE_PRESETS` "7 distinct file groups" / "4 files" → 3 files (13 sites). |
| F-15 | Minor | §6.4, §22 | `audioActualDuration` count 8+ → 22 sites. |
| F-16 | Medium | §12.5, §12.5a (new) | Phase 3.5 `castEnforceCutOnSpeaker` full implementation code added. New §12.5a specifies `visualSubjectIds` back-computation for legacy projects on restore. |
| F-17 | Medium | §6.2 | 33-audio-rehearsal dialogue lines: 18 listed → 47 enumerated with reader/writer separation. |
| F-18 | Minor | §8.7 | Preview fallback wording corrected: cited sites are TARGETS for Phase 8 modification (currently read `scene.videoUrl` directly with no fallback), not sites that already have the behavior. |
| F-19 | Minor | §3 (folded into F-11) | §0 acknowledged 3301→3308 drift but §3 still showed 3301; corrected by F-11. |
| F-20 | Minor | §6.2 | 33-audio-rehearsal duration lines 696, 834 added to table (both inside `canGenerateVideos()`, deleted with that function in Phase 12). |

**Calendar impact:** the F-05/F-06 re-counts (72 dialogue + 48 duration vs claimed 51 + 23+) approximately double the migration scope. Calendar revised from 6–8 weeks → 8–10 weeks single engineer. See §19.

**Methodology lesson learned:** the v4 author's repeated failure mode was writing `file.js:N` references from fuzzy memory rather than re-greping at write time. The audit-fix pass re-verified every cited line against the live codebase. Going forward, every code citation in any plan document must include a fresh grep or `Read` reference at write time — not "verified earlier in the conversation" or "verified in a prior version."

---

## 1. Goal

Three user-visible outcomes:

1. **The agent picks framings by dramatic intent, not by lip-sync requirements.** Reaction shots, two-shots, wide establishing with dialogue, over-the-shoulder, profile — all valid. The pipeline routes lip sync per line based on whether the speaker is on screen and whether their mouth is visible.
2. **The script is not bent to fit the renderer.** A 7-second line stays a 7-second line. The renderer composes 5s and 10s segments to cover the audio, with prompt-aligned action per segment.
3. **The video provider is a swappable component.** Kling, Veo, Runway, Pika all plug in via a single config object.

## 2. Non-goals (v1)

- Not a generative model retraining effort.
- Not a multi-take / variant system.
- Not a real-time editing canvas.
- Not solving cross-scene action continuity.
- Not adding new lip-sync providers.
- Not multi-language audio per scene.
- **Not multi-character lip sync per scene** — multi-speaker visible scenes (two-shots where both faces lip-sync) deferred to v1.5.

## 3. Pre-existing primitives (verified file:line references)

- **Storyboard agent prompt builder** at [js/17b-create-references.js:2906](js/17b-create-references.js#L2906) — `castBuildDialogueAndFramingHint`. Currently emits forced-close-up rule (lines 2938-2944) AND the `dialogue + additionalTurns` schema (lines 2926-2946). **This is the root writer for the entire Phase 3 schema change** — its rewrite drives whether the agent produces `dialogue + additionalTurns` (legacy) or `dialogueLines[] + visualSubjectIds[]` (new). Phase 3 migration target (fix F-02).
- **`castEnforceCutOnSpeaker`** at [js/17b-create-references.js:2953](js/17b-create-references.js#L2953). Hardcodes `isVoiceOver: false` at line 2979 and `framing: 'frontal-close-up'` at line 2982.
- **`castDeriveSpeakerVisible`** at [js/17b-create-references.js:2994](js/17b-create-references.js#L2994). Scene-level boolean.
- **`castApplyFramingDerived`** at [js/17b-create-references.js:3503](js/17b-create-references.js#L3503). Reads `seg.dialogue` (singular), writes `seg.speakerVisible`, overrides `seg.dialogue.isVoiceOver = true` when not visible.
- **Multi-voice TTS** at [js/17b-create-references.js:3308](js/17b-create-references.js#L3308) — `castGenerateMultiVoiceAudio`. Writes `seg.dialogue.actualStartMs/EndMs` at [line 3484](js/17b-create-references.js#L3484).
- **`generateContinuationPrompt`** at [js/21-kling.js:137](js/21-kling.js#L137). Uses `gemini-2.0-flash` (not 2.5). BYOK direct fetch.
- **`buildClipPlan`** at [js/21-kling.js:163](js/21-kling.js#L163). Returns `[5]` if duration ≤ 5; `[10]` if ≤ 12; otherwise chained continuation.
- **`_animateSingleScene`** at [js/21-kling.js:175](js/21-kling.js#L175). Initializes `scene.videoClips = []` at line 202; pushes `{ url, clipDuration }` per segment at line 207.
- **Last-frame extraction** at [js/21-kling.js:107](js/21-kling.js#L107).
- **Audio rehearsal lock** at [js/33-audio-rehearsal.js:1136](js/33-audio-rehearsal.js#L1136) — writes `s.duration = s.audioActualDuration`.
- **Brainstorm wizard chip handler** at [js/26-brainstorm.js:434](js/26-brainstorm.js#L434) — `_handleWizardChip` (Quick mode).
- **`_confirmMode`** at [js/26-brainstorm.js:502](js/26-brainstorm.js#L502) — Brand/Film hero card entry routes to `_showNarratorChoice` at [line 520](js/26-brainstorm.js#L520).
- **`_wireNarratorChoiceScreen`** at [js/26-brainstorm.js:533](js/26-brainstorm.js#L533).
- **`STYLE_PRESETS`** at [js/17a-create-api.js:49](js/17a-create-api.js#L49). 20 entries verified. Consumed at 13 sites across 3 files (verified by grep): [js/17a-create-api.js](js/17a-create-api.js), [js/17c-create-pipeline.js](js/17c-create-pipeline.js), [js/20-reels-creator.js](js/20-reels-creator.js).
- **`processOriginalAudio`** at [js/32-audio-input.js:961](js/32-audio-input.js#L961). Produces `dialogueLines[]` with `audioSegmentStartMs/EndMs` set per line (project-level timestamps).
- **`processReTTS`** at [js/32-audio-input.js:1033](js/32-audio-input.js#L1033). Return statement at [line 1132](js/32-audio-input.js#L1132); produces `dialogueLines[]` with `audioSegmentStartMs: null` and `audioSegmentEndMs: null` at [lines 1140-1141](js/32-audio-input.js#L1140-L1141).

## 4. Core architectural shifts

| # | Old assumption | New rule |
|---|---|---|
| 1 | Scene has one `dialogue` object | Scene has `dialogueLines[]` |
| 2 | Dialogue scenes use close-up framings | Framings free; lip sync routes per line |
| 3 | Scene duration is continuous | Scene composed of provider tiers; segments stitched |
| 4 | Kling-specific code paths | Provider config swappable; tier-selection in planner |
| 5 | Audio rehearsal does drift detection + soundtouch | Audio is real-time; segment count adapts |
| 6 | Style is flat global, set late | Style is layered, locked before generation |

## 5. Data model

### 5.1 Project-level fields

```js
window.createJobState = {
  videoType: 'film' | 'brand',                     // existing

  narrationMode: null | 'pending' | 'dialogue' | 'voice-over' | 'mixed',

  // NEW — added in Phase 2a so Phase 3 can reference (fix C5)
  subStyle: {
    preset:        '<name>' | 'custom',
    description:   '<freeform>',
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
    id, durationTiers, minClipSec, maxClipSec, continuation, lipSyncCompatibility,
    pricing, capabilities,
  },

  characters, product, presenter, voiceConfig, ...               // existing
}
```

### 5.2 Scene shape — three duration fields, not one (fix H3)

```js
scene = {
  // existing — kept
  id, timeRange, framing, motionPrompt, imgDataUrl, ...

  // PRESERVED (already first-class — verified at js/15-project.js:1019, js/21-kling.js:202, js/27-canvas-state.js:167)
  videoUrl,                                  // stitched output URL (or videoClips[0].url for single-segment)
  videoClips: [                               // existing first-class field
    { url: '<segment URL>', clipDuration: 5.0 },
  ],

  // legacy compatibility — exposed via shim during migration (§6.5)
  // duration:   <continuous>     ← shimmed to durationSec only

  // NEW — three distinct duration fields (fix H3 / Audit-1 #1)
  durationSec:           7.4,                // visible scene length (creative target)
                                             // = what users edit
                                             // = what old `scene.duration` readers see
  generatedDurationSec:  10.0,               // rendered total = sum(segmentPlan[].durationSec)
  croppedTailSec:        2.6,                // generatedDurationSec - durationSec
  durationTier:          10,                 // dominant provider tier choice (informational)
                                             // NOT what scene.duration shim resolves to

  segmentPlan: [
    { idx: 0, durationSec: 5, role: 'main',         prompt: '<per-segment>' },
    { idx: 1, durationSec: 5, role: 'continuation', prompt: '<per-segment>' },
  ],
  segmentPlanPass: 'estimate' | 'actual',

  // NEW — visual decoupling
  visualSubjectIds:  ['char_maya'],

  // NEW — dialogue is an array (legacy `scene.dialogue` shimmed per §6.4)
  dialogueLines: [
    {
      speakerCharacterId: 'char_joe',
      speakerName:        'Joe',             // audit fix C2: added — used by voice resolution, framing prompts, audio UI
      text:               'I had to.',
      mood:               'serious',
      isVoiceOver:        true,             // derived from visualSubjectIds + framing
      withinSceneStartMs: 1500,             // populated by Phase 8 timing-finalization
      withinSceneEndMs:   6200,
      audioBufferKey:     'audio_line_<sceneId>_0',
      regenCount:         0,
      regenLockToken:     null,
      voiceOverride:      null,
      muted:              false,
    }
  ],

  // NEW — derived from dialogueLines + tier (Phase 8 timing-finalization)
  audioRegions: [
    { startMs: 0,    endMs: 1500, type: 'pre-roll-silence' },
    { startMs: 1500, endMs: 6200, type: 'dialogue', lineIdx: 0 },
    { startMs: 6200, endMs: 7000, type: 'post-roll-silence' },
  ],

  // NEW — per-scene style override (rare; null on most scenes)
  styleOverride:     <subStyle object> | null,

  // NEW — derived per-scene
  continuityImportance: 'low' | 'medium' | 'high',

  // existing — kept
  startTime, endTime, lipSync, audioActualDuration, ...

  // Audit fix M1: post-lock semantics
  // After audio rehearsal lock, audioActualDuration === durationSec. Both fields
  // hold the same value. audioActualDuration is kept for backward compatibility with
  // audio-rehearsal code that reads it (Phase 12 rewrites references). New code reads
  // durationSec. During pass-1 (storyboard time, before lock), audioActualDuration is
  // null and durationSec holds the agent's estimate.

  // DEPRECATED in Phase 3.5 (replaced by per-line isVoiceOver)
  // speakerVisible:  bool                ← removed; was scene-level

  // REMOVED after Phase 12 cleanup
  // durationStatus, durationDriftPct, audioStale  ← drift detection deleted
}
```

**Key v4 decision:** the `scene.duration` shim resolves **only** to `durationSec` (visible length). It never resolves to `durationTier` (mechanical) or `generatedDurationSec` (rendered total). This preserves the meaning that all 48 legacy reader sites (re-counted in F-06) already assume.

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
brainstormState.wizardAnswers = {                       // Quick mode only
  type:             'social' | 'tutorial',
  length:           '30s' | '60s' | '90s',
  visualStyle:      <subStyle shape>,
  visualTreatment:  <visualTreatment shape>,
}

// Brand/Film direct-entry — set on inline picker after narrator-choice screen
brainstormState.visualStyle      = <subStyle shape>;
brainstormState.visualTreatment  = <visualTreatment shape>;
```

## 6. Schema migration

### 6.1 Phase subdivision

- **Phase 2a** — Schema + dual shims + writer migration. Adds new fields; installs `Object.defineProperty` shims for `scene.dialogue` (§6.4) and `scene.duration` (§6.5). Adds `createJobState.subStyle` and `createJobState.visualTreatment` stubs (fix C5). Migrates writers.
- **Phase 3** — Storyboard agent prompt rewrite. **`castEnforceCutOnSpeaker` continues unconditional split.** Single-speaker scenes only.
- **Phase 2b** — Reader migration. Migrate all 72 `scene.dialogue` source lines (across 4 files, re-counted in F-05) and all 48 `scene.duration` source lines (across 9 files, re-counted in F-06).
- **Phase 3.5** — Lift cut-on-speaker constraint *narrowly*. Multi-line scenes allowed ONLY when ≤1 speaker is visibly lip-synced (fix Audit-1 #2). Migrate `castApplyFramingDerived` to per-line semantics (fix H2).
- **Phase 12** — Cleanup. Shim removal. Drift detection deleted. `STYLE_PRESETS` global retained for Reels.

### 6.2 Known reader-site enumeration

**`scene.dialogue` consumers — 72 unique source lines across 4 files (re-counted in audit fix F-05):**

| File | Unique lines | Lines (verified by grep) | Migration class |
|---|---|---|---|
| `js/33-audio-rehearsal.js` | 47 | **Read sites:** 161, 163, 167, 176, 177, 183, 185, 187, 235, 324, 384, 390, 394, 404, 426, 451-452, 474, 512, 573, 594, 793-794, 849-852, 950, 1092-1093, 1202, 1218, 1245, 1262. **Write sites (per-line voiceOverride / regen flow):** 429, 444-448, 595, 636-638, 1246-1247, 1263 | Phase 9 (per-line UI rebuild) — readers iterate `dialogueLines[]`; writers target specific `dialogueLines[lineIdx]` |
| `js/17b-create-references.js` | 21 | **`castEnforceCutOnSpeaker`:** 2957, 2985 (writer migration). **`castBuildFramingMotionPrompt`:** 3032 (reader migration — added in F-03). **`planTtsCalls`:** 3161, 3162, 3163, 3164, 3167, 3225, 3289, 3290, 3334 (reader migration — added in F-03). **`castGenerateMultiVoiceAudio` timing writes:** 3483, 3484, 3485 (writer migration — wraps to write per-line `withinSceneStartMs/EndMs` on `dialogueLines[]`). **`castApplyFramingDerived`:** 3509, 3510, 3513, 3514, 3516, 3524 (writer migration). | Phase 2a writers: 2957, 2985, 3483-3485. Phase 3.5 writers: 3509-3524. Phase 2b readers: 3032, 3161-3334 |
| `js/17c-create-pipeline.js` | 3 | 1274 (writer — agent JSON consumer); 3606 (reader); 3816 (reader) | Phase 3 (1274 — must change to write `dialogueLines` after agent schema rewrite); Phase 2b (3606, 3816 — reader migration) |
| `js/29-canvas-render.js` | 1 | 564 (`const dlg = scene.dialogue`) | Phase 2b reader migration |

`js/32-audio-input.js` writes `dialogue: { ... }` at line 1111 (within `processReTTS` segments fed to multi-voice TTS) — that's NOT `scene.dialogue` but rather a TTS input segment shape. It's preserved as Phase 2a writer migration (TTS pipeline contract unchanged in v1; segments still take `dialogue` shape, output `dialogueLines[]`).

`js/26-brainstorm.js` accesses `sc.dialogue` at lines 1441, 1520, 1626 — these are brainstorm-finalised script dialogue arrays (`[{character, line}]` per the brainstorm JSON schema), **not** `scene.dialogue` from the storyboard agent. Excluded from migration scope.

**`scene.duration` consumers — 48 unique source lines across 9 files (re-counted in audit fix F-06):**

| File | Unique lines | Verified read lines | Verified write lines |
|---|---|---|---|
| `js/17d-create-languages.js` | 13 | 127, 388, 394, 769, 771, 773, 780, 784, 786, 801, 819, 831, 1144 | none |
| `js/20-reels-creator.js` | 7 | 142, 4411, 4451, 5203, 5217, 5438, 5445 | none |
| `js/15-project.js` | 6 | 508, 528, 529, 625, 900, 1029 | none |
| `js/33-audio-rehearsal.js` | 6 | 193, 528, 696, 834 | 531 (manual edit), 1136 (lock writes from `audioActualDuration`). Lines 696 and 834 are inside `canGenerateVideos()` and the visualizer total-calculator — both deleted with `canGenerateVideos` in Phase 12. |
| `js/17c-create-pipeline.js` | 5 | 1027, 2144, 3621, 3842, 5057 | none |
| `js/29-canvas-render.js` | 5 | 187, 554, 798, 3115 | 3116 (UI stepper) |
| `js/27-canvas-state.js` | 4 | 102, 103, 348, 379 | none |
| `js/21-kling.js` | 1 | 176 | none |
| `js/11-export.js` | 1 | 309 | none |

**Total writers:** 3 (29-canvas-render:3116, 33-audio-rehearsal:531, 33-audio-rehearsal:1136). All other 45 are readers.

Phase 2b migrates each reader explicitly. Phase 12 removes the shim.

### 6.3 The `scene.dialogue` shim

```js
function attachDialogueShim(scene) {
  if (Object.getOwnPropertyDescriptor(scene, 'dialogue')) return;

  Object.defineProperty(scene, 'dialogue', {
    configurable: true,
    enumerable:   false,           // doesn't surface in JSON.stringify
    get() {
      const lines = this.dialogueLines || [];
      if (lines.length > 1 && !this._dialogueShimWarned) {
        console.warn(
          `[migration] scene.dialogue accessed on multi-line scene (${lines.length} lines). ` +
          `Reader should migrate to scene.dialogueLines[]. Scene id: ${this.id}`
        );
        this._dialogueShimWarned = true;
        // Telemetry counter for v4 — fix Audit-1 monitoring
        if (typeof window._cinematicShimWarnings !== 'undefined') {
          window._cinematicShimWarnings.dialogue = (window._cinematicShimWarnings.dialogue || 0) + 1;
        }
      }
      return lines[0] || null;
    },
    set(value) {
      this.dialogueLines = value ? [legacyDialogueToLine(value)] : [];
    },
  });
}
```

### 6.4 `legacyDialogueToLine` — fix C1

The v3 bug: `legacyDialogue.audioActualDuration` doesn't exist. `audioActualDuration` is on **scene** (22 sites total: 20 in [js/33-audio-rehearsal.js](js/33-audio-rehearsal.js) and 2 in [js/17b-create-references.js](js/17b-create-references.js)), never on dialogue. v4 fix:

```js
function legacyDialogueToLine(legacyDialogue) {
  return {
    speakerCharacterId: legacyDialogue.speakerCharacterId,
    speakerName:        legacyDialogue.speakerName || null,        // audit fix C1/C2: was missing
    text:               legacyDialogue.text,
    mood:               legacyDialogue.voiceOverride?.mood || 'matter-of-fact',
    isVoiceOver:        legacyDialogue.isVoiceOver || false,
    // v4 fix: leave timings null; Phase 8 timing-finalization populates them
    // from canonical source (scene.audioActualDuration for legacy projects, or
    // multi-voice TTS metadata for new projects)
    withinSceneStartMs: null,
    withinSceneEndMs:   null,
    audioBufferKey:     null,
    regenCount:         legacyDialogue.regenCount || 0,
    regenLockToken:     legacyDialogue.regenLockToken || null,
    voiceOverride:      legacyDialogue.voiceOverride || null,
    muted:              legacyDialogue.muted || false,
  };
}
```

### 6.5 The `scene.duration` shim — three-field model (fix H3, Audit-1 #1)

```js
function attachDurationShim(scene) {
  if (Object.getOwnPropertyDescriptor(scene, 'duration')) return;

  Object.defineProperty(scene, 'duration', {
    configurable: true,
    enumerable:   false,
    get() {
      // v4 fix: resolve ONLY to visible scene length (durationSec), never to
      // mechanical tier or rendered total. Old readers expect continuous
      // visible duration; that's durationSec by construction.
      if (typeof this.durationSec === 'number') return this.durationSec;
      if (typeof this._legacyDuration === 'number') return this._legacyDuration;
      // Telemetry: fall-through to fallback = unmigrated reader signal
      if (typeof window._cinematicShimWarnings !== 'undefined') {
        window._cinematicShimWarnings.durationFallthrough =
          (window._cinematicShimWarnings.durationFallthrough || 0) + 1;
      }
      return 0;
    },
    set(value) {
      // Legacy writers: stash on _legacyDuration. Mark segmentPlan stale so
      // pass-2 planSegments re-runs before any next render/export step.
      this._legacyDuration = value;
      this.durationSec = value;          // also update the canonical field
      this.segmentPlanPass = null;        // force re-plan
    },
  });
}
```

The setter: legacy writes (e.g., the UI stepper at [js/29-canvas-render.js:3116](js/29-canvas-render.js#L3116) that sets `scene.duration = ...`, or the audio rehearsal lock at [js/33-audio-rehearsal.js:1136](js/33-audio-rehearsal.js#L1136) that sets `s.duration = s.audioActualDuration`) update `_legacyDuration`, mirror to `durationSec`, and mark `segmentPlanPass = null` so pass-2 re-runs.

**Audit fix M3:** When the user edits `durationSec` directly (Class B edit via the duration stepper), the edit must also trigger a pass-1 `planSegments` re-run using the new `durationSec` as the estimate. The segment plan is recomputed, `segmentPlanPass` is set to `'estimate'`, and the UI shows a "re-plan needed" state. After the next audio rehearsal lock, pass-2 runs with actual audio and promotes to `'actual'`.

### 6.6 Phase 2a writer migration sites

| Site (verified file:line) | Current behavior | v4 migration |
|---|---|---|
| **`castBuildDialogueAndFramingHint`** at [js/17b-create-references.js:2906](js/17b-create-references.js#L2906) (added in F-02 fix) | Builds the agent's prompt instructing it to emit `dialogue: { speakerName, text, isVoiceOver, additionalTurns: [...] }`. Schema text at lines 2926-2946. Forced-close-up rule at 2938-2944. | **Phase 3:** rewrite the entire `promptHint` body. Replace `dialogue + additionalTurns` schema with `dialogueLines: [{ speakerName, speakerCharacterId, text, mood, isVoiceOver }]`. Add `visualSubjectIds: [<character-id>...]` to schema. Remove forced-close-up rule (allow free framing). Update `schemaFieldList` from `, "dialogue": null, "framing": "frontal-medium"` to `, "dialogueLines": [], "visualSubjectIds": [], "framing": "frontal-medium"`. **This is the root writer that drives the entire Phase 3 schema change — without this rewrite, the agent never produces the new shape and Phase 3's other code becomes vestigial.** |
| **Agent JSON consumer** at [js/17c-create-pipeline.js:1274](js/17c-create-pipeline.js#L1274) (added in F-02/F-08 fix) | `if (d.dialogue !== undefined) segments[idx].dialogue = d.dialogue || null;` | **Phase 3:** rewrite to `if (d.dialogueLines !== undefined) segments[idx].dialogueLines = d.dialogueLines || []; if (d.visualSubjectIds !== undefined) segments[idx].visualSubjectIds = d.visualSubjectIds || [];`. Must land in the same atomic change as `castBuildDialogueAndFramingHint` and `castEnforceCutOnSpeaker`. |
| Storyboard agent JSON output → scene constructor | Writes one `dialogue` object | Constructs `dialogueLines: [<one entry>]` post-Phase-3; legacy `dialogue` writes flow through Phase 2a shim setter |
| `castEnforceCutOnSpeaker` at [js/17b-create-references.js:2953](js/17b-create-references.js#L2953) (called from [js/17c:1288, 1373](js/17c-create-pipeline.js#L1288)) | Splits multi-speaker scenes via `dlg.additionalTurns`; hardcodes `isVoiceOver: false` at line 2979; hardcodes `framing: 'frontal-close-up'` at 2982 | **Phase 3:** rewritten to read `seg.dialogueLines[]` directly (since `additionalTurns` no longer exists post-`castBuildDialogueAndFramingHint` rewrite). Splits when `lines.length > 1`, preserves each line's `isVoiceOver` (fix H1). Implementation in §12.1. **Phase 3.5:** narrowed — only splits when >1 visible-lipsynced speakers (§12.5). |
| `castApplyFramingDerived` at [js/17b-create-references.js:3503](js/17b-create-references.js#L3503) (called from [js/17c:1291, 1376](js/17c-create-pipeline.js#L1291)) | Reads `seg.dialogue`, sets scene-level `seg.speakerVisible`, overrides `seg.dialogue.isVoiceOver` | **Phase 3.5:** rewrite to iterate `dialogueLines[]`; per-line `isVoiceOver` derivation (fix H2). Implementation in §12.4. |
| `processOriginalAudio` at [js/32-audio-input.js:961](js/32-audio-input.js#L961) | Already produces `dialogueLines[]` with project-level `audioSegmentStartMs/EndMs` (verified — line-level, not word-level) | No change to producer; scene-construction step normalizes timings (§8.4) |
| `processReTTS` at [js/32-audio-input.js:1111](js/32-audio-input.js#L1111) (segments writer) | Writes `dialogue: { speakerCharacterId, text, isVoiceOver }` to TTS segment input | Writer keeps writing `dialogue` shape for the TTS-internal pipeline (this is a per-line TTS input shape, NOT `scene.dialogue`). Audit fix O2: the TTS segment `dialogue` shape is consumed by `castGenerateMultiVoiceAudio` internally; it's a different contract from `scene.dialogue`. Output `dialogueLines[]` (line 1132) is the scene-level shape and is preserved. |
| `castGenerateMultiVoiceAudio` at [js/17b-create-references.js:3308](js/17b-create-references.js#L3308) | Writes `seg.dialogue.actualStartMs/EndMs` at [line 3484](js/17b-create-references.js#L3484) | **Phase 2b** (audit fix H2): migrate to write `seg.dialogueLines[lineIdx].withinSceneStartMs/EndMs` directly. The `{ seg, lineIdx }` shape from the revised `planTtsCalls` (§6.7) provides the line index. This eliminates the need for a separate timing-finalization step for TTS paths (§8.4) — only Mode A needs explicit finalization. |
| Audio rehearsal lock at [js/33-audio-rehearsal.js:1136](js/33-audio-rehearsal.js#L1136) | `s.duration = s.audioActualDuration` | Phase 12: rewrite to `s.durationSec = s.audioActualDuration` and trigger pass-2 `planSegments` (fix O4) |
| UI duration stepper at [js/29-canvas-render.js:3116](js/29-canvas-render.js#L3116) | `scene.duration = ...` | Goes through shim's `set` path; updates `_legacyDuration` + `durationSec` + invalidates plan |
| Manual duration edit at [js/33-audio-rehearsal.js:531](js/33-audio-rehearsal.js#L531) | `scene.duration = scene.manualDuration` | Same shim setter |
| Project autosave/restore at [js/15-project.js:1019-1029](js/15-project.js#L1019-L1029) | Restores `scene.videoClips` from `s.videoClipsData`; sets `scene.videoUrl = scene.videoClips[0].url` | §8.7: restore prefers `s.stitchedVideoData` if present; else falls back to `videoClips[0].url` and sets stitched-missing flag |
| **Project autosave SAVE path at [js/15-project.js:528](js/15-project.js#L528)** (added in F-04 fix) | `const base = { id, prompt, startTime, endTime, duration, text, imgDataUrl, refCharacters, refEnvironment };` — explicitly enumerates saved fields. `dialogue` is NOT saved (always reconstructed from script). | **Phase 2a:** extend the `base` object to include `dialogueLines: s.dialogueLines \|\| null`, `visualSubjectIds: s.visualSubjectIds \|\| null`, `durationSec: s.durationSec`, `durationTier: s.durationTier`, `segmentPlan: s.segmentPlan`, `audioRegions: s.audioRegions`, `stitchedVideoData: <new persistence per §8.7>`. `dialogueLines[]` carries durable per-line state (regenCount, voiceOverride, muted, withinSceneStartMs/EndMs) that must survive save/restore. Without this, every project restore loses timing finalization results, per-line voice overrides, and regen counts (fix F-04). |
| **Project autosave RESTORE at [js/15-project.js:1015-1029](js/15-project.js#L1015-L1029)** (added in F-04 fix) | Reads `s.videoClipsData` and sets `scene.videoClips`, `scene.videoUrl`, `scene.duration`. Does NOT restore `dialogue` (it's absent from save path). | **Phase 2a:** restore `dialogueLines`, `visualSubjectIds`, `durationSec`, `durationTier`, `segmentPlan`, `audioRegions` from saved fields. Re-attach the `scene.dialogue` shim (§6.3) and the `scene.duration` shim (§6.5) after population. Re-derive `isVoiceOver` per line from current `framing` + `visualSubjectIds` (since framing or visual-subjects edits between save and restore would invalidate cached `isVoiceOver`). For pre-v4 saved projects (no `dialogueLines` in payload), shim's set path takes the legacy `dialogue` from the `scene` object once Phase 3 has run; new projects load directly. |

### 6.7 Reader migration patterns (added in F-03 fix)

Phase 2b touches every site enumerated in §6.2. Several clusters have specific migration patterns worth calling out explicitly:

**`planTtsCalls` at [js/17b-create-references.js:3157](js/17b-create-references.js#L3157)** (reader, 9 dialogue access lines: 3161-3167, 3225, 3289, 3290, 3334):

Currently iterates `segments` and reads `seg.dialogue.text`, `seg.dialogue.speakerCharacterId`, `seg.dialogue.speakerName`, `seg.dialogue.voiceOverride.mood` per segment. Groups by `(speakerId, mood)`.

Migration: replace the outer loop body with an inner loop over `seg.dialogueLines[]`. Each line becomes its own grouping key. **Audit fix C3:** `window.deriveSceneMood` verified at [js/17b-create-references.js:3086](js/17b-create-references.js#L3086) — reads `scene.performance.tone`. The mood fallback uses `typeof window.deriveSceneMood === 'function'` guard consistent with patterns at [js/33-audio-rehearsal.js:184, 391](js/33-audio-rehearsal.js#L184).

Migration: replace the outer loop body with an inner loop over `seg.dialogueLines[]`. Each line becomes its own grouping key:

```js
function planTtsCalls(segments) {
  const calls = [];
  let active = null;
  for (const seg of segments) {
    const lines = seg && Array.isArray(seg.dialogueLines) ? seg.dialogueLines : [];
    for (const line of lines) {
      if (!line || !line.text) continue;
      const speakerId = line.speakerCharacterId || 'narrator';
      const speakerName = line.speakerName || 'narrator';
      const mood = (line.voiceOverride && line.voiceOverride.mood)
        || (seg.performance && (typeof window.deriveSceneMood === 'function')
            ? window.deriveSceneMood(seg)
            : 'matter-of-fact')
        || 'matter-of-fact';
      const sentenceText = line.text.replace(/[.!?]?\s*$/, '.');
      // ... rest of grouping logic unchanged, but each call descriptor now
      // tracks { seg, lineIdx } pairs instead of { seg } so timing-finalization
      // can write back to dialogueLines[lineIdx].withinSceneStartMs/EndMs
      ...
    }
  }
  return calls;
}
```

The `call.segments` array shape changes from `[seg, seg, ...]` to `[{ seg, lineIdx }, ...]`. All consumers of this output (notably `castGenerateMultiVoiceAudio`'s timing write loop at lines 3483-3485) must update to use the `{ seg, lineIdx }` shape and write to `seg.dialogueLines[lineIdx].withinSceneStartMs/EndMs` instead of `seg.dialogue.actualStartMs/EndMs`.

**`castBuildFramingMotionPrompt` at [js/17b-create-references.js:3028](js/17b-create-references.js#L3028)** (reader, 1 dialogue access line: 3032):

Reads `scene.dialogue.speakerName` to substitute `{speaker}` in framing prompt templates. Migration: read `scene.dialogueLines[0].speakerName` with runtime check. Phase 3 invariant guarantees `dialogueLines.length <= 1` (cut-on-speaker forces split). Phase 3.5+ may have multi-line scenes, but the framing motion prompt is built per-scene; pick the first line's speaker as the framing-template subject.

```js
window.castBuildFramingMotionPrompt = function (scene) {
  if (!scene || !scene.framing) return '';
  const tmpl = FRAMING_PROMPTS[scene.framing];
  if (!tmpl) return '';
  const firstLine = (scene.dialogueLines && scene.dialogueLines[0]) || null;
  const speaker = (firstLine && firstLine.speakerName) || 'the speaker';
  ...
};
```

**`castGenerateMultiVoiceAudio` timing writes at [js/17b-create-references.js:3483-3485](js/17b-create-references.js#L3483-L3485)** (writer):

Currently writes `seg.dialogue.actualStartMs/EndMs` for the per-segment timing of the joined TTS output. Migration: write `seg.dialogueLines[lineIdx].withinSceneStartMs/EndMs` (already scene-local because the planner pass-2 normalization happens upstream). The `lineIdx` is available because the call descriptor (revised per `planTtsCalls` migration above) carries `{ seg, lineIdx }` pairs.

This obsoletes the separate timing-finalization step for Mode B / re-TTS / text-input paths — `castGenerateMultiVoiceAudio` writes timings directly onto the canonical `dialogueLines[]` contract. Mode A still needs the explicit project-level → scene-local normalization in §8.4 because Mode A timings come from Scribe diarization (not from TTS).

This also resolves F-09 (`findTtsMetaForLine` undefined): with `castGenerateMultiVoiceAudio` writing timings directly onto `dialogueLines[]`, there's no separate metadata lookup to perform.

## 7. Provider abstraction

```js
videoProvider = {
  id:                  'kling-v1.6' | 'veo-3' | 'runway-gen3' | 'pika-1' | ...,
  durationTiers:       [5, 10],
  minClipSec:          5,
  maxClipSec:          10,
  continuation: {
    supported:         true,
    mode:              'last-frame-i2v' | 'last-frames-conditioning' | 'embedding' | 'none',
    overlapSec:        0,
  },
  lipSyncCompatibility: {
    tier1MediaPipe:    true,
    tier2Provider:     'kling-fal' | null,
  },
  pricing: {
    tier:              { 5: 0.20, 10: 0.40 },
    continuationDelta: 0,
  },
  capabilities: {
    handlesComplexMotion:         'good' | 'fair' | 'poor',
    handlesFaceContinuity:        'good' | 'fair' | 'poor',
    handlesEnvironmentContinuity: 'good' | 'fair' | 'poor',
  },
}
```

**Tier-selection algorithm lives in `planSegments`, not in this config** (preserving v3's correct decision).

Uniformed interface:
```js
provider.submit(imgDataUrl, prompt, durationSec, opts)  → { taskId }
provider.pollTask(taskId)                                → { status, videoUrl }
```

Phase 1 wraps existing Kling submit/poll; does NOT bake in `buildClipPlan`'s ≤12s rule.

## 8. Segment planner

### 8.1 Two-pass model

**Pass 1 — Estimate (storyboard time):**
- Input: `scene.durationSec` (agent's creative target)
- Output: initial `segmentPlan`
- `scene.segmentPlanPass = 'estimate'`

**Pass 2 — Actual (audio rehearsal lock time):**
- Prerequisite: timing-finalization (§8.4)
- Input: actual `audioMs` from finalized timings
- Output: revised `segmentPlan` + `audioRegions[]`
- Tier change → Class B cascade with confirmation if downstream scenes have video

### 8.2 The function

```js
planSegments({
  audioMs, provider, scene, requiresLipSync, continuityImportance, pass
}) → {
  segments, audioRegions, totalGenSec, croppedTailSec, expectedCost, fallbackPlan
}

// Audit fix H1: Caller writes back to scene after planSegments returns:
//
//   scene.segmentPlan = result.segments;
//   scene.segmentPlanPass = pass;                     // 'estimate' or 'actual'
//   scene.generatedDurationSec = result.totalGenSec;  // sum of segment durations
//   scene.croppedTailSec = result.croppedTailSec;     // generatedDurationSec - durationSec
//   scene.durationTier = result.segments[0]?.durationSec
//                      ?? result.segments.reduce((s, x) => Math.max(s, x.durationSec), 0);
//                                                      // dominant tier (largest segment duration)
//
// `durationTier` is informational-only — it is NOT read by any consumer in v4.
// The `scene.duration` shim resolves to `durationSec` (visible length), never `durationTier`.
// `durationTier` is kept on the scene for debugging and possible future use, but has no
// runtime effect. If a future consumer needs the "which tier was selected" value, it can
// read `segmentPlan[0].durationSec` directly.
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
```

Selection table for `[5, 10]` and `splitThreshold: 7.0`:

| Audio | Plan | Cropped | Cost | Behavior change vs current |
|---|---|---|---|---|
| 4.0s | [5] | 1.0 | $0.20 | none |
| 5.0s | [5] | 0.0 | $0.20 | none |
| 5.5s | [10] | 4.5 | $0.40 | none (current also returns [10]) |
| 7.0s | [10] | 3.0 | $0.40 | none |
| 7.5s | [5,5] | 2.5 | $0.40 | **changed:** current returns [10] (one clip); v4 returns [5,5] (two clips) |
| 9.5s | [5,5] | 0.5 | $0.40 | **changed:** current [10]; v4 [5,5] |
| 10.5s | [10,5] | 4.5 | $0.60 | similar (current also splits) |
| 12.0s | [10,5] | 3.0 | $0.60 | similar |

The **behavioral change** for legacy projects with audio in 7.0s–10s range: today they get one 10s clip; v4 gives two 5s clips. Same Kling cost; different stitching path. Phase 8 integration test verifies the threshold (fix C3).

### 8.4 Timing finalization sub-step (fix Audit-1 #3, M2 retraction)

Runs between audio rehearsal lock and pass-2 `planSegments`. Per input path:

| Source | Algorithm |
|---|---|
| Audio input Mode A ([js/32-audio-input.js:961-997](js/32-audio-input.js#L961-L997)) | `audioSegmentStartMs/EndMs` are project-level line timings (verified line-level by reading 961-997). Normalize to scene-local: `withinSceneStartMs = audioSegmentStartMs - scene.absoluteStartMs` where `scene.absoluteStartMs = min(line.audioSegmentStartMs)` across the scene's lines. **Mode A is the only path that requires the explicit `finalizeSceneTimings` step** because Mode A timings come from Scribe diarization, not from TTS. |
| Audio input Mode B / Text input / Brainstorm finalise (all → multi-voice TTS) | **No separate timing-finalization needed (fix F-09, audit fix H2).** `castGenerateMultiVoiceAudio` is migrated in Phase 2b to write `withinSceneStartMs/EndMs` directly onto `seg.dialogueLines[lineIdx]` entries (per the `planTtsCalls` migration in §6.7). Timings are scene-local by construction because multi-voice TTS already operates per-line **and** Phase 2b writes scene-local offsets. The legacy `seg.dialogue.actualStartMs/EndMs` fields ([lines 3483-3485](js/17b-create-references.js#L3483-L3485)) are removed in the same migration. |
| B-roll / no dialogue | Empty `dialogueLines`; skip |

```js
// Only Mode A reaches this function (F-09 fix: TTS paths write timings directly).
// Audit fix O5: this function handles Mode A exclusively; TTS paths (Mode B, text input,
// brainstorm) write timings directly via castGenerateMultiVoiceAudio in Phase 2b.
function finalizeSceneTimings(scene) {
  // Mode A: project-level → scene-local normalization
  const linesWithSrc = (scene.dialogueLines || []).filter(l => l.audioSegmentStartMs != null);
  if (linesWithSrc.length === 0) return;   // not Mode A; nothing to do

  const sceneAbsStartMs = Math.min(...linesWithSrc.map(l => l.audioSegmentStartMs));
  for (const line of linesWithSrc) {
    line.withinSceneStartMs = line.audioSegmentStartMs - sceneAbsStartMs;
    line.withinSceneEndMs   = line.audioSegmentEndMs   - sceneAbsStartMs;
  }

  // Lines without audioSegmentStartMs (mixed Mode A + TTS-extras within a scene —
  // rare, only when an AI-suggested extra in audio-input has VO via re-TTS) keep
  // whatever withinSceneStartMs/EndMs the TTS path already wrote.
}
```

`audioRegions[]` is then computed deterministically from the populated `withinSceneStartMs/EndMs`.

### 8.5 Gemini split-prompt call (fix C4)

Replaces `generateContinuationPrompt` at [js/21-kling.js:137](js/21-kling.js#L137).

**Gemini model:** `gemini-2.5-flash` (upgrade from current `gemini-2.0-flash` at [js/21-kling.js:150](js/21-kling.js#L150)). Cost ~$0.001 per scene with split. **Audit fix O4:** if `gemini-2.5-flash` is not available at implementation time, fall back to `gemini-2.0-flash` (same call pattern, slightly less capable at continuity prompts).

**Key management (fix C4):** uses the same `geminiKey` parameter pattern as the existing `generateContinuationPrompt`. Direct fetch from client during v1; will be re-routed through the server API as part of migration plan's server-AI cutover (Phase 04/05). The cinematic plan does NOT introduce a new direct-fetch surface beyond what already exists; it wraps the same call site.

**Cross-plan note:** when migration Phase 04/05 ships the server-AI proxy, this split-prompt call migrates with the rest of the Gemini surface area. No additional cinematic plan work needed.

### 8.6 Motion prompt naming (fix O5)

The canonical field is **`scene.motionPrompt`** (verified at [js/21-kling.js:179-181](js/21-kling.js#L179-L181) — `scene.motionPrompt` is preferred, falls back to `scene.prompt`). The split-prompt input schema uses `scene.motionPrompt` directly. v3's `fullMotionPrompt` rename is dropped.

```js
// Split-prompt input
{
  scene: {
    motionPrompt:        scene.motionPrompt,    // canonical field
    framing:             scene.framing,
    visualSubjectIds:    scene.visualSubjectIds,
    durationSec:         scene.durationSec,
    dialogueLines:       scene.dialogueLines,
  },
  segmentPlan: [...],
  audioMs, audioRegions, continuityImportance, styleHint, treatmentHint,
}
```

### 8.7 Stitching strategy and persistence (fix Audit-1 #4)

Bifurcated by lip-sync routing:

| Lip-sync route | Stitching method | Persistence |
|---|---|---|
| Tier 2 (Kling LipSync) | Server-side ffmpeg via R2/CF | `stitchedVideoData` + `videoClipsData[]` both persist |
| Tier 1 (MediaPipe) | Client-side MSE | `videoClipsData[]` persists; `stitchedVideoData` may be absent |
| No lip sync | MSE | Same as Tier 1 |

**Persistence contract:**

- **`videoClipsData[]`** — array of `{ url, clipDuration }` per segment, persisted on save (existing field at [js/15-project.js:527](js/15-project.js#L527)).
- **`stitchedVideoData`** — new field. Stitched output URL (or blob ref). Persisted on save when stitching succeeded.

**Restore behavior** at [js/15-project.js:1019-1029](js/15-project.js#L1019-L1029):

```js
function restoreSceneVideoState(s, scene) {
  if (s.videoClipsData) {
    scene.videoClips = s.videoClipsData.map(cd => ({ url: cd.url, clipDuration: cd.clipDuration }));
  }
  if (s.stitchedVideoData) {
    // Prefer stitched output for primary playback
    scene.videoUrl = s.stitchedVideoData.url;
    scene._stitchedVideoMissing = false;
  } else if (scene.videoClips && scene.videoClips.length > 0) {
    // Fallback: first clip URL, mark stitched as missing
    scene.videoUrl = scene.videoClips[0].url;
    scene._stitchedVideoMissing = scene.videoClips.length > 1;
  } else {
    // Legacy single-clip project
    scene.videoUrl = s.videoUrl || null;
    scene._stitchedVideoMissing = false;
  }
}
```

**Phase 8 must add `_stitchedVideoMissing` checks at the following preview sites — they currently read `scene.videoUrl` directly with no fallback (verified):**

- [js/29-canvas-render.js:2442](js/29-canvas-render.js#L2442) — `const previewUrl = vid.videoUrl || '';`
- [js/29-canvas-render.js:3388](js/29-canvas-render.js#L3388) — `if (scene.videoUrl) vid.videoUrl = scene.videoUrl;`
- [js/20-reels-creator.js:2927](js/20-reels-creator.js#L2927) — `${reelVideoMode === 'animated' && scene.videoUrl ...}`
- [js/20-reels-creator.js:3066](js/20-reels-creator.js#L3066) — `if (reelVideoMode === 'animated' && scene.videoUrl) {...}`

When `_stitchedVideoMissing === true`, the modified preview tick must check the flag and route to **sequential clip playback** — play `videoClips[0]`, then `videoClips[1]`, etc. This behavior does NOT exist today; it is a Phase 8 tracked sub-deliverable (audit fix O3). Implementation requires: (a) a clip-queue player that detects `videoClips[i].url` `ended` event and queues the next clip, (b) subtitle timing adjustment across clip boundaries (in `js/17d-create-languages.js`), (c) visual transition handling (hard cut for v1, crossfade for v2 — same split as plan §8.6 stitching).

### 8.8 Failure handling

Same as v3:
- Continuation Kling clip fails → retry once, fallback to single-tier with notice.
- Last-frame extraction fails → same fallback.
- Stitching fails → retry once, set `_stitchedVideoMissing = true`, sequential fallback.
- Gemini split-prompt fails → deterministic fallback split.

## 9. Style system

### 9.1 Layer 1 — Flow style (constants per `videoType`)

Same as v3 §9.1.

### 9.2 Layer 2 — Sub-style (mode-aware preset library)

Same library structure as v3 §9.2. `SUB_STYLE_PRESETS` keyed by mode (film/brand/copilot/autopilot).

### 9.3 Visual treatment (orthogonal axis)

Same as v3 §9.3. 11 treatments: photorealistic / watercolor / oil-painting / anime / comic / pixel-art / 3d-render / sketch / ukiyo-e / stained-glass / illustrated.

### 9.4 Layer 3 — Per-scene override

Same as v3 §9.4.

### 9.5 Style injection points

Six points reading `getMergedStyle(scene) = scene.styleOverride || project.subStyle` and `project.visualTreatment`.

## 10. Wizard / style-gate UX

### 10.1 Quick mode — three-step wizard
### 10.2 Brand and Film — inline picker after `_showNarratorChoice` at [js/26-brainstorm.js:520](js/26-brainstorm.js#L520)
### 10.3 Shared style picker component with self-validation
### 10.4 Locked frame — no mid-session change
### 10.5 Chat AI receives locked frame
### 10.6 Brand/Film flow integration detail

(Same as v3 §10.)

## 11. Style gate for text + audio input

Same as v3 §11.

## 12. Storyboard agent rewrite

### 12.1 `castEnforceCutOnSpeaker` migration (fix H1, O1, F-01)

Currently at [js/17b-create-references.js:2953-2989](js/17b-create-references.js#L2953-L2989). Called from two pipeline sites at [js/17c-create-pipeline.js:1287-1288, 1372-1373](js/17c-create-pipeline.js#L1287). Both must be migrated consistently.

**F-01 problem:** The original v4 Phase 3 rewrite still keyed on `dlg.additionalTurns`, but Phase 3 also rewrites `castBuildDialogueAndFramingHint` to instruct the agent to emit `dialogueLines[]` instead of the legacy `dialogue + additionalTurns` schema. After Phase 3 ships, `additionalTurns` no longer exists in agent output → the split path is dead → multi-speaker scenes leak through to unmigrated readers.

**Resolution chosen:** option (b) from the audit — rewrite `castEnforceCutOnSpeaker` to read `seg.dialogueLines[]` directly. The function still produces single-speaker scenes during the Phase 3 migration window (preserving the v1 invariant), but it counts and splits using the new schema.

**Phase 3 behavior (during migration window — splits whenever `dialogueLines.length > 1`):**

```js
window.castEnforceCutOnSpeaker = function (segments) {
  if (!Array.isArray(segments)) return segments;
  const out = [];
  for (const seg of segments) {
    // Read from new schema (dialogueLines[]) only. Legacy `additionalTurns`
    // path is removed because Phase 3 agent rewrite no longer produces it.
    const lines = (seg && Array.isArray(seg.dialogueLines)) ? seg.dialogueLines : [];

    // Single-line or zero-line scenes pass through unchanged
    if (lines.length <= 1) {
      out.push(seg);
      continue;
    }

    // Phase 3 unconditional-split safety: every multi-line scene becomes
    // N single-line scenes, regardless of framing or visibility. This
    // preserves the v1 invariant of "one dialogue per scene" through the
    // Phase 2b reader migration window. Phase 3.5 lifts this to the
    // narrowed "≤1 visible-lipsynced speaker" rule (see §12.5).
    const start = (typeof seg.startTime === 'number') ? seg.startTime : 0;
    const end   = (typeof seg.endTime   === 'number') ? seg.endTime   : (start + 1);
    const span  = Math.max(0.001, end - start);
    const per   = span / lines.length;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cloned = Object.assign({}, seg, {
        startTime: start + per * i,
        endTime:   start + per * (i + 1),
        dialogueLines: [Object.assign({}, line)],   // single-line array — preserves isVoiceOver
        framing: 'frontal-close-up',
        _cutFromSpeakerSplit: true,
      });
      out.push(cloned);
    }
  }
  return out;
};
```

The Phase 3 function:
- Reads `seg.dialogueLines[]` (new schema, post-`castBuildDialogueAndFramingHint` rewrite).
- Splits whenever `lines.length > 1`, regardless of framing/visibility.
- Preserves each line's `isVoiceOver` (fix H1 — no hardcoded `false`).
- Preserves each line's `speakerName` via `Object.assign({}, line)` (audit fix O1 — `speakerName` is included in the agent's `dialogueLines` schema per §12.3).
- Sets framing to `frontal-close-up` per the legacy single-speaker convention.
- Tags `_cutFromSpeakerSplit: true` for telemetry / debugging.

**Phase 3.5 narrowed rewrite** (lifts split for safe multi-line cases): see §12.5 for the implementation code.

**Critical phase coupling:** Phase 3 must land `castBuildDialogueAndFramingHint` rewrite (F-02), the agent JSON consumer at [js/17c-create-pipeline.js:1274](js/17c-create-pipeline.js#L1274) (F-08), and this `castEnforceCutOnSpeaker` rewrite **in the same atomic change**. Splitting them across phases breaks the migration window guarantee — see F-01 in the audit.

### 12.2 Removed forced-close-up rule

Same as v3 §12.

### 12.3 New schema and instructions for the agent

Same as v3 §12.2 — agent emits `durationSec`, `visualSubjectIds`, `framing` (free), `motionPrompt`, `dialogueLines[]` with per-line `isVoiceOver`.

### 12.4 `castApplyFramingDerived` migration (fix H2, O3, F-07)

Currently at [js/17b-create-references.js:3503-3528](js/17b-create-references.js#L3503-L3528). Reads `seg.dialogue` (singular), writes scene-level `seg.speakerVisible`, overrides `seg.dialogue.isVoiceOver = true` when not visible.

**Call sites:** the function is invoked at two pipeline locations — both must migrate consistently:
- [js/17c-create-pipeline.js:1291](js/17c-create-pipeline.js#L1291) (in main pipeline path, immediately after `castEnforceCutOnSpeaker` call at line 1288)
- [js/17c-create-pipeline.js:1376](js/17c-create-pipeline.js#L1376) (in alternate pipeline path, after `castEnforceCutOnSpeaker` at line 1373)

**Phase 3.5 rewrite:**

```js
window.castApplyFramingDerived = function (segments) {
  if (!Array.isArray(segments)) return segments;
  for (const seg of segments) {
    if (!seg) continue;
    const visible = window.castDeriveSpeakerVisible(seg.framing);
    // v4 fix H2 + O3: per-line isVoiceOver derivation; deprecate scene-level speakerVisible
    if (Array.isArray(seg.dialogueLines)) {
      for (const line of seg.dialogueLines) {
        // Speaker on-screen AND mouth resolvable in framing → lip sync runs
        const speakerInScene = (seg.visualSubjectIds || []).includes(line.speakerCharacterId);
        line.isVoiceOver = !(speakerInScene && visible);
      }
    } else if (seg.dialogue) {
      // Legacy single-dialogue path (retained for backward-compat through Phase 3.5)
      seg.speakerVisible = visible;
      if (!visible) seg.dialogue.isVoiceOver = true;
    }
    // Resolve speakerCharacterId from speakerName (preserved from current code)
    const lines = seg.dialogueLines || (seg.dialogue ? [seg.dialogue] : []);
    for (const line of lines) {
      if (line.speakerName && !line.speakerCharacterId) {
        line.speakerCharacterId = resolveSpeakerCharacterId(line.speakerName);
      }
    }
  }
  return segments;
};
```

The scene-level `speakerVisible` field is **deprecated** in Phase 3.5; replaced by per-line `isVoiceOver`. Phase 12 cleanup removes it.

### 12.5 Phase 3.5 narrowed scope (fix Audit-1 #2, F-16)

`castEnforceCutOnSpeaker`'s post-3.5 behavior — **implementation** (added in F-16 fix):

```js
window.castEnforceCutOnSpeaker = function (segments) {
  if (!Array.isArray(segments)) return segments;
  const out = [];
  for (const seg of segments) {
    const lines = (seg && Array.isArray(seg.dialogueLines)) ? seg.dialogueLines : [];

    // Single-line or zero-line scenes pass through unchanged
    if (lines.length <= 1) {
      out.push(seg);
      continue;
    }

    // Phase 3.5 narrowed rule: count distinct visibly-lipsynced speakers.
    // A speaker counts as "visibly lipsynced" when:
    //   - line.isVoiceOver === false (their audio drives mouth motion), AND
    //   - their speakerCharacterId is in seg.visualSubjectIds (they're on-screen), AND
    //   - the scene's framing exposes the mouth (per castDeriveSpeakerVisible)
    const framingShowsMouth = window.castDeriveSpeakerVisible
      ? window.castDeriveSpeakerVisible(seg.framing)
      : false;
    const visualSubjects = Array.isArray(seg.visualSubjectIds) ? seg.visualSubjectIds : [];

    const visibleLipsyncedSpeakers = new Set();
    for (const line of lines) {
      if (!line || line.isVoiceOver) continue;
      if (!line.speakerCharacterId) continue;
      if (!framingShowsMouth) continue;
      if (!visualSubjects.includes(line.speakerCharacterId)) continue;
      visibleLipsyncedSpeakers.add(line.speakerCharacterId);
    }

    if (visibleLipsyncedSpeakers.size <= 1) {
      // Multi-line scene is safe: ≤1 speaker drives lip sync. Preserve as-is.
      // Cases covered: all-VO scenes; one visible speaker + VO from others;
      // single-speaker multi-line; multiple speakers with at most one visible.
      out.push(seg);
      continue;
    }

    // > 1 visible-lipsynced speakers → forced split (multi-character lip sync
    // unsupported in v1; deferred to v1.5 per §13.2)
    const start = (typeof seg.startTime === 'number') ? seg.startTime : 0;
    const end   = (typeof seg.endTime   === 'number') ? seg.endTime   : (start + 1);
    const span  = Math.max(0.001, end - start);
    const per   = span / lines.length;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Each split scene's visualSubjectIds shrinks to just the speaker for this line
      // (if they were on-screen). This way the per-scene visibility derivation is
      // consistent with the split.
      const splitVisualSubjects = visualSubjects.includes(line.speakerCharacterId)
        ? [line.speakerCharacterId]
        : visualSubjects.slice();
      const cloned = Object.assign({}, seg, {
        startTime: start + per * i,
        endTime:   start + per * (i + 1),
        dialogueLines: [Object.assign({}, line)],
        visualSubjectIds: splitVisualSubjects,
        framing: 'frontal-close-up',
        _cutFromSpeakerSplit: true,
      });
      out.push(cloned);
    }
  }
  return out;
};
```

The narrowed rule preserves multi-line scenes when:

- All lines are voice-over (one or many speakers, none visible) ✓
- One visible speaker + multiple voice-over lines from others ✓
- Single visible speaker speaking multiple lines ✓
- Multiple speakers but only one visible (others off-screen) ✓

And forces split when:

- Two-shot framing with both faces lip-syncing simultaneously ✗
- Three speakers all visible in frame, each speaking ✗

Two-shot framings (`two-shot-medium`, `two-shot-wide`) remain valid in the framing enum. The cut-on-speaker post-processor allows them only when the multi-speaker constraint above is satisfied.

v1.5 adds true multi-character lip sync as a separate plan; lifts the count > 1 restriction.

### 12.5a `visualSubjectIds` back-computation for legacy scenes (added in F-16 fix)

`scene.visualSubjectIds` is a new field introduced by the Phase 3 agent prompt rewrite. Scenes loaded from pre-v4 saved projects have `visualSubjectIds === undefined`. Without back-computation, the §12.5 visibility check fails silently — the `Array.isArray` guard returns `false`, `visibleLipsyncedSpeakers` stays empty, and ALL multi-line scenes are preserved (which would be wrong for legacy scenes that came from `additionalTurns` and were forced-close-up).

**Back-compute on project restore** ([js/15-project.js:1015-1029](js/15-project.js#L1015-L1029) — Phase 2a save/restore migration):

```js
function backfillVisualSubjectIds(scene) {
  if (Array.isArray(scene.visualSubjectIds)) return;   // already set
  // Legacy scenes had a single dialogue object with one speaker.
  // The Phase 2a shim resolves scene.dialogue → dialogueLines[0].
  // Default visualSubjectIds to [the single speaker's characterId] when present,
  // else empty array. This preserves "single speaker, on-screen" semantics for
  // legacy close-up scenes (the dominant case, since v3 forced close-ups).
  // Audit fix H4: also attempt speakerName → speakerCharacterId resolution
  // for legacy scenes where castApplyFramingDerived hasn't run yet.
  const firstLine = (scene.dialogueLines && scene.dialogueLines[0]) || null;
  if (firstLine && firstLine.speakerCharacterId && firstLine.speakerCharacterId !== 'narrator') {
    scene.visualSubjectIds = [firstLine.speakerCharacterId];
  } else if (firstLine && firstLine.speakerName && firstLine.speakerName.toLowerCase() !== 'narrator') {
    // Attempt resolution from speakerName — same chain as castApplyFramingDerived
    const resolved = (typeof window.castApplyFramingDerived === 'function')
      ? resolveSpeakerFromName(firstLine.speakerName)
      : null;
    scene.visualSubjectIds = resolved ? [resolved] : [];
  } else {
    scene.visualSubjectIds = [];
  }
}

// Reuse the same name-resolution chain as castApplyFramingDerived (js/17b:3513-3524)
function resolveSpeakerFromName(speakerName) {
  const cs = window.createJobState || {};
  const all = [
    ...(cs.characters || []),
    cs.presenter, cs.setting,
  ].filter(Boolean);
  const found = all.find(x => x.locked && (x.name || '').toLowerCase() === speakerName.toLowerCase());
  return found ? found.id : null;
}
```

Called once per scene during project restore, before the dialogue/duration shims attach. After back-computation, the scene's visibility check works correctly:

- Legacy single-speaker close-up scene → `visualSubjectIds = [<speaker>]`, framing shows mouth → speaker is on-screen → works as today.
- Legacy narrator-only scene → `visualSubjectIds = []` → no visible speakers → works as today (was always voice-over).
- Legacy multi-speaker scene split via `additionalTurns` (already split by old `castEnforceCutOnSpeaker` to single-line scenes) → each split scene has one speaker; back-compute defaults to `[that speaker]`.

For new projects (Phase 3+), `visualSubjectIds` is set by the agent and never absent.

### 12.6 Validator stage

(Same as v3 §12.3.)

### 12.7 New framings

(Same as v3 §12.5.)

## 13. Lip sync routing per line

### 13.1 Router

Per-line gating on `isVoiceOver`. For multi-speaker visible scenes, those scenes are forced-split by §12.5 before lip-sync routing runs, so the router only sees single-speaker visible scenes (or VO-only scenes).

### 13.2 v1 scope: single-speaker visible scenes only

Same as v3 §13.2 + the §12.5 narrowing. Multi-character lip sync = v1.5.

### 13.3 Tier 2 gating

Tier 2 multi-segment scenes deferred to v1.5 when R2/CF infra ships. Single-segment scenes use Tier 2.

### 13.4 `narrationMode` lazy computation (fix M3)

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
  if (!hasOnScreen && !hasVoiceOver) return 'voice-over';
  if (!hasOnScreen)                  return 'voice-over';
  if (!hasVoiceOver)                 return 'dialogue';
  return 'mixed';
}
```

**Explicit triggers** (fix M3):

1. **After storyboard agent commits all scenes** — set `narrationMode = computeNarrationMode(scenes)` after the storyboard step writes its final scenes array. Until then, `narrationMode = 'pending'`.
2. **On any Class B/C edit** that flips `isVoiceOver` for any line OR changes `visualSubjectIds` — recompute and cache.
3. **On project load** (back-computation per §16.3) — compute if `narrationMode == null`.

Lip-sync stage entry **requires** `narrationMode !== null && narrationMode !== 'pending'`. If it fires while `narrationMode === 'pending'`, it logs an error and waits.

## 14. Per-image-card UI

Same as v3 §14.

## 15. Edit cascades

Same as v3 §15.

## 16. Voice-over project shortcut

### 16.1 Detection

Lazy per §13.4.

### 16.2 Shortcuts when `'voice-over'`

Same as v3 §16.2.

### 16.3 Back-computation for saved projects

```js
function backfillNarrationMode(state) {
  if (state.narrationMode != null) return;
  const scenes = state.scenes || [];
  state.narrationMode = computeNarrationMode(scenes);
}
```

Called at end of project restore.

## 17. Cleanup / removals

### 17.1 Phase 12 code paths removed

- Symmetric 3% drift gate in `canGenerateVideos()` ([js/33-audio-rehearsal.js:687](js/33-audio-rehearsal.js#L687)). **Audit fix M2:** replaced by per-scene tier-fit check: every scene must have `segmentPlanPass === 'actual'` AND every scene must have `audioActualDuration > 0` OR `dialogueLines.length === 0` (B-roll). The "Generate Videos" button at [js/33-audio-rehearsal.js:836](js/33-audio-rehearsal.js#L836) gates on this check instead of the old `canGenerateVideos()`.
- `computeDurationStatus` truth table.
- `audioRehearsal.audioStale` flag.
- soundtouch-js + `timeStretchAudioBuffer`.
- `degraded-mode-banner`.
- `buildClipPlan` and `_animateSingleScene` continuation loop ([js/21-kling.js:175-235](js/21-kling.js#L175-L235)).
- `generateContinuationPrompt` ([js/21-kling.js:137](js/21-kling.js#L137)) — replaced by Gemini split-prompt.
- Audio rehearsal lock — **entire `_lockAndGenerateVideos` function rewrite** (audit fix H3). The function currently: (1) iterates scenes to compute `audioActualDuration`, (2) sets `s.duration = s.audioActualDuration` at [line 1136](js/33-audio-rehearsal.js#L1136), (3) runs `computeDurationStatus` and `canGenerateVideos` gate, (4) fires video generation. Phase 12 rewrites to: (1) iterate scenes to compute `audioActualDuration`, (2) set `s.durationSec = s.audioActualDuration` (shim mirrors to `_legacyDuration`), (3) run pass-2 `planSegments` for each scene with actual audio, updating `generatedDurationSec`, `croppedTailSec`, `segmentPlan` on each scene, (4) compute per-scene tier-fit check replacing `canGenerateVideos` (see M2), (5) fire video generation.
- Scene-level `speakerVisible` field — deprecated in Phase 3.5, removed in Phase 12.

### 17.2 Schema fields removed (after Phase 12 cleanup)

- `scene.dialogue` (singular) — shimmed → removed.
- `scene.duration` — shimmed → removed.
- `scene.durationStatus`, `durationDriftPct`, `audioStale`.
- `scene.speakerVisible` (replaced by per-line `isVoiceOver`).
- `dialogue.additionalTurns` — only consumer was `castEnforceCutOnSpeaker`; removed when Phase 3.5 replaces it (fix O2).

### 17.3 `STYLE_PRESETS` migration (fix H4)

The 20-entry global at [js/17a-create-api.js:49](js/17a-create-api.js#L49) is **kept as-is**. Verified consumers:

| File | Lines | Path | v4 action |
|---|---|---|---|
| `js/17a-create-api.js` | 49 (definition), 164, 224, 226 | Template handling shared between Copilot + Reels | **Keep.** Not removed. |
| `js/17c-create-pipeline.js` | 11, 12 | Copilot style preset application | **Bypass.** Copilot reads `createJobState.subStyle` directly post-Phase 4. The old lookup remains as fallback for legacy projects. |
| `js/20-reels-creator.js` | 290, 292, 1344, 3104, 3361, 4246, 5487 | Reels style dropdown + style application | **Keep.** Reels continues using the global until its own style migration. |

Phase 12 cleanup removes only the Copilot reading paths at `17c-create-pipeline.js:11-12` (replaced by `subStyle` reads). The `STYLE_PRESETS` global itself stays. The 20-entry → mode-aware-preset auto-mapping for legacy Copilot projects:

| Old preset | Auto-maps to |
|---|---|
| `cinematic`, `noir`, `gothic`, `vintage`, `surrealism` | film sub-style + photorealistic treatment |
| `flat-design`, `minimalist`, `pop-art`, `pastel`, `corporate` | brand sub-style |
| `watercolor`, `oil-painting`, `anime`, `comic`, `pixel-art`, `3d-render`, `sketch`, `digital-art`, `ukiyo-e`, `stained-glass`, `photorealistic` | visual treatment override (preserve any sub-style; override aesthetic only) |

User reviews on first edit.

## 18. Edge cases

| # | Case | Behavior |
|---|---|---|
| 1 | Audio exactly 5.0s | One 5s segment. |
| 2 | Audio 5.1s–7.0s (below split threshold) | Single 10s tier. No split. Action stretched. |
| 3 | Audio 7.5s–9.5s | Split [5,5]. Stitched. **Behavioral change** vs current (which gives [10]). |
| 4 | Audio 10.1s | Forced continuation [10,5]. |
| 5 | Audio > 25s | Recursive continuation chain. |
| 6 | Reaction shot — speaker off-screen | `isVoiceOver: true` derived; no lip sync. |
| 7 | Two-shot, both speakers visible, alternating dialogue | **v1: forced split** by §12.5 (count of visible-lipsynced > 1). v1.5: preserve as multi-line two-shot. |
| 8 | Wide-establishing with dialogue | `isVoiceOver: true` derived (mouth not resolvable). |
| 9 | Long monologue > 15s | Forced continuation. |
| 10 | TTS estimate wrong (pass 1: 5s tier, actual: 5.4s) | Pass 2 promotes to 10s. Class B cascade. |
| 11 | User adds a third line to a multi-line scene | **v1:** forced split if it makes >1 visible lipsynced. **v1.5:** allowed in two-shot. |
| 12 | User changes line speaker on-screen → off-screen | `isVoiceOver` flips; lip sync teardown. Cheap. |
| 13 | User changes `visualSubjectIds` from `[maya]` to `[maya, joe]` | Class B. Image regen. All lines recompute `isVoiceOver`. **v1: scene auto-splits if multi-line + 2 visible lipsynced.** |
| 14 | User splits scene mid-line | Forbidden. Splits land on line boundaries only. |
| 15 | Audio input Mode A | Project-level timings normalized scene-local in §8.4 finalization. |
| 16 | Audio input Mode B | Mode B's `audioSegmentStartMs/EndMs = null`; populated from multi-voice TTS metadata. |
| 17 | Voice-over narrator scene | All lines `isVoiceOver: true`. No lip sync. |
| 18 | B-roll with no audio | Tier is agent's choice. |
| 19 | Three+ speakers in rapid exchange | Forbidden in one scene (validator). Always splits. |
| 20 | Continuation clip fails | Retry once. Fallback to single-tier. |
| 21 | Last-frame extraction fails | Same fallback. |
| 22 | Stitching fails | Retry once; sets `_stitchedVideoMissing = true`; sequential clip playback. |
| 23 | Gemini split-prompt fails | Deterministic fallback split. |
| 24 | Cost estimate jumps mid-edit | Pre-commit cost preview always shown. |
| 25 | User restarts brainstorm session mid-flow | Session discarded. |
| 26 | Saved session restore (pre-feature) | Style migration prompt; `narrationMode` back-computed; both shims active. |
| 27 | Brainstorm finalise → Copilot → user wants different style | Class B path. |
| 28 | Style picker enforced (no skip) | All gates require pick. |
| 29 | User picks "Custom" with no description | Picker validates: ≥10 chars in description. |
| 30 | Two-shot with Tier 2 requested | Scene auto-split before Tier 2 applies (§12.5); each split scene single-speaker. |
| 31 | Per-scene `styleOverride` clashes with project | Allowed. |
| 32 | Mood per line contradicts project style | Allowed. |
| 33 | Provider doesn't support continuation | Hard cuts; continuity-importance `low` only; warn for higher. |
| 34 | Provider's only tier is 5s | Long scenes chain many 5s segments. |
| 35 | Provider supports variable durations | `durationTiers` is a continuous range. |
| 36 | Tier 2 multi-segment requested but R2 not yet shipped | v1: fallback to Tier 1. v1.5: lift. |
| 37 | Reels project loaded with `STYLE_PRESETS` value | Reels keeps using the global; out of scope. |
| 38 | Multi-line scene reaches an unmigrated reader | Shim's `console.warn` fires; counter increments; surfaces in telemetry as P1 incident. |
| 39 | Pass-2 timing-finalization can't find TTS metadata | Uniform-distribution fallback; warning logged; counter increments. |
| 40 | Stitched video missing on restore | `_stitchedVideoMissing = true`; preview falls back to sequential clip playback. |
| 41 | Project has both `_legacyDuration` and `durationSec` | Setter syncs both; getter prefers `durationSec`. |

## 19. Phases / order of work

| # | Phase | Depends on | Risk | Notes |
|---|---|---|---|---|
| **1** | Provider abstraction (interface only) | none | low | Wrap Kling submit/poll. No tier-selection in config. |
| **2a** | Schema + dual shims + writer migration + style stubs | 1 | **high** | All new fields. Both shims with telemetry. `subStyle`/`visualTreatment` field stubs on `createJobState` so Phase 3 reads them (fix C5). Migrate writers: `castEnforceCutOnSpeaker` (preserve `isVoiceOver`, fix H1), storyboard agent JSON consumer, autosave/restore (with stitched persistence, fix Audit-1 #4), `processOriginalAudio` timing-norm scaffold, `processReTTS` shim. Integration tests for every reader site. |
| **3** | Storyboard agent prompt rewrite + cut-on-speaker constraint | 2a | medium | Free framing, `isVoiceOver` derivation, two-shot framings, validator. **`castEnforceCutOnSpeaker` keeps unconditional split** — single-speaker scenes only through migration window. |
| **2b** | Reader migration | 3 | medium | All 72 dialogue + 48 duration + videoClips reader sites (re-counted F-05/F-06). Both shims still in place. |
| **3.5** | Lift cut-on-speaker (narrowly) + `castApplyFramingDerived` migration | 2b | medium | §12.5 rule: multi-line allowed only when ≤1 visible-lipsynced speaker. `castApplyFramingDerived` rewritten for `dialogueLines[]` (fix H2). `speakerVisible` deprecated. |
| **4** | Style system + preset library | 2a (NOT 3) | medium | `SUB_STYLE_PRESETS` library; `VISUAL_TREATMENTS`; merged-style helper; six injection points. Stubs from Phase 2a are populated. Curated sample images = parallel asset work. |
| **5** | Brainstorm wizard step 3 (Quick mode) | 4 | low | Style picker in Quick wizard. |
| **6** | Brand/Film inline style picker | 4, 5 | low | Inline picker after `_showNarratorChoice` at [js/26-brainstorm.js:520](js/26-brainstorm.js#L520). |
| **7** | Style gate for text + audio input | 4 | low | Same picker; gate insertion. |
| **8** | Segment planner + Gemini split-prompt + timing finalization + stitching contract | 1, 2a | high | `planSegments` two-pass; timing-finalization sub-step (§8.4); split-prompt call (gemini-2.5-flash); stitching with `videoClipsData[]` + `stitchedVideoData` persistence; `_stitchedVideoMissing` fallback; deletion of `generateContinuationPrompt` and `_animateSingleScene` continuation loop. |
| **9** | Per-image-card N-rows audio | 2b | medium | Multi-line UI; per-line controls. |
| **10** | Lip-sync routing per line (single-speaker only) | 8 (sequential) | medium | Router; lazy `narrationMode` computation; back-compute on load; voice-over shortcut. |
| **11** | Edit cascades UI | 9, 10 | medium | Class A/B/C edit surfaces. |
| **12** | Cleanup | 11 | low | Remove drift detection, soundtouch-js, `buildClipPlan`, `generateContinuationPrompt`, both shims, deprecated fields, audio rehearsal lock duration write (fix O4). Copilot's `STYLE_PRESETS` reading paths bypassed via `subStyle`. **`STYLE_PRESETS` global itself stays.** |

**Sequential dependencies:**
- 1 → 2a → 3 → 2b → 3.5 (migration spine)
- 1 → 8 → 10 (segment planner before lip-sync)
- 4 ← 2a (NOT 3 — fix C5)
- 4 ← {5, 6, 7}
- 11 ← {9, 10}

**Calendar estimate (revised after F-05/F-06 re-count):** 8–10 weeks single engineer; 5–6 weeks two engineers. Phase 2a is ~2–3 weeks alone given 72 dialogue + 48 duration reader sites + writer migration. Original v4 estimate of 6–8 weeks was based on undercounted 51 + 23+; ~2× the actual scope means ~1.3× the calendar.

## 20. Theming considerations

Same as v3 §20.

## 21. Telemetry

Same as v3 §21, plus:

```js
window._cinematicShimWarnings = {
  dialogue:             0,    // multi-line scene access through shim
  durationFallthrough:  0,    // duration shim fell through to default
  timingFallback:       0,    // uniform-distribution fallback
};
```

Per-project telemetry rolls up these counters. Non-zero `dialogue` post-Phase-3.5 = P1 incident (unmigrated reader leaked).

---

## 22. Post-write verification log

Every concrete code claim in this document was verified during writing AND re-checked here against the live codebase. Format: `<claim> → <verification>`.

### Field locations
- ✅ `audioActualDuration` lives on scene, not dialogue → grep confirms 22 sites total all on scene (20 in [js/33-audio-rehearsal.js](js/33-audio-rehearsal.js) — including lines 181, 225, 411, 437, 530, 657, 671, 675; 2 in [js/17b-create-references.js](js/17b-create-references.js)); 0 sites on dialogue.
- ⚠️ Original v4 claim of "23+ sites across 9 files" was an undercount. Re-grep in audit fix F-06: 48 unique source lines across 9 files (45 readers, 3 writers). Per-file breakdown in §6.2 table.
- ⚠️ Original v4 claim of "51 sites total" was wrong. Re-grep in audit fix F-05: 72 unique source lines across 4 files (excluding 26-brainstorm.js's `sc.dialogue` brainstorm-script accesses, which are a different shape). Per-file breakdown in §6.2 table.
- ✅ `STYLE_PRESETS` has 20 entries → enumerated by reading [js/17a-create-api.js:49-69](js/17a-create-api.js#L49-L69).

### Function bodies
- ✅ `castEnforceCutOnSpeaker` hardcodes `isVoiceOver: false` at [js/17b-create-references.js:2979](js/17b-create-references.js#L2979) → read function body 2953-2989.
- ✅ `castEnforceCutOnSpeaker` reads `seg.dialogue.additionalTurns` (singular dialogue) → confirmed.
- ✅ `castApplyFramingDerived` reads `seg.dialogue` (singular) at [js/17b-create-references.js:3503-3528](js/17b-create-references.js#L3503-L3528) → read function body.
- ✅ `castApplyFramingDerived` writes `seg.speakerVisible` (scene-level) and overrides `seg.dialogue.isVoiceOver` → confirmed at lines 3508-3510.
- ✅ `processOriginalAudio` produces line-level (not word-level) timings → read function body at [js/32-audio-input.js:961-997](js/32-audio-input.js#L961-L997). Line 970-980: line is created with first word's `start`. Line 991-992: `audioSegmentEndMs` is extended on each subsequent same-speaker word. So per-line timing IS produced. Audit M2 was wrong; v4 retracts it.
- ✅ `processReTTS` returns `dialogueLines` with `audioSegmentStartMs/EndMs = null` at [js/32-audio-input.js:1140-1141](js/32-audio-input.js#L1140-L1141) (return statement starts at line 1132) → read return statement.
- ✅ `castGenerateMultiVoiceAudio` writes `seg.dialogue.actualStartMs/EndMs` at [js/17b-create-references.js:3484](js/17b-create-references.js#L3484) → grep confirms.
- ✅ `generateContinuationPrompt` uses `gemini-2.0-flash` at [js/21-kling.js:150](js/21-kling.js#L150) → read function body 136-160.
- ✅ `_animateSingleScene` initializes `scene.videoClips = []` at [js/21-kling.js:202](js/21-kling.js#L202) → read code.

### Call sites
- ✅ `castEnforceCutOnSpeaker` is called from two pipeline sites at [js/17c-create-pipeline.js:1287, 1372](js/17c-create-pipeline.js#L1287) → grep confirmed.
- ✅ Brand/Film hero card entry routes via `_confirmMode` at [js/26-brainstorm.js:502](js/26-brainstorm.js#L502) → `_showNarratorChoice` at [line 520](js/26-brainstorm.js#L520) → confirmed by reading 502-545.
- ✅ Audio rehearsal lock writes `s.duration = s.audioActualDuration` at [js/33-audio-rehearsal.js:1136](js/33-audio-rehearsal.js#L1136) → grep confirmed.
- ✅ UI duration stepper writes `scene.duration` at [js/29-canvas-render.js:3115-3116](js/29-canvas-render.js#L3115) → grep confirmed.
- ✅ Manual duration edit writes `scene.duration` at [js/33-audio-rehearsal.js:531](js/33-audio-rehearsal.js#L531) → grep confirmed.

### Persistence
- ✅ `videoClips` written at 7 sites: [js/15-project.js:1019, 1029](js/15-project.js#L1019), [js/21-kling.js:202](js/21-kling.js#L202), [js/20-reels-creator.js:3293](js/20-reels-creator.js#L3293), [js/27-canvas-state.js:149, 167, 170](js/27-canvas-state.js#L149) → grep confirmed.
- ✅ `videoClipsData` (save format) at [js/15-project.js:527-537, 1017-1029](js/15-project.js#L527) → grep confirmed.

### STYLE_PRESETS consumers
- ✅ `STYLE_PRESETS` consumed in 13 sites across 3 files: [js/17a-create-api.js:49, 164, 224, 226](js/17a-create-api.js#L49); [js/17c-create-pipeline.js:11, 12](js/17c-create-pipeline.js#L11); [js/20-reels-creator.js:290, 292, 1344, 3104, 3361, 4246, 5487](js/20-reels-creator.js#L290) → grep confirmed (re-verified in audit fix F-14).

### What I did NOT verify but stated
- ⚠️ Telemetry counter aggregation paths — claimed `window._cinematicShimWarnings` would propagate to per-project telemetry. Implementation detail not yet present in code; requires Phase 2a to add the bookkeeping infrastructure.
- ⚠️ Sample image asset pipeline — described but not implemented. External asset work.
- ⚠️ R2/CF infra availability for stitched persistence — flagged as gated on voice-and-lipsync-plan Phase 9 (deferred).
- ⚠️ `gemini-2.5-flash` cost (~$0.001 per scene) — order-of-magnitude estimate, not pricing-verified.
- ⚠️ The 7.0s split-threshold value — picked as a starting tunable, requires telemetry-driven adjustment.

### Discrepancies caught and corrected during writing
- Initially wrote `legacyDialogue.audioActualDuration` mirroring v3's bug — caught when grep confirmed audioActualDuration is on scene only. Fixed in §6.4.
- Initially planned to use `gemini-2.5-flash` without checking what existing call uses — caught when reading [js/21-kling.js:150](js/21-kling.js#L150), confirmed it uses `gemini-2.0-flash`. Decided to upgrade to 2.5 in v4 (consistent with other Stori Gemini calls per inferSettingAndActionsFromDialogue and tone detection in 32-audio-input.js).
- v3 claimed audio-input M2 was a bug; verification of [js/32-audio-input.js:961-997](js/32-audio-input.js#L961-L997) showed line-level timings ARE produced. Audit M2 retracted.

---

End of v4 plan.
