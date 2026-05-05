# Audit Pass 2: Input Formats Plan

Auditor: Kilo | Date: 2026-05-05 | Status: post-fix review
Scope: remaining issues after prior audit fixes were applied

---

## A. Remaining Issues

### A1. `format` union type missing `'audio'` value

**Location:** §5.1 line 85

```js
format: 'prose' | 'screenplay',          // detected at Stage 1
```

The audio-input-plan (§6.1 line 150) extends this to `'audio'`. The type definition here is stale. While input-formats-plan scopes itself to text input, the `inputDoc` shape is shared across formats per the cross-plan contract. A downstream type-checker or switch statement that only handles `'prose' | 'screenplay'` would fail silently for audio projects.

**Fix:** Update to:
```js
format: 'prose' | 'screenplay' | 'audio',  // 'audio' populated by audio-input-plan
```

Or add a comment: `// 'audio' added by audio-input-plan.md for audio-input projects`

---

### A2. `speakerAttributionScore` defaults to `1.0` when no dialogue lines exist — inconsistent with null-exclusion pattern

**Location:** §9 line 408

```js
const speakerAttributionScore = dialogueLineCount > 0 ? highConfDialogues / dialogueLineCount : 1.0;
```

Contrast with `moodScore` at line 412:
```js
const moodScore = cuedDialogues.length > 0 ? highConfMoods / cuedDialogues.length : null;
```

When a category has no data, the patterns diverge:
- `moodScore` → `null` (excluded from overall via dynamic weight redistribution)
- `speakerAttributionScore` → `1.0` (perfect score)

A document with zero dialogue lines would get a perfect speaker attribution score, which is semantically wrong. Per the skip-when-not-needed rule (§9 lines 394–398), categories without applicable data should be excluded (`null`), not given a free `1.0`.

**Fix:** Change line 408 to:
```js
const speakerAttributionScore = dialogueLineCount > 0 ? highConfDialogues / dialogueLineCount : null;
```

This makes the pattern consistent and prevents gaming the score with empty inputs.

---

### A3. Division-by-zero risk if all categories are null

**Location:** §9 lines 426–433

```js
const activeWeightSum = Object.entries(activeCategories)
  .filter(([_, score]) => score !== null)
  .reduce((sum, [k]) => sum + weights[k], 0);
let overall = 0;
for (const [k, score] of Object.entries(activeCategories)) {
  if (score === null) continue;
  overall += score * (weights[k] / activeWeightSum);
}
```

If all three categories are `null`, `activeWeightSum` is `0`, and line 432 divides by zero. Today this cannot happen because `speakerAttributionScore` falls back to `1.0` (see A2). But if A2 is fixed, a prose document with zero dialogue lines and zero parentheticals would produce `activeWeightSum === 0`.

**Fix:** Add a guard:
```js
if (activeWeightSum === 0) {
  // No categories have data — return null overall (degenerate case)
  return { overall: null, perCategory: { ... }, reviewRequired: true, reformatSuggested: true, lowConfidenceItems: [] };
}
```

---

### A4. Reformat prompt produces free-text Fountain — no markdown-fence stripping or structured-output fallback

**Location:** §10.3 lines 557–589

The prompt at line 584 requests:
```
- Output ONLY the Fountain-formatted screenplay. No commentary, no preamble, no markdown fencing.
```

LLMs frequently ignore this instruction and wrap output in markdown code fences (` ```fountain ... ``` `) or add preamble text. The plan has:
- No post-processing step to strip fences/preamble before `fountain.parse()`
- No structured-output JSON mode (`responseMimeType: 'application/json'`) to enforce format
- Only a parse-confidence fallback (line 593: "if re-parses with <0.5, surface error") — not a format-compliance check

If Gemini wraps the output in fences, `fountain.parse()` would likely fail or produce garbage, triggering the loop-prevention error ("Reformat didn't improve parseability") rather than graceful recovery.

