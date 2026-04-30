/* ════════════════════════════════════════════════════════════════
   26-brainstorm.js — Storypilot UI / state / lifecycle
   -----------------------------------------------------------------
   Loaded as part of the lazy editor bundle.
   Depends on: 01-core.js (navigateTo, $, setStatus, trackTokenCost)
               26b-llm-router.js (callChatLLM, friendlyRouterError)
   ════════════════════════════════════════════════════════════════ */

(function() {
'use strict';

// ── SECTION 1: Constants ──────────────────────────────────────────────────────

const MAX_MESSAGES = 15;
const FINALISE_MIN_EXCHANGES = 3;
const AUTO_FINALISE_AT = 12;      // auto-generate script after this exchange; present inline as next AI message
const CHAT_MAX_TOKENS = 8192;     // must cover thinking tokens + reply — gemini-2.5-flash thinking counts against this
const FINALISE_MAX_TOKENS = 8192; // same for finalise JSON output

const SYSTEM_PROMPTS = {
  autopilot: `You are an expert short-form video script coach for Stori, specialising in TikTok, Instagram Reels and YouTube Shorts. Your role is to help the user brainstorm and refine a 30–90 second video script through conversation.

BEHAVIOUR RULES:
1. NEVER output a full script in your first reply. Begin by asking 2–3 targeted questions: topic, target audience, tone (educational, funny, emotional, aesthetic), and platform (TikTok / IG Reel / YT Shorts).
2. Always offer 2–3 hook options for the user to pick from. Hooks are the first 3 seconds — they decide whether the viewer keeps watching.
3. Build the script iteratively, scene by scene. Get user approval before moving to the next scene.
4. BREVITY IS NON-NEGOTIABLE. Every reply must stay under 150 words. Use bullet points, not paragraphs. Never re-explain prior context. Bold the key choice or question. Get to the point fast.
5. Suggest scene visuals and voiceover/caption text together — both matter for short-form video.
6. End with a clear CTA suggestion: save, share, follow, comment, or visit link.
7. If the user goes off-track, gently steer the conversation back to script development.
8. Match the user's energy and tone. Be a creative partner, not a corporate assistant.
9. Around message 12 of 15, gently nudge: "We've covered a lot — ready to finalise the script, or want to keep refining a specific part?"
10. If the user EXPLICITLY asks for a full/final script at any point ("give me the script", "write the full script", "finalise", etc.), deliver it immediately in the finalised JSON format — do not continue the wizard flow.

SCOPE LIMITS:
- Don't write full scripts on demand UNLESS the user explicitly asks for one.
- Don't suggest more than 9 scenes total (Autopilot's grid layout).
- Don't include advanced production directions (camera moves, lighting setups, transitions). Focus on visual concept + spoken/displayed words.`,

  copilot: `You are an expert long-form video storytelling coach for Stori, specialising in explainers, documentaries, brand films, educational videos, and narrative content. Your role is to help the user brainstorm and develop a video script through conversation.

BEHAVIOUR RULES:
1. NEVER output a full script in your first reply. Begin by understanding: topic, target audience, intended length (1–10 minutes), purpose (inform / sell / inspire / entertain), and the single key message they want viewers to walk away with.
2. Help the user choose a narrative structure — 3-act, problem-solution, listicle, before-after, journey/transformation. Suggest 1–2 options that fit their topic.
3. Develop the script in sections (intro / body / outro), getting user approval before each section is fully written.
4. Each scene should include: visual description, narration/dialogue, and tone/mood notes. Be more detailed than for short-form.
5. Suggest pacing — how long each section should be, where to slow down for impact, where to keep momentum.
6. Recommend music tone and any voice-acting direction (warm, urgent, measured, conversational).
7. Match the user's energy and tone. Be a creative partner, not a corporate assistant.
8. BREVITY IS NON-NEGOTIABLE. Every reply must stay under 150 words. Use bullet points, not paragraphs. Never re-explain prior context. Bold the key choice or question. Develop ONE section at a time.
9. Around message 12 of 15, gently nudge: "We've outlined a strong shape — ready to finalise, or is there a section you want to refine first?"
10. If the user EXPLICITLY asks for a full/final script at any point, deliver it immediately — do not continue the wizard flow.

SCOPE LIMITS:
- Don't write full scripts on demand UNLESS the user explicitly asks for one.
- Don't include advanced production directions beyond visual + narration + tone. Stori's pipeline handles the rest.`
};

const FINALISE_PROMPTS = {
  autopilot: `The user has clicked "Finalise Script". Based on our conversation above, generate the final structured script in this exact JSON format. Output ONLY the JSON, no preamble or explanation.

{
  "title": "...",
  "tone": "...",
  "platform": "...",
  "estDuration": "30s|45s|60s|...",
  "hook": "Opening line said in first 3 seconds",
  "scenes": [
    { "n": 1, "timeRange": "0-3s",  "visual": "...", "voice": "..." },
    { "n": 2, "timeRange": "3-8s",  "visual": "...", "voice": "..." }
  ],
  "cta": "Final call to action"
}

RULES:
- Maximum 9 scenes.
- Total duration must match estDuration.
- Each scene: 3–8 seconds.
- voice = exactly what should be spoken or shown as text on screen.
- visual = a single concrete image that illustrates the scene.
- CRITICAL: hook and Scene 1 voice MUST be different. hook is the attention-grabbing opener (a question, bold statement, or teaser). Scene 1 voice is the first full sentence that follows it. Never repeat the hook word-for-word in Scene 1.`,

  copilot: `The user has clicked "Finalise Script". Based on our conversation above, generate the final structured script in this exact JSON format. Output ONLY the JSON, no preamble or explanation.

{
  "title": "...",
  "concept": "One-paragraph description of the video",
  "audience": "...",
  "tone": "...",
  "musicTone": "...",
  "estDuration": "2:30",
  "scenes": [
    { "n": 1, "section": "intro|body|outro", "timeRange": "0:00-0:15",
      "visual": "...", "narration": "...", "mood": "..." }
  ]
}

RULES:
- Length must match estDuration.
- Cover intro → body → outro structure.
- visual = scene description; narration = spoken voiceover; mood = emotional tone.`
};

// ── SECTION 2: State ──────────────────────────────────────────────────────────

const BS_STORAGE_KEY = 'stori_bs_session';
const BS_TTL_MS      = 24 * 60 * 60 * 1000;  // 24 hours

const brainstormState = {
  mode:           null,       // 'autopilot' | 'copilot' | null
  provider:       'gemini',   // 'gemini' | 'openai' | 'anthropic'
  providerLocked: false,
  startedAt:      null,
  messages:       [],         // [{ role: 'user'|'assistant', content }]
  messageCount:   0,          // user-AI exchange pairs
  totalInputTokens:  0,
  totalOutputTokens: 0,
  finalScript:    null,
  finalised:      false,
  wizardAnswers:   {},         // { type, length }
  sessionSummary:  null,       // set when continuing from a previous session
  willExtend:      false,      // user opted in to continue; triggers auto-extend after message 15
  savedAt:         null,
};

// ── SECTION 3: Init ───────────────────────────────────────────────────────────

function _init() {
  // Wire homepage button
  const homeBtn = document.getElementById('btn-create-storypilot');
  if (homeBtn) {
    homeBtn.addEventListener('click', function() {
      navigateTo('storypilot');
    });
  }

  // Wire wizard chip clicks
  document.querySelectorAll('.bs-wchip').forEach(function(chip) {
    chip.addEventListener('click', function() { _handleWizardChip(chip); });
  });

  // Wire confirm/switch (handlers set dynamically in showRecommendation)
  // Wire model picker
  document.querySelectorAll('.bs-model-opt').forEach(function(btn) {
    btn.addEventListener('click', function() { _selectProvider(btn.dataset.provider); });
  });
  // Add tooltip on locked picker
  var picker = document.getElementById('bs-model-picker');
  if (picker) picker.setAttribute('title', 'Model is locked for this session. Click ↻ to start a new session.');

  // Wire chat input
  var input = document.getElementById('bs-input');
  if (input) {
    input.addEventListener('input', function() {
      var sendBtn = document.getElementById('bs-send-btn');
      if (sendBtn) sendBtn.disabled = !input.value.trim();
      _autoResizeTextarea(input);
    });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.value.trim()) _sendMessage();
      }
    });
  }

  // Wire send button
  var sendBtn = document.getElementById('bs-send-btn');
  if (sendBtn) sendBtn.addEventListener('click', _sendMessage);

  // Wire finalise
  var finaliseBtn = document.getElementById('bs-finalise-btn');
  if (finaliseBtn) finaliseBtn.addEventListener('click', _finaliseScript);

  // Wire back button (chat → wizard)
  var backBtn = document.getElementById('bs-back-btn');
  if (backBtn) backBtn.addEventListener('click', function() {
    if (brainstormState.messages.length > 0) {
      if (!confirm('Discard this conversation and go back to the start?')) return;
    }
    _clearSession();
    _showScreen('bs-selector');
  });

  // Wire final-screen back button
  var finalBackBtn = document.getElementById('bs-final-back-btn');
  if (finalBackBtn) finalBackBtn.addEventListener('click', function() {
    _showScreen('bs-chat');
  });

  // Wire new session button
  var newBtn = document.getElementById('bs-new-btn');
  if (newBtn) newBtn.addEventListener('click', function() {
    if (!confirm('Start a new brainstorm session? Current session will be lost.')) return;
    _clearSession();
    _resetWizard();
    _showScreen('bs-selector');
  });

  // Wire final screen buttons
  var copyBtn = document.getElementById('bs-copy-btn');
  if (copyBtn) copyBtn.addEventListener('click', function() {
    _copyToClipboard(_formatScriptToPlainText(brainstormState.finalScript));
    copyBtn.textContent = '✓ Copied!';
    setTimeout(function() { copyBtn.textContent = '📋 Copy'; }, 2000);
  });

  var downloadBtn = document.getElementById('bs-download-btn');
  if (downloadBtn) downloadBtn.addEventListener('click', function() {
    _downloadScript(brainstormState.finalScript, brainstormState.mode);
  });

  var editBtn = document.getElementById('bs-edit-btn');
  if (editBtn) editBtn.addEventListener('click', function() {
    // Switch back to chat for further refinement — re-enable input regardless of message count
    var bsInput   = document.getElementById('bs-input');
    var bsSendBtn = document.getElementById('bs-send-btn');
    if (bsInput)   bsInput.disabled   = false;
    if (bsSendBtn) bsSendBtn.disabled = !bsInput?.value.trim();
    _showScreen('bs-chat');
  });

  var newSessionBtn = document.getElementById('bs-new-session-btn');
  if (newSessionBtn) newSessionBtn.addEventListener('click', function() {
    if (!confirm('Start a new session? This will clear the current conversation.')) return;
    _clearSession();
    _showScreen('bs-selector');
  });

  var regenBtn = document.getElementById('bs-regen-btn');
  if (regenBtn) regenBtn.addEventListener('click', function() {
    _finaliseScript();
  });

  var copyClipBtn = document.getElementById('bs-copy-clipboard-btn');
  if (copyClipBtn) copyClipBtn.addEventListener('click', function() {
    _copyToClipboard(_formatScriptToPlainText(brainstormState.finalScript));
    copyClipBtn.querySelector('.bs-handoff-text').textContent = '✓ Copied to clipboard!';
    setTimeout(function() { copyClipBtn.querySelector('.bs-handoff-text').textContent = 'Copy to clipboard'; }, 2000);
  });

  // Wire Send-to pipeline button (set by confirmWizard)
  var pipelineBtn = document.getElementById('bs-send-pipeline-btn');
  if (pipelineBtn) pipelineBtn.addEventListener('click', function() {
    _sendToPipeline(brainstormState.mode);
  });

  // Wire suggestion chips
  document.querySelectorAll('.bs-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      var input = document.getElementById('bs-input');
      if (input) {
        input.value = chip.dataset.text || chip.textContent;
        input.dispatchEvent(new Event('input'));
        input.focus();
      }
    });
  });

  // Restore session if available
  if (_loadSession()) {
    _restoreFromSession();
  }
}

