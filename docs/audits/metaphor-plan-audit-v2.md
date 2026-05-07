# Metaphor Plan Audit Report (v2)

**Auditor:** Senior Engineer Review  
**Date:** 2026-04-23  
**Plan Under Review:** `metaphor-plan.md` (updated version)

---

## Audit Resolution Summary

### Previously Identified Issues — Now Addressed

| Issue (v1 Audit) | Resolution in v2 |
|------------------|------------------|
| P0: CSS variable inventory missing | ✅ **Addressed** — Phase 1 now requires inventory as prerequisite task (§11, task 0) |
| P0: Agent panel visibility method | ✅ **Addressed** — §8 now specifies `visibility: hidden` (not `display: none`) for CenterDisc content routing |
| P0: Emoji reel drawer lifecycle | ✅ **Addressed** — §8 now specifies precise trigger, timing (260ms/180ms), z-index, and CSS-driven behavior |
| P1: Scroll-snap + dynamic content | ✅ **Addressed** — §7 specifies `scroll-snap-stop: always` + resize debounce |
| P1: Dial phase sync race condition | ✅ **Addressed** — §8 explicitly states dial is "viewer, not a controller" — one-way sync only |
| P1: Scene card wrapper ambiguity | ✅ **Addressed** — §7 explicitly uses CSS descendant selectors, no JS modification |
| P2: Transport bar edge behavior | ✅ **Addressed** — §7 specifies first/last frame disable + 300ms debounce |
| P2: CenterDisc content routing | ✅ **Addressed** — §8 specifies `visibility` toggle, no DOM movement |
| P2: Z-index hierarchy | ✅ **Addressed** — §2 now defines centralized z-index stack as CSS custom properties |
| P3: Metaphor transition | ✅ **Addressed** — §7/§8 specify 220ms cross-fade with scroll position handling |

---

## Remaining Issues (New Findings)

### P1: Z-Index — Modals Below Grain

**Current spec (§2):**
```
--z-grain:     9000;  /* pointer-events: none */
--z-scanline:  8500;  /* pointer-events: none */
--z-modal:     8000;  /* any future dialog / file picker */
```

**Issue:** Modals at `8000` render **visually behind** grain at `9000`. While grain has `pointer-events: none` (clicks pass through), modals will appear dimmed/underlaid by the grain overlay. This is visually wrong — modals should appear on top of all decorative overlays.

**Recommendation:**
```css
:root {
  --z-base:           1;
  --z-frame-content:  100;
  --z-sprockets:      400;
  --z-chrome:         300;
  --z-dial:           200;
  --z-leader-trailer: 150;
  --z-modal:          500;   /* above chrome, below grain */
  --z-scanline:       8500;
  --z-grain:          9000;
}
```

Wait — actually, if modals should appear ABOVE grain (for full visual clarity), the order should be:
```css
--z-modal:  9500;  /* above grain */
--z-grain:  9000;
--z-scanline: 8500;
```

**Clarification needed:** Should modals appear above or below grain? I recommend **above** for visual clarity.

---

### P2: Developing-Plate Animation — Pure CSS Claim

**Current spec (§7):**
> "The developing-plate wipe animation fires on `<img>` load via a CSS `animation` on the wrapper keyed by `:has(img[src])` or `img.complete` — pure CSS, no JS coordination."

**Issue:** CSS `:has()` cannot detect `img.complete`. The `:has(img[src])` selector only checks for presence of `src` attribute, not load completion. Cached images may already have `complete = true` when the page loads, but CSS has no way to detect this.

**What actually happens:**
1. Image loads → no CSS event for load completion
2. Browser sets `img.complete = true` → no CSS selector reflects this
3. Animation won't trigger for cached images

**Recommendation:** Add minimal JS coordination:
```css
/* CSS only handles the animation */
.fs-scene-frame:has(img.loaded) .plate { animation: wipe 0.5s; }
```
```javascript
// One line in 17c-create-pipeline.js or image onload handler
img.addEventListener('load', () => img.classList.add('loaded'));
```

