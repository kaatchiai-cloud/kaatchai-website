// ══════════════════════════════════════════
//  CREATE CONTENT — Visual Cast References
// ══════════════════════════════════════════

// ── Visual References: Characters & Environments ──
const charCardsEl = $('character-cards');
const envCardsEl = $('environment-cards');
const charImgInput = $('char-img-input');
const envImgInput = $('env-img-input');
const btnAddChar = $('btn-add-character');
const btnAddEnv = $('btn-add-environment');
let pendingRefType = null; // 'char' or 'env'
let pendingRefCardId = null;

function getMaxRefs() { return 3; }

function renderCharacterCards() {
  if (!charCardsEl) return;
  const max = getMaxRefs();
  const countLabel = $('char-count-label');
  if (countLabel) countLabel.textContent = `${storyCharacters.length}/${max}`;
  if (btnAddChar) btnAddChar.style.display = storyCharacters.length >= max ? 'none' : '';

  charCardsEl.innerHTML = storyCharacters.map(ch => `
    <div class="ref-card" data-char-id="${ch.id}">
      <button class="ref-card-remove" data-remove-char="${ch.id}">×</button>
      ${ch.imgDataUrl
        ? `<img src="${ch.imgDataUrl}" alt="${ch.name}">`
        : `<div class="ref-card-placeholder" data-upload-char="${ch.id}">Click to upload illustration</div>`}
      <input type="text" class="char-name" value="${ch.name || ''}" placeholder="Name (e.g. Priya)">
      <textarea class="char-desc" placeholder="Description (e.g. 8yr girl, brown hair, red dress)">${ch.description || ''}</textarea>
      ${!ch.imgDataUrl ? `<button class="char-upload-btn" data-upload-char="${ch.id}" style="font-size:0.65rem; padding:2px 8px; width:100%;">📷 Upload Image</button>` : `<button class="char-upload-btn" data-upload-char="${ch.id}" style="font-size:0.65rem; padding:2px 8px; width:100%;">🔄 Change Image</button>`}
      ${ch.imgDataUrl && !ch.description ? `<button class="char-describe-btn" data-describe-char="${ch.id}" style="font-size:0.65rem; padding:2px 8px; width:100%; margin-top:2px;">🤖 Auto-Describe</button>` : ''}
    </div>
  `).join('');

  // Wire events
  charCardsEl.querySelectorAll('.ref-card-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      storyCharacters = storyCharacters.filter(c => c.id !== parseInt(btn.dataset.removeChar));
      renderCharacterCards(); renderSceneAssignments();
    });
  });
  charCardsEl.querySelectorAll('[data-upload-char]').forEach(el => {
    el.addEventListener('click', () => {
      pendingRefType = 'char';
      pendingRefCardId = parseInt(el.dataset.uploadChar);
      charImgInput.click();
    });
  });
  charCardsEl.querySelectorAll('.char-name').forEach((input, i) => {
    input.addEventListener('change', () => { storyCharacters[i].name = input.value; renderSceneAssignments(); });
  });
  charCardsEl.querySelectorAll('.char-desc').forEach((ta, i) => {
    ta.addEventListener('change', () => { storyCharacters[i].description = ta.value; });
  });
  charCardsEl.querySelectorAll('.char-describe-btn').forEach(btn => {
    btn.addEventListener('click', () => autoDescribeRef('char', parseInt(btn.dataset.describeChar)));
  });
}

function renderEnvironmentCards() {
  if (!envCardsEl) return;
  const max = getMaxRefs();
  const countLabel = $('env-count-label');
  if (countLabel) countLabel.textContent = `${storyEnvironments.length}/${max}`;
  if (btnAddEnv) btnAddEnv.style.display = storyEnvironments.length >= max ? 'none' : '';

  envCardsEl.innerHTML = storyEnvironments.map(env => `
    <div class="ref-card" data-env-id="${env.id}">
      <button class="ref-card-remove" data-remove-env="${env.id}">×</button>
      ${env.imgDataUrl
        ? `<img src="${env.imgDataUrl}" alt="${env.name}">`
        : `<div class="ref-card-placeholder" data-upload-env="${env.id}">Click to upload image</div>`}
      <input type="text" class="env-name" value="${env.name || ''}" placeholder="Name (e.g. Forest)">
      <textarea class="env-desc" placeholder="Description (e.g. dense tropical forest, misty)">${env.description || ''}</textarea>
      ${!env.imgDataUrl ? `<button class="env-upload-btn" data-upload-env="${env.id}" style="font-size:0.65rem; padding:2px 8px; width:100%;">📷 Upload Image</button>` : `<button class="env-upload-btn" data-upload-env="${env.id}" style="font-size:0.65rem; padding:2px 8px; width:100%;">🔄 Change Image</button>`}
      ${env.imgDataUrl && !env.description ? `<button class="env-describe-btn" data-describe-env="${env.id}" style="font-size:0.65rem; padding:2px 8px; width:100%; margin-top:2px;">🤖 Auto-Describe</button>` : ''}
    </div>
  `).join('');

  envCardsEl.querySelectorAll('.ref-card-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      storyEnvironments = storyEnvironments.filter(e => e.id !== parseInt(btn.dataset.removeEnv));
      renderEnvironmentCards(); renderSceneAssignments();
    });
  });
  envCardsEl.querySelectorAll('[data-upload-env]').forEach(el => {
    el.addEventListener('click', () => {
      pendingRefType = 'env';
      pendingRefCardId = parseInt(el.dataset.uploadEnv);
      envImgInput.click();
    });
  });
  envCardsEl.querySelectorAll('.env-name').forEach((input, i) => {
    input.addEventListener('change', () => { storyEnvironments[i].name = input.value; renderSceneAssignments(); });
  });
  envCardsEl.querySelectorAll('.env-desc').forEach((ta, i) => {
    ta.addEventListener('change', () => { storyEnvironments[i].description = ta.value; });
  });
  envCardsEl.querySelectorAll('.env-describe-btn').forEach(btn => {
    btn.addEventListener('click', () => autoDescribeRef('env', parseInt(btn.dataset.describeEnv)));
  });
}

// Auto-describe image using Gemini Vision
async function autoDescribeRef(type, id) {
  const key = getCreateGeminiKey();
  if (!key) return;
  const item = type === 'char'
    ? storyCharacters.find(c => c.id === id)
    : storyEnvironments.find(e => e.id === id);
  if (!item || !item.imgDataUrl) return;

  const match = item.imgDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return;

  const prompt = type === 'char'
    ? 'Describe this character/person in detail for an AI image generator: age, gender, hair style and color, clothing, distinguishing features, expression. Be specific and concise in 2-3 sentences. Output only the description.'
    : 'Describe this environment/location in detail for an AI image generator: setting type, lighting, atmosphere, key elements, colors, time of day. Be specific and concise in 2-3 sentences. Output only the description.';

  try {
    const body = {
      contents: [{ parts: [
        { inlineData: { mimeType: match[1], data: match[2] } },
        { text: prompt }
      ]}]
    };
    const data = await callGeminiAPI(getTranscriptionModels(), body);
    const desc = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (desc) {
      trackCost('visionDescribe', 1);
      item.description = desc;
      if (type === 'char') renderCharacterCards();
      else renderEnvironmentCards();
     
    }
  } catch(e) {
    console.warn('Auto-describe failed:', e.message);
  }
}

