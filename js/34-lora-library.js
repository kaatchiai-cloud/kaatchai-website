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

// ── V2 storage keys ──────────────────────────────────────────────
const ITEMS_KEY    = 'stori_lora_items_v2';
const MIGRATED_KEY = 'stori_lora_migrated_v2';

// Returns a fresh default tuning params object (random seed per call).
function _defaultTuning() {
  return {
    lora_scale: 0.9,
    guidance_scale: 3.5,
    seed: Math.floor(Math.random() * 2147483647),
    refineEnabled: false,
  };
}

// ── V2 trainer configuration ──────────────────────────────────────
const TRAINERS_V2 = {
  'flux-portrait': {
    endpoint:       'fal-ai/flux-lora-portrait-trainer',
    inference:      'fal-ai/flux-lora',
    paramKey:       'images_data_url',   // expects array of data URLs
    triggerKey:     'trigger_phrase',
    resultLoraKey:  'diffusers_lora_file',
    extraParams:    { create_masks: true },
    defaultSteps:   2000,
  },
  'qwen': {
    endpoint:       'fal-ai/qwen-image-trainer',
    inference:      'fal-ai/qwen-image',
    paramKey:       'image_data_url',    // expects single ZIP URL — ZIP creation in Phase 5
    triggerKey:     'trigger_phrase',
    resultLoraKey:  'lora_file',
    extraParams:    { learning_rate: 5e-4 },
    defaultSteps:   2000,
  },
  'flux-fast': {
    endpoint:       'fal-ai/flux-lora-fast-training',
    inference:      'fal-ai/flux-lora',
    paramKey:       'images_data_url',   // expects array of data URLs
    triggerKey:     'trigger_word',      // different key name than portrait trainer
    resultLoraKey:  'diffusers_lora_file',
    extraParams:    {},
    defaultSteps:   1500,
  },
};

// Phase labels shown to user while training runs (time-based estimates)
const TRAIN_PHASES_V2 = [
  { pct: 0,  label: 'Preparing training data…' },
  { pct: 5,  label: 'Learning facial features…' },
  { pct: 30, label: 'Learning body proportions…' },
  { pct: 60, label: 'Refining identity details…' },
  { pct: 90, label: 'Final quality checks…' },
];

// ── Phase 5: outfit themes for training grid generation ──────────
const OUTFIT_THEMES = [
  { key: 'formal',       label: 'Formal',       desc: 'wearing a navy suit, crisp white dress shirt, dark tie' },
  { key: 'smart_casual', label: 'Smart Casual',  desc: 'wearing smart-casual attire, Henley top, fitted chinos' },
  { key: 'casual',       label: 'Casual',        desc: 'wearing casual clothing, plain T-shirt and jeans' },
];

// 9 pose descriptions for each grid row (one per cell)
const GRID_CELL_POSES = [
  'upper body portrait, front-facing, neutral expression, soft even studio lighting',
  'upper body portrait, 3/4 angle, slight natural smile, warm diffused light',
  'upper body portrait, side profile facing left, neutral expression, clean background',
  'seated at a desk, front view, professional posture, indoor lighting',
  'standing full body shot, relaxed natural stance, arms at sides',
  'close-up headshot, direct eye contact, soft fill light',
  'upper body, glancing over shoulder at camera, candid feel',
  'standing near a window, natural side light, slight lean against wall',
  'outdoor portrait, looking slightly upward, open sky background, natural light',
];

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

// ── V2 item CRUD (unified — products + all character types) ─────
function getItems() {
  try { return JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]'); } catch { return []; }
}
function saveItems(list) {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(list));
}
function getItemById(id) {
  return getItems().find(item => item.id === id) || null;
}
function saveItem(item) {
  const list = getItems();
  const i = list.findIndex(x => x.id === item.id);
  if (i >= 0) list[i] = item; else list.push(item);
  saveItems(list);
}
function deleteItem(id) {
  saveItems(getItems().filter(item => item.id !== id));
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

// ── LoRA Studio navigation ────────────────────────────────────────
function openStudio() {
  ['drop-zone', 'create-page', 'reel-header-wrapper', 'reel-page'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const page = document.getElementById('lora-studio-page');
  if (page) page.style.display = '';
  const backBtns = document.getElementById('nav-back-buttons');
  if (backBtns) backBtns.classList.remove('hidden');
  renderStudio();
}

function closeStudio() {
  const page = document.getElementById('lora-studio-page');
  if (page) page.style.display = 'none';
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) dropZone.style.display = '';
  const backBtns = document.getElementById('nav-back-buttons');
  if (backBtns) backBtns.classList.add('hidden');
}

// Backward-compat aliases (no outside callers, kept for safety)
function openLibraryPage()  { openStudio(); }
function closeLibraryPage() { closeStudio(); }

// ── Studio rendering ──────────────────────────────────────────────
function renderStudio() {
  initStudioKeyInput();
  _renderStudioCards();
  _renderTopbarTrainingIndicator();
}

// Kept as no-op alias; old callers would have used renderLibraryPage()
function renderLibraryPage() { renderStudio(); }

// ── Studio card grid ──────────────────────────────────────────────
function _getStudioFilter() {
  const active = document.querySelector('.studio-filter.active');
  return active ? active.dataset.filter : 'all';
}

async function _renderStudioCards() {
  const grid = document.getElementById('studio-items-grid');
  if (!grid) return;

  const filter = _getStudioFilter();
  const allItems = getItems();
  const items = filter === 'all' ? allItems : allItems.filter(i => i.type === filter);

  if (items.length === 0) {
    const label = filter === 'all' ? 'No LoRAs yet' : `No ${filter} LoRAs yet`;
    grid.innerHTML = `<div class="lora-empty">
      <p class="text-sm text-muted">${label}. Click <strong>+ New LoRA</strong> to get started.</p>
    </div>`;
    return;
  }

  const cards = await Promise.all(items.map(item => _buildStudioCardHTML(item)));
  grid.innerHTML = cards.join('');
  _wireStudioCards();
}

async function _buildStudioCardHTML(item) {
  const TYPE_LABELS = {
    'product':      '📦 Product',
    'talking-head': '🗣 Talking Head',
    'scene-real':   '🎬 Scene (Real)',
    'scene-ai':     '✨ Scene (AI)',
  };
  const typeLabel = TYPE_LABELS[item.type] || item.type;
  const lockHtml = item.locked ? '<span class="studio-lock-icon" title="Locked">🔒</span>' : '';

  // Preview image — try v2 key first, fall back to v1 key for migrated items
  let previewHtml = '<div class="studio-card-preview-placeholder">No preview</div>';
  const previewData = await _idbGet(`lora_v2_${item.id}_preview_0`).catch(() => null)
    || await _idbGet(`lora_${item.id}_preview`).catch(() => null)
    || await _idbGet(`lora_char_${item.id}_preview`).catch(() => null);
  if (previewData) {
    previewHtml = `<img src="${previewData}" class="studio-card-img" alt="Preview">`;
  }

  // Status
  let statusHtml;
  const pct = item.progressPct || 0;
  if (item.loraStatus === 'training') {
    statusHtml = `
      <div class="studio-card-status studio-status--training">
        <div class="studio-progress-bar"><div class="studio-progress-fill" style="width:${pct}%"></div></div>
        <span class="text-2xs" style="color:var(--amber)">${item.progressPhase || 'Training…'} ${pct}%</span>
      </div>`;
  } else if (item.loraStatus === 'generating') {
    statusHtml = `
      <div class="studio-card-status studio-status--training">
        <div class="studio-progress-bar"><div class="studio-progress-fill indeterminate"></div></div>
        <span class="text-2xs" style="color:var(--accent)">Generating images…</span>
      </div>`;
  } else if (item.loraStatus === 'reviewing') {
    statusHtml = `<div class="studio-card-status"><span class="studio-status-badge studio-status-badge--review">Review images</span></div>`;
  } else if (item.loraStatus === 'ready') {
    statusHtml = `<div class="studio-card-status"><span class="studio-status-badge studio-status-badge--ready">✅ LoRA Ready</span></div>`;
  } else if (item.loraStatus === 'error') {
    statusHtml = `<div class="studio-card-status"><span class="studio-status-badge studio-status-badge--error">⚠ Training failed</span></div>`;
  } else {
    statusHtml = `<div class="studio-card-status"><span class="text-2xs text-muted">Not trained</span></div>`;
  }

  // Voice pill (characters only)
  const voiceHtml = (item.type !== 'product' && item.voiceProfile)
    ? `<span class="studio-compat-pill studio-voice-pill" title="${item.voiceProfile.voiceName || 'Voice set'}">🎙 ${item.voiceProfile.voiceName || 'Voice'}</span>`
    : '';

  // Compat pills
  const compatPills = (item.compatibleWith || []).map(c =>
    `<span class="studio-compat-pill">${c}</span>`
  ).join('');

  return `
    <div class="studio-card" data-item-id="${item.id}">
      <div class="studio-card-head">
        <span class="studio-card-badge studio-card-badge--${item.type}">${typeLabel}</span>
        ${lockHtml}
        <button class="studio-card-menu" data-menu-item="${item.id}" title="Options">•••</button>
      </div>
      <div class="studio-card-preview">${previewHtml}</div>
      <div class="studio-card-name">${item.name || 'Unnamed'}</div>
      ${statusHtml}
      <div class="studio-card-compat">${compatPills}${voiceHtml}</div>
    </div>`;
}

function _wireStudioCards() {
  const grid = document.getElementById('studio-items-grid');
  if (!grid) return;

  grid.querySelectorAll('.studio-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('[data-menu-item]')) return;
      const id = card.dataset.itemId;
      if (id) _openItemDetail(id);
    });
  });

  grid.querySelectorAll('[data-menu-item]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _openCardMenu(btn, btn.dataset.menuItem);
    });
  });
}

function _openItemDetail(itemId) {
  const item = getItemById(itemId);
  if (!item) return;
  if (item.loraStatus === 'reviewing') {
    _openReviewModal(itemId);
    return;
  }
  if (item.loraStatus === 'ready') {
    _openTuningPanel(itemId);
    return;
  }
  // Fallback: open card menu
  const btn = document.querySelector(`.studio-card[data-item-id="${itemId}"] .studio-card-menu`);
  if (btn) _openCardMenu(btn, itemId);
}

function _openCardMenu(anchorBtn, itemId) {
  document.getElementById('studio-card-menu-dropdown')?.remove();

  const item = getItemById(itemId);
  if (!item) return;

  const menu = document.createElement('div');
  menu.id = 'studio-card-menu-dropdown';
  menu.className = 'lora-picker-dropdown studio-card-menu-dropdown';

  const actions = [];
  if (!item.locked) {
    if (item.loraStatus === 'ready') {
      actions.push(`<div class="lora-picker-item" data-action="tune">🎛 Tune &amp; Preview</div>`);
      actions.push(`<div class="lora-picker-item" data-action="lock">🔒 Lock</div>`);
      actions.push(`<div class="lora-picker-item" data-action="retrain">↺ Retrain</div>`);
    } else if (item.loraStatus === 'error') {
      actions.push(`<div class="lora-picker-item" data-action="retrain">↺ Retrain</div>`);
    }
    actions.push(`<div class="lora-picker-item studio-menu-danger" data-action="delete">Delete</div>`);
  } else {
    actions.push(`<div class="lora-picker-item" data-action="tune">🎛 View &amp; Unlock</div>`);
    actions.push(`<div class="lora-picker-item" data-action="unlock">🔓 Unlock</div>`);
    actions.push(`<div class="lora-picker-item" data-action="retrain">↺ Retrain</div>`);
  }

  // Previous versions (archived)
  const archived = item.archivedVersions || [];
  if (archived.length > 0) {
    actions.push(`<div class="lora-picker-separator"></div>`);
    actions.push(`<div class="lora-picker-section-label">Previous versions</div>`);
    archived.forEach((a, idx) => {
      const d = a.archivedAt ? new Date(a.archivedAt).toLocaleDateString() : `v${idx + 1}`;
      actions.push(`<div class="lora-picker-item" data-action="restore" data-archive-idx="${idx}">↩ Restore ${d}</div>`);
    });
  }

  menu.innerHTML = actions.join('');

  anchorBtn.style.position = 'relative';
  anchorBtn.parentElement.style.position = 'relative';
  anchorBtn.parentElement.appendChild(menu);

  menu.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      menu.remove();
      const action = el.dataset.action;
      const current = getItemById(itemId);
      if (!current) return;
      if (action === 'tune') {
        _openTuningPanel(itemId);
      } else if (action === 'delete') {
        if (confirm(`Delete "${current.name}"? This cannot be undone.`)) {
          deleteItem(itemId);
          _renderStudioCards();
          renderAssetsSection();
          updateLaunchImageButton();
        }
      } else if (action === 'lock') {
        _lockItem(itemId);
      } else if (action === 'retrain') {
        _retrainItem(itemId);
      } else if (action === 'unlock') {
        _unlockItem(itemId);
      } else if (action === 'restore') {
        _restoreArchivedVersion(itemId, parseInt(el.dataset.archiveIdx, 10));
      }
    });
  });

  setTimeout(() => {
    document.addEventListener('click', function close() {
      menu.remove();
      document.removeEventListener('click', close);
    });
  }, 0);
}

// ── Topbar training indicator ─────────────────────────────────────
function _renderTopbarTrainingIndicator() {
  const pill = document.getElementById('topbar-training-pill');
  if (!pill) return;
  const training = getItems().filter(i => i.loraStatus === 'training');
  if (training.length === 0) {
    pill.classList.add('hidden');
    return;
  }
  pill.classList.remove('hidden');
  const first = training[0];
  const label = pill.querySelector('.topbar-training-label');
  const fill  = pill.querySelector('.topbar-training-fill');
  if (label) label.textContent = `${first.name || 'LoRA'} — ${first.progressPct || 0}%`;
  if (fill)  fill.style.width  = `${first.progressPct || 0}%`;
  if (training.length > 1) {
    const extra = pill.querySelector('.topbar-training-label');
    if (extra) extra.textContent += ` (+${training.length - 1} more)`;
  }
}

