// ══════════════════════════════════════════
//  CREATE CONTENT — Pipeline & Generation
// ══════════════════════════════════════════

createStylePresetEl.addEventListener('change', () => {
  const val = createStylePresetEl.value;
  if (val === 'custom') {
    createStylePromptEl.disabled = false;
    createStylePromptEl.focus();
    createStylePrompt = createStylePromptEl.value;
  } else if (val && STYLE_PRESETS[val]) {
    createStylePrompt = STYLE_PRESETS[val];
    createStylePromptEl.value = createStylePrompt;
    createStylePromptEl.disabled = true;
  } else {
    createStylePrompt = '';
    createStylePromptEl.value = '';
    createStylePromptEl.disabled = true;
  }
  createStylePreset = val;
});

createStylePromptEl.addEventListener('input', () => {
  createStylePrompt = createStylePromptEl.value;
});

// BGM state
let createBgmUrl = null;

// Output language state (set at agent launch from Input step dropdowns)
let createOutputLanguage = '';
let createSubtitleLanguage = '';

// Audio Editor state
let createWavesurfer = null;
let createRegionsPlugin = null;
let createActiveRegion = null;
let createUndoStack = [];

// Image Preview Modal
const imagePreviewOverlay = $('image-preview-overlay');
const imagePreviewImg = $('image-preview-img');
const imagePreviewInfo = $('image-preview-info');
const imagePreviewClose = $('image-preview-close');
const imagePreviewPrev = $('image-preview-prev');
const imagePreviewNext = $('image-preview-next');

function getPreviewableScenes() {
  return createScenes ? createScenes.filter(s => s.imgDataUrl) : [];
}

function openImagePreview(idx) {
  const scenes = getPreviewableScenes();
  if (!scenes.length) return;
  imagePreviewIndex = Math.max(0, Math.min(idx, scenes.length - 1));
  imagePreviewImg.src = scenes[imagePreviewIndex].imgDataUrl;
  imagePreviewInfo.textContent = `Scene ${imagePreviewIndex + 1} of ${scenes.length}`;
  imagePreviewPrev.style.display = scenes.length > 1 ? '' : 'none';
  imagePreviewNext.style.display = scenes.length > 1 ? '' : 'none';
  imagePreviewOverlay.classList.add('visible');
}

function closeImagePreview() {
  imagePreviewOverlay.classList.remove('visible');
}

function navigatePreview(dir) {
  const scenes = getPreviewableScenes();
  if (!scenes.length) return;
  imagePreviewIndex = (imagePreviewIndex + dir + scenes.length) % scenes.length;
  imagePreviewImg.src = scenes[imagePreviewIndex].imgDataUrl;
  imagePreviewInfo.textContent = `Scene ${imagePreviewIndex + 1} of ${scenes.length}`;
}

imagePreviewClose.addEventListener('click', closeImagePreview);
imagePreviewPrev.addEventListener('click', () => navigatePreview(-1));
imagePreviewNext.addEventListener('click', () => navigatePreview(1));
imagePreviewOverlay.addEventListener('click', (e) => {
  if (e.target === imagePreviewOverlay) closeImagePreview();
});
document.addEventListener('keydown', (e) => {
  if (!imagePreviewOverlay.classList.contains('visible')) return;
  if (e.key === 'Escape') closeImagePreview();
  if (e.key === 'ArrowLeft') navigatePreview(-1);
  if (e.key === 'ArrowRight') navigatePreview(1);
});

// Audio Import
const createSilenceSection = $('create-silence-section');
const createSilThreshold = $('create-sil-threshold');
const createSilThresholdVal = $('create-sil-threshold-val');
const createSilMinDur = $('create-sil-min-dur');
const createSilMethod = $('create-sil-method');
const btnCreateSilDetect = $('btn-create-sil-detect');
const btnCreateSilApply = $('btn-create-sil-apply');
const btnCreateSilReset = $('btn-create-sil-reset');
const createSilInfo = $('create-sil-info');
const createSilVisual = $('create-sil-visual');
let createDetectedRegions = [];

btnCreateImportAudio.addEventListener('click', () => createAudioInput.click());
createAudioInput.addEventListener('change', async () => {
  const file = createAudioInput.files[0];
  if (!file) return;
  createAudioInput.value = '';
  try {
    createAudioFile = file;
    createOriginalBuffer = await loadAudioBuffer(file);
    createAudioBuffer = createOriginalBuffer;
    createAudioName.textContent = file.name;
    createDetectedRegions = [];
    btnCreateSilApply.disabled = true;
    createSilInfo.textContent = '';
    createSilVisual.style.display = 'none';
    updateCreateButtons();
    updateStepStates();
    await showCreateAudioEditor();
  } catch (e) {
    createAudioName.textContent = 'Could not load audio file. Try MP3 or WAV format.';
  }
});

// ── Podcast Audio Import (Create flow) ──
const createPodcastAudioInput = $('create-podcast-audio-input');
const btnCreatePodcastAudio = $('btn-create-podcast-audio');
if (btnCreatePodcastAudio) {
  btnCreatePodcastAudio.addEventListener('click', () => createPodcastAudioInput.click());
}
if (createPodcastAudioInput) {
  createPodcastAudioInput.addEventListener('change', async () => {
    const file = createPodcastAudioInput.files[0];
    if (!file) return;
    createPodcastAudioInput.value = '';
    try {
      createAudioFile = file;
      createOriginalBuffer = await loadAudioBuffer(file);
      createAudioBuffer = createOriginalBuffer;
      createAudioName.textContent = file.name;
      createDetectedRegions = [];
      btnCreateSilApply.disabled = true;
      createSilInfo.textContent = '';
      createSilVisual.style.display = 'none';
      updateCreateButtons();
      updateStepStates();
      await showCreateAudioEditor();
    } catch (e) {
      createAudioName.textContent = 'Could not load audio file. Try MP3 or WAV format.';
    }
  });
}

// ── Speaker Video Import (Create flow) ──
let createPipVideoEl = null;
let createPipVideoSrc = null;

const btnCreatePipImport = $('btn-create-pip-import');
const createPipInput = $('create-pip-input');
const createPipName = $('create-pip-name');
const btnCreatePipRemove = $('btn-create-pip-remove');

btnCreatePipImport.addEventListener('click', () => createPipInput.click());
createPipInput.addEventListener('change', async () => {
  const file = createPipInput.files[0];
  if (!file) return;
  createPipInput.value = '';
  try {
    // Create video element
    const videoEl = document.createElement('video');
    videoEl.muted = true; videoEl.preload = 'auto'; videoEl.playsInline = true;
    const blobUrl = URL.createObjectURL(file);
    videoEl.src = blobUrl;
    await new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = resolve;
      videoEl.onerror = () => reject(new Error('Cannot load video'));
    });

    // Extract audio from the video file
    if (ensureAudioCtx().state === 'suspended') await ensureAudioCtx().resume();
    const arrayBuf = await file.arrayBuffer();
    createOriginalBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf.slice(0));
    createAudioBuffer = createOriginalBuffer;
    createAudioFile = file;

    // Store PiP video (also used for video timeline on send to editor)
    createPipVideoEl = videoEl;
    createPipVideoSrc = blobUrl;

    // Update UI
    createAudioName.textContent = `Audio extracted from: ${file.name}`;
    createPipName.textContent = `${file.name} (${fmtShort(videoEl.duration)})`;
    btnCreatePipRemove.style.display = '';
    createDetectedRegions = [];
    btnCreateSilApply.disabled = true;
    createSilInfo.textContent = '';
    createSilVisual.style.display = 'none';
    updateCreateButtons();
    updateStepStates();
    await showCreateAudioEditor();
  } catch (e) {
    createPipName.textContent = 'Could not load video. Try MP4 or WebM format.';
  }
});

btnCreatePipRemove.addEventListener('click', () => {
  if (createPipVideoSrc) URL.revokeObjectURL(createPipVideoSrc);
  createPipVideoEl = null;
  createPipVideoSrc = null;
  createPipName.textContent = '';
  btnCreatePipRemove.style.display = 'none';
});

createSilThreshold.addEventListener('input', () => {
  createSilThresholdVal.textContent = createSilThreshold.value + ' dB';
});

