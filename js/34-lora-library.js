// ══════════════════════════════════════════
//  LORA LIBRARY — Product LoRA training, Library page, Step 4 picker
//
//  Library page: upload product photos → train fal-ai/flux-lora-fast-training
//                → store loraUrl → reuse across projects
//  Step 4:       select trained products → generation blocked until ready
//  Generation:   if any selected product LoRA is not ready, btn-launch-image
//                is disabled with a clear notice
// ══════════════════════════════════════════

(function () {

const PRODUCTS_KEY    = 'stori_lora_products_v1';
const CHARACTERS_KEY  = 'stori_lora_characters_v1';
const FAL_KEY_LS      = 'stori_fal_api_key';
const IDB_DB_NAME     = 'stori_lora_photos';
const IDB_STORE_NAME  = 'photos';
const IDB_VERSION     = 1;
const MIN_PHOTOS      = 5;
const MAX_PHOTOS      = 15;
const MIN_CHAR_PHOTOS = 8;
const MAX_CHAR_PHOTOS = 15;
const POLL_MS         = 15000;
const TRAIN_TIMEOUT   = 20 * 60 * 1000;

// 12 training image prompt templates for characters.
// {desc} is replaced with the user's description.
const CHAR_TRAINING_PROMPTS = [
  'portrait, {desc}, looking directly at camera, neutral expression, white studio background, sharp focus',
  'portrait, {desc}, slight smile, looking at camera, soft natural window lighting, white background',
  'portrait, {desc}, serious expression, side lighting, white background',
  'portrait, {desc}, 3/4 angle, looking slightly off-camera, warm lighting',
  'portrait, {desc}, profile view, neutral expression, clean white background',
  'portrait, {desc}, looking slightly downward, contemplative mood, natural light',
  'portrait, {desc}, candid laugh, outdoor soft diffused light',
  'portrait, {desc}, close-up face, dramatic Rembrandt lighting, slightly different angle',
  'full body, {desc}, standing, neutral relaxed pose, studio background',
  'full body, {desc}, casual pose, arms at sides, neutral expression',
  'portrait, {desc}, professional headshot style, front-facing, neutral',
  'portrait, {desc}, looking slightly upward, moody directional light',
];

// ── IDB ──────────────────────────────────────────────────────────
let _db = null;
function _openDb() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE_NAME);
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}
async function _idbGet(key) {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(IDB_STORE_NAME, 'readonly').objectStore(IDB_STORE_NAME).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function _idbSet(key, val) {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    tx.objectStore(IDB_STORE_NAME).put(val, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function _idbDel(key) {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    tx.objectStore(IDB_STORE_NAME).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ── Character metadata (localStorage) ───────────────────────────
function getCharacters() {
  try { return JSON.parse(localStorage.getItem(CHARACTERS_KEY) || '[]'); } catch { return []; }
}
function saveCharacters(list) {
  localStorage.setItem(CHARACTERS_KEY, JSON.stringify(list));
}
function getCharacterById(id) {
  return getCharacters().find(c => c.id === id) || null;
}
function saveCharacter(char) {
  const list = getCharacters();
  const i = list.findIndex(c => c.id === char.id);
  if (i >= 0) list[i] = char; else list.push(char);
  saveCharacters(list);
}
function _updateCharacter(id, patch) {
  const list = getCharacters();
  const i = list.findIndex(c => c.id === id);
  if (i >= 0) { list[i] = { ...list[i], ...patch }; saveCharacters(list); }
}
function deleteCharacter(id) {
  saveCharacters(getCharacters().filter(c => c.id !== id));
  // Best-effort IDB cleanup
  _openDb().then(db => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    for (let i = 0; i < MAX_CHAR_PHOTOS; i++) store.delete(`lora_char_${id}_photo_${i}`);
    store.delete(`lora_char_${id}_preview`);
  }).catch(() => {});
}

// Generate 12 training images for a character using Gemini Flash.
// Updates IDB + photoCount on the character record as images arrive.
async function generateCharacterTrainingImages(charId) {
  const char = getCharacterById(charId);
  if (!char) throw new Error('Character not found');
  const key = (typeof getCreateGeminiKey === 'function') ? getCreateGeminiKey() : null;
  if (!key) throw new Error('No Gemini API key. Add it in Settings first.');

  // Clear existing photos
  for (let i = 0; i < MAX_CHAR_PHOTOS; i++) await _idbDel(`lora_char_${charId}_photo_${i}`);
  _updateCharacter(charId, { photoCount: 0 });

  const desc = char.description || char.name;
  const prompts = CHAR_TRAINING_PROMPTS.map(t => t.replace('{desc}', desc));

  // Fire all 12 in parallel; store as they arrive
  let stored = 0;
  await Promise.all(prompts.map(async (prompt, idx) => {
    try {
      const dataUrl = await generateImageGeminiFlash(prompt, key, { width: 512, height: 512 });
      await _idbSet(`lora_char_${charId}_photo_${idx}`, dataUrl);
      stored++;
      _updateCharacter(charId, { photoCount: stored });
      _refreshCharImageGrid(charId);
    } catch (e) {
      console.warn(`[CharLora] training image ${idx} failed:`, e.message);
    }
  }));

  if (stored < MIN_CHAR_PHOTOS) {
    throw new Error(`Only ${stored} images generated (need ${MIN_CHAR_PHOTOS}). Try again or upload your own.`);
  }
  return stored;
}

// ── Character LoRA training ──────────────────────────────────────
async function trainCharacterLora(charId) {
  const char = getCharacterById(charId);
  if (!char) return;
  const count = char.photoCount || 0;
  if (count < MIN_CHAR_PHOTOS) { _showToast(`Need at least ${MIN_CHAR_PHOTOS} photos to train. Generate or upload more.`); return; }
  if (!getFalKey()) { _showToast('Add your fal.ai key in Library → Products first.'); return; }

  const triggerWord = `CHAR${charId.slice(-6).toUpperCase()}`;
  _updateCharacter(charId, { loraStatus: 'training', trainStarted: Date.now(), loraError: null, falRequestId: null, triggerWord });
  renderLibraryCharactersTab();
  updateLaunchImageButton();

  const photos = [];
  for (let i = 0; i < count; i++) {
    const d = await _idbGet(`lora_char_${charId}_photo_${i}`);
    if (d) photos.push(d);
  }

  try {
    const submission = await _falSubmit('fal-ai/flux-lora-fast-training', {
      images_data_url: photos,
      trigger_word: triggerWord,
      steps: 1000,
    });
    const requestId = submission.request_id;
    if (!requestId) throw new Error('No request_id returned from fal.ai');
    _updateCharacter(charId, { falRequestId: requestId });
    await _pollUntilDoneChar(charId, requestId, char.name);
  } catch (e) {
    _updateCharacter(charId, { loraStatus: 'error', loraError: e.message, falRequestId: null });
    renderLibraryCharactersTab();
    updateLaunchImageButton();
    console.warn('[CharLora] Training error:', e.message);
  }
}

async function _pollUntilDoneChar(charId, requestId, charName) {
  const deadline = Date.now() + TRAIN_TIMEOUT;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS));
    _renderElapsedChar(charId);
    const status = await _falPollStatus('fal-ai/flux-lora-fast-training', requestId);
    if (status.status === 'COMPLETED') {
      const final = await _falFetchResult('fal-ai/flux-lora-fast-training', requestId);
      const loraUrl = final.diffusers_lora_file?.url || final.lora_file?.url;
      if (!loraUrl) throw new Error('No LoRA URL in fal.ai response');
      const char = getCharacterById(charId);
      _updateCharacter(charId, { loraStatus: 'ready', loraUrl, trainCompleted: Date.now(), falRequestId: null });
      renderLibraryCharactersTab();
      renderAssetsSection();
      updateLaunchImageButton();
      _showToast(`✅ ${charName || 'Character'} LoRA is ready — generating preview…`);
      _generateCharLoraPreview(charId, loraUrl, char?.triggerWord || '').then(() => renderLibraryCharactersTab());
      return;
    }
    if (status.status === 'FAILED') throw new Error(status.error || 'Training failed on fal.ai');
  }
  throw new Error('LoRA training timed out (>20 min)');
}

