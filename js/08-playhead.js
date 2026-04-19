    // ── Playhead sync (all timelines) ──
    const textPlayheadLine = $('text-playhead-line');
    const subPlayheadLine = $('sub-playhead-line');
    const videoPlayheadLine = $('video-playhead-line');
    const bgmPlayheadLine = $('bgm-playhead-line');
    function updatePlayhead() {
      if (!wavesurfer || !wavesurfer.getDuration()) {
        playheadLine.style.display = 'none';
        textPlayheadLine.style.display = 'none';
        if (videoPlayheadLine) videoPlayheadLine.style.display = 'none';
        if (subPlayheadLine) subPlayheadLine.style.display = 'none';
        if (bgmPlayheadLine) bgmPlayheadLine.style.display = 'none';
        return;
      }
      const px = secToPx(wavesurfer.getCurrentTime()) + 'px';
      playheadLine.style.left = px;
      playheadLine.style.display = 'block';
      textPlayheadLine.style.left = px;
      textPlayheadLine.style.display = 'block';
      if (videoPlayheadLine) { videoPlayheadLine.style.left = px; videoPlayheadLine.style.display = 'block'; }
      if (subPlayheadLine) { subPlayheadLine.style.left = px; subPlayheadLine.style.display = 'block'; }
      if (bgmPlayheadLine && bgmBuffer) { bgmPlayheadLine.style.left = px; bgmPlayheadLine.style.display = 'block'; }
      if (wavesurfer.isPlaying()) requestAnimationFrame(updatePlayhead);
    }
