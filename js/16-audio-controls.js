// ── Audio state helper ──
    const audioStatusEl = $('audio-status');
    function updateAudioControls() {
      const hasAudio = !!currentBuffer;
      btnPlay.disabled = !hasAudio;
      btnStop.disabled = !hasAudio;
      audioStatusEl.textContent = hasAudio ? fmt(currentBuffer.duration) : 'No audio';
      audioStatusEl.style.background = hasAudio ? '#43a047' : '#6c63ff';
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

    btnAddBgm.addEventListener('click', () => bgmInputEl.click());
    bgmInputEl.addEventListener('change', async () => {
      const file = bgmInputEl.files[0];
      if (!file) return;
      bgmInputEl.value = '';
      try {
        const arrayBuf = await file.arrayBuffer();
        bgmBuffer = await audioCtx.decodeAudioData(arrayBuf);
        bgmNameEl.textContent = file.name;
        bgmSection.style.display = '';
        setStatus(`BGM loaded: ${file.name} (${fmtShort(bgmBuffer.duration)})`);
      } catch(e) { setStatus('BGM error: ' + e.message); }
    });

    bgmVolumeSlider.addEventListener('input', () => {
      bgmVolume = bgmVolumeSlider.value / 100;
      bgmVolumeLabel.textContent = bgmVolumeSlider.value + '%';
      if (bgmGainNode) bgmGainNode.gain.value = bgmVolume;
    });

    bgmLoopCheckbox.addEventListener('change', () => {
      bgmLoop = bgmLoopCheckbox.checked;
      if (bgmSource) bgmSource.loop = bgmLoop;
    });

    bgmRemoveBtn.addEventListener('click', () => {
      bgmBuffer = null;
      bgmSection.style.display = 'none';
      bgmNameEl.textContent = 'No file';
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

    btnAddPip.addEventListener('click', () => pipInputEl.click());
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
        tag.innerHTML = `${pip.name || 'PiP'} <span style="color:var(--text-muted);">${fmtShort(pip.inPoint)}-${fmtShort(pip.outPoint)}</span> <button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:0.7rem;padding:0 2px;" data-pip-del="${pip.id}">✕</button>`;
        tag.addEventListener('click', (e) => {
          if (e.target.dataset.pipDel) {
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
