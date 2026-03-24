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
let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let currentBuffer = null, undoStack = [], activeRegion = null;

// Background music
let bgmBuffer = null, bgmVolume = 0.3, bgmLoop = true;
let bgmGainNode = null, bgmSource = null;

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

// ── Plan Gating ──
const PLAN_FREE = 'free';
const PLAN_PRO = 'pro';
let currentPlan = localStorage.getItem('stori_plan') || PLAN_FREE;
function isPro() { return currentPlan === PLAN_PRO; }
function isFree() { return currentPlan === PLAN_FREE; }

const FREE_TEMPLATES = ['blank', 'bedtime-story', 'youtube-video', 'explainer', 'instagram-reel'];
const FREE_STYLES = ['watercolor', 'cinematic', 'digital-art', 'photorealistic', 'minimalist'];
const FREE_SIZES = ['1280x720', '1080x1920', '1080x1080'];
const FREE_TRANSITIONS = ['none', 'fade'];

// Autosave
let autosaveDirty = false;
function markDirty() { autosaveDirty = true; }

// Upgrade prompt
function showUpgradePrompt(msg) {
  const modal = $('upgrade-modal');
  const msgEl = $('upgrade-message');
  if (modal && msgEl) {
    msgEl.textContent = msg;
    modal.classList.add('visible');
  }
}
function hideUpgradePrompt() {
  const modal = $('upgrade-modal');
  if (modal) modal.classList.remove('visible');
}

// Load library slots when editor opens
function loadEditorLibrary() {
  if (typeof renderLibrarySlots === 'function') renderLibrarySlots();
}

// Apply editor plan gating (called when editor opens)
function applyEditorPlanGating() {
  // Series inputs
  const seriesEl = $('series-name');
  const epEl = $('episode-number');
  if (seriesEl) seriesEl.style.display = isFree() ? 'none' : '';
  if (epEl) epEl.style.display = isFree() ? 'none' : '';
  // BGM section label
  const bgmBtn = $('btn-add-bgm');
  if (bgmBtn && isFree()) bgmBtn.title = 'Pro feature';
  // PiP section label
  const pipBtn = $('btn-add-pip');
  if (pipBtn && isFree()) pipBtn.title = 'Pro feature';
}

// ── Helpers ──
function fmt(s) { return `${Math.floor(s/60)}:${(s%60).toFixed(3).padStart(6,'0')}`; }
function fmtShort(s) { return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; }
function setStatus(m) { statusEl.textContent = m; }
function aDur() { return currentBuffer ? currentBuffer.duration : 60; }
// getSelectedImageSize() is defined in 17-create-content.js (needs createImageSize ref)

