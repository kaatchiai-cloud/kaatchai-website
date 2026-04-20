// ══════════════════════════════════════════
//  REEL / SHORT CREATOR
// ══════════════════════════════════════════
const reelPage = $('reel-page');
const btnCreateReel = $('btn-create-reel');
const btnReelBack = $('btn-reel-back');
const reelStepInput = $('reel-step-input');
const reelStepPresets = $('reel-step-presets');
const reelStepEditor = $('reel-step-editor');
const reelStepActions = $('reel-step-actions');

function renumberReelSteps() {
  let num = 1;
  reelPage.querySelectorAll('.reel-step').forEach(el => {
    const numEl = el.querySelector('.step-num, .agent-step-icon');
    if (numEl) numEl.textContent = num++;
  });
}

function showReelEditorStep() {
  reelStepEditor.classList.remove('hidden');
  if (reelStepActions) reelStepActions.classList.remove('hidden');
  renumberReelSteps();
}

// Input mode
const reelModeAudio = $('reel-mode-audio');
const reelModeVideo = $('reel-mode-video');
const reelAudioSection = $('reel-audio-section');
const reelVideoSection = $('reel-video-section');
const reelAudioInput = $('reel-audio-input');
const reelAudioName = $('reel-audio-name');
const reelVideoInput = $('reel-video-input');
const reelVideoName = $('reel-video-name');
const btnReelImportAudio = $('btn-reel-import-audio');
const btnReelImportVideo = $('btn-reel-import-video');

// Video segment picker
const reelSegmentPicker = $('reel-segment-picker');
const reelPreviewVideo = $('reel-preview-video');
const reelSegmentInfo = $('reel-segment-info');
const btnReelPlaySegment = $('btn-reel-play-segment');
const btnReelUseSegment = $('btn-reel-use-segment');

// Presets
const reelPlatformEl = $('reel-platform');
const reelDurationEl = $('reel-duration');
const reelStyleEl = $('reel-style');
const reelTransitionEl = $('reel-transition');
const reelSubtitleStyleEl = $('reel-subtitle-style');
const btnReelGenerate = $('btn-reel-generate');
const reelGenerateStatus = $('reel-generate-status');
const reelProgressEl = $('reel-progress');
const reelProgressBar = $('reel-progress-bar');
const reelProgressLabel = $('reel-progress-label');

// Mini editor
const reelCanvas = $('reel-canvas');
const reelSceneList = $('reel-scene-list');
const btnReelPlay = $('btn-reel-play');
const btnReelStop = $('btn-reel-stop');
const reelScrub = $('reel-scrub');
const reelTimeEl = $('reel-time');
const btnReelExport = $('btn-reel-export');
const btnReelFullEditor = $('btn-reel-full-editor');
const reelBgmInput = $('reel-bgm-input');
const btnReelBgm = $('btn-reel-bgm');

// State
let reelAudioBuffer = null;
let reelScenes = null;
let reelInputMode = 'audio'; // audio | video
let reelVideoEl = null;
let reelVideoSrc = null;
let reelWavesurfer = null;
let reelRegion = null;
let reelPlaying = false;
let reelAnimId = null;
let reelStartTime = 0;
let reelBgmBuffer = null;
let reelFrameImgEl = null;
let reelFrameImgSrc = '';
let reelFrameImgX = 0;    // % of canvas width (0 = left edge)
let reelFrameImgY = 0;    // % of canvas height (0 = top edge)
let reelFrameImgW = 100;  // % of canvas width (100 = full width)
let reelFrameOpacity = 1.0;
let reelFrameTemplate = 'none'; // none | bottom-strip | top-bar | corner-tag | full-border | custom-png
let reelFrameText = '';
let reelFrameBgColor = '#000000';
let reelFrameTextColor = '#ffffff';
// Overlay presets timeline items
let reelOverlayItems = []; // [{id, type, startTime, duration, params}]
let nextOverlayId = 1;

const REEL_OVERLAY_PRESETS = {
  'subscribe': { label: '🔴 Subscribe', defaultDuration: 3, defaultParams: { text: 'Subscribe', color: '#ff0000', textColor: '#ffffff', font: 'Poppins' } },
  'follow':    { label: '💜 Follow',    defaultDuration: 3, defaultParams: { text: 'Follow',    color: '#a855f7', textColor: '#ffffff', font: 'Poppins' } },
  'lower-third': { label: '📛 Lower Third', defaultDuration: 4, defaultParams: { name: 'Your Name', title: 'Your Title', color: '#000000', textColor: '#ffffff', accentColor: '#a855f7', font: 'Poppins' } },
  'cta-arrow': { label: '👇 CTA Arrow', defaultDuration: 3, defaultParams: { text: 'Link in Bio', color: '#ffffff' } },
  'fade-title': { label: '✨ Title Card', defaultDuration: 3, defaultParams: { text: 'Your Title', color: '#ffffff' } },
};

let reelSegments = []; // [{start, end, thumbDataUrl}] — each becomes a separate reel
let reelOriginalAudioBuffer = null; // preserve full audio for multi-segment extraction
let reelPendingScenes = null; // scenes awaiting image generation (audio/text mode)
let reelGenImagesPaused = false;
let reelGenImagesRunning = false;

// Variation rows: each row = one reel variant (audio lang + subtitle lang)
let reelVariationRows = [{ platform: 'instagram', style: 'cinematic', transition: 'whip-pan', audio: 'original', subtitle: 'none' }];
const REEL_LANG_OPTIONS = { original: 'Same as Input', en: 'English', ta: 'Tamil', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', es: 'Spanish', fr: 'French' };
const REEL_SUBTITLE_LANG_OPTIONS = { none: 'None', ...REEL_LANG_OPTIONS };

// ── Job Queue ──
let reelJobs = [];
let nextReelJobId = 1;
let reelGenerating = false;

function createReelJob(overrides) {
  return {
    id: nextReelJobId++,
    status: 'pending',
    type: 'segment',
    parentId: null,
    audioBuffer: null,
    audioName: '',
    segStart: 0,
    segEnd: 0,
    platform: reelPlatform,
    style: reelStyleEl ? reelStyleEl.value : 'cinematic',
    transition: reelTransition,
    subtitleStyle: reelSubtitleStyle,
    subColor: reelSubColor,
    subOutline: reelSubOutline,
    subBackdrop: reelSubBackdrop,
    subSize: reelSubSize,
    subPosition: reelSubPosition,
    subFont: reelSubFont,
    subAllCaps: reelSubAllCaps,
    subAccent: reelSubAccent,
    audioLang: 'original',
    subtitleLang: 'original',
    scenes: [],
    words: [],
    error: null,
    ...overrides,
  };
}

// ── Reel API Keys (free for subtitles, paid for image gen) ──
const reelApiKeyFreeEl = $('reel-api-key-free');
const reelApiKeyPaidEl = $('reel-api-key-paid');
const btnReelSaveKeyFree = $('btn-reel-save-key-free');
const btnReelSaveKeyPaid = $('btn-reel-save-key-paid');
const reelKeyStatusFree = $('reel-key-status-free');
const reelKeyStatusPaid = $('reel-key-status-paid');

function getReelFreeKey() {
  return localStorage.getItem('stori_key_free') || (reelApiKeyFreeEl ? reelApiKeyFreeEl.value.trim() : '');
}
function getReelPaidKey() {
  return localStorage.getItem('stori_key_paid') || (reelApiKeyPaidEl ? reelApiKeyPaidEl.value.trim() : '');
}
function getReelApiKey() { return getReelPaidKey() || getReelFreeKey(); }
function getReelImageKey() { return getReelPaidKey() || getReelFreeKey(); }

if (btnReelSaveKeyFree) btnReelSaveKeyFree.addEventListener('click', () => {
  const key = reelApiKeyFreeEl.value.trim();
  if (!key) { reelKeyStatusFree.textContent = 'Enter a key'; reelKeyStatusFree.style.color = '#ef4444'; return; }
  localStorage.setItem('stori_key_free', key);
  reelKeyStatusFree.textContent = '✓ Saved';
  reelKeyStatusFree.style.color = '#10b981';
});
if (btnReelSaveKeyPaid) btnReelSaveKeyPaid.addEventListener('click', () => {
  const key = reelApiKeyPaidEl.value.trim();
  if (!key) { reelKeyStatusPaid.textContent = 'Enter a key'; reelKeyStatusPaid.style.color = '#ef4444'; return; }
  localStorage.setItem('stori_key_paid', key);
  reelKeyStatusPaid.textContent = '✓ Saved';
  reelKeyStatusPaid.style.color = '#10b981';
  updateReelKeyInline();
});

// Reel API key bar toggle + inline status
function updateReelKeyInline() {
  const el = $('reel-key-status-inline');
  if (!el) return;
  const key = getReelApiKey();
  el.textContent = key ? '🔑 Key saved' : '🔑 No key';
  el.style.color = key ? '#10b981' : '';
}
const btnReelToggleKey = $('btn-reel-toggle-key');
if (btnReelToggleKey) btnReelToggleKey.addEventListener('click', () => {
  const expand = $('reel-key-expand');
  if (expand) expand.style.display = expand.style.display === 'none' ? 'flex' : 'none';
});

let reelEditMode = 'subtitles'; // subtitles | auto-cut

// ── Navigation ──
if (btnCreateReel) btnCreateReel.addEventListener('click', () => {
  navigateTo('reel');
  reelMode = true;
  if (typeof inferReelAgentStates === 'function') inferReelAgentStates();
  // Load saved keys
  const savedFree = localStorage.getItem('stori_key_free');
  const savedPaid = localStorage.getItem('stori_key_paid');
  if (savedFree && reelApiKeyFreeEl) { reelApiKeyFreeEl.value = savedFree; reelKeyStatusFree.textContent = '✓ Saved'; reelKeyStatusFree.style.color = '#10b981'; }
  const savedKey = savedPaid || savedFree;
  if (savedKey && reelApiKeyPaidEl) { reelApiKeyPaidEl.value = savedKey; }
  updateReelKeyInline();
  // Populate style dropdown from STYLE_PRESETS
  if (reelStyleEl && reelStyleEl.options.length <= 1) {
    reelStyleEl.innerHTML = Object.entries(STYLE_PRESETS).map(([key, val]) =>
      `<option value="${key}">${key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>`
    ).join('');
    reelStyleEl.value = 'cinematic';
  }
  // Copy to edit dropdowns
  const editStyle = $('reel-edit-style');
  const editTrans = $('reel-edit-transition');
  const editSub = $('reel-edit-subtitle');
  if (editStyle) editStyle.innerHTML = reelStyleEl.innerHTML;
  if (editTrans) editTrans.innerHTML = reelTransitionEl.innerHTML;
  if (editSub) editSub.innerHTML = reelSubtitleStyleEl.innerHTML;
});

if (btnReelBack) btnReelBack.addEventListener('click', () => {
  navigateTo('home');
  reelMode = false;
  reelFrameImgEl = null; reelFrameImgSrc = ''; reelFrameOpacity = 1.0;
  reelFrameImgX = 0; reelFrameImgY = 0; reelFrameImgW = 100;
  reelFrameTemplate = 'none'; reelFrameText = ''; reelFrameBgColor = '#000000'; reelFrameTextColor = '#ffffff';
  if (reelFrameTemplateEl) reelFrameTemplateEl.value = 'none';
  updateReelFrameControls();
  reelOverlayItems = []; nextOverlayId = 1;
  renderOverlayChips();
  stopReelPreview();
});

// ── Input Mode Toggle ──
function setReelInputMode(mode) {
  reelInputMode = mode;
  reelModeAudio.classList.toggle('active', mode === 'audio');
  reelModeVideo.classList.toggle('active', mode === 'video');
  reelAudioSection.classList.toggle('hidden', mode !== 'audio');
  reelVideoSection.classList.toggle('hidden', mode !== 'video');
  const editModeRow = $('reel-edit-mode-row');
  if (editModeRow) editModeRow.classList.toggle('hidden', mode !== 'video');
  if (reelStyleEl) reelStyleEl.closest('label').style.display = mode === 'video' ? 'none' : '';
  if (reelTransitionEl) reelTransitionEl.closest('label').style.display = (mode === 'video' && reelEditMode === 'subtitles') ? 'none' : '';
  updateReelCostEstimate();
}
// Edit mode radio
document.querySelectorAll('input[name="reel-edit-mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    reelEditMode = radio.value;
    // Show/hide transition for auto-cut mode
    if (reelTransitionEl) reelTransitionEl.closest('label').style.display = (reelInputMode === 'video' && reelEditMode === 'subtitles') ? 'none' : '';
  });
});

if (reelModeAudio) reelModeAudio.addEventListener('click', () => setReelInputMode('audio'));
// Apply initial mode visibility
setReelInputMode(reelInputMode);

function showReelPresets() {
  if (reelStepPresets) reelStepPresets.classList.remove('hidden');
  initReelTemplateUI();
  renumberReelSteps();
  updateReelCostEstimate();
}

let _reelTemplateUIInit = false;
let _reelTemplateCat = 'all';
let _reelSelectedTemplate = '';

function initReelTemplateUI() {
  if (_reelTemplateUIInit) return;
  _reelTemplateUIInit = true;
  const catEl = $('reel-template-categories');
  const gridEl = $('reel-template-grid');
  if (!catEl || !gridEl || typeof TEMPLATE_CATEGORIES === 'undefined') return;

  // Category buttons
  catEl.innerHTML = Object.entries(TEMPLATE_CATEGORIES).map(([k, v]) =>
    `<button class="tpl-cat-btn${k === 'all' ? ' active' : ''}" data-cat="${k}">${v}</button>`
  ).join('');
  catEl.querySelectorAll('.tpl-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _reelTemplateCat = btn.dataset.cat;
      catEl.querySelectorAll('.tpl-cat-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderReelTemplateGrid();
    });
  });

  renderReelTemplateGrid();
}

function renderReelTemplateGrid() {
  const gridEl = $('reel-template-grid');
  if (!gridEl || typeof TEMPLATES === 'undefined') return;
  const filtered = _reelTemplateCat === 'all' ? TEMPLATES : TEMPLATES.filter(t => t.category === _reelTemplateCat || t.category === 'all');
  gridEl.innerHTML = filtered.map(t => {
    const selected = _reelSelectedTemplate === t.id;
    return `<div class="template-card${selected ? ' selected' : ''}" data-tpl="${t.id}" style="background:${t.gradient}; position:relative;">
      <div class="template-card-name">${t.name}</div>
      <div class="template-card-desc">${t.description}</div>
    </div>`;
  }).join('');
  gridEl.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      _reelSelectedTemplate = card.dataset.tpl;
      const tpl = TEMPLATES.find(t => t.id === _reelSelectedTemplate);
      if (tpl && tpl.style && reelStyleEl) {
        reelStyleEl.value = tpl.style;
        reelStyleEl.dispatchEvent(new Event('change'));
      }
      renderReelTemplateGrid();
    });
  });
}

if (reelModeVideo) reelModeVideo.addEventListener('click', () => setReelInputMode('video'));

// ── Audio Import + Editor ──
const reelAudioEditor = $('reel-audio-editor');
const reelAudioWaveformEl = $('reel-audio-waveform');
let reelAudioWavesurfer = null;
let reelAudioRegion = null;
function initReelAudioWaveform() {
  if (reelAudioWavesurfer) reelAudioWavesurfer.destroy();
  reelAudioWavesurfer = WaveSurfer.create({
    container: '#reel-audio-waveform',
    waveColor: 'rgba(160,120,255,0.4)',
    progressColor: 'rgba(160,120,255,0.7)',
    height: 60,
    barWidth: 2,
    barGap: 1,
    cursorColor: '#fff',
  });
  const regionsPlugin = reelAudioWavesurfer.registerPlugin(WaveSurfer.Regions.create());
  const blob = audioBufferToWavBlob(reelAudioBuffer);
  const url = URL.createObjectURL(blob);
  reelAudioWavesurfer.load(url);
  reelAudioWavesurfer.on('ready', () => {
    URL.revokeObjectURL(url);
    const dur = reelAudioBuffer.duration;
    const regionDur = Math.min(reelDuration, dur);
    reelAudioRegion = regionsPlugin.addRegion({
      start: 0, end: regionDur,
      color: 'rgba(160,120,255,0.2)',
      drag: true, resize: true,
    });
    updateReelAudioInfo();
    regionsPlugin.on('region-updated', updateReelAudioInfo);
  });
  reelAudioWavesurfer.on('timeupdate', (time) => {
    const el = $('reel-aud-time');
    if (el) el.textContent = fmtShort(time);
  });
}

function updateReelAudioInfo() {
  if (!reelAudioRegion) return;
  const dur = (reelAudioRegion.end - reelAudioRegion.start).toFixed(1);
  const infoEl = $('reel-audio-info');
  if (infoEl) infoEl.textContent = `Duration: ${dur}s`;
  const startEl = $('reel-aud-start');
  const endEl = $('reel-aud-end');
  if (startEl) startEl.value = reelAudioRegion.start.toFixed(1);
  if (endEl) endEl.value = reelAudioRegion.end.toFixed(1);
}

// Audio editor playback controls
const btnAudPlay = $('btn-reel-aud-play');
const btnAudPause = $('btn-reel-aud-pause');
const btnAudStop = $('btn-reel-aud-stop');
const btnAudPlaySeg = $('btn-reel-aud-play-segment');

if (btnAudPlay) btnAudPlay.addEventListener('click', () => { if (reelAudioWavesurfer) reelAudioWavesurfer.play(); });
if (btnAudPause) btnAudPause.addEventListener('click', () => { if (reelAudioWavesurfer) reelAudioWavesurfer.pause(); });
if (btnAudStop) btnAudStop.addEventListener('click', () => { if (reelAudioWavesurfer) { reelAudioWavesurfer.pause(); reelAudioWavesurfer.seekTo(0); } });
if (btnAudPlaySeg) btnAudPlaySeg.addEventListener('click', () => {
  if (reelAudioWavesurfer && reelAudioRegion) {
    reelAudioWavesurfer.pause();
    reelAudioWavesurfer.seekTo(reelAudioRegion.start / reelAudioBuffer.duration);
    reelAudioWavesurfer.play();
  }
});

// Audio start/end inputs update region
const reelAudStart = $('reel-aud-start');
const reelAudEnd = $('reel-aud-end');
if (reelAudStart) reelAudStart.addEventListener('change', () => {
  if (!reelAudioRegion) return;
  const start = Math.max(0, parseFloat(reelAudStart.value) || 0);
  if (start < reelAudioRegion.end) {
    reelAudioRegion.setOptions({ start });
    updateReelAudioInfo();
  }
});
if (reelAudEnd) reelAudEnd.addEventListener('change', () => {
  if (!reelAudioRegion) return;
  const end = Math.min(reelAudioBuffer.duration, parseFloat(reelAudEnd.value) || 60);
  if (end > reelAudioRegion.start) {
    reelAudioRegion.setOptions({ end });
    updateReelAudioInfo();
  }
});

// Add Audio Segment
const btnAddAudioSeg = $('btn-reel-add-audio-segment');
if (btnAddAudioSeg) btnAddAudioSeg.addEventListener('click', () => {
  if (!reelAudioRegion || !reelAudioBuffer) return;
  const start = reelAudioRegion.start;
  const end = reelAudioRegion.end;
  if (end - start < 1) return;
  if (reelAudioWavesurfer) reelAudioWavesurfer.pause();
  reelOriginalAudioBuffer = reelAudioBuffer;
  const segAudio = extractRegion(reelOriginalAudioBuffer, start, end);
  reelJobs.push(createReelJob({ audioBuffer: segAudio, audioName: reelAudioName ? reelAudioName.textContent : '', segStart: start, segEnd: end }));
  renderReelJobCards();
  showReelPresets();
});

if (btnReelImportAudio) btnReelImportAudio.addEventListener('click', () => reelAudioInput.click());
if (reelAudioInput) reelAudioInput.addEventListener('change', async () => {
  const file = reelAudioInput.files[0];
  if (!file) return;
  reelAudioInput.value = '';
  if (reelGenerateStatus) reelGenerateStatus.textContent = '';
  try {
    showPageLoader('Decoding audio...');
    const arrayBuf = await file.arrayBuffer();
    reelAudioBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf);
    reelOriginalAudioBuffer = reelAudioBuffer;
    reelAudioName.textContent = `${file.name} (${fmtShort(reelAudioBuffer.duration)})`;
    reelSegments = [];
    reelJobs = [];
    syncAddSegmentButtons();
    if (reelAudioEditor) reelAudioEditor.classList.remove('hidden');
    initReelAudioWaveform();
    hidePageLoader();
  } catch(e) {
    hidePageLoader();
    reelAudioName.textContent = 'Could not load audio file.';
  }
});

// ── Video Import + Segment Picker ──
if (btnReelImportVideo) btnReelImportVideo.addEventListener('click', () => reelVideoInput.click());
if (reelVideoInput) reelVideoInput.addEventListener('change', async () => {
  const file = reelVideoInput.files[0];
  if (!file) return;
  reelVideoInput.value = '';
  if (reelGenerateStatus) reelGenerateStatus.textContent = '';
  showPageLoader('Loading video...');
  try {
    const blobUrl = URL.createObjectURL(file);
    reelPreviewVideo.src = blobUrl;
    reelVideoSrc = blobUrl;
    await new Promise((resolve, reject) => {
      reelPreviewVideo.onloadeddata = resolve;
      reelPreviewVideo.onerror = reject;
    });
    reelVideoName.textContent = `${file.name} (${fmtShort(reelPreviewVideo.duration)})`;
    reelVideoEl = reelPreviewVideo;
    // Extract audio for waveform
    const arrayBuf = await file.arrayBuffer();
    reelAudioBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf);
    reelOriginalAudioBuffer = reelAudioBuffer;
    reelSegments = [];
    reelJobs = [];
    syncAddSegmentButtons();
    // Init waveform
    initReelWaveform();
    reelSegmentPicker.classList.remove('hidden');
    hidePageLoader();
  } catch(e) {
    hidePageLoader();
    reelVideoName.textContent = 'Could not load video.';
  }
});

function initReelWaveform() {
  if (reelWavesurfer) reelWavesurfer.destroy();
  reelWavesurfer = WaveSurfer.create({
    container: '#reel-waveform',
    waveColor: 'rgba(160,120,255,0.4)',
    progressColor: 'rgba(160,120,255,0.7)',
    height: 60,
    barWidth: 2,
    barGap: 1,
    cursorColor: '#fff',
  });
  const regionsPlugin = reelWavesurfer.registerPlugin(WaveSurfer.Regions.create());
  const blob = audioBufferToWavBlob(reelAudioBuffer);
  const url = URL.createObjectURL(blob);
  reelWavesurfer.load(url);
  reelWavesurfer.on('ready', () => {
    URL.revokeObjectURL(url);
    const dur = reelAudioBuffer.duration;
    const regionDur = Math.min(reelDuration, dur);
    reelRegion = regionsPlugin.addRegion({
      start: 0, end: regionDur,
      color: 'rgba(160,120,255,0.2)',
      drag: true, resize: true,
    });
    updateReelSegmentInfo();
    regionsPlugin.on('region-updated', updateReelSegmentInfo);
  });
  // Sync video with waveform cursor
  reelWavesurfer.on('timeupdate', (time) => {
    if (reelPreviewVideo) reelPreviewVideo.currentTime = time;
  });
}

const reelSegStart = $('reel-seg-start');
const reelSegEnd = $('reel-seg-end');

function updateReelSegmentInfo() {
  if (!reelRegion) return;
  const dur = (reelRegion.end - reelRegion.start).toFixed(1);
  reelSegmentInfo.textContent = `Duration: ${dur}s`;
  // Sync inputs with region
  if (reelSegStart) reelSegStart.value = reelRegion.start.toFixed(1);
  if (reelSegEnd) reelSegEnd.value = reelRegion.end.toFixed(1);
}

// Inputs update region
if (reelSegStart) reelSegStart.addEventListener('change', () => {
  if (!reelRegion) return;
  const start = Math.max(0, parseFloat(reelSegStart.value) || 0);
  if (start < reelRegion.end) {
    reelRegion.setOptions({ start });
    updateReelSegmentInfo();
  }
});
if (reelSegEnd) reelSegEnd.addEventListener('change', () => {
  if (!reelRegion || !reelAudioBuffer) return;
  const end = Math.min(reelAudioBuffer.duration, parseFloat(reelSegEnd.value) || 0);
  if (end > reelRegion.start) {
    reelRegion.setOptions({ end });
    updateReelSegmentInfo();
  }
});

if (btnReelPlaySegment) btnReelPlaySegment.addEventListener('click', () => {
  if (reelRegion && reelWavesurfer) reelRegion.play();
});

// Video preview playback controls
const btnReelVidPlay = $('btn-reel-vid-play');
const btnReelVidPause = $('btn-reel-vid-pause');
const btnReelVidStop = $('btn-reel-vid-stop');
const reelVidTime = $('reel-vid-time');

if (btnReelVidPlay) btnReelVidPlay.addEventListener('click', () => {
  if (reelPreviewVideo) { reelPreviewVideo.muted = false; reelPreviewVideo.play(); }
  if (reelWavesurfer) reelWavesurfer.play();
});
if (btnReelVidPause) btnReelVidPause.addEventListener('click', () => {
  if (reelPreviewVideo) reelPreviewVideo.pause();
  if (reelWavesurfer) reelWavesurfer.pause();
});
if (btnReelVidStop) btnReelVidStop.addEventListener('click', () => {
  if (reelPreviewVideo) { reelPreviewVideo.pause(); reelPreviewVideo.currentTime = 0; }
  if (reelWavesurfer) reelWavesurfer.stop();
});
// Update time display — use timeupdate event, not interval
if (reelPreviewVideo) reelPreviewVideo.addEventListener('timeupdate', () => {
  if (reelVidTime) reelVidTime.textContent = fmtShort(reelPreviewVideo.currentTime);
});

const btnReelAddSegment = $('btn-reel-add-segment');
if (btnReelAddSegment) btnReelAddSegment.addEventListener('click', () => {
  if (!reelRegion || !reelVideoEl) return;
  const start = reelRegion.start;
  const end = reelRegion.end;
  if (end - start < 1) return;

  // Stop playback
  if (reelPreviewVideo) reelPreviewVideo.pause();
  if (reelWavesurfer) reelWavesurfer.pause();

  // Generate thumbnail from segment start
  reelPreviewVideo.currentTime = start;
  setTimeout(() => {
    reelJobs.push(createReelJob({ segStart: start, segEnd: end, audioBuffer: reelAudioBuffer ? extractRegion(reelAudioBuffer, start, end) : null }));
    renderReelJobCards();
    showReelPresets();
  }, 300);
});

let segPreviewPlaying = null; // index of currently playing segment

function renderReelPresetSegments() {
  const container = $('reel-preset-segments');
  if (!container) return;
  if (reelSegments.length === 0) { container.innerHTML = ''; return; }
  const isVideo = reelInputMode === 'video' && reelVideoSrc;
  container.innerHTML = `<div class="reel-segments-list">${reelSegments.map((seg, i) => `
    <div class="reel-seg-card" data-seg="${i}">
      ${isVideo
        ? `<video class="seg-video" data-si="${i}" src="${reelVideoSrc}" playsinline muted preload="metadata" style="width:100%; display:block;"></video>`
        : `<div class="seg-audio-icon" style="width:100%; height:56px; display:flex; align-items:center; justify-content:center; background:var(--bg-secondary); border-radius:4px;">🎵</div>`
      }
      <div class="reel-seg-info">
        <span class="text-2xs">${fmtShort(seg.start)} — ${fmtShort(seg.end)} (${(seg.end - seg.start).toFixed(0)}s)</span>
      </div>
      <div class="reel-seg-controls">
        <button class="btn-xs seg-play" data-si="${i}">▶</button>
        <button class="btn-xs seg-pause hidden" data-si="${i}">⏸</button>
        <button class="btn-xs seg-stop" data-si="${i}">⏹</button>
        <span class="seg-time text-2xs text-muted" id="seg-time-${i}">0:00</span>
      </div>
      <button class="reel-seg-remove" data-seg-del="${i}">✕</button>
    </div>
  `).join('')}</div>`;

  // Seek each video to segment start for thumbnail
  container.querySelectorAll('.seg-video').forEach(vid => {
    const idx = parseInt(vid.dataset.si);
    vid.currentTime = reelSegments[idx].start;
  });

  // Play handlers
  container.querySelectorAll('.seg-play').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.si);
      const seg = reelSegments[idx];
      if (!seg) return;
      stopSegPreview();
      segPreviewPlaying = idx;
      btn.classList.add('hidden');
      container.querySelector(`.seg-pause[data-si="${idx}"]`)?.classList.remove('hidden');
      const timeEl = $(`seg-time-${idx}`);
      if (isVideo) {
        const vid = container.querySelector(`.seg-video[data-si="${idx}"]`);
        if (!vid) return;
        vid.currentTime = seg.start;
        vid.muted = false;
        vid.play();
        const interval = setInterval(() => {
          if (segPreviewPlaying !== idx) { clearInterval(interval); return; }
          const elapsed = vid.currentTime - seg.start;
          if (timeEl) timeEl.textContent = fmtShort(Math.max(0, elapsed));
          if (vid.currentTime >= seg.end || vid.paused) { stopSegPreview(); clearInterval(interval); }
        }, 100);
      } else {
        // Audio mode: play using Web Audio
        const ctx = ensureAudioCtx();
        const source = ctx.createBufferSource();
        source.buffer = reelAudioBuffer;
        source.connect(ctx.destination);
        source.start(0, seg.start, seg.end - seg.start);
        window._segAudioSource = source;
        const startedAt = ctx.currentTime;
        const interval = setInterval(() => {
          if (segPreviewPlaying !== idx) { clearInterval(interval); return; }
          const elapsed = ctx.currentTime - startedAt;
          if (timeEl) timeEl.textContent = fmtShort(Math.max(0, elapsed));
          if (elapsed >= seg.end - seg.start) { stopSegPreview(); clearInterval(interval); }
        }, 100);
        source.onended = () => { if (segPreviewPlaying === idx) stopSegPreview(); };
      }
    });
  });
  container.querySelectorAll('.seg-pause').forEach(btn => {
    btn.addEventListener('click', () => stopSegPreview());
  });
  container.querySelectorAll('.seg-stop').forEach(btn => {
    btn.addEventListener('click', () => {
      stopSegPreview();
      if (isVideo) {
        const idx = parseInt(btn.dataset.si);
        const vid = container.querySelector(`.seg-video[data-si="${idx}"]`);
        if (vid) { vid.currentTime = reelSegments[idx].start; vid.muted = true; }
      }
      const timeEl = $(`seg-time-${parseInt(btn.dataset.si)}`);
      if (timeEl) timeEl.textContent = '0:00';
    });
  });
  // Remove handlers
  container.querySelectorAll('.reel-seg-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      stopSegPreview();
      reelSegments.splice(parseInt(btn.dataset.segDel), 1);
      renderReelPresetSegments();
    });
  });
  updateReelCostEstimate();
}

function stopSegPreview() {
  // Pause all segment videos
  document.querySelectorAll('.seg-video').forEach(v => { v.pause(); v.muted = true; });
  // Stop audio source if playing
  if (window._segAudioSource) { try { window._segAudioSource.stop(); } catch(e) {} window._segAudioSource = null; }
  segPreviewPlaying = null;
  document.querySelectorAll('.seg-play').forEach(b => b.classList.remove('hidden'));
  document.querySelectorAll('.seg-pause').forEach(b => b.classList.add('hidden'));
}

// ── Job Cards UI ──
function renderReelJobCards() {
  const container = $('reel-preset-segments');
  if (!container) return;
  const segmentJobs = reelJobs.filter(j => j.type === 'segment');
  syncAddSegmentButtons();
  if (segmentJobs.length === 0) { container.innerHTML = ''; return; }
  updateReelCostEstimate();
  const langHtml = Object.entries(REEL_LANG_OPTIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  container.innerHTML = `<div class="reel-segments-list">${segmentJobs.map((job, si) => {
    const varJobs = reelJobs.filter(j => j.type === 'variation' && j.parentId === job.id);
    const statusBadge = job.status === 'done' ? '<span style="color:#10b981;">✓ Done</span>'
      : job.status === 'transcribing' ? '<span style="color:#f59e0b;">⏳ Transcribing</span>'
      : job.status === 'generating-images' ? '<span style="color:#f59e0b;">⏳ Generating images</span>'
      : job.status === 'error' ? `<span style="color:#ef4444;">✗ ${job.error || 'Error'}</span>`
      : '<span style="color:var(--text-muted);">○ Pending</span>';
    const varHtml = varJobs.map(vj => `
      <div class="reel-var-card" style="display:flex;align-items:center;gap:6px;margin-top:4px;padding:4px 8px;background:var(--bg-input);border-radius:4px;font-size:0.72rem;" data-vid="${vj.id}">
        <span style="color:var(--text-muted);">↳ Variation ${vj.id}</span>
        <label class="form-label" style="font-size:0.72rem;">Audio: <select class="var-job-audio" data-vid="${vj.id}" style="font-size:0.72rem;">${langHtml}</select></label>
        <label class="form-label" style="font-size:0.72rem;">Sub: <select class="var-job-sub" data-vid="${vj.id}" style="font-size:0.72rem;">${langHtml}</select></label>
        ${vj.status === 'done' ? '<span style="color:#10b981;font-size:0.7rem;">✓</span>' : vj.status === 'error' ? `<span style="color:#ef4444;font-size:0.7rem;">✗</span>` : ''}
        <button class="btn-xs var-job-remove" data-vid="${vj.id}" style="margin-left:auto;">✕</button>
      </div>`).join('');
    return `<div class="reel-seg-card" data-jid="${job.id}" style="padding:8px 28px 8px 12px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;position:relative;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:0.8rem;font-weight:600;flex:1;">Segment ${si + 1}: ${fmtShort(job.segStart)} – ${fmtShort(job.segEnd)} (${(job.segEnd - job.segStart).toFixed(0)}s)</span>
        <span style="font-size:0.7rem;">${statusBadge}</span>
      </div>
      <button class="btn-xs reel-seg-remove" data-jid="${job.id}" style="position:absolute;top:8px;right:6px;padding:2px 5px;font-size:0.65rem;"${reelGenerating ? ' disabled' : ''}>✕</button>
    </div>`;
  }).join('')}</div>`;

  // Wire variation language selectors
  container.querySelectorAll('.var-job-audio').forEach(sel => {
    const vid = parseInt(sel.dataset.vid);
    const vj = reelJobs.find(j => j.id === vid);
    if (vj) { sel.value = vj.audioLang; sel.addEventListener('change', () => { vj.audioLang = sel.value; }); }
  });
  container.querySelectorAll('.var-job-sub').forEach(sel => {
    const vid = parseInt(sel.dataset.vid);
    const vj = reelJobs.find(j => j.id === vid);
    if (vj) { sel.value = vj.subtitleLang; sel.addEventListener('change', () => { vj.subtitleLang = sel.value; }); }
  });
  // Add variation button
  container.querySelectorAll('.job-add-var').forEach(btn => {
    btn.addEventListener('click', () => {
      const jid = parseInt(btn.dataset.jid);
      const segJob = reelJobs.find(j => j.id === jid);
      if (!segJob) return;
      reelJobs.push(createReelJob({ type: 'variation', parentId: jid, audioBuffer: segJob.audioBuffer, audioLang: 'original', subtitleLang: 'original' }));
      renderReelJobCards();
    });
  });
  // Remove segment job (and its variations)
  container.querySelectorAll('.reel-seg-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const jid = parseInt(btn.dataset.jid);
      reelJobs = reelJobs.filter(j => j.id !== jid && j.parentId !== jid);
      renderReelJobCards();
      syncAddSegmentButtons();
    });
  });
  // Remove variation job
  container.querySelectorAll('.var-job-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const vid = parseInt(btn.dataset.vid);
      reelJobs = reelJobs.filter(j => j.id !== vid);
      renderReelJobCards();
    });
  });
}

