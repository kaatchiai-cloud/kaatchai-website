# Audit Pass 3: Audio Input Plan — Final Review

Auditor: Kilo | Date: 2026-05-05 | Status: final verification
Scope: confirm all prior fixes, check for new issues introduced

---

## Verification: Pass 2 Fixes Applied

| Issue | Status | Location |
|---|---|---|
| A1: `audioSegmentStart/End` without `Ms` suffix in prose comment | ✅ Fixed | §9.1 line 554 — updated to `audioSegmentStartMs/EndMs` |
| A2: `countSingleWordSegments` and `countSpeakerSwitches` undefined | ✅ Fixed | §8.1a lines 437-463 — both functions now defined in full |
| A3: `geminiKey` not passed to `inferSettingAndActionsFromDialogue` | ✅ Fixed | §9.1a line 561 — function signature now includes `geminiKey` parameter |
| A4: `isVoiceOver: false` in schema template misleading | ✅ Fixed | §6.2 line 218 — comment clarifies dynamic computation |
| B1: EC renumbering cross-references | ✅ Fixed | §12 line 753 — note clarifies renumbering; all internal refs use correct IDs |
| B2: `stabilityScore` hardcoded placeholder | ✅ Fixed | §8.1a lines 428-432 — weight redistributed to implemented factors, comment explains v1.5 deferral |
| C1: Cross-plan `format` enum inconsistency | ✅ Fixed | input-formats-plan §5.1 now includes `'audio'` |

---

## Final Review: No Blocking Issues

The plan is complete and ready for implementation. Cross-references are consistent:
- AI-suggest-extras flow (§7) correctly referenced by input-formats-plan EC-RG-02
- TTS skip contract (§9.2) documented for voice-and-lipsync-plan and audio-rehearsal-plan
- Unified schema (§6.2) matches input-formats-plan structure (null fields where not applicable)
- Time units consistent throughout (ms with explicit suffix on all field names)
- Diarization confidence computation fully specified with helper functions
- isVoiceOver computed dynamically in both Mode A (§9.1) and Mode B (§9.2)

---

## Minor Observations (Non-Blocking)

### M1. `videoType` referenced in EC-DI-01 but not defined in input doc

EC-DI-01 (line 776) references `videoType: 'narration' | 'brand' | 'film'` for single-speaker default mapping, but `videoType` is not defined in the `inputDoc` data model (§6.1). It appears to be a project-level setting that exists outside the audio-input scope. Ensure `videoType` is defined in a shared plan (project creation, global job state) and cross-referenced here.

**Low priority.** Can be clarified during implementation.

### M2. `processReTTS` doesn't set `sourceMode` on output lines

In §9.2 `processReTTS` function, the `lines` array built from the for-loop (lines 618-641) doesn't include `sourceMode: 'audio-input'`. The function returns `reTtsResult.dialogueLines` from `castGenerateMultiVoiceAudio` which presumably produces the full `dialogueLines` structure. Verify that the downstream TTS pipeline sets `sourceMode` correctly for Mode B audio-input projects.

**Low priority.** Likely set in `castGenerateMultiVoiceAudio` or post-processing. Verify during implementation.

### M3. `inferSettingAndActionsFromDialogue` return type not specified

§9.1a defines the function and Gemini prompt but doesn't specify the return type shape. The prompt says "Return ONLY JSON" and shows a schema with `segmentIndex`, `lineIndices`, `setting`, `actions`, `atmosphere`. The output mapping comment says "populate `parsed.actionLines[]` and `parsed.sceneHeadings[]`" but doesn't show how the array of segments maps to those fields.

Suggested: add explicit return type:
```js
// Returns: [{ segmentIndex, lineIndices, setting, actions, atmosphere }]
// Map: parsed.actionLines = segments.map(s => ({ text: s.actions, sourceLineNum: null, confidence: 0.7 }))
// Map: parsed.sceneHeadings = segments.map(s => ({ location: s.setting.split(',')[0], timeOfDay: s.setting.split(',')[1]?.trim(), ... }))
```

**Low priority.** Clear enough from context. Can be refined during implementation.

---

## Summary

**Status: Ready for implementation.**

All pass-2 issues have been correctly fixed. The plan is internally consistent, properly cross-references input-formats-plan for shared concepts (AI-suggest-extras, unified schema), handles the audio-specific pipeline stages correctly, and specifies edge cases including AudioContext suspension, ElevenLabs key gating, and speaker overlap handling. The helper functions `countSingleWordSegments` and `countSpeakerSwitches` are now fully defined, eliminating the implementation blocker.