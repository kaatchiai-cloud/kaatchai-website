// js/24-photopilot.js — Photopilot main controller (3-zone architecture)
// Photo Reel feature: photos + minimal input → vertical reel with AI script,
// animated subtitles, Ken Burns motion, and optional audio.
//
// Depends on (loaded before this file):
//   01-core.js           — $(), trackCost(), showToast(), navigateTo()
//   12-buffer-ops.js     — audioBufferToWavBlob()
//   17a-create-api.js    — callGeminiAPI()
//   17c-create-pipeline.js — parseGeminiJson(), generateTTSGemini(), decodeBase64Audio()
//   20-reels-creator.js  — renderReelSubtitle(), drawReelOverlays(), REEL_SUB_PRESETS
//   25-photopilot-fx.js  — computeKenBurnsPath(), drawKenBurnsFrame(),
//                          applyInPhotoEffects(), applyShakeTransform(),
//                          PP_TRANSITIONS, COLOR_PRESETS, MOOD_PRESETS,
//                          resolveSegmentEffect(), getPPCanvasDimensions(),
//                          getPPExportDimensions(), drawColourPicOverlay(),
//                          drawTimePicOverlay()

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Constants and Data Model
// ─────────────────────────────────────────────────────────────────────────────

const PHOTO_CAPS     = { 15: 4, 30: 6, 60: 10 };
const MIN_PHOTOS     = 1;
const MIN_SEG_DURATION = 1.0;  // seconds — minimum segment duration when retiming
const PP_MODELS_TEXT   = ['gemini-2.5-flash'];
const PP_MODELS_VISION = ['gemini-2.5-flash'];

// Master project state — single global object
const photopilotProject = {
  format: { aspect: '9:16', duration: 30 },
  effectsConfig: {
    mood: 'cinematic',
    smartSuggestions: true,
    ttsVoice: 'Kore'
  },
  photos: [],         // [{id, src, blob, naturalW, naturalH, img, focusPoint}]
  contentSource: { mode: 'title', value: '', instructions: '', audioBuffer: null },
  effectiveDuration: 30,
  generatedScript: {
    fullText: '',
    sentences: [],
    source: 'title',
    sourceLabel: 'Generated',
    wordCount: 0
  },
  segments: [],       // [{id, photoId, startTime, endTime, script, effect, aiAnalysis, userOverrides}]
  subtitle: {
    words: [],
    style: 'word-by-word',
    subColor: '#ffffff',
    subOutline: '#000000',
    subBackdrop: 'dark',
    subSize: 4,
    subPosition: 85,
    subFont: 'Poppins',
    subAllCaps: false,
    subAccent: '#7c3aed'
  },
  overlays: {
    subscribe: { enabled: false, at: 2, dur: 3, color: '#ff0000', text: '#ffffff' },
    follow:    { enabled: false, at: 5, dur: 3, color: '#a855f7', text: '#ffffff' },
    items: []   // [{id, type, startTime, duration, params}] — colour-pic, time-pic
  },
  renderedBlob: null,
  renderedBlobUrl: null,
};

// ── Slider fill utility ──────────────────────────────────────────────────────
// Sets --slider-pct on a range input so the CSS gradient fills up to the thumb
function syncSliderFill(el) {
  const min = parseFloat(el.min) || 0;
  const max = parseFloat(el.max) || 100;
  const pct = ((parseFloat(el.value) - min) / (max - min)) * 100;
  el.style.setProperty('--slider-pct', pct.toFixed(1) + '%');
}

// Preview state
let ppRafId = null;
let ppPlaying = false;
let ppCurrentTime = 0;
let ppPlayStartWallTime = 0;
let ppAudioCtx = null;
let ppAudioSource = null;
let ppAbortController = null;
let ppRenderAbort = null;
let ppSelectedSegId  = null;
let ppFtScrubT       = 0;     // 0–1 position within selected segment for finetune preview
let ppFtPlaying      = false;
let ppFtPlayStartWall = 0;
let ppFtPlayStartT    = 0;
let ppFtRafId         = null;
let ppDraggingSegId  = null;
let ppDragHandleX = 0;
let ppNextOverlayId = 1;
window.photopilotAbort = null;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getPPApiKey() {
  return getCreateGeminiKey();
}

function getPhotoCap() {
  return PHOTO_CAPS[photopilotProject.format.duration] || 6;
}

function computeEffectiveDuration() {
  const cs = photopilotProject.contentSource;
  if (cs.mode !== 'audio' || !cs.audioBuffer) return photopilotProject.format.duration;
  return Math.min(photopilotProject.format.duration, cs.audioBuffer.duration);
}

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function getSegById(id) {
  return photopilotProject.segments.find(function(s) { return s.id === id; }) || null;
}

function getPhotoById(id) {
  return photopilotProject.photos.find(function(p) { return p.id === id; }) || null;
}

function stopPhotopilotPreview() {
  ppPlaying = false;
  if (ppRafId) { cancelAnimationFrame(ppRafId); ppRafId = null; }
  if (ppAudioSource) { try { ppAudioSource.stop(); } catch(_){} ppAudioSource = null; }
}
window.stopPhotopilotPreview = stopPhotopilotPreview;

function invalidateRender() {
  if (photopilotProject.renderedBlobUrl) {
    URL.revokeObjectURL(photopilotProject.renderedBlobUrl);
    photopilotProject.renderedBlobUrl = null;
  }
  photopilotProject.renderedBlob = null;
  // Reset export area to idle
  const dlDiv  = $('pp-render-dl');
  const barDiv = $('pp-render-progress');
  if (dlDiv)  dlDiv.style.display  = 'none';
  if (barDiv) barDiv.style.display = 'none';
}

function ppShowToast(msg, duration) {
  duration = duration || 3000;
  if (typeof showToast === 'function') showToast(msg, duration);
  else console.warn('[PP]', msg);
}

