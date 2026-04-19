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
    selectedTemplate: selectedTemplate || '',
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(GALLERY_STORE, 'readwrite');
    tx.objectStore(GALLERY_STORE).put(meta);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getGalleryCount() {
  const db = galleryDb || await openGalleryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GALLERY_STORE, 'readonly');
    const req = tx.objectStore(GALLERY_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
        const v = cursor.value;
        // Only keep metadata for gallery display; exclude heavy projectJson
        results.push({
          id: v.id, name: v.name, savedAt: v.savedAt,
          thumbnail: v.thumbnail, duration: v.duration,
          photoCount: v.photoCount, seriesName: v.seriesName,
          episodeNumber: v.episodeNumber, stylePrompt: v.stylePrompt,
          stylePreset: v.stylePreset, type: v.type,
          hasProjectJson: !!v.projectJson
        });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// Load full project data on demand (when user clicks a card)
async function getGalleryProject(id) {
  const db = galleryDb || await openGalleryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GALLERY_STORE, 'readonly');
    const req = tx.objectStore(GALLERY_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
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
    if (!p.hasProjectJson) return;
    try {
      setStatus('Loading project from gallery...');
      const fullProject = await getGalleryProject(p.id);
      if (!fullProject?.projectJson) { setStatus('Project data not found.'); return; }
      // Load project via existing file load logic
      const blob = new Blob([fullProject.projectJson], { type: 'application/json' });
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'gallery.aptproj', { type: 'application/json' }));
      projectInput.files = dt.files;
      projectInput.dispatchEvent(new Event('change'));
    } catch(e) { setStatus('Could not load project from gallery. The project file may be corrupted.'); }
  });
  return card;
}

// Show gallery header with count (no data loaded)
async function initGalleryHeader() {
  const galleryEl = $('project-gallery');
  if (!galleryEl) return;
  try {
    const count = await getGalleryCount();
    if (count === 0) { galleryEl.style.display = 'none'; return; }
    galleryEl.style.display = '';
    const countEl = $('gallery-count');
    if (countEl) countEl.textContent = `(${count})`;
    const clearBtn = $('btn-gallery-clear');
    if (clearBtn) clearBtn.style.display = count > 1 ? '' : 'none';
  } catch(e) { console.warn('Gallery count error:', e); }
}

