# ADR-SP-002 — Schema Detection by Field Presence, Not by Mode State

**Status:** Accepted  
**Date:** 2026-05-02  
**Phases affected:** P5 (VO formatter + markdown download), P3, P4 (render branches)

---

## Context

`formatScriptToPlainText()`, `renderFinalScript()`, and `renderScriptMarkdown()` all need to identify the shape of a parsed script JSON object and dispatch to the correct branch. There are two ways to do this:

1. **Read `brainstormState.mode`** at call time — use the live mode state to decide.
2. **Detect the schema shape from the object itself** — inspect which fields are present.

---

## Decision

**Detect schema shape by field presence** using a `detectScriptShape(s)` function:

```js
function detectScriptShape(s) {
  if (s.characters !== undefined && s.acts !== undefined)  return 'film-narrative';
  if (s.core_claim !== undefined)                          return 'brand-product';
  if (s.hook !== undefined && s.concept === undefined)     return 'autopilot';
  return 'copilot';
}
```

This function is called inside `formatScriptToPlainText()`, `renderFinalScript()`, and `renderScriptMarkdown()` rather than reading `brainstormState.mode`.

---

## Consequences

**Positive:**
- **Future-proof re-import.** In v2, a user can load a downloaded `.md` file back into Stori. The parser extracts the JSON from the file and calls these functions without a live `brainstormState.mode`. Field-based detection works regardless of session context.
- **Decoupled from state.** The render and formatter functions are pure with respect to the script object — they don't need to know the session mode. Easier to test in isolation.
- **No ambiguity when `pipeline !== mode`.** When a Brand/Product script is sent to Autopilot, `brainstormState.mode === 'brand-product'` but `brainstormState.pipeline === 'autopilot'`. If `renderFinalScript()` read `mode`, it would correctly render the brand schema. But using field detection makes this explicit and self-documenting.

**Negative:**
- The field detection depends on the schemas being distinct. This is enforced by the finalise prompts (each schema produces unique identifying fields). Risk: if a future schema omits its identifying field, detection falls back to `'copilot'`. Mitigation: keep `characters`+`acts` (film), `core_claim` (brand), and `hook`+no-`concept` (autopilot) as required fields in their respective finalise prompts.

---

## Detection Order Rationale

```
1. film-narrative: characters + acts (most specific — two required fields)
2. brand-product: core_claim (specific required field, not in any other schema)
3. autopilot: hook without concept (hook exists in brand-product too, so concept absence is the discriminator)
4. copilot: fallback (has concept, no hook, no core_claim, no characters)
```

This order is deterministic and non-ambiguous for the four defined schemas. Adding a fifth schema in the future requires adding a new detection case before the `return 'copilot'` fallback.

---

## Options considered

### Option A (chosen) — Field-based `detectScriptShape()`
Self-contained, re-importable, pure.

### Option B — Read `brainstormState.mode` directly
Simpler in the short term, but couples render/format functions to live session state. Breaks on v2 re-import. Not chosen.

### Option C — Pass `mode` as an argument to each function
```js
formatScriptToPlainText(s, mode)
```
Works for the current session but still breaks re-import (caller must supply the mode). Also adds a parameter to functions that don't logically need it — the mode is intrinsic to the script object, not an external input. Not chosen.
