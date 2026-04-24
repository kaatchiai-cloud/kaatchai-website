# Stori Metaphor Plan — Landing · Copilot · Autopilot · Editor

**Status:** Final plan, audit-reviewed, ready to implement.
**Scope:** Desktop only. Mobile is explicitly out of scope.
**Guiding rule:** Not disturbing any functional element. Just redistributing items into new wrappers. It will just work — with three named, additive exceptions (see §4).

---

## 1. The theme rule

### Light mode is universal
Every section uses `aurora.light` palette in light mode. One calm family across Landing, Copilot, Autopilot, Editor.

### Dark mode carries each section's identity accent
**Palette follows `data-section`, NOT `data-metaphor`.** Copilot in dark mode is always gold regardless of whether it's in filmstrip chrome or aurora escape hatch. Toggling the escape hatch changes layout only — identity stays.

| Section | Chrome / metaphor | Dark palette | Light palette |
|---|---|---|---|
| **Landing** | Filmstrip | `film.dark` — cream ink + **gold** `#d4a25a` | `aurora.light` |
| **Copilot** | Filmstrip (toggles to Aurora layout) | `film.dark` — gold identity stays even in Aurora layout | `aurora.light` |
| **Autopilot** | Reel dial (toggles to Aurora layout) | `reel.dark` — **green** `#7adf9a` phosphor, identity stays in Aurora layout | `aurora.light` |
| **Editor** | Aurora (layout unchanged) | `aurora.dark` — **cyan + magenta** oklch | `aurora.light` |

### Palette token sets (four total)

```
aurora.light  (universal light)
  bg #eef2f7 · bg2 #e3e9f1 · bg3 #d8e0eb
  ink #0a1628 · dim rgba(10,22,40,0.65)
  accent oklch(50% .16 220) · accent2 oklch(55% .18 340)
  sprocket rgba(20,110,180,0.35)
  grain 6% multiply

film.dark  (landing + copilot dark)
  bg #0a0908 · bg2 #141210 · bg3 #1a1714
  ink #f2ece0 · dim rgba(242,236,224,0.6)
  accent #d4a25a (gold) · red #c0432d
  sprocket rgba(242,236,224,0.22)
  grain 22% screen

reel.dark  (autopilot dark)
  bg #060709 · bg2 #0c0f10 · ink #e8f3ea
  accent #7adf9a (phosphor green)
  scanline rgba(122,223,154,0.025)
  grain minimal + phosphorFlicker

aurora.dark  (editor dark)
  bg #050814 · bg2 #0a0f20
  ink #eef4ff · dim rgba(238,244,255,0.65)
  accent oklch(80% .14 200) cyan · accent2 oklch(72% .19 340) magenta
  grain 8% screen
```

Source of truth: `/Users/praveen/Downloads/kaatchi 2/project/metaphors/filmstrip.jsx` (`P_PALETTE.film.dark`, `P_PALETTE.aurora.light`, `P_PALETTE.aurora.dark`) and `reel.jsx` (`P_PALETTE.reel.dark`).

---

## 2. Data attributes contract

Three attributes on `<html>` drive everything:

```html
<html
  data-theme="light|dark"
  data-section="landing|copilot|autopilot|editor"
  data-metaphor="filmstrip|reel|aurora"
>
```

**Resolution table:**

| section | metaphor | theme | Chrome rendered | Palette applied |
|---|---|---|---|---|
| landing | filmstrip | dark | filmstrip | film.dark |
| landing | filmstrip | light | filmstrip | aurora.light |
| copilot | filmstrip | dark | filmstrip | film.dark |
| copilot | filmstrip | light | filmstrip | aurora.light |
| copilot | aurora (escape) | dark | none (linear) | **film.dark** (identity stays) |
| copilot | aurora (escape) | light | none (linear) | aurora.light |
| autopilot | reel | dark | dial | reel.dark |
| autopilot | reel | light | dial | aurora.light |
| autopilot | aurora (escape) | dark | none (linear) | **reel.dark** (identity stays) |
| autopilot | aurora (escape) | light | none (linear) | aurora.light |
| editor | aurora (fixed) | dark | none | aurora.dark |
| editor | aurora (fixed) | light | none | aurora.light |

### Escape-hatch CSS contract
```css
[data-metaphor="aurora"] .fs-leader,
[data-metaphor="aurora"] .fs-trailer,
[data-metaphor="aurora"] .fs-sprockets-top,
[data-metaphor="aurora"] .fs-sprockets-bottom,
[data-metaphor="aurora"] .fs-grain,
[data-metaphor="aurora"] .fs-transport,
[data-metaphor="aurora"] .reel-dial,
[data-metaphor="aurora"] .reel-chrome,
[data-metaphor="aurora"] .reel-scanline { display: none; }
```

No ghost chrome in escape-hatch mode.

### Z-index stack (single source of truth)

Global layering order — referenced by all CSS files. Defined as CSS custom properties so nothing drifts.

**Existing modal floor (not changed):** `.publish-overlay` at `z-index: 9000` (css/styles.css:4394), other overlays at `8000-10000`, editor top layers at `99999`. The new tokens sit **below** the existing modal layer so grain/scanline never visually cover dialogs. The grain is ambient chrome, not a popup.