function syncAddSegmentButtons() {
  const hasSegment = reelJobs.some(j => j.type === 'segment');
  if (btnAddAudioSeg) btnAddAudioSeg.disabled = hasSegment;
  if (btnReelAddSegment) btnReelAddSegment.disabled = hasSegment;
}

// ── Preset handlers ──
function updateReelAspectRatio() {
  const p = REEL_PLATFORMS[reelPlatform];
  if (p) document.documentElement.style.setProperty('--reel-aspect', `${p.width}/${p.height}`);
}
function syncVariationPlatformStyle() {
  const extra = $('reel-variation-extra');
  if (!extra) return;
  extra.querySelectorAll('.var-platform').forEach(sel => { sel.value = reelPlatform; });
  extra.querySelectorAll('.var-style').forEach(sel => { sel.value = reelStyleEl ? reelStyleEl.value : 'cinematic'; });
}
if (reelPlatformEl) reelPlatformEl.addEventListener('change', () => { reelPlatform = reelPlatformEl.value; updateReelAspectRatio(); syncVariationPlatformStyle(); });
if (reelStyleEl) reelStyleEl.addEventListener('change', syncVariationPlatformStyle);
updateReelAspectRatio();
if (reelDurationEl) reelDurationEl.addEventListener('change', () => { reelDuration = parseInt(reelDurationEl.value); });
if (reelTransitionEl) reelTransitionEl.addEventListener('change', () => { reelTransition = reelTransitionEl.value; });
if (reelSubtitleStyleEl) reelSubtitleStyleEl.addEventListener('change', () => { reelSubtitleStyle = reelSubtitleStyleEl.value; saveActiveReelSettings(); });

// Clamp transcribed segments to [minN, maxN] by merging (too many) or splitting (too few)
function clampSegments(segs, minN, maxN) {
  // Merge: if too many, merge shortest adjacent pairs until within maxN
  while (segs.length > maxN) {
    let minDur = Infinity, minIdx = 0;
    for (let i = 0; i < segs.length - 1; i++) {
      const dur = (segs[i].endTime - segs[i].startTime) + (segs[i+1].endTime - segs[i+1].startTime);
      if (dur < minDur) { minDur = dur; minIdx = i; }
    }
    const a = segs[minIdx], b = segs[minIdx + 1];
    segs.splice(minIdx, 2, {
      startTime: a.startTime, endTime: b.endTime,
      text: (a.text + ' ' + b.text).trim(),
      sceneDescription: a.sceneDescription || a.text,
      words: [...(a.words || []), ...(b.words || [])],
    });
  }
  // Split: if too few, split the longest segment at its midpoint
  while (segs.length < minN) {
    let maxDur = 0, maxIdx = 0;
    for (let i = 0; i < segs.length; i++) {
      const dur = segs[i].endTime - segs[i].startTime;
      if (dur > maxDur) { maxDur = dur; maxIdx = i; }
    }
    const s = segs[maxIdx];
    const mid = (s.startTime + s.endTime) / 2;
    const wordsA = (s.words || []).filter(w => w.start < mid);
    const wordsB = (s.words || []).filter(w => w.start >= mid);
    const textA = wordsA.length ? wordsA.map(w => w.word).join(' ') : s.text.slice(0, Math.floor(s.text.length / 2));
    const textB = wordsB.length ? wordsB.map(w => w.word).join(' ') : s.text.slice(Math.floor(s.text.length / 2));
    segs.splice(maxIdx, 1,
      { startTime: s.startTime, endTime: mid, text: textA, sceneDescription: s.sceneDescription || textA, words: wordsA },
      { startTime: mid, endTime: s.endTime, text: textB, sceneDescription: textB, words: wordsB }
    );
  }
  return segs;
}

// ── Generate Reel ──
if (btnReelGenerate) btnReelGenerate.addEventListener('click', async () => {
  resetSessionCost();
  console.log('[ReelGen] Generate clicked, inputMode:', reelInputMode);
  const key = getReelApiKey();
  console.log('[ReelGen] API key:', key ? 'present' : 'MISSING');
  if (!key) { reelGenerateStatus.textContent = 'Enter your API key in Step 1 first.'; return; }
  setReelExportEnabled(false);

  // ── Job queue mode: reelJobs has segment jobs (skip in text mode — text mode is always single-reel) ──
  if (reelInputMode !== 'text' && reelJobs.filter(j => j.type === 'segment').length > 0) {
    btnReelGenerate.disabled = true;
    reelGenerating = true; renderReelJobCards(); refreshReelAgentPanel(); initAllReelAgentTasks();
    try {
    const segmentJobs = reelJobs.filter(j => j.type === 'segment' && j.status === 'pending');

    // Phase 1: Transcribe all segment jobs
    resetReelAgentTasks('script');
    updateReelAgentTask('script', 'transcribe', 'waiting', 'Transcribing audio…');
    updateReelAgentTask('script', 'scenes', 'waiting', 'Creating scenes…');
    updateReelAgentTask('script', 'subtitles', 'waiting', 'Timing subtitles…');
    updateReelAgentTask('script', 'transcribe', 'running', 'Transcribing…');
    updateReelAgent('scene', 'running', 'Analyzing audio & writing scenes…');
    const job = segmentJobs[0];
    if (job) {
      job.status = 'transcribing';
      renderReelJobCards();
      try {
      const segAudio = job.audioBuffer;
      const transPreset = REEL_TRANSITIONS[job.transition] || REEL_TRANSITIONS['whip-pan'];

      // Transcribe segment
      const wavBlob = audioBufferToWavBlob(segAudio);
      const b64Audio = await blobToBase64(wavBlob);
      const transcribeBody = {
        contents: [{ parts: [
          { inlineData: { mimeType: 'audio/wav', data: b64Audio.split(',')[1] } },
          { text: `Audio duration: ${segAudio.duration.toFixed(1)} seconds. Transcribe into 6-9 segments at natural sentence boundaries, each 6-10 seconds. The "text" field must be the original language transcription. The "sceneDescription" field must always be in English — ${reelVideoMode === 'animated' ? 'a description of cinematic MOTION for AI video animation: start with camera direction (pan/zoom/tracking/dolly), describe subject action (walking/flowing/emerging/transforming), include environmental motion (wind/water/clouds/light). One continuous motion, no cuts.' : 'a vivid visual description of what could be shown as an image for that segment.'} Return JSON array: [{"startTime": 0.0, "endTime": 8.0, "text": "...", "sceneDescription": "vivid English visual description", "words": [{"word": "...", "start": 0.0, "end": 0.4}]}].` }
        ]}],
        generationConfig: { response_mime_type: 'application/json' },
      };
      const transcribeData = await callGeminiAPI(getTranscriptionModels(), transcribeBody, key);
      trackCost('transcription', 1);
      let segments = parseGeminiJson(transcribeData.candidates?.[0]?.content?.parts?.[0]?.text);
      segments = clampSegments(segments, 6, 9);

      const words = [];
      // Always use segment-level timing — Gemini's per-word timestamps are unreliable.
      // Distribute each segment's words evenly across the segment's confirmed time window.
      for (const s of segments) {
        const text = s.text || '';
        const wds = text.trim().split(/\s+/).filter(w => w.length > 0);
        if (wds.length === 0) continue;
        const sStart = s.startTime || 0;
        const sEnd = s.endTime || segAudio.duration;
        const sDur = Math.max(0.1, sEnd - sStart);
        const wDur = sDur / wds.length;
        wds.forEach((w, wi) => { words.push({ word: w, start: sStart + wi * wDur, end: sStart + (wi + 1) * wDur }); });
      }
      // Final fallback: if still no words, create from all segment texts
      if (words.length === 0 && segments.length > 0) {
        const allText = segments.map(s => s.text || '').join(' ').trim().split(/\s+/);
        const totalDur = segAudio.duration;
        const wDur = totalDur / Math.max(1, allText.length);
        allText.forEach((w, i) => { words.push({ word: w, start: i * wDur, end: (i + 1) * wDur }); });
      }
      console.log(`[ReelGen] ${segments.length} segments, ${words.length} words generated`);

      const isVidInput = reelInputMode === 'video' && reelVideoEl;
      if (isVidInput && reelEditMode === 'subtitles') {
        job.scenes = [{ startTime: 0, endTime: segAudio.duration, duration: segAudio.duration, text: segments.map(s => s.text).join(' '), words, imgDataUrl: null, status: 'done', isVideo: true, transition: 'none', transDur: 0, motion: 'none', segmentIndex: job.id }];
      } else if (isVidInput) {
        job.scenes = segments.map(s => ({ startTime: s.startTime, endTime: s.endTime, duration: s.endTime - s.startTime, text: s.text, words: s.words || [], imgDataUrl: null, status: 'done', isVideo: true, transition: transPreset.transition, transDur: transPreset.transDur, motion: 'none', segmentIndex: job.id }));
      } else {
        const totalDur = segAudio.duration;
        job.scenes = segments.map((s, si2) => {
          let st = typeof s.startTime === 'number' ? s.startTime : (si2 / segments.length) * totalDur;
          let en = typeof s.endTime === 'number' ? s.endTime : ((si2 + 1) / segments.length) * totalDur;
          if (si2 === 0 && st > 0.5) st = 0;
          if (si2 === segments.length - 1 && en < totalDur - 0.5) en = totalDur;
          return { prompt: s.sceneDescription || s.text, startTime: st, endTime: en, duration: en - st, text: s.text, words: s.words || [], imgDataUrl: null, status: 'pending', transition: transPreset.transition, transDur: transPreset.transDur, motion: transPreset.motion, segmentIndex: job.id };
        });
      }
      job.words = words;
    } catch(err) {
      job.status = 'error';
      job.error = friendlyApiError(err.message);
      renderReelJobCards();
      reelProgressLabel.textContent = `Segment failed: ${job.error}`;
    }
    }

    // Phase 2: Collect all transcribed scenes, show scene grid
    const transcribedJobs = reelJobs.filter(j => j.type === 'segment' && (j.status === 'transcribing' || j.status === 'generating-images') && j.scenes.length > 0);
    const allJobScenes = [];
    for (const transcJob of transcribedJobs) { for (const s of transcJob.scenes) allJobScenes.push(s); }
    updateReelAgentTask('script', 'transcribe', 'done', 'Audio transcribed');
    updateReelAgentTask('script', 'scenes', 'done', `${allJobScenes.length} scenes created`);
    updateReelAgentTask('script', 'subtitles', 'done', 'Subtitles timed');
    resetReelAgentTasks('scene');
    updateReelAgentTask('scene', 'prompts', 'waiting', 'Writing image prompts…');
    updateReelAgentTask('scene', 'cinematography', 'waiting', 'Setting shot directions…');
    updateReelAgentTask('scene', 'prompts', 'running', 'Writing image prompts…');
    if (allJobScenes.some(s => s.status === 'pending')) {
      reelPendingScenes = allJobScenes;
      if (reelStepScenes) reelStepScenes.classList.remove('hidden');
      renderReelSceneGrid(reelPendingScenes);
      updateReelAgentTask('scene', 'prompts', 'done', `${reelPendingScenes.length} prompts ready`);
      updateReelAgentTask('scene', 'cinematography', 'done', 'Shot directions set');
      // Phase 3: Generate images per segment job
      for (let ri = 0; ri < transcribedJobs.length; ri++) {
        const imgJob = transcribedJobs[ri];
        const pendingScenes = imgJob.scenes.filter(s => s.status === 'pending');
        if (pendingScenes.length > 0) {
          imgJob.status = 'generating-images';
          renderReelJobCards();
          await reelRunImageGeneration(pendingScenes);
        }
        imgJob.status = 'done';
        renderReelJobCards();
      }
    } else {
      for (const transcJob of transcribedJobs) { transcJob.status = 'done'; }
      renderReelJobCards();
    }

    // Phase 4: Run variation jobs
    const variationJobs = reelJobs.filter(j => j.type === 'variation' && j.status === 'pending');
    for (const varJob of variationJobs) {
      const parent = reelJobs.find(j => j.id === varJob.parentId);
      if (!parent || parent.status !== 'done') { varJob.status = 'error'; varJob.error = 'Parent not ready'; renderReelJobCards(); continue; }
      varJob.status = 'transcribing';
      renderReelJobCards();
      setStatus('Processing variation...', true);
      try {
        varJob.scenes = parent.scenes.map(s => ({ ...s, segmentIndex: varJob.id }));
        varJob.words = parent.words;
        const origText = parent.words.map(w => w.word).join(' ');
        if (varJob.subtitleLang !== 'original' && origText) {
          reelProgressLabel.textContent = `Translating subtitle to ${REEL_LANG_OPTIONS[varJob.subtitleLang]}...`;
          try {
            const transBody = { contents: [{ parts: [{ text: `Translate to ${REEL_LANG_OPTIONS[varJob.subtitleLang]}. Return ONLY the translated text:\n\n${origText}` }] }] };
            const transData = await callGeminiAPI(getTranscriptionModels(), transBody, key);
            trackCost('textGeneration', 1);
            const translated = transData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (translated) {
              const tw = translated.split(/\s+/);
              const tDur = parent.words.length > 0 ? parent.words[parent.words.length - 1].end - parent.words[0].start : 0;
              const wD = tDur / Math.max(1, tw.length);
              const tSt = parent.words.length > 0 ? parent.words[0].start : 0;
              varJob.words = tw.map((w, i) => ({ word: w, start: tSt + i * wD, end: tSt + (i + 1) * wD }));
            }
          } catch(e) { reelProgressLabel.textContent = 'Subtitle translation failed'; }
        }
        if (varJob.audioLang !== 'original' && origText) {
          reelProgressLabel.textContent = `Generating ${REEL_LANG_OPTIONS[varJob.audioLang]} audio...`;
          try {
            const targetDur = parent.audioBuffer.duration;
            const ttransBody = { contents: [{ parts: [{ text: `Translate the following to ${REEL_LANG_OPTIONS[varJob.audioLang]}. The original audio is ${Math.round(targetDur)} seconds long. Keep it concise. Return ONLY the translated text:\n\n${origText}` }] }] };
            const ttransData = await callGeminiAPI(getTranscriptionModels(), ttransBody, key);
            trackCost('textGeneration', 1);
            const ttsText = ttransData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (ttsText) {
              const ttsModels = getTTSModels();
              const ttsResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ttsModels[0]}:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: ttsText }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } } }) });
              if (ttsResp.ok) {
                const ttsData = await ttsResp.json();
                const ttsPart = ttsData.candidates?.[0]?.content?.parts?.[0];
                if (ttsPart?.inlineData?.data) {
                  const decoded = await decodeBase64Audio(ttsPart.inlineData.data, ttsPart.inlineData.mimeType || 'audio/wav');
                  let ttsBuffer = decoded.audioBuffer;
                  if (Math.abs(ttsBuffer.duration - targetDur) > 0.5) {
                    const rate = ttsBuffer.duration / targetDur;
                    const offCtx = new OfflineAudioContext(ttsBuffer.numberOfChannels, Math.round(targetDur * ttsBuffer.sampleRate), ttsBuffer.sampleRate);
                    const src = offCtx.createBufferSource();
                    src.buffer = ttsBuffer; src.playbackRate.value = rate; src.connect(offCtx.destination); src.start();
                    ttsBuffer = await offCtx.startRendering();
                  }
                  varJob.audioBuffer = ttsBuffer;
                  trackCost('ttsPerLang', 1);
                }
              }
            }
          } catch(e) { reelProgressLabel.textContent = 'TTS failed'; }
        }
        varJob.status = 'done';
        renderReelJobCards();
      } catch(varErr) { varJob.status = 'error'; varJob.error = friendlyApiError(varErr.message); renderReelJobCards(); }
    }

    // Phase 5: Build _reelMultiResults from all done jobs
    const doneJobs = reelJobs.filter(j => j.status === 'done');
    if (doneJobs.length === 0) {
      updateReelAgent('preview', 'error', 'Generation failed — check API key');
      reelGenerating = false; renderReelJobCards(); btnReelGenerate.disabled = false;
      return;
    }

    // Apply base variation subtitle language to segment jobs
    const baseSubLang5 = reelVariationRows[0]?.subtitle || 'original';
    const segTransMap5 = new Map();
    if (baseSubLang5 !== 'original') {
      for (const job of doneJobs) {
        if (job.type !== 'segment') continue;
        const origText = job.words.map(w => w.word).join(' ');
        if (!origText) continue;
        try {
          reelProgressLabel.textContent = `Translating subtitle to ${REEL_LANG_OPTIONS[baseSubLang5]}...`;
          const transBody = { contents: [{ parts: [{ text: `Translate to ${REEL_LANG_OPTIONS[baseSubLang5]}. Return ONLY the translated text:\n\n${origText}` }] }] };
          const transData = await callGeminiAPI(getTranscriptionModels(), transBody, key);
          trackCost('textGeneration', 1);
          const translated = transData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (translated) {
            const tw = translated.split(/\s+/);
            const tDur = job.words.length > 0 ? job.words[job.words.length - 1].end - job.words[0].start : 0;
            const wD = tDur / Math.max(1, tw.length);
            const tSt = job.words.length > 0 ? job.words[0].start : 0;
            segTransMap5.set(job.id, tw.map((w, i) => ({ word: w, start: tSt + i * wD, end: tSt + (i + 1) * wD })));
          }
        } catch(e) { console.warn('[ReelSub] Translation failed:', e.message); }
      }
    }

    const jobSettings = { subtitleStyle: reelSubtitleStyle, transition: reelTransition, viewport: reelViewport, viewportX: reelViewportX, subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition, subFont: reelSubFont, subAllCaps: reelSubAllCaps, subAccent: reelSubAccent };
    window._reelMultiResults = doneJobs.map(job => {
      const isSegJob = job.type === 'segment';
      const effSubLang = isSegJob ? baseSubLang5 : job.subtitleLang;
      const effWords = (isSegJob && segTransMap5.get(job.id)) ? segTransMap5.get(job.id) : job.words;
      return {
        audioBuffer: job.audioBuffer,
        scenes: job.scenes,
        words: effWords,
        videoStart: job.segStart,
        videoEnd: job.segEnd,
        audioLang: job.audioLang,
        subtitleLang: effSubLang,
        audioLangLabel: REEL_LANG_OPTIONS[job.audioLang] || 'Original',
        subtitleLangLabel: REEL_LANG_OPTIONS[effSubLang] || 'Original',
        lang: effSubLang,
        langLabel: REEL_LANG_OPTIONS[effSubLang] || 'Original',
        segmentIndex: job.id,
        settings: { ...jobSettings, subtitleStyle: job.subtitleStyle, transition: job.transition, subColor: job.subColor, subOutline: job.subOutline, subBackdrop: job.subBackdrop, subSize: job.subSize, subPosition: job.subPosition },
      };
    });
    activeReelPreview = 0;
    reelAudioBuffer = window._reelMultiResults[0].audioBuffer;
    reelScenes = window._reelMultiResults[0].scenes;
    reelWords = window._reelMultiResults[0].words;

    reelProgressEl.classList.add('hidden');
    showReelEditorStep();
    renderReelScenes();
    renderReelFrame(0);
    renderAllReelPreviews();
    resetReelAgentTasks('preview');
    updateReelAgent('preview', 'running');
    updateReelAgentTask('preview', 'sync', 'done', 'Audio & timing synced');
    updateReelAgentTask('preview', 'assemble', 'done', 'Reel preview ready');
    reelGenerating = false; renderReelJobCards(); btnReelGenerate.disabled = false;
    return;
    } catch(e) {
      console.error('[ReelGen] Job queue error:', e);
      reelProgressEl.classList.add('hidden');
      reelGenerateStatus.textContent = 'Error: ' + (e.message || 'Generation failed');
      setStatus('Reel generation failed');
      reelGenerating = false; renderReelJobCards(); btnReelGenerate.disabled = false;
      return;
    }
  }


  if (!reelAudioBuffer) { reelGenerateStatus.textContent = 'Import audio first.'; return; }

  // Trim audio to selected duration if longer
  const maxDur = reelDuration;
  if (reelAudioBuffer.duration > maxDur + 1) {
    reelAudioBuffer = extractRegion(reelAudioBuffer, 0, maxDur);
  }

  const platform = REEL_PLATFORMS[reelPlatform];
  const styleName = reelStyleEl ? reelStyleEl.value : 'cinematic';
  const stylePrompt = STYLE_PRESETS[styleName] || '';
  const transPreset = REEL_TRANSITIONS[reelTransition] || REEL_TRANSITIONS['whip-pan'];

  btnReelGenerate.disabled = true;
  reelGenerating = true; refreshReelAgentPanel(); initAllReelAgentTasks();

  try {
    // Step 1: Transcribe with word-level timestamps
    resetReelAgentTasks('script');
    updateReelAgentTask('script', 'transcribe', 'waiting', 'Transcribing audio…');
    updateReelAgentTask('script', 'scenes', 'waiting', 'Creating scenes…');
    updateReelAgentTask('script', 'subtitles', 'waiting', 'Timing subtitles…');
    updateReelAgentTask('script', 'transcribe', 'running', 'Transcribing…');
    updateReelAgent('scene', 'running', 'Analyzing audio & writing scenes…');

    const wavBlob = audioBufferToWavBlob(reelAudioBuffer);
    const b64Audio = await blobToBase64(wavBlob);

    const transcribeBody = {
      contents: [{ parts: [
        { inlineData: { mimeType: 'audio/wav', data: b64Audio.split(',')[1] } },
        { text: `Audio duration: ${reelAudioBuffer.duration.toFixed(1)} seconds. Transcribe into 6-9 segments at natural sentence boundaries, each 6-10 seconds. The "text" field must be the original language transcription. The "sceneDescription" field must always be in English — ${reelVideoMode === 'animated' ? 'a description of cinematic MOTION for AI video animation: start with camera direction (pan/zoom/tracking/dolly), describe subject action (walking/flowing/emerging/transforming), include environmental motion (wind/water/clouds/light). One continuous motion, no cuts.' : 'a vivid visual description of what could be shown as an image for that segment.'} Return JSON array: [{"startTime": 0.0, "endTime": 8.0, "text": "...", "sceneDescription": "vivid English visual description", "words": [{"word": "...", "start": 0.0, "end": 0.4}]}].` }
      ]}],
      generationConfig: { response_mime_type: 'application/json' },
    };
    const transcribeData = await callGeminiAPI(getTranscriptionModels(), transcribeBody, key);
    trackCost('transcription', 1);
    const transcribeText = transcribeData.candidates?.[0]?.content?.parts?.[0]?.text;
    let segments = parseGeminiJson(transcribeText);
    segments = clampSegments(segments, 6, 9);

    // Collect all words for subtitle rendering.
    // Always use segment-level timing — Gemini's per-word timestamps are unreliable.
    // Distribute each segment's words evenly across the segment's confirmed time window.
    reelWords = [];
    for (const seg of segments) {
      const text = seg.text || '';
      const wds = text.trim().split(/\s+/).filter(w => w.length > 0);
      if (wds.length === 0) continue;
      const sStart = seg.startTime || 0;
      const sEnd = seg.endTime || reelAudioBuffer.duration;
      const sDur = Math.max(0.1, sEnd - sStart);
      const wDur = sDur / wds.length;
      wds.forEach((w, i) => {
        reelWords.push({ word: w, start: sStart + i * wDur, end: sStart + (i + 1) * wDur });
      });
    }
    // Final fallback: if still no words, create from all segment texts
    if (reelWords.length === 0 && segments.length > 0) {
      const allText = segments.map(s => s.text || '').join(' ').trim().split(/\s+/);
      const totalDur = reelAudioBuffer.duration;
      const wDur = totalDur / Math.max(1, allText.length);
      allText.forEach((w, i) => { reelWords.push({ word: w, start: i * wDur, end: (i + 1) * wDur }); });
    }
    console.log(`[ReelGen] Single: ${segments.length} segments, ${reelWords.length} words`);
    updateReelAgentTask('script', 'transcribe', 'done', 'Audio transcribed');
    updateReelAgentTask('script', 'scenes', 'done', `${segments.length} scenes created`);
    updateReelAgentTask('script', 'subtitles', 'done', 'Subtitles timed');
    resetReelAgentTasks('scene');
    updateReelAgentTask('scene', 'prompts', 'waiting', 'Writing image prompts…');
    updateReelAgentTask('scene', 'cinematography', 'waiting', 'Setting shot directions…');
    updateReelAgentTask('scene', 'prompts', 'running', 'Writing image prompts…');

    const isVideoMode = reelInputMode === 'video' && reelVideoEl;

    if (isVideoMode && reelEditMode === 'subtitles') {
      // Video + subtitles only: one scene = entire segment, no cuts
      reelScenes = [{
        startTime: 0, endTime: reelAudioBuffer.duration,
        duration: reelAudioBuffer.duration,
        text: segments.map(s => s.text).join(' '), words: reelWords,
        imgDataUrl: null, status: 'done', isVideo: true,
        transition: 'none', transDur: 0, motion: 'none',
      }];
    } else if (isVideoMode && reelEditMode === 'auto-cut') {
      // Video + auto-cut: each segment becomes a scene with transitions
      reelScenes = segments.map(s => ({
        startTime: s.startTime, endTime: s.endTime,
        duration: s.endTime - s.startTime,
        text: s.text, words: s.words || [],
        imgDataUrl: null, status: 'done', isVideo: true,
        transition: transPreset.transition,
        transDur: transPreset.transDur,
        motion: 'none',
      }));
    } else {
      // Audio/Text mode: need image generation
      const totalDur = reelAudioBuffer.duration;
      reelScenes = segments.map((s, si) => {
        const st = typeof s.startTime === 'number' ? s.startTime : (si / segments.length) * totalDur;
        const en = typeof s.endTime === 'number' ? s.endTime : ((si + 1) / segments.length) * totalDur;
        return {
          prompt: s.sceneDescription || s.text,
          startTime: st, endTime: en,
          duration: en - st,
          text: s.text, words: s.words || [],
          imgDataUrl: null, status: 'pending',
          transition: transPreset.transition,
          transDur: transPreset.transDur,
          motion: transPreset.motion,
        };
      });

      // Show scene cards and auto-generate images, then preview
      reelPendingScenes = reelScenes;
      reelProgressEl.classList.add('hidden');
      if (reelStepScenes) reelStepScenes.classList.remove('hidden');
      renderReelSceneGrid(reelPendingScenes);
      updateReelAgentTask('scene', 'prompts', 'done', `${reelPendingScenes.length} prompts ready`);
      updateReelAgentTask('scene', 'cinematography', 'done', 'Shot directions set');
      await reelRunImageGeneration(reelPendingScenes.filter(s => s.status === 'pending'));
    }

    // Generate variation rows
    const origReel = { audioBuffer: reelAudioBuffer, scenes: reelScenes, words: reelWords, videoStart: 0, videoEnd: reelAudioBuffer.duration, segmentIndex: 0, settings: { subtitleStyle: reelSubtitleStyle, transition: reelTransition, viewport: reelViewport, viewportX: reelViewportX, subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition, subFont: reelSubFont, subAllCaps: reelSubAllCaps, subAccent: reelSubAccent } };
    const singleResults = [];
    const translationCache = {};
    const ttsCache = {};
    const origText = reelWords?.map(w => w.word).join(' ') || '';
    if (reelVariationRows.length > 1) updateReelAgent('language', 'running', `0/${reelVariationRows.length} languages`);

    for (const v of reelVariationRows) {
     try {
      const isOrigAudio = v.audio === 'original';
      const isOrigSub = v.subtitle === 'original';
      const isNoSub = v.subtitle === 'none';

      // Subtitle words
      let subWords = isNoSub ? [] : origReel.words;
      if (!isOrigSub && !isNoSub && origText) {
        const cKey = `sub_${v.subtitle}`;
        if (!translationCache[cKey]) {
          reelProgressLabel.textContent = `Translating subtitle to ${REEL_LANG_OPTIONS[v.subtitle]}...`;
          setStatus(`Translating subtitle to ${REEL_LANG_OPTIONS[v.subtitle]}...`, true);
          try {
            const transBody = { contents: [{ parts: [{ text: `Translate to ${REEL_LANG_OPTIONS[v.subtitle]}. Return ONLY the translated text:\n\n${origText}` }] }] };
            const transData = await callGeminiAPI(getTranscriptionModels(), transBody, key);
            trackCost('textGeneration', 1);
            translationCache[cKey] = transData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          } catch(e) { reelProgressLabel.textContent = `${REEL_LANG_OPTIONS[v.subtitle]} subtitle failed`; }
        }
        if (translationCache[cKey]) {
          const transWords = translationCache[cKey].split(/\s+/);
          const totalDur = origReel.words.length > 0 ? origReel.words[origReel.words.length - 1].end - origReel.words[0].start : 0;
          const wDur = totalDur / Math.max(1, transWords.length);
          const st = origReel.words.length > 0 ? origReel.words[0].start : 0;
          subWords = transWords.map((w, i) => ({ word: w, start: st + i * wDur, end: st + (i + 1) * wDur }));
        }
      }

      // Audio buffer
      let audioBuffer = origReel.audioBuffer;
      if (!isOrigAudio && origText) {
        const tKey = `tts_${v.audio}`;
        if (!ttsCache[tKey]) {
          const ttsCKey = `sub_${v.audio}`;
          let ttsText = translationCache[ttsCKey];
          if (!ttsText) {
            reelProgressLabel.textContent = `Translating audio to ${REEL_LANG_OPTIONS[v.audio]}...`;
            try {
              const transBody = { contents: [{ parts: [{ text: `Translate to ${REEL_LANG_OPTIONS[v.audio]}. Return ONLY the translated text:\n\n${origText}` }] }] };
              const transData = await callGeminiAPI(getTranscriptionModels(), transBody, key);
              trackCost('textGeneration', 1);
              ttsText = transData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
              translationCache[ttsCKey] = ttsText;
            } catch(e) { reelProgressLabel.textContent = `${REEL_LANG_OPTIONS[v.audio]} translation failed`; }
          }
          if (ttsText) {
            reelProgressLabel.textContent = `Generating ${REEL_LANG_OPTIONS[v.audio]} audio...`;
            setStatus(`Generating ${REEL_LANG_OPTIONS[v.audio]} TTS...`, true);
            try {
              const ttsModels = getTTSModels();
              const ttsResp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${ttsModels[0]}:generateContent?key=${key}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ contents: [{ parts: [{ text: ttsText }] }],
                    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
                  })
                }
              );
              if (ttsResp.ok) {
                const ttsData = await ttsResp.json();
                const part = ttsData.candidates?.[0]?.content?.parts?.[0];
                if (part?.inlineData?.data) {
                  const decoded = await decodeBase64Audio(part.inlineData.data, part.inlineData.mimeType || 'audio/wav');
                  ttsCache[tKey] = decoded.audioBuffer;
                  trackCost('ttsPerLang', 1);
                }
              }
            } catch(e) { reelProgressLabel.textContent = `${REEL_LANG_OPTIONS[v.audio]} TTS failed`; }
          }
        }
        if (ttsCache[tKey]) {
          audioBuffer = ttsCache[tKey];
          // Stretch/compress TTS audio to match original duration
          const targetDur = origReel.audioBuffer.duration;
          if (Math.abs(audioBuffer.duration - targetDur) > 0.5) {
            const rate = audioBuffer.duration / targetDur;
            const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, Math.round(targetDur * audioBuffer.sampleRate), audioBuffer.sampleRate);
            const src = offlineCtx.createBufferSource();
            src.buffer = audioBuffer;
            src.playbackRate.value = rate;
            src.connect(offlineCtx.destination);
            src.start();
            audioBuffer = await offlineCtx.startRendering();
            ttsCache[tKey] = audioBuffer;
          }
        }
      }

      singleResults.push({
        audioBuffer, scenes: origReel.scenes, words: subWords,
        videoStart: 0, videoEnd: audioBuffer.duration,
        audioLang: v.audio, subtitleLang: v.subtitle,
        audioLangLabel: REEL_LANG_OPTIONS[v.audio],
        subtitleLangLabel: REEL_LANG_OPTIONS[v.subtitle],
        lang: v.subtitle, langLabel: REEL_LANG_OPTIONS[v.subtitle],
        segmentIndex: 0,
        settings: { ...origReel.settings },
      });
     } catch(e) {
      console.warn('[ReelGen] Variation failed, retrying:', v.audio, v.subtitle, e.message);
      // Auto-retry once
      try {
        const isOrigAudio2 = v.audio === 'original';
        const isOrigSub2 = v.subtitle === 'original';
        const isNoSub2 = v.subtitle === 'none';
        let subWords2 = isNoSub2 ? [] : origReel.words;
        if (!isOrigSub2 && !isNoSub2 && origText) {
          const cKey2 = `sub_${v.subtitle}`;
          if (!translationCache[cKey2]) {
            const transBody2 = { contents: [{ parts: [{ text: `Translate to ${REEL_LANG_OPTIONS[v.subtitle]}. Return ONLY the translated text:\n\n${origText}` }] }] };
            const transData2 = await callGeminiAPI(getTranscriptionModels(), transBody2, key);
            trackCost('textGeneration', 1);
            translationCache[cKey2] = transData2.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          }
          if (translationCache[cKey2]) {
            const tw = translationCache[cKey2].split(/\s+/);
            const td = origReel.words.length > 0 ? origReel.words[origReel.words.length - 1].end - origReel.words[0].start : 0;
            const wd = td / Math.max(1, tw.length);
            const st2 = origReel.words.length > 0 ? origReel.words[0].start : 0;
            subWords2 = tw.map((w, i) => ({ word: w, start: st2 + i * wd, end: st2 + (i + 1) * wd }));
          }
        }
        let audioBuffer2 = origReel.audioBuffer;
        if (!isOrigAudio2 && origText) {
          const tKey2 = `tts_${v.audio}`;
          if (!ttsCache[tKey2]) {
            const ttsCKey2 = `sub_${v.audio}`;
            let ttsText2 = translationCache[ttsCKey2];
            if (!ttsText2) {
              const tb = { contents: [{ parts: [{ text: `Translate to ${REEL_LANG_OPTIONS[v.audio]}. Return ONLY the translated text:\n\n${origText}` }] }] };
              const td2 = await callGeminiAPI(getTranscriptionModels(), tb, key);
              trackCost('textGeneration', 1);
              ttsText2 = td2.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
              translationCache[ttsCKey2] = ttsText2;
            }
            if (ttsText2) {
              const ttsModels2 = getTTSModels();
              const ttsResp2 = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${ttsModels2[0]}:generateContent?key=${key}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ contents: [{ parts: [{ text: ttsText2 }] }],
                    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
                  })
                }
              );
              if (ttsResp2.ok) {
                const ttsData2 = await ttsResp2.json();
                const part2 = ttsData2.candidates?.[0]?.content?.parts?.[0];
                if (part2?.inlineData?.data) {
                  const decoded2 = await decodeBase64Audio(part2.inlineData.data, part2.inlineData.mimeType || 'audio/wav');
                  ttsCache[tKey2] = decoded2.audioBuffer;
                  trackCost('ttsPerLang', 1);
                }
              }
            }
          }
          if (ttsCache[tKey2]) {
            audioBuffer2 = ttsCache[tKey2];
            const targetDur2 = origReel.audioBuffer.duration;
            if (Math.abs(audioBuffer2.duration - targetDur2) > 0.5) {
              const rate2 = audioBuffer2.duration / targetDur2;
              const oc = new OfflineAudioContext(audioBuffer2.numberOfChannels, Math.round(targetDur2 * audioBuffer2.sampleRate), audioBuffer2.sampleRate);
              const src2 = oc.createBufferSource(); src2.buffer = audioBuffer2; src2.playbackRate.value = rate2; src2.connect(oc.destination); src2.start();
              audioBuffer2 = await oc.startRendering();
              ttsCache[tKey2] = audioBuffer2;
            }
          }
        }
        singleResults.push({
          audioBuffer: audioBuffer2, scenes: origReel.scenes, words: subWords2,
          videoStart: 0, videoEnd: audioBuffer2.duration,
          audioLang: v.audio, subtitleLang: v.subtitle,
          audioLangLabel: REEL_LANG_OPTIONS[v.audio],
          subtitleLangLabel: REEL_LANG_OPTIONS[v.subtitle],
          segmentIndex: 0, settings: { ...origReel.settings },
        });
      } catch(e2) {
        console.error('[ReelGen] Variation retry also failed:', v, e2);
        singleResults.push({
          audioBuffer: origReel.audioBuffer, scenes: origReel.scenes, words: origReel.words,
          videoStart: 0, videoEnd: origReel.audioBuffer.duration,
          audioLang: v.audio, subtitleLang: v.subtitle,
          audioLangLabel: REEL_LANG_OPTIONS[v.audio] + ' (failed)',
          subtitleLangLabel: REEL_LANG_OPTIONS[v.subtitle],
          segmentIndex: 0, settings: { ...origReel.settings },
        });
      }
     }
    }

    window._reelMultiResults = singleResults;
    activeReelPreview = 0;
    if (reelVariationRows.length > 1) updateReelAgent('language', 'done', `${singleResults.length} languages`);

    // Show mini editor
    resetReelAgentTasks('preview');
    updateReelAgent('preview', 'running');
    updateReelAgentTask('preview', 'sync', 'done', 'Audio & timing synced');
    updateReelAgentTask('preview', 'assemble', 'done', 'Reel preview ready');
    showReelEditorStep();
    renderReelScenes();
    renderReelFrame(0);
    renderAllReelPreviews();

  } catch(e) {
    console.error('[ReelGen] Error:', e);
    updateReelAgent('preview', 'error', friendlyApiError(e.message || 'Generation failed'));
  }
  reelGenerating = false;
  btnReelGenerate.disabled = false;
});

