// ══════════════════════════════════════════
//  CREATE CONTENT — Languages & Send to Editor
// ══════════════════════════════════════════

// ── Multi-Language Voiceover ──
const SUPPORTED_LANGUAGES = [
  { code: 'ar', name: 'Arabic',              flag: '🇸🇦', gcloudVoice: null, gcloudLang: null },
  { code: 'bn', name: 'Bengali',             flag: '🇧🇩', gcloudVoice: null, gcloudLang: null },
  { code: 'zh', name: 'Chinese (Simplified)',flag: '🇨🇳', gcloudVoice: null, gcloudLang: null },
  { code: 'nl', name: 'Dutch',               flag: '🇳🇱', gcloudVoice: null, gcloudLang: null },
  { code: 'en', name: 'English',             flag: '🇺🇸', gcloudVoice: 'en-US-Standard-D', gcloudLang: 'en-US' },
  { code: 'fr', name: 'French',              flag: '🇫🇷', gcloudVoice: 'fr-FR-Standard-A', gcloudLang: 'fr-FR' },
  { code: 'de', name: 'German',              flag: '🇩🇪', gcloudVoice: null, gcloudLang: null },
  { code: 'gu', name: 'Gujarati',            flag: '🇮🇳', gcloudVoice: null, gcloudLang: null },
  { code: 'hi', name: 'Hindi',               flag: '🇮🇳', gcloudVoice: 'hi-IN-Standard-A', gcloudLang: 'hi-IN' },
  { code: 'id', name: 'Indonesian',          flag: '🇮🇩', gcloudVoice: null, gcloudLang: null },
  { code: 'it', name: 'Italian',             flag: '🇮🇹', gcloudVoice: null, gcloudLang: null },
  { code: 'ja', name: 'Japanese',            flag: '🇯🇵', gcloudVoice: null, gcloudLang: null },
  { code: 'kn', name: 'Kannada',             flag: '🇮🇳', gcloudVoice: null, gcloudLang: null },
  { code: 'ko', name: 'Korean',              flag: '🇰🇷', gcloudVoice: null, gcloudLang: null },
  { code: 'ml', name: 'Malayalam',           flag: '🇮🇳', gcloudVoice: 'ml-IN-Standard-A', gcloudLang: 'ml-IN' },
  { code: 'mr', name: 'Marathi',             flag: '🇮🇳', gcloudVoice: null, gcloudLang: null },
  { code: 'pl', name: 'Polish',              flag: '🇵🇱', gcloudVoice: null, gcloudLang: null },
  { code: 'pt', name: 'Portuguese',          flag: '🇧🇷', gcloudVoice: null, gcloudLang: null },
  { code: 'pa', name: 'Punjabi',             flag: '🇮🇳', gcloudVoice: null, gcloudLang: null },
  { code: 'ro', name: 'Romanian',            flag: '🇷🇴', gcloudVoice: null, gcloudLang: null },
  { code: 'es', name: 'Spanish',             flag: '🇪🇸', gcloudVoice: 'es-ES-Standard-A', gcloudLang: 'es-ES' },
  { code: 'ta', name: 'Tamil',               flag: '🇮🇳', gcloudVoice: 'ta-IN-Standard-A', gcloudLang: 'ta-IN' },
  { code: 'te', name: 'Telugu',              flag: '🇮🇳', gcloudVoice: 'te-IN-Standard-A', gcloudLang: 'te-IN' },
  { code: 'tr', name: 'Turkish',             flag: '🇹🇷', gcloudVoice: null, gcloudLang: null },
];

let languageTracks = []; // [{lang, langCode, audioBuffer, translatedText, status}]

// ─── Pure helpers (callable from canvas pipeline) ───────────
//
// computePhotoTimings — for a given language track, compute the per-scene
// timeline that scales each scene's duration in proportion to its translated
// word count, then map per-photo and per-subtitle timings into that timeline.
// Pure (no globals): pass scenes + track + photoItems-shape array + originalSubtitles.
// Returns { subtitleTexts, photoTimings, subtitleTimings, sceneTimes }.
function computePhotoTimings(scenes, track, photoItemsShape, origSubtitles) {
  scenes = scenes || [];
  photoItemsShape = photoItemsShape || [];
  origSubtitles = origSubtitles || [];
  if (!track || !track.translatedText || !track.audioBuffer) {
    return { subtitleTexts: [], photoTimings: [], subtitleTimings: [], sceneTimes: [] };
  }

  const origWords  = scenes.reduce((sum, s) => sum + (s.text || '').split(/\s+/).length, 0);
  const transWords = track.translatedText.split(/\s+/);
  let wordIdx = 0;
  const subtitleTexts = scenes.map(s => {
    if (!s.text || s.text.trim() === '') return '';
    const sceneWordCount = Math.max(1, Math.round(((s.text || '').split(/\s+/).length / Math.max(1, origWords)) * transWords.length));
    const portion = transWords.slice(wordIdx, wordIdx + sceneWordCount).join(' ');
    wordIdx += sceneWordCount;
    return portion;
  });

  const trackDur = track.audioBuffer.duration;
  const sceneTransWords = subtitleTexts.map(t => (t || '').split(/\s+/).filter(w => w).length || 1);
  const totalTransWords = sceneTransWords.reduce((a, b) => a + b, 0) || 1;
  const rawDurations = sceneTransWords.map(tw => (tw / totalTransWords) * trackDur);
  const sceneTimes = [];
  let cumStart = 0;
  for (let i = 0; i < rawDurations.length; i++) {
    sceneTimes.push({ startTime: cumStart, duration: rawDurations[i] });
    cumStart += rawDurations[i];
  }

  const sceneIdxOf = (t) => {
    let idx = scenes.findIndex(s => t >= s.startTime && t < s.endTime);
    if (idx < 0) idx = scenes.length - 1;
    return idx;
  };
  const remapTiming = (orig) => {
    const idx = sceneIdxOf(orig.startTime);
    const origScene = scenes[idx];
    const newScene  = sceneTimes[idx];
    if (!origScene || !newScene) return { startTime: orig.startTime, duration: orig.duration };
    const origSceneDur  = origScene.endTime - origScene.startTime;
    const offsetInScene = origSceneDur > 0 ? (orig.startTime - origScene.startTime) / origSceneDur : 0;
    const durRatio      = origSceneDur > 0 ? newScene.duration / origSceneDur : 1;
    return {
      startTime: newScene.startTime + offsetInScene * newScene.duration,
      duration:  orig.duration * durRatio,
    };
  };

  const photoTimings    = photoItemsShape.map(remapTiming);
  const subtitleTimings = origSubtitles.map(remapTiming);

  return { subtitleTexts, photoTimings, subtitleTimings, sceneTimes };
}

// generateSubtitleTrack — extract the per-language subtitle generation from
// the inline upfront pipeline so the canvas Subtitle node can call it
// post-export. Builds subtitle word timings against an existing audio buffer.
// Returns { subtitles: [{ text, startTime, duration }] }.
async function generateSubtitleTrack(langCode, scenes, audioBuffer, key) {
  if (!langCode || !scenes || !audioBuffer) return { subtitles: [] };
  if (langCode === 'none' || langCode === 'off') return { subtitles: [] };

  // Reuse the existing translation + word-distribution pipeline if available
  if (typeof translateText !== 'function') return { subtitles: [] };

  const fullText = scenes.map(s => s.text || '').join(' ');
  const langName = (typeof SUPPORTED_LANGUAGES !== 'undefined'
    ? SUPPORTED_LANGUAGES.find(l => l.code === langCode)?.name
    : null) || langCode;

  let translated = '';
  try {
    translated = await translateText(fullText, langName, key);
  } catch (e) {
    console.warn('generateSubtitleTrack: translate failed', e);
    return { subtitles: [] };
  }

  // Distribute translated words evenly across audioBuffer duration, anchored to scene boundaries
  const fakeTrack = { translatedText: translated, audioBuffer };
  const { subtitleTexts, sceneTimes } = computePhotoTimings(scenes, fakeTrack, [], []);
  const subtitles = scenes.map((s, i) => ({
    text: subtitleTexts[i] || '',
    startTime: sceneTimes[i]?.startTime ?? s.startTime,
    duration:  sceneTimes[i]?.duration  ?? s.duration,
  }));
  return { subtitles, translatedText: translated };
}

