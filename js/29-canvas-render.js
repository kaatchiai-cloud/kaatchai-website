// ══════════════════════════════════════════════════════════════════════════
//  CANVAS GRAPH RENDERER — greenfield rebuild (LAYOUT_VERSION = 8)
//
//  Sections:
//    1  Constants
//    2  Singleton state
//    3  DOM build
//    4  Tokens & color helpers
//    5  Layout
//    6  Rendering (nodes, trays, thumb strips, chrome nodes)
//    7  Curves (active-path edges)
//    8  Pan / zoom / fit / panToColumn
//    9  Interactions (mouse / key / drag / select / marquee)
//   10  Context menu + selection toolbar
//   11  Marquee select
//   12  Floating chrome wiring (top-pill, zoom dock, telemetry, progress)
//   13  Canonical *Actions registration
//   14  Mirror state to legacy fields + persistence
//   15  Public API export
//
//  Authority: devDoc/greenfield-rebuild-plan.md.
//  Anti-patterns NOT carried over: cursor-mode default 'select',
//    .cg-actions-col, .cg-img-actions, .cg-toolbar, .cg-bottom-pane,
//    hardcoded hex curve strokes, dual selection-glow, .cg-band-warn-chip.
// ══════════════════════════════════════════════════════════════════════════
(function () {
'use strict';

// ════ SECTION 1 — Constants ════════════════════════════════════════════════

const CANVAS_LAYOUT_VERSION = 8;          // bumped per ADR-3
const CANVAS_RENDERER_VERSION = '8.0';

// Node sizes (graph-space, pre-zoom). SB and IMG match heights so they read as
// peers in the same band. Heights are applied inline via node.style.height so
// the textarea / image preview fill the card body.
const NODE_W      = 520;
const SB_H        = 480;
const IMG_H       = 480;
const VID_H       = 420;
// Chrome cards (singletons) — sized so internal text matches the left agent
// panel's on-screen size at zoom 25%. Steppers/buttons are ~56px graph-space
// (= ~14px on-screen at 25%); cards bumped to fit.
const BGM_W       = 720;
const BGM_H       = 820;
const SUB_W       = 720;
const SUB_H       = 900;       // 4 stepper rows for full subtitle option set
const FINAL_W     = 720;
const FINAL_H     = 820;
const LAUNCH_W    = 200;
const LAUNCH_H    = 110;
const NSETUP_W    = 320;
const NSETUP_H    = 360;
const BIBLE_W     = 380;
const BIBLE_H     = 460;

// Layout grid (X positions). 260px gap. NODE_W=520, LAUNCH_W=200, BGM/SUB/FINAL_W=720.
const COL_SB         = 80;
const COL_IMG        = 860;    // 80 + 520 + 260
const COL_LAUNCH     = 1640;   // 860 + 520 + 260
const COL_VID        = 2100;   // 1640 + 200 + 260
const COL_FINAL_ANIM = 3180;   // 2100 + 520 + 560  (wide gap for aesthetics)
const COL_FINAL_ILL  = 1940;   // 860 + 520 + 560   (wide gap for aesthetics)
const COL_NSETUP     = -440;   // free-floating, left of bands (NSETUP_W=320 → bg ends at -120)
const COL_BIBLE      = -880;   // bible chrome node, left of narrator-setup

// Spacing
const ROW_GAP   = 60;
const BAND_PAD  = 30;
const TOP_PAD   = 40;
const SAFE_PAD  = 60;             // safe-area inside wrapper for fitToView

// Variant tray geometry. Thumbs are big enough to recognise the image at a glance.
const THUMB_W       = 240;
const THUMB_H       = 135;    // ~16:9 at the new width
const THUMB_GAP     = 10;
const THUMB_PAD     = 14;
const THUMBS_PER_ROW = 2;     // wider thumbs → fewer per row
const STRIP_GAP_TOP = 8;          // gap between active card bottom and strip top
const TRAY_PAD_X    = 16;
const TRAY_PAD_TOP  = 16;
const TRAY_PAD_BTM  = 16;

// Misc
const ZOOM_MIN = 0.10;        // bird's-eye view at 10%
const ZOOM_MAX = 2.5;
const SAVE_DEBOUNCE_MS = 700;

// Status → curve dash
const PENDING_STATUSES = new Set(['pending', 'generating', 'polling', 'submitted']);

// ════ SECTION 2 — Singleton state ══════════════════════════════════════════

let g = null;

function freshGraphState() {
  return {
    containerId: '',
    container: null,
    wrapperEl: null,
    graphLayerEl: null,
    svgEl: null,
    rightPaneEl: null,

    scenes: null,
    sortedScenes: [],
    mode: 'illustrated',
    geminiKey: '',
    job: null,

    zoom: 1.0,
    panX: 0,
    panY: 0,
    graphW: 0,
    graphH: 0,
    chromeMidY: 0,          // Y centre for chrome nodes; written by runLayout

    selectedId: null,
    selectedIds: new Set(),
    hoveredNodeId: null,

    // drag / pan / marquee state
    spaceHeld: false,
    isPanning: false,
    panStart: null,
    dragNodeId: null,
    dragStartPx: null,
    dragStartPos: null,
    marquee: null,                // { startX, startY, curX, curY, el, additive }

    // DOM cache
    nodeEls: new Map(),           // id -> { el, type }
    trayEls: new Map(),           // id -> { el, type }  (img/vid trays + strips)
    videoElCache: new Map(),

    launchEl: null,
    bgmEl: null,
    subEl: null,
    finalEl: null,

    // Two-phase video generation: idle → filling → ready → running → done
    videoPhase: 'idle',

    // Phase 5 — Character filter (session-only)
    characterFilter: { activeIds: new Set(), mode: 'AND', compactView: false },

    // chrome
    cgChrome: null,

    // persistence
    saveTimer: 0,

    // event handlers (for cleanup)
    onKeyDown: null,
    onKeyUp: null,
    onMouseMove: null,
    onMouseUp: null,
    onResize: null,
    onWheel: null,
    onMouseDown: null,
    onClick: null,
    onContextMenu: null,
    onDblClick: null,
    onMouseOver: null,
    onMouseOut: null,

    // context menu
    contextMenuEl: null,
    selToolbarEl: null,
  };
}

// Light convenience
function $(id) { return document.getElementById(id); }

// Format seconds as m:ss (mm:ss for >= 10 min). "0:00" / "0:23" / "1:34".
function fmtTime(sec) {
  if (sec == null || isNaN(sec)) return '0:00';
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + String(s).padStart(2, '0');
}
// "0:23 – 0:34" for a scene with startTime + duration
function fmtSceneTimeRange(scene) {
  const start = scene.startTime || 0;
  const end = start + (scene.duration || 0);
  return fmtTime(start) + ' – ' + fmtTime(end);
}
function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
function svgEl(tag, attrs) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

// ════ SECTION 3 — DOM build ════════════════════════════════════════════════

function buildDOM(container) {
  // Wipe whatever lives inside the mount point
  container.innerHTML = '';
  container.classList.add('cg-mount');

  const wrapper = el('div', 'cg-wrapper');

  const graphLayer = el('div', 'cg-graph-layer', { id: 'graph' });
  graphLayer.style.transformOrigin = '0 0';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'cg-svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  graphLayer.appendChild(svg);

  // Selection toolbar lives INSIDE graph layer (counter-scaled)
  // It is created on-demand when something is selected.

  wrapper.appendChild(graphLayer);

  // Right pane scaffolding (Properties + Preview).  Visual restyle only;
  // body content is appended on demand by selectNode.
  const rightPane = el('aside', 'cg-right-pane');
  rightPane.innerHTML =
    '<header class="cg-rp-head"><span class="cg-rp-title">Properties</span></header>' +
    '<section class="cg-rp-body" id="cg-rp-body"><div class="cg-rp-empty">No selection</div></section>';

  wrapper.appendChild(rightPane);

  container.appendChild(wrapper);

  g.wrapperEl = wrapper;
  g.graphLayerEl = graphLayer;
  g.svgEl = svg;
  g.rightPaneEl = rightPane;
}

// ════ SECTION 4 — Tokens & color helpers ═══════════════════════════════════

function tokenSource() {
  return $('create-canvas-step') || document.documentElement;
}

function getSockColor(type) {
  const v = getComputedStyle(tokenSource()).getPropertyValue('--sock-' + type).trim();
  if (v) return v;
  // fallback if not found
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#888';
}

function getDangerColor() {
  const ts = tokenSource();
  const cs = getComputedStyle(ts);
  return (cs.getPropertyValue('--cg-danger').trim()
       || cs.getPropertyValue('--red').trim()
       || '#c03c3c');
}

// ════ SECTION 5 — Layout ═══════════════════════════════════════════════════

function rowImageTrayHeight(sb) {
  if (!sb) return IMG_H;
  const imgs = sb.imageInstances || [];
  // active card + thumb strip below
  const stripRows = Math.ceil(Math.max(1, imgs.length + 1) / THUMBS_PER_ROW);
  const stripH = stripRows * THUMB_H + (stripRows - 1) * THUMB_GAP + THUMB_PAD * 2;
  return TRAY_PAD_TOP + IMG_H + STRIP_GAP_TOP + stripH + TRAY_PAD_BTM;
}

function rowVideoTrayHeight(scene, activeImgId) {
  if (!activeImgId) return VID_H;
  const list = (scene.videoInstances || []).filter(v => v.sourceImageInstanceId === activeImgId);
  const stripRows = Math.ceil(Math.max(1, list.length + 1) / THUMBS_PER_ROW);
  const stripH = stripRows * THUMB_H + (stripRows - 1) * THUMB_GAP + THUMB_PAD * 2;
  return TRAY_PAD_TOP + VID_H + STRIP_GAP_TOP + stripH + TRAY_PAD_BTM;
}

function ensureLayoutVersion(scene) {
  if (scene._layoutVersion !== CANVAS_LAYOUT_VERSION) {
    scene._layoutVersion = CANVAS_LAYOUT_VERSION;
    // Wipe stale canvasPosition on every instance
    (scene.storyboardInstances || []).forEach(sb => {
      sb.canvasPosition = null;
      (sb.imageInstances || []).forEach(im => { im.canvasPosition = null; });
    });
    (scene.videoInstances || []).forEach(v => { v.canvasPosition = null; });
    return true;
  }
  return false;
}

function runLayout() {
  if (!g || !g.scenes) return;

  // Sort scenes by startTime if available, fallback to original order
  g.sortedScenes = (g.scenes || []).slice().sort((a, b) => {
    const sa = (typeof a.startTime === 'number') ? a.startTime : 0;
    const sb = (typeof b.startTime === 'number') ? b.startTime : 0;
    return sa - sb;
  });

  // Reset stale layout versions wholesale (also clears chrome positions)
  let anyMigrated = false;
  g.scenes.forEach(scene => {
    if (ensureLayoutVersion(scene)) anyMigrated = true;
  });
  if (anyMigrated) {
    if (window.createBgmNodePosition) window.createBgmNodePosition = null;
    if (window.createSubNodePosition) window.createSubNodePosition = null;
    if (window.createFinalRenderPosition) window.createFinalRenderPosition = null;
    if (window.createLaunchAgentPosition) window.createLaunchAgentPosition = null;
  }

  // Walk scenes top-down and assign positions
  let curY = TOP_PAD;
  g.sortedScenes.forEach((scene, idx) => {
    const sb = (scene.storyboardInstances || []).find(s => s.isActive)
            || (scene.storyboardInstances || [])[0];
    const activeImg = sb && (sb.imageInstances || []).find(i => i.isRenderActive)
                     || (sb && (sb.imageInstances || [])[0]);

    const imgTrayH = sb ? rowImageTrayHeight(sb) : IMG_H;
    const vidTrayH = (g.mode === 'animated') ? rowVideoTrayHeight(scene, activeImg?.id) : 0;
    const bandH = BAND_PAD * 2 + Math.max(SB_H, imgTrayH, vidTrayH);

    const bandTop = curY;
    const innerTop = bandTop + BAND_PAD;

    // SB: X is user-preserved; Y is always canonical to the band row
    if (sb) {
      if (!sb.canvasPosition) sb.canvasPosition = { x: COL_SB, y: innerTop };
      sb.canvasPosition.y = innerTop;
      if (typeof sb.canvasPosition.x !== 'number') sb.canvasPosition.x = COL_SB;

      // Position images — X preserved, Y always canonical
      (sb.imageInstances || []).forEach(im => {
        if (!im.canvasPosition) im.canvasPosition = { x: COL_IMG, y: innerTop };
        im.canvasPosition.y = innerTop;
        if (typeof im.canvasPosition.x !== 'number') im.canvasPosition.x = COL_IMG;
      });
    }

    // Videos — X preserved, Y always canonical
    (scene.videoInstances || []).forEach(v => {
      if (!v.canvasPosition) v.canvasPosition = { x: COL_VID, y: innerTop };
      v.canvasPosition.y = innerTop;
      if (typeof v.canvasPosition.x !== 'number') v.canvasPosition.x = COL_VID;
    });

    scene._bandTop = bandTop;
    scene._bandHeight = bandH;
    scene._innerTop = innerTop;

    curY = bandTop + bandH + ROW_GAP;
  });

  g.graphH = Math.max(curY + 80, 600);

  // Chrome node positions
  const midY = Math.max(TOP_PAD + 40, g.graphH / 2 - 60);
  g.chromeMidY = midY;      // stored so render fallbacks can use it

  // Launch (animated only): between IMG and VID
  if (g.mode === 'animated') {
    if (!window.createLaunchAgentPosition) {
      window.createLaunchAgentPosition = { x: COL_LAUNCH, y: midY - LAUNCH_H / 2 };
    }
  }

  const colFinal = (g.mode === 'animated') ? COL_FINAL_ANIM : COL_FINAL_ILL;
  if (!window.createFinalRenderPosition) {
    window.createFinalRenderPosition = { x: colFinal, y: midY - FINAL_H / 2 };
  }

  g.graphW = colFinal + FINAL_W + 80;
}

function tidyLayout() {
  if (!g) return;
  // Wipe positions and re-run layout
  (g.scenes || []).forEach(scene => {
    (scene.storyboardInstances || []).forEach(sb => {
      sb.canvasPosition = null;
      (sb.imageInstances || []).forEach(im => { im.canvasPosition = null; });
    });
    (scene.videoInstances || []).forEach(v => { v.canvasPosition = null; });
  });
  window.createFinalRenderPosition = null;
  window.createLaunchAgentPosition = null;
  runLayout();
  renderAll();
  triggerSave();
}

// ════ SECTION 6 — Rendering ════════════════════════════════════════════════

function findInstance(id) {
  if (!id || !g || !g.scenes) return null;
  for (let s = 0; s < g.scenes.length; s++) {
    const scene = g.scenes[s];
    const sbs = scene.storyboardInstances || [];
    for (let b = 0; b < sbs.length; b++) {
      const sb = sbs[b];
      if (sb.id === id) return { type: 'sb', scene, sceneIdx: s, sb };
      const imgs = sb.imageInstances || [];
      for (let k = 0; k < imgs.length; k++) {
        const im = imgs[k];
        if (im.id === id) return { type: 'img', scene, sceneIdx: s, sb, img: im };
      }
    }
    const vids = scene.videoInstances || [];
    for (let v = 0; v < vids.length; v++) {
      const vi = vids[v];
      if (vi.id === id) return { type: 'vid', scene, sceneIdx: s, vid: vi };
    }
  }
  if (id === 'cg-launch') return { type: 'launch' };
  if (id === 'cg-bgm') return { type: 'bgm' };
  if (id === 'cg-sub') return { type: 'sub' };
  if (id === 'cg-final') return { type: 'final' };
  if (id === 'cg-narrator-setup') return { type: 'narratorSetup' };
  if (id === 'cg-bible') return { type: 'bible' };
  return null;
}

function placeNode(elNode, x, y) {
  if (!elNode) return;
  elNode.style.left = x + 'px';
  elNode.style.top  = y + 'px';
}

// Phase 5 — character filter predicate
function isSceneFilteredOut(scene) {
  if (!g || !g.characterFilter) return false;
  const f = g.characterFilter;
  if (f.activeIds.size === 0) return false;
  const inScene = new Set(scene.refCharacters || []);
  if (f.mode === 'AND') {
    for (const id of f.activeIds) if (!inScene.has(id)) return true;
    return false;
  }
  // OR mode
  for (const id of f.activeIds) if (inScene.has(id)) return false;
  return true;
}

function applyFilterToNode(nodeEl, sceneOrNull) {
  if (!nodeEl) return;
  const dimmed = !!(sceneOrNull && isSceneFilteredOut(sceneOrNull));
  nodeEl.classList.toggle('cg-node--dimmed', dimmed);
}

function ensureNode(id, type, buildFn) {
  let cached = g.nodeEls.get(id);
  if (cached && cached.el && cached.el.isConnected) return cached.el;
  const node = buildFn();
  node.dataset.id = id;
  node.dataset.type = type;
  g.graphLayerEl.appendChild(node);
  g.nodeEls.set(id, { el: node, type });
  return node;
}

// ─── SB node ────────────────────────────────────────────────────────────────
function buildSBNode(scene, sbIdx) {
  const node = el('div', 'cg-node cg-node--sb');
  node.style.width = NODE_W + 'px';
  node.style.height = SB_H + 'px';

  // Time label — its own full-width banner BEFORE the head. No flex competition.
  const timeBanner = el('div', 'cg-time-banner', { 'data-role': 'time-banner' });
  timeBanner.textContent = '0:00 – 0:00';
  node.appendChild(timeBanner);

  const head = el('div', 'cg-node-head cg-drag-handle');
  head.innerHTML =
    '<span class="cg-head-dot" data-sock="script"></span>' +
    '<div class="cg-tabs" data-role="sb-tabs"></div>';
  node.appendChild(head);

  // sockets
  node.appendChild(el('span', 'cg-sock cg-sock--in cg-sock--script'));
  node.appendChild(el('span', 'cg-sock cg-sock--out cg-sock--script'));

  // status dot
  const dot = el('span', 'cg-status-dot', { 'data-role': 'status-dot' });
  node.appendChild(dot);

  const body = el('div', 'cg-node-body');
  body.innerHTML =
    '<textarea class="cg-prompt" rows="3" placeholder="Storyboard prompt…"></textarea>' +
    '<input type="file" class="cg-sb-ref-input" accept="image/*" hidden>' +
    '<div class="cg-stepper-row">' +
      '<div class="cg-stepper" data-field="duration">' +
        '<button type="button" class="cg-arr cg-arr-l" aria-label="decrease">◀</button>' +
        '<span class="cg-val"></span>' +
        '<button type="button" class="cg-arr cg-arr-r" aria-label="increase">▶</button>' +
      '</div>' +
      '<div class="cg-stepper" data-field="style">' +
        '<button type="button" class="cg-arr cg-arr-l" aria-label="decrease">◀</button>' +
        '<span class="cg-val"></span>' +
        '<button type="button" class="cg-arr cg-arr-r" aria-label="increase">▶</button>' +
      '</div>' +
    '</div>' +
    '<div class="cg-voice-chip" data-role="voice-chip" hidden></div>';
  node.appendChild(body);

  return node;
}

function updateSBNode(node, scene, sb, sceneIdx) {
  const sbs = scene.storyboardInstances || [];

  // Tabs
  const tabsEl = node.querySelector('.cg-tabs');
  if (tabsEl) {
    const tabsHtml = sbs.map((s, i) => {
      const letter = String.fromCharCode(65 + i);
      const active = s.isActive ? ' active' : '';
      return `<button type="button" class="cg-tab${active}" data-sb-id="${s.id}">${letter}</button>`;
    }).join('') + '<button type="button" class="cg-tab cg-tab--add" data-role="sb-add">+</button>';
    if (tabsEl.dataset._sig !== tabsHtml) {
      tabsEl.innerHTML = tabsHtml;
      tabsEl.dataset._sig = tabsHtml;
    }
  }

  // Time banner — full-width row above the head. Can't be flex-squished.
  const banner = node.querySelector('[data-role="time-banner"]');
  if (banner) banner.textContent = fmtSceneTimeRange(scene);

  // Prompt
  const ta = node.querySelector('.cg-prompt');
  if (ta && document.activeElement !== ta) {
    ta.value = sb.prompt || '';
  }

  // Status dot — derive from any imageInstance status (running > error > done > pending)
  const dot = node.querySelector('[data-role="status-dot"]');
  if (dot) {
    const imgs = sb.imageInstances || [];
    let st = 'pending';
    if (imgs.some(i => i.status === 'generating' || i.status === 'polling' || i.status === 'submitted')) st = 'running';
    else if (imgs.some(i => i.status === 'error')) st = 'error';
    else if (imgs.length > 0 && imgs.every(i => i.status === 'done')) st = 'done';
    dot.className = 'cg-status-dot cg-status-dot--' + st;
  }

  // Steppers
  const dur = node.querySelector('.cg-stepper[data-field="duration"] .cg-val');
  if (dur) dur.textContent = (typeof scene.duration === 'number' ? scene.duration.toFixed(1) : '6.0') + 's';
  const sty = node.querySelector('.cg-stepper[data-field="style"] .cg-val');
  if (sty) sty.textContent = (window.createStylePreset || 'preset');

  // Voice chip — read-only display of speaker + voice for dialogue scenes.
  // Click deep-links to cast panel (voice editing happens there per plan §17).
  // Lip sync status (Tier 1 / Tier 2 / failed / stale) surfaces as a small
  // badge inside the chip.
  const voiceChip = node.querySelector('[data-role="voice-chip"]');
  if (voiceChip) {
    const dlg = (Array.isArray(scene.dialogueLines) && scene.dialogueLines[0]) || scene.dialogue || null;
    const ls = scene.lipSync;
    const showChip = !!(dlg && dlg.speakerCharacterId && dlg.speakerCharacterId !== 'narrator');
    if (!showChip) {
      voiceChip.hidden = true;
      voiceChip.innerHTML = '';
    } else {
      const cs = window.createJobState || {};
      const all = [
        ...(cs.characters || []),
        cs.presenter, cs.setting,
      ].filter(Boolean);
      const speaker = all.find(c => c.id === dlg.speakerCharacterId);
      const voiceName = speaker && speaker.voice && speaker.voice.voiceName
        ? speaker.voice.voiceName
        : (speaker && speaker.voice && speaker.voice.voiceId ? speaker.voice.voiceId : '—');
      const speakerName = (speaker && speaker.name) || dlg.speakerName || 'speaker';
      // Lip sync status badge
      let badge = '';
      if (ls) {
        if (ls.tier === 'kling' && ls.status === 'ready') {
          badge = '<span class="cg-voice-badge cg-voice-badge-ok" title="AI sync ready">✓ AI</span>';
        } else if (ls.tier === 'stori' && ls.status === 'ready') {
          badge = '<span class="cg-voice-badge cg-voice-badge-ok" title="Stori sync ready">✓ Stori</span>';
        } else if (ls.tier === 'failed' || ls.status === 'error') {
          badge = '<span class="cg-voice-badge cg-voice-badge-err" title="' + (ls.lastError || 'sync failed') + '">⚠ failed</span>';
        } else if (ls.status === 'stale') {
          badge = '<span class="cg-voice-badge cg-voice-badge-stale" title="audio changed since last sync">⚠ stale</span>';
        } else if (ls.status === 'syncing' || ls.status === 'pending') {
          badge = '<span class="cg-voice-badge cg-voice-badge-busy">⏳ syncing</span>';
        }
      }
      const voiceOver = (dlg && dlg.isVoiceOver) || (scene.speakerVisible === false);
      const voSuffix = voiceOver ? ' · voice-over' : '';
      const html =
        '<span class="cg-voice-icon">🎙️</span>' +
        '<span class="cg-voice-text">' +
          '<strong>' + speakerName.replace(/</g, '&lt;') + '</strong> · ' +
          voiceName.replace(/</g, '&lt;') + voSuffix +
        '</span>' +
        badge +
        '<button type="button" class="cg-voice-edit" data-action="edit-voice-in-cast" data-character-id="' + dlg.speakerCharacterId + '" title="Edit voice in cast panel">↗</button>';
      if (voiceChip.dataset._sig !== html) {
        voiceChip.innerHTML = html;
        voiceChip.dataset._sig = html;
      }
      voiceChip.hidden = false;
    }
  }

  // Selection
  if (g.selectedIds.has(sb.id)) node.classList.add('cg-node-selected');
  else node.classList.remove('cg-node-selected');

  applyFilterToNode(node, scene);
}

// ─── IMG node ──────────────────────────────────────────────────────────────
function buildImgNode() {
  const node = el('div', 'cg-node cg-node--img');
  node.style.width = NODE_W + 'px';
  node.style.height = IMG_H + 'px';

  const timeBanner = el('div', 'cg-time-banner', { 'data-role': 'time-banner' });
  timeBanner.textContent = '0:00 – 0:00';
  node.appendChild(timeBanner);

  const head = el('div', 'cg-node-head cg-drag-handle');
  head.innerHTML =
    '<span class="cg-head-dot" data-sock="image"></span>' +
    '<span class="cg-node-title">Img —</span>';
  node.appendChild(head);

  node.appendChild(el('span', 'cg-sock cg-sock--in cg-sock--image'));
  node.appendChild(el('span', 'cg-sock cg-sock--out cg-sock--image'));
  node.appendChild(el('span', 'cg-status-dot', { 'data-role': 'status-dot' }));
  node.appendChild(el('span', 'cg-variant-pin', { 'data-role': 'variant-pin' }));

  const body = el('div', 'cg-node-body');
  body.innerHTML =
    '<div class="cg-img-preview" data-role="preview"><span class="cg-img-empty">[render]</span></div>' +
    '<div class="cg-stepper-row">' +
      '<div class="cg-stepper" data-field="ratio">' +
        '<button type="button" class="cg-arr cg-arr-l">◀</button>' +
        '<span class="cg-val">16:9</span>' +
        '<button type="button" class="cg-arr cg-arr-r">▶</button>' +
      '</div>' +
      '<div class="cg-stepper" data-field="seed">' +
        '<button type="button" class="cg-arr cg-arr-l">◀</button>' +
        '<span class="cg-val">seed —</span>' +
        '<button type="button" class="cg-arr cg-arr-r">▶</button>' +
      '</div>' +
    '</div>';
  node.appendChild(body);

  return node;
}

function updateImgNode(node, scene, sceneIdx, sb, img) {
  const tabLetter = String.fromCharCode(65 + (sb ? (scene.storyboardInstances || []).indexOf(sb) : 0));
  const imgIdx = sb ? (sb.imageInstances || []).indexOf(img) : 0;

  const banner = node.querySelector('[data-role="time-banner"]');
  if (banner) banner.textContent = fmtSceneTimeRange(scene);

  // Preview
  const preview = node.querySelector('[data-role="preview"]');
  if (preview) {
    if (img.imgDataUrl) {
      preview.style.backgroundImage = `url("${img.imgDataUrl}")`;
      preview.classList.add('has-image');
      const empty = preview.querySelector('.cg-img-empty');
      if (empty) empty.remove();
    } else {
      preview.style.backgroundImage = '';
      preview.classList.remove('has-image');
      if (!preview.querySelector('.cg-img-empty')) {
        const e = el('span', 'cg-img-empty');
        e.textContent = img.status === 'generating' ? 'generating…' : (img.status === 'error' ? 'error' : 'pending');
        preview.appendChild(e);
      } else {
        preview.querySelector('.cg-img-empty').textContent =
          img.status === 'generating' ? 'generating…' : (img.status === 'error' ? 'error' : 'pending');
      }
    }
  }

  // Status dot
  const dot = node.querySelector('[data-role="status-dot"]');
  if (dot) {
    const map = { done: 'done', generating: 'running', polling: 'running', submitted: 'running', pending: 'pending', error: 'error' };
    dot.className = 'cg-status-dot cg-status-dot--' + (map[img.status] || 'pending');
  }

  // ACTIVE pill
  const pin = node.querySelector('[data-role="variant-pin"]');
  if (pin) {
    if (img.isRenderActive) {
      pin.textContent = 'ACTIVE';
      pin.style.display = '';
    } else if (img.isActive) {
      pin.textContent = '★';
      pin.style.display = '';
    } else {
      pin.style.display = 'none';
    }
  }

  // Steppers (DOM only; values derived from scene fields if present)
  const seedVal = node.querySelector('.cg-stepper[data-field="seed"] .cg-val');
  if (seedVal) seedVal.textContent = (img.seed != null ? `seed ${img.seed}` : 'seed —');
  const ratioVal = node.querySelector('.cg-stepper[data-field="ratio"] .cg-val');
  if (ratioVal) ratioVal.textContent = (scene.aspect || '16:9');

  if (g.selectedIds.has(img.id)) node.classList.add('cg-node-selected');
  else node.classList.remove('cg-node-selected');

  applyFilterToNode(node, scene);
}

// ─── VID node ──────────────────────────────────────────────────────────────
function buildVidNode() {
  const node = el('div', 'cg-node cg-node--vid');
  node.style.width = NODE_W + 'px';

  const timeBanner = el('div', 'cg-time-banner', { 'data-role': 'time-banner' });
  timeBanner.textContent = '0:00 – 0:00';
  node.appendChild(timeBanner);

  const head = el('div', 'cg-node-head cg-drag-handle');
  head.innerHTML =
    '<span class="cg-head-dot" data-sock="video"></span>' +
    '<span class="cg-node-title">Vid —</span>';
  node.appendChild(head);

  node.appendChild(el('span', 'cg-sock cg-sock--in cg-sock--video'));
  node.appendChild(el('span', 'cg-sock cg-sock--out cg-sock--video'));
  node.appendChild(el('span', 'cg-status-dot', { 'data-role': 'status-dot' }));
  node.appendChild(el('span', 'cg-variant-pin', { 'data-role': 'variant-pin' }));

  const body = el('div', 'cg-node-body');
  body.innerHTML =
    '<div class="cg-vid-preview" data-role="preview"><span class="cg-vid-play" aria-hidden="true">▶</span></div>' +
    '<div class="cg-stepper-row">' +
      '<div class="cg-stepper" data-field="duration">' +
        '<button type="button" class="cg-arr cg-arr-l">◀</button>' +
        '<span class="cg-val">5.0s</span>' +
        '<button type="button" class="cg-arr cg-arr-r">▶</button>' +
      '</div>' +
      '<div class="cg-stepper" data-field="model">' +
        '<button type="button" class="cg-arr cg-arr-l">◀</button>' +
        '<span class="cg-val">veo3</span>' +
        '<button type="button" class="cg-arr cg-arr-r">▶</button>' +
      '</div>' +
    '</div>';
  node.appendChild(body);

  return node;
}

function updateVidNode(node, scene, sceneIdx, sb, srcImg, vid) {
  const tabLetter = String.fromCharCode(65 + (sb ? (scene.storyboardInstances || []).indexOf(sb) : 0));
  const srcIdx = sb && srcImg ? (sb.imageInstances || []).indexOf(srcImg) : 0;
  const vidIdx = (scene.videoInstances || []).indexOf(vid);

  const banner = node.querySelector('[data-role="time-banner"]');
  if (banner) banner.textContent = fmtSceneTimeRange(scene);

  const preview = node.querySelector('[data-role="preview"]');
  if (preview) {
    const url = (vid.clips && vid.clips[0] && vid.clips[0].url) || null;
    if (url) {
      // poster from source image
      if (srcImg && srcImg.imgDataUrl) {
        preview.style.backgroundImage = `url("${srcImg.imgDataUrl}")`;
      }
      preview.classList.add('has-video');
    } else {
      preview.classList.remove('has-video');
      preview.style.backgroundImage = '';
    }
  }

  const dot = node.querySelector('[data-role="status-dot"]');
  if (dot) {
    const map = { done: 'done', generating: 'running', polling: 'running', submitted: 'running', pending: 'pending', error: 'error' };
    dot.className = 'cg-status-dot cg-status-dot--' + (map[vid.status] || 'pending');
  }

  const pin = node.querySelector('[data-role="variant-pin"]');
  if (pin) pin.style.display = vid.isRenderActive ? '' : 'none';
  if (pin && vid.isRenderActive) pin.textContent = 'ACTIVE';

  const dur = node.querySelector('.cg-stepper[data-field="duration"] .cg-val');
  if (dur) dur.textContent = ((vid.duration || scene.duration || 5).toFixed(1)) + 's';

  if (g.selectedIds.has(vid.id)) node.classList.add('cg-node-selected');
  else node.classList.remove('cg-node-selected');

  applyFilterToNode(node, scene);
}

// ─── Variant tray + thumb strip ────────────────────────────────────────────
function ensureImgVariantTray(scene, sceneIdx, sb) {
  if (!sb) return;
  const trayId = `tray-img-${sb.id}`;
  let entry = g.trayEls.get(trayId);
  let tray;
  if (entry && entry.el && entry.el.isConnected) {
    tray = entry.el;
  } else {
    tray = el('div', 'cg-variant-tray cg-variant-tray--img');
    tray.dataset.id = trayId;
    tray.innerHTML =
      '<span class="cg-tray-label" data-role="label"></span>' +
      '<div class="cg-thumb-strip" data-role="strip"></div>';
    g.graphLayerEl.appendChild(tray);
    g.trayEls.set(trayId, { el: tray, type: 'img' });
  }

  // Position tray to wrap active img card
  const activeImg = (sb.imageInstances || []).find(i => i.isRenderActive)
                 || (sb.imageInstances || [])[0];
  const x = (activeImg?.canvasPosition?.x ?? COL_IMG) - TRAY_PAD_X;
  const y = (activeImg && activeImg.canvasPosition && typeof activeImg.canvasPosition.y === 'number')
            ? activeImg.canvasPosition.y - TRAY_PAD_TOP
            : (sb.canvasPosition?.y ?? scene._innerTop ?? TOP_PAD) - TRAY_PAD_TOP;
  const trayW = NODE_W + TRAY_PAD_X * 2;
  const trayH = rowImageTrayHeight(sb);
  tray.style.left = x + 'px';
  tray.style.top = y + 'px';
  tray.style.width = trayW + 'px';
  tray.style.height = trayH + 'px';

  const tabLetter = String.fromCharCode(65 + (scene.storyboardInstances || []).indexOf(sb));
  const label = tray.querySelector('[data-role="label"]');
  if (label) label.textContent = `Img ${sceneIdx + 1}.${tabLetter} · ${(sb.imageInstances || []).length} variants`;

  // Strip below the active card
  const strip = tray.querySelector('[data-role="strip"]');
  if (strip) {
    const stripTop = (activeImg && activeImg.canvasPosition && typeof activeImg.canvasPosition.y === 'number')
                     ? activeImg.canvasPosition.y - y + IMG_H + STRIP_GAP_TOP
                     : TRAY_PAD_TOP + IMG_H + STRIP_GAP_TOP;
    strip.style.top = stripTop + 'px';
    strip.style.left = TRAY_PAD_X + 'px';
    strip.style.width = NODE_W + 'px';

    // Build thumbs
    const sig = (sb.imageInstances || []).map(i => `${i.id}:${i.isRenderActive ? '1' : '0'}:${i.imgDataUrl ? '1' : '0'}:${i.status}`).join('|') + '|m=' + g.mode;
    if (strip.dataset._sig !== sig) {
      strip.dataset._sig = sig;
      strip.innerHTML = '';
      (sb.imageInstances || []).forEach(im => {
        const t = el('button', 'cg-thumb', { type: 'button', 'data-img-id': im.id });
        if (im.isRenderActive) t.classList.add('is-active');
        const vidCount = (scene.videoInstances || []).filter(v => v.sourceImageInstanceId === im.id).length;
        if (vidCount > 0) t.classList.add('has-vids');
        if (im.imgDataUrl) {
          t.style.backgroundImage = `url("${im.imgDataUrl}")`;
        } else {
          t.classList.add('cg-thumb--placeholder');
        }
        const idxLabel = el('span', 'cg-thumb-idx');
        idxLabel.textContent = String((sb.imageInstances || []).indexOf(im) + 1);
        t.appendChild(idxLabel);
        if (vidCount > 0) {
          const badge = el('span', 'cg-vid-badge');
          badge.textContent = '▶' + vidCount;
          t.appendChild(badge);
        }
        strip.appendChild(t);
      });
      const add = el('button', 'cg-thumb cg-thumb--add', { type: 'button', 'data-role': 'add-img', 'aria-label': 'Add image variant' });
      add.innerHTML = '<span class="cg-thumb-add-icon">+</span>';
      strip.appendChild(add);
    }
  }
}

function ensureVidVariantTray(scene, sceneIdx, sb, activeImg) {
  if (g.mode !== 'animated') return;
  if (!activeImg) return;
  const trayId = `tray-vid-${activeImg.id}`;
  let entry = g.trayEls.get(trayId);
  let tray;
  if (entry && entry.el && entry.el.isConnected) {
    tray = entry.el;
  } else {
    tray = el('div', 'cg-variant-tray cg-variant-tray--vid');
    tray.dataset.id = trayId;
    tray.innerHTML =
      '<span class="cg-tray-label" data-role="label"></span>' +
      '<div class="cg-thumb-strip" data-role="strip"></div>';
    g.graphLayerEl.appendChild(tray);
    g.trayEls.set(trayId, { el: tray, type: 'vid' });
  }

  const list = (scene.videoInstances || []).filter(v => v.sourceImageInstanceId === activeImg.id);
  const renderActive = list.find(v => v.isRenderActive) || list[0];
  const trayW = NODE_W + TRAY_PAD_X * 2;
  // Compute height locally
  const stripRows = Math.ceil(Math.max(1, list.length + 1) / THUMBS_PER_ROW);
  const stripH = stripRows * THUMB_H + (stripRows - 1) * THUMB_GAP + THUMB_PAD * 2;
  const trayH = TRAY_PAD_TOP + VID_H + STRIP_GAP_TOP + stripH + TRAY_PAD_BTM;

  const baseY = (renderActive && renderActive.canvasPosition && typeof renderActive.canvasPosition.y === 'number')
                ? renderActive.canvasPosition.y - TRAY_PAD_TOP
                : (scene._innerTop ?? TOP_PAD) - TRAY_PAD_TOP;
  const baseX = (renderActive?.canvasPosition?.x ?? COL_VID) - TRAY_PAD_X;
  tray.style.left = baseX + 'px';
  tray.style.top = baseY + 'px';
  tray.style.width = trayW + 'px';
  tray.style.height = trayH + 'px';

  const tabLetter = String.fromCharCode(65 + (scene.storyboardInstances || []).indexOf(sb));
  const srcIdx = sb ? (sb.imageInstances || []).indexOf(activeImg) : 0;
  const label = tray.querySelector('[data-role="label"]');
  if (label) label.textContent = `Vid ${sceneIdx + 1}.${tabLetter}.${srcIdx + 1} · ${list.length} variant${list.length === 1 ? '' : 's'}`;

  const strip = tray.querySelector('[data-role="strip"]');
  if (strip) {
    const stripTop = (renderActive && renderActive.canvasPosition && typeof renderActive.canvasPosition.y === 'number')
                     ? renderActive.canvasPosition.y - baseY + VID_H + STRIP_GAP_TOP
                     : TRAY_PAD_TOP + VID_H + STRIP_GAP_TOP;
    strip.style.top = stripTop + 'px';
    strip.style.left = TRAY_PAD_X + 'px';
    strip.style.width = NODE_W + 'px';

    const sig = list.map(v => `${v.id}:${v.isRenderActive ? '1' : '0'}:${v.status}`).join('|');
    if (strip.dataset._sig !== sig) {
      strip.dataset._sig = sig;
      strip.innerHTML = '';
      list.forEach(v => {
        const t = el('button', 'cg-thumb cg-thumb--vid', { type: 'button', 'data-vid-id': v.id });
        if (v.isRenderActive) t.classList.add('is-active');
        if (v.clips && v.clips[0] && v.clips[0].url && activeImg.imgDataUrl) {
          t.style.backgroundImage = `url("${activeImg.imgDataUrl}")`;
        } else {
          t.classList.add('cg-thumb--placeholder');
        }
        const play = el('span', 'cg-thumb-play');
        play.textContent = '▶';
        t.appendChild(play);
        strip.appendChild(t);
      });
      const add = el('button', 'cg-thumb cg-thumb--add', { type: 'button', 'data-role': 'add-vid', 'aria-label': 'Add video variant' });
      add.innerHTML = '<span class="cg-thumb-add-icon">+</span>';
      strip.appendChild(add);
    }
  }
}

function pruneStaleTrays() {
  // Build set of valid tray ids based on current data
  const valid = new Set();
  (g.scenes || []).forEach(scene => {
    (scene.storyboardInstances || []).forEach(sb => {
      valid.add(`tray-img-${sb.id}`);
      const activeImg = (sb.imageInstances || []).find(i => i.isRenderActive) || (sb.imageInstances || [])[0];
      if (g.mode === 'animated' && activeImg && sb.isActive) valid.add(`tray-vid-${activeImg.id}`);
    });
  });
  const toRemove = [];
  g.trayEls.forEach((entry, id) => {
    if (!valid.has(id)) toRemove.push(id);
    // Hide non-active SB trays
    if (entry.type === 'img') {
      const sbId = id.slice('tray-img-'.length);
      let isActive = false;
      (g.scenes || []).forEach(scene => {
        const sb = (scene.storyboardInstances || []).find(s => s.id === sbId);
        if (sb && sb.isActive) isActive = true;
      });
      entry.el.style.display = isActive ? '' : 'none';
    }
  });
  toRemove.forEach(id => {
    const entry = g.trayEls.get(id);
    if (entry && entry.el && entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    g.trayEls.delete(id);
  });
}

function pruneStaleNodes() {
  const valid = new Set(['cg-launch', 'cg-bgm', 'cg-sub', 'cg-final']);
  (g.scenes || []).forEach(scene => {
    (scene.storyboardInstances || []).forEach(sb => {
      // Only ACTIVE sb shows as a card
      if (sb.isActive) valid.add(sb.id);
      (sb.imageInstances || []).forEach(im => {
        if (sb.isActive && im.isRenderActive) valid.add(im.id);
      });
    });
    // Active video for animated mode
    if (g.mode === 'animated') {
      const activeSb = (scene.storyboardInstances || []).find(s => s.isActive);
      const activeImg = activeSb && (activeSb.imageInstances || []).find(i => i.isRenderActive);
      if (activeImg) {
        const list = (scene.videoInstances || []).filter(v => v.sourceImageInstanceId === activeImg.id);
        const ra = list.find(v => v.isRenderActive) || list[0];
        if (ra) valid.add(ra.id);
      }
    }
  });
  const toRemove = [];
  g.nodeEls.forEach((entry, id) => { if (!valid.has(id)) toRemove.push(id); });
  toRemove.forEach(id => {
    const entry = g.nodeEls.get(id);
    if (entry && entry.el && entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    g.nodeEls.delete(id);
  });
}

// ─── Chrome nodes (Launch, BGM, Sub, Final) ────────────────────────────────
function buildSimpleNode(cls, sockType, label, opts) {
  opts = opts || {};
  const node = el('div', 'cg-node ' + cls);
  node.style.width = (opts.w || BGM_W) + 'px';
  if (opts.h) node.style.height = opts.h + 'px';
  const head = el('div', 'cg-node-head cg-drag-handle');
  head.innerHTML =
    `<span class="cg-head-dot" data-sock="${sockType}"></span>` +
    `<span class="cg-node-title">${label}</span>`;
  node.appendChild(head);
  if (opts.hasIn !== false)  node.appendChild(el('span', `cg-sock cg-sock--in cg-sock--${sockType}`));
  if (opts.hasOut !== false) node.appendChild(el('span', `cg-sock cg-sock--out cg-sock--${sockType}`));
  node.appendChild(el('span', 'cg-status-dot cg-status-dot--pending', { 'data-role': 'status-dot' }));
  const body = el('div', 'cg-node-body');
  if (opts.bodyHtml) body.innerHTML = opts.bodyHtml;
  node.appendChild(body);
  return node;
}

function _buildLaunchBodyHtml(phase) {
  if (phase === 'idle') {
    return '<div class="cg-launch-body">' +
      '<button type="button" class="cg-launch-btn cg-launch-btn--prompts">✨ Gen Video Prompts</button>' +
    '</div>';
  }
  if (phase === 'filling') {
    return '<div class="cg-launch-body cg-launch-body--status">' +
      '<div class="cg-launch-spinner"></div>' +
      '<span class="cg-launch-status-lbl">Analyzing scenes…</span>' +
    '</div>';
  }
  if (phase === 'ready') {
    const n = (g.scenes || []).filter(s => {
      const vids = s.videoInstances || [];
      const v = vids.find(vi => vi.isRenderActive) || vids[0];
      return v && v.cameraPrompt;
    }).length;
    return '<div class="cg-launch-body cg-launch-body--ready">' +
      '<span class="cg-launch-status-lbl">' + n + ' prompt' + (n === 1 ? '' : 's') + ' ready</span>' +
      '<button type="button" class="cg-launch-btn cg-launch-btn--videos">🚀 Launch Video Agent</button>' +
    '</div>';
  }
  if (phase === 'running') {
    const done = (g.scenes || []).filter(s => s.videoUrl).length;
    const total = (g.scenes || []).length;
    return '<div class="cg-launch-body cg-launch-body--status">' +
      '<div class="cg-launch-spinner"></div>' +
      '<span class="cg-launch-status-lbl">Generating ' + done + ' / ' + total + '</span>' +
    '</div>';
  }
  return '<div class="cg-launch-body cg-launch-body--done">' +
    '<span class="cg-launch-status-lbl cg-launch-done-lbl">✓ All videos ready</span>' +
  '</div>';
}

function renderLaunchNode() {
  if (g.mode !== 'animated') {
    if (g.launchEl && g.launchEl.parentNode) g.launchEl.parentNode.removeChild(g.launchEl);
    g.launchEl = null;
    g.nodeEls.delete('cg-launch');
    return;
  }

  const phase = g.videoPhase || 'idle';
  const phaseSig = phase === 'running'
    ? 'running:' + (g.scenes || []).filter(s => s.videoUrl).length
    : phase;

  if (!g.launchEl || !g.launchEl.isConnected) {
    const node = buildSimpleNode('cg-node--launch', 'video', '⚡ Video Agent', {
      w: LAUNCH_W,
      h: LAUNCH_H,
      hasIn: false,
      hasOut: true,
      bodyHtml: _buildLaunchBodyHtml(phase),
    });
    node.dataset.id = 'cg-launch';
    node.dataset.type = 'launch';
    node.dataset.phase = phaseSig;
    g.graphLayerEl.appendChild(node);
    g.nodeEls.set('cg-launch', { el: node, type: 'launch' });
    g.launchEl = node;
  } else if (g.launchEl.dataset.phase !== phaseSig) {
    const body = g.launchEl.querySelector('.cg-node-body');
    if (body) body.innerHTML = _buildLaunchBodyHtml(phase);
    g.launchEl.dataset.phase = phaseSig;
  }

  const pos = window.createLaunchAgentPosition || { x: COL_LAUNCH, y: (g.chromeMidY || TOP_PAD) - LAUNCH_H / 2 };
  placeNode(g.launchEl, pos.x, pos.y);
}

function renderBgmNode() {
  // BGM node removed — handled in the timeline. Clean up any stale DOM.
  if (g.bgmEl && g.bgmEl.parentNode) g.bgmEl.parentNode.removeChild(g.bgmEl);
  g.bgmEl = null;
  g.nodeEls.delete('cg-bgm');
}

function renderSubtitleNode() {
  // Subtitle/audio node removed — handled in the timeline. Clean up any stale DOM.
  if (g.subEl && g.subEl.parentNode) g.subEl.parentNode.removeChild(g.subEl);
  g.subEl = null;
  g.nodeEls.delete('cg-sub');
}

function renderNarratorSetupNode() {
  const setup = window.createJobState && window.createJobState.narratorSetup;
  const narrator = window.createJobState && window.createJobState.narrator;
  const showNode = !!(narrator && narrator.locked && narrator.onScreenStyle === 'talking-head' && setup);
  if (!showNode) {
    if (g.narratorSetupEl && g.narratorSetupEl.parentNode) g.narratorSetupEl.parentNode.removeChild(g.narratorSetupEl);
    g.narratorSetupEl = null;
    g.nodeEls.delete('cg-narrator-setup');
    return;
  }
  const sig = (setup.imageDataUrl ? 'img' : 'noimg') + '|' + (setup.locked ? 'lock' : 'open') + '|' + ((setup.prompt || '').length);
  const promptShort = (setup.prompt || '').trim().slice(0, 90);
  const bodyHtml =
    '<div class="cg-nsetup-body">' +
      '<div class="cg-nsetup-thumb">' +
        (setup.imageDataUrl
          ? `<img src="${setup.imageDataUrl}" alt="narrator setup">`
          : '<div class="cg-nsetup-thumb-empty">no setup composed</div>') +
      '</div>' +
      '<div class="cg-nsetup-meta">' +
        '<span class="cg-nsetup-state">' + (setup.locked ? '🔒 Locked' : (setup.imageDataUrl ? 'Preview' : 'Empty')) + '</span>' +
        (promptShort ? `<span class="cg-nsetup-prompt">${promptShort.replace(/</g, '&lt;')}</span>` : '<span class="cg-nsetup-prompt cg-nsetup-prompt--empty">No prompt yet</span>') +
      '</div>' +
    '</div>';
  if (!g.narratorSetupEl || !g.narratorSetupEl.isConnected) {
    const node = buildSimpleNode('cg-node--nsetup', 'image', '🎬 Narrator Setup', {
      w: NSETUP_W,
      h: NSETUP_H,
      hasIn: false,
      hasOut: true,
      bodyHtml,
    });
    node.dataset.id = 'cg-narrator-setup';
    node.dataset.type = 'narratorSetup';
    node.dataset.sig = sig;
    g.graphLayerEl.appendChild(node);
    g.nodeEls.set('cg-narrator-setup', { el: node, type: 'narratorSetup' });
    g.narratorSetupEl = node;
  } else if (g.narratorSetupEl.dataset.sig !== sig) {
    const body = g.narratorSetupEl.querySelector('.cg-node-body');
    if (body) body.innerHTML = bodyHtml;
    g.narratorSetupEl.dataset.sig = sig;
  }
  if (!setup.canvasPosition) {
    setup.canvasPosition = { x: COL_NSETUP, y: (g.chromeMidY || TOP_PAD) - NSETUP_H / 2 };
  }
  placeNode(g.narratorSetupEl, setup.canvasPosition.x, setup.canvasPosition.y);
}

function renderBibleNode() {
  const cs = window.createJobState || {};
  const applies = (typeof window.bibleApplies === 'function') && window.bibleApplies();
  const bible = cs.bible;
  // Show node when bible applies (regardless of status — pending/error states surface here too)
  if (!applies) {
    if (g.bibleEl && g.bibleEl.parentNode) g.bibleEl.parentNode.removeChild(g.bibleEl);
    g.bibleEl = null;
    g.nodeEls.delete('cg-bible');
    return;
  }
  const status = bible ? bible.status : 'pending';
  const pages = (bible && bible.pages) || [];
  const cellsTotal = pages.reduce((n, p) => n + (p.slots ? p.slots.length : 0), 0);
  const cellsFilled = pages.reduce((n, p) => n + (p.slots ? p.slots.filter(s => s.cellImageId).length : 0), 0);
  const indexedCount = bible && bible.cellsByName ? Object.keys(bible.cellsByName).length : 0;
  const tplLockedTxt = cs.templateLocked ? ' · 🔒 template locked' : '';

  // Status banner color cue via class
  const statusCls = status === 'ready' ? 'cg-bible-status-ok'
    : status === 'error' ? 'cg-bible-status-err'
    : status === 'stale' ? 'cg-bible-status-stale'
    : 'cg-bible-status-busy';
  const statusLabel = status === 'ready'   ? '✓ Ready'
                    : status === 'error'   ? '⚠ Error'
                    : status === 'stale'   ? '⚠ Stale'
                    : status === 'generating' ? '⏳ Generating…'
                    : '— Pending';

  // Mini 3×3 grid preview using the 4K display image (or 2K fallback) async via IDB
  // We render placeholder thumbnails synchronously and refresh below if IDB hits.
  const slotPreviewsHtml = (page) => {
    if (!page || !page.slots) return '';
    return page.slots.map((s, i) => {
      const label = (s.priority === 'entity' || s.priority === 'extra')
        ? (s.baseEntityName || s.name).replace(/__angle$|__detail$/, '').slice(0, 8)
        : (s.name || '').slice(0, 8);
      const hasVersions = !!(s.versions && s.versions.length > 0);
      const isPaletteLocked = (s.priority === 'utility' && s.name === 'palette');
      return `<div class="cg-bible-cell" data-page-idx="${page.pageIdx}" data-slot-idx="${i}" data-cell-key="${s.cellImageId || ''}">` +
        `<div class="cg-bible-cell-thumb"></div>` +
        `<span class="cg-bible-cell-label">${label.replace(/</g, '&lt;')}</span>` +
        `<div class="cg-bible-cell-actions">` +
          (isPaletteLocked
            ? `<button type="button" class="cg-bible-cell-btn" disabled title="Palette is locked">🔒</button>`
            : `<button type="button" class="cg-bible-cell-btn" data-action="regen-cell" data-page-idx="${page.pageIdx}" data-slot-idx="${i}" title="Regen this cell ($0.04)">↻</button>`
          ) +
          (hasVersions
            ? `<button type="button" class="cg-bible-cell-btn" data-action="revert-cell" data-page-idx="${page.pageIdx}" data-slot-idx="${i}" title="Revert to prior version">↶</button>`
            : '') +
        `</div>` +
        `</div>`;
    }).join('');
  };

  const pageHtml = pages.map(p =>
    `<div class="cg-bible-page" data-page-idx="${p.pageIdx}">` +
      `<div class="cg-bible-page-label">Page ${p.pageIdx + 1}</div>` +
      `<div class="cg-bible-grid">${slotPreviewsHtml(p)}</div>` +
    `</div>`
  ).join('');

  const errMsg = (status === 'error' && bible && bible.lastError)
    ? `<div class="cg-bible-error">${String(bible.lastError).slice(0, 200).replace(/</g, '&lt;')}</div>` : '';

  const sig = `${status}|${pages.length}|${cellsFilled}|${cellsTotal}|${indexedCount}|${cs.templateLocked ? 1 : 0}`;
  const bodyHtml =
    '<div class="cg-bible-body">' +
      `<div class="cg-bible-status ${statusCls}">${statusLabel}${tplLockedTxt}</div>` +
      (pages.length
        ? pageHtml
        : '<div class="cg-bible-empty">Bible not yet generated. Will run automatically when you Launch the Image Agent.</div>') +
      errMsg +
      '<div class="cg-bible-meta">' +
        (cellsTotal ? `<span>Cells: ${cellsFilled} / ${cellsTotal}</span>` : '') +
        (indexedCount ? `<span>· ${indexedCount} entities indexed</span>` : '') +
      '</div>' +
      '<div class="cg-bible-actions">' +
        (status === 'ready'
          ? '<button type="button" class="cg-bible-btn-regen" data-action="regen-all">↻ Regen all</button>'
          : status === 'error'
            ? '<button type="button" class="cg-bible-btn-retry" data-action="retry">↻ Retry</button>'
            : '<button type="button" class="cg-bible-btn-regen" data-action="regen-now">⚙ Generate now</button>'
        ) +
      '</div>' +
    '</div>';

  if (!g.bibleEl || !g.bibleEl.isConnected) {
    const node = buildSimpleNode('cg-node--bible', 'image', '📖 Visual Bible', {
      w: BIBLE_W,
      h: BIBLE_H,
      hasIn: false,
      hasOut: true,
      bodyHtml,
    });
    node.dataset.id = 'cg-bible';
    node.dataset.type = 'bible';
    node.dataset.sig = sig;
    g.graphLayerEl.appendChild(node);
    g.nodeEls.set('cg-bible', { el: node, type: 'bible' });
    g.bibleEl = node;
    _wireBibleNodeOnce();
  } else if (g.bibleEl.dataset.sig !== sig) {
    const body = g.bibleEl.querySelector('.cg-node-body');
    if (body) body.innerHTML = bodyHtml;
    g.bibleEl.dataset.sig = sig;
  }

  if (!bible || !bible.canvasPosition) {
    const pos = { x: COL_BIBLE, y: (g.chromeMidY || TOP_PAD) - BIBLE_H / 2 };
    if (bible) bible.canvasPosition = pos;
    placeNode(g.bibleEl, pos.x, pos.y);
  } else {
    placeNode(g.bibleEl, bible.canvasPosition.x, bible.canvasPosition.y);
  }

  // Hydrate cell thumbnails from IDB asynchronously (best-effort).
  _hydrateBibleCellThumbs();
}

let _bibleNodeWired = false;
function _wireBibleNodeOnce() {
  if (_bibleNodeWired) return;
  _bibleNodeWired = true;
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (!t || !(t instanceof HTMLElement)) return;
    if (!g || !g.bibleEl || !g.bibleEl.contains(t)) return;
    // Cell-action buttons (regen / revert) — read data attrs from the button
    const btn = t.closest('button[data-action]');
    if (btn && g.bibleEl.contains(btn)) {
      const action = btn.dataset.action;
      const pIdx = btn.dataset.pageIdx !== undefined ? Number(btn.dataset.pageIdx) : null;
      const sIdx = btn.dataset.slotIdx !== undefined ? Number(btn.dataset.slotIdx) : null;
      e.preventDefault();
      e.stopPropagation();
      try {
        if (action === 'regen-cell' && pIdx !== null && sIdx !== null) {
          const ok = window.confirm('Regen this bible cell? Cost: $0.04. Scenes featuring this entity will be marked stale.');
          if (!ok) return;
          if (typeof window.regenBibleCell === 'function') {
            const res = await window.regenBibleCell(pIdx, sIdx);
            if (res && res.affectedScenes) {
              console.log(`[Bible] Cell regen complete · ${res.affectedScenes} scenes marked stale`);
            }
            if (typeof renderAll === 'function') renderAll();
          }
        } else if (action === 'revert-cell' && pIdx !== null && sIdx !== null) {
          if (typeof window.revertBibleCell === 'function') {
            await window.revertBibleCell(pIdx, sIdx);
            if (typeof renderAll === 'function') renderAll();
          }
        } else if (action === 'regen-now' || action === 'retry') {
          if (typeof window.generateBible === 'function') {
            await window.generateBible({ onProgress: (m) => console.log('[Bible]', m) });
            if (typeof renderAll === 'function') renderAll();
          }
        } else if (action === 'regen-all') {
          const ok = window.confirm('Regenerate the entire visual bible? Cost: $0.13 per page. All scenes will be marked stale.');
          if (!ok) return;
          if (typeof window.regenBibleWhole === 'function') {
            await window.regenBibleWhole();
            if (typeof renderAll === 'function') renderAll();
          } else if (typeof window.generateBible === 'function') {
            await window.generateBible({ onProgress: (m) => console.log('[Bible]', m) });
            if (typeof renderAll === 'function') renderAll();
          }
        }
      } catch (err) {
        alert('Bible action failed: ' + (err.message || err));
      }
      return;
    }
    // Fallthrough — cell-thumbnail click opens preview
    const cell = t.closest('.cg-bible-cell');
    if (cell && cell.dataset.cellKey && window.castIdb && window.castIdb.get) {
      try {
        const url = await window.castIdb.get(cell.dataset.cellKey);
        if (url && typeof window.castOpenImagePreview === 'function') {
          window.castOpenImagePreview(url, 'Bible cell');
        }
      } catch (_) {}
    }
  });
}

async function _hydrateBibleCellThumbs() {
  if (!g || !g.bibleEl || !window.castIdb || !window.castIdb.get) return;
  const cells = g.bibleEl.querySelectorAll('.cg-bible-cell');
  for (const cell of cells) {
    const key = cell.dataset.cellKey;
    const thumb = cell.querySelector('.cg-bible-cell-thumb');
    if (!key || !thumb || thumb.dataset.loaded === '1') continue;
    try {
      const url = await window.castIdb.get(key);
      if (url) {
        thumb.style.backgroundImage = `url(${url})`;
        thumb.dataset.loaded = '1';
      }
    } catch (_) {}
  }
}

function renderFinalNode() {
  let entry = g.nodeEls.get('cg-final');
  if (!entry) {
    const node = buildSimpleNode('cg-node--final', 'final', 'Final Render', {
      w: FINAL_W,
      h: FINAL_H,
      hasOut: false,
      bodyHtml:
        '<div class="cg-stepper-row">' +
          '<div class="cg-stepper" data-field="resolution">' +
            '<button type="button" class="cg-arr cg-arr-l">◀</button>' +
            '<span class="cg-val">1080p · 30fps</span>' +
            '<button type="button" class="cg-arr cg-arr-r">▶</button>' +
          '</div>' +
        '</div>' +
        '<div class="cg-final-cta">' +
          '<button type="button" class="cg-final-timeline">→ Send to Timeline</button>' +
        '</div>',
    });
    node.dataset.id = 'cg-final';
    node.dataset.type = 'final';
    g.graphLayerEl.appendChild(node);
    g.nodeEls.set('cg-final', { el: node, type: 'final' });
    g.finalEl = node;
  }
  const colFinalFb = (g.mode === 'animated') ? COL_FINAL_ANIM : COL_FINAL_ILL;
  const pos = window.createFinalRenderPosition || { x: colFinalFb, y: (g.chromeMidY || TOP_PAD) - FINAL_H / 2 };
  placeNode(g.finalEl, pos.x, pos.y);
  if (g.selectedIds.has('cg-final')) g.finalEl.classList.add('cg-node-selected');
  else g.finalEl.classList.remove('cg-node-selected');
}

// ─── renderAll ─────────────────────────────────────────────────────────────
function renderNodes() {
  if (!g || !g.scenes) return;
  g.sortedScenes.forEach((scene, sceneIdx) => {
    const sbs = scene.storyboardInstances || [];
    const activeSb = sbs.find(s => s.isActive) || sbs[0];

    // Render the active SB only (others share slot)
    if (activeSb) {
      const sbNode = ensureNode(activeSb.id, 'sb', () => buildSBNode(scene, sceneIdx));
      const pos = activeSb.canvasPosition || { x: COL_SB, y: scene._innerTop ?? TOP_PAD };
      placeNode(sbNode, pos.x, pos.y);
      updateSBNode(sbNode, scene, activeSb, sceneIdx);

      // Active image
      const activeImg = (activeSb.imageInstances || []).find(i => i.isRenderActive)
                     || (activeSb.imageInstances || [])[0];
      if (activeImg) {
        const imgNode = ensureNode(activeImg.id, 'img', () => buildImgNode());
        const ipos = activeImg.canvasPosition || { x: COL_IMG, y: scene._innerTop ?? TOP_PAD };
        placeNode(imgNode, ipos.x, ipos.y);
        updateImgNode(imgNode, scene, sceneIdx, activeSb, activeImg);

        // IMG variant tray
        ensureImgVariantTray(scene, sceneIdx, activeSb);

        if (g.mode === 'animated') {
          // Active video for the active image
          const list = (scene.videoInstances || []).filter(v => v.sourceImageInstanceId === activeImg.id);
          const renderVid = list.find(v => v.isRenderActive) || list[0];
          if (renderVid) {
            const vidNode = ensureNode(renderVid.id, 'vid', () => buildVidNode());
            const vpos = renderVid.canvasPosition || { x: COL_VID, y: scene._innerTop ?? TOP_PAD };
            placeNode(vidNode, vpos.x, vpos.y);
            updateVidNode(vidNode, scene, sceneIdx, activeSb, activeImg, renderVid);
          }
          ensureVidVariantTray(scene, sceneIdx, activeSb, activeImg);
        }
      } else {
        // No active image — still build the IMG tray with empty state
        ensureImgVariantTray(scene, sceneIdx, activeSb);
      }
    }
  });

  pruneStaleNodes();
  pruneStaleTrays();
}

function renderAll() {
  if (!g || !g.scenes) return;
  renderNodes();
  renderLaunchNode();
  renderBgmNode();
  renderSubtitleNode();
  renderNarratorSetupNode();
  renderBibleNode();
  renderFinalNode();
  redrawCurves();
  cgUpdateSelToolbar();
}

function refresh() {
  if (!g) return;
  runLayout();
  renderAll();
}

// ════ SECTION 7 — Curves ═══════════════════════════════════════════════════

function nodeRect(id) {
  if (id === 'cg-launch' && g.launchEl) {
    const pos = window.createLaunchAgentPosition || { x: COL_LAUNCH, y: (g.chromeMidY || TOP_PAD) - LAUNCH_H / 2 };
    return { x: pos.x, y: pos.y, w: LAUNCH_W, h: LAUNCH_H };
  }
  if (id === 'cg-narrator-setup' && g.narratorSetupEl) {
    const setup = window.createJobState && window.createJobState.narratorSetup;
    const pos = (setup && setup.canvasPosition) || { x: COL_NSETUP, y: (g.chromeMidY || TOP_PAD) - NSETUP_H / 2 };
    return { x: pos.x, y: pos.y, w: NSETUP_W, h: NSETUP_H };
  }
  if (id === 'cg-bible' && g.bibleEl) {
    const bible = window.createJobState && window.createJobState.bible;
    const pos = (bible && bible.canvasPosition) || { x: COL_BIBLE, y: (g.chromeMidY || TOP_PAD) - BIBLE_H / 2 };
    return { x: pos.x, y: pos.y, w: BIBLE_W, h: BIBLE_H };
  }
  if (id === 'cg-final' && g.finalEl) {
    const colFinalFb = (g.mode === 'animated') ? COL_FINAL_ANIM : COL_FINAL_ILL;
    const pos = window.createFinalRenderPosition || { x: colFinalFb, y: (g.chromeMidY || TOP_PAD) - FINAL_H / 2 };
    return { x: pos.x, y: pos.y, w: FINAL_W, h: FINAL_H };
  }
  const inst = findInstance(id);
  if (!inst) return null;
  if (inst.type === 'sb') {
    const p = inst.sb.canvasPosition || { x: COL_SB, y: TOP_PAD };
    return { x: p.x, y: p.y, w: NODE_W, h: SB_H };
  }
  if (inst.type === 'img') {
    const p = inst.img.canvasPosition || { x: COL_IMG, y: TOP_PAD };
    return { x: p.x, y: p.y, w: NODE_W, h: IMG_H };
  }
  if (inst.type === 'vid') {
    const p = inst.vid.canvasPosition || { x: COL_VID, y: TOP_PAD };
    return { x: p.x, y: p.y, w: NODE_W, h: VID_H };
  }
  return null;
}

function drawCurveXY(x1, y1, x2, y2, type, status, fromId, toId) {
  const dx = Math.max(80, (x2 - x1) * 0.5);
  const path = svgEl('path', {
    d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
    fill: 'none',
  });
  let color = getSockColor(type);
  if (status === 'error') color = getDangerColor();
  path.setAttribute('stroke', color);
  const isPending = PENDING_STATUSES.has(status);
  if (isPending) {
    path.setAttribute('stroke-dasharray', '5 4');
    path.setAttribute('opacity', '0.55');
  } else {
    path.setAttribute('opacity', '0.9');
  }
  const isSel = (fromId && g.selectedIds.has(fromId)) || (toId && g.selectedIds.has(toId));
  const isFinal = type === 'final';
  const isImage = type === 'image';
  path.setAttribute('stroke-width', isFinal ? (isSel ? '4' : '3') : isImage ? (isSel ? '3' : '2.5') : (isSel ? '1.8' : '1.6'));
  path.setAttribute('stroke-linecap', 'round');
  path.classList.add('cg-curve');
  if (fromId) path.dataset.from = fromId;
  if (toId)   path.dataset.to = toId;
  // Phase 5 — dim curves whose endpoints are dimmed by the character filter
  const fromEl = fromId ? (g.nodeEls.get(fromId)?.el) : null;
  const toEl = toId ? (g.nodeEls.get(toId)?.el) : null;
  const fromDim = fromEl && fromEl.classList.contains('cg-node--dimmed');
  const toDim = toEl && toEl.classList.contains('cg-node--dimmed');
  if (fromDim || toDim) {
    path.setAttribute('opacity', '0.15');
  }
  if (g.hoveredNodeId) {
    if (fromId === g.hoveredNodeId || toId === g.hoveredNodeId) path.classList.add('connected');
  }
  g.svgEl.appendChild(path);
}

function drawCurve(fromId, toId, type, status) {
  const a = nodeRect(fromId);
  const b = nodeRect(toId);
  if (!a || !b) return;
  // socket positions
  const x1 = a.x + a.w;
  const y1 = a.y + 22;     // sockets at top: 16px + 6 (radius)
  const x2 = b.x;
  const y2 = b.y + 22;
  drawCurveXY(x1, y1, x2, y2, type, status, fromId, toId);
}

function redrawCurves() {
  if (!g || !g.svgEl) return;
  // Resize SVG box to graph bounds
  g.svgEl.setAttribute('width', String(g.graphW));
  g.svgEl.setAttribute('height', String(g.graphH));
  g.svgEl.style.width = g.graphW + 'px';
  g.svgEl.style.height = g.graphH + 'px';
  // Clear
  while (g.svgEl.firstChild) g.svgEl.removeChild(g.svgEl.firstChild);

  // Build active-path edges per scene
  (g.sortedScenes || []).forEach(scene => {
    const activeSb = (scene.storyboardInstances || []).find(s => s.isActive);
    if (!activeSb) return;
    const activeImg = (activeSb.imageInstances || []).find(i => i.isRenderActive)
                  || (activeSb.imageInstances || [])[0];

    if (activeImg) {
      // SB → IMG
      drawCurve(activeSb.id, activeImg.id, 'image', activeImg.status);

      if (g.mode === 'animated') {
        // ⭐ image → Launch
        if (activeImg.isActive && activeImg.status === 'done' && g.launchEl) {
          drawCurve(activeImg.id, 'cg-launch', 'video', 'done');
        }
        // IMG → VID (active path)
        const list = (scene.videoInstances || []).filter(v => v.sourceImageInstanceId === activeImg.id);
        const renderVid = list.find(v => v.isRenderActive) || list[0];
        if (renderVid) {
          drawCurve(activeImg.id, renderVid.id, 'video', renderVid.status);
          // VID → Final
          drawCurve(renderVid.id, 'cg-final', 'final', renderVid.status);
        }
      } else {
        // illustrated: IMG → Final
        drawCurve(activeImg.id, 'cg-final', 'final', activeImg.status);
      }
    }
  });

  // Apply hover dim on graph layer
  if (g.hoveredNodeId) g.graphLayerEl.setAttribute('data-hover-active', '1');
  else g.graphLayerEl.removeAttribute('data-hover-active');
}

// ════ SECTION 8 — Pan / Zoom / Fit / panToColumn ═══════════════════════════

function applyTransform() {
  if (!g || !g.graphLayerEl) return;
  const z = g.zoom;
  g.graphLayerEl.style.transform = `translate(${g.panX}px, ${g.panY}px) scale(${z})`;
  g.graphLayerEl.style.setProperty('--cg-zoom', String(z));
  // Update chrome zoom labels
  const lbl = $('cg-zoom-pct-label');
  if (lbl) lbl.textContent = Math.round(z * 100) + '%';
  cgUpdateSelToolbar();
}

function handleZoom(deltaY, cx, cy) {
  const rect = g.wrapperEl.getBoundingClientRect();
  const mx = cx - rect.left;
  const my = cy - rect.top;
  const wx = (mx - g.panX) / g.zoom;
  const wy = (my - g.panY) / g.zoom;
  const factor = Math.exp(-deltaY * 0.0015);
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, g.zoom * factor));
  g.zoom = newZoom;
  g.panX = mx - wx * g.zoom;
  g.panY = my - wy * g.zoom;
  applyTransform();
}

