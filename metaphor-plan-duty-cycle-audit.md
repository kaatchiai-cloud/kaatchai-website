# Metaphor Plan — Duty Cycle Audit

## What was verified

Every data flow, event dispatch, attribute change, and state transition in `metaphor-plan.md` was traced against the actual codebase (April 2026).

---

## 1. data-section attribute cycle

### Plan says
`navigateTo()` in `js/01-core.js` sets `data-section` on `<html>`.

### Codebase reality
**CORRECT.** `navigateTo()` at `js/01-core.js:282` already contains:
```js
document.documentElement.setAttribute('data-section',
  view === 'home'   ? 'landing'   :
  view === 'create' ? 'copilot'   :
  view === 'reel'   ? 'autopilot' : 'editor');
```

**Issue P1: Exception 3 is already implemented.** The plan says to add this as a new line, but it already exists (lines 283-286). The plan's Exception 3 description is stale — it describes work already done in a previous session.

**Verdict: ✅ Working. No action needed.**

---

## 2. data-metaphor attribute cycle

### Plan says
- Copilot: `data-metaphor="filmstrip"` (default) or `"aurora"` (escape hatch)
- Autopilot: `data-metaphor="reel"` (default) or `"aurora"` (escape hatch)
- Set on `#create-page` and `#reel-page` respectively

### Codebase reality
**NOT IMPLEMENTED.** No JS, HTML, or CSS file sets or reads `data-metaphor`. Zero attribute selectors exist in any CSS file.

**Duty cycle gap:**
1. Who sets `data-metaphor`? → Plan says toggle buttons in transport bar / bottom hint row
2. When? → On user click of "AURORA VIEW" toggle
3. Persisted where? → `localStorage.stori_copilot_metaphor` / `stori_autopilot_metaphor`
4. Restored when? → On route to copilot/autopilot (Plan §3 says "read by 01-core.js on route")

**Issue P2: No restore-on-route logic specified.** Plan says `01-core.js` reads these localStorage keys "on route to Copilot" but doesn't specify WHERE in `navigateTo()` this happens. The `navigateTo()` function already sets `data-section` but does NOT read/apply `data-metaphor`. This is a missing implementation step.

**Fix:** Add to `navigateTo()` after `data-section` is set:
```js
if (view === 'create') {
  const m = localStorage.getItem('stori_copilot_metaphor') || 'filmstrip';
  document.getElementById('create-page').setAttribute('data-metaphor', m);
} else if (view === 'reel') {
  const m = localStorage.getItem('stori_autopilot_metaphor') || 'reel';
  document.getElementById('reel-page').setAttribute('data-metaphor', m);
}
```

**Verdict: ❌ Not implemented. Plan needs this restore logic added.**

---

## 3. data-theme attribute cycle

### Plan says
FOUC script in `<head>` reads `stori_theme_mode` and sets `data-theme` before paint. Toggle buttons flip it.

### Codebase reality
**ALREADY IMPLEMENTED.** `js/01-core.js:352-372` has the full toggle:
- Reads `data-theme` from `<html>`, flips dark↔light
- Persists to `localStorage.stori_theme_mode`
- Delegated click on `.theme-toggle` buttons
- FOUC script in `<head>` already sets it pre-paint

**Verdict: ✅ Working.**

---

## 4. copilot:act event cycle

### Plan says (Exception 2)
Add `dispatchEvent` inside `showStep(id, show)` at `js/17c-create-pipeline.js:819`. This single chokepoint covers all act transitions.

### Codebase reality
`showStep()` at line 819 is a 4-line helper inside `updateStepStates()`:
```js
function showStep(id, show) {
    const el = $(id);
    if (el) el.style.display = show ? '' : 'none';
}
```

**6 active call sites** (1 commented out):