function requestPreviewFrame() {
  if (!ppPlaying) {
    if (ppRafId) cancelAnimationFrame(ppRafId);
    ppRafId = requestAnimationFrame(renderFrame);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Zone Reveal (replaces step navigation)
// ─────────────────────────────────────────────────────────────────────────────

function showOutput() {
  // Reveal Zone 2 and Zone 3
  const zone2 = $('pp-finetune-section');
  const zone3 = $('pp-preview-section');
  if (zone2) zone2.classList.remove('hidden');
  if (zone3) zone3.classList.remove('hidden');

  // Initialize zones if not yet done (guard flag)
  if (!window._ppZonesInited) {
    window._ppZonesInited = true;
    initZone2();
    initZone3();
  } else {
    // Re-sync after new pipeline run
    renderTimeline();
    renderTimelineMini();
    initPreviewCanvas();
    ppCurrentTime = 0;
    ppPlaying = false;
    requestPreviewFrame();
  }

  // Scroll Zone 3 into view
  if (zone3) zone3.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3b — Script Review Panel
// ─────────────────────────────────────────────────────────────────────────────

function showScriptReview(segments) {
  const panel     = $('pp-script-review');
  const container = $('pp-script-segments');
  if (!panel || !container) return;
  container.innerHTML = '';

  segments.forEach(function(seg) {
    const photo    = getPhotoById(seg.photoId);
    const photoIdx = photopilotProject.photos.findIndex(function(p) { return p.id === seg.photoId; });

    const card = document.createElement('div');
    card.className = 'pp-script-segment';

    const header = document.createElement('div');
    header.className = 'pp-script-segment-header';
    header.innerHTML =
      (photo ? '<img class="pp-script-segment-thumb" src="' + photo.src + '" alt="Photo ' + (photoIdx + 1) + '">' : '') +
      '<div class="pp-script-segment-meta">' +
        '<span class="pp-script-segment-label">Segment ' + seg.id + ' · Photo ' + (photoIdx + 1) + '</span>' +
        '<span class="pp-script-segment-ts">' + fmtTime(seg.startTime) + ' → ' + fmtTime(seg.endTime) + '</span>' +
      '</div>';

    const ta = document.createElement('textarea');
    ta.rows = 3;
    ta.value = seg.script || '';
    ta.dataset.segId = String(seg.id);
    ta.addEventListener('input', function() {
      const s = getSegById(parseInt(ta.dataset.segId, 10));
      if (s) s.script = ta.value;
    });

    card.appendChild(header);
    card.appendChild(ta);
    container.appendChild(card);
  });

  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function lockScriptReview() {
  const container = $('pp-script-segments');
  if (container) {
    Array.from(container.querySelectorAll('textarea')).forEach(function(ta) {
      ta.readOnly = true;
    });
  }
  const footer = $('pp-script-review') && document.querySelector('#pp-script-review .pp-script-review-footer');
  if (footer) footer.style.display = 'none';
}

function hideScriptReview() {
  const panel = $('pp-script-review');
  if (panel) panel.classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Photo Strip
// ─────────────────────────────────────────────────────────────────────────────

async function loadPhoto(file) {
  const id = Date.now() + Math.random();
  const src = URL.createObjectURL(file);
  const img = new Image();
  await new Promise(function(res, rej) { img.onload = res; img.onerror = rej; img.src = src; });
  return {
    id: id,
    src: src,
    blob: file,
    naturalW: img.naturalWidth,
    naturalH: img.naturalHeight,
    img: img,
    focusPoint: { x: 0.5, y: 0.5 }
  };
}

function addPhotos(files) {
  const cap = getPhotoCap();
  const remaining = cap - photopilotProject.photos.length;
  if (remaining <= 0) {
    ppShowToast(`Max ${cap} photos for ${photopilotProject.format.duration}s`);
    return;
  }
  const toAdd = Array.from(files).slice(0, remaining);
  if (toAdd.length < files.length) {
    ppShowToast(`Max ${cap} photos for ${photopilotProject.format.duration}s — only first ${toAdd.length} added.`);
  }
  Promise.all(toAdd.map(loadPhoto)).then(function(photos) {
    photopilotProject.photos.push.apply(photopilotProject.photos, photos);
    renderPhotoStrip();
    updatePhotoCounter();
  });
}

function renderPhotoStrip() {
  const strip = $('pp-photo-strip');
  if (!strip) return;

  // Remove all existing thumbnails (leave the add tile)
  Array.from(strip.querySelectorAll('.pp-photo-thumb')).forEach(function(el) { el.remove(); });

  const addTile = $('pp-strip-add-tile');

  photopilotProject.photos.forEach(function(photo, idx) {
    const thumb = document.createElement('div');
    thumb.className = 'pp-photo-thumb';
    thumb.draggable = true;
    thumb.dataset.id = photo.id;

    const img = document.createElement('img');
    img.src = photo.src;
    img.alt = `Photo ${idx + 1}`;

    const del = document.createElement('button');
    del.className = 'pp-photo-delete';
    del.textContent = '✕';
    del.title = 'Remove';
    del.onclick = function(e) { e.stopPropagation(); deletePhoto(photo.id); };

    thumb.appendChild(img);
    thumb.appendChild(del);

    // Drag reorder
    thumb.addEventListener('dragstart', function(e) {
      e.dataTransfer.setData('text/plain', String(photo.id));
      thumb.classList.add('dragging');
    });
    thumb.addEventListener('dragend', function() { thumb.classList.remove('dragging'); });
    thumb.addEventListener('dragover', function(e) { e.preventDefault(); });
    thumb.addEventListener('drop', function(e) {
      e.preventDefault();
      const draggedId = parseFloat(e.dataTransfer.getData('text/plain'));
      const fromIdx = photopilotProject.photos.findIndex(function(p) { return p.id === draggedId; });
      const toIdx = idx;
      if (fromIdx !== -1 && fromIdx !== toIdx) {
        const moved = photopilotProject.photos.splice(fromIdx, 1)[0];
        photopilotProject.photos.splice(toIdx, 0, moved);
        renderPhotoStrip();
      }
    });

    // Insert before add tile
    if (addTile) {
      strip.insertBefore(thumb, addTile);
    } else {
      strip.appendChild(thumb);
    }
  });
}

function deletePhoto(id) {
  photopilotProject.photos = photopilotProject.photos.filter(function(p) { return p.id !== id; });
  renderPhotoStrip();
  updatePhotoCounter();
}

function updatePhotoCounter() {
  const el = $('pp-photo-counter');
  if (el) el.textContent = `${photopilotProject.photos.length} / ${getPhotoCap()}`;
}

function syncDurationToCaps() {
  const cap = getPhotoCap();
  const hint = $('pp-drop-hint');
  if (hint) hint.textContent = `Up to ${cap} photos for ${photopilotProject.format.duration}s`;
  if (photopilotProject.photos.length > cap) {
    const removed = photopilotProject.photos.splice(cap);
    ppShowToast(`${photopilotProject.format.duration}s allows max ${cap} photos. Removed last ${removed.length}.`);
    renderPhotoStrip();
  }
  updatePhotoCounter();
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Audio File Loading
// ─────────────────────────────────────────────────────────────────────────────

async function loadAudioFile(file) {
  const status = $('pp-audio-status');
  if (status) { status.style.display = ''; status.textContent = `Loading ${file.name}…`; }
  try {
    const arrayBuf = await file.arrayBuffer();
    if (!ppAudioCtx) ppAudioCtx = new AudioContext();
    const buffer = await ppAudioCtx.decodeAudioData(arrayBuf);
    photopilotProject.contentSource.audioBuffer = buffer;
    photopilotProject.contentSource.value = '';
    if (status) status.textContent = `✅ ${file.name} · ${fmtTime(buffer.duration)}`;
  } catch(err) {
    if (status) status.textContent = `❌ Error: ${err.message}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Pipeline
// ─────────────────────────────────────────────────────────────────────────────

const PP_AGENTS = [
  { id: 'distribute', label: 'Distribute photos',  titleOnly: false, notInTitle: false },
  { id: 'analyse',    label: 'Analyse photos',     titleOnly: true,  notInTitle: false },  // title mode: step 1
  { id: 'script',     label: 'Write script',       titleOnly: true,  notInTitle: false },  // title mode: step 2
  { id: 'tts',        label: 'Generate voiceover', titleOnly: false, notInTitle: false },
  { id: 'timings',    label: 'Word timings',        titleOnly: false, notInTitle: false },
  { id: 'analysis',   label: 'Photo analysis',     titleOnly: false, notInTitle: true  },  // non-title modes only
];
// Backward-compat alias
const PP_TASKS = PP_AGENTS;

function initPPAgentPanel() {
  const list = $('pp-agent-list');
  if (!list) return;
  list.innerHTML = '';
  const mode = photopilotProject.contentSource.mode;

  // ONE agent row with subtasks below it
  const row = document.createElement('div');
  row.className = 'agent-row';
  row.id = 'pp-agent-row-main';

  // Top: icon + label + status dot
  const top = document.createElement('div');
  top.className = 'agent-row-top';
  top.innerHTML =
    '<span class="agent-row-icon">✦</span>' +
    '<span class="agent-row-label">Photopilot Agent</span>' +
    '<span class="agent-status-dot waiting" id="pp-dot-main"></span>';

  // Body: subtask list
  const body = document.createElement('div');
  body.className = 'agent-row-body';
  body.id = 'pp-agent-body';

  PP_AGENTS.forEach(function(agent) {
    const sub = document.createElement('div');
    sub.className = 'agent-subtask waiting';
    sub.id = 'pp-subtask-' + agent.id;
    const hidden = (agent.titleOnly && mode !== 'title') || (agent.notInTitle && mode === 'title');
    if (hidden) sub.style.display = 'none';
    sub.innerHTML =
      '<span class="agent-subtask-icon"></span>' +
      '<span>' + agent.label + '</span>';
    body.appendChild(sub);
  });

  row.appendChild(top);
  row.appendChild(body);
  list.appendChild(row);
}

function setPPAgentStatus(id, status) {
  // Update the subtask entry
  const sub = $('pp-subtask-' + id);
  if (sub) {
    sub.className = 'agent-subtask ' + status;
    const icon = sub.querySelector('.agent-subtask-icon');
    if (icon) icon.textContent = status === 'done' ? '✓' : status === 'running' ? '⋯' : status === 'error' ? '✕' : '';
  }

  // Reflect on main agent row + dot
  const row = $('pp-agent-row-main');
  const dot = $('pp-dot-main');
  if (status === 'running') {
    if (row) row.classList.add('active');
    if (dot) dot.className = 'agent-status-dot running';
  } else if (status === 'error') {
    if (dot) dot.className = 'agent-status-dot error';
  } else if (status === 'done') {
    // Mark overall done only when all visible subtasks are done
    const allDone = PP_AGENTS.every(function(agent) {
      const s = $('pp-subtask-' + agent.id);
      return !s || s.style.display === 'none' || s.classList.contains('done');
    });
    if (allDone) {
      if (dot) dot.className = 'agent-status-dot done';
      if (row) row.classList.remove('active');
    }
  }
}

function setPPTask(id, status, label) {
  // Keep updating any legacy inline task UI (may be absent — safe to ignore)
  const el = $('pp-task-' + id);
  if (el) {
    const icons = { waiting: '⏳', running: '⚙️', done: '✅', error: '❌' };
    el.className = 'pp-agent-task ' + status;
    const icon = el.querySelector('.pp-task-icon');
    if (icon) icon.textContent = icons[status] || '⏳';
    if (label) {
      const span = el.querySelectorAll('span')[1];
      if (span) span.textContent = label;
    }
  }
  // Always update the left-panel agent dot
  setPPAgentStatus(id, status);
}

// ── Phase 1: Distribute + Script ─────────────────────────────────────────────
async function runPhase1() {
  const cs = photopilotProject.contentSource;

  // 1. Distribute
  setPPTask('distribute', 'running');
  const totalDur = computeEffectiveDuration();
  photopilotProject.effectiveDuration = totalDur;
  const perPhoto = totalDur / photopilotProject.photos.length;

  photopilotProject.segments = photopilotProject.photos.map(function(photo, i) {
    return {
      id: i + 1,
      photoId: photo.id,
      startTime: i * perPhoto,
      endTime:   (i + 1) * perPhoto,
      script: '',
      effect: Object.assign({}, resolveSegmentEffect({}, photopilotProject.effectsConfig.mood, null, {})),
      aiAnalysis: null,
      userOverrides: {}
    };
  });
  photopilotProject.segments.forEach(function(seg, i) {
    const photo = getPhotoById(seg.photoId);
    if (photo) {
      seg.effect.kenBurns = computeKenBurnsPath(photo, photopilotProject.format.aspect, {
        direction: 'auto', intensity: 0.3, focusPoint: photo.focusPoint, seed: i
      });
    }
  });
  setPPTask('distribute', 'done');

  // 2. Analyse photos + write script (title mode — single combined vision call)
  //    The panel shows two steps: analyse completes first, then script.
  let script = '';
  if (cs.mode === 'title') {
    setPPTask('analyse', 'running');
    setPPTask('script', 'running');   // both blink together — single combined LLM call
    const combined = await llmAnalyseAndWriteScript(
      photopilotProject.photos, cs.value, totalDur,
      photopilotProject.effectsConfig.mood, cs.instructions || ''
    );
    // Apply analysis to segments
    combined.analyses.forEach(function(analysis, i) {
      const seg = photopilotProject.segments[i];
      if (!seg) return;
      seg.aiAnalysis = analysis;
      seg.effect = resolveSegmentEffect(seg, photopilotProject.effectsConfig.mood, analysis, seg.userOverrides || {});
      const photo = getPhotoById(seg.photoId);
      if (photo) {
        let kbDir = 'auto';
        if (analysis && analysis.kenBurnsHint) {
          const hint = analysis.kenBurnsHint;
          if (hint === 'pan-left-to-right')  kbDir = 'panRight';
          else if (hint === 'pan-right-to-left') kbDir = 'panLeft';
          else if (hint === 'zoom-in')  kbDir = 'zoomIn';
          else if (hint === 'zoom-out') kbDir = 'zoomOut';
          else if (hint === 'pan-up')   kbDir = 'panUp';
          else if (hint === 'pan-down') kbDir = 'panDown';
          else kbDir = hint;
        }
        seg.effect.kenBurns = computeKenBurnsPath(photo, photopilotProject.format.aspect, {
          direction: kbDir,
          intensity: seg.effect.kenBurns ? seg.effect.kenBurns.intensity : 0.3,
          focusPoint: (analysis && analysis.subjectPosition) || photo.focusPoint,
          seed: i
        });
      }
    });
    // Show mood recommendation if AI suggests something different
    if (combined.recommendedMood && combined.recommendedMood !== photopilotProject.effectsConfig.mood) {
      const chip  = $('pp-mood-suggestion');
      const label = $('pp-mood-suggestion-name');
      const applyBtn = $('pp-mood-suggestion-apply');
      if (chip && label) {
        const moodLabels = { cinematic:'Cinematic', clean:'Clean', romantic:'Romantic',
          dramatic:'Dramatic', vintage:'Vintage', product:'Product', travel:'Travel', editorial:'Editorial' };
        label.textContent = moodLabels[combined.recommendedMood] || combined.recommendedMood;
        chip.style.display = 'flex';
        if (applyBtn) applyBtn.onclick = function() {
          const sel = $('pp-mood-select');
          if (sel) { sel.value = combined.recommendedMood; sel.dispatchEvent(new Event('change')); }
          chip.style.display = 'none';
        };
      }
    }
    // Apply per-segment subtitle positions and harmonize color grades
    applySubtitlePositions(photopilotProject.segments);
    harmonizeColorPresets(photopilotProject.segments);
    setPPTask('analyse', 'done');
    setPPTask('script', 'running');
    // scriptLines: each segment gets its own dedicated line
    script = combined.scriptLines.join(' ');
    photopilotProject.segments.forEach(function(seg, i) {
      seg.script = combined.scriptLines[i] || '';
    });
  } else if (cs.mode === 'text') {
    setPPTask('script', 'running');
    script = await llmPolishText(cs.value, totalDur);
  } else if (cs.mode === 'audio') {
    setPPTask('script', 'running');
    script = await transcribeAudio(cs.audioBuffer, totalDur);
  }
  photopilotProject._phase1Script = script;

  // For non-title modes, still distribute script proportionally
  if (cs.mode !== 'title') {
    const words = script.trim().split(/\s+/).filter(Boolean);
    const nSegs = Math.max(1, photopilotProject.segments.length);
    photopilotProject.segments.forEach(function(seg, i) {
      const start = Math.round(i * words.length / nSegs);
      const end   = Math.round((i + 1) * words.length / nSegs);
      seg.script  = words.slice(start, end).join(' ');
    });
  }
  setPPTask('script', 'done');

  return script;
}

// ── Phase 2: TTS + Timings + Analysis ────────────────────────────────────────
async function runPhase2() {
  const cs = photopilotProject.contentSource;

  // Re-assemble script from (possibly user-edited) segment scripts
  const script = photopilotProject.segments.map(function(s) { return s.script; }).join(' ').trim()
               || photopilotProject._phase1Script || '';

  // 3. TTS
  setPPTask('tts', 'running');
  if (cs.mode === 'title' || cs.mode === 'text') {
    try {
      const ttsResult = await generateTTSGemini(script, photopilotProject.effectsConfig.ttsVoice || 'Kore', getPPApiKey());
      const { audioBuffer: ttsAudioBuffer } = await decodeBase64Audio(ttsResult.base64, ttsResult.mimeType);
      cs.audioBuffer = ttsAudioBuffer;
      const actualDur = Math.min(ttsAudioBuffer.duration, photopilotProject.format.duration);
      photopilotProject.effectiveDuration = actualDur;
      allocateSegmentDurations(photopilotProject.segments, actualDur);
      setPPTask('tts', 'done');
    } catch(ttsErr) {
      console.warn('[PP] TTS failed, using synthetic timings:', ttsErr);
      setPPTask('tts', 'error', 'TTS skipped (no audio)');
    }
  } else {
    setPPTask('tts', 'done', 'Audio mode — TTS not needed');
  }

  // 4. Word timings
  setPPTask('timings', 'running');
  const finalDur = photopilotProject.effectiveDuration;
  photopilotProject.subtitle.words = computeWordTimings(script, finalDur);
  photopilotProject.generatedScript = buildGeneratedScript(
    script, photopilotProject.subtitle.words, photopilotProject.segments, cs.mode
  );
  photopilotProject.segments.forEach(function(seg) {
    const sentencesInSeg = photopilotProject.generatedScript.sentences.filter(function(s) {
      return s.segmentId === seg.id;
    });
    seg.script = sentencesInSeg.map(function(s) { return s.text; }).join(' ');
  });
  setPPTask('timings', 'done');

  // 5. Smart analysis — skipped entirely for title mode (done in Phase 1 via llmAnalyzeAndScript)
  const needsAnalysis = photopilotProject.segments.filter(function(s) { return !s.aiAnalysis; });
  const inTitleMode = photopilotProject.contentSource.mode === 'title';
  if (!inTitleMode) setPPTask('analysis', needsAnalysis.length === 0 ? 'done' : 'running');
  if (photopilotProject.effectsConfig.smartSuggestions && needsAnalysis.length > 0) {
    await Promise.all(needsAnalysis.map(async function(seg, i) {
      try {
        const photo = getPhotoById(seg.photoId);
        const prevPhoto = i > 0 ? getPhotoById(photopilotProject.segments[i - 1].photoId) : null;
        seg.aiAnalysis = await llmAnalyzePhoto(photo, prevPhoto, photopilotProject.effectsConfig.mood);
        seg.effect = resolveSegmentEffect(seg, photopilotProject.effectsConfig.mood, seg.aiAnalysis, seg.userOverrides || {});
        let kbDir = 'auto';
        if (seg.aiAnalysis && seg.aiAnalysis.kenBurnsHint) {
          const hint = seg.aiAnalysis.kenBurnsHint;
          if (hint === 'pan-left-to-right')  kbDir = 'panRight';
          else if (hint === 'pan-right-to-left') kbDir = 'panLeft';
          else if (hint === 'zoom-in')  kbDir = 'zoomIn';
          else if (hint === 'zoom-out') kbDir = 'zoomOut';
          else if (hint === 'pan-up')   kbDir = 'panUp';
          else if (hint === 'pan-down') kbDir = 'panDown';
          else kbDir = hint;
        }
        if (photo) {
          const userDir = seg.userOverrides && seg.userOverrides.kenBurnsDirection;
          seg.effect.kenBurns = computeKenBurnsPath(photo, photopilotProject.format.aspect, {
            direction: userDir || kbDir,
            intensity: seg.effect.kenBurns ? seg.effect.kenBurns.intensity : 0.3,
            focusPoint: (seg.aiAnalysis && seg.aiAnalysis.subjectPosition) || photo.focusPoint,
            seed: i
          });
        }
        trackCost('visionDescribe', 1);
      } catch(err) {
        console.warn('[PP] Smart analysis failed for segment', seg.id, err);
        seg.aiAnalysis = null;
      }
    }));
    applySubtitlePositions(photopilotProject.segments);
    harmonizeColorPresets(photopilotProject.segments);
  } else {
    // No AI analysis — set default subtitle positions
    photopilotProject.segments.forEach(function(seg) { seg.subtitleY = 85; });
  }
  // Global fallback subtitle position (used if per-segment value is missing)
  const pos = pickSubtitlePosition(photopilotProject.segments);
  photopilotProject.subtitle.subPosition = pos;
  if (!inTitleMode) setPPTask('analysis', 'done');
}

// ── Pipeline orchestrator ─────────────────────────────────────────────────────
async function runPhotopilotPipeline() {
  const btn = $('btn-pp-generate');
  if (btn) btn.disabled = true;

  ppAbortController = new AbortController();
  window.photopilotAbort = ppAbortController;

  // Reset all agent dots to waiting
  initPPAgentPanel();

  const mode = photopilotProject.contentSource.mode;

  try {
    if (mode === 'title') {
      // ── Phase 1 ─────────────────────────────────────────────────────────────
      await runPhase1();

      // Show script review panel — wait for user to proceed
      showScriptReview(photopilotProject.segments);

      // Re-enable generate button (allow restart)
      if (btn) btn.disabled = false;

      // Wire Regenerate button
      const btnRegen = $('btn-pp-regen-script');
      if (btnRegen) {
        btnRegen.disabled = false;
        btnRegen.onclick = async function() {
          btnRegen.disabled = true;
          const genReelBtn = $('btn-pp-gen-reel');
          if (genReelBtn) genReelBtn.disabled = true;
          try {
            const cs = photopilotProject.contentSource;
            const dur = photopilotProject.effectiveDuration;
            const newScript = await llmExpandTitle(cs.value, dur, cs.instructions || '');
            photopilotProject._phase1Script = newScript;
            const regenWords = newScript.trim().split(/\s+/).filter(Boolean);
            const regenN = Math.max(1, photopilotProject.segments.length);
            photopilotProject.segments.forEach(function(seg, i) {
              seg.script = regenWords.slice(
                Math.round(i * regenWords.length / regenN),
                Math.round((i + 1) * regenWords.length / regenN)
              ).join(' ');
            });
            showScriptReview(photopilotProject.segments);
          } catch(err) {
            ppShowToast('Regeneration failed: ' + (err.message || err));
          } finally {
            btnRegen.disabled = false;
            if (genReelBtn) genReelBtn.disabled = false;
          }
        };
      }

      // Wire Generate Reel button — triggers Phase 2
      const btnGenReel = $('btn-pp-gen-reel');
      if (btnGenReel) {
        btnGenReel.disabled = false;
        btnGenReel.onclick = async function() {
          btnGenReel.disabled = true;
          const btnRegenEl = $('btn-pp-regen-script');
          if (btnRegenEl) btnRegenEl.disabled = true;
          if (btn) btn.disabled = true;
          try {
            // Reset Phase 2 dots
            ['tts', 'timings', 'analysis'].forEach(function(id) { setPPAgentStatus(id, 'waiting'); });
            await runPhase2();
            lockScriptReview();
            showOutput();
          } catch(err) {
            if (err.name === 'AbortError') return;
            console.error('[PP] Phase 2 error:', err);
            ppShowToast('Error: ' + (err.message || err));
            btnGenReel.disabled = false;
            if (btnRegenEl) btnRegenEl.disabled = false;
            if (btn) btn.disabled = false;
          }
        };
      }

    } else {
      // ── Script / Audio mode: run straight through ────────────────────────────
      await runPhase1();
      await runPhase2();
      showOutput();
      if (btn) btn.disabled = false;
    }

  } catch(err) {
    if (err.name === 'AbortError') return;
    console.error('[PP] Pipeline error:', err);
    ppShowToast('Error: ' + (err.message || err));
    PP_AGENTS.forEach(function(agent) {
      const dot = $('pp-dot-' + agent.id);
      if (dot && dot.classList.contains('running')) setPPAgentStatus(agent.id, 'error');
    });
    if (btn) btn.disabled = false;
  } finally {
    ppAbortController = null;
    window.photopilotAbort = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — LLM Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Title mode: single vision call that analyses all photos AND writes the script in one shot.
// Returns { analyses: Array<analysisObject>, script: string }
async function llmAnalyseAndWriteScript(photos, title, durationSec, moodName, instructions) {
  const n = photos.length;
  const wordTarget = Math.round(durationSec * 2.2);
  const instrClause = (instructions && instructions.trim())
    ? '\nAdditional instructions: ' + instructions.trim() : '';

  const parts = [];
  for (let i = 0; i < n; i++) {
    const photo = photos[i];
    if (!photo || !photo.img) continue;
    const maxDim = 512;
    const scale = Math.min(maxDim / photo.naturalW, maxDim / photo.naturalH, 1);
    const tc = document.createElement('canvas');
    tc.width  = Math.round(photo.naturalW * scale);
    tc.height = Math.round(photo.naturalH * scale);
    tc.getContext('2d').drawImage(photo.img, 0, 0, tc.width, tc.height);
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: tc.toDataURL('image/jpeg', 0.75).split(',')[1] } });
  }
  parts.push({ text:
    'You are given ' + n + ' photos (Photo 1 through Photo ' + n + ') for a short vertical video reel.\n' +
    'Title: "' + title + '"\n' +
    'Mood: ' + moodName + '\n' +
    'Duration: ~' + durationSec + ' seconds, script target: ~' + wordTarget + ' words.' + instrClause + '\n\n' +
    'Return ONLY valid JSON (no markdown) in this exact shape:\n' +
    '{\n' +
    '  "recommendedMood": "cinematic"|"clean"|"romantic"|"dramatic"|"vintage"|"product"|"travel"|"editorial",\n' +
    '  "analyses": [\n' +
    '    {\n' +
    '      "photoIndex": 0,\n' +
    '      "subject": "face"|"group"|"product"|"landscape"|"food"|"action"|"still-life"|"other",\n' +
    '      "description": "one sentence describing what is in the photo",\n' +
    '      "subjectPosition": {"x": 0.5, "y": 0.5},\n' +
    '      "subjectVerticalZone": "top"|"middle"|"bottom",\n' +
    '      "energy": "calm"|"moderate"|"high",\n' +
    '      "lighting": "golden-hour"|"harsh"|"soft"|"low-light"|"studio"|"bw",\n' +
    '      "alreadyGraded": false,\n' +
    '      "isMonochrome": false,\n' +
    '      "kenBurnsHint": "pan-left-to-right"|"pan-right-to-left"|"zoom-in"|"zoom-out"|"pan-up"|"pan-down",\n' +
    '      "transitionInHint": "fade"|"whipPan"|"lightLeak"|"whiteCrossfade"|"morphBlend"|"iris",\n' +
    '      "particleHint": "none"|"hearts"|"dust"|"sparkle",\n' +
    '      "frameHint": "none"|"polaroid"|"filmStrip"|"cornerBurns",\n' +
    '      "skipColorPreset": false\n' +
    '    }\n' +
    '  ],\n' +
    '  "scriptLines": ["one sentence for photo 1", "one sentence for photo 2"]\n' +
    '}\n\n' +
    'Rules:\n' +
    '- recommendedMood: pick the single best mood preset for the entire photo set.\n' +
    '- analyses: one entry per photo, in order, 0-indexed.\n' +
    '- transitionInHint: consider the PAIR of consecutive photos. Same subject/scene → morphBlend or fade. ' +
    'Location/mood change → whipPan or lightLeak. Emotional peak → lightLeak. Hard cut for contrast → whiteCrossfade.\n' +
    '- scriptLines: exactly ' + n + ' strings, one per photo in order. Each line is 1-2 sentences that ' +
    'directly references what is visible in that specific photo. Personal, engaging tone. No hashtags, no emojis.'
  });

  const body = { contents: [{ parts: parts }] };
  const data = await callGeminiAPI(PP_MODELS_VISION, body, getPPApiKey());
  trackCost('visionDescribe', n);
  const text = (data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text) || '';
  const parsed = parseGeminiJson(text);
  const analyses    = (parsed && Array.isArray(parsed.analyses)) ? parsed.analyses : [];
  const scriptLines = (parsed && Array.isArray(parsed.scriptLines)) ? parsed.scriptLines
                    : (parsed && typeof parsed.script === 'string')  // fallback: split old shape
                      ? parsed.script.trim().split(/(?<=[.!?])\s+/)
                      : [];
  return {
    analyses,
    scriptLines,
    recommendedMood: (parsed && typeof parsed.recommendedMood === 'string') ? parsed.recommendedMood : null
  };
}

async function llmExpandTitle(title, durationSec, instructions) {
  const wordTarget = Math.round(durationSec * 2.2);
  const instrClause = (instructions && instructions.trim())
    ? '\nAdditional instructions: ' + instructions.trim()
    : '';
  const body = {
    contents: [{
      parts: [{
        text: 'Write a ' + wordTarget + '-word script for a short vertical video reel about: "' + title + '".\nWrite in a personal, engaging voice. No hashtags, no emojis, no section labels.\nUse simple sentences. Output ONLY the script text, nothing else.' + instrClause
      }]
    }]
  };
  const data = await callGeminiAPI(PP_MODELS_TEXT, body, getPPApiKey());
  trackCost('textGeneration', 1);
  const text = (data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text) || '';
  return text.trim();
}

async function llmPolishText(rawText, durationSec) {
  const wordTarget = Math.round(durationSec * 2.2);
  const body = {
    contents: [{
      parts: [{
        text: `Polish and time-fit this script for a ${durationSec}-second vertical video. Target ~${wordTarget} words.\nKeep the author's voice. Remove filler. Output ONLY the script text, nothing else.\n\nSCRIPT:\n${rawText}`
      }]
    }]
  };
  const data = await callGeminiAPI(PP_MODELS_TEXT, body, getPPApiKey());
  trackCost('textGeneration', 1);
  const text = (data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text) || rawText;
  return text.trim();
}

async function transcribeAudio(audioBuffer, maxDuration) {
  const wavBlob = audioBufferToWavBlob(audioBuffer);
  const base64 = await new Promise(function(resolve) {
    const reader = new FileReader();
    reader.onload = function() { resolve(reader.result.split(',')[1]); };
    reader.readAsDataURL(wavBlob);
  });

  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: 'audio/wav', data: base64 } },
        { text: 'Transcribe this audio exactly as spoken. Output ONLY the transcription text — no timestamps, no speaker labels, no markdown.' }
      ]
    }]
  };
  const data = await callGeminiAPI(PP_MODELS_TEXT, body, getPPApiKey());
  trackCost('textGeneration', 1);
  const text = (data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text) || '';
  return text.trim();
}

