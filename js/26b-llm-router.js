/* ════════════════════════════════════════════════════════════════
   26b-llm-router.js — Multi-provider LLM router for Storypilot
   -----------------------------------------------------------------
   Public API:  callChatLLM({ provider, messages, systemPrompt, jsonMode, maxTokens })
   Returns:     { text, inputTokens, outputTokens, costUsd, model }
   ════════════════════════════════════════════════════════════════ */

// ── SECTION 1: Public API ─────────────────────────────────────────────────────

async function callChatLLM({ provider, messages, systemPrompt, jsonMode = false, maxTokens = 300 }) {
  if (provider === 'gemini')    return _callGemini(messages, systemPrompt, jsonMode, maxTokens);
  if (provider === 'openai')    return _callOpenAI(messages, systemPrompt, jsonMode, maxTokens);
  if (provider === 'anthropic') return _callAnthropic(messages, systemPrompt, jsonMode, maxTokens);
  throw new Error('Unknown provider: ' + provider);
}

// ── SECTION 2: Provider implementations ──────────────────────────────────────

async function _callGemini(messages, systemPrompt, jsonMode, maxTokens) {
  // Reuse callGeminiAPI() + getTextModels() from 17a-create-api.js — same model list, same key, same error handling.
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
      temperature: 0.95,
      maxOutputTokens: maxTokens,
      ...(jsonMode ? { response_mime_type: 'application/json' } : {}),
      thinkingConfig: { thinkingBudget: jsonMode ? 2048 : 1024 }
    }
  };

  // callGeminiAPI handles key lookup, model fallback, and rate-limit retries
  const data = await callGeminiAPI(getTextModels(), body);
  return _normaliseGemini(data);
}

async function _callOpenAI(messages, systemPrompt, jsonMode, maxTokens) {
  const apiKey = localStorage.getItem('stori_openai_key');
  if (!apiKey) throw new Error('NO_OPENAI_KEY');

  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages  // already in { role: 'user'|'assistant', content } shape
    ],
    max_tokens: maxTokens,
    temperature: 0.95,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error('RATE_LIMIT');
    if (resp.status === 401) throw new Error('NO_OPENAI_KEY');
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI ${resp.status}`);
  }

  const data = await resp.json();
  return _normaliseOpenAI(data);
}

async function _callAnthropic(messages, systemPrompt, jsonMode, maxTokens) {
  const apiKey = localStorage.getItem('stori_anthropic_key');
  if (!apiKey) throw new Error('NO_ANTHROPIC_KEY');

  // Anthropic doesn't have native JSON mode — append instruction to system prompt
  const sys = jsonMode
    ? systemPrompt + '\n\nIMPORTANT: Respond with valid JSON only. No markdown, no preamble, no explanation.'
    : systemPrompt;

  const body = {
    model: 'claude-sonnet-4-20250514',
    system: sys,
    messages,  // user/assistant shape — already correct
    max_tokens: maxTokens,
    temperature: 0.95
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error('RATE_LIMIT');
    if (resp.status === 401) throw new Error('NO_ANTHROPIC_KEY');
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic ${resp.status}`);
  }

  const data = await resp.json();
  return _normaliseAnthropic(data);
}

// ── SECTION 3: Response normalisers ──────────────────────────────────────────

function _normaliseGemini(data) {
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const inputTokens  = data.usageMetadata?.promptTokenCount    || 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
  const cachedTokens = data.usageMetadata?.cachedContentTokenCount || 0;
  const hitPct = inputTokens > 0 ? Math.round((cachedTokens / inputTokens) * 100) : 0;
  console.log(`[Gemini cache] in=${inputTokens} cached=${cachedTokens} (${hitPct}% hit) out=${outputTokens}`);
  const costUsd = _trackCost(inputTokens, outputTokens, 'gemini');
  return { text, inputTokens, outputTokens, cachedTokens, costUsd, model: 'gemini-2.5-flash' };
}

function _normaliseOpenAI(data) {
  const text = data.choices?.[0]?.message?.content || '';
  const inputTokens  = data.usage?.prompt_tokens     || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  const costUsd = _trackCost(inputTokens, outputTokens, 'openai');
  return { text, inputTokens, outputTokens, costUsd, model: data.model || 'gpt-4o' };
}

function _normaliseAnthropic(data) {
  const text = data.content?.[0]?.text || '';
  const inputTokens  = data.usage?.input_tokens  || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  const costUsd = _trackCost(inputTokens, outputTokens, 'anthropic');
  return { text, inputTokens, outputTokens, costUsd, model: data.model || 'claude-sonnet-4-20250514' };
}

// ── SECTION 4: Cost integration ───────────────────────────────────────────────

function _trackCost(inTok, outTok, provider) {
  // trackTokenCost is defined in 01-core.js and available globally
  if (typeof trackTokenCost === 'function') {
    return trackTokenCost(inTok, outTok, provider);
  }
  return 0;
}

// ── SECTION 5: Error classification helpers ───────────────────────────────────

// Returns a user-friendly message for known error codes
function friendlyRouterError(err, provider) {
  const msg = err.message || '';
  if (msg.includes('No API key'))  return 'Set your Gemini API key in Copilot or Autopilot — it\'s shared across all of Stori.';
  if (msg === 'NO_OPENAI_KEY')    return 'Set your OpenAI key in Settings to use the Pro tier.';
  if (msg === 'NO_ANTHROPIC_KEY') return 'Set your Anthropic key in Settings to use the Premium tier.';
  if (msg === 'RATE_LIMIT')       return 'Rate limit hit — please wait a moment and try again.';
  return `${provider} error: ${msg}`;
}
