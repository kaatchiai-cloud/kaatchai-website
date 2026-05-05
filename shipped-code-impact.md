# Shipped Code Impact — What Changes When the New Plans Are Implemented

Status: reference document. Maps every plan-triggered change to specific shipped code (file + line + function), with risk + ordering.

Audience: implementer about to start coding any of `audio-rehearsal-plan`, `audio-input-plan`, or `input-formats-plan`. Read this BEFORE picking up a phase.

---

## Why this document exists

The new plans (audio-rehearsal-plan, audio-input-plan, input-formats-plan) describe new features and reference shipped voice + lip sync code in scattered places. A fresh implementer would have to cross-reference all four plans + read shipped code to figure out what to actually change.

This doc consolidates the impact in one place. Updated whenever a plan changes its implementation surface.

---

## Summary table

| Shipped function | File | Line | Triggering plan | Change type | Risk |
|---|---|---:|---|---|---|
| `castGenerateMultiVoiceAudio` | js/17b-create-references.js | 3115 | audio-rehearsal-plan §8.7 + §12 Phase 2 | **Refactor** (per-line → per-character batched + 3-tier cut-beat + Tier 1/2/3 splitter) | **High** — load-bearing existing code |
| `alignWordsWithScribe` | js/17a-create-api.js | 311 | audio-input-plan §11 Phase 2 | **One-line flag flip** (`diarize: 'false'` → `'true'` when audio-input mode active) | Low — single condition |
| `castGenerateLineTTS` | js/17b-create-references.js | 3069 | audio-rehearsal-plan §8.7 (preservation lock) | **Unchanged** (deliberately preserved for single-line regen path) | None — verify no accidental edits |
| `castDetectFromScript` (existing) | js/17b-create-references.js | (pre-shipped) | audio-input-plan §7 + input-formats-plan §11 | **Extension** (gain max-5 cap + AI-suggested-extras flow + voice picker for accepted extras; cross-format consistency) | Medium — touches established cast lock flow |
| `castBuildDialogueAndFramingHint` | js/17b-create-references.js | 2906 | input-formats-plan §11 Phase 7 | **Reduction** (storyboard agent stops inferring speakers from prose; receives pre-resolved structure from new parser layer instead) | Medium — tracks what storyboard agent currently does inline |
| `castEnforceCutOnSpeaker` | js/17b-create-references.js | 2946 | input-formats-plan §11 Phase 7 | **Likely unchanged** (still post-processes parsed segments per cut-on-speaker rule; verify after parser layer integration) | Low — verify only |
| `castApplyFramingDerived` | js/17b-create-references.js | 3224 | input-formats-plan §11 Phase 7 | **Likely unchanged** (still derives speakerVisible from framing; verify after parser layer) | Low — verify only |
| `castResolveVoiceForSpeaker` | js/17b-create-references.js | 3038 | (none) | **Unchanged** | None |

---

## Per-plan impact

### audio-rehearsal-plan implementation impact

**Single material refactor + several extensions.**

#### Refactor: `castGenerateMultiVoiceAudio` ([js/17b:3115](js/17b-create-references.js#L3115))

This is the load-bearing change. Existing implementation (per-line serial) must become per-character batched.

| Aspect | Before (shipped) | After (per audio-rehearsal-plan §8.7) |
|---|---|---|
| Iteration | One `castGenerateLineTTS` call per dialogue segment | One TTS call per `(speakerId, mood)` group via `planTtsCalls()` (audio-rehearsal §8.7) |
| Cut-beat between segments | Binary at line 3146: `200ms different-speaker, 0ms same-speaker` | Three-tier: `200ms speaker-change / 100ms same-speaker tone-change / 0ms in-batch` (assembled at master-buffer reassembly time) |
| Output of each call | Single-line `AudioBuffer` (sample-accurate by construction) | Multi-line combined `AudioBuffer`; requires Tier 1/2/3 splitter (audio-rehearsal §8.7a) |
| Boundary precision | Uniform sample-accurate | Variable per audio-rehearsal §8.7b — Tier 1: sample-accurate; Tier 3: ±200ms |
| `cutBeatBeforeMs` field on segment audio entries | Set per-segment (current line 3146) | Computed at master-buffer reassembly time, not per segment |

**Regression risk:** medium-to-high. The function is a load-bearing primitive — multi-voice TTS, lip sync, audio rehearsal, export pipeline all depend on its `combinedAudioBuffer` + `speakerTurns` output. Refactor must preserve the output schema while changing internals.

**Mitigation:** preserve the function signature and return shape exactly. Internal implementation rewrites; callers see no change.

**Test required:** the §18 acceptance criterion in audio-rehearsal-plan adds a regression test — Tier-1 split on a known sentence sequence + single-line regen on the middle sentence ≤250ms cumulative cut-beat drift.

