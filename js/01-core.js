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
// Narrator overlay track (talking-head only). Sparse: only chunks where
// scene.frontRole === 'narrator' and a narrator clip exists. Same item shape
// as videoTimelineItems with `lane: 'narrator'`.
let narratorTimelineItems = [];
let nextNarratorTimelineId = 1;
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

// ── Storypilot token-based cost tracking ──
const TOKEN_PRICING = {
  gemini:    { in: 0.000000075, out: 0.000000300 },   // $0.075 / $0.30 per M tokens
  openai:    { in: 0.000002500, out: 0.000010000 },   // $2.50  / $10   per M tokens
  anthropic: { in: 0.000003000, out: 0.000015000 },   // $3     / $15   per M tokens
};

function trackTokenCost(promptTokens, outputTokens, provider) {
  const p = TOKEN_PRICING[provider] || TOKEN_PRICING['gemini'];
  const cost = (promptTokens * p.in) + (outputTokens * p.out);
  sessionCost += cost;
  sessionCalls += 1;
  updateCostDisplay();
  return cost;
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
let currentView = 'home'; // home | editor | create | reel | storypilot

function navigateTo(view, pushHistory) {
  // metaphor-plan.md Exception 3 — set data-section on <html> per route.
  // Consumed by css/themes.css and future css/filmstrip.css / css/reel.css.
  document.documentElement.setAttribute('data-section',
    view === 'home'       ? 'landing'     :
    view === 'create'     ? 'copilot'     :
    view === 'reel'       ? 'autopilot'   :
    view === 'storypilot' ? 'storypilot'  : 'editor');
  if (pushHistory !== false && view !== currentView) {
    history.pushState({ view }, '', '#' + view);
  }
  // Close canvas panel when leaving create page
  if (currentView === 'create' && view !== 'create') {
    try { if (typeof closeCanvasPanel === 'function') closeCanvasPanel(); } catch(_) {}
  }
  // Clear reel status bar when leaving reel page
  if (currentView === 'reel' && view !== 'reel') {
    const reelStatus = $('reel-generate-status');
    if (reelStatus) reelStatus.textContent = '';
    // Bug 22/23 — cancel in-flight reel generation + stop autosave interval on nav-away.
    // typeof guards are safe: 20-reels-creator.js is lazy-loaded and these names may be absent.
    try { if (typeof reelAbortController !== 'undefined' && reelAbortController) reelAbortController.abort(); } catch(_) {}
    try { if (typeof stopReelAutosave === 'function') stopReelAutosave(); } catch(_) {}
    // Bug 28 — stop in-flight segment preview (video + audio + state reset).
    try { if (typeof stopSegPreview === 'function') stopSegPreview(); } catch(_) {}
  }
  currentView = view;
  // Show/hide nav back buttons (editor only; nav is hidden on create/reel by CSS)
  var navBackBtns = document.getElementById('nav-back-buttons');
  if (navBackBtns) navBackBtns.classList.toggle('hidden', view !== 'editor');
  // Hide all views
  dropZone.classList.add('hidden');
  editorEl.classList.remove('visible');
  const createPage = $('create-page');
  const reelPage = $('reel-page');
  const brainstormPage = document.getElementById('brainstorm-page');
  const reelHeaderWrapper = $('reel-header-wrapper');
  const createHeaderWrapper = $('create-header-wrapper');
  if (createPage) createPage.classList.remove('visible');
  if (reelPage) reelPage.classList.remove('visible');
  if (brainstormPage) brainstormPage.classList.remove('visible');
  if (reelHeaderWrapper) reelHeaderWrapper.style.display = 'none';
  if (createHeaderWrapper) createHeaderWrapper.style.display = 'none';
  // Show target view
  if (view === 'home') {
    dropZone.classList.remove('hidden');
    if (typeof renderProjectGallery === 'function') renderProjectGallery();
    // Bug 26 — clear stale data-metaphor on Create/Reel pages so future CSS
    // rules scoped on [data-metaphor] can't leak across nav cycles.
    if (createPage) createPage.removeAttribute('data-metaphor');
    if (reelPage) reelPage.removeAttribute('data-metaphor');
  } else if (view === 'editor') {
    editorEl.classList.add('visible');
    if (typeof updateEditorEmptyState === 'function') updateEditorEmptyState();
    // #16: two-column layout (desktop only, runs once)
    if (typeof setupEditorColumns === 'function') setupEditorColumns();
    // #11: persistent mini-preview — always show when editor opens
    var previewPanel = document.getElementById('inline-preview-panel');
    if (previewPanel) previewPanel.style.display = '';
  } else if (view === 'create') {
    if (createPage) createPage.classList.add('visible');
    if (createHeaderWrapper) createHeaderWrapper.style.display = 'block';
    // metaphor-plan.md §3 — restore last-chosen Copilot metaphor on entry.
    try {
      var cm = localStorage.getItem('stori_copilot_metaphor') || 'filmstrip';
      if (createPage) createPage.setAttribute('data-metaphor', cm);
    } catch(e){}
    // Storypilot handoff — pre-fill Copilot text mode + structured cast seed
    try {
      var ho = window.__storiHandoff;
      if (ho && ho.target === 'copilot') {
        // Defer so Copilot JS has time to initialise
        setTimeout(function() {
          var textBtn = document.getElementById('create-mode-text');
          if (textBtn) textBtn.click();
          var ta = document.getElementById('create-tts-text');
          if (ta) ta.value = ho.plainText;
          // Detect brainstorm script shape and seed video type + cast/product
          if (ho.source === 'brainstorm' && ho.finalScript) {
            try {
              var fs = ho.finalScript;
              window.createJobState = window.createJobState || {};
              // Determine type from shape
              var shape = (fs.characters !== undefined && fs.acts !== undefined) ? 'film'
                       : (fs.core_claim !== undefined || fs.product !== undefined) ? 'brand'
                       : null;
              if (shape) {
                window.createJobState.videoType = shape;
                window.createJobState.videoTypeLocked = true;
                if (shape === 'film' && Array.isArray(fs.characters)) {
                  window.createJobState.characters = fs.characters.map(function(ch, i) {
                    var desc = [];
                    if (ch.role) desc.push('role: ' + ch.role);
                    if (ch.want) desc.push('wants: ' + ch.want);
                    if (ch.obstacle) desc.push('obstacle: ' + ch.obstacle);
                    return {
                      id: 'char_bs_' + i + '_' + Date.now().toString(36),
                      name: ch.name || ('Character ' + (i + 1)),
                      userDescription: desc.join(', '),
                      uploadedImageDataUrl: null,
                      appearanceSheet: '',
                      distinctiveTraits: [],
                      ageRange: '',
                      build: '',
                      representativeImageDataUrl: null,
                      locked: false,
                      libraryId: null,
                      createdAt: new Date().toISOString(),
                    };
                  });
                  window.createJobState.locations = [];
                }
                if (shape === 'brand') {
                  // Seed product from finalScript.product (string today)
                  var prodName = fs.product || fs.brand || 'Product';
                  var prodDesc = fs.core_claim || (fs.brand ? ('Brand: ' + fs.brand) : '');
                  window.createJobState.product = {
                    id: 'prod_bs_' + Date.now().toString(36),
                    name: prodName,
                    userDescription: prodDesc,
                    brandColors: [],
                    logoDataUrl: null,
                    uploadedImageDataUrl: null,
                    appearanceSheet: '',
                    distinctiveTraits: [],
                    representativeImageDataUrl: null,
                    locked: false,
                    libraryId: null,
                    createdAt: new Date().toISOString(),
                  };
                  window.createJobState.characters = [];
                  window.createJobState.locations = [];
                }
                // Narrator — seeded from explicit upfront pick (brainstorm narrator-choice screen).
                // Only populated when fs.narrator is non-null with a name.
                if (fs.narrator && fs.narrator.name) {
                  window.createJobState.narrator = {
                    id: 'narr_bs_' + Date.now().toString(36),
                    name: fs.narrator.name,
                    userDescription: fs.narrator.description || '',
                    onScreenStyle: fs.narrator.onScreenStyle === 'talking-head' ? 'talking-head' : 'voice-only',
                    uploadedImageDataUrl: null,
                    appearanceSheet: '',
                    distinctiveTraits: [],
                    ageRange: '',
                    build: '',
                    representativeImageDataUrl: null,
                    locked: false,
                    libraryId: null,
                    createdAt: new Date().toISOString(),
                  };
                }
              }
              // Seed loraAssignments for Assets section (populated later by user)
              window.createJobState.loraAssignments = {
                characters: {},
                narrator: null,
                products: [],
              };
              if (typeof window.applyVideoTypeVisibility === 'function') window.applyVideoTypeVisibility();
              if (shape === 'film' && typeof window.castRenderRows === 'function') window.castRenderRows();
              if (shape === 'brand' && typeof window.brandRenderSlots === 'function') window.brandRenderSlots();
              if (typeof window.narratorRenderSlot === 'function') window.narratorRenderSlot();
              if (typeof window.castShowMutexHints === 'function') window.castShowMutexHints();
            } catch(seedErr) { console.warn('[handoff seed]', seedErr.message); }
          }
          // Seed visual style/treatment from brainstorm picker
          if (ho.visualStyle || ho.visualTreatment) {
            window.createJobState = window.createJobState || {};
            if (ho.visualStyle)     window.createJobState.subStyle        = ho.visualStyle;
            if (ho.visualTreatment) window.createJobState.visualTreatment = ho.visualTreatment;
          }
          window.__storiHandoff = null;
          var tail = ho.fileName ? ' Saved as ' + ho.fileName + ' on your device.' : '';
          if (typeof setStatus === 'function') setStatus('Script imported from Storypilot — review and click Generate.' + tail);
        }, 300);
      }
    } catch(e){}
  } else if (view === 'reel') {
    if (reelPage) reelPage.classList.add('visible');
    if (reelHeaderWrapper) reelHeaderWrapper.style.display = 'block';
    // metaphor-plan.md §3 — restore last-chosen Autopilot metaphor on entry.
    try {
      var rm = localStorage.getItem('stori_autopilot_metaphor') || 'reel';
      if (reelPage) reelPage.setAttribute('data-metaphor', rm);
    } catch(e){}
    // metaphor-plan.md Exception 1 addendum — dispatch 'idle' phase so the
    // dial lands on the `record` agent when the user arrives at Autopilot.
    // (Safe no-op until js/24-reel.js ships; no listeners today.)
    try {
      document.dispatchEvent(new CustomEvent('reel:phase', { detail: { phase: 'idle' }}));
    } catch(e){}
    // Storypilot handoff — pre-fill Autopilot text mode
    try {
      var ho = window.__storiHandoff;
      if (ho && ho.target === 'autopilot') {
        setTimeout(function() {
          if (typeof switchReelInputMode === 'function') switchReelInputMode('text');
          var ta = document.getElementById('reel-text-input');
          if (ta) {
            ta.value = ho.plainText;
            // Reveal Step 3 immediately — no need to click anything
            if (typeof showReelPresets === 'function') showReelPresets();
          }
          // Brainstorm handoff — store structured script for direct storyboard path
          if (ho.source === 'brainstorm' && ho.finalScript) {
            window.__reelHandoffScript = ho.finalScript;
          }
          // Seed visual style/treatment so getMergedStyle works on the reel path
          if (ho.visualStyle || ho.visualTreatment) {
            window.createJobState = window.createJobState || {};
            if (ho.visualStyle)     window.createJobState.subStyle        = ho.visualStyle;
            if (ho.visualTreatment) window.createJobState.visualTreatment = ho.visualTreatment;
          }
          window.__storiHandoff = null;
          var tail = ho.fileName ? ' Saved as ' + ho.fileName + ' on your device.' : '';
          if (typeof setStatus === 'function') setStatus('Script imported from Storypilot — review and click Launch.' + tail);
        }, 300);
      }
    } catch(e){}
  } else if (view === 'storypilot') {
    if (brainstormPage) brainstormPage.classList.add('visible');
  }
}

// Handle browser back/forward
window.addEventListener('popstate', (e) => {
  // Bug 27 — whitelist view before dispatch; fall back to 'home' on anything else.
  const VALID_VIEWS = ['home', 'editor', 'create', 'reel', 'storypilot'];
  const raw = e.state && e.state.view;
  const view = VALID_VIEWS.includes(raw) ? raw : 'home';
  if (view !== 'home' && typeof loadEditorScripts === 'function' && !window._editorScriptsLoaded) {
    loadEditorScripts(function() { navigateTo(view, false); });
  } else {
    navigateTo(view, false);
  }
});

// Set initial state
history.replaceState({ view: 'home' }, '', location.hash || '#home');
// metaphor-plan.md Exception 3 — initial data-section (navigateTo sets it on
// subsequent transitions; this covers the first paint before any route change).
(function(){
  var initial = (location.hash || '#home').replace('#','');
  document.documentElement.setAttribute('data-section',
    initial === 'home'       ? 'landing'    :
    initial === 'create'     ? 'copilot'    :
    initial === 'reel'       ? 'autopilot'  :
    initial === 'storypilot' ? 'storypilot' : 'editor');
})();

// ── Theme toggle (dark ↔ light) ──────────────────────────────────────
// metaphor-plan.md §3 localStorage contract: key 'stori_theme_mode'.
// data-theme is already set pre-paint by the FOUC script in index.html
// <head>. These handlers just flip + persist on click.
(function(){
  function applyTheme(mode){
    document.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem('stori_theme_mode', mode); } catch(e){}
    // Bug 24 — re-sync wavesurfer colors. typeof guard: 13-wavesurfer.js lazy-loaded.
    try { if (typeof updateWavesurferTheme === 'function') updateWavesurferTheme(mode); } catch(_){}
    // Re-sync BGM canvas waveform color to theme
    try { if (typeof drawBgmWaveform === 'function') drawBgmWaveform(); } catch(_){}
  }
  function toggleTheme(){
    var cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  }
  // Delegate: any .theme-toggle button anywhere flips the theme.
  document.addEventListener('click', function(e){
    var btn = e.target.closest && e.target.closest('.theme-toggle');
    if (btn) { e.preventDefault(); toggleTheme(); }
  });
  // Expose for keyboard shortcut / programmatic use if needed.
  window.storiToggleTheme = toggleTheme;
})();

