# Quick Reel — Complete Engineering Plan
**Last updated:** 2026-04-27

---

## 0. What Quick Reel Is

A simplified photo-to-reel creator targeting casual Instagram/TikTok users.

```
5 seconds  = 1 photo
10 seconds = 2 photos
15 seconds = 3 photos
```

User uploads photos → AI analyses them → AI decides hook text, voiceover, motion, effects → output is a ready-to-post reel. Zero manual decisions required.

**Differentiator vs Snapchat/CapCut:** Snapchat applies effects blindly. Quick Reel uses Gemini Vision to READ the photo content and contextually decide everything — hook, motion, effects, narration, narrative arc across photos.

**Cost per reel:** Gemini Vision + TTS + analysis ≈ $0.002. Kling (optional premium) ≈ $0.15–0.20 per clip.

---

## 1. Architecture

### 1.1 New Files

```
js/27-qr-allowlists.js    — All ALLOWED_* maps, conflict table, defaults, WebGL detection
js/28-qr-interpreter.js   — interpretAIResult(), beat sync, AI async pipeline, Gemini prompt
js/29-qr-renderers.js     — All new render functions (distortion, particles, WebGL, etc.)
js/30-quickreel.js        — Route, qrProject state, pipeline orchestrator, UI, export
```

Loaded in `loadEditorScripts()` in `index.html`, after `js/25-photopilot-fx.js`, before `js/24-photopilot.js`.

### 1.2 Reused Infrastructure (no modification)

| Concern | File | Entry point |
|---|---|---|
| Gemini API | `js/17a-create-api.js` | `callGeminiAPI(models, body, key)` |
| JSON parsing | `js/17c-create-pipeline.js` | `parseGeminiJson(text)` |
| TTS | `js/17c-create-pipeline.js` | `generateTTSGemini(text, voice, key)` |
| Audio decode | `js/17c-create-pipeline.js` | `decodeBase64Audio(b64, mime)` |
| Ken Burns | `js/25-photopilot-fx.js` | `computeKenBurnsPath()`, `drawKenBurnsFrame()` |
| Canvas effects | `js/25-photopilot-fx.js` | `applyInPhotoEffects()`, `COLOR_PRESETS` |
| Transitions | `js/25-photopilot-fx.js` | `PP_TRANSITIONS` |
| Particles (legacy) | `js/25-photopilot-fx.js` | `drawParticles()` |
| Subtitles | `js/20-reels-creator.js` | `renderReelSubtitle()` |
| Export | `js/24-photopilot.js` | `renderToBlob()` pattern |
| Kling API | `js/21-kling.js` | `callKlingAPI()` |

**Rule: `js/24-photopilot.js` and `js/25-photopilot-fx.js` are never modified.**

### 1.3 User Flow

```
Duration pill [5s / 10s / 15s]
        ↓
Photo drop-zone (1 / 2 / 3 slots appear)
        ↓
Upload photos → Generate button activates
        ↓
qrAnalyse()    → Gemini Vision: reads all photos in one call
        ↓
qrTTS()        → Gemini TTS: narrates full voiceover
        ↓
qrWordTimings() → distribute word timestamps across audio
        ↓
Preview renders → phone-frame canvas, real-time
        ↓
Download / Share
```

---

## 2. State Object (`qrProject`)

```js
const qrProject = {
  durationSec:    5,          // 5 | 10 | 15
  photos:         [],         // [{id, src, blob, img, naturalW, naturalH}]
  aiResults:      [],         // per-photo AI analysis JSON (raw Gemini output)
  narrativeArc:   null,       // { arcType, arcDescription }
  hookText:       '',
  voiceoverText:  '',
  audioBuffer:    null,       // decoded TTS AudioBuffer
  words:          [],         // [{word, start, end}] — distributed word timings
  segments:       [],         // [{photoId, startTime, endTime, effects}]
  beatTimes:      [],         // float[] — beat timestamps from OfflineAudioContext
  renderedBlob:   null,
};
```

Photo cap = `durationSec / 5`. Duration pills are the only user control.

---

## 3. Segment Effects Config Shape

Everything Gemini decides ends up in `qrProject.segments[i].effects`. The render loop reads only this — never Gemini output directly.

```js
// qrProject.segments[i].effects — full shape after interpretAIResult() runs
{
  // Motion
  motion: {
    type: 'zoomIn',
    fromRect: null, toRect: null,   // computed by interpretAIResult
    easing: 'easeOutQuad',
    subjectRegion: null,            // {x,y,w,h} normalised 0–1
    parallaxAmt: 0.04,
  },

  // Color grade
  grade: {
    type: 'kodak',
    cssFilter: '',                  // pre-computed CSS string (CSS grades)
    shaderFn: null,                 // function name string (duotone/colorBloom)
    shaderParams: {},
    animated: false,                // true for colorBloom
    bloomDuration: 1.5,
  },

  // Distortion
  distortion: { type: 'none', intensity: 0.5, params: {} },

  // Particles
  particles: { type: 'none', count: 24, params: {} },

  // Transition into this segment
  transition: { type: 'fade', duration: 0.4, params: {} },

  // WebGL (glfx.js)
  webgl: { type: 'none', params: {}, fallback: 'none' },

  // Subject-aware
  subjectFx: { type: 'none', subjectRegion: null, hasHorizon: false, params: {} },

  // Text / caption style
  textStyle: { type: 'wordFade', params: {} },

  // TikTok-native
  tiktokFx: { type: 'none', params: {} },

  // Reveal effects
  revealFx: { type: 'none', params: {} },

  // Generative overlays
  generativeOverlay: { type: 'none', params: {} },

  // AI async effects
  aiEffect: {
    type: 'none',
    status: 'idle',       // 'idle' | 'pending' | 'ready' | 'error'
    resultUrl: null,
    params: {},
  },

  // Arc override (applied last — highest priority)
  arcOverride: { arcType: null, overrides: {} },

  // Overlay draw order (resolved at interpret time)
  overlayDrawOrder: [
    'vignette', 'filmGrain', 'particles', 'generativeOverlay',
    'distortion', 'subjectFx', 'tiktokFx', 'revealFx', 'webglPost', 'letterbox'
  ],

  // ── Legacy bridge fields — keep existing renderFrame() working unchanged ──
  kenBurns: null,
  colorPreset: 'none',
  vignette: 0.3,
  vignettePulse: false,
  filmGrain: 0.15,
  shake: 0,
  zoomPunch: 0,
  transitionIn: 'fade',
  transitionDuration: 0.4,
  frameStyle: 'none',
  particles_legacy: 'none',
  spotlight: { enabled: false, x: 0.5, y: 0.5, radius: 0.35 },
}
```

