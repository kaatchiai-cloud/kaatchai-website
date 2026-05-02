// ── Kling AI Video Generation ──
// Provider: Official Kling (kling-v2-5-turbo) via Vercel proxy at /api/kling
// Duration: scene.duration <= 5 → 5s clip | 5 < duration <= 12 → 10s clip | > 12 → multi-clip continuation

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
async function submitKlingI2V(base64DataUrl, prompt, duration) {
  const rawB64 = base64DataUrl.includes(',') ? base64DataUrl.split(',')[1] : base64DataUrl;
  const jwt = await generateKlingJWT();
  const resp = await fetch(`${KLING_BASE}/videos/image2video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
    body: JSON.stringify({
      model_name: 'kling-v2-5-turbo',
      image: rawB64,
      prompt: prompt.slice(0, 2500),
      duration: String(duration),
      mode: 'pro'
    })
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

// Ask Gemini to write a continuation prompt from the last frame; falls back to a generic prompt
async function generateContinuationPrompt(frameDataUrl, originalPrompt, geminiKey) {
  const FALLBACK = 'Continue the motion naturally from this frame. Smooth cinematic movement, high quality, maintain style and composition.';
  if (!geminiKey) return FALLBACK;
  try {
    const rawB64 = frameDataUrl.includes(',') ? frameDataUrl.split(',')[1] : frameDataUrl;
    const body = {
      contents: [{ parts: [
        { inline_data: { mime_type: 'image/jpeg', data: rawB64 } },
        { text: `This is the last frame of a video clip. Original scene description: "${originalPrompt.slice(0, 300)}"\n\nWrite a short continuation prompt (1–2 sentences) for the next video clip that continues naturally from this exact frame. Continue the motion already happening — do NOT restart the scene.` }
      ]}],
      generationConfig: { maxOutputTokens: 120 }
    };
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!resp.ok) return FALLBACK;
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return (text && text.length > 10) ? text + ' Smooth cinematic motion, high quality.' : FALLBACK;
  } catch (_) {
    return FALLBACK;
  }
}

// Build a plan of Kling clip durations (5 or 10) to cover a scene's full duration
function buildClipPlan(duration) {
  if (duration <= 5) return [5];
  if (duration <= 12) return [10];
  const clips = [];
  let rem = duration;
  while (rem > 12) { clips.push(10); rem -= 10; }
  clips.push(rem <= 5 ? 5 : 10);
  return clips;
}

// Animate a single scene: submit first clip, poll to completion, then generate continuation clips if needed
// Returns after scene.videoClips and scene.videoUrl are set (or scene.videoError on failure)
async function _animateSingleScene(scene, sceneIdx, totalScenes, onProgress, geminiKey) {
  const clipPlan = buildClipPlan(scene.duration || 5);
  // Prefer the per-instance motionPrompt when supplied (canvas variant tune);
  // fall back to scene.prompt + cinematic suffix for the legacy code path.
  const motionPrompt = (scene.motionPrompt && scene.motionPrompt.trim())
    ? scene.motionPrompt.trim()
    : ((scene.prompt || 'A cinematic scene') + ' Smooth cinematic motion, high quality, consistent style.');

  onProgress?.(null, totalScenes, `Submitting scene ${sceneIdx + 1}…`);

  let firstTaskId;
  try {
    firstTaskId = await submitKlingI2V(scene.imgDataUrl, motionPrompt, clipPlan[0]);
  } catch (err) {
    console.error(`[Kling] Scene ${sceneIdx + 1} submit failed:`, err.message);
    scene.videoError = err.message;
    return;
  }

  scene.videoClips = [];

  try {
    const cdnUrl = await pollKlingTask(firstTaskId);
    const localUrl = await fetchClipAsUrl(cdnUrl);
    scene.videoClips.push({ url: localUrl, clipDuration: clipPlan[0] });
  } catch (err) {
    console.error(`[Kling] Scene ${sceneIdx + 1} poll failed:`, err.message);
    scene.videoError = err.message;
    return;
  }

  // Continuation clips for scenes longer than one Kling clip
  for (let c = 1; c < clipPlan.length; c++) {
    const prevClip = scene.videoClips[c - 1];
    try {
      onProgress?.(null, totalScenes, `Scene ${sceneIdx + 1}: continuation clip ${c + 1}/${clipPlan.length}…`);
      const lastFrameDataUrl = await extractLastFrame(prevClip.url);
      const contPrompt = await generateContinuationPrompt(lastFrameDataUrl, scene.prompt || 'A cinematic scene', geminiKey);
      const contTaskId = await submitKlingI2V(lastFrameDataUrl, contPrompt, clipPlan[c]);
      const cdnUrl = await pollKlingTask(contTaskId);
      const localUrl = await fetchClipAsUrl(cdnUrl);
      scene.videoClips.push({ url: localUrl, clipDuration: clipPlan[c] });
    } catch (err) {
      console.error(`[Kling] Scene ${sceneIdx + 1} continuation clip ${c + 1} failed:`, err.message);
      break;
    }
  }

  // Set videoUrl to first clip for backward compatibility
  scene.videoUrl = scene.videoClips[0]?.url || null;
}

// Shared orchestrator — animates scenes that have images
// scenes: array of scene objects with { imgDataUrl, prompt, duration }
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