// ── Mini Editor ──
let activeReelPreview = 0;

// Upscale grid image and crop cells — shared by all grid fallback paths
async function reelUpscaleAndCrop(gridDataUrl, scale, rows, cols, sceneCount, barEl, labelEl, label) {
  if (labelEl) labelEl.textContent = `Upscaling ${label} grid...`;
  const upscaled = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      console.log(`[Grid] ${label} upscaled: ${img.naturalWidth}x${img.naturalHeight} → ${canvas.width}x${canvas.height}`);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(gridDataUrl);
    img.src = gridDataUrl;
  });
  if (barEl) barEl.style.width = '70%';
  const cells = await cropGridCells(upscaled, rows, cols, sceneCount);
  if (barEl) barEl.style.width = '85%';
  return cells;
}

// Draw reel frame: previous scene stays fully visible, current scene transitions in on top
function drawReelSceneFrame(ctx, cw, ch, elapsed, scenes) {
  const filtered = scenes.filter(s => s.imgDataUrl);
  if (filtered.length === 0) return;
  // Find current scene
  let curIdx = filtered.findIndex(s => elapsed >= s.startTime && elapsed < s.endTime);
  if (curIdx < 0) {
    if (elapsed >= filtered[filtered.length - 1].endTime) {
      curIdx = filtered.length - 1;
    } else {
      // FP boundary miss — pick last scene whose startTime <= elapsed
      curIdx = filtered.reduce((best, s, i) => s.startTime <= elapsed ? i : best, 0);
    }
  }
  const cur = filtered[curIdx];
  if (!cur._img) { cur._img = new Image(); cur._img.src = cur.imgDataUrl; }
  const td = curIdx === 0 ? 0 : (cur.transDur || 0);
  const localT = elapsed - cur.startTime;
  const inTransition = td > 0 && localT < td;
  // Draw previous scene underneath during transition
  if (inTransition && curIdx > 0) {
    const prev = filtered[curIdx - 1];
    if (!prev._img) { prev._img = new Image(); prev._img.src = prev.imgDataUrl; }
    if (prev._img.naturalWidth > 0) {
      ctx.save();
      const prevMotion = prev.motion || 'none';
      if (prevMotion !== 'none' && typeof applyMotionTransform === 'function') {
        applyMotionTransform(ctx, prevMotion, 1, { startTime: prev.startTime, duration: prev.endTime - prev.startTime, imgEl: prev._img }, cw, ch);
      }
      drawCoverFit(ctx, prev._img, cw, ch);
      ctx.restore();
    }
  }
  // Draw current scene (with entry transition if applicable)
  if (cur._img.naturalWidth > 0) {
    const progress = td > 0 ? Math.min(localT / td, 1) : 1;
    const eased = progress * progress * (3 - 2 * progress); // smoothstep
    const motion = cur.motion || 'none';
    const transition = curIdx === 0 ? 'none' : (cur.transition || 'none');
    ctx.save();
    if (motion !== 'none' && typeof applyMotionTransform === 'function') {
      const lifeProg = (cur.endTime - cur.startTime) > 0 ? localT / (cur.endTime - cur.startTime) : 0;
      applyMotionTransform(ctx, motion, lifeProg, { startTime: cur.startTime, duration: cur.endTime - cur.startTime, imgEl: cur._img }, cw, ch);
    }
    if (transition === 'none' || progress >= 1) {
      drawCoverFit(ctx, cur._img, cw, ch);
    } else if (transition === 'fade' || transition === 'crossfade') {
      ctx.globalAlpha = eased;
      drawCoverFit(ctx, cur._img, cw, ch);
    } else if (transition === 'whip-pan') {
      const ox = (1 - eased) * cw * 1.2;
      const blur = Math.round(ox / cw * 30);
      if (blur > 0) ctx.filter = `blur(${blur}px)`;
      ctx.translate(ox, 0);
      drawCoverFit(ctx, cur._img, cw, ch);
      ctx.filter = 'none';
    } else if (transition === 'zoom-in') {
      const scale = 0.5 + 0.5 * eased;
      ctx.globalAlpha = eased;
      ctx.translate(cw / 2, ch / 2); ctx.scale(scale, scale); ctx.translate(-cw / 2, -ch / 2);
      drawCoverFit(ctx, cur._img, cw, ch);
    } else if (transition === 'flash') {
      if (progress < 0.5) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); }
      else { drawCoverFit(ctx, cur._img, cw, ch); }
    } else if (transition === 'slide-left') {
      ctx.translate((1 - eased) * cw, 0);
      drawCoverFit(ctx, cur._img, cw, ch);
    } else if (transition === 'slide-right') {
      ctx.translate(-(1 - eased) * cw, 0);
      drawCoverFit(ctx, cur._img, cw, ch);
    } else {
      ctx.globalAlpha = eased;
      drawCoverFit(ctx, cur._img, cw, ch);
    }
    ctx.restore();
  }
}

// Converts old string position values ('top'/'center'/'bottom') or numeric (0-100) to a number
function parseSubPos(v) { return typeof v === 'number' ? v : (v === 'top' ? 12 : v === 'center' ? 52 : 85); }
// Maps a 0-100 number back to the nearest named option for the select dropdown
function subPosToStr(n) { return n <= 20 ? 'top' : n <= 65 ? 'center' : 'bottom'; }

const REEL_SUB_PRESETS = {
  'hormozi':  { subtitleStyle: 'word-by-word', subColor: '#ffffff', subOutline: '#000000', subBackdrop: 'shadow', subSize: 5,   subPosition: 85, subFont: 'Anton',   subAllCaps: true,  subAccent: '#f7c204' },
  'classic':  { subtitleStyle: 'highlight',    subColor: '#ffffff', subOutline: '#000000', subBackdrop: 'dark',   subSize: 4,   subPosition: 85, subFont: 'Poppins', subAllCaps: false, subAccent: '#7c3aed' },
  'karaoke':  { subtitleStyle: 'karaoke',      subColor: '#ffffff', subOutline: '#000000', subBackdrop: 'dark',   subSize: 3.5, subPosition: 85, subFont: 'Poppins', subAllCaps: false, subAccent: '#7c3aed' },
  'bold':     { subtitleStyle: 'bold-center',  subColor: '#ffffff', subOutline: '#000000', subBackdrop: 'dark',   subSize: 5,   subPosition: 52, subFont: 'Poppins', subAllCaps: true,  subAccent: '#f7c204' },
  'minimal':  { subtitleStyle: 'highlight',    subColor: '#ffffff', subOutline: '#000000', subBackdrop: 'none',   subSize: 3.5, subPosition: 85, subFont: 'Inter',   subAllCaps: false, subAccent: '#7c3aed' },
};

function applyReelSubPresetToCard(el, results) {
  const preset = el.value;
  const idx = parseInt(el.dataset.ri);
  const r = (results || window._reelMultiResults || [])[idx];
  if (!r || !preset) return;
  const p = REEL_SUB_PRESETS[preset];
  if (!p) return;
  if (!r.settings) r.settings = {};
  Object.assign(r.settings, p);
  console.log('[SubPreset] applied:', preset, 'idx:', idx, 'activeReelPreview:', activeReelPreview, 'style:', p.subtitleStyle, 'font:', p.subFont);
  // Sync globals so saveActiveReelSettings() doesn't overwrite with stale values
  if (idx === activeReelPreview) {
    reelSubtitleStyle = p.subtitleStyle; reelSubColor = p.subColor; reelSubOutline = p.subOutline;
    reelSubBackdrop = p.subBackdrop; reelSubSize = p.subSize; reelSubPosition = p.subPosition;
    reelSubFont = p.subFont; reelSubAllCaps = p.subAllCaps; reelSubAccent = p.subAccent;
  }
  window._editorReelSubtitle = {
    words: window._editorReelSubtitle?.words || reelWords,
    style: p.subtitleStyle, subColor: p.subColor, subOutline: p.subOutline,
    subBackdrop: p.subBackdrop, subSize: p.subSize, subPosition: p.subPosition,
    subFont: p.subFont, subAllCaps: p.subAllCaps, subAccent: p.subAccent,
  };
  const card = el.closest('.reel-preview-section');
  if (!card) return;
  const q = (sel) => card.querySelector(sel);
  const styleEl = q(`.rc-sub-style[data-ri="${idx}"]`);
  if (styleEl) styleEl.value = p.subtitleStyle;
  const colorEl = q(`.rc-sub-color[data-ri="${idx}"]`);
  if (colorEl) colorEl.value = p.subColor;
  const outlineEl = q(`.rc-sub-outline[data-ri="${idx}"]`);
  if (outlineEl) outlineEl.value = p.subOutline;
  const backdropEl = q(`.rc-sub-backdrop[data-ri="${idx}"]`);
  if (backdropEl) backdropEl.value = p.subBackdrop;
  const sizeEl = q(`.rc-sub-size[data-ri="${idx}"]`);
  if (sizeEl) { sizeEl.value = p.subSize; const sl = card.querySelector(`.rc-size-label`); if (sl) sl.textContent = p.subSize; }
  const posEl = q(`.rc-sub-pos[data-ri="${idx}"]`);
  if (posEl) posEl.value = subPosToStr(p.subPosition);
  const posNumEl = q(`.rc-sub-pos-num[data-ri="${idx}"]`);
  if (posNumEl) { posNumEl.value = p.subPosition; const pl = card.querySelector('.rc-pos-label'); if (pl) pl.textContent = p.subPosition + '%'; }
  const accentEl = q(`.rc-sub-accent[data-ri="${idx}"]`);
  if (accentEl) accentEl.value = p.subAccent;
  const fontEl = q(`.rc-sub-font[data-ri="${idx}"]`);
  if (fontEl) fontEl.value = p.subFont;
  const capsEl = q(`.rc-sub-all-caps[data-ri="${idx}"]`);
  if (capsEl) capsEl.checked = p.subAllCaps;
}