| Line | Call | Condition |
|------|------|-----------|
| 835 | `showStep('create-transcribe-step', hasScenes)` | Progressive |
| 839 | `showStep('create-chapter-step', isPodcast && hasTranscript)` | Mode-gated |
| ~843 | `// showStep('create-references-step', hasScenes)` | **Commented out** |
| 847 | `showStep('create-generate-step', hasImages)` | Progressive |
| 852 | `showStep('create-video-step', createVideoMode === 'animated' && hasImages)` | Mode-gated |
| 860 | `showStep('create-language-step', hasBgm && createVideoMode !== 'animated')` | Mode-gated |
| 873 | `showStep('create-send-step', hasBgm)` | Progressive |

**Issue P3: `showStep` fires for BOTH `show=true` AND `show=false`.** The plan's dispatch code is:
```js
if (show) {
  document.dispatchEvent(new CustomEvent('copilot:act', { detail: { stepId: id }}));
}
```
This only fires when a step becomes visible. When a step is **hidden** (e.g. `showStep('create-chapter-step', false)` when not podcast), no event fires. This is **correct behavior** — the filmstrip should only care about steps becoming visible, not invisible.

**Issue P4: The plan maps 6 acts but there are 8 steps.** The plan's act table (§7) groups steps into acts:
- Act 1: video-mode + input → 2 steps
- Act 2: transcribe + chapter → 2 steps
- Act 3: references → commented out (no act needed)
- Act 4: generate + video → 2 steps
- Act 5: bgm + language → 2 steps
- Act 6: send → 1 step

**This mapping is logically correct.** `showStep` dispatches `stepId`, and `js/23-filmstrip.js` maps stepIds to act names. Multiple stepIds can map to the same act — that's fine.

**Issue P5: `create-references-step` is commented out.** The plan's Act 3 (CASTING) references `#create-references-step`, but this step is always hidden in V1. The filmstrip will show Act 3 as a permanently locked/empty act.

**Fix:** Plan should explicitly state: "Act 3 (CASTING) is collapsed in V1 since `create-references-step` is commented out. When V2 enables it, the act unlocks via the same MutationObserver mechanism."

**Verdict: ⚠️ Logically correct, but plan needs V1 note for Act 3.**

---

## 5. reel:phase event cycle

### Plan says (Exception 1)
Append `dispatchEvent('reel:phase')` after each `reelStep*.classList.remove('hidden')` call.

### Codebase reality
**7 unhide call sites found:**

| Line | Variable | Context |
|------|----------|---------|
| 27 | `reelStepEditor.classList.remove('hidden')` | `showReelEditorStep()` |
| 28 | `reelStepActions.classList.remove('hidden')` | `showReelEditorStep()` (guarded) |
| 371 | `reelStepPresets.classList.remove('hidden')` | After template selected |
| 1105 | `reelStepScenes.classList.remove('hidden')` | Segment-job image generation |
| 1399 | `reelStepScenes.classList.remove('hidden')` | Single-reel generation |
| 5576 | `reelStepPresets.classList.remove('hidden')` | Session restore |
| 5584 | `reelStepScenes.classList.remove('hidden')` | Session restore with images |

**Issue P6: Plan's phase mapping is incomplete.** The plan specifies this mapping:
```js
const phaseToAgent = {
  idle:'record', recording:'record', transcribing:'script',
  script:'script', storyboard:'storyboard', image:'image',
  bgm:'bgm', preview:'preview', ready:'queue'
};
```

But the **actual unhide events** map to these phases:

| Unhide | Phase to dispatch | Agent |
|--------|-------------------|-------|
| `reelStepPresets` (line 371) | `'script'` | script |
| `reelStepScenes` (lines 1105, 1399, 5584) | `'image'` | image |
| `reelStepEditor` (line 27) | `'preview'` | preview |
| `reelStepActions` (line 28) | `'queue'` | queue |

**Missing phases with no unhide trigger:**
- `'idle'` / `'recording'` → `reelStepInput` is **never hidden/unhidden** — it's always visible
- `'transcribing'` → No step unhide for this (transcription happens internally)
- `'storyboard'` → No dedicated step element (plan says "derived mini-list from `#reel-scene-grid`")
- `'bgm'` → `reel-step-bgm` exists but was not listed in the plan's Exception 1 call sites