// Expose for canvas
if (typeof window !== 'undefined') {
  window.computePhotoTimings   = computePhotoTimings;
  window.generateSubtitleTrack = generateSubtitleTrack;
}

const createLanguageStep = $('create-language-step');
const languageCheckboxes = $('language-checkboxes');
const btnGenerateLanguages = $('btn-generate-languages');
const languageStatus = $('language-status');
const languageResults = $('language-results');

// Populate language add buttons (+ icon per language)
let pendingLanguages = new Set(); // langCodes added but not yet generated

function updateLangButtons() {
  const hasPending = pendingLanguages.size > 0;
  btnGenerateLanguages.disabled = !hasPending;
  // Disable Send to Editor when there are pending (ungenerated) languages
  if (btnCreateSendEditor) btnCreateSendEditor.disabled = hasPending || !createScenes?.some(s => s.imgDataUrl);
}

function addLanguageToQueue(langCode) {
  if (pendingLanguages.has(langCode)) return;
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === langCode);
  if (!lang) return;
  pendingLanguages.add(langCode);
  // Show a pending card with voice + subtitle selects
  renderLanguageCard(lang, 'pending', 'Ready to generate');
  // Hide the add button
  const addBtn = $(`lang-add-${langCode}`);
  if (addBtn) addBtn.style.display = 'none';
  updateLangButtons();
}

function removeLanguageFromQueue(langCode) {
  pendingLanguages.delete(langCode);
  // Remove pending card
  const card = $(`lang-card-${langCode}`);
  if (card) card.remove();
  // Also remove from languageTracks if it was generated
  languageTracks = languageTracks.filter(t => t.langCode !== langCode);
  // Show the add button again
  const addBtn = $(`lang-add-${langCode}`);
  if (addBtn) addBtn.style.display = '';
  updateLangButtons();
}

for (const lang of SUPPORTED_LANGUAGES) {
  const btn = document.createElement('button');
  btn.className = 'btn-xs';
  btn.id = `lang-add-${lang.code}`;
  btn.style.cssText = 'cursor:pointer; padding:4px 10px; font-size:0.75rem;';
  btn.innerHTML = `+ ${lang.flag} ${lang.name}`;
  btn.addEventListener('click', () => addLanguageToQueue(lang.code));
  languageCheckboxes.appendChild(btn);
}

async function translateText(text, targetLang, apiKey) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Translate the following text to ${targetLang}. Return ONLY the translated text, nothing else.\n\n${text}` }] }],
        generationConfig: { temperature: 0.3 }
      })
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Translation error ${resp.status}`);
  }
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Audio player state for language cards
let langPlayerSource = null;
let langPlayerPlaying = false;

function stopLangPlayer() {
  if (langPlayerSource) {
    try { langPlayerSource.stop(); } catch(e) {}
    langPlayerSource = null;
  }
  langPlayerPlaying = false;
  // Reset all play buttons
  document.querySelectorAll('.lang-play-btn').forEach(b => b.textContent = '▶');
}

function playLangAudio(buffer, playBtn) {
  stopLangPlayer();
  langPlayerSource = ensureAudioCtx().createBufferSource();
  langPlayerSource.buffer = buffer;
  langPlayerSource.connect(ensureAudioCtx().destination);
  langPlayerSource.start();
  langPlayerPlaying = true;
  playBtn.textContent = '⏸';
  langPlayerSource.onended = () => {
    langPlayerPlaying = false;
    playBtn.textContent = '▶';
    langPlayerSource = null;
  };
}

function buildAudioControls(id) {
  return `<div class="lang-controls" style="display:flex; gap:3px;">
    <button class="lang-play-btn" data-player="${id}" style="font-size:0.7rem; padding:2px 6px; cursor:pointer; background:var(--bg-input); border:1px solid var(--border); border-radius:3px; color:var(--text-primary);">▶</button>
    <button class="lang-stop-btn" data-player="${id}" style="font-size:0.7rem; padding:2px 6px; cursor:pointer; background:var(--bg-input); border:1px solid var(--border); border-radius:3px; color:var(--text-primary);">⏹</button>
  </div>`;
}

function buildSubtitleSelect(langCode, langName) {
  // Build options: Original + all supported languages + None (no duplicates)
  const seen = new Set();
  let options = '<option value="none" selected>None</option>';
  options += '<option value="original">Original</option>';
  seen.add('original');
  seen.add('none');
  // Add all supported languages
  for (const lang of SUPPORTED_LANGUAGES) {
    if (!seen.has(lang.code)) {
      options += `<option value="${lang.code}">${lang.name}</option>`;
      seen.add(lang.code);
    }
  }
  return `<label style="font-size:0.65rem; color:var(--text-muted); display:flex; align-items:center; gap:3px;">
    Sub:
    <select class="lang-sub-select" data-lang="${langCode}" style="font-size:0.65rem; padding:2px 4px; background:var(--bg-input); border:1px solid var(--border); border-radius:3px; color:var(--text-primary);">
      ${options}
    </select>
  </label>`;
}

const TTS_VOICES = [
  { id: 'Kore', label: 'Kore — Firm', cat: 'narration' },
  { id: 'Charon', label: 'Charon — Informative', cat: 'narration' },
  { id: 'Fenrir', label: 'Fenrir — Storytelling', cat: 'narration' },
  { id: 'Callirrhoe', label: 'Callirrhoe — Calm', cat: 'narration' },
  { id: 'Puck', label: 'Puck — Upbeat', cat: 'casual' },
  { id: 'Zephyr', label: 'Zephyr — Bright', cat: 'casual' },
  { id: 'Leda', label: 'Leda — Youthful', cat: 'casual' },
  { id: 'Aoede', label: 'Aoede — Breezy', cat: 'casual' },
  { id: 'Orus', label: 'Orus — Corporate', cat: 'formal' },
  { id: 'Autonoe', label: 'Autonoe — Presentations', cat: 'formal' },
];

function buildVoiceSelect(langCode) {
  const cats = { narration: '🎙️ Narration', casual: '🎵 Casual', formal: '💼 Formal' };
  let options = '';
  for (const [catId, catLabel] of Object.entries(cats)) {
    options += `<optgroup label="${catLabel}">`;
    for (const v of TTS_VOICES.filter(v => v.cat === catId)) {
      options += `<option value="${v.id}" ${v.id === 'Kore' ? 'selected' : ''}>${v.label}</option>`;
    }
    options += '</optgroup>';
  }
  return `<label style="font-size:0.65rem; color:var(--text-muted); display:flex; align-items:center; gap:3px;">
    Voice:
    <select class="lang-voice-select" data-lang="${langCode}" style="font-size:0.65rem; padding:2px 4px; background:var(--bg-input); border:1px solid var(--border); border-radius:3px; color:var(--text-primary);">
      ${options}
    </select>
  </label>`;
}

// Generate subtitles for a specific audio track based on selected subtitle language
// Stores in createGeneratedSubtitles map: langCode → subtitleItems array
let createGeneratedSubtitles = new Map();
let createSubtitleSelections = {}; // trackId → selected subtitle langCode (e.g. {primary: 'en', en: 'ta'})
let createVoiceSelections = {}; // langCode → selected voice name (e.g. {en: 'Fenrir', hi: 'Charon'})
let langGenerating = false;