// ── SECTION 4: Wizard ─────────────────────────────────────────────────────────

function _handleWizardChip(chip) {
  var q = chip.dataset.q;
  var v = chip.dataset.v;

  // Mark selected chip within the same group
  chip.closest('.bs-wizard-chips').querySelectorAll('.bs-wchip').forEach(function(c) {
    c.classList.remove('selected');
  });
  chip.classList.add('selected');

  brainstormState.wizardAnswers[q] = v;

  if (q === 'type') {
    // Reveal Q2 with fade-in
    var q2 = document.getElementById('bs-wizard-q2');
    if (q2) { q2.classList.remove('hidden'); q2.style.animation = 'none'; q2.offsetHeight; q2.style.animation = ''; }
  } else if (q === 'length') {
    // Both answered → show recommendation
    _showRecommendation();
  }
}

function _showRecommendation() {
  var type   = brainstormState.wizardAnswers.type;
  var length = brainstormState.wizardAnswers.length;
  var rec    = _recommendPipeline(type, length);

  var icon     = rec.mode === 'autopilot' ? '⚡' : '🎬';
  var label    = rec.mode === 'autopilot' ? '⚡ Short Reel — Autopilot' : '🎬 Long Video — Copilot';
  var switchLbl  = rec.mode === 'autopilot' ? 'Switch to Copilot instead' : 'Switch to Autopilot instead';
  var switchMode = rec.mode === 'autopilot' ? 'copilot' : 'autopilot';

  var recIcon     = document.getElementById('bs-rec-icon');
  var recPipeline = document.getElementById('bs-rec-pipeline');
  var recReason   = document.getElementById('bs-rec-reason');
  var switchBtn   = document.getElementById('bs-wizard-switch');
  var confirmBtn  = document.getElementById('bs-wizard-confirm');

  if (recIcon)     recIcon.textContent     = icon;
  if (recPipeline) recPipeline.textContent = label;
  if (recReason)   recReason.textContent   = rec.reason;
  if (switchBtn)   switchBtn.textContent   = switchLbl;
  if (switchBtn)   switchBtn.onclick       = function() { _confirmWizard(switchMode); };
  if (confirmBtn)  confirmBtn.onclick      = function() { _confirmWizard(rec.mode); };

  var recStep = document.getElementById('bs-wizard-rec');
  if (recStep) { recStep.classList.remove('hidden'); recStep.style.animation = 'none'; recStep.offsetHeight; recStep.style.animation = ''; }
}

