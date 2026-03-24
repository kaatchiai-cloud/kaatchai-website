// ══════════════════════════════════════════
//  CREATE CONTENT — Languages & Send to Editor
// ══════════════════════════════════════════

// ── Multi-Language Voiceover ──
const SUPPORTED_LANGUAGES = [
  { code: 'ta', name: 'Tamil', flag: '🇮🇳', gcloudVoice: 'ta-IN-Standard-A', gcloudLang: 'ta-IN' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳', gcloudVoice: 'hi-IN-Standard-A', gcloudLang: 'hi-IN' },
  { code: 'te', name: 'Telugu', flag: '🇮🇳', gcloudVoice: 'te-IN-Standard-A', gcloudLang: 'te-IN' },
  { code: 'ml', name: 'Malayalam', flag: '🇮🇳', gcloudVoice: 'ml-IN-Standard-A', gcloudLang: 'ml-IN' },
  { code: 'en', name: 'English', flag: '🇺🇸', gcloudVoice: 'en-US-Standard-D', gcloudLang: 'en-US' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', gcloudVoice: 'es-ES-Standard-A', gcloudLang: 'es-ES' },
  { code: 'fr', name: 'French', flag: '🇫🇷', gcloudVoice: 'fr-FR-Standard-A', gcloudLang: 'fr-FR' },
];

let languageTracks = []; // [{lang, langCode, audioBuffer, translatedText, status}]

const createLanguageStep = $('create-language-step');
const languageCheckboxes = $('language-checkboxes');
const btnGenerateLanguages = $('btn-generate-languages');
const languageStatus = $('language-status');
const languageResults = $('language-results');

// Populate language checkboxes
for (const lang of SUPPORTED_LANGUAGES) {
  const label = document.createElement('label');
  label.style.cssText = 'font-size:0.75rem; display:flex; align-items:center; gap:4px; cursor:pointer; padding:4px 10px; background:var(--bg-elevated); border:1px solid var(--border); border-radius:6px;';
  label.innerHTML = `<input type="checkbox" id="lang-check-${lang.code}"> ${lang.flag} ${lang.name}`;
  label.querySelector('input').addEventListener('change', () => {
    const anyChecked = SUPPORTED_LANGUAGES.some(l => {
      const cb = $(`lang-check-${l.code}`);
      return cb && cb.checked;
    });
    btnGenerateLanguages.disabled = !anyChecked;
  });
  languageCheckboxes.appendChild(label);
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
  langPlayerSource = audioCtx.createBufferSource();
  langPlayerSource.buffer = buffer;
  langPlayerSource.connect(audioCtx.destination);
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

// Generate subtitles for a specific audio track based on selected subtitle language
// Stores in createGeneratedSubtitles map: langCode → subtitleItems array
let createGeneratedSubtitles = new Map();
let langGenerating = false; // true during language/subtitle generation // langCode → [{text, startTime, duration, ...}]

async function generateSubtitlesForTrack(trackId, subtitleLang) {
  if (subtitleLang === 'none') {
    createGeneratedSubtitles.delete(trackId);
    updateSubtitlePreviewCount();
    return;
  }

  if (!createScenes) return;

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
          const statusEl = $('language-status');
          if (statusEl) { statusEl.textContent = `Translating subtitles to ${langName}...`; statusEl.style.color = ''; }
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
}

function updateSubtitlePreviewCount() {
  let total = 0;
  for (const [, subs] of createGeneratedSubtitles) total += subs.length;
  const statusEl = $('language-status');
  if (statusEl) {
    const doneCount = languageTracks.filter(t => t.status === 'done').length;
    if (total > 0) {
      const trackCount = createGeneratedSubtitles.size;
      statusEl.textContent = `${doneCount} voice(s) · ${total} subtitles ready (${trackCount} track${trackCount > 1 ? 's' : ''})`;
      statusEl.style.color = '#10b981';
    } else if (doneCount > 0) {
      statusEl.textContent = `${doneCount} voice(s) ready · No subtitles selected`;
      statusEl.style.color = '';
    }
  }
}

function renderPrimaryAudioCard() {
  const container = $('language-primary');
  if (!container || !createAudioBuffer) return;
  const label = createInputMode === 'text' ? 'English (Generated TTS)' : 'Original Audio';
  const flag = createInputMode === 'text' ? '🇺🇸' : '🎙️';
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
  const controls = (status === 'done' && track) ? buildAudioControls(lang.code) : '';
  const subSelect = (status === 'done') ? buildSubtitleSelect(lang.code, lang.name) : '';
  card.innerHTML = `
    <span class="lang-name">${lang.flag} ${lang.name}</span>
    <span class="lang-status">${detail || status}</span>
    ${subSelect}
    ${controls}
  `;
  if (status === 'done' && track) {
    card.querySelector('.lang-play-btn').addEventListener('click', (e) => {
      if (langPlayerPlaying && langPlayerSource) { stopLangPlayer(); return; }
      playLangAudio(track.audioBuffer, e.target);
    });
    card.querySelector('.lang-stop-btn').addEventListener('click', stopLangPlayer);
    const subEl = card.querySelector('.lang-sub-select');
    if (subEl) {
      subEl.value = track.subtitleLang || 'none';
      subEl.addEventListener('change', () => {
        track.subtitleLang = subEl.value;
        generateSubtitlesForTrack(lang.code, subEl.value);
      });
    }
  }
}

btnGenerateLanguages.addEventListener('click', async () => {
  const key = getCreateGeminiKey();
  if (!key) { languageStatus.textContent = 'Enter Gemini API key first'; return; }
  if (!createScenes || createScenes.length === 0) return;

  const selectedLangs = SUPPORTED_LANGUAGES.filter(l => {
    const cb = $(`lang-check-${l.code}`);
    return cb && cb.checked;
  });
  if (selectedLangs.length === 0) return;

  btnGenerateLanguages.disabled = true;
  langGenerating = true;
  updateCreateButtons();
  const fullText = createScenes.map(s => s.text).filter(Boolean).join('\n\n');

  for (const lang of selectedLangs) {
    try {
      renderLanguageCard(lang, 'working', 'Translating...');
      const translated = await translateText(fullText, lang.name, key);

      renderLanguageCard(lang, 'working', 'Generating voice...');
      let audioBuffer;
      try {
        // Try full text first
        const ttsResult = await generateTTSGemini(translated, 'Kore', key);
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
          const chunkResult = await generateTTSGemini(chunks[c], 'Kore', key);
          const { audioBuffer: chunkBuf } = await decodeBase64Audio(chunkResult.base64, chunkResult.mimeType);
          chunkBuffers.push(chunkBuf);
        }

        // Concatenate audio buffers
        const totalLength = chunkBuffers.reduce((sum, b) => sum + b.length, 0);
        const sampleRate = chunkBuffers[0].sampleRate;
        const channels = chunkBuffers[0].numberOfChannels;
        const merged = audioCtx.createBuffer(channels, totalLength, sampleRate);
        let offset = 0;
        for (const buf of chunkBuffers) {
          for (let ch = 0; ch < channels; ch++) {
            merged.getChannelData(ch).set(buf.getChannelData(ch), offset);
          }
          offset += buf.length;
        }
        audioBuffer = merged;
      }

      // Match duration to original audio by resampling
      const targetDur = createAudioBuffer ? createAudioBuffer.duration : audioBuffer.duration;
      if (Math.abs(audioBuffer.duration - targetDur) > 1) {
        renderLanguageCard(lang, 'working', 'Matching duration...');
        const rate = audioBuffer.duration / targetDur;
        const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, Math.round(targetDur * audioBuffer.sampleRate), audioBuffer.sampleRate);
        const src = offlineCtx.createBufferSource();
        src.buffer = audioBuffer;
        src.playbackRate.value = rate;
        src.connect(offlineCtx.destination);
        src.start();
        audioBuffer = await offlineCtx.startRendering();
      }

      // Remove existing track for this language if re-generating
      languageTracks = languageTracks.filter(t => t.langCode !== lang.code);
      languageTracks.push({
        lang: lang.name,
        langCode: lang.code,
        audioBuffer,
        translatedText: translated,
        subtitleLang: 'none', // default: no subtitle
        status: 'done'
      });
      renderLanguageCard(lang, 'done', `Done (${fmtShort(audioBuffer.duration)})`);
    } catch(e) {
      renderLanguageCard(lang, 'error', friendlyApiError(e.message));
      console.error(`Language ${lang.name} error:`, e);
    }
  }

  btnGenerateLanguages.disabled = false;
  langGenerating = false;
  updateCreateButtons();
  const doneTracks = languageTracks.filter(t => t.status === 'done');
  languageStatus.textContent = `${doneTracks.length} language track(s) ready — will be available in the editor`;
});

// Send to Editor
btnCreateSendEditor.addEventListener('click', async () => {
  if (!createAudioBuffer || !createScenes) return;

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
    if (!confirm(msg)) return;
  }

  // Reset editor state
  currentBuffer = createAudioBuffer;
  photoItems = [];
  textItems = [];
  blockElements.clear();
  textBlockElements.clear();
  timelineContainer.querySelectorAll('.photo-block').forEach(el => el.remove());
  textTimelineContainer.querySelectorAll('.text-block').forEach(el => el.remove());
  undoStack = [];
  nextPhotoId = 1;
  nextTextId = 1;
  selectedPhotoIds.clear();
  selectedTextIds.clear();

  // Add generated images to photo timeline
  for (const scene of createScenes) {
    if (!scene.imgDataUrl) continue;
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = scene.imgDataUrl;
    });
    photoItems.push({
      id: nextPhotoId++,
      imgSrc: scene.imgDataUrl,
      imgEl: img,
      startTime: scene.startTime,
      duration: scene.duration,
      transition: 'fade',
      transDur: 0.5,
      motion: 'ken-burns',
    });
  }

  // Transfer pre-generated subtitles from Step 8 selections
  subtitleItems = [];
  nextSubtitleId = 1;
  subBlockElements.clear();
  subTimelineContainer.querySelectorAll('.sub-block').forEach(el => el.remove());
  const { width: subW } = getSelectedImageSize();
  const maxSubWidth = Math.round(subW * 0.85);
  // Use primary track subtitles first, then add language track subtitles
  const primarySubs = createGeneratedSubtitles.get('primary');
  if (primarySubs) {
    for (const sub of primarySubs) {
      subtitleItems.push({
        id: nextSubtitleId++, text: sub.text,
        font: "'Noto Sans Tamil', sans-serif",
        fontSize: 32, color: '#ffffff',
        strokeColor: '#000000', strokeWidth: 2,
        bgColor: '#000000', bgAlpha: 0.5, bold: true,
        position: 'bot-center',
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
  editorLanguageTracks = languageTracks.filter(t => t.status === 'done').map(t => ({
    lang: t.lang,
    langCode: t.langCode,
    audioBuffer: t.audioBuffer,
    translatedText: t.translatedText,
    subtitleLang: t.subtitleLang || 'original',
  }));
  // Build per-language subtitle texts (split translated text proportionally across scenes)
  for (const track of editorLanguageTracks) {
    const origWords = createScenes.reduce((sum, s) => sum + (s.text || '').split(/\s+/).length, 0);
    const transWords = track.translatedText.split(/\s+/);
    let wordIdx = 0;
    track.subtitleTexts = createScenes.map(s => {
      if (!s.text || s.text.trim() === '') return '';
      const sceneWordCount = Math.max(1, Math.round(((s.text || '').split(/\s+/).length / Math.max(1, origWords)) * transWords.length));
      const portion = transWords.slice(wordIdx, wordIdx + sceneWordCount).join(' ');
      wordIdx += sceneWordCount;
      return portion;
    });
  }
  setupEditorLanguageSelector();

  // Navigate to editor
  cameFromCreate = true;
  btnBackToCreate.style.display = '';
  createPage.classList.remove('visible');
  editorEl.classList.add('visible');
  await refreshWaveform();
  updateAudioControls();
  renderPhotos();
  renderTexts();
  renderSubtitles();
  drawRuler();
  const langInfo = editorLanguageTracks.length > 0 ? ` + ${editorLanguageTracks.length} language(s)` : '';
  const subInfo = subtitleItems.length > 0 ? `, ${subtitleItems.length} subtitles` : '';
  setStatus(`Content created: ${fmt(currentBuffer.duration)} audio, ${photoItems.length} photos${subInfo}${langInfo}. Edit and export!`);
  applyEditorPlanGating();
  loadEditorLibrary();
  // Autosave audio and images
  if (currentBuffer) autosaveAudio('main', currentBuffer);
  if (createScenes) createScenes.forEach((s, i) => { if (s.imgDataUrl) autosaveImage(i, s.imgDataUrl); });
  markDirty();
});

// ── Editor language selector ──
function setupEditorLanguageSelector() {
  const selectorDiv = $('editor-lang-selector');
  const selectEl = $('editor-lang-select');
  if (!selectorDiv || !selectEl) return;

  if (editorLanguageTracks.length === 0) {
    selectorDiv.style.display = 'none';
    // Also hide "Export All Languages" button
    const exportAllBtn = $('export-all-langs');
    if (exportAllBtn) exportAllBtn.style.display = 'none';
    return;
  }

  selectorDiv.style.display = '';
  selectEl.innerHTML = '<option value="original">Original</option>';
  for (const t of editorLanguageTracks) {
    const opt = document.createElement('option');
    opt.value = t.langCode;
    opt.textContent = `${t.lang} (${fmtShort(t.audioBuffer.duration)})`;
    selectEl.appendChild(opt);
  }
  selectEl.value = editorCurrentLang;

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
    } else {
      const track = editorLanguageTracks.find(t => t.langCode === langCode);
      if (!track) return;
      currentBuffer = track.audioBuffer;
      if (track.subtitleTexts && editorOriginalSubtitles.length > 0) {
        subtitleItems = editorOriginalSubtitles.map((t, i) => ({
          ...t,
          id: nextSubtitleId++,
          text: track.subtitleTexts[i] || t.text,
        }));
      }
    }

    // Refresh subtitle timeline
    subBlockElements.clear();
    subTimelineContainer.querySelectorAll('.sub-block').forEach(el => el.remove());
    await refreshWaveform();
    updateAudioControls();
    renderSubtitles();
    drawRuler();
    setStatus(`Switched to ${langCode === 'original' ? 'original' : editorLanguageTracks.find(t => t.langCode === langCode)?.lang} audio`);
  });
}

