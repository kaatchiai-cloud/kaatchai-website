# Storypilot Extended Modes — Selector Screen & Routing Changes

> **What this file covers:** The complete redesign of the brainstorm selector screen from a chip-based wizard into a three-card mode selector with deliberate visual hierarchy, plus all routing logic changes required to support `brand-product` and `film-narrative` modes.

---

## 1. Selector Screen — Current vs Proposed

### Current (v1)

The v1 `#bs-selector` screen uses a two-step wizard:
- **Q1:** "What kind of video are you making?" — four chips: Social media clip / Brand / Tutorial / Personal creative
- **Q2:** "How long?" — three chips: Short / Medium / Long
- **Recommendation step:** Shows suggested pipeline (Autopilot or Copilot) with Confirm / Switch buttons

All four Q1 options feed through the same recommendation logic. The mode and pipeline are always the same value (`autopilot` or `copilot`).

### Proposed (extended modes)

The `#bs-selector` screen becomes a **three-card mode selector** with deliberate visual hierarchy:

```
┌────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────┐   ┌──────────────────────────────┐  │
│  │    🏷 Brand / Product    │   │          🎬 Film             │  │
│  │                          │   │                              │  │
│  │  "Precision video        │   │  "Prototype your story       │  │
│  │   for your brand"        │   │   before you shoot"          │  │
│  │                          │   │                              │  │
│  │  → Always Copilot        │   │  → Always Copilot            │  │
│  └──────────────────────────┘   └──────────────────────────────┘  │
│                                                                    │
│            ── or ──                                                │
│                                                                    │
│     ✏ Quick Script — "Just have an idea? Start here"              │
│     (smaller secondary card / link below the hero cards)          │
└────────────────────────────────────────────────────────────────────┘
```

**Visual treatment:**
- Brand/Product and Film cards: full-height cards, prominent, with mode icon, title, tagline, and a brief one-line description of what the AI does
- Quick Script: smaller secondary card or text link — visually de-emphasised but always accessible
- No wizard chips on this screen — the card click IS the mode selection

**Click behaviour:**
- **Brand / Product card click:** Sets `brainstormState.mode = 'brand-product'`, `brainstormState.pipeline = 'copilot'`. Skips Q2 entirely. Goes directly to chat screen.
- **Film card click:** Sets `brainstormState.mode = 'film-narrative'`, `brainstormState.pipeline = 'copilot'`. Skips Q2 entirely. Goes directly to chat screen.
- **Quick Script card/link click:** Sets `brainstormState.mode = null` temporarily, shows the existing Q1+Q2 wizard inline (or navigates to a nested wizard view). Existing wizard logic runs unchanged.

---

## 2. Quick Script — Wizard Retained

When Quick Script is selected, the existing wizard runs exactly as in v1:

**Q1 chips (Quick mode only):**
```html
<div class="bs-wizard-chips" id="bs-quick-q1">
  <button class="bs-wchip" data-q="type" data-v="social">📱 Social media clip</button>
  <button class="bs-wchip" data-q="type" data-v="tutorial">📚 Tutorial / explainer</button>
</div>
```

> **Note:** The v1 `brand` and `personal` chips are removed from Quick mode — those use cases now have their own hero cards. Quick mode covers social clips and tutorials only.

**Q2 chips (length — shown after Q1):**
```html
<div class="bs-wizard-chips hidden" id="bs-quick-q2">
  <button class="bs-wchip" data-q="length" data-v="short">⚡ Short & punchy (under 90s)</button>
  <button class="bs-wchip" data-q="length" data-v="medium">📺 Medium (1–5 min)</button>
  <button class="bs-wchip" data-q="length" data-v="long">🎓 In-depth (5+ min)</button>
</div>
```

**Recommendation step** follows as in v1 (Confirm / Switch buttons).

---

## 3. `confirmMode()` — New Entry Point Function

A new `_confirmMode(mode, pipeline)` function replaces `_confirmWizard()` as the entry point for Brand/Product and Film cards. `_confirmWizard()` is retained for Quick mode.