function setZoom(z, cx, cy) {
  const rect = g.wrapperEl.getBoundingClientRect();
  const mx = (cx == null) ? rect.width / 2 : (cx - rect.left);
  const my = (cy == null) ? rect.height / 2 : (cy - rect.top);
  const wx = (mx - g.panX) / g.zoom;
  const wy = (my - g.panY) / g.zoom;
  g.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  g.panX = mx - wx * g.zoom;
  g.panY = my - wy * g.zoom;
  applyTransform();
}

function fitToView() {
  if (!g) return;
  // Compute bounding box of nodes + chrome nodes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function addBox(x, y, w, h) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }

  (g.sortedScenes || []).forEach(scene => {
    const sb = (scene.storyboardInstances || []).find(s => s.isActive);
    if (sb && sb.canvasPosition) addBox(sb.canvasPosition.x, sb.canvasPosition.y, NODE_W, SB_H);
    const activeImg = sb && (sb.imageInstances || []).find(i => i.isRenderActive);
    if (activeImg && activeImg.canvasPosition) {
      addBox(activeImg.canvasPosition.x - TRAY_PAD_X, activeImg.canvasPosition.y - TRAY_PAD_TOP,
             NODE_W + TRAY_PAD_X * 2, rowImageTrayHeight(sb));
    }
    if (g.mode === 'animated' && activeImg) {
      const list = (scene.videoInstances || []).filter(v => v.sourceImageInstanceId === activeImg.id);
      const ra = list.find(v => v.isRenderActive) || list[0];
      if (ra && ra.canvasPosition) {
        addBox(ra.canvasPosition.x - TRAY_PAD_X, ra.canvasPosition.y - TRAY_PAD_TOP,
               NODE_W + TRAY_PAD_X * 2, rowVideoTrayHeight(scene, activeImg.id));
      }
    }
  });
  if (g.launchEl) {
    const p = window.createLaunchAgentPosition;
    if (p) addBox(p.x, p.y, LAUNCH_W, LAUNCH_H);
  }
  if (g.finalEl) {
    const p = window.createFinalRenderPosition;
    if (p) addBox(p.x, p.y, FINAL_W, FINAL_H);
  }
  if (g.narratorSetupEl) {
    const p = window.createJobState?.narratorSetup?.canvasPosition;
    if (p) addBox(p.x, p.y, NSETUP_W, NSETUP_H);
  }
  if (g.bibleEl) {
    const p = window.createJobState?.bible?.canvasPosition;
    if (p) addBox(p.x, p.y, BIBLE_W, BIBLE_H);
  }

  if (!isFinite(minX)) return; // nothing to fit

  const rect = g.wrapperEl.getBoundingClientRect();
  const availW = Math.max(200, rect.width - SAFE_PAD * 2);
  const availH = Math.max(200, rect.height - SAFE_PAD * 2);
  const bw = maxX - minX;
  const bh = maxY - minY;
  const z = Math.min(availW / bw, availH / bh, 1.0);
  g.zoom = Math.max(ZOOM_MIN, z);
  g.panX = SAFE_PAD - minX * g.zoom + (availW - bw * g.zoom) / 2;
  g.panY = SAFE_PAD - minY * g.zoom + (availH - bh * g.zoom) / 2;
  applyTransform();
}

