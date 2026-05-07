# Metaphor Plan Audit Report (v3 — Codebase Comparison)

**Auditor:** Senior Engineer Review  
**Date:** 2026-04-23  
**Plan Under Review:** `metaphor-plan.md`  
**Method:** Direct codebase comparison against plan claims

---

## Executive Summary

Fresh audit comparing plan specifications against actual codebase. Found **8 issues** — 2 P1, 4 P2, 2 P3.

---

## P1: Critical Issues

### 1. `navigateTo()` Function Location Incorrect

**Plan Claim (§4 Exception 3):**
> `js/18-navigation.js` — One-line set of `data-section` on route change

**Codebase Reality:**
The file `js/18-navigation.js` is only ~103 lines and contains event handlers for new project, home button, and drop zone. It does **NOT** contain a `navigateTo()` function.

Evidence shows `navigateTo('editor')` and `navigateTo('home')` are CALLED in this file, but the function must be DEFINED elsewhere (likely `js/01-core.js`).

**Resolution Required:** Find actual location of `navigateTo()` and update Exception 3 to reference correct file.

---

### 2. No Existing Event Dispatch Pattern in Target Files

**Plan Claim (§4 Exceptions 1 and 2):**
> Add `dispatchEvent(new CustomEvent('reel:phase', {...}))` in `js/20-reels-creator.js`
> Add `dispatchEvent(new CustomEvent('copilot:act', {...}))` in `js/17c-create-pipeline.js`

**Codebase Reality:**
- `js/20-reels-creator.js` has only 1 `dispatchEvent` call — for a form element `change` event, not phase tracking
- `js/17c-create-pipeline.js` has **zero** `dispatchEvent` or `CustomEvent` usage

**Gap:** Neither file has existing event dispatch patterns. Developers must determine WHERE in 3000+ line files to add dispatches (at which phase transition points).

**Resolution Required:** Plan must specify exact function/line locations within these large files.

---

## P2: Implementation Risks

### 3. Emoji Reel Uses `hidden` Attribute, Not Class

**Plan Claim (§8):**
> "Trigger: ... AND `#reel-emoji-reel` is not in `hidden` state"

**Codebase Reality:**
```html
<div id="reel-emoji-reel" class="emoji-reel" hidden aria-hidden="true">
```

The emoji reel uses HTML5 `hidden` attribute, NOT a `.hidden` CSS class.

**Fix Required:**
```css
/* WRONG */
#reel-emoji-reel:not(.hidden) { }

/* CORRECT */
#reel-emoji-reel:not([hidden]) { }
```

---

### 4. Reel Phase Variable Names Unknown

**Plan Claim (§8):**
> Phase mapping: `idle:'record', recording:'record', transcribing:'script', ...`

**Codebase Reality:**
`js/20-reels-creator.js` has "Phase 1-5" in comments but grep shows no `phase` variable. State may be tracked differently (`_phase`, `currentStep`, workflow state).

**Resolution Required:** Verify actual state variable name before implementing Exception 1.

---

### 5. Create Steps Have Dynamic Visibility

**Codebase Reality:**
```html
<div class="create-step" id="create-transcribe-step" style="display:none;">
<div class="create-step hidden" id="create-chapter-step" style="display:none;">
```

**Gap:** Steps start hidden with `style="display:none;"` and/or `class="hidden"`. Filmstrip must handle dynamically appearing/disappearing acts.

---

### 6. Agent Panel Width is 196px, Not 260px

**Plan Claim:**
> `#create-agent-panel` (docked left, ~260px)

**Codebase Reality:**
```css
#create-agent-panel { width: 196px; }
```

**Fix Required:** Filmstrip act width should be `calc(100vw - 196px)`, not `calc(100vw - 260px)`.

---

## P3: Minor Issues

### 7. Z-Index Overlap with Existing Modals

**Codebase Reality:** Existing modals use `z-index: 8000-10000`. Plan's `--z-grain: 9000` overlaps with `publish-overlay` at `z-index: 9000`.

### 8. No `scrollend` Polyfill

**Plan Claim:** Re-enable snap after `scrollend`.  
**Reality:** Safari < 15.4 doesn't support `scrollend`. Need polyfill.

---

## Verified Correct

| Claim | Status |
|-------|--------|
| `#create-workflow` exists | ✅ |
| `#reel-step-*` elements exist | ✅ |
| Agent panel has correct ID | ✅ |
| Emoji reel in both panels | ✅ |
| `.create-step`, `.reel-step` classes | ✅ |
| No existing `data-theme` logic | ✅ |

---

## Files Requiring Modification (Corrected)

| File | Change |
|------|--------|
| `js/01-core.js` or similar | Exception 3 (actual location TBD) |
| `js/20-reels-creator.js` | Exception 1 (needs location specification) |
| `js/17c-create-pipeline.js` | Exception 2 (needs location specification) |
| `css/filmstrip.css` | Use 196px width, correct `hidden` selector |
| `js/23-filmstrip.js` | Add `scrollend` polyfill |

---

## Risk Assessment

- **Phase 1:** Low — CSS and localStorage only
- **Phase 2:** Medium — Needs location verification for Exception 2
- **Phase 3:** Medium-High — Needs location + phase variable verification

---

**End of Audit Report (v3)**
