# Implementation Order — Cross-Plan Reference

Single source of truth for the order in which phases across all five Stori plans should be implemented. Reference this before picking up any phase to avoid building on unstable ground.

Sibling to:
- [consistency-plan.md](consistency-plan.md) — visual bible (✅ shipped)
- [voice-and-lipsync-plan.md](voice-and-lipsync-plan.md) — multi-voice TTS + lip sync (✅ Phases 1-8, 10 shipped; Phase 9 parked)
- [audio-rehearsal-plan.md](audio-rehearsal-plan.md) — per-scene audio iteration + preview gate (⏸ not started)
- [input-formats-plan.md](input-formats-plan.md) — prose + screenplay parsing (⏸ not started)
- [audio-input-plan.md](audio-input-plan.md) — diarization + speaker mapping + two-mode (⏸ not started)
- [shipped-code-impact.md](shipped-code-impact.md) — which existing code each plan touches

---

## Status snapshot (at write time)

| Plan | Phases total | Shipped | Open |
|---|---:|---:|---:|
| consistency-plan | 12 | 12 | 0 |
| voice-and-lipsync-plan | 10 | 9 | 1 (Phase 9 deferred — needs R2/CF infra) |
| audio-rehearsal-plan | 8 | 0 | 8 |
| input-formats-plan | 7 | 0 | 7 |
| audio-input-plan | 8 | 0 | 8 |

**Open phases across all plans: 24** (excluding voice-plan Phase 9 which is infra-blocked).

---

## The dependency map

Three load-bearing constraints drive the ordering:

1. **`castGenerateMultiVoiceAudio` refactor** (audio-rehearsal Phase 1-2) is **upstream of every other audio feature**. Every downstream feature consumes the new batched output shape. Refactor in isolation first; everything else builds on it.

2. **Storyboard agent prompt reduction** (input-formats Phase 7) lands **last**. The agent currently does inline speaker inference; if we strip that before the parser layer is proven, scenes regress in description quality.

3. **AI-suggested-extras flow is shared cross-format**. Text-input and audio-input both produce extras through the same UI pattern + 5-cap. Build the text-input version (input-formats Phase 5) before consuming it from audio-input Phase 5.

Diagram:

```
                       LAYER 1 (foundation)
              ┌─────────────────────────────────────┐
              │  audio-rehearsal Phase 1-2           │
              │  multi-voice TTS refactor            │
              │  (per-line → per-character batched   │
              │   + 3-tier cut-beat + Tier 1/2/3     │
              │   splitter chain)                    │
              │                                       │
              │  HIGH RISK — refactors shipped code  │
              └─────────────────────────────────────┘
                              │
                              ▼
   ┌─────────────────────────────────────────────────┐
   │            LAYER 2 (parallel tracks)             │
   │                                                   │
   │  ┌──────────────┐ ┌──────────────┐ ┌──────────┐ │
   │  │ input-formats│ │ audio-input  │ │  audio-  │ │
   │  │  Phase 1-5   │ │  Phase 1-3   │ │ rehearsal│ │
   │  │  parser layer│ │  upload +    │ │ Phase 3-7│ │
   │  │              │ │  Scribe +    │ │  UI work │ │
   │  │              │ │  mode-select │ │          │ │
   │  └──────────────┘ └──────────────┘ └──────────┘ │
   └─────────────────────────────────────────────────┘
                              │
                              ▼
   ┌─────────────────────────────────────────────────┐
   │           LAYER 3 (integration)                  │
   │                                                   │
   │  audio-input Phase 4-7                           │
   │    speaker mapping + AI-extras +                 │
   │    Mode A/B processing                           │
   │                                                   │
   │  input-formats Phase 7                           │
   │    storyboard agent reduction                    │
   │    (lands LAST in input-formats)                 │
   │                                                   │
   │  audio-input Phase 8                             │
   │    TTS skip contract enforcement                 │
   └─────────────────────────────────────────────────┘
                              │
                              ▼
   ┌─────────────────────────────────────────────────┐
   │           LAYER 4 (polish + parked)              │
   │                                                   │
   │  audio-rehearsal Phase 8 — theming pass          │
   │  voice-plan Phase 9 — server migration (parked)  │
   └─────────────────────────────────────────────────┘
```

