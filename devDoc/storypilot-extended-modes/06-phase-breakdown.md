# Storypilot Extended Modes — Implementation Phase Breakdown

> **Prerequisite:** Storypilot v1 fully shipped and working. This is a pure extension — no v1 code is removed or restructured, only extended.
>
> **Scope:** `js/26-brainstorm.js` (primary) + `index.html` (selector screen redesign + CSS additions). No other files.

---

## Phase Overview

| Phase | What | Duration estimate |
|---|---|---|
| P1 | State model extension + wizard Q1 chip rename | ~1 hr |
| P2 | Routing logic update | ~1 hr |
| P3 | Brand/Product system prompt + finalise prompt + schema render | ~3 hrs |
| P4 | Film/Narrative system prompt + finalise prompt + schema render | ~3 hrs |
| P5 | VO formatter + markdown download templates for both modes | ~1.5 hrs |
| P6 | Suggestion chips per mode + mode tag labels | ~0.5 hr |
| P7 | Testing (6 happy paths + edge cases) | ~2 hrs |
| P8 | Polish + build | ~0.5 hr |

**Total estimated: ~12.5 hrs / ~1.5 working days**

---

## Phase 1 — Selector Screen Redesign + State Model Extension (~2 hrs)

**Goal:** Replace the chip-based wizard selector with the three-card mode selector (Brand/Product + Film as hero cards, Quick as secondary). Add `brainstormState.pipeline` field. Add backwards compat on session restore.

### Changes

**`index.html` — `#bs-selector` section:**

Replace the existing Q1 wizard chips section entirely with the three-card layout. See `03-wizard-and-routing-changes.md §10` for the full HTML and CSS. Key elements:
- `#bs-mode-brand` — Brand/Product hero card
- `#bs-mode-film` — Film hero card
- `#bs-mode-quick` — Quick Script secondary link
- `#bs-quick-wizard` — collapsible wizard (hidden by default, shown on Quick click)
- Inside `#bs-quick-wizard`: Q1 with only `social` and `tutorial` chips (brand + personal chips removed)

**`css/styles.css` — new selectors** (scoped to `#brainstorm-page`):
- `.bs-mode-cards`, `.bs-mode-card--hero`, `.bs-mode-card-icon`, `.bs-mode-card-title`, `.bs-mode-card-desc`, `.bs-mode-card-badge`
- `.bs-mode-quick-link`, `.bs-mode-quick-hint`

Full CSS in `03-wizard-and-routing-changes.md §10`.

**`js/26-brainstorm.js` — `brainstormState`:**
```diff
  const brainstormState = {
    mode:           null,
+   pipeline:       null,   // 'autopilot' | 'copilot' — the pipeline destination
    // ... all other fields unchanged
  };
```

**`js/26-brainstorm.js` — `_loadSession()` backwards compat:**
```diff
  Object.assign(brainstormState, saved);
+ if (!brainstormState.pipeline) {
+   brainstormState.pipeline = brainstormState.mode;
+ }
```