function _recommendPipeline(type, length) {
  if (length === 'short') return { mode: 'autopilot', reason: 'Short & punchy — perfect for a quick reel.' };
  if (length === 'long')  return { mode: 'copilot',   reason: 'In-depth content works best in long-form.' };
  if (type === 'social' || type === 'personal')
                          return { mode: 'autopilot', reason: 'Social clips land best under 90 seconds.' };
  return                         { mode: 'copilot',   reason: 'Tutorials and brand stories need room to breathe.' };
}

function _confirmWizard(mode) {
  brainstormState.mode = mode;
  _updateModeTag(mode);
  _updateSendToButton(mode);
  _showScreen('bs-chat');
  _renderGreeting();
}

function _resetWizard() {
  // Clear chip selections
  document.querySelectorAll('.bs-wchip').forEach(function(c) { c.classList.remove('selected'); });
  // Hide Q2 and rec
  var q2  = document.getElementById('bs-wizard-q2');
  var rec = document.getElementById('bs-wizard-rec');
  if (q2)  q2.classList.add('hidden');
  if (rec) rec.classList.add('hidden');
}

// ── SECTION 5: Model picker ───────────────────────────────────────────────────

function _selectProvider(provider) {
  if (brainstormState.providerLocked) return;  // hard lock

  // Validate API key for non-Gemini tiers
  if (provider === 'openai' && !localStorage.getItem('stori_openai_key')) {
    _showKeyBanner('openai');
    return;
  }
  if (provider === 'anthropic' && !localStorage.getItem('stori_anthropic_key')) {
    _showKeyBanner('anthropic');
    return;
  }
  _hideKeyBanner();

  brainstormState.provider = provider;

  document.querySelectorAll('.bs-model-opt').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.provider === provider);
  });
}

function _lockProvider() {
  brainstormState.providerLocked = true;
  var picker = document.getElementById('bs-model-picker');
  if (picker) picker.setAttribute('data-locked', 'true');
}

function _unlockProvider() {
  brainstormState.providerLocked = false;
  brainstormState.provider = 'gemini';
  var picker = document.getElementById('bs-model-picker');
  if (picker) picker.setAttribute('data-locked', 'false');
  // Reset to Gemini as active
  document.querySelectorAll('.bs-model-opt').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.provider === 'gemini');
  });
}

function _showKeyBanner(provider) {
  var banner = document.getElementById('bs-key-banner');
  if (!banner) return;
  var providerName = provider === 'openai' ? 'OpenAI' : 'Anthropic';
  var tierName     = provider === 'openai' ? 'Pro' : 'Premium';
  var lsKey        = provider === 'openai' ? 'stori_openai_key' : 'stori_anthropic_key';
  var placeholder  = provider === 'openai' ? 'sk-...' : 'sk-ant-...';

  banner.innerHTML =
    '<span>⚠ ' + tierName + ' tier requires an ' + providerName + ' API key.</span> ' +
    '<input type="password" id="bs-inline-key" placeholder="' + placeholder + '" autocomplete="off" data-form-type="other" ' +
    'style="margin:0 6px;padding:4px 8px;border-radius:6px;border:1px solid var(--lp-card-bdr);background:var(--lp-bg);color:var(--lp-text);font-size:12px;width:200px"> ' +
    '<button id="bs-inline-key-save" style="padding:4px 10px;border-radius:6px;background:var(--lp-accent);color:var(--lp-on-accent);border:none;font-size:12px;cursor:pointer">Save</button>';
  banner.style.display = 'flex';

  var saveBtn = document.getElementById('bs-inline-key-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      var keyInput = document.getElementById('bs-inline-key');
      var val = keyInput ? keyInput.value.trim() : '';
      if (!val) return;
      localStorage.setItem(lsKey, val);
      brainstormState.provider = provider;
      document.querySelectorAll('.bs-model-opt').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.provider === provider);
      });
      _hideKeyBanner();
    });
  }
}

function _hideKeyBanner() {
  var banner = document.getElementById('bs-key-banner');
  if (banner) banner.style.display = 'none';
}

// ── SECTION 6: Chat rendering ─────────────────────────────────────────────────

function _renderMessages() {
  var log = document.getElementById('bs-chat-log');
  if (!log) return;
  log.innerHTML = '';
  brainstormState.messages.forEach(function(msg) {
    if (msg.role === '_greeting') {
      _appendMessage('ai', msg.content, false);
    } else {
      _appendMessage(msg.role === 'assistant' ? 'ai' : 'user', msg.content, false);
    }
  });
  _scrollChatToBottom();
}