// Detect silence against current working audio (preserves prior edits like trim/delete)
btnCreateSilDetect.addEventListener('click', () => {
  const buf = createAudioBuffer || createOriginalBuffer;
  if (!buf) return;
  const threshDb = parseFloat(createSilThreshold.value);
  const minDur = parseFloat(createSilMinDur.value);
  const mode = createSilMethod.value;
  createDetectedRegions = detectSilence(buf, threshDb, minDur, mode);

  if (createDetectedRegions.length === 0) {
    createSilInfo.textContent = 'No silent regions found. Try adjusting threshold.';
    createSilInfo.style.color = 'var(--text-muted)';
    btnCreateSilApply.disabled = true;
    createSilVisual.style.display = 'none';
  } else {
    const totalSilence = createDetectedRegions.reduce((s, r) => s + r.duration, 0);
    createSilInfo.textContent = `Found ${createDetectedRegions.length} silent regions (${totalSilence.toFixed(1)}s total)`;
    createSilInfo.style.color = '#f59e0b';
    btnCreateSilApply.disabled = false;

    // Render visual against current audio duration
    createSilVisual.innerHTML = '';
    createSilVisual.style.display = 'block';
    const dur = buf.duration;
    for (const r of createDetectedRegions) {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute; top:0; height:100%; background:rgba(239,68,68,0.5); border-radius:2px;`;
      el.style.left = ((r.startTime / dur) * 100) + '%';
      el.style.width = Math.max(((r.duration / dur) * 100), 0.3) + '%';
      el.title = `${r.startTime.toFixed(2)}s – ${r.endTime.toFixed(2)}s (${r.duration.toFixed(2)}s)`;
      createSilVisual.appendChild(el);
    }
  }
});

// Apply silence removal against current working audio
btnCreateSilApply.addEventListener('click', () => {
  const buf = createAudioBuffer || createOriginalBuffer;
  if (!buf || createDetectedRegions.length === 0) return;
  const filtered = removeSilentRegions(buf, createDetectedRegions);
  if (!filtered) {
    createSilInfo.textContent = 'Cannot remove — would delete all audio!';
    createSilInfo.style.color = '#ef4444';
    return;
  }
  const removed = buf.duration - filtered.duration;
  createAudioBuffer = filtered;

  createSilInfo.textContent = `✓ Removed ${removed.toFixed(1)}s of silence. Adjust settings and re-detect to try different values.`;
  createSilInfo.style.color = '#10b981';
  btnCreateSilApply.disabled = true;
  btnCreateSilReset.style.display = '';
  createSilVisual.style.display = 'none';
  syncDurationDisplays();
  updateCreateButtons();
  if (createWavesurfer) refreshCreateWaveform();
});

// Reset to original audio
btnCreateSilReset.addEventListener('click', () => {
  if (!createOriginalBuffer) return;
  createAudioBuffer = createOriginalBuffer;
  createSilInfo.textContent = 'Restored original audio.';
  createSilInfo.style.color = 'var(--text-muted)';
  btnCreateSilReset.style.display = 'none';
  btnCreateSilApply.disabled = true;
  createDetectedRegions = [];
  createSilVisual.style.display = 'none';
  syncDurationDisplays();
  updateCreateButtons();
  if (createWavesurfer) refreshCreateWaveform();
});

// ── Input Mode Toggle (Audio / Video / Text) ──
const createModeVoice = $('create-mode-voice');
const createModeVideo = $('create-mode-video');
const createModeText = $('create-mode-text');
const createVoiceSection = $('create-voice-section');
const createVideoSection = $('create-video-section');
const createTextSection = $('create-text-section');
const createTtsText = $('create-tts-text');

function setCreateInputMode(mode) {
  createInputMode = mode === 'video' ? 'podcast' : mode; // video tab = podcast mode
  createModeVoice.classList.toggle('active', mode === 'voice');
  createModeVideo.classList.toggle('active', mode === 'video');
  createModeText.classList.toggle('active', mode === 'text');
  createVoiceSection.classList.toggle('hidden', mode !== 'voice');
  createVideoSection.classList.toggle('hidden', mode !== 'video');
  createTextSection.classList.toggle('hidden', mode !== 'text');
  // Language row: show for text mode or animated mode
  const langRow = $('create-language-selection-row');
  if (langRow) langRow.style.display = (mode === 'text' || createVideoMode === 'animated') ? '' : 'none';
  // Reset language selections when leaving text mode (unless animated keeps them)
  if (mode !== 'text' && createVideoMode !== 'animated') {
    if ($('create-output-language')) $('create-output-language').value = '';
    if ($('create-subtitle-language')) $('create-subtitle-language').value = '';
    if (typeof createOutputLanguage !== 'undefined') createOutputLanguage = '';
    if (typeof createSubtitleLanguage !== 'undefined') createSubtitleLanguage = '';
  }
  updateCreateButtons();
  updateStepStates();
  // Auto-filter templates: podcast tab → show podcast category, others → show all
  if (mode === 'video') {
    setTemplateCategoryFilter('podcast');
    // Clear non-podcast template selection
    if (selectedTemplate && !selectedTemplate.startsWith('podcast-') && selectedTemplate !== 'blank') {
      applyTemplate('blank');
    }
  } else {
    setTemplateCategoryFilter('all');
  }
}
createModeVoice.addEventListener('click', () => setCreateInputMode('voice'));
createModeVideo.addEventListener('click', () => setCreateInputMode('video'));
createModeText.addEventListener('click', () => setCreateInputMode('text'));

// ── TTS Generation ──
async function generateTTSGemini(text, voiceName, apiKey) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            }
          }
        }
      })
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini TTS error ${resp.status}`);
  }
  const data = await resp.json();
  const part = data.candidates?.[0]?.content?.parts?.[0];
  if (!part?.inlineData?.data) throw new Error('No audio returned from Gemini TTS');
  const b64 = part.inlineData.data;
  const mime = part.inlineData.mimeType || 'audio/wav';
  return { base64: b64, mimeType: mime };
}

async function generateTTSGCloud(text, voiceName, apiKey, langCode) {
  // Use provided langCode or detect from voice name
  const lc = langCode || (voiceName.startsWith('ta-') ? 'ta-IN' : voiceName.startsWith('hi-') ? 'hi-IN' : voiceName.startsWith('te-') ? 'te-IN' : voiceName.startsWith('ml-') ? 'ml-IN' : voiceName.startsWith('es-') ? 'es-ES' : voiceName.startsWith('fr-') ? 'fr-FR' : 'en-US');
  const resp = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: lc, name: voiceName },
        audioConfig: { audioEncoding: 'MP3' }
      })
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Google Cloud TTS error ${resp.status}`);
  }
  const data = await resp.json();
  if (!data.audioContent) throw new Error('No audio returned from Google Cloud TTS');
  return { base64: data.audioContent, mimeType: 'audio/mp3' };
}

// Wrap raw PCM (LINEAR16) samples into a proper WAV file
function wrapPcmInWav(pcmBytes, sampleRate, numChannels, bitsPerSample) {
  const dataSize = pcmBytes.length;
  const headerSize = 44;
  const wav = new Uint8Array(headerSize + dataSize);
  const view = new DataView(wav.buffer);
  // RIFF header
  wav.set([0x52,0x49,0x46,0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  wav.set([0x57,0x41,0x56,0x45], 8); // "WAVE"
  // fmt chunk
  wav.set([0x66,0x6d,0x74,0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true); // byte rate
  view.setUint16(32, numChannels * bitsPerSample / 8, true); // block align
  view.setUint16(34, bitsPerSample, true);
  // data chunk
  wav.set([0x64,0x61,0x74,0x61], 36); // "data"
  view.setUint32(40, dataSize, true);
  wav.set(pcmBytes, headerSize);
  return wav;
}

async function decodeBase64Audio(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  let audioBytes = bytes;

  // If raw PCM (no container headers), wrap in WAV
  // Gemini TTS returns raw PCM at 24kHz 16-bit mono
  if (mimeType.includes('L16') || mimeType.includes('pcm') ||
      (mimeType.includes('wav') && bytes[0] !== 0x52)) { // 0x52 = 'R' (RIFF header)
    // Detect sample rate from mime type (e.g. audio/L16;rate=24000) or default 24000
    let sampleRate = 24000;
    const rateMatch = mimeType.match(/rate=(\d+)/);
    if (rateMatch) sampleRate = parseInt(rateMatch[1]);
    audioBytes = wrapPcmInWav(bytes, sampleRate, 1, 16);
  }

  const blobType = (audioBytes === bytes && !mimeType.includes('L16') && !mimeType.includes('pcm'))
    ? (mimeType.split(';')[0] || 'audio/mpeg') : 'audio/wav';
  const blob = new Blob([audioBytes], { type: blobType });
  const arrayBuf = audioBytes.buffer.slice(audioBytes.byteOffset, audioBytes.byteOffset + audioBytes.byteLength);
  const audioBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf);
  return { audioBuffer, blob };
}


// ══════════════════════════════════════════
//  AUDIO EDITOR (WaveSurfer in Step 2)
// ══════════════════════════════════════════
const createAudioEditor = $('create-audio-editor');
const createWaveformEl  = $('create-waveform');
const btnCreatePlay     = $('btn-create-play');
const btnCreatePlaySel  = $('btn-create-play-sel');
const btnCreateStop     = $('btn-create-stop');
const btnCreateTrim     = $('btn-create-trim');
const btnCreateDel      = $('btn-create-del');
const btnCreateAddAudio = $('btn-create-add-audio');
const createInsertInput = $('create-insert-input');
const btnCreateEditUndo = $('btn-create-edit-undo');
const btnCreateEditReset= $('btn-create-edit-reset');
const createEditTime    = $('create-edit-time');
const createEditSelection = $('create-edit-selection');
const createEditTotal   = $('create-edit-total');
const createEditDuration= $('create-edit-duration');

function initCreateWaveSurfer() {
  if (createWavesurfer) { createWavesurfer.destroy(); createWavesurfer = null; }
  createRegionsPlugin = WaveSurfer.Regions.create();
  createWavesurfer = WaveSurfer.create({
    container: createWaveformEl,
    waveColor: '#1da8cc',
    progressColor: '#50d0f0',
    cursorColor: '#ff6b6b',
    cursorWidth: 2,
    height: 80,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    autoScroll: false,
    autoCenter: false,
    plugins: [createRegionsPlugin],
  });
  createWavesurfer.on('timeupdate', t => {
    createEditTime.textContent = fmt(t);
  });
  createWavesurfer.on('decode', () => {
    createEditTotal.textContent = fmt(createWavesurfer.getDuration());
  });
  createWavesurfer.on('play', () => {
    btnCreatePlay.innerHTML = '&#10074;&#10074; Pause';
  });
  createWavesurfer.on('pause', () => {
    btnCreatePlay.innerHTML = '&#9654; Play';
  });
  createRegionsPlugin.enableDragSelection({ color: 'rgba(108,99,255,0.25)' });
  createRegionsPlugin.on('region-created', r => {
    // Only keep one region at a time
    createRegionsPlugin.getRegions().forEach(x => { if (x.id !== r.id) x.remove(); });
    createActiveRegion = r;
    updateCreateEditButtons();
    // Update on resize
    r.on('update-end', () => updateCreateEditButtons());
  });
  createRegionsPlugin.on('region-removed', () => {
    createActiveRegion = null;
    updateCreateEditButtons();
  });
}

async function refreshCreateWaveform() {
  if (!createAudioBuffer) return;
  initCreateWaveSurfer();
  const wavBlob = audioBufferToWavBlob(createAudioBuffer);
  const url = URL.createObjectURL(wavBlob);
  await createWavesurfer.load(url);
  URL.revokeObjectURL(url);
  createActiveRegion = null;
  updateCreateEditButtons();
}

function updateCreateEditButtons() {
  const hasAudio = !!createAudioBuffer;
  const hasRegion = !!createActiveRegion;
  btnCreatePlay.disabled = !hasAudio;
  btnCreateStop.disabled = !hasAudio;
  btnCreatePlaySel.disabled = !hasRegion;
  btnCreateTrim.disabled = !hasRegion;
  btnCreateDel.disabled = !hasRegion;
  btnCreateEditUndo.disabled = createUndoStack.length === 0;
  createEditDuration.textContent = hasAudio ? fmt(createAudioBuffer.duration) : '';
  if (hasRegion) {
    const s = createActiveRegion.start, e = createActiveRegion.end;
    createEditSelection.textContent = `Selected: ${fmt(s)} – ${fmt(e)} (${fmt(e - s)})`;
  } else {
    createEditSelection.textContent = 'Click and drag to select a region';
  }
  // Show reset if buffer differs from original
  btnCreateEditReset.style.display =
    (createOriginalBuffer && createAudioBuffer !== createOriginalBuffer) ? '' : 'none';
}

function createPushUndo() {
  createUndoStack.push(createAudioBuffer);
  if (createUndoStack.length > 20) createUndoStack.shift();
  btnCreateEditUndo.disabled = false;
}

async function showCreateAudioEditor() {
  createAudioEditor.classList.remove('hidden');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  createAudioEditor.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  createUndoStack = [];
  await refreshCreateWaveform();
}

function destroyCreateAudioEditor() {
  if (createWavesurfer) { createWavesurfer.destroy(); createWavesurfer = null; }
  createAudioEditor.classList.add('hidden');
  createUndoStack = [];
  createActiveRegion = null;
}

// Update duration display in the waveform editor
function syncDurationDisplays() {
  if (createAudioBuffer) {
    createEditDuration.textContent = fmt(createAudioBuffer.duration);
  }
}

// ── Audio Editor Button Handlers ──
btnCreatePlay.addEventListener('click', () => {
  if (!createWavesurfer) return;
  createWavesurfer.isPlaying() ? createWavesurfer.pause() : createWavesurfer.play();
});

btnCreatePlaySel.addEventListener('click', () => {
  if (createActiveRegion) createActiveRegion.play();
});

btnCreateStop.addEventListener('click', () => {
  if (createWavesurfer) createWavesurfer.stop();
});

btnCreateTrim.addEventListener('click', async () => {
  if (!createActiveRegion || !createAudioBuffer) return;
  createPushUndo();
  createAudioBuffer = extractRegion(createAudioBuffer, createActiveRegion.start, createActiveRegion.end);
  syncDurationDisplays();
  await refreshCreateWaveform();
  updateCreateButtons();
  updateStepStates();
});

btnCreateDel.addEventListener('click', async () => {
  if (!createActiveRegion || !createAudioBuffer) return;
  createPushUndo();
  const result = deleteRegion(createAudioBuffer, createActiveRegion.start, createActiveRegion.end);
  if (!result) return;
  createAudioBuffer = result;
  syncDurationDisplays();
  await refreshCreateWaveform();
  updateCreateButtons();
  updateStepStates();
});

btnCreateAddAudio.addEventListener('click', () => createInsertInput.click());
createInsertInput.addEventListener('change', async () => {
  const f = createInsertInput.files[0];
  if (!f) return;
  createInsertInput.value = '';
  try {
    const insertTime = createWavesurfer ? createWavesurfer.getCurrentTime() : (createAudioBuffer ? createAudioBuffer.duration : 0);
    const insertBuf = await loadAudioBuffer(f);
    createPushUndo();
    if (createAudioBuffer) {
      createAudioBuffer = insertAudioAt(createAudioBuffer, insertBuf, insertTime);
    } else {
      createAudioBuffer = insertBuf;
      createOriginalBuffer = insertBuf;
    }
    syncDurationDisplays();
    await refreshCreateWaveform();
    updateCreateButtons();
    updateStepStates();
  } catch (e) {
    console.error('Insert audio error:', e);
  }
});

btnCreateEditUndo.addEventListener('click', async () => {
  if (!createUndoStack.length) return;
  createAudioBuffer = createUndoStack.pop();
  btnCreateEditUndo.disabled = createUndoStack.length === 0;
  syncDurationDisplays();
  await refreshCreateWaveform();
  updateCreateButtons();
  updateStepStates();
});

btnCreateEditReset.addEventListener('click', async () => {
  if (!createOriginalBuffer) return;
  createUndoStack = [];
  createAudioBuffer = createOriginalBuffer;
  syncDurationDisplays();
  await refreshCreateWaveform();
  updateCreateButtons();
  updateStepStates();
});

// ── Text segmentation for text mode ──
function segmentTextForStoryboard(text, audioDuration) {
  // Split by sentences (handling Tamil and English punctuation)
  const sentences = text.split(/(?<=[.!?।\n])\s*/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return [];

  // Calculate total char length for proportional timing
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  const segments = [];
  let currentTime = 0;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i].trim();
    if (!s) continue;
    // Proportional duration based on character count
    let dur = (s.length / totalChars) * audioDuration;
    // Enforce 5-15s bounds, merge tiny segments
    dur = Math.max(2, Math.min(15, dur));
    const endTime = Math.min(currentTime + dur, audioDuration);
    segments.push({
      startTime: currentTime,
      endTime: endTime,
      text: s,
      sceneDescription: '', // Will be filled by Gemini
    });
    currentTime = endTime;
  }

  // Adjust last segment to cover full duration
  if (segments.length > 0) {
    segments[segments.length - 1].endTime = audioDuration;
  }

  // Merge segments that are too short (< 3s) with neighbors
  const merged = [];
  for (const seg of segments) {
    if (merged.length > 0 && (seg.endTime - seg.startTime) < 3) {
      const prev = merged[merged.length - 1];
      prev.endTime = seg.endTime;
      prev.text += ' ' + seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  // Split segments that are too long (> 15s)
  const final = [];
  for (const seg of merged) {
    const dur = seg.endTime - seg.startTime;
    if (dur > 15) {
      const parts = Math.ceil(dur / 15);
      const partDur = dur / parts;
      const words = seg.text.split(/\s+/);
      const wordsPerPart = Math.ceil(words.length / parts);
      for (let p = 0; p < parts; p++) {
        final.push({
          startTime: seg.startTime + p * partDur,
          endTime: seg.startTime + (p + 1) * partDur,
          text: words.slice(p * wordsPerPart, (p + 1) * wordsPerPart).join(' '),
          sceneDescription: '',
        });
      }
    } else {
      final.push(seg);
    }
  }

  return final;
}

// Human-readable API error messages (#13)
function friendlyApiError(msg) {
  if (!msg) return 'Unknown error';
  if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate'))
    return 'Rate limit reached — wait a minute and retry, or check your API quota at aistudio.google.com';
  if (msg.includes('403') || msg.toLowerCase().includes('permission'))
    return 'API key lacks permission — verify your key at aistudio.google.com';
  if (msg.includes('401') || msg.toLowerCase().includes('auth'))
    return 'Invalid API key — check and re-save your key';
  if (msg.includes('400') || msg.toLowerCase().includes('invalid'))
    return 'Invalid request — audio may be too large or in an unsupported format';
  if (msg.includes('500') || msg.includes('503'))
    return 'Gemini server error — try again in a moment';
  if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network'))
    return 'Network error — check your internet connection';
  return msg;
}

// Structured error classification — returns { title, hint, canRetry }
function classifyError(msg) {
  if (!msg) return { title: 'Unknown error', hint: 'Try again.', canRetry: true };
  if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate'))
    return { title: 'Rate limit reached', hint: 'Wait ~60s then retry. Check quota at aistudio.google.com.', canRetry: true };
  if (msg.includes('403') || msg.toLowerCase().includes('permission'))
    return { title: 'Permission denied', hint: 'Your API key may lack Imagen access. Check aistudio.google.com.', canRetry: false };
  if (msg.includes('401') || msg.toLowerCase().includes('auth'))
    return { title: 'Invalid API key', hint: 'Re-save your API key and try again.', canRetry: false };
  if (msg.toLowerCase().includes('safety') || msg.toLowerCase().includes('blocked'))
    return { title: 'Prompt blocked', hint: 'Edit the scene description to remove sensitive content.', canRetry: false };
  if (msg.includes('400') || msg.toLowerCase().includes('invalid'))
    return { title: 'Bad request', hint: 'The prompt may be too long or contain unsupported content.', canRetry: true };
  if (msg.includes('500') || msg.includes('503'))
    return { title: 'Server error', hint: 'Gemini is having issues. Try again in a moment.', canRetry: true };
  if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network'))
    return { title: 'Network error', hint: 'Check your internet connection and retry.', canRetry: true };
  return { title: 'Generation failed', hint: msg.length < 120 ? msg : 'An unexpected error occurred. Try again.', canRetry: true };
}

// Robust JSON parser for Gemini responses (handles markdown fences, trailing commas, missing quotes, extra text)
function parseGeminiJson(text) {
  // Strip markdown code fences
  let s = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Try direct parse first
  try { return JSON.parse(s); } catch (_) {}
  // Extract JSON array from surrounding text
  const arrMatch = s.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    let jsonStr = arrMatch[0];
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(jsonStr); } catch (_) {}
    // Fix missing quotes around string values (common with non-English text)
    // Pattern: "key": value without quotes → "key": "value"
    jsonStr = jsonStr.replace(/"(text|sceneDescription|title|summary)":\s*([^"\[\]{},][^,}\]]*)/g, (match, key, val) => {
      val = val.trim().replace(/"/g, '\\"');
      return `"${key}": "${val}"`;
    });
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(jsonStr); } catch (_) {}
  }
  // Handle truncated JSON — extract all complete objects
  const objects = [];
  const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let m;
  while ((m = objRegex.exec(s)) !== null) {
    let objStr = m[0];
    try {
      const obj = JSON.parse(objStr);
      if (obj.startTime !== undefined || obj.prompt !== undefined || obj.title !== undefined) objects.push(obj);
    } catch (_) {
      // Try fixing missing quotes in this object too
      objStr = objStr.replace(/"(text|sceneDescription|title|summary)":\s*([^"\[\]{},][^,}]*)/g, (match, key, val) => {
        val = val.trim().replace(/"/g, '\\"');
        return `"${key}": "${val}"`;
      });
      try {
        const obj = JSON.parse(objStr);
        if (obj.startTime !== undefined || obj.prompt !== undefined || obj.title !== undefined) objects.push(obj);
      } catch (_) {}
    }
  }
  if (objects.length > 0) return objects;
  // Extract single JSON object
  const objMatch = s.match(/\{[\s\S]*\}/);
  if (objMatch) {
    let jsonStr = objMatch[0];
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(jsonStr); } catch (_) {}
  }
  throw new Error('Could not parse Gemini response as JSON. Raw response: ' + s.slice(0, 200));
}

// Progressive disclosure: show each step only after previous is complete
function updateStepStates() {
  const hasKey = !!getApiKey();
  const hasAudio = !!createAudioBuffer;
  const hasTemplate = !!selectedTemplate;
  const hasTranscript = !!createTranscript;
  const hasScenes = createScenes && createScenes.length > 0;
  const hasImages = hasScenes && createScenes.some(s => s.imgDataUrl);
  const allImagesDone = hasImages && createScenes.every(s => s.status === 'done');
  const hasChapters = createChapters && createChapters.length > 0;
  const isPodcast = createInputMode === 'podcast';

  // Helper: show/hide step by ID
  function showStep(id, show) {
    const el = $(id);
    if (el) el.style.display = show ? '' : 'none';
  }
  function markStep(id, done, active) {
    const el = $(id);
    if (el) {
      el.classList.toggle('step-done', !!done);
      el.classList.toggle('step-active', !!active);
    }
  }

  // Step 1: Input & Template — always visible
  markStep('create-input-step', hasAudio && hasTemplate, !hasAudio || !hasTemplate);

  // Step 2: Storyboard & Prompt — show only when output exists
  showStep('create-transcribe-step', hasScenes);
  markStep('create-transcribe-step', hasScenes, false);

  // Step 3: Chapter Splitting — podcast only, after transcript
  showStep('create-chapter-step', isPodcast && hasTranscript);
  if (isPodcast) markStep('create-chapter-step', hasChapters, hasTranscript && !hasChapters);

  // Step 5: Visual References — hidden in V1, re-enable in V2
  // showStep('create-references-step', hasScenes);
  // if (hasScenes && typeof renderSceneAssignments === 'function') renderSceneAssignments();

  // Step 6: Generate Images — after images start appearing (shown by launchImageAgent)
  showStep('create-generate-step', hasImages);
  markStep('create-generate-step', allImagesDone, hasImages && !allImagesDone);

  // Step 7: Animated Videos — only in animated mode, after images generated
  const hasVideos = hasImages && createVideoMode === 'animated' && createScenes.some(s => s.videoUrl);
  showStep('create-video-step', createVideoMode === 'animated' && hasImages);
  if (hasVideos) markStep('create-video-step', createScenes.every(s => s.videoUrl || s.status === 'error'), true);

  // Steps 8 & 9: only shown after BGM agent marks done or error
  const bgmState = _createAgentState && _createAgentState['bgm']?.status;
  const hasBgm = bgmState === 'done' || bgmState === 'error';

  // Step 8: Multi-Language — illustrated only (animated uses upfront language selection)
  showStep('create-language-step', hasBgm && createVideoMode !== 'animated');
  if (hasBgm && createVideoMode !== 'animated' && typeof renderPrimaryAudioCard === 'function') renderPrimaryAudioCard();
  // Voiceover: default to done when visible and nothing is generating (illustrated only)
  if (hasBgm && createVideoMode !== 'animated') {
    const voState = _createAgentState && _createAgentState['voiceover'];
    const isGenerating = typeof langGenerating !== 'undefined' && langGenerating;
    if (!isGenerating && (!voState || voState.status === 'waiting')) {
      const doneTracks = (typeof languageTracks !== 'undefined' ? languageTracks : []).filter(t => t.status === 'done').length;
      updateCreateAgent('voiceover', 'done', doneTracks > 0 ? `${doneTracks} track${doneTracks > 1 ? 's' : ''} ready` : '');
    }
  }

  // Step 9: Send to Editor — after BGM done
  showStep('create-send-step', hasBgm);
  markStep('create-send-step', false, hasBgm);

  // Renumber only visible steps sequentially; Video Mode step is unnumbered
  let stepNum = 1;
  createPage.querySelectorAll('.create-step').forEach(el => {
    if (el.id === 'create-video-mode-step') return;
    const numEl = el.querySelector('.step-num, .agent-step-icon');
    if (!numEl) return;
    if (el.style.display !== 'none') numEl.textContent = stepNum++;
  });
}

// Auto-save create state to localStorage (#4)
function autoSaveCreateState() {
 
  try {
    const state = {
      transcript: createTranscript,
      scenes: createScenes ? createScenes.map(s => ({
        prompt: s.prompt, startTime: s.startTime, endTime: s.endTime,
        duration: s.duration, text: s.text, status: s.status,
        // Skip base64 images to stay within localStorage 5MB limit
      })) : null,
      stylePrompt: createStylePrompt,
      stylePreset: createStylePreset,
      selectedTemplate: selectedTemplate,
      characters: storyCharacters.map(c => ({ id: c.id, name: c.name, description: c.description, imgDataUrl: c.imgDataUrl })),
      environments: storyEnvironments.map(e => ({ id: e.id, name: e.name, description: e.description, imgDataUrl: e.imgDataUrl })),
      timestamp: Date.now(),
    };
    localStorage.setItem('stori_create_autosave', JSON.stringify(state));
  } catch (e) {
    console.warn('Auto-save failed:', e.message);
  }
}

// Restore auto-saved state on page load
function restoreAutoSaveIfAvailable() {
  try {
    const saved = localStorage.getItem('stori_create_autosave');
    if (!saved) return false;
    const state = JSON.parse(saved);
    // Only restore if it's recent (within 24 hours)
    if (Date.now() - state.timestamp > 24 * 60 * 60 * 1000) {
      localStorage.removeItem('stori_create_autosave');
      return false;
    }
    return state;
  } catch (e) { return false; }
}

// Transcribe
btnCreateTranscribe.addEventListener('click', async () => {
  const key = getCreateGeminiKey();
  if (!key) return;
  if (createInputMode !== 'text' && !createAudioBuffer) return;

  // Capture language selections at launch time
  createOutputLanguage = $('create-output-language')?.value || '';
  createSubtitleLanguage = $('create-subtitle-language')?.value || '';

  btnCreateTranscribe.disabled = true;
  if (typeof updateCreateBreadcrumb === 'function') updateCreateBreadcrumb('Transcript');
  resetCreateAgentTasks('storyboard');
  updateCreateAgent('storyboard', 'running', '');
  // Pre-register all expected subtasks so "all done" check doesn't fire prematurely
  if (createInputMode === 'text') {
    updateCreateAgentTask('storyboard', 'translate', 'pending', 'Translating to English…');
    updateCreateAgentTask('storyboard', 'tts', 'pending', 'Generating audio…');
    updateCreateAgentTask('storyboard', 'segment', 'pending', 'Segmenting text…');
    updateCreateAgentTask('storyboard', 'prompts', 'pending', 'Writing scene descriptions…');
  } else {
    updateCreateAgentTask('storyboard', 'audio', 'pending', 'Processing audio…');
    updateCreateAgentTask('storyboard', 'transcribe', 'pending', 'Transcribing…');
    updateCreateAgentTask('storyboard', 'prompts', 'pending', 'Writing scene descriptions…');
  }
  // Translate/TTS/subtitles tasks for animated audio/podcast mode
  if (createVideoMode === 'animated' && createInputMode !== 'text') {
    if (createOutputLanguage && createOutputLanguage !== 'original') {
      updateCreateAgentTask('storyboard', 'translate', 'pending', 'Translating…');
      updateCreateAgentTask('storyboard', 'tts', 'pending', 'Generating speech…');
    }
    if (createSubtitleLanguage) {
      updateCreateAgentTask('storyboard', 'subtitles', 'pending', 'Generating subtitles…');
    }
  }

  try {
    let segments;

    if (createInputMode === 'text') {
      // ── Text mode: translate → TTS → segment → scene descriptions ──
      const inputText = $('create-tts-text')?.value?.trim();
      if (!inputText) throw new Error('No text entered');

      // Step 1: Translate to English (Gemini handles detection + translation)
      updateCreateAgentTask('storyboard', 'translate', 'running', 'Translating…');
      const translateResp = await callGeminiAPI(['gemini-2.5-flash'], {
        contents: [{ parts: [{ text: `If the following text is not in English, translate it to English. If it is already in English, return it exactly as-is. Return only the text, no explanations.\n\n${inputText}` }] }]
      }, key);
      const englishText = translateResp.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || inputText;
      updateCreateAgentTask('storyboard', 'translate', 'done', 'Text ready');

      // Step 2: Translate English → output language, then TTS
      updateCreateAgentTask('storyboard', 'tts', 'running', 'Preparing audio…');
      const outputLangEl = $('create-output-language');
      const outputLangCode = createOutputLanguage;
      const outputLangName = outputLangEl?.options[outputLangEl?.selectedIndex]?.text?.replace(/^[^\w]+/, '').trim() || outputLangCode;
      let ttsText = englishText;
      if (outputLangCode && outputLangCode !== 'en') {
        updateCreateAgentTask('storyboard', 'tts', 'running', 'Translating…');
        const outTransResp = await callGeminiAPI(['gemini-2.5-flash'], {
          contents: [{ parts: [{ text: `Translate the following text to ${outputLangName}. Return only the translated text, no explanations.\n\n${englishText}` }] }]
        }, key);
        ttsText = outTransResp.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || englishText;
      }
      updateCreateAgentTask('storyboard', 'tts', 'running', 'Generating audio…');
      const ttsResult = await generateTTSGemini(ttsText, 'Kore', key);
      const { audioBuffer: ttsAudioBuf } = await decodeBase64Audio(ttsResult.base64, ttsResult.mimeType);
      createAudioBuffer = ttsAudioBuf;
      createOriginalBuffer = ttsAudioBuf;
      trackCost('tts', 1);
      updateCreateAgentTask('storyboard', 'tts', 'done', `${fmtShort(ttsAudioBuf.duration)} audio ready`);

      // Step 3: Segment English text using real TTS duration
      updateCreateAgentTask('storyboard', 'segment', 'running', 'Segmenting text…');
      segments = segmentTextForStoryboard(englishText, createAudioBuffer.duration);
      updateCreateAgentTask('storyboard', 'segment', 'done', `${segments.length} segments`);
      // #5 Ghost timeline — show skeleton cards with timecodes while prompts generate
      if (typeof renderGhostStoryboard === 'function') renderGhostStoryboard(segments);

      // Step 4: Generate scene descriptions from English segments
      updateCreateAgentTask('storyboard', 'prompts', 'running', 'Writing scene descriptions…');
      const segTexts = segments.map((s, i) => `Segment ${i+1} [${s.startTime.toFixed(1)}s – ${s.endTime.toFixed(1)}s]: "${s.text}"`).join('\n');

      const resp = await callGeminiAPI(['gemini-2.5-flash'], {
        contents: [{
          parts: [{ text: `Given these text segments from a script, generate a vivid visual scene description for each segment.${createVideoMode === 'animated' ? `\n\nIMPORTANT — ANIMATED VIDEO MODE: These will be used for AI video animation (Kling), NOT static images. Each description MUST describe cinematic MOTION:\n- Start with camera direction: pan left/right, zoom in/out, tracking shot, aerial view, dolly forward, tilt up/down.\n- Describe visible subject ACTION: walking, turning, flowing, dissolving, emerging, transforming.\n- Include environmental motion: wind in hair/trees, flowing water, drifting clouds, swirling particles, flickering light.\n- One continuous motion per scene — no cuts within a scene.` : ' Each description should be suitable for AI image generation.'}\n\n${segTexts}\n\nReturn ONLY a valid JSON array with no markdown formatting:\n[{"segmentIndex": 0, "sceneDescription": "A detailed visual description: subject, style, mood, colors, composition, camera direction and motion"}]\n\nImportant: sceneDescription should describe what should be SEEN, not just what is said. Make it artistic and visually compelling. One entry per segment, in order.` }]
        }]
      }, key);

      updateCreateAgentTask('storyboard', 'prompts', 'running', 'Processing scene descriptions…');
      const respText = resp.candidates?.[0]?.content?.parts?.[0]?.text;
      if (respText) {
        try {
          const descriptions = parseGeminiJson(respText);
          if (Array.isArray(descriptions)) {
            descriptions.forEach(d => {
              const idx = d.segmentIndex ?? descriptions.indexOf(d);
              if (segments[idx]) segments[idx].sceneDescription = d.sceneDescription || '';
            });
          }
        } catch (e) {
          console.warn('Could not parse scene descriptions, using defaults:', e);
        }
      }
      segments.forEach(s => {
        if (!s.sceneDescription) s.sceneDescription = `Visual scene depicting: ${s.text.slice(0, 100)}`;
      });

    } else {
      // ── Voice mode: full audio transcription ──
      updateCreateAgentTask('storyboard', 'audio', 'running', 'Converting audio…');

      const wavBlob = audioBufferToWavBlob(createAudioBuffer);
      updateCreateAgentTask('storyboard', 'audio', 'running', 'Encoding audio…');

      const base64DataUrl = await blobToBase64(wavBlob);
      const base64Data = base64DataUrl.split(',')[1];

      updateCreateAgentTask('storyboard', 'audio', 'done', 'Audio ready');
      updateCreateAgentTask('storyboard', 'transcribe', 'running', 'Sending to Gemini…');

      const transcribeBody = {
            contents: [{
              parts: [
                { inline_data: { mime_type: 'audio/wav', data: base64Data } },
                { text: createInputMode === 'podcast'
                  ? `Transcribe this podcast audio which is ${createAudioBuffer.duration.toFixed(1)} seconds long. Break it into segments of roughly 30-120 seconds each, splitting at natural topic or sentence boundaries.

