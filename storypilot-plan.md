# Storypilot — Implementation Plan

> An AI brainstorming workspace that helps users develop video scripts through chat, then hands the finished script off to Autopilot or Copilot.

---

## 1. Product Summary

**What it is.** A new top-level page in the Stori app — a chat workspace where the user talks to an AI brainstorming partner to develop and refine a video script. When the script is ready, the user clicks **Finalise**, and the AI produces a clean structured script that gets sent to either Autopilot (short reel) or Copilot (long-form video).

**Who it's for.** Users who don't have a script yet. They have an idea or a topic but need help shaping it into a video before going into the production pipeline.

**Naming.**
- **Brainstorm** — nav button label and homepage card title (verb, action-oriented, instantly clear).
- **Storypilot** — page identity / brand name (continues the `*pilot` family: Copilot · Autopilot · Photopilot · Storypilot).

**Three-tier model selector — flat per-session pricing (regardless of pipeline).**

| Tier | Model | Charge | Multiplier | Vibe |
|---|---|---|---|---|
| Quick | Gemini 2.5 Flash | **$0.10** | 1X | Fast, reliable, cheap |
| Pro | OpenAI GPT-4o | **$0.30** | 3X | Polished professional, sharper structure |
| Premium | Claude Sonnet 4 | **$0.50** | 5X | Best creative-coach feel, real personality |

User picks a tier on the chat-screen header. **Once the first message is sent, the tier is locked for that session** — the dropdown becomes read-only with a tooltip: *"Model is locked once a session begins. Click 'New session' to switch."* This prevents mid-session model swapping (which fragments conversation tone, complicates billing reconciliation, and confuses cost tracking).

**Margin sanity (15-msg cap, realistic case):**
- Gemini Flash: ~$0.006 cost vs $0.10 charge → 94% margin
- GPT-4o: ~$0.20 cost vs $0.30 charge → 35% margin
- Sonnet 4: ~$0.25 cost vs $0.50 charge → 50% margin

All three tiers profitable across lean / realistic / verbose scenarios at the 15-message cap.

**Session persistence — 24-hour TTL.** The active brainstorm session (messages, provider, mode, finalScript) is saved to `localStorage` on every send and on finalise. A `savedAt` timestamp is stored alongside it. On page load: if a saved session exists and is ≤ 24 hours old, it is restored automatically; if older, it is discarded silently. The ↻ "New session" button clears both in-memory state and the localStorage key immediately. This lets a user refresh the tab mid-brainstorm without losing their work, while ensuring stale sessions don't linger. Billing infrastructure (when it lands) will live server-side. Until then, sessions are not actually billed — pricing is shown for transparency only.

---

## 2. End-to-End User Flow

```
Homepage
   │
   │  click "Brainstorm your story" card
   ▼
Wizard  (Screen 1 — replaces static pipeline selector)
   │
   │  Q1: "What kind of video are you making?"
   │      ○ Social media clip  ○ Brand / product video
   │      ○ Tutorial / explainer  ○ Personal / creative
   │
   │  Q2 appears after Q1 is answered:
   │      "How long should it be?"
   │      ○ Short & punchy (under 90s)
   │      ○ Medium (1–5 min)
   │      ○ In-depth (5+ min)
   │
   │  Recommendation appears after Q2:
   │      e.g. "→ Short Reel via Autopilot — punchy social content."
   │      [Confirm →]   [Switch to Copilot instead]
   │
   │  confirm (or manual override)
   ▼
Chat Workspace
   │
   │  Header has model picker:  [Quick · Pro · Premium]
   │  Default = Quick (Gemini Flash)
   │  Picker is editable until first message is sent
   │  After first send → picker LOCKED for the rest of the session
   │
   │  Back-and-forth conversation with AI
   │  AI asks questions, suggests hooks, builds script iteratively
   │  Message counter visible (e.g. 7/15)
   │  Running cost visible
   │
   │  click "Finalise Script"  (enabled after 3+ exchanges)
   ▼
Final Script Screen
   │
   │  AI-generated structured script displayed
   │  options: Edit | Regenerate | Copy
   │
   │  click "Send to Autopilot"   (or "Send to Copilot")
   ▼
Autopilot / Copilot page
   │
   │  text input field pre-filled with the script
   │  user continues into the existing pipeline
```

---

## 3. Architecture & File Layout

### 3.1 New files

| File | Purpose | ~LOC |
|---|---|---|
| `js/26-brainstorm.js` | All Storypilot UI/state/lifecycle — DOM wiring, chat rendering, finalise, handoff | ~500 |
| `js/26b-llm-router.js` | Provider-agnostic chat call layer — `callChatLLM({ provider, ... })` dispatches to Gemini / OpenAI / Anthropic; normalises response shape and `usageMetadata`. | ~250 |
| (no new CSS file) | Styles added to `css/styles.css` under `#brainstorm-page` scope | — |

### 3.2 Modified files

| File | Change |
|---|---|
| `index.html` | Add homepage card, nav button, `#brainstorm-page` section with three screens (selector + chat + final), add **two new API key fields** in Settings (OpenAI, Anthropic), update `editorScripts` array to include `26-brainstorm.js` and `26b-llm-router.js`, add `'btn-create-storypilot'` to script-loader button list. |
| `css/styles.css` | Add `#brainstorm-page` styles (chat bubbles, sticky input, pipeline cards, **model picker, locked state**, final script panel) — all using existing aurora tokens. |
| `js/01-core.js` | Add `'storypilot'` to the `data-section` map in `navigateTo()`. Add new `trackTokenCost(promptTokens, outputTokens, provider)` function next to existing `trackCost()`. Add `'storypilot'` to `VALID_VIEWS` in popstate handler. Add per-provider `TOKEN_PRICING` table. |
| `js/18-navigation.js` | (Optional) Add `cameFromBrainstorm` flag if we need a back button into Brainstorm. |
| `build.js` | No change — picks up new JS files automatically via the script-tag scan. Verify after first build. |

### 3.3 Reused (read-only)

| Module | What we reuse |
|---|---|
| `js/17a-create-api.js` | `callGeminiAPI()` wrapper for the Gemini Flash branch of the router (model fallback, error handling). |
| `js/01-core.js` | `$()`, `navigateTo()`, `setStatus()`, existing `trackCost()`, session cost display. |
| Aurora design tokens | `--lp-bg`, `--lp-bg2`, `--lp-text`, `--lp-accent`, `--lp-card-bdr`, `--lp-dim`, etc. |
| Theme system | `html[data-theme="light"]` overrides apply automatically via tokens. |

### 3.4 API keys required

| Provider | localStorage key | Used by |
|---|---|---|
| Gemini (existing) | `stori_api_key` (already present) | Quick tier + every other Stori feature |
| OpenAI (new) | `stori_openai_key` | Pro tier (GPT-4o) only |
| Anthropic (new) | `stori_anthropic_key` | Premium tier (Sonnet 4) only |

If a user picks a tier without the corresponding key set, show an inline banner: *"Set your OpenAI key in Settings to use the Pro tier."* with a deeplink to the Settings panel. Quick tier (Gemini) is always available since the Gemini key is the universal app key.

---

## 4. HTML Structure

### 4.1 Homepage card (added in `lp-hero-ctas` and as a feature card)

The hero CTA row gets a fourth button:

```html
<div class="lp-hero-ctas">
  <button id="btn-create-storypilot" class="lp-btn-primary">✨ Brainstorm — AI Script</button>
  <button id="btn-create-content" class="lp-btn-solid">🎬 Copilot — Long Video</button>
  <button id="btn-create-reel" class="lp-btn-solid">⚡ Autopilot — Short Reel</button>
  <button id="btn-create-photopilot" class="lp-btn-solid">📸 Photopilot — Photo Reel</button>
</div>
```

The Brainstorm button is **first** because it's the natural starting point. Promoted to `lp-btn-primary` styling. Other three demoted to `lp-btn-solid` (still visible, just not the lead CTA).

### 4.2 Page section