// ── Keyboard Shortcuts ──
document.addEventListener('keydown', (e) => {
  const _activeTag = (document.activeElement && document.activeElement.tagName) || '';
  // Cmd/Ctrl + S: Save project
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    if (currentView === 'editor' && typeof saveProject === 'function') {
      saveProject();
    } else if (currentView === 'create' && typeof saveCreateProject === 'function') {
      saveCreateProject();
    } else if (currentView === 'reel' && typeof saveReelProject === 'function') {
      saveReelProject();
    }
  }
  // Space: Play/pause (when not in input/textarea)
  if (e.key === ' ' && !['INPUT', 'TEXTAREA'].includes(_activeTag)) {
    e.preventDefault();
    if (currentView === 'editor' && wavesurfer) {
      if (wavesurfer.isPlaying()) wavesurfer.pause();
      else wavesurfer.play();
    } else if (currentView === 'reel' && typeof toggleReelPlayback === 'function') {
      toggleReelPlayback();
    }
  }
  // Escape: Close overlays
  if (e.key === 'Escape') {
    const imagePreviewOverlay = $('image-preview-overlay');
    if (imagePreviewOverlay && imagePreviewOverlay.classList.contains('visible')) {
      imagePreviewOverlay.classList.remove('visible');
    }
    const previewOverlay = $('preview-overlay');
    if (previewOverlay && previewOverlay.classList.contains('visible')) {
      previewOverlay.classList.remove('visible');
    }
  }
  // ?: Show shortcuts help (future implementation)
  if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(_activeTag)) {
    // Placeholder for shortcuts help modal
  }
});

