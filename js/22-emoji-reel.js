/**
 * Emoji Reel — silent emoji movie of the user's story, enclosed in a
 * player with Play/Stop controls. Plays in the agent panel while images
 * generate. When an audio buffer is provided by the pipeline, the Play
 * button plays the original narration and reveals emojis in sync with
 * real scene timestamps. Without audio, falls back to ambient stagger.
 *
 * Used in both Copilot (Create Story) and Autopilot (Create Reel) flows.
 */
(function () {
  'use strict';

  // Ambient (silent) stagger timing when no audio is available
  const SCENE_GAP_MS = 2800;
  const EMOJI_GAP_MS = 450;

  // Panel keys → DOM ids
  const PANELS = {
    create: { container: 'create-emoji-reel', rows: 'create-emoji-reel-rows' },
    reel:   { container: 'reel-emoji-reel',   rows: 'reel-emoji-reel-rows' },
  };

  // Per-panel state
  const state = {
    create: { timers: [], playing: false, scenes: null, audio: null, audioSource: null },
    reel:   { timers: [], playing: false, scenes: null, audio: null, audioSource: null },
  };

  function $(id) { return document.getElementById(id); }

  function clearTimers(panel) {
    const s = state[panel];
    if (!s) return;
    for (const t of s.timers) clearTimeout(t);
    s.timers = [];
  }

  function stopAudioSource(panel) {
    const s = state[panel];
    if (!s || !s.audioSource) return;
    try {
      s.audioSource.onended = null;
      s.audioSource.stop();
    } catch (_) { /* already stopped */ }
    try { s.audioSource.disconnect(); } catch (_) {}
    s.audioSource = null;
  }

  function updateButtons(panel) {
    const ids = PANELS[panel];
    const container = $(ids.container);
    if (!container) return;
    const s = state[panel];
    const playBtn = container.querySelector('.emoji-reel-btn[data-action="play"]');
    const stopBtn = container.querySelector('.emoji-reel-btn[data-action="stop"]');
    const hasScenes = Array.isArray(s.scenes) && s.scenes.length > 0;
    // Toggle container-level playing state → drives CSS (icon swap + autoplay blink)
    container.classList.toggle('is-playing', !!s.playing);
    if (playBtn) {
      playBtn.classList.toggle('is-active', s.playing);
      playBtn.disabled = !hasScenes;
      if (s.playing) {
        playBtn.title = 'Pause';
        playBtn.setAttribute('aria-label', 'Pause emoji reel');
      } else {
        playBtn.title = s.audio ? 'Play with narration' : 'Play';
        playBtn.setAttribute('aria-label', 'Play emoji reel');
      }
    }
    if (stopBtn) {
      stopBtn.disabled = !s.playing;
    }
  }

  function buildRows(panel, scenes) {
    const ids = PANELS[panel];
    const rowsEl = $(ids.rows);
    if (!rowsEl) return [];
    rowsEl.innerHTML = '';
    const rows = [];
    scenes.forEach((scene, idx) => {
      const row = document.createElement('div');
      row.className = 'emoji-reel-row';
      row.dataset.scene = String(idx);

      const num = document.createElement('span');
      num.className = 'emoji-reel-num';
      num.textContent = String(idx + 1).padStart(2, '0');
      row.appendChild(num);

      const strip = document.createElement('span');
      strip.className = 'emoji-reel-strip';
      const list = Array.isArray(scene.emojis) ? scene.emojis.filter(Boolean) : [];
      const emojis = list.length ? list.slice(0, 6) : ['•'];
      emojis.forEach(e => {
        const span = document.createElement('span');
        span.className = 'emoji-reel-emoji';
        span.textContent = e;
        strip.appendChild(span);
      });
      row.appendChild(strip);
      rowsEl.appendChild(row);
      rows.push({ row, emojiEls: Array.from(strip.children) });
    });
    return rows;
  }

  // Snap every row/emoji to revealed state (used by reduced-motion + complete)
  function snapAllRevealed(panel) {
    const ids = PANELS[panel];
    const rowsEl = $(ids.rows);
    if (!rowsEl) return;
    rowsEl.querySelectorAll('.emoji-reel-row').forEach(el => el.classList.add('emoji-reel-row-in'));
    rowsEl.querySelectorAll('.emoji-reel-emoji').forEach(el => el.classList.add('emoji-reel-emoji-in'));
  }

  // Ambient (silent) reveal with fixed stagger
  function scheduleRevealAmbient(panel, rows) {
    const s = state[panel];
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      snapAllRevealed(panel);
      s.timers.push(setTimeout(() => { s.playing = false; updateButtons(panel); }, 100));
      return;
    }

    let maxDelay = 0;
    rows.forEach((r, sceneIdx) => {
      const baseDelay = sceneIdx * SCENE_GAP_MS;
      s.timers.push(setTimeout(() => {
        if (!s.playing) return;
        r.row.classList.add('emoji-reel-row-in');
      }, baseDelay));
      r.emojiEls.forEach((el, i) => {
        const d = baseDelay + 200 + i * EMOJI_GAP_MS;
        if (d > maxDelay) maxDelay = d;
        s.timers.push(setTimeout(() => {
          if (!s.playing) return;
          el.classList.add('emoji-reel-emoji-in');
        }, d));
      });
    });
    s.timers.push(setTimeout(() => {
      s.playing = false;
      updateButtons(panel);
    }, maxDelay + 500));
  }

  // Audio-synced reveal: emojis spread across each scene's real duration,
  // timed to the narration playing through Web Audio.
  function scheduleRevealWithAudio(panel, rows, audioBuf) {
    const s = state[panel];
    const scenes = s.scenes;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let ctx;
    try {
      ctx = (typeof ensureAudioCtx === 'function') ? ensureAudioCtx()
           : new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      // Audio context unavailable — fall back to ambient
      scheduleRevealAmbient(panel, rows);
      return;
    }

    // Resume if suspended (Play click is a user gesture, so this is allowed)
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (_) {}
    }

    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);
    s.audioSource = src;

    src.onended = function () {
      // Playback naturally ended OR was stopped
      if (s.audioSource === src) s.audioSource = null;
      s.playing = false;
      clearTimers(panel);
      snapAllRevealed(panel);
      updateButtons(panel);
    };

    // Schedule visual reveals relative to audio start (wall-clock timers
    // stay good enough for visual sync at 60fps — we don't need sample accuracy)
    scenes.forEach((scene, i) => {
      const r = rows[i];
      if (!r) return;
      const startMs = Math.max(0, (scene.startTime || 0) * 1000);
      const durMs   = Math.max(0.001, ((scene.endTime ?? scene.startTime ?? 0) - (scene.startTime || 0)) * 1000);

      if (reduceMotion) {
        s.timers.push(setTimeout(() => {
          if (!s.playing) return;
          r.row.classList.add('emoji-reel-row-in');
          r.emojiEls.forEach(el => el.classList.add('emoji-reel-emoji-in'));
        }, startMs));
        return;
      }

      // Row appears at scene start
      s.timers.push(setTimeout(() => {
        if (!s.playing) return;
        r.row.classList.add('emoji-reel-row-in');
      }, startMs));

      // Emojis spread evenly across the scene's real duration
      const n = r.emojiEls.length;
      r.emojiEls.forEach((el, j) => {
        const offset = ((j + 0.5) / n) * durMs;
        const d = startMs + Math.min(durMs - 50, Math.max(0, offset));
        s.timers.push(setTimeout(() => {
          if (!s.playing) return;
          el.classList.add('emoji-reel-emoji-in');
        }, d));
      });
    });

    try {
      src.start();
    } catch (_) {
      // Start failed — fall back
      s.audioSource = null;
      clearTimers(panel);
      scheduleRevealAmbient(panel, rows);
    }
  }

  function detectPanel(opts) {
    if (typeof opts === 'string' && PANELS[opts]) return opts;
    if (opts && typeof opts === 'object' && opts.panel && PANELS[opts.panel]) return opts.panel;
    const reelPage = document.getElementById('reel-page');
    if (reelPage && reelPage.classList.contains('visible')) return 'reel';
    return 'create';
  }

  // ── Public: start a new reel (pipeline hook, on image-gen start) ──
  // opts can be a panel string ('create'|'reel') or an object:
  //   { panel: 'create'|'reel', audio: AudioBuffer }
  function startEmojiReel(scenes, opts) {
    if (!Array.isArray(scenes) || scenes.length === 0) return;
    const panel = detectPanel(opts);
    const ids = PANELS[panel];
    const container = $(ids.container);
    if (!container) return;

    // Fully reset prior playback
    stopAudioSource(panel);
    clearTimers(panel);
    const s = state[panel];
    s.scenes = scenes.slice();
    s.audio = (opts && typeof opts === 'object' && opts.audio) ? opts.audio : null;
    s.playing = true;

    container.hidden = false;
    container.removeAttribute('aria-hidden');
    container.classList.remove('emoji-reel-fading');

    const rows = buildRows(panel, s.scenes);
    updateButtons(panel);
    // Autoplay: if we have the narration buffer, start audio-synced playback
    // immediately. The user already clicked Generate to kick this off, so the
    // document has a recent gesture and Chrome's autoplay policy allows audio.
    // If audio setup fails (suspended context, no buffer, etc.), fall back to
    // silent ambient stagger.
    if (s.audio && typeof s.audio === 'object' && s.audio.duration > 0) {
      scheduleRevealWithAudio(panel, rows, s.audio);
    } else {
      scheduleRevealAmbient(panel, rows);
    }
  }

  // ── Public: play button click — prefer audio-synced when buffer available ──
  function playEmojiReel(opts) {
    const panel = detectPanel(opts);
    const s = state[panel];
    if (!Array.isArray(s.scenes) || s.scenes.length === 0) return;
    const ids = PANELS[panel];
    const container = $(ids.container);
    if (!container) return;

    // Stop anything currently running
    stopAudioSource(panel);
    clearTimers(panel);
    // Clear revealed state so this plays as a fresh replay
    const rowsEl = $(ids.rows);
    if (rowsEl) {
      rowsEl.querySelectorAll('.emoji-reel-row-in').forEach(el => el.classList.remove('emoji-reel-row-in'));
      rowsEl.querySelectorAll('.emoji-reel-emoji-in').forEach(el => el.classList.remove('emoji-reel-emoji-in'));
    }

    s.playing = true;
    container.hidden = false;
    container.removeAttribute('aria-hidden');
    container.classList.remove('emoji-reel-fading');

    const rows = buildRows(panel, s.scenes);
    updateButtons(panel);

    if (s.audio && typeof s.audio === 'object' && s.audio.duration > 0) {
      scheduleRevealWithAudio(panel, rows, s.audio);
    } else {
      scheduleRevealAmbient(panel, rows);
    }
  }

  // ── Public: pause — halt playback but KEEP revealed emojis where they are ──
  function pausePlayback(opts) {
    const panel = detectPanel(opts);
    const s = state[panel];
    stopAudioSource(panel);
    clearTimers(panel);
    s.playing = false;
    updateButtons(panel);
  }

  // ── Public: stop button — halt playback, clear revealed state, keep chrome ──
  function stopPlayback(opts) {
    const panel = detectPanel(opts);
    const s = state[panel];
    stopAudioSource(panel);
    clearTimers(panel);
    s.playing = false;
    const ids = PANELS[panel];
    const rowsEl = $(ids.rows);
    if (rowsEl) {
      rowsEl.querySelectorAll('.emoji-reel-row-in').forEach(el => el.classList.remove('emoji-reel-row-in'));
      rowsEl.querySelectorAll('.emoji-reel-emoji-in').forEach(el => el.classList.remove('emoji-reel-emoji-in'));
    }
    updateButtons(panel);
  }

  // ── Public: full teardown (unused by pipeline today; for hard reset) ──
  function stopEmojiReel(opts) {
    const panel = detectPanel(opts);
    const s = state[panel];
    stopAudioSource(panel);
    clearTimers(panel);
    s.playing = false;
    s.scenes = null;
    s.audio = null;
    const ids = PANELS[panel];
    const container = $(ids.container);
    if (!container) return;
    container.hidden = true;
    container.setAttribute('aria-hidden', 'true');
    container.classList.remove('emoji-reel-fading');
    const rowsEl = $(ids.rows);
    if (rowsEl) rowsEl.innerHTML = '';
    updateButtons(panel);
  }

  // ── Public: pipeline "images finished" signal — keep player visible,
  //    snap to fully-revealed state, stop any running playback. ──
  function completeEmojiReel(opts) {
    const panel = detectPanel(opts);
    const s = state[panel];
    const ids = PANELS[panel];
    const container = $(ids.container);
    if (!container || container.hidden) return;
    stopAudioSource(panel);
    clearTimers(panel);
    s.playing = false;
    snapAllRevealed(panel);
    updateButtons(panel);
  }

  // ── Control button wiring ──
  function handleControlClick(ev) {
    const btn = ev.target.closest('.emoji-reel-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    const panel = btn.dataset.panel || detectPanel();
    if (btn.disabled) return;
    if (action === 'play') {
      // While playing, the Play button shows a Pause icon — clicking it
      // halts playback but leaves revealed emojis in place (no reset).
      if (state[panel] && state[panel].playing) {
        pausePlayback(panel);
      } else {
        playEmojiReel(panel);
      }
    } else if (action === 'stop') {
      stopPlayback(panel);
    }
  }

  function bindControls() {
    ['create-emoji-reel', 'reel-emoji-reel'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el._emojiReelBound) {
        el.addEventListener('click', handleControlClick);
        el._emojiReelBound = true;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindControls);
  } else {
    bindControls();
  }

  // Export
  window.startEmojiReel = startEmojiReel;
  window.playEmojiReel = playEmojiReel;
  window.stopEmojiReel = stopEmojiReel;
  window.completeEmojiReel = completeEmojiReel;
})();
