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

const PRODUCTS_KEY   = 'stori_lora_products_v1';
const FAL_KEY_LS     = 'stori_fal_api_key';
const IDB_DB_NAME    = 'stori_lora_photos';
const IDB_STORE_NAME = 'photos';
const IDB_VERSION    = 1;
const MIN_PHOTOS     = 5;
const MAX_PHOTOS     = 15;
const POLL_MS        = 15000;
const TRAIN_TIMEOUT  = 20 * 60 * 1000;

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

  _updateProduct(productId, { loraStatus: 'training', trainStarted: Date.now(), loraError: null, falRequestId: null });
  renderProductsTab();
  updateLaunchImageButton();

  try {
    const submission = await _falSubmit('fal-ai/flux-lora-fast-training', {
      images_data_url: photos,
      trigger_word: `PROD${productId.slice(-6).toUpperCase()}`,
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
      _updateProduct(productId, { loraStatus: 'ready', loraUrl, trainCompleted: Date.now(), falRequestId: null });
      renderProductsTab();
      renderStep4Products();
      updateLaunchImageButton();
      _showToast(`✅ ${productName || 'Product'} LoRA is ready — image generation unblocked`);
      return;
    }
    if (status.status === 'FAILED') throw new Error(status.error || 'Training failed on fal.ai');
  }
  throw new Error('LoRA training timed out (>20 min)');
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
  renderProductsTab();
}

function renderLibraryCharactersTab() {
  const el = document.getElementById('library-char-grid');
  if (!el) return;
  el.innerHTML = `<p class="text-sm text-muted" style="padding:12px 0;">
    Saved characters are available within each project via the
    <strong>📚 Library</strong> button in the Visual References step.
  </p>`;
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
    statusHtml = `<div class="lora-status lora-status--ready"><span class="lora-ready-badge">✅ LoRA Ready</span></div>`;
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

// ── Generation blocking ───────────────────────────────────────────
function isLoraBlocking() {
  const selected = getSelectedProductIds();
  if (!selected.length) return false;
  const products = getProducts();
  return selected.some(id => {
    const p = products.find(pr => pr.id === id);
    return p && p.loraStatus !== 'ready';
  });
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
      const products = getProducts();
      const pending = getSelectedProductIds()
        .map(id => products.find(p => p.id === id))
        .filter(p => p && p.loraStatus !== 'ready')
        .map(p => p.name || 'Product');
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

  const pickerBtn = document.getElementById('btn-select-product-lora');
  if (pickerBtn) pickerBtn.addEventListener('click', openProductPicker);

  initFalKeyInput();
  initReplicateKeyInput();
  _resumePendingTraining();
  renderStep4Products();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init);
} else {
  _init();
}

window.LoraLibrary = {
  openLibraryPage,
  renderProductsTab,
  renderStep4Products,
  updateLaunchImageButton,
  isLoraBlocking,
  getProducts,
  getSelectedProductIds,
  getFalKey,
  trainProductLora,
};

})();