**`js/26-brainstorm.js` — `_init()` — wire hero card clicks:**
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
  var wizardSection = document.getElementById('bs-quick-wizard');
  if (wizardSection) wizardSection.classList.remove('hidden');
});
```

**`js/26-brainstorm.js` — new `_confirmMode()` function:**
```js
function _confirmMode(mode, pipeline) {
  brainstormState.mode     = mode;
  brainstormState.pipeline = pipeline;
  _updateModeTag(mode);
  _updateSendToButton(pipeline);
  _showScreen('bs-chat');
  _renderGreeting();
}
```

### Acceptance
- [ ] Selector screen shows two hero cards (Brand/Product, Film) and a secondary Quick link.
- [ ] Clicking Brand/Product hero card → goes directly to chat. `mode === 'brand-product'`, `pipeline === 'copilot'`. No Q2 length shown.
- [ ] Clicking Film hero card → goes directly to chat. `mode === 'film-narrative'`, `pipeline === 'copilot'`. No Q2 length shown.
- [ ] Clicking Quick → reveals wizard chips inline. Social and tutorial chips visible. Brand/personal chips gone.
- [ ] `brainstormState.pipeline` exists in the object and is included in `_saveSession()`.
- [ ] A v1 session (no `pipeline` field) restores without error; `pipeline` defaults to `mode` value.
- [ ] Hero cards are visually prominent; Quick link is visually de-emphasised.
- [ ] Light mode and dark mode — card styles correct.

---

## Phase 2 — Routing Logic Update (~1 hr)

**Goal:** Update `_recommendPipeline()`, `_confirmWizard()`, `_updateModeTag()`, `_updateSendToButton()` per `03-wizard-and-routing-changes.md`. Brand/Product and Film never enter `_recommendPipeline()` — their routing is already handled in Phase 1 via `_confirmMode()`.

### Changes — `js/26-brainstorm.js`

Update `_recommendPipeline()` — now Quick mode only (`social`, `tutorial` types):

```js
function _recommendPipeline(type, length) {
  // Only called for Quick mode. Brand/Film routing is fixed — handled in _confirmMode().
  if (length === 'short') return { mode: 'autopilot', reason: _shortReasonFor(type) };
  if (length === 'long')  return { mode: 'copilot',   reason: _longReasonFor(type)  };
  if (type === 'social')  return { mode: 'autopilot', reason: 'Social clips land best under 90 seconds.' };
  if (type === 'tutorial') return { mode: 'copilot',  reason: 'Tutorials need room to breathe.' };
  return { mode: 'copilot', reason: 'Longer content works best in Copilot.' };
}
```

Update `_confirmWizard()` to split `mode` from `pipeline`:
```js
function _confirmWizard(pipelineTarget) {
  // Quick mode only — brand/film use _confirmMode() instead
  const scriptMode = brainstormState.wizardAnswers.type;  // 'social' | 'tutorial'
  brainstormState.mode     = scriptMode;
  brainstormState.pipeline = pipelineTarget;
  _updateModeTag(scriptMode);
  _updateSendToButton(pipelineTarget);
  _showScreen('bs-chat');
  _renderGreeting();
}
```

Update `_updateModeTag()` with all 6 mode keys (see `03-wizard-and-routing-changes.md §7`).

Verify `_updateSendToButton()` reads `pipelineTarget` (the argument), not `brainstormState.mode`.

Verify `_sendMessage()` and `_renderGreeting()` look up system prompt by `brainstormState.mode`:
```js
const systemPrompt = SYSTEM_PROMPTS[brainstormState.mode] || SYSTEM_PROMPTS['copilot'];
```

Verify `_finaliseScript()` looks up finalise prompt by `brainstormState.mode`:
```js
const finalisePrompt = FINALISE_PROMPTS[brainstormState.mode] || FINALISE_PROMPTS['copilot'];
```

### Acceptance
- [ ] Quick: picking `social` + short → recommendation says Autopilot.
- [ ] Quick: picking `tutorial` + medium → recommendation says Copilot.
- [ ] After Quick confirm, `brainstormState.mode` = chip value (`social`|`tutorial`); `brainstormState.pipeline` = recommendation.
- [ ] Chat header mode tag: `🏷 Brand / Product` for brand-product; `🎬 Film / Narrative` for film-narrative; `📱 Social` for social; `📚 Tutorial` for tutorial.
- [ ] Send-to button on Final screen says "Send to Autopilot ⚡" or "Send to Copilot 🎬" based on `pipeline`, not `mode`.
- [ ] Brand/Product and Film never show a recommendation step — they skip directly to chat (Phase 1 test).
- [ ] Existing social and tutorial routing unchanged from v1 behaviour.

---

## Phase 3 — Brand/Product System Prompt + Finalise + Render (~3 hrs)

**Goal:** Full brand-product mode working end-to-end.

### Step 1 — Add prompts to constants

Add `SYSTEM_PROMPTS['brand-product']` from `05-system-prompts.md §1`.  
Add `FINALISE_PROMPTS['brand-product']` from `05-system-prompts.md §3`.

### Step 2 — Suggestion chips

In `renderGreeting()`, add brand-product chips:
```js
const SUGGESTION_CHIPS = {
  'autopilot':     ['Skincare routine', 'Travel vlog', 'Productivity tips'],
  'copilot':       ['Brand story', 'Product explainer', 'Tutorial'],
  'brand-product': ['Launch video for a new skincare product', '30-second brand ad for a SaaS tool', 'Product demo — before/after style'],
  'film-narrative':['A short film about a musician playing their last gig', 'Documentary portrait of a local craftsperson', 'Two strangers on a night bus'],
};
```

### Step 3 — `renderFinalScript()` — brand-product branch

Detect schema shape using `detectScriptShape(s)` (from `04-schema-reference.md`). Add a `'brand-product'` render branch that:
1. Shows a **Brand Brief** card above the scenes: Brand, Product, Core Claim, Proof Points, Narrative Structure, Est. Duration.
2. Shows `scenes[]` with `role` badge alongside scene number.
3. Uses the same base layout as the autopilot render (visual + voice per scene) since the scene shape is compatible.

No new CSS required — reuse existing `.bs-final-card`, `.bs-scene`, `.bs-scene-num`, `.bs-scene-vis`, `.bs-scene-voice` selectors. The Brand Brief block is a new `<div class="bs-brand-brief">` inside `.bs-final-card` — styled with the existing `--lp-card-bdr` border and `--lp-dim` text.

### Step 4 — `renderScriptMarkdown()` — brand-product branch

See `01-brand-product-mode.md §6` for the exact markdown template.

### Acceptance
- [ ] Entering brand-product mode → AI first message asks for brand + product + core claim naturally (no full script on first turn).
- [ ] If vague superlative given → AI pushes back once with a specific question.
- [ ] AI proposes a narrative structure before building scenes.
- [ ] Finalise → JSON contains `brand`, `product`, `core_claim`, `proof_points`, `narrative_structure`, `scenes[].role`.
- [ ] Final screen shows Brand Brief block above scenes.
- [ ] `proof_points` displayed as a bullet list in the Brand Brief.
- [ ] `.md` download contains Brand Brief section.
- [ ] VO plain-text is clean prose (no proof_point metadata artifacts).
- [ ] Send to Copilot works. No "Send to Autopilot" option visible for brand-product mode.

---

## Phase 4 — Film/Narrative System Prompt + Finalise + Render (~3 hrs)

**Goal:** Full film-narrative mode working end-to-end.

### Step 1 — Add prompts to constants

Add `SYSTEM_PROMPTS['film-narrative']` from `05-system-prompts.md §2`.  
Add `FINALISE_PROMPTS['film-narrative']` from `05-system-prompts.md §4`.

### Step 2 — `renderFinalScript()` — film-narrative branch

Add a `'film-narrative'` render branch that:
1. Shows a **Story Architecture** card above scenes: Premise, Genre, Tone, Est. Duration, Structure.
2. Shows a **Characters** section: one card per character showing Name, Role, Want, Obstacle.
3. Shows an **Act Structure** section: one row per act showing N, Label, Summary.
4. Shows `scenes[]` grouped under their act. Each scene shows: act badge, time range, visual, narration (if non-empty), and any dialogue lines as `"Character: line"` formatted entries.

CSS additions (minimal — add to `#brainstorm-page` scope):
- `.bs-character-grid` — flex row, wraps, gap 12px
- `.bs-character-card` — small card with `--lp-card-bdr` border, `--lp-bg2` background
- `.bs-act-row` — simple row with act badge + summary text
- `.bs-dialogue-line` — `color: var(--lp-mute); font-style: italic;` for in-scene dialogue display

