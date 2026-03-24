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

function updateReelSegmentInfo() {
  if (!reelRegion) return;
  const dur = (reelRegion.end - reelRegion.start).toFixed(1);
  reelSegmentInfo.textContent = `Selected: ${fmtShort(reelRegion.start)} — ${fmtShort(reelRegion.end)} (${dur}s)`;
}

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
// Update time display
if (reelPreviewVideo) reelPreviewVideo.addEventListener('timeupdate', () => {
  if (reelVidTime) reelVidTime.textContent = fmtShort(reelPreviewVideo.currentTime);
});

if (btnReelUseSegment) btnReelUseSegment.addEventListener('click', async () => {
  if (!reelRegion || !reelAudioBuffer) return;
  // Extract the selected segment
  const start = reelRegion.start;
  const end = reelRegion.end;
  reelAudioBuffer = extractRegion(reelAudioBuffer, start, end);
  reelSegmentInfo.textContent = `Segment extracted: ${fmtShort(end - start)}`;
  btnReelUseSegment.textContent = '✓ Segment Ready';
  btnReelUseSegment.disabled = true;
});

// ── Preset handlers ──
if (reelPlatformEl) reelPlatformEl.addEventListener('change', () => { reelPlatform = reelPlatformEl.value; });
if (reelDurationEl) reelDurationEl.addEventListener('change', () => { reelDuration = parseInt(reelDurationEl.value); });
if (reelTransitionEl) reelTransitionEl.addEventListener('change', () => { reelTransition = reelTransitionEl.value; });
if (reelSubtitleStyleEl) reelSubtitleStyleEl.addEventListener('change', () => { reelSubtitleStyle = reelSubtitleStyleEl.value; });

// ── Generate Reel ──
if (btnReelGenerate) btnReelGenerate.addEventListener('click', async () => {
  const key = getReelApiKey();
  if (!key) { reelGenerateStatus.textContent = 'Enter your API key in Step 1 first.'; return; }

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

    // Step 3: Show mini editor
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
const reelEditSubtitle = $('reel-edit-subtitle');

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

// ── Subtitle Styling Controls ──
const reelSubColorEl = $('reel-sub-color');
const reelSubOutlineEl = $('reel-sub-outline');
const reelSubBackdropEl = $('reel-sub-backdrop');
if (reelSubColorEl) reelSubColorEl.addEventListener('input', () => { reelSubColor = reelSubColorEl.value; });
if (reelSubOutlineEl) reelSubOutlineEl.addEventListener('input', () => { reelSubOutline = reelSubOutlineEl.value; });
if (reelSubBackdropEl) reelSubBackdropEl.addEventListener('change', () => { reelSubBackdrop = reelSubBackdropEl.value; });

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
  // Transfer to main editor
  currentBuffer = reelAudioBuffer;
  photoItems = [];
  const platform = REEL_PLATFORMS[reelPlatform];
  for (const scene of reelScenes) {
    if (!scene.imgDataUrl) continue;
    const img = new Image(); img.src = scene.imgDataUrl;
    photoItems.push({
      id: nextPhotoId++, imgSrc: scene.imgDataUrl, imgEl: img,
      startTime: scene.startTime, duration: scene.duration,
      transition: scene.transition, transDur: scene.transDur, motion: scene.motion,
    });
  }
  if (reelBgmBuffer) bgmBuffer = reelBgmBuffer;
  // Set image size
  if (createImageSize) createImageSize.value = `${platform.width}x${platform.height}`;

  reelPage.classList.remove('visible');
  editorEl.classList.add('visible');
  updateAudioControls();
  applyEditorPlanGating();
  loadEditorLibrary();
  drawRuler(); renderPhotos(); renderTexts(); renderSubtitles();
  setStatus(`Reel transferred to editor: ${photoItems.length} scenes`);
});