**Issue P7: `reel-step-bgm` is missing from Exception 1.** The codebase has a `reel-step-bgm` element that gets `classList.remove('hidden')` at lines 3265, 4456, 5445 of `20-reels-creator.js`. The plan's Exception 1 table does NOT include these call sites. Missing dispatch: `reel:phase` with `{phase: 'bgm'}`.

**Fix:** Add to Exception 1:
| Line | Call | Phase to dispatch |
|------|------|-------------------|
| 3265 / 4456 / 5445 | `reelStepBgm.classList.remove('hidden')` | `'bgm'` |

**Issue P8: No dispatch for `'recording'` and `'transcribing'` phases.** The dial needs to know when the user is recording or when transcription is happening, but no step unhide triggers these.

**Fix:** These phases need separate dispatch points:
- `'recording'` → dispatch when audio recording starts (in the audio recorder callback)
- `'transcribing'` → dispatch when transcription API is called
- `'idle'` → dispatch on page load / reset

These are **additional exceptions** not currently covered by the plan's "step unhide = phase transition" pattern.

**Verdict: ⚠️ Incomplete. Missing `reel-step-bgm` call sites + no dispatch for recording/transcribing/idle phases.**

---

## 6. MutationObserver cycle

### Plan says
`23-filmstrip.js` watches each `.create-step`'s inline `style` attribute. When `display` flips from `none` to non-none, the `.fs-act` unlocks.

### Codebase reality
Copilot steps use `style="display:none"` initially. `showStep()` toggles `el.style.display`. MutationObserver on `style` attribute **will detect this**.

**Issue P9: Mode-gated collapse needs a data-attribute.** The plan says:
> "a data-attribute marking it as mode-gated (added by filmstrip init based on `createVideoMode`)"

But `createVideoMode` can change at runtime (user switches from illustrated to animated on Step 0). When this happens:
- `create-video-step` should become visible (currently hidden, mode-gated)
- `create-chapter-step` should remain hidden (podcast-only, mode-gated)
- `create-language-step` visibility changes (gated by `createVideoMode !== 'animated'`)

**The MutationObserver on `style` will catch the `display:none` → `display:''` change from `showStep()`, so the `.fs-act` unlock works.** But the `.fs-act` **collapse** (when mode-gated step stays hidden) needs the filmstrip init to check `createVideoMode` and apply `data-mode-gated` attributes.

**Issue P10: Race condition on filmstrip init.** `createVideoMode` defaults to `'illustrated'` but can be changed by user. Filmstrip init must run AFTER `createVideoMode` is set, and must re-evaluate when user switches modes. Plan says "filmstrip init" but doesn't specify when this runs relative to the mode selection.

**Fix:** `23-filmstrip.js` should also listen for `createVideoMode` changes. Since mode selection is in Step 0 (part of Act 1), a simpler approach: re-run the mode-gated check whenever `updateStepStates()` fires (which it already does on mode change).

**Verdict: ⚠️ Workable but needs timing clarification for mode-gated re-evaluation.**

---

## 7. Escape-hatch toggle cycle

### Plan says
Toggling `data-metaphor` triggers 220ms cross-fade. Position saved before, restored after (or not, depending on direction).

### Logical analysis

**Copilot (filmstrip → aurora):**
1. Add `.is-swapping` → opacity 0 (220ms)
2. Flip `data-metaphor` to `"aurora"` → CSS hides sprockets/grain/transport via `[data-metaphor="aurora"]` selectors
3. Remove `.is-swapping` → opacity 1
4. Save horizontal scroll position; switch to vertical layout

**Issue P11: Scroll position is "NOT restored" when switching back.** Plan says:
> "Scroll position of #create-workflow is saved in a local variable before the flip and NOT restored after — when switching to Aurora (vertical), we scroll to top; when switching back to Filmstrip, we restore the saved horizontal position."

This is contradictory. It says "NOT restored" but then says "we restore the saved horizontal position." The intent is clear (different scroll direction = different position), but the wording is confusing.

**Actual behavior should be:**
- Filmstrip → Aurora: Save horizontal scrollLeft; set scrollTop = 0
- Aurora → Filmstrip: Restore saved scrollLeft