async function generateSubtitlesForTrack(trackId, subtitleLang) {
  createSubtitleSelections[trackId] = subtitleLang;
  if (subtitleLang === 'none') {
    createGeneratedSubtitles.delete(trackId);
    updateSubtitlePreviewCount();
    return;
  }

  if (!createScenes) return;

  // Show processing on the language card and left panel
  const subLang = SUPPORTED_LANGUAGES.find(l => l.code === trackId);
  if (subLang) {
    renderLanguageCard(subLang, 'working', 'Generating subtitles…');
    if (typeof updateCreateAgent === 'function') updateCreateAgent('voiceover', 'running', `Generating subtitles for ${subLang.name}…`);
  } else if (trackId === 'primary') {
    const primaryCard = $('language-primary') && $('language-primary').querySelector('.language-card');
    if (primaryCard) {
      primaryCard.className = 'language-card';
      const statusEl = primaryCard.querySelector('.lang-status');
      if (statusEl) statusEl.textContent = 'Generating subtitles…';
    }
    if (typeof updateCreateAgent === 'function') updateCreateAgent('voiceover', 'running', 'Generating subtitles…');
  }

  langGenerating = true;
  updateCreateButtons();

  let sceneTexts;
  if (subtitleLang === 'original') {
    // Use original transcript directly
    sceneTexts = createScenes.map(s => s.text);
  } else {
    // Check if we have translated text from a language track
    const track = languageTracks.find(t => t.langCode === subtitleLang);
    if (track && track.translatedText) {
      // Split translated text proportionally across scenes
      const origWords = createScenes.reduce((sum, s) => sum + (s.text || '').split(/\s+/).length, 0);
      const transWords = track.translatedText.split(/\s+/);
      let wordIdx = 0;
      sceneTexts = createScenes.map(s => {
        const sceneWordCount = Math.max(1, Math.round(((s.text || '').split(/\s+/).length / Math.max(1, origWords)) * transWords.length));
        const portion = transWords.slice(wordIdx, wordIdx + sceneWordCount).join(' ');
        wordIdx += sceneWordCount;
        return portion;
      });
    } else {
      // No existing translation — need to translate now
      const key = getCreateGeminiKey();
      const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === subtitleLang);
      const langName = langInfo ? langInfo.name : subtitleLang;
      if (key) {
        try {
          const fullText = createScenes.map(s => s.text).filter(Boolean).join('\n\n');
          const translated = await translateText(fullText, langName, key);
          const origWords = createScenes.reduce((sum, s) => sum + (s.text || '').split(/\s+/).length, 0);
          const transWords = translated.split(/\s+/);
          let wordIdx = 0;
          sceneTexts = createScenes.map(s => {
            const sceneWordCount = Math.max(1, Math.round(((s.text || '').split(/\s+/).length / Math.max(1, origWords)) * transWords.length));
            const portion = transWords.slice(wordIdx, wordIdx + sceneWordCount).join(' ');
            wordIdx += sceneWordCount;
            return portion;
          });
        } catch(e) {
          console.warn('Subtitle translation error:', e);
          sceneTexts = createScenes.map(s => s.text); // fallback to original
        }
      } else {
        sceneTexts = createScenes.map(s => s.text);
      }
    }
  }

  const subs = [];
  let subId = 1;
  for (let i = 0; i < createScenes.length; i++) {
    const scene = createScenes[i];
    const text = sceneTexts[i];
    if (!text || text.trim() === '' || text === '[continued]') continue;
    const sentences = text.split(/(?<=[.!?।])\s+/).filter(s => s.trim().length > 0);
    if (sentences.length <= 1) {
      subs.push({ id: subId++, text: text.trim(), startTime: scene.startTime, duration: scene.duration });
    } else {
      const chunks = [];
      for (let j = 0; j < sentences.length; j += 2) {
        chunks.push(sentences.slice(j, j + 2).join(' '));
      }
      const chunkDur = scene.duration / chunks.length;
      for (let j = 0; j < chunks.length; j++) {
        subs.push({ id: subId++, text: chunks[j].trim(), startTime: scene.startTime + j * chunkDur, duration: chunkDur });
      }
    }
  }
  createGeneratedSubtitles.set(trackId, subs);
  langGenerating = false;
  updateCreateButtons();
  updateSubtitlePreviewCount();

  // Restore card to done and update left panel
  const voiceCount = languageTracks.filter(t => t.status === 'done').length;
  const subCount = createGeneratedSubtitles.size;
  const parts = [];
  if (voiceCount > 0) parts.push(`${voiceCount} voice${voiceCount > 1 ? 's' : ''} ready`);
  if (subCount > 0) parts.push(`${subCount} subtitle track${subCount > 1 ? 's' : ''}`);
  if (subLang) {
    const track = languageTracks.find(t => t.langCode === trackId);
    const doneLabel = track ? `Done (${fmtShort(track.audioBuffer.duration)})` : 'Done';
    renderLanguageCard(subLang, 'done', doneLabel);
  } else if (trackId === 'primary') {
    const primaryCard = $('language-primary') && $('language-primary').querySelector('.language-card');
    if (primaryCard) {
      primaryCard.className = 'language-card done';
      const statusEl = primaryCard.querySelector('.lang-status');
      const label = createInputMode === 'text' ? 'English (Generated TTS)' : 'Original Audio';
      if (statusEl) statusEl.textContent = `Primary · ${createAudioBuffer ? fmtShort(createAudioBuffer.duration) : ''}`;
    }
  }
  if (typeof updateCreateAgent === 'function') updateCreateAgent('voiceover', 'done', parts.join(' · ') || 'Done');
}

function updateSubtitlePreviewCount() {
}

function renderPrimaryAudioCard() {
  const container = $('language-primary');
  if (!container || !createAudioBuffer) return;
  const narrator = window.createJobState && window.createJobState.narrator;
  const isNarratorLocked = !!(narrator && narrator.locked);
  const label = isNarratorLocked
    ? `Narrator (${createInputMode === 'text' ? 'Generated TTS' : 'Original Audio'})`
    : (createInputMode === 'text' ? 'English (Generated TTS)' : 'Original Audio');
  const flag = '🎙️';
  container.innerHTML = `
    <div class="language-card done">
      <span class="lang-name">${flag} ${label}</span>
      <span class="lang-status">Primary · ${fmtShort(createAudioBuffer.duration)}</span>
      ${buildSubtitleSelect('original', 'Original')}
      ${buildAudioControls('primary')}
    </div>
  `;
  container.querySelector('.lang-play-btn').addEventListener('click', (e) => {
    if (langPlayerPlaying && langPlayerSource) { stopLangPlayer(); return; }
    playLangAudio(createAudioBuffer, e.target);
  });
  container.querySelector('.lang-stop-btn').addEventListener('click', stopLangPlayer);
  const subSelect = container.querySelector('.lang-sub-select');
  if (subSelect) {
    // Restore previous selection
    if (createSubtitleSelections['primary']) subSelect.value = createSubtitleSelections['primary'];
    subSelect.addEventListener('change', () => {
      generateSubtitlesForTrack('primary', subSelect.value);
    });
  }
}

