// ── DOM refs ──
const $ = id => document.getElementById(id);
const dropZone = $('drop-zone'), fileInput = $('file-input'), insertInput = $('insert-input'),
  photoInput = $('photo-input'), editorEl = $('editor'), statusEl = $('status'),
  currentTimeEl = $('current-time'), selectionInfoEl = $('selection-info'), durationEl = $('duration'),
  btnPlay = $('btn-play'), btnStop = $('btn-stop'), btnLoad = $('btn-load'),
  btnPlaySelection = $('btn-play-selection'),
  btnKeep = $('btn-keep'), btnDelete = $('btn-delete'), btnInsert = $('btn-insert'),
  btnUndo = $('btn-undo'), btnAddPhotos = $('btn-add-photos'), btnAddVideos = $('btn-add-videos'),
  videoInput = $('video-input'),
  photoDropZone = $('photo-drop-zone'), timelineContainer = $('timeline-container'),
  playheadLine = $('playhead-line'), photoCountEl = $('photo-count'),
  photoPropsEl = $('photo-props'), propThumb = $('prop-thumb'),
  propStart = $('prop-start'), propDuration = $('prop-duration'), propEnd = $('prop-end'),
  propTransition = $('prop-transition'), propTransDur = $('prop-trans-dur'), propMotion = $('prop-motion'),
  propDeleteBtn = $('prop-delete'), videoPropsExtra = $('video-props-extra'),
  propInPoint = $('prop-in-point'), propOutPoint = $('prop-out-point'), propVideoDur = $('prop-video-dur'), rulerCanvas = $('ruler-canvas'),
  btnPreview = $('btn-preview'), btnExportVideo = $('btn-export-video'),
  previewOverlay = $('preview-overlay'), previewCanvas = $('preview-canvas'),
  previewTimeEl = $('preview-time'), previewClose = $('preview-close'),
  exportProgress = $('export-progress'), exportBar = $('export-bar'), exportLabel = $('export-label');

// ── State ──
let wavesurfer = null, regions = null;
let audioCtx = null;
function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
let currentBuffer = null, undoStack = [], activeRegion = null;

// Background music
let bgmBuffer = null, bgmVolume = 0.3, bgmLoop = true;
let bgmGainNode = null, bgmSource = null;
let bgmSel = null, bgmDragging = null;

// Video series
let currentSeriesName = '';
let currentEpisodeNumber = 0;

// Picture-in-Picture speaker videos (multiple, first wins on overlap)
// Each: {id, videoEl, videoSrc, videoDuration, inPoint, outPoint, position, customX, customY, size, shape, border, borderColor, shadow}
let pipItems = [];
let nextPipId = 1;
// Shared PiP defaults
let pipPosition = 'bot-right';
let pipSize = 25;
let pipShape = 'circle';
let pipBorder = 3;
let pipBorderColor = '#ffffff';
let pipShadow = true;

// Video timeline items (background video track)
// Each: {id, videoEl, videoSrc, videoDuration, inPoint, outPoint, startTime, duration, imgSrc, imgEl}
let videoTimelineItems = [];
let nextVideoTimelineId = 1;
let selectedVideoIds = new Set();
let bgVideoMode = 'images-only'; // images-only | video-only | video-images | video-pip | video-pip-transition
let pipTransType = 'shrink';     // shrink | slide | fade | zoom
let pipTransDur = 0.5;           // seconds
let pipTransPos = 'bot-right';   // bot-right | bot-left | top-right | top-left

// Story references (characters + environments)
let storyCharacters = [];   // max 3: [{id, name, description, imgDataUrl, imgEl}]
let storyEnvironments = []; // max 3: [{id, name, description, imgDataUrl, imgEl}]
let nextCharId = 1;
let nextEnvId = 1;

// Frame overlay
let frameImgEl = null;           // <img> element for frame
let frameImgSrc = '';            // data URL
let framePadding = { top: 40, bottom: 40, left: 40, right: 40 };
let frameOpacity = 1;

// Logo overlay
let logoImgEl = null;
let logoImgSrc = '';
let logoPosition = 'top-right'; // top-left | top-right | bot-left | bot-right
let logoSize = 10;              // percentage of canvas width
let logoOpacity = 0.8;

