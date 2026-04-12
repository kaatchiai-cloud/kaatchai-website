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
          const prevSize = reelSubSize, prevPos = reelSubPosition, prevColor = reelSubColor, prevOutline = reelSubOutline, prevBackdrop = reelSubBackdrop;
          reelSubSize = rs.subSize; reelSubPosition = rs.subPosition; reelSubColor = rs.subColor; reelSubOutline = rs.subOutline; reelSubBackdrop = rs.subBackdrop;
          renderReelSubtitle(ctx, cw, ch, t, rs.words, rs.style);
          reelSubSize = prevSize; reelSubPosition = prevPos; reelSubColor = prevColor; reelSubOutline = prevOutline; reelSubBackdrop = prevBackdrop;
        } else {
          renderTextOverlays(ctx, cw, ch, t, sortedSubs);
        }
      } catch(e) {
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
        _renderReelExtras(previewCtx, previewCW, previewCH, elapsed);
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
      console.log('[ReelProps] show called, panel:', !!reelPropsPanel, 'subtitle:', !!window._editorReelSubtitle, 'overlays:', window._editorReelOverlays?.length, 'chipsEl:', !!editorOverlayChips);
      if (!reelPropsPanel) return;
      const rs = window._editorReelSubtitle;
      if (!rs && (!window._editorReelOverlays || window._editorReelOverlays.length === 0)) return;
      reelPropsPanel.style.display = '';
      if (rs) {
        const el = (id) => $(id);
        const ss = el('rep-sub-style'); if (ss) ss.value = rs.style || 'highlight';
        const sc = el('rep-sub-color'); if (sc) sc.value = rs.subColor || '#ffffff';
        const so = el('rep-sub-outline'); if (so) so.value = rs.subOutline || '#000000';
        const sb = el('rep-sub-backdrop'); if (sb) sb.value = rs.subBackdrop || 'dark';
        const sz = el('rep-sub-size'); if (sz) sz.value = rs.subSize || 4;
        const szl = el('rep-sub-size-label'); if (szl) szl.textContent = rs.subSize || 4;
        const sp = el('rep-sub-pos'); if (sp) sp.value = rs.subPosition || 'bottom';
      }
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
    ['rep-sub-style','rep-sub-color','rep-sub-outline','rep-sub-backdrop','rep-sub-size','rep-sub-pos'].forEach(id => {
      const el = $(id);
      if (!el) return;
      const evt = (el.type === 'range' || el.type === 'color') ? 'input' : 'change';
      el.addEventListener(evt, () => {
        if (!window._editorReelSubtitle) return;
        const rs = window._editorReelSubtitle;
        rs.style = $('rep-sub-style')?.value || rs.style;
        rs.subColor = $('rep-sub-color')?.value || rs.subColor;
        rs.subOutline = $('rep-sub-outline')?.value || rs.subOutline;
        rs.subBackdrop = $('rep-sub-backdrop')?.value || rs.subBackdrop;
        rs.subSize = parseFloat($('rep-sub-size')?.value) || rs.subSize;
        rs.subPosition = $('rep-sub-pos')?.value || rs.subPosition;
        const szl = $('rep-sub-size-label');
        if (szl) szl.textContent = $('rep-sub-size')?.value;
        // Sync to reel globals
        if (typeof reelSubtitleStyle !== 'undefined') {
          reelSubtitleStyle = rs.style; reelSubColor = rs.subColor; reelSubOutline = rs.subOutline;
          reelSubBackdrop = rs.subBackdrop; reelSubSize = rs.subSize; reelSubPosition = rs.subPosition;
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
    } catch(e) { console.error('[Preview] Reel props init error:', e); window._showReelPropsPanel = function(){}; }