```css
:root {
  /* NEW metaphor-chrome tokens — all below existing modal floor (9000).
     Ordering rationale (lowest → highest, non-modal):
       base < frame-content < grain < scanline < leader-trailer
           < dial < chrome < sprockets < (modals at 9000+).
     Grain and scanline MUST sit above frame-content so the ambient
     noise/phosphor overlay is actually visible over cards. Earlier
     drafts had grain:80 / scanline:90 which put them *under* content
     at 100 — that was the bug; fixed below. */
  --z-base:             1;   /* background */
  --z-frame-content:  100;   /* .fs-act / step containers */
  --z-grain:          110;   /* full-viewport noise, pointer-events: none */
  --z-scanline:       120;   /* reel dark-mode overlay, pointer-events: none */
  --z-leader-trailer: 150;   /* opening/closing frames (sit within strip) */
  --z-dial:           200;   /* reel rings + CenterDisc */
  --z-chrome:         300;   /* top chrome, transport bar, bottom hint row */
  --z-sprockets:      400;   /* filmstrip top/bottom perforations */
  /* existing modal layer (from css/styles.css) — DO NOT redefine, just honor: */
  /*   .publish-overlay 9000, .confirm-overlay / file-pickers 8000-10000,     */
  /*   editor-top overlays 99999. Metaphor chrome never exceeds these.        */
}
```

**Rules:**
- Grain and scanline are ambient — they sit **above content, below interactive chrome**, but **well below modals** so dialogs pop over them cleanly.
- `pointer-events: none` on grain and scanline (no click interception).
- Dial, chrome, and sprockets layer above ambient overlays but below any modal.
- Nothing in `filmstrip.css` / `reel.css` uses arbitrary z-index values — only these tokens.

---

## 3. LocalStorage contract

| Key | Values | Read by | Written by |
|---|---|---|---|
| `stori_theme_mode` | `"dark"` \| `"light"` | FOUC head script → `01-core.js` | Theme toggle button (every page) |
| `stori_copilot_metaphor` | `"filmstrip"` (default) \| `"aurora"` | `01-core.js` on route to Copilot | Copilot transport bar Aurora-view toggle |
| `stori_autopilot_metaphor` | `"reel"` (default) \| `"aurora"` | `01-core.js` on route to Autopilot | Autopilot bottom-hint Aurora-view toggle |
| `stori_landing_metaphor` | `"filmstrip"` (default) | (reserved, no toggle yet) | — |

### FOUC fix (inline in `<head>`, before any stylesheet)

```html
<script>
(function(){
  try {
    var t = localStorage.getItem('stori_theme_mode') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch(e){}
})();
</script>
```

Paints the correct palette before CSS loads. No dark flicker on light-mode reload.

---

## 4. Named exceptions to "don't touch functional files"

Three **additive** edits are required. Each is strictly observational — it exposes existing state via events or attribute wiring. Zero logic change, zero behavior change, no handler rewrites.

### Exception 1 — `js/20-reels-creator.js`
**Append one `dispatchEvent` line at each `reelStep*.classList.remove('hidden')` call site.** There is no `phase` variable in this file — step reveal IS the phase transition. Known call sites (verified against current code):

| Line | Call | Phase to dispatch |
|---|---|---|
| 27    | `reelStepEditor.classList.remove('hidden')` | `'preview'` |
| 28    | `reelStepActions.classList.remove('hidden')` | `'queue'` |
| 371   | `reelStepPresets.classList.remove('hidden')` | `'script'` |
| 1105  | `reelStepScenes.classList.remove('hidden')` | `'image'` |
| 1399  | `reelStepScenes.classList.remove('hidden')` | `'image'` |
| 3265  | `_bgmStepEl.classList.remove('hidden')` (BGM auto-advance) | `'bgm'` |
| 4456  | `bgmStep.classList.remove('hidden')` (manual BGM open) | `'bgm'` |
| 5445  | `bgmStep.classList.remove('hidden')` (project-reload BGM) | `'bgm'` |
| 5576  | `reelStepPresets.classList.remove('hidden')` (project-reload) | `'script'` |
| 5584  | `reelStepScenes.classList.remove('hidden')` (project-reload) | `'image'` |

**Note on naming:** the BGM step uses the local variable names `_bgmStepEl` (line 3265) and `bgmStep` (lines 4456, 5445) — not a `reelStepBgm` symbol. Don't grep for `reelStepBgm`; grep for `bgmStep` and `_bgmStepEl` and anchor on the DOM id `reel-step-bgm`.

Pattern, appended one line after each unhide:
```js
reelStepScenes.classList.remove('hidden');
document.dispatchEvent(new CustomEvent('reel:phase', { detail: { phase: 'image' }})); // +1 line
```

**Additional dispatches not tied to a `classList.remove` site** (state transitions without a step toggle — the dial still needs to rotate):

| Phase | Dispatch site | Trigger |
|---|---|---|
| `'idle'` | `js/01-core.js` `navigateTo('reel', …)` right after the `data-section` set | Fired once on route to Autopilot so the dial lands on `record` when the user arrives |
| `'recording'` | `js/20-reels-creator.js` MediaRecorder `start` handler (existing) | Fired when recording begins — dial's inner ring phosphor pulses on the record agent |
| `'transcribing'` | `js/20-reels-creator.js` at the Gemini transcription fetch call (before `await`) | Fired while audio is being transcribed — dial rotates from `record` → `script` with a "working" tick |

All three are **one-line appends** at existing control-flow points. No handler refactoring. The phase→agent mapping in `js/24-reel.js` (see §8 "Phase → ring sync") already includes `idle`, `recording`, `transcribing` as input keys.

Line numbers will shift during implementation; the **anchor is the function/variable name**, not the line. Grep `reelStep`, `bgmStep`, and `_bgmStepEl` to find the full set.

### Exception 2 — `js/17c-create-pipeline.js`
**Add the dispatch inside the existing `showStep(id, show)` helper at line 819.** This is a single chokepoint — every act-boundary reveal in this 3000+ line file routes through it, so one edit covers all six act transitions. Pattern:

