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

// ─── Phase 6 — Per-scene bible ref binding ─────────────────────────────
// Resolve a scene's [bracket] tokens against the bible's cellsByName index,
// load each referenced cell from IDB, and produce refParts (inlineData +
// text label) for the per-scene Gemini call. Capped at 4 inline images per
// call (Gemini practical limit). Prioritizes per-mode ordering.
//
// Returns: { parts: [{inlineData},{text},...], usedNames: ['Maya','palette'], dropped: [] }
async function castBuildSceneBibleRefParts(scene, opts) {
  const empty = { parts: [], usedNames: [], dropped: [] };
  const cs = window.createJobState || {};
  const bible = cs.bible;
  if (!bible || bible.status !== 'ready' || !window.castIdb) return empty;
  const cellsByName = bible.cellsByName || {};
  const t = cs.videoType;

  // Parse scene tokens
  const parsed = (typeof window.castParseBracketTokens === 'function')
    ? window.castParseBracketTokens(scene && scene.prompt || '')
    : { tokens: [] };
  const tokens = parsed.tokens || [];

  // Build candidate list in priority order based on mode.
  // Film:  characters → locations → palette → lighting → hero
  // Brand: product → presenter → setting → palette
  const candidates = [];
  const seen = new Set();
  const tryAdd = (name) => {
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    if (!cellsByName[name]) {
      // case-insensitive lookup
      const found = Object.keys(cellsByName).find(k => k.toLowerCase() === key);
      if (!found) return;
      name = found;
    }
    seen.add(key);
    candidates.push(name);
  };

  if (t === 'brand') {
    // Brand: scene's bracket tokens, with product (any product cell) bumped first
    const product = cs.product;
    if (product && product.locked && tokens.some(tok => tok.toLowerCase() === product.name.toLowerCase())) {
      tryAdd(product.name);
    }
    tokens.forEach(tok => tryAdd(tok));
    tryAdd('palette');
    // Allow lighting / hero as a 4th slot only if room remains
    tryAdd('lighting');
    tryAdd('hero');
  } else {
    // Film mode (or default)
    tokens.forEach(tok => tryAdd(tok));
    tryAdd('palette');
    tryAdd('lighting');
    tryAdd('hero');
  }

  // Cap at 4 refs total. Drop the lowest-priority (last-added) entries.
  const MAX_REFS = (opts && opts.maxRefs) || 4;
  const used = candidates.slice(0, MAX_REFS);
  const dropped = candidates.slice(MAX_REFS);

  // Hydrate each from IDB
  const parts = [];
  for (const name of used) {
    const ref = cellsByName[name];
    if (!ref) continue;
    const page = (bible.pages || []).find(p => p.pageIdx === ref.pageIdx);
    if (!page) continue;
    const slot = (page.slots || [])[ref.slotIdx];
    if (!slot || !slot.cellImageId) continue;
    let dataUrl = null;
    try { dataUrl = await window.castIdb.get(slot.cellImageId); } catch (_) {}
    if (!dataUrl || typeof dataUrl !== 'string') continue;
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) continue;
    parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
    // Label — entity vs utility
    const isUtility = (slot.priority === 'utility');
    if (isUtility) {
      const u = name === 'palette' ? 'project color palette and grade — match these tonal relationships'
        : name === 'lighting' ? 'project lighting setup — match key/fill/ambient'
        : name === 'hero' ? 'project hero composition reference — match overall mood/style'
        : `project utility reference (${name})`;
      parts.push({ text: `Reference: ${u}.` });
    } else {
      parts.push({ text: `Reference [${name}]: this is the canonical appearance from the project bible. When [${name}] appears in this scene, match this image's features, build, attire, color, and style exactly.` });
    }
  }
  return { parts, usedNames: used, dropped };
}
window.castBuildSceneBibleRefParts = castBuildSceneBibleRefParts;