```html
<!-- ═══ Storypilot Page ═══ -->
<div id="brainstorm-page">

  <!-- Aurora background gradient (handled by CSS ::before, like reel-page) -->

  <!-- Screen 1: Wizard (default visible) -->
  <section id="bs-selector" class="bs-screen">
    <div class="bs-hero">
      <h1 class="bs-title">✨ Storypilot</h1>
      <p class="bs-subtitle">Answer two quick questions — we'll find the right format for you.</p>
    </div>

    <!-- Step 1 -->
    <div class="bs-wizard-step" id="bs-wizard-q1">
      <p class="bs-wizard-q">What kind of video are you making?</p>
      <div class="bs-wizard-chips">
        <button class="bs-wchip" data-q="type" data-v="social">📱 Social media clip</button>
        <button class="bs-wchip" data-q="type" data-v="brand">🏷 Brand / product video</button>
        <button class="bs-wchip" data-q="type" data-v="tutorial">📚 Tutorial / explainer</button>
        <button class="bs-wchip" data-q="type" data-v="personal">🎨 Personal / creative</button>
      </div>
    </div>

    <!-- Step 2 — hidden until Q1 answered -->
    <div class="bs-wizard-step hidden" id="bs-wizard-q2">
      <p class="bs-wizard-q">How long should it be?</p>
      <div class="bs-wizard-chips">
        <button class="bs-wchip" data-q="length" data-v="short">⚡ Short & punchy (under 90s)</button>
        <button class="bs-wchip" data-q="length" data-v="medium">🎬 Medium (1–5 min)</button>
        <button class="bs-wchip" data-q="length" data-v="long">📖 In-depth (5+ min)</button>
      </div>
    </div>

    <!-- Recommendation — hidden until Q2 answered -->
    <div class="bs-wizard-step hidden" id="bs-wizard-rec">
      <div class="bs-rec-card">
        <div class="bs-rec-icon" id="bs-rec-icon"></div>
        <div class="bs-rec-body">
          <div class="bs-rec-pipeline" id="bs-rec-pipeline"></div>
          <div class="bs-rec-reason"  id="bs-rec-reason"></div>
        </div>
      </div>
      <div class="bs-rec-actions">
        <button id="bs-wizard-confirm" class="bs-btn-primary">Confirm →</button>
        <button id="bs-wizard-switch"  class="bs-btn-ghost"   id="bs-wizard-switch"></button>
      </div>
      <p class="bs-pricing-note">
        Pick your AI on the next screen: <b>Quick</b> ($0.10) · <b>Pro</b> ($0.30) · <b>Premium</b> ($0.50).
      </p>
    </div>
  </section>

  <!-- Screen 2: Chat workspace (hidden initially) -->
  <section id="bs-chat" class="bs-screen hidden">
    <header class="bs-chat-hdr">
      <button id="bs-back-btn" class="bs-icon-btn">←</button>
      <div class="bs-chat-hdr-text">
        <div class="bs-chat-title">✨ Storypilot <span id="bs-mode-tag" class="bs-mode-tag">⚡ Autopilot</span></div>
        <div class="bs-chat-meta">
          <span id="bs-msg-count">0/15 messages</span>
          <span class="bs-meta-dot">·</span>
          <span id="bs-cost-tag">~$0.000 used</span>
        </div>
      </div>

      <!-- Model picker — editable until first message; locked thereafter -->
      <div id="bs-model-picker" class="bs-model-picker" data-locked="false">
        <button class="bs-model-opt active" data-provider="gemini"   title="Gemini 2.5 Flash">
          <span class="bs-model-tag">Quick</span>
          <span class="bs-model-price">$0.10</span>
        </button>
        <button class="bs-model-opt"        data-provider="openai"   title="GPT-4o">
          <span class="bs-model-tag">Pro</span>
          <span class="bs-model-price">$0.30</span>
        </button>
        <button class="bs-model-opt"        data-provider="anthropic" title="Claude Sonnet 4">
          <span class="bs-model-tag">Premium</span>
          <span class="bs-model-price">$0.50</span>
        </button>
        <span class="bs-model-lock-icon" aria-hidden="true">🔒</span>
      </div>

      <button id="bs-new-btn" class="bs-icon-btn" title="New session">↻</button>
    </header>

    <div id="bs-chat-log" class="bs-chat-log" role="log" aria-live="polite">
      <!-- Messages injected here -->
    </div>

    <div class="bs-chat-input-bar">
      <textarea id="bs-input" rows="1" placeholder="Type your reply..."></textarea>
      <button id="bs-send-btn" class="bs-send-btn" disabled>Send ↗</button>
    </div>

    <div class="bs-chat-actions">
      <button id="bs-finalise-btn" class="bs-finalise-btn" disabled>✨ Finalise Script</button>
      <span class="bs-hint" id="bs-finalise-hint">Finalise enabled after 3+ exchanges</span>
    </div>
  </section>

  <!-- Screen 3: Final script (hidden initially) -->
  <section id="bs-final" class="bs-screen hidden">
    <header class="bs-final-hdr">
      <button id="bs-final-back-btn" class="bs-icon-btn">←</button>
      <h2>✨ Your script is ready</h2>
    </header>

    <div id="bs-final-card" class="bs-final-card">
      <!-- Structured script rendered here -->
    </div>

    <div class="bs-final-tools">
      <button id="bs-edit-btn" class="bs-tool-btn">✏ Edit</button>
      <button id="bs-regen-btn" class="bs-tool-btn">↻ Regenerate</button>
      <button id="bs-copy-btn" class="bs-tool-btn">📋 Copy</button>
      <button id="bs-download-btn" class="bs-tool-btn" title="Save the script to your device">⬇ Download</button>
    </div>

    <h3 class="bs-handoff-h">Send to:</h3>
    <div class="bs-handoff-grid">
      <button id="bs-send-pipeline-btn" class="bs-handoff-card primary">
        <span class="bs-handoff-icon"></span> <!-- ⚡ or 🎬 set by JS -->
        <span class="bs-handoff-text">Send to <span id="bs-handoff-pipeline-name"></span></span>
        <span class="bs-handoff-sub">Pre-fill the script and open the pipeline</span>
      </button>
      <button id="bs-copy-clipboard-btn" class="bs-handoff-card">
        <span class="bs-handoff-icon">📋</span>
        <span class="bs-handoff-text">Copy to clipboard</span>
        <span class="bs-handoff-sub">Use it elsewhere</span>
      </button>
    </div>
  </section>

</div>
```

### 4.3 Wizard recommendation logic

```js
// Maps Q1 (type) × Q2 (length) → pipeline recommendation
function recommendPipeline(type, length) {
  // Short always → Autopilot, regardless of type
  if (length === 'short') return { mode: 'autopilot', reason: 'Short & punchy — perfect for a quick reel.' };
  // Long always → Copilot
  if (length === 'long')  return { mode: 'copilot',   reason: 'In-depth content works best in long-form.' };
  // Medium — split by type
  if (type === 'social' || type === 'personal')
                          return { mode: 'autopilot', reason: 'Social clips land best under 90 seconds.' };
  return                         { mode: 'copilot',   reason: 'Tutorials and brand stories need room to breathe.' };
}

// Called after both chips selected
function showRecommendation() {
  const { type, length } = brainstormState.wizardAnswers;
  const rec = recommendPipeline(type, length);

  const icon     = rec.mode === 'autopilot' ? '⚡' : '🎬';
  const label    = rec.mode === 'autopilot' ? '⚡ Short Reel — Autopilot' : '🎬 Long Video — Copilot';
  const switchLbl = rec.mode === 'autopilot' ? 'Switch to Copilot instead' : 'Switch to Autopilot instead';
  const switchMode = rec.mode === 'autopilot' ? 'copilot' : 'autopilot';

  $('#bs-rec-icon').textContent     = icon;
  $('#bs-rec-pipeline').textContent = label;
  $('#bs-rec-reason').textContent   = rec.reason;
  $('#bs-wizard-switch').textContent = switchLbl;
  $('#bs-wizard-switch').onclick    = () => confirmWizard(switchMode);
  $('#bs-wizard-confirm').onclick   = () => confirmWizard(rec.mode);

  document.getElementById('bs-wizard-rec').classList.remove('hidden');
}

// Confirm button (or switch) → enter chat
function confirmWizard(mode) {
  brainstormState.mode = mode;
  // mode is set; chat header tag and Send-to button update from this single source of truth
  updateModeTag(mode);
  updateSendToButton(mode);    // sets icon + label on #bs-send-pipeline-btn / #bs-handoff-pipeline-name
  document.getElementById('bs-selector').classList.add('hidden');
  document.getElementById('bs-chat').classList.remove('hidden');
  renderGreeting();            // AI greeting includes wizard context — no re-asking
}
```

**How wizard answers pre-seed the chat:** `renderGreeting()` reads `brainstormState.wizardAnswers` and appends a hidden context block to the system prompt before the first API call, e.g.:

```
[User context from wizard: type=social, length=short — skip re-asking these; treat as already known.]
```

The AI skips its usual "what kind of video?" opener and jumps straight to hook ideas or tone questions.

**Send-to button is set here.** `confirmWizard(mode)` calls `updateSendToButton(mode)` which sets the icon and label on `#bs-send-pipeline-btn` (Final screen) immediately — so by the time the user reaches the Final screen, the button already reads "Send to Autopilot ⚡" or "Send to Copilot 🎬" with no ambiguity.

---

## 5. CSS Design — Aurora-Native

All styles live in `css/styles.css` under `#brainstorm-page` scope. Light/dark mode is automatic via existing `--lp-*` tokens.

### 5.1 Aurora background

```css
#brainstorm-page::before {
  content: ""; position: fixed; inset: 0; z-index: -1;
  background:
    radial-gradient(ellipse 60% 40% at 20% 30%, color-mix(in oklch, var(--lp-accent) 18%, transparent) 0%, transparent 60%),
    radial-gradient(ellipse 50% 50% at 85% 75%, color-mix(in oklch, var(--lp-accent2) 14%, transparent) 0%, transparent 65%),
    var(--lp-bg);
  filter: blur(80px); pointer-events: none;
}
```
(Same pattern as `#reel-page::before`.)

### 5.2 Wizard — steps, chips, recommendation card

```css
/* Wizard step — each question block */
.bs-wizard-step {
  max-width: 560px; margin: 0 auto 28px;
  animation: bs-fadein .2s ease;
}
@keyframes bs-fadein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

.bs-wizard-q {
  font-size: 17px; font-weight: 600; color: var(--lp-text);
  margin-bottom: 14px; text-align: center;
}

/* Answer chips */
.bs-wizard-chips { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
.bs-wchip {
  background: color-mix(in oklch, var(--lp-bg2) 82%, var(--lp-accent) 4%);
  border: 1px solid var(--lp-card-bdr);
  border-radius: 999px; padding: 10px 20px;
  font-size: 14px; color: var(--lp-dim); cursor: pointer; font-family: inherit;
  transition: border-color .15s, color .15s, background .15s;
}
.bs-wchip:hover { border-color: var(--lp-accent); color: var(--lp-text); }
.bs-wchip.selected {
  background: color-mix(in oklch, var(--lp-accent) 18%, var(--lp-bg2));
  border-color: var(--lp-accent); color: var(--lp-text); font-weight: 600;
}

/* Recommendation card */
.bs-rec-card {
  display: flex; align-items: center; gap: 16px;
  background: color-mix(in oklch, var(--lp-bg2) 85%, var(--lp-accent) 4%);
  border: 1px solid var(--lp-card-bdr-h);
  border-radius: 16px; padding: 20px 24px; margin-bottom: 20px;
}
.bs-rec-icon   { font-size: 36px; flex-shrink: 0; }
.bs-rec-pipeline { font-size: 16px; font-weight: 600; color: var(--lp-text); }
.bs-rec-reason   { font-size: 13px; color: var(--lp-mute); margin-top: 3px; }

.bs-rec-actions { display: flex; gap: 10px; justify-content: center; margin-bottom: 16px; }
.bs-btn-primary {
  background: var(--lp-accent); color: var(--lp-on-accent);
  border: none; border-radius: 12px; padding: 10px 28px;
  font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: filter .15s;
}
.bs-btn-primary:hover { filter: brightness(1.08); }
.bs-btn-ghost {
  background: transparent; color: var(--lp-mute);
  border: 1px solid var(--lp-bdr); border-radius: 12px; padding: 10px 20px;
  font-size: 14px; cursor: pointer; font-family: inherit;
  transition: color .15s, border-color .15s;
}
.bs-btn-ghost:hover { color: var(--lp-text); border-color: var(--lp-bdr-h); }
```