function _appendMessage(role, content, scroll) {
  var log = document.getElementById('bs-chat-log');
  if (!log) return;

  var div = document.createElement('div');
  div.className = 'bs-msg bs-msg-' + role;
  // Render markdown-ish: **bold**, bullet lines, line breaks
  div.innerHTML = _renderMd(content);
  log.appendChild(div);
  if (scroll !== false) _scrollChatToBottom();
}

function _renderMd(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function _showTyping() {
  var log = document.getElementById('bs-chat-log');
  if (!log) return;
  var div = document.createElement('div');
  div.id = 'bs-typing';
  div.className = 'bs-msg bs-msg-ai bs-msg-typing';
  div.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  log.appendChild(div);
  _scrollChatToBottom();
}

function _hideTyping() {
  var el = document.getElementById('bs-typing');
  if (el) el.remove();
}

function _scrollChatToBottom() {
  var log = document.getElementById('bs-chat-log');
  if (log) log.scrollTop = log.scrollHeight;
}

function _renderGreeting() {
  var log = document.getElementById('bs-chat-log');
  if (log) log.innerHTML = '';

  var mode = brainstormState.mode;
  var wizCtx = brainstormState.wizardAnswers;
  var typeLabel = { social: 'social media clip', brand: 'brand/product video', tutorial: 'tutorial/explainer', personal: 'personal/creative' }[wizCtx.type] || 'video';
  var lenLabel  = { short: 'short & punchy (under 90s)', medium: 'medium length (1–5 min)', long: 'in-depth (5+ min)' }[wizCtx.length] || '';

  var greeting;
  if (mode === 'autopilot') {
    greeting = `Hi! I'm your Storypilot — here to help you shape a compelling **${typeLabel}** reel${lenLabel ? ' (' + lenLabel + ')' : ''}.\n\n**What's the core idea or topic for this video?** One sentence is enough to get us started.`;
  } else {
    greeting = `Hi! I'm your Storypilot — ready to help you build a **${typeLabel}**${lenLabel ? ' (' + lenLabel + ')' : ''} script.\n\n**What's the central story or message you want to tell?** Give me the big idea and we'll shape it together.`;
  }

  // Store as a pseudo-message so it re-renders correctly on session restore
  brainstormState.messages.unshift({ role: '_greeting', content: greeting });
  _appendMessage('ai', greeting);

  // Show suggestion chips
  _renderSuggestionChips(mode);
}

function _renderSuggestionChips(mode) {
  var log = document.getElementById('bs-chat-log');
  if (!log) return;
  var chips = mode === 'autopilot'
    ? ['Skincare routine', 'Travel vlog', 'Productivity tips', 'Recipe quick-take']
    : ['Brand story', 'Product explainer', 'Tutorial video', 'Documentary short'];

  var div = document.createElement('div');
  div.className = 'bs-chips';
  chips.forEach(function(label) {
    var btn = document.createElement('button');
    btn.className = 'bs-chip';
    btn.textContent = label;
    btn.dataset.text = label;
    btn.addEventListener('click', function() {
      var input = document.getElementById('bs-input');
      if (input) { input.value = label; input.dispatchEvent(new Event('input')); input.focus(); }
    });
    div.appendChild(btn);
  });
  log.appendChild(div);
}

// ── SECTION 7: Send ───────────────────────────────────────────────────────────

async function _sendMessage() {
  var input   = document.getElementById('bs-input');
  var sendBtn = document.getElementById('bs-send-btn');
  if (!input) return;

  var text = input.value.trim();
  if (!text) return;

  // If user explicitly asks for the final script, trigger finalise directly
  var _finaliseIntent = /\b(final(ise|ize|[- ]?script)|give.*script|write.*script|full script|complete script|make.*script|generate.*script|create.*script|done.*chat|skip.*chat|just.*script)\b/i.test(text);
  if (_finaliseIntent && brainstormState.messages.filter(function(m) { return m.role === 'user'; }).length >= 1) {
    input.value = '';
    _appendMessage('user', text);
    brainstormState.messages.push({ role: 'user', content: text });
    _finaliseScript();
    return;
  }

  // Check limit — skip if already finalised (user is in edit/refine mode)
  if (!brainstormState.finalised && brainstormState.messageCount >= MAX_MESSAGES) {
    _showLimitBanner();
    return;
  }

  // First send → lock provider
  if (!brainstormState.providerLocked) {
    _lockProvider();
  }

  // Optimistic UI
  input.value = '';
  if (sendBtn) sendBtn.disabled = true;
  _appendMessage('user', text);

  // Remove suggestion chips if present (they only show on greeting)
  var chips = document.querySelector('#bs-chat-log .bs-chips');
  if (chips) chips.remove();

  // Push to messages (exclude the internal _greeting marker from API)
  brainstormState.messages.push({ role: 'user', content: text });

  _showTyping();

  var systemPrompt = _buildSystemPrompt();
  // Messages for API = exclude the internal _greeting marker
  var apiMessages = brainstormState.messages.filter(function(m) { return m.role !== '_greeting'; });

  try {
    var result = await callChatLLM({
      provider:     brainstormState.provider,
      messages:     apiMessages,
      systemPrompt: systemPrompt,
      jsonMode:     false,
      maxTokens:    CHAT_MAX_TOKENS
    });

    _hideTyping();

    brainstormState.messages.push({ role: 'assistant', content: result.text });
    brainstormState.totalInputTokens  += result.inputTokens;
    brainstormState.totalOutputTokens += result.outputTokens;
    brainstormState.messageCount++;

    _appendMessage('ai', result.text);
    _updateMeta();
    _checkFinalisable();
    _saveSession();

    // Auto-finalise at message 12 — generate script inline without switching screens
    if (brainstormState.messageCount === AUTO_FINALISE_AT) {
      _autoFinaliseInline();
    }

  } catch (err) {
    _hideTyping();
    var errMsg = (typeof friendlyRouterError === 'function')
      ? friendlyRouterError(err, brainstormState.provider)
      : (err.message || 'Something went wrong.');
    _appendMessage('ai', '⚠ ' + errMsg + '\n\n*Your message was not lost — you can try sending again.*');

    // Remove last user message from state since it didn't go through
    brainstormState.messages.pop();
  }

  if (sendBtn) sendBtn.disabled = !document.getElementById('bs-input')?.value.trim();
}

function _buildSystemPrompt() {
  var base = SYSTEM_PROMPTS[brainstormState.mode || 'autopilot'];
  var ctx  = brainstormState.wizardAnswers;
  if (ctx.type || ctx.length) {
    base += '\n\n[User context from wizard: type=' + (ctx.type || 'unknown') + ', length=' + (ctx.length || 'unknown') + ' — skip re-asking these; treat as already known.]';
  }
  if (brainstormState.sessionSummary) {
    base += '\n\n[CONTINUATION SESSION — previous session summary:\n' + brainstormState.sessionSummary + '\nDo NOT re-ask anything already decided above. Pick up exactly where the user left off.]';
  }
  return base;
}

// ── SECTION 8: Lifecycle / localStorage ──────────────────────────────────────

function _saveSession() {
  brainstormState.savedAt = Date.now();
  try { localStorage.setItem(BS_STORAGE_KEY, JSON.stringify(brainstormState)); } catch(_) {}
}

function _loadSession() {
  try {
    var raw = localStorage.getItem(BS_STORAGE_KEY);
    if (!raw) return false;
    var saved = JSON.parse(raw);
    if (!saved.savedAt || (Date.now() - saved.savedAt) > BS_TTL_MS) {
      localStorage.removeItem(BS_STORAGE_KEY);
      return false;
    }
    Object.assign(brainstormState, saved);
    return true;
  } catch(_) { return false; }
}

function _clearSession() {
  localStorage.removeItem(BS_STORAGE_KEY);
  // Reset to defaults
  brainstormState.mode           = null;
  brainstormState.provider       = 'gemini';
  brainstormState.providerLocked = false;
  brainstormState.startedAt      = null;
  brainstormState.messages       = [];
  brainstormState.messageCount   = 0;
  brainstormState.totalInputTokens  = 0;
  brainstormState.totalOutputTokens = 0;
  brainstormState.finalScript    = null;
  brainstormState.finalised       = false;
  brainstormState.wizardAnswers   = {};
  brainstormState.sessionSummary  = null;
  brainstormState.willExtend      = false;
  brainstormState.savedAt         = null;
  _unlockProvider();
  _updateMeta();
  _updateModeTag(null);
  _hideLimitBanner();
  _hideKeyBanner();
  var log = document.getElementById('bs-chat-log');
  if (log) log.innerHTML = '';
  var input = document.getElementById('bs-input');
  if (input) input.value = '';
  var sendBtn = document.getElementById('bs-send-btn');
  if (sendBtn) sendBtn.disabled = true;
  var finaliseBtn = document.getElementById('bs-finalise-btn');
  if (finaliseBtn) finaliseBtn.disabled = true;
  var hint = document.getElementById('bs-finalise-hint');
  if (hint) hint.textContent = 'Finalise enabled after 3+ exchanges';
}

function _restoreFromSession() {
  // Re-apply provider selection UI
  document.querySelectorAll('.bs-model-opt').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.provider === brainstormState.provider);
  });
  if (brainstormState.providerLocked) _lockProvider();

  _updateModeTag(brainstormState.mode);
  _updateSendToButton(brainstormState.mode);

  if (brainstormState.finalised && brainstormState.finalScript) {
    _renderFinalScript(brainstormState.finalScript);
    _showScreen('bs-final');
  } else if (brainstormState.mode) {
    _renderMessages();
    _showScreen('bs-chat');
    _updateMeta();
    _checkFinalisable();
  }
  // Otherwise stay on wizard (shouldn't happen with valid saved session)
}

