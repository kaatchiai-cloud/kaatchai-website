// ── Kling AI Video Generation ──
// Provider: Official Kling (kling-v2-5-turbo) via Vercel proxy at /api/kling
// Duration: scene.durationSec <= 5 → 5s clip | 5 < durationSec <= 12 → 10s clip | > 12 → multi-clip continuation

// On localhost: use the local kling-proxy.js running on port 3004
// On Vercel/production: use /api/kling serverless function
const KLING_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3004/kling'
  : '/api/kling';

// Generate JWT for Official Kling API (HMAC-SHA256 via Web Crypto)
async function generateKlingJWT() {
  const ak = localStorage.getItem('stori_kling_access_key');
  const sk = localStorage.getItem('stori_kling_secret_key');
  if (!ak || !sk) throw new Error('No Kling access/secret keys. Enter them in the Animated Video step.');

  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ak, exp: now + 1800, nbf: now - 5, iat: now };

  const b64url = obj => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const headerB64 = b64url(header);
  const payloadB64 = b64url(payload);
  const signingInput = headerB64 + '.' + payloadB64;

  const keyData = new TextEncoder().encode(sk);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return signingInput + '.' + sigB64;
}

// Submit Kling i2v task — no retry (retry creates duplicate billable tasks on 429)
async function submitKlingI2V(base64DataUrl, prompt, duration, negativePrompt, tailBase64DataUrl) {
  const rawB64 = base64DataUrl.includes(',') ? base64DataUrl.split(',')[1] : base64DataUrl;
  const jwt = await generateKlingJWT();
  const body = {
    model_name: 'kling-v2-5-turbo',
    image: rawB64,
    prompt: prompt.slice(0, 2500),
    duration: String(duration),
    mode: 'pro'
  };
  if (negativePrompt && negativePrompt.trim()) body.negative_prompt = negativePrompt.trim().slice(0, 2500);
  if (tailBase64DataUrl) {
    const rawTail = tailBase64DataUrl.includes(',') ? tailBase64DataUrl.split(',')[1] : tailBase64DataUrl;
    body.image_tail = rawTail;
  }
  const resp = await fetch(`${KLING_BASE}/videos/image2video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `Kling API error ${resp.status}`);
  }
  const data = await resp.json();
  if (data.code !== 0) throw new Error(data.message || `Kling error code ${data.code}`);
  return data.data?.task_id;
}

// Poll a Kling task until complete — max 5 min, poll every 5s, handles 429 with 30s backoff
// Returns the raw CDN video URL
async function pollKlingTask(taskId) {
  const maxWait = 5 * 60 * 1000;
  const interval = 5000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, interval));

    const jwt = await generateKlingJWT();
    const resp = await fetch(`${KLING_BASE}/videos/image2video/${taskId}`, {
      headers: { 'Authorization': `Bearer ${jwt}` }
    });
    if (resp.status === 429 || resp.status === 503) {
      console.warn(`[Kling] Poll rate-limited (${resp.status}), waiting 30s…`);
      await new Promise(r => setTimeout(r, 30000));
      continue;
    }
    const data = await resp.json();
    if (data.code !== 0) throw new Error(data.message || `Kling poll error ${data.code}`);
    const task = data.data || {};

    if (task.task_status === 'succeed') {
      const videoUrl = task.task_result?.videos?.[0]?.url;
      if (videoUrl) return videoUrl;
    } else if (task.task_status === 'failed') {
      throw new Error('Kling failed: ' + (task.task_status_msg || 'Unknown error'));
    }
  }

  throw new Error('Kling generation timed out (5 min)');
}

// Download CDN video URL as blob object URL for local playback; falls back to direct URL on CORS error
async function fetchClipAsUrl(cdnUrl) {
  try {
    const videoResp = await fetch(cdnUrl);
    if (!videoResp.ok) throw new Error(`CDN ${videoResp.status}`);
    const blob = await videoResp.blob();
    return URL.createObjectURL(blob);
  } catch (_) {
    return cdnUrl;
  }
}

// Extract the last frame of a video clip as a JPEG base64 data URL
async function extractLastFrame(videoUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    const timeout = setTimeout(() => reject(new Error('Frame extraction timed out')), 15000);

    video.onloadedmetadata = () => {
      const seekTo = Math.max(0, video.duration - 0.5);
      video.onseeked = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          video.src = '';
          resolve(canvas.toDataURL('image/jpeg', 0.92));
        } catch (e) { reject(e); }
      };
      video.currentTime = seekTo;
    };
    video.onerror = () => { clearTimeout(timeout); reject(new Error('Cannot load clip for frame extraction')); };
    video.src = videoUrl;
    video.load();
  });
}

// Animate a single scene using planSegments-driven clip plan + generateSplitPrompt for continuations.
// Returns after scene.videoClips and scene.videoUrl are set (or scene.videoError on failure).
async function _animateSingleScene(scene, sceneIdx, totalScenes, onProgress, geminiKey) {
  const provider = window.videoProvider || KLING_PROVIDER;

  // Use pre-computed pass-1 segmentPlan when available; otherwise compute on-the-fly.
  let segPlan = Array.isArray(scene.segmentPlan) && scene.segmentPlan.length > 0
    ? scene.segmentPlan
    : planSegments({ audioMs: null, provider, scene, pass: 'estimate' }).segments;
  if (!segPlan[0] || typeof segPlan[0].durationSec !== 'number') {
    scene.videoError = 'Invalid segment plan';
    scene.videoClips = null;
    scene.videoUrl = null;
    return;
  }

  let motionPrompt = (scene.motionPrompt && scene.motionPrompt.trim())
    ? scene.motionPrompt.trim()
    : ((scene.prompt || 'A cinematic scene') + ' Smooth cinematic motion, high quality, consistent style.');
  if (typeof window.castBuildFramingMotionPrompt === 'function') {
    const framingSuffix = window.castBuildFramingMotionPrompt(scene);
    if (framingSuffix) motionPrompt = motionPrompt + ' ' + framingSuffix;
  }

  onProgress?.(null, totalScenes, `Submitting scene ${sceneIdx + 1}…`);

  let firstTaskId;
  try {
    firstTaskId = await submitKlingI2V(scene.imgDataUrl, motionPrompt, segPlan[0].durationSec, scene.negativePrompt);
  } catch (err) {
    console.error(`[Kling] Scene ${sceneIdx + 1} submit failed:`, err.message);
    scene.videoError = err.message;
    scene.videoClips = null;
    scene.videoUrl = null;
    return;
  }

  scene.videoClips = [];

  try {
    const cdnUrl = await pollKlingTask(firstTaskId);
    const localUrl = await fetchClipAsUrl(cdnUrl);
    scene.videoClips.push({ url: localUrl, clipDuration: segPlan[0].durationSec });
  } catch (err) {
    console.error(`[Kling] Scene ${sceneIdx + 1} poll failed:`, err.message);
    scene.videoError = err.message;
    scene.videoUrl = null;
    return;
  }

  // Continuation clips via split-prompt (gemini-2.5-flash)
  for (let c = 1; c < segPlan.length; c++) {
    const prevClip = scene.videoClips[c - 1];
    try {
      onProgress?.(null, totalScenes, `Scene ${sceneIdx + 1}: continuation clip ${c + 1}/${segPlan.length}…`);
      const lastFrameDataUrl = await extractLastFrame(prevClip.url);
      const contPrompt = await generateSplitPrompt(lastFrameDataUrl, scene, geminiKey);
      const contTaskId = await submitKlingI2V(lastFrameDataUrl, contPrompt, segPlan[c].durationSec);
      const cdnUrl = await pollKlingTask(contTaskId);
      const localUrl = await fetchClipAsUrl(cdnUrl);
      scene.videoClips.push({ url: localUrl, clipDuration: segPlan[c].durationSec });
    } catch (err) {
      console.error(`[Kling] Scene ${sceneIdx + 1} continuation clip ${c + 1} failed:`, err.message);
      break;
    }
  }

  scene.videoUrl = scene.videoClips[0]?.url || null;
}

// Shared orchestrator — animates scenes that have images
// scenes: array of scene objects with { imgDataUrl, prompt, durationSec }
// onProgress(done, total, label) — called after each scene completes
// geminiKey: Gemini API key for continuation prompt generation (optional)
// Concurrency: up to 5 scenes processed simultaneously; as each finishes the next starts
async function animateScenes(scenes, onProgress, geminiKey) {
  const total = scenes.length;
  let done = 0;
  const CONCURRENCY = 5;

  onProgress?.(done, total, `Animating ${total} scenes… (1–3 min)`);

  let nextIdx = 0;

  async function worker() {
    while (nextIdx < scenes.length) {
      const i = nextIdx++;
      await _animateSingleScene(scenes[i], i, total, onProgress, geminiKey);
      done++;
      onProgress?.(done, total, `${done}/${total} clips done`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scenes.length) }, worker));
}

// ── Phase 1: Provider abstraction ──
// Uniform interface wrapping Kling submit/poll. Tier-selection is NOT here —
// it lives in planSegments (Phase 8). This config describes capabilities only.
const KLING_PROVIDER = {
  id:            'kling-v2-5-turbo',
  durationTiers: [5, 10],
  minClipSec:    5,
  maxClipSec:    10,
  continuation: {
    supported:   true,
    mode:        'last-frame-i2v',
    overlapSec:  0,
  },
  lipSyncCompatibility: {
    tier1MediaPipe: true,
    tier2Provider:  'kling-fal',
  },
  pricing: {
    tier:              { 5: 0.20, 10: 0.40 },
    continuationDelta: 0,
  },
  capabilities: {
    handlesComplexMotion:         'fair',
    handlesFaceContinuity:        'good',
    handlesEnvironmentContinuity: 'fair',
  },

  // provider.submit(imgDataUrl, prompt, durationSec, opts) → { taskId }
  async submit(imgDataUrl, prompt, durationSec, opts = {}) {
    const taskId = await submitKlingI2V(imgDataUrl, prompt, durationSec, opts.negativePrompt);
    return { taskId };
  },

  // provider.pollTask(taskId) → { status: 'completed' | 'failed', videoUrl }
  async pollTask(taskId) {
    const videoUrl = await pollKlingTask(taskId);
    return { status: 'completed', videoUrl };
  },
};

window.videoProvider = KLING_PROVIDER;

// ── Phase 8: Segment planner ──────────────────────────────────────────────────

// Pure function: given audio length + provider caps, produce a segment plan.
// Returns { segments, audioRegions, totalGenSec, croppedTailSec, expectedCost, fallbackPlan }.
// Caller writes segments/totals back onto scene after call.
function planSegments({ audioMs, provider, scene, pass }) {
  const SPLIT_THRESHOLD = 7.0;          // seconds — below this, don't split
  const tiers = [...(provider.durationTiers || [5, 10])].sort((a, b) => a - b);

  function pickSmallestAbove(sec) {
    return tiers.find(t => t >= sec) || tiers[tiers.length - 1];
  }

  const sourceMs = (audioMs != null) ? audioMs : ((scene.durationSec || 5) * 1000);
  if (sourceMs <= 0) {
    const _P = { 5: 0.20, 10: 0.40 };
    return { segments: [{ idx: 0, durationSec: tiers[0], role: 'main' }], audioRegions: null, totalGenSec: tiers[0], croppedTailSec: 0, expectedCost: _P[tiers[0]] || 0, fallbackPlan: null };
  }
  let remainingMs = sourceMs;
  const segments = [];
  let isFirst = true;

  while (remainingMs > 0) {
    let tier;
    if (isFirst) {
      const fits = pickSmallestAbove(remainingMs / 1000);
      tier = (remainingMs / 1000 > SPLIT_THRESHOLD && fits > tiers[0]) ? tiers[0] : fits;
    } else {
      tier = tiers[0];
    }
    segments.push({ idx: segments.length, durationSec: tier, role: isFirst ? 'main' : 'continuation' });
    remainingMs -= tier * 1000;
    isFirst = false;
  }

  const totalGenSec = segments.reduce((s, x) => s + x.durationSec, 0);
  const croppedTailSec = Math.max(0, totalGenSec - sourceMs / 1000);
  const PRICE = { 5: 0.20, 10: 0.40 };
  const expectedCost = segments.reduce((s, x) => s + (PRICE[x.durationSec] || 0), 0);

  return { segments, audioRegions: null, totalGenSec, croppedTailSec, expectedCost, fallbackPlan: null };
}
window.planSegments = planSegments;

// Normalize Mode-A project-level line timings to scene-local.
// Only Mode A (Scribe diarization) reaches this; TTS paths write scene-local directly.
function finalizeSceneTimings(scene) {
  const linesWithSrc = (scene.dialogueLines || []).filter(l => l.audioSegmentStartMs != null && l.audioSegmentEndMs != null);
  if (linesWithSrc.length === 0) return;
  const sceneAbsStartMs = Math.min(...linesWithSrc.map(l => l.audioSegmentStartMs));
  for (const line of linesWithSrc) {
    line.withinSceneStartMs = line.audioSegmentStartMs - sceneAbsStartMs;
    line.withinSceneEndMs   = line.audioSegmentEndMs   - sceneAbsStartMs;
  }
}
window.finalizeSceneTimings = finalizeSceneTimings;

// Gemini split-prompt for continuation clips; uses gemini-2.5-flash.
// lastFrameDataUrl: JPEG base64 data URL of the last frame from prev clip.
// scene: full scene object for context (motionPrompt, framing, visualSubjectIds).
async function generateSplitPrompt(lastFrameDataUrl, scene, geminiKey) {
  const _ms = (typeof window.getMergedStyle === 'function') ? window.getMergedStyle(null) : null;
  const _motionCtx = (_ms && _ms.motionGrammar) ? ` Maintain motion grammar: ${_ms.motionGrammar}.` : '';
  const FALLBACK = `Continue the motion naturally from this frame. Smooth cinematic movement, high quality, maintain style and composition.${_motionCtx}`;
  if (!geminiKey) return FALLBACK;
  try {
    const rawB64 = lastFrameDataUrl.includes(',') ? lastFrameDataUrl.split(',')[1] : lastFrameDataUrl;
    const sceneDesc = (scene.motionPrompt || scene.prompt || 'A cinematic scene').slice(0, 300);
    const framingHint = scene.framing ? ` Camera framing: ${scene.framing}.` : '';
    const motionHint = _ms && _ms.motionGrammar ? `\nProject motion grammar: ${_ms.motionGrammar}` : '';
    const body = {
      contents: [{ parts: [
        { inline_data: { mime_type: 'image/jpeg', data: rawB64 } },
        { text: `This is the last frame of a video clip. Scene: "${sceneDesc}"${framingHint}${motionHint}\n\nWrite a 1–2 sentence continuation prompt for the next clip. Continue the exact motion in progress — do NOT restart the scene.` }
      ]}],
      generationConfig: { maxOutputTokens: 120 }
    };
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!resp.ok) return FALLBACK;
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return (text && text.length > 10) ? text + ` Smooth cinematic motion, high quality.${_motionCtx}` : FALLBACK;
  } catch (_) {
    return FALLBACK;
  }
}
