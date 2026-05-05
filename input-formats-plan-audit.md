# Audit: Input Formats Plan

Auditor: Kilo | Date: 2026-05-05 | Status: design draft review
Scope: logical consistency, implementation feasibility, cross-plan coherence for input-formats-plan.md

---

## A. Logical Inconsistencies

### A1. `rawText` is declared immutable then mutated

§5.1: `rawText: '<original input verbatim>', // never modified`.
§10.3: "If user accepts [reformat], the rewritten text **replaces** `inputDoc.rawText`."

These are directly contradictory. The "never modified" semantic is load-bearing — it is the audit trail for what the user actually typed. Overwriting it with AI-generated output destroys the original input with no recovery path. No `rawTextOriginal` backup field exists.

**Fix:** Add `rawTextOriginal` (set once at submission, truly immutable). `rawText` becomes the working text that can be replaced by reformat. Alternative: don't overwrite `rawText` — store the screenplay rewrite in a separate field like `reformattedText` and have the downstream pipeline read from whichever is active.

### A2. Review UI groups by "Scene" but prose has no scene structure at this point

§10.2 shows a review UI with "Scene 4" and "Scene 7" headers. But for prose input, `sceneBreaks` is `null` (§8.3), `sceneHeadings` is `null` (§5.2), and the storyboard agent hasn't run yet (it runs after lock). The scene groupings in the review UI have no source.

**Fix:** Either (a) add a lightweight heuristic to chunk prose into approximate scene groups for the review UI (paragraph breaks with 2+ blank lines, distinct location mentions), or (b) present prose review items in document order without scene grouping. The latter is simpler; the former gives better UX. Pick one and specify it.

### A3. Confidence aggregation uses `sceneBreaks` category but prose always returns a placeholder

§9 computes `sceneHeadingScore = parsed.sceneHeadings ? 1.0 : 0.6` for prose, then uses this for **both** `sceneBreaks` and `sceneHeadings` categories in `perCategory` (lines 300-301). For prose, 0.6 is a placeholder for both — but this inflates the overall score by 30% weight without any actual measurement. A 0.6 placeholder for an unmeasured category is scoring noise, not signal. It biases overall scores upward for prose, potentially letting low-quality parses auto-pass at > 0.8.

**Fix:** For prose, weight `sceneBreaks` and `sceneHeadings` at 0.0 (exclude from overall) or use a neutral 0.5 explicitly documented as "no data, neutral." Alternatively, dynamically reweight the formula to redistribute the 0.3 scene-weight to the other categories when scene data is absent.

### A4. `speakerConfidence` values are discrete but treated as continuous

§5.2 defines `speakerConfidence` as three discrete values: `1.0 | 0.6 | 0.0`. But `aggregateConfidence` (§9) computes `speakerAttributionScore` as the fraction of lines with `speakerConfidence >= 0.8`. Only `1.0` meets this threshold, so the computation reduces to: `(count of explicitly tagged lines) / (total lines)`. The `0.6` "inferred" tier is effectively treated the same as `0.0` for aggregation purposes, making the 3-tier scale misleading — it's binary in practice.

**Fix:** Either lower the aggregation threshold to `>= 0.5` so inferred lines contribute positively (giving 3 real tiers), or simplify `speakerConfidence` to a boolean (`explicit: true/false`) and drop the pretense of gradation. The current design gives users a "0.6 confidence" badge that has zero impact on the review gate.

### A5. Dual dialogue treated as "two sequential beats" contradicts its nature

EC-SP-03 says dual dialogue "treat as two sequential beats." But dual dialogue in Fountain is specifically *simultaneous* speech — that's why it has a distinct token type. Treating it as sequential changes the temporal relationship and breaks any downstream timing that assumes overlap. The audio-rehearsal plan has no concept of overlapping audio in v1; the voice plan's cut-on-speaker rule explicitly assumes sequential turns.

**Fix:** Acknowledge this explicitly as a known fidelity loss in the decision log. Dual dialogue becomes two sequential segments with a note to the user in review UI when detected. Do not claim the representation is faithful — it is a forced simplification for v1 pipeline constraints.

---

## B. Missing Specifications (Gaps That Will Block Implementation)

### B1. `collectLowConfidenceItems` is referenced but never defined

