# Input Formats Plan — Prose + Screenplay Parsing with Confidence-Gated Review

Status: design draft, locked decisions, not yet implemented.
Scope: how Stori ingests text input (prose or screenplay), normalizes it into a canonical structured form, gates user review on low-confidence inferences, and feeds the result to the storyboard agent / multi-voice TTS pipeline.

Sibling to [audio-rehearsal-plan.md](audio-rehearsal-plan.md), [voice-and-lipsync-plan.md](voice-and-lipsync-plan.md), and [audio-input-plan.md](audio-input-plan.md). The input-formats layer sits **upstream** of the storyboard agent — it produces the structured `parsed` object that downstream pipelines consume.

---

## 1. Goal

Three user-visible outcomes:

1. **Filmmakers can paste any text input format and Stori parses it correctly.** Free-form prose, screenplay format (Fountain spec), or any mix. No format toggle — Stori detects automatically.
2. **Speaker tagging is preserved when explicit, inferred when implicit.** A screenplay's `MAYA` cue maps directly to character "Maya"; a prose "she said" gets agent-inferred. High-confidence parsing skips review; low-confidence triggers a one-time gate.
3. **Performance cues from screenplay parentheticals (`(angrily)`, `(scoffs)`, `(beat)`) become structured mood data** via AI classification, feeding the mood-selector pre-fill in audio-rehearsal-plan §6.1.

The input is **locked at submission** — users provide input once; no mid-flow format change. Re-input means a new project.

## 2. Non-goals (v1)

- Not a free-form text editor — input is one-time submission, not iterative authoring inside Stori
- Not supporting Stori's own "storyboard format" (`Scene N [4s]` proprietary syntax) — skipped; users either write prose or screenplay
- Not supporting non-English screenplays (fountain-js handles English Fountain spec; multi-language v2)
- Not parsing PDFs, .fountain files, or .fdx — paste-as-text only in v1
- Not preserving screenplay formatting (margins, indentation) in the output — extracted structure is style-agnostic

## 3. Pre-existing primitives reused

