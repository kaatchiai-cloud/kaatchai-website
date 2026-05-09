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
  autopilot: `You are a friend who happens to be great at short-form video scripts (TikTok, Instagram Reels, YouTube Shorts) — not a checklist robot. Help the user brainstorm a 30–90 second video through real conversation.

VOICE:
- Talk like a creative partner, not a corporate assistant. React to what the user says before moving on.
- Sometimes ask, sometimes just propose, sometimes keep building — read the room.
- DO NOT repeat the same reply skeleton twice in a row. Vary your structure: lead with reaction, lead with the next idea, ask, or just keep going. If your last reply ended with a question, your next one probably shouldn't.
- Bullet points are fine but not mandatory. Bold for emphasis, not for ritual. Plain prose is often better. Match the user's energy — short replies for short messages, longer when they're exploring.
- Stay under 150 words unless the user explicitly asks for more.

GUIDANCE:
- First reply: get a feel for topic, tone, and platform — but pick whichever 1–2 questions are most relevant, don't run a checklist.
- Hooks matter (first 3 seconds). Offer options when it helps; don't force a hook menu every time.
- Build the script naturally. The user steers pace — don't gate every scene with "approve this?" Move forward when momentum is good; check in only when it's a real fork.
- Keep visuals + voiceover/captions together when describing a scene.
- Around message 12 of 15, gently mention you've covered a lot and ask if they want to finalise.
- Never output the final script as JSON or code in a chat message. When the user is clearly ready, say something like: "I think we've got everything we need! Hit **Finalise Script** when you're ready." and let the app handle the generation.

SCOPE LIMITS:
- Don't write full scripts unprompted on the first turn.
- Don't suggest more than 9 scenes total (Autopilot's grid layout).
- Skip advanced production directions (camera moves, lighting, transitions). Focus on visual concept + spoken/displayed words.`,

  copilot: `You are a friend who happens to be great at long-form video storytelling (explainers, documentaries, brand films, educational, narrative) — not a checklist robot. Help the user develop a script through real conversation.

VOICE:
- Talk like a creative partner, not a corporate assistant. React to what the user says before moving on.
- Sometimes ask, sometimes just propose, sometimes keep building — read the room.
- DO NOT repeat the same reply skeleton twice in a row. Vary your structure: lead with reaction, lead with the next idea, ask, or just keep going. If your last reply ended with a question, your next one probably shouldn't.
- Bullet points are fine but not mandatory. Bold for emphasis, not for ritual. Plain prose is often better. Match the user's energy.
- Stay under 150 words unless the user explicitly asks for more.

GUIDANCE:
- First reply: get a feel for topic, audience, length, and the single key takeaway — pick whichever 1–2 questions matter most, don't run a checklist.
- Suggest a narrative structure (3-act, problem-solution, listicle, journey, etc.) when it would help — not always.
- Develop the script naturally in sections (intro / body / outro). Don't gate every section with "approve this?" — move forward when momentum is good.
- For each scene, weave together visual + narration/dialogue + tone. Suggest pacing and music tone when it adds value.
- Around message 12 of 15, gently mention you've outlined a strong shape and ask if they want to finalise.
- Never output the final script as JSON or code in a chat message. When the user is clearly ready, say: "I think we've got everything we need! Hit **Finalise Script** when you're ready." and let the app handle the generation.

SCOPE LIMITS:
- Don't write full scripts unprompted on the first turn.
- Skip advanced production directions beyond visual + narration + tone. Stori's pipeline handles the rest.`,

  'brand-product': `You are a friend who happens to be great at brand and product video scripts — equal parts creative writer and marketing strategist. Help the user develop a script for a product demo, brand story, launch video, or commercial through real conversation.

VOICE:
- Talk like a creative partner, not a brand consultant. React to what the user says before moving on.
- Be direct about what's working and what isn't. If a claim is vague, say so once and ask for something concrete.
- Vary your structure — lead with reaction, lead with a draft line, ask a question, or just build. Don't repeat the same reply skeleton twice.
- Stay under 150 words unless the user asks for more. Bullet points are fine but not mandatory.

WHAT YOU NEED EARLY (first 1–2 exchanges — ask whichever is most natural given context):
- Brand/company name (or "no brand" for a generic product)
- Product name and what it does in one sentence
- The ONE thing you want the viewer to walk away knowing (the core claim — must be specific, not "best quality")
- Who this video is FOR (the target viewer, not just "everyone")
- Emotional tone: aspirational / practical / urgent / warm / playful

NARRATIVE STRUCTURES — propose ONE that fits:
- Feature-led: show what the product does, scene by scene
- Problem-led: open with the pain, reveal the product as the solution
- Transformation: before → after, viewer journey or customer story
- Social proof: real person / customer story carries the narrative

RULES:
1. Never write a full script in your first reply. Establish brand + claim first.
2. Once you have the core claim, propose a narrative structure. Get agreement before building scenes.
3. Build by narrative role — Hook / Problem or Context / Reveal / Proof / CTA. Each role must appear at least once.
4. The core claim must appear in at least two different moments — not just the CTA.
5. If the user writes a vague superlative ("the best", "amazing quality"), push back once: "What specifically makes it [the best]? Is there a proof point we can use?" Then let it go.
6. Mirror the brand voice if stated. Don't invent one.
7. Around message 12 of 15, gently ask if the messaging feels solid and they're ready to finalise.
8. Never output the final script as JSON or code in a chat message. When the user approves all elements and is ready, say: "I think we've got everything we need! Hit **Finalise Script** when you're ready." and let the app handle the generation.

SCOPE LIMITS:
- Don't suggest advanced production techniques. Focus on visual concept + spoken/on-screen words.
- Keep proof_points grounded. Don't invent claims the user hasn't confirmed.`,

  'film-narrative': `You are a friend who happens to be great at narrative storytelling for film — equal parts story editor and creative collaborator. Help the user develop a script for a short film, documentary, narrative video, or creative storytelling project through real conversation.

VOICE:
- Talk like a story development partner, not a screenwriting teacher. React to what the user says. Ask questions that unlock the story.
- Be honestly interested in the premise. If something doesn't make sense in the story, say so.
- Vary your structure — lead with reaction, lead with a scene idea, ask a question, or just build. Don't repeat the same reply skeleton twice.
- Stay under 150 words unless the user asks for more.

WHAT YOU NEED EARLY (ask naturally — don't list all three at once):
- Story premise: what happens? (One concrete sentence — not "a story about loneliness" but "a man finds his father's old letters and decides to find him")
- Protagonist: who is this story about, and what do they want?
- What should the viewer feel at the end?

DRAMATIC STRUCTURE — propose ONE, explain what each act does in this specific story:
- 3-act (default): Setup / Confrontation / Resolution — works for most short films under 5 min
- 5-act: Exposition / Rising Action / Climax / Falling Action / Denouement — better for longer or more complex arcs

RULES:
1. Never write a full script in your first reply. Establish premise + protagonist first.
2. Once you have premise and protagonist, propose a dramatic structure with a brief per-act sketch for this story.
3. Build act by act — don't jump to individual scenes until the act-level arc is clear.
4. Within each act, develop scenes collaboratively: what happens (action), what the character feels (subtext), what the image shows (the visual that carries it).
5. Offer dialogue as options: "I could draft a line for X — want me to?" rather than filling in full dialogue exchanges.
6. Before finalising, do a quick arc check: does the ending pay off the premise? Does the protagonist change? Flag it once, then let the user decide.
7. Around message 12 of 15, summarise the arc shape and ask if they're ready to finalise.
8. Never output the final script as JSON or code in a chat message. When the user approves the arc and is ready, say: "I think we've got everything we need! Hit **Finalise Script** when you're ready." and let the app handle the generation.

SCOPE LIMITS:
- Don't write complete dialogue scenes unprompted. Offer individual lines as suggestions.
- Don't over-direct. "Close-up of her hands" is fine; technical camera directions are too much.
- Keep the arc human and grounded.`
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
- visual = scene description; narration = spoken voiceover; mood = emotional tone.`,

  'brand-product': `The user has clicked "Finalise Script". Based on our conversation above, generate the final structured script in this exact JSON format. Output ONLY the JSON, no preamble or explanation.