// ── Studio key inputs ─────────────────────────────────────────────
function initStudioKeyInput() {
  // fal.ai key
  const falInput = document.getElementById('studio-fal-key-input');
  const falSaveBtn = document.getElementById('btn-studio-save-key');
  const falStatus  = document.getElementById('studio-key-status');
  if (falInput) falInput.value = getFalKey();
  if (falSaveBtn && !falSaveBtn._studioWired) {
    falSaveBtn._studioWired = true;
    falSaveBtn.addEventListener('click', () => {
      saveFalKey(falInput?.value || '');
      if (falStatus) { falStatus.textContent = '✅ Saved'; setTimeout(() => { falStatus.textContent = ''; }, 2000); }
    });
  }
  // Replicate key (same input ID as before, wired by initReplicateKeyInput)
  initReplicateKeyInput();
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

  // V2 character items (talking-head, scene-real, scene-ai)
  const v2Items = getItems().filter(i =>
    ['talking-head', 'scene-real', 'scene-ai'].includes(i.type)
  );
  // Legacy characters
  const legacyChars = getCharacters();

  const hasAny = v2Items.length > 0 || legacyChars.length > 0;
  if (!hasAny && !allowNone) {
    _showToast('No characters in Library. Train one in LoRA Studio first.');
    return;
  }

  const items = [];

  if (allowNone) {
    items.push(`<div class="lora-picker-item" data-pick-char=""><span class="text-muted">— None</span></div>`);
  }

  // Helper to build a status badge
  function _statusBadge(s) {
    if (s === 'ready')      return '✅ Ready';
    if (s === 'training')   return '⏳ Training';
    if (s === 'generating') return '⏳ Generating';
    return '○ Idle';
  }

  // V2 talking-head items
  const thItems = v2Items.filter(i => i.type === 'talking-head');
  if (thItems.length > 0) {
    items.push(`<div class="lora-picker-section-label">Talking Head</div>`);
    thItems.forEach(i => {
      const compatPills = (i.compatibleWith || []).map(c =>
        `<span class="assets-compat-pill">${c}</span>`).join('');
      items.push(`<div class="lora-picker-item" data-pick-char="${i.id}">
        <span>${i.name || 'Talking Head'}</span>
        <span class="step4-lora-badge step4-lora-badge--${i.loraStatus}">${_statusBadge(i.loraStatus)}</span>
        ${compatPills}
      </div>`);
    });
  }

  // V2 scene items (scene-real + scene-ai)
  const sceneItems = v2Items.filter(i => i.type === 'scene-real' || i.type === 'scene-ai');
  if (sceneItems.length > 0) {
    items.push(`<div class="lora-picker-section-label">Scene Characters</div>`);
    sceneItems.forEach(i => {
      const typeLabel = i.type === 'scene-ai' ? 'AI' : 'Real';
      const compatPills = (i.compatibleWith || []).map(c =>
        `<span class="assets-compat-pill">${c}</span>`).join('');
      items.push(`<div class="lora-picker-item" data-pick-char="${i.id}">
        <span>${i.name || 'Scene Character'}</span>
        <span class="step4-lora-badge step4-lora-badge--${i.loraStatus}" style="margin-right:4px">${_statusBadge(i.loraStatus)}</span>
        <span style="font-size:9px;color:var(--text-muted);margin-right:4px">${typeLabel}</span>
        ${compatPills}
      </div>`);
    });
  }

  // Legacy characters (if any)
  if (legacyChars.length > 0) {
    if (items.length > (allowNone ? 1 : 0)) {
      items.push(`<div class="lora-picker-separator"></div>`);
      items.push(`<div class="lora-picker-section-label">Legacy Characters</div>`);
    }
    legacyChars.forEach(c => {
      items.push(`<div class="lora-picker-item" data-pick-char="${c.id}">
        <span>${c.name || 'Character'}</span>
        <span class="step4-lora-badge step4-lora-badge--${c.loraStatus}">
          ${_statusBadge(c.loraStatus)}
        </span>
      </div>`);
    });
  }

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

// ── V2 / legacy char resolver ─────────────────────────────────────
// Tries V2 items first (getItemById), falls back to legacy getCharacterById.
// Returns a normalized object or null.
function _resolveLibChar(libId) {
  if (!libId) return null;
  const v2 = getItemById(libId);
  if (v2) return v2;                          // already has all fields
  const leg = getCharacterById(libId);
  if (!leg) return null;
  // Wrap legacy character in V2-compatible shape
  return {
    id:               leg.id,
    name:             leg.name,
    type:             'talking-head',
    loraStatus:       leg.loraStatus,
    loraUrl:          leg.loraUrl,
    triggerWord:      leg.triggerWord,
    inferenceEndpoint:'fal-ai/flux-lora',
    compatibleWith:   ['talking-head'],
  };
}

function _assetsGenBadge(libCharId) {
  if (!libCharId) return '<span class="assets-badge assets-badge--none">○ Gemini + face swap</span>';
  const c = _resolveLibChar(libCharId);
  if (!c) return '<span class="assets-badge assets-badge--none">○ Unassigned</span>';
  const inferLabel = c.inferenceEndpoint === 'fal-ai/qwen-image' ? 'Qwen' : 'FLUX';
  if (c.loraStatus === 'ready')    return `<span class="assets-badge assets-badge--lora">● LoRA → ${inferLabel}</span>`;
  if (c.loraStatus === 'training') return '<span class="assets-badge assets-badge--training">⏳ Training…</span>';
  if (c.loraStatus === 'generating') return '<span class="assets-badge assets-badge--training">⏳ Generating…</span>';
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
  const cs = window.createJobState || {};
  // Determine video context for compat warnings
  const videoIsTalkingHead = cs.narrator?.onScreenStyle === 'talking-head'
    || (storyChars.length > 0 && cs.videoType !== 'brand');

  list.innerHTML = storyChars.map(sc => {
    const libId   = a.characters?.[sc.id] || '';
    const libChar = libId ? _resolveLibChar(libId) : null;

    // Compat warning: talking-head LoRA assigned to a scene context
    let warnHtml = '';
    if (libChar?.loraStatus === 'ready' && libChar.type === 'talking-head' && !videoIsTalkingHead) {
      warnHtml = `<div class="assets-compat-warn">⚠ Talking Head LoRA in scene video — consider a Scene Character LoRA</div>`;
    }

    return `
      <div class="assets-row" data-story-char-id="${sc.id}">
        <span class="assets-story-name">${sc.name}</span>
        <div class="assets-assign-wrap" style="position:relative;">
          <button class="btn-xs assets-assign-btn" data-assign-char="${sc.id}">
            ${libChar ? libChar.name : 'Assign from Library ▼'}
          </button>
        </div>
        <div class="assets-badge-wrap">${_assetsGenBadge(libId)}</div>
      </div>
      ${warnHtml}`;
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

  // Products — check V2 items first, then legacy products
  const productIds = a.products?.length ? a.products : getSelectedProductIds();
  const products = getProducts();
  const productBlocking = productIds.some(id => {
    // V2 product item
    const v2 = getItemById(id);
    if (v2) return v2.loraStatus !== 'ready';
    // Legacy product
    const p = products.find(pr => pr.id === id);
    return p && p.loraStatus !== 'ready';
  });

  // Characters — use _resolveLibChar to handle both V2 and legacy
  const charBlocking = Object.values(a.characters || {}).some(libId => {
    if (!libId) return false;
    const c = _resolveLibChar(libId);
    return c && c.loraStatus !== 'ready';
  });

  // Narrator
  const narratorBlocking = a.narrator
    ? (() => { const c = _resolveLibChar(a.narrator); return c && c.loraStatus !== 'ready'; })()
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
        const v2 = getItemById(id);
        if (v2 && v2.loraStatus !== 'ready') { pending.push(v2.name || 'Product'); return; }
        const p = products.find(pr => pr.id === id);
        if (p && p.loraStatus !== 'ready') pending.push(p.name || 'Product');
      });
      Object.values(a.characters || {}).forEach(libId => {
        if (!libId) return;
        const c = _resolveLibChar(libId);
        if (c && c.loraStatus !== 'ready') pending.push(c.name || 'Character');
      });
      if (a.narrator) {
        const c = _resolveLibChar(a.narrator);
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

// ── V1 → V2 migration ────────────────────────────────────────────
// Runs once on first load with this code. Reads v1 localStorage, writes v2.
// Old keys are NOT deleted — kept as read-only fallback until a future cleanup phase.
function _migrateV1ToV2() {
  if (localStorage.getItem(MIGRATED_KEY) === 'true') return;

  const newItems = [];

  // 1. Migrate products
  let oldProducts = [];
  try { oldProducts = JSON.parse(localStorage.getItem(PRODUCTS_KEY) || '[]'); } catch {}
  for (const p of oldProducts) {
    const t = _defaultTuning();
    newItems.push({
      id: p.id,
      type: 'product',
      name: p.name || '',
      description: '',
      trainerType: 'flux-fast',
      trainerEndpoint: 'fal-ai/flux-lora-fast-training',
      inferenceEndpoint: 'fal-ai/flux-lora',
      photoCount: p.photoCount || 0,
      trainImageCount: p.photoCount || 0,
      loraStatus: p.loraStatus || 'idle',
      loraUrl: p.loraUrl || null,
      configUrl: null,
      triggerWord: p.triggerWord || '',
      trainSteps: 1000,
      trainStarted: p.trainStarted || null,
      trainCompleted: p.trainCompleted || null,
      falRequestId: p.falRequestId || null,
      loraError: p.loraError || null,
      tuningParams: t,
      locked: false,
      compatibleWith: ['product'],
      outfitLabels: [],
      aiReferenceDesc: '',
      archivedVersions: [],
      previewPrompts: [],
      previewGenerated: !!p.loraUrl,
      progressPhase: null,
      progressPct: 0,
      voiceProfile: null,
    });
  }

  // 2. Migrate characters
  let oldChars = [];
  try { oldChars = JSON.parse(localStorage.getItem(CHARACTERS_KEY) || '[]'); } catch {}
  for (const c of oldChars) {
    const t = _defaultTuning();
    newItems.push({
      id: c.id,
      type: 'talking-head',
      name: c.name || '',
      description: c.description || '',
      trainerType: 'flux-fast',
      trainerEndpoint: 'fal-ai/flux-lora-fast-training',
      inferenceEndpoint: 'fal-ai/flux-lora',
      photoCount: c.photoCount || 0,
      trainImageCount: c.photoCount || 0,
      loraStatus: c.loraStatus || 'idle',
      loraUrl: c.loraUrl || null,
      configUrl: null,
      triggerWord: c.triggerWord || '',
      trainSteps: 1000,
      trainStarted: c.trainStarted || null,
      trainCompleted: c.trainCompleted || null,
      falRequestId: c.falRequestId || null,
      loraError: c.loraError || null,
      tuningParams: t,
      locked: false,
      compatibleWith: ['talking-head'],
      outfitLabels: [],
      aiReferenceDesc: '',
      archivedVersions: [],
      previewPrompts: [],
      previewGenerated: !!c.loraUrl,
      progressPhase: null,
      progressPct: 0,
      voiceProfile: null,
    });
  }

  // 3. Write v2 items
  saveItems(newItems);
  console.log(`[LoraStudio] Migrated ${oldProducts.length} products + ${oldChars.length} characters to v2.`);

  // 4. Remap IDB keys async (copy old keys to new pattern, leave old intact)
  _remapIdbKeys(oldProducts, oldChars)
    .then(() => {
      localStorage.setItem(MIGRATED_KEY, 'true');
      console.log('[LoraStudio] V2 migration complete (IDB keys remapped).');
    })
    .catch(e => {
      // Metadata is migrated even if IDB remap fails; photos remain on old keys
      localStorage.setItem(MIGRATED_KEY, 'true');
      console.warn('[LoraStudio] V2 migration: IDB remap failed, photos on old keys:', e.message);
    });
}

async function _remapIdbKeys(oldProducts, oldChars) {
  for (const p of oldProducts) {
    for (let i = 0; i < (p.photoCount || 0); i++) {
      const data = await _idbGet(`lora_${p.id}_photo_${i}`);
      if (data) await _idbSet(`lora_v2_${p.id}_photo_${i}`, data);
    }
    const preview = await _idbGet(`lora_${p.id}_preview`);
    if (preview) await _idbSet(`lora_v2_${p.id}_preview_0`, preview);
  }
  for (const c of oldChars) {
    for (let i = 0; i < (c.photoCount || 0); i++) {
      const data = await _idbGet(`lora_char_${c.id}_photo_${i}`);
      if (data) await _idbSet(`lora_v2_${c.id}_photo_${i}`, data);
    }
    const preview = await _idbGet(`lora_char_${c.id}_preview`);
    if (preview) await _idbSet(`lora_v2_${c.id}_preview_0`, preview);
  }
}

// ════════════════════════════════════════════════════
//  PHASE 3 — Path Selection + Input Modals
// ════════════════════════════════════════════════════

// ID of the item currently being configured in the input modal
let _currentInputItemId = null;
// Per-path upload quality state: { [slotKey]: { ok, label } }
let _inputQualityState = {};
// Phase 5: review modal reject state { 'lora_v2_{id}_train_{idx}': true }
let _reviewRejected = {};

// ── Shared utilities ──────────────────────────────────────────────
function _readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function _runQualityCheck(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const minDim = Math.min(img.naturalWidth, img.naturalHeight);
      if      (minDim < 256) resolve({ ok: false, label: 'Too small' });
      else if (minDim < 512) resolve({ ok: false, label: 'Low res' });
      else                   resolve({ ok: true,  label: '✓' });
    };
    img.onerror = () => resolve({ ok: false, label: 'Load error' });
    img.src = dataUrl;
  });
}

// ── Path modal ────────────────────────────────────────────────────
function _openPathModal() {
  const m = document.getElementById('lora-path-modal');
  if (m) m.classList.remove('hidden');
}
function _closePathModal() {
  const m = document.getElementById('lora-path-modal');
  if (m) m.classList.add('hidden');
}

