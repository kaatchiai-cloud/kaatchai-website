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
      fileArr.forEach((file, idx) => {
        const videoEl = document.createElement('video');
        videoEl.muted = true;
        videoEl.preload = 'auto';
        videoEl.playsInline = true;
        const blobUrl = URL.createObjectURL(file);
        videoEl.src = blobUrl;

        videoEl.addEventListener('loadedmetadata', () => {
          // Seek to first frame for thumbnail
          videoEl.currentTime = 0.1;
        });

        videoEl.addEventListener('seeked', async function onSeeked() {
          videoEl.removeEventListener('seeked', onSeeked);
          const thumbDataUrl = await extractVideoThumbnail(videoEl);
          const thumbImg = new Image();
          thumbImg.onload = () => {
            const videoDuration = videoEl.duration;
            let startTime, clipDur;
            if (dropX !== undefined) {
              clipDur = Math.min(videoDuration, dur);
              startTime = pxToSec(dropX) + idx * clipDur;
            } else {
              startTime = photoItems.reduce((max, p) => Math.max(max, p.startTime + p.duration), 0);
              clipDur = Math.min(videoDuration, dur - startTime);
            }
            startTime = Math.max(0, startTime);
            clipDur = Math.max(0.5, clipDur);

            photoItems.push({
              id: nextPhotoId++,
              type: 'video',
              imgSrc: thumbDataUrl,
              imgEl: thumbImg,
              videoEl: videoEl,
              videoSrc: blobUrl,
              videoDuration: videoDuration,
              inPoint: 0,
              outPoint: videoDuration,
              startTime,
              duration: clipDur,
              transition: 'fade',
              transDur: 0.5,
            });
            renderPhotos(); drawRuler();
          };
          thumbImg.src = thumbDataUrl;
        }, { once: true });
      });
    }

    btnAddVideos.addEventListener('click', () => videoInput.click());
    videoInput.addEventListener('change', () => { addVideoFiles(videoInput.files); videoInput.value = ''; });

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
        if (hasVideos) addVideoFiles(f, dropX);
      }
    });