async function _generateCharLoraPreview(charId, loraUrl, triggerWord) {
  const falKey = getFalKey();
  if (!falKey || !loraUrl) return;
  const prompt = triggerWord
    ? `${triggerWord} portrait, neutral expression, looking at camera, cinematic lighting`
    : 'portrait, neutral expression, looking at camera, cinematic lighting';
  try {
    const resp = await fetch('https://fal.run/fal-ai/flux-lora', {
      method: 'POST',
      headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, loras: [{ path: loraUrl, scale: 1.0 }], image_size: 'square', num_images: 1, output_format: 'jpeg' }),
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) return;
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return;
    const blob = await imgResp.blob();
    const dataUrl = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    await _idbSet(`lora_char_${charId}_preview`, dataUrl);
  } catch (e) {
    console.warn('[CharLora] Preview generation failed:', e.message);
  }
}

function _renderElapsedChar(charId) {
  const el = document.querySelector(`.lora-char-card[data-char-id="${charId}"] .lora-elapsed`);
  if (!el) return;
  const c = getCharacterById(charId);
  if (c && c.trainStarted) el.textContent = `${Math.round((Date.now() - c.trainStarted) / 60000)} min elapsed`;
}

// Refresh just the image review grid inside the creation modal (called as images arrive)
function _refreshCharImageGrid(charId) {
  const modal = document.getElementById('char-create-modal');
  if (!modal || modal.dataset.charId !== charId) return;
  _renderCharReviewGrid(charId);
}

// ── Product metadata (localStorage) ─────────────────────────────
function getProducts() {
  try { return JSON.parse(localStorage.getItem(PRODUCTS_KEY) || '[]'); } catch { return []; }
}
function saveProducts(list) {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(list));
}
function _updateProduct(id, patch) {
  const list = getProducts();
  const i = list.findIndex(p => p.id === id);
  if (i >= 0) { list[i] = { ...list[i], ...patch }; saveProducts(list); }
}
function getFalKey() { return localStorage.getItem(FAL_KEY_LS) || ''; }
function saveFalKey(key) { localStorage.setItem(FAL_KEY_LS, key.trim()); }

// ── Per-project selected product IDs ────────────────────────────
function getSelectedProductIds() {
  return (window.createJobState && window.createJobState.loraProductIds) || [];
}
function setSelectedProductIds(ids) {
  if (!window.createJobState) window.createJobState = {};
  window.createJobState.loraProductIds = ids;
}

// ── fal.ai queue helpers ─────────────────────────────────────────
async function _falSubmit(endpoint, input) {
  const key = getFalKey();
  if (!key) throw new Error('No fal.ai API key set.');
  const resp = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new Error(`fal submit ${resp.status}: ${t.slice(0, 200)}`); }
  return resp.json();
}
async function _falPollStatus(endpoint, requestId) {
  const key = getFalKey();
  const resp = await fetch(`https://queue.fal.run/${endpoint}/requests/${requestId}/status`, {
    headers: { 'Authorization': `Key ${key}` },
  });
  if (!resp.ok) throw new Error(`fal status ${resp.status}`);
  return resp.json();
}
async function _falFetchResult(endpoint, requestId) {
  const key = getFalKey();
  const resp = await fetch(`https://queue.fal.run/${endpoint}/requests/${requestId}`, {
    headers: { 'Authorization': `Key ${key}` },
  });
  if (!resp.ok) throw new Error(`fal result ${resp.status}`);
  return resp.json();
}

// ── Photo management ─────────────────────────────────────────────
function _fileToDataUrl(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.readAsDataURL(file);
  });
}
async function _loadPhotosForProduct(productId, count) {
  const urls = [];
  for (let i = 0; i < count; i++) {
    const d = await _idbGet(`lora_${productId}_photo_${i}`);
    if (d) urls.push(d);
  }
  return urls;
}
async function addPhotosToProduct(productId, files) {
  const products = getProducts();
  const p = products.find(pr => pr.id === productId);
  if (!p) return;
  let count = p.photoCount || 0;
  for (const f of files) {
    if (count >= MAX_PHOTOS) break;
    await _idbSet(`lora_${productId}_photo_${count}`, await _fileToDataUrl(f));
    count++;
  }
  _updateProduct(productId, { photoCount: count });
  renderProductsTab();
}
async function deleteProductPhotos(productId) {
  const p = getProducts().find(pr => pr.id === productId);
  if (!p) return;
  for (let i = 0; i < (p.photoCount || 0); i++) await _idbDel(`lora_${productId}_photo_${i}`);
}