---

## 4. All Allowlist Maps (`js/27-qr-allowlists.js`)

### 4.1 Motions

```js
const QR_ALLOWED_MOTIONS = {
  // Ken Burns family — delegate to existing computeKenBurnsPath()
  zoomIn:    { family: 'kenburns', direction: 'zoomIn',   intensity: 0.3 },
  zoomOut:   { family: 'kenburns', direction: 'zoomOut',  intensity: 0.3 },
  panLeft:   { family: 'kenburns', direction: 'panLeft',  intensity: 0.3 },
  panRight:  { family: 'kenburns', direction: 'panRight', intensity: 0.3 },
  drift:     { family: 'kenburns', direction: 'panRight', intensity: 0.12 },
  superzoom: { family: 'kenburns', direction: 'zoomIn',   intensity: 0.7 },
  boomerang: { family: 'boomerang' },
  // New
  rackFocus: { family: 'rackFocus',    fromBlur: 12, toBlur: 0, sharpAt: 0.4 },
  '3dZoom':  { family: 'cssTransform', perspective: '600px', fromScale: 0.92, toScale: 1.0 },
  parallax:  { family: 'parallax',     parallaxAmt: 0.04 },
  shake:     { family: 'shake',        intensity: 0.25 },
  pulse:     { family: 'pulse',        pulseHz: 1.0, pulseAmt: 0.025 },
};
```

### 4.2 Color Grades

```js
const QR_ALLOWED_GRADES = {
  // CSS filter strings
  kodak:        { type: 'css', filter: 'contrast(1.05) saturate(1.2) sepia(0.12) brightness(1.02) hue-rotate(-5deg)' },
  fuji:         { type: 'css', filter: 'contrast(1.08) saturate(0.9) brightness(1.04) hue-rotate(8deg)' },
  cinestill:    { type: 'css', filter: 'contrast(1.12) saturate(1.15) brightness(0.95) sepia(0.08)' },
  vintage:      { type: 'css', filter: 'sepia(0.35) saturate(0.75) contrast(0.9) brightness(1.08)' },
  bleachBypass: { type: 'css', filter: 'contrast(1.3) saturate(0.5) brightness(0.92)' },
  bw:           { type: 'css', filter: 'grayscale(1) contrast(1.08)' },
  crossProcess: { type: 'css', filter: 'saturate(1.8) contrast(1.2) hue-rotate(30deg) brightness(0.95)' },
  polaroid:     { type: 'css', filter: 'sepia(0.2) saturate(0.9) contrast(0.95) brightness(1.1)' },
  // OffscreenCanvas pixel shaders
  duotone:    { type: 'shader',          shaderFn: 'qrGradeDuotone',
                defaultParams: { shadowColor: [30,10,80], highlightColor: [255,200,100] } },
  colorBloom: { type: 'animated-shader', shaderFn: 'qrGradeColorBloom',
                defaultParams: { bloomDuration: 1.5, toSaturation: 1.5 } },
};
```

### 4.3 Distortions

```js
const QR_ALLOWED_DISTORTIONS = {
  none:                { type: 'none' },
  glitch:              { renderFn: 'qrDistortGlitch',      params: { sliceCount: 6, rgbOffset: 8, intensity: 0.6 } },
  vhsScanlines:        { renderFn: 'qrDistortVHS',         params: { lineSpacing: 4, alpha: 0.18 } },
  tiltShift:           { renderFn: 'qrDistortTiltShift',   params: { blurRadius: 12, focusCenter: 0.5, focusBand: 0.25 } },
  neonGlow:            { renderFn: 'qrDistortNeonGlow',    params: { blurRadius: 18 } },
  filmFlicker:         { renderFn: 'qrDistortFilmFlicker', params: { brightnessRange: 0.08, shiftPx: 1 } },
  halftone:            { renderFn: 'qrDistortHalftone',    params: { dotRadius: 4, spacing: 8 } },
  chromaticAberration: { renderFn: 'qrDistortChromatic',   params: { offset: 6 } },
};
```

### 4.4 Particles

```js
const QR_ALLOWED_PARTICLES = {
  none:      { count: 0 },
  fireflies: { renderFn: 'qrParticleFireflies', count: 30, params: { glowRadius: 6,  speed: 0.3 } },
  petals:    { renderFn: 'qrParticlePetals',    count: 20, params: { rotateSpeed: 2,  fallSpeed: 0.35 } },
  embers:    { renderFn: 'qrParticleEmbers',    count: 40, params: { riseSpeed: 0.5,  twinkle: true } },
  snow:      { renderFn: 'qrParticleSnow',      count: 60, params: { fallSpeed: 0.2,  drift: 0.1 } },
  leaves:    { renderFn: 'qrParticleLeaves',    count: 18, params: { tumbleSpeed: 1.5 } },
  bubbles:   { renderFn: 'qrParticleBubbles',   count: 25, params: { riseSpeed: 0.4,  popAt: 0.9 } },
  confetti:  { renderFn: 'qrParticleConfetti',  count: 80, params: { gravity: 0.15,   spin: true } },
  smoke:     { renderFn: 'qrParticleSmoke',     count: 15, params: { riseSpeed: 0.25, spread: 0.3, alpha: 0.3 } },
};
```

### 4.5 Transitions

```js
const QR_ALLOWED_TRANSITIONS = {
  // Existing — delegate to PP_TRANSITIONS
  fade:            { family: 'existing', key: 'fade' },
  whiteCrossfade:  { family: 'existing', key: 'whiteCrossfade' },
  whipPan:         { family: 'existing', key: 'whipPan' },
  lightLeak:       { family: 'existing', key: 'lightLeak' },
  iris:            { family: 'existing', key: 'iris' },
  morphBlend:      { family: 'existing', key: 'morphBlend' },
  // New — renderFn in js/29-qr-renderers.js
  displacement:    { renderFn: 'qrTransDisplacement',   params: { noiseScale: 0.05, maxOffset: 40 } },
  shatter:         { renderFn: 'qrTransShatter',         params: { pieces: 16 } },
  inkBleed:        { renderFn: 'qrTransInkBleed',        params: { color: '#111111', spread: 1.5 } },
  fireBurn:        { renderFn: 'qrTransFireBurn',        params: { fromBottom: true } },
  particleDissolve:{ renderFn: 'qrTransParticleDissolve',params: { particleCount: 200 } },
  paintBrushWipe:  { renderFn: 'qrTransPaintBrushWipe',  params: { brushWidth: 0.12, direction: 'left-right' } },
  filmStripRoll:   { renderFn: 'qrTransFilmStripRoll',   params: { strips: 5, direction: 'up' } },
  clockWipe:       { renderFn: 'qrTransClockWipe',       params: { clockwise: true } },
  glitchSwap:      { renderFn: 'qrTransGlitchSwap',      params: { slices: 8, rgbOffset: 10 } },
  rippleReveal:    { renderFn: 'qrTransRippleReveal',    params: { waveCount: 3, amplitude: 0.015 } },
  displacementWipe:{ renderFn: 'qrTransDisplacementWipe',params: { direction: 'right' } },
};
```