function panToColumn(colKey) {
  if (!g) return;
  let colX, colW;
  switch (colKey) {
    case 'sb':    colX = COL_SB;    colW = NODE_W; break;
    case 'img':   colX = COL_IMG;   colW = NODE_W; break;
    case 'vid':   colX = (g.mode === 'animated') ? COL_VID : COL_IMG; colW = NODE_W; break;
    case 'final': colX = (g.mode === 'animated') ? COL_FINAL_ANIM : COL_FINAL_ILL; colW = FINAL_W; break;
    default: return;
  }
  const rect = g.wrapperEl.getBoundingClientRect();
  const targetCenter = colX + colW / 2;
  g.panX = rect.width / 2 - targetCenter * g.zoom;
  applyTransform();
}

// ════ SECTION 9 — Interactions (events) ════════════════════════════════════

function attachEvents() {
  // Wheel
  g.onWheel = function (e) {
    e.preventDefault();
    handleZoom(e.deltaY, e.clientX, e.clientY);
  };
  g.wrapperEl.addEventListener('wheel', g.onWheel, { passive: false });

  // Mouse down (pan / drag node / marquee)
  g.onMouseDown = function (e) {
    if (e.button !== 0) return;
    const target = e.target;
    if (target.closest('.cg-pill-btn, .cg-zd-btn, .cg-pill-stepper, .cg-pill-status, .cg-telemetry, .cg-zoom-dock, .cg-top-pill, .cg-zoom-cursor-menu, .cg-zoom-pct-menu, .cg-context-menu, .cg-sel-toolbar, .cg-right-pane')) return;

    // Drag a node — by header OR by any non-interactive part of the card.
    // Interactive children (textarea / button / input / sockets / thumbs / tabs /
    // steppers) opt out via the `[data-no-drag]` predicate or their tag/class.
    const node = target.closest('.cg-node');
    const interactive = target.closest(
      'textarea, button, input, select, a, ' +
      '.cg-sock, .cg-stepper, .cg-tabs, .cg-thumb, .cg-thumb-strip, ' +
      '.cg-status-dot, .cg-variant-pin, [data-no-drag]'
    );
    if (node && !interactive) {
        const id = node.dataset.id;
        // initiate drag
        g.dragNodeId = id;
        g.graphLayerEl.classList.add('cg-dragging');
        g.dragStartPx = { x: e.clientX, y: e.clientY };
        const inst = findInstance(id);
        let pos = null;
        if (inst) {
          if (inst.type === 'sb') pos = inst.sb.canvasPosition;
          else if (inst.type === 'img') pos = inst.img.canvasPosition;
          else if (inst.type === 'vid') pos = inst.vid.canvasPosition;
          else if (inst.type === 'launch') pos = window.createLaunchAgentPosition;
          else if (inst.type === 'final') pos = window.createFinalRenderPosition;
          else if (inst.type === 'narratorSetup') pos = window.createJobState?.narratorSetup?.canvasPosition || null;
          else if (inst.type === 'bible') pos = window.createJobState?.bible?.canvasPosition || null;
        }
        g.dragStartPos = pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 };
        // ensure selection
        selectNode(id, { additive: e.shiftKey });
        e.preventDefault();
        return;
    }

    // Click on empty stage / graph background
    const onEmpty = (target === g.graphLayerEl || target === g.svgEl || target === g.wrapperEl);
    if (onEmpty) {
      const cursor = (g.cgChrome && g.cgChrome.cursorMode) || 'pan';
      const wantsMarquee = (cursor === 'select') || e.shiftKey;
      const wantsPan = (cursor === 'pan' && !e.shiftKey) || g.spaceHeld;

      if (wantsPan) {
        g.isPanning = true;
        g.panStart = { x: e.clientX - g.panX, y: e.clientY - g.panY };
        g.wrapperEl.style.cursor = 'grabbing';
        e.preventDefault();
      } else if (wantsMarquee) {
        const rect = g.wrapperEl.getBoundingClientRect();
        const sx = (e.clientX - rect.left - g.panX) / g.zoom;
        const sy = (e.clientY - rect.top - g.panY) / g.zoom;
        const m = el('div', 'cg-marquee');
        g.graphLayerEl.appendChild(m);
        g.marquee = { startX: sx, startY: sy, curX: sx, curY: sy, el: m, additive: e.shiftKey };
        updateMarqueeRect();
        e.preventDefault();
      }
    }
  };
  g.wrapperEl.addEventListener('mousedown', g.onMouseDown);

  // Mouse move
  g.onMouseMove = function (e) {
    if (g.isPanning) {
      g.panX = e.clientX - g.panStart.x;
      g.panY = e.clientY - g.panStart.y;
      applyTransform();
    } else if (g.dragNodeId) {
      const dx = (e.clientX - g.dragStartPx.x) / g.zoom;
      const dy = (e.clientY - g.dragStartPx.y) / g.zoom;
      const id = g.dragNodeId;
      const inst = findInstance(id);
      let pos = null;
      if (inst) {
        if (inst.type === 'sb') pos = inst.sb.canvasPosition = inst.sb.canvasPosition || { x: 0, y: 0 };
        else if (inst.type === 'img') pos = inst.img.canvasPosition = inst.img.canvasPosition || { x: 0, y: 0 };
        else if (inst.type === 'vid') pos = inst.vid.canvasPosition = inst.vid.canvasPosition || { x: 0, y: 0 };
        else if (inst.type === 'launch') pos = window.createLaunchAgentPosition = window.createLaunchAgentPosition || { x: 0, y: 0 };
        else if (inst.type === 'final') pos = window.createFinalRenderPosition = window.createFinalRenderPosition || { x: 0, y: 0 };
        else if (inst.type === 'narratorSetup') {
          const ns = window.createJobState?.narratorSetup;
          if (ns) {
            ns.canvasPosition = ns.canvasPosition || { x: 0, y: 0 };
            pos = ns.canvasPosition;
          }
        }
        else if (inst.type === 'bible') {
          const bb = window.createJobState?.bible;
          if (bb) {
            bb.canvasPosition = bb.canvasPosition || { x: 0, y: 0 };
            pos = bb.canvasPosition;
          }
        }
      }
      if (pos) {
        pos.x = g.dragStartPos.x + dx;
        pos.y = g.dragStartPos.y + dy;
        const entry = g.nodeEls.get(id);
        if (entry) placeNode(entry.el, pos.x, pos.y);
        // re-place trays anchored to active img/vid
        if (inst && (inst.type === 'img' || inst.type === 'sb' || inst.type === 'vid')) {
          renderAll();
        } else {
          redrawCurves();
        }
        cgUpdateSelToolbar();
      }
    } else if (g.marquee) {
      const rect = g.wrapperEl.getBoundingClientRect();
      g.marquee.curX = (e.clientX - rect.left - g.panX) / g.zoom;
      g.marquee.curY = (e.clientY - rect.top - g.panY) / g.zoom;
      updateMarqueeRect();
    }
  };
  window.addEventListener('mousemove', g.onMouseMove);

  // Mouse up
  g.onMouseUp = function (e) {
    if (g.isPanning) {
      g.isPanning = false;
      g.wrapperEl.style.cursor = '';
    }
    if (g.dragNodeId) {
      g.dragNodeId = null;
      g.graphLayerEl.classList.remove('cg-dragging');
      triggerSave();
    }
    if (g.marquee) {
      finalizeMarquee(e.shiftKey);
    }
  };
  window.addEventListener('mouseup', g.onMouseUp);

  // Click (selection / tabs / thumbs / actions)
  g.onClick = function (e) {
    const target = e.target;

    // Tab click
    const tab = target.closest('.cg-tab');
    if (tab) {
      e.preventDefault();
      e.stopPropagation();
      if (tab.classList.contains('cg-tab--add')) {
        // add new SB
        const node = tab.closest('.cg-node');
        if (node) {
          const inst = findInstance(node.dataset.id);
          if (inst && inst.type === 'sb') {
            window.sbActions.addVariant(inst.scene);
          }
        }
      } else if (tab.dataset.sbId) {
        const node = tab.closest('.cg-node');
        if (node) {
          const inst = findInstance(node.dataset.id);
          if (inst) {
            CanvasState.setActiveStoryboard(inst.scene, tab.dataset.sbId);
            CanvasState.normalizeSceneFlags(inst.scene, g.mode);
            CanvasState.syncMirrorFields(inst.scene, g.mode);
            runLayout();
            renderAll();
            triggerSave();
          }
        }
      }
      return;
    }

    // Thumb click in IMG strip — + opens right panel for the active IMG node
    const thumbAddImg = target.closest('[data-role="add-img"]');
    if (thumbAddImg) {
      e.preventDefault();
      const tray = thumbAddImg.closest('.cg-variant-tray');
      const sbId = tray && tray.dataset.id ? tray.dataset.id.slice('tray-img-'.length) : null;
      if (sbId) {
        (g.scenes || []).forEach(s => {
          const sb = (s.storyboardInstances || []).find(x => x.id === sbId);
          if (sb) {
            const activeImg = (sb.imageInstances || []).find(x => x.isActive);
            if (activeImg) selectNode(activeImg.id);
          }
        });
      }
      return;
    }
    const thumbImg = target.closest('[data-img-id]');
    if (thumbImg) {
      e.preventDefault();
      const imgId = thumbImg.dataset.imgId;
      const inst = findInstance(imgId);
      if (inst) {
        CanvasState.setImageRenderActive(inst.scene, imgId);
        CanvasState.normalizeSceneFlags(inst.scene, g.mode);
        CanvasState.syncMirrorFields(inst.scene, g.mode);
        runLayout();
        renderAll();
        selectNode(imgId);
        triggerSave();
      }
      return;
    }

    // Thumb click in VID strip — + opens right panel for the active VID node
    const thumbAddVid = target.closest('[data-role="add-vid"]');
    if (thumbAddVid) {
      e.preventDefault();
      const tray = thumbAddVid.closest('.cg-variant-tray');
      const srcId = tray && tray.dataset.id ? tray.dataset.id.slice('tray-vid-'.length) : null;
      if (srcId) {
        const inst = findInstance(srcId);
        if (inst) selectNode(inst.vid ? inst.vid.id : srcId);
      }
      return;
    }
    const thumbVid = target.closest('[data-vid-id]');
    if (thumbVid) {
      e.preventDefault();
      const vidId = thumbVid.dataset.vidId;
      const inst = findInstance(vidId);
      if (inst) {
        CanvasState.setVideoRenderActive(inst.scene, vidId);
        CanvasState.normalizeSceneFlags(inst.scene, g.mode);
        CanvasState.syncMirrorFields(inst.scene, g.mode);
        runLayout();
        renderAll();
        selectNode(vidId);
        triggerSave();
      }
      return;
    }

    // Stepper arrow click
    const arrow = target.closest('.cg-arr');
    if (arrow) {
      e.preventDefault();
      handleStepper(arrow);
      return;
    }

    // Final render button
    if (target.closest('.cg-final-render')) {
      e.preventDefault();
      window.finalActions.render && window.finalActions.render();
      return;
    }

    // Send to Timeline button
    if (target.closest('.cg-final-timeline')) {
      e.preventDefault();
      window._cgSendToTimeline && window._cgSendToTimeline();
      return;
    }

    // Launch button — phase 1: generate prompts
    if (target.closest('.cg-launch-btn--prompts')) {
      e.preventDefault();
      if (typeof window.cgFillVideoPrompts === 'function') window.cgFillVideoPrompts();
      return;
    }
    // Launch button — phase 2: launch video agent
    if (target.closest('.cg-launch-btn--videos')) {
      e.preventDefault();
      if (typeof window.cgLaunchVideoAgent === 'function') window.cgLaunchVideoAgent();
      return;
    }

    // Node body click → select
    const nodeEl = target.closest('.cg-node');
    if (nodeEl) {
      const id = nodeEl.dataset.id;
      // Don't blow selection if click was inside a textarea (typing)
      if (target.closest('textarea, input, button')) {
        // Still select unless it was a stepper/textarea
        if (target.closest('textarea, input')) {
          selectNode(id, { additive: e.shiftKey });
          return;
        }
      }
      selectNode(id, { additive: e.shiftKey });
      return;
    }

    // Click on empty stage → clear selection
    if (target === g.wrapperEl || target === g.graphLayerEl || target === g.svgEl) {
      clearSelection();
    }
  };
  g.wrapperEl.addEventListener('click', g.onClick);

  // Right-click context menu
  g.onContextMenu = function (e) {
    const nodeEl = e.target.closest('.cg-node');
    if (!nodeEl) return;
    e.preventDefault();
    selectNode(nodeEl.dataset.id);
    cgOpenContextMenu(e.clientX, e.clientY, nodeEl.dataset.id);
  };
  g.wrapperEl.addEventListener('contextmenu', g.onContextMenu);

  // Double-click out-socket → next stage
  g.onDblClick = function (e) {
    const sock = e.target.closest('.cg-sock--out');
    if (!sock) return;
    const nodeEl = sock.closest('.cg-node');
    if (!nodeEl) return;
    e.preventDefault();
    const id = nodeEl.dataset.id;
    const inst = findInstance(id);
    if (!inst) return;
    if (inst.type === 'sb') {
      // pan to img col
      panToColumn('img');
    } else if (inst.type === 'img') {
      if (g.mode === 'animated') {
        // create new vid
        window.vidActions.addVariation(inst.scene, inst.img.id);
      }
    } else if (inst.type === 'vid') {
      panToColumn('final');
    }
  };
  g.wrapperEl.addEventListener('dblclick', g.onDblClick);

  // Hover dim — refs stored on g so detachEvents can remove them on unmount.
  // Without this, every remount stacks N anonymous listeners → zoom degrades.
  g.onMouseOver = function (e) {
    const nodeEl = e.target.closest('.cg-node');
    if (!nodeEl) return;
    if (g.hoveredNodeId !== nodeEl.dataset.id) {
      g.hoveredNodeId = nodeEl.dataset.id;
      redrawCurves();
    }
  };
  g.wrapperEl.addEventListener('mouseover', g.onMouseOver);
  g.onMouseOut = function (e) {
    const nodeEl = e.target.closest('.cg-node');
    if (!nodeEl) return;
    const r = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.cg-node');
    if (!r) {
      g.hoveredNodeId = null;
      redrawCurves();
    }
  };
  g.wrapperEl.addEventListener('mouseout', g.onMouseOut);

  // Textarea input → write to sb.prompt
  g.wrapperEl.addEventListener('input', function (e) {
    const ta = e.target;
    if (!(ta && ta.classList && ta.classList.contains('cg-prompt'))) return;
    const nodeEl = ta.closest('.cg-node');
    if (!nodeEl) return;
    const id = nodeEl.dataset.id;
    const inst = findInstance(id);
    if (inst && inst.type === 'sb') {
      inst.sb.prompt = ta.value;
      CanvasState.syncMirrorFields(inst.scene, g.mode);
      triggerSave();
    }
  });

  // Keyboard
  g.onKeyDown = function (e) {
    if (!g) return;
    // Ignore when focused on a text field
    const ae = document.activeElement;
    const inField = ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT');
    if (e.key === ' ' || e.code === 'Space') {
      if (!inField) {
        g.spaceHeld = true;
        g.wrapperEl.style.cursor = 'grab';
        e.preventDefault();
      }
      return;
    }
    if (inField) return;

    if (e.key === 'Escape') {
      cgCloseContextMenu();
      // If a character filter is active, clear it first
      if (g.characterFilter && g.characterFilter.activeIds.size > 0) {
        clearCharacterFilter();
        return;
      }
      clearSelection();
      return;
    }
    if (e.key === 'f' || e.key === 'F') {
      fitToView();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (g.selectedIds.size === 0) return;
      e.preventDefault();
      handleBatchDelete();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      if (g.selectedId) handleRegenSelected();
      return;
    }
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      if (g.sortedScenes && g.sortedScenes[idx]) {
        const scene = g.sortedScenes[idx];
        // Pan to scene's SB
        const rect = g.wrapperEl.getBoundingClientRect();
        const sb = (scene.storyboardInstances || []).find(s => s.isActive);
        if (sb && sb.canvasPosition) {
          g.panY = rect.height / 2 - (sb.canvasPosition.y + SB_H / 2) * g.zoom;
          applyTransform();
        }
      }
    }
  };
  g.onKeyUp = function (e) {
    if (e.key === ' ' || e.code === 'Space') {
      g.spaceHeld = false;
      g.wrapperEl.style.cursor = '';
    }
  };
  document.addEventListener('keydown', g.onKeyDown);
  document.addEventListener('keyup', g.onKeyUp);
}

