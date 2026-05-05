# Audit Pass 3: Input Formats Plan — Final Review

Auditor: Kilo | Date: 2026-05-05 | Status: final verification
Scope: confirm all prior fixes, check for new issues introduced

---

## Verification: Pass 2 Fixes Applied

| Issue | Status | Location |
|---|---|---|
| A1: `format` enum missing `'audio'` | ✅ Fixed | §5.1 line 85 — now includes `'audio'` with cross-plan comment |
| A2: `speakerAttributionScore` defaults to 1.0 when empty | ✅ Fixed | §9 line 458 — returns `null` with explanatory comment |
| A3: Division-by-zero guard missing | ✅ Fixed | §9 lines 480-492 — returns `null` overall when `activeWeightSum === 0` |
| A4: Reformat prompt fence stripping | ✅ Fixed | §10.3 lines 656-680 — `sanitizeFountainOutput` function added |
| A5: Prose parser multi-line dialogue | ✅ Fixed | §7.1 lines 221-224, 260, 280-281, 296-335 — `[\s\S]*?` regex + `mergeContinuations` |
| A6: Input length limit | ✅ Fixed | §14 lines 758-761 — EC-FD-08, EC-FD-09, EC-FD-10 added |
| B1: fountain-js version pinning | ✅ Fixed | §7.2 line 357 — locked to `1.2.6` exact with fallback specified |
| B2: `sceneBreaks` vs `sceneHeadings` confusion | ✅ Fixed | §5.3 lines 146-152 — `sceneBreaks` removed from `perCategory`, `sceneHeadings` is canonical |

---

## Final Review: No Blocking Issues

The plan is complete and ready for implementation. All cross-references to audio-input-plan are consistent (EC-RG-02 references AI-suggest-extras flow correctly). The schema union type now includes all three formats. The confidence aggregation handles degenerate cases (no dialogue, no parentheticals, no scene headings).

---

## Minor Observations (Non-Blocking)

### M1. `mergeContinuations` heuristic may over-merge

The continuation heuristic (lines 319-327) merges action lines into dialogue when the previous dialogue ends without sentence terminator OR the action starts lowercase. This could incorrectly merge sentences that happen to be adjacent:

```
Maya: I can't believe it.
she walked away
```

The action "she walked away" starts lowercase and would be merged into the dialogue. However, this is a reasonable tradeoff — the heuristic errs on the side of more dialogue capture, and the AI speaker inference in Stage 3 can still attribute the merged text correctly. The user can also correct in the review gate.

**No change needed.** The heuristic is reasonable and the review gate provides correction opportunity.

### M2. Input length limits in telemetry

EC-FD-08 (warning at 100K chars) and EC-FD-09 (hard cap at 500K) are defined, but the telemetry schema (§15) doesn't include fields for tracking when these thresholds fire. Consider adding:

```js
inputOver100KWarningShown: <int>,
inputOver500KRejected: <int>,
```

**Low priority.** These can be added during implementation.

---

## Summary

**Status: Ready for implementation.**

All pass-2 issues have been correctly fixed. The plan is internally consistent, cross-references audio-input-plan correctly, handles edge cases including degenerate inputs, and has clear acceptance criteria.