### 4.6 WebGL via glfx.js

```js
const QR_ALLOWED_WEBGL = {
  none:         { type: 'none' },
  lensBokeh:    { glfxFn: 'lensBlur',          params: { radius: 15, brightness: 0.75, angle: 0 },          fallback: 'none' },
  zoomBlur:     { glfxFn: 'zoomBlur',          params: { centerX: 0.5, centerY: 0.5, strength: 0.3 },       fallback: 'none' },
  bulge:        { glfxFn: 'bulgePinch',        params: { centerX: 0.5, centerY: 0.5, radius: 200, strength:  0.5 }, fallback: 'none' },
  pinch:        { glfxFn: 'bulgePinch',        params: { centerX: 0.5, centerY: 0.5, radius: 200, strength: -0.5 }, fallback: 'none' },
  swirl:        { glfxFn: 'swirl',             params: { centerX: 0.5, centerY: 0.5, radius: 200, angle: 3 }, fallback: 'none' },
  vibrance:     { glfxFn: 'vibrance',          params: { amount: 0.8 },                                       fallback: 'none' },
  edgeWork:     { glfxFn: 'edgeWork',          params: { radius: 3 },                                         fallback: 'none' },
  ink:          { glfxFn: 'ink',               params: { strength: 0.8 },                                     fallback: 'none' },
  hexPixelate:  { glfxFn: 'hexagonalPixelate', params: { centerX: 0.5, centerY: 0.5, scale: 10 },            fallback: 'halftone' },
  colorHalftone:{ glfxFn: 'colorHalftone',     params: { centerX: 0.5, centerY: 0.5, angle: 0, size: 5 },    fallback: 'halftone' },
  dotScreen:    { glfxFn: 'dotScreen',         params: { centerX: 0.5, centerY: 0.5, angle: 0, size: 5 },    fallback: 'halftone' },
};
```

### 4.7 Subject-Aware Effects

```js
const QR_ALLOWED_SUBJECT_FX = {
  none:         { type: 'none' },
  portraitBlur: { renderFn: 'qrSubjectPortraitBlur', requiresSubject: true,  params: { blurRadius: 14 } },
  colorPop:     { renderFn: 'qrSubjectColorPop',      requiresSubject: true,  params: {} },
  subjectGlow:  { renderFn: 'qrSubjectGlow',          requiresSubject: true,  params: { glowRadius: 0.2, pulseHz: 0.8 } },
  skyOverlay:   { renderFn: 'qrSubjectSkyOverlay',    requiresHorizon: true,  params: { topFraction: 0.35, blendMode: 'multiply' } },
  faceZoom:     { renderFn: 'qrSubjectFaceZoom',      requiresSubject: true,  params: { zoomFactor: 1.15 } },
};
```

### 4.8 Text / Caption Styles *(previously missing)*

```js
const QR_ALLOWED_TEXT_STYLES = {
  // Existing — delegate to renderReelSubtitle()
  wordFade:    { family: 'existing', key: 'word-by-word' },
  // New — renderFn in js/29-qr-renderers.js
  typewriter:  { renderFn: 'qrTextTypewriter',
                 params: { charsPerSec: 20 } },
  kineticFlyIn:{ renderFn: 'qrTextKineticFlyIn',
                 params: { flyDuration: 0.15, easing: 'easeOutCubic' } },
  tiktokPop:   { renderFn: 'qrTextTikTokPop',
                 params: { activePillBg: 'rgba(255,255,255,0.15)', activeScale: 1.15 } },
  headlineSlam:{ renderFn: 'qrTextHeadlineSlam',
                 params: { fontSizeFraction: 0.22, slamDuration: 0.2, holdDuration: 1.3, easing: 'easeOutBack' } },
  // CapCut-style pre-built animated layouts
  boldSplit:   { renderFn: 'qrTextBoldSplit',
                 params: { accentColor: '#FF3B30', splitRatio: 0.4 } },
  sideBar:     { renderFn: 'qrTextSideBar',
                 params: { barColor: '#FF3B30', barWidth: 0.018 } },
  bottomStrip: { renderFn: 'qrTextBottomStrip',
                 params: { bgAlpha: 0.72, stripHeight: 0.14 } },
};
```

**How `interpretAIResult()` routes text style:**

```js
// Step added between Steps 1 and 2 of interpretAIResult()
const textKey = QR_ALLOWED_TEXT_STYLES[geminiOutput.textStyle]
  ? geminiOutput.textStyle
  : QR_EFFECT_DEFAULTS.textStyle;

effects.textStyle = {
  type: textKey,
  ...QR_ALLOWED_TEXT_STYLES[textKey].params,
};

// Legacy bridge: headlineSlam → hook text only (first 1.5s via drawHookText)
// All other styles → subtitle word timing via qrRenderFrame step 16
effects._useAsHook = (textKey === 'headlineSlam');
```

**Render dispatch in `qrRenderFrame()` step 16:**

```js
if (seg.effects._useAsHook && segT < 1.5) {
  drawHookText(ctx, qrProject.hookText, segT, W, H);  // headline slam
} else {
  const styleDef = QR_ALLOWED_TEXT_STYLES[seg.effects.textStyle.type];
  if (styleDef.family === 'existing') {
    renderReelSubtitle(ctx, seg, segT, W, H, reelWords);
  } else {
    window[styleDef.renderFn](ctx, seg, segT, W, H, qrProject.words, seg.effects.textStyle);
  }
}
```

### 4.9 TikTok-Native Effects

