    // ── Playhead sync (all timelines) ──
    const textPlayheadLine = $('text-playhead-line');
    const subPlayheadLine = $('sub-playhead-line');
    function updatePlayhead() {
      if (!wavesurfer || !wavesurfer.isPlaying()) {
        playheadLine.style.display = 'none';
        textPlayheadLine.style.display = 'none';
        if (subPlayheadLine) subPlayheadLine.style.display = 'none';
        return;
      }
      const px = secToPx(wavesurfer.getCurrentTime()) + 'px';
      playheadLine.style.left = px;
      playheadLine.style.display = 'block';
      textPlayheadLine.style.left = px;
      textPlayheadLine.style.display = 'block';
      if (subPlayheadLine) { subPlayheadLine.style.left = px; subPlayheadLine.style.display = 'block'; }
      requestAnimationFrame(updatePlayhead);
    }