// ── Training ─────────────────────────────────────────────────────
async function trainProductLora(productId) {
  const products = getProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return;
  const photos = await _loadPhotosForProduct(productId, product.photoCount || 0);
  if (photos.length < MIN_PHOTOS) { _showToast(`Need at least ${MIN_PHOTOS} photos to train.`); return; }
  if (!getFalKey()) { _showToast('Add your fal.ai key in Library → Products first.'); return; }

  const triggerWord = `PROD${productId.slice(-6).toUpperCase()}`;
  _updateProduct(productId, { loraStatus: 'training', trainStarted: Date.now(), loraError: null, falRequestId: null, triggerWord });
  renderProductsTab();
  updateLaunchImageButton();

  try {
    const submission = await _falSubmit('fal-ai/flux-lora-fast-training', {
      images_data_url: photos,
      trigger_word: triggerWord,
      steps: 1000,
    });
    const requestId = submission.request_id;
    if (!requestId) throw new Error('No request_id returned from fal.ai');
    _updateProduct(productId, { falRequestId: requestId });

    await _pollUntilDone(productId, requestId, product.name);
  } catch (e) {
    _updateProduct(productId, { loraStatus: 'error', loraError: e.message, falRequestId: null });
    renderProductsTab();
    updateLaunchImageButton();
    console.warn('[LoraLibrary] Training error:', e.message);
  }
}

async function _pollUntilDone(productId, requestId, productName) {
  const deadline = Date.now() + TRAIN_TIMEOUT;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS));
    _renderElapsed(productId);
    const status = await _falPollStatus('fal-ai/flux-lora-fast-training', requestId);
    if (status.status === 'COMPLETED') {
      const final = await _falFetchResult('fal-ai/flux-lora-fast-training', requestId);
      const loraUrl = final.diffusers_lora_file?.url || final.lora_file?.url;
      if (!loraUrl) throw new Error('No LoRA URL in fal.ai response');
      const product = getProducts().find(p => p.id === productId);
      _updateProduct(productId, { loraStatus: 'ready', loraUrl, trainCompleted: Date.now(), falRequestId: null });
      renderProductsTab();
      renderStep4Products();
      updateLaunchImageButton();
      _showToast(`✅ ${productName || 'Product'} LoRA is ready — generating preview…`);
      // Generate preview in background — re-render card when done
      _generateLoraPreview(productId, loraUrl, product?.triggerWord || '').then(() => renderProductsTab());
      return;
    }
    if (status.status === 'FAILED') throw new Error(status.error || 'Training failed on fal.ai');
  }
  throw new Error('LoRA training timed out (>20 min)');
}

// Generate a preview image using the trained LoRA and store in IDB.
async function _generateLoraPreview(productId, loraUrl, triggerWord) {
  const falKey = getFalKey();
  if (!falKey || !loraUrl) return;
  const prompt = triggerWord
    ? `${triggerWord} product photo, clean white background, professional photography, sharp focus`
    : 'product photo, clean white background, professional photography, sharp focus';
  try {
    const resp = await fetch('https://fal.run/fal-ai/flux-lora', {
      method: 'POST',
      headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, loras: [{ path: loraUrl, scale: 0.9 }], image_size: 'square', num_images: 1, output_format: 'jpeg' }),
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) return;
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return;
    const blob = await imgResp.blob();
    const dataUrl = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    await _idbSet(`lora_${productId}_preview`, dataUrl);
  } catch (e) {
    console.warn('[LoraLibrary] Preview generation failed:', e.message);
  }
}

// Resume polling after page reload for in-progress training
async function _resumePendingTraining() {
  for (const p of getProducts()) {
    if (p.loraStatus === 'training' && p.falRequestId) {
      _pollUntilDone(p.id, p.falRequestId, p.name).catch(e => {
        _updateProduct(p.id, { loraStatus: 'error', loraError: e.message, falRequestId: null });
        renderProductsTab();
        updateLaunchImageButton();
      });
    }
  }
}

function _renderElapsed(productId) {
  const el = document.querySelector(`.lora-product-card[data-product-id="${productId}"] .lora-elapsed`);
  if (!el) return;
  const p = getProducts().find(pr => pr.id === productId);
  if (p && p.trainStarted) el.textContent = `${Math.round((Date.now() - p.trainStarted) / 60000)} min elapsed`;
}

// ── Library page navigation ───────────────────────────────────────
function openLibraryPage() {
  ['drop-zone', 'create-page', 'reel-header-wrapper', 'reel-page'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const page = document.getElementById('library-page');
  if (page) page.style.display = '';
  const backBtns = document.getElementById('nav-back-buttons');
  if (backBtns) backBtns.classList.remove('hidden');
  renderLibraryPage();
}

function closeLibraryPage() {
  const page = document.getElementById('library-page');
  if (page) page.style.display = 'none';
  // Restore landing page (drop-zone)
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) dropZone.style.display = '';
  const backBtns = document.getElementById('nav-back-buttons');
  if (backBtns) backBtns.classList.add('hidden');
}

// ── Library page rendering ────────────────────────────────────────
function renderLibraryPage() {
  renderLibraryCharactersTab();
  // Products tab re-renders only when it's visible (avoid double async render on load)
  const prodPanel = document.getElementById('library-tab-products');
  if (prodPanel && prodPanel.style.display !== 'none') renderProductsTab();
}

async function renderLibraryCharactersTab() {
  const el = document.getElementById('library-char-grid');
  if (!el) return;
  const characters = getCharacters();

  if (characters.length === 0) {
    el.innerHTML = `<div class="lora-empty"><p class="text-sm text-muted">No characters yet. Click <strong>+ Add Character</strong> to get started.</p></div>`;
    return;
  }

  const cards = await Promise.all(characters.map(c => _buildCharacterCardHTML(c)));
  el.innerHTML = cards.join('');
  _wireCharacterCards();
}

