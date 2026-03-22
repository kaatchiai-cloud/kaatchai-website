// ── Timeline Zoom State ──
let zoomLevel = 1;   // 1 = full timeline, 10 = zoomed 10x
let zoomOffset = 0;  // start time in seconds of visible window
const zoomLevelInput = $('zoom-level');
const zoomScrollInput = $('zoom-scroll');
const zoomInfoEl = $('zoom-info');
const zoomResetBtn = $('zoom-reset');
const zoomScrollLeftBtn = $('zoom-scroll-left');
const zoomScrollRightBtn = $('zoom-scroll-right');

function visibleDuration() { return aDur() / zoomLevel; }
function visibleStart() { return zoomOffset; }
function visibleEnd() { return zoomOffset + visibleDuration(); }

// Convert seconds to pixel position (zoom-aware)
function secToPx(s) {
  const visDur = visibleDuration();
  return ((s - zoomOffset) / visDur) * timelineContainer.clientWidth;
}
// Convert a duration (not position) to pixel width (zoom-aware)
function durToPx(d) {
  const visDur = visibleDuration();
  return (d / visDur) * timelineContainer.clientWidth;
}
// Convert pixel position to seconds (zoom-aware)
function pxToSec(px) {
  const visDur = visibleDuration();
  return (px / timelineContainer.clientWidth) * visDur + zoomOffset;
}
// Convert a pixel delta to a time delta (no offset — inverse of durToPx)
function pxToDur(px) {
  const visDur = visibleDuration();
  return (px / timelineContainer.clientWidth) * visDur;
}

function updateZoomInfo() {
  if (zoomLevel <= 1.05) {
    zoomInfoEl.textContent = 'Full timeline';
  } else {
    zoomInfoEl.textContent = `${fmtShort(visibleStart())} – ${fmtShort(visibleEnd())} (${visibleDuration().toFixed(1)}s)`;
  }
}

function applyZoom() {
  updateZoomInfo(); drawRuler(); renderPhotos(); renderTexts();
  if (typeof renderSubtitles === 'function') renderSubtitles();
  syncWaveformZoom();
}

function syncWaveformZoom() {
  if (!wavesurfer || !currentBuffer) return;
  const waveEl = document.querySelector('#waveform');
  // Use CSS transform to zoom/scroll — no WaveSurfer zoom, no scrollbar
  const offsetFrac = zoomOffset / Math.max(0.001, aDur());
  const translateX = -offsetFrac * zoomLevel * 100;
  waveEl.style.transform = `scaleX(${zoomLevel}) translateX(${translateX / zoomLevel}%)`;
}

zoomLevelInput.addEventListener('input', () => {
  zoomLevel = parseFloat(zoomLevelInput.value);
  const maxOffset = Math.max(0, aDur() - visibleDuration());
  zoomOffset = Math.min(zoomOffset, maxOffset);
  zoomScrollInput.value = maxOffset > 0 ? zoomOffset / maxOffset : 0;
  applyZoom();
});

zoomScrollInput.addEventListener('input', () => {
  const maxOffset = Math.max(0, aDur() - visibleDuration());
  zoomOffset = parseFloat(zoomScrollInput.value) * maxOffset;
  applyZoom();
});

function scrollTimeline(direction) {
  const step = visibleDuration() * 0.25;
  const maxOffset = Math.max(0, aDur() - visibleDuration());
  zoomOffset = Math.max(0, Math.min(maxOffset, zoomOffset + direction * step));
  zoomScrollInput.value = maxOffset > 0 ? zoomOffset / maxOffset : 0;
  applyZoom();
}

zoomScrollLeftBtn.addEventListener('click', () => scrollTimeline(-1));
zoomScrollRightBtn.addEventListener('click', () => scrollTimeline(1));

zoomResetBtn.addEventListener('click', () => {
  zoomLevel = 1; zoomOffset = 0;
  zoomLevelInput.value = 1; zoomScrollInput.value = 0;
  applyZoom();
});
