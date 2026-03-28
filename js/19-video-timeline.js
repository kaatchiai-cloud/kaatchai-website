// ── Video Timeline ──
const videoDropZone = $('video-drop-zone');
const videoTimelineContainer = $('video-timeline-container');
const videoCountEl = $('video-count');
const videoBlockElements = new Map();

let isVideoDragging = false, isVideoResizing = false, videoDragState = {};

function createVideoBlock(item) {
  const block = document.createElement('div');
  block.className = 'video-block';
  block.dataset.id = item.id;

  const img = document.createElement('img');
  img.src = item.imgSrc;
  block.appendChild(img);

  const badge = document.createElement('div');
  badge.className = 'video-badge';
  badge.textContent = '🎬';
  block.appendChild(badge);

  const durLabel = document.createElement('div');
  durLabel.className = 'duration-label';
  block.appendChild(durLabel);

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
    videoTimelineItems = videoTimelineItems.filter(v => v.id !== item.id);
    selectedVideoIds.delete(item.id);
    hideVideoProps();
    renderVideoTimeline();
  };
  block.appendChild(delBtn);

  // Drag to move
  block.addEventListener('mousedown', (e) => {
    if (e.target === resL || e.target === resR || e.target === delBtn) return;
    e.preventDefault();
    if (!selectedVideoIds.has(item.id)) selectVideo(item.id);
    isVideoDragging = true;
    const rect = videoTimelineContainer.getBoundingClientRect();
    videoDragState = { id: item.id, offsetX: e.clientX - rect.left - secToPx(item.startTime), el: block };
  });

  resR.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!selectedVideoIds.has(item.id)) selectVideo(item.id);
    isVideoResizing = true;
    videoDragState = { id: item.id, edge: 'right', startX: e.clientX, origDuration: item.duration, el: block };
  });
  resL.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!selectedVideoIds.has(item.id)) selectVideo(item.id);
    isVideoResizing = true;
    videoDragState = { id: item.id, edge: 'left', startX: e.clientX, origStart: item.startTime, origDuration: item.duration, el: block };
  });

  block.addEventListener('click', (e) => {
    e.stopPropagation();
    selectVideo(item.id);
  });

  block._durLabel = durLabel;
  return block;
}

function updateVideoBlockStyle(block, item) {
  const left = secToPx(item.startTime);
  const width = Math.max(durToPx(item.duration), 24);
  block.style.left = left + 'px';
  block.style.width = width + 'px';
  block._durLabel.textContent = `${item.duration.toFixed(1)}s · ${fmtShort(item.startTime)}–${fmtShort(item.startTime + item.duration)}`;
  block.classList.toggle('selected', selectedVideoIds.has(item.id));
}

function renderVideoTimeline() {
  if (!videoDropZone) return;
  videoDropZone.classList.toggle('empty', videoTimelineItems.length === 0);
  if (videoCountEl) videoCountEl.textContent = videoTimelineItems.length > 0 ? `${videoTimelineItems.length} video${videoTimelineItems.length !== 1 ? 's' : ''}` : '0 videos';

  // Show bg-video-section if videos exist
  const bgVidSec = $('bg-video-section');
  if (bgVidSec) bgVidSec.style.display = videoTimelineItems.length > 0 ? '' : 'none';

  // Remove blocks for deleted items
  const currentIds = new Set(videoTimelineItems.map(v => v.id));
  for (const [id, el] of videoBlockElements) {
    if (!currentIds.has(id)) { el.remove(); videoBlockElements.delete(id); }
  }

  // Create or update blocks
  for (const item of videoTimelineItems) {
    let block = videoBlockElements.get(item.id);
    if (!block) {
      block = createVideoBlock(item);
      videoTimelineContainer.appendChild(block);
      videoBlockElements.set(item.id, block);
    }
    updateVideoBlockStyle(block, item);
  }
}

// Selection
function selectVideo(id) {
  selectedVideoIds.clear();
  selectedVideoIds.add(id);
  renderVideoTimeline();
  showVideoProps(id);
}

// Properties panel
const videoPropsEl = $('video-props');
const vpropStart = $('vprop-start');
const vpropDuration = $('vprop-duration');
const vpropEnd = $('vprop-end');
const vpropInPoint = $('vprop-in-point');
const vpropOutPoint = $('vprop-out-point');
const vpropVideoDur = $('vprop-video-dur');