This is additive (doesn't break existing logic) and enables the animation for both fresh and cached images.

---

### P2: Scroll-Snap Re-enable Timing

**Current spec (§7):**
> "Pointer-up snaps to nearest act via `scrollTo({ left: nearestActLeft, behavior: 'smooth' })` then re-enables snap."

**Issue:** If snap is re-enabled **immediately after** `scrollTo` is called, but the smooth scroll is still animating, native scroll-snap may fight the JavaScript-driven scroll animation.

**Recommendation:** Re-enable snap **after** the smooth scroll completes:
```javascript
// In 23-filmstrip.js
function onPointerUp() {
  container.style.scrollSnapType = 'none';
  const nearestActLeft = computeNearestAct();
  container.scrollTo({ left: nearestActLeft, behavior: 'smooth' });
  
  // Wait for scroll to complete
  container.addEventListener('scrollend', function onEnd() {
    container.removeEventListener('scrollend', onEnd);
    container.style.scrollSnapType = 'x mandatory';
  });
}
```

Note: `scrollend` event may need polyfill for Safari < 15.4. Alternative: use `IntersectionObserver` to detect when target act is centered.

---

### P3: SessionStorage Graceful Degradation

**Current spec (§7):**
> "Leader countdown plays once per session via sessionStorage flag."

**Issue:** In private browsing mode, `sessionStorage` may be unavailable or throw on access. The countdown would play on every page load.

**Recommendation:** Wrap in try/catch:
```javascript
try {
  if (!sessionStorage.getItem('stori_seen_leader')) {
    // play countdown
    sessionStorage.setItem('stori_seen_leader', '1');
  }
} catch (e) {
  // Private mode — play countdown anyway
  // play countdown
}
```

Not critical — just a minor UX difference in private browsing.

---

### P3: Visibility Check for Emoji Reel

**Current spec (§8):**
> "Trigger: `data-metaphor='reel'` AND dial's focused inner-ring agent is `image` AND `#reel-emoji-reel` is not in `hidden` state."

**Issue:** "Not in `hidden` state" is ambiguous. Is it checking:
- `visibility: hidden` CSS property?
- `hidden` HTML attribute?
- A JS-controlled class?

The underlying `js/22-emoji-reel.js` controls visibility. The plan should clarify how to detect when the emoji reel is "active" (image generation running) vs "inactive".

**Recommendation:** Specify the detection method:
```css
/* CSS checks for the visibility class that 22-emoji-reel.js adds/removes */
#reel-emoji-reel:not(.hidden) { /* drawer positioning */ }
```

And confirm that `22-emoji-reel.js` adds/removes a `.hidden` class when showing/hiding.

---

## Minor Observations (No Action Required)

### A. Z-Index Values for `--z-chrome`
 
The plan shows:
```css
--z-sprockets: 400;
--z-chrome:    300;
```

Sprockets at 400 appear above chrome at 300. This is correct — sprockets overlay the chrome. But verify that the top chrome (`.fs-top-chrome`) is positioned at `--z-chrome` and sprockets naturally above it.

### B. Act Gating Implementation

§7 specifies:
> "Progressively-unlocked acts: `opacity: 0.3; pointer-events: none` until previous completes."

This is clear, but the unlocking mechanism isn't fully specified. The `copilot:act` event fires when an act completes, but which JS enables the next act? Should `23-filmstrip.js` remove the `opacity: 0.3` from the next act's `.fs-act`?

**Status:** Minor gap, will be resolved during implementation.

---

## Verification Matrix

| Concern | Status | Notes |
|---------|--------|-------|
| CSS variable inventory | ✅ Resolved | Prerequisite task in Phase 1 |
| Agent panel visibility | ✅ Resolved | Uses `visibility`, not `display` |
| Emoji reel lifecycle | ✅ Resolved | Precise timing and CSS-driven |
| Scroll-snap dynamic | ✅ Resolved | Stop: always + debounce |
| Phase sync race | ✅ Resolved | One-way sync (dial is viewer) |
| Scene card wrapper | ✅ Resolved | CSS descendant selectors |
| Transport edge cases | ✅ Resolved | First/last disable + debounce |
| CenterDisc routing | ✅ Resolved | Visibility toggle |
| Z-index stack | ⚠️ Minor | Modal placement relative to grain needs clarification |
| Developing plate | ⚠️ Minor | CSS-only claim needs minimal JS addition |
| Scroll-snap timing | ⚠️ Minor | Re-enable after scrollend |
| Private browsing | ⚠️ Minor | SessionStorage fallback |

---

## Files Requiring Modification (Final)

| File | Change | Priority |
|------|--------|----------|
| `css/themes.css` | Complete variable inventory from §11 task 0 | P0 |
| `js/17c-create-pipeline.js` | Exception 2 dispatches + img.load class (new) | P1/P2 |
| `js/20-reels-creator.js` | Exception 1 dispatch | P1 |
| `js/24-reel.js` | Exception 1 listener + scrollend handling | P1/P2 |
| `js/23-filmstrip.js` | Drag/snap + scrollend polyfill | P2 |
| `css/filmstrip.css` | Z-index values (verify modal placement) | P1 |
| `css/reel.css` | Z-index values | P1 |

---

## Overall Assessment

**The plan is now implementation-ready** with minor clarifications needed for:

1. Modal z-index relative to grain (P1)
2. Developing-plate animation triggering (P2)
3. Scroll-snap re-enable timing (P2)

These are straightforward fixes that don't change the architecture. The one-way sync design for the dial, CSS-only scene card styling, and explicit z-index stack are all sound decisions.

**Recommendation:** Proceed with Phase 1 (CSS inventory) while clarifying the P1/P2 items above.

---

**End of Audit Report (v2)**