function computeWordTimings(script, totalDur) {
  const words = script.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const perWord = totalDur / words.length;
  return words.map(function(word, i) {
    return { word: word, start: i * perWord, end: (i + 1) * perWord };
  });
}

function buildGeneratedScript(script, words, segments, source) {
  const rawSentences = script.split(/(?<=[.!?])\s+/).filter(function(s) { return s.trim(); });
  let wordOffset = 0;
  const sentences = rawSentences.map(function(text) {
    const sentenceWords = text.trim().split(/\s+/).filter(Boolean);
    const startIdx = wordOffset;
    const endIdx   = wordOffset + sentenceWords.length - 1;
    wordOffset += sentenceWords.length;
    const startWord = words[startIdx];
    const endWord   = words[Math.min(endIdx, words.length - 1)];
    const start = startWord ? startWord.start : 0;
    const end   = endWord   ? endWord.end     : (startWord ? startWord.end : 0);
    const mid   = (start + end) / 2;
    const seg = segments.find(function(s) { return mid >= s.startTime && mid < s.endTime; })
             || segments[segments.length - 1];
    return {
      text: text.trim(),
      start: start,
      end: end,
      segmentId: seg ? seg.id : 1
    };
  });

  const sourceLabels = { title: 'Title-mode expansion', text: 'Polished from your text', audio: 'Transcribed from audio' };
  const wordCount = script.split(/\s+/).filter(Boolean).length;
  return {
    fullText: script,
    sentences: sentences,
    source: source || 'title',
    sourceLabel: sourceLabels[source] || 'Generated',
    wordCount: wordCount
  };
}

async function llmAnalyzePhoto(photo, prevPhoto, moodName) {
  if (!photo || !photo.img) return null;
  const tempCanvas = document.createElement('canvas');
  const maxDim = 512;
  const scale = Math.min(maxDim / photo.naturalW, maxDim / photo.naturalH, 1);
  tempCanvas.width  = Math.round(photo.naturalW * scale);
  tempCanvas.height = Math.round(photo.naturalH * scale);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(photo.img, 0, 0, tempCanvas.width, tempCanvas.height);
  const base64 = tempCanvas.toDataURL('image/jpeg', 0.75).split(',')[1];

  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64 } },
        {
          text: `You are analyzing a photo for a short vertical reel. Return ONLY valid JSON.\nMood: ${moodName}\n${prevPhoto ? 'There is a previous photo in the sequence — consider how this photo relates to it when choosing transitionInHint.' : 'This is the first photo.'}\nFor transitionInHint: same subject/scene as previous → morphBlend or fade; location/mood change → whipPan or lightLeak; emotional moment → lightLeak; hard contrast → whiteCrossfade.\n\nReturn:\n{"subject":"face"|"group"|"product"|"landscape"|"food"|"action"|"still-life"|"other","subjectPosition":{"x":0.5,"y":0.5},"subjectVerticalZone":"top"|"middle"|"bottom","energy":"calm"|"moderate"|"high","lighting":"golden-hour"|"harsh"|"soft"|"low-light"|"studio"|"bw","alreadyGraded":false,"isMonochrome":false,"kenBurnsHint":"pan-left-to-right"|"pan-right-to-left"|"zoom-in"|"zoom-out"|"pan-up"|"pan-down","transitionInHint":"fade"|"whipPan"|"lightLeak"|"whiteCrossfade"|"morphBlend"|"iris","particleHint":"none"|"hearts"|"dust"|"sparkle","frameHint":"none"|"polaroid"|"filmStrip"|"cornerBurns","skipColorPreset":false}`
        }
      ]
    }]
  };

  const data = await callGeminiAPI(PP_MODELS_VISION, body, getPPApiKey());
  const text = (data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text) || '';
  return parseGeminiJson(text);
}

