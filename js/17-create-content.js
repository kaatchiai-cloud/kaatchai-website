// ══════════════════════════════════════════
//  CREATE CONTENT PIPELINE
// ══════════════════════════════════════════
const createPage = $('create-page');
const btnCreateContent = $('btn-create-content');
const btnCreateBack = $('btn-create-back');
const createApiKey = $('create-api-key');
const btnSaveApiKey = $('btn-save-api-key');
const createKeyStatus = $('create-key-status');
const createAudioInput = $('create-audio-input');
const btnCreateImportAudio = $('btn-create-import-audio');
const createAudioName = $('create-audio-name');
const btnCreateTranscribe = $('btn-create-transcribe');
const createTranscribeProgress = $('create-transcribe-progress');
const createTranscribeBar = $('create-transcribe-bar');
const createTranscribeLabel = $('create-transcribe-label');
const createTranscriptOutput = $('create-transcript-output');
const createStoryboardStep = $('create-storyboard-step');
const createStoryboardGrid = $('create-storyboard-grid');
const btnCreateRegeneratePrompts = $('btn-create-regenerate-prompts');
const createGenerateStep = $('create-generate-step');
const createImageProvider = $('create-image-provider');
const createImageSize = $('create-image-size');
const btnCreateGenerate = $('btn-create-generate');
const createGenerateProgress = $('create-generate-progress');
const createGenerateBar = $('create-generate-bar');
const createGenerateLabel = $('create-generate-label');
const createSceneGrid = $('create-scene-grid');
const createSendStep = $('create-send-step');
const btnCreateSendEditor = $('btn-create-send-editor');
const btnCreateSaveProject = $('btn-create-save-project');
const btnCreateSaveEarly = $('btn-create-save-early');
const btnBackToCreate = $('btn-back-to-create');

let createAudioBuffer = null;
let createOriginalBuffer = null;  // original audio kept until transcribe
let createAudioFile = null;
let createTranscript = null;
let createScenes = null;
let cameFromCreate = false;  // tracks if editor was entered via Create flow
let createInputMode = 'voice';  // 'voice' | 'text'
let imagePreviewIndex = 0;

// Style consistency
let createStylePrompt = '';
let createStylePreset = '';
const createStylePresetEl = $('create-style-preset');
const createStylePromptEl = $('create-style-prompt');

const STYLE_PRESETS = {
  'watercolor': 'Watercolor painting style with soft, flowing colors and visible brush strokes on textured paper.',
  'cinematic': 'Cinematic photography with dramatic lighting, shallow depth of field, and film grain. Professional color grading.',
  'anime': 'Japanese anime art style with clean lines, vibrant colors, and expressive character design.',
  'oil-painting': 'Classical oil painting style with rich textures, visible brush strokes, and dramatic chiaroscuro lighting.',
  'digital-art': 'Clean digital art illustration with smooth gradients, vibrant colors, and precise details.',
  'minimalist': 'Minimalist illustration with simple shapes, limited color palette, and clean negative space.',
  'photorealistic': 'Ultra-photorealistic image with perfect lighting, sharp details, and natural colors.',
  'comic': 'Comic book art style with bold outlines, halftone dots, dynamic composition, and vivid colors.',
};

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

// Navigation
btnCreateContent.addEventListener('click', () => {
  dropZone.classList.add('hidden');
  createPage.classList.add('visible');
  const saved = localStorage.getItem('stori_gemini_key');
  if (saved) {
    createApiKey.value = saved;
    createKeyStatus.textContent = '✓ Saved';
    createKeyStatus.style.color = '#10b981';
  }
  updateCreateButtons();
  updateStepStates();
});
btnCreateBack.addEventListener('click', () => {
  createPage.classList.remove('visible');
  dropZone.classList.remove('hidden');
  destroyCreateAudioEditor();
});

// API Key
btnSaveApiKey.addEventListener('click', () => {
  const key = createApiKey.value.trim();
  if (!key) { createKeyStatus.textContent = 'Enter a key'; createKeyStatus.style.color = '#ef4444'; return; }
  localStorage.setItem('stori_gemini_key', key);
  createKeyStatus.textContent = '✓ Saved';
  createKeyStatus.style.color = '#10b981';
  updateCreateButtons();
  updateStepStates();
});

function getCreateGeminiKey() {
  return localStorage.getItem('stori_gemini_key') || createApiKey.value.trim();
}

