// js/25-photopilot-fx.js — Photopilot effects engine
// Pure math/canvas functions only — no DOM access outside canvas ops,
// no fetch, no API calls, no global state except defined constants.

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpRect(r0, r1, t) {
  return { x: lerp(r0.x, r1.x, t), y: lerp(r0.y, r1.y, t), w: lerp(r0.w, r1.w, t), h: lerp(r0.h, r1.h, t) };
}
function applyEasing(t, type) {
  switch (type) {
    case 'linear':         return t;
    case 'easeOutQuad':    return 1 - (1 - t) * (1 - t);
    case 'easeInOutCubic': return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
    default:               return 1 - (1 - t) * (1 - t);
  }
}
function parseAspect(aspect) {
  const parts = aspect.split(':');
  return parseFloat(parts[0]) / parseFloat(parts[1]);
}
function pickAlt(arr, seed) { return arr[seed % arr.length]; }

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — COLOR_PRESETS
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_PRESETS = {
  'none':      '',
  'cinematic': 'contrast(1.1) saturate(0.85) brightness(0.96)',
  'warm':      'sepia(0.25) saturate(1.2) brightness(1.05) hue-rotate(-5deg)',
  'cool':      'saturate(0.9) brightness(1.02) hue-rotate(10deg)',
  'moody':     'contrast(1.2) saturate(0.7) brightness(0.88)',
  'vibrant':   'saturate(1.5) contrast(1.05) brightness(1.02)',
  'faded':     'saturate(0.6) contrast(0.9) brightness(1.08)',
  'bw':        'grayscale(1) contrast(1.05)',
  'golden':    'sepia(0.4) saturate(1.3) brightness(1.05) hue-rotate(-8deg)',
  'matte':     'contrast(0.9) saturate(0.8) brightness(1.06)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — MOOD_PRESETS
// ─────────────────────────────────────────────────────────────────────────────

const MOOD_PRESETS = {
  cinematic: {
    kenBurnsIntensity: 0.3, kenBurnsEasing: 'easeOutQuad',
    transition: 'fade', transitionDuration: 0.5,
    colorPreset: 'cinematic', vignette: 0.4, vignettePulse: false,
    filmGrain: 0.2, shake: 0, zoomPunch: 0,
    spotlight: false, particles: 'none', frameStyle: 'none'
  },
  clean: {
    kenBurnsIntensity: 0.2, kenBurnsEasing: 'easeOutQuad',
    transition: 'whiteCrossfade', transitionDuration: 0.4,
    colorPreset: 'none', vignette: 0.1, vignettePulse: false,
    filmGrain: 0, shake: 0, zoomPunch: 0,
    spotlight: false, particles: 'none', frameStyle: 'none'
  },
  romantic: {
    kenBurnsIntensity: 0.25, kenBurnsEasing: 'easeOutQuad',
    transition: 'lightLeak', transitionDuration: 0.6,
    colorPreset: 'warm', vignette: 0.35, vignettePulse: false,
    filmGrain: 0.1, shake: 0, zoomPunch: 0,
    spotlight: false, particles: 'none', frameStyle: 'none'  // particles are NEVER auto-enabled
  },
  dramatic: {
    kenBurnsIntensity: 0.4, kenBurnsEasing: 'easeInOutCubic',
    transition: 'fade', transitionDuration: 0.3,
    colorPreset: 'moody', vignette: 0.5, vignettePulse: true,
    filmGrain: 0.3, shake: 0.15, zoomPunch: 0.4,
    spotlight: false, particles: 'none', frameStyle: 'none'
  },
  vintage: {
    kenBurnsIntensity: 0.2, kenBurnsEasing: 'linear',
    transition: 'fade', transitionDuration: 0.5,
    colorPreset: 'faded', vignette: 0.5, vignettePulse: false,
    filmGrain: 0.45, shake: 0, zoomPunch: 0,
    spotlight: false, particles: 'none', frameStyle: 'polaroid'
  },
  product: {
    kenBurnsIntensity: 0.18, kenBurnsEasing: 'easeOutQuad',
    transition: 'whiteCrossfade', transitionDuration: 0.35,
    colorPreset: 'none', vignette: 0, vignettePulse: false,
    filmGrain: 0, shake: 0, zoomPunch: 0,
    spotlight: true, particles: 'none', frameStyle: 'none'
  },
  travel: {
    kenBurnsIntensity: 0.35, kenBurnsEasing: 'easeOutQuad',
    transition: 'whipPan', transitionDuration: 0.3,
    colorPreset: 'vibrant', vignette: 0.2, vignettePulse: false,
    filmGrain: 0, shake: 0, zoomPunch: 0.2,
    spotlight: false, particles: 'none', frameStyle: 'none'
  },
  editorial: {
    kenBurnsIntensity: 0.15, kenBurnsEasing: 'easeOutQuad',
    transition: 'cut', transitionDuration: 0,
    colorPreset: 'bw', vignette: 0, vignettePulse: false,
    filmGrain: 0, shake: 0, zoomPunch: 0,
    spotlight: true, particles: 'none', frameStyle: 'none'
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Ken Burns Engine
// ─────────────────────────────────────────────────────────────────────────────

function computeKenBurnsPath(photo, aspect, opts) {
  opts = opts || {};
  const direction  = opts.direction  || 'auto';
  const intensity  = (opts.intensity !== undefined) ? opts.intensity : 0.3;
  const focusPoint = opts.focusPoint || { x: 0.5, y: 0.5 };
  const seed       = opts.seed       || 0;

  const targetAR = parseAspect(aspect);
  const photoAR  = photo.naturalW / photo.naturalH;

  // Find the largest crop rect that fits targetAR inside the photo
  function fitRect(photoW, photoH, ar) {
    let cropW, cropH;
    if (photoW / photoH > ar) { cropH = photoH; cropW = cropH * ar; }
    else { cropW = photoW; cropH = cropW / ar; }
    return { cropW, cropH };
  }

  const { cropW, cropH } = fitRect(photo.naturalW, photo.naturalH, targetAR);

  // Focus-biased center
  const cx = clamp(focusPoint.x * photo.naturalW, cropW/2, photo.naturalW - cropW/2);
  const cy = clamp(focusPoint.y * photo.naturalH, cropH/2, photo.naturalH - cropH/2);

  // Base rect (centered on focus)
  const baseRect = { x: cx - cropW/2, y: cy - cropH/2, w: cropW, h: cropH };

  // Auto-pick direction based on AR mismatch
  let dir = direction;
  if (dir === 'auto') {
    if (photoAR > targetAR * 1.3)      dir = pickAlt(['panLeft', 'panRight'], seed);
    else if (photoAR < targetAR * 0.7) dir = pickAlt(['panUp', 'panDown'], seed);
    else                               dir = pickAlt(['zoomIn', 'zoomOut'], seed);
  }

  if (dir === 'none') return { fromRect: baseRect, toRect: baseRect, direction: dir };

  // Zoom amount and pan amount scale with intensity
  const zoomDelta = 0.08 + intensity * 0.18;  // 8–26% zoom change
  const panDelta  = intensity * 0.12;          // % of crop size to pan

  let fromRect = { ...baseRect };
  let toRect   = { ...baseRect };

  switch (dir) {
    case 'zoomIn': {
      // fromRect = full base; toRect = zoomed-in (smaller crop = more magnified)
      const sf = 1 - zoomDelta;
      toRect = { x: cx - cropW*sf/2, y: cy - cropH*sf/2, w: cropW*sf, h: cropH*sf };
      break;
    }
    case 'zoomOut': {
      const sf = 1 - zoomDelta;
      fromRect = { x: cx - cropW*sf/2, y: cy - cropH*sf/2, w: cropW*sf, h: cropH*sf };
      break;
    }
    case 'panLeft': {
      const shift = cropW * panDelta;
      fromRect.x = clamp(baseRect.x + shift, 0, photo.naturalW - cropW);
      toRect.x   = clamp(baseRect.x - shift, 0, photo.naturalW - cropW);
      break;
    }
    case 'panRight': {
      const shift = cropW * panDelta;
      fromRect.x = clamp(baseRect.x - shift, 0, photo.naturalW - cropW);
      toRect.x   = clamp(baseRect.x + shift, 0, photo.naturalW - cropW);
      break;
    }
    case 'panUp': {
      const shift = cropH * panDelta;
      fromRect.y = clamp(baseRect.y + shift, 0, photo.naturalH - cropH);
      toRect.y   = clamp(baseRect.y - shift, 0, photo.naturalH - cropH);
      break;
    }
    case 'panDown': {
      const shift = cropH * panDelta;
      fromRect.y = clamp(baseRect.y - shift, 0, photo.naturalH - cropH);
      toRect.y   = clamp(baseRect.y + shift, 0, photo.naturalH - cropH);
      break;
    }
  }

  return { fromRect, toRect, direction: dir };
}

function drawKenBurnsFrame(ctx, photoImg, kbPath, t, canvasW, canvasH, easing) {
  const eased = applyEasing(clamp(t, 0, 1), easing || 'easeOutQuad');
  const rect  = lerpRect(kbPath.fromRect, kbPath.toRect, eased);
  ctx.drawImage(photoImg, rect.x, rect.y, rect.w, rect.h, 0, 0, canvasW, canvasH);
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — Transitions
// ─────────────────────────────────────────────────────────────────────────────

const PP_TRANSITIONS = {
  cut: function(ctx, prev, next, t, w, h) {
    ctx.drawImage(t < 0.5 ? prev : next, 0, 0, w, h);
  },
  fade: function(ctx, prev, next, t, w, h) {
    ctx.globalAlpha = 1; ctx.drawImage(prev, 0, 0, w, h);
    ctx.globalAlpha = t; ctx.drawImage(next, 0, 0, w, h);
    ctx.globalAlpha = 1;
  },
  slide: function(ctx, prev, next, t, w, h) {
    const off = Math.round(w * t);
    ctx.drawImage(prev, -off, 0, w, h);
    ctx.drawImage(next, w - off, 0, w, h);
  },
  zoom: function(ctx, prev, next, t, w, h) {
    const scale = 1 + t * 0.25;
    ctx.globalAlpha = 1 - t;
    ctx.save(); ctx.translate(w/2, h/2); ctx.scale(scale, scale); ctx.translate(-w/2, -h/2);
    ctx.drawImage(prev, 0, 0, w, h); ctx.restore();
    ctx.globalAlpha = t; ctx.drawImage(next, 0, 0, w, h);
    ctx.globalAlpha = 1;
  },
  whipPan: function(ctx, prev, next, t, w, h) {
    const blur = Math.sin(t * Math.PI) * 12;
    const off  = t < 0.5 ? -t * 2 * w : (t - 0.5) * 2 * w;
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(t < 0.5 ? prev : next, off, 0, w, h);
    ctx.filter = 'none';
  },
  lightLeak: function(ctx, prev, next, t, w, h) {
    ctx.globalAlpha = 1 - t; ctx.drawImage(prev, 0, 0, w, h);
    ctx.globalAlpha = t; ctx.drawImage(next, 0, 0, w, h);
    ctx.globalAlpha = 1;
    const grad = ctx.createRadialGradient(w*0.7, h*0.3, 0, w*0.7, h*0.3, w);
    const a = Math.sin(t * Math.PI) * 0.7;
    grad.addColorStop(0, `rgba(255,180,80,${a})`);
    grad.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  },
  whiteCrossfade: function(ctx, prev, next, t, w, h) {
    const flashA = Math.sin(t * Math.PI);
    ctx.globalAlpha = 1 - t; ctx.drawImage(prev, 0, 0, w, h);
    ctx.globalAlpha = t; ctx.drawImage(next, 0, 0, w, h);
    ctx.globalAlpha = flashA; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  },
  iris: function(ctx, prev, next, t, w, h) {
    ctx.drawImage(prev, 0, 0, w, h);
    const diagonal = Math.sqrt(w*w + h*h) / 2;
    const r = lerp(0, diagonal * 1.1, t);
    ctx.save();
    ctx.beginPath();
    ctx.arc(w/2, h/2, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(next, 0, 0, w, h);
    ctx.restore();
  },
  morphBlend: function(ctx, prev, next, t, w, h) {
    ctx.globalAlpha = 1 - t; ctx.drawImage(prev, 0, 0, w, h);
    if (t > 0.85) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (t - 0.85) / 0.15 * 0.3;
      ctx.drawImage(next, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = t; ctx.drawImage(next, 0, 0, w, h);
    ctx.globalAlpha = 1;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — In-photo effects
// ─────────────────────────────────────────────────────────────────────────────

function _buildNoiseCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i+1] = img.data[i+2] = v;
    img.data[i+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
// Cache one noise canvas (regenerated per frame for motion effect)
let _noiseCanvas = null;

// applyInPhotoEffects — called from the main render loop after Ken Burns, before transitions
// opts.skipFrame = true → skip drawFrameDecoration (caller will draw it after the transition)
function applyInPhotoEffects(ctx, seg, segT, canvasW, canvasH, opts) {
  opts = opts || {};
  const e = seg.effect;

  // Zoom-punch: sudden scale spike recoiling within first 250ms (segT 0→0.25 maps to 0→1→0 spike)
  if (e.zoomPunch && e.zoomPunch > 0) {
    const punchT = clamp(segT / 0.25, 0, 1);
    const punch  = e.zoomPunch * 0.12 * (1 - punchT);
    if (punch > 0.001) {
      ctx.save();
      ctx.translate(canvasW/2, canvasH/2);
      ctx.scale(1 + punch, 1 + punch);
      ctx.translate(-canvasW/2, -canvasH/2);
      // NOTE: caller must have drawn the photo already; punch is a transform pre-applied next draw.
      // In practice, the photo is already on canvas — apply the punch as a scale of the existing
      // canvas contents by redrawing with transform. This is handled in renderFrame by calling
      // applyInPhotoEffects BEFORE drawKenBurnsFrame for punch, but we keep it here as a post-pass
      // by drawing a scaled copy. Simple approach: skip canvas redraw and use CSS transform on the
      // canvas element for the punch. Let the main controller handle zoom-punch via CSS scale.
      ctx.restore();
    }
  }

  // Vignette (always, separate from vignettePulse)
  if (e.vignette > 0) {
    const v = e.vignettePulse
      ? e.vignette + Math.sin(segT * 2 * Math.PI * 0.5) * 0.1
      : e.vignette;
    drawVignette(ctx, v, canvasW, canvasH);
  }

  // Spotlight: darken everything outside a radial area
  if (e.spotlight && e.spotlight.enabled) {
    const sx = e.spotlight.x * canvasW;
    const sy = e.spotlight.y * canvasH;
    const sr = e.spotlight.radius * Math.max(canvasW, canvasH);
    const grd = ctx.createRadialGradient(sx, sy, sr * 0.3, sx, sy, sr);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // Film grain
  if (e.filmGrain > 0) {
    if (!_noiseCanvas || _noiseCanvas.width !== canvasW) {
      _noiseCanvas = _buildNoiseCanvas(canvasW, canvasH);
    } else {
      // Regenerate noise for motion effect
      const nctx = _noiseCanvas.getContext('2d');
      const img = nctx.createImageData(canvasW, canvasH);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 255;
      }
      nctx.putImageData(img, 0, 0);
    }
    ctx.globalAlpha = e.filmGrain * 0.4;
    ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(_noiseCanvas, 0, 0, canvasW, canvasH);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Shake: translate context randomly (caller wraps in ctx.save/restore)
  // Shake is applied as a context transform; calling code in renderFrame should
  // call applyShakeTransform before drawing if shake > 0. Exposed as a helper.

  // Particles (drawn on top of everything)
  if (e.particles && e.particles !== 'none') {
    drawParticles(ctx, e.particles, segT, canvasW, canvasH, e.particleColor || '#ffffff');
  }

  // Frame decoration (drawn last, on top)
  // Skipped here when opts.skipFrame is true — caller draws it after the transition
  // so the strips stay on top of the crossfade and don't fade in/out with the photo.
  if (!opts.skipFrame && e.frameStyle && e.frameStyle !== 'none') {
    drawFrameDecoration(ctx, e.frameStyle, canvasW, canvasH);
  }
}

function applyShakeTransform(ctx, shake) {
  if (!shake || shake === 0) return;
  ctx.translate(
    (Math.random() - 0.5) * shake * 40,
    (Math.random() - 0.5) * shake * 40
  );
}

// Vignette helper
function drawVignette(ctx, intensity, w, h) {
  const grad = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.3, w/2, h/2, Math.max(w,h)*0.75);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${intensity * 0.85})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// Simple particle system — 16 particles per type, drift upward, based on segT
function drawParticles(ctx, type, segT, w, h, color) {
  color = color || '#ffffff';
  const N = 16;
  ctx.save();
  for (let i = 0; i < N; i++) {
    // X: golden ratio distribution across width + gentle sine sway
    const baseX = ((i * 0.618033) % 1) * w;
    const x     = baseX + Math.sin(segT * Math.PI * 2 + i * 1.3) * w * 0.025;
    // Y: use sqrt(3)-1 = 0.7320508 — avoids the anti-diagonal that forms when
    //    X uses 0.618033 and Y uses its complement 0.381966 (they always sum to 1)
    const baseY = ((i * 0.7320508) % 1) * h;
    const speed = 0.5 + (i % 3) * 0.25;
    const y     = ((baseY - segT * h * 0.4 * speed) % h + h) % h;
    const alpha = 0.6 + 0.4 * Math.sin(segT * Math.PI * 2 + i);
    ctx.globalAlpha = Math.max(0, alpha);
    const size = 4 + (i % 4) * 2;
    const fy = y;

    if (type === 'hearts') {
      ctx.font = `${size * 3}px serif`;
      ctx.fillStyle = color;
      ctx.fillText('❤', x, fy);
    } else if (type === 'sparkle') {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, fy - size); ctx.lineTo(x, fy + size);
      ctx.moveTo(x - size, fy); ctx.lineTo(x + size, fy);
      ctx.stroke();
    } else if (type === 'dust') {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, fy, size / 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// Frame decorations
function drawFrameDecoration(ctx, style, w, h) {
  ctx.save();
  if (style === 'polaroid') {
    const pad       = Math.round(w * 0.04);
    const bottomPad = Math.round(h * 0.12);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, pad);                      // top
    ctx.fillRect(0, 0, pad, h);                      // left
    ctx.fillRect(w - pad, 0, pad, h);                // right
    ctx.fillRect(0, h - bottomPad, w, bottomPad);    // bottom (wider)
    // Shadow inset
    const sGrad = ctx.createLinearGradient(pad, pad, pad + 4, pad + 4);
    sGrad.addColorStop(0, 'rgba(0,0,0,0.15)'); sGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sGrad; ctx.fillRect(pad, pad, w - pad*2, h - pad - bottomPad);
  } else if (style === 'filmStrip') {
    const perfH  = Math.round(h * 0.04);
    const perfW  = Math.round(w * 0.035);
    const stripH = Math.round(h * 0.07);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, w, stripH);
    ctx.fillRect(0, h - stripH, w, stripH);
    ctx.fillStyle = '#fff';
    const nPerfs = 8;
    for (let i = 0; i < nPerfs; i++) {
      const px = (w / nPerfs) * i + (w / nPerfs - perfW) / 2;
      const py = (stripH - perfH) / 2;
      ctx.fillRect(px, py, perfW, perfH);
      ctx.fillRect(px, h - stripH + py, perfW, perfH);
    }
  } else if (style === 'cornerBurns') {
    const s = Math.round(w * 0.08);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(s,0); ctx.lineTo(0,s); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w,0); ctx.lineTo(w-s,0); ctx.lineTo(w,s); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,h); ctx.lineTo(s,h); ctx.lineTo(0,h-s); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w,h); ctx.lineTo(w-s,h); ctx.lineTo(w,h-s); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 7 — Resolver
// ─────────────────────────────────────────────────────────────────────────────

function resolveSegmentEffect(seg, moodName, aiAnalysis, userOverrides) {
  const mood = MOOD_PRESETS[moodName] || MOOD_PRESETS.cinematic;
  const ai   = aiAnalysis;   // may be null if smart suggestions off or failed
  const u    = userOverrides || {};

  // ── AI-informed adjustments (priority: user > AI > mood) ──────────────────

  // Color preset
  // Start from mood, let lighting nudge it, then let alreadyGraded/isMonochrome/skipColorPreset override
  let aiColor = mood.colorPreset;
  if (ai) {
    // Lighting nudge — only when mood contributes no color of its own
    if (aiColor === 'none') {
      if (ai.lighting === 'golden-hour') aiColor = 'warm';
      else if (ai.lighting === 'low-light') aiColor = 'moody';
    }
    // Monochrome photo — reinforce with bw filter
    if (ai.isMonochrome) aiColor = 'bw';
    // Already professionally graded or explicitly flagged — strip any filter
    if (ai.alreadyGraded || ai.skipColorPreset) aiColor = 'none';
  }

  // Vignette — bump up for low-light photos
  let aiVignette = mood.vignette;
  if (ai && ai.lighting === 'low-light') {
    aiVignette = Math.min(1, aiVignette + 0.15);
  }

  // Shake & zoom punch — scale with energy
  let aiShake     = mood.shake;
  let aiZoomPunch = mood.zoomPunch;
  if (ai) {
    if (ai.energy === 'high') {
      aiShake     = Math.min(0.5, aiShake + 0.15);
      aiZoomPunch = Math.min(0.5, aiZoomPunch + 0.2);
    } else if (ai.energy === 'calm') {
      aiShake     = Math.max(0, aiShake - 0.1);
      aiZoomPunch = Math.max(0, aiZoomPunch - 0.1);
    }
    // moderate → keep mood values unchanged
  }

  // Particles — AI can now suggest them (user can still override to 'none')
  const aiParticles = (ai && ai.particleHint && ai.particleHint !== 'none') ? ai.particleHint : 'none';

  // Frame style — AI hint overrides mood when it suggests something specific
  const aiFrame = (ai && ai.frameHint && ai.frameHint !== 'none') ? ai.frameHint : mood.frameStyle;

  // ── Build final effect object ─────────────────────────────────────────────
  return {
    kenBurns: {
      direction: u.kenBurnsDirection || (ai && ai.kenBurnsHint) || 'auto',
      intensity: (u.kenBurnsIntensity !== undefined) ? u.kenBurnsIntensity : mood.kenBurnsIntensity,
      easing:    u.kenBurnsEasing    || mood.kenBurnsEasing
    },
    transitionIn:       u.transitionIn       || (ai && ai.transitionInHint) || mood.transition,
    transitionDuration: (u.transitionDuration !== undefined) ? u.transitionDuration : mood.transitionDuration,
    colorPreset:        u.colorPreset        || aiColor,
    spotlight: {
      enabled: (u.spotlightEnabled !== undefined) ? u.spotlightEnabled : mood.spotlight,
      x:       (u.spotlightX !== undefined) ? u.spotlightX : ((ai && ai.subjectPosition && ai.subjectPosition.x) || 0.5),
      y:       (u.spotlightY !== undefined) ? u.spotlightY : ((ai && ai.subjectPosition && ai.subjectPosition.y) || 0.5),
      radius:  (u.spotlightRadius !== undefined) ? u.spotlightRadius : 0.35
    },
    particles:     u.particles     !== undefined ? u.particles     : aiParticles,
    particleColor: u.particleColor || '#ffffff',
    frameStyle:    u.frameStyle    || aiFrame,
    vignette:      (u.vignette      !== undefined) ? u.vignette      : aiVignette,
    vignettePulse: (u.vignettePulse !== undefined) ? u.vignettePulse : mood.vignettePulse,
    filmGrain:     (u.filmGrain     !== undefined) ? u.filmGrain     : mood.filmGrain,
    shake:         (u.shake         !== undefined) ? u.shake         : aiShake,
    zoomPunch:     (u.zoomPunch     !== undefined) ? u.zoomPunch     : aiZoomPunch,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 8 — Canvas dimension helpers
// ─────────────────────────────────────────────────────────────────────────────

function getPPCanvasDimensions(aspect) {
  // Returns { width, height } for the preview canvas (480p equivalent for preview)
  switch (aspect) {
    case '9:16': return { width: 270,  height: 480 };
    case '4:5':  return { width: 432,  height: 540 };
    case '1:1':  return { width: 480,  height: 480 };
    default:     return { width: 270,  height: 480 };
  }
}

function getPPExportDimensions(aspect, quality) {
  // quality: '480p' | '720p' | '1080p'
  const heights = { '480p': 480, '720p': 720, '1080p': 1080 };
  const h  = heights[quality] || 720;
  const ar = parseAspect(aspect);
  return { width: Math.round(h * ar), height: h };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 9 — Photopilot-specific overlay draw functions
// (Subscribe / Follow drawn by drawReelOverlays() from 20-reels-creator.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * drawColourPicOverlay — draws a user image with coloured border at a corner.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement|null} imgEl  - already-loaded Image element
 * @param {object} params  - { borderColor, position, size, alpha }
 *   position: 'tl'|'tr'|'bl'|'br'  size: 0–1 fraction of canvas width
 * @param {number} progress  - 0–1 within the overlay's duration (for fade)
 * @param {number} W  - canvas width
 * @param {number} H  - canvas height
 */
function drawColourPicOverlay(ctx, imgEl, params, progress, W, H) {
  if (!imgEl) return;
  const fadeIn  = Math.min(1, progress / 0.2);
  const fadeOut = Math.min(1, (1 - progress) / 0.15);
  const alpha   = Math.min(fadeIn, fadeOut) * (params.alpha !== undefined ? params.alpha : 1);
  if (alpha <= 0) return;

  const sz     = W * clamp(params.size || 0.25, 0.1, 0.5);
  const border = Math.max(2, sz * 0.04);
  const margin = sz * 0.06;
  const pos    = params.position || params.corner || 'br';

  let x, y;
  if (pos === 'tl')      { x = margin;           y = margin; }
  else if (pos === 'tr') { x = W - sz - margin;  y = margin; }
  else if (pos === 'bl') { x = margin;            y = H - sz - margin; }
  else                   { x = W - sz - margin;   y = H - sz - margin; } // br

  ctx.save();
  ctx.globalAlpha = alpha;

  // Coloured border rect
  ctx.fillStyle = params.borderColor || '#ffffff';
  ctx.beginPath();
  const r = sz * 0.08;
  ctx.roundRect(x - border, y - border, sz + border * 2, sz + border * 2, r + border);
  ctx.fill();

  // Clip to inner rounded rect and draw image
  ctx.beginPath();
  ctx.roundRect(x, y, sz, sz, r);
  ctx.clip();
  ctx.drawImage(imgEl, x, y, sz, sz);

  ctx.restore();
}

/**
 * drawTimePicOverlay — draws a styled date/time badge on the canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} params  - { format, bgColor, textColor, position }
 *   format: 'date'|'time'|'datetime'
 *   position: 'tl'|'tr'|'bl'|'br'
 * @param {number} progress  - 0–1 within the overlay's duration (for fade)
 * @param {number} W
 * @param {number} H
 */
function drawTimePicOverlay(ctx, params, progress, W, H) {
  const fadeIn  = Math.min(1, progress / 0.2);
  const fadeOut = Math.min(1, (1 - progress) / 0.15);
  const alpha   = Math.min(fadeIn, fadeOut);
  if (alpha <= 0) return;

  const now    = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // order: array of 4 slots, each 'none'|'day'|'month'|'year'|'time'
  // legacy parts fallback for old saved projects
  let order = params.order;
  if (!order) {
    const parts = params.parts || { day: true, month: true, year: true, time: false };
    order = [];
    if (parts.day)   order.push('day');
    if (parts.month) order.push('month');
    if (parts.year)  order.push('year');
    if (parts.time)  order.push('time');
    while (order.length < 4) order.push('none');
  }
  const pieces = order.map(function(slot) {
    if (slot === 'day')   return String(now.getDate());
    if (slot === 'month') return months[now.getMonth()];
    if (slot === 'year')  return String(now.getFullYear());
    if (slot === 'time')  return now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    return '';
  }).filter(Boolean);
  const label = pieces.join(' ') || '—';

  // Background color: support new bgColorHex+bgOpacity or legacy bgColor string
  let bgColor = params.bgColor || 'rgba(0,0,0,0.65)';
  if (params.bgColorHex) {
    const r = parseInt(params.bgColorHex.slice(1,3), 16);
    const g = parseInt(params.bgColorHex.slice(3,5), 16);
    const b = parseInt(params.bgColorHex.slice(5,7), 16);
    bgColor = 'rgba(' + r + ',' + g + ',' + b + ',' + (params.bgOpacity !== undefined ? params.bgOpacity : 0.65) + ')';
  }

  const fs      = W * 0.045;
  const padX    = fs * 0.8;
  const padY    = fs * 0.5;
  const margin  = W * 0.05;
  const pos     = params.position || params.corner || 'tl';

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `600 ${fs}px Poppins, sans-serif`;
  const tw = ctx.measureText(label).width;
  const bw = tw + padX * 2;
  const bh = fs + padY * 2;

  let bx, by;
  if (pos === 'tl')      { bx = margin;         by = margin; }
  else if (pos === 'tr') { bx = W - bw - margin; by = margin; }
  else if (pos === 'bl') { bx = margin;          by = H - bh - margin; }
  else                   { bx = W - bw - margin;  by = H - bh - margin; }

  // Background pill
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, bh / 2);
  ctx.fill();

  // Text
  ctx.fillStyle = params.textColor || '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + padX, by + bh / 2);

  ctx.restore();
}