### Step 3 — `renderScriptMarkdown()` — film-narrative branch

See `02-film-narrative-mode.md §6` for the exact markdown template.

### Step 4 — No teaser cut path

Film/Narrative always routes to Copilot. There is no Autopilot/teaser path for this mode. The finalise prompt does not need to handle a scene cap or act collapse for Autopilot. Remove any such instruction from the finalise prompt in `05-system-prompts.md §4` if present.

### Acceptance
- [ ] Entering film-narrative mode → AI first message asks for premise + protagonist + intended feeling (not a numbered list).
- [ ] AI proposes 3-act or 5-act structure with a brief per-act sketch for this story.
- [ ] AI builds act by act before filling individual scenes.
- [ ] AI offers dialogue as suggestions ("I could draft a line — want me to?"), not unprompted full dialogues.
- [ ] Around message 12, AI does an arc check and summarises the shape.
- [ ] Finalise → JSON contains `characters[]`, `acts[]`, `scenes[].act`, `scenes[].dialogue[]`.
- [ ] `acts` count matches `structure` value (3 or 5).
- [ ] Final screen shows Story Architecture card, Characters section, Act Structure section.
- [ ] Scenes are grouped under their act in the render.
- [ ] Dialogue lines render as attributed lines below narration.
- [ ] `.md` download contains Characters, Act Structure, and Premise sections.
- [ ] VO plain-text interleaves narration and `Character: line` attribution correctly.
- [ ] No "Send to Autopilot" option visible for film-narrative mode — only "Send to Copilot".

---

## Phase 5 — VO Formatter + Markdown Download (~1.5 hrs)

**Goal:** `formatScriptToPlainText()` and `renderScriptMarkdown()` handle all four schemas cleanly.

### Changes — `js/26-brainstorm.js`

Replace `formatScriptToPlainText()` with the four-branch version using `detectScriptShape()`:

```js
function detectScriptShape(s) {
  if (s.characters !== undefined && s.acts !== undefined)  return 'film-narrative';
  if (s.core_claim !== undefined)                          return 'brand-product';
  if (s.hook !== undefined && s.concept === undefined)     return 'autopilot';
  return 'copilot';
}

function formatScriptToPlainText(s) {
  if (!s) return '';
  const shape = detectScriptShape(s);
  if (shape === 'film-narrative') { /* ... narration + dialogue attribution */ }
  if (shape === 'brand-product')  { /* ... hook + scenes[].voice + cta */ }
  if (shape === 'autopilot')      { /* ... v1 logic */ }
  return /* copilot logic */;
}
```

