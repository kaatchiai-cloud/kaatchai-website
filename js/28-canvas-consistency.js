// ══════════════════════════════════════════
//  CANVAS CONSISTENCY — sibling refs + style fingerprint
//  Hybrid Option 1 + Option 3 (canvas-graph-plan §9)
//
//  When user regenerates an image instance in the canvas:
//    1. pick up to 3 sibling reference images from already-done instances
//       (same section + adjacent + random) to keep the new image visually
//       consistent with the rest of the job
//    2. inject a job-level styleFingerprint text descriptor
//    3. delegate to existing generateImageGeminiFlash with refParts
// ══════════════════════════════════════════

(function () {

const SIBLING_BUDGET = 3;     // total sibling images injected
const MAX_TOTAL_PARTS = 4;    // siblings + character refs

// Strip data: prefix → { mimeType, data }
function decodeDataUrl(dataUrl) {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

// Pick up to N sibling images using the "1 same / 1 adjacent / 1 random" rule.
// Returns array of { id, scenIdx, imgDataUrl }.
function pickSiblingRefs(scenes, currentSceneIdx, currentImgId) {
  if (!Array.isArray(scenes)) return [];
  const allDone = [];
  scenes.forEach((s, idx) => {
    const sb = (s.storyboardInstances || []).find(x => x.isActive);
    if (!sb) return;
    sb.imageInstances.forEach(img => {
      if (img.id === currentImgId) return;
      if (img.status === 'done' && img.imgDataUrl) {
        allDone.push({ id: img.id, sceneIdx: idx, imgDataUrl: img.imgDataUrl });
      }
    });
  });
  if (allDone.length === 0) return [];

  const picked = [];
  const usedIds = new Set();

  // 1) same section
  const sameSection = allDone.filter(r => r.sceneIdx === currentSceneIdx);
  if (sameSection.length > 0) {
    const r = sameSection[0];
    picked.push(r); usedIds.add(r.id);
  }

  // 2) adjacent section (i ± 1, prefer earlier)
  if (picked.length < SIBLING_BUDGET) {
    const adjacent = allDone.filter(r =>
      !usedIds.has(r.id) && Math.abs(r.sceneIdx - currentSceneIdx) === 1
    );
    if (adjacent.length > 0) {
      adjacent.sort((a, b) => a.sceneIdx - b.sceneIdx);
      const r = adjacent[0];
      picked.push(r); usedIds.add(r.id);
    }
  }

  // 3) random remaining
  while (picked.length < SIBLING_BUDGET) {
    const remaining = allDone.filter(r => !usedIds.has(r.id));
    if (remaining.length === 0) break;
    const r = remaining[Math.floor(Math.random() * remaining.length)];
    picked.push(r); usedIds.add(r.id);
  }

  return picked;
}

// Build refParts payload (siblings + character refs, capped at MAX_TOTAL_PARTS)
function buildRefParts(siblings, characterRefDataUrls) {
  const parts = [];
  for (const s of siblings) {
    if (parts.length >= MAX_TOTAL_PARTS) break;
    const dec = decodeDataUrl(s.imgDataUrl);
    if (dec) parts.push({ inlineData: dec });
  }
  for (const ref of (characterRefDataUrls || [])) {
    if (parts.length >= MAX_TOTAL_PARTS) break;
    const dec = decodeDataUrl(ref);
    if (dec) parts.push({ inlineData: dec });
  }
  return parts;
}

// Generate the job-level style fingerprint from a few done images.
// Run once per job, lazily on first regeneration. Caller is responsible for
// caching on `job.styleFingerprint` and skipping subsequent calls.
async function generateStyleFingerprint(scenes, geminiKey) {
  if (!geminiKey) return null;
  const samples = [];
  for (const s of (scenes || [])) {
    const sb = (s.storyboardInstances || []).find(x => x.isActive);
    if (!sb) continue;
    for (const img of sb.imageInstances) {
      if (img.status === 'done' && img.imgDataUrl) {
        const dec = decodeDataUrl(img.imgDataUrl);
        if (dec) samples.push({ inlineData: dec });
        if (samples.length >= 4) break;
      }
    }
    if (samples.length >= 4) break;
  }
  if (samples.length === 0) return null;

  const parts = [
    ...samples,
    { text: 'Describe the visual style of these images in roughly 200 words. Cover: color palette (with a few hex codes), line weight, rendering technique, character appearance, lighting, mood. Be specific so another artist could replicate the style. Do not describe the scenes themselves — only the style.' },
  ];
  const body = JSON.stringify({ contents: [{ parts }] });

  try {
    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey }, body }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const txt = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
    return (txt || '').trim() || null;
  } catch (e) {
    console.warn('Style fingerprint generation failed:', e?.message);
    return null;
  }
}

// ─── Face swap — post-process for photorealistic/cinematic scenes ─────────────
//
// After Gemini generates a scene image, if the project is photorealistic or
// cinematic, swap each locked character's AI-generated portrait onto the
// corresponding face in the scene image via Replicate codeplugtech/face-swap.
// MediaPipe IMAGE mode detects faces; faces are matched left-to-right to
// scene.refCharacters order. Each face is cropped, swapped, pasted back.
//
// Replicate API key stored at localStorage key 'stori_replicate_api_key'.

const REPLICATE_FACE_SWAP_VERSION = '278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34';

function _getReplicateKey() {
  return (typeof localStorage !== 'undefined' ? localStorage.getItem('stori_replicate_api_key') : '') || '';
}

function _loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

async function _resizeDataUrl(dataUrl, maxSide) {
  const img = await _loadImageFromDataUrl(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.85);
}

async function _replicateFaceSwap(inputImageDataUrl, swapImageDataUrl, replicateKey) {
  const resp = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Token ${replicateKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: REPLICATE_FACE_SWAP_VERSION,
      input: { input_image: inputImageDataUrl, swap_image: swapImageDataUrl },
    }),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`Replicate submit failed (${resp.status}): ${err.slice(0, 200)}`);
  }
  const prediction = await resp.json();
  const pollUrl = prediction.urls && prediction.urls.get;
  if (!pollUrl) throw new Error('Replicate: no poll URL');
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const pr = await fetch(pollUrl, { headers: { 'Authorization': `Token ${replicateKey}` } });
    if (!pr.ok) throw new Error(`Replicate poll failed: ${pr.status}`);
    const data = await pr.json();
    if (data.status === 'succeeded') {
      if (!data.output) throw new Error('Replicate: no output URL');
      const imgResp = await fetch(data.output);
      if (!imgResp.ok) throw new Error(`Replicate result fetch failed: ${imgResp.status}`);
      const blob = await imgResp.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Replicate prediction ${data.status}: ${data.error || ''}`);
    }
  }
  throw new Error('Replicate face swap timed out (>120s)');
}

// Apply face swap to a generated scene image. Returns updated data URL, or
// original data URL unchanged if conditions aren't met (no key, no faces, etc).
async function applyFaceSwapToSceneImage(sceneDataUrl, scene) {
  if (typeof _isPhotorealisticMode !== 'function' || !_isPhotorealisticMode()) return sceneDataUrl;
  const replicateKey = _getReplicateKey();
  if (!replicateKey) return sceneDataUrl;
  if (!window.LipSync || typeof window.LipSync.detectFacesInImage !== 'function') return sceneDataUrl;

  const cs = window.createJobState || {};
  const allChars = cs.characters || [];
  const sceneCharIds = scene && scene.refCharacters || [];
  const sceneChars = sceneCharIds
    .map(id => allChars.find(c => c.id === id))
    .filter(c => c && c.locked && c.representativeImageDataUrl)
    .filter(c => {
      // Skip face swap for characters that have a ready LoRA assigned
      const libCharId = cs.loraAssignments?.characters?.[c.id];
      if (!libCharId) return true;
      const lc = window.LoraLibrary?.getCharacterById?.(libCharId);
      return !(lc?.loraStatus === 'ready');
    });
  if (!sceneChars.length) return sceneDataUrl;

  let faces;
  try {
    faces = await window.LipSync.detectFacesInImage(sceneDataUrl);
  } catch (e) {
    console.warn('[FaceSwap] face detection failed:', e.message);
    return sceneDataUrl;
  }
  if (!faces.length) return sceneDataUrl;

  const img = await _loadImageFromDataUrl(sceneDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const pairCount = Math.min(faces.length, sceneChars.length);
  for (let i = 0; i < pairCount; i++) {
    const face = faces[i];
    const char = sceneChars[i];
    if (!face.faceBbox) continue;

    // Crop face region with 50% padding on each side
    const { x, y, w, h } = face.faceBbox;
    const pad = 0.5;
    const bx = Math.max(0, x - w * pad);
    const by = Math.max(0, y - h * pad);
    const bw = Math.min(canvas.width  - bx, w * (1 + 2 * pad));
    const bh = Math.min(canvas.height - by, h * (1 + 2 * pad));

    const crop = document.createElement('canvas');
    crop.width = Math.round(bw); crop.height = Math.round(bh);
    crop.getContext('2d').drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh);
    const cropDataUrl = crop.toDataURL('image/jpeg', 0.9);

    // Resize portrait to max 512px to stay under Replicate's 256KB base64 limit
    let portraitDataUrl;
    try {
      portraitDataUrl = await _resizeDataUrl(char.representativeImageDataUrl, 512);
    } catch (e) {
      console.warn('[FaceSwap] portrait resize failed:', e.message);
      continue;
    }

    let swappedDataUrl;
    try {
      swappedDataUrl = await _replicateFaceSwap(cropDataUrl, portraitDataUrl, replicateKey);
    } catch (e) {
      console.warn(`[FaceSwap] swap failed for "${char.name}":`, e.message);
      continue;
    }

    // Paste swapped crop back at exact original position — background pixels
    // in the crop are unchanged so edges are seamless
    try {
      const swappedImg = await _loadImageFromDataUrl(swappedDataUrl);
      ctx.drawImage(swappedImg, Math.round(bx), Math.round(by), Math.round(bw), Math.round(bh));
    } catch (e) {
      console.warn('[FaceSwap] paste-back failed:', e.message);
    }
  }

  return canvas.toDataURL('image/jpeg', 0.95);
}

// Regenerate one image instance with sibling-ref injection + style fingerprint.
// Mutates the imageInstance in place: status, imgDataUrl, generationContext, error.
//
// opts:
//   scenes              required (full createScenes array)
//   sceneIdx            required (index of scene this image lives in)
//   imageInstance       required (the instance to regenerate)
//   geminiKey           required
//   width, height       required (image size)
//   stylePrompt         job-level style preset prompt text
//   styleFingerprint    optional pre-computed fingerprint (else uses stylePrompt)
//   characterRefs       optional array of data URLs for character/env refs
//   modelOverride       optional model name
//
// Returns { ok, dataUrl, error, siblingRefIds, modelUsed }.
async function regenerateImageInstance(opts) {
  const {
    scenes, sceneIdx, imageInstance, geminiKey,
    width, height, stylePrompt, styleFingerprint, characterRefs, modelOverride,
  } = opts;

  if (!imageInstance) return { ok: false, error: 'No image instance' };
  if (typeof generateImageGeminiFlash !== 'function') {
    return { ok: false, error: 'generateImageGeminiFlash not available' };
  }

  imageInstance.status = 'generating';
  imageInstance.error = null;

  const siblings = pickSiblingRefs(scenes, sceneIdx, imageInstance.id);
  const refParts = buildRefParts(siblings, characterRefs);

  const sb = (scenes[sceneIdx]?.storyboardInstances || []).find(x => x.isActive);
  // Per-variant prompt override wins over the SB master prompt.
  const sbPrompt = sb?.prompt || scenes[sceneIdx]?.prompt || '';
  const scenePrompt = (imageInstance.promptOverride && imageInstance.promptOverride.trim())
    ? imageInstance.promptOverride.trim()
    : sbPrompt;
  const styleGuide = (imageInstance.styleOverridden && imageInstance.style)
    ? imageInstance.style
    : (styleFingerprint || stylePrompt || '');

  const noTextSuffix = ' Do NOT include any text, words, letters, captions, or writing in any language in the image.';

  const composedPrompt = refParts.length > 0
    ? `Generate a new image that EXACTLY matches the visual style, color palette, line weight, character appearance, lighting, and mood of the reference images above. The new image must look like it belongs in the same series.

STYLE GUIDE: ${styleGuide}

SCENE: ${scenePrompt}${noTextSuffix}`
    : `${scenePrompt}

STYLE GUIDE: ${styleGuide}${noTextSuffix}`;

  try {
    // LoRA routing: use _getSceneLoraContext if available, else fall back to Gemini
    let dataUrl;
    if (typeof _getSceneLoraContext === 'function' && window.LoraLibrary) {
      const { loras: _sceneLoras, hasLora: _hasLora } = _getSceneLoraContext(scenes[sceneIdx]);
      if (_hasLora) {
        const falKey = window.LoraLibrary.getFalKey();
        const triggerWords = _sceneLoras.map(l => l.triggerWord).filter(Boolean).join(' ');
        const _loraPrompt = triggerWords ? `${triggerWords} ${composedPrompt}` : composedPrompt;
        dataUrl = await generateImageFalFluxLora(_loraPrompt, _sceneLoras, falKey, { width, height });
      }
    }
    if (!dataUrl) {
      dataUrl = await generateImageGeminiFlash(composedPrompt, geminiKey, { width, height, refParts }, modelOverride);
    }
    // Face swap post-process for photorealistic/cinematic scenes
    let finalDataUrl = dataUrl;
    try {
      finalDataUrl = await applyFaceSwapToSceneImage(dataUrl, scenes[sceneIdx]);
    } catch (e) {
      console.warn('[FaceSwap] post-process failed, using original image:', e.message);
    }

    imageInstance.imgDataUrl = finalDataUrl;
    imageInstance.status = 'done';
    imageInstance.error = null;
    imageInstance.generationContext = {
      siblingRefIds: siblings.map(s => s.id),
      styleFingerprint: styleFingerprint || null,
      modelUsed: modelOverride || (typeof geminiImageModel !== 'undefined' && geminiImageModel) || 'gemini-2.5-flash-image',
    };
    return {
      ok: true,
      dataUrl: finalDataUrl,
      siblingRefIds: imageInstance.generationContext.siblingRefIds,
      modelUsed: imageInstance.generationContext.modelUsed,
    };
  } catch (e) {
    imageInstance.status = 'error';
    imageInstance.error = e?.message || 'Image generation failed';
    return { ok: false, error: imageInstance.error };
  }
}

window.CanvasConsistency = {
  pickSiblingRefs,
  buildRefParts,
  generateStyleFingerprint,
  regenerateImageInstance,
  applyFaceSwapToSceneImage,
  SIBLING_BUDGET,
  MAX_TOTAL_PARTS,
};

})();
