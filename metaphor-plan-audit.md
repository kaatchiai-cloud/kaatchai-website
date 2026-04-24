# Metaphor Plan Audit Report

**Auditor:** Senior Engineer Review  
**Date:** 2026-04-23  
**Plan Under Review:** `metaphor-plan.md`

---

## Executive Summary

The plan is well-structured and comprehensive, but I identified **12 issues** ranging from minor gaps to potential architectural conflicts.

---

## Critical Issues (P0)

### 1. CSS Variable Collision Risk

**Claim:** "Every existing CSS variable used in the editor gets a light counterpart in `css/themes.css`."

**Gap:** The plan doesn't enumerate all CSS variables that need light variants. A partial audit is provided for the editor, but:

| Area | Listed? | Risk |
|------|---------|------|
| Editor | Partial | High — waveform, playhead, ruler |
| Landing | Not listed | Medium — hero, CTA, cards |
| Copilot | Not listed | High — agent panel, scene cards |
| Autopilot | Not listed | High — dial chrome, CenterDisc |

**Recommendation:** Create a complete CSS variable inventory before Phase 1.

---

### 2. Agent Panel Visibility Conflict (Autopilot)

**Claim:** "Stays mounted (hidden via CSS when `data-metaphor='reel'`) — its data still drives the inner ring states."

**Gap:** Hiding via `display: none` vs `visibility: hidden` has different implications for dimensional calculations. The plan doesn't specify which method.

**Recommendation:** Use `visibility: hidden` + `position: absolute` + `left: -9999px` to preserve dimensions.

---

### 3. Emoji Reel Drawer Timing

**Claim:** "Moves to a collapsible drawer that slides in from bottom-right when `image` agent is active."

**Gap:** No specification of trigger, duration, z-index, or close behavior.

**Recommendation:** Define drawer lifecycle in Phase 6 specification.

---

## High-Priority Issues (P1)

### 4. Filmstrip Scroll Snap + Dynamic Content

**Claim:** "`scroll-snap-type: x mandatory` on the filmstrip container."

**Gap:** Scroll snap behaves unpredictably with dynamic content, async image loading, and window resize.

**Recommendation:** Add `scroll-snap-stop: always` and implement Intersection Observer.

---

### 5. Dial Phase Synchronization Race Condition

**Claim:** "When `20-reels-creator.js` advances the phase, `24-reel.js` listens for the phase change."

**Gap:** No synchronization mechanism defined. Missing bidirectional sync and edge cases.

**Recommendation:** Implement bidirectional sync with `{ source: 'dial' }` flag.

---

### 6. Scene Card Wrapper Ambiguity

**Claim:** "Each scene card gets additional CSS class `.fs-scene-frame`."

**Gap:** Scene cards are rendered dynamically by JS. Adding the class requires modifying render functions, contradicting "JS files — untouched."

**Recommendation:** Use CSS selector `.create-step .scene-card` OR update plan to include pipeline modifications.

---

## Medium-Priority Issues (P2)

### 7. Transport Bar Arrows Behavior
**Gap:** Edge cases (first/last frame, animation in progress) not specified.

### 8. CenterDisc Content Routing
**Gap:** DOM moving vs display toggle not specified. Event delegation may break.

### 9. Leader/Trailer Injection Timing
**Gap:** SVG creation timing not specified. May delay time-to-interactive.

### 10. Z-Index Hierarchy Undefined
**Gap:** No z-index values for sprockets, grain overlay, chrome, modals.

---

## Low-Priority Issues (P3)

### 11. Responsive Breakpoints Missing
**Gap:** No mobile behavior for filmstrip scroll, dial interactions, card grid.

### 12. Metaphor Transition Behavior
**Gap:** Animation type, scroll position preservation, form state preservation not specified.

---

## Files Requiring Modification (Revised)

| File | Change | Priority |
|------|--------|----------|
| `css/themes.css` | Complete variable inventory | P0 |
| `js/17c-create-pipeline.js` | Add `.fs-scene-frame` to render | P1 |
| `js/24-reel.js` | Bidirectional phase binding | P1 |
| `css/filmstrip.css` | Z-index, scroll-snap-stop | P1/P2 |
| `js/23-filmstrip.js` | Scrollend fallback, resize debounce | P1 |

---

**End of Audit Report**