function updateCreateButtons() {
  const hasKey = !!getCreateGeminiKey();
  const hasAudio = !!createAudioBuffer;
  btnCreateTranscribe.disabled = !(hasKey && hasAudio);
  // Update transcribe button label based on input mode
  if (!createTranscript && btnCreateTranscribe.textContent.indexOf('✓') === -1 && btnCreateTranscribe.textContent.indexOf('Retry') === -1) {
    btnCreateTranscribe.textContent = createInputMode === 'text' ? '📝 Generate Storyboard' : '🎤 Transcribe with Gemini';
  }
  btnCreateGenerate.disabled = !createScenes || createScenes.length === 0;
  btnCreateSendEditor.disabled = !createScenes || !createScenes.some(s => s.imgDataUrl);
}

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
    createAudioName.textContent = 'Error: ' + e.message;
  }
});

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
    const arrayBuf = await file.arrayBuffer();
    createOriginalBuffer = await audioCtx.decodeAudioData(arrayBuf);
    createAudioBuffer = createOriginalBuffer;
    createAudioFile = file;

    // Store PiP video
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
    createPipName.textContent = 'Error: ' + e.message;
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
  createInputMode = mode === 'video' ? 'voice' : mode; // video mode uses voice transcription
  createModeVoice.classList.toggle('active', mode === 'voice');
  createModeVideo.classList.toggle('active', mode === 'video');
  createModeText.classList.toggle('active', mode === 'text');
  createVoiceSection.style.display = mode === 'voice' ? '' : 'none';
  createVideoSection.style.display = mode === 'video' ? '' : 'none';
  createTextSection.style.display = mode === 'text' ? '' : 'none';
  updateCreateButtons();
  updateStepStates();
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

async function generateTTSGCloud(text, voiceName, apiKey) {
  // Detect language from voice name
  const langCode = voiceName.startsWith('ta-') ? 'ta-IN' : 'en-US';
  const resp = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: langCode, name: voiceName },
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

    createTtsStatus.textContent = `Audio generated (${audioBuffer.duration.toFixed(1)}s)`;
    btnCreateGenerateTts.textContent = '🔊 Regenerate Audio';
    updateCreateButtons();
    updateStepStates();
    await showCreateAudioEditor();
  } catch (e) {
    createTtsStatus.textContent = 'Error: ' + friendlyApiError(e.message);
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

// Robust JSON parser for Gemini responses (handles markdown fences, trailing commas, extra text)
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
  }
  // Handle truncated JSON — extract all complete objects
  const objects = [];
  const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let m;
  while ((m = objRegex.exec(s)) !== null) {
    try {
      const obj = JSON.parse(m[0]);
      if (obj.startTime !== undefined || obj.prompt !== undefined) objects.push(obj);
    } catch (_) {}
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
  const hasKey = !!getCreateGeminiKey();
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
  // steps[4] = Step 5: Storyboard (visible after transcription)
  if (steps[4]) {
    steps[4].classList.toggle('step-done', hasImages);
    steps[4].classList.toggle('step-active', hasTranscript && !hasImages);
  }
  // steps[5] = Step 6: Generate Images
  const allImagesDone = hasImages && createScenes.every(s => s.status === 'done');
  if (steps[5]) {
    steps[5].classList.toggle('step-done', allImagesDone);
    steps[5].classList.toggle('step-active', hasTranscript && !allImagesDone);
  }
  // steps[6] = Step 7: Multi-Language (unlocked after Step 6 has images)
  if (steps[6]) {
    if (hasImages) {
      steps[6].style.display = '';
      renderPrimaryAudioCard();
    }
    steps[6].classList.toggle('step-active', hasImages);
  }
  // steps[7] = Step 8: Send to Editor (unlocked after Step 7 is visible)
  if (steps[7]) {
    if (hasImages) {
      steps[7].style.display = '';
    }
    steps[7].classList.toggle('step-active', hasImages);
  }
}

