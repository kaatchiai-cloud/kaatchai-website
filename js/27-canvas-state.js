// ══════════════════════════════════════════
//  CANVAS GRAPH STATE — schema, migration,
//  mirror writes, validation gates, instance CRUD
//  Pure state module: no DOM, no rendering.
// ══════════════════════════════════════════
//
// Owns the data-model contract for the node-graph canvas:
//   scene = {
//     ...legacy flat fields (imgDataUrl, videoUrl, videoClips),
//     storyboardInstances: [{ id, prompt, refImageDataUrl, isActive,
//                             canvasPosition, createdAt,
//                             imageInstances: [{ id, parentStoryboardId, style,
//                                                styleOverridden, imgDataUrl,
//                                                status, error, isActive,
//                                                isRenderActive, canvasPosition,
//                                                generationContext, createdAt }] }],
//     videoInstances:      [{ id, sourceImageInstanceId, motionPrompt, duration,
//                             clips, status, error, taskId, isActive,
//                             isRenderActive, canvasPosition, createdAt }]
//   }
//
// Active-flag invariants (§5.3 of canvas-graph-plan.md):
//   storyboard.isActive          — RADIO per section
//   imageInstance.isActive       — MULTI-SELECT (⭐ "Use for video gen")
//   imageInstance.isRenderActive — RADIO per section (🎯 illustrated mode)
//   videoInstance.isRenderActive — RADIO per section (🎯 animated mode)

