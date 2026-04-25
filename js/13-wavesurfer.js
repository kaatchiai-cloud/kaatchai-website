// ── WaveSurfer ──
    function initWaveSurfer() {
      if (wavesurfer) wavesurfer.destroy();
      regions = WaveSurfer.Regions.create();
      wavesurfer = WaveSurfer.create({
        container: '#waveform', waveColor: '#1da8cc', progressColor: '#50d0f0',
        cursorColor: '#ff6b6b', cursorWidth: 2, height: 60, barWidth: 2, barGap: 1, barRadius: 2,
        autoScroll: false, autoCenter: false,
        plugins: [regions],
      });
      wavesurfer.on('timeupdate', t => currentTimeEl.textContent = fmt(t));
      wavesurfer.on('decode', () => durationEl.textContent = fmt(wavesurfer.getDuration()));
      wavesurfer.on('play', () => { btnPlay.innerHTML = '&#10074;&#10074; Pause'; updatePlayhead(); });
      wavesurfer.on('pause', () => { btnPlay.innerHTML = '&#9654; Play'; updatePlayhead(); });
      wavesurfer.on('seek', () => updatePlayhead());
      wavesurfer.on('ready', () => updatePlayhead());
      regions.enableDragSelection({ color: 'rgba(80,208,240,0.20)' });
      regions.on('region-created', r => { regions.getRegions().forEach(x => { if (x.id !== r.id) x.remove(); }); activeRegion = r; updateRB(); });
      regions.on('region-updated', () => updateRB());
      regions.on('region-removed', () => { activeRegion = null; updateRB(); });
      // Bug 24 — sync waveform colors to current theme at init.
      try { updateWavesurferTheme(); } catch(_) {}
    }
    // Bug 24 — re-applies wave/progress colors on theme toggle. Called from
    // applyTheme() in 01-core.js. Safe no-op if wavesurfer isn't initialized.
    function updateWavesurferTheme(mode) {
      if (!wavesurfer) return;
      var m = mode || document.documentElement.getAttribute('data-theme') || 'dark';
      var colors = (m === 'light')
        ? { waveColor: '#1a7a9a', progressColor: '#1da8cc' }
        : { waveColor: '#1da8cc', progressColor: '#50d0f0' };
      try { wavesurfer.setOptions(colors); } catch(_) {}
    }
    function updateRB() {
      const h = !!activeRegion;
      btnKeep.disabled = !h; btnDelete.disabled = !h; btnPlaySelection.disabled = !h;
      selectionInfoEl.textContent = h
        ? `Selected: ${fmt(activeRegion.start)} – ${fmt(activeRegion.end)} (${fmt(activeRegion.end - activeRegion.start)})`
        : 'Click and drag on waveform to select a region';
    }
    function pushUndo() { undoStack.push(currentBuffer); if (undoStack.length > 20) undoStack.shift(); btnUndo.disabled = false; }

    async function loadAudioBuffer(file) { return ensureAudioCtx().decodeAudioData(await file.arrayBuffer()); }

    async function loadFileIntoEditor(file) {
      showPageLoader('Decoding audio...');
      setStatus('Decoding audio...', true);
      try {
        currentBuffer = await loadAudioBuffer(file);
        undoStack = []; btnUndo.disabled = true;
        await refreshWaveform();
        navigateTo('editor');
        updateAudioControls();
        drawRuler(); renderPhotos(); renderTexts();
        setStatus(`Loaded: ${file.name} (${fmt(currentBuffer.duration)}, ${currentBuffer.numberOfChannels}ch, ${currentBuffer.sampleRate}Hz)`);
      } catch (e) { setStatus('Error: Could not decode audio. ' + e.message); }
      hidePageLoader();
    }
    async function refreshWaveform() {
      initWaveSurfer();
      const url = URL.createObjectURL(audioBufferToWavBlob(currentBuffer));
      await wavesurfer.load(url); URL.revokeObjectURL(url);
      activeRegion = null; updateRB(); drawRuler(); renderPhotos();
      syncWaveformZoom();
    }
