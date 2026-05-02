# ADR-011 — Specificity guard against `#create-page` global rules

- **Status:** Accepted (2026-05-01)
- **Affected phases:** P02, P03, P04, P05, P06, P07

## Context

`css/styles.css:3677` contains a global rule for `<textarea>` inside `#create-page`:

```css
#create-page textarea,
...
{
  /* layout, font, color, padding, focus, hover */
}
```

This rule exists to style the editor's various script/dialogue/note textareas across `#create-page`. It has selector specificity `#id elem` = (1, 0, 1).

Before the canvas redesign, the SB script textarea inside the canvas (`<textarea class="cg-prompt">`) was being silently overridden by this rule — the canvas-graph.css `.cg-prompt` rule had specificity `(0, 1, 0)` and lost the cascade. The fix at `css/canvas-graph.css:957–974` was:

```css
/* Specificity bump (#create-canvas-step) needed to beat #create-page textarea */
#create-canvas-step textarea.cg-prompt {
  /* canvas-specific styles */
}
```

Now `#create-canvas-step textarea.cg-prompt` has specificity `(1, 1, 1)` and wins.

The redesign introduces many new elements inside `#create-canvas-step` that may also be styled by global `#create-page` rules:
- `<button>` — selection toolbar buttons, context menu items, stepper arrows, SB tabs, `+` add tiles, top-pill controls
- `<input>` — possibly seed input (if not a stepper)
- `<select>` — cursor mode dropdown, model dropdown
- `<textarea>` — already covered (`.cg-prompt`)
- Possibly `<a>`, `<label>`, etc.

If any of these are styled by a `#create-page` rule, the canvas-graph.css rule will lose without an explicit specificity bump. The bug surfaces as "this canvas element looks like a normal editor button" instead of the canvas chrome design.

## Decision

### 1 — Codify the specificity-guard rule

**Any selector in `canvas-graph.css` that targets an element type already styled by a `#create-page X` rule (where X is the element type) MUST use the `#create-canvas-step` prefix.**

Examples:
```css
/* WRONG — loses to #create-page button */
.cg-toolbar-btn { ... }

/* RIGHT — wins by adding #id */
#create-canvas-step .cg-toolbar-btn { ... }
```

Specificity comparison:
- `#create-page button` = (1, 0, 1)
- `.cg-toolbar-btn` = (0, 1, 0) — LOSES
- `#create-canvas-step .cg-toolbar-btn` = (1, 1, 0) — WINS

### 2 — Pre-flight check during phase implementation

Before adding a new rule that targets `<button>`, `<input>`, `<select>`, `<textarea>`, `<a>`, `<label>`, or any other generic HTML element inside the canvas, the engineer:

1. Greps `css/styles.css` for `#create-page <element>` rules.
2. If a match exists, applies the `#create-canvas-step` prefix.
3. If no match, the bare class selector is OK — but consider whether a future global rule might be added; defensively prefix.

Recommended default: **prefix everything** that targets a generic element name (`button`, `input`, `textarea`, `select`, `ul`, `li`).

### 3 — Class-only selectors are exempt

Selectors that target only classes (e.g. `.cg-thumb`, `.variant-tray--img`) are not affected because no `#create-page` global rule should target a `.cg-*` or canvas-specific class. The guard is for generic-element selectors.

### 4 — Existing canvas-graph.css audit (P04 entry-task)

When P04 begins, the engineer audits the current `canvas-graph.css` for selectors that target generic elements without the prefix. Most should already have the prefix per the existing precedent at `:957–974`. Document any exceptions.

### 5 — Future-proofing

If a future PR adds a new `#create-page X` rule for an element type used in the canvas, the canvas-graph.css must be updated to add the prefix. This is a maintenance burden; document it clearly.

Alternative for future projects: scope the canvas under a different parent ID (not `#create-page`) so the global rules don't apply. Out of scope for this redesign.

## Rationale

- **The hazard is real.** The `.cg-prompt` bug already happened; the fix is documented but the pattern wasn't codified. This ADR codifies it.
- **Specificity beats `!important`.** Adding `!important` everywhere is brittle and hard to override later. Adding `#create-canvas-step` to selectors is a one-time, predictable cost.
- **Class-only selectors are safe** because the canvas owns the `.cg-*` namespace.
- **Default-defensive** is cheap; engineers don't need to grep before every new rule.

## Alternatives considered

1. **Use `!important` on canvas rules.** Rejected: hard to override; cascades incorrectly with theme-light overrides; smells.
2. **Scope canvas under a different parent ID.** Rejected: requires DOM restructure; canvas is logically inside `#create-page` (it's the create-flow's canvas).
3. **Remove the `#create-page` global rules and rely on per-component styles.** Rejected: out of scope; many other parts of the editor depend on those rules.
4. **Use shadow DOM for the canvas.** Rejected: massive refactor; loses `--lp-*` token inheritance unless explicitly forwarded.
5. **Use CSS `@layer` to control cascade.** Acceptable for future; today's CSS is not layered. Out of scope for this redesign.

## Consequences

### Positive
- Predictable cascade.
- No `!important` proliferation.
- Existing `.cg-prompt` precedent confirms the pattern works.
- One mental rule to follow.

### Negative
- Verbose selectors (`#create-canvas-step .cg-toolbar-btn` instead of `.cg-toolbar-btn`). Mitigated: minimal cost; readable.
- Engineer must remember the rule when adding new CSS. Mitigated by phase docs citing this ADR and by recommending default-prefix.
- If a `#create-page` rule has higher specificity than `(1, 0, 1)` (e.g. `#create-page .some-class button`), even the `#create-canvas-step` prefix may not be enough. Mitigated by audit during P04; document any escalation needed.
- Light-theme overrides in `themes.css` use `html[data-theme="light"]` selectors — also need the canvas-step prefix when targeting canvas elements with high specificity. Pattern: `html[data-theme="light"] #create-canvas-step .foo { ... }`.

## References

- `css/styles.css:3677` (the global `#create-page textarea` rule)
- `css/canvas-graph.css:957–974` (existing `.cg-prompt` specificity-bump precedent)
- ADR-1 (Theme tokens — `themes.css` light overrides may need same prefix)
- ADR-12 (Light-mode parity — verify both themes don't have specificity drift)
- P02 — buttons in chrome
- P04 — node sockets + status dots (class-only, exempt)
- P05/P06 — thumb buttons + steppers
- P07 — toolbar + menu + steppers