// ── Reel/Short Mode ──
let reelMode = false;
let reelPlatform = 'instagram';
let reelDuration = 60;
let reelSubtitleStyle = 'word-by-word';
let reelTransition = 'whip-pan';
let reelWords = []; // word-level timestamps [{word, start, end}, ...]
let reelSubColor = '#ffffff';
let reelSubOutline = '#000000';
let reelSubBackdrop = 'dark'; // dark | blur | none | shadow
let reelSubSize = 4;            // 2-8, multiplied by cw
let reelSubPosition = 'bottom'; // top | center | bottom
let reelSubFont = 'Poppins';    // font family for reel subtitles
let reelSubAllCaps = false;     // uppercase all subtitle words
let reelSubAccent = '#7c3aed';  // accent/highlight word color
let reelViewport = 'fill-center'; // fit | fill-center | left-third | center-third | right-third | custom
let reelViewportX = 50; // 0-100, custom pan position (50 = center)

const REEL_PLATFORMS = {
  'instagram': { width: 1080, height: 1920, maxDur: 90, label: 'Instagram Reel' },
  'youtube':   { width: 1080, height: 1920, maxDur: 60, label: 'YouTube Short' },
  'tiktok':    { width: 1080, height: 1920, maxDur: 180, label: 'TikTok' },
};

const REEL_TRANSITIONS = {
  'quick-cut':  { transition: 'none', transDur: 0.1, motion: 'slow-zoom-in', label: 'Quick Cut' },
  'whip-pan':   { transition: 'whip-pan', transDur: 0.3, motion: 'slow-zoom-in', label: 'Whip Pan' },
  'zoom-in':    { transition: 'zoom-in', transDur: 0.3, motion: 'none', label: 'Zoom In' },
  'crossfade':  { transition: 'crossfade', transDur: 0.4, motion: 'ken-burns', label: 'Crossfade' },
  'flash':      { transition: 'flash', transDur: 0.2, motion: 'none', label: 'Flash' },
};

const REEL_SUBTITLE_STYLES = {
  'word-by-word': 'Word by Word',
  'highlight': 'Highlight',
  'karaoke': 'Karaoke',
  'bold-center': 'Bold Center',
  'none': 'None',
};

// Subtitle items (separate from user text items)
let subtitleItems = [];
let nextSubtitleId = 1;

// Multi-language tracks in editor: [{lang, langCode, audioBuffer, subtitleTexts}]
let editorLanguageTracks = [];
let editorCurrentLang = 'original'; // 'original' or langCode
let editorOriginalBuffer = null; // original audio buffer before language switch
let editorOriginalSubtitles = []; // original subtitle textItems

// Photo items: { id, imgSrc, imgEl, startTime, duration, transition, transDur, motion }
let photoItems = [];
let nextPhotoId = 1;
let selectedPhotoIds = new Set(); // multi-select support
let isDragging = false, isResizing = false, dragState = {};
let isMarqueeSelecting = false, marqueeState = {};

const TRANSITIONS = {
  'none': 'Cut', 'fade': 'Fade', 'crossfade': 'X-Fade',
  'slide-left': '⬅', 'slide-right': '➡', 'slide-up': '⬆', 'slide-down': '⬇',
  'whip-pan': '⚡', 'zoom-in': '🔍+', 'zoom-out': '🔍-',
  'rotate': '🔄', 'parallax': '◈', 'iris': '⊚', 'wipe-right': '▶',
  'wipe-diagonal': '◤', 'split-h': '⇔', 'split-v': '⇕', 'dissolve': '▦',
  'blur': '◉', 'flash': '⚡✦', 'light-leak': '🌅', 'glitch': '▮▯', 'film-grain': '🎞'
};

const MOTIONS = {
  'none': 'None',
  'ken-burns': 'Ken Burns',
  'slow-zoom-in': 'Slow Zoom In',
  'slow-zoom-out': 'Slow Zoom Out',
  'pan-left': 'Pan Left',
  'pan-right': 'Pan Right',
  'pan-up': 'Pan Up',
  'pan-down': 'Pan Down',
};

// ── Video Mode ──
let createVideoMode = 'illustrated'; // 'illustrated' | 'animated'
let reelVideoMode   = 'illustrated'; // 'illustrated' | 'animated'
let klingProvider   = 'runware';     // 'runware' | 'official'

// ── Production: silence debug logs outside localhost ──
if (location.hostname !== 'localhost' && !location.search.includes('debug=1')) {
  console.log = () => {};
}