```js
function _confirmMode(mode, pipeline) {
  // Called directly by hero card clicks (brand-product, film-narrative)
  brainstormState.mode     = mode;      // 'brand-product' | 'film-narrative'
  brainstormState.pipeline = pipeline;  // always 'copilot' for hero cards
  _updateModeTag(mode);
  _updateSendToButton(pipeline);
  _showScreen('bs-chat');
  _renderGreeting();
}
```

Hero card click handlers in `_init()`:
```js
var brandCard = document.getElementById('bs-mode-brand');
if (brandCard) brandCard.addEventListener('click', function() {
  _confirmMode('brand-product', 'copilot');
});

var filmCard = document.getElementById('bs-mode-film');
if (filmCard) filmCard.addEventListener('click', function() {
  _confirmMode('film-narrative', 'copilot');
});

var quickCard = document.getElementById('bs-mode-quick');
if (quickCard) quickCard.addEventListener('click', function() {
  // Show existing wizard chips inline
  var wizardSection = document.getElementById('bs-quick-wizard');
  if (wizardSection) wizardSection.classList.remove('hidden');
});
```

---

## 4. `_confirmWizard()` — Updated for Quick Mode Only

`_confirmWizard()` is now only called from the Quick wizard recommendation step. It must split `mode` from `pipeline` as the wizard type and the pipeline destination are now tracked separately:

```js
function _confirmWizard(pipelineTarget) {
  // pipelineTarget = 'autopilot' | 'copilot' (from recommendation or manual switch)
  const scriptMode = brainstormState.wizardAnswers.type;  // 'social' | 'tutorial'

  brainstormState.mode     = scriptMode;      // drives system prompt + schema
  brainstormState.pipeline = pipelineTarget;  // drives Send-to button + handoff

  _updateModeTag(scriptMode);
  _updateSendToButton(pipelineTarget);
  _showScreen('bs-chat');
  _renderGreeting();
}
```

---

## 5. `recommendPipeline()` — Quick Mode Only

`recommendPipeline()` is now only called for Quick mode (social and tutorial types). Brand/Product and Film never enter this function — their pipeline is fixed.

```js
function _recommendPipeline(type, length) {
  // Only called for Quick mode (type: 'social' | 'tutorial')
  if (length === 'short') return { mode: 'autopilot', reason: _shortReasonFor(type) };
  if (length === 'long')  return { mode: 'copilot',   reason: _longReasonFor(type)  };

  // Medium — split by type
  if (type === 'social')
    return { mode: 'autopilot', reason: 'Social clips land best under 90 seconds.' };
  if (type === 'tutorial')
    return { mode: 'copilot',   reason: 'Tutorials and explainers need room to breathe.' };

  // Fallback
  return { mode: 'copilot', reason: 'Longer content works best in Copilot.' };
}

function _shortReasonFor(type) {
  if (type === 'tutorial') return 'Short tutorials work well as a quick how-to reel.';
  return 'Short & punchy — perfect for a quick reel.';
}

function _longReasonFor(type) {
  if (type === 'tutorial') return 'In-depth tutorials work best in long-form.';
  return 'In-depth content works best in long-form.';
}
```

---

## 6. `brainstormState` Schema Update

Add the new `pipeline` field alongside `mode`:

```js
const brainstormState = {
  mode:           null,   // script mode: 'social'|'tutorial'|'brand-product'|'film-narrative'
  pipeline:       null,   // pipeline destination: 'autopilot'|'copilot'
  // ... all other v1 fields unchanged
};
```

**Backwards compatibility with localStorage restore:** if a saved session has no `pipeline` field (v1 session), default it to `mode` on restore:

```js
// In _loadSession(), after Object.assign:
if (!brainstormState.pipeline) {
  brainstormState.pipeline = brainstormState.mode;  // v1: mode WAS the pipeline
}
```

---

## 7. `_updateModeTag()` — All Mode Keys