function detachEvents() {
  if (!g) return;
  if (g.wrapperEl) {
    if (g.onWheel) g.wrapperEl.removeEventListener('wheel', g.onWheel);
    if (g.onMouseDown) g.wrapperEl.removeEventListener('mousedown', g.onMouseDown);
    if (g.onClick) g.wrapperEl.removeEventListener('click', g.onClick);
    if (g.onContextMenu) g.wrapperEl.removeEventListener('contextmenu', g.onContextMenu);
    if (g.onDblClick) g.wrapperEl.removeEventListener('dblclick', g.onDblClick);
    if (g.onMouseOver) g.wrapperEl.removeEventListener('mouseover', g.onMouseOver);
    if (g.onMouseOut) g.wrapperEl.removeEventListener('mouseout', g.onMouseOut);
  }
  if (g.onMouseMove) window.removeEventListener('mousemove', g.onMouseMove);
  if (g.onMouseUp) window.removeEventListener('mouseup', g.onMouseUp);
  if (g.onKeyDown) document.removeEventListener('keydown', g.onKeyDown);
  if (g.onKeyUp) document.removeEventListener('keyup', g.onKeyUp);
}

function selectNode(id, opts) {
  opts = opts || {};
  if (!id) return;
  if (opts.additive) {
    if (g.selectedIds.has(id)) g.selectedIds.delete(id);
    else g.selectedIds.add(id);
    g.selectedId = g.selectedIds.size === 1 ? Array.from(g.selectedIds)[0] : null;
  } else {
    g.selectedIds = new Set([id]);
    g.selectedId = id;
  }
  window.selectedNodeId = g.selectedId;
  // Apply selected class
  g.nodeEls.forEach((entry, nid) => {
    if (g.selectedIds.has(nid)) entry.el.classList.add('cg-node-selected');
    else entry.el.classList.remove('cg-node-selected');
  });
  redrawCurves();
  cgUpdateSelToolbar();
  cgRenderProperties();
}