// ── Input modal open ──────────────────────────────────────────────
async function _openInputModal(path) {
  _closePathModal();

  // Trainer config per path
  const TRAINER_CFG = {
    product:        { trainerType: 'flux-fast',     trainerEndpoint: 'fal-ai/flux-lora-fast-training',     inferenceEndpoint: 'fal-ai/flux-lora',  compatibleWith: ['product'],      trainSteps: 1500 },
    'talking-head': { trainerType: 'flux-portrait', trainerEndpoint: 'fal-ai/flux-lora-portrait-trainer',  inferenceEndpoint: 'fal-ai/flux-lora',  compatibleWith: ['talking-head'], trainSteps: 2000 },
    'scene-real':   { trainerType: 'flux-portrait', trainerEndpoint: 'fal-ai/flux-lora-portrait-trainer',  inferenceEndpoint: 'fal-ai/flux-lora',  compatibleWith: ['scene'],        trainSteps: 2000 },
    'scene-ai':     { trainerType: 'qwen',          trainerEndpoint: 'fal-ai/qwen-image-trainer',          inferenceEndpoint: 'fal-ai/qwen-image', compatibleWith: ['scene'],        trainSteps: 2000 },
  };
  const c = TRAINER_CFG[path] || TRAINER_CFG.product;
  const id = 'lora_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  saveItem({
    id, type: path, name: '', description: '',
    trainerType: c.trainerType, trainerEndpoint: c.trainerEndpoint,
    inferenceEndpoint: c.inferenceEndpoint,
    photoCount: 0, trainImageCount: 0,
    loraStatus: 'idle', loraUrl: null, configUrl: null,
    triggerWord: '', trainSteps: c.trainSteps,
    trainStarted: null, trainCompleted: null, falRequestId: null, loraError: null,
    tuningParams: _defaultTuning(), locked: false,
    compatibleWith: c.compatibleWith,
    outfitLabels: path === 'scene-real' ? ['', '', ''] : [],
    aiReferenceDesc: '', archivedVersions: [],
    previewPrompts: [], previewGenerated: false,
    progressPhase: null, progressPct: 0, voiceProfile: null,
  });

  _currentInputItemId = id;
  _inputQualityState = {};

  // Modal header
  const TYPE_INFO = {
    product:        { badge: '📦 Product',     title: 'Product LoRA' },
    'talking-head': { badge: '🗣 Talking Head', title: 'Character: Talking Head' },
    'scene-real':   { badge: '🎬 Scene (Real)', title: 'Scene Character: Real Photos' },
    'scene-ai':     { badge: '✨ Scene (AI)',   title: 'Scene Character: AI-Generated' },
  };
  const info = TYPE_INFO[path] || TYPE_INFO.product;
  const badge     = document.getElementById('lora-input-badge');
  const titleEl   = document.getElementById('lora-input-title');
  const nameInput = document.getElementById('lora-input-name');
  if (badge)     { badge.textContent = info.badge; badge.className = `studio-card-badge studio-card-badge--${path}`; }
  if (titleEl)   titleEl.textContent = info.title;
  if (nameInput) nameInput.value = '';

  // Path-specific upload area
  const uploadArea = document.getElementById('lora-upload-area');
  if (uploadArea) {
    if      (path === 'product')        _renderPathA(id, uploadArea);
    else if (path === 'talking-head')   _renderPathB(id, uploadArea);
    else if (path === 'scene-real')     _renderPathC1(id, uploadArea);
    else if (path === 'scene-ai')       _renderPathC2(id, uploadArea);
  }

  // Voice section (characters only)
  const voiceSection = document.getElementById('lora-voice-section');
  if (voiceSection) {
    if (path !== 'product') _renderVoiceSection(id, voiceSection);
    else voiceSection.innerHTML = '';
  }

  // Action button
  _renderInputActions(id, path);

  document.getElementById('lora-input-modal')?.classList.remove('hidden');

  // Wire name input (idempotent guard)
  if (nameInput && !nameInput._wiredInput) {
    nameInput._wiredInput = true;
    nameInput.addEventListener('input', () => {
      if (!_currentInputItemId) return;
      const cur = getItemById(_currentInputItemId);
      if (cur) saveItem({ ...cur, name: nameInput.value });
      _validateInputModal();
    });
  }
}

// ── Input modal close ─────────────────────────────────────────────
function _closeInputModal(discard = false) {
  document.getElementById('lora-input-modal')?.classList.add('hidden');
  if (discard && _currentInputItemId) {
    const item = getItemById(_currentInputItemId);
    // Delete if item is still empty (never named, never trained)
    if (item && item.loraStatus === 'idle' && !item.loraUrl && !(item.name || '').trim() && item.photoCount === 0) {
      deleteItem(_currentInputItemId);
    }
  }
  _currentInputItemId = null;
  _inputQualityState = {};
  _renderStudioCards();
}

// ── Path A: Product photos ────────────────────────────────────────
function _renderPathA(itemId, container) {
  container.innerHTML = `
    <div class="lora-input-field">
      <div class="lora-field-label">Photos</div>
      <p class="input-quality-note">Upload 5–15 photos. Different angles, backgrounds, lighting. Avoid heavy filters or collages.</p>
    </div>
    <div id="product-photo-grid" class="product-photo-grid"></div>
    <div class="product-upload-row">
      <span id="product-photo-count" class="text-xs text-muted">0 / 15 photos</span>
      <label class="lora-upload-btn">
        + Upload Photos
        <input type="file" id="product-file-input" accept="image/*" multiple hidden>
      </label>
    </div>`;

  container.querySelector('#product-file-input')?.addEventListener('change', async e => {
    await _handleProductPhotos(itemId, Array.from(e.target.files));
    e.target.value = '';
  });
}

async function _handleProductPhotos(itemId, files) {
  const item = getItemById(itemId);
  if (!item) return;
  let count = item.photoCount || 0;
  for (const file of files) {
    if (count >= 15) break;
    const dataUrl = await _readFileAsDataUrl(file);
    const qc = await _runQualityCheck(dataUrl);
    _inputQualityState[`photo_${count}`] = qc;
    await _idbSet(`lora_v2_${itemId}_photo_${count}`, dataUrl);
    count++;
  }
  saveItem({ ...getItemById(itemId), photoCount: count });
  await _refreshProductPhotoGrid(itemId);
  _validateInputModal();
}

async function _refreshProductPhotoGrid(itemId) {
  const grid     = document.getElementById('product-photo-grid');
  const countEl  = document.getElementById('product-photo-count');
  const item = getItemById(itemId);
  if (!item || !grid) return;
  const count = item.photoCount || 0;
  const thumbs = [];
  for (let i = 0; i < count; i++) {
    const url = await _idbGet(`lora_v2_${itemId}_photo_${i}`).catch(() => null);
    const qc  = _inputQualityState[`photo_${i}`] || { ok: true };
    const badgeHtml = qc.ok
      ? `<span class="lora-qc-badge lora-qc-pass">✓</span>`
      : `<span class="lora-qc-badge lora-qc-fail">${qc.label}</span>`;
    thumbs.push(`
      <div class="product-photo-thumb" data-idx="${i}">
        ${url ? `<img src="${url}" class="product-thumb-img" alt="">` : ''}
        ${badgeHtml}
        <button class="product-thumb-remove" data-remove="${i}" title="Remove">✕</button>
      </div>`);
  }
  grid.innerHTML = thumbs.join('');
  grid.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await _removeProductPhoto(itemId, parseInt(btn.dataset.remove));
    });
  });
  if (countEl) countEl.textContent = `${count} / 15 photos`;
}

async function _removeProductPhoto(itemId, removeIdx) {
  const item = getItemById(itemId);
  if (!item) return;
  const count = item.photoCount || 0;
  for (let i = removeIdx; i < count - 1; i++) {
    const next = await _idbGet(`lora_v2_${itemId}_photo_${i + 1}`).catch(() => null);
    if (next) await _idbSet(`lora_v2_${itemId}_photo_${i}`, next);
    else await _idbDel(`lora_v2_${itemId}_photo_${i}`).catch(() => {});
    _inputQualityState[`photo_${i}`] = _inputQualityState[`photo_${i + 1}`];
  }
  await _idbDel(`lora_v2_${itemId}_photo_${count - 1}`).catch(() => {});
  delete _inputQualityState[`photo_${count - 1}`];
  saveItem({ ...getItemById(itemId), photoCount: count - 1 });
  await _refreshProductPhotoGrid(itemId);
  _validateInputModal();
}

// ── Path B: Talking Head guided slots ─────────────────────────────
const TALKING_HEAD_SLOTS = [
  { label: 'Front face',          refImg: 'assets/lora-refs/front_face.jpg',    required: true,  hint: '' },
  { label: 'Left profile',        refImg: 'assets/lora-refs/left_profile.jpg',  required: true,  hint: '' },
  { label: 'Right profile',       refImg: 'assets/lora-refs/right_profile.jpg', required: true,  hint: '' },
  { label: 'Top half (waist-up)', refImg: 'assets/lora-refs/waist_up.jpg',      required: true,  hint: '' },
  { label: 'Full body',           refImg: 'assets/lora-refs/full_body.jpg',      required: false, hint: 'If skipped, lower body will be AI-generated.' },
];

function _renderPathB(itemId, container) {
  const slotsHtml = TALKING_HEAD_SLOTS.map((slot, i) => `
    <div class="guided-slot">
      <div class="guided-ref-col">
        <img src="${slot.refImg}" class="guided-ref-thumb" alt="${slot.label}">
        <span class="text-2xs text-muted" style="margin-top:3px">${slot.label}</span>
      </div>
      <label class="guided-upload-area" id="guided-upload-${i}">
        <div class="guided-upload-empty">
          <span style="font-size:20px;color:var(--text-muted)">+</span>
          <span class="text-2xs text-muted">Upload</span>
        </div>
        <input type="file" accept="image/*" data-slot-input="${i}" hidden>
      </label>
      <div class="guided-slot-info">
        <div class="text-xs" style="font-weight:500">${slot.label}${slot.required ? '' : ' <span class="text-muted">(optional)</span>'}</div>
        <div id="guided-qc-${i}" class="guided-qc"></div>
        ${slot.hint ? `<div class="text-2xs text-muted" style="margin-top:3px">${slot.hint}</div>` : ''}
      </div>
    </div>`).join('');

  container.innerHTML = `
    <div class="input-quality-note" style="margin-bottom:12px">
      Upload 4 mandatory + 1 optional photo. Quality of videos depends on photo quality.
    </div>
    <div class="guided-slots-list">${slotsHtml}</div>
    <div id="guided-slot-count" class="text-xs text-muted" style="margin:10px 0;text-align:center">0 of 5 slots filled</div>`;

  container.querySelectorAll('[data-slot-input]').forEach(input => {
    input.addEventListener('change', async e => {
      const slotIdx = parseInt(input.dataset.slotInput);
      const file = e.target.files[0];
      if (file) await _handleGuidedSlot(itemId, slotIdx, file);
      e.target.value = '';
    });
  });
}

async function _handleGuidedSlot(itemId, slotIdx, file) {
  const dataUrl = await _readFileAsDataUrl(file);
  const qc      = await _runQualityCheck(dataUrl);
  _inputQualityState[`slot_${slotIdx}`] = qc;
  await _idbSet(`lora_v2_${itemId}_photo_${slotIdx}`, dataUrl);
  const item = getItemById(itemId);
  if (item) saveItem({ ...item, photoCount: Math.max(item.photoCount || 0, slotIdx + 1) });
  await _refreshGuidedSlot(itemId, slotIdx);
  await _updateSlotCountDisplay(itemId, 5, 'guided-slot-count');
  _validateInputModal();
}

async function _refreshGuidedSlot(itemId, slotIdx) {
  const area  = document.getElementById(`guided-upload-${slotIdx}`);
  const qcEl  = document.getElementById(`guided-qc-${slotIdx}`);
  if (!area) return;
  const dataUrl = await _idbGet(`lora_v2_${itemId}_photo_${slotIdx}`).catch(() => null);
  const qc      = _inputQualityState[`slot_${slotIdx}`];
  if (dataUrl) {
    area.innerHTML = `
      <div class="guided-upload-filled">
        <img src="${dataUrl}" class="guided-slot-img" alt="">
        <button class="guided-slot-replace" title="Replace">↻</button>
      </div>
      <input type="file" accept="image/*" data-slot-input="${slotIdx}" hidden>`;
    area.querySelector('.guided-slot-replace')?.addEventListener('click', e => {
      e.preventDefault(); area.querySelector('input[type=file]').click();
    });
    area.querySelector('input[type=file]')?.addEventListener('change', async evt => {
      const f = evt.target.files[0];
      if (f) await _handleGuidedSlot(itemId, slotIdx, f);
      evt.target.value = '';
    });
  }
  if (qcEl) {
    if (!qc)        qcEl.innerHTML = '';
    else if (qc.ok) qcEl.innerHTML = `<span class="guided-qc-pass">✓ OK</span>`;
    else            qcEl.innerHTML = `<span class="guided-qc-fail">✗ ${qc.label}</span>`;
  }
}

async function _updateSlotCountDisplay(itemId, total, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  let filled = 0;
  for (let i = 0; i < total; i++) {
    const d = await _idbGet(`lora_v2_${itemId}_photo_${i}`).catch(() => null);
    if (d) filled++;
  }
  el.textContent = `${filled} of ${total} slots filled`;
}

// ── Path C1: Scene Real (3 outfits × 6 slots) ─────────────────────
const C1_SLOT_LABELS = ['Front', 'Left profile', 'Right profile', '3/4 angle', 'Top half', 'Full body'];
const C1_SLOT_REFS   = [
  'assets/lora-refs/front_face.jpg',
  'assets/lora-refs/left_profile.jpg',
  'assets/lora-refs/right_profile.jpg',
  'assets/lora-refs/three_quarter.jpg',
  'assets/lora-refs/waist_up.jpg',
  'assets/lora-refs/full_body.jpg',
];