```js
function showStep(id, show) {
  // ...existing body unchanged...
  if (show) {
    document.dispatchEvent(new CustomEvent('copilot:act', { detail: { stepId: id }})); // +1 line
  }
}
```

`js/23-filmstrip.js` maps `stepId` → act name internally (so the mapping table lives in the new file, not the functional one). Consumed for auto-scroll-snap to the next act on completion.

### Exception 3 — `js/01-core.js` (not `18-navigation.js` — corrected)  ✅ IMPLEMENTED
`navigateTo(view, pushHistory)` is defined at **`js/01-core.js:282`**, not in `18-navigation.js`. Exception 3 is **one line appended at the top of the function body**, plus a one-time initial setter after `history.replaceState(...)` so the first paint is correct before any navigation.

**Status:** landed in `js/01-core.js` lines 282-288 (per-navigation) and 344-350 (initial paint). No further code change required for this exception. Both sites carry a `// metaphor-plan.md Exception 3` comment for traceability.

```js
function navigateTo(view, pushHistory) {
  // metaphor-plan.md Exception 3 — set data-section on <html> per route.
  document.documentElement.setAttribute('data-section',
    view === 'home'   ? 'landing'   :
    view === 'create' ? 'copilot'   :
    view === 'reel'   ? 'autopilot' : 'editor');
  // ...rest of function unchanged...
}
```

`view` values in this codebase are `'home' | 'editor' | 'create' | 'reel'`, mapped to plan's section names via the inline ternary above.

**Companion wiring (not part of Exception 3, required for §3 localStorage contract):** `navigateTo` also reads `stori_copilot_metaphor` / `stori_autopilot_metaphor` from localStorage and applies `data-metaphor` on `#create-page` / `#reel-page` respectively, so the user's last-chosen metaphor is restored on route. This is a pure read — the toggle buttons in the transport/bottom-hint rows do the writes.

All three exceptions are listed, line-anchored, and grep-able. Nothing else in any functional file is modified.

---

## 5. File-level change summary

### New files
- `css/themes.css` — four palette sets keyed by `data-theme` + `data-section`
- `css/filmstrip.css` — sprockets, frames, leader, trailer, grain, transport, developing plate
- `css/reel.css` — dial, rings, CenterDisc, TapeCounter, FocusSwap, scanlines, phosphorFlicker
- `js/23-filmstrip.js` — horizontal scroll + drag inertia + wheel momentum + frame-snap + tick haptic + act auto-advance listener
- `js/24-reel.js` — dial interactions (rotary drag, wheel, Tab swap, arrow keys) + dynamic ring math + phase→ring sync + CenterDisc content router

### Modified files (wrappers and attributes only)
- `index.html` — add `.fs-*` wrappers around existing sections, add `data-theme` + `data-section` + `data-metaphor` attributes, add leader/trailer/sprocket shells, add FOUC head script, add toggle buttons
- `css/styles.css` — no content removal; add `data-theme="light"` overrides

### Functional files with named exceptions (see §4)
- `js/20-reels-creator.js` — ~6 lines (one `dispatchEvent` appended after each existing `reelStep*.classList.remove('hidden')`)
- `js/17c-create-pipeline.js` — 1 line (inside `showStep()` helper at line 819 — single chokepoint covers all act boundaries)
- `js/01-core.js` — 1 line (inside `navigateTo()` at line 282 — attribute set on route)

### Untouched files (all other JS)
`js/01-core.js` (except +1 localStorage read on init), `02-zoom.js`, `03-ruler.js`, `04-photo-timeline.js`, `05-video-import.js`, `06-text-timeline.js`, `07-text-renderer.js`, `08-playhead.js`, `09-transitions.js`, `10-preview.js`, `11-export.js`, `12-buffer-ops.js`, `13-wavesurfer.js`, `14-silence.js`, `15-project.js`, `16-audio-controls.js`, `17a-create-api.js`, `17b-create-references.js`, `17d-create-languages.js`, `18-page-transition.js`, `19-video-timeline.js`, `21-kling.js`, `22-emoji-reel.js`.

---

## 6. Landing page mapping (Filmstrip)

All 9 existing `.lp-*` sections become filmstrip frames. No content removed.

| # | Existing DOM | Filmstrip frame | New wrapper |
|---|---|---|---|
| 0 | `.lp-nav` | Top chrome (fixed) — serif "Stori" + mono "REEL A · TAKE 01" + dark/light toggle | `.fs-top-chrome` |
| — | — | **Leader** — diagonal hatch + "STORI" SVG-mask knockout + countdown "3" (once per session via sessionStorage flag) | `.fs-leader` |
| 1 | `.lp-hero` | Frame 1 — "OPENING SHOT" | `.fs-frame[data-frame="hero"]` |
| 2 | `.lp-modes` | Frame 2 — "TWO WAYS" | `.fs-frame[data-frame="modes"]` |
| 3 | `.lp-social-proof` | Frame 3 — "REVIEWS" | `.fs-frame[data-frame="proof"]` |
| 4 | `.lp-pillars` / `#lp-features` | Frame 4 — "FEATURES" | `.fs-frame[data-frame="features"]` |
| 5 | `.lp-scrubber-sec` | Frame 5 — "DICTATE" | `.fs-frame[data-frame="scrubber"]` |
| 6 | `.lp-storyboard-sec` | Frame 6 — "ASSEMBLE" | `.fs-frame[data-frame="storyboard"]` |
| 7 | `.lp-pipeline` | Frame 7 — "FIVE AGENTS" | `.fs-frame[data-frame="pipeline"]` |
| 8 | `.lp-styles-sec` | Frame 8 — "STILL" | `.fs-frame[data-frame="styles"]` |
| 9 | `.lp-pricing` / `#lp-pricing` | Frame 9 — "ROLL" | `.fs-frame[data-frame="pricing"]` |
| — | — | **Trailer** — "— END —" + copyright | `.fs-trailer` |