```js
const QR_ALLOWED_TIKTOK_FX = {
  none:         { type: 'none' },
  timeWarpScan: { renderFn: 'qrTikTokTimeWarpScan', params: { scanSpeed: 1.0, direction: 'top-to-bottom' } },
  cloneMirror:  { renderFn: 'qrTikTokCloneMirror',  params: { copies: 2, mirrorX: true } },
  halfSketch:   { renderFn: 'qrTikTokHalfSketch',   params: { splitAt: 0.5 } },
};
```

### 4.10 Reveal Effects

```js
const QR_ALLOWED_REVEAL_FX = {
  none:            { type: 'none' },
  textMaskReveal:  { renderFn: 'qrRevealTextMask',  params: { text: 'STORY', fontFamily: 'Anton', revealDur: 0.8 } },
  shapeMaskReveal: { renderFn: 'qrRevealShapeMask', params: { shape: 'circle', revealDur: 0.7 } },
  scanLineReveal:  { renderFn: 'qrRevealScanLine',  params: { direction: 'top-bottom', lineThickness: 4 } },
  spotlightReveal: { renderFn: 'qrRevealSpotlight', params: { fromRadius: 0.05, toRadius: 0.7 } },
};
```

### 4.11 Generative Overlays

```js
const QR_ALLOWED_GENERATIVE = {
  none:      { type: 'none' },
  fire:      { renderFn: 'qrGenFire',      params: { particleCount: 60, riseSpeed: 0.6 } },
  aurora:    { renderFn: 'qrGenAurora',    params: { waveCount: 3, speed: 0.4 } },
  lightning: { renderFn: 'qrGenLightning', params: { branches: 4, strikeIntervalMs: 1200 } },
  starfield: { renderFn: 'qrGenStarfield', params: { starCount: 120, depthLayers: 3 } },
};
```

### 4.12 Beat Sync

```js
const QR_ALLOWED_BEAT_SYNC = {
  none:            { type: 'none' },
  beatPulse:       { renderFn: 'qrBeatPulse',  params: { scaleTo: 1.03, decayMs: 120 } },
  zoomPunchOnBeat: { renderFn: 'qrBeatZoom',   params: { zoomSpike: 0.07, decayMs: 80 } },
  flashWhite:      { renderFn: 'qrBeatFlash',  params: { alpha: 0.55, decayMs: 60 } },
};
```

### 4.13 AI Effects *(Kling added)*

```js
const QR_ALLOWED_AI_FX = {
  none:              { type: 'none' },
  aiAlive:           { type: 'async', fetchFn: '_qrFetchAIAlive',           requiresVideo:       true },
  depthParallax:     { type: 'async', fetchFn: '_qrFetchDepthMap',          requiresDepthMap:    true },
  backgroundReplace: { type: 'async', fetchFn: '_qrFetchBackgroundReplace', requiresMask:        true },
  artStyle:          { type: 'async', fetchFn: '_qrFetchArtStyle',          requiresStyledImage: true },
  // Premium — user must supply own Kling API key
  kling:             { type: 'async', fetchFn: '_qrFetchKling',             requiresVideo:       true,
                       premium: true, requiresKey: 'stori_kling_key' },
};
```

**Kling fetch function:**

```js
async function _qrFetchKling(photo, aiParams, _unused) {
  const klingKey = localStorage.getItem('stori_kling_key');
  if (!klingKey) throw new Error('NO_KLING_KEY');

  // Build motion prompt from AI analysis
  const motionPrompt = [
    aiParams.subjectType || 'subject',
    'in', aiParams.mood || 'cinematic', 'mood,',
    aiParams.suggestedMotion || 'slow camera movement,',
    '5 seconds, smooth, high quality'
  ].join(' ');

  // callKlingAPI is defined in js/21-kling.js (already integrated)
  const result = await callKlingAPI({
    image:          photo.src,          // base64 data URL
    prompt:         motionPrompt,
    duration:       5,
    aspectRatio:    '9:16',
    apiKey:         klingKey,
  });

  // Kling returns a video URL — fetch it as a blob
  const resp = await fetch(result.videoUrl);
  if (!resp.ok) throw new Error('Kling video download failed');
  return await resp.blob();
}
```

**interpretAIResult() routing for Kling:**

```js
// In Step 1 (allowlist validation) — Kling requires key check at interpret time
if (aiKey === 'kling') {
  const hasKlingKey = !!localStorage.getItem('stori_kling_key');
  if (!hasKlingKey) {
    console.debug('[QR] kling requested but no key — falling back to aiAlive');
    aiKey = QR_GLFX_AVAILABLE ? 'aiAlive' : 'none';
  }
}
```

### 4.14 Narrative Arcs

```js
const QR_ALLOWED_NARRATIVE_ARCS = {
  'none':            { applyFn: null },
  'before-after':    { applyFn: 'qrArcBeforeAfter' },
  'journey':         { applyFn: 'qrArcJourney' },
  'problem-moment':  { applyFn: 'qrArcProblemMoment' },
  'showcase':        { applyFn: 'qrArcShowcase' },
  'countdown':       { applyFn: 'qrArcCountdown' },
  'transformation':  { applyFn: 'qrArcTransformation' },
  'reveal':          { applyFn: 'qrArcReveal' },
  'emotional-peak':  { applyFn: 'qrArcEmotionalPeak' },
};
```

Arc override behaviour per type:

| Arc | Photo 1 | Photo 2 | Photo 3 | Transition |
|---|---|---|---|---|
| before-after | bleachBypass + vignette | colorBloom + lightLeak | — | whiteCrossfade |
| journey | vintage + filmGrain | kodak + filmGrain | fuji | whipPan → lightLeak |
| problem-moment | cinestill + vignette | kodak + lightLeak | — | lightLeak |
| showcase | clean (no grade) | same | same | whiteCrossfade |
| countdown | high-energy grade | superzoom + glitch | flashWhite beat | glitchSwap |
| transformation | bw | crossProcess | colorBloom | glitchSwap → paintBrushWipe |
| reveal | spotlightReveal | scanLineReveal | full reveal | rippleReveal |
| emotional-peak | calm (vintage) | subjectGlow + lightLeak peak | calm (fuji) | lightLeak in + out |

### 4.15 Conflict Table