async function _buildCharacterCardHTML(c) {
  const count = c.photoCount || 0;
  const thumbs = [];
  for (let i = 0; i < Math.min(4, count); i++) {
    const url = await _idbGet(`lora_char_${c.id}_photo_${i}`);
    if (url) thumbs.push(`<div class="lora-thumb"><img src="${url}" alt=""></div>`);
  }
  const remaining = count - thumbs.length;
  if (remaining > 0) thumbs.push(`<div class="lora-thumb lora-thumb-more">+${remaining}</div>`);

  let statusHtml = '';
  if (c.loraStatus === 'training') {
    const min = c.trainStarted ? Math.round((Date.now() - c.trainStarted) / 60000) : 0;
    statusHtml = `
      <div class="lora-status lora-status--training">
        <div class="lora-progress-bar"><div class="lora-progress-fill"></div></div>
        <span class="text-xs" style="color:var(--amber);">🔄 Training... <span class="lora-elapsed">${min} min elapsed</span></span>
        <span class="text-2xs text-muted">You can leave — we'll update when ready.</span>
      </div>`;
  } else if (c.loraStatus === 'ready') {
    const previewUrl = await _idbGet(`lora_char_${c.id}_preview`);
    statusHtml = `
      <div class="lora-status lora-status--ready">
        <span class="lora-ready-badge">✅ LoRA Ready</span>
        ${previewUrl ? `<img src="${previewUrl}" class="lora-preview-img" alt="Preview">` : ''}
      </div>`;
  } else if (c.loraStatus === 'error') {
    statusHtml = `<div class="lora-status lora-status--error"><span class="text-xs" style="color:var(--red);">⚠ Training failed — retrain below</span></div>`;
  }

  const canTrain = count >= MIN_CHAR_PHOTOS && c.loraStatus !== 'training' && c.loraStatus !== 'ready';

  return `
    <div class="lora-char-card" data-char-id="${c.id}">
      <div class="lora-card-head">
        <span class="lora-char-name">${c.name || 'Character'}</span>
        <button class="lora-card-del" data-delete-char="${c.id}" title="Delete">×</button>
      </div>
      ${c.description ? `<p class="text-2xs text-muted lora-char-desc">${c.description.slice(0, 80)}${c.description.length > 80 ? '…' : ''}</p>` : ''}
      ${thumbs.length ? `<div class="lora-photo-grid">${thumbs.join('')}</div>` : ''}
      <p class="text-2xs text-muted lora-photo-count">
        ${count} training image${count !== 1 ? 's' : ''}${count < MIN_CHAR_PHOTOS ? ` — need ${MIN_CHAR_PHOTOS - count} more` : ''}
      </p>
      ${statusHtml}
      <div class="lora-card-actions">
        <button class="btn-xs" data-edit-char="${c.id}">Edit / Add Images</button>
        ${canTrain ? `<button class="btn-xs primary" data-train-char="${c.id}">Train LoRA ▶</button>` : ''}
        ${c.loraStatus === 'error' ? `<button class="btn-xs" data-retrain-char="${c.id}">Retrain</button>` : ''}
      </div>
    </div>`;
}

function _wireCharacterCards() {
  const grid = document.getElementById('library-char-grid');
  if (!grid) return;

  grid.querySelectorAll('[data-delete-char]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteChar;
      if (!confirm('Delete this character and its training images?')) return;
      deleteCharacter(id);
      renderLibraryCharactersTab();
      renderAssetsSection();
    });
  });
  grid.querySelectorAll('[data-train-char]').forEach(btn => {
    btn.addEventListener('click', () => trainCharacterLora(btn.dataset.trainChar));
  });
  grid.querySelectorAll('[data-retrain-char]').forEach(btn => {
    btn.addEventListener('click', () => {
      _updateCharacter(btn.dataset.retrainChar, { loraStatus: 'idle', loraUrl: null, loraError: null });
      renderLibraryCharactersTab();
    });
  });
  grid.querySelectorAll('[data-edit-char]').forEach(btn => {
    btn.addEventListener('click', () => openCharacterCreationModal(btn.dataset.editChar));
  });
}

// ── Character creation modal ─────────────────────────────────────
function openCharacterCreationModal(editCharId) {
  const modal = document.getElementById('char-create-modal');
  if (!modal) return;

  let char = editCharId ? getCharacterById(editCharId) : null;
  if (!char) {
    // New character
    char = {
      id: 'char_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: '', description: '', photoCount: 0,
      loraStatus: 'idle', loraUrl: null, triggerWord: '',
      trainStarted: null, trainCompleted: null, falRequestId: null, loraError: null,
    };
    saveCharacter(char);
  }

  modal.dataset.charId = char.id;

  const nameInput = document.getElementById('char-name-input');
  const descInput = document.getElementById('char-desc-input');
  if (nameInput) nameInput.value = char.name || '';
  if (descInput) descInput.value = char.description || '';

  // Show/hide steps based on whether photos exist
  const stepForm = document.getElementById('char-create-step-form');
  const stepReview = document.getElementById('char-create-step-review');
  if (char.photoCount > 0) {
    if (stepForm) stepForm.classList.remove('hidden');
    if (stepReview) stepReview.classList.remove('hidden');
    _renderCharReviewGrid(char.id);
  } else {
    if (stepForm) stepForm.classList.remove('hidden');
    if (stepReview) stepReview.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeCharacterCreationModal() {
  const modal = document.getElementById('char-create-modal');
  if (!modal) return;
  // Save name/description if changed
  const charId = modal.dataset.charId;
  if (charId) {
    const nameInput = document.getElementById('char-name-input');
    const descInput = document.getElementById('char-desc-input');
    _updateCharacter(charId, {
      name: (nameInput?.value || '').trim(),
      description: (descInput?.value || '').trim(),
    });
    // Clean up empty characters (no name, no photos)
    const c = getCharacterById(charId);
    if (c && !c.name && !c.photoCount) deleteCharacter(charId);
  }
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  renderLibraryCharactersTab();
}

async function _renderCharReviewGrid(charId) {
  const grid = document.getElementById('char-review-grid');
  if (!grid) return;
  const char = getCharacterById(charId);
  if (!char) return;
  const count = char.photoCount || 0;

  if (count === 0) {
    grid.innerHTML = '<p class="text-sm text-muted">No images yet.</p>';
    return;
  }

  const thumbsHtml = [];
  for (let i = 0; i < count; i++) {
    const url = await _idbGet(`lora_char_${charId}_photo_${i}`);
    if (url) {
      thumbsHtml.push(`
        <div class="char-review-thumb" data-photo-idx="${i}" title="Click to reject">
          <img src="${url}" alt="">
          <button class="char-review-reject" data-reject-photo="${i}">✕</button>
        </div>`);
    }
  }

  const stepReview = document.getElementById('char-create-step-review');
  if (stepReview) stepReview.classList.remove('hidden');

  grid.innerHTML = thumbsHtml.join('');
  const countLabel = document.getElementById('char-review-count');
  if (countLabel) countLabel.textContent = `${count} image${count !== 1 ? 's' : ''} (need ${MIN_CHAR_PHOTOS}+)`;

  // Wire reject buttons — mark photo slot as deleted by overwriting with null marker
  grid.querySelectorAll('[data-reject-photo]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.rejectPhoto, 10);
      // Compact: remove this photo and shift remaining down
      const char = getCharacterById(charId);
      const total = char?.photoCount || 0;
      for (let i = idx; i < total - 1; i++) {
        const next = await _idbGet(`lora_char_${charId}_photo_${i + 1}`);
        if (next) await _idbSet(`lora_char_${charId}_photo_${i}`, next);
        else await _idbDel(`lora_char_${charId}_photo_${i}`);
      }
      await _idbDel(`lora_char_${charId}_photo_${total - 1}`);
      _updateCharacter(charId, { photoCount: Math.max(0, total - 1) });
      _renderCharReviewGrid(charId);
    });
  });

  _updateCharTrainBtn(charId);
}

