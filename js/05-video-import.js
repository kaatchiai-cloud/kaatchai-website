    // ── Video import ──
    function extractVideoThumbnail(videoEl) {
      return new Promise((resolve) => {
        const c = document.createElement('canvas');
        c.width = videoEl.videoWidth || 320;
        c.height = videoEl.videoHeight || 240;
        const cx = c.getContext('2d');
        cx.drawImage(videoEl, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.7));
      });
    }

    function addVideoFiles(files, dropX) {
      const dur = aDur();
      const fileArr = [...files].filter(f => f.type.startsWith('video/'));
      if (fileArr.length === 0) { setStatus('No video files found'); return; }
      fileArr.forEach((file, idx) => {
        const videoEl = document.createElement('video');
        videoEl.muted = true;
        videoEl.preload = 'auto';
        videoEl.playsInline = true;
        videoEl.crossOrigin = 'anonymous';
        const blobUrl = URL.createObjectURL(file);
        videoEl.src = blobUrl;
        setStatus(`Loading video: ${file.name}...`);

        videoEl.addEventListener('error', () => {
          setStatus('Could not load video. Try MP4 or WebM format.');
        });

        videoEl.addEventListener('loadeddata', async () => {
          // Wait for first frame to be available
          try {
            videoEl.currentTime = 0.1;
            await new Promise((resolve, reject) => {
              const onSeeked = () => { videoEl.removeEventListener('seeked', onSeeked); resolve(); };
              videoEl.addEventListener('seeked', onSeeked);
              // Fallback timeout if seeked never fires
              setTimeout(() => { videoEl.removeEventListener('seeked', onSeeked); resolve(); }, 2000);
            });
          } catch(e) { /* continue with frame 0 */ }

          const thumbDataUrl = await extractVideoThumbnail(videoEl);
          const thumbImg = new Image();
          thumbImg.onload = () => {
            const videoDuration = videoEl.duration;
            let startTime, clipDur;
            if (dropX !== undefined) {
              clipDur = Math.min(videoDuration, dur);
              startTime = pxToSec(dropX) + idx * clipDur;
            } else {
              startTime = videoTimelineItems.reduce((max, v) => Math.max(max, v.startTime + v.duration), 0);
              clipDur = Math.min(videoDuration, dur - startTime);
            }
            startTime = Math.max(0, startTime);
            clipDur = Math.max(0.5, clipDur);

            videoTimelineItems.push({
              id: nextVideoTimelineId++,
              imgSrc: thumbDataUrl,
              imgEl: thumbImg,
              videoEl: videoEl,
              videoSrc: blobUrl,
              videoDuration: videoDuration,
              inPoint: 0,
              outPoint: videoDuration,
              startTime,
              duration: clipDur,
            });
            renderVideoTimeline(); drawRuler();
            setStatus(`Video added to video track: ${file.name} (${fmtShort(videoDuration)})`);
          };
          thumbImg.onerror = () => {
            setStatus('Could not generate video thumbnail.');
          };
          thumbImg.src = thumbDataUrl;
        });
      });
    }

    // Add video clip to the PHOTO timeline (as a media item alongside photos)
    function addVideoToPhotoTimeline(files, dropX) {
      const dur = aDur();
      const fileArr = [...files].filter(f => f.type.startsWith('video/'));
      if (fileArr.length === 0) return;
      fileArr.forEach((file, idx) => {
        const videoEl = document.createElement('video');
        videoEl.muted = true; videoEl.preload = 'auto'; videoEl.playsInline = true;
        videoEl.crossOrigin = 'anonymous';
        const blobUrl = URL.createObjectURL(file);
        videoEl.src = blobUrl;
        videoEl.addEventListener('error', () => { setStatus('Could not load video clip.'); });
        videoEl.addEventListener('loadeddata', async () => {
          try {
            videoEl.currentTime = 0.1;
            await new Promise(r => { videoEl.addEventListener('seeked', r, { once: true }); setTimeout(r, 2000); });
          } catch(e) {}
          const thumbDataUrl = await extractVideoThumbnail(videoEl);
          const thumbImg = new Image();
          thumbImg.onload = () => {
            const videoDuration = videoEl.duration;
            let startTime = dropX !== undefined
              ? pxToSec(dropX) + idx * Math.min(videoDuration, dur)
              : photoItems.reduce((max, p) => Math.max(max, p.startTime + p.duration), 0);
            startTime = Math.max(0, startTime);
            const clipDur = Math.max(0.5, Math.min(videoDuration, dur - startTime));
            photoItems.push({
              id: nextPhotoId++, type: 'video',
              imgSrc: thumbDataUrl, imgEl: thumbImg,
              videoEl, videoSrc: blobUrl, videoDuration,
              inPoint: 0, outPoint: videoDuration,
              startTime, duration: clipDur,
              transition: 'fade', transDur: 0.5, motion: 'none',
            });
            renderPhotos(); drawRuler();
            setStatus(`Video clip added to photo timeline: ${file.name}`);
          };
          thumbImg.src = thumbDataUrl;
        });
      });
    }

    // "Add Video" button → video timeline (background track)
    btnAddVideos.addEventListener('click', () => videoInput.click());
    videoInput.addEventListener('change', () => { addVideoFiles(videoInput.files); videoInput.value = ''; });

    // "Add Video Clip" button → photo timeline (alongside photos)
    const btnAddVideoClip = $('btn-add-video-clip');
    const videoClipInput = $('video-clip-input');
    if (btnAddVideoClip && videoClipInput) {
      btnAddVideoClip.addEventListener('click', () => videoClipInput.click());
      videoClipInput.addEventListener('change', () => { addVideoToPhotoTimeline(videoClipInput.files); videoClipInput.value = ''; });
    }

    // Drag-drop on photo timeline: images → photo items, videos → photo timeline video clips
    photoDropZone.addEventListener('dragover', (e) => { e.preventDefault(); photoDropZone.classList.add('dragover'); });
    photoDropZone.addEventListener('dragleave', () => photoDropZone.classList.remove('dragover'));
    photoDropZone.addEventListener('drop', (e) => {
      e.preventDefault(); photoDropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        const rect = timelineContainer.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const f = e.dataTransfer.files;
        const hasVideos = [...f].some(x => x.type.startsWith('video/'));
        const hasImages = [...f].some(x => x.type.startsWith('image/'));
        if (hasImages) addPhotoFiles(f, dropX);
        if (hasVideos) addVideoToPhotoTimeline(f, dropX);
      }
    });