function renderLanguageCard(lang, status, detail) {
  let card = $(`lang-card-${lang.code}`);
  if (!card) {
    card = document.createElement('div');
    card.className = 'language-card';
    card.id = `lang-card-${lang.code}`;
    languageResults.appendChild(card);
  }
  card.className = `language-card ${status === 'done' ? 'done' : status === 'error' ? 'error' : ''}`;
  const track = languageTracks.find(t => t.langCode === lang.code);
  const controls = buildAudioControls(lang.code);
  const subSelect = (status === 'done' || status === 'pending') ? buildSubtitleSelect(lang.code, lang.name) : '';
  const voiceSelect = buildVoiceSelect(lang.code);
  const removeBtn = (status === 'pending' || status === 'done' || status === 'error')
    ? `<button class="lang-remove-btn" data-lang="${lang.code}" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:0.8rem; padding:0 4px;" title="Remove">✕</button>`
    : '';
  card.innerHTML = `
    ${removeBtn}
    <span class="lang-name">${lang.flag} ${lang.name}</span>
    <span class="lang-status">${detail || status}</span>
    ${voiceSelect}
    ${subSelect}
    ${controls}
  `;
  // Remove button
  const rmBtn = card.querySelector('.lang-remove-btn');
  if (rmBtn) rmBtn.addEventListener('click', () => removeLanguageFromQueue(lang.code));
  // Voice select
  const voiceEl = card.querySelector('.lang-voice-select');
  if (voiceEl) {
    const savedVoice = createVoiceSelections[lang.code] || (track && track.voiceName) || 'Kore';
    voiceEl.value = savedVoice;
    voiceEl.addEventListener('change', () => {
      createVoiceSelections[lang.code] = voiceEl.value;
      if (track) track.voiceName = voiceEl.value;
    });
  }
  // Subtitle select — for pending and done cards
  const subEl = card.querySelector('.lang-sub-select');
  if (subEl) {
    const savedSub = createSubtitleSelections[lang.code] || (track ? track.subtitleLang : null) || 'none';
    subEl.value = savedSub;
    subEl.addEventListener('change', () => {
      createSubtitleSelections[lang.code] = subEl.value;
      if (track) { track.subtitleLang = subEl.value; generateSubtitlesForTrack(lang.code, subEl.value); }
    });
  }
  const playBtn = card.querySelector('.lang-play-btn');
  const stopBtn = card.querySelector('.lang-stop-btn');
  if (status === 'done' && track) {
    if (playBtn) playBtn.addEventListener('click', (e) => {
      if (langPlayerPlaying && langPlayerSource) { stopLangPlayer(); return; }
      playLangAudio(track.audioBuffer, e.target);
    });
    if (stopBtn) stopBtn.addEventListener('click', stopLangPlayer);
    pendingLanguages.delete(lang.code);
    updateLangButtons();
  } else {
    if (playBtn) playBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
  }
}

btnGenerateLanguages.addEventListener('click', async () => {
  const key = getCreateGeminiKey();
  if (!key) { languageStatus.textContent = 'Enter Gemini API key first'; return; }
  if (!createScenes || createScenes.length === 0) return;

  // Generate for pending (added but not yet generated) languages
  const selectedLangs = SUPPORTED_LANGUAGES.filter(l => pendingLanguages.has(l.code));
  if (selectedLangs.length === 0) return;

  btnGenerateLanguages.disabled = true;
  langGenerating = true;
  updateCreateButtons();
  if (typeof updateCreateAgent === 'function') updateCreateAgent('voiceover', 'running', `Generating ${selectedLangs.length} language${selectedLangs.length > 1 ? 's' : ''}…`);
  const fullText = createScenes.map(s => s.text).filter(Boolean).join('\n\n');

  // Capture voice selections BEFORE re-rendering cards
  const voiceSelections = {};
  for (const lang of selectedLangs) {
    const voiceEl = document.querySelector(`.lang-voice-select[data-lang="${lang.code}"]`);
    voiceSelections[lang.code] = voiceEl ? voiceEl.value : 'Kore';
  }

  for (let li = 0; li < selectedLangs.length; li++) {
    const lang = selectedLangs[li];
    const voiceName = voiceSelections[lang.code];
    const langProgress = `${lang.name} (${li + 1}/${selectedLangs.length})`;
    if (typeof updateCreateAgent === 'function') updateCreateAgent('voiceover', 'running', `Generating ${langProgress}…`);
    try {
      renderLanguageCard(lang, 'working', 'Translating...');
      const translated = await translateText(fullText, lang.name, key);

      renderLanguageCard(lang, 'working', `Generating voice (${voiceName})...`);
      let audioBuffer;
      try {
        // Try full text first
        const ttsResult = await generateTTSGemini(translated, voiceName, key);
        ({ audioBuffer } = await decodeBase64Audio(ttsResult.base64, ttsResult.mimeType));
      } catch(ttsErr) {
        // Full text failed — chunk by ~3 min segments based on sentence boundaries
        renderLanguageCard(lang, 'working', 'Text too long — generating in chunks...');
        const sentences = translated.split(/(?<=[.!?।।])\s+/).filter(s => s.trim());
        // Estimate ~3 min of speech per chunk (~2500 bytes for multibyte, ~3500 for latin)
        const isMultibyte = /[\u0900-\u0DFF\u0B80-\u0BFF]/.test(translated); // Hindi, Tamil, Telugu, etc.
        const maxChunkBytes = isMultibyte ? 2500 : 3500;
        const chunks = [];
        let current = '';
        for (const sentence of sentences) {
          const test = current ? current + ' ' + sentence : sentence;
          if (new Blob([test]).size > maxChunkBytes && current) {
            chunks.push(current);
            current = sentence;
          } else {
            current = test;
          }
        }
        if (current) chunks.push(current);

        const chunkBuffers = [];
        for (let c = 0; c < chunks.length; c++) {
          renderLanguageCard(lang, 'working', `Generating chunk ${c + 1}/${chunks.length}...`);
          const chunkResult = await generateTTSGemini(chunks[c], voiceName, key);
          const { audioBuffer: chunkBuf } = await decodeBase64Audio(chunkResult.base64, chunkResult.mimeType);
          chunkBuffers.push(chunkBuf);
        }

        // Concatenate audio buffers
        const totalLength = chunkBuffers.reduce((sum, b) => sum + b.length, 0);
        const sampleRate = chunkBuffers[0].sampleRate;
        const channels = chunkBuffers[0].numberOfChannels;
        const merged = ensureAudioCtx().createBuffer(channels, totalLength, sampleRate);
        let offset = 0;
        for (const buf of chunkBuffers) {
          for (let ch = 0; ch < channels; ch++) {
            merged.getChannelData(ch).set(buf.getChannelData(ch), offset);
          }
          offset += buf.length;
        }
        audioBuffer = merged;
      }

      // Gently match duration — cap at 1.15x to preserve natural speech
      const targetDur = createAudioBuffer ? createAudioBuffer.duration : audioBuffer.duration;
      const rate = audioBuffer.duration / targetDur;
      if (rate > 1.02 && rate <= 1.15) {
        // Small difference — safe to resample
        renderLanguageCard(lang, 'working', 'Matching duration...');
        const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, Math.round(targetDur * audioBuffer.sampleRate), audioBuffer.sampleRate);
        const src = offlineCtx.createBufferSource();
        src.buffer = audioBuffer;
        src.playbackRate.value = rate;
        src.connect(offlineCtx.destination);
        src.start();
        audioBuffer = await offlineCtx.startRendering();
      } else if (rate > 1.15) {
        // Too fast — keep natural duration, don't distort
        console.log(`[TTS] ${lang.name}: skipping duration match (${rate.toFixed(2)}x would distort speech)`);
      }

      // Remove existing track for this language if re-generating
      languageTracks = languageTracks.filter(t => t.langCode !== lang.code);
      languageTracks.push({
        lang: lang.name,
        langCode: lang.code,
        audioBuffer,
        translatedText: translated,
        voiceName,
        subtitleLang: 'none',
        status: 'done'
      });
      trackCost('ttsPerLang', 1);
      renderLanguageCard(lang, 'done', `Done (${fmtShort(audioBuffer.duration)})`);
    } catch(e) {
      console.error(`Language ${lang.name} error:`, e);
      // Retry once
      try {
        renderLanguageCard(lang, 'working', 'Retrying...');
        const retryVoiceEl = document.querySelector(`.lang-voice-select[data-lang="${lang.code}"]`);
        const retryVoice = retryVoiceEl ? retryVoiceEl.value : 'Kore';
        const retranslated = await translateText(fullText, lang.name, key);
        const retryResult = await generateTTSGemini(retranslated, retryVoice, key);
        const { audioBuffer: retryBuf } = await decodeBase64Audio(retryResult.base64, retryResult.mimeType);
        languageTracks = languageTracks.filter(t => t.langCode !== lang.code);
        languageTracks.push({ lang: lang.name, langCode: lang.code, audioBuffer: retryBuf, translatedText: retranslated, voiceName: retryVoice, subtitleLang: 'none', status: 'done' });
        trackCost('ttsPerLang', 1);
        renderLanguageCard(lang, 'done', `Done (${fmtShort(retryBuf.duration)})`);
      } catch(e2) {
        renderLanguageCard(lang, 'error', `Failed after 2 attempts: ${friendlyApiError(e2.message)}`);
        pendingLanguages.delete(lang.code); // stop blocking send-to-editor
      }
    }
  }

  btnGenerateLanguages.disabled = false;
  langGenerating = false;
  updateCreateButtons();
  updateLangButtons();
  const doneTracks = languageTracks.filter(t => t.status === 'done');
  const failedCount = selectedLangs.length - doneTracks.filter(t => selectedLangs.some(l => l.code === t.langCode)).length;
  const subCount = createGeneratedSubtitles ? createGeneratedSubtitles.size : 0;
  const voiceCount = doneTracks.length;
  const summaryParts = [];
  if (voiceCount > 0) summaryParts.push(`${voiceCount} voice${voiceCount > 1 ? 's' : ''} ready`);
  if (subCount > 0) summaryParts.push(`${subCount} subtitle track${subCount > 1 ? 's' : ''}`);
  if (failedCount > 0) summaryParts.push(`${failedCount} failed`);
  const summaryText = summaryParts.join(' · ') || 'Done';
  if (typeof updateCreateAgent === 'function') {
    const agentStatus = failedCount === selectedLangs.length ? 'error' : 'done';
    updateCreateAgent('voiceover', agentStatus, summaryText);
  }
});