function showVideoProps(id) {
  const item = videoTimelineItems.find(v => v.id === id);
  if (!item || !videoPropsEl) { hideVideoProps(); return; }
  vpropStart.value = item.startTime.toFixed(1);
  vpropDuration.value = item.duration.toFixed(1);
  vpropEnd.textContent = (item.startTime + item.duration).toFixed(1) + 's';
  vpropInPoint.value = (item.inPoint || 0).toFixed(1);
  vpropOutPoint.value = (item.outPoint || item.videoDuration).toFixed(1);
  vpropVideoDur.textContent = (item.videoDuration || 0).toFixed(1) + 's';
  videoPropsEl.classList.add('visible');
}

function hideVideoProps() {
  if (videoPropsEl) videoPropsEl.classList.remove('visible');
}

function getSelectedVideo() {
  if (selectedVideoIds.size !== 1) return null;
  return videoTimelineItems.find(v => v.id === [...selectedVideoIds][0]);
}

// Property change handlers
if (vpropStart) {
  vpropStart.addEventListener('change', () => {
    const item = getSelectedVideo();
    if (item) { item.startTime = Math.max(0, parseFloat(vpropStart.value) || 0); renderVideoTimeline(); showVideoProps(item.id); }
  });
}
if (vpropDuration) {
  vpropDuration.addEventListener('change', () => {
    const item = getSelectedVideo();
    if (item) { item.duration = Math.max(0.5, parseFloat(vpropDuration.value) || 1); renderVideoTimeline(); showVideoProps(item.id); }
  });
}
if (vpropInPoint) {
  vpropInPoint.addEventListener('change', () => {
    const item = getSelectedVideo();
    if (item) { item.inPoint = Math.max(0, Math.min(item.outPoint - 0.1, parseFloat(vpropInPoint.value) || 0)); showVideoProps(item.id); }
  });
}
if (vpropOutPoint) {
  vpropOutPoint.addEventListener('change', () => {
    const item = getSelectedVideo();
    if (item) { item.outPoint = Math.min(item.videoDuration, Math.max(item.inPoint + 0.1, parseFloat(vpropOutPoint.value) || item.videoDuration)); showVideoProps(item.id); }
  });
}

// Close button
const vpropClose = $('vprop-close');
if (vpropClose) vpropClose.addEventListener('click', () => { selectedVideoIds.clear(); hideVideoProps(); renderVideoTimeline(); });

// Drag / Resize handlers
document.addEventListener('mousemove', (e) => {
  if (isVideoDragging) {
    const item = videoTimelineItems.find(v => v.id === videoDragState.id);
    if (!item) return;
    const rect = videoTimelineContainer.getBoundingClientRect();
    const x = e.clientX - rect.left - videoDragState.offsetX;
    item.startTime = Math.max(0, pxToSec(x));
    const block = videoDragState.el;
    if (block) {
      block.style.left = secToPx(item.startTime) + 'px';
      block._durLabel.textContent = `${item.duration.toFixed(1)}s · ${fmtShort(item.startTime)}–${fmtShort(item.startTime + item.duration)}`;
    }
    showVideoProps(item.id);
  }
  if (isVideoResizing) {
    const item = videoTimelineItems.find(v => v.id === videoDragState.id);
    if (!item) return;
    const dx = e.clientX - videoDragState.startX;
    if (videoDragState.edge === 'right') {
      item.duration = Math.max(0.5, videoDragState.origDuration + pxToSec(dx));
    } else {
      const newStart = Math.max(0, videoDragState.origStart + pxToSec(dx));
      const delta = newStart - videoDragState.origStart;
      item.startTime = newStart;
      item.duration = Math.max(0.5, videoDragState.origDuration - delta);
    }
    const block = videoDragState.el;
    if (block) {
      block.style.left = secToPx(item.startTime) + 'px';
      block.style.width = Math.max(durToPx(item.duration), 24) + 'px';
      block._durLabel.textContent = `${item.duration.toFixed(1)}s · ${fmtShort(item.startTime)}–${fmtShort(item.startTime + item.duration)}`;
    }
    showVideoProps(item.id);
  }
});

document.addEventListener('mouseup', () => {
  if (isVideoDragging || isVideoResizing) {
    isVideoDragging = false;
    isVideoResizing = false;
    renderVideoTimeline();
   
  }
});

// Deselect on click outside
if (videoTimelineContainer) {
  videoTimelineContainer.addEventListener('click', (e) => {
    if (e.target === videoTimelineContainer) {
      selectedVideoIds.clear();
      hideVideoProps();
      renderVideoTimeline();
    }
  });
}

// Resize handler
window.addEventListener('resize', () => { renderVideoTimeline(); });