function _renderPathC1(itemId, container) {
  const outfitHtml = [0, 1, 2].map(oi => {
    const slots = C1_SLOT_LABELS.map((lbl, si) => `
      <div class="outfit-slot-item">
        <div class="outfit-slot-ref">${lbl}</div>
        <label class="outfit-slot-upload outfit-slot-empty" id="outfit-slot-${oi}-${si}"
               style="background-image:url('${C1_SLOT_REFS[si]}')">
          <span class="outfit-slot-ref-overlay"></span>
          <span style="font-size:16px;color:var(--text-muted);position:relative;z-index:1">+</span>
          <input type="file" accept="image/*" data-outfit-file="${oi}-${si}" hidden>
        </label>
      </div>`).join('');
    return `
      <div class="outfit-group" id="outfit-group-${oi}">
        <div class="outfit-group-header">
          <span class="outfit-group-num">${oi + 1}</span>
          <input type="text" class="outfit-desc-input" data-outfit-desc="${oi}"
                 placeholder="Describe outfit ${oi + 1}…">
          <span class="outfit-group-status" id="outfit-status-${oi}">0/6</span>
        </div>
        <div class="outfit-group-body">
          <div class="outfit-slots-grid">${slots}</div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="input-quality-note outfit-warning">
      <strong>Important:</strong> Use 3 genuinely different outfits. Same outfit = outfit baked into identity.
    </div>
    ${outfitHtml}
    <div id="guided-slot-count" class="text-xs text-muted" style="margin:10px 0;text-align:center">0 / 18 photos uploaded</div>`;

  // Outfit desc inputs
  container.querySelectorAll('[data-outfit-desc]').forEach(input => {
    input.addEventListener('input', () => {
      const oi  = parseInt(input.dataset.outfitDesc);
      const cur = getItemById(itemId);
      if (!cur) return;
      const labels = [...(cur.outfitLabels || ['', '', ''])];
      labels[oi] = input.value;
      saveItem({ ...cur, outfitLabels: labels });
    });
  });

  // Slot file inputs
  container.querySelectorAll('[data-outfit-file]').forEach(input => {
    input.addEventListener('change', async e => {
      const [oi, si] = input.dataset.outfitFile.split('-').map(Number);
      const file = e.target.files[0];
      if (file) await _handleOutfitSlot(itemId, oi, si, file);
      e.target.value = '';
    });
  });
}

async function _handleOutfitSlot(itemId, oi, si, file) {
  const globalIdx = oi * 6 + si;
  const dataUrl   = await _readFileAsDataUrl(file);
  const qc        = await _runQualityCheck(dataUrl);
  _inputQualityState[`outfit_${oi}_${si}`] = qc;
  await _idbSet(`lora_v2_${itemId}_photo_${globalIdx}`, dataUrl);
  const item = getItemById(itemId);
  if (item) saveItem({ ...item, photoCount: Math.max(item.photoCount || 0, globalIdx + 1) });

  // Refresh slot UI
  const slotEl = document.getElementById(`outfit-slot-${oi}-${si}`);
  if (slotEl) {
    slotEl.className = 'outfit-slot-upload outfit-slot-filled';
    slotEl.innerHTML = `
      <img src="${dataUrl}" class="outfit-slot-img" alt="">
      <button class="outfit-slot-replace" title="Replace">↻</button>
      <input type="file" accept="image/*" data-outfit-file="${oi}-${si}" hidden>`;
    slotEl.querySelector('.outfit-slot-replace')?.addEventListener('click', e => {
      e.preventDefault(); slotEl.querySelector('input[type=file]').click();
    });
    slotEl.querySelector('input[type=file]')?.addEventListener('change', async evt => {
      const f = evt.target.files[0];
      if (f) await _handleOutfitSlot(itemId, oi, si, f);
      evt.target.value = '';
    });
  }
  await _updateOutfitStatus(itemId, oi);
  await _updateC1TotalCount(itemId);
  _validateInputModal();
}

async function _updateOutfitStatus(itemId, oi) {
  const el = document.getElementById(`outfit-status-${oi}`);
  if (!el) return;
  let filled = 0;
  for (let si = 0; si < 6; si++) {
    const d = await _idbGet(`lora_v2_${itemId}_photo_${oi * 6 + si}`).catch(() => null);
    if (d) filled++;
  }
  el.textContent   = `${filled}/6`;
  el.style.color   = filled === 6 ? 'var(--green)' : filled > 0 ? 'var(--amber)' : 'var(--text-muted)';
}

async function _updateC1TotalCount(itemId) {
  const el = document.getElementById('guided-slot-count');
  if (!el) return;
  let filled = 0;
  for (let i = 0; i < 18; i++) {
    const d = await _idbGet(`lora_v2_${itemId}_photo_${i}`).catch(() => null);
    if (d) filled++;
  }
  el.textContent = `${filled} / 18 photos uploaded`;
}

// ── Path C2: Scene AI (refs + description) ─────────────────────────
function _renderPathC2(itemId, container) {
  container.innerHTML = `
    <div class="lora-input-field">
      <div class="lora-field-label">Reference Images</div>
      <p class="input-quality-note">Upload 1–2 reference images (concept art, sketch, existing character).</p>
      <div class="ai-ref-row">
        <label class="ai-ref-slot ai-ref-empty" id="ai-ref-slot-0">
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
            <span style="font-size:22px;color:var(--text-muted)">+</span>
            <span class="text-2xs text-muted">Add image</span>
          </div>
          <input type="file" accept="image/*" data-ref-input="0" hidden>
        </label>
        <label class="ai-ref-slot ai-ref-empty" id="ai-ref-slot-1" style="opacity:0.5">
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
            <span style="font-size:22px;color:var(--text-muted)">+</span>
            <span class="text-2xs text-muted">Optional</span>
          </div>
          <input type="file" accept="image/*" data-ref-input="1" hidden>
        </label>
      </div>
    </div>
    <div class="lora-input-field">
      <div class="lora-field-label">Character Description</div>
      <textarea id="ai-char-desc" class="lora-desc-textarea" rows="4"
                placeholder="e.g. 30-year-old woman, curly red hair, green eyes, freckles. Athletic build. Cyberpunk street fashion with neon accents…"></textarea>
    </div>
    <div class="input-quality-note" style="margin-top:4px">
      AI generates 18 training images across 3 outfits and 6 poses. You will review before training.
    </div>`;

  container.querySelectorAll('[data-ref-input]').forEach(input => {
    input.addEventListener('change', async e => {
      const refIdx = parseInt(input.dataset.refInput);
      const file   = e.target.files[0];
      if (file) await _handleAiRef(itemId, refIdx, file, container);
      e.target.value = '';
    });
  });

  container.querySelector('#ai-char-desc')?.addEventListener('input', e => {
    const cur = getItemById(itemId);
    if (cur) saveItem({ ...cur, aiReferenceDesc: e.target.value, description: e.target.value });
    _validateInputModal();
  });
}

async function _handleAiRef(itemId, refIdx, file, container) {
  const dataUrl = await _readFileAsDataUrl(file);
  await _idbSet(`lora_v2_${itemId}_ref_${refIdx}`, dataUrl);
  _inputQualityState[`ref_${refIdx}_exists`] = { ok: true };

  const slotEl = document.getElementById(`ai-ref-slot-${refIdx}`);
  if (slotEl) {
    slotEl.className = 'ai-ref-slot ai-ref-filled';
    slotEl.style.opacity = '';
    slotEl.innerHTML = `
      <img src="${dataUrl}" class="ai-ref-img" alt="">
      <button class="ai-ref-remove" title="Remove">✕</button>
      <input type="file" accept="image/*" data-ref-input="${refIdx}" hidden>`;
    slotEl.querySelector('.ai-ref-remove')?.addEventListener('click', async e => {
      e.preventDefault();
      await _idbDel(`lora_v2_${itemId}_ref_${refIdx}`).catch(() => {});
      delete _inputQualityState[`ref_${refIdx}_exists`];
      _renderPathC2(itemId, container);
      _validateInputModal();
    });
    slotEl.querySelector('input[type=file]')?.addEventListener('change', async evt => {
      const f = evt.target.files[0];
      if (f) await _handleAiRef(itemId, refIdx, f, container);
      evt.target.value = '';
    });
    // Unlock slot 1 when slot 0 filled
    if (refIdx === 0) {
      const slot1 = document.getElementById('ai-ref-slot-1');
      if (slot1) slot1.style.opacity = '';
    }
  }
  _validateInputModal();
}

// ══════════════════════════════════════════════════════════════════
//  Phase 11 — Voice Integration
// ══════════════════════════════════════════════════════════════════

// ── ElevenLabs key helper (key stored by 17a-create-api.js) ──────
function _getElKey() {
  return localStorage.getItem('stori_elevenlabs_key') || '';
}

// ── HTML escape (local helper) ────────────────────────────────────
function _hesc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══ Voice Clone Modal ═════════════════════════════════════════════

let _vcItemId      = null;   // itemId being cloned for
let _vcBlob        = null;   // audio blob (File or Blob)
let _vcDurSec      = 0;
let _vcRecorder    = null;
let _vcRecChunks   = [];
let _vcRecSeconds  = 0;
let _vcRecTimer    = null;

function _openVoiceCloneModal(itemId) {
  _vcItemId = itemId;
  _vcBlob   = null;
  _vcDurSec = 0;
  const modal = document.getElementById('lora-voice-clone-modal');
  if (!modal) return;
  // Reset UI
  _vcSwitchTab('upload');
  document.getElementById('voice-upload-drop').style.display  = '';
  document.getElementById('voice-upload-preview').style.display = 'none';
  const nameIn = document.getElementById('voice-name-input');
  if (nameIn) nameIn.value = getItemById(itemId)?.name || '';
  const consent = document.getElementById('voice-consent-check');
  if (consent) consent.checked = false;
  const status = document.getElementById('voice-clone-status');
  if (status) status.textContent = '';
  _vcValidate();
  modal.classList.remove('hidden');
  _vcWire();
}

function _closeVoiceCloneModal() {
  document.getElementById('lora-voice-clone-modal')?.classList.add('hidden');
  clearInterval(_vcRecTimer);
  if (_vcRecorder && _vcRecorder.state !== 'inactive') {
    try { _vcRecorder.stop(); } catch (_) {}
  }
}

function _vcSwitchTab(tab) {
  document.querySelectorAll('#lora-voice-clone-modal .voice-clone-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.voiceTab === tab));
  document.getElementById('voice-tab-upload')?.classList.toggle('hidden', tab !== 'upload');
  document.getElementById('voice-tab-record')?.classList.toggle('hidden', tab !== 'record');
}

function _vcValidate() {
  const btn     = document.getElementById('btn-voice-clone-submit');
  if (!btn) return;
  const hasAudio   = !!_vcBlob;
  const hasName    = (document.getElementById('voice-name-input')?.value || '').trim().length > 0;
  const hasConsent = !!document.getElementById('voice-consent-check')?.checked;
  btn.disabled = !(hasAudio && hasName && hasConsent);
}

function _vcWire() {
  const modal = document.getElementById('lora-voice-clone-modal');
  if (!modal || modal._vcWired) return;
  modal._vcWired = true;

  // Close
  document.getElementById('btn-voice-clone-close')?.addEventListener('click', _closeVoiceCloneModal);

  // Tab switch
  modal.querySelectorAll('.voice-clone-tab').forEach(tab =>
    tab.addEventListener('click', () => _vcSwitchTab(tab.dataset.voiceTab)));

  // Upload drop / browse
  const drop = document.getElementById('voice-upload-drop');
  const fileIn = document.getElementById('voice-upload-input');
  drop?.addEventListener('click', () => fileIn?.click());
  drop?.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('voice-upload-drop--hover'); });
  drop?.addEventListener('dragleave', () => drop.classList.remove('voice-upload-drop--hover'));
  drop?.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('voice-upload-drop--hover');
    const f = e.dataTransfer?.files?.[0];
    if (f) _vcHandleFile(f);
  });
  fileIn?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) _vcHandleFile(f);
    e.target.value = '';
  });

  // Clear file
  document.getElementById('btn-voice-clear')?.addEventListener('click', () => {
    _vcBlob = null; _vcDurSec = 0;
    document.getElementById('voice-upload-drop').style.display = '';
    document.getElementById('voice-upload-preview').style.display = 'none';
    _vcValidate();
  });

  // Name + consent → validate
  document.getElementById('voice-name-input')?.addEventListener('input', _vcValidate);
  document.getElementById('voice-consent-check')?.addEventListener('change', _vcValidate);

  // Clone submit
  document.getElementById('btn-voice-clone-submit')?.addEventListener('click', async () => {
    const key = _getElKey();
    const statusEl = document.getElementById('voice-clone-status');
    if (!key) {
      if (statusEl) statusEl.textContent = '⚠ ElevenLabs API key not set. Add it in Settings → Voice.';
      return;
    }
    const voiceName = (document.getElementById('voice-name-input')?.value || '').trim();
    await _vcClone(_vcItemId, _vcBlob, voiceName, _vcDurSec);
  });

  // Record
  document.getElementById('btn-voice-record-start')?.addEventListener('click', _vcStartRecord);
  document.getElementById('btn-voice-record-stop')?.addEventListener('click', _vcStopRecord);
}

async function _vcHandleFile(file) {
  _vcBlob = file;
  // Measure duration
  try {
    const buf = await file.arrayBuffer();
    const ac  = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await ac.decodeAudioData(buf);
    _vcDurSec = Math.round(decoded.duration);
    _vcDrawWaveform(decoded, 'voice-waveform');
    ac.close();
  } catch (_) { _vcDurSec = 0; }
  document.getElementById('voice-file-name').textContent = file.name;
  document.getElementById('voice-file-dur').textContent  = _vcDurSec > 0 ? ` · ${_vcDurSec}s` : '';
  document.getElementById('voice-upload-drop').style.display    = 'none';
  document.getElementById('voice-upload-preview').style.display = '';
  _vcValidate();
}

function _vcDrawWaveform(audioBuffer, canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const W = canvas.clientWidth || 400;
  const H = 56;
  canvas.width  = W;
  canvas.height = H;
  const ctx  = canvas.getContext('2d');
  const data = audioBuffer.getChannelData(0);
  const step = Math.ceil(data.length / W);
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#78dcff';   // Aurora accent (canvas can't use CSS vars)
  ctx.lineWidth   = 1;
  ctx.beginPath();
  for (let i = 0; i < W; i++) {
    let max = 0;
    for (let j = 0; j < step; j++) {
      const v = Math.abs(data[i * step + j] || 0);
      if (v > max) max = v;
    }
    const h = max * H * 0.8;
    ctx.moveTo(i + 0.5, H / 2 - h);
    ctx.lineTo(i + 0.5, H / 2 + h);
  }
  ctx.stroke();
}

async function _vcStartRecord() {
  const statusEl = document.getElementById('voice-record-status');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _vcRecChunks  = [];
    _vcRecSeconds = 0;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
    _vcRecorder = new MediaRecorder(stream, { mimeType });
    _vcRecorder.ondataavailable = e => { if (e.data.size > 0) _vcRecChunks.push(e.data); };
    _vcRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(_vcRecTimer);
      const blob = new Blob(_vcRecChunks, { type: mimeType });
      _vcBlob    = blob;
      _vcDurSec  = _vcRecSeconds;
      document.getElementById('btn-voice-record-start').style.display = '';
      document.getElementById('btn-voice-record-stop').style.display  = 'none';
      if (statusEl) statusEl.textContent = `✓ Recorded ${_vcDurSec}s. Ready to clone.`;
      _vcValidate();
    };
    _vcRecorder.start(250);
    document.getElementById('btn-voice-record-start').style.display = 'none';
    document.getElementById('btn-voice-record-stop').style.display  = '';
    if (statusEl) statusEl.textContent = '● Recording…';
    clearInterval(_vcRecTimer);
    _vcRecTimer = setInterval(() => {
      _vcRecSeconds++;
      const m = String(Math.floor(_vcRecSeconds / 60)).padStart(2, '0');
      const s = String(_vcRecSeconds % 60).padStart(2, '0');
      const el = document.getElementById('voice-record-timer');
      if (el) el.textContent = `${m}:${s}`;
    }, 1000);
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Microphone access denied.';
  }
}

function _vcStopRecord() {
  clearInterval(_vcRecTimer);
  if (_vcRecorder && _vcRecorder.state !== 'inactive') _vcRecorder.stop();
}