(function () {

const CANVAS_SCHEMA_VERSION = 1;

// ─── ID helpers ─────────────────────────────────────────────
function nextInstanceId(prefix, sceneId, existing) {
  let n = 0;
  const seen = new Set((existing || []).map(x => x.id));
  while (seen.has(`${prefix}-${sceneId}-${n}`)) n++;
  return `${prefix}-${sceneId}-${n}`;
}

// ─── Migration ──────────────────────────────────────────────
// Idempotent: re-running on already-migrated scene is a no-op.
function migrateScene(s, defaults) {
  if (!s) return s;
  defaults = defaults || {};
  const stylePreset = defaults.stylePreset || '';

  if (s.storyboardInstances && Array.isArray(s.storyboardInstances)) {
    // Already migrated — make sure required fields exist after a partial save
    s.storyboardInstances.forEach(sb => {
      sb.imageInstances = sb.imageInstances || [];
      sb.imageInstances.forEach(img => {
        img.generationContext = img.generationContext || { siblingRefIds: [], styleFingerprint: null, modelUsed: 'unknown' };
        if (typeof img.isRenderActive === 'undefined') img.isRenderActive = false;
        if (typeof img.isActive === 'undefined') img.isActive = false;
      });
    });
    s.videoInstances = s.videoInstances || [];
    s.videoInstances.forEach(v => {
      v.clips = v.clips || [];
      if (typeof v.isRenderActive === 'undefined') v.isRenderActive = !!v.isActive;
      if (!v.role) v.role = 'broll';
    });
    if (!s.frontRole) s.frontRole = 'broll';
    // Bible-binding fields (Phase 1 — defaults only; populated at gen time)
    if (!Array.isArray(s.bibleRefIds)) s.bibleRefIds = [];
    if (typeof s.bibleVersionUsed === 'undefined') s.bibleVersionUsed = null;
    if (typeof s.bibleStale === 'undefined') s.bibleStale = false;
    return s;
  }

  const sbId = `sb-${s.id}-0`;
  const imgId = `img-${s.id}-0`;
  const hasImage = !!s.imgDataUrl;
  s.storyboardInstances = [{
    id: sbId,
    prompt: s.prompt || '',
    refImageDataUrl: s.refImageDataUrl || '',
    isActive: true,
    canvasPosition: null,
    createdAt: s.createdAt || Date.now(),
    imageInstances: hasImage ? [{
      id: imgId,
      parentStoryboardId: sbId,
      style: stylePreset,
      styleOverridden: false,
      imgDataUrl: s.imgDataUrl,
      status: 'done',
      error: null,
      isActive: true,
      isRenderActive: true,
      canvasPosition: null,
      generationContext: { siblingRefIds: [], styleFingerprint: null, modelUsed: 'unknown' },
      createdAt: Date.now(),
    }] : [],
  }];

  const hasVideo = !!(s.videoUrl || (s.videoClips && s.videoClips.length));
  s.videoInstances = hasVideo ? [{
    id: `vid-${s.id}-0`,
    sourceImageInstanceId: imgId,
    motionPrompt: (s.prompt || '') + ' Smooth cinematic motion, high quality, consistent style.',
    duration: s.duration,
    clips: s.videoClips ? s.videoClips.slice() : [{ url: s.videoUrl, clipDuration: s.duration }],
    status: 'done',
    error: null,
    taskId: null,
    isActive: true,
    isRenderActive: true,
    role: 'broll',
    canvasPosition: null,
    createdAt: Date.now(),
  }] : [];

  if (!s.frontRole) s.frontRole = 'broll';

  return s;
}

function migrateAllScenes(scenes, defaults) {
  if (!Array.isArray(scenes)) return scenes;
  // Ensure each scene has a stable id (legacy scenes created without one)
  scenes.forEach((s, idx) => {
    if (s && (s.id === undefined || s.id === null)) s.id = idx;
  });
  scenes.forEach(s => migrateScene(s, defaults));
  return scenes;
}

// ─── Mirror writes (back-compat with export / editor) ───────
// Mirror flat scene fields from RENDER-active (🎯) instance,
// not the multi-select ⭐ video-gen-active flag.
function syncMirrorFields(scene, mode) {
  if (!scene || !scene.storyboardInstances) return;
  const sb = scene.storyboardInstances.find(s => s.isActive) || scene.storyboardInstances[0];
  if (!sb) return;
  scene.prompt = sb.prompt || scene.prompt;

  if (mode === 'illustrated') {
    const renderImg = sb.imageInstances.find(i => i.isRenderActive)
      || sb.imageInstances.find(i => i.isActive)
      || sb.imageInstances[0];
    scene.imgDataUrl = renderImg?.imgDataUrl || null;
    if (renderImg) {
      if (renderImg.imgDataUrl) scene.status = 'done';
      else if (renderImg.status === 'error') scene.status = 'error';
      else if (renderImg.status === 'generating') scene.status = 'generating';
    }
    scene.videoUrl = null;
    scene.videoClips = null;
  } else {
    // animated — videos export, image stays available for fallback if needed
    const renderImg = sb.imageInstances.find(i => i.isRenderActive)
      || sb.imageInstances.find(i => i.isActive)
      || sb.imageInstances[0];
    scene.imgDataUrl = renderImg?.imgDataUrl || null;
    if (renderImg) {
      if (renderImg.imgDataUrl) scene.status = 'done';
      else if (renderImg.status === 'error') scene.status = 'error';
      else if (renderImg.status === 'generating') scene.status = 'generating';
    }

    const renderVid = (scene.videoInstances || []).find(v => v.isRenderActive)
      || (scene.videoInstances || []).find(v => v.isActive)
      || (scene.videoInstances || [])[0];
    if (renderVid && renderVid.clips && renderVid.clips.length > 0) {
      scene.videoUrl = renderVid.clips[0].url || null;
      scene.videoClips = renderVid.clips.slice();
    } else {
      scene.videoUrl = null;
      scene.videoClips = null;
    }
  }
}

function syncAllMirrors(scenes, mode) {
  if (!Array.isArray(scenes)) return;
  scenes.forEach(s => syncMirrorFields(s, mode));
}

// ─── Active-flag invariants ─────────────────────────────────
// Normalize on load + after every toggle. Picks first as fallback
// if none active; drops extras if multiple.
function normalizeSceneFlags(scene, mode) {
  if (!scene || !scene.storyboardInstances) return;

  // Storyboard: exactly one isActive
  const sbs = scene.storyboardInstances;
  if (sbs.length > 0) {
    const activeCount = sbs.filter(s => s.isActive).length;
    if (activeCount === 0) sbs[0].isActive = true;
    else if (activeCount > 1) {
      let kept = false;
      sbs.forEach(s => {
        if (s.isActive && !kept) { kept = true; }
        else s.isActive = false;
      });
    }
  }

  // Image render flag (🎯) — radio per ACTIVE storyboard
  const activeSb = sbs.find(s => s.isActive);
  if (activeSb && activeSb.imageInstances && activeSb.imageInstances.length > 0) {
    const renderCount = activeSb.imageInstances.filter(i => i.isRenderActive).length;
    if (renderCount === 0) activeSb.imageInstances[0].isRenderActive = true;
    else if (renderCount > 1) {
      let kept = false;
      activeSb.imageInstances.forEach(i => {
        if (i.isRenderActive && !kept) kept = true;
        else i.isRenderActive = false;
      });
    }
  }

  // Video render flag (🎯) — radio per scene (animated mode)
  const vids = scene.videoInstances || [];
  if (vids.length > 0) {
    const renderCount = vids.filter(v => v.isRenderActive).length;
    if (renderCount === 0) vids[0].isRenderActive = true;
    else if (renderCount > 1) {
      let kept = false;
      vids.forEach(v => {
        if (v.isRenderActive && !kept) kept = true;
        else v.isRenderActive = false;
      });
    }
  }

  // Image isActive (⭐) — multi-select; no normalization needed,
  // but if a section has ZERO ⭐ and exactly one image, auto-star it
  if (activeSb && activeSb.imageInstances.length === 1 && !activeSb.imageInstances[0].isActive) {
    activeSb.imageInstances[0].isActive = true;
  }
}

function normalizeAll(scenes, mode) {
  if (!Array.isArray(scenes)) return;
  scenes.forEach(s => normalizeSceneFlags(s, mode));
}

// ─── Active-flag toggle helpers ─────────────────────────────
function setActiveStoryboard(scene, sbId) {
  scene.storyboardInstances.forEach(s => { s.isActive = (s.id === sbId); });
  normalizeSceneFlags(scene);
}

function toggleImageVideoGenActive(scene, imgId) {
  const sb = scene.storyboardInstances.find(s => s.isActive);
  if (!sb) return;
  const img = sb.imageInstances.find(i => i.id === imgId);
  if (img) img.isActive = !img.isActive;
}

function setImageRenderActive(scene, imgId) {
  const sb = scene.storyboardInstances.find(s => s.isActive);
  if (!sb) return;
  sb.imageInstances.forEach(i => { i.isRenderActive = (i.id === imgId); });
}

function setVideoRenderActive(scene, vidId) {
  (scene.videoInstances || []).forEach(v => { v.isRenderActive = (v.id === vidId); });
}

// ─── Instance CRUD ──────────────────────────────────────────
function addStoryboardInstance(scene, opts) {
  opts = opts || {};
  const id = nextInstanceId('sb', scene.id, scene.storyboardInstances);
  const inheritFrom = scene.storyboardInstances.find(s => s.isActive) || scene.storyboardInstances[0];
  const sb = {
    id,
    prompt: opts.prompt || (inheritFrom ? inheritFrom.prompt : (scene.prompt || '')),
    refImageDataUrl: opts.refImageDataUrl || (inheritFrom ? inheritFrom.refImageDataUrl : ''),
    isActive: false,
    canvasPosition: null,
    createdAt: Date.now(),
    imageInstances: [],
  };
  scene.storyboardInstances.push(sb);
  return sb;
}

function deleteStoryboardInstance(scene, sbId) {
  if (scene.storyboardInstances.length <= 1) return false;
  const idx = scene.storyboardInstances.findIndex(s => s.id === sbId);
  if (idx < 0) return false;
  const wasActive = scene.storyboardInstances[idx].isActive;
  // Drop video instances whose source image lived under this SB
  const droppedImgIds = scene.storyboardInstances[idx].imageInstances.map(i => i.id);
  scene.videoInstances = (scene.videoInstances || []).filter(v => !droppedImgIds.includes(v.sourceImageInstanceId));
  scene.storyboardInstances.splice(idx, 1);
  if (wasActive && scene.storyboardInstances.length > 0) scene.storyboardInstances[0].isActive = true;
  normalizeSceneFlags(scene);
  return true;
}

function addImageInstance(scene, sbId, opts) {
  opts = opts || {};
  const sb = scene.storyboardInstances.find(s => s.id === sbId);
  if (!sb) return null;
  const id = nextInstanceId('img', scene.id, sb.imageInstances);
  const img = {
    id,
    parentStoryboardId: sb.id,
    style: opts.style || '',
    styleOverridden: !!opts.styleOverridden,
    imgDataUrl: opts.imgDataUrl || null,
    status: opts.status || 'pending',
    error: null,
    isActive: false,
    isRenderActive: false,
    canvasPosition: null,
    // Per-variant prompt tune. When non-empty, the regen pipeline uses this
    // instead of the SB's master prompt. Lets the user iterate on one variant
    // without disturbing siblings or the master.
    promptOverride: opts.promptOverride || '',
    generationContext: opts.generationContext || { siblingRefIds: [], styleFingerprint: null, modelUsed: 'unknown' },
    createdAt: Date.now(),
  };
  sb.imageInstances.push(img);
  return img;
}

function deleteImageInstance(scene, imgId) {
  for (const sb of scene.storyboardInstances) {
    const idx = sb.imageInstances.findIndex(i => i.id === imgId);
    if (idx < 0) continue;
    if (sb.imageInstances.length <= 1) return false;
    const wasRender = sb.imageInstances[idx].isRenderActive;
    sb.imageInstances.splice(idx, 1);
    // Drop dependent video instances
    scene.videoInstances = (scene.videoInstances || []).filter(v => v.sourceImageInstanceId !== imgId);
    if (wasRender && sb.imageInstances.length > 0) sb.imageInstances[0].isRenderActive = true;
    normalizeSceneFlags(scene);
    return true;
  }
  return false;
}

function addVideoInstance(scene, sourceImgId, opts) {
  opts = opts || {};
  scene.videoInstances = scene.videoInstances || [];
  const id = nextInstanceId('vid', scene.id, scene.videoInstances);
  const sb = scene.storyboardInstances.find(s => s.isActive);
  const img = sb && sb.imageInstances.find(i => i.id === sourceImgId);
  const v = {
    id,
    sourceImageInstanceId: sourceImgId,
    motionPrompt: opts.motionPrompt || ((img?.prompt || sb?.prompt || scene.prompt || '') + ' Smooth cinematic motion, high quality, consistent style.'),
    duration: opts.duration || scene.duration,
    clips: opts.clips || [],
    status: opts.status || 'pending',
    error: null,
    taskId: null,
    isActive: false,
    isRenderActive: false,
    role: opts.role || 'broll',
    canvasPosition: null,
    createdAt: Date.now(),
  };
  scene.videoInstances.push(v);
  return v;
}

// Talking-head: ensure each scene has a narrator-role videoInstance whose source
// is the locked narrator setup composite. Idempotent — safe to call multiple times.
function ensureNarratorVideoInstance(scene) {
  if (!scene) return null;
  scene.videoInstances = scene.videoInstances || [];
  const existing = scene.videoInstances.find(v => v.role === 'narrator');
  if (existing) return existing;
  const setup = window.createJobState && window.createJobState.narratorSetup;
  if (!setup || !setup.locked || !setup.imageDataUrl) return null;
  const id = nextInstanceId('vid', scene.id, scene.videoInstances);
  const perf = scene.performance || { tone: 'matter-of-fact', gesture: 'neutral' };
  const motionPrompt = `Talking-head shot: locked framing, head and shoulders, eyes meeting camera. Delivery: ${perf.tone}. Gesture register: ${perf.gesture}. Subtle natural motion only — blinks, micro head turns, gentle gesture at chest height. Mouth movement matches natural speech rhythm. No camera moves. Studio backdrop unchanged.`;
  const v = {
    id,
    sourceImageInstanceId: 'cg-narrator-setup',
    motionPrompt,
    duration: scene.duration,
    clips: [],
    status: 'pending',
    error: null,
    taskId: null,
    isActive: false,
    isRenderActive: true,
    role: 'narrator',
    canvasPosition: null,
    createdAt: Date.now(),
  };
  scene.videoInstances.push(v);
  return v;
}

function deleteVideoInstance(scene, vidId) {
  scene.videoInstances = scene.videoInstances || [];
  if (scene.videoInstances.length <= 1) return false;
  const idx = scene.videoInstances.findIndex(v => v.id === vidId);
  if (idx < 0) return false;
  const wasRender = scene.videoInstances[idx].isRenderActive;
  scene.videoInstances.splice(idx, 1);
  if (wasRender && scene.videoInstances.length > 0) scene.videoInstances[0].isRenderActive = true;
  return true;
}

// ─── Validation gates ───────────────────────────────────────
// Returns gate state for every node in the canvas pipeline:
//   { ok, sectionWarnings, launchEnabled, launchBlockers,
//     bgmEnabled, bgmBlockers, audioSubEnabled, audioSubBlockers,
//     renderEnabled, renderBlockers }
//
// jobState = { bgmReady, bgmSkipped, audioSubReady, audioSubSkipped }
//   bgmReady       — createBgmUrl !== null (computed by caller from window globals)
//   bgmSkipped     — user explicitly skipped BGM
//   audioSubReady  — for illustrated: ≥1 language track in 'done'.
//                    for animated: always true (subtitles optional, audio locked).
//   audioSubSkipped — user explicitly skipped audio/subtitle step
function validateGates(scenes, mode, jobState) {
  jobState = jobState || {};
  const result = {
    ok: true,
    sectionWarnings: [],
    launchEnabled: false,
    launchBlockers: [],
    bgmEnabled: false,
    bgmBlockers: [],
    audioSubEnabled: false,
    audioSubBlockers: [],
    renderEnabled: false,
    renderBlockers: [],
  };
  if (!Array.isArray(scenes) || scenes.length === 0) return result;

  let anyVideoGenStar = false;
  let everySectionHasFinalActiveStoryboard = true;

  scenes.forEach((scene, sceneIdx) => {
    if (!scene.storyboardInstances) return;
    const activeSbs = scene.storyboardInstances.filter(s => s.isActive);
    if (activeSbs.length !== 1) {
      everySectionHasFinalActiveStoryboard = false;
      result.sectionWarnings.push({
        sceneIdx, code: 'sb-not-finalized',
        msg: `Section ${sceneIdx + 1} has ${activeSbs.length} active storyboards — pick one`,
      });
    }
    const sb = activeSbs[0] || scene.storyboardInstances[0];
    if (!sb || sb.imageInstances.length === 0) {
      result.sectionWarnings.push({
        sceneIdx, code: 'no-image',
        msg: `Section ${sceneIdx + 1} has no image — generate one first`,
      });
    } else {
      const starred = sb.imageInstances.filter(i => i.isActive);
      if (starred.length > 0) anyVideoGenStar = true;
      const generating = sb.imageInstances.filter(i => i.status === 'generating' || i.status === 'pending');
      if (starred.length > 0 && starred.some(i => i.status !== 'done')) {
        result.launchBlockers.push(`Section ${sceneIdx + 1} has ⭐ images that aren't done yet`);
      }
    }

    if (mode === 'animated') {
      const vids = scene.videoInstances || [];
      const doneVids = vids.filter(v => v.status === 'done');
      if (doneVids.length === 0) {
        result.renderBlockers.push(`Section ${sceneIdx + 1} has no video — generate one first`);
      } else {
        const renderActive = vids.filter(v => v.isRenderActive && v.status === 'done');
        if (renderActive.length !== 1) {
          result.renderBlockers.push(`Section ${sceneIdx + 1} has ${renderActive.length} 🎯 videos — pick exactly one`);
        }
      }
    } else {
      // illustrated
      if (sb && sb.imageInstances.length > 0) {
        const renderImg = sb.imageInstances.filter(i => i.isRenderActive);
        if (renderImg.length !== 1) {
          result.renderBlockers.push(`Section ${sceneIdx + 1}: pick exactly one 🎯 image`);
        }
      }
    }
  });

  if (!everySectionHasFinalActiveStoryboard) {
    result.launchBlockers.unshift('All sections must have exactly one active storyboard');
  }
  if (!anyVideoGenStar) {
    result.launchBlockers.unshift('Star at least one image to animate');
  }

  result.launchEnabled = result.launchBlockers.length === 0;

  // ─── BGM gate (post-prod) ───────────────────────────────
  // Animated: enabled when ≥1 🎯 video has status 'done'
  // Illustrated: enabled when ≥1 🎯 image has status 'done'
  let bgmInputReady = false;
  if (mode === 'animated') {
    bgmInputReady = scenes.some(s => (s.videoInstances || []).some(v => v.isRenderActive && v.status === 'done'));
    if (!bgmInputReady) result.bgmBlockers.push('Generate at least one video before BGM');
  } else {
    bgmInputReady = scenes.some(s => {
      const sb = (s.storyboardInstances || []).find(x => x.isActive);
      const renderImg = sb?.imageInstances.find(i => i.isRenderActive && i.status === 'done')
        || sb?.imageInstances.find(i => i.status === 'done');
      return !!renderImg;
    });
    if (!bgmInputReady) result.bgmBlockers.push('Generate at least one image before BGM');
  }
  result.bgmEnabled = bgmInputReady;
  const bgmReady = !!(jobState.bgmReady || jobState.bgmSkipped);

  // ─── Audio + Subtitles gate (post-prod) ─────────────────
  result.audioSubEnabled = bgmReady;
  if (!bgmReady) result.audioSubBlockers.push('Complete or skip BGM first');
  let audioSubReady = !!jobState.audioSubSkipped;
  if (mode === 'animated') {
    // Subtitles are always optional; audio is locked. Enabled gate passes once BGM ready.
    audioSubReady = audioSubReady || bgmReady;
  } else {
    // Illustrated: need ≥1 language track ready (jobState.audioSubReady) OR skipped
    audioSubReady = audioSubReady || !!jobState.audioSubReady;
    if (!audioSubReady && bgmReady) {
      result.audioSubBlockers.push('Generate or skip the audio/subtitles step');
    }
  }

  // ─── Render gate ────────────────────────────────────────
  if (!bgmReady) result.renderBlockers.push('BGM step pending');
  if (!audioSubReady && bgmReady) result.renderBlockers.push('Audio / subtitles step pending');
  result.renderEnabled = result.renderBlockers.length === 0;
  result.ok = result.launchEnabled && result.renderEnabled;
  return result;
}

// ─── Launch helper: which images need a video? ──────────────
// Returns array of { scene, sceneIdx, image } for every ⭐ image
// in every section's active storyboard that does NOT yet have
// a video instance sourced from it.
function listImagesAwaitingVideo(scenes) {
  const out = [];
  (scenes || []).forEach((scene, sceneIdx) => {
    const sb = (scene.storyboardInstances || []).find(s => s.isActive);
    if (!sb) return;
    const haveSource = new Set((scene.videoInstances || []).map(v => v.sourceImageInstanceId));
    sb.imageInstances.forEach(img => {
      if (img.isActive && img.status === 'done' && !haveSource.has(img.id)) {
        out.push({ scene, sceneIdx, image: img });
      }
    });
  });
  return out;
}

// ─── Pending placeholder images ─────────────────────────────
// migrateScene only creates an imageInstance when the scene already has an
// imgDataUrl. When the canvas mounts at "Launch Image Agent" click time,
// generation hasn't run yet, so every storyboard ends up with empty
// imageInstances and the canvas has no nodes to render placeholders for.
// This helper ensures every active storyboard has at least one imageInstance,
// reflecting whatever state the legacy scene fields say.
function ensurePendingImages(scenes, opts) {
  if (!Array.isArray(scenes)) return scenes;
  const stylePreset = (opts && opts.stylePreset) || '';
  scenes.forEach(scene => {
    const sbs = scene.storyboardInstances || [];
    sbs.forEach(sb => {
      if (sb.imageInstances && sb.imageInstances.length > 0) return;
      const status = scene.status === 'generating' ? 'generating'
                   : scene.status === 'error'      ? 'error'
                   : scene.imgDataUrl              ? 'done'
                   : 'pending';
      sb.imageInstances = [{
        id: `img-${scene.id}-0`,
        parentStoryboardId: sb.id,
        style: stylePreset,
        styleOverridden: false,
        imgDataUrl: scene.imgDataUrl || null,
        status,
        error: null,
        isActive: true,
        isRenderActive: true,
        canvasPosition: null,
        generationContext: { siblingRefIds: [], styleFingerprint: null, modelUsed: 'unknown' },
        createdAt: Date.now(),
      }];
    });
  });
  return scenes;
}

// ─── Public surface ─────────────────────────────────────────
window.CanvasState = {
  CANVAS_SCHEMA_VERSION,
  migrateScene,
  migrateAllScenes,
  ensurePendingImages,
  syncMirrorFields,
  syncAllMirrors,
  normalizeSceneFlags,
  normalizeAll,
  setActiveStoryboard,
  toggleImageVideoGenActive,
  setImageRenderActive,
  setVideoRenderActive,
  addStoryboardInstance,
  deleteStoryboardInstance,
  addImageInstance,
  deleteImageInstance,
  addVideoInstance,
  ensureNarratorVideoInstance,
  deleteVideoInstance,
  validateGates,
  listImagesAwaitingVideo,
  nextInstanceId,
};

})();