```js
const QR_EFFECT_CONFLICTS = [
  { slot: 'webgl',      types: ['lensBokeh'],    blocks: ['subjectFx'],  blockedTypes: ['portraitBlur'] },
  { slot: 'distortion', types: ['tiltShift'],    blocks: ['subjectFx'],  blockedTypes: ['portraitBlur'] },
  { slot: 'subjectFx',  types: ['colorPop'],     blocks: ['grade'],      blockedTypes: ['bw','bleachBypass','duotone'] },
  { slot: 'distortion', types: ['halftone'],     blocks: ['webgl'],      blockedTypes: ['hexPixelate','dotScreen','colorHalftone'] },
  { slot: 'distortion', types: ['filmFlicker'],  blocks: ['grade'],      blockedTypes: ['colorBloom'] },
  { slot: 'aiEffect',   types: ['aiAlive','kling'], blocks: ['distortion','webgl','tiktokFx','subjectFx','revealFx'] },
];
```

### 4.16 Defaults

```js
const QR_EFFECT_DEFAULTS = {
  motion:           'zoomIn',
  grade:            'kodak',
  distortion:       'none',
  particles:        'none',
  transition:       'fade',
  webgl:            'none',
  subjectFx:        'none',
  textStyle:        'wordFade',
  tiktokFx:         'none',
  revealFx:         'none',
  generativeOverlay:'none',
  aiEffect:         'none',
  beatSync:         'none',
  narrativeArc:     'none',
  vignette:         0.3,
  filmGrain:        0.15,
  zoomPunch:        0.0,
  transitionDuration: 0.4,
  spotlight:        false,
};
```

---

## 5. `interpretAIResult()` — 9 Steps

```
Step 1  Allowlist validation
        Every Gemini field looked up in QR_ALLOWED_* maps.
        Invalid value → silently replaced with QR_EFFECT_DEFAULTS.
        Kling → check localStorage for key, fallback to aiAlive or none.
        WebGL → check QR_GLFX_AVAILABLE, fallback to Canvas distortion equivalent.

Step 2  subjectRegion extraction
        Gemini returns {x,y,w,h} normalised 0–1.
        Copied to motion.subjectRegion and subjectFx.subjectRegion.
        Missing → default {x:0.3, y:0.2, w:0.4, h:0.6}.

Step 3  Conflict resolution
        Walk QR_EFFECT_CONFLICTS.
        For each firing rule → zero out blocked slot (type = 'none').
        Log at console.debug level.

Step 4  Motion path computation
        kenburns family → computeKenBurnsPath() (existing, from 25-photopilot-fx.js).
        Result stored in motion.fromRect / motion.toRect AND effects.kenBurns (legacy).

Step 5  Grade expansion
        CSS grades → pre-compute cssFilter string, stored in grade.cssFilter AND effects.colorPreset.
        Shader grades → store shaderFn name and shaderParams.

Step 6  Text style resolution
        Validate textStyle against QR_ALLOWED_TEXT_STYLES.
        Set effects._useAsHook = true if headlineSlam (hook rendered first 1.5s).
        All other styles → subtitle word-timing path.

Step 7  Transition consolidation
        Existing transition → set effects.transitionIn = key (legacy).
        New transition → set effects.transitionIn = '__qr_custom__'.

Step 8  Narrative arc overlay
        Look up arc's applyFn in QR_ALLOWED_NARRATIVE_ARCS.
        Call applyFn(segIndex, totalSegments, resolvedEffects, projectMeta).
        Merge returned overrides LAST (highest priority).

Step 9  Legacy bridge population
        effects.kenBurns           ← from motion (if kenburns family)
        effects.colorPreset        ← from grade.cssFilter key mapping
        effects.vignette           ← from geminiOutput.vignette or default
        effects.filmGrain          ← from geminiOutput.filmGrain or default
        effects.shake              ← from motion type === 'shake'
        effects.transitionIn       ← existing key or '__qr_custom__'
        effects.transitionDuration ← from geminiOutput or default
        effects.particles_legacy   ← only for hearts/dust/sparkle (old system)
        effects.spotlight          ← from geminiOutput.spotlight + subjectRegion center
```

---

## 6. Render Loop — `qrRenderFrame()` Draw Order

```
 1.  Clear canvas
 2.  CSS color grade (ctx.filter before drawImage)
 3.  Motion effect
       kenburns family  → drawKenBurnsFrame() [existing]
       boomerang        → drawKenBurnsFrame() with mirrored segT
       rackFocus        → drawKenBurnsFrame() + ctx.filter blur interpolation
       cssTransform     → CSS transform on wrapper div (no canvas pixels)
       parallax         → two drawImage passes at different speeds
       shake            → applyShakeTransform() [existing] + drawKenBurnsFrame()
       pulse            → ctx.scale with sine wave, drawKenBurnsFrame()
 4.  ctx.filter = 'none'  (reset after motion)
 5.  Shader grade (duotone / colorBloom) → OffscreenCanvas pass, drawImage back
 6.  Vignette + spotlight [existing applyInPhotoEffects()]
 7.  Film grain [existing]
 8.  Distortion → dispatch to QR_ALLOWED_DISTORTIONS[type].renderFn
 9.  Subject-aware effects → dispatch to QR_ALLOWED_SUBJECT_FX[type].renderFn
10.  TikTok FX → dispatch to QR_ALLOWED_TIKTOK_FX[type].renderFn
11.  Reveal FX (only if segT < revealFx.params.revealDur)
12.  Particles
       legacy types (hearts/dust/sparkle) → drawParticles() [existing]
       new types → dispatch to QR_ALLOWED_PARTICLES[type].renderFn
13.  Generative overlay → dispatch to QR_ALLOWED_GENERATIVE[type].renderFn
14.  WebGL post-process (if QR_GLFX_AVAILABLE && webgl.type !== 'none')
       → qrWebGLProcess(seg.effects.webgl, mainCanvas)
15.  AI async effect
       status='ready'   → dispatch to QR_ALLOWED_AI_FX[type].renderFn
       status='pending' → qrDrawAIPendingIndicator(ctx, W, H)
       status='error'   → qrDrawAIErrorBadge(ctx, W, H)
16.  Beat sync → qrApplyBeatSync(ctx, W, H, currentTime)
17.  Transitions
       transitionIn !== '__qr_custom__' → PP_TRANSITIONS[key]() [existing]
       transitionIn === '__qr_custom__' → dispatch to QR_ALLOWED_TRANSITIONS[type].renderFn
18.  Text / caption
       _useAsHook && segT < 1.5 → drawHookText() (headline slam)
       existing style            → renderReelSubtitle() [existing]
       new style                 → dispatch to QR_ALLOWED_TEXT_STYLES[type].renderFn
19.  Frame decoration [existing]
```