// Auto-save create state to localStorage (#4)
function autoSaveCreateState() {
  try {
    const state = {
      transcript: createTranscript,
      scenes: createScenes ? createScenes.map(s => ({
        prompt: s.prompt, startTime: s.startTime, endTime: s.endTime,
        duration: s.duration, text: s.text, status: s.status,
        imgDataUrl: s.imgDataUrl, refImageDataUrl: s.refImageDataUrl,
      })) : null,
      stylePrompt: createStylePrompt,
      stylePreset: createStylePreset,
      timestamp: Date.now(),
    };
    // Don't save audio buffer (too large) — just save transcript + scenes + images
    localStorage.setItem('stori_create_autosave', JSON.stringify(state));
  } catch (e) {
    // localStorage quota exceeded — silently fail (images are large)
    console.warn('Auto-save failed (storage full):', e.message);
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
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

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: 'audio/wav', data: base64Data } },
                { text: `Transcribe this audio which is ${createAudioBuffer.duration.toFixed(1)} seconds long. Break it into segments of roughly 5-15 seconds each. The segments MUST cover the ENTIRE audio from 0.0 to ${createAudioBuffer.duration.toFixed(1)} seconds with NO gaps and NO skipped portions.

STRICT RULES (MUST follow ALL):
1. NO segment may exceed 15 seconds. If a natural segment is longer, split it into sub-segments of 15 seconds or less.
2. Minimum segment length: 5 seconds. Maximum: 15 seconds. Hard limit, NO exceptions.
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
            }]
          })
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error ${resp.status}`);
      }

      createTranscribeBar.style.width = '80%';
      createTranscribeLabel.textContent = 'Processing response...';

      const data = await resp.json();
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
        if (totalDur - last.endTime <= 15) {
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

    // ── Common: build scenes from segments ──
    createTranscript = segments;
    createScenes = segments.map(s => ({
      prompt: s.sceneDescription,
      startTime: s.startTime,
      endTime: s.endTime,
      duration: (s.endTime - s.startTime),
      text: s.text,
      imgDataUrl: null,
      status: 'pending',
    }));

    createTranscriptOutput.textContent = segments.map(s =>
      `[${fmt(s.startTime)} – ${fmt(s.endTime)}] ${s.text}`
    ).join('\n\n');
    createTranscriptOutput.classList.add('visible');

    renderStoryboard();
    createStoryboardStep.style.display = 'block';
    createGenerateStep.style.display = 'block';
    // Step 7 (language) and Step 8 (send) stay hidden until images are generated
    createLanguageStep.style.display = 'none';
    createSendStep.style.display = 'none';
    btnCreateSaveEarly.style.display = '';

    createTranscribeBar.style.width = '100%';
    const actionLabel = createInputMode === 'text' ? 'Generated' : 'Transcribed';
    createTranscribeLabel.textContent = `${actionLabel} ${segments.length} segments. Review prompts in Step 5.`;
    btnCreateTranscribe.textContent = `✓ ${actionLabel}`;
    setTimeout(() => createTranscribeProgress.classList.remove('visible'), 3000);
    updateCreateButtons();
    updateStepStates();
    autoSaveCreateState();

  } catch (e) {
    createTranscribeLabel.textContent = 'Error: ' + friendlyApiError(e.message);
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
function renderStoryboard() {
  createStoryboardGrid.innerHTML = '';
  if (!createScenes) return;

  createScenes.forEach((scene, idx) => {
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
    createStoryboardGrid.appendChild(card);

    // Sync edits to createScenes
    const textarea = card.querySelector(`#create-storyboard-prompt-${idx}`);
    textarea.addEventListener('input', () => {
      createScenes[idx].prompt = textarea.value;
      // Also sync to scene card prompt if it exists
      const scenePrompt = $(`create-scene-prompt-${idx}`);
      if (scenePrompt) scenePrompt.value = textarea.value;
    });
  });
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
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

function renderCreateSceneCards() {
  createSceneGrid.innerHTML = '';
  if (!createScenes) return;
  const { ratio } = getSelectedImageSize();

  createScenes.forEach((scene, idx) => {
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
    createSceneGrid.appendChild(card);

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
  });
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

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: `Analyze this reference image and incorporate its visual style into the following image generation prompt. Keep the original scene content but adopt the reference image's style, color palette, mood, composition technique, and artistic approach.\n\nOriginal prompt: "${scene.prompt}"\n\nReturn ONLY the updated prompt text, nothing else. The prompt should describe what to generate, incorporating the visual style from the reference image.` }
          ]
        }]
      })
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${resp.status}`);
  }

  const data = await resp.json();
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
  'gemini-2.0-flash-exp-image-generation',
  'gemini-2.5-flash-preview-image-generation',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.5-flash-image',
];
let geminiImageModel = null; // cached after first success

async function generateImageGeminiFlash(prompt, key, { width, height, refImageDataUrl } = {}) {
  const sizeHint = width && height ? ` The image should be ${width}x${height} pixels, ${width > height ? 'landscape' : width < height ? 'portrait' : 'square'} orientation.` : '';
  const cleanPrompt = prompt.trim().slice(0, 800);

  // Build content parts
  const parts = [];
  if (refImageDataUrl) {
    const match = refImageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) {
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      parts.push({ text: `Generate a new image inspired by the style, color palette, and mood of the reference image above. Scene description: ${cleanPrompt}${sizeHint}` });
    } else {
      parts.push({ text: `Generate an image: ${cleanPrompt}${sizeHint}` });
    }
  } else {
    parts.push({ text: `Generate an image: ${cleanPrompt}${sizeHint}` });
  }

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000));

    const modelsToTry = geminiImageModel ? [geminiImageModel] : GEMINI_IMAGE_MODELS;

    for (const model of modelsToTry) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
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
  throw new Error('Failed — use the regenerate button to try again.');
}

// Gemini Imagen — dedicated image model
async function generateImageImagen(prompt, key, { width, height } = {}) {
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

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  const provider = createImageProvider.value;
  const key = getCreateGeminiKey();
  const { width, height } = getSelectedImageSize();

  // Sync prompt from storyboard or scene card (whichever was edited last)
  const storyPromptEl = $(`create-storyboard-prompt-${idx}`);
  const scenePromptEl = $(`create-scene-prompt-${idx}`);
  if (scenePromptEl) scene.prompt = scenePromptEl.value;
  else if (storyPromptEl) scene.prompt = storyPromptEl.value;

  scene.status = 'generating';
  updateSceneCardStatus(idx);

  try {
    if (!key) throw new Error('Gemini API key required');
    let imgDataUrl;
    const opts = { width, height, refImageDataUrl: scene.refImageDataUrl };
    // Prepend style prompt if set (applied at generation time, not stored in scene.prompt)
    let effectivePrompt = scene.prompt;
    if (createStylePrompt) {
      effectivePrompt = `Style: ${createStylePrompt}. Scene: ${effectivePrompt}`;
    }
    if (provider === 'gemini-flash') {
      imgDataUrl = await generateImageGeminiFlash(effectivePrompt, key, opts);
    } else {
      imgDataUrl = await generateImageImagen(effectivePrompt, key, opts);
    }
    scene.imgDataUrl = imgDataUrl;
    scene.status = 'done';
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
  updateCreateButtons();
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
    createGenerateLabel.textContent = `Generating image ${i + 1} of ${total}...`;
    await generateSceneImage(idx);
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

// ── Multi-Language Voiceover ──
const SUPPORTED_LANGUAGES = [
  { code: 'ta', name: 'Tamil', flag: '🇮🇳', geminiVoice: 'Kore' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳', geminiVoice: 'Kore' },
  { code: 'te', name: 'Telugu', flag: '🇮🇳', geminiVoice: 'Kore' },
  { code: 'ml', name: 'Malayalam', flag: '🇮🇳', geminiVoice: 'Kore' },
  { code: 'en', name: 'English', flag: '🇺🇸', geminiVoice: 'Kore' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', geminiVoice: 'Kore' },
  { code: 'fr', name: 'French', flag: '🇫🇷', geminiVoice: 'Kore' },
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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

function renderPrimaryAudioCard() {
  const container = $('language-primary');
  if (!container || !createAudioBuffer) return;
  const label = createInputMode === 'text' ? 'English (Generated TTS)' : 'Original Audio';
  const flag = createInputMode === 'text' ? '🇺🇸' : '🎙️';
  container.innerHTML = `
    <div class="language-card done">
      <span class="lang-name">${flag} ${label}</span>
      <span class="lang-status">Primary · ${fmtShort(createAudioBuffer.duration)}</span>
      <button class="lang-play" id="lang-play-primary">▶ Play</button>
    </div>
  `;
  container.querySelector('#lang-play-primary').addEventListener('click', () => {
    const src = audioCtx.createBufferSource();
    src.buffer = createAudioBuffer;
    src.connect(audioCtx.destination);
    src.start();
  });
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
  const playBtn = (status === 'done' && track) ? `<button class="lang-play" data-lang="${lang.code}">▶ Play</button>` : '';
  card.innerHTML = `
    <span class="lang-name">${lang.flag} ${lang.name}</span>
    <span class="lang-status">${detail || status}</span>
    ${playBtn}
  `;
  if (status === 'done' && track) {
    card.querySelector('.lang-play').addEventListener('click', () => {
      const src = audioCtx.createBufferSource();
      src.buffer = track.audioBuffer;
      src.connect(audioCtx.destination);
      src.start();
    });
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
  const fullText = createScenes.map(s => s.text).filter(Boolean).join('\n\n');

  for (const lang of selectedLangs) {
    try {
      renderLanguageCard(lang, 'working', 'Translating...');
      const translated = await translateText(fullText, lang.name, key);

      renderLanguageCard(lang, 'working', 'Generating voice...');
      const ttsResult = await generateTTSGemini(translated, lang.geminiVoice, key);
      const { audioBuffer } = await decodeBase64Audio(ttsResult.base64, ttsResult.mimeType);

      // Remove existing track for this language if re-generating
      languageTracks = languageTracks.filter(t => t.langCode !== lang.code);
      languageTracks.push({
        lang: lang.name,
        langCode: lang.code,
        audioBuffer,
        translatedText: translated,
        status: 'done'
      });
      renderLanguageCard(lang, 'done', `Done (${fmtShort(audioBuffer.duration)})`);
    } catch(e) {
      renderLanguageCard(lang, 'error', friendlyApiError(e.message));
      console.error(`Language ${lang.name} error:`, e);
    }
  }

  btnGenerateLanguages.disabled = false;
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

  // Auto-generate subtitles from transcript (into separate subtitleItems)
  subtitleItems = [];
  nextSubtitleId = 1;
  subBlockElements.clear();
  subTimelineContainer.querySelectorAll('.sub-block').forEach(el => el.remove());
  const createAddSubtitles = $('create-add-subtitles');
  if (createAddSubtitles && createAddSubtitles.checked && createScenes) {
    const { width: subW } = getSelectedImageSize();
    const maxSubWidth = Math.round(subW * 0.85);
    for (const scene of createScenes) {
      if (!scene.text || scene.text.trim() === '' || scene.text === '[continued]') continue;
      // Split long text into sentence-sized subtitle chunks
      const sentences = scene.text.split(/(?<=[.!?।])\s+/).filter(s => s.trim().length > 0);
      if (sentences.length <= 1) {
        subtitleItems.push({
          id: nextSubtitleId++,
          text: scene.text.trim(),
          font: "'Noto Sans Tamil', sans-serif",
          fontSize: 32, color: '#ffffff',
          strokeColor: '#000000', strokeWidth: 2,
          bgColor: '#000000', bgAlpha: 0.5, bold: true,
          position: 'bot-center',
          startTime: scene.startTime, duration: scene.duration,
          animation: 'fade', animDur: 0.3,
          _maxWidth: maxSubWidth,
        });
      } else {
        const chunks = [];
        for (let i = 0; i < sentences.length; i += 2) {
          chunks.push(sentences.slice(i, i + 2).join(' '));
        }
        const chunkDur = scene.duration / chunks.length;
        for (let i = 0; i < chunks.length; i++) {
          subtitleItems.push({
            id: nextSubtitleId++,
            text: chunks[i].trim(),
            font: "'Noto Sans Tamil', sans-serif",
            fontSize: 32, color: '#ffffff',
            strokeColor: '#000000', strokeWidth: 2,
            bgColor: '#000000', bgAlpha: 0.5, bold: true,
            position: 'bot-center',
            startTime: scene.startTime + i * chunkDur,
            duration: chunkDur,
            animation: 'fade', animDur: 0.3,
            _maxWidth: maxSubWidth,
          });
        }
      }
    }
  }

  // Transfer PiP video to editor
  if (createPipVideoEl) {
    pipVideoEl = createPipVideoEl;
    pipVideoSrc = createPipVideoSrc;
    pipVideoDuration = createPipVideoEl.duration;
    pipEnabled = true;
    pipInPoint = 0;
    pipOutPoint = currentBuffer.duration;
    pipPosition = 'bot-right';
    pipCustomX = null; pipCustomY = null;
    const pipSec = $('pip-section');
    if (pipSec) pipSec.style.display = '';
    const pipNm = $('pip-name');
    if (pipNm) pipNm.textContent = `Speaker (${fmtShort(pipVideoDuration)})`;
  } else {
    pipEnabled = false; pipVideoEl = null;
    const pipSec = $('pip-section');
    if (pipSec) pipSec.style.display = 'none';
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

  const showMsg = (msg) => { btnCreateSaveEarly.textContent = msg; setTimeout(() => { btnCreateSaveEarly.textContent = '💾 Save Project'; }, 3000); };
  await saveProjectToFile(createAudioBuffer, showMsg);

  // Restore previous editor state if it existed
  currentBuffer = hadBuffer;
  photoItems = hadPhotos;
  textItems = hadTexts;
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
    // Step 4: Show storyboard
    $('create-storyboard-step').style.display = '';
    renderStoryboard();

    // Step 5: Show image generation
    $('create-generate-step').style.display = '';
    renderCreateSceneCards();

    // Step 6 & 7: Only show if images have been generated
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