function _updateCharTrainBtn(charId) {
  const btn = document.getElementById('btn-char-train-lora');
  if (!btn) return;
  const char = getCharacterById(charId);
  const count = char?.photoCount || 0;
  btn.disabled = count < MIN_CHAR_PHOTOS || char?.loraStatus === 'training';
  btn.textContent = char?.loraStatus === 'training'
    ? '⏳ Training...'
    : `Train LoRA ▶ (${count}/${MIN_CHAR_PHOTOS} min)`;
}

async function _saveNameDescFromModal(charId) {
  const nameInput = document.getElementById('char-name-input');
  const descInput = document.getElementById('char-desc-input');
  const name = (nameInput?.value || '').trim();
  const description = (descInput?.value || '').trim();
  if (!name) { _showToast('Enter a character name first.'); return null; }
  _updateCharacter(charId, { name, description });
  return { name, description };
}

function _initCharCreateModal() {
  const modal = document.getElementById('char-create-modal');
  if (!modal) return;

  // Close button
  const closeBtn = document.getElementById('btn-char-create-close');
  if (closeBtn) closeBtn.addEventListener('click', closeCharacterCreationModal);

  // Click outside backdrop to close
  modal.addEventListener('click', e => { if (e.target === modal) closeCharacterCreationModal(); });

  // Generate Images button
  const genBtn = document.getElementById('btn-char-generate-images');
  if (genBtn) {
    genBtn.addEventListener('click', async () => {
      const charId = modal.dataset.charId;
      const info = await _saveNameDescFromModal(charId);
      if (!info) return;
      if (!info.description) { _showToast('Add an appearance description to generate images.'); return; }

      genBtn.disabled = true;
      genBtn.textContent = 'Generating 12 images…';
      const stepReview = document.getElementById('char-create-step-review');
      if (stepReview) stepReview.classList.remove('hidden');
      const grid = document.getElementById('char-review-grid');
      if (grid) grid.innerHTML = '<p class="text-sm text-muted">Generating…</p>';

      try {
        await generateCharacterTrainingImages(charId);
        await _renderCharReviewGrid(charId);
        _showToast('Training images generated. Remove any bad ones, then click Train LoRA.');
      } catch (e) {
        _showToast(`Image generation failed: ${e.message}`);
        if (grid) grid.innerHTML = `<p class="text-xs" style="color:var(--red);">${e.message}</p>`;
      } finally {
        genBtn.disabled = false;
        genBtn.textContent = 'Regenerate Images ↺';
      }
    });
  }

  // Upload own photos
  const uploadInput = document.getElementById('char-upload-input');
  if (uploadInput) {
    uploadInput.addEventListener('change', async e => {
      const charId = modal.dataset.charId;
      const info = await _saveNameDescFromModal(charId);
      if (!info) return;
      const char = getCharacterById(charId);
      let count = char?.photoCount || 0;
      for (const f of Array.from(e.target.files)) {
        if (count >= MAX_CHAR_PHOTOS) break;
        const dataUrl = await _fileToDataUrl(f);
        await _idbSet(`lora_char_${charId}_photo_${count}`, dataUrl);
        count++;
      }
      _updateCharacter(charId, { photoCount: count });
      await _renderCharReviewGrid(charId);
      uploadInput.value = '';
    });
  }

  // Train LoRA button inside modal
  const trainBtn = document.getElementById('btn-char-train-lora');
  if (trainBtn) {
    trainBtn.addEventListener('click', async () => {
      const charId = modal.dataset.charId;
      const info = await _saveNameDescFromModal(charId);
      if (!info) return;
      closeCharacterCreationModal();
      await trainCharacterLora(charId);
    });
  }
}

// ── Character picker dropdown (used by Assets section) ───────────
function openCharacterPicker(anchorEl, onSelect, allowNone) {
  const existing = document.getElementById('char-picker-dropdown');
  if (existing) { existing.remove(); return; }

  const characters = getCharacters();
  const items = [];
  if (allowNone) {
    items.push(`<div class="lora-picker-item" data-pick-char="">
      <span class="text-muted">— None</span></div>`);
  }
  if (characters.length === 0 && !allowNone) {
    _showToast('No characters in Library. Add one in Library → Characters.');
    return;
  }
  characters.forEach(c => {
    items.push(`<div class="lora-picker-item" data-pick-char="${c.id}">
      <span>${c.name || 'Character'}</span>
      <span class="step4-lora-badge step4-lora-badge--${c.loraStatus}">
        ${c.loraStatus === 'ready' ? '✅ LoRA' : c.loraStatus === 'training' ? '⏳ Training' : '○ No LoRA'}
      </span>
    </div>`);
  });

  const dropdown = document.createElement('div');
  dropdown.id = 'char-picker-dropdown';
  dropdown.className = 'lora-picker-dropdown';
  dropdown.innerHTML = items.join('');

  anchorEl.parentElement.style.position = 'relative';
  anchorEl.parentElement.appendChild(dropdown);

  dropdown.querySelectorAll('[data-pick-char]').forEach(item => {
    item.addEventListener('click', () => {
      dropdown.remove();
      onSelect(item.dataset.pickChar || null);
    });
  });

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!dropdown.contains(e.target) && e.target !== anchorEl) {
        dropdown.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 0);
}

async function renderProductsTab() {
  const el = document.getElementById('library-product-grid');
  if (!el) return;
  const key = getFalKey();
  const products = getProducts();

  if (!key) {
    el.innerHTML = `<div class="lora-empty"><p class="text-sm text-muted">Add your fal.ai key above to train product LoRAs.</p></div>`;
    return;
  }
  if (products.length === 0) {
    el.innerHTML = `<div class="lora-empty"><p class="text-sm text-muted">No products yet. Click <strong>+ Add Product</strong> to get started.</p></div>`;
    return;
  }

  const cards = await Promise.all(products.map(p => _buildProductCardHTML(p)));
  el.innerHTML = cards.join('');
  _wireProductCards();
}