```js
function _updateModeTag(mode) {
  const TAG_LABELS = {
    'autopilot':      '⚡ Autopilot',
    'copilot':        '🎬 Copilot',
    'social':         '📱 Social',
    'tutorial':       '📚 Tutorial',
    'brand-product':  '🏷 Brand / Product',
    'film-narrative': '🎬 Film / Narrative',
  };
  const el = document.getElementById('bs-mode-tag');
  if (!el) return;
  const label = TAG_LABELS[mode];
  if (label) { el.textContent = label; el.style.display = ''; }
  else { el.style.display = 'none'; }
}
```

---

## 8. `_updateSendToButton()` — Uses `pipeline`, Not `mode`

The Send-to button on the Final screen reflects the pipeline destination (where the script goes), not the script mode. It reads `pipeline`:

```js
function _updateSendToButton(pipelineTarget) {
  const PIPELINE_LABELS = {
    'autopilot': { icon: '⚡', name: 'Autopilot' },
    'copilot':   { icon: '🎬', name: 'Copilot'   },
  };
  const info    = PIPELINE_LABELS[pipelineTarget] || PIPELINE_LABELS['copilot'];
  const btn      = document.getElementById('bs-send-pipeline-btn');
  const nameSpan = document.getElementById('bs-handoff-pipeline-name');
  const iconSpan = btn ? btn.querySelector('.bs-handoff-icon') : null;
  if (nameSpan) nameSpan.textContent = info.name;
  if (iconSpan) iconSpan.textContent = info.icon;
}
```

---

## 9. System Prompt & Finalise Prompt Lookup

Both functions must handle all mode keys with a safe fallback:

```js
// In _sendMessage() and _renderGreeting():
const systemPrompt = SYSTEM_PROMPTS[brainstormState.mode] || SYSTEM_PROMPTS['copilot'];

// In _finaliseScript():
const finalisePrompt = FINALISE_PROMPTS[brainstormState.mode] || FINALISE_PROMPTS['copilot'];
```

For `'social'` and `'tutorial'` Quick mode types: `SYSTEM_PROMPTS['social']` does not exist — these fall back to `SYSTEM_PROMPTS['autopilot']` or `SYSTEM_PROMPTS['copilot']` depending on the pipeline. The existing v1 behaviour for Quick mode is preserved via this fallback.

---

## 10. `index.html` — Selector Screen HTML Changes

Replace the existing `#bs-selector` wizard chips with the three-card layout:

```html
<!-- #bs-selector — three-card mode selector -->
<div class="bs-mode-cards">

  <!-- Hero card: Brand / Product -->
  <div class="bs-mode-card bs-mode-card--hero" id="bs-mode-brand">
    <div class="bs-mode-card-icon">🏷</div>
    <div class="bs-mode-card-title">Brand / Product</div>
    <div class="bs-mode-card-desc">Precision video for your brand — commercial storytelling with product placement, brand voice, and a clear CTA.</div>
    <div class="bs-mode-card-badge">Copilot →</div>
  </div>

  <!-- Hero card: Film -->
  <div class="bs-mode-card bs-mode-card--hero" id="bs-mode-film">
    <div class="bs-mode-card-icon">🎬</div>
    <div class="bs-mode-card-title">Film</div>
    <div class="bs-mode-card-desc">Prototype your story before you shoot — develop characters, dramatic arc, and scene-by-scene structure.</div>
    <div class="bs-mode-card-badge">Copilot →</div>
  </div>

</div>

<!-- Secondary: Quick Script -->
<div class="bs-mode-quick-link" id="bs-mode-quick">
  <span>✏ Quick Script</span>
  <span class="bs-mode-quick-hint">Just have an idea? Start here</span>
</div>

<!-- Quick wizard — hidden until Quick is clicked -->
<div id="bs-quick-wizard" class="hidden">
  <p class="bs-wizard-q">What kind of video?</p>
  <div class="bs-wizard-chips" id="bs-quick-q1">
    <button class="bs-wchip" data-q="type" data-v="social">📱 Social media clip</button>
    <button class="bs-wchip" data-q="type" data-v="tutorial">📚 Tutorial / explainer</button>
  </div>
  <div class="bs-wizard-chips hidden" id="bs-quick-q2">
    <button class="bs-wchip" data-q="length" data-v="short">⚡ Short & punchy (under 90s)</button>
    <button class="bs-wchip" data-q="length" data-v="medium">📺 Medium (1–5 min)</button>
    <button class="bs-wchip" data-q="length" data-v="long">🎓 In-depth (5+ min)</button>
  </div>
  <div id="bs-wizard-rec" class="hidden">
    <!-- existing recommendation step markup — unchanged -->
  </div>
</div>
```