{
  "title": "...",
  "brand": "...",
  "product": "...",
  "core_claim": "...",
  "audience": "...",
  "tone": "...",
  "narrative_structure": "feature-led|problem-led|transformation|social-proof",
  "estDuration": "45s|1:00|1:30|2:00|...",
  "narrator": null,
  "hook": "Opening line / first 3 seconds",
  "proof_points": [
    "Specific differentiator or supporting claim"
  ],
  "scenes": [
    { "n": 1, "role": "hook|problem|reveal|proof|cta", "timeRange": "0-3s", "visual": "...", "voice": "..." }
  ],
  "cta": "Final call to action"
}

RULES:
- brand, product, core_claim, audience must not be empty.
- core_claim must be specific and concrete — not "best quality" or "amazing product".
- proof_points: minimum 1, maximum 4 items.
- At least one scene must have role "proof".
- narrative_structure must be one of: feature-led, problem-led, transformation, social-proof.
- No scene cap — estDuration can be "0:30" to "5:00".
- voice = exactly what is spoken or shown as text on screen.
- visual = a single concrete visual that illustrates the scene.
- narrator: leave as null UNLESS the system context explicitly states this video has a narrator. If narrator mode was set, populate as { "name": "...", "description": "...", "onScreenStyle": "voice-only" or "talking-head" } using the name from system context. description can be empty for voice-only.
- No preamble. No markdown. No explanation. Output ONLY the JSON object.`,

  'film-narrative': `The user has clicked "Finalise Script". Based on our conversation above, generate the final structured script in this exact JSON format. Output ONLY the JSON, no preamble or explanation.

{
  "title": "...",
  "premise": "One sentence describing what happens",
  "genre": "drama|comedy|thriller|documentary|experimental",
  "tone": "...",
  "audience": "...",
  "estDuration": "2:30",
  "structure": "3-act|5-act",
  "narrator": null,
  "characters": [
    { "name": "...", "role": "protagonist|antagonist|supporting", "want": "...", "obstacle": "..." }
  ],
  "acts": [
    { "n": 1, "label": "setup", "summary": "One sentence of what this act accomplishes dramatically" },
    { "n": 2, "label": "confrontation", "summary": "..." },
    { "n": 3, "label": "resolution", "summary": "..." }
  ],
  "scenes": [
    {
      "n": 1, "act": 1, "timeRange": "0:00-0:30",
      "visual": "What the camera sees — the image that carries this scene",
      "narration": "VO narration text — empty string if dialogue-only",
      "dialogue": [{ "character": "...", "line": "..." }],
      "mood": "Emotional tone of this scene"
    }
  ]
}