async function _vcClone(itemId, audioBlob, voiceName, durationSec) {
  const key      = _getElKey();
  const statusEl = document.getElementById('voice-clone-status');
  const btn      = document.getElementById('btn-voice-clone-submit');
  if (statusEl) statusEl.textContent = 'Cloning voice…';
  if (btn) btn.disabled = true;
  try {
    // Store audio sample in IDB
    const arrBuf = await audioBlob.arrayBuffer();
    await _idbSet(`lora_v2_${itemId}_voice_sample`, arrBuf);

    // POST to ElevenLabs IVC
    const form = new FormData();
    form.append('name', voiceName);
    form.append('description', `Cloned voice for Stori LoRA: ${voiceName}`);
    form.append('files', audioBlob, 'sample.webm');
    const resp = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': key },
      body: form,
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`ElevenLabs ${resp.status}: ${err.slice(0, 120)}`);
    }
    const { voice_id } = await resp.json();

    // Save voiceProfile on item
    const item = getItemById(itemId);
    if (item) {
      saveItem({ ...item, voiceProfile: {
        voiceName,
        elevenlabsVoiceId: voice_id,
        source: 'cloned',
        durationSec,
        language: 'en',
        clonedAt: new Date().toISOString(),
      }});
    }
    if (statusEl) statusEl.textContent = '✓ Voice cloned successfully!';
    setTimeout(() => {
      _closeVoiceCloneModal();
      _vcRefreshVoiceUI(itemId);
    }, 900);
  } catch (e) {
    if (statusEl) statusEl.textContent = `Error: ${e.message}`;
    if (btn) { btn.disabled = false; }
  }
}

function _vcRefreshVoiceUI(itemId) {
  const voiceSec = document.getElementById('lora-voice-section');
  if (voiceSec && _currentInputItemId === itemId) _renderVoiceSection(itemId, voiceSec);
  const tuningSec = document.getElementById('tuning-voice-section');
  if (tuningSec) _renderTuningVoice(itemId);
}

// ══ Voice Library Picker ══════════════════════════════════════════

let _vpItemId = null;
let _vpMode   = 'character';  // 'character' | 'narrator'

function _openVoicePicker(itemId, mode = 'character') {
  _vpItemId = itemId;
  _vpMode   = mode;
  const modal  = document.getElementById('lora-voice-picker-modal');
  const title  = document.getElementById('voice-picker-title');
  const search = document.getElementById('voice-picker-search');
  if (!modal) return;
  if (title)  title.textContent = mode === 'narrator' ? 'Pick Narrator Voice' : 'Pick a Voice';
  if (search) search.value = '';
  modal.classList.remove('hidden');
  _vpRenderList('');
  _vpWire();
}

function _closeVoicePicker() {
  document.getElementById('lora-voice-picker-modal')?.classList.add('hidden');
}

function _vpWire() {
  const modal = document.getElementById('lora-voice-picker-modal');
  if (!modal || modal._vpWired) return;
  modal._vpWired = true;

  document.getElementById('btn-voice-picker-close')?.addEventListener('click', _closeVoicePicker);

  document.getElementById('voice-picker-search')?.addEventListener('input', e =>
    _vpRenderList((e.target.value || '').trim().toLowerCase()));

  document.getElementById('voice-picker-list')?.addEventListener('click', e => {
    // Select
    const selBtn = e.target.closest('[data-voice-select]');
    if (selBtn) {
      _vpSelect(selBtn.dataset.voiceSelect, selBtn.dataset.voiceName, selBtn.dataset.voiceSource);
      return;
    }
    // Preview
    const prevBtn = e.target.closest('[data-voice-preview-url]');
    if (prevBtn) {
      try { new Audio(prevBtn.dataset.voicePreviewUrl).play(); } catch (_) {}
    }
  });
}

function _vpRenderList(filter) {
  const list = document.getElementById('voice-picker-list');
  if (!list) return;
  const sections = [];

  // ── Cloned voices from all LoRA items ──────────────────────────
  const allItems = getAllItems();
  const seen = new Set();
  const cloned = allItems
    .filter(it => it.voiceProfile?.source === 'cloned' && it.voiceProfile.elevenlabsVoiceId)
    .map(it => ({ ...it.voiceProfile, charName: it.name }))
    .filter(v => {
      if (seen.has(v.elevenlabsVoiceId)) return false;
      seen.add(v.elevenlabsVoiceId);
      return !filter || v.voiceName.toLowerCase().includes(filter) || v.charName.toLowerCase().includes(filter);
    });

  if (cloned.length) {
    sections.push(
      `<div class="voice-picker-section-hd">Cloned Voices</div>` +
      cloned.map(v => `
        <div class="voice-picker-row">
          <div class="voice-picker-row-icon">🎙</div>
          <div class="voice-picker-row-meta">
            <div class="voice-picker-row-name">${_hesc(v.voiceName)}</div>
            <div class="voice-picker-row-sub">${_hesc(v.charName)} · ${v.durationSec || '?'}s · Cloned</div>
          </div>
          <div class="voice-picker-row-actions">
            <button class="btn-xs primary" data-voice-select="${_hesc(v.elevenlabsVoiceId)}"
              data-voice-name="${_hesc(v.voiceName)}" data-voice-source="cloned">Select</button>
          </div>
        </div>`).join(''));
  }

  // ── ElevenLabs catalog voices ──────────────────────────────────
  const elVoices = (window.VOICE_CATALOG?.elevenlabs || [])
    .filter(v => !filter || (v.name || '').toLowerCase().includes(filter));
  if (elVoices.length) {
    sections.push(
      `<div class="voice-picker-section-hd">ElevenLabs Voices</div>` +
      elVoices.map(v => `
        <div class="voice-picker-row">
          <div class="voice-picker-row-icon">🔊</div>
          <div class="voice-picker-row-meta">
            <div class="voice-picker-row-name">${_hesc(v.name)}</div>
            <div class="voice-picker-row-sub">${v.labels?.gender || ''} ${v.labels?.accent ? '· ' + v.labels.accent : ''} · ElevenLabs</div>
          </div>
          <div class="voice-picker-row-actions">
            ${v.preview_url ? `<button class="btn-xs" data-voice-preview-url="${_hesc(v.preview_url)}" title="Preview">▶</button>` : ''}
            <button class="btn-xs primary" data-voice-select="${_hesc(v.voice_id)}"
              data-voice-name="${_hesc(v.name)}" data-voice-source="library">Select</button>
          </div>
        </div>`).join(''));
  } else if (!_getElKey()) {
    sections.push(`<div class="voice-picker-empty">Add your ElevenLabs API key to browse preset voices.</div>`);
  }

  // ── Gemini voices (narrator mode only) ────────────────────────
  if (_vpMode === 'narrator') {
    const gemVoices = (window.VOICE_CATALOG?.gemini || [])
      .filter(v => !filter || (v.name || '').toLowerCase().includes(filter));
    if (gemVoices.length) {
      sections.push(
        `<div class="voice-picker-section-hd">Gemini Voices</div>` +
        gemVoices.map(v => `
          <div class="voice-picker-row">
            <div class="voice-picker-row-icon">✨</div>
            <div class="voice-picker-row-meta">
              <div class="voice-picker-row-name">${_hesc(v.name)}</div>
              <div class="voice-picker-row-sub">${v.gender || ''} · ${v.tag || 'Gemini TTS'}</div>
            </div>
            <div class="voice-picker-row-actions">
              <button class="btn-xs primary" data-voice-select="${_hesc(v.id)}"
                data-voice-name="${_hesc(v.name)}" data-voice-source="gemini">Select</button>
            </div>
          </div>`).join(''));
    }
  }

  list.innerHTML = sections.length
    ? sections.join('')
    : `<div class="voice-picker-empty">No voices found. Clone a voice first${_vpMode === 'narrator' ? '' : ' or add your ElevenLabs key'}.</div>`;
}

function _vpSelect(voiceId, voiceName, source) {
  const voice = {
    provider:  source === 'gemini' ? 'gemini' : 'elevenlabs',
    voiceId,
    voiceName,
    source,
    elevenlabsVoiceId: source !== 'gemini' ? voiceId : null,
  };

  if (_vpMode === 'narrator') {
    const n = window.createJobState?.narrator;
    if (n) {
      n.voice = voice;
      _closeVoicePicker();
      if (typeof window.narratorRenderSlot === 'function') window.narratorRenderSlot();
    }
    return;
  }

  // Character LoRA item
  const item = getItemById(_vpItemId);
  if (item) {
    saveItem({ ...item, voiceProfile: {
      ...(item.voiceProfile || {}),
      voiceName,
      elevenlabsVoiceId: source !== 'gemini' ? voiceId : null,
      geminiVoiceId:     source === 'gemini'  ? voiceId : null,
      source,
    }});
    _closeVoicePicker();
    _vcRefreshVoiceUI(_vpItemId);
  }
}

// ── Voice section ─────────────────────────────────────────────────
function _renderVoiceSection(itemId, container) {
  const item  = getItemById(itemId);
  const vp    = item?.voiceProfile;
  const srcBadge = vp ? (vp.source === 'cloned' ? '✓ CLONED' : vp.source === 'library' ? '✓ LIBRARY' : '✓ VOICE') : '';
  const srcColor = vp?.source === 'cloned' ? 'lora-voice-badge-cloned' : 'lora-optional-badge';
  const meta     = vp
    ? [vp.durationSec ? `${vp.durationSec}s` : null, vp.language || 'en', vp.source || 'library']
        .filter(Boolean).join(' · ')
    : '';

  if (vp) {
    container.innerHTML = `
      <div class="lora-voice-row lora-voice-filled">
        <div class="lora-voice-icon">🎙</div>
        <div class="lora-voice-meta">
          <div class="text-sm" style="font-weight:500">${_hesc(vp.voiceName || 'Voice')}</div>
          <div class="text-2xs text-muted">${_hesc(meta)}</div>
        </div>
        <span class="${srcColor}">${srcBadge}</span>
        <div style="display:flex;gap:6px;margin-left:auto">
          <button class="btn-xs" id="btn-voice-replace">Replace</button>
          <button class="btn-xs" id="btn-voice-remove">Remove</button>
        </div>
      </div>`;
    container.querySelector('#btn-voice-remove')?.addEventListener('click', () => {
      const cur = getItemById(itemId);
      if (cur) { saveItem({ ...cur, voiceProfile: null }); _renderVoiceSection(itemId, container); }
    });
    container.querySelector('#btn-voice-replace')?.addEventListener('click', () => _openVoicePicker(itemId, 'character'));
  } else {
    container.innerHTML = `
      <div class="lora-voice-row">
        <div class="lora-voice-header">
          <span style="font-size:15px">🎙</span>
          <span class="text-xs" style="font-weight:600;color:var(--text-secondary)">Voice</span>
          <span class="lora-optional-badge">OPTIONAL</span>
        </div>
        <p class="text-xs text-muted" style="margin:4px 0 10px">Add a voice to auto-apply when generating talking-head clips.</p>
        <div style="display:flex;gap:8px">
          <button class="btn-xs" style="flex:1" id="btn-voice-upload">🎙 Clone Voice</button>
          <button class="btn-xs" style="flex:1" id="btn-voice-library">🔊 Pick from Library</button>
        </div>
      </div>`;
    container.querySelector('#btn-voice-upload')?.addEventListener('click',  () => _openVoiceCloneModal(itemId));
    container.querySelector('#btn-voice-library')?.addEventListener('click', () => _openVoicePicker(itemId, 'character'));
  }
}

// ── Input modal action button ─────────────────────────────────────
function _renderInputActions(itemId, path) {
  const el = document.getElementById('lora-input-actions');
  if (!el) return;
  const label = (path === 'product' || path === 'scene-real') ? 'Train LoRA' : 'Generate 18 Training Images';
  el.innerHTML = `<button id="btn-input-primary" class="btn-sm primary" style="width:100%;" disabled>${label}</button>`;
  document.getElementById('btn-input-primary')?.addEventListener('click', () => _onInputPrimary(itemId, path));
}

function _validateInputModal() {
  const btn  = document.getElementById('btn-input-primary');
  if (!btn || !_currentInputItemId) return;
  const item = getItemById(_currentInputItemId);
  if (!item || !(item.name || '').trim()) { btn.disabled = true; return; }

  let enabled = false;
  switch (item.type) {
    case 'product': {
      const good = Object.values(_inputQualityState).filter(q => q && q.ok).length;
      enabled = (item.photoCount || 0) >= 5 && good >= 5;
      break;
    }
    case 'talking-head': {
      // Mandatory slots 0–3: uploaded AND passing QC
      const mandatory = [0, 1, 2, 3];
      enabled = mandatory.every(i => {
        const qc = _inputQualityState[`slot_${i}`];
        return qc && qc.ok;
      });
      break;
    }
    case 'scene-real': {
      // All 18 slots filled
      let filled = 0;
      for (let o = 0; o < 3; o++)
        for (let s = 0; s < 6; s++)
          if (_inputQualityState[`outfit_${o}_${s}`]) filled++;
      enabled = filled === 18;
      break;
    }
    case 'scene-ai': {
      const hasRef  = !!_inputQualityState['ref_0_exists'];
      const hasDesc = !!(item.aiReferenceDesc || '').trim();
      enabled = hasRef && hasDesc;
      break;
    }
  }
  btn.disabled = !enabled;
}

function _onInputPrimary(itemId, path) {
  const item = getItemById(itemId);
  if (!item) return;
  _closeInputModal(false);

  if (path === 'product' || path === 'scene-real') {
    // Direct photo upload → train immediately
    trainItemV2(itemId);
  } else {
    // Paths B/C2: generate training images first, then train
    _generateTrainingGrids(itemId);
  }
}

// ════════════════════════════════════════════════════
//  PHASE 7 — Lock / Unlock / Retrain
// ════════════════════════════════════════════════════

function _lockItem(itemId) {
  const item = getItemById(itemId);
  if (!item) return;
  saveItem({ ...item, locked: true });
  _renderStudioCards();
  renderAssetsSection();
  _renderTuningPanel(itemId);      // update tuning panel in place
}

function _unlockItem(itemId) {
  const item = getItemById(itemId);
  if (!item) return;
  if (!confirm(`Unlock "${item.name}" for editing? This will allow tuning parameter changes.`)) return;
  saveItem({ ...item, locked: false });
  _renderStudioCards();
  renderAssetsSection();
  _renderTuningPanel(itemId);
}

async function _retrainItem(itemId) {
  const item = getItemById(itemId);
  if (!item) return;
  if (!confirm(`Archive the current LoRA for "${item.name}" and retrain from scratch?\n\nYou can restore the archived version from the card menu.`)) return;

  // Archive current trained state
  const archive = {
    loraUrl:        item.loraUrl,
    configUrl:      item.configUrl,
    trainCompleted: item.trainCompleted,
    tuningParams:   { ...(item.tuningParams || _defaultTuning()) },
    triggerWord:    item.triggerWord,
    archivedAt:     Date.now(),
  };
  const archivedVersions = [...(item.archivedVersions || []), archive];

  // Clear preview IDB keys
  for (let i = 0; i < 3; i++) {
    await _idbDel(`lora_v2_${itemId}_preview_${i}`).catch(() => {});
  }

  saveItem({
    ...item,
    loraStatus:       'idle',
    loraUrl:          null,
    configUrl:        null,
    falRequestId:     null,
    loraError:        null,
    triggerWord:      '',
    trainStarted:     null,
    trainCompleted:   null,
    progressPct:      0,
    progressPhase:    null,
    previewGenerated: false,
    previewGenerating:false,
    locked:           false,
    archivedVersions,
  });

  _closeTuningPanel();
  _renderStudioCards();

  // Re-open input modal for same path, with existing photos pre-loaded
  _openInputModalForExisting(itemId);
}