### 5.3 Chat bubbles

```css
.bs-chat-log {
  max-width: 760px; margin: 0 auto;
  padding: 24px 16px 120px;          /* bottom padding so sticky input doesn't cover last msg */
  display: flex; flex-direction: column; gap: 14px;
}
.bs-msg { max-width: 85%; padding: 12px 16px; border-radius: 14px; line-height: 1.5; font-size: 14px; }
.bs-msg-ai {
  align-self: flex-start;
  background: color-mix(in oklch, var(--lp-bg2) 92%, var(--lp-accent) 4%);
  border: 1px solid var(--lp-card-bdr);
  color: var(--lp-text);
}
.bs-msg-user {
  align-self: flex-end;
  background: color-mix(in oklch, var(--lp-accent) 22%, var(--lp-bg2));
  border: 1px solid color-mix(in oklch, var(--lp-accent) 35%, var(--lp-card-bdr));
  color: var(--lp-text);
}
.bs-msg-typing {
  align-self: flex-start; padding: 12px 16px;
  background: color-mix(in oklch, var(--lp-bg2) 92%, transparent);
  border-radius: 14px;
}
.bs-msg-typing .dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: var(--lp-accent); margin: 0 2px;
  animation: bs-typing 1.2s infinite;
}
.bs-msg-typing .dot:nth-child(2) { animation-delay: .15s; }
.bs-msg-typing .dot:nth-child(3) { animation-delay: .3s; }
@keyframes bs-typing { 0%,60%,100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
```

### 5.4 Sticky input bar

```css
.bs-chat-input-bar {
  position: sticky; bottom: 60px;
  max-width: 760px; margin: 0 auto;
  display: flex; gap: 8px; padding: 10px;
  background: color-mix(in oklch, var(--lp-bg) 88%, transparent);
  backdrop-filter: blur(12px);
  border: 1px solid var(--lp-card-bdr);
  border-radius: 16px;
}
.bs-chat-input-bar textarea {
  flex: 1; resize: none; min-height: 40px; max-height: 160px;
  background: transparent; border: none; outline: none;
  color: var(--lp-text); font-family: inherit; font-size: 14px;
}
.bs-send-btn {
  background: var(--lp-accent); color: var(--lp-on-accent);
  border: none; border-radius: 12px; padding: 8px 18px; font-weight: 600;
  cursor: pointer; transition: filter .15s, opacity .15s;
}
.bs-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bs-send-btn:not(:disabled):hover { filter: brightness(1.08); }
```

### 5.5 Suggestion chips (empty state)

```css
.bs-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.bs-chip {
  background: color-mix(in oklch, var(--lp-bg2) 80%, var(--lp-accent) 6%);
  border: 1px solid var(--lp-card-bdr);
  border-radius: 999px; padding: 6px 14px;
  font-size: 12px; color: var(--lp-dim); cursor: pointer;
  transition: border-color .15s, color .15s;
}
.bs-chip:hover { border-color: var(--lp-accent); color: var(--lp-text); }
```

### 5.6 Final script card

```css
.bs-final-card {
  max-width: 760px; margin: 24px auto;
  background: color-mix(in oklch, var(--lp-bg2) 88%, var(--lp-accent) 3%);
  border: 1px solid var(--lp-card-bdr);
  border-radius: 16px;
  padding: 28px 32px;
  font-family: var(--lp-font-ui);
  color: var(--lp-text); line-height: 1.65;
}
.bs-final-card h3 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
.bs-final-card .bs-meta-pills { display: flex; gap: 8px; margin: 8px 0 20px; }
.bs-final-card .bs-meta-pill {
  font-size: 11px; padding: 3px 10px; border-radius: 999px;
  background: color-mix(in oklch, var(--lp-bg) 70%, transparent);
  border: 1px solid var(--lp-card-bdr); color: var(--lp-dim);
}
.bs-final-card .bs-scene { margin: 14px 0; padding-left: 14px; border-left: 2px solid var(--lp-accent); }
.bs-final-card .bs-scene-num { font-size: 11px; color: var(--lp-accent); text-transform: uppercase; }
.bs-final-card .bs-scene-vis { color: var(--lp-mute); font-style: italic; }
.bs-final-card .bs-scene-voice { color: var(--lp-text); margin-top: 4px; }
```

### 5.7 Model picker (chat header)

```css
.bs-model-picker {
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  padding: 3px;
  background: color-mix(in oklch, var(--lp-bg) 70%, transparent);
  border: 1px solid var(--lp-card-bdr);
  border-radius: 999px;
  position: relative;
}
.bs-model-opt {
  background: transparent; border: none;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  display: flex; flex-direction: column; align-items: center;
  font-family: inherit;
  transition: background .15s, color .15s;
}
.bs-model-opt .bs-model-tag   { font-size: 11px; font-weight: 600; color: var(--lp-text); }
.bs-model-opt .bs-model-price { font-size: 10px; color: var(--lp-mute); }
.bs-model-opt:hover { background: color-mix(in oklch, var(--lp-accent) 8%, transparent); }
.bs-model-opt.active {
  background: var(--lp-accent);
}
.bs-model-opt.active .bs-model-tag,
.bs-model-opt.active .bs-model-price { color: var(--lp-on-accent); }

/* Locked state — picker becomes read-only after first message */
.bs-model-lock-icon { display: none; align-self: center; padding: 0 8px; color: var(--lp-mute); font-size: 12px; }
.bs-model-picker[data-locked="true"] .bs-model-opt { cursor: not-allowed; opacity: 0.55; }
.bs-model-picker[data-locked="true"] .bs-model-opt.active { opacity: 1; }   /* keep selected one bright */
.bs-model-picker[data-locked="true"] .bs-model-opt:not(.active) { display: none; } /* hide non-selected pills */
.bs-model-picker[data-locked="true"] .bs-model-lock-icon { display: inline-flex; }
.bs-model-picker[data-locked="true"] { padding-right: 0; }
```

Behaviour:
- Default state: three pills visible, current tier highlighted with `--lp-accent`.
- After first send: non-selected pills hide, lock icon appears, selected pill stays highlighted with reduced interactive affordances. Tooltip on the picker container explains: *"Model is locked for this session."*

### 5.8 Pricing note (selector screen)

```css
.bs-pricing-note {
  text-align: center; max-width: 560px; margin: 24px auto 0;
  font-size: 13px; color: var(--lp-mute);
}
.bs-pricing-note b { color: var(--lp-text); font-weight: 600; }
```

### 5.9 Mobile

```css
@media (max-width: 640px) {
  .bs-wizard-chips { flex-direction: column; align-items: stretch; }
  .bs-wchip { text-align: center; }
  .bs-rec-actions { flex-direction: column; }
  .bs-chat-log { padding: 16px 10px 140px; }
  .bs-chat-input-bar { bottom: 16px; margin: 0 10px; }
  .bs-msg { max-width: 92%; }
  .bs-chat-hdr { flex-wrap: wrap; }
  .bs-model-picker { order: 99; width: 100%; justify-content: center; margin-top: 8px; }
}
```

---

## 6. State Model

A single global `brainstormState` object inside `js/26-brainstorm.js`. Saved to localStorage with a 24-hour TTL; restored automatically on page load if not expired.

```js
const brainstormState = {
  mode: null,                // 'autopilot' | 'copilot' | null
  provider: 'gemini',        // 'gemini' | 'openai' | 'anthropic'   — default Quick
  providerLocked: false,     // flips true on first send; no further changes allowed
  startedAt: null,           // Date.now()
  messages: [],              // [{ role: 'system'|'user'|'assistant'|'model', content: '...' }]
                             // Note: 'assistant' for OpenAI/Anthropic, 'model' for Gemini —
                             // router normalises on the way out
  messageCount: 0,           // user-AI exchanges (1 user + 1 ai = 1)
  totalInputTokens: 0,
  totalOutputTokens: 0,
  finalScript: null,         // { title, hook, scenes:[...], cta, ... }
  finalised: false,
  wizardAnswers: {},         // { type: 'social'|'brand'|'tutorial'|'personal', length: 'short'|'medium'|'long' }
                             // injected as context into the system prompt; AI skips re-asking these
  savedAt: null,             // Date.now() — written on every save; TTL check on restore
};
```

**localStorage persistence — 24h TTL.**

```js
const BS_STORAGE_KEY = 'stori_bs_session';
const BS_TTL_MS      = 24 * 60 * 60 * 1000;   // 24 hours

function saveSession() {
  brainstormState.savedAt = Date.now();
  try { localStorage.setItem(BS_STORAGE_KEY, JSON.stringify(brainstormState)); } catch (_) {}
}

function loadSession() {
  try {
    const raw = localStorage.getItem(BS_STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved.savedAt || (Date.now() - saved.savedAt) > BS_TTL_MS) {
      localStorage.removeItem(BS_STORAGE_KEY);  // expired — discard silently
      return false;
    }
    Object.assign(brainstormState, saved);
    return true;
  } catch (_) { return false; }
}

function clearSession() {
  localStorage.removeItem(BS_STORAGE_KEY);
  // reset brainstormState to defaults…
}
```