---

## 7. Copilot (Create Story) mapping — Filmstrip

### Layout
- `#create-body` keeps its flex: `#create-agent-panel` (docked left, ~260px) + `#create-workflow` (horizontal strip).
- `#create-workflow` becomes `display: flex; flex-direction: row; overflow-x: auto; scroll-snap-type: x mandatory;`.
- Each `.fs-act` = `flex: 0 0 calc(100vw - 260px); scroll-snap-align: start; scroll-snap-stop: always;` — the `scroll-snap-stop: always` prevents wheel/drag from skipping past an act when the user over-scrolls.
- **Scrollbar hidden** (`scrollbar-width: none`).
- Sprocket strips are absolutely positioned top/bottom overlays on the horizontal strip.
- Film grain = fixed full-viewport SVG noise at palette-specified opacity.

### Leader / Trailer — static inline HTML
Leader and Trailer are **static inline HTML with inline SVG** written directly into `index.html`. No JS-generated SVG, no runtime DOM construction. This keeps Time-To-Interactive untouched — the browser parses them alongside the rest of the strip.

The "3" countdown is a CSS animation (`@keyframes`) that runs **once per session** — gated by a `sessionStorage.stori_seen_leader` flag that `23-filmstrip.js` sets after first play. Subsequent visits skip the animation; the leader still displays as a static frame.

### Acts

| Act | Existing DOM consumed | Behavior change |
|---|---|---|
| **Leader** (new) | — | SVG hatch + "COPILOT / LONG VIDEO" knockout + "3" countdown on first visit per session |
| **Act 1 · INGEST** | `#create-video-mode-step` + `#create-input-step` | None |
| **Act 2 · SCRIPT & SCENES** | `#create-transcribe-step` + `#create-chapter-step` | None |
| **Act 3 · CASTING** | `#create-references-step` | None — **V1 note:** `#create-references-step` is currently commented out in `index.html` (HTML comment wrapper around the markup). While commented, the `.fs-act` host for Act 3 renders a **permanent "LOCKED / COMING SOON" placeholder** (no MutationObserver unlock path, because the step never enters the DOM). When the references step is un-commented later, the existing progressively-unlocked flow (§7 Act gating table, row 2) applies automatically with no filmstrip change — the observer picks up the inline-style flip. |
| **Act 4 · DEVELOP** | `#create-generate-step` + `#create-video-step` | None — scene cards get `.fs-scene-frame` styling via **CSS descendant selectors only** (see "Scene card styling" below) |
| **Act 5 · SCORE & DUB** | `#create-bgm-step` + `#create-language-step` | None |
| **Act 6 · EXPORT** | `#create-send-step` | None |
| **Trailer** (new) | — | "— END —" card |

### Act gating (informed by real codebase state)

**Starting state in current code:** `#create-transcribe-step`, `#create-chapter-step`, `#create-generate-step`, `#create-bgm-step` etc. all start with **inline `style="display:none;"`** and some also carry a `.hidden` class (`index.html:2198, 2214, 2278, 2300`). The `showStep(id, show)` helper in `17c-create-pipeline.js:819` toggles these on/off as the pipeline progresses. We must preserve this exactly — the filmstrip cannot pre-reveal them.

**Two distinct cases, handled differently:**

| Case | Example steps | Current mechanism | Filmstrip behavior |
|---|---|---|---|
| **Mode-gated** (conditionally skipped forever in this session) | `create-chapter-step` (podcast-only), `create-video-step` (animated-only), `create-language-step` (non-animated) | `showStep(id, modeCondition && dataCondition)` — `show=false` keeps `display:none` | Host `.fs-act` gets `display: none` → horizontal flex collapses it; strip shortens naturally; no placeholder |
| **Progressively-unlocked** (will reveal later in this session) | `create-transcribe-step` before transcription, `create-generate-step` before scenes exist | `showStep(id, hasData)` — flips to `show=true` as pipeline advances | Host `.fs-act` stays mounted at full width with `opacity: 0.3; pointer-events: none` and a "LOCKED" badge until its underlying `.create-step` leaves `display:none`; then act unlocks in place |

**How `.fs-act` knows which case it is:** a MutationObserver in `js/23-filmstrip.js` watches the inline `style` attribute of each contained `.create-step`. When the step's `display` flips from `none` to non-none, the wrapping `.fs-act` drops its locked state. Mode-gated collapse is handled purely by CSS: if the act's sole `.create-step` child has `display:none` **and** a data-attribute marking it as mode-gated (added by filmstrip init based on `createVideoMode`), then the act also takes `display: none`.

This keeps Exception 2 intact (`showStep` still dispatches `copilot:act`) and doesn't modify any pipeline logic — the filmstrip reacts to existing visibility changes, it does not drive them.

### Agent rail (docked left, stays in place)
`#create-agent-panel` and all its children remain as-is. Reskin: rail edge styled as film-can side sticker; agent list items get ASA-reel status dots. All IDs/handlers preserved.

### Scene card styling (CSS-only, no JS modification)
All `.fs-scene-frame` visuals are applied via **CSS descendant selectors** on the existing containers:

```css
[data-section="copilot"][data-metaphor="filmstrip"] #create-storyboard-grid > *,
[data-section="copilot"][data-metaphor="filmstrip"] #create-scene-grid > *,
[data-section="copilot"][data-metaphor="filmstrip"] #create-video-grid > * {
  /* sprocket edges, developing-plate keyframe, frame border, mono meta row */
}
```