STRICT RULES:
1. Segment length: 30-120 seconds. Split at natural pauses or topic changes.
2. Segments MUST be perfectly contiguous — no gaps. First starts at 0, last ends at ${createAudioBuffer.duration.toFixed(1)}.
3. EVERY part of the audio must be transcribed. Do NOT skip any section.
4. If silence or music, still create a segment with text like "[instrumental]" or "[silence]".

TIMESTAMP ACCURACY (CRITICAL):
- Listen carefully to WHEN each word is actually spoken in the audio.
- Do NOT compress all text into early timestamps. The speech spans the FULL ${createAudioBuffer.duration.toFixed(1)} seconds.
- Each segment's endTime must reflect when that portion of speech ACTUALLY ends in the audio, not just an estimate.
- The LAST segment MUST end at exactly ${createAudioBuffer.duration.toFixed(1)} seconds.
- If the audio is ${createAudioBuffer.duration.toFixed(1)} seconds, your timestamps should span from 0 to ${createAudioBuffer.duration.toFixed(1)} — not stop early at 60% or 70% of the duration.
- Double-check: does your last segment's endTime equal ${createAudioBuffer.duration.toFixed(1)}? If not, fix it.

CRITICAL JSON FORMATTING:
- Return ONLY a valid JSON array, no markdown, no code fences
- ALL string values MUST be wrapped in double quotes
- Escape any double quotes inside text with backslash: \\"
- Non-English text (Tamil, Hindi, etc.) MUST also be in double quotes

Example format:
[{"startTime": 0, "endTime": 60, "text": "transcribed words here", "sceneDescription": "", "emojis": ["🎙️","💭","✨"]}]