function clearSelection() {
  g.selectedId = null;
  g.selectedIds.clear();
  window.selectedNodeId = null;
  g.nodeEls.forEach((entry) => entry.el.classList.remove('cg-node-selected'));
  cgRemoveSelToolbar();
  redrawCurves();
  cgRenderProperties();
}

// ════ SECTION 11 — Marquee select ══════════════════════════════════════════

function updateMarqueeRect() {
  if (!g.marquee) return;
  const x = Math.min(g.marquee.startX, g.marquee.curX);
  const y = Math.min(g.marquee.startY, g.marquee.curY);
  const w = Math.abs(g.marquee.curX - g.marquee.startX);
  const h = Math.abs(g.marquee.curY - g.marquee.startY);
  g.marquee.el.style.left = x + 'px';
  g.marquee.el.style.top = y + 'px';
  g.marquee.el.style.width = w + 'px';
  g.marquee.el.style.height = h + 'px';
}

function finalizeMarquee(additive) {
  if (!g.marquee) return;
  const x1 = Math.min(g.marquee.startX, g.marquee.curX);
  const y1 = Math.min(g.marquee.startY, g.marquee.curY);
  const x2 = Math.max(g.marquee.startX, g.marquee.curX);
  const y2 = Math.max(g.marquee.startY, g.marquee.curY);
  const hits = new Set(additive ? g.selectedIds : []);
  g.nodeEls.forEach((entry, id) => {
    const r = nodeRect(id);
    if (!r) return;
    const overlap = !(r.x + r.w < x1 || r.x > x2 || r.y + r.h < y1 || r.y > y2);
    if (overlap) hits.add(id);
  });
  // Remove marquee element
  if (g.marquee.el && g.marquee.el.parentNode) g.marquee.el.parentNode.removeChild(g.marquee.el);
  g.marquee = null;
  // Apply selection
  g.selectedIds = hits;
  g.selectedId = hits.size === 1 ? Array.from(hits)[0] : null;
  window.selectedNodeId = g.selectedId;
  g.nodeEls.forEach((entry, nid) => {
    if (g.selectedIds.has(nid)) entry.el.classList.add('cg-node-selected');
    else entry.el.classList.remove('cg-node-selected');
  });
  redrawCurves();
  cgUpdateSelToolbar();
}

// ════ SECTION 10 — Context menu + selection toolbar ════════════════════════

function cgGetMenuItems(id) {
  const inst = findInstance(id);
  if (!inst) return [];
  if (inst.type === 'sb') {
    return [
      { label: '↻ Regen', action: () => window.sbActions.regen && window.sbActions.regen(inst.scene, inst.sb) },
      { label: '＋ Add Variant', action: () => window.sbActions.addVariant(inst.scene) },
      { label: '✎ Edit', action: () => { /* focus textarea */
        const node = g.nodeEls.get(inst.sb.id);
        const ta = node && node.el.querySelector('.cg-prompt');
        if (ta) ta.focus();
      }},
      { label: '🖼 Add Reference', action: () => window.sbActions.addRef && window.sbActions.addRef(inst.scene, inst.sb) },
      { label: '⊘ Delete', danger: true, action: () => window.sbActions.delete(inst.scene, inst.sb.id) },
    ];
  }
  if (inst.type === 'img') {
    return [
      { label: '↻ Regen', action: () => window.imgActions.regen(inst.scene, inst.sb, inst.img) },
      { label: '✦ Variation', action: () => window.imgActions.addVariation(inst.scene, inst.sb.id) },
      { label: '↓ Download', action: () => window.imgActions.download(inst.img) },
      { label: '⊘ Delete', danger: true, action: () => window.imgActions.delete(inst.scene, inst.sb, inst.img) },
    ];
  }
  if (inst.type === 'vid') {
    return [
      { label: '↻ Regen', action: () => window.vidActions.regen(inst.scene, inst.vid) },
      { label: '✦ Variation', action: () => window.vidActions.addVariation(inst.scene, inst.vid.sourceImageInstanceId) },
      { label: '↓ Download', action: () => window.vidActions.download(inst.vid) },
      { label: '⊘ Delete', danger: true, action: () => window.vidActions.delete(inst.scene, inst.vid) },
    ];
  }
  if (inst.type === 'final') {
    return [
      { label: '▶ Render', action: () => window.finalActions.render && window.finalActions.render() },
      { label: '↓ Download', action: () => window.finalActions.download && window.finalActions.download() },
      { label: '⊘ Cancel', danger: true, action: () => window.finalActions.cancel && window.finalActions.cancel() },
    ];
  }
  return [];
}

