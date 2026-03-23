// ══════════════════════════════════════════
//  PROJECT SAVE / LOAD + GALLERY (IndexedDB)
// ══════════════════════════════════════════
const btnSaveProject = $('btn-save-project');
const btnLoadProject = $('btn-load-project');
const projectInput = $('project-input');

// ── IndexedDB Gallery ──
const GALLERY_DB_NAME = 'stori_projects';
let galleryDbVersion = 1;
let galleryDb = null;
const GALLERY_STORE = 'projects';

function openGalleryDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(GALLERY_DB_NAME, galleryDbVersion);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(GALLERY_STORE)) {
        const store = db.createObjectStore(GALLERY_STORE, { keyPath: 'id' });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };
    req.onsuccess = () => { galleryDb = req.result; resolve(galleryDb); };
    req.onerror = () => reject(req.error);
  });
}

async function saveProjectToGallery(jsonStr, name) {
  const db = galleryDb || await openGalleryDb();
  // Generate thumbnail
  let thumbnailDataUrl = '';
  try {
    if (photoItems.length > 0 || textItems.length > 0) {
      const sorted = [...photoItems].sort((a, b) => a.startTime - b.startTime);
      const sortedTexts = [...textItems].sort((a, b) => a.startTime - b.startTime);
      const tc = document.createElement('canvas');
      tc.width = 320; tc.height = 180;
      const tctx = tc.getContext('2d');
      const { width, height } = getSelectedImageSize();
      const scale = Math.min(320 / width, 180 / height);
      tctx.scale(scale, scale);
      renderTimelineFrame(tctx, width, height, 0.5, sorted);
      renderPiP(tctx, width, height, 0.5);
      renderTextOverlays(tctx, width, height, 0.5, sortedTexts);
      thumbnailDataUrl = tc.toDataURL('image/jpeg', 0.6);
    }
  } catch(e) { console.warn('Thumbnail error:', e); }

  // Read series inputs
  const seriesEl = $('series-name');
  const epEl = $('episode-number');
  if (seriesEl) currentSeriesName = seriesEl.value.trim();
  if (epEl) currentEpisodeNumber = parseInt(epEl.value) || 0;

  const meta = {
    id: name + '_' + Date.now(),
    name,
    savedAt: new Date().toISOString(),
    duration: currentBuffer ? currentBuffer.duration : 0,
    photoCount: photoItems.length,
    textCount: textItems.length,
    thumbnail: thumbnailDataUrl,
    projectJson: jsonStr,
    seriesName: currentSeriesName || '',
    episodeNumber: currentEpisodeNumber || 0,
    stylePrompt: createStylePrompt || '',
    stylePreset: createStylePreset || '',
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(GALLERY_STORE, 'readwrite');
    tx.objectStore(GALLERY_STORE).put(meta);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getGalleryProjects() {
  const db = galleryDb || await openGalleryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GALLERY_STORE, 'readonly');
    const req = tx.objectStore(GALLERY_STORE).index('savedAt').openCursor(null, 'prev');
    const results = [];
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && results.length < 20) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

async function deleteGalleryProject(id) {
  const db = galleryDb || await openGalleryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GALLERY_STORE, 'readwrite');
    tx.objectStore(GALLERY_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function clearGallery() {
  const db = galleryDb || await openGalleryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GALLERY_STORE, 'readwrite');
    tx.objectStore(GALLERY_STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function createGalleryCard(p) {
  const card = document.createElement('div');
  card.className = 'gallery-card';
  const thumbSrc = p.thumbnail || '';
  const durStr = p.duration ? fmtShort(p.duration) : '—';
  const d = new Date(p.savedAt);
  const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const epLabel = p.episodeNumber ? `Ep ${p.episodeNumber} · ` : '';
  card.innerHTML = `
    ${thumbSrc ? `<img class="gallery-card-thumb" src="${thumbSrc}" alt="">` : `<div class="gallery-card-thumb" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:1.5rem;">🎬</div>`}
    <div class="gallery-card-info">
      <div class="gallery-card-name">${p.name}</div>
      <div class="gallery-card-meta">${epLabel}${durStr} · ${p.photoCount || 0} photos · ${dateStr}</div>
    </div>
    <button class="gallery-card-delete" title="Delete">✕</button>
  `;
  card.querySelector('.gallery-card-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm(`Delete "${p.name}"?`)) {
      await deleteGalleryProject(p.id);
      renderProjectGallery();
    }
  });
  card.addEventListener('click', async () => {
    if (!p.projectJson) return;
    try {
      setStatus('Loading project from gallery...');
      // Restore series metadata
      currentSeriesName = p.seriesName || '';
      currentEpisodeNumber = p.episodeNumber || 0;
      const seriesEl = $('series-name');
      const epEl = $('episode-number');
      if (seriesEl) seriesEl.value = currentSeriesName;
      if (epEl) epEl.value = currentEpisodeNumber || '';
      // Load project via existing file load logic
      const blob = new Blob([p.projectJson], { type: 'application/json' });
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'gallery.aptproj', { type: 'application/json' }));
      projectInput.files = dt.files;
      projectInput.dispatchEvent(new Event('change'));
    } catch(e) { setStatus('Gallery load error: ' + e.message); }
  });
  return card;
}

async function renderProjectGallery() {
  const galleryEl = $('project-gallery');
  const gridEl = $('gallery-grid');
  const clearBtn = $('btn-gallery-clear');
  if (!galleryEl || !gridEl) return;
  try {
    const projects = await getGalleryProjects();
    if (projects.length === 0) { galleryEl.style.display = 'none'; return; }

    galleryEl.style.display = '';
    clearBtn.style.display = projects.length > 1 ? '' : 'none';
    gridEl.innerHTML = '';

    // Group by series
    const seriesMap = new Map();
    const standalone = [];
    for (const p of projects) {
      if (p.seriesName) {
        if (!seriesMap.has(p.seriesName)) seriesMap.set(p.seriesName, []);
        seriesMap.get(p.seriesName).push(p);
      } else {
        standalone.push(p);
      }
    }

    // Render series groups
    for (const [name, episodes] of seriesMap) {
      episodes.sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0));
      const group = document.createElement('div');
      group.className = 'series-group';
      const header = document.createElement('div');
      header.className = 'series-header';
      header.innerHTML = `
        <span class="series-title">📺 ${name}</span>
        <span class="series-ep-count">${episodes.length} episode${episodes.length > 1 ? 's' : ''}</span>
        <button class="series-new-episode">+ New Episode</button>
      `;
      header.querySelector('.series-new-episode').addEventListener('click', () => {
        currentSeriesName = name;
        currentEpisodeNumber = episodes.length + 1;
        const seriesEl = $('series-name');
        const epEl = $('episode-number');
        if (seriesEl) seriesEl.value = currentSeriesName;
        if (epEl) epEl.value = currentEpisodeNumber;
        // Inherit style from last episode
        const lastEp = episodes[episodes.length - 1];
        if (lastEp.stylePrompt) {
          createStylePrompt = lastEp.stylePrompt;
          createStylePreset = lastEp.stylePreset || 'custom';
          const spEl = $('create-style-preset');
          const stEl = $('create-style-prompt');
          if (spEl) spEl.value = createStylePreset;
          if (stEl) { stEl.value = createStylePrompt; stEl.disabled = createStylePreset !== 'custom'; }
        }
        // Navigate to Create Content
        btnCreateContent.click();
      });
      group.appendChild(header);
      const innerGrid = document.createElement('div');
      innerGrid.className = 'gallery-grid';
      for (const ep of episodes) {
        innerGrid.appendChild(createGalleryCard(ep));
      }
      group.appendChild(innerGrid);
      gridEl.appendChild(group);
    }

    // Render standalone projects
    if (standalone.length > 0) {
      if (seriesMap.size > 0) {
        const label = document.createElement('div');
        label.style.cssText = 'font-size:0.72rem; color:var(--text-muted); margin:12px 0 8px; padding-bottom:4px; border-bottom:1px solid var(--border);';
        label.textContent = 'Other Projects';
        gridEl.appendChild(label);
      }
      const standaloneGrid = document.createElement('div');
      standaloneGrid.className = 'gallery-grid';
      for (const p of standalone) {
        standaloneGrid.appendChild(createGalleryCard(p));
      }
      gridEl.appendChild(standaloneGrid);
    }
  } catch(e) { console.warn('Gallery error:', e); }
}

// Clear all gallery projects
const btnGalleryClear = $('btn-gallery-clear');
if (btnGalleryClear) {
  btnGalleryClear.addEventListener('click', async () => {
    if (!confirm('Delete all saved projects from gallery?')) return;
    await clearGallery();
    renderProjectGallery();
  });
}

// Initialize gallery on load
openGalleryDb().then(() => renderProjectGallery()).catch(e => console.warn('Gallery init error:', e));

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function base64ToArrayBuffer(base64) {
  // Strip data URL prefix if present
  const b64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}

function base64ToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'video/mp4';
  const binary = atob(data);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function saveProjectToFile(audioBuf, statusFn) {
  if (!audioBuf) { statusFn('Nothing to save'); return; }
  statusFn('Saving project...');

  try {
    const wavBlob = audioBufferToWavBlob(audioBuf);
    const audioBase64 = await blobToBase64(wavBlob);

    const project = {
      version: 1,
      type: 'audio-photo-timeline',
      savedAt: new Date().toISOString(),
      audio: {
        data: audioBase64,
        duration: audioBuf.duration,
        sampleRate: audioBuf.sampleRate,
        channels: audioBuf.numberOfChannels,
      },
      photos: await Promise.all(photoItems.map(async p => {
        const obj = {
          id: p.id, imgSrc: p.imgSrc, startTime: p.startTime,
          duration: p.duration, transition: p.transition, transDur: p.transDur, motion: p.motion || 'none',
        };
        if (p.type === 'video') {
          obj.type = 'video';
          obj.videoDuration = p.videoDuration;
          obj.inPoint = p.inPoint;
          obj.outPoint = p.outPoint;
          // Convert blob URL video to base64 for persistence
          if (p.videoSrc) {
            try {
              const resp = await fetch(p.videoSrc);
              const blob = await resp.blob();
              obj.videoData = await blobToBase64(blob);
            } catch(e) { console.warn('Could not save video data:', e); }
          }
        }
        return obj;
      })),
      texts: textItems.map(t => ({
        id: t.id, text: t.text, font: t.font, fontSize: t.fontSize,
        color: t.color, strokeColor: t.strokeColor, strokeWidth: t.strokeWidth,
        bgColor: t.bgColor, bgAlpha: t.bgAlpha, bold: t.bold,
        position: t.position, startTime: t.startTime, duration: t.duration,
        animation: t.animation, animDur: t.animDur,
      })),
      subtitles: subtitleItems.map(s => ({
        id: s.id, text: s.text, font: s.font, fontSize: s.fontSize,
        color: s.color, strokeColor: s.strokeColor, strokeWidth: s.strokeWidth,
        bgColor: s.bgColor || '#000000', bgAlpha: s.bgAlpha, bold: s.bold,
        position: s.position, startTime: s.startTime, duration: s.duration,
        animation: s.animation, animDur: s.animDur,
      })),
      nextPhotoId, nextTextId,
      // Save export & create wizard state
      imageSize: $('create-image-size') ? $('create-image-size').value : '1280x720',
      exportQuality: $('export-quality') ? $('export-quality').value : 'balanced',
      exportFps: $('export-fps') ? $('export-fps').value : '24',
      exportFormat: $('export-format') ? $('export-format').value : 'auto',
      createState: createScenes ? {
        transcript: createTranscript,
        scenes: createScenes.map(s => ({ prompt: s.prompt, startTime: s.startTime, endTime: s.endTime, duration: s.duration, text: s.text, imgDataUrl: s.imgDataUrl })),
        stylePrompt: createStylePrompt || '',
        stylePreset: createStylePreset || '',
      } : undefined,
      // BGM
      bgm: bgmBuffer ? {
        data: await blobToBase64(audioBufferToWavBlob(bgmBuffer)),
        volume: bgmVolume,
        loop: bgmLoop,
      } : undefined,
      // PiP (multiple)
      pipItems: pipItems.length > 0 ? await Promise.all(pipItems.map(async pip => {
        try {
          const resp = await fetch(pip.videoSrc);
          const blob = await resp.blob();
          return {
            videoData: await blobToBase64(blob),
            duration: pip.videoDuration,
            position: pip.position, customX: pip.customX, customY: pip.customY,
            size: pip.size, shape: pip.shape,
            border: pip.border, borderColor: pip.borderColor,
            shadow: pip.shadow,
            inPoint: pip.inPoint, outPoint: pip.outPoint,
            name: pip.name,
          };
        } catch(e) { console.warn('PiP save error:', e); return null; }
      })).then(arr => arr.filter(Boolean)) : undefined,
      // Language tracks
      languageTracks: editorLanguageTracks.length > 0 ? await Promise.all(editorLanguageTracks.map(async t => {
        try {
          if (!t.audioBuffer) return null;
          const wavBlob = audioBufferToWavBlob(t.audioBuffer);
          const audioData = await blobToBase64(wavBlob);
          return {
            lang: t.lang, langCode: t.langCode,
            audioData,
            translatedText: t.translatedText,
            subtitleLang: t.subtitleLang || 'none',
          };
        } catch(e) { return null; }
      })).then(arr => arr.filter(Boolean)) : undefined,
    };

    const json = JSON.stringify(project);
    const blob = new Blob([json], { type: 'application/json' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultName = `project-${timestamp}.aptproj`;

    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultName,
        types: [{ description: 'Project Files', accept: { 'application/json': ['.aptproj'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = defaultName; a.click();
      URL.revokeObjectURL(url);
    }
    statusFn(`Project saved (${(json.length / 1024 / 1024).toFixed(1)} MB)`);
    // Also save to gallery
    try { await saveProjectToGallery(json, defaultName.replace('.aptproj', '')); } catch(e) { console.warn('Gallery save:', e); }
  } catch (e) {
    if (e.name !== 'AbortError') statusFn('Save error: ' + e.message);
  }
}

btnSaveProject.addEventListener('click', () => saveProjectToFile(currentBuffer, setStatus));

btnLoadProject.addEventListener('click', () => projectInput.click());
const btnLoadProjectHome = $('btn-load-project-home');
if (btnLoadProjectHome) btnLoadProjectHome.addEventListener('click', (e) => { e.stopPropagation(); projectInput.click(); });

projectInput.addEventListener('change', async () => {
  const file = projectInput.files[0];
  if (!file) return;
  projectInput.value = '';

  setStatus('Loading project...');
  try {
    const text = await file.text();
    const project = JSON.parse(text);

    if (!project.version || !project.audio || !project.audio.data) {
      setStatus('Invalid project file'); return;
    }

    // Decode audio
    const audioArrayBuf = base64ToArrayBuffer(project.audio.data);
    currentBuffer = await audioCtx.decodeAudioData(audioArrayBuf);
    undoStack = [];
    btnUndo.disabled = true;

    // Restore photos
    photoItems = [];
    blockElements.clear();
    // Clean up old DOM blocks
    timelineContainer.querySelectorAll('.photo-block').forEach(el => el.remove());

    if (project.photos && project.photos.length > 0) {
      let loadedCount = 0;
      const totalPhotos = project.photos.length;

      for (const p of project.photos) {
        const img = new Image();
        img.onload = () => {
          const item = {
            id: p.id,
            imgSrc: p.imgSrc,
            imgEl: img,
            startTime: p.startTime,
            duration: p.duration,
            transition: p.transition || 'fade',
            transDur: p.transDur || 0.5,
            motion: p.motion || 'none',
          };
          // Restore video properties
          if (p.type === 'video') {
            item.type = 'video';
            item.videoDuration = p.videoDuration;
            item.inPoint = p.inPoint || 0;
            item.outPoint = p.outPoint || p.videoDuration;
            // Recreate video element from saved data
            if (p.videoData) {
              const videoEl = document.createElement('video');
              videoEl.muted = true; videoEl.preload = 'auto'; videoEl.playsInline = true;
              const videoBlob = base64ToBlob(p.videoData);
              const blobUrl = URL.createObjectURL(videoBlob);
              videoEl.src = blobUrl;
              item.videoEl = videoEl;
              item.videoSrc = blobUrl;
            }
          }
          photoItems.push(item);
          loadedCount++;
          if (loadedCount === totalPhotos) {
            nextPhotoId = project.nextPhotoId || (Math.max(...photoItems.map(x => x.id)) + 1);
            renderPhotos();
            drawRuler();
            const txtInfo = textItems.length > 0 ? `, ${textItems.length} texts` : '';
            const vidCount = photoItems.filter(x => x.type === 'video').length;
            const photoCount = photoItems.length - vidCount;
            const mediaInfo = vidCount > 0 ? `${photoCount} photos, ${vidCount} videos` : `${photoCount} photos`;
            setStatus(`Project loaded: ${fmt(currentBuffer.duration)} audio, ${mediaInfo}${txtInfo}`);
          }
        };
        img.onerror = () => {
          loadedCount++;
          if (loadedCount === totalPhotos) {
            nextPhotoId = project.nextPhotoId || 1;
            renderPhotos();
            drawRuler();
            setStatus(`Project loaded with ${totalPhotos - photoItems.length} media errors`);
          }
        };
        img.src = p.imgSrc;
      }
    } else {
      nextPhotoId = 1;
    }

    // Restore text items
    textItems = [];
    textBlockElements.clear();
    textTimelineContainer.querySelectorAll('.text-block').forEach(el => el.remove());
    if (project.texts && project.texts.length > 0) {
      for (const t of project.texts) {
        textItems.push({
          id: t.id, text: t.text, font: t.font || "'Noto Sans Tamil', sans-serif",
          fontSize: t.fontSize || 48, color: t.color || '#ffffff',
          strokeColor: t.strokeColor || '#000000', strokeWidth: t.strokeWidth ?? 2,
          bgColor: t.bgColor || '#000000', bgAlpha: t.bgAlpha || 0,
          bold: t.bold || false, position: t.position || 'center',
          startTime: t.startTime, duration: t.duration,
          animation: t.animation || 'fade', animDur: t.animDur || 0.5,
        });
      }
      nextTextId = project.nextTextId || (Math.max(...textItems.map(x => x.id)) + 1);
    } else {
      nextTextId = 1;
    }
    renderTexts();

    // Restore subtitle items
    subtitleItems = [];
    subBlockElements.clear();
    const subTC = $('sub-timeline-container');
    if (subTC) subTC.querySelectorAll('.sub-block').forEach(el => el.remove());
    if (project.subtitles && project.subtitles.length > 0) {
      for (const s of project.subtitles) {
        subtitleItems.push({
          id: s.id, text: s.text, font: s.font || "'Noto Sans Tamil', sans-serif",
          fontSize: s.fontSize || 32, color: s.color || '#ffffff',
          strokeColor: s.strokeColor || '#000000', strokeWidth: s.strokeWidth ?? 2,
          bgColor: s.bgColor || '#000000', bgAlpha: s.bgAlpha ?? 0.5,
          bold: s.bold ?? true, position: s.position || 'bot-center',
          startTime: s.startTime, duration: s.duration,
          animation: s.animation || 'fade', animDur: s.animDur || 0.3,
        });
      }
      nextSubtitleId = Math.max(...subtitleItems.map(x => x.id)) + 1;
    } else {
      nextSubtitleId = 1;
    }
    renderSubtitles();

    // Restore image size
    if (project.imageSize) {
      const sel = $('create-image-size');
      if (sel) sel.value = project.imageSize;
    }

    // Restore export settings
    if (project.exportQuality) { const el = $('export-quality'); if (el) el.value = project.exportQuality; }
    if (project.exportFps) { const el = $('export-fps'); if (el) el.value = project.exportFps; }
    if (project.exportFormat) { const el = $('export-format'); if (el) el.value = project.exportFormat; }

    // Restore create wizard state if saved
    if (project.createState) {
      createTranscript = project.createState.transcript;
      createScenes = project.createState.scenes;
      createAudioBuffer = currentBuffer;
      cameFromCreate = true;
      btnBackToCreate.style.display = '';
      // Restore style
      if (project.createState.stylePrompt) {
        createStylePrompt = project.createState.stylePrompt;
        createStylePreset = project.createState.stylePreset || 'custom';
        const spEl = $('create-style-preset');
        const stEl = $('create-style-prompt');
        if (spEl) spEl.value = createStylePreset;
        if (stEl) { stEl.value = createStylePrompt; stEl.disabled = createStylePreset !== 'custom'; }
      }
    } else {
      cameFromCreate = false;
      btnBackToCreate.style.display = 'none';
    }

    // Restore BGM
    if (project.bgm && project.bgm.data) {
      try {
        const bgmArrayBuf = base64ToArrayBuffer(project.bgm.data);
        bgmBuffer = await audioCtx.decodeAudioData(bgmArrayBuf);
        bgmVolume = project.bgm.volume ?? 0.3;
        bgmLoop = project.bgm.loop ?? true;
        const bgmSec = $('bgm-section');
        if (bgmSec) bgmSec.style.display = '';
        const bgmNm = $('bgm-name');
        if (bgmNm) bgmNm.textContent = `BGM (${fmtShort(bgmBuffer.duration)})`;
        const bgmVol = $('bgm-volume');
        if (bgmVol) bgmVol.value = Math.round(bgmVolume * 100);
        const bgmVolLbl = $('bgm-volume-label');
        if (bgmVolLbl) bgmVolLbl.textContent = Math.round(bgmVolume * 100) + '%';
        const bgmLp = $('bgm-loop');
        if (bgmLp) bgmLp.checked = bgmLoop;
      } catch(e) { console.warn('BGM restore error:', e); }
    } else {
      bgmBuffer = null;
      const bgmSec = $('bgm-section');
      if (bgmSec) bgmSec.style.display = 'none';
    }

    // Restore PiP (multiple)
    pipItems = [];
    if (project.pipItems && project.pipItems.length > 0) {
      for (const p of project.pipItems) {
        try {
          const videoBlob = base64ToBlob(p.videoData);
          const blobUrl = URL.createObjectURL(videoBlob);
          const videoEl = document.createElement('video');
          videoEl.muted = true; videoEl.preload = 'auto'; videoEl.playsInline = true;
          videoEl.src = blobUrl;
          await new Promise(r => { videoEl.onloadedmetadata = r; });
          pipItems.push({
            id: nextPipId++, videoEl, videoSrc: blobUrl,
            videoDuration: p.duration || videoEl.duration,
            position: p.position || 'bot-right',
            customX: p.customX ?? null, customY: p.customY ?? null,
            size: p.size || 25, shape: p.shape || 'circle',
            border: p.border ?? 3, borderColor: p.borderColor || '#ffffff',
            shadow: p.shadow ?? true,
            inPoint: p.inPoint || 0, outPoint: p.outPoint || 0,
            name: p.name || 'Speaker',
          });
        } catch(e) { console.warn('PiP restore error:', e); }
      }
      // Legacy single pip support
    } else if (project.pip && project.pip.videoData) {
      try {
        const videoBlob = base64ToBlob(project.pip.videoData);
        const blobUrl = URL.createObjectURL(videoBlob);
        const videoEl = document.createElement('video');
        videoEl.muted = true; videoEl.preload = 'auto'; videoEl.playsInline = true;
        videoEl.src = blobUrl;
        await new Promise(r => { videoEl.onloadedmetadata = r; });
        pipItems.push({
          id: nextPipId++, videoEl, videoSrc: blobUrl,
          videoDuration: project.pip.duration || videoEl.duration,
          position: project.pip.position || 'bot-right',
          customX: project.pip.customX ?? null, customY: project.pip.customY ?? null,
          size: project.pip.size || 25, shape: project.pip.shape || 'circle',
          border: project.pip.border ?? 3, borderColor: project.pip.borderColor || '#ffffff',
          shadow: project.pip.shadow ?? true,
          inPoint: project.pip.inPoint || 0, outPoint: project.pip.outPoint || 0,
          name: 'Speaker',
        });
      } catch(e) { console.warn('PiP restore error:', e); }
    }
    const pipSec = $('pip-section');
    if (pipSec) pipSec.style.display = pipItems.length > 0 ? '' : 'none';
    if (typeof renderPipList === 'function') renderPipList();

    // Restore language tracks
    editorLanguageTracks = [];
    if (project.languageTracks && project.languageTracks.length > 0) {
      for (const t of project.languageTracks) {
        try {
          const arrayBuf = base64ToArrayBuffer(t.audioData);
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
          editorLanguageTracks.push({
            lang: t.lang, langCode: t.langCode,
            audioBuffer, translatedText: t.translatedText,
            subtitleLang: t.subtitleLang || 'none',
          });
        } catch(e) { /* skip failed track */ }
      }
      editorOriginalBuffer = currentBuffer;
      editorOriginalSubtitles = subtitleItems.map(s => ({ ...s }));
      editorCurrentLang = 'original';
      if (typeof setupEditorLanguageSelector === 'function') setupEditorLanguageSelector();
    }

    // Show editor
    await refreshWaveform();
    updateAudioControls();
    dropZone.classList.add('hidden');
    editorEl.classList.add('visible');

    if (!project.photos || project.photos.length === 0) {
      const textInfo = textItems.length > 0 ? `, ${textItems.length} texts` : '';
      setStatus(`Project loaded: ${fmt(currentBuffer.duration)} audio, no photos${textInfo}`);
    }
  } catch (e) {
    setStatus('Load error: ' + e.message);
    console.error(e);
  }
});