**Fix:** Add a pre-parse sanitization step:
```js
function sanitizeFountainOutput(raw) {
  // Strip markdown code fences
  let text = raw.replace(/^```(?:fountain)?\n?/i, '').replace(/\n?```$/m, '');
  // Strip leading/trailing commentary lines (non-Fountain patterns)
  text = text.replace(/^(?!INT\.|EXT\.|[A-Z]{2,}|FADE|CUT|[^\n]*:)\n/gm, '');
  return text.trim();
}
```

Or use structured output with a JSON schema: `{ "fountainText": "string" }`.

---

### A5. Prose parser does not handle multi-line dialogue

**Location:** §7.1 lines 219–287

The parser iterates line-by-line (`rawText.split('\n')` at line 220). Three issues:

1. **Speaker-tagged dialogue (line 234):**
   ```js
   const speakerTagMatch = trimmed.match(/^([A-Z][A-Za-z0-9 _-]{0,30}):\s+(.+)$/);
   ```
   Captures only text on a single line. A multi-line speech:
   ```
   Maya: I really wish you'd
   follow through on things.
   ```
   Would produce two entries: a dialogue line with only "I really wish you'd" and an action line for "follow through on things."

2. **Quoted dialogue (lines 250, 271):**
   ```js
   const quotedMatch = trimmed.match(/"([^"]+)"/);
   ```
   The regex `[^"]+` does not match across line breaks. A quote spanning multiple lines would not be captured.

3. **No continuation logic:** No mechanism for detecting that an action line is actually a continuation of the previous speaker's dialogue.

**Fix:** Option A — add continuation detection:
- After emitting a dialogue line, check if the next line starts with lowercase or is clearly a sentence fragment
- If so, append to the previous dialogue line instead of creating an action line

Option B — multi-line quote regex:
```js
const quotedMatch = trimmed.match(/"([\s\S]*?)"/);  // [\s\S] matches across lines
```

Document the chosen approach explicitly.

---

### A6. No input length limit for very long screenplays

**Location:** §16 Risk #2 (line 759) mentions chunking at >50KB as mitigation, but:
- No hard cap on `rawText` length defined in Stage 1 or edge cases
- No UI behavior for oversized paste events
- The 50KB chunking threshold is a risk note, not an engineering spec — not in any Stage, acceptance criterion, or EC entry
- No cost projection for 100+ page screenplays (could exceed $0.10 budget claim)

**Fix:** Add to §14 Edge Cases:

| ID | Case | Behavior |
|---|---|---|
| EC-FD-08 | Input exceeds 100,000 characters (~30KB) | Surface warning: "Large input may take longer to parse. Consider splitting into multiple projects." Allow proceed. |
| EC-FD-09 | Input exceeds 500,000 characters (~150KB) | Block with hard cap: "Input too large. Stori supports up to 500,000 characters. Split your input." |

And convert the 50KB chunking note into an explicit implementation in §8.1/§8.2:
```js
const CHUNK_THRESHOLD_KB = 50;
if (new Blob([rawText]).size > CHUNK_THRESHOLD_KB * 1024) {
  // Chunk AI calls by scene groupings (5-10 scenes per call)
}
```

---

## B. Minor Issues

### B1. Fountain-js version pin mentioned but not exact

**Location:** §7.2 line 310

```
**Pinning:** `fountain-js@1.2.6` (verify latest stable 1.x at implementation time and pin)
```

The "verify at implementation time" instruction creates ambiguity. The plan should lock an exact version or provide a specific commit hash. "Verify later" is a todo, not a spec.

**Fix:** Either lock `fountain-js@1.2.6` definitively, or provide a fallback version and a verification test: "If fountain-js@1.2.6 fails to parse the Fountain spec compliance test suite (see test fixtures), use fallback version X."

---

### B2. Dynamic weight redistribution comment mentions `perCategory.sceneBreaks` but field is `sceneHeadings`

**Location:** §5.3 lines 142–146

```js
perCategory: {
  sceneBreaks: 1.0,                     // screenplay = 1.0; prose = inferred ~0.6
  speakerAttribution: 0.85,             
  moodClassification: 0.92,             
  sceneHeadings: 1.0,                   // screenplay: 1.0; prose: n/a
},
```

`sceneBreaks` and `sceneHeadings` are both listed, but the aggregation function (§9) only computes `sceneHeadingScore` and assigns it to both keys. This is confusing — two category labels pointing to the same value with different semantics.

**Fix:** Remove `sceneBreaks` from `perCategory` in the data model, or explicitly state that `sceneBreaks` and `sceneHeadings` are derived from the same source and both reflect scene-heading detection quality.

---

## Summary

| # | Issue | Severity |
|---|---|---|
| A1 | `format` missing `'audio'` in type union | Medium |
| A2 | `speakerAttributionScore` defaults to 1.0 when empty (inconsistent with null pattern) | Medium |
| A3 | Division-by-zero if all categories null | Low (blocked by A2) → Medium (if A2 fixed) |
| A4 | Reformat prompt has no fence-stripping or structured output | High |
| A5 | Prose parser doesn't handle multi-line dialogue | High |
| A6 | No input length cap; 50KB chunking is a risk note not a spec | Medium |
| B1 | fountain-js version "verify at implementation time" | Low |
| B2 | `sceneBreaks` vs `sceneHeadings` confusion in perCategory | Low |

**Must-fix before implementation:** A4 (reformat fence handling), A5 (multi-line dialogue). Others are medium priority.