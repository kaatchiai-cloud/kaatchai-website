# Cinematic Pipeline Plan v3 — Audit Findings

Date: 2026-05-06
Auditor: Senior engineer review against live codebase
Status: **5 critical issues, 4 high issues, 3 medium issues, 5 minor observations**

---

## CRITICAL

### C1. `legacyDialogueToLine` maps `audioActualDuration` from wrong object (§6.2)

**Plan claims** (line 286):
```js
withinSceneEndMs: (legacyDialogue.audioActualDuration || 0) * 1000,
```

**Code reality**: `audioActualDuration` is a property on the **scene** object (`scene.audioActualDuration`), not on `scene.dialogue`. Grep confirms zero matches for `scene.dialogue.audioActualDuration` or `dialogue.audioActualDuration`. The property on the dialogue object is `actualStartMs` / `actualEndMs` (set at js/17b-create-references.js:3484-3485 by `castGenerateMultiVoiceAudio`), but those are only populated for multi-voice TTS segments — not for the general single-speaker case.

**Impact**: For every legacy project restored via the shim's `set` path, `withinSceneEndMs` will always be `0`. This is the field the timing-finalization sub-step (§8.4) and `audioRegions[]` derivation depend on. A zero value means all dialogue appears to start at time 0 within the scene, producing wildly incorrect audio regions and split-prompt windows.

**Fix**: The shim should use `scene.audioActualDuration` (the scene-level field) as the source, not `legacyDialogue.audioActualDuration`:
```js
withinSceneEndMs: (this._sceneRef?.audioActualDuration || 0) * 1000,
```
Or, more practically, leave `withinSceneEndMs: null` and let Phase 8's timing-finalization populate it from the canonical source.

---

### C2. `scene.duration` reader count is 23+, not 17 (§6.3, §6.5)

**Plan claims** (line 236, 328): "17 `scene.duration` reference sites"

**Code reality**: Grep finds at least **23 distinct read sites** across 7 files:

| File | Lines |
|---|---|
| `js/17d-create-languages.js` | 388, 394, 769, 771, 773, 784, 801, 819, 831, 1144 |
| `js/29-canvas-render.js` | 187, 554, 798, 3115, 3116 |
| `js/33-audio-rehearsal.js` | 193, 528, 531 |
| `js/17c-create-pipeline.js` | 2144, 3621, 3842, 5057 |
| `js/21-kling.js` | 176 |
| `js/20-reels-creator.js` | 5203, 5217, 5438, 5445 |
| `js/27-canvas-state.js` | 348, 379 |

Notably, the reels-creator (4 read sites) and create-pipeline (4 read sites) are **not listed in the plan's §6.5 migration table**. The `js/27-canvas-state.js` and `js/33-audio-rehearsal.js` sites are listed, but `js/17d-create-languages.js` has 10 read sites and the plan only references "773-819" — missing lines 388, 394, 1144.

**Impact**: If Phase 2b misses any of these 23+ sites, the `scene.duration` shim silently returns wrong values for some code paths. The `duration` shim's getter resolves `durationTier > durationSec > _legacyDuration`, but until `durationTier` is set (pass-2 only), the getter falls back to `durationSec` or `_legacyDuration`. Sites that read `scene.duration` during the pass-1 window (before `durationTier` is computed) get `durationSec` — which is the **agent's creative target**, not the mechanical tier. This is a subtle semantic difference that could cause video clips to be generated at the wrong length.

**Fix**: The §6.5 migration table must enumerate every site. The shim itself should log a telemetry counter on every getter invocation that falls through to `_legacyDuration`, since that indicates an un-migrated reader.

---

### C3. Tier-selection algorithm produces 5.5s → 10s but edge case table says 5.5s → 10s (inconsistent split threshold) (§8.3)

**Plan's pseudocode** (line 462-463):
```js
const fitsTier   = pickSmallestTierAbove(provider.durationTiers, remainingMs / 1000);
const splittable = remainingMs / 1000 > splitThreshold;
tier = (splittable && fitsTier > provider.durationTiers[0])
  ? provider.durationTiers[0]
  : fitsTier;
```

For `durationTiers: [5, 10]` and `splitThreshold: 7.0`:
- Audio 5.5s: `fitsTier = 10` (smallest tier ≥ 5.5), `splittable = 5.5 > 7.0 = false` → `tier = 10`. Single 10s clip, 4.5s cropped.
- Audio 7.5s: `fitsTier = 10`, `splittable = 7.5 > 7.0 = true` → `fitsTier > 5 = true` → `tier = 5`. Split: [5+5], 2.5s cropped.