function renderAllReelPreviews() {
  const container = $('reel-previews-container');
  if (!container) return;
  const results = window._reelMultiResults;

  console.log('[ReelPreview] renderAllReelPreviews called, results:', results?.length || 0);
  if (!results || results.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '20px';
  container.style.maxWidth = '100%';
  container.style.overflow = 'hidden';

  const platform = REEL_PLATFORMS[reelPlatform];
  const cw = platform.width;
  const ch = platform.height;
  const isVid = results.some(r => r.scenes?.some(s => s.isVideo));
  const dpr = window.devicePixelRatio || 1;
  const prevCSSW = 300, prevCSSH = Math.round(300 * ch / cw);
  const previewW = Math.round(prevCSSW * dpr), previewH = Math.round(prevCSSH * dpr);

  // Build controls HTML for each reel
  function buildControlsHtml(i, r) {
    const s = r.settings || {};
    const subStyle = s.subtitleStyle || reelSubtitleStyle;
    const trans = s.transition || reelTransition;
    const subColor = s.subColor || reelSubColor;
    const subOutline = s.subOutline || reelSubOutline;
    const subBackdrop = s.subBackdrop || reelSubBackdrop;
    const subSize = s.subSize || reelSubSize;
    const subPos = parseSubPos(s.subPosition ?? reelSubPosition ?? 85);
    const subFont = s.subFont || reelSubFont || 'Poppins';
    const subAllCaps = s.subAllCaps !== undefined ? s.subAllCaps : reelSubAllCaps;
    const subAccent = s.subAccent || reelSubAccent || '#7c3aed';
    const viewport = s.viewport || reelViewport;
    const vpx = s.viewportX ?? reelViewportX;
    const transDur = r.scenes?.[1]?.transDur ?? 0.3;
    const curMotion = r.scenes?.[0]?.motion || 'slow-zoom-in';
    return `
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <label class="form-label">Transition: <select class="rc-transition" data-ri="${i}">
          ${Object.entries(REEL_TRANSITIONS).map(([k, v]) => `<option value="${k}" ${k === trans ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select></label>
        <label class="form-label">Duration: <input type="range" class="rc-trans-dur" data-ri="${i}" min="0.1" max="1.0" value="${transDur}" step="0.1" style="width:50px;"><span class="rc-transdur-label text-2xs">${transDur}s</span></label>
        <label class="form-label">Motion: <select class="rc-motion" data-ri="${i}">
          ${Object.entries(MOTIONS).map(([k, v]) => `<option value="${k}" ${k === curMotion ? 'selected' : ''}>${v}</option>`).join('')}
        </select></label>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <label class="form-label">Subtitle Preset: <select class="rc-sub-preset" data-ri="${i}">
          <option value="">Custom</option>
          <option value="hormozi">Hormozi</option>
          <option value="classic">Classic</option>
          <option value="karaoke">Karaoke</option>
          <option value="bold">Bold Center</option>
          <option value="minimal">Minimal</option>
        </select></label>
        <label class="form-label">Style: <select class="rc-sub-style" data-ri="${i}">
          ${Object.entries(REEL_SUBTITLE_STYLES).map(([k, v]) => `<option value="${k}" ${k === subStyle ? 'selected' : ''}>${v}</option>`).join('')}
        </select></label>
        <label class="form-label">Font: <select class="rc-sub-font" data-ri="${i}">
          <option value="Poppins" ${subFont === 'Poppins' ? 'selected' : ''}>Poppins</option>
          <option value="Montserrat" ${subFont === 'Montserrat' ? 'selected' : ''}>Montserrat</option>
          <option value="Anton" ${subFont === 'Anton' ? 'selected' : ''}>Anton</option>
          <option value="Bebas Neue" ${subFont === 'Bebas Neue' ? 'selected' : ''}>Bebas Neue</option>
          <option value="Oswald" ${subFont === 'Oswald' ? 'selected' : ''}>Oswald</option>
          <option value="Inter" ${subFont === 'Inter' ? 'selected' : ''}>Inter</option>
        </select></label>
        <label class="form-label"><input type="checkbox" class="rc-sub-all-caps" data-ri="${i}" ${subAllCaps ? 'checked' : ''}> ALL CAPS</label>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <label class="form-label">Color: <input type="color" class="rc-sub-color" data-ri="${i}" value="${subColor}"></label>
        <label class="form-label">Accent: <input type="color" class="rc-sub-accent" data-ri="${i}" value="${subAccent}" title="Highlight word color"></label>
        <label class="form-label">Outline: <input type="color" class="rc-sub-outline" data-ri="${i}" value="${subOutline}"></label>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <label class="form-label">Backdrop: <select class="rc-sub-backdrop" data-ri="${i}">
          <option value="dark" ${subBackdrop === 'dark' ? 'selected' : ''}>Dark</option>
          <option value="blur" ${subBackdrop === 'blur' ? 'selected' : ''}>Blur</option>
          <option value="shadow" ${subBackdrop === 'shadow' ? 'selected' : ''}>Shadow</option>
          <option value="none" ${subBackdrop === 'none' ? 'selected' : ''}>None</option>
        </select></label>
        <label class="form-label">Size: <input type="range" class="rc-sub-size" data-ri="${i}" min="2" max="8" value="${subSize}" step="0.5" style="width:50px;"><span class="rc-size-label text-2xs">${subSize}</span></label>
        <label class="form-label">Position: <select class="rc-sub-pos" data-ri="${i}">
          <option value="top" ${subPos <= 20 ? 'selected' : ''}>Top</option>
          <option value="center" ${subPos > 20 && subPos <= 65 ? 'selected' : ''}>Center</option>
          <option value="bottom" ${subPos > 65 ? 'selected' : ''}>Bottom</option>
        </select> <input type="range" class="rc-sub-pos-num" data-ri="${i}" min="0" max="100" step="1" value="${subPos}" style="width:80px;vertical-align:middle;"><span class="rc-pos-label text-2xs">${subPos}%</span></label>
      </div>
      ${isVid ? `<label class="form-label">Viewport: <select class="rc-viewport" data-ri="${i}">
        <option value="fill-center" ${viewport === 'fill-center' ? 'selected' : ''}>Fill</option>
        <option value="fit" ${viewport === 'fit' ? 'selected' : ''}>Fit</option>
        <option value="left-third" ${viewport === 'left-third' ? 'selected' : ''}>Left</option>
        <option value="center-third" ${viewport === 'center-third' ? 'selected' : ''}>Center</option>
        <option value="right-third" ${viewport === 'right-third' ? 'selected' : ''}>Right</option>
        <option value="custom" ${viewport === 'custom' ? 'selected' : ''}>Custom</option>
      </select></label>
      <label class="form-label ${viewport !== 'custom' ? 'hidden' : ''} rc-vpx-label" data-ri="${i}">Pan: <input type="range" class="rc-vpx" data-ri="${i}" min="0" max="100" value="${vpx}" style="width:60px;"></label>` : ''}
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:4px; padding-top:6px; border-top:1px solid var(--border);">
        <label class="form-label">BGM: <select id="reel-bgm-preset-${i}" class="rc-bgm" data-ri="${i}">
          ${reelBgmAiBuffer ? '<option value="ai-generated" selected>AI Generated ✨</option>' : ''}
          <option value="none" ${!reelBgmAiBuffer ? 'selected' : ''}>None</option><option value="upbeat">Upbeat</option><option value="calm">Calm</option>
          <option value="cinematic">Cinematic</option><option value="corporate">Corporate</option><option value="playful">Playful</option>
          <option value="custom">Custom</option>
        </select></label>
        <label class="form-label">Vol: <input type="range" class="rc-bgm-vol" data-ri="${i}" min="0" max="100" value="50" style="width:50px;"><span class="rc-bgm-vol-label">50%</span></label>
        <label class="form-label">Frame: <select id="reel-frame-${i}" class="rc-frame" data-ri="${i}">
          <option value="none" ${reelFrameTemplate==='none'?'selected':''}>None</option>
          <option value="bottom-strip" ${reelFrameTemplate==='bottom-strip'?'selected':''}>Bottom Strip</option>
          <option value="top-bar" ${reelFrameTemplate==='top-bar'?'selected':''}>Top Bar</option>
          <option value="corner-tag" ${reelFrameTemplate==='corner-tag'?'selected':''}>Corner Tag</option>
          <option value="full-border" ${reelFrameTemplate==='full-border'?'selected':''}>Full Border</option>
          <option value="custom-png" ${reelFrameTemplate==='custom-png'?'selected':''}>Custom PNG</option>
        </select></label>
        <span class="rc-frame-tpl-row" data-ri="${i}" style="display:${(reelFrameTemplate!=='none'&&reelFrameTemplate!=='custom-png')?'inline-flex':'none'}; gap:4px; align-items:center;">
          <input type="text" class="rc-frame-text" data-ri="${i}" value="${reelFrameText}" placeholder="Frame text" style="width:80px;font-size:inherit;padding:2px 4px;">
          <input type="color" class="rc-frame-bg" data-ri="${i}" value="${reelFrameBgColor}" title="BG color">
          <input type="color" class="rc-frame-tc" data-ri="${i}" value="${reelFrameTextColor}" title="Text color">
        </span>
        <span class="rc-frame-png-row" data-ri="${i}" style="display:${reelFrameTemplate==='custom-png'?'inline-flex':'none'}; gap:4px; align-items:center; flex-wrap:wrap;">
          <button class="btn-xs rc-frame-upload" data-ri="${i}">${reelFrameImgSrc ? '🖼 PNG loaded' : '+ Upload PNG'}</button>
          <label class="form-label" style="font-size:inherit;">W:<input type="range" class="rc-frame-imgw" data-ri="${i}" min="10" max="200" value="${reelFrameImgW}" step="5" style="width:55px;" title="Width %"><span class="rc-frame-imgw-val text-2xs">${reelFrameImgW}%</span></label>
          <label class="form-label" style="font-size:inherit;">X:<input type="range" class="rc-frame-imgx" data-ri="${i}" min="-100" max="100" value="${reelFrameImgX}" step="1" style="width:55px;" title="X offset %"><span class="rc-frame-imgx-val text-2xs">${reelFrameImgX}%</span></label>
          <label class="form-label" style="font-size:inherit;">Y:<input type="range" class="rc-frame-imgy" data-ri="${i}" min="-100" max="100" value="${reelFrameImgY}" step="1" style="width:55px;" title="Y offset %"><span class="rc-frame-imgy-val text-2xs">${reelFrameImgY}%</span></label>
          <label class="form-label" style="font-size:inherit;">Opacity:<input type="range" class="rc-frame-opacity" data-ri="${i}" min="0" max="100" value="${Math.round(reelFrameOpacity * 100)}" step="5" style="width:50px;" title="Opacity"><span class="rc-frame-opacity-val text-2xs">${Math.round(reelFrameOpacity * 100)}%</span></label>
        </span>
      </div>
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        <label class="form-label">Overlays:</label>
        <button class="btn-xs" data-overlay="subscribe">🔴 Subscribe</button>
        <button class="btn-xs" data-overlay="follow">💜 Follow</button>
        <button class="btn-xs" data-overlay="lower-third">📛 Lower Third</button>
        <button class="btn-xs" data-overlay="cta-arrow">👇 CTA</button>
        <button class="btn-xs" data-overlay="fade-title">✨ Title</button>
      </div>
      <div id="reel-overlay-chips" style="display:none; flex-wrap:wrap; gap:4px; max-width:100%; overflow:hidden; box-sizing:border-box;"></div>`;
  }

  container.innerHTML = results.map((r, i) => {
    const audioLabel = r.audioLangLabel || 'Original';
    const subLabel = r.subtitleLangLabel || 'Original';
    const isFailed = audioLabel.includes('(failed)');
    return `
    <div class="reel-preview-section" data-ri="${i}" style="border:1px solid ${isFailed ? 'var(--red)' : 'var(--border)'}; border-radius:var(--radius); padding:16px; background:var(--bg-secondary); width:100%; box-sizing:border-box; overflow:hidden;">
      <div style="font-size:0.82rem; font-weight:600; margin-bottom:10px;">Reel ${i + 1} <span style="font-weight:400; font-size:0.7rem; color:var(--text-muted);">🔊 ${audioLabel} · 💬 ${subLabel}</span>${isFailed ? ` <button class="btn-xs reel-retry-var" data-ri="${i}" style="margin-left:8px; color:var(--red);">🔄 Retry</button>` : ''}</div>
      <div style="display:flex; gap:16px; align-items:flex-start; overflow:hidden;">
        <!-- Left: Canvas + seek -->
        <div style="flex-shrink:0;">
          <div class="reel-canvas-wrap" style="width:300px;">
            <canvas class="reel-thumb-canvas" data-ri="${i}" width="${previewW}" height="${previewH}" style="width:${prevCSSW}px;height:${prevCSSH}px;display:block;"></canvas>
          </div>
          <div style="display:flex; align-items:center; gap:4px; margin-top:6px; width:300px;">
            <button class="btn-xs reel-mp-play" data-ri="${i}" title="Play/Pause">▶</button>
            <button class="btn-xs reel-mp-stop" data-ri="${i}" title="Stop">⏹</button>
            <input type="range" class="reel-mp-scrub" data-ri="${i}" min="0" max="1000" value="0" style="flex:1; height:3px;">
            <span class="reel-mp-time text-2xs text-muted" data-ri="${i}">0:00</span>
          </div>
        </div>
        <!-- Right: Controls -->
        <div style="flex:1; min-width:0; overflow-x:hidden; display:flex; flex-direction:column; gap:6px; font-size:0.72rem;">
          ${buildControlsHtml(i, r)}
        </div>
      </div>
    </div>`;
  }).join('');

  // Render frame with subtitles on each canvas
  function drawPreviewFrame(cvs, r) {
    const ctx = cvs.getContext('2d');
    ctx.setTransform(previewW / cw, 0, 0, previewH / ch, 0, 0);
    const midTime = r.words && r.words.length > 0 ? r.words[Math.min(3, r.words.length - 1)].start + 0.1 : 0.5;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
    if (reelVideoEl && reelVideoEl.videoWidth > 0) {
      const vp = r.settings?.viewport || 'fill-center';
      const vpx = r.settings?.viewportX ?? 50;
      try { drawViewportCrop(ctx, reelVideoEl, cw, ch, vp, vpx); } catch(e) {
        try { drawCoverFit(ctx, reelVideoEl, cw, ch); } catch(e2) {}
      }
    } else if (r.scenes) {
      const scene = r.scenes[0];
      if (scene?.imgDataUrl) {
        if (!scene._img) { scene._img = new Image(); scene._img.src = scene.imgDataUrl; }
        if (scene._img.naturalWidth > 0) {
          try { drawCoverFit(ctx, scene._img, cw, ch); } catch(e) {}
        }
      }
    }
    const rs = r.settings || {};
    const savedC = reelSubColor, savedO = reelSubOutline, savedB = reelSubBackdrop, savedSz = reelSubSize, savedP = reelSubPosition, savedF = reelSubFont, savedAC = reelSubAllCaps, savedAcc = reelSubAccent;
    reelSubColor = rs.subColor || savedC; reelSubOutline = rs.subOutline || savedO;
    reelSubBackdrop = rs.subBackdrop || savedB; reelSubSize = rs.subSize || savedSz; reelSubPosition = parseSubPos(rs.subPosition ?? savedP);
    reelSubFont = rs.subFont || savedF; reelSubAllCaps = rs.subAllCaps !== undefined ? rs.subAllCaps : savedAC;
    reelSubAccent = rs.subAccent || savedAcc;
    const subStyle = rs.subtitleStyle || reelSubtitleStyle;
    if (subStyle !== 'none' && r.words && r.words.length > 0) {
      renderReelSubtitle(ctx, cw, ch, midTime, r.words, subStyle);
    }
    reelSubColor = savedC; reelSubOutline = savedO; reelSubBackdrop = savedB; reelSubSize = savedSz; reelSubPosition = savedP; reelSubFont = savedF; reelSubAllCaps = savedAC; reelSubAccent = savedAcc;
  }
  // Seek video then draw all previews
  const canvases = [...container.querySelectorAll('.reel-thumb-canvas')];
  if (reelVideoEl && reelVideoEl.videoWidth > 0 && canvases.length > 0) {
    const firstResult = results[0];
    const seekTime = (firstResult?.videoStart || 0) + (firstResult?.words?.[3]?.start || 0.5);
    reelVideoEl.currentTime = seekTime;
    reelVideoEl.onseeked = () => {
      reelVideoEl.onseeked = null;
      canvases.forEach(cvs => drawPreviewFrame(cvs, results[parseInt(cvs.dataset.ri)]));
    };
  } else {
    canvases.forEach(cvs => drawPreviewFrame(cvs, results[parseInt(cvs.dataset.ri)]));
  }

  // Preload all scene images/videos so they're ready before playback hits transitions
  results.forEach(r => {
    if (!r.scenes) return;
    r.scenes.forEach(s => {
      if (s.imgDataUrl && !s._img) {
        s._img = new Image();
        s._img.src = s.imgDataUrl;
      }
      if (reelVideoMode === 'animated' && (s.videoUrl || (s.videoClips && s.videoClips.length > 0)) && !s._videoEls) {
        const clips = s.videoClips || [{ url: s.videoUrl, clipDuration: 10 }];
        s._videoEls = clips.map(clip => {
          const v = document.createElement('video');
          v.muted = true; v.preload = 'auto'; v.playsInline = true;
          v.src = clip.url; v.load();
          return v;
        });
        s._videoEl = s._videoEls[0];
      }
    });
  });

  // Per-preview playback — stop any previously playing audio from old render
  if (window._reelMpState) {
    Object.keys(window._reelMpState).forEach(k => {
      const st = window._reelMpState[k];
      if (st.source) { try { st.source.stop(); } catch(e) {} }
      if (st.bgmSource) { try { st.bgmSource.stop(); } catch(e) {} }
      if (st.animId) cancelAnimationFrame(st.animId);
    });
  }
  if (reelBgmAudioEl) { try { reelBgmAudioEl.pause(); } catch(e) {} }
  const mpState = {}; // idx → { source, startedAt, playing, animId }
  window._reelMpState = mpState;
  container.querySelectorAll('.reel-mp-play').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.ri);
      const r = results[idx];
      if (!r || !r.audioBuffer) return;
      // Toggle: if this one is playing, pause it
      if (mpState[idx]?.playing) { pauseMp(idx); btn.textContent = '▶'; return; }
      // Stop any other playing preview
      Object.keys(mpState).forEach(k => { if (mpState[k].playing) { pauseMp(parseInt(k)); const ob = container.querySelector(`.reel-mp-play[data-ri="${k}"]`); if (ob) ob.textContent = '▶'; } });
      // Resume or start playback
      const resumeOffset = mpState[idx]?.pausedAt || 0;
      // Ensure all scene images are loaded before starting playback
      if (r.scenes) {
        const unloaded = r.scenes.filter(s => s.imgDataUrl && (!s._img || s._img.naturalWidth === 0));
        if (unloaded.length > 0) {
          await Promise.all(unloaded.map(s => new Promise(res => {
            if (!s._img) { s._img = new Image(); s._img.src = s.imgDataUrl; }
            if (s._img.naturalWidth > 0) { res(); return; }
            s._img.onload = s._img.onerror = res;
          })));
        }
      }
      const ctx = ensureAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      const source = ctx.createBufferSource();
      source.buffer = r.audioBuffer;
      source.connect(ctx.destination);
      const startedAt = ctx.currentTime - resumeOffset;
      source.start(0, resumeOffset);
      let bgmPreviewSource = null;
      let bgmGainNode = null;
      if (reelBgmBuffer) {
        bgmPreviewSource = ctx.createBufferSource();
        bgmPreviewSource.buffer = reelBgmBuffer;
        bgmPreviewSource.loop = true;
        bgmGainNode = ctx.createGain(); bgmGainNode.gain.value = reelBgmVolume;
        bgmPreviewSource.connect(bgmGainNode); bgmGainNode.connect(ctx.destination);
        bgmPreviewSource.start(0, resumeOffset);
        console.log('[BGM] Playing buffer, offset:', resumeOffset, 'gain:', reelBgmVolume);
      } else if (reelBgmAudioEl) {
        reelBgmAudioEl.currentTime = resumeOffset;
        reelBgmAudioEl.volume = reelBgmVolume;
        reelBgmAudioEl.play().catch(() => {});
      }
      mpState[idx] = { source, bgmSource: bgmPreviewSource, bgmGain: bgmGainNode, startedAt, playing: true, animId: null, pausedAt: 0 };
      btn.textContent = '⏸';
      // Start video playback in sync
      if (reelVideoEl && reelVideoEl.videoWidth > 0) {
        const seg = r.segments?.[0];
        reelVideoEl.currentTime = (seg?.startTime || 0) + resumeOffset;
        reelVideoEl.play().catch(() => {});
      }
      // Animate canvas + scrub
      const cvs = container.querySelector(`.reel-thumb-canvas[data-ri="${idx}"]`);
      const scrub = container.querySelector(`.reel-mp-scrub[data-ri="${idx}"]`);
      const timeEl = container.querySelector(`.reel-mp-time[data-ri="${idx}"]`);
      const drawCtx = cvs?.getContext('2d');
      function tick() {
        if (!mpState[idx]?.playing) return;
        const elapsed = ensureAudioCtx().currentTime - mpState[idx].startedAt;
        if (elapsed >= r.audioBuffer.duration) { stopMp(idx); return; }
        if (scrub) scrub.value = Math.round((elapsed / r.audioBuffer.duration) * 1000);
        if (timeEl) timeEl.textContent = fmtShort(elapsed);
        if (drawCtx) {
          drawCtx.setTransform(previewW / cw, 0, 0, previewH / ch, 0, 0);
          drawCtx.fillStyle = '#000'; drawCtx.fillRect(0, 0, cw, ch);
          if (reelVideoEl && reelVideoEl.videoWidth > 0) {
            const vp = r.settings?.viewport || reelViewport;
            const vpx = r.settings?.viewportX ?? reelViewportX;
            try { drawViewportCrop(drawCtx, reelVideoEl, cw, ch, vp, vpx); } catch(e) {}
          } else if (r.scenes) {
            if (reelVideoMode === 'animated') {
              let sceneIdx = 0;
              for (let si = r.scenes.length - 1; si >= 0; si--) { if ((r.scenes[si].startTime || 0) <= elapsed) { sceneIdx = si; break; } }
              const st = mpState[idx];
              if (st._lastSceneIdx === undefined) { st._lastSceneIdx = -1; st._lastClipIdx = -1; }
              const curScene = r.scenes[sceneIdx];
              const clips = curScene?.videoClips || (curScene?.videoUrl ? [{ url: curScene.videoUrl, clipDuration: 10 }] : []);
              const timeInScene = elapsed - (curScene?.startTime || 0);
              let clipIdx = Math.max(0, clips.length - 1);
              let cumDur = 0;
              for (let c = 0; c < clips.length; c++) { if (timeInScene < cumDur + (clips[c].clipDuration || 10)) { clipIdx = c; break; } cumDur += (clips[c].clipDuration || 10); }
              const videoEls = curScene?._videoEls || (curScene?._videoEl ? [curScene._videoEl] : []);
              const videoEl = videoEls[clipIdx] || videoEls[0];
              const sceneChanged = sceneIdx !== st._lastSceneIdx;
              const clipChanged = clipIdx !== st._lastClipIdx;
              if (sceneChanged || clipChanged) {
                if (st._lastSceneIdx >= 0) {
                  const prev = r.scenes[st._lastSceneIdx];
                  const prevEls = prev?._videoEls || (prev?._videoEl ? [prev._videoEl] : []);
                  if (sceneChanged) { prevEls.forEach(v => { try { v.pause(); } catch {} }); }
                  else { const prevEl = videoEls[st._lastClipIdx]; if (prevEl) try { prevEl.pause(); } catch {} }
                }
                if (videoEl) {
                  videoEl._ready = false;
                  videoEl.onseeked = () => { videoEl._ready = true; if (st.playing) videoEl.play().catch(() => {}); };
                  videoEl.currentTime = 0.5;
                  setTimeout(() => { if (!videoEl._ready) { videoEl._ready = true; if (st.playing) videoEl.play().catch(() => {}); } }, 400);
                }
                st._lastSceneIdx = sceneIdx;
                st._lastClipIdx = clipIdx;
              }
              if (videoEl?.readyState >= 2) try { drawCoverFit(drawCtx, videoEl, cw, ch); } catch(e) {}
            } else {
              try { drawReelSceneFrame(drawCtx, cw, ch, elapsed, r.scenes); } catch(e) {}
            }
          }
          // Sync globals from per-reel settings for renderReelSubtitle
          const rs = r.settings || {};
          const savedColor = reelSubColor, savedOutline = reelSubOutline, savedBackdrop = reelSubBackdrop, savedSize = reelSubSize, savedPos = reelSubPosition, savedFont = reelSubFont, savedCaps = reelSubAllCaps, savedAccent = reelSubAccent;
          reelSubColor = rs.subColor || savedColor; reelSubOutline = rs.subOutline || savedOutline;
          reelSubBackdrop = rs.subBackdrop || savedBackdrop; reelSubSize = rs.subSize || savedSize; reelSubPosition = parseSubPos(rs.subPosition ?? savedPos);
          reelSubFont = rs.subFont || savedFont; reelSubAllCaps = rs.subAllCaps !== undefined ? rs.subAllCaps : savedCaps;
          reelSubAccent = rs.subAccent || savedAccent;
          const subStyle = rs.subtitleStyle || reelSubtitleStyle;
          if (subStyle !== 'none' && r.words?.length > 0) {
            renderReelSubtitle(drawCtx, cw, ch, elapsed, r.words, subStyle);
          }
          reelSubColor = savedColor; reelSubOutline = savedOutline; reelSubBackdrop = savedBackdrop; reelSubSize = savedSize; reelSubPosition = savedPos; reelSubFont = savedFont; reelSubAllCaps = savedCaps; reelSubAccent = savedAccent;
          drawReelFrame(drawCtx, cw, ch);
          drawReelOverlays(drawCtx, cw, ch, elapsed);
        }
        mpState[idx].animId = requestAnimationFrame(tick);
      }
      source.onended = () => { if (mpState[idx]?.playing) stopMp(idx); };
      mpState[idx].animId = requestAnimationFrame(tick);
    });
  });

  function pauseMp(idx) {
    const st = mpState[idx];
    if (!st || !st.playing) return;
    const elapsed = ensureAudioCtx().currentTime - st.startedAt;
    st.playing = false;
    st.pausedAt = elapsed;
    if (st.source) { try { st.source.stop(); } catch(e) {} }
    if (st.bgmSource) { try { st.bgmSource.stop(); } catch(e) {} }
    if (reelBgmAudioEl) { try { reelBgmAudioEl.pause(); } catch(e) {} }
    if (st.animId) cancelAnimationFrame(st.animId);
    if (reelVideoEl) { try { reelVideoEl.pause(); } catch(e) {} }
    if (reelVideoMode === 'animated') {
      const r = results[idx];
      if (r?.scenes) r.scenes.forEach(s => {
        if (s._videoEls) s._videoEls.forEach(v => { try { v.pause(); } catch {} });
        else if (s._videoEl) { try { s._videoEl.pause(); } catch {} }
      });
    }
  }

  function stopMp(idx, resetScrub) {
    const st = mpState[idx];
    if (!st) return;
    st.playing = false;
    if (st.source) { try { st.source.stop(); } catch(e) {} }
    if (st.bgmSource) { try { st.bgmSource.stop(); } catch(e) {} }
    if (reelBgmAudioEl) { try { reelBgmAudioEl.pause(); } catch(e) {} }
    // Reset play button to ▶
    const playBtn = container.querySelector(`.reel-mp-play[data-ri="${idx}"]`);
    if (playBtn) playBtn.textContent = '▶';
    if (st.animId) cancelAnimationFrame(st.animId);
    if (reelVideoEl) { try { reelVideoEl.pause(); } catch(e) {} }
    if (resetScrub) {
      const scrub = container.querySelector(`.reel-mp-scrub[data-ri="${idx}"]`);
      if (scrub) scrub.value = 0;
      const timeEl = container.querySelector(`.reel-mp-time[data-ri="${idx}"]`);
      if (timeEl) timeEl.textContent = '0:00';
    }
    delete mpState[idx];
  }

  container.querySelectorAll('.reel-mp-pause').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.ri);
      if (mpState[idx]?.playing) stopMp(idx);
    });
  });

  container.querySelectorAll('.reel-mp-stop').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.ri);
      stopMp(idx, true);
      // Re-render static frame
      const cvs = container.querySelector(`.reel-thumb-canvas[data-ri="${idx}"]`);
      if (cvs) {
        const r = results[idx];
        const drawCtx = cvs.getContext('2d');
        const midTime = r.words?.length > 0 ? r.words[Math.min(3, r.words.length - 1)].start + 0.1 : 0.5;
        drawCtx.setTransform(previewW / cw, 0, 0, previewH / ch, 0, 0);
        drawCtx.fillStyle = '#000'; drawCtx.fillRect(0, 0, cw, ch);
        if (reelVideoEl && reelVideoEl.videoWidth > 0) {
          try { drawViewportCrop(drawCtx, reelVideoEl, cw, ch, r.settings?.viewport || 'fill-center', r.settings?.viewportX ?? 50); } catch(e) {}
        }
        const subStyle = r.settings?.subtitleStyle || reelSubtitleStyle;
        if (subStyle !== 'none' && r.words?.length > 0) renderReelSubtitle(drawCtx, cw, ch, midTime, r.words, subStyle);
        drawReelFrame(drawCtx, cw, ch);
        drawReelOverlays(drawCtx, cw, ch, midTime);
      }
    });
  });

  // Scrub seek
  container.querySelectorAll('.reel-mp-scrub').forEach(scrub => {
    scrub.addEventListener('input', (e) => {
      e.stopPropagation();
      const idx = parseInt(scrub.dataset.ri);
      const r = results[idx];
      if (!r) return;
      // Stop audio/anim without resetting scrub position
      const st = mpState[idx];
      if (st) {
        st.playing = false;
        if (st.source) { try { st.source.stop(); } catch(e) {} }
        if (st.animId) cancelAnimationFrame(st.animId);
        delete mpState[idx];
      }
      const t = (scrub.value / 1000) * r.audioBuffer.duration;
      const timeEl = container.querySelector(`.reel-mp-time[data-ri="${idx}"]`);
      if (timeEl) timeEl.textContent = fmtShort(t);
      const cvs = container.querySelector(`.reel-thumb-canvas[data-ri="${idx}"]`);
      if (cvs) {
        const drawCtx = cvs.getContext('2d');
        const drawFrame = () => {
          drawCtx.setTransform(previewW / cw, 0, 0, previewH / ch, 0, 0);
          drawCtx.fillStyle = '#000'; drawCtx.fillRect(0, 0, cw, ch);
          if (reelVideoEl && reelVideoEl.videoWidth > 0) {
            try { drawViewportCrop(drawCtx, reelVideoEl, cw, ch, r.settings?.viewport || 'fill-center', r.settings?.viewportX ?? 50); } catch(e) {}
          } else if (r.scenes) {
            try { drawReelSceneFrame(drawCtx, cw, ch, t, r.scenes); } catch(e) {}
          }
          const rs2 = r.settings || {};
          const sC = reelSubColor, sO = reelSubOutline, sB = reelSubBackdrop, sSz = reelSubSize, sP = reelSubPosition, sF = reelSubFont, sAC = reelSubAllCaps, sAcc = reelSubAccent;
          reelSubColor = rs2.subColor || sC; reelSubOutline = rs2.subOutline || sO;
          reelSubBackdrop = rs2.subBackdrop || sB; reelSubSize = rs2.subSize || sSz; reelSubPosition = parseSubPos(rs2.subPosition ?? sP);
          reelSubFont = rs2.subFont || sF; reelSubAllCaps = rs2.subAllCaps !== undefined ? rs2.subAllCaps : sAC;
          reelSubAccent = rs2.subAccent || sAcc;
          const subStyle = rs2.subtitleStyle || reelSubtitleStyle;
          if (subStyle !== 'none' && r.words?.length > 0) renderReelSubtitle(drawCtx, cw, ch, t, r.words, subStyle);
          reelSubColor = sC; reelSubOutline = sO; reelSubBackdrop = sB; reelSubSize = sSz; reelSubPosition = sP; reelSubFont = sF; reelSubAllCaps = sAC; reelSubAccent = sAcc;
          drawReelFrame(drawCtx, cw, ch);
          drawReelOverlays(drawCtx, cw, ch, t);
        };
        if (reelVideoEl && reelVideoEl.videoWidth > 0) {
          reelVideoEl.currentTime = (r.videoStart || 0) + t;
          reelVideoEl.onseeked = () => { drawFrame(); reelVideoEl.onseeked = null; };
        } else {
          drawFrame();
        }
      }
    });
    // Resume playback from seek position on release
    scrub.addEventListener('change', async (e) => {
      e.stopPropagation();
      const idx = parseInt(scrub.dataset.ri);
      const r = results[idx];
      if (!r || !r.audioBuffer) return;
      const seekTime = (scrub.value / 1000) * r.audioBuffer.duration;
      // Start audio from seek position
      const ctx = ensureAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      const source = ctx.createBufferSource();
      source.buffer = r.audioBuffer;
      source.connect(ctx.destination);
      const startedAt = ctx.currentTime - seekTime;
      source.start(0, seekTime);
      let bgmSeekSource = null;
      if (reelBgmBuffer) {
        bgmSeekSource = ctx.createBufferSource();
        bgmSeekSource.buffer = reelBgmBuffer;
        bgmSeekSource.loop = true;
        const bgmGain2 = ctx.createGain(); bgmGain2.gain.value = 0.3;
        bgmSeekSource.connect(bgmGain2); bgmGain2.connect(ctx.destination);
        bgmSeekSource.start(0, seekTime % reelBgmBuffer.duration);
      }
      mpState[idx] = { source, bgmSource: bgmSeekSource, startedAt, playing: true, animId: null };
      const cvs = container.querySelector(`.reel-thumb-canvas[data-ri="${idx}"]`);
      const timeEl = container.querySelector(`.reel-mp-time[data-ri="${idx}"]`);
      const drawCtx = cvs?.getContext('2d');
      function tickFromSeek() {
        if (!mpState[idx]?.playing) return;
        const elapsed = ctx.currentTime - mpState[idx].startedAt;
        if (elapsed >= r.audioBuffer.duration) { stopMp(idx); return; }
        scrub.value = Math.round((elapsed / r.audioBuffer.duration) * 1000);
        if (timeEl) timeEl.textContent = fmtShort(elapsed);
        if (drawCtx) {
          drawCtx.setTransform(previewW / cw, 0, 0, previewH / ch, 0, 0);
          drawCtx.fillStyle = '#000'; drawCtx.fillRect(0, 0, cw, ch);
          if (reelVideoEl && reelVideoEl.videoWidth > 0) {
            const vp = r.settings?.viewport || reelViewport;
            const vpx = r.settings?.viewportX ?? reelViewportX;
            try { drawViewportCrop(drawCtx, reelVideoEl, cw, ch, vp, vpx); } catch(e) {}
          } else if (r.scenes) {
            try { drawReelSceneFrame(drawCtx, cw, ch, elapsed, r.scenes); } catch(e) {}
          }
          const rs3 = r.settings || {};
          const sC2 = reelSubColor, sO2 = reelSubOutline, sB2 = reelSubBackdrop, sSz2 = reelSubSize, sP2 = reelSubPosition, sF2 = reelSubFont, sAC2 = reelSubAllCaps, sAcc2 = reelSubAccent;
          reelSubColor = rs3.subColor || sC2; reelSubOutline = rs3.subOutline || sO2;
          reelSubBackdrop = rs3.subBackdrop || sB2; reelSubSize = rs3.subSize || sSz2; reelSubPosition = parseSubPos(rs3.subPosition ?? sP2);
          reelSubFont = rs3.subFont || sF2; reelSubAllCaps = rs3.subAllCaps !== undefined ? rs3.subAllCaps : sAC2;
          reelSubAccent = rs3.subAccent || sAcc2;
          const subStyle3 = rs3.subtitleStyle || reelSubtitleStyle;
          if (subStyle3 !== 'none' && r.words?.length > 0) renderReelSubtitle(drawCtx, cw, ch, elapsed, r.words, subStyle3);
          reelSubColor = sC2; reelSubOutline = sO2; reelSubBackdrop = sB2; reelSubSize = sSz2; reelSubPosition = sP2; reelSubFont = sF2; reelSubAllCaps = sAC2; reelSubAccent = sAcc2;
          drawReelFrame(drawCtx, cw, ch);
          drawReelOverlays(drawCtx, cw, ch, elapsed);
        }
        mpState[idx].animId = requestAnimationFrame(tickFromSeek);
      }
      source.onended = () => { if (mpState[idx]?.playing) stopMp(idx); };
      mpState[idx].animId = requestAnimationFrame(tickFromSeek);
    });
  });

  // Per-reel control handlers — update settings for that specific reel
  function updateReelSetting(el, key, transform) {
    const idx = parseInt(el.dataset.ri);
    const r = results[idx];
    if (!r) return;
    if (!r.settings) r.settings = {};
    r.settings[key] = transform ? transform(el.value) : el.value;
    // Also update scene transitions if transition changed
    if (key === 'transition' && r.scenes) {
      const preset = REEL_TRANSITIONS[el.value] || REEL_TRANSITIONS['whip-pan'];
      r.scenes.forEach(s => { s.transition = preset.transition; s.transDur = preset.transDur; s.motion = preset.motion; });
    }
    // Sync subtitle settings to globals and editor state
    const SUB_KEYS = ['subtitleStyle','subColor','subOutline','subBackdrop','subSize','subPosition','subFont','subAllCaps','subAccent'];
    if (SUB_KEYS.includes(key)) {
      // Keep globals in sync so saveActiveReelSettings() doesn't overwrite with stale values
      if (idx === activeReelPreview) {
        if (key === 'subtitleStyle') reelSubtitleStyle = r.settings[key];
        else if (key === 'subColor')    reelSubColor    = r.settings[key];
        else if (key === 'subOutline')  reelSubOutline  = r.settings[key];
        else if (key === 'subBackdrop') reelSubBackdrop = r.settings[key];
        else if (key === 'subSize')     reelSubSize     = r.settings[key];
        else if (key === 'subPosition') reelSubPosition = r.settings[key];
        else if (key === 'subFont')     reelSubFont     = r.settings[key];
        else if (key === 'subAllCaps')  reelSubAllCaps  = r.settings[key];
        else if (key === 'subAccent')   reelSubAccent   = r.settings[key];
      }
      window._editorReelSubtitle = {
        words: window._editorReelSubtitle?.words || reelWords,
        style: reelSubtitleStyle,
        subSize: reelSubSize,
        subPosition: reelSubPosition,
        subColor: reelSubColor,
        subOutline: reelSubOutline,
        subBackdrop: reelSubBackdrop,
        subFont: reelSubFont,
        subAllCaps: reelSubAllCaps,
        subAccent: reelSubAccent,
      };
    }
  }
  container.querySelectorAll('.rc-transition').forEach(el => el.addEventListener('change', () => updateReelSetting(el, 'transition')));
  container.querySelectorAll('.rc-trans-dur').forEach(el => {
    el.addEventListener('input', () => {
      const dur = parseFloat(el.value);
      const idx = parseInt(el.dataset.ri);
      const r = results[idx];
      if (r && r.scenes) r.scenes.forEach((s, si) => { if (si > 0) s.transDur = dur; });
      const label = el.closest('label')?.querySelector('.rc-transdur-label');
      if (label) label.textContent = dur.toFixed(1) + 's';
    });
  });
  container.querySelectorAll('.rc-motion').forEach(el => {
    el.addEventListener('change', () => {
      const idx = parseInt(el.dataset.ri);
      const r = results[idx];
      if (r && r.scenes) r.scenes.forEach(s => { s.motion = el.value; });
    });
  });
  container.querySelectorAll('.rc-sub-style').forEach(el => el.addEventListener('change', () => updateReelSetting(el, 'subtitleStyle')));
  container.querySelectorAll('.rc-sub-color').forEach(el => el.addEventListener('input', () => updateReelSetting(el, 'subColor')));
  container.querySelectorAll('.rc-sub-outline').forEach(el => el.addEventListener('input', () => updateReelSetting(el, 'subOutline')));
  container.querySelectorAll('.rc-sub-backdrop').forEach(el => el.addEventListener('change', () => updateReelSetting(el, 'subBackdrop')));
  container.querySelectorAll('.rc-sub-size').forEach(el => {
    el.addEventListener('input', () => {
      updateReelSetting(el, 'subSize', v => parseFloat(v));
      const label = el.closest('label')?.querySelector('.rc-size-label');
      if (label) label.textContent = el.value;
    });
  });
  container.querySelectorAll('.rc-sub-pos').forEach(el => el.addEventListener('change', () => {
    const n = parseSubPos(el.value);
    const numEl = el.parentElement?.querySelector('.rc-sub-pos-num');
    if (numEl) numEl.value = n;
    const lbl = el.parentElement?.querySelector('.rc-pos-label');
    if (lbl) lbl.textContent = n + '%';
    updateReelSetting(el, 'subPosition', () => n);
  }));
  container.querySelectorAll('.rc-sub-pos-num').forEach(el => el.addEventListener('input', () => {
    const n = parseInt(el.value);
    const selEl = el.parentElement?.querySelector('.rc-sub-pos');
    if (selEl) selEl.value = subPosToStr(n);
    const lbl = el.parentElement?.querySelector('.rc-pos-label');
    if (lbl) lbl.textContent = n + '%';
    updateReelSetting(el, 'subPosition', () => n);
  }));
  container.querySelectorAll('.rc-sub-font').forEach(el => el.addEventListener('change', () => updateReelSetting(el, 'subFont')));
  container.querySelectorAll('.rc-sub-accent').forEach(el => el.addEventListener('input', () => updateReelSetting(el, 'subAccent')));
  container.querySelectorAll('.rc-sub-all-caps').forEach(el => el.addEventListener('change', () => updateReelSetting(el, 'subAllCaps', () => el.checked)));
  container.querySelectorAll('.rc-sub-preset').forEach(el => el.addEventListener('change', () => applyReelSubPresetToCard(el, results)));
  container.querySelectorAll('.rc-viewport').forEach(el => {
    el.addEventListener('change', () => {
      updateReelSetting(el, 'viewport');
      const vpxLabel = container.querySelector(`.rc-vpx-label[data-ri="${el.dataset.ri}"]`);
      if (vpxLabel) vpxLabel.classList.toggle('hidden', el.value !== 'custom');
    });
  });
  container.querySelectorAll('.rc-vpx').forEach(el => el.addEventListener('input', () => updateReelSetting(el, 'viewportX', v => parseInt(v))));
  // BGM select in per-reel controls
  const bgmEls = container.querySelectorAll('.rc-bgm');
  console.log('[BGM] Wiring', bgmEls.length, 'BGM selects');
  bgmEls.forEach(el => {
    el.addEventListener('change', async () => {
      const mood = el.value;
      console.log('[BGM] Selected:', mood);
      if (mood === 'none') { reelBgmBuffer = null; if (reelBgmAudioEl) { reelBgmAudioEl.pause(); reelBgmAudioEl = null; } return; }
      if (mood === 'ai-generated') { reelBgmBuffer = reelBgmAiBuffer; reelBgmAudioEl = null; return; }
      if (mood === 'custom') { reelBgmBuffer = null; const inp = $('reel-bgm-input'); if (inp) inp.click(); return; }
      await loadBgmPreset(mood);
      console.log('[BGM] Loaded. buffer:', !!reelBgmBuffer, 'audioEl:', !!reelBgmAudioEl);
    });
  });
  // BGM volume slider — synced with BGM section slider + WaveSurfer + live preview gain
  container.querySelectorAll('.rc-bgm-vol').forEach(el => {
    el.addEventListener('input', () => {
      reelBgmVolume = parseInt(el.value) / 100;
      const label = el.parentElement.querySelector('.rc-bgm-vol-label');
      if (label) label.textContent = el.value + '%';
      if (reelBgmWavesurfer) reelBgmWavesurfer.setVolume(reelBgmVolume);
      const sectionSlider = $('reel-bgm-volume-slider');
      if (sectionSlider) { sectionSlider.value = el.value; const lbl = $('reel-bgm-vol-label'); if (lbl) lbl.textContent = el.value + '%'; }
      const mpSt = window._reelMpState;
      if (mpSt) Object.values(mpSt).forEach(st => { if (st.playing && st.bgmGain) st.bgmGain.gain.value = reelBgmVolume; });
      if (reelBgmAudioEl) reelBgmAudioEl.volume = reelBgmVolume;
    });
  });
  // Overlay buttons in per-reel controls
  container.querySelectorAll('[data-overlay]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      insertReelOverlay(btn.dataset.overlay);
    });
  });
  // Frame select in per-reel controls
  function updateRcFrameRows() {
    container.querySelectorAll('.rc-frame-tpl-row').forEach(row => {
      row.style.display = (reelFrameTemplate !== 'none' && reelFrameTemplate !== 'custom-png') ? 'inline-flex' : 'none';
    });
    container.querySelectorAll('.rc-frame-png-row').forEach(row => {
      row.style.display = reelFrameTemplate === 'custom-png' ? 'inline-flex' : 'none';
    });
  }
  function redrawFrameOnThumbs() {
    const platform = REEL_PLATFORMS[reelPlatform];
    const fcw = platform.width, fch = platform.height;
    const fdpr = window.devicePixelRatio || 1;
    const fpw = Math.round(300 * fdpr), fph = Math.round(Math.round(300 * fch / fcw) * fdpr);
    container.querySelectorAll('.reel-thumb-canvas').forEach(cvs => {
      const idx = parseInt(cvs.dataset.ri);
      const r = (window._reelMultiResults || [])[idx]; if (!r) return;
      const ctx = cvs.getContext('2d');
      ctx.setTransform(fpw / fcw, 0, 0, fph / fch, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, fcw, fch);
      if (r.scenes) { try { drawReelSceneFrame(ctx, fcw, fch, 0.5, r.scenes); } catch(e) {} }
      const rs = r.settings || {};
      const sC = reelSubColor, sO = reelSubOutline, sB = reelSubBackdrop, sSz = reelSubSize, sP = reelSubPosition, sF = reelSubFont, sAC = reelSubAllCaps, sAcc = reelSubAccent;
      reelSubColor = rs.subColor || sC; reelSubOutline = rs.subOutline || sO; reelSubBackdrop = rs.subBackdrop || sB;
      reelSubSize = rs.subSize || sSz; reelSubPosition = parseSubPos(rs.subPosition ?? sP);
      reelSubFont = rs.subFont || sF; reelSubAllCaps = rs.subAllCaps !== undefined ? rs.subAllCaps : sAC; reelSubAccent = rs.subAccent || sAcc;
      const subStyle = rs.subtitleStyle || reelSubtitleStyle;
      const midTime = r.words?.length > 0 ? r.words[Math.min(3, r.words.length - 1)].start + 0.1 : 0.5;
      if (subStyle !== 'none' && r.words?.length > 0) { try { renderReelSubtitle(ctx, fcw, fch, midTime, r.words, subStyle); } catch(e) {} }
      reelSubColor = sC; reelSubOutline = sO; reelSubBackdrop = sB; reelSubSize = sSz; reelSubPosition = sP; reelSubFont = sF; reelSubAllCaps = sAC; reelSubAccent = sAcc;
      drawReelFrame(ctx, fcw, fch);
      drawReelOverlays(ctx, fcw, fch, midTime);
    });
  }
  container.querySelectorAll('.rc-frame').forEach(el => {
    el.addEventListener('change', () => {
      reelFrameTemplate = el.value;
      updateRcFrameRows();
      window._editorReelFrame = { template: reelFrameTemplate, text: reelFrameText, bgColor: reelFrameBgColor, textColor: reelFrameTextColor, opacity: reelFrameOpacity, imgEl: reelFrameImgEl, imgSrc: reelFrameImgSrc };
      redrawFrameOnThumbs();
    });
  });
  container.querySelectorAll('.rc-frame-text').forEach(el => {
    el.addEventListener('input', () => { reelFrameText = el.value; redrawFrameOnThumbs(); });
  });
  container.querySelectorAll('.rc-frame-bg').forEach(el => {
    el.addEventListener('input', () => { reelFrameBgColor = el.value; redrawFrameOnThumbs(); });
  });
  container.querySelectorAll('.rc-frame-tc').forEach(el => {
    el.addEventListener('input', () => { reelFrameTextColor = el.value; redrawFrameOnThumbs(); });
  });
  container.querySelectorAll('.rc-frame-opacity').forEach(el => {
    el.addEventListener('input', () => {
      reelFrameOpacity = parseInt(el.value) / 100;
      const label = el.closest('.rc-frame-png-row')?.querySelector('.rc-frame-opacity-val');
      if (label) label.textContent = el.value + '%';
      redrawFrameOnThumbs();
    });
  });
  container.querySelectorAll('.rc-frame-imgw').forEach(el => {
    el.addEventListener('input', () => {
      reelFrameImgW = parseInt(el.value);
      const label = el.closest('.rc-frame-png-row')?.querySelector('.rc-frame-imgw-val');
      if (label) label.textContent = el.value + '%';
      redrawFrameOnThumbs();
    });
  });
  container.querySelectorAll('.rc-frame-imgx').forEach(el => {
    el.addEventListener('input', () => {
      reelFrameImgX = parseInt(el.value);
      const label = el.closest('.rc-frame-png-row')?.querySelector('.rc-frame-imgx-val');
      if (label) label.textContent = el.value + '%';
      redrawFrameOnThumbs();
    });
  });
  container.querySelectorAll('.rc-frame-imgy').forEach(el => {
    el.addEventListener('input', () => {
      reelFrameImgY = parseInt(el.value);
      const label = el.closest('.rc-frame-png-row')?.querySelector('.rc-frame-imgy-val');
      if (label) label.textContent = el.value + '%';
      redrawFrameOnThumbs();
    });
  });
  container.querySelectorAll('.rc-frame-upload').forEach(btn => {
    btn.addEventListener('click', () => {
      const fi = $('reel-frame-input'); if (!fi) return;
      fi.value = '';
      fi.onchange = (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            reelFrameImgEl = img; reelFrameImgSrc = ev.target.result;
            container.querySelectorAll('.rc-frame-upload').forEach(b => b.textContent = '🖼 PNG loaded');
            window._editorReelFrame = { template: reelFrameTemplate, text: reelFrameText, bgColor: reelFrameBgColor, textColor: reelFrameTextColor, opacity: reelFrameOpacity, imgEl: reelFrameImgEl, imgSrc: reelFrameImgSrc };
            redrawFrameOnThumbs();
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      };
      fi.click();
    });
  });
  // Retry failed variation
  container.querySelectorAll('.reel-retry-var').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.ri);
      const r = results[idx];
      if (!r) return;
      const key = getReelApiKey();
      if (!key) { setStatus('API key required'); return; }
      const origReel = results[0] || r;
      const origText = origReel.words?.map(w => w.word).join(' ') || '';
      const audioLang = r.audioLang || 'original';
      const subtitleLang = r.subtitleLang || 'original';
      btn.textContent = '⏳ Retrying...'; btn.disabled = true;
      try {
        // Subtitle
        let subWords = origReel.words;
        if (subtitleLang !== 'original' && origText) {
          const transBody = { contents: [{ parts: [{ text: `Translate to ${REEL_LANG_OPTIONS[subtitleLang]}. Return ONLY the translated text:\n\n${origText}` }] }] };
          const transData = await callGeminiAPI(getTranscriptionModels(), transBody, key);
          trackCost('textGeneration', 1);
          const transText = transData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (transText) {
            const tw = transText.split(/\s+/);
            const td = origReel.words.length > 0 ? origReel.words[origReel.words.length - 1].end - origReel.words[0].start : 0;
            const wd = td / Math.max(1, tw.length);
            const st = origReel.words.length > 0 ? origReel.words[0].start : 0;
            subWords = tw.map((w, i) => ({ word: w, start: st + i * wd, end: st + (i + 1) * wd }));
          }
        }
        // Audio
        let audioBuffer = origReel.audioBuffer;
        if (audioLang !== 'original' && origText) {
          let ttsText = origText;
          if (audioLang !== 'en') {
            const tb = { contents: [{ parts: [{ text: `Translate to ${REEL_LANG_OPTIONS[audioLang]}. Return ONLY the translated text:\n\n${origText}` }] }] };
            const td2 = await callGeminiAPI(getTranscriptionModels(), tb, key);
            trackCost('textGeneration', 1);
            ttsText = td2.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || origText;
          }
          const ttsModels = getTTSModels();
          const ttsResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${ttsModels[0]}:generateContent?key=${key}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: ttsText }] }],
                generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
              })
            }
          );
          if (ttsResp.ok) {
            const ttsData = await ttsResp.json();
            const part = ttsData.candidates?.[0]?.content?.parts?.[0];
            if (part?.inlineData?.data) {
              const decoded = await decodeBase64Audio(part.inlineData.data, part.inlineData.mimeType || 'audio/wav');
              audioBuffer = decoded.audioBuffer;
              trackCost('ttsPerLang', 1);
              const targetDur = origReel.audioBuffer.duration;
              if (Math.abs(audioBuffer.duration - targetDur) > 0.5) {
                const rate = audioBuffer.duration / targetDur;
                const oc = new OfflineAudioContext(audioBuffer.numberOfChannels, Math.round(targetDur * audioBuffer.sampleRate), audioBuffer.sampleRate);
                const src = oc.createBufferSource(); src.buffer = audioBuffer; src.playbackRate.value = rate; src.connect(oc.destination); src.start();
                audioBuffer = await oc.startRendering();
              }
            }
          }
        }
        // Update result in place
        r.audioBuffer = audioBuffer; r.words = subWords;
        r.audioLangLabel = REEL_LANG_OPTIONS[audioLang];
        r.subtitleLangLabel = REEL_LANG_OPTIONS[subtitleLang];
        window._reelMultiResults[idx] = r;
        renderAllReelPreviews();
        renderOverlayChips();
        setStatus(`Reel ${idx + 1} retry succeeded`);
      } catch(e) {
        console.error('[RetryVar] Failed:', e);
        btn.textContent = '🔄 Retry'; btn.disabled = false;
        setStatus(`Retry failed: ${e.message}`);
      }
    });
  });
  // Export single reel
  container.querySelectorAll('.rc-export').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.ri);
      activeReelPreview = idx;
      const r = results[idx];
      if (r) { reelAudioBuffer = r.audioBuffer; reelScenes = r.scenes; reelWords = r.words; }
      exportSingleReel();
    });
  });
  // Open in editor
  container.querySelectorAll('.rc-editor').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.ri);
      activeReelPreview = idx;
      const r = results[idx];
      if (r) { reelAudioBuffer = r.audioBuffer; reelScenes = r.scenes; reelWords = r.words; }
      openReelInFullEditor();
    });
  });
}

function saveActiveReelSettings() {
  const results = window._reelMultiResults;
  if (!results || !results[activeReelPreview]) return;
  results[activeReelPreview].settings = {
    subtitleStyle: reelSubtitleStyle, transition: reelTransition,
    viewport: reelViewport, viewportX: reelViewportX,
    subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition,
    subFont: reelSubFont, subAllCaps: reelSubAllCaps, subAccent: reelSubAccent,
  };
}

function selectReelPreview(idx) {
  const results = window._reelMultiResults;
  if (!results || !results[idx]) return;
  activeReelPreview = idx;
  const r = results[idx];
  reelAudioBuffer = r.audioBuffer;
  reelScenes = r.scenes;
  reelWords = r.words;
  // Load per-reel settings
  if (r.settings) {
    reelSubtitleStyle = r.settings.subtitleStyle || 'highlight';
    reelTransition = r.settings.transition || 'whip-pan';
    reelViewport = r.settings.viewport || 'fill-center';
    reelViewportX = r.settings.viewportX || 50;
    reelSubColor = r.settings.subColor || '#ffffff';
    reelSubOutline = r.settings.subOutline || '#000000';
    reelSubBackdrop = r.settings.subBackdrop || 'dark';
    reelSubSize = r.settings.subSize || 4;
    reelSubPosition = parseSubPos(r.settings.subPosition ?? 85);
    reelSubFont = r.settings.subFont || 'Poppins';
    reelSubAllCaps = r.settings.subAllCaps !== undefined ? r.settings.subAllCaps : false;
    reelSubAccent = r.settings.subAccent || '#7c3aed';
    // Sync UI controls
    const subStyleEl = $('reel-subtitle-style');
    if (subStyleEl) subStyleEl.value = reelSubtitleStyle;
    const viewEl = $('reel-viewport');
    if (viewEl) viewEl.value = reelViewport;
    const vpxEl = $('reel-viewport-x');
    if (vpxEl) vpxEl.value = reelViewportX;
    const scEl = $('reel-sub-color-preset');
    if (scEl) scEl.value = reelSubColor;
    const soEl = $('reel-sub-outline-preset');
    if (soEl) soEl.value = reelSubOutline;
    const sbEl = $('reel-sub-backdrop-preset');
    if (sbEl) sbEl.value = reelSubBackdrop;
    const ssEl = $('reel-sub-size');
    if (ssEl) ssEl.value = reelSubSize;
    const slEl = $('reel-sub-size-label');
    if (slEl) slEl.textContent = reelSubSize;
    const spEl = $('reel-sub-position');
    if (spEl) spEl.value = subPosToStr(reelSubPosition);
    const spNumEl = $('reel-sub-position-num');
    if (spNumEl) { spNumEl.value = reelSubPosition; const spLbl = $('reel-sub-pos-label'); if (spLbl) spLbl.textContent = reelSubPosition + '%'; }
  }
  renderReelScenes();
  renderReelFrame(0);
  if (reelTimeEl && reelAudioBuffer) reelTimeEl.textContent = `0:00 / ${fmtShort(reelAudioBuffer.duration)}`;
  // Update selected state in UI
  const container = $('reel-all-previews');
  if (container) {
    container.querySelectorAll('.reel-preview-card').forEach(c => c.classList.remove('selected'));
    const card = container.querySelector(`[data-ri="${idx}"]`);
    if (card) card.classList.add('selected');
  }
  const langInfo = r.langLabel && r.langLabel !== 'Original' ? ` (${r.langLabel})` : '';
  setStatus(`Editing Reel ${idx + 1}${langInfo}`);
}

function renderReelScenes() {
  if (!reelSceneList || !reelScenes) return;
  const isVid = reelScenes.some(s => s.isVideo);
  // Style not needed after generation; transition applies to both audio (image scenes) and video
  const editStyleLabel = reelEditStyle ? reelEditStyle.closest('label') : null;
  const editTransLabel = reelEditTransition ? reelEditTransition.closest('label') : null;
  if (editStyleLabel) editStyleLabel.style.display = 'none';
  if (editTransLabel) editTransLabel.style.display = '';
  // Viewport only applies to video mode
  const viewportLabel = $('reel-viewport') ? $('reel-viewport').closest('label') : null;
  const vpCustomLabel = $('reel-viewport-custom-label');
  if (viewportLabel) viewportLabel.style.display = isVid ? '' : 'none';
  if (vpCustomLabel) vpCustomLabel.style.display = 'none';
  // Hide scene list for video mode (no image thumbnails to show)
  if (isVid) { reelSceneList.innerHTML = ''; return; }
  reelSceneList.innerHTML = reelScenes.map((s, i) => `
    <div class="reel-scene-thumb ${i === 0 ? 'active' : ''}" data-reel-scene="${i}">
      ${s.imgDataUrl ? `<img src="${s.imgDataUrl}" alt="Scene ${i+1}">` : '<div style="width:100%;height:100%;background:var(--bg-input);"></div>'}
      <div class="reel-scene-num">${i + 1}</div>
    </div>
  `).join('');
  reelSceneList.querySelectorAll('.reel-scene-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const idx = parseInt(thumb.dataset.reelScene);
      renderReelFrame(reelScenes[idx].startTime);
      reelSceneList.querySelectorAll('.reel-scene-thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });
}

// ── Scene Image Cards (audio/text mode) ──
const reelStepScenes = $('reel-step-scenes');
const reelSceneGrid = $('reel-scene-grid');

function renderReelSceneGrid(scenes) {
  if (!reelSceneGrid) return;
  reelSceneGrid.innerHTML = '';
  reelSelectedSceneIdxs.clear();
  const platform = REEL_PLATFORMS[reelPlatform];
  const ratio = `${platform.width}/${platform.height}`;

  // Group by segmentIndex
  const segIndices = [...new Set(scenes.map(s => s.segmentIndex ?? 0))];
  const hasMultiSeg = segIndices.length > 1;

  // Create per-reel containers stacked vertically
  const reelContainers = {};
  for (const si of segIndices) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'border:1px solid var(--border); border-radius:var(--radius); padding:12px; margin-bottom:16px; background:var(--bg-secondary);';
    if (hasMultiSeg) {
      const title = document.createElement('h4');
      title.style.cssText = 'margin:0 0 10px; font-size:0.9rem; color:var(--text-primary);';
      title.textContent = `Reel ${si + 1}`;
      wrapper.appendChild(title);
    }
    const grid = document.createElement('div');
    grid.className = 'scene-grid';
    wrapper.appendChild(grid);
    reelSceneGrid.appendChild(wrapper);
    reelContainers[si] = grid;
  }

  scenes.forEach((scene, idx) => {
    const card = document.createElement('div');
    card.className = 'scene-card';
    const refThumbHtml = scene.refImageDataUrl ? `<img class="ref-thumb" src="${scene.refImageDataUrl}" alt="Ref">` : '';
    const refLabel = scene.refImageDataUrl ? '✓ Reference set' : '';
    card.innerHTML = `
      <div class="scene-img" id="reel-scene-img-${idx}" style="aspect-ratio:${ratio};">
        ${reelVideoMode === 'animated' && scene.videoUrl
          ? `<video src="${scene.videoUrl}" style="width:100%;aspect-ratio:${ratio};" muted loop autoplay playsinline></video>`
          : scene.imgDataUrl
          ? `<img src="${scene.imgDataUrl}" alt="Scene ${idx + 1}" style="aspect-ratio:${ratio}; cursor:pointer;">`
          : `<div class="scene-img-placeholder" style="aspect-ratio:${ratio};"></div>`}
      </div>
      <div class="scene-body">
        <div class="scene-time">🕐 ${fmtShort(scene.startTime)} – ${fmtShort(scene.endTime)}</div>
        <div class="scene-text" style="max-height:40px; overflow:hidden; color:var(--text-muted); font-size:0.72rem;">"${(scene.text || '').slice(0, 120)}"</div>
        <textarea id="reel-scene-prompt-${idx}" style="width:100%; min-height:50px; font-size:0.72rem; margin-top:4px;">${scene.prompt || scene.sceneDescription || ''}</textarea>
        <div class="scene-actions">
          <button class="btn-regen" style="font-size:0.7rem; padding:3px 10px;">🔄 Regenerate</button>
          <button class="btn-download-img" style="font-size:0.68rem; padding:3px 8px; ${scene.imgDataUrl ? '' : 'display:none;'}">📥 Download</button>
          <button class="btn-ref" style="font-size:0.68rem; padding:3px 8px;">📎 Ref Image</button>
          <input type="file" class="ref-input" accept="image/*" style="display:none;">
          <span class="scene-status ${scene.status || ''}" id="reel-scene-status-${idx}">
            ${scene.status === 'done' ? '✓ Done' : scene.status === 'generating' ? '⏳ Generating...' : scene.status === 'error' ? '✗ Error' : '○ Pending'}
          </span>
        </div>
        <div class="scene-ref-row" id="reel-scene-ref-${idx}" style="display:none;">
          ${refThumbHtml}
          <span class="ref-label">${refLabel}</span>
          <button class="btn-ref-remove" style="font-size:0.62rem; padding:1px 6px; display:none;">✕</button>
        </div>
      </div>`;

    // Regenerate
    card.querySelector('.btn-regen').addEventListener('click', () => reelRegenerateScene(idx));
    // Click image to toggle selection for multi-regen
    const imgArea = card.querySelector('.scene-img');
    imgArea.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      if (reelSelectedSceneIdxs.has(idx)) {
        reelSelectedSceneIdxs.delete(idx);
        card.style.borderColor = '';
        card.style.boxShadow = '';
      } else {
        reelSelectedSceneIdxs.add(idx);
        card.style.borderColor = 'var(--accent)';
        card.style.boxShadow = '0 0 10px var(--accent-glow)';
      }
      updateReelRegenSelectedBtn();
    });
    // Download
    const dlBtn = card.querySelector('.btn-download-img');
    if (dlBtn) dlBtn.addEventListener('click', () => {
      if (!scene.imgDataUrl) return;
      const a = document.createElement('a'); a.href = scene.imgDataUrl; a.download = `stori-reel-scene-${idx + 1}.png`; a.click();
    });
    // Reference image
    const refInput = card.querySelector('.ref-input');
    const btnRef = card.querySelector('.btn-ref');
    const refRow = card.querySelector('.scene-ref-row');
    const btnRefRemove = card.querySelector('.btn-ref-remove');
    btnRef.addEventListener('click', () => refInput.click());
    refInput.addEventListener('change', async () => {
      const file = refInput.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        scene.refImageDataUrl = e.target.result;
        refRow.style.display = '';
        refRow.innerHTML = `<img class="ref-thumb" src="${scene.refImageDataUrl}" alt="Ref"><span class="ref-label">⏳ Analyzing...</span>`;
        try {
          await reelUpdatePromptFromReference(idx, scenes);
          refRow.innerHTML = `<img class="ref-thumb" src="${scene.refImageDataUrl}" alt="Ref"><span class="ref-label" style="color:#10b981;">✓ Prompt updated</span><button class="btn-ref-remove" style="font-size:0.62rem; padding:1px 6px;">✕</button>`;
          refRow.querySelector('.btn-ref-remove').addEventListener('click', () => { scene.refImageDataUrl = null; refRow.style.display = 'none'; });
        } catch (err) {
          refRow.innerHTML = `<img class="ref-thumb" src="${scene.refImageDataUrl}" alt="Ref"><span class="ref-label" style="color:#ef4444;">✗ ${err.message}</span><button class="btn-ref-remove" style="font-size:0.62rem; padding:1px 6px;">✕</button>`;
          refRow.querySelector('.btn-ref-remove').addEventListener('click', () => { scene.refImageDataUrl = null; refRow.style.display = 'none'; });
        }
      };
      reader.readAsDataURL(file);
    });
    if (btnRefRemove) btnRefRemove.addEventListener('click', () => { scene.refImageDataUrl = null; refRow.style.display = 'none'; });
    // Append to correct reel container
    const targetGrid = reelContainers[scene.segmentIndex ?? 0];
    targetGrid.appendChild(card);
  });
}

function updateReelRegenSelectedBtn() {
  let btn = $('btn-reel-regen-selected');
  const container = $('reel-step-scenes');
  if (!container) return;
  const count = reelSelectedSceneIdxs.size;
  if (count === 0) {
    if (btn) btn.style.display = 'none';
    return;
  }
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'btn-reel-regen-selected';
    btn.className = 'primary btn-md';
    btn.style.cssText = 'display:block; margin:12px auto;';
    const grid = $('reel-scene-grid');
    if (grid) grid.after(btn);
    btn.addEventListener('click', () => reelRegenerateSelected());
  }
  const method = count >= 4 ? 'grid' : 'individual';
  const cost = count >= 4 ? '$0.134' : `$${(count * 0.039).toFixed(3)}`;
  btn.textContent = `🔄 Regenerate Selected (${count}) — ${method} mode ~${cost}`;
  btn.style.display = '';
}

async function reelUpdatePromptFromReference(idx, scenes) {
  const scene = scenes[idx];
  if (!scene.refImageDataUrl) return;
  const key = getReelApiKey();
  if (!key) throw new Error('API key required');
  const match = scene.refImageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image');
  const [, mimeType, base64Data] = match;
  const data = await callGeminiAPI(getTranscriptionModels(), {
    contents: [{ parts: [
      { inlineData: { mimeType, data: base64Data } },
      { text: `Analyze this reference image. The generated image should resemble the person/people — same face, features, appearance, clothing. Incorporate visual style and mood.\n\nOriginal scene prompt: "${scene.prompt}"\n\nReturn ONLY the updated prompt text.` }
    ]}]
  }, key);
  const updatedPrompt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (updatedPrompt) {
    scene.prompt = updatedPrompt;
    const textarea = $(`reel-scene-prompt-${idx}`);
    if (textarea) {
      textarea.value = updatedPrompt;
      textarea.style.transition = 'background 0.5s';
      textarea.style.background = 'rgba(16,185,129,0.15)';
      setTimeout(() => { textarea.style.background = ''; }, 2000);
    }
  }
}

let reelSelectedSceneIdxs = new Set();

function reelUpdateSceneCardImage(idx) {
  const imgDiv = $(`reel-scene-img-${idx}`);
  if (!imgDiv || !reelPendingScenes) return;
  const scene = reelPendingScenes[idx];
  const platform = REEL_PLATFORMS[reelPlatform];
  const ratio = `${platform.width}/${platform.height}`;
  if (reelVideoMode === 'animated' && scene.videoUrl) {
    imgDiv.innerHTML = `<video src="${scene.videoUrl}" style="width:100%;aspect-ratio:${ratio};" muted loop autoplay playsinline></video>`;
  } else if (scene.imgDataUrl) {
    imgDiv.innerHTML = `<img src="${scene.imgDataUrl}" alt="Scene ${idx + 1}" style="aspect-ratio:${ratio}; cursor:pointer;">`;
  } else {
    imgDiv.innerHTML = `<div class="scene-img-placeholder" style="aspect-ratio:${ratio};"></div>`;
  }
}

function reelUpdateSceneCardStatus(idx, errorMsg) {
  const statusEl = $(`reel-scene-status-${idx}`);
  if (!statusEl || !reelPendingScenes) return;
  const scene = reelPendingScenes[idx];
  statusEl.className = 'scene-status ' + scene.status;
  statusEl.textContent = scene.status === 'done' ? '✓ Done'
    : scene.status === 'generating' ? '⏳ Generating...'
    : scene.status === 'error' ? `✗ ${errorMsg || 'Error'}`
    : '○ Pending';
  const card = statusEl.closest('.scene-card');
  if (card) {
    const dlBtn = card.querySelector('.btn-download-img');
    if (dlBtn) dlBtn.style.display = scene.imgDataUrl ? '' : 'none';
  }
}

async function reelGenerateSceneImage(idx) {
  const scene = reelPendingScenes[idx];
  const key = getReelApiKey();
  const platform = REEL_PLATFORMS[reelPlatform];
  // Sync prompt from textarea
  const promptEl = $(`reel-scene-prompt-${idx}`);
  if (promptEl) scene.prompt = promptEl.value;
  scene.status = 'generating';
  reelUpdateSceneCardStatus(idx);
  try {
    if (!key) throw new Error('API key required');
    // Build prompt with style and references
    const styleName = reelStyleEl ? reelStyleEl.value : 'cinematic';
    const stylePrompt = STYLE_PRESETS[styleName] || '';
    const hasRefs = (scene.refCharacters && scene.refCharacters.length > 0) || (scene.refEnvironment >= 0);
    const isSpecialStyle = typeof SPECIAL_STYLES !== 'undefined' && SPECIAL_STYLES.includes(styleName);
    let effectivePrompt = hasRefs
      ? buildScenePromptWithRefs(scene, scene.prompt)
      : (stylePrompt ? `Style: ${stylePrompt}. Scene: ${scene.prompt}` : scene.prompt);
    if (isSpecialStyle) {
      effectivePrompt = `Style: ${stylePrompt}. ${scene.prompt} Place the main subject at the center of the image. Fill the entire 9:16 vertical canvas. Do NOT include any text, words, or letters.`;
    } else {
      effectivePrompt += ' STRICT: Do NOT include any text, words, letters in the image. Vertical 9:16 portrait format.';
    }
    const refParts = hasRefs ? getSceneRefImageParts(scene) : [];
    const opts = { width: platform.width, height: platform.height, refImageDataUrl: scene.refImageDataUrl, refParts, aspectRatio: '9:16' };
    const models = getImageModels();
    let imgDataUrl = null, lastError = null;
    for (const model of models) {
      try {
        if (model.startsWith('imagen-')) imgDataUrl = await generateImageImagen(effectivePrompt, key, opts, model);
        else imgDataUrl = await generateImageGeminiFlash(effectivePrompt, key, opts, model);
        if (imgDataUrl) break;
      } catch(e) {
        lastError = e;
        console.warn(`Reel image gen failed for model ${model}:`, e.message);
        continue; // try next model
      }
    }
    if (!imgDataUrl) throw lastError || new Error('Image generation failed');
    scene.imgDataUrl = imgDataUrl;
    scene._img = null; // reset so preview reloads new image
    scene.status = 'done';
    trackCost('imageGen', 1);
    reelUpdateSceneCardImage(idx);
    reelUpdateSceneCardStatus(idx);
    // Update preview canvas if visible
    if (typeof renderAllReelPreviews === 'function' && window._reelMultiResults) {
      renderAllReelPreviews();
    }
  } catch(e) {
    scene.status = 'error';
    reelUpdateSceneCardStatus(idx, friendlyApiError(e.message));
    console.error(`Reel scene ${idx + 1} error:`, e);
  }
}

async function reelRegenerateScene(idx) {
  if (reelVideoMode === 'animated' && reelPendingScenes[idx]?.videoUrl) {
    regenReelSceneVideoCard(idx);
  } else {
    resetReelAgentTasks('image');
    updateReelAgent('image', 'running');
    updateReelAgentTask('image', 'individual', 'running', `Regenerating scene ${idx + 1}…`);
    await reelGenerateSceneImage(idx);
    const doneCount = (reelPendingScenes || []).filter(s => s.imgDataUrl).length;
    const failedCount = (reelPendingScenes || []).filter(s => s.status === 'error').length;
    updateReelAgentTask('image', 'individual', failedCount > 0 ? 'error' : 'done',
      failedCount > 0 ? `${doneCount} done · ${failedCount} failed` : `${doneCount} images ready`);
    if (reelVideoMode === 'animated' && reelPendingScenes[idx]?.imgDataUrl) {
      await reelRunAnimation(null, null, null);
    }
  }
}

async function reelRegenerateSelected() {
  if (reelSelectedSceneIdxs.size === 0 || !reelPendingScenes) return;
  const scenesToRegen = [...reelSelectedSceneIdxs]
    .sort((a, b) => a - b)
    .map(idx => reelPendingScenes[idx])
    .filter(Boolean);
  if (scenesToRegen.length === 0) return;
  for (const s of scenesToRegen) { s.status = 'pending'; }
  reelSelectedSceneIdxs.clear();
  document.querySelectorAll('.scene-card').forEach(c => { c.style.borderColor = ''; c.style.boxShadow = ''; });
  updateReelRegenSelectedBtn();
  await reelRunImageGeneration(scenesToRegen);
}

async function reelRunAnimation(barEl, labelEl, progressEl) {
  if (reelVideoMode !== 'animated' || typeof animateScenes !== 'function') return;
  const scenesWithImages = reelPendingScenes.filter(s => s.imgDataUrl);
  if (!scenesWithImages.length) return;
  if (barEl) barEl.style.width = '50%';
  if (labelEl) labelEl.textContent = 'Animating scenes…';
  if (progressEl) progressEl.style.display = '';
  resetReelAgentTasks('animation');
  updateReelAgent('animation', 'running');
  updateReelAgentTask('animation', 'animate', 'running', `0/${scenesWithImages.length} clips…`);
  try {
    await animateScenes(scenesWithImages, (done, total, label) => {
      if (barEl) barEl.style.width = (50 + Math.round((done / total) * 50)) + '%';
      if (labelEl) labelEl.textContent = label;
      updateReelAgentTask('animation', 'animate', 'running', label);
    }, getReelApiKey());
    reelPendingScenes.forEach((_, i) => reelUpdateSceneCardImage(i));
    if (labelEl) labelEl.textContent = `Done! ${scenesWithImages.length} scenes animated.`;
    renderReelVideoCards();
    updateReelAgentTask('animation', 'animate', 'done', `${scenesWithImages.length} clips animated`);
  } catch (animErr) {
    if (labelEl) { labelEl.textContent = `Animation error: ${animErr.message}`; labelEl.style.color = '#ef4444'; }
    updateReelAgentTask('animation', 'animate', 'error', animErr.message);
  }
  setTimeout(() => { if (progressEl) progressEl.style.display = 'none'; }, 4000);
}

// ── Reel Animated Video Cards ──

function renderReelVideoCards() {
  const grid = $('reel-video-grid-inner');
  const wrapper = $('reel-video-grid');
  if (!grid || !wrapper || !reelPendingScenes) return;
  const platform = REEL_PLATFORMS[reelPlatform];
  const ratio = platform ? `${platform.width}/${platform.height}` : '9/16';
  grid.innerHTML = '';
  reelPendingScenes.forEach((scene, idx) => {
    const hasVideo = !!scene.videoUrl;
    const card = document.createElement('div');
    card.className = 'scene-card';
    card.id = `reel-video-card-${idx}`;
    card.innerHTML = `
      <div class="scene-card-img" id="reel-video-img-${idx}" style="aspect-ratio:${ratio}; background:#111;">
        ${hasVideo
          ? `<video id="reel-video-el-${idx}" src="${scene.videoUrl}" style="width:100%;height:100%;object-fit:cover;" muted playsinline preload="metadata"></video>`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#666;font-size:0.75rem;">${scene.status === 'error' ? 'Failed' : 'No video'}</div>`}
      </div>
      <div style="padding:6px 8px;">
        <div style="display:flex; gap:4px; align-items:center; margin-bottom:4px;">
          <button class="btn-xs" onclick="reelVideoPlay(${idx})">▶</button>
          <button class="btn-xs" onclick="reelVideoPause(${idx})">⏸</button>
          <button class="btn-xs" onclick="reelVideoStop(${idx})">⏹</button>
          <span id="reel-video-time-${idx}" style="font-size:0.65rem; color:#aaa; margin-left:4px;">0:00</span>
        </div>
        <input type="range" id="reel-video-seek-${idx}" min="0" max="1000" value="0"
          style="width:100%; margin-bottom:4px; cursor:pointer;"
          oninput="reelVideoSeek(${idx}, this.value)">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.68rem; color:#888;">Scene ${idx + 1}</span>
          <button class="btn-xs danger" onclick="regenReelSceneVideoCard(${idx})">🔄 Regen</button>
        </div>
      </div>`;
    grid.appendChild(card);
    if (hasVideo) wireReelVideoCard(idx);
  });
  wrapper.style.display = '';
  const regenAllBtn = $('btn-reel-regen-all-videos');
  if (regenAllBtn) {
    regenAllBtn.style.display = '';
    regenAllBtn.onclick = async () => {
      const failed = reelPendingScenes.map((s, i) => i).filter(i => !reelPendingScenes[i].videoUrl);
      for (const idx of failed) await regenReelSceneVideoCard(idx);
    };
  }
}

function wireReelVideoCard(idx) {
  const videoEl = $(`reel-video-el-${idx}`);
  const seekEl = $(`reel-video-seek-${idx}`);
  const timeEl = $(`reel-video-time-${idx}`);
  if (!videoEl) return;
  videoEl.ontimeupdate = () => {
    if (!videoEl.duration) return;
    if (seekEl) seekEl.value = Math.round((videoEl.currentTime / videoEl.duration) * 1000);
    if (timeEl) timeEl.textContent = fmtShort(videoEl.currentTime);
  };
}

function reelVideoPlay(idx) { const v = $(`reel-video-el-${idx}`); if (v) v.play().catch(() => {}); }
function reelVideoPause(idx) { const v = $(`reel-video-el-${idx}`); if (v) v.pause(); }
function reelVideoStop(idx) { const v = $(`reel-video-el-${idx}`); if (v) { v.pause(); v.currentTime = 0; } }
function reelVideoSeek(idx, val) { const v = $(`reel-video-el-${idx}`); if (v && v.duration) v.currentTime = (val / 1000) * v.duration; }

async function regenReelSceneVideoCard(idx) {
  if (!reelPendingScenes) return;
  const scene = reelPendingScenes[idx];
  scene.videoUrl = null;
  const imgDiv = $(`reel-video-img-${idx}`);
  if (imgDiv) imgDiv.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:0.72rem;">Regenerating…</div>`;
  try {
    if (typeof reelGenerateSceneImage === 'function') {
      resetReelAgentTasks('image');
      updateReelAgent('image', 'running');
      updateReelAgentTask('image', 'individual', 'running', `Regenerating scene ${idx + 1}…`);
      await reelGenerateSceneImage(idx);
      const doneCount = reelPendingScenes.filter(s => s.imgDataUrl).length;
      const failedCount = reelPendingScenes.filter(s => s.status === 'error').length;
      updateReelAgentTask('image', 'individual', failedCount > 0 ? 'error' : 'done',
        failedCount > 0 ? `${doneCount} done · ${failedCount} failed` : `${doneCount} images ready`);
    }
    if (scene.imgDataUrl && reelVideoMode === 'animated' && typeof animateScenes === 'function') {
      if (imgDiv) imgDiv.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:0.72rem;">Animating…</div>`;
      scene.videoUrl = null;
      scene.videoClips = null;
      resetReelAgentTasks('animation');
      updateReelAgent('animation', 'running');
      updateReelAgentTask('animation', 'animate', 'running', `Animating scene ${idx + 1}…`);
      await animateScenes([scene], () => {}, getReelApiKey());
      const animatedCount = reelPendingScenes.filter(s => s.videoUrl).length;
      updateReelAgentTask('animation', 'animate', 'done', `${animatedCount} clips ready`);
    }
  } catch (e) {
    if (imgDiv) imgDiv.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#e44;font-size:0.72rem;">Failed</div>`;
    return;
  }
  const platform = REEL_PLATFORMS[reelPlatform];
  const ratio = platform ? `${platform.width}/${platform.height}` : '9/16';
  if (imgDiv && scene.videoUrl) {
    imgDiv.innerHTML = `<video id="reel-video-el-${idx}" src="${scene.videoUrl}" style="width:100%;height:100%;object-fit:cover;" muted playsinline preload="metadata"></video>`;
    wireReelVideoCard(idx);
  } else if (imgDiv) {
    imgDiv.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#e44;font-size:0.72rem;">No video</div>`;
  }
}

async function reelRunImageGeneration(scenesToGen) {
  const btnGenImages = $('btn-reel-gen-images');
  const btnRetry = $('btn-reel-retry-images');
  const btnPause = $('btn-reel-pause-images');
  const btnContinue = $('btn-reel-scenes-continue');
  // Progress shown exclusively in agent sidebar — not in individual step sections
  const progressEl = null;
  const barEl = null;
  const labelEl = null;

  if (btnGenImages) btnGenImages.disabled = true;
  if (btnRetry) btnRetry.style.display = 'none';
  if (btnPause) { btnPause.style.display = ''; btnPause.textContent = '⏸ Pause'; }
  reelGenImagesPaused = false;
  reelGenImagesRunning = true;
  resetReelAgentTasks('image');
  updateReelAgent('image', 'running');
  // Show BGM step early so panel click can scroll to it
  const _bgmStepEl = $('reel-step-bgm');
  if (_bgmStepEl) { _bgmStepEl.classList.remove('hidden'); }
  const total = scenesToGen.length;

  // Grid mode: 4+ scenes without reference images → single grid API call (saves ~50% cost)
  // Skip grid for special styles — use individual Flash 2.5 generation instead
  const hasRefs = scenesToGen.some(s => s.refImageDataUrl || (s.refCharacters && s.refCharacters.length > 0));
  const styleName = reelStyleEl ? reelStyleEl.value : 'cinematic';
  const isSkipStyle = typeof SPECIAL_STYLES !== 'undefined' && SPECIAL_STYLES.includes(styleName);
  console.log('[Grid] Routing check: total=', total, 'hasRefs=', hasRefs, 'style=', styleName, 'isSkipStyle=', isSkipStyle, 'generateGridImage=', typeof generateGridImage);
  if (total >= 4 && !hasRefs && !isSkipStyle && typeof generateGridImage === 'function') {
    const stylePrompt = (typeof STYLE_PRESETS !== 'undefined' && STYLE_PRESETS[styleName]) || '';
    const prompts = scenesToGen.map(s => {
      const idx = reelPendingScenes.indexOf(s);
      const promptEl = $(`reel-scene-prompt-${idx}`);
      if (promptEl) s.prompt = promptEl.value;
      return s.prompt || s.text || 'A cinematic scene';
    });
    const key = getReelApiKey();
    try {
      if (labelEl) labelEl.textContent = `Generating ${total} images in grid mode...`;
      if (barEl) barEl.style.width = '30%';
      updateReelAgentTask('image', 'generate', 'running', `Generating ${total} images…`);
      const gridDataUrl = await generateGridImage(prompts, key, stylePrompt, undefined, 'portrait format (9:16 aspect ratio)');
      if (barEl) barEl.style.width = '50%';
      updateReelAgentTask('image', 'generate', 'done', `${total} images generated`);
      updateReelAgentTask('image', 'upscale', 'running', 'Upscaling images…');
      // Pro returns 2K → upscale 2x to 4K → crop cells
      const cells = await reelUpscaleAndCrop(gridDataUrl, 2, 3, 3, total, barEl, labelEl, 'Pro 2K');
      for (let gi = 0; gi < cells.length; gi++) {
        const scene = scenesToGen[gi];
        const idx = reelPendingScenes.indexOf(scene);
        scene.imgDataUrl = cells[gi];
        scene._img = null;
        scene.status = 'done';
        reelUpdateSceneCardImage(idx);
        reelUpdateSceneCardStatus(idx);
      }
      trackCost('gridGen2K', 1);
      reelGenImagesRunning = false;
      if (btnPause) btnPause.style.display = 'none';
      if (labelEl) labelEl.textContent = `Done! ${cells.length} images generated (grid mode — $0.134 vs $${(total * 0.039).toFixed(3)} individual).`;
      if (btnGenImages) btnGenImages.disabled = false;
      updateReelAgentTask('image', 'upscale', 'done', `${cells.length} images ready`);
      await reelRunAnimation(barEl, labelEl, progressEl);
      if (barEl) barEl.style.width = '100%';
      autoPickBgm().catch(e => console.warn('[BGM] autoPickBgm error:', e));
      return;
    } catch(gridErr) {
      console.error('[Grid] Pro grid failed:', gridErr.message);
      if (labelEl) labelEl.textContent = 'Pro failed, trying 3.1 Flash 2K grid...';
      try {
        // Fallback 1: gemini-3.1-flash-image-preview at 2K → upscale 2K→4K
        updateReelAgentTask('image', 'generate', 'running', `Generating ${total} images…`);
        const fbGrid = await generateGridImage(prompts, key, stylePrompt, 'gemini-3.1-flash-image-preview', 'portrait format (9:16 aspect ratio)');
        updateReelAgentTask('image', 'generate', 'done', `${total} images generated`);
        updateReelAgentTask('image', 'upscale', 'running', 'Upscaling images…');
        const fbCells = await reelUpscaleAndCrop(fbGrid, 2, 3, 3, total, barEl, labelEl, '3.1 Flash 2K');
        for (let gi = 0; gi < fbCells.length; gi++) {
          const scene = scenesToGen[gi]; const idx = reelPendingScenes.indexOf(scene);
          scene.imgDataUrl = fbCells[gi]; scene._img = null; scene.status = 'done';
          reelUpdateSceneCardImage(idx); reelUpdateSceneCardStatus(idx);
        }
        trackCost('gridGen2K', 1);
        reelGenImagesRunning = false;
        if (btnPause) btnPause.style.display = 'none';
        if (labelEl) labelEl.textContent = `Done! ${fbCells.length} images (3.1 Flash grid — $0.101).`;
        if (btnGenImages) btnGenImages.disabled = false;
        updateReelAgentTask('image', 'upscale', 'done', `${fbCells.length} images ready`);
        await reelRunAnimation(barEl, labelEl, progressEl);
        if (barEl) barEl.style.width = '100%';
        autoPickBgm().catch(e => console.warn('[BGM] autoPickBgm error:', e));
        return;
      } catch(fb1Err) {
        console.error('[Grid] 3.1 Flash grid failed:', fb1Err.message);
        if (labelEl) labelEl.textContent = '3.1 Flash failed, trying 2.5 Flash 1K grid...';
        try {
          // Fallback 2: gemini-2.5-flash-image at 1K → upscale 1K→2K
          updateReelAgentTask('image', 'generate', 'running', `Generating ${total} images…`);
          const fbGrid2 = await generateGridImage(prompts, key, stylePrompt, 'gemini-2.5-flash-image', 'portrait format (9:16 aspect ratio)');
          updateReelAgentTask('image', 'generate', 'done', `${total} images generated`);
          updateReelAgentTask('image', 'upscale', 'running', 'Upscaling images…');
          const fbCells2 = await reelUpscaleAndCrop(fbGrid2, 2, 3, 3, total, barEl, labelEl, '2.5 Flash 1K');
          for (let gi = 0; gi < fbCells2.length; gi++) {
            const scene = scenesToGen[gi]; const idx = reelPendingScenes.indexOf(scene);
            scene.imgDataUrl = fbCells2[gi]; scene._img = null; scene.status = 'done';
            reelUpdateSceneCardImage(idx); reelUpdateSceneCardStatus(idx);
          }
          trackCost('imageGen', 1);
          reelGenImagesRunning = false;
          if (btnPause) btnPause.style.display = 'none';
          if (labelEl) labelEl.textContent = `Done! ${fbCells2.length} images (2.5 Flash grid — $0.039).`;
          if (btnGenImages) btnGenImages.disabled = false;
          updateReelAgentTask('image', 'upscale', 'done', `${fbCells2.length} images ready`);
          await reelRunAnimation(barEl, labelEl, progressEl);
          if (barEl) barEl.style.width = '100%';
          autoPickBgm().catch(e => console.warn('[BGM] autoPickBgm error:', e));
          return;
        } catch(fb2Err) {
          console.error('[Grid] All grid attempts failed, falling back to individual:', fb2Err.message);
          if (labelEl) labelEl.textContent = 'All grids failed, generating individually...';
        }
      }
    }
  }

  for (let i = 0; i < total; i++) {
    if (reelGenImagesPaused) {
      const doneNow = reelPendingScenes.filter(s => s.status === 'done').length;
      if (labelEl) { labelEl.textContent = `Paused — ${doneNow} done, ${total - i} remaining.`; labelEl.style.color = '#f59e0b'; }
      await new Promise(resolve => {
        const check = () => { if (!reelGenImagesPaused || !reelGenImagesRunning) { resolve(); return; } setTimeout(check, 200); };
        check();
      });
      if (!reelGenImagesRunning) break;
      if (labelEl) labelEl.style.color = '';
    }
    const idx = reelPendingScenes.indexOf(scenesToGen[i]);
    if (barEl) barEl.style.width = Math.round((i / total) * 100) + '%';
    if (labelEl) labelEl.textContent = `Generating image ${i + 1} of ${total}...`;
    updateReelAgentTask('image', 'individual', 'running', `Image ${i + 1}/${total}…`);
    await reelGenerateSceneImage(idx);
  }

  reelGenImagesRunning = false;
  if (btnPause) btnPause.style.display = 'none';
  if (barEl) barEl.style.width = '100%';
  const doneCount = reelPendingScenes.filter(s => s.status === 'done').length;
  const failedCount = reelPendingScenes.filter(s => s.status === 'error' || s.status === 'pending').length;
  if (failedCount > 0) {
    if (labelEl) { labelEl.textContent = `${doneCount}/${reelPendingScenes.length} generated, ${failedCount} remaining.`; labelEl.style.color = '#f59e0b'; }
    if (btnRetry) { btnRetry.style.display = ''; btnRetry.textContent = `🔄 Retry ${failedCount} Remaining`; }
  } else {
    if (labelEl) labelEl.textContent = `Done! All ${doneCount} images generated.`;
    setTimeout(() => { if (progressEl) progressEl.style.display = 'none'; }, 3000);
  }
  if (btnGenImages) btnGenImages.disabled = false;
  if (btnContinue) btnContinue.style.display = '';
  updateReelAgentTask('image', 'individual', failedCount > 0 ? 'error' : 'done', failedCount > 0 ? `${doneCount} done · ${failedCount} failed` : `${doneCount} images ready`);

  await reelRunAnimation(barEl, labelEl, progressEl);

  // Auto-generate BGM with Lyria 3 after images (and animation) are ready
  autoPickBgm().catch(e => console.warn('[BGM] autoPickBgm error:', e));
}

async function reelBuildVariationsAndPreview() {
  // Job queue path: build results directly from jobs
  if (reelJobs.filter(j => j.type === 'segment').length > 0) {
    const jobSettings = { subtitleStyle: reelSubtitleStyle, transition: reelTransition, viewport: reelViewport, viewportX: reelViewportX, subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition, subFont: reelSubFont, subAllCaps: reelSubAllCaps, subAccent: reelSubAccent };
    const activeJobs = reelJobs.filter(j => j.scenes && j.scenes.length > 0);
    if (activeJobs.length === 0) { setStatus('No scenes yet — wait for transcription'); return; }

    // Apply base variation subtitle language to segment jobs (variation jobs already have their own subtitleLang)
    const baseSubLang = reelVariationRows[0]?.subtitle || 'original';
    const segTranslationMap = new Map(); // job.id → translatedWords
    if (baseSubLang !== 'original') {
      const tKey = getReelApiKey();
      for (const job of activeJobs) {
        if (job.type !== 'segment') continue;
        const origText = job.words.map(w => w.word).join(' ');
        if (!origText) continue;
        try {
          setStatus(`Translating subtitle to ${REEL_LANG_OPTIONS[baseSubLang]}...`, true);
          const transBody = { contents: [{ parts: [{ text: `Translate to ${REEL_LANG_OPTIONS[baseSubLang]}. Return ONLY the translated text:\n\n${origText}` }] }] };
          const transData = await callGeminiAPI(getTranscriptionModels(), transBody, tKey);
          trackCost('textGeneration', 1);
          const translated = transData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (translated) {
            const tw = translated.split(/\s+/);
            const tDur = job.words.length > 0 ? job.words[job.words.length - 1].end - job.words[0].start : 0;
            const wD = tDur / Math.max(1, tw.length);
            const tSt = job.words.length > 0 ? job.words[0].start : 0;
            segTranslationMap.set(job.id, tw.map((w, i) => ({ word: w, start: tSt + i * wD, end: tSt + (i + 1) * wD })));
          }
        } catch(e) { console.warn('[ReelSub] Translation failed:', e.message); }
      }
    }

    window._reelMultiResults = activeJobs.map(job => {
      const isSegJob = job.type === 'segment';
      const effSubLang = isSegJob ? baseSubLang : job.subtitleLang;
      const effWords = (isSegJob && segTranslationMap.get(job.id)) ? segTranslationMap.get(job.id) : job.words;
      return {
        audioBuffer: job.audioBuffer,
        scenes: job.scenes,
        words: effWords,
        videoStart: job.segStart, videoEnd: job.segEnd,
        audioLang: job.audioLang, subtitleLang: effSubLang,
        audioLangLabel: REEL_LANG_OPTIONS[job.audioLang] || 'Original',
        subtitleLangLabel: REEL_LANG_OPTIONS[effSubLang] || 'Original',
        lang: effSubLang, langLabel: REEL_LANG_OPTIONS[effSubLang] || 'Original',
        segmentIndex: job.id,
        settings: { ...jobSettings, subtitleStyle: job.subtitleStyle, transition: job.transition, subColor: job.subColor, subOutline: job.subOutline, subBackdrop: job.subBackdrop, subSize: job.subSize, subPosition: job.subPosition },
      };
    });
    activeReelPreview = 0;
    reelAudioBuffer = window._reelMultiResults[0].audioBuffer;
    reelScenes = window._reelMultiResults[0].scenes;
    reelWords = window._reelMultiResults[0].words;
    showReelEditorStep();
    renderReelScenes();
    // Pre-load all scene images before showing preview (mirrors the non-job path)
    const jobSceneImgs = window._reelMultiResults.flatMap(r => r.scenes).filter(s => s.imgDataUrl && !s._img);
    if (jobSceneImgs.length > 0) {
      await Promise.all(jobSceneImgs.map(s => new Promise(res => {
        s._img = new Image();
        s._img.onload = s._img.onerror = res;
        s._img.src = s.imgDataUrl;
      })));
    }
    renderReelFrame(0);
    renderAllReelPreviews();
    setStatus(`${window._reelMultiResults.length} Reel(s) ready`);
    return;
  }

  // Use pending scenes if available (audio/text mode with scene cards)
  if (reelPendingScenes) {
    // Reassign scenes back to multi-seg results if they came from there
    if (window._reelMultiSegResults) {
      for (const r of window._reelMultiSegResults) {
        r.scenes = r.scenes.map(s => reelPendingScenes.find(ps => ps === s) || s);
      }
    }
    reelScenes = reelPendingScenes;
  }

  // Multi-segment: build results from each segment
  const multiSegResults = window._reelMultiSegResults;
  const origReels = multiSegResults && multiSegResults.length > 0 ? multiSegResults : null;

  if (!origReels && (!reelAudioBuffer || !reelScenes)) { setStatus('Nothing to preview'); return; }
  const key = getReelApiKey();
  if (!key) { setStatus('API key required'); return; }

  setStatus('Building variations...', true);

  try {
    const allResults = [];
    const settings = { subtitleStyle: reelSubtitleStyle, transition: reelTransition, viewport: reelViewport, viewportX: reelViewportX, subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition, subFont: reelSubFont, subAllCaps: reelSubAllCaps, subAccent: reelSubAccent };

    // Build list of base reels (one per segment, or just one for single)
    const baseReels = origReels || [{
      audioBuffer: reelAudioBuffer, scenes: reelScenes, words: reelWords,
      videoStart: 0, videoEnd: reelAudioBuffer.duration, segmentIndex: 0, settings,
    }];
    for (const origReel of baseReels) {
      const origText = origReel.words?.map(w => w.word).join(' ') || '';
      const translationCache = {};
      const ttsCache = {};
      const si = origReel.segmentIndex || 0;

      for (const v of reelVariationRows) {
        const isOrigAudio = v.audio === 'original';
        const isOrigSub = v.subtitle === 'original';
        let subWords = origReel.words;
        if (!isOrigSub && origText) {
          const cKey = `sub_${v.subtitle}`;
          if (!translationCache[cKey]) {
            setStatus(`Reel ${si + 1}: Translating subtitle to ${REEL_LANG_OPTIONS[v.subtitle]}...`, true);
            try {
              const transBody = { contents: [{ parts: [{ text: `Translate to ${REEL_LANG_OPTIONS[v.subtitle]}. Return ONLY the translated text:\n\n${origText}` }] }] };
              const transData = await callGeminiAPI(getTranscriptionModels(), transBody, key);
              trackCost('textGeneration', 1);
              translationCache[cKey] = transData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            } catch(e) { setStatus(`${REEL_LANG_OPTIONS[v.subtitle]} subtitle failed`); }
          }
          if (translationCache[cKey]) {
            const transWords = translationCache[cKey].split(/\s+/);
            const totalDur = origReel.words.length > 0 ? origReel.words[origReel.words.length - 1].end - origReel.words[0].start : 0;
            const wDur = totalDur / Math.max(1, transWords.length);
            const st = origReel.words.length > 0 ? origReel.words[0].start : 0;
            subWords = transWords.map((w, i) => ({ word: w, start: st + i * wDur, end: st + (i + 1) * wDur }));
          }
        }
        let audioBuffer = origReel.audioBuffer;
        if (!isOrigAudio && origText) {
          const tKey = `tts_${v.audio}`;
          if (!ttsCache[tKey]) {
            const ttsCKey = `sub_${v.audio}`;
            let ttsText = translationCache[ttsCKey];
            if (!ttsText) {
              setStatus(`Reel ${si + 1}: Translating audio to ${REEL_LANG_OPTIONS[v.audio]}...`, true);
              try {
                const targetDur = origReel.audioBuffer.duration;
                const transBody = { contents: [{ parts: [{ text: `Translate the following to ${REEL_LANG_OPTIONS[v.audio]}. The original audio is ${Math.round(targetDur)} seconds long. Keep the translation concise enough to be spoken in approximately the same duration. Return ONLY the translated text:\n\n${origText}` }] }] };
                const transData = await callGeminiAPI(getTranscriptionModels(), transBody, key);
                trackCost('textGeneration', 1);
                ttsText = transData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                translationCache[ttsCKey] = ttsText;
              } catch(e) { setStatus(`${REEL_LANG_OPTIONS[v.audio]} translation failed`); }
            }
            if (ttsText) {
              setStatus(`Reel ${si + 1}: Generating ${REEL_LANG_OPTIONS[v.audio]} audio...`, true);
              try {
                const ttsModels = getTTSModels();
                const ttsResp = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/${ttsModels[0]}:generateContent?key=${key}`,
                  { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: ttsText }] }],
                      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
                    })
                  }
                );
                if (ttsResp.ok) {
                  const ttsData = await ttsResp.json();
                  const part = ttsData.candidates?.[0]?.content?.parts?.[0];
                  if (part?.inlineData?.data) {
                    const decoded = await decodeBase64Audio(part.inlineData.data, part.inlineData.mimeType || 'audio/wav');
                    ttsCache[tKey] = decoded.audioBuffer;
                    trackCost('ttsPerLang', 1);
                  }
                }
              } catch(e) { setStatus(`${REEL_LANG_OPTIONS[v.audio]} TTS failed`); }
            }
          }
          if (ttsCache[tKey]) {
            audioBuffer = ttsCache[tKey];
            const targetDur = origReel.audioBuffer.duration;
            if (Math.abs(audioBuffer.duration - targetDur) > 0.5) {
              const rate = audioBuffer.duration / targetDur;
              const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, Math.round(targetDur * audioBuffer.sampleRate), audioBuffer.sampleRate);
              const src = offlineCtx.createBufferSource();
              src.buffer = audioBuffer;
              src.playbackRate.value = rate;
              src.connect(offlineCtx.destination);
              src.start();
              audioBuffer = await offlineCtx.startRendering();
              ttsCache[tKey] = audioBuffer;
            }
          }
        }
        allResults.push({
          audioBuffer, scenes: origReel.scenes, words: subWords,
          videoStart: origReel.videoStart || 0, videoEnd: origReel.videoEnd || audioBuffer.duration,
          audioLang: v.audio, subtitleLang: v.subtitle,
          audioLangLabel: REEL_LANG_OPTIONS[v.audio],
          subtitleLangLabel: REEL_LANG_OPTIONS[v.subtitle],
          lang: v.subtitle, langLabel: REEL_LANG_OPTIONS[v.subtitle],
          segmentIndex: si,
          settings: { ...(origReel.settings || settings) },
        });
      }
    }

    window._reelMultiResults = allResults;
    activeReelPreview = 0;
    if (allResults.length > 0) {
      reelAudioBuffer = allResults[0].audioBuffer;
      reelScenes = allResults[0].scenes;
      reelWords = allResults[0].words;
    }
  } catch(e) {
    console.error('[ReelGen] Variation error:', e);
    setStatus('Variation generation failed: ' + friendlyApiError(e.message));
  }

  // Show preview — outside try/catch so _reelMultiResults is always set
  const allResults2 = window._reelMultiResults;
  if (allResults2 && allResults2.length > 0) {
    showReelEditorStep();
    renderReelScenes();
    // Pre-load all scene images
    const allSceneImgs = allResults2.flatMap(r => r.scenes).filter(s => s.imgDataUrl && !s._img);
    await Promise.all(allSceneImgs.map(s => new Promise(res => {
      s._img = new Image();
      s._img.onload = s._img.onerror = res;
      s._img.src = s.imgDataUrl;
    })));
    renderReelFrame(0);
    renderAllReelPreviews();
    reelGenerateStatus.textContent = `${allResults2.length} Reel(s) ready`;
    setStatus(`${allResults2.length} Reel(s) ready`);
  }
}

// ── Scene Image Button Handlers ──
const btnReelGenImages = $('btn-reel-gen-images');
const btnReelRetryImages = $('btn-reel-retry-images');
const btnReelPauseImages = $('btn-reel-pause-images');
const btnReelSkipImages = $('btn-reel-skip-images');
const btnReelScenesContinue = $('btn-reel-scenes-continue');

if (btnReelGenImages) btnReelGenImages.addEventListener('click', () => {
  if (!reelPendingScenes || reelPendingScenes.length === 0) return;
  reelRunImageGeneration(reelPendingScenes.filter(s => s.status !== 'done'));
});
if (btnReelRetryImages) btnReelRetryImages.addEventListener('click', () => {
  if (!reelPendingScenes) return;
  reelRunImageGeneration(reelPendingScenes.filter(s => s.status === 'error' || s.status === 'pending'));
});
if (btnReelPauseImages) btnReelPauseImages.addEventListener('click', () => {
  reelGenImagesPaused = !reelGenImagesPaused;
  btnReelPauseImages.textContent = reelGenImagesPaused ? '▶ Resume' : '⏸ Pause';
});
if (btnReelSkipImages) btnReelSkipImages.addEventListener('click', () => {
  reelBuildVariationsAndPreview();
});
if (btnReelScenesContinue) btnReelScenesContinue.addEventListener('click', () => {
  reelBuildVariationsAndPreview();
});

function renderReelFrame(time) {
  if (!reelCanvas || !reelScenes) return;
  const platform = REEL_PLATFORMS[reelPlatform];
  reelCanvas.width = platform.width;
  reelCanvas.height = platform.height;
  const ctx = reelCanvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, platform.width, platform.height);

  const activeResult = window._reelMultiResults ? window._reelMultiResults[activeReelPreview] : null;
  const t = Math.max(0.01, time);

  // Debug: log state on first render
  if (time === 0 || time === 0.01) {
    console.log('[ReelFrame] scenes:', reelScenes?.length, 'words:', reelWords?.length,
      'videoEl:', !!reelVideoEl, 'videoW:', reelVideoEl?.videoWidth, 'videoH:', reelVideoEl?.videoHeight,
      'viewport:', reelViewport, 'subStyle:', reelSubtitleStyle);
  }

  // Find scene at time
  const scene = reelScenes.find(s => t >= s.startTime && t < s.endTime);
  if (scene) {
    if (scene.isVideo && reelVideoEl) {
      // Video mode: seek and draw
      const vidOffset = activeResult ? activeResult.videoStart : 0;
      const seekTime = vidOffset + t;
      reelVideoEl.currentTime = seekTime;
      // Draw immediately — if frame not ready, try again after seek
      const drawIt = () => {
        const vp = activeResult?.settings?.viewport || reelViewport;
        const vpx = activeResult?.settings?.viewportX ?? reelViewportX;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, platform.width, platform.height);
        try { drawViewportCrop(ctx, reelVideoEl, platform.width, platform.height, vp, vpx); } catch(e) {
          try { drawCoverFit(ctx, reelVideoEl, platform.width, platform.height); } catch(e2) {}
        }
        drawReelSubtitles(ctx, platform, t);
        drawReelFrame(ctx, platform.width, platform.height);
        drawReelOverlays(ctx, platform.width, platform.height, t);
      };
      drawIt();
      // Also draw again after seek completes for accuracy
      reelVideoEl.onseeked = () => { reelVideoEl.onseeked = null; drawIt(); };
    } else if (scene.imgDataUrl) {
      if (!scene._img) {
        scene._img = new Image();
        scene._img.src = scene.imgDataUrl;
      }
      if (scene._img.naturalWidth > 0) {
        try { drawCoverFit(ctx, scene._img, platform.width, platform.height); } catch(e) { console.error('[Reel] drawCoverFit error:', e); }
      }
      drawReelSubtitles(ctx, platform, t);
      drawReelFrame(ctx, platform.width, platform.height);
      drawReelOverlays(ctx, platform.width, platform.height, t);
    } else {
      drawReelSubtitles(ctx, platform, t);
      drawReelFrame(ctx, platform.width, platform.height);
      drawReelOverlays(ctx, platform.width, platform.height, t);
    }
  } else {
    drawReelSubtitles(ctx, platform, t);
    drawReelFrame(ctx, platform.width, platform.height);
    drawReelOverlays(ctx, platform.width, platform.height, t);
  }
}

function drawReelVideoFrame(ctx, platform, activeResult) {
  const vp = activeResult?.settings?.viewport || reelViewport;
  const vpx = activeResult?.settings?.viewportX ?? reelViewportX;
  try {
    drawViewportCrop(ctx, reelVideoEl, platform.width, platform.height, vp, vpx);
  } catch(e) {
    try { drawCoverFit(ctx, reelVideoEl, platform.width, platform.height); } catch(e2) {}
  }
}

function drawReelSubtitles(ctx, platform, time) {
  const subStyleEl = $('reel-subtitle-style');
  const currentSubStyle = subStyleEl ? subStyleEl.value : reelSubtitleStyle;
  if (currentSubStyle !== 'none' && reelWords && reelWords.length > 0) {
    renderReelSubtitle(ctx, platform.width, platform.height, time, reelWords, currentSubStyle);
  }
}

function drawReelFrame(ctx, cw, ch) {
  if (reelFrameTemplate === 'none') return;
  ctx.save();
  ctx.globalAlpha = reelFrameOpacity;
  if (reelFrameTemplate === 'custom-png') {
    if (reelFrameImgEl) {
      const imgW = cw * (reelFrameImgW / 100);
      const imgH = imgW * (reelFrameImgEl.naturalHeight / reelFrameImgEl.naturalWidth);
      const imgX = cw * (reelFrameImgX / 100);
      const imgY = ch * (reelFrameImgY / 100);
      ctx.drawImage(reelFrameImgEl, imgX, imgY, imgW, imgH);
    }
  } else {
    const text = reelFrameText;
    const bg = reelFrameBgColor;
    const tc = reelFrameTextColor;
    if (reelFrameTemplate === 'bottom-strip') {
      const h = Math.round(ch * 0.10);
      ctx.fillStyle = bg;
      ctx.fillRect(0, ch - h, cw, h);
      if (text) {
        const fs = Math.round(h * 0.42);
        ctx.font = `600 ${fs}px Poppins, sans-serif`;
        ctx.fillStyle = tc; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, cw / 2, ch - h / 2);
      }
    } else if (reelFrameTemplate === 'top-bar') {
      const h = Math.round(ch * 0.10);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, h);
      if (text) {
        const fs = Math.round(h * 0.42);
        ctx.font = `600 ${fs}px Poppins, sans-serif`;
        ctx.fillStyle = tc; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, cw / 2, h / 2);
      }
    } else if (reelFrameTemplate === 'corner-tag') {
      if (text) {
        const fs = Math.round(cw * 0.042);
        ctx.font = `600 ${fs}px Poppins, sans-serif`;
        const tw = ctx.measureText(text).width;
        const padX = fs * 0.6, padY = fs * 0.35;
        const tagW = tw + padX * 2, tagH = fs + padY * 2;
        const margin = Math.round(cw * 0.03);
        const x = cw - tagW - margin, y = ch - tagH - margin;
        ctx.fillStyle = bg;
        try { ctx.beginPath(); ctx.roundRect(x, y, tagW, tagH, fs * 0.3); ctx.fill(); }
        catch(e) { ctx.fillRect(x, y, tagW, tagH); }
        ctx.fillStyle = tc; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, x + tagW / 2, y + tagH / 2);
      }
    } else if (reelFrameTemplate === 'full-border') {
      const bw = Math.round(cw * 0.015);
      ctx.strokeStyle = bg; ctx.lineWidth = bw * 2;
      ctx.strokeRect(0, 0, cw, ch);
      if (text) {
        const fs = Math.round(cw * 0.038);
        const barH = Math.round(fs * 1.8);
        ctx.fillStyle = bg;
        ctx.fillRect(0, ch - barH, cw, barH);
        ctx.font = `600 ${fs}px Poppins, sans-serif`;
        ctx.fillStyle = tc; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, cw / 2, ch - barH / 2);
      }
    }
  }
  ctx.restore();
}

// ── Overlay Presets Renderer ──
function drawReelOverlays(ctx, cw, ch, currentTime) {
  if (!reelOverlayItems.length) return;
  for (const item of reelOverlayItems) {
    const elapsed = currentTime - item.startTime;
    if (elapsed < 0 || elapsed > item.duration) continue;
    const progress = elapsed / item.duration; // 0→1
    // Entry (first 20%) and exit (last 20%) animation fraction
    const fadeIn  = Math.min(1, progress / 0.2);
    const fadeOut = Math.min(1, (1 - progress) / 0.2);
    const alpha   = Math.min(fadeIn, fadeOut);
    ctx.save();
    ctx.globalAlpha = alpha;
    const p = item.params || {};

    if (item.type === 'subscribe' || item.type === 'follow') {
      // Animated pill button with bounce-in
      const bounce = elapsed < item.duration * 0.2
        ? easeOutBounce(elapsed / (item.duration * 0.2))
        : 1;
      const btnW = Math.round(cw * 0.55);
      const btnH = Math.round(ch * 0.065);
      const bx   = (cw - btnW) / 2;
      const by   = ch * 0.72 - btnH * (1 - bounce) * 0.5;
      const r    = btnH / 2;
      ctx.save();
      // Subtle drop shadow
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur  = Math.round(cw * 0.015);
      ctx.fillStyle   = p.color || '#ff0000';
      ctx.beginPath();
      ctx.roundRect(bx, by, btnW, btnH, r);
      ctx.fill();
      ctx.shadowBlur = 0;
      const fs = Math.round(btnH * 0.44);
      ctx.font = `700 ${fs}px ${p.font || 'Poppins'}, sans-serif`;
      ctx.fillStyle   = p.textColor || '#ffffff';
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      const icon = item.type === 'subscribe' ? '🔔 ' : '➕ ';
      ctx.fillText(icon + (p.text || 'Subscribe'), cw / 2, by + btnH / 2);
      ctx.restore();

    } else if (item.type === 'lower-third') {
      const font   = p.font || 'Poppins';
      const barH   = Math.round(ch * 0.13);
      const slideY = ch * 0.78 + barH * (1 - Math.min(1, elapsed / (item.duration * 0.15)));
      ctx.fillStyle = p.color || '#000000';
      ctx.fillRect(0, slideY, cw, barH);
      ctx.fillStyle = p.accentColor || '#a855f7';
      ctx.fillRect(0, slideY, Math.round(cw * 0.012), barH);
      const nameFs  = Math.round(barH * 0.38);
      const titleFs = Math.round(barH * 0.28);
      ctx.textAlign   = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `700 ${nameFs}px ${font}, sans-serif`;
      ctx.fillStyle = p.textColor || '#ffffff';
      ctx.fillText(p.name || 'Your Name', Math.round(cw * 0.04), slideY + barH * 0.1);
      ctx.font = `400 ${titleFs}px ${font}, sans-serif`;
      ctx.fillStyle = p.textColor ? p.textColor + 'bb' : 'rgba(255,255,255,0.7)';
      ctx.fillText(p.title || '', Math.round(cw * 0.04), slideY + barH * 0.52);

    } else if (item.type === 'cta-arrow') {
      // Bouncing arrow + text at bottom center
      const bounce2 = Math.sin(elapsed * Math.PI * 2.5) * 0.04 * ch;
      const arrowY  = ch * 0.86 + bounce2;
      const fs2     = Math.round(cw * 0.06);
      ctx.font = `700 ${fs2}px Poppins, sans-serif`;
      ctx.fillStyle   = p.color || '#ffffff';
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      // Text above arrow
      ctx.fillText(p.text || 'Link in Bio', cw / 2, arrowY - fs2 * 1.1);
      // Arrow
      const arrFs = Math.round(cw * 0.1);
      ctx.font = `${arrFs}px sans-serif`;
      ctx.fillText('↓', cw / 2, arrowY + arrFs * 0.3);

    } else if (item.type === 'fade-title') {
      const fs3   = Math.round(cw * 0.072);
      const font  = p.font || 'Poppins';
      const lines = (p.text || 'Your Title').split('\n');
      const lineH = fs3 * 1.35;
      const totalH = lines.length * lineH;
      const bgPad = fs3 * 0.6;
      const bgW   = cw * 0.88;
      const bgH   = totalH + bgPad * 2;
      const bgX   = (cw - bgW) / 2;
      const pos   = p.position || 'center';
      const bgY   = pos === 'top' ? ch * 0.08 : pos === 'bottom' ? ch * 0.82 - bgH : ch * 0.5 - bgH / 2;
      const bgCol = p.bgColor || '#000000';
      ctx.fillStyle = bgCol + 'cc'; // hex + 80% opacity
      try { ctx.beginPath(); ctx.roundRect(bgX, bgY, bgW, bgH, fs3 * 0.3); ctx.fill(); }
      catch(e) { ctx.fillRect(bgX, bgY, bgW, bgH); }
      ctx.font = `700 ${fs3}px ${font}, sans-serif`;
      ctx.fillStyle    = p.color || '#ffffff';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach((line, i) => {
        ctx.fillText(line, cw / 2, bgY + bgPad + lineH * i + lineH / 2);
      });
    }
    ctx.restore();
  }
}

function easeOutBounce(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1/d1)       return n1 * t * t;
  if (t < 2/d1)       return n1 * (t -= 1.5/d1) * t + 0.75;
  if (t < 2.5/d1)     return n1 * (t -= 2.25/d1) * t + 0.9375;
  return n1 * (t -= 2.625/d1) * t + 0.984375;
}

// ── Playback ──
let reelAudioSource = null;
const btnReelPause = $('btn-reel-pause');

if (btnReelPlay) btnReelPlay.addEventListener('click', () => {
  if (reelPlaying) return;
  if (!reelAudioBuffer) return;
  reelPlaying = true;
  reelAudioSource = ensureAudioCtx().createBufferSource();
  reelAudioSource.buffer = reelAudioBuffer;
  reelAudioSource.connect(ensureAudioCtx().destination);
  reelAudioSource.start();
  reelStartTime = ensureAudioCtx().currentTime;
  reelAudioSource.onended = () => { reelPlaying = false; reelAudioSource = null; };

  // For video mode: start video playback in sync
  const isVid = reelScenes && reelScenes.some(s => s.isVideo);
  const activeResult = window._reelMultiResults ? window._reelMultiResults[activeReelPreview] : null;
  if (isVid && reelVideoEl) {
    const vidOffset = activeResult ? activeResult.videoStart : 0;
    reelVideoEl.currentTime = vidOffset;
    reelVideoEl.muted = true;
    reelVideoEl.play();
  }

  const platform = REEL_PLATFORMS[reelPlatform];

  function animate() {
    if (!reelPlaying) return;
    const elapsed = ensureAudioCtx().currentTime - reelStartTime;
    if (elapsed >= reelAudioBuffer.duration) { stopReelPreview(); return; }

    // Draw frame
    const ctx = reelCanvas.getContext('2d');
    reelCanvas.width = platform.width;
    reelCanvas.height = platform.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, platform.width, platform.height);

    if (isVid && reelVideoEl) {
      // Video is already playing — just draw current frame with viewport
      drawReelVideoFrame(ctx, platform, activeResult);
    } else {
      const scene = reelScenes.find(s => elapsed >= s.startTime && elapsed < s.endTime);
      if (elapsed < 0.5) console.log('[ReelPlay] elapsed:', elapsed.toFixed(2), 'scenes:', reelScenes?.length, 'scene:', scene ? `st=${scene.startTime} en=${scene.endTime} hasImg=${!!scene.imgDataUrl} naturalW=${scene._img?.naturalWidth}` : 'NOT FOUND');
      if (scene?.imgDataUrl) {
        if (!scene._img) { scene._img = new Image(); scene._img.src = scene.imgDataUrl; }
        if (scene._img.naturalWidth > 0) {
          try { drawCoverFit(ctx, scene._img, platform.width, platform.height); } catch(e) { console.error('[Reel] draw error:', e); }
        }
      }
    }
    drawReelSubtitles(ctx, platform, elapsed);

    if (reelScrub) reelScrub.value = (elapsed / reelAudioBuffer.duration * 1000).toFixed(0);
    if (reelTimeEl) reelTimeEl.textContent = `${fmtShort(elapsed)} / ${fmtShort(reelAudioBuffer.duration)}`;
    reelAnimId = requestAnimationFrame(animate);
  }
  animate();
});

if (btnReelPause) btnReelPause.addEventListener('click', () => {
  stopReelPreview();
});

if (btnReelStop) btnReelStop.addEventListener('click', () => {
  stopReelPreview();
  renderReelFrame(0);
  if (reelScrub) reelScrub.value = 0;
  if (reelTimeEl) reelTimeEl.textContent = `0:00 / ${fmtShort(reelAudioBuffer ? reelAudioBuffer.duration : 0)}`;
});

function stopReelPreview() {
  reelPlaying = false;
  if (reelAnimId) cancelAnimationFrame(reelAnimId);
  if (reelAudioSource) { try { reelAudioSource.stop(); } catch(e) {} reelAudioSource = null; }
  // Stop video playback
  if (reelVideoEl) { reelVideoEl.pause(); reelVideoEl.muted = true; }
}

if (reelScrub) reelScrub.addEventListener('input', () => {
  const time = (reelScrub.value / 1000) * (reelAudioBuffer ? reelAudioBuffer.duration : 0);
  if (reelTimeEl) reelTimeEl.textContent = `${fmtShort(time)} / ${fmtShort(reelAudioBuffer ? reelAudioBuffer.duration : 0)}`;
  if (reelPlaying) {
    // Restart audio from new position
    if (reelAudioSource) { try { reelAudioSource.stop(); } catch(e) {} reelAudioSource = null; }
    const ac = ensureAudioCtx();
    reelAudioSource = ac.createBufferSource();
    reelAudioSource.buffer = reelAudioBuffer;
    reelAudioSource.connect(ac.destination);
    reelAudioSource.start(0, time);
    reelStartTime = ac.currentTime - time;
    reelAudioSource.onended = () => { reelPlaying = false; reelAudioSource = null; };
  } else {
    renderReelFrame(time);
  }
});

// ── Edit dropdowns sync ──
const reelEditStyle = $('reel-edit-style');
const reelEditTransition = $('reel-edit-transition');
const reelEditSubtitle = $('reel-subtitle-style');

if (reelEditStyle) reelEditStyle.addEventListener('change', () => {
  if (reelStyleEl) reelStyleEl.value = reelEditStyle.value;
});
if (reelEditTransition) reelEditTransition.addEventListener('change', () => {
  reelTransition = reelEditTransition.value;
  if (reelTransitionEl) reelTransitionEl.value = reelEditTransition.value;
  const preset = REEL_TRANSITIONS[reelTransition];
  if (preset && reelScenes) {
    reelScenes.forEach(s => { s.transition = preset.transition; s.transDur = preset.transDur; s.motion = preset.motion; });
  }
});
if (reelEditSubtitle) reelEditSubtitle.addEventListener('change', () => {
  reelSubtitleStyle = reelEditSubtitle.value;
  if (reelSubtitleStyleEl) reelSubtitleStyleEl.value = reelEditSubtitle.value;
});

// (Subtitle language switching removed — now handled via reel preview thumbnails)

// ── Subtitle Styling Controls (from presets section) ──
const reelSubColorPreset = $('reel-sub-color-preset');
const reelSubOutlinePreset = $('reel-sub-outline-preset');
const reelSubBackdropPreset = $('reel-sub-backdrop-preset');
if (reelSubColorPreset) reelSubColorPreset.addEventListener('input', () => { reelSubColor = reelSubColorPreset.value; saveActiveReelSettings(); });
if (reelSubOutlinePreset) reelSubOutlinePreset.addEventListener('input', () => { reelSubOutline = reelSubOutlinePreset.value; saveActiveReelSettings(); });
if (reelSubBackdropPreset) reelSubBackdropPreset.addEventListener('change', () => { reelSubBackdrop = reelSubBackdropPreset.value; saveActiveReelSettings(); });

const reelSubSizeEl = $('reel-sub-size');
const reelSubSizeLabel = $('reel-sub-size-label');
const reelSubPositionEl = $('reel-sub-position');
if (reelSubSizeEl) reelSubSizeEl.addEventListener('input', () => {
  reelSubSize = parseFloat(reelSubSizeEl.value);
  if (reelSubSizeLabel) reelSubSizeLabel.textContent = reelSubSize;
  saveActiveReelSettings();
  renderReelFrame(0);
});
const reelSubPosNumEl = $('reel-sub-position-num');
if (reelSubPositionEl) reelSubPositionEl.addEventListener('change', () => {
  reelSubPosition = parseSubPos(reelSubPositionEl.value);
  if (reelSubPosNumEl) { reelSubPosNumEl.value = reelSubPosition; const lbl = $('reel-sub-pos-label'); if (lbl) lbl.textContent = reelSubPosition + '%'; }
  saveActiveReelSettings();
  renderReelFrame(0);
});
if (reelSubPosNumEl) reelSubPosNumEl.addEventListener('input', () => {
  reelSubPosition = parseInt(reelSubPosNumEl.value);
  if (reelSubPositionEl) reelSubPositionEl.value = subPosToStr(reelSubPosition);
  const lbl = $('reel-sub-pos-label'); if (lbl) lbl.textContent = reelSubPosition + '%';
  saveActiveReelSettings();
  renderReelFrame(0);
});

// ── Viewport Controls ──
const reelViewportEl = $('reel-viewport');
const reelViewportXEl = $('reel-viewport-x');
const reelViewportCustomLabel = $('reel-viewport-custom-label');

if (reelViewportEl) reelViewportEl.addEventListener('change', () => {
  reelViewport = reelViewportEl.value;
  if (reelViewportCustomLabel) reelViewportCustomLabel.classList.toggle('hidden', reelViewport !== 'custom');
  saveActiveReelSettings();
  if (reelScenes && reelAudioBuffer) renderReelFrame(0);
});
if (reelViewportXEl) reelViewportXEl.addEventListener('input', () => {
  reelViewportX = parseInt(reelViewportXEl.value);
  saveActiveReelSettings();
  if (reelScenes && reelAudioBuffer) renderReelFrame(0);
});

// (Old checkbox/dropdown language panels removed — replaced by variation rows)
let reelAudioTracks = []; // kept for editor transfer compatibility

// ── Variation Rows UI ──
function renderVariationRows() {
  const container = $('reel-variation-list');
  if (!container) return;
  const langHtml = Object.entries(REEL_LANG_OPTIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  const subLangHtml = Object.entries(REEL_SUBTITLE_LANG_OPTIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  const platHtml = Object.entries(REEL_PLATFORMS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  const styleHtml = typeof STYLE_PRESETS !== 'undefined' ? Object.keys(STYLE_PRESETS).map(k => `<option value="${k}">${k.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>`).join('') : '<option value="cinematic">Cinematic</option>';
  const transHtml = Object.entries(REEL_TRANSITIONS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  // Row 0 inline (Audio + Sub only, shares Platform/Style/Transition from presets row)
  container.innerHTML = `<label class="form-label" data-vi="0">Audio: <select class="var-audio" data-vi="0">${langHtml}</select></label>
    <label class="form-label" data-vi="0">Sub: <select class="var-subtitle" data-vi="0">${subLangHtml}</select></label>`;

  // Additional rows go into a sibling container (each on its own line)
  let extraContainer = $('reel-variation-extra');
  if (!extraContainer) {
    extraContainer = document.createElement('div');
    extraContainer.id = 'reel-variation-extra';
    container.parentElement.insertBefore(extraContainer, container.nextElementSibling);
  }
  extraContainer.innerHTML = reelVariationRows.slice(1).map((row, idx) => {
    const i = idx + 1;
    return `<div class="reel-presets-row" style="margin-top:6px;" data-vi="${i}">
      <label class="form-label">Platform: <select class="var-platform" data-vi="${i}" disabled>${platHtml}</select></label>
      <label class="form-label">Visual style: <select class="var-style" data-vi="${i}" disabled>${styleHtml}</select></label>
      <label class="form-label">Transition: <select class="var-transition" data-vi="${i}">${transHtml}</select></label>
      <label class="form-label">Audio: <select class="var-audio" data-vi="${i}">${langHtml}</select></label>
      <label class="form-label">Sub: <select class="var-subtitle" data-vi="${i}">${subLangHtml}</select></label>
      <button class="variation-remove" data-vi="${i}">✕</button>
    </div>`;
  }).join('');
  // Set selected values and wire up event handlers
  [container, extraContainer].forEach(el => {
    el.querySelectorAll('.var-platform').forEach(sel => {
      const i = parseInt(sel.dataset.vi);
      sel.value = reelVariationRows[i].platform || reelPlatform || 'instagram';
    });
    el.querySelectorAll('.var-style').forEach(sel => {
      const i = parseInt(sel.dataset.vi);
      sel.value = reelVariationRows[i].style || (reelStyleEl ? reelStyleEl.value : 'cinematic');
    });
    el.querySelectorAll('.var-transition').forEach(sel => {
      const i = parseInt(sel.dataset.vi);
      sel.value = reelVariationRows[i].transition || reelTransition || 'whip-pan';
      sel.addEventListener('change', () => { reelVariationRows[i].transition = sel.value; });
    });
    el.querySelectorAll('.var-audio').forEach(sel => {
      const i = parseInt(sel.dataset.vi);
      sel.value = reelVariationRows[i].audio;
      sel.addEventListener('change', () => { reelVariationRows[i].audio = sel.value; updateVariationCount(); });
    });
    el.querySelectorAll('.var-subtitle').forEach(sel => {
      const i = parseInt(sel.dataset.vi);
      sel.value = reelVariationRows[i].subtitle;
      sel.addEventListener('change', () => { reelVariationRows[i].subtitle = sel.value; updateVariationCount(); });
    });
    el.querySelectorAll('.variation-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.vi);
        reelVariationRows.splice(i, 1);
        renderVariationRows();
        updateVariationCount();
      });
    });
  });
  updateVariationCount();
}

function updateVariationCount() {
  const segCount = Math.max(1, reelSegments.length);
  const varCount = reelVariationRows.length;
  const total = segCount * varCount;
  const countSpan = $('reel-btn-count');
  const suffixSpan = $('reel-btn-suffix');
  if (countSpan) countSpan.textContent = `(${total})`;
  if (suffixSpan) suffixSpan.textContent = total !== 1 ? 's' : '';
  updateReelCostEstimate();
}

function updateReelCostEstimate() {
  const el = $('reel-cost-estimate');
  if (!el) return;
  const segCount = Math.max(1, reelJobs.filter(j => j.type === 'segment').length);
  const isAudioVideo = reelInputMode !== 'text';
  const audioExtraLangs = reelVariationRows.filter(v => v.audio !== 'original').length;
  const subtitleExtraLangs = reelVariationRows.filter(v => v.subtitle !== 'original' && v.subtitle !== 'none').length;

  const transcriptionCost = isAudioVideo ? (COST_ESTIMATES.transcription || 0.003) : 0;
  const sceneWritingCost = 7 * (COST_ESTIMATES.textGeneration || 0.001);
  const imageCost = COST_ESTIMATES.gridGen2K || 0.134;
  const langCost = audioExtraLangs * (COST_ESTIMATES.ttsPerLang || 0.02)
    + subtitleExtraLangs * (COST_ESTIMATES.textGeneration || 0.001);
  const perReel = transcriptionCost + sceneWritingCost + imageCost + langCost;
  const total = segCount * perReel;

  el.textContent = `Est. ~$${total.toFixed(3)}`;
  el.style.display = '';
}

const btnAddVariation = $('btn-add-variation');
if (btnAddVariation) btnAddVariation.addEventListener('click', () => {
  reelVariationRows.push({ platform: reelPlatform, style: reelStyleEl ? reelStyleEl.value : 'cinematic', transition: reelTransition, audio: 'original', subtitle: 'none' });
  renderVariationRows();
});

// Render initial variation rows
renderVariationRows();

// ── Save Reel Project ──
const btnReelSaveProject = $('btn-reel-save-project');
const btnReelSaveTop = $('btn-reel-save-top');
if (btnReelSaveTop) btnReelSaveTop.addEventListener('click', () => { if (btnReelSaveProject) btnReelSaveProject.click(); });

if (btnReelSaveProject) btnReelSaveProject.addEventListener('click', async () => {
  console.log('[ReelSave] clicked, audioBuffer:', !!reelAudioBuffer, 'results:', !!window._reelMultiResults);
  if (!reelAudioBuffer) { setStatus('Nothing to save'); return; }
  setStatus('Saving reel project...', true);
  try {
    // Save the original full audio (before segmentation) so all segments can be reconstructed
    const audioToSave = reelOriginalAudioBuffer || reelAudioBuffer;
    const wavBlob = audioBufferToWavBlob(audioToSave);
    const audioBase64 = await blobToBase64(wavBlob);
    // Save video data if present
    let videoData = null;
    if (reelVideoSrc) {
      try {
        setStatus('Saving video...', true);
        const resp = await fetch(reelVideoSrc);
        const blob = await resp.blob();
        videoData = await blobToBase64(blob);
      } catch(e) { console.warn('Could not save video:', e); }
    }
    const project = {
      version: 1,
      type: 'reel',
      videoMode: reelVideoMode,
      platform: reelPlatform,
      duration: reelDuration,
      subtitleStyle: reelSubtitleStyle,
      transition: reelTransition,
      subColor: reelSubColor,
      subOutline: reelSubOutline,
      subBackdrop: reelSubBackdrop,
      subSize: reelSubSize,
      subPosition: reelSubPosition,
      subFont: reelSubFont,
      subAllCaps: reelSubAllCaps,
      subAccent: reelSubAccent,
      inputMode: reelInputMode,
      segments: reelSegments,
      jobs: reelJobs.map(j => ({
        id: j.id, type: j.type, parentId: j.parentId, status: j.status,
        audioName: j.audioName, segStart: j.segStart, segEnd: j.segEnd,
        platform: j.platform, style: j.style, transition: j.transition,
        subtitleStyle: j.subtitleStyle, subColor: j.subColor, subOutline: j.subOutline,
        subBackdrop: j.subBackdrop, subSize: j.subSize, subPosition: j.subPosition,
        audioLang: j.audioLang, subtitleLang: j.subtitleLang,
      })),
      videoData,
      audio: { data: audioBase64, duration: reelAudioBuffer.duration },
      scenes: reelScenes ? reelScenes.map(s => ({
        startTime: s.startTime, endTime: s.endTime, duration: s.duration,
        text: s.text, words: s.words, imgDataUrl: s.imgDataUrl,
        prompt: s.prompt, isVideo: s.isVideo,
        transition: s.transition, transDur: s.transDur, motion: s.motion,
      })) : [],
      words: reelWords,
      variationRows: reelVariationRows,
      frameTemplate: reelFrameTemplate,
      frameText: reelFrameText,
      frameBgColor: reelFrameBgColor,
      frameTextColor: reelFrameTextColor,
      frameOpacity: reelFrameOpacity,
      frameImgSrc: reelFrameImgSrc || '',
      overlayItems: reelOverlayItems.map(o => ({ id: o.id, type: o.type, startTime: o.startTime, duration: o.duration, params: o.params })),
      bgmVolume: reelBgmVolume,
      bgmData: await (async () => {
        if (!reelBgmBuffer) return null;
        try { return await blobToBase64(audioBufferToWavBlob(reelBgmBuffer)); } catch(e) { return null; }
      })(),
      multiResults: window._reelMultiResults ? await Promise.all(window._reelMultiResults.map(async r => {
        let audioData = null;
        if (r.audioBuffer) {
          try {
            const wav = audioBufferToWavBlob(r.audioBuffer);
            audioData = await blobToBase64(wav);
          } catch(e) {}
        }
        return {
          videoStart: r.videoStart, videoEnd: r.videoEnd,
          audioLang: r.audioLang, subtitleLang: r.subtitleLang,
          audioLangLabel: r.audioLangLabel, subtitleLangLabel: r.subtitleLangLabel,
          segmentIndex: r.segmentIndex,
          settings: r.settings,
          words: r.words,
          scenes: r.scenes ? await Promise.all(r.scenes.map(async s => {
            let videoData = null;
            if (reelVideoMode === 'animated' && s.videoUrl) {
              try { videoData = await blobToBase64(await fetch(s.videoUrl).then(r => r.blob())); } catch(e) {}
            }
            return {
              startTime: s.startTime, endTime: s.endTime, duration: s.duration,
              text: s.text, words: s.words, imgDataUrl: s.imgDataUrl,
              prompt: s.prompt, isVideo: s.isVideo,
              transition: s.transition, transDur: s.transDur, motion: s.motion,
              segmentIndex: s.segmentIndex, videoData,
            };
          })) : [],
          audioData,
        };
      })) : null,
    };
    const json = JSON.stringify(project);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultName = `reel-${timestamp}.aptproj`;
    const blob = new Blob([json], { type: 'application/json' });
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultName,
        types: [{ description: 'Project Files', accept: { 'application/json': ['.aptproj'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = defaultName; a.click();
      URL.revokeObjectURL(url);
    }
    setStatus(`Reel saved (${(json.length / 1024 / 1024).toFixed(1)} MB)`);
    try { await saveProjectToGallery(json, defaultName.replace('.aptproj', '')); } catch(e) { /* gallery save */ }
  } catch(e) {
    setStatus('Save failed. ' + friendlyApiError(e.message));
  }
});

// ── BGM ──
let reelBgmWavesurfer = null;

function initReelBgmWaveform(url) {
  const container = $('reel-bgm-waveform');
  if (!container || typeof WaveSurfer === 'undefined') return;
  if (reelBgmWavesurfer) { try { reelBgmWavesurfer.destroy(); } catch(e) {} reelBgmWavesurfer = null; }
  reelBgmWavesurfer = WaveSurfer.create({
    container: '#reel-bgm-waveform',
    waveColor: 'rgba(167,139,250,0.5)',
    progressColor: '#7c3aed',
    height: 72,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    cursorColor: '#fff',
    cursorWidth: 1,
  });
  reelBgmWavesurfer.load(url);
  const playBtn = $('reel-bgm-play-btn');
  if (playBtn) {
    reelBgmWavesurfer.on('play', () => { playBtn.textContent = '⏸ Pause'; });
    reelBgmWavesurfer.on('pause', () => { playBtn.textContent = '▶ Play'; });
    reelBgmWavesurfer.on('finish', () => { playBtn.textContent = '▶ Play'; });
    playBtn.onclick = () => reelBgmWavesurfer?.playPause();
  }
  reelBgmWavesurfer.setVolume(reelBgmVolume);
}

const BGM_PRESETS = {
  upbeat:    { label: 'Upbeat',    src: 'audio/bgm/upbeat.mp3' },
  calm:      { label: 'Calm',      src: 'audio/bgm/calm.mp3' },
  cinematic: { label: 'Cinematic', src: 'audio/bgm/cinematic.mp3' },
  corporate: { label: 'Corporate', src: 'audio/bgm/corporate.mp3' },
  playful:   { label: 'Playful',   src: 'audio/bgm/playful.mp3' },
};

// BGM audio element for file:// compatible playback
let reelBgmAudioEl = null;
let reelBgmVolume = 0.5;
let reelBgmAiBuffer = null; // Lyria 3 generated buffer (preserved when user switches presets)

async function loadBgmPreset(mood) {
  if (!mood || mood === 'none' || mood === 'custom') {
    reelBgmBuffer = null;
    if (reelBgmAudioEl) { reelBgmAudioEl.pause(); reelBgmAudioEl = null; }
    return;
  }
  const preset = BGM_PRESETS[mood];
  if (!preset) return;

  // Try fetch → AudioBuffer (works on http://)
  try {
    const resp = await fetch(preset.src);
    if (!resp.ok) throw new Error('Not found');
    const arrayBuf = await resp.arrayBuffer();
    reelBgmBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf);
    reelBgmAudioEl = null; // don't need audio element if buffer works
    return;
  } catch(e) { /* fetch failed — try audio element fallback */ }

  // Fallback: use <audio> element (works on file://)
  try {
    reelBgmBuffer = null;
    const audio = new Audio();
    audio.src = preset.src;
    audio.loop = true;
    audio.volume = 0.3;
    await new Promise((resolve, reject) => {
      audio.oncanplaythrough = resolve;
      audio.onerror = reject;
      setTimeout(reject, 5000); // timeout after 5s
    });
    reelBgmAudioEl = audio;
    console.log('[BGM] Loaded via audio element (file:// mode):', mood);
  } catch(e) {
    console.warn('[BGM] Could not load preset:', mood, e);
    reelBgmAudioEl = null;
  }
}

async function autoPickBgm() {
  try {
  if (reelBgmBuffer) return; // don't override user's choice
  const key = getReelApiKey();
  if (!key) return;

  const bgmStep = $('reel-step-bgm');
  const bgmStatus = $('reel-bgm-status');
  const bgmPlayer = $('reel-bgm-player');
  if (bgmStep) bgmStep.classList.remove('hidden');
  resetReelAgentTasks('bgm');
  updateReelAgentTask('bgm', 'analyze', 'waiting', 'Analyzing content…');
  updateReelAgentTask('bgm', 'compose', 'waiting', 'Composing with Lyria 3…');
  updateReelAgentTask('bgm', 'analyze', 'done', 'Content analyzed');
  updateReelAgentTask('bgm', 'compose', 'running', 'Composing with Lyria 3…');
  if (bgmPlayer) bgmPlayer.style.display = 'none';

  // Try Lyria 3 first
  try {
    const text = ($('reel-text-input')?.value || '').slice(0, 400);
    const scenes = reelPendingScenes || reelScenes || [];
    const images = scenes.filter(s => s.imgDataUrl).slice(0, 5).map(s => s.imgDataUrl);
    const arrayBuf = await generateLyriaBgm(key, text || 'social media reel', images);

    // Decode to AudioBuffer for sync playback during reel preview
    const bufCopy = arrayBuf.slice(0);
    reelBgmBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf);

    // Create Blob URL for the waveform player
    const blob = new Blob([bufCopy], { type: 'audio/mp3' });
    const blobUrl = URL.createObjectURL(blob);
    if (bgmStatus) bgmStatus.style.display = 'none';
    if (bgmPlayer) bgmPlayer.style.display = '';
    initReelBgmWaveform(blobUrl);
    reelBgmAiBuffer = reelBgmBuffer; // save for "AI Generated" option
    // Select "AI Generated" in all preview music dropdowns
    document.querySelectorAll('.rc-bgm').forEach(sel => {
      if (!sel.querySelector('option[value="ai-generated"]')) {
        const opt = document.createElement('option'); opt.value = 'ai-generated'; opt.textContent = 'AI Generated ✨';
        sel.insertBefore(opt, sel.firstChild);
      }
      sel.value = 'ai-generated';
    });
    console.log('[BGM] Lyria 3 generated for reel');
    updateReelAgentTask('bgm', 'compose', 'done', 'Music ready · Lyria 3');
    return;
  } catch(e) {
    console.warn('[BGM] Lyria 3 failed, falling back to preset:', e);
    updateReelAgentTask('bgm', 'compose', 'warn', 'Lyria 3 unavailable · trying preset');
    updateReelAgentTask('bgm', 'preset', 'running', 'Selecting mood preset…');
  }

  // Fallback: pick a preset mood via Gemini Flash
  const template = document.querySelector('#reel-template-grid .template-card.selected')?.dataset?.template || '';
  const style = $('reel-style')?.value || '';
  const text = ($('reel-text-input')?.value || '').slice(0, 200);
  const context = [template && `template:${template}`, style && `style:${style}`, text && `topic:${text}`].filter(Boolean).join(', ');
  if (!context) { updateReelAgentTask('bgm', 'preset', 'done', 'Default preset'); return; }
  try {
    const body = { contents: [{ parts: [{ text: `Music director for social media reels. Content: "${context}". Pick ONE mood from: upbeat, calm, cinematic, corporate, playful. Reply with ONLY the single word.` }] }] };
    const data = await callGeminiAPI(getTranscriptionModels(), body, key);
    const mood = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase().replace(/[^a-z]/g, '');
    if (BGM_PRESETS[mood]) {
      await loadBgmPreset(mood);
      const el = $('reel-bgm-preset'); if (el) el.value = mood;
      const lbl = $('reel-bgm-auto-label'); if (lbl) lbl.style.display = '';
      if (bgmStatus) bgmStatus.style.display = 'none';
      if (bgmPlayer) bgmPlayer.style.display = '';
      initReelBgmWaveform(BGM_PRESETS[mood].src);
      console.log('[BGM] Preset auto-picked:', mood);
      updateReelAgentTask('bgm', 'preset', 'done', `Music ready · ${BGM_PRESETS[mood]?.label || mood} preset`);
    } else {
      updateReelAgentTask('bgm', 'preset', 'done', 'Default preset');
    }
  } catch(e) {
    console.warn('[BGM] Auto-pick failed:', e);
    updateReelAgentTask('bgm', 'preset', 'error', 'BGM selection failed');
  }
  } finally {
    setReelExportEnabled(true);
  }
}

const reelBgmPresetEl = $('reel-bgm-preset');
if (reelBgmPresetEl) reelBgmPresetEl.addEventListener('change', async () => {
  const mood = reelBgmPresetEl.value;
  const autoLabel = $('reel-bgm-auto-label'); if (autoLabel) autoLabel.style.display = 'none';
  const uploadBtn = $('btn-reel-bgm'); if (uploadBtn) uploadBtn.style.display = mood === 'custom' ? '' : 'none';
  if (mood === 'custom') { reelBgmBuffer = null; return; }
  await loadBgmPreset(mood);
  setReelExportEnabled(true);
});
if (btnReelBgm) btnReelBgm.addEventListener('click', () => reelBgmInput.click());
if (reelBgmInput) reelBgmInput.addEventListener('change', async () => {
  const file = reelBgmInput.files[0];
  if (!file) return;
  reelBgmInput.value = '';
  try {
    const arrayBuf = await file.arrayBuffer();
    reelBgmBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf);
    if (btnReelBgm) btnReelBgm.textContent = `♫ ${file.name.slice(0, 20)}`;
    setReelExportEnabled(true);
  } catch(e) { if (btnReelBgm) btnReelBgm.textContent = '+ Upload (error)'; }
});

// Volume slider for reel BGM waveform player
const reelBgmVolumeSlider = $('reel-bgm-volume-slider');
if (reelBgmVolumeSlider) {
  reelBgmVolumeSlider.addEventListener('input', () => {
    reelBgmVolume = parseInt(reelBgmVolumeSlider.value) / 100;
    if (reelBgmWavesurfer) reelBgmWavesurfer.setVolume(reelBgmVolume);
    const lbl = $('reel-bgm-vol-label');
    if (lbl) lbl.textContent = reelBgmVolumeSlider.value + '%';
    document.querySelectorAll('.rc-bgm-vol').forEach(el => { el.value = reelBgmVolumeSlider.value; const l = el.parentElement.querySelector('.rc-bgm-vol-label'); if (l) l.textContent = reelBgmVolumeSlider.value + '%'; });
    const mpSt = window._reelMpState;
    if (mpSt) Object.values(mpSt).forEach(st => { if (st.playing && st.bgmGain) st.bgmGain.gain.value = reelBgmVolume; });
    if (reelBgmAudioEl) reelBgmAudioEl.volume = reelBgmVolume;
  });
}

// ── Frame Overlay ──
const btnReelFrame = $('btn-reel-frame');
const btnReelFrameRemove = $('btn-reel-frame-remove');
const reelFrameInput = $('reel-frame-input');
const reelFrameOpacityEl = $('reel-frame-opacity');
const reelFrameOpacityLabel = $('reel-frame-opacity-label');
const reelFrameTemplateEl = $('reel-frame-template');
const reelFrameTextEl = $('reel-frame-text');
const reelFrameBgColorEl = $('reel-frame-bg-color');
const reelFrameTextColorEl = $('reel-frame-text-color');

function updateReelFrameControls() {
  const t = reelFrameTemplate;
  const isNone = t === 'none';
  const isPng = t === 'custom-png';
  const isTemplate = !isNone && !isPng;
  const textLabel = $('reel-frame-text-label');
  const colorsLabel = $('reel-frame-colors-label');
  const pngLabel = $('reel-frame-png-label');
  if (textLabel) textLabel.style.display = isTemplate ? '' : 'none';
  if (colorsLabel) colorsLabel.style.display = isTemplate ? '' : 'none';
  if (pngLabel) pngLabel.style.display = isPng ? '' : 'none';
  if (reelFrameOpacityLabel) reelFrameOpacityLabel.style.display = isNone ? 'none' : '';
}

if (reelFrameTemplateEl) reelFrameTemplateEl.addEventListener('change', () => {
  reelFrameTemplate = reelFrameTemplateEl.value;
  updateReelFrameControls();
  renderReelFrame(0);
});
if (reelFrameTextEl) reelFrameTextEl.addEventListener('input', () => {
  reelFrameText = reelFrameTextEl.value;
  renderReelFrame(0);
});
if (reelFrameBgColorEl) reelFrameBgColorEl.addEventListener('input', () => {
  reelFrameBgColor = reelFrameBgColorEl.value;
  renderReelFrame(0);
});
if (reelFrameTextColorEl) reelFrameTextColorEl.addEventListener('input', () => {
  reelFrameTextColor = reelFrameTextColorEl.value;
  renderReelFrame(0);
});
if (btnReelFrame) btnReelFrame.addEventListener('click', () => reelFrameInput?.click());
if (reelFrameInput) reelFrameInput.addEventListener('change', (e) => {
  const file = e.target.files[0]; if (!file) return;
  reelFrameInput.value = '';
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      reelFrameImgEl = img; reelFrameImgSrc = ev.target.result;
      if (btnReelFrame) btnReelFrame.textContent = `🖼 ${file.name.slice(0, 16)}`;
      if (btnReelFrameRemove) btnReelFrameRemove.style.display = '';
      renderReelFrame(0);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});
if (btnReelFrameRemove) btnReelFrameRemove.addEventListener('click', () => {
  reelFrameImgEl = null; reelFrameImgSrc = '';
  if (btnReelFrame) btnReelFrame.textContent = '+ Upload PNG';
  if (btnReelFrameRemove) btnReelFrameRemove.style.display = 'none';
  renderReelFrame(0);
});
if (reelFrameOpacityEl) reelFrameOpacityEl.addEventListener('input', () => {
  reelFrameOpacity = reelFrameOpacityEl.value / 100;
  renderReelFrame(0);
});

// ── Overlay Preset UI ──
function renderOverlayChips() {
  const container = $('reel-overlay-chips');
  if (!container) return;
  if (!reelOverlayItems.length) { container.style.display = 'none'; return; }
  container.style.display = 'flex';
  container.style.flexWrap = 'wrap';
  container.style.gap = '4px';
  container.style.justifyContent = 'center';
  const totalDur = reelAudioBuffer ? reelAudioBuffer.duration : (reelScenes?.at(-1)?.endTime || 60);
  container.innerHTML = reelOverlayItems.map(item => {
    const def = REEL_OVERLAY_PRESETS[item.type];
    const label = def ? def.label : item.type;
    const p = item.params || {};
    const endTime = (item.startTime + item.duration).toFixed(1);
    let paramsHtml = '';
    if (item.type === 'lower-third') {
      paramsHtml = `
        <input type="text" class="ov-name" data-oid="${item.id}" value="${p.name || ''}" placeholder="Name" style="width:70px;font-size:inherit;padding:2px 4px;">
        <input type="text" class="ov-title-text" data-oid="${item.id}" value="${p.title || ''}" placeholder="Role/Title" style="width:70px;font-size:inherit;padding:2px 4px;">
        <select class="ov-font" data-oid="${item.id}" style="font-size:inherit;padding:2px 3px;max-width:90px;">
          ${['Poppins','Montserrat','Anton','Bebas Neue','Oswald','Inter'].map(f => `<option value="${f}" ${(p.font||'Poppins')===f?'selected':''}>${f}</option>`).join('')}
        </select>
        <input type="color" class="ov-color" data-oid="${item.id}" value="${p.color || '#000000'}" title="BG color" style="width:22px;height:22px;padding:0;border:none;cursor:pointer;">
        <input type="color" class="ov-text-color" data-oid="${item.id}" value="${p.textColor || '#ffffff'}" title="Text color" style="width:22px;height:22px;padding:0;border:none;cursor:pointer;">
        <input type="color" class="ov-accent-color" data-oid="${item.id}" value="${p.accentColor || '#a855f7'}" title="Accent stripe" style="width:22px;height:22px;padding:0;border:none;cursor:pointer;">`;
    } else if (item.type === 'fade-title') {
      paramsHtml = `
        <input type="text" class="ov-text" data-oid="${item.id}" value="${p.text || ''}" placeholder="Text" style="width:90px;font-size:inherit;padding:2px 4px;">
        <input type="color" class="ov-color" data-oid="${item.id}" value="${p.color || '#ffffff'}" title="Text color" style="width:22px;height:22px;padding:0;border:none;cursor:pointer;">
        <input type="color" class="ov-bg-color" data-oid="${item.id}" value="${p.bgColor || '#000000'}" title="BG color" style="width:22px;height:22px;padding:0;border:none;cursor:pointer;">
        <select class="ov-font" data-oid="${item.id}" style="font-size:inherit;padding:2px 3px;max-width:90px;">
          ${['Poppins','Montserrat','Anton','Bebas Neue','Oswald','Inter'].map(f => `<option value="${f}" ${(p.font||'Poppins')===f?'selected':''}>${f}</option>`).join('')}
        </select>
        <select class="ov-position" data-oid="${item.id}" style="font-size:inherit;padding:2px 3px;max-width:70px;">
          <option value="top" ${(p.position||'center')==='top'?'selected':''}>Top</option>
          <option value="center" ${(p.position||'center')==='center'?'selected':''}>Center</option>
          <option value="bottom" ${(p.position||'center')==='bottom'?'selected':''}>Bottom</option>
        </select>`;
    } else if (item.type === 'subscribe' || item.type === 'follow') {
      paramsHtml = `
        <input type="text" class="ov-text" data-oid="${item.id}" value="${p.text || ''}" placeholder="Text" style="width:80px;font-size:inherit;padding:2px 4px;">
        <input type="color" class="ov-color" data-oid="${item.id}" value="${p.color || '#ff0000'}" title="Button color" style="width:22px;height:22px;padding:0;border:none;cursor:pointer;">
        <input type="color" class="ov-text-color" data-oid="${item.id}" value="${p.textColor || '#ffffff'}" title="Text/icon color" style="width:22px;height:22px;padding:0;border:none;cursor:pointer;">`;
    } else {
      paramsHtml = `
        <input type="text" class="ov-text" data-oid="${item.id}" value="${p.text || ''}" placeholder="Text" style="width:100px;font-size:inherit;padding:2px 4px;">
        <input type="color" class="ov-color" data-oid="${item.id}" value="${p.color || '#ffffff'}" title="Color" style="width:22px;height:22px;padding:0;border:none;cursor:pointer;">`;
    }
    const isWide = item.type === 'fade-title' || item.type === 'lower-third';
    return `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:4px 8px;font-size:0.72rem;flex-shrink:0;${isWide ? 'flex-wrap:wrap;max-width:100%;' : ''}">
      <span style="font-size:0.68rem;color:var(--text-muted);white-space:nowrap;">${label}</span>
      ${paramsHtml}
      <input type="number" class="ov-start" data-oid="${item.id}" value="${item.startTime.toFixed(1)}" min="0" max="${totalDur.toFixed(1)}" step="0.5" style="width:40px;font-size:inherit;padding:2px 3px;" title="Start">–<input type="number" class="ov-end" data-oid="${item.id}" value="${endTime}" min="0" max="${totalDur.toFixed(1)}" step="0.5" style="width:40px;font-size:inherit;padding:2px 3px;" title="End">s
      <button onclick="deleteReelOverlay(${item.id})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:inherit;padding:0 2px;line-height:1;">✕</button>
    </span>`;
  }).join('');
  container.querySelectorAll('.ov-text').forEach(inp => {
    inp.addEventListener('input', () => {
      const ov = reelOverlayItems.find(o => o.id === parseInt(inp.dataset.oid));
      if (ov) { ov.params.text = inp.value; renderReelFrame(ov.startTime + 0.5); }
    });
  });
  container.querySelectorAll('.ov-name').forEach(inp => {
    inp.addEventListener('input', () => {
      const ov = reelOverlayItems.find(o => o.id === parseInt(inp.dataset.oid));
      if (ov) { ov.params.name = inp.value; renderReelFrame(ov.startTime + 0.5); }
    });
  });
  container.querySelectorAll('.ov-title-text').forEach(inp => {
    inp.addEventListener('input', () => {
      const ov = reelOverlayItems.find(o => o.id === parseInt(inp.dataset.oid));
      if (ov) { ov.params.title = inp.value; renderReelFrame(ov.startTime + 0.5); }
    });
  });
  container.querySelectorAll('.ov-color').forEach(inp => {
    inp.addEventListener('input', () => {
      const ov = reelOverlayItems.find(o => o.id === parseInt(inp.dataset.oid));
      if (ov) { ov.params.color = inp.value; renderReelFrame(ov.startTime + 0.5); }
    });
  });
  container.querySelectorAll('.ov-bg-color').forEach(inp => {
    inp.addEventListener('input', () => {
      const ov = reelOverlayItems.find(o => o.id === parseInt(inp.dataset.oid));
      if (ov) { ov.params.bgColor = inp.value; renderReelFrame(ov.startTime + 0.5); }
    });
  });
  container.querySelectorAll('.ov-text-color').forEach(inp => {
    inp.addEventListener('input', () => {
      const ov = reelOverlayItems.find(o => o.id === parseInt(inp.dataset.oid));
      if (ov) { ov.params.textColor = inp.value; renderReelFrame(ov.startTime + 0.5); }
    });
  });
  container.querySelectorAll('.ov-accent-color').forEach(inp => {
    inp.addEventListener('input', () => {
      const ov = reelOverlayItems.find(o => o.id === parseInt(inp.dataset.oid));
      if (ov) { ov.params.accentColor = inp.value; renderReelFrame(ov.startTime + 0.5); }
    });
  });
  container.querySelectorAll('.ov-font').forEach(sel => {
    sel.addEventListener('change', () => {
      const ov = reelOverlayItems.find(o => o.id === parseInt(sel.dataset.oid));
      if (ov) { ov.params.font = sel.value; renderReelFrame(ov.startTime + 0.5); }
    });
  });
  container.querySelectorAll('.ov-position').forEach(sel => {
    sel.addEventListener('change', () => {
      const ov = reelOverlayItems.find(o => o.id === parseInt(sel.dataset.oid));
      if (ov) { ov.params.position = sel.value; renderReelFrame(ov.startTime + 0.5); }
    });
  });
  container.querySelectorAll('.ov-start').forEach(inp => {
    inp.addEventListener('change', () => {
      const ov = reelOverlayItems.find(o => o.id === parseInt(inp.dataset.oid));
      if (ov) { ov.startTime = Math.max(0, parseFloat(inp.value) || 0); renderReelFrame(ov.startTime + 0.5); }
    });
  });
  container.querySelectorAll('.ov-end').forEach(inp => {
    inp.addEventListener('change', () => {
      const ov = reelOverlayItems.find(o => o.id === parseInt(inp.dataset.oid));
      if (ov) { const end = Math.max(ov.startTime + 0.5, parseFloat(inp.value) || 0); ov.duration = end - ov.startTime; renderReelFrame(ov.startTime + 0.5); }
    });
  });
}

function deleteReelOverlay(id) {
  reelOverlayItems = reelOverlayItems.filter(o => o.id !== id);
  window._editorReelOverlays = reelOverlayItems.map(o => ({ ...o }));
  renderOverlayChips();
  renderReelFrame(0);
}

function insertReelOverlay(type) {
  const def = REEL_OVERLAY_PRESETS[type];
  if (!def) return;
  // Default start: 10% into the reel duration, or 0 if unknown
  const totalDur = reelAudioBuffer ? reelAudioBuffer.duration : (reelScenes?.at(-1)?.endTime || 60);
  const startTime = parseFloat((totalDur * 0.1).toFixed(1));
  reelOverlayItems.push({
    id: nextOverlayId++,
    type,
    startTime,
    duration: def.defaultDuration,
    params: { ...def.defaultParams },
  });
  window._editorReelOverlays = reelOverlayItems.map(o => ({ ...o }));
  renderOverlayChips();
  renderReelFrame(startTime + 0.5);
}

// Bind overlay palette buttons
document.querySelectorAll('[data-overlay]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    insertReelOverlay(btn.dataset.overlay);
  });
});

// ── Export ──
async function exportSingleReel() {
  if (!reelAudioBuffer || !reelScenes) return;
  const platform = REEL_PLATFORMS[reelPlatform];
  const canvas = document.createElement('canvas');
  canvas.width = platform.width; canvas.height = platform.height;
  const ctx = canvas.getContext('2d');
  const fps = 30;
  const stream = canvas.captureStream(fps);

  // Use editor's export progress bar
  exportProgress.classList.add('visible');
  exportBar.style.width = '0%';
  exportLabel.textContent = 'Preparing export...';
  if (btnReelExport) btnReelExport.disabled = true;

  try {
    // Auto-detect best format (MP4 if available, else WebM)
    const resolved = typeof resolveMime === 'function' ? resolveMime('mp4') || resolveMime('auto') : null;
    const mimeType = resolved ? resolved.mime : (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm');
    const fileExt = resolved ? resolved.ext : 'webm';
    const videoBitrate = typeof baseBitrate === 'function' ? baseBitrate(platform.height) : 8000000;

    const audioDest = ensureAudioCtx().createMediaStreamDestination();
    const audioSource = ensureAudioCtx().createBufferSource();
    audioSource.buffer = reelAudioBuffer;
    audioSource.connect(audioDest);
    if (reelBgmBuffer) {
      const bgmSource = ensureAudioCtx().createBufferSource();
      bgmSource.buffer = reelBgmBuffer;
      bgmSource.loop = true;
      const bgmGain = ensureAudioCtx().createGain();
      bgmGain.gain.value = 0.3;
      bgmSource.connect(bgmGain);
      bgmGain.connect(audioDest);
      bgmSource.start();
    }
    const combinedStream = new MediaStream([...stream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: videoBitrate });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { recorder.onstop = r; });

    const isVid = reelScenes && reelScenes.some(s => s.isVideo);
    const isAnimated = reelVideoMode === 'animated' && reelScenes.some(s => s.videoUrl);
    const activeResult = window._reelMultiResults ? window._reelMultiResults[activeReelPreview] : null;

    // Preload scene media — multi-clip animated scenes produce type:'video-clips'
    const exportMediaEls = await Promise.all(reelScenes.map(async s => {
      if (isAnimated && (s.videoUrl || (s.videoClips && s.videoClips.length > 0))) {
        const clips = s.videoClips || [{ url: s.videoUrl, clipDuration: 10 }];
        const loadedEls = await Promise.all(clips.map(clip => new Promise(res => {
          const v = document.createElement('video');
          v.muted = true; v.preload = 'auto'; v.playsInline = true;
          let done = false;
          const finish = () => { if (!done) { done = true; res(v); } };
          v.onerror = () => res(null);
          v.oncanplay = () => { v.onseeked = () => { v._ready = true; finish(); }; v.currentTime = 0.5; setTimeout(finish, 1200); };
          v.src = clip.url; v.load();
          setTimeout(finish, 4000);
        })));
        const validEls = loadedEls.filter(Boolean);
        if (validEls.length === 0) {
          if (s.imgDataUrl) return new Promise(res => { const i = new Image(); i.onload = () => res({ type: 'image', el: i }); i.onerror = () => res(null); i.src = s.imgDataUrl; });
          return null;
        }
        if (validEls.length === 1) return { type: 'video', el: validEls[0] };
        return { type: 'video-clips', els: validEls, clips };
      }
      if (s.imgDataUrl) {
        return new Promise(res => { const i = new Image(); i.onload = () => res({ type: 'image', el: i }); i.onerror = () => res(null); i.src = s.imgDataUrl; });
      }
      return null;
    }));

    if (!isAnimated) {
      if (isVid && reelVideoEl) {
        const vidOffset = activeResult ? activeResult.videoStart : 0;
        reelVideoEl.currentTime = vidOffset; reelVideoEl.muted = true; reelVideoEl.play();
      }
    }

    exportLabel.textContent = 'Recording frames...';
    recorder.start(100);
    const audioCtxRef = ensureAudioCtx();
    audioSource.start();
    const audioStartedAt = audioCtxRef.currentTime;
    const totalDur = reelAudioBuffer.duration;
    let stopped = false;
    let _lastExportSceneIdx = -1;

    function _startExportVideoEl(v) {
      v._ready = false;
      v.onseeked = () => { v._ready = true; v.play().catch(() => {}); };
      v.currentTime = 0.5;
      setTimeout(() => { if (!v._ready) { v._ready = true; v.play().catch(() => {}); } }, 400);
    }

    function drawExportFrame(elapsed) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, platform.width, platform.height);
      if (isAnimated) {
        let sceneIdx = 0;
        for (let si = reelScenes.length - 1; si >= 0; si--) { if ((reelScenes[si].startTime || 0) <= elapsed) { sceneIdx = si; break; } }
        const cur = exportMediaEls[sceneIdx];
        if (sceneIdx !== _lastExportSceneIdx) {
          if (_lastExportSceneIdx >= 0) {
            const prev = exportMediaEls[_lastExportSceneIdx];
            if (prev?.type === 'video') try { prev.el.pause(); } catch {}
            else if (prev?.type === 'video-clips') prev.els.forEach(v => { try { v.pause(); } catch {} });
          }
          if (cur?.type === 'video') _startExportVideoEl(cur.el);
          else if (cur?.type === 'video-clips') { cur._activeClipIdx = 0; if (cur.els[0]) _startExportVideoEl(cur.els[0]); }
          _lastExportSceneIdx = sceneIdx;
        }
        if (cur?.type === 'video-clips') {
          const timeInScene = elapsed - (reelScenes[sceneIdx].startTime || 0);
          let clipIdx = Math.max(0, cur.clips.length - 1);
          let cumDur = 0;
          for (let c = 0; c < cur.clips.length; c++) { if (timeInScene < cumDur + (cur.clips[c].clipDuration || 10)) { clipIdx = c; break; } cumDur += (cur.clips[c].clipDuration || 10); }
          if (cur._activeClipIdx === undefined) cur._activeClipIdx = 0;
          if (clipIdx !== cur._activeClipIdx) {
            const prevV = cur.els[cur._activeClipIdx]; if (prevV) try { prevV.pause(); } catch {}
            if (cur.els[clipIdx]) _startExportVideoEl(cur.els[clipIdx]);
            cur._activeClipIdx = clipIdx;
          }
          const activeEl = cur.els[cur._activeClipIdx];
          if (activeEl?.readyState >= 2) try { drawCoverFit(ctx, activeEl, platform.width, platform.height); } catch(e) {}
        } else if (cur?.type === 'video' && cur.el.readyState >= 2) try { drawCoverFit(ctx, cur.el, platform.width, platform.height); } catch(e) {}
        else if (cur?.type === 'image' && cur.el.naturalWidth > 0) try { drawCoverFit(ctx, cur.el, platform.width, platform.height); } catch(e) {}
      } else if (isVid && reelVideoEl) {
        const vp = activeResult?.settings?.viewport || reelViewport;
        const vpx = activeResult?.settings?.viewportX ?? reelViewportX;
        try { drawViewportCrop(ctx, reelVideoEl, platform.width, platform.height, vp, vpx); } catch(e) {
          try { drawCoverFit(ctx, reelVideoEl, platform.width, platform.height); } catch(e2) {}
        }
      } else {
        try { drawReelSceneFrame(ctx, platform.width, platform.height, elapsed, reelScenes); } catch(e) {}
      }
      const rs = activeResult?.settings || {};
      const savedC = reelSubColor, savedO = reelSubOutline, savedB = reelSubBackdrop, savedSz = reelSubSize, savedP = reelSubPosition;
      reelSubColor = rs.subColor || savedC; reelSubOutline = rs.subOutline || savedO;
      reelSubBackdrop = rs.subBackdrop || savedB; reelSubSize = rs.subSize || savedSz; reelSubPosition = parseSubPos(rs.subPosition ?? savedP);
      const subStyle = rs.subtitleStyle || reelSubtitleStyle;
      if (subStyle !== 'none' && reelWords.length > 0) renderReelSubtitle(ctx, platform.width, platform.height, elapsed, reelWords, subStyle);
      reelSubColor = savedC; reelSubOutline = savedO; reelSubBackdrop = savedB; reelSubSize = savedSz; reelSubPosition = savedP;
      drawReelFrame(ctx, platform.width, platform.height);
      drawReelOverlays(ctx, platform.width, platform.height, elapsed);
    }

    const timerWorker = new Worker(URL.createObjectURL(new Blob([
      `let id; self.onmessage = e => { if (e.data==="start") id=setInterval(()=>self.postMessage("t"),${1000/fps}); else clearInterval(id); };`
    ], { type: 'text/javascript' })));

    timerWorker.onmessage = () => {
      if (stopped) return;
      const elapsed = audioCtxRef.currentTime - audioStartedAt;
      const progress = Math.min(elapsed / totalDur, 1);
      exportBar.style.width = (progress * 100).toFixed(1) + '%';
      exportLabel.textContent = `Exporting... ${Math.round(progress * 100)}% (${fmtShort(elapsed)} / ${fmtShort(totalDur)})`;
      if (elapsed >= totalDur) {
        stopped = true; timerWorker.postMessage('stop'); timerWorker.terminate(); recorder.stop();
        if (reelVideoEl) { reelVideoEl.pause(); reelVideoEl.muted = true; }
        if (isAnimated) exportMediaEls.forEach(m => { if (m?.type === 'video') try { m.el.pause(); } catch {} else if (m?.type === 'video-clips') m.els.forEach(v => { try { v.pause(); } catch {} }); });
        return;
      }
      drawExportFrame(elapsed);
    };
    timerWorker.postMessage('start');
    await done;

    exportLabel.textContent = 'Finalizing...';
    exportBar.style.width = '100%';
    const videoBlob = new Blob(chunks, { type: mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(videoBlob);
    a.download = `stori-reel.${fileExt}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    setStatus(`Reel exported as ${fileExt.toUpperCase()} (${(videoBlob.size / 1048576).toFixed(1)} MB)`);
  } catch(e) {
    console.error('[ReelExport] Error:', e);
    setStatus('Export failed: ' + (e.message || 'Try a different browser or shorter duration.'));
  }
  exportProgress.classList.remove('visible');
}
if (btnReelExport) btnReelExport.addEventListener('click', () => exportSingleReel());

// ── Export All Reels ──
const btnReelExportAll = $('btn-reel-export-all');

function setReelExportEnabled(enabled) {
  [btnReelExport, btnReelExportAll, btnReelSaveProject, btnReelSaveTop, btnReelFullEditor].forEach(b => {
    if (b) b.disabled = !enabled;
  });
}
if (btnReelExportAll) btnReelExportAll.addEventListener('click', async () => {
  const results = window._reelMultiResults;
  if (!results || results.length === 0) return;
  btnReelExportAll.disabled = true;
  for (let ri = 0; ri < results.length; ri++) {
    const r = results[ri];
    reelAudioBuffer = r.audioBuffer;
    reelScenes = r.scenes;
    reelWords = r.words;
    activeReelPreview = ri;
    setStatus(`Exporting reel ${ri + 1} of ${results.length}...`);
    await exportSingleReel();
  }
  btnReelExportAll.disabled = false;
  setStatus(`All ${results.length} reels exported`);
});

// ── Open in Full Editor ──
async function openReelInFullEditor() {
  if (!reelAudioBuffer || !reelScenes) return;
  stopReelPreview();
  currentBuffer = reelAudioBuffer;
  photoItems = [];
  videoTimelineItems = [];
  const platform = REEL_PLATFORMS[reelPlatform];

  const activeResult = window._reelMultiResults?.[activeReelPreview];
  const activeWords = activeResult?.words?.length > 0 ? activeResult.words : reelWords;
  const vidStart = activeResult?.videoStart || 0;
  console.log('[ToEditor] scenes:', reelScenes.length, 'videoEl:', !!reelVideoEl, 'videoSrc:', !!reelVideoSrc, 'audioDur:', reelAudioBuffer?.duration);
  for (const scene of reelScenes) {
    console.log('[ToEditor] scene isVideo:', scene.isVideo, 'hasVideoEl:', !!reelVideoEl);
    if (scene.isVideo && reelVideoEl) {
      // Video scene → video timeline
      const tc = document.createElement('canvas'); tc.width = 160; tc.height = 90;
      try { tc.getContext('2d').drawImage(reelVideoEl, 0, 0, 160, 90); } catch(e) {}
      const thumbUrl = tc.toDataURL('image/jpeg', 0.6);
      const thumbImg = new Image(); thumbImg.src = thumbUrl;
      const clipDur = currentBuffer ? currentBuffer.duration : scene.duration;
      videoTimelineItems.push({
        id: nextVideoTimelineId++,
        videoEl: reelVideoEl, videoSrc: reelVideoSrc,
        videoDuration: reelVideoEl.duration,
        inPoint: vidStart, outPoint: vidStart + clipDur,
        startTime: 0, duration: clipDur,
        imgSrc: thumbUrl, imgEl: thumbImg,
      });
    } else if (scene.imgDataUrl) {
      // Image scene → photo timeline
      const img = new Image(); img.src = scene.imgDataUrl;
      photoItems.push({
        id: nextPhotoId++, imgSrc: scene.imgDataUrl, imgEl: img,
        startTime: scene.startTime, duration: scene.duration,
        transition: scene.transition || 'fade', transDur: scene.transDur || 0.3,
        motion: scene.motion || 'none',
      });
    }
  }

  console.log('[ToEditor] videoTimelineItems:', videoTimelineItems.length, 'photoItems:', photoItems.length);
  // Populate subtitle timeline blocks from reel words (canvas rendering still uses _editorReelSubtitle)
  subtitleItems = [];
  const _wordsForSubs = activeWords?.length > 0 ? activeWords : reelWords;
  if (_wordsForSubs && _wordsForSubs.length > 0) {
    for (let i = 0; i < _wordsForSubs.length; i += 5) {
      const group = _wordsForSubs.slice(i, i + 5);
      if (group.length === 0) continue;
      subtitleItems.push({
        id: nextSubtitleId++,
        text: group.map(w => w.word).join(' '),
        startTime: group[0].start,
        duration: group[group.length - 1].end - group[0].start,
        font: "'Poppins', sans-serif", fontSize: 32,
        color: reelSubColor || '#ffffff',
        strokeColor: reelSubOutline || '#000000', strokeWidth: 2,
        bgColor: '#000000', bgAlpha: reelSubBackdrop === 'none' ? 0 : 0.5,
        bold: true, position: reelSubPosition <= 20 ? 'top-center' : reelSubPosition <= 65 ? 'center' : 'bot-center',
        animation: 'none', animDur: 0,
      });
    }
  }

  // Transfer BGM + volume
  console.log('[ToEditor] BGM buffer:', !!reelBgmBuffer, 'audioEl:', !!reelBgmAudioEl, 'volume:', reelBgmVolume);
  if (reelBgmBuffer) {
    bgmBuffer = reelBgmBuffer; bgmVolume = reelBgmVolume;
    const bgmVol = $('bgm-volume'); if (bgmVol) bgmVol.value = Math.round(bgmVolume * 100);
    const bgmVolLbl = $('bgm-volume-label'); if (bgmVolLbl) bgmVolLbl.textContent = Math.round(bgmVolume * 100) + '%';
    const bgmNm = $('bgm-name'); if (bgmNm) bgmNm.textContent = `BGM (${fmtShort(bgmBuffer.duration)})`;
    const bgmSec = $('bgm-section'); if (bgmSec) { bgmSec.style.display = ''; console.log('[ToEditor] BGM section shown'); }
    if (typeof window.drawBgmWaveform === 'function') window.drawBgmWaveform();
  } else if (reelBgmAudioEl) {
    // BGM loaded via audio element (file:// fallback) — can't transfer buffer, but show info
    // Try to re-fetch and decode to AudioBuffer so export/editor can use it
    if (reelBgmAudioEl.src) {
      try {
        const resp = await fetch(reelBgmAudioEl.src);
        const arrayBuf = await resp.arrayBuffer();
        bgmBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf);
        bgmVolume = reelBgmVolume;
        const bgmVol = $('bgm-volume'); if (bgmVol) bgmVol.value = Math.round(bgmVolume * 100);
        const bgmVolLbl = $('bgm-volume-label'); if (bgmVolLbl) bgmVolLbl.textContent = Math.round(bgmVolume * 100) + '%';
        const bgmNm = $('bgm-name'); if (bgmNm) bgmNm.textContent = `BGM (${fmtShort(bgmBuffer.duration)})`;
        const bgmSec = $('bgm-section'); if (bgmSec) bgmSec.style.display = '';
        if (typeof window.drawBgmWaveform === 'function') window.drawBgmWaveform();
      } catch(e) { console.warn('[ToEditor] Could not decode BGM audio element:', e); }
    }
  }

  // Transfer frame settings
  window._editorReelFrame = {
    template: reelFrameTemplate,
    text: reelFrameText,
    bgColor: reelFrameBgColor,
    textColor: reelFrameTextColor,
    opacity: reelFrameOpacity,
    imgEl: reelFrameImgEl,
    imgSrc: reelFrameImgSrc,
    imgX: reelFrameImgX,
    imgY: reelFrameImgY,
    imgW: reelFrameImgW,
  };

  // Transfer overlay items
  window._editorReelOverlays = reelOverlayItems.map(o => ({ ...o }));
  console.log('[ToEditor] overlays:', reelOverlayItems.length, 'frame:', reelFrameTemplate, 'subtitle:', window._editorReelSubtitle?.style, 'subColor:', reelSubColor);

  // Transfer audio language tracks
  if (reelAudioTracks && reelAudioTracks.length > 0) {
    editorLanguageTracks = reelAudioTracks.map(t => ({
      lang: t.lang, langCode: t.langCode,
      audioBuffer: t.audioBuffer,
      translatedText: t.translatedText,
      subtitleLang: 'none',
    }));
    editorOriginalBuffer = currentBuffer;
    editorOriginalSubtitles = subtitleItems.map(s => ({ ...s }));
  }

  // Set image size — add option if not present
  if (createImageSize) {
    const sizeVal = `${platform.width}x${platform.height}`;
    if (!createImageSize.querySelector(`option[value="${sizeVal}"]`)) {
      const opt = document.createElement('option');
      opt.value = sizeVal;
      opt.textContent = `${platform.width}×${platform.height} — ${platform.width}:${platform.height}`;
      createImageSize.appendChild(opt);
    }
    createImageSize.value = sizeVal;
  }
  // Set video mode since reel is video-based
  if (videoTimelineItems.length > 0) bgVideoMode = 'video-only';
  // Store reel properties for editor preview
  window._editorReelSubtitle = {
    words: activeWords,
    style: reelSubtitleStyle,
    subSize: reelSubSize,
    subPosition: reelSubPosition,
    subColor: reelSubColor,
    subOutline: reelSubOutline,
    subBackdrop: reelSubBackdrop,
    subFont: reelSubFont,
    subAllCaps: reelSubAllCaps,
    subAccent: reelSubAccent,
  };
  console.log('[ToEditor] subtitle:', reelSubtitleStyle, 'font:', reelSubFont, 'allCaps:', reelSubAllCaps, 'accent:', reelSubAccent);
  // Sync subtitle panel controls in editor
  const rs = window._editorReelSubtitle;
  const srs = $('sub-reel-style'); if (srs) srs.value = rs.style;
  const src = $('sub-reel-color'); if (src) src.value = rs.subColor;
  const sro = $('sub-reel-outline'); if (sro) sro.value = rs.subOutline;
  const srb = $('sub-reel-backdrop'); if (srb) srb.value = rs.subBackdrop;
  const srz = $('sub-reel-size'); if (srz) srz.value = rs.subSize;
  const srl = $('sub-reel-size-label'); if (srl) srl.textContent = rs.subSize;
  const srpPos = parseSubPos(rs.subPosition ?? 85);
  const srp = $('sub-reel-pos'); if (srp) srp.value = subPosToStr(srpPos);
  const srpNum = $('sub-reel-pos-num'); if (srpNum) { srpNum.value = srpPos; const srpLbl = $('sub-reel-pos-label'); if (srpLbl) srpLbl.textContent = srpPos + '%'; }
  window._editorReelViewport = {
    mode: activeResult?.settings?.viewport || reelViewport || 'fill-center',
    panX: activeResult?.settings?.viewportX ?? reelViewportX ?? 50,
  };
  // Update bg video mode selector if present
  const bgModeEl = $('bg-video-mode');
  if (bgModeEl) bgModeEl.value = bgVideoMode;

  // Setup reel tabs if multi-reel
  const multiResults = window._reelMultiResults;
  if (multiResults && multiResults.length > 1) {
    window._editorReels = multiResults.map((r, i) => ({
      index: i, label: `Reel ${i + 1} (🔊${r.audioLangLabel || 'Orig'} 💬${r.subtitleLangLabel || 'Orig'})`,
      audioBuffer: r.audioBuffer, scenes: r.scenes, words: r.words,
      videoStart: r.videoStart, videoEnd: r.videoEnd,
    }));
    window._editorReelActive = 0;
    renderEditorReelTabs();
  }

  navigateTo('editor');
  reelMode = false;
  // Show back-to-reel button
  const btnBackToReel2 = $('btn-back-to-reel');
  if (btnBackToReel2) btnBackToReel2.classList.remove('hidden');
  // Load audio waveform
  if (currentBuffer) {
    try { await refreshWaveform(); } catch(e) { console.warn('Waveform load error:', e); }
  }
  updateAudioControls();
  applyEditorPlanGating();
  loadEditorLibrary();
  if (typeof renderVideoTimeline === 'function') renderVideoTimeline();
  drawRuler(); renderPhotos(); renderTexts(); renderSubtitles();
  if (typeof window._forceInlineRender === 'function') window._forceInlineRender();
  else if (typeof showInlinePreview === 'function') showInlinePreview();
  if (typeof window._showReelPropsPanel === 'function') window._showReelPropsPanel();
  if (typeof setupEditorLanguageSelector === 'function' && editorLanguageTracks.length > 0) setupEditorLanguageSelector();
  const items = photoItems.length + videoTimelineItems.length;
  setStatus(`Reel transferred to editor: ${items} items, ${subtitleItems.length} subtitles`);
}
if (btnReelFullEditor) btnReelFullEditor.addEventListener('click', () => openReelInFullEditor());

function renderEditorReelTabs() {
  const tabsEl = $('editor-reel-tabs');
  if (!tabsEl || !window._editorReels) return;
  const reels = window._editorReels;
  tabsEl.classList.remove('hidden');
  // Generate thumbnails for each reel
  tabsEl.innerHTML = reels.map((r, i) => {
    let thumbHtml = '';
    if (reelVideoSrc) {
      thumbHtml = `<video src="${reelVideoSrc}" style="width:48px; height:28px; object-fit:cover; border-radius:3px; pointer-events:none;" muted data-seek="${r.videoStart}"></video>`;
    }
    return `<button class="editor-reel-tab ${i === window._editorReelActive ? 'active' : ''}" data-reel-tab="${i}">
      ${thumbHtml} ${r.label} (${fmtShort(r.videoEnd - r.videoStart)})
    </button>`;
  }).join('') + `<div class="reel-tab-actions"><button id="btn-export-all-reels" class="btn-xs primary">Export All Reels</button></div>`;
  // Seek thumbnails
  tabsEl.querySelectorAll('video[data-seek]').forEach(v => { v.currentTime = parseFloat(v.dataset.seek); });

  tabsEl.querySelectorAll('.editor-reel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const idx = parseInt(tab.dataset.reelTab);
      loadEditorReel(idx);
    });
  });
  const exportAllBtn = $('btn-export-all-reels');
  if (exportAllBtn) exportAllBtn.addEventListener('click', () => {
    setStatus('Export All Reels — export each reel individually using the Export button.');
  });
}

function loadEditorReel(idx) {
  const reels = window._editorReels;
  if (!reels || !reels[idx]) return;
  window._editorReelActive = idx;
  const r = reels[idx];
  const platform = REEL_PLATFORMS[reelPlatform];

  // Load this reel's data into editor
  currentBuffer = r.audioBuffer;
  photoItems = [];
  videoTimelineItems = [];
  subtitleItems = [];

  for (const scene of r.scenes) {
    if (scene.isVideo && reelVideoEl) {
      const tc = document.createElement('canvas'); tc.width = 160; tc.height = 90;
      try { tc.getContext('2d').drawImage(reelVideoEl, 0, 0, 160, 90); } catch(e) {}
      const thumbUrl = tc.toDataURL('image/jpeg', 0.6);
      const thumbImg = new Image(); thumbImg.src = thumbUrl;
      videoTimelineItems.push({
        id: nextVideoTimelineId++, videoEl: reelVideoEl, videoSrc: reelVideoSrc,
        videoDuration: reelVideoEl.duration,
        inPoint: scene.startTime + (r.videoStart || 0), outPoint: scene.endTime + (r.videoStart || 0),
        startTime: scene.startTime, duration: scene.duration,
        imgSrc: thumbUrl, imgEl: thumbImg,
      });
    } else if (scene.imgDataUrl) {
      const img = new Image(); img.src = scene.imgDataUrl;
      photoItems.push({
        id: nextPhotoId++, imgSrc: scene.imgDataUrl, imgEl: img,
        startTime: scene.startTime, duration: scene.duration,
        transition: scene.transition || 'fade', transDur: scene.transDur || 0.3, motion: scene.motion || 'none',
      });
    }
  }

  // Populate subtitle timeline blocks from reel words (canvas rendering still uses _editorReelSubtitle)
  subtitleItems = [];
  if (r.words && r.words.length > 0) {
    for (let i = 0; i < r.words.length; i += 5) {
      const group = r.words.slice(i, i + 5);
      if (group.length === 0) continue;
      subtitleItems.push({
        id: nextSubtitleId++, text: group.map(w => w.word).join(' '),
        startTime: group[0].start, duration: group[group.length - 1].end - group[0].start,
        font: "'Poppins', sans-serif", fontSize: 32, color: reelSubColor || '#fff',
        strokeColor: reelSubOutline || '#000', strokeWidth: 2,
        bgColor: '#000', bgAlpha: 0.5, bold: true,
        position: reelSubPosition <= 20 ? 'top-center' : reelSubPosition <= 65 ? 'center' : 'bot-center',
        animation: 'none', animDur: 0,
      });
    }
  }

  updateAudioControls();
  if (typeof renderVideoTimeline === 'function') renderVideoTimeline();
  drawRuler(); renderPhotos(); renderTexts(); renderSubtitles();
  renderEditorReelTabs();
  setStatus(`Editing ${r.label}`);
}

// ── Load .storireel project ──
async function loadReelProject(project) {
  // Navigate to reel page
  navigateTo('reel');
  reelMode = true;
  // Load saved key into input + update inline status
  const savedKey = localStorage.getItem('stori_key_paid') || localStorage.getItem('stori_key_free');
  if (savedKey && reelApiKeyPaidEl) reelApiKeyPaidEl.value = savedKey;
  updateReelKeyInline();
  // Populate style dropdown
  if (reelStyleEl && reelStyleEl.options.length <= 1) {
    reelStyleEl.innerHTML = Object.entries(STYLE_PRESETS).map(([key, val]) =>
      `<option value="${key}">${key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>`
    ).join('');
  }

  // Restore settings
  reelPlatform = project.platform || 'instagram';
  reelDuration = project.duration || 60;
  reelSubtitleStyle = project.subtitleStyle || 'highlight';
  reelTransition = project.transition || 'whip-pan';
  reelVideoMode = project.videoMode || 'illustrated';
  reelSubColor = project.subColor || '#ffffff';
  reelSubOutline = project.subOutline || '#000000';
  reelSubBackdrop = project.subBackdrop || 'dark';
  reelSubSize = project.subSize || 4;
  reelSubPosition = parseSubPos(project.subPosition ?? 85);
  reelSubFont = project.subFont || 'Poppins';
  reelSubAllCaps = project.subAllCaps ?? false;
  reelSubAccent = project.subAccent || '#7c3aed';
  if (project.inputMode && project.inputMode !== 'text') reelInputMode = project.inputMode;
  if (project.segments) reelSegments = project.segments;
  reelJobs = [];

  // Update UI
  if (reelPlatformEl) reelPlatformEl.value = reelPlatform;
  if (reelDurationEl) reelDurationEl.value = reelDuration;
  if (reelSubtitleStyleEl) reelSubtitleStyleEl.value = reelSubtitleStyle;
  if (reelTransitionEl) reelTransitionEl.value = reelTransition;
  if (reelSubColorPreset) reelSubColorPreset.value = reelSubColor;
  if (reelSubOutlinePreset) reelSubOutlinePreset.value = reelSubOutline;
  if (reelSubBackdropPreset) reelSubBackdropPreset.value = reelSubBackdrop;
  const subSizeEl = $('reel-sub-size');
  if (subSizeEl) subSizeEl.value = reelSubSize;
  const subSizeLabel = $('reel-sub-size-label');
  if (subSizeLabel) subSizeLabel.textContent = reelSubSize;
  const subPosEl = $('reel-sub-position');
  if (subPosEl) subPosEl.value = subPosToStr(reelSubPosition);
  const subPosNumEl = $('reel-sub-position-num');
  if (subPosNumEl) { subPosNumEl.value = reelSubPosition; const spLbl = $('reel-sub-pos-label'); if (spLbl) spLbl.textContent = reelSubPosition + '%'; }
  setReelInputMode(reelInputMode);

  // Restore audio
  if (project.audio && project.audio.data) {
    try {
      showPageLoader('Restoring audio...');
      const arrayBuf = base64ToArrayBuffer(project.audio.data);
      const fullAudio = await ensureAudioCtx().decodeAudioData(arrayBuf);
      reelOriginalAudioBuffer = fullAudio;
      reelAudioBuffer = fullAudio;
      // Show audio info in section 2
      if (reelAudioName) reelAudioName.textContent = `Loaded audio (${fmtShort(fullAudio.duration)})`;
      hidePageLoader();
    } catch(e) { hidePageLoader(); setStatus('Could not restore audio'); }
  }

  // Restore video
  if (project.videoData) {
    try {
      showPageLoader('Restoring video...');
      const binary = atob(project.videoData.split(',')[1] || project.videoData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      reelVideoSrc = blobUrl;
      if (!reelVideoEl) {
        reelVideoEl = document.createElement('video');
        reelVideoEl.playsInline = true;
        reelVideoEl.muted = true;
        reelVideoEl.preload = 'auto';
      }
      reelVideoEl.src = blobUrl;
      await new Promise((resolve) => {
        reelVideoEl.onloadeddata = resolve;
        reelVideoEl.onerror = resolve;
      });
      hidePageLoader();
    } catch(e) { hidePageLoader(); console.warn('Could not restore video:', e); }
  }

  // Restore scenes + words
  reelWords = project.words || [];
  reelScenes = project.scenes || [];

  // Pre-load _img for each scene with imgDataUrl
  function preloadSceneImages(scenes) {
    const promises = [];
    for (const s of scenes) {
      if (s.imgDataUrl) {
        s.status = 'done';
        const img = new Image();
        s._img = img;
        promises.push(new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
          img.src = s.imgDataUrl;
        }));
      }
    }
    return Promise.all(promises);
  }

  // Restore frame, overlays, BGM volume
  reelFrameTemplate = project.frameTemplate || 'none';
  reelFrameText = project.frameText || '';
  reelFrameBgColor = project.frameBgColor || '#000000';
  reelFrameTextColor = project.frameTextColor || '#ffffff';
  reelFrameOpacity = project.frameOpacity ?? 1.0;
  if (project.frameImgSrc) {
    const fImg = new Image();
    fImg.onload = () => { reelFrameImgEl = fImg; };
    fImg.src = project.frameImgSrc;
    reelFrameImgSrc = project.frameImgSrc;
  }
  if (project.overlayItems && project.overlayItems.length > 0) {
    reelOverlayItems = project.overlayItems.map(o => ({ ...o }));
    nextOverlayId = Math.max(...reelOverlayItems.map(o => o.id), 0) + 1;
  } else {
    reelOverlayItems = [];
    nextOverlayId = 1;
  }
  if (project.bgmVolume != null) reelBgmVolume = project.bgmVolume;
  if (project.bgmData) {
    try {
      const arrayBuf = base64ToArrayBuffer(project.bgmData);
      reelBgmBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf);
      reelBgmAiBuffer = reelBgmBuffer;
      const bgmStep = $('reel-step-bgm');
      const bgmPlayer = $('reel-bgm-player');
      if (bgmStep) bgmStep.classList.remove('hidden');
      if (bgmPlayer) bgmPlayer.style.display = '';
      try {
        const wavBlob = audioBufferToWavBlob(reelBgmBuffer);
        initReelBgmWaveform(URL.createObjectURL(wavBlob));
      } catch(e) {}
    } catch(e) { console.warn('[Project] Could not restore BGM:', e); }
  }
  // Sync to editor globals
  window._editorReelFrame = { template: reelFrameTemplate, text: reelFrameText, bgColor: reelFrameBgColor, textColor: reelFrameTextColor, opacity: reelFrameOpacity, imgEl: reelFrameImgEl, imgSrc: reelFrameImgSrc };
  window._editorReelOverlays = reelOverlayItems.map(o => ({ ...o }));
  window._editorReelSubtitle = { words: reelWords, style: reelSubtitleStyle, subSize: reelSubSize, subPosition: reelSubPosition, subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subFont: reelSubFont, subAllCaps: reelSubAllCaps, subAccent: reelSubAccent };

  // Restore variation rows
  if (project.variationRows) reelVariationRows = project.variationRows;
  renderVariationRows();

  // Restore segments in presets
  if (reelSegments.length > 0) {
    renderReelPresetSegments();
  }

  // Restore multi results
  const savedResults = project.multiResults || [];
  const results = [];
  if (savedResults.length > 0) {
    showPageLoader('Restoring reels...');
    for (let ri = 0; ri < savedResults.length; ri++) {
      const r = savedResults[ri];
      let audioBuffer = reelAudioBuffer;
      if (r.audioData) {
        try {
          const buf = base64ToArrayBuffer(r.audioData);
          audioBuffer = await ensureAudioCtx().decodeAudioData(buf);
        } catch(e) {}
      } else if (reelSegments.length > 0 && reelOriginalAudioBuffer) {
        // Reconstruct segment audio from full original buffer
        const si = r.segmentIndex ?? ri;
        const seg = reelSegments[si];
        if (seg) audioBuffer = extractRegion(reelOriginalAudioBuffer, seg.start, seg.end);
      }
      const scenes = r.scenes || reelScenes;
      const si = r.segmentIndex ?? ri;
      for (const s of scenes) {
        if (s.segmentIndex == null) s.segmentIndex = si;
        if (s.videoData && !s.videoBlobUrl) {
          try {
            const b64 = s.videoData.includes(',') ? s.videoData.split(',')[1] : s.videoData;
            const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'video/mp4' });
            s.videoBlobUrl = URL.createObjectURL(blob);
          } catch (_) {}
        }
      }
      await preloadSceneImages(scenes);
      results.push({
        audioBuffer,
        scenes,
        words: r.words || reelWords,
        videoStart: r.videoStart ?? (reelSegments[si]?.start || 0),
        videoEnd: r.videoEnd ?? (reelSegments[si]?.end || audioBuffer.duration),
        audioLang: r.audioLang || 'original', subtitleLang: r.subtitleLang || 'original',
        audioLangLabel: r.audioLangLabel || 'Original', subtitleLangLabel: r.subtitleLangLabel || 'Original',
        segmentIndex: si,
        settings: r.settings || { subtitleStyle: reelSubtitleStyle, transition: reelTransition, subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition },
      });
    }
    hidePageLoader();
  }

  // If we have segments but fewer results (old save), reconstruct missing ones
  if (reelSegments.length > results.length && reelOriginalAudioBuffer) {
    for (let si = 0; si < reelSegments.length; si++) {
      if (results.some(r => r.segmentIndex === si)) continue; // already loaded
      const seg = reelSegments[si];
      const segAudio = extractRegion(reelOriginalAudioBuffer, seg.start, seg.end);
      results.push({
        audioBuffer: segAudio,
        scenes: [], words: [],
        videoStart: seg.start, videoEnd: seg.end,
        audioLang: 'original', subtitleLang: 'original',
        audioLangLabel: 'Original', subtitleLangLabel: 'Original',
        segmentIndex: si,
        settings: { subtitleStyle: reelSubtitleStyle, transition: reelTransition, subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition, subFont: reelSubFont, subAllCaps: reelSubAllCaps, subAccent: reelSubAccent },
        needsRegeneration: true,
      });
    }
  }

  // If no results at all, create one from main scenes
  if (results.length === 0 && reelAudioBuffer && reelScenes.length > 0) {
    await preloadSceneImages(reelScenes);
    results.push({
      audioBuffer: reelAudioBuffer, scenes: reelScenes, words: reelWords,
      videoStart: 0, videoEnd: reelAudioBuffer.duration,
      audioLang: 'original', subtitleLang: 'original',
      audioLangLabel: 'Original', subtitleLangLabel: 'Original',
      segmentIndex: 0,
      settings: { subtitleStyle: reelSubtitleStyle, transition: reelTransition, subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition, subFont: reelSubFont, subAllCaps: reelSubAllCaps, subAccent: reelSubAccent },
    });
  }

  window._reelMultiResults = results;
  activeReelPreview = 0;
  if (results.length > 0) {
    reelAudioBuffer = results[0].audioBuffer;
    reelScenes = results[0].scenes;
    reelWords = results[0].words;
  }

  // Restore job queue (new format)
  if (project.jobs && project.jobs.length > 0) {
    reelJobs = project.jobs.map(jData => {
      const matchingResult = results.find(r => r.segmentIndex === jData.id);
      let audioBuffer = reelAudioBuffer;
      if (jData.type === 'segment' && reelOriginalAudioBuffer && jData.segStart != null) {
        try { audioBuffer = extractRegion(reelOriginalAudioBuffer, jData.segStart, jData.segEnd); } catch(e) {}
      } else if (matchingResult) {
        audioBuffer = matchingResult.audioBuffer;
      }
      return { ...jData, audioBuffer, scenes: matchingResult?.scenes || [], words: matchingResult?.words || [], error: null };
    });
    nextReelJobId = Math.max(...reelJobs.map(j => j.id), 0) + 1;
  }

  // Show section 3 (presets) with segments
  if (reelStepPresets) reelStepPresets.classList.remove('hidden');
  if (reelJobs.length > 0) { renderReelJobCards(); } else if (reelSegments.length > 0) { renderReelPresetSegments(); }

  // Show section 3.5 (scene images) — collect from all results
  const allLoadedScenes = results.flatMap(r => r.scenes || []);
  const hasImages = allLoadedScenes.some(s => s.imgDataUrl);
  if (hasImages) {
    reelPendingScenes = allLoadedScenes;
    if (reelStepScenes) reelStepScenes.classList.remove('hidden');
    renderReelSceneGrid(reelPendingScenes);
    if (reelVideoMode === 'animated' && allLoadedScenes.some(s => s.videoBlobUrl)) {
      allLoadedScenes.forEach(s => { if (s.videoBlobUrl) s.videoUrl = s.videoBlobUrl; });
      renderReelVideoCards();
    }
  }

  // Show section 4 (preview)
  if (results.length > 0) {
    showReelEditorStep();
    renderReelScenes();
    renderReelFrame(0);
    renderAllReelPreviews();
    renderOverlayChips();
  }

  // Status
  const needsRegen = results.filter(r => r.needsRegeneration);
  if (needsRegen.length > 0) {
    setStatus(`Project loaded. ${needsRegen.length} reel(s) need re-generation — click Generate Reel.`);
  } else {
    setStatus(`Project loaded — ${results.length} reel(s)`);
  }
  if (typeof inferReelAgentStates === 'function') inferReelAgentStates();
}

// ── Back to Reel from Editor ──
const btnBackToReel = $('btn-back-to-reel');
if (btnBackToReel) btnBackToReel.addEventListener('click', () => {
  navigateTo('reel');
  reelMode = true;
  btnBackToReel.classList.add('hidden');
  // Hide reel tabs in editor
  const tabsEl = $('editor-reel-tabs');
  if (tabsEl) tabsEl.classList.add('hidden');
  if (typeof inferReelAgentStates === 'function') inferReelAgentStates();
});

// ── Pipeline job handoff (from marketing-pipeline) ──
function idbRead(key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('stori_db', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction('kv', 'readonly');
      const get = tx.objectStore('kv').get(key);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('stori_db', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

async function checkPipelineJob() {
  try {
    const project = await idbRead('stori_pipeline_job');
    if (!project) return;
    await idbDelete('stori_pipeline_job');
    await loadReelProject(project);
  } catch (e) {
    console.warn('[Pipeline] Failed to load pipeline job:', e);
  }
}

// Run after scripts finish loading
setTimeout(checkPipelineJob, 500);
