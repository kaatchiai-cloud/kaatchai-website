// ── WaveSurfer ──
    function initWaveSurfer() {
      if (wavesurfer) wavesurfer.destroy();
      regions = WaveSurfer.Regions.create();
      wavesurfer = WaveSurfer.create({
        container: '#waveform', waveColor: '#6c63ff', progressColor: '#4a42cc',
        cursorColor: '#ff6b6b', cursorWidth: 2, height: 100, barWidth: 2, barGap: 1, barRadius: 2,
        autoScroll: false, autoCenter: false,
        plugins: [regions],
      });
      wavesurfer.on('timeupdate', t => currentTimeEl.textContent = fmt(t));
      wavesurfer.on('decode', () => durationEl.textContent = fmt(wavesurfer.getDuration()));
      wavesurfer.on('play', () => { btnPlay.innerHTML = '&#10074;&#10074; Pause'; updatePlayhead(); });
      wavesurfer.on('pause', () => { btnPlay.innerHTML = '&#9654; Play'; updatePlayhead(); });
      wavesurfer.on('seek', () => updatePlayhead());
      wavesurfer.on('ready', () => updatePlayhead());
      regions.enableDragSelection({ color: 'rgba(108,99,255,0.25)' });
      regions.on('region-created', r => { regions.getRegions().forEach(x => { if (x.id !== r.id) x.remove(); }); activeRegion = r; updateRB(); });
      regions.on('region-updated', () => updateRB());
      regions.on('region-removed', () => { activeRegion = null; updateRB(); });
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