**Edge case table** (line 480-489) says:
- Audio 5.5s → [10s], 4.5s cropped — **matches pseudocode**
- Audio 7.5s → [5s, 5s], 2.5s cropped — **matches pseudocode**

But for audio **7.0s** exactly:
- Pseudocode: `splittable = 7.0 > 7.0 = false` → single 10s tier. Cropped = 3.0s.
- Edge case table line 485 says: "7.0s → [10s], 3.0s cropped" — **matches**

But this means audio of 7.0s gets a single 10s clip with 3s of dead tail, while audio of 7.5s gets two 5s clips with better prompt alignment. The jump from 10s single to 5+5 split at 7.01s is a **discontinuity in user experience** — a 0.01s increase in audio duration changes the rendering from one 10s clip to two 5s clips stitched together. This is the correct trade-off per the plan's design, but it's a behavior change from the current code (which would give a single 10s clip for all audio up to 12s).

**Impact**: Not a bug in the plan's logic, but a regression risk. The current `buildClipPlan` (js/21-kling.js:163-171) gives any audio up to 12s a single 10s clip. The plan changes this at 7.0s. Any existing project with audio between 5.0s–7.0s that was getting 5s clips will now get 10s clips (4.5s–3s cropped tails). And any audio between 7.01s–8.5s that was getting 10s clips will now get split 5+5 clips. This is a **visible quality change** for restored legacy projects.

**Fix**: The plan should explicitly document this as a known behavioral change for legacy projects and add a Phase 8 integration test that verifies the 7.0s threshold behavior.

---

### C4. Phase 8 depends on Phase 1 AND Phase 2a, but `generateContinuationPrompt` is called with a Gemini API key (§8.5, §17.1)

**Plan claims** (line 567): "Replaces `generateContinuationPrompt` at js/21-kling.js:137"

**Code reality** (js/21-kling.js:137-160): `generateContinuationPrompt` makes a direct `fetch` to `generativelanguage.googleapis.com` with a client-side `geminiKey`. This is exactly the kind of direct AI call that the migration-plan.md (P04/P05/P06) is supposed to move to the server.

**Problem**: The v3 plan's Phase 8 introduces a new Gemini call (`planSegments` split-prompt) that will also need to go through the server API. But the cinematic plan and migration plan are separate workstreams. If Phase 8 ships before migration Phase 06 (Web Cutover), the split-prompt call will be a NEW direct Gemini fetch from the client — adding to the BYOK surface that migration P06 is supposed to eliminate.

**Impact**: This adds a new Gemini API call that will need to be re-extracted in migration Phase 04/05. This should be called out as a cross-plan dependency.

**Fix**: Add a note in §8.5 that the split-prompt Gemini call should use the same key management pattern as the existing `generateContinuationPrompt` in v1, and will be re-routed through the server API as part of the migration plan's Phase 04/05. The migration plan should also inventory this new call site.

---

### C5. Phase 4 (style system) depends on Phase 3 (storyboard agent rewrite) but not on Phase 2a (schema migration) — this is wrong (§19)

**Plan claims** (line 791): Phase 4 risk is "medium", depends on Phase 3 only.

**Code reality**: The style injection points (§9.5) include the storyboard agent system prompt. The storyboard agent produces `dialogue`, `framing`, `isVoiceOver` per scene. Phase 4 needs to inject style into this agent prompt. But the agent prompt is being rewritten in Phase 3, which depends on Phase 2a (schema + shims). If Phase 4 ships before Phase 2a, style injection would target the old prompt structure.

More critically, the mode-aware preset library (Phase 4) introduces `subStyle` and `visualTreatment` fields on `createJobState`. The brainstorm wizard (Phase 5) and Brand/Film inline picker (Phase 6) write to these fields. But the storyboard agent (Phase 3) reads them for the `mergedStyle` computation. Phase 3 needs `createJobState.subStyle` to exist, which is created in Phase 4.

**Actual dependency**: Phase 4 should depend on Phase 2a (for `subStyle` field to exist on `createJobState`), AND Phase 3 should depend on Phase 4 (for style injection in the agent prompt). The current ordering (Phase 3 before Phase 4) means the storyboard agent rewrite ships BEFORE style fields exist, so the agent can't use them.

**Fix**: Either (a) make Phase 3 depend on Phase 4, moving the dependency chain to 1 → 2a → 4 → 3, or (b) have Phase 3 include the `subStyle` field definition as part of its schema changes, making the style system an incremental addition rather than a prerequisite. Option (b) seems cleaner since Phase 2a already adds new fields to `createJobState`.