Note: sceneDescription can be empty — it will be generated later per chapter.
emojis: 3-5 emojis that capture the feeling and key subjects of THIS segment. Use vivid, evocative emojis (not generic ones). They'll play like a silent movie while images generate.`
                  : `Transcribe this audio which is ${createAudioBuffer.duration.toFixed(1)} seconds long. Break it into segments of roughly ${getSegmentDuration().min}-${getSegmentDuration().max} seconds each. The segments MUST cover the ENTIRE audio from 0.0 to ${createAudioBuffer.duration.toFixed(1)} seconds with NO gaps and NO skipped portions.

STRICT RULES (MUST follow ALL):
1. NO segment may exceed ${getSegmentDuration().max} seconds. If a natural segment is longer, split it into sub-segments of ${getSegmentDuration().max} seconds or less.
2. Minimum segment length: ${getSegmentDuration().min} seconds. Maximum: ${getSegmentDuration().max} seconds. Hard limit, NO exceptions.
3. Segments MUST be perfectly contiguous — each segment's startTime MUST equal the previous segment's endTime. No gaps allowed.
4. First segment startTime MUST be 0. Last segment endTime MUST be exactly ${createAudioBuffer.duration.toFixed(1)}.
5. EVERY part of the audio must be transcribed. Do NOT skip, summarize, or omit any section in the middle or end.
6. If the audio has silence or music without speech, still create a segment for it with text like "[instrumental]" or "[silence]".

VALIDATION: After generating, verify that your segments form a complete chain: 0 → ... → ${createAudioBuffer.duration.toFixed(1)} with no missing time ranges.

For each segment, provide the transcribed text AND a vivid visual scene description.${createVideoMode === 'animated' ? ` ANIMATED VIDEO MODE: Each sceneDescription MUST describe cinematic MOTION — start with camera direction (pan left/right, zoom in/out, tracking shot, dolly forward), describe subject action (walking, flowing, emerging, transforming), include environmental motion (wind, flowing water, drifting clouds). One continuous motion per scene, no cuts.` : ` Each sceneDescription should be suitable for AI image generation — vivid, specific, describing subject, style, mood, colors, and composition.`}

Return ONLY a valid JSON array with no markdown formatting, in this exact structure:
[{"startTime": 0, "endTime": 10, "text": "transcribed words here", "sceneDescription": "A detailed visual description", "emojis": ["🌊","🌙","⭐"]}]

Important:
- sceneDescription should describe what should be SEEN, not just what is said. Make it artistic and visually compelling.
- emojis: 3-5 emojis per segment that capture its feeling and key subjects (a silent emoji story of the scene). Pick vivid, specific emojis — not generic ones. They play like a silent movie while images generate.` }
              ]
            }],
            generationConfig: { response_mime_type: 'application/json' },
          };

      const totalDur = createAudioBuffer.duration;
      const maxSegDur = getSegmentDuration().max;

      updateCreateAgentTask('storyboard', 'transcribe', 'running', 'Transcribing…');
      const data = await callGeminiAPI(getTranscriptionModels(), transcribeBody);

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('No transcription returned from Gemini');

      segments = parseGeminiJson(text);
      if (!Array.isArray(segments) || segments.length === 0) {
        throw new Error('Invalid response format — expected JSON array of segments');
      }

      updateCreateAgentTask('storyboard', 'transcribe', 'running', 'Processing response…');

      // Post-process: clamp, split long segments, fill small gaps, extend to end
      segments.sort((a, b) => a.startTime - b.startTime);
      segments = segments.filter(s => s.startTime < totalDur);
      segments.forEach(s => { if (s.endTime > totalDur) s.endTime = totalDur; });
      const fixed = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const expectedStart = fixed.length > 0 ? fixed[fixed.length - 1].endTime : 0;
        if (expectedStart >= totalDur) break;
        // Fill small gaps with previous segment's description (not generic)
        const gapEnd = Math.min(seg.startTime, totalDur);
        if (gapEnd > expectedStart + 1) {
          const prevDesc = fixed.length > 0 ? fixed[fixed.length - 1].sceneDescription : seg.sceneDescription;
          fixed.push({ startTime: expectedStart, endTime: gapEnd, text: '[continued]', sceneDescription: prevDesc || seg.sceneDescription || '' });
          console.log(`[storyboard] Filled gap: ${expectedStart.toFixed(1)}s – ${gapEnd.toFixed(1)}s`);
        }
        seg.startTime = fixed.length > 0 ? fixed[fixed.length - 1].endTime : 0;
        seg.endTime = Math.min(seg.endTime, totalDur);
        // Split long segments instead of truncating
        if (seg.endTime - seg.startTime > maxSegDur) {
          const segDur = seg.endTime - seg.startTime;
          const parts = Math.ceil(segDur / maxSegDur);
          const partDur = segDur / parts;
          for (let p = 0; p < parts; p++) {
            fixed.push({ startTime: seg.startTime + p * partDur, endTime: seg.startTime + (p + 1) * partDur, text: p === 0 ? seg.text : '[continued]', sceneDescription: seg.sceneDescription || '' });
          }
          continue;
        }
        if (seg.endTime <= seg.startTime) continue;
        fixed.push(seg);
      }
      // Extend last segment to cover remaining time (no filler chunks)
      if (fixed.length > 0 && fixed[fixed.length - 1].endTime < totalDur - 0.5) {
        fixed[fixed.length - 1].endTime = totalDur;
        console.log(`[storyboard] Extended last segment to ${totalDur.toFixed(1)}s`);
      }
      segments = fixed;
      // #5 Ghost timeline — show skeleton cards after voice transcription
      if (typeof renderGhostStoryboard === 'function') renderGhostStoryboard(segments);
    }

    // ── Translation + TTS fork (animated mode only, when output language differs from source) ──
    if (createVideoMode === 'animated' && createOutputLanguage && createOutputLanguage !== 'original') {
      const targetLangName = SUPPORTED_LANGUAGES.find(l => l.code === createOutputLanguage)?.name || createOutputLanguage;

      // Step A: Translate all segment texts in one Gemini call (auto-detects source language)
      updateCreateAgentTask('storyboard', 'translate', 'running', 'Translating…');
      const segTextsForTranslation = segments.map((s, i) => `${i}: ${s.text}`).join('\n');
      const transResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Translate these numbered text segments to ${targetLangName}. Preserve the numbering. Return ONLY a valid JSON array:\n[{"index":0,"text":"translated text"}]\n\n${segTextsForTranslation}` }] }]
          })
        }
      );
      if (!transResp.ok) throw new Error(`Translation error ${transResp.status}`);
      const transData = await transResp.json();
      const transRaw = transData.candidates?.[0]?.content?.parts?.[0]?.text;
      const translations = transRaw ? parseGeminiJson(transRaw) : [];
      if (Array.isArray(translations)) {
        translations.forEach(t => { if (segments[t.index] !== undefined) segments[t.index].translatedText = t.text; });
      }
      segments.forEach(s => { if (!s.translatedText) s.translatedText = s.text; });
      updateCreateAgentTask('storyboard', 'translate', 'done', `${segments.length} segments translated`);

      // Step B: Generate per-scene TTS using Gemini Flash TTS
      updateCreateAgentTask('storyboard', 'tts', 'running', 'Generating speech…');
      const ttsBuffers = [];
      for (let i = 0; i < segments.length; i++) {
        updateCreateAgentTask('storyboard', 'tts', 'running', `Speech ${i + 1}/${segments.length}…`);
        const ttsResult = await generateTTSGemini(segments[i].translatedText, 'Kore', key);
        const { audioBuffer: segBuf } = await decodeBase64Audio(ttsResult.base64, ttsResult.mimeType);
        ttsBuffers.push(segBuf);
      }

      // Step C: Rebuild segment timings from TTS durations
      let ttsCursor = 0;
      for (let i = 0; i < segments.length; i++) {
        segments[i].startTime = ttsCursor;
        segments[i].endTime = ttsCursor + ttsBuffers[i].duration;
        segments[i].originalText = segments[i].text; // preserve source language text for subtitles
        segments[i].text = segments[i].translatedText;
        ttsCursor = segments[i].endTime;
      }

      // Step D: Concatenate TTS buffers → replace createAudioBuffer
      const ttsSr = ttsBuffers[0].sampleRate;
      const totalTtsFrames = ttsBuffers.reduce((s, b) => s + b.length, 0);
      const combinedTts = ensureAudioCtx().createBuffer(1, totalTtsFrames, ttsSr);
      let ttsOff = 0;
      for (const buf of ttsBuffers) {
        combinedTts.getChannelData(0).set(buf.getChannelData(0), ttsOff);
        ttsOff += buf.length;
      }
      createAudioBuffer = combinedTts;
      trackCost('tts', segments.length);
      updateCreateAgentTask('storyboard', 'tts', 'done', `${fmtShort(combinedTts.duration)} audio ready`);
    }

    // ── Common: save raw transcript ──
    trackCost('transcription', 1);
    createTranscript = segments;

    createTranscriptOutput.textContent = segments.map(s =>
      `[${fmt(s.startTime)} – ${fmt(s.endTime)}] ${s.text}`
    ).join('\n\n');
    createTranscriptOutput.classList.add('visible');

    if (createInputMode === 'podcast') {
      // Podcast mode: show chapter step, don't build scenes yet (handled by updateStepStates)
    } else {
      // Audio/Text mode: build scenes directly from segments (existing flow)
      createScenes = segments.map(s => ({
        prompt: s.sceneDescription,
        startTime: s.startTime,
        endTime: s.endTime,
        duration: (s.endTime - s.startTime),
        text: s.text,
        emojis: Array.isArray(s.emojis) ? s.emojis.filter(e => typeof e === 'string' && e.trim()) : [],
        imgDataUrl: null,
        status: 'pending',
      }));
      renderStoryboard();

      // ── Phase 4: Subtitle generation (animated mode only) ──
      if (createVideoMode === 'animated' && createSubtitleLanguage) {
        const subtitleLangName = createSubtitleLanguage === 'original'
          ? 'source language'
          : (SUPPORTED_LANGUAGES.find(l => l.code === createSubtitleLanguage)?.name || createSubtitleLanguage);
        updateCreateAgentTask('storyboard', 'subtitles', 'running', `Generating ${subtitleLangName} subtitles…`);
        try {
          let subtitleItems;
          if (createSubtitleLanguage === 'original') {
            // Use original source text with current timings
            subtitleItems = segments.map(s => ({
              text: s.originalText || s.text,
              startTime: s.startTime,
              duration: s.endTime - s.startTime,
            }));
          } else if (createSubtitleLanguage === createOutputLanguage) {
            // Same language as output audio — use translated/current segment text
            subtitleItems = segments.map(s => ({
              text: s.text,
              startTime: s.startTime,
              duration: s.endTime - s.startTime,
            }));
          } else {
            // Different language — translate segments to subtitle language
            const subTexts = segments.map((s, i) => `${i}: ${s.originalText || s.text}`).join('\n');
            const subResp = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: `Translate these numbered text segments to ${subtitleLangName}. Return ONLY a valid JSON array:\n[{"index":0,"text":"translated text"}]\n\n${subTexts}` }] }]
                })
              }
            );
            if (!subResp.ok) throw new Error(`Subtitle translation error ${subResp.status}`);
            const subData = await subResp.json();
            const subRaw = subData.candidates?.[0]?.content?.parts?.[0]?.text;
            const subTranslations = subRaw ? parseGeminiJson(subRaw) : [];
            subtitleItems = segments.map((s, i) => ({
              text: (Array.isArray(subTranslations) ? subTranslations.find(t => t.index === i)?.text : null) || s.text,
              startTime: s.startTime,
              duration: s.endTime - s.startTime,
            }));
          }
          if (typeof createGeneratedSubtitles !== 'undefined') {
            createGeneratedSubtitles.set('primary', subtitleItems);
          }
          updateCreateAgentTask('storyboard', 'subtitles', 'done', `${subtitleItems.length} subtitles ready`);
        } catch (subErr) {
          console.warn('[subtitles] generation error:', subErr);
          updateCreateAgentTask('storyboard', 'subtitles', 'error', 'Subtitle generation failed');
        }
      }
    }
    btnCreateSaveTop.style.display = '';

    if (createInputMode === 'text') {
      updateCreateAgentTask('storyboard', 'prompts', 'done', `${segments.length} prompts ready`);
    } else {
      updateCreateAgentTask('storyboard', 'transcribe', 'done', `${segments.length} scenes`);
      updateCreateAgentTask('storyboard', 'prompts', 'done', `${segments.length} prompts ready`);
    }
    updateCreateButtons();
    updateStepStates();
    autoSaveCreateState();
    if (typeof updateCreateCostEstimate === 'function') updateCreateCostEstimate();
    const launchSummary = $('create-launch-storyboard-summary');
    if (launchSummary) launchSummary.textContent = `✅ ${segments.length} scenes identified`;

  } catch (e) {
    updateCreateAgent('storyboard', 'error', 'Failed: ' + friendlyApiError(e.message));
    console.error('Transcription error:', e);
    btnCreateTranscribe.disabled = false;
    btnCreateTranscribe.textContent = createInputMode === 'text' ? '🔄 Retry Storyboard' : '🔄 Retry Transcription';
  } finally {
    updateCreateButtons();
    if (getCreateGeminiKey() && (createAudioBuffer || createInputMode === 'text')) btnCreateTranscribe.disabled = false;
  }
});

// Storyboard — shows prompts with timestamps for review
// ══════════════════════════════════════════
//  CHAPTER SPLITTING (Podcast only)
// ══════════════════════════════════════════
let createChapters = null;
let createChapterMode = 'ai';
const createChapterStep = $('create-chapter-step');
const chapterModeAi = $('chapter-mode-ai');
const chapterModeManual = $('chapter-mode-manual');
const chapterAiSection = $('chapter-ai-section');
const chapterManualSection = $('chapter-manual-section');
const chapterList = $('chapter-list');
const chapterControls = $('chapter-controls');
const chapterSummary = $('chapter-summary');
const btnChapterAiSplit = $('btn-chapter-ai-split');
const btnAddChapter = $('btn-add-chapter');
const btnChapterProceed = $('btn-chapter-proceed');
const chapterAiStatus = $('chapter-ai-status');
let nextChapterId = 1;

// Mode toggle
if (chapterModeAi) chapterModeAi.addEventListener('click', () => {
  createChapterMode = 'ai';
  chapterModeAi.classList.add('active');
  chapterModeManual.classList.remove('active');
  chapterAiSection.style.display = '';
  chapterManualSection.style.display = 'none';
});
if (chapterModeManual) chapterModeManual.addEventListener('click', () => {
  createChapterMode = 'manual';
  chapterModeManual.classList.add('active');
  chapterModeAi.classList.remove('active');
  chapterAiSection.style.display = 'none';
  chapterManualSection.style.display = '';
  // Auto-create first chapter if none exist
  if (!createChapters || createChapters.length === 0) {
    const dur = createAudioBuffer ? createAudioBuffer.duration : 60;
    createChapters = [{ id: nextChapterId++, title: 'Chapter 1', startTime: 0, endTime: dur, duration: dur, splits: suggestSplits(dur), transcript: '' }];
  }
  renderChapterCards();
});

function suggestSplits(chapterDuration) {
  return Math.max(1, Math.min(15, Math.round(chapterDuration / 60)));
}

// Build contextual splits for a chapter based on transcript segment boundaries
function buildChapterScenes(ch) {
  if (!createTranscript) return [];
  // Get transcript segments that overlap this chapter
  const relevantSegs = createTranscript.filter(s =>
    s.startTime < ch.endTime && s.endTime > ch.startTime && s.text && s.text !== '[continued]'
  );

  if (relevantSegs.length === 0 || ch.splits <= 1) {
    // Single split: whole chapter
    return [{
      prompt: '', startTime: ch.startTime, endTime: ch.endTime,
      duration: ch.duration,
      text: relevantSegs.map(s => s.text).join(' ').substring(0, 500),
      imgDataUrl: null, status: 'pending',
      chapterId: ch.id, chapterTitle: ch.title,
    }];
  }

  // Collect all sentence break points within the chapter from transcript segments
  const breakPoints = [ch.startTime];
  for (const seg of relevantSegs) {
    const segStart = Math.max(seg.startTime, ch.startTime);
    const segEnd = Math.min(seg.endTime, ch.endTime);
    if (segStart > ch.startTime && !breakPoints.includes(segStart)) {
      breakPoints.push(segStart);
    }
    if (segEnd < ch.endTime && !breakPoints.includes(segEnd)) {
      breakPoints.push(segEnd);
    }
  }
  breakPoints.push(ch.endTime);
  breakPoints.sort((a, b) => a - b);
  // Remove duplicates
  const uniqueBreaks = [...new Set(breakPoints)];

  // If we have more break points than splits, merge the shortest adjacent pairs
  while (uniqueBreaks.length - 1 > ch.splits) {
    let minGap = Infinity, minIdx = 1;
    for (let i = 1; i < uniqueBreaks.length - 1; i++) {
      const gap = uniqueBreaks[i] - uniqueBreaks[i - 1];
      if (gap < minGap) { minGap = gap; minIdx = i; }
    }
    uniqueBreaks.splice(minIdx, 1);
  }

  // If we have fewer break points than splits, subdivide the longest segment
  while (uniqueBreaks.length - 1 < ch.splits) {
    let maxGap = 0, maxIdx = 0;
    for (let i = 0; i < uniqueBreaks.length - 1; i++) {
      const gap = uniqueBreaks[i + 1] - uniqueBreaks[i];
      if (gap > maxGap) { maxGap = gap; maxIdx = i; }
    }
    const mid = (uniqueBreaks[maxIdx] + uniqueBreaks[maxIdx + 1]) / 2;
    uniqueBreaks.splice(maxIdx + 1, 0, mid);
  }

  // Build scenes from break points
  const scenes = [];
  for (let i = 0; i < uniqueBreaks.length - 1; i++) {
    const start = uniqueBreaks[i];
    const end = uniqueBreaks[i + 1];
    scenes.push({
      prompt: '', startTime: start, endTime: end,
      duration: end - start,
      text: getTranscriptForRange(start, end),
      imgDataUrl: null, status: 'pending',
      chapterId: ch.id, chapterTitle: ch.title,
    });
  }
  return scenes;
}

function getTranscriptForRange(start, end) {
  if (!createTranscript) return '';
  return createTranscript
    .filter(s => s.startTime < end && s.endTime > start)
    .map(s => s.text)
    .filter(t => t && t !== '[continued]')
    .join(' ')
    .substring(0, 200);
}

// AI chapter detection
if (btnChapterAiSplit) btnChapterAiSplit.addEventListener('click', async () => {
  const key = getCreateGeminiKey();
  if (!key || !createTranscript) return;
  const dur = createAudioBuffer ? createAudioBuffer.duration : 60;

  btnChapterAiSplit.disabled = true;
  chapterAiStatus.textContent = 'Detecting chapters...';
  updateCreateAgent('chapter', 'running', 'Detecting chapters…');

  try {
    const fullText = createTranscript.map(s =>
      `[${s.startTime.toFixed(1)}s-${s.endTime.toFixed(1)}s] ${s.text}`
    ).join('\n');

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Analyze this podcast transcript and identify distinct topic chapters.\nAudio length: ${dur.toFixed(1)} seconds.\n\n${fullText}\n\nReturn a JSON array:\n[{"title":"Chapter Title","startTime":0,"endTime":300}]\n\nRules:\n- 3-10 chapters total\n- Minimum 60 seconds per chapter\n- Contiguous: first starts at 0, last ends at ${dur.toFixed(1)}, no gaps\n- Each chapter covers one main topic\n- Return ONLY valid JSON, no markdown` }] }],
          generationConfig: { temperature: 0.3 }
        })
      }
    );
    if (!resp.ok) throw new Error(`API error ${resp.status}`);
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response');

    const chapters = parseGeminiJson(text);
    if (!Array.isArray(chapters) || chapters.length === 0) throw new Error('Invalid chapter format');

    createChapters = chapters.map((ch, i) => ({
      id: nextChapterId++,
      title: ch.title || `Chapter ${i + 1}`,
      startTime: ch.startTime || 0,
      endTime: ch.endTime || dur,
      duration: (ch.endTime || dur) - (ch.startTime || 0),
      splits: suggestSplits((ch.endTime || dur) - (ch.startTime || 0)),
      transcript: '',
    }));

    // Fill transcript previews
    for (const ch of createChapters) {
      ch.transcript = getTranscriptForRange(ch.startTime, ch.endTime);
    }

    renderChapterCards();
    chapterAiStatus.textContent = `Detected ${createChapters.length} chapters`;
    updateCreateAgent('chapter', 'running', `${createChapters.length} chapters detected`);
  } catch(e) {
    chapterAiStatus.textContent = 'Chapter detection failed. ' + friendlyApiError(e.message);
    console.error('Chapter detection error:', e);
    updateCreateAgent('chapter', 'error', 'Detection failed');
  }
  btnChapterAiSplit.disabled = false;
});

// Add chapter (manual mode)
if (btnAddChapter) btnAddChapter.addEventListener('click', () => {
  if (!createChapters) createChapters = [];
  const dur = createAudioBuffer ? createAudioBuffer.duration : 60;
  const lastEnd = createChapters.length > 0 ? createChapters[createChapters.length - 1].endTime : 0;
  const newStart = lastEnd;
  const newEnd = dur;
  if (newStart >= newEnd) return;
  const newDur = newEnd - newStart;
  createChapters.push({
    id: nextChapterId++,
    title: `Chapter ${createChapters.length + 1}`,
    startTime: newStart, endTime: newEnd,
    duration: newDur,
    splits: suggestSplits(newDur),
    transcript: getTranscriptForRange(newStart, newEnd),
  });
  renderChapterCards();
});

