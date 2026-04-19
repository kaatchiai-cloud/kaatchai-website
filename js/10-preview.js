    // ── Preview (inline + fullscreen) ──
    function _renderReelExtras(ctx, cw, ch, t) {
      try {
        // Draw reel frame overlay if transferred from reel creator
        if (window._editorReelFrame && window._editorReelFrame.template !== 'none' && typeof drawReelFrame === 'function') {
          const saved = { t: reelFrameTemplate, txt: reelFrameText, bg: reelFrameBgColor, tc: reelFrameTextColor, op: reelFrameOpacity, img: reelFrameImgEl };
          reelFrameTemplate = window._editorReelFrame.template;
          reelFrameText = window._editorReelFrame.text;
          reelFrameBgColor = window._editorReelFrame.bgColor;
          reelFrameTextColor = window._editorReelFrame.textColor;
          reelFrameOpacity = window._editorReelFrame.opacity;
          reelFrameImgEl = window._editorReelFrame.imgEl;
          drawReelFrame(ctx, cw, ch);
          reelFrameTemplate = saved.t; reelFrameText = saved.txt; reelFrameBgColor = saved.bg;
          reelFrameTextColor = saved.tc; reelFrameOpacity = saved.op; reelFrameImgEl = saved.img;
        }
        // Draw reel overlays if transferred from reel creator
        if (window._editorReelOverlays && window._editorReelOverlays.length > 0 && typeof drawReelOverlays === 'function') {
          const savedItems = reelOverlayItems;
          reelOverlayItems = window._editorReelOverlays;
          drawReelOverlays(ctx, cw, ch, t);
          reelOverlayItems = savedItems;
        }
      } catch(e) { console.warn('[ReelExtras] error:', e); }
    }
    function _renderReelOrStdSubs(ctx, cw, ch, t, sortedSubs) {
      try {
        if (window._editorReelSubtitle && window._editorReelSubtitle.words?.length > 0) {
          const rs = window._editorReelSubtitle;
          console.log('[RenderSubs] using reel subtitle style:', rs.style, 'font:', rs.subFont, 'allCaps:', rs.subAllCaps, 'words:', rs.words?.length);
          const prevSize = reelSubSize, prevPos = reelSubPosition, prevColor = reelSubColor, prevOutline = reelSubOutline, prevBackdrop = reelSubBackdrop;
          const prevFont = reelSubFont, prevCaps = reelSubAllCaps, prevAccent = reelSubAccent;
          reelSubSize = rs.subSize; reelSubPosition = rs.subPosition; reelSubColor = rs.subColor; reelSubOutline = rs.subOutline; reelSubBackdrop = rs.subBackdrop;
          if (rs.subFont !== undefined) reelSubFont = rs.subFont;
          if (rs.subAllCaps !== undefined) reelSubAllCaps = rs.subAllCaps;
          if (rs.subAccent !== undefined) reelSubAccent = rs.subAccent;
          renderReelSubtitle(ctx, cw, ch, t, rs.words, rs.style);
          reelSubSize = prevSize; reelSubPosition = prevPos; reelSubColor = prevColor; reelSubOutline = prevOutline; reelSubBackdrop = prevBackdrop;
          reelSubFont = prevFont; reelSubAllCaps = prevCaps; reelSubAccent = prevAccent;
        } else {
          console.log('[RenderSubs] no reel subtitle (editorReelSubtitle:', !!window._editorReelSubtitle, 'words:', window._editorReelSubtitle?.words?.length, ') — using standard subs');
          renderTextOverlays(ctx, cw, ch, t, sortedSubs);
        }
      } catch(e) {
        console.warn('[RenderSubs] error:', e);
        renderTextOverlays(ctx, cw, ch, t, sortedSubs);
      }
    }
    let previewAnimId = null, previewAudioSource = null;
    let previewPlaying = false, previewStartedAt = 0, previewPausedAt = 0;
    let previewSorted = [], previewSortedTexts = [], previewSortedSubs = [], previewCtx = null, previewCW = 0, previewCH = 0;
    let previewMode = 'none'; // 'inline' | 'fullscreen' | 'none'
    let _previewActiveClipIdx = -1;

    function _drawVideoCoverFit(ctx, videoEl, w, h) {
      const vw = videoEl.videoWidth || w, vh = videoEl.videoHeight || h;
      if (!vw || !vh) return;
      const scale = Math.max(w / vw, h / vh);
      const dw = vw * scale, dh = vh * scale;
      ctx.drawImage(videoEl, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }

    function _isAnimatedPreview() {
      return typeof createVideoMode !== 'undefined' && createVideoMode === 'animated' && videoTimelineItems.length > 0 && videoTimelineItems[0].videoEl;
    }

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
        // Use first-word time so word-by-word/karaoke/bold-center subtitles show in static preview
        const reelWords = window._editorReelSubtitle?.words;
        const previewT = (reelWords?.length > 0) ? (reelWords[0].start + 0.01) : 0;
        // For video items, seek first then render
        const clip = videoTimelineItems[0];
        if (clip && clip.videoEl) {
          const seekTime = clip.inPoint || 0;
          clip.videoEl.currentTime = seekTime;
          clip.videoEl.onseeked = () => { clip.videoEl.onseeked = null; renderInlineFrame(previewT); };
          // Fallback if onseeked doesn't fire
          setTimeout(() => renderInlineFrame(previewT), 300);
        } else {
          renderInlineFrame(previewT);
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
      _renderReelExtras(ctx, width, height, t);
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

      if (_isAnimatedPreview()) {
        _previewActiveClipIdx = -1;
        const clipIdx = videoTimelineItems.findIndex(c => fromTime >= c.startTime && fromTime < c.startTime + c.duration);
        if (clipIdx >= 0) {
          const clip = videoTimelineItems[clipIdx];
          const posInClip = clip.inPoint + (fromTime - clip.startTime);
          clip.videoEl.currentTime = Math.max(clip.inPoint, posInClip);
          clip.videoEl.onseeked = () => { clip.videoEl.onseeked = null; clip.videoEl.play().catch(() => {}); };
          setTimeout(() => { clip.videoEl.play().catch(() => {}); }, 400);
          _previewActiveClipIdx = clipIdx;
        }
      }

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
        if (_isAnimatedPreview()) {
          const newIdx1 = videoTimelineItems.findIndex(c => elapsed >= c.startTime && elapsed < c.startTime + c.duration);
          if (newIdx1 !== _previewActiveClipIdx) {
            if (_previewActiveClipIdx >= 0 && videoTimelineItems[_previewActiveClipIdx]) videoTimelineItems[_previewActiveClipIdx].videoEl.pause();
            _previewActiveClipIdx = newIdx1;
            if (newIdx1 >= 0) {
              const nc1 = videoTimelineItems[newIdx1];
              nc1.videoEl.currentTime = nc1.inPoint + 0.5;
              nc1.videoEl.onseeked = () => { nc1.videoEl.onseeked = null; if (previewPlaying) nc1.videoEl.play().catch(() => {}); };
              setTimeout(() => { if (previewPlaying) nc1.videoEl.play().catch(() => {}); }, 400);
            }
          }
          previewCtx.fillStyle = '#000';
          previewCtx.fillRect(0, 0, cw1, ch1);
          if (newIdx1 >= 0) _drawVideoCoverFit(previewCtx, videoTimelineItems[newIdx1].videoEl, cw1, ch1);
        } else {
          const bgM1 = renderBgVideoBefore(previewCtx, cw1, ch1, elapsed, previewSorted);
          if (bgM1 !== 'skip-images') renderTimelineFrame(previewCtx, cw1, ch1, elapsed, previewSorted);
          renderBgVideoAfter(previewCtx, cw1, ch1, elapsed, previewSorted, bgM1);
        }
        renderPiP(previewCtx, cw1, ch1, elapsed);
        renderTextOverlays(previewCtx, cw1, ch1, elapsed, previewSortedTexts);
        _renderReelOrStdSubs(previewCtx, cw1, ch1, elapsed, previewSortedSubs);
        if (fr1.applied) previewCtx.restore();
        _renderReelExtras(previewCtx, previewCW, previewCH, elapsed);
        renderLogo(previewCtx, previewCW, previewCH);
        previewCtx.restore();
      } else {
        const fr2 = applyFrame(previewCtx, previewCW, previewCH);
        if (fr2.applied) { previewCtx.save(); previewCtx.beginPath(); previewCtx.rect(fr2.x, fr2.y, fr2.w, fr2.h); previewCtx.clip(); previewCtx.translate(fr2.x, fr2.y); }
        const cw2 = fr2.applied ? fr2.w : previewCW, ch2 = fr2.applied ? fr2.h : previewCH;
        if (_isAnimatedPreview()) {
          const newIdx2 = videoTimelineItems.findIndex(c => elapsed >= c.startTime && elapsed < c.startTime + c.duration);
          if (newIdx2 !== _previewActiveClipIdx) {
            if (_previewActiveClipIdx >= 0 && videoTimelineItems[_previewActiveClipIdx]) videoTimelineItems[_previewActiveClipIdx].videoEl.pause();
            _previewActiveClipIdx = newIdx2;
            if (newIdx2 >= 0) {
              const nc2 = videoTimelineItems[newIdx2];
              nc2.videoEl.currentTime = nc2.inPoint + 0.5;
              nc2.videoEl.onseeked = () => { nc2.videoEl.onseeked = null; if (previewPlaying) nc2.videoEl.play().catch(() => {}); };
              setTimeout(() => { if (previewPlaying) nc2.videoEl.play().catch(() => {}); }, 400);
            }
          }
          previewCtx.fillStyle = '#000';
          previewCtx.fillRect(0, 0, cw2, ch2);
          if (newIdx2 >= 0) _drawVideoCoverFit(previewCtx, videoTimelineItems[newIdx2].videoEl, cw2, ch2);
        } else {
          const bgM2 = renderBgVideoBefore(previewCtx, cw2, ch2, elapsed, previewSorted);
          if (bgM2 !== 'skip-images') renderTimelineFrame(previewCtx, cw2, ch2, elapsed, previewSorted);
          renderBgVideoAfter(previewCtx, cw2, ch2, elapsed, previewSorted, bgM2);
        }
        renderPiP(previewCtx, cw2, ch2, elapsed);
        renderTextOverlays(previewCtx, cw2, ch2, elapsed, previewSortedTexts);
        _renderReelOrStdSubs(previewCtx, cw2, ch2, elapsed, previewSortedSubs);
        if (fr2.applied) previewCtx.restore();
        _renderReelExtras(previewCtx, previewCW, previewCH, elapsed);
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

      try { renderPreviewFrame(elapsed); } catch(e) { console.error('[Preview] render error:', e); }
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
      if (_isAnimatedPreview()) {
        videoTimelineItems.forEach(c => { try { c.videoEl.pause(); } catch(e) {} });
        _previewActiveClipIdx = -1;
      }
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

    // ── Reel Properties Editor Panel ──
    try {
    const reelPropsPanel = $('reel-editor-props');
    const editorOverlayChips = $('editor-overlay-chips');

    function showReelPropsPanel() {
      const rs = window._editorReelSubtitle;
      const hasOverlays = window._editorReelOverlays?.length > 0;
      // Show word-subtitle row and hide block-subtitle rows for reel content
      const reelRow = $('sub-reel-row');
      const blockRows = $('sub-block-rows');
      if (reelRow) {
        reelRow.style.display = rs ? '' : 'none';
        if (rs) {
          const ss = $('sub-reel-style'); if (ss) ss.value = rs.style || 'highlight';
          const sf = $('sub-reel-font'); if (sf) sf.value = rs.subFont || 'Poppins';
          const sac = $('sub-reel-all-caps'); if (sac) sac.checked = rs.subAllCaps || false;
          const sc = $('sub-reel-color'); if (sc) sc.value = rs.subColor || '#ffffff';
          const sacc = $('sub-reel-accent'); if (sacc) sacc.value = rs.subAccent || '#7c3aed';
          const so = $('sub-reel-outline'); if (so) so.value = rs.subOutline || '#000000';
          const sb = $('sub-reel-backdrop'); if (sb) sb.value = rs.subBackdrop || 'dark';
          const sz = $('sub-reel-size'); if (sz) sz.value = rs.subSize || 4;
          const szl = $('sub-reel-size-label'); if (szl) szl.textContent = rs.subSize || 4;
          const posNum = typeof rs.subPosition === 'number' ? rs.subPosition : (rs.subPosition === 'top' ? 12 : rs.subPosition === 'center' ? 52 : 85);
          const sp = $('sub-reel-pos'); if (sp) sp.value = posNum <= 20 ? 'top' : posNum <= 65 ? 'center' : 'bottom';
          const spn = $('sub-reel-pos-num'); if (spn) { spn.value = posNum; const spl = $('sub-reel-pos-label'); if (spl) spl.textContent = posNum + '%'; }
          // Reflect preset name in sub-global-preset dropdown
          if (typeof REEL_SUB_PRESETS !== 'undefined') {
            const gp = $('sub-global-preset');
            if (gp) {
              const match = Object.entries(REEL_SUB_PRESETS).find(([, p]) =>
                p.subtitleStyle === rs.style && p.subFont === rs.subFont &&
                p.subAllCaps === rs.subAllCaps && p.subAccent === rs.subAccent
              );
              gp.value = match ? match[0] : '';
            }
          }
        }
      }
      if (blockRows) blockRows.style.display = rs ? 'none' : '';
      // Reel Properties panel now only shows for overlays
      if (!reelPropsPanel) return;
      if (!hasOverlays) { reelPropsPanel.style.display = 'none'; return; }
      reelPropsPanel.style.display = '';
      renderEditorOverlayChips();
    }

    function renderEditorOverlayChips() {
      if (!editorOverlayChips) return;
      const items = window._editorReelOverlays || [];
      if (!items.length) { editorOverlayChips.style.display = 'none'; return; }
      editorOverlayChips.style.display = 'flex';
      const totalDur = currentBuffer ? currentBuffer.duration : 60;
      editorOverlayChips.innerHTML = items.map((item, i) => {
        const def = (typeof REEL_OVERLAY_PRESETS !== 'undefined') ? REEL_OVERLAY_PRESETS[item.type] : null;
        const label = def ? def.label : item.type;
        const endTime = (item.startTime + item.duration).toFixed(1);
        return `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:4px 8px;font-size:0.72rem;flex-shrink:1;min-width:0;">
          ${label}
          <input type="number" class="eov-start" data-idx="${i}" value="${item.startTime.toFixed(1)}" min="0" max="${totalDur.toFixed(1)}" step="0.5" style="width:42px;font-size:inherit;padding:2px 3px;">–<input type="number" class="eov-end" data-idx="${i}" value="${endTime}" min="0" max="${totalDur.toFixed(1)}" step="0.5" style="width:42px;font-size:inherit;padding:2px 3px;">s
          <button class="eov-del" data-idx="${i}" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:inherit;padding:0 2px;line-height:1;">✕</button>
        </span>`;
      }).join('');
      // Wire events
      editorOverlayChips.querySelectorAll('.eov-start').forEach(inp => {
        inp.addEventListener('change', () => {
          const idx = parseInt(inp.dataset.idx);
          if (window._editorReelOverlays[idx]) {
            window._editorReelOverlays[idx].startTime = Math.max(0, parseFloat(inp.value) || 0);
            if (typeof reelOverlayItems !== 'undefined') reelOverlayItems = window._editorReelOverlays.map(o => ({ ...o }));
          }
        });
      });
      editorOverlayChips.querySelectorAll('.eov-end').forEach(inp => {
        inp.addEventListener('change', () => {
          const idx = parseInt(inp.dataset.idx);
          const ov = window._editorReelOverlays[idx];
          if (ov) {
            const end = Math.max(ov.startTime + 0.5, parseFloat(inp.value) || 0);
            ov.duration = end - ov.startTime;
            if (typeof reelOverlayItems !== 'undefined') reelOverlayItems = window._editorReelOverlays.map(o => ({ ...o }));
          }
        });
      });
      editorOverlayChips.querySelectorAll('.eov-del').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          window._editorReelOverlays.splice(idx, 1);
          if (typeof reelOverlayItems !== 'undefined') reelOverlayItems = window._editorReelOverlays.map(o => ({ ...o }));
          renderEditorOverlayChips();
        });
      });
    }

    // Subtitle property controls
    ['sub-reel-style','sub-reel-font','sub-reel-all-caps','sub-reel-color','sub-reel-accent','sub-reel-outline','sub-reel-backdrop','sub-reel-size','sub-reel-pos','sub-reel-pos-num'].forEach(id => {
      const el = $(id);
      if (!el) return;
      const evt = (el.type === 'range' || el.type === 'color') ? 'input' : 'change';
      el.addEventListener(evt, () => {
        if (!window._editorReelSubtitle) return;
        const rs = window._editorReelSubtitle;
        if (id === 'sub-reel-style' && typeof REEL_SUB_PRESETS !== 'undefined') {
          const newStyle = $('sub-reel-style')?.value;
          const preset = Object.values(REEL_SUB_PRESETS).find(p => p.subtitleStyle === newStyle);
          if (preset) {
            rs.style = newStyle;
            rs.subFont = preset.subFont; rs.subAllCaps = preset.subAllCaps; rs.subAccent = preset.subAccent;
            rs.subColor = preset.subColor; rs.subOutline = preset.subOutline;
            rs.subBackdrop = preset.subBackdrop; rs.subSize = preset.subSize;
            rs.subPosition = preset.subPosition;
            const sf = $('sub-reel-font'); if (sf) sf.value = preset.subFont;
            const sac = $('sub-reel-all-caps'); if (sac) sac.checked = preset.subAllCaps;
            const sacc = $('sub-reel-accent'); if (sacc) sacc.value = preset.subAccent;
            const sc = $('sub-reel-color'); if (sc) sc.value = preset.subColor;
            const so = $('sub-reel-outline'); if (so) so.value = preset.subOutline;
            const sb = $('sub-reel-backdrop'); if (sb) sb.value = preset.subBackdrop;
            const sz = $('sub-reel-size'); if (sz) sz.value = preset.subSize;
            const szl = $('sub-reel-size-label'); if (szl) szl.textContent = preset.subSize;
            const sp2 = $('sub-reel-pos'); if (sp2) sp2.value = (preset.subPosition <= 20 ? 'top' : preset.subPosition <= 65 ? 'center' : 'bottom');
            const spn2 = $('sub-reel-pos-num'); if (spn2) { spn2.value = preset.subPosition; const spl2 = $('sub-reel-pos-label'); if (spl2) spl2.textContent = preset.subPosition + '%'; }
          } else {
            rs.style = newStyle || rs.style;
          }
        } else {
          rs.style = $('sub-reel-style')?.value || rs.style;
          rs.subFont = $('sub-reel-font')?.value || rs.subFont;
          rs.subAllCaps = $('sub-reel-all-caps')?.checked ?? rs.subAllCaps;
          rs.subColor = $('sub-reel-color')?.value || rs.subColor;
          rs.subAccent = $('sub-reel-accent')?.value || rs.subAccent;
          rs.subOutline = $('sub-reel-outline')?.value || rs.subOutline;
          rs.subBackdrop = $('sub-reel-backdrop')?.value || rs.subBackdrop;
          rs.subSize = parseFloat($('sub-reel-size')?.value) || rs.subSize;
          if (id === 'sub-reel-pos') {
            const posStr = $('sub-reel-pos')?.value || 'bottom';
            const posN = posStr === 'top' ? 12 : posStr === 'center' ? 52 : 85;
            rs.subPosition = posN;
            const spn = $('sub-reel-pos-num'); if (spn) { spn.value = posN; const spl = $('sub-reel-pos-label'); if (spl) spl.textContent = posN + '%'; }
          } else if (id === 'sub-reel-pos-num') {
            const posN = parseInt($('sub-reel-pos-num')?.value) || 85;
            rs.subPosition = posN;
            const sp = $('sub-reel-pos'); if (sp) sp.value = posN <= 20 ? 'top' : posN <= 65 ? 'center' : 'bottom';
            const spl = $('sub-reel-pos-label'); if (spl) spl.textContent = posN + '%';
          } else {
            rs.subPosition = rs.subPosition;
          }
          const szl = $('sub-reel-size-label');
          if (szl) szl.textContent = $('sub-reel-size')?.value;
        }
        // Sync all to reel globals
        if (typeof reelSubtitleStyle !== 'undefined') {
          reelSubtitleStyle = rs.style; reelSubColor = rs.subColor; reelSubOutline = rs.subOutline;
          reelSubBackdrop = rs.subBackdrop; reelSubSize = rs.subSize; reelSubPosition = rs.subPosition;
          reelSubFont = rs.subFont; reelSubAllCaps = rs.subAllCaps; reelSubAccent = rs.subAccent;
        }
        // Re-render inline preview
        if (!previewPlaying) {
          const t = (inlineScrub.value / 1000) * (currentBuffer?.duration || 1);
          renderInlineFrame(t);
        }
      });
    });

    // Overlay add buttons
    document.querySelectorAll('[data-editor-overlay]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!window._editorReelOverlays) window._editorReelOverlays = [];
        const type = btn.dataset.editorOverlay;
        const def = (typeof REEL_OVERLAY_PRESETS !== 'undefined') ? REEL_OVERLAY_PRESETS[type] : null;
        if (!def) return;
        const totalDur = currentBuffer ? currentBuffer.duration : 60;
        const startTime = parseFloat((totalDur * 0.1).toFixed(1));
        window._editorReelOverlays.push({
          id: Date.now(), type, startTime, duration: def.defaultDuration, params: { ...def.defaultParams },
        });
        if (typeof reelOverlayItems !== 'undefined') reelOverlayItems = window._editorReelOverlays.map(o => ({ ...o }));
        renderEditorOverlayChips();
        // Show panel if hidden
        if (reelPropsPanel) reelPropsPanel.style.display = '';
      });
    });

    // Expose for external callers (openReelInFullEditor, loadProject)
    console.log('[Preview] Registering _showReelPropsPanel');
    window._showReelPropsPanel = showReelPropsPanel;
    // Force a fresh inline canvas render regardless of current previewMode
    window._forceInlineRender = function() {
      console.log('[ForceRender] called. _editorReelSubtitle style:', window._editorReelSubtitle?.style, 'words:', window._editorReelSubtitle?.words?.length, 'previewMode was:', previewMode);
      stopPreview();
      previewMode = 'none';
      showInlinePreview();
    };
    } catch(e) { console.error('[Preview] Reel props init error:', e); window._showReelPropsPanel = function(){}; window._forceInlineRender = function(){}; }