`saveSession()` is called after every `sendMessage()` reply lands and after `finaliseScript()` completes.
`loadSession()` is called once in the module IIFE — if it returns `true`, re-render the chat log and skip the greeting.
`clearSession()` is called by the ↻ "New session" button and the back-to-selector flow.

**Provider lock invariant.** Once `providerLocked === true`, the only way to change provider is `resetSession()` (triggered by the ↻ button or back-to-selector flow), which clears the entire `brainstormState`, removes the localStorage key, and re-renders the picker as unlocked. This is enforced in three places:
1. **UI** — picker becomes read-only (CSS `data-locked="true"`).
2. **Click handler** — early-return if locked, no state change.
3. **Pre-send guard** — `sendMessage()` reads `brainstormState.provider` directly; even if a click somehow slipped through, the actual provider used is whatever was locked in.

**What is and isn't persisted.** Only the fields in `brainstormState` (messages, provider, mode, tokens, finalScript) are written to localStorage. API keys (`stori_api_key`, `stori_openai_key`, `stori_anthropic_key`) are already in localStorage separately and are unaffected. The session key is a single JSON blob; it is never sent to any server.

---

## 7. Multi-Provider API Integration

The chat layer is **provider-agnostic** so the model picker is a one-state-line change, never a code branch outside the router.

### 7.1 Models per tier

| Tier | Provider key | Model ID | Endpoint |
|---|---|---|---|
| Quick | `gemini` | `gemini-2.5-flash-preview-04-17` | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| Pro | `openai` | `gpt-4o` | `https://api.openai.com/v1/chat/completions` |
| Premium | `anthropic` | `claude-sonnet-4-20250514` | `https://api.anthropic.com/v1/messages` (verify exact model ID with Anthropic dashboard before shipping) |

### 7.2 Provider abstraction — `js/26b-llm-router.js`

```js
// Public entry point. brainstorm.js never talks to provider SDKs directly.
export async function callChatLLM({ provider, messages, systemPrompt, jsonMode = false, maxTokens = 300 }) {
  // messages = canonical shape: [{ role: 'user'|'assistant', content: '...' }]
  // systemPrompt = string; router places it according to provider conventions

  if (provider === 'gemini')    return _callGemini(messages, systemPrompt, jsonMode, maxTokens);
  if (provider === 'openai')    return _callOpenAI(messages, systemPrompt, jsonMode, maxTokens);
  if (provider === 'anthropic') return _callAnthropic(messages, systemPrompt, jsonMode, maxTokens);
  throw new Error('Unknown provider: ' + provider);
}

// Returns canonical shape:
// { text: '...', inputTokens: N, outputTokens: N, costUsd: 0.00xx, model: '...' }
```

### 7.3 Per-provider implementations (sketch)

**Gemini** (Quick — primer-pair pattern, same as rest of Stori):
```js
async function _callGemini(messages, systemPrompt, jsonMode, maxTokens) {
  const apiKey = localStorage.getItem('stori_api_key');
  const contents = [
    { role: 'user',  parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Understood. Ready to help.' }] },
    ...messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
  ];
  const body = {
    contents,
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: maxTokens,
      ...(jsonMode ? { response_mime_type: 'application/json' } : {})
    }
  };
  const data = await callGeminiAPI(['gemini-2.5-flash-preview-04-17'], body, apiKey);
  return _normaliseGemini(data);
}
```

**OpenAI** (Pro — native `system` role):
```js
async function _callOpenAI(messages, systemPrompt, jsonMode, maxTokens) {
  const apiKey = localStorage.getItem('stori_openai_key');
  if (!apiKey) throw new Error('NO_OPENAI_KEY');
  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages   // already in OpenAI shape
    ],
    max_tokens: maxTokens,
    temperature: 0.85,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
  };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  return _normaliseOpenAI(await r.json());
}
```

**Anthropic** (Premium — `system` is top-level field, messages must alternate user/assistant):
```js
async function _callAnthropic(messages, systemPrompt, jsonMode, maxTokens) {
  const apiKey = localStorage.getItem('stori_anthropic_key');
  if (!apiKey) throw new Error('NO_ANTHROPIC_KEY');
  // jsonMode: Anthropic doesn't have a native JSON mode — we append a "respond with JSON only" instruction
  // to systemPrompt instead, which is what the finalise prompt already does explicitly.
  const body = {
    model: 'claude-sonnet-4-20250514',
    system: systemPrompt,
    messages,                                    // already in user/assistant shape
    max_tokens: maxTokens,
    temperature: 0.85
  };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'   // required for browser-side calls
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  return _normaliseAnthropic(await r.json());
}
```

### 7.4 Response normalisation

Each `_normalise*` function extracts the response text + token counts into the canonical shape and computes cost via `trackTokenCost(...)`.

| Provider | Text path | Input tokens | Output tokens |
|---|---|---|---|
| Gemini | `data.candidates[0].content.parts[0].text` | `data.usageMetadata.promptTokenCount` | `data.usageMetadata.candidatesTokenCount` |
| OpenAI | `data.choices[0].message.content` | `data.usage.prompt_tokens` | `data.usage.completion_tokens` |
| Anthropic | `data.content[0].text` | `data.usage.input_tokens` | `data.usage.output_tokens` |

### 7.5 Pricing table — `js/01-core.js`

```js
const TOKEN_PRICING = {
  // Gemini (Quick tier)
  'gemini':    { in: 0.000000075, out: 0.000000300 },   // $0.075 / $0.30 per M
  // OpenAI (Pro tier)
  'openai':    { in: 0.000002500, out: 0.000010000 },   // $2.50 / $10 per M
  // Anthropic (Premium tier)
  'anthropic': { in: 0.000003000, out: 0.000015000 },   // $3 / $15 per M
};

function trackTokenCost(promptTokens, outputTokens, provider) {
  const p = TOKEN_PRICING[provider] || TOKEN_PRICING['gemini'];
  const cost = (promptTokens * p.in) + (outputTokens * p.out);
  sessionCost += cost;
  sessionCalls += 1;
  updateCostDisplay();
  return cost;
}
```

### 7.6 Why primer-pair only for Gemini

Gemini's `systemInstruction` field exists but Stori's existing pipeline uses the primer-pair pattern (system as first `user` turn → `model` ack → real conversation). The router preserves this for Gemini for consistency with the rest of the codebase. OpenAI and Anthropic both have proper top-level `system` fields, so we use those — cleaner, no token waste on a faked AI ack.

### 7.7 Brevity enforcement (margin protection)

Hard cap on every chat call:
- `max_tokens: 300` (OpenAI / Anthropic) / `maxOutputTokens: 300` (Gemini)
- Brevity instruction in every system prompt: *"Replies must stay under 150 words. Bullet points, not paragraphs. Never re-explain prior context."*

Verbose-scenario costs in the margin tables assume this enforcement is in place. Without it, Premium tier (Sonnet) verbose case loses money.

### 7.8 Finalise call

The finalise call uses `jsonMode: true` and a higher cap (`maxTokens: 1200`) since the structured JSON output is unavoidably long. Called once per session — extra cost is bounded.

---

## 8. System Prompts

### 8.1 Autopilot system prompt (constant in `26-brainstorm.js`)

```
You are an expert short-form video script coach for Stori, specialising in
TikTok, Instagram Reels and YouTube Shorts. Your role is to help the user
brainstorm and refine a 30–90 second video script through conversation.

BEHAVIOUR RULES:
1. NEVER output a full script in your first reply. Begin by asking 2–3
   targeted questions: topic, target audience, tone (educational, funny,
   emotional, aesthetic), and platform (TikTok / IG Reel / YT Shorts).
2. Always offer 2–3 hook options for the user to pick from. Hooks are the
   first 3 seconds — they decide whether the viewer keeps watching.
3. Build the script iteratively, scene by scene. Get user approval before
   moving to the next scene.
4. BREVITY IS NON-NEGOTIABLE. Every reply must stay under 150 words.
   Use bullet points, not paragraphs. Never re-explain prior context.
   Bold the key choice or question. Get to the point fast.
5. Suggest scene visuals and voiceover/caption text together — both matter
   for short-form video.
6. End with a clear CTA suggestion: save, share, follow, comment, or visit link.
7. If the user goes off-track, gently steer the conversation back to script
   development.
8. Match the user's energy and tone. Be a creative partner, not a corporate
   assistant.
9. Around message 12 of 15, gently nudge: "We've covered a lot — ready to
   finalise the script, or want to keep refining a specific part?"

SCOPE LIMITS:
- Don't write full scripts on demand. Always converse first.
- Don't suggest more than 9 scenes total (Autopilot's grid layout).
- Don't include advanced production directions (camera moves, lighting setups,
  transitions). Focus on visual concept + spoken/displayed words.
```

### 8.2 Copilot system prompt

```
You are an expert long-form video storytelling coach for Stori, specialising
in explainers, documentaries, brand films, educational videos, and narrative
content. Your role is to help the user brainstorm and develop a video script
through conversation.

BEHAVIOUR RULES:
1. NEVER output a full script in your first reply. Begin by understanding:
   topic, target audience, intended length (1–10 minutes), purpose (inform /
   sell / inspire / entertain), and the single key message they want viewers
   to walk away with.
2. Help the user choose a narrative structure — 3-act, problem-solution,
   listicle, before-after, journey/transformation. Suggest 1–2 options that
   fit their topic.
3. Develop the script in sections (intro / body / outro), getting user
   approval before each section is fully written.
4. Each scene should include: visual description, narration/dialogue, and
   tone/mood notes. Be more detailed than for short-form.
5. Suggest pacing — how long each section should be, where to slow down for
   impact, where to keep momentum.
6. Recommend music tone and any voice-acting direction (warm, urgent,
   measured, conversational).
7. Match the user's energy and tone. Be a creative partner, not a corporate
   assistant.
8. BREVITY IS NON-NEGOTIABLE. Every reply must stay under 150 words.
   Use bullet points, not paragraphs. Never re-explain prior context.
   Bold the key choice or question. Develop ONE section at a time.
9. Around message 12 of 15, gently nudge: "We've outlined a strong shape —
   ready to finalise, or is there a section you want to refine first?"

SCOPE LIMITS:
- Don't write full scripts on demand. Always converse first.
- Don't include advanced production directions beyond visual + narration +
  tone. Stori's pipeline handles the rest.
```