// Batch-level (grid) variant — union of bracket tokens across all scenes in
// the batch. Same priority + cap rules.
async function castBuildBatchBibleRefParts(scenes, opts) {
  const merged = { prompt: '' };
  // Synthesize a virtual scene whose prompt concatenates all batch tokens
  // so tryAdd dedupes naturally.
  const allTokens = [];
  for (const s of (scenes || [])) {
    const parsed = (typeof window.castParseBracketTokens === 'function')
      ? window.castParseBracketTokens(s && s.prompt || '')
      : { tokens: [] };
    (parsed.tokens || []).forEach(t => allTokens.push(`[${t}]`));
  }
  merged.prompt = allTokens.join(' ');
  return castBuildSceneBibleRefParts(merged, opts);
}
window.castBuildBatchBibleRefParts = castBuildBatchBibleRefParts;
// ─── End Phase 6 ───────────────────────────────────────────────────────

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
    const narrator = document.getElementById('narrator-setup-card');
    if (castFilm) castFilm.style.display = (locked && t === 'film') ? '' : 'none';
    if (castBrand) castBrand.style.display = (locked && t === 'brand') ? '' : 'none';
    if (castNarr) castNarr.style.display = (locked && t === 'narration') ? '' : 'none';
    // Narrator section: universal — shows in all locked types
    if (narrator) narrator.style.display = (locked && t) ? '' : 'none';
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
          window.createJobState.narratorSetup = null;
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

  // G8 — global concurrency cap on AI rewrite calls. Per-scene _aiBusy guard
  // already prevents the same scene from firing twice; this caps total parallel
  // calls across all scenes. Excess calls queue FIFO.
  const AI_REWRITE_MAX_CONCURRENT = 2;
  let _aiInflightCount = 0;
  const _aiQueue = [];
  function _aiAcquireSlot() {
    return new Promise((resolve) => {
      if (_aiInflightCount < AI_REWRITE_MAX_CONCURRENT) {
        _aiInflightCount++;
        resolve();
      } else {
        _aiQueue.push(resolve);
      }
    });
  }
  function _aiReleaseSlot() {
    if (_aiQueue.length > 0) {
      const next = _aiQueue.shift();
      next();
    } else {
      _aiInflightCount = Math.max(0, _aiInflightCount - 1);
    }
  }
  window._castAiAcquireSlot = _aiAcquireSlot;
  window._castAiReleaseSlot = _aiReleaseSlot;
  window._castAiInflightCount = () => _aiInflightCount;

  // Click-to-preview lightbox for any cast / brand / panel / library thumbnail.
  // Opens a fullscreen modal with the image at native resolution.
  function _castOpenImagePreview(dataUrl, label) {
    if (!dataUrl) return;
    let modal = document.getElementById('cast-image-preview');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'cast-image-preview';
      modal.className = 'cast-image-preview';
      modal.innerHTML = `
        <div class="cast-image-preview-backdrop" data-action="close-preview"></div>
        <div class="cast-image-preview-card">
          <button class="cast-image-preview-close" data-action="close-preview" aria-label="Close">×</button>
          <img class="cast-image-preview-img" alt="">
          <div class="cast-image-preview-label"></div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target.dataset.action === 'close-preview') modal.hidden = true;
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hidden) modal.hidden = true;
      });
    }
    const imgEl = modal.querySelector('.cast-image-preview-img');
    const lblEl = modal.querySelector('.cast-image-preview-label');
    if (imgEl) imgEl.src = dataUrl;
    if (lblEl) lblEl.textContent = label || '';
    modal.hidden = false;
  }
  window.castOpenImagePreview = _castOpenImagePreview;

  // Wire click-to-preview on any thumb under the document. Delegated, idempotent.
  function _wireThumbPreviewDelegate() {
    if (window._castThumbPreviewWired) return;
    window._castThumbPreviewWired = true;
    document.addEventListener('click', (e) => {
      const thumb = e.target.closest(
        '.cast-row-thumb img, .refs-panel-thumb img, .refs-modal-thumb img, .refs-library-thumb img'
      );
      if (!thumb) return;
      // Skip if click was on a button overlay inside the thumb
      if (e.target.closest('button')) return;
      const src = thumb.getAttribute('src');
      if (!src || !src.startsWith('data:image') && !src.startsWith('blob:') && !src.startsWith('http')) return;
      // Pick a label from the closest card
      const row = thumb.closest('[data-id], .cast-row, .refs-panel-row, .refs-library-card, .refs-modal-row');
      let label = '';
      if (row) {
        const nameEl = row.querySelector('.cast-row-name, .refs-panel-name, .refs-library-name');
        if (nameEl) label = (nameEl.textContent || '').trim();
      }
      _castOpenImagePreview(src, label);
    });
    // Cursor cue on hover
    const styleId = 'cast-thumb-preview-cursor';
    if (!document.getElementById(styleId)) {
      const s = document.createElement('style');
      s.id = styleId;
      s.textContent = `.cast-row-thumb img, .refs-panel-thumb img, .refs-modal-thumb img, .refs-library-thumb img { cursor: zoom-in; }`;
      document.head.appendChild(s);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _wireThumbPreviewDelegate);
  } else {
    _wireThumbPreviewDelegate();
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  G3 — IndexedDB image storage
  //  Cast images (representativeImage / uploadedImage / logo) move to IDB,
  //  keyed by entity id. localStorage keeps text-only metadata.
  //  Falls back to localStorage with embedded images if IDB unavailable.
  // ──────────────────────────────────────────────────────────────────────────

  const IDB_DB_NAME = 'stori_cast_images_v1';
  const IDB_STORE = 'images';
  const IDB_AVAILABLE = (typeof indexedDB !== 'undefined');
  let _idbDb = null;

  async function _idbOpen() {
    if (!IDB_AVAILABLE) return null;
    if (_idbDb) return _idbDb;
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(IDB_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = (e) => { _idbDb = e.target.result; resolve(_idbDb); };
        req.onerror = () => { console.warn('[cast IDB] open failed'); resolve(null); };
      } catch (e) {
        console.warn('[cast IDB] exception:', e.message);
        resolve(null);
      }
    });
  }

  async function _idbPut(key, dataUrl) {
    const db = await _idbOpen();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([IDB_STORE], 'readwrite');
        tx.objectStore(IDB_STORE).put(dataUrl, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  async function _idbGet(key) {
    const db = await _idbOpen();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([IDB_STORE], 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  async function _idbDelete(key) {
    const db = await _idbOpen();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([IDB_STORE], 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) { resolve(); }
    });
  }

  // Persist all image dataURLs of an entity to IDB by id. Fire-and-forget — don't block UI.
  function _castPersistImages(item) {
    if (!IDB_AVAILABLE || !item || !item.id) return;
    if (item.representativeImageDataUrl) _idbPut('rep_' + item.id, item.representativeImageDataUrl);
    if (item.uploadedImageDataUrl)       _idbPut('upl_' + item.id, item.uploadedImageDataUrl);
    if (item.logoDataUrl)                _idbPut('logo_' + item.id, item.logoDataUrl);
  }

  // Hydrate image fields from IDB by id (mutates the item).
  async function _castHydrateImages(item) {
    if (!IDB_AVAILABLE || !item || !item.id) return;
    const [rep, upl, logo] = await Promise.all([
      _idbGet('rep_' + item.id),
      _idbGet('upl_' + item.id),
      _idbGet('logo_' + item.id),
    ]);
    if (rep && !item.representativeImageDataUrl) item.representativeImageDataUrl = rep;
    if (upl && !item.uploadedImageDataUrl) item.uploadedImageDataUrl = upl;
    if (logo && !item.logoDataUrl) item.logoDataUrl = logo;
  }

  // Delete all images of an entity from IDB.
  function _castDeleteImages(itemId) {
    if (!IDB_AVAILABLE || !itemId) return;
    _idbDelete('rep_' + itemId);
    _idbDelete('upl_' + itemId);
    _idbDelete('logo_' + itemId);
  }

  // Library uses different key prefix to avoid collisions when a project entity
  // and its library copy share data.
  function _libPersistImages(libraryId, rep, upl, logo) {
    if (!IDB_AVAILABLE || !libraryId) return;
    if (rep)  _idbPut('lib_' + libraryId + '_rep', rep);
    if (upl)  _idbPut('lib_' + libraryId + '_upl', upl);
    if (logo) _idbPut('lib_' + libraryId + '_logo', logo);
  }
  async function _libHydrateImage(libraryId) {
    if (!IDB_AVAILABLE || !libraryId) return null;
    return await _idbGet('lib_' + libraryId + '_rep');
  }
  function _libDeleteImages(libraryId) {
    if (!IDB_AVAILABLE || !libraryId) return;
    _idbDelete('lib_' + libraryId + '_rep');
    _idbDelete('lib_' + libraryId + '_upl');
    _idbDelete('lib_' + libraryId + '_logo');
  }

  window._castPersistImages = _castPersistImages;
  window._castHydrateImages = _castHydrateImages;
  window._castDeleteImages = _castDeleteImages;
  window._libPersistImages = _libPersistImages;
  window._libHydrateImage = _libHydrateImage;
  window._libDeleteImages = _libDeleteImages;
  window._castIdbAvailable = () => IDB_AVAILABLE;

  // Generic IDB key access — used by bible code in 17c / 29 to persist
  // composites and per-cell crops without duplicating the IDB infra.
  window.castIdb = {
    available: () => IDB_AVAILABLE,
    put: _idbPut,
    get: _idbGet,
    del: _idbDelete,
  };

  // G5 — shared name-collision check across all locked entities (characters,
  // locations, product, presenter, setting). Used by both _lockItem (cast) and
  // _brandLock (brand). Returns true if another locked entity has the same name
  // (case-insensitive). excludeId allows checking before locking the item itself.
  function _castNameCollision(name, excludeId) {
    if (!name) return false;
    const lc = name.trim().toLowerCase();
    if (!lc) return false;
    const all = [
      ...(window.createJobState.characters || []),
      ...(window.createJobState.locations || []),
      window.createJobState.product,
      window.createJobState.presenter,
      window.createJobState.setting,
    ].filter(Boolean);
    return all.some(x => x.id !== excludeId && x.locked
      && (x.name || '').trim().toLowerCase() === lc);
  }
  window._castNameCollision = _castNameCollision;

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
    // Narrator (if defined) must be locked
    const narr = window.createJobState && window.createJobState.narrator;
    if (narr && !narr.locked) return false;
    if (t === 'narration') return true;   // narration with locked narrator OR no narrator both pass
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
        ${item._detected && !hasSheet ? `<button class="btn-xs cast-dismiss-btn" data-action="dismiss" title="Don't suggest this in future detections">✕ Not a ${isChar ? 'character' : 'location'}</button>` : ''}
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
          } else if (action === 'dismiss') {
            _dismissDetection(item, type);
          }
        });
      });
    });
  }

  // G7 — record a dismissed detection so future detect runs skip this name+kind.
  // Removes the row immediately. Cap dismissals at 50 to avoid unbounded growth.
  function _dismissDetection(item, type) {
    if (!item.name) return;
    window.createJobState.dismissedDetections = window.createJobState.dismissedDetections || [];
    const ds = window.createJobState.dismissedDetections;
    const entry = { name: item.name.trim(), kind: type };
    const exists = ds.some(d => (d.name || '').toLowerCase() === entry.name.toLowerCase() && d.kind === entry.kind);
    if (!exists) ds.push(entry);
    if (ds.length > 50) ds.splice(0, ds.length - 50);
    // Remove the row
    if (type === 'character') {
      window.createJobState.characters = (window.createJobState.characters || []).filter(c => c.id !== item.id);
    } else if (type === 'location') {
      window.createJobState.locations = (window.createJobState.locations || []).filter(l => l.id !== item.id);
    }
    renderCastRows();
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
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
  // Template-selected gate. Cast image generation depends on the chosen style
  // preset; if no template is selected, generated images would be in a default
  // style and trigger needsRegen as soon as the user picks a template.
  function _hasTemplateSelected() {
    return !!(typeof selectedTemplate !== 'undefined' && selectedTemplate);
  }

  // Apply template gate to all Detect / Generate buttons. Called from
  // applyTemplate (17a) hook so picking/unpicking a template updates state.
  function _castUpdateTemplateGate() {
    const hasTpl = _hasTemplateSelected();
    const detectCast = document.getElementById('btn-cast-detect');
    const detectCastStatus = document.getElementById('cast-detect-status');
    if (detectCast) {
      detectCast.disabled = !hasTpl;
      if (detectCastStatus && !hasTpl) detectCastStatus.textContent = '⚠ Pick a template above first.';
      else if (detectCastStatus && detectCastStatus.textContent.startsWith('⚠ Pick a template')) {
        detectCastStatus.textContent = 'Available after script lands.';
      }
    }
    const detectBrand = document.getElementById('btn-brand-detect');
    const detectBrandStatus = document.getElementById('brand-detect-status');
    if (detectBrand) {
      detectBrand.disabled = !hasTpl;
      if (detectBrandStatus && !hasTpl) detectBrandStatus.textContent = '⚠ Pick a template above first.';
      else if (detectBrandStatus && detectBrandStatus.textContent.startsWith('⚠ Pick a template')) {
        detectBrandStatus.textContent = 'Available after script lands.';
      }
    }
    // Re-eval Generate buttons too
    if (typeof _updateGenerateButton === 'function') _updateGenerateButton();
    if (typeof _updateBrandGenerateButton === 'function') _updateBrandGenerateButton();
  }
  window.castUpdateTemplateGate = _castUpdateTemplateGate;

  function _updateGenerateButton() {
    const btn = document.getElementById('btn-cast-generate');
    const hint = document.getElementById('cast-action-hint');
    if (!btn) return;
    const hasTpl = _hasTemplateSelected();
    const chars = window.createJobState.characters || [];
    const locs = window.createJobState.locations || [];
    const all = [...chars, ...locs];
    const editable = all.filter(x => !x.locked && !x.appearanceSheet);
    const valid = editable.length > 0 && editable.every(x => (x.name || '').trim() && (x.userDescription || '').trim());
    btn.disabled = !hasTpl || !valid;
    if (hint) {
      if (!hasTpl) hint.textContent = '⚠ Pick a template above first — style is needed before generating images.';
      else hint.textContent = valid ? 'Click to generate canonical appearances and reference images.' : 'Fill all names and descriptions to enable.';
    }
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
    // G5 — name-collision check across all locked entities
    if (_castNameCollision(item.name, item.id)) {
      alert(`Another locked entity is already named "${item.name}". Rename one of them before locking.`);
      return;
    }
    if (!item.appearanceSheet || !item.representativeImageDataUrl) {
      alert('Generate appearance and image before locking.');
      return;
    }
    // G7 — clear any matching dismissal so future detects could re-suggest
    if (window.createJobState.dismissedDetections && item.name) {
      const lc = item.name.trim().toLowerCase();
      window.createJobState.dismissedDetections = window.createJobState.dismissedDetections
        .filter(d => !((d.name || '').toLowerCase() === lc && d.kind === type));
    }
    item.locked = true;
    item.lockedAt = new Date().toISOString();
    item.needsRegen = false;
    // First lock in the project soft-locks the style
    if (!window.createJobState.styleLocked) window.createJobState.styleLocked = true;
    _syncToLegacy();
    renderCastRows();
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
    // Phase 10 — if a ready bible already exists, fold the new entity in.
    // Async; doesn't block the lock UI. Failure surfaces via alert in the
    // addEntityToBible path itself.
    const bb = window.createJobState && window.createJobState.bible;
    if (bb && bb.status === 'ready' && typeof window.addEntityToBible === 'function') {
      window.addEntityToBible(item.name).catch(e => {
        console.warn('[Bible] Add-to-bible after lock failed:', e.message);
      });
    }
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
        let script = window.readCurrentScriptText();
        // G9 — audio/podcast mode without transcript yet → run mini-transcribe first
        if ((!script || script.length < 30) && typeof createAudioBuffer !== 'undefined' && createAudioBuffer
            && typeof window.transcribeAudioOnly === 'function') {
          detectBtn.disabled = true;
          if (detectStatus) detectStatus.textContent = 'Transcribing audio…';
          try {
            await window.transcribeAudioOnly();
            script = window.readCurrentScriptText();
          } catch (e) {
            if (detectStatus) detectStatus.textContent = '⚠ Transcription failed: ' + (e.message || 'unknown error');
            detectBtn.disabled = false;
            return;
          }
        }
        if (!script || script.length < 30) {
          if (detectStatus) detectStatus.textContent = 'Script too short or empty. Paste/import script first.';
          detectBtn.disabled = false;
          return;
        }
        detectBtn.disabled = true;
        if (detectStatus) detectStatus.textContent = 'Analyzing script…';
        try {
          const result = await window.detectRefsFromScript(script, 'film', getCreateGeminiKey());
          const rawChars = (result && Array.isArray(result.characters)) ? result.characters : [];
          const rawLocs = (result && Array.isArray(result.locations)) ? result.locations : [];
          // G7 — filter dismissed detections
          const dismissed = window.createJobState.dismissedDetections || [];
          const isDismissed = (name, kind) => dismissed.some(d =>
            (d.name || '').toLowerCase() === (name || '').toLowerCase() && d.kind === kind);
          const chars = rawChars.filter(c => !isDismissed(c.name, 'character'));
          const locs = rawLocs.filter(l => !isDismissed(l.name, 'location'));
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
              _detected: true,
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
              _detected: true,
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

    // Apply template gate on init (handles fresh page load with no template yet)
    _castUpdateTemplateGate();

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

  // G1 — restore cast from autosave on init. Only fires when there is a recent
  // autosave AND in-memory createJobState is still empty (fresh page load).
  function _rehydrate(saved) {
    if (!saved) return null;
    return Object.assign({
      _generating: false,
      _captioning: false,
      distinctiveTraits: [],
      brandColors: [],
    }, saved);
  }

  function _castRestoreFromAutosave() {
    if (typeof restoreAutoSaveIfAvailable !== 'function') return;
    const state = restoreAutoSaveIfAvailable();
    if (!state) return;
    const cs = window.createJobState;
    if ((cs.characters && cs.characters.length > 0) ||
        (cs.locations && cs.locations.length > 0) ||
        cs.product || cs.presenter || cs.setting) return;
    if (state.videoType) {
      cs.videoType = state.videoType;
      cs.videoTypeLocked = !!state.videoTypeLocked;
    }
    cs.styleLocked = !!state.styleLocked;
    if (Array.isArray(state.castCharacters)) cs.characters = state.castCharacters.map(_rehydrate);
    if (Array.isArray(state.castLocations))  cs.locations  = state.castLocations.map(_rehydrate);
    if (state.product)   cs.product   = _rehydrate(state.product);
    if (state.presenter) cs.presenter = _rehydrate(state.presenter);
    if (state.setting)   cs.setting   = _rehydrate(state.setting);
    if (state.narrator)  cs.narrator  = _rehydrate(state.narrator);
    if (state.narratorSetup) cs.narratorSetup = {
      prompt: state.narratorSetup.prompt || '',
      imageDataUrl: null,           // hydrated from IDB asynchronously in a later step
      locked: !!state.narratorSetup.locked,
      canvasPosition: state.narratorSetup.canvasPosition || null,
    };
    // Visual bible — restore metadata; image bytes stay in IDB
    if (state.bible) {
      cs.bible = {
        id: state.bible.id,
        status: state.bible.status || 'pending',
        templateId: state.bible.templateId || null,
        styleFingerprint: state.bible.styleFingerprint || null,
        generatedAt: state.bible.generatedAt || null,
        lastError: state.bible.lastError || null,
        pages: (state.bible.pages || []).map(p => ({
          pageIdx: p.pageIdx,
          gridImageId: p.gridImageId || null,
          gridImageDisplayId: p.gridImageDisplayId || null,
          slots: (p.slots || []).map(s => ({
            idx: s.idx, name: s.name, priority: s.priority, locked: !!s.locked,
            cellImageId: s.cellImageId || null,
            baseEntityName: s.baseEntityName || null,
            angleVariation: s.angleVariation || null,
            versions: (s.versions || []).slice(),
          })),
        })),
        cellsByName: state.bible.cellsByName || {},
        canvasPosition: state.bible.canvasPosition || null,
      };
    }
    cs.templateLocked   = !!state.templateLocked;
    cs.templateLockedAt = state.templateLockedAt || null;
    if (Array.isArray(state.dismissedDetections)) cs.dismissedDetections = state.dismissedDetections.slice();
    if (Array.isArray(state.transcribedSegments)) cs.transcribedSegments = state.transcribedSegments.slice();
    if (typeof window._castSyncToLegacy === 'function') window._castSyncToLegacy();
    if (typeof window.applyVideoTypeVisibility === 'function') window.applyVideoTypeVisibility();
    if (typeof window.castRenderRows === 'function') window.castRenderRows();
    if (typeof window.brandRenderSlots === 'function') window.brandRenderSlots();
    if (typeof window.narratorRenderSlot === 'function') window.narratorRenderSlot();
    if (typeof window.castShowMutexHints === 'function') window.castShowMutexHints();
    if (typeof window.renderRefsPanel === 'function') window.renderRefsPanel('timeline');
    // G3 — hydrate images from IDB asynchronously; re-render when each lands
    if (typeof window._castHydrateImages === 'function' && window._castIdbAvailable && window._castIdbAvailable()) {
      const allItems = [
        ...(cs.characters || []),
        ...(cs.locations || []),
        cs.product, cs.presenter, cs.setting, cs.narrator,
      ].filter(Boolean);
      Promise.all(allItems.map(it => window._castHydrateImages(it))).then(() => {
        if (typeof window._castSyncToLegacy === 'function') window._castSyncToLegacy();
        if (typeof window.castRenderRows === 'function') window.castRenderRows();
        if (typeof window.brandRenderSlots === 'function') window.brandRenderSlots();
        if (typeof window.narratorRenderSlot === 'function') window.narratorRenderSlot();
        if (typeof window.renderRefsPanel === 'function') window.renderRefsPanel('timeline');
      });
    }
  }

  // Initialize on DOM ready (or now if already loaded)
  function _initWithRestore() {
    _castRestoreFromAutosave();
    _initStatic();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initWithRestore);
  } else {
    _initWithRestore();
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
    const hasTpl = (typeof selectedTemplate !== 'undefined' && selectedTemplate);
    const items = [];
    if (window.createJobState.product) items.push(window.createJobState.product);
    if (window.createJobState.presenter) items.push(window.createJobState.presenter);
    if (window.createJobState.setting) items.push(window.createJobState.setting);
    const editable = items.filter(x => !x.locked && !x.appearanceSheet);
    const valid = editable.length > 0 && editable.every(x => (x.name || '').trim() && (x.userDescription || '').trim());
    btn.disabled = !hasTpl || !valid;
    row.style.display = editable.length > 0 ? '' : 'none';
    if (hint) {
      if (!hasTpl) hint.textContent = '⚠ Pick a template above first — style is needed before generating images.';
      else hint.textContent = valid ? 'Click to generate hero shots and appearance sheets.' : 'Fill name and description for product/presenter/setting to enable.';
    }
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
    // G5 — name-collision check across all locked entities
    if (window._castNameCollision && window._castNameCollision(item.name, item.id)) {
      alert(`Another locked entity is already named "${item.name}". Rename one of them before locking.`);
      return;
    }
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
        let script = window.readCurrentScriptText();
        // G9 — audio/podcast mode without transcript yet → mini-transcribe first
        if ((!script || script.length < 30) && typeof createAudioBuffer !== 'undefined' && createAudioBuffer
            && typeof window.transcribeAudioOnly === 'function') {
          detectBtn.disabled = true;
          if (detectStatus) detectStatus.textContent = 'Transcribing audio…';
          try {
            await window.transcribeAudioOnly();
            script = window.readCurrentScriptText();
          } catch (e) {
            if (detectStatus) detectStatus.textContent = '⚠ Transcription failed: ' + (e.message || 'unknown error');
            detectBtn.disabled = false;
            return;
          }
        }
        if (!script || script.length < 30) {
          if (detectStatus) detectStatus.textContent = 'Script too short or empty. Paste/import script first.';
          detectBtn.disabled = false;
          return;
        }
        detectBtn.disabled = true;
        if (detectStatus) detectStatus.textContent = 'Analyzing script…';
        try {
          const result = await window.detectRefsFromScript(script, 'brand', getCreateGeminiKey());
          if (!result || !result.product) throw new Error('No product detected');
          // G7 — filter dismissed detections (product/presenter/setting respect dismissals)
          const dismissed = window.createJobState.dismissedDetections || [];
          const isDismissed = (name, kind) => name && dismissed.some(d =>
            (d.name || '').toLowerCase() === name.toLowerCase() && d.kind === kind);
          if (isDismissed(result.product.name, 'product')) {
            if (detectStatus) detectStatus.textContent = '⚠ Product was previously dismissed. Re-add it manually if you want it back.';
            detectBtn.disabled = false;
            return;
          }
          if (isDismissed(result.presenter && result.presenter.name, 'presenter')) result.presenter = null;
          if (isDismissed(result.setting && result.setting.name, 'setting')) result.setting = null;
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
            _detected: true,
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

  // ──────────────────────────────────────────────────────────────────────────
  //  NARRATOR — universal across all video types.
  //  Mutex with character voices: if narrator is defined, all audio is the
  //  narrator's voice; characters appear visually but don't speak.
  //  If narrator is undefined, characters speak their own lines (existing flow).
  //  Narrator is NEVER bracketed in scene prompts.
  // ──────────────────────────────────────────────────────────────────────────

  let _narratorPendingUpload = false;

  function _renderNarratorSlot() {
    const slot = document.getElementById('narrator-slot');
    const addRow = document.getElementById('narrator-add-row');
    const actionRow = document.getElementById('narrator-action-row');
    if (!slot) return;
    const n = window.createJobState.narrator;
    if (!n) {
      slot.innerHTML = '';
      if (addRow) addRow.style.display = '';
      if (actionRow) actionRow.style.display = 'none';
      return;
    }
    if (addRow) addRow.style.display = 'none';
    if (n.locked) {
      slot.innerHTML = `<div class="cast-row cast-row-locked">
        <div class="cast-row-thumb">${n.representativeImageDataUrl ? `<img src="${n.representativeImageDataUrl}">` : '<div class="cast-row-thumb-empty">no img</div>'}</div>
        <div class="cast-row-meta">
          <div class="cast-row-name">🎙 ${escapeHtml(n.name)} <span class="cast-row-locked-badge">🔒 Narrator locked</span></div>
          <div class="cast-row-sub">${n.onScreenStyle === 'talking-head' ? 'Talking head' : 'Voice only'} · ${escapeHtml((n.appearanceSheet || '').slice(0, 80))}</div>
        </div>
        <div class="cast-row-actions">
          <button class="btn-xs" data-narrator-action="unlock">🔓 Unlock</button>
          <button class="btn-xs" data-narrator-action="remove">✕ Remove</button>
        </div>
      </div>`;
      if (actionRow) actionRow.style.display = 'none';
    } else {
      const isGenerating = !!n._generating;
      const needsRegen = !!n.needsRegen;
      const onScreen = n.onScreenStyle || 'voice-only';
      const showFields = onScreen !== 'voice-only';
      slot.innerHTML = `<div class="cast-row${needsRegen ? ' cast-row-needs-regen' : ''}" data-narrator-row="1">
        <div class="cast-row-thumb">
          ${n.representativeImageDataUrl ? `<img src="${n.representativeImageDataUrl}">`
            : n.uploadedImageDataUrl ? `<img src="${n.uploadedImageDataUrl}" class="cast-row-thumb-pending">`
            : `<div class="cast-row-thumb-empty">${onScreen === 'voice-only' ? '🎙' : 'no img'}</div>`}
          ${isGenerating ? '<div class="cast-row-thumb-spinner"></div>' : ''}
        </div>
        <div class="cast-row-fields">
          <div class="narrator-style-row">
            <label class="narrator-style-opt"><input type="radio" name="narrator-style" value="voice-only" ${onScreen === 'voice-only' ? 'checked' : ''}> Voice only</label>
            <label class="narrator-style-opt"><input type="radio" name="narrator-style" value="talking-head" ${onScreen === 'talking-head' ? 'checked' : ''}> Talking head</label>
          </div>
          ${showFields ? `<input type="text" placeholder="Narrator name (e.g. Host)" value="${escapeHtml(n.name)}" data-narrator-field="name">` : ''}
          ${showFields ? `<textarea rows="2" placeholder="Description (e.g. late 30s, navy suit, glasses)" data-narrator-field="userDescription">${escapeHtml(n.userDescription || '')}</textarea>` : ''}
          ${!showFields ? `<input type="text" placeholder="Narrator name (e.g. Voice-over)" value="${escapeHtml(n.name)}" data-narrator-field="name">` : ''}
          ${n.appearanceSheet ? `<div class="cast-row-sheet"><strong>Appearance:</strong> ${escapeHtml(n.appearanceSheet)}</div>` : ''}
          ${needsRegen ? '<div class="cast-row-regen-badge">⚠ Style changed — regenerate to lock</div>' : ''}
        </div>
        <div class="cast-row-actions">
          ${showFields ? `<button class="btn-xs" data-narrator-action="upload">${n.uploadedImageDataUrl ? '🔄 Change' : '📎 Upload ref'}</button>` : ''}
          ${n.appearanceSheet && showFields ? `<button class="btn-xs" data-narrator-action="regen-image" ${isGenerating ? 'disabled' : ''}>🎨 Regen</button>` : ''}
          ${(showFields ? (n.appearanceSheet && n.representativeImageDataUrl) : (n.name && n.name.trim())) ? `<button class="btn-xs primary" data-narrator-action="lock">🔒 Lock</button>` : ''}
          <button class="btn-xs" data-narrator-action="remove">✕ Remove</button>
        </div>
      </div>`;
      _updateNarratorGenerateButton();
    }
    _wireNarratorRow();
    _renderNarratorSetup();
  }

  function _wireNarratorRow() {
    const slot = document.getElementById('narrator-slot');
    if (!slot) return;
    const n = window.createJobState.narrator;
    if (!n) return;

    slot.querySelectorAll('input[data-narrator-field], textarea[data-narrator-field]').forEach(field => {
      field.addEventListener('input', () => {
        n[field.dataset.narratorField] = field.value;
        _updateNarratorGenerateButton();
      });
    });
    slot.querySelectorAll('input[name="narrator-style"]').forEach(r => {
      r.addEventListener('change', () => {
        n.onScreenStyle = r.value;
        // Setup composite is only meaningful for talking-head; clear it on switch
        if (r.value !== 'talking-head') window.createJobState.narratorSetup = null;
        _renderNarratorSlot();
      });
    });
    slot.querySelectorAll('button[data-narrator-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.narratorAction;
        if (a === 'upload') {
          _narratorPendingUpload = true;
          const input = document.getElementById('cast-img-upload');
          if (input) input.click();
        } else if (a === 'regen-image') {
          _narratorRegenImage();
        } else if (a === 'lock') {
          _narratorLock();
        } else if (a === 'unlock') {
          _narratorUnlock();
        } else if (a === 'remove') {
          if (n.locked) {
            if (!confirm('Remove the locked narrator? Characters will resume speaking their own lines.')) return;
          }
          window.createJobState.narrator = null;
          window.createJobState.narratorSetup = null;
          _renderNarratorSlot();
          _showMutexHints();
          if (typeof updateCreateButtons === 'function') updateCreateButtons();
          if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
        }
      });
    });
  }

  function _updateNarratorGenerateButton() {
    const btn = document.getElementById('btn-narrator-generate');
    const hint = document.getElementById('narrator-action-hint');
    const row = document.getElementById('narrator-action-row');
    if (!btn || !row) return;
    const n = window.createJobState.narrator;
    if (!n || n.locked || n.appearanceSheet) {
      row.style.display = 'none';
      return;
    }
    const onScreen = n.onScreenStyle || 'voice-only';
    const hasTpl = (typeof selectedTemplate !== 'undefined' && selectedTemplate);
    if (onScreen === 'voice-only') {
      // Voice-only narrator doesn't need image gen — skip Generate button entirely
      row.style.display = 'none';
      return;
    }
    row.style.display = '';
    const valid = (n.name || '').trim() && (n.userDescription || '').trim();
    btn.disabled = !hasTpl || !valid;
    if (hint) {
      if (!hasTpl) hint.textContent = '⚠ Pick a template above first.';
      else hint.textContent = valid ? 'Click to generate the narrator portrait.' : 'Fill name and description to enable.';
    }
  }

  async function _narratorGenerateOne() {
    const n = window.createJobState.narrator;
    if (!n) return;
    const key = getCreateGeminiKey();
    if (!key) return;
    n._generating = true;
    _renderNarratorSlot();
    try {
      const sheet = await window.generateAppearanceSheet(n, 'narrator', key);
      n.appearanceSheet = sheet.appearance;
      n.distinctiveTraits = sheet.distinctiveTraits || [];
      const imgUrl = await window.generateRepresentativeImage(n, 'narrator', key);
      n.representativeImageDataUrl = imgUrl;
    } catch (e) {
      console.warn('[narrator generate]', e.message);
    } finally {
      n._generating = false;
      _renderNarratorSlot();
    }
  }

  async function _narratorRegenImage() {
    const n = window.createJobState.narrator;
    if (!n) return;
    const key = getCreateGeminiKey();
    if (!key) return;
    n._generating = true;
    _renderNarratorSlot();
    try {
      const imgUrl = await window.generateRepresentativeImage(n, 'narrator', key);
      n.representativeImageDataUrl = imgUrl;
    } catch (e) { console.warn('[narrator regen]', e.message); }
    n._generating = false;
    _renderNarratorSlot();
  }

  function _narratorLock() {
    const n = window.createJobState.narrator;
    if (!n) return;
    if ((n.onScreenStyle || 'voice-only') !== 'voice-only') {
      if (!n.appearanceSheet || !n.representativeImageDataUrl) {
        alert('Generate the narrator portrait before locking.');
        return;
      }
    } else {
      if (!(n.name || '').trim()) { alert('Enter a name before locking.'); return; }
    }
    if (window._castNameCollision && window._castNameCollision(n.name, n.id)) {
      alert(`Another locked entity is already named "${n.name}". Rename one of them before locking.`);
      return;
    }
    n.locked = true;
    n.lockedAt = new Date().toISOString();
    n.needsRegen = false;
    if (!window.createJobState.styleLocked) window.createJobState.styleLocked = true;
    _renderNarratorSlot();
    _showMutexHints();
    if (typeof updateCreateButtons === 'function') updateCreateButtons();
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
  }

  function _narratorUnlock() {
    const n = window.createJobState.narrator;
    if (!n) return;
    n.locked = false;
    _renderNarratorSlot();
    _showMutexHints();
    if (typeof updateCreateButtons === 'function') updateCreateButtons();
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
  }

  function _showMutexHints() {
    // Surface a soft hint inside cast/brand cards when narrator is locked.
    const isNarrMode = !!(window.createJobState.narrator && window.createJobState.narrator.locked);
    document.querySelectorAll('#cast-setup-card, #brand-setup-card').forEach(card => {
      let banner = card.querySelector('.narrator-mutex-banner');
      if (isNarrMode) {
        if (!banner) {
          banner = document.createElement('div');
          banner.className = 'narrator-mutex-banner';
          banner.innerHTML = '🎙 <strong>Narrator defined</strong> — characters appear visually only. All audio is the narrator\'s voice.';
          card.insertBefore(banner, card.firstChild.nextSibling);
        }
      } else if (banner) {
        banner.remove();
      }
    });
  }
  window.castShowMutexHints = _showMutexHints;

  function _wireNarratorUpload() {
    const input = document.getElementById('cast-img-upload');
    if (!input || input._narratorWired) return;
    input._narratorWired = true;
    input.addEventListener('change', async () => {
      if (!_narratorPendingUpload) return;
      const file = input.files && input.files[0];
      if (!file) { _narratorPendingUpload = false; return; }
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result;
        const n = window.createJobState.narrator;
        if (n) {
          n.uploadedImageDataUrl = dataUrl;
          if (!n.userDescription && typeof window.autoCaptionFromImage === 'function') {
            n._captioning = true;
            _renderNarratorSlot();
            try {
              const cap = await window.autoCaptionFromImage(dataUrl, 'character', getCreateGeminiKey());
              if (cap) n.userDescription = cap;
            } catch (e2) {}
            n._captioning = false;
          }
          _renderNarratorSlot();
        }
        _narratorPendingUpload = false;
        input.value = '';
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Narrator setup (talking-head): composite of portrait inserted into a chosen set ──
  function _renderNarratorSetup() {
    const sect = document.getElementById('narrator-setup-section');
    if (!sect) return;
    const n = window.createJobState.narrator;
    const showSetup = !!(n && n.locked && n.onScreenStyle === 'talking-head' && n.representativeImageDataUrl);
    sect.style.display = showSetup ? '' : 'none';
    if (!showSetup) return;
    if (!window.createJobState.narratorSetup) {
      window.createJobState.narratorSetup = { prompt: '', imageDataUrl: null, locked: false, canvasPosition: null };
    }
    const setup = window.createJobState.narratorSetup;
    const promptEl = document.getElementById('narrator-setup-prompt');
    const thumb    = document.getElementById('narrator-setup-thumb');
    const composeBtn = document.getElementById('btn-narrator-setup-compose');
    const lockBtn    = document.getElementById('btn-narrator-setup-lock');
    const unlockBtn  = document.getElementById('btn-narrator-setup-unlock');
    const hint       = document.getElementById('narrator-setup-hint');
    if (promptEl && promptEl.value !== (setup.prompt || '')) promptEl.value = setup.prompt || '';
    if (promptEl) promptEl.disabled = !!setup.locked;
    if (thumb) {
      if (setup.imageDataUrl) {
        thumb.innerHTML = `<img src="${setup.imageDataUrl}" alt="narrator setup" style="width:100%;height:100%;object-fit:cover;border-radius:6px;cursor:pointer;" data-narrator-setup-preview="1">`;
      } else if (setup._composing) {
        thumb.innerHTML = '<span class="text-xs text-muted">composing…</span>';
      } else {
        thumb.innerHTML = '<span class="text-xs text-muted">no setup yet</span>';
      }
    }
    if (composeBtn) {
      const can = !setup.locked && (setup.prompt || '').trim().length >= 5 && !setup._composing;
      composeBtn.disabled = !can;
      composeBtn.textContent = setup.imageDataUrl ? '🔄 Recompose' : '✨ Compose setup';
    }
    if (lockBtn)   lockBtn.style.display   = (setup.imageDataUrl && !setup.locked) ? '' : 'none';
    if (unlockBtn) unlockBtn.style.display = setup.locked ? '' : 'none';
    if (hint) {
      if (setup.locked) hint.textContent = '🔒 Setup locked. Used as start frame for every narrator clip.';
      else if (setup._composing) hint.textContent = 'Composing the narrator into the set…';
      else if (setup.imageDataUrl) hint.textContent = 'Preview ready. Lock to use as start frame.';
      else if ((setup.prompt || '').trim().length < 5) hint.textContent = 'Describe the set (or pick a preset).';
      else hint.textContent = 'Click Compose to place the narrator into the set.';
    }
  }

  function _wireNarratorSetupStatic() {
    const sect = document.getElementById('narrator-setup-section');
    if (!sect || sect._wired) return;
    sect._wired = true;
    const promptEl = document.getElementById('narrator-setup-prompt');
    if (promptEl) {
      promptEl.addEventListener('input', () => {
        const setup = window.createJobState.narratorSetup
          || (window.createJobState.narratorSetup = { prompt: '', imageDataUrl: null, locked: false, canvasPosition: null });
        if (setup.locked) return;
        setup.prompt = promptEl.value;
        _renderNarratorSetup();
      });
    }
    sect.querySelectorAll('button[data-narrator-setup-preset]').forEach(b => {
      b.addEventListener('click', () => {
        const setup = window.createJobState.narratorSetup
          || (window.createJobState.narratorSetup = { prompt: '', imageDataUrl: null, locked: false, canvasPosition: null });
        if (setup.locked) return;
        setup.prompt = b.dataset.narratorSetupPreset;
        _renderNarratorSetup();
      });
    });
    sect.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.dataset && t.dataset.narratorSetupPreview && window._castOpenImagePreview) {
        const setup = window.createJobState.narratorSetup;
        if (setup && setup.imageDataUrl) window._castOpenImagePreview(setup.imageDataUrl, 'Narrator setup');
      }
    });
    const composeBtn = document.getElementById('btn-narrator-setup-compose');
    if (composeBtn) composeBtn.addEventListener('click', _narratorSetupCompose);
    const lockBtn = document.getElementById('btn-narrator-setup-lock');
    if (lockBtn)   lockBtn.addEventListener('click', _narratorSetupLock);
    const unlockBtn = document.getElementById('btn-narrator-setup-unlock');
    if (unlockBtn) unlockBtn.addEventListener('click', _narratorSetupUnlock);
  }

  async function _narratorSetupCompose() {
    const n = window.createJobState.narrator;
    const setup = window.createJobState.narratorSetup;
    if (!n || !setup || setup.locked) return;
    const key = (typeof getCreateGeminiKey === 'function') ? getCreateGeminiKey() : null;
    if (!key) { alert('Gemini API key required'); return; }
    setup._composing = true;
    _renderNarratorSetup();
    try {
      const url = await window.composeNarratorSetup(n, setup.prompt, key);
      setup.imageDataUrl = url;
    } catch (e) {
      alert('Compose failed: ' + (e.message || e));
    } finally {
      setup._composing = false;
      _renderNarratorSetup();
      _refreshCanvasNarratorSetup();
      if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
    }
  }

  function _narratorSetupLock() {
    const setup = window.createJobState.narratorSetup;
    if (!setup || !setup.imageDataUrl) return;
    setup.locked = true;
    _renderNarratorSetup();
    _refreshCanvasNarratorSetup();
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
  }

  function _narratorSetupUnlock() {
    const setup = window.createJobState.narratorSetup;
    if (!setup) return;
    setup.locked = false;
    _renderNarratorSetup();
    _refreshCanvasNarratorSetup();
    if (typeof autoSaveCreateState === 'function') autoSaveCreateState();
  }

  function _refreshCanvasNarratorSetup() {
    if (window.CanvasGraph && typeof window.CanvasGraph.refresh === 'function') {
      try { window.CanvasGraph.refresh(); } catch (_) {}
    }
  }

  // Public — re-render entry point
  window.narratorRenderSlot = function () { _renderNarratorSlot(); _renderNarratorSetup(); };
  window.narratorRenderSetup = _renderNarratorSetup;
  window.narratorIsActive = function () {
    return !!(window.createJobState.narrator && window.createJobState.narrator.locked);
  };

  function _initNarratorStatic() {
    const addBtn = document.getElementById('btn-narrator-add');
    const genBtn = document.getElementById('btn-narrator-generate');
    if (addBtn && !addBtn._wired) {
      addBtn._wired = true;
      addBtn.addEventListener('click', () => {
        if (window.createJobState.narrator) return;
        // Cap-of-6 check
        const total = ((window.createJobState.characters || []).length)
          + ((window.createJobState.locations || []).length)
          + (window.createJobState.product ? 1 : 0)
          + (window.createJobState.presenter ? 1 : 0)
          + (window.createJobState.setting ? 1 : 0);
        if (total >= 6) { alert('Cap of 6 reached. Delete an existing entity first.'); return; }
        // Confirm if characters with potential dialogue already exist
        const charsExist = (window.createJobState.characters || []).some(c => c.locked);
        if (charsExist) {
          if (!confirm('Adding a narrator means all voice content goes to the narrator. Defined characters will appear visually but won\'t have dialogue. Continue?')) return;
        }
        window.createJobState.narrator = {
          id: 'narr_' + Date.now().toString(36),
          name: '',
          userDescription: '',
          uploadedImageDataUrl: null,
          appearanceSheet: '',
          distinctiveTraits: [],
          ageRange: '',
          build: '',
          representativeImageDataUrl: null,
          onScreenStyle: 'voice-only',
          locked: false,
          libraryId: null,
          createdAt: new Date().toISOString(),
        };
        _renderNarratorSlot();
        _showMutexHints();
      });
    }
    if (genBtn && !genBtn._wired) {
      genBtn._wired = true;
      genBtn.addEventListener('click', async () => {
        const n = window.createJobState.narrator;
        if (!n || n.locked || n.appearanceSheet) return;
        genBtn.disabled = true;
        await _narratorGenerateOne();
        genBtn.disabled = false;
      });
    }
    _wireNarratorUpload();
    _wireNarratorSetupStatic();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initNarratorStatic);
  } else {
    _initNarratorStatic();
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

  // Talking-head narrator: ask the storyboard agent to flag chunks that should
  // cut to the narrator on camera, plus a delivery cue for the narrator clip.
  window.castBuildNarratorAgentSuffix = function () {
    const n = window.createJobState && window.createJobState.narrator;
    const isTalking = !!(n && n.locked && n.onScreenStyle === 'talking-head');
    if (!isTalking) return { promptHint: '', schemaFieldList: '' };
    return {
      promptHint:
        '\n\nTALKING-HEAD NARRATOR MODE: This video has a talking-head narrator. For each segment, ALSO indicate whether it should cut to the narrator on camera (suggestNarrator=true) or stay on B-roll (suggestNarrator=false). Defaults: openers, closers, direct-address ("you", "imagine"), questions, and emphatic statements should be narrator. Most middle segments stay B-roll. Aim for 15-25% narrator coverage. Also pick a delivery cue per segment: tone (warm|serious|excited|matter-of-fact|playful|concerned) and gesture (neutral|explanatory|emphatic).',
      schemaFieldList:
        ', "suggestNarrator": false, "performance": {"tone": "matter-of-fact", "gesture": "neutral"}',
    };
  };

  // Build the storyboard preamble injected into Gemini prompts.
  window.castBuildStoryboardPreamble = function () {
    const t = (window.createJobState && window.createJobState.videoType) || null;
    const chars = (window.createJobState.characters || []).filter(c => c.locked);
    const locs = (window.createJobState.locations || []).filter(l => l.locked);
    const product = window.createJobState.product;
    const presenter = window.createJobState.presenter;
    const setting = window.createJobState.setting;
    const narrator = window.createJobState.narrator;
    const productLocked = product && product.locked;
    const presenterLocked = presenter && presenter.locked;
    const settingLocked = setting && setting.locked;
    const narratorLocked = narrator && narrator.locked;

    // Narrator-mode hint — universal across types
    const narratorHint = narratorLocked
      ? `NARRATOR MODE: This video has a single narrator (${escapeHtml(narrator.name)}) who voices ALL audio content. Characters and other entities appear visually in scenes but DO NOT speak — there is no character dialogue. Treat all script text as narration prose. The narrator does NOT appear in scene visuals (rendered separately at edit time).\n\n`
      : '';

    if (t === 'narration') return narratorHint;
    if (t === 'brand') {
      if (!productLocked && !presenterLocked && !settingLocked) return narratorHint;
      let out = narratorHint;
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
    if (chars.length === 0 && locs.length === 0) return narratorHint;
    let out = narratorHint;
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

  // ─── Visual Bible — Phase 1 (data model + spec builder) ────────────────
  // The bible is a Gemini-generated 9-cell grid (one or two pages) that locks
  // every entity + utility cell (palette, lighting, hero) for cross-scene
  // consistency. It is mandatory for film/brand projects with ≥1 locked entity.
  // See consistency-plan.md §5 (data model) and §7 (cell layout) for the spec.

  // Returns true when this project must generate a bible.
  window.bibleApplies = function () {
    const t = window.createJobState && window.createJobState.videoType;
    if (t !== 'film' && t !== 'brand') return false;
    const cs = (window.createJobState.characters || []).filter(c => c.locked).length;
    const ls = (window.createJobState.locations || []).filter(l => l.locked).length;
    const hasProduct   = !!(window.createJobState.product   && window.createJobState.product.locked);
    const hasPresenter = !!(window.createJobState.presenter && window.createJobState.presenter.locked);
    const hasSetting   = !!(window.createJobState.setting   && window.createJobState.setting.locked);
    return (cs + ls + (hasProduct ? 1 : 0) + (hasPresenter ? 1 : 0) + (hasSetting ? 1 : 0)) > 0;
  };

  // Count of locked entities (used for second-page threshold).
  window.bibleEntityCount = function () {
    const cs = (window.createJobState.characters || []).filter(c => c.locked).length;
    const ls = (window.createJobState.locations || []).filter(l => l.locked).length;
    const hasProduct   = !!(window.createJobState.product   && window.createJobState.product.locked);
    const hasPresenter = !!(window.createJobState.presenter && window.createJobState.presenter.locked);
    const hasSetting   = !!(window.createJobState.setting   && window.createJobState.setting.locked);
    return cs + ls + (hasProduct ? 1 : 0) + (hasPresenter ? 1 : 0) + (hasSetting ? 1 : 0);
  };

  // IDB key helpers — bible images live in the same IDB store as cast portraits.
  window.bibleIdbKey = function (bibleId, kind, pageIdx, slotIdx, version) {
    // kind: 'grid2k' | 'grid4k' | 'cell2k' | 'cellVer'
    if (kind === 'grid2k')  return `bib_${bibleId}_p${pageIdx}_2k`;
    if (kind === 'grid4k')  return `bib_${bibleId}_p${pageIdx}_4k`;
    if (kind === 'cell2k')  return `bib_${bibleId}_p${pageIdx}_c${slotIdx}_2k`;
    if (kind === 'cellVer') return `bib_${bibleId}_p${pageIdx}_c${slotIdx}_v${version}_2k`;
    return null;
  };

  // ── Slot allocator helpers ─────────────────────────────────
  function _bibleSlot(idx, name, priority, opts) {
    return Object.assign({
      idx,
      name,
      priority,             // 'entity' | 'extra' | 'utility' | 'spare'
      locked: priority === 'entity' || priority === 'utility',
      cellImageId: null,    // current IDB key — populated at gen time
      versions: [],         // cap 2 history entries
      baseEntityName: null, // for 'extra' priority — name of the entity this is an alternate angle of
      angleVariation: null, // for 'extra' — e.g. 'close-up', '¾ profile'
    }, opts || {});
  }

  // Film-mode page builder. Capacity 9. Returns slots[] of length 9.
  function _bibleFilmPage(chars, locs, capacity) {
    const slots = [];
    let i = 0;
    // Entities first, in priority order (chars > locs)
    for (const c of chars) { slots.push(_bibleSlot(i++, c.name, 'entity')); if (i >= capacity) break; }
    if (i < capacity) for (const l of locs) { slots.push(_bibleSlot(i++, l.name, 'entity')); if (i >= capacity) break; }
    // Utilities — palette, lighting, hero — only on page A (caller decides via capacity)
    return { slots, nextIdx: i };
  }

  // Pad page with utilities, then extras, then spares to reach 9.
  function _bibleFillUtilitiesAndSpares(slots, page, addUtilities, entityNames) {
    // page is 'A' or 'B'. Utility cells go on page A only.
    let i = slots.length;
    if (addUtilities) {
      if (i < 9) slots.push(_bibleSlot(i++, 'palette',  'utility'));
      if (i < 9) slots.push(_bibleSlot(i++, 'lighting', 'utility'));
      if (i < 9) slots.push(_bibleSlot(i++, 'hero',     'utility'));
    }
    // Extras — alternate angles of existing entities (cycle through)
    let extraCursor = 0;
    while (i < 9 && entityNames.length > 0) {
      const baseName = entityNames[extraCursor % entityNames.length];
      const angle = ['close-up', '¾ profile', 'wide alt-angle'][Math.floor(extraCursor / entityNames.length) % 3];
      slots.push(_bibleSlot(i++, `extra-${baseName}-${extraCursor}`, 'extra', {
        baseEntityName: baseName,
        angleVariation: angle,
      }));
      extraCursor++;
      // Cap extras at 2× entity count so we don't drown the page in one entity
      if (extraCursor >= entityNames.length * 2) break;
    }
    // Pure spare slots fill the rest
    while (i < 9) slots.push(_bibleSlot(i++, `spare-${i}`, 'spare'));
    return slots;
  }

  // Brand-mode: product gets 3 cells (front, ¾, detail).
  function _bibleBrandPage(productName, presenter, setting, hasLogo, capacity) {
    const slots = [];
    let i = 0;
    if (productName) {
      slots.push(_bibleSlot(i++, productName, 'entity', { angleVariation: 'front hero' }));
      slots.push(_bibleSlot(i++, productName + '__angle', 'entity', { baseEntityName: productName, angleVariation: '¾ angle' }));
      slots.push(_bibleSlot(i++, productName + '__detail', 'entity', { baseEntityName: productName, angleVariation: 'detail close-up' }));
    }
    if (presenter && i < capacity) slots.push(_bibleSlot(i++, presenter.name, 'entity'));
    if (setting   && i < capacity) slots.push(_bibleSlot(i++, setting.name,   'entity'));
    if (hasLogo   && i < capacity) slots.push(_bibleSlot(i++, 'logo',         'utility'));
    return { slots, nextIdx: i };
  }

  // Build the full bible spec from current job state. Returns:
  //   null               — bibleApplies() returned false
  //   { count, pages }   — count is 1 or 2; pages is an array of { pageIdx, slots[9] }
  window.castBuildBibleSpec = function () {
    if (!window.bibleApplies()) return null;
    const t = window.createJobState.videoType;
    const chars = (window.createJobState.characters || []).filter(c => c.locked);
    const locs  = (window.createJobState.locations  || []).filter(l => l.locked);
    const product   = window.createJobState.product;
    const presenter = window.createJobState.presenter;
    const setting   = window.createJobState.setting;
    const hasProduct   = !!(product   && product.locked);
    const hasPresenter = !!(presenter && presenter.locked);
    const hasSetting   = !!(setting   && setting.locked);
    const hasLogo      = hasProduct && !!product.logoDataUrl;

    // Decide pages count. Threshold: total entities > 6 → 2 pages.
    const totalEntities = chars.length + locs.length + (hasProduct ? 1 : 0) + (hasPresenter ? 1 : 0) + (hasSetting ? 1 : 0);
    const needsTwoPages = totalEntities > 6;

    if (t === 'brand') {
      if (!needsTwoPages) {
        // Single page — product gets 3 cells, then presenter/setting/logo, then utilities
        const productName = hasProduct ? product.name : null;
        const built = _bibleBrandPage(productName, hasPresenter ? presenter : null, hasSetting ? setting : null, hasLogo, 9 - 3);
        // Always reserve last 3 for palette/lighting/hero on single page
        const entityNames = built.slots.filter(s => s.priority === 'entity').map(s => s.baseEntityName || s.name);
        _bibleFillUtilitiesAndSpares(built.slots, 'A', true, entityNames);
        return { count: 1, pages: [{ pageIdx: 0, slots: built.slots }] };
      }
      // Two-page brand — page A: product (3) + presenter + setting + logo + utilities (3 if room)
      // page B: extras / second product cells / additional palette study
      const pageA = _bibleBrandPage(hasProduct ? product.name : null, hasPresenter ? presenter : null, hasSetting ? setting : null, hasLogo, 9);
      const aEntityNames = pageA.slots.filter(s => s.priority === 'entity').map(s => s.baseEntityName || s.name);
      _bibleFillUtilitiesAndSpares(pageA.slots, 'A', true, aEntityNames);
      const pageBSlots = [];
      // Page B: spare entity angles + extras + spares (no utilities)
      _bibleFillUtilitiesAndSpares(pageBSlots, 'B', false, aEntityNames);
      return { count: 2, pages: [{ pageIdx: 0, slots: pageA.slots }, { pageIdx: 1, slots: pageBSlots }] };
    }

    // Film mode
    if (!needsTwoPages) {
      // Capacity 6 leaves room for 3 utility cells; less means more entities, fewer extras
      const utilityRoom = Math.max(0, 9 - totalEntities);
      const addUtilities = utilityRoom >= 1;  // palette always (highest-priority utility)
      const built = _bibleFilmPage(chars, locs, 9);
      const entityNames = built.slots.filter(s => s.priority === 'entity').map(s => s.name);
      // Insert utilities between entities and extras when room exists
      // Strategy: put up to 3 utilities first (palette > lighting > hero) up to utilityRoom
      const utils = [];
      if (utilityRoom >= 1) utils.push(_bibleSlot(0, 'palette', 'utility'));
      if (utilityRoom >= 2) utils.push(_bibleSlot(0, 'lighting', 'utility'));
      if (utilityRoom >= 3) utils.push(_bibleSlot(0, 'hero', 'utility'));
      // Reindex: entities + utilities + extras/spares
      const merged = built.slots.concat(utils).map((s, idx) => Object.assign(s, { idx }));
      _bibleFillUtilitiesAndSpares(merged, 'A', false, entityNames);  // utilities already added
      // Reindex final
      merged.forEach((s, idx) => { s.idx = idx; });
      return { count: 1, pages: [{ pageIdx: 0, slots: merged.slice(0, 9) }] };
    }
    // Two-page film
    // Page A: top-priority entities (first 6) + 3 utilities
    const aChars = chars.slice(0, 4);
    const aLocs  = locs.slice(0, Math.max(0, 6 - aChars.length));
    const builtA = _bibleFilmPage(aChars, aLocs, 6);
    builtA.slots.push(_bibleSlot(builtA.nextIdx,     'palette',  'utility'));
    builtA.slots.push(_bibleSlot(builtA.nextIdx + 1, 'lighting', 'utility'));
    builtA.slots.push(_bibleSlot(builtA.nextIdx + 2, 'hero',     'utility'));
    builtA.slots.forEach((s, idx) => { s.idx = idx; });

    // Page B: overflow entities + extras
    const bChars = chars.slice(4);
    const bLocs  = locs.slice(Math.max(0, 6 - aChars.length));
    const overflowProduct   = hasProduct   && !aChars.length && !aLocs.length ? null : (hasProduct ? product : null);
    const overflowPresenter = hasPresenter ? presenter : null;
    const overflowSetting   = hasSetting   ? setting   : null;
    const builtB = _bibleFilmPage(bChars, bLocs, 9);
    if (hasProduct   && !builtA.slots.find(s => s.name === product.name))   builtB.slots.push(_bibleSlot(builtB.nextIdx++, product.name,   'entity'));
    if (hasPresenter && !builtA.slots.find(s => s.name === presenter.name)) builtB.slots.push(_bibleSlot(builtB.nextIdx++, presenter.name, 'entity'));
    if (hasSetting   && !builtA.slots.find(s => s.name === setting.name))   builtB.slots.push(_bibleSlot(builtB.nextIdx++, setting.name,   'entity'));
    const allEntityNames = builtA.slots.filter(s => s.priority === 'entity').map(s => s.name)
      .concat(builtB.slots.filter(s => s.priority === 'entity').map(s => s.name));
    _bibleFillUtilitiesAndSpares(builtB.slots, 'B', false, allEntityNames);
    builtB.slots.forEach((s, idx) => { s.idx = idx; });

    return { count: 2, pages: [{ pageIdx: 0, slots: builtA.slots.slice(0, 9) }, { pageIdx: 1, slots: builtB.slots.slice(0, 9) }] };
  };

  // Lookup any locked entity by name (case-insensitive). Used by bible
  // prompt builder + per-scene ref binding to resolve bracket tokens.
  // Returns the original entity object or null. Pseudo-entities like
  // 'Maya__angle' or 'Maya__detail' resolve to the base entity.
  window.castFindEntityByName = function (name) {
    if (!name || !window.createJobState) return null;
    const baseName = String(name).replace(/__angle$|__detail$/, '');
    const lc = baseName.toLowerCase();
    const cs = window.createJobState;
    const all = [
      ...(cs.characters || []),
      ...(cs.locations || []),
      cs.product, cs.presenter, cs.setting,
    ].filter(Boolean);
    return all.find(x => x.locked && (x.name || '').toLowerCase() === lc) || null;
  };

  // Build cellsByName index for a freshly-generated bible.
  // Maps bracket-token names → { pageIdx, slotIdx } so per-scene ref binding
  // can resolve [Maya] → bible cell in O(1).
  window.castBuildBibleCellsByName = function (bible) {
    const out = {};
    if (!bible || !Array.isArray(bible.pages)) return out;
    bible.pages.forEach(p => {
      (p.slots || []).forEach(s => {
        if (!s || !s.name) return;
        // Entity slots: index by canonical entity name
        if (s.priority === 'entity') {
          // For brand __angle / __detail variants, primary entry is the base name
          const primaryName = s.baseEntityName || s.name.replace(/__angle$|__detail$/, '');
          if (!out[primaryName]) out[primaryName] = { pageIdx: p.pageIdx, slotIdx: s.idx };
        }
        // Utility slots: index by their utility key (palette / lighting / hero / logo)
        if (s.priority === 'utility') {
          out[s.name] = { pageIdx: p.pageIdx, slotIdx: s.idx };
        }
      });
    });
    return out;
  };

  // ─── Phase 2 — Bible cell prompt composer ────────────────────────────
  // Build per-cell prompts for the bible grid call. Returns an array of 9
  // strings (one per cell of the page being generated). Each prompt encodes
  // the slot's role: entity portrait, alternate-angle extra, palette study,
  // lighting reference, hero composition, logo, or mood spare.
  function _bibleStylePrefix() {
    const sp = (typeof createStylePrompt !== 'undefined' && createStylePrompt) ? createStylePrompt : '';
    return sp ? `Style: ${sp}` : '';
  }

  function _bibleEntityDescription(entity) {
    if (!entity) return '';
    return entity.appearanceSheet || entity.userDescription || entity.name || '';
  }

  function _bibleEntityFraming(entity) {
    if (!entity) return 'eye-level, neutral lighting, plain background';
    // Heuristic: location → wide establishing; product → hero; character → full-body
    const all = window.createJobState || {};
    const isLoc = (all.locations || []).some(l => l.id === entity.id);
    const isProd = all.product && all.product.id === entity.id;
    if (isLoc)  return 'wide establishing-shot framing, eye-level horizon, neutral midday lighting, no people in frame';
    if (isProd) return 'hero shot, centered, soft studio lighting, plain neutral background';
    return 'full-body framing, eye-level, neutral lighting, plain neutral background';
  }

  // Per-cell prompt for one slot.
  function _bibleCellPrompt(slot) {
    const sp = _bibleStylePrefix();
    const sty = sp ? sp + '. ' : '';

    if (slot.priority === 'entity') {
      const entity = window.castFindEntityByName(slot.baseEntityName || slot.name);
      const desc = _bibleEntityDescription(entity);
      const framing = _bibleEntityFraming(entity);
      const angleNote = slot.angleVariation ? ` Show this as: ${slot.angleVariation}.` : '';
      const baseName = (entity && entity.name) || slot.baseEntityName || slot.name;
      return `${sty}Canonical reference portrait of [${baseName}]: ${desc}. ${framing}.${angleNote} The reference image attached for [${baseName}] is the source of truth — match facial features, build, attire, color palette, and rendering style exactly. No text, no caption.`;
    }

    if (slot.priority === 'extra') {
      const entity = window.castFindEntityByName(slot.baseEntityName);
      const desc = _bibleEntityDescription(entity);
      const baseName = (entity && entity.name) || slot.baseEntityName;
      return `${sty}Alternate angle of [${baseName}]: ${desc}. Variation: ${slot.angleVariation || 'alt angle'}. Match the canonical reference exactly; only the camera angle / pose differs. No text.`;
    }

    if (slot.name === 'palette') {
      return `${sty}Color palette and grade reference card: dominant colors, secondary palette, gradient transitions present in this project's visual style. No subject — pure color-relationship study with rectangular swatches and a hint of texture from the chosen style. No text.`;
    }
    if (slot.name === 'lighting') {
      return `${sty}Lighting reference card: example of the canonical lighting setup for this project — key, fill, back, ambient. Render a generic mannequin figure or simple environment under this lighting; ignore identity. No text.`;
    }
    if (slot.name === 'hero') {
      return `${sty}Hero composition representative of this project's tone and mood. Cinematic wide establishing shot, evocative lighting, no specific characters. Captures the project's emotional register. No text.`;
    }
    if (slot.name === 'logo') {
      const product = window.createJobState && window.createJobState.product;
      const brand = product && product.name ? product.name : 'Brand';
      return `${sty}Brand logo presentation: clean, centered, on neutral background, in the rendering style of this project. Brand: ${brand}. No additional text.`;
    }
    // spare
    return `${sty}Mood card: capture the project's emotional tone in a single evocative composition with no specific subject. No text, no characters.`;
  }

  // Build the prompt array (length 9) for one bible page.
  window.castBuildBiblePrompts = function (page) {
    if (!page || !Array.isArray(page.slots)) return null;
    const prompts = [];
    for (let i = 0; i < 9; i++) {
      const slot = page.slots[i];
      prompts.push(slot ? _bibleCellPrompt(slot) : _bibleCellPrompt({ priority: 'spare', name: 'spare-' + i }));
    }
    return prompts;
  };

  // Build refParts (cast portraits) for the bible call. Up to 4 refs because
  // Gemini's practical attachment cap is 4 inline images per call. We pick the
  // most-prominent entities first (chars > locs > product > presenter > setting).
  // Returns: [{ inlineData, text }, ...]
  window.castBuildBibleRefParts = async function (page) {
    if (!page || !Array.isArray(page.slots)) return [];
    const wantNames = new Set();
    page.slots.forEach(s => {
      if (s.priority === 'entity' || s.priority === 'extra') {
        const n = s.baseEntityName || s.name;
        if (n) wantNames.add(n.replace(/__angle$|__detail$/, ''));
      }
    });
    const ordered = [];
    const cs = window.createJobState || {};
    const push = (item) => { if (item && item.locked && wantNames.has(item.name) && !ordered.find(x => x.id === item.id)) ordered.push(item); };
    (cs.characters || []).forEach(push);
    (cs.locations  || []).forEach(push);
    push(cs.product);
    push(cs.presenter);
    push(cs.setting);
    const refs = [];
    for (const item of ordered.slice(0, 4)) {
      const dataUrl = item.representativeImageDataUrl || item.uploadedImageDataUrl;
      if (!dataUrl || !dataUrl.startsWith('data:')) continue;
      const b64 = dataUrl.split(',', 2)[1] || '';
      const mime = (dataUrl.match(/^data:([^;]+);/) || [])[1] || 'image/png';
      refs.push({
        inlineData: { mimeType: mime, data: b64 },
      });
      refs.push({
        text: `Reference for [${item.name}]: this is the canonical appearance of ${item.name}. When rendering [${item.name}] in any cell of the bible grid, match this image's features, build, attire, color palette, and rendering style exactly.`,
      });
    }
    return refs;
  };

  // ─── End Phase 2 ───────────────────────────────────────────────────────

  // Initialize an empty bible state — called when bible generation begins.
  window.castInitBibleState = function () {
    if (!window.createJobState) window.createJobState = {};
    const id = 'bible_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    return {
      id,
      status: 'pending',
      templateId: (typeof selectedTemplate !== 'undefined' && selectedTemplate) ? selectedTemplate.id : null,
      styleFingerprint: null,
      generatedAt: null,
      lastError: null,
      pages: [],
      cellsByName: {},
      canvasPosition: null,
    };
  };

  // ─── End Visual Bible Phase 1 ──────────────────────────────────────────

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
        // G8 — wait for a global concurrency slot before firing Gemini
        await _aiAcquireSlot();
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
          _aiReleaseSlot();
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
          // G3 — clean up IDB images
          if (typeof window._castDeleteImages === 'function') window._castDeleteImages(refId);
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
        // Template gate — image gen depends on style preset
        if (typeof selectedTemplate === 'undefined' || !selectedTemplate) {
          if (status) status.textContent = '⚠ Pick a template (in Step 1) before adding new characters — style is needed for image gen.';
          return;
        }
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
    const idbAvailable = (typeof window._castIdbAvailable === 'function') && window._castIdbAvailable();
    // G3 — write images to IDB when available; localStorage entry stays text-only.
    if (idbAvailable && typeof window._libPersistImages === 'function') {
      window._libPersistImages(libId, item.representativeImageDataUrl, item.uploadedImageDataUrl, item.logoDataUrl);
    }
    const entry = {
      libraryId: libId,
      kind,
      name: item.name,
      userDescription: item.userDescription || '',
      appearanceSheet: item.appearanceSheet || '',
      distinctiveTraits: item.distinctiveTraits || [],
      ageRange: item.ageRange || '',
      build: item.build || '',
      representativeImageDataUrl: idbAvailable ? null : (item.representativeImageDataUrl || null),
      uploadedImageDataUrl:       idbAvailable ? null : (item.uploadedImageDataUrl || null),
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
    if (typeof window._libDeleteImages === 'function') window._libDeleteImages(libId);
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
    // G3 — lazy-hydrate thumbnails from IDB for cards without inline images
    if (typeof window._libHydrateImage === 'function' && window._castIdbAvailable && window._castIdbAvailable()) {
      body.querySelectorAll('.refs-library-card').forEach(async (card) => {
        const libId = card.dataset.libId;
        const thumb = card.querySelector('.refs-library-thumb');
        if (!thumb || thumb.querySelector('img')) return;
        const dataUrl = await window._libHydrateImage(libId);
        if (dataUrl && !thumb.querySelector('img')) {
          thumb.innerHTML = `<img src="${dataUrl}" alt="">`;
        }
      });
    }
    body.querySelectorAll('.refs-library-card').forEach(card => {
      card.addEventListener('click', async (e) => {
        if (e.target.closest('[data-lib-delete]')) return;  // delete handler
        const libId = card.dataset.libId;
        const entry = _libRead().find(x => x.libraryId === libId);
        if (!entry) return;
        // G3 — hydrate image from IDB before handing entry to callback
        if (!entry.representativeImageDataUrl && typeof window._libHydrateImage === 'function') {
          const img = await window._libHydrateImage(libId);
          if (img) entry.representativeImageDataUrl = img;
        }
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
