    // ── Preview (inline + fullscreen) ──
    let previewAnimId = null, previewAudioSource = null;
    let previewPlaying = false, previewStartedAt = 0, previewPausedAt = 0;
    let previewSorted = [], previewSortedTexts = [], previewSortedSubs = [], previewCtx = null, previewCW = 0, previewCH = 0;
    let previewMode = 'none'; // 'inline' | 'fullscreen' | 'none'

    // Fullscreen elements
    const previewScrub = $('preview-scrub');
    const previewPlayPause = $('preview-play-pause');
    let isScrubbing = false;

    // Inline elements
    const inlinePanel = $('inline-preview-panel');
    const inlineBody = $('inline-preview-body');
    const inlineCanvas = $('inline-preview-canvas');
    const inlinePlay = $('inline-preview-play');
    const inlineScrub = $('inline-preview-scrub');
    const inlineTime = $('inline-preview-time');
    const inlineCollapse = $('inline-preview-collapse');
    const inlineExpand = $('inline-preview-expand');
    const inlineHeader = $('inline-preview-header');

    // Show inline preview panel when there's content
    function showInlinePreview() {
      if (!currentBuffer || (photoItems.length === 0 && textItems.length === 0)) return;
      inlinePanel.style.display = '';
      if (previewMode === 'none') renderInlineFrame(0);
    }

    // Render a single frame on inline canvas at given time
    function renderInlineFrame(t) {
      if (typeof getSelectedImageSize !== 'function') return;
      const { width, height } = getSelectedImageSize();
      // Scale down for inline: max 480px wide
      const scale = Math.min(480 / width, 1);
      inlineCanvas.width = Math.round(width * scale);
      inlineCanvas.height = Math.round(height * scale);
      const ctx = inlineCanvas.getContext('2d');
      ctx.save();
      ctx.scale(scale, scale);
      const sorted = [...photoItems].sort((a, b) => a.startTime - b.startTime);
      const sortedTexts = [...textItems].sort((a, b) => a.startTime - b.startTime);
      const sortedSubs = [...subtitleItems].sort((a, b) => a.startTime - b.startTime);
      renderTimelineFrame(ctx, width, height, t, sorted);
      renderTextOverlays(ctx, width, height, t, sortedTexts);
      renderTextOverlays(ctx, width, height, t, sortedSubs);
      ctx.restore();
    }

    // ── Fullscreen preview ──
    btnPreview.addEventListener('click', () => {
      if (!currentBuffer || (photoItems.length === 0 && textItems.length === 0)) { setStatus('Add at least one photo or text to preview'); return; }
      stopPreview();
      previewMode = 'fullscreen';
      previewOverlay.classList.add('visible');
      previewPausedAt = 0;
      startPreviewPlayback(0, 'fullscreen');
    });
    previewClose.addEventListener('click', () => { stopPreview(); previewOverlay.classList.remove('visible'); previewMode = 'none'; });

    // ── Inline preview ──
    inlinePlay.addEventListener('click', () => {
      if (!currentBuffer || (photoItems.length === 0 && textItems.length === 0)) return;
      if (previewPlaying && previewMode === 'inline') {
        // Pause
        previewPausedAt = audioCtx.currentTime - previewStartedAt;
        previewPlaying = false;
        inlinePlay.textContent = '▶';
        stopPreviewAudio();
      } else {
        // Start/resume inline
        stopPreview();
        previewMode = 'inline';
        const from = previewPausedAt || (inlineScrub.value / 1000) * currentBuffer.duration;
        if (from >= currentBuffer.duration) {
          startPreviewPlayback(0, 'inline');
        } else {
          startPreviewPlayback(from, 'inline');
        }
      }
    });

    // Collapse/expand inline body
    inlineHeader.addEventListener('click', (e) => {
      // Don't toggle if clicking buttons inside header
      if (e.target.tagName === 'BUTTON') return;
      inlineBody.classList.toggle('collapsed');
      inlineCollapse.textContent = inlineBody.classList.contains('collapsed') ? '▶ Expand' : '▼ Collapse';
    });

    // Expand to fullscreen from inline
    inlineExpand.addEventListener('click', () => {
      const wasPlaying = previewPlaying;
      const t = previewPausedAt || (inlineScrub.value / 1000) * (currentBuffer?.duration || 1);
      stopPreview();
      previewMode = 'fullscreen';
      previewOverlay.classList.add('visible');
      previewPausedAt = t;
      if (wasPlaying) {
        startPreviewPlayback(t, 'fullscreen');
      } else {
        // Just show the frame
        setupPreviewCanvas('fullscreen');
        renderPreviewFrame(t);
        updatePreviewUI(t);
      }
    });

    // ── Shared playback logic ──
    function setupPreviewCanvas(mode) {
      const { width, height } = getSelectedImageSize();
      if (mode === 'fullscreen') {
        previewCanvas.width = width; previewCanvas.height = height;
        previewCtx = previewCanvas.getContext('2d');
        previewCW = width; previewCH = height;
      } else {
        const scale = Math.min(480 / width, 1);
        inlineCanvas.width = Math.round(width * scale);
        inlineCanvas.height = Math.round(height * scale);
        previewCtx = inlineCanvas.getContext('2d');
        previewCW = width; previewCH = height;
      }
    }

    async function startPreviewPlayback(fromTime, mode) {
      stopPreviewAudio();
      previewMode = mode;
      setupPreviewCanvas(mode);

      // Resume AudioContext and wait for it to be running
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      previewAudioSource = audioCtx.createBufferSource();
      previewAudioSource.buffer = currentBuffer;
      previewAudioSource.connect(audioCtx.destination);
      previewStartedAt = audioCtx.currentTime - fromTime;
      previewAudioSource.start(0, fromTime);

      // Start BGM if loaded
      if (bgmBuffer) {
        bgmSource = audioCtx.createBufferSource();
        bgmSource.buffer = bgmBuffer;
        bgmSource.loop = bgmLoop;
        bgmGainNode = audioCtx.createGain();
        bgmGainNode.gain.value = bgmVolume;
        bgmSource.connect(bgmGainNode);
        bgmGainNode.connect(audioCtx.destination);
        bgmSource.start(0, fromTime % bgmBuffer.duration);
      }

      // Track this source so onended only fires for the CURRENT source
      const thisSource = previewAudioSource;
      thisSource.onended = () => {
        // Only handle if this is still the active source (not replaced by a new one)
        if (previewAudioSource === thisSource && previewPlaying) {
          previewPlaying = false;
          previewPausedAt = currentBuffer.duration;
          updatePlayButtons();
        }
      };

      previewSorted = [...photoItems].sort((a, b) => a.startTime - b.startTime);
      previewSortedTexts = [...textItems].sort((a, b) => a.startTime - b.startTime);
      previewSortedSubs = [...subtitleItems].sort((a, b) => a.startTime - b.startTime);
      previewPlaying = true;
      updatePlayButtons();

      if (previewAnimId) cancelAnimationFrame(previewAnimId);
      previewAnimId = requestAnimationFrame(previewDraw);
    }

    function renderPreviewFrame(elapsed) {
      if (!previewCtx) return;
      const isInline = previewMode === 'inline';
      if (isInline) {
        const { width, height } = getSelectedImageSize();
        const scale = Math.min(480 / width, 1);
        previewCtx.save();
        previewCtx.scale(scale, scale);
        renderTimelineFrame(previewCtx, previewCW, previewCH, elapsed, previewSorted);
        renderTextOverlays(previewCtx, previewCW, previewCH, elapsed, previewSortedTexts);
        renderTextOverlays(previewCtx, previewCW, previewCH, elapsed, previewSortedSubs);
        previewCtx.restore();
      } else {
        renderTimelineFrame(previewCtx, previewCW, previewCH, elapsed, previewSorted);
        renderTextOverlays(previewCtx, previewCW, previewCH, elapsed, previewSortedTexts);
        renderTextOverlays(previewCtx, previewCW, previewCH, elapsed, previewSortedSubs);
      }
    }

    function updatePreviewUI(elapsed) {
      const dur = currentBuffer.duration;
      const val = Math.round((elapsed / dur) * 1000);
      const timeStr = `${fmtShort(elapsed)} / ${fmtShort(dur)}`;
      if (previewMode === 'fullscreen') {
        previewTimeEl.textContent = timeStr;
        if (!isScrubbing) previewScrub.value = val;
      }
      if (previewMode === 'inline' || inlinePanel.style.display !== 'none') {
        inlineTime.textContent = timeStr;
        if (!isScrubbing) inlineScrub.value = val;
      }
    }

    function updatePlayButtons() {
      if (previewMode === 'fullscreen') {
        previewPlayPause.textContent = previewPlaying ? '⏸' : '▶';
      }
      inlinePlay.textContent = (previewPlaying && previewMode === 'inline') ? '⏸' : '▶';
    }

    function previewDraw() {
      if (!previewPlaying && !isScrubbing) { previewAnimId = requestAnimationFrame(previewDraw); return; }
      let elapsed;
      const activeScrub = previewMode === 'fullscreen' ? previewScrub : inlineScrub;
      if (isScrubbing) {
        elapsed = (activeScrub.value / 1000) * currentBuffer.duration;
      } else {
        elapsed = audioCtx.currentTime - previewStartedAt;
      }
      elapsed = Math.max(0, Math.min(elapsed, currentBuffer.duration));

      renderPreviewFrame(elapsed);
      updatePreviewUI(elapsed);

      if (elapsed >= currentBuffer.duration && previewPlaying) {
        previewPlaying = false;
        previewPausedAt = currentBuffer.duration;
        updatePlayButtons();
      }
      previewAnimId = requestAnimationFrame(previewDraw);
    }

    function stopPreviewAudio() {
      if (previewAudioSource) {
        // Clear onended BEFORE stopping to prevent race condition
        previewAudioSource.onended = null;
        try { previewAudioSource.stop(); } catch(e){}
        previewAudioSource = null;
      }
      if (bgmSource) {
        try { bgmSource.stop(); } catch(e){}
        bgmSource = null; bgmGainNode = null;
      }
    }

    function stopPreview() {
      previewPlaying = false;
      if (previewAnimId) { cancelAnimationFrame(previewAnimId); previewAnimId = null; }
      stopPreviewAudio();
      updatePlayButtons();
    }

    // ── Fullscreen play/pause ──
    previewPlayPause.addEventListener('click', () => {
      if (!currentBuffer) return;
      if (previewPlaying) {
        previewPausedAt = audioCtx.currentTime - previewStartedAt;
        previewPlaying = false;
        updatePlayButtons();
        stopPreviewAudio();
      } else {
        const from = previewPausedAt || (previewScrub.value / 1000) * currentBuffer.duration;
        if (from >= currentBuffer.duration) {
          startPreviewPlayback(0, 'fullscreen');
        } else {
          startPreviewPlayback(from, 'fullscreen');
        }
      }
    });

    // ── Scrub handlers (shared pattern) ──
    function setupScrubHandler(scrubEl, mode) {
      scrubEl.addEventListener('input', () => {
        isScrubbing = true;
        const t = (scrubEl.value / 1000) * currentBuffer.duration;
        previewPausedAt = t;
        // Ensure canvas is set up for rendering
        if (!previewCtx || previewMode !== mode) {
          previewSorted = [...photoItems].sort((a, b) => a.startTime - b.startTime);
          previewSortedTexts = [...textItems].sort((a, b) => a.startTime - b.startTime);
          previewSortedSubs = [...subtitleItems].sort((a, b) => a.startTime - b.startTime);
          setupPreviewCanvas(mode);
          previewMode = mode;
        }
        renderPreviewFrame(t);
        updatePreviewUI(t);
      });
      scrubEl.addEventListener('change', () => {
        isScrubbing = false;
        const t = (scrubEl.value / 1000) * currentBuffer.duration;
        previewPausedAt = t;
        if (previewPlaying) startPreviewPlayback(t, mode);
      });
    }

    setupScrubHandler(previewScrub, 'fullscreen');
    setupScrubHandler(inlineScrub, 'inline');

    // Auto-show inline preview when photos/texts change
    let inlineRefreshTimer = null;
    const inlinePreviewObserver = new MutationObserver(() => {
      if (currentBuffer && (photoItems.length > 0 || textItems.length > 0)) {
        if (inlinePanel.style.display === 'none') showInlinePreview();
        // Throttled refresh of current frame
        if (!previewPlaying && !inlineRefreshTimer) {
          inlineRefreshTimer = setTimeout(() => {
            inlineRefreshTimer = null;
            const t = (inlineScrub.value / 1000) * (currentBuffer?.duration || 1);
            renderInlineFrame(t);
          }, 200);
        }
      } else {
        inlinePanel.style.display = 'none';
      }
    });
    inlinePreviewObserver.observe(timelineContainer, { childList: true, subtree: true });