### 8.3 Finalise prompt (separate API call, structured output)

When user clicks Finalise, send the entire chat history plus this final instruction. Note: for OpenAI/Gemini we use native JSON mode; for Anthropic we rely on the explicit "Output ONLY the JSON" instruction since native JSON mode isn't available.

**Autopilot finalise:**
```
The user has clicked "Finalise Script". Based on our conversation above,
generate the final structured script in this exact JSON format. Output ONLY
the JSON, no preamble or explanation.

{
  "title": "...",
  "tone": "...",
  "platform": "...",
  "estDuration": "30s|45s|60s|...",
  "hook": "Opening line said in first 3 seconds",
  "scenes": [
    { "n": 1, "timeRange": "0-3s",  "visual": "...", "voice": "..." },
    { "n": 2, "timeRange": "3-8s",  "visual": "...", "voice": "..." },
    ...
  ],
  "cta": "Final call to action"
}

RULES:
- Maximum 9 scenes.
- Total duration must match estDuration.
- Each scene: 3–8 seconds.
- voice = exactly what should be spoken or shown as text on screen.
- visual = a single concrete image that illustrates the scene.
```

**Copilot finalise:**
```
The user has clicked "Finalise Script". Based on our conversation above,
generate the final structured script in this exact JSON format. Output ONLY
the JSON, no preamble or explanation.

{
  "title": "...",
  "concept": "One-paragraph description of the video",
  "audience": "...",
  "tone": "...",
  "musicTone": "...",
  "estDuration": "2:30",
  "scenes": [
    { "n": 1, "section": "intro|body|outro", "timeRange": "0:00-0:15",
      "visual": "...", "narration": "...", "mood": "..." },
    ...
  ]
}

RULES:
- Length must match estDuration.
- Cover intro → body → outro structure.
- visual = scene description; narration = spoken voiceover; mood = emotional tone.
```

Finalise is dispatched through the same `callChatLLM(...)` router with `jsonMode: true` and `maxTokens: 1200`. Parse with `JSON.parse()` inside a try/catch; on failure, run one cleanup retry that re-asks the model: *"Your previous reply was not valid JSON. Output the script as JSON only, no markdown, no preamble."*

---

## 9. Module Layout

### 9.1 `js/26-brainstorm.js` — UI/state/lifecycle

```
SECTION 1.  Constants — SYSTEM_PROMPTS{autopilot,copilot}, FINALISE_PROMPTS{autopilot,copilot}, MAX_MESSAGES=15, FINALISE_MIN_EXCHANGES=3, FINALISE_NUDGE_AT=12
SECTION 2.  State — brainstormState (object), DOM refs ($ lookups for every #bs-* id)
SECTION 3.  Init — IIFE: wire homepage button → navigateTo('storypilot'); wire selector cards; wire model picker; wire chat input; wire finalise/back/new buttons; install beforeunload warning
SECTION 4.  Wizard — chip clicks store answer in state.wizardAnswers, reveal next step with fade-in; after Q2 run recommendPipeline() → show recommendation card + Confirm / Switch buttons; confirmWizard(mode) sets state.mode, state.wizardAnswers, updates header tag, shows #bs-chat, hides #bs-selector, renders greeting with wizard context pre-loaded (AI skips re-asking type/length)
SECTION 5.  Model picker — selectProvider(provider): early-return if state.providerLocked; otherwise update state.provider, update active pill, check API key for selected provider, show inline banner if missing
SECTION 6.  Chat rendering — renderMessages(): re-render full log; appendMessage(role, content); showTyping(); hideTyping()
SECTION 7.  Send — sendMessage(): on first send, set state.providerLocked=true and re-render picker as locked; build messages array; call callChatLLM({ provider: state.provider, messages, systemPrompt, maxTokens: 300 }); push reply; updateMeta()
SECTION 8.  Lifecycle — resetSession() clears state + localStorage key (`stori_bs_session`), unlocks picker, returns to selector; loadSession() restores from localStorage on init if ≤ 24 h old; saveSession() called after every AI reply and after finalise; no beforeunload warning (refresh is safe)
SECTION 9.  Cost / counter — updateMeta(): refresh #bs-msg-count (N/15) and #bs-cost-tag
SECTION 10. Limits — checkMessageLimit() returns remaining; disables input + shows banner at 0 left
SECTION 11. Finalise — finaliseScript(): show typing, callChatLLM({ jsonMode: true, maxTokens: 1200 }) with finalise prompt; parse JSON; one cleanup retry on parse failure; populate #bs-final; switch screens
SECTION 12. Final screen — renderFinalScript(scriptObj): build structured DOM in #bs-final-card; wire Edit/Regenerate/Copy
SECTION 13. Handoff — sendToPipeline(target): downloadScript(finalScript, target) FIRST as a safety net; then set window.__storiHandoff = { target, plainText, fileName }; navigateTo target page
SECTION 14. Helpers — formatScriptToPlainText(), copyToClipboard(), downloadScript(scriptObj, target) → builds Markdown body via renderScriptMarkdown() (structured top half: title + metadata + Hook/Scenes/CTA blocks with **Visual:** / **Voice:** labels; paste-ready bottom block: 📋 Voiceover script), triggers Blob download (text/markdown) with slugged filename storypilot-{target}-{slug}-{YYYY-MM-DD}.md; manual ⬇ Download button on Final screen calls the same helper
```

### 9.2 `js/26b-llm-router.js` — provider router

```
SECTION 1.  Public API — callChatLLM({ provider, messages, systemPrompt, jsonMode, maxTokens })
SECTION 2.  Provider implementations — _callGemini, _callOpenAI, _callAnthropic
SECTION 3.  Response normalisers — _normaliseGemini, _normaliseOpenAI, _normaliseAnthropic
SECTION 4.  Cost integration — call trackTokenCost(inTok, outTok, provider) from each normaliser
SECTION 5.  Error handling — distinguish NO_*_KEY (user-fixable, banner), 429 (retry with backoff, reuse existing pattern), 5xx (show error in chat with retry button)
```

---

## 10. Pipeline Handoff

### 10.0 Architecture decision (final)

**Simple text-input handoff. No fast-path, no scene injection.**

Both Copilot and Autopilot follow the **identical pattern**:
1. Storypilot generates a clean plain-text script.
2. Switch the target page into **Text mode**.
3. Pre-fill the text-input field with the script.
4. Navigate to the page.
5. User clicks **Launch** → the **usual pipeline runs end-to-end** (TTS → transcription → scene extraction → image gen → composite).

We **do not** inject pre-extracted scenes into `reelScenes[]` or skip transcription. The extra Gemini Flash text call (re-extracting scenes from the Storypilot script) is negligible cost (~$0.001) and keeps the architecture simple — one code path for all entry points, no mode-specific bypasses.

**Trade-off:** ~$0.001 extra per session in API cost; in exchange we avoid duplicating pipeline logic, divergent scene formats, and untested code paths. Accepted.

### 10.1 Prerequisite — build Autopilot's Text mode

Autopilot currently has only **Audio** and **Video** input modes (see `index.html` lines ~2570-2573). Storypilot needs a **Text mode** to land into. Build this before the handoff wiring.

**HTML changes (`index.html`, near the input-mode toggle):**

```html
<!-- Existing -->
<button id="reel-mode-audio" class="reel-mode-btn active">🎵 Audio</button>
<button id="reel-mode-video" class="reel-mode-btn">🎬 Video</button>
<!-- ADD -->
<button id="reel-mode-text"  class="reel-mode-btn">📝 Text</button>
```

```html
<!-- New section, mirrors #reel-audio-section / #reel-video-section -->
<div id="reel-text-section" class="reel-input-section hidden">
  <label class="reel-label">Paste your script</label>
  <textarea id="reel-text-input"
            class="reel-text-input"
            placeholder="Paste or type your script here. Stori will narrate and turn it into a reel."
            rows="10"></textarea>
  <div class="reel-text-hint">Tip: Click <b>Brainstorm</b> on the home page if you'd like AI help building a script.</div>
</div>
```

**JS changes (`js/20-reels-creator.js`):**

- Extend the existing input-mode switcher (`switchReelInputMode(mode)`) to handle `'text'` — show `#reel-text-section`, hide audio/video sections, set `reelInputMode = 'text'`.
- In the **Launch** path, when `reelInputMode === 'text'`:
  1. Read `#reel-text-input` value → treat as script.
  2. Call **TTS** (Gemini TTS — same model used elsewhere in app) on the script → get audio buffer.
  3. From this point onward, run the **identical** Audio-mode pipeline: transcription → scene extraction → image gen → composite. No new branches.
- Defensive checks already present (`reelInputMode === 'text'`) become live code paths.

### 10.2 Storypilot → Autopilot handoff

**No server storage. User owns a local file copy.** The handoff is a direct in-memory call: Storypilot writes to a module-scoped variable on `window`, navigates, target page reads it once and clears it. Lives only in tab memory — nothing persisted on Stori's side. **In addition**, a Markdown (`.md`) file of the script is auto-downloaded to the user's device on Send click as a credit-recovery safety net (see 10.5).

```js
// In js/26-brainstorm.js — module-scoped, exposed for cross-module read:
window.__storiHandoff = null;

// Inside Storypilot, on "Send to Autopilot":
const fileName = downloadScript(brainstormState.finalScript, 'autopilot');  // ⬇ silent
window.__storiHandoff = {
  target: 'autopilot',
  plainText: formatScriptToPlainText(brainstormState.finalScript),
  fileName,                                                                  // toast on dest page
};
navigateTo('reel');
```