// Open input modal for an already-created item (for retrain — keeps photos in IDB)
async function _openInputModalForExisting(itemId) {
  const item = getItemById(itemId);
  if (!item) return;

  _currentInputItemId = itemId;
  _inputQualityState  = {};

  const TYPE_INFO = {
    product:        { badge: '📦 Product',     title: 'Product LoRA' },
    'talking-head': { badge: '🗣 Talking Head', title: 'Character: Talking Head' },
    'scene-real':   { badge: '🎬 Scene (Real)', title: 'Scene Character: Real Photos' },
    'scene-ai':     { badge: '✨ Scene (AI)',   title: 'Scene Character: AI-Generated' },
  };
  const info = TYPE_INFO[item.type] || TYPE_INFO.product;

  const badge     = document.getElementById('lora-input-badge');
  const titleEl   = document.getElementById('lora-input-title');
  const nameInput = document.getElementById('lora-input-name');
  if (badge)     { badge.textContent = info.badge; badge.className = `studio-card-badge studio-card-badge--${item.type}`; }
  if (titleEl)   titleEl.textContent = info.title;
  if (nameInput) nameInput.value = item.name || '';

  const uploadArea = document.getElementById('lora-upload-area');
  if (uploadArea) {
    if      (item.type === 'product')        _renderPathA(itemId, uploadArea);
    else if (item.type === 'talking-head')   _renderPathB(itemId, uploadArea);
    else if (item.type === 'scene-real')     _renderPathC1(itemId, uploadArea);
    else if (item.type === 'scene-ai')       _renderPathC2(itemId, uploadArea);
  }

  const voiceSection = document.getElementById('lora-voice-section');
  if (voiceSection) _renderVoiceSection(itemId, voiceSection);

  _validateInputModal();
  document.getElementById('lora-input-modal')?.classList.remove('hidden');
}

function _restoreArchivedVersion(itemId, archiveIdx) {
  const item = getItemById(itemId);
  if (!item) return;
  const archive = (item.archivedVersions || [])[archiveIdx];
  if (!archive) return;

  if (!confirm(`Restore archived version from ${new Date(archive.archivedAt || 0).toLocaleDateString()}? Current state will be discarded.`)) return;

  saveItem({
    ...item,
    loraUrl:          archive.loraUrl,
    configUrl:        archive.configUrl,
    trainCompleted:   archive.trainCompleted,
    tuningParams:     { ...archive.tuningParams },
    triggerWord:      archive.triggerWord,
    loraStatus:       'ready',
    loraError:        null,
    falRequestId:     null,
    progressPct:      0,
    progressPhase:    null,
    previewGenerated: false,
    locked:           false,
  });

  _renderStudioCards();
  renderAssetsSection();

  // Open tuning panel — will auto-trigger preview regeneration
  _openTuningPanel(itemId);
}

// ════════════════════════════════════════════════════
//  PHASE 6 — Preview Generation + Fine-Tuning Panel
// ════════════════════════════════════════════════════

const PREVIEW_PROMPTS = {
  product: [
    '{trigger} product photo, clean white background, studio lighting',
    '{trigger} product, rustic wooden surface, warm lighting, lifestyle',
    '{trigger} product, lifestyle setting, soft bokeh, natural light',
  ],
  'talking-head': [
    '{trigger}, casual outdoor portrait, park bench, golden hour',
    '{trigger}, formal office portrait, seated, soft professional lighting',
    '{trigger}, smart-casual, cafe setting, candid walking shot',
  ],
  'scene-real': [
    '{trigger}, casual outdoor portrait, park bench, golden hour',
    '{trigger}, formal office portrait, seated, soft professional lighting',
    '{trigger}, smart-casual, cafe setting, candid walking shot',
  ],
  'scene-ai': [
    '{trigger}, casual outdoor portrait, park bench, golden hour',
    '{trigger}, formal office portrait, seated, soft professional lighting',
    '{trigger}, smart-casual, cafe setting, candid walking shot',
  ],
};

const PREVIEW_LABELS = {
  product:       ['White background', 'Wooden surface', 'Lifestyle'],
  'talking-head':['Park bench, golden hour', 'Office, soft lighting', 'Cafe, walking'],
  'scene-real':  ['Park bench, golden hour', 'Office, soft lighting', 'Cafe, walking'],
  'scene-ai':    ['Park bench, golden hour', 'Office, soft lighting', 'Cafe, walking'],
};