#### Preservation: `castGenerateLineTTS` ([js/17b:3069](js/17b-create-references.js#L3069))

audio-rehearsal-plan §8.7 + §8.7b explicitly call out that this function STAYS as the per-line regen path. The §6.4 regen flow uses it directly. Implementer must not delete or merge it into the batched path.

#### Extension: scene data model (`audioActualDuration`, `videoActualDuration`, `manualDuration`, `dialogue.voiceOverride`, `dialogue.muted`, `dialogue.regenCount`, `dialogue.regenLockToken`, `audioRehearsal.status`)

These are new fields on shipped scene objects. Adding fields to existing data model is purely additive; no existing field is renamed or removed (the `dialogueLength` mention in voice-and-lipsync-plan §8.4 was a doc-only correction — never landed in shipped code).

**Risk:** low. Additive-only.

---

### audio-input-plan implementation impact

**One trivial code change + one extension to existing cast flow.**

#### One-line flag flip: `alignWordsWithScribe` diarize parameter ([js/17a:311](js/17a-create-api.js#L311))

```js
// Current (shipped):
formData.append('diarize', 'false');

// After audio-input-plan implementation (conditional):
formData.append('diarize', isAudioInputMode ? 'true' : 'false');
```

The function signature gains an optional `opts` parameter or reads an `inputDoc.audioMode` global to decide. Output schema gains `speaker_id` per word when diarize is true.

**Regression risk:** none for existing callers. Existing callers pass no flag → defaults to false → behavior preserved.

**Test required:** verify Scribe returns speaker labels when `diarize: true`; verify existing callers (subtitle alignment, audio rehearsal) still work with the augmented output schema (speaker_id field is additive on existing word objects).

#### Extension: `castDetectFromScript` cap + AI-suggest flow

The existing function gains:
- Max-5-extras cap (per audio-input-plan §7.1)
- AI-suggest-extras modal flow (per audio-input-plan §7.2)
- Voice picker for accepted extras (per audio-input-plan §7.3)
- Cross-format applicability (text and audio inputs share the same flow)

**Regression risk:** medium. The function is part of the cast lock pipeline — already shipped and used. Extension must not break the existing detect-from-script behavior for text-only inputs that don't need extras.

**Approach:** treat as additive — when input has unmapped speakers, the new flow runs. Otherwise, existing behavior unchanged.

#### New code (no shipped impact)

- `js/32-audio-input.js` — new module for audio input upload, mode-select, speaker mapping, mode-specific processing
- IDB keys: `audio_input_original_<projectId>`, `audio_master_<projectId>` (additive; no migration)

---

### input-formats-plan implementation impact

**One reduction in shipped storyboard agent + parser layer added upstream.**

#### Reduction: `castBuildDialogueAndFramingHint` ([js/17b:2906](js/17b-create-references.js#L2906))

This function currently asks the storyboard agent to infer speakers from prose context. After input-formats-plan ships, the parser layer (`js/31-input-parser.js`) hands pre-resolved speakers to the agent. The agent's prompt extension shrinks:

| Before (shipped) | After (per input-formats-plan §11) |
|---|---|
| Agent prompt asks: "identify the speaker of each dialogue line from context" | Agent prompt assumes: "speakers are pre-resolved; just generate scene descriptions + framing" |

**Regression risk:** medium. The storyboard agent prompt is sensitive — any change risks regression in scene description quality. Mitigation: keep the framing-extraction logic; only remove the speaker-inference instruction.

**Test required:** generate storyboards for 5 example projects (mix of prose, screenplay, audio input) and verify scene descriptions match pre-change quality.

#### Likely unchanged but verify: `castEnforceCutOnSpeaker` ([js/17b:2946](js/17b-create-references.js#L2946)), `castApplyFramingDerived` ([js/17b:3224](js/17b-create-references.js#L3224))

These functions post-process the storyboard agent's output (cut-on-speaker rule + speakerVisible derivation from framing). They run AFTER the agent emits structured scene data. Since the data shape is preserved by the parser layer (parser writes to the same `dialogue` and `framing` fields), these functions should keep working.

**Approach:** do NOT modify proactively. Run regression tests post-implementation; modify only if behavior diverges.

#### New code (no shipped impact)

- `js/31-input-parser.js` — new parser module with format detection + fountain-js + AI-classify
- IDB keys: `voicesample_*` are unchanged; new keys are additive

---

## Implementation ordering — what depends on what