**Verdict: ⚠️ Correct logic, confusing wording. Needs rewrite.**

---

## 8. localStorage cycle

### Plan says

| Key | Default | Written by | Read by |
|-----|---------|------------|---------|
| `stori_theme_mode` | `"dark"` | Theme toggle | FOUC script, `01-core.js` |
| `stori_copilot_metaphor` | `"filmstrip"` | Copilot transport toggle | `01-core.js` on route |
| `stori_autopilot_metaphor` | `"reel"` | Autopilot bottom-hint toggle | `01-core.js` on route |

### Codebase reality
- `stori_theme_mode`: **IMPLEMENTED** — FOUC script reads it, toggle writes it
- `stori_copilot_metaphor`: **NOT IMPLEMENTED** — zero references in codebase
- `stori_autopilot_metaphor`: **NOT IMPLEMENTED** — zero references in codebase

**Issue P12: When does `01-core.js` read and apply metaphor keys?** The plan says "read by 01-core.js on route" but `navigateTo()` doesn't read these keys. This is the same as Issue P2 above.

**Verdict: ❌ Not implemented. Needs explicit code location in plan.**

---

## 9. Emoji reel drawer cycle

### Plan says
Emoji reel appears in CenterDisc when:
1. `data-metaphor="reel"` AND
2. Dial focused on `image` agent AND
3. `#reel-emoji-reel:not([hidden])` matches

### Codebase reality
`#reel-emoji-reel` uses HTML5 `hidden` attribute (verified `index.html:2484`):
```html
<div id="reel-emoji-reel" class="emoji-reel" hidden aria-hidden="true">
```

**Issue P13: Plan correctly uses `:not([hidden])` selector.** Previous audits flagged this — the v3 plan already has the correct selector. ✅

**Issue P14: Drawer exit timing.** Plan says:
> "When 22-emoji-reel.js hides the reel (image generation ends), this drawer collapses automatically via the same CSS condition."

This works because removing `hidden` attribute triggers CSS match change. But the 180ms exit transition means there's a brief moment where the drawer is transitioning out while `hidden` is already set (which applies `display:none`). The transition won't complete because `display:none` kills animations instantly.

**Fix:** Instead of relying on `hidden` attribute for exit, use a two-step approach:
1. `22-emoji-reel.js` sets `hidden` attribute
2. `24-reel.js` listens for `attributes` change on `reel-emoji-reel` (MutationObserver), adds `.reel-drawer-exit` class, waits 180ms, then lets `hidden` take effect
3. OR: Don't use HTML5 `hidden` for this element — use CSS class `.emoji-reel-hidden` instead, which allows transitions

**Verdict: ⚠️ Exit transition will be cut short by `display:none` from `hidden` attribute. Need CSS-level fix.**

---

## 10. Z-index stack

### Plan says
```
--z-sprockets: 400
--z-chrome: 300
--z-dial: 200
--z-leader-trailer: 150
--z-frame-content: 100
--z-scanline: 90
--z-grain: 80
--z-base: 1
```

### Logical analysis

**Issue P15: Grain at z-index 80 is BELOW frame-content at 100.** Plan says grain is "above content, below chrome" but the z-index values show grain BELOW content. If grain is at 80 and content at 100, grain will be invisible behind the content.

**Intent from plan text:** §13 says "they sit above content, below chrome" — this means grain should be ABOVE content but BELOW modals.

**Fix:** Swap grain and content:
```
--z-frame-content: 80    /* was 100 */
--z-grain: 100            /* was 80 */ 
--z-scanline: 110         /* was 90 */
```

OR keep numbers but add `pointer-events: none` to grain and let it sit above content visually (grain needs to overlay content to be visible).

**Wait — re-reading the plan:** The grain is a **fixed full-viewport SVG noise overlay** with `pointer-events: none`. It MUST be above content to be visible. The z-index values in §2 are wrong.

**Verdict: ❌ P1 BUG. Grain z-index 80 < frame-content 100 means grain is invisible. Must be reversed.**

---