In `js/20-reels-creator.js`, run on page show:

```js
function checkBrainstormHandoff() {
  const ho = window.__storiHandoff;
  if (!ho || ho.target !== 'autopilot') return;

  switchReelInputMode('text');               // show Text section
  const ta = document.getElementById('reel-text-input');
  if (ta) ta.value = ho.plainText;

  window.__storiHandoff = null;              // one-shot consume
  const tail = ho.fileName ? ` Saved as ${ho.fileName} on your device.` : '';
  setStatus(`Script imported from Storypilot — review and click Launch.${tail}`);
}
```

**That's it.** No `reelScenes[]` mutation. No scene-time injection. No persistence. The user just clicks Launch and the normal text-mode pipeline runs.

### 10.3 Storypilot → Copilot handoff

Copilot **already has Text mode** built — `#create-mode-text` button + `#create-tts-text` textarea (see `index.html` lines 2040-2071). No prerequisite work needed.

```js
// Inside Storypilot, on "Send to Copilot":
const fileName = downloadScript(brainstormState.finalScript, 'copilot');   // ⬇ silent
window.__storiHandoff = {
  target: 'copilot',
  plainText: formatScriptToPlainText(brainstormState.finalScript),
  fileName,
};
navigateTo('create');
```

In `js/17b-create-ui.js` (or wherever the Copilot init lives), run on page show:

```js
function checkBrainstormHandoffCopilot() {
  const ho = window.__storiHandoff;
  if (!ho || ho.target !== 'copilot') return;

  // Click the Text mode button to activate it (reuses existing logic)
  const textBtn = document.getElementById('create-mode-text');
  if (textBtn) textBtn.click();
  const ta = document.getElementById('create-tts-text');
  if (ta) ta.value = ho.plainText;

  window.__storiHandoff = null;              // one-shot consume
  const tail = ho.fileName ? ` Saved as ${ho.fileName} on your device.` : '';
  setStatus(`Script imported from Storypilot — review and click Generate.${tail}`);
}
```

**Trade-off accepted:** if the user opens Autopilot in a new tab instead of clicking the in-app button, the handoff is lost. That's fine — the script can be copied to clipboard via the Copy button on the Final screen as a manual fallback.

### 10.4 Plain-text formatter

The script is delivered as **clean readable text** — no JSON, no time-codes, no markup that would confuse downstream TTS. It must read like a finished VO script.

```js
function formatScriptToPlainText(s) {
  if (!s) return '';

  // Autopilot-shaped (short reel)
  if (s.hook !== undefined) {
    const lines = [];
    if (s.hook) lines.push(s.hook);
    if (Array.isArray(s.scenes)) s.scenes.forEach(sc => { if (sc.voice) lines.push(sc.voice); });
    if (s.cta) lines.push(s.cta);
    return lines.join(' ');                  // single flowing paragraph for TTS
  }

  // Copilot-shaped (long-form)
  const lines = [];
  if (Array.isArray(s.scenes)) s.scenes.forEach(sc => { if (sc.narration) lines.push(sc.narration); });
  return lines.join('\n\n');                 // paragraph per scene
}
```

**Why no time-codes / scene markers in the output:** the downstream pipeline re-derives scenes from transcription timing, not from any structure we pass. Markers would just become spoken artefacts (TTS would read out "zero seconds to three seconds"). Pure prose only.

### 10.5 Script download — credit-recovery safety net

The user pays $0.10–$0.50 for a finalised script. They must always be able to recover what they paid for, even if their pipeline credits run out, the tab dies, or they want to come back next week. The mechanism: **a Markdown file (`.md`) downloaded to their device** — readable in any text editor, structured for skimming, with a copy-paste-ready voiceover block at the bottom.

**Two trigger points, one helper:**

| Trigger | Purpose |
|---|---|
| Auto on **Send to Autopilot / Copilot** click | Belt-and-braces. User always walks away with a file. |
| Manual via **⬇ Download** button on the Final screen | Explicit safety grab before deciding to Send. |

**File format — Markdown (`.md`):**

```md
# {Script title}

**Tone:** {tone} · **Platform:** {platform} · **Duration:** {estDuration}

---

## Hook (0–3s)
**Visual:** {hook visual}
**Voice:** {hook voice}

## Scene 1 (3–8s)
**Visual:** {scene 1 visual}
**Voice:** {scene 1 voice}

…

## Call to Action
**Voice:** {cta}

---

## 📋 Voiceover script (copy this to use in Stori)

{plainText — the pre-concatenated VO from formatScriptToPlainText()}

---

*Created with Storypilot · {Quick|Pro|Premium} · {YYYY-MM-DD}*
```

For Copilot (long-form), substitute scene blocks with `**Visual:** / **Narration:** / **Mood:**` and the section labels (`Intro / Body / Outro`). Same overall layout.

**Why two-part layout (structured top + paste-ready bottom):** the top half preserves what the user paid for — the *brainstorm output*, with hook ideas, scene visuals, mood/CTA all callable out separately. The bottom block is the pure spoken VO they can copy in one motion to feed the pipeline without splicing individual lines.

**Why `.md` and not `.json` or `.txt`:**
- `.md` renders structured (headings, bold) in any modern editor — VS Code, GitHub, Notion, Obsidian, iA Writer.
- Still readable as plain text in Notepad / TextEdit (asterisks just look like asterisks).
- One file, one paradigm — open and read. No JSON parsing, no syntax in the user's face.
- v2 "import" reads the file's `📋 Voiceover script` block as plain text and dumps it into the Text input — that's the only structured affordance the file needs.

**Helper:**

```js
function downloadScript(scriptObj, target) {
  const ts = new Date().toISOString().slice(0, 10);              // 2026-04-26
  const slug = (scriptObj?.title || 'script')
                 .toLowerCase()
                 .replace(/[^a-z0-9]+/g, '-')
                 .replace(/^-+|-+$/g, '')
                 .slice(0, 40) || 'script';
  const fileName = `storypilot-${target}-${slug}-${ts}.md`;

  const md = renderScriptMarkdown(scriptObj, target);             // builds the .md body
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}

function renderScriptMarkdown(s, target) {
  const PROVIDER_LABEL = { gemini: 'Quick', openai: 'Pro', anthropic: 'Premium' };
  const tier = PROVIDER_LABEL[brainstormState.provider] || 'Quick';
  const date = new Date().toISOString().slice(0, 10);
  const out = [];

  out.push(`# ${s.title || 'Untitled script'}`, '');

  // Header line — only include fields that exist
  const meta = [];
  if (s.tone)        meta.push(`**Tone:** ${s.tone}`);
  if (s.platform)    meta.push(`**Platform:** ${s.platform}`);
  if (s.estDuration) meta.push(`**Duration:** ${s.estDuration}`);
  if (meta.length) out.push(meta.join(' · '), '');

  out.push('---', '');

  // Autopilot-shaped
  if (s.hook !== undefined) {
    out.push('## Hook (0–3s)', `**Voice:** ${s.hook}`, '');
    (s.scenes || []).forEach((sc, i) => {
      out.push(`## Scene ${sc.n || i + 1}${sc.timeRange ? ` (${sc.timeRange})` : ''}`);
      if (sc.visual) out.push(`**Visual:** ${sc.visual}`);
      if (sc.voice)  out.push(`**Voice:** ${sc.voice}`);
      out.push('');
    });
    if (s.cta) out.push('## Call to Action', `**Voice:** ${s.cta}`, '');
  } else {
    // Copilot-shaped
    if (s.concept)   out.push('## Concept', s.concept, '');
    if (s.audience)  out.push(`**Audience:** ${s.audience}`, '');
    if (s.musicTone) out.push(`**Music tone:** ${s.musicTone}`, '');
    (s.scenes || []).forEach((sc, i) => {
      const sect = sc.section ? ` — ${sc.section}` : '';
      out.push(`## Scene ${sc.n || i + 1}${sect}${sc.timeRange ? ` (${sc.timeRange})` : ''}`);
      if (sc.visual)    out.push(`**Visual:** ${sc.visual}`);
      if (sc.narration) out.push(`**Narration:** ${sc.narration}`);
      if (sc.mood)      out.push(`**Mood:** ${sc.mood}`);
      out.push('');
    });
  }

  out.push('---', '');
  out.push('## 📋 Voiceover script (copy this to use in Stori)', '');
  out.push(formatScriptToPlainText(s), '');
  out.push('---', '');
  out.push(`*Created with Storypilot · ${tier} · ${date}*`);

  return out.join('\n');
}
```

**Failure-mode coverage:**

| Failure mode | Outcome |
|---|---|
| Tab refreshes after Finalise, before Send | User has the file (if they hit ⬇) or can re-Finalise. *Mitigation:* show a one-time hint after Finalise: *"Tip: download the script before you leave — it's not saved automatically."* |
| Tab dies after Send click → before Launch | File is on disk. User opens, copies the **📋 Voiceover script** block, pastes into Text mode next session. |
| User has no Autopilot/Copilot credit | Same — file is on disk. Topup later, paste back, no re-brainstorm. |
| User wants to share with a collaborator | File is on disk. Email it. Renders prettily in any markdown viewer. |

**Why not localStorage / server-side**: localStorage violates the no-persistence policy and is brittle (cleared by browser, hits 5MB caps, lost across devices). Server-side requires a backend Stori doesn't have. A downloaded file is durable, portable, and user-owned — the right artifact for a paid deliverable.

---

## 11. Limits & Guardrails

| Guard | Value | Behaviour at limit |
|---|---|---|
| Messages per session | **15** user-AI exchanges | Input box disabled, banner: *"Session limit reached. Finalise your script or start a new session."* |
| Min exchanges before Finalise | 3 | Finalise button disabled until 3 user replies have been sent. Hint: *"Finalise enabled after 3+ exchanges"*. |
| Finalise nudge | After exchange 12 | System prompt instructs the AI to gently suggest finalising around message 12, easing the user toward the cap. |
| Per-reply token cap | 300 tokens | Hard cap via `max_tokens: 300` (or `maxOutputTokens: 300` for Gemini) on every chat call. Brevity also enforced in system prompt. |
| Per-user-message char limit | 2000 chars | Browser-enforced via `maxlength` attribute. |
| Context-window safety | Stop at ~60,000 input tokens | Backstop only — the 15-msg cap effectively governs context size. If `totalInputTokens > 60000`, force-finalise with toast: *"Approaching context limit — finalising now"*. |
| Provider lock | After first `sendMessage()` | `state.providerLocked = true`; UI hides non-selected pills; click handler early-returns. Only `resetSession()` clears the lock. |
| Provider key missing | — | Show inline banner: *"Set your {OpenAI / Anthropic} key in Settings to use the Pro / Premium tier."* with a deeplink. Send button disabled until key set or tier changed (only if not yet locked). |
| API call fails | — | Inline error message with retry button. Conversation stays in-memory; not lost mid-session. |
| Rate limit (429) | — | Existing `callGeminiAPI` retries with backoff; OpenAI/Anthropic branches do the same. Show "Slow down — retrying..." in the typing indicator. |
| Network offline | — | Disable Send, show "Offline" banner. |
| Tab refresh / close | — | Session is **restored** on reload if ≤ 24 hours old (`loadSession()` in IIFE). If session has expired, it is discarded silently and the selector is shown. `beforeunload` warning removed — refresh is now safe. |

---

## 12. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| User refreshes mid-chat | Session is **restored** automatically (≤ 24 h TTL). Chat log re-renders, provider lock state preserved, message counter restored. No data loss. |
| User refreshes after Finalise, before Send | Final script is also restored (it's in `brainstormState.finalScript` which is persisted). User lands back on the Final screen as they left it. |
| User clicks Send → tab/network dies before Launch | **Auto-download already fired** on Send click — `.md` file is on disk. User opens the file, copies the **📋 Voiceover script** block into the pipeline's text input next session. (v2 will accept the `.md` directly.) |
| User runs out of pipeline credits after Send | Same as above — the `.md` file is the user-owned record of what they paid for. They can topup later, paste back, no re-brainstorm. |
| User opens a second tab | Each tab has its own in-memory state — fully isolated. No cross-tab interference. |
| User picks a mode then clicks back | Resets state to selector view. Confirm with modal: *"Discard this conversation?"* if any messages exist. |
| User navigates to another Stori page mid-chat | Same `beforeunload`-style warning before leaving the brainstorm. |
| Rate limit (429) | Existing retry-with-backoff (Gemini path); OpenAI/Anthropic branches do the same. Show "Slow down — retrying..." in typing indicator. |
| Bad JSON on finalise | One automatic cleanup retry: re-asks the model with *"Output the script as JSON only, no markdown, no preamble."*. After retry, show structured error and let user click Regenerate. |
| Very long user message | Truncate at 2000 chars with hint. |
| User clicks Send with empty input | Send button stays disabled while input empty. |
| User pastes script wholesale | Allow it — AI will ask refinement questions. |
| Browser blocks the auto-download | Rare in same-origin Blob downloads; if it happens, the manual ⬇ Download button on the Final screen is the user's recourse. Toast on Send: *"If your browser blocked the download, click ⬇ Download to save the script."* |
| User uses crude language | Provider safety filters may refuse. Show graceful error and let user rephrase. |

---

## 13. Cost & Session Tracking

Cost tracking is **in-memory only**, scoped to the current tab session. Reuses the existing `sessionCost` variable in `01-core.js` and the running cost display already shown across the app.

```js
// Inside each provider's _normalise* function (in 26b-llm-router.js):
brainstormState.totalInputTokens  += inTok;
brainstormState.totalOutputTokens += outTok;

