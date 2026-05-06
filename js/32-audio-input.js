// Audio Input — Phases 1-3: Upload, Scribe diarization, Mode selection
// Part of audio-input-plan.md. Produces window.createJobState.inputDoc for the
// diarization path. Consumes alignWordsWithScribe (17a) with diarize: true.

(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────
  const AUDIO_IDB_DB  = 'stori_cast_images_v1';  // same store as cast images
  const AUDIO_IDB_STORE = 'images';
  const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;  // 25 MB (Scribe limit)
  const MIN_DURATION_SEC = 5;
  const SUPPORTED_TYPES = ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/mp3'];
  const SUPPORTED_EXTS  = ['.wav', '.mp3', '.m4a'];

  // ── IDB helpers (same pattern as 17b cast images) ────────────────────────
  let _aiDb = null;
  async function _aiIdbOpen() {
    if (_aiDb) return _aiDb;
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(AUDIO_IDB_DB, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(AUDIO_IDB_STORE)) db.createObjectStore(AUDIO_IDB_STORE);
        };
        req.onsuccess = (e) => { _aiDb = e.target.result; resolve(_aiDb); };
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }
  async function _aiIdbPut(key, value) {
    const db = await _aiIdbOpen();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([AUDIO_IDB_STORE], 'readwrite');
        tx.objectStore(AUDIO_IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }
  async function _aiIdbGet(key) {
    const db = await _aiIdbOpen();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([AUDIO_IDB_STORE], 'readonly');
        const req = tx.objectStore(AUDIO_IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  // ── Audio → base64 data URL (for IDB persistence) ─────────────────────
  async function audioBufferToDataUrl(audioBuffer) {
    if (typeof audioBufferToWavBlob === 'function') {
      const blob = audioBufferToWavBlob(audioBuffer);
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('blob read failed'));
        r.readAsDataURL(blob);
      });
    }
    // fallback: manual WAV encoding
    const sr = audioBuffer.sampleRate;
    const ch = audioBuffer.numberOfChannels;
    const len = audioBuffer.length;
    const buf = new ArrayBuffer(44 + len * ch * 2);
    const view = new DataView(buf);
    function writeStr(off, s) { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); }
    writeStr(0, 'RIFF'); view.setUint32(4, 36 + len * ch * 2, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, ch, true); view.setUint32(24, sr, true);
    view.setUint32(28, sr * ch * 2, true); view.setUint16(32, ch * 2, true);
    view.setUint16(34, 16, true); writeStr(36, 'data'); view.setUint32(40, len * ch * 2, true);
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < ch; c++) {
        const s = Math.max(-1, Math.min(1, audioBuffer.getChannelData(c)[i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
      }
    }
    const blob = new Blob([buf], { type: 'audio/wav' });
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('blob read failed'));
      r.readAsDataURL(blob);
    });
  }

  // ── Mono downmix (for Scribe — better diarization on mono) ─────────────
  function downmixToMono(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) return audioBuffer;
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: audioBuffer.sampleRate });
    const mono = ctx.createBuffer(1, audioBuffer.length, audioBuffer.sampleRate);
    const out = mono.getChannelData(0);
    for (let i = 0; i < audioBuffer.length; i++) {
      let sum = 0;
      for (let c = 0; c < audioBuffer.numberOfChannels; c++) sum += audioBuffer.getChannelData(c)[i];
      out[i] = sum / audioBuffer.numberOfChannels;
    }
    try { ctx.close(); } catch (_) {}
    return mono;
  }

  // ── File → AudioBuffer (handles stereo per EC-AU-04) ────────────────────
  async function fileToAudioBuffer(file) {
    const arrayBuffer = await file.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    try { ctx.close(); } catch (_) {}
    return audioBuffer;
  }

  // ── Diarization confidence score (per §8.1a) ─────────────────────────────
  function computeDiarizationConfidence(alignedWords) {
    if (!alignedWords || !alignedWords.length) return 0;
    const wordsWithSpeaker = alignedWords.filter(w => w.speaker_id !== undefined);
    if (!wordsWithSpeaker.length) return 0;

    // Factor 1: coverage — proportion of words that have speaker labels
    const coverage = wordsWithSpeaker.length / alignedWords.length;

    // Factor 2: avg segment length — longer speaker runs = more stable diarization
    let runs = 1;
    for (let i = 1; i < wordsWithSpeaker.length; i++) {
      if (wordsWithSpeaker[i].speaker_id !== wordsWithSpeaker[i - 1].speaker_id) runs++;
    }
    const avgSegLen = wordsWithSpeaker.length / runs;
    const segScore = Math.min(1, avgSegLen / 20);  // 20+ words/segment = perfect

    // Factor 3: single-word-segment ratio (short isolated words are noise)
    let singleWordSegs = 0;
    let curRun = 1;
    for (let i = 1; i < wordsWithSpeaker.length; i++) {
      if (wordsWithSpeaker[i].speaker_id === wordsWithSpeaker[i - 1].speaker_id) {
        curRun++;
      } else {
        if (curRun === 1) singleWordSegs++;
        curRun = 1;
      }
    }
    if (curRun === 1) singleWordSegs++;
    const singleWordRatio = singleWordSegs / runs;
    const noiseScore = 1 - Math.min(1, singleWordRatio * 2);  // >50% single-word = 0

    // Factor 4: speaker switch frequency (too many switches = misdiarization)
    const duration = alignedWords[alignedWords.length - 1].end - alignedWords[0].start;
    const switchRate = runs / Math.max(1, duration);  // switches per second
    const switchScore = Math.max(0, 1 - switchRate / 2);  // >2/sec = 0

    // Weighted combination
    return Math.round((coverage * 0.3 + segScore * 0.3 + noiseScore * 0.2 + switchScore * 0.2) * 100) / 100;
  }

  // ── Build diarization result from Scribe output ───────────────────────────
  function buildDiarizationResult(alignedWords) {
    const speakerMap = {};
    for (const w of alignedWords) {
      const sid = w.speaker_id || 'speaker_0';
      if (!speakerMap[sid]) speakerMap[sid] = { id: sid, words: [], totalSec: 0, firstWordTime: w.start };
      speakerMap[sid].words.push(w);
      speakerMap[sid].totalSec += (w.end - w.start);
    }
    const speakers = Object.values(speakerMap).map(s => ({
      id: s.id,
      wordCount: s.words.length,
      totalSec: Math.round(s.totalSec * 10) / 10,
      firstWordTime: s.firstWordTime,
      sampleClipIdbKey: 'speaker_sample_' + s.id,
    }));

    // Detect overlapping segments (EC-DI-09) — mark words with multipleSpeakers flag
    const sorted = [...alignedWords].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].end > sorted[i + 1].start && sorted[i].speaker_id !== sorted[i + 1].speaker_id) {
        sorted[i].multipleSpeakers = true;
        sorted[i + 1].multipleSpeakers = true;
      }
    }

    const confidence = computeDiarizationConfidence(alignedWords);
    return {
      speakers,
      alignedWords,
      unmappedSpeakers: [],
      confidence,
    };
  }

  // ── Generate sample clips per speaker and persist to IDB ─────────────────
  // Extracts ~5s of audio around the speaker's most active segment.
  async function generateSpeakerSamples(originalBuffer, diarizationResult) {
    const { speakers, alignedWords } = diarizationResult;
    for (const speaker of speakers) {
      const speakerWords = alignedWords.filter(w => w.speaker_id === speaker.id);
      if (!speakerWords.length) continue;
      // Find longest contiguous run for this speaker
      let bestStart = speakerWords[0].start;
      let bestEnd = Math.min(speakerWords[0].end + 5, originalBuffer.duration);
      let runStart = speakerWords[0].start, runEnd = speakerWords[0].end, runLen = 1;
      let bestRunLen = 1;
      for (let i = 1; i < speakerWords.length; i++) {
        if (speakerWords[i].start - speakerWords[i - 1].end < 2) {
          runEnd = speakerWords[i].end;
          runLen++;
          if (runLen > bestRunLen) {
            bestRunLen = runLen;
            bestStart = runStart;
            bestEnd = Math.min(runEnd, runStart + 5, originalBuffer.duration);
          }
        } else {
          runStart = speakerWords[i].start;
          runEnd = speakerWords[i].end;
          runLen = 1;
        }
      }
      // Slice original buffer (keeps stereo for playback fidelity)
      const sr = originalBuffer.sampleRate;
      const startSample = Math.max(0, Math.floor(bestStart * sr));
      const endSample   = Math.min(originalBuffer.length, Math.ceil(bestEnd * sr));
      const clipLen = endSample - startSample;
      if (clipLen <= 0) continue;
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: sr });
      const clip = ctx.createBuffer(originalBuffer.numberOfChannels, clipLen, sr);
      for (let c = 0; c < originalBuffer.numberOfChannels; c++) {
        clip.getChannelData(c).set(originalBuffer.getChannelData(c).subarray(startSample, endSample));
      }
      try { ctx.close(); } catch (_) {}
      try {
        const dataUrl = await audioBufferToDataUrl(clip);
        await _aiIdbPut(speaker.sampleClipIdbKey, dataUrl);
      } catch (e) {
        console.warn('[AudioInput] sample clip persist failed for', speaker.id, e.message);
      }
    }
  }

  // ── Stage 1 + 2: validate, decode, diarize ───────────────────────────────
  async function processAudioInput(file, onStatus) {
    onStatus = onStatus || function () {};

    // EC-DI-12 — ElevenLabs key gate
    if (typeof getElevenLabsKey === 'function' && !getElevenLabsKey()) {
      throw new Error('ELEVEN_LABS_KEY_MISSING');
    }

    // EC-AU-01 — format check
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const typeOk = SUPPORTED_TYPES.includes(file.type) || SUPPORTED_EXTS.includes(ext);
    if (!typeOk) throw new Error('UNSUPPORTED_FORMAT');

    onStatus('Decoding audio…');
    const originalBuffer = await fileToAudioBuffer(file);

    // EC-AU-03 — too short
    if (originalBuffer.duration < MIN_DURATION_SEC) throw new Error('TOO_SHORT');

    // EC-AU-02 — long recording warning (non-blocking)
    const longWarning = originalBuffer.duration > 3600;

    // EC-AU-06 — low volume warning
    const ch0 = originalBuffer.getChannelData(0);
    let rms = 0;
    for (let i = 0; i < ch0.length; i++) rms += ch0[i] * ch0[i];
    rms = Math.sqrt(rms / ch0.length);
    const lowVolumeWarning = rms < 0.01;

    // Persist project ID for IDB keys
    const projectId = (window.createJobState && window.createJobState.projectId)
      || ('ai_' + Date.now());
    if (window.createJobState) window.createJobState.projectId = window.createJobState.projectId || projectId;

    // Persist original buffer to IDB (EC-DI-10 — survive tab close)
    const rawIdbKey = 'idb_audio_input_' + projectId;
    onStatus('Saving audio…');
    try {
      // EC-AU-05 — size check before persisting
      if (file.size > MAX_FILE_SIZE_BYTES) {
        onStatus('Compressing audio (large file)…');
        // Persist original buffer; Scribe will get mono downmix anyway
      }
      const dataUrl = await audioBufferToDataUrl(originalBuffer);
      await _aiIdbPut(rawIdbKey, dataUrl);
    } catch (e) {
      console.warn('[AudioInput] IDB persist failed:', e.message);
    }

    // Initialize inputDoc
    if (!window.createJobState) window.createJobState = {};
    window.createJobState.inputDoc = {
      format: 'audio',
      rawText: null,
      rawAudioId: rawIdbKey,
      audioFileName: file.name,
      audioDurationSec: Math.round(originalBuffer.duration * 10) / 10,
      audioSampleRate: originalBuffer.sampleRate,
      audioMode: null,
      audioModeLockedAt: null,
      diarizationResult: null,
      speakerMap: {},
      aiSuggestedExtras: [],
      locked: false,
      lockedAt: null,
      parsed: null,
    };

    // Stage 2 — Scribe diarization with mono downmix
    onStatus('Transcribing + detecting speakers (Scribe)…');
    const monoBuffer = downmixToMono(originalBuffer);
    let alignedWords = null;
    let scribeAttempts = 0;
    while (scribeAttempts < 2) {
      try {
        alignedWords = await alignWordsWithScribe(monoBuffer, null, { diarize: true });
        break;
      } catch (e) {
        scribeAttempts++;
        if (scribeAttempts >= 2) throw new Error('SCRIBE_FAILED');
        onStatus('Scribe failed, retrying…');
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!alignedWords) throw new Error('SCRIBE_FAILED');

    // EC-DI-07 — no speaker labels
    const hasSpeakerLabels = alignedWords.some(w => w.speaker_id !== undefined);
    if (!hasSpeakerLabels) {
      // Treat as single speaker
      alignedWords.forEach(w => { w.speaker_id = 'speaker_0'; });
    }

    const diarizationResult = buildDiarizationResult(alignedWords);
    window.createJobState.inputDoc.diarizationResult = diarizationResult;

    // Generate speaker sample clips
    onStatus('Generating speaker clips…');
    await generateSpeakerSamples(originalBuffer, diarizationResult);

    return {
      originalBuffer,
      diarizationResult,
      warnings: {
        longRecording: longWarning,
        lowVolume: lowVolumeWarning,
        lowConfidence: diarizationResult.confidence < 0.5,
      },
    };
  }

  // ── Stage 3: Mode-select modal ────────────────────────────────────────────
  function showAudioModeSelectModal(diarizationResult, warnings, onModeSelected) {
    const existing = document.getElementById('audio-mode-select-modal');
    if (existing) existing.remove();

    const speakers = diarizationResult.speakers || [];
    const totalMin = Math.floor(diarizationResult.speakers.reduce((s, sp) => s + sp.totalSec, 0) / 60);
    const totalSec = Math.round(diarizationResult.speakers.reduce((s, sp) => s + sp.totalSec, 0) % 60);
    const speakerLabel = speakers.length === 1 ? '1 speaker' : `${speakers.length} speakers`;
    const durLabel = totalMin > 0 ? `${totalMin}m ${totalSec}s` : `${totalSec}s`;

    const lowConfWarning = diarizationResult.confidence < 0.5
      ? `<div class="audio-input-warning">⚠ Diarization confidence is low (${Math.round(diarizationResult.confidence * 100)}%). Speaker boundaries may be inaccurate.</div>`
      : diarizationResult.confidence < 0.7
        ? `<div class="audio-input-warning amber">⚠ Speaker detection is approximate (${Math.round(diarizationResult.confidence * 100)}%). Review assignments carefully.</div>`
        : '';
    const longWarn = warnings.longRecording
      ? `<div class="audio-input-warning">⚠ Long recordings may diarize less accurately. Consider splitting.</div>` : '';
    const lowVolWarn = warnings.lowVolume
      ? `<div class="audio-input-warning">⚠ Low volume detected. Consider re-recording or amplifying before import.</div>` : '';

    const modal = document.createElement('div');
    modal.id = 'audio-mode-select-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:520px;">
        <h3 class="modal-title">How should we use this audio?</h3>
        <p class="text-sm text-muted mb-md">
          We detected <strong>${speakerLabel}</strong> in your <strong>${durLabel}</strong> recording.
        </p>
        ${lowConfWarning}${longWarn}${lowVolWarn}

        <div class="audio-mode-options">
          <label class="audio-mode-option active" id="audio-mode-opt-original">
            <input type="radio" name="audio-mode" value="original" checked>
            <div class="audio-mode-option-content">
              <div class="audio-mode-title">● Use my recordings <span class="mode-badge">Default</span></div>
              <div class="audio-mode-desc">Original voices play in the final video. Mood and voice can't be changed since this is your actual recording.</div>
              <div class="audio-mode-hint">Best for: podcasts, documentaries, talking-head videos</div>
            </div>
          </label>

          <label class="audio-mode-option" id="audio-mode-opt-retts">
            <input type="radio" name="audio-mode" value="re-tts">
            <div class="audio-mode-option-content">
              <div class="audio-mode-title">○ Use as a script reference</div>
              <div class="audio-mode-desc">Stori extracts text + speaker assignments + delivery cues, then regenerates audio with cast voices. Original recording is discarded.</div>
              <div class="audio-mode-hint">Best for: animated film, where you voice a scratch take</div>
            </div>
          </label>
        </div>

        <div class="modal-footer" style="margin-top:20px;">
          <button id="audio-mode-back" class="btn-sm">← Re-upload audio</button>
          <button id="audio-mode-continue" class="primary btn-sm">Continue →</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Radio toggle styling
    const opts = modal.querySelectorAll('.audio-mode-option');
    const radios = modal.querySelectorAll('input[name="audio-mode"]');
    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        opts.forEach(o => o.classList.remove('active'));
        radio.closest('.audio-mode-option').classList.add('active');
      });
    });

    modal.querySelector('#audio-mode-back').addEventListener('click', () => {
      modal.remove();
      // Reset inputDoc audio fields so user can re-upload
      if (window.createJobState && window.createJobState.inputDoc) {
        window.createJobState.inputDoc.audioMode = null;
        window.createJobState.inputDoc.diarizationResult = null;
      }
      // Re-show the file picker
      const picker = document.getElementById('create-script-audio-input');
      if (picker) { picker.value = ''; }
      if (typeof audioInputResetUI === 'function') audioInputResetUI();
    });

    modal.querySelector('#audio-mode-continue').addEventListener('click', () => {
      const selected = modal.querySelector('input[name="audio-mode"]:checked');
      const mode = selected ? selected.value : 'original';
      modal.remove();
      if (window.createJobState && window.createJobState.inputDoc) {
        window.createJobState.inputDoc.audioMode = mode;
        window.createJobState.inputDoc.audioModeLockedAt = new Date().toISOString();
      }
      onModeSelected(mode);
    });
  }

  // ── UI reset helper ────────────────────────────────────────────────────────
  function audioInputResetUI() {
    const statusEl = document.getElementById('audio-input-status');
    const nameEl   = document.getElementById('create-script-audio-name');
    const btn      = document.getElementById('btn-create-script-audio');
    if (statusEl) statusEl.textContent = '';
    if (nameEl)   nameEl.textContent = '';
    if (btn) btn.disabled = false;
  }
  window.audioInputResetUI = audioInputResetUI;

  // ── §6.4: Canonical-source sync (aiSuggestedExtras → speakerMap) ─────────
  function syncSpeakerMap(inputDoc) {
    for (const extra of (inputDoc.aiSuggestedExtras || [])) {
      if (!extra.userAccepted) {
        delete inputDoc.speakerMap[extra.sourceSpeakerId];
      } else {
        inputDoc.speakerMap[extra.sourceSpeakerId] = {
          characterId: extra.id,
          source: extra.source || 'ai-suggested-accepted',
        };
      }
    }
    for (const [speakerId, mapping] of Object.entries(inputDoc.speakerMap)) {
      if (mapping.source === 'ai-suggested-accepted' || mapping.source === 'user-created') {
        const stillExists = (inputDoc.aiSuggestedExtras || []).some(
          e => e.id === mapping.characterId && e.userAccepted
        );
        if (!stillExists) {
          inputDoc.speakerMap[speakerId] = { characterId: 'narrator', source: 'rejected-fallback' };
        }
      }
    }
  }
  window.syncSpeakerMap = syncSpeakerMap;

  // ── Character name lookup (charId → display name) ─────────────────────────
  function getCharacterName(charId) {
    if (!charId || charId === 'narrator') return 'Narrator';
    const inputDoc = window.createJobState && window.createJobState.inputDoc;
    if (inputDoc && inputDoc.aiSuggestedExtras) {
      const extra = inputDoc.aiSuggestedExtras.find(e => e.id === charId);
      if (extra) return extra.name;
    }
    const chars = window.createJobState && window.createJobState.characters;
    if (chars) {
      const c = chars.find(c => ('char_' + c.id) === charId || c.id === charId || String(c.id) === charId);
      if (c) return c.name;
    }
    return charId;
  }

  // ── Auto-suggest cast match for a speaker by scanning transcript words ────
  function _autoSuggestCastForSpeaker(speaker, alignedWords, characters) {
    const speakerWords = alignedWords.filter(w => w.speaker_id === speaker.id);
    const snippet = speakerWords.slice(0, 40).map(w => w.word).join(' ').toLowerCase();
    for (const char of (characters || [])) {
      if (!char.locked || !char.name) continue;
      if (snippet.includes(char.name.toLowerCase())) return char;
    }
    return null;
  }

  // ── AI name suggestion for unmapped speaker (Gemini, fire-and-forget) ─────
  async function _aiSuggestExtraName(speaker, alignedWords) {
    const speakerWords = alignedWords.filter(w => w.speaker_id === speaker.id);
    const sample = speakerWords.slice(0, 15).map(w => w.word).join(' ');
    const key = typeof getCreateGeminiKey === 'function' ? getCreateGeminiKey() : null;
    if (!key || typeof callGeminiAPI !== 'function') {
      return 'Speaker ' + speaker.id.replace('speaker_', '');
    }
    try {
      const resp = await callGeminiAPI(['gemini-2.5-flash'], {
        contents: [{ parts: [{ text:
          `Given this dialogue snippet, suggest a short character name (1-3 words, title case, role-based like "Bartender", "Officer", "Doctor"):\n\n"${sample}"\n\nCharacter name only, no explanation:`
        }] }],
      }, key);
      const raw = (resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content &&
                   resp.candidates[0].content.parts && resp.candidates[0].content.parts[0] &&
                   resp.candidates[0].content.parts[0].text || '').trim();
      return raw.slice(0, 40) || ('Speaker ' + speaker.id.replace('speaker_', ''));
    } catch (_) {
      return 'Speaker ' + speaker.id.replace('speaker_', '');
    }
  }

  // ── Build a voice-picker <select> HTML string ─────────────────────────────
  function _buildVoicePickerSelect(selectId, selectedVoiceId, disabled) {
    const geminiVoices = (window.VOICE_CATALOG && window.VOICE_CATALOG.gemini) || [];
    const elVoices = (window.VOICE_CATALOG && window.VOICE_CATALOG.elevenlabs) || [];
    let opts = geminiVoices.map(v =>
      `<option value="gemini:${v.id}" ${selectedVoiceId === v.id ? 'selected' : ''}>${v.name} — ${v.tag}</option>`
    ).join('');
    if (elVoices.length) {
      opts += `<optgroup label="ElevenLabs">` +
        elVoices.map(v =>
          `<option value="elevenlabs:${v.id}" ${selectedVoiceId === v.id ? 'selected' : ''}>${v.name}</option>`
        ).join('') + `</optgroup>`;
    }
    return `<select id="${selectId}" class="ai-extras-voice-select" ${disabled ? 'disabled' : ''}>${opts}</select>`;
  }

  // ── Phase 4: Speaker-mapping modal ────────────────────────────────────────
  function showSpeakerMappingModal(diarizationResult, originalBuffer, mode, onComplete) {
    const existing = document.getElementById('speaker-mapping-modal');
    if (existing) existing.remove();

    const inputDoc = window.createJobState.inputDoc;
    const speakers = diarizationResult.speakers || [];
    const alignedWords = diarizationResult.alignedWords || [];
    const lockedChars = ((window.createJobState && window.createJobState.characters) || []).filter(c => c.locked);
    const confidence = diarizationResult.confidence || 0;

    // Compute line counts per speaker
    const speakerLineCounts = {};
    let currentSpeaker = null;
    for (const w of alignedWords) {
      const sid = w.speaker_id;
      if (sid !== currentSpeaker) {
        speakerLineCounts[sid] = (speakerLineCounts[sid] || 0) + 1;
        currentSpeaker = sid;
      }
    }

    // Auto-suggest cast matches
    const autoSuggestions = {};
    for (const sp of speakers) {
      const match = _autoSuggestCastForSpeaker(sp, alignedWords, lockedChars);
      if (match) autoSuggestions[sp.id] = 'char_' + match.id;
    }

    const confBanner = confidence < 0.5
      ? `<div class="audio-input-warning">⚠ Speaker detection confidence: ${Math.round(confidence * 100)}% — review carefully. Stori may have merged similar voices or split a single speaker.</div>`
      : confidence < 0.7
        ? `<div class="audio-input-warning amber">⚠ Speaker detection is approximate (${Math.round(confidence * 100)}%). Review assignments carefully.</div>`
        : '';

    // Build cast options for dropdown
    function castOptions(speakerId) {
      const charOpts = lockedChars.map(c =>
        `<option value="char_${c.id}" ${autoSuggestions[speakerId] === 'char_' + c.id ? 'selected' : ''}>${c.name}${autoSuggestions[speakerId] === 'char_' + c.id ? ' (suggested)' : ''}</option>`
      ).join('');
      return `<option value="" ${!autoSuggestions[speakerId] ? 'selected' : ''}>— Select character —</option>` +
        charOpts +
        `<option value="narrator">Narrator (voice-over)</option>` +
        `<option value="__new__">+ Create new character</option>`;
    }

    const speakerRows = speakers.map((sp, i) => {
      const firstWords = alignedWords.filter(w => w.speaker_id === sp.id).slice(0, 8).map(w => w.word).join(' ');
      const lineCount = speakerLineCounts[sp.id] || 0;
      return `
        <div class="speaker-map-row" data-speaker-id="${sp.id}">
          <div class="speaker-map-header">
            <span class="speaker-map-label">Speaker ${i + 1}</span>
            <span class="speaker-map-linecount">${lineCount} line${lineCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="speaker-map-sample">
            <button class="speaker-sample-play" data-idb-key="${sp.sampleClipIdbKey}" data-speaker="${sp.id}">▶</button>
            <span class="speaker-map-snippet">"${firstWords}…"</span>
          </div>
          <div class="speaker-map-assign">
            <label class="text-xs text-muted">Map to:</label>
            <select class="speaker-map-select" data-speaker="${sp.id}" id="spmap-${sp.id}">
              ${castOptions(sp.id)}
            </select>
          </div>
          <div class="speaker-map-new-char" id="new-char-form-${sp.id}" style="display:none;">
            <input type="text" class="new-char-name-input" id="new-char-name-${sp.id}" placeholder="Character name…" maxlength="40">
          </div>
        </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'speaker-mapping-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box speaker-mapping-box">
        <h3 class="modal-title">Map detected speakers to your cast</h3>
        <p class="text-sm text-muted mb-md">We diarized ${speakers.length} distinct voice${speakers.length !== 1 ? 's' : ''}. Map each one to a cast character or create a new one.</p>
        ${confBanner}
        <div class="speaker-map-list">${speakerRows}</div>
        <p class="text-xs text-muted" style="margin-top:10px;">Every speaker must be mapped before continuing.</p>
        <div class="modal-footer" style="margin-top:16px;">
          <button id="spmap-back" class="btn-sm">← Back</button>
          <button id="spmap-continue" class="primary btn-sm" disabled>Continue with mapping →</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Wire audio sample players
    modal.querySelectorAll('.speaker-sample-play').forEach(btn => {
      let audio = null;
      btn.addEventListener('click', async () => {
        if (audio && !audio.paused) { audio.pause(); btn.textContent = '▶'; return; }
        const key = btn.dataset.idbKey;
        const dataUrl = await _aiIdbGet(key);
        if (!dataUrl) { btn.textContent = '?'; return; }
        if (!audio) {
          audio = new Audio(dataUrl);
          audio.onended = () => { btn.textContent = '▶'; };
        }
        // EC-DI-11: AudioContext resume must be inside user gesture — Audio element is fine
        audio.currentTime = 0;
        audio.play().catch(() => {});
        btn.textContent = '⏸';
      });
    });

    // Wire show/hide "new character" name input + validate
    function _validateMapping() {
      const selects = modal.querySelectorAll('.speaker-map-select');
      let allMapped = true;
      selects.forEach(sel => {
        const val = sel.value;
        if (!val) { allMapped = false; return; }
        if (val === '__new__') {
          const nameInput = modal.querySelector(`#new-char-name-${sel.dataset.speaker}`);
          if (!nameInput || !nameInput.value.trim()) allMapped = false;
        }
      });
      modal.querySelector('#spmap-continue').disabled = !allMapped;
    }

    modal.querySelectorAll('.speaker-map-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const formDiv = modal.querySelector(`#new-char-form-${sel.dataset.speaker}`);
        if (formDiv) formDiv.style.display = sel.value === '__new__' ? 'block' : 'none';
        _validateMapping();
      });
    });
    modal.querySelectorAll('.new-char-name-input').forEach(inp => {
      inp.addEventListener('input', _validateMapping);
    });
    // Validate initial state (auto-suggestions might already be complete)
    _validateMapping();

    modal.querySelector('#spmap-back').addEventListener('click', () => { modal.remove(); });

    modal.querySelector('#spmap-continue').addEventListener('click', async () => {
      // Collect mappings
      const newCharacterSpeakers = [];
      modal.querySelectorAll('.speaker-map-select').forEach(sel => {
        const speakerId = sel.dataset.speaker;
        const val = sel.value;
        if (val === '__new__') {
          const nameInput = modal.querySelector(`#new-char-name-${speakerId}`);
          newCharacterSpeakers.push({ speakerId, name: (nameInput && nameInput.value.trim()) || 'Extra Character' });
        } else if (val === 'narrator') {
          inputDoc.speakerMap[speakerId] = { characterId: 'narrator', source: 'user-mapped' };
        } else if (val) {
          inputDoc.speakerMap[speakerId] = { characterId: val, source: 'user-mapped' };
        }
      });
      modal.remove();

      if (newCharacterSpeakers.length > 0) {
        // Show AI-suggested extras modal for any "new character" picks
        await showAISuggestedExtrasModal(newCharacterSpeakers, diarizationResult, alignedWords, mode, inputDoc, originalBuffer, onComplete);
      } else {
        // Proceed directly to processing
        await _proceedToProcessing(mode, originalBuffer, alignedWords, inputDoc, onComplete);
      }
    });
  }

  // ── Phase 5: AI-suggested extras modal ───────────────────────────────────
  async function showAISuggestedExtrasModal(newCharSpeakers, diarizationResult, alignedWords, mode, inputDoc, originalBuffer, onComplete) {
    const existing = document.getElementById('ai-extras-modal');
    if (existing) existing.remove();

    const MAX_EXTRAS = 5;
    const currentExtraCount = (inputDoc.aiSuggestedExtras || []).filter(e => e.userAccepted).length;
    const available = Math.max(0, MAX_EXTRAS - currentExtraCount);

    // Cap: if too many new characters, auto-reject lowest line-count ones
    const speakerLineCounts = {};
    let cur = null;
    for (const w of alignedWords) {
      if (w.speaker_id !== cur) { speakerLineCounts[w.speaker_id] = (speakerLineCounts[w.speaker_id] || 0) + 1; cur = w.speaker_id; }
    }
    const sorted = [...newCharSpeakers].sort((a, b) => (speakerLineCounts[b.speakerId] || 0) - (speakerLineCounts[a.speakerId] || 0));
    const toShow = sorted.slice(0, available);
    const autoRejected = sorted.slice(available);

    // AI-suggest names for each (fire in parallel)
    const speakerData = await Promise.all(toShow.map(async (sp, i) => {
      const speaker = diarizationResult.speakers.find(s => s.id === sp.speakerId);
      const lineCount = speakerLineCounts[sp.speakerId] || 0;
      const firstWords = alignedWords.filter(w => w.speaker_id === sp.speakerId).slice(0, 8).map(w => w.word).join(' ');
      // Use user-typed name as primary; AI refines only if it looks generic
      const suggestedName = sp.name && sp.name !== 'Extra Character' ? sp.name : await _aiSuggestExtraName(speaker || sp, alignedWords);
      const defaultVoice = (window.VOICE_CATALOG && window.VOICE_CATALOG.gemini && window.VOICE_CATALOG.gemini[i % 8]) || { id: 'Kore', name: 'Kore' };
      return { speakerId: sp.speakerId, name: suggestedName, lineCount, firstWords, sampleKey: (speaker || {}).sampleClipIdbKey, defaultVoiceId: defaultVoice.id };
    }));

    const capWarning = autoRejected.length > 0
      ? `<div class="audio-input-warning amber">⚠ Too many speakers — Stori supports at most ${MAX_EXTRAS} extra characters. ${autoRejected.length} speaker${autoRejected.length > 1 ? 's' : ''} with the fewest lines will become narrator voice-over.</div>`
      : '';

    const extraRows = speakerData.map((sp, i) => {
      const voicePickerHtml = mode === 'original'
        ? `<span class="text-xs text-muted">n/a — original recording</span>`
        : _buildVoicePickerSelect(`extras-voice-${sp.speakerId}`, sp.defaultVoiceId, false);
      return `
        <div class="ai-extra-row" data-speaker="${sp.speakerId}" id="extra-row-${sp.speakerId}">
          <div class="ai-extra-header">
            <button class="speaker-sample-play" data-idb-key="${sp.sampleKey || ''}" data-speaker="${sp.speakerId}">▶</button>
            <input type="text" class="ai-extra-name-input" id="extra-name-${sp.speakerId}" value="${sp.name}" maxlength="40">
            <span class="ai-extra-linecount">${sp.lineCount} line${sp.lineCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="ai-extra-firstline text-xs text-muted">"${sp.firstWords}…"</div>
          <div class="ai-extra-actions">
            <button class="ai-extra-accept btn-sm primary" data-speaker="${sp.speakerId}">✓ Accept</button>
            <button class="ai-extra-reject btn-sm" data-speaker="${sp.speakerId}">✗ Reject (→ narrator)</button>
            <div class="ai-extra-voice-row" id="extra-voice-row-${sp.speakerId}" style="display:none;">
              <label class="text-xs text-muted">Voice:</label>
              ${voicePickerHtml}
            </div>
          </div>
          <div class="ai-extra-status" id="extra-status-${sp.speakerId}"></div>
        </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'ai-extras-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box ai-extras-box">
        <h3 class="modal-title">Create characters for new speakers</h3>
        <p class="text-sm text-muted mb-md">
          ${speakerData.length} speaker${speakerData.length !== 1 ? 's' : ''} ${speakerData.length !== 1 ? 'were' : 'was'} mapped to new characters.
          Accept each to create them, or reject to merge into narrator voice-over.
        </p>
        ${capWarning}
        <div class="ai-extras-list">${extraRows}</div>
        <div class="ai-extras-cap-note text-xs text-muted" style="margin-top:8px;">
          <span id="extras-cap-display">${toShow.length} / ${MAX_EXTRAS} extras</span>
        </div>
        <div class="modal-footer" style="margin-top:16px;">
          <button id="extras-back" class="btn-sm">← Back</button>
          <button id="extras-continue" class="primary btn-sm">Continue with mapping →</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Track accept/reject state per speaker
    const state = {};
    speakerData.forEach(sp => { state[sp.speakerId] = { accepted: false, rejected: false }; });

    // Wire sample players
    modal.querySelectorAll('.speaker-sample-play').forEach(btn => {
      let audio = null;
      btn.addEventListener('click', async () => {
        if (audio && !audio.paused) { audio.pause(); btn.textContent = '▶'; return; }
        const key = btn.dataset.idbKey;
        if (!key) return;
        const dataUrl = await _aiIdbGet(key);
        if (!dataUrl) { btn.textContent = '?'; return; }
        if (!audio) { audio = new Audio(dataUrl); audio.onended = () => { btn.textContent = '▶'; }; }
        audio.currentTime = 0;
        audio.play().catch(() => {});
        btn.textContent = '⏸';
      });
    });

    // Wire accept/reject
    modal.querySelectorAll('.ai-extra-accept').forEach(btn => {
      btn.addEventListener('click', () => {
        const speakerId = btn.dataset.speaker;
        state[speakerId].accepted = true;
        state[speakerId].rejected = false;
        btn.classList.add('active');
        modal.querySelector(`.ai-extra-reject[data-speaker="${speakerId}"]`).classList.remove('active');
        const voiceRow = modal.querySelector(`#extra-voice-row-${speakerId}`);
        if (voiceRow) voiceRow.style.display = mode === 'original' ? 'none' : 'flex';
        modal.querySelector(`#extra-status-${speakerId}`).textContent = '';
        btn.closest('.ai-extra-row').classList.add('accepted');
        btn.closest('.ai-extra-row').classList.remove('rejected');
      });
    });
    modal.querySelectorAll('.ai-extra-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        const speakerId = btn.dataset.speaker;
        state[speakerId].accepted = false;
        state[speakerId].rejected = true;
        btn.classList.add('active');
        modal.querySelector(`.ai-extra-accept[data-speaker="${speakerId}"]`).classList.remove('active');
        const voiceRow = modal.querySelector(`#extra-voice-row-${speakerId}`);
        if (voiceRow) voiceRow.style.display = 'none';
        modal.querySelector(`#extra-status-${speakerId}`).textContent = '→ Lines will become narrator voice-over';
        btn.closest('.ai-extra-row').classList.remove('accepted');
        btn.closest('.ai-extra-row').classList.add('rejected');
      });
    });

    modal.querySelector('#extras-back').addEventListener('click', () => { modal.remove(); });

    modal.querySelector('#extras-continue').addEventListener('click', () => {
      // Build aiSuggestedExtras entries
      inputDoc.aiSuggestedExtras = inputDoc.aiSuggestedExtras || [];
      speakerData.forEach(sp => {
        const accepted = state[sp.speakerId].accepted;
        const nameInput = modal.querySelector(`#extra-name-${sp.speakerId}`);
        const name = (nameInput && nameInput.value.trim()) || sp.name;
        const charId = 'char_extra_' + sp.speakerId.replace(/\W/g, '_');

        // Resolve voice choice
        let voice = { provider: 'gemini', voiceId: sp.defaultVoiceId };
        if (mode !== 'original') {
          const voiceSel = modal.querySelector(`#extras-voice-${sp.speakerId}`);
          if (voiceSel && voiceSel.value) {
            const [provider, voiceId] = voiceSel.value.split(':');
            voice = { provider, voiceId };
          }
        }

        const entry = {
          id: charId,
          name,
          voice,
          sourceSpeakerId: sp.speakerId,
          userAccepted: accepted,
          source: accepted ? 'ai-suggested-accepted' : 'rejected',
          sourceLineSnippet: sp.firstWords,
        };

        // Remove any existing entry for this speaker, then push
        inputDoc.aiSuggestedExtras = inputDoc.aiSuggestedExtras.filter(e => e.sourceSpeakerId !== sp.speakerId);
        inputDoc.aiSuggestedExtras.push(entry);

        // If accepted, also add to window.createJobState.characters for downstream cast access
        if (accepted) {
          if (!window.createJobState.characters) window.createJobState.characters = [];
          const exists = window.createJobState.characters.find(c => c.id === charId);
          if (!exists) {
            window.createJobState.characters.push({
              id: charId,
              name,
              voice,
              locked: true,
              isAudioInputExtra: true,
            });
          }
        }
      });

      // Auto-reject overflowed speakers → narrator
      autoRejected.forEach(sp => {
        inputDoc.speakerMap[sp.speakerId] = { characterId: 'narrator', source: 'cap-overflow' };
      });

      syncSpeakerMap(inputDoc);
      modal.remove();
      _proceedToProcessing(mode, originalBuffer, diarizationResult.alignedWords, inputDoc, onComplete);
    });
  }

  // ── Stage 5 dispatch: route to Mode A or Mode B processing ───────────────
  async function _proceedToProcessing(mode, originalBuffer, alignedWords, inputDoc, onComplete) {
    const statusEl = document.getElementById('audio-input-status');
    function setStatus(msg) { if (statusEl) statusEl.textContent = '⏳ ' + msg; }

    try {
      // ★ Style gate — skipped when subStyle already set (e.g. brainstorm handoff)
      if (typeof window.runStyleGate === 'function') await window.runStyleGate();

      let dialogueLines;
      setStatus(mode === 'original' ? 'Processing audio segments…' : 'Extracting script from audio…');

      if (mode === 'original') {
        dialogueLines = await processOriginalAudio(originalBuffer, alignedWords, inputDoc.speakerMap);
        // Store original buffer as master
        window._createMasterAudio = originalBuffer;
        // Infer visual context for storyboard agent
        setStatus('Inferring scene context from dialogue…');
        const inferResult = await inferSettingAndActionsFromDialogue(dialogueLines);
        inputDoc.parsed = {
          sceneHeadings: inferResult.sceneHeadings || null,
          sceneBreaks: null,
          dialogueLines,
          actionLines: inferResult.actionLines || [],
          detectedSpeakers: Object.values(inputDoc.speakerMap),
        };
      } else {
        // Re-TTS mode
        setStatus('Re-generating audio with cast voices…');
        dialogueLines = await processReTTS(originalBuffer, alignedWords, inputDoc.speakerMap, setStatus);
        inputDoc.parsed = {
          sceneHeadings: null,
          sceneBreaks: null,
          dialogueLines,
          actionLines: [],
          detectedSpeakers: Object.values(inputDoc.speakerMap),
        };
      }

      // Lock the inputDoc
      inputDoc.locked = true;
      inputDoc.lockedAt = new Date().toISOString();

      if (statusEl) statusEl.textContent = `✓ Ready — ${dialogueLines.length} dialogue lines`;
      if (onComplete) onComplete({ mode, dialogueLines, inputDoc });
    } catch (e) {
      if (statusEl) statusEl.textContent = '❌ Processing failed: ' + e.message;
      console.error('[AudioInput] _proceedToProcessing failed:', e);
    }
  }

  // ── §9.1 Mode A — Original audio: speaker-boundary slicing ───────────────
  async function processOriginalAudio(audioBuffer, alignedWords, speakerMap) {
    const dialogueLines = [];
    let currentSpeaker = null;
    let currentLine = null;

    for (const word of alignedWords) {
      const charId = (speakerMap[word.speaker_id] && speakerMap[word.speaker_id].characterId) || 'narrator';
      const isVoiceOver = (charId === 'narrator');
      if (charId !== currentSpeaker) {
        if (currentLine) dialogueLines.push(currentLine);
        currentLine = {
          speakerName: getCharacterName(charId),
          speakerCharacterId: charId,
          text: word.word,
          speakerConfidence: 1.0,
          mood: 'matter-of-fact',
          moodConfidence: null,
          sourceMode: 'audio-input',
          audioSegmentStartMs: word.start * 1000,
          audioSegmentEndMs: word.end * 1000,
          isVoiceOver,
          muted: false,
          regenCount: 0,
          regenLockToken: null,
          performanceCue: null,
          sourceLineNum: null,
          isExtraSpeaker: speakerMap[word.speaker_id] && (speakerMap[word.speaker_id].source === 'ai-suggested-accepted'),
        };
        currentSpeaker = charId;
      } else {
        currentLine.text += ' ' + word.word;
        currentLine.audioSegmentEndMs = word.end * 1000;
      }
    }
    if (currentLine) dialogueLines.push(currentLine);
    return dialogueLines;
  }

  // ── §9.1a Setting + action inference for image-gen prompts ────────────────
  async function inferSettingAndActionsFromDialogue(dialogueLines) {
    const key = typeof getCreateGeminiKey === 'function' ? getCreateGeminiKey() : null;
    const fallback = { sceneHeadings: null, actionLines: dialogueLines.map(() => ({ actions: 'Characters speaking in conversation' })) };
    if (!key || typeof callGeminiAPI !== 'function') return fallback;
    const transcript = dialogueLines.map(d => `${d.speakerName}: "${d.text}"`).join('\n').slice(0, 30000);
    try {
      const resp = await callGeminiAPI(['gemini-2.5-flash'], {
        contents: [{ parts: [{ text:
          `Given this dialogue transcript, infer the visual context for each segment.\nReturn ONLY JSON, no commentary.\n\nFor each segment, infer:\n- setting: location + time of day + indoor/outdoor (concise phrase)\n- actions: characters' physical actions and body language (concise list)\n- atmosphere: overall tone/mood of the scene\n\nGroup consecutive lines into scene-like segments where the setting feels stable.\n\nSchema:\n[{ "segmentIndex": 0, "lineIndices": [0, 1, 2], "setting": "Kitchen, morning, indoor",\n   "actions": "Maya stands at counter; Joe enters from doorway",\n   "atmosphere": "tense, charged" }]\n\nTranscript:\n${transcript}`
        }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }, key);
      const raw = resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content &&
                  resp.candidates[0].content.parts && resp.candidates[0].content.parts[0] &&
                  resp.candidates[0].content.parts[0].text || '[]';
      const parsed = typeof parseGeminiJson === 'function' ? parseGeminiJson(raw) : JSON.parse(raw);
      if (!Array.isArray(parsed)) return fallback;
      const actionLines = dialogueLines.map(() => ({ actions: 'Characters speaking in conversation' }));
      const sceneHeadings = [];
      for (const seg of parsed) {
        if (seg.setting) sceneHeadings.push({ text: seg.setting, lineIndices: seg.lineIndices || [] });
        for (const li of (seg.lineIndices || [])) {
          if (actionLines[li]) actionLines[li] = { actions: seg.actions || '', atmosphere: seg.atmosphere || '' };
        }
      }
      return { sceneHeadings, actionLines };
    } catch (e) {
      console.warn('[AudioInput] inferSettingAndActionsFromDialogue failed:', e.message);
      return fallback;
    }
  }

  // ── §9.2 Mode B — Re-TTS: extract text, detect tone, run multi-voice TTS ─
  async function processReTTS(audioBuffer, alignedWords, speakerMap, setStatus) {
    setStatus = setStatus || function () {};

    // Step 1: extract per-line text by speaker
    const lines = [];
    let currentSpeaker = null;
    let currentText = '';
    let currentStart = 0;
    let currentEnd = 0;

    for (const word of alignedWords) {
      const charId = (speakerMap[word.speaker_id] && speakerMap[word.speaker_id].characterId) || 'narrator';
      if (charId !== currentSpeaker) {
        if (currentText) {
          lines.push({
            speakerCharacterId: currentSpeaker,
            text: currentText.trim(),
            originalStart: currentStart,
            originalEnd: currentEnd,
            isVoiceOver: (currentSpeaker === 'narrator'),
          });
        }
        currentSpeaker = charId;
        currentText = word.word;
        currentStart = word.start;
        currentEnd = word.end;
      } else {
        currentText += ' ' + word.word;
        currentEnd = word.end;
      }
    }
    if (currentText) lines.push({
      speakerCharacterId: currentSpeaker,
      text: currentText.trim(),
      originalStart: currentStart,
      originalEnd: currentEnd,
      isVoiceOver: (currentSpeaker === 'narrator'),
    });

    // Step 2: tone detection in batches of 30
    setStatus('Detecting delivery tones from audio…');
    const BATCH = 30;
    const lineMoods = new Array(lines.length).fill('matter-of-fact');
    const key = typeof getCreateGeminiKey === 'function' ? getCreateGeminiKey() : null;
    if (key && typeof callGeminiAPI === 'function') {
      for (let i = 0; i < lines.length; i += BATCH) {
        const batch = lines.slice(i, i + BATCH);
        try {
          const batchDesc = batch.map((l, bi) =>
            `Line ${i + bi}: [${l.speakerCharacterId}] "${l.text.slice(0, 120)}"`
          ).join('\n');
          const resp = await callGeminiAPI(['gemini-2.5-flash'], {
            contents: [{ parts: [{ text:
              `Classify the emotional tone of each line. Return ONLY JSON — array of { "lineIdx": int, "tone": string, "confidence": number 0..1 }.\n\nEnum: [matter-of-fact, calm, warm, serious, excited, angry, sad, whispered, playful, concerned, urgent, sarcastic]\n\nLines:\n${batchDesc}`
            }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }, key);
          const raw = resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content &&
                      resp.candidates[0].content.parts && resp.candidates[0].content.parts[0] &&
                      resp.candidates[0].content.parts[0].text || '[]';
          const moods = typeof parseGeminiJson === 'function' ? parseGeminiJson(raw) : JSON.parse(raw);
          if (Array.isArray(moods)) {
            for (const m of moods) {
              if (typeof m.lineIdx === 'number' && m.tone) lineMoods[m.lineIdx] = m.tone;
            }
          }
        } catch (e) {
          console.warn('[AudioInput] tone detection batch failed:', e.message);
        }
      }
    }

    // Step 3: hand to multi-voice TTS
    setStatus('Generating voice audio…');
    if (typeof castGenerateMultiVoiceAudio !== 'function') {
      throw new Error('castGenerateMultiVoiceAudio not available');
    }
    const segments = lines.map((l, i) => ({
      dialogue: {
        speakerCharacterId: l.speakerCharacterId,
        text: l.text,
        isVoiceOver: l.isVoiceOver,
      },
      performance: { tone: lineMoods[i] || 'matter-of-fact' },
    }));

    const reTtsResult = await castGenerateMultiVoiceAudio(segments, {
      onProgress: (msg) => setStatus(msg),
    });

    // Store master audio buffer
    window._createMasterAudio = reTtsResult.combinedAudioBuffer;

    // Persist per-scene audio slices
    if (typeof window.persistPerSceneAudio === 'function' && reTtsResult.speakerTurns) {
      await window.persistPerSceneAudio(segments, reTtsResult.speakerTurns);
    }

    // Build unified dialogueLines output
    return lines.map((l, i) => ({
      speakerName: getCharacterName(l.speakerCharacterId),
      speakerCharacterId: l.speakerCharacterId,
      text: l.text,
      speakerConfidence: 1.0,
      mood: lineMoods[i] || 'matter-of-fact',
      moodConfidence: 0.7,
      sourceMode: 'audio-input',
      audioSegmentStartMs: null,
      audioSegmentEndMs: null,
      isVoiceOver: l.isVoiceOver,
      muted: false,
      regenCount: 0,
      regenLockToken: null,
      performanceCue: null,
      sourceLineNum: null,
      isExtraSpeaker: speakerMap[(Object.entries(speakerMap).find(([, v]) => v.characterId === l.speakerCharacterId) || [])[0]] &&
                      ['ai-suggested-accepted', 'user-created'].includes(
                        (speakerMap[(Object.entries(speakerMap).find(([, v]) => v.characterId === l.speakerCharacterId) || [])[0]] || {}).source
                      ),
    }));
  }

  // ── Wire up the "Script Audio" section ────────────────────────────────────
  function audioInputInit() {
    const picker = document.getElementById('create-script-audio-input');
    const btn    = document.getElementById('btn-create-script-audio');
    const nameEl = document.getElementById('create-script-audio-name');
    const statusEl = document.getElementById('audio-input-status');
    if (!picker || !btn) return;  // section not in DOM yet

    btn.addEventListener('click', () => {
      // EC-DI-12 — key gate
      if (typeof getElevenLabsKey === 'function' && !getElevenLabsKey()) {
        alert('Audio input requires an ElevenLabs API key. Configure it in Voice Settings before uploading.');
        return;
      }
      picker.click();
    });

    picker.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      btn.disabled = true;
      nameEl.textContent = file.name;
      if (statusEl) statusEl.textContent = '⏳ Processing…';

      try {
        const result = await processAudioInput(file, (msg) => {
          if (statusEl) statusEl.textContent = '⏳ ' + msg;
        });

        if (statusEl) statusEl.textContent = `✓ ${result.diarizationResult.speakers.length} speakers detected`;

        showAudioModeSelectModal(result.diarizationResult, result.warnings, (mode) => {
          if (statusEl) statusEl.textContent = `✓ Mode: ${mode === 'original' ? 'Use recordings' : 'Script reference'}`;
          btn.disabled = false;
          if (typeof updateCreateButtons === 'function') updateCreateButtons();
          if (typeof updateStepStates === 'function') updateStepStates();
          showSpeakerMappingModal(result.diarizationResult, result.originalBuffer, mode, (finalResult) => {
            if (statusEl) statusEl.textContent = `✓ ${finalResult.dialogueLines.length} lines ready — ${mode === 'original' ? 'original audio' : 're-TTS'}`;
            if (typeof updateCreateButtons === 'function') updateCreateButtons();
            if (typeof updateStepStates === 'function') updateStepStates();
          });
        });
      } catch (e) {
        btn.disabled = false;
        picker.value = '';
        nameEl.textContent = '';
        if (statusEl) {
          const msgMap = {
            'ELEVEN_LABS_KEY_MISSING': '❌ ElevenLabs key required for audio input.',
            'UNSUPPORTED_FORMAT': '❌ Unsupported format. Use WAV, MP3, or M4A.',
            'TOO_SHORT': '❌ Too short — need at least 5 seconds.',
            'SCRIBE_FAILED': '❌ Diarization failed. Check your ElevenLabs key or try again.',
          };
          statusEl.textContent = msgMap[e.message] || ('❌ ' + e.message);
        }
        console.error('[AudioInput] processing failed:', e.message);
      }
    });
  }

  // Initialize on DOMContentLoaded or immediately if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', audioInputInit);
  } else {
    audioInputInit();
  }

  // Expose for testing
  window._audioInputProcessAudioInput = processAudioInput;
  window._audioInputComputeConfidence = computeDiarizationConfidence;
  window._audioInputBuildDiarizationResult = buildDiarizationResult;
})();