§9 returns `lowConfidenceItems: collectLowConfidenceItems(parsed)`. This function is not specified anywhere. The review UI (§10.2) renders these items with per-line dropdowns. Without knowing the schema of `lowConfidenceItems[]`, the review UI cannot be implemented.

**Fix:** Define the function and its output schema:
```js
// Returns: [{ category, lineIdx, currentValue, fieldPath, confidence }]
function collectLowConfidenceItems(parsed) {
  const items = [];
  for (let i = 0; i < parsed.dialogueLines.length; i++) {
    const d = parsed.dialogueLines[i];
    if (d.speakerConfidence < 0.7)
      items.push({ category: 'speakerAttribution', lineIdx: i,
                    currentValue: d.speakerName, fieldPath: `dialogueLines[${i}].speakerName`,
                    confidence: d.speakerConfidence });
    if (d.performanceCue && d.moodConfidence < 0.7)
      items.push({ category: 'moodClassification', lineIdx: i,
                    currentValue: d.mood, fieldPath: `dialogueLines[${i}].mood`,
                    confidence: d.moodConfidence });
  }
  return items;
}
```

### B2. AI reformat-as-screenplay prompt is not specified

§10.3 says "calls Gemini with the prose input + asks it to emit Fountain-format." The actual Gemini prompt that produces valid Fountain-compatible output is not specified. A bad prompt produces broken Fountain that fails on re-parse, potentially looping (low confidence → reformat → bad Fountain → low confidence).

**Fix:** Provide the reformat prompt. It must specify Fountain conventions. Suggested:
```
Rewrite the following prose as a properly formatted screenplay in Fountain syntax.
Rules:
- Scene headings: INT. or EXT. followed by location and time of day
- Character cues: ALL CAPS, centered (preceded by at least 4 spaces)
- Parentheticals: in () below character cue
- Dialogue: below character cue / parenthetical
- Action: left-aligned, no special formatting
- Transitions: RIGHT ALIGNED (FADE OUT, CUT TO, etc.)
Preserve all dialogue and narrative content. Do not add or remove story beats.
```

### B3. Smart-quote / em-dash normalization is mentioned but not specified

EC-FD-04 says "Normalize to ASCII before parsing." But curly quotes (`"..."`) vs straight quotes (`"..."`) change dialogue detection regex behavior (§7.1 uses `^([A-Z]...):\s+(.+)$` which may not match curly-quote contexts). What normalization library/algorithm? Where does it run? Does it affect `rawText`?

**Fix:** Specify: normalize before parsing; store original in `rawText` (per A1 fix, `rawTextOriginal` receives the verbatim original and `rawText` carries the working copy); normalization map:
- `""` → `""`, `''` → `''` (curly to straight quotes)
- `—` → `---`, `–` → `--` (em-dash / en-dash to Fountain convention)
- `…` → `...` (ellipsis)
Apply at the top of `detectInputFormat` before any regex runs.

### B4. Prose dialogue extraction is underspecified

§7.1 says the prose parser detects "Speaker-tagged dialogue" and "Quoted strings without speaker tag." But no regex or algorithm is specified for these extractions. The existing `castParseBracketTokens` (verified in codebase at js/17b line 2859) only extracts `[bracket]` tokens — it does NOT extract quoted dialogue or speaker-tagged lines. The plan claims reuse of `castParseBracketTokens` for prose parsing, but that function was designed for storyboard-prompt bracket detection, not prose dialogue extraction. A prose dialogue parser is a brand-new piece of code.

**Fix:** Write the prose dialogue extraction algorithm. This is Phase 2 in the implementation order and should be listed as "medium" risk, not "low." Suggested approach:
1. Bracket tokens: reuse `castParseBracketTokens` (existing)
2. Speaker-tagged dialogue: `^([A-Z][A-Za-z0-9 _-]{0,30}):\s+(.+)$` per the same regex shown in voice-and-lipsync-plan §7.1 Pattern A
3. Quoted dialogue: match `"([^"]+)"` or `"([^"]+)"` (after smart-quote normalization); mark as `speakerConfidence: 0.0`
4. Action paragraphs: any paragraph with no detected dialogue tokens → `actionLines[]`
5. Speaker consistency normalization: map `MAYA` / `Maya` → canonical cast-locked form

