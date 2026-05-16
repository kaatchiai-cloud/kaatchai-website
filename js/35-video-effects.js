// ══════════════════════════════════════════════════════════════════════════
//  VIDEO EFFECTS ENGINE — registry, overlay, resolver, renderFns
//
//  Sections:
//    1  Helpers (import from 25-photopilot-fx.js)
//    2  Effect registry
//    3  Canvas overlay manager
//    4  Bbox resolver
//    5  Per-frame draw loop
//    6  Text effect render functions (12)
//    7  Overlay effect render functions (12)
//    8  Camera effect render functions (8)
//    9  Object-bound effect render functions (9)
//    10 Transition effect render functions (12)
//    11 Brand/info effect render functions (8)
//    12 Reaction effect render functions (6)
//    13 Audio-reactive effect render functions (5)
//    14 Public API export
//
//  Authority: devDoc/video-effects/video-effects-dev-doc.md
// ══════════════════════════════════════════════════════════════════════════
(function () {
'use strict';

// ─── Section 1 — Helpers ───────────────────────────────────────────────────
const fxClamp    = (typeof clamp === 'function')    ? clamp    : function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
const fxLerp    = (typeof lerp === 'function')      ? lerp     : function (a, b, t) { return a + (b - a) * t; };
const fxEase    = (typeof applyEasing === 'function') ? applyEasing : function (t, type) {
  switch (type) {
    case 'linear':         return t;
    case 'easeOutQuad':    return 1 - (1 - t) * (1 - t);
    case 'easeInOutCubic': return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
    default:               return 1 - (1 - t) * (1 - t);
  }
};

function fmtFxTime(sec) {
  if (sec == null || isNaN(sec)) return '0:00';
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + String(s).padStart(2, '0');
}

// ─── Section 2 — Effect registry ───────────────────────────────────────────
const EFFECT_REGISTRY = {};

const FX_CATEGORIES = ['text', 'overlay', 'camera', 'object_bound', 'transition', 'brand', 'reaction', 'audio_reactive'];

function registerEffect(effectType, category, opts) {
  EFFECT_REGISTRY[effectType] = {
    category: category,
    requiresObject: !!opts.requiresObject,
    defaultDuration: opts.defaultDuration || 0,
    renderFn: opts.renderFn,
    defaults: opts.defaults || { intensity: 0.6, color: null, easing: 'easeOutQuad' },
  };
}

// ─── Section 3 — Canvas overlay manager ────────────────────────────────────
const _overlays = new Map();

function getOrCreateOverlay(parentCanvas) {
  if (!parentCanvas) return null;
  const id = parentCanvas.id || parentCanvas.dataset.overlayId;
  if (id && _overlays.has(id)) {
    const entry = _overlays.get(id);
    if (entry.el && entry.el.isConnected) {
      entry.el.width = parentCanvas.width;
      entry.el.height = parentCanvas.height;
      return entry;
    }
  }
  const overlay = document.createElement('canvas');
  overlay.className = 'cg-effects-overlay';
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = parentCanvas.offsetWidth + 'px';
  overlay.style.height = parentCanvas.offsetHeight + 'px';
  overlay.width = parentCanvas.width;
  overlay.height = parentCanvas.height;
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '10';
  const parent = parentCanvas.parentElement;
  if (parent) {
    parent.style.position = 'relative';
    parent.appendChild(overlay);
  }
  const entry = { el: overlay, ctx: overlay.getContext('2d') };
  const key = id || ('fx-overlay-' + Date.now());
  parentCanvas.dataset.overlayId = key;
  _overlays.set(key, entry);
  return entry;
}

function destroyOverlay(parentCanvas) {
  if (!parentCanvas) return;
  const id = parentCanvas.dataset.overlayId;
  if (!id) return;
  const entry = _overlays.get(id);
  if (entry && entry.el && entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
  _overlays.delete(id);
  delete parentCanvas.dataset.overlayId;
}

// ─── Section 4 — Bbox resolver ──────────────────────────────────────────────
function resolveBbox(fx, tracks, currentTime) {
  if (!fx.objectBounds) return null;
  if (!tracks || !fx.objectLabel) return fx.objectBounds;

  const objectId = fx.id + '-' + fx.objectLabel;
  const objTracks = tracks[objectId];
  if (!objTracks) return fx.objectBounds;

  const frameRate = 30;
  const currentFrame = Math.floor(currentTime * frameRate);
  const trackStep = 8;

  const keyFrame = Math.floor(currentFrame / trackStep) * trackStep;
  const nextKeyFrame = keyFrame + trackStep;

  const keyBbox = objTracks[keyFrame];
  const nextBbox = objTracks[nextKeyFrame];

  if (keyBbox && nextBbox) {
    const t = (currentFrame - keyFrame) / trackStep;
    return {
      x: fxLerp(keyBbox.x, nextBbox.x, t),
      y: fxLerp(keyBbox.y, nextBbox.y, t),
      w: fxLerp(keyBbox.w, nextBbox.w, t),
      h: fxLerp(keyBbox.h, nextBbox.h, t),
    };
  }

  return keyBbox || fx.objectBounds;
}

// ─── Section 5 — Per-frame draw loop ───────────────────────────────────────
function drawVideoEffects(ctx, videoEl, currentTime, effectInstances, tracks) {
  if (!ctx || !effectInstances || effectInstances.length === 0) return;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  if (W <= 0 || H <= 0) return;

  effectInstances.forEach(function (fx) {
    if (currentTime < fx.startTime || currentTime > fx.endTime) return;
    const regEntry = EFFECT_REGISTRY[fx.effectType];
    if (!regEntry || !regEntry.renderFn) return;

    const duration = fx.endTime - fx.startTime;
    const elapsed = currentTime - fx.startTime;
    const progress = duration > 0 ? fxClamp(elapsed / duration, 0, 1) : 1;
    const easedProgress = fxEase(progress, (fx.params && fx.params.easing) || 'easeOutQuad');

    const bbox = resolveBbox(fx, tracks, currentTime);
    const params = Object.assign({}, regEntry.defaults, fx.params || {});

    ctx.save();
    regEntry.renderFn(ctx, { progress: easedProgress, rawProgress: progress, bbox: bbox, params: params, W: W, H: H, videoEl: videoEl, currentTime: currentTime, fx: fx });
    ctx.restore();
  });
}

function renderEffectsToCanvas(ctx, videoEl, effectInstances, tracks, currentTime) {
  drawVideoEffects(ctx, videoEl, currentTime, effectInstances, tracks);
}

// ─── Section 6 — Text effect render functions (12) ─────────────────────────

registerEffect('text_pop', 'text', { defaultDuration: 0.6, renderFn: function (ctx, o) {
  const s = o.params.intensity * fxEase(fxClamp(o.rawProgress / 0.6, 0, 1), 'easeOutQuad');
  const scale = 0.3 + 0.7 * s;
  const bounce = o.rawProgress > 0.6 ? 1 + Math.sin((o.rawProgress - 0.6) / 0.4 * Math.PI) * 0.06 * o.params.intensity : 1;
  ctx.translate(o.W / 2, o.H / 2);
  ctx.scale(scale * bounce, scale * bounce);
  ctx.translate(-o.W / 2, -o.H / 2);
}});

registerEffect('text_slide_up', 'text', { defaultDuration: 0.5, renderFn: function (ctx, o) {
  const t = fxEase(fxClamp(o.rawProgress / 0.5, 0, 1), 'easeOutQuad');
  const offsetY = (1 - t) * o.H * 0.15 * o.params.intensity;
  ctx.translate(0, offsetY);
  ctx.globalAlpha = fxClamp(t * 2, 0, 1);
}});

registerEffect('text_slide_left', 'text', { defaultDuration: 0.5, renderFn: function (ctx, o) {
  const t = fxEase(fxClamp(o.rawProgress / 0.5, 0, 1), 'easeOutQuad');
  const offsetX = (1 - t) * o.W * 0.15 * o.params.intensity;
  ctx.translate(-offsetX, 0);
  ctx.globalAlpha = fxClamp(t * 2, 0, 1);
}});

registerEffect('text_typewriter', 'text', { defaultDuration: 0, renderFn: function (ctx, o) {
}});

registerEffect('text_fade', 'text', { defaultDuration: 0.4, renderFn: function (ctx, o) {
  const t = fxEase(fxClamp(o.rawProgress / 0.4, 0, 1), 'easeOutQuad');
  ctx.globalAlpha = t * o.params.intensity;
}});

registerEffect('text_scale_in', 'text', { defaultDuration: 0.5, renderFn: function (ctx, o) {
  const t = fxEase(fxClamp(o.rawProgress / 0.5, 0, 1), 'easeOutQuad');
  const scale = 0.8 + 0.2 * t;
  ctx.translate(o.W / 2, o.H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-o.W / 2, -o.H / 2);
  ctx.globalAlpha = fxClamp(t * 1.5 * o.params.intensity, 0, 1);
}});

registerEffect('text_bounce', 'text', { defaultDuration: 0.8, renderFn: function (ctx, o) {
  const t = o.rawProgress;
  const overshoot = 1 + Math.sin(t * Math.PI * 3) * 0.15 * (1 - t) * o.params.intensity;
  const scale = 0.5 + 0.5 * fxClamp(t / 0.3, 0, 1);
  ctx.translate(o.W / 2, o.H / 2);
  ctx.scale(scale * overshoot, scale * overshoot);
  ctx.translate(-o.W / 2, -o.H / 2);
}});

registerEffect('word_by_word', 'text', { defaultDuration: 0, renderFn: function (ctx, o) {
}});

registerEffect('letter_by_letter', 'text', { defaultDuration: 0, renderFn: function (ctx, o) {
}});

registerEffect('text_glitch', 'text', { defaultDuration: 1.0, renderFn: function (ctx, o) {
  const t = o.rawProgress;
  if (Math.random() > 0.6) {
    const shift = (Math.random() - 0.5) * 8 * o.params.intensity;
    ctx.translate(shift, 0);
  }
  ctx.globalAlpha = 0.3 + 0.7 * t;
}});

registerEffect('text_highlight_sweep', 'text', { defaultDuration: 0.6, renderFn: function (ctx, o) {
  const t = fxEase(o.rawProgress, 'easeOutQuad');
  const sweepX = t * o.W;
  ctx.fillStyle = o.params.color || 'rgba(120,220,255,0.25)';
  ctx.fillRect(0, 0, sweepX, o.H);
}});

registerEffect('text_underline_draw', 'text', { defaultDuration: 0.5, renderFn: function (ctx, o) {
  const t = fxEase(fxClamp(o.rawProgress / 0.5, 0, 1), 'easeOutQuad');
  const lineW = t * o.W;
  ctx.strokeStyle = o.params.color || 'rgba(120,220,255,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, o.H - 4);
  ctx.lineTo(lineW, o.H - 4);
  ctx.stroke();
}});

// ─── Section 7 — Overlay effect render functions (12) ──────────────────────

registerEffect('particles_sparkle', 'overlay', { defaultDuration: 0, renderFn: function (ctx, o) {
  const N = 20;
  for (let i = 0; i < N; i++) {
    const baseX = ((i * 0.618033) % 1) * o.W;
    const x = baseX + Math.sin(o.currentTime * 2 + i * 1.3) * o.W * 0.03;
    const baseY = ((i * 0.7320508) % 1) * o.H;
    const y = ((baseY - o.rawProgress * o.H * 0.3 * (0.5 + (i % 3) * 0.25)) % o.H + o.H) % o.H;
    const alpha = (0.4 + 0.6 * Math.sin(o.currentTime * Math.PI * 2 + i)) * o.params.intensity;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.strokeStyle = o.params.color || '#ffffff';
    ctx.lineWidth = 1.5;
    const sz = 3 + (i % 4) * 2;
    ctx.beginPath();
    ctx.moveTo(x, y - sz); ctx.lineTo(x, y + sz);
    ctx.moveTo(x - sz, y); ctx.lineTo(x + sz, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}});

registerEffect('particles_snow', 'overlay', { defaultDuration: 0, renderFn: function (ctx, o) {
  const N = 40;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < N; i++) {
    const baseX = ((i * 0.618033) % 1) * o.W;
    const x = baseX + Math.sin(o.currentTime * 1.5 + i * 0.7) * o.W * 0.02;
    const speed = 0.3 + (i % 4) * 0.2;
    const y = ((o.rawProgress * o.H * speed + (i * 0.7320508 % 1) * o.H) % o.H + o.H) % o.H;
    ctx.globalAlpha = (0.3 + 0.5 * Math.sin(i + o.currentTime)) * o.params.intensity;
    const sz = 1.5 + (i % 3) * 1.5;
    ctx.beginPath();
    ctx.arc(x, y, sz, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}});

registerEffect('particles_confetti', 'overlay', { defaultDuration: 2.0, renderFn: function (ctx, o) {
  const N = 30;
  const colors = ['#ff6b7a', '#7ddfff', '#ffbe0b', '#06d6a0', '#b073ff'];
  for (let i = 0; i < N; i++) {
    const t = o.rawProgress;
    const x = (((i * 0.618033) % 1) * o.W + (t - 0.5) * (i % 2 === 0 ? 60 : -60));
    const fallY = t * t * o.H * 1.2;
    const y = ((i * 0.7320508 % 1) * o.H * -0.5 + fallY) % (o.H * 1.5);
    if (y < 0 || y > o.H) continue;
    const alpha = (t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1) * o.params.intensity;
    ctx.globalAlpha = Math.max(0, alpha);
    const w = 4 + (i % 3) * 3;
    const h = 3 + (i % 2) * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * Math.PI * 2 * (i % 2 === 0 ? 1 : -1));
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}});

registerEffect('particles_fire', 'overlay', { defaultDuration: 0, renderFn: function (ctx, o) {
  const N = 24;
  for (let i = 0; i < N; i++) {
    const baseX = ((i * 0.618033) % 1) * o.W;
    const x = baseX + Math.sin(o.currentTime * 3 + i) * 15;
    const life = ((o.rawProgress * 3 + i * 0.3) % 1);
    const y = o.H - life * o.H * 0.4;
    const alpha = (1 - life) * o.params.intensity * 0.7;
    ctx.globalAlpha = Math.max(0, alpha);
    const sz = (3 + (i % 4) * 3) * (1 - life * 0.5);
    const r = Math.floor(255);
    const g = Math.floor(100 + (1 - life) * 100);
    const b = Math.floor(30 * (1 - life));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(x, y, sz, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}});

registerEffect('particles_bokeh', 'overlay', { defaultDuration: 0, renderFn: function (ctx, o) {
  const N = 12;
  for (let i = 0; i < N; i++) {
    const baseX = ((i * 0.618033) % 1) * o.W;
    const x = baseX + Math.sin(o.currentTime * 0.5 + i * 2) * o.W * 0.03;
    const baseY = ((i * 0.7320508) % 1) * o.H;
    const y = baseY + Math.cos(o.currentTime * 0.3 + i * 1.5) * o.H * 0.02;
    const alpha = (0.1 + 0.15 * Math.sin(o.currentTime + i)) * o.params.intensity;
    ctx.globalAlpha = Math.max(0, alpha);
    const sz = 15 + (i % 5) * 10;
    ctx.strokeStyle = o.params.color || 'rgba(120,220,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, sz, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}});

registerEffect('film_grain', 'overlay', { defaultDuration: 0, renderFn: function (ctx, o) {
  const W = o.W; const H = o.H;
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < img.data.length; i += 16) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i+1] = img.data[i+2] = v;
    img.data[i+3] = Math.floor(o.params.intensity * 100);
    for (let j = 4; j < 16 && i + j + 3 < img.data.length; j += 4) {
      img.data[i+j] = img.data[i+j+1] = img.data[i+j+2] = v;
      img.data[i+j+3] = Math.floor(o.params.intensity * 100);
    }
  }
  ctx.putImageData(img, 0, 0);
}});

registerEffect('light_leak', 'overlay', { defaultDuration: 1.5, renderFn: function (ctx, o) {
  const t = Math.sin(o.rawProgress * Math.PI);
  ctx.globalAlpha = t * o.params.intensity * 0.7;
  const grad = ctx.createRadialGradient(o.W * 0.7, o.H * 0.3, 0, o.W * 0.7, o.H * 0.3, o.W * 0.8);
  grad.addColorStop(0, 'rgba(255,180,80,0.6)');
  grad.addColorStop(0.5, 'rgba(255,120,60,0.2)');
  grad.addColorStop(1, 'rgba(255,180,80,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, o.W, o.H);
  ctx.globalAlpha = 1;
}});

registerEffect('lens_flare', 'overlay', { defaultDuration: 0.8, renderFn: function (ctx, o) {
  const t = Math.sin(o.rawProgress * Math.PI);
  ctx.globalAlpha = t * o.params.intensity * 0.6;
  const cx = o.W * 0.6; const cy = o.H * 0.35;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, o.W * 0.3);
  grad.addColorStop(0, 'rgba(255,255,240,0.8)');
  grad.addColorStop(0.3, 'rgba(255,240,200,0.3)');
  grad.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, o.W, o.H);
  ctx.globalAlpha = 1;
}});

registerEffect('vignette_pulse', 'overlay', { defaultDuration: 0, renderFn: function (ctx, o) {
  const pulse = Math.sin(o.rawProgress * Math.PI * 2 * 0.5) * 0.15;
  const intensity = (0.5 + pulse) * o.params.intensity;
  const grad = ctx.createRadialGradient(o.W / 2, o.H / 2, Math.min(o.W, o.H) * 0.25, o.W / 2, o.H / 2, Math.max(o.W, o.H) * 0.7);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${fxClamp(intensity, 0, 1)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, o.W, o.H);
}});

registerEffect('fog', 'overlay', { defaultDuration: 0, renderFn: function (ctx, o) {
  ctx.globalAlpha = o.params.intensity * 0.35;
  for (let i = 0; i < 3; i++) {
    const yOff = Math.sin(o.rawProgress * Math.PI * 2 + i * 2) * o.H * 0.05;
    const grad = ctx.createLinearGradient(0, o.H * 0.5 + yOff + i * 30, 0, o.H + yOff + i * 30);
    grad.addColorStop(0, 'rgba(180,200,220,0)');
    grad.addColorStop(0.5, 'rgba(180,200,220,0.4)');
    grad.addColorStop(1, 'rgba(180,200,220,0.1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, o.W, o.H);
  }
  ctx.globalAlpha = 1;
}});

registerEffect('rain', 'overlay', { defaultDuration: 0, renderFn: function (ctx, o) {
  const N = 50;
  ctx.strokeStyle = 'rgba(180,200,255,0.4)';
  ctx.lineWidth = 1;
  ctx.globalAlpha = o.params.intensity;
  for (let i = 0; i < N; i++) {
    const baseX = ((i * 0.618033) % 1) * o.W;
    const x = baseX + Math.sin(o.currentTime + i) * 5;
    const speed = 0.5 + (i % 3) * 0.3;
    const y = ((o.rawProgress * o.H * speed * 2 + (i * 0.7320508 % 1) * o.H) % o.H + o.H) % o.H;
    const len = 8 + (i % 4) * 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}});

registerEffect('bloom_glow', 'overlay', { defaultDuration: 0, renderFn: function (ctx, o) {
  ctx.globalAlpha = o.params.intensity * 0.3;
  ctx.globalCompositeOperation = 'screen';
  const grad = ctx.createRadialGradient(o.W / 2, o.H / 2, 0, o.W / 2, o.H / 2, o.W * 0.5);
  grad.addColorStop(0, 'rgba(255,255,255,0.3)');
  grad.addColorStop(0.5, 'rgba(200,220,255,0.15)');
  grad.addColorStop(1, 'rgba(200,220,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, o.W, o.H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}});

// ─── Section 8 — Camera effect render functions (8) ─────────────────────────

registerEffect('zoom_punch', 'camera', { defaultDuration: 0.3, renderFn: function (ctx, o) {
  const t = o.rawProgress / 0.3;
  const punch = o.params.intensity * 0.12 * (1 - fxClamp(t, 0, 1));
  if (punch > 0.001) {
    ctx.translate(o.W / 2, o.H / 2);
    ctx.scale(1 + punch, 1 + punch);
    ctx.translate(-o.W / 2, -o.H / 2);
  }
}});

registerEffect('zoom_in_slow', 'camera', { defaultDuration: 0, renderFn: function (ctx, o) {
  const scale = 1 + o.rawProgress * 0.2 * o.params.intensity;
  ctx.translate(o.W / 2, o.H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-o.W / 2, -o.H / 2);
}});

registerEffect('zoom_out_slow', 'camera', { defaultDuration: 0, renderFn: function (ctx, o) {
  const scale = 1.2 - o.rawProgress * 0.2 * o.params.intensity;
  ctx.translate(o.W / 2, o.H / 2);
  ctx.scale(Math.max(scale, 1), Math.max(scale, 1));
  ctx.translate(-o.W / 2, -o.H / 2);
}});

registerEffect('ken_burns', 'camera', { defaultDuration: 0, renderFn: function (ctx, o) {
  const scale = 1 + o.rawProgress * 0.15 * o.params.intensity;
  const panX = (o.rawProgress - 0.5) * 0.05 * o.params.intensity * o.W;
  const panY = (o.rawProgress - 0.5) * 0.03 * o.params.intensity * o.H;
  ctx.translate(o.W / 2 + panX, o.H / 2 + panY);
  ctx.scale(scale, scale);
  ctx.translate(-o.W / 2, -o.H / 2);
}});

registerEffect('camera_shake', 'camera', { defaultDuration: 0.5, renderFn: function (ctx, o) {
  const t = Math.sin(o.rawProgress * Math.PI);
  const mag = o.params.intensity * 6 * t;
  ctx.translate(
    (Math.random() - 0.5) * mag * 2,
    (Math.random() - 0.5) * mag * 2
  );
}});

registerEffect('whip_pan', 'camera', { defaultDuration: 0.3, renderFn: function (ctx, o) {
  const t = Math.sin(o.rawProgress * Math.PI);
  const blur = t * 12 * o.params.intensity;
  const off = (o.rawProgress - 0.5) * o.W * 0.1 * o.params.intensity;
  if (typeof ctx.filter !== 'undefined') {
    ctx.filter = `blur(${blur}px)`;
  }
  ctx.translate(off, 0);
}});

registerEffect('rack_focus_blur', 'camera', { defaultDuration: 0.8, renderFn: function (ctx, o) {
  const t = o.rawProgress;
  const blurCurve = Math.sin(t * Math.PI);
  const blur = blurCurve * 8 * o.params.intensity;
  const zoom = 1 + blurCurve * 0.03 * o.params.intensity;
  if (typeof ctx.filter !== 'undefined') {
    ctx.filter = `blur(${blur}px)`;
  }
  ctx.translate(o.W / 2, o.H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-o.W / 2, -o.H / 2);
}});

registerEffect('handheld_wobble', 'camera', { defaultDuration: 0, renderFn: function (ctx, o) {
  const mag = o.params.intensity * 3;
  const x = Math.sin(o.currentTime * 2.5) * mag;
  const y = Math.cos(o.currentTime * 1.8) * mag;
  ctx.translate(x, y);
}});

// ─── Section 9 — Object-bound effect render functions (9) ──────────────────

registerEffect('highlight_box', 'object_bound', { requiresObject: true, defaultDuration: 0, renderFn: function (ctx, o) {
  if (!o.bbox) return;
  var x = o.bbox.x * o.W; var y = o.bbox.y * o.H;
  var w = o.bbox.w * o.W; var h = o.bbox.h * o.H;
  var pad = 4;
  ctx.strokeStyle = o.params.color || 'rgba(120,220,255,0.9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  var dashOffset = o.rawProgress * 30;
  ctx.lineDashOffset = -dashOffset;
  ctx.strokeRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
  ctx.setLineDash([]);
}});

registerEffect('glow_ring', 'object_bound', { requiresObject: true, defaultDuration: 0, renderFn: function (ctx, o) {
  if (!o.bbox) return;
  var cx = (o.bbox.x + o.bbox.w / 2) * o.W;
  var cy = (o.bbox.y + o.bbox.h / 2) * o.H;
  var rx = o.bbox.w * o.W / 2 + 8;
  var ry = o.bbox.h * o.H / 2 + 8;
  var pulse = 1 + Math.sin(o.rawProgress * Math.PI * 4) * 0.08 * o.params.intensity;
  ctx.strokeStyle = o.params.color || 'rgba(120,220,255,0.8)';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = o.params.color || 'rgba(120,220,255,0.6)';
  ctx.shadowBlur = 12 * o.params.intensity;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * pulse, ry * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}});

registerEffect('track_blur', 'object_bound', { requiresObject: true, defaultDuration: 0, renderFn: function (ctx, o) {
  if (!o.bbox) return;
  var x = o.bbox.x * o.W; var y = o.bbox.y * o.H;
  var w = o.bbox.w * o.W; var h = o.bbox.h * o.H;
  var blur = 4 * o.params.intensity;
  if (typeof ctx.filter !== 'undefined') {
    ctx.save();
    ctx.filter = 'blur(' + blur + 'px)';
    ctx.fillRect(0, 0, x, o.H);
    ctx.fillRect(x, 0, o.W - x - w, o.H);
    ctx.fillRect(x, 0, w, y);
    ctx.fillRect(x, y + h, w, o.H - y - h);
    ctx.filter = 'none';
    ctx.restore();
  }
}});

registerEffect('track_spotlight', 'object_bound', { requiresObject: true, defaultDuration: 0, renderFn: function (ctx, o) {
  if (!o.bbox) return;
  var cx = (o.bbox.x + o.bbox.w / 2) * o.W;
  var cy = (o.bbox.y + o.bbox.h / 2) * o.H;
  var rx = o.bbox.w * o.W / 2 + 30;
  var ry = o.bbox.h * o.H / 2 + 30;
  var maxR = Math.max(o.W, o.H);
  ctx.fillStyle = 'rgba(0,0,0,' + (0.55 * o.params.intensity) + ')';
  ctx.beginPath();
  ctx.rect(0, 0, o.W, o.H);
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2, true);
  ctx.fill();
}});

registerEffect('click_ripple', 'object_bound', { requiresObject: true, defaultDuration: 0.6, renderFn: function (ctx, o) {
  if (!o.bbox) return;
  var cx = (o.bbox.x + o.bbox.w / 2) * o.W;
  var cy = (o.bbox.y + o.bbox.h / 2) * o.H;
  var maxR = Math.max(o.bbox.w * o.W, o.bbox.h * o.H);
  for (var i = 0; i < 3; i++) {
    var delay = i * 0.12;
    var t = fxClamp((o.rawProgress - delay) / (1 - delay), 0, 1);
    var r = t * maxR * 1.2;
    var alpha = (1 - t) * o.params.intensity * 0.6;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.strokeStyle = o.params.color || 'rgba(120,220,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}});

registerEffect('arrow_pointer', 'object_bound', { requiresObject: true, defaultDuration: 0, renderFn: function (ctx, o) {
  if (!o.bbox) return;
  var cx = (o.bbox.x + o.bbox.w / 2) * o.W;
  var cy = (o.bbox.y + o.bbox.h / 2) * o.H;
  var bob = Math.sin(o.rawProgress * Math.PI * 4) * 5 * o.params.intensity;
  var tipY = o.bbox.y * o.H - 20 + bob;
  ctx.fillStyle = o.params.color || 'rgba(120,220,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(cx, tipY + 14);
  ctx.lineTo(cx - 7, tipY);
  ctx.lineTo(cx + 7, tipY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = o.params.color || 'rgba(120,220,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, tipY - 16);
  ctx.lineTo(cx, tipY);
  ctx.stroke();
}});

registerEffect('outline_trace', 'object_bound', { requiresObject: true, defaultDuration: 1.0, renderFn: function (ctx, o) {
  if (!o.bbox) return;
  var x = o.bbox.x * o.W; var y = o.bbox.y * o.H;
  var w = o.bbox.w * o.W; var h = o.bbox.h * o.H;
  ctx.strokeStyle = o.params.color || 'rgba(120,220,255,0.8)';
  ctx.lineWidth = 2;
  var perimeter = 2 * (w + h);
  var drawLen = o.rawProgress * perimeter;
  ctx.beginPath();
  ctx.moveTo(x, y);
  var sides = [
    [x + w, y, w],
    [x + w, y + h, h],
    [x, y + h, w],
    [x, y, h],
  ];
  for (var i = 0; i < sides.length && drawLen > 0; i++) {
    var len = sides[i][2];
    if (drawLen >= len) {
      ctx.lineTo(sides[i][0], sides[i][1]);
      drawLen -= len;
    } else {
      var frac = drawLen / len;
      var ex = fxLerp(sides[i][0] - (sides[(i+1)%4][0] - sides[i][0]) * 0, sides[i][0], frac > 0 ? 1 : 0);
      ctx.lineTo(
        fxLerp(i === 0 ? x : (i === 1 ? x + w : (i === 2 ? x + w : x)), sides[i][0], fxClamp(drawLen / Math.max(len, 1), 0, 1)),
        fxLerp(i === 0 ? y : (i === 1 ? y : (i === 2 ? y + h : y + h)), sides[i][1], fxClamp(drawLen / Math.max(len, 1), 0, 1))
      );
      drawLen = 0;
    }
  }
  ctx.stroke();
}});

registerEffect('silhouette_fill', 'object_bound', { requiresObject: true, defaultDuration: 0, renderFn: function (ctx, o) {
  if (!o.bbox) return;
  var x = o.bbox.x * o.W; var y = o.bbox.y * o.H;
  var w = o.bbox.w * o.W; var h = o.bbox.h * o.H;
  var c = o.params.color || 'rgba(120,220,255,0.3)';
  ctx.fillStyle = c;
  ctx.globalAlpha = o.params.intensity * 0.5;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}});

registerEffect('color_pop', 'object_bound', { requiresObject: true, defaultDuration: 0, renderFn: function (ctx, o) {
  if (!o.bbox) return;
  ctx.fillStyle = 'rgba(0,0,0,' + (0.03 * o.params.intensity) + ')';
  for (var i = 0; i < 3; i++) {
    ctx.fillRect(0, 0, o.W, o.H);
  }
}});

// ─── Section 10 — Transition effect render functions (12) ──────────────────

registerEffect('cut', 'transition', { defaultDuration: 0, renderFn: function (ctx, o) {
}});

registerEffect('fade', 'transition', { defaultDuration: 0.5, renderFn: function (ctx, o) {
  var t = o.rawProgress;
  ctx.globalAlpha = t < 0.3 ? (1 - t / 0.3) * o.params.intensity : t > 0.7 ? ((t - 0.7) / 0.3) * o.params.intensity : 0;
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.fillRect(0, 0, o.W, o.H);
  ctx.globalAlpha = 1;
}});

registerEffect('cross_dissolve', 'transition', { defaultDuration: 0.5, renderFn: function (ctx, o) {
  var t = Math.sin(o.rawProgress * Math.PI);
  ctx.globalAlpha = t * o.params.intensity * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fillRect(0, 0, o.W, o.H);
  ctx.globalAlpha = 1;
}});

registerEffect('white_flash', 'transition', { defaultDuration: 0.3, renderFn: function (ctx, o) {
  var t = Math.sin(o.rawProgress * Math.PI);
  ctx.globalAlpha = t * o.params.intensity;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, o.W, o.H);
  ctx.globalAlpha = 1;
}});

registerEffect('black_flash', 'transition', { defaultDuration: 0.3, renderFn: function (ctx, o) {
  var t = Math.sin(o.rawProgress * Math.PI);
  ctx.globalAlpha = t * o.params.intensity;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, o.W, o.H);
  ctx.globalAlpha = 1;
}});

registerEffect('zoom_transition', 'transition', { defaultDuration: 0.4, renderFn: function (ctx, o) {
  var t = o.rawProgress;
  if (t < 0.5) {
    var s = 1 + t * 0.5 * o.params.intensity;
    ctx.translate(o.W / 2, o.H / 2);
    ctx.scale(s, s);
    ctx.translate(-o.W / 2, -o.H / 2);
    ctx.globalAlpha = 1 - t * 2;
  } else {
    var s2 = 1 + (1 - t) * 0.5 * o.params.intensity;
    ctx.translate(o.W / 2, o.H / 2);
    ctx.scale(s2, s2);
    ctx.translate(-o.W / 2, -o.H / 2);
    ctx.globalAlpha = (t - 0.5) * 2;
  }
}});

registerEffect('whip_cut', 'transition', { defaultDuration: 0.25, renderFn: function (ctx, o) {
  var t = Math.sin(o.rawProgress * Math.PI);
  var blur = t * 10 * o.params.intensity;
  var off = t * o.W * 0.05 * o.params.intensity;
  if (typeof ctx.filter !== 'undefined') {
    ctx.filter = 'blur(' + blur + 'px)';
  }
  ctx.translate(off, 0);
}});

registerEffect('glitch_cut', 'transition', { defaultDuration: 0.3, renderFn: function (ctx, o) {
  var t = o.rawProgress;
  if (t > 0.3 && t < 0.7) {
    var shift = (Math.random() - 0.5) * 15 * o.params.intensity;
    var sliceH = 5 + Math.random() * 20;
    var sliceY = Math.random() * o.H;
    ctx.translate(shift, 0);
  }
}});

registerEffect('slide_left', 'transition', { defaultDuration: 0.4, renderFn: function (ctx, o) {
  var t = fxEase(o.rawProgress, 'easeOutQuad');
  var off = (1 - t) * o.W * 0.15 * o.params.intensity;
  ctx.translate(-off, 0);
}});

registerEffect('slide_right', 'transition', { defaultDuration: 0.4, renderFn: function (ctx, o) {
  var t = fxEase(o.rawProgress, 'easeOutQuad');
  var off = (1 - t) * o.W * 0.15 * o.params.intensity;
  ctx.translate(off, 0);
}});

registerEffect('push_up', 'transition', { defaultDuration: 0.4, renderFn: function (ctx, o) {
  var t = fxEase(o.rawProgress, 'easeOutQuad');
  var off = (1 - t) * o.H * 0.15 * o.params.intensity;
  ctx.translate(0, -off);
}});

registerEffect('morph_dissolve', 'transition', { defaultDuration: 0.6, renderFn: function (ctx, o) {
  var t = Math.sin(o.rawProgress * Math.PI);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = t * o.params.intensity * 0.3;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, o.W, o.H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}});

// ─── Section 11 — Brand/info effect render functions (8) ───────────────────

registerEffect('lower_third', 'brand', { defaultDuration: 1.0, renderFn: function (ctx, o) {
  var t = fxEase(fxClamp(o.rawProgress / 0.4, 0, 1), 'easeOutQuad');
  var barH = o.H * 0.12;
  var barY = o.H - barH - o.H * 0.05;
  var barW = t * o.W * 0.7 * o.params.intensity;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, barY, barW, barH);
  ctx.fillStyle = o.params.color || 'rgba(120,220,255,0.9)';
  ctx.fillRect(0, barY, 3, barH);
}});

registerEffect('chapter_card', 'brand', { defaultDuration: 1.5, renderFn: function (ctx, o) {
  var t = fxEase(fxClamp(o.rawProgress / 0.3, 0, 1), 'easeOutQuad');
  ctx.globalAlpha = Math.sin(o.rawProgress * Math.PI) * o.params.intensity * 0.85;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  var pad = o.W * 0.1;
  ctx.fillRect(pad, o.H * 0.3, o.W - pad * 2, o.H * 0.4);
  ctx.globalAlpha = 1;
}});

registerEffect('progress_bar', 'brand', { defaultDuration: 0, renderFn: function (ctx, o) {
  var barH = 4;
  var barY = o.H - barH - 3;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(0, barY, o.W, barH);
  ctx.fillStyle = o.params.color || 'rgba(120,220,255,0.8)';
  ctx.fillRect(0, barY, o.rawProgress * o.W, barH);
}});

registerEffect('countdown_timer', 'brand', { defaultDuration: 0, renderFn: function (ctx, o) {
  var remaining = Math.ceil((1 - o.rawProgress) * 10);
  remaining = Math.max(1, remaining);
  ctx.globalAlpha = 0.8 * o.params.intensity;
  ctx.font = 'bold ' + Math.round(o.H * 0.08) + 'px JetBrains Mono, monospace';
  ctx.fillStyle = o.params.color || 'rgba(120,220,255,0.9)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(String(remaining), o.W - 20, 20);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}});

registerEffect('logo_sting', 'brand', { defaultDuration: 1.0, renderFn: function (ctx, o) {
  var t = fxEase(fxClamp(o.rawProgress / 0.5, 0, 1), 'easeOutQuad');
  var scale = 0.3 + 0.7 * t;
  var alpha = Math.sin(o.rawProgress * Math.PI) * o.params.intensity;
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(o.W * 0.85, o.H * 0.1);
  ctx.scale(scale, scale);
  ctx.fillStyle = o.params.color || 'rgba(120,220,255,0.6)';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('LOGO', -20, 0);
  ctx.globalAlpha = 1;
}});

registerEffect('call_to_action_badge', 'brand', { defaultDuration: 0.8, renderFn: function (ctx, o) {
  var t = fxEase(fxClamp(o.rawProgress / 0.3, 0, 1), 'easeOutQuad');
  var overshoot = 1 + Math.sin(fxClamp((o.rawProgress - 0.3) / 0.7, 0, 1) * Math.PI) * 0.1;
  var scale = t * overshoot;
  var bx = o.W * 0.7;
  var by = o.H * 0.85;
  ctx.globalAlpha = fxClamp(t * 2, 0, 1) * o.params.intensity;
  ctx.translate(bx, by);
  ctx.scale(scale, scale);
  ctx.fillStyle = o.params.color || 'rgba(120,220,255,0.9)';
  ctx.font = 'bold 14px Poppins, sans-serif';
  ctx.fillText('CTA', -15, 0);
  ctx.globalAlpha = 1;
}});

registerEffect('social_handle', 'brand', { defaultDuration: 0.6, renderFn: function (ctx, o) {
  var t = fxEase(fxClamp(o.rawProgress / 0.4, 0, 1), 'easeOutQuad');
  var slideX = (1 - t) * 60;
  ctx.globalAlpha = fxClamp(t * 1.5, 0, 1) * o.params.intensity;
  ctx.font = '12px JetBrains Mono, monospace';
  ctx.fillStyle = o.params.color || 'rgba(255,255,255,0.8)';
  ctx.textBaseline = 'bottom';
  ctx.fillText('@handle', 20 + slideX, o.H - 20);
  ctx.globalAlpha = 1;
}});

registerEffect('watermark', 'brand', { defaultDuration: 0, renderFn: function (ctx, o) {
  ctx.globalAlpha = (0.12 + Math.sin(o.rawProgress * Math.PI * 2) * 0.03) * o.params.intensity;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.fillStyle = o.params.color || 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('WATERMARK', o.W - 10, o.H - 10);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}});

// ─── Section 12 — Reaction effect render functions (6) ─────────────────────

registerEffect('emoji_burst', 'reaction', { defaultDuration: 1.0, renderFn: function (ctx, o) {
  var N = 8;
  var emojis = ['🔥', '❤️', '⭐', '👏', '😂', '🎉', '💯', '✨'];
  var t = o.rawProgress;
  for (var i = 0; i < N; i++) {
    var angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    var dist = t * 60 * o.params.intensity;
    var x = o.W / 2 + Math.cos(angle) * dist;
    var y = o.H / 2 + Math.sin(angle) * dist - t * 40;
    var alpha = (1 - t) * o.params.intensity;
    if (alpha <= 0) continue;
    ctx.globalAlpha = Math.max(0, alpha);
    var sz = 16 + i * 2;
    ctx.font = sz + 'px sans-serif';
    ctx.fillText(emojis[i % emojis.length], x, y);
  }
  ctx.globalAlpha = 1;
}});

registerEffect('star_rating', 'reaction', { defaultDuration: 0.8, renderFn: function (ctx, o) {
  var N = 5;
  var filled = Math.ceil(o.rawProgress * N * o.params.intensity);
  var sz = 18;
  var totalW = N * (sz + 4);
  var startX = (o.W - totalW) / 2;
  var y = o.H * 0.15;
  for (var i = 0; i < N; i++) {
    var x = startX + i * (sz + 4);
    ctx.globalAlpha = 0.9;
    ctx.font = sz + 'px sans-serif';
    ctx.fillText(i < filled ? '★' : '☆', x, y);
  }
  ctx.globalAlpha = 1;
}});

registerEffect('checkmark_draw', 'reaction', { defaultDuration: 0.6, renderFn: function (ctx, o) {
  var t = fxEase(o.rawProgress, 'easeOutQuad');
  var cx = o.W / 2;
  var cy = o.H * 0.35;
  var sz = 20 * o.params.intensity;
  ctx.strokeStyle = o.params.color || 'rgba(34,197,94,0.9)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (t < 0.5) {
    var ft = t / 0.5;
    ctx.moveTo(cx - sz * 0.4, cy);
    ctx.lineTo(cx - sz * 0.4 + (sz * 0.5) * ft, cy + sz * 0.5 * ft);
  } else {
    var ft2 = (t - 0.5) / 0.5;
    ctx.moveTo(cx - sz * 0.4, cy);
    ctx.lineTo(cx + sz * 0.1, cy + sz * 0.5);
    ctx.lineTo(cx + sz * 0.1 + sz * 0.5 * ft2, cy + sz * 0.5 - sz * 0.7 * ft2);
  }
  ctx.stroke();
}});

registerEffect('cross_draw', 'reaction', { defaultDuration: 0.4, renderFn: function (ctx, o) {
  var t = fxEase(o.rawProgress, 'easeOutQuad');
  var cx = o.W / 2;
  var cy = o.H * 0.35;
  var sz = 15 * o.params.intensity;
  ctx.strokeStyle = o.params.color || 'rgba(239,68,68,0.9)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (t < 0.5) {
    var ft = t / 0.5;
    ctx.moveTo(cx - sz, cy - sz);
    ctx.lineTo(cx - sz + sz * 2 * ft, cy - sz + sz * 2 * ft);
  } else {
    var ft2 = (t - 0.5) / 0.5;
    ctx.moveTo(cx + sz, cy - sz);
    ctx.lineTo(cx + sz - sz * 2 * ft2, cy - sz + sz * 2 * ft2);
  }
  ctx.stroke();
}});

registerEffect('exclamation_pulse', 'reaction', { defaultDuration: 0.5, renderFn: function (ctx, o) {
  var t = o.rawProgress;
  var pulse = 1 + Math.sin(t * Math.PI * 4) * 0.15 * o.params.intensity * (1 - t);
  var cx = o.W / 2;
  var cy = o.H * 0.35;
  ctx.globalAlpha = fxClamp(t * 3, 0, 1) * o.params.intensity;
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = o.params.color || 'rgba(245,158,11,0.9)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 0, 0);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}});

registerEffect('like_heart_float', 'reaction', { defaultDuration: 1.2, renderFn: function (ctx, o) {
  var N = 6;
  var t = o.rawProgress;
  for (var i = 0; i < N; i++) {
    var delay = i * 0.1;
    var lt = fxClamp((t - delay) / (1 - delay), 0, 1);
    if (lt <= 0) continue;
    var x = o.W / 2 + (Math.sin(i * 1.7) * 30 * o.params.intensity);
    var y = o.H * 0.5 - lt * o.H * 0.3;
    var alpha = (1 - lt) * o.params.intensity;
    if (alpha <= 0) continue;
    ctx.globalAlpha = Math.max(0, alpha);
    var sz = 14 + i * 2;
    ctx.font = sz + 'px serif';
    ctx.fillText('❤', x, y);
  }
  ctx.globalAlpha = 1;
}});

// ─── Section 13 — Audio-reactive effect render functions (5) ───────────────

registerEffect('beat_zoom', 'audio_reactive', { defaultDuration: 0, renderFn: function (ctx, o) {
  var beat = Math.abs(Math.sin(o.currentTime * Math.PI * 2));
  var scale = 1 + beat * 0.04 * o.params.intensity;
  ctx.translate(o.W / 2, o.H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-o.W / 2, -o.H / 2);
}});

registerEffect('beat_flash', 'audio_reactive', { defaultDuration: 0, renderFn: function (ctx, o) {
  var beat = Math.abs(Math.sin(o.currentTime * Math.PI * 4));
  ctx.globalAlpha = beat * 0.15 * o.params.intensity;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, o.W, o.H);
  ctx.globalAlpha = 1;
}});

registerEffect('waveform_overlay', 'audio_reactive', { defaultDuration: 0, renderFn: function (ctx, o) {
  var N = 32;
  var barW = o.W / N;
  var maxH = o.H * 0.08;
  ctx.fillStyle = o.params.color || 'rgba(120,220,255,0.4)';
  for (var i = 0; i < N; i++) {
    var val = Math.abs(Math.sin(o.currentTime * 3 + i * 0.3)) * o.params.intensity;
    var h = val * maxH;
    ctx.fillRect(i * barW + 1, o.H - h, barW - 2, h);
  }
}});

registerEffect('bass_shake', 'audio_reactive', { defaultDuration: 0, renderFn: function (ctx, o) {
  var bass = Math.abs(Math.sin(o.currentTime * Math.PI * 2));
  var mag = bass * 3 * o.params.intensity;
  ctx.translate(
    (Math.random() - 0.5) * mag * 2,
    (Math.random() - 0.5) * mag * 2
  );
}});

registerEffect('audio_bars', 'audio_reactive', { defaultDuration: 0, renderFn: function (ctx, o) {
  var N = 16;
  var barW = o.W / N;
  var maxH = o.H * 0.12;
  var barY = o.H - 4;
  for (var i = 0; i < N; i++) {
    var val = Math.abs(Math.sin(o.currentTime * 5 + i * 0.5)) * o.params.intensity;
    var h = val * maxH;
    var r = Math.floor(120 + val * 135);
    var g = Math.floor(220 - val * 80);
    var b = 255;
    ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.6)';
    ctx.fillRect(i * barW + 2, barY - h, barW - 4, h);
  }
}});

// ─── Section 14 — Public API export ────────────────────────────────────────
window.VideoEffects = {
  EFFECT_REGISTRY: EFFECT_REGISTRY,
  FX_CATEGORIES: FX_CATEGORIES,
  drawVideoEffects: drawVideoEffects,
  renderEffectsToCanvas: renderEffectsToCanvas,
  getOrCreateOverlay: getOrCreateOverlay,
  destroyOverlay: destroyOverlay,
  resolveBbox: resolveBbox,
  registerEffect: registerEffect,
};

window.generateAnimationPlan = function (scene, vid) {
  return new Promise(function (resolve) {
    var dur = vid.duration || scene.durationSec || 5;
    var existingEffects = (vid.effectInstances || []).map(function (fx) { return fx.effectType; });
    var textEffects = [];
    var overlayEffects = [];
    for (var k in EFFECT_REGISTRY) {
      if (existingEffects.indexOf(k) >= 0) continue;
      if (EFFECT_REGISTRY[k].category === 'text' && textEffects.length < 2) textEffects.push(k);
      if (EFFECT_REGISTRY[k].category === 'overlay' && overlayEffects.length < 1) overlayEffects.push(k);
    }
    var segments = [];
    if (textEffects.length > 0) {
      segments.push({ startS: 0, endS: Math.min(dur * 0.4, 3), type: 'talking_head', animations: [textEffects[0]] });
    }
    if (overlayEffects.length > 0) {
      segments.push({ startS: Math.max(0, dur * 0.5), endS: dur, type: 'b_roll', animations: [overlayEffects[0]] });
    }
    vid.animationPlan = { generatedAt: Date.now(), segments: segments };
    if (window._actions && window._actions.triggerSave) window._actions.triggerSave();
    resolve(vid.animationPlan);
  });
};

})();