// ── SECTION 9: Meta display ───────────────────────────────────────────────────

function _updateMeta() {
  var msgCount = document.getElementById('bs-msg-count');
  if (msgCount) msgCount.textContent = brainstormState.messageCount + '/' + MAX_MESSAGES + ' messages';

  // Cost: rough estimate based on token usage
  var costEl = document.getElementById('bs-cost-tag');
  if (costEl) {
    var p = _getProviderPricing(brainstormState.provider);
    var cost = (brainstormState.totalInputTokens * p.in) + (brainstormState.totalOutputTokens * p.out);
    costEl.textContent = '~$' + cost.toFixed(3) + ' used';
  }
}

function _getProviderPricing(provider) {
  var TABLE = {
    gemini:    { in: 0.000000075, out: 0.000000300 },
    openai:    { in: 0.000002500, out: 0.000010000 },
    anthropic: { in: 0.000003000, out: 0.000015000 },
  };
  return TABLE[provider] || TABLE.gemini;
}

function _updateModeTag(mode) {
  var tag = document.getElementById('bs-mode-tag');
  if (!tag) return;
  if (mode === 'autopilot') { tag.textContent = '⚡ Autopilot'; tag.style.display = ''; }
  else if (mode === 'copilot') { tag.textContent = '🎬 Copilot'; tag.style.display = ''; }
  else { tag.style.display = 'none'; }
}

function _updateSendToButton(mode) {
  var btn      = document.getElementById('bs-send-pipeline-btn');
  var nameSpan = document.getElementById('bs-handoff-pipeline-name');
  var iconSpan = btn ? btn.querySelector('.bs-handoff-icon') : null;
  if (!btn || !nameSpan) return;
  if (mode === 'autopilot') {
    if (nameSpan) nameSpan.textContent = 'Autopilot';
    if (iconSpan) iconSpan.textContent = '⚡';
  } else {
    if (nameSpan) nameSpan.textContent = 'Copilot';
    if (iconSpan) iconSpan.textContent = '🎬';
  }
}

// ── SECTION 10: Limits ────────────────────────────────────────────────────────

function _checkFinalisable() {
  var finaliseBtn = document.getElementById('bs-finalise-btn');
  var hint        = document.getElementById('bs-finalise-hint');
  var count       = brainstormState.messageCount;
  var remaining   = MAX_MESSAGES - count;

  if (count >= FINALISE_MIN_EXCHANGES) {
    if (finaliseBtn) finaliseBtn.disabled = false;
    if (hint) hint.textContent = '';
  }

  if (remaining <= 2 && remaining > 0) {
    // Soft warning — input still enabled, user can continue or extend
    _showApproachingBanner(remaining);
  }

  if (count >= MAX_MESSAGES && !brainstormState.finalised) {
    _hideApproachingBanner();
    var input   = document.getElementById('bs-input');
    var sendBtn = document.getElementById('bs-send-btn');
    if (input)   input.disabled   = true;
    if (sendBtn) sendBtn.disabled = true;
    if (brainstormState.willExtend) {
      // User pre-registered intent — summarise now and carry forward
      _extendSession();
    } else {
      _showLimitBanner();
    }
  }
}

