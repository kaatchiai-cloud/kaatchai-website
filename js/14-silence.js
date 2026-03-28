// ══════════════════════════════════════════
    //  SILENCE REMOVAL (matches FFmpeg silenceremove filter)
    // ══════════════════════════════════════════
    const btnSilence = $('btn-silence'), silencePanel = $('silence-panel');
    const silThreshold = $('sil-threshold'), silThresholdVal = $('sil-threshold-val');
    const silMinDur = $('sil-min-dur'), silDetection = $('sil-detection');
    const btnSilDetect = $('btn-sil-detect'), btnSilApply = $('btn-sil-apply');
    const btnSilClose = $('btn-sil-close');
    const silVisual = $('silence-visual'), silInfo = $('silence-info');
    let detectedSilentRegions = [];

    btnSilence.addEventListener('click', () => {
      silencePanel.classList.toggle('visible');
      if (silencePanel.classList.contains('visible')) {
        detectedSilentRegions = [];
        btnSilApply.disabled = true;
        silVisual.classList.remove('visible');
        silInfo.classList.remove('visible');
      }
    });
    btnSilClose.addEventListener('click', () => {
      silencePanel.classList.remove('visible');
    });
    silThreshold.addEventListener('input', () => {
      silThresholdVal.textContent = silThreshold.value + ' dB';
    });

    // Detect silent regions using peak or RMS detection
    function detectSilence(buffer, thresholdDb, minDurationSec, mode) {
      const threshold = Math.pow(10, thresholdDb / 20); // dB to linear
      const sr = buffer.sampleRate;
      const numCh = buffer.numberOfChannels;
      const totalSamples = buffer.length;
      const minSilenceSamples = Math.round(minDurationSec * sr);

      // Get peak amplitude across all channels for each sample
      // Process in chunks for RMS (window size ~10ms)
      const rmsWindowSize = mode === 'rms' ? Math.round(sr * 0.01) : 1;
      const silentRegions = [];
      let silenceStart = -1;

      for (let i = 0; i < totalSamples; i += rmsWindowSize) {
        const end = Math.min(i + rmsWindowSize, totalSamples);
        let level = 0;

        if (mode === 'peak') {
          // Peak detection: max absolute sample across all channels in window
          for (let ch = 0; ch < numCh; ch++) {
            const data = buffer.getChannelData(ch);
            for (let j = i; j < end; j++) {
              const abs = Math.abs(data[j]);
              if (abs > level) level = abs;
            }
          }
        } else {
          // RMS detection: root mean square across all channels in window
          let sumSq = 0;
          let count = 0;
          for (let ch = 0; ch < numCh; ch++) {
            const data = buffer.getChannelData(ch);
            for (let j = i; j < end; j++) {
              sumSq += data[j] * data[j];
              count++;
            }
          }
          level = Math.sqrt(sumSq / count);
        }

        const isSilent = level < threshold;

        if (isSilent && silenceStart === -1) {
          silenceStart = i;
        } else if (!isSilent && silenceStart !== -1) {
          const silenceDuration = i - silenceStart;
          if (silenceDuration >= minSilenceSamples) {
            silentRegions.push({
              startSample: silenceStart,
              endSample: i,
              startTime: silenceStart / sr,
              endTime: i / sr,
              duration: silenceDuration / sr,
            });
          }
          silenceStart = -1;
        }
      }
      // Handle trailing silence
      if (silenceStart !== -1) {
        const silenceDuration = totalSamples - silenceStart;
        if (silenceDuration >= minSilenceSamples) {
          silentRegions.push({
            startSample: silenceStart,
            endSample: totalSamples,
            startTime: silenceStart / sr,
            endTime: totalSamples / sr,
            duration: silenceDuration / sr,
          });
        }
      }

      return silentRegions;
    }

    // Remove detected silent regions from buffer
    function removeSilentRegions(buffer, regions) {
      if (regions.length === 0) return buffer;
      const sr = buffer.sampleRate;
      const numCh = buffer.numberOfChannels;

      // Calculate new length
      let removedSamples = 0;
      for (const r of regions) removedSamples += (r.endSample - r.startSample);
      const newLength = buffer.length - removedSamples;
      if (newLength <= 0) return null;

      const out = ensureAudioCtx().createBuffer(numCh, newLength, sr);

      for (let ch = 0; ch < numCh; ch++) {
        const src = buffer.getChannelData(ch);
        const dst = out.getChannelData(ch);
        let writeIdx = 0;
        let readIdx = 0;

        for (const r of regions) {
          // Copy audio before this silent region
          while (readIdx < r.startSample) {
            dst[writeIdx++] = src[readIdx++];
          }
          // Skip the silent region
          readIdx = r.endSample;
        }
        // Copy remaining audio after last silent region
        while (readIdx < buffer.length) {
          dst[writeIdx++] = src[readIdx++];
        }
      }

      return out;
    }

    // Visualize detected regions
    function renderSilenceVisual(regions) {
      silVisual.innerHTML = '';
      if (!currentBuffer || regions.length === 0) {
        silVisual.classList.remove('visible');
        return;
      }
      silVisual.classList.add('visible');
      const dur = currentBuffer.duration;
      const w = silVisual.clientWidth || 900;

      for (const r of regions) {
        const el = document.createElement('div');
        el.className = 'silent-region';
        el.style.left = ((r.startTime / dur) * 100) + '%';
        el.style.width = ((r.duration / dur) * 100) + '%';
        el.title = `${r.startTime.toFixed(2)}s – ${r.endTime.toFixed(2)}s (${r.duration.toFixed(2)}s)`;
        silVisual.appendChild(el);
      }
    }

    btnSilDetect.addEventListener('click', () => {
      if (!currentBuffer) { setStatus('Load audio first'); return; }
      const threshDb = parseFloat(silThreshold.value);
      const minDur = parseFloat(silMinDur.value);
      const mode = silDetection.value;

      setStatus('Detecting silent regions...');
      // Use setTimeout to allow UI to update
      setTimeout(() => {
        detectedSilentRegions = detectSilence(currentBuffer, threshDb, minDur, mode);

        let totalSilence = 0;
        for (const r of detectedSilentRegions) totalSilence += r.duration;

        renderSilenceVisual(detectedSilentRegions);

        silInfo.classList.add('visible');
        if (detectedSilentRegions.length === 0) {
          silInfo.innerHTML = 'No silent regions found matching the criteria. Try lowering the threshold or reducing the minimum duration.';
          btnSilApply.disabled = true;
        } else {
          silInfo.innerHTML = `Found <span class="removed">${detectedSilentRegions.length} silent region${detectedSilentRegions.length > 1 ? 's' : ''}</span> totalling <span class="removed">${totalSilence.toFixed(1)}s</span>. ` +
            `Audio will go from <span class="removed">${fmt(currentBuffer.duration)}</span> → <span class="kept">${fmt(currentBuffer.duration - totalSilence)}</span> ` +
            `(removing ${((totalSilence / currentBuffer.duration) * 100).toFixed(1)}%)`;
          btnSilApply.disabled = false;
        }

        setStatus(`Detected ${detectedSilentRegions.length} silent regions (${totalSilence.toFixed(1)}s total)`);
      }, 50);
    });

    btnSilApply.addEventListener('click', async () => {
      if (!currentBuffer || detectedSilentRegions.length === 0) return;

      pushUndo();
      const origDur = currentBuffer.duration;
      const result = removeSilentRegions(currentBuffer, detectedSilentRegions);
      if (!result) { setStatus('Cannot remove all audio'); return; }

      currentBuffer = result;
      const removed = origDur - currentBuffer.duration;
      setStatus(`Removed ${detectedSilentRegions.length} silent regions (${removed.toFixed(1)}s). New duration: ${fmt(currentBuffer.duration)}`);

      detectedSilentRegions = [];
      btnSilApply.disabled = true;
      silVisual.classList.remove('visible');
      silInfo.classList.remove('visible');
      silencePanel.classList.remove('visible');

      await refreshWaveform();
    });