// Load and render gallery cards (called on expand)
let galleryLoaded = false;
async function loadGalleryCards() {
  if (galleryLoaded) return;
  galleryLoaded = true;
  const gridEl = $('gallery-grid');
  if (!gridEl) return;
  try {
    const projects = await getGalleryProjects();
    if (projects.length === 0) return;
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
        <span class="series-title">${name}</span>
        <span class="series-ep-count">${episodes.length} episode${episodes.length > 1 ? 's' : ''}</span>
        <button class="series-new-episode">+ New Episode</button>
      `;
      header.querySelector('.series-new-episode').addEventListener('click', () => {
        currentSeriesName = name;
        currentEpisodeNumber = episodes.length + 1;
        const lastEp = episodes[episodes.length - 1];
        if (lastEp.stylePrompt) {
          createStylePrompt = lastEp.stylePrompt;
          createStylePreset = lastEp.stylePreset || 'custom';
          const spEl = $('create-style-preset');
          const stEl = $('create-style-prompt');
          if (spEl) spEl.value = createStylePreset;
          if (stEl) { stEl.value = createStylePrompt; stEl.disabled = createStylePreset !== 'custom'; }
        }
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
  } catch(e) { console.warn('Gallery load error:', e); }
}

// For external callers (after save/delete)
async function renderProjectGallery() {
  galleryLoaded = false;
  const bodyEl = $('gallery-body');
  const arrowEl = $('gallery-arrow');
  await initGalleryHeader();
  // If body was open, reload cards
  if (bodyEl && bodyEl.style.display !== 'none') {
    await loadGalleryCards();
  }
}

// Gallery header click — toggle expand/collapse
const galleryHeader = $('gallery-header');
if (galleryHeader) {
  galleryHeader.addEventListener('click', async (e) => {
    if (e.target.tagName === 'BUTTON') return;
    const bodyEl = $('gallery-body');
    const arrowEl = $('gallery-arrow');
    if (!bodyEl) return;
    const isOpen = bodyEl.style.display !== 'none';
    if (isOpen) {
      bodyEl.style.display = 'none';
      if (arrowEl) arrowEl.style.transform = '';
    } else {
      bodyEl.style.display = '';
      if (arrowEl) arrowEl.style.transform = 'rotate(90deg)';
      const spinner = $('gallery-spinner');
      if (spinner && !galleryLoaded) spinner.style.display = '';
      await loadGalleryCards();
      if (spinner) spinner.style.display = 'none';
    }
  });
}

// Clear all gallery projects
const btnGalleryClear = $('btn-gallery-clear');
if (btnGalleryClear) {
  btnGalleryClear.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Delete all saved projects from gallery?')) return;
    await clearGallery();
    renderProjectGallery();
  });
}

// Initialize — just show header with count, no data loaded
requestAnimationFrame(() => {
  openGalleryDb().then(() => initGalleryHeader()).catch(e => console.warn('Gallery init error:', e));
});

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

// ── Library IndexedDB ──
const LIBRARY_DB_NAME = 'stori_library';
let libraryDb = null;

function openLibraryDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LIBRARY_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('library')) db.createObjectStore('library', { keyPath: 'id' });
    };
    req.onsuccess = () => { libraryDb = req.result; resolve(libraryDb); };
    req.onerror = () => reject(req.error);
  });
}

// ── Logo & Frame Library (3 slots each, persisted in IndexedDB) ──
async function saveToLibrary(type, slot, imgSrc) {
  // type: 'logo' or 'frame', slot: 0-2
  if (slot < 0 || slot > 2) return;
  try {
    const db = libraryDb || await openLibraryDb();
    const tx = db.transaction('library', 'readwrite');
    tx.objectStore('library').put({ id: `${type}-${slot}`, imgSrc });
  } catch(e) { console.warn('Library save failed:', e.message); }
}

async function removeFromLibrary(type, slot) {
  try {
    const db = libraryDb || await openLibraryDb();
    const tx = db.transaction('library', 'readwrite');
    tx.objectStore('library').delete(`${type}-${slot}`);
  } catch(e) { console.warn('Library remove failed:', e.message); }
}

async function loadLibrary() {
  try {
    const db = libraryDb || await openLibraryDb();
    const tx = db.transaction('library', 'readonly');
    const store = tx.objectStore('library');
    const items = [];
    return new Promise((resolve) => {
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { items.push(cursor.value); cursor.continue(); }
        else resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  } catch(e) { return []; }
}

function renderLibrarySlots() {
  loadLibrary().then(items => {
    // Render logo slots
    for (let i = 0; i < 3; i++) {
      const item = items.find(it => it.id === `logo-${i}`);
      const slotEl = $(`logo-slot-${i}`);
      if (!slotEl) continue;
      if (item && item.imgSrc) {
        slotEl.innerHTML = `<img src="${item.imgSrc}" alt="Logo ${i+1}" style="width:100%;height:100%;object-fit:contain;">`;
        slotEl.dataset.src = item.imgSrc;
        slotEl.title = 'Click to apply, right-click to remove';
      } else {
        slotEl.innerHTML = '<span style="font-size:0.6rem;color:var(--text-muted);">Empty</span>';
        slotEl.dataset.src = '';
        slotEl.title = 'Empty slot';
      }
    }
    // Render frame slots
    for (let i = 0; i < 3; i++) {
      const item = items.find(it => it.id === `frame-${i}`);
      const slotEl = $(`frame-slot-${i}`);
      if (!slotEl) continue;
      if (item && item.imgSrc) {
        slotEl.innerHTML = `<img src="${item.imgSrc}" alt="Frame ${i+1}" style="width:100%;height:100%;object-fit:cover;">`;
        slotEl.dataset.src = item.imgSrc;
        slotEl.title = 'Click to apply, right-click to remove';
      } else {
        slotEl.innerHTML = '<span style="font-size:0.6rem;color:var(--text-muted);">Empty</span>';
        slotEl.dataset.src = '';
        slotEl.title = 'Empty slot';
      }
    }
  });
}

async function saveCurrentToNextSlot(type) {
  const src = type === 'logo' ? logoImgSrc : frameImgSrc;
  if (!src) return;
  const items = await loadLibrary();
  const existing = [0, 1, 2].map(i => items.find(it => it.id === `${type}-${i}`));
  // Find first empty slot, or overwrite oldest (slot 0)
  let slot = existing.findIndex(it => !it || !it.imgSrc);
  if (slot === -1) slot = 0;
  await saveToLibrary(type, slot, src);
  renderLibrarySlots();
  setStatus(`${type === 'logo' ? 'Logo' : 'Frame'} saved to library slot ${slot + 1}`);
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
      bgVideoMode: bgVideoMode || 'images-only',
      pipTransType: pipTransType || 'shrink',
      pipTransDur: pipTransDur || 0.5,
      pipTransPos: pipTransPos || 'bot-right',
      frame: frameImgSrc ? { imgSrc: frameImgSrc, padding: framePadding, opacity: frameOpacity } : undefined,
      logo: logoImgSrc ? { imgSrc: logoImgSrc, position: logoPosition, size: logoSize, opacity: logoOpacity } : undefined,
      createState: createScenes ? {
        transcript: createTranscript,
        videoMode: createVideoMode || 'illustrated',
        scenes: await Promise.all(createScenes.map(async s => {
          const base = { prompt: s.prompt, startTime: s.startTime, endTime: s.endTime, duration: s.duration, text: s.text, imgDataUrl: s.imgDataUrl, refCharacters: s.refCharacters, refEnvironment: s.refEnvironment };
          const clipsToSave = s.videoClips || (s.videoUrl ? [{ url: s.videoUrl, clipDuration: s.duration }] : []);
          if (clipsToSave.length > 0) {
            try {
              base.videoClipsData = await Promise.all(clipsToSave.map(async clip => {
                const resp = await fetch(clip.url);
                const blob = await resp.blob();
                return { clipData: await blobToBase64(blob), clipDuration: clip.clipDuration };
              }));
              base.videoData = base.videoClipsData[0].clipData;
            } catch(e) { console.warn('Scene video save error:', e); }
          }
          return base;
        })),
        stylePrompt: createStylePrompt || '',
        stylePreset: createStylePreset || '',
        selectedTemplate: selectedTemplate || '',
        characters: storyCharacters.map(c => ({ id: c.id, name: c.name, description: c.description, imgDataUrl: c.imgDataUrl })),
        environments: storyEnvironments.map(e => ({ id: e.id, name: e.name, description: e.description, imgDataUrl: e.imgDataUrl })),
        bgmData: await (async () => {
          try {
            if (typeof createBgmUrl !== 'undefined' && createBgmUrl) {
              const resp = await fetch(createBgmUrl);
              const blob = await resp.blob();
              return await blobToBase64(blob);
            }
          } catch(e) {}
          return null;
        })(),
      } : undefined,
      // BGM
      bgm: bgmBuffer ? {
        data: await blobToBase64(audioBufferToWavBlob(bgmBuffer)),
        volume: bgmVolume,
        loop: bgmLoop,
      } : undefined,
      // Video timeline
      videoTimeline: videoTimelineItems.length > 0 ? await Promise.all(videoTimelineItems.map(async vt => {
        try {
          const resp = await fetch(vt.videoSrc);
          const blob = await resp.blob();
          return {
            videoData: await blobToBase64(blob),
            videoDuration: vt.videoDuration,
            inPoint: vt.inPoint, outPoint: vt.outPoint,
            startTime: vt.startTime, duration: vt.duration,
          };
        } catch(e) { console.warn('Video timeline save error:', e); return null; }
      })).then(arr => arr.filter(Boolean)) : undefined,
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
      // Reel subtitle style — read from editor global or reel creator globals
      reelSubtitle: window._editorReelSubtitle || (typeof reelSubtitleStyle !== 'undefined' ? {
        style: reelSubtitleStyle, subSize: reelSubSize, subPosition: reelSubPosition,
        subColor: reelSubColor, subOutline: reelSubOutline, subBackdrop: reelSubBackdrop,
      } : undefined),
      // Reel frame — read from editor global or reel creator globals
      reelFrame: (window._editorReelFrame && window._editorReelFrame.template !== 'none') ? {
        template: window._editorReelFrame.template, text: window._editorReelFrame.text,
        bgColor: window._editorReelFrame.bgColor, textColor: window._editorReelFrame.textColor,
        opacity: window._editorReelFrame.opacity, imgSrc: window._editorReelFrame.imgSrc || '',
      } : (typeof reelFrameTemplate !== 'undefined' && reelFrameTemplate !== 'none') ? {
        template: reelFrameTemplate, text: reelFrameText,
        bgColor: reelFrameBgColor, textColor: reelFrameTextColor,
        opacity: reelFrameOpacity, imgSrc: reelFrameImgSrc || '',
      } : undefined,
      // Reel overlays — read from editor global or reel creator globals
      reelOverlays: (window._editorReelOverlays && window._editorReelOverlays.length > 0)
        ? window._editorReelOverlays.map(o => ({ id: o.id, type: o.type, startTime: o.startTime, duration: o.duration, params: o.params }))
        : (typeof reelOverlayItems !== 'undefined' && reelOverlayItems.length > 0)
        ? reelOverlayItems.map(o => ({ id: o.id, type: o.type, startTime: o.startTime, duration: o.duration, params: o.params }))
        : undefined,
      // Subtitle selections
      primarySubtitleLang: window._editorPrimarySubLang || (typeof createSubtitleSelections !== 'undefined' ? createSubtitleSelections['primary'] : undefined),
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
            voiceName: t.voiceName || 'Kore',
            subtitleLang: t.subtitleLang || 'none',
            subtitleTexts: t.subtitleTexts || undefined,
            photoTimings: t.photoTimings || undefined,
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
    const sizeStr = (json.length / 1024 / 1024).toFixed(1);
    statusFn(`Project saved (${sizeStr} MB)`);
    showSaveToast(`✓ Project saved (${sizeStr} MB)`);
    // Also save to gallery
    try { await saveProjectToGallery(json, defaultName.replace('.aptproj', '')); } catch(e) { console.warn('Gallery save:', e); }
  } catch (e) {
    if (e.name !== 'AbortError') {
      statusFn('Could not save project. Your browser may be low on storage.');
      showSaveToast('✗ Save failed', true);
    }
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

  showPageLoader('Loading project...');
  setStatus('Loading project...', true);
  try {
    const text = await file.text();
    const project = JSON.parse(text);

    // Route .storireel files to Reel section
    if (project.type === 'reel' && typeof loadReelProject === 'function') {
      hidePageLoader();
      loadReelProject(project);
      return;
    }

    if (!project.version || !project.audio || !project.audio.data) {
      setStatus('Invalid project file'); return;
    }

    // Decode audio
    const audioArrayBuf = base64ToArrayBuffer(project.audio.data);
    currentBuffer = await ensureAudioCtx().decodeAudioData(audioArrayBuf);
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
            if (typeof showInlinePreview === 'function') showInlinePreview();
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
            if (typeof showInlinePreview === 'function') showInlinePreview();
            setStatus(`Project loaded. ${totalPhotos - photoItems.length} image(s) could not be restored.`);
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

    // Restore image size — add option if not present
    if (project.imageSize) {
      const sel = $('create-image-size');
      if (sel) {
        if (!sel.querySelector(`option[value="${project.imageSize}"]`)) {
          const [pw, ph] = project.imageSize.split('x');
          const opt = document.createElement('option');
          opt.value = project.imageSize;
          opt.textContent = `${pw}×${ph}`;
          sel.appendChild(opt);
        }
        sel.value = project.imageSize;
      }
    }

    // Restore export settings
    if (project.exportQuality) { const el = $('export-quality'); if (el) el.value = project.exportQuality; }
    if (project.exportFps) { const el = $('export-fps'); if (el) el.value = project.exportFps; }
    if (project.exportFormat) { const el = $('export-format'); if (el) el.value = project.exportFormat; }
    if (project.bgVideoMode) {
      bgVideoMode = project.bgVideoMode;
      const bgModeEl = $('bg-video-mode');
      if (bgModeEl) bgModeEl.value = bgVideoMode;
    }
    if (project.pipTransType) { pipTransType = project.pipTransType; const el = $('pip-trans-type'); if (el) el.value = pipTransType; }
    if (project.pipTransDur) { pipTransDur = project.pipTransDur; const el = $('pip-trans-dur'); if (el) el.value = pipTransDur; }
    if (project.pipTransPos) { pipTransPos = project.pipTransPos; const el = $('pip-trans-pos'); if (el) el.value = pipTransPos; }
    // Restore frame
    if (project.frame && project.frame.imgSrc) {
      const fImg = new Image();
      fImg.onload = () => {
        frameImgEl = fImg; frameImgSrc = project.frame.imgSrc;
        framePadding = project.frame.padding || { top: 40, bottom: 40, left: 40, right: 40 };
        frameOpacity = project.frame.opacity ?? 1;
        const sec = $('frame-section'); if (sec) sec.style.display = '';
        const thumb = $('frame-thumb'); if (thumb) { thumb.src = frameImgSrc; thumb.style.display = ''; }
        ['top','bottom','left','right'].forEach(s => { const el = $(`frame-pad-${s}`); if (el) el.value = framePadding[s]; });
        const opEl = $('frame-opacity'); if (opEl) opEl.value = Math.round(frameOpacity * 100);
      };
      fImg.src = project.frame.imgSrc;
    }
    // Restore logo
    if (project.logo && project.logo.imgSrc) {
      const lImg = new Image();
      lImg.onload = () => {
        logoImgEl = lImg; logoImgSrc = project.logo.imgSrc;
        logoPosition = project.logo.position || 'top-right';
        logoSize = project.logo.size || 10;
        logoOpacity = project.logo.opacity ?? 0.8;
        const sec = $('logo-section'); if (sec) sec.style.display = '';
        const thumb = $('logo-thumb'); if (thumb) { thumb.src = logoImgSrc; thumb.style.display = ''; }
        const posEl = $('logo-position'); if (posEl) posEl.value = logoPosition;
        const sizeEl = $('logo-size'); if (sizeEl) sizeEl.value = logoSize;
        const opEl = $('logo-opacity'); if (opEl) opEl.value = Math.round(logoOpacity * 100);
      };
      lImg.src = project.logo.imgSrc;
    }

    // Restore reel subtitle style
    if (project.reelSubtitle) {
      window._editorReelSubtitle = project.reelSubtitle;
      // Also restore reel creator globals
      reelSubtitleStyle = project.reelSubtitle.style || 'highlight';
      reelSubSize = project.reelSubtitle.subSize || 4;
      reelSubPosition = project.reelSubtitle.subPosition || 'bottom';
      reelSubColor = project.reelSubtitle.subColor || '#ffffff';
      reelSubOutline = project.reelSubtitle.subOutline || '#000000';
      reelSubBackdrop = project.reelSubtitle.subBackdrop || 'dark';
    }
    // Restore reel frame
    if (project.reelFrame) {
      const rf = project.reelFrame;
      window._editorReelFrame = {
        template: rf.template, text: rf.text,
        bgColor: rf.bgColor, textColor: rf.textColor,
        opacity: rf.opacity, imgEl: null, imgSrc: rf.imgSrc || '',
      };
      // Also restore reel creator globals
      reelFrameTemplate = rf.template || 'none';
      reelFrameText = rf.text || '';
      reelFrameBgColor = rf.bgColor || '#000000';
      reelFrameTextColor = rf.textColor || '#ffffff';
      reelFrameOpacity = rf.opacity ?? 1.0;
      if (rf.imgSrc) {
        const rfImg = new Image();
        rfImg.onload = () => { window._editorReelFrame.imgEl = rfImg; reelFrameImgEl = rfImg; };
        rfImg.src = rf.imgSrc;
        reelFrameImgSrc = rf.imgSrc;
      }
    }
    // Restore reel overlays
    if (project.reelOverlays && project.reelOverlays.length > 0) {
      window._editorReelOverlays = project.reelOverlays;
      reelOverlayItems = project.reelOverlays.map(o => ({ ...o }));
      nextOverlayId = Math.max(...reelOverlayItems.map(o => o.id), 0) + 1;
    }

    // Restore create wizard state if saved
    if (project.createState) {
      createTranscript = project.createState.transcript;
      createVideoMode = project.createState.videoMode || 'illustrated';
      // Restore scenes, decoding per-scene videoData → blob URL
      createScenes = await Promise.all((project.createState.scenes || []).map(async s => {
        const scene = { ...s };
        if (s.videoClipsData && s.videoClipsData.length > 0) {
          try {
            scene.videoClips = s.videoClipsData.map(cd => {
              const blob = base64ToBlob(cd.clipData);
              return { url: URL.createObjectURL(blob), clipDuration: cd.clipDuration };
            });
            scene.videoUrl = scene.videoClips[0].url;
          } catch(e) { console.warn('Scene video restore error:', e); }
        } else if (s.videoData) {
          try {
            const blob = base64ToBlob(s.videoData);
            scene.videoUrl = URL.createObjectURL(blob);
            scene.videoClips = [{ url: scene.videoUrl, clipDuration: s.duration }];
          } catch(e) { console.warn('Scene video restore error:', e); }
        }
        return scene;
      }));
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
      // Restore template
      if (project.createState.selectedTemplate) {
        selectedTemplate = project.createState.selectedTemplate;
      }
      // Restore characters and environments
      if (project.createState.characters) {
        storyCharacters = project.createState.characters.map(c => {
          const img = c.imgDataUrl ? new Image() : null;
          if (img) img.src = c.imgDataUrl;
          return { ...c, imgEl: img };
        });
        nextCharId = Math.max(1, ...storyCharacters.map(c => c.id)) + 1;
      }
      if (project.createState.environments) {
        storyEnvironments = project.createState.environments.map(e => {
          const img = e.imgDataUrl ? new Image() : null;
          if (img) img.src = e.imgDataUrl;
          return { ...e, imgEl: img };
        });
        nextEnvId = Math.max(1, ...storyEnvironments.map(e => e.id)) + 1;
      }
      // Restore Create Story BGM
      if (project.createState.bgmData) {
        try {
          const blob = base64ToBlob(project.createState.bgmData, 'audio/mp3');
          if (typeof createBgmUrl !== 'undefined' && createBgmUrl) URL.revokeObjectURL(createBgmUrl);
          createBgmUrl = URL.createObjectURL(blob);
          const bgmAudio = $('create-bgm-audio');
          if (bgmAudio) bgmAudio.src = createBgmUrl;
        } catch(e) { console.warn('BGM restore error:', e); }
      }
      // Render animated video cards if applicable
      if (createVideoMode === 'animated' && createScenes.some(s => s.videoUrl)) {
        const videoStep = $('create-video-step');
        if (videoStep) videoStep.style.display = '';
        if (typeof renderCreateVideoCards === 'function') renderCreateVideoCards();
      }
      // Agent panel will be inferred when user navigates back to create page
    } else {
      cameFromCreate = false;
      btnBackToCreate.style.display = 'none';
    }

    // Restore BGM
    if (project.bgm && project.bgm.data) {
      try {
        const bgmArrayBuf = base64ToArrayBuffer(project.bgm.data);
        bgmBuffer = await ensureAudioCtx().decodeAudioData(bgmArrayBuf);
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
        if (typeof window.drawBgmWaveform === 'function') window.drawBgmWaveform();
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
    // Restore video timeline items
    videoTimelineItems = [];
    if (project.videoTimeline && project.videoTimeline.length > 0) {
      for (const vt of project.videoTimeline) {
        try {
          const blob = base64ToBlob(vt.videoData);
          const blobUrl = URL.createObjectURL(blob);
          const videoEl = document.createElement('video');
          videoEl.muted = true; videoEl.preload = 'auto'; videoEl.playsInline = true;
          videoEl.src = blobUrl;
          await new Promise(r => { videoEl.onloadeddata = r; videoEl.onerror = r; });
          // Generate thumbnail
          videoEl.currentTime = 0.1;
          await new Promise(r => { videoEl.onseeked = r; setTimeout(r, 1000); });
          const tc = document.createElement('canvas'); tc.width = 160; tc.height = 90;
          tc.getContext('2d').drawImage(videoEl, 0, 0, 160, 90);
          const thumbUrl = tc.toDataURL('image/jpeg', 0.6);
          const thumbImg = new Image(); thumbImg.src = thumbUrl;
          videoTimelineItems.push({
            id: nextVideoTimelineId++,
            videoEl, videoSrc: blobUrl,
            videoDuration: vt.videoDuration,
            inPoint: vt.inPoint || 0, outPoint: vt.outPoint || vt.videoDuration,
            startTime: vt.startTime || 0, duration: vt.duration || vt.videoDuration,
            imgSrc: thumbUrl, imgEl: thumbImg,
          });
        } catch(e) { console.warn('Video timeline restore error:', e); }
      }
    }
    if (typeof renderVideoTimeline === 'function') renderVideoTimeline();

    // Restore language tracks
    editorLanguageTracks = [];
    if (project.languageTracks && project.languageTracks.length > 0) {
      for (const t of project.languageTracks) {
        try {
          const arrayBuf = base64ToArrayBuffer(t.audioData);
          const audioBuffer = await ensureAudioCtx().decodeAudioData(arrayBuf);
          editorLanguageTracks.push({
            lang: t.lang, langCode: t.langCode,
            audioBuffer, translatedText: t.translatedText,
            voiceName: t.voiceName || 'Kore',
            subtitleLang: t.subtitleLang || 'none',
            subtitleTexts: t.subtitleTexts || undefined,
            photoTimings: t.photoTimings || undefined,
          });
        } catch(e) { /* skip failed track */ }
      }
      editorOriginalBuffer = currentBuffer;
      editorOriginalSubtitles = subtitleItems.map(s => ({ ...s }));
      editorCurrentLang = 'original';
      // Restore primary subtitle language
      if (project.primarySubtitleLang) {
        window._editorPrimarySubLang = project.primarySubtitleLang;
        if (typeof createSubtitleSelections !== 'undefined') createSubtitleSelections['primary'] = project.primarySubtitleLang;
      }
      // Restore voice selections
      for (const t of editorLanguageTracks) {
        if (t.voiceName && typeof createVoiceSelections !== 'undefined') createVoiceSelections[t.langCode] = t.voiceName;
      }
      if (typeof setupEditorLanguageSelector === 'function') setupEditorLanguageSelector();
      const exportAllBtn = $('btn-export-all-langs');
      if (exportAllBtn) exportAllBtn.style.display = editorLanguageTracks.length > 0 ? '' : 'none';
    }

    // Show editor — ensure editor scripts are loaded first
    console.log('[ProjectLoad] Loading editor scripts...');
    if (typeof loadEditorScripts === 'function' && !window._editorScriptsLoaded) {
      await new Promise(resolve => loadEditorScripts(resolve));
      console.log('[ProjectLoad] Editor scripts loaded.');
    } else {
      console.log('[ProjectLoad] Editor scripts already loaded:', !!window._editorScriptsLoaded);
    }
    console.log('[ProjectLoad] Navigating to editor. Photos:', photoItems.length, 'Buffer:', !!currentBuffer);
    console.log('[ProjectLoad] Export button:', !!$('btn-export-video'), 'btnExportVideo ref:', typeof btnExportVideo);
    navigateTo('editor');
    await refreshWaveform();
    updateAudioControls();
    drawRuler();
    renderPhotos();
    renderSubtitles();
    renderTexts();
    if (typeof renderVideoTimeline === 'function') renderVideoTimeline();
    if (typeof window._showReelPropsPanel === 'function') window._showReelPropsPanel();
    // Re-render after layout settles; show inline preview if photos already loaded
    requestAnimationFrame(() => {
      drawRuler(); renderPhotos(); renderSubtitles();
      if (typeof showInlinePreview === 'function') showInlinePreview();
    });

    if (!project.photos || project.photos.length === 0) {
      const textInfo = textItems.length > 0 ? `, ${textItems.length} texts` : '';
      setStatus(`Project loaded: ${fmt(currentBuffer.duration)} audio, no photos${textInfo}`);
    }
  } catch (e) {
    setStatus('Could not open project. The file may be corrupted or from an incompatible version.');
    console.error(e);
  }
  hidePageLoader();
});

// ══════════════════════════════════════════
//  USER SECTION (runs on page load)
// ══════════════════════════════════════════
const btnUserMenu = $('btn-user-menu');
const userDropdown = $('user-dropdown');
const btnSignIn = $('btn-sign-in');
const btnSignOut = $('btn-sign-out');
const btnManageSub = $('btn-manage-sub');

if (btnUserMenu) btnUserMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  userDropdown.classList.toggle('hidden');
});
document.addEventListener('click', () => {
  if (userDropdown) userDropdown.classList.add('hidden');
});
if (userDropdown) userDropdown.addEventListener('click', (e) => e.stopPropagation());

if (btnSignIn) btnSignIn.addEventListener('click', () => {
  localStorage.setItem('stori_user', JSON.stringify({ name: 'User', email: 'user@email.com' }));
  updateUserSection();
});
if (btnSignOut) btnSignOut.addEventListener('click', () => {
  localStorage.removeItem('stori_user');
  updateUserSection();
});
if (btnManageSub) btnManageSub.addEventListener('click', () => {
  setStatus('Subscription management coming soon.');
});

function updateUserSection() {
  const userData = JSON.parse(localStorage.getItem('stori_user') || 'null');
  const signedOut = $('user-signed-out');
  const signedIn = $('user-signed-in');
  if (!signedOut || !signedIn) return;

  if (userData) {
    signedOut.classList.add('hidden');
    signedIn.classList.remove('hidden');
    const nameEl = $('user-name');
    const emailEl = $('user-email');
    if (nameEl) nameEl.textContent = userData.name || 'User';
    if (emailEl) emailEl.textContent = userData.email || '';
    const badge = $('user-plan-badge');
    if (badge) { badge.textContent = 'Stori'; badge.className = 'plan-badge plan-pro'; }
    const paidStatus = $('user-key-paid-status');
    if (paidStatus) paidStatus.textContent = (localStorage.getItem('stori_key_paid') || localStorage.getItem('stori_key_free')) ? '✓ Set' : 'Not set';
    if (typeof getGalleryCount === 'function') {
      getGalleryCount().then(count => {
        const countEl = $('user-project-count');
        if (countEl) countEl.textContent = count;
      });
    }
  } else {
    signedOut.classList.remove('hidden');
    signedIn.classList.add('hidden');
  }
}

updateUserSection();