function cgOpenContextMenu(clientX, clientY, id) {
  cgCloseContextMenu();
  const items = cgGetMenuItems(id);
  if (items.length === 0) return;
  const menu = el('div', 'cg-context-menu');
  items.forEach(item => {
    const btn = el('button', 'cg-menu-item' + (item.danger ? ' cg-menu-item--danger' : ''), { type: 'button' });
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      cgCloseContextMenu();
      try { item.action(); } catch (e) { console.warn('menu action failed:', e); }
    });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  // Position
  menu.style.left = clientX + 'px';
  menu.style.top  = clientY + 'px';
  // outside-click to close
  const closeOnOutside = (ev) => {
    if (!menu.contains(ev.target)) cgCloseContextMenu();
  };
  setTimeout(() => document.addEventListener('mousedown', closeOnOutside), 0);
  g.contextMenuEl = menu;
  menu._closeOnOutside = closeOnOutside;
}

function cgCloseContextMenu() {
  if (g && g.contextMenuEl) {
    if (g.contextMenuEl._closeOnOutside) document.removeEventListener('mousedown', g.contextMenuEl._closeOnOutside);
    if (g.contextMenuEl.parentNode) g.contextMenuEl.parentNode.removeChild(g.contextMenuEl);
    g.contextMenuEl = null;
  }
}

function cgUpdateSelToolbar() {
  cgRemoveSelToolbar();
}

function cgRemoveSelToolbar() {
  if (g && g.selToolbarEl) {
    if (g.selToolbarEl.parentNode) g.selToolbarEl.parentNode.removeChild(g.selToolbarEl);
    g.selToolbarEl = null;
  }
}

// Right-pane Properties (visual only — basic inspector)
function cgRenderProperties() {
  if (!g || !g.rightPaneEl) return;
  const body = g.rightPaneEl.querySelector('#cg-rp-body');
  if (!body) return;
  if (!g.selectedId) {
    body.innerHTML = '<div class="cg-rp-empty">Click a node to inspect</div>';
    return;
  }
  const inst = findInstance(g.selectedId);
  if (!inst) {
    body.innerHTML = '<div class="cg-rp-empty">No selection</div>';
    return;
  }

  const safe = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sectionsHtml = [];

  if (inst.type === 'sb' && inst.sb) {
    const sbs = inst.scene.storyboardInstances || [];
    const sbIdx = sbs.indexOf(inst.sb);
    const letter = String.fromCharCode(65 + Math.max(0, sbIdx));
    const sceneIdx = (g.scenes || []).indexOf(inst.scene);
    const refUrl = inst.sb.refImageDataUrl;
    sectionsHtml.push(`
      <div class="cg-rp-h1">SB ${sceneIdx + 1}.${letter}</div>
      <div class="cg-rp-meta">${safe(inst.sb.status || 'pending')} · ${(inst.sb.imageInstances || []).length} image variant(s)</div>
      <div class="cg-rp-prompt-preview">${safe((inst.sb.prompt || '').slice(0, 240))}${(inst.sb.prompt||'').length > 240 ? '…' : ''}</div>
      <div class="cg-rp-section-label">Reference image</div>
      <div class="cg-rp-ref-row">
        ${refUrl ? `<img class="cg-rp-ref-thumb" src="${safe(refUrl)}" alt="ref">` : '<div class="cg-rp-empty-tile">none</div>'}
        <button class="cg-rp-btn" data-rp-act="sb-add-ref">+ Add reference</button>
      </div>
      <div class="cg-rp-section-label">Settings</div>
      <div class="cg-rp-row"><span class="cg-rp-k">Duration</span><span class="cg-rp-v">${(inst.sb.duration || 0).toFixed(1)}s</span></div>
      <div class="cg-rp-row"><span class="cg-rp-k">Style</span><span class="cg-rp-v">${safe(inst.sb.stylePreset || '—')}</span></div>
      <div class="cg-rp-actions">
        <button class="cg-rp-btn" data-rp-act="sb-edit">Edit</button>
        <button class="cg-rp-btn" data-rp-act="sb-regen">Regenerate</button>
        <button class="cg-rp-btn" data-rp-act="sb-add-variant">+ Variant</button>
        <button class="cg-rp-btn cg-rp-btn-danger" data-rp-act="sb-delete">Delete</button>
      </div>
    `);
  }
  else if (inst.type === 'img' && inst.img) {
    const sbs = inst.scene.storyboardInstances || [];
    const sb = inst.sb || sbs.find(s => s.imageInstances?.some(i => i.id === inst.img.id)) || sbs[0];
    const imgs = (sb && sb.imageInstances) || [];
    const sbIdx = sbs.indexOf(sb);
    const sbLetter = String.fromCharCode(65 + Math.max(0, sbIdx));
    const imgIdx = imgs.indexOf(inst.img) + 1;
    const sceneIdx = (g.scenes || []).indexOf(inst.scene);
    const dataUrl = inst.img.imgDataUrl || '';
    // Build thumbnail strip — every image variant clickable
    const stripHtml = imgs.map((im, i) => {
      const url = im.imgDataUrl || '';
      const cls = 'cg-rp-thumb' + (im.isRenderActive ? ' is-active' : '');
      return `<button class="${cls}" data-rp-img-thumb="${safe(im.id)}" title="Img ${i+1}">
        ${url ? `<img src="${safe(url)}" alt="">` : '<span class="cg-rp-thumb-num">'+(i+1)+'</span>'}
      </button>`;
    }).join('');
    sectionsHtml.push(`
      <div class="cg-rp-h1">Img ${sceneIdx + 1}.${sbLetter}.${imgIdx} <span class="cg-rp-active-pill">${inst.img.isRenderActive ? 'ACTIVE' : ''}</span></div>
      <div class="cg-rp-meta">${safe(inst.img.status || 'pending')} · ${imgs.length} variant(s)</div>
      <div class="cg-rp-preview-wrap">
        ${dataUrl ? `<img class="cg-rp-preview" src="${safe(dataUrl)}" alt="">` : '<div class="cg-rp-empty-tile">no image yet</div>'}
      </div>
      <div class="cg-rp-section-label">Variants — click to set active</div>
      <div class="cg-rp-thumb-strip">
        ${stripHtml}
        <button class="cg-rp-thumb cg-rp-thumb-add" data-rp-act="img-add-variation" title="New variation"><span class="cg-rp-thumb-add-icon">+</span><span class="cg-rp-thumb-add-label">Regenerate</span></button>
      </div>
      <div class="cg-rp-section-label">Master prompt (from storyboard)</div>
      <div class="cg-rp-prompt-readonly">${safe((sb && sb.prompt) || '(empty)')}</div>
      <div class="cg-rp-section-label">Tune for this variant</div>
      <textarea class="cg-rp-tune" id="cg-rp-tune" rows="4"
                placeholder="Empty → uses master prompt.&#10;Type to override for this variant only.&#10;e.g. &quot;...at dusk, dramatic lighting, narrow lens&quot;">${safe(inst.img.promptOverride || '')}</textarea>
      <div class="cg-rp-tune-row">
        <button class="cg-rp-btn cg-rp-btn-primary" data-rp-act="img-regen-with-tune">▶ Regenerate with this prompt</button>
      </div>
      <div class="cg-rp-actions">
        <button class="cg-rp-btn" data-rp-act="img-regen">Regenerate</button>
        <button class="cg-rp-btn" data-rp-act="img-add-variation">+ Variation</button>
        <button class="cg-rp-btn" data-rp-act="img-add-ref">+ Reference</button>
        <button class="cg-rp-btn" data-rp-act="img-download">Download</button>
        <button class="cg-rp-btn cg-rp-btn-danger" data-rp-act="img-delete">Delete</button>
      </div>
    `);
  }
  else if (inst.type === 'vid' && inst.vid) {
    const vid = inst.vid;
    // siblings = videos sourced from the same image
    const allVids = inst.scene.videoInstances || [];
    const siblings = vid.sourceImageInstanceId
      ? allVids.filter(v => v.sourceImageInstanceId === vid.sourceImageInstanceId)
      : allVids;
    const previewUrl = vid.videoUrl || '';
    // §8.7: sequential clip playback is a Phase 8 tracked sub-deliverable
    if (vid._stitchedVideoMissing && Array.isArray(vid.videoClips) && vid.videoClips.length > 1) {
      console.warn('[v4] Multi-clip scene: sequential playback pending, showing clip 1 only');
    }
    const stripHtml = siblings.map((v, i) => {
      const cls = 'cg-rp-thumb cg-rp-thumb-vid' + (v.isRenderActive ? ' is-active' : '');
      return `<button class="${cls}" data-rp-vid-thumb="${safe(v.id)}" title="Video ${i+1}">
        <span class="cg-rp-thumb-num">▶${i+1}</span>
      </button>`;
    }).join('');
    sectionsHtml.push(`
      <div class="cg-rp-h1">Video <span class="cg-rp-active-pill">${vid.isRenderActive ? 'ACTIVE' : ''}</span></div>
      <div class="cg-rp-meta">${safe(vid.status || 'pending')} · ${siblings.length} variant(s)</div>
      <div class="cg-rp-preview-wrap">
        ${previewUrl ? `<video class="cg-rp-preview" src="${safe(previewUrl)}" muted controls></video>` : '<div class="cg-rp-empty-tile">no video yet</div>'}
      </div>
      <div class="cg-rp-section-label">Variants — click to set active</div>
      <div class="cg-rp-thumb-strip">
        ${stripHtml}
        <button class="cg-rp-thumb cg-rp-thumb-add" data-rp-act="vid-add-variation" title="New video"><span class="cg-rp-thumb-add-icon">+</span><span class="cg-rp-thumb-add-label">Re-animate</span></button>
      </div>
      <div class="cg-rp-section-label">Motion prompt</div>
      <div class="cg-vid-prompt-group">
        <label class="cg-vid-prompt-label">Camera</label>
        <textarea class="cg-rp-tune cg-vid-prompt-field" id="cg-rp-camera" rows="2"
                  placeholder="Slow dolly-in, aerial crane, panning left…">${safe(vid.cameraPrompt || '')}</textarea>
        <label class="cg-vid-prompt-label">Motion</label>
        <textarea class="cg-rp-tune cg-vid-prompt-field" id="cg-rp-motion" rows="2"
                  placeholder="Subject walks forward, leaves flutter, coat sways…">${safe(vid.motionPrompt || '')}</textarea>
        <label class="cg-vid-prompt-label">Environment</label>
        <textarea class="cg-rp-tune cg-vid-prompt-field" id="cg-rp-environment" rows="2"
                  placeholder="Golden hour, soft fog, city bokeh…">${safe(vid.environmentPrompt || '')}</textarea>
        <label class="cg-vid-prompt-label">Negative</label>
        <textarea class="cg-rp-tune cg-vid-prompt-field" id="cg-rp-negative" rows="2"
                  placeholder="blur, jitter, watermark, text overlay…">${safe(vid.negativePrompt || '')}</textarea>
      </div>
      <div class="cg-rp-tune-row">
        <button class="cg-rp-btn cg-rp-btn-primary" data-rp-act="vid-regen-with-motion">▶ Re-animate with this motion</button>
      </div>
      <div class="cg-rp-section-label">Settings</div>
      <div class="cg-rp-row"><span class="cg-rp-k">Duration</span><span class="cg-rp-v">${(vid.duration || 0).toFixed(1)}s</span></div>
      <div class="cg-rp-row"><span class="cg-rp-k">Model</span><span class="cg-rp-v">${safe(vid.model || 'kling-2.5-turbo')}</span></div>
      <div class="cg-rp-actions">
        <button class="cg-rp-btn" data-rp-act="vid-regen">Re-animate</button>
        <button class="cg-rp-btn" data-rp-act="vid-add-variation">+ Variation</button>
        <button class="cg-rp-btn" data-rp-act="vid-download">Download</button>
        <button class="cg-rp-btn cg-rp-btn-danger" data-rp-act="vid-delete">Delete</button>
      </div>
    `);
  }
  else if (inst.type === 'final') {
    sectionsHtml.push(`
      <div class="cg-rp-h1">Final Render</div>
      <div class="cg-rp-meta">Output video</div>
      <div class="cg-rp-section-label">Settings</div>
      <div class="cg-rp-row"><span class="cg-rp-k">Resolution</span><span class="cg-rp-v">${safe((g && g.job && g.job.exportResolution) || '1080p')}</span></div>
      <div class="cg-rp-row"><span class="cg-rp-k">FPS</span><span class="cg-rp-v">${safe((g && g.job && g.job.exportFps) || 30)}</span></div>
      <div class="cg-rp-meta" style="margin:12px 0 8px;">BGM, voiceover languages and subtitle tracks are configured in the Timeline.</div>
      <div class="cg-rp-actions">
        <button class="cg-rp-btn cg-rp-btn-primary" data-rp-act="final-send-timeline">→ Send to Timeline</button>
      </div>
    `);
  }
  else {
    sectionsHtml.push(`<div class="cg-rp-empty">Selection: ${safe(inst.type)}</div>`);
  }

  body.innerHTML = sectionsHtml.join('');

  // Wire up clicks (delegated)
  // Live-save the IMG Tune textarea onto promptOverride.
  // Debounced through triggerSave so keystrokes don't thrash disk.
  const tuneTa = body.querySelector('#cg-rp-tune');
  if (tuneTa) {
    tuneTa.addEventListener('input', () => {
      const cur = findInstance(g.selectedId);
      if (cur && cur.img) {
        cur.img.promptOverride = tuneTa.value || '';
        if (window._actions?.triggerSave) window._actions.triggerSave();
      }
    });
  }
  // Live-save the 4 VID structured prompt fields.
  ['camera', 'motion', 'environment', 'negative'].forEach(field => {
    const ta = body.querySelector('#cg-rp-' + field);
    if (!ta) return;
    ta.addEventListener('input', () => {
      const cur = findInstance(g.selectedId);
      if (cur && cur.vid) {
        cur.vid[field + 'Prompt'] = ta.value || '';
        if (window._actions?.triggerSave) window._actions.triggerSave();
      }
    });
  });

  // BGM volume slider
  const bgmVolSlider = body.querySelector('#cg-rp-bgm-vol');
  if (bgmVolSlider) {
    bgmVolSlider.addEventListener('input', () => {
      const v = parseInt(bgmVolSlider.value, 10);
      const label = body.querySelector('#cg-rp-bgm-vol-val');
      if (label) label.textContent = v + '%';
      window.bgmVolume = v / 100;
      // Sync to the legacy BGM volume DOM element if present
      const legacySlider = document.getElementById('bgm-volume');
      if (legacySlider) { legacySlider.value = v; legacySlider.dispatchEvent(new Event('input')); }
      const legacyLabel = document.getElementById('bgm-volume-label');
      if (legacyLabel) legacyLabel.textContent = v + '%';
      // Sync canvas card vol text
      if (g.bgmEl) {
        const vt = g.bgmEl.querySelector('[data-role="bgm-vol-text"]');
        if (vt) vt.textContent = v + '%';
      }
      triggerSave();
    });
  }

  // Sub style controls — write to createJobState.subtitleStyle + hidden create-sub-* elements
  function _syncSubStyle(field, value) {
    window.createJobState = window.createJobState || {};
    window.createJobState.subtitleStyle = window.createJobState.subtitleStyle || {};
    window.createJobState.subtitleStyle[field] = value;
    // Mirror to hidden create-sub-* element (read by 17d-create-languages.js)
    const fieldMap = {
      font: 'create-sub-font', size: 'create-sub-size', color: 'create-sub-color',
      strokeW: 'create-sub-stroke-w', bgAlpha: 'create-sub-bg-alpha',
      pos: 'create-sub-position', bold: 'create-sub-bold', allCaps: 'create-sub-all-caps',
    };
    const elId = fieldMap[field];
    if (elId) {
      const el = document.getElementById(elId);
      if (el) {
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = value;
      }
    }
    triggerSave();
  }
  function _applySubPreset(preset) {
    const presets = {
      hormozi: { font: 'Anton', size: 48, color: '#ffffff', strokeW: 0, bgAlpha: 0, pos: 'bot-center', bold: true, allCaps: true },
      classic: { font: "'Noto Sans Tamil', sans-serif", size: 32, color: '#ffffff', strokeW: 2, bgAlpha: 0.5, pos: 'bot-center', bold: true, allCaps: false },
      karaoke: { font: "'Noto Sans Tamil', sans-serif", size: 28, color: '#ffffff', strokeW: 2, bgAlpha: 0.5, pos: 'bot-center', bold: false, allCaps: false },
      bold:    { font: 'Poppins', size: 42, color: '#ffffff', strokeW: 2, bgAlpha: 0.6, pos: 'center', bold: true, allCaps: true },
      minimal: { font: 'Inter', size: 28, color: '#ffffff', strokeW: 0, bgAlpha: 0, pos: 'bot-center', bold: false, allCaps: false },
    };
    const p = presets[preset];
    if (!p) return;
    Object.entries(p).forEach(([k, v]) => _syncSubStyle(k, v));
    // Reflect in the panel controls
    const fMap = { font: '#cg-rp-sub-font', size: '#cg-rp-sub-size', color: '#cg-rp-sub-color',
      strokeW: '#cg-rp-sub-stroke-w', bgAlpha: '#cg-rp-sub-bg-alpha', pos: '#cg-rp-sub-pos' };
    Object.entries(fMap).forEach(([k, sel]) => {
      const ctrl = body.querySelector(sel);
      if (ctrl) ctrl.value = p[k];
    });
    const boldCb = body.querySelector('#cg-rp-sub-bold');
    if (boldCb) boldCb.checked = p.bold;
    const capsCb = body.querySelector('#cg-rp-sub-all-caps');
    if (capsCb) capsCb.checked = p.allCaps;
  }
  [
    ['#cg-rp-sub-preset',   'change', (v) => { _syncSubStyle('preset', v); _applySubPreset(v); }],
    ['#cg-rp-sub-font',     'change', (v) => _syncSubStyle('font', v)],
    ['#cg-rp-sub-pos',      'change', (v) => _syncSubStyle('pos', v)],
    ['#cg-rp-sub-size',     'input',  (v) => _syncSubStyle('size', parseInt(v, 10))],
    ['#cg-rp-sub-color',    'input',  (v) => _syncSubStyle('color', v)],
    ['#cg-rp-sub-stroke-w', 'input',  (v) => _syncSubStyle('strokeW', parseInt(v, 10))],
    ['#cg-rp-sub-bg-alpha', 'input',  (v) => _syncSubStyle('bgAlpha', parseFloat(v))],
  ].forEach(([sel, evt, fn]) => {
    const ctrl = body.querySelector(sel);
    if (ctrl) ctrl.addEventListener(evt, () => fn(ctrl.value));
  });
  const boldCb = body.querySelector('#cg-rp-sub-bold');
  if (boldCb) boldCb.addEventListener('change', () => _syncSubStyle('bold', boldCb.checked));
  const capsCb = body.querySelector('#cg-rp-sub-all-caps');
  if (capsCb) capsCb.addEventListener('change', () => _syncSubStyle('allCaps', capsCb.checked));
  // Animated-mode subtitle language + format selects
  const subLangSel = body.querySelector('#cg-rp-sub-lang');
  if (subLangSel) subLangSel.addEventListener('change', () => {
    window.createJobState = window.createJobState || {};
    window.createJobState.subtitleLang = subLangSel.value;
    if (g.subEl) { const ll = g.subEl.querySelector('[data-role="sub-lang-line"]'); if (ll) ll.textContent = subLangSel.value || 'None'; }
    triggerSave();
  });
  const subFmtSel = body.querySelector('#cg-rp-sub-fmt');
  if (subFmtSel) subFmtSel.addEventListener('change', () => {
    window.createJobState = window.createJobState || {};
    window.createJobState.subtitleFormat = subFmtSel.value;
    if (g.subEl) { const fl = g.subEl.querySelector('[data-role="sub-fmt-line"]'); if (fl) fl.textContent = subFmtSel.value; }
    triggerSave();
  });

  body.querySelectorAll('[data-rp-act], [data-rp-img-thumb], [data-rp-vid-thumb]').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      const act = b.dataset.rpAct;
      const imgThumb = b.dataset.rpImgThumb;
      const vidThumb = b.dataset.rpVidThumb;
      const i = findInstance(g.selectedId);
      if (!i) return;
      if (imgThumb && i.scene) {
        // setImageRenderActive(scene, imgId) — 2 args. Was wrongly passing
        // 3 (scene, sb, imgId) which flipped every image to inactive.
        if (window.CanvasState && CanvasState.setImageRenderActive) {
          CanvasState.setImageRenderActive(i.scene, imgThumb);
        }
        if (window.CanvasGraph && window.CanvasGraph.refresh) window.CanvasGraph.refresh();
        return;
      }
      if (vidThumb && i.scene) {
        if (window.CanvasState && CanvasState.setVideoRenderActive) {
          CanvasState.setVideoRenderActive(i.scene, vidThumb);
        }
        if (window.CanvasGraph && window.CanvasGraph.refresh) window.CanvasGraph.refresh();
        return;
      }
      if (!act) return;
      try {
        if (act === 'sb-edit')           window.sbActions.edit?.(i.scene, i.sb?.id);
        else if (act === 'sb-add-ref')   window.sbActions.addRef?.(i.scene, i.sb?.id);
        else if (act === 'sb-regen')     window.sbActions.regen?.(i.scene);
        else if (act === 'sb-add-variant') window.sbActions.addVariant?.(i.scene);
        else if (act === 'sb-delete')    window.sbActions.delete?.(i.scene, i.sb?.id);
        else if (act === 'img-regen')    window.imgActions.regen?.(i.scene, i.sb, i.img);
        else if (act === 'img-regen-with-tune') {
          // Save the tune onto the active image, then regen.
          const ta = body.querySelector('#cg-rp-tune');
          if (ta && i.img) {
            i.img.promptOverride = ta.value || '';
            if (window._actions?.triggerSave) window._actions.triggerSave();
          }
          window.imgActions.regen?.(i.scene, i.sb, i.img);
        }
        else if (act === 'img-add-variation') window.imgActions.addVariation?.(i.scene, i.sb?.id);
        else if (act === 'img-add-ref')  window.sbActions.addRef?.(i.scene, i.sb?.id);
        else if (act === 'img-download') window.imgActions.download?.(i.scene, i.img);
        else if (act === 'img-delete')   window.imgActions.delete?.(i.scene, i.sb, i.img);
        else if (act === 'vid-regen')    window.vidActions.regen?.(i.scene, i.vid);
        else if (act === 'vid-regen-with-motion') {
          if (i.vid) {
            i.vid.cameraPrompt = body.querySelector('#cg-rp-camera')?.value || '';
            i.vid.motionPrompt = body.querySelector('#cg-rp-motion')?.value || '';
            i.vid.environmentPrompt = body.querySelector('#cg-rp-environment')?.value || '';
            i.vid.negativePrompt = body.querySelector('#cg-rp-negative')?.value || '';
            if (window._actions?.triggerSave) window._actions.triggerSave();
          }
          window.vidActions.regen?.(i.scene, i.vid);
        }
        else if (act === 'vid-add-variation') window.vidActions.addVariation?.(i.scene, i.vid?.sourceImageInstanceId);
        else if (act === 'vid-download') window.vidActions.download?.(i.scene, i.vid);
        else if (act === 'vid-delete')   window.vidActions.delete?.(i.scene, i.vid);
        else if (act === 'final-render')        window.finalActions.render?.();
        else if (act === 'final-download')      window.finalActions.download?.();
        else if (act === 'final-send-timeline') window._cgSendToTimeline?.();
      } catch (err) {
        console.warn('[cg right-pane action]', act, err);
      }
    });
  });
}