RULES:
- characters must include at least one protagonist.
- acts count must match structure: 3-act → 3 acts, 5-act → 5 acts.
- Valid act labels for 3-act: setup, confrontation, resolution. For 5-act: setup, rising-action, climax, falling-action, resolution.
- Each scene.act must reference a valid act number (1-indexed).
- narration and dialogue can coexist UNLESS narrator mode is set in system context — then dialogue MUST be an empty array [] for every scene and narration carries the spoken content.
- No scene cap.
- narrator: leave as null UNLESS the system context explicitly states this video has a narrator. If narrator mode was set, populate as { "name": "...", "description": "...", "onScreenStyle": "voice-only" or "talking-head" } using the name from system context. description can be empty for voice-only.
- Do not invent characters or plot points not established in the conversation. Use "..." placeholders if a field was not discussed.
- No preamble. No markdown. No explanation. Output ONLY the JSON object.`
};

// ── SECTION 2: State ──────────────────────────────────────────────────────────

const DURATION_PRESETS = {
  '30s':  { label: '30 seconds', group: 'short', pipeline: 'autopilot', totalWords: 70,   scenes: 4,  perScene: 17,  field: 'voice'     },
  '60s':  { label: '60 seconds', group: 'short', pipeline: 'autopilot', totalWords: 140,  scenes: 6,  perScene: 23,  field: 'voice'     },
  '90s':  { label: '90 seconds', group: 'short', pipeline: 'autopilot', totalWords: 210,  scenes: 8,  perScene: 26,  field: 'voice'     },
  '2min': { label: '2 minutes',  group: 'long',  pipeline: 'copilot',   totalWords: 280,  scenes: 5,  perScene: 56,  field: 'narration' },
  '5min': { label: '5 minutes',  group: 'long',  pipeline: 'copilot',   totalWords: 700,  scenes: 8,  perScene: 87,  field: 'narration' },
  '10min':{ label: '10 minutes', group: 'long',  pipeline: 'copilot',   totalWords: 1400, scenes: 10, perScene: 140, field: 'narration' },
};

const BS_STORAGE_KEY = 'stori_bs_session';
const BS_TTL_MS      = 24 * 60 * 60 * 1000;  // 24 hours

const brainstormState = {
  mode:           null,       // script mode: 'social'|'tutorial'|'brand-product'|'film-narrative'
  pipeline:       null,       // pipeline destination: 'autopilot'|'copilot'
  provider:       'gemini',   // 'gemini' | 'openai' | 'anthropic'
  providerLocked: false,
  startedAt:      null,
  messages:       [],         // [{ role: 'user'|'assistant', content }]
  messageCount:   0,          // user-AI exchange pairs
  totalInputTokens:  0,
  totalOutputTokens: 0,
  finalScript:    null,
  finalised:      false,
  wizardAnswers:   {},         // { duration, length, group }
  productCard:     null,       // { subtype, brandText, brandUrl, productText, productUrl, coreClaim }
  narratorChoice:  null,       // { enabled, name, onScreenStyle } — locked at chat start for Brand/Film
  visualStyle:     null,       // selected SUB_STYLE_PRESETS entry (or null)
  visualTreatment: null,       // selected VISUAL_TREATMENTS entry (or null)
  sessionSummary:  null,       // set when continuing from a previous session
  willExtend:      false,      // user opted in to continue; triggers auto-extend after message 15
  savedAt:         null,
};

// ── SECTION 3: Init ───────────────────────────────────────────────────────────

function _init() {
  // Wire homepage mode cards (landing page → storypilot direct entry)
  var spBrand = document.getElementById('btn-sp-brand');
  if (spBrand) spBrand.addEventListener('click', function() { navigateTo('storypilot'); _confirmMode('brand-product', 'copilot'); });
  var spFilm = document.getElementById('btn-sp-film');
  if (spFilm) spFilm.addEventListener('click', function() { navigateTo('storypilot'); _confirmMode('film-narrative', 'copilot'); });
  var spQuick = document.getElementById('btn-sp-quick');
  if (spQuick) spQuick.addEventListener('click', function() { navigateTo('storypilot'); _showScreen('bs-duration-picker'); });

  // Wire hero mode cards
  var brandCard = document.getElementById('bs-mode-brand');
  if (brandCard) brandCard.addEventListener('click', function() { _confirmMode('brand-product', 'copilot'); });

  var filmCard = document.getElementById('bs-mode-film');
  if (filmCard) filmCard.addEventListener('click', function() { _confirmMode('film-narrative', 'copilot'); });

  var quickCard = document.getElementById('bs-mode-quick');
  if (quickCard) quickCard.addEventListener('click', function() {
    var wizard = document.getElementById('bs-quick-wizard');
    if (wizard) { wizard.classList.remove('hidden'); wizard.style.animation = 'none'; wizard.offsetHeight; wizard.style.animation = ''; }
    quickCard.style.display = 'none';
  });

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

  // Wire product card screen (Brand/Product mode)
  _wireProductCard();

  // Wire narrator-choice screen (Brand/Film modes)
  _wireNarratorChoiceScreen();

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

  // Wire back button (chat → home)
  var backBtn = document.getElementById('bs-back-btn');
  if (backBtn) backBtn.addEventListener('click', function() {
    if (brainstormState.messages.length > 0) {
      if (!confirm('Discard this conversation and go back to home?')) return;
    }
    _clearSession();
    navigateTo('home');
  });

  // Wire final-screen back button
  var finalBackBtn = document.getElementById('bs-final-back-btn');
  if (finalBackBtn) finalBackBtn.addEventListener('click', function() {
    _showScreen('bs-chat');
  });

  // Wire new session button (→ home so user can pick mode)
  var newBtn = document.getElementById('bs-new-btn');
  if (newBtn) newBtn.addEventListener('click', function() {
    if (!confirm('Start a new brainstorm session? Current session will be lost.')) return;
    _clearSession();
    navigateTo('home');
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
    navigateTo('home');
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

  // Wire Send-to pipeline button
  var pipelineBtn = document.getElementById('bs-send-pipeline-btn');
  if (pipelineBtn) pipelineBtn.addEventListener('click', function() {
    _sendToPipeline(brainstormState.pipeline);
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

  _wireDurationPicker();

  // Restore session if available
  if (_loadSession()) {
    _restoreFromSession();
  }
}

function _wireDurationPicker() {
  document.querySelectorAll('.bs-dur-opt').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var key    = btn.dataset.key;
      var preset = DURATION_PRESETS[key];
      if (!preset) return;
      brainstormState.wizardAnswers = { duration: key, length: preset.group };
      _confirmMode('social', preset.pipeline);
    });
  });
  var backBtn = document.getElementById('bs-dur-back');
  if (backBtn) backBtn.addEventListener('click', function() {
    brainstormState.mode     = null;
    brainstormState.pipeline = null;
    brainstormState.wizardAnswers = {};
    navigateTo('home');
  });
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
  // Quick mode only — brand-product and film-narrative never enter here
  if (length === 'short') return { mode: 'autopilot', reason: type === 'tutorial' ? 'Short tutorials work well as a quick how-to reel.' : 'Short & punchy — perfect for a quick reel.' };
  if (length === 'long')  return { mode: 'copilot',   reason: type === 'tutorial' ? 'In-depth tutorials work best in long-form.' : 'In-depth content works best in long-form.' };
  if (type === 'social')  return { mode: 'autopilot', reason: 'Social clips land best under 90 seconds.' };
  return                         { mode: 'copilot',   reason: 'Tutorials and explainers need room to breathe.' };
}

function _confirmWizard(pipelineTarget) {
  // Quick mode only — splits script mode from pipeline destination
  var scriptMode = brainstormState.wizardAnswers.type || 'social';
  brainstormState.mode     = scriptMode;
  brainstormState.pipeline = pipelineTarget;
  _updateModeTag(scriptMode);
  _updateSendToButton(pipelineTarget);
  _showScreen('bs-chat');
  _renderGreeting();
}

function _confirmMode(mode, pipeline) {
  // Hero card entry point for brand-product and film-narrative
  brainstormState.mode     = mode;
  brainstormState.pipeline = pipeline;
  _updateModeTag(mode);
  _updateSendToButton(pipeline);
  // Brand-product shows product card first, then narrator choice.
  // Film-narrative goes straight to narrator choice.
  // Quick mode skips both — narrator is rare for short social content.
  if (mode === 'brand-product') {
    _showProductCard();
  } else if (mode === 'film-narrative') {
    _showNarratorChoice();
  } else {
    _showStylePicker(brainstormState.pipeline,
      function onBack() {
        brainstormState.mode     = null;
        brainstormState.pipeline = null;
        brainstormState.wizardAnswers = {};
        _showScreen('bs-duration-picker');
      },
      function onConfirm() {
        _showScreen('bs-chat');
        _renderGreeting();
      }
    );
  }
}

// Product card screen — shown before narrator choice for Brand/Product mode
function _showProductCard() {
  var pc = brainstormState.productCard || {};
  var subtype = pc.subtype || 'brand';

  // Pre-fill fields from saved state (session restore)
  var brandText    = document.getElementById('bs-pc-brand-text');
  var brandUrl     = document.getElementById('bs-pc-brand-url');
  var productText  = document.getElementById('bs-pc-product-text');
  var productUrl   = document.getElementById('bs-pc-product-url');
  var claim        = document.getElementById('bs-pc-claim');
  if (brandText)   brandText.value   = pc.brandText   || '';
  if (brandUrl)    brandUrl.value    = pc.brandUrl    || '';
  if (productText) productText.value = pc.productText || '';
  if (productUrl)  productUrl.value  = pc.productUrl  || '';
  if (claim)       claim.value       = pc.coreClaim   || '';

  // Apply subtype toggle
  _pcSetSubtype(subtype);
  _pcCheckReady();
  _showScreen('bs-product-card');
}

function _pcSetSubtype(subtype) {
  var brandSection   = document.getElementById('bs-pc-brand-section');
  var productSection = document.getElementById('bs-pc-product-section');
  var brandBtn       = document.getElementById('bs-pc-type-brand');
  var productBtn     = document.getElementById('bs-pc-type-product');
  var brandLabel     = document.getElementById('bs-pc-brand-label');
  var nameLabel      = document.getElementById('bs-pc-name-label');

  var isProduct = subtype === 'product';
  if (brandSection)   brandSection.classList.remove('hidden');
  if (productSection) productSection.classList.toggle('hidden', !isProduct);
  if (brandBtn)       brandBtn.classList.toggle('active', !isProduct);
  if (productBtn)     productBtn.classList.toggle('active', isProduct);
  if (nameLabel) nameLabel.innerHTML = (isProduct ? 'Product name' : 'Brand name') + ' <span class="bs-pc-required">*</span>';
  // Brand description field is optional when product is selected
  if (brandLabel) brandLabel.innerHTML = isProduct
    ? 'Brand / Company info <span class="bs-pc-required" style="opacity:0.5">(optional)</span>'
    : 'Brand / Company info <span class="bs-pc-required">*</span>';
}

function _pcCheckReady() {
  var subtype     = document.querySelector('.bs-pc-type-btn.active')?.dataset.type || 'brand';
  var name        = (document.getElementById('bs-pc-name')?.value         || '').trim();
  var brandText   = (document.getElementById('bs-pc-brand-text')?.value   || '').trim();
  var productText = (document.getElementById('bs-pc-product-text')?.value || '').trim();
  var claim       = (document.getElementById('bs-pc-claim')?.value        || '').trim();

  var ready = name.length > 0 && claim.length > 0 && (
    subtype === 'product' ? productText.length > 0 : brandText.length > 0
  );

  var btn = document.getElementById('bs-product-continue');
  if (btn) btn.disabled = !ready;
}

async function _pcExtract(urlInputId, textareaId, statusId) {
  var urlInput = document.getElementById(urlInputId);
  var textarea = document.getElementById(textareaId);
  var status   = document.getElementById(statusId);
  var url      = (urlInput?.value || '').trim();
  if (!url) { if (status) status.textContent = 'Enter a URL first.'; return; }

  if (status) status.textContent = 'Extracting…';
  var extractBtn = urlInput?.closest('.bs-narrator-field')?.querySelector('.bs-pc-extract-btn');
  if (extractBtn) extractBtn.disabled = true;

  try {
    var resp = await fetch('https://r.jina.ai/' + encodeURIComponent(url), {
      headers: { 'Accept': 'text/plain' }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var text = await resp.text();
    // Truncate to ~2500 chars to stay within token budget
    var trimmed = text.slice(0, 2500);
    if (textarea) textarea.value = trimmed;
    if (status) status.textContent = 'Extracted ' + trimmed.length + ' chars — edit if needed.';
    _pcCheckReady();
  } catch (e) {
    if (status) status.textContent = 'Could not extract — paste text instead.';
  } finally {
    if (extractBtn) extractBtn.disabled = false;
  }
}

function _wireProductCard() {
  // Type toggle
  ['bs-pc-type-brand', 'bs-pc-type-product'].forEach(function(id) {
    var btn = document.getElementById(id);
    if (btn && !btn._pcWired) {
      btn._pcWired = true;
      btn.addEventListener('click', function() {
        _pcSetSubtype(btn.dataset.type);
        _pcCheckReady();
      });
    }
  });

  // Input → readiness check
  ['bs-pc-name', 'bs-pc-brand-text', 'bs-pc-product-text', 'bs-pc-claim'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el && !el._pcWired) {
      el._pcWired = true;
      el.addEventListener('input', _pcCheckReady);
    }
  });

  // Extract buttons
  var brandExtract = document.getElementById('bs-pc-brand-extract');
  if (brandExtract && !brandExtract._pcWired) {
    brandExtract._pcWired = true;
    brandExtract.addEventListener('click', function() {
      _pcExtract('bs-pc-brand-url', 'bs-pc-brand-text', 'bs-pc-brand-status');
    });
  }
  var productExtract = document.getElementById('bs-pc-product-extract');
  if (productExtract && !productExtract._pcWired) {
    productExtract._pcWired = true;
    productExtract.addEventListener('click', function() {
      _pcExtract('bs-pc-product-url', 'bs-pc-product-text', 'bs-pc-product-status');
    });
  }

  // Back
  var backBtn = document.getElementById('bs-product-back');
  if (backBtn && !backBtn._pcWired) {
    backBtn._pcWired = true;
    backBtn.addEventListener('click', function() {
      brainstormState.mode       = null;
      brainstormState.pipeline   = null;
      brainstormState.productCard = null;
      navigateTo('home');
    });
  }

  // Continue
  var contBtn = document.getElementById('bs-product-continue');
  if (contBtn && !contBtn._pcWired) {
    contBtn._pcWired = true;
    contBtn.addEventListener('click', function() {
      var subtype = document.querySelector('.bs-pc-type-btn.active')?.dataset.type || 'brand';
      brainstormState.productCard = {
        subtype:     subtype,
        name:        (document.getElementById('bs-pc-name')?.value         || '').trim(),
        brandText:   (document.getElementById('bs-pc-brand-text')?.value   || '').trim(),
        brandUrl:    (document.getElementById('bs-pc-brand-url')?.value    || '').trim(),
        productText: (document.getElementById('bs-pc-product-text')?.value || '').trim(),
        productUrl:  (document.getElementById('bs-pc-product-url')?.value  || '').trim(),
        coreClaim:   (document.getElementById('bs-pc-claim')?.value        || '').trim(),
      };
      _showNarratorChoice();
    });
  }
}

// Narrator choice screen — shown before chat for Brand/Film modes
function _showNarratorChoice() {
  _showScreen('bs-narrator-choice');
  // Reset form to defaults
  var noRadio = document.querySelector('input[name="bs-narrator-enabled"][value="0"]');
  var details = document.getElementById('bs-narrator-details');
  var nameInput = document.getElementById('bs-narrator-name');
  if (noRadio) noRadio.checked = true;
  if (details) details.hidden = true;
  if (nameInput) nameInput.value = '';
  var voiceOnly = document.querySelector('input[name="bs-narrator-style"][value="voice-only"]');
  if (voiceOnly) voiceOnly.checked = true;
}

function _wireNarratorChoiceScreen() {
  var enabledRadios = document.querySelectorAll('input[name="bs-narrator-enabled"]');
  var details = document.getElementById('bs-narrator-details');
  enabledRadios.forEach(function(r) {
    if (r._wired) return;
    r._wired = true;
    r.addEventListener('change', function() {
      if (details) details.hidden = (r.value !== '1' || !r.checked);
    });
  });
  var backBtn = document.getElementById('bs-narrator-back');
  if (backBtn && !backBtn._wired) {
    backBtn._wired = true;
    backBtn.addEventListener('click', function() {
      brainstormState.mode = null;
      brainstormState.pipeline = null;
      brainstormState.narratorChoice = null;
      _showScreen('bs-hero');
    });
  }
  var contBtn = document.getElementById('bs-narrator-continue');
  if (contBtn && !contBtn._wired) {
    contBtn._wired = true;
    contBtn.addEventListener('click', function() {
      var enabled = document.querySelector('input[name="bs-narrator-enabled"]:checked');
      var enabledVal = enabled ? enabled.value === '1' : false;
      if (enabledVal) {
        var nameInput = document.getElementById('bs-narrator-name');
        var styleSel = document.querySelector('input[name="bs-narrator-style"]:checked');
        var name = nameInput ? (nameInput.value || '').trim() : '';
        var style = styleSel ? styleSel.value : 'voice-only';
        if (!name) {
          if (nameInput) { nameInput.focus(); nameInput.style.borderColor = 'var(--red, #d44)'; setTimeout(function(){ nameInput.style.borderColor = ''; }, 2000); }
          return;
        }
        brainstormState.narratorChoice = { enabled: true, name: name, onScreenStyle: style };
      } else {
        brainstormState.narratorChoice = { enabled: false };
      }
      var presetMode = brainstormState.mode === 'film-narrative' ? 'film' : 'brand';
      _showStylePicker(presetMode,
        function onBack() { _showNarratorChoice(); },
        function onConfirm() { _showScreen('bs-chat'); _renderGreeting(); }
      );
    });
  }
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

  var mode     = brainstormState.mode;
  var pipeline = brainstormState.pipeline;
  var wizCtx   = brainstormState.wizardAnswers;
  var lenLabel = { short: 'short & punchy (under 90s)', medium: 'medium length (1–5 min)', long: 'in-depth (5+ min)' }[wizCtx.length] || '';

  if (mode === 'brand-product') {
    // Show typing indicator immediately, then one LLM call for personalized greeting + chips
    _showTyping();
    _generateBrandGreeting();
    return;
  }

  var greeting;
  if (mode === 'film-narrative') {
    greeting = 'Hi! I\'m your Storypilot — let\'s develop your story together, from premise to scene structure.\n\n**What\'s the story? Give me the premise in one sentence — what happens, and to whom.**';
  } else if (pipeline === 'autopilot') {
    var typeLabel = { social: 'social media clip', tutorial: 'tutorial' }[wizCtx.type] || 'video';
    greeting = 'Hi! I\'m your Storypilot — here to help you shape a compelling **' + typeLabel + '** reel' + (lenLabel ? ' (' + lenLabel + ')' : '') + '.\n\n**What\'s the core idea or topic for this video?** One sentence is enough to get us started.';
  } else {
    var typeLabel2 = { social: 'social media clip', tutorial: 'tutorial/explainer' }[wizCtx.type] || 'video';
    greeting = 'Hi! I\'m your Storypilot — ready to help you build a **' + typeLabel2 + '**' + (lenLabel ? ' (' + lenLabel + ')' : '') + ' script.\n\n**What\'s the central story or message you want to tell?** Give me the big idea and we\'ll shape it together.';
  }

  brainstormState.messages.unshift({ role: '_greeting', content: greeting });
  _appendMessage('ai', greeting);
  _renderSuggestionChips(mode);
}

function _renderSuggestionChips(mode) {
  // brand-product and film-narrative get contextual chips after first reply — skip generic ones at greeting
  if (mode === 'brand-product' || mode === 'film-narrative') return;

  var log = document.getElementById('bs-chat-log');
  if (!log) return;
  var CHIPS = {
    'social':   ['Skincare routine', 'Travel vlog', 'Productivity tips'],
    'tutorial': ['How to start a podcast', 'Beginner\'s guide to budgeting', 'Learn Figma in 5 min'],
  };
  var chips = CHIPS[mode] || CHIPS['social'];

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

async function _generateBrandGreeting() {
  var log = document.getElementById('bs-chat-log');
  if (!log) return;

  var pc = brainstormState.productCard || {};
  var context = [
    'Video type: ' + (pc.subtype === 'product' ? 'product video' : 'brand video'),
    pc.name        ? 'Name: '    + pc.name                                : null,
    pc.brandText   ? 'Brand: '   + pc.brandText.slice(0, 400)             : null,
    pc.productText ? 'Product: ' + pc.productText.slice(0, 400)           : null,
    pc.coreClaim   ? 'Core claim: ' + pc.coreClaim.slice(0, 200)          : null,
  ].filter(Boolean).join('\n');

  var nameHint = pc.name ? ' for **' + pc.name + '**' : '';
  var fallbackGreeting = 'Got it! Let\'s find the sharpest angle' + nameHint + '.\n\n**What message do you want viewers to walk away with?**';

  try {
    var result = await callChatLLM({
      provider:     brainstormState.provider,
      messages:     [{ role: 'user', content: context }],
      systemPrompt: 'You are a brand video creative strategist. Given the product/brand info, respond with a brief personalized opening (2 sentences max: acknowledge what they have and identify the strongest opportunity) and 3 specific video angles to explore. Return JSON only — no prose outside the JSON:\n{"greeting":"...","chips":["...","...","..."]}',
      jsonMode:     false,
      maxTokens:    250
    });

    _hideTyping();

    var raw = result.text.trim();
    var parsed = null;
    var jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch (e) {}
    }

    var greetingText = (parsed && parsed.greeting) ? parsed.greeting : fallbackGreeting;
    var chips = (parsed && Array.isArray(parsed.chips) && parsed.chips.length) ? parsed.chips : null;

    brainstormState.messages.unshift({ role: '_greeting', content: greetingText });
    _appendMessage('ai', greetingText);

    if (chips) {
      var div = document.createElement('div');
      div.className = 'bs-chips';
      chips.slice(0, 3).forEach(function(label) {
        var btn = document.createElement('button');
        btn.className = 'bs-chip';
        btn.textContent = label;
        btn.addEventListener('click', function() {
          var input = document.getElementById('bs-input');
          if (input) { input.value = label; input.dispatchEvent(new Event('input')); input.focus(); }
          div.remove();
        });
        div.appendChild(btn);
      });
      log.appendChild(div);
    }
    _scrollChatToBottom();

  } catch (e) {
    _hideTyping();
    brainstormState.messages.unshift({ role: '_greeting', content: fallbackGreeting });
    _appendMessage('ai', fallbackGreeting);
    console.error('[brand greeting failed]', e && e.message ? e.message : e);
  }
}

async function _generateContextualChips() {
  var log = document.getElementById('bs-chat-log');
  if (!log) return;

  var context = brainstormState.messages
    .filter(function(m) { return m.role === 'user' || m.role === 'assistant'; })
    .slice(0, 4)
    .map(function(m) { return (m.role === 'user' ? 'User: ' : 'AI: ') + m.content.slice(0, 400); })
    .join('\n');

  try {
    var result = await callChatLLM({
      provider:     brainstormState.provider,
      messages:     [{ role: 'user', content: 'Based on this conversation, suggest 3 short follow-up directions. Return ONLY a JSON array of 3 strings under 60 chars each.\n\n' + context }],
      systemPrompt: 'Output only a JSON array of 3 short strings.',
      jsonMode:     false,
      maxTokens:    150
    });

    var raw = result.text.trim();
    var suggestions = null;
    var jsonMatch = raw.match(/\[[\s\S]*?\]/);
    if (jsonMatch) { try { suggestions = JSON.parse(jsonMatch[0]); } catch (e) {} }
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      suggestions = raw.split('\n')
        .map(function(l) { return l.replace(/^[\d\-\*\.\s]+/, '').replace(/^["']|["']$/g, '').trim(); })
        .filter(function(l) { return l.length > 4 && l.length < 100; })
        .slice(0, 3);
    }
    if (!suggestions || suggestions.length === 0) return;

    var div = document.createElement('div');
    div.className = 'bs-chips';
    suggestions.slice(0, 3).forEach(function(label) {
      var btn = document.createElement('button');
      btn.className = 'bs-chip';
      btn.textContent = label;
      btn.addEventListener('click', function() {
        var input = document.getElementById('bs-input');
        if (input) { input.value = label; input.dispatchEvent(new Event('input')); input.focus(); }
        div.remove();
      });
      div.appendChild(btn);
    });
    log.appendChild(div);
    _scrollChatToBottom();
  } catch (e) {
    console.warn('[contextual chips]', e);
  }
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

    // Detect if LLM incorrectly output the final JSON script in a chat message
    var _jsonBlockMatch = result.text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i)
      || (result.text.trim().startsWith('{') ? [null, result.text.trim()] : null);
    if (_jsonBlockMatch) {
      try {
        var _parsed = JSON.parse(_jsonBlockMatch[1]);
        if (_parsed && Array.isArray(_parsed.scenes) && _parsed.scenes.length) {
          // Valid script JSON in a chat message — redirect to proper storyboard render
          brainstormState.finalScript = _parsed;
          brainstormState.finalised   = true;
          _saveSession();
          _hideTyping();
          _renderFinalScript(_parsed);
          _showScreen('bs-final');
          _summariseSession();
          if (sendBtn) sendBtn.disabled = false;
          return;
        }
      } catch(_) { /* not valid JSON, render normally */ }
    }

    // Extract [[CHIPS: ...]] marker from AI response if present
    var chipsMarker = result.text.match(/\[\[CHIPS:\s*(.+?)\]\]/i);
    var displayText = chipsMarker ? result.text.replace(/\n*\[\[CHIPS:[^\]]*\]\]/i, '').trimEnd() : result.text;
    var inlineChips = chipsMarker ? chipsMarker[1].split('|').map(function(s) { return s.trim(); }).filter(Boolean) : null;

    // Store clean text (without marker) in message history
    brainstormState.messages[brainstormState.messages.length - 1].content = displayText;

    _appendMessage('ai', displayText);

    if (inlineChips && inlineChips.length) {
      var log = document.getElementById('bs-chat-log');
      if (log) {
        var div = document.createElement('div');
        div.className = 'bs-chips';
        inlineChips.forEach(function(label) {
          var btn = document.createElement('button');
          btn.className = 'bs-chip';
          btn.textContent = label;
          btn.addEventListener('click', function() {
            var input = document.getElementById('bs-input');
            if (input) { input.value = label; input.dispatchEvent(new Event('input')); input.focus(); }
            div.remove();
          });
          div.appendChild(btn);
        });
        log.appendChild(div);
        _scrollChatToBottom();
      }
    }

    _updateMeta();
    _checkFinalisable();
    _saveSession();

    // After first user reply in film-narrative, generate contextual suggestion chips
    if (brainstormState.mode === 'film-narrative' && brainstormState.messageCount === 1) {
      _generateContextualChips();
    }

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

function _resolvePromptKey() {
  var mode     = brainstormState.mode;
  var pipeline = brainstormState.pipeline;
  // brand-product and film-narrative have their own dedicated prompts
  if (mode === 'brand-product' || mode === 'film-narrative') return mode;
  // social/tutorial resolve by pipeline (autopilot = short-form, copilot = long-form)
  return pipeline === 'autopilot' ? 'autopilot' : 'copilot';
}

function _buildSystemPrompt() {
  var mode = brainstormState.mode;
  var base = SYSTEM_PROMPTS[_resolvePromptKey()];
  var ctx  = brainstormState.wizardAnswers;

  if (mode === 'brand-product') {
    var pc = brainstormState.productCard;
    if (pc) {
      var pcLines = [
        'Video subtype: ' + (pc.subtype === 'product' ? 'product video' : 'brand video'),
        pc.name        ? (pc.subtype === 'product' ? 'Product name: ' : 'Brand name: ') + pc.name : null,
        pc.brandText   ? 'Brand context: ' + pc.brandText.slice(0, 800)   : null,
        pc.brandUrl    ? 'Brand URL: '     + pc.brandUrl                   : null,
        pc.productText ? 'Product context: ' + pc.productText.slice(0, 800) : null,
        pc.productUrl  ? 'Product URL: '   + pc.productUrl                 : null,
        pc.coreClaim   ? 'Core claim: '    + pc.coreClaim                  : null,
      ].filter(Boolean).join('\n');
      var missingFields = [
        !pc.name        ? (pc.subtype === 'product' ? 'product name' : 'brand name') : null,
        !pc.brandText   && pc.subtype !== 'product' ? 'brand description'            : null,
        !pc.productText && pc.subtype === 'product' ? 'product description'          : null,
        !pc.coreClaim   ? 'core claim (what viewers should walk away knowing)'        : null,
      ].filter(Boolean);

      base += '\n\n[PRODUCT CONTEXT — already collected. Treat these as facts you have — do NOT re-ask:\n' + pcLines + ']'
        + (missingFields.length ? '\n\n[MISSING INFO — you may ask for these naturally during conversation, one at a time: ' + missingFields.join(', ') + ']' : '\n\n[All key product info is collected. Jump straight into developing the narrative.]')
        + '\n\n[CHIPS INSTRUCTION: When you offer the user a set of specific options (e.g. emotional tone, video angle, structure, audience), append a chips marker on its own line at the very end of your response: [[CHIPS: Option A | Option B | Option C | Option D]]. Max 4 options, each under 40 characters. ALWAYS use chips for Emotional Tone (Aspirational | Practical | Urgent | Playful). Use chips for any clear multiple-choice decision. Never use chips for open-ended questions. The user can click a chip to pre-fill their input or type a custom reply.]';
    } else {
      base += '\n\n[User context: video type = brand/product. Pipeline: Copilot.]';
    }
  } else if (mode === 'film-narrative') {
    base += '\n\n[User context: video type = film/narrative. Pipeline: Copilot. Skip re-asking these.]\n\n[CHIPS INSTRUCTION: When you offer the user a set of specific options to choose from (e.g. genre, tone, structure, POV), append a chips marker on its own line at the very end of your response, formatted exactly: [[CHIPS: Option A | Option B | Option C]]. Max 4 options, each under 40 characters. Only use this when presenting a clear multiple-choice decision — not for open-ended questions. The user can click a chip to pre-fill their reply, or ignore them and type freely.]';
  } else {
    var _preset = ctx.duration && DURATION_PRESETS[ctx.duration];
    if (_preset) {
      base += '\n\n[DURATION TARGET: ' + _preset.label + ']\n'
        + 'Total spoken words across all scenes combined: ~' + _preset.totalWords + ' words.\n'
        + 'Scene count: exactly ' + _preset.scenes + ' scenes.\n'
        + 'Per-scene word budget: ~' + _preset.perScene + ' words of ' + _preset.field + ' per scene.\n'
        + (_preset.group === 'short'
            ? 'Keep every scene tight — no padding, no filler. Each word earns its place.'
            : 'Give each scene room to develop — thin narration will make the video feel rushed.')
        + '\nDo not re-ask about duration — it is fixed.';
    }
  }

  // Narrator choice — locked at chat start for Brand/Film. Shapes the conversation.
  var nc = brainstormState.narratorChoice;
  if (nc) {
    if (nc.enabled) {
      base += '\n\n[NARRATOR MODE — IMPORTANT]\n'
        + 'This video has a single narrator named "' + nc.name + '" (' + (nc.onScreenStyle === 'talking-head' ? 'talking head, appears between scenes' : 'voice-only, never on screen') + '). The narrator voices ALL audio.\n'
        + 'STRICT RULES for this conversation and the final script:\n'
        + '- Treat the narrator as the single voice telling the story.\n'
        + '- Collect narration prose per scene (what the narrator says).\n'
        + '- Do NOT collect character dialogue. Characters may be defined as visual references but they DO NOT speak.\n'
        + '- In the finalised JSON, every scene\'s "dialogue" array MUST be empty []. The "narration" field carries the spoken content.\n'
        + '- Treat the narrator name as fixed — do not rename or substitute.';
    } else {
      base += '\n\n[CHARACTER MODE]\n'
        + 'This video has NO narrator. Characters speak their own dialogue. Collect dialogue per scene as natural conversation. Use the existing dialogue array structure.';
    }
  }

  if (brainstormState.sessionSummary) {
    base += '\n\n[CONTINUATION SESSION — previous session summary:\n' + brainstormState.sessionSummary + '\nDo NOT re-ask anything already decided above. Pick up exactly where the user left off.]';
  }
  // Phase 4 — inject locked style when set (Phases 5/6/7 write this; Phase 4 wires the read path)
  var vs = brainstormState.visualStyle;
  var vt = brainstormState.visualTreatment;
  if ((vs && vs.description) || (vt && vt.description)) {
    var styleParts = [
      vs && vs.description   ? 'Sub-style: ' + vs.description   : null,
      vs && vs.motionGrammar ? 'Motion grammar: ' + vs.motionGrammar : null,
      vt && vt.description   ? 'Visual treatment: ' + vt.description : null,
    ].filter(Boolean);
    base += '\n\n[VISUAL STYLE LOCKED — reference in all scene descriptions and suggestions:\n' + styleParts.join('. ') + '\nDo NOT suggest changing the style — it is final for this session.]';
  }
  return base;
}

function _buildFinalisePrompt() {
  var base   = FINALISE_PROMPTS[_resolvePromptKey()];
  var preset = brainstormState.wizardAnswers.duration && DURATION_PRESETS[brainstormState.wizardAnswers.duration];
  if (!preset) return base;
  return base
    + '\n\nWORD COUNT RULE (MANDATORY): Total words across all `' + preset.field + '` fields must sum to approximately '
    + preset.totalWords + ' words (±15%). Count the words before outputting. '
    + 'Scene count must be exactly ' + preset.scenes + '.';
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
    // v1 backwards compat — pipeline field didn't exist
    if (!brainstormState.pipeline) brainstormState.pipeline = brainstormState.mode;
    return true;
  } catch(_) { return false; }
}

function _clearSession() {
  localStorage.removeItem(BS_STORAGE_KEY);
  // Reset to defaults
  brainstormState.mode           = null;
  brainstormState.pipeline       = null;
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
  brainstormState.productCard     = null;
  brainstormState.narratorChoice  = null;
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
  _updateSendToButton(brainstormState.pipeline);

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
  var TAG_LABELS = {
    'autopilot':      '⚡ Autopilot',
    'copilot':        '🎬 Copilot',
    'social':         '📱 Social',
    'tutorial':       '📚 Tutorial',
    'brand-product':  '🏷 Brand / Product',
    'film-narrative': '🎬 Film / Narrative',
  };
  var tag = document.getElementById('bs-mode-tag');
  if (!tag) return;
  var label = TAG_LABELS[mode];
  if (label) { tag.textContent = label; tag.style.display = ''; }
  else { tag.style.display = 'none'; }
}

function _updateSendToButton(pipeline) {
  var btn      = document.getElementById('bs-send-pipeline-btn');
  var nameSpan = document.getElementById('bs-handoff-pipeline-name');
  var iconSpan = btn ? btn.querySelector('.bs-handoff-icon') : null;
  if (!btn || !nameSpan) return;
  if (pipeline === 'autopilot') {
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
  var finalPrompt  = _buildFinalisePrompt();
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
    .concat([{ role: 'user', content: _buildFinalisePrompt() }]);

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
  var target = brainstormState.pipeline === 'autopilot' ? 'Autopilot ⚡' : 'Copilot 🎬';
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
    _sendToPipeline(brainstormState.pipeline);
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

  var shape = _detectScriptShape(s);
  var parts = [];
  parts.push('<h3>' + _esc(s.title || 'Untitled script') + '</h3>');

  // Meta pills
  var pills = [];
  if (s.tone)        pills.push(_esc(s.tone));
  if (s.platform)    pills.push(_esc(s.platform));
  if (s.estDuration) pills.push(_esc(s.estDuration));
  if (s.audience)    pills.push(_esc(s.audience));
  if (s.genre)       pills.push(_esc(s.genre));
  if (pills.length) {
    parts.push('<div class="bs-meta-pills">' + pills.map(function(p) { return '<span class="bs-meta-pill">' + p + '</span>'; }).join('') + '</div>');
  }

  if (shape === 'brand-product') {
    // Brand Brief block
    parts.push('<div class="bs-brand-brief">');
    if (s.brand)   parts.push('<div class="bs-brief-row"><span class="bs-brief-label">Brand</span><span>' + _esc(s.brand) + '</span></div>');
    if (s.product) parts.push('<div class="bs-brief-row"><span class="bs-brief-label">Product</span><span>' + _esc(s.product) + '</span></div>');
    if (s.core_claim) parts.push('<div class="bs-brief-row"><span class="bs-brief-label">Core claim</span><span>' + _esc(s.core_claim) + '</span></div>');
    if (s.narrative_structure) parts.push('<div class="bs-brief-row"><span class="bs-brief-label">Structure</span><span>' + _esc(s.narrative_structure) + '</span></div>');
    if (s.proof_points && s.proof_points.length) {
      parts.push('<div class="bs-brief-row"><span class="bs-brief-label">Proof points</span><ul class="bs-proof-list">' +
        s.proof_points.map(function(p) { return '<li>' + _esc(p) + '</li>'; }).join('') + '</ul></div>');
    }
    parts.push('</div>');
    // Hook + scenes
    if (s.hook) parts.push('<div class="bs-scene"><div class="bs-scene-num">Hook</div><div class="bs-scene-voice">' + _esc(s.hook) + '</div></div>');
    (s.scenes || []).forEach(function(sc, i) {
      var roleTag = sc.role ? ' <span class="bs-role-badge">' + _esc(sc.role) + '</span>' : '';
      parts.push('<div class="bs-scene">');
      parts.push('<div class="bs-scene-num">Scene ' + (sc.n || i + 1) + (sc.timeRange ? ' · ' + sc.timeRange : '') + roleTag + '</div>');
      if (sc.visual) parts.push('<div class="bs-scene-vis">🎬 ' + _esc(sc.visual) + '</div>');
      if (sc.voice)  parts.push('<div class="bs-scene-voice">🎤 ' + _esc(sc.voice) + '</div>');
      parts.push('</div>');
    });
    if (s.cta) parts.push('<div class="bs-scene"><div class="bs-scene-num">CTA</div><div class="bs-scene-voice">' + _esc(s.cta) + '</div></div>');

  } else if (shape === 'film-narrative') {
    // Premise
    if (s.premise) parts.push('<p class="bs-film-premise">' + _esc(s.premise) + '</p>');
    // Characters
    if (s.characters && s.characters.length) {
      parts.push('<div class="bs-section-label">Characters</div><div class="bs-character-grid">');
      s.characters.forEach(function(ch) {
        parts.push('<div class="bs-character-card">');
        parts.push('<div class="bs-char-name">' + _esc(ch.name) + ' <span class="bs-char-role">(' + _esc(ch.role) + ')</span></div>');
        if (ch.want)     parts.push('<div class="bs-char-detail">Wants: ' + _esc(ch.want) + '</div>');
        if (ch.obstacle) parts.push('<div class="bs-char-detail">Obstacle: ' + _esc(ch.obstacle) + '</div>');
        parts.push('</div>');
      });
      parts.push('</div>');
    }
    // Act structure
    if (s.acts && s.acts.length) {
      parts.push('<div class="bs-section-label">Act Structure</div>');
      s.acts.forEach(function(act) {
        parts.push('<div class="bs-act-row"><span class="bs-act-badge">Act ' + act.n + '</span><span class="bs-act-label">' + _esc(act.label) + '</span><span class="bs-act-summary">' + _esc(act.summary || '') + '</span></div>');
      });
    }
    // Scenes
    (s.scenes || []).forEach(function(sc, i) {
      parts.push('<div class="bs-scene">');
      parts.push('<div class="bs-scene-num">Scene ' + (sc.n || i + 1) + (sc.act ? ' · Act ' + sc.act : '') + (sc.timeRange ? ' · ' + sc.timeRange : '') + '</div>');
      if (sc.visual)    parts.push('<div class="bs-scene-vis">🎬 ' + _esc(sc.visual) + '</div>');
      if (sc.narration) parts.push('<div class="bs-scene-voice">🎤 ' + _esc(sc.narration) + '</div>');
      (sc.dialogue || []).forEach(function(dl) {
        parts.push('<div class="bs-dialogue-line">💬 <strong>' + _esc(dl.character) + ':</strong> "' + _esc(dl.line) + '"</div>');
      });
      if (sc.mood) parts.push('<div class="bs-scene-vis" style="color:var(--lp-mute)">🎵 ' + _esc(sc.mood) + '</div>');
      parts.push('</div>');
    });

  } else if (shape === 'autopilot') {
    if (s.hook) { parts.push('<div class="bs-scene"><div class="bs-scene-num">Hook</div><div class="bs-scene-voice">' + _esc(s.hook) + '</div></div>'); }
    (s.scenes || []).forEach(function(sc, i) {
      parts.push('<div class="bs-scene">');
      parts.push('<div class="bs-scene-num">Scene ' + (sc.n || i + 1) + (sc.timeRange ? ' · ' + sc.timeRange : '') + '</div>');
      if (sc.visual) parts.push('<div class="bs-scene-vis">🎬 ' + _esc(sc.visual) + '</div>');
      if (sc.voice)  parts.push('<div class="bs-scene-voice">🎤 ' + _esc(sc.voice) + '</div>');
      parts.push('</div>');
    });
    if (s.cta) parts.push('<div class="bs-scene"><div class="bs-scene-num">CTA</div><div class="bs-scene-voice">' + _esc(s.cta) + '</div></div>');

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

// ── SECTION 12b: Style picker ──────────────────────────────────────────────────

function _showStylePicker(presetMode, onBack, onConfirm) {
  var presetMap   = (window.SUB_STYLE_PRESETS && window.SUB_STYLE_PRESETS[presetMode]) || {};
  var presetKeys  = Object.keys(presetMap);
  var presets     = presetKeys.map(function(k) { return Object.assign({ _key: k }, presetMap[k]); });
  var treatMap    = window.VISUAL_TREATMENTS || {};
  var treatKeys   = Object.keys(treatMap);

  var grid       = document.getElementById('bs-sp-grid');
  var sel        = document.getElementById('bs-sp-treatment');
  var confirmBtn = document.getElementById('bs-sp-confirm');
  var backBtn    = document.getElementById('bs-sp-back');
  var skipBtn    = document.getElementById('bs-sp-skip');
  if (!grid || !sel || !confirmBtn || !backBtn || !skipBtn) return;

  brainstormState.visualStyle = null;

  grid.innerHTML = presets.map(function(p, i) {
    var name = p._key.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    var desc = (p.description || '').slice(0, 80);
    return '<button class="bs-sp-preset" data-idx="' + i + '">'
      + '<div class="bs-sp-preset-name">' + _esc(name) + '</div>'
      + '<div class="bs-sp-preset-desc">' + _esc(desc) + '</div>'
      + '</button>';
  }).join('');

  grid.querySelectorAll('.bs-sp-preset').forEach(function(btn) {
    btn.addEventListener('click', function() {
      grid.querySelectorAll('.bs-sp-preset').forEach(function(b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      brainstormState.visualStyle = presets[+btn.dataset.idx] || null;
      document.getElementById('bs-sp-confirm').disabled = false;
    });
  });

  sel.innerHTML = '<option value="">— None —</option>' + treatKeys.map(function(k, i) {
    var label = k.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    return '<option value="' + i + '">' + _esc(label) + '</option>';
  }).join('');
  sel.value = '';

  // Replace buttons to clear previous listeners
  function _rewire(oldId, handler) {
    var old = document.getElementById(oldId);
    if (!old) return;
    var fresh = old.cloneNode(true);
    old.parentNode.replaceChild(fresh, old);
    fresh.addEventListener('click', handler);
    return fresh;
  }

  _rewire('bs-sp-back', onBack);
  _rewire('bs-sp-skip', function() {
    brainstormState.visualStyle    = null;
    brainstormState.visualTreatment = null;
    onConfirm();
  });
  var freshConfirm = _rewire('bs-sp-confirm', function() {
    var tidx = parseInt(sel.value, 10);
    brainstormState.visualTreatment = (!isNaN(tidx) && treatKeys[tidx])
      ? Object.assign({ _key: treatKeys[tidx] }, treatMap[treatKeys[tidx]])
      : null;
    onConfirm();
  });
  if (freshConfirm) freshConfirm.disabled = true;

  _showScreen('bs-style-picker');
}

// ── SECTION 13: Handoff ───────────────────────────────────────────────────────

function _sendToPipeline(target) {
  if (!brainstormState.finalScript) return;

  var fileName = _downloadScript(brainstormState.finalScript, target);

  window.__storiHandoff = {
    target:          target,
    plainText:       _formatScriptToPlainText(brainstormState.finalScript),
    fileName:        fileName,
    source:          'brainstorm',
    finalScript:     brainstormState.finalScript,
    visualStyle:     brainstormState.visualStyle    || null,
    visualTreatment: brainstormState.visualTreatment || null
  };

  if (target === 'autopilot') {
    navigateTo('reel');
  } else {
    navigateTo('create');
  }
}

// ── SECTION 14: Helpers ───────────────────────────────────────────────────────

function _detectScriptShape(s) {
  if (!s) return 'copilot';
  if (s.characters !== undefined && s.acts !== undefined) return 'film-narrative';
  if (s.core_claim !== undefined)                          return 'brand-product';
  if (s.hook !== undefined && s.concept === undefined)     return 'autopilot';
  return 'copilot';
}

function _formatScriptToPlainText(s) {
  if (!s) return '';
  var shape = _detectScriptShape(s);

  if (shape === 'film-narrative') {
    var lines = [];
    (s.scenes || []).forEach(function(sc) {
      if (sc.narration) lines.push(sc.narration);
      (sc.dialogue || []).forEach(function(dl) { if (dl.line) lines.push(dl.character + ': ' + dl.line); });
    });
    return lines.join('\n\n');
  }

  if (shape === 'brand-product') {
    var lines = [];
    if (s.hook) lines.push(s.hook);
    (s.scenes || []).forEach(function(sc) { if (sc.voice) lines.push(sc.voice); });
    if (s.cta) lines.push(s.cta);
    return lines.join(' ');
  }

  if (shape === 'autopilot') {
    var lines = [];
    if (s.hook) lines.push(s.hook);
    (s.scenes || []).forEach(function(sc) { if (sc.voice) lines.push(sc.voice); });
    if (s.cta) lines.push(s.cta);
    return lines.join(' ');
  }

  // copilot
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
  var MODE_LABEL = { 'autopilot': 'Autopilot', 'copilot': 'Copilot', 'brand-product': 'Brand/Product', 'film-narrative': 'Film/Narrative', 'social': 'Social', 'tutorial': 'Tutorial' };
  var tier     = PROVIDER_LABEL[brainstormState.provider] || 'Quick';
  var modeLabel = MODE_LABEL[brainstormState.mode] || 'Storypilot';
  var date     = new Date().toISOString().slice(0, 10);
  var shape    = _detectScriptShape(s);
  var out      = [];

  out.push('# ' + (s.title || 'Untitled script'), '');

  if (shape === 'brand-product') {
    var meta = [];
    if (s.brand)   meta.push('**Brand:** ' + s.brand);
    if (s.product) meta.push('**Product:** ' + s.product);
    if (s.audience) meta.push('**Audience:** ' + s.audience);
    if (s.tone)    meta.push('**Tone:** ' + s.tone);
    if (s.estDuration) meta.push('**Duration:** ' + s.estDuration);
    if (meta.length) out.push(meta.join(' · '), '');
    out.push('---', '', '## Brand Brief', '');
    if (s.core_claim) out.push('**Core claim:** ' + s.core_claim, '');
    if (s.narrative_structure) out.push('**Narrative structure:** ' + s.narrative_structure, '');
    if (s.proof_points && s.proof_points.length) {
      out.push('**Proof points:**');
      s.proof_points.forEach(function(p) { out.push('- ' + p); });
      out.push('');
    }
    out.push('---', '');
    if (s.hook) out.push('## Hook (0–3s)', '**Voice:** ' + s.hook, '');
    (s.scenes || []).forEach(function(sc, i) {
      out.push('## Scene ' + (sc.n || i + 1) + (sc.role ? ' — ' + sc.role : '') + (sc.timeRange ? ' (' + sc.timeRange + ')' : ''));
      if (sc.visual) out.push('**Visual:** ' + sc.visual);
      if (sc.voice)  out.push('**Voice:** ' + sc.voice);
      out.push('');
    });
    if (s.cta) out.push('## Call to Action', '**Voice:** ' + s.cta, '');

  } else if (shape === 'film-narrative') {
    var fmeta = [];
    if (s.genre)  fmeta.push('**Genre:** ' + s.genre);
    if (s.tone)   fmeta.push('**Tone:** ' + s.tone);
    if (s.estDuration) fmeta.push('**Duration:** ' + s.estDuration);
    if (s.structure)   fmeta.push('**Structure:** ' + s.structure);
    if (fmeta.length) out.push(fmeta.join(' · '), '');
    out.push('---', '');
    if (s.premise) out.push('## Premise', s.premise, '');
    if (s.characters && s.characters.length) {
      out.push('## Characters', '');
      s.characters.forEach(function(ch) {
        out.push('**' + ch.name + '** (' + ch.role + ')');
        if (ch.want)     out.push('- Wants: ' + ch.want);
        if (ch.obstacle) out.push('- Obstacle: ' + ch.obstacle);
        out.push('');
      });
    }
    if (s.acts && s.acts.length) {
      out.push('## Act Structure', '');
      s.acts.forEach(function(act) { out.push('**Act ' + act.n + ' — ' + act.label + ':** ' + (act.summary || '')); });
      out.push('');
    }
    out.push('---', '');
    (s.scenes || []).forEach(function(sc, i) {
      out.push('## Scene ' + (sc.n || i + 1) + (sc.act ? ' — Act ' + sc.act : '') + (sc.timeRange ? ' (' + sc.timeRange + ')' : ''));
      if (sc.visual)    out.push('**Visual:** ' + sc.visual);
      if (sc.narration) out.push('**Narration:** ' + sc.narration);
      (sc.dialogue || []).forEach(function(dl) { out.push('**' + dl.character + ':** "' + dl.line + '"'); });
      if (sc.mood)      out.push('**Mood:** ' + sc.mood);
      out.push('');
    });

  } else if (shape === 'autopilot') {
    var meta = [];
    if (s.tone)        meta.push('**Tone:** ' + s.tone);
    if (s.platform)    meta.push('**Platform:** ' + s.platform);
    if (s.estDuration) meta.push('**Duration:** ' + s.estDuration);
    if (meta.length)   out.push(meta.join(' · '), '');
    out.push('---', '');
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
    var meta = [];
    if (s.tone)        meta.push('**Tone:** ' + s.tone);
    if (s.estDuration) meta.push('**Duration:** ' + s.estDuration);
    if (meta.length)   out.push(meta.join(' · '), '');
    out.push('---', '');
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
  out.push('*Created with Storypilot · ' + modeLabel + ' · ' + tier + ' · ' + date + '*');

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
  ['bs-product-card', 'bs-narrator-choice', 'bs-style-picker', 'bs-duration-picker', 'bs-chat', 'bs-final'].forEach(function(sid) {
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
