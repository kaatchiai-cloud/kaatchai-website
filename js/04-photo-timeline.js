    // ── Photo rendering ──
    // Map photo id → DOM element for fast updates during drag
    const blockElements = new Map();

    function createPhotoBlock(item) {
      const block = document.createElement('div');
      block.className = 'photo-block';
      block.dataset.id = item.id;

      const img = document.createElement('img');
      img.src = item.imgSrc;
      block.appendChild(img);

      if (item.type === 'video') {
        const badge = document.createElement('div');
        badge.className = 'video-badge';
        badge.textContent = '🎬 Video';
        block.appendChild(badge);
      }

      const durLabel = document.createElement('div');
      durLabel.className = 'duration-label';
      block.appendChild(durLabel);

      const transIcon = document.createElement('div');
      transIcon.className = 'transition-icon';
      block.appendChild(transIcon);

      const resL = document.createElement('div');
      resL.className = 'resize-handle-left';
      block.appendChild(resL);

      const resR = document.createElement('div');
      resR.className = 'resize-handle-right';
      block.appendChild(resR);

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn'; delBtn.textContent = '×';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        photoItems = photoItems.filter(p => p.id !== item.id);
        selectedPhotoIds.delete(item.id);
        if (selectedPhotoIds.size === 0) hideProps();
        updateDeleteSelectedBtn();
        renderPhotos();
      };
      block.appendChild(delBtn);

      // Drag to move
      block.addEventListener('mousedown', (e) => {
        if (e.target === resL || e.target === resR || e.target === delBtn) return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          togglePhotoSelection(item.id);
        } else if (!selectedPhotoIds.has(item.id)) {
          selectPhoto(item.id);
        }
        isDragging = true;
        const rect = timelineContainer.getBoundingClientRect();
        dragState = { id: item.id, offsetX: e.clientX - rect.left - secToPx(item.startTime), el: block };
      });

      resR.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!selectedPhotoIds.has(item.id)) selectPhoto(item.id);
        isResizing = true;
        dragState = { id: item.id, edge: 'right', startX: e.clientX, origDuration: item.duration, el: block };
      });
      resL.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!selectedPhotoIds.has(item.id)) selectPhoto(item.id);
        isResizing = true;
        dragState = { id: item.id, edge: 'left', startX: e.clientX, origStart: item.startTime, origDuration: item.duration, el: block };
      });

      block.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!e.ctrlKey && !e.metaKey) selectPhoto(item.id);
      });

      // Store sub-element refs for fast label updates
      block._durLabel = durLabel;
      block._transIcon = transIcon;

      return block;
    }

    // Fast update: only change style.left / style.width / labels — no DOM recreation
    function updateBlockStyle(block, item) {
      const left = secToPx(item.startTime);
      const width = Math.max(durToPx(item.duration), 24);
      block.style.left = left + 'px';
      block.style.width = width + 'px';
      block._durLabel.textContent = `${item.duration.toFixed(1)}s · ${fmtShort(item.startTime)}–${fmtShort(item.startTime + item.duration)}`;
      if (item.transition !== 'none') {
        block._transIcon.textContent = TRANSITIONS[item.transition] || item.transition;
        block._transIcon.style.display = '';
      } else {
        block._transIcon.style.display = 'none';
      }
      block.classList.toggle('selected', selectedPhotoIds.size === 1 && selectedPhotoIds.has(item.id));
      block.classList.toggle('multi-selected', selectedPhotoIds.size > 1 && selectedPhotoIds.has(item.id));
    }

    function renderPhotos() {
      photoDropZone.classList.toggle('empty', photoItems.length === 0);
      const vidCount = photoItems.filter(p => p.type === 'video').length;
      const imgCount = photoItems.length - vidCount;
      const parts = [];
      if (imgCount > 0) parts.push(`${imgCount} photo${imgCount !== 1 ? 's' : ''}`);
      if (vidCount > 0) parts.push(`${vidCount} video${vidCount !== 1 ? 's' : ''}`);
      photoCountEl.textContent = parts.length ? parts.join(', ') : '0 items';

      // Remove blocks for deleted items
      const currentIds = new Set(photoItems.map(p => p.id));
      for (const [id, el] of blockElements) {
        if (!currentIds.has(id)) { el.remove(); blockElements.delete(id); }
      }

      // Create or update blocks
      for (const item of photoItems) {
        let block = blockElements.get(item.id);
        if (!block) {
          block = createPhotoBlock(item);
          timelineContainer.appendChild(block);
          blockElements.set(item.id, block);
        }
        updateBlockStyle(block, item);
      }
    }

    // ── Drag / Resize handlers (lightweight — no DOM recreation) ──
    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const item = photoItems.find(p => p.id === dragState.id);
        if (!item) return;
        const rect = timelineContainer.getBoundingClientRect();
        const x = e.clientX - rect.left - dragState.offsetX;
        item.startTime = Math.max(0, pxToSec(x));
        // Fast path: only update this one block's CSS
        const block = dragState.el;
        if (block) {
          block.style.left = secToPx(item.startTime) + 'px';
          block._durLabel.textContent = `${item.duration.toFixed(1)}s · ${fmtShort(item.startTime)}–${fmtShort(item.startTime + item.duration)}`;
        }
        showProps(item.id);
      }
      if (isResizing) {
        const item = photoItems.find(p => p.id === dragState.id);
        if (!item) return;
        const dx = e.clientX - dragState.startX;
        const dSec = pxToDur(dx);
        if (dragState.edge === 'right') {
          item.duration = Math.max(0.3, dragState.origDuration + dSec);
        } else {
          const newStart = Math.max(0, dragState.origStart + dSec);
          const endTime = dragState.origStart + dragState.origDuration;
          item.startTime = newStart;
          item.duration = Math.max(0.3, endTime - newStart);
        }
        // Fast path: only update this one block's CSS
        const block = dragState.el;
        if (block) {
          block.style.left = secToPx(item.startTime) + 'px';
          block.style.width = Math.max(durToPx(item.duration), 24) + 'px';
          block._durLabel.textContent = `${item.duration.toFixed(1)}s · ${fmtShort(item.startTime)}–${fmtShort(item.startTime + item.duration)}`;
        }
        showProps(item.id);
      }
    });
    document.addEventListener('mouseup', () => {
      if (isDragging || isResizing) {
        isDragging = false; isResizing = false;
        renderPhotos(); // final full sync after drag ends
      }
    });

    // ── Selection & props ──
    function selectPhoto(id) {
      selectedPhotoIds.clear();
      selectedPhotoIds.add(id);
      renderPhotos(); showProps(id); updateDeleteSelectedBtn();
    }
    function togglePhotoSelection(id) {
      if (selectedPhotoIds.has(id)) selectedPhotoIds.delete(id);
      else selectedPhotoIds.add(id);
      if (selectedPhotoIds.size === 1) showProps([...selectedPhotoIds][0]);
      else hideProps();
      renderPhotos(); updateDeleteSelectedBtn();
    }
    const btnDeleteSelectedPhotos = $('btn-delete-selected-photos');
    function updateDeleteSelectedBtn() {
      btnDeleteSelectedPhotos.style.display = selectedPhotoIds.size > 1 ? '' : 'none';
      btnDeleteSelectedPhotos.textContent = `🗑 Delete ${selectedPhotoIds.size} Selected`;
    }
    btnDeleteSelectedPhotos.addEventListener('click', () => {
      photoItems = photoItems.filter(p => !selectedPhotoIds.has(p.id));
      selectedPhotoIds.clear(); hideProps(); updateDeleteSelectedBtn(); renderPhotos();
    });
    function showProps(id) {
      const item = photoItems.find(p => p.id === id);
      if (!item) { hideProps(); return; }
      propThumb.src = item.imgSrc;
      propStart.value = item.startTime.toFixed(1);
      propDuration.value = item.duration.toFixed(1);
      propEnd.textContent = (item.startTime + item.duration).toFixed(1) + 's';
      propTransition.value = item.transition;
      propTransDur.value = item.transDur;
      propMotion.value = item.motion || 'none';
      // Video-specific fields
      if (item.type === 'video') {
        videoPropsExtra.style.display = '';
        propInPoint.value = (item.inPoint || 0).toFixed(1);
        propOutPoint.value = (item.outPoint || item.videoDuration || 0).toFixed(1);
        propVideoDur.textContent = (item.videoDuration || 0).toFixed(1) + 's';
      } else {
        videoPropsExtra.style.display = 'none';
      }
      photoPropsEl.classList.add('visible');
    }
    function hideProps() { photoPropsEl.classList.remove('visible'); }

    function getSelectedPhoto() {
      if (selectedPhotoIds.size !== 1) return null;
      return photoItems.find(p => p.id === [...selectedPhotoIds][0]);
    }
    propStart.addEventListener('change', () => {
      const item = getSelectedPhoto();
      if (item) { item.startTime = Math.max(0, parseFloat(propStart.value) || 0); renderPhotos(); showProps(item.id); }
    });
    propDuration.addEventListener('change', () => {
      const item = getSelectedPhoto();
      if (item) { item.duration = Math.max(0.3, parseFloat(propDuration.value) || 1); renderPhotos(); showProps(item.id); }
    });
    propTransition.addEventListener('change', () => {
      const item = getSelectedPhoto();
      if (item) { item.transition = propTransition.value; renderPhotos(); }
    });
    propTransDur.addEventListener('change', () => {
      const item = getSelectedPhoto();
      if (item) { item.transDur = Math.max(0.1, Math.min(5, parseFloat(propTransDur.value) || 0.5)); }
    });
    propMotion.addEventListener('change', () => {
      const item = getSelectedPhoto();
      if (item) { item.motion = propMotion.value; renderPhotos(); }
    });
    propInPoint.addEventListener('change', () => {
      const item = getSelectedPhoto();
      if (item && item.type === 'video') {
        item.inPoint = Math.max(0, Math.min(item.outPoint - 0.1, parseFloat(propInPoint.value) || 0));
        showProps(item.id);
      }
    });
    propOutPoint.addEventListener('change', () => {
      const item = getSelectedPhoto();
      if (item && item.type === 'video') {
        item.outPoint = Math.max(item.inPoint + 0.1, Math.min(item.videoDuration, parseFloat(propOutPoint.value) || item.videoDuration));
        showProps(item.id);
      }
    });
    $('prop-close').addEventListener('click', () => {
      selectedPhotoIds.clear(); hideProps(); updateDeleteSelectedBtn(); renderPhotos();
    });
    propDeleteBtn.addEventListener('click', () => {
      photoItems = photoItems.filter(p => !selectedPhotoIds.has(p.id));
      selectedPhotoIds.clear(); hideProps(); updateDeleteSelectedBtn(); renderPhotos();
    });
    let photoMarqueeJustFinished = false;
    timelineContainer.addEventListener('click', (e) => {
      if (photoMarqueeJustFinished) { photoMarqueeJustFinished = false; return; }
      if (e.target === timelineContainer || e.target === photoDropZone) {
        selectedPhotoIds.clear(); hideProps(); updateDeleteSelectedBtn(); renderPhotos();
      }
    });

    // ── Marquee selection (photo timeline) ──
    const marqueeBox = $('marquee-box');
    timelineContainer.addEventListener('mousedown', (e) => {
      if (e.target !== timelineContainer && e.target !== photoDropZone && e.target !== marqueeBox) return;
      e.preventDefault();
      const rect = timelineContainer.getBoundingClientRect();
      isMarqueeSelecting = true;
      marqueeState = { startX: e.clientX - rect.left, startY: e.clientY - rect.top, rect };
      marqueeBox.style.display = 'block';
      marqueeBox.style.left = marqueeState.startX + 'px';
      marqueeBox.style.top = '0px';
      marqueeBox.style.width = '0px';
      marqueeBox.style.height = timelineContainer.clientHeight + 'px';
      if (!e.ctrlKey && !e.metaKey) { selectedPhotoIds.clear(); renderPhotos(); }
    });
    document.addEventListener('mousemove', (e) => {
      if (!isMarqueeSelecting) return;
      const currentX = e.clientX - marqueeState.rect.left;
      const x = Math.min(marqueeState.startX, currentX);
      const w = Math.abs(currentX - marqueeState.startX);
      marqueeBox.style.left = x + 'px';
      marqueeBox.style.width = w + 'px';
      // Highlight photos within marquee
      const startSec = pxToSec(x);
      const endSec = pxToSec(x + w);
      if (!e.ctrlKey && !e.metaKey) selectedPhotoIds.clear();
      for (const p of photoItems) {
        const pEnd = p.startTime + p.duration;
        if (p.startTime < endSec && pEnd > startSec) selectedPhotoIds.add(p.id);
      }
      renderPhotos(); updateDeleteSelectedBtn();
    });
    document.addEventListener('mouseup', () => {
      if (isMarqueeSelecting) {
        isMarqueeSelecting = false;
        photoMarqueeJustFinished = true;
        marqueeBox.style.display = 'none';
        if (selectedPhotoIds.size === 1) showProps([...selectedPhotoIds][0]);
        else hideProps();
      }
    });

    // ── Adding photos ──
    function addPhotoFiles(files, dropX) {
      // dropX is the pixel position within the timeline where the user dropped (optional)
      const dur = aDur();
      const fileArr = [...files].filter(f => f.type.startsWith('image/'));
      const count = fileArr.length;
      // Each photo gets equal share of audio duration
      const equalDur = dur / count;

      fileArr.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            let startTime, photoDur;
            if (dropX !== undefined) {
              // Place at drop position, each subsequent file offset
              photoDur = Math.min(5, equalDur);
              startTime = pxToSec(dropX) + idx * photoDur;
            } else {
              // Split equally across the whole audio timeline
              startTime = equalDur * idx;
              photoDur = equalDur;
            }
            startTime = Math.max(0, startTime);

            photoItems.push({
              id: nextPhotoId++,
              imgSrc: ev.target.result,
              imgEl: img,
              startTime,
              duration: photoDur,
              transition: 'fade',
              transDur: 0.5,
              motion: 'none',
            });
            renderPhotos(); drawRuler();
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    btnAddPhotos.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', () => { addPhotoFiles(photoInput.files); photoInput.value = ''; });