// Energy-weighted segment duration allocation.
// calm photos get more time, high-energy photos get less.
function allocateSegmentDurations(segments, totalDur) {
  const energyWeights = { calm: 1.3, moderate: 1.0, high: 0.7 };
  const weights = segments.map(function(seg) {
    return energyWeights[(seg.aiAnalysis && seg.aiAnalysis.energy) || 'moderate'] || 1.0;
  });
  const sum = weights.reduce(function(a, b) { return a + b; }, 0);
  let t = 0;
  segments.forEach(function(seg, i) {
    const dur = (weights[i] / sum) * totalDur;
    seg.startTime = parseFloat(t.toFixed(4));
    seg.endTime   = parseFloat((t + dur).toFixed(4));
    t += dur;
  });
}

// Per-segment subtitle Y position based on where the subject sits in each photo.
// Subject at bottom → subtitle moves to top to avoid overlap, and vice versa.
function applySubtitlePositions(segments) {
  segments.forEach(function(seg) {
    const zone = seg.aiAnalysis && seg.aiAnalysis.subjectVerticalZone;
    seg.subtitleY = (zone === 'bottom') ? 15 : 85;
  });
}

// Color grading consistency: find the majority colorPreset across the set
// and apply it to segments that have no specific AI reason to be different.
function harmonizeColorPresets(segments) {
  const counts = {};
  segments.forEach(function(seg) {
    const ai = seg.aiAnalysis;
    const isLocked = ai && (ai.alreadyGraded || ai.isMonochrome || ai.skipColorPreset);
    const hasUserOverride = seg.userOverrides && seg.userOverrides.colorPreset;
    if (!isLocked && !hasUserOverride) {
      const p = seg.effect.colorPreset || 'none';
      counts[p] = (counts[p] || 0) + 1;
    }
  });
  const keys = Object.keys(counts);
  if (keys.length <= 1) return; // already consistent
  const majority = keys.sort(function(a, b) { return counts[b] - counts[a]; })[0];
  segments.forEach(function(seg) {
    const ai = seg.aiAnalysis;
    const isLocked = ai && (ai.alreadyGraded || ai.isMonochrome || ai.skipColorPreset);
    const hasUserOverride = seg.userOverrides && seg.userOverrides.colorPreset;
    if (!isLocked && !hasUserOverride) {
      seg.effect.colorPreset = majority;
    }
  });
}

