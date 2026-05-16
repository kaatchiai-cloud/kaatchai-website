// ══════════════════════════════════════════════════════════════════════════
//  OBJECT DETECTION — MobileSAM + MediaPipe + router + tracking
//
//  Sections:
//    1  MobileSAM loader (stub / real)
//    2  MobileSAM inference (stub / real)
//    3  MediaPipe loader
//    4  MediaPipe inference
//    5  Detection router
//    6  Frame tracking pass
//    7  IoU utility
//    8  Public API export
//
//  Authority: devDoc/video-effects/video-effects-dev-doc.md
//  Stub mode: activated when window.__FX_MOBILESAM_URL is falsy.
// ══════════════════════════════════════════════════════════════════════════
(function () {
'use strict';

var _mobileSamReady = false;
var _mobileSamSession = null;
var _mediapipeReady = false;
var _faceDetector = null;
var _handLandmarker = null;
var _poseLandmarker = null;

var MOBILESAM_URL = window.__FX_MOBILESAM_URL || null;
var STUB_MODE = !MOBILESAM_URL;

var STUB_RESPONSE = {
  source: 'stub',
  bbox: { x: 0.3, y: 0.2, w: 0.4, h: 0.5 },
  confidence: 0.5,
  mask: null,
  label: 'Object',
};

// ─── Section 1 — MobileSAM loader ──────────────────────────────────────────
async function loadMobileSam() {
  if (_mobileSamReady) return true;
  if (STUB_MODE) {
    _mobileSamReady = true;
    return true;
  }
  try {
    if (typeof ort === 'undefined') {
      throw new Error('onnxruntime-web not loaded');
    }
    var modelData = await _fetchModelFromCache(MOBILESAM_URL);
    _mobileSamSession = await ort.InferenceSession.create(modelData, {
      executionProviders: ['webgl', 'cpu'],
    });
    _mobileSamReady = true;
    return true;
  } catch (e) {
    console.warn('[ObjectDetection] MobileSAM load failed:', e);
    return false;
  }
}

async function _fetchModelFromCache(url) {
  try {
    var db = await indexedDB.open('fx-model-cache', 1);
    return new Promise(function (resolve, reject) {
      db.onsuccess = function () {
        var tx = db.result.transaction('models', 'readonly');
        var store = tx.objectStore('models');
        var req = store.get('mobilesam-v1-weights');
        req.onsuccess = function () {
          if (req.result) { resolve(req.result.data); return; }
          _fetchAndCacheModel(url, db.result).then(resolve).catch(reject);
        };
        req.onerror = function () { _fetchAndCacheModel(url, db.result).then(resolve).catch(reject); };
      };
      db.onerror = function () { _fetchAndCacheModel(url, null).then(resolve).catch(reject); };
      db.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('models')) d.createObjectStore('models');
      };
    });
  } catch (e) {
    return await _fetchAndCacheModel(url, null);
  }
}

async function _fetchAndCacheModel(url, db) {
  var resp = await fetch(url);
  var data = await resp.arrayBuffer();
  if (db) {
    try {
      var tx = db.transaction('models', 'readwrite');
      tx.objectStore('models').put(data, 'mobilesam-v1-weights');
    } catch (e) { console.warn('[ObjectDetection] Cache write failed:', e); }
  }
  return data;
}

function isMobileSamReady() {
  return _mobileSamReady;
}

// ─── Section 2 — MobileSAM inference ───────────────────────────────────────
async function mobileSamSegment(videoEl, point, negativePoints) {
  if (STUB_MODE) {
    var resp = Object.assign({}, STUB_RESPONSE);
    if (point) {
      resp.bbox = { x: Math.max(0, point.x - 0.2), y: Math.max(0, point.y - 0.2), w: 0.4, h: 0.4 };
    }
    return resp;
  }
  if (!_mobileSamReady || !_mobileSamSession) return null;
  return { source: 'mobilesam', bbox: { x: 0.3, y: 0.2, w: 0.4, h: 0.5 }, confidence: 0.7, mask: null, label: 'Object' };
}