async function _buildProductCardHTML(p) {
  const count = p.photoCount || 0;
  const thumbs = [];
  for (let i = 0; i < Math.min(4, count); i++) {
    const url = await _idbGet(`lora_${p.id}_photo_${i}`);
    if (url) thumbs.push(`<div class="lora-thumb"><img src="${url}" alt=""></div>`);
  }
  const remaining = count - thumbs.length;
  if (remaining > 0) thumbs.push(`<div class="lora-thumb lora-thumb-more">+${remaining}</div>`);
  if (count < MAX_PHOTOS) {
    thumbs.push(`
      <label class="lora-thumb lora-thumb-add" title="Add photos">
        +<input type="file" accept="image/*" multiple hidden data-add-photos="${p.id}">
      </label>`);
  }

  const canTrain = count >= MIN_PHOTOS && p.loraStatus !== 'training' && p.loraStatus !== 'ready';
  let statusHtml = '';
  if (p.loraStatus === 'training') {
    const min = p.trainStarted ? Math.round((Date.now() - p.trainStarted) / 60000) : 0;
    statusHtml = `
      <div class="lora-status lora-status--training">
        <div class="lora-progress-bar"><div class="lora-progress-fill"></div></div>
        <span class="text-xs" style="color:var(--amber);">🔄 Training... <span class="lora-elapsed">${min} min elapsed</span></span>
        <span class="text-2xs text-muted">You can leave — we'll update when ready.</span>
      </div>`;
  } else if (p.loraStatus === 'ready') {
    const previewUrl = await _idbGet(`lora_${p.id}_preview`);
    statusHtml = `
      <div class="lora-status lora-status--ready">
        <span class="lora-ready-badge">✅ LoRA Ready</span>
        ${previewUrl ? `<img src="${previewUrl}" class="lora-preview-img" alt="Preview">` : ''}
      </div>`;
  } else if (p.loraStatus === 'error') {
    statusHtml = `<div class="lora-status lora-status--error"><span class="text-xs" style="color:var(--red);">⚠ Training failed — retrain below</span></div>`;
  }

  return `
    <div class="lora-product-card" data-product-id="${p.id}">
      <div class="lora-card-head">
        <input class="lora-name-input" type="text" value="${p.name || ''}" placeholder="Product name" data-name-product="${p.id}">
        <button class="lora-card-del" data-delete-product="${p.id}" title="Delete">×</button>
      </div>
      <div class="lora-photo-grid">${thumbs.join('')}</div>
      <p class="text-2xs text-muted lora-photo-count">
        ${count}/${MAX_PHOTOS} photos${count < MIN_PHOTOS ? ` — add ${MIN_PHOTOS - count} more to enable training` : ''}
      </p>
      ${statusHtml}
      <div class="lora-card-actions">
        ${canTrain ? `<button class="btn-xs primary" data-train-product="${p.id}">Train LoRA ▶</button>` : ''}
        ${p.loraStatus === 'ready' || p.loraStatus === 'error'
          ? `<button class="btn-xs" data-retrain-product="${p.id}">Retrain</button>` : ''}
      </div>
    </div>`;
}

function _wireProductCards() {
  const page = document.getElementById('library-page');
  if (!page) return;

  page.querySelectorAll('[data-add-photos]').forEach(input => {
    input.addEventListener('change', async e => {
      await addPhotosToProduct(e.target.dataset.addPhotos, Array.from(e.target.files));
    });
  });
  page.querySelectorAll('[data-name-product]').forEach(input => {
    input.addEventListener('change', e => _updateProduct(e.target.dataset.nameProduct, { name: e.target.value }));
  });
  page.querySelectorAll('[data-train-product]').forEach(btn => {
    btn.addEventListener('click', () => trainProductLora(btn.dataset.trainProduct));
  });
  page.querySelectorAll('[data-retrain-product]').forEach(btn => {
    btn.addEventListener('click', () => {
      _updateProduct(btn.dataset.retrainProduct, { loraStatus: 'idle', loraUrl: null, loraError: null });
      renderProductsTab();
    });
  });
  page.querySelectorAll('[data-delete-product]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteProduct;
      if (!confirm('Delete this product and its photos?')) return;
      await deleteProductPhotos(id);
      saveProducts(getProducts().filter(p => p.id !== id));
      setSelectedProductIds(getSelectedProductIds().filter(pid => pid !== id));
      renderProductsTab();
      renderStep4Products();
      updateLaunchImageButton();
    });
  });
}

// ── Library tab switching ─────────────────────────────────────────
function switchLibraryTab(tab) {
  ['characters', 'products'].forEach(t => {
    const btn = document.querySelector(`.library-tab[data-tab="${t}"]`);
    const panel = document.getElementById(`library-tab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'products') renderProductsTab();
  if (tab === 'characters') renderLibraryCharactersTab();
}

// ── Step 4 — Products picker ──────────────────────────────────────
function renderStep4Products() {
  const list = document.getElementById('step4-product-list');
  if (!list) return;
  const products = getProducts();
  const selected = getSelectedProductIds();
  const active = selected.map(id => products.find(p => p.id === id)).filter(Boolean);

  list.innerHTML = active.map(p => `
    <div class="step4-product-row">
      <span class="text-sm" style="flex:1;">${p.name || 'Product'}</span>
      <span class="step4-lora-badge step4-lora-badge--${p.loraStatus}">
        ${p.loraStatus === 'ready' ? '✅ Ready' : p.loraStatus === 'training' ? '⏳ Training...' : '⚠ Not trained'}
      </span>
      <button class="btn-xs danger" data-remove-s4="${p.id}">Remove</button>
    </div>`).join('');

  list.querySelectorAll('[data-remove-s4]').forEach(btn => {
    btn.addEventListener('click', () => {
      setSelectedProductIds(getSelectedProductIds().filter(id => id !== btn.dataset.removeS4));
      renderStep4Products();
    });
  });

  updateLaunchImageButton();
}

function openProductPicker() {
  const existing = document.getElementById('lora-product-picker-dropdown');
  if (existing) { existing.remove(); return; }

  const products = getProducts().filter(p => p.loraStatus === 'ready' || p.loraStatus === 'training');
  if (products.length === 0) {
    _showToast('No trained or in-progress products found. Add products in the Library first.');
    return;
  }

  const btn = document.getElementById('btn-select-product-lora');
  if (!btn) return;
  const dropdown = document.createElement('div');
  dropdown.id = 'lora-product-picker-dropdown';
  dropdown.className = 'lora-picker-dropdown';
  dropdown.innerHTML = products.map(p => `
    <div class="lora-picker-item" data-pick-product="${p.id}">
      <span>${p.name || 'Product'}</span>
      <span class="step4-lora-badge step4-lora-badge--${p.loraStatus}">
        ${p.loraStatus === 'ready' ? '✅ Ready' : '⏳ Training'}
      </span>
    </div>`).join('');

  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(dropdown);

  dropdown.querySelectorAll('[data-pick-product]').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.pickProduct;
      if (!getSelectedProductIds().includes(id)) {
        setSelectedProductIds([...getSelectedProductIds(), id]);
      }
      dropdown.remove();
      renderStep4Products();
    });
  });

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 0);
}

// ── Assets section — renders after storyboard is generated ───────
function renderAssetsSection() {
  const cs = window.createJobState || {};
  const a = cs.loraAssignments || {};
  const section = document.getElementById('create-assets-step');
  if (!section) return;

  const hasChars    = (cs.characters || []).length > 0;
  const hasNarrator = cs.narrator?.onScreenStyle === 'talking-head';
  const hasBrand    = cs.videoType === 'brand';
  const anyVisible  = hasChars || hasNarrator || hasBrand;

  section.style.display = anyVisible ? '' : 'none';

  // Characters sub-section
  const charSection = document.getElementById('assets-characters-section');
  if (charSection) {
    charSection.classList.toggle('hidden', !hasChars);
    if (hasChars) _renderAssetsCharacters(cs.characters, a);
  }

  // Narrator sub-section
  const narrSection = document.getElementById('assets-narrator-section');
  if (narrSection) {
    narrSection.classList.toggle('hidden', !hasNarrator);
    if (hasNarrator) _renderAssetsNarrator(cs.narrator, a);
  }

  // Products sub-section
  const prodSection = document.getElementById('assets-products-section');
  if (prodSection) {
    prodSection.classList.toggle('hidden', !hasBrand);
    if (hasBrand) _renderAssetsProducts(a);
  }
}

function _assetsGenBadge(libCharId) {
  if (!libCharId) return '<span class="assets-badge assets-badge--none">○ Gemini + face swap</span>';
  const c = getCharacterById(libCharId);
  if (!c) return '<span class="assets-badge assets-badge--none">○ Unassigned</span>';
  if (c.loraStatus === 'ready')    return '<span class="assets-badge assets-badge--lora">● LoRA → FLUX</span>';
  if (c.loraStatus === 'training') return '<span class="assets-badge assets-badge--training">⏳ Training…</span>';
  return '<span class="assets-badge assets-badge--portrait">○ Portrait ref</span>';
}

function _assetsProductBadge(prodId) {
  const p = getProducts().find(x => x.id === prodId);
  if (!p) return '<span class="assets-badge assets-badge--none">○ No LoRA</span>';
  if (p.loraStatus === 'ready')    return '<span class="assets-badge assets-badge--lora">● LoRA → FLUX</span>';
  if (p.loraStatus === 'training') return '<span class="assets-badge assets-badge--training">⏳ Training…</span>';
  return '<span class="assets-badge assets-badge--none">○ Not trained</span>';
}

function _renderAssetsCharacters(storyChars, a) {
  const list = document.getElementById('assets-character-list');
  if (!list) return;
  list.innerHTML = storyChars.map(sc => {
    const libId = a.characters?.[sc.id] || '';
    const libChar = libId ? getCharacterById(libId) : null;
    return `
      <div class="assets-row" data-story-char-id="${sc.id}">
        <span class="assets-story-name">${sc.name}</span>
        <div class="assets-assign-wrap" style="position:relative;">
          <button class="btn-xs assets-assign-btn" data-assign-char="${sc.id}">
            ${libChar ? libChar.name : 'Assign from Library ▼'}
          </button>
        </div>
        <div class="assets-badge-wrap">${_assetsGenBadge(libId)}</div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-assign-char]').forEach(btn => {
    btn.addEventListener('click', () => {
      openCharacterPicker(btn, (pickedId) => {
        if (!window.createJobState) return;
        if (!window.createJobState.loraAssignments) window.createJobState.loraAssignments = { characters: {}, narrator: null, products: [] };
        window.createJobState.loraAssignments.characters[btn.dataset.assignChar] = pickedId;
        renderAssetsSection();
        updateLaunchImageButton();
      }, true);
    });
  });
}