### B5. Both Gemini calls failing simultaneously is unhandled

EC-AI-05 handles mood classification failure. EC-AI-07 handles speaker inference failure. But when *both* fail in the same document, lines have `mood: 'matter-of-fact'` (fallback) and `speakerConfidence: 0.0` (null inference). This likely drops the overall score well below 0.5, triggering reformat-suggested. But the user might have perfectly good screenplay input where both AI calls are irrelevant — screenplay has explicit cues and explicit character names. The confidence model penalizes screenplay inputs with failing AI calls that shouldn't have run in the first place.

**Fix:** Skip AI classification for inputs that don't need it:
- Screenplay with explicit character cues: skip speaker inference
- Screenplay / prose with no parentheticals: skip mood classification
Adjust aggregation weights dynamically: if mood classification was skipped, redistribute its 0.2 weight to the remaining categories. If speaker inference was skipped, count those lines as `speakerConfidence: 1.0` (explicit).

---

## C. Design Concerns

### C1. `fountain-js` CDN import has no fallback, no version pinning, no offline support

§7.2 uses `import('https://cdn.jsdelivr.net/npm/fountain-js@1.x.x/...')`. The `1.x.x` semver range means any 1.x minor could be served — breaking changes are possible. No fallback if CDN is down. No offline/cached path. The existing codebase doesn't use CDN imports anywhere (verified: no `fountain` references in any JS file).

**Fix:** Pin an exact version (e.g., `fountain-js@1.2.3`). Bundle it at build time or ship it in the project's `vendor/` directory. CDN imports are acceptable for prototyping but not for a locked production plan.

### C2. Confidence thresholds measure parseability, not correctness — UX trust risk

The plan claims "> 95% accuracy on real-world inputs" (acceptance criteria §18). But the confidence score is computed from *structural signals* (regex matches, AI classification), not from *semantic correctness*. A perfectly formatted screenplay with wrong character assignments (AI says "Joe" for a Maya line) still scores 1.0 speaker attribution. Users who see "Overall confidence: 95%" will assume the content is correct, not just parseable.

**Fix:** Rename the score to "Parse confidence" (not generic "confidence") in all UI surfaces. Add a subtitle in the review UI: "Confidence reflects how cleanly we extracted structure, not whether the content is correct."

### C3. Rejected reformat has no recovery path

EC-RG-05 says "Returns to manual-review mode with original parsing." But if the original parse had < 0.5 confidence (which triggered reformat suggestion), returning means returning to an 18+ item manual review with no better path forward.

**Fix:** After rejecting reformat, offer three buttons:
1. "Manual review →" (current)
2. "← Back to edit my input" (let user fix the source text and resubmit)
3. "Try other format detection" (force-detect as 'prose' if originally 'screenplay', or vice versa)

### C4. No telemetry for reformat-as-screenplay result quality

The telemetry schema (§15) captures `reformatAttempted` and `reformatAccepted` but not the *resulting confidence* after reformat. Without this, measuring whether the reformat feature actually helps is impossible.

**Fix:** Add to telemetry:
```js
reformatResultConfidence: <float>,      // overall confidence after reformat
reformatResultFormat: 'prose' | 'screenplay',  // detected format of reformatted text
```

### C5. Implementation Phase 2 risk is underestimated

Phase 2 (prose parser) is listed as "low" risk. Given that `castParseBracketTokens` does not handle speaker-tagged dialogue or quoted-string extraction (see B4), this phase requires writing a brand-new parser with multiple regex passes, smart-quote normalization, and action-line heuristics. That is at least "medium" risk.

**Fix:** Re-rate Phase 2 as **medium** risk. The prose parser is the core feature for prose input and has no existing implementation to reuse.

---

## Summary

| Category | Count | Severity |
|---|---|---|
| Logical inconsistencies | 5 | A1 (high), A2 (medium), A3 (medium), A4 (low), A5 (low) |
| Missing specifications | 5 | B1 (medium), B2 (high), B3 (medium), B4 (high), B5 (medium) |
| Design concerns | 5 | C1 (medium), C2 (low), C3 (low), C4 (low), C5 (medium) |

**Must-fix before implementation:** A1 (rawText immutability), B2 (reformat prompt), B4 (prose parser algorithm). Estimated additional spec work: ~2 days.