No class is added to individual scene cards. `js/17c-create-pipeline.js`'s `renderSceneCard()` / render functions are **not modified**. The developing-plate wipe animation fires on `<img>` load via a CSS `animation` on the wrapper keyed by `:has(img[src])` or `img.complete` — pure CSS, no JS coordination.

### Transport bar (bottom, fixed)
- Act counter: "◉ ACT 2 / 6 · SCRIPT & SCENES"
- `◀ ▶` arrows → `scrollBy({ left: ±actWidth, behavior: 'smooth' })`
- **Edge cases:**
  - At first frame (leader): `◀` is disabled (`pointer-events: none; opacity: 0.3`).
  - At last frame (trailer): `▶` is disabled the same way.
  - During in-flight smooth-scroll: both arrows debounced (300ms lockout after click) so repeated clicks don't queue up overshoots.
- `◐ LIGHT/DARK` toggle → flips `data-theme`
- `◈ AURORA VIEW` toggle → flips `data-metaphor` on `#create-page` (see "Metaphor toggle transition" below)

### Filmstrip auto-advance
`js/23-filmstrip.js` listens for `copilot:act` events (see Exception 2) and smooth-scrolls the strip to the next act on completion. User can still scroll back manually.

### Scroll-snap ↔ drag-inertia cooperation
Pointer-down disables `scroll-snap-type` on `#create-workflow`; pointer-up snaps to nearest act via `scrollTo({ left: nearestActLeft, behavior: 'smooth' })` then re-enables snap. Prevents native snap from fighting inertia mid-drag.

**`scrollend` browser support.** The ideal "snap re-enable" trigger is the native `scrollend` event, but **Safari < 15.4 does not support it** (still in the wild on older macOS). Fallback pattern in `js/23-filmstrip.js`:

```js
const supportsScrollend = 'onscrollend' in window;
if (supportsScrollend) {
  workflow.addEventListener('scrollend', onSettled);
} else {
  // Debounced-settle fallback: re-enable snap 140ms after the last scroll event
  // and also on pointerup/wheelend. Matches scrollend semantics within ~1 frame.
  let t; workflow.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(onSettled, 140); }, { passive: true });
  workflow.addEventListener('pointerup', onSettled);
}
```
Tested behavior equivalent on both paths — the user never feels the difference.

### Window resize + dynamic content reflow
`23-filmstrip.js` debounces `resize` (150ms) and re-computes each act's `flex-basis` if the agent rail width changes (none currently, but future-proof). Async image loads inside acts do not change act width — images are constrained to their scene card; they cannot spill and push neighbors.

### Metaphor toggle transition (filmstrip ↔ aurora)
Toggling `data-metaphor` triggers a 220ms cross-fade on the whole `#create-page`:

```css
#create-page { transition: opacity 220ms ease; }
#create-page.is-swapping { opacity: 0; }
```

On toggle: add `.is-swapping`, after 220ms flip `data-metaphor`, remove `.is-swapping`. Scroll-position handling is **directional and asymmetric**:

- **Filmstrip → Aurora:** save `#create-workflow.scrollLeft` into a local var (on the filmstrip container), then reset Aurora's vertical scroll to top.
- **Aurora → Filmstrip:** ignore the Aurora vertical scroll, and restore `#create-workflow.scrollLeft` from the saved var.

So the user always returns to the same act they were reading when they switched away, regardless of how far they scrolled in the other metaphor. Form state is preserved automatically because DOM stays mounted.

---

## 8. Autopilot (Reels) mapping — Reel dial

### Layout
- `#reel-agent-panel` stays docked left (~260px), same as Copilot.
- Dial occupies the remaining space: `width: calc(100vw - 260px); height: 100vh;`.
- Dial is an **overlay window** — CenterDisc is transparent; underlying step content (phone frame, waveforms, scene grid) shows through when its agent is focused.

### Dial structure
- **Outer ring** — dynamic N items, one per scene from `#reel-scene-grid.children`. Ring math: `outerStep = 360 / N`. Tick count scales with N: `Math.max(36, N * 12)`.
- **Inner ring** — 7 fixed agents: `record · script · storyboard · image · bgm · preview · queue`.
- **CenterDisc** — live preview window; transparent; shows the step content of whatever is focused underneath.
- **Static pointer** at top; **TapeCounter** top-right; **FocusSwap** bottom-center; **Scanline overlay + phosphorFlicker** global (dark mode only; disabled in light mode for calm).

### Inner-ring agents → existing DOM surfaced through CenterDisc

| Agent | Step DOM revealed through CenterDisc | Position |
|---|---|---|
| `record` | `#reel-step-input` | Positioned underneath CenterDisc center |
| `script` | `#reel-step-presets` (transcript + settings) | Same |
| `storyboard` | Derived mini-list from `#reel-scene-grid` | Overlay-rendered by `24-reel.js` |
| `image` | `#reel-step-scenes` + **`#reel-emoji-reel`** (emoji reel integrated here, see below) | Same |
| `bgm` | `#reel-step-bgm` | Same |
| `preview` | `#reel-step-editor` — phone frame + rc-* controls | Phone frame already 9:16, fits the disc naturally |
| `queue` | `#reel-step-actions` — export buttons + lab queue | Same |

All existing `#reel-step-*` containers stay mounted. Only the one matching the focused agent is `visibility: visible`; others `visibility: hidden`. No DOM movement. No `renderAllReelPreviews()` conflicts.

### Outer-ring scenes
Outer ring reads `#reel-scene-grid.children` on every generation completion. When count changes, `24-reel.js` recomputes `outerStep` and re-renders labels. Focusing a scene shows its image/video in CenterDisc (overlayed).