// trackTokenCost() picks the right pricing row from TOKEN_PRICING by provider key.
trackTokenCost(inTok, outTok, provider);   // provider ∈ 'gemini' | 'openai' | 'anthropic'
```

**No persisted history.** No usage log, no per-session record kept across reloads. The cost widget shows live token spend for the active session only.

**The downloaded Markdown file IS the user-owned artifact for a paid session.** A user who paid $0.50 for a Premium brainstorm walks away with a `storypilot-{target}-{slug}-{date}.md` file on their device — durable proof of what they got for that money, portable across devices, re-importable later (v2). This is the moral substitute for a server-side history record: Stori doesn't keep one, but the user always has one. See Section 10.5 for the download mechanism.

**Billing — when it lands:** moves to the **server**, not the browser. The client will report `(messageCount, mode, provider, finalised)` to a billing endpoint at the moment of finalise (or at the moment of "Send to pipeline"). The server is the source of truth for charging. Until that endpoint exists, sessions are not actually billed — the displayed prices ($0.10 / $0.30 / $0.50) are user-visible expectations for transparency, not enforced by the client.

**Per-provider charge mapping (server-side spec, for when billing lands):**

```
provider === 'gemini'    → $0.10
provider === 'openai'    → $0.30
provider === 'anthropic' → $0.50
```

Charge is determined by the **locked provider** at finalise time, not by which messages used which model (since the lock makes that a non-issue).

---

## 14. Aurora Design Compliance Checklist

- [x] Background uses `::before` aurora gradient (matches `#reel-page`, `#create-page`).
- [x] All cards use `color-mix(in oklch, var(--lp-bg2) 85%, var(--lp-accent) 3%)` cyan tint.
- [x] All borders use `var(--lp-card-bdr)` / `var(--lp-card-bdr-h)` on hover.
- [x] All text colours use `var(--lp-text)`, `var(--lp-dim)`, `var(--lp-mute)`.
- [x] Accent colour `var(--lp-accent)` used for emphasis and primary actions.
- [x] Font: inherits Poppins via `var(--lp-font-ui)`.
- [x] Border radius: 12–16px to match other cards.
- [x] Box shadows on hover use `color-mix(in oklch, var(--lp-accent) 20%, transparent)`.
- [x] Light mode works automatically via `html[data-theme="light"]` token overrides — no extra rules needed.
- [x] Dropdown arrows: not applicable (no `<select>` elements in Storypilot — model picker uses pill buttons, not a select).
- [x] Model picker uses pill-style segmented control with `--lp-accent` for active tier — matches existing toggle patterns in Autopilot/Photopilot.
- [x] Locked-state visual: lock icon + reduced affordance (cursor: not-allowed, opacity: 0.55 on non-active pills, hidden non-selected pills).

---

## 15. Implementation Order (Build Sequence)

**Phase 1 — Skeleton (1 sitting)**
1. Add `#brainstorm-page` HTML section (selector + chat + final stubs).
2. Add nav button + homepage card.
3. Wire `navigateTo('storypilot')` — add to core, popstate, page show/hide logic.
4. Add base CSS — aurora background, screens, hidden states.
5. Verify navigation works, selector cards visible, can switch to chat screen.

**Phase 2 — Provider router (1 sitting)**
6. Create `js/26b-llm-router.js`. Implement Gemini branch first (reuse `callGeminiAPI`).
7. Add `TOKEN_PRICING` provider table + `trackTokenCost(in, out, provider)` in `01-core.js`.
8. Verify a hand-crafted Gemini call returns canonical `{ text, inputTokens, outputTokens, costUsd }`.

**Phase 3 — Chat (1 sitting)**
9. Build chat UI — bubbles, input, sticky bar, typing indicator.
10. Implement `sendMessage()` calling `callChatLLM({ provider: 'gemini', ... })`.
11. System prompts wired in (with brevity rules + finalise nudge).
12. Token counting + cost display via the router.
13. `saveSession()` after every reply; `loadSession()` in IIFE; "New session" ↻ button calls `clearSession()`.
14. Test 5-message conversation end-to-end in both modes on Gemini. Refresh mid-chat → session restores. Wait-simulate TTL expiry (set `savedAt` to 25 h ago in DevTools console) → refresh → clean slate.

**Phase 4 — Model picker + provider lock (~½ sitting)**
15. Add model-picker pills to chat header.
16. Wire `selectProvider()` — disabled when locked, validates API key for selected tier.
17. On first `sendMessage()`, set `state.providerLocked = true` and re-render picker as locked.
18. Verify: picking a tier, sending a message, attempting to switch tiers → all blocked correctly.
19. Add OpenAI + Anthropic API key fields to Settings, plumb to localStorage.

**Phase 5 — Add OpenAI + Anthropic branches to router (1 sitting)**
20. Implement `_callOpenAI` + `_normaliseOpenAI`. Test via picker → Pro tier → 3-msg conversation.
21. Implement `_callAnthropic` + `_normaliseAnthropic`. Test via picker → Premium tier → 3-msg conversation.
22. Confirm cost widget shows correct per-tier costs in real time.
23. Confirm error banner appears when missing key for selected tier.

**Phase 6 — Finalise + Download (1 sitting)**
24. Finalise button enable/disable logic (3+ exchanges).
25. Finalise API call with `jsonMode: true`, `maxTokens: 1200`, JSON-cleanup retry on parse failure.
26. Final script renderer (structured DOM for both Autopilot and Copilot shapes).
27. Edit / Regenerate / Copy / **⬇ Download** buttons.
28. Implement `downloadScript(scriptObj, target)` helper (Section 10.5).
29. One-time hint banner on Final screen: *"Tip: download the script before you leave — it's not saved automatically."*

**Phase 7a — Build Autopilot Text mode (prerequisite, ~1 sitting)**
28. Add `#reel-mode-text` button to Autopilot's input-mode toggle.
29. Add `#reel-text-section` with `#reel-text-input` textarea.
30. Extend `switchReelInputMode()` to handle `'text'`.
31. Wire Launch path for text → run TTS on the script → feed buffer into the existing Audio-mode pipeline.
32. Test Text-mode Launch independently (without Storypilot) — paste a script, click Launch, verify a reel renders.

