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
    const dataUrl = await generateImageGeminiFlash(
      composedPrompt,
      geminiKey,
      { width, height, refParts },
      modelOverride
    );
    imageInstance.imgDataUrl = dataUrl;
    imageInstance.status = 'done';
    imageInstance.error = null;
    imageInstance.generationContext = {
      siblingRefIds: siblings.map(s => s.id),
      styleFingerprint: styleFingerprint || null,
      modelUsed: modelOverride || (typeof geminiImageModel !== 'undefined' && geminiImageModel) || 'gemini-2.5-flash-image',
    };
    return {
      ok: true,
      dataUrl,
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
  SIBLING_BUDGET,
  MAX_TOTAL_PARTS,
};

})();