```
                ┌───────────────────────────────────────┐
                │ Independent — can start any time:      │
                │   • input-formats-plan                  │
                │   • audio-input-plan                    │
                └───────────────────────────────────────┘
                                  │
                                  ▼
                ┌───────────────────────────────────────┐
                │ Depends on multi-voice TTS refactor   │
                │   • audio-rehearsal-plan Phase 3+     │
                │     (mini-player, mood selector,      │
                │      regen UI, rehearsal step UI)      │
                └───────────────────────────────────────┘
                                  │
                                  ▼
                ┌───────────────────────────────────────┐
                │ Final integration:                     │
                │   • Storyboard agent reduction         │
                │     (input-formats-plan Phase 7)       │
                │     should land AFTER parser layer is  │
                │     complete to avoid agent prompt     │
                │     regressions during transition       │
                └───────────────────────────────────────┘
```

**Recommended order:**

1. **audio-rehearsal-plan Phase 1-2 (data model + multi-voice TTS refactor)** — high-risk refactor first, while audio + input plans are still in design/prep
2. **audio-input-plan Phase 1-3 (audio upload + Scribe diarize + mode-select)** — independent of refactor; can run in parallel
3. **input-formats-plan Phase 1-5 (parser layer + AI-classify + review gate)** — independent; can run in parallel
4. **audio-input-plan Phase 4-7 (speaker mapping + mode-specific processing + AI-extras flow)** — depends on input-formats Phase 5 for cross-format AI-extras consistency
5. **audio-rehearsal-plan Phase 3-8 (mini-player + rehearsal step UI + drift gate + soundtouch)** — depends on multi-voice refactor (Phase 1-2 of same plan)
6. **input-formats-plan Phase 7 (storyboard agent reduction)** — last; lands after the parser layer is proven

---

## Regression test plan

### For `castGenerateMultiVoiceAudio` refactor

| Test | Pre-existing baseline | Post-refactor expectation |
|---|---|---|
| 3-character / 12-line dialogue project (text input) | Generates 12 TTS calls; combined buffer matches expected timing | Generates ≤8 TTS calls (per-character batched); combined buffer matches expected timing within ±50ms |
| Single-line regen during audio rehearsal | Replaces single segment in master buffer | Same — uses preserved `castGenerateLineTTS` path |
| Storyboard text edit triggering audio stale | Audio regen runs; new buffer assembled | Same path; verify `_createSpeakerTurns` rebuilt correctly |
| Mid-batch tone change between same-speaker lines | Currently produces blended prosody | Now breaks batch; per-tone calls; better fidelity |

### For `alignWordsWithScribe` diarize flip

| Test | Expected |
|---|---|
| Existing subtitle alignment call (no audio-input mode) | Output schema unchanged; subtitles render identically |
| New audio-input mode call | Output gains `speaker_id` per word; downstream consumes labels |
| Multi-speaker recording | Diarization correctly partitions speakers ≥2 |

### For `castDetectFromScript` extension

| Test | Expected |
|---|---|
| Text input with all speakers in user cast | No AI-extras flow; behavior unchanged |
| Text input with 2 unmapped speakers | AI-extras modal surfaces with both as suggestions |
| Audio input via Scribe with 4 unmapped speakers | AI-extras flow; voice picker per acceptance |
| Cap-exceeded case (8 unmapped speakers) | Top 5 by line-count auto-suggested; bottom 3 merged to narrator |

### For storyboard agent reduction

| Test | Expected |
|---|---|
| Generate 5 storyboards (prose) pre-change | Capture scene description quality + speaker accuracy |
| Generate same 5 storyboards post-change | Quality + accuracy ≥ pre-change baseline |
| Generate 5 storyboards from screenplay input post-change | Speaker accuracy = 100% (since parser provides pre-resolved speakers) |

---

## Open verification points (for the implementer to flag)

1. The `castGenerateMultiVoiceAudio` refactor should preserve `_createSpeakerTurns` schema exactly — if any new fields land, audio-rehearsal-plan §4 needs to be updated.
2. `alignWordsWithScribe` schema extension (adding `speaker_id` to word objects) — verify no downstream consumer parses words assuming speaker_id is absent.
3. `castDetectFromScript` already-shipped behavior — confirm exactly what it does today before extending; the existing function may have edge cases that shouldn't regress.
4. Storyboard agent prompt — keep an exact archive of the pre-change prompt before reducing; needed for rollback if regression hits.

---

## How this doc evolves

When a plan changes (audit pass, new finding, scope adjustment), update this doc's tables to reflect the new shipped-code impact. The doc is the single source of truth for "what code do I change to implement these plans."

Cross-references to keep in sync:
- audio-rehearsal-plan §8.7 implementation note (refactor scope)
- audio-rehearsal-plan §12 Phase 2 (refactor task list)
- audio-rehearsal-plan §17 decision log (refactor confirmation)
- audio-input-plan §11 Phase 2 (Scribe diarize task)
- audio-input-plan §7 (AI-extras flow)
- input-formats-plan §11 Phase 7 (storyboard agent reduction)
- voice-and-lipsync-plan §8.4 (field rename — doc-only, no shipped impact)
- voice-and-lipsync-plan §11.0 (Scribe role — doc-only, no shipped impact)
