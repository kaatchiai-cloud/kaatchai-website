// ══════════════════════════════════════════
//  REEL / SHORT CREATOR
// ══════════════════════════════════════════
const reelPage = $('reel-page');
const btnCreateReel = $('btn-create-reel');
const btnReelBack = $('btn-reel-back');
const reelStepInput = $('reel-step-input');
const reelStepPresets = $('reel-step-presets');
const reelStepEditor = $('reel-step-editor');

// Input mode
const reelModeAudio = $('reel-mode-audio');
const reelModeText = $('reel-mode-text');
const reelModeVideo = $('reel-mode-video');
const reelAudioSection = $('reel-audio-section');
const reelTextSection = $('reel-text-section');
const reelVideoSection = $('reel-video-section');
const reelAudioInput = $('reel-audio-input');
const reelAudioName = $('reel-audio-name');
const reelVideoInput = $('reel-video-input');
const reelVideoName = $('reel-video-name');
const reelTextInput = $('reel-text-input');
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
let reelInputMode = 'audio'; // audio | text | video
let reelVideoEl = null;
let reelVideoSrc = null;
let reelWavesurfer = null;
let reelRegion = null;
let reelPlaying = false;
let reelAnimId = null;
let reelStartTime = 0;
let reelBgmBuffer = null;
let reelSegments = []; // [{start, end, thumbDataUrl}] — each becomes a separate reel
let reelOriginalAudioBuffer = null; // preserve full audio for multi-segment extraction
let reelPendingScenes = null; // scenes awaiting image generation (audio/text mode)
let reelGenImagesPaused = false;
let reelGenImagesRunning = false;

// Variation rows: each row = one reel variant (audio lang + subtitle lang)
let reelVariationRows = [{ platform: 'instagram', duration: 60, audio: 'original', subtitle: 'original' }];
let reelPerSegmentVariations = {}; // segIndex → rows array, null = use global
const REEL_LANG_OPTIONS = { original: 'Original', en: 'English', ta: 'Tamil', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', es: 'Spanish', fr: 'French' };

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
function getReelApiKey() { return getReelPaidKey(); }
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
});

let reelEditMode = 'subtitles'; // subtitles | auto-cut

// ── Navigation ──
if (btnCreateReel) btnCreateReel.addEventListener('click', () => {
  navigateTo('reel');
  reelMode = true;
  // Load saved keys
  const savedFree = localStorage.getItem('stori_key_free');
  const savedPaid = localStorage.getItem('stori_key_paid');
  if (savedFree && reelApiKeyFreeEl) { reelApiKeyFreeEl.value = savedFree; reelKeyStatusFree.textContent = '✓ Saved'; reelKeyStatusFree.style.color = '#10b981'; }
  if (savedPaid && reelApiKeyPaidEl) { reelApiKeyPaidEl.value = savedPaid; reelKeyStatusPaid.textContent = '✓ Saved'; reelKeyStatusPaid.style.color = '#10b981'; }
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
  stopReelPreview();
});

// ── Input Mode Toggle ──
function setReelInputMode(mode) {
  reelInputMode = mode;
  reelModeAudio.classList.toggle('active', mode === 'audio');
  reelModeText.classList.toggle('active', mode === 'text');
  reelModeVideo.classList.toggle('active', mode === 'video');
  reelAudioSection.classList.toggle('hidden', mode !== 'audio');
  reelTextSection.classList.toggle('hidden', mode !== 'text');
  reelVideoSection.classList.toggle('hidden', mode !== 'video');
  // Video mode: show edit mode toggle, hide visual style (video has its own visuals)
  const editModeRow = $('reel-edit-mode-row');
  if (editModeRow) editModeRow.classList.toggle('hidden', mode !== 'video');
  // Hide style + transition for video mode (not needed — video is the visual)
  // Duration only relevant for text mode (audio/video have inherent duration)
  const durLabel = $('reel-duration-label');
  if (durLabel) durLabel.style.display = mode === 'text' ? '' : 'none';
  if (reelStyleEl) reelStyleEl.closest('label').style.display = mode === 'video' ? 'none' : '';
  if (reelTransitionEl) reelTransitionEl.closest('label').style.display = (mode === 'video' && reelEditMode === 'subtitles') ? 'none' : '';
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
if (reelModeText) reelModeText.addEventListener('click', () => setReelInputMode('text'));
// Apply initial mode visibility
setReelInputMode(reelInputMode);

function showReelPresets() {
  if (reelStepPresets) reelStepPresets.classList.remove('hidden');
}

// Show presets when text is entered
if (reelTextInput) reelTextInput.addEventListener('input', () => {
  if (reelTextInput.value.trim().length > 10) showReelPresets();
});
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
  reelSegments.push({ start, end, thumbDataUrl: null });
  reelOriginalAudioBuffer = reelAudioBuffer;
  renderReelPresetSegments();
  showReelPresets();
});

