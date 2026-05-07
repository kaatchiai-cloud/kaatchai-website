// ══════════════════════════════════════════
//  LIP SYNC — Tier 1 (Stori sync) engine
//  voice-and-lipsync-plan §10.1 Phase 7
//
//  Browser MediaPipe Face Mesh detection → per-frame overlay JSON → mouth
//  sprite compositing at export tick. No server / hosting required for v1.
//
//  Public API on window.LipSync:
//    loadFaceLandmarker()           — lazy CDN load; idempotent
//    detectFacesInClip(blob, fps)   — per-frame faces[]
//    buildOverlayInstructions(...)  — combine detection + speakerTurns + audio
//    sampleAudioAmplitude(...)      — Web Audio analyser for sprite openness
//    composeMouthSprite(...)        — paint sprite at mouth center on canvas
// ══════════════════════════════════════════

(function () {
  'use strict';

  // CDN module — loaded lazily on first detection call.
  // ~10MB initial download; cached by browser. Free at scale.
  const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs';
  const MEDIAPIPE_WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
  const FACE_LANDMARKER_MODEL =
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

  let _faceLandmarker = null;
  let _loadingPromise = null;
  let _detectionFailures = 0;

  // Selected lip-mesh landmark indices on the FaceMesh 478-point topology.
  // Outer lip ring (full mouth boundary) — used for mouth-bbox + center.
  const LIP_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];
  // Subset for fast head-pose PnP (Perspective-n-Point) solve approximation:
  // nose tip, chin, left/right eye outer, left/right mouth corner.
  // We approximate yaw from horizontal asymmetry of these landmarks since
  // running real PnP would require cv.solvePnP — overkill for our purposes.
  const HEAD_POSE_PROXY = {
    noseTip: 1,
    chinBottom: 152,
    leftEyeOuter: 33,
    rightEyeOuter: 263,
    leftMouthCorner: 61,
    rightMouthCorner: 291,
  };

  async function loadFaceLandmarker() {
    if (_faceLandmarker) return _faceLandmarker;
    if (_loadingPromise) return _loadingPromise;
    _loadingPromise = (async () => {
      try {
        const mod = await import(/* @vite-ignore */ MEDIAPIPE_CDN);
        const { FaceLandmarker, FilesetResolver } = mod;
        const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
        _faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: 'GPU' },
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
          runningMode: 'VIDEO',
          numFaces: 4,
        });
        return _faceLandmarker;
      } catch (e) {
        // GPU delegate may fail on some hardware; retry with CPU
        console.warn('[LipSync] GPU delegate failed, retrying CPU:', e.message);
        try {
          const mod = await import(/* @vite-ignore */ MEDIAPIPE_CDN);
          const { FaceLandmarker, FilesetResolver } = mod;
          const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
          _faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numFaces: 4,
          });
          return _faceLandmarker;
        } catch (e2) {
          _loadingPromise = null;
          throw new Error('MediaPipe load failed: ' + (e2.message || e2));
        }
      }
    })();
    return _loadingPromise;
  }

  // Compute mouth bounding box + center from full lip-ring landmarks.
  function computeMouthRegion(landmarks, frameW, frameH) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const idx of LIP_OUTER) {
      const lm = landmarks[idx];
      if (!lm) continue;
      const x = lm.x * frameW;
      const y = lm.y * frameH;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    if (!isFinite(minX)) return null;
    return {
      mouthCenter: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      mouthSize: { w: maxX - minX, h: maxY - minY },
    };
  }

  // Approximate head yaw from landmark horizontal asymmetry. Returns degrees.
  // Positive = head turned to camera-right; negative = camera-left.
  function approximateHeadYaw(landmarks) {
    const noseTip = landmarks[HEAD_POSE_PROXY.noseTip];
    const leftEye = landmarks[HEAD_POSE_PROXY.leftEyeOuter];
    const rightEye = landmarks[HEAD_POSE_PROXY.rightEyeOuter];
    if (!noseTip || !leftEye || !rightEye) return 0;
    // Eye-line midpoint
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeSpan = Math.abs(rightEye.x - leftEye.x) || 0.001;
    // Nose offset from eye-line mid as fraction of eye span
    const offset = (noseTip.x - eyeMidX) / eyeSpan;
    // Empirical calibration: ±0.5 fraction = ~±90° yaw
    return Math.max(-90, Math.min(90, offset * 180));
  }

  // Build a per-face descriptor used by identity matching + overlay paint.
  function describeFace(faceLandmarks, frameW, frameH) {
    const region = computeMouthRegion(faceLandmarks, frameW, frameH);
    if (!region) return null;
    const yaw = approximateHeadYaw(faceLandmarks);
    const mouthVisible = Math.abs(yaw) < 50 && region.mouthSize.w > 4;
    return {
      mouthCenter: region.mouthCenter,
      mouthSize: region.mouthSize,
      headYaw: yaw,
      mouthVisible,
      // Also store face centroid in normalized coords for identity matching by position
      centroidX: faceLandmarks[1] ? faceLandmarks[1].x : 0.5,
    };
  }

  // Detect faces in every Nth frame of a video clip. Returns:
  //   {
  //     fps, totalFrames,
  //     frames: [{ time, faces: [{ mouthCenter, mouthSize, headYaw, mouthVisible, centroidX }] }]
  //   }
  // sampling: detect every frame at fps; can be downsampled by caller.
  async function detectFacesInClip(videoElement, opts) {
    const fps = (opts && opts.fps) || 30;
    const onProgress = (opts && opts.onProgress) || function () {};
    const landmarker = await loadFaceLandmarker();
    const duration = videoElement.duration;
    if (!duration || !isFinite(duration)) {
      throw new Error('Video duration unknown — cannot detect faces');
    }
    const totalFrames = Math.floor(duration * fps);
    const frames = [];
    const off = document.createElement('canvas');
    off.width = videoElement.videoWidth || 1280;
    off.height = videoElement.videoHeight || 720;
    const offCtx = off.getContext('2d');
    // Seek + draw + detect per frame. Series — MediaPipe VIDEO mode requires
    // monotonic timestamps anyway.
    const wasPaused = videoElement.paused;
    videoElement.pause();
    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps;
      // Seek
      videoElement.currentTime = t;
      await new Promise((resolve) => {
        const handler = () => { videoElement.removeEventListener('seeked', handler); resolve(); };
        videoElement.addEventListener('seeked', handler);
        // Safety timeout — some browsers don't fire seeked reliably
        setTimeout(() => { videoElement.removeEventListener('seeked', handler); resolve(); }, 250);
      });
      // Draw frame to offscreen canvas
      offCtx.drawImage(videoElement, 0, 0, off.width, off.height);
      let result;
      try {
        result = landmarker.detectForVideo(off, t * 1000);
      } catch (e) {
        console.warn(`[LipSync] detect failed @ t=${t.toFixed(3)}:`, e.message);
        frames.push({ time: t, faces: [] });
        continue;
      }
      const faces = (result.faceLandmarks || [])
        .map(fLandmarks => describeFace(fLandmarks, off.width, off.height))
        .filter(Boolean);
      frames.push({ time: t, faces });
      if (f % 10 === 0) onProgress(f, totalFrames);
    }
    if (!wasPaused) {
      try { videoElement.play(); } catch (_) {}
    }
    return { fps, totalFrames, frameW: off.width, frameH: off.height, frames };
  }

  // Identity match faces to characters by storyboard position prior +
  // optional centroid sort. Position prior comes from scene.framingMeta or
  // is inferred from the speaker's name appearing first.
  //
  // Simple v1 strategy: if scene has 1 speaker and 1 face detected → match.
  // If 2 faces detected: leftmost face = speaker (assumed primary).
  // If 3+: leftmost = speaker. Caller may override via opts.matchPolicy.
  function matchFaceToSpeaker(detection, speakerCharacterId, opts) {
    const matches = [];
    for (const frame of detection.frames) {
      if (!frame.faces.length) {
        matches.push({ time: frame.time, face: null });
        continue;
      }
      // Sort faces left-to-right by centroid
      const sorted = frame.faces.slice().sort((a, b) => a.centroidX - b.centroidX);
      // v1: speaker = leftmost face by default. Future: check storyboard
      // staging hints for "Maya on right" etc.
      const policy = (opts && opts.matchPolicy) || 'leftmost';
      const face = (policy === 'rightmost') ? sorted[sorted.length - 1] : sorted[0];
      matches.push({ time: frame.time, face });
    }
    return matches;
  }

  // Per-frame audio amplitude envelope for one speaker turn. Returns array
  // of { time, amplitude } at fps. Used to drive sprite openness.
  function sampleAudioAmplitude(audioBuffer, startMs, endMs, fps) {
    if (!audioBuffer) return [];
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.max(0, Math.floor((startMs / 1000) * sampleRate));
    const endSample = Math.min(audioBuffer.length, Math.ceil((endMs / 1000) * sampleRate));
    const data = audioBuffer.getChannelData(0);
    const windowSize = Math.max(1, Math.floor(sampleRate / fps));
    const out = [];
    for (let s = startSample; s < endSample; s += windowSize) {
      let sumSq = 0;
      const end = Math.min(endSample, s + windowSize);
      for (let i = s; i < end; i++) sumSq += data[i] * data[i];
      const rms = Math.sqrt(sumSq / Math.max(1, end - s));
      // Scale rms to 0..1 with mild compression
      const amp = Math.min(1, rms * 4);
      const t = (s - startSample) / sampleRate + (startMs / 1000);
      out.push({ time: t, amplitude: amp });
    }
    return out;
  }

  // Build the overlay-instructions JSON for one scene clip. Combines:
  //   detection (per-frame faces)
  //   speakerTurns (which speaker is active at each time window)
  //   audio amplitude envelope (drives sprite frame: closed/half/open)
  //
  // Output shape per voice-and-lipsync-plan §10.1:
  //   { fps, totalFrames, speakers, overlays: [{ frame, speaker, mouthCenter, mouthSize, headYaw, openness, sceneCoords }] }
  function buildOverlayInstructions(detection, speakerTurns, audioBuffer) {
    const fps = detection.fps;
    const speakerNames = Array.from(new Set(speakerTurns.map(t => t.speakerCharacterId).filter(Boolean)));
    const overlays = [];
    const faceMatches = matchFaceToSpeaker(detection, null);
    for (let f = 0; f < detection.frames.length; f++) {
      const frame = detection.frames[f];
      const t = frame.time;
      // Find active speaker turn at this time
      const turn = speakerTurns.find(s => t * 1000 >= s.startMs && t * 1000 < s.endMs);
      if (!turn) continue;
      const faceMatch = faceMatches[f];
      if (!faceMatch || !faceMatch.face) continue;
      const face = faceMatch.face;
      if (!face.mouthVisible) continue;
      // Sample amplitude at this frame within the turn
      const localT = (t * 1000 - turn.startMs);
      const sampleIdx = Math.floor((localT / 1000) * fps);
      const ampList = turn._cachedAmps || (turn._cachedAmps = sampleAudioAmplitude(audioBuffer, turn.startMs, turn.endMs, fps));
      const amp = ampList[sampleIdx] ? ampList[sampleIdx].amplitude : 0;
      overlays.push({
        frame: f,
        time: t,
        speakerCharacterId: turn.speakerCharacterId,
        mouthCenter: face.mouthCenter,
        mouthSize: face.mouthSize,
        headYaw: face.headYaw,
        openness: amp,
      });
    }
    return {
      fps,
      totalFrames: detection.totalFrames,
      frameW: detection.frameW,
      frameH: detection.frameH,
      speakers: speakerNames,
      overlays,
    };
  }

  // Composite a mouth sprite onto the export canvas at frame `time`.
  // sprites: { closed: Image|HTMLImageElement|dataURL, half: ..., open: ... }
  // Returns true if a sprite was painted.
  function composeMouthSprite(ctx, frameTime, exportW, exportH, overlayJson, sprites) {
    if (!overlayJson || !overlayJson.overlays || !sprites) return false;
    const fps = overlayJson.fps || 30;
    const fIdx = Math.round(frameTime * fps);
    // Find the overlay matching this frame (or nearest)
    let overlay = overlayJson.overlays.find(o => o.frame === fIdx);
    if (!overlay) {
      // Soft-tolerate: nearest within ±1 frame
      overlay = overlayJson.overlays.find(o => Math.abs(o.frame - fIdx) <= 1);
    }
    if (!overlay) return false;
    if (Math.abs(overlay.headYaw) > 25) return false;
    // Pick sprite by amplitude
    let key;
    if (overlay.openness < 0.2)      key = 'closed';
    else if (overlay.openness < 0.6) key = 'half';
    else                             key = 'open';
    const sprite = sprites[key];
    if (!sprite) return false;
    // Scale mouth coords from detection frame size to export canvas size
    const sx = exportW / overlayJson.frameW;
    const sy = exportH / overlayJson.frameH;
    const cx = overlay.mouthCenter.x * sx;
    const cy = overlay.mouthCenter.y * sy;
    const w = overlay.mouthSize.w * sx * 1.6;   // slight pad so sprite covers
    const h = overlay.mouthSize.h * sy * 1.8;
    try {
      ctx.drawImage(sprite, cx - w / 2, cy - h / 2, w, h);
    } catch (_) {
      return false;
    }
    return true;
  }

  // Helper: load a dataURL into an HTMLImageElement (cached).
  const _spriteImageCache = new Map();
  function spriteFromDataUrl(dataUrl) {
    if (!dataUrl) return null;
    if (_spriteImageCache.has(dataUrl)) return _spriteImageCache.get(dataUrl);
    const img = new Image();
    img.src = dataUrl;
    _spriteImageCache.set(dataUrl, img);
    return img;
  }

  // Get failure rate (telemetry hook)
  function getFailureCount() { return _detectionFailures; }

  window.LipSync = {
    loadFaceLandmarker,
    detectFacesInClip,
    matchFaceToSpeaker,
    buildOverlayInstructions,
    sampleAudioAmplitude,
    composeMouthSprite,
    spriteFromDataUrl,
    getFailureCount,
  };

})();