// Handle image upload for character/environment
function handleRefImageUpload(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      if (pendingRefType === 'char') {
        const ch = storyCharacters.find(c => c.id === pendingRefCardId);
        if (ch) { ch.imgDataUrl = e.target.result; ch.imgEl = img; }
        renderCharacterCards();
      } else {
        const env = storyEnvironments.find(en => en.id === pendingRefCardId);
        if (env) { env.imgDataUrl = e.target.result; env.imgEl = img; }
        renderEnvironmentCards();
      }
      renderSceneAssignments();
     
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

if (charImgInput) charImgInput.addEventListener('change', () => handleRefImageUpload(charImgInput));
if (envImgInput) envImgInput.addEventListener('change', () => handleRefImageUpload(envImgInput));

if (btnAddChar) btnAddChar.addEventListener('click', () => {
  if (storyCharacters.length >= getMaxRefs()) {
    return;
  }
  storyCharacters.push({ id: nextCharId++, name: '', description: '', imgDataUrl: null, imgEl: null });
  renderCharacterCards(); renderSceneAssignments();
});

if (btnAddEnv) btnAddEnv.addEventListener('click', () => {
  if (storyEnvironments.length >= getMaxRefs()) {
    return;
  }
  storyEnvironments.push({ id: nextEnvId++, name: '', description: '', imgDataUrl: null, imgEl: null });
  renderEnvironmentCards(); renderSceneAssignments();
});

// Per-scene reference assignments
function renderSceneAssignments() {
  const container = $('scene-assignment-list');
  const wrapper = $('scene-ref-assignments');
  if (!container || !wrapper) return;

  if (!createScenes || createScenes.length === 0 || (storyCharacters.length === 0 && storyEnvironments.length === 0)) {
    wrapper.style.display = 'none';
    return;
  }
  wrapper.style.display = '';

  container.innerHTML = createScenes.map((scene, idx) => {
    // Initialize scene refs if not set
    if (!scene.refCharacters) scene.refCharacters = [];
    if (scene.refEnvironment === undefined) scene.refEnvironment = -1;

    const charTicks = storyCharacters.map(ch => {
      const tickOrder = scene.refCharacters.indexOf(ch.id);
      const checked = tickOrder >= 0;
      const tickClass = checked ? `ticked-${Math.min(tickOrder, 2)}` : '';
      const roleLabel = tickOrder === 0 ? ' (main)' : tickOrder === 1 ? ' (aux1)' : tickOrder === 2 ? ' (aux2)' : '';
      return `<label class="char-tick ${tickClass}">
        <input type="checkbox" data-scene="${idx}" data-char="${ch.id}" ${checked ? 'checked' : ''}>
        ${ch.name || 'Unnamed'}${roleLabel}
      </label>`;
    }).join('');

    const envOptions = `<option value="-1">None</option>` +
      storyEnvironments.map(env =>
        `<option value="${env.id}" ${scene.refEnvironment === env.id ? 'selected' : ''}>${env.name || 'Unnamed'}</option>`
      ).join('');

    return `<div class="scene-assign-row">
      <span style="font-weight:600; color:var(--accent); min-width:20px;">${idx + 1}</span>
      <span class="scene-assign-text">${scene.text || scene.prompt}</span>
      <div class="scene-assign-chars">${charTicks}</div>
      <select data-scene-env="${idx}">${envOptions}</select>
    </div>`;
  }).join('');

  // Wire character tick handlers
  container.querySelectorAll('input[data-char]').forEach(cb => {
    cb.addEventListener('change', () => {
      const sceneIdx = parseInt(cb.dataset.scene);
      const charId = parseInt(cb.dataset.char);
      const scene = createScenes[sceneIdx];
      if (!scene.refCharacters) scene.refCharacters = [];
      if (cb.checked) {
        if (!scene.refCharacters.includes(charId)) scene.refCharacters.push(charId);
      } else {
        scene.refCharacters = scene.refCharacters.filter(id => id !== charId);
      }
      renderSceneAssignments();
     
    });
  });

  // Wire environment dropdown handlers
  container.querySelectorAll('select[data-scene-env]').forEach(sel => {
    sel.addEventListener('change', () => {
      const sceneIdx = parseInt(sel.dataset.sceneEnv);
      createScenes[sceneIdx].refEnvironment = parseInt(sel.value);
     
    });
  });
}

// Build prompt with references for image generation
function buildScenePromptWithRefs(scene, basePrompt) {
  let prompt = '';
  if (createStylePrompt) prompt += `Style: ${createStylePrompt}. `;

  // Environment
  if (scene.refEnvironment >= 0) {
    const env = storyEnvironments.find(e => e.id === scene.refEnvironment);
    if (env && env.description) prompt += `Setting: ${env.description}. `;
  }

  // Characters in tick order
  if (scene.refCharacters && scene.refCharacters.length > 0) {
    const charDescs = scene.refCharacters.map((charId, i) => {
      const ch = storyCharacters.find(c => c.id === charId);
      if (!ch) return '';
      const role = i === 0 ? 'Main character' : `Supporting character ${i}`;
      return `${role}: ${ch.name || 'unnamed'} — ${ch.description || 'no description'}`;
    }).filter(Boolean);
    if (charDescs.length > 0) {
      prompt += `Characters available in this scene: ${charDescs.join('. ')}. `;
      prompt += `Based on the scene description, include only the characters that are relevant and naturally present. `;
    }
  }

  prompt += `Scene: ${basePrompt}`;
  return prompt;
}

// Get reference images for API call (inline data parts)
function getSceneRefImageParts(scene) {
  const parts = [];
  // Character reference images
  if (scene.refCharacters) {
    for (const charId of scene.refCharacters) {
      const ch = storyCharacters.find(c => c.id === charId);
      if (ch && ch.imgDataUrl) {
        const match = ch.imgDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (match) {
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          parts.push({ text: `Reference image for character: ${ch.name || 'unnamed'}` });
        }
      }
    }
  }
  // Environment reference image
  if (scene.refEnvironment >= 0) {
    const env = storyEnvironments.find(e => e.id === scene.refEnvironment);
    if (env && env.imgDataUrl) {
      const match = env.imgDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (match) {
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        parts.push({ text: `Reference image for environment: ${env.name || 'unnamed'}` });
      }
    }
  }
  return parts;
}

// ════════════════════════════════════════════════════════════════════════════
//  CAST UPFRONT FLOW — defined before storyboard generation
//  Owns: createJobState.characters, createJobState.locations
//  Mirrors locked refs to legacy storyCharacters / storyEnvironments so
//  existing buildScenePromptWithRefs and getSceneRefImageParts keep working.
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
//  STEP 0 — Video Type Lock (Brand / Film / Narration)
//  Drives visibility of Step 1 (Input & Template) and the cast section mode.
// ════════════════════════════════════════════════════════════════════════════

(function initVideoTypeStep() {
  if (!window.createJobState) window.createJobState = {};

  function _getInputStep() { return document.getElementById('create-input-step'); }
  function _getTypeStep() { return document.getElementById('create-video-type-step'); }

  function _applyTypeVisibility() {
    const t = window.createJobState.videoType;
    const locked = !!window.createJobState.videoTypeLocked;
    const inputStep = _getInputStep();
    const typeStep = _getTypeStep();
    if (inputStep) inputStep.style.display = (locked && t) ? '' : 'none';
    // Cast / brand / narration sections
    const castFilm = document.getElementById('cast-setup-card');
    const castBrand = document.getElementById('brand-setup-card');
    const castNarr = document.getElementById('narration-notice');
    if (castFilm) castFilm.style.display = (locked && t === 'film') ? '' : 'none';
    if (castBrand) castBrand.style.display = (locked && t === 'brand') ? '' : 'none';
    if (castNarr) castNarr.style.display = (locked && t === 'narration') ? '' : 'none';
    // Lock-card vs picker visibility
    const cards = document.getElementById('vtype-cards');
    const actionRow = document.querySelector('#create-video-type-step .vtype-action-row');
    const lockedRow = document.getElementById('vtype-locked-row');
    if (cards) cards.style.display = locked ? 'none' : '';
    if (actionRow) actionRow.style.display = locked ? 'none' : '';
    if (lockedRow) lockedRow.style.display = locked ? 'flex' : 'none';
    if (locked && t) {
      const icon = document.getElementById('vtype-locked-icon');
      const name = document.getElementById('vtype-locked-name');
      const map = { brand: { i: '🎁', n: 'Brand / Product' }, film: { i: '🎬', n: 'Film / Story' }, narration: { i: '🎙️', n: 'Narration' } };
      if (icon && map[t]) icon.textContent = map[t].i;
      if (name && map[t]) name.textContent = map[t].n;
    }
    if (typeof updateCreateButtons === 'function') updateCreateButtons();
  }

  function _wirePicker() {
    const cards = document.querySelectorAll('#vtype-cards .vtype-card');
    let pending = null;
    cards.forEach(card => {
      if (card._wired) return;
      card._wired = true;
      card.addEventListener('click', () => {
        cards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        pending = card.dataset.type;
        const lbl = document.getElementById('vtype-selected-label');
        if (lbl) {
          const names = { brand: 'Brand / Product', film: 'Film / Story', narration: 'Narration' };
          lbl.textContent = 'Selected: ' + names[pending];
        }
        const lockBtn = document.getElementById('btn-vtype-lock');
        if (lockBtn) lockBtn.disabled = false;
      });
    });

    const lockBtn = document.getElementById('btn-vtype-lock');
    if (lockBtn && !lockBtn._wired) {
      lockBtn._wired = true;
      lockBtn.addEventListener('click', () => {
        if (!pending) return;
        window.createJobState.videoType = pending;
        window.createJobState.videoTypeLocked = true;
        // Reset active tab so it picks the right default for the new mode
        const panel = document.getElementById('create-refs-panel');
        if (panel) delete panel.dataset.activeTab;
        _applyTypeVisibility();
        if (pending === 'film' && typeof window.castRenderRows === 'function') window.castRenderRows();
        if (pending === 'brand' && typeof window.brandRenderSlots === 'function') window.brandRenderSlots();
        if (typeof window.renderRefsPanel === 'function') window.renderRefsPanel('timeline');
        if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
      });
    }

    const changeBtn = document.getElementById('btn-vtype-change');
    if (changeBtn && !changeBtn._wired) {
      changeBtn._wired = true;
      changeBtn.addEventListener('click', () => {
        // Confirm if any locked items exist
        const chars = (window.createJobState.characters || []).filter(c => c.locked);
        const locs = (window.createJobState.locations || []).filter(l => l.locked);
        const product = window.createJobState.product;
        const presenter = window.createJobState.presenter;
        const setting = window.createJobState.setting;
        const lockedCount = chars.length + locs.length
          + (product && product.locked ? 1 : 0)
          + (presenter && presenter.locked ? 1 : 0)
          + (setting && setting.locked ? 1 : 0);
        if (lockedCount > 0) {
          if (!confirm(`Switching video type will discard ${lockedCount} locked item(s). Continue?`)) return;
          // Wipe type-specific data
          window.createJobState.characters = [];
          window.createJobState.locations = [];
          window.createJobState.product = null;
          window.createJobState.presenter = null;
          window.createJobState.setting = null;
        }
        window.createJobState.videoTypeLocked = false;
        // Keep videoType so the picker can highlight it
        const t = window.createJobState.videoType;
        const panel = document.getElementById('create-refs-panel');
        if (panel) delete panel.dataset.activeTab;
        _applyTypeVisibility();
        if (typeof window.renderRefsPanel === 'function') window.renderRefsPanel('timeline');
        if (t) {
          const cards = document.querySelectorAll('#vtype-cards .vtype-card');
          cards.forEach(c => c.classList.toggle('selected', c.dataset.type === t));
          const lockBtn = document.getElementById('btn-vtype-lock');
          if (lockBtn) lockBtn.disabled = false;
        }
        if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
      });
    }
  }

  function _init() {
    _wirePicker();
    _applyTypeVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  // Public — re-render on demand (e.g., after handoff)
  window.applyVideoTypeVisibility = _applyTypeVisibility;
})();

(function initCastSetup() {
  if (!window.createJobState) window.createJobState = {};
  if (!Array.isArray(window.createJobState.characters)) window.createJobState.characters = [];
  if (!Array.isArray(window.createJobState.locations)) window.createJobState.locations = [];
  let _castNextId = 1;
  let _pendingUploadType = null;  // 'char' | 'loc'
  let _pendingUploadId = null;

  function castNextId(prefix) { return `${prefix}_${Date.now().toString(36)}_${(_castNextId++).toString(36)}`; }

  // Public — count of locked entities across all modes (for style-change warnings)
  window.castLockedCount = function () {
    const cs = (window.createJobState.characters || []).filter(c => c.locked).length;
    const ls = (window.createJobState.locations || []).filter(l => l.locked).length;
    const p = (window.createJobState.product && window.createJobState.product.locked) ? 1 : 0;
    const pr = (window.createJobState.presenter && window.createJobState.presenter.locked) ? 1 : 0;
    const st = (window.createJobState.setting && window.createJobState.setting.locked) ? 1 : 0;
    return cs + ls + p + pr + st;
  };

  // Public — called after user confirms a style change. Unlocks all entities,
  // marks each with needsRegen = true, clears representative images so they
  // get re-generated against the new style.
  window.castConfirmStyleChange = function () {
    const items = [];
    (window.createJobState.characters || []).forEach(c => items.push(c));
    (window.createJobState.locations || []).forEach(l => items.push(l));
    if (window.createJobState.product) items.push(window.createJobState.product);
    if (window.createJobState.presenter) items.push(window.createJobState.presenter);
    if (window.createJobState.setting) items.push(window.createJobState.setting);
    for (const it of items) {
      if (!it) continue;
      if (it.locked) {
        it.locked = false;
        it.needsRegen = true;
      }
      // Clear the rendered image; sheet retained for fast regen
      it.representativeImageDataUrl = null;
    }
    // Unset the project-level style lock; will reset on next lock
    window.createJobState.styleLocked = false;
    if (typeof window._castSyncToLegacy === 'function') window._castSyncToLegacy();
    if (typeof window.castRenderRows === 'function') window.castRenderRows();
    if (typeof window.brandRenderSlots === 'function') window.brandRenderSlots();
    if (typeof window.renderRefsPanel === 'function') window.renderRefsPanel('timeline');
    if (typeof updateCreateButtons === 'function') updateCreateButtons();
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
  };

  // Public — used by 17a updateCreateButtons to gate the launch button.
  window.castAllLocked = function () {
    const t = (window.createJobState && window.createJobState.videoType) || null;
    const typeLocked = !!(window.createJobState && window.createJobState.videoTypeLocked);
    if (!typeLocked || !t) return false;  // type must be locked first
    if (t === 'narration') return true;   // no cast required
    if (t === 'brand') {
      const product = window.createJobState.product;
      const presenter = window.createJobState.presenter;
      const setting = window.createJobState.setting;
      if (!product) return false;          // product is required for brand
      if (!product.locked) return false;
      if (presenter && !presenter.locked) return false;
      if (setting && !setting.locked) return false;
      return true;
    }
    // film
    const cs = window.createJobState.characters || [];
    const ls = window.createJobState.locations || [];
    if (cs.length === 0 && ls.length === 0) return true;
    return cs.every(c => c.locked) && ls.every(l => l.locked);
  };

  // Mirror locked refs to legacy globals so existing image-gen flow still works.
  function _syncToLegacy() {
    const chars = (window.createJobState.characters || []).filter(c => c.locked).map(c => ({
      id: c.id,
      name: c.name,
      description: c.appearanceSheet || c.userDescription || '',
      imgDataUrl: c.representativeImageDataUrl || c.uploadedImageDataUrl || null,
      imgEl: null,
    }));
    // Brand mode: presenter is treated as a character ref
    const presenter = window.createJobState.presenter;
    if (presenter && presenter.locked) {
      chars.push({
        id: presenter.id,
        name: presenter.name,
        description: presenter.appearanceSheet || presenter.userDescription || '',
        imgDataUrl: presenter.representativeImageDataUrl || presenter.uploadedImageDataUrl || null,
        imgEl: null,
      });
    }
    // Brand mode: product is treated as a character ref (with hero-shot phrasing)
    const product = window.createJobState.product;
    if (product && product.locked) {
      chars.push({
        id: product.id,
        name: product.name,
        description: 'Featured product, hero shot. ' + (product.appearanceSheet || product.userDescription || ''),
        imgDataUrl: product.representativeImageDataUrl || product.uploadedImageDataUrl || null,
        imgEl: null,
      });
    }
    storyCharacters = chars;

    const locs = (window.createJobState.locations || []).filter(l => l.locked).map(l => ({
      id: l.id,
      name: l.name,
      description: l.appearanceSheet || l.userDescription || '',
      imgDataUrl: l.representativeImageDataUrl || l.uploadedImageDataUrl || null,
      imgEl: null,
    }));
    // Brand mode: setting becomes the environment
    const setting = window.createJobState.setting;
    if (setting && setting.locked) {
      locs.push({
        id: setting.id,
        name: setting.name,
        description: setting.appearanceSheet || setting.userDescription || '',
        imgDataUrl: setting.representativeImageDataUrl || setting.uploadedImageDataUrl || null,
        imgEl: null,
      });
    }
    storyEnvironments = locs;
  }
  window._castSyncToLegacy = _syncToLegacy;

  // Combined cap enforcement (6 total)
  function _enforceCap() {
    const charSel = document.getElementById('cast-char-count');
    const locSel = document.getElementById('cast-loc-count');
    if (!charSel || !locSel) return;
    const c = parseInt(charSel.value, 10) || 0;
    const l = parseInt(locSel.value, 10) || 0;
    const total = c + l;
    const hint = document.getElementById('cast-cap-hint');
    if (hint) hint.textContent = total > 6 ? `Cap exceeded: ${total}/6` : `Combined max: 6 (using ${total})`;
  }

  // Render a single character/location row card.
  function _renderRowCard(item, type) {
    const isChar = type === 'character';
    const isLocked = !!item.locked;
    if (isLocked) {
      // Compact locked card
      return `<div class="cast-row cast-row-locked" data-id="${item.id}" data-type="${type}">
        <div class="cast-row-thumb">
          ${item.representativeImageDataUrl ? `<img src="${item.representativeImageDataUrl}" alt="">` : '<div class="cast-row-thumb-empty">no img</div>'}
        </div>
        <div class="cast-row-meta">
          <div class="cast-row-name">${escapeHtml(item.name)} <span class="cast-row-locked-badge">🔒 Locked</span></div>
          <div class="cast-row-sub">${isChar ? (item.ageRange ? item.ageRange + ' · ' : '') : ''}${escapeHtml((item.appearanceSheet || '').slice(0, 80))}${(item.appearanceSheet || '').length > 80 ? '…' : ''}</div>
        </div>
        <div class="cast-row-actions">
          <button class="btn-xs cast-unlock-btn" data-action="unlock">🔓 Unlock</button>
        </div>
      </div>`;
    }
    // Editable / review state
    const hasSheet = !!item.appearanceSheet;
    const hasImage = !!item.representativeImageDataUrl;
    const isGenerating = !!item._generating;
    const needsRegen = !!item.needsRegen;
    return `<div class="cast-row${needsRegen ? ' cast-row-needs-regen' : ''}" data-id="${item.id}" data-type="${type}">
      <div class="cast-row-thumb">
        ${hasImage ? `<img src="${item.representativeImageDataUrl}" alt="">`
          : item.uploadedImageDataUrl ? `<img src="${item.uploadedImageDataUrl}" alt="" class="cast-row-thumb-pending">`
          : '<div class="cast-row-thumb-empty">no img</div>'}
        ${isGenerating ? '<div class="cast-row-thumb-spinner"></div>' : ''}
      </div>
      <div class="cast-row-fields">
        <input type="text" class="cast-row-name-input" placeholder="${isChar ? 'Character name (e.g. Maya)' : 'Location name (e.g. Kitchen)'}" value="${escapeHtml(item.name)}" data-field="name">
        <textarea class="cast-row-desc-input" rows="2" placeholder="${isChar ? 'Description (e.g. 8 yrs old, curly black hair, red dress)' : 'Description (e.g. 1970s kitchen, yellow walls, vintage stove)'}" data-field="userDescription">${escapeHtml(item.userDescription || '')}</textarea>
        ${hasSheet ? `<div class="cast-row-sheet"><strong>Appearance:</strong> ${escapeHtml(item.appearanceSheet)}</div>` : ''}
        ${needsRegen ? '<div class="cast-row-regen-badge">⚠ Style changed — regenerate image to lock</div>' : ''}
      </div>
      <div class="cast-row-actions">
        <button class="btn-xs cast-upload-btn" data-action="upload">${item.uploadedImageDataUrl ? '🔄 Change ref' : '📎 Upload ref'}</button>
        ${hasSheet ? `<button class="btn-xs cast-regen-img-btn" data-action="regen-image" ${isGenerating ? 'disabled' : ''}>🎨 Regen image</button>` : ''}
        ${hasSheet && hasImage ? `<button class="btn-xs primary cast-lock-btn" data-action="lock">🔒 Lock</button>` : ''}
      </div>
    </div>`;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderCastRows() {
    const charContainer = document.getElementById('cast-char-rows');
    const locContainer = document.getElementById('cast-loc-rows');
    const actionRow = document.getElementById('cast-action-row');
    if (!charContainer || !locContainer) return;

    const chars = window.createJobState.characters || [];
    const locs = window.createJobState.locations || [];
    charContainer.innerHTML = chars.map(c => _renderRowCard(c, 'character')).join('');
    locContainer.innerHTML = locs.map(l => _renderRowCard(l, 'location')).join('');

    // Show action row only if there's at least one editable row needing AI generation
    const anyNeedsGen = chars.some(c => !c.locked && !c.appearanceSheet) || locs.some(l => !l.locked && !l.appearanceSheet);
    if (actionRow) actionRow.style.display = (chars.length + locs.length > 0 && anyNeedsGen) ? '' : 'none';

    _wireRowEvents();
    _updateGenerateButton();
    if (typeof updateCreateButtons === 'function') updateCreateButtons();
    if (typeof window.renderRefsPanel === 'function') window.renderRefsPanel('timeline');
  }

  window.castRenderRows = renderCastRows;

  function _wireRowEvents() {
    document.querySelectorAll('#cast-char-rows .cast-row, #cast-loc-rows .cast-row').forEach(rowEl => {
      const id = rowEl.dataset.id;
      const type = rowEl.dataset.type;
      const list = type === 'character' ? window.createJobState.characters : window.createJobState.locations;
      const item = list.find(x => x.id === id);
      if (!item) return;

      rowEl.querySelectorAll('input[data-field], textarea[data-field]').forEach(field => {
        field.addEventListener('input', () => {
          item[field.dataset.field] = field.value;
          _updateGenerateButton();
        });
      });

      rowEl.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          if (action === 'upload') {
            _pendingUploadType = type === 'character' ? 'char' : 'loc';
            _pendingUploadId = id;
            const input = document.getElementById('cast-img-upload');
            if (input) input.click();
          } else if (action === 'regen-image') {
            _regenImage(item, type);
          } else if (action === 'lock') {
            _lockItem(item, type);
          } else if (action === 'unlock') {
            _unlockItem(item, type);
          }
        });
      });
    });
  }

  // File-upload wiring
  function _wireUploadInput() {
    const input = document.getElementById('cast-img-upload');
    if (!input || input._castWired) return;
    input._castWired = true;
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result;
        const type = _pendingUploadType === 'char' ? 'character' : 'location';
        const list = type === 'character' ? window.createJobState.characters : window.createJobState.locations;
        const item = list.find(x => x.id === _pendingUploadId);
        if (item) {
          item.uploadedImageDataUrl = dataUrl;
          // If description is empty, auto-caption (per chosen default).
          if (!item.userDescription && typeof window.autoCaptionFromImage === 'function') {
            item._captioning = true;
            renderCastRows();
            try {
              const cap = await window.autoCaptionFromImage(dataUrl, type, getCreateGeminiKey());
              if (cap) item.userDescription = cap;
            } catch (e) { /* swallow */ }
            item._captioning = false;
          }
          renderCastRows();
        }
        input.value = '';
      };
      reader.readAsDataURL(file);
    });
  }

  // Update Generate button state
  function _updateGenerateButton() {
    const btn = document.getElementById('btn-cast-generate');
    const hint = document.getElementById('cast-action-hint');
    if (!btn) return;
    const chars = window.createJobState.characters || [];
    const locs = window.createJobState.locations || [];
    const all = [...chars, ...locs];
    const editable = all.filter(x => !x.locked && !x.appearanceSheet);
    const valid = editable.length > 0 && editable.every(x => (x.name || '').trim() && (x.userDescription || '').trim());
    btn.disabled = !valid;
    if (hint) hint.textContent = valid ? 'Click to generate canonical appearances and reference images.' : 'Fill all names and descriptions to enable.';
  }

  // Generate appearance for one item (text + image)
  async function _generateOne(item, type) {
    const key = getCreateGeminiKey();
    if (!key) throw new Error('Gemini API key required');
    item._generating = true;
    renderCastRows();
    try {
      // Step 1: appearance sheet
      const sheet = await window.generateAppearanceSheet(item, type, key);
      item.appearanceSheet = sheet.appearance;
      item.distinctiveTraits = sheet.distinctiveTraits || [];
      item.ageRange = sheet.ageRange || '';
      item.build = sheet.build || '';
      // Step 2: representative image
      const imgUrl = await window.generateRepresentativeImage(item, type, key);
      item.representativeImageDataUrl = imgUrl;
    } catch (e) {
      console.warn('[cast generate] failed for', item.name, e.message);
      item._generateError = e.message;
    } finally {
      item._generating = false;
      renderCastRows();
    }
  }

  async function _regenImage(item, type) {
    const key = getCreateGeminiKey();
    if (!key) return;
    item._generating = true;
    renderCastRows();
    try {
      const imgUrl = await window.generateRepresentativeImage(item, type, key);
      item.representativeImageDataUrl = imgUrl;
    } catch (e) {
      console.warn('[cast regen] failed:', e.message);
    } finally {
      item._generating = false;
      renderCastRows();
    }
  }

  function _lockItem(item, type) {
    // Name-collision check
    const list = type === 'character' ? window.createJobState.characters : window.createJobState.locations;
    const collision = list.some(x => x.id !== item.id && x.locked && (x.name || '').trim().toLowerCase() === (item.name || '').trim().toLowerCase());
    if (collision) {
      alert(`Another ${type} is already named "${item.name}". Rename one of them before locking.`);
      return;
    }
    if (!item.appearanceSheet || !item.representativeImageDataUrl) {
      alert('Generate appearance and image before locking.');
      return;
    }
    item.locked = true;
    item.lockedAt = new Date().toISOString();
    item.needsRegen = false;
    // First lock in the project soft-locks the style
    if (!window.createJobState.styleLocked) window.createJobState.styleLocked = true;
    _syncToLegacy();
    renderCastRows();
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
  }

  function _unlockItem(item, type) {
    const sceneCount = (typeof createScenes !== 'undefined' && Array.isArray(createScenes))
      ? createScenes.filter(s => (s.refCharacters || []).includes(item.id) || s.refEnvironment === item.id).length
      : 0;
    if (sceneCount > 0) {
      if (!confirm(`Unlocking "${item.name}" will mark ${sceneCount} scene(s) as needing regen. Continue?`)) return;
    }
    item.locked = false;
    _syncToLegacy();
    renderCastRows();
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
  }

  // Sync rows to count selectors
  function _syncCountsToList() {
    const charSel = document.getElementById('cast-char-count');
    const locSel = document.getElementById('cast-loc-count');
    if (!charSel || !locSel) return;
    const targetChars = parseInt(charSel.value, 10) || 0;
    const targetLocs = parseInt(locSel.value, 10) || 0;
    // Combined cap
    if (targetChars + targetLocs > 6) {
      // Clamp the just-changed selector — let the other one win
      const total = targetChars + targetLocs;
      const overage = total - 6;
      // Clamp via natural reduction below; here we just warn
    }

    const chars = window.createJobState.characters || [];
    const locs = window.createJobState.locations || [];
    // Add or remove characters
    while (chars.length < targetChars) {
      chars.push({
        id: castNextId('char'),
        name: '',
        userDescription: '',
        uploadedImageDataUrl: null,
        appearanceSheet: '',
        distinctiveTraits: [],
        ageRange: '',
        build: '',
        representativeImageDataUrl: null,
        locked: false,
        libraryId: null,
        createdAt: new Date().toISOString(),
      });
    }
    while (chars.length > targetChars) {
      // Remove from the end, but only if not locked
      const lastUnlockedIdx = (() => {
        for (let i = chars.length - 1; i >= 0; i--) if (!chars[i].locked) return i;
        return -1;
      })();
      if (lastUnlockedIdx === -1) break;
      chars.splice(lastUnlockedIdx, 1);
    }
    while (locs.length < targetLocs) {
      locs.push({
        id: castNextId('loc'),
        name: '',
        userDescription: '',
        uploadedImageDataUrl: null,
        appearanceSheet: '',
        distinctiveTraits: [],
        ageRange: '',
        build: '',
        representativeImageDataUrl: null,
        locked: false,
        libraryId: null,
        createdAt: new Date().toISOString(),
      });
    }
    while (locs.length > targetLocs) {
      const lastUnlockedIdx = (() => {
        for (let i = locs.length - 1; i >= 0; i--) if (!locs[i].locked) return i;
        return -1;
      })();
      if (lastUnlockedIdx === -1) break;
      locs.splice(lastUnlockedIdx, 1);
    }
    _enforceCap();
    renderCastRows();
  }

  // Wire static handlers once on load
  function _initStatic() {
    const charSel = document.getElementById('cast-char-count');
    const locSel = document.getElementById('cast-loc-count');
    const genBtn = document.getElementById('btn-cast-generate');
    const card = document.getElementById('cast-setup-card');
    if (charSel && !charSel._wired) {
      charSel._wired = true;
      charSel.addEventListener('change', () => {
        const total = (parseInt(charSel.value, 10) || 0) + (parseInt(locSel.value, 10) || 0);
        if (total > 6) {
          const otherMax = 6 - (parseInt(charSel.value, 10) || 0);
          locSel.value = String(Math.max(0, otherMax));
        }
        _syncCountsToList();
      });
    }
    if (locSel && !locSel._wired) {
      locSel._wired = true;
      locSel.addEventListener('change', () => {
        const total = (parseInt(charSel.value, 10) || 0) + (parseInt(locSel.value, 10) || 0);
        if (total > 6) {
          const otherMax = 6 - (parseInt(locSel.value, 10) || 0);
          charSel.value = String(Math.max(0, otherMax));
        }
        _syncCountsToList();
      });
    }
    if (genBtn && !genBtn._wired) {
      genBtn._wired = true;
      genBtn.addEventListener('click', async () => {
        const all = [
          ...(window.createJobState.characters || []).map(c => ({ item: c, type: 'character' })),
          ...(window.createJobState.locations || []).map(l => ({ item: l, type: 'location' })),
        ].filter(({ item }) => !item.locked && !item.appearanceSheet);
        if (all.length === 0) return;
        genBtn.disabled = true;
        await Promise.all(all.map(({ item, type }) => _generateOne(item, type)));
        genBtn.disabled = false;
        _updateGenerateButton();
      });
    }

    // Detect-from-script button (Film mode)
    const detectBtn = document.getElementById('btn-cast-detect');
    const detectStatus = document.getElementById('cast-detect-status');
    if (detectBtn && !detectBtn._wired) {
      detectBtn._wired = true;
      detectBtn.addEventListener('click', async () => {
        if (typeof window.readCurrentScriptText !== 'function' || typeof window.detectRefsFromScript !== 'function') return;
        const script = window.readCurrentScriptText();
        if (!script || script.length < 30) {
          if (detectStatus) detectStatus.textContent = 'Script too short or empty. Paste/import script first.';
          return;
        }
        detectBtn.disabled = true;
        if (detectStatus) detectStatus.textContent = 'Analyzing script…';
        try {
          const result = await window.detectRefsFromScript(script, 'film', getCreateGeminiKey());
          const chars = (result && Array.isArray(result.characters)) ? result.characters : [];
          const locs = (result && Array.isArray(result.locations)) ? result.locations : [];
          // Cap at combined 6
          const maxChars = Math.min(chars.length, 6);
          const remaining = Math.max(0, 6 - maxChars);
          const maxLocs = Math.min(locs.length, remaining);
          // Reset existing UNLOCKED rows; preserve locked ones
          const keptChars = (window.createJobState.characters || []).filter(c => c.locked);
          const keptLocs = (window.createJobState.locations || []).filter(l => l.locked);
          for (let i = 0; i < maxChars; i++) {
            keptChars.push({
              id: castNextId('char'),
              name: chars[i].name || ('Character ' + (i + 1)),
              userDescription: chars[i].description || '',
              uploadedImageDataUrl: null,
              appearanceSheet: '',
              distinctiveTraits: [],
              ageRange: '', build: '',
              representativeImageDataUrl: null,
              locked: false, libraryId: null,
              createdAt: new Date().toISOString(),
            });
          }
          for (let i = 0; i < maxLocs; i++) {
            keptLocs.push({
              id: castNextId('loc'),
              name: locs[i].name || ('Location ' + (i + 1)),
              userDescription: locs[i].description || '',
              uploadedImageDataUrl: null,
              appearanceSheet: '',
              distinctiveTraits: [],
              ageRange: '', build: '',
              representativeImageDataUrl: null,
              locked: false, libraryId: null,
              createdAt: new Date().toISOString(),
            });
          }
          window.createJobState.characters = keptChars;
          window.createJobState.locations = keptLocs;
          // Sync count selectors
          const charSel = document.getElementById('cast-char-count');
          const locSel = document.getElementById('cast-loc-count');
          if (charSel) charSel.value = String(keptChars.length);
          if (locSel) locSel.value = String(keptLocs.length);
          if (detectStatus) detectStatus.textContent = `✓ Detected ${maxChars} character(s) and ${maxLocs} location(s). Review and lock.`;
          renderCastRows();
        } catch (e) {
          if (detectStatus) detectStatus.textContent = '⚠ Detection failed: ' + (e.message || 'unknown error');
          console.warn('[cast detect]', e);
        } finally {
          detectBtn.disabled = false;
        }
      });
    }

    _wireUploadInput();

    // Library button (Film mode) — opens picker and offers character or location
    const libBtn = document.getElementById('btn-cast-library');
    if (libBtn && !libBtn._wired) {
      libBtn._wired = true;
      libBtn.addEventListener('click', () => {
        // Show all character + location entries; on pick, decide kind from entry.kind
        if (typeof window.castOpenLibraryPicker !== 'function') return;
        window.castOpenLibraryPicker(null, (entry) => {
          // Cap check
          const total = ((window.createJobState.characters || []).length) + ((window.createJobState.locations || []).length);
          if (total >= 6) { alert('Cap of 6 reached. Delete an existing entity first.'); return; }
          if (entry.kind === 'character' || entry.kind === 'presenter') {
            const ch = window._castInstantiateFromLibrary(entry, 'character');
            if (ch) {
              window.createJobState.characters = window.createJobState.characters || [];
              window.createJobState.characters.push(ch);
              renderCastRows();
            }
          } else if (entry.kind === 'location' || entry.kind === 'setting') {
            const loc = window._castInstantiateFromLibrary(entry, 'location');
            if (loc) {
              window.createJobState.locations = window.createJobState.locations || [];
              window.createJobState.locations.push(loc);
              renderCastRows();
            }
          } else {
            alert('This library item is a ' + entry.kind + ' — not usable in Film mode.');
          }
        });
      });
    }

    // Show the setup card once user has audio/text input
    if (card) card.style.display = '';
  }

  // Initialize on DOM ready (or now if already loaded)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initStatic);
  } else {
    _initStatic();
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  BRAND MODE — product (required) + presenter (optional) + setting (optional)
  //  Each entity uses the same lock flow as characters: AI sheet + AI image + lock.
  // ──────────────────────────────────────────────────────────────────────────

  let _brandPendingUploadKind = null;  // 'product' | 'presenter' | 'setting'

  function _ensureBrandProduct() {
    if (!window.createJobState.product) {
      window.createJobState.product = {
        id: 'prod_' + Date.now().toString(36),
        name: '', userDescription: '',
        brandColors: [], logoDataUrl: null,
        uploadedImageDataUrl: null,
        appearanceSheet: '', distinctiveTraits: [],
        representativeImageDataUrl: null,
        locked: false, libraryId: null,
        createdAt: new Date().toISOString(),
      };
    }
    return window.createJobState.product;
  }

  function _renderBrandProductSlot() {
    const slot = document.getElementById('brand-product-slot');
    if (!slot) return;
    const p = _ensureBrandProduct();
    if (p.locked) {
      slot.innerHTML = `<div class="cast-row cast-row-locked">
        <div class="cast-row-thumb">${p.representativeImageDataUrl ? `<img src="${p.representativeImageDataUrl}">` : '<div class="cast-row-thumb-empty">no img</div>'}</div>
        <div class="cast-row-meta">
          <div class="cast-row-name">🎁 ${escapeHtml(p.name)} <span class="cast-row-locked-badge">🔒 Product locked</span></div>
          <div class="cast-row-sub">${escapeHtml((p.appearanceSheet || '').slice(0, 80))}${(p.appearanceSheet || '').length > 80 ? '…' : ''}</div>
        </div>
        <div class="cast-row-actions"><button class="btn-xs" data-brand-action="unlock-product">🔓 Unlock</button></div>
      </div>`;
    } else {
      const isGenerating = !!p._generating;
      const needsRegen = !!p.needsRegen;
      slot.innerHTML = `<div class="cast-row${needsRegen ? ' cast-row-needs-regen' : ''}" data-brand-kind="product">
        <div class="cast-row-thumb">
          ${p.representativeImageDataUrl ? `<img src="${p.representativeImageDataUrl}">`
            : p.uploadedImageDataUrl ? `<img src="${p.uploadedImageDataUrl}" class="cast-row-thumb-pending">`
            : '<div class="cast-row-thumb-empty">no img</div>'}
          ${isGenerating ? '<div class="cast-row-thumb-spinner"></div>' : ''}
        </div>
        <div class="cast-row-fields">
          <input type="text" placeholder="Product name (e.g. AcmePhone X)" value="${escapeHtml(p.name)}" data-brand-field="name">
          <textarea rows="2" placeholder="Description (e.g. flagship phone, sleek aluminum body, brand logo)" data-brand-field="userDescription">${escapeHtml(p.userDescription || '')}</textarea>
          ${p.appearanceSheet ? `<div class="cast-row-sheet"><strong>Hero shot:</strong> ${escapeHtml(p.appearanceSheet)}</div>` : ''}
          ${needsRegen ? '<div class="cast-row-regen-badge">⚠ Style changed — regenerate image to lock</div>' : ''}
        </div>
        <div class="cast-row-actions">
          <button class="btn-xs" data-brand-action="upload-product">${p.uploadedImageDataUrl ? '🔄 Change shot' : '📎 Upload product photo'}</button>
          ${p.appearanceSheet ? `<button class="btn-xs" data-brand-action="regen-product" ${isGenerating ? 'disabled' : ''}>🎨 Regen image</button>` : ''}
          ${p.appearanceSheet && p.representativeImageDataUrl ? `<button class="btn-xs primary" data-brand-action="lock-product">🔒 Lock</button>` : ''}
        </div>
      </div>`;
    }
    _wireBrandSlot('product');
  }

  function _renderBrandSlot(kind, item, slotId, removable) {
    const slot = document.getElementById(slotId);
    if (!slot) return;
    if (!item) { slot.innerHTML = ''; return; }
    if (item.locked) {
      slot.innerHTML = `<div class="cast-row cast-row-locked">
        <div class="cast-row-thumb">${item.representativeImageDataUrl ? `<img src="${item.representativeImageDataUrl}">` : '<div class="cast-row-thumb-empty">no img</div>'}</div>
        <div class="cast-row-meta">
          <div class="cast-row-name">${kind === 'presenter' ? '👤' : '🏞'} ${escapeHtml(item.name)} <span class="cast-row-locked-badge">🔒 Locked</span></div>
          <div class="cast-row-sub">${escapeHtml((item.appearanceSheet || '').slice(0, 80))}</div>
        </div>
        <div class="cast-row-actions"><button class="btn-xs" data-brand-action="unlock-${kind}">🔓 Unlock</button></div>
      </div>`;
    } else {
      const isGenerating = !!item._generating;
      const needsRegen = !!item.needsRegen;
      slot.innerHTML = `<div class="cast-row${needsRegen ? ' cast-row-needs-regen' : ''}" data-brand-kind="${kind}">
        <div class="cast-row-thumb">
          ${item.representativeImageDataUrl ? `<img src="${item.representativeImageDataUrl}">`
            : item.uploadedImageDataUrl ? `<img src="${item.uploadedImageDataUrl}" class="cast-row-thumb-pending">`
            : '<div class="cast-row-thumb-empty">no img</div>'}
          ${isGenerating ? '<div class="cast-row-thumb-spinner"></div>' : ''}
        </div>
        <div class="cast-row-fields">
          <input type="text" placeholder="${kind === 'presenter' ? 'Presenter name' : 'Setting name'}" value="${escapeHtml(item.name)}" data-brand-field="name">
          <textarea rows="2" placeholder="${kind === 'presenter' ? 'Description (e.g. late 20s, casual styling)' : 'Description (e.g. studio cyclorama, soft lighting)'}" data-brand-field="userDescription">${escapeHtml(item.userDescription || '')}</textarea>
          ${item.appearanceSheet ? `<div class="cast-row-sheet"><strong>Appearance:</strong> ${escapeHtml(item.appearanceSheet)}</div>` : ''}
          ${needsRegen ? '<div class="cast-row-regen-badge">⚠ Style changed — regenerate image to lock</div>' : ''}
        </div>
        <div class="cast-row-actions">
          <button class="btn-xs" data-brand-action="upload-${kind}">${item.uploadedImageDataUrl ? '🔄 Change' : '📎 Upload ref'}</button>
          ${item.appearanceSheet ? `<button class="btn-xs" data-brand-action="regen-${kind}" ${isGenerating ? 'disabled' : ''}>🎨 Regen</button>` : ''}
          ${item.appearanceSheet && item.representativeImageDataUrl ? `<button class="btn-xs primary" data-brand-action="lock-${kind}">🔒 Lock</button>` : ''}
          ${removable ? `<button class="btn-xs" data-brand-action="remove-${kind}">✕ Remove</button>` : ''}
        </div>
      </div>`;
    }
    _wireBrandSlot(kind);
  }

  function _wireBrandSlot(kind) {
    const slot = document.getElementById(`brand-${kind}-slot`);
    if (!slot) return;
    const item = kind === 'product' ? window.createJobState.product
               : kind === 'presenter' ? window.createJobState.presenter
               : window.createJobState.setting;
    if (!item) return;

    slot.querySelectorAll('input[data-brand-field], textarea[data-brand-field]').forEach(field => {
      field.addEventListener('input', () => {
        item[field.dataset.brandField] = field.value;
        _updateBrandGenerateButton();
      });
    });

    slot.querySelectorAll('button[data-brand-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.brandAction;
        if (action.startsWith('upload-')) {
          _brandPendingUploadKind = kind;
          const input = document.getElementById('cast-img-upload');
          if (input) input.click();
        } else if (action.startsWith('regen-')) {
          _brandRegenImage(item, kind);
        } else if (action.startsWith('lock-')) {
          _brandLock(item, kind);
        } else if (action.startsWith('unlock-')) {
          _brandUnlock(item, kind);
        } else if (action === 'remove-presenter') {
          window.createJobState.presenter = null;
          window.brandRenderSlots();
        } else if (action === 'remove-setting') {
          window.createJobState.setting = null;
          window.brandRenderSlots();
        }
      });
    });
  }

  function _updateBrandGenerateButton() {
    const btn = document.getElementById('btn-brand-generate');
    const hint = document.getElementById('brand-action-hint');
    const row = document.getElementById('brand-action-row');
    if (!btn || !row) return;
    const items = [];
    if (window.createJobState.product) items.push(window.createJobState.product);
    if (window.createJobState.presenter) items.push(window.createJobState.presenter);
    if (window.createJobState.setting) items.push(window.createJobState.setting);
    const editable = items.filter(x => !x.locked && !x.appearanceSheet);
    const valid = editable.length > 0 && editable.every(x => (x.name || '').trim() && (x.userDescription || '').trim());
    btn.disabled = !valid;
    row.style.display = editable.length > 0 ? '' : 'none';
    if (hint) hint.textContent = valid ? 'Click to generate hero shots and appearance sheets.' : 'Fill name and description for product/presenter/setting to enable.';
  }

  async function _brandGenerateOne(item, kind) {
    const key = getCreateGeminiKey();
    if (!key) return;
    item._generating = true;
    window.brandRenderSlots();
    try {
      const sheet = await window.generateAppearanceSheet(item, kind, key);
      item.appearanceSheet = sheet.appearance;
      item.distinctiveTraits = sheet.distinctiveTraits || [];
      const imgUrl = await window.generateRepresentativeImage(item, kind, key);
      item.representativeImageDataUrl = imgUrl;
    } catch (e) {
      console.warn('[brand generate]', kind, e.message);
    } finally {
      item._generating = false;
      window.brandRenderSlots();
    }
  }

  async function _brandRegenImage(item, kind) {
    const key = getCreateGeminiKey();
    if (!key) return;
    item._generating = true;
    window.brandRenderSlots();
    try {
      const imgUrl = await window.generateRepresentativeImage(item, kind, key);
      item.representativeImageDataUrl = imgUrl;
    } catch (e) { console.warn('[brand regen]', kind, e.message); }
    item._generating = false;
    window.brandRenderSlots();
  }

  function _brandLock(item, kind) {
    if (!item.appearanceSheet || !item.representativeImageDataUrl) {
      alert('Generate appearance and image before locking.');
      return;
    }
    item.locked = true;
    item.lockedAt = new Date().toISOString();
    item.needsRegen = false;
    if (!window.createJobState.styleLocked) window.createJobState.styleLocked = true;
    if (typeof window._castSyncToLegacy === 'function') window._castSyncToLegacy();
    window.brandRenderSlots();
    if (typeof updateCreateButtons === 'function') updateCreateButtons();
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
  }

  function _brandUnlock(item, kind) {
    item.locked = false;
    if (typeof window._castSyncToLegacy === 'function') window._castSyncToLegacy();
    window.brandRenderSlots();
    if (typeof updateCreateButtons === 'function') updateCreateButtons();
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
  }

  // Brand-mode upload handler (separate from cast upload)
  function _wireBrandUpload() {
    const input = document.getElementById('cast-img-upload');
    if (!input || input._brandWired) return;
    // Note: same input as cast upload; we just check _brandPendingUploadKind
    input._brandWired = true;
    input.addEventListener('change', async () => {
      if (!_brandPendingUploadKind) return;
      const file = input.files && input.files[0];
      if (!file) { _brandPendingUploadKind = null; return; }
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result;
        const kind = _brandPendingUploadKind;
        const item = kind === 'product' ? window.createJobState.product
                   : kind === 'presenter' ? window.createJobState.presenter
                   : window.createJobState.setting;
        if (item) {
          item.uploadedImageDataUrl = dataUrl;
          if (!item.userDescription && typeof window.autoCaptionFromImage === 'function') {
            item._captioning = true;
            window.brandRenderSlots();
            try {
              const cap = await window.autoCaptionFromImage(dataUrl, kind, getCreateGeminiKey());
              if (cap) item.userDescription = cap;
            } catch (e) {}
            item._captioning = false;
          }
          window.brandRenderSlots();
        }
        _brandPendingUploadKind = null;
        input.value = '';
      };
      reader.readAsDataURL(file);
    });
  }

  // Public render entry point — redraws all brand slots
  window.brandRenderSlots = function () {
    if (window.createJobState.videoType !== 'brand') return;
    _ensureBrandProduct();
    _renderBrandProductSlot();
    _renderBrandSlot('presenter', window.createJobState.presenter, 'brand-presenter-slot', true);
    _renderBrandSlot('setting', window.createJobState.setting, 'brand-setting-slot', true);
    _updateBrandGenerateButton();
    if (typeof window.renderRefsPanel === 'function') window.renderRefsPanel('timeline');
  };

  function _initBrandStatic() {
    const addPresenter = document.getElementById('btn-brand-add-presenter');
    const addSetting = document.getElementById('btn-brand-add-setting');
    const genBtn = document.getElementById('btn-brand-generate');

    if (addPresenter && !addPresenter._wired) {
      addPresenter._wired = true;
      addPresenter.addEventListener('click', () => {
        if (window.createJobState.presenter) return;
        window.createJobState.presenter = {
          id: 'pres_' + Date.now().toString(36),
          name: '', userDescription: '',
          uploadedImageDataUrl: null,
          appearanceSheet: '', distinctiveTraits: [],
          ageRange: '', build: '',
          representativeImageDataUrl: null,
          role: 'presenter', locked: false, libraryId: null,
          createdAt: new Date().toISOString(),
        };
        window.brandRenderSlots();
      });
    }

    if (addSetting && !addSetting._wired) {
      addSetting._wired = true;
      addSetting.addEventListener('click', () => {
        if (window.createJobState.setting) return;
        window.createJobState.setting = {
          id: 'set_' + Date.now().toString(36),
          name: '', userDescription: '',
          uploadedImageDataUrl: null,
          appearanceSheet: '', distinctiveTraits: [],
          representativeImageDataUrl: null,
          locked: false, libraryId: null,
          createdAt: new Date().toISOString(),
        };
        window.brandRenderSlots();
      });
    }

    if (genBtn && !genBtn._wired) {
      genBtn._wired = true;
      genBtn.addEventListener('click', async () => {
        const queue = [];
        const p = window.createJobState.product;
        const pres = window.createJobState.presenter;
        const set = window.createJobState.setting;
        if (p && !p.locked && !p.appearanceSheet) queue.push({ item: p, kind: 'product' });
        if (pres && !pres.locked && !pres.appearanceSheet) queue.push({ item: pres, kind: 'presenter' });
        if (set && !set.locked && !set.appearanceSheet) queue.push({ item: set, kind: 'setting' });
        if (queue.length === 0) return;
        genBtn.disabled = true;
        await Promise.all(queue.map(({ item, kind }) => _brandGenerateOne(item, kind)));
        genBtn.disabled = false;
        _updateBrandGenerateButton();
      });
    }

    // Detect-from-script (Brand mode)
    const detectBtn = document.getElementById('btn-brand-detect');
    const detectStatus = document.getElementById('brand-detect-status');
    if (detectBtn && !detectBtn._wired) {
      detectBtn._wired = true;
      detectBtn.addEventListener('click', async () => {
        if (typeof window.readCurrentScriptText !== 'function' || typeof window.detectRefsFromScript !== 'function') return;
        const script = window.readCurrentScriptText();
        if (!script || script.length < 30) {
          if (detectStatus) detectStatus.textContent = 'Script too short or empty. Paste/import script first.';
          return;
        }
        detectBtn.disabled = true;
        if (detectStatus) detectStatus.textContent = 'Analyzing script…';
        try {
          const result = await window.detectRefsFromScript(script, 'brand', getCreateGeminiKey());
          if (!result || !result.product) throw new Error('No product detected');
          // Always replace product (single entity)
          const existing = window.createJobState.product;
          // Preserve locked product if user already locked one
          if (existing && existing.locked) {
            if (detectStatus) detectStatus.textContent = '⚠ Product already locked — unlock first to redetect.';
            detectBtn.disabled = false;
            return;
          }
          window.createJobState.product = {
            id: 'prod_det_' + Date.now().toString(36),
            name: result.product.name || 'Product',
            userDescription: result.product.description || '',
            brandColors: existing ? existing.brandColors : [],
            logoDataUrl: existing ? existing.logoDataUrl : null,
            uploadedImageDataUrl: existing ? existing.uploadedImageDataUrl : null,
            appearanceSheet: '',
            distinctiveTraits: [],
            representativeImageDataUrl: null,
            locked: false, libraryId: null,
            createdAt: new Date().toISOString(),
          };
          // Presenter
          if (result.presenter && !(window.createJobState.presenter && window.createJobState.presenter.locked)) {
            window.createJobState.presenter = {
              id: 'pres_det_' + Date.now().toString(36),
              name: result.presenter.name || 'Presenter',
              userDescription: result.presenter.description || '',
              uploadedImageDataUrl: null,
              appearanceSheet: '',
              distinctiveTraits: [],
              ageRange: '', build: '',
              representativeImageDataUrl: null,
              role: 'presenter',
              locked: false, libraryId: null,
              createdAt: new Date().toISOString(),
            };
          }
          // Setting
          if (result.setting && !(window.createJobState.setting && window.createJobState.setting.locked)) {
            window.createJobState.setting = {
              id: 'set_det_' + Date.now().toString(36),
              name: result.setting.name || 'Setting',
              userDescription: result.setting.description || '',
              uploadedImageDataUrl: null,
              appearanceSheet: '',
              distinctiveTraits: [],
              representativeImageDataUrl: null,
              locked: false, libraryId: null,
              createdAt: new Date().toISOString(),
            };
          }
          if (detectStatus) {
            const parts = ['product'];
            if (result.presenter) parts.push('presenter');
            if (result.setting) parts.push('setting');
            detectStatus.textContent = `✓ Detected ${parts.join(' + ')}. Review and lock.`;
          }
          window.brandRenderSlots();
        } catch (e) {
          if (detectStatus) detectStatus.textContent = '⚠ Detection failed: ' + (e.message || 'unknown error');
          console.warn('[brand detect]', e);
        } finally {
          detectBtn.disabled = false;
        }
      });
    }

    _wireBrandUpload();

    // Library button (Brand mode) — pick product / presenter / setting
    const libBtn = document.getElementById('btn-brand-library');
    if (libBtn && !libBtn._wired) {
      libBtn._wired = true;
      libBtn.addEventListener('click', () => {
        if (typeof window.castOpenLibraryPicker !== 'function') return;
        window.castOpenLibraryPicker(null, (entry) => {
          if (entry.kind === 'product') {
            if (window.createJobState.product && window.createJobState.product.locked) {
              alert('Product is already locked. Unlock it first to replace from library.');
              return;
            }
            window.createJobState.product = window._castInstantiateFromLibrary(entry, 'product');
          } else if (entry.kind === 'presenter' || entry.kind === 'character') {
            if (window.createJobState.presenter && window.createJobState.presenter.locked) {
              alert('Presenter is already locked. Unlock it first to replace from library.');
              return;
            }
            window.createJobState.presenter = window._castInstantiateFromLibrary(entry, 'presenter');
          } else if (entry.kind === 'setting' || entry.kind === 'location') {
            if (window.createJobState.setting && window.createJobState.setting.locked) {
              alert('Setting is already locked. Unlock it first to replace from library.');
              return;
            }
            window.createJobState.setting = window._castInstantiateFromLibrary(entry, 'setting');
          } else {
            alert('Unknown library item kind: ' + entry.kind);
            return;
          }
          window.brandRenderSlots();
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initBrandStatic);
  } else {
    _initBrandStatic();
  }

  // Bracket parsing utility — used after storyboard generation
  // Returns: { tokens: ['Maya', 'Joe'], idsCharacters: [...], idsLocations: [...] }
  window.castParseBracketTokens = function (promptText) {
    const empty = { tokens: [], characterIds: [], locationIds: [], hasProduct: false, hasPresenter: false, hasSetting: false };
    if (!promptText) return empty;
    const tokens = (promptText.match(/\[([^\]]+)\]/g) || []).map(t => t.slice(1, -1).trim());
    const seen = new Set();
    const unique = tokens.filter(t => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    const chars = window.createJobState.characters || [];
    const locs = window.createJobState.locations || [];
    const product = window.createJobState.product;
    const presenter = window.createJobState.presenter;
    const setting = window.createJobState.setting;
    const characterIds = [];
    const locationIds = [];
    let hasProduct = false, hasPresenter = false, hasSetting = false;
    for (const tok of unique) {
      const lc = tok.toLowerCase();
      if (product && product.locked && (product.name || '').toLowerCase() === lc) { hasProduct = true; continue; }
      if (presenter && presenter.locked && (presenter.name || '').toLowerCase() === lc) { hasPresenter = true; continue; }
      if (setting && setting.locked && (setting.name || '').toLowerCase() === lc) { hasSetting = true; continue; }
      const c = chars.find(x => x.locked && (x.name || '').toLowerCase() === lc);
      if (c) { characterIds.push(c.id); continue; }
      const l = locs.find(x => x.locked && (x.name || '').toLowerCase() === lc);
      if (l) { locationIds.push(l.id); }
    }
    return { tokens: unique, characterIds, locationIds, hasProduct, hasPresenter, hasSetting };
  };

  // Build the storyboard preamble injected into Gemini prompts.
  window.castBuildStoryboardPreamble = function () {
    const t = (window.createJobState && window.createJobState.videoType) || null;
    const chars = (window.createJobState.characters || []).filter(c => c.locked);
    const locs = (window.createJobState.locations || []).filter(l => l.locked);
    const product = window.createJobState.product;
    const presenter = window.createJobState.presenter;
    const setting = window.createJobState.setting;
    const productLocked = product && product.locked;
    const presenterLocked = presenter && presenter.locked;
    const settingLocked = setting && setting.locked;

    if (t === 'narration') return '';
    if (t === 'brand') {
      if (!productLocked && !presenterLocked && !settingLocked) return '';
      let out = '';
      if (productLocked) {
        out += 'PRODUCT (the hero of every scene):\n';
        out += `- [${product.name}] — ${product.appearanceSheet || product.userDescription || product.name}\n`;
        out += '  Always shown clean, hero-lit, centered when in frame.\n';
      }
      if (presenterLocked) {
        out += '\nPRESENTER:\n';
        out += `- [${presenter.name}] — ${presenter.appearanceSheet || presenter.userDescription || presenter.name}\n`;
      }
      if (settingLocked) {
        out += '\nSETTING:\n';
        out += `- [${setting.name}] — ${setting.appearanceSheet || setting.userDescription || setting.name}\n`;
      }
      out += '\nWhen a scene features the product, presenter, or setting, refer to them by their bracketed name. The image generator has their reference images and will lock visual consistency. Do NOT redescribe their physical traits in the scene description.\n\n';
      return out;
    }
    // film mode (default)
    if (chars.length === 0 && locs.length === 0) return '';
    let out = '';
    if (chars.length) {
      out += 'CHARACTERS in this story:\n';
      for (const c of chars) {
        out += `- [${c.name}] — ${c.appearanceSheet || c.userDescription || c.name}\n`;
      }
    }
    if (locs.length) {
      out += '\nLOCATIONS:\n';
      for (const l of locs) {
        out += `- [${l.name}] — ${l.appearanceSheet || l.userDescription || l.name}\n`;
      }
    }
    out += '\nWhen a scene features a character or location, refer to them by their bracketed name (e.g. [' + (chars[0]?.name || locs[0]?.name) + '] enters the room). The image generator already has their reference image and will lock visual consistency. Do NOT redescribe their physical traits in the scene description.\n\n';
    return out;
  };

  // After storyboard generation: parse each scene's prompt and populate refs.
  window.castAutoAssignRefs = function () {
    if (typeof createScenes === 'undefined' || !Array.isArray(createScenes)) return;
    for (const scene of createScenes) {
      if (!scene.prompt) continue;
      const parsed = window.castParseBracketTokens(scene.prompt);
      scene.refCharacters = parsed.characterIds.slice();
      // Brand-mode presenter is treated as a character at image-gen time
      if (parsed.hasPresenter) {
        const pres = window.createJobState.presenter;
        if (pres && pres.locked) scene.refCharacters.push(pres.id);
      }
      // Use first matched location (existing field is single-valued)
      scene.refEnvironment = parsed.locationIds.length > 0
        ? parsed.locationIds[0]
        : (parsed.hasSetting && window.createJobState.setting && window.createJobState.setting.locked
            ? window.createJobState.setting.id
            : -1);
      scene.bracketTokens = parsed.tokens;
      scene.hasProduct = parsed.hasProduct;
      scene.promptDirty = false;
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  //  Phase 2 — Storyboard scene chip strip + AI rewrite + promptDirty flag
  // ──────────────────────────────────────────────────────────────────────────

  // Returns array of { id, name, description, kind } for all locked refs that can be chips.
  function _allLockedRefs() {
    const out = [];
    (window.createJobState.characters || []).filter(c => c.locked).forEach(c => out.push({ id: c.id, name: c.name, description: c.appearanceSheet || c.userDescription, kind: 'character' }));
    (window.createJobState.locations || []).filter(l => l.locked).forEach(l => out.push({ id: l.id, name: l.name, description: l.appearanceSheet || l.userDescription, kind: 'location' }));
    const product = window.createJobState.product;
    const presenter = window.createJobState.presenter;
    const setting = window.createJobState.setting;
    if (product && product.locked) out.push({ id: product.id, name: product.name, description: product.appearanceSheet || product.userDescription, kind: 'product' });
    if (presenter && presenter.locked) out.push({ id: presenter.id, name: presenter.name, description: presenter.appearanceSheet || presenter.userDescription, kind: 'presenter' });
    if (setting && setting.locked) out.push({ id: setting.id, name: setting.name, description: setting.appearanceSheet || setting.userDescription, kind: 'setting' });
    return out;
  }

  // Recompute promptDirty for a scene: dirty when bracket tokens in prose
  // don't match the locked refs that should be referenced.
  function _recomputeDirty(scene) {
    if (!scene.prompt) { scene.promptDirty = false; return; }
    const parsed = window.castParseBracketTokens(scene.prompt);
    const refs = _allLockedRefs().reduce((m, r) => { m[r.name.toLowerCase()] = r; return m; }, {});
    // Every bracket token must resolve to a locked ref; otherwise dirty.
    for (const tok of parsed.tokens) {
      if (!refs[tok.toLowerCase()]) { scene.promptDirty = true; return; }
    }
    scene.promptDirty = false;
  }

  // Re-parse prose, sync refCharacters / refEnvironment / hasProduct.
  function _syncSceneRefsFromProse(scene) {
    if (!scene.prompt) return;
    const parsed = window.castParseBracketTokens(scene.prompt);
    scene.refCharacters = parsed.characterIds.slice();
    if (parsed.hasPresenter) {
      const pres = window.createJobState.presenter;
      if (pres && pres.locked && !scene.refCharacters.includes(pres.id)) scene.refCharacters.push(pres.id);
    }
    scene.refEnvironment = parsed.locationIds.length > 0
      ? parsed.locationIds[0]
      : (parsed.hasSetting && window.createJobState.setting && window.createJobState.setting.locked ? window.createJobState.setting.id : -1);
    scene.bracketTokens = parsed.tokens;
    scene.hasProduct = parsed.hasProduct;
  }
  window._castSyncSceneRefsFromProse = _syncSceneRefsFromProse;
  window._castRecomputeDirty = _recomputeDirty;

  // Build chip strip HTML for a scene card.
  // Manual flow: chip changes are structural (instant). AI smoothing is opt-in
  // via the dirty action banner.
  window.castBuildChipStripHtml = function (scene, idx) {
    const refs = _allLockedRefs();
    if (refs.length === 0) return '';
    const parsed = scene.prompt ? window.castParseBracketTokens(scene.prompt) : { tokens: [] };
    const tokenSet = new Set(parsed.tokens.map(t => t.toLowerCase()));
    const inScene = refs.filter(r => tokenSet.has(r.name.toLowerCase()));
    const notInScene = refs.filter(r => !tokenSet.has(r.name.toLowerCase()));
    const dirty = !!scene.promptDirty;
    const _icon = r => r.kind === 'product' ? '🎁' : r.kind === 'location' ? '🏞' : r.kind === 'setting' ? '🏞' : r.kind === 'presenter' ? '🎤' : '👤';

    let html = '<div class="scene-chip-strip" data-scene-idx="' + idx + '">';

    // Existing chips
    inScene.forEach(r => {
      html += `<span class="scene-chip" data-chip-id="${r.id}" title="${escapeHtml(r.name)}">
        <span class="scene-chip-icon">${_icon(r)}</span>
        <span class="scene-chip-name">${escapeHtml(r.name)}</span>
        <button class="scene-chip-x" data-action="chip-remove" data-ref-id="${r.id}" title="Remove from scene">×</button>
      </span>`;
    });

    // Add buttons — flat, single-action (no dropdown). Click instantly appends [Name] and marks dirty.
    if (notInScene.length > 0) {
      notInScene.forEach(r => {
        html += `<button class="scene-chip-add-flat" type="button" data-action="chip-add" data-ref-id="${r.id}" title="Add to scene">
          + <span class="scene-chip-icon">${_icon(r)}</span> ${escapeHtml(r.name)}
        </button>`;
      });
    }

    // Dirty action banner — appears when prose has uncommitted bracket changes
    if (dirty) {
      html += `<div class="scene-chip-action-banner">
        <span class="scene-chip-action-label">✏ Chip changes pending</span>
        <button class="scene-chip-ai-update" type="button" data-action="chip-ai-update" title="Use AI to weave the changes into the prose naturally">✨ Update prose with AI</button>
        <button class="scene-chip-confirm" type="button" data-action="chip-confirm-prose" title="Keep the prose as-is, just clear the indicator">✓ Confirm as is</button>
      </div>`;
    }

    html += '</div>';
    return html;
  };

  // Wire chip-strip events on a scene card. Manual AI flow:
  //   • + / × buttons: instant prose mutation, no API call, marks dirty
  //   • "✨ Update prose with AI": user-triggered Gemini call to smooth brackets
  //   • "✓ Confirm as is": clear dirty without AI call (user keeps raw brackets)
  window.castWireSceneChipStrip = function (cardEl, scene, idx) {
    const strip = cardEl.querySelector('.scene-chip-strip');
    if (!strip) return;

    const taStory = cardEl.querySelector('#create-storyboard-prompt-' + idx);
    const taScene = cardEl.querySelector('#create-scene-prompt-' + idx);
    function _setProse(newProse) {
      scene.prompt = newProse;
      if (taStory) taStory.value = newProse;
      if (taScene) taScene.value = newProse;
    }
    function _rerenderStrip() {
      const newHtml = window.castBuildChipStripHtml(scene, idx);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = newHtml;
      const newStrip = wrapper.firstElementChild;
      if (newStrip && strip.parentNode) {
        strip.parentNode.replaceChild(newStrip, strip);
        window.castWireSceneChipStrip(cardEl, scene, idx);
      }
      cardEl.classList.toggle('scene-prompt-dirty', !!scene.promptDirty);
    }

    // Manual prose edit — re-parse + recompute dirty on blur
    [taStory, taScene].forEach(ta => {
      if (!ta || ta._chipBlurWired) return;
      ta._chipBlurWired = true;
      ta.addEventListener('blur', () => {
        scene.prompt = ta.value;
        _syncSceneRefsFromProse(scene);
        _recomputeDirty(scene);
        _rerenderStrip();
      });
    });

    // Chip × — instant strip, no AI call
    strip.querySelectorAll('[data-action="chip-remove"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const refId = btn.dataset.refId;
        const ref = _allLockedRefs().find(r => r.id === refId);
        if (!ref) return;
        const re = new RegExp('\\s*\\[' + ref.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]\\s*', 'gi');
        const newProse = (scene.prompt || '').replace(re, ' ').replace(/\s+/g, ' ').trim();
        _setProse(newProse);
        scene.promptDirty = true;
        _syncSceneRefsFromProse(scene);
        _rerenderStrip();
        if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
      });
    });

    // Chip + — instant append, no AI call
    strip.querySelectorAll('[data-action="chip-add"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const refId = btn.dataset.refId;
        const ref = _allLockedRefs().find(r => r.id === refId);
        if (!ref) return;
        const newProse = (scene.prompt || '').trim() + ' [' + ref.name + ']';
        _setProse(newProse);
        scene.promptDirty = true;
        _syncSceneRefsFromProse(scene);
        _rerenderStrip();
        if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
      });
    });

    // ✨ Update prose with AI — opt-in Gemini smoothing
    const aiBtn = strip.querySelector('[data-action="chip-ai-update"]');
    if (aiBtn) {
      aiBtn.addEventListener('click', async () => {
        if (scene._aiBusy) return;
        scene._aiBusy = true;
        cardEl.classList.add('scene-chip-busy');
        aiBtn.disabled = true;
        try {
          const refs = _allLockedRefs();
          const parsed = window.castParseBracketTokens(scene.prompt || '');
          const tokenSet = new Set(parsed.tokens.map(t => t.toLowerCase()));
          const contextRefs = refs.filter(r => tokenSet.has(r.name.toLowerCase()));
          const result = await window.rewriteSceneSmoothBrackets(scene.prompt || '', contextRefs, getCreateGeminiKey());
          if (result && result.length > 0) {
            _setProse(result);
            scene.promptDirty = false;
            _syncSceneRefsFromProse(scene);
            _rerenderStrip();
            if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
          }
        } catch (err) {
          alert('AI update failed: ' + err.message);
        } finally {
          scene._aiBusy = false;
          cardEl.classList.remove('scene-chip-busy');
        }
      });
    }

    // ✓ Confirm as is — clear dirty, no AI call
    const confirmBtn = strip.querySelector('[data-action="chip-confirm-prose"]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        scene.promptDirty = false;
        _syncSceneRefsFromProse(scene);
        _rerenderStrip();
        if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
      });
    }
  };

  // List of dirty scene indices — used by image-gen gate.
  window.castGetDirtyScenes = function () {
    if (typeof createScenes === 'undefined' || !Array.isArray(createScenes)) return [];
    return createScenes.map((s, i) => s.promptDirty ? i : -1).filter(i => i >= 0);
  };

  // Refs panel renderer — mode-aware tabs.
  //   Film mode:      [ Characters | Locations ]
  //   Brand mode:     [ Product | Cast | Locations ]
  //   Narration mode: panel hidden
  // Surface:
  //   'timeline' (read-only — current implementation)
  //   'canvas' (interactive — Phase 4)
  window.renderRefsPanel = function (surface) {
    const panel = document.getElementById('create-refs-panel');
    if (!panel) return;
    const t = (window.createJobState && window.createJobState.videoType) || null;
    const typeLocked = !!(window.createJobState && window.createJobState.videoTypeLocked);

    // Hide for narration mode and when no type locked yet
    if (!typeLocked || t === 'narration') {
      panel.style.display = 'none';
      return;
    }

    const chars = (window.createJobState.characters || []).filter(c => c.locked);
    const locs = (window.createJobState.locations || []).filter(l => l.locked);
    const product = window.createJobState.product;
    const presenter = window.createJobState.presenter;
    const setting = window.createJobState.setting;
    const productLocked = product && product.locked;
    const presenterLocked = presenter && presenter.locked;
    const settingLocked = setting && setting.locked;

    // Hide if nothing locked yet at all
    const nothingLocked = (t === 'film')
      ? (chars.length === 0 && locs.length === 0)
      : (!productLocked && !presenterLocked && !settingLocked && chars.length === 0 && locs.length === 0);
    if (nothingLocked) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = '';
    panel.dataset.surface = surface || 'timeline';
    const isCanvas = (surface === 'canvas');

    // Build tabs by mode
    const tabsContainer = panel.querySelector('.refs-panel-tabs');
    if (tabsContainer) {
      const tabs = (t === 'brand')
        ? [ { id: 'product', label: 'Product' }, { id: 'cast', label: 'Cast' }, { id: 'locations', label: 'Locations' } ]
        : [ { id: 'characters', label: 'Characters' }, { id: 'locations', label: 'Locations' } ];
      const validIds = tabs.map(x => x.id);
      let activeTab = panel.dataset.activeTab;
      if (!validIds.includes(activeTab)) activeTab = tabs[0].id;
      panel.dataset.activeTab = activeTab;
      tabsContainer.innerHTML = tabs.map(tab =>
        `<button class="refs-panel-tab${tab.id === activeTab ? ' active' : ''}" data-tab="${tab.id}">${tab.label}</button>`
      ).join('');
      tabsContainer.querySelectorAll('.refs-panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          panel.dataset.activeTab = tab.dataset.tab;
          window.renderRefsPanel(panel.dataset.surface);
        });
      });
    }

    // Determine active tab + items to render
    const activeTab = panel.dataset.activeTab;
    let items = [];
    let emptyLabel = activeTab;
    if (t === 'brand') {
      if (activeTab === 'product') {
        if (productLocked) items.push(_panelItemView(product, 'product'));
        emptyLabel = 'product';
      } else if (activeTab === 'cast') {
        if (presenterLocked) items.push(_panelItemView(presenter, 'presenter'));
        chars.forEach(c => items.push(_panelItemView(c, 'character')));
        emptyLabel = 'cast';
      } else {
        if (settingLocked) items.push(_panelItemView(setting, 'setting'));
        locs.forEach(l => items.push(_panelItemView(l, 'location')));
        emptyLabel = 'locations';
      }
    } else {
      if (activeTab === 'characters') {
        chars.forEach(c => items.push(_panelItemView(c, 'character')));
        emptyLabel = 'characters';
      } else {
        locs.forEach(l => items.push(_panelItemView(l, 'location')));
        emptyLabel = 'locations';
      }
    }

    const list = document.getElementById('refs-panel-list');
    if (!list) return;
    list.innerHTML = items.length > 0
      ? items.map(it => _panelRowHtml(it, isCanvas)).join('')
      : `<div class="refs-panel-empty">No locked ${emptyLabel} yet.</div>`;
  };

  // Per-item view object (id, name, image, sub, sceneCount, totalScenes, kind)
  function _panelItemView(item, kind) {
    const totalScenes = (typeof createScenes !== 'undefined' && Array.isArray(createScenes)) ? createScenes.length : 0;
    let sceneCount = 0;
    if (typeof createScenes !== 'undefined' && Array.isArray(createScenes)) {
      if (kind === 'character' || kind === 'presenter') {
        sceneCount = createScenes.filter(s => (s.refCharacters || []).includes(item.id)).length;
      } else if (kind === 'location' || kind === 'setting') {
        sceneCount = createScenes.filter(s => s.refEnvironment === item.id).length;
      } else if (kind === 'product') {
        sceneCount = createScenes.filter(s => s.hasProduct).length;
      }
    }
    return {
      id: item.id,
      name: item.name,
      image: item.representativeImageDataUrl,
      kind,
      ageRange: item.ageRange,
      sceneCount,
      totalScenes,
    };
  }

  function _panelRowHtml(it, isCanvas) {
    const icon = it.kind === 'product' ? '🎁'
              : it.kind === 'location' || it.kind === 'setting' ? '🏞'
              : it.kind === 'presenter' ? '🎤'
              : '👤';
    return `<div class="refs-panel-row" data-id="${it.id}" data-kind="${it.kind}">
      <div class="refs-panel-thumb">${it.image ? `<img src="${it.image}" alt="">` : '·'}</div>
      <div class="refs-panel-meta">
        <div class="refs-panel-name">${icon} ${escapeHtml(it.name)} 🔒</div>
        <div class="refs-panel-sub">${it.ageRange ? it.ageRange + ' · ' : ''}${escapeHtml((createStylePreset || 'cinematic'))}</div>
        ${it.totalScenes > 0 ? `<div class="refs-panel-count">${it.sceneCount} / ${it.totalScenes} scenes</div>` : ''}
      </div>
      <div class="refs-panel-actions">
        <button class="ref-action-btn" data-action="filter" ${isCanvas ? '' : 'disabled'} title="${isCanvas ? 'Filter by this' : 'Open canvas to filter'}">👁</button>
        <button class="ref-action-btn" data-action="edit" ${isCanvas ? '' : 'disabled'} title="${isCanvas ? 'Edit' : 'Open canvas to edit'}">✏</button>
      </div>
    </div>`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Phase 4 — Canvas-surface interactivity: edit modal, mid-project add,
  //  unlock with scene-impact warning, panel action wiring.
  // ──────────────────────────────────────────────────────────────────────────

  function _findRefById(id) {
    if (!id) return null;
    const chars = window.createJobState.characters || [];
    const locs = window.createJobState.locations || [];
    const c = chars.find(x => x.id === id);
    if (c) return { item: c, kind: 'character', listKey: 'characters' };
    const l = locs.find(x => x.id === id);
    if (l) return { item: l, kind: 'location', listKey: 'locations' };
    if (window.createJobState.product && window.createJobState.product.id === id) return { item: window.createJobState.product, kind: 'product', listKey: 'product' };
    if (window.createJobState.presenter && window.createJobState.presenter.id === id) return { item: window.createJobState.presenter, kind: 'presenter', listKey: 'presenter' };
    if (window.createJobState.setting && window.createJobState.setting.id === id) return { item: window.createJobState.setting, kind: 'setting', listKey: 'setting' };
    return null;
  }

  function _scenesReferencing(refId, kind) {
    if (typeof createScenes === 'undefined' || !Array.isArray(createScenes)) return [];
    if (kind === 'character' || kind === 'presenter') {
      return createScenes.map((s, i) => (s.refCharacters || []).includes(refId) ? i : -1).filter(i => i >= 0);
    }
    if (kind === 'location' || kind === 'setting') {
      return createScenes.map((s, i) => s.refEnvironment === refId ? i : -1).filter(i => i >= 0);
    }
    if (kind === 'product') {
      return createScenes.map((s, i) => s.hasProduct ? i : -1).filter(i => i >= 0);
    }
    return [];
  }

  function _openEditModal(refId) {
    const found = _findRefById(refId);
    if (!found) return;
    const { item, kind } = found;
    const modal = document.getElementById('refs-edit-modal');
    const title = document.getElementById('refs-edit-modal-title');
    const body = document.getElementById('refs-edit-modal-body');
    if (!modal || !body) return;

    const icon = kind === 'product' ? '🎁'
              : kind === 'location' || kind === 'setting' ? '🏞'
              : kind === 'presenter' ? '🎤'
              : '👤';
    if (title) title.textContent = `${icon} ${item.name}`;
    const sceneIdx = _scenesReferencing(item.id, kind);
    const sceneTotal = (typeof createScenes !== 'undefined' && Array.isArray(createScenes)) ? createScenes.length : 0;
    const sceneLinks = sceneIdx.length > 0
      ? sceneIdx.map(i => `<button class="refs-modal-scene-link" data-scene-idx="${i}">Scene ${i + 1}</button>`).join(' ')
      : '<span class="text-muted">Not referenced in any scene yet.</span>';

    body.innerHTML = `
      <div class="refs-modal-row">
        <div class="refs-modal-thumb">${item.representativeImageDataUrl ? `<img src="${item.representativeImageDataUrl}">` : '<div class="cast-row-thumb-empty">no img</div>'}</div>
        <div class="refs-modal-meta">
          <div><strong>Status:</strong> ${item.locked ? '🔒 Locked' : '🔓 Unlocked'}</div>
          <div><strong>Style:</strong> ${escapeHtml(createStylePreset || 'cinematic')}</div>
          <div><strong>Scenes:</strong> ${sceneIdx.length} / ${sceneTotal}</div>
        </div>
      </div>
      <div class="refs-modal-section">
        <div class="refs-modal-label">Appearance</div>
        <textarea class="refs-modal-appearance" id="refs-modal-appearance" rows="5">${escapeHtml(item.appearanceSheet || '')}</textarea>
      </div>
      ${(item.distinctiveTraits && item.distinctiveTraits.length) ? `
        <div class="refs-modal-section">
          <div class="refs-modal-label">Distinctive traits</div>
          <ul class="refs-modal-traits">${item.distinctiveTraits.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
        </div>` : ''}
      <div class="refs-modal-section">
        <div class="refs-modal-label">Appears in</div>
        <div class="refs-modal-scenes">${sceneLinks}</div>
      </div>
      <div class="refs-modal-actions">
        <button class="btn-md" data-modal-action="regen-image">🎨 Regenerate image</button>
        <button class="btn-md" data-modal-action="upload-new">📎 Upload new ref</button>
        ${item.locked ? `<button class="btn-md" data-modal-action="save-library" title="Save to your cross-project library">💾 Save to library</button>` : ''}
        ${item.locked ? `<button class="btn-md danger" data-modal-action="unlock">🔓 Unlock</button>` : `<button class="btn-md primary" data-modal-action="lock">🔒 Lock</button>`}
        ${(kind !== 'product') ? `<button class="btn-md danger" data-modal-action="delete">🗑 Delete</button>` : ''}
      </div>
      <div class="refs-modal-status" id="refs-modal-status"></div>
      <input type="file" id="refs-modal-upload" accept="image/*" hidden>
    `;
    modal.hidden = false;
    modal.dataset.refId = refId;

    // Save appearance edits live
    const ta = body.querySelector('#refs-modal-appearance');
    if (ta) ta.addEventListener('input', () => { item.appearanceSheet = ta.value; });

    // Scene links pan canvas
    body.querySelectorAll('.refs-modal-scene-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.sceneIdx, 10);
        if (typeof window.CanvasGraph !== 'undefined' && window.CanvasGraph.panToColumn) {
          try { window.CanvasGraph.panToColumn(idx, 'sb'); _closeEditModal(); } catch (e) {}
        }
      });
    });

    // Action buttons
    body.querySelectorAll('button[data-modal-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.modalAction;
        const status = body.querySelector('#refs-modal-status');
        if (action === 'regen-image') {
          status.textContent = 'Regenerating image…';
          btn.disabled = true;
          try {
            const imgUrl = await window.generateRepresentativeImage(item, kind, getCreateGeminiKey());
            item.representativeImageDataUrl = imgUrl;
            if (typeof window._castSyncToLegacy === 'function') window._castSyncToLegacy();
            status.textContent = '✓ Image regenerated.';
            _refreshAfterEdit();
            _openEditModal(refId);  // re-render modal with new image
          } catch (e) {
            status.textContent = '⚠ Failed: ' + e.message;
          }
          btn.disabled = false;
        } else if (action === 'upload-new') {
          const input = body.querySelector('#refs-modal-upload');
          if (!input) return;
          input.onchange = async () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
              item.uploadedImageDataUrl = e.target.result;
              status.textContent = 'Generating with new reference…';
              try {
                const imgUrl = await window.generateRepresentativeImage(item, kind, getCreateGeminiKey());
                item.representativeImageDataUrl = imgUrl;
                if (typeof window._castSyncToLegacy === 'function') window._castSyncToLegacy();
                status.textContent = '✓ New reference applied.';
                _refreshAfterEdit();
                _openEditModal(refId);
              } catch (err) {
                status.textContent = '⚠ Failed: ' + err.message;
              }
            };
            reader.readAsDataURL(file);
          };
          input.click();
        } else if (action === 'unlock') {
          if (sceneIdx.length > 0) {
            if (!confirm(`Unlocking ${item.name} will mark ${sceneIdx.length} scene(s) as needing regen. Continue?`)) return;
          }
          item.locked = false;
          if (typeof window._castSyncToLegacy === 'function') window._castSyncToLegacy();
          _refreshAfterEdit();
          _closeEditModal();
        } else if (action === 'save-library') {
          const libId = window.castSaveToLibrary(refId);
          if (libId) status.textContent = '✓ Saved to library — available in future projects.';
          else status.textContent = '⚠ Save failed.';
        } else if (action === 'lock') {
          if (!item.appearanceSheet || !item.representativeImageDataUrl) {
            status.textContent = '⚠ Generate appearance + image before locking.';
            return;
          }
          item.locked = true;
          if (!window.createJobState.styleLocked) window.createJobState.styleLocked = true;
          if (typeof window._castSyncToLegacy === 'function') window._castSyncToLegacy();
          _refreshAfterEdit();
          _closeEditModal();
        } else if (action === 'delete') {
          if (!confirm(`Delete ${item.name}? This will remove all references to them in scenes.`)) return;
          if (kind === 'character') {
            window.createJobState.characters = (window.createJobState.characters || []).filter(c => c.id !== refId);
            (createScenes || []).forEach(s => {
              s.refCharacters = (s.refCharacters || []).filter(id => id !== refId);
            });
          } else if (kind === 'location') {
            window.createJobState.locations = (window.createJobState.locations || []).filter(l => l.id !== refId);
            (createScenes || []).forEach(s => { if (s.refEnvironment === refId) s.refEnvironment = -1; });
          } else if (kind === 'presenter') {
            window.createJobState.presenter = null;
            (createScenes || []).forEach(s => {
              s.refCharacters = (s.refCharacters || []).filter(id => id !== refId);
            });
          } else if (kind === 'setting') {
            window.createJobState.setting = null;
            (createScenes || []).forEach(s => { if (s.refEnvironment === refId) s.refEnvironment = -1; });
          }
          // Auto-clear filter if it was filtering on this id
          if (typeof window.CanvasGraph !== 'undefined' && window.CanvasGraph.notifyCharacterDeleted) {
            window.CanvasGraph.notifyCharacterDeleted(refId);
          }
          if (typeof window._castSyncToLegacy === 'function') window._castSyncToLegacy();
          _refreshAfterEdit();
          _closeEditModal();
        }
      });
    });
  }

  function _closeEditModal() {
    const modal = document.getElementById('refs-edit-modal');
    if (modal) { modal.hidden = true; modal.dataset.refId = ''; }
  }

  function _refreshAfterEdit() {
    if (typeof window.castRenderRows === 'function') window.castRenderRows();
    if (typeof window.brandRenderSlots === 'function') window.brandRenderSlots();
    if (typeof window.renderRefsPanel === 'function') {
      const panel = document.getElementById('create-refs-panel');
      const surface = (panel && panel.dataset.surface) || 'timeline';
      window.renderRefsPanel(surface);
    }
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
  }

  function _wirePanelActions() {
    const panel = document.getElementById('create-refs-panel');
    if (!panel || panel._actionsWired) return;
    panel._actionsWired = true;
    panel.addEventListener('click', (e) => {
      const isCanvas = panel.dataset.surface === 'canvas';
      if (!isCanvas) return;
      const editBtn = e.target.closest('.ref-action-btn[data-action="edit"]');
      if (editBtn) {
        const row = editBtn.closest('.refs-panel-row');
        if (row) _openEditModal(row.dataset.id);
        return;
      }
      // Filter button (Phase 5)
      const filterBtn = e.target.closest('.ref-action-btn[data-action="filter"]');
      if (filterBtn) {
        const row = filterBtn.closest('.refs-panel-row');
        if (!row) return;
        const refId = row.dataset.id;
        const kind = row.dataset.kind;
        // Only character/presenter are filterable (location/setting/product not in scope for v1)
        if (kind !== 'character' && kind !== 'presenter') return;
        if (typeof window.CanvasGraph === 'undefined' || !window.CanvasGraph.setCharacterFilter) return;
        window.CanvasGraph.setCharacterFilter(refId, {
          shift: e.shiftKey,
          cmd: e.metaKey || e.ctrlKey,
        });
        return;
      }
    });
    // Right-click on filter button → "Filter only this"
    panel.addEventListener('contextmenu', (e) => {
      const filterBtn = e.target.closest('.ref-action-btn[data-action="filter"]');
      if (!filterBtn) return;
      e.preventDefault();
      const isCanvas = panel.dataset.surface === 'canvas';
      if (!isCanvas) return;
      const row = filterBtn.closest('.refs-panel-row');
      if (!row) return;
      const refId = row.dataset.id;
      const kind = row.dataset.kind;
      if (kind !== 'character' && kind !== 'presenter') return;
      if (typeof window.CanvasGraph === 'undefined' || !window.CanvasGraph.setCharacterFilter) return;
      window.CanvasGraph.setCharacterFilter(refId, { right: true });
    });
  }

  function _wireModalDismiss() {
    const modal = document.getElementById('refs-edit-modal');
    if (!modal || modal._dismissWired) return;
    modal._dismissWired = true;
    modal.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'close-modal') _closeEditModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) _closeEditModal();
    });
  }

  // Add-character mid-project flow
  function _wireAddBtn() {
    const btn = document.getElementById('refs-panel-add-btn');
    const addModal = document.getElementById('refs-add-modal');
    const createBtn = document.getElementById('btn-refs-add-create');
    if (!btn || !addModal || !createBtn) return;

    if (!btn._wired) {
      btn._wired = true;
      btn.addEventListener('click', () => {
        const panel = document.getElementById('create-refs-panel');
        if (!panel || panel.dataset.surface !== 'canvas') return;
        // Reset form
        const nameEl = document.getElementById('refs-add-name');
        const descEl = document.getElementById('refs-add-desc');
        const upEl = document.getElementById('refs-add-upload');
        const status = document.getElementById('refs-add-status');
        if (nameEl) nameEl.value = '';
        if (descEl) descEl.value = '';
        if (upEl) upEl.value = '';
        if (status) status.textContent = '';
        addModal.hidden = false;
      });
    }

    if (!addModal._dismissWired) {
      addModal._dismissWired = true;
      addModal.addEventListener('click', (e) => {
        if (e.target.dataset.action === 'close-add-modal') addModal.hidden = true;
      });
    }

    if (!createBtn._wired) {
      createBtn._wired = true;
      createBtn.addEventListener('click', async () => {
        const nameEl = document.getElementById('refs-add-name');
        const descEl = document.getElementById('refs-add-desc');
        const upEl = document.getElementById('refs-add-upload');
        const status = document.getElementById('refs-add-status');
        const name = (nameEl?.value || '').trim();
        const desc = (descEl?.value || '').trim();
        if (!name || !desc) { if (status) status.textContent = '⚠ Name and description are required.'; return; }
        // Combined cap check
        const t = window.createJobState.videoType;
        const total = ((window.createJobState.characters || []).length) + ((window.createJobState.locations || []).length)
          + (window.createJobState.product ? 1 : 0)
          + (window.createJobState.presenter ? 1 : 0)
          + (window.createJobState.setting ? 1 : 0);
        if (total >= 6) { if (status) status.textContent = '⚠ Cap of 6 reached. Delete an existing entity first.'; return; }
        // Read uploaded file (if any)
        let uploaded = null;
        if (upEl && upEl.files && upEl.files[0]) {
          uploaded = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = e => resolve(e.target.result);
            r.onerror = reject;
            r.readAsDataURL(upEl.files[0]);
          });
        }
        // Create new character (mid-project — won't retroactively appear in old scenes)
        const newChar = {
          id: castNextId('char'),
          name,
          userDescription: desc,
          uploadedImageDataUrl: uploaded,
          appearanceSheet: '',
          distinctiveTraits: [],
          ageRange: '', build: '',
          representativeImageDataUrl: null,
          locked: false, libraryId: null,
          createdAt: new Date().toISOString(),
          midProject: true,
        };
        window.createJobState.characters = window.createJobState.characters || [];
        window.createJobState.characters.push(newChar);
        if (status) status.textContent = 'Generating appearance…';
        createBtn.disabled = true;
        try {
          const sheet = await window.generateAppearanceSheet(newChar, 'character', getCreateGeminiKey());
          newChar.appearanceSheet = sheet.appearance;
          newChar.distinctiveTraits = sheet.distinctiveTraits || [];
          newChar.ageRange = sheet.ageRange || '';
          newChar.build = sheet.build || '';
          if (status) status.textContent = 'Generating image…';
          const img = await window.generateRepresentativeImage(newChar, 'character', getCreateGeminiKey());
          newChar.representativeImageDataUrl = img;
          if (status) status.textContent = '✓ Generated. Review and lock from cast setup.';
          _refreshAfterEdit();
          setTimeout(() => { addModal.hidden = true; }, 800);
        } catch (e) {
          if (status) status.textContent = '⚠ Failed: ' + e.message;
        } finally {
          createBtn.disabled = false;
        }
      });
    }
  }

  function _initPhase4() {
    _wirePanelActions();
    _wireModalDismiss();
    _wireAddBtn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initPhase4);
  } else {
    _initPhase4();
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Phase 6 — Cross-project reference library (localStorage)
  // ──────────────────────────────────────────────────────────────────────────

  const LIB_KEY = 'stori_ref_library_v1';
  const LIB_CAP = 30;  // max entries; oldest evicted on overflow

  function _libRead() {
    try {
      const raw = localStorage.getItem(LIB_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function _libWrite(list) {
    try {
      // Cap + sort by recent
      const sorted = list.slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      const trimmed = sorted.slice(0, LIB_CAP);
      localStorage.setItem(LIB_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('[ref library] write failed (storage full?):', e.message);
    }
  }

  // Save an entity to the library. Returns the libraryId.
  function _libSave(item, kind) {
    const list = _libRead();
    const libId = item.libraryId || ('lib_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6));
    const entry = {
      libraryId: libId,
      kind,
      name: item.name,
      userDescription: item.userDescription || '',
      appearanceSheet: item.appearanceSheet || '',
      distinctiveTraits: item.distinctiveTraits || [],
      ageRange: item.ageRange || '',
      build: item.build || '',
      representativeImageDataUrl: item.representativeImageDataUrl || null,
      uploadedImageDataUrl: item.uploadedImageDataUrl || null,
      savedAt: Date.now(),
    };
    // Replace if same libraryId already exists; otherwise prepend
    const existingIdx = list.findIndex(x => x.libraryId === libId);
    if (existingIdx >= 0) list[existingIdx] = entry;
    else list.unshift(entry);
    _libWrite(list);
    item.libraryId = libId;
    return libId;
  }

  function _libDelete(libId) {
    const list = _libRead().filter(x => x.libraryId !== libId);
    _libWrite(list);
  }

  function _libList(kindFilter) {
    const all = _libRead();
    if (!kindFilter) return all;
    if (kindFilter === 'cast') {
      // Cast tab in brand mode: characters + presenters
      return all.filter(x => x.kind === 'character' || x.kind === 'presenter');
    }
    if (kindFilter === 'placeOrSetting') {
      return all.filter(x => x.kind === 'location' || x.kind === 'setting');
    }
    return all.filter(x => x.kind === kindFilter);
  }

  // Build the picker modal HTML and wire it
  function _openLibraryPicker(kindFilter, addCallback) {
    let modal = document.getElementById('refs-library-modal');
    if (!modal) {
      // Create on demand
      modal = document.createElement('div');
      modal.id = 'refs-library-modal';
      modal.className = 'refs-edit-modal';
      modal.hidden = true;
      modal.innerHTML = `
        <div class="refs-edit-modal-backdrop" data-action="lib-close"></div>
        <div class="refs-edit-modal-card">
          <header class="refs-edit-modal-head">
            <span class="refs-edit-modal-title">📚 Reference Library</span>
            <button class="refs-edit-modal-close" data-action="lib-close" aria-label="Close">×</button>
          </header>
          <div class="refs-edit-modal-body" id="refs-library-modal-body"></div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target.dataset.action === 'lib-close') { modal.hidden = true; }
      });
    }
    const body = modal.querySelector('#refs-library-modal-body');
    const list = _libList(kindFilter);
    if (list.length === 0) {
      body.innerHTML = `<div class="refs-library-empty">No items saved to library yet. Lock an entity, then click 💾 in the edit modal to save it for reuse across projects.</div>`;
    } else {
      body.innerHTML = `
        <p class="text-sm text-muted mb-md">${list.length} saved item(s). Click one to add it to your current project.</p>
        <div class="refs-library-grid">
          ${list.map(it => `
            <div class="refs-library-card" data-lib-id="${it.libraryId}">
              <div class="refs-library-thumb">${it.representativeImageDataUrl ? `<img src="${it.representativeImageDataUrl}" alt="">` : '·'}</div>
              <div class="refs-library-meta">
                <div class="refs-library-name">${escapeHtml(it.name)}</div>
                <div class="refs-library-sub">${escapeHtml(it.kind)} · saved ${_relTime(it.savedAt)}</div>
              </div>
              <button class="refs-library-delete-btn" data-lib-delete="${it.libraryId}" title="Delete from library">🗑</button>
            </div>`).join('')}
        </div>`;
    }
    modal.hidden = false;
    body.querySelectorAll('.refs-library-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-lib-delete]')) return;  // delete handler
        const libId = card.dataset.libId;
        const entry = _libRead().find(x => x.libraryId === libId);
        if (!entry) return;
        addCallback(entry);
        modal.hidden = true;
      });
    });
    body.querySelectorAll('[data-lib-delete]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const libId = btn.dataset.libDelete;
        if (!confirm('Delete this saved entity from your library?')) return;
        _libDelete(libId);
        _openLibraryPicker(kindFilter, addCallback);  // re-render
      });
    });
  }

  function _relTime(ts) {
    if (!ts) return '?';
    const d = Date.now() - ts;
    if (d < 60_000) return 'just now';
    if (d < 3_600_000) return Math.floor(d / 60_000) + 'm ago';
    if (d < 86_400_000) return Math.floor(d / 3_600_000) + 'h ago';
    return Math.floor(d / 86_400_000) + 'd ago';
  }

  // Public — used by edit modal "Save to library" button
  window.castSaveToLibrary = function (refId) {
    const found = _findRefById(refId);
    if (!found) return null;
    if (!found.item.locked) { alert('Lock the item before saving to library.'); return null; }
    const libId = _libSave(found.item, found.kind);
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
    return libId;
  };

  // Public — open picker for a given kind. Callback receives the library entry
  // and is responsible for adding it to the current project's data model.
  window.castOpenLibraryPicker = _openLibraryPicker;

  // Helper — instantiate an entity from a library entry into the current project.
  // The project-side ID is fresh (so removing it from the project doesn't affect
  // the library copy), but libraryId is preserved so re-saving updates in place.
  function _instantiateFromLibrary(entry, kind) {
    const baseFields = {
      name: entry.name,
      userDescription: entry.userDescription || '',
      uploadedImageDataUrl: entry.uploadedImageDataUrl || null,
      appearanceSheet: entry.appearanceSheet || '',
      distinctiveTraits: (entry.distinctiveTraits || []).slice(),
      ageRange: entry.ageRange || '',
      build: entry.build || '',
      representativeImageDataUrl: entry.representativeImageDataUrl || null,
      locked: false,
      libraryId: entry.libraryId,
      createdAt: new Date().toISOString(),
    };
    if (kind === 'character') return Object.assign({ id: castNextId('char') }, baseFields);
    if (kind === 'location') return Object.assign({ id: castNextId('loc') }, baseFields);
    if (kind === 'presenter') return Object.assign({ id: 'pres_' + Date.now().toString(36), role: 'presenter' }, baseFields);
    if (kind === 'setting') return Object.assign({ id: 'set_' + Date.now().toString(36) }, baseFields);
    if (kind === 'product') return Object.assign({ id: 'prod_' + Date.now().toString(36), brandColors: [], logoDataUrl: null }, baseFields);
    return null;
  }
  window._castInstantiateFromLibrary = _instantiateFromLibrary;
})();
