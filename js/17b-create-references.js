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