Update `renderScriptMarkdown()` to call `detectScriptShape()` and dispatch to the correct template.

Update `downloadScript()` footer line to use the `MODE_LABEL` map from `04-schema-reference.md §Modal Footer Line`.

### Acceptance
- [ ] `formatScriptToPlainText()` called on a brand-product script → returns clean VO prose.
- [ ] `formatScriptToPlainText()` called on a film-narrative script → returns narration + attributed dialogue, paragraph-separated.
- [ ] `.md` downloads for all four modes are well-structured, open in VS Code with correct headings and bold.
- [ ] Footer line correctly identifies the mode for each download.
- [ ] Existing autopilot and copilot downloads unchanged (no regression).

---

## Phase 6 — Suggestion Chips + Mode Tags (~0.5 hr)

**Goal:** Correct chips shown per mode; mode tag labels correct in chat header.

Already implemented as part of P3 and P4 above. This phase is a verification sweep:

- [ ] All four modes show their correct 3 suggestion chips in the initial greeting.
- [ ] Clicking a chip pre-fills the textarea (v1 behaviour, unchanged).
- [ ] Mode tag for brand-product: `🏷 Brand / Product`
- [ ] Mode tag for film-narrative: `🎬 Film / Narrative`
- [ ] Mode tag for social/tutorial (generic autopilot/copilot routes): unchanged from v1.

---

## Phase 7 — Testing (~2 hrs)

**Happy path matrix (4 paths):**

| Mode | Pipeline | Test steps |
|---|---|---|
| brand-product | copilot | Selector screen → click Brand/Product hero card → no Q2 shown → 5-msg brand conversation → Finalise → verify JSON + render (Brand Brief block, proof_points, scenes with role badges) → Send to Copilot only |
| film-narrative | copilot | Selector screen → click Film hero card → no Q2 shown → 5-msg narrative conversation → Finalise → verify JSON + render (Characters section, Act Structure, scenes grouped by act) → Send to Copilot only |
| social → autopilot | autopilot | Selector screen → click Quick → social chip → short → confirm → v1 path unchanged — no regression |
| tutorial → copilot | copilot | Selector screen → click Quick → tutorial chip → medium → confirm → v1 path unchanged — no regression |

**Edge cases:**
- [ ] Brand/Product: no Q2 length step appears after clicking hero card — chat loads immediately.
- [ ] Film: no Q2 length step appears after clicking hero card — chat loads immediately.
- [ ] Brand/Product Final screen: "Send to Autopilot" button is absent. Only "Send to Copilot" visible.
- [ ] Film Final screen: "Send to Autopilot" button is absent. Only "Send to Copilot" visible.
- [ ] Vague superlative in brand-product chat → AI pushes back once (check via Pro or Premium tier so the instruction lands precisely).
- [ ] Film-narrative: dialogue in conversation → finalise JSON includes `dialogue[]` array correctly.
- [ ] Film-narrative: 5-act structure selected → `acts` array has 5 entries with correct labels.
- [ ] `_loadSession()` with a v1 session (no `pipeline`) → no error, `pipeline` defaults to `mode`.
- [ ] Provider lock still works across all four modes.
- [ ] `.md` download for each mode: file contains correct sections, footer identifies the mode correctly.
- [ ] Light mode: Brand Brief card and Character cards have correct contrast.
- [ ] Mobile: Character card grid wraps correctly, Act Structure rows stack.
- [ ] Quick mode: selector screen Quick link expands wizard inline — brand/personal chips absent.

---

## Phase 8 — Polish + Build (~0.5 hr)

- Run `node build.js` and verify `dist/index.html` is updated.
- No console errors.
- Quick smoke-test on `dist/` served locally.
- Verify no regressions on Copilot, Autopilot, Photopilot pages.

---

## Dependencies and Constraints

| Dependency | Status |
|---|---|
| Storypilot v1 fully shipped | Must be complete before P1 |
| `detectScriptShape()` must be defined before `formatScriptToPlainText()` and `renderScriptMarkdown()` | P5 adds it; P3 and P4 can reference it if P5 is done first, or inline it temporarily |
| `brainstormState.pipeline` must exist before `confirmWizard()` uses it | P1 prerequisite for P2 |
| Suggestion chips SUGGESTION_CHIPS object can be shared across P3 and P4 | Define once in P3, reference in P4 |
| No changes to `26b-llm-router.js` | Zero risk to provider routing |
| No changes to `css/styles.css` except new character-grid and act-row selectors in `#brainstorm-page` scope | Minimal CSS surface area |
