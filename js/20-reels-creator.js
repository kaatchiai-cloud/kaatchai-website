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
function getReelApiKey() { return getReelFreeKey() || getReelPaidKey(); }
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
  dropZone.classList.add('hidden');
  reelPage.classList.add('visible');
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
  reelPage.classList.remove('visible');
  dropZone.classList.remove('hidden');
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

function showReelPresets() {
  if (reelStepPresets) reelStepPresets.classList.remove('hidden');
}

// Show presets when text is entered
if (reelTextInput) reelTextInput.addEventListener('input', () => {
  if (reelTextInput.value.trim().length > 10) showReelPresets();
});
if (reelModeVideo) reelModeVideo.addEventListener('click', () => setReelInputMode('video'));

// ── Audio Import ──
if (btnReelImportAudio) btnReelImportAudio.addEventListener('click', () => reelAudioInput.click());
if (reelAudioInput) reelAudioInput.addEventListener('change', async () => {
  const file = reelAudioInput.files[0];
  if (!file) return;
  reelAudioInput.value = '';
  try {
    showPageLoader('Decoding audio...');
    const arrayBuf = await file.arrayBuffer();
    reelAudioBuffer = await audioCtx.decodeAudioData(arrayBuf);
    reelAudioName.textContent = `${file.name} (${fmtShort(reelAudioBuffer.duration)})`;
    showReelPresets();
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
    reelAudioBuffer = await audioCtx.decodeAudioData(arrayBuf);
    reelOriginalAudioBuffer = reelAudioBuffer;
    reelSegments = [];
    // Init waveform
    initReelWaveform();
    reelSegmentPicker.classList.remove('hidden');
    showReelPresets();
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
  container.innerHTML = `<div class="reel-segments-list">${reelSegments.map((seg, i) => `
    <div class="reel-seg-card" data-seg="${i}">
      <video class="seg-video" data-si="${i}" src="${reelVideoSrc}" playsinline muted preload="metadata" style="width:100%; display:block;"></video>
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

  // Play handlers — each segment uses its own <video> element
  container.querySelectorAll('.seg-play').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.si);
      const seg = reelSegments[idx];
      const vid = container.querySelector(`.seg-video[data-si="${idx}"]`);
      if (!vid || !seg) return;
      stopSegPreview();
      segPreviewPlaying = idx;
      vid.currentTime = seg.start;
      vid.muted = false;
      vid.play();
      btn.classList.add('hidden');
      container.querySelector(`.seg-pause[data-si="${idx}"]`).classList.remove('hidden');
      const timeEl = $(`seg-time-${idx}`);
      const interval = setInterval(() => {
        if (segPreviewPlaying !== idx) { clearInterval(interval); return; }
        const elapsed = vid.currentTime - seg.start;
        if (timeEl) timeEl.textContent = fmtShort(Math.max(0, elapsed));
        if (vid.currentTime >= seg.end || vid.paused) {
          stopSegPreview();
          clearInterval(interval);
        }
      }, 100);
    });
  });
  container.querySelectorAll('.seg-pause').forEach(btn => {
    btn.addEventListener('click', () => stopSegPreview());
  });
  container.querySelectorAll('.seg-stop').forEach(btn => {
    btn.addEventListener('click', () => {
      stopSegPreview();
      const idx = parseInt(btn.dataset.si);
      const vid = container.querySelector(`.seg-video[data-si="${idx}"]`);
      if (vid) { vid.currentTime = reelSegments[idx].start; vid.muted = true; }
      const timeEl = $(`seg-time-${idx}`);
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
if (reelSubtitleStyleEl) reelSubtitleStyleEl.addEventListener('change', () => { reelSubtitleStyle = reelSubtitleStyleEl.value; });

// ── Generate Reel ──
if (btnReelGenerate) btnReelGenerate.addEventListener('click', async () => {
  const key = getReelApiKey();
  if (!key) { reelGenerateStatus.textContent = 'Enter your API key in Step 1 first.'; return; }

  // Video mode with multiple segments — process each as separate reel
  if (reelInputMode === 'video' && reelSegments.length > 0 && reelVideoEl) {
    btnReelGenerate.disabled = true;
    reelProgressEl.classList.remove('hidden');
    const allReelResults = [];
    for (let si = 0; si < reelSegments.length; si++) {
      const seg = reelSegments[si];
      reelProgressLabel.textContent = `Processing Reel ${si + 1} of ${reelSegments.length}...`;
      reelProgressBar.style.width = `${(si / reelSegments.length * 100).toFixed(0)}%`;
      setStatus(`Processing Reel ${si + 1}/${reelSegments.length}...`, true);

      // Extract audio for this segment from original full buffer
      const segAudio = extractRegion(reelOriginalAudioBuffer || reelAudioBuffer, seg.start, seg.end);
      const platform = REEL_PLATFORMS[reelPlatform];
      const transPreset = REEL_TRANSITIONS[reelTransition] || REEL_TRANSITIONS['whip-pan'];

      // Transcribe segment
      const wavBlob = audioBufferToWavBlob(segAudio);
      const b64Audio = await blobToBase64(wavBlob);
      const segDur = Math.max(3, Math.min(10, segAudio.duration / 6));
      const transcribeBody = {
        contents: [{ parts: [
          { inlineData: { mimeType: 'audio/wav', data: b64Audio.split(',')[1] } },
          { text: `Transcribe this audio with word-level timestamps. Return JSON array: [{"startTime": 0.0, "endTime": 5.0, "text": "...", "words": [{"word": "...", "start": 0.0, "end": 0.4}]}]. Segments of ${segDur.toFixed(0)}-${(segDur*2).toFixed(0)} seconds. Full duration: ${segAudio.duration.toFixed(1)}s.` }
        ]}]
      };
      const transcribeData = await callGeminiAPI(getTranscriptionModels(), transcribeBody);
      trackCost('transcription', 1);
      const segments = parseGeminiJson(transcribeData.candidates?.[0]?.content?.parts?.[0]?.text);

      const words = [];
      for (const s of segments) { if (s.words) words.push(...s.words); }

      const scenes = reelEditMode === 'subtitles'
        ? [{ startTime: 0, endTime: segAudio.duration, duration: segAudio.duration, text: segments.map(s => s.text).join(' '), words, imgDataUrl: null, status: 'done', isVideo: true, transition: 'none', transDur: 0, motion: 'none' }]
        : segments.map(s => ({ startTime: s.startTime, endTime: s.endTime, duration: s.endTime - s.startTime, text: s.text, words: s.words || [], imgDataUrl: null, status: 'done', isVideo: true, transition: transPreset.transition, transDur: transPreset.transDur, motion: 'none' }));

      allReelResults.push({ audioBuffer: segAudio, scenes, words, videoStart: seg.start, videoEnd: seg.end });
    }

    // Show results — all segments
    reelProgressBar.style.width = '100%';
    reelProgressLabel.textContent = `${allReelResults.length} Reel(s) ready!`;
    setStatus(`${allReelResults.length} Reels generated`);

    window._reelMultiResults = allReelResults;
    // Use first for main preview
    const first = allReelResults[0];
    reelAudioBuffer = first.audioBuffer;
    reelScenes = first.scenes;
    reelWords = first.words;

    reelStepEditor.classList.remove('hidden');
    renderAllReelPreviews();
    renderReelFrame(0);
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
            generationConfig: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
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
      reelAudioBuffer = await audioCtx.decodeAudioData(audioArrayBuf);
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

    const segDur = Math.max(3, Math.min(10, reelAudioBuffer.duration / 6));
    const transcribeBody = {
      contents: [{ parts: [
        { inlineData: { mimeType: 'audio/wav', data: b64Audio.split(',')[1] } },
        { text: `Transcribe this audio into segments of ${segDur.toFixed(0)}-${(segDur*2).toFixed(0)} seconds each. Return JSON array: [{"startTime": 0.0, "endTime": 5.0, "text": "...", "sceneDescription": "vivid visual description", "words": [{"word": "...", "start": 0.0, "end": 0.4}]}]. Include word-level timestamps for subtitle rendering. Ensure segments cover the full audio duration of ${reelAudioBuffer.duration.toFixed(1)} seconds.` }
      ]}]
    };
    const transcribeData = await callGeminiAPI(getTranscriptionModels(), transcribeBody);
    trackCost('transcription', 1);
    const transcribeText = transcribeData.candidates?.[0]?.content?.parts?.[0]?.text;
    const segments = parseGeminiJson(transcribeText);

    // Collect all words for subtitle rendering
    reelWords = [];
    for (const seg of segments) {
      if (seg.words) reelWords.push(...seg.words);
    }

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
      reelScenes = segments.map(s => ({
        prompt: s.sceneDescription || s.text,
        startTime: s.startTime, endTime: s.endTime,
        duration: s.endTime - s.startTime,
        text: s.text, words: s.words || [],
        imgDataUrl: null, status: 'pending',
        transition: transPreset.transition,
        transDur: transPreset.transDur,
        motion: transPreset.motion,
      }));

      // Step 2: Generate images (only for audio/text mode)
      reelProgressLabel.textContent = 'Generating images...';
      reelProgressBar.style.width = '30%';

      const imageKey = getReelImageKey();
      if (!imageKey) {
        reelProgressLabel.textContent = 'Paid API key needed for image generation. Add one in Step 1.';
        setStatus('Image generation requires an API key');
        btnReelGenerate.disabled = false;
        return;
      }

      const models = getImageModels();
      for (let i = 0; i < reelScenes.length; i++) {
        const scene = reelScenes[i];
        reelProgressLabel.textContent = `Generating image ${i + 1} of ${reelScenes.length}...`;
        reelProgressBar.style.width = `${30 + (i / reelScenes.length) * 60}%`;
        setStatus(`Generating image ${i + 1}/${reelScenes.length}...`, true);

        let effectivePrompt = stylePrompt ? `Style: ${stylePrompt}. Scene: ${scene.prompt}` : scene.prompt;
        effectivePrompt += ' STRICT: Do NOT include any text in the image. Vertical 9:16 portrait composition.';

        let imgDataUrl = null;
        for (const model of models) {
          try {
            if (model.startsWith('imagen-')) {
              imgDataUrl = await generateImageImagen(effectivePrompt, imageKey, { width: platform.width, height: platform.height }, model);
            } else {
              imgDataUrl = await generateImageGeminiFlash(effectivePrompt, imageKey, { width: platform.width, height: platform.height }, model);
            }
            break;
          } catch(e) { continue; }
        }
        if (imgDataUrl) {
          scene.imgDataUrl = imgDataUrl;
          scene.status = 'done';
          trackCost('imageGenFast', 1);
        } else {
          scene.status = 'error';
        }

        // Free tier wait
        if (!isPaidTier() && i < reelScenes.length - 1) {
          reelProgressLabel.textContent = `Waiting for rate limit...`;
          await new Promise(r => setTimeout(r, 30000));
        }
      }
    }

    // Auto-generate subtitle translations + audio languages if selected
    const selectedSubLangs = [...document.querySelectorAll('#reel-subtitle-languages input:checked')].map(cb => cb.value);
    const selectedAudioLangs = [...document.querySelectorAll('#reel-audio-languages input:checked')].map(cb => cb.value);
    const allLangs = [...new Set([...selectedSubLangs, ...selectedAudioLangs])];
    const langNames = { en: 'English', ta: 'Tamil', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', es: 'Spanish', fr: 'French' };
    const originalText = reelWords.map(w => w.word).join(' ');

    if (allLangs.length > 0 && originalText) {
      for (const lang of allLangs) {
        reelProgressLabel.textContent = `Translating to ${langNames[lang] || lang}...`;
        setStatus(`Translating to ${langNames[lang]}...`, true);
        try {
          const transBody = { contents: [{ parts: [{ text: `Translate to ${langNames[lang]}. Return ONLY the translated text:\n\n${originalText}` }] }] };
          const transData = await callGeminiAPI(getTranscriptionModels(), transBody);
          trackCost('textGeneration', 1);
          const translated = transData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (translated) {
            // Map translated words to original timings
            const transWords = translated.split(/\s+/);
            const totalDur = reelWords.length > 0 ? reelWords[reelWords.length - 1].end - reelWords[0].start : 0;
            const wordDur = totalDur / transWords.length;
            const st = reelWords.length > 0 ? reelWords[0].start : 0;
            reelTranslatedWords[lang] = transWords.map((w, i) => ({ word: w, start: st + i * wordDur, end: st + (i + 1) * wordDur }));

            // Generate TTS if audio language selected
            if (selectedAudioLangs.includes(lang)) {
              reelProgressLabel.textContent = `Generating ${langNames[lang]} audio...`;
              try {
                const ttsModels = getTTSModels();
                const ttsResp = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/${ttsModels[0]}:generateContent?key=${key}`,
                  { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: translated }] }],
                      generationConfig: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
                    })
                  }
                );
                if (ttsResp.ok) {
                  const ttsData = await ttsResp.json();
                  const part = ttsData.candidates?.[0]?.content?.parts?.[0];
                  if (part?.inlineData?.data) {
                    trackCost('ttsPerLang', 1);
                    const b64 = part.inlineData.data;
                    const binary = atob(b64);
                    const buf = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
                    const audioBuffer = await audioCtx.decodeAudioData(buf.buffer);
                    reelAudioTracks.push({ langCode: lang, lang: langNames[lang], audioBuffer, translatedText: translated });
                  }
                }
              } catch(e) { /* TTS failed for this lang, continue */ }
            }
          }
        } catch(e) { /* translation failed, continue */ }
      }
      updateReelSubtitleLangDropdown();
    }

    // Show mini editor
    reelProgressBar.style.width = '100%';
    reelProgressLabel.textContent = 'Done!';
    setStatus('Reel generated!');
    reelStepEditor.classList.remove('hidden');
    renderReelScenes();
    renderReelFrame(0);

  } catch(e) {
    reelProgressLabel.textContent = 'Error: ' + (e.message || 'Generation failed');
    setStatus('Reel generation failed');
  }
  btnReelGenerate.disabled = false;
});

// ── Mini Editor ──
function renderAllReelPreviews() {
  const container = $('reel-all-previews');
  if (!container || !window._reelMultiResults) return;
  const results = window._reelMultiResults;
  container.innerHTML = results.map((r, i) => `
    <div class="reel-preview-card">
      <video class="reel-multi-vid" data-ri="${i}" src="${reelVideoSrc}" playsinline muted preload="metadata"></video>
      <div class="reel-preview-label">Reel ${i + 1} · ${fmtShort(r.videoStart)}–${fmtShort(r.videoEnd)}</div>
      <div class="reel-preview-controls">
        <button class="btn-xs reel-mp-play" data-ri="${i}">▶</button>
        <button class="btn-xs reel-mp-stop" data-ri="${i}">⏹</button>
        <span class="text-2xs text-muted reel-mp-time" id="reel-mp-time-${i}">0:00</span>
      </div>
    </div>
  `).join('');
  // Seek each to start
  container.querySelectorAll('.reel-multi-vid').forEach(v => {
    const idx = parseInt(v.dataset.ri);
    v.currentTime = results[idx].videoStart;
  });
  // Play/stop handlers
  container.querySelectorAll('.reel-mp-play').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.ri);
      const r = results[idx];
      const vid = container.querySelector(`.reel-multi-vid[data-ri="${idx}"]`);
      if (!vid) return;
      // Stop all others
      container.querySelectorAll('.reel-multi-vid').forEach(v => { v.pause(); v.muted = true; });
      vid.currentTime = r.videoStart;
      vid.muted = false;
      vid.play();
      const timeEl = $(`reel-mp-time-${idx}`);
      const iv = setInterval(() => {
        if (vid.paused || vid.currentTime >= r.videoEnd) { vid.pause(); vid.muted = true; clearInterval(iv); return; }
        if (timeEl) timeEl.textContent = fmtShort(vid.currentTime - r.videoStart);
      }, 100);
    });
  });
  container.querySelectorAll('.reel-mp-stop').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.ri);
      const r = results[idx];
      const vid = container.querySelector(`.reel-multi-vid[data-ri="${idx}"]`);
      if (vid) { vid.pause(); vid.muted = true; vid.currentTime = r.videoStart; }
      const timeEl = $(`reel-mp-time-${idx}`);
      if (timeEl) timeEl.textContent = '0:00';
    });
  });
}

function renderReelScenes() {
  if (!reelSceneList || !reelScenes) return;
  // Hide style/transition for video mode in mini editor
  const isVid = reelScenes.some(s => s.isVideo);
  const editStyleLabel = reelEditStyle ? reelEditStyle.closest('label') : null;
  const editTransLabel = reelEditTransition ? reelEditTransition.closest('label') : null;
  if (editStyleLabel) editStyleLabel.style.display = isVid ? 'none' : '';
  if (editTransLabel) editTransLabel.style.display = (isVid && reelEditMode === 'subtitles') ? 'none' : '';
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

function renderReelFrame(time) {
  if (!reelCanvas || !reelScenes) return;
  const platform = REEL_PLATFORMS[reelPlatform];
  reelCanvas.width = platform.width;
  reelCanvas.height = platform.height;
  const ctx = reelCanvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, platform.width, platform.height);

  // Find scene at time
  const scene = reelScenes.find(s => time >= s.startTime && time < s.endTime);
  if (scene) {
    if (scene.isVideo && reelVideoEl) {
      // Video mode: draw video frame
      reelVideoEl.currentTime = time;
      try { drawCoverFit(ctx, reelVideoEl, platform.width, platform.height); } catch(e) {}
    } else if (scene.imgDataUrl) {
      // Image mode: draw generated image
      const img = new Image();
      img.src = scene.imgDataUrl;
      try { drawCoverFit(ctx, img, platform.width, platform.height); } catch(e) {}
    }
  }

  // Render word-level subtitle
  if (reelSubtitleStyle !== 'none' && reelWords.length > 0) {
    renderReelSubtitle(ctx, platform.width, platform.height, time, reelWords, reelSubtitleStyle);
  }
}

// ── Playback ──
let reelAudioSource = null;
const btnReelPause = $('btn-reel-pause');

if (btnReelPlay) btnReelPlay.addEventListener('click', () => {
  if (reelPlaying) return;
  if (!reelAudioBuffer) return;
  reelPlaying = true;
  reelAudioSource = audioCtx.createBufferSource();
  reelAudioSource.buffer = reelAudioBuffer;
  reelAudioSource.connect(audioCtx.destination);
  reelAudioSource.start();
  reelStartTime = audioCtx.currentTime;
  reelAudioSource.onended = () => { reelPlaying = false; reelAudioSource = null; };

  function animate() {
    if (!reelPlaying) return;
    const elapsed = audioCtx.currentTime - reelStartTime;
    if (elapsed >= reelAudioBuffer.duration) { stopReelPreview(); return; }
    renderReelFrame(elapsed);
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
}

if (reelScrub) reelScrub.addEventListener('input', () => {
  if (reelPlaying) return;
  const time = (reelScrub.value / 1000) * (reelAudioBuffer ? reelAudioBuffer.duration : 0);
  renderReelFrame(time);
  if (reelTimeEl) reelTimeEl.textContent = `${fmtShort(time)} / ${fmtShort(reelAudioBuffer ? reelAudioBuffer.duration : 0)}`;
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

// ── Subtitle Language Translation ──
let reelTranslatedWords = {};  // cache: langCode → [{word, start, end}]
const reelSubtitleLangEl = $('reel-subtitle-lang');

if (reelSubtitleLangEl) reelSubtitleLangEl.addEventListener('change', async () => {
  const lang = reelSubtitleLangEl.value;
  if (lang === 'original') {
    // Reset to original words
    reelWords = [];
    if (reelScenes) reelScenes.forEach(s => { if (s.words) reelWords.push(...s.words); });
    return;
  }
  // Check cache
  if (reelTranslatedWords[lang]) {
    reelWords = reelTranslatedWords[lang];
    return;
  }
  // Translate
  const key = getReelApiKey();
  if (!key) { setStatus('API key needed for translation'); return; }
  setStatus('Translating subtitles...', true);
  try {
    const originalText = reelWords.map(w => w.word).join(' ');
    const langNames = { en: 'English', ta: 'Tamil', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', es: 'Spanish', fr: 'French' };
    const body = {
      contents: [{ parts: [{ text: `Translate the following text to ${langNames[lang] || lang}. Return ONLY the translated text, nothing else:\n\n${originalText}` }] }]
    };
    const data = await callGeminiAPI(getTranscriptionModels(), body);
    trackCost('textGeneration', 1);
    const translated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (translated) {
      // Map translated words back to original timings proportionally
      const transWords = translated.split(/\s+/);
      const origWords = reelWords;
      const totalDur = origWords.length > 0 ? origWords[origWords.length - 1].end - origWords[0].start : 0;
      const wordDur = totalDur / transWords.length;
      const startTime = origWords.length > 0 ? origWords[0].start : 0;
      const mappedWords = transWords.map((w, i) => ({
        word: w,
        start: startTime + i * wordDur,
        end: startTime + (i + 1) * wordDur,
      }));
      reelTranslatedWords[lang] = mappedWords;
      reelWords = mappedWords;
      setStatus(`Subtitles translated to ${langNames[lang]}`);
    }
  } catch(e) {
    setStatus('Translation failed: ' + e.message);
  }
});

// ── Subtitle Styling Controls (from presets section) ──
const reelSubColorPreset = $('reel-sub-color-preset');
const reelSubOutlinePreset = $('reel-sub-outline-preset');
const reelSubBackdropPreset = $('reel-sub-backdrop-preset');
if (reelSubColorPreset) reelSubColorPreset.addEventListener('input', () => { reelSubColor = reelSubColorPreset.value; });
if (reelSubOutlinePreset) reelSubOutlinePreset.addEventListener('input', () => { reelSubOutline = reelSubOutlinePreset.value; });
if (reelSubBackdropPreset) reelSubBackdropPreset.addEventListener('change', () => { reelSubBackdrop = reelSubBackdropPreset.value; });

// Toggle dropdown panels
const btnToggleSubLangs = $('btn-toggle-sub-langs');
const reelSubLangPanel = $('reel-sub-lang-panel');
const btnToggleAudioLangs = $('btn-toggle-audio-langs');
const reelAudioLangPanel = $('reel-audio-lang-panel');
const subLangCount = $('sub-lang-count');
const audioLangCount = $('audio-lang-count');

if (btnToggleSubLangs) btnToggleSubLangs.addEventListener('click', (e) => {
  e.stopPropagation();
  reelSubLangPanel.classList.toggle('hidden');
  if (reelAudioLangPanel) reelAudioLangPanel.classList.add('hidden');
});
if (btnToggleAudioLangs) btnToggleAudioLangs.addEventListener('click', (e) => {
  e.stopPropagation();
  reelAudioLangPanel.classList.toggle('hidden');
  if (reelSubLangPanel) reelSubLangPanel.classList.add('hidden');
});
// Close dropdowns on outside click
document.addEventListener('click', () => {
  if (reelSubLangPanel) reelSubLangPanel.classList.add('hidden');
  if (reelAudioLangPanel) reelAudioLangPanel.classList.add('hidden');
});
if (reelSubLangPanel) reelSubLangPanel.addEventListener('click', (e) => e.stopPropagation());
if (reelAudioLangPanel) reelAudioLangPanel.addEventListener('click', (e) => e.stopPropagation());

function updateLangCounts() {
  const langNames = { en: 'English', ta: 'Tamil', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', es: 'Spanish', fr: 'French' };
  // Subtitle count
  const subChecked = document.querySelectorAll('#reel-subtitle-languages input[type="checkbox"]:checked');
  if (subLangCount) {
    const names = [...subChecked].map(cb => langNames[cb.value] || cb.value);
    subLangCount.textContent = names.length > 0 ? `(${names.join(', ')})` : '(none)';
  }
  // Audio count + show/hide generate button
  const audioChecked = document.querySelectorAll('#reel-audio-languages input[type="checkbox"]:checked');
  if (audioLangCount) {
    const names = [...audioChecked].map(cb => langNames[cb.value] || cb.value);
    audioLangCount.textContent = names.length > 0 ? `(${names.join(', ')})` : '(none)';
  }
  const audioGenRow = $('reel-audio-gen-row');
  if (audioGenRow) audioGenRow.classList.toggle('hidden', audioChecked.length === 0);
}

// Update counts on checkbox change
document.querySelectorAll('#reel-subtitle-languages input, #reel-audio-languages input').forEach(cb => {
  cb.addEventListener('change', updateLangCounts);
});

// Populate mini editor subtitle language dropdown from selected languages
function updateReelSubtitleLangDropdown() {
  const langSelect = $('reel-subtitle-lang');
  if (!langSelect) return;
  const langNames = { original: 'Original', en: 'English', ta: 'Tamil', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', es: 'Spanish', fr: 'French' };
  langSelect.innerHTML = '<option value="original" selected>Original</option>';
  const checkboxes = document.querySelectorAll('#reel-subtitle-languages input[type="checkbox"]:checked');
  checkboxes.forEach(cb => {
    if (cb.value !== 'original') {
      langSelect.innerHTML += `<option value="${cb.value}">${langNames[cb.value] || cb.value}</option>`;
    }
  });
}
// Update on checkbox change
document.querySelectorAll('#reel-subtitle-languages input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', () => { updateReelSubtitleLangDropdown(); updateLangCounts(); });
});

// ── Audio Language Generation ──
const btnReelGenAudioLangs = $('btn-reel-gen-audio-langs');
const reelAudioLangStatus = $('reel-audio-lang-status');
const reelAudioLangList = $('reel-audio-lang-list');
let reelAudioTracks = []; // [{langCode, lang, audioBuffer}]

if (btnReelGenAudioLangs) btnReelGenAudioLangs.addEventListener('click', async () => {
  const key = getReelApiKey();
  if (!key) { reelAudioLangStatus.textContent = 'API key needed'; return; }
  if (!reelAudioBuffer || !reelWords || reelWords.length === 0) {
    reelAudioLangStatus.textContent = 'Generate reel first (need transcript)';
    return;
  }

  const selectedLangs = [];
  document.querySelectorAll('#reel-audio-languages input[type="checkbox"]:checked').forEach(cb => {
    selectedLangs.push(cb.value);
  });
  if (selectedLangs.length === 0) { reelAudioLangStatus.textContent = 'Select at least one language'; return; }

  const langNames = { en: 'English', ta: 'Tamil', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', es: 'Spanish', fr: 'French' };
  const originalText = reelWords.map(w => w.word).join(' ');

  btnReelGenAudioLangs.disabled = true;
  reelAudioTracks = [];

  for (const langCode of selectedLangs) {
    const langName = langNames[langCode] || langCode;
    reelAudioLangStatus.textContent = `Translating to ${langName}...`;
    setStatus(`Translating to ${langName}...`, true);

    try {
      // Translate
      const transBody = {
        contents: [{ parts: [{ text: `Translate the following text to ${langName}. Return ONLY the translated text:\n\n${originalText}` }] }]
      };
      const transData = await callGeminiAPI(getTranscriptionModels(), transBody);
      trackCost('textGeneration', 1);
      const translated = transData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!translated) throw new Error('No translation returned');

      // Generate TTS
      reelAudioLangStatus.textContent = `Generating ${langName} audio...`;
      setStatus(`Generating ${langName} TTS...`, true);

      const ttsModels = getTTSModels();
      const ttsResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${ttsModels[0]}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: translated }] }],
            generationConfig: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
          })
        }
      );
      if (!ttsResp.ok) throw new Error('TTS failed');
      const ttsData = await ttsResp.json();
      const part = ttsData.candidates?.[0]?.content?.parts?.[0];
      if (!part?.inlineData?.data) throw new Error('No audio returned');
      trackCost('ttsPerLang', 1);

      const b64 = part.inlineData.data;
      const binary = atob(b64);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
      const audioBuffer = await audioCtx.decodeAudioData(buf.buffer);

      reelAudioTracks.push({ langCode, lang: langName, audioBuffer, translatedText: translated });

      // Show in list
      renderReelAudioLangList();

    } catch(e) {
      reelAudioLangStatus.textContent = `${langName} failed: ${e.message}`;
    }
  }

  btnReelGenAudioLangs.disabled = false;
  reelAudioLangStatus.textContent = `${reelAudioTracks.length} language(s) generated`;
  setStatus(`${reelAudioTracks.length} audio tracks generated`);

  // Also update subtitle language dropdown
  updateReelSubtitleLangDropdown();
});

function renderReelAudioLangList() {
  if (!reelAudioLangList) return;
  reelAudioLangList.innerHTML = reelAudioTracks.map(t => `
    <div class="form-row mb-xs">
      <span class="text-xs" style="color:var(--green);">✓</span>
      <span class="text-xs">${t.lang}</span>
      <span class="text-xs text-muted">(${fmtShort(t.audioBuffer.duration)})</span>
    </div>
  `).join('');
}

// ── Save Reel Project ──
const btnReelSaveProject = $('btn-reel-save-project');
if (btnReelSaveProject) btnReelSaveProject.addEventListener('click', async () => {
  if (!reelAudioBuffer) { setStatus('Nothing to save'); return; }
  setStatus('Saving reel project...', true);
  try {
    const wavBlob = audioBufferToWavBlob(reelAudioBuffer);
    const audioBase64 = await blobToBase64(wavBlob);
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
      audio: { data: audioBase64, duration: reelAudioBuffer.duration },
      scenes: reelScenes ? reelScenes.map(s => ({
        startTime: s.startTime, endTime: s.endTime, duration: s.duration,
        text: s.text, words: s.words, imgDataUrl: s.imgDataUrl,
        isVideo: s.isVideo, transition: s.transition,
      })) : [],
      words: reelWords,
    };
    const json = JSON.stringify(project);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stori-reel-${Date.now()}.storireel`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    setStatus(`Reel project saved (${(json.length / 1024).toFixed(0)} KB)`);
  } catch(e) {
    setStatus('Save failed: ' + e.message);
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
    reelBgmBuffer = await audioCtx.decodeAudioData(arrayBuf);
    btnReelBgm.textContent = `♫ ${file.name}`;
  } catch(e) { btnReelBgm.textContent = '+ Add BGM (error)'; }
});

// ── Export ──
if (btnReelExport) btnReelExport.addEventListener('click', async () => {
  if (!reelAudioBuffer || !reelScenes) return;
  const platform = REEL_PLATFORMS[reelPlatform];
  const canvas = document.createElement('canvas');
  canvas.width = platform.width; canvas.height = platform.height;
  const ctx = canvas.getContext('2d');
  const fps = 30;
  const stream = canvas.captureStream(fps);

  setStatus('Exporting Reel...', true);
  btnReelExport.disabled = true;

  try {
    const audioDest = audioCtx.createMediaStreamDestination();
    const audioSource = audioCtx.createBufferSource();
    audioSource.buffer = reelAudioBuffer;
    audioSource.connect(audioDest);
    if (reelBgmBuffer) {
      const bgmSource = audioCtx.createBufferSource();
      bgmSource.buffer = reelBgmBuffer;
      bgmSource.loop = true;
      const bgmGain = audioCtx.createGain();
      bgmGain.gain.value = 0.3;
      bgmSource.connect(bgmGain);
      bgmGain.connect(audioDest);
      bgmSource.start();
    }
    const combinedStream = new MediaStream([...stream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 8000000 });
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

    recorder.start(100); audioSource.start();
    const t0 = performance.now();
    let stopped = false;

    timerWorker.onmessage = () => {
      if (stopped) return;
      const elapsed = (performance.now() - t0) / 1000;
      if (elapsed >= reelAudioBuffer.duration) {
        stopped = true; timerWorker.postMessage('stop'); timerWorker.terminate(); recorder.stop(); return;
      }
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, platform.width, platform.height);
      const scene = reelScenes.find((s, i) => elapsed >= s.startTime && elapsed < s.endTime);
      if (scene) {
        if (scene.isVideo && reelVideoEl) {
          reelVideoEl.currentTime = elapsed;
          try { drawCoverFit(ctx, reelVideoEl, platform.width, platform.height); } catch(e) {}
        } else {
          const idx = reelScenes.indexOf(scene);
          const img = sceneImages[idx];
          if (img) { try { drawCoverFit(ctx, img, platform.width, platform.height); } catch(e) {} }
        }
      }
      if (reelSubtitleStyle !== 'none' && reelWords.length > 0) {
        renderReelSubtitle(ctx, platform.width, platform.height, elapsed, reelWords, reelSubtitleStyle);
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

    const videoBlob = new Blob(chunks, { type: mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(videoBlob);
    a.download = `stori-reel.webm`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    setStatus(`Reel exported (${(videoBlob.size / 1048576).toFixed(1)} MB)`);
  } catch(e) {
    setStatus('Export failed: ' + e.message);
  }
  btnReelExport.disabled = false;
});

// ── Open in Full Editor ──
if (btnReelFullEditor) btnReelFullEditor.addEventListener('click', () => {
  if (!reelAudioBuffer || !reelScenes) return;
  stopReelPreview();
  currentBuffer = reelAudioBuffer;
  photoItems = [];
  videoTimelineItems = [];
  const platform = REEL_PLATFORMS[reelPlatform];

  for (const scene of reelScenes) {
    if (scene.isVideo && reelVideoEl) {
      // Video scene → video timeline
      const tc = document.createElement('canvas'); tc.width = 160; tc.height = 90;
      try { tc.getContext('2d').drawImage(reelVideoEl, 0, 0, 160, 90); } catch(e) {}
      const thumbUrl = tc.toDataURL('image/jpeg', 0.6);
      const thumbImg = new Image(); thumbImg.src = thumbUrl;
      videoTimelineItems.push({
        id: nextVideoTimelineId++,
        videoEl: reelVideoEl, videoSrc: reelVideoSrc,
        videoDuration: reelVideoEl.duration,
        inPoint: scene.startTime, outPoint: scene.endTime,
        startTime: scene.startTime, duration: scene.duration,
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
        bold: true, position: 'bottom', animation: 'none', animDur: 0,
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

  reelPage.classList.remove('visible');
  editorEl.classList.add('visible');
  reelMode = false;
  updateAudioControls();
  applyEditorPlanGating();
  loadEditorLibrary();
  if (typeof renderVideoTimeline === 'function') renderVideoTimeline();
  drawRuler(); renderPhotos(); renderTexts(); renderSubtitles();
  if (typeof setupEditorLanguageSelector === 'function' && editorLanguageTracks.length > 0) setupEditorLanguageSelector();
  const items = photoItems.length + videoTimelineItems.length;
  setStatus(`Reel transferred to editor: ${items} items, ${subtitleItems.length} subtitles`);
});

// ── Load .storireel project ──
async function loadReelProject(project) {
  // Navigate to reel page
  dropZone.classList.add('hidden');
  reelPage.classList.add('visible');
  reelMode = true;

  // Restore settings
  reelPlatform = project.platform || 'instagram';
  reelDuration = project.duration || 60;
  reelSubtitleStyle = project.subtitleStyle || 'highlight';
  reelTransition = project.transition || 'whip-pan';
  reelSubColor = project.subColor || '#ffffff';
  reelSubOutline = project.subOutline || '#000000';
  reelSubBackdrop = project.subBackdrop || 'dark';

  // Update UI
  if (reelPlatformEl) reelPlatformEl.value = reelPlatform;
  if (reelDurationEl) reelDurationEl.value = reelDuration;
  if (reelSubtitleStyleEl) reelSubtitleStyleEl.value = reelSubtitleStyle;
  if (reelTransitionEl) reelTransitionEl.value = reelTransition;
  if (reelSubColorPreset) reelSubColorPreset.value = reelSubColor;
  if (reelSubOutlinePreset) reelSubOutlinePreset.value = reelSubOutline;
  if (reelSubBackdropPreset) reelSubBackdropPreset.value = reelSubBackdrop;

  // Restore audio
  if (project.audio && project.audio.data) {
    try {
      showPageLoader('Restoring audio...');
      const arrayBuf = base64ToArrayBuffer(project.audio.data);
      reelAudioBuffer = await audioCtx.decodeAudioData(arrayBuf);
      hidePageLoader();
    } catch(e) { hidePageLoader(); setStatus('Could not restore audio'); }
  }

  // Restore scenes + words
  reelWords = project.words || [];
  reelScenes = project.scenes || [];

  // Show mini editor if scenes exist
  if (reelScenes.length > 0) {
    reelStepEditor.classList.remove('hidden');
    renderReelScenes();
    renderReelFrame(0);
    if (reelTimeEl && reelAudioBuffer) reelTimeEl.textContent = `0:00 / ${fmtShort(reelAudioBuffer.duration)}`;
  }

  setStatus('Reel project loaded');
}
