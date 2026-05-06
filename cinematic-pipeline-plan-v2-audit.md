# Critical Audit: Cinematic Pipeline Plan v2

**Date:** 2026-05-06  
**Auditor:** Senior engineer review against current codebase  
**Scope:** Logical consistency, cross-plan integration, implementation feasibility, v1 audit regression check  

---

## Executive Summary

v2 is a significant improvement over v1. 11 of the 14 audit findings are explicitly resolved with specific, verifiable fixes. The Phase 2a/2b split, `Object.defineProperty` shim, two-pass segment planner, bifurcated stitching strategy, and `STYLE_PRESETS` migration table are all well-designed.

However, I've identified **4 new critical issues**, **3 carry-over issues** (partially fixed but with remaining gaps), **5 new significant issues**, and **6 minor concerns**. The most dangerous new problem is the **10.0s boundary contradiction** in the tier-selection algorithm (NC1), which will cause incorrect segment plans at a common audio duration.

---

## Part 1: V1 Audit Regression Check

| V1 ID | Issue | V2 Status | Assessment |
|-------|-------|-----------|------------|
| C1 | `dialogueLines[]` migration path undefined | **Resolved** — §6.1-6.4 provide Phase 2a/2b split, `Object.defineProperty` shim, writer/reader migration tables, integration test plan | Thorough. The shim design (get→`dialogueLines[0]`, set→wrap as array) is correct and enumerable:false avoids JSON round-trip duplication. |
| C2 | `scene.duration` backward-compat missing | **Partially resolved** — `durationSec` + `durationTier` + `segmentPlan` are added, but no `scene.duration` shim is specified | See carry-over CO1 below. |
| C3 | `audioRegions[]` has no producer/consumer | **Resolved** — §8.1 specifies segment planner pass 2 produces it; §8.4 identifies Gemini split-prompt as consumer; `audioRegions` wired into split-prompt input schema | Clean. |
| C4 | Split-threshold contradicts pseudocode | **Resolved** — §8.3 pseudocode rewritten with explicit `splittable` check; edge case table §18 #2 clarified | But new issue: 10.0s boundary — see NC1 below. |
| C5 | `narrationMode` timing ambiguous | **Resolved** — §13.4 specifies lazy computation at lip-sync stage entry, re-compute on edits, back-compute on project load (§16.3) | Clear temporal dependency now explicit. |
| C6 | MSE stitching won't work for Tier 2 | **Resolved** — §8.5 bifurcates: server-side R2/CF for Tier 2, client-side MSE for Tier 1; Tier 2 multi-segment deferred to v1.5 | Practical. Accepting v1 limitation is the right call. |
| C7 | `visualSubjectIds` validator incomplete | **Not resolved** — §12.3 says "auto-corrects `isVoiceOver` inconsistencies" but still doesn't specify the hard constraint that `isVoiceOver === false` speakers MUST be in `visualSubjectIds` | See carry-over CO2 below. |
| C8 | Continuation modes underspecified | **Not resolved** — §5.1 and §7.1 still include `last-frames-conditioning`, `embedding`, `none` in `continuation.mode` enum | See carry-over CO3 below. |
| S1 | `audioActualDuration` vs `durationSec` overlap | **Partially resolved** — §8.2 says `audioMs: null in pass 1 (use scene.durationSec * 1000)`, implying pass 2 uses actual TTS duration. But the relationship between `scene.audioActualDuration` (from audio-rehearsal-plan) and the planner's `audioMs` parameter is still not explicitly stated | See carry-over CO1 below. |
| S2 | `additionalTurns` removal vs `castEnforceCutOnSpeaker` | **Resolved** — §6.3 writer migration table explicitly covers `castEnforceCutOnSpeaker`: "if scene has `dialogueLines[]`, branches based on framing per §12.4" | Clear. |
| S3 | Wizard type values don't match codebase | **Resolved** — §5.4 uses `social | tutorial` for Quick mode; §10.1 uses `social | tutorial`; Brand/Film get separate inline picker (§10.2). No longer conflates type and pipeline mode. | Correct. |
| S4 | `durationTier` compute timing | **Partially resolved** — §8.1 two-pass model implies `durationTier` is output of segment planner, but §5.2 shows it on the scene shape without specifying who writes it or when | See carry-over CO1 below. |
| S5 | Edit cascades don't account for multi-speaker `withinSceneStartMs` shifts | **Not resolved** — §15 references v1 §14, but the multi-line intra-scene timing recomputation is still not specified | See NC5 below. |
| S6 | `subStyle` vs `finalScript.visualStyle` reconciliation | **Resolved** — §5.3 says `finalScript.visualStyle` carries from wizard; §10 + §11 show it writes to `createJobState.subStyle` at pick time. Style gate skip detection (§11.3) checks `createJobState.subStyle`, making it the single source of truth. | Clear enough. The implied rule (subStyle is SSOT after set) should be stated explicitly but the design is sound. |
| M1 | `canGenerateVideos()` replacement | **Not resolved** — §17.1 says drift gate is replaced by "per-scene tier-fit check" but doesn't specify the function or its interface | See NM1 below. |
| M2 | MediaPipe face-position clustering algorithm | **Not resolved** — §13.2 says "Same as v1 §12.2" which was also unspecified | See NM2 below. |
| M3 | N audio rows performance | **Not resolved** — §14 says "Same as v1 §13" | Minor, not blocking. |
| M4 | Gemini split-prompt cost estimate | **Resolved** — §8.4 specifies gemini-2.5-flash and ~$0.001 per scene with token count rationale | Acceptable. |
| M5 | `degraded-mode-banner` naming | **Resolved** — §17.1 uses the term generically (not as a CSS class name), which is fine for a plan document. Actual class name will be matched at implementation time. | Fix verified. |
| M6 | No "narration" mode in `flowStyles` | **Not resolved** — §9.1 `flowStyles` still only defines `film` and `brand`. No narration entry. | See NM3 below. |
| M7 | New framing prompt templates missing | **Not resolved** — §12.5 still doesn't specify FRAMING_PROMPTS templates for `two-shot-medium`, `two-shot-wide`, `over-shoulder-back-listening` | See NM4 below. |
| M8 | New session cleanup of `subStyle` | **Not resolved** — No spec for clearing `createJobState.subStyle` / `brainstormState.visualStyle` on "New Session" | Minor, but will cause stale-style bugs. |
| M9 | `croppedTailSec` consumer undefined | **Not resolved** — §5.2 defines it but no consumer is specified | See NM5 below. |
| X1 | Audio-rehearsal-plan depends on `dialogue` (singular) | **Implicitly resolved** — Phase 2b reader migration (§6.4) lists `buildAudioSection` and `_regenSceneAudio` as migration targets. But sibling plan docs are not called out for update. | See NX1 below. |
| X2 | Voice-and-lipsync-plan has 9 framings, this plan adds 3 | **Not resolved** — No mention of updating voice-and-lipsync-plan | See NX2 below. |
| X3 | Voice-and-lipsync-plan non-goal contradicts multi-speaker lip sync | **Not resolved** — No mention of updating voice-and-lipsync-plan's non-goals | See NX2 below. |
| X4 | Audio-input-plan writes `scene.dialogue` (singular) | **Partially resolved** — §6.3 says audio input "already produces `dialogueLines[]`" per audio-input-plan §9.1-9.2. But audio-input-plan itself still shows `scene.dialogue` in its data model. | Sibling plan needs update. |
| P1 | Phase 2 is lynchpin, needs sub-phasing | **Resolved** — §6.1 splits into 2a/2b with explicit writer/reader migration, shim, integration tests, feature flag | Well designed. |
| P2 | Phases 7-9 sequential dependency | **Resolved** — §19 marks Phase 8 → Phase 10 as sequential (v2 fix #13) | Correct. |

**Scorecard:** 11/14 fully resolved, 3 partially resolved, 5 not resolved (2 of which were "same as v1" carry-forwards), ~9 minor items with mixed resolution.

---

## Part 2: Carry-Over Issues (Partially Fixed)

### CO1. `scene.duration` has no shim — 7+ reader sites will break during Phase 2a

The v1 audit flagged that `scene.duration` is read by 7+ code paths. The v2 plan's `Object.defineProperty` shim covers `scene.dialogue` → `scene.dialogueLines[]` but does NOT cover `scene.duration` → `scene.durationSec + scene.durationTier`.

§17.2 explicitly removes `scene.duration` after Phase 2b. But during Phase 2a, new fields (`durationSec`, `durationTier`, `segmentPlan`) are added while old readers still access `scene.duration`. The plan doesn't specify whether `scene.duration` is kept as a derived field during 2a or removed immediately.

Additionally, `scene.audioActualDuration` (from audio-rehearsal-plan §5.1) is the canonical TTS output duration. The v2 planner's `audioMs` parameter in pass 2 presumably uses this value, but the plan says:

```
audioMs,  // null in pass 1 (use scene.durationSec * 1000)
```

This doesn't explicitly say what `audioMs` is in pass 2. It should be `scene.audioActualDuration * 1000`, not `scene.durationSec * 1000`.

**Fix:** Add a `scene.duration` shim similar to `scene.dialogue`:
```js
Object.defineProperty(scene, 'duration', {
  get() { return this.durationSec ?? this.audioActualDuration; },
  set(v) { this.durationSec = v; },
});
```

And in §8.2, explicitly state: "Pass 2 audioMs = scene.audioActualDuration × 1000 (canonical TTS-computed duration in seconds). scene.durationSec is the agent's pre-TTS estimate and is NOT used in pass 2."

---

### CO2. `isVoiceOver === false` speakers MUST be in `visualSubjectIds` — hard constraint still not specified

§12.3 says the validator "auto-corrects `isVoiceOver` inconsistencies" and §11.3 (v1) listed checks. But the critical invariant is still not stated as a hard rule:

> If `dialogueLines[i].isVoiceOver === false`, then `dialogueLines[i].speakerCharacterId` MUST be in `scene.visualSubjectIds`.

Without this constraint, the agent can emit a scene where Joe speaks on-screen (`isVoiceOver: false`) but `visualSubjectIds: ['char_maya']` (missing Joe). The current validator language says it "auto-corrects" but doesn't specify the correction direction: does it flip `isVoiceOver` to `true` (demoting Joe to VO), or add Joe to `visualSubjectIds` (promoting him to visible)?

The correct fix is: **if a speaker has `isVoiceOver: false` but is not in `visualSubjectIds`, flip `isVoiceOver` to `true`** (the speaker is treated as off-screen). This is safer than mutating `visualSubjectIds` because adding a character to `visualSubjectIds` changes the image composition.

**Fix:** Add to §12.3: "Invariant: if `dialogueLines[i].isVoiceOver === false`, then `dialogueLines[i].speakerCharacterId ∈ scene.visualSubjectIds`. Violation → flip `isVoiceOver` to `true` and log. This is the safe direction: don't mutate visual composition to fix a data inconsistency."

---

### CO3. `continuation.mode` enum still includes 3 unimplemented modes

§5.1 and §7.1 still list `continuation.mode:: 'last-frame-i2v' | 'last-frames-conditioning' | 'embedding' | 'none'`. Only `last-frame-i2v` is implemented. The v1 audit recommended removing the others as YAGNI.

The argument for keeping them is "forward compatibility" — future providers may support these. But having unimplemented enum values in the config is misleading. Code that reads `continuation.mode` must handle cases that will never occur in v1, adding dead branches.

**Fix:** Replace the enum with a single boolean: `continuation.supported: true | false`. If a future provider needs `last-frames-conditioning`, add a `continuation.mode` field at that time with the exact semantics. The `mode` field is premature abstraction.

---

## Part 3: New Critical Issues

### NC1. The 10.0s boundary produces a worse plan than a 9.9s input — algorithmic contradiction

The edge case table in §8.3 shows:

| Audio | Plan | Cropped |
|-------|------|---------|
| 9.5s | [5s, 5s] | 0.5s |
| 10.0s | [5s, 5s] | 0.0s |
| 10.5s | [10s, 5s] | 4.5s |

At 10.0s, the algorithm splits into 5+5 (because `10.0 > splitThreshold=7.0` → `splittable=true`). But a single 10s tier is a *perfect fit* — zero cropped tail, one generation call instead of two, half the cost, no stitching needed.

The pseudocode checks `splittable && fitsTier > provider.durationTiers[0]`:
- `remainingMs/1000 = 10.0`
- `fitsTier = pickSmallestTierAbove([5,10], 10.0) = 10` (exact match)
- `fitsTier > provider.durationTiers[0]` → `10 > 5` → **true**
- `splittable` → `10.0 > 7.0` → **true**
- Both true → **split** to [5,5]

This is wrong. When a single tier fits *exactly*, there's zero reason to split. The split is meant for mid-tier audio where splitting improves prompt-pacing. At exactly 10.0s, the single tier is optimal.

More critically, there's a cost discontinuity: audio at 9.9s costs $0.40 (two clips), audio at 10.1s costs $0.60 (10s + 5s clips), but audio at 10.0s should cost $0.40 (one 10s clip). Instead the algorithm yields two $0.20 clips = $0.40, which is the same cost but with an unnecessary stitch. The real problem is at 10.1s where cost jumps to $0.60 with 4.9s of cropped tail.

**Fix:** Add an exact-fit check before the split decision:
```
if (isFirst) {
  const exactFit = findExactTierMatch(provider.durationTiers, remainingMs / 1000);
  if (exactFit) {
    tier = exactFit;   // perfect fit, no split, no waste
  } else {
    const fitsTier = pickSmallestTierAbove(provider.durationTiers, remainingMs / 1000);
    const splittable = remainingMs / 1000 > splitThreshold;
    if (splittable && fitsTier > provider.durationTiers[0]) {
      tier = provider.durationTiers[0];
    } else {
      tier = fitsTier;
    }
  }
}
```

An "exact fit" means `remainingMs/1000` is within a small epsilon (say 0.1s) of any tier value. This handles 9.95s–10.05s as a single 10s clip.

---

### NC2. `durationTier` field on the scene shape is semantically ambiguous — it should be `totalGenSec` instead

§5.2 defines `scene.durationTier: 10` described as "mechanical: provider tier covering segments." But a segment plan of `[5s, 5s]` doesn't have a single "tier" — it has two segments at two different tiers. The field name `durationTier` implies a single tier covers the scene, which is only true for single-segment scenes.

For multi-segment scenes, the relevant "mechanical" value is `totalGenSec` (total seconds of video that will be generated), which is already returned by `planSegments()`. The `durationTier` field is neither necessary (the planner's output already contains all tier information in `segmentPlan[]`) nor sufficient (for multi-segment scenes, a single tier value is misleading).

**Fix:** Either:
(a) Remove `durationTier` from the scene shape entirely — it's redundant with `segmentPlan[].durationSec` values, or  
(b) Rename it to `totalGenSec` and compute it as `segmentPlan.reduce((s,x) => s + x.durationSec, 0)`.

Option (a) is cleaner. Code that needs the total generation duration can derive it from `segmentPlan`.

---

### NC3. `visualTreatment` decomposition breaks the single-pick UX for legacy presets that combine both axes

§9.3 introduces `visualTreatment` as an orthogonal axis from `subStyle`. The `STYLE_PRESETS` migration table (§17.3) maps old presets like `cinematic` → `(film/drama, photorealistic)` and `anime` → `(preserves sub-style, anime treatment)`.

But the style picker UI (§10.3) asks the user to pick **both** a sub-style and a treatment. For a new user, the mental model of "drama + watercolor" is hard to parse — most users think in terms of the combined aesthetic ("I want it to look like a watercolor film"), not the decomposition.

More importantly, the migration for group 3 (treatment-only presets like `watercolor`, `anime`, etc.) says "sub-style defaults to mode's most generic preset." This means a legacy `anime` project gets auto-mapped to `(film/drama, anime)` — but the original usage might have been in a brand context. There's no way to know the correct default sub-style.

**This isn't necessarily wrong** — the user reviews on first edit — but the plan should acknowledge that the two-axis decomposition is a UX change that requires user education, not just a silent migration.

**Fix:** The style picker UI should offer **combined presets** as the primary interaction (e.g., "Anime Drama", "Watercolor Romance", "Photorealistic Luxury") with an "Advanced" disclosure that exposes the two axes independently. This matches user mental models while preserving the orthogonal decomposition under the hood. The migration table's group-3 entries are fine but the default sub-style should be derived from the project's `videoType`, not hardcoded to `film/drama`.

---

### NC4. Phase 3 (storyboard agent rewrite) depends on Phase 2a but produces `dialogueLines[]` output that requires Phase 2a's writer migration — circular dependency in Phase ordering

§19 shows Phase 3 depending on Phase 2a. But Phase 3 (storyboard agent prompt rewrite) changes the agent to emit `dialogueLines[]` instead of single `dialogue`. The agent's JSON output handler is a **writer** that constructs scene objects.

§6.3 lists "Storyboard agent JSON output → scene constructor" as a Phase 2a writer migration target. But §6.3 also says this migration "populates from agent's new `dialogueLines[]` schema **once the agent prompt rewrite (Phase 3) lands**."

This is circular:
- Phase 2a migrates writers to produce `dialogueLines[]`. But the storyboard agent still produces single `dialogue` until Phase 3 rewrites the prompt.
- Phase 3 rewrites the prompt to emit `dialogueLines[]`. But Phase 3 depends on Phase 2a being done.

The resolution is that during Phase 2a, the agent still emits single `dialogue`, and the scene constructor writes it through the shim's `set` path → `legacyDialogueToLine()` → `dialogueLines = [line]`. Phase 3 then changes the agent to emit `dialogueLines[]` directly, and the scene constructor is already expecting it.

**But this isn't stated explicitly.** The plan should clarify that Phase 2a's storyboard-agent writer migration is the *scene constructor* (the code that takes agent JSON and builds scene objects), not the agent itself. The agent's prompt change is Phase 3. During 2a, the constructor uses the shim's `set` path; after Phase 3, the constructor reads `dialogueLines[]` from the agent directly.

**Fix:** Add to §6.3 a clarification: "Phase 2a's storyboard-agent writer migration is the **scene constructor** that parses agent JSON, not the agent prompt itself. During Phase 2a, the agent still emits single `dialogue`; the constructor's `set` path via shim translates it. Phase 3 changes the agent prompt to emit `dialogueLines[]` natively; the constructor already handles both shapes."

---

## Part 4: New Significant Issues

### NS1. `computeNarrationMode` treats "no dialogue at all" as `'voice-over'` — but b-roll scenes should not force VO shortcut

§13.4:
```js
if (!hasOnScreen && !hasVoiceOver) return 'voice-over';   // no dialogue at all = treat as VO (b-roll)
```

A project with zero dialogue (pure b-roll, no narrator) returns `'voice-over'`, which triggers the VO shortcut (skip lip sync, hide lip-sync UI). This is coincidentally correct — pure b-roll indeed needs no lip sync. But the semantic is wrong: a project with zero dialogue is not "voice-over," it's "no dialogue." If the VO shortcut hides relevant UI (e.g., a "this scene has no audio" indicator), this could be confusing.

**Fix:** Add a fourth enum value: `'none'` (no dialogue at all). The VO shortcut applies to both `'voice-over'` and `'none'`. UI distinguishes: "voice-over" shows the VO indicator; "none" shows "b-roll, no audio."

---

### NS2. `segmentPlanPass` field can desync from actual `segmentPlan` content

§5.2 adds `segmentPlanPass: 'estimate' | 'actual'` to track which planner pass produced the current `segmentPlan`. But consider this sequence:

1. Planner runs pass 1 → `segmentPlanPass = 'estimate'`, plan says [5s]
2. TTS finishes → planner runs pass 2 → `segmentPlanPass = 'actual'`, plan says [10s] (tier promotion)
3. User edits dialogue text → TTS re-runs → but does the planner get called again for pass 2?

The plan says pass 2 runs "at audio rehearsal lock time." But if the user edits individual lines (Class A), TTS runs per-line, and the segment planner may not re-run until the next explicit rehearsal lock. Between edits, `segmentPlanPass` says `'actual'` but the actual audio duration has changed from when pass 2 ran.

**Fix:** Class A line edits that change audio duration should set `segmentPlanPass = 'stale'` (a new enum value), indicating the plan needs re-computation at the next rehearsal lock. Phase 2 of the planner re-runs on lock and resets to `'actual'`.

---

### NS3. The `Object.defineProperty` shim's `get` returns `dialogueLines[0]` — this silently drops `dialogueLines[1+]` for legacy readers

§6.2:
```js
get() {
  return (this.dialogueLines && this.dialogueLines[0]) || null;
}
```

During Phase 2a, any legacy reader that reads `scene.dialogue` gets only the first dialogue line. For single-speaker scenes (the common case today), this is correct. But after Phase 3 (storyboard agent emits `dialogueLines[]`), scenes can have multiple lines. A legacy reader that hasn't been migrated yet will only see the first line — it won't crash, but it will produce incorrect behavior (missing the second speaker's audio/rendering).

The plan acknowledges this by saying Phase 2b migrates all readers. But between Phase 3 (agent emits multi-line) and Phase 2b completion (all readers migrated), there's a window where some readers will silently see incorrect data.

**Fix:** Add a `console.warn` in the shim's getter when `dialogueLines.length > 1`: `"scene.dialogue shim: dropping ${dialogueLines.length - 1} lines for legacy reader at [callSite]. Migrate to dialogueLines[]."` This makes the data loss visible during development without breaking production behavior.

---

### NS4. Brand/Film inline style picker (§10.6) inserts before chat but `brainstormState.visualStyle` isn't consumed by the chat AI system prompt construction

§10.5 says the chat AI system prompt receives the locked frame (style+treatment). §10.6 says Brand/Film set `brainstormState.visualStyle` and `brainstormState.visualTreatment`. But the chat AI system prompt constructor likely reads from `createJobState.subStyle` (per §5.1), not `brainstormState.visualStyle`.

The plan needs to specify when `brainstormState.visualStyle` writes to `createJobState.subStyle`. Currently this is implied (the style gate writes to `createJobState.subStyle` per §11.3), but for Brand/Film, the style picker writes to `brainstormState` — the bridge to `createJobState` isn't specified.

**Fix:** Add: "When the Brand/Film inline style picker confirms, or when brainstorm finalise runs, `brainstormState.visualStyle` and `brainstormState.visualTreatment` are written to `createJobState.subStyle` and `createJobState.visualTreatment` respectively. The chat AI system prompt reads from `createJobState`, not `brainstormState`."

---

### NS5. Edit cascades: `audioRegions[]` and `withinSceneStartMs/EndMs` recomputation is still not specified

§15 says "Same as v1 §14" + tier promotion flag. V1 §14.1 says "Recompute scene audio total" for line edits but doesn't specify recomputation of `audioRegions[]` or `withinSceneStartMs/EndMs`.

In a multi-speaker scene, editing line 0's text may change its TTS duration from 1.2s to 2.0s. This shifts line 1's `withinSceneStartMs` by 800ms and changes `audioRegions[]`. The segment planner's pass 2 needs to re-run to update `croppedTailSec` and potentially the segment count.

Without this specification, developers implementing edit cascades won't know what to recompute.

**Fix:** Add to §15: "Class A line edits that change audio duration: in addition to re-TTS, recompute (a) `withinSceneStartMs/EndMs` for all lines in the scene from the new TTS timing, (b) `audioRegions[]` from the new timing, (c) `segmentPlanPass` set to `'stale'`. Segment planner pass 2 re-runs at next rehearsal lock."

---

## Part 5: New Minor Concerns

### NM1. `canGenerateVideos()` replacement not specified

§17.1 says the 3% drift gate in `canGenerateVideos()` is replaced by "a per-scene tier-fit check." But this check is not defined anywhere. What constitutes "tier-fit"? Is it `segmentPlanPass === 'actual'` for all scenes? Or `segmentPlanPass !== 'stale'`? The interface and behavior of the new gate need to be specified, since it's the primary safety gate before expensive video generation.

### NM2. MediaPipe Tier 1 upgrade still not specified

§13.2 says "Same as v1 §12.2" which described position-based clustering but gave no algorithm. For multi-speaker two-shot scenes, this is load-bearing. Without a spec, implementation will be ad-hoc.

### NM3. `flowStyles` omits "narration" videoType

§9.1 `flowStyles` only defines `film` and `brand`. The codebase has `videoType: 'narration'` as a valid value. Narration-mode projects (talking-head with narrator VO) have different cinematic defaults than film. This omission means narration projects get no flow-style guidance.

### NM4. New framing prompt templates still missing

§12.5 adds `two-shot-medium`, `two-shot-wide`, `over-shoulder-back-listening` but doesn't specify their `FRAMING_PROMPTS` templates or `speakerVisible` derivation rules. For two-shot framings, `speakerVisible` needs to return true for *both* characters, which changes the existing binary logic.

### NM5. `croppedTailSec` still has no listed consumer

§5.2 defines `croppedTailSec: 3` but no code path is listed that reads it. Likely consumers: video playback end-time trimming, subtitle alignment stop-point, export timeline duration. The plan should specify at least one consumer or remove the field.

### NM6. `visualTreatment` is project-level only — no per-scene override

§9.5 says "Treatment is project-level only; per-scene treatment override is v2 nice-to-have." This means a flashback scene within a drama can't switch from photorealistic to watercolor. This is a real creative need (dream sequences, flashbacks, stylistic breaks). Defer is fine, but the plan should acknowledge this in the non-goals.

---

## Part 6: Cross-Plan Conflicts (Updated)

### NX1. Audio-rehearsal-plan still references `scene.dialogue` (singular) — needs explicit update callout

The v2 plan's Phase 2b reader migration (§6.4) lists audio-rehearsal reader sites. But the audio-rehearsal-plan *document itself* still uses `scene.dialogue` in its data model (§5.1). The cinematic v2 plan doesn't explicitly call out that sibling plan *documents* need updating, only that *code* needs migrating.

§Appendix A says "(Same as v1 Appendix A.)" which is a lazy copy. The cross-plan touchpoints should be updated to reflect v2's changes (shim, two-pass planner, visualTreatment decomposition).

### NX2. Voice-and-lipsync-plan non-goals + framing list still stale

Same as v1 audit X2+X3. The v2 plan doesn't mention updating voice-and-lipsync-plan. This is still needed:
1. Update non-goals to remove "Not multi-face-in-one-clip" (contradicted by §13.1).
2. Add 3 new framings to the `FRAMING_PROMPTS` list (§9.1 of that plan).

---

## Part 7: Summary Table

| Category | Count | Severity |
|----------|-------|----------|
| Carry-over issues | 3 | CO1=high, CO2=medium, CO3=low |
| New critical issues | 4 | Must fix before implementation |
| New significant issues | 5 | Must address in plan revision |
| New minor concerns | 6 | Should address, not blocking |
| Cross-plan conflicts (unresolved) | 2 | Requires sibling plan document updates |

---

## Part 8: Prioritized Action Items

1. **NC1 (Critical):** Fix the 10.0s exact-fit boundary in §8.3 tier-selection algorithm. Add `findExactTierMatch` before the split decision.
2. **CO1 (High):** Add `scene.duration` Object.defineProperty shim alongside the `scene.dialogue` shim. Explicitly state pass 2 `audioMs = audioActualDuration * 1000`.
3. **NC4 (Critical):** Clarify that Phase 2a's storyboard-agent writer migration is the scene constructor, not the agent itself. The agent prompt change is Phase 3.
4. **CO2 (Medium):** Add hard validator invariant: `isVoiceOver === false` → speaker MUST be in `visualSubjectIds`. Violation → flip to `true`.
5. **NC2 (Critical):** Remove `durationTier` from scene shape (redundant with `segmentPlan[]`), or rename to `totalGenSec`.
6. **NS3 (Significant):** Add `console.warn` to dialogue shim getter when `dialogueLines.length > 1` to flag data loss during migration window.
7. **NS4 (Significant):** Specify write-through from `brainstormState.visualStyle` → `createJobState.subStyle` at confirm time.
8. **NS5 (Significant):** Specify `audioRegions[]` + `withinSceneStartMs/EndMs` recomputation for Class A line edits that change duration.
9. **NS2 (Significant):** Add `segmentPlanPass: 'stale'` for when audio changes after pass 2.
10. **NS1 (Significant):** Add `'none'` to `narrationMode` enum for zero-dialogue projects.
11. **CO3 (Low):** Replace `continuation.mode` enum with `continuation.supported: boolean` for v1.
12. **NX1+NX2 (Cross-plan):** Update Appendix A to explicitly call out sibling plan document revisions needed.