// ── HTML sanitizer for user-provided strings in innerHTML ──
function sanitize(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Plan (single tier — stubs kept for compatibility) ──
function isPro() { return true; }
function isFree() { return false; }
function showUpgradePrompt() {}
function hideUpgradePrompt() {}
function applyEditorPlanGating() {}

// ── Cost Estimation ──
const COST_ESTIMATES = {
  transcription: 0.003,      // per 5 min audio
  textGeneration: 0.001,     // per call (scene descriptions, translation)
  imageGen: 0.039,           // per image
  tts: 0.003,                // per 5 min TTS
  ttsPerLang: 0.02,          // per language track (translate + TTS)
  visionDescribe: 0.002,     // per image description (auto-describe)
  gridGen2K: 0.134,          // per 3x3 grid (up to 9 images in one call)
};
let sessionCost = 0;
let sessionCalls = 0;

function trackCost(type, count) {
  const unitCost = COST_ESTIMATES[type] || 0;
  const cost = unitCost * (count || 1);
  sessionCost += cost;
  sessionCalls += (count || 1);
  updateCostDisplay();
}

function updateCostDisplay() {
  const el = $('session-cost');
  if (el) {
    if (sessionCost > 0) {
      el.textContent = `~$${sessionCost.toFixed(3)} est. (${sessionCalls} calls)`;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }
}

function resetSessionCost() {
  sessionCost = 0; sessionCalls = 0;
  updateCostDisplay();
}

function estimateCost(type, count) {
  const unitCost = COST_ESTIMATES[type] || 0;
  return (unitCost * (count || 1)).toFixed(3);
}

// Load library slots when editor opens
function loadEditorLibrary() {
  if (typeof renderLibrarySlots === 'function') renderLibrarySlots();
}


// ── Helpers ──
function fmt(s) { return `${Math.floor(s/60)}:${(s%60).toFixed(3).padStart(6,'0')}`; }
function fmtShort(s) { return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; }
function setStatus(m, loading) {
  const spinner = $('status-spinner');
  const textEl = $('status-text');
  if (textEl) textEl.textContent = m;
  else statusEl.textContent = m;
  if (spinner) spinner.classList.toggle('visible', !!loading);
  // Top progress bar
  const prog = $('global-progress');
  if (prog) prog.classList.toggle('visible', !!loading);
  // Mirror to reel status when on reel page
  if (currentView === 'reel') {
    const reelStatus = $('reel-generate-status');
    if (reelStatus) reelStatus.textContent = m;
  }
}
// Toast notification (top-center, auto-dismiss)
function showSaveToast(msg, isError) {
  let toast = $('save-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'save-toast';
    toast.style.cssText = 'position:fixed; top:80px; left:50%; transform:translateX(-50%); padding:10px 24px; border-radius:8px; font-size:0.85rem; font-weight:600; z-index:9999; opacity:0; transition:opacity 0.3s; pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = isError ? '#ef4444' : '#10b981';
  toast.style.color = '#fff';
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

function showPageLoader(msg) {
  const loader = $('page-loader');
  if (!loader) return;
  const textEl = loader.querySelector('.loader-text');
  if (textEl) textEl.textContent = msg || 'Loading...';
  loader.classList.add('visible');
}
function hidePageLoader() {
  const loader = $('page-loader');
  if (loader) loader.classList.remove('visible');
}
function aDur() { return currentBuffer ? currentBuffer.duration : 60; }
// getSelectedImageSize() is defined in 17-create-content.js (needs createImageSize ref)

// ── Navigation with browser history ──
let currentView = 'home'; // home | editor | create | reel

function navigateTo(view, pushHistory) {
  if (pushHistory !== false && view !== currentView) {
    history.pushState({ view }, '', '#' + view);
  }
  // Clear reel status bar when leaving reel page
  if (currentView === 'reel' && view !== 'reel') {
    const reelStatus = $('reel-generate-status');
    if (reelStatus) reelStatus.textContent = '';
  }
  currentView = view;
  // Hide all views
  dropZone.classList.add('hidden');
  editorEl.classList.remove('visible');
  const createPage = $('create-page');
  const reelPage = $('reel-page');
  if (createPage) createPage.classList.remove('visible');
  if (reelPage) reelPage.classList.remove('visible');
  // Show target view
  if (view === 'home') {
    dropZone.classList.remove('hidden');
    if (typeof renderProjectGallery === 'function') renderProjectGallery();
  } else if (view === 'editor') {
    editorEl.classList.add('visible');
  } else if (view === 'create') {
    if (createPage) createPage.classList.add('visible');
  } else if (view === 'reel') {
    if (reelPage) reelPage.classList.add('visible');
  }
}

// Handle browser back/forward
window.addEventListener('popstate', (e) => {
  const view = e.state?.view || 'home';
  if (view !== 'home' && typeof loadEditorScripts === 'function' && !window._editorScriptsLoaded) {
    loadEditorScripts(function() { navigateTo(view, false); });
  } else {
    navigateTo(view, false);
  }
});

// Set initial state
history.replaceState({ view: 'home' }, '', location.hash || '#home');