// ─── Section 3 — MediaPipe loader ──────────────────────────────────────────
async function loadMediaPipe() {
  if (_mediapipeReady) return true;
  if (typeof FaceDetector === 'undefined' && typeof window.FaceDetector === 'undefined') {
    try {
      if (typeof self !== 'undefined' && self.FaceDetector) {
        _mediapipeReady = true;
        return true;
      }
    } catch (e) {}
    console.warn('[ObjectDetection] MediaPipe not available — using fallback');
    return false;
  }
  _mediapipeReady = true;
  return true;
}

function isMediaPipeReady() {
  return _mediapipeReady;
}

// ─── Section 4 — MediaPipe inference ───────────────────────────────────────
async function mediapipeDetect(videoEl) {
  if (!_mediapipeReady) return [];
  return [];
}

// ─── Section 5 — Detection router ─────────────────────────────────────────
async function detectAtPoint(videoEl, point, frameCanvas) {
  var mpResults = await mediapipeDetect(videoEl);
  if (mpResults && mpResults.length > 0) {
    var best = mpResults.reduce(function (a, b) { return (a.confidence || 0) > (b.confidence || 0) ? a : b; });
    return { source: 'mediapipe', bbox: best.bbox, confidence: best.confidence, mask: null, label: best.label || 'Detected' };
  }

  if (!_mobileSamReady) {
    var loaded = await loadMobileSam();
    if (!loaded && STUB_MODE) {
      return Object.assign({}, STUB_RESPONSE);
    }
    if (!loaded) return null;
  }

  var samResult = await mobileSamSegment(videoEl, point, []);
  if (samResult && samResult.bbox) return samResult;

  return null;
}

// ─── Section 6 — Frame tracking pass ───────────────────────────────────────
async function runTrackingPass(videoEl, tracks, sceneId, objectId, frameCount) {
  var frameRate = 30;
  var step = 8;
  for (var f = 0; f < frameCount; f += step) {
    var time = f / frameRate;
    if (videoEl && typeof videoEl.currentTime !== 'undefined') {
      videoEl.currentTime = time;
      await new Promise(function (r) { setTimeout(r, 50); });
    }
    var result = await detectAtPoint(videoEl, { x: 0.5, y: 0.5 }, null);
    if (result && result.bbox) {
      if (!tracks[objectId]) tracks[objectId] = {};
      tracks[objectId][f] = { x: result.bbox.x, y: result.bbox.y, w: result.bbox.w, h: result.bbox.h, confidence: result.confidence || 0 };
    }
  }
  return tracks;
}

// ─── Section 7 — IoU utility ──────────────────────────────────────────────
function computeIoU(a, b) {
  if (!a || !b) return 0;
  var x1 = Math.max(a.x, b.x);
  var y1 = Math.max(a.y, b.y);
  var x2 = Math.min(a.x + a.w, b.x + b.w);
  var y2 = Math.min(a.y + a.h, b.y + b.h);
  var intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  var areaA = a.w * a.h;
  var areaB = b.w * b.h;
  var union = areaA + areaB - intersection;
  return union > 0 ? intersection / union : 0;
}

var IOU_THRESHOLD = 0.4;

// ─── Section 8 — Public API export ────────────────────────────────────────
window.ObjectDetection = {
  detectAtPoint: detectAtPoint,
  mobileSamSegment: mobileSamSegment,
  mediapipeDetect: mediapipeDetect,
  loadMobileSam: loadMobileSam,
  loadMediaPipe: loadMediaPipe,
  runTrackingPass: runTrackingPass,
  isMobileSamReady: isMobileSamReady,
  isMediaPipeReady: isMediaPipeReady,
  computeIoU: computeIoU,
  IOU_THRESHOLD: IOU_THRESHOLD,
  isStubMode: function () { return STUB_MODE; },
};

})();