---

## HIGH

### H1. `castEnforceCutOnSpeaker` writes `isVoiceOver: false` hardcoded — Phase 3 shim must account for this (§12.1)

**Code reality** (js/17b-create-references.js:2979): Every split segment gets `isVoiceOver: false`. The plan's Phase 3 says `castEnforceCutOnSpeaker` keeps unconditional split, producing single-line scenes.

But `isVoiceOver: false` is incorrect for reaction shots (e.g., the listener in a two-shot). After the agent rewrite (Phase 3), the agent may set `isVoiceOver: true` for a line, but then `castEnforceCutOnSpeaker` splits it and overwrites `isVoiceOver: false`. This is the same bug that exists today — the function always sets `isVoiceOver: false` regardless of what the agent intended.

**Impact**: During Phase 3 (migration window), any line the agent marks as `isVoiceOver: true` in a multi-speaker scene will be overwritten to `false` after splitting. This means lip sync will be attempted on a voice-over line, wasting compute and potentially producing bad overlays.

**Fix**: Phase 3's `castEnforceCutOnSpeaker` must preserve the agent's `isVoiceOver` value, not hardcode `false`. Even during the migration window, the function should copy `isVoiceOver` from the source dialogue (or derive it from the split line's own `isVoiceOver` field if `additionalTurns` has it).

---

### H2. `castDeriveSpeakerVisible` + `castApplyFramingDerived` run AFTER `castEnforceCutOnSpeaker` — this pipeline order is undocumented (§12.1)

**Code reality** (js/17c-create-pipeline.js:1286-1288):
```js
if (typeof window.castEnforceCutOnSpeaker === 'function') {
  segments = window.castEnforceCutOnSpeaker(segments);
}
```
Then at line 1372, the same call happens again in a different code path.

After both calls, `castApplyFramingDerived` (js/17b-create-references.js:3003-3528) runs to set `speakerVisible` and override `isVoiceOver` based on framing.

**Problem**: The plan's Phase 3.5 says "castEnforceCutOnSpeaker updated to preserve two-shot framings." But `castApplyFramingDerived` (js/17b-create-references.js:3003) has its own logic: it sets `speakerVisible` based on framing enum AND overwrites `isVoiceOver = true` for non-visible framings (line 3510). This function also needs updating in Phase 3.5 — it currently derives `speakerVisible` for a single `dialogue` object, not for `dialogueLines[]`.

**Impact**: Even if `castEnforceCutOnSpeaker` is updated to preserve two-shots, `castApplyFramingDerived` will still process the scene with single-dialogue logic, potentially setting `speakerVisible = true` and `isVoiceOver = false` for the first speaker only, ignoring subsequent speakers.

**Fix**: §12.1 should explicitly include `castApplyFramingDerived` in the Phase 3.5 migration scope. This function needs to be rewritten to iterate `dialogueLines[]` and derive `isVoiceOver` per line based on `visualSubjectIds` + framing.

---

### H3. `scene.duration` shim getter priority can mask bugs during migration (§6.3)

**Plan's shim** (lines 308-311):
```js
get() {
  if (typeof this.durationTier === 'number') return this.durationTier;
  if (typeof this.durationSec  === 'number') return this.durationSec;
  return this._legacyDuration || 0;
}
```

**Problem**: `durationTier` is a **mechanical ceiling** (5, 10, 15...) while `durationSec` is a **creative target** (7.4, 5.2, etc.). During the pass-1 window (storyboard agent has emitted `durationSec` but `durationTier` isn't yet computed), any reader asking for `scene.duration` gets `durationSec` — the creative target. This is semantically different from the old `scene.duration`, which was the scene's continuous duration (ranging 4.0–12.0+).

For example, in `buildClipPlan(scene.duration || 5)` (js/21-kling.js:176), which still runs during Phase 1 (pre-Phase 8), `scene.duration` would return `7.4` (creative target) instead of the old value. The old value was typically the audio actual duration or the agent's estimate. This matches semantically during pass-1 but diverges after pass-2 when `durationTier` takes over.

**Risk**: `buildClipPlan(7.4)` returns `[10]` (current code: `duration <= 12 → [10]`). But `buildClipPlan(10)` also returns `[10]`. If a reader expects the continuous value and gets the tier, the discrepancy is 2.6s. The `js/17d-create-languages.js` timeline code is particularly sensitive — it uses `scene.duration` for subtitle timing calculations (lines 388, 394).

**Fix**: The shim should only resolve to `durationTier` when explicitly in pass-2 state. During pass-1, readers should see `durationSec` (which IS the old continuous value). Consider making the getter return `durationSec` during pass-1 and `durationTier` only after pass-2 has run. Or better: add a `segmentPlanPass` check:
```js
get() {
  if (this.segmentPlanPass === 'actual' && typeof this.durationTier === 'number') return this.durationTier;
  if (typeof this.durationSec === 'number') return this.durationSec;
  return this._legacyDuration || 0;
}
```

---

### H4. The `STYLE_PRESETS` back-compat alias has 4 consumers in reels-creator, but 2 are in create-api (§17.3)

**Plan claims** (line 730): `STYLE_PRESETS` is "kept as a back-compat alias for Reels" consumed at `js/20-reels-creator.js:290,1344,3104` and `js/17a-create-api.js:164,224`.

**Code reality**: The create-api consumers (lines 164, 224) are in the **template** and **style application** code paths used by the Copilot (`17c-create-pipeline.js`). Specifically:
- Line 164: `const newStyle = (tpl.style && STYLE_PRESETS[tpl.style]) ? tpl.style : '';` — template selection
- Line 224: `createStylePrompt = STYLE_PRESETS[tpl.style];` — style prompt assignment

These are NOT Reels-specific. They're in the shared create-api module. The plan says "Cleanup removes Copilot's dependency on it" — but the create-api module is shared between Copilot and Reels. Removing Copilot's dependency on `STYLE_PRESETS` means removing template-style handling from create-api, which Reels also uses.

**Impact**: If create-api's `STYLE_PRESETS` reference is removed while Reels still depends on it (because create-api is shared), Reels breaks.

**Fix**: The plan should specify that create-api's `STYLE_PRESETS` reference is NOT removed in Phase 12 — it stays as long as Reels uses create-api. Instead, Copilot's code path should bypass the old `STYLE_PRESETS` lookup by reading from `createJobState.subStyle` directly. The `STYLE_PRESETS` global itself stays until Reels gets its own migration.

---

## MEDIUM

### M1. `scene.videoClips` is already an array in current code (§5.2)

**Plan implies** (line 25, 142-146): `videoClips[]` was "at risk of being dropped in v2" but is now "preserved as first-class."

**Code reality**: `videoClips` is already an array of `{ url, clipDuration }` objects in the current code (js/21-kling.js:202-224). The current `_animateSingleScene` pushes `{ url, clipDuration }` entries into it. Save/restore (js/15-project.js:1019-1029) and animated export (js/17d-create-languages.js:780) already read it as an array.

**Finding**: This isn't a preservation issue — it's already the primary storage format. `videoUrl` is set to `videoClips[0].url` as a convenience at line 232. The plan correctly preserves this, but the v2 audit finding that "videoClips was at risk" suggests a misunderstanding of the current state. `videoClips` is not a new field — it's the existing field that was always there.

---

### M2. `dialogueLines` in audio-input already has `audioSegmentStartMs` but the plan says it's "already populated" — verify (§8.4 line 497)

**Plan claims**: "Copy from existing `dialogueLines[i].audioSegmentStartMs/EndMs` (already populated at js/32-audio-input.js:979)"

**Code reality**: js/32-audio-input.js:979 shows `audioSegmentStartMs: word.start * 1000` — but this is **per-word** timing from diarization output, not per-line timing. The `audioSegmentStartMs` field at line 979 is set on individual word objects, not on `dialogueLines` entries.

Meanwhile, at line 1140, Mode B sets `audioSegmentStartMs: null` per dialogue line.

**Impact**: Mode A may already have per-word timings, but not per-line timings that map to `dialogueLines[i].withinSceneStartMs`. The plan's timing-finalization sub-step assumes Mode A has `audioSegmentStartMs/EndMs` on each `dialogueLines[i]` entry, but the actual field structure may be different (word-level vs line-level).

**Fix**: Verify whether Mode A's `processOriginalAudio` assembles word-level timings into line-level timings on `dialogueLines`. If it doesn't, the timing-finalization needs an aggregation step for Mode A (the earliest word's startMs becomes the line's startMs, the latest word's endMs becomes the line's endMs).

---

### M3. `narrationMode` lazy computation doesn't specify when it's computed (§13.4, §16.3)

**Plan says**: `narrationMode` is `null | 'pending' | 'dialogue' | 'voice-over' | 'mixed'` and is computed lazily.

The v1 audit (finding #4) flagged that computing it "at storyboard commit time" was wrong because scenes are generated incrementally. V3 says "lazy" but doesn't specify the gating trigger.

**Issue**: If `narrationMode` starts as `null` and is lazily computed, code that checks `narrationMode === 'voice-over'` (to skip lip sync) will see `null` and not skip. When is the computation triggered? After all scenes are generated? After audio rehearsal lock? After first scene generates?

**Fix**: Define an explicit trigger: `narrationMode` is computed from `scene.dialogueLines[].isVoiceOver` once after the storyboard agent commits all scenes, and recomputed on any Class B/C edit that changes `visualSubjectIds` or `isVoiceOver`. Set it to `'pending'` until that moment, and gate lip-sync routing on `narrationMode !== null`.

---

## MINOR OBSERVATIONS

### O1. `castEnforceCutOnSpeaker` is called twice (js/17c-create-pipeline.js:1287 and 1372)

Two separate code paths in the create pipeline call `castEnforceCutOnSpeaker`. Both need to be migrated in Phase 3. The plan mentions the function but doesn't acknowledge it's called from two locations. Both calls must be consistent during the migration window.

### O2. The `additionalTurns` field is only used by `castEnforceCutOnSpeaker` — no other code reads it

Grep confirms `additionalTurns` only appears at js/17b-create-references.js:2958 (inside `castEnforceCutOnSpeaker`) and in the storyboard agent prompt schema (line 2933). When Phase 3 removes the forced-close-up rule and Phase 3.5 allows multi-line scenes, `additionalTurns` can be fully deleted. The plan doesn't explicitly call this out for deletion.

### O3. `speakerVisible` is set by `castDeriveSpeakerVisible` (line 2994-2997) AND `castApplyFramingDerived` (line 3503-3528)

Both functions derive `speakerVisible` from framing. The plan introduces `visualSubjectIds[]` and per-line `isVoiceOver` to replace `speakerVisible`. The migration plan should explicitly cover when `speakerVisible` is removed and how the two functions that set it are handled. Currently `speakerVisible` is a **scene-level** boolean, but `isVoiceOver` is a **per-line** boolean — this is a semantic upgrade that requires the same reader migration as `dialogue → dialogueLines[]`.

### O4. `scene.audioActualDuration` is referenced in `canGenerateVideos()` and drift computation (lines 671-696)

The plan removes drift detection but `scene.audioActualDuration` is also used in the audio rehearsal lock logic (`_lockAndGenerateVideos` at line 1132 sets `scene.duration = scene.audioActualDuration`). When `scene.duration` is removed and replaced by the shim, the lock logic needs to be updated to write `durationSec` and trigger pass-2 `planSegments` instead of directly setting `scene.duration`.

### O5. The `scene.prompt` field is referenced in `generateContinuationPrompt` (line 145)

The plan replaces `generateContinuationPrompt` with the Gemini split-prompt call (§8.5), which takes `scene.fullMotionPrompt` instead. But `scene.prompt` and `scene.motionPrompt` are different fields in the current code (`motionPrompt` is preferred at line 179-181 of kling.js). The plan should clarify whether `fullMotionPrompt` is a new field or an alias for `motionPrompt`.

---

## PHASE DEPENDENCY ANALYSIS

The plan states these dependencies:
```
1 → 2a → 3 → 2b → 3.5
1 → 8 → 10
4 ← {5, 6, 7}
11 ← {9, 10}
```

**Issue with Phase 4 → 3 dependency** (see C5): The storyboard agent (Phase 3) reads style context. Phase 4 creates the style system. If Phase 3 ships before Phase 4, the agent prompt can't include `subStyle` information. The current agent prompt reads from `STYLE_PRESETS` (via `castBuildDialogueAndFramingHint`), so it has SOME style context. But the new style injection points (§9.5) include the agent prompt — meaning Phase 3's agent rewrite depends on Phase 4's style fields existing on `createJobState`.

**Recommendation**: Either Phase 4 is moved before Phase 3 (1 → 2a → 4 → 3), or Phase 2a includes adding the `subStyle` and `visualTreatment` fields to `createJobState` as stubs, allowing Phase 3 to read them even if the full preset library isn't built yet.

**Issue with Phase 8 → 10**: Phase 10 (lip-sync routing) depends on Phase 8 (segment planner) for stitched-video availability. But Phase 10 also needs Phase 2b (reader migration) to be complete, since `prepareLipSyncForExport` reads `scene.dialogue.speakerCharacterId`. The plan's dependency table shows Phase 10 depends on Phase 8 ("sequential"), but doesn't list Phase 2b as a dependency. Phase 10 MUST depend on Phase 2b being complete for `dialogueLines[]` to be available.

---

*End of audit.*