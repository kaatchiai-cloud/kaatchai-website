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
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const arrayBuf = await file.arrayBuffer();
    createOriginalBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
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

// Always detect against ORIGINAL audio so user can re-adjust settings
btnCreateSilDetect.addEventListener('click', () => {
  if (!createOriginalBuffer) return;
  const threshDb = parseFloat(createSilThreshold.value);
  const minDur = parseFloat(createSilMinDur.value);
  const mode = createSilMethod.value;
  createDetectedRegions = detectSilence(createOriginalBuffer, threshDb, minDur, mode);

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

    // Render visual against original duration
    createSilVisual.innerHTML = '';
    createSilVisual.style.display = 'block';
    const dur = createOriginalBuffer.duration;
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

// Always apply against ORIGINAL audio — user can re-detect with new settings and re-apply
btnCreateSilApply.addEventListener('click', () => {
  if (!createOriginalBuffer || createDetectedRegions.length === 0) return;
  const filtered = removeSilentRegions(createOriginalBuffer, createDetectedRegions);
  if (!filtered) {
    createSilInfo.textContent = 'Cannot remove — would delete all audio!';
    createSilInfo.style.color = '#ef4444';
    return;
  }
  const removed = createOriginalBuffer.duration - filtered.duration;
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
const createTtsProvider = $('create-tts-provider');
const createTtsVoice = $('create-tts-voice');
const createGcloudKeyRow = $('create-gcloud-key-row');
const createGcloudTtsKey = $('create-gcloud-tts-key');
const btnCreateGenerateTts = $('btn-create-generate-tts');
const createTtsStatus = $('create-tts-status');

const GEMINI_TTS_VOICES = [
  { value: 'Kore', label: 'Kore (Female)' },
  { value: 'Charon', label: 'Charon (Male)' },
  { value: 'Fenrir', label: 'Fenrir (Male)' },
  { value: 'Aoede', label: 'Aoede (Female)' },
  { value: 'Puck', label: 'Puck (Male)' },
  { value: 'Leda', label: 'Leda (Female)' },
  { value: 'Orus', label: 'Orus (Male)' },
  { value: 'Zephyr', label: 'Zephyr (Female)' },
];

const GCLOUD_TTS_VOICES = [
  { value: 'ta-IN-Standard-A', label: 'Tamil - Standard A (Female)' },
  { value: 'ta-IN-Standard-B', label: 'Tamil - Standard B (Male)' },
  { value: 'ta-IN-Standard-C', label: 'Tamil - Standard C (Female)' },
  { value: 'ta-IN-Standard-D', label: 'Tamil - Standard D (Male)' },
  { value: 'ta-IN-Wavenet-A', label: 'Tamil - Wavenet A (Female)' },
  { value: 'ta-IN-Wavenet-B', label: 'Tamil - Wavenet B (Male)' },
  { value: 'ta-IN-Wavenet-C', label: 'Tamil - Wavenet C (Female)' },
  { value: 'ta-IN-Wavenet-D', label: 'Tamil - Wavenet D (Male)' },
  { value: 'en-US-Casual-K', label: 'English US - Casual K (Male)' },
  { value: 'en-US-Standard-C', label: 'English US - Standard C (Female)' },
  { value: 'en-US-Standard-D', label: 'English US - Standard D (Male)' },
  { value: 'en-US-Wavenet-D', label: 'English US - Wavenet D (Male)' },
  { value: 'en-US-Wavenet-F', label: 'English US - Wavenet F (Female)' },
];

function populateVoiceDropdown() {
  createTtsVoice.innerHTML = '';
  const voices = createTtsProvider.value === 'gemini' ? GEMINI_TTS_VOICES : GCLOUD_TTS_VOICES;
  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.value; opt.textContent = v.label;
    createTtsVoice.appendChild(opt);
  });
}
populateVoiceDropdown();

createTtsProvider.addEventListener('change', () => {
  populateVoiceDropdown();
  createGcloudKeyRow.style.display = createTtsProvider.value === 'gcloud' ? '' : 'none';
  // Restore saved gcloud key
  if (createTtsProvider.value === 'gcloud') {
    createGcloudTtsKey.value = localStorage.getItem('stori_gcloud_tts_key') || '';
  }
});

// Save gcloud key on blur
createGcloudTtsKey.addEventListener('blur', () => {
  const k = createGcloudTtsKey.value.trim();
  if (k) localStorage.setItem('stori_gcloud_tts_key', k);
});

function setCreateInputMode(mode) {
  // Gate podcast mode for free tier
  if (mode === 'video' && isFree()) {
    showUpgradePrompt('Podcast pipeline with chapters and PiP is a Pro feature.');
    return;
  }
  createInputMode = mode === 'video' ? 'podcast' : mode; // video tab = podcast mode
  createModeVoice.classList.toggle('active', mode === 'voice');
  createModeVideo.classList.toggle('active', mode === 'video');
  createModeText.classList.toggle('active', mode === 'text');
  createVoiceSection.style.display = mode === 'voice' ? '' : 'none';
  createVideoSection.style.display = mode === 'video' ? '' : 'none';
  createTextSection.style.display = mode === 'text' ? '' : 'none';
  // Show lock icon on podcast tab for free tier
  if (isFree()) createModeVideo.innerHTML = '🔒 Podcast';
  else createModeVideo.innerHTML = '🎙️ Podcast';
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
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
  return { audioBuffer, blob };
}

btnCreateGenerateTts.addEventListener('click', async () => {
  const text = createTtsText.value.trim();
  if (!text) { createTtsStatus.textContent = 'Please enter some text'; return; }

  const provider = createTtsProvider.value;
  const voiceName = createTtsVoice.value;
  let apiKey;

  if (provider === 'gemini') {
    apiKey = getCreateGeminiKey();
    if (!apiKey) { createTtsStatus.textContent = 'Enter your Gemini API key in Step 1 first'; return; }
  } else {
    apiKey = createGcloudTtsKey.value.trim() || localStorage.getItem('stori_gcloud_tts_key');
    if (!apiKey) { createTtsStatus.textContent = 'Enter your Google Cloud TTS API key'; return; }
  }

  btnCreateGenerateTts.disabled = true;
  btnCreateGenerateTts.innerHTML = '<span class="spinner"></span> Generating...';
  createTtsStatus.textContent = '';

  try {
    let result;
    if (provider === 'gemini') {
      result = await generateTTSGemini(text, voiceName, apiKey);
    } else {
      result = await generateTTSGCloud(text, voiceName, apiKey);
    }

    const { audioBuffer, blob } = await decodeBase64Audio(result.base64, result.mimeType);
    createAudioBuffer = audioBuffer;
    createOriginalBuffer = audioBuffer;

    trackCost('tts', 1);
    createTtsStatus.textContent = `Audio generated (${audioBuffer.duration.toFixed(1)}s)`;
    btnCreateGenerateTts.textContent = '🔊 Regenerate Audio';
    updateCreateButtons();
    updateStepStates();
    await showCreateAudioEditor();
  } catch (e) {
    createTtsStatus.textContent = 'Audio generation failed. ' + friendlyApiError(e.message);
    createTtsStatus.style.color = '#ef4444';
    console.error('TTS error:', e);
  } finally {
    btnCreateGenerateTts.disabled = false;
    if (!btnCreateGenerateTts.innerHTML.includes('Regenerate')) {
      btnCreateGenerateTts.textContent = '🔊 Generate Audio';
    }
  }
});

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
    waveColor: '#6c63ff',
    progressColor: '#4a42cc',
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
  createAudioEditor.style.display = 'block';
  createUndoStack = [];
  await refreshCreateWaveform();
}

function destroyCreateAudioEditor() {
  if (createWavesurfer) { createWavesurfer.destroy(); createWavesurfer = null; }
  createAudioEditor.style.display = 'none';
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

// Step state indicators (#7 + #9)
function updateStepStates() {
  const steps = createPage.querySelectorAll('.create-step');
  const hasKey = !!(getFreeKey() || getPaidKey());
  const hasAudio = !!createAudioBuffer;
  const hasTranscript = !!createTranscript;
  const hasScenes = createScenes && createScenes.length > 0;
  const hasImages = hasScenes && createScenes.some(s => s.imgDataUrl);

  // steps[0] = Step 1: API Key
  steps[0].classList.toggle('step-done', hasKey);
  // steps[1] = Step 2: Input (Voice/Text)
  steps[1].classList.toggle('step-done', hasAudio);
  // steps[2] = Step 3: Output Size (no state tracking)
  // steps[3] = Step 4: Transcribe / Storyboard generation
  if (steps[3]) {
    steps[3].classList.toggle('step-done', hasTranscript);
    steps[3].classList.toggle('step-active', hasKey && hasAudio && !hasTranscript);
  }
  const hasChapters = createChapters && createChapters.length > 0;
  const isPodcast = createInputMode === 'podcast';

  // steps[4] = Step 5: Chapter Splitting (podcast only)
  if (steps[4]) {
    if (isPodcast) {
      steps[4].classList.toggle('step-done', hasChapters);
      steps[4].classList.toggle('step-active', hasTranscript && !hasChapters);
    } else {
      steps[4].style.display = 'none';
    }
  }
  // steps[5] = Step 6: Storyboard
  if (steps[5]) {
    steps[5].classList.toggle('step-done', hasScenes);
    steps[5].classList.toggle('step-active', hasTranscript && !hasScenes);
  }
  // steps[6] = Step 7: Visual References (optional, shown after scenes exist)
  if (steps[6]) {
    if (hasScenes) {
      steps[6].style.display = '';
      renderSceneAssignments();
    } else {
      steps[6].style.display = 'none';
    }
  }
  // steps[7] = Step 8: Generate Images
  const allImagesDone = hasImages && createScenes.every(s => s.status === 'done');
  if (steps[7]) {
    steps[7].classList.toggle('step-done', allImagesDone);
    steps[7].classList.toggle('step-active', hasScenes && !allImagesDone);
  }
  // steps[8] = Step 9: Multi-Language (Pro only, unlocked after images)
  if (steps[8]) {
    if (hasImages && isPro()) {
      steps[8].style.display = '';
      renderPrimaryAudioCard();
      steps[8].classList.toggle('step-active', true);
    } else {
      steps[8].style.display = 'none';
    }
  }
  // steps[9] = Step 10: Send to Editor
  if (steps[9]) {
    if (hasImages) {
      steps[9].style.display = '';
    }
    steps[9].classList.toggle('step-active', hasImages);
  }
}

// Auto-save create state to localStorage (#4)
function autoSaveCreateState() {
  markDirty();
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
  if (!key || !createAudioBuffer) return;

  btnCreateTranscribe.disabled = true;
  createTranscribeProgress.classList.add('visible');
  createTranscribeLabel.style.color = '';
  createTranscribeBar.style.width = '10%';

  try {
    let segments;

    if (createInputMode === 'text') {
      // ── Text mode: segment text + generate scene descriptions ──
      btnCreateTranscribe.innerHTML = '<span class="spinner"></span> Generating storyboard...';
      createTranscribeLabel.textContent = 'Segmenting text...';
      const inputText = createTtsText.value.trim();
      if (!inputText) throw new Error('No text entered');

      segments = segmentTextForStoryboard(inputText, createAudioBuffer.duration);
      createTranscribeBar.style.width = '30%';

      // Call Gemini to generate scene descriptions for each segment
      createTranscribeLabel.textContent = 'Generating scene descriptions...';
      const segTexts = segments.map((s, i) => `Segment ${i+1} [${s.startTime.toFixed(1)}s – ${s.endTime.toFixed(1)}s]: "${s.text}"`).join('\n');

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `Given these text segments from a script, generate a vivid visual scene description for each segment suitable for AI image generation.

${segTexts}

Return ONLY a valid JSON array with no markdown formatting:
[{"segmentIndex": 0, "sceneDescription": "A detailed visual description: subject, style, mood, colors, composition"}]

Important: sceneDescription should describe what should be SEEN, not just what is said. Make it artistic and visually compelling. One entry per segment, in order.` }]
            }]
          })
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error ${resp.status}`);
      }

      createTranscribeBar.style.width = '80%';
      createTranscribeLabel.textContent = 'Processing scene descriptions...';

      const data = await resp.json();
      const respText = data.candidates?.[0]?.content?.parts?.[0]?.text;
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
      // Fill any empty descriptions
      segments.forEach(s => {
        if (!s.sceneDescription) s.sceneDescription = `Visual scene depicting: ${s.text.slice(0, 100)}`;
      });

    } else {
      // ── Voice mode: full audio transcription ──
      btnCreateTranscribe.innerHTML = '<span class="spinner"></span> Transcribing...';
      createTranscribeLabel.textContent = 'Converting audio...';

      const wavBlob = audioBufferToWavBlob(createAudioBuffer);
      createTranscribeBar.style.width = '25%';
      createTranscribeLabel.textContent = 'Encoding audio...';

      const base64DataUrl = await blobToBase64(wavBlob);
      const base64Data = base64DataUrl.split(',')[1];

      const sizeMB = (base64Data.length * 3 / 4) / (1024 * 1024);
      if (sizeMB > 20) {
        createTranscribeLabel.textContent = `Audio is ${sizeMB.toFixed(0)}MB — may be too large. Trying anyway...`;
      }

      createTranscribeBar.style.width = '40%';
      createTranscribeLabel.textContent = 'Sending to Gemini for transcription...';

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
[{"startTime": 0, "endTime": 60, "text": "transcribed words here", "sceneDescription": ""}]

Note: sceneDescription can be empty — it will be generated later per chapter.`
                  : `Transcribe this audio which is ${createAudioBuffer.duration.toFixed(1)} seconds long. Break it into segments of roughly ${getSegmentDuration().min}-${getSegmentDuration().max} seconds each. The segments MUST cover the ENTIRE audio from 0.0 to ${createAudioBuffer.duration.toFixed(1)} seconds with NO gaps and NO skipped portions.

STRICT RULES (MUST follow ALL):
1. NO segment may exceed ${getSegmentDuration().max} seconds. If a natural segment is longer, split it into sub-segments of ${getSegmentDuration().max} seconds or less.
2. Minimum segment length: ${getSegmentDuration().min} seconds. Maximum: ${getSegmentDuration().max} seconds. Hard limit, NO exceptions.
3. Segments MUST be perfectly contiguous — each segment's startTime MUST equal the previous segment's endTime. No gaps allowed.
4. First segment startTime MUST be 0. Last segment endTime MUST be exactly ${createAudioBuffer.duration.toFixed(1)}.
5. EVERY part of the audio must be transcribed. Do NOT skip, summarize, or omit any section in the middle or end.
6. If the audio has silence or music without speech, still create a segment for it with text like "[instrumental]" or "[silence]".

VALIDATION: After generating, verify that your segments form a complete chain: 0 → ... → ${createAudioBuffer.duration.toFixed(1)} with no missing time ranges.

For each segment, provide the transcribed text AND a detailed visual scene description suitable for generating an illustration image.

Return ONLY a valid JSON array with no markdown formatting, in this exact structure:
[{"startTime": 0, "endTime": 10, "text": "transcribed words here", "sceneDescription": "A detailed visual description for image generation: subject, style, mood, colors, composition"}]

Important: sceneDescription should be a vivid, specific image generation prompt — describe what should be SEEN, not just what is said. Make it artistic and visually compelling.` }
              ]
            }],
          };

      const data = await callGeminiAPI(getTranscriptionModels(), transcribeBody);

      createTranscribeBar.style.width = '80%';
      createTranscribeLabel.textContent = 'Processing response...';

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('No transcription returned from Gemini');

      segments = parseGeminiJson(text);

      if (!Array.isArray(segments) || segments.length === 0) {
        throw new Error('Invalid response format — expected JSON array of segments');
      }

      // Post-process: fix gaps and ensure full coverage
      segments.sort((a, b) => a.startTime - b.startTime);
      const totalDur = createAudioBuffer.duration;
      const fixed = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const expectedStart = fixed.length > 0 ? fixed[fixed.length - 1].endTime : 0;
        if (seg.startTime > expectedStart + 1) {
          fixed.push({ startTime: expectedStart, endTime: seg.startTime, text: '[continued]', sceneDescription: seg.sceneDescription || 'Abstract visual transition with gentle colors and flowing shapes' });
          console.log(`[storyboard] Filled gap: ${expectedStart.toFixed(1)}s – ${seg.startTime.toFixed(1)}s`);
        }
        seg.startTime = fixed.length > 0 ? fixed[fixed.length - 1].endTime : 0;
        if (seg.endTime - seg.startTime > 15) seg.endTime = seg.startTime + 15;
        fixed.push(seg);
      }
      if (fixed.length > 0 && fixed[fixed.length - 1].endTime < totalDur - 0.5) {
        const last = fixed[fixed.length - 1];
        if (createInputMode === 'podcast') {
          // Podcast: just extend last segment to cover remaining (no [continued] padding)
          last.endTime = totalDur;
          console.log(`[storyboard] Extended last segment to ${totalDur.toFixed(1)}s (podcast mode)`);
        } else if (totalDur - last.endTime <= 15) {
          last.endTime = totalDur;
        } else {
          let t = last.endTime;
          while (t < totalDur - 0.5) {
            const end = Math.min(t + 10, totalDur);
            fixed.push({ startTime: t, endTime: end, text: '[continued]', sceneDescription: last.sceneDescription || 'Abstract visual with gentle colors' });
            t = end;
          }
        }
        console.log(`[storyboard] Extended coverage to ${totalDur.toFixed(1)}s`);
      }
      segments = fixed;
    }

    // ── Common: save raw transcript ──
    trackCost('transcription', 1);
    createTranscript = segments;

    createTranscriptOutput.textContent = segments.map(s =>
      `[${fmt(s.startTime)} – ${fmt(s.endTime)}] ${s.text}`
    ).join('\n\n');
    createTranscriptOutput.classList.add('visible');

    if (createInputMode === 'podcast') {
      // Podcast mode: show chapter step, don't build scenes yet
      createChapterStep.style.display = 'block';
      createStoryboardStep.style.display = 'none';
      createGenerateStep.style.display = 'none';
      createLanguageStep.style.display = 'none';
      createSendStep.style.display = 'none';
    } else {
      // Audio/Text mode: build scenes directly from segments (existing flow)
      createScenes = segments.map(s => ({
        prompt: s.sceneDescription,
        startTime: s.startTime,
        endTime: s.endTime,
        duration: (s.endTime - s.startTime),
        text: s.text,
        imgDataUrl: null,
        status: 'pending',
      }));
      renderStoryboard();
      createStoryboardStep.style.display = 'block';
      createGenerateStep.style.display = 'block';
      createLanguageStep.style.display = 'none';
      createSendStep.style.display = 'none';
    }
    btnCreateSaveEarly.style.display = '';

    createTranscribeBar.style.width = '100%';
    const actionLabel = createInputMode === 'text' ? 'Generated' : 'Transcribed';
    const nextStep = createInputMode === 'podcast' ? 'Set up chapters in Step 5.' : 'Review prompts in Step 6.';
    createTranscribeLabel.textContent = `${actionLabel} ${segments.length} segments. ${nextStep}`;
    btnCreateTranscribe.textContent = `✓ ${actionLabel}`;
    setTimeout(() => createTranscribeProgress.classList.remove('visible'), 3000);
    updateCreateButtons();
    updateStepStates();
    autoSaveCreateState();

  } catch (e) {
    createTranscribeLabel.textContent = 'Transcription failed. ' + friendlyApiError(e.message);
    createTranscribeLabel.style.color = '#ef4444';
    createTranscribeBar.style.width = '0%';
    createTranscribeProgress.classList.add('visible');
    console.error('Transcription error:', e);
    btnCreateTranscribe.disabled = false;
    btnCreateTranscribe.textContent = createInputMode === 'text' ? '🔄 Retry Storyboard' : '🔄 Retry Transcription';
  } finally {
    updateCreateButtons();
    if (getCreateGeminiKey() && createAudioBuffer) btnCreateTranscribe.disabled = false;
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
  } catch(e) {
    chapterAiStatus.textContent = 'Chapter detection failed. ' + friendlyApiError(e.message);
    console.error('Chapter detection error:', e);
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
        <input type="text" class="chapter-card-title" value="${ch.title}" data-idx="${i}">
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
  btnChapterProceed.innerHTML = '<span class="spinner"></span> Generating storyboard...';

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
              contents: [{ parts: [{ text: `For the podcast chapter "${ch.title}", generate a vivid visual scene description for each scene. Each description should be suitable for AI image generation.\n\nScenes:\n${sceneTexts}\n\nReturn a JSON array with EXACTLY ${chScenes.length} entries, one per scene, starting from index 0:\n[{"sceneIndex":0,"sceneDescription":"detailed visual description: subject, composition, mood, colors"}]\n\nIMPORTANT: Return EXACTLY ${chScenes.length} entries. All string values MUST be in double quotes. Return ONLY valid JSON, no markdown.` }] }],
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

    // Show storyboard + generate steps
    renderStoryboard();
    createStoryboardStep.style.display = 'block';
    createGenerateStep.style.display = 'block';
    updateCreateButtons();
    updateStepStates();
    autoSaveCreateState();
  } catch(e) {
    console.error('Chapter storyboard error:', e);
    chapterAiStatus.textContent = 'Storyboard generation failed. ' + friendlyApiError(e.message);
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
3. A vivid visual scene description for AI image generation

Return a JSON array with EXACTLY ${ch.splits} entries:
[{"startTime":${ch.startTime.toFixed(1)},"endTime":100.0,"text":"transcript portion","sceneDescription":"detailed visual: subject, composition, mood, colors"}]

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
        <span class="storyboard-chapter-title">${ch.title}</span>
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

  if (!confirm('This will overwrite all your current image prompts with new AI-generated ones. Continue?')) return;

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
            parts: [{ text: `Here is a transcript with timestamps from an audio that is ${createAudioBuffer.duration.toFixed(1)} seconds long:\n\n${transcriptText}\n\nFor each segment, generate a vivid, detailed image generation prompt that visually represents the content being discussed. The prompt should describe a scene with specific details about subject, composition, style, mood, lighting, and colors — suitable for AI image generation.\n\nIMPORTANT: The segments MUST cover the ENTIRE audio duration from 0 to ${createAudioBuffer.duration.toFixed(1)} seconds. The last segment's endTime must be ${createAudioBuffer.duration.toFixed(1)}. Do not skip or shorten any segment.\n\nReturn ONLY a valid JSON array with no markdown:\n[{"startTime": 0, "endTime": 10, "prompt": "detailed image prompt here"}]` }]
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
  const val = createImageSize.value; // e.g. "1280x720"
  const [w, h] = val.split('x').map(Number);
  return { width: w, height: h, ratio: `${w}/${h}` };
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
        <div class="scene-text">"${scene.text}"</div>
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
        <span class="storyboard-chapter-title">${ch.title}</span>
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

async function generateImageGeminiFlash(prompt, key, { width, height, refImageDataUrl, refParts } = {}, modelOverride) {
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

  const body = JSON.stringify({
    contents: [{ parts }]
  });

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
    if (!imgDataUrl) throw lastError || new Error('Image generation failed. Free tier may not support image generation — try adding a paid tier key.');
    scene.imgDataUrl = imgDataUrl;
    scene.status = 'done';
    trackCost(isPaidTier() ? 'imageGenQuality' : 'imageGenFast', 1);
    updateSceneCardImage(idx);
    updateSceneCardStatus(idx);
    autoSaveCreateState();
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
    : scene.status === 'error' ? `✗ ${errorMsg || 'Error'}`
    : '○ Pending';
  // Show/hide download button on this card
  const card = statusEl.closest('.scene-card');
  if (card) {
    const dlBtn = card.querySelector('.btn-download-img');
    if (dlBtn) dlBtn.style.display = scene.imgDataUrl ? '' : 'none';
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
  await generateSceneImage(idx);
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
  btnCreateGenerate.disabled = true;
  btnCreateRetryFailed.style.display = 'none';
  btnCreatePause.style.display = '';
  btnCreatePause.textContent = '⏸ Pause';
  generatePaused = false;
  generateRunning = true;
  createGenerateProgress.classList.add('visible');
  createGenerateLabel.style.color = '';
  const total = scenesToGen.length;

  for (let i = 0; i < total; i++) {
    // Check if paused — wait until resumed
    if (generatePaused) {
      const doneNow = createScenes.filter(s => s.status === 'done').length;
      const remaining = total - i;
      createGenerateLabel.textContent = `Paused — ${doneNow} done, ${remaining} remaining.`;
      createGenerateLabel.style.color = '#f59e0b';
      // Wait for resume
      await new Promise(resolve => {
        const check = () => {
          if (!generatePaused) { resolve(); return; }
          if (!generateRunning) { resolve(); return; } // cancelled
          setTimeout(check, 200);
        };
        check();
      });
      if (!generateRunning) break; // generation was cancelled
      createGenerateLabel.style.color = '';
    }

    const idx = createScenes.indexOf(scenesToGen[i]);
    const pct = Math.round(((i) / total) * 100);
    createGenerateBar.style.width = pct + '%';
    const isFree = !isPaidTier();
    if (isFree) {
      createGenerateLabel.textContent = `Generating image ${i + 1} of ${total} (free tier — slower)...`;
    } else {
      createGenerateLabel.textContent = `Generating image ${i + 1} of ${total}...`;
    }
    await generateSceneImage(idx);
    // Free tier: 2 IPM limit — wait 30s between images
    if (isFree && i < total - 1) {
      for (let wait = 30; wait > 0; wait--) {
        createGenerateLabel.textContent = `Image ${i + 1} done. Next in ${wait}s (free tier: 2 images/min)...`;
        await new Promise(r => setTimeout(r, 1000));
        if (!generateRunning) break;
      }
    }
  }

  generateRunning = false;
  btnCreatePause.style.display = 'none';
  createGenerateBar.style.width = '100%';
  const doneCount = createScenes.filter(s => s.status === 'done').length;
  const failedCount = createScenes.filter(s => s.status === 'error').length;
  const pendingCount = createScenes.filter(s => s.status === 'pending').length;

  if (failedCount > 0 || pendingCount > 0) {
    const issues = [];
    if (failedCount > 0) issues.push(`${failedCount} failed`);
    if (pendingCount > 0) issues.push(`${pendingCount} pending`);
    createGenerateLabel.textContent = `${doneCount}/${createScenes.length} generated, ${issues.join(', ')}.`;
    createGenerateLabel.style.color = '#f59e0b';
    btnCreateRetryFailed.style.display = '';
    btnCreateRetryFailed.textContent = `🔄 Retry ${failedCount + pendingCount} Remaining`;
  } else {
    createGenerateLabel.textContent = `Done! All ${doneCount} images generated.`;
    setTimeout(() => createGenerateProgress.classList.remove('visible'), 3000);
  }
  btnCreateGenerate.disabled = false;
  updateCreateButtons();
  updateStepStates();
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

btnCreateGenerate.addEventListener('click', async () => {
  if (!createScenes || createScenes.length === 0) return;
  await runImageGeneration([...createScenes]);
});

btnCreateRetryFailed.addEventListener('click', async () => {
  const remaining = createScenes.filter(s => s.status === 'error' || s.status === 'pending');
  if (remaining.length === 0) return;
  await runImageGeneration(remaining);
});