// ════ Stepper handlers ══════════════════════════════════════════════════════

function handleStepper(arrow) {
  const stepper = arrow.closest('.cg-stepper');
  if (!stepper) return;
  const field = stepper.dataset.field;
  const dir = arrow.classList.contains('cg-arr-r') ? 1 : -1;
  const node = arrow.closest('.cg-node');
  if (!node) return;
  const id = node.dataset.id;
  const inst = findInstance(id);
  if (!inst) return;

  if (inst.type === 'sb' && field === 'duration') {
    window.sbActions.setDuration && window.sbActions.setDuration(inst.scene, inst.sb, dir);
  } else if (inst.type === 'sb' && field === 'style') {
    window.sbActions.setStyle && window.sbActions.setStyle(inst.scene, inst.sb, dir);
  } else if (inst.type === 'img' && field === 'ratio') {
    window.imgActions.setRatio && window.imgActions.setRatio(inst.scene, inst.img, dir);
  } else if (inst.type === 'img' && field === 'seed') {
    window.imgActions.setSeed && window.imgActions.setSeed(inst.scene, inst.img, dir);
  } else if (inst.type === 'vid' && field === 'duration') {
    window.vidActions.setDuration && window.vidActions.setDuration(inst.scene, inst.vid, dir);
  } else if (inst.type === 'vid' && field === 'model') {
    window.vidActions.setModel && window.vidActions.setModel(inst.scene, inst.vid, dir);
  } else if (inst.type === 'bgm' && field === 'style') {
    window.bgmActions.setStyle && window.bgmActions.setStyle(dir);
  } else if (inst.type === 'bgm' && field === 'volume') {
    window.bgmActions.setVolume && window.bgmActions.setVolume(dir);
  } else if (inst.type === 'final' && field === 'resolution') {
    window.finalActions.setResolution && window.finalActions.setResolution(dir);
  } else if (inst.type === 'final' && field === 'fps') {
    window.finalActions.setFps && window.finalActions.setFps(dir);
  }
}

function handleBatchDelete() {
  const ids = Array.from(g.selectedIds);
  if (ids.length === 0) return;
  const msg = ids.length === 1
    ? 'Delete the selected item?'
    : `Delete ${ids.length} selected items?`;
  if (!window.confirm(msg)) return;
  window.__cgBatchDelete = true;
  try {
    ids.forEach(id => {
      const inst = findInstance(id);
      if (!inst) return;
      if (inst.type === 'sb') window.sbActions.delete && window.sbActions.delete(inst.scene, inst.sb.id);
      else if (inst.type === 'img') window.imgActions.delete && window.imgActions.delete(inst.scene, inst.sb, inst.img);
      else if (inst.type === 'vid') window.vidActions.delete && window.vidActions.delete(inst.scene, inst.vid);
      else {
        // singletons get a toast
        cgToast('Cannot delete singleton: ' + inst.type);
      }
    });
  } finally {
    window.__cgBatchDelete = false;
  }
  clearSelection();
  runLayout();
  renderAll();
  triggerSave();
}

function handleRegenSelected() {
  const id = g.selectedId;
  if (!id) return;
  const inst = findInstance(id);
  if (!inst) return;
  if (inst.type === 'img') window.imgActions.regen(inst.scene, inst.sb, inst.img);
  else if (inst.type === 'vid') window.vidActions.regen(inst.scene, inst.vid);
}