// Save project from Create page
btnCreateSaveProject.addEventListener('click', async () => {
  // Temporarily build editor state from create data so save works
  const hadBuffer = currentBuffer;
  const hadPhotos = [...photoItems];
  const hadTexts = [...textItems];
  const hadLangTracks = [...editorLanguageTracks];

  currentBuffer = createAudioBuffer;
  photoItems = [];
  textItems = [];
  // Include language tracks in save
  editorLanguageTracks = languageTracks.filter(t => t.status === 'done').map(t => ({
    lang: t.lang, langCode: t.langCode,
    audioBuffer: t.audioBuffer, translatedText: t.translatedText,
    subtitleLang: t.subtitleLang || 'original',
  }));

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

  const showMsg = (msg) => { btnCreateSaveEarly.textContent = msg; setTimeout(() => { btnCreateSaveEarly.textContent = '💾 Save Project'; }, 3000); };
  await saveProjectToFile(createAudioBuffer, showMsg);

  // Restore previous editor state if it existed
  currentBuffer = hadBuffer;
  photoItems = hadPhotos;
  textItems = hadTexts;
  editorLanguageTracks = hadLangTracks;
});

// Early save button (in header) — same logic
btnCreateSaveEarly.addEventListener('click', () => btnCreateSaveProject.click());

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

  // Restore language tracks from editor to create flow
  if (editorLanguageTracks.length > 0 && languageTracks.length === 0) {
    languageTracks = editorLanguageTracks.map(t => ({
      lang: t.lang, langCode: t.langCode,
      audioBuffer: t.audioBuffer, translatedText: t.translatedText,
      subtitleLang: t.subtitleLang || 'none',
      status: 'done',
    }));
    // Re-render language cards
    for (const t of languageTracks) {
      const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === t.langCode);
      if (langInfo) renderLanguageCard(langInfo, 'done', `Done (${fmtShort(t.audioBuffer.duration)})`);
    }
  }

  editorEl.classList.remove('visible');
  createPage.classList.add('visible');

  // Restore all completed steps visibility
  if (createAudioBuffer) {
    // Step 2: Show audio name + restore waveform editor
    const audioName = $('create-audio-name');
    if (audioName && !audioName.textContent) audioName.textContent = 'Audio loaded';
    showCreateAudioEditor();
    // Show early save button
    btnCreateSaveEarly.style.display = '';
  }

  if (createTranscript) {
    // Step 3: Show transcript
    const transcriptOut = $('create-transcript-output');
    if (transcriptOut && !transcriptOut.textContent) {
      transcriptOut.textContent = createTranscript;
    }
  }

  if (createScenes && createScenes.length > 0) {
    // Show storyboard (Step 6)
    $('create-storyboard-step').style.display = '';
    renderStoryboard();

    // Show image generation (Step 7)
    $('create-generate-step').style.display = '';
    renderCreateSceneCards();

    // Show chapter step if podcast mode (Step 5)
    if (createInputMode === 'podcast' && createChapters) {
      $('create-chapter-step').style.display = '';
      renderChapterCards();
    }

    // Steps 8 & 9: Only show if images have been generated
    const hasAnyImages = createScenes.some(s => s.imgDataUrl);
    if (hasAnyImages) {
      $('create-language-step').style.display = '';
      renderPrimaryAudioCard();
      $('create-send-step').style.display = '';
    } else {
      $('create-language-step').style.display = 'none';
      $('create-send-step').style.display = 'none';
    }

    // Show retry button if any failed
    const failedCount = createScenes.filter(s => s.status === 'error').length;
    const btnRetry = $('btn-create-retry-failed');
    if (btnRetry) btnRetry.style.display = failedCount > 0 ? '' : 'none';

    updateCreateButtons();
  }
});