## Summary of Issues

| # | Severity | Description | Fix |
|---|----------|-------------|-----|
| P1 | ❌ BUG | Grain z-index (80) < frame-content (100) — grain invisible | Swap: grain=100, scanline=110, content=80 |
| P2 | ❌ MISSING | `data-metaphor` restore-on-route not implemented | Add localStorage read in `navigateTo()` |
| P3 | ⚠️ INFO | Exception 3 already implemented | Remove from plan, mark as done |
| P4 | ⚠️ INFO | `showStep` fires for show=true only — correct | No fix needed |
| P5 | ⚠️ NOTE | Act 3 (CASTING) always hidden in V1 | Add V1 note to plan |
| P6 | ⚠️ GAP | Phase mapping doesn't cover recording/transcribing/idle | Add separate dispatch points |
| P7 | ❌ MISSING | `reel-step-bgm` unhide not in Exception 1 | Add 3 call sites (lines 3265, 4456, 5445) |
| P8 | ❌ MISSING | No dispatch for recording/transcribing/idle phases | Add audio-callback + transcription-start dispatches |
| P9 | ⚠️ GAP | Mode-gated re-eval on `createVideoMode` change | Listen for mode change in filmstrip |
| P10 | ⚠️ GAP | Filmstrip init timing vs mode selection | Specify: init on page show, re-eval on mode change |
| P11 | ⚠️ WORDING | Scroll restore description contradictory | Clarify: save H-scroll → aurora; restore H-scroll ← filmstrip |
| P12 | ❌ MISSING | localStorage metaphor keys not read on route | Same as P2 |
| P13 | ✅ OK | `:not([hidden])` selector correct | No fix needed |
| P14 | ⚠️ BUG | Emoji reel exit transition killed by `hidden` attribute | Two-step exit or CSS class instead of `hidden` |
| P15 | ❌ BUG | Same as P1 (grain z-index) | Same fix |

**Critical (P1/P2/P7/P8):** 4 issues that will break functionality
**Important (P5/P6/P9/P10/P14):** 5 issues that need plan clarification
**Cosmetic (P3/P4/P11/P12/P13):** 5 issues, mostly wording

---

## Corrected Z-Index Stack

```css
:root {
  --z-sprockets:      400;
  --z-chrome:         300;
  --z-dial:           200;
  --z-leader-trailer: 150;
  --z-grain:          100;   /* FIXED: above content so noise overlay is visible */
  --z-scanline:       110;   /* FIXED: above grain, below chrome */
  --z-frame-content:   80;   /* FIXED: below grain */
  --z-base:             1;
}
```

---

## Corrected Exception 1 (reel:phase dispatches)

Add these dispatch sites to the plan:

| Line | Call | Phase to dispatch |
|------|------|-------------------|
| 27 | `reelStepEditor.classList.remove('hidden')` | `'preview'` |
| 28 | `reelStepActions.classList.remove('hidden')` | `'queue'` |
| 371 | `reelStepPresets.classList.remove('hidden')` | `'script'` |
| 1105 | `reelStepScenes.classList.remove('hidden')` | `'image'` |
| 1399 | `reelStepScenes.classList.remove('hidden')` | `'image'` |
| **3265** | **`reelStepBgm.classList.remove('hidden')`** | **`'bgm'`** ← MISSING |
| **4456** | **`reelStepBgm.classList.remove('hidden')`** | **`'bgm'`** ← MISSING |
| **5445** | **`reelStepBgm.classList.remove('hidden')`** | **`'bgm'`** ← MISSING |
| 5576 | `reelStepPresets.classList.remove('hidden')` | `'script'` |
| 5584 | `reelStepScenes.classList.remove('hidden')` | `'image'` |

**New dispatches needed (no step unhide trigger):**

| When | Phase | Where |
|------|-------|-------|
| Page load / reset | `'idle'` | `01-core.js` on route to `'reel'` |
| Audio recording starts | `'recording'` | Audio recorder callback in `20-reels-creator.js` |
| Transcription API called | `'transcribing'` | Transcription start in `20-reels-creator.js` |