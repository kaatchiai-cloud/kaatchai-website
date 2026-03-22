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