---

## 7. WebGL Routing

```js
// Feature detection — cached at module load
const QR_WEBGL_AVAILABLE = (function() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
              || document.createElement('canvas').getContext('webgl');
    return !!gl;
  } catch(e) { return false; }
})();

const QR_GLFX_AVAILABLE = QR_WEBGL_AVAILABLE && typeof fx !== 'undefined';
```

Single persistent `_qrGlfxCanvas` — created once on first use. All 11 glfx effects call `qrWebGLProcess()` which draws to the glfx canvas and copies result back to the main canvas via `drawImage`.

**iOS Safari:** `OES_texture_float` available on A12+ (iOS 14+). Older devices → `QR_GLFX_AVAILABLE = false` → Canvas fallbacks run silently.

---

## 8. Beat Sync System

Project-level, not per-segment:

```js
const qrBeatSyncState = {
  beatTimes: [],           // float[] seconds — from detectBeatTimes()
  beatStyle: 'none',       // 'beatPulse' | 'zoomPunchOnBeat' | 'flashWhite'
  lastBeatIndex: -1,
  activeEffectEndTime: 0,
};
```

**Detection:** `OfflineAudioContext` → highpass filter at 150Hz → energy per 512-sample frame → adaptive threshold (local mean + 1.5σ) → peak picking, min 300ms interval.

**Dispatch (step 16 of qrRenderFrame):**
- `beatPulse` → CSS scale on canvas wrapper via wrapper.style.transform
- `zoomPunchOnBeat` → ctx.scale spike with decay
- `flashWhite` → ctx.fillRect rgba(255,255,255,α) with decay

---

## 9. AI Async Effects — Two-Phase Slot Pattern

```
Launch:  qrLaunchAIEffect(seg, photo, key)
         → sets aiEffect.status = 'pending'
         → fires fetch (Gemini or Kling)
         → on success: status = 'ready', resultUrl = blob URL
         → on failure: status = 'error'

Render loop step 15:
         ready   → render function draws result (video element or image)
         pending → spinner overlay, normal photo underneath
         error   → small badge, normal photo continues
```

All fetches call external APIs directly from browser (`callGeminiAPI()` or `callKlingAPI()`). No Stori server involved.

---

## 10. Full Gemini Prompt Template

```
You are a visual effects director for short-form vertical video.
Analyze each photo and return a JSON configuration for animating it.
Return ONLY valid JSON. No markdown, no code fences, no explanation.
Every value MUST come from the allowed lists. Invalid values are ignored.

ALLOWED VALUES (case-sensitive):

motion:            "zoomIn"|"zoomOut"|"panLeft"|"panRight"|"drift"|"superzoom"|"boomerang"|
                   "rackFocus"|"3dZoom"|"parallax"|"shake"|"pulse"

colorGrade:        "kodak"|"fuji"|"cinestill"|"vintage"|"bleachBypass"|"bw"|
                   "crossProcess"|"polaroid"|"duotone"|"colorBloom"

distortion:        "none"|"glitch"|"vhsScanlines"|"tiltShift"|"neonGlow"|
                   "filmFlicker"|"halftone"|"chromaticAberration"

suggestedParticles:"none"|"fireflies"|"petals"|"embers"|"snow"|"leaves"|
                   "bubbles"|"confetti"|"smoke"

transition:        "fade"|"whiteCrossfade"|"whipPan"|"lightLeak"|"iris"|"morphBlend"|
                   "displacement"|"shatter"|"inkBleed"|"fireBurn"|"particleDissolve"|
                   "paintBrushWipe"|"filmStripRoll"|"clockWipe"|"glitchSwap"|
                   "rippleReveal"|"displacementWipe"

webglEffect:       "none"|"lensBokeh"|"zoomBlur"|"bulge"|"pinch"|"swirl"|"vibrance"|
                   "edgeWork"|"ink"|"hexPixelate"|"colorHalftone"|"dotScreen"

subjectFx:         "none"|"portraitBlur"|"colorPop"|"subjectGlow"|"skyOverlay"|"faceZoom"

textStyle:         "wordFade"|"typewriter"|"kineticFlyIn"|"tiktokPop"|"headlineSlam"|
                   "boldSplit"|"sideBar"|"bottomStrip"

tiktokFx:          "none"|"timeWarpScan"|"cloneMirror"|"halfSketch"

revealFx:          "none"|"textMaskReveal"|"shapeMaskReveal"|"scanLineReveal"|"spotlightReveal"

generativeOverlay: "none"|"fire"|"aurora"|"lightning"|"starfield"

aiEffect:          "none"|"aiAlive"|"depthParallax"|"backgroundReplace"|"artStyle"|"kling"

narrativeArc:      "none"|"before-after"|"journey"|"problem-moment"|"showcase"|
                   "countdown"|"transformation"|"reveal"|"emotional-peak"

beatSyncStyle:     "none"|"beatPulse"|"zoomPunchOnBeat"|"flashWhite"

MATCHING RULES:

motion:
  face/portrait, subject centred            → "rackFocus"
  wide landscape, horizontal               → "panLeft" or "panRight"
  architecture, tall subject               → "zoomIn"
  product close-up                         → "superzoom"
  action/sports                            → "shake" or "pulse"
  visible foreground + background (depth)  → "parallax"
  group photo, candid                      → "drift"
  still life                               → "zoomOut"
  multiple fast-moving elements            → "boomerang"

colorGrade:
  golden-hour, warm light                  → "kodak"
  cool daylight, urban                     → "fuji"
  night, candles, film-look               → "cinestill"
  aged, nostalgic                          → "vintage" or "polaroid"
  dark, moody                              → "bleachBypass"
  already black-and-white                  → "bw"
  experimental, pop art                    → "crossProcess"
  portrait needing emphasis                → "colorBloom"
  abstract, artistic                       → "duotone"
  already professionally graded            → "none" (set skipGrade: true)

suggestedParticles:
  nature, forest, park                     → "leaves" or "fireflies"
  winter, cold                             → "snow"
  fire, warm, dramatic                     → "embers"
  celebration, event                       → "confetti"
  underwater, water theme                  → "bubbles"
  romantic, dreamy                         → "petals"
  misty, mysterious                        → "smoke"
  default                                  → "none"

transition (multi-photo only):
  same subject/location as previous        → "morphBlend" or "fade"
  big location change                      → "whipPan" or "glitchSwap"
  emotional peak                           → "lightLeak"
  fast energetic cut                       → "whiteCrossfade"
  dramatic reveal                          → "rippleReveal" or "paintBrushWipe"
  dark/moody sequence                      → "inkBleed" or "fireBurn"
  time-lapse, countdown feel               → "filmStripRoll" or "clockWipe"

textStyle:
  hook text, short punchy line             → "headlineSlam"
  conversational narration                 → "wordFade" or "typewriter"
  high-energy, fast-paced                  → "kineticFlyIn" or "tiktokPop"
  product / clean showcase                 → "boldSplit" or "bottomStrip"

subjectFx:
  clear person, distracting background     → "portraitBlur"
  colourful subject, muted background      → "colorPop"
  hero product or person                   → "subjectGlow"
  outdoor, sky visible (horizon)           → "skyOverlay"
  face close-up wanted                     → "faceZoom"

narrativeArc (multi-photo — analyse all together):
  contrasting halves (before/after)        → "before-after"
  travel, journey, progression             → "journey"
  problem then resolution                  → "problem-moment"
  product or portfolio showcase            → "showcase"
  building to single climax                → "emotional-peak"
  visual transformation (style change)     → "transformation"
  mystery to revelation                    → "reveal"
  reverse energy build                     → "countdown"

beatSyncStyle (only if project has BGM):
  upbeat, pop                              → "beatPulse"
  hip-hop, trap                            → "zoomPunchOnBeat"
  EDM, festival                            → "flashWhite"
  calm, ambient                            → "none"

OUTPUT FORMAT — return exactly this JSON.
Single photo:
{
  "motion": "zoomIn",
  "colorGrade": "kodak",
  "distortion": "none",
  "suggestedParticles": "none",
  "transition": "fade",
  "webglEffect": "none",
  "subjectFx": "none",
  "textStyle": "wordFade",
  "tiktokFx": "none",
  "revealFx": "none",
  "generativeOverlay": "none",
  "aiEffect": "none",
  "subjectRegion": {"x": 0.2, "y": 0.1, "w": 0.6, "h": 0.75},
  "hasHorizon": false,
  "vignette": 0.3,
  "filmGrain": 0.15,
  "zoomPunch": 0.0,
  "transitionDuration": 0.4,
  "spotlight": false,
  "skipGrade": false
}

Multi-photo:
{
  "narrativeArc": "journey",
  "beatSyncStyle": "beatPulse",
  "segments": [
    { ...single-photo shape for photo 0... },
    { ...single-photo shape for photo 1... }
  ]
}
```