// Render chapter cards
function renderChapterCards() {
  if (!chapterList) return;
  chapterList.innerHTML = '';
  if (!createChapters || createChapters.length === 0) {
    chapterControls.style.display = 'none';
    return;
  }
  chapterControls.style.display = '';

  const totalDur = createAudioBuffer ? createAudioBuffer.duration : 60;
  chapterSummary.textContent = `${createChapters.length} chapters · ${fmtShort(totalDur)} total`;

  for (let i = 0; i < createChapters.length; i++) {
    const ch = createChapters[i];
    const card = document.createElement('div');
    card.className = 'chapter-card';

    const isManual = createChapterMode === 'manual';
    card.innerHTML = `
      <div class="chapter-card-header">
        <span class="chapter-card-num">${i + 1}</span>
        <input type="text" class="chapter-card-title" value="${sanitize(ch.title)}" data-idx="${i}">
        <span style="font-size:0.68rem; color:var(--text-muted); font-family:monospace;">${fmtShort(ch.duration)}</span>
        <button class="chapter-delete" data-idx="${i}" title="Delete chapter">✕</button>
      </div>
      <div class="chapter-card-body">
        <label style="font-size:0.7rem;">From: <input type="text" class="chapter-time-input" value="${fmtShort(ch.startTime)}" data-idx="${i}" data-field="start" ${isManual ? '' : 'readonly'}></label>
        <label style="font-size:0.7rem;">To: <input type="text" class="chapter-time-input" value="${fmtShort(ch.endTime)}" data-idx="${i}" data-field="end" ${isManual ? '' : 'readonly'}></label>
      </div>
      ${ch.transcript ? `<div class="chapter-transcript-preview">"${ch.transcript}"</div>` : ''}
    `;

    // Title edit
    card.querySelector('.chapter-card-title').addEventListener('change', (e) => {
      createChapters[i].title = e.target.value;
    });

    // Delete
    card.querySelector('.chapter-delete').addEventListener('click', () => {
      createChapters.splice(i, 1);
      renderChapterCards();
    });

    // Time edits (manual mode only)
    if (isManual) {
      card.querySelectorAll('.chapter-time-input').forEach(inp => {
        inp.addEventListener('change', () => {
          const idx = parseInt(inp.dataset.idx);
          const field = inp.dataset.field;
          const parts = inp.value.split(':');
          const secs = (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
          if (field === 'start') {
            createChapters[idx].startTime = Math.max(0, secs);
          } else {
            createChapters[idx].endTime = Math.min(totalDur, secs);
          }
          createChapters[idx].duration = createChapters[idx].endTime - createChapters[idx].startTime;
          createChapters[idx].splits = suggestSplits(createChapters[idx].duration);
          createChapters[idx].transcript = getTranscriptForRange(createChapters[idx].startTime, createChapters[idx].endTime);
          renderChapterCards();
        });
      });
    }

    chapterList.appendChild(card);
  }
}

// Proceed: build scenes from chapters
if (btnChapterProceed) btnChapterProceed.addEventListener('click', async () => {
  if (!createChapters || createChapters.length === 0) return;
  btnChapterProceed.disabled = true;
  updateCreateAgent('chapter', 'running', 'Building storyboard…');

  try {
    // Build scenes from chapter splits (contextual, based on transcript boundaries)
    createScenes = [];
    for (const ch of createChapters) {
      createScenes.push(...buildChapterScenes(ch));
    }

    // Generate scene descriptions via Gemini (batched per chapter)
    const key = getCreateGeminiKey();
    if (key) {
      for (const ch of createChapters) {
        const chScenes = createScenes.filter(s => s.chapterId === ch.id);
        const sceneTexts = chScenes.map((s, i) => `Scene ${i} (${fmtShort(s.startTime)}-${fmtShort(s.endTime)}): "${s.text}"`).join('\n');

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `For the podcast chapter "${ch.title}", generate a vivid visual scene description for each scene.${createVideoMode === 'animated' ? `\n\nIMPORTANT — ANIMATED VIDEO MODE: These will be used for AI video animation (Kling), NOT static images. Each description MUST describe cinematic MOTION:\n- Start with camera direction: pan left/right, zoom in/out, tracking shot, aerial view, dolly forward, tilt up/down.\n- Describe visible subject ACTION: walking, turning, flowing, dissolving, emerging, transforming.\n- Include environmental motion: wind in hair/trees, flowing water, drifting clouds, swirling particles, flickering light.\n- One continuous motion per scene — no cuts within a scene.` : '\n\nEach description should be suitable for AI image generation.'}\n\nScenes:\n${sceneTexts}\n\nReturn a JSON array with EXACTLY ${chScenes.length} entries, one per scene, starting from index 0:\n[{"sceneIndex":0,"sceneDescription":"detailed visual description: subject, composition, mood, colors, camera direction and motion"}]\n\nIMPORTANT: Return EXACTLY ${chScenes.length} entries. All string values MUST be in double quotes. Return ONLY valid JSON, no markdown.` }] }],
              generationConfig: { temperature: 0.7 }
            })
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const descriptions = parseGeminiJson(text);
            if (Array.isArray(descriptions)) {
              for (const desc of descriptions) {
                const idx = desc.sceneIndex ?? desc.segmentIndex;
                if (idx !== undefined && chScenes[idx]) {
                  chScenes[idx].prompt = desc.sceneDescription || '';
                }
              }
              // Fallback: assign sequentially if any scenes have no prompt
              let descIdx = 0;
              for (const scene of chScenes) {
                if (!scene.prompt && descIdx < descriptions.length) {
                  scene.prompt = descriptions[descIdx].sceneDescription || '';
                  descIdx++;
                } else if (scene.prompt) {
                  descIdx++;
                }
              }
            }
          }
        }
      }
    }

    renderStoryboard();
    updateCreateButtons();
    updateStepStates();
    autoSaveCreateState();
    updateCreateAgent('chapter', 'done', `${createScenes.length} scenes built`);
  } catch(e) {
    console.error('Chapter storyboard error:', e);
    chapterAiStatus.textContent = 'Storyboard generation failed. ' + friendlyApiError(e.message);
    updateCreateAgent('chapter', 'error', 'Storyboard failed');
  }
  btnChapterProceed.disabled = false;
  btnChapterProceed.textContent = 'Generate Storyboard from Chapters →';
});

// Update chapter splits (called from storyboard split controls)
// Just update the split count — no Gemini call. User clicks Regenerate button after adjusting.
function updateChapterSplitCount(chapterId, newSplitCount) {
  const ch = createChapters.find(c => c.id === chapterId);
  if (!ch) return;
  ch.splits = Math.max(1, Math.min(15, newSplitCount));
  renderStoryboard();
}

// Regenerate scenes for a chapter: AI-based contextual splitting + scene descriptions
async function regenerateChapterScenes(chapterId) {
  const ch = createChapters.find(c => c.id === chapterId);
  if (!ch) return;
  const key = getCreateGeminiKey();
  if (!key) return;

  // Remove old scenes for this chapter
  createScenes = createScenes.filter(s => s.chapterId !== chapterId);

  // Get the full transcript text for this chapter
  const chapterText = createTranscript
    .filter(s => s.startTime < ch.endTime && s.endTime > ch.startTime && s.text && s.text !== '[continued]')
    .map(s => `[${s.startTime.toFixed(1)}s-${s.endTime.toFixed(1)}s] ${s.text}`)
    .join('\n');

  try {
    // AI call: split chapter into N contextual segments + generate scene descriptions
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Given this podcast chapter "${ch.title}" (${fmtShort(ch.startTime)} to ${fmtShort(ch.endTime)}, ${ch.duration.toFixed(0)}s), split it into EXACTLY ${ch.splits} segments at natural topic/sentence boundaries.

Transcript:
${chapterText}

For each segment, provide:
1. startTime and endTime (within ${ch.startTime.toFixed(1)} to ${ch.endTime.toFixed(1)})
2. The transcript text for that segment
3. A vivid visual scene description${createVideoMode === 'animated' ? ` — ANIMATED VIDEO MODE: describe cinematic MOTION (camera direction: pan/zoom/tracking/dolly, subject action: walking/flowing/emerging, environmental motion: wind/water/clouds). One continuous motion, no cuts.` : ' for AI image generation'}

Return a JSON array with EXACTLY ${ch.splits} entries:
[{"startTime":${ch.startTime.toFixed(1)},"endTime":100.0,"text":"transcript portion","sceneDescription":"detailed visual: subject, composition, mood, colors, camera direction and motion"}]

RULES:
- EXACTLY ${ch.splits} segments, no more, no less
- Segments must be contiguous: first starts at ${ch.startTime.toFixed(1)}, last ends at ${ch.endTime.toFixed(1)}
- Split at natural topic or sentence boundaries, NOT equal duration
- All string values MUST be in double quotes
- Return ONLY valid JSON, no markdown` }] }],
          generationConfig: { temperature: 0.5 }
        })
      }
    );

    if (!resp.ok) throw new Error(`API error ${resp.status}`);
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response');

    const segments = parseGeminiJson(text);
    if (!Array.isArray(segments) || segments.length === 0) throw new Error('Invalid response');

    const newScenes = segments.map(s => ({
      prompt: s.sceneDescription || '',
      startTime: s.startTime ?? ch.startTime,
      endTime: s.endTime ?? ch.endTime,
      duration: (s.endTime ?? ch.endTime) - (s.startTime ?? ch.startTime),
      text: s.text || '',
      imgDataUrl: null, status: 'pending',
      chapterId: ch.id, chapterTitle: ch.title,
    }));

    // Insert at correct position
    const insertIdx = createScenes.findIndex(s => s.startTime >= ch.startTime);
    createScenes.splice(insertIdx === -1 ? createScenes.length : insertIdx, 0, ...newScenes);

  } catch(e) {
    console.warn('Chapter regenerate error:', e);
    // Fallback: use mechanical splitting
    const fallbackScenes = buildChapterScenes(ch);
    const insertIdx = createScenes.findIndex(s => s.startTime >= ch.startTime);
    createScenes.splice(insertIdx === -1 ? createScenes.length : insertIdx, 0, ...fallbackScenes);
  }

  renderStoryboard();
  renderCreateSceneCards();
  updateStepStates();
}

function renderStoryboardSceneCard(scene, idx) {
  const card = document.createElement('div');
  card.className = 'storyboard-card';
  card.innerHTML = `
    <div class="storyboard-time">
      <span class="time-badge">${fmt(scene.startTime)}</span>
      <span class="time-badge">${fmt(scene.endTime)}</span>
      <span class="time-dur">${scene.duration.toFixed(1)}s</span>
    </div>
    <div class="storyboard-content">
      <div class="storyboard-transcript">🗣 "${scene.text}"</div>
      <div class="storyboard-prompt-label">Image Prompt</div>
      <textarea class="storyboard-prompt" id="create-storyboard-prompt-${idx}" rows="3">${scene.prompt}</textarea>
    </div>
  `;
  const textarea = card.querySelector(`#create-storyboard-prompt-${idx}`);
  textarea.addEventListener('input', () => {
    createScenes[idx].prompt = textarea.value;
    const scenePrompt = $(`create-scene-prompt-${idx}`);
    if (scenePrompt) scenePrompt.value = textarea.value;
  });
  return card;
}

function renderStoryboard() {
  createStoryboardGrid.innerHTML = '';
  if (!createScenes) return;
  const regenRow = $('create-storyboard-regen-row');
  if (regenRow) regenRow.style.display = createScenes.length > 0 ? '' : 'none';

  // Podcast mode: group by chapters
  if (createInputMode === 'podcast' && createChapters && createChapters.length > 0) {
    for (const ch of createChapters) {
      const chScenes = createScenes
        .map((s, i) => ({ scene: s, globalIdx: i }))
        .filter(({ scene }) => scene.chapterId === ch.id);

      const group = document.createElement('div');
      group.className = 'storyboard-chapter-group';

      // Chapter header with split controls
      const header = document.createElement('div');
      header.className = 'storyboard-chapter-header';
      const avgDur = ch.duration / ch.splits;
      const currentSceneCount = chScenes.length;
      const needsRegen = currentSceneCount !== ch.splits;
      header.innerHTML = `
        <span class="storyboard-chapter-toggle">▼</span>
        <span class="storyboard-chapter-title">${sanitize(ch.title)}</span>
        <span style="font-size:0.68rem; color:var(--text-muted); font-family:monospace;">${fmtShort(ch.startTime)}-${fmtShort(ch.endTime)}</span>
        <div class="chapter-splits-control">
          <button class="chapter-splits-btn" data-ch="${ch.id}" data-dir="-1">−</button>
          <span class="chapter-splits-val">${ch.splits}</span>
          <button class="chapter-splits-btn" data-ch="${ch.id}" data-dir="1">+</button>
        </div>
        <button class="btn-regen-chapter" data-ch="${ch.id}" style="font-size:0.68rem; padding:3px 10px; background:${needsRegen ? 'var(--accent)' : 'var(--bg-input)'}; color:${needsRegen ? '#fff' : 'var(--text-secondary)'}; border:1px solid var(--border); border-radius:4px; cursor:pointer;">🔄 Regenerate</button>
        <span class="storyboard-chapter-count">${currentSceneCount} scene${currentSceneCount !== 1 ? 's' : ''}${needsRegen ? ` → ${ch.splits}` : ''}</span>
      `;

      const scenesContainer = document.createElement('div');
      scenesContainer.className = 'storyboard-chapter-scenes';

      // Toggle collapse
      header.addEventListener('click', (e) => {
        if (e.target.classList.contains('chapter-splits-btn') || e.target.classList.contains('btn-regen-chapter')) return;
        const isCollapsed = scenesContainer.classList.toggle('collapsed');
        header.querySelector('.storyboard-chapter-toggle').textContent = isCollapsed ? '▶' : '▼';
      });

      // Split +/- buttons (only update count, no AI call)
      header.querySelectorAll('.chapter-splits-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const dir = parseInt(btn.dataset.dir);
          const newCount = ch.splits + dir;
          if (newCount >= 1 && newCount <= 15) {
            updateChapterSplitCount(ch.id, newCount);
          }
        });
      });

      // Regenerate button (AI call for contextual splitting + descriptions)
      header.querySelector('.btn-regen-chapter').addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.target;
        btn.disabled = true;
        btn.textContent = '⏳ Generating...';
        await regenerateChapterScenes(ch.id);
        btn.disabled = false;
        btn.textContent = '🔄 Regenerate';
      });

      for (const { scene, globalIdx } of chScenes) {
        scenesContainer.appendChild(renderStoryboardSceneCard(scene, globalIdx));
      }

      group.appendChild(header);
      group.appendChild(scenesContainer);
      createStoryboardGrid.appendChild(group);
    }
  } else {
    // Audio/Text mode: flat list (existing behavior)
    createScenes.forEach((scene, idx) => {
      createStoryboardGrid.appendChild(renderStoryboardSceneCard(scene, idx));
    });
  }
}

