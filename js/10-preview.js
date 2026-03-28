    // ── Preview (inline + fullscreen) ──
    function _renderReelOrStdSubs(ctx, cw, ch, t, sortedSubs) {
      if (window._editorReelSubtitle && window._editorReelSubtitle.words?.length > 0) {
        const rs = window._editorReelSubtitle;
        const prevSize = reelSubSize, prevPos = reelSubPosition, prevColor = reelSubColor, prevOutline = reelSubOutline, prevBackdrop = reelSubBackdrop;
        reelSubSize = rs.subSize; reelSubPosition = rs.subPosition; reelSubColor = rs.subColor; reelSubOutline = rs.subOutline; reelSubBackdrop = rs.subBackdrop;
        renderReelSubtitle(ctx, cw, ch, t, rs.words, rs.style);
        reelSubSize = prevSize; reelSubPosition = prevPos; reelSubColor = prevColor; reelSubOutline = prevOutline; reelSubBackdrop = prevBackdrop;
      } else {
        renderTextOverlays(ctx, cw, ch, t, sortedSubs);
      }
    }
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
      if (!currentBuffer || (photoItems.length === 0 && textItems.length === 0 && videoTimelineItems.length === 0)) return;
      inlinePanel.style.display = '';
      if (previewMode === 'none') {
        // For video items, seek first then render
        const clip = videoTimelineItems[0];
        if (clip && clip.videoEl) {
          const seekTime = clip.inPoint || 0;
          clip.videoEl.currentTime = seekTime;
          clip.videoEl.onseeked = () => { clip.videoEl.onseeked = null; renderInlineFrame(0); };
          // Fallback if onseeked doesn't fire
          setTimeout(() => renderInlineFrame(0), 300);
        } else {
          renderInlineFrame(0);
        }
      }
    }

    // Render a single frame on inline canvas at given time
    function renderInlineFrame(t) {
      if (typeof getSelectedImageSize !== 'function') return;
      const { width, height } = getSelectedImageSize();
      console.log('[InlinePreview] size:', width, 'x', height, 'createImageSize:', $('create-image-size')?.value);
      // Scale down for inline: portrait (reel) = 300px wide, landscape = max 480px wide
      const maxW = height > width ? 300 : 480;
      const scale = Math.min(maxW / width, 1);
      inlineCanvas.width = Math.round(width * scale);
      inlineCanvas.height = Math.round(height * scale);
      const ctx = inlineCanvas.getContext('2d');
      ctx.save();
      ctx.scale(scale, scale);
      const sorted = [...photoItems].sort((a, b) => a.startTime - b.startTime);
      const sortedTexts = [...textItems].sort((a, b) => a.startTime - b.startTime);
      const sortedSubs = [...subtitleItems].sort((a, b) => a.startTime - b.startTime);
      // Frame: draw frame first, then content inside inner rect
      const fr = applyFrame(ctx, width, height);
      if (fr.applied) {
        ctx.save();
        ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip();
        ctx.translate(fr.x, fr.y);
      }
      const cw = fr.applied ? fr.w : width;
      const ch = fr.applied ? fr.h : height;
      const bgMode = renderBgVideoBefore(ctx, cw, ch, t, sorted);
      if (bgMode !== 'skip-images') renderTimelineFrame(ctx, cw, ch, t, sorted);
      renderBgVideoAfter(ctx, cw, ch, t, sorted, bgMode);
      renderPiP(ctx, cw, ch, t);
      renderTextOverlays(ctx, cw, ch, t, sortedTexts);
      _renderReelOrStdSubs(ctx, cw, ch, t, sortedSubs);
      if (fr.applied) ctx.restore();
      renderLogo(ctx, width, height);
      ctx.restore();
    }

    // ── Fullscreen preview ──
    btnPreview.addEventListener('click', () => {
      if (!currentBuffer || (photoItems.length === 0 && textItems.length === 0 && videoTimelineItems.length === 0)) { setStatus('Add at least one photo, video, or text to preview'); return; }
      stopPreview();
      previewMode = 'fullscreen';
      previewOverlay.classList.add('visible');
      previewPausedAt = 0;
      startPreviewPlayback(0, 'fullscreen');
    });
    previewClose.addEventListener('click', () => { stopPreview(); previewOverlay.classList.remove('visible'); previewMode = 'none'; });

    // ── Inline preview ──
    inlinePlay.addEventListener('click', () => {
      if (!currentBuffer || (photoItems.length === 0 && textItems.length === 0 && videoTimelineItems.length === 0)) return;
      if (previewPlaying && previewMode === 'inline') {
        // Pause
        previewPausedAt = ensureAudioCtx().currentTime - previewStartedAt;
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
        const maxW = height > width ? 300 : 480;
        const scale = Math.min(maxW / width, 1);
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
      if (ensureAudioCtx().state === 'suspended') {
        await ensureAudioCtx().resume();
      }

      previewAudioSource = ensureAudioCtx().createBufferSource();
      previewAudioSource.buffer = currentBuffer;
      previewAudioSource.connect(ensureAudioCtx().destination);
      previewStartedAt = ensureAudioCtx().currentTime - fromTime;
      previewAudioSource.start(0, fromTime);

      // Start BGM if loaded
      if (bgmBuffer) {
        bgmSource = ensureAudioCtx().createBufferSource();
        bgmSource.buffer = bgmBuffer;
        bgmSource.loop = bgmLoop;
        bgmGainNode = ensureAudioCtx().createGain();
        bgmGainNode.gain.value = bgmVolume;
        bgmSource.connect(bgmGainNode);
        bgmGainNode.connect(ensureAudioCtx().destination);
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
        const maxW = height > width ? 300 : 480;
        const scale = Math.min(maxW / width, 1);
        previewCtx.save();
        previewCtx.scale(scale, scale);
        const fr1 = applyFrame(previewCtx, previewCW, previewCH);
        if (fr1.applied) { previewCtx.save(); previewCtx.beginPath(); previewCtx.rect(fr1.x, fr1.y, fr1.w, fr1.h); previewCtx.clip(); previewCtx.translate(fr1.x, fr1.y); }
        const cw1 = fr1.applied ? fr1.w : previewCW, ch1 = fr1.applied ? fr1.h : previewCH;
        const bgM1 = renderBgVideoBefore(previewCtx, cw1, ch1, elapsed, previewSorted);
        if (bgM1 !== 'skip-images') renderTimelineFrame(previewCtx, cw1, ch1, elapsed, previewSorted);
        renderBgVideoAfter(previewCtx, cw1, ch1, elapsed, previewSorted, bgM1);
        renderPiP(previewCtx, cw1, ch1, elapsed);
        renderTextOverlays(previewCtx, cw1, ch1, elapsed, previewSortedTexts);
        _renderReelOrStdSubs(previewCtx, cw1, ch1, elapsed, previewSortedSubs);
        if (fr1.applied) previewCtx.restore();
        renderLogo(previewCtx, previewCW, previewCH);
        previewCtx.restore();
      } else {
        const fr2 = applyFrame(previewCtx, previewCW, previewCH);
        if (fr2.applied) { previewCtx.save(); previewCtx.beginPath(); previewCtx.rect(fr2.x, fr2.y, fr2.w, fr2.h); previewCtx.clip(); previewCtx.translate(fr2.x, fr2.y); }
        const cw2 = fr2.applied ? fr2.w : previewCW, ch2 = fr2.applied ? fr2.h : previewCH;
        const bgM2 = renderBgVideoBefore(previewCtx, cw2, ch2, elapsed, previewSorted);
        if (bgM2 !== 'skip-images') renderTimelineFrame(previewCtx, cw2, ch2, elapsed, previewSorted);
        renderBgVideoAfter(previewCtx, cw2, ch2, elapsed, previewSorted, bgM2);
        renderPiP(previewCtx, cw2, ch2, elapsed);
        renderTextOverlays(previewCtx, cw2, ch2, elapsed, previewSortedTexts);
        _renderReelOrStdSubs(previewCtx, cw2, ch2, elapsed, previewSortedSubs);
        if (fr2.applied) previewCtx.restore();
        renderLogo(previewCtx, previewCW, previewCH);
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
        elapsed = ensureAudioCtx().currentTime - previewStartedAt;
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
        previewPausedAt = ensureAudioCtx().currentTime - previewStartedAt;
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