// ── Sync fal.run helper ───────────────────────────────────────────
async function _falRunSync(endpoint, input) {
  const key = getFalKey();
  if (!key) throw new Error('No fal.ai API key set.');
  const resp = await fetch(`https://fal.run/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`fal.run ${resp.status}: ${t.slice(0, 200)}`);
  }
  return resp.json();
}

// ── Flux 2 refine pass ────────────────────────────────────────────
async function _runFlux2Refine(dataUrl, _prompt, item) {
  try {
    // Construct refine prompt (avoid blemish-inducing words per DOE iter 2.6)
    const refinePrompt = 'Natural editorial photograph, soft natural skin tones, real photography aesthetic, fujifilm color science, professional candid photography.';
    const data = await _falRunSync('fal-ai/flux-2/lora/edit', {
      prompt: refinePrompt,
      image_urls: [dataUrl],
      loras: [],
      num_inference_steps: 40,
      guidance_scale: 2.5,
      seed: item.tuningParams?.seed || 42,
      output_format: 'jpeg',
      image_size: { width: 720, height: 1280 },
    });
    const url = data.images?.[0]?.url;
    if (!url) return dataUrl;
    // Fetch and convert to data URL
    const resp = await fetch(url);
    if (!resp.ok) return dataUrl;
    const blob = await resp.blob();
    return await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob); });
  } catch (e) {
    console.warn('[LoraStudio] Refine pass failed (skipping):', e.message);
    return dataUrl; // Fall back to unrefined
  }
}

// ── Generate 3 preview images ─────────────────────────────────────
async function _generatePreviews(itemId) {
  const item = getItemById(itemId);
  if (!item || !item.loraUrl) return;

  saveItem({ ...getItemById(itemId), previewGenerating: true });
  const tuning = item.tuningParams || _defaultTuning();
  const prompts = PREVIEW_PROMPTS[item.type] || PREVIEW_PROMPTS['talking-head'];
  const trigger = item.triggerWord || '';

  // Repopulate preview pane if panel is open
  _renderTuningPreviews(itemId, true);

  try {
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i].replace('{trigger}', trigger);

      let imageDataUrl;
      if (item.trainerType === 'qwen') {
        // Qwen inference
        const data = await _falRunSync('fal-ai/qwen-image', {
          prompt,
          lora_path: item.loraUrl,
          lora_scale: tuning.lora_scale ?? 0.9,
          guidance_scale: tuning.guidance_scale ?? 3.5,
          seed: tuning.seed,
          num_inference_steps: 28,
          output_format: 'jpeg',
          image_size: item.type === 'product'
            ? { width: 1024, height: 1024 }
            : { width: 768, height: 1024 },
        });
        const url = data.images?.[0]?.url;
        if (!url) throw new Error('No image URL from qwen inference');
        const resp = await fetch(url);
        const blob = await resp.blob();
        imageDataUrl = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob); });
      } else {
        // Flux-lora inference
        const data = await _falRunSync('fal-ai/flux-lora', {
          prompt,
          loras: [{ path: item.loraUrl, scale: tuning.lora_scale ?? 0.9 }],
          num_inference_steps: 28,
          guidance_scale: tuning.guidance_scale ?? 3.5,
          seed: tuning.seed,
          num_images: 1,
          output_format: 'jpeg',
          image_size: item.type === 'product'
            ? { width: 1024, height: 1024 }
            : { width: 768, height: 1024 },
        });
        const url = data.images?.[0]?.url;
        if (!url) throw new Error('No image URL from flux-lora inference');
        const resp = await fetch(url);
        const blob = await resp.blob();
        imageDataUrl = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob); });
      }

      // Optional Flux 2 refine pass
      if (tuning.refineEnabled && item.type !== 'product') {
        imageDataUrl = await _runFlux2Refine(imageDataUrl, prompt, item);
      }

      await _idbSet(`lora_v2_${itemId}_preview_${i}`, imageDataUrl);
      // Update live if panel open
      _renderTuningPreviews(itemId, false);
    }

    saveItem({ ...getItemById(itemId), previewGenerated: true, previewGenerating: false });
    _renderStudioCards();
    _renderTuningPreviews(itemId, false);

  } catch (e) {
    console.error('[LoraStudio] Preview generation failed:', e);
    saveItem({ ...getItemById(itemId), previewGenerating: false });
    _showToast(`⚠ Preview generation failed: ${e.message}`);
  }
}

// ── Tuning panel open/close ───────────────────────────────────────
function _openTuningPanel(itemId) {
  const panel = document.getElementById('lora-tuning-page');
  if (!panel) return;
  panel.dataset.itemId = itemId;
  panel.style.display = 'flex';
  _renderTuningPanel(itemId);
  // Trigger preview generation if not yet done
  const item = getItemById(itemId);
  if (item && !item.previewGenerated && !item.previewGenerating && item.loraUrl) {
    _generatePreviews(itemId);
  }
}

function _closeTuningPanel() {
  const panel = document.getElementById('lora-tuning-page');
  if (!panel) return;
  panel.style.display = 'none';
  delete panel.dataset.itemId;
  // Refresh studio cards in case previews updated
  _renderStudioCards();
}

// ── Tuning panel full render ──────────────────────────────────────
function _renderTuningPanel(itemId) {
  const item = getItemById(itemId);
  if (!item) return;
  const panel = document.getElementById('lora-tuning-page');
  if (!panel) return;

  const locked = !!item.locked;

  // Update topbar
  const nameEl = panel.querySelector('.tuning-item-name');
  if (nameEl) nameEl.textContent = `${locked ? '🔒 ' : ''}${item.name || 'Unnamed'}`;
  const badgeEl = panel.querySelector('.tuning-type-badge');
  if (badgeEl) {
    const LABELS = { product: 'Product', 'talking-head': 'Talking Head', 'scene-real': 'Scene', 'scene-ai': 'Scene AI' };
    badgeEl.textContent = LABELS[item.type] || item.type;
    badgeEl.className = `tuning-type-badge studio-card-badge studio-card-badge--${item.type}`;
  }

  // Locked banner
  const banner = document.getElementById('tuning-locked-banner');
  if (banner) banner.style.display = locked ? 'flex' : 'none';

  // Compat badges
  const compatSec = document.getElementById('tuning-compat-section');
  const compatBadges = document.getElementById('tuning-compat-badges');
  if (compatSec && compatBadges) {
    const compat = item.compatibleWith || [];
    if (compat.length > 0) {
      compatSec.style.display = '';
      compatBadges.innerHTML = compat.map(c => `<span class="studio-compat-pill">${c} ✓</span>`).join('');
    } else {
      compatSec.style.display = 'none';
    }
  }

  // Toggle editable vs read-only sections
  const editable = document.getElementById('tuning-editable');
  const readonly = document.getElementById('tuning-readonly');
  if (editable) editable.style.display = locked ? 'none' : '';
  if (readonly) readonly.style.display = locked ? '' : 'none';

  // Lock / Unlock button visibility
  const lockBtn   = document.getElementById('btn-tuning-lock');
  const unlockBtn = document.getElementById('btn-tuning-unlock');
  const retrainBtn = document.getElementById('btn-tuning-retrain');
  const actionRow = panel.querySelector('.tuning-action-row');
  if (lockBtn)    lockBtn.style.display   = locked ? 'none' : '';
  if (unlockBtn)  unlockBtn.style.display = locked ? '' : 'none';
  if (retrainBtn) retrainBtn.style.display = '';      // always visible
  if (actionRow)  actionRow.style.display = locked ? 'none' : '';

  // Sliders — update both editable and read-only variants
  const tuning = item.tuningParams || _defaultTuning();
  _setTuningSlider(panel, 'lora_scale',        tuning.lora_scale      ?? 0.9, 0.5, 1.2);
  _setTuningSlider(panel, 'guidance_scale',    tuning.guidance_scale  ?? 3.5, 2,   8);
  _setTuningSlider(panel, 'lora_scale_ro',     tuning.lora_scale      ?? 0.9, 0.5, 1.2);
  _setTuningSlider(panel, 'guidance_scale_ro', tuning.guidance_scale  ?? 3.5, 2,   8);

  // Refine toggle (only relevant when unlocked)
  const toggleTrack = panel.querySelector('.tuning-toggle-track');
  if (toggleTrack) {
    const knob = toggleTrack.querySelector('.tuning-toggle-knob');
    const enabled = !!tuning.refineEnabled;
    toggleTrack.dataset.on = enabled ? '1' : '0';
    if (knob) {
      knob.style.transform  = enabled ? 'translateX(16px)' : 'translateX(0)';
      knob.style.background = enabled ? 'var(--accent)' : '';
    }
    toggleTrack.style.background = enabled ? 'rgba(0,229,200,0.25)' : '';
  }

  _renderTuningVoice(itemId);
  _renderTuningPreviews(itemId, false);
}

function _setTuningSlider(panel, key, value, min, max) {
  const input = panel.querySelector(`input[data-tuning="${key}"]`);
  const valEl = panel.querySelector(`[data-tuning-val="${key}"]`);
  if (input) input.value = value;
  if (valEl) valEl.textContent = Number(value).toFixed(1);
}

function _renderTuningVoice(itemId) {
  const item = getItemById(itemId);
  const container = document.getElementById('tuning-voice-section');
  if (!container) return;
  const vp = item?.voiceProfile;
  if (vp && vp.voiceName) {
    const srcBadge = vp.source === 'cloned' ? '✓ CLONED' : '✓ LIBRARY';
    const srcClass = vp.source === 'cloned' ? 'lora-voice-badge-cloned' : 'lora-optional-badge';
    container.innerHTML = `
      <div class="lora-voice-row lora-voice-filled" style="margin-bottom:0">
        <div class="lora-voice-icon">🎙</div>
        <div class="lora-voice-meta" style="flex:1">
          <div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${_hesc(vp.voiceName)}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:1px">${vp.durationSec ? vp.durationSec + 's · ' : ''}${vp.language || 'en'}</div>
        </div>
        <span class="${srcClass}" style="flex-shrink:0">${srcBadge}</span>
        <button class="btn-xs" id="btn-tuning-voice-change" style="flex-shrink:0">Change</button>
      </div>`;
    container.querySelector('#btn-tuning-voice-change')?.addEventListener('click', () => _openVoicePicker(itemId, 'character'));
  } else {
    container.innerHTML = `
      <div style="display:flex;gap:8px;padding:4px 0">
        <button class="btn-xs" style="flex:1" id="btn-tuning-voice-clone">🎙 Clone Voice</button>
        <button class="btn-xs" style="flex:1" id="btn-tuning-voice-pick">🔊 Pick Voice</button>
      </div>`;
    container.querySelector('#btn-tuning-voice-clone')?.addEventListener('click', () => _openVoiceCloneModal(itemId));
    container.querySelector('#btn-tuning-voice-pick')?.addEventListener('click',  () => _openVoicePicker(itemId, 'character'));
  }
}

async function _renderTuningPreviews(itemId, showSpinner) {
  const container = document.getElementById('tuning-previews');
  if (!container) return;
  const item = getItemById(itemId);
  const labels = PREVIEW_LABELS[item?.type] || PREVIEW_LABELS['talking-head'];

  let html = '';
  for (let i = 0; i < 3; i++) {
    const imgData = await _idbGet(`lora_v2_${itemId}_preview_${i}`).catch(() => null);
    html += `
      <div class="tuning-preview-card">
        <div class="tuning-preview-img">
          ${imgData
            ? `<img src="${imgData}" style="width:100%;height:100%;object-fit:cover">`
            : showSpinner || item?.previewGenerating
              ? `<div class="tuning-preview-spinner"><div class="studio-progress-bar" style="position:absolute;bottom:0;left:0;right:0"><div class="studio-progress-fill indeterminate"></div></div></div>`
              : `<div class="tuning-preview-empty"></div>`}
        </div>
        <div class="tuning-preview-label">${labels[i] || ''}</div>
      </div>`;
  }
  container.innerHTML = html;
}

// ── Wire tuning panel interactivity ──────────────────────────────
function _wireTuningPanel() {
  const panel = document.getElementById('lora-tuning-page');
  if (!panel) return;

  // Back button
  panel.querySelector('#btn-tuning-back')?.addEventListener('click', _closeTuningPanel);

  // Sliders: update display value live, store on input
  panel.querySelectorAll('input[data-tuning]').forEach(input => {
    const key = input.dataset.tuning;
    const valEl = panel.querySelector(`[data-tuning-val="${key}"]`);
    input.addEventListener('input', () => {
      if (valEl) valEl.textContent = Number(input.value).toFixed(1);
    });
  });

  // Shuffle button
  panel.querySelector('#btn-tuning-shuffle')?.addEventListener('click', () => {
    const itemId = panel.dataset.itemId;
    const item = getItemById(itemId);
    if (!item) return;
    const newSeed = Math.floor(Math.random() * 2147483647);
    saveItem({ ...item, tuningParams: { ...(item.tuningParams || _defaultTuning()), seed: Math.floor(Math.random() * 2147483647) } });
    _showToast(`🎲 New seed: ${newSeed}`);
  });

  // Refine toggle
  panel.querySelector('.tuning-toggle-track')?.addEventListener('click', () => {
    const itemId = panel.dataset.itemId;
    const item = getItemById(itemId);
    if (!item) return;
    const tuning = { ...(item.tuningParams || _defaultTuning()) };
    tuning.refineEnabled = !tuning.refineEnabled;
    saveItem({ ...item, tuningParams: tuning });
    // Update toggle UI
    const track = panel.querySelector('.tuning-toggle-track');
    const knob = track?.querySelector('.tuning-toggle-knob');
    track.dataset.on = tuning.refineEnabled ? '1' : '0';
    if (knob) knob.style.transform = tuning.refineEnabled ? 'translateX(16px)' : 'translateX(0)';
    if (knob) knob.style.background = tuning.refineEnabled ? 'var(--accent)' : '';
    if (track) track.style.background = tuning.refineEnabled ? 'rgba(0,229,200,0.25)' : '';
  });

  // Apply & Regenerate
  panel.querySelector('#btn-tuning-apply')?.addEventListener('click', () => {
    const itemId = panel.dataset.itemId;
    const item = getItemById(itemId);
    if (!item) return;
    // Read slider values
    const loraScale     = parseFloat(panel.querySelector('input[data-tuning="lora_scale"]')?.value     ?? 0.9);
    const guidanceScale = parseFloat(panel.querySelector('input[data-tuning="guidance_scale"]')?.value  ?? 3.5);
    const cur = getItemById(itemId);
    const tuning = { ...(cur.tuningParams || _defaultTuning()), lora_scale: loraScale, guidance_scale: guidanceScale };
    saveItem({ ...cur, tuningParams: tuning });
    _generatePreviews(itemId);
  });

  // Lock button
  panel.querySelector('#btn-tuning-lock')?.addEventListener('click', () => {
    const itemId = panel.dataset.itemId;
    if (itemId) _lockItem(itemId);
  });

  // Unlock button
  panel.querySelector('#btn-tuning-unlock')?.addEventListener('click', () => {
    const itemId = panel.dataset.itemId;
    if (itemId) _unlockItem(itemId);
  });

  // Retrain button
  panel.querySelector('#btn-tuning-retrain')?.addEventListener('click', () => {
    const itemId = panel.dataset.itemId;
    if (itemId) _retrainItem(itemId);
  });
}

// ════════════════════════════════════════════════════
//  PHASE 5 — Training Image Generation Pipeline
// ════════════════════════════════════════════════════

// Build 9 per-cell prompts for a 3×3 Gemini grid
function _buildGridPromptsForItem(item, outfitTheme) {
  const desc = (item.description || '').trim();
  const identity = desc ? `${desc}, ` : '';
  return GRID_CELL_POSES.map(pose => `${identity}${outfitTheme.desc}, ${pose}`);
}

async function _generateTrainingGrids(itemId) {
  const item = getItemById(itemId);
  if (!item) return;

  // Mark generating
  saveItem({ ...item, loraStatus: 'generating', progressPhase: 'Preparing training images…' });
  _renderStudioCards();
  _renderTopbarTrainingIndicator();

  const geminiKey = (typeof getCreateGeminiKey === 'function') ? getCreateGeminiKey() : null;
  if (!geminiKey) {
    saveItem({ ...getItemById(itemId), loraStatus: 'error', loraError: 'Gemini API key not set' });
    _renderStudioCards();
    _showToast('⚠ Gemini API key required for training image generation.');
    return;
  }

  // Collect user's uploaded photos as inline reference parts
  const refParts = [];
  const refKeys = item.type === 'scene-ai'
    ? [`lora_v2_${itemId}_ref_0`, `lora_v2_${itemId}_ref_1`]
    : Array.from({ length: 5 }, (_, i) => `lora_v2_${itemId}_photo_${i}`);

  for (const k of refKeys) {
    const dataUrl = await _idbGet(k).catch(() => null);
    if (!dataUrl) continue;
    const b64 = dataUrl.split(',')[1];
    if (!b64) continue;
    const mimeType = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    refParts.push({ inlineData: { mimeType, data: b64 } });
  }

  const identityNote = refParts.length > 0
    ? ' Faithfully replicate the exact facial features, skin tone, hair, and distinctive characteristics of the person shown in the reference images in every panel.'
    : '';

  const desc = (item.description || '').trim();
  let trainIdx = 0;

  try {
    for (let g = 0; g < OUTFIT_THEMES.length; g++) {
      const theme = OUTFIT_THEMES[g];
      saveItem({
        ...getItemById(itemId),
        progressPhase: `Generating ${theme.label} images… (${g + 1}/3)`,
      });
      _renderStudioCards();

      const cellPrompts = _buildGridPromptsForItem(getItemById(itemId), theme);
      const stylePrompt = `Photorealistic portrait photography, professional quality.${desc ? ` Subject: ${desc}.` : ''} ${theme.desc}.${identityNote}`;

      // Try Pro → Flash → 2.5 Flash in order
      const models = ['gemini-3-pro-image-preview', 'gemini-3-flash-image-preview', 'gemini-2.5-flash-image'];
      let gridDataUrl = null;
      for (const model of models) {
        try {
          gridDataUrl = await generateGridImage(
            cellPrompts, geminiKey, stylePrompt, model,
            'square format (1:1 aspect ratio)',
            { refParts }
          );
          break;
        } catch (e) {
          console.warn(`[LoRA Phase5] model ${model} failed:`, e.message);
          if (model === models[models.length - 1]) throw e;
        }
      }

      // Upscale 2× then crop 9 cells
      const cells = await createUpscaleAndCrop(gridDataUrl, 2, 3, 3, 9);

      // Resize each cell to 1024×1024 and store
      for (let c = 0; c < cells.length; c++) {
        const resized = await resizeCellToTarget(cells[c], 1024, 1024);
        await _idbSet(`lora_v2_${itemId}_train_${trainIdx}`, resized);
        trainIdx++;
      }
    }

    // All 27 images stored — move to reviewing state
    saveItem({
      ...getItemById(itemId),
      loraStatus: 'reviewing',
      trainImageCount: trainIdx,
      progressPhase: '',
    });
    _renderStudioCards();
    _renderTopbarTrainingIndicator();
    _reviewRejected = {};
    _openReviewModal(itemId);

  } catch (err) {
    console.error('[LoRA Phase5] grid generation failed:', err);
    saveItem({
      ...getItemById(itemId),
      loraStatus: 'error',
      loraError: err.message,
      progressPhase: '',
    });
    _renderStudioCards();
    _renderTopbarTrainingIndicator();
    _showToast(`⚠ Image generation failed: ${err.message}`);
  }
}

// ── Review modal ──────────────────────────────────────────────────

function _openReviewModal(itemId) {
  const modal = document.getElementById('lora-review-modal');
  if (!modal) return;
  modal.dataset.itemId = itemId;
  modal.classList.remove('hidden');
  _renderReviewGrid(itemId);
}

function _closeReviewModal() {
  document.getElementById('lora-review-modal')?.classList.add('hidden');
}

async function _renderReviewGrid(itemId) {
  const item = getItemById(itemId);
  if (!item) return;

  const container = document.getElementById('lora-review-grid');
  if (!container) return;

  const titleEl = document.getElementById('lora-review-title');
  if (titleEl) titleEl.textContent = `${item.name || 'LoRA'} — Review Training Images`;

  container.innerHTML = '<p class="text-sm text-muted" style="padding:32px;text-align:center">Loading images…</p>';

  const total = item.trainImageCount || 0;
  const images = [];
  for (let i = 0; i < total; i++) {
    const d = await _idbGet(`lora_v2_${itemId}_train_${i}`).catch(() => null);
    images.push(d);
  }

  let html = '';
  for (let g = 0; g < OUTFIT_THEMES.length; g++) {
    const theme = OUTFIT_THEMES[g];
    html += `<div class="review-row-label">${theme.label}</div>`;
    html += `<div class="review-thumb-grid">`;
    for (let c = 0; c < 9; c++) {
      const idx = g * 9 + c;
      const key = `lora_v2_${itemId}_train_${idx}`;
      const rejected = !!_reviewRejected[key];
      const imgSrc = images[idx];
      html += `
        <div class="review-thumb${rejected ? ' review-thumb--rejected' : ''}" data-train-key="${key}">
          ${imgSrc
            ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:5px;display:block">`
            : `<div style="width:100%;height:100%;background:rgba(255,255,255,0.04);border-radius:5px"></div>`}
          ${rejected
            ? `<span class="review-thumb-x">✕</span>`
            : `<span class="review-thumb-hover-x">✕</span>`}
        </div>`;
    }
    html += `</div>`;
  }
  container.innerHTML = html;

  // Click to toggle reject/restore
  container.querySelectorAll('.review-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const key = thumb.dataset.trainKey;
      if (_reviewRejected[key]) {
        delete _reviewRejected[key];
        thumb.classList.remove('review-thumb--rejected');
        thumb.querySelector('.review-thumb-x')?.remove();
        const hx = document.createElement('span');
        hx.className = 'review-thumb-hover-x';
        hx.textContent = '✕';
        thumb.appendChild(hx);
      } else {
        _reviewRejected[key] = true;
        thumb.classList.add('review-thumb--rejected');
        thumb.querySelector('.review-thumb-hover-x')?.remove();
        const rx = document.createElement('span');
        rx.className = 'review-thumb-x';
        rx.textContent = '✕';
        thumb.appendChild(rx);
      }
      _updateReviewCounter(itemId);
    });
  });

  _updateReviewCounter(itemId);
}

function _updateReviewCounter(itemId) {
  const item = getItemById(itemId);
  if (!item) return;
  const total = item.trainImageCount || 0;
  const rejected = Object.keys(_reviewRejected).length;
  const approved = total - rejected;

  const counterEl = document.getElementById('lora-review-counter');
  if (counterEl) {
    counterEl.innerHTML =
      `<span style="color:var(--text-primary);font-weight:600">${approved}</span>` +
      `<span style="color:var(--text-muted)">/${total} approved</span>` +
      `<span style="font-size:11px;color:var(--text-muted);margin-left:8px">(18 minimum)</span>`;
  }

  const trainBtn = document.getElementById('btn-review-train');
  if (trainBtn) trainBtn.disabled = approved < 18;
}

async function _onReviewConfirm(itemId) {
  _closeReviewModal();

  const item = getItemById(itemId);
  if (!item) return;
  const total = item.trainImageCount || 0;

  // Compact IDB: skip rejected, shift remaining down
  let writeIdx = 0;
  for (let i = 0; i < total; i++) {
    const key = `lora_v2_${itemId}_train_${i}`;
    if (_reviewRejected[key]) {
      await _idbDel(key).catch(() => {});
    } else {
      if (writeIdx !== i) {
        const data = await _idbGet(key).catch(() => null);
        if (data) {
          await _idbSet(`lora_v2_${itemId}_train_${writeIdx}`, data);
          await _idbDel(key).catch(() => {});
        }
      }
      writeIdx++;
    }
  }

  saveItem({ ...getItemById(itemId), trainImageCount: writeIdx });
  _reviewRejected = {};

  // Hand off to Phase 4 training
  trainItemV2(itemId);
}

async function _onReviewRegenerate(itemId) {
  _closeReviewModal();

  // Clear existing training images from IDB
  const item = getItemById(itemId);
  if (!item) return;
  const total = item.trainImageCount || 0;
  for (let i = 0; i < total; i++) {
    await _idbDel(`lora_v2_${itemId}_train_${i}`).catch(() => {});
  }
  saveItem({ ...getItemById(itemId), trainImageCount: 0, loraStatus: 'idle' });
  _reviewRejected = {};

  // Re-generate
  _generateTrainingGrids(itemId);
}

// ════════════════════════════════════════════════════
//  PHASE 4 — Training Flow
// ════════════════════════════════════════════════════

// ── Dynamic JSZip loader (Qwen path needs a ZIP file) ─────────────
function _loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload  = () => resolve(window.JSZip);
    s.onerror = () => reject(new Error('Failed to load JSZip'));
    document.head.appendChild(s);
  });
}

async function _buildZipDataUrl(photos, captions) {
  const JSZip = await _loadJSZip();
  const zip   = new JSZip();
  for (let i = 0; i < photos.length; i++) {
    const dataUrl = photos[i];
    const b64     = dataUrl.split(',')[1] || '';
    const ext     = dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
    const pad     = String(i).padStart(2, '0');
    zip.file(`cell_${pad}.${ext}`, b64, { base64: true });
    zip.file(`cell_${pad}.txt`, captions[i] || '');
  }
  const b64zip = await zip.generateAsync({ type: 'base64' });
  return `data:application/zip;base64,${b64zip}`;
}

// ── Caption builder ───────────────────────────────────────────────
const POSE_CAPTIONS = [
  'front face portrait, neutral expression, soft even lighting',
  'left side profile, neutral expression, soft lighting',
  'right side profile, neutral expression, soft lighting',
  '3/4 angle portrait, slight smile, warm diffused lighting',
  'upper body waist-up, relaxed pose, natural light',
  'full body standing, neutral pose, studio background',
];

function _buildCaptions(item, count) {
  const trigger = item.triggerWord || `LORA${item.id.slice(-6).toUpperCase()}`;
  const captions = [];

  if (item.type === 'product') {
    const desc = item.description ? `, ${item.description}` : '';
    for (let i = 0; i < count; i++) {
      captions.push(`${trigger}, product photo${desc}`);
    }
  } else if (item.type === 'scene-real') {
    // 3 outfits × 6 poses = 18 total
    const labels = item.outfitLabels || ['outfit 1', 'outfit 2', 'outfit 3'];
    for (let oi = 0; oi < 3; oi++) {
      const outfit = labels[oi] || `outfit ${oi + 1}`;
      for (let si = 0; si < 6; si++) {
        const pose = POSE_CAPTIONS[si] || 'portrait';
        captions.push(`${trigger}, wearing ${outfit}, ${pose}`);
      }
    }
  } else {
    // Paths B/C2: training images generated by Phase 5 carry their own outfit context
    const desc = item.description ? `, ${item.description}` : '';
    for (let i = 0; i < count; i++) {
      captions.push(`${trigger}${desc}`);
    }
  }
  return captions;
}

// ── Main V2 trainer ───────────────────────────────────────────────
async function trainItemV2(itemId) {
  const item = getItemById(itemId);
  if (!item) return;

  if (!getFalKey()) {
    _showToast('Add your fal.ai key in LoRA Studio settings first.');
    return;
  }

  const trigger = `LORA${itemId.slice(-6).toUpperCase()}`;
  saveItem({ ...getItemById(itemId), loraStatus: 'training', trainStarted: Date.now(),
             loraError: null, falRequestId: null, triggerWord: trigger, progressPct: 0, progressPhase: TRAIN_PHASES_V2[0].label });
  _renderStudioCards();
  _renderTopbarTrainingIndicator();
  updateLaunchImageButton();
  _openTrainingModal(itemId);

  try {
    // Collect training images
    const useTrain = item.type === 'talking-head' || item.type === 'scene-ai';
    const keyPrefix = useTrain ? `lora_v2_${itemId}_train_` : `lora_v2_${itemId}_photo_`;
    const photoCount = useTrain ? (item.trainImageCount || 0) : (item.photoCount || 0);

    const photos = [];
    for (let i = 0; i < photoCount; i++) {
      const d = await _idbGet(`${keyPrefix}${i}`).catch(() => null);
      if (d) photos.push(d);
    }
    if (photos.length === 0) throw new Error('No training images found in storage.');

    const captions = _buildCaptions({ ...getItemById(itemId), triggerWord: trigger }, photos.length);

    // Build fal.ai input based on trainer type
    const cur = getItemById(itemId);
    let input;
    if (cur.trainerType === 'qwen') {
      const zipDataUrl = await _buildZipDataUrl(photos, captions);
      input = { image_data_url: zipDataUrl, trigger_phrase: trigger, steps: cur.trainSteps || 2000, learning_rate: 5e-4 };
    } else if (cur.trainerType === 'flux-portrait') {
      input = { images_data_url: photos, trigger_phrase: trigger, steps: cur.trainSteps || 2000, create_masks: true };
    } else {
      // flux-fast (product)
      input = { images_data_url: photos, trigger_word: trigger, steps: cur.trainSteps || 1500 };
    }

    const endpoint = cur.trainerEndpoint || 'fal-ai/flux-lora-fast-training';
    const submission = await _falSubmit(endpoint, input);
    const requestId = submission.request_id;
    if (!requestId) throw new Error('No request_id returned from fal.ai');

    saveItem({ ...getItemById(itemId), falRequestId: requestId });
    await _pollUntilDoneV2(itemId, requestId);

  } catch (e) {
    saveItem({ ...getItemById(itemId), loraStatus: 'error', loraError: e.message, falRequestId: null });
    _renderStudioCards();
    _renderTopbarTrainingIndicator();
    updateLaunchImageButton();
    _updateTrainingModal(itemId);
    _showToast(`⚠ Training failed: ${e.message}`);
    console.warn('[LoraStudio] trainItemV2 error:', e.message);
  }
}

// ── V2 poll loop ──────────────────────────────────────────────────
async function _pollUntilDoneV2(itemId, requestId) {
  const deadline = Date.now() + TRAIN_TIMEOUT;
  const startTime = Date.now();

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS));

    const item = getItemById(itemId);
    if (!item) return; // item deleted while polling

    // Progress estimate based on elapsed time (no server pct available)
    const elapsed = Date.now() - (item.trainStarted || startTime);
    const estimatedMs = (item.trainSteps || 2000) / 2000 * 30 * 60 * 1000; // rough: 30 min for 2000 steps
    const rawPct = Math.min(95, Math.floor((elapsed / estimatedMs) * 100));
    // Determine phase label from TRAIN_PHASES_V2
    const phase = [...TRAIN_PHASES_V2].reverse().find(p => rawPct >= p.pct) || TRAIN_PHASES_V2[0];

    saveItem({ ...getItemById(itemId), progressPct: rawPct, progressPhase: phase.label });
    _renderStudioCards();
    _renderTopbarTrainingIndicator();
    _updateTrainingModal(itemId);

    const cur = getItemById(itemId);
    const endpoint = cur?.trainerEndpoint || 'fal-ai/flux-lora-fast-training';
    let status;
    try {
      status = await _falPollStatus(endpoint, requestId);
    } catch (e) {
      console.warn('[LoraStudio] poll error (will retry):', e.message);
      continue;
    }

    if (status.status === 'COMPLETED') {
      const final = await _falFetchResult(endpoint, requestId);
      const loraUrl   = final.diffusers_lora_file?.url || final.lora_file?.url;
      const configUrl = final.config_file?.url || null;
      if (!loraUrl) throw new Error('No LoRA URL in fal.ai response');

      saveItem({ ...getItemById(itemId), loraStatus: 'ready', loraUrl, configUrl,
                 trainCompleted: Date.now(), falRequestId: null, progressPct: 100,
                 progressPhase: 'Training complete' });
      _renderStudioCards();
      _renderTopbarTrainingIndicator();
      renderAssetsSection();
      updateLaunchImageButton();
      _updateTrainingModal(itemId);
      _showToast(`✅ ${getItemById(itemId)?.name || 'LoRA'} is ready — generating previews…`);
      _generatePreviews(itemId).catch(e => console.warn('[LoraStudio] Preview gen failed:', e.message));
      return;
    }
    if (status.status === 'FAILED') {
      throw new Error(status.error || 'Training failed on fal.ai');
    }
  }
  throw new Error('LoRA training timed out (>20 min)');
}

// ── Resume on page load ───────────────────────────────────────────
async function _resumePendingTrainingV2() {
  for (const item of getItems()) {
    if (item.loraStatus === 'training' && item.falRequestId) {
      _renderTopbarTrainingIndicator();
      _pollUntilDoneV2(item.id, item.falRequestId).catch(e => {
        saveItem({ ...getItemById(item.id), loraStatus: 'error', loraError: e.message, falRequestId: null });
        _renderStudioCards();
        _renderTopbarTrainingIndicator();
        updateLaunchImageButton();
      });
    }
  }
}

// ── Training progress modal ───────────────────────────────────────
function _openTrainingModal(itemId) {
  _updateTrainingModal(itemId);
  document.getElementById('lora-training-modal')?.classList.remove('hidden');
}
function _closeTrainingModal() {
  document.getElementById('lora-training-modal')?.classList.add('hidden');
}

function _updateTrainingModal(itemId) {
  const modal = document.getElementById('lora-training-modal');
  if (!modal) return;
  const item = getItemById(itemId);
  if (!item) return;

  const pct = item.progressPct || 0;
  const isError = item.loraStatus === 'error';
  const isDone  = item.loraStatus === 'ready';

  // Update item name in header
  const nameEl = modal.querySelector('.training-modal-name');
  if (nameEl) nameEl.textContent = item.name || 'LoRA';

  // SVG ring: circumference = 2π × 70 ≈ 440
  const CIRC = 440;
  const fill = modal.querySelector('.training-ring-fill');
  if (fill) fill.style.strokeDashoffset = `${CIRC * (1 - pct / 100)}`;
  const pctEl = modal.querySelector('.training-pct');
  if (pctEl) pctEl.textContent = `${pct}%`;

  // Phase steps
  const stepsEl = modal.querySelector('.training-steps');
  if (stepsEl) {
    stepsEl.innerHTML = TRAIN_PHASES_V2.map((p, i) => {
      let cls = 'training-step-pending';
      let dot = `${i + 1}`;
      if (pct >= p.pct && (i + 1 === TRAIN_PHASES_V2.length || pct < TRAIN_PHASES_V2[i + 1]?.pct)) {
        cls = 'training-step-active'; dot = `${i + 1}`;
      } else if (pct >= (TRAIN_PHASES_V2[i + 1]?.pct ?? 101)) {
        cls = 'training-step-done'; dot = '✓';
      }
      return `<div class="training-step ${cls}">
        <div class="training-step-dot">${dot}</div>
        ${i < TRAIN_PHASES_V2.length - 1 ? '<div class="training-step-line"></div>' : ''}
        <div class="training-step-label">${p.label}</div>
      </div>`;
    }).join('');
  }

  // Error / done states
  const errEl = modal.querySelector('.training-error-msg');
  if (errEl) {
    errEl.textContent = isError ? (item.loraError || 'Training failed') : '';
    errEl.style.display = isError ? '' : 'none';
  }
}

// ── Init ──────────────────────────────────────────────────────────
function _init() {
  // Run V1→V2 migration before anything else (no-op after first run)
  _migrateV1ToV2();

  // ── Nav link → open LoRA Studio ──
  const navLink = document.getElementById('btn-library-nav');
  if (navLink) navLink.addEventListener('click', e => { e.preventDefault(); openStudio(); });

  // ── Home/back button — closes studio if visible ──
  const homeBtn = document.getElementById('btn-editor-home');
  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      const studio = document.getElementById('lora-studio-page');
      if (studio && studio.style.display !== 'none') closeStudio();
    }, true);
  }

  // ── Studio filter tabs ──
  document.querySelectorAll('.studio-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.studio-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _renderStudioCards();
    });
  });

  // ── New LoRA button → path selection modal ──
  const newLoraBtn = document.getElementById('btn-new-lora');
  if (newLoraBtn) newLoraBtn.addEventListener('click', _openPathModal);

  // ── Path modal close + card click ──
  document.getElementById('btn-path-close')?.addEventListener('click', _closePathModal);
  document.querySelectorAll('.lora-path-card').forEach(card => {
    card.addEventListener('click', () => _openInputModal(card.dataset.path));
  });
  document.getElementById('lora-path-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) _closePathModal();
  });

  // ── Input modal close ──
  document.getElementById('btn-input-close')?.addEventListener('click', () => _closeInputModal(true));
  document.getElementById('lora-input-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) _closeInputModal(true);
  });

  // ── Legacy wiring kept for V1 product / character tabs ──
  document.querySelectorAll('.library-tab').forEach(btn => {
    btn.addEventListener('click', () => switchLibraryTab(btn.dataset.tab));
  });

  const addBtn = document.getElementById('btn-add-product');
  if (addBtn) addBtn.addEventListener('click', addNewProduct);

  const addCharBtn = document.getElementById('btn-add-char-library');
  if (addCharBtn) addCharBtn.addEventListener('click', () => openCharacterCreationModal(null));

  const pickerBtn = document.getElementById('btn-select-product-lora');
  if (pickerBtn) pickerBtn.addEventListener('click', openProductPicker);

  // ── Training modal close button ──
  document.getElementById('btn-training-continue')?.addEventListener('click', _closeTrainingModal);
  document.getElementById('lora-training-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) _closeTrainingModal();
  });
  // Topbar pill click reopens modal for first in-progress item
  document.getElementById('topbar-training-pill')?.addEventListener('click', () => {
    const inProgress = getItems().find(i => i.loraStatus === 'training');
    if (inProgress) _openTrainingModal(inProgress.id);
  });

  // ── Phase 6: tuning panel wiring ──
  _wireTuningPanel();

  // ── Phase 5: review modal buttons ──
  document.getElementById('btn-review-close')?.addEventListener('click', _closeReviewModal);
  document.getElementById('lora-review-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) _closeReviewModal();
  });
  document.getElementById('btn-review-train')?.addEventListener('click', () => {
    const modal = document.getElementById('lora-review-modal');
    if (modal?.dataset.itemId) _onReviewConfirm(modal.dataset.itemId);
  });
  document.getElementById('btn-review-regenerate')?.addEventListener('click', () => {
    const modal = document.getElementById('lora-review-modal');
    if (modal?.dataset.itemId) _onReviewRegenerate(modal.dataset.itemId);
  });

  _initCharCreateModal();
  _resumePendingCharTraining();
  _resumePendingTrainingV2();  // V2 resume
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
  // ── Studio navigation (V2) ──────────────────────────────────────
  openStudio,
  closeStudio,
  renderStudio,
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
  // ── V2 unified API ──────────────────────────────────────────────
  // Read
  getItems,
  getItemById,
  // Write
  saveItem,
  deleteItem,
  // Training
  trainItemV2,
  // Voice
  _openVoicePicker,
  _openVoiceCloneModal,
};

// LoraStudio is the new name going forward; LoraLibrary remains for backward compat.
window.LoraStudio = window.LoraLibrary;

})();