function _showApproachingBanner(remaining) {
  var banner = document.getElementById('bs-limit-banner');
  if (!banner) return;
  var msgWord = remaining === 1 ? 'message' : 'messages';
  // If already queued, show confirmation state
  if (brainstormState.willExtend) {
    banner.innerHTML = '<span>✓ Session extended — keep going.</span>';
    banner.style.display = 'flex';
    return;
  }
  banner.innerHTML =
    '<span>⚠ ' + remaining + ' ' + msgWord + ' left in this session.</span>' +
    '<button id="bs-extend-btn" class="bs-extend-btn">↻ Continue in new session →</button>';
  banner.style.display = 'flex';
  var extendBtn = document.getElementById('bs-extend-btn');
  if (extendBtn) extendBtn.addEventListener('click', function() {
    brainstormState.willExtend = true;
    banner.innerHTML = '<span>✓ Session extended — keep going.</span>';
  });
}

function _hideApproachingBanner() {
  // Only clear if it's showing the approaching (not hard limit) state
  var banner = document.getElementById('bs-limit-banner');
  if (banner && banner.querySelector('#bs-extend-btn') && document.getElementById('bs-input') && !document.getElementById('bs-input').disabled) {
    banner.style.display = 'none';
  }
}

function _showLimitBanner() {
  var banner = document.getElementById('bs-limit-banner');
  if (!banner) return;
  banner.innerHTML =
    '<span>Session limit reached (15 messages).</span>' +
    '<button id="bs-extend-btn" class="bs-extend-btn">↻ Continue in new session →</button>';
  banner.style.display = 'flex';
  var extendBtn = document.getElementById('bs-extend-btn');
  if (extendBtn) extendBtn.addEventListener('click', _extendSession);
}

function _hideLimitBanner() {
  var banner = document.getElementById('bs-limit-banner');
  if (banner) { banner.style.display = 'none'; }
  var input   = document.getElementById('bs-input');
  var sendBtn = document.getElementById('bs-send-btn');
  if (input)   input.disabled   = false;
  if (sendBtn) sendBtn.disabled = false;
}

// ── SECTION 11: Finalise ──────────────────────────────────────────────────────

async function _finaliseScript() {
  var finaliseBtn = document.getElementById('bs-finalise-btn');
  if (finaliseBtn) finaliseBtn.disabled = true;

  _showTyping();

  var mode         = brainstormState.mode || 'autopilot';
  var finalPrompt  = FINALISE_PROMPTS[mode];
  var systemPrompt = _buildSystemPrompt();
  var apiMessages  = brainstormState.messages
    .filter(function(m) { return m.role !== '_greeting'; })
    .concat([{ role: 'user', content: finalPrompt }]);

  async function attempt() {
    return await callChatLLM({
      provider:     brainstormState.provider,
      messages:     apiMessages,
      systemPrompt: systemPrompt,
      jsonMode:     true,
      maxTokens:    FINALISE_MAX_TOKENS
    });
  }

  try {
    var result = await attempt();
    _hideTyping();

    var scriptObj;
    try {
      scriptObj = JSON.parse(result.text);
    } catch(_) {
      // Cleanup retry
      var retryMessages = apiMessages.concat([
        { role: 'assistant', content: result.text },
        { role: 'user', content: 'Your previous reply was not valid JSON. Output the script as JSON only, no markdown, no preamble, no explanation.' }
      ]);
      _showTyping();
      var result2 = await callChatLLM({
        provider: brainstormState.provider,
        messages: retryMessages,
        systemPrompt: systemPrompt,
        jsonMode: true,
        maxTokens: 1200
      });
      _hideTyping();
      scriptObj = JSON.parse(result2.text);
    }

    brainstormState.finalScript = scriptObj;
    brainstormState.finalised   = true;
    brainstormState.totalInputTokens  += result.inputTokens;
    brainstormState.totalOutputTokens += result.outputTokens;
    _saveSession();

    _renderFinalScript(scriptObj);
    _showScreen('bs-final');
    _summariseSession(); // background — stores summary for next session

  } catch(err) {
    _hideTyping();
    if (finaliseBtn) finaliseBtn.disabled = false;
    _appendMessage('ai', '⚠ Finalise failed: ' + (err.message || 'Unknown error') + '\n\nClick **✨ Finalise Script** to try again.');
  }
}

// ── Auto-finalise inline (triggered at message 12) ───────────────────────────

async function _autoFinaliseInline() {
  // Show a typing indicator — this runs silently after the AI's reply at message 12
  _showTyping();

  var mode        = brainstormState.mode || 'autopilot';
  var systemPrompt = _buildSystemPrompt();
  var apiMessages = brainstormState.messages
    .filter(function(m) { return m.role !== '_greeting'; })
    .concat([{ role: 'user', content: FINALISE_PROMPTS[mode] }]);

  try {
    var result = await callChatLLM({
      provider:     brainstormState.provider,
      messages:     apiMessages,
      systemPrompt: systemPrompt,
      jsonMode:     true,
      maxTokens:    FINALISE_MAX_TOKENS
    });
    _hideTyping();

    var scriptObj;
    try { scriptObj = JSON.parse(result.text); } catch(_) { scriptObj = null; }
    if (!scriptObj) return; // silently skip — user can still click Finalise manually

    brainstormState.finalScript = scriptObj;
    brainstormState.finalised   = true;
    brainstormState.totalInputTokens  += result.inputTokens;
    brainstormState.totalOutputTokens += result.outputTokens;
    _saveSession();

    // Render script inline as a chat bubble — no screen switch
    _appendInlineScript(scriptObj);
    _updateMeta();

  } catch(_) {
    _hideTyping();
    // Silent — user can still manually click Finalise
  }
}