if (btnReelImportAudio) btnReelImportAudio.addEventListener('click', () => reelAudioInput.click());
if (reelAudioInput) reelAudioInput.addEventListener('change', async () => {
  const file = reelAudioInput.files[0];
  if (!file) return;
  reelAudioInput.value = '';
  try {
    showPageLoader('Decoding audio...');
    const arrayBuf = await file.arrayBuffer();
    reelAudioBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf);
    reelOriginalAudioBuffer = reelAudioBuffer;
    reelAudioName.textContent = `${file.name} (${fmtShort(reelAudioBuffer.duration)})`;
    reelSegments = [];
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
    const tc = document.createElement('canvas');
    tc.width = 100; tc.height = 56;
    try { tc.getContext('2d').drawImage(reelPreviewVideo, 0, 0, 100, 56); } catch(e) {}
    const thumbDataUrl = tc.toDataURL('image/jpeg', 0.6);

    reelSegments.push({ start, end, thumbDataUrl });
    renderReelPresetSegments();
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

// ── Preset handlers ──
function updateReelAspectRatio() {
  const p = REEL_PLATFORMS[reelPlatform];
  if (p) document.documentElement.style.setProperty('--reel-aspect', `${p.width}/${p.height}`);
}
if (reelPlatformEl) reelPlatformEl.addEventListener('change', () => { reelPlatform = reelPlatformEl.value; updateReelAspectRatio(); });
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
  console.log('[ReelGen] Generate clicked, inputMode:', reelInputMode);
  const key = getReelApiKey();
  console.log('[ReelGen] API key:', key ? 'present' : 'MISSING');
  if (!key) { reelGenerateStatus.textContent = 'Enter your API key in Step 1 first.'; return; }

  // Multi-segment mode (video or audio) — process each as separate reel
  if (reelSegments.length > 0 && (reelInputMode === 'video' ? reelVideoEl : reelAudioBuffer)) {
    btnReelGenerate.disabled = true;
    reelProgressEl.classList.remove('hidden');
    const allReelResults = [];
    for (let si = 0; si < reelSegments.length; si++) {
      const seg = reelSegments[si];
      reelProgressLabel.textContent = `Processing Reel ${si + 1} of ${reelSegments.length}...`;
      reelProgressBar.style.width = `${(si / reelSegments.length * 100).toFixed(0)}%`;
      setStatus(`Processing Reel ${si + 1}/${reelSegments.length}...`, true);

    try {
      // Extract audio for this segment from original full buffer
      const segAudio = extractRegion(reelOriginalAudioBuffer || reelAudioBuffer, seg.start, seg.end);
      const platform = REEL_PLATFORMS[reelPlatform];
      const transPreset = REEL_TRANSITIONS[reelTransition] || REEL_TRANSITIONS['whip-pan'];

      // Transcribe segment
      const wavBlob = audioBufferToWavBlob(segAudio);
      const b64Audio = await blobToBase64(wavBlob);
      const transcribeBody = {
        contents: [{ parts: [
          { inlineData: { mimeType: 'audio/wav', data: b64Audio.split(',')[1] } },
          { text: `Audio duration: ${segAudio.duration.toFixed(1)} seconds. Transcribe into 6-9 segments at natural sentence boundaries, each 6-10 seconds. The "text" field must be the original language transcription. The "sceneDescription" field must always be in English — a vivid visual description of what could be shown as an image for that segment. Return JSON array: [{"startTime": 0.0, "endTime": 8.0, "text": "...", "sceneDescription": "vivid English visual description", "words": [{"word": "...", "start": 0.0, "end": 0.4}]}].` }
        ]}]
      };
      const transcribeData = await callGeminiAPI(getTranscriptionModels(), transcribeBody, key);
      trackCost('transcription', 1);
      let segments = parseGeminiJson(transcribeData.candidates?.[0]?.content?.parts?.[0]?.text);
      segments = clampSegments(segments, 6, 9);

      const words = [];
      for (const s of segments) {
        if (s.words && s.words.length > 0) {
          words.push(...s.words);
        } else if (s.text) {
          const wds = s.text.trim().split(/\s+/);
          const sStart = s.startTime || 0;
          const sEnd = s.endTime || segAudio.duration;
          const sDur = Math.max(0.1, sEnd - sStart);
          const wDur = sDur / Math.max(1, wds.length);
          wds.forEach((w, wi) => { words.push({ word: w, start: sStart + wi * wDur, end: sStart + (wi + 1) * wDur }); });
        }
      }
      // Final fallback: if still no words, create from all segment texts
      if (words.length === 0 && segments.length > 0) {
        const allText = segments.map(s => s.text || '').join(' ').trim().split(/\s+/);
        const totalDur = segAudio.duration;
        const wDur = totalDur / Math.max(1, allText.length);
        allText.forEach((w, i) => { words.push({ word: w, start: i * wDur, end: (i + 1) * wDur }); });
      }
      console.log(`[ReelGen] Segment ${si+1}: ${segments.length} segments, ${words.length} words generated`);

      const isVidInput = reelInputMode === 'video' && reelVideoEl;
      let scenes;
      if (isVidInput && reelEditMode === 'subtitles') {
        scenes = [{ startTime: 0, endTime: segAudio.duration, duration: segAudio.duration, text: segments.map(s => s.text).join(' '), words, imgDataUrl: null, status: 'done', isVideo: true, transition: 'none', transDur: 0, motion: 'none' }];
      } else if (isVidInput) {
        scenes = segments.map(s => ({ startTime: s.startTime, endTime: s.endTime, duration: s.endTime - s.startTime, text: s.text, words: s.words || [], imgDataUrl: null, status: 'done', isVideo: true, transition: transPreset.transition, transDur: transPreset.transDur, motion: 'none' }));
      } else {
        // Audio/text mode: scenes need image generation
        const totalDur = segAudio.duration;
        scenes = segments.map((s, si2) => {
          const st = typeof s.startTime === 'number' ? s.startTime : (si2 / segments.length) * totalDur;
          const en = typeof s.endTime === 'number' ? s.endTime : ((si2 + 1) / segments.length) * totalDur;
          return { prompt: s.sceneDescription || s.text, startTime: st, endTime: en, duration: en - st, text: s.text, words: s.words || [], imgDataUrl: null, status: 'pending', transition: transPreset.transition, transDur: transPreset.transDur, motion: transPreset.motion, segmentIndex: si };
        });
      }

      allReelResults.push({
        audioBuffer: segAudio, scenes, words, videoStart: seg.start, videoEnd: seg.end,
        lang: 'original', langLabel: 'Original', segmentIndex: si,
        audioLang: 'original', subtitleLang: 'original',
        audioLangLabel: 'Original', subtitleLangLabel: 'Original',
        settings: { subtitleStyle: reelSubtitleStyle, transition: reelTransition, viewport: reelViewport, viewportX: reelViewportX, subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition },
      });
    } catch(segErr) {
      reelProgressLabel.textContent = `Reel ${si + 1} failed: ${friendlyApiError(segErr.message)}`;
    }
    }

    // Show results — all segments
    reelProgressBar.style.width = '100%';
    reelProgressEl.classList.add('hidden');

    if (allReelResults.length === 0) {
      reelProgressLabel.textContent = 'No reels generated. Check API key and try again.';
      setStatus('Generation failed — no reels produced');
      btnReelGenerate.disabled = false;
      return;
    }

    // Audio/text mode with segments: generate images automatically, then preview
    const hasImageScenes = allReelResults.some(r => r.scenes.some(s => s.status === 'pending'));
    if (hasImageScenes) {
      // Collect all pending scenes across segments, store allReelResults for later
      reelPendingScenes = [];
      for (const r of allReelResults) {
        for (const s of r.scenes) reelPendingScenes.push(s);
      }
      // Store original audio/words for building variations later
      window._reelMultiSegResults = allReelResults;
      reelAudioBuffer = allReelResults[0].audioBuffer;
      reelWords = allReelResults[0].words;
      reelScenes = allReelResults[0].scenes;

      // Show scene cards and auto-generate images
      if (reelStepScenes) reelStepScenes.classList.remove('hidden');
      renderReelSceneGrid(reelPendingScenes);
      await reelRunImageGeneration(reelPendingScenes.filter(s => s.status === 'pending'));
      // Proceed to preview automatically
      await reelBuildVariationsAndPreview();
      btnReelGenerate.disabled = false;
      return;
    }

    reelProgressLabel.textContent = `${allReelResults.length} Reel(s) ready!`;
    setStatus(`${allReelResults.length} Reels generated`);
    window._reelMultiResults = allReelResults;

    // Generate variation rows for each segment
    // allReelResults currently has one original reel per segment
    // Now expand: for each original reel, generate additional variations from reelVariationRows
    const origReels = [...allReelResults];
    const finalResults = [];
    const translationCache = {}; // langCode → translated text (per segment, cleared each loop)
    const ttsCache = {}; // langCode → audioBuffer

    console.log('[ReelGen] Variation rows:', JSON.stringify(reelVariationRows));
    for (const origReel of origReels) {
      const segVariations = reelPerSegmentVariations[origReel.segmentIndex] || reelVariationRows;
      console.log('[ReelGen] Seg', origReel.segmentIndex, 'variations:', JSON.stringify(segVariations));
      for (const v of segVariations) {
        const isOrigAudio = v.audio === 'original';
        const isOrigSub = v.subtitle === 'original';
        const origText = origReel.words?.map(w => w.word).join(' ') || '';

        // Subtitle words
        let subWords = origReel.words;
        if (!isOrigSub && origText) {
          const cacheKey = `sub_${v.subtitle}_${origReel.segmentIndex}`;
          if (!translationCache[cacheKey]) {
            reelProgressLabel.textContent = `Translating subtitle to ${REEL_LANG_OPTIONS[v.subtitle]}...`;
            setStatus(`Translating subtitle to ${REEL_LANG_OPTIONS[v.subtitle]}...`, true);
            try {
              const transBody = { contents: [{ parts: [{ text: `Translate to ${REEL_LANG_OPTIONS[v.subtitle]}. Return ONLY the translated text:\n\n${origText}` }] }] };
              const transData = await callGeminiAPI(getTranscriptionModels(), transBody, key);
              trackCost('textGeneration', 1);
              translationCache[cacheKey] = transData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            } catch(e) { reelProgressLabel.textContent = `${REEL_LANG_OPTIONS[v.subtitle]} subtitle failed`; }
          }
          if (translationCache[cacheKey]) {
            const transWords = translationCache[cacheKey].split(/\s+/);
            const totalDur = origReel.words.length > 0 ? origReel.words[origReel.words.length - 1].end - origReel.words[0].start : 0;
            const wDur = totalDur / Math.max(1, transWords.length);
            const st = origReel.words.length > 0 ? origReel.words[0].start : 0;
            subWords = transWords.map((w, i) => ({ word: w, start: st + i * wDur, end: st + (i + 1) * wDur }));
          }
        }

        // Audio buffer
        let audioBuffer = origReel.audioBuffer;
        console.log(`[ReelGen] Audio: isOrig=${isOrigAudio}, lang=${v.audio}, hasText=${!!origText}`);
        if (!isOrigAudio && origText) {
          const cacheKey = `tts_${v.audio}_${origReel.segmentIndex}`;
          if (!ttsCache[cacheKey]) {
            // First translate text for TTS
            const ttsCacheKey = `sub_${v.audio}_${origReel.segmentIndex}`;
            let ttsText = translationCache[ttsCacheKey];
            if (!ttsText) {
              reelProgressLabel.textContent = `Translating audio to ${REEL_LANG_OPTIONS[v.audio]}...`;
              console.log(`[ReelGen] Translating for TTS: ${v.audio}`);
              try {
                const targetDur = origReel.audioBuffer.duration;
                const transBody = { contents: [{ parts: [{ text: `Translate the following to ${REEL_LANG_OPTIONS[v.audio]}. The original audio is ${Math.round(targetDur)} seconds long. Keep the translation concise enough to be spoken in approximately the same duration. Do NOT add extra explanations or expand the content. Return ONLY the translated text:\n\n${origText}` }] }] };
                const transData = await callGeminiAPI(getTranscriptionModels(), transBody, key);
                trackCost('textGeneration', 1);
                ttsText = transData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                translationCache[ttsCacheKey] = ttsText;
                console.log(`[ReelGen] Translation done, length: ${ttsText?.length}`);
              } catch(e) { console.error(`[ReelGen] Translation failed:`, e); reelProgressLabel.textContent = `${REEL_LANG_OPTIONS[v.audio]} translation failed`; }
            }
            if (ttsText) {
              reelProgressLabel.textContent = `Generating ${REEL_LANG_OPTIONS[v.audio]} audio...`;
              setStatus(`Generating ${REEL_LANG_OPTIONS[v.audio]} TTS...`, true);
              console.log(`[ReelGen] Calling TTS for: ${v.audio}`);
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
                console.log(`[ReelGen] TTS response: ${ttsResp.status}`);
                if (ttsResp.ok) {
                  const ttsData = await ttsResp.json();
                  const part = ttsData.candidates?.[0]?.content?.parts?.[0];
                  if (part?.inlineData?.data) {
                    const decoded = await decodeBase64Audio(part.inlineData.data, part.inlineData.mimeType || 'audio/wav');
                    ttsCache[cacheKey] = decoded.audioBuffer;
                    trackCost('ttsPerLang', 1);
                    console.log(`[ReelGen] TTS audio decoded, duration: ${ttsCache[cacheKey].duration}s`);
                  } else {
                    console.error(`[ReelGen] TTS response structure:`, JSON.stringify(ttsData).substring(0, 1000));
                  }
                } else {
                  const errText = await ttsResp.text();
                  console.error(`[ReelGen] TTS failed ${ttsResp.status}:`, errText);
                }
              } catch(e) { console.error(`[ReelGen] TTS error:`, e); reelProgressLabel.textContent = `${REEL_LANG_OPTIONS[v.audio]} TTS failed`; }
            }
          }
          if (ttsCache[cacheKey]) {
            audioBuffer = ttsCache[cacheKey];
            // Stretch/compress TTS audio to match original duration
            const targetDur = origReel.audioBuffer.duration;
            if (Math.abs(audioBuffer.duration - targetDur) > 0.5) {
              console.log(`[ReelGen] Matching TTS duration ${audioBuffer.duration.toFixed(1)}s → ${targetDur.toFixed(1)}s`);
              const rate = audioBuffer.duration / targetDur;
              const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, Math.round(targetDur * audioBuffer.sampleRate), audioBuffer.sampleRate);
              const src = offlineCtx.createBufferSource();
              src.buffer = audioBuffer;
              src.playbackRate.value = rate;
              src.connect(offlineCtx.destination);
              src.start();
              audioBuffer = await offlineCtx.startRendering();
              ttsCache[cacheKey] = audioBuffer;
            }
          }
          console.log(`[ReelGen] Final audio: ${audioBuffer === origReel.audioBuffer ? 'ORIGINAL (fallback)' : 'TRANSLATED'}`);
        }

        finalResults.push({
          audioBuffer, scenes: origReel.scenes, words: subWords,
          videoStart: origReel.videoStart, videoEnd: origReel.videoEnd,
          audioLang: v.audio, subtitleLang: v.subtitle,
          audioLangLabel: REEL_LANG_OPTIONS[v.audio],
          subtitleLangLabel: REEL_LANG_OPTIONS[v.subtitle],
          lang: v.subtitle, langLabel: REEL_LANG_OPTIONS[v.subtitle],
          segmentIndex: origReel.segmentIndex,
          settings: { ...origReel.settings },
        });
      }
    }

    window._reelMultiResults = finalResults;

    // Use first for main preview
    if (finalResults.length === 0) {
      reelProgressLabel.textContent = 'No reels generated.';
      setStatus('Generation failed');
      btnReelGenerate.disabled = false;
      return;
    }
    const first = finalResults[0];
    reelAudioBuffer = first.audioBuffer;
    reelScenes = first.scenes;
    reelWords = first.words;
    activeReelPreview = 0;

    reelStepEditor.classList.remove('hidden');
    renderReelScenes();
    renderReelFrame(0);
    renderAllReelPreviews();
    reelProgressEl.classList.add('hidden');
    reelGenerateStatus.textContent = `${finalResults.length} Reel(s) ready`;
    setStatus(`${finalResults.length} Reel(s) ready`);
    btnReelGenerate.disabled = false;
    return;
  }

  // Get audio — from text input if text mode
  if (reelInputMode === 'text') {
    const text = reelTextInput.value.trim();
    if (!text) { reelGenerateStatus.textContent = 'Enter some text.'; return; }
    reelGenerateStatus.textContent = 'Generating audio from text...';
    setStatus('Generating TTS...', true);
    try {
      const ttsModels = getTTSModels();
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${ttsModels[0]}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text }] }],
            generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
          })
        }
      );
      if (!resp.ok) throw new Error('TTS failed');
      const data = await resp.json();
      const part = data.candidates?.[0]?.content?.parts?.[0];
      if (!part?.inlineData?.data) throw new Error('No audio returned');
      const b64 = part.inlineData.data;
      const binary = atob(b64);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
      const audioArrayBuf = buf.buffer;
      reelAudioBuffer = await ensureAudioCtx().decodeAudioData(audioArrayBuf);
      trackCost('tts', 1);
    } catch(e) {
      reelGenerateStatus.textContent = 'TTS error: ' + e.message;
      setStatus('TTS failed');
      return;
    }
  }

  if (!reelAudioBuffer) { reelGenerateStatus.textContent = 'Import audio or enter text first.'; return; }

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
  reelProgressEl.classList.remove('hidden');

  try {
    // Step 1: Transcribe with word-level timestamps
    reelProgressLabel.textContent = 'Transcribing...';
    reelProgressBar.style.width = '10%';
    setStatus('Transcribing audio...', true);

    const wavBlob = audioBufferToWavBlob(reelAudioBuffer);
    const b64Audio = await blobToBase64(wavBlob);

    const transcribeBody = {
      contents: [{ parts: [
        { inlineData: { mimeType: 'audio/wav', data: b64Audio.split(',')[1] } },
        { text: `Audio duration: ${reelAudioBuffer.duration.toFixed(1)} seconds. Transcribe into 6-9 segments at natural sentence boundaries, each 6-10 seconds. The "text" field must be the original language transcription. The "sceneDescription" field must always be in English — a vivid visual description of what could be shown as an image for that segment. Return JSON array: [{"startTime": 0.0, "endTime": 8.0, "text": "...", "sceneDescription": "vivid English visual description", "words": [{"word": "...", "start": 0.0, "end": 0.4}]}].` }
      ]}]
    };
    const transcribeData = await callGeminiAPI(getTranscriptionModels(), transcribeBody, key);
    trackCost('transcription', 1);
    const transcribeText = transcribeData.candidates?.[0]?.content?.parts?.[0]?.text;
    let segments = parseGeminiJson(transcribeText);
    segments = clampSegments(segments, 6, 9);

    // Collect all words for subtitle rendering
    reelWords = [];
    for (const seg of segments) {
      if (seg.words && seg.words.length > 0) {
        reelWords.push(...seg.words);
      } else if (seg.text) {
        // Fallback: generate proportional word timings from segment text
        const wds = seg.text.trim().split(/\s+/);
        const sStart = seg.startTime || 0;
        const sEnd = seg.endTime || reelAudioBuffer.duration;
        const sDur = Math.max(0.1, sEnd - sStart);
        const wDur = sDur / Math.max(1, wds.length);
        wds.forEach((w, i) => {
          reelWords.push({ word: w, start: sStart + i * wDur, end: sStart + (i + 1) * wDur });
        });
      }
    }
    // Final fallback: if still no words, create from all segment texts
    if (reelWords.length === 0 && segments.length > 0) {
      const allText = segments.map(s => s.text || '').join(' ').trim().split(/\s+/);
      const totalDur = reelAudioBuffer.duration;
      const wDur = totalDur / Math.max(1, allText.length);
      allText.forEach((w, i) => { reelWords.push({ word: w, start: i * wDur, end: (i + 1) * wDur }); });
    }
    console.log(`[ReelGen] Single: ${segments.length} segments, ${reelWords.length} words`);

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
      await reelRunImageGeneration(reelPendingScenes.filter(s => s.status === 'pending'));
    }

    // Generate variation rows
    const origReel = { audioBuffer: reelAudioBuffer, scenes: reelScenes, words: reelWords, videoStart: 0, videoEnd: reelAudioBuffer.duration, segmentIndex: 0, settings: { subtitleStyle: reelSubtitleStyle, transition: reelTransition, viewport: reelViewport, viewportX: reelViewportX, subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition } };
    const singleResults = [];
    const translationCache = {};
    const ttsCache = {};
    const origText = reelWords?.map(w => w.word).join(' ') || '';

    for (const v of reelVariationRows) {
      const isOrigAudio = v.audio === 'original';
      const isOrigSub = v.subtitle === 'original';

      // Subtitle words
      let subWords = origReel.words;
      if (!isOrigSub && origText) {
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
    }

    window._reelMultiResults = singleResults;
    activeReelPreview = 0;

    // Show mini editor
    reelProgressBar.style.width = '100%';
    reelProgressLabel.textContent = 'Done!';
    reelProgressEl.classList.add('hidden');
    reelGenerateStatus.textContent = `${singleResults.length} Reel(s) ready`;
    setStatus(`${singleResults.length} Reel(s) ready`);
    reelStepEditor.classList.remove('hidden');
    renderReelScenes();
    renderReelFrame(0);
    renderAllReelPreviews();

  } catch(e) {
    console.error('[ReelGen] Error:', e);
    reelProgressLabel.textContent = 'Error: ' + friendlyApiError(e.message || 'Generation failed');
    reelProgressEl.classList.add('hidden');
    setStatus('Reel generation failed');
  }
  btnReelGenerate.disabled = false;
});