function cgToast(msg) {
  let t = document.querySelector('.cg-toast');
  if (!t) {
    t = el('div', 'cg-toast');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(cgToast._tid);
  cgToast._tid = setTimeout(() => t.classList.remove('show'), 2200);
}

// ════ SECTION 12 — Floating chrome wiring ══════════════════════════════════

function cgChromeMount() {
  const cgChrome = {
    cursorMode: 'pan',           // ← regression fix per ADR-2 / phase 04
    rafId: 0,
    fpsLastT: performance.now(),
    fpsFrames: 0,
    fpsValue: 0,
    telemetryThrottle: 0,
    mountTime: Date.now(),
    outsideClickHandler: null,
  };
  g.cgChrome = cgChrome;

  // Cursor-mode dropdown
  const cursorBtn = $('cg-zoom-cursor-btn');
  const cursorMenu = $('cg-zoom-cursor-menu');
  const cursorLabel = $('cg-zoom-cursor-label');
  if (cursorBtn && cursorMenu) {
    // Reflect default
    if (cursorLabel) cursorLabel.textContent = 'Pan';
    cursorBtn.setAttribute('aria-expanded', 'false');
    cursorBtn.addEventListener('click', () => {
      const open = cursorMenu.hasAttribute('hidden') ? false : true;
      if (open) {
        cursorMenu.setAttribute('hidden', '');
        cursorBtn.setAttribute('aria-expanded', 'false');
      } else {
        cursorMenu.removeAttribute('hidden');
        cursorBtn.setAttribute('aria-expanded', 'true');
      }
    });
    cursorMenu.querySelectorAll('button[data-mode]').forEach(b => {
      b.addEventListener('click', () => {
        const m = b.dataset.mode;
        if (m === 'connect') return;
        cgChrome.cursorMode = m;
        window.CanvasGraph._cursorMode = m;
        if (cursorLabel) cursorLabel.textContent = m === 'select' ? 'Select' : 'Pan';
        cursorMenu.setAttribute('hidden', '');
        cursorBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Zoom percentage dropdown
  const pctBtn = $('cg-zoom-pct-btn');
  const pctMenu = $('cg-zoom-pct-menu');
  if (pctBtn && pctMenu) {
    pctBtn.addEventListener('click', () => {
      const open = pctMenu.hasAttribute('hidden') ? false : true;
      if (open) {
        pctMenu.setAttribute('hidden', '');
        pctBtn.setAttribute('aria-expanded', 'false');
      } else {
        pctMenu.removeAttribute('hidden');
        pctBtn.setAttribute('aria-expanded', 'true');
      }
    });
    pctMenu.querySelectorAll('button[data-z]').forEach(b => {
      b.addEventListener('click', () => {
        const z = parseFloat(b.dataset.z);
        setZoom(z);
        pctMenu.setAttribute('hidden', '');
        pctBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Fit / Reset buttons
  const fitBtn = $('cg-zoom-fit');
  if (fitBtn) fitBtn.addEventListener('click', fitToView);
  const resetBtn = $('cg-zoom-reset');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    g.zoom = 1.0;
    g.panX = 0;
    g.panY = 0;
    applyTransform();
  });
  const minimapBtn = $('cg-zoom-minimap');
  if (minimapBtn) minimapBtn.addEventListener('click', () => cgToast('Minimap coming soon'));

  // Pane toggle
  const paneToggle = $('cg-pill-pane-toggle');
  if (paneToggle && g.rightPaneEl) {
    paneToggle.addEventListener('click', () => {
      g.rightPaneEl.classList.toggle('cg-collapsed');
    });
  }

  // Outside click to close menus
  cgChrome.outsideClickHandler = (ev) => {
    if (cursorMenu && !cursorMenu.hasAttribute('hidden')
        && !cursorMenu.contains(ev.target) && ev.target !== cursorBtn) {
      cursorMenu.setAttribute('hidden', '');
      if (cursorBtn) cursorBtn.setAttribute('aria-expanded', 'false');
    }
    if (pctMenu && !pctMenu.hasAttribute('hidden')
        && !pctMenu.contains(ev.target) && ev.target !== pctBtn) {
      pctMenu.setAttribute('hidden', '');
      if (pctBtn) pctBtn.setAttribute('aria-expanded', 'false');
    }
  };
  document.addEventListener('mousedown', cgChrome.outsideClickHandler);

  // Telemetry rAF probe (throttled to ~10Hz)
  function tlmTick() {
    if (!g || !g.cgChrome) return;
    cgChrome.fpsFrames++;
    const now = performance.now();
    if (now - cgChrome.fpsLastT >= 500) {
      cgChrome.fpsValue = Math.round((cgChrome.fpsFrames * 1000) / (now - cgChrome.fpsLastT));
      cgChrome.fpsFrames = 0;
      cgChrome.fpsLastT = now;
      // Update telemetry strings ~2x per second
      const tT = $('cg-tlm-time');
      if (tT) {
        const sec = Math.floor((Date.now() - cgChrome.mountTime) / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        tT.textContent = m + ':' + (s < 10 ? '0' + s : s);
      }
      const tI = $('cg-tlm-images');
      if (tI && g.scenes) {
        let total = 0, done = 0;
        g.scenes.forEach(scene => {
          const sb = (scene.storyboardInstances || []).find(s => s.isActive);
          if (sb) {
            sb.imageInstances.forEach(im => { total++; if (im.status === 'done') done++; });
          }
        });
        tI.textContent = done + ' / ' + total;
      }
      const tN = $('cg-tlm-nodes');
      if (tN) tN.textContent = String(g.nodeEls.size);
      const tV = $('cg-tlm-version');
      if (tV) tV.textContent = 'v' + CANVAS_RENDERER_VERSION;
      const tF = $('cg-tlm-fps');
      if (tF) tF.textContent = String(cgChrome.fpsValue);
    }
    cgChrome.rafId = requestAnimationFrame(tlmTick);
  }
  cgChrome.rafId = requestAnimationFrame(tlmTick);
}

function cgChromeUnmount() {
  if (!g || !g.cgChrome) return;
  if (g.cgChrome.rafId) cancelAnimationFrame(g.cgChrome.rafId);
  if (g.cgChrome.outsideClickHandler) document.removeEventListener('mousedown', g.cgChrome.outsideClickHandler);
  g.cgChrome = null;
}

function chromeSetActiveCount(n) {
  const status = $('cg-pill-status');
  if (!status) return;
  const txt = status.querySelector('.cg-status-text');
  if (txt) txt.textContent = (n | 0) + ' active';
  if (n > 0) status.classList.add('is-active');
  else status.classList.remove('is-active');
}

// ════ SECTION 13 — Canonical *Actions registration ═════════════════════════

window.CanvasGraph = window.CanvasGraph || {};
window.CanvasGraph._actions = window.CanvasGraph._actions || {};

const _actions = window.CanvasGraph._actions;

// Internal do* — the real implementations.
_actions.regenImage = async function (scene, sb, img) {
  if (!scene || !img) return;
  if (typeof window.regenerateScene === 'function') {
    const idx = (g && g.scenes) ? g.scenes.indexOf(scene) : -1;
    if (idx >= 0) {
      try { await window.regenerateScene(idx); } catch (e) { console.warn('regen failed', e); }
    }
  } else if (window.CanvasConsistency && window.CanvasConsistency.regenerateImageInstance) {
    const idx = (g && g.scenes) ? g.scenes.indexOf(scene) : -1;
    await window.CanvasConsistency.regenerateImageInstance({
      scenes: g.scenes,
      sceneIdx: idx,
      imageInstance: img,
      geminiKey: g.geminiKey,
      width: 1920,
      height: 1080,
      stylePrompt: window.createStylePreset || '',
    });
    CanvasState.syncMirrorFields(scene, g.mode);
    renderAll();
    triggerSave();
  }
};

_actions.reanimateVideo = async function (scene, vid) {
  if (!scene || !vid) return;
  if (typeof window.regenerateScene === 'function') {
    const idx = (g && g.scenes) ? g.scenes.indexOf(scene) : -1;
    if (idx >= 0) {
      try { await window.regenerateScene(idx); } catch (e) { console.warn('reanim failed', e); }
    }
  }
};

_actions.deleteSB = function (scene, sbId) {
  if (!CanvasState.deleteStoryboardInstance(scene, sbId)) {
    cgToast('Cannot delete the last storyboard');
    return false;
  }
  CanvasState.normalizeSceneFlags(scene, g.mode);
  CanvasState.syncMirrorFields(scene, g.mode);
  return true;
};

_actions.deleteImage = function (scene, sb, img) {
  if (!CanvasState.deleteImageInstance(scene, img.id)) {
    cgToast('Cannot delete the last image');
    return false;
  }
  CanvasState.normalizeSceneFlags(scene, g.mode);
  CanvasState.syncMirrorFields(scene, g.mode);
  return true;
};

_actions.deleteVideo = function (scene, vid) {
  if (!CanvasState.deleteVideoInstance(scene, vid.id)) {
    cgToast('Cannot delete the last video');
    return false;
  }
  CanvasState.normalizeSceneFlags(scene, g.mode);
  CanvasState.syncMirrorFields(scene, g.mode);
  return true;
};

_actions.addImageInstance = function (scene, sbId, opts) {
  const img = CanvasState.addImageInstance(scene, sbId, opts);
  CanvasState.normalizeSceneFlags(scene, g.mode);
  CanvasState.syncMirrorFields(scene, g.mode);
  return img;
};

_actions.downloadImage = function (img) {
  if (!img || !img.imgDataUrl) return;
  const a = document.createElement('a');
  a.href = img.imgDataUrl;
  a.download = (img.id || 'image') + '.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

_actions.downloadVideo = function (vid) {
  const url = vid && vid.clips && vid.clips[0] && vid.clips[0].url;
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = (vid.id || 'video') + '.mp4';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

_actions.runExport = function () {
  if (typeof window.exportFinalRender === 'function') window.exportFinalRender();
};

_actions.sendToEditor = function () {
  const btn = $('btn-create-send-editor');
  if (btn) btn.click();
};

_actions.triggerSave = function () { triggerSave(); };
_actions.runLayout = runLayout;
_actions.renderAll = renderAll;

// Public action namespaces — idempotent registration.
window.sbActions    = window.sbActions    || {};
window.imgActions   = window.imgActions   || {};
window.vidActions   = window.vidActions   || {};
window.bgmActions   = window.bgmActions   || {};
window.subActions   = window.subActions   || {};
window.finalActions = window.finalActions || {};

if (!window.sbActions.addVariant) {
  window.sbActions.addVariant = function (scene, opts) {
    const sb = CanvasState.addStoryboardInstance(scene, opts || {});
    CanvasState.setActiveStoryboard(scene, sb.id);
    CanvasState.normalizeSceneFlags(scene, g.mode);
    CanvasState.ensurePendingImages([scene], { stylePreset: window.createStylePreset || '' });
    CanvasState.syncMirrorFields(scene, g.mode);
    runLayout();
    renderAll();
    triggerSave();
    return sb;
  };
}
if (!window.sbActions.delete) {
  window.sbActions.delete = function (scene, sbId) {
    if (!window.__cgBatchDelete) {
      if (!window.confirm('Delete this storyboard variant?')) return false;
    }
    const ok = _actions.deleteSB(scene, sbId);
    if (ok) { runLayout(); renderAll(); triggerSave(); }
    return ok;
  };
}
if (!window.sbActions.edit) {
  window.sbActions.edit = function (scene, sb) {
    const node = sb && g.nodeEls.get(sb.id);
    const ta = node && node.el.querySelector('.cg-prompt');
    if (ta) ta.focus();
  };
}
if (!window.sbActions.addRef) {
  window.sbActions.addRef = function (scene, sb) {
    const node = sb && g.nodeEls.get(sb.id);
    const inp = node && node.el.querySelector('.cg-sb-ref-input');
    if (inp) inp.click();
  };
}
if (!window.sbActions.regen) {
  window.sbActions.regen = function (scene, sb) {
    const activeImg = (sb.imageInstances || []).find(i => i.isRenderActive) || (sb.imageInstances || [])[0];
    if (activeImg) _actions.regenImage(scene, sb, activeImg);
  };
}
if (!window.sbActions.setDuration) {
  window.sbActions.setDuration = function (scene, sb, dir) {
    const cur = typeof scene.duration === 'number' ? scene.duration : 6;
    scene.duration = Math.max(1, Math.min(60, cur + dir));
    renderAll();
    triggerSave();
  };
}
if (!window.sbActions.setStyle) {
  window.sbActions.setStyle = function (scene, sb, dir) {
    cgToast('Style is set globally in Storyboard step');
  };
}

if (!window.imgActions.regen) {
  window.imgActions.regen = function (scene, sb, img) {
    return _actions.regenImage(scene, sb, img);
  };
}
if (!window.imgActions.addVariation) {
  window.imgActions.addVariation = async function (scene, sbId, opts) {
    const img = _actions.addImageInstance(scene, sbId, opts || { status: 'pending' });
    if (img) {
      // Set as render active
      CanvasState.setImageRenderActive(scene, img.id);
      runLayout();
      renderAll();
      triggerSave();
      // Trigger generation
      const sb = (scene.storyboardInstances || []).find(s => s.id === sbId);
      if (sb) {
        try {
          await _actions.regenImage(scene, sb, img);
        } catch (e) {
          console.warn('addVariation gen failed', e);
        }
      }
    }
    return img;
  };
}
if (!window.imgActions.download) {
  window.imgActions.download = function (img) { _actions.downloadImage(img); };
}
if (!window.imgActions.delete) {
  window.imgActions.delete = function (scene, sb, img) {
    if (!window.__cgBatchDelete) {
      if (!window.confirm('Delete this image variant?')) return false;
    }
    const ok = _actions.deleteImage(scene, sb, img);
    if (ok) { runLayout(); renderAll(); triggerSave(); }
    return ok;
  };
}
if (!window.imgActions.setRatio) {
  window.imgActions.setRatio = function (scene, img, dir) {
    const ratios = ['16:9', '9:16', '1:1', '4:5', '3:2'];
    const cur = scene.aspect || '16:9';
    let i = ratios.indexOf(cur);
    if (i < 0) i = 0;
    i = (i + dir + ratios.length) % ratios.length;
    scene.aspect = ratios[i];
    renderAll();
    triggerSave();
  };
}
if (!window.imgActions.setSeed) {
  window.imgActions.setSeed = function (scene, img, dir) {
    const cur = (img.seed != null) ? img.seed : 0;
    img.seed = cur + dir;
    renderAll();
    triggerSave();
  };
}

if (!window.vidActions.regen) {
  window.vidActions.regen = function (scene, vid) {
    if (vid) {
      const parts = [vid.cameraPrompt, vid.motionPrompt, vid.environmentPrompt].filter(Boolean);
      scene.motionPrompt = parts.join('. ') || vid.motionPrompt || scene.prompt || '';
      scene.negativePrompt = vid.negativePrompt || '';
    }
    return _actions.reanimateVideo(scene, vid);
  };
}
if (!window.vidActions.addVariation) {
  window.vidActions.addVariation = async function (scene, sourceImageInstanceId, opts) {
    const vid = CanvasState.addVideoInstance(scene, sourceImageInstanceId, opts || {});
    if (vid) {
      CanvasState.setVideoRenderActive(scene, vid.id);
      CanvasState.normalizeSceneFlags(scene, g.mode);
      CanvasState.syncMirrorFields(scene, g.mode);
      runLayout();
      renderAll();
      triggerSave();
      // Trigger video gen via animateScenes. Assemble structured fields into prose.
      if (typeof window.animateScenes === 'function') {
        if (vid) {
          const parts = [vid.cameraPrompt, vid.motionPrompt, vid.environmentPrompt].filter(Boolean);
          scene.motionPrompt = parts.join('. ') || vid.motionPrompt || scene.prompt || '';
          scene.negativePrompt = vid.negativePrompt || '';
        }
        try {
          await window.animateScenes([scene], () => {}, g.geminiKey);
          CanvasState.syncMirrorFields(scene, g.mode);
          renderAll();
          triggerSave();
        } catch (e) {
          console.warn('vid addVariation failed', e);
          // cleanup partial
          CanvasState.deleteVideoInstance(scene, vid.id);
        }
      }
    }
    return vid;
  };
}
if (!window.vidActions.download) {
  window.vidActions.download = function (vid) { _actions.downloadVideo(vid); };
}
if (!window.vidActions.delete) {
  window.vidActions.delete = function (scene, vid) {
    if (!window.__cgBatchDelete) {
      if (!window.confirm('Delete this video variant?')) return false;
    }
    const ok = _actions.deleteVideo(scene, vid);
    if (ok) { runLayout(); renderAll(); triggerSave(); }
    return ok;
  };
}
if (!window.vidActions.setDuration) {
  window.vidActions.setDuration = function (scene, vid, dir) {
    const opts = [2, 4, 5, 6, 8];
    const cur = vid.duration || 5;
    let i = opts.indexOf(cur);
    if (i < 0) i = 2;
    i = Math.max(0, Math.min(opts.length - 1, i + dir));
    vid.duration = opts[i];
    renderAll();
    triggerSave();
  };
}
if (!window.vidActions.setModel) {
  window.vidActions.setModel = function (scene, vid, dir) {
    const opts = ['veo3', 'veo3-fast', 'kling2.5'];
    const cur = vid.model || 'veo3';
    let i = opts.indexOf(cur);
    if (i < 0) i = 0;
    i = (i + dir + opts.length) % opts.length;
    vid.model = opts[i];
    renderAll();
    triggerSave();
  };
}

if (!window._cgSendToTimeline) {
  window._cgSendToTimeline = function () {
    if (window.closeCanvasPanel) window.closeCanvasPanel();
    // Animated mode: show the video review step (Step 7 — Animate Scenes)
    // Illustrated mode: show the language/voiceover step
    const isAnimated = window.createVideoMode === 'animated';
    const targetId = isAnimated ? 'create-video-step' : 'create-language-step';
    const step = document.getElementById(targetId);
    if (step) {
      step.style.display = '';
      setTimeout(() => step.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
  };
}

if (!window.finalActions.render) {
  window.finalActions.render = function () {
    _actions.runExport();
  };
}
if (!window.finalActions.download) {
  window.finalActions.download = function () { _actions.sendToEditor(); };
}
if (!window.finalActions.cancel) {
  window.finalActions.cancel = function () {
    if (typeof window.generateRunning !== 'undefined') {
      try { window.generateRunning = false; } catch (_) {}
    }
  };
}
if (!window.finalActions.setResolution) {
  window.finalActions.setResolution = function (dir) {
    const opts = ['720p', '1080p', '1440p', '4k'];
    window.createFinalResolution = window.createFinalResolution || '1080p';
    let i = opts.indexOf(window.createFinalResolution);
    if (i < 0) i = 1;
    i = (i + dir + opts.length) % opts.length;
    window.createFinalResolution = opts[i];
    renderAll();
    triggerSave();
  };
}
if (!window.finalActions.setFps) {
  window.finalActions.setFps = function (dir) {
    const opts = [24, 30, 60];
    window.createFinalFps = window.createFinalFps || 30;
    let i = opts.indexOf(window.createFinalFps);
    if (i < 0) i = 1;
    i = (i + dir + opts.length) % opts.length;
    window.createFinalFps = opts[i];
    renderAll();
    triggerSave();
  };
}

// ════ SECTION 14 — Mirror state to legacy fields + persistence ═════════════

function triggerSave() {
  if (!g) return;
  if (g.saveTimer) clearTimeout(g.saveTimer);
  g.saveTimer = setTimeout(() => {
    g.saveTimer = 0;
    if (typeof window.projectAutosave === 'function') {
      try { window.projectAutosave(); } catch (e) { /* swallow */ }
    } else if (typeof window.saveProject === 'function') {
      try { window.saveProject(); } catch (e) { /* swallow */ }
    }
  }, SAVE_DEBOUNCE_MS);
}

// ════ Public API: notifyImageReady ═════════════════════════════════════════

function notifyImageReady(sceneIdx) {
  if (!g || !g.scenes) return;
  const scene = g.scenes[sceneIdx];
  if (!scene) return;
  // Mirror legacy → render-active imageInstance
  const sb = (scene.storyboardInstances || []).find(s => s.isActive)
          || (scene.storyboardInstances || [])[0];
  if (!sb) return;
  const renderImg = (sb.imageInstances || []).find(i => i.isRenderActive)
                 || (sb.imageInstances || [])[0];
  if (!renderImg) return;
  // Pull the legacy fields back into the instance
  if (scene.imgDataUrl && scene.imgDataUrl !== renderImg.imgDataUrl) {
    renderImg.imgDataUrl = scene.imgDataUrl;
  }
  if (scene.status) {
    renderImg.status = scene.status === 'done' ? 'done'
                    : scene.status === 'error' ? 'error'
                    : scene.status === 'generating' ? 'generating'
                    : renderImg.status;
  }
  // Update only this scene's nodes
  const node = g.nodeEls.get(renderImg.id);
  if (node && node.el) {
    updateImgNode(node.el, scene, sceneIdx, sb, renderImg);
  }
  const sbNode = g.nodeEls.get(sb.id);
  if (sbNode && sbNode.el) updateSBNode(sbNode.el, scene, sb, sceneIdx);
  // Refresh tray (thumb image swap)
  ensureImgVariantTray(scene, sceneIdx, sb);
  // Curves may need a re-stroke if status flipped
  redrawCurves();
  // If the inspected node is the variant whose image just landed, refresh
  // the right pane (preview / status / thumbnail ring all update in place).
  if (g.selectedId === renderImg.id || g.selectedId === sb.id) {
    cgRenderProperties();
  }
}

// ════ Public API: notifyVideoReady ═════════════════════════════════════════

function notifyVideoReady(sceneIdx) {
  if (!g || !g.scenes) return;
  const scene = g.scenes[sceneIdx];
  if (!scene) return;
  const vid = (scene.videoInstances || []).find(v => v.isRenderActive)
           || (scene.videoInstances || [])[0];
  if (vid) {
    if (scene.videoUrl) vid.videoUrl = scene.videoUrl;
    if (scene._stitchedVideoMissing !== undefined) vid._stitchedVideoMissing = scene._stitchedVideoMissing;
    if (Array.isArray(scene.videoClips) && scene.videoClips.length > 0) vid.videoClips = scene.videoClips;
    if (scene.videoError) { vid.status = 'error'; vid.videoError = scene.videoError; }
    else if (scene.videoUrl) vid.status = 'done';
  }
  // Refresh launch node progress sig
  const allDone = (g.scenes || []).every(s => s.videoUrl || s.videoError);
  if (allDone && g.videoPhase === 'running') g.videoPhase = 'done';
  // Refresh VID node
  const node = vid ? g.nodeEls.get(vid.id) : null;
  if (node && node.el) {
    const sceneEntry = g.scenes[sceneIdx];
    updateVidNode(node.el, sceneEntry, sceneIdx, vid);
  }
  renderLaunchNode();
  redrawCurves();
  if (g.selectedId === (vid && vid.id)) cgRenderProperties();
  triggerSave();
}

function setVideoPhase(phase) {
  if (!g) return;
  g.videoPhase = phase;
  renderLaunchNode();
}

// ════ Public API: Character filter (Phase 5) ═══════════════════════════════

function _renderFilterChip() {
  if (!g || !g.wrapperEl) return;
  let chip = document.getElementById('cg-filter-chip');
  const f = g.characterFilter;
  if (!f || f.activeIds.size === 0) {
    if (chip) chip.remove();
    return;
  }
  if (!chip) {
    chip = document.createElement('div');
    chip.id = 'cg-filter-chip';
    chip.className = 'cg-filter-chip';
    g.wrapperEl.appendChild(chip);
  }
  // Resolve names from createJobState
  const chars = (window.createJobState && window.createJobState.characters) || [];
  const presenter = window.createJobState && window.createJobState.presenter;
  const names = [...f.activeIds].map(id => {
    const c = chars.find(x => x.id === id);
    if (c) return c.name;
    if (presenter && presenter.id === id) return presenter.name;
    return '?';
  });
  // Count matching scenes
  const total = (g.scenes || []).length;
  const matching = (g.scenes || []).filter(s => !isSceneFilteredOut(s)).length;
  const modeBtn = (f.activeIds.size > 1)
    ? `<button class="cg-filter-mode-toggle" data-action="cg-filter-mode">${f.mode}</button>`
    : '';
  const compactBtn = `<button class="cg-filter-compact-toggle ${f.compactView ? 'active' : ''}" data-action="cg-filter-compact" title="Compact view: hide non-matching scenes">${f.compactView ? '◱' : '◰'}</button>`;
  chip.innerHTML = `
    <span class="cg-filter-icon">🔎</span>
    <span class="cg-filter-text">Filtering: ${names.map(n => '<span class="cg-filter-name">' + n + '</span>').join((f.mode === 'AND' && names.length > 1) ? ' <em>and</em> ' : ' <em>or</em> ')}</span>
    <span class="cg-filter-count">${matching}/${total} scenes</span>
    ${modeBtn}
    ${compactBtn}
    <button class="cg-filter-clear" data-action="cg-filter-clear" title="Clear filter (Esc)">✕</button>
  `;
  // Wire chip buttons
  chip.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      if (a === 'cg-filter-clear') clearCharacterFilter();
      else if (a === 'cg-filter-mode') {
        f.mode = (f.mode === 'AND') ? 'OR' : 'AND';
        renderAll();
        redrawCurves();
        _renderFilterChip();
      } else if (a === 'cg-filter-compact') {
        f.compactView = !f.compactView;
        if (g.containerEl) g.containerEl.classList.toggle('cg-compact-filter', f.compactView);
        renderAll();
        redrawCurves();
        _renderFilterChip();
      }
    });
  });
}

function setCharacterFilter(charId, modifiers) {
  if (!g) return;
  if (!g.characterFilter) g.characterFilter = { activeIds: new Set(), mode: 'AND', compactView: false };
  const f = g.characterFilter;
  modifiers = modifiers || {};
  if (modifiers.shift || modifiers.cmd) {
    if (f.activeIds.has(charId)) f.activeIds.delete(charId);
    else f.activeIds.add(charId);
  } else if (modifiers.right) {
    f.activeIds = new Set([charId]);
  } else {
    if (f.activeIds.size === 1 && f.activeIds.has(charId)) {
      f.activeIds = new Set();
    } else {
      f.activeIds = new Set([charId]);
    }
  }
  renderAll();
  redrawCurves();
  _renderFilterChip();
}

function clearCharacterFilter() {
  if (!g || !g.characterFilter) return;
  g.characterFilter.activeIds = new Set();
  g.characterFilter.compactView = false;
  if (g.containerEl) g.containerEl.classList.remove('cg-compact-filter');
  renderAll();
  redrawCurves();
  _renderFilterChip();
}

// Auto-clear filter when a character it references is deleted.
function notifyCharacterDeleted(charId) {
  if (!g || !g.characterFilter) return;
  if (g.characterFilter.activeIds.has(charId)) {
    g.characterFilter.activeIds.delete(charId);
    if (g.characterFilter.activeIds.size === 0) g.characterFilter.compactView = false;
    renderAll();
    redrawCurves();
    _renderFilterChip();
  }
}

// ════ SECTION 15 — Public API export ═══════════════════════════════════════

function mount(containerId, scenes, mode, opts) {
  // Idempotent
  unmount(containerId);

  const container = document.getElementById(containerId);
  if (!container) {
    console.warn('CanvasGraph.mount: container not found', containerId);
    return;
  }

  g = freshGraphState();
  g.containerId = containerId;
  g.container = container;
  g.scenes = scenes || [];
  g.mode = (mode === 'animated') ? 'animated' : 'illustrated';
  g.geminiKey = (opts && opts.geminiKey) || '';
  g.job = (opts && opts.job) || (window.createJobState || { bgmSkipped: false, audioSubSkipped: false });
  window.createJobState = g.job;

  // Restore persisted subtitle style to hidden create-sub-* elements (read by 17d pipeline)
  const _ss = g.job.subtitleStyle;
  if (_ss) {
    const _ssMap = { 'create-sub-font': _ss.font, 'create-sub-size': _ss.size, 'create-sub-color': _ss.color,
      'create-sub-stroke-w': _ss.strokeW, 'create-sub-bg-alpha': _ss.bgAlpha,
      'create-sub-position': _ss.pos, 'create-sub-bold': _ss.bold, 'create-sub-all-caps': _ss.allCaps };
    Object.entries(_ssMap).forEach(([id, val]) => {
      if (val == null) return;
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else el.value = val;
    });
  }

  // Defensive — caller already invoked these, but they're idempotent
  if (window.CanvasState) {
    CanvasState.migrateAllScenes(g.scenes, { stylePreset: window.createStylePreset || '' });
    if (CanvasState.ensurePendingImages) CanvasState.ensurePendingImages(g.scenes, { stylePreset: window.createStylePreset || '' });
    CanvasState.normalizeAll(g.scenes, g.mode);
    CanvasState.syncAllMirrors(g.scenes, g.mode);
  }

  buildDOM(container);

  runLayout();

  // Initial view: zoom 1, pan so first scene's SB lands top-left of safe area
  g.zoom = 1.0;
  g.panX = SAFE_PAD;
  g.panY = SAFE_PAD;
  applyTransform();

  renderAll();
  redrawCurves();

  cgChromeMount();
  attachEvents();

  // Mirror cursor mode externally
  window.CanvasGraph._cursorMode = g.cgChrome.cursorMode;
}

function unmount(containerId) {
  if (!g) return;
  if (containerId && g.containerId !== containerId) return;
  detachEvents();
  cgChromeUnmount();
  cgCloseContextMenu();
  cgRemoveSelToolbar();
  if (g.saveTimer) { clearTimeout(g.saveTimer); g.saveTimer = 0; }
  if (g.container) {
    g.container.innerHTML = '';
    g.container.classList.remove('cg-mount');
  }
  g = null;
  window.selectedNodeId = null;
}

function isActive() { return g !== null; }

function getScenes() { return g ? g.scenes : null; }

window.renderBibleNode = function () {
  if (!g) return;
  renderBibleNode();
};

// Voice chip — deep-link to cast panel for the speaker character.
// Idempotent — registers once on first canvas mount.
let _voiceChipDeepLinkWired = false;
function wireVoiceChipDeepLink() {
  if (_voiceChipDeepLinkWired) return;
  _voiceChipDeepLinkWired = true;
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('button[data-action="edit-voice-in-cast"]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const charId = btn.dataset.characterId;
    if (!charId) return;
    // Try to scroll to + flash the cast row for this character
    const row = document.querySelector(`#cast-char-rows .cast-row[data-id="${charId}"]`)
             || document.querySelector(`#cast-loc-rows .cast-row[data-id="${charId}"]`);
    if (row) {
      try {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('cast-row-highlighted');
        setTimeout(() => row.classList.remove('cast-row-highlighted'), 2000);
      } catch (_) {}
    } else {
      // Cast panel not visible — surface a hint
      console.log('[Voice] Open the cast panel to edit voice for character', charId);
    }
  });
}
wireVoiceChipDeepLink();

window.CanvasGraph = Object.assign(window.CanvasGraph || {}, {
  mount,
  unmount,
  refresh,
  notifyImageReady,
  notifyVideoReady,
  setVideoPhase,
  setCharacterFilter,
  clearCharacterFilter,
  notifyCharacterDeleted,
  fitToView,
  panToColumn,
  tidyLayout,
  getScenes,
  isActive,
  chromeSetActiveCount,
  renderBibleNode,
  _cursorMode: 'pan',                // mirror; updated by chrome cursor dropdown
  _actions,
});

})();
