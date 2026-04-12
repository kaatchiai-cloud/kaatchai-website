    // ── Export as video (MP4 or WebM via MediaRecorder) ──
    const exportSettingsPanel = $('export-settings');
    const exportQualitySel = $('export-quality');
    const exportFpsSel = $('export-fps');
    const exportFormatSel = $('export-format');
    const exportCancelBtn = $('export-cancel');
    const exportStartBtn = $('export-start');

    // Quality → bitrate multipliers
    const QUALITY_PRESETS = {
      fast:     { label: 'Fast',     bitrateMultiplier: 0.5 },
      balanced: { label: 'Balanced', bitrateMultiplier: 1.0 },
      high:     { label: 'High',     bitrateMultiplier: 1.8 },
    };

    // Base bitrate by resolution height
    function baseBitrate(h) {
      if (h <= 480) return 1_500_000;
      if (h <= 720) return 4_000_000;
      return 8_000_000;
    }

    // Auto-detect MP4 support and add it to format dropdown if available (Safari/iOS)
    (function detectFormats() {
      const canMp4 = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')
                  || MediaRecorder.isTypeSupported('video/mp4');
      if (canMp4) {
        const opt = document.createElement('option');
        opt.value = 'mp4'; opt.textContent = 'MP4 (H.264)';
        exportFormatSel.insertBefore(opt, exportFormatSel.firstChild);
        exportFormatSel.value = 'mp4'; // default to MP4 when available
      }
    })();

    // Resolve mime type for chosen format
    function resolveMime(format) {
      if (format === 'mp4') {
        if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) return { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' };
        if (MediaRecorder.isTypeSupported('video/mp4')) return { mime: 'video/mp4', ext: 'mp4' };
        return null;
      }
      // webm
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) return { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' };
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) return { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' };
      return { mime: 'video/webm', ext: 'webm' };
    }

    // Show export settings panel
    btnExportVideo.addEventListener('click', () => {
      console.log('[Export] clicked. buffer:', !!currentBuffer, 'photos:', photoItems.length, 'texts:', textItems.length, 'videos:', videoTimelineItems.length);
      if (!currentBuffer || (photoItems.length === 0 && textItems.length === 0 && videoTimelineItems.length === 0)) {
        console.log('[Export] blocked — no content');
        setStatus('Add at least one photo, video, or text to export'); return;
      }
      exportSettingsPanel.classList.remove('hidden');
      const isVisible = getComputedStyle(exportSettingsPanel).display !== 'none';
      exportSettingsPanel.style.display = isVisible ? 'none' : '';
      if (!isVisible) exportSettingsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Show/hide Export All Languages button
      const eab = $('export-all-langs');
      if (eab) eab.style.display = (editorLanguageTracks && editorLanguageTracks.length > 0) ? '' : 'none';
    });

    exportCancelBtn.addEventListener('click', () => {
      exportSettingsPanel.style.display = 'none';
    });

    exportStartBtn.addEventListener('click', async () => {
      exportSettingsPanel.style.display = 'none';

      let quality = exportQualitySel.value;
      const fps = parseInt(exportFpsSel.value);
      let format = exportFormatSel.value;
      const resolved = resolveMime(format);
      if (!resolved) {
        setStatus(`${format.toUpperCase()} is not supported in this browser`); return;
      }
      const { mime: mimeType, ext: fileExt } = resolved;

      setStatus('Exporting video...'); exportProgress.classList.add('visible'); exportBar.style.width = '0%';

      const { width: exportW, height: exportH } = getSelectedImageSize();
      const canvas = document.createElement('canvas');
      canvas.width = exportW; canvas.height = exportH;
      const ctx = canvas.getContext('2d');
      const sorted = [...photoItems].sort((a, b) => a.startTime - b.startTime);
      const stream = canvas.captureStream(fps);

      const videoBitrate = Math.round(baseBitrate(exportH) * QUALITY_PRESETS[quality].bitrateMultiplier);
      console.log(`[export] ${fileExt} | ${exportW}×${exportH} | ${fps}fps | ${quality} | ${(videoBitrate/1e6).toFixed(1)}Mbps`);

      try {
        exportLabel.textContent = 'Recording frames...';
        const audioDest = ensureAudioCtx().createMediaStreamDestination();
        const audioSource = ensureAudioCtx().createBufferSource();
        audioSource.buffer = currentBuffer;
        audioSource.connect(audioDest);
        // Mix BGM into export if loaded
        let exportBgmSource = null;
        if (bgmBuffer) {
          exportBgmSource = ensureAudioCtx().createBufferSource();
          exportBgmSource.buffer = bgmBuffer;
          exportBgmSource.loop = bgmLoop;
          const exportBgmGain = ensureAudioCtx().createGain();
          exportBgmGain.gain.value = bgmVolume;
          exportBgmSource.connect(exportBgmGain);
          exportBgmGain.connect(audioDest);
        }
        const combinedStream = new MediaStream([...stream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]);
        const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: videoBitrate });
        const chunks = [];
        recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        const done = new Promise(r => { recorder.onstop = r; });

        const sortedTexts = [...textItems].sort((a, b) => a.startTime - b.startTime);
        const sortedSubs = [...subtitleItems].sort((a, b) => a.startTime - b.startTime);

        // Use a Web Worker timer so frames keep rendering even when tab is in background.
        const timerWorker = new Worker(URL.createObjectURL(new Blob([
          `let id; self.onmessage = e => { if (e.data==="start") id=setInterval(()=>self.postMessage("t"),${1000/fps}); else clearInterval(id); };`
        ], { type: 'text/javascript' })));

        recorder.start(100); audioSource.start();
        if (exportBgmSource) exportBgmSource.start();
        const t0 = performance.now();
        let stopped = false;

        timerWorker.onmessage = () => {
          if (stopped) return;
          const elapsed = (performance.now() - t0) / 1000;
          const progress = Math.min(elapsed / currentBuffer.duration, 1);
          exportBar.style.width = (progress * 100).toFixed(1) + '%';
          // Estimate remaining time
          let etaStr = '';
          if (progress > 0.02 && elapsed > 1) {
            const totalEst = elapsed / progress;
            const remaining = Math.max(0, totalEst - elapsed);
            if (remaining >= 60) etaStr = ` · ~${Math.ceil(remaining / 60)}m left`;
            else etaStr = ` · ~${Math.ceil(remaining)}s left`;
          }
          exportLabel.textContent = `Recording... ${(progress * 100).toFixed(0)}%${etaStr}`;
          const fr = applyFrame(ctx, exportW, exportH);
          if (fr.applied) { ctx.save(); ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip(); ctx.translate(fr.x, fr.y); }
          const ew = fr.applied ? fr.w : exportW, eh = fr.applied ? fr.h : exportH;
          const bgM = renderBgVideoBefore(ctx, ew, eh, elapsed, sorted);
          if (bgM !== 'skip-images') renderTimelineFrame(ctx, ew, eh, elapsed, sorted);
          renderBgVideoAfter(ctx, ew, eh, elapsed, sorted, bgM);
          renderPiP(ctx, ew, eh, elapsed);
          renderTextOverlays(ctx, ew, eh, elapsed, sortedTexts);
          if (window._editorReelSubtitle && window._editorReelSubtitle.words?.length > 0) {
            const rs = window._editorReelSubtitle;
            const prevSize = reelSubSize, prevPos = reelSubPosition, prevColor = reelSubColor, prevOutline = reelSubOutline, prevBackdrop = reelSubBackdrop;
            reelSubSize = rs.subSize; reelSubPosition = rs.subPosition; reelSubColor = rs.subColor; reelSubOutline = rs.subOutline; reelSubBackdrop = rs.subBackdrop;
            renderReelSubtitle(ctx, ew, eh, elapsed, rs.words, rs.style);
            reelSubSize = prevSize; reelSubPosition = prevPos; reelSubColor = prevColor; reelSubOutline = prevOutline; reelSubBackdrop = prevBackdrop;
          } else {
            renderTextOverlays(ctx, ew, eh, elapsed, sortedSubs);
          }
          if (fr.applied) ctx.restore();
          if (typeof _renderReelExtras === 'function') _renderReelExtras(ctx, exportW, exportH, elapsed);
          renderLogo(ctx, exportW, exportH);
          if (elapsed >= currentBuffer.duration) {
            stopped = true;
            timerWorker.postMessage('stop');
            timerWorker.terminate();
            recorder.stop();
          }
        };
        timerWorker.postMessage('start');

        await done;

        const videoBlob = new Blob(chunks, { type: mimeType });
        const fileName = `slideshow.${fileExt}`;

        // Auto-download (file picker requires user gesture which expires during recording)
        const a = document.createElement('a');
        a.href = URL.createObjectURL(videoBlob); a.download = fileName; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        setStatus(`Exported ${fileName} (${(videoBlob.size / 1048576).toFixed(1)} MB) — ${exportW}×${exportH}, ${fps}fps, ${quality}`);
      } catch (e) { if (e.name !== 'AbortError') { console.error('Export error:', e); setStatus('Export failed. Try a different format or lower resolution.'); } }
      exportProgress.classList.remove('visible');
    });

    // Export All Languages — exports one video per language track
    const exportAllLangsBtn = $('export-all-langs');
    if (exportAllLangsBtn) {
      exportAllLangsBtn.addEventListener('click', async () => {
        if (!editorLanguageTracks || editorLanguageTracks.length === 0) return;
        exportSettingsPanel.style.display = 'none';

        const quality = exportQualitySel.value;
        const fps = parseInt(exportFpsSel.value);
        const format = exportFormatSel.value;
        const resolved = resolveMime(format);
        if (!resolved) { setStatus(`${format.toUpperCase()} not supported`); return; }
        const { mime: mimeType, ext: fileExt } = resolved;
        const { width: exportW, height: exportH } = getSelectedImageSize();
        const sorted = [...photoItems].sort((a, b) => a.startTime - b.startTime);
        const sortedTexts = [...textItems].sort((a, b) => a.startTime - b.startTime);
        const videoBitrate = Math.round(baseBitrate(exportH) * QUALITY_PRESETS[quality].bitrateMultiplier);

        // Build list: original + all language tracks (with scaled timings)
        const origPhotos = window._editorOriginalPhotos || sorted.map(p => ({ startTime: p.startTime, duration: p.duration }));
        const tracksToExport = [
          { label: 'original', buffer: editorOriginalBuffer, subtitles: editorOriginalSubtitles, photoTimings: origPhotos },
          ...editorLanguageTracks.map(t => ({
            label: t.langCode,
            buffer: t.audioBuffer,
            subtitles: t.subtitleTexts
              ? editorOriginalSubtitles.map((s, i) => ({
                  ...s,
                  text: t.subtitleTexts[i] || s.text,
                  startTime: t.subtitleTimings?.[i]?.startTime ?? s.startTime,
                  duration: t.subtitleTimings?.[i]?.duration ?? s.duration,
                }))
              : editorOriginalSubtitles,
            photoTimings: t.photoTimings || origPhotos,
          }))
        ];

        exportProgress.classList.add('visible');

        for (let ti = 0; ti < tracksToExport.length; ti++) {
          const track = tracksToExport[ti];
          exportLabel.textContent = `Exporting ${track.label} (${ti + 1}/${tracksToExport.length})...`;
          exportBar.style.width = '0%';

          try {
            const canvas = document.createElement('canvas');
            canvas.width = exportW; canvas.height = exportH;
            const ctx = canvas.getContext('2d');
            const stream = canvas.captureStream(fps);

            const audioDest = ensureAudioCtx().createMediaStreamDestination();
            const audioSource = ensureAudioCtx().createBufferSource();
            audioSource.buffer = track.buffer;
            audioSource.connect(audioDest);
            if (bgmBuffer) {
              const bgmSrc = ensureAudioCtx().createBufferSource();
              bgmSrc.buffer = bgmBuffer; bgmSrc.loop = bgmLoop;
              const bgmGn = ensureAudioCtx().createGain(); bgmGn.gain.value = bgmVolume;
              bgmSrc.connect(bgmGn); bgmGn.connect(audioDest);
              bgmSrc.start();
            }
            const combinedStream = new MediaStream([...stream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]);
            const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: videoBitrate });
            const chunks = [];
            recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
            const done = new Promise(r => { recorder.onstop = r; });

            const trackSortedTexts = track.subtitles ? [...track.subtitles].sort((a, b) => a.startTime - b.startTime) : sortedTexts;
            // Build photo list with per-language timings
            const trackSorted = track.photoTimings
              ? sorted.map((p, i) => ({ ...p, startTime: track.photoTimings[i]?.startTime ?? p.startTime, duration: track.photoTimings[i]?.duration ?? p.duration }))
              : sorted;

            const timerWorker = new Worker(URL.createObjectURL(new Blob([
              `let id; self.onmessage = e => { if (e.data==="start") id=setInterval(()=>self.postMessage("t"),${1000/fps}); else clearInterval(id); };`
            ], { type: 'text/javascript' })));

            recorder.start(100); audioSource.start();
            const t0 = performance.now();
            let stopped = false;

            timerWorker.onmessage = () => {
              if (stopped) return;
              const elapsed = (performance.now() - t0) / 1000;
              const progress = Math.min(elapsed / track.buffer.duration, 1);
              exportBar.style.width = (progress * 100).toFixed(1) + '%';
              exportLabel.textContent = `Exporting ${track.label} (${ti + 1}/${tracksToExport.length})... ${(progress * 100).toFixed(0)}%`;
              const frL = applyFrame(ctx, exportW, exportH);
              if (frL.applied) { ctx.save(); ctx.beginPath(); ctx.rect(frL.x, frL.y, frL.w, frL.h); ctx.clip(); ctx.translate(frL.x, frL.y); }
              const ewL = frL.applied ? frL.w : exportW, ehL = frL.applied ? frL.h : exportH;
              const bgML = renderBgVideoBefore(ctx, ewL, ehL, elapsed, trackSorted);
              if (bgML !== 'skip-images') renderTimelineFrame(ctx, ewL, ehL, elapsed, trackSorted);
              renderBgVideoAfter(ctx, ewL, ehL, elapsed, trackSorted, bgML);
              renderPiP(ctx, ewL, ehL, elapsed);
              renderTextOverlays(ctx, ewL, ehL, elapsed, trackSortedTexts);
              if (frL.applied) ctx.restore();
              if (typeof _renderReelExtras === 'function') _renderReelExtras(ctx, exportW, exportH, elapsed);
              renderLogo(ctx, exportW, exportH);
              if (elapsed >= track.buffer.duration) {
                stopped = true;
                timerWorker.postMessage('stop');
                timerWorker.terminate();
                recorder.stop();
              }
            };
            timerWorker.postMessage('start');
            await done;

            const videoBlob = new Blob(chunks, { type: mimeType });
            const fileName = `slideshow-${track.label}.${fileExt}`;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(videoBlob); a.download = fileName; a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 60000);
          } catch (e) {
            console.error(`Export ${track.label} error:`, e);
            setStatus(`Export failed for ${track.label}. Try a different format.`);
          }
        }

        setStatus(`Exported ${tracksToExport.length} videos (all languages)`);
        exportProgress.classList.remove('visible');
      });
    }

    // Action-bar Export All button — click opens settings panel then triggers the export-all-langs inside it
    const btnExportAllAction = $('btn-export-all-langs');
    if (btnExportAllAction) {
      btnExportAllAction.addEventListener('click', () => {
        // Show settings panel first so user can pick quality/format, then click Export All inside
        exportSettingsPanel.classList.remove('hidden');
        exportSettingsPanel.style.display = '';
        const eab = $('export-all-langs');
        if (eab) eab.style.display = '';
        exportSettingsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