---

## Layer 1 — Foundation refactor (do first, alone)

### Phase 1.A — `castGenerateMultiVoiceAudio` refactor (audio-rehearsal Phase 1-2)

**File:** [js/17b-create-references.js#L3115](js/17b-create-references.js#L3115)

**What changes:**
- Existing per-line serial loop calling `castGenerateLineTTS` per segment
- Becomes per-`(speakerId, mood)`-batched calls per audio-rehearsal-plan §8.7
- Replace binary cut-beat (200ms speaker-change / 0ms same-speaker) with three-tier (200ms speaker-change / 100ms same-speaker tone-change / 0ms in-batch)
- Implement Tier 1/2/3 splitter chain per audio-rehearsal-plan §8.7a (Scribe → ElevenLabs `*-with-timestamps` → duration-math fallback)

**What stays:**
- Function signature preserved exactly (callers don't change)
- `_createSpeakerTurns` output schema preserved (downstream lip sync, audio rehearsal, export pipeline all consume this)
- `castGenerateLineTTS` ([js/17b#L3069](js/17b-create-references.js#L3069)) preserved unchanged for single-line regen path

**Risk:** **High.** This function is load-bearing for multi-voice TTS, lip sync, audio rehearsal, and export. Refactor must preserve output contract while changing internals.

**Mitigation:**
- Run the regression test from audio-rehearsal-plan §18 acceptance: Tier-1 split on known sentence sequence + single-line regen on middle sentence ≤250ms cumulative cut-beat drift.
- Keep existing per-line code path callable as a feature-flagged fallback during validation.
- Test against shipped projects (3-character, 5-character, mixed-mood) before removing the fallback.

**Estimate:** 2-3 days.

**Why first:** every Layer 2 + 3 feature consumes the new output. Refactoring while UX is being built downstream creates chase-the-tail bugs. Land cleanly first.

---

## Layer 2 — Independent parallel tracks

These three tracks don't touch each other's code. Can be built simultaneously by 2-3 implementers, or sequentially by one.

### Track 2.A — input-formats Phase 1-5 (parser layer, no agent changes)

**Files:** new `js/31-input-parser.js`, [js/17b](js/17b-create-references.js), [js/17c](js/17c-create-pipeline.js), [vendor/fountain-js/](vendor/fountain-js/) (new bundled vendor module)

**What ships:**
- Phase 1: data model + `detectInputFormat()` regex heuristics
- Phase 2: prose parser (5-pass algorithm per audit fix B4 — bracket tokens, speaker-tagged dialogue, bracket-tag inline narration, quoted dialogue, action lines, multi-line continuation post-pass)
- Phase 3: screenplay parser via bundled `fountain-js@1.2.6` (NOT CDN — per audit fix C1)
- Phase 4: AI classification (mood + speaker inference batched single Gemini call per document)
- Phase 5: confidence aggregation + scene-level review-required modal + reformat-as-screenplay escape with `sanitizeFountainOutput()` fence-stripping

**What does NOT ship in this phase:** storyboard agent reduction (Phase 7 — defer to Layer 3).

**Risk:** Medium. New parser code (5 passes) is brand-new, not a reuse of existing helpers per audit fix B4. fountain-js library is mature but not yet integrated.

**Estimate:** 3 days.

### Track 2.B — audio-input Phase 1-3 (upload + Scribe + mode-select)

**Files:** [js/17a-create-api.js#L301](js/17a-create-api.js#L301), [js/17c](js/17c-create-pipeline.js), new `js/32-audio-input.js`

**What ships:**
- Phase 1: audio upload + format/duration validation + IDB persistence at `idb_audio_input_<projectId>`
- Phase 2: `alignWordsWithScribe` gets optional `{ diarize }` parameter defaulting `false` (backward-compat — 3 existing callers unchanged); when `true`, output schema gains `speaker_id` per word
- Phase 3: mode-select modal (original-audio default vs re-TTS-as-script-reference); `inputDoc.audioMode` lock

**What does NOT ship:** speaker mapping (Phase 4 — needs cross-format AI-extras from input-formats Phase 5), Mode A/B processing (Phase 6-7 — depends on mapping).

**Risk:** Low for Phase 1, low-medium for Phase 2 (output schema change risks breaking existing typed/validated consumers — audit fix C4 addressed via optional param).

**Estimate:** 1-2 days.

### Track 2.C — audio-rehearsal Phase 3-7 (rehearsal step UI)

**Files:** [js/11-export.js](js/11-export.js), [js/13-wavesurfer.js](js/13-wavesurfer.js), [js/17c](js/17c-create-pipeline.js), [js/19-video-timeline.js](js/19-video-timeline.js), new vendor `soundtouch-js`

**What ships:**
- Phase 3: per-image card audio mini-player + 12-mood selector + regen-with-cost-preview button + voice override overflow menu
- Phase 4: dedicated rehearsal step (large 16:9 preview area always-dark per audit fix § theming + transport bar with scrubber + scene-tick strip + read-only per-scene status rows + ↩ back-link to image-gen)
- Phase 5: drift detection + soundtouch-js client-side time-stretch + 3% gate logic + `durationStatus` truth table per §8.3a
- Phase 6: per-scene video regen escape hatch ("regenerate this scene's video for exact match" hover-info)
- Phase 7: editor Stage 1 — speaker-colored regions on existing master dialogue track + click-to-regen context menu deep-linking back to image-gen step

**What does NOT ship:** Phase 8 theming pass (defer to Layer 4).

**Risk:** Medium. soundtouch-js is new library; export tick integration is sensitive (existing subtitle + narrator overlay paths must not regress).

**Estimate:** 4-5 days.

---

## Layer 3 — Cross-plan integration

These depend on Layer 2 completing.

### Phase 3.A — audio-input Phase 4-7 (speaker mapping + AI-extras + processing)

**Depends on:** Track 2.B (Phase 1-3 audio infra) + Track 2.A Phase 5 (cross-format AI-extras flow)

**Files:** new `js/32-audio-input.js`, [js/17b](js/17b-create-references.js)

**What ships:**
- Phase 4: speaker-mapping UI (audio-sample-primary + text-snippet-supporting per audit fix #13; AudioContext resume-on-gesture per EC-DI-11; data-URL-in-IDB sample clips per audit fix B4)
- Phase 5: AI-suggested extras flow (5-cap; voice picker for accepted extras; rejected→narrator per option a; cross-format consistency with input-formats Phase 5 — same `aiSuggestedExtras` data model + same UI pattern)
- Phase 6: Mode A original-audio processing (`processOriginalAudio` with narrator fallback guard + Scribe word-boundary slicing + ms unit conversion per audit fix A1)
- Phase 7: Mode B re-TTS pipeline (per-line text extraction + optional tone detection batched 30/call + multi-voice TTS handoff to refactored `castGenerateMultiVoiceAudio`)

**Risk:** Medium. Cross-format AI-extras is the load-bearing integration point — verify text-input and audio-input both produce identical UX through the shared modal.

**Estimate:** 2-3 days.

### Phase 3.B — input-formats Phase 7 (storyboard agent reduction)

**Depends on:** Track 2.A complete (parser layer is producing pre-resolved structures) + Phase 3.A complete (audio-input also producing pre-resolved structures via diarization).

**Files:** [js/17b#L2906](js/17b-create-references.js#L2906) `castBuildDialogueAndFramingHint`

**What changes:**
- Storyboard agent prompt extension shrinks: agent no longer infers speakers from prose context (parser layer hands pre-resolved speakers via `parsed.dialogueLines`)
- Framing classification logic + cut-on-speaker post-process unchanged
- `castEnforceCutOnSpeaker` and `castApplyFramingDerived` unchanged

**Risk:** Medium. Storyboard agent prompt is sensitive — any change risks regression in scene description quality.

**Mitigation:**
- Archive pre-change prompt verbatim before editing; needed for rollback
- Regression test: 5 example projects (mix of prose, screenplay, audio input). Storyboard quality must match or exceed pre-change baseline.

**Estimate:** 1 day + regression validation.

### Phase 3.C — audio-input Phase 8 (lock + downstream handoff)

**Depends on:** Phase 3.A complete.

**Files:** [js/17c](js/17c-create-pipeline.js)

**What ships:**
- TTS skip contract enforcement (when `audioMode === 're-tts' && locked`, storyboard step skips `castGenerateMultiVoiceAudio` per voice-and-lipsync §8 head + audio-input §9.2 + audio-rehearsal §11.3 cross-references)
- `inputDoc.locked = true` final transition
- Storyboard agent receives unified `parsed` structure identically across text/audio sources

**Risk:** Low. Mostly integration glue.

**Estimate:** 0.5-1 day.

---

## Layer 4 — Polish + deferred

### Phase 4.A — audio-rehearsal Phase 8 (theming pass)

Aurora dark + light theme verification across all new UI from Tracks 2.A, 2.C, and Layer 3. Per voice-and-lipsync-plan §19 Aurora compliance rules.

Send-to-editor gate refinement: total drift display, scene-status row count, cost-preview accuracy.

**Estimate:** 1 day.

### Phase 4.B — voice-and-lipsync Phase 9 (server migration, parked)

Cloudflare Containers + R2 + Supabase migration of Tier 1 lip sync (MediaPipe browser → Python server-side via worker). Per consistency-plan §16 cross-project bible inheritance question — this is the same infra deliverable.

**Status: parked until R2 + Cloudflare Container infra is provisioned.** Doesn't block Layer 1-3 work; doesn't block product launch on browser-side MediaPipe.

**Estimate:** when started, ~3-4 days for the worker + R2 storage + provider abstraction swap. Front-end code changes minimal — `lipSyncProvider` interface picks `server-mediapipe` instead of `browser-mediapipe`.

---

## Risk-adjusted timeline

Single implementer, uninterrupted:

| Layer | Phases | Days |
|---|---|---:|
| Layer 1 | audio-rehearsal Phase 1-2 (multi-voice TTS refactor) | 2-3 |
| Layer 2 | input-formats 1-5 + audio-input 1-3 + audio-rehearsal 3-7 (sequential) | 8-10 |
| Layer 3 | audio-input 4-7 + input-formats 7 + audio-input 8 | 3-4 |
| Layer 4 | audio-rehearsal 8 (theming) | 1 |
| **Total** | (excluding voice-plan Phase 9) | **14-18 days** |

With 2-3 implementers running Layer 2 tracks in parallel: **9-12 days total.**

Voice-plan Phase 9 (server migration) lands separately when infra exists.

---

## Decision points before starting Layer 1

Three locks needed before kicking off:

1. **Refactor strategy for `castGenerateMultiVoiceAudio`** — preserve function signature exactly OR rename + keep old function as deprecated wrapper for migration period. **Recommended: preserve signature**, internal-only refactor. Callers unchanged. Reduces blast radius.

2. **soundtouch-js distribution** — bundle (matches fountain-js pattern locked in input-formats audit fix C1) OR CDN dynamic-import (current audio-rehearsal-plan §8.5 phrasing). **Recommended: bundle**, for consistency. Update audio-rehearsal-plan §8.5 to match.

3. **Voice-plan Phase 9 timing** — start R2/CF infra provisioning in parallel with Layer 2 work, OR wait until all client-side ships? **Recommended: wait.** Client-side work + audit cycles got us this far; server migration is its own deliverable that benefits from being a focused effort once R2 is online.

---

## Per-phase risk register

| Phase | Risk | Top mitigation |
|---|---|---|
| audio-rehearsal Phase 1-2 (Layer 1) | High — refactor of shipped code | Regression test (Tier-1 split + single-line regen ≤250ms drift); feature-flagged fallback during validation |
| input-formats Phase 2 (prose parser) | Medium — brand-new code (5 passes) | Test fixtures: prose with explicit tags, prose with bracket tokens, prose with quoted-orphan dialogue, multi-line dialogue, action paragraphs |
| input-formats Phase 3 (fountain-js) | Low | Bundle `@1.2.6` exact + fallback `@1.2.5` per audit fix B1 |
| input-formats Phase 4 (AI classification) | Medium — Gemini batch prompt + structured output | Test mood-classification across all 12 enum values + edge parentheticals (`beat`, `off-screen`, `quietly, with regret`) |
| input-formats Phase 5 (review modal) | Low | UX-only; uses existing modal infra |
| input-formats Phase 7 (agent reduction, Layer 3) | Medium — sensitive prompt | Archive pre-change prompt; 5-storyboard regression test |
| audio-input Phase 2 (Scribe diarize) | Low — additive optional param | 3 existing callers verified unchanged with default |
| audio-input Phase 4 (speaker mapping UI) | Medium — AudioContext suspended cases (EC-DI-11) | Resume-on-gesture wrapper around all play buttons |
| audio-input Phase 5 (AI-extras, Layer 3) | Medium — cross-format integration | Verify identical UX modal across text + audio paths |
| audio-input Phase 7 (Mode B re-TTS) | High — depends on Layer 1 + tone detection batching | Tone detection per audit fix B6 (30-line batches); fallback when Gemini call fails (default 'matter-of-fact') |
| audio-rehearsal Phase 5 (drift + soundtouch-js) | Medium — degraded mode (audit §8.4a) | Surface persistent banner when soundtouch fails to load; tighten gate to 0% drift; force regen path |
| audio-rehearsal Phase 7 (editor Stage 1) | Medium — wavesurfer regions on existing track | Don't break existing subtitle + narrator overlay rendering; per-region click → context menu → deep-link back to image-gen |

---

## Cumulative state at each layer

| Layer | What's working in production after this layer ships |
|---|---|
| Layer 0 (today) | Bible + cast-locked characters + multi-voice TTS (per-line) + framing-aware Kling i2v + Tier 1/2 lip sync + voice canvas chip |
| Layer 1 | Same as Layer 0 + per-character batched TTS + 3-tier cut-beat + Tier 1/2/3 splitter (faster, cleaner audio output) |
| Layer 2 | Above + prose/screenplay input parsing with confidence-gated review + audio upload with diarize + audio rehearsal step UI for iterating audio per scene |
| Layer 3 | Above + cross-format AI-suggested extras + Mode A/B audio-input processing + reduced storyboard agent prompt |
| Layer 4 | Above + Aurora theming polish |
| Layer 4.B (when infra ready) | Above + server-side MediaPipe lip sync (Tier 1) at scale |

---

## Cross-references kept in sync

When implementation order changes, update these files:

- this doc (`implementation-order.md`)
- `shipped-code-impact.md` — risk + ordering tables
- audio-rehearsal-plan §12 implementation order
- input-formats-plan §13 implementation order
- audio-input-plan §11 implementation order
- voice-and-lipsync-plan §13 implementation order

---

## Summary

**Start with Layer 1** (`castGenerateMultiVoiceAudio` refactor) — it's the load-bearing change everything else depends on. Validate with the regression test before moving on.

**Then Layer 2** can run as parallel tracks if you have multiple implementers, or sequentially as one person.

**Layer 3** integrates the parallel work — cross-format AI-extras flow, storyboard agent reduction, TTS skip contract.

**Layer 4** is theming polish + the parked server migration.

Total: 14-18 days uninterrupted single-implementer; 9-12 days with parallel tracks. Voice-plan Phase 9 is on its own timeline tied to R2/CF infra.