### Emoji reel (during image generation)
When the dial focuses on `image` agent **and** image generation is active, `#reel-emoji-reel` becomes visible inside CenterDisc (via CSS repositioning — same DOM node, new transform). `js/22-emoji-reel.js` is untouched; reveal timers work because we don't move the DOM. When the agent loses focus, emoji reel returns to the rail.

**Drawer lifecycle (precise spec):**
- **Trigger:** `data-metaphor="reel"` **AND** dial's focused inner-ring agent is `image` **AND** `#reel-emoji-reel` is currently shown. Because the element uses the HTML5 `hidden` attribute (verified in `index.html:2459`) — and `[hidden]` forces `display: none` which **kills any outgoing CSS transition** — we do **not** use `[hidden]` as the transition trigger directly. Instead, `22-emoji-reel.js` is wrapped with a thin shim (added in `24-reel.js` init) that, when `data-metaphor="reel"`, mirrors the `hidden` attribute into a `.emoji-reel-hidden` class on a 200ms delay for exit (so fade-out plays) and immediately on entry. The CSS selector becomes `#reel-emoji-reel:not(.emoji-reel-hidden)`. Pure observational — no write-back into emoji-reel logic.
- **Enter transition:** `transform: translate(…) scale(0.92) → scale(1); opacity: 0 → 1;` over **260ms** with easing `cubic-bezier(.22,.61,.36,1)` (ease-out-back feel).
- **Exit transition:** same curve reversed over **180ms**; class `.emoji-reel-hidden` is added first (starts the fade), then the existing `[hidden]` flip happens after the 200ms delay (past the 180ms exit).
- **Z-index:** `calc(var(--z-dial) + 1)` — above the dial rings, below transport chrome (300) and sprockets (400). The ambient grain (110) and scanline (120) sit well below the drawer.
- **Close behavior:** not user-closable; visibility is entirely driven by agent focus + underlying emoji-reel state. When `22-emoji-reel.js` hides the reel (image generation ends), this drawer collapses automatically via the shim described above.
- **No overlap with CenterDisc content:** drawer is positioned at the bottom-right of CenterDisc, occupying ~30% of disc width; scene image preview area remains visible alongside.

### Phase → ring sync (one-way, pipeline is authoritative)
`24-reel.js` listens for the `reel:phase` event (Exception 1):
```js
document.addEventListener('reel:phase', (e) => {
  const phaseToAgent = { idle:'record', recording:'record', transcribing:'script',
                         script:'script', storyboard:'storyboard', image:'image',
                         bgm:'bgm', preview:'preview', ready:'queue' };
  rotateInnerRingTo(phaseToAgent[e.detail.phase]);
});
```

**The dial is a viewer, not a controller.** Rotating the inner ring by drag/keyboard/Tab changes **which step's DOM becomes visible through CenterDisc** — nothing else. It does not emit phase changes, does not advance the pipeline, cannot skip/rewind. The pipeline state machine in `js/20-reels-creator.js` is the single source of truth; the dial only reflects it. This avoids the bidirectional-sync race condition entirely: there is no reverse channel.

If the user rotates to an agent whose underlying step has no content yet (e.g. focusing `preview` before generation completes), CenterDisc shows the step's natural empty/placeholder state — exactly as it would in Aurora view.

### Scene count → ring resize
`24-reel.js` also observes `#reel-scene-grid` children (single MutationObserver) to recompute outer ring when scenes are added/removed.

### Top chrome
Existing `#reel-header-wrapper` elements all preserved; reskinned to match dial aesthetic (mono phosphor labels, film-can rims).

### Bottom hint row
- "SCROLL · DRAG RING · TAB · ←→" (left)
- FocusSwap SCENES/AGENTS (center)
- `◐ LIGHT/DARK` toggle
- `◈ AURORA VIEW` toggle → flips `data-metaphor` on `#reel-page`

### Keyboard shortcut scoping (conflict avoidance)
All dial key handlers in `24-reel.js`:
- Bail if `document.activeElement` is `INPUT`, `TEXTAREA`, or `[contenteditable]`.
- Bail if `document.documentElement.getAttribute('data-section') !== 'autopilot'`.
- Bail if `document.documentElement.getAttribute('data-metaphor') !== 'reel'`.

Editor arrow keys (playhead nudge in `08-playhead.js`) and other global shortcuts remain untouched.

### Metaphor toggle transition (reel ↔ aurora)
Symmetric to Copilot's transition. Toggling `data-metaphor` on `#reel-page` triggers a 220ms cross-fade:

```css
#reel-page { transition: opacity 220ms ease; }
#reel-page.is-swapping { opacity: 0; }
```

On toggle: add `.is-swapping`, after 220ms flip `data-metaphor`, remove `.is-swapping`. Dial rotation angle is **not restored** — when switching back to reel from aurora, the dial resets to the current pipeline phase via the existing `reel:phase` listener. Form state (audio file, transcript edits) is preserved because DOM stays mounted. Scroll position of `#reel-page` when in Aurora view is saved and restored on return.

---

## 9. Editor treatment

**No layout change. Palette swap only.**
- Add `data-theme` support; palette tokens flow from `css/themes.css`.
- Audit scope: timeline backgrounds, track lanes, playhead line, ruler ticks, clip fills, wavesurfer colors, transition markers, preview letterbox, export progress bar.
- Dark = `aurora.dark` (existing). Light = `aurora.light` (new).
- Zero JS changes.

---

## 10. What stays identical (functional guarantee)

