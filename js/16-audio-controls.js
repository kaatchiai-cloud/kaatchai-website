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
        pipVideoEl = videoEl;
        pipVideoSrc = blobUrl;
        pipVideoDuration = videoEl.duration;
        pipEnabled = true;
        pipInPoint = 0;
        pipOutPoint = currentBuffer ? currentBuffer.duration : pipVideoDuration;
        pipNameEl.textContent = `${file.name} (${fmtShort(pipVideoDuration)})`;
        pipSectionEl.style.display = '';
        setStatus(`PiP loaded: ${file.name}`);
      } catch(e) { setStatus('PiP error: ' + e.message); }
    });

    pipRemoveBtn.addEventListener('click', () => {
      pipVideoEl = null; pipVideoSrc = null; pipVideoDuration = 0;
      pipEnabled = false; pipCustomX = null; pipCustomY = null;
      pipSectionEl.style.display = 'none';
      pipPropsEl.classList.remove('visible');
      setStatus('PiP removed');
    });

    pipSettingsBtn.addEventListener('click', () => {
      pipPropsEl.classList.toggle('visible');
      if (pipPropsEl.classList.contains('visible')) {
        // Sync UI with current state
        $('pip-size-input').value = pipSize;
        $('pip-shape-select').value = pipShape;
        $('pip-border-input').value = pipBorder;
        $('pip-border-color-input').value = pipBorderColor;
        $('pip-shadow-input').checked = pipShadow;
        $('pip-in-input').value = pipInPoint;
        $('pip-out-input').value = pipOutPoint;
        $('pip-x').value = pipCustomX ?? '';
        $('pip-y').value = pipCustomY ?? '';
        // Update position grid
        $('pip-position-grid').querySelectorAll('button').forEach(b =>
          b.classList.toggle('active', b.dataset.pos === pipPosition)
        );
      }
    });

    $('pip-props-close').addEventListener('click', () => pipPropsEl.classList.remove('visible'));

    // Position grid
    $('pip-position-grid').addEventListener('click', (e) => {
      if (e.target.dataset.pos) {
        pipPosition = e.target.dataset.pos;
        pipCustomX = null; pipCustomY = null;
        $('pip-x').value = ''; $('pip-y').value = '';
        $('pip-position-grid').querySelectorAll('button').forEach(b =>
          b.classList.toggle('active', b.dataset.pos === pipPosition)
        );
      }
    });

    // Custom x/y
    $('pip-x').addEventListener('change', () => {
      const v = $('pip-x').value;
      pipCustomX = v !== '' ? parseInt(v) : null;
      if (pipCustomX !== null && pipCustomY === null) pipCustomY = 0;
    });
    $('pip-y').addEventListener('change', () => {
      const v = $('pip-y').value;
      pipCustomY = v !== '' ? parseInt(v) : null;
      if (pipCustomY !== null && pipCustomX === null) pipCustomX = 0;
    });

    // Other props
    $('pip-size-input').addEventListener('change', () => { pipSize = Math.max(10, Math.min(50, parseInt($('pip-size-input').value) || 25)); });
    $('pip-shape-select').addEventListener('change', () => { pipShape = $('pip-shape-select').value; });
    $('pip-border-input').addEventListener('change', () => { pipBorder = Math.max(0, Math.min(10, parseInt($('pip-border-input').value) || 3)); });
    $('pip-border-color-input').addEventListener('input', () => { pipBorderColor = $('pip-border-color-input').value; });
    $('pip-shadow-input').addEventListener('change', () => { pipShadow = $('pip-shadow-input').checked; });
    $('pip-in-input').addEventListener('change', () => { pipInPoint = Math.max(0, parseFloat($('pip-in-input').value) || 0); });
    $('pip-out-input').addEventListener('change', () => { pipOutPoint = Math.max(0, parseFloat($('pip-out-input').value) || 0); });