// ── Celebration Toast ──
function showCelebrationToast(msg) {
  let toast = $('celebration-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'celebration-toast';
    toast.className = 'celebration-toast';
    toast.innerHTML = '<span class="celebration-icon">✓</span> <span class="celebration-msg"></span>';
    document.body.appendChild(toast);
  }
  const msgEl = toast.querySelector('.celebration-msg');
  if (msgEl) msgEl.textContent = msg || 'Your story is ready!';
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.classList.remove('visible'); }, 4000);
}

// ── Agent Completion Detection ──
function checkAgentsComplete(agentPanelId) {
  const panel = document.getElementById(agentPanelId);
  if (!panel) return;
  const agentRows = panel.querySelectorAll('.agent-status-dot');
  let allDone = true;
  let anyRunning = false;
  for (const dot of agentRows) {
    if (dot.classList.contains('running')) {
      allDone = false;
      anyRunning = true;
    }
    if (dot.classList.contains('waiting') || dot.classList.contains('error')) {
      allDone = false;
    }
  }
  if (allDone && !anyRunning && !panel.dataset.celebrated) {
    panel.dataset.celebrated = 'true';
    panel.classList.add('agents-complete');
    showCelebrationToast('Your story is ready!');
    // Trigger staggered image reveal if applicable
    const sceneGrid = panel.closest('#create-page')?.querySelector('.scene-grid') || 
                       panel.closest('#reel-page')?.querySelector('.reel-scene-grid');
    if (sceneGrid) {
      const imgs = sceneGrid.querySelectorAll('img');
      imgs.forEach((img, i) => {
        img.style.opacity = '0';
        img.style.filter = 'blur(8px)';
        img.style.transform = 'scale(0.95)';
        setTimeout(() => {
          img.style.transition = 'opacity 0.5s, filter 0.5s, transform 0.5s';
          img.style.opacity = '1';
          img.style.filter = 'blur(0)';
          img.style.transform = 'scale(1)';
        }, i * 100);
      });
    }
    setTimeout(() => { panel.classList.remove('agents-complete'); }, 2000);
  }
}