// Regenerate all prompts (re-ask Gemini for new scene descriptions)
btnCreateRegeneratePrompts.addEventListener('click', async () => {
  const key = getCreateGeminiKey();
  if (!key || !createTranscript) return;

  if (!await showConfirm('This will overwrite all your current image prompts with new AI-generated ones. Continue?', 'Regenerate', true)) return;

  btnCreateRegeneratePrompts.disabled = true;
  btnCreateRegeneratePrompts.innerHTML = '<span class="spinner"></span> Regenerating...';

  try {
    const transcriptText = createTranscript.map(s =>
      `[${s.startTime}s - ${s.endTime}s]: ${s.text}`
    ).join('\n');

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Here is a transcript with timestamps from an audio that is ${createAudioBuffer.duration.toFixed(1)} seconds long:\n\n${transcriptText}\n\nFor each segment, generate a vivid, detailed prompt that visually represents the content being discussed.${createVideoMode === 'animated' ? `\n\nIMPORTANT — ANIMATED VIDEO MODE: These will be used for AI video animation (Kling), NOT static images. Each prompt MUST describe cinematic MOTION:\n- Start with camera direction: pan left/right, zoom in/out, tracking shot, aerial view, dolly forward, tilt up/down.\n- Describe visible subject ACTION: walking, turning, flowing, dissolving, emerging, transforming.\n- Include environmental motion: wind in hair/trees, flowing water, drifting clouds, swirling particles, flickering light.\n- One continuous motion per scene — no cuts within a scene.` : '\n\nThe prompt should describe a scene with specific details about subject, composition, style, mood, lighting, and colors — suitable for AI image generation.'}\n\nIMPORTANT: The segments MUST cover the ENTIRE audio duration from 0 to ${createAudioBuffer.duration.toFixed(1)} seconds. The last segment's endTime must be ${createAudioBuffer.duration.toFixed(1)}. Do not skip or shorten any segment.\n\nReturn ONLY a valid JSON array with no markdown:\n[{"startTime": 0, "endTime": 10, "prompt": "detailed prompt here"}]` }]
          }]
        })
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${resp.status}`);
    }

    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const newPrompts = parseGeminiJson(text);

    // Update prompts in createScenes
    for (const np of newPrompts) {
      const scene = createScenes.find(s => s.startTime === np.startTime);
      if (scene) scene.prompt = np.prompt;
    }

    renderStoryboard();
    renderCreateSceneCards();
    // Clear any previous error
    const errSpan = btnCreateRegeneratePrompts.parentElement.querySelector('.regen-error');
    if (errSpan) errSpan.remove();

  } catch (e) {
    console.error('Regenerate prompts error:', e);
    // Show error inline below the button
    const errSpan = btnCreateRegeneratePrompts.parentElement.querySelector('.regen-error') || (() => {
      const s = document.createElement('span');
      s.className = 'regen-error';
      s.style.cssText = 'font-size:0.7rem; color:#ef4444; display:block; margin-top:6px;';
      btnCreateRegeneratePrompts.parentElement.appendChild(s);
      return s;
    })();
    errSpan.textContent = '✗ ' + friendlyApiError(e.message) + ' — click to retry';
  } finally {
    btnCreateRegeneratePrompts.disabled = false;
    btnCreateRegeneratePrompts.textContent = '🔄 Regenerate All Prompts';
  }
});

// Scene Cards
function getSelectedImageSize() {
  const val = createImageSize.value || '1280x720';
  const [w, h] = val.split('x').map(Number);
  return { width: w || 1280, height: h || 720, ratio: `${w || 1280}/${h || 720}` };
}

function renderSceneCard(scene, idx, ratio) {
    const card = document.createElement('div');
    card.className = 'scene-card';

    const refThumbHtml = scene.refImageDataUrl
      ? `<img class="ref-thumb" src="${scene.refImageDataUrl}" alt="Ref">`
      : '';
    const refLabel = scene.refImageDataUrl ? '✓ Reference set' : '';

    card.innerHTML = `
      <div class="scene-img" id="create-scene-img-${idx}" style="aspect-ratio:${ratio};">
        ${scene.imgDataUrl
          ? `<img src="${scene.imgDataUrl}" alt="Scene ${idx + 1}" style="aspect-ratio:${ratio}; cursor:pointer;">`
          : `<div class="scene-img-placeholder" style="aspect-ratio:${ratio};"></div>`}
      </div>
      <div class="scene-body">
        <div class="scene-time">🕐 ${fmt(scene.startTime)} – ${fmt(scene.endTime)}</div>
        <div class="scene-text">"${sanitize(scene.text)}"</div>
        <textarea id="create-scene-prompt-${idx}">${scene.prompt}</textarea>
        <div class="scene-actions">
          <button class="btn-regen" style="font-size:0.7rem; padding:3px 10px;">🔄 Regenerate</button>
          <button class="btn-download-img" style="font-size:0.68rem; padding:3px 8px; ${scene.imgDataUrl ? '' : 'display:none;'}">📥 Download</button>
          <button class="btn-ref" style="font-size:0.68rem; padding:3px 8px;">📎 Ref Image</button>
          <input type="file" class="ref-input" accept="image/*" style="display:none;">
          <span class="scene-status ${scene.status || ''}" id="create-scene-status-${idx}">
            ${scene.status === 'done' ? '✓ Done' : scene.status === 'generating' ? '⏳ Generating...' : scene.status === 'error' ? '✗ Error' : '○ Pending'}
          </span>
        </div>
        <div class="scene-ref-row" id="create-scene-ref-${idx}" style="${scene.refImageDataUrl ? '' : 'display:none;'}">
          ${refThumbHtml}
          <span class="ref-label">${refLabel}</span>
          <button class="btn-ref-remove" style="font-size:0.62rem; padding:1px 6px; ${scene.refImageDataUrl ? '' : 'display:none;'}">✕</button>
        </div>
      </div>
    `;
    // Image preview click
    const imgEl = card.querySelector('.scene-img img');
    if (imgEl) {
      imgEl.addEventListener('click', () => {
        const previewIdx = getPreviewableScenes().findIndex(s => s === scene);
        if (previewIdx >= 0) openImagePreview(previewIdx);
      });
    }

    // Regenerate button
    card.querySelector('.btn-regen').addEventListener('click', () => regenerateScene(idx));

    // Download individual image
    const btnDownloadImg = card.querySelector('.btn-download-img');
    if (btnDownloadImg) {
      btnDownloadImg.addEventListener('click', () => {
        if (!scene.imgDataUrl) return;
        const a = document.createElement('a');
        a.href = scene.imgDataUrl;
        a.download = `stori-scene-${idx + 1}.png`;
        a.click();
      });
    }

    // Reference image upload
    const refInput = card.querySelector('.ref-input');
    const btnRef = card.querySelector('.btn-ref');
    const refRow = card.querySelector('.scene-ref-row');
    const btnRefRemove = card.querySelector('.btn-ref-remove');

    btnRef.addEventListener('click', () => refInput.click());

    refInput.addEventListener('change', async () => {
      const file = refInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        scene.refImageDataUrl = e.target.result;
        // Show thumbnail
        refRow.style.display = '';
        refRow.innerHTML = `
          <img class="ref-thumb" src="${scene.refImageDataUrl}" alt="Ref">
          <span class="ref-label">⏳ Analyzing reference...</span>
        `;
        // Auto-update prompt based on reference image using Gemini
        try {
          await updatePromptFromReference(idx);
          refRow.innerHTML = `
            <img class="ref-thumb" src="${scene.refImageDataUrl}" alt="Ref">
            <span class="ref-label" style="color:#10b981;">✓ Prompt updated from reference</span>
            <button class="btn-ref-remove" style="font-size:0.62rem; padding:1px 6px;">✕</button>
          `;
          refRow.querySelector('.btn-ref-remove').addEventListener('click', () => {
            scene.refImageDataUrl = null;
            refRow.style.display = 'none';
          });
        } catch (err) {
          refRow.innerHTML = `
            <img class="ref-thumb" src="${scene.refImageDataUrl}" alt="Ref">
            <span class="ref-label" style="color:#ef4444;">✗ ${err.message}</span>
            <button class="btn-ref-remove" style="font-size:0.62rem; padding:1px 6px;">✕</button>
          `;
          refRow.querySelector('.btn-ref-remove').addEventListener('click', () => {
            scene.refImageDataUrl = null;
            refRow.style.display = 'none';
          });
        }
      };
      reader.readAsDataURL(file);
    });

    if (btnRefRemove) {
      btnRefRemove.addEventListener('click', () => {
        scene.refImageDataUrl = null;
        refRow.style.display = 'none';
      });
    }

    return card;
}

function renderCreateSceneCards() {
  createSceneGrid.innerHTML = '';
  if (!createScenes) return;
  const { ratio } = getSelectedImageSize();

  // Podcast mode: group by chapters
  if (createInputMode === 'podcast' && createChapters && createChapters.length > 0) {
    for (const ch of createChapters) {
      const chScenes = createScenes
        .map((s, i) => ({ scene: s, globalIdx: i }))
        .filter(({ scene }) => scene.chapterId === ch.id);

      const group = document.createElement('div');
      group.className = 'storyboard-chapter-group';

      const doneCount = chScenes.filter(({ scene }) => scene.imgDataUrl).length;
      const header = document.createElement('div');
      header.className = 'storyboard-chapter-header';
      header.innerHTML = `
        <span class="storyboard-chapter-toggle">▼</span>
        <span class="storyboard-chapter-title">${sanitize(ch.title)}</span>
        <span class="storyboard-chapter-count">${doneCount}/${chScenes.length} images</span>
        <button class="btn-gen-chapter primary" data-ch="${ch.id}" style="font-size:0.68rem; padding:3px 10px;">Generate Chapter</button>
      `;

      const scenesContainer = document.createElement('div');
      scenesContainer.className = 'storyboard-chapter-scenes scene-grid';

      header.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-gen-chapter')) return;
        const isCollapsed = scenesContainer.classList.toggle('collapsed');
        header.querySelector('.storyboard-chapter-toggle').textContent = isCollapsed ? '▶' : '▼';
      });

      // Generate chapter button
      header.querySelector('.btn-gen-chapter').addEventListener('click', async (e) => {
        e.stopPropagation();
        const scenesToGen = chScenes.map(({ scene }) => scene).filter(s => s.status !== 'done');
        if (scenesToGen.length === 0) return;
        await runImageGeneration(scenesToGen);
        renderCreateSceneCards();
      });

      for (const { scene, globalIdx } of chScenes) {
        scenesContainer.appendChild(renderSceneCard(scene, globalIdx, ratio));
      }

      group.appendChild(header);
      group.appendChild(scenesContainer);
      createSceneGrid.appendChild(group);
    }
  } else {
    // Audio/Text mode: flat grid
    createScenes.forEach((scene, idx) => {
      createSceneGrid.appendChild(renderSceneCard(scene, idx, ratio));
    });
  }
}

// Analyze reference image and update scene prompt
async function updatePromptFromReference(idx) {
  const scene = createScenes[idx];
  if (!scene.refImageDataUrl) return;
  const key = getCreateGeminiKey();
  if (!key) throw new Error('API key required');

  // Extract base64 and mimeType from data URL
  const match = scene.refImageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data');
  const [, mimeType, base64Data] = match;

  const data = await callGeminiAPI(getTextModels(), {
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: `Analyze this reference image carefully. The generated image should resemble the person/people in this reference image — same face, features, appearance, clothing style, and build. Incorporate the reference image's visual style, color palette, and mood as well.\n\nOriginal scene prompt: "${scene.prompt}"\n\nReturn ONLY the updated prompt text that describes the scene while ensuring the person looks like the one in the reference image. Include specific physical descriptions (face shape, hair, skin tone, clothing) from the reference.` }
        ]
      }]
    }
  );

  const updatedPrompt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (updatedPrompt) {
    const oldPrompt = scene.prompt;
    scene.prompt = updatedPrompt;
    // Update the textarea with highlight animation
    const textarea = $(`create-scene-prompt-${idx}`);
    if (textarea) {
      textarea.value = updatedPrompt;
      textarea.style.transition = 'background 0.5s';
      textarea.style.background = 'rgba(16,185,129,0.15)';
      setTimeout(() => { textarea.style.background = ''; }, 2000);
    }
    // Also update storyboard textarea with highlight
    const storyTextarea = $(`create-storyboard-prompt-${idx}`);
    if (storyTextarea) {
      storyTextarea.value = updatedPrompt;
      storyTextarea.style.transition = 'background 0.5s';
      storyTextarea.style.background = 'rgba(16,185,129,0.15)';
      setTimeout(() => { storyTextarea.style.background = ''; }, 2000);
    }
  }
}

// Image Generation
// Gemini Image — tries multiple model names with fallback
const GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image',
];
let geminiImageModel = null; // cached after first success