**CSS additions** (scoped to `#brainstorm-page`):
```css
#brainstorm-page .bs-mode-cards {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}
#brainstorm-page .bs-mode-card--hero {
  flex: 1;
  padding: 24px;
  border: 1.5px solid var(--lp-card-bdr);
  border-radius: 14px;
  background: var(--lp-bg2);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
#brainstorm-page .bs-mode-card--hero:hover {
  border-color: var(--lp-accent);
  background: var(--lp-bg3);
}
#brainstorm-page .bs-mode-card-icon { font-size: 28px; margin-bottom: 10px; }
#brainstorm-page .bs-mode-card-title { font-size: 17px; font-weight: 600; margin-bottom: 6px; }
#brainstorm-page .bs-mode-card-desc { font-size: 13px; color: var(--lp-dim); line-height: 1.5; margin-bottom: 12px; }
#brainstorm-page .bs-mode-card-badge { font-size: 12px; color: var(--lp-accent); font-weight: 500; }

#brainstorm-page .bs-mode-quick-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: 1px dashed var(--lp-card-bdr);
  border-radius: 10px;
  cursor: pointer;
  color: var(--lp-dim);
  font-size: 14px;
}
#brainstorm-page .bs-mode-quick-link:hover { color: var(--lp-text); border-color: var(--lp-accent); }
#brainstorm-page .bs-mode-quick-hint { font-size: 12px; color: var(--lp-mute); }
```

---

## 11. Summary of All Changed Symbols

| Symbol | Change | File |
|---|---|---|
| `#bs-selector` HTML | Replace chip wizard with three-card layout + collapsible quick wizard | `index.html` |
| Q1 chips `brand` + `personal` | Removed from Quick wizard (now covered by hero cards) | `index.html` |
| `bs-mode-brand`, `bs-mode-film`, `bs-mode-quick` | New DOM elements | `index.html` |
| `brainstormState.mode` | Now stores script mode key (4 values incl. `brand-product`, `film-narrative`) | `26-brainstorm.js` |
| `brainstormState.pipeline` | New field — pipeline destination (`autopilot` \| `copilot`) | `26-brainstorm.js` |
| `_confirmMode()` | New function — entry point for hero card clicks | `26-brainstorm.js` |
| `_confirmWizard()` | Now Quick mode only; splits `mode` from `pipeline` | `26-brainstorm.js` |
| `_recommendPipeline()` | Now Quick mode only (`social`, `tutorial`); Brand/Film never enter it | `26-brainstorm.js` |
| `_updateModeTag()` | Handles 6 mode keys | `26-brainstorm.js` |
| `_updateSendToButton()` | Must read `brainstormState.pipeline`, not `brainstormState.mode` | `26-brainstorm.js` |
| `_init()` | Wire hero card click handlers | `26-brainstorm.js` |
| `SYSTEM_PROMPTS` object | Add `'brand-product'` and `'film-narrative'` keys | `26-brainstorm.js` |
| `FINALISE_PROMPTS` object | Add `'brand-product'` and `'film-narrative'` keys | `26-brainstorm.js` |
| `formatScriptToPlainText()` | Add `brand-product` and `film-narrative` branches | `26-brainstorm.js` |
| `renderFinalScript()` | Add `brand-product` render branch; `film-narrative` render branch | `26-brainstorm.js` |
| `renderScriptMarkdown()` | Add `brand-product` and `film-narrative` markdown templates | `26-brainstorm.js` |
| `_loadSession()` | Backwards compat: default `pipeline` from `mode` if missing | `26-brainstorm.js` |

**No changes to:** `26b-llm-router.js`, `01-core.js`. Minimal additions to `css/styles.css` scoped to `#brainstorm-page` only.
