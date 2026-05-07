// ── Audio Rehearsal — Phases 3–7 ──────────────────────────────────────────
// Per-image card audio mini-player + mood/regen controls (Phase 3)
// Whole-project rehearsal step UI + transport (Phase 4)
// Audio rehearsal — per-line audio cards, rehearsal step, video lock
// Per-scene video regen escape hatch (Phase 6)
// Wavesurfer speaker-colored regions on editor master dialogue track (Phase 7)

(function () {
  'use strict';

  // ── Palette ──────────────────────────────────────────────────────────────

  const VOICE_PALETTE = [
    '#3b82f6', '#10b981', '#a855f7', '#f59e0b',
    '#ec4899', '#06b6d4', '#ef4444', '#8b5cf6',
  ];
  const NARRATOR_COLOR = 'var(--text-muted, #94a3b8)';
  const _paletteAssignments = {};  // speakerId → color
  let _paletteNext = 0;

  window.characterTimelineColor = function (speakerId) {
    if (!speakerId || speakerId === 'narrator') return NARRATOR_COLOR;
    if (_paletteAssignments[speakerId]) return _paletteAssignments[speakerId];
    const color = VOICE_PALETTE[_paletteNext % VOICE_PALETTE.length];
    _paletteAssignments[speakerId] = color;
    _paletteNext++;
    return color;
  };

  // ── IDB helpers for per-line audio ────────────────────────────────────────

  const IDB_NAME = 'stori_cast_images_v1';
  const IDB_STORE = 'images';

  function _openAudioIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function _idbAudioSet(key, value) {
    try {
      const db = await _openAudioIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { console.warn('[Rehearsal] IDB set error:', e.message); }
  }

  async function _idbAudioGet(key) {
    try {
      const db = await _openAudioIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { console.warn('[Rehearsal] IDB get error:', e.message); return null; }
  }

  // Convert AudioBuffer → WAV blob URL (for mini-player <audio> src)
  function _audioBufferToUrl(audioBuffer) {
    const sr = audioBuffer.sampleRate;
    const numCh = audioBuffer.numberOfChannels;
    const numSamples = audioBuffer.length;
    const byteLength = 44 + numSamples * numCh * 2;
    const buf = new ArrayBuffer(byteLength);
    const view = new DataView(buf);
    const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, byteLength - 8, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * numCh * 2, true);
    view.setUint16(32, numCh * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * numCh * 2, true);
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numCh; ch++) {
        const s = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
    const blob = new Blob([buf], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  // ── Persist per-scene audio from castGenerateMultiVoiceAudio result ───────
  // Called by 17c after multi-voice TTS completes.
  window.persistPerSceneAudio = async function (segments, speakerTurns) {
    if (!Array.isArray(segments) || !Array.isArray(speakerTurns)) return;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg || !seg.audioActualDuration) continue;
      const turn = speakerTurns.find(t => t.segmentIndex === i);
      if (!turn) continue;
      // Slice from master combined buffer
      const masterBuf = window._createMasterAudio || window.createAudioBuffer;
      if (!masterBuf) continue;
      try {
        const sliced = _sliceAudioBuffer(masterBuf, turn.startMs, turn.endMs);
        const url = _audioBufferToUrl(sliced);
        seg._audioUrl = url;
        const idbKey = `audio_line_${seg.id || i}_0`;
        await _idbAudioSet(idbKey, url);
      } catch (e) {
        console.warn('[Rehearsal] persist audio_line error:', e.message);
      }
    }
  };

  // ── Phase 3: Per-image card audio section ─────────────────────────────────

  function _sliceAudioBuffer(buffer, startMs, endMs) {
    if (typeof window.sliceAudioBuffer === 'function') return window.sliceAudioBuffer(buffer, startMs, endMs);
    const sr = buffer.sampleRate;
    const s0 = Math.max(0, Math.round((startMs / 1000) * sr));
    const s1 = Math.min(buffer.length, Math.round((endMs / 1000) * sr));
    const len = Math.max(1, s1 - s0);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const out = ctx.createBuffer(buffer.numberOfChannels, len, sr);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      out.getChannelData(ch).set(buffer.getChannelData(ch).subarray(s0, s1));
    }
    try { ctx.close(); } catch (_) {}
    return out;
  }

  function _getMoodLabel(moodId) {
    const moods = window.MOOD_ENUM || [];
    const m = moods.find(x => x.id === moodId);
    return m ? `${m.icon} ${m.label}` : moodId;
  }

  function _buildMoodOptions(currentMood) {
    return (window.MOOD_ENUM || [])
      .map(m => `<option value="${m.id}" ${m.id === currentMood ? 'selected' : ''}>${m.icon} ${m.label}</option>`)
      .join('');
  }

  function _estimateRegenCost(line) {
    const voice = line && line.speakerCharacterId
      ? (typeof window.castResolveVoiceForSpeaker === 'function'
          ? window.castResolveVoiceForSpeaker(line.speakerCharacterId, line.speakerName)
          : null)
      : null;
    if (!voice || voice.provider !== 'elevenlabs') return '$0.00';
    const chars = (line.text || '').length;
    const cost = (chars / 1000) * 0.30;
    return '$' + cost.toFixed(2);
  }

  // Build the audio section HTML for a scene card
  function buildAudioSection(scene, idx) {
    if (!scene) return '';
    const lines = scene.dialogueLines || [];
    const isBroll = lines.length === 0;
    const isPendingRegen = !!scene._pendingMoodRegen;

    // B-roll with no dialogue: show duration stepper only
    if (isBroll) {
      const dur = scene.manualDuration != null ? scene.manualDuration : (scene.durationSec || 5.0);
      return `
<div class="scene-audio-section scene-audio-broll" data-scene-idx="${idx}">
  <div class="scene-audio-label">Duration</div>
  <div class="scene-audio-stepper">
    <button class="btn-xs scene-dur-dec" data-idx="${idx}">◀</button>
    <span class="scene-dur-val" id="scene-dur-val-${idx}">${dur.toFixed(1)}s</span>
    <button class="btn-xs scene-dur-inc" data-idx="${idx}">▶</button>
  </div>
</div>`;
    }

    const statusHtml = isPendingRegen
      ? `<span class="scene-audio-badge pending">~ pending regen</span>`
      : '';

    const lineRowsHtml = lines.map((line, lineIdx) => {
      const speakerIcon = line.isVoiceOver ? '🔉' : '🎙';
      const speakerName = line.speakerName || (line.speakerCharacterId === 'narrator' ? 'Narrator' : '');
      const voice = typeof window.castResolveVoiceForSpeaker === 'function'
        ? window.castResolveVoiceForSpeaker(line.speakerCharacterId, speakerName)
        : null;
      const voiceLabel = voice ? `${voice.voiceName || voice.voiceId} (${voice.provider === 'elevenlabs' ? 'EL' : 'Gemini'})` : '';
      const cost = _estimateRegenCost(line);
      const mood = (line.voiceOverride && line.voiceOverride.mood)
        || (typeof window.deriveSceneMood === 'function' ? window.deriveSceneMood(scene) : 'matter-of-fact');
      const hasLineAudio = !!(scene.audioActualDuration || scene._audioUrl);

      const playerHtml = hasLineAudio ? `
<div class="scene-audio-player" id="scene-audio-player-${idx}-${lineIdx}">
  <button class="scene-audio-play-btn" id="scene-audio-play-${idx}-${lineIdx}" title="Play">▶</button>
  <div class="scene-audio-progress" id="scene-audio-progress-${idx}-${lineIdx}">
    <div class="scene-audio-bar" id="scene-audio-bar-${idx}-${lineIdx}"></div>
  </div>
  <span class="scene-audio-time" id="scene-audio-time-${idx}-${lineIdx}">${(scene.audioActualDuration || 0).toFixed(1)}s</span>
</div>` : `<div class="scene-audio-generating">⏳ Generating ${sanitize(speakerName)}'s audio…</div>`;

      return `
<div class="scene-audio-line${line.muted ? ' scene-audio-line--muted' : ''}" data-idx="${idx}" data-line-idx="${lineIdx}">
  <div class="scene-audio-header">
    <span class="scene-audio-icon">${speakerIcon}</span>
    <span class="scene-audio-speaker">${sanitize(speakerName)}${voiceLabel ? ` · ${sanitize(voiceLabel)}` : ''}</span>
    <button class="scene-audio-mute-btn btn-xs" data-idx="${idx}" data-line-idx="${lineIdx}" title="${line.muted ? 'Unmute' : 'Mute'}">${line.muted ? '🔇' : '🔊'}</button>
    <button class="scene-audio-overflow-btn btn-xs" data-idx="${idx}" data-line-idx="${lineIdx}" title="Voice options">…</button>
    <button class="scene-audio-remove-line-btn btn-xs" data-idx="${idx}" data-line-idx="${lineIdx}" title="Remove line">✕</button>
  </div>
  <textarea class="scene-audio-text-edit" data-idx="${idx}" data-line-idx="${lineIdx}" rows="2">${sanitize(line.text || '')}</textarea>
  ${playerHtml}
  <div class="scene-audio-controls">
    <label class="scene-audio-mood-label">🎭
      <select class="scene-audio-mood-select" data-idx="${idx}" data-line-idx="${lineIdx}">
        ${_buildMoodOptions(mood)}
      </select>
    </label>
    <button class="scene-audio-regen-btn btn-xs" data-idx="${idx}" data-line-idx="${lineIdx}">↻ Regen (${cost})</button>
  </div>
</div>`;
    }).join('');

    return `
<div class="scene-audio-section" data-scene-idx="${idx}">
  ${lineRowsHtml}
  <button class="scene-audio-add-line-btn btn-xs" data-idx="${idx}">+ Add line</button>
  ${statusHtml}
</div>`;
  }

  function _refreshAudioSection(card, scene, idx) {
    const old = card.querySelector('.scene-audio-section');
    if (!old) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = buildAudioSection(scene, idx);
    old.parentNode.replaceChild(tmp.firstElementChild, old);
    wireAudioSection(card, scene, idx);
  }

  // Wire audio section events on a scene card element
  function wireAudioSection(card, scene, idx) {
    const lines = scene.dialogueLines || [];

    // Per-line controls
    lines.forEach((line, lineIdx) => {
      // Mood change → mark pending regen
      const moodSelect = card.querySelector(`.scene-audio-mood-select[data-idx="${idx}"][data-line-idx="${lineIdx}"]`);
      if (moodSelect) {
        moodSelect.addEventListener('change', () => {
          line._pendingMoodRegen = true;
          line._pendingMood = moodSelect.value;
          scene._pendingMoodRegen = true;
          const badge = card.querySelector('.scene-audio-badge');
          if (badge) {
            badge.textContent = '~ pending regen';
            badge.className = 'scene-audio-badge pending';
          } else {
            const section = card.querySelector('.scene-audio-section');
            if (section) {
              const b = document.createElement('span');
              b.className = 'scene-audio-badge pending';
              b.textContent = '~ pending regen';
              section.appendChild(b);
            }
          }
        });
      }

      // Regen button
      const regenBtn = card.querySelector(`.scene-audio-regen-btn[data-idx="${idx}"][data-line-idx="${lineIdx}"]`);
      if (regenBtn) {
        regenBtn.addEventListener('click', () => _regenSceneAudio(idx, lineIdx, card));
      }

      // Voice overflow menu
      const overflowBtn = card.querySelector(`.scene-audio-overflow-btn[data-idx="${idx}"][data-line-idx="${lineIdx}"]`);
      if (overflowBtn) {
        overflowBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          _showVoiceOverflowMenu(idx, lineIdx, overflowBtn);
        });
      }

      // Mute toggle (Class A)
      const muteBtn = card.querySelector(`.scene-audio-mute-btn[data-idx="${idx}"][data-line-idx="${lineIdx}"]`);
      if (muteBtn) {
        muteBtn.addEventListener('click', () => {
          line.muted = !line.muted;
          muteBtn.textContent = line.muted ? '🔇' : '🔊';
          muteBtn.title = line.muted ? 'Unmute' : 'Mute';
          const lineEl = card.querySelector(`.scene-audio-line[data-idx="${idx}"][data-line-idx="${lineIdx}"]`);
          if (lineEl) lineEl.classList.toggle('scene-audio-line--muted', line.muted);
          scene._pendingMoodRegen = true;
        });
      }

      // Inline text edit (Class A)
      const textEdit = card.querySelector(`.scene-audio-text-edit[data-idx="${idx}"][data-line-idx="${lineIdx}"]`);
      if (textEdit) {
        textEdit.addEventListener('change', () => {
          line.text = textEdit.value;
          scene._pendingMoodRegen = true;
        });
      }

      // Remove line (Class A)
      const removeBtn = card.querySelector(`.scene-audio-remove-line-btn[data-idx="${idx}"][data-line-idx="${lineIdx}"]`);
      if (removeBtn) {
        removeBtn.addEventListener('click', async () => {
          const hasAudio = !!(scene.audioActualDuration || scene._audioUrl);
          if (hasAudio) {
            const ok = await showConfirm('Remove this line? Its audio will be discarded.', 'Remove');
            if (!ok) return;
          }
          scene.dialogueLines.splice(lineIdx, 1);
          _refreshAudioSection(card, scene, idx);
        });
      }

      // Mini-player
      _wireMiniPlayer(idx, lineIdx, card, scene);
    });

    // Add line (Class A)
    const addLineBtn = card.querySelector(`.scene-audio-add-line-btn[data-idx="${idx}"]`);
    if (addLineBtn) {
      addLineBtn.addEventListener('click', () => {
        if (!Array.isArray(scene.dialogueLines)) scene.dialogueLines = [];
        scene.dialogueLines.push({ text: '', speakerCharacterId: 'narrator', speakerName: 'Narrator', isVoiceOver: true });
        _refreshAudioSection(card, scene, idx);
      });
    }

    // Duration stepper (b-roll)
    const decBtn = card.querySelector(`.scene-dur-dec[data-idx="${idx}"]`);
    const incBtn = card.querySelector(`.scene-dur-inc[data-idx="${idx}"]`);
    if (decBtn && incBtn) {
      decBtn.addEventListener('click', () => _adjustBrollDuration(idx, -0.5, card));
      incBtn.addEventListener('click', () => _adjustBrollDuration(idx, 0.5, card));
    }

  }

  function _wireMiniPlayer(idx, lineIdx, card, scene) {
    const playBtn = card.querySelector(`#scene-audio-play-${idx}-${lineIdx}`);
    const progressEl = card.querySelector(`#scene-audio-progress-${idx}-${lineIdx}`);
    const barEl = card.querySelector(`#scene-audio-bar-${idx}-${lineIdx}`);
    const timeEl = card.querySelector(`#scene-audio-time-${idx}-${lineIdx}`);
    if (!playBtn) return;

    let audioEl = null;
    let isPlaying = false;

    async function loadAudio() {
      if (audioEl) return audioEl;
      let url = scene._audioUrl;
      if (!url) {
        const idbKey = `audio_line_${scene.id || idx}_${lineIdx}`;
        url = await _idbAudioGet(idbKey);
      }
      if (!url && typeof window._createMasterAudio !== 'undefined' && window._createMasterAudio) {
        const turn = (window._createSpeakerTurns || []).find(t => t.segmentIndex === idx);
        if (turn) {
          const buf = _sliceAudioBuffer(window._createMasterAudio, turn.startMs, turn.endMs);
          url = _audioBufferToUrl(buf);
          scene._audioUrl = url;
        }
      }
      if (!url) return null;
      audioEl = new Audio(url);
      audioEl.addEventListener('timeupdate', () => {
        if (!audioEl.duration) return;
        const pct = (audioEl.currentTime / audioEl.duration) * 100;
        if (barEl) barEl.style.width = pct + '%';
        if (timeEl) timeEl.textContent = audioEl.currentTime.toFixed(1) + 's / ' + audioEl.duration.toFixed(1) + 's';
      });
      audioEl.addEventListener('ended', () => {
        isPlaying = false;
        playBtn.textContent = '▶';
        if (barEl) barEl.style.width = '0%';
      });
      return audioEl;
    }

    playBtn.addEventListener('click', async () => {
      document.querySelectorAll('.scene-audio-play-btn.playing').forEach(b => {
        if (b !== playBtn) b.click();
      });
      const el = await loadAudio();
      if (!el) return;
      if (isPlaying) {
        el.pause();
        el.currentTime = 0;
        isPlaying = false;
        playBtn.textContent = '▶';
        playBtn.classList.remove('playing');
      } else {
        el.play().catch(() => {});
        isPlaying = true;
        playBtn.textContent = '⏸';
        playBtn.classList.add('playing');
      }
    });

    if (progressEl) {
      progressEl.addEventListener('click', async (e) => {
        const el = await loadAudio();
        if (!el || !el.duration) return;
        const rect = progressEl.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        el.currentTime = pct * el.duration;
      });
    }
  }

  async function _regenSceneAudio(idx, lineIdx, card) {
    const scenes = window.createScenes;
    if (!scenes || !scenes[idx]) return;
    const scene = scenes[idx];
    const lines = scene.dialogueLines || [];
    if (lineIdx < 0 || lineIdx >= lines.length) return;
    const line = lines[lineIdx];
    if (!line || !line.text) return;

    const moodSelect = card ? card.querySelector(`.scene-audio-mood-select[data-idx="${idx}"][data-line-idx="${lineIdx}"]`) : null;
    const mood = (moodSelect && moodSelect.value)
      || (line._pendingMood)
      || (line.voiceOverride && line.voiceOverride.mood)
      || (typeof window.deriveSceneMood === 'function' ? window.deriveSceneMood(scene) : 'matter-of-fact');

    const voice = typeof window.castResolveVoiceForSpeaker === 'function'
      ? window.castResolveVoiceForSpeaker(line.speakerCharacterId, line.speakerName)
      : null;
    if (!voice) return;

    const cost = _estimateRegenCost(line);
    const costNum = parseFloat(cost.replace('$', '')) || 0;

    if (costNum > 0.05) {
      const ok = await showConfirm(
        `Regen this line with current mood + voice settings?\nCost: ${cost} (${voice.provider === 'elevenlabs' ? 'ElevenLabs, ' : 'Gemini, '}${(line.text || '').length} chars)\n`,
        'Regen', true
      );
      if (!ok) return;
    }

    const oldDuration = scene.audioActualDuration || 0;

    if (card) {
      const regenBtn = card.querySelector(`.scene-audio-regen-btn[data-idx="${idx}"][data-line-idx="${lineIdx}"]`);
      if (regenBtn) regenBtn.disabled = true;
      const playerArea = card.querySelector(`#scene-audio-player-${idx}-${lineIdx}`);
      if (playerArea) playerArea.style.opacity = '0.4';
    }

    let badge = card ? card.querySelector(`.scene-audio-section[data-scene-idx="${idx}"] .scene-audio-badge`) : null;
    if (badge) { badge.textContent = '⏳ regenerating…'; badge.className = 'scene-audio-badge generating'; }

    try {
      if (typeof updateCreateAgentTask === 'function') {
        updateCreateAgentTask('storyboard', 'multivoice', 'running', `Regenerating ${line.speakerName || ''} line ${idx + 1}…`);
      }

      line.regenLockToken = { uuid: Math.random().toString(36).slice(2), ts: Date.now() };

      const result = await window.castGenerateLineTTS(line.text, voice, mood);
      if (!result) throw new Error('TTS returned null');

      const newDuration = result.durationMs / 1000;
      const deltaSec = newDuration - oldDuration;
      scene.audioActualDuration = newDuration;
      scene.endTime = (scene.startTime || 0) + newDuration;
      scene._pendingMoodRegen = false;
      line._pendingMoodRegen = false;
      line._pendingMood = null;

      line.voiceOverride = line.voiceOverride || {};
      line.voiceOverride.mood = mood;
      line.voiceOverride.stickyKey = _hashText(line.text);
      line.regenCount = (line.regenCount || 0) + 1;
      line.regenLockToken = null;

      if (line.regenCount >= 5) {
        console.warn(`[Rehearsal] Scene ${idx + 1} line ${lineIdx} has ${line.regenCount} regens — consider trying a different mood.`);
      }

      const url = _audioBufferToUrl(result.audioBuffer);
      scene._audioUrl = url;
      const idbKey = `audio_line_${scene.id || idx}_${lineIdx}`;
      await _idbAudioSet(idbKey, url);

      if (Math.abs(deltaSec) > 0.001) {
        const downstreamHasVideo = (window.createScenes || [])
          .slice(idx + 1)
          .some(s => s.videoActualDuration != null);

        if (Math.abs(deltaSec) > 0.2 && downstreamHasVideo) {
          const dir = deltaSec > 0 ? 'longer' : 'shorter';
          const rest = (window.createScenes || []).slice(idx + 1).length;
          const ok = await showConfirm(
            `New audio is ${Math.abs(deltaSec).toFixed(1)}s ${dir} than current.\n\nThis will:\n• Shift ${rest} downstream scenes by ${deltaSec > 0 ? '+' : ''}${deltaSec.toFixed(1)}s in the master audio\n• Subtitles for those scenes will re-align to new timing\n• Scene ${idx + 1}'s own audio-video drift has changed — review in rehearsal\n\nOther scenes' per-scene drift is unchanged.\n\nContinue with regen?`,
            'Regen', true
          );
          if (!ok) { line.regenLockToken = null; return; }
        }

        for (let j = idx + 1; j < (window.createScenes || []).length; j++) {
          const ds = window.createScenes[j];
          if (ds) {
            ds.startTime = (ds.startTime || 0) + deltaSec;
            ds.endTime = (ds.endTime || 0) + deltaSec;
          }
        }
      }

      const ar = window.createJobState && window.createJobState.audioRehearsal;
      if (ar && (ar.status === 'locked' || ar.status === 'reviewed')) {
        ar.status = 'pending';
      }

      if (typeof trackCost === 'function' && costNum > 0) trackCost('voiceRegen', costNum);
      if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
      if (typeof updateCreateAgentTask === 'function') {
        updateCreateAgentTask('storyboard', 'multivoice', 'done', `Regen done — scene ${idx + 1}`);
      }

      if (card) {
        const section = card.querySelector('.scene-audio-section');
        if (section) {
          section.outerHTML = buildAudioSection(scene, idx);
          const newSection = card.querySelector('.scene-audio-section');
          if (newSection) wireAudioSection(card, scene, idx);
        }
      }
    } catch (e) {
      console.error('[Rehearsal] regen failed:', e.message);
      line.regenLockToken = null;
      if (badge) { badge.textContent = '❌ regen failed — retry'; badge.className = 'scene-audio-badge error'; }
    } finally {
      if (card) {
        const regenBtn = card.querySelector(`.scene-audio-regen-btn[data-idx="${idx}"][data-line-idx="${lineIdx}"]`);
        if (regenBtn) regenBtn.disabled = false;
        const playerArea = card.querySelector(`#scene-audio-player-${idx}-${lineIdx}`);
        if (playerArea) playerArea.style.opacity = '';
      }
    }
  }

  function _adjustBrollDuration(idx, delta, card) {
    const scenes = window.createScenes;
    if (!scenes || !scenes[idx]) return;
    const scene = scenes[idx];
    scene.manualDuration = Math.max(1.0, ((scene.manualDuration != null ? scene.manualDuration : scene.durationSec) || 5.0) + delta);
    if (!scene.narrationOverlay) {
      scene.audioActualDuration = scene.manualDuration;
      scene.durationSec = scene.manualDuration;
    }
    const valEl = card && card.querySelector(`#scene-dur-val-${idx}`);
    if (valEl) valEl.textContent = scene.manualDuration.toFixed(1) + 's';
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
  }

  function _showVoiceOverflowMenu(idx, lineIdx, anchorEl) {
    const existing = document.querySelector('.scene-audio-overflow-menu');
    if (existing) existing.remove();
    const scenes = window.createScenes;
    if (!scenes || !scenes[idx]) return;
    const scene = scenes[idx];
    const lines = scene.dialogueLines || [];
    const line = lines[lineIdx];
    if (!line) return;
    const hasOverride = line.voiceOverride && line.voiceOverride.voiceId;

    const menu = document.createElement('div');
    menu.className = 'scene-audio-overflow-menu';
    menu.innerHTML = `
      <div class="overflow-menu-item" data-action="change-voice">🎙 Use a different voice for this line</div>
      ${hasOverride ? `<div class="overflow-menu-item" data-action="reset-voice">🔄 Reset to character default voice</div>` : ''}
    `;
    const rect = anchorEl.getBoundingClientRect();
    menu.style.cssText = 'position:fixed;z-index:9999;background:var(--bg-card,#1a1a2e);border:1px solid var(--border,#333);border-radius:8px;padding:4px 0;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = rect.left + 'px';
    document.body.appendChild(menu);

    menu.querySelector('[data-action="change-voice"]') && menu.querySelector('[data-action="change-voice"]').addEventListener('click', () => {
      menu.remove();
      _showVoicePickerModal(idx, lineIdx);
    });
    const resetEl = menu.querySelector('[data-action="reset-voice"]');
    if (resetEl) resetEl.addEventListener('click', () => {
      menu.remove();
      line.voiceOverride = null;
      scene._pendingMoodRegen = true;
      const card = document.querySelector(`.scene-audio-section[data-scene-idx="${idx}"]`)?.closest('.scene-card');
      if (card) {
        const section = card.querySelector('.scene-audio-section');
        if (section) { section.outerHTML = buildAudioSection(scene, idx); wireAudioSection(card, scene, idx); }
      }
    });

    const close = (e) => { if (!menu.contains(e.target) && e.target !== anchorEl) { menu.remove(); document.removeEventListener('click', close, true); } };
    setTimeout(() => document.addEventListener('click', close, true), 100);
  }

  function _showVoicePickerModal(idx, lineIdx = 0) {
    const scenes = window.createScenes;
    if (!scenes || !scenes[idx]) return;
    const scene = scenes[idx];
    const lines = scene.dialogueLines || [];
    const line = lines[lineIdx];
    if (!line) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const providerOptions = `<option value="gemini">Gemini</option><option value="elevenlabs">ElevenLabs</option>`;
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:380px;">
        <div class="modal-title">Voice for scene ${idx + 1} line ${lineIdx + 1}</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin:14px 0;">
          <label>Provider:<br><select id="vp-provider" class="review-select">${providerOptions}</select></label>
          <label>Voice ID:<br><input id="vp-voice-id" class="review-select" type="text" placeholder="e.g. Kore (Gemini) or voiceId (EL)" /></label>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="vp-cancel" class="btn-xs">Cancel</button>
          <button id="vp-apply" class="btn-xs primary">Apply + Regen</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cancel = () => overlay.remove();
    overlay.querySelector('#vp-cancel').addEventListener('click', cancel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cancel(); });
    overlay.querySelector('#vp-apply').addEventListener('click', () => {
      const provider = overlay.querySelector('#vp-provider').value;
      const voiceId = overlay.querySelector('#vp-voice-id').value.trim();
      if (!voiceId) return;
      line.voiceOverride = line.voiceOverride || {};
      line.voiceOverride.voiceId = voiceId;
      line.voiceOverride.voiceProvider = provider;
      overlay.remove();
      const card = document.querySelector(`.scene-audio-section[data-scene-idx="${idx}"]`)?.closest('.scene-card');
      if (card) _regenSceneAudio(idx, lineIdx, card);
    });
  }

  // ── Audio rehearsal step ──────────────────────────────────────────────────

  function detectProjectAudioMode() {
    const scenes = window.createScenes || [];
    const dialogueScenes = scenes.filter(s => (s.dialogueLines || []).some(l => l.speakerCharacterId && l.speakerCharacterId !== 'narrator'));
    const narrationScenes = scenes.filter(s => (s.dialogueLines || []).length > 0 && (s.dialogueLines || []).every(l => l.speakerCharacterId === 'narrator'));
    if (dialogueScenes.length > 0) return 'rehearsal';
    if (narrationScenes.length > 0) return 'narration-preview';
    return 'no-audio';
  }
  window.detectProjectAudioMode = detectProjectAudioMode;

  let _rehearsalPlaying = false;
  let _rehearsalAudioSrc = null;
  let _rehearsalAudioCtx = null;
  let _rehearsalT0 = null;
  let _rehearsalAnimFrame = null;
  let _rehearsalPausedAt = 0;

  function _ensureAudioCtx() {
    if (!_rehearsalAudioCtx || _rehearsalAudioCtx.state === 'closed') {
      _rehearsalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_rehearsalAudioCtx.state === 'suspended') _rehearsalAudioCtx.resume();
    return _rehearsalAudioCtx;
  }

  function _fmtTime(s) {
    s = Math.max(0, s || 0);
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 10);
    return `${m}:${String(sec).padStart(2, '0')}.${ms}`;
  }

  function renderRehearsalStep() {
    const step = document.getElementById('create-rehearsal-step');
    if (!step) return;
    const scenes = window.createScenes || [];
    const mode = detectProjectAudioMode();
    const stepLabel = mode === 'narration-preview' ? 'Audio preview' : 'Audio rehearsal';
    const someHasVideo = scenes.some(s => s.videoActualDuration != null);

    const totalAudioSec = scenes.reduce((sum, s) => sum + (s.audioActualDuration || 0), 0);
    const canGen = scenes.every(s =>
      (s.audioActualDuration > 0) || ((s.dialogueLines || []).length === 0)
    );

    // Scene strip
    const totalSec = totalAudioSec || 1;
    const sceneTickHtml = scenes.map((s, i) => {
      const pct = ((s.audioActualDuration || 0) / totalSec * 100).toFixed(1);
      return `<div class="rehearsal-tick" data-idx="${i}" style="width:${pct}%;" title="Scene ${i + 1} · ${(s.audioActualDuration || 0).toFixed(1)}s">
        <span class="rehearsal-tick-num">${i + 1}</span>
      </div>`;
    }).join('');

    // Per-scene status rows
    const statusRowsHtml = scenes.map((s, i) => {
      const sLines = s.dialogueLines || [];
      const isBroll = sLines.length === 0;
      const firstLine = sLines[0] || null;
      const isNarrator = firstLine && firstLine.speakerCharacterId === 'narrator';
      const speakerIcon = isBroll ? '🌅' : '🎙';
      const speakerName = isBroll ? 'b-roll' : (firstLine && firstLine.speakerName) || (isNarrator ? 'narrator' : '');
      const start = s.startTime != null ? s.startTime : 0;
      const end = s.endTime != null ? s.endTime : start + (s.audioActualDuration || 0);
      let badgeHtml = '';
      let backLink = '';
      if (!someHasVideo) {
        // First-pass: audio-completion mode
        if (!s.audioActualDuration) {
          badgeHtml = `<span class="rehearsal-status-badge regen">⏳ generating…</span>`;
        } else {
          badgeHtml = `<span class="rehearsal-status-badge ok">✓ ready</span>`;
        }
      } else {
        // Post-video-gen: show ready or generating
        badgeHtml = s.videoActualDuration
          ? `<span class="rehearsal-status-badge ok">✓ ready</span>`
          : `<span class="rehearsal-status-badge regen">⏳ generating…</span>`;
      }
      return `<div class="rehearsal-scene-row" id="rehearsal-row-${i}">
        <span class="rehearsal-scene-num">Scene ${i + 1}</span>
        <span class="rehearsal-scene-time">${_fmtTime(start)}–${_fmtTime(end)}</span>
        <span class="rehearsal-scene-speaker">${speakerIcon} ${sanitize(speakerName)}</span>
        ${badgeHtml}
        ${backLink}
      </div>`;
    }).join('');

    const genBtn = canGen
      ? `<button class="btn-md primary" id="rehearsal-gen-videos-btn">Generate videos $${_estimateVideoCost()} →</button>`
      : `<button class="btn-md" id="rehearsal-gen-videos-btn" disabled title="All scenes need audio first">Generate videos — audio pending</button>`;

    step.innerHTML = `
      <div class="agent-step-header">
        <span class="agent-step-icon">R</span>
        <span class="agent-step-name">${stepLabel}</span>
        <span class="agent-step-status-badge waiting">Preview</span>
      </div>
      <p class="text-sm text-secondary" style="margin-bottom:12px;">Preview your project before generating videos. All audio must be ready.</p>

      <div class="rehearsal-preview-area" id="rehearsal-preview-area">
        <img id="rehearsal-preview-img" class="rehearsal-preview-img" src="" alt="" />
        <div class="rehearsal-preview-overlay" id="rehearsal-preview-overlay"></div>
      </div>

      <div class="rehearsal-transport">
        <div class="rehearsal-transport-row">
          <button class="rehearsal-play-btn btn-xs" id="rehearsal-play-btn">▶ Play</button>
          <button class="btn-xs" id="rehearsal-stop-btn">⏹ Stop</button>
          <span class="rehearsal-time-display" id="rehearsal-time-display">0:00.0 / ${_fmtTime(totalAudioSec)}</span>
        </div>
        <div class="rehearsal-scrubber-track" id="rehearsal-scrubber-track">
          <div class="rehearsal-scrubber-fill" id="rehearsal-scrubber-fill"></div>
          <div class="rehearsal-scrubber-thumb" id="rehearsal-scrubber-thumb"></div>
        </div>
        <div class="rehearsal-tick-strip" id="rehearsal-tick-strip">${sceneTickHtml}</div>
      </div>

      <div class="rehearsal-scene-list">${statusRowsHtml}</div>

      <div class="rehearsal-footer">
        <div class="rehearsal-footer-info">
          Total audio: ${_fmtTime(totalAudioSec)}
        </div>
        <div class="rehearsal-footer-actions">
          <button class="btn-md" id="rehearsal-back-images-btn">← Back to images</button>
          ${genBtn}
        </div>
      </div>
    `;

    // Wire interactions
    _wireRehearsalStep(step);
  }
  window.renderRehearsalStep = renderRehearsalStep;

  function _estimateVideoCost() {
    const scenes = window.createScenes || [];
    const count = scenes.filter(s => Array.isArray(s.dialogueLines) && s.dialogueLines.length > 0 && !s.videoActualDuration).length;
    return (count * 0.40).toFixed(2);
  }

  function _wireRehearsalStep(step) {
    const scenes = window.createScenes || [];

    // Play button
    const playBtn = step.querySelector('#rehearsal-play-btn');
    const stopBtn = step.querySelector('#rehearsal-stop-btn');
    if (playBtn) playBtn.addEventListener('click', () => {
      if (_rehearsalPlaying) _stopRehearsalPreview();
      else _startRehearsalPreview();
    });
    if (stopBtn) stopBtn.addEventListener('click', _stopRehearsalPreview);

    // Scrubber click-to-seek
    const scrubTrack = step.querySelector('#rehearsal-scrubber-track');
    if (scrubTrack) {
      scrubTrack.addEventListener('click', (e) => {
        const rect = scrubTrack.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        const totalSec = scenes.reduce((sum, s) => sum + (s.audioActualDuration || 0), 0);
        _seekRehearsalTo(pct * totalSec);
      });
    }

    // Scene tick strip — click to jump
    step.querySelectorAll('.rehearsal-tick').forEach(tick => {
      tick.addEventListener('click', () => {
        const i = parseInt(tick.dataset.idx, 10);
        if (scenes[i]) _seekRehearsalTo(scenes[i].startTime || 0);
      });
    });

    // Back links (↩ per scene row)
    step.querySelectorAll('.rehearsal-back-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.idx, 10);
        _backToImageCard(i);
      });
    });

    // ← Back to images
    const backBtn = step.querySelector('#rehearsal-back-images-btn');
    if (backBtn) backBtn.addEventListener('click', () => {
      const imgStep = document.getElementById('create-generate-step');
      if (imgStep) imgStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Generate videos
    const genBtn = step.querySelector('#rehearsal-gen-videos-btn');
    if (genBtn && !genBtn.disabled) {
      genBtn.addEventListener('click', _lockAndGenerateVideos);
    }
  }

  function _startRehearsalPreview() {
    const scenes = window.createScenes || [];
    const masterBuf = window._createMasterAudio || window.createAudioBuffer;
    if (!masterBuf) {
      alert('No audio assembled yet — run the storyboard agent first.');
      return;
    }

    const ctx = _ensureAudioCtx();
    _rehearsalAudioSrc = ctx.createBufferSource();
    _rehearsalAudioSrc.buffer = masterBuf;
    _rehearsalAudioSrc.connect(ctx.destination);
    _rehearsalAudioSrc.start(0, _rehearsalPausedAt);
    _rehearsalT0 = ctx.currentTime - _rehearsalPausedAt;
    _rehearsalPlaying = true;

    const playBtn = document.getElementById('rehearsal-play-btn');
    if (playBtn) { playBtn.textContent = '⏸ Pause'; playBtn.classList.add('playing'); }

    _rehearsalAudioSrc.onended = () => {
      if (_rehearsalPlaying) {
        _rehearsalPlaying = false;
        _rehearsalPausedAt = 0;
        const pb = document.getElementById('rehearsal-play-btn');
        if (pb) { pb.textContent = '↻ Replay'; pb.classList.remove('playing'); }
        cancelAnimationFrame(_rehearsalAnimFrame);
      }
    };

    let activeSceneIdx = -1;
    const tick = () => {
      if (!_rehearsalPlaying) return;
      const elapsed = ctx.currentTime - _rehearsalT0;
      const newIdx = scenes.findIndex(s => elapsed >= (s.startTime || 0) && elapsed < (s.endTime || Infinity));
      if (newIdx !== activeSceneIdx) {
        _crossfadeToScene(newIdx);
        _updateRehearsalOverlay(newIdx);
        _updateSceneStrip(newIdx);
        activeSceneIdx = newIdx;
      }
      _updateScrubber(elapsed, scenes.reduce((sum, s) => sum + (s.audioActualDuration || 0), 0));
      _rehearsalAnimFrame = requestAnimationFrame(tick);
    };
    _rehearsalAnimFrame = requestAnimationFrame(tick);
  }

  function _stopRehearsalPreview() {
    _rehearsalPlaying = false;
    if (_rehearsalAudioSrc) { try { _rehearsalAudioSrc.stop(); } catch (_) {} _rehearsalAudioSrc = null; }
    cancelAnimationFrame(_rehearsalAnimFrame);
    _rehearsalPausedAt = 0;
    const playBtn = document.getElementById('rehearsal-play-btn');
    if (playBtn) { playBtn.textContent = '▶ Play'; playBtn.classList.remove('playing'); }
    _updateScrubber(0, 1);
  }

  function _seekRehearsalTo(timeSec) {
    _rehearsalPausedAt = Math.max(0, timeSec);
    if (_rehearsalPlaying) {
      _stopRehearsalPreview();
      _startRehearsalPreview();
    }
  }

  function _crossfadeToScene(idx) {
    const scenes = window.createScenes || [];
    const scene = scenes[idx];
    const img = document.getElementById('rehearsal-preview-img');
    if (!img || !scene) return;
    const newSrc = scene.imgDataUrl || '';
    if (img.src === newSrc) return;
    img.style.opacity = '0';
    img.src = newSrc;
    img.onload = () => {
      img.style.transition = 'opacity 0.2s ease';
      img.style.opacity = '1';
    };
    if (!newSrc) img.style.opacity = '0.3';
  }

  function _updateRehearsalOverlay(idx) {
    const scenes = window.createScenes || [];
    const scene = scenes[idx];
    const el = document.getElementById('rehearsal-preview-overlay');
    if (!el || !scene) return;
    const firstLine = (scene.dialogueLines || [])[0] || null;
    const speakerName = (firstLine && firstLine.speakerName) || '';
    const mood = (firstLine && firstLine.voiceOverride && firstLine.voiceOverride.mood)
      || (typeof window.deriveSceneMood === 'function' ? window.deriveSceneMood(scene) : '');
    el.textContent = `Scene ${idx + 1}${speakerName ? ' · ' + speakerName : ''}${mood ? ' · ' + mood : ''}`;
  }

  function _updateSceneStrip(activeIdx) {
    document.querySelectorAll('.rehearsal-tick').forEach((tick, i) => {
      tick.classList.toggle('active', i === activeIdx);
    });
    const activeRow = document.getElementById(`rehearsal-row-${activeIdx}`);
    if (activeRow) activeRow.classList.add('rehearsal-row-active');
    document.querySelectorAll('.rehearsal-scene-row').forEach((row, i) => {
      if (i !== activeIdx) row.classList.remove('rehearsal-row-active');
    });
  }

  function _updateScrubber(elapsed, totalSec) {
    const pct = Math.min(1, elapsed / Math.max(0.001, totalSec)) * 100;
    const fill = document.getElementById('rehearsal-scrubber-fill');
    const thumb = document.getElementById('rehearsal-scrubber-thumb');
    const display = document.getElementById('rehearsal-time-display');
    if (fill) fill.style.width = pct + '%';
    if (thumb) thumb.style.left = pct + '%';
    if (display) display.textContent = `${_fmtTime(elapsed)} / ${_fmtTime(totalSec)}`;
  }

  function _backToImageCard(idx) {
    const imgStep = document.getElementById('create-generate-step');
    if (imgStep) imgStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      const cards = document.querySelectorAll('.scene-card');
      if (cards[idx]) {
        cards[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        cards[idx].classList.add('scene-card-flash');
        setTimeout(() => cards[idx].classList.remove('scene-card-flash'), 2000);
      }
    }, 500);
  }

  async function _lockAndGenerateVideos() {
    const scenes = window.createScenes || [];
    const provider = window.videoProvider;

    // Pass-2: lock actual audio duration + recompute segmentPlan from real audioMs
    for (const s of scenes) {
      if (s.audioActualDuration) {
        s.durationSec = s.audioActualDuration;
        if (provider && typeof window.planSegments === 'function') {
          const r = window.planSegments({ audioMs: s.audioActualDuration * 1000, provider, scene: s, pass: 'actual' });
          s.segmentPlan        = r.segments;
          s.segmentPlanPass    = 'actual';
          s.generatedDurationSec = r.totalGenSec;
          s.croppedTailSec     = r.croppedTailSec;
          s.durationTier       = r.segments[0]?.durationSec ?? s.durationTier;
        }
      } else if (s.segmentPlanPass !== 'actual' && provider && typeof window.planSegments === 'function') {
        const r = window.planSegments({ audioMs: (s.durationSec || 5) * 1000, provider, scene: s, pass: 'actual' });
        s.segmentPlan        = r.segments;
        s.segmentPlanPass    = 'actual';
        s.generatedDurationSec = r.totalGenSec;
        s.croppedTailSec     = r.croppedTailSec;
        s.durationTier       = r.segments[0]?.durationSec ?? s.durationTier;
      }
    }

    if (window.createJobState) {
      if (!window.createJobState.audioRehearsal) window.createJobState.audioRehearsal = {};
      window.createJobState.audioRehearsal.status = 'locked';
      window.createJobState.audioRehearsal.lockedAt = new Date().toISOString();
    }
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
    // Fire existing video gen flow
    if (typeof launchBgmAgent === 'function') launchBgmAgent();
    const videoStep = document.getElementById('create-video-step');
    if (videoStep) videoStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Phase 7: Wavesurfer speaker-colored regions ────────────────────────────

  window.initEditorSpeakerRegions = function (wavesurferInstance, regionsPlugin) {
    if (!wavesurferInstance || !regionsPlugin) return;
    const turns = window._createSpeakerTurns || [];
    if (!turns.length) return;

    // Remove existing speaker regions
    regionsPlugin.getRegions && Object.values(regionsPlugin.getRegions()).forEach(r => {
      if (r._isSpeakerRegion) r.remove();
    });

    turns.forEach((turn, i) => {
      const color = typeof window.characterTimelineColor === 'function'
        ? window.characterTimelineColor(turn.speakerCharacterId)
        : '#3b82f6';
      const rgbStr = color.startsWith('#')
        ? _hexToRgba(color, 0.25)
        : color.replace(')', ', 0.25)').replace('rgb(', 'rgba(');
      const region = regionsPlugin.addRegion({
        start: turn.startMs / 1000,
        end: turn.endMs / 1000,
        color: rgbStr,
        drag: false,
        resize: false,
        id: `speaker-region-${i}`,
      });
      if (region) region._isSpeakerRegion = true;
    });

    // Context menu on region click
    regionsPlugin.on && regionsPlugin.on('region-clicked', (region, e) => {
      if (!region._isSpeakerRegion) return;
      e.stopPropagation();
      const turnIdx = parseInt(region.id.replace('speaker-region-', ''), 10);
      const turn = turns[turnIdx];
      if (turn) _showRegionContextMenu(turn, turnIdx, e.clientX, e.clientY);
    });
  };

  function _hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function _showRegionContextMenu(turn, turnIdx, x, y) {
    const existing = document.querySelector('.region-context-menu');
    if (existing) existing.remove();
    const scenes = window.createScenes || [];
    const scene = scenes[turn.segmentIndex];
    const dl0 = scene && (scene.dialogueLines || [])[0];
    const dialogueText = dl0 && dl0.text ? dl0.text : '';
    const preview = dialogueText.length > 40 ? dialogueText.slice(0, 40) + '…' : dialogueText;

    const menu = document.createElement('div');
    menu.className = 'region-context-menu';
    const moodSubmenuHtml = (window.MOOD_ENUM || [])
      .map(m => `<div class="rcm-item rcm-submood" data-mood="${m.id}">${m.icon} ${m.label}</div>`)
      .join('');
    menu.innerHTML = `
      <div class="rcm-header">${sanitize(turn.speakerName || turn.speakerCharacterId)} — "${sanitize(preview)}"</div>
      <div class="rcm-item" data-action="play">▶ Play this line</div>
      <div class="rcm-item" data-action="regen">↻ Regenerate this line</div>
      <div class="rcm-item rcm-has-sub" data-action="mood">🎭 Change mood
        <div class="rcm-submenu">${moodSubmenuHtml}</div>
      </div>
      <div class="rcm-item" data-action="replace-voice">🎙 Replace voice this line</div>
      <div class="rcm-item" data-action="mute">${dl0 && dl0.muted ? '🔈 Unmute this line' : '🔇 Mute this line'}</div>
    `;
    menu.style.cssText = `position:fixed;z-index:9999;background:var(--bg-card,#1a1a2e);border:1px solid var(--border,#333);border-radius:8px;padding:4px 0;min-width:200px;box-shadow:0 8px 32px rgba(0,0,0,0.6);`;
    menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
    document.body.appendChild(menu);

    const close = () => { menu.remove(); document.removeEventListener('click', close, true); };
    setTimeout(() => document.addEventListener('click', close, true), 100);

    menu.querySelector('[data-action="play"]').addEventListener('click', () => {
      close();
      if (!scene || !scene._audioUrl) return;
      const a = new Audio(scene._audioUrl);
      a.play().catch(() => {});
    });

    menu.querySelector('[data-action="regen"]').addEventListener('click', () => {
      close();
      _backToImageCard(turn.segmentIndex);
    });

    menu.querySelectorAll('.rcm-submood').forEach(el => {
      el.addEventListener('click', () => {
        close();
        const sceneIdx = turn.segmentIndex;
        const sc = scenes[sceneIdx];
        const scDl0 = sc && (sc.dialogueLines || [])[0];
        if (scDl0) {
          scDl0.voiceOverride = scDl0.voiceOverride || {};
          scDl0.voiceOverride.mood = el.dataset.mood;
          sc._pendingMoodRegen = true;
        }
        _backToImageCard(sceneIdx);
      });
    });

    menu.querySelector('[data-action="replace-voice"]').addEventListener('click', () => {
      close();
      _backToImageCard(turn.segmentIndex);
      setTimeout(() => _showVoicePickerModal(turn.segmentIndex), 600);
    });

    menu.querySelector('[data-action="mute"]').addEventListener('click', () => {
      close();
      if (dl0) {
        dl0.muted = !dl0.muted;
        if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
      }
    });
  }

  // ── Utility ──────────────────────────────────────────────────────────────

  function _hashText(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = Math.imul(31, h) + text.charCodeAt(i) | 0;
    return h.toString(36);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.audioRehearsal = {
    buildAudioSection,
    wireAudioSection,
    renderRehearsalStep,
    detectProjectAudioMode,
  };

  // Register sanitize fallback if 01-core.js not yet loaded
  if (typeof sanitize === 'undefined') {
    window.sanitize = function (s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
  }

})();