// ── Mini Editor ──
let activeReelPreview = 0;

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

  const platform = REEL_PLATFORMS[reelPlatform];
  const cw = platform.width;
  const ch = platform.height;
  const isVid = results.some(r => r.scenes?.some(s => s.isVideo));

  // Build controls HTML for each reel
  function buildControlsHtml(i, r) {
    const s = r.settings || {};
    const subStyle = s.subtitleStyle || reelSubtitleStyle;
    const trans = s.transition || reelTransition;
    const subColor = s.subColor || reelSubColor;
    const subOutline = s.subOutline || reelSubOutline;
    const subBackdrop = s.subBackdrop || reelSubBackdrop;
    const subSize = s.subSize || reelSubSize;
    const subPos = s.subPosition || reelSubPosition;
    const viewport = s.viewport || reelViewport;
    const vpx = s.viewportX ?? reelViewportX;
    return `
      <label class="form-label">Transition: <select class="rc-transition" data-ri="${i}">
        ${Object.entries(REEL_TRANSITIONS).map(([k, v]) => `<option value="${k}" ${k === trans ? 'selected' : ''}>${v.label}</option>`).join('')}
      </select></label>
      <label class="form-label">Subtitle: <select class="rc-sub-style" data-ri="${i}">
        ${Object.entries(REEL_SUBTITLE_STYLES).map(([k, v]) => `<option value="${k}" ${k === subStyle ? 'selected' : ''}>${v}</option>`).join('')}
      </select></label>
      <label class="form-label">Color: <input type="color" class="rc-sub-color" data-ri="${i}" value="${subColor}"></label>
      <label class="form-label">Outline: <input type="color" class="rc-sub-outline" data-ri="${i}" value="${subOutline}"></label>
      <label class="form-label">Backdrop: <select class="rc-sub-backdrop" data-ri="${i}">
        <option value="dark" ${subBackdrop === 'dark' ? 'selected' : ''}>Dark</option>
        <option value="blur" ${subBackdrop === 'blur' ? 'selected' : ''}>Blur</option>
        <option value="none" ${subBackdrop === 'none' ? 'selected' : ''}>None</option>
      </select></label>
      <label class="form-label">Size: <input type="range" class="rc-sub-size" data-ri="${i}" min="2" max="8" value="${subSize}" step="0.5" style="width:50px;"><span class="rc-size-label text-2xs">${subSize}</span></label>
      <label class="form-label">Position: <select class="rc-sub-pos" data-ri="${i}">
        <option value="top" ${subPos === 'top' ? 'selected' : ''}>Top</option>
        <option value="center" ${subPos === 'center' ? 'selected' : ''}>Center</option>
        <option value="bottom" ${subPos === 'bottom' ? 'selected' : ''}>Bottom</option>
      </select></label>
      ${isVid ? `<label class="form-label">Viewport: <select class="rc-viewport" data-ri="${i}">
        <option value="fill-center" ${viewport === 'fill-center' ? 'selected' : ''}>Fill</option>
        <option value="fit" ${viewport === 'fit' ? 'selected' : ''}>Fit</option>
        <option value="left-third" ${viewport === 'left-third' ? 'selected' : ''}>Left</option>
        <option value="center-third" ${viewport === 'center-third' ? 'selected' : ''}>Center</option>
        <option value="right-third" ${viewport === 'right-third' ? 'selected' : ''}>Right</option>
        <option value="custom" ${viewport === 'custom' ? 'selected' : ''}>Custom</option>
      </select></label>
      <label class="form-label ${viewport !== 'custom' ? 'hidden' : ''} rc-vpx-label" data-ri="${i}">Pan: <input type="range" class="rc-vpx" data-ri="${i}" min="0" max="100" value="${vpx}" style="width:60px;"></label>` : ''}
      <button class="btn-xs rc-export" data-ri="${i}">⬇ Export</button>
      <button class="btn-xs rc-editor" data-ri="${i}">Open in Editor</button>`;
  }

  container.innerHTML = results.map((r, i) => {
    const audioLabel = r.audioLangLabel || 'Original';
    const subLabel = r.subtitleLangLabel || 'Original';
    return `
    <div class="reel-preview-section" data-ri="${i}" style="border:1px solid var(--border); border-radius:var(--radius); padding:12px; background:var(--bg-secondary);">
      <div style="font-size:0.82rem; font-weight:600; margin-bottom:8px;">Reel ${i + 1} <span style="font-weight:400; font-size:0.7rem; color:var(--text-muted);">🔊 ${audioLabel} · 💬 ${subLabel}</span></div>
      <div style="display:flex; gap:16px; align-items:flex-start;">
        <div style="flex-shrink:0;">
          <div class="reel-canvas-wrap" style="width:300px;">
            <canvas class="reel-thumb-canvas" data-ri="${i}" width="${cw}" height="${ch}"></canvas>
          </div>
          <div style="width:300px; margin-top:6px;">
            <div style="display:flex; align-items:center; gap:4px; margin-bottom:4px;">
              <input type="range" class="reel-mp-scrub" data-ri="${i}" min="0" max="1000" value="0" style="flex:1; height:3px;">
              <span class="reel-mp-time text-2xs text-muted" data-ri="${i}">0:00</span>
            </div>
            <div style="display:flex; gap:4px; justify-content:center;">
              <button class="btn-xs reel-mp-play" data-ri="${i}">▶</button>
              <button class="btn-xs reel-mp-pause" data-ri="${i}">⏸</button>
              <button class="btn-xs reel-mp-stop" data-ri="${i}">⏹</button>
            </div>
          </div>
        </div>
        <div class="reel-preview-controls-right" style="display:flex; flex-wrap:wrap; gap:8px; align-content:flex-start; font-size:0.72rem;">
          ${buildControlsHtml(i, r)}
        </div>
      </div>
    </div>`;
  }).join('');

  // Render frame with subtitles on each canvas
  function drawPreviewFrame(cvs, r) {
    const ctx = cvs.getContext('2d');
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
    const savedC = reelSubColor, savedO = reelSubOutline, savedB = reelSubBackdrop, savedSz = reelSubSize, savedP = reelSubPosition;
    reelSubColor = rs.subColor || savedC; reelSubOutline = rs.subOutline || savedO;
    reelSubBackdrop = rs.subBackdrop || savedB; reelSubSize = rs.subSize || savedSz; reelSubPosition = rs.subPosition || savedP;
    const subStyle = rs.subtitleStyle || reelSubtitleStyle;
    if (subStyle !== 'none' && r.words && r.words.length > 0) {
      renderReelSubtitle(ctx, cw, ch, midTime, r.words, subStyle);
    }
    reelSubColor = savedC; reelSubOutline = savedO; reelSubBackdrop = savedB; reelSubSize = savedSz; reelSubPosition = savedP;
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

  // Per-preview playback
  const mpState = {}; // idx → { source, startedAt, playing, animId }
  container.querySelectorAll('.reel-mp-play').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.ri);
      const r = results[idx];
      if (!r || !r.audioBuffer) return;
      // Stop any other playing preview
      Object.keys(mpState).forEach(k => { if (mpState[k].playing) stopMp(parseInt(k), true); });
      // Start playback
      const ctx = ensureAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      const source = ctx.createBufferSource();
      source.buffer = r.audioBuffer;
      source.connect(ctx.destination);
      const startedAt = ctx.currentTime;
      source.start(startedAt);
      mpState[idx] = { source, startedAt, playing: true, animId: null };
      // Start video playback in sync
      if (reelVideoEl && reelVideoEl.videoWidth > 0) {
        const seg = r.segments?.[0];
        reelVideoEl.currentTime = seg?.startTime || 0;
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
          drawCtx.fillStyle = '#000'; drawCtx.fillRect(0, 0, cw, ch);
          if (reelVideoEl && reelVideoEl.videoWidth > 0) {
            const vp = r.settings?.viewport || reelViewport;
            const vpx = r.settings?.viewportX ?? reelViewportX;
            try { drawViewportCrop(drawCtx, reelVideoEl, cw, ch, vp, vpx); } catch(e) {}
          } else if (r.scenes) {
            // Use renderTimelineFrame for transitions between scenes
            const items = r.scenes.filter(s => s.imgDataUrl).map((s, i) => {
              if (!s._img) { s._img = new Image(); s._img.src = s.imgDataUrl; }
              return { startTime: s.startTime, duration: s.endTime - s.startTime, transition: i === 0 ? 'none' : (s.transition || 'none'), transDur: i === 0 ? 0 : (s.transDur || 0), motion: s.motion || 'none', imgEl: s._img };
            });
            if (items.length > 0 && typeof renderTimelineFrame === 'function') {
              try { renderTimelineFrame(drawCtx, cw, ch, elapsed, items); } catch(e) {}
            }
          }
          // Sync globals from per-reel settings for renderReelSubtitle
          const rs = r.settings || {};
          const savedColor = reelSubColor, savedOutline = reelSubOutline, savedBackdrop = reelSubBackdrop, savedSize = reelSubSize, savedPos = reelSubPosition;
          reelSubColor = rs.subColor || savedColor; reelSubOutline = rs.subOutline || savedOutline;
          reelSubBackdrop = rs.subBackdrop || savedBackdrop; reelSubSize = rs.subSize || savedSize; reelSubPosition = rs.subPosition || savedPos;
          const subStyle = rs.subtitleStyle || reelSubtitleStyle;
          if (subStyle !== 'none' && r.words?.length > 0) {
            renderReelSubtitle(drawCtx, cw, ch, elapsed, r.words, subStyle);
          }
          reelSubColor = savedColor; reelSubOutline = savedOutline; reelSubBackdrop = savedBackdrop; reelSubSize = savedSize; reelSubPosition = savedPos;
        }
        mpState[idx].animId = requestAnimationFrame(tick);
      }
      source.onended = () => { if (mpState[idx]?.playing) stopMp(idx); };
      mpState[idx].animId = requestAnimationFrame(tick);
    });
  });

  function stopMp(idx, resetScrub) {
    const st = mpState[idx];
    if (!st) return;
    st.playing = false;
    if (st.source) { try { st.source.stop(); } catch(e) {} }
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
        drawCtx.fillStyle = '#000'; drawCtx.fillRect(0, 0, cw, ch);
        if (reelVideoEl && reelVideoEl.videoWidth > 0) {
          try { drawViewportCrop(drawCtx, reelVideoEl, cw, ch, r.settings?.viewport || 'fill-center', r.settings?.viewportX ?? 50); } catch(e) {}
        }
        const subStyle = r.settings?.subtitleStyle || reelSubtitleStyle;
        if (subStyle !== 'none' && r.words?.length > 0) renderReelSubtitle(drawCtx, cw, ch, midTime, r.words, subStyle);
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
          drawCtx.fillStyle = '#000'; drawCtx.fillRect(0, 0, cw, ch);
          if (reelVideoEl && reelVideoEl.videoWidth > 0) {
            try { drawViewportCrop(drawCtx, reelVideoEl, cw, ch, r.settings?.viewport || 'fill-center', r.settings?.viewportX ?? 50); } catch(e) {}
          } else if (r.scenes) {
            const items = r.scenes.filter(s => s.imgDataUrl).map((s, i) => {
              if (!s._img) { s._img = new Image(); s._img.src = s.imgDataUrl; }
              return { startTime: s.startTime, duration: s.endTime - s.startTime, transition: i === 0 ? 'none' : (s.transition || 'none'), transDur: i === 0 ? 0 : (s.transDur || 0), motion: s.motion || 'none', imgEl: s._img };
            });
            if (items.length > 0 && typeof renderTimelineFrame === 'function') {
              try { renderTimelineFrame(drawCtx, cw, ch, t, items); } catch(e) {}
            }
          }
          const rs2 = r.settings || {};
          const sC = reelSubColor, sO = reelSubOutline, sB = reelSubBackdrop, sSz = reelSubSize, sP = reelSubPosition;
          reelSubColor = rs2.subColor || sC; reelSubOutline = rs2.subOutline || sO;
          reelSubBackdrop = rs2.subBackdrop || sB; reelSubSize = rs2.subSize || sSz; reelSubPosition = rs2.subPosition || sP;
          const subStyle = rs2.subtitleStyle || reelSubtitleStyle;
          if (subStyle !== 'none' && r.words?.length > 0) renderReelSubtitle(drawCtx, cw, ch, t, r.words, subStyle);
          reelSubColor = sC; reelSubOutline = sO; reelSubBackdrop = sB; reelSubSize = sSz; reelSubPosition = sP;
        };
        if (reelVideoEl && reelVideoEl.videoWidth > 0) {
          reelVideoEl.currentTime = (r.videoStart || 0) + t;
          reelVideoEl.onseeked = () => { drawFrame(); reelVideoEl.onseeked = null; };
        } else {
          drawFrame();
        }
      }
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
  }
  container.querySelectorAll('.rc-transition').forEach(el => el.addEventListener('change', () => updateReelSetting(el, 'transition')));
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
  container.querySelectorAll('.rc-sub-pos').forEach(el => el.addEventListener('change', () => updateReelSetting(el, 'subPosition')));
  container.querySelectorAll('.rc-viewport').forEach(el => {
    el.addEventListener('change', () => {
      updateReelSetting(el, 'viewport');
      const vpxLabel = container.querySelector(`.rc-vpx-label[data-ri="${el.dataset.ri}"]`);
      if (vpxLabel) vpxLabel.classList.toggle('hidden', el.value !== 'custom');
    });
  });
  container.querySelectorAll('.rc-vpx').forEach(el => el.addEventListener('input', () => updateReelSetting(el, 'viewportX', v => parseInt(v))));
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
    reelSubPosition = r.settings.subPosition || 'bottom';
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
    if (spEl) spEl.value = reelSubPosition;
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
        ${scene.imgDataUrl
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
        <div class="scene-ref-row" id="reel-scene-ref-${idx}" style="${scene.refImageDataUrl ? '' : 'display:none;'}">
          ${refThumbHtml}
          <span class="ref-label">${refLabel}</span>
          <button class="btn-ref-remove" style="font-size:0.62rem; padding:1px 6px; ${scene.refImageDataUrl ? '' : 'display:none;'}">✕</button>
        </div>
      </div>`;

    // Regenerate
    card.querySelector('.btn-regen').addEventListener('click', () => reelRegenerateScene(idx));
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

function reelUpdateSceneCardImage(idx) {
  const imgDiv = $(`reel-scene-img-${idx}`);
  if (!imgDiv || !reelPendingScenes) return;
  const scene = reelPendingScenes[idx];
  const platform = REEL_PLATFORMS[reelPlatform];
  const ratio = `${platform.width}/${platform.height}`;
  if (scene.imgDataUrl) {
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
    let effectivePrompt = hasRefs
      ? buildScenePromptWithRefs(scene, scene.prompt)
      : (stylePrompt ? `Style: ${stylePrompt}. Scene: ${scene.prompt}` : scene.prompt);
    effectivePrompt += ' STRICT: Do NOT include any text, words, letters in the image. Vertical 9:16 portrait format.';
    const refParts = hasRefs ? getSceneRefImageParts(scene) : [];
    const opts = { width: platform.width, height: platform.height, refImageDataUrl: scene.refImageDataUrl, refParts };
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
    trackCost('imageGenFast', 1);
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

function reelRegenerateScene(idx) { reelGenerateSceneImage(idx); }

async function reelRunImageGeneration(scenesToGen) {
  const btnGenImages = $('btn-reel-gen-images');
  const btnRetry = $('btn-reel-retry-images');
  const btnPause = $('btn-reel-pause-images');
  const btnContinue = $('btn-reel-scenes-continue');
  const progressEl = $('reel-image-progress');
  const barEl = $('reel-image-bar');
  const labelEl = $('reel-image-label');

  if (btnGenImages) btnGenImages.disabled = true;
  if (btnRetry) btnRetry.style.display = 'none';
  if (btnPause) { btnPause.style.display = ''; btnPause.textContent = '⏸ Pause'; }
  reelGenImagesPaused = false;
  reelGenImagesRunning = true;
  if (progressEl) progressEl.style.display = '';
  if (labelEl) labelEl.style.color = '';
  const total = scenesToGen.length;

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
}

async function reelBuildVariationsAndPreview() {
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
    const settings = { subtitleStyle: reelSubtitleStyle, transition: reelTransition, viewport: reelViewport, viewportX: reelViewportX, subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition };

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
    reelStepEditor.classList.remove('hidden');
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
    } else {
      drawReelSubtitles(ctx, platform, t);
    }
  } else {
    drawReelSubtitles(ctx, platform, t);
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
if (reelSubPositionEl) reelSubPositionEl.addEventListener('change', () => {
  reelSubPosition = reelSubPositionEl.value;
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
  const platHtml = Object.entries(REEL_PLATFORMS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  const durHtml = [30, 60, 90, 120].map(d => `<option value="${d}">${d} seconds</option>`).join('');
  // Row 0 inline (Audio + Sub only, shares Platform/Duration from presets row)
  container.innerHTML = `<label class="form-label" data-vi="0">Audio: <select class="var-audio" data-vi="0">${langHtml}</select></label>
    <label class="form-label" data-vi="0">Sub: <select class="var-subtitle" data-vi="0">${langHtml}</select></label>`;

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
      <label class="form-label">Platform: <select class="var-platform" data-vi="${i}">${platHtml}</select></label>
      <label class="form-label">Duration: <select class="var-duration" data-vi="${i}">${durHtml}</select></label>
      <label class="form-label">Audio: <select class="var-audio" data-vi="${i}">${langHtml}</select></label>
      <label class="form-label">Sub: <select class="var-subtitle" data-vi="${i}">${langHtml}</select></label>
      <button class="variation-remove" data-vi="${i}">✕</button>
    </div>`;
  }).join('');
  // Set selected values
  // Wire up all selects and remove buttons across both containers
  [container, extraContainer].forEach(el => {
    el.querySelectorAll('.var-platform').forEach(sel => {
      const i = parseInt(sel.dataset.vi);
      sel.value = reelVariationRows[i].platform || 'instagram';
      sel.addEventListener('change', () => { reelVariationRows[i].platform = sel.value; });
    });
    el.querySelectorAll('.var-duration').forEach(sel => {
      const i = parseInt(sel.dataset.vi);
      sel.value = reelVariationRows[i].duration || 60;
      sel.addEventListener('change', () => { reelVariationRows[i].duration = parseInt(sel.value); });
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
  const countEl = $('reel-variation-count');
  if (countEl) {
    countEl.textContent = segCount > 1 ? `(${segCount} segments × ${varCount} = ${total} reels)` : `(${varCount} reel${varCount > 1 ? 's' : ''})`;
  }
}

const btnAddVariation = $('btn-add-variation');
if (btnAddVariation) btnAddVariation.addEventListener('click', () => {
  reelVariationRows.push({ platform: reelPlatform, duration: reelDuration, audio: 'original', subtitle: 'original' });
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
      platform: reelPlatform,
      duration: reelDuration,
      subtitleStyle: reelSubtitleStyle,
      transition: reelTransition,
      subColor: reelSubColor,
      subOutline: reelSubOutline,
      subBackdrop: reelSubBackdrop,
      subSize: reelSubSize,
      subPosition: reelSubPosition,
      inputMode: reelInputMode,
      segments: reelSegments,
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
          scenes: r.scenes ? r.scenes.map(s => ({
            startTime: s.startTime, endTime: s.endTime, duration: s.duration,
            text: s.text, words: s.words, imgDataUrl: s.imgDataUrl,
            prompt: s.prompt, isVideo: s.isVideo,
            transition: s.transition, transDur: s.transDur, motion: s.motion,
            segmentIndex: s.segmentIndex,
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
if (btnReelBgm) btnReelBgm.addEventListener('click', () => reelBgmInput.click());
if (reelBgmInput) reelBgmInput.addEventListener('change', async () => {
  const file = reelBgmInput.files[0];
  if (!file) return;
  reelBgmInput.value = '';
  try {
    const arrayBuf = await file.arrayBuffer();
    reelBgmBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf);
    btnReelBgm.textContent = `♫ ${file.name}`;
  } catch(e) { btnReelBgm.textContent = '+ Add BGM (error)'; }
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

    // Preload scene images
    const sceneImages = reelScenes.map(s => {
      if (!s.imgDataUrl) return null;
      const img = new Image(); img.src = s.imgDataUrl; return img;
    });

    const timerWorker = new Worker(URL.createObjectURL(new Blob([
      `let id; self.onmessage = e => { if (e.data==="start") id=setInterval(()=>self.postMessage("t"),${1000/fps}); else clearInterval(id); };`
    ], { type: 'text/javascript' })));

    // For video mode: play video in sync with export
    const isVid = reelScenes && reelScenes.some(s => s.isVideo);
    const activeResult = window._reelMultiResults ? window._reelMultiResults[activeReelPreview] : null;
    if (isVid && reelVideoEl) {
      const vidOffset = activeResult ? activeResult.videoStart : 0;
      reelVideoEl.currentTime = vidOffset;
      reelVideoEl.muted = true;
      reelVideoEl.play();
    }

    exportLabel.textContent = 'Recording frames...';
    recorder.start(100); audioSource.start();
    const t0 = performance.now();
    const totalDur = reelAudioBuffer.duration;
    let stopped = false;

    timerWorker.onmessage = () => {
      if (stopped) return;
      const elapsed = (performance.now() - t0) / 1000;
      const progress = Math.min(elapsed / totalDur, 1);
      exportBar.style.width = (progress * 100).toFixed(1) + '%';
      exportLabel.textContent = `Exporting... ${Math.round(progress * 100)}% (${fmtShort(elapsed)} / ${fmtShort(totalDur)})`;

      if (elapsed >= totalDur) {
        stopped = true; timerWorker.postMessage('stop'); timerWorker.terminate(); recorder.stop();
        if (reelVideoEl) { reelVideoEl.pause(); reelVideoEl.muted = true; }
        return;
      }
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, platform.width, platform.height);
      const scene = reelScenes.find((s, i) => elapsed >= s.startTime && elapsed < s.endTime);
      if (scene) {
        if (isVid && reelVideoEl) {
          const vp = activeResult?.settings?.viewport || reelViewport;
          const vpx = activeResult?.settings?.viewportX ?? reelViewportX;
          try { drawViewportCrop(ctx, reelVideoEl, platform.width, platform.height, vp, vpx); } catch(e) {
            try { drawCoverFit(ctx, reelVideoEl, platform.width, platform.height); } catch(e2) {}
          }
        } else {
          const idx = reelScenes.indexOf(scene);
          const img = sceneImages[idx];
          if (img) { try { drawCoverFit(ctx, img, platform.width, platform.height); } catch(e) {} }
        }
      }
      const subStyle = activeResult?.settings?.subtitleStyle || reelSubtitleStyle;
      if (subStyle !== 'none' && reelWords.length > 0) {
        renderReelSubtitle(ctx, platform.width, platform.height, elapsed, reelWords, subStyle);
      }
      if (isFree()) {
        ctx.save(); ctx.globalAlpha = 0.5;
        ctx.font = '600 20px Poppins, sans-serif'; ctx.fillStyle = '#fff';
        ctx.textAlign = 'right'; ctx.fillText('Made with Stori', platform.width - 16, platform.height - 16);
        ctx.restore();
      }
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
  // Transfer subtitles as subtitle items
  if (reelWords && reelWords.length > 0) {
    subtitleItems = [];
    // Group words into subtitle segments (~5 words each)
    for (let i = 0; i < reelWords.length; i += 5) {
      const group = reelWords.slice(i, i + 5);
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
        bold: true, position: reelSubPosition === 'top' ? 'top-center' : reelSubPosition === 'center' ? 'center' : 'bot-center', animation: 'none', animDur: 0,
      });
    }
  }

  // Transfer BGM
  if (reelBgmBuffer) bgmBuffer = reelBgmBuffer;

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

  // Set image size
  if (createImageSize) createImageSize.value = `${platform.width}x${platform.height}`;
  // Set video mode since reel is video-based
  if (videoTimelineItems.length > 0) bgVideoMode = 'video-only';
  // Store reel properties for editor preview
  window._editorReelSubtitle = {
    words: reelWords,
    style: reelSubtitleStyle,
    subSize: reelSubSize,
    subPosition: reelSubPosition,
    subColor: reelSubColor,
    subOutline: reelSubOutline,
    subBackdrop: reelSubBackdrop,
  };
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
  if (typeof showInlinePreview === 'function') showInlinePreview();
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

  // Subtitles from words
  if (r.words && r.words.length > 0) {
    for (let i = 0; i < r.words.length; i += 5) {
      const group = r.words.slice(i, i + 5);
      if (group.length === 0) continue;
      subtitleItems.push({
        id: nextSubtitleId++, text: group.map(w => w.word).join(' '),
        startTime: group[0].start, duration: group[group.length - 1].end - group[0].start,
        font: "'Poppins', sans-serif", fontSize: 32, color: reelSubColor || '#fff',
        strokeColor: reelSubOutline || '#000', strokeWidth: 2,
        bgColor: '#000', bgAlpha: 0.5, bold: true, position: 'bottom', animation: 'none', animDur: 0,
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

  // Restore settings
  reelPlatform = project.platform || 'instagram';
  reelDuration = project.duration || 60;
  reelSubtitleStyle = project.subtitleStyle || 'highlight';
  reelTransition = project.transition || 'whip-pan';
  reelSubColor = project.subColor || '#ffffff';
  reelSubOutline = project.subOutline || '#000000';
  reelSubBackdrop = project.subBackdrop || 'dark';
  reelSubSize = project.subSize || 4;
  reelSubPosition = project.subPosition || 'bottom';
  if (project.inputMode) reelInputMode = project.inputMode;
  if (project.segments) reelSegments = project.segments;

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
  if (subPosEl) subPosEl.value = reelSubPosition;
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
      for (const s of scenes) { if (s.segmentIndex == null) s.segmentIndex = si; }
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
        settings: { subtitleStyle: reelSubtitleStyle, transition: reelTransition, subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition },
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
      settings: { subtitleStyle: reelSubtitleStyle, transition: reelTransition, subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition },
    });
  }

  window._reelMultiResults = results;
  activeReelPreview = 0;
  if (results.length > 0) {
    reelAudioBuffer = results[0].audioBuffer;
    reelScenes = results[0].scenes;
    reelWords = results[0].words;
  }

  // Show section 3 (presets) with segments
  if (reelStepPresets) reelStepPresets.classList.remove('hidden');
  if (reelSegments.length > 0) renderReelPresetSegments();

  // Show section 3.5 (scene images) — collect from all results
  const allLoadedScenes = results.flatMap(r => r.scenes || []);
  const hasImages = allLoadedScenes.some(s => s.imgDataUrl);
  if (hasImages) {
    reelPendingScenes = allLoadedScenes;
    if (reelStepScenes) reelStepScenes.classList.remove('hidden');
    renderReelSceneGrid(reelPendingScenes);
  }

  // Show section 4 (preview)
  if (results.length > 0) {
    reelStepEditor.classList.remove('hidden');
    renderReelScenes();
    renderReelFrame(0);
    renderAllReelPreviews();
  }

  // Status
  const needsRegen = results.filter(r => r.needsRegeneration);
  if (needsRegen.length > 0) {
    setStatus(`Project loaded. ${needsRegen.length} reel(s) need re-generation — click Generate Reel.`);
  } else {
    setStatus(`Project loaded — ${results.length} reel(s)`);
  }
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
});
