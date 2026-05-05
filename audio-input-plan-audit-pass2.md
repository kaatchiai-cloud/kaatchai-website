# Audit Pass 2: Audio Input Plan

Auditor: Kilo | Date: 2026-05-05 | Status: post-fix review
Scope: remaining issues after prior audit fixes were applied

---

## A. Remaining Issues

### A1. Leftover reference to `audioSegmentStart/End` without `Ms` suffix

**Location:** §9.1 line 522 (prose between code blocks)

```
Each `dialogueLines[i]` references a SLICE of the master buffer at `[audioSegmentStart, audioSegmentEnd]`.
```

The canonical field names defined in the schema (§6.2 lines 230–231) and used in the code (lines 498–499, 513) are `audioSegmentStartMs` and `audioSegmentEndMs`. This prose reference uses the old non-suffixed names.

**Fix:** Change line 522 to:
```
Each `dialogueLines[i]` references a SLICE of the master buffer at `[audioSegmentStartMs, audioSegmentEndMs]`.
```

---

### A2. `computeDiarizationConfidence` calls undefined helper functions

**Location:** §8.1a lines 422, 425

```js
const singleWordSegments = countSingleWordSegments(alignedWords);
// ...
const switchesPerSec = countSpeakerSwitches(alignedWords) / Math.max(0.001, totalAudioSec);
```

These two helper functions are called but never defined anywhere in the document. An implementer would have no specification for:
- What `countSingleWordSegments(alignedWords)` returns — presumably a count of segments where a speaker speaks only one word, but "segment" is not defined
- What `countSpeakerSwitches(alignedWords)` returns — presumably a count of points where `word[i].speaker_id !== word[i-1].speaker_id`

**Fix:** Define the helper functions inline:

```js
function countSingleWordSegments(alignedWords) {
  let count = 0;
  let currentSpeaker = null;
  let wordCount = 0;
  for (const word of alignedWords) {
    if (word.speaker_id !== currentSpeaker) {
      if (wordCount === 1) count++;
      currentSpeaker = word.speaker_id;
      wordCount = 1;
    } else {
      wordCount++;
    }
  }
  if (wordCount === 1) count++;
  return count;
}

function countSpeakerSwitches(alignedWords) {
  let switches = 0;
  for (let i = 1; i < alignedWords.length; i++) {
    if (alignedWords[i].speaker_id !== alignedWords[i - 1].speaker_id) {
      switches++;
    }
  }
  return switches;
}
```

---

### A3. `inferSettingAndActionsFromDialogue` uses `geminiKey` not passed as parameter

**Location:** §9.1a lines 529 and 553

**Function signature (line 529):**
```js
async function inferSettingAndActionsFromDialogue(dialogueLines)
```

**Usage (line 553):**
```js
}, geminiKey);
```

`geminiKey` is neither a parameter nor declared within the function. This would cause a ReferenceError at runtime.

**Fix:** Update the function signature:
```js
async function inferSettingAndActionsFromDialogue(dialogueLines, geminiKey)
```

---

### A4. Schema template shows static `isVoiceOver: false` without indicating dynamic computation

**Location:** §6.2 line 218

```js
isVoiceOver: false,
```

This is in the unified schema template showing a sample `dialogueLines[]` entry. The value `false` is correct for this sample, but the schema comment doesn't indicate that `isVoiceOver` is dynamically computed based on `charId === 'narrator'`. The actual code (§9.1 line 486, §9.2 lines 591, 608) correctly computes it dynamically. A developer implementing a consumer of this schema might assume `isVoiceOver` is always `false` for audio input.

**Fix:** Add a comment in the schema template:
```js
isVoiceOver: false,              // dynamically set: true when speaker is narrator
```

---

## B. Minor Issues

### B1. EC-DI-10 renumbered from EC-AU-08 but text still references old numbering

**Location:** §12 line 753

```
| EC-DI-10 | Tab close during Scribe processing | Per audit fix C6: persist upload + partial state to IDB when Scribe call begins. On reload, if Scribe wasn't completed, re-trigger from scratch (results are deterministic; cost charged once on success only). [Renumbered from EC-AU-08 in pass-3 — sits in the diarization section, not upload.] |
```

The renumbering comment is helpful but the cross-references in the audit section may still point to EC-AU-08. Verify all internal references are updated.

---

### B2. `computeDiarizationConfidence` stability score is hardcoded placeholder

**Location:** §8.1a line 428

```js
const stabilityScore = 1.0;   // TBD: cross-window check
```

The `stabilityScore` is hardcoded to `1.0` with a "TBD" comment. This means 10% of the confidence score is always perfect regardless of actual diarization quality. Either implement the cross-window check or remove it from the formula and redistribute weight.

**Fix:** Either:
1. Implement cross-window speaker-label consistency check
2. Redistribute the 0.10 weight to other factors:
```js
return (lengthScore * 0.40) + (thrashScore * 0.40) + (switchScore * 0.20);
```

---

## C. Cross-Plan Consistency

### C1. Input-formats-plan `format` enum doesn't include `'audio'`

**Location:** input-formats-plan §5.1 line 85 only lists `'prose' | 'screenplay'`

Audio-input-plan adds `'audio'` (this plan §6.1 line 150). The type definitions are out of sync.

**Fix:** Update input-formats-plan §5.1 to include `'audio'` in the union type, with a comment that it's populated by the audio-input path.

---

## Summary

| # | Issue | Severity |
|---|---|---|
| A1 | `audioSegmentStart/End` without `Ms` suffix in prose comment | Low (documentation only) |
| A2 | `countSingleWordSegments` and `countSpeakerSwitches` undefined | Medium (implementer would be blocked) |
| A3 | `geminiKey` not passed to `inferSettingAndActionsFromDialogue` | High (runtime error) |
| A4 | `isVoiceOver: false` in schema template misleading | Low (documentation only) |
| B1 | EC renumbering cross-references | Low |
| B2 | `stabilityScore` hardcoded placeholder | Low |
| C1 | Cross-plan `format` enum inconsistency | Medium |

**Must-fix before implementation:** A2 (define helper functions), A3 (add geminiKey parameter). Others are low-priority documentation fixes.