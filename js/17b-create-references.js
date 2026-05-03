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

(function initCastSetup() {
  if (!window.createJobState) window.createJobState = {};
  if (!Array.isArray(window.createJobState.characters)) window.createJobState.characters = [];
  if (!Array.isArray(window.createJobState.locations)) window.createJobState.locations = [];
  let _castNextId = 1;
  let _pendingUploadType = null;  // 'char' | 'loc'
  let _pendingUploadId = null;

  function castNextId(prefix) { return `${prefix}_${Date.now().toString(36)}_${(_castNextId++).toString(36)}`; }

  // Public — used by 17a updateCreateButtons to gate the launch button.
  window.castAllLocked = function () {
    const cs = window.createJobState.characters || [];
    const ls = window.createJobState.locations || [];
    if (cs.length === 0 && ls.length === 0) return true;
    return cs.every(c => c.locked) && ls.every(l => l.locked);
  };

  // Mirror locked refs to legacy globals so existing image-gen flow still works.
  function _syncToLegacy() {
    storyCharacters = (window.createJobState.characters || []).filter(c => c.locked).map(c => ({
      id: c.id,
      name: c.name,
      description: c.appearanceSheet || c.userDescription || '',
      imgDataUrl: c.representativeImageDataUrl || c.uploadedImageDataUrl || null,
      imgEl: null,
    }));
    storyEnvironments = (window.createJobState.locations || []).filter(l => l.locked).map(l => ({
      id: l.id,
      name: l.name,
      description: l.appearanceSheet || l.userDescription || '',
      imgDataUrl: l.representativeImageDataUrl || l.uploadedImageDataUrl || null,
      imgEl: null,
    }));
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
    return `<div class="cast-row" data-id="${item.id}" data-type="${type}">
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
    _wireUploadInput();
    // Show the setup card once user has audio/text input
    if (card) card.style.display = '';
  }

  // Initialize on DOM ready (or now if already loaded)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initStatic);
  } else {
    _initStatic();
  }

  // Bracket parsing utility — used after storyboard generation
  // Returns: { tokens: ['Maya', 'Joe'], idsCharacters: [...], idsLocations: [...] }
  window.castParseBracketTokens = function (promptText) {
    if (!promptText) return { tokens: [], characterIds: [], locationIds: [] };
    const tokens = (promptText.match(/\[([^\]]+)\]/g) || []).map(t => t.slice(1, -1).trim());
    const seen = new Set();
    const unique = tokens.filter(t => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    const chars = window.createJobState.characters || [];
    const locs = window.createJobState.locations || [];
    const characterIds = [];
    const locationIds = [];
    for (const tok of unique) {
      const c = chars.find(x => x.locked && (x.name || '').toLowerCase() === tok.toLowerCase());
      if (c) { characterIds.push(c.id); continue; }
      const l = locs.find(x => x.locked && (x.name || '').toLowerCase() === tok.toLowerCase());
      if (l) { locationIds.push(l.id); }
    }
    return { tokens: unique, characterIds, locationIds };
  };

  // Build the storyboard preamble injected into Gemini prompts.
  window.castBuildStoryboardPreamble = function () {
    const chars = (window.createJobState.characters || []).filter(c => c.locked);
    const locs = (window.createJobState.locations || []).filter(l => l.locked);
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
      scene.refCharacters = parsed.characterIds;
      // Use first matched location (existing field is single-valued)
      scene.refEnvironment = parsed.locationIds.length > 0 ? parsed.locationIds[0] : -1;
      scene.bracketTokens = parsed.tokens;
      scene.promptDirty = false;
    }
  };

  // Refs panel renderer (read-only on timeline; full features land in canvas Phase 4)
  window.renderRefsPanel = function (surface) {
    const panel = document.getElementById('create-refs-panel');
    if (!panel) return;
    const chars = window.createJobState.characters || [];
    const locs = window.createJobState.locations || [];
    const lockedChars = chars.filter(c => c.locked);
    const lockedLocs = locs.filter(l => l.locked);
    if (lockedChars.length === 0 && lockedLocs.length === 0) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    panel.dataset.surface = surface || 'timeline';
    const isCanvas = (surface === 'canvas');
    const activeTab = panel.dataset.activeTab || 'characters';
    const items = activeTab === 'locations' ? lockedLocs : lockedChars;
    const list = document.getElementById('refs-panel-list');
    if (!list) return;
    list.innerHTML = items.map(item => {
      const sceneCount = (typeof createScenes !== 'undefined' && Array.isArray(createScenes))
        ? createScenes.filter(s => activeTab === 'characters'
            ? (s.refCharacters || []).includes(item.id)
            : s.refEnvironment === item.id).length
        : 0;
      const totalScenes = (typeof createScenes !== 'undefined' && Array.isArray(createScenes)) ? createScenes.length : 0;
      return `<div class="refs-panel-row" data-id="${item.id}">
        <div class="refs-panel-thumb">${item.representativeImageDataUrl ? `<img src="${item.representativeImageDataUrl}" alt="">` : '·'}</div>
        <div class="refs-panel-meta">
          <div class="refs-panel-name">${escapeHtml(item.name)} 🔒</div>
          <div class="refs-panel-sub">${activeTab === 'characters' && item.ageRange ? item.ageRange + ' · ' : ''}${escapeHtml((createStylePreset || 'cinematic'))}</div>
          ${totalScenes > 0 ? `<div class="refs-panel-count">${sceneCount} / ${totalScenes} scenes</div>` : ''}
        </div>
        <div class="refs-panel-actions">
          <button class="ref-action-btn" data-action="filter" ${isCanvas ? '' : 'disabled'} title="${isCanvas ? 'Filter by this' : 'Open canvas to filter'}">👁</button>
          <button class="ref-action-btn" data-action="edit" ${isCanvas ? '' : 'disabled'} title="${isCanvas ? 'Edit' : 'Open canvas to edit'}">✏</button>
        </div>
      </div>`;
    }).join('') || '<div class="refs-panel-empty">No locked ' + activeTab + ' yet.</div>';

    // Tab switching
    panel.querySelectorAll('.refs-panel-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === activeTab);
      if (!tab._wired) {
        tab._wired = true;
        tab.addEventListener('click', () => {
          panel.dataset.activeTab = tab.dataset.tab;
          window.renderRefsPanel(panel.dataset.surface);
        });
      }
    });
  };
})();