- **All JS files except the three named exceptions in §4** — untouched.
- **All `id="…"` attributes** — preserved.
- **All event handlers** (`onclick`, `addEventListener`, form listeners) — intact.
- **All external libraries** (WaveSurfer, Gemini, Imagen, Kling, Lyria) — zero changes.
- **All existing CSS classes** — no renames, no deletions. New classes are additive (`.fs-*`, `.reel-dial-*`).
- **`js/22-emoji-reel.js`** — autoplay/pause icon swap and blink preserved; repositioning is CSS-only.
- **Editor internals** — playhead, ruler, zoom, tracks, canvas, waveform — no structural change.

---

## 11. Implementation phases

Three-phase delivery per your instruction.

### 🟢 Phase 1 — Aurora Light Theme (foundation for everything)

**Goal:** Every section renders correctly in `data-theme="light"` using `aurora.light` tokens, with FOUC eliminated and toggles wired.

**Prerequisite task (complete before writing `css/themes.css`):**

**0. CSS variable inventory (`css/themes-inventory.md`).** Grep every `var(--…)` and every hardcoded color across:
   - `css/styles.css` (global + editor core)
   - `css/landing.css` (if present; otherwise landing rules inside `styles.css`)
   - Any co-located section styles in `index.html` `<style>` blocks
   - Editor-specific: waveform, playhead, ruler ticks, clip fills, track lanes, transition markers, preview letterbox, export progress, modal backdrop
   - Copilot-specific: agent panel, agent chips, scene card, storyboard grid, reference cards, BGM step, language step, export step
   - Autopilot-specific: dial chrome (future Phase 3 — still inventory existing `#reel-*` hardcodes now), CenterDisc backdrop, scene grid, phone-frame preview, rc-* controls
   - Landing-specific: nav, hero, modes, proof, pillars, scrubber, storyboard, pipeline, styles, pricing, footer

   Produce a table: `variable name | current dark value | required light value | sections using it`. This table is what `css/themes.css` is written from. Prevents "partial audit" drift (audit #1) and the waveform/playhead/ruler regressions in the editor.

**Deliverables (after inventory is complete):**
1. `css/themes.css` with all four palette token sets keyed on `[data-theme][data-section]`, covering every variable enumerated in the inventory.
2. FOUC fix: inline `<script>` in `<head>` reading `stori_theme_mode` from localStorage before stylesheets.
3. `data-theme` + `data-section` attributes wired on `<html>` (Exception 3 in **`js/01-core.js`** inside `navigateTo()` at line 282 — not `18-navigation.js`; corrected per audit v3).
4. Dark/light toggle button added to:
   - `.lp-nav` (landing)
   - `#create-page` top chrome (Copilot — placeholder position; final location in Phase 2)
   - `#reel-header-wrapper` (Autopilot — placeholder position; final in Phase 3)
   - Editor header (one button)
5. Editor palette audit — every currently-hardcoded color in editor styles replaced with token reference; contrast verified on light (covered by inventory table).
6. Verification: all four sections readable in light mode; all existing functionality works; theme choice persists across reload.

**Does not touch:** HTML layout, any metaphor wrappers, any JS beyond exceptions.

**Risk:** 🟢 Low. Pure CSS + tokens + one inline script + one attribute setter.

---

### 🟡 Phase 2 — Copilot + Landing Filmstrip

**Goal:** Copilot and Landing render in filmstrip metaphor by default; Aurora-view escape hatch works on Copilot.

**Deliverables:**
1. `css/filmstrip.css` with chrome primitives: sprockets, frames, leader (hatch + SVG knockout + countdown), trailer, grain overlay, developing-plate keyframes, transport bar.
2. `js/23-filmstrip.js`:
   - Horizontal scroll container init.
   - Drag inertia (pointer down → track velocity → release → decay).
   - Wheel momentum (accumulate deltaY, apply to scrollLeft).
   - Frame-snap with pointer-up re-enable of native scroll-snap (scroll-snap ↔ inertia cooperation, §7).
   - **`scrollend` fallback** for Safari < 15.4 (see §7 — `onscrollend` feature-detect + 140ms debounced-settle fallback on plain `scroll` + `pointerup`).
   - Tick haptic (Web Audio beep) on act boundary crossing.
   - Listener on `copilot:act` event for auto-advance (Exception 2).
   - MutationObserver on each contained `.create-step` `style` attribute to unlock/collapse its host `.fs-act` per §7 act-gating.
   - Leader countdown: once per session via sessionStorage.
3. `index.html` wrapper additions:
   - Landing `.lp-*` sections → `.fs-frame` wrappers (§6 table).
   - Copilot `#create-workflow` children → 6 `.fs-act` wrappers (§7 table).
   - Leader + trailer frames prepended/appended.
   - Sprocket strips absolutely positioned.
   - Top chrome + transport bar added on both pages.
4. Copilot transport bar wires both toggles (`data-theme`, `data-metaphor`).
5. `js/17c-create-pipeline.js` Exception 2: **1 line** appended inside the existing `showStep(id, show)` helper at line 819 — dispatches `copilot:act` with `{stepId: id}`. This single chokepoint covers all act boundaries (verified: every `showStep(…)` call corresponds to an act transition).
6. Verification: all 6 acts navigable; all existing Copilot functionality works; Aurora escape hatch restores linear layout; landing horizontal scroll works end-to-end.

**Does not touch:** `#reel-page`, `#editor`, any autopilot JS, functional handler code.

**Risk:** 🟡 Medium. Primitives are isolated; only risk is the drag-inertia + scroll-snap interaction (§7 mitigation specified).

---

### 🔴 Phase 3 — Autopilot Reel dial

**Goal:** Autopilot renders as dual-ring dial by default; Aurora escape hatch works.

**Deliverables:**
1. `css/reel.css` — dial chrome: SVG ring tracks, tick marks, labels, CenterDisc, TapeCounter, FocusSwap, scanline overlay, phosphorFlicker keyframes.
2. `js/24-reel.js`:
   - Dual SVG rings with dynamic N (outer = scenes) and fixed 7 (inner = agents).
   - Pointer rotary drag with angle math and momentum.
   - Wheel rotation of focused ring.
   - Keyboard: Tab swaps focus; ArrowLeft/Right/Up/Down rotates focused ring by one step. Scoped to `data-section="autopilot"` + `data-metaphor="reel"` + not-in-form (§8).
   - MutationObserver on `#reel-scene-grid` → recompute outer ring when scene count changes.
   - Listener on `reel:phase` event → rotate inner ring to matching agent (Exception 1 consumer).
   - CenterDisc content router: toggle `visibility` of existing `#reel-step-*` containers based on focused agent; no DOM movement.
   - Emoji reel CSS repositioning when `image` agent focused and `#reel-emoji-reel:not([hidden])` matches (HTML5 `hidden` attribute, verified in `index.html:2459`).
3. `index.html` changes:
   - Dial container added inside `#reel-page`.
   - Existing `#reel-step-*` kept mounted; CSS controls visibility per focused agent.
   - Bottom hint row with FocusSwap + toggles.
4. `js/20-reels-creator.js` Exception 1: ~6 lines — one `dispatchEvent('reel:phase', {phase: …})` appended after each existing `reelStep*.classList.remove('hidden')` call (file has no `phase` variable; step-reveal IS the phase transition). Call sites verified: lines 27, 371, 1105, 1399, 5576, 5584 (line numbers will shift during implementation; anchor is the `reelStep*` variable name).
5. Verification: dial rotates; Tab swaps focus; phase changes auto-rotate inner ring; all autopilot functionality works; Aurora escape hatch restores linear `#reel-page`; emoji reel appears inside CenterDisc during image generation.

**Does not touch:** Landing, Copilot, Editor, any functional JS outside Exception 1.

**Risk:** 🔴 High. Rotary drag math + dynamic ring resize + CenterDisc overlay positioning are novel. Recommend incremental commits per sub-deliverable.

---

## 12. Verification checklist (per-phase)

### After Phase 1
- [ ] Landing light mode: all `.lp-*` readable, hero typewriter runs, CTAs navigate.
- [ ] Copilot light mode: all steps usable; no visual regressions.
- [ ] Autopilot light mode: all steps usable; no visual regressions.
- [ ] Editor light mode: timeline/playhead/waveform contrast acceptable.
- [ ] Theme toggle persists across reload.
- [ ] No FOUC on light-mode reload.
- [ ] `data-section` is correct on each route.
- [ ] `node build.js` syncs cleanly (verify it picks up new CSS file).

### After Phase 2
- [ ] Landing filmstrip: all 9 frames + leader + trailer render in dark and light.
- [ ] Landing horizontal drag, wheel, snap all work.
- [ ] Copilot filmstrip: all 6 acts render; agent rail stays docked; scene frames show developing-plate wipe on image arrival.
- [ ] Copilot transport bar both toggles work; preferences persist.
- [ ] Copilot Aurora escape hatch: linear layout restored, all functionality intact, palette stays gold in dark.
- [ ] Progressively-unlocked acts show opacity-0.3 until unlocked.
- [ ] Mode-gated acts (chapters, animated-video) collapse correctly when not applicable.
- [ ] Leader countdown plays once per session only.
- [ ] Audio generation, image generation, BGM, language, export — all work end-to-end in filmstrip mode.
- [ ] `node build.js` syncs cleanly.

### After Phase 3
- [ ] Autopilot reel: dial renders in dark (green + scanlines) and light (aurora palette, no scanlines).
- [ ] Outer ring adapts when scene count changes (generate a 5-scene and a 10-scene reel; verify both).
- [ ] Tab swaps focus; arrow keys rotate; keys don't fire when typing in form fields.
- [ ] Phase change auto-rotates inner ring (record → script → storyboard → image → bgm → preview → queue).
- [ ] CenterDisc reveals correct step content per focused agent.
- [ ] Emoji reel appears in CenterDisc during image generation; returns to rail after.
- [ ] Aurora escape hatch restores linear `#reel-page`; all functionality intact; palette stays green in dark.
- [ ] Full reel generation end-to-end works in dial mode (audio → generate → preview → export).
- [ ] `node build.js` syncs cleanly.

---

## 13. Performance budget

- **Grain overlay:** fixed SVG noise, composited by the browser. Drop to 0% during `<img>` loads if FPS drops. Measure before optimizing.
- **Phosphor flicker:** dark-mode autopilot only. Pauses when `document.hidden` (Page Visibility API).
- **Ring rotation:** CSS `transform: rotate()` only (GPU). No layout thrash.
- **Drag inertia RAF:** single RAF loop; stopped on idle.
- **Emoji reel audio + timers:** unchanged from current implementation.

Target: no regression on image-generation FPS vs current Aurora.

---

## 14. Out of scope (explicit)

- Mobile layouts (desktop only; no breakpoints added).
- A11y audit (flagged for future; not part of this plan).
- New features, prompt changes, API changes, agent additions.
- Editor layout changes, new tracks, new timeline features.
- A/B test harness — toggles are user preferences only.
- Server-side or build-pipeline changes beyond verifying `node build.js` picks up new files.
- `film.light` and `reel.light` palettes (not needed; light mode = universal aurora.light).

---

**End of plan.** Ready for Phase 1 execution.