function pickSubtitlePosition(segments) {
  const counts = { top: 0, middle: 0, bottom: 0 };
  segments.forEach(function(s) {
    const z = (s.aiAnalysis && s.aiAnalysis.subjectVerticalZone) || 'middle';
    counts[z] = (counts[z] || 0) + 1;
  });
  if (counts.bottom > counts.top && counts.bottom > counts.middle) return 25;
  return 85;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — Canvas Renderer
// ─────────────────────────────────────────────────────────────────────────────

function initPreviewCanvas() {
  const canvas = $('pp-canvas');
  if (!canvas) return;
  const dims = getPPCanvasDimensions(photopilotProject.format.aspect);
  canvas.width  = dims.width;
  canvas.height = dims.height;
  canvas.style.width    = '100%';
  canvas.style.height   = '100%';
  canvas.style.objectFit = 'contain';
}

function findSegmentAtTime(t) {
  return photopilotProject.segments.find(function(s) { return t >= s.startTime && t < s.endTime; })
    || (t >= photopilotProject.effectiveDuration ? photopilotProject.segments[photopilotProject.segments.length - 1] : null);
}

function renderFrame() {
  const canvas = $('pp-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const totalDur = photopilotProject.effectiveDuration;

  // Advance time
  if (ppPlaying) {
    ppCurrentTime = (Date.now() - ppPlayStartWallTime) / 1000;
    if (ppCurrentTime >= totalDur) {
      ppCurrentTime = 0;
      ppPlayStartWallTime = Date.now();
    }
  }

  // Update time display
  const timeEl = $('pp-phone-time');
  if (timeEl) timeEl.textContent = `${fmtTime(ppCurrentTime)} / ${fmtTime(totalDur)}`;

  // Update scrub bar
  const scrub = $('pp-scrub');
  if (scrub && !ppDraggingSegId) scrub.value = totalDur > 0 ? Math.round((ppCurrentTime / totalDur) * 1000) : 0;

  // Update timeline playhead
  renderTimelinePlayhead();

  const seg = findSegmentAtTime(ppCurrentTime);
  if (!seg) {
    if (ppPlaying) ppRafId = requestAnimationFrame(renderFrame);
    return;
  }

  const segDur = seg.endTime - seg.startTime;
  const segT   = segDur > 0 ? (ppCurrentTime - seg.startTime) / segDur : 0;

  ctx.clearRect(0, 0, W, H);

  // 1. Ken Burns + color filter
  const photo = getPhotoById(seg.photoId);
  if (photo && photo.img && seg.effect && seg.effect.kenBurns) {
    const filter = COLOR_PRESETS[seg.effect.colorPreset || 'none'] || '';
    if (filter) ctx.filter = filter;
    ctx.save();
    if (seg.effect.shake > 0) applyShakeTransform(ctx, seg.effect.shake);
    if (seg.effect.zoomPunch > 0 && segT < 0.25) {
      const punch = seg.effect.zoomPunch * (1 - segT / 0.25);
      ctx.translate(W / 2, H / 2);
      ctx.scale(1 + punch, 1 + punch);
      ctx.translate(-W / 2, -H / 2);
    }
    drawKenBurnsFrame(ctx, photo.img, seg.effect.kenBurns, segT, W, H, (seg.effect.kenBurns.easing || 'easeOutQuad'));
    ctx.restore();
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
  }

  // 2. In-photo effects (vignette, spotlight, film grain, particles)
  // skipFrame=true — frame decoration is drawn AFTER the transition (step 3b) so it
  // never gets overwritten by the crossfade and stays consistently visible.
  if (seg.effect) applyInPhotoEffects(ctx, seg, segT, W, H, { skipFrame: true });

  // 3. Transition
  if (seg.effect) {
    const transDur = seg.effect.transitionDuration || 0.4;
    const timeIntoNext = ppCurrentTime - (seg.endTime - transDur);
    if (timeIntoNext > 0 && timeIntoNext <= transDur) {
      const nextSeg = photopilotProject.segments.find(function(s) { return s.startTime === seg.endTime; });
      const nextPhoto = nextSeg ? getPhotoById(nextSeg.photoId) : null;
      if (nextPhoto && nextPhoto.img && photo && photo.img) {
        const tProgress = timeIntoNext / transDur;
        const transType = seg.effect.transitionIn || 'fade';
        const transFn   = PP_TRANSITIONS[transType] || PP_TRANSITIONS.fade;
        transFn(ctx, photo.img, nextPhoto.img, tProgress, W, H);
      }
    }
  }

  // 3b. Frame decoration — drawn after the transition so it stays on top through crossfades
  if (seg.effect && seg.effect.frameStyle && seg.effect.frameStyle !== 'none') {
    drawFrameDecoration(ctx, seg.effect.frameStyle, W, H);
  }

  // 4. Subtitles — use per-segment Y position if AI set one
  const subStyle = photopilotProject.subtitle.style || 'classic';
  if (subStyle !== 'none' && photopilotProject.subtitle.words.length > 0) {
    syncSubtitleGlobals();
    if (seg && seg.subtitleY !== undefined) reelSubPosition = seg.subtitleY;
    try { renderReelSubtitle(ctx, W, H, ppCurrentTime, photopilotProject.subtitle.words, subStyle); } catch(_) {}
  }

  // 5. Subscribe / Follow overlays
  drawPPOverlays(ctx, W, H, ppCurrentTime);

  if (ppPlaying) ppRafId = requestAnimationFrame(renderFrame);
}

function syncSubtitleGlobals() {
  const s = photopilotProject.subtitle;
  reelSubColor      = s.subColor;
  reelSubOutline    = s.subOutline;
  reelSubBackdrop   = s.subBackdrop;
  reelSubSize       = s.subSize;
  reelSubPosition   = s.subPosition;
  reelSubFont       = s.subFont;
  reelSubAllCaps    = s.subAllCaps;
  reelSubAccent     = s.subAccent;
  reelSubtitleStyle = s.style;
}

function startPreview() {
  ppPlaying = true;
  ppPlayStartWallTime = Date.now() - ppCurrentTime * 1000;
  const playBtn = $('pp-phone-play');
  if (playBtn) playBtn.textContent = '⏸';
  // Start audio
  const cs = photopilotProject.contentSource;
  if (cs.audioBuffer) {
    if (!ppAudioCtx) ppAudioCtx = new AudioContext();
    ppAudioSource = ppAudioCtx.createBufferSource();
    ppAudioSource.buffer = cs.audioBuffer;
    ppAudioSource.connect(ppAudioCtx.destination);
    ppAudioSource.start(0, ppCurrentTime);
    ppAudioSource.onended = function() {
      ppPlaying = false;
      const b = $('pp-phone-play');
      if (b) b.textContent = '▶';
    };
  }
  if (ppRafId) cancelAnimationFrame(ppRafId);
  ppRafId = requestAnimationFrame(renderFrame);
}

function pausePreview() {
  ppPlaying = false;
  if (ppAudioSource) { try { ppAudioSource.stop(); } catch(_) {} ppAudioSource = null; }
  const playBtn = $('pp-phone-play');
  if (playBtn) playBtn.textContent = '▶';
}

function seekPreview(t) {
  ppCurrentTime = t;
  if (ppAudioSource) { try { ppAudioSource.stop(); } catch(_) {} ppAudioSource = null; }
  if (ppPlaying) {
    ppPlayStartWallTime = Date.now() - t * 1000;
    const cs = photopilotProject.contentSource;
    if (cs.audioBuffer) {
      if (!ppAudioCtx) ppAudioCtx = new AudioContext();
      ppAudioSource = ppAudioCtx.createBufferSource();
      ppAudioSource.buffer = cs.audioBuffer;
      ppAudioSource.connect(ppAudioCtx.destination);
      ppAudioSource.start(0, t);
    }
  }
  requestPreviewFrame();
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — Overlay Renderer
// ─────────────────────────────────────────────────────────────────────────────

function drawPPOverlays(ctx, W, H, t) {
  const ov = photopilotProject.overlays;
  // Build temporary overlay items for subscribe/follow
  const tempItems = [];
  if (ov.subscribe.enabled) {
    tempItems.push({
      id: 'pp-sub', type: 'subscribe',
      startTime: ov.subscribe.at, duration: ov.subscribe.dur,
      params: { color: ov.subscribe.color, textColor: ov.subscribe.text, text: 'Subscribe', font: 'Poppins' }
    });
  }
  if (ov.follow.enabled) {
    tempItems.push({
      id: 'pp-fol', type: 'follow',
      startTime: ov.follow.at, duration: ov.follow.dur,
      params: { color: ov.follow.color, textColor: ov.follow.text, text: 'Follow', font: 'Poppins' }
    });
  }

  if (tempItems.length > 0) {
    const savedItems = reelOverlayItems;
    reelOverlayItems = tempItems;
    try { drawReelOverlays(ctx, W, H, t); } catch(_) {}
    reelOverlayItems = savedItems;
  }

  // Handle custom colour-pic / time-pic items
  ov.items.forEach(function(item) {
    const elapsed = t - item.startTime;
    if (elapsed < 0 || elapsed > item.duration) return;
    const progress = elapsed / item.duration;
    if (item.type === 'colour-pic' && item.params && item.params._imgEl) {
      try { drawColourPicOverlay(ctx, item.params._imgEl, item.params, progress, W, H); } catch(_) {}
    } else if (item.type === 'time-pic') {
      try { drawTimePicOverlay(ctx, item.params || {}, progress, W, H); } catch(_) {}
    }
  });
}

function renderOverlayList() {
  const container = $('pp-overlay-list');
  if (!container) return;
  const items = photopilotProject.overlays.items;
  const totalDur = photopilotProject.effectiveDuration || 30;

  if (!items.length) {
    container.innerHTML = '<div style="font-size:var(--text-xs);color:var(--text-muted);">No overlays added yet.</div>';
    return;
  }

  container.innerHTML = '';

  items.forEach(function(item) {
    const isPip = item.type === 'colour-pic';
    const endTime = item.startTime + item.duration;
    const p = item.params;
    // Timestamp order: 4 slots, each 'none'|'day'|'month'|'year'|'time'
    const order = p.order || ['day', 'month', 'year', 'none'];
    const corner = p.position || p.corner || (isPip ? 'br' : 'tl');

    const card = document.createElement('div');
    card.className = 'pp-overlay-card';

    // ── Header ──────────────────────────────────────────────
    const hdr = document.createElement('div');
    hdr.className = 'pp-overlay-card-hdr';
    hdr.innerHTML = '<span>' + (isPip ? '🖼 PiP' : '🕐 Timestamp') + '</span>';
    const rm = document.createElement('button');
    rm.className = 'pp-overlay-remove'; rm.textContent = '✕';
    rm.onclick = function() {
      photopilotProject.overlays.items = photopilotProject.overlays.items.filter(function(i) { return i.id !== item.id; });
      renderOverlayList(); invalidateRender(); requestPreviewFrame();
    };
    hdr.appendChild(rm);
    card.appendChild(hdr);

    function row(labelTxt, controlsHtml) {
      const d = document.createElement('div');
      d.className = 'pp-overlay-row';
      d.innerHTML = '<span class="pp-overlay-row-lbl">' + labelTxt + '</span><span class="pp-overlay-row-ctrl">' + controlsHtml + '</span>';
      return d;
    }

    // ── Start / End — number inputs ─────────────────────────
    const timingRow = row('Time',
      'Start <input type="number" class="ov-start" min="0" max="' + totalDur.toFixed(1) + '" step="0.1" value="' + item.startTime.toFixed(1) + '">s' +
      '&nbsp;&nbsp;End <input type="number" class="ov-end" min="0" max="' + totalDur.toFixed(1) + '" step="0.1" value="' + endTime.toFixed(1) + '">s');
    card.appendChild(timingRow);

    timingRow.querySelector('.ov-start').onchange = function() {
      const v = Math.max(0, Math.min(parseFloat(this.value) || 0, totalDur));
      this.value = v.toFixed(1);
      item.startTime = v;
      const endEl = timingRow.querySelector('.ov-end');
      if (parseFloat(endEl.value) < v) { endEl.value = v.toFixed(1); }
      item.duration = Math.max(0, parseFloat(timingRow.querySelector('.ov-end').value) - v);
      invalidateRender(); requestPreviewFrame();
    };
    timingRow.querySelector('.ov-end').onchange = function() {
      const v = Math.max(item.startTime, Math.min(parseFloat(this.value) || 0, totalDur));
      this.value = v.toFixed(1);
      item.duration = v - item.startTime;
      invalidateRender(); requestPreviewFrame();
    };

    // ── Corner + Colours — single compact row ───────────────
    function cornerOpt(val, label) {
      return '<option value="' + val + '"' + (corner === val ? ' selected' : '') + '>' + label + '</option>';
    }
    const styleRow = row('Style',
      '<select class="ov-corner ov-corner-sm">' +
        cornerOpt('tl','Top Left') + cornerOpt('tr','Top Right') + cornerOpt('bl','Bot Left') + cornerOpt('br','Bot Right') +
      '</select>' +
      (isPip
        ? ' <span class="ov-colour-lbl">Border</span><input type="color" class="ov-border-color" value="' + (p.borderColor||'#ffffff') + '">' +
          ' <span class="ov-colour-lbl">Size</span><input type="range" class="ov-size" min="0.1" max="0.5" step="0.01" value="' + (p.size||0.25).toFixed(2) + '">' +
          '<span class="ov-size-lbl">' + Math.round((p.size||0.25)*100) + '%</span>'
        : ' <span class="ov-colour-lbl">BG</span><input type="color" class="ov-bg-color" value="' + (p.bgColorHex||'#000000') + '">' +
          ' <input type="range" class="ov-bg-opacity" min="0" max="1" step="0.05" value="' + (p.bgOpacity!==undefined?p.bgOpacity:0.65).toFixed(2) + '">' +
          ' <span class="ov-colour-lbl">Text</span><input type="color" class="ov-txt-color" value="' + (p.textColor||'#ffffff') + '">'
      )
    );
    card.appendChild(styleRow);

    styleRow.querySelector('.ov-corner').onchange = function() {
      p.position = this.value; if (isPip) p.corner = this.value;
      invalidateRender(); requestPreviewFrame();
    };
    if (isPip) {
      styleRow.querySelector('.ov-border-color').oninput = function() {
        p.borderColor = this.value; invalidateRender(); requestPreviewFrame();
      };
      styleRow.querySelector('.ov-size').oninput = function() {
        p.size = parseFloat(this.value);
        styleRow.querySelector('.ov-size-lbl').textContent = Math.round(p.size * 100) + '%';
        invalidateRender(); requestPreviewFrame();
      };
    } else {
      styleRow.querySelector('.ov-bg-color').oninput = function() {
        p.bgColorHex = this.value; invalidateRender(); requestPreviewFrame();
      };
      styleRow.querySelector('.ov-bg-opacity').oninput = function() {
        p.bgOpacity = parseFloat(this.value); invalidateRender(); requestPreviewFrame();
      };
      styleRow.querySelector('.ov-txt-color').oninput = function() {
        p.textColor = this.value; invalidateRender(); requestPreviewFrame();
      };
    }

    if (!isPip) {
      // ── Timestamp: 4 order dropdowns ────────────────────
      const opts = ['none','day','month','year','time'];
      const optLabels = { none:'None', day:'Day', month:'Month', year:'Year', time:'Time' };
      function slotSelect(slotIdx) {
        const cur = order[slotIdx] || 'none';
        return '<select class="ov-order-slot" data-slot="' + slotIdx + '">' +
          opts.map(function(o) {
            return '<option value="' + o + '"' + (cur === o ? ' selected' : '') + '>' + optLabels[o] + '</option>';
          }).join('') +
        '</select>';
      }
      const showRow = row('Show',
        slotSelect(0) + slotSelect(1) + slotSelect(2) + slotSelect(3));
      card.appendChild(showRow);

      showRow.querySelectorAll('.ov-order-slot').forEach(function(sel) {
        sel.onchange = function() {
          if (!p.order) p.order = ['day','month','year','none'];
          p.order[parseInt(sel.dataset.slot)] = sel.value;
          invalidateRender(); requestPreviewFrame();
        };
      });
    }

    container.appendChild(card);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — Timeline
// ─────────────────────────────────────────────────────────────────────────────

function renderTimeline() {
  const tl = $('pp-timeline');
  if (!tl) return;
  const totalDur = photopilotProject.effectiveDuration;
  tl.innerHTML = '';

  photopilotProject.segments.forEach(function(seg) {
    const left  = (seg.startTime / totalDur) * 100;
    const width = ((seg.endTime - seg.startTime) / totalDur) * 100;

    const bar = document.createElement('div');
    bar.className = 'pp-seg-bar' + (seg.id === ppSelectedSegId ? ' active' : '');
    bar.style.left  = `${left}%`;
    bar.style.width = `${width}%`;
    bar.dataset.segId = seg.id;

    const lbl = document.createElement('span');
    lbl.className = 'pp-seg-label';
    const photoIdx = photopilotProject.photos.findIndex(function(p) { return p.id === seg.photoId; });
    lbl.textContent = `P${photoIdx + 1}`;

    const handle = document.createElement('div');
    handle.className = 'pp-seg-drag-handle';
    handle.dataset.segId = seg.id;

    bar.appendChild(lbl);
    bar.appendChild(handle);

    bar.addEventListener('click', function(e) {
      if (!e.target.classList.contains('pp-seg-drag-handle')) selectSegment(seg.id);
    });

    tl.appendChild(bar);
  });

  // Playhead
  const ph = document.createElement('div');
  ph.className = 'pp-timeline-playhead';
  ph.id = 'pp-tl-playhead';
  ph.style.left = '0%';
  tl.appendChild(ph);

  initTimelineDrag();
}

function renderTimelineMini() {
  const tl = $('pp-timeline-mini');
  if (!tl) return;
  const totalDur = photopilotProject.effectiveDuration;
  tl.innerHTML = '';
  tl.style.position = 'relative';
  tl.style.background = 'var(--bg-secondary)';
  tl.style.borderRadius = '4px';
  tl.style.overflow = 'hidden';

  photopilotProject.segments.forEach(function(seg) {
    const left  = (seg.startTime / totalDur) * 100;
    const width = ((seg.endTime - seg.startTime) / totalDur) * 100;
    const bar = document.createElement('div');
    bar.style.cssText = [
      'position:absolute', 'top:4px', 'bottom:4px',
      `left:${left}%`, `width:calc(${width}% - 2px)`,
      'background:var(--accent)', 'opacity:0.5',
      'border-radius:2px', 'cursor:pointer'
    ].join(';');
    bar.title = `Segment ${seg.id}`;
    bar.onclick = function() { seekPreview(seg.startTime + (seg.endTime - seg.startTime) * 0.1); };
    tl.appendChild(bar);
  });

  // Mini playhead
  const mph = document.createElement('div');
  mph.id = 'pp-tl-mini-playhead';
  mph.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;background:var(--accent);pointer-events:none;left:0;';
  tl.appendChild(mph);
}

function renderTimelinePlayhead() {
  const ph = $('pp-tl-playhead');
  const mph = $('pp-tl-mini-playhead');
  const totalDur = photopilotProject.effectiveDuration;
  const pct = totalDur > 0 ? `${(ppCurrentTime / totalDur) * 100}%` : '0%';
  if (ph)  ph.style.left  = pct;
  if (mph) mph.style.left = pct;
}

function initTimelineDrag() {
  const tl = $('pp-timeline');
  if (!tl) return;

  tl.addEventListener('pointerdown', function(e) {
    const handle = e.target.closest('.pp-seg-drag-handle');
    if (!handle) return;
    ppDraggingSegId = parseInt(handle.dataset.segId, 10);
    ppDragHandleX = e.clientX;
    tl.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  tl.addEventListener('pointermove', function(e) {
    if (!ppDraggingSegId) return;
    const seg = getSegById(ppDraggingSegId);
    if (!seg) return;
    const nextSeg = photopilotProject.segments.find(function(s) { return s.startTime === seg.endTime; });
    const totalDur = photopilotProject.effectiveDuration;
    const rect = tl.getBoundingClientRect();
    const rawEnd = ((e.clientX - rect.left) / rect.width) * totalDur;
    const minEnd = seg.startTime + MIN_SEG_DURATION;
    const maxEnd = nextSeg ? nextSeg.endTime - MIN_SEG_DURATION : totalDur;
    const newEnd = Math.max(minEnd, Math.min(maxEnd, rawEnd));
    seg.endTime = newEnd;
    if (nextSeg) nextSeg.startTime = newEnd;
    redistributeWordsToSegment(seg);
    if (nextSeg) redistributeWordsToSegment(nextSeg);
    invalidateRender();
    renderTimeline();
    requestPreviewFrame();
  });

  tl.addEventListener('pointerup', function() { ppDraggingSegId = null; });
}

function redistributeWordsToSegment(seg) {
  const sentences = photopilotProject.generatedScript.sentences.filter(function(s) {
    return s.start < seg.endTime && s.end > seg.startTime;
  });
  seg.script = sentences.map(function(s) { return s.text; }).join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11 — Segment Properties Panel
// ─────────────────────────────────────────────────────────────────────────────

// Renders a single static frame of the selected segment onto the finetune mini-canvas.
// Called on segment select, on any control change, and on scrub.
function renderFinetunePreview() {
  const canvas = $('pp-ft-canvas');
  if (!canvas) return;
  const seg = ppSelectedSegId ? getSegById(ppSelectedSegId) : null;

  // Update segment name label
  const nameEl = $('pp-ft-seg-name');
  if (nameEl) {
    if (seg) {
      const idx = photopilotProject.photos.findIndex(function(p) { return p.id === seg.photoId; });
      nameEl.textContent = 'Segment ' + seg.id + ' · Photo ' + (idx + 1);
    } else {
      nameEl.textContent = '';
    }
  }

  const dims = getPPCanvasDimensions(photopilotProject.format.aspect);
  const W = dims.width;
  const H = dims.height;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  if (!seg || !seg.effect) {
    ctx.fillStyle = '#0c0c14';
    ctx.fillRect(0, 0, W, H);
    return;
  }

  const photo = getPhotoById(seg.photoId);
  if (!photo || !photo.img) {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    return;
  }

  // Ken Burns at ppFtScrubT
  const filter = COLOR_PRESETS[seg.effect.colorPreset || 'none'] || '';
  if (filter) ctx.filter = filter;
  ctx.save();
  if (seg.effect.shake > 0) applyShakeTransform(ctx, seg.effect.shake);
  if (seg.effect.zoomPunch > 0 && ppFtScrubT < 0.25) {
    const punch = seg.effect.zoomPunch * (1 - ppFtScrubT / 0.25);
    ctx.translate(W / 2, H / 2);
    ctx.scale(1 + punch, 1 + punch);
    ctx.translate(-W / 2, -H / 2);
  }
  if (seg.effect.kenBurns) {
    drawKenBurnsFrame(ctx, photo.img, seg.effect.kenBurns, ppFtScrubT, W, H,
      seg.effect.kenBurns.easing || 'easeOutQuad');
  } else {
    ctx.drawImage(photo.img, 0, 0, W, H);
  }
  ctx.restore();
  ctx.filter = 'none';

  // Vignette, grain, etc. — skip frame decoration (drawn after)
  applyInPhotoEffects(ctx, seg, ppFtScrubT, W, H, { skipFrame: true });

  // Frame decoration on top
  if (seg.effect.frameStyle && seg.effect.frameStyle !== 'none') {
    drawFrameDecoration(ctx, seg.effect.frameStyle, W, H);
  }
}

function _ftUpdateScrubUI() {
  const ftScrub = $('pp-ft-scrub');
  const ftScrubLbl = $('pp-ft-scrub-label');
  if (ftScrub) ftScrub.value = Math.round(ppFtScrubT * 100);
  if (ftScrubLbl) ftScrubLbl.textContent = Math.round(ppFtScrubT * 100) + '%';
}

function pauseFinetunePlay() {
  ppFtPlaying = false;
  if (ppFtRafId) { cancelAnimationFrame(ppFtRafId); ppFtRafId = null; }
  const btn = $('pp-ft-play');
  if (btn) btn.textContent = '▶';
}

function startFinetunePlay() {
  const seg = ppSelectedSegId ? getSegById(ppSelectedSegId) : null;
  if (!seg) return;
  ppFtPlaying = true;
  ppFtPlayStartWall = Date.now();
  ppFtPlayStartT    = ppFtScrubT >= 1 ? 0 : ppFtScrubT;  // restart if at end
  const btn = $('pp-ft-play');
  if (btn) btn.textContent = '⏸';

  function tick() {
    if (!ppFtPlaying) return;
    const seg = ppSelectedSegId ? getSegById(ppSelectedSegId) : null;
    if (!seg) { pauseFinetunePlay(); return; }
    const segDur = seg.endTime - seg.startTime;
    const elapsed = (Date.now() - ppFtPlayStartWall) / 1000;
    ppFtScrubT = ppFtPlayStartT + (segDur > 0 ? elapsed / segDur : 0);
    if (ppFtScrubT >= 1) {
      ppFtScrubT = 1;
      _ftUpdateScrubUI();
      renderFinetunePreview();
      pauseFinetunePlay();
      return;
    }
    _ftUpdateScrubUI();
    renderFinetunePreview();
    ppFtRafId = requestAnimationFrame(tick);
  }
  ppFtRafId = requestAnimationFrame(tick);
}

function selectSegment(segId) {
  ppSelectedSegId = segId;
  renderTimeline();
  const seg = getSegById(segId);
  if (!seg) return;

  const panel = $('pp-segment-props');
  if (panel) panel.style.display = '';

  const photo = getPhotoById(seg.photoId);
  const thumb = $('pp-sp-thumb');
  if (thumb && photo) thumb.src = photo.src;

  const segLabel = $('pp-sp-seg-label');
  if (segLabel) {
    const photoIdx = photopilotProject.photos.findIndex(function(p) { return p.id === seg.photoId; });
    segLabel.textContent = `Segment ${seg.id} · Photo ${photoIdx + 1}`;
  }

  const durEl = $('pp-sp-duration');
  if (durEl) durEl.textContent = (seg.endTime - seg.startTime).toFixed(1) + 's';

  // Ken Burns controls
  const kbDir = $('pp-kb-direction');
  if (kbDir) kbDir.value = (seg.effect && seg.effect.kenBurns && seg.effect.kenBurns.direction) || 'auto';

  const kbInt = $('pp-kb-intensity');
  const kbIntLbl = $('pp-kb-intensity-label');
  const intVal = (seg.effect && seg.effect.kenBurns && seg.effect.kenBurns.intensity !== undefined)
    ? seg.effect.kenBurns.intensity : 0.3;
  if (kbInt) kbInt.value = intVal;
  if (kbIntLbl) kbIntLbl.textContent = intVal.toFixed(2);

  const kbEase = $('pp-kb-easing');
  if (kbEase) kbEase.value = (seg.effect && seg.effect.kenBurns && seg.effect.kenBurns.easing) || 'easeOutQuad';

  const colPre = $('pp-color-preset');
  if (colPre) colPre.value = (seg.effect && seg.effect.colorPreset) || 'none';

  const vig = $('pp-vignette');
  const vigLbl = $('pp-vignette-label');
  const vigVal = (seg.effect && seg.effect.vignette !== undefined) ? seg.effect.vignette : 0.3;
  if (vig) vig.value = vigVal;
  if (vigLbl) vigLbl.textContent = vigVal.toFixed(2);

  const trans = $('pp-transition-type');
  if (trans) trans.value = (seg.effect && seg.effect.transitionIn) || 'fade';

  const transDur = $('pp-transition-dur');
  const transDurLbl = $('pp-transition-dur-label');
  const tdVal = (seg.effect && seg.effect.transitionDuration !== undefined) ? seg.effect.transitionDuration : 0.4;
  if (transDur) transDur.value = tdVal;
  if (transDurLbl) transDurLbl.textContent = tdVal.toFixed(1) + 's';

  // Shake
  const shakeEl = $('pp-shake');
  if (shakeEl) shakeEl.value = (seg.effect && seg.effect.shake !== undefined) ? seg.effect.shake : 0;

  // Zoom Punch
  const zpEl = $('pp-zoom-punch');
  if (zpEl) zpEl.value = (seg.effect && seg.effect.zoomPunch !== undefined) ? seg.effect.zoomPunch : 0;

  // Film Grain
  const fgEl = $('pp-film-grain');
  const fgLbl = $('pp-film-grain-label');
  const fgVal = (seg.effect && seg.effect.filmGrain !== undefined) ? seg.effect.filmGrain : 0;
  if (fgEl) fgEl.value = fgVal;
  if (fgLbl) fgLbl.textContent = fgVal.toFixed(2);

  // Frame style
  const fsEl = $('pp-frame-style');
  if (fsEl) fsEl.value = (seg.effect && seg.effect.frameStyle) || 'none';

  // Spotlight
  const spotToggle = $('pp-spotlight-toggle');
  const spotSliders = $('pp-spotlight-sliders');
  const spotEnabled = (seg.effect && seg.effect.spotlight && seg.effect.spotlight.enabled) || false;
  if (spotToggle) spotToggle.checked = spotEnabled;
  if (spotSliders) spotSliders.style.display = spotEnabled ? '' : 'none';
  const spxEl = $('pp-spotlight-x');
  const spxLbl = $('pp-spotlight-x-label');
  const spyEl = $('pp-spotlight-y');
  const spyLbl = $('pp-spotlight-y-label');
  const spx = (seg.effect && seg.effect.spotlight && seg.effect.spotlight.x !== undefined) ? seg.effect.spotlight.x : 0.5;
  const spy = (seg.effect && seg.effect.spotlight && seg.effect.spotlight.y !== undefined) ? seg.effect.spotlight.y : 0.5;
  if (spxEl) spxEl.value = spx;
  if (spxLbl) spxLbl.textContent = spx.toFixed(2);
  if (spyEl) spyEl.value = spy;
  if (spyLbl) spyLbl.textContent = spy.toFixed(2);

  // Particles
  const partEl = $('pp-particles');
  if (partEl) partEl.value = (seg.effect && seg.effect.particles) || 'none';
  const partColorEl = $('pp-particle-color');
  if (partColorEl) partColorEl.value = (seg.effect && seg.effect.particleColor) || '#ffffff';

  // Stop any playing finetune preview, reset scrub to start, refresh
  pauseFinetunePlay();
  ppFtScrubT = 0;
  _ftUpdateScrubUI();
  renderFinetunePreview();
}

function initSegmentPropControls() {
  function updateSeg(key, val) {
    if (!ppSelectedSegId) return;
    const seg = getSegById(ppSelectedSegId);
    if (!seg) return;
    seg.userOverrides = seg.userOverrides || {};
    const path = key.split('.');
    if (path.length === 2) {
      seg.effect[path[0]] = seg.effect[path[0]] || {};
      seg.effect[path[0]][path[1]] = val;
      seg.userOverrides[path[0] + path[1].charAt(0).toUpperCase() + path[1].slice(1)] = val;
    } else {
      seg.effect[key] = val;
      seg.userOverrides[key] = val;
    }
    invalidateRender();
    requestPreviewFrame();
    renderFinetunePreview();
  }

  // Ken Burns direction
  const kbDir = $('pp-kb-direction');
  if (kbDir) kbDir.onchange = function() {
    if (!ppSelectedSegId) return;
    const seg = getSegById(ppSelectedSegId);
    if (!seg) return;
    const photo = getPhotoById(seg.photoId);
    seg.userOverrides = seg.userOverrides || {};
    seg.userOverrides.kenBurnsDirection = kbDir.value;
    seg.effect.kenBurns = computeKenBurnsPath(photo, photopilotProject.format.aspect, {
      direction: kbDir.value,
      intensity: (seg.effect.kenBurns && seg.effect.kenBurns.intensity !== undefined) ? seg.effect.kenBurns.intensity : 0.3,
      focusPoint: photo ? photo.focusPoint : { x: 0.5, y: 0.5 }
    });
    invalidateRender();
    requestPreviewFrame();
    renderFinetunePreview();
  };

  // Ken Burns intensity
  const kbInt = $('pp-kb-intensity');
  const kbIntLbl = $('pp-kb-intensity-label');
  if (kbInt) kbInt.oninput = function() {
    if (kbIntLbl) kbIntLbl.textContent = parseFloat(kbInt.value).toFixed(2);
    updateSeg('kenBurns.intensity', parseFloat(kbInt.value));
  };

  // Ken Burns easing
  const kbEase = $('pp-kb-easing');
  if (kbEase) kbEase.onchange = function() { updateSeg('kenBurns.easing', kbEase.value); };

  // Reverse Ken Burns
  const btnReverse = $('btn-pp-kb-reverse');
  if (btnReverse) btnReverse.onclick = function() {
    if (!ppSelectedSegId) return;
    const seg = getSegById(ppSelectedSegId);
    if (!seg || !seg.effect || !seg.effect.kenBurns) return;
    const tmp = seg.effect.kenBurns.fromRect;
    seg.effect.kenBurns.fromRect = seg.effect.kenBurns.toRect;
    seg.effect.kenBurns.toRect   = tmp;
    invalidateRender();
    requestPreviewFrame();
    renderFinetunePreview();
  };

  // Recompute Ken Burns
  const btnRecompute = $('btn-pp-kb-recompute');
  if (btnRecompute) btnRecompute.onclick = function() {
    if (!ppSelectedSegId) return;
    const seg = getSegById(ppSelectedSegId);
    if (!seg) return;
    const photo = getPhotoById(seg.photoId);
    const intEl = $('pp-kb-intensity');
    seg.effect.kenBurns = computeKenBurnsPath(photo, photopilotProject.format.aspect, {
      direction: (seg.userOverrides && seg.userOverrides.kenBurnsDirection) || 'auto',
      intensity: intEl ? parseFloat(intEl.value) : 0.3,
      focusPoint: photo ? photo.focusPoint : { x: 0.5, y: 0.5 }
    });
    invalidateRender();
    requestPreviewFrame();
    renderFinetunePreview();
  };

  // Color preset
  const colPre = $('pp-color-preset');
  if (colPre) colPre.onchange = function() { updateSeg('colorPreset', colPre.value); };

  // Vignette
  const vig = $('pp-vignette');
  const vigLbl = $('pp-vignette-label');
  if (vig) vig.oninput = function() {
    if (vigLbl) vigLbl.textContent = parseFloat(vig.value).toFixed(2);
    updateSeg('vignette', parseFloat(vig.value));
  };

  // Transition type
  const trans = $('pp-transition-type');
  if (trans) trans.onchange = function() { updateSeg('transitionIn', trans.value); };

  // Transition duration
  const transDur = $('pp-transition-dur');
  const transDurLbl = $('pp-transition-dur-label');
  if (transDur) transDur.oninput = function() {
    const v = parseFloat(transDur.value);
    if (transDurLbl) transDurLbl.textContent = v.toFixed(1) + 's';
    updateSeg('transitionDuration', v);
  };

  // Shake
  const shakeEl = $('pp-shake');
  if (shakeEl) shakeEl.oninput = function() { updateSeg('shake', parseFloat(shakeEl.value)); };

  // Zoom Punch
  const zpEl = $('pp-zoom-punch');
  if (zpEl) zpEl.oninput = function() { updateSeg('zoomPunch', parseFloat(zpEl.value)); };

  // Film Grain
  const fgEl = $('pp-film-grain');
  const fgLbl = $('pp-film-grain-label');
  if (fgEl) fgEl.oninput = function() {
    const v = parseFloat(fgEl.value);
    if (fgLbl) fgLbl.textContent = v.toFixed(2);
    updateSeg('filmGrain', v);
  };

  // Frame style
  const fsEl = $('pp-frame-style');
  if (fsEl) fsEl.onchange = function() { updateSeg('frameStyle', fsEl.value); };

  // Spotlight toggle
  const spotToggle = $('pp-spotlight-toggle');
  const spotSliders = $('pp-spotlight-sliders');
  if (spotToggle) spotToggle.onchange = function() {
    if (spotSliders) spotSliders.style.display = spotToggle.checked ? '' : 'none';
    updateSeg('spotlight.enabled', spotToggle.checked);
  };

  // Spotlight X
  const spxEl = $('pp-spotlight-x');
  const spxLbl = $('pp-spotlight-x-label');
  if (spxEl) spxEl.oninput = function() {
    const v = parseFloat(spxEl.value);
    if (spxLbl) spxLbl.textContent = v.toFixed(2);
    updateSeg('spotlight.x', v);
  };

  // Spotlight Y
  const spyEl = $('pp-spotlight-y');
  const spyLbl = $('pp-spotlight-y-label');
  if (spyEl) spyEl.oninput = function() {
    const v = parseFloat(spyEl.value);
    if (spyLbl) spyLbl.textContent = v.toFixed(2);
    updateSeg('spotlight.y', v);
  };

  // Particles
  const partEl = $('pp-particles');
  if (partEl) partEl.onchange = function() { updateSeg('particles', partEl.value); };

  // Particle color
  const partColorEl = $('pp-particle-color');
  if (partColorEl) partColorEl.oninput = function() { updateSeg('particleColor', partColorEl.value); };

  // Prev / Next segment navigation
  const btnPrev = $('btn-pp-seg-prev');
  if (btnPrev) btnPrev.onclick = function() {
    const segs = photopilotProject.segments;
    const idx = segs.findIndex(function(s) { return s.id === ppSelectedSegId; });
    if (idx > 0) selectSegment(segs[idx - 1].id);
  };

  const btnNext = $('btn-pp-seg-next');
  if (btnNext) btnNext.onclick = function() {
    const segs = photopilotProject.segments;
    const idx = segs.findIndex(function(s) { return s.id === ppSelectedSegId; });
    if (idx !== -1 && idx < segs.length - 1) selectSegment(segs[idx + 1].id);
  };

  // Photo swap
  const swapBtn = $('btn-pp-swap-photo');
  if (swapBtn) swapBtn.onclick = function() {
    if (!ppSelectedSegId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async function() {
      const file = input.files[0];
      if (!file) return;
      const newPhoto = await loadPhoto(file);
      const seg = getSegById(ppSelectedSegId);
      if (!seg) return;
      const oldIdx = photopilotProject.photos.findIndex(function(p) { return p.id === seg.photoId; });
      if (oldIdx !== -1) photopilotProject.photos[oldIdx] = newPhoto;
      seg.photoId = newPhoto.id;
      seg.effect.kenBurns = computeKenBurnsPath(newPhoto, photopilotProject.format.aspect, {
        direction: (seg.userOverrides && seg.userOverrides.kenBurnsDirection) || 'auto',
        intensity: (seg.effect.kenBurns && seg.effect.kenBurns.intensity !== undefined) ? seg.effect.kenBurns.intensity : 0.3,
        focusPoint: newPhoto.focusPoint
      });
      invalidateRender();
      selectSegment(ppSelectedSegId);
      renderPhotoStrip();
      requestPreviewFrame();
    };
    input.click();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12 — Subtitle Panel Controls
// ─────────────────────────────────────────────────────────────────────────────

function initSubtitlePanelControls() {
  function updateSub(key, val) {
    photopilotProject.subtitle[key] = val;
    invalidateRender();
    requestPreviewFrame();
  }

  // Preset selector — applies REEL_SUB_PRESETS
  const presetSel = $('pp-sub-preset');
  if (presetSel) presetSel.onchange = function() {
    const preset = REEL_SUB_PRESETS[presetSel.value];
    if (!preset) return;
    // Apply preset fields to project subtitle
    const s = photopilotProject.subtitle;
    s.style      = preset.subtitleStyle || s.style;
    s.subColor   = preset.subColor   || s.subColor;
    s.subOutline = preset.subOutline || s.subOutline;
    s.subBackdrop= preset.subBackdrop|| s.subBackdrop;
    s.subSize    = preset.subSize    !== undefined ? preset.subSize    : s.subSize;
    s.subPosition= preset.subPosition !== undefined ? preset.subPosition : s.subPosition;
    s.subFont    = preset.subFont    || s.subFont;
    s.subAllCaps = preset.subAllCaps !== undefined ? preset.subAllCaps : s.subAllCaps;
    s.subAccent  = preset.subAccent  || s.subAccent;
    // Sync UI
    if ($('pp-sub-style'))    $('pp-sub-style').value     = s.style;
    if ($('pp-sub-font'))     $('pp-sub-font').value      = s.subFont;
    if ($('pp-sub-color'))    $('pp-sub-color').value     = s.subColor;
    if ($('pp-sub-accent'))   $('pp-sub-accent').value    = s.subAccent;
    if ($('pp-sub-outline'))  $('pp-sub-outline').value   = s.subOutline;
    if ($('pp-sub-backdrop')) $('pp-sub-backdrop').value  = s.subBackdrop;
    if ($('pp-sub-size'))     { $('pp-sub-size').value    = s.subSize;     const lbl = $('pp-sub-size-label');     if (lbl) lbl.textContent = s.subSize; }
    if ($('pp-sub-pos'))      { $('pp-sub-pos').value     = s.subPosition; const lbl = $('pp-sub-pos-label');      if (lbl) lbl.textContent = s.subPosition + '%'; }
    if ($('pp-sub-allcaps'))  $('pp-sub-allcaps').checked = s.subAllCaps;
    invalidateRender();
    requestPreviewFrame();
  };

  // Individual controls
  const pairs = [
    ['pp-sub-style',   'style',       function(v) { return v; }],
    ['pp-sub-font',    'subFont',     function(v) { return v; }],
    ['pp-sub-color',   'subColor',    function(v) { return v; }],
    ['pp-sub-accent',  'subAccent',   function(v) { return v; }],
    ['pp-sub-outline', 'subOutline',  function(v) { return v; }],
    ['pp-sub-backdrop','subBackdrop', function(v) { return v; }],
  ];

  pairs.forEach(function(pair) {
    const el = $(pair[0]);
    if (el) el.addEventListener('input', function() { updateSub(pair[1], pair[2](el.value)); });
  });

  // Size with label
  const sizeEl = $('pp-sub-size');
  const sizeLbl = $('pp-sub-size-label');
  if (sizeEl) sizeEl.oninput = function() {
    if (sizeLbl) sizeLbl.textContent = sizeEl.value;
    updateSub('subSize', parseFloat(sizeEl.value));
  };

  // Position with label
  const posEl = $('pp-sub-pos');
  const posLbl = $('pp-sub-pos-label');
  if (posEl) posEl.oninput = function() {
    if (posLbl) posLbl.textContent = posEl.value + '%';
    updateSub('subPosition', parseFloat(posEl.value));
  };

  // All caps
  const allcaps = $('pp-sub-allcaps');
  if (allcaps) allcaps.onchange = function() { updateSub('subAllCaps', allcaps.checked); };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13 — Export / Render
// ─────────────────────────────────────────────────────────────────────────────

async function renderToBlob(onProgress) {
  stopPhotopilotPreview();

  const dims = getPPExportDimensions(photopilotProject.format.aspect, '720p');
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width  = dims.width;
  exportCanvas.height = dims.height;
  const exportCtx = exportCanvas.getContext('2d');
  const W = dims.width;
  const H = dims.height;
  const totalDur    = photopilotProject.effectiveDuration;
  const FPS         = 30;
  const totalFrames = Math.ceil(totalDur * FPS);

  const stream = exportCanvas.captureStream(FPS);

  // Add audio track
  const cs = photopilotProject.contentSource;
  if (cs.audioBuffer) {
    const audioCtxExport = new AudioContext();
    const src = audioCtxExport.createBufferSource();
    src.buffer = cs.audioBuffer;
    const dest = audioCtxExport.createMediaStreamDestination();
    src.connect(dest);
    src.start(0);
    dest.stream.getAudioTracks().forEach(function(t) { stream.addTrack(t); });
  }

  const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: 4000000 });
  const chunks = [];
  recorder.ondataavailable = function(e) { if (e.data.size > 0) chunks.push(e.data); };

  ppRenderAbort = new AbortController();
  const abortSig = ppRenderAbort.signal;
  abortSig.addEventListener('abort', function() { try { recorder.stop(); } catch(_) {} });

  return new Promise(function(resolve, reject) {
    recorder.onstop = function() { resolve(new Blob(chunks, { type: mimeType })); };
    recorder.onerror = function(e) { reject(e.error || new Error('Recorder error')); };
    recorder.start();

    let frame = 0;

    function renderNextFrame() {
      if (abortSig.aborted) { try { recorder.stop(); } catch(_) {} return; }
      if (frame >= totalFrames) { recorder.stop(); return; }

      const t = frame / FPS;
      const seg = photopilotProject.segments.find(function(s) { return t >= s.startTime && t < s.endTime; })
               || photopilotProject.segments[photopilotProject.segments.length - 1];

      if (seg) {
        const segDur = seg.endTime - seg.startTime;
        const segT   = segDur > 0 ? (t - seg.startTime) / segDur : 0;
        const photo  = getPhotoById(seg.photoId);

        exportCtx.clearRect(0, 0, W, H);

        // 1. Ken Burns + color + shake + zoom punch
        if (photo && photo.img && seg.effect && seg.effect.kenBurns) {
          const filter = COLOR_PRESETS[seg.effect.colorPreset || 'none'] || '';
          if (filter) exportCtx.filter = filter;
          exportCtx.save();
          if (seg.effect.shake > 0) applyShakeTransform(exportCtx, seg.effect.shake);
          if (seg.effect.zoomPunch > 0 && segT < 0.25) {
            const punch = seg.effect.zoomPunch * (1 - segT / 0.25);
            exportCtx.translate(W / 2, H / 2);
            exportCtx.scale(1 + punch, 1 + punch);
            exportCtx.translate(-W / 2, -H / 2);
          }
          drawKenBurnsFrame(exportCtx, photo.img, seg.effect.kenBurns, segT, W, H,
            (seg.effect.kenBurns.easing || 'easeOutQuad'));
          exportCtx.restore();
          exportCtx.filter = 'none';
        } else {
          exportCtx.fillStyle = '#111';
          exportCtx.fillRect(0, 0, W, H);
        }

        // 2. In-photo effects (skip frame — drawn after transition)
        if (seg.effect) applyInPhotoEffects(exportCtx, seg, segT, W, H, { skipFrame: true });

        // 3. Transition
        if (seg.effect) {
          const transDur = seg.effect.transitionDuration || 0.4;
          const timeIntoNext = t - (seg.endTime - transDur);
          if (timeIntoNext > 0 && timeIntoNext <= transDur && photo && photo.img) {
            const nextSeg = photopilotProject.segments.find(function(s) { return s.startTime === seg.endTime; });
            const nextPhoto = nextSeg ? getPhotoById(nextSeg.photoId) : null;
            if (nextPhoto && nextPhoto.img) {
              const tProg   = timeIntoNext / transDur;
              const transFn = PP_TRANSITIONS[seg.effect.transitionIn || 'fade'] || PP_TRANSITIONS.fade;
              transFn(exportCtx, photo.img, nextPhoto.img, tProg, W, H);
            }
          }
        }

        // 3b. Frame decoration — after transition so it stays on top of crossfades
        if (seg.effect && seg.effect.frameStyle && seg.effect.frameStyle !== 'none') {
          drawFrameDecoration(exportCtx, seg.effect.frameStyle, W, H);
        }

        // 4. Subtitles — use per-segment Y position if AI set one
        const subStyle = photopilotProject.subtitle.style || 'classic';
        if (subStyle !== 'none' && photopilotProject.subtitle.words.length > 0) {
          syncSubtitleGlobals();
          if (seg && seg.subtitleY !== undefined) reelSubPosition = seg.subtitleY;
          try { renderReelSubtitle(exportCtx, W, H, t, photopilotProject.subtitle.words, subStyle); } catch(_) {}
        }

        // 5. Overlays
        drawPPOverlays(exportCtx, W, H, t);
      }

      frame++;
      if (onProgress) onProgress(frame / totalFrames);
      setTimeout(renderNextFrame, 1000 / FPS);
    }

    renderNextFrame();
  });
}

function triggerDownload(blob) {
  blob = blob || photopilotProject.renderedBlob;
  if (!blob) return;
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `photopilot-${Date.now()}.${ext}`;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
}

function initExportControls() {
  const btnExport  = $('btn-pp-export');
  const progDiv    = $('pp-render-progress');
  const progBar    = $('pp-render-bar');
  const progLbl    = $('pp-render-label');
  const dlDiv      = $('pp-render-dl');
  const dlLink     = $('pp-dl-link');
  const errDiv     = $('pp-render-error');

  if (!btnExport) return;

  btnExport.onclick = async function() {
    if (photopilotProject.segments.length === 0) {
      ppShowToast('Generate a reel first before exporting.');
      return;
    }
    // Show progress
    btnExport.disabled = true;
    if (progDiv) progDiv.style.display = '';
    if (dlDiv)   dlDiv.style.display   = 'none';
    if (errDiv)  errDiv.style.display  = 'none';
    if (progBar) progBar.style.width   = '0%';
    if (progLbl) progLbl.textContent   = 'Rendering…';

    try {
      const blob = await renderToBlob(function(pct) {
        if (progBar) progBar.style.width = `${Math.round(pct * 100)}%`;
        if (progLbl) progLbl.textContent = `${Math.round(pct * 100)}%`;
      });
      photopilotProject.renderedBlob = blob;
      if (photopilotProject.renderedBlobUrl) URL.revokeObjectURL(photopilotProject.renderedBlobUrl);
      photopilotProject.renderedBlobUrl = URL.createObjectURL(blob);

      if (progDiv) progDiv.style.display = 'none';
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const sizeMb = (blob.size / 1024 / 1024).toFixed(1);
      if (dlLink) {
        dlLink.href     = photopilotProject.renderedBlobUrl;
        dlLink.download = `photopilot-${Date.now()}.${ext}`;
        dlLink.textContent = `⬇ Save ${ext.toUpperCase()} · ${sizeMb} MB`;
      }
      if (dlDiv) dlDiv.style.display = '';
      // Auto-download — browser will trigger save dialog immediately
      triggerDownload(blob);
    } catch(err) {
      if (progDiv) progDiv.style.display = 'none';
      if (errDiv)  { errDiv.style.display = ''; errDiv.textContent = '❌ ' + (err.message || 'Render failed.'); }
    } finally {
      btnExport.disabled = false;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 15 — Subscribe / Follow Overlay Controls
// ─────────────────────────────────────────────────────────────────────────────

function initSubscribeFollowControls() {
  function wire(prefix, key) {
    const show  = $(`pp-ov-${prefix}-show`);
    const at    = $(`pp-ov-${prefix}-at`);
    const atLbl = $(`pp-ov-${prefix}-at-label`);
    const dur   = $(`pp-ov-${prefix}-dur`);
    const color = $(`pp-ov-${prefix}-color`);
    const text  = $(`pp-ov-${prefix}-text`);
    const state = photopilotProject.overlays[key];

    if (show) show.onchange = function() {
      state.enabled = show.checked;
      invalidateRender();
      requestPreviewFrame();
    };
    if (at) at.oninput = function() {
      state.at = parseFloat(at.value);
      if (atLbl) atLbl.textContent = parseFloat(at.value).toFixed(1) + 's';
      invalidateRender();
      requestPreviewFrame();
    };
    if (dur) dur.oninput = function() {
      state.dur = parseFloat(dur.value);
      invalidateRender();
      requestPreviewFrame();
    };
    if (color) color.oninput = function() {
      state.color = color.value;
      invalidateRender();
      requestPreviewFrame();
    };
    if (text) text.oninput = function() {
      state.text = text.value;
      invalidateRender();
      requestPreviewFrame();
    };
  }

  wire('sub', 'subscribe');
  wire('fol', 'follow');
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 16 — Zone 1 Initialization
// ─────────────────────────────────────────────────────────────────────────────

function initZone1() {
  // ── Back / Save ────────────────────────────────────────────────────────────
  const btnBack = $('btn-pp-back');
  if (btnBack) btnBack.onclick = function() { stopPhotopilotPreview(); navigateTo('home'); };

  const btnSaveTop = $('btn-pp-save-top');
  if (btnSaveTop) btnSaveTop.onclick = function() { ppShowToast('Save to gallery coming soon.'); };

  // ── API Key ─────────────────────────────────────────────────────────────────
  const keyInput  = $('pp-api-key');
  const keyStatus = $('pp-key-status-inline');
  const keyExpand = $('pp-key-expand');

  if (keyInput) {
    const saved = getPPApiKey();
    if (saved) {
      keyInput.value = saved;
      if (keyStatus) keyStatus.textContent = '🔑 Key saved';
    }
  }

  const btnToggleKey = $('btn-pp-toggle-key');
  if (btnToggleKey && keyExpand) {
    btnToggleKey.onclick = function() {
      keyExpand.style.display = keyExpand.style.display === 'none' ? '' : 'none';
    };
  }

  const btnSaveKey = $('btn-pp-save-key');
  if (btnSaveKey && keyInput) {
    btnSaveKey.onclick = function() {
      const val = keyInput.value.trim();
      if (val) {
        localStorage.setItem('stori_key_paid', val);
        if (keyStatus) keyStatus.textContent = '🔑 Key saved';
        const ks = $('pp-key-status');
        if (ks) { ks.textContent = '✓ Saved'; setTimeout(function() { ks.textContent = ''; }, 1500); }
        if (keyExpand) keyExpand.style.display = 'none';
      }
    };
  }

  // ── Format — Aspect ratio ───────────────────────────────────────────────────
  ['pp-aspect-916', 'pp-aspect-45', 'pp-aspect-11'].forEach(function(id) {
    const btn = $(id);
    if (!btn) return;
    btn.onclick = function() {
      ['pp-aspect-916', 'pp-aspect-45', 'pp-aspect-11'].forEach(function(bid) {
        const b = $(bid);
        if (b) b.classList.remove('active');
      });
      btn.classList.add('active');
      photopilotProject.format.aspect = btn.dataset.val;
    };
  });

  // ── Format — Duration ───────────────────────────────────────────────────────
  ['pp-dur-15', 'pp-dur-30', 'pp-dur-60'].forEach(function(id) {
    const btn = $(id);
    if (!btn) return;
    btn.onclick = function() {
      ['pp-dur-15', 'pp-dur-30', 'pp-dur-60'].forEach(function(bid) {
        const b = $(bid);
        if (b) b.classList.remove('active');
      });
      btn.classList.add('active');
      photopilotProject.format.duration = parseInt(btn.dataset.val, 10);
      syncDurationToCaps();
    };
  });

  // ── Mood dropdown ───────────────────────────────────────────────────────────
  const moodSel = $('pp-mood-select');
  if (moodSel) {
    moodSel.value = photopilotProject.effectsConfig.mood;
    moodSel.onchange = function() {
      photopilotProject.effectsConfig.mood = moodSel.value;
    };
  }

  // ── Voice dropdown (hidden in audio mode) ───────────────────────────────────
  const voiceSel   = $('pp-voice-select');
  const voiceLbl   = $('pp-voice-label');
  function syncVoiceVisibility(mode) {
    if (voiceLbl) voiceLbl.style.display = (mode === 'audio') ? 'none' : 'flex';
  }
  if (voiceSel) {
    voiceSel.value = photopilotProject.effectsConfig.ttsVoice || 'Kore';
    voiceSel.onchange = function() {
      photopilotProject.effectsConfig.ttsVoice = voiceSel.value;
    };
  }
  syncVoiceVisibility(photopilotProject.contentSource.mode);

  // ── Smart toggle ────────────────────────────────────────────────────────────
  const smartToggle = $('pp-smart-toggle');
  if (smartToggle) {
    smartToggle.checked = photopilotProject.effectsConfig.smartSuggestions;
    smartToggle.onchange = function() {
      photopilotProject.effectsConfig.smartSuggestions = smartToggle.checked;
    };
  }

  // ── Content tabs ────────────────────────────────────────────────────────────
  function updateGenerateBtn(mode) {
    const genBtn = $('btn-pp-generate');
    if (genBtn) genBtn.textContent = (mode === 'title') ? '✨ Generate Script →' : '✨ Generate Reel →';
    // Show/hide Script agent row based on mode
    const scriptRow = $('pp-agent-row-script');
    if (scriptRow) scriptRow.style.display = (mode === 'title') ? '' : 'none';
  }

  ['pp-tab-title', 'pp-tab-text', 'pp-tab-audio'].forEach(function(tabId) {
    const tab = $(tabId);
    if (!tab) return;
    tab.onclick = function() {
      ['pp-tab-title', 'pp-tab-text', 'pp-tab-audio'].forEach(function(id) {
        const t = $(id);
        if (t) t.classList.remove('active');
      });
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      photopilotProject.contentSource.mode = mode;
      ['pp-content-title', 'pp-content-text', 'pp-content-audio'].forEach(function(id) {
        const el = $(id);
        if (el) el.style.display = 'none';
      });
      const panel = $('pp-content-' + mode);
      if (panel) panel.style.display = '';
      updateGenerateBtn(mode);
      syncVoiceVisibility(mode);
      // Hide script review if switching tabs mid-flow
      hideScriptReview();
    };
  });

  // ── Title input ─────────────────────────────────────────────────────────────
  const titleInput = $('pp-title-input');
  if (titleInput) titleInput.oninput = function() {
    photopilotProject.contentSource.value = titleInput.value;
  };

  // ── Instructions textarea ────────────────────────────────────────────────────
  const instrInput = $('pp-title-instructions');
  if (instrInput) instrInput.oninput = function() {
    photopilotProject.contentSource.instructions = instrInput.value;
  };

  // ── Script textarea ──────────────────────────────────────────────────────────
  const scriptInput = $('pp-script-input');
  if (scriptInput) scriptInput.oninput = function() {
    photopilotProject.contentSource.value = scriptInput.value;
  };

  // ── Audio drop zone ─────────────────────────────────────────────────────────
  const audioDrop  = $('pp-audio-drop');
  const audioInput = $('pp-audio-input');

  if (audioDrop) {
    audioDrop.onclick = function() { if (audioInput) audioInput.click(); };
    audioDrop.addEventListener('dragover', function(e) {
      e.preventDefault();
      audioDrop.classList.add('drag-over');
    });
    audioDrop.addEventListener('dragleave', function() { audioDrop.classList.remove('drag-over'); });
    audioDrop.addEventListener('drop', function(e) {
      e.preventDefault();
      audioDrop.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) loadAudioFile(e.dataTransfer.files[0]);
    });
  }
  if (audioInput) audioInput.onchange = function(e) {
    if (e.target.files[0]) loadAudioFile(e.target.files[0]);
  };

  // ── Photos ──────────────────────────────────────────────────────────────────
  const photosInput = $('pp-photos-input');
  if (photosInput) photosInput.onchange = function(e) {
    addPhotos(e.target.files);
    photosInput.value = '';
  };

  // Add tile click
  const stripAdd = $('pp-strip-add-tile');
  if (stripAdd) stripAdd.onclick = function() {
    if (photosInput) photosInput.click();
  };

  // Also the label "Add" button wrapping photos input — clicking label triggers input
  // (handled natively by <label> wrapping)

  // Initialize photo counter and hint
  updatePhotoCounter();
  syncDurationToCaps();

  // ── Generate button ──────────────────────────────────────────────────────────
  const btnGenerate = $('btn-pp-generate');
  if (btnGenerate) btnGenerate.onclick = function() {
    if (photopilotProject.photos.length < MIN_PHOTOS) {
      ppShowToast('Add at least 1 photo to get started.');
      return;
    }
    runPhotopilotPipeline();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 17 — Zone 2 Initialization (Fine-tune, hidden until output)
// ─────────────────────────────────────────────────────────────────────────────

function initZone2() {
  // ── Accordion toggle ─────────────────────────────────────────────────────────
  const toggleBtn  = $('pp-finetune-toggle');
  const body       = $('pp-finetune-body');
  const arrowSpan  = toggleBtn ? toggleBtn.querySelector('.pp-acc-arrow') : null;

  if (toggleBtn && body) {
    toggleBtn.onclick = function() {
      const open = !body.classList.contains('hidden');
      body.classList.toggle('hidden', open);
      toggleBtn.classList.toggle('open', !open);
      if (arrowSpan) arrowSpan.textContent = open ? '▶' : '▼';
    };
  }

  // ── Segment / Overlays tab strip ─────────────────────────────────────────────
  const tabBtns = [
    { id: 'pp-tab-btn-segment', panel: 'pp-tab-segment' },
    { id: 'pp-tab-btn-overlays', panel: 'pp-tab-overlays' },
  ];

  tabBtns.forEach(function(tb) {
    const btn = $(tb.id);
    if (!btn) return;
    btn.onclick = function() {
      tabBtns.forEach(function(other) {
        const ob = $(other.id);
        const op = $(other.panel);
        if (ob) ob.classList.remove('active');
        if (op) op.classList.remove('active');
      });
      btn.classList.add('active');
      const panel = $(tb.panel);
      if (panel) panel.classList.add('active');
    };
  });

  // ── Segment controls ─────────────────────────────────────────────────────────
  renderTimeline();
  initSegmentPropControls();

  // Auto-select first segment
  if (photopilotProject.segments.length > 0) {
    selectSegment(photopilotProject.segments[0].id);
  }

  // ── Finetune preview transport ────────────────────────────────────────────────
  const ftPlay     = $('pp-ft-play');
  const ftScrub    = $('pp-ft-scrub');
  const ftScrubLbl = $('pp-ft-scrub-label');
  if (ftPlay) {
    ftPlay.onclick = function() {
      if (ppFtPlaying) pauseFinetunePlay(); else startFinetunePlay();
    };
  }
  if (ftScrub) {
    ftScrub.oninput = function() {
      pauseFinetunePlay();                        // stop play when user scrubs manually
      ppFtScrubT = parseInt(ftScrub.value, 10) / 100;
      if (ftScrubLbl) ftScrubLbl.textContent = ftScrub.value + '%';
      renderFinetunePreview();
    };
  }

  // ── Overlay controls ─────────────────────────────────────────────────────────
  const btnAddColour = $('btn-pp-add-colour-pic');
  if (btnAddColour) btnAddColour.onclick = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async function() {
      const file = input.files[0];
      if (!file) return;
      const src = URL.createObjectURL(file);
      const imgEl = new Image();
      imgEl.src = src;
      await new Promise(function(res) { imgEl.onload = res; });
      photopilotProject.overlays.items.push({
        id: ppNextOverlayId++,
        type: 'colour-pic',
        startTime: 0,
        duration: photopilotProject.effectiveDuration,
        params: {
          _imgEl: imgEl,
          position: 'br',
          size: 0.25,
          borderColor: '#ffffff',
          borderWidth: 3
        }
      });
      renderOverlayList();
      invalidateRender();
      requestPreviewFrame();
    };
    input.click();
  };

  const btnAddTime = $('btn-pp-add-time-pic');
  if (btnAddTime) btnAddTime.onclick = function() {
    photopilotProject.overlays.items.push({
      id: ppNextOverlayId++,
      type: 'time-pic',
      startTime: 0,
      duration: photopilotProject.effectiveDuration,
      params: {
        position: 'tl',
        order: ['day', 'month', 'year', 'none'],
        bgColorHex: '#000000',
        bgOpacity: 0.65,
        textColor: '#ffffff'
      }
    });
    renderOverlayList();
    invalidateRender();
    requestPreviewFrame();
  };

  renderOverlayList();
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 18 — Zone 3 Initialization (Preview, hidden until output)
// ─────────────────────────────────────────────────────────────────────────────

function initZone3() {
  // ── Canvas ───────────────────────────────────────────────────────────────────
  initPreviewCanvas();

  // ── Play / Pause ─────────────────────────────────────────────────────────────
  const playBtn = $('pp-phone-play');
  if (playBtn) playBtn.onclick = function() {
    if (ppPlaying) pausePreview();
    else startPreview();
  };

  // ── Scrub bar ────────────────────────────────────────────────────────────────
  const scrub = $('pp-scrub');
  if (scrub) {
    scrub.oninput = function() {
      const t = (parseInt(scrub.value, 10) / 1000) * photopilotProject.effectiveDuration;
      seekPreview(t);
    };
  }

  // ── Subtitle controls ─────────────────────────────────────────────────────────
  initSubtitlePanelControls();

  // Populate subtitle UI from current state
  const s = photopilotProject.subtitle;
  if ($('pp-sub-style'))    $('pp-sub-style').value     = s.style;
  if ($('pp-sub-font'))     $('pp-sub-font').value      = s.subFont;
  if ($('pp-sub-size'))     {
    $('pp-sub-size').value = s.subSize;
    const lbl = $('pp-sub-size-label');
    if (lbl) lbl.textContent = s.subSize;
  }
  if ($('pp-sub-pos'))      {
    $('pp-sub-pos').value = s.subPosition;
    const lbl = $('pp-sub-pos-label');
    if (lbl) lbl.textContent = s.subPosition + '%';
  }
  if ($('pp-sub-color'))    $('pp-sub-color').value     = s.subColor;
  if ($('pp-sub-accent'))   $('pp-sub-accent').value    = s.subAccent;
  if ($('pp-sub-outline'))  $('pp-sub-outline').value   = s.subOutline;
  if ($('pp-sub-backdrop')) $('pp-sub-backdrop').value  = s.subBackdrop;
  if ($('pp-sub-allcaps'))  $('pp-sub-allcaps').checked = s.subAllCaps;

  // ── Subscribe / Follow ───────────────────────────────────────────────────────
  initSubscribeFollowControls();

  // ── Timeline mini ────────────────────────────────────────────────────────────
  renderTimelineMini();

  // ── Export ───────────────────────────────────────────────────────────────────
  initExportControls();

  // ── Slider fills — #pp-ctrl-col ──────────────────────────────────────────────
  const _ctrlCol = $('pp-ctrl-col');
  if (_ctrlCol) {
    // Fill all existing sliders on init
    _ctrlCol.querySelectorAll('input[type=range]').forEach(syncSliderFill);
    // Keep fills updated on any input event (works for dynamically added sliders too)
    _ctrlCol.addEventListener('input', function(e) {
      if (e.target.type === 'range') syncSliderFill(e.target);
    });
  }

  // ── Start preview paused ─────────────────────────────────────────────────────
  ppCurrentTime = 0;
  ppPlaying = false;
  ppRafId = requestAnimationFrame(renderFrame);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 19 — IIFE Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

(function() {
  // Landing button
  const btnEntry = $('btn-create-photopilot');
  if (btnEntry) btnEntry.addEventListener('click', function() { navigateTo('photopilot'); });

  // Initialize Zone 1 immediately (always visible)
  initZone1();

  // Build agent panel immediately (always visible, dots start at 'waiting')
  initPPAgentPanel();
})();