function _appendInlineScript(s) {
  var log = document.getElementById('bs-chat-log');
  if (!log || !s) return;

  var div = document.createElement('div');
  div.className = 'bs-msg bs-msg-ai bs-inline-script';

  // Header
  var html = '<div class="bs-inline-script-hdr">✨ Here\'s your script draft</div>';

  // Title + pills
  html += '<div class="bs-final-card" style="margin:12px 0 8px;padding:16px 18px">';
  html += '<h3 style="font-size:15px;margin:0 0 6px">' + _esc(s.title || 'Untitled') + '</h3>';

  var pills = [];
  if (s.tone)        pills.push(_esc(s.tone));
  if (s.platform)    pills.push(_esc(s.platform));
  if (s.estDuration) pills.push(_esc(s.estDuration));
  if (pills.length) html += '<div class="bs-meta-pills">' + pills.map(function(p) { return '<span class="bs-meta-pill">' + p + '</span>'; }).join('') + '</div>';

  if (s.hook !== undefined) {
    html += '<div class="bs-scene"><div class="bs-scene-num">Hook</div><div class="bs-scene-voice">' + _esc(s.hook) + '</div></div>';
    (s.scenes || []).forEach(function(sc, i) {
      html += '<div class="bs-scene"><div class="bs-scene-num">Scene ' + (sc.n || i + 1) + (sc.timeRange ? ' · ' + sc.timeRange : '') + '</div>';
      if (sc.visual) html += '<div class="bs-scene-vis">🎬 ' + _esc(sc.visual) + '</div>';
      if (sc.voice)  html += '<div class="bs-scene-voice">🎤 ' + _esc(sc.voice) + '</div>';
      html += '</div>';
    });
    if (s.cta) html += '<div class="bs-scene"><div class="bs-scene-num">CTA</div><div class="bs-scene-voice">' + _esc(s.cta) + '</div></div>';
  } else {
    (s.scenes || []).forEach(function(sc, i) {
      var sect = sc.section ? ' — ' + sc.section : '';
      html += '<div class="bs-scene"><div class="bs-scene-num">Scene ' + (sc.n || i + 1) + sect + '</div>';
      if (sc.narration) html += '<div class="bs-scene-voice">🎤 ' + _esc(sc.narration) + '</div>';
      html += '</div>';
    });
  }
  html += '</div>';

  // Action row
  var target = brainstormState.mode === 'autopilot' ? 'Autopilot ⚡' : 'Copilot 🎬';
  html += '<div class="bs-inline-script-actions">' +
    '<button class="bs-btn-primary bs-inline-send">Send to ' + target + '</button>' +
    '<button class="bs-tool-btn bs-inline-download">⬇ Download .md</button>' +
    '<button class="bs-tool-btn bs-inline-copy">📋 Copy VO</button>' +
    '</div>';
  html += '<p class="bs-inline-script-note">Still want to tweak? Keep chatting — you have ' + (MAX_MESSAGES - brainstormState.messageCount) + ' messages left.</p>';

  div.innerHTML = html;
  log.appendChild(div);

  // Wire buttons
  div.querySelector('.bs-inline-send').addEventListener('click', function() {
    _sendToPipeline(brainstormState.mode);
  });
  div.querySelector('.bs-inline-download').addEventListener('click', function() {
    _downloadScript(brainstormState.finalScript, brainstormState.mode);
  });
  div.querySelector('.bs-inline-copy').addEventListener('click', function() {
    _copyToClipboard(_formatScriptToPlainText(brainstormState.finalScript));
    this.textContent = '✓ Copied!';
  });

  _scrollChatToBottom();
}

// ── Session summarisation (background, no session clear) ─────────────────────

async function _summariseSession() {
  var historyText = brainstormState.messages
    .filter(function(m) { return m.role !== '_greeting'; })
    .map(function(m) { return (m.role === 'user' ? 'User' : 'AI') + ': ' + m.content; })
    .join('\n\n');

  var summaryPrompt =
    'Summarise this video script brainstorm session in under 200 words. Structure it as:\n' +
    '- Topic & goal\n- Hook decided (if any)\n- Scenes approved (list them briefly)\n- Tone & platform\n- What still needs work\n\n' +
    'Be specific and terse — this summary will be injected as context into a new brainstorm session so the AI can continue without re-asking anything already decided.\n\n' +
    '---\n' + historyText;

  try {
    var data = await callGeminiAPI(getTextModels(), {
      contents: [{ parts: [{ text: summaryPrompt }] }],
      generationConfig: { maxOutputTokens: 512, temperature: 0.1, thinkingConfig: { thinkingBudget: 1024 } }
    });
    var summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (summary) {
      brainstormState.sessionSummary = summary;
      _saveSession();
    }
  } catch(_) {
    // Silent — summary is best-effort
  }
}

// ── Session extension (continue in new session with summary) ──────────────────

async function _extendSession() {
  var extendBtn = document.getElementById('bs-extend-btn');
  if (extendBtn) { extendBtn.disabled = true; extendBtn.textContent = 'Summarising…'; }

  var mode        = brainstormState.mode;
  var wizAnswers  = Object.assign({}, brainstormState.wizardAnswers);
  var provider    = brainstormState.provider;

  // Summarise first (stores into brainstormState.sessionSummary)
  await _summariseSession();
  var summary = brainstormState.sessionSummary ||
    'Continuation of previous session (summary unavailable). Mode: ' + mode + '.';

  // Reset session but carry forward mode, wizard answers, provider, and summary
  _clearSession();
  brainstormState.mode           = mode;
  brainstormState.provider       = provider;
  brainstormState.wizardAnswers  = wizAnswers;
  brainstormState.sessionSummary = summary;

  // Re-apply provider pill
  document.querySelectorAll('.bs-model-opt').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.provider === provider);
  });
  _updateModeTag(mode);
  _updateSendToButton(mode);

  // Start fresh chat with summary context
  _showScreen('bs-chat');
  _renderGreeting();
  _saveSession();
}

// ── SECTION 12: Final screen ──────────────────────────────────────────────────