**Phase 7b — Storypilot handoff wiring (~½ sitting)**
33. Storypilot fires `downloadScript(...)` on Send click (auto-download safety net).
34. Storypilot sets `window.__storiHandoff = { target, plainText, fileName }` immediately after.
35. Autopilot reads handoff on page show → switches to Text mode → pre-fills `#reel-text-input` → toast includes the saved filename.
36. Copilot reads handoff on page show → clicks `#create-mode-text` → pre-fills `#create-tts-text` → toast includes the saved filename.
37. Test full flow on each tier: brainstorm → finalise → send to Autopilot → click Launch → reel renders. Verify a `.md` file appeared in Downloads.
38. Test full flow: brainstorm → finalise → send to Copilot → click Generate → video renders. Verify `.md` file.
39. Cold-start test: open downloaded `.md` in a fresh session → copy the **📋 Voiceover script** block → paste into Autopilot's Text input → Launch → reel renders. Confirms the credit-recovery loop.

**Phase 8 — Polish & ship**
38. Mobile testing — model picker reflows below header on narrow viewports.
39. Light mode verification (all three pills, locked state).
40. Error states + edge cases (refresh, quota, rate limit, missing keys).
41. Build (`node build.js`), commit.

---

## 16. Verification Checklist (after build)

- [ ] Homepage shows "Brainstorm" card / button.
- [ ] Click → loads Storypilot page → shows wizard (Q1 only visible initially).
- [ ] Pick Q1 answer → chip highlights as selected, Q2 fades in.
- [ ] Pick Q2 answer → recommendation card fades in with correct pipeline, icon, and reason.
- [ ] Verify all 6 Q1×Q2 combinations produce the right recommendation (short→Autopilot; long→Copilot; social+medium→Autopilot; tutorial+medium→Copilot; brand+medium→Copilot; personal+medium→Autopilot).
- [ ] "Switch to X instead" button overrides recommendation correctly.
- [ ] Confirm → chat opens, AI greeting does NOT re-ask type/length, header tag shows correct pipeline.
- [ ] **Send-to button (Final screen) matches wizard choice** — "Send to Autopilot ⚡" or "Send to Copilot 🎬" set correctly from `confirmWizard(mode)`, no ambiguity.
- [ ] Default tier on chat open is **Quick (Gemini)**; pill is highlighted.
- [ ] Pick **Pro** tier with no OpenAI key → inline banner appears, Send disabled.
- [ ] Pick **Premium** tier with no Anthropic key → inline banner appears, Send disabled.
- [ ] Add OpenAI key → Pro tier becomes selectable; Send enables.
- [ ] Type message → user bubble appears immediately, typing indicator shows, AI reply appears.
- [ ] **Provider lock**: after first send, model picker shows only the locked tier + 🔒 icon. Other tiers hidden.
- [ ] Click 🔒 / locked-tier area → no state change; tooltip explains: *"Model is locked for this session."*
- [ ] Click ↻ "New session" → state resets, picker unlocks, all three pills visible again.
- [ ] Run a 3-msg conversation on each tier (Gemini, GPT-4o, Sonnet 4) → all return valid replies; cost widget reflects per-tier pricing.
- [ ] Message counter increments correctly (e.g. `7/15`).
- [ ] Cost tag updates with each call; matches network-panel usage × `TOKEN_PRICING[provider]`.
- [ ] AI gently prompts to finalise around message 12.
- [ ] At 15 messages, input disables; banner shown.
- [ ] Finalise button enabled after 3 exchanges.
- [ ] Finalise produces structured script — JSON parses, all fields render. JSON-cleanup retry triggers if first response is malformed.
- [ ] Autopilot Text mode (built as prerequisite) — paste script, click Launch, reel renders end-to-end via TTS path.
- [ ] Send to Autopilot → reel page opens in Text mode → `#reel-text-input` pre-filled → click Launch → full pipeline runs.
- [ ] Send to Copilot → create page opens in Text mode → `#create-tts-text` pre-filled → click Generate → full pipeline runs.
- [ ] **Auto-download fires on Send click**: a `.md` file lands on disk with name `storypilot-{target}-{slug}-{YYYY-MM-DD}.md`. File contains: `# {title}` heading, metadata line (Tone · Platform · Duration), Hook / Scene N / Call to Action sections with `**Visual:**` and `**Voice:**` (or `**Narration:**` / `**Mood:**` for Copilot) labels, a `## 📋 Voiceover script (copy this to use in Stori)` block, and a `*Created with Storypilot · {tier} · {date}*` footer.
- [ ] **⬇ Download button on Final screen** triggers the same download manually.
- [ ] Refresh after Finalise without downloading → script lost; re-Finalise required. (Confirms the safety net is the file, not memory.)
- [ ] Open the downloaded `.md` in a text editor — renders structured (headings, bold) in VS Code / GitHub / Notion / Obsidian; readable as plain text in Notepad / TextEdit.
- [ ] Copy the **📋 Voiceover script** block from the `.md`, paste into Autopilot/Copilot Text input on a fresh session → pipeline runs successfully.
- [ ] Refresh mid-chat → session restores automatically; chat log, provider lock, message counter all correct.
- [ ] Refresh after Finalise → lands back on the Final screen with script intact.
- [ ] Click ↻ "New session" → `stori_bs_session` removed from localStorage; picker unlocks; selector shown.
- [ ] Simulate TTL expiry: in DevTools console set `JSON.parse(localStorage.stori_bs_session).savedAt` to a value 25 h in the past, then re-save and refresh → session discarded silently, selector shown.
- [ ] Confirm `stori_bs_session` is the only new localStorage key written (API keys `stori_api_key` / `stori_openai_key` / `stori_anthropic_key` are pre-existing and unaffected).
- [ ] Light mode → all elements have correct contrast, including locked-state lock icon.
- [ ] Mobile → chat scrolls, input is reachable, cards stack, model picker reflows below the header.
- [ ] Running `sessionCost` in the cost widget matches actual token-based API spend per provider (sanity check by summing usage from network panel × pricing table).
- [ ] No console errors.
- [ ] No regressions on Copilot/Autopilot/Photopilot.

---

## 17. Open Questions (to confirm before / during build)

1. ~~**Autopilot text-input field ID**~~ — **Resolved.** Autopilot has no Text mode today; we are building it as a prerequisite (Section 10.1). New IDs: `#reel-mode-text`, `#reel-text-section`, `#reel-text-input`.
2. ~~**Copilot script destination**~~ — **Resolved.** Copilot already has Text mode: `#create-mode-text` button + `#create-tts-text` textarea. Pre-fill that.
3. ~~**Pricing**~~ — **Resolved.** Three-tier flat: $0.10 (Gemini Flash, 1X) / $0.30 (GPT-4o, 3X) / $0.50 (Sonnet 4, 5X). Same prices for both Autopilot and Copilot pipelines. Provider locks after first message.
4. **Suggestion chips** — what 3–4 example topics per mode? (Suggested: Autopilot → "Skincare routine", "Travel vlog", "Productivity tips"; Copilot → "Brand story", "Product explainer", "Tutorial".)
5. **Session history UI** — do we surface past brainstorm sessions to the user (resume / view history), or keep that internal for billing only? *Resolved by no-persistence policy → no history UI.*
6. **Autopilot Text mode TTS** — confirm which Gemini TTS model/voice the existing pipeline uses for text→audio, so the new Text mode reuses it (no new TTS code path).
7. **Anthropic browser-side calls** — confirm the `anthropic-dangerous-direct-browser-access: true` header still works (Anthropic has historically discouraged direct-from-browser calls). If it changes, we'd need a tiny proxy. Test before committing to Premium tier.
8. **Exact Sonnet 4 model ID** — verify `claude-sonnet-4-20250514` (or whatever is current at build time) against the Anthropic dashboard. Ditto `gpt-4o` for OpenAI — pin to a stable variant rather than a moving alias if possible.
9. **Tier nicknames** — "Quick / Pro / Premium" feels generic. Consider product-flavoured naming: "Spark / Studio / Director" or "Draft / Polish / Pro". Not blocking; can ship with current and rename later.
10. **v2 — `.md` import on Text mode** *(future work, post-v1)*. Add a small *"⬆ Load .md"* button next to Autopilot's `#reel-text-section` and Copilot's `#create-tts-text`. Drop a Storypilot-downloaded `.md` file → parser locates the `## 📋 Voiceover script (copy this to use in Stori)` heading and extracts the block of text immediately below it (everything up to the next `---` or end of file) → fills the textarea → user clicks Launch / Generate. Closes the loop: a paid brainstorm becomes a portable, re-runnable artifact across sessions and devices. Parsing logic is a ~10-line regex/scan; ~1 hr total to build with file picker and toast.

---

## 18. Estimated Effort

- HTML/CSS for `#brainstorm-page` (selector + chat + final + model picker + locked state): ~4 hrs
- JS module `26-brainstorm.js` (UI/state/lifecycle/finalise + localStorage TTL save/restore): ~5.5 hrs
- JS module `26b-llm-router.js` (three providers + normalisers + cost): ~3 hrs
- Settings UI — new OpenAI + Anthropic key fields: ~1 hr
- Script download + manual button + one-time hint: ~1 hr
- **Autopilot Text mode (prerequisite — Section 10.1):** ~3 hrs
- Pipeline handoff wiring (both targets, with auto-download trigger): ~2 hrs
- Cross-provider testing (3 tiers × 2 pipelines = 6 happy paths + lock + key-missing + download recovery): ~2 hrs
- Edge cases / polish: ~2 hrs
- Testing on dark + light + mobile: ~1 hr

**Total: ~24 hrs / ~3 working days for a clean v1.**

---

End of plan.