// Send to Editor
btnCreateSendEditor.addEventListener('click', async () => {
  if (!createAudioBuffer || !createScenes) return;

  // Canvas gate enforcement: if scenes carry instance data, every section needs a 🎯 video (animated mode)
  if (typeof CanvasState !== 'undefined' && createVideoMode === 'animated' &&
      createScenes.some(s => Array.isArray(s.storyboardInstances))) {
    CanvasState.syncAllMirrors(createScenes, 'animated');
    const gates = CanvasState.validateGates(createScenes, 'animated');
    if (!gates.renderEnabled) {
      alert('Cannot send to editor:\n\n' + gates.renderBlockers.join('\n') + '\n\nUse the canvas Final Render node to fix.');
      return;
    }
  }

  // Validate: count scenes with images (#5 + #14)
  const withImages = createScenes.filter(s => s.imgDataUrl).length;
  const totalScenes = createScenes.length;
  const failedScenes = createScenes.filter(s => s.status === 'error').length;
  const pendingScenes = createScenes.filter(s => s.status === 'pending').length;

  if (withImages === 0) {
    alert('No images generated yet. Generate at least one image before sending to editor.');
    return;
  }

  if (withImages < totalScenes) {
    let msg = `Sending ${withImages} of ${totalScenes} scenes to editor.`;
    if (failedScenes > 0) msg += `\n${failedScenes} scene(s) failed — you can retry them.`;
    if (pendingScenes > 0) msg += `\n${pendingScenes} scene(s) not yet generated.`;
    msg += '\n\nScenes without images will be skipped. Continue?';
    if (!await showConfirm(msg, 'Continue', true)) return;
  }

  // Round-trip merge (option-b). Snapshot the existing photo/video timeline so
  // we can preserve user edits (transition, motion / Ken Burns, in/out trims)
  // when re-sending from canvas. Match by (sceneIdx, imageInstanceId|videoInstanceId);
  // fall back to sceneIdx alone so edits survive a variant swap.
  // textItems / subtitleItems / their DOM are NOT cleared here — text overlays are
  // editor-only and free-form captions must survive a re-send.
  const oldPhotos = photoItems.slice();
  const oldVideos = videoTimelineItems.slice();

  currentBuffer = createAudioBuffer;
  photoItems = [];
  videoTimelineItems = [];
  narratorTimelineItems = [];
  blockElements.clear();
  if (typeof videoBlockElements !== 'undefined' && videoBlockElements.clear) videoBlockElements.clear();
  timelineContainer.querySelectorAll('.photo-block').forEach(el => el.remove());
  if (typeof videoTimelineContainer !== 'undefined') {
    videoTimelineContainer.querySelectorAll?.('.video-block').forEach(el => el.remove());
  }
  undoStack = [];
  nextPhotoId = Math.max(1, ...oldPhotos.map(p => Number(p.id) || 0)) + 1;
  nextVideoTimelineId = Math.max(1, ...oldVideos.map(v => Number(v.id) || 0)) + 1;
  selectedPhotoIds.clear();

  // Add generated images/videos to timeline
  for (let sceneIdx = 0; sceneIdx < createScenes.length; sceneIdx++) {
    const scene = createScenes[sceneIdx];
    if (!scene.imgDataUrl) continue;
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = scene.imgDataUrl;
    });

    // Resolve canvas active path → asset ids (per ADR-2)
    const activeSB  = scene.storyboardInstances?.find(s => s.isActive) || scene.storyboardInstances?.[0];
    const activeImg = activeSB?.imageInstances?.find(i => i.isRenderActive) || activeSB?.imageInstances?.[0];
    const activeVid = scene.videoInstances?.find(v => v.isRenderActive);
    const imgId = activeImg?.id || null;
    const vidId = activeVid?.id || null;
    const sourceImgId = activeVid?.sourceImageInstanceId || imgId;

    // Narrator overlay clip — only if this scene's frontRole is 'narrator' and a narrator clip exists.
    const narrV = (scene.videoInstances || []).find(v => v.role === 'narrator');
    const narrUrl = narrV && narrV.clips && narrV.clips[0] && narrV.clips[0].url;
    if (scene.frontRole === 'narrator' && narrUrl) {
      const narrEl = document.createElement('video');
      narrEl.src = narrUrl;
      narrEl.muted = true;
      narrEl.preload = 'auto';
      narrEl.playsInline = true;
      narratorTimelineItems.push({
        id: nextNarratorTimelineId++,
        sceneIdx,
        videoInstanceId: narrV.id,
        sourceImageInstanceId: 'cg-narrator-setup',
        videoEl: narrEl,
        videoSrc: narrUrl,
        videoDuration: narrV.clips[0].clipDuration || scene.duration,
        inPoint: 0,
        outPoint: narrV.clips[0].clipDuration || scene.duration,
        startTime: scene.startTime,
        duration: scene.duration,
        lane: 'narrator',
        imgSrc: scene.imgDataUrl,
        imgEl: img,
      });
    }
    if (createVideoMode === 'animated' && (scene.videoUrl || (scene.videoClips && scene.videoClips.length > 0))) {
      const clips = scene.videoClips || [{ url: scene.videoUrl, clipDuration: scene.duration }];
      let clipStart = scene.startTime;
      for (let ci = 0; ci < clips.length; ci++) {
        const clip = clips[ci];
        const remaining = scene.startTime + scene.duration - clipStart;
        if (remaining <= 0) break;
        const showDur = Math.min(clip.clipDuration || scene.duration, remaining);
        const videoEl = document.createElement('video');
        videoEl.src = clip.url;
        videoEl.muted = true;
        const matchVid = oldVideos.find(v =>
          v.sceneIdx === sceneIdx && v.clipIdx === ci && vidId && v.videoInstanceId === vidId
        );
        const fallbackVid = !matchVid ? oldVideos.find(v =>
          v.sceneIdx === sceneIdx && v.clipIdx === ci
        ) : null;
        const baseClip = {
          sceneIdx, clipIdx: ci,
          videoInstanceId: vidId,
          sourceImageInstanceId: sourceImgId,
          videoEl, videoSrc: clip.url,
          videoDuration: clip.clipDuration || scene.duration,
          startTime: clipStart, duration: showDur,
          imgSrc: scene.imgDataUrl, imgEl: img,
        };
        if (matchVid || fallbackVid) {
          const preserve = matchVid || fallbackVid;
          videoTimelineItems.push({
            ...preserve, ...baseClip,
            inPoint:  Math.max(0, Math.min(preserve.inPoint  || 0,        baseClip.videoDuration)),
            outPoint: Math.max(0, Math.min(preserve.outPoint || showDur,  baseClip.videoDuration)),
          });
        } else {
          videoTimelineItems.push({
            id: nextVideoTimelineId++,
            ...baseClip,
            inPoint: 0, outPoint: showDur,
          });
        }
        clipStart += clip.clipDuration || scene.duration;
      }
    } else {
      const matchPhoto = oldPhotos.find(p =>
        p.sceneIdx === sceneIdx && imgId && p.imageInstanceId === imgId
      );
      const fallbackPhoto = !matchPhoto ? oldPhotos.find(p =>
        p.sceneIdx === sceneIdx
      ) : null;
      const basePhoto = {
        sceneIdx, imageInstanceId: imgId,
        imgSrc: scene.imgDataUrl, imgEl: img,
        startTime: scene.startTime, duration: scene.duration,
      };
      if (matchPhoto || fallbackPhoto) {
        photoItems.push({ ...(matchPhoto || fallbackPhoto), ...basePhoto });
      } else {
        photoItems.push({
          id: nextPhotoId++,
          ...basePhoto,
          transition: 'fade',
          transDur: 0.5,
          motion: 'ken-burns',
        });
      }
    }
  }

  // Transfer pre-generated subtitles from Step 8 selections
  subtitleItems = [];
  nextSubtitleId = 1;
  subBlockElements.clear();
  subTimelineContainer.querySelectorAll('.sub-block').forEach(el => el.remove());
  const { width: subW } = getSelectedImageSize();
  const maxSubWidth = Math.round(subW * 0.85);
  // Read subtitle style from Create Story Step 8 panel
  const _csFont     = ($('create-sub-font')?.value)     || "'Noto Sans Tamil', sans-serif";
  const _csSize     = Math.max(16, Math.min(72, parseInt($('create-sub-size')?.value)    || 32));
  const _csColor    = ($('create-sub-color')?.value)    || '#ffffff';
  const _csStrokeW  = Math.max(0, parseInt($('create-sub-stroke-w')?.value) || 2);
  const _csBgAlpha  = Math.max(0, Math.min(1, parseFloat($('create-sub-bg-alpha')?.value) || 0.5));
  const _csPos      = ($('create-sub-position')?.value) || 'bot-center';
  const _csBold     = $('create-sub-bold')?.checked ?? true;
  const _csAllCaps  = $('create-sub-all-caps')?.checked ?? false;
  // Use primary track subtitles first, then add language track subtitles
  const primarySubs = createGeneratedSubtitles.get('primary');
  if (primarySubs) {
    for (const sub of primarySubs) {
      subtitleItems.push({
        id: nextSubtitleId++, text: sub.text,
        font: _csFont, fontSize: _csSize, color: _csColor,
        strokeColor: '#000000', strokeWidth: _csStrokeW,
        bgColor: '#000000', bgAlpha: _csBgAlpha, bold: _csBold,
        position: _csPos, allCaps: _csAllCaps,
        startTime: sub.startTime, duration: sub.duration,
        animation: 'fade', animDur: 0.3,
        _maxWidth: maxSubWidth,
      });
    }
  }

  // Transfer PiP video to editor
  if (createPipVideoEl) {
    pipItems = [{
      id: nextPipId++,
      videoEl: createPipVideoEl,
      videoSrc: createPipVideoSrc,
      videoDuration: createPipVideoEl.duration,
      inPoint: 0, outPoint: currentBuffer.duration,
      position: 'bot-right', customX: null, customY: null,
      size: pipSize, shape: pipShape,
      border: pipBorder, borderColor: pipBorderColor,
      shadow: pipShadow,
      name: 'Speaker',
    }];
    const pipSec = $('pip-section');
    if (pipSec) pipSec.style.display = '';
    if (typeof renderPipList === 'function') renderPipList();
    // Add podcast video to video timeline track
    const thumbC = document.createElement('canvas');
    thumbC.width = 160; thumbC.height = 90;
    thumbC.getContext('2d').drawImage(createPipVideoEl, 0, 0, 160, 90);
    const vtThumb = thumbC.toDataURL('image/jpeg', 0.6);
    const vtImg = new Image(); vtImg.src = vtThumb;
    videoTimelineItems = [{
      id: nextVideoTimelineId++,
      videoEl: createPipVideoEl,
      videoSrc: createPipVideoSrc,
      videoDuration: createPipVideoEl.duration,
      inPoint: 0, outPoint: createPipVideoEl.duration,
      startTime: 0, duration: currentBuffer.duration,
      imgSrc: vtThumb, imgEl: vtImg,
    }];
    if (typeof renderVideoTimeline === 'function') renderVideoTimeline();
    const bgVidMode = $('bg-video-mode');
    if (bgVidMode) bgVidMode.value = bgVideoMode;
  } else {
    pipItems = [];
    videoTimelineItems = [];
    const pipSec = $('pip-section');
    if (pipSec) pipSec.style.display = 'none';
    if (typeof renderVideoTimeline === 'function') renderVideoTimeline();
  }

  // Transfer language tracks to editor
  editorOriginalBuffer = currentBuffer;
  editorOriginalSubtitles = subtitleItems.map(t => ({ ...t }));
  editorCurrentLang = 'original';
  // Store primary subtitle language for editor card display
  window._editorPrimarySubLang = createSubtitleSelections['primary'] || (editorOriginalSubtitles.length > 0 ? 'original' : 'none');
  // Store original photo timings for language switching
  window._editorOriginalPhotos = photoItems.map(p => ({ startTime: p.startTime, duration: p.duration }));

  editorLanguageTracks = languageTracks.filter(t => t.status === 'done').map(t => ({
    lang: t.lang,
    langCode: t.langCode,
    audioBuffer: t.audioBuffer,
    translatedText: t.translatedText,
    voiceName: createVoiceSelections[t.langCode] || t.voiceName || 'Kore',
    subtitleLang: createSubtitleSelections[t.langCode] || t.subtitleLang || 'none',
  }));
  // Build per-language subtitle texts + scaled photo/subtitle timings
  for (const track of editorLanguageTracks) {
    const result = computePhotoTimings(createScenes, track, photoItems, editorOriginalSubtitles);
    track.subtitleTexts    = result.subtitleTexts;
    track.photoTimings     = result.photoTimings;
    track.subtitleTimings  = result.subtitleTimings;
  }
  setupEditorLanguageSelector();

  // Transfer BGM from create pipeline to editor
  if (typeof createBgmUrl === 'string' && createBgmUrl) {
    try {
      const arrayBuf = await fetch(createBgmUrl).then(r => r.arrayBuffer());
      bgmBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf);
      const volEl = $('create-bgm-volume');
      bgmVolume = volEl ? parseInt(volEl.value) / 100 : 0.3;
      const bgmSec = $('bgm-section');
      if (bgmSec) bgmSec.style.display = '';
      const bgmNm = $('bgm-name');
      if (bgmNm) bgmNm.textContent = `BGM (${fmtShort(bgmBuffer.duration)})`;
    } catch (e) {
      console.warn('BGM transfer to editor failed:', e);
    }
  } else {
    bgmBuffer = null;
  }

  // Navigate to editor — show handoff summary first (#8)
  cameFromCreate = true;
  btnBackToCreate.style.display = '';
  const exportAllBtn = $('btn-export-all-langs');
  if (exportAllBtn) exportAllBtn.style.display = editorLanguageTracks.length > 0 ? '' : 'none';
  if (typeof showHandoff === 'function') {
    showHandoff(function() { navigateTo('editor'); });
  } else {
    navigateTo('editor');
  }
  await refreshWaveform();
  updateAudioControls();
  drawRuler();
  renderPhotos();
  renderTexts();
  renderSubtitles();
  // Re-render after layout settles to fix any positioning issues
  requestAnimationFrame(() => { drawRuler(); renderPhotos(); renderSubtitles(); });
  const langInfo = editorLanguageTracks.length > 0 ? ` + ${editorLanguageTracks.length} language(s)` : '';
  const subInfo = subtitleItems.length > 0 ? `, ${subtitleItems.length} subtitles` : '';
  setStatus(`Content created: ${fmt(currentBuffer.duration)} audio, ${photoItems.length} photos${subInfo}${langInfo}. Edit and export!`);
  applyEditorPlanGating();
  loadEditorLibrary();
});