function _renderFinalScript(s) {
  var card = document.getElementById('bs-final-card');
  if (!card || !s) return;

  var parts = [];
  parts.push('<h3>' + _esc(s.title || 'Untitled script') + '</h3>');

  // Meta pills
  var pills = [];
  if (s.tone)        pills.push(_esc(s.tone));
  if (s.platform)    pills.push(_esc(s.platform));
  if (s.estDuration) pills.push(_esc(s.estDuration));
  if (s.audience)    pills.push(_esc(s.audience));
  if (pills.length) {
    parts.push('<div class="bs-meta-pills">' + pills.map(function(p) { return '<span class="bs-meta-pill">' + p + '</span>'; }).join('') + '</div>');
  }

  // Autopilot shape
  if (s.hook !== undefined) {
    parts.push('<div class="bs-scene"><div class="bs-scene-num">Hook</div>');
    parts.push('<div class="bs-scene-voice">' + _esc(s.hook) + '</div></div>');
    (s.scenes || []).forEach(function(sc, i) {
      parts.push('<div class="bs-scene">');
      parts.push('<div class="bs-scene-num">Scene ' + (sc.n || i + 1) + (sc.timeRange ? ' · ' + sc.timeRange : '') + '</div>');
      if (sc.visual) parts.push('<div class="bs-scene-vis">🎬 ' + _esc(sc.visual) + '</div>');
      if (sc.voice)  parts.push('<div class="bs-scene-voice">🎤 ' + _esc(sc.voice) + '</div>');
      parts.push('</div>');
    });
    if (s.cta) {
      parts.push('<div class="bs-scene"><div class="bs-scene-num">CTA</div>');
      parts.push('<div class="bs-scene-voice">' + _esc(s.cta) + '</div></div>');
    }
  } else {
    // Copilot shape
    if (s.concept) parts.push('<p style="margin:0 0 14px;color:var(--lp-dim)">' + _esc(s.concept) + '</p>');
    (s.scenes || []).forEach(function(sc, i) {
      var sect = sc.section ? ' — ' + sc.section : '';
      parts.push('<div class="bs-scene">');
      parts.push('<div class="bs-scene-num">Scene ' + (sc.n || i + 1) + sect + (sc.timeRange ? ' · ' + sc.timeRange : '') + '</div>');
      if (sc.visual)    parts.push('<div class="bs-scene-vis">🎬 ' + _esc(sc.visual) + '</div>');
      if (sc.narration) parts.push('<div class="bs-scene-voice">🎤 ' + _esc(sc.narration) + '</div>');
      if (sc.mood)      parts.push('<div class="bs-scene-vis" style="color:var(--lp-mute)">🎵 ' + _esc(sc.mood) + '</div>');
      parts.push('</div>');
    });
  }

  card.innerHTML = parts.join('');
}

function _esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── SECTION 13: Handoff ───────────────────────────────────────────────────────

function _sendToPipeline(target) {
  if (!brainstormState.finalScript) return;

  var fileName = _downloadScript(brainstormState.finalScript, target);

  window.__storiHandoff = {
    target:       target,
    plainText:    _formatScriptToPlainText(brainstormState.finalScript),
    fileName:     fileName,
    source:       'brainstorm',
    finalScript:  brainstormState.finalScript
  };

  if (target === 'autopilot') {
    navigateTo('reel');
  } else {
    navigateTo('create');
  }
}

// ── SECTION 14: Helpers ───────────────────────────────────────────────────────

function _formatScriptToPlainText(s) {
  if (!s) return '';
  // Autopilot-shaped
  if (s.hook !== undefined) {
    var lines = [];
    if (s.hook) lines.push(s.hook);
    (s.scenes || []).forEach(function(sc) { if (sc.voice) lines.push(sc.voice); });
    if (s.cta) lines.push(s.cta);
    return lines.join(' ');
  }
  // Copilot-shaped
  var lines = [];
  (s.scenes || []).forEach(function(sc) { if (sc.narration) lines.push(sc.narration); });
  return lines.join('\n\n');
}

function _downloadScript(scriptObj, target) {
  var ts   = new Date().toISOString().slice(0, 10);
  var slug = ((scriptObj && scriptObj.title) || 'script')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'script';
  var fileName = 'storypilot-' + target + '-' + slug + '-' + ts + '.md';
  var md   = _renderScriptMarkdown(scriptObj, target);
  var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var a    = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  return fileName;
}

function _renderScriptMarkdown(s, target) {
  var PROVIDER_LABEL = { gemini: 'Quick', openai: 'Pro', anthropic: 'Premium' };
  var tier = PROVIDER_LABEL[brainstormState.provider] || 'Quick';
  var date = new Date().toISOString().slice(0, 10);
  var out  = [];

  out.push('# ' + (s.title || 'Untitled script'), '');

  var meta = [];
  if (s.tone)        meta.push('**Tone:** ' + s.tone);
  if (s.platform)    meta.push('**Platform:** ' + s.platform);
  if (s.estDuration) meta.push('**Duration:** ' + s.estDuration);
  if (meta.length)   out.push(meta.join(' · '), '');

  out.push('---', '');

  if (s.hook !== undefined) {
    // Autopilot
    out.push('## Hook (0–3s)', '**Voice:** ' + (s.hook || ''), '');
    (s.scenes || []).forEach(function(sc, i) {
      out.push('## Scene ' + (sc.n || i + 1) + (sc.timeRange ? ' (' + sc.timeRange + ')' : ''));
      if (sc.visual) out.push('**Visual:** ' + sc.visual);
      if (sc.voice)  out.push('**Voice:** ' + sc.voice);
      out.push('');
    });
    if (s.cta) out.push('## Call to Action', '**Voice:** ' + s.cta, '');
  } else {
    // Copilot
    if (s.concept)   out.push('## Concept', s.concept, '');
    if (s.audience)  out.push('**Audience:** ' + s.audience, '');
    if (s.musicTone) out.push('**Music tone:** ' + s.musicTone, '');
    (s.scenes || []).forEach(function(sc, i) {
      var sect = sc.section ? ' — ' + sc.section : '';
      out.push('## Scene ' + (sc.n || i + 1) + sect + (sc.timeRange ? ' (' + sc.timeRange + ')' : ''));
      if (sc.visual)    out.push('**Visual:** ' + sc.visual);
      if (sc.narration) out.push('**Narration:** ' + sc.narration);
      if (sc.mood)      out.push('**Mood:** ' + sc.mood);
      out.push('');
    });
  }

  out.push('---', '');
  out.push('## 📋 Voiceover script (copy this to use in Stori)', '');
  out.push(_formatScriptToPlainText(s), '');
  out.push('---', '');
  out.push('*Created with Storypilot · ' + tier + ' · ' + date + '*');

  return out.join('\n');
}

function _copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(function() { _fallbackCopy(text); });
  } else {
    _fallbackCopy(text);
  }
}

function _fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

function _autoResizeTextarea(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
}

function _showScreen(id) {
  ['bs-selector', 'bs-chat', 'bs-final'].forEach(function(sid) {
    var el = document.getElementById(sid);
    if (el) el.classList.toggle('hidden', sid !== id);
  });
  // Scroll to top of page when switching screens
  var bsPage = document.getElementById('brainstorm-page');
  if (bsPage) bsPage.scrollTop = 0;
}

// ── Entry point ───────────────────────────────────────────────────────────────
// Called when the page navigates to 'storypilot' (from navigateTo in 01-core.js)
window._brainstormInit = _init;

// Auto-init now (scripts are loaded lazily after first nav click)
_init();

})();