- **Storyboard agent** ([js/17c-create-pipeline.js](js/17c-create-pipeline.js)): consumes parsed structure, generates per-scene descriptions + dialogue + framing per voice-and-lipsync-plan §7
- **Bracket-token parser** ([js/17b-create-references.js#L2410](js/17b-create-references.js#L2410)) `castParseBracketTokens`: existing speaker-tag detection on prose; reused for prose-mode parsing
- **MOOD_ENUM** (audio-rehearsal-plan §5.4): 12-value mood taxonomy that performance-cue classification maps to
- **Cast lock pipeline** ([js/17b-create-references.js](js/17b-create-references.js)): existing flow to lock characters before storyboard generation. Input parsing populates `dialogue.speakerCharacterId` based on cast names; new characters detected in input feed the AI-suggest-extras flow per audio-input-plan §7

## 4. Format detection + normalization architecture

Single canonical output format regardless of input. Hybrid pipeline: deterministic-first, AI for gaps, confidence-scored output, user review for low-confidence.

```
   ┌──────────────────────────────────────┐
   │ Stage 1: Format detection             │
   │   regex heuristics (prose | screenplay)│
   └──────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────┐
   │ Stage 2: Deterministic extraction     │
   │   Prose: bracket-token parser         │
   │   Screenplay: fountain-js parser      │
   └──────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────┐
   │ Stage 3: AI classification + fill-in  │
   │   - Parenthetical → MOOD_ENUM         │
   │   - Inferred speakers for prose       │
   │   (scene-boundary inference is NOT    │
   │    done here — agent infers later in  │
   │    storyboard step; see §8.3)         │
   └──────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────┐
   │ Stage 4: Confidence aggregation       │
   │   - Per-field confidence scores       │
   │   - Aggregate parse-confidence score  │
   └──────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────┐
   │ Stage 5: Review gate                  │
   │   Score > 80%: skip, trust parser     │
   │   Score 50–80%: review-required       │
   │   Score < 50%: surface reformat button│
   └──────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────┐
   │ Stage 6: Lock + hand to storyboard    │
   │   parsed object becomes immutable     │
   └──────────────────────────────────────┘
```

## 5. Data model

### 5.1 Format detection result

```js
window.createJobState.inputDoc = {
  format: 'prose' | 'screenplay' | 'audio',  // 'prose' | 'screenplay' detected at Stage 1 of this plan;
                                              // 'audio' populated by audio-input-plan §6.1 for audio-input projects.
                                              // The inputDoc shape is shared across all input formats — type union must
                                              // include all three so downstream switch/match statements compile correctly.
  rawTextOriginal: '<verbatim user input>',  // IMMUTABLE — set once at submission, never modified
                                              // Audit trail of what the user actually typed
  rawText: '<working text>',                 // working copy: starts === rawTextOriginal,
                                              // overwritten if user accepts AI reformat (§10.3)
  detectedAt: '<ISO>',
  detectionConfidence: 0.95,               // 0–1; <0.5 surfaces "we're not sure of format" hint
  locked: false,                           // becomes true at Stage 6 (gate passed)
  lockedAt: null,
};
```

### 5.2 Canonical parsed structure

The output of Stages 2-4. Format-agnostic shape that downstream pipelines consume.

```js
window.createJobState.inputDoc.parsed = {
  sceneHeadings: [                                     // screenplay only; null for prose
    { location: 'KITCHEN', timeOfDay: 'MORNING',
      sceneIdx: 0, sourceLineNum: 12,
      indoor: true, confidence: 1.0 }
  ],
  sceneBreaks: [<line index>] | null,                  // null for prose (agent infers); array for screenplay
  dialogueLines: [
    {
      speakerName: 'Maya',                             // resolved character name
      speakerCharacterId: 'char_maya' | null,          // populated post-cast-resolution
      text: 'I really wish you\'d follow through on things.',
      performanceCue: 'angrily' | null,                // raw parenthetical text
      mood: 'angry',                                   // MOOD_ENUM after AI-classify
      moodConfidence: 0.85,
      speakerConfidence: 1.0 | 0.6 | 0.0,              // 1.0 = explicit tag (regex/Fountain match);
                                                       // 0.6 = AI-inferred from prose context (passes review at 0.5 threshold per §9);
                                                       // 0.0 = ambiguous, no inference possible (always triggers review)
      sourceLineNum: 14,
      isVoiceOver: false,                              // populated downstream from framing
      isExtraSpeaker: false,                           // true if speaker isn't in user-locked cast
    },
  ],
  actionLines: [                                       // narrative description, fed to image-prompts
    { text: 'Maya storms into the kitchen.',
      sourceLineNum: 13, confidence: 1.0 }
  ],
  detectedSpeakers: [                                  // unique speaker names found in input
    { name: 'Maya',  lineCount: 12, firstAppearanceLineNum: 14, isInUserCast: true,  characterId: 'char_maya' },
    { name: 'Joe',   lineCount: 8,  firstAppearanceLineNum: 28, isInUserCast: true,  characterId: 'char_joe'  },
    { name: 'BARTENDER', lineCount: 2, firstAppearanceLineNum: 92, isInUserCast: false, characterId: null },
  ],
};
```

### 5.3 Confidence aggregation

```js
window.createJobState.inputDoc.parseConfidence = {
  overall: 0.78,                          // weighted average across all parsed fields
  perCategory: {
    // Per pass-2 audit fix B2: sceneBreaks removed. Prior draft had both sceneBreaks
    // and sceneHeadings pointing to the same source value with confusing semantics.
    // sceneHeadings is canonical: 1.0 for screenplay, null for prose+audio.
    speakerAttribution: 0.85,             // % of dialogue lines with speakerConfidence ≥ 0.5 (per §9 + audit fix A4 — was 0.8 in earlier draft)
    moodClassification: 0.92,             // % of moods classified ≥ 0.7 by AI-classify
    sceneHeadings: 1.0,                   // screenplay: 1.0; prose AND audio: null (excluded from overall)
  },
  reviewRequired: false,                   // overall < 80% OR > 5 individual fields below threshold
  reformatSuggested: false,                // overall < 50%
  lowConfidenceItems: [],                  // populated when reviewRequired = true
};
```

### 5.4 Review-gate state

```js
window.createJobState.inputDoc.reviewGate = {
  status: 'auto-passed' | 'review-required' | 'reformat-suggested' | 'reviewed' | 'locked',
  reviewedAt: null | '<ISO>',
  userCorrections: 0,                     // number of low-confidence items user fixed
  reformatAttempted: false,               // true if user used the AI-rewrite-as-screenplay button
};
```

## 5.5 Pre-parse text normalization (per audit fix B3)

Before format detection runs, raw input is normalized to ASCII-friendly forms. This stabilizes regex matches that would otherwise miss curly-quote contexts. Normalization runs at the **top of `detectInputFormat`**, BEFORE any regex executes, on the working copy `rawText`. Original `rawTextOriginal` is untouched.

```js
function normalizeRawText(text) {
  return text
    .replace(/[“”]/g, '"')   // curly double quotes → straight
    .replace(/[‘’]/g, "'")   // curly single quotes → straight
    .replace(/—/g, '---')          // em-dash → Fountain triple-dash
    .replace(/–/g, '--')           // en-dash → Fountain double-dash
    .replace(/…/g, '...')          // ellipsis → three dots
    .replace(/ /g, ' ')            // non-breaking space → regular space
    .replace(/\r\n/g, '\n');            // CRLF → LF (Word/Windows paste)
}
```

Affects only `rawText` (working copy). User can always view original via `rawTextOriginal` if needed.

## 6. Stage 1 — Format detection

Fast heuristics on the raw text. No AI call.

```js
function detectInputFormat(rawText) {
  // Screenplay markers (very specific — rarely false-positive on prose):
  //   "INT." / "EXT." scene headings at line start
  //   "FADE IN:" / "FADE OUT" transitions
  //   ALL-CAPS character cues followed by indented dialogue
  const screenplayHeadingRegex = /^\s*(INT\.|EXT\.|INT\/EXT\.|FADE IN:|FADE OUT)/m;
  const characterCueRegex = /^\s{4,}([A-Z][A-Z\s]{2,30})\s*(\([^)]*\))?\s*$\n^\s{4,}/m;

  if (screenplayHeadingRegex.test(rawText) || characterCueRegex.test(rawText)) {
    return { format: 'screenplay', confidence: 0.95 };
  }
  return { format: 'prose', confidence: 0.95 };
}
```

**Confidence < 0.95 is rare** — false-positive screenplay detection only happens if prose accidentally contains "INT." or "EXT." substrings (e.g., "INTernational" mid-sentence). Mitigated by anchoring the regex to line start.

When `confidence < 0.5` (extremely rare — e.g., mixed input), surface a hint: *"We detected a mix of prose and screenplay format. Stori will use {chosen format}; if this is wrong, reformat your input."*

## 7. Stage 2 — Deterministic extraction

Two parsers, one per format.

### 7.1 Prose parser (per audit fix B4)

**Honest scope:** prose dialogue extraction is **brand-new code**, not a reuse of `castParseBracketTokens` (which only extracts `[bracket]` tokens — verified at [js/17b:2410](js/17b-create-references.js#L2410)). The new parser composes multiple regex passes + smart-quote normalization + action-line heuristics.

**Multi-line dialogue handling (per pass-2 audit fix A5):**
- The line-by-line pass below uses `[\s\S]*?` (matches across newlines) for quoted-string capture, so multi-line quoted dialogue is preserved.
- For speaker-tagged dialogue (`Maya: ...`), continuation logic detects whether the next line is a fragment continuation: starts with lowercase, OR the previous line ended without sentence-terminating punctuation (`.`, `?`, `!`, `"`). If so, append to the previous dialogue line; do not emit a separate action line.
- Continuation detection runs as a post-pass after the line-by-line extraction, walking the emitted `dialogueLines[]` + `actionLines[]` arrays in document order.

Algorithm (sequential passes on the normalized working copy `rawText`):

```js
function parseProse(rawText, lockedCast) {
  const lines = rawText.split('\n');
  const dialogueLines = [];
  const actionLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Pass 1 — Bracket tokens (reuse castParseBracketTokens)
    const bracketTokens = window.castParseBracketTokens(trimmed);
    const hasBrackets = bracketTokens.tokens.length > 0;

    // Pass 2 — Speaker-tagged dialogue (Pattern A from voice-and-lipsync-plan §7.1)
    const speakerTagMatch = trimmed.match(/^([A-Z][A-Za-z0-9 _-]{0,30}):\s+(.+)$/);
    if (speakerTagMatch) {
      const speakerName = normalizeSpeakerCasing(speakerTagMatch[1], lockedCast);
      dialogueLines.push({
        speakerName,
        text: speakerTagMatch[2],
        speakerConfidence: 1.0,        // explicit tag
        sourceLineNum: i + 1,
        bracketAdjacent: hasBrackets,
      });
      continue;
    }

    // Pass 3 — Bracket-tag inline narration: [Maya] said, "..."
    if (hasBrackets && bracketTokens.tokens.length > 0) {
      const speechVerbRegex = /(?:said|replied|asked|whispered|shouted|murmured|muttered|exclaimed|added|noted|sighed)/i;
      const quotedMatch = trimmed.match(/"([\s\S]*?)"|'([\s\S]*?)'/);   // [\s\S] spans newlines per audit fix A5
      if (speechVerbRegex.test(trimmed) && quotedMatch) {
        // Bracket nearest the quote is the speaker
        // (length > 0 guard is needed because hasBrackets is set when length > 0,
        // but defensive double-check protects against future regressions)
        const firstToken = bracketTokens.tokens[0];
        if (firstToken) {
          const speakerName = normalizeSpeakerCasing(firstToken, lockedCast);
          dialogueLines.push({
            speakerName,
            text: quotedMatch[1] || quotedMatch[2],
            speakerConfidence: 1.0,
            sourceLineNum: i + 1,
            bracketAdjacent: true,
          });
          continue;
        }
      }
    }

    // Pass 4 — Quoted dialogue without speaker tag — awaits AI inference
    const orphanQuotedMatch = trimmed.match(/"([^"]+)"|'([^']+)'/);
    if (orphanQuotedMatch) {
      dialogueLines.push({
        speakerName: null,
        text: orphanQuotedMatch[1] || orphanQuotedMatch[2],
        speakerConfidence: 0.0,         // ambiguous — AI infers in Stage 3
        sourceLineNum: i + 1,
        bracketAdjacent: false,
      });
      continue;
    }

    // Pass 5 — Action lines: paragraphs with no quotes and no tags
    actionLines.push({ text: trimmed, sourceLineNum: i + 1, confidence: 1.0 });
  }

  // Pass 6 — Multi-line continuation post-pass (per audit fix A5).
  // Walk emitted dialogueLines + actionLines in document order; if an action
  // line directly follows a dialogue line and looks like a continuation
  // (starts lowercase, OR previous dialogue ended without terminator),
  // merge it into the previous dialogue line.
  const merged = mergeContinuations(dialogueLines, actionLines);

  return { sceneHeadings: null, sceneBreaks: null,
           dialogueLines: merged.dialogueLines,
           actionLines: merged.actionLines };
}

function mergeContinuations(dialogueLines, actionLines) {
  // Combine into one document-order timeline by sourceLineNum
  const all = [
    ...dialogueLines.map(d => ({ kind: 'dialogue', ...d })),
    ...actionLines.map(a => ({ kind: 'action', ...a })),
  ].sort((x, y) => x.sourceLineNum - y.sourceLineNum);

  const result = [];
  for (const item of all) {
    const prev = result[result.length - 1];
    if (prev && prev.kind === 'dialogue' && item.kind === 'action') {
      // Continuation heuristic: action line starts lowercase OR
      // previous dialogue ended without sentence-terminator
      const prevEndsClean = /[.!?"]$/.test(prev.text.trim());
      const itemStartsLower = /^[a-z]/.test(item.text.trim());
      if (!prevEndsClean || itemStartsLower) {
        prev.text = (prev.text.trim() + ' ' + item.text.trim()).trim();
        continue;   // skip emitting as action
      }
    }
    result.push(item);
  }
  return {
    dialogueLines: result.filter(r => r.kind === 'dialogue').map(({ kind, ...rest }) => rest),
    actionLines:   result.filter(r => r.kind === 'action').map(({ kind, ...rest }) => rest),
  };
}

// Normalize speaker casing across input for cast match
function normalizeSpeakerCasing(rawName, lockedCast) {
  const normalized = rawName.trim();
  // Case-insensitive match to user-locked cast
  const castMatch = lockedCast.find(c => c.name.toLowerCase() === normalized.toLowerCase());
  return castMatch ? castMatch.name : normalized;
}
```

No scene boundaries detected at this stage for prose (storyboard agent infers in next step). Prose `sceneBreaks` stays null.

### 7.2 Screenplay parser — fountain-js

Library: **fountain-js** at exact pinned version, bundled into Stori build (NOT CDN-loaded — per audit fix C1).

**Why bundled and not CDN:**
- CDN semver ranges (`@1.x.x`) allow silent breaking changes
- CDN downtime breaks the input pipeline
- Existing codebase doesn't use any CDN dynamic-imports — bundling matches the established pattern

**Pinning (locked per pass-2 audit fix B1):** `fountain-js@1.2.6` exact. Placed at `vendor/fountain-js/fountain.min.js` in the project. Build script inlines it. If 1.2.6 fails compatibility on Stori's Fountain test fixtures (TBD test suite), fallback is `fountain-js@1.2.5`. Do NOT auto-update to newer 1.x versions without re-running compatibility tests.

```js
// At usage site
const fountain = new Fountain();   // global from bundled vendor module
const parsed = fountain.parse(rawText, true);  // includes parsed tokens
```

fountain-js extracts:

- `scene_heading` tokens → `parsed.sceneHeadings[]` with location + time + indoor/outdoor flag
- `character` tokens → speaker for following dialogue
- `dialogue` tokens → `parsed.dialogueLines[].text`
- `parenthetical` tokens → `parsed.dialogueLines[].performanceCue` (raw text)
- `action` tokens → `parsed.actionLines[]`
- `transition` tokens → ignored (FADE TO, CUT TO, etc.)
- `dual_dialogue_begin/end` → handled by attaching `dualSpeakerWith` field on each dialogue line

Edge handling: fountain-js gracefully skips malformed tokens. If parsing entirely fails, fall back to treating input as prose with a warning.

## 8. Stage 3 — AI classification + fill-in

Three AI tasks, all batch-able into a single Gemini call per input document to minimize cost.

### 8.1 Performance cue → MOOD_ENUM classification

For each `dialogueLines[i].performanceCue`, classify against MOOD_ENUM.

**Single batched Gemini call** with all parentheticals from the document:

```
You are a screenplay performance-cue classifier. For each parenthetical
below, return the closest mood from this enum:

[matter-of-fact, calm, warm, serious, excited, angry, sad, whispered,
 playful, concerned, urgent, sarcastic]

Some parentheticals describe delivery cues (off-screen, beat, voice-over) —
for these, return "matter-of-fact" since they don't indicate emotional tone.

Return JSON: [{ "cueIdx": 0, "mood": "...", "confidence": 0.0-1.0 }]

Parentheticals:
0: "angrily"
1: "beat"
2: "scoffs"
3: "quietly, with regret"
4: "off-screen"
...
```

Cost per call: ~$0.001-0.005 depending on parenthetical count. Single call per document. Per-cue confidence comes from Gemini's structured output.

### 8.2 Inferred speakers (prose only)

Prose lines with quoted strings but no explicit speaker tag get inferred via context. Single Gemini call:

```
You are a dialogue-speaker inference engine. For each unattributed quoted
line, identify the most likely speaker from prior context.

Return JSON: [{ "lineIdx": 0, "inferredSpeaker": "Maya" | null, "confidence": 0.0-1.0 }]

Use null when context doesn't provide enough information.

Context:
[full prose document, with line numbers]

Unattributed lines:
0: line 14 — "I can't believe you said that."
1: line 22 — "I had to."
...
```

Cost: ~$0.005-0.02 per document. One call. Confidence reflects how unambiguous the inference is.

### 8.3 Scene-boundary inference (prose only)

For prose input, the agent already runs scene-segmentation in the storyboard step. We don't pre-infer scene breaks here; we leave `sceneBreaks: null` and let the existing storyboard-agent flow handle it. This avoids duplicating work.

(Screenplay scene boundaries are deterministic from `INT.`/`EXT.` headings — no AI needed.)

## 9. Stage 4 — Confidence aggregation

**Skip-when-not-needed rule (per audit fix B5):** AI classification is skipped for inputs that don't need it. When skipped, the corresponding category is excluded from the weighted overall (weights redistribute to the remaining categories proportionally). This prevents penalty for inputs that are clean by construction.

- **Speaker inference skipped** when input has no unattributed dialogue lines (all explicitly tagged) — score for `speakerAttribution` reflects only explicit-tag count without AI dilution
- **Mood classification skipped** when input has no parentheticals or speech verbs — score for `moodClassification` is excluded from overall
- **`sceneHeadings`** is a screenplay-only category — for prose it's excluded entirely (NOT placeholder-weighted) per audit fix A3

```js
// skipFlags is derived inline from parsed (no separate param needed). The function reads
// parsed directly to determine whether speaker inference / mood / scene-headings ran.
function aggregateConfidence(parsed) {
  const dialogueLineCount = parsed.dialogueLines.length;
  // Speaker attribution: lower threshold to 0.5 so inferred lines (0.6 confidence)
  // contribute positively (per audit fix A4 — 3-tier scale was binary in practice)
  const highConfDialogues = parsed.dialogueLines.filter(d => d.speakerConfidence >= 0.5).length;
  // Per pass-2 audit fix A2: null when no dialogue exists (consistent with the null-exclusion
  // pattern used by moodScore + sceneHeadingScore). A document with zero dialogue lines is
  // not perfect-score — it's a degenerate case the gate should treat as such.
  const speakerAttributionScore = dialogueLineCount > 0 ? highConfDialogues / dialogueLineCount : null;

  const cuedDialogues = parsed.dialogueLines.filter(d => d.performanceCue);
  const highConfMoods = cuedDialogues.filter(d => d.moodConfidence >= 0.7).length;
  const moodScore = cuedDialogues.length > 0 ? highConfMoods / cuedDialogues.length : null;
  // null → category is excluded from overall

  const sceneHeadingScore = parsed.sceneHeadings ? 1.0 : null;  // null = excluded for prose

  // Dynamic weight redistribution — per audit fix A3 + B5
  // Base weights: speakerAttribution: 0.5, moodClassification: 0.2, sceneHeadings: 0.3
  const weights = { speakerAttribution: 0.5, moodClassification: 0.2, sceneHeadings: 0.3 };
  const activeCategories = {
    speakerAttribution: speakerAttributionScore,
    moodClassification: moodScore,
    sceneHeadings: sceneHeadingScore,
  };
  // Drop categories with null score; redistribute their weight proportionally
  const activeWeightSum = Object.entries(activeCategories)
    .filter(([_, score]) => score !== null)
    .reduce((sum, [k]) => sum + weights[k], 0);

  // Per pass-2 audit fix A3: degenerate case — all categories are null.
  // Happens when input has zero dialogue, zero parentheticals, no scene headings
  // (e.g., user pasted a single line of pure narration). Return null overall + force
  // review so user can decide what to do; reformat-suggested triggers automatically.
  if (activeWeightSum === 0) {
    return {
      overall: null,
      perCategory: { speakerAttribution: null, moodClassification: null, sceneHeadings: null },
      reviewRequired: true,
      reformatSuggested: true,
      lowConfidenceItems: [],
    };
  }

  let overall = 0;
  for (const [k, score] of Object.entries(activeCategories)) {
    if (score === null) continue;
    overall += score * (weights[k] / activeWeightSum);
  }

  return {
    overall,
    perCategory: { speakerAttribution: speakerAttributionScore, moodClassification: moodScore, sceneHeadings: sceneHeadingScore },
    reviewRequired: overall < 0.8,
    reformatSuggested: overall < 0.5,
    lowConfidenceItems: collectLowConfidenceItems(parsed),
  };
}
```

### 9.1 `collectLowConfidenceItems` — definition (per audit fix B1)

```js
// Returns: [{ category, lineIdx, currentValue, fieldPath, confidence }]
function collectLowConfidenceItems(parsed) {
  const items = [];
  for (let i = 0; i < parsed.dialogueLines.length; i++) {
    const d = parsed.dialogueLines[i];
    if (d.speakerConfidence < 0.7) {
      items.push({
        category: 'speakerAttribution',
        lineIdx: i,
        currentValue: d.speakerName,
        fieldPath: `dialogueLines[${i}].speakerName`,
        confidence: d.speakerConfidence,
      });
    }
    if (d.performanceCue && d.moodConfidence < 0.7) {
      items.push({
        category: 'moodClassification',
        lineIdx: i,
        currentValue: d.mood,
        fieldPath: `dialogueLines[${i}].mood`,
        confidence: d.moodConfidence,
      });
    }
  }
  return items;
}
```

`lowConfidenceItems` flat list is consumed by the §10.2 review UI to render per-line override dropdowns.

## 10. Stage 5 — Review gate UI

### 10.1 Auto-pass mode (overall ≥ 0.8)

No UI surfaces. Parsed structure goes directly to storyboard step. User experience: paste input → see storyboard generated.

### 10.2 Review-required mode (0.5 ≤ overall < 0.8)

A modal-like step appears in the breadcrumb after input submission, before storyboard step.

**Grouping behavior** (load-bearing — depends on input format):
- **Screenplay input:** group review items by `parsed.sceneHeadings[i]` — natural scene boundaries from `INT.`/`EXT.` headings
- **Prose input:** group review items by **document-order chunks of ~10 dialogue lines** (no scene structure exists pre-storyboard). Chunk boundaries shown as "Lines 1–10," "Lines 11–20," etc. — not labeled as scenes since the storyboard agent hasn't run

Picked document-order chunking over heuristic scene-detection for prose because (a) heuristic detection (paragraph breaks, location mentions) is itself low-confidence work, (b) document order maps directly to source line numbers users can reference back to.

```
┌─ Review parsed input ───────────────────────────────────────────┐
│                                                                  │
│ We've extracted structure from your input but need your help     │
│ confirming a few things.                                         │
│                                                                  │
│ Parse confidence: 67% — review the highlighted items below.      │
│ (Reflects how cleanly we extracted structure, not whether the    │
│  content is correct.)                                            │
│                                                                  │
│ ┌─ Scene 4 ────────────────────────────────────────── ⚠ 3 items │
│ │ "I really wish you'd follow through on things."             │
│ │   Speaker: [ Maya ▾ ]   ⚠ inferred                            │
│ │                                                                │
│ │ "I had to."                                                   │
│ │   Speaker: [ Joe ▾ ]    ⚠ inferred                            │
│ │                                                                │
│ │ Performance cue "(scoffs)"                                    │
│ │   Mood: [ sarcastic ▾ ] ⚠ low confidence                      │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Scene 7 ────────────────────────────────────────── ✓ all clear│
│ │ Click to expand if you want to verify                          │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [← Back to input]   [Confirm and continue → ]                   │
└──────────────────────────────────────────────────────────────────┘
```

**Layout rules:**
- Scenes with low-confidence items are expanded by default with red badges
- Scenes with all high-confidence items are collapsed but expandable
- Per-line dropdowns let user override inferred speaker / mood
- Threshold for low-confidence per-field flagging: `<0.7` (locked in this plan §17 — was incorrectly cross-referenced to audio-rehearsal-plan §17 in pass-2; this plan §17 is the canonical source for input-format confidence thresholds)
- Confirm button enabled when all flagged items have a value (default value is the AI inference; user can change before confirming)

User correcting an inference DOESN'T trigger re-parse — it just updates `parsed.dialogueLines[i].speakerName` (or `mood`) directly + raises that field's confidence to 1.0.

### 10.3 Reformat-suggested mode (overall < 0.5)

```
┌─ Input is hard to parse cleanly ─────────────────────────────────┐
│                                                                   │
│ We extracted some structure, but ~58% of dialogue speakers are    │
│ uncertain. You can:                                               │
│                                                                   │
│ Option 1 — Let AI rewrite your input as a clean screenplay        │
│            ($0.05; ~10 seconds; you can review before continuing) │
│            [Rewrite as screenplay]                                │
│                                                                   │
│ Option 2 — Review and confirm each inference manually             │
│            (slower; 18 items to confirm)                          │
│            [Manual review →]                                      │
│                                                                   │
│ Option 3 — Edit your input and resubmit                           │
│            [← Back to input]                                      │
└───────────────────────────────────────────────────────────────────┘
```

The AI-rewrite-as-screenplay button calls Gemini with the prose input + a Fountain-format-strict prompt. Result shown in a side-by-side diff before user confirms. If user accepts, rewritten text replaces `inputDoc.rawText` (working copy); `inputDoc.rawTextOriginal` stays untouched as immutable audit trail. Format detection re-runs (now finds screenplay), and parsing re-runs deterministically.

**Reformat prompt** (locked, per audit fix B2):

```
Rewrite the following prose as a properly formatted screenplay in Fountain
syntax. Follow Fountain conventions strictly:

RULES:
- Scene headings: lines beginning with INT., EXT., or INT./EXT.,
  followed by location and (optionally) "- TIME OF DAY"
  Example: INT. KITCHEN - MORNING
- Character cues: ALL CAPS, indented at least 4 spaces, alone on a line
  Example:     MAYA
- Parentheticals: in (), on the line directly below a character cue,
  indented 8+ spaces — describe ONE word emotional/delivery cue
  Example:         (angrily)
- Dialogue: indented 4+ spaces, on lines below the character cue / parenthetical
  Example:     I really wish you'd follow through on things.
- Action: left-aligned, no special formatting, separates beats
  Example: Maya storms into the kitchen.
- Transitions: RIGHT-ALIGNED in ALL CAPS, ending with TO: or IN/OUT
  Example: FADE OUT.

CONSTRAINTS:
- Preserve ALL dialogue and narrative content from the prose verbatim — do
  not add, remove, or rephrase story beats
- If prose has implied speakers (e.g., "she said"), make character cues
  explicit using the most likely character
- Map prose performance descriptions ("she whispered", "he yelled") to
  parentheticals: (whispered), (shouting)
- Output ONLY the Fountain-formatted screenplay. No commentary, no
  preamble, no markdown fencing.

Prose input:
[user's prose]
```

**Cost:** ~$0.02-0.05 per call (depends on prose length). One-time per reformat attempt.

**Output sanitization (per pass-2 audit fix A4):** LLMs frequently wrap output in markdown code fences (```` ```fountain ... ``` ````) or add preamble text despite "no fencing" prompt instructions. Pre-parse sanitization is required before handing the output to `fountain.parse()`:

```js
function sanitizeFountainOutput(raw) {
  let text = String(raw || '');
  // Strip markdown code fences (with or without language tag)
  text = text.replace(/^\s*```(?:fountain|screenplay)?\s*\n/i, '');
  text = text.replace(/\n\s*```\s*$/, '');
  // Strip leading commentary lines (anything before the first INT./EXT./FADE/character cue)
  const lines = text.split('\n');
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^(INT\.|EXT\.|INT\/EXT\.|FADE IN:|FADE OUT|[A-Z][A-Z\s]{2,30}\s*(\(.+\))?$)/i.test(t)) {
      startIdx = i;
      break;
    }
  }
  return lines.slice(startIdx).join('\n').trim();
}
```

Apply sanitization before `fountain.parse()`. Alternative: use Gemini's structured-output mode with `responseMimeType: 'application/json'` and schema `{ "fountainText": "string" }` — extracts a single string field reliably. Either approach is acceptable; pick one for v1.

**Loop prevention:** if the sanitized + re-parsed text still scores overall confidence < 0.5, surface error to user: "Reformat didn't improve parseability. Edit your input manually." Do NOT auto-retry the reformat. Track in telemetry as `reformatLoopBlocked` (per audit fix C4).

If user picks manual review, falls through to the §10.2 review-required UI with all flagged items.

### 10.4 Reformat result review (when user picks "Rewrite as screenplay")

Side-by-side: original prose left, rewritten Fountain right. User can:
- **Accept** → replace input, re-parse, re-evaluate confidence (usually jumps to >0.9 since screenplay is deterministic)
- **Reject** → see three options (per audit fix C3):
  - "Manual review →" — current behavior; flow back to §10.2 with original parsing
  - "← Back to edit my input" — let user fix the source text and resubmit; clears the entire `inputDoc` (returns to input-submission step with `rawText` pre-filled)
  - "Try other format detection" — force-detect as opposite format (`prose` if originally `screenplay`, vice versa); re-runs parsing without AI rewrite
- **Edit** → opens the rewritten Fountain in a textarea for tweaks before accepting

## 11. Stage 6 — Lock + hand to storyboard

Once review gate passes (auto or user-confirmed):

```js
window.createJobState.inputDoc.locked = true;
window.createJobState.inputDoc.lockedAt = new Date().toISOString();
window.createJobState.inputDoc.reviewGate.status = 'locked';

// Storyboard step now has access to:
//   - parsed.sceneHeadings (screenplay only)
//   - parsed.sceneBreaks (screenplay only; null for prose triggers agent inference)
//   - parsed.dialogueLines (with confirmed speakers + moods)
//   - parsed.actionLines (feeds image prompts)
//   - parsed.detectedSpeakers (drives the AI-suggest-extras flow per audio-input-plan §7)
```

The storyboard agent extension (voice-and-lipsync-plan §7) consumes this structure DIRECTLY — no further inference of speakers or moods needed for fields with `confidence ≥ 0.7`. Fields below that have already been user-reviewed in Stage 5.

## 12. Cost surface

Per input submission, one-time:

| Operation | Cost |
|---|---:|
| Format detection (regex) | $0 |
| Prose parsing (regex + bracket-token) | $0 |
| Screenplay parsing (fountain-js client-side) | $0 |
| Performance-cue classification (single Gemini call) | ~$0.001-0.005 |
| Speaker inference for prose (single Gemini call) | ~$0.005-0.02 |
| Reformat-as-screenplay (Gemini call, opt-in) | ~$0.02-0.05 |

**Project total for input parsing: < $0.10** even on heavy-rewrite cases. Negligible vs ~$5-15 typical project total.

## 13. Implementation order

7 phases. ~3-4 days uninterrupted.

| Phase | What | Files | Risk |
|---|---|---|---|
| **1. Data model + format detection** | `createJobState.inputDoc` shape; `detectInputFormat()` regex; UI hook to detect on input submission | js/17b, js/17c | low |
| **2. Prose parser** | Brand-new prose dialogue extraction (5-pass algorithm per §7.1) — bracket tokens reuse `castParseBracketTokens` but speaker-tag detection, quoted-dialogue extraction, action-line heuristics, and speaker-casing normalization are all NEW. Plus smart-quote normalization (§5.5). | js/17b, new js/31-input-parser.js | **medium** (re-rated from low per audit fix C5) |
| **3. Screenplay parser (fountain-js)** | Bundle `fountain-js@1.2.6` under `vendor/` (NOT CDN — see §7.2 + audit fix C1); inline at build time; `fountain.parse()`; map fountain tokens to `parsed` shape | new js/31-input-parser.js, vendor/fountain-js | medium |
| **4. AI classification (Gemini batch calls)** | Performance-cue → MOOD_ENUM; speaker inference for prose; structured-output JSON mode | js/17a, js/31-input-parser.js | medium |
| **5. Confidence aggregation + review UI** | Score computation; review-required modal; per-line override dropdowns; auto-pass logic | js/17c, css/styles | medium |
| **6. Reformat-as-screenplay flow** | Gemini call with Fountain-spec prompt; diff UI; replace-input flow | js/17a, js/17c | medium |
| **7. Lock + storyboard handoff** | `inputDoc.locked = true`; storyboard step consumes `parsed` directly; remove duplicate inference in storyboard agent | js/17c | low |

## 14. Edge cases register

30 numbered cases.

### Format detection

| ID | Case | Behavior |
|---|---|---|
| EC-FD-01 | Empty input | Block submission with "Input cannot be empty." |
| EC-FD-02 | Single line of dialogue, no scene structure | Detect as prose; warn at low confidence; storyboard agent infers full structure |
| EC-FD-03 | Mixed prose + screenplay (typed `INT.` mid-prose accidentally) | Detect as screenplay (heading regex matches); warn user; suggest reformat if subsequent parsing fails |
| EC-FD-04 | Pasted from Word with smart quotes / em-dashes | Normalize to ASCII before parsing; preserve in rawText |
| EC-FD-05 | Pasted from Final Draft / Highland (full Fountain export) | Detect as screenplay; fountain-js handles |
| EC-FD-06 | Pasted PDF text (broken line wrapping) | Format detection runs; broken lines may break screenplay parsing → fallback to prose with low confidence + reformat-suggested UI |
| EC-FD-07 | Non-English input (Spanish prose, French screenplay) | Detect format normally; AI classification handles non-English moods if Gemini supports the language; fountain-js is English-spec — non-English screenplay falls back to prose parsing |
| EC-FD-08 | Input exceeds 100,000 characters (~30KB) | Per pass-2 audit fix A6: surface warning at submission: "Large input may take longer to parse and increase cost. Consider splitting into multiple projects." Allow proceed. |
| EC-FD-09 | Input exceeds 500,000 characters (~150KB) | Per pass-2 audit fix A6: hard cap. Block submission with "Input too large. Stori supports up to 500,000 characters. Split your input into multiple projects." |
| EC-FD-10 | Document size exceeds 50KB Gemini-batch threshold for AI classification | Per pass-2 audit fix A6 (promoting risk note to spec): chunk AI classification calls (mood + speaker inference) by scene groupings (~5-10 scenes per call). Track total cost; project-level cap stays under $0.20 even on huge documents. |

### Prose parsing

| ID | Case | Behavior |
|---|---|---|
| EC-PP-01 | All dialogue tagged explicitly (`Maya: "..."`) | High confidence; auto-pass review gate |
| EC-PP-02 | No dialogue tagged; all `she/he said` | Speaker inference via Gemini; review gate likely required |
| EC-PP-03 | Bracket tokens present (`[Maya] said`) | Existing parser handles; high confidence |
| EC-PP-04 | Multiple characters with similar names (Maya, Mary) | Treat as separate speakers; AI inference may confuse them; low confidence triggers review |
| EC-PP-05 | Same character spelled inconsistently (`Maya` and `MAYA`) | Normalize to canonical form (matching cast lock); preserve original casing in rawText |
| EC-PP-06 | Quoted text inside non-dialogue (e.g., `the sign read "Closed"`) | AI inference returns null speaker; user reviews and either marks as action or assigns speaker |

### Screenplay parsing

| ID | Case | Behavior |
|---|---|---|
| EC-SP-01 | Standard Fountain format | fountain-js parses cleanly; high confidence; auto-pass |
| EC-SP-02 | Force-codes (`!action line` for forced action) | fountain-js handles; preserved correctly |
| EC-SP-03 | Dual dialogue (two characters speaking simultaneously) | **Known v1 fidelity loss:** Fountain dual dialogue is by definition simultaneous, but Stori's v1 pipeline has no overlapping-audio support — voice-and-lipsync-plan's cut-on-speaker rule assumes sequential turns. fountain-js extracts both; we mark `dualSpeakerWith` on each line + emit them as **two sequential segments** with a user-visible note in the review UI: "Detected dual dialogue — Stori plays these sequentially in v1; v2 will support overlap." Document in decision log §17 as a v1 limitation. |
| EC-SP-04 | Sections / synopses (`# Section`, `= Synopsis`) | Ignored (not relevant to dialogue/scene structure) |
| EC-SP-05 | Lyrics (`~lyric line`) | Treated as dialogue with `mood: 'matter-of-fact'` |
| EC-SP-06 | Boneyard comments (`/* ... */`) | Stripped before parsing |
| EC-SP-07 | Notes (`[[ note ]]`) | Stripped before parsing |
| EC-SP-08 | Page breaks (`===`) | Ignored |
| EC-SP-09 | Title page (`Title: My Movie`) | Ignored at parse; metadata could feed project name in v1.5 |
| EC-SP-10 | Malformed Fountain (e.g., character name without dialogue below) | fountain-js skips; flag as low confidence; surface in review |

### AI classification

| ID | Case | Behavior |
|---|---|---|
| EC-AI-01 | Empty parenthetical `()` | Skip; treated as no cue; mood defaults to "matter-of-fact" |
| EC-AI-02 | Multi-word parenthetical with mixed cues `(quietly, off-screen)` | AI classifies based on dominant cue; "quietly" → whispered |
| EC-AI-03 | Parenthetical that's a delivery cue not emotion `(beat)` `(off-screen)` `(V.O.)` | AI classifies as "matter-of-fact" (correctly recognizes non-emotion) |
| EC-AI-04 | Parenthetical in non-English | AI handles if Gemini multilingual; otherwise falls back to "matter-of-fact" |
| EC-AI-05 | AI classification API call fails | Default all unmapped cues to "matter-of-fact"; lower moodScore in confidence aggregation; review-required if many fail |
| EC-AI-06 | Speaker inference returns null for many lines | Each null reduces speakerAttribution score; review-required if score < 0.8 |
| EC-AI-07 | AI returns invalid JSON | Retry once; on second failure, treat all uncertain items as low-confidence and trigger review |

### Review gate

| ID | Case | Behavior |
|---|---|---|
| EC-RG-01 | User opens review modal mid-parse (race condition) | Block opening until parse completes; show progress |
| EC-RG-02 | User changes inferred speaker to a name not in cast | Triggers AI-suggest-extras flow per **audio-input-plan §7 (canonical source)**. Cross-format contract (load-bearing): max 5 extras across the project; voice picker per accepted extra (Gemini default + ElevenLabs if configured); rejected extras' lines reassigned to narrator voice-over; cap-exceeded path auto-merges lowest-line-count speakers to narrator. Same UI pattern as audio input — for consistency, the modal surfaces the audio sample (audio input) OR a text snippet (text input) before asking accept/reject. |
| EC-RG-03 | User clicks "Confirm" without changing any items | Allowed; AI inferences become locked at original confidence values |
| EC-RG-04 | User clicks "← Back to input" mid-review | Discards review state; user can re-edit input then resubmit |
| EC-RG-05 | User clicks "Reformat as screenplay" then rejects the rewrite | Returns to manual-review mode with original parsing |
| EC-RG-06 | Reformat-as-screenplay produces lower confidence than original | Show both confidence scores in the diff UI; recommend keeping original |

### Lock + handoff

| ID | Case | Behavior |
|---|---|---|
| EC-LH-01 | User attempts to edit input after lock | Block; surface "Input is locked. To change, start a new project." (per #7 lock — input is one-time) |
| EC-LH-02 | Storyboard agent crashes on parsed structure | Surface error; suggest reformat-as-screenplay; user can unlock by starting new project |

## 15. Telemetry

```js
{
  inputFormatDetected: 'prose' | 'screenplay',
  inputFormatDetectionConfidence: <float>,
  inputCharCount: <int>,
  inputDialogueCount: <int>,
  inputActionLineCount: <int>,
  inputSceneHeadingCount: <int>,         // screenplay only
  inputDistinctSpeakers: <int>,
  parseConfidenceOverall: <float>,
  parseConfidenceCategories: { sceneBreaks, speakerAttribution, moodClassification, sceneHeadings },
  reviewGateStatus: 'auto-passed' | 'review-required' | 'reformat-suggested',
  userCorrectionsCount: <int>,           // items user edited in review modal
  reformatAttempted: bool,
  reformatAccepted: bool,
  reformatResultConfidence: <float>,    // overall confidence after reformat ran (audit fix C4)
  reformatResultFormat: 'prose' | 'screenplay',   // detected format of reformatted text
  reformatLoopBlocked: <int>,           // count of times reformat result still <0.5 (loop prevention fired)
  fountainParseFailures: <int>,
  aiClassificationFailures: <int>,
  totalParseTimeMs: <int>,
}
```

## 16. Risks + open questions

### Risks

1. **fountain-js library quality on real-world inputs.** Fountain spec has corners (force-codes, nested parentheticals, dual dialogue). Library is mature but real screenplays from Final Draft / Highland may have proprietary annotations that don't round-trip.

2. **AI classification cost on huge inputs.** A 100-page screenplay has hundreds of parentheticals + thousands of dialogue lines. Single batched Gemini call may exceed context limits. Mitigation: chunk by scene (5-10 scenes per call) when document is > 50KB.

3. **Speaker inference quality on similar-name characters.** Maya / Mary / Mike are easy for AI to confuse. Mitigation: review gate surfaces these as low-confidence; user resolves.

4. **Format-detection false-positive on prose containing `INT.`.** Real-world rare, but a prose line like "Marie went INT.O the kitchen" could match. Mitigation: stronger regex anchoring + Stage 5 reformat-suggested fallback when subsequent parsing fails.

5. **Mid-flow input change attempts.** Per #7 lock, input is one-time. Users may push back. Mitigation: clear messaging at submission ("Input is locked once submitted; iterate inside the project workspace via storyboard / image-gen / rehearsal").

### Open questions for v2+

1. **Direct file upload (.fountain, .fdx, .pdf).** v2 — paste-as-text only in v1.
2. **Multi-language screenplay support.** v2 — fountain-js is English-only; need internationalized parser or LLM-only path for non-English.
3. **Iterative input authoring inside Stori.** Today input is one-time. v2 may allow editing after submission with explicit "regenerate downstream" gate.
4. **Title-page metadata extraction** (Author, Title, Draft Date) → project metadata. v1.5.
5. **Template-driven prose generation** ("write me a 5-scene comedy" prompt → AI generates screenplay → user edits → submits). v2 integration with brainstorm flow.

## 17. Decision log

| Decision | Choice | Rationale |
|---|---|---|
| Support storyboard format? | No — prose + screenplay only | Nobody writes "Scene N [4s]" naturally; screenplay covers the structured-input use case. |
| Screenplay parser? | fountain-js library, **bundled at exact pinned version under `vendor/`** (audit fix C1) — NOT CDN | Mature, +30KB acceptable, handles edge cases hand-roll would miss. CDN was rejected for production stability + offline support + version-pinning reasons. |
| Performance cue mapping? | AI-classify against MOOD_ENUM (single batched Gemini call) | Strict reject is hostile; lenient default loses info; AI-classify preserves intent at ~$0.001 per cue. |
| Mid-flow format change? | Not allowed — input is one-time, locked at submission | User clarification: filmmakers won't use Stori as a text editor; one-time submission is the contract. |
| Confidence threshold for review-required? | overall < 0.8 | Locked. Looser than 0.9 to avoid review fatigue; stricter than 0.7 to catch real ambiguity. |
| Confidence threshold for reformat-suggested? | overall < 0.5 | Below this, manual review is likely overwhelming; AI rewrite is the better path. |
| Review UI? | Scene-level summary with click-through to per-line review | Less fatigue than line-by-line; user focuses on scenes with red badges. |
| Reformat-as-screenplay button? | Yes, automatic suggestion when score < 0.5 | Honest fallback when input is too noisy for line-by-line review. |
| Format detection mode? | Automatic via regex | No user-facing toggle; detection is reliable enough at >0.9 confidence. |
| `rawText` immutability? | Two fields: `rawTextOriginal` (immutable audit trail) + `rawText` (working copy, mutable on reformat accept) | Per audit fix A1 — original spec contradicted itself. |
| Review UI grouping for prose? | Document-order chunks (~10 lines), not heuristic scenes | Per audit fix A2 — prose has no scene structure pre-storyboard. |
| Confidence aggregation when category absent? | Drop category from overall; redistribute its weight proportionally to active categories | Per audit fix A3 + B5 — placeholder weights inflated prose scores. |
| `speakerConfidence` threshold for review-required? | 0.5 (was 0.8 in earlier draft) | Per audit fix A4 — 0.6 inferred tier now contributes positively. |
| Dual dialogue handling? | Treated as 2 sequential segments with user-visible note | Per audit fix A5 — known v1 fidelity loss. v2 may add overlap support. |
| Reformat-as-screenplay prompt? | Locked Fountain-strict prompt with constraints + loop prevention if rewrite still <0.5 | Per audit fix B2. |
| Smart-quote normalization? | At top of `detectInputFormat` before regex; affects working `rawText` only; original preserved | Per audit fix B3. |
| Prose dialogue extraction reuse claim? | False — castParseBracketTokens only handles brackets. Prose parser is NEW code with 5 sequential passes | Per audit fix B4. |
| AI calls when not needed? | Skip + dynamic weight redistribution | Per audit fix B5 — screenplay shouldn't be penalized for non-running AI calls. |
| fountain-js distribution? | Bundled at exact pinned version, not CDN | Per audit fix C1 — production stability. |
| Confidence label name? | "Parse confidence" with subtitle clarifying it measures structure not correctness | Per audit fix C2 — UX trust risk. |
| Reformat rejection recovery? | Three buttons: manual review / back to edit input / try other format detection | Per audit fix C3. |

## 18. Acceptance criteria

The plan is complete when:

- [ ] User can paste prose or screenplay; Stori auto-detects format with > 95% accuracy on real-world inputs.
- [ ] Format detection regex doesn't false-positive on prose containing INT./EXT. substrings (anchored to line start).
- [ ] Prose parser extracts speaker-tagged dialogue + bracket-token dialogue + action lines with > 90% recall on tagged inputs.
- [ ] fountain-js bundled at exact pinned version under `vendor/`; inlined at build time; no CDN dynamic-import (per audit fix C1).
- [ ] Screenplay parser correctly extracts scene headings, character cues, parentheticals, action, and dual dialogue from standard Fountain inputs.
- [ ] Performance-cue classification runs as a single Gemini batch call per document and returns MOOD_ENUM IDs with confidence scores.
- [ ] Speaker inference (prose) runs as a single Gemini batch call and returns inferred speakers + confidence per unattributed line.
- [ ] Confidence aggregation uses base weights `{ speakerAttribution: 0.5, moodClassification: 0.2, sceneHeadings: 0.3 }` and dynamically redistributes weight from any null-scored category to the active categories proportionally (per §9 + audit fix A3+B5). Example: prose with no parentheticals (mood = null) and no scene headings (sceneHeadings = null) → speakerAttribution gets full weight 1.0.
- [ ] Score ≥ 0.8 → auto-pass review gate (no UI surfaces).
- [ ] Score 0.5–0.8 → review-required modal with scene-level summary + per-line override dropdowns.
- [ ] Score < 0.5 → reformat-suggested modal offering AI-rewrite as screenplay.
- [ ] User edits in review modal don't trigger re-parse — they update the field directly.
- [ ] Reformat-as-screenplay flow shows side-by-side diff before user confirms.
- [ ] Locked input cannot be edited; "start new project" is the only path to change.
- [ ] Storyboard agent consumes `parsed` structure directly without duplicating inference for fields ≥ 0.7 confidence.
- [ ] All 30+ edge cases (EC-FD, EC-PP, EC-SP, EC-AI, EC-RG, EC-LH) have explicit handlers.
- [ ] Telemetry captures all 16+ fields in §15.
- [ ] Aurora dark + light theme tokens applied to review-gate modal and reformat-diff UI per voice-and-lipsync-plan §19.
- [ ] Total parse cost stays under $0.10 per project.
- [ ] `rawTextOriginal` is set once at submission and never overwritten; `rawText` is the working copy that can be replaced by reformat acceptance.
- [ ] `collectLowConfidenceItems` returns `[{ category, lineIdx, currentValue, fieldPath, confidence }]` per §9.1.
- [ ] Confidence aggregation drops null-scored categories from overall; redistributes weight proportionally.
- [ ] `speakerConfidence >= 0.5` threshold passes inferred lines (0.6 tier) into the high-confidence count.
- [ ] Dual dialogue produces 2 sequential segments + user-visible note; documented as v1 fidelity loss.
- [ ] Reformat-as-screenplay uses the locked prompt from §10.3; loop prevention blocks re-reformat if result is still <0.5.
- [ ] Smart-quote normalization runs at top of `detectInputFormat`; modifies working `rawText` only.
- [ ] Prose parser executes 5 sequential passes per §7.1 algorithm; tested on prose with explicit tags, brackets, quoted-orphan dialogue, action lines.
- [ ] Skip-when-not-needed: AI mood classification skipped on inputs with no parentheticals; speaker inference skipped on screenplay or fully-tagged prose.
- [ ] fountain-js bundled at exact version (e.g., `@1.2.6`) under `vendor/`; no CDN dynamic-import.
- [ ] Review UI labels score as "Parse confidence" with subtitle clarifying it measures structure not correctness.
- [ ] Reformat rejection offers 3 recovery buttons (manual review / back to edit / try other format).
- [ ] Telemetry captures `reformatResultConfidence`, `reformatResultFormat`, `reformatLoopBlocked`.