---

## 11. Phased Build Order

### Phase 1 — Core loop, end-to-end (Weeks 1–3)

| # | Work item | File |
|---|---|---|
| 1 | Add `quickreel` route to `navigateTo()` | `01-core.js` |
| 2 | Add `#quick-reel-page` + header shell to HTML | `index.html` |
| 3 | Landing page card with `[5s] [10s] [15s]` duration pills | `index.html` |
| 4 | `qrProject` state object + photo drop-zone (1/2/3 slots) | `30-quickreel.js` |
| 5 | `js/27-qr-allowlists.js` — full file: all maps, conflict table, defaults, WebGL detection | `27-qr-allowlists.js` |
| 6 | `js/28-qr-interpreter.js` — `interpretAIResult()` Steps 1–9, Gemini prompt template | `28-qr-interpreter.js` |
| 7 | `qrAnalyse()` — Gemini Vision call + `qrApplyAIResults()` | `30-quickreel.js` |
| 8 | `qrTTS()` + `qrWordTimings()` (reuse existing TTS + distribute words) | `30-quickreel.js` |
| 9 | `qrRenderFrame()` skeleton — steps 1–7 + 18 (motion + CSS grade + vignette + subtitle) | `30-quickreel.js` |
| 10 | `drawHookText()` (headline slam, first 1.5s) | `29-qr-renderers.js` |
| 11 | `qrRenderToBlob()` export (MediaRecorder, 720p) | `30-quickreel.js` |

**Acceptance:** 1-photo 5s, 2-photo 10s, 3-photo 15s reels render and export end-to-end.

---

### Phase 2 — Full effects library (Weeks 4–6)

**Motion (new types):**

| Effect | Approach |
|---|---|
| Superzoom | Scale 1.0→1.35 over 0.5s, easeInExpo, hold |
| Boomerang | Ken Burns forward t=0→0.5, reverse t=0.5→1.0 |
| Rack focus | `ctx.filter = blur(0→6px)` before draw, then reverse |
| 3D zoom | `ctx.setTransform()` with time-evolving perspective shear |
| Shake/pulse | applyShakeTransform() (existing) + seeded offset |
| Parallax | Two drawImage passes: background 0.3x speed, subject crop 1.0x |

**Particles (all Canvas, seeded random):**

| Type | Detail |
|---|---|
| Fireflies | 30 bright dots, sinusoidal paths, warm yellow, pulsing alpha |
| Petals | 20 pink ellipses, rotate while drifting down |
| Embers | 40 orange dots rising fast with trail |
| Snow | 60 white circles falling with horizontal wobble |
| Leaves | 18 irregular polygons, autumn colors, rotating fall |
| Bubbles | 25 stroke-only circles rising, alpha 0.4–0.7 |
| Confetti | 80 colored rectangles burst from center, gravity after 0.6s |
| Smoke | 15 large low-opacity expanding circles drifting up |

**Distortion effects:**

| Effect | Approach |
|---|---|
| Glitch + chroma | Draw photo twice with ±4px shift, `screen` composite, seeded timing |
| VHS scanlines | Horizontal line every 4px + scrolling white band artifact |
| Tilt shift | Blur top/bottom 25% on off-screen canvas, composite back |
| Neon glow | Second photo draw: `blur(18px) saturate(3)` at `screen` composite |
| Film flicker | Random brightness ±8% every ~0.8s + 1-frame ±1px shift |
| Halftone | 1/6th res → circle per pixel, sized by brightness |
| Chromatic aberration | ±6px RGB channel split, `screen` composite |

**Text styles:**

| Style | Behaviour |
|---|---|
| Typewriter | Character-by-character at 20 chars/sec |
| Word-by-word fade | Reuse existing `renderReelSubtitle()` |
| Kinetic fly-in | Each word flies up from below, easeOutCubic, 0.15s |
| TikTok pop | Bold pill background, active word scales 1.15x |
| Headline slam | CAPS, 22% canvas width, scale 1.5→1.0 easeOutBack, first 1.5s |
| boldSplit | Two lines: accent colour top + large white bottom |
| sideBar | Coloured vertical bar left + text right |
| bottomStrip | Semi-transparent strip 14% height at bottom |