function _renderAssetsNarrator(narrator, a) {
  const slot = document.getElementById('assets-narrator-slot');
  if (!slot) return;
  const libId = a.narrator || '';
  const libChar = libId ? getCharacterById(libId) : null;
  slot.innerHTML = `
    <div class="assets-row">
      <span class="assets-story-name">${narrator.name || 'Narrator'}</span>
      <div class="assets-assign-wrap" style="position:relative;">
        <button class="btn-xs assets-assign-btn" id="assets-narrator-btn">
          ${libChar ? libChar.name : 'Assign from Library ▼'}
        </button>
      </div>
      <div class="assets-badge-wrap">${_assetsGenBadge(libId)}</div>
    </div>`;

  const btn = document.getElementById('assets-narrator-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      openCharacterPicker(btn, (pickedId) => {
        if (!window.createJobState) return;
        if (!window.createJobState.loraAssignments) window.createJobState.loraAssignments = { characters: {}, narrator: null, products: [] };
        window.createJobState.loraAssignments.narrator = pickedId;
        renderAssetsSection();
        updateLaunchImageButton();
      }, true);
    });
  }
}

function _renderAssetsProducts(a) {
  const list = document.getElementById('assets-product-list');
  if (!list) return;
  const products = getProducts();
  const selected = a.products || [];

  list.innerHTML = `
    <div class="form-row mb-sm" style="position:relative;">
      <button class="btn-xs" id="assets-add-product-btn">Select product ▼</button>
    </div>
    ${selected.map(pid => {
      const p = products.find(x => x.id === pid);
      if (!p) return '';
      return `
        <div class="assets-row">
          <span class="assets-story-name">${p.name || 'Product'}</span>
          <div class="assets-badge-wrap">${_assetsProductBadge(pid)}</div>
          <button class="btn-xs danger" data-remove-asset-prod="${pid}">Remove</button>
        </div>`;
    }).join('')}`;

  const addBtn = document.getElementById('assets-add-product-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const available = products.filter(p => p.loraStatus === 'ready' || p.loraStatus === 'training');
      if (available.length === 0) { _showToast('No trained products in Library. Add products first.'); return; }

      const dropdown = document.createElement('div');
      dropdown.className = 'lora-picker-dropdown';
      dropdown.style.position = 'absolute';
      dropdown.style.zIndex = '300';
      dropdown.innerHTML = available.map(p => `
        <div class="lora-picker-item" data-pick-prod="${p.id}">
          <span>${p.name || 'Product'}</span>
          <span class="step4-lora-badge step4-lora-badge--${p.loraStatus}">
            ${p.loraStatus === 'ready' ? '✅ Ready' : '⏳ Training'}
          </span>
        </div>`).join('');

      addBtn.parentElement.appendChild(dropdown);
      dropdown.querySelectorAll('[data-pick-prod]').forEach(item => {
        item.addEventListener('click', () => {
          const pid = item.dataset.pickProd;
          if (!window.createJobState) return;
          if (!window.createJobState.loraAssignments) window.createJobState.loraAssignments = { characters: {}, narrator: null, products: [] };
          if (!window.createJobState.loraAssignments.products.includes(pid)) {
            window.createJobState.loraAssignments.products.push(pid);
          }
          dropdown.remove();
          renderAssetsSection();
          updateLaunchImageButton();
        });
      });
      setTimeout(() => {
        document.addEventListener('click', function close(e) {
          if (!dropdown.contains(e.target) && e.target !== addBtn) {
            dropdown.remove();
            document.removeEventListener('click', close);
          }
        });
      }, 0);
    });
  }

  list.querySelectorAll('[data-remove-asset-prod]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.removeAssetProd;
      if (!window.createJobState?.loraAssignments) return;
      window.createJobState.loraAssignments.products = (window.createJobState.loraAssignments.products || []).filter(id => id !== pid);
      renderAssetsSection();
      updateLaunchImageButton();
    });
  });
}