// ── Editor language selector ──
function setupEditorLanguageSelector() {
  const selectorDiv = $('editor-lang-selector');
  const selectEl = $('editor-lang-select');
  const cardsDiv = $('editor-lang-cards');
  const cardsList = $('editor-lang-cards-list');

  if (editorLanguageTracks.length === 0) {
    if (selectorDiv) selectorDiv.style.display = 'none';
    if (cardsDiv) cardsDiv.style.display = 'none';
    const exportAllBtn = $('export-all-langs');
    if (exportAllBtn) exportAllBtn.style.display = 'none';
    return;
  }

  // Populate hidden select (kept for backward compat with change handler)
  if (selectEl) {
    selectEl.innerHTML = '<option value="original">Original</option>';
    for (const t of editorLanguageTracks) {
      const opt = document.createElement('option');
      opt.value = t.langCode;
      opt.textContent = `${t.lang} (${fmtShort(t.audioBuffer.duration)})`;
      selectEl.appendChild(opt);
    }
    selectEl.value = editorCurrentLang;
  }

  // Render language cards above audio track
  if (cardsDiv && cardsList) {
    cardsDiv.style.display = '';
    const langFlags = { ta: '🇮🇳', hi: '🇮🇳', te: '🇮🇳', ml: '🇮🇳', en: '🇺🇸', es: '🇪🇸', fr: '🇫🇷' };
    const origFlag = '🎙️';
    const origDur = editorOriginalBuffer ? fmtShort(editorOriginalBuffer.duration) : '';
    const primarySubCode = window._editorPrimarySubLang || (editorOriginalSubtitles.length > 0 ? 'original' : 'none');
    const origSubLang = primarySubCode === 'none' ? 'None'
      : primarySubCode === 'original' ? 'Original'
      : (SUPPORTED_LANGUAGES.find(l => l.code === primarySubCode)?.name || primarySubCode);

    let html = `<div class="editor-lang-card ${editorCurrentLang === 'original' ? 'active' : ''}" data-lang="original">
      <span class="lang-flag">${origFlag}</span>
      <div class="lang-info">
        <span class="lang-name">Original</span>
        <span class="lang-meta">🔊 ${origDur} · 💬 ${origSubLang}</span>
      </div>
    </div>`;

    for (const t of editorLanguageTracks) {
      const flag = langFlags[t.langCode] || '🌐';
      const dur = fmtShort(t.audioBuffer.duration);
      const subLang = t.subtitleLang && t.subtitleLang !== 'none'
        ? (SUPPORTED_LANGUAGES.find(l => l.code === t.subtitleLang)?.name || t.subtitleLang)
        : 'None';
      html += `<div class="editor-lang-card ${editorCurrentLang === t.langCode ? 'active' : ''}" data-lang="${t.langCode}">
        <span class="lang-flag">${flag}</span>
        <div class="lang-info">
          <span class="lang-name">${t.lang}</span>
          <span class="lang-meta">🔊 ${dur} · 💬 ${subLang}</span>
        </div>
      </div>`;
    }
    cardsList.innerHTML = html;

    // Click handler — switch language via the hidden select
    cardsList.querySelectorAll('.editor-lang-card').forEach(card => {
      card.addEventListener('click', () => {
        const lang = card.dataset.lang;
        if (selectEl) { selectEl.value = lang; selectEl.dispatchEvent(new Event('change')); }
        // Update active state
        cardsList.querySelectorAll('.editor-lang-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
    });
  }

  // Show "Export All Languages" button
  const exportAllBtn = $('export-all-langs');
  if (exportAllBtn) exportAllBtn.style.display = '';
}

// Language switch handler
const editorLangSelect = $('editor-lang-select');
if (editorLangSelect) {
  editorLangSelect.addEventListener('change', async () => {
    const langCode = editorLangSelect.value;
    editorCurrentLang = langCode;

    if (langCode === 'original') {
      currentBuffer = editorOriginalBuffer;
      subtitleItems = editorOriginalSubtitles.map(t => ({ ...t }));
      // Restore original photo timings
      if (window._editorOriginalPhotos) {
        photoItems.forEach((p, i) => {
          const orig = window._editorOriginalPhotos[i];
          if (orig) { p.startTime = orig.startTime; p.duration = orig.duration; }
        });
      }
    } else {
      const track = editorLanguageTracks.find(t => t.langCode === langCode);
      if (!track) return;
      currentBuffer = track.audioBuffer;
      // Apply scaled subtitle timings + translated text
      if (track.subtitleTexts && editorOriginalSubtitles.length > 0) {
        subtitleItems = editorOriginalSubtitles.map((t, i) => ({
          ...t,
          id: nextSubtitleId++,
          text: track.subtitleTexts[i] || t.text,
          startTime: track.subtitleTimings?.[i]?.startTime ?? t.startTime,
          duration: track.subtitleTimings?.[i]?.duration ?? t.duration,
        }));
      }
      // Apply scaled photo timings (same images, different timing)
      if (track.photoTimings) {
        photoItems.forEach((p, i) => {
          const scaled = track.photoTimings[i];
          if (scaled) { p.startTime = scaled.startTime; p.duration = scaled.duration; }
        });
      }
    }

    // Refresh all timelines
    subBlockElements.clear();
    subTimelineContainer.querySelectorAll('.sub-block').forEach(el => el.remove());
    await refreshWaveform();
    updateAudioControls();
    drawRuler();
    renderPhotos();
    renderSubtitles();
    setStatus(`Switched to ${langCode === 'original' ? 'original' : editorLanguageTracks.find(t => t.langCode === langCode)?.lang} audio`);
  });
}

// Save project from Create page
btnCreateSaveProject.addEventListener('click', async () => {
  // Temporarily build editor state from create data so save works
  const hadBuffer = currentBuffer;
  const hadPhotos = [...photoItems];
  const hadTexts = [...textItems];
  const hadSubtitles = [...subtitleItems];
  const hadLangTracks = [...editorLanguageTracks];

  currentBuffer = createAudioBuffer;
  photoItems = [];
  textItems = [];

  // Build photo items from scenes that have images
  if (createScenes) {
    for (const scene of createScenes) {
      if (!scene.imgDataUrl) continue;
      const img = new Image();
      await new Promise(r => { img.onload = r; img.onerror = r; img.src = scene.imgDataUrl; });
      photoItems.push({
        id: nextPhotoId++, imgSrc: scene.imgDataUrl, imgEl: img,
        startTime: scene.startTime, duration: scene.duration,
        transition: 'fade', transDur: 0.5,
      });
    }
  }

  // Build subtitle items from primary track (same as Send to Editor)
  subtitleItems = [];
  let saveSubId = 1;
  const { width: saveSubW } = getSelectedImageSize();
  const saveMaxSubWidth = Math.round(saveSubW * 0.85);
  const _svFont    = ($('create-sub-font')?.value)     || "'Noto Sans Tamil', sans-serif";
  const _svSize    = Math.max(16, Math.min(72, parseInt($('create-sub-size')?.value)    || 32));
  const _svColor   = ($('create-sub-color')?.value)    || '#ffffff';
  const _svStrokeW = Math.max(0, parseInt($('create-sub-stroke-w')?.value) || 2);
  const _svBgAlpha = Math.max(0, Math.min(1, parseFloat($('create-sub-bg-alpha')?.value) || 0.5));
  const _svPos     = ($('create-sub-position')?.value) || 'bot-center';
  const _svBold    = $('create-sub-bold')?.checked ?? true;
  const _svAllCaps = $('create-sub-all-caps')?.checked ?? false;
  const primarySubs = createGeneratedSubtitles.get('primary');
  if (primarySubs) {
    for (const sub of primarySubs) {
      subtitleItems.push({
        id: saveSubId++, text: sub.text,
        font: _svFont, fontSize: _svSize, color: _svColor,
        strokeColor: '#000000', strokeWidth: _svStrokeW,
        bgColor: '#000000', bgAlpha: _svBgAlpha, bold: _svBold,
        position: _svPos, allCaps: _svAllCaps,
        startTime: sub.startTime, duration: sub.duration,
        animation: 'fade', animDur: 0.3,
        _maxWidth: saveMaxSubWidth,
      });
    }
  }

  // Build language tracks with subtitleTexts + photoTimings (needed for language switching on reload)
  editorLanguageTracks = languageTracks.filter(t => t.status === 'done').map(t => ({
    lang: t.lang, langCode: t.langCode,
    audioBuffer: t.audioBuffer, translatedText: t.translatedText,
    voiceName: createVoiceSelections[t.langCode] || t.voiceName || 'Kore',
    subtitleLang: createSubtitleSelections[t.langCode] || t.subtitleLang || 'none',
  }));
  // Compute subtitleTexts + photoTimings per language track (same as Send to Editor)
  if (createScenes) {
    for (const track of editorLanguageTracks) {
      if (!track.translatedText || !track.audioBuffer) continue;
      const result = computePhotoTimings(createScenes, track, photoItems, []);
      track.subtitleTexts   = result.subtitleTexts;
      track.photoTimings    = result.photoTimings;
      // No subtitle remap on save (we don't have editorOriginalSubtitles here)
    }
  }

  const showMsg = (msg) => { btnCreateSaveTop.textContent = msg; setTimeout(() => { btnCreateSaveTop.textContent = '💾 Save'; }, 3000); };
  await saveProjectToFile(createAudioBuffer, showMsg);

  // Restore previous editor state
  currentBuffer = hadBuffer;
  photoItems = hadPhotos;
  textItems = hadTexts;
  subtitleItems = hadSubtitles;
  editorLanguageTracks = hadLangTracks;
});

// Early save button (in header) — same logic
btnCreateSaveTop.addEventListener('click', () => btnCreateSaveProject.click());

// Back to Create from Editor — preserves create wizard state
btnBackToCreate.addEventListener('click', () => {
  // Sync editor photo changes back into createScenes by index order
  if (createScenes) {
    const editorPhotos = [...photoItems].sort((a, b) => a.startTime - b.startTime);
    for (let i = 0; i < createScenes.length; i++) {
      const ep = editorPhotos[i];
      if (ep) {
        createScenes[i].imgDataUrl = ep.imgSrc;
        createScenes[i].startTime = ep.startTime;
        createScenes[i].duration = ep.duration;
        createScenes[i].endTime = ep.startTime + ep.duration;
      }
    }
  }

  // Restore language tracks from editor to create flow (always re-sync to avoid stale state)
  if (editorLanguageTracks.length > 0) {
    languageTracks = editorLanguageTracks.map(t => {
      createVoiceSelections[t.langCode] = t.voiceName || 'Kore';
      return {
        lang: t.lang, langCode: t.langCode,
        audioBuffer: t.audioBuffer, translatedText: t.translatedText,
        voiceName: t.voiceName || 'Kore',
        subtitleLang: t.subtitleLang || 'none',
        status: 'done',
      };
    });
    // Re-render language cards
    for (const t of languageTracks) {
      const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === t.langCode);
      if (langInfo) renderLanguageCard(langInfo, 'done', `Done (${fmtShort(t.audioBuffer.duration)})`);
    }
  }

  navigateTo('create');
  // Trigger section visibility based on restored agent state
  if (typeof updateStepStates === 'function') updateStepStates();
  // Init BGM waveform now that create page is visible (deferred from project load)
  if (typeof createBgmUrl !== 'undefined' && createBgmUrl && typeof initCreateBgmWaveform === 'function') {
    initCreateBgmWaveform(createBgmUrl);
  }

  // Restore all completed steps visibility
  if (createAudioBuffer) {
    // Step 2: Show audio name + restore waveform editor
    const audioName = $('create-audio-name');
    if (audioName && !audioName.textContent) audioName.textContent = 'Audio loaded';
    showCreateAudioEditor();
    // Show early save button
    btnCreateSaveTop.style.display = '';
  }

  if (createTranscript) {
    const transcriptOut = $('create-transcript-output');
    if (transcriptOut) {
      transcriptOut.textContent = Array.isArray(createTranscript)
        ? createTranscript.map(s => `[${fmt(s.startTime)} – ${fmt(s.endTime)}] ${s.text}`).join('\n\n')
        : createTranscript;
      transcriptOut.classList.add('visible');
    }
  }

  if (createScenes && createScenes.length > 0) {
    renderStoryboard();
    renderCreateSceneCards();
    if (createInputMode === 'podcast' && createChapters) renderChapterCards();

    const failedCount = createScenes.filter(s => s.status === 'error').length;
    const btnRetry = $('btn-create-retry-failed');
    if (btnRetry) btnRetry.style.display = failedCount > 0 ? '' : 'none';
  }

  updateCreateButtons();
  updateStepStates();
  if (typeof inferCreateAgentStates === 'function') inferCreateAgentStates();
});

// Create Story subtitle preset handler
const createSubPresetEl = $('create-sub-preset');
if (createSubPresetEl) {
  createSubPresetEl.addEventListener('change', () => {
    const preset = createSubPresetEl.value;
    const presets = {
      'hormozi': { font: 'Anton',                           size: 48, color: '#ffffff', strokeW: 0, bgAlpha: 0, pos: 'bot-center', bold: true,  allCaps: true  },
      'classic': { font: "'Noto Sans Tamil', sans-serif",   size: 32, color: '#ffffff', strokeW: 2, bgAlpha: 0.5, pos: 'bot-center', bold: true, allCaps: false },
      'karaoke': { font: "'Noto Sans Tamil', sans-serif",   size: 28, color: '#ffffff', strokeW: 2, bgAlpha: 0.5, pos: 'bot-center', bold: false, allCaps: false },
      'bold':    { font: 'Poppins',                         size: 42, color: '#ffffff', strokeW: 2, bgAlpha: 0.6, pos: 'center',     bold: true,  allCaps: true  },
      'minimal': { font: 'Inter',                           size: 28, color: '#ffffff', strokeW: 0, bgAlpha: 0,   pos: 'bot-center', bold: false, allCaps: false },
    };
    const p = presets[preset];
    if (!p) return;
    const fn = $('create-sub-font');       if (fn) fn.value = p.font;
    const sz = $('create-sub-size');       if (sz) sz.value = p.size;
    const col = $('create-sub-color');     if (col) col.value = p.color;
    const sw = $('create-sub-stroke-w');   if (sw) sw.value = p.strokeW;
    const bg = $('create-sub-bg-alpha');   if (bg) bg.value = p.bgAlpha;
    const pos = $('create-sub-position');  if (pos) pos.value = p.pos;
    const bold = $('create-sub-bold');     if (bold) bold.checked = p.bold;
    const caps = $('create-sub-all-caps'); if (caps) caps.checked = p.allCaps;
  });
}