**New transitions (9):** displacement, shatter, inkBleed, fireBurn, particleDissolve, paintBrushWipe, filmStripRoll, clockWipe, glitchSwap, rippleReveal, displacementWipe

---

### Phase 3 — Subject-aware + narrative arc (Weeks 7–9)

**Subject-aware effects:**

| Feature | How |
|---|---|
| portraitBlur | Pass 1: full photo `blur(14px)`. Pass 2: `roundRect` clip to `subjectRegion` + redraw sharp |
| colorPop | Pass 1: `grayscale(1)`. Pass 2: clip to subject, redraw color |
| subjectGlow | Radial gradient on subject center, 1.5Hz sine pulse, `screen` composite |
| skyOverlay | Top 35% gradient overlay (`multiply` blend) when `hasHorizon: true` |
| faceZoom | Animated zoom toward `subjectRegion` center using `computeKenBurnsPath()` |

**Narrative arc overrides** — see arc table in Section 4.14.

---

### Phase 4 — Generative overlays + TikTok FX + Reveal (Weeks 8–9)

**Generative overlays:** fire, aurora, lightning, starfield — all Canvas procedural.

**TikTok-native effects:**
- `timeWarpScan` — line sweeps top→bottom, distorts pixels it crosses. `ctx.getImageData` row-by-row. Every-other-row on mobile.
- `cloneMirror` — split canvas, multiple copies of subject using `drawImage` with offsets
- `halfSketch` — left half normal + right half `contrast(2) grayscale(1) blur(0.5px)` filter

**Reveal effects:** textMaskReveal, shapeMaskReveal, scanLineReveal, spotlightReveal — all Canvas clip path animations.

---

### Phase 5 — Shader grades + Subject-aware pixel passes (Week 9)

- `qrGradeDuotone` — OffscreenCanvas `getImageData` → luminance → lerp between two colors → `putImageData`
- `qrGradeColorBloom` — animated CSS filter: `grayscale(1) → saturate(1.5)` interpolated over `bloomDuration`
- Cache both to off-screen canvas during TTS wait to avoid per-frame pixel manipulation cost

---

### Phase 6 — WebGL via glfx.js (Week 10)

1. Add glfx.js CDN script tag to on-demand QR loader in `index.html` (not global — loads only when QR navigated to)
2. `qrWebGLProcess()` — dispatches all 11 glfx calls, copies result back to main canvas
3. `QR_GLFX_AVAILABLE` already set in Phase 1 — this phase activates the path

---

### Phase 7 — Beat sync (Week 10)

1. `detectBeatTimes(audioBuffer)` — `OfflineAudioContext` + highpass + energy envelope + peak picking
2. `qrApplyBeatSync(ctx, W, H, currentTime)` — decay-based pulse/zoom/flash
3. Runs during pipeline after TTS generates audio

---

### Phase 8 — Narrative arc overrides (Week 11)

All 8 `qrArc*` functions — pure functions `(segIndex, totalSegments, resolvedEffects, projectMeta) → partialOverrides`.

---

### Phase 9 — AI async effects (Week 12)

| Effect | API | Cost |
|---|---|---|
| `aiAlive` | Gemini image-to-video | ~$0.05/clip |
| `depthParallax` | Gemini depth estimation | ~$0.01/image |
| `backgroundReplace` | Gemini image edit | ~$0.04/image |
| `artStyle` | Gemini image gen | ~$0.04/image |
| `kling` | Kling API (user's own key) | ~$0.15–0.20/clip |

All async — fire-and-forget from pipeline, render loop shows spinner until ready.

---

## 12. Free vs Premium

| Feature | Free | Premium |
|---|---|---|
| Core reel (5/10/15s, AI analysis, TTS, Ken Burns motion) | ✓ | ✓ |
| All 8 particle types, basic overlays | ✓ | ✓ |
| All 10 color grades (CSS) | ✓ | ✓ |
| All 7 distortion effects | — | ✓ |
| All 8 text styles | ✓ | ✓ |
| Subject-aware (portraitBlur, colorPop, subjectGlow, skyOverlay) | — | ✓ |
| Beat sync to BGM | — | ✓ |
| WebGL effects (glfx.js) | — | ✓ |
| TikTok FX (timeWarpScan, cloneMirror, halfSketch) | — | ✓ |
| Shader grades (duotone, colorBloom) | — | ✓ |
| All 11 new transitions | Fade only | ✓ |
| Narrative arcs | — | ✓ |
| AI Art Style (Gemini image gen) | — | ✓ |
| AI Alive (Gemini image-to-video) | — | ✓ |
| Kling animation (user's own key) | — | ✓ |
| Export 720p | ✓ | ✓ |
| Export 1080p | — | ✓ |

---

## 13. Key Technical Constraints

1. **No modification to existing files.** `24-photopilot.js` and `25-photopilot-fx.js` are read-only. Legacy bridge fields in the effects config keep the existing render loop working.

2. **`ctx.save/restore` around every renderer.** Every function in `29-qr-renderers.js` begins with `ctx.save()` and ends with `ctx.restore()`. No exceptions.

3. **`ctx.filter = 'none'` after every filter.** Prevents filter bleed to subsequent draws.

4. **Particle determinism.** All positions computed from `(segT, particleIndex)`, no random state. Preview and export render identically.

5. **OffscreenCanvas safety.** Used only for pixel-pass operations (duotone, depth parallax). No Worker threads — synchronous path only. Falls back to regular canvas on Safari < 16.4.

6. **Mobile pixel budget.** Per-frame budget at 30fps on mid-range Android: ~33ms.
   - Ken Burns drawImage: ~2ms
   - Distortion getImageData/putImageData (480p): ~4ms
   - Particles (30 particles): ~1ms
   - Transitions: ~2ms → ~9ms total, well within budget
   - `halftone`, `tiltShift`, `timeWarpScan` reduce parameters on `navigator.maxTouchPoints > 0`

7. **glfx.js single context.** One persistent `_qrGlfxCanvas`, created once, reused every frame. WebGL context creation is expensive.

8. **No Stori server.** All API calls go direct from browser to Google/Kling with user's own keys. Rendering, effects, and export all happen on the user's device.