// ── Generation blocking ───────────────────────────────────────────
function isLoraBlocking() {
  const a = (window.createJobState || {}).loraAssignments || {};

  // Products from loraAssignments (new path) or fallback legacy loraProductIds
  const productIds = a.products?.length
    ? a.products
    : getSelectedProductIds();
  const products = getProducts();
  const productBlocking = productIds.some(id => {
    const p = products.find(pr => pr.id === id);
    return p && p.loraStatus !== 'ready';
  });

  // Characters
  const charBlocking = Object.values(a.characters || {}).some(libId => {
    if (!libId) return false;
    const c = getCharacterById(libId);
    return c && c.loraStatus !== 'ready';
  });

  // Narrator
  const narratorBlocking = a.narrator
    ? (() => { const c = getCharacterById(a.narrator); return c && c.loraStatus !== 'ready'; })()
    : false;

  return productBlocking || charBlocking || narratorBlocking;
}

function updateLaunchImageButton() {
  const btn = document.getElementById('btn-launch-image');
  const notice = document.getElementById('lora-block-notice');
  const noticeText = document.getElementById('lora-block-text');
  if (!btn) return;

  if (isLoraBlocking()) {
    btn.disabled = true;
    btn.classList.add('lora-blocked');
    if (notice) {
      notice.style.display = '';
      // Collect names of all pending items
      const a = (window.createJobState || {}).loraAssignments || {};
      const products = getProducts();
      const productIds = a.products?.length ? a.products : getSelectedProductIds();
      const pending = [];
      productIds.forEach(id => {
        const p = products.find(pr => pr.id === id);
        if (p && p.loraStatus !== 'ready') pending.push(p.name || 'Product');
      });
      Object.values(a.characters || {}).forEach(libId => {
        if (!libId) return;
        const c = getCharacterById(libId);
        if (c && c.loraStatus !== 'ready') pending.push(c.name || 'Character');
      });
      if (a.narrator) {
        const c = getCharacterById(a.narrator);
        if (c && c.loraStatus !== 'ready') pending.push(c.name || 'Narrator');
      }
      if (noticeText) noticeText.textContent = `Waiting for LoRA training: ${pending.join(', ')}. Image generation is blocked until ready.`;
    }
  } else {
    btn.disabled = false;
    btn.classList.remove('lora-blocked');
    if (notice) notice.style.display = 'none';
  }
}

// ── fal.ai key UI ─────────────────────────────────────────────────
function initFalKeyInput() {
  const input = document.getElementById('lora-fal-key-input');
  const saveBtn = document.getElementById('btn-lora-save-key');
  const status = document.getElementById('lora-key-status');
  if (!input || !saveBtn) return;
  input.value = getFalKey();
  saveBtn.addEventListener('click', () => {
    saveFalKey(input.value);
    if (status) { status.textContent = '✅ Saved'; setTimeout(() => { status.textContent = ''; }, 2000); }
    renderProductsTab();
  });
}

// ── Replicate key UI ──────────────────────────────────────────────
function initReplicateKeyInput() {
  const input = document.getElementById('replicate-key-input');
  const saveBtn = document.getElementById('btn-replicate-save-key');
  const status = document.getElementById('replicate-key-status');
  if (!input || !saveBtn) return;
  input.value = localStorage.getItem('stori_replicate_api_key') || '';
  saveBtn.addEventListener('click', () => {
    localStorage.setItem('stori_replicate_api_key', input.value.trim());
    if (status) { status.textContent = '✅ Saved'; setTimeout(() => { status.textContent = ''; }, 2000); }
  });
}

// ── Add new product ───────────────────────────────────────────────
function addNewProduct() {
  const id = 'prod_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const list = getProducts();
  list.push({ id, name: '', photoCount: 0, loraStatus: 'idle', loraUrl: null,
    trainStarted: null, trainCompleted: null, falRequestId: null, loraError: null });
  saveProducts(list);
  renderProductsTab();
}

// ── Toast ─────────────────────────────────────────────────────────
function _showToast(msg) {
  if (typeof showToast === 'function') { showToast(msg); return; }
  const t = document.createElement('div');
  t.className = 'lora-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── Init ──────────────────────────────────────────────────────────
function _init() {
  const navLink = document.getElementById('btn-library-nav');
  if (navLink) navLink.addEventListener('click', e => { e.preventDefault(); openLibraryPage(); });

  // Back button returns from library
  const homeBtn = document.getElementById('btn-editor-home');
  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      if (document.getElementById('library-page')?.style.display !== 'none') closeLibraryPage();
    }, true);
  }

  document.querySelectorAll('.library-tab').forEach(btn => {
    btn.addEventListener('click', () => switchLibraryTab(btn.dataset.tab));
  });

  const addBtn = document.getElementById('btn-add-product');
  if (addBtn) addBtn.addEventListener('click', addNewProduct);

  const addCharBtn = document.getElementById('btn-add-char-library');
  if (addCharBtn) addCharBtn.addEventListener('click', () => openCharacterCreationModal(null));

  const pickerBtn = document.getElementById('btn-select-product-lora');
  if (pickerBtn) pickerBtn.addEventListener('click', openProductPicker);

  _initCharCreateModal();
  _resumePendingCharTraining();
  initFalKeyInput();
  initReplicateKeyInput();
  _resumePendingTraining();
  renderStep4Products();
}

async function _resumePendingCharTraining() {
  for (const c of getCharacters()) {
    if (c.loraStatus === 'training' && c.falRequestId) {
      _pollUntilDoneChar(c.id, c.falRequestId, c.name).catch(e => {
        _updateCharacter(c.id, { loraStatus: 'error', loraError: e.message, falRequestId: null });
        renderLibraryCharactersTab();
        updateLaunchImageButton();
      });
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init);
} else {
  _init();
}

window.LoraLibrary = {
  // Products
  openLibraryPage,
  renderProductsTab,
  renderStep4Products,
  getProducts,
  getSelectedProductIds,
  getFalKey,
  trainProductLora,
  // Characters
  getCharacters,
  getCharacterById,
  saveCharacter,
  deleteCharacter,
  trainCharacterLora,
  generateCharacterTrainingImages,
  renderLibraryCharactersTab,
  openCharacterPicker,
  // Assets section
  renderAssetsSection,
  // Blocking / launch
  updateLaunchImageButton,
  isLoraBlocking,
};

})();
