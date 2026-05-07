// ── Audio state helper ──
    const audioStatusEl = $('audio-status');
    function updateAudioControls() {
      const hasAudio = !!currentBuffer;
      btnPlay.disabled = !hasAudio;
      btnStop.disabled = !hasAudio;
      audioStatusEl.textContent = hasAudio ? fmt(currentBuffer.duration) : 'No audio';
      audioStatusEl.style.background = hasAudio ? '#43a047' : '#1da8cc';
      if (hasAudio) {
        selectionInfoEl.textContent = 'Click and drag on waveform to select a region';
      }
    }

    // ── Background Music ──
    const bgmInputEl = $('bgm-input');
    const bgmSection = $('bgm-section');
    const bgmNameEl = $('bgm-name');
    const bgmVolumeSlider = $('bgm-volume');
    const bgmVolumeLabel = $('bgm-volume-label');
    const bgmRemoveBtn = $('bgm-remove');
    const bgmLoopCheckbox = $('bgm-loop');
    const btnAddBgm = $('btn-add-bgm');

    // Segment colors for multi-clip BGM (index 0 is theme-aware, set per draw)
    const BGM_SEG_COLORS = ['#1da8cc','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899'];
    function bgmWaveColor() {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      return isLight ? '#1a7a9a' : '#1da8cc';
    }
    let bgmSegments = []; // [{start, end, color}]

    function drawBgmWaveform() {
      const canvas = $('bgm-waveform-canvas');
      if (!canvas || !bgmBuffer) return;
      // getBoundingClientRect forces a layout flush, returning accurate width even right after display change
      const wrap = canvas.parentElement;
      let w = wrap ? wrap.getBoundingClientRect().width : 0;
      if (!w) w = timelineContainer.getBoundingClientRect().width || timelineContainer.clientWidth;
      if (!w) { requestAnimationFrame(drawBgmWaveform); return; }
      const totalDur = aDur();
      if (!totalDur) return;
      const dpr = devicePixelRatio || 1;
      const h = 64;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim() || '#12121a';
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);

      const data = bgmBuffer.getChannelData(0);
      const sampleRate = bgmBuffer.sampleRate;
      const bgmDur = bgmBuffer.duration;
      const loop = bgmLoopCheckbox ? bgmLoopCheckbox.checked : bgmLoop;
      const visStart = visibleStart();
      const visDur = visibleDuration();
      const BAR_W = 2, BAR_GAP = 1, BAR_STEP = BAR_W + BAR_GAP;
      const samplesPerBar = Math.max(1, Math.floor(sampleRate * visDur / w * BAR_STEP));
      const midY = h / 2;

      for (let px = 0; px < w; px += BAR_STEP) {
        const t = visStart + (px / w) * visDur;
        if (t < 0 || t > totalDur) continue;
        const srcT = loop ? (t % bgmDur) : t;
        if (!loop && srcT >= bgmDur) continue;

        const startSample = Math.floor(srcT * sampleRate);
        let peak = 0;
        const end = Math.min(startSample + samplesPerBar, data.length);
        for (let i = startSample; i < end; i++) {
          const abs = Math.abs(data[i]);
          if (abs > peak) peak = abs;
        }
        const barH = Math.max(2, peak * (h - 8));
        // Color by segment, fallback
        let segColor = null;
        if (bgmSegments.length > 0) {
          const seg = bgmSegments.find(s => srcT >= s.start && srcT < s.end);
          if (seg) segColor = seg.color;
        }
        if (!segColor) {
          segColor = bgmWaveColor();
        }
        // fillRect matches WaveSurfer's solid bar rendering (stroke anti-aliases and appears lighter)
        ctx.fillStyle = segColor;
        ctx.fillRect(px, Math.round(midY - barH / 2), BAR_W, Math.max(1, Math.round(barH)));
      }
      // Segment boundary dividers
      if (bgmSegments.length > 1) {
        bgmSegments.slice(1).forEach(seg => {
          const x = ((seg.start - visStart) / visDur) * w;
          if (x < 0 || x > w) return;
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
          ctx.setLineDash([]);
        });
      }

      // Loop divider lines — use local coordinates, not secToPx
      if (loop && bgmDur < totalDur) {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        for (let t = bgmDur; t < totalDur; t += bgmDur) {
          const x = ((t - visStart) / visDur) * w;
          if (x < 0 || x > w) continue;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      // Selection overlay
      if (bgmSel) {
        const x1 = ((bgmSel.start - visStart) / visDur) * w;
        const x2 = ((bgmSel.end - visStart) / visDur) * w;
        if (x2 > 0 && x1 < w) {
          ctx.fillStyle = 'rgba(80,208,240,0.22)';
          ctx.fillRect(Math.max(0, x1), 0, Math.min(w, x2) - Math.max(0, x1), h);
          ctx.strokeStyle = '#50d0f0'; ctx.lineWidth = 1.5;
          if (x1 >= 0 && x1 <= w) { ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, h); ctx.stroke(); }
          if (x2 >= 0 && x2 <= w) { ctx.beginPath(); ctx.moveTo(x2, 0); ctx.lineTo(x2, h); ctx.stroke(); }
        }
      }
      // Move ghost
      if (bgmDragging && bgmDragging.mode === 'move') {
        const dur = bgmDragging.origSel.end - bgmDragging.origSel.start;
        const ns = bgmDragging.newStart;
        const gx1 = ((ns - visStart) / visDur) * w;
        const gx2 = ((ns + dur - visStart) / visDur) * w;
        if (gx2 > 0 && gx1 < w) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(Math.max(0, gx1), 0, Math.min(w, gx2) - Math.max(0, gx1), h);
          ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          if (gx1 >= 0 && gx1 <= w) { ctx.beginPath(); ctx.moveTo(gx1, 0); ctx.lineTo(gx1, h); ctx.stroke(); }
          if (gx2 >= 0 && gx2 <= w) { ctx.beginPath(); ctx.moveTo(gx2, 0); ctx.lineTo(gx2, h); ctx.stroke(); }
          ctx.setLineDash([]);
        }
      }
    }

    // Expose so zoom and project-load can call it
    window.drawBgmWaveform = drawBgmWaveform;

    function updateBgmSelUI() {
      const infoEl = $('bgm-sel-info');
      const btnDel = $('bgm-del-sel');
      if (bgmSel && (bgmSel.end - bgmSel.start) >= 0.05) {
        if (infoEl) infoEl.textContent = `${fmtShort(bgmSel.start)} – ${fmtShort(bgmSel.end)} (${fmtShort(bgmSel.end - bgmSel.start)})`;
        if (btnDel) btnDel.disabled = false;
      } else {
        bgmSel = null;
        if (infoEl) infoEl.textContent = 'Drag to select  •  drag selection to move';
        if (btnDel) btnDel.disabled = true;
      }
    }

    function bgmPxToTime(clientX) {
      const canvas = $('bgm-waveform-canvas');
      if (!canvas) return 0;
      const rect = canvas.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return visibleStart() + frac * visibleDuration();
    }

    const bgmCanvas = $('bgm-waveform-canvas');
    if (bgmCanvas) {
      bgmCanvas.addEventListener('mousedown', e => {
        if (!bgmBuffer) return;
        e.preventDefault();
        const t = bgmPxToTime(e.clientX);
        if (bgmSel && t >= bgmSel.start - 0.1 && t <= bgmSel.end + 0.1) {
          bgmDragging = { mode: 'move', startT: t, origSel: { ...bgmSel }, newStart: bgmSel.start };
          bgmCanvas.style.cursor = 'grabbing';
        } else {
          bgmSel = null;
          bgmDragging = { mode: 'select', anchorT: t };
          updateBgmSelUI();
        }
      });
    }

    window.addEventListener('mousemove', e => {
      if (!bgmDragging || !bgmBuffer) return;
      const t = bgmPxToTime(e.clientX);
      if (bgmDragging.mode === 'select') {
        const a = bgmDragging.anchorT;
        bgmSel = { start: Math.min(a, t), end: Math.max(a, t) };
        updateBgmSelUI();
      } else {
        const dur = bgmDragging.origSel.end - bgmDragging.origSel.start;
        const offset = t - bgmDragging.startT;
        const raw = bgmDragging.origSel.start + offset;
        bgmDragging.newStart = Math.max(0, Math.min(bgmBuffer.duration - dur, raw));
      }
      drawBgmWaveform();
    });

    window.addEventListener('mouseup', () => {
      if (!bgmDragging) return;
      if (bgmDragging.mode === 'select') {
        if (!bgmSel || (bgmSel.end - bgmSel.start) < 0.05) bgmSel = null;
      } else if (bgmDragging.mode === 'move') {
        const origSel = bgmDragging.origSel;
        const newStart = bgmDragging.newStart;
        const dur = origSel.end - origSel.start;
        if (Math.abs(newStart - origSel.start) >= 0.05) {
          const seg = extractRegion(bgmBuffer, origSel.start, origSel.end);
          const nb = deleteRegion(bgmBuffer, origSel.start, origSel.end);
          if (nb && seg) {
            let insertAt = newStart > origSel.start ? Math.max(0, newStart - dur) : newStart;
            insertAt = Math.min(insertAt, nb.duration);
            bgmBuffer = insertAudioAt(nb, seg, insertAt);
            bgmSel = { start: insertAt, end: insertAt + dur };
          }
        }
        if (bgmCanvas) bgmCanvas.style.cursor = 'crosshair';
      }
      bgmDragging = null;
      updateBgmSelUI();
      drawBgmWaveform();
    });

    const bgmDelSelBtn = $('bgm-del-sel');
    if (bgmDelSelBtn) bgmDelSelBtn.addEventListener('click', () => {
      if (!bgmSel || !bgmBuffer) return;
      const selDur = bgmSel.end - bgmSel.start;
      const nb = deleteRegion(bgmBuffer, bgmSel.start, bgmSel.end);
      if (!nb) { setStatus('Cannot delete: would remove entire BGM audio.'); return; }
      bgmBuffer = nb;
      bgmSel = null;
      updateBgmSelUI();
      drawBgmWaveform();
      setStatus(`BGM: deleted ${fmtShort(selDur)}`);
    });

    btnAddBgm.addEventListener('click', () => {
      bgmInputEl.click();
    });
    const bgmReplaceBtn = $('bgm-replace');
    if (bgmReplaceBtn) bgmReplaceBtn.addEventListener('click', () => bgmInputEl.click());
    // Initial load / replace — clears segments
    bgmInputEl.addEventListener('change', async () => {
      const file = bgmInputEl.files[0];
      if (!file) return;
      bgmInputEl.value = '';
      try {
        const arrayBuf = await file.arrayBuffer();
        bgmBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf);
        bgmSel = null; bgmDragging = null;
        bgmSegments = [{ start: 0, end: bgmBuffer.duration, color: bgmWaveColor() }];
        bgmNameEl.textContent = file.name;
        bgmSection.style.display = '';
        if (typeof updateRangeFill === 'function') updateRangeFill(bgmVolumeSlider);
        drawBgmWaveform();
        setStatus(`BGM loaded: ${file.name} (${fmtShort(bgmBuffer.duration)})`);
      } catch(e) { setStatus('BGM error: ' + e.message); }
    });
    // Append — adds new clip at end with next color
    const bgmAppendBtn = $('bgm-append');
    const bgmAppendInput = $('bgm-append-input');
    if (bgmAppendBtn) bgmAppendBtn.addEventListener('click', () => bgmAppendInput && bgmAppendInput.click());
    if (bgmAppendInput) bgmAppendInput.addEventListener('change', async () => {
      const file = bgmAppendInput.files[0];
      if (!file) return;
      bgmAppendInput.value = '';
      try {
        const arrayBuf = await file.arrayBuffer();
        const newBuf = await ensureAudioCtx().decodeAudioData(arrayBuf);
        const prevDur = bgmBuffer ? bgmBuffer.duration : 0;
        bgmBuffer = bgmBuffer ? insertAudioAt(bgmBuffer, newBuf, bgmBuffer.duration) : newBuf;
        bgmSel = null; bgmDragging = null;
        const color = BGM_SEG_COLORS[bgmSegments.length % BGM_SEG_COLORS.length];
        bgmSegments.push({ start: prevDur, end: bgmBuffer.duration, color });
        bgmNameEl.textContent = `${bgmSegments.length} clips`;
        bgmSection.style.display = '';
        if (typeof updateRangeFill === 'function') updateRangeFill(bgmVolumeSlider);
        drawBgmWaveform();
        setStatus(`BGM appended: ${file.name} (${fmtShort(newBuf.duration)})`);
      } catch(e) { setStatus('BGM append error: ' + e.message); }
    });

    bgmVolumeSlider.addEventListener('input', () => {
      bgmVolume = bgmVolumeSlider.value / 100;
      bgmVolumeLabel.textContent = bgmVolumeSlider.value + '%';
      if (typeof updateRangeFill === 'function') updateRangeFill(bgmVolumeSlider);
      if (bgmGainNode) bgmGainNode.gain.value = bgmVolume;
    });

    bgmLoopCheckbox.addEventListener('change', () => {
      bgmLoop = bgmLoopCheckbox.checked;
      if (bgmSource) bgmSource.loop = bgmLoop;
      drawBgmWaveform();
    });

    bgmRemoveBtn.addEventListener('click', () => {
      bgmBuffer = null; bgmSel = null; bgmDragging = null; bgmSegments = [];
      bgmSection.style.display = 'none';
      bgmNameEl.textContent = 'No file';
      const canvas = $('bgm-waveform-canvas');
      if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
      setStatus('BGM removed');
    });

    // ── PiP Speaker Video ──
    const pipInputEl = $('pip-input');
    const pipSectionEl = $('pip-section');
    const pipNameEl = $('pip-name');
    const pipRemoveBtn = $('pip-remove');
    const pipSettingsBtn = $('pip-settings-btn');
    const pipPropsEl = $('pip-props');
    const btnAddPip = $('btn-add-pip');

    btnAddPip.addEventListener('click', () => {
      pipInputEl.click();
    });
    pipInputEl.addEventListener('change', async () => {
      const file = pipInputEl.files[0];
      if (!file) return;
      pipInputEl.value = '';
      try {
        const videoEl = document.createElement('video');
        videoEl.muted = true; videoEl.preload = 'auto'; videoEl.playsInline = true;
        const blobUrl = URL.createObjectURL(file);
        videoEl.src = blobUrl;
        await new Promise((resolve, reject) => {
          videoEl.onloadedmetadata = resolve;
          videoEl.onerror = () => reject(new Error('Cannot load video'));
        });
        const dur = currentBuffer ? currentBuffer.duration : videoEl.duration;
        // Find next available time slot
        let inPoint = 0;
        if (pipItems.length > 0) {
          const lastEnd = Math.max(...pipItems.map(p => p.outPoint || dur));
          inPoint = lastEnd < dur ? lastEnd : 0;
        }
        pipItems.push({
          id: nextPipId++,
          videoEl, videoSrc: blobUrl,
          videoDuration: videoEl.duration,
          inPoint, outPoint: dur,
          position: pipPosition, customX: null, customY: null,
          size: pipSize, shape: pipShape,
          border: pipBorder, borderColor: pipBorderColor,
          shadow: pipShadow,
          name: file.name,
        });
        renderPipList();
        pipSectionEl.style.display = '';
        setStatus(`PiP added: ${file.name} (${pipItems.length} total)`);
      } catch(e) { setStatus('PiP error: ' + e.message); }
    });

    let selectedPipId = null;

    // Render list of PiP items in the pip-section bar
    function renderPipList() {
      pipNameEl.innerHTML = '';
      if (pipItems.length === 0) {
        pipNameEl.textContent = 'No video';
        pipSectionEl.style.display = 'none';
        pipPropsEl.classList.remove('visible');
        return;
      }
      pipSectionEl.style.display = '';
      for (const pip of pipItems) {
        const tag = document.createElement('span');
        tag.style.cssText = 'display:inline-flex; align-items:center; gap:4px; padding:2px 8px; background:var(--bg-input); border:1px solid var(--border); border-radius:4px; font-size:0.68rem; margin-right:4px; cursor:pointer;';
        if (selectedPipId === pip.id) tag.style.borderColor = 'var(--accent)';
        tag.innerHTML = `${sanitize(pip.name || 'PiP')} <span style="color:var(--text-muted);">${fmtShort(pip.inPoint)}-${fmtShort(pip.outPoint)}</span> <button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:0.7rem;padding:0 2px;" data-pip-del="${pip.id}">✕</button>`;
        tag.addEventListener('click', (e) => {
          if (e.target.dataset.pipDel) {
            const removingPip = pipItems.find(p => p.id === pip.id);
            if (removingPip && removingPip.videoSrc && removingPip.videoSrc.startsWith('blob:')) URL.revokeObjectURL(removingPip.videoSrc);
            pipItems = pipItems.filter(p => p.id !== pip.id);
            if (selectedPipId === pip.id) { selectedPipId = null; pipPropsEl.classList.remove('visible'); }
            renderPipList();
            return;
          }
          selectedPipId = pip.id;
          showPipProps(pip);
          renderPipList();
        });
        pipNameEl.appendChild(tag);
      }
    }

    pipRemoveBtn.addEventListener('click', () => {
      pipItems = []; selectedPipId = null;
      pipSectionEl.style.display = 'none';
      pipPropsEl.classList.remove('visible');
      setStatus('All PiP removed');
    });

    function showPipProps(pip) {
      pipPropsEl.classList.add('visible');
      $('pip-size-input').value = pip.size || pipSize;
      $('pip-shape-select').value = pip.shape || pipShape;
      $('pip-border-input').value = pip.border ?? pipBorder;
      $('pip-border-color-input').value = pip.borderColor || pipBorderColor;
      $('pip-shadow-input').checked = pip.shadow ?? pipShadow;
      $('pip-in-input').value = pip.inPoint || 0;
      $('pip-out-input').value = pip.outPoint || 0;
      $('pip-x').value = pip.customX ?? '';
      $('pip-y').value = pip.customY ?? '';
      $('pip-position-grid').querySelectorAll('button').forEach(b =>
        b.classList.toggle('active', b.dataset.pos === (pip.position || pipPosition))
      );
    }

    function getSelectedPip() { return pipItems.find(p => p.id === selectedPipId); }

    pipSettingsBtn.addEventListener('click', () => {
      if (pipItems.length === 0) return;
      const pip = getSelectedPip() || pipItems[0];
      selectedPipId = pip.id;
      showPipProps(pip);
      renderPipList();
    });

    $('pip-props-close').addEventListener('click', () => { pipPropsEl.classList.remove('visible'); selectedPipId = null; renderPipList(); });

    // Position grid — applies to selected PiP
    $('pip-position-grid').addEventListener('click', (e) => {
      if (e.target.dataset.pos) {
        const pip = getSelectedPip(); if (!pip) return;
        pip.position = e.target.dataset.pos;
        pip.customX = null; pip.customY = null;
        $('pip-x').value = ''; $('pip-y').value = '';
        $('pip-position-grid').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.pos === pip.position));
      }
    });

    $('pip-x').addEventListener('change', () => { const pip = getSelectedPip(); if (pip) { const v = $('pip-x').value; pip.customX = v !== '' ? parseInt(v) : null; if (pip.customX !== null && pip.customY === null) pip.customY = 0; } });
    $('pip-y').addEventListener('change', () => { const pip = getSelectedPip(); if (pip) { const v = $('pip-y').value; pip.customY = v !== '' ? parseInt(v) : null; if (pip.customY !== null && pip.customX === null) pip.customX = 0; } });
    $('pip-size-input').addEventListener('change', () => { const pip = getSelectedPip(); if (pip) pip.size = Math.max(10, Math.min(50, parseInt($('pip-size-input').value) || 25)); });
    $('pip-shape-select').addEventListener('change', () => { const pip = getSelectedPip(); if (pip) pip.shape = $('pip-shape-select').value; });
    $('pip-border-input').addEventListener('change', () => { const pip = getSelectedPip(); if (pip) pip.border = Math.max(0, Math.min(10, parseInt($('pip-border-input').value) || 3)); });
    $('pip-border-color-input').addEventListener('input', () => { const pip = getSelectedPip(); if (pip) pip.borderColor = $('pip-border-color-input').value; });
    $('pip-shadow-input').addEventListener('change', () => { const pip = getSelectedPip(); if (pip) pip.shadow = $('pip-shadow-input').checked; });
    $('pip-in-input').addEventListener('change', () => { const pip = getSelectedPip(); if (pip) { pip.inPoint = Math.max(0, parseFloat($('pip-in-input').value) || 0); renderPipList(); } });
    $('pip-out-input').addEventListener('change', () => { const pip = getSelectedPip(); if (pip) { pip.outPoint = Math.max(0, parseFloat($('pip-out-input').value) || 0); renderPipList(); } });

    // ── Frame ──
    const frameInput = $('frame-input');
    const btnAddFrame = $('btn-add-frame');
    const frameSec = $('frame-section');

    btnAddFrame.addEventListener('click', () => frameInput.click());
    frameInput.addEventListener('change', () => {
      const file = frameInput.files[0];
      if (!file) return;
      frameInput.value = '';
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          frameImgEl = img;
          frameImgSrc = e.target.result;
          if (frameSec) frameSec.style.display = '';
          const thumb = $('frame-thumb');
          if (thumb) { thumb.src = frameImgSrc; thumb.style.display = ''; }
          setStatus('Frame added');
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });

    const frameRemove = $('frame-remove');
    if (frameRemove) frameRemove.addEventListener('click', () => {
      frameImgEl = null; frameImgSrc = '';
      if (frameSec) frameSec.style.display = 'none';
      setStatus('Frame removed');
    });

    ['top', 'bottom', 'left', 'right'].forEach(side => {
      const el = $(`frame-pad-${side}`);
      if (el) el.addEventListener('change', () => {
        framePadding[side] = Math.max(0, parseInt(el.value) || 0);
       
      });
    });

    const frameOpacityEl = $('frame-opacity');
    const frameOpacityLabel = $('frame-opacity-label');
    if (frameOpacityEl) frameOpacityEl.addEventListener('input', () => {
      frameOpacity = frameOpacityEl.value / 100;
      if (frameOpacityLabel) frameOpacityLabel.textContent = frameOpacityEl.value + '%';
     
    });

    // ── Logo ──
    const logoInput = $('logo-input');
    const btnAddLogo = $('btn-add-logo');
    const logoSec = $('logo-section');

    btnAddLogo.addEventListener('click', () => logoInput.click());
    logoInput.addEventListener('change', () => {
      const file = logoInput.files[0];
      if (!file) return;
      logoInput.value = '';
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          logoImgEl = img;
          logoImgSrc = e.target.result;
          if (logoSec) logoSec.style.display = '';
          const thumb = $('logo-thumb');
          if (thumb) { thumb.src = logoImgSrc; thumb.style.display = ''; }
          setStatus('Logo added');
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });

    const logoRemove = $('logo-remove');
    if (logoRemove) logoRemove.addEventListener('click', () => {
      logoImgEl = null; logoImgSrc = '';
      if (logoSec) logoSec.style.display = 'none';
      setStatus('Logo removed');
    });

    const logoPositionEl = $('logo-position');
    if (logoPositionEl) logoPositionEl.addEventListener('change', () => { logoPosition = logoPositionEl.value; });

    const logoSizeEl = $('logo-size');
    const logoSizeLabel = $('logo-size-label');
    if (logoSizeEl) logoSizeEl.addEventListener('input', () => {
      logoSize = parseInt(logoSizeEl.value);
      if (logoSizeLabel) logoSizeLabel.textContent = logoSize + '%';
     
    });

    const logoOpacityEl = $('logo-opacity');
    const logoOpacityLabel = $('logo-opacity-label');
    if (logoOpacityEl) logoOpacityEl.addEventListener('input', () => {
      logoOpacity = logoOpacityEl.value / 100;
      if (logoOpacityLabel) logoOpacityLabel.textContent = logoOpacityEl.value + '%';
     
    });

    // ── Library slot handlers ──
    // Click slot to apply, right-click to remove from library
    document.querySelectorAll('.library-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        const src = slot.dataset.src;
        if (!src) return;
        const type = slot.dataset.type;
        const img = new Image();
        img.onload = () => {
          if (type === 'logo') {
            logoImgEl = img; logoImgSrc = src;
            if (logoSec) logoSec.style.display = '';
            const thumb = $('logo-thumb'); if (thumb) { thumb.src = src; thumb.style.display = ''; }
            setStatus('Logo applied from library');
          } else {
            frameImgEl = img; frameImgSrc = src;
            if (frameSec) frameSec.style.display = '';
            const thumb = $('frame-thumb'); if (thumb) { thumb.src = src; thumb.style.display = ''; }
            setStatus('Frame applied from library');
          }
         
        };
        img.src = src;
      });

      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const type = slot.dataset.type;
        const slotIdx = parseInt(slot.dataset.slot);
        if (!slot.dataset.src) return;
        removeFromLibrary(type, slotIdx);
        slot.innerHTML = '<span style="font-size:0.6rem;color:var(--text-muted);">Empty</span>';
        slot.dataset.src = '';
        setStatus(`${type === 'logo' ? 'Logo' : 'Frame'} removed from library slot ${slotIdx + 1}`);
      });
    });

    // Save to library buttons
    const frameSaveLib = $('frame-save-lib');
    if (frameSaveLib) frameSaveLib.addEventListener('click', () => saveCurrentToNextSlot('frame'));
    const logoSaveLib = $('logo-save-lib');
    if (logoSaveLib) logoSaveLib.addEventListener('click', () => saveCurrentToNextSlot('logo'));