async function generateImageGeminiFlash(prompt, key, { width, height, refImageDataUrl, refParts, aspectRatio } = {}, modelOverride) {
  const sizeHint = width && height ? ` The image should be ${width}x${height} pixels, ${width > height ? 'landscape' : width < height ? 'portrait' : 'square'} orientation.` : '';
  const cleanPrompt = prompt.trim().slice(0, 1200);

  // Build content parts
  const parts = [];
  // Add story reference images (characters + environments) first
  if (refParts && refParts.length > 0) {
    parts.push(...refParts);
  }
  if (refImageDataUrl) {
    const match = refImageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) {
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      parts.push({ text: `Generate a new image maintaining visual consistency with the reference images above. Match the characters' appearance, environment style, and mood. Scene description: ${cleanPrompt}${sizeHint}` });
    } else {
      parts.push({ text: `Generate an image: ${cleanPrompt}${sizeHint}` });
    }
  } else if (refParts && refParts.length > 0) {
    parts.push({ text: `Generate an image maintaining visual consistency with the reference images above. Match the characters' appearance and environment closely. Scene: ${cleanPrompt}${sizeHint}` });
  } else {
    parts.push({ text: `Generate an image: ${cleanPrompt}${sizeHint}` });
  }

  const bodyObj = { contents: [{ parts }] };
  if (aspectRatio) bodyObj.generationConfig = { imageConfig: { aspectRatio } };
  const body = JSON.stringify(bodyObj);

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 3000));

    const modelsToTry = modelOverride ? [modelOverride] : (geminiImageModel ? [geminiImageModel] : GEMINI_IMAGE_MODELS);

    for (const model of modelsToTry) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body }
      );
      if (resp.status === 404) continue;
      if (!resp.ok) {
        if (attempt === 0 && (resp.status === 429 || resp.status === 503 || resp.status === 500)) break;
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini image error ${resp.status}`);
      }
      const data = await resp.json();
      const resParts = data.candidates?.[0]?.content?.parts || [];
      for (const part of resParts) {
        if (part.inlineData) {
          geminiImageModel = model;
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
      if (attempt === 0) break; // no image, retry once
    }
  }
  throw new Error('Image generation failed after 3 attempts. Use the regenerate button to try again.');
}

// Gemini Imagen — dedicated image model
async function generateImageImagen(prompt, key, { width, height } = {}, modelOverride) {
  const cleanPrompt = (prompt.trim() + ' Do NOT include any text, words, letters, captions, or writing in any language in the image.').slice(0, 800);
  // Determine aspect ratio string for Imagen
  let aspectRatio = '16:9';
  if (width && height) {
    const r = width / height;
    if (Math.abs(r - 1) < 0.05) aspectRatio = '1:1';
    else if (Math.abs(r - 16/9) < 0.1) aspectRatio = '16:9';
    else if (Math.abs(r - 9/16) < 0.1) aspectRatio = '9:16';
    else if (Math.abs(r - 4/3) < 0.1) aspectRatio = '4:3';
    else if (Math.abs(r - 3/4) < 0.1) aspectRatio = '3:4';
    else if (r >= 2.5) aspectRatio = '16:9'; // wide banner
    else if (r > 1) aspectRatio = '16:9';
    else aspectRatio = '9:16';
  }

  const imagenModel = modelOverride || 'imagen-4.0-fast-generate-001';
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${imagenModel}:predict`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        instances: [{ prompt: cleanPrompt }],
        parameters: { sampleCount: 1, aspectRatio }
      })
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Imagen error ${resp.status}`);
  }
  const data = await resp.json();
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('No image data in response');
  return `data:image/png;base64,${b64}`;
}

// ── Grid Image Generation ──
// Generates up to 9 scene images in a single 3x3 grid API call
async function generateGridImage(prompts, key, stylePrompt, modelOverride, formatHint) {
  // Pad to 9 prompts by duplicating from the start
  const padded = [...prompts];
  while (padded.length < 9) padded.push(prompts[padded.length % prompts.length]);

  const stylePrefix = stylePrompt ? `Style: ${stylePrompt}\n\n` : '';
  const format = formatHint || 'square format (1:1 aspect ratio)';
  const arMatch = format.match(/\((\d+:\d+) aspect ratio\)/);
  const gridAspectRatio = arMatch ? arMatch[1] : '1:1';

  // Exact 2K canvas dimensions per aspect ratio
  const CANVAS_SIZES = {
    '9:16': { w: 1536, h: 2752 },
    '16:9': { w: 2752, h: 1536 },
    '1:1':  { w: 2048, h: 2048 },
    '4:5':  { w: 1792, h: 2240 },
  };
  const canvas = CANVAS_SIZES[gridAspectRatio] || CANVAS_SIZES['1:1'];
  const cw = canvas.w, ch = canvas.h;
  const cellW = Math.round(cw / 3), cellH = Math.round(ch / 3);

  // Compute exact pixel start/end for each of the 9 cells
  const CELL_PIXELS = [
    { pos: 'top-left',      x1: 0,        x2: cellW,      y1: 0,        y2: cellH      },
    { pos: 'top-center',    x1: cellW,    x2: cellW * 2,  y1: 0,        y2: cellH      },
    { pos: 'top-right',     x1: cellW*2,  x2: cw,         y1: 0,        y2: cellH      },
    { pos: 'middle-left',   x1: 0,        x2: cellW,      y1: cellH,    y2: cellH * 2  },
    { pos: 'middle-center', x1: cellW,    x2: cellW * 2,  y1: cellH,    y2: cellH * 2  },
    { pos: 'middle-right',  x1: cellW*2,  x2: cw,         y1: cellH,    y2: cellH * 2  },
    { pos: 'bottom-left',   x1: 0,        x2: cellW,      y1: cellH*2,  y2: ch         },
    { pos: 'bottom-center', x1: cellW,    x2: cellW * 2,  y1: cellH*2,  y2: ch         },
    { pos: 'bottom-right',  x1: cellW*2,  x2: cw,         y1: cellH*2,  y2: ch         },
  ];

  const cellDescriptions = padded.map((p, i) => {
    const c = CELL_PIXELS[i];
    return `Cell ${i + 1} (${c.pos}) [canvas: ${cw}×${ch}px | this panel: x:${c.x1}-${c.x2}px, y:${c.y1}-${c.y2}px, size:${cellW}×${cellH}px]: ${p}`;
  }).join('\n');

  const gridPrompt = `Generate a single image of exactly ${cw}×${ch} pixels (2K, ${gridAspectRatio} aspect ratio). This image is a 3×3 grid of 9 panels. The canvas is ${cw}px wide and ${ch}px tall, divided into exactly 3 columns and 3 rows. Each panel is ${cellW}×${cellH}px.\n${stylePrefix}\n${cellDescriptions}\n\nRULES:\n- EXACTLY 9 panels in a 3×3 layout (3 columns, 3 rows). NOT 4 rows. NOT 4 columns. NOT 12 panels.\n- Each panel MUST be drawn at its exact pixel coordinates specified above\n- Each panel MUST be a completely separate scene illustration\n- Do NOT draw any borders, lines, or separators between panels\n- Do NOT blend, merge, or overlap scenes across panel boundaries\n- Do NOT include any text, words, letters, numbers, or writing in any panel\n- Place the main subject and key objects at the CENTER of each panel. Keep all important elements within the center 80% of each panel\n- Maintain consistent style across all panels\n- Final image MUST be exactly ${cw}×${ch}px (${format})`;

  // 2.5 Flash: no generationConfig (flat pricing, returns 1K)
  // 3.1 Flash / Pro: pass imageConfig with aspectRatio + imageSize for resolution control
  const useImageConfig = modelOverride ? !modelOverride.startsWith('gemini-2.5') : true;
  const bodyObj = { contents: [{ parts: [{ text: gridPrompt }] }] };
  if (useImageConfig) {
    bodyObj.generationConfig = {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: gridAspectRatio, imageSize: '2K' }
    };
  }

  console.log('[GridImg] generationConfig:', JSON.stringify(bodyObj.generationConfig));
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
    const model = modelOverride || 'gemini-3-pro-image-preview';
    console.log(`[GridImg] attempt ${attempt + 1}, model: ${model}`);
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(bodyObj) }
    );
    console.log(`[GridImg] response status: ${resp.status}`);
    if (!resp.ok) {
      if (attempt < 2 && (resp.status === 429 || resp.status === 503 || resp.status === 500)) continue;
      const err = await resp.json().catch(() => ({}));
      console.error('[GridImg] error:', err.error?.message || `HTTP ${resp.status}`);
      throw new Error(err.error?.message || `Grid image error ${resp.status}`);
    }
    const data = await resp.json();
    const resParts = data.candidates?.[0]?.content?.parts || [];
    console.log(`[GridImg] parts returned: ${resParts.length}, hasImage: ${resParts.some(p => p.inlineData)}`);
    for (const part of resParts) {
      if (part.inlineData) {
        console.log('[GridImg] success, mimeType:', part.inlineData.mimeType);
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    console.warn('[GridImg] no image in response, parts:', resParts.map(p => Object.keys(p)));
  }
  throw new Error('Grid image generation failed after 2 attempts');
}

// Crops individual cells from a grid image
function cropGridCells(gridDataUrl, rows, cols, sceneCount) {
  const trimPct = 0.02; // 2% edge trim to avoid bleed
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cellW = img.width / cols;
      const cellH = img.height / rows;
      const results = [];
      for (let i = 0; i < Math.min(rows * cols, sceneCount); i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const cx = col * cellW + cellW / 2;
        const cy = row * cellH + cellH / 2;
        const halfW = cellW / 2 - (cellW * trimPct);
        const halfH = cellH / 2 - (cellH * trimPct);
        const sx = cx - halfW;
        const sy = cy - halfH;
        const sw = halfW * 2;
        const sh = halfH * 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(sw);
        canvas.height = Math.round(sh);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        results.push(canvas.toDataURL('image/png'));
      }
      resolve(results);
    };
    img.onerror = () => reject(new Error('Failed to load grid image for cropping'));
    img.src = gridDataUrl;
  });
}

// Upscales image to target resolution using browser canvas (bicubic)
function browserUpscale(dataUrl, targetW, targetH) {
  const img = new Image();
  img.src = dataUrl;
  // If image not loaded yet, return dataUrl as-is (will be loaded by the time it's used)
  if (img.naturalWidth === 0) return dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Scale to fit target dimensions (maintain aspect, no crop)
  const scale = Math.max(targetW / img.naturalWidth, targetH / img.naturalHeight);
  const sw = targetW / scale;
  const sh = targetH / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/jpeg', 0.92);
}

// Upscales grid 2x via canvas then crops individual cells
async function createUpscaleAndCrop(gridDataUrl, scale, rows, cols, sceneCount) {
  // Step 1: upscale entire grid image by `scale` factor on canvas
  const upscaledDataUrl = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load grid image for upscaling'));
    img.src = gridDataUrl;
  });
  // Step 2: crop individual cells from the upscaled grid
  return cropGridCells(upscaledDataUrl, rows, cols, sceneCount);
}

// Async cover-fit center-crop resize — scales to fill targetW×targetH, crops excess
function resizeCellToTarget(cellDataUrl, targetW, targetH) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // Cover-fit: scale so smallest dimension fills target, crop excess from center
      const scale = Math.max(targetW / img.naturalWidth, targetH / img.naturalHeight);
      const sw = targetW / scale;
      const sh = targetH / scale;
      const sx = (img.naturalWidth - sw) / 2;
      const sy = (img.naturalHeight - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => reject(new Error('Failed to load cell image for resize'));
    img.src = cellDataUrl;
  });
}

// Maps output dimensions to grid format hint for generateGridImage()
function getGridFormatHint(width, height) {
  if (width > height) return 'wide landscape format (16:9 aspect ratio)';
  if (width === height) return 'square format (1:1 aspect ratio)';
  // Distinguish 9:16 (ratio ≥ 1.7) from 4:5 (ratio < 1.7)
  return (height / width) >= 1.7 ? 'portrait format (9:16 aspect ratio)' : 'portrait format (4:5 aspect ratio)';
}

// ── Lyria 3 BGM Generation ──

async function generateLyriaBgm(key, textContext, imageDataUrls = []) {
  const parts = [];
  parts.push({ text: `Generate background music for a video about: "${textContext}". Create an atmospheric, melodic instrumental track with no lyrics and no vocals. Match the mood and tone to the visual content.` });
  for (const dataUrl of imageDataUrls.slice(0, 5)) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
  }
  const body = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ['AUDIO'] }
  };
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/lyria-3-clip-preview:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Lyria error ${resp.status}`);
  }
  const data = await resp.json();
  const candidate = data?.candidates?.[0];
  const respParts = candidate?.content?.parts || [];
  const audioPart = respParts.find(p => p.inlineData?.mimeType?.startsWith('audio/'));
  if (!audioPart) {
    console.warn('[Lyria] No audio part. finishReason:', candidate?.finishReason, '| promptFeedback:', JSON.stringify(data?.promptFeedback), '| parts:', respParts.map(p => Object.keys(p)));
    throw new Error('No audio in Lyria response');
  }
  const binary = atob(audioPart.inlineData.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function runCreateBgm() {
  const key = getCreateGeminiKey();
  if (!key) return;
  const bgmStep = $('create-bgm-step');
  const bgmStatus = $('create-bgm-status');
  const bgmPlayer = $('create-bgm-player');
  if (!bgmStep) return;

  bgmStep.style.display = '';
  const langStep = $('create-language-step');
  if (langStep) langStep.style.display = '';
  if (typeof resetCreateAgentTasks === 'function') resetCreateAgentTasks('bgm');
  if (typeof updateCreateAgent === 'function') updateCreateAgent('bgm', 'running', '');
  if (typeof updateCreateAgentTask === 'function') updateCreateAgentTask('bgm', 'compose', 'running', 'Composing with Lyria 3…');
  if (bgmStatus) { bgmStatus.textContent = 'Composing background music with Lyria 3…'; bgmStatus.style.display = ''; }
  if (bgmPlayer) bgmPlayer.style.display = 'none';

  try {
    const styleName = (typeof createStylePreset !== 'undefined' && createStylePreset) || '';
    const tplName = (typeof selectedTemplate !== 'undefined' && selectedTemplate) || '';
    const musicContext = (styleName || tplName || 'cinematic video').replace(/-/g, ' ');
    const musicPrompt = `Atmospheric instrumental background music for a ${musicContext} video. No vocals, no lyrics, no singing. Melodic and emotional.`;
    const images = (createScenes || []).filter(s => s.imgDataUrl).slice(0, 5).map(s => s.imgDataUrl);
    const arrayBuf = await generateLyriaBgm(key, musicPrompt, images);

    const blob = new Blob([arrayBuf], { type: 'audio/mp3' });
    if (createBgmUrl) URL.revokeObjectURL(createBgmUrl);
    createBgmUrl = URL.createObjectURL(blob);

    if (bgmStatus) bgmStatus.style.display = 'none';
    if (bgmPlayer) bgmPlayer.style.display = '';
    initCreateBgmWaveform(createBgmUrl);
    if (typeof updateCreateAgentTask === 'function') updateCreateAgentTask('bgm', 'compose', 'done', 'Music ready · Lyria 3');
    updateStepStates();
    console.log('[BGM] Lyria 3 BGM generated for Create Story');
  } catch (e) {
    console.warn('[BGM] Lyria 3 failed for Create Story:', e);
    if (bgmStatus) bgmStatus.textContent = `BGM generation failed: ${e.message}`;
    if (typeof updateCreateAgentTask === 'function') updateCreateAgentTask('bgm', 'compose', 'error', 'Lyria 3 failed');
    if (typeof updateCreateAgent === 'function') updateCreateAgent('bgm', 'error', 'Failed');
    updateStepStates();
  }
}

let createBgmWavesurfer = null;

function initCreateBgmWaveform(url) {
  const container = $('create-bgm-waveform');
  if (!container || typeof WaveSurfer === 'undefined') return;
  // #15 Hide faux wave, show real WaveSurfer waveform
  const fauxWave = $('create-bgm-faux-wave');
  if (fauxWave) fauxWave.style.display = 'none';
  if (createBgmWavesurfer) { try { createBgmWavesurfer.destroy(); } catch(e) {} createBgmWavesurfer = null; }
  createBgmWavesurfer = WaveSurfer.create({
    container: '#create-bgm-waveform',
    waveColor: '#1da8cc',
    progressColor: '#50d0f0',
    height: 72,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    cursorColor: '#fff',
    cursorWidth: 1,
  });
  createBgmWavesurfer.load(url);
  const playBtn = $('create-bgm-play-btn');
  if (playBtn) {
    createBgmWavesurfer.on('play', () => { playBtn.textContent = '⏸ Pause'; });
    createBgmWavesurfer.on('pause', () => { playBtn.textContent = '▶ Play'; });
    createBgmWavesurfer.on('finish', () => { playBtn.textContent = '▶ Play'; });
    playBtn.onclick = () => createBgmWavesurfer?.playPause();
  }
  const volSlider = $('create-bgm-volume');
  if (volSlider) createBgmWavesurfer.setVolume(parseInt(volSlider.value) / 100);
}

function launchBgmAgent() {
  const bgmStep = $('create-bgm-step');
  if (bgmStep) {
    bgmStep.style.display = '';
    bgmStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  runCreateBgm().catch(e => {
    console.warn('[BGM] runCreateBgm error:', e);
    const st = $('create-bgm-status');
    if (st) { st.textContent = 'BGM generation failed.'; st.style.color = 'var(--error, #ef4444)'; }
  });
}

// Download button for Create Story BGM
const createBgmDownloadBtn = $('create-bgm-download');
if (createBgmDownloadBtn) createBgmDownloadBtn.addEventListener('click', async () => {
  const src = createBgmUrl || '';
  if (!src) return;
  try {
    const resp = await fetch(src);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bgm.mp3';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch(e) { setStatus('BGM download failed: ' + e.message); }
});

// Volume control for Create Story BGM
const createBgmVolumeEl = $('create-bgm-volume');
if (createBgmVolumeEl) {
  createBgmVolumeEl.addEventListener('input', () => {
    if (createBgmWavesurfer) createBgmWavesurfer.setVolume(parseInt(createBgmVolumeEl.value) / 100);
    const lbl = $('create-bgm-vol-label');
    if (lbl) lbl.textContent = createBgmVolumeEl.value + '%';
  });
}

async function generateSceneImage(idx) {
  const scene = createScenes[idx];
  const key = getImageKey() || getCreateGeminiKey();
  const { width, height } = getSelectedImageSize();

  // Sync prompt from storyboard or scene card (whichever was edited last)
  const storyPromptEl = $(`create-storyboard-prompt-${idx}`);
  const scenePromptEl = $(`create-scene-prompt-${idx}`);
  if (scenePromptEl) scene.prompt = scenePromptEl.value;
  else if (storyPromptEl) scene.prompt = storyPromptEl.value;

  scene.status = 'generating';
  updateSceneCardStatus(idx);

  try {
    if (!key) throw new Error('API key required');
    let imgDataUrl;
    // Build prompt with character/environment references if available
    const hasRefs = (scene.refCharacters && scene.refCharacters.length > 0) || (scene.refEnvironment >= 0);
    let effectivePrompt = hasRefs
      ? buildScenePromptWithRefs(scene, scene.prompt)
      : (createStylePrompt ? `Style: ${createStylePrompt}. Scene: ${scene.prompt}` : scene.prompt);
    // Text mode instruction
    const textMode = $('create-image-text-mode')?.value || 'no-text';
    if (textMode === 'no-text') {
      effectivePrompt += ' STRICT: Do NOT include any text, words, letters, numbers, captions, titles, or writing in ANY language or script in the image. The image must be purely visual with zero text.';
    } else if (textMode === 'english-only') {
      effectivePrompt += ' STRICT: If any text appears in the image, it MUST be in English only. Do NOT use Tamil, Hindi, Devanagari, or any non-Latin script. English text only.';
    }
    // Collect reference image parts for API call
    const refParts = hasRefs ? getSceneRefImageParts(scene) : [];
    const opts = { width, height, refImageDataUrl: scene.refImageDataUrl, refParts };
    // Try image models in fallback order
    const models = getImageModels();
    let lastError = null;
    for (const model of models) {
      try {
        if (model.startsWith('imagen-')) {
          imgDataUrl = await generateImageImagen(effectivePrompt, key, opts, model);
        } else {
          imgDataUrl = await generateImageGeminiFlash(effectivePrompt, key, opts, model);
        }
        break;
      } catch(e) {
        lastError = e;
        if (e.message.includes('429') || e.message.includes('quota') || e.message.includes('rate')) continue;
        throw e;
      }
    }
    if (!imgDataUrl) throw lastError || new Error('Image generation failed. Your API key may not support image generation.');
    scene.imgDataUrl = imgDataUrl;
    scene.status = 'done';
    trackCost('imageGen', 1);
    updateSceneCardImage(idx);
    updateSceneCardStatus(idx);
    autoSaveCreateState();
    // #2 counter + #3 theater (individual path)
    if (typeof _genDone !== 'undefined') {
      _genDone++;
      if (typeof fillTheaterCell === 'function') {
        const tIdx = typeof scenesToGen !== 'undefined' ? scenesToGen.indexOf(scene) : idx;
        fillTheaterCell(idx, imgDataUrl, tIdx >= 0 ? tIdx : idx);
      }
      if (typeof _updateGenCounter === 'function') _updateGenCounter();
    }
  } catch (e) {
    scene.status = 'error';
    updateSceneCardStatus(idx, friendlyApiError(e.message));
    console.error(`Scene ${idx + 1} error:`, e);
  }
}

function updateSceneCardImage(idx) {
  const imgDiv = $(`create-scene-img-${idx}`);
  if (!imgDiv) return;
  const scene = createScenes[idx];
  const { ratio } = getSelectedImageSize();
  imgDiv.style.aspectRatio = ratio;
  if (scene.imgDataUrl) {
    imgDiv.innerHTML = `<img src="${scene.imgDataUrl}" alt="Scene ${idx + 1}" style="aspect-ratio:${ratio}; cursor:pointer;">`;
    imgDiv.querySelector('img').addEventListener('click', () => {
      const previewIdx = getPreviewableScenes().findIndex(s => s === scene);
      if (previewIdx >= 0) openImagePreview(previewIdx);
    });
  } else {
    imgDiv.innerHTML = `<div class="scene-img-placeholder" style="aspect-ratio:${ratio};"></div>`;
  }
}

function updateSceneCardStatus(idx, errorMsg) {
  const statusEl = $(`create-scene-status-${idx}`);
  if (!statusEl) return;
  const scene = createScenes[idx];
  statusEl.className = 'scene-status ' + scene.status;
  statusEl.textContent = scene.status === 'done' ? '✓ Done'
    : scene.status === 'generating' ? '⏳ Generating...'
    : scene.status === 'error' ? '✗ Failed'
    : '○ Pending';
  // Show/hide download button on this card
  const card = statusEl.closest('.scene-card');
  if (card) {
    const dlBtn = card.querySelector('.btn-download-img');
    if (dlBtn) dlBtn.style.display = scene.imgDataUrl ? '' : 'none';
    // Update structured error block
    let errBlock = card.querySelector('.scene-error-block');
    if (scene.status === 'error' && errorMsg) {
      const info = classifyError(errorMsg);
      if (!errBlock) {
        errBlock = document.createElement('div');
        errBlock.className = 'scene-error-block';
        card.appendChild(errBlock);
      }
      errBlock.innerHTML = `<span class="scene-error-title">${info.title}</span><span class="scene-error-hint">${info.hint}</span>`;
    } else if (errBlock) {
      errBlock.remove();
    }
  }
  // Show/hide Download All button
  const btnDlAll = $('btn-download-all-images');
  if (btnDlAll && createScenes) {
    btnDlAll.style.display = createScenes.some(s => s.imgDataUrl) ? '' : 'none';
  }
  updateCreateButtons();
}

// Download All Images
const btnDownloadAllImages = $('btn-download-all-images');
if (btnDownloadAllImages) {
  btnDownloadAllImages.addEventListener('click', () => {
    if (!createScenes) return;
    const withImages = createScenes.filter(s => s.imgDataUrl);
    if (withImages.length === 0) return;
    withImages.forEach((scene, i) => {
      const idx = createScenes.indexOf(scene);
      const a = document.createElement('a');
      a.href = scene.imgDataUrl;
      a.download = `stori-scene-${idx + 1}.png`;
      // Stagger downloads to avoid browser blocking
      setTimeout(() => a.click(), i * 200);
    });
    setStatus(`Downloading ${withImages.length} image(s)...`);
  });
}

// Regenerate single scene (called from onclick)
window.regenerateScene = async function(idx) {
  if (createVideoMode === 'animated' && createScenes[idx]?.videoUrl) {
    await regenSceneImageAndVideo(idx);
  } else {
    await generateSceneImage(idx);
  }
};

// Update aspect ratios when image size changes
createImageSize.addEventListener('change', () => {
  if (createScenes) renderCreateSceneCards();
});

// Generate All Images
const btnCreateRetryFailed = $('btn-create-retry-failed');
const btnCreatePause = $('btn-create-pause');
let generatePaused = false;
let generateRunning = false;

async function runImageGeneration(scenesToGen) {
  // Sync all prompts from storyboard before generating
  createScenes.forEach((s, i) => {
    const el = $(`create-storyboard-prompt-${i}`);
    if (el) s.prompt = el.value;
  });
  renderCreateSceneCards();
  const genStep = $('create-generate-step');
  if (genStep) genStep.style.display = '';
  btnCreateRetryFailed.style.display = 'none';
  btnCreatePause.style.display = '';
  btnCreatePause.textContent = '⏸ Pause';
  generatePaused = false;
  generateRunning = true;
  if (typeof updateCreateBreadcrumb === 'function') updateCreateBreadcrumb('Generating');
  resetCreateAgentTasks('image');
  updateCreateAgent('image', 'running', '');
  updateCreateAgentTask('image', 'gen', 'running', `Generating 0/${scenesToGen.length} images…`);

  // Emoji reel — silent emoji movie of the user's story while images generate.
  // Pass the decoded narration so the Play button can play emojis in sync with audio.
  if (typeof window !== 'undefined' && typeof window.startEmojiReel === 'function') {
    try {
      window.startEmojiReel(scenesToGen, {
        panel: 'create',
        audio: (typeof createAudioBuffer !== 'undefined') ? createAudioBuffer : null,
      });
    } catch (_) {}
  }

  // #2 Live counter + #3 Theater setup
  const _genStart = Date.now();
  let _genDone = 0;
  const { ratio: _theatRatio } = getSelectedImageSize();
  if (typeof initTheater === 'function') initTheater(scenesToGen.length, _theatRatio);
  function _updateGenCounter() {
    const el = $('create-gen-counter');
    if (!el) return;
    const elapsed = Math.round((Date.now() - _genStart) / 1000);
    const mins = Math.floor(elapsed / 60), secs = elapsed % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    el.textContent = `${_genDone} of ${scenesToGen.length} scenes · ${timeStr} elapsed`;
  }

  const { width, height } = getSelectedImageSize();
  const applyRateLimit = false;

  // Partition: scenes with reference images go individual; rest go grid
  const refScenes = scenesToGen.filter(s =>
    s.refImageDataUrl || (s.refCharacters && s.refCharacters.length > 0));
  const gridCandidates = scenesToGen.filter(s =>
    !s.refImageDataUrl && !(s.refCharacters && s.refCharacters.length > 0));

  // Build grid batches and individual list based on routing logic
  const gridBatches = [];   // each element = array of scene objects (up to 9)
  const individualScenes = [...refScenes]; // ref scenes always individual

  if (gridCandidates.length >= 4) {
    gridBatches.push(gridCandidates.slice(0, 9));
    let remaining = gridCandidates.slice(9);
    while (remaining.length > 0) {
      if (remaining.length >= 4) {
        gridBatches.push(remaining.slice(0, 9));
        remaining = remaining.slice(9);
      } else {
        individualScenes.push(...remaining);
        remaining = [];
      }
    }
  } else {
    individualScenes.push(...gridCandidates);
  }

  const totalUnits = gridBatches.length + individualScenes.length;
  let completedUnits = 0;

  // Helper: wait while paused, return false if cancelled
  async function checkPause(label) {
    if (!generatePaused) return true;
    const doneNow = createScenes.filter(s => s.status === 'done').length;
    updateCreateAgentTask('image', 'gen', 'running', `Paused — ${doneNow} done. ${label}`);
    await new Promise(resolve => {
      const check = () => {
        if (!generatePaused || !generateRunning) { resolve(); return; }
        setTimeout(check, 200);
      };
      check();
    });
    return generateRunning;
  }

  const textMode = $('create-image-text-mode')?.value || 'no-text';
  const noTextSuffix = textMode === 'no-text'
    ? ' No text, words, or letters in the image.'
    : textMode === 'english-only' ? ' English text only if any.' : '';
  const centerInstruction = 'Place the main subject, characters, and key objects at the CENTER of each cell. Keep all important elements within the center 80% of each cell. Leave cell edges clear of important content.';
  const formatHint = getGridFormatHint(width, height);
  const key = getImageKey() || getCreateGeminiKey();

  // ── Grid Batches ──
  let imgOffset = 0;
  for (let b = 0; b < gridBatches.length; b++) {
    if (!await checkPause(`${gridBatches.length - b} batch(es) + ${individualScenes.length} individual remaining.`)) break;

    const batch = gridBatches[b];
    const batchStart = imgOffset + 1;
    const batchEnd = imgOffset + batch.length;
    updateCreateAgentTask('image', 'gen', 'running', `Generating images ${batchStart}–${batchEnd} of ${scenesToGen.length}…`);

    // Mark all batch scenes as generating
    batch.forEach(scene => {
      scene.status = 'generating';
      updateSceneCardStatus(createScenes.indexOf(scene));
    });

    const prompts = batch.map(s => s.prompt + noTextSuffix);
    const styleWithHint = createStylePrompt
      ? `${createStylePrompt}. ${centerInstruction}`
      : centerInstruction;

    let gridDataUrl = null;
    let gridError = null;

    // Fallback chain: Pro 2K → 3.1 Flash 2K → 2.5 Flash 1K → individual
    const gridModels = [
      { model: undefined, costKey: 'gridGen2K' },
      { model: 'gemini-3.1-flash-image-preview', costKey: 'gridGen2K' },
      { model: 'gemini-2.5-flash-image', costKey: 'imageGen' },
    ];

    for (const { model, costKey } of gridModels) {
      try {
        gridDataUrl = await generateGridImage(prompts, key, styleWithHint, model, formatHint);
        trackCost(costKey, 1);
        console.log(`[Grid] batch ${b + 1} generated with ${model || 'gemini-3-pro-image-preview'}`);
        break;
      } catch (e) {
        gridError = e;
        console.warn(`[Grid] ${model || 'pro'} failed:`, e.message);
      }
    }

    if (gridDataUrl) {
      try {
        // Upscale entire grid 2x then crop cells
        const cells = await createUpscaleAndCrop(gridDataUrl, 2, 3, 3, batch.length);
        for (let ci = 0; ci < cells.length; ci++) {
          const scene = batch[ci];
          const resized = await resizeCellToTarget(cells[ci], width, height);
          scene.imgDataUrl = resized;
          scene.status = 'done';
          const idx = createScenes.indexOf(scene);
          updateSceneCardImage(idx);
          updateSceneCardStatus(idx);
          _genDone++;
          if (typeof fillTheaterCell === 'function') fillTheaterCell(idx, resized, scenesToGen.indexOf(scene));
          _updateGenCounter();
        }
      } catch (cropErr) {
        console.error('[Grid] Crop/resize failed, falling back to individual:', cropErr);
        // Fall through to individual fallback below
        gridDataUrl = null;
      }
    }

    if (!gridDataUrl) {
      // Grid fully failed — generate each scene individually
      console.warn('[Grid] All grid models failed, falling back to individual for this batch');
      for (const scene of batch) {
        if (!generateRunning) break;
        await generateSceneImage(createScenes.indexOf(scene));
        if (applyRateLimit) {
          for (let wait = 30; wait > 0; wait--) {
            updateCreateAgentTask('image', 'gen', 'running', `Scene done. Next in ${wait}s (rate limit)…`);
            await new Promise(r => setTimeout(r, 1000));
            if (!generateRunning) break;
          }
        }
      }
    }

    autoSaveCreateState();
    completedUnits++;
    imgOffset += batch.length;

    // Free tier: wait 30s between batches (not per-image)
    if (applyRateLimit && (b < gridBatches.length - 1 || individualScenes.length > 0)) {
      for (let wait = 30; wait > 0; wait--) {
        updateCreateAgentTask('image', 'gen', 'running', `Images ${batchStart}–${batchEnd} done. Next in ${wait}s…`);
        await new Promise(r => setTimeout(r, 1000));
        if (!generateRunning) break;
      }
    }
  }

  // ── Individual Scenes ──
  for (let i = 0; i < individualScenes.length; i++) {
    if (!generateRunning) break;
    if (!await checkPause(`${individualScenes.length - i} individual scene(s) remaining.`)) break;

    const scene = individualScenes[i];
    const idx = createScenes.indexOf(scene);
    updateCreateAgentTask('image', 'gen', 'running', `Generating image ${imgOffset + i + 1} of ${scenesToGen.length}…`);

    await generateSceneImage(idx);
    autoSaveCreateState();
    completedUnits++;

    // Free tier: wait 30s between images
    if (applyRateLimit && i < individualScenes.length - 1) {
      for (let wait = 30; wait > 0; wait--) {
        updateCreateAgentTask('image', 'gen', 'running', `Image ${imgOffset + i + 1} done. Next in ${wait}s…`);
        await new Promise(r => setTimeout(r, 1000));
        if (!generateRunning) break;
      }
    }
  }

  generateRunning = false;
  if (typeof updateCreateBreadcrumb === 'function') updateCreateBreadcrumb('Review');
  btnCreatePause.style.display = 'none';
  const doneCount = createScenes.filter(s => s.status === 'done').length;
  const failedCount = createScenes.filter(s => s.status === 'error').length;
  const pendingCount = createScenes.filter(s => s.status === 'pending').length;

  if (failedCount > 0 || pendingCount > 0) {
    const issues = [];
    if (failedCount > 0) issues.push(`${failedCount} failed`);
    if (pendingCount > 0) issues.push(`${pendingCount} pending`);
    btnCreateRetryFailed.style.display = '';
    btnCreateRetryFailed.textContent = `🔄 Retry ${failedCount + pendingCount} Remaining`;
    updateCreateAgentTask('image', 'gen', failedCount > 0 ? 'error' : 'warn', `${doneCount} done · ${issues.join(', ')}`);
    updateCreateAgent('image', failedCount > 0 ? 'error' : 'done', `${doneCount} done · ${issues.join(', ')}`);
  } else {
    updateCreateAgentTask('image', 'gen', 'done', `All ${doneCount} images ready`);
    const imgSummary = $('create-launch-image-summary');
    if (imgSummary) imgSummary.textContent = `✅ ${doneCount} images generated`;
  }
  // Emoji reel — fade out as images arrive
  if (typeof window !== 'undefined' && typeof window.completeEmojiReel === 'function') {
    try { window.completeEmojiReel('create'); } catch (_) {}
  }
  // #4 Premiere flash
  if (typeof triggerPremiereFlash === 'function') triggerPremiereFlash(doneCount, scenesToGen.length);
  updateCreateButtons();
  updateStepStates();

  // Animated mode: run Kling animation after image generation
  if (createVideoMode === 'animated' && typeof animateScenes === 'function') {
    const scenesWithImages = createScenes.filter(s => s.imgDataUrl);
    if (scenesWithImages.length > 0) {
      const videoBar = $('create-video-bar');
      const videoLabel = $('create-video-label');
      const videoProgress = $('create-video-progress');
      if (videoProgress) videoProgress.classList.add('visible');
      if (videoBar) videoBar.style.width = '0%';
      if (videoLabel) videoLabel.textContent = 'Animating scenes…';
      const videoStep = $('create-video-step');
      if (videoStep) videoStep.style.display = '';
      updateStepStates();
      updateCreateAgent('animation', 'running', `0/${scenesWithImages.length} clips`);
      try {
        await animateScenes(scenesWithImages, (done, total, label) => {
          if (videoBar) videoBar.style.width = Math.round((done / total) * 100) + '%';
          if (videoLabel) videoLabel.textContent = label;
          updateCreateAgent('animation', 'running', label);
        }, getCreateGeminiKey());
        renderCreateVideoCards();
        if (videoLabel) videoLabel.textContent = `Done! ${scenesWithImages.length} scenes animated.`;
        updateCreateAgent('animation', 'done', `${scenesWithImages.length} clips ready`);
        const animSummary = $('create-launch-animation-summary');
        if (animSummary) animSummary.textContent = `✅ ${scenesWithImages.length} scenes animated`;
      } catch (animErr) {
        if (videoLabel) { videoLabel.textContent = `Animation error: ${animErr.message}`; videoLabel.style.color = '#ef4444'; }
        updateCreateAgent('animation', 'error', animErr.message);
      }
      setTimeout(() => { if (videoProgress) videoProgress.classList.remove('visible'); }, 4000);
      updateStepStates();
    }
  }
}

// ── Animated Video Cards ──

function renderCreateVideoCards() {
  const grid = $('create-video-grid');
  if (!grid || !createScenes) return;
  const { ratio } = getSelectedImageSize();
  grid.innerHTML = '';
  createScenes.forEach((scene, idx) => {
    const card = document.createElement('div');
    card.className = 'scene-card';
    card.id = `create-video-card-${idx}`;
    const hasVideo = !!scene.videoUrl;
    card.innerHTML = `
      <div class="scene-card-img" id="create-video-img-${idx}" style="aspect-ratio:${ratio}; background:#111; position:relative;">
        ${hasVideo
          ? `<video id="create-video-el-${idx}" src="${scene.videoUrl}" style="width:100%;height:100%;object-fit:cover;" muted playsinline preload="metadata"></video>`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#e44;font-size:0.72rem;padding:6px;text-align:center;">${scene.videoError ? 'Animation failed — click Regen' : (scene.status === 'error' ? 'Image failed — click Regen' : 'No video')}</div>`}
      </div>
      <div style="padding:6px 8px;">
        <div style="display:flex; gap:4px; align-items:center; margin-bottom:4px;">
          <button class="btn-xs" onclick="createVideoPlay(${idx})">▶</button>
          <button class="btn-xs" onclick="createVideoPause(${idx})">⏸</button>
          <button class="btn-xs" onclick="createVideoStop(${idx})">⏹</button>
          <span id="create-video-time-${idx}" style="font-size:0.65rem; color:#aaa; margin-left:4px;">0:00</span>
        </div>
        <input type="range" id="create-video-seek-${idx}" min="0" max="1000" value="0"
          style="width:100%; margin-bottom:4px; cursor:pointer;"
          oninput="createVideoSeek(${idx}, this.value)">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.68rem; color:#888;">Scene ${idx + 1}</span>
          <button class="btn-xs danger" onclick="regenSceneImageAndVideo(${idx})">🔄 Regen</button>
        </div>
      </div>`;
    grid.appendChild(card);
    if (hasVideo) wireCreateVideoCard(idx);
  });
  const regenAllBtn = $('btn-create-regen-all-videos');
  if (regenAllBtn) {
    regenAllBtn.onclick = async () => {
      const failed = createScenes.map((s, i) => i).filter(i => !createScenes[i].videoUrl);
      for (const idx of failed) await regenSceneImageAndVideo(idx);
    };
  }
}

function wireCreateVideoCard(idx) {
  const videoEl = $(`create-video-el-${idx}`);
  const seekEl = $(`create-video-seek-${idx}`);
  const timeEl = $(`create-video-time-${idx}`);
  if (!videoEl) return;
  videoEl.ontimeupdate = () => {
    if (!videoEl.duration) return;
    if (seekEl) seekEl.value = Math.round((videoEl.currentTime / videoEl.duration) * 1000);
    if (timeEl) timeEl.textContent = fmtShort(videoEl.currentTime);
  };
}

function createVideoPlay(idx) {
  const v = $(`create-video-el-${idx}`); if (v) v.play().catch(() => {});
}
function createVideoPause(idx) {
  const v = $(`create-video-el-${idx}`); if (v) v.pause();
}
function createVideoStop(idx) {
  const v = $(`create-video-el-${idx}`); if (v) { v.pause(); v.currentTime = 0; }
}
function createVideoSeek(idx, val) {
  const v = $(`create-video-el-${idx}`); if (v && v.duration) v.currentTime = (val / 1000) * v.duration;
}

async function regenSceneImageAndVideo(idx) {
  if (!createScenes) return;
  const scene = createScenes[idx];
  scene.videoUrl = null;
  scene.videoClips = null;
  updateCreateVideoCard(idx, 'generating');
  try {
    await generateSceneImage(idx);
    if (scene.imgDataUrl && createVideoMode === 'animated' && typeof animateScenes === 'function') {
      updateCreateVideoCard(idx, 'animating');
      await animateScenes([scene], (done, total, label) => {
        updateCreateVideoCard(idx, label);
      }, getCreateGeminiKey());
    }
  } catch (e) {
    updateCreateVideoCard(idx, 'error');
    return;
  }
  renderCreateVideoCardSingle(idx);
  autoSaveCreateState();
}

function updateCreateVideoCard(idx, status) {
  const imgDiv = $(`create-video-img-${idx}`);
  if (!imgDiv) return;
  const { ratio } = getSelectedImageSize();
  imgDiv.style.aspectRatio = ratio;
  imgDiv.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:0.72rem;padding:8px;text-align:center;">${status}</div>`;
}

function renderCreateVideoCardSingle(idx) {
  const card = $(`create-video-card-${idx}`);
  if (!card) return;
  const scene = createScenes[idx];
  const { ratio } = getSelectedImageSize();
  const hasVideo = !!scene.videoUrl;
  const imgDiv = $(`create-video-img-${idx}`);
  if (imgDiv) {
    imgDiv.style.aspectRatio = ratio;
    imgDiv.innerHTML = hasVideo
      ? `<video id="create-video-el-${idx}" src="${scene.videoUrl}" style="width:100%;height:100%;object-fit:cover;" muted playsinline preload="metadata"></video>`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#e44;font-size:0.75rem;">Failed</div>`;
    if (hasVideo) wireCreateVideoCard(idx);
  }
}

btnCreatePause.addEventListener('click', () => {
  if (!generateRunning) return;
  generatePaused = !generatePaused;
  if (generatePaused) {
    btnCreatePause.textContent = '▶ Resume';
  } else {
    btnCreatePause.textContent = '⏸ Pause';
  }
});

function launchImageAgent() {
  if (!createScenes || createScenes.length === 0) return;
  const step = $('create-generate-step');
  if (step) {
    step.style.display = '';
    step.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  runImageGeneration([...createScenes]);
}

btnCreateRetryFailed.addEventListener('click', async () => {
  const remaining = createScenes.filter(s => s.status === 'error' || s.status === 'pending');
  if (remaining.length === 0) return;
  await runImageGeneration(remaining);
});

