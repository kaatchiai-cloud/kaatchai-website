// ══════════════════════════════════════════
//  CREATE CONTENT PIPELINE
// ══════════════════════════════════════════
const createPage = $('create-page');
const btnCreateContent = $('btn-create-content');
const btnCreateBack = $('btn-create-back');
const createApiKeyFree = $('create-api-key-free');
const createApiKeyPaid = $('create-api-key-paid');
const btnSaveKeyFree = $('btn-save-key-free');
const btnSaveKeyPaid = $('btn-save-key-paid');
const keyStatusFree = $('key-status-free');
const keyStatusPaid = $('key-status-paid');
const keyImageStatus = $('key-image-status');
const createAudioInput = $('create-audio-input');
const btnCreateImportAudio = $('btn-create-import-audio');
const createAudioName = $('create-audio-name');
const btnCreateTranscribe = $('btn-create-transcribe');
const createTranscribeProgress = $('create-transcribe-progress');
const createTranscribeBar = $('create-transcribe-bar');
const createTranscribeLabel = $('create-transcribe-label');
const createTranscriptOutput = $('create-transcript-output');
const createStoryboardStep = $('create-storyboard-step');
const createStoryboardGrid = $('create-storyboard-grid');
const btnCreateRegeneratePrompts = $('btn-create-regenerate-prompts');
const createGenerateStep = $('create-generate-step');
const createImageCategory = $('create-image-category');
const createImageSize = $('create-image-size');
const btnCreateGenerate = $('btn-create-generate');
const createGenerateProgress = $('create-generate-progress');
const createGenerateBar = $('create-generate-bar');
const createGenerateLabel = $('create-generate-label');
const createSceneGrid = $('create-scene-grid');
const createSendStep = $('create-send-step');
const btnCreateSendEditor = $('btn-create-send-editor');
const btnCreateSaveProject = $('btn-create-save-project');
const btnCreateSaveEarly = $('btn-create-save-early');
const btnBackToCreate = $('btn-back-to-create');

let createAudioBuffer = null;
let createOriginalBuffer = null;  // original audio kept until transcribe
let createAudioFile = null;
let createTranscript = null;
let createScenes = null;
let cameFromCreate = false;  // tracks if editor was entered via Create flow
let createInputMode = 'voice';  // 'voice' | 'text'
let imagePreviewIndex = 0;

// Style consistency
let createStylePrompt = '';
let createStylePreset = '';
let selectedTemplate = '';
const createStylePresetEl = $('create-style-preset');
const createStylePromptEl = $('create-style-prompt');

const STYLE_PRESETS = {
  'watercolor': 'Watercolor painting style with soft, flowing colors and visible brush strokes on textured paper.',
  'cinematic': 'Cinematic photography with dramatic lighting, shallow depth of field, and film grain. Professional color grading.',
  'anime': 'Japanese anime art style with clean lines, vibrant colors, and expressive character design.',
  'oil-painting': 'Classical oil painting style with rich textures, visible brush strokes, and dramatic chiaroscuro lighting.',
  'digital-art': 'Clean digital art illustration with smooth gradients, vibrant colors, and precise details.',
  'minimalist': 'Minimalist illustration with simple shapes, limited color palette, and clean negative space.',
  'photorealistic': 'Ultra-photorealistic image with perfect lighting, sharp details, and natural colors.',
  'comic': 'Comic book art style with bold outlines, halftone dots, dynamic composition, and vivid colors.',
  'pixel-art': 'Pixel art style with chunky pixels, limited palette, retro 8-bit/16-bit video game aesthetic.',
  '3d-render': 'Clean 3D rendered illustration with smooth surfaces, soft global illumination, and studio lighting.',
  'sketch': 'Hand-drawn pencil sketch style with visible strokes, cross-hatching, and paper texture.',
  'vintage': 'Vintage retro photography with faded colors, film grain, light leaks, and warm sepia undertones.',
  'flat-design': 'Flat design illustration with bold solid colors, geometric shapes, no shadows or gradients.',
  'gothic': 'Dark gothic art with intricate details, deep shadows, ornate architecture, and moody atmosphere.',
  'pastel': 'Soft pastel art with gentle muted colors, dreamy atmosphere, and delicate light diffusion.',
  'ukiyo-e': 'Japanese ukiyo-e woodblock print style with flowing lines, flat color areas, and nature motifs.',
  'stained-glass': 'Stained glass art style with bold black outlines, jewel-toned translucent colors, and mosaic composition.',
  'pop-art': 'Pop art style with bold primary colors, Ben-Day dots, thick outlines, and high contrast graphic design.',
  'noir': 'Film noir style with high contrast black and white, dramatic shadows, venetian blind lighting, and moody atmosphere.',
  'surrealism': 'Surrealist art with dreamlike impossible scenes, melting forms, unexpected juxtapositions, and vivid imagination.',
};

// ── Templates ──
const TEMPLATE_CATEGORIES = {
  'all': 'All',
  'story': 'Story',
  'education': 'Education',
  'social': 'Social Media',
  'marketing': 'Marketing',
  'podcast': 'Podcast',
  'kids': 'Kids',
  'spiritual': 'Spiritual',
  'music': 'Music',
};

const TEMPLATES = [
  { id: 'blank', name: 'Blank', category: 'all', size: '', style: '', textMode: 'no-text', description: 'Fully customisable', gradient: 'linear-gradient(135deg, #2a2a3e, #1a1a2e)' },
  // Story
  { id: 'bedtime-story', name: 'Bedtime Story', category: 'story', size: '1280x720', style: 'watercolor', textMode: 'no-text', description: 'Soft watercolor scenes for children\'s bedtime tales', gradient: 'linear-gradient(135deg, #667eea, #764ba2)' },
  { id: 'fairy-tale', name: 'Fairy Tale', category: 'story', size: '1280x720', style: 'oil-painting', textMode: 'no-text', description: 'Rich oil painting style for classic fairy tales', gradient: 'linear-gradient(135deg, #f093fb, #f5576c)' },
  { id: 'mythology', name: 'Mythology', category: 'story', size: '1280x720', style: 'ukiyo-e', textMode: 'no-text', description: 'Epic woodblock-print style for mythological narratives', gradient: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
  { id: 'horror', name: 'Horror', category: 'story', size: '1280x720', style: 'gothic', textMode: 'no-text', description: 'Dark gothic visuals for horror and thriller stories', gradient: 'linear-gradient(135deg, #0c0c0c, #434343)' },
  { id: 'sci-fi', name: 'Sci-Fi', category: 'story', size: '1280x720', style: '3d-render', textMode: 'no-text', description: 'Futuristic 3D rendered scenes for science fiction', gradient: 'linear-gradient(135deg, #0f2027, #2c5364)' },
  { id: 'romance', name: 'Romance', category: 'story', size: '1280x720', style: 'pastel', textMode: 'no-text', description: 'Soft pastel art for love stories', gradient: 'linear-gradient(135deg, #ee9ca7, #ffdde1)' },
  { id: 'adventure', name: 'Adventure', category: 'story', size: '1280x720', style: 'comic', textMode: 'no-text', description: 'Bold comic book style for action-packed adventures', gradient: 'linear-gradient(135deg, #f7971e, #ffd200)' },
  { id: 'moral-story', name: 'Moral Story', category: 'story', size: '1280x720', style: 'watercolor', textMode: 'no-text', description: 'Gentle watercolor illustrations for moral lessons', gradient: 'linear-gradient(135deg, #a8edea, #fed6e3)' },
  // Education
  { id: 'explainer', name: 'Explainer', category: 'education', size: '1280x720', style: 'sketch', textMode: 'english-only', description: 'Hand-drawn sketch style for explainer videos', gradient: 'linear-gradient(135deg, #5ee7df, #b490ca)' },
  { id: 'science', name: 'Science', category: 'education', size: '1280x720', style: 'minimalist', textMode: 'english-only', description: 'Minimalist diagrams and visuals for science topics', gradient: 'linear-gradient(135deg, #13547a, #80d0c7)' },
  { id: 'history', name: 'History', category: 'education', size: '1280x720', style: 'vintage', textMode: 'no-text', description: 'Vintage retro photography for historical narratives', gradient: 'linear-gradient(135deg, #c79081, #dfa579)' },
  { id: 'geography', name: 'Geography', category: 'education', size: '1280x720', style: 'photorealistic', textMode: 'english-only', description: 'Photorealistic landscapes and maps for geography', gradient: 'linear-gradient(135deg, #11998e, #38ef7d)' },
  { id: 'math-logic', name: 'Math & Logic', category: 'education', size: '1280x720', style: 'flat-design', textMode: 'english-only', description: 'Clean flat design visuals for math and logic concepts', gradient: 'linear-gradient(135deg, #667eea, #764ba2)' },
  { id: 'language', name: 'Language Learning', category: 'education', size: '1280x720', style: 'comic', textMode: 'english-only', description: 'Fun comic style for language learning content', gradient: 'linear-gradient(135deg, #ffecd2, #fcb69f)' },
  // Social Media
  { id: 'instagram-reel', name: 'Instagram Reel', category: 'social', size: '1080x1920', style: 'cinematic', textMode: 'no-text', description: 'Vertical cinematic visuals for Instagram Reels', gradient: 'linear-gradient(135deg, #f9ce34, #ee2a7b, #6228d7)' },
  { id: 'tiktok-short', name: 'TikTok / Short', category: 'social', size: '1080x1920', style: 'photorealistic', textMode: 'no-text', description: 'Vertical photorealistic content for TikTok & Shorts', gradient: 'linear-gradient(135deg, #00f2ea, #ff0050)' },
  { id: 'youtube-video', name: 'YouTube Video', category: 'social', size: '1280x720', style: 'cinematic', textMode: 'english-only', description: 'Widescreen cinematic style for YouTube videos', gradient: 'linear-gradient(135deg, #ff0000, #cc0000)' },
  { id: 'instagram-post', name: 'Instagram Post', category: 'social', size: '1080x1080', style: 'photorealistic', textMode: 'no-text', description: 'Square format for Instagram feed posts', gradient: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)' },
  { id: 'facebook-post', name: 'Facebook Post', category: 'social', size: '1200x628', style: 'digital-art', textMode: 'english-only', description: 'Landscape digital art for Facebook posts', gradient: 'linear-gradient(135deg, #1877f2, #42b72a)' },
  { id: 'twitter-banner', name: 'Twitter/X Banner', category: 'social', size: '1500x500', style: 'minimalist', textMode: 'english-only', description: 'Wide banner format for Twitter/X headers', gradient: 'linear-gradient(135deg, #1da1f2, #14171a)' },
  // Marketing
  { id: 'product-demo', name: 'Product Demo', category: 'marketing', size: '1280x720', style: '3d-render', textMode: 'english-only', description: '3D rendered product showcase and demo videos', gradient: 'linear-gradient(135deg, #f12711, #f5af19)' },
  { id: 'brand-story', name: 'Brand Story', category: 'marketing', size: '1280x720', style: 'flat-design', textMode: 'english-only', description: 'Clean flat design visuals for brand narratives', gradient: 'linear-gradient(135deg, #2c3e50, #3498db)' },
  { id: 'testimonial', name: 'Testimonial', category: 'marketing', size: '1280x720', style: 'photorealistic', textMode: 'no-text', description: 'Professional photorealistic backgrounds for testimonials', gradient: 'linear-gradient(135deg, #bdc3c7, #2c3e50)' },
  { id: 'event-promo', name: 'Event Promo', category: 'marketing', size: '1080x1920', style: 'pop-art', textMode: 'english-only', description: 'Bold pop art promos for events and launches', gradient: 'linear-gradient(135deg, #eb3349, #f45c43)' },
  { id: 'real-estate', name: 'Real Estate', category: 'marketing', size: '1280x720', style: 'photorealistic', textMode: 'english-only', description: 'Photorealistic property showcase visuals', gradient: 'linear-gradient(135deg, #56ab2f, #a8e063)' },
  { id: 'food-restaurant', name: 'Food & Restaurant', category: 'marketing', size: '1080x1080', style: 'photorealistic', textMode: 'no-text', description: 'Mouthwatering photorealistic food visuals', gradient: 'linear-gradient(135deg, #f2994a, #f2c94c)' },
  // Podcast
  { id: 'podcast-interview', name: 'Interview', category: 'podcast', size: '1280x720', style: 'minimalist', textMode: 'no-text', description: 'Clean minimalist backgrounds for interview podcasts with PiP', gradient: 'linear-gradient(135deg, #4b6cb7, #182848)' },
  { id: 'podcast-solo', name: 'Solo Show', category: 'podcast', size: '1280x720', style: 'digital-art', textMode: 'no-text', description: 'Digital art scenes for solo podcast episodes', gradient: 'linear-gradient(135deg, #6a3093, #a044ff)' },
  { id: 'podcast-truecrime', name: 'True Crime', category: 'podcast', size: '1280x720', style: 'noir', textMode: 'no-text', description: 'Film noir visuals for true crime podcasts', gradient: 'linear-gradient(135deg, #1a1a2e, #e94560)' },
  { id: 'podcast-comedy', name: 'Comedy', category: 'podcast', size: '1280x720', style: 'pop-art', textMode: 'no-text', description: 'Bold pop art style for comedy podcasts', gradient: 'linear-gradient(135deg, #f7971e, #ffd200)' },
  { id: 'podcast-news', name: 'News Recap', category: 'podcast', size: '1280x720', style: 'photorealistic', textMode: 'no-text', description: 'Professional photorealistic backdrops for news', gradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' },
  // Kids
  { id: 'nursery-rhyme', name: 'Nursery Rhyme', category: 'kids', size: '1280x720', style: 'watercolor', textMode: 'no-text', description: 'Playful watercolor scenes for nursery rhymes', gradient: 'linear-gradient(135deg, #ff9a9e, #fad0c4)' },
  { id: 'animal-facts', name: 'Animal Facts', category: 'kids', size: '1280x720', style: 'comic', textMode: 'english-only', description: 'Colorful comic illustrations of animals', gradient: 'linear-gradient(135deg, #a1c4fd, #c2e9fb)' },
  { id: 'abc-numbers', name: 'ABC & Numbers', category: 'kids', size: '1080x1080', style: 'pixel-art', textMode: 'english-only', description: 'Fun pixel art visuals for alphabet and counting', gradient: 'linear-gradient(135deg, #fbc2eb, #a6c1ee)' },
  { id: 'cartoon-story', name: 'Cartoon Story', category: 'kids', size: '1280x720', style: 'anime', textMode: 'no-text', description: 'Anime-style cartoon visuals for kids\' stories', gradient: 'linear-gradient(135deg, #43e97b, #38f9d7)' },
  // Spiritual
  { id: 'meditation', name: 'Meditation', category: 'spiritual', size: '1280x720', style: 'pastel', textMode: 'no-text', description: 'Serene pastel scenes for meditation and calm', gradient: 'linear-gradient(135deg, #89f7fe, #66a6ff)' },
  { id: 'prayer', name: 'Prayer & Devotional', category: 'spiritual', size: '1280x720', style: 'oil-painting', textMode: 'no-text', description: 'Classical oil painting for devotional content', gradient: 'linear-gradient(135deg, #f6d365, #fda085)' },
  { id: 'scripture', name: 'Scripture', category: 'spiritual', size: '1280x720', style: 'stained-glass', textMode: 'english-only', description: 'Stained glass art for scripture readings', gradient: 'linear-gradient(135deg, #a18cd1, #fbc2eb)' },
  { id: 'mythology-retelling', name: 'Mythology Retelling', category: 'spiritual', size: '1280x720', style: 'ukiyo-e', textMode: 'no-text', description: 'Woodblock-print style for mythological retellings', gradient: 'linear-gradient(135deg, #ff9966, #ff5e62)' },
  // Music
  { id: 'lyric-video', name: 'Lyric Video', category: 'music', size: '1080x1920', style: 'minimalist', textMode: 'english-only', description: 'Minimalist vertical backgrounds for lyric videos', gradient: 'linear-gradient(135deg, #e1eec3, #f05053)' },
  { id: 'album-visualizer', name: 'Album Visualizer', category: 'music', size: '1280x720', style: 'surrealism', textMode: 'no-text', description: 'Surrealist abstract art for music visualization', gradient: 'linear-gradient(135deg, #7f00ff, #e100ff)' },
  { id: 'music-story', name: 'Music Story', category: 'music', size: '1280x720', style: 'anime', textMode: 'no-text', description: 'Anime-style narrative visuals for music stories', gradient: 'linear-gradient(135deg, #fc5c7d, #6a82fb)' },
];

function renderTemplateGrid(category = 'all') {
  const grid = $('template-grid');
  if (!grid) return;
  const filtered = category === 'all'
    ? TEMPLATES
    : TEMPLATES.filter(t => t.category === category || t.id === 'blank');
  grid.innerHTML = filtered.map(t => {
    const locked = isFree() && !FREE_TEMPLATES.includes(t.id);
    return `
    <div class="template-card${selectedTemplate === t.id ? ' selected' : ''}${locked ? ' locked' : ''}" data-tpl="${t.id}" style="background:${t.gradient};">
      ${locked ? '<div class="lock-badge">🔒</div>' : ''}
      <div class="template-card-name">${t.name}</div>
      <div class="template-card-desc">${t.description}</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      const locked = isFree() && !FREE_TEMPLATES.includes(card.dataset.tpl);
      if (locked) { showUpgradePrompt('Upgrade to Pro to unlock all 40 templates.'); return; }
      applyTemplate(card.dataset.tpl);
    });
  });
}

function applyTemplate(templateId) {
  const tpl = TEMPLATES.find(t => t.id === templateId);
  if (!tpl) return;
  selectedTemplate = templateId;
  // Set output size
  if (tpl.size && createImageSize) {
    createImageSize.value = tpl.size;
  }
  // Set style
  if (tpl.style && STYLE_PRESETS[tpl.style]) {
    createStylePreset = tpl.style;
    createStylePrompt = STYLE_PRESETS[tpl.style];
    if (createStylePresetEl) createStylePresetEl.value = tpl.style;
    if (createStylePromptEl) {
      createStylePromptEl.value = createStylePrompt;
      createStylePromptEl.disabled = true;
    }
  } else {
    createStylePreset = '';
    createStylePrompt = '';
    if (createStylePresetEl) createStylePresetEl.value = '';
    if (createStylePromptEl) {
      createStylePromptEl.value = '';
      createStylePromptEl.disabled = true;
    }
  }
  // Set text mode
  const textModeEl = $('create-image-text-mode');
  if (textModeEl && tpl.textMode) textModeEl.value = tpl.textMode;
  // Update card selection UI
  const grid = $('template-grid');
  if (grid) {
    grid.querySelectorAll('.template-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.tpl === templateId);
    });
  }
}

function setTemplateCategoryFilter(cat) {
  const btns = document.querySelectorAll('.tpl-cat-btn');
  btns.forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  renderTemplateGrid(cat);
}

function applyPlanGating() {
  // Gate style dropdown
  if (createStylePresetEl) {
    Array.from(createStylePresetEl.options).forEach(opt => {
      if (opt.value && opt.value !== 'custom' && !FREE_STYLES.includes(opt.value)) {
        opt.disabled = isFree();
        if (isFree() && !opt.textContent.includes('🔒')) opt.textContent += ' 🔒';
      }
    });
  }
  // Gate size dropdown
  if (createImageSize) {
    Array.from(createImageSize.options).forEach(opt => {
      if (!FREE_SIZES.includes(opt.value)) {
        opt.disabled = isFree();
        if (isFree() && !opt.textContent.includes('🔒')) opt.textContent += ' 🔒';
      }
    });
  }
  // Gate podcast tab label
  if (isFree()) createModeVideo.innerHTML = '🔒 Podcast';
  else createModeVideo.innerHTML = '🎙️ Podcast';
  // Gate audio editor buttons in create flow
  const audioEditorBtns = ['btn-create-keep', 'btn-create-delete', 'btn-create-insert', 'btn-create-silence'];
  audioEditorBtns.forEach(id => {
    const btn = $(id);
    if (btn) btn.style.display = isFree() ? 'none' : '';
  });
}

function initTemplateUI() {
  const catContainer = $('template-categories');
  if (!catContainer) return;
  catContainer.innerHTML = Object.entries(TEMPLATE_CATEGORIES).map(([key, label]) =>
    `<button class="tpl-cat-btn${key === 'all' ? ' active' : ''}" data-cat="${key}">${label}</button>`
  ).join('');
  catContainer.querySelectorAll('.tpl-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => setTemplateCategoryFilter(btn.dataset.cat));
  });
  renderTemplateGrid('all');
}

// ── Visual References: Characters & Environments ──
const charCardsEl = $('character-cards');
const envCardsEl = $('environment-cards');
const charImgInput = $('char-img-input');
const envImgInput = $('env-img-input');
const btnAddChar = $('btn-add-character');
const btnAddEnv = $('btn-add-environment');
let pendingRefType = null; // 'char' or 'env'
let pendingRefCardId = null;

function getMaxRefs() { return isPro() ? 3 : 1; }

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
      renderCharacterCards(); renderSceneAssignments(); markDirty();
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
    input.addEventListener('change', () => { storyCharacters[i].name = input.value; renderSceneAssignments(); markDirty(); });
  });
  charCardsEl.querySelectorAll('.char-desc').forEach((ta, i) => {
    ta.addEventListener('change', () => { storyCharacters[i].description = ta.value; markDirty(); });
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
      renderEnvironmentCards(); renderSceneAssignments(); markDirty();
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
    input.addEventListener('change', () => { storyEnvironments[i].name = input.value; renderSceneAssignments(); markDirty(); });
  });
  envCardsEl.querySelectorAll('.env-desc').forEach((ta, i) => {
    ta.addEventListener('change', () => { storyEnvironments[i].description = ta.value; markDirty(); });
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
      item.description = desc;
      if (type === 'char') renderCharacterCards();
      else renderEnvironmentCards();
      markDirty();
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
      markDirty();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

if (charImgInput) charImgInput.addEventListener('change', () => handleRefImageUpload(charImgInput));
if (envImgInput) envImgInput.addEventListener('change', () => handleRefImageUpload(envImgInput));

if (btnAddChar) btnAddChar.addEventListener('click', () => {
  if (storyCharacters.length >= getMaxRefs()) {
    if (isFree()) showUpgradePrompt('Free plan allows 1 character reference. Upgrade to Pro for up to 3.');
    return;
  }
  storyCharacters.push({ id: nextCharId++, name: '', description: '', imgDataUrl: null, imgEl: null });
  renderCharacterCards(); renderSceneAssignments(); markDirty();
});

if (btnAddEnv) btnAddEnv.addEventListener('click', () => {
  if (storyEnvironments.length >= getMaxRefs()) {
    if (isFree()) showUpgradePrompt('Free plan allows 1 environment reference. Upgrade to Pro for up to 3.');
    return;
  }
  storyEnvironments.push({ id: nextEnvId++, name: '', description: '', imgDataUrl: null, imgEl: null });
  renderEnvironmentCards(); renderSceneAssignments(); markDirty();
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
      markDirty();
    });
  });

  // Wire environment dropdown handlers
  container.querySelectorAll('select[data-scene-env]').forEach(sel => {
    sel.addEventListener('change', () => {
      const sceneIdx = parseInt(sel.dataset.sceneEnv);
      createScenes[sceneIdx].refEnvironment = parseInt(sel.value);
      markDirty();
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

createStylePresetEl.addEventListener('change', () => {
  const val = createStylePresetEl.value;
  if (val === 'custom') {
    createStylePromptEl.disabled = false;
    createStylePromptEl.focus();
    createStylePrompt = createStylePromptEl.value;
  } else if (val && STYLE_PRESETS[val]) {
    createStylePrompt = STYLE_PRESETS[val];
    createStylePromptEl.value = createStylePrompt;
    createStylePromptEl.disabled = true;
  } else {
    createStylePrompt = '';
    createStylePromptEl.value = '';
    createStylePromptEl.disabled = true;
  }
  createStylePreset = val;
});

createStylePromptEl.addEventListener('input', () => {
  createStylePrompt = createStylePromptEl.value;
});

// Audio Editor state
let createWavesurfer = null;
let createRegionsPlugin = null;
let createActiveRegion = null;
let createUndoStack = [];

// Image Preview Modal
const imagePreviewOverlay = $('image-preview-overlay');
const imagePreviewImg = $('image-preview-img');
const imagePreviewInfo = $('image-preview-info');
const imagePreviewClose = $('image-preview-close');
const imagePreviewPrev = $('image-preview-prev');
const imagePreviewNext = $('image-preview-next');

function getPreviewableScenes() {
  return createScenes ? createScenes.filter(s => s.imgDataUrl) : [];
}

function openImagePreview(idx) {
  const scenes = getPreviewableScenes();
  if (!scenes.length) return;
  imagePreviewIndex = Math.max(0, Math.min(idx, scenes.length - 1));
  imagePreviewImg.src = scenes[imagePreviewIndex].imgDataUrl;
  imagePreviewInfo.textContent = `Scene ${imagePreviewIndex + 1} of ${scenes.length}`;
  imagePreviewPrev.style.display = scenes.length > 1 ? '' : 'none';
  imagePreviewNext.style.display = scenes.length > 1 ? '' : 'none';
  imagePreviewOverlay.classList.add('visible');
}

function closeImagePreview() {
  imagePreviewOverlay.classList.remove('visible');
}

function navigatePreview(dir) {
  const scenes = getPreviewableScenes();
  if (!scenes.length) return;
  imagePreviewIndex = (imagePreviewIndex + dir + scenes.length) % scenes.length;
  imagePreviewImg.src = scenes[imagePreviewIndex].imgDataUrl;
  imagePreviewInfo.textContent = `Scene ${imagePreviewIndex + 1} of ${scenes.length}`;
}

imagePreviewClose.addEventListener('click', closeImagePreview);
imagePreviewPrev.addEventListener('click', () => navigatePreview(-1));
imagePreviewNext.addEventListener('click', () => navigatePreview(1));
imagePreviewOverlay.addEventListener('click', (e) => {
  if (e.target === imagePreviewOverlay) closeImagePreview();
});
document.addEventListener('keydown', (e) => {
  if (!imagePreviewOverlay.classList.contains('visible')) return;
  if (e.key === 'Escape') closeImagePreview();
  if (e.key === 'ArrowLeft') navigatePreview(-1);
  if (e.key === 'ArrowRight') navigatePreview(1);
});

// ── API Key Management ──
// Migrate old keys
const _migKey = localStorage.getItem('stori_gemini_key') || localStorage.getItem('stori_api_key');
if (_migKey && !localStorage.getItem('stori_key_free')) {
  localStorage.setItem('stori_key_free', _migKey);
  localStorage.removeItem('stori_gemini_key');
  localStorage.removeItem('stori_api_key');
  localStorage.removeItem('stori_gemini_key_free');
  localStorage.removeItem('stori_gemini_key_paid');
}

let freeImageGenAvailable = false;
let activeTier = 'free'; // 'free' | 'paid'

function getFreeKey() { return localStorage.getItem('stori_key_free') || (createApiKeyFree ? createApiKeyFree.value.trim() : ''); }
function getPaidKey() { return localStorage.getItem('stori_key_paid') || (createApiKeyPaid ? createApiKeyPaid.value.trim() : ''); }
function getCreateGeminiKey() { return activeTier === 'paid' ? getPaidKey() : getFreeKey(); }
function getImageKey() { return activeTier === 'paid' ? getPaidKey() : (freeImageGenAvailable ? getFreeKey() : null); }
function isPaidTier() { return activeTier === 'paid'; }

function updateTierSelector() {
  const radioFree = $('tier-radio-free');
  const radioPaid = $('tier-radio-paid');
  const cardFree = $('tier-card-free');
  const cardPaid = $('tier-card-paid');
  if (!radioFree || !radioPaid) return;

  const hasFree = !!getFreeKey();
  const hasPaid = !!getPaidKey();

  // Auto-select: if only one key, select that tier. If both, default paid.
  if (hasFree && hasPaid) {
    if (!localStorage.getItem('stori_active_tier')) activeTier = 'paid';
  } else if (hasFree) {
    activeTier = 'free';
  } else if (hasPaid) {
    activeTier = 'paid';
  }

  radioFree.checked = activeTier === 'free';
  radioPaid.checked = activeTier === 'paid';
  if (cardFree) cardFree.classList.toggle('active', activeTier === 'free');
  if (cardPaid) cardPaid.classList.toggle('active', activeTier === 'paid');
}

// Radio button listeners
document.querySelectorAll('input[name="active-tier"]').forEach(radio => {
  radio.addEventListener('change', () => {
    activeTier = radio.value;
    localStorage.setItem('stori_active_tier', activeTier);
    const cardFree = $('tier-card-free');
    const cardPaid = $('tier-card-paid');
    if (cardFree) cardFree.classList.toggle('active', activeTier === 'free');
    if (cardPaid) cardPaid.classList.toggle('active', activeTier === 'paid');
    updateCreateButtons();
  });
});

// Test if free key supports image generation
async function validateFreeKeyImageGen(key) {
  if (!key) return false;
  keyImageStatus.textContent = '⏳ Checking image generation...';
  keyImageStatus.style.color = 'var(--text-muted)';
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Generate a small blue circle' }] }] })
      }
    );
    if (resp.ok) {
      const data = await resp.json();
      const hasImage = data.candidates?.[0]?.content?.parts?.some(p => p.inlineData);
      if (hasImage) {
        freeImageGenAvailable = true;
        keyImageStatus.textContent = '✓ Image generation available on free tier';
        keyImageStatus.style.color = '#10b981';
        return true;
      }
    }
    freeImageGenAvailable = false;
    keyImageStatus.textContent = '⚠ Image generation not available — add paid key for images';
    keyImageStatus.style.color = '#f59e0b';
    return false;
  } catch(e) {
    freeImageGenAvailable = false;
    keyImageStatus.textContent = '⚠ Could not verify image generation';
    keyImageStatus.style.color = '#f59e0b';
    return false;
  }
}

function flashSave(btn, statusEl) {
  statusEl.textContent = '✓ Saved';
  statusEl.style.color = '#10b981';
  btn.style.background = '#10b981';
  btn.style.color = '#fff';
  btn.textContent = '✓ Saved';
  setTimeout(() => { btn.style.background = ''; btn.style.color = ''; btn.textContent = 'Save'; }, 2000);
}

// Navigation
btnCreateContent.addEventListener('click', () => {
  dropZone.classList.add('hidden');
  createPage.classList.add('visible');
  const savedFree = localStorage.getItem('stori_key_free');
  const savedPaid = localStorage.getItem('stori_key_paid');
  if (savedFree && createApiKeyFree) { createApiKeyFree.value = savedFree; keyStatusFree.textContent = '✓ Saved'; keyStatusFree.style.color = '#10b981'; }
  if (savedPaid && createApiKeyPaid) { createApiKeyPaid.value = savedPaid; keyStatusPaid.textContent = '✓ Saved'; keyStatusPaid.style.color = '#10b981'; }
  // Restore active tier
  const savedTier = localStorage.getItem('stori_active_tier');
  if (savedTier) activeTier = savedTier;
  updateTierSelector();
  updateCreateButtons();
  updateStepStates();
  // Render template category buttons + grid
  initTemplateUI();
  applyPlanGating();
});
btnCreateBack.addEventListener('click', () => {
  createPage.classList.remove('visible');
  dropZone.classList.remove('hidden');
  destroyCreateAudioEditor();
});

// Save free key + validate image gen
btnSaveKeyFree.addEventListener('click', async () => {
  const key = createApiKeyFree.value.trim();
  if (!key) { keyStatusFree.textContent = 'Enter a key'; keyStatusFree.style.color = '#ef4444'; return; }
  localStorage.setItem('stori_key_free', key);
  flashSave(btnSaveKeyFree, keyStatusFree);
  updateTierSelector(); updateCreateButtons(); updateStepStates();
  await validateFreeKeyImageGen(key);
});

// Save paid key
btnSaveKeyPaid.addEventListener('click', () => {
  const key = createApiKeyPaid.value.trim();
  if (!key) { keyStatusPaid.textContent = 'Enter a key'; keyStatusPaid.style.color = '#ef4444'; return; }
  localStorage.setItem('stori_key_paid', key);
  flashSave(btnSaveKeyPaid, keyStatusPaid);
  updateTierSelector(); updateCreateButtons(); updateStepStates();
});

// ── Model Selection (paid tier) ──
function getTextModels() { return ['gemini-2.5-flash', 'gemini-3-flash']; }
function getTranscriptionModels() { return ['gemini-2.5-flash', 'gemini-3-flash']; }
function getImageModels() {
  if (!isPaidTier()) return ['gemini-2.5-flash-image']; // Free tier
  const cat = $('create-image-category')?.value || 'fast';
  if (cat === 'quality') return ['imagen-4.0-ultra-generate-001', 'imagen-4.0-generate-001', 'gemini-2.5-flash-image'];
  return ['gemini-2.5-flash-image', 'imagen-4.0-fast-generate-001', 'gemini-3.1-flash-image-preview'];
}
function getTTSModels() { return ['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-tts']; }
function getSegmentDuration() {
  return isPaidTier() ? { min: 5, max: 15 } : { min: 12, max: 24 };
}

// ── API Call Wrapper with model fallback ──
async function callGeminiAPI(models, body) {
  const modelList = Array.isArray(models) ? models : [models];
  const key = getCreateGeminiKey();
  if (!key) throw new Error('No API key configured. Enter a free or paid tier key in Step 1.');

  for (const model of modelList) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (resp.ok) return await resp.json();
      if (resp.status === 429 || resp.status === 403) continue;
      const err = await resp.json().catch(() => ({}));
      if (err.error?.message?.includes('quota') || err.error?.message?.includes('rate')) continue;
      throw new Error(err.error?.message || `API error ${resp.status}`);
    } catch(e) {
      if (e.message.includes('429') || e.message.includes('quota') || e.message.includes('rate')) continue;
      throw e;
    }
  }
  throw new Error('Rate limit reached on all models. Wait a minute and try again, or switch API tier.');
}

function updateCreateButtons() {
  const hasKey = !!(getFreeKey() || getPaidKey());
  const hasAudio = !!createAudioBuffer;
  btnCreateTranscribe.disabled = !(hasKey && hasAudio);
  // Update transcribe button label based on input mode
  if (!createTranscript && btnCreateTranscribe.textContent.indexOf('✓') === -1 && btnCreateTranscribe.textContent.indexOf('Retry') === -1) {
    btnCreateTranscribe.textContent = createInputMode === 'text' ? '📝 Generate Storyboard' : '🎤 Transcribe with Gemini';
  }
  btnCreateGenerate.disabled = !createScenes || createScenes.length === 0;
  btnCreateSendEditor.disabled = !createScenes || !createScenes.some(s => s.imgDataUrl) || langGenerating;
  // Show image category only for paid tier
  const catLabel = $('image-category-label');
  if (catLabel) catLabel.style.display = isPaidTier() ? '' : 'none';
  if (keyImageStatus && !getFreeKey()) keyImageStatus.textContent = '';
}

// Audio Import
const createSilenceSection = $('create-silence-section');
const createSilThreshold = $('create-sil-threshold');
const createSilThresholdVal = $('create-sil-threshold-val');
const createSilMinDur = $('create-sil-min-dur');
const createSilMethod = $('create-sil-method');
const btnCreateSilDetect = $('btn-create-sil-detect');
const btnCreateSilApply = $('btn-create-sil-apply');
const btnCreateSilReset = $('btn-create-sil-reset');
const createSilInfo = $('create-sil-info');
const createSilVisual = $('create-sil-visual');
let createDetectedRegions = [];

btnCreateImportAudio.addEventListener('click', () => createAudioInput.click());
createAudioInput.addEventListener('change', async () => {
  const file = createAudioInput.files[0];
  if (!file) return;
  createAudioInput.value = '';
  try {
    createAudioFile = file;
    createOriginalBuffer = await loadAudioBuffer(file);
    createAudioBuffer = createOriginalBuffer;
    createAudioName.textContent = file.name;
    createDetectedRegions = [];
    btnCreateSilApply.disabled = true;
    createSilInfo.textContent = '';
    createSilVisual.style.display = 'none';
    updateCreateButtons();
    updateStepStates();
    await showCreateAudioEditor();
  } catch (e) {
    createAudioName.textContent = 'Could not load audio file. Try MP3 or WAV format.';
  }
});

// ── Podcast Audio Import (Create flow) ──
const createPodcastAudioInput = $('create-podcast-audio-input');
const btnCreatePodcastAudio = $('btn-create-podcast-audio');
if (btnCreatePodcastAudio) {
  btnCreatePodcastAudio.addEventListener('click', () => createPodcastAudioInput.click());
}
if (createPodcastAudioInput) {
  createPodcastAudioInput.addEventListener('change', async () => {
    const file = createPodcastAudioInput.files[0];
    if (!file) return;
    createPodcastAudioInput.value = '';
    try {
      createAudioFile = file;
      createOriginalBuffer = await loadAudioBuffer(file);
      createAudioBuffer = createOriginalBuffer;
      createAudioName.textContent = file.name;
      createDetectedRegions = [];
      btnCreateSilApply.disabled = true;
      createSilInfo.textContent = '';
      createSilVisual.style.display = 'none';
      updateCreateButtons();
      updateStepStates();
      await showCreateAudioEditor();
    } catch (e) {
      createAudioName.textContent = 'Could not load audio file. Try MP3 or WAV format.';
    }
  });
}

// ── Speaker Video Import (Create flow) ──
let createPipVideoEl = null;
let createPipVideoSrc = null;

const btnCreatePipImport = $('btn-create-pip-import');
const createPipInput = $('create-pip-input');
const createPipName = $('create-pip-name');
const btnCreatePipRemove = $('btn-create-pip-remove');

btnCreatePipImport.addEventListener('click', () => createPipInput.click());
createPipInput.addEventListener('change', async () => {
  const file = createPipInput.files[0];
  if (!file) return;
  createPipInput.value = '';
  try {
    // Create video element
    const videoEl = document.createElement('video');
    videoEl.muted = true; videoEl.preload = 'auto'; videoEl.playsInline = true;
    const blobUrl = URL.createObjectURL(file);
    videoEl.src = blobUrl;
    await new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = resolve;
      videoEl.onerror = () => reject(new Error('Cannot load video'));
    });

    // Extract audio from the video file
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const arrayBuf = await file.arrayBuffer();
    createOriginalBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
    createAudioBuffer = createOriginalBuffer;
    createAudioFile = file;

    // Store PiP video (also used for video timeline on send to editor)
    createPipVideoEl = videoEl;
    createPipVideoSrc = blobUrl;

    // Update UI
    createAudioName.textContent = `Audio extracted from: ${file.name}`;
    createPipName.textContent = `${file.name} (${fmtShort(videoEl.duration)})`;
    btnCreatePipRemove.style.display = '';
    createDetectedRegions = [];
    btnCreateSilApply.disabled = true;
    createSilInfo.textContent = '';
    createSilVisual.style.display = 'none';
    updateCreateButtons();
    updateStepStates();
    await showCreateAudioEditor();
  } catch (e) {
    createPipName.textContent = 'Could not load video. Try MP4 or WebM format.';
  }
});

btnCreatePipRemove.addEventListener('click', () => {
  if (createPipVideoSrc) URL.revokeObjectURL(createPipVideoSrc);
  createPipVideoEl = null;
  createPipVideoSrc = null;
  createPipName.textContent = '';
  btnCreatePipRemove.style.display = 'none';
});

createSilThreshold.addEventListener('input', () => {
  createSilThresholdVal.textContent = createSilThreshold.value + ' dB';
});

// Always detect against ORIGINAL audio so user can re-adjust settings
btnCreateSilDetect.addEventListener('click', () => {
  if (!createOriginalBuffer) return;
  const threshDb = parseFloat(createSilThreshold.value);
  const minDur = parseFloat(createSilMinDur.value);
  const mode = createSilMethod.value;
  createDetectedRegions = detectSilence(createOriginalBuffer, threshDb, minDur, mode);

  if (createDetectedRegions.length === 0) {
    createSilInfo.textContent = 'No silent regions found. Try adjusting threshold.';
    createSilInfo.style.color = 'var(--text-muted)';
    btnCreateSilApply.disabled = true;
    createSilVisual.style.display = 'none';
  } else {
    const totalSilence = createDetectedRegions.reduce((s, r) => s + r.duration, 0);
    createSilInfo.textContent = `Found ${createDetectedRegions.length} silent regions (${totalSilence.toFixed(1)}s total)`;
    createSilInfo.style.color = '#f59e0b';
    btnCreateSilApply.disabled = false;

    // Render visual against original duration
    createSilVisual.innerHTML = '';
    createSilVisual.style.display = 'block';
    const dur = createOriginalBuffer.duration;
    for (const r of createDetectedRegions) {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute; top:0; height:100%; background:rgba(239,68,68,0.5); border-radius:2px;`;
      el.style.left = ((r.startTime / dur) * 100) + '%';
      el.style.width = Math.max(((r.duration / dur) * 100), 0.3) + '%';
      el.title = `${r.startTime.toFixed(2)}s – ${r.endTime.toFixed(2)}s (${r.duration.toFixed(2)}s)`;
      createSilVisual.appendChild(el);
    }
  }
});

// Always apply against ORIGINAL audio — user can re-detect with new settings and re-apply
btnCreateSilApply.addEventListener('click', () => {
  if (!createOriginalBuffer || createDetectedRegions.length === 0) return;
  const filtered = removeSilentRegions(createOriginalBuffer, createDetectedRegions);
  if (!filtered) {
    createSilInfo.textContent = 'Cannot remove — would delete all audio!';
    createSilInfo.style.color = '#ef4444';
    return;
  }
  const removed = createOriginalBuffer.duration - filtered.duration;
  createAudioBuffer = filtered;

  createSilInfo.textContent = `✓ Removed ${removed.toFixed(1)}s of silence. Adjust settings and re-detect to try different values.`;
  createSilInfo.style.color = '#10b981';
  btnCreateSilApply.disabled = true;
  btnCreateSilReset.style.display = '';
  createSilVisual.style.display = 'none';
  syncDurationDisplays();
  updateCreateButtons();
  if (createWavesurfer) refreshCreateWaveform();
});

// Reset to original audio
btnCreateSilReset.addEventListener('click', () => {
  if (!createOriginalBuffer) return;
  createAudioBuffer = createOriginalBuffer;
  createSilInfo.textContent = 'Restored original audio.';
  createSilInfo.style.color = 'var(--text-muted)';
  btnCreateSilReset.style.display = 'none';
  btnCreateSilApply.disabled = true;
  createDetectedRegions = [];
  createSilVisual.style.display = 'none';
  syncDurationDisplays();
  updateCreateButtons();
  if (createWavesurfer) refreshCreateWaveform();
});

// ── Input Mode Toggle (Audio / Video / Text) ──
const createModeVoice = $('create-mode-voice');
const createModeVideo = $('create-mode-video');
const createModeText = $('create-mode-text');
const createVoiceSection = $('create-voice-section');
const createVideoSection = $('create-video-section');
const createTextSection = $('create-text-section');
const createTtsText = $('create-tts-text');
const createTtsProvider = $('create-tts-provider');
const createTtsVoice = $('create-tts-voice');
const createGcloudKeyRow = $('create-gcloud-key-row');
const createGcloudTtsKey = $('create-gcloud-tts-key');
const btnCreateGenerateTts = $('btn-create-generate-tts');
const createTtsStatus = $('create-tts-status');

const GEMINI_TTS_VOICES = [
  { value: 'Kore', label: 'Kore (Female)' },
  { value: 'Charon', label: 'Charon (Male)' },
  { value: 'Fenrir', label: 'Fenrir (Male)' },
  { value: 'Aoede', label: 'Aoede (Female)' },
  { value: 'Puck', label: 'Puck (Male)' },
  { value: 'Leda', label: 'Leda (Female)' },
  { value: 'Orus', label: 'Orus (Male)' },
  { value: 'Zephyr', label: 'Zephyr (Female)' },
];

const GCLOUD_TTS_VOICES = [
  { value: 'ta-IN-Standard-A', label: 'Tamil - Standard A (Female)' },
  { value: 'ta-IN-Standard-B', label: 'Tamil - Standard B (Male)' },
  { value: 'ta-IN-Standard-C', label: 'Tamil - Standard C (Female)' },
  { value: 'ta-IN-Standard-D', label: 'Tamil - Standard D (Male)' },
  { value: 'ta-IN-Wavenet-A', label: 'Tamil - Wavenet A (Female)' },
  { value: 'ta-IN-Wavenet-B', label: 'Tamil - Wavenet B (Male)' },
  { value: 'ta-IN-Wavenet-C', label: 'Tamil - Wavenet C (Female)' },
  { value: 'ta-IN-Wavenet-D', label: 'Tamil - Wavenet D (Male)' },
  { value: 'en-US-Casual-K', label: 'English US - Casual K (Male)' },
  { value: 'en-US-Standard-C', label: 'English US - Standard C (Female)' },
  { value: 'en-US-Standard-D', label: 'English US - Standard D (Male)' },
  { value: 'en-US-Wavenet-D', label: 'English US - Wavenet D (Male)' },
  { value: 'en-US-Wavenet-F', label: 'English US - Wavenet F (Female)' },
];

function populateVoiceDropdown() {
  createTtsVoice.innerHTML = '';
  const voices = createTtsProvider.value === 'gemini' ? GEMINI_TTS_VOICES : GCLOUD_TTS_VOICES;
  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.value; opt.textContent = v.label;
    createTtsVoice.appendChild(opt);
  });
}
populateVoiceDropdown();

createTtsProvider.addEventListener('change', () => {
  populateVoiceDropdown();
  createGcloudKeyRow.style.display = createTtsProvider.value === 'gcloud' ? '' : 'none';
  // Restore saved gcloud key
  if (createTtsProvider.value === 'gcloud') {
    createGcloudTtsKey.value = localStorage.getItem('stori_gcloud_tts_key') || '';
  }
});

// Save gcloud key on blur
createGcloudTtsKey.addEventListener('blur', () => {
  const k = createGcloudTtsKey.value.trim();
  if (k) localStorage.setItem('stori_gcloud_tts_key', k);
});

function setCreateInputMode(mode) {
  // Gate podcast mode for free tier
  if (mode === 'video' && isFree()) {
    showUpgradePrompt('Podcast pipeline with chapters and PiP is a Pro feature.');
    return;
  }
  createInputMode = mode === 'video' ? 'podcast' : mode; // video tab = podcast mode
  createModeVoice.classList.toggle('active', mode === 'voice');
  createModeVideo.classList.toggle('active', mode === 'video');
  createModeText.classList.toggle('active', mode === 'text');
  createVoiceSection.style.display = mode === 'voice' ? '' : 'none';
  createVideoSection.style.display = mode === 'video' ? '' : 'none';
  createTextSection.style.display = mode === 'text' ? '' : 'none';
  // Show lock icon on podcast tab for free tier
  if (isFree()) createModeVideo.innerHTML = '🔒 Podcast';
  else createModeVideo.innerHTML = '🎙️ Podcast';
  updateCreateButtons();
  updateStepStates();
  // Auto-filter templates: podcast tab → show podcast category, others → show all
  if (mode === 'video') {
    setTemplateCategoryFilter('podcast');
    // Clear non-podcast template selection
    if (selectedTemplate && !selectedTemplate.startsWith('podcast-') && selectedTemplate !== 'blank') {
      applyTemplate('blank');
    }
  } else {
    setTemplateCategoryFilter('all');
  }
}
createModeVoice.addEventListener('click', () => setCreateInputMode('voice'));
createModeVideo.addEventListener('click', () => setCreateInputMode('video'));
createModeText.addEventListener('click', () => setCreateInputMode('text'));

// ── TTS Generation ──
async function generateTTSGemini(text, voiceName, apiKey) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            }
          }
        }
      })
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini TTS error ${resp.status}`);
  }
  const data = await resp.json();
  const part = data.candidates?.[0]?.content?.parts?.[0];
  if (!part?.inlineData?.data) throw new Error('No audio returned from Gemini TTS');
  const b64 = part.inlineData.data;
  const mime = part.inlineData.mimeType || 'audio/wav';
  return { base64: b64, mimeType: mime };
}

async function generateTTSGCloud(text, voiceName, apiKey, langCode) {
  // Use provided langCode or detect from voice name
  const lc = langCode || (voiceName.startsWith('ta-') ? 'ta-IN' : voiceName.startsWith('hi-') ? 'hi-IN' : voiceName.startsWith('te-') ? 'te-IN' : voiceName.startsWith('ml-') ? 'ml-IN' : voiceName.startsWith('es-') ? 'es-ES' : voiceName.startsWith('fr-') ? 'fr-FR' : 'en-US');
  const resp = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: lc, name: voiceName },
        audioConfig: { audioEncoding: 'MP3' }
      })
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Google Cloud TTS error ${resp.status}`);
  }
  const data = await resp.json();
  if (!data.audioContent) throw new Error('No audio returned from Google Cloud TTS');
  return { base64: data.audioContent, mimeType: 'audio/mp3' };
}

// Wrap raw PCM (LINEAR16) samples into a proper WAV file
function wrapPcmInWav(pcmBytes, sampleRate, numChannels, bitsPerSample) {
  const dataSize = pcmBytes.length;
  const headerSize = 44;
  const wav = new Uint8Array(headerSize + dataSize);
  const view = new DataView(wav.buffer);
  // RIFF header
  wav.set([0x52,0x49,0x46,0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  wav.set([0x57,0x41,0x56,0x45], 8); // "WAVE"
  // fmt chunk
  wav.set([0x66,0x6d,0x74,0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true); // byte rate
  view.setUint16(32, numChannels * bitsPerSample / 8, true); // block align
  view.setUint16(34, bitsPerSample, true);
  // data chunk
  wav.set([0x64,0x61,0x74,0x61], 36); // "data"
  view.setUint32(40, dataSize, true);
  wav.set(pcmBytes, headerSize);
  return wav;
}

async function decodeBase64Audio(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  let audioBytes = bytes;

  // If raw PCM (no container headers), wrap in WAV
  // Gemini TTS returns raw PCM at 24kHz 16-bit mono
  if (mimeType.includes('L16') || mimeType.includes('pcm') ||
      (mimeType.includes('wav') && bytes[0] !== 0x52)) { // 0x52 = 'R' (RIFF header)
    // Detect sample rate from mime type (e.g. audio/L16;rate=24000) or default 24000
    let sampleRate = 24000;
    const rateMatch = mimeType.match(/rate=(\d+)/);
    if (rateMatch) sampleRate = parseInt(rateMatch[1]);
    audioBytes = wrapPcmInWav(bytes, sampleRate, 1, 16);
  }

  const blobType = (audioBytes === bytes && !mimeType.includes('L16') && !mimeType.includes('pcm'))
    ? (mimeType.split(';')[0] || 'audio/mpeg') : 'audio/wav';
  const blob = new Blob([audioBytes], { type: blobType });
  const arrayBuf = audioBytes.buffer.slice(audioBytes.byteOffset, audioBytes.byteOffset + audioBytes.byteLength);
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
  return { audioBuffer, blob };
}

btnCreateGenerateTts.addEventListener('click', async () => {
  const text = createTtsText.value.trim();
  if (!text) { createTtsStatus.textContent = 'Please enter some text'; return; }

  const provider = createTtsProvider.value;
  const voiceName = createTtsVoice.value;
  let apiKey;

  if (provider === 'gemini') {
    apiKey = getCreateGeminiKey();
    if (!apiKey) { createTtsStatus.textContent = 'Enter your Gemini API key in Step 1 first'; return; }
  } else {
    apiKey = createGcloudTtsKey.value.trim() || localStorage.getItem('stori_gcloud_tts_key');
    if (!apiKey) { createTtsStatus.textContent = 'Enter your Google Cloud TTS API key'; return; }
  }

  btnCreateGenerateTts.disabled = true;
  btnCreateGenerateTts.innerHTML = '<span class="spinner"></span> Generating...';
  createTtsStatus.textContent = '';

  try {
    let result;
    if (provider === 'gemini') {
      result = await generateTTSGemini(text, voiceName, apiKey);
    } else {
      result = await generateTTSGCloud(text, voiceName, apiKey);
    }

    const { audioBuffer, blob } = await decodeBase64Audio(result.base64, result.mimeType);
    createAudioBuffer = audioBuffer;
    createOriginalBuffer = audioBuffer;

    createTtsStatus.textContent = `Audio generated (${audioBuffer.duration.toFixed(1)}s)`;
    btnCreateGenerateTts.textContent = '🔊 Regenerate Audio';
    updateCreateButtons();
    updateStepStates();
    await showCreateAudioEditor();
  } catch (e) {
    createTtsStatus.textContent = 'Audio generation failed. ' + friendlyApiError(e.message);
    createTtsStatus.style.color = '#ef4444';
    console.error('TTS error:', e);
  } finally {
    btnCreateGenerateTts.disabled = false;
    if (!btnCreateGenerateTts.innerHTML.includes('Regenerate')) {
      btnCreateGenerateTts.textContent = '🔊 Generate Audio';
    }
  }
});

// ══════════════════════════════════════════
//  AUDIO EDITOR (WaveSurfer in Step 2)
// ══════════════════════════════════════════
const createAudioEditor = $('create-audio-editor');
const createWaveformEl  = $('create-waveform');
const btnCreatePlay     = $('btn-create-play');
const btnCreatePlaySel  = $('btn-create-play-sel');
const btnCreateStop     = $('btn-create-stop');
const btnCreateTrim     = $('btn-create-trim');
const btnCreateDel      = $('btn-create-del');
const btnCreateAddAudio = $('btn-create-add-audio');
const createInsertInput = $('create-insert-input');
const btnCreateEditUndo = $('btn-create-edit-undo');
const btnCreateEditReset= $('btn-create-edit-reset');
const createEditTime    = $('create-edit-time');
const createEditSelection = $('create-edit-selection');
const createEditTotal   = $('create-edit-total');
const createEditDuration= $('create-edit-duration');

function initCreateWaveSurfer() {
  if (createWavesurfer) { createWavesurfer.destroy(); createWavesurfer = null; }
  createRegionsPlugin = WaveSurfer.Regions.create();
  createWavesurfer = WaveSurfer.create({
    container: createWaveformEl,
    waveColor: '#6c63ff',
    progressColor: '#4a42cc',
    cursorColor: '#ff6b6b',
    cursorWidth: 2,
    height: 80,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    autoScroll: false,
    autoCenter: false,
    plugins: [createRegionsPlugin],
  });
  createWavesurfer.on('timeupdate', t => {
    createEditTime.textContent = fmt(t);
  });
  createWavesurfer.on('decode', () => {
    createEditTotal.textContent = fmt(createWavesurfer.getDuration());
  });
  createWavesurfer.on('play', () => {
    btnCreatePlay.innerHTML = '&#10074;&#10074; Pause';
  });
  createWavesurfer.on('pause', () => {
    btnCreatePlay.innerHTML = '&#9654; Play';
  });
  createRegionsPlugin.enableDragSelection({ color: 'rgba(108,99,255,0.25)' });
  createRegionsPlugin.on('region-created', r => {
    // Only keep one region at a time
    createRegionsPlugin.getRegions().forEach(x => { if (x.id !== r.id) x.remove(); });
    createActiveRegion = r;
    updateCreateEditButtons();
    // Update on resize
    r.on('update-end', () => updateCreateEditButtons());
  });
  createRegionsPlugin.on('region-removed', () => {
    createActiveRegion = null;
    updateCreateEditButtons();
  });
}

async function refreshCreateWaveform() {
  if (!createAudioBuffer) return;
  initCreateWaveSurfer();
  const wavBlob = audioBufferToWavBlob(createAudioBuffer);
  const url = URL.createObjectURL(wavBlob);
  await createWavesurfer.load(url);
  URL.revokeObjectURL(url);
  createActiveRegion = null;
  updateCreateEditButtons();
}

function updateCreateEditButtons() {
  const hasAudio = !!createAudioBuffer;
  const hasRegion = !!createActiveRegion;
  btnCreatePlay.disabled = !hasAudio;
  btnCreateStop.disabled = !hasAudio;
  btnCreatePlaySel.disabled = !hasRegion;
  btnCreateTrim.disabled = !hasRegion;
  btnCreateDel.disabled = !hasRegion;
  btnCreateEditUndo.disabled = createUndoStack.length === 0;
  createEditDuration.textContent = hasAudio ? fmt(createAudioBuffer.duration) : '';
  if (hasRegion) {
    const s = createActiveRegion.start, e = createActiveRegion.end;
    createEditSelection.textContent = `Selected: ${fmt(s)} – ${fmt(e)} (${fmt(e - s)})`;
  } else {
    createEditSelection.textContent = 'Click and drag to select a region';
  }
  // Show reset if buffer differs from original
  btnCreateEditReset.style.display =
    (createOriginalBuffer && createAudioBuffer !== createOriginalBuffer) ? '' : 'none';
}

function createPushUndo() {
  createUndoStack.push(createAudioBuffer);
  if (createUndoStack.length > 20) createUndoStack.shift();
  btnCreateEditUndo.disabled = false;
}

async function showCreateAudioEditor() {
  createAudioEditor.style.display = 'block';
  createUndoStack = [];
  await refreshCreateWaveform();
}

function destroyCreateAudioEditor() {
  if (createWavesurfer) { createWavesurfer.destroy(); createWavesurfer = null; }
  createAudioEditor.style.display = 'none';
  createUndoStack = [];
  createActiveRegion = null;
}

// Update duration display in the waveform editor
function syncDurationDisplays() {
  if (createAudioBuffer) {
    createEditDuration.textContent = fmt(createAudioBuffer.duration);
  }
}

// ── Audio Editor Button Handlers ──
btnCreatePlay.addEventListener('click', () => {
  if (!createWavesurfer) return;
  createWavesurfer.isPlaying() ? createWavesurfer.pause() : createWavesurfer.play();
});

btnCreatePlaySel.addEventListener('click', () => {
  if (createActiveRegion) createActiveRegion.play();
});

btnCreateStop.addEventListener('click', () => {
  if (createWavesurfer) createWavesurfer.stop();
});

btnCreateTrim.addEventListener('click', async () => {
  if (!createActiveRegion || !createAudioBuffer) return;
  createPushUndo();
  createAudioBuffer = extractRegion(createAudioBuffer, createActiveRegion.start, createActiveRegion.end);
  syncDurationDisplays();
  await refreshCreateWaveform();
  updateCreateButtons();
  updateStepStates();
});

btnCreateDel.addEventListener('click', async () => {
  if (!createActiveRegion || !createAudioBuffer) return;
  createPushUndo();
  const result = deleteRegion(createAudioBuffer, createActiveRegion.start, createActiveRegion.end);
  if (!result) return;
  createAudioBuffer = result;
  syncDurationDisplays();
  await refreshCreateWaveform();
  updateCreateButtons();
  updateStepStates();
});

btnCreateAddAudio.addEventListener('click', () => createInsertInput.click());
createInsertInput.addEventListener('change', async () => {
  const f = createInsertInput.files[0];
  if (!f) return;
  createInsertInput.value = '';
  try {
    const insertTime = createWavesurfer ? createWavesurfer.getCurrentTime() : (createAudioBuffer ? createAudioBuffer.duration : 0);
    const insertBuf = await loadAudioBuffer(f);
    createPushUndo();
    if (createAudioBuffer) {
      createAudioBuffer = insertAudioAt(createAudioBuffer, insertBuf, insertTime);
    } else {
      createAudioBuffer = insertBuf;
      createOriginalBuffer = insertBuf;
    }
    syncDurationDisplays();
    await refreshCreateWaveform();
    updateCreateButtons();
    updateStepStates();
  } catch (e) {
    console.error('Insert audio error:', e);
  }
});

btnCreateEditUndo.addEventListener('click', async () => {
  if (!createUndoStack.length) return;
  createAudioBuffer = createUndoStack.pop();
  btnCreateEditUndo.disabled = createUndoStack.length === 0;
  syncDurationDisplays();
  await refreshCreateWaveform();
  updateCreateButtons();
  updateStepStates();
});

btnCreateEditReset.addEventListener('click', async () => {
  if (!createOriginalBuffer) return;
  createUndoStack = [];
  createAudioBuffer = createOriginalBuffer;
  syncDurationDisplays();
  await refreshCreateWaveform();
  updateCreateButtons();
  updateStepStates();
});

// ── Text segmentation for text mode ──
function segmentTextForStoryboard(text, audioDuration) {
  // Split by sentences (handling Tamil and English punctuation)
  const sentences = text.split(/(?<=[.!?।\n])\s*/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return [];

  // Calculate total char length for proportional timing
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  const segments = [];
  let currentTime = 0;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i].trim();
    if (!s) continue;
    // Proportional duration based on character count
    let dur = (s.length / totalChars) * audioDuration;
    // Enforce 5-15s bounds, merge tiny segments
    dur = Math.max(2, Math.min(15, dur));
    const endTime = Math.min(currentTime + dur, audioDuration);
    segments.push({
      startTime: currentTime,
      endTime: endTime,
      text: s,
      sceneDescription: '', // Will be filled by Gemini
    });
    currentTime = endTime;
  }

  // Adjust last segment to cover full duration
  if (segments.length > 0) {
    segments[segments.length - 1].endTime = audioDuration;
  }

  // Merge segments that are too short (< 3s) with neighbors
  const merged = [];
  for (const seg of segments) {
    if (merged.length > 0 && (seg.endTime - seg.startTime) < 3) {
      const prev = merged[merged.length - 1];
      prev.endTime = seg.endTime;
      prev.text += ' ' + seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  // Split segments that are too long (> 15s)
  const final = [];
  for (const seg of merged) {
    const dur = seg.endTime - seg.startTime;
    if (dur > 15) {
      const parts = Math.ceil(dur / 15);
      const partDur = dur / parts;
      const words = seg.text.split(/\s+/);
      const wordsPerPart = Math.ceil(words.length / parts);
      for (let p = 0; p < parts; p++) {
        final.push({
          startTime: seg.startTime + p * partDur,
          endTime: seg.startTime + (p + 1) * partDur,
          text: words.slice(p * wordsPerPart, (p + 1) * wordsPerPart).join(' '),
          sceneDescription: '',
        });
      }
    } else {
      final.push(seg);
    }
  }

  return final;
}

// Human-readable API error messages (#13)
function friendlyApiError(msg) {
  if (!msg) return 'Unknown error';
  if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate'))
    return 'Rate limit reached — wait a minute and retry, or check your API quota at aistudio.google.com';
  if (msg.includes('403') || msg.toLowerCase().includes('permission'))
    return 'API key lacks permission — verify your key at aistudio.google.com';
  if (msg.includes('401') || msg.toLowerCase().includes('auth'))
    return 'Invalid API key — check and re-save your key';
  if (msg.includes('400') || msg.toLowerCase().includes('invalid'))
    return 'Invalid request — audio may be too large or in an unsupported format';
  if (msg.includes('500') || msg.includes('503'))
    return 'Gemini server error — try again in a moment';
  if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network'))
    return 'Network error — check your internet connection';
  return msg;
}

// Robust JSON parser for Gemini responses (handles markdown fences, trailing commas, missing quotes, extra text)
function parseGeminiJson(text) {
  // Strip markdown code fences
  let s = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Try direct parse first
  try { return JSON.parse(s); } catch (_) {}
  // Extract JSON array from surrounding text
  const arrMatch = s.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    let jsonStr = arrMatch[0];
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(jsonStr); } catch (_) {}
    // Fix missing quotes around string values (common with non-English text)
    // Pattern: "key": value without quotes → "key": "value"
    jsonStr = jsonStr.replace(/"(text|sceneDescription|title|summary)":\s*([^"\[\]{},][^,}\]]*)/g, (match, key, val) => {
      val = val.trim().replace(/"/g, '\\"');
      return `"${key}": "${val}"`;
    });
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(jsonStr); } catch (_) {}
  }
  // Handle truncated JSON — extract all complete objects
  const objects = [];
  const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let m;
  while ((m = objRegex.exec(s)) !== null) {
    let objStr = m[0];
    try {
      const obj = JSON.parse(objStr);
      if (obj.startTime !== undefined || obj.prompt !== undefined || obj.title !== undefined) objects.push(obj);
    } catch (_) {
      // Try fixing missing quotes in this object too
      objStr = objStr.replace(/"(text|sceneDescription|title|summary)":\s*([^"\[\]{},][^,}]*)/g, (match, key, val) => {
        val = val.trim().replace(/"/g, '\\"');
        return `"${key}": "${val}"`;
      });
      try {
        const obj = JSON.parse(objStr);
        if (obj.startTime !== undefined || obj.prompt !== undefined || obj.title !== undefined) objects.push(obj);
      } catch (_) {}
    }
  }
  if (objects.length > 0) return objects;
  // Extract single JSON object
  const objMatch = s.match(/\{[\s\S]*\}/);
  if (objMatch) {
    let jsonStr = objMatch[0];
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(jsonStr); } catch (_) {}
  }
  throw new Error('Could not parse Gemini response as JSON. Raw response: ' + s.slice(0, 200));
}

// Step state indicators (#7 + #9)
function updateStepStates() {
  const steps = createPage.querySelectorAll('.create-step');
  const hasKey = !!(getFreeKey() || getPaidKey());
  const hasAudio = !!createAudioBuffer;
  const hasTranscript = !!createTranscript;
  const hasScenes = createScenes && createScenes.length > 0;
  const hasImages = hasScenes && createScenes.some(s => s.imgDataUrl);

  // steps[0] = Step 1: API Key
  steps[0].classList.toggle('step-done', hasKey);
  // steps[1] = Step 2: Input (Voice/Text)
  steps[1].classList.toggle('step-done', hasAudio);
  // steps[2] = Step 3: Output Size (no state tracking)
  // steps[3] = Step 4: Transcribe / Storyboard generation
  if (steps[3]) {
    steps[3].classList.toggle('step-done', hasTranscript);
    steps[3].classList.toggle('step-active', hasKey && hasAudio && !hasTranscript);
  }
  const hasChapters = createChapters && createChapters.length > 0;
  const isPodcast = createInputMode === 'podcast';

  // steps[4] = Step 5: Chapter Splitting (podcast only)
  if (steps[4]) {
    if (isPodcast) {
      steps[4].classList.toggle('step-done', hasChapters);
      steps[4].classList.toggle('step-active', hasTranscript && !hasChapters);
    } else {
      steps[4].style.display = 'none';
    }
  }
  // steps[5] = Step 6: Storyboard
  if (steps[5]) {
    steps[5].classList.toggle('step-done', hasScenes);
    steps[5].classList.toggle('step-active', hasTranscript && !hasScenes);
  }
  // steps[6] = Step 7: Visual References (optional, shown after scenes exist)
  if (steps[6]) {
    if (hasScenes) {
      steps[6].style.display = '';
      renderSceneAssignments();
    } else {
      steps[6].style.display = 'none';
    }
  }
  // steps[7] = Step 8: Generate Images
  const allImagesDone = hasImages && createScenes.every(s => s.status === 'done');
  if (steps[7]) {
    steps[7].classList.toggle('step-done', allImagesDone);
    steps[7].classList.toggle('step-active', hasScenes && !allImagesDone);
  }
  // steps[8] = Step 9: Multi-Language (Pro only, unlocked after images)
  if (steps[8]) {
    if (hasImages && isPro()) {
      steps[8].style.display = '';
      renderPrimaryAudioCard();
      steps[8].classList.toggle('step-active', true);
    } else {
      steps[8].style.display = 'none';
    }
  }
  // steps[9] = Step 10: Send to Editor
  if (steps[9]) {
    if (hasImages) {
      steps[9].style.display = '';
    }
    steps[9].classList.toggle('step-active', hasImages);
  }
}

// Auto-save create state to localStorage (#4)
function autoSaveCreateState() {
  markDirty();
  try {
    const state = {
      transcript: createTranscript,
      scenes: createScenes ? createScenes.map(s => ({
        prompt: s.prompt, startTime: s.startTime, endTime: s.endTime,
        duration: s.duration, text: s.text, status: s.status,
        // Skip base64 images to stay within localStorage 5MB limit
      })) : null,
      stylePrompt: createStylePrompt,
      stylePreset: createStylePreset,
      selectedTemplate: selectedTemplate,
      characters: storyCharacters.map(c => ({ id: c.id, name: c.name, description: c.description, imgDataUrl: c.imgDataUrl })),
      environments: storyEnvironments.map(e => ({ id: e.id, name: e.name, description: e.description, imgDataUrl: e.imgDataUrl })),
      timestamp: Date.now(),
    };
    localStorage.setItem('stori_create_autosave', JSON.stringify(state));
  } catch (e) {
    console.warn('Auto-save failed:', e.message);
  }
}

// Restore auto-saved state on page load
function restoreAutoSaveIfAvailable() {
  try {
    const saved = localStorage.getItem('stori_create_autosave');
    if (!saved) return false;
    const state = JSON.parse(saved);
    // Only restore if it's recent (within 24 hours)
    if (Date.now() - state.timestamp > 24 * 60 * 60 * 1000) {
      localStorage.removeItem('stori_create_autosave');
      return false;
    }
    return state;
  } catch (e) { return false; }
}

// Transcribe
btnCreateTranscribe.addEventListener('click', async () => {
  const key = getCreateGeminiKey();
  if (!key || !createAudioBuffer) return;

  btnCreateTranscribe.disabled = true;
  createTranscribeProgress.classList.add('visible');
  createTranscribeLabel.style.color = '';
  createTranscribeBar.style.width = '10%';

  try {
    let segments;

    if (createInputMode === 'text') {
      // ── Text mode: segment text + generate scene descriptions ──
      btnCreateTranscribe.innerHTML = '<span class="spinner"></span> Generating storyboard...';
      createTranscribeLabel.textContent = 'Segmenting text...';
      const inputText = createTtsText.value.trim();
      if (!inputText) throw new Error('No text entered');

      segments = segmentTextForStoryboard(inputText, createAudioBuffer.duration);
      createTranscribeBar.style.width = '30%';

      // Call Gemini to generate scene descriptions for each segment
      createTranscribeLabel.textContent = 'Generating scene descriptions...';
      const segTexts = segments.map((s, i) => `Segment ${i+1} [${s.startTime.toFixed(1)}s – ${s.endTime.toFixed(1)}s]: "${s.text}"`).join('\n');

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `Given these text segments from a script, generate a vivid visual scene description for each segment suitable for AI image generation.

${segTexts}

Return ONLY a valid JSON array with no markdown formatting:
[{"segmentIndex": 0, "sceneDescription": "A detailed visual description: subject, style, mood, colors, composition"}]

Important: sceneDescription should describe what should be SEEN, not just what is said. Make it artistic and visually compelling. One entry per segment, in order.` }]
            }]
          })
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error ${resp.status}`);
      }

      createTranscribeBar.style.width = '80%';
      createTranscribeLabel.textContent = 'Processing scene descriptions...';

      const data = await resp.json();
      const respText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (respText) {
        try {
          const descriptions = parseGeminiJson(respText);
          if (Array.isArray(descriptions)) {
            descriptions.forEach(d => {
              const idx = d.segmentIndex ?? descriptions.indexOf(d);
              if (segments[idx]) segments[idx].sceneDescription = d.sceneDescription || '';
            });
          }
        } catch (e) {
          console.warn('Could not parse scene descriptions, using defaults:', e);
        }
      }
      // Fill any empty descriptions
      segments.forEach(s => {
        if (!s.sceneDescription) s.sceneDescription = `Visual scene depicting: ${s.text.slice(0, 100)}`;
      });

    } else {
      // ── Voice mode: full audio transcription ──
      btnCreateTranscribe.innerHTML = '<span class="spinner"></span> Transcribing...';
      createTranscribeLabel.textContent = 'Converting audio...';

      const wavBlob = audioBufferToWavBlob(createAudioBuffer);
      createTranscribeBar.style.width = '25%';
      createTranscribeLabel.textContent = 'Encoding audio...';

      const base64DataUrl = await blobToBase64(wavBlob);
      const base64Data = base64DataUrl.split(',')[1];

      const sizeMB = (base64Data.length * 3 / 4) / (1024 * 1024);
      if (sizeMB > 20) {
        createTranscribeLabel.textContent = `Audio is ${sizeMB.toFixed(0)}MB — may be too large. Trying anyway...`;
      }

      createTranscribeBar.style.width = '40%';
      createTranscribeLabel.textContent = 'Sending to Gemini for transcription...';

      const transcribeBody = {
            contents: [{
              parts: [
                { inline_data: { mime_type: 'audio/wav', data: base64Data } },
                { text: createInputMode === 'podcast'
                  ? `Transcribe this podcast audio which is ${createAudioBuffer.duration.toFixed(1)} seconds long. Break it into segments of roughly 30-120 seconds each, splitting at natural topic or sentence boundaries.

STRICT RULES:
1. Segment length: 30-120 seconds. Split at natural pauses or topic changes.
2. Segments MUST be perfectly contiguous — no gaps. First starts at 0, last ends at ${createAudioBuffer.duration.toFixed(1)}.
3. EVERY part of the audio must be transcribed. Do NOT skip any section.
4. If silence or music, still create a segment with text like "[instrumental]" or "[silence]".

TIMESTAMP ACCURACY (CRITICAL):
- Listen carefully to WHEN each word is actually spoken in the audio.
- Do NOT compress all text into early timestamps. The speech spans the FULL ${createAudioBuffer.duration.toFixed(1)} seconds.
- Each segment's endTime must reflect when that portion of speech ACTUALLY ends in the audio, not just an estimate.
- The LAST segment MUST end at exactly ${createAudioBuffer.duration.toFixed(1)} seconds.
- If the audio is ${createAudioBuffer.duration.toFixed(1)} seconds, your timestamps should span from 0 to ${createAudioBuffer.duration.toFixed(1)} — not stop early at 60% or 70% of the duration.
- Double-check: does your last segment's endTime equal ${createAudioBuffer.duration.toFixed(1)}? If not, fix it.

CRITICAL JSON FORMATTING:
- Return ONLY a valid JSON array, no markdown, no code fences
- ALL string values MUST be wrapped in double quotes
- Escape any double quotes inside text with backslash: \\"
- Non-English text (Tamil, Hindi, etc.) MUST also be in double quotes

Example format:
[{"startTime": 0, "endTime": 60, "text": "transcribed words here", "sceneDescription": ""}]

Note: sceneDescription can be empty — it will be generated later per chapter.`
                  : `Transcribe this audio which is ${createAudioBuffer.duration.toFixed(1)} seconds long. Break it into segments of roughly ${getSegmentDuration().min}-${getSegmentDuration().max} seconds each. The segments MUST cover the ENTIRE audio from 0.0 to ${createAudioBuffer.duration.toFixed(1)} seconds with NO gaps and NO skipped portions.

STRICT RULES (MUST follow ALL):
1. NO segment may exceed ${getSegmentDuration().max} seconds. If a natural segment is longer, split it into sub-segments of ${getSegmentDuration().max} seconds or less.
2. Minimum segment length: ${getSegmentDuration().min} seconds. Maximum: ${getSegmentDuration().max} seconds. Hard limit, NO exceptions.
3. Segments MUST be perfectly contiguous — each segment's startTime MUST equal the previous segment's endTime. No gaps allowed.
4. First segment startTime MUST be 0. Last segment endTime MUST be exactly ${createAudioBuffer.duration.toFixed(1)}.
5. EVERY part of the audio must be transcribed. Do NOT skip, summarize, or omit any section in the middle or end.
6. If the audio has silence or music without speech, still create a segment for it with text like "[instrumental]" or "[silence]".

VALIDATION: After generating, verify that your segments form a complete chain: 0 → ... → ${createAudioBuffer.duration.toFixed(1)} with no missing time ranges.

For each segment, provide the transcribed text AND a detailed visual scene description suitable for generating an illustration image.

Return ONLY a valid JSON array with no markdown formatting, in this exact structure:
[{"startTime": 0, "endTime": 10, "text": "transcribed words here", "sceneDescription": "A detailed visual description for image generation: subject, style, mood, colors, composition"}]

Important: sceneDescription should be a vivid, specific image generation prompt — describe what should be SEEN, not just what is said. Make it artistic and visually compelling.` }
              ]
            }],
          };

      const data = await callGeminiAPI(getTranscriptionModels(), transcribeBody);

      createTranscribeBar.style.width = '80%';
      createTranscribeLabel.textContent = 'Processing response...';

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('No transcription returned from Gemini');

      segments = parseGeminiJson(text);

      if (!Array.isArray(segments) || segments.length === 0) {
        throw new Error('Invalid response format — expected JSON array of segments');
      }

      // Post-process: fix gaps and ensure full coverage
      segments.sort((a, b) => a.startTime - b.startTime);
      const totalDur = createAudioBuffer.duration;
      const fixed = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const expectedStart = fixed.length > 0 ? fixed[fixed.length - 1].endTime : 0;
        if (seg.startTime > expectedStart + 1) {
          fixed.push({ startTime: expectedStart, endTime: seg.startTime, text: '[continued]', sceneDescription: seg.sceneDescription || 'Abstract visual transition with gentle colors and flowing shapes' });
          console.log(`[storyboard] Filled gap: ${expectedStart.toFixed(1)}s – ${seg.startTime.toFixed(1)}s`);
        }
        seg.startTime = fixed.length > 0 ? fixed[fixed.length - 1].endTime : 0;
        if (seg.endTime - seg.startTime > 15) seg.endTime = seg.startTime + 15;
        fixed.push(seg);
      }
      if (fixed.length > 0 && fixed[fixed.length - 1].endTime < totalDur - 0.5) {
        const last = fixed[fixed.length - 1];
        if (createInputMode === 'podcast') {
          // Podcast: just extend last segment to cover remaining (no [continued] padding)
          last.endTime = totalDur;
          console.log(`[storyboard] Extended last segment to ${totalDur.toFixed(1)}s (podcast mode)`);
        } else if (totalDur - last.endTime <= 15) {
          last.endTime = totalDur;
        } else {
          let t = last.endTime;
          while (t < totalDur - 0.5) {
            const end = Math.min(t + 10, totalDur);
            fixed.push({ startTime: t, endTime: end, text: '[continued]', sceneDescription: last.sceneDescription || 'Abstract visual with gentle colors' });
            t = end;
          }
        }
        console.log(`[storyboard] Extended coverage to ${totalDur.toFixed(1)}s`);
      }
      segments = fixed;
    }

    // ── Common: save raw transcript ──
    createTranscript = segments;

    createTranscriptOutput.textContent = segments.map(s =>
      `[${fmt(s.startTime)} – ${fmt(s.endTime)}] ${s.text}`
    ).join('\n\n');
    createTranscriptOutput.classList.add('visible');

    if (createInputMode === 'podcast') {
      // Podcast mode: show chapter step, don't build scenes yet
      createChapterStep.style.display = 'block';
      createStoryboardStep.style.display = 'none';
      createGenerateStep.style.display = 'none';
      createLanguageStep.style.display = 'none';
      createSendStep.style.display = 'none';
    } else {
      // Audio/Text mode: build scenes directly from segments (existing flow)
      createScenes = segments.map(s => ({
        prompt: s.sceneDescription,
        startTime: s.startTime,
        endTime: s.endTime,
        duration: (s.endTime - s.startTime),
        text: s.text,
        imgDataUrl: null,
        status: 'pending',
      }));
      renderStoryboard();
      createStoryboardStep.style.display = 'block';
      createGenerateStep.style.display = 'block';
      createLanguageStep.style.display = 'none';
      createSendStep.style.display = 'none';
    }
    btnCreateSaveEarly.style.display = '';

    createTranscribeBar.style.width = '100%';
    const actionLabel = createInputMode === 'text' ? 'Generated' : 'Transcribed';
    const nextStep = createInputMode === 'podcast' ? 'Set up chapters in Step 5.' : 'Review prompts in Step 6.';
    createTranscribeLabel.textContent = `${actionLabel} ${segments.length} segments. ${nextStep}`;
    btnCreateTranscribe.textContent = `✓ ${actionLabel}`;
    setTimeout(() => createTranscribeProgress.classList.remove('visible'), 3000);
    updateCreateButtons();
    updateStepStates();
    autoSaveCreateState();

  } catch (e) {
    createTranscribeLabel.textContent = 'Transcription failed. ' + friendlyApiError(e.message);
    createTranscribeLabel.style.color = '#ef4444';
    createTranscribeBar.style.width = '0%';
    createTranscribeProgress.classList.add('visible');
    console.error('Transcription error:', e);
    btnCreateTranscribe.disabled = false;
    btnCreateTranscribe.textContent = createInputMode === 'text' ? '🔄 Retry Storyboard' : '🔄 Retry Transcription';
  } finally {
    updateCreateButtons();
    if (getCreateGeminiKey() && createAudioBuffer) btnCreateTranscribe.disabled = false;
  }
});

// Storyboard — shows prompts with timestamps for review
// ══════════════════════════════════════════
//  CHAPTER SPLITTING (Podcast only)
// ══════════════════════════════════════════
let createChapters = null;
let createChapterMode = 'ai';
const createChapterStep = $('create-chapter-step');
const chapterModeAi = $('chapter-mode-ai');
const chapterModeManual = $('chapter-mode-manual');
const chapterAiSection = $('chapter-ai-section');
const chapterManualSection = $('chapter-manual-section');
const chapterList = $('chapter-list');
const chapterControls = $('chapter-controls');
const chapterSummary = $('chapter-summary');
const btnChapterAiSplit = $('btn-chapter-ai-split');
const btnAddChapter = $('btn-add-chapter');
const btnChapterProceed = $('btn-chapter-proceed');
const chapterAiStatus = $('chapter-ai-status');
let nextChapterId = 1;

// Mode toggle
if (chapterModeAi) chapterModeAi.addEventListener('click', () => {
  createChapterMode = 'ai';
  chapterModeAi.classList.add('active');
  chapterModeManual.classList.remove('active');
  chapterAiSection.style.display = '';
  chapterManualSection.style.display = 'none';
});
if (chapterModeManual) chapterModeManual.addEventListener('click', () => {
  createChapterMode = 'manual';
  chapterModeManual.classList.add('active');
  chapterModeAi.classList.remove('active');
  chapterAiSection.style.display = 'none';
  chapterManualSection.style.display = '';
  // Auto-create first chapter if none exist
  if (!createChapters || createChapters.length === 0) {
    const dur = createAudioBuffer ? createAudioBuffer.duration : 60;
    createChapters = [{ id: nextChapterId++, title: 'Chapter 1', startTime: 0, endTime: dur, duration: dur, splits: suggestSplits(dur), transcript: '' }];
  }
  renderChapterCards();
});

function suggestSplits(chapterDuration) {
  return Math.max(1, Math.min(15, Math.round(chapterDuration / 60)));
}

// Build contextual splits for a chapter based on transcript segment boundaries
function buildChapterScenes(ch) {
  if (!createTranscript) return [];
  // Get transcript segments that overlap this chapter
  const relevantSegs = createTranscript.filter(s =>
    s.startTime < ch.endTime && s.endTime > ch.startTime && s.text && s.text !== '[continued]'
  );

  if (relevantSegs.length === 0 || ch.splits <= 1) {
    // Single split: whole chapter
    return [{
      prompt: '', startTime: ch.startTime, endTime: ch.endTime,
      duration: ch.duration,
      text: relevantSegs.map(s => s.text).join(' ').substring(0, 500),
      imgDataUrl: null, status: 'pending',
      chapterId: ch.id, chapterTitle: ch.title,
    }];
  }

  // Collect all sentence break points within the chapter from transcript segments
  const breakPoints = [ch.startTime];
  for (const seg of relevantSegs) {
    const segStart = Math.max(seg.startTime, ch.startTime);
    const segEnd = Math.min(seg.endTime, ch.endTime);
    if (segStart > ch.startTime && !breakPoints.includes(segStart)) {
      breakPoints.push(segStart);
    }
    if (segEnd < ch.endTime && !breakPoints.includes(segEnd)) {
      breakPoints.push(segEnd);
    }
  }
  breakPoints.push(ch.endTime);
  breakPoints.sort((a, b) => a - b);
  // Remove duplicates
  const uniqueBreaks = [...new Set(breakPoints)];

  // If we have more break points than splits, merge the shortest adjacent pairs
  while (uniqueBreaks.length - 1 > ch.splits) {
    let minGap = Infinity, minIdx = 1;
    for (let i = 1; i < uniqueBreaks.length - 1; i++) {
      const gap = uniqueBreaks[i] - uniqueBreaks[i - 1];
      if (gap < minGap) { minGap = gap; minIdx = i; }
    }
    uniqueBreaks.splice(minIdx, 1);
  }

  // If we have fewer break points than splits, subdivide the longest segment
  while (uniqueBreaks.length - 1 < ch.splits) {
    let maxGap = 0, maxIdx = 0;
    for (let i = 0; i < uniqueBreaks.length - 1; i++) {
      const gap = uniqueBreaks[i + 1] - uniqueBreaks[i];
      if (gap > maxGap) { maxGap = gap; maxIdx = i; }
    }
    const mid = (uniqueBreaks[maxIdx] + uniqueBreaks[maxIdx + 1]) / 2;
    uniqueBreaks.splice(maxIdx + 1, 0, mid);
  }

  // Build scenes from break points
  const scenes = [];
  for (let i = 0; i < uniqueBreaks.length - 1; i++) {
    const start = uniqueBreaks[i];
    const end = uniqueBreaks[i + 1];
    scenes.push({
      prompt: '', startTime: start, endTime: end,
      duration: end - start,
      text: getTranscriptForRange(start, end),
      imgDataUrl: null, status: 'pending',
      chapterId: ch.id, chapterTitle: ch.title,
    });
  }
  return scenes;
}

function getTranscriptForRange(start, end) {
  if (!createTranscript) return '';
  return createTranscript
    .filter(s => s.startTime < end && s.endTime > start)
    .map(s => s.text)
    .filter(t => t && t !== '[continued]')
    .join(' ')
    .substring(0, 200);
}

// AI chapter detection
if (btnChapterAiSplit) btnChapterAiSplit.addEventListener('click', async () => {
  const key = getCreateGeminiKey();
  if (!key || !createTranscript) return;
  const dur = createAudioBuffer ? createAudioBuffer.duration : 60;

  btnChapterAiSplit.disabled = true;
  chapterAiStatus.textContent = 'Detecting chapters...';

  try {
    const fullText = createTranscript.map(s =>
      `[${s.startTime.toFixed(1)}s-${s.endTime.toFixed(1)}s] ${s.text}`
    ).join('\n');

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Analyze this podcast transcript and identify distinct topic chapters.\nAudio length: ${dur.toFixed(1)} seconds.\n\n${fullText}\n\nReturn a JSON array:\n[{"title":"Chapter Title","startTime":0,"endTime":300}]\n\nRules:\n- 3-10 chapters total\n- Minimum 60 seconds per chapter\n- Contiguous: first starts at 0, last ends at ${dur.toFixed(1)}, no gaps\n- Each chapter covers one main topic\n- Return ONLY valid JSON, no markdown` }] }],
          generationConfig: { temperature: 0.3 }
        })
      }
    );
    if (!resp.ok) throw new Error(`API error ${resp.status}`);
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response');

    const chapters = parseGeminiJson(text);
    if (!Array.isArray(chapters) || chapters.length === 0) throw new Error('Invalid chapter format');

    createChapters = chapters.map((ch, i) => ({
      id: nextChapterId++,
      title: ch.title || `Chapter ${i + 1}`,
      startTime: ch.startTime || 0,
      endTime: ch.endTime || dur,
      duration: (ch.endTime || dur) - (ch.startTime || 0),
      splits: suggestSplits((ch.endTime || dur) - (ch.startTime || 0)),
      transcript: '',
    }));

    // Fill transcript previews
    for (const ch of createChapters) {
      ch.transcript = getTranscriptForRange(ch.startTime, ch.endTime);
    }

    renderChapterCards();
    chapterAiStatus.textContent = `Detected ${createChapters.length} chapters`;
  } catch(e) {
    chapterAiStatus.textContent = 'Chapter detection failed. ' + friendlyApiError(e.message);
    console.error('Chapter detection error:', e);
  }
  btnChapterAiSplit.disabled = false;
});

// Add chapter (manual mode)
if (btnAddChapter) btnAddChapter.addEventListener('click', () => {
  if (!createChapters) createChapters = [];
  const dur = createAudioBuffer ? createAudioBuffer.duration : 60;
  const lastEnd = createChapters.length > 0 ? createChapters[createChapters.length - 1].endTime : 0;
  const newStart = lastEnd;
  const newEnd = dur;
  if (newStart >= newEnd) return;
  const newDur = newEnd - newStart;
  createChapters.push({
    id: nextChapterId++,
    title: `Chapter ${createChapters.length + 1}`,
    startTime: newStart, endTime: newEnd,
    duration: newDur,
    splits: suggestSplits(newDur),
    transcript: getTranscriptForRange(newStart, newEnd),
  });
  renderChapterCards();
});

// Render chapter cards
function renderChapterCards() {
  if (!chapterList) return;
  chapterList.innerHTML = '';
  if (!createChapters || createChapters.length === 0) {
    chapterControls.style.display = 'none';
    return;
  }
  chapterControls.style.display = '';

  const totalDur = createAudioBuffer ? createAudioBuffer.duration : 60;
  chapterSummary.textContent = `${createChapters.length} chapters · ${fmtShort(totalDur)} total`;

  for (let i = 0; i < createChapters.length; i++) {
    const ch = createChapters[i];
    const card = document.createElement('div');
    card.className = 'chapter-card';

    const isManual = createChapterMode === 'manual';
    card.innerHTML = `
      <div class="chapter-card-header">
        <span class="chapter-card-num">${i + 1}</span>
        <input type="text" class="chapter-card-title" value="${ch.title}" data-idx="${i}">
        <span style="font-size:0.68rem; color:var(--text-muted); font-family:monospace;">${fmtShort(ch.duration)}</span>
        <button class="chapter-delete" data-idx="${i}" title="Delete chapter">✕</button>
      </div>
      <div class="chapter-card-body">
        <label style="font-size:0.7rem;">From: <input type="text" class="chapter-time-input" value="${fmtShort(ch.startTime)}" data-idx="${i}" data-field="start" ${isManual ? '' : 'readonly'}></label>
        <label style="font-size:0.7rem;">To: <input type="text" class="chapter-time-input" value="${fmtShort(ch.endTime)}" data-idx="${i}" data-field="end" ${isManual ? '' : 'readonly'}></label>
      </div>
      ${ch.transcript ? `<div class="chapter-transcript-preview">"${ch.transcript}"</div>` : ''}
    `;

    // Title edit
    card.querySelector('.chapter-card-title').addEventListener('change', (e) => {
      createChapters[i].title = e.target.value;
    });

    // Delete
    card.querySelector('.chapter-delete').addEventListener('click', () => {
      createChapters.splice(i, 1);
      renderChapterCards();
    });

    // Time edits (manual mode only)
    if (isManual) {
      card.querySelectorAll('.chapter-time-input').forEach(inp => {
        inp.addEventListener('change', () => {
          const idx = parseInt(inp.dataset.idx);
          const field = inp.dataset.field;
          const parts = inp.value.split(':');
          const secs = (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
          if (field === 'start') {
            createChapters[idx].startTime = Math.max(0, secs);
          } else {
            createChapters[idx].endTime = Math.min(totalDur, secs);
          }
          createChapters[idx].duration = createChapters[idx].endTime - createChapters[idx].startTime;
          createChapters[idx].splits = suggestSplits(createChapters[idx].duration);
          createChapters[idx].transcript = getTranscriptForRange(createChapters[idx].startTime, createChapters[idx].endTime);
          renderChapterCards();
        });
      });
    }

    chapterList.appendChild(card);
  }
}

// Proceed: build scenes from chapters
if (btnChapterProceed) btnChapterProceed.addEventListener('click', async () => {
  if (!createChapters || createChapters.length === 0) return;
  btnChapterProceed.disabled = true;
  btnChapterProceed.innerHTML = '<span class="spinner"></span> Generating storyboard...';

  try {
    // Build scenes from chapter splits (contextual, based on transcript boundaries)
    createScenes = [];
    for (const ch of createChapters) {
      createScenes.push(...buildChapterScenes(ch));
    }

    // Generate scene descriptions via Gemini (batched per chapter)
    const key = getCreateGeminiKey();
    if (key) {
      for (const ch of createChapters) {
        const chScenes = createScenes.filter(s => s.chapterId === ch.id);
        const sceneTexts = chScenes.map((s, i) => `Scene ${i} (${fmtShort(s.startTime)}-${fmtShort(s.endTime)}): "${s.text}"`).join('\n');

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `For the podcast chapter "${ch.title}", generate a vivid visual scene description for each scene. Each description should be suitable for AI image generation.\n\nScenes:\n${sceneTexts}\n\nReturn a JSON array with EXACTLY ${chScenes.length} entries, one per scene, starting from index 0:\n[{"sceneIndex":0,"sceneDescription":"detailed visual description: subject, composition, mood, colors"}]\n\nIMPORTANT: Return EXACTLY ${chScenes.length} entries. All string values MUST be in double quotes. Return ONLY valid JSON, no markdown.` }] }],
              generationConfig: { temperature: 0.7 }
            })
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const descriptions = parseGeminiJson(text);
            if (Array.isArray(descriptions)) {
              for (const desc of descriptions) {
                const idx = desc.sceneIndex ?? desc.segmentIndex;
                if (idx !== undefined && chScenes[idx]) {
                  chScenes[idx].prompt = desc.sceneDescription || '';
                }
              }
              // Fallback: assign sequentially if any scenes have no prompt
              let descIdx = 0;
              for (const scene of chScenes) {
                if (!scene.prompt && descIdx < descriptions.length) {
                  scene.prompt = descriptions[descIdx].sceneDescription || '';
                  descIdx++;
                } else if (scene.prompt) {
                  descIdx++;
                }
              }
            }
          }
        }
      }
    }

    // Show storyboard + generate steps
    renderStoryboard();
    createStoryboardStep.style.display = 'block';
    createGenerateStep.style.display = 'block';
    updateCreateButtons();
    updateStepStates();
    autoSaveCreateState();
  } catch(e) {
    console.error('Chapter storyboard error:', e);
    chapterAiStatus.textContent = 'Storyboard generation failed. ' + friendlyApiError(e.message);
  }
  btnChapterProceed.disabled = false;
  btnChapterProceed.textContent = 'Generate Storyboard from Chapters →';
});

// Update chapter splits (called from storyboard split controls)
// Just update the split count — no Gemini call. User clicks Regenerate button after adjusting.
function updateChapterSplitCount(chapterId, newSplitCount) {
  const ch = createChapters.find(c => c.id === chapterId);
  if (!ch) return;
  ch.splits = Math.max(1, Math.min(15, newSplitCount));
  renderStoryboard();
}

// Regenerate scenes for a chapter: AI-based contextual splitting + scene descriptions
async function regenerateChapterScenes(chapterId) {
  const ch = createChapters.find(c => c.id === chapterId);
  if (!ch) return;
  const key = getCreateGeminiKey();
  if (!key) return;

  // Remove old scenes for this chapter
  createScenes = createScenes.filter(s => s.chapterId !== chapterId);

  // Get the full transcript text for this chapter
  const chapterText = createTranscript
    .filter(s => s.startTime < ch.endTime && s.endTime > ch.startTime && s.text && s.text !== '[continued]')
    .map(s => `[${s.startTime.toFixed(1)}s-${s.endTime.toFixed(1)}s] ${s.text}`)
    .join('\n');

  try {
    // AI call: split chapter into N contextual segments + generate scene descriptions
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Given this podcast chapter "${ch.title}" (${fmtShort(ch.startTime)} to ${fmtShort(ch.endTime)}, ${ch.duration.toFixed(0)}s), split it into EXACTLY ${ch.splits} segments at natural topic/sentence boundaries.

Transcript:
${chapterText}

For each segment, provide:
1. startTime and endTime (within ${ch.startTime.toFixed(1)} to ${ch.endTime.toFixed(1)})
2. The transcript text for that segment
3. A vivid visual scene description for AI image generation

Return a JSON array with EXACTLY ${ch.splits} entries:
[{"startTime":${ch.startTime.toFixed(1)},"endTime":100.0,"text":"transcript portion","sceneDescription":"detailed visual: subject, composition, mood, colors"}]

RULES:
- EXACTLY ${ch.splits} segments, no more, no less
- Segments must be contiguous: first starts at ${ch.startTime.toFixed(1)}, last ends at ${ch.endTime.toFixed(1)}
- Split at natural topic or sentence boundaries, NOT equal duration
- All string values MUST be in double quotes
- Return ONLY valid JSON, no markdown` }] }],
          generationConfig: { temperature: 0.5 }
        })
      }
    );

    if (!resp.ok) throw new Error(`API error ${resp.status}`);
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response');

    const segments = parseGeminiJson(text);
    if (!Array.isArray(segments) || segments.length === 0) throw new Error('Invalid response');

    const newScenes = segments.map(s => ({
      prompt: s.sceneDescription || '',
      startTime: s.startTime ?? ch.startTime,
      endTime: s.endTime ?? ch.endTime,
      duration: (s.endTime ?? ch.endTime) - (s.startTime ?? ch.startTime),
      text: s.text || '',
      imgDataUrl: null, status: 'pending',
      chapterId: ch.id, chapterTitle: ch.title,
    }));

    // Insert at correct position
    const insertIdx = createScenes.findIndex(s => s.startTime >= ch.startTime);
    createScenes.splice(insertIdx === -1 ? createScenes.length : insertIdx, 0, ...newScenes);

  } catch(e) {
    console.warn('Chapter regenerate error:', e);
    // Fallback: use mechanical splitting
    const fallbackScenes = buildChapterScenes(ch);
    const insertIdx = createScenes.findIndex(s => s.startTime >= ch.startTime);
    createScenes.splice(insertIdx === -1 ? createScenes.length : insertIdx, 0, ...fallbackScenes);
  }

  renderStoryboard();
  renderCreateSceneCards();
  updateStepStates();
}

function renderStoryboardSceneCard(scene, idx) {
  const card = document.createElement('div');
  card.className = 'storyboard-card';
  card.innerHTML = `
    <div class="storyboard-time">
      <span class="time-badge">${fmt(scene.startTime)}</span>
      <span class="time-badge">${fmt(scene.endTime)}</span>
      <span class="time-dur">${scene.duration.toFixed(1)}s</span>
    </div>
    <div class="storyboard-content">
      <div class="storyboard-transcript">🗣 "${scene.text}"</div>
      <div class="storyboard-prompt-label">Image Prompt</div>
      <textarea class="storyboard-prompt" id="create-storyboard-prompt-${idx}" rows="3">${scene.prompt}</textarea>
    </div>
  `;
  const textarea = card.querySelector(`#create-storyboard-prompt-${idx}`);
  textarea.addEventListener('input', () => {
    createScenes[idx].prompt = textarea.value;
    const scenePrompt = $(`create-scene-prompt-${idx}`);
    if (scenePrompt) scenePrompt.value = textarea.value;
  });
  return card;
}

function renderStoryboard() {
  createStoryboardGrid.innerHTML = '';
  if (!createScenes) return;

  // Podcast mode: group by chapters
  if (createInputMode === 'podcast' && createChapters && createChapters.length > 0) {
    for (const ch of createChapters) {
      const chScenes = createScenes
        .map((s, i) => ({ scene: s, globalIdx: i }))
        .filter(({ scene }) => scene.chapterId === ch.id);

      const group = document.createElement('div');
      group.className = 'storyboard-chapter-group';

      // Chapter header with split controls
      const header = document.createElement('div');
      header.className = 'storyboard-chapter-header';
      const avgDur = ch.duration / ch.splits;
      const currentSceneCount = chScenes.length;
      const needsRegen = currentSceneCount !== ch.splits;
      header.innerHTML = `
        <span class="storyboard-chapter-toggle">▼</span>
        <span class="storyboard-chapter-title">${ch.title}</span>
        <span style="font-size:0.68rem; color:var(--text-muted); font-family:monospace;">${fmtShort(ch.startTime)}-${fmtShort(ch.endTime)}</span>
        <div class="chapter-splits-control">
          <button class="chapter-splits-btn" data-ch="${ch.id}" data-dir="-1">−</button>
          <span class="chapter-splits-val">${ch.splits}</span>
          <button class="chapter-splits-btn" data-ch="${ch.id}" data-dir="1">+</button>
        </div>
        <button class="btn-regen-chapter" data-ch="${ch.id}" style="font-size:0.68rem; padding:3px 10px; background:${needsRegen ? 'var(--accent)' : 'var(--bg-input)'}; color:${needsRegen ? '#fff' : 'var(--text-secondary)'}; border:1px solid var(--border); border-radius:4px; cursor:pointer;">🔄 Regenerate</button>
        <span class="storyboard-chapter-count">${currentSceneCount} scene${currentSceneCount !== 1 ? 's' : ''}${needsRegen ? ` → ${ch.splits}` : ''}</span>
      `;

      const scenesContainer = document.createElement('div');
      scenesContainer.className = 'storyboard-chapter-scenes';

      // Toggle collapse
      header.addEventListener('click', (e) => {
        if (e.target.classList.contains('chapter-splits-btn') || e.target.classList.contains('btn-regen-chapter')) return;
        const isCollapsed = scenesContainer.classList.toggle('collapsed');
        header.querySelector('.storyboard-chapter-toggle').textContent = isCollapsed ? '▶' : '▼';
      });

      // Split +/- buttons (only update count, no AI call)
      header.querySelectorAll('.chapter-splits-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const dir = parseInt(btn.dataset.dir);
          const newCount = ch.splits + dir;
          if (newCount >= 1 && newCount <= 15) {
            updateChapterSplitCount(ch.id, newCount);
          }
        });
      });

      // Regenerate button (AI call for contextual splitting + descriptions)
      header.querySelector('.btn-regen-chapter').addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.target;
        btn.disabled = true;
        btn.textContent = '⏳ Generating...';
        await regenerateChapterScenes(ch.id);
        btn.disabled = false;
        btn.textContent = '🔄 Regenerate';
      });

      for (const { scene, globalIdx } of chScenes) {
        scenesContainer.appendChild(renderStoryboardSceneCard(scene, globalIdx));
      }

      group.appendChild(header);
      group.appendChild(scenesContainer);
      createStoryboardGrid.appendChild(group);
    }
  } else {
    // Audio/Text mode: flat list (existing behavior)
    createScenes.forEach((scene, idx) => {
      createStoryboardGrid.appendChild(renderStoryboardSceneCard(scene, idx));
    });
  }
}

// Regenerate all prompts (re-ask Gemini for new scene descriptions)
btnCreateRegeneratePrompts.addEventListener('click', async () => {
  const key = getCreateGeminiKey();
  if (!key || !createTranscript) return;

  if (!confirm('This will overwrite all your current image prompts with new AI-generated ones. Continue?')) return;

  btnCreateRegeneratePrompts.disabled = true;
  btnCreateRegeneratePrompts.innerHTML = '<span class="spinner"></span> Regenerating...';

  try {
    const transcriptText = createTranscript.map(s =>
      `[${s.startTime}s - ${s.endTime}s]: ${s.text}`
    ).join('\n');

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Here is a transcript with timestamps from an audio that is ${createAudioBuffer.duration.toFixed(1)} seconds long:\n\n${transcriptText}\n\nFor each segment, generate a vivid, detailed image generation prompt that visually represents the content being discussed. The prompt should describe a scene with specific details about subject, composition, style, mood, lighting, and colors — suitable for AI image generation.\n\nIMPORTANT: The segments MUST cover the ENTIRE audio duration from 0 to ${createAudioBuffer.duration.toFixed(1)} seconds. The last segment's endTime must be ${createAudioBuffer.duration.toFixed(1)}. Do not skip or shorten any segment.\n\nReturn ONLY a valid JSON array with no markdown:\n[{"startTime": 0, "endTime": 10, "prompt": "detailed image prompt here"}]` }]
          }]
        })
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${resp.status}`);
    }

    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const newPrompts = parseGeminiJson(text);

    // Update prompts in createScenes
    for (const np of newPrompts) {
      const scene = createScenes.find(s => s.startTime === np.startTime);
      if (scene) scene.prompt = np.prompt;
    }

    renderStoryboard();
    renderCreateSceneCards();
    // Clear any previous error
    const errSpan = btnCreateRegeneratePrompts.parentElement.querySelector('.regen-error');
    if (errSpan) errSpan.remove();

  } catch (e) {
    console.error('Regenerate prompts error:', e);
    // Show error inline below the button
    const errSpan = btnCreateRegeneratePrompts.parentElement.querySelector('.regen-error') || (() => {
      const s = document.createElement('span');
      s.className = 'regen-error';
      s.style.cssText = 'font-size:0.7rem; color:#ef4444; display:block; margin-top:6px;';
      btnCreateRegeneratePrompts.parentElement.appendChild(s);
      return s;
    })();
    errSpan.textContent = '✗ ' + friendlyApiError(e.message) + ' — click to retry';
  } finally {
    btnCreateRegeneratePrompts.disabled = false;
    btnCreateRegeneratePrompts.textContent = '🔄 Regenerate All Prompts';
  }
});

// Scene Cards
function getSelectedImageSize() {
  const val = createImageSize.value; // e.g. "1280x720"
  const [w, h] = val.split('x').map(Number);
  return { width: w, height: h, ratio: `${w}/${h}` };
}

function renderSceneCard(scene, idx, ratio) {
    const card = document.createElement('div');
    card.className = 'scene-card';

    const refThumbHtml = scene.refImageDataUrl
      ? `<img class="ref-thumb" src="${scene.refImageDataUrl}" alt="Ref">`
      : '';
    const refLabel = scene.refImageDataUrl ? '✓ Reference set' : '';

    card.innerHTML = `
      <div class="scene-img" id="create-scene-img-${idx}" style="aspect-ratio:${ratio};">
        ${scene.imgDataUrl
          ? `<img src="${scene.imgDataUrl}" alt="Scene ${idx + 1}" style="aspect-ratio:${ratio}; cursor:pointer;">`
          : `<div class="scene-img-placeholder" style="aspect-ratio:${ratio};"></div>`}
      </div>
      <div class="scene-body">
        <div class="scene-time">🕐 ${fmt(scene.startTime)} – ${fmt(scene.endTime)}</div>
        <div class="scene-text">"${scene.text}"</div>
        <textarea id="create-scene-prompt-${idx}">${scene.prompt}</textarea>
        <div class="scene-actions">
          <button class="btn-regen" style="font-size:0.7rem; padding:3px 10px;">🔄 Regenerate</button>
          <button class="btn-download-img" style="font-size:0.68rem; padding:3px 8px; ${scene.imgDataUrl ? '' : 'display:none;'}">📥 Download</button>
          <button class="btn-ref" style="font-size:0.68rem; padding:3px 8px;">📎 Ref Image</button>
          <input type="file" class="ref-input" accept="image/*" style="display:none;">
          <span class="scene-status ${scene.status || ''}" id="create-scene-status-${idx}">
            ${scene.status === 'done' ? '✓ Done' : scene.status === 'generating' ? '⏳ Generating...' : scene.status === 'error' ? '✗ Error' : '○ Pending'}
          </span>
        </div>
        <div class="scene-ref-row" id="create-scene-ref-${idx}" style="${scene.refImageDataUrl ? '' : 'display:none;'}">
          ${refThumbHtml}
          <span class="ref-label">${refLabel}</span>
          <button class="btn-ref-remove" style="font-size:0.62rem; padding:1px 6px; ${scene.refImageDataUrl ? '' : 'display:none;'}">✕</button>
        </div>
      </div>
    `;
    // Image preview click
    const imgEl = card.querySelector('.scene-img img');
    if (imgEl) {
      imgEl.addEventListener('click', () => {
        const previewIdx = getPreviewableScenes().findIndex(s => s === scene);
        if (previewIdx >= 0) openImagePreview(previewIdx);
      });
    }

    // Regenerate button
    card.querySelector('.btn-regen').addEventListener('click', () => regenerateScene(idx));

    // Download individual image
    const btnDownloadImg = card.querySelector('.btn-download-img');
    if (btnDownloadImg) {
      btnDownloadImg.addEventListener('click', () => {
        if (!scene.imgDataUrl) return;
        const a = document.createElement('a');
        a.href = scene.imgDataUrl;
        a.download = `stori-scene-${idx + 1}.png`;
        a.click();
      });
    }

    // Reference image upload
    const refInput = card.querySelector('.ref-input');
    const btnRef = card.querySelector('.btn-ref');
    const refRow = card.querySelector('.scene-ref-row');
    const btnRefRemove = card.querySelector('.btn-ref-remove');

    btnRef.addEventListener('click', () => refInput.click());

    refInput.addEventListener('change', async () => {
      const file = refInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        scene.refImageDataUrl = e.target.result;
        // Show thumbnail
        refRow.style.display = '';
        refRow.innerHTML = `
          <img class="ref-thumb" src="${scene.refImageDataUrl}" alt="Ref">
          <span class="ref-label">⏳ Analyzing reference...</span>
        `;
        // Auto-update prompt based on reference image using Gemini
        try {
          await updatePromptFromReference(idx);
          refRow.innerHTML = `
            <img class="ref-thumb" src="${scene.refImageDataUrl}" alt="Ref">
            <span class="ref-label" style="color:#10b981;">✓ Prompt updated from reference</span>
            <button class="btn-ref-remove" style="font-size:0.62rem; padding:1px 6px;">✕</button>
          `;
          refRow.querySelector('.btn-ref-remove').addEventListener('click', () => {
            scene.refImageDataUrl = null;
            refRow.style.display = 'none';
          });
        } catch (err) {
          refRow.innerHTML = `
            <img class="ref-thumb" src="${scene.refImageDataUrl}" alt="Ref">
            <span class="ref-label" style="color:#ef4444;">✗ ${err.message}</span>
            <button class="btn-ref-remove" style="font-size:0.62rem; padding:1px 6px;">✕</button>
          `;
          refRow.querySelector('.btn-ref-remove').addEventListener('click', () => {
            scene.refImageDataUrl = null;
            refRow.style.display = 'none';
          });
        }
      };
      reader.readAsDataURL(file);
    });

    if (btnRefRemove) {
      btnRefRemove.addEventListener('click', () => {
        scene.refImageDataUrl = null;
        refRow.style.display = 'none';
      });
    }

    return card;
}

function renderCreateSceneCards() {
  createSceneGrid.innerHTML = '';
  if (!createScenes) return;
  const { ratio } = getSelectedImageSize();

  // Podcast mode: group by chapters
  if (createInputMode === 'podcast' && createChapters && createChapters.length > 0) {
    for (const ch of createChapters) {
      const chScenes = createScenes
        .map((s, i) => ({ scene: s, globalIdx: i }))
        .filter(({ scene }) => scene.chapterId === ch.id);

      const group = document.createElement('div');
      group.className = 'storyboard-chapter-group';

      const doneCount = chScenes.filter(({ scene }) => scene.imgDataUrl).length;
      const header = document.createElement('div');
      header.className = 'storyboard-chapter-header';
      header.innerHTML = `
        <span class="storyboard-chapter-toggle">▼</span>
        <span class="storyboard-chapter-title">${ch.title}</span>
        <span class="storyboard-chapter-count">${doneCount}/${chScenes.length} images</span>
        <button class="btn-gen-chapter primary" data-ch="${ch.id}" style="font-size:0.68rem; padding:3px 10px;">Generate Chapter</button>
      `;

      const scenesContainer = document.createElement('div');
      scenesContainer.className = 'storyboard-chapter-scenes scene-grid';

      header.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-gen-chapter')) return;
        const isCollapsed = scenesContainer.classList.toggle('collapsed');
        header.querySelector('.storyboard-chapter-toggle').textContent = isCollapsed ? '▶' : '▼';
      });

      // Generate chapter button
      header.querySelector('.btn-gen-chapter').addEventListener('click', async (e) => {
        e.stopPropagation();
        const scenesToGen = chScenes.map(({ scene }) => scene).filter(s => s.status !== 'done');
        if (scenesToGen.length === 0) return;
        await runImageGeneration(scenesToGen);
        renderCreateSceneCards();
      });

      for (const { scene, globalIdx } of chScenes) {
        scenesContainer.appendChild(renderSceneCard(scene, globalIdx, ratio));
      }

      group.appendChild(header);
      group.appendChild(scenesContainer);
      createSceneGrid.appendChild(group);
    }
  } else {
    // Audio/Text mode: flat grid
    createScenes.forEach((scene, idx) => {
      createSceneGrid.appendChild(renderSceneCard(scene, idx, ratio));
    });
  }
}

// Analyze reference image and update scene prompt
async function updatePromptFromReference(idx) {
  const scene = createScenes[idx];
  if (!scene.refImageDataUrl) return;
  const key = getCreateGeminiKey();
  if (!key) throw new Error('API key required');

  // Extract base64 and mimeType from data URL
  const match = scene.refImageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data');
  const [, mimeType, base64Data] = match;

  const data = await callGeminiAPI(getTextModels(), {
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: `Analyze this reference image carefully. The generated image should resemble the person/people in this reference image — same face, features, appearance, clothing style, and build. Incorporate the reference image's visual style, color palette, and mood as well.\n\nOriginal scene prompt: "${scene.prompt}"\n\nReturn ONLY the updated prompt text that describes the scene while ensuring the person looks like the one in the reference image. Include specific physical descriptions (face shape, hair, skin tone, clothing) from the reference.` }
        ]
      }]
    }
  );

  const updatedPrompt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (updatedPrompt) {
    const oldPrompt = scene.prompt;
    scene.prompt = updatedPrompt;
    // Update the textarea with highlight animation
    const textarea = $(`create-scene-prompt-${idx}`);
    if (textarea) {
      textarea.value = updatedPrompt;
      textarea.style.transition = 'background 0.5s';
      textarea.style.background = 'rgba(16,185,129,0.15)';
      setTimeout(() => { textarea.style.background = ''; }, 2000);
    }
    // Also update storyboard textarea with highlight
    const storyTextarea = $(`create-storyboard-prompt-${idx}`);
    if (storyTextarea) {
      storyTextarea.value = updatedPrompt;
      storyTextarea.style.transition = 'background 0.5s';
      storyTextarea.style.background = 'rgba(16,185,129,0.15)';
      setTimeout(() => { storyTextarea.style.background = ''; }, 2000);
    }
  }
}

// Image Generation
// Gemini Image — tries multiple model names with fallback
const GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image',
];
let geminiImageModel = null; // cached after first success

async function generateImageGeminiFlash(prompt, key, { width, height, refImageDataUrl, refParts } = {}, modelOverride) {
  const sizeHint = width && height ? ` The image should be ${width}x${height} pixels, ${width > height ? 'landscape' : width < height ? 'portrait' : 'square'} orientation.` : '';
  const cleanPrompt = prompt.trim().slice(0, 1200);

  // Build content parts
  const parts = [];
  // Add story reference images (characters + environments) first
  if (refParts && refParts.length > 0) {
    parts.push(...refParts);
  }
  if (refImageDataUrl) {
    const match = refImageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) {
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      parts.push({ text: `Generate a new image maintaining visual consistency with the reference images above. Match the characters' appearance, environment style, and mood. Scene description: ${cleanPrompt}${sizeHint}` });
    } else {
      parts.push({ text: `Generate an image: ${cleanPrompt}${sizeHint}` });
    }
  } else if (refParts && refParts.length > 0) {
    parts.push({ text: `Generate an image maintaining visual consistency with the reference images above. Match the characters' appearance and environment closely. Scene: ${cleanPrompt}${sizeHint}` });
  } else {
    parts.push({ text: `Generate an image: ${cleanPrompt}${sizeHint}` });
  }

  const body = JSON.stringify({
    contents: [{ parts }]
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 3000));

    const modelsToTry = modelOverride ? [modelOverride] : (geminiImageModel ? [geminiImageModel] : GEMINI_IMAGE_MODELS);

    for (const model of modelsToTry) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body }
      );
      if (resp.status === 404) continue;
      if (!resp.ok) {
        if (attempt === 0 && (resp.status === 429 || resp.status === 503 || resp.status === 500)) break;
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini image error ${resp.status}`);
      }
      const data = await resp.json();
      const resParts = data.candidates?.[0]?.content?.parts || [];
      for (const part of resParts) {
        if (part.inlineData) {
          geminiImageModel = model;
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
      if (attempt === 0) break; // no image, retry once
    }
  }
  throw new Error('Image generation failed after 3 attempts. Use the regenerate button to try again.');
}

// Gemini Imagen — dedicated image model
async function generateImageImagen(prompt, key, { width, height } = {}, modelOverride) {
  const cleanPrompt = (prompt.trim() + ' Do NOT include any text, words, letters, captions, or writing in any language in the image.').slice(0, 800);
  // Determine aspect ratio string for Imagen
  let aspectRatio = '16:9';
  if (width && height) {
    const r = width / height;
    if (Math.abs(r - 1) < 0.05) aspectRatio = '1:1';
    else if (Math.abs(r - 16/9) < 0.1) aspectRatio = '16:9';
    else if (Math.abs(r - 9/16) < 0.1) aspectRatio = '9:16';
    else if (Math.abs(r - 4/3) < 0.1) aspectRatio = '4:3';
    else if (Math.abs(r - 3/4) < 0.1) aspectRatio = '3:4';
    else if (r >= 2.5) aspectRatio = '16:9'; // wide banner
    else if (r > 1) aspectRatio = '16:9';
    else aspectRatio = '9:16';
  }

  const imagenModel = modelOverride || 'imagen-4.0-fast-generate-001';
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${imagenModel}:predict`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        instances: [{ prompt: cleanPrompt }],
        parameters: { sampleCount: 1, aspectRatio }
      })
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Imagen error ${resp.status}`);
  }
  const data = await resp.json();
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('No image data in response');
  return `data:image/png;base64,${b64}`;
}

async function generateSceneImage(idx) {
  const scene = createScenes[idx];
  const key = getImageKey() || getCreateGeminiKey();
  const { width, height } = getSelectedImageSize();

  // Sync prompt from storyboard or scene card (whichever was edited last)
  const storyPromptEl = $(`create-storyboard-prompt-${idx}`);
  const scenePromptEl = $(`create-scene-prompt-${idx}`);
  if (scenePromptEl) scene.prompt = scenePromptEl.value;
  else if (storyPromptEl) scene.prompt = storyPromptEl.value;

  scene.status = 'generating';
  updateSceneCardStatus(idx);

  try {
    if (!key) throw new Error('API key required');
    let imgDataUrl;
    // Build prompt with character/environment references if available
    const hasRefs = (scene.refCharacters && scene.refCharacters.length > 0) || (scene.refEnvironment >= 0);
    let effectivePrompt = hasRefs
      ? buildScenePromptWithRefs(scene, scene.prompt)
      : (createStylePrompt ? `Style: ${createStylePrompt}. Scene: ${scene.prompt}` : scene.prompt);
    // Text mode instruction
    const textMode = $('create-image-text-mode')?.value || 'no-text';
    if (textMode === 'no-text') {
      effectivePrompt += ' STRICT: Do NOT include any text, words, letters, numbers, captions, titles, or writing in ANY language or script in the image. The image must be purely visual with zero text.';
    } else if (textMode === 'english-only') {
      effectivePrompt += ' STRICT: If any text appears in the image, it MUST be in English only. Do NOT use Tamil, Hindi, Devanagari, or any non-Latin script. English text only.';
    }
    // Collect reference image parts for API call
    const refParts = hasRefs ? getSceneRefImageParts(scene) : [];
    const opts = { width, height, refImageDataUrl: scene.refImageDataUrl, refParts };
    // Try image models in fallback order
    const models = getImageModels();
    let lastError = null;
    for (const model of models) {
      try {
        if (model.startsWith('imagen-')) {
          imgDataUrl = await generateImageImagen(effectivePrompt, key, opts, model);
        } else {
          imgDataUrl = await generateImageGeminiFlash(effectivePrompt, key, opts, model);
        }
        break;
      } catch(e) {
        lastError = e;
        if (e.message.includes('429') || e.message.includes('quota') || e.message.includes('rate')) continue;
        throw e;
      }
    }
    if (!imgDataUrl) throw lastError || new Error('Image generation failed. Free tier may not support image generation — try adding a paid tier key.');
    scene.imgDataUrl = imgDataUrl;
    scene.status = 'done';
    updateSceneCardImage(idx);
    updateSceneCardStatus(idx);
    autoSaveCreateState();
  } catch (e) {
    scene.status = 'error';
    updateSceneCardStatus(idx, friendlyApiError(e.message));
    console.error(`Scene ${idx + 1} error:`, e);
  }
}

function updateSceneCardImage(idx) {
  const imgDiv = $(`create-scene-img-${idx}`);
  if (!imgDiv) return;
  const scene = createScenes[idx];
  const { ratio } = getSelectedImageSize();
  imgDiv.style.aspectRatio = ratio;
  if (scene.imgDataUrl) {
    imgDiv.innerHTML = `<img src="${scene.imgDataUrl}" alt="Scene ${idx + 1}" style="aspect-ratio:${ratio}; cursor:pointer;">`;
    imgDiv.querySelector('img').addEventListener('click', () => {
      const previewIdx = getPreviewableScenes().findIndex(s => s === scene);
      if (previewIdx >= 0) openImagePreview(previewIdx);
    });
  } else {
    imgDiv.innerHTML = `<div class="scene-img-placeholder" style="aspect-ratio:${ratio};"></div>`;
  }
}

function updateSceneCardStatus(idx, errorMsg) {
  const statusEl = $(`create-scene-status-${idx}`);
  if (!statusEl) return;
  const scene = createScenes[idx];
  statusEl.className = 'scene-status ' + scene.status;
  statusEl.textContent = scene.status === 'done' ? '✓ Done'
    : scene.status === 'generating' ? '⏳ Generating...'
    : scene.status === 'error' ? `✗ ${errorMsg || 'Error'}`
    : '○ Pending';
  // Show/hide download button on this card
  const card = statusEl.closest('.scene-card');
  if (card) {
    const dlBtn = card.querySelector('.btn-download-img');
    if (dlBtn) dlBtn.style.display = scene.imgDataUrl ? '' : 'none';
  }
  // Show/hide Download All button
  const btnDlAll = $('btn-download-all-images');
  if (btnDlAll && createScenes) {
    btnDlAll.style.display = createScenes.some(s => s.imgDataUrl) ? '' : 'none';
  }
  updateCreateButtons();
}

// Download All Images
const btnDownloadAllImages = $('btn-download-all-images');
if (btnDownloadAllImages) {
  btnDownloadAllImages.addEventListener('click', () => {
    if (!createScenes) return;
    const withImages = createScenes.filter(s => s.imgDataUrl);
    if (withImages.length === 0) return;
    withImages.forEach((scene, i) => {
      const idx = createScenes.indexOf(scene);
      const a = document.createElement('a');
      a.href = scene.imgDataUrl;
      a.download = `stori-scene-${idx + 1}.png`;
      // Stagger downloads to avoid browser blocking
      setTimeout(() => a.click(), i * 200);
    });
    setStatus(`Downloading ${withImages.length} image(s)...`);
  });
}

// Regenerate single scene (called from onclick)
window.regenerateScene = async function(idx) {
  await generateSceneImage(idx);
};

// Update aspect ratios when image size changes
createImageSize.addEventListener('change', () => {
  if (createScenes) renderCreateSceneCards();
});

// Generate All Images
const btnCreateRetryFailed = $('btn-create-retry-failed');
const btnCreatePause = $('btn-create-pause');
let generatePaused = false;
let generateRunning = false;

async function runImageGeneration(scenesToGen) {
  // Sync all prompts from storyboard before generating
  createScenes.forEach((s, i) => {
    const el = $(`create-storyboard-prompt-${i}`);
    if (el) s.prompt = el.value;
  });
  renderCreateSceneCards();
  btnCreateGenerate.disabled = true;
  btnCreateRetryFailed.style.display = 'none';
  btnCreatePause.style.display = '';
  btnCreatePause.textContent = '⏸ Pause';
  generatePaused = false;
  generateRunning = true;
  createGenerateProgress.classList.add('visible');
  createGenerateLabel.style.color = '';
  const total = scenesToGen.length;

  for (let i = 0; i < total; i++) {
    // Check if paused — wait until resumed
    if (generatePaused) {
      const doneNow = createScenes.filter(s => s.status === 'done').length;
      const remaining = total - i;
      createGenerateLabel.textContent = `Paused — ${doneNow} done, ${remaining} remaining.`;
      createGenerateLabel.style.color = '#f59e0b';
      // Wait for resume
      await new Promise(resolve => {
        const check = () => {
          if (!generatePaused) { resolve(); return; }
          if (!generateRunning) { resolve(); return; } // cancelled
          setTimeout(check, 200);
        };
        check();
      });
      if (!generateRunning) break; // generation was cancelled
      createGenerateLabel.style.color = '';
    }

    const idx = createScenes.indexOf(scenesToGen[i]);
    const pct = Math.round(((i) / total) * 100);
    createGenerateBar.style.width = pct + '%';
    const isFree = !isPaidTier();
    if (isFree) {
      createGenerateLabel.textContent = `Generating image ${i + 1} of ${total} (free tier — slower)...`;
    } else {
      createGenerateLabel.textContent = `Generating image ${i + 1} of ${total}...`;
    }
    await generateSceneImage(idx);
    // Free tier: 2 IPM limit — wait 30s between images
    if (isFree && i < total - 1) {
      for (let wait = 30; wait > 0; wait--) {
        createGenerateLabel.textContent = `Image ${i + 1} done. Next in ${wait}s (free tier: 2 images/min)...`;
        await new Promise(r => setTimeout(r, 1000));
        if (!generateRunning) break;
      }
    }
  }

  generateRunning = false;
  btnCreatePause.style.display = 'none';
  createGenerateBar.style.width = '100%';
  const doneCount = createScenes.filter(s => s.status === 'done').length;
  const failedCount = createScenes.filter(s => s.status === 'error').length;
  const pendingCount = createScenes.filter(s => s.status === 'pending').length;

  if (failedCount > 0 || pendingCount > 0) {
    const issues = [];
    if (failedCount > 0) issues.push(`${failedCount} failed`);
    if (pendingCount > 0) issues.push(`${pendingCount} pending`);
    createGenerateLabel.textContent = `${doneCount}/${createScenes.length} generated, ${issues.join(', ')}.`;
    createGenerateLabel.style.color = '#f59e0b';
    btnCreateRetryFailed.style.display = '';
    btnCreateRetryFailed.textContent = `🔄 Retry ${failedCount + pendingCount} Remaining`;
  } else {
    createGenerateLabel.textContent = `Done! All ${doneCount} images generated.`;
    setTimeout(() => createGenerateProgress.classList.remove('visible'), 3000);
  }
  btnCreateGenerate.disabled = false;
  updateCreateButtons();
  updateStepStates();
}

btnCreatePause.addEventListener('click', () => {
  if (!generateRunning) return;
  generatePaused = !generatePaused;
  if (generatePaused) {
    btnCreatePause.textContent = '▶ Resume';
  } else {
    btnCreatePause.textContent = '⏸ Pause';
  }
});

btnCreateGenerate.addEventListener('click', async () => {
  if (!createScenes || createScenes.length === 0) return;
  await runImageGeneration([...createScenes]);
});

btnCreateRetryFailed.addEventListener('click', async () => {
  const remaining = createScenes.filter(s => s.status === 'error' || s.status === 'pending');
  if (remaining.length === 0) return;
  await runImageGeneration(remaining);
});

// ── Multi-Language Voiceover ──
const SUPPORTED_LANGUAGES = [
  { code: 'ta', name: 'Tamil', flag: '🇮🇳', gcloudVoice: 'ta-IN-Standard-A', gcloudLang: 'ta-IN' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳', gcloudVoice: 'hi-IN-Standard-A', gcloudLang: 'hi-IN' },
  { code: 'te', name: 'Telugu', flag: '🇮🇳', gcloudVoice: 'te-IN-Standard-A', gcloudLang: 'te-IN' },
  { code: 'ml', name: 'Malayalam', flag: '🇮🇳', gcloudVoice: 'ml-IN-Standard-A', gcloudLang: 'ml-IN' },
  { code: 'en', name: 'English', flag: '🇺🇸', gcloudVoice: 'en-US-Standard-D', gcloudLang: 'en-US' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', gcloudVoice: 'es-ES-Standard-A', gcloudLang: 'es-ES' },
  { code: 'fr', name: 'French', flag: '🇫🇷', gcloudVoice: 'fr-FR-Standard-A', gcloudLang: 'fr-FR' },
];

let languageTracks = []; // [{lang, langCode, audioBuffer, translatedText, status}]

const createLanguageStep = $('create-language-step');
const languageCheckboxes = $('language-checkboxes');
const btnGenerateLanguages = $('btn-generate-languages');
const languageStatus = $('language-status');
const languageResults = $('language-results');

// Populate language checkboxes
for (const lang of SUPPORTED_LANGUAGES) {
  const label = document.createElement('label');
  label.style.cssText = 'font-size:0.75rem; display:flex; align-items:center; gap:4px; cursor:pointer; padding:4px 10px; background:var(--bg-elevated); border:1px solid var(--border); border-radius:6px;';
  label.innerHTML = `<input type="checkbox" id="lang-check-${lang.code}"> ${lang.flag} ${lang.name}`;
  label.querySelector('input').addEventListener('change', () => {
    const anyChecked = SUPPORTED_LANGUAGES.some(l => {
      const cb = $(`lang-check-${l.code}`);
      return cb && cb.checked;
    });
    btnGenerateLanguages.disabled = !anyChecked;
  });
  languageCheckboxes.appendChild(label);
}

async function translateText(text, targetLang, apiKey) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Translate the following text to ${targetLang}. Return ONLY the translated text, nothing else.\n\n${text}` }] }],
        generationConfig: { temperature: 0.3 }
      })
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Translation error ${resp.status}`);
  }
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Audio player state for language cards
let langPlayerSource = null;
let langPlayerPlaying = false;

function stopLangPlayer() {
  if (langPlayerSource) {
    try { langPlayerSource.stop(); } catch(e) {}
    langPlayerSource = null;
  }
  langPlayerPlaying = false;
  // Reset all play buttons
  document.querySelectorAll('.lang-play-btn').forEach(b => b.textContent = '▶');
}

function playLangAudio(buffer, playBtn) {
  stopLangPlayer();
  langPlayerSource = audioCtx.createBufferSource();
  langPlayerSource.buffer = buffer;
  langPlayerSource.connect(audioCtx.destination);
  langPlayerSource.start();
  langPlayerPlaying = true;
  playBtn.textContent = '⏸';
  langPlayerSource.onended = () => {
    langPlayerPlaying = false;
    playBtn.textContent = '▶';
    langPlayerSource = null;
  };
}

function buildAudioControls(id) {
  return `<div class="lang-controls" style="display:flex; gap:3px;">
    <button class="lang-play-btn" data-player="${id}" style="font-size:0.7rem; padding:2px 6px; cursor:pointer; background:var(--bg-input); border:1px solid var(--border); border-radius:3px; color:var(--text-primary);">▶</button>
    <button class="lang-stop-btn" data-player="${id}" style="font-size:0.7rem; padding:2px 6px; cursor:pointer; background:var(--bg-input); border:1px solid var(--border); border-radius:3px; color:var(--text-primary);">⏹</button>
  </div>`;
}

function buildSubtitleSelect(langCode, langName) {
  // Build options: Original + all supported languages + None (no duplicates)
  const seen = new Set();
  let options = '<option value="none" selected>None</option>';
  options += '<option value="original">Original</option>';
  seen.add('original');
  seen.add('none');
  // Add all supported languages
  for (const lang of SUPPORTED_LANGUAGES) {
    if (!seen.has(lang.code)) {
      options += `<option value="${lang.code}">${lang.name}</option>`;
      seen.add(lang.code);
    }
  }
  return `<label style="font-size:0.65rem; color:var(--text-muted); display:flex; align-items:center; gap:3px;">
    Sub:
    <select class="lang-sub-select" data-lang="${langCode}" style="font-size:0.65rem; padding:2px 4px; background:var(--bg-input); border:1px solid var(--border); border-radius:3px; color:var(--text-primary);">
      ${options}
    </select>
  </label>`;
}

// Generate subtitles for a specific audio track based on selected subtitle language
// Stores in createGeneratedSubtitles map: langCode → subtitleItems array
let createGeneratedSubtitles = new Map();
let langGenerating = false; // true during language/subtitle generation // langCode → [{text, startTime, duration, ...}]

async function generateSubtitlesForTrack(trackId, subtitleLang) {
  if (subtitleLang === 'none') {
    createGeneratedSubtitles.delete(trackId);
    updateSubtitlePreviewCount();
    return;
  }

  if (!createScenes) return;

  langGenerating = true;
  updateCreateButtons();

  let sceneTexts;
  if (subtitleLang === 'original') {
    // Use original transcript directly
    sceneTexts = createScenes.map(s => s.text);
  } else {
    // Check if we have translated text from a language track
    const track = languageTracks.find(t => t.langCode === subtitleLang);
    if (track && track.translatedText) {
      // Split translated text proportionally across scenes
      const origWords = createScenes.reduce((sum, s) => sum + (s.text || '').split(/\s+/).length, 0);
      const transWords = track.translatedText.split(/\s+/);
      let wordIdx = 0;
      sceneTexts = createScenes.map(s => {
        const sceneWordCount = Math.max(1, Math.round(((s.text || '').split(/\s+/).length / Math.max(1, origWords)) * transWords.length));
        const portion = transWords.slice(wordIdx, wordIdx + sceneWordCount).join(' ');
        wordIdx += sceneWordCount;
        return portion;
      });
    } else {
      // No existing translation — need to translate now
      const key = getCreateGeminiKey();
      const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === subtitleLang);
      const langName = langInfo ? langInfo.name : subtitleLang;
      if (key) {
        try {
          const statusEl = $('language-status');
          if (statusEl) { statusEl.textContent = `Translating subtitles to ${langName}...`; statusEl.style.color = ''; }
          const fullText = createScenes.map(s => s.text).filter(Boolean).join('\n\n');
          const translated = await translateText(fullText, langName, key);
          const origWords = createScenes.reduce((sum, s) => sum + (s.text || '').split(/\s+/).length, 0);
          const transWords = translated.split(/\s+/);
          let wordIdx = 0;
          sceneTexts = createScenes.map(s => {
            const sceneWordCount = Math.max(1, Math.round(((s.text || '').split(/\s+/).length / Math.max(1, origWords)) * transWords.length));
            const portion = transWords.slice(wordIdx, wordIdx + sceneWordCount).join(' ');
            wordIdx += sceneWordCount;
            return portion;
          });
        } catch(e) {
          console.warn('Subtitle translation error:', e);
          sceneTexts = createScenes.map(s => s.text); // fallback to original
        }
      } else {
        sceneTexts = createScenes.map(s => s.text);
      }
    }
  }

  const subs = [];
  let subId = 1;
  for (let i = 0; i < createScenes.length; i++) {
    const scene = createScenes[i];
    const text = sceneTexts[i];
    if (!text || text.trim() === '' || text === '[continued]') continue;
    const sentences = text.split(/(?<=[.!?।])\s+/).filter(s => s.trim().length > 0);
    if (sentences.length <= 1) {
      subs.push({ id: subId++, text: text.trim(), startTime: scene.startTime, duration: scene.duration });
    } else {
      const chunks = [];
      for (let j = 0; j < sentences.length; j += 2) {
        chunks.push(sentences.slice(j, j + 2).join(' '));
      }
      const chunkDur = scene.duration / chunks.length;
      for (let j = 0; j < chunks.length; j++) {
        subs.push({ id: subId++, text: chunks[j].trim(), startTime: scene.startTime + j * chunkDur, duration: chunkDur });
      }
    }
  }
  createGeneratedSubtitles.set(trackId, subs);
  langGenerating = false;
  updateCreateButtons();
  updateSubtitlePreviewCount();
}

function updateSubtitlePreviewCount() {
  let total = 0;
  for (const [, subs] of createGeneratedSubtitles) total += subs.length;
  const statusEl = $('language-status');
  if (statusEl) {
    const doneCount = languageTracks.filter(t => t.status === 'done').length;
    if (total > 0) {
      const trackCount = createGeneratedSubtitles.size;
      statusEl.textContent = `${doneCount} voice(s) · ${total} subtitles ready (${trackCount} track${trackCount > 1 ? 's' : ''})`;
      statusEl.style.color = '#10b981';
    } else if (doneCount > 0) {
      statusEl.textContent = `${doneCount} voice(s) ready · No subtitles selected`;
      statusEl.style.color = '';
    }
  }
}

function renderPrimaryAudioCard() {
  const container = $('language-primary');
  if (!container || !createAudioBuffer) return;
  const label = createInputMode === 'text' ? 'English (Generated TTS)' : 'Original Audio';
  const flag = createInputMode === 'text' ? '🇺🇸' : '🎙️';
  container.innerHTML = `
    <div class="language-card done">
      <span class="lang-name">${flag} ${label}</span>
      <span class="lang-status">Primary · ${fmtShort(createAudioBuffer.duration)}</span>
      ${buildSubtitleSelect('original', 'Original')}
      ${buildAudioControls('primary')}
    </div>
  `;
  container.querySelector('.lang-play-btn').addEventListener('click', (e) => {
    if (langPlayerPlaying && langPlayerSource) { stopLangPlayer(); return; }
    playLangAudio(createAudioBuffer, e.target);
  });
  container.querySelector('.lang-stop-btn').addEventListener('click', stopLangPlayer);
  const subSelect = container.querySelector('.lang-sub-select');
  if (subSelect) {
    subSelect.addEventListener('change', () => {
      generateSubtitlesForTrack('primary', subSelect.value);
    });
  }
}

function renderLanguageCard(lang, status, detail) {
  let card = $(`lang-card-${lang.code}`);
  if (!card) {
    card = document.createElement('div');
    card.className = 'language-card';
    card.id = `lang-card-${lang.code}`;
    languageResults.appendChild(card);
  }
  card.className = `language-card ${status === 'done' ? 'done' : status === 'error' ? 'error' : ''}`;
  const track = languageTracks.find(t => t.langCode === lang.code);
  const controls = (status === 'done' && track) ? buildAudioControls(lang.code) : '';
  const subSelect = (status === 'done') ? buildSubtitleSelect(lang.code, lang.name) : '';
  card.innerHTML = `
    <span class="lang-name">${lang.flag} ${lang.name}</span>
    <span class="lang-status">${detail || status}</span>
    ${subSelect}
    ${controls}
  `;
  if (status === 'done' && track) {
    card.querySelector('.lang-play-btn').addEventListener('click', (e) => {
      if (langPlayerPlaying && langPlayerSource) { stopLangPlayer(); return; }
      playLangAudio(track.audioBuffer, e.target);
    });
    card.querySelector('.lang-stop-btn').addEventListener('click', stopLangPlayer);
    const subEl = card.querySelector('.lang-sub-select');
    if (subEl) {
      subEl.value = track.subtitleLang || 'none';
      subEl.addEventListener('change', () => {
        track.subtitleLang = subEl.value;
        generateSubtitlesForTrack(lang.code, subEl.value);
      });
    }
  }
}

btnGenerateLanguages.addEventListener('click', async () => {
  const key = getCreateGeminiKey();
  if (!key) { languageStatus.textContent = 'Enter Gemini API key first'; return; }
  if (!createScenes || createScenes.length === 0) return;

  const selectedLangs = SUPPORTED_LANGUAGES.filter(l => {
    const cb = $(`lang-check-${l.code}`);
    return cb && cb.checked;
  });
  if (selectedLangs.length === 0) return;

  btnGenerateLanguages.disabled = true;
  langGenerating = true;
  updateCreateButtons();
  const fullText = createScenes.map(s => s.text).filter(Boolean).join('\n\n');

  for (const lang of selectedLangs) {
    try {
      renderLanguageCard(lang, 'working', 'Translating...');
      const translated = await translateText(fullText, lang.name, key);

      renderLanguageCard(lang, 'working', 'Generating voice...');
      let audioBuffer;
      try {
        // Try full text first
        const ttsResult = await generateTTSGemini(translated, 'Kore', key);
        ({ audioBuffer } = await decodeBase64Audio(ttsResult.base64, ttsResult.mimeType));
      } catch(ttsErr) {
        // Full text failed — chunk by ~3 min segments based on sentence boundaries
        renderLanguageCard(lang, 'working', 'Text too long — generating in chunks...');
        const sentences = translated.split(/(?<=[.!?।।])\s+/).filter(s => s.trim());
        // Estimate ~3 min of speech per chunk (~2500 bytes for multibyte, ~3500 for latin)
        const isMultibyte = /[\u0900-\u0DFF\u0B80-\u0BFF]/.test(translated); // Hindi, Tamil, Telugu, etc.
        const maxChunkBytes = isMultibyte ? 2500 : 3500;
        const chunks = [];
        let current = '';
        for (const sentence of sentences) {
          const test = current ? current + ' ' + sentence : sentence;
          if (new Blob([test]).size > maxChunkBytes && current) {
            chunks.push(current);
            current = sentence;
          } else {
            current = test;
          }
        }
        if (current) chunks.push(current);

        const chunkBuffers = [];
        for (let c = 0; c < chunks.length; c++) {
          renderLanguageCard(lang, 'working', `Generating chunk ${c + 1}/${chunks.length}...`);
          const chunkResult = await generateTTSGemini(chunks[c], 'Kore', key);
          const { audioBuffer: chunkBuf } = await decodeBase64Audio(chunkResult.base64, chunkResult.mimeType);
          chunkBuffers.push(chunkBuf);
        }

        // Concatenate audio buffers
        const totalLength = chunkBuffers.reduce((sum, b) => sum + b.length, 0);
        const sampleRate = chunkBuffers[0].sampleRate;
        const channels = chunkBuffers[0].numberOfChannels;
        const merged = audioCtx.createBuffer(channels, totalLength, sampleRate);
        let offset = 0;
        for (const buf of chunkBuffers) {
          for (let ch = 0; ch < channels; ch++) {
            merged.getChannelData(ch).set(buf.getChannelData(ch), offset);
          }
          offset += buf.length;
        }
        audioBuffer = merged;
      }

      // Match duration to original audio by resampling
      const targetDur = createAudioBuffer ? createAudioBuffer.duration : audioBuffer.duration;
      if (Math.abs(audioBuffer.duration - targetDur) > 1) {
        renderLanguageCard(lang, 'working', 'Matching duration...');
        const rate = audioBuffer.duration / targetDur;
        const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, Math.round(targetDur * audioBuffer.sampleRate), audioBuffer.sampleRate);
        const src = offlineCtx.createBufferSource();
        src.buffer = audioBuffer;
        src.playbackRate.value = rate;
        src.connect(offlineCtx.destination);
        src.start();
        audioBuffer = await offlineCtx.startRendering();
      }

      // Remove existing track for this language if re-generating
      languageTracks = languageTracks.filter(t => t.langCode !== lang.code);
      languageTracks.push({
        lang: lang.name,
        langCode: lang.code,
        audioBuffer,
        translatedText: translated,
        subtitleLang: 'none', // default: no subtitle
        status: 'done'
      });
      renderLanguageCard(lang, 'done', `Done (${fmtShort(audioBuffer.duration)})`);
    } catch(e) {
      renderLanguageCard(lang, 'error', friendlyApiError(e.message));
      console.error(`Language ${lang.name} error:`, e);
    }
  }

  btnGenerateLanguages.disabled = false;
  langGenerating = false;
  updateCreateButtons();
  const doneTracks = languageTracks.filter(t => t.status === 'done');
  languageStatus.textContent = `${doneTracks.length} language track(s) ready — will be available in the editor`;
});

// Send to Editor
btnCreateSendEditor.addEventListener('click', async () => {
  if (!createAudioBuffer || !createScenes) return;

  // Validate: count scenes with images (#5 + #14)
  const withImages = createScenes.filter(s => s.imgDataUrl).length;
  const totalScenes = createScenes.length;
  const failedScenes = createScenes.filter(s => s.status === 'error').length;
  const pendingScenes = createScenes.filter(s => s.status === 'pending').length;

  if (withImages === 0) {
    alert('No images generated yet. Generate at least one image before sending to editor.');
    return;
  }

  if (withImages < totalScenes) {
    let msg = `Sending ${withImages} of ${totalScenes} scenes to editor.`;
    if (failedScenes > 0) msg += `\n${failedScenes} scene(s) failed — you can retry them.`;
    if (pendingScenes > 0) msg += `\n${pendingScenes} scene(s) not yet generated.`;
    msg += '\n\nScenes without images will be skipped. Continue?';
    if (!confirm(msg)) return;
  }

  // Reset editor state
  currentBuffer = createAudioBuffer;
  photoItems = [];
  textItems = [];
  blockElements.clear();
  textBlockElements.clear();
  timelineContainer.querySelectorAll('.photo-block').forEach(el => el.remove());
  textTimelineContainer.querySelectorAll('.text-block').forEach(el => el.remove());
  undoStack = [];
  nextPhotoId = 1;
  nextTextId = 1;
  selectedPhotoIds.clear();
  selectedTextIds.clear();

  // Add generated images to photo timeline
  for (const scene of createScenes) {
    if (!scene.imgDataUrl) continue;
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = scene.imgDataUrl;
    });
    photoItems.push({
      id: nextPhotoId++,
      imgSrc: scene.imgDataUrl,
      imgEl: img,
      startTime: scene.startTime,
      duration: scene.duration,
      transition: 'fade',
      transDur: 0.5,
      motion: 'ken-burns',
    });
  }

  // Transfer pre-generated subtitles from Step 8 selections
  subtitleItems = [];
  nextSubtitleId = 1;
  subBlockElements.clear();
  subTimelineContainer.querySelectorAll('.sub-block').forEach(el => el.remove());
  const { width: subW } = getSelectedImageSize();
  const maxSubWidth = Math.round(subW * 0.85);
  // Use primary track subtitles first, then add language track subtitles
  const primarySubs = createGeneratedSubtitles.get('primary');
  if (primarySubs) {
    for (const sub of primarySubs) {
      subtitleItems.push({
        id: nextSubtitleId++, text: sub.text,
        font: "'Noto Sans Tamil', sans-serif",
        fontSize: 32, color: '#ffffff',
        strokeColor: '#000000', strokeWidth: 2,
        bgColor: '#000000', bgAlpha: 0.5, bold: true,
        position: 'bot-center',
        startTime: sub.startTime, duration: sub.duration,
        animation: 'fade', animDur: 0.3,
        _maxWidth: maxSubWidth,
      });
    }
  }

  // Transfer PiP video to editor
  if (createPipVideoEl) {
    pipItems = [{
      id: nextPipId++,
      videoEl: createPipVideoEl,
      videoSrc: createPipVideoSrc,
      videoDuration: createPipVideoEl.duration,
      inPoint: 0, outPoint: currentBuffer.duration,
      position: 'bot-right', customX: null, customY: null,
      size: pipSize, shape: pipShape,
      border: pipBorder, borderColor: pipBorderColor,
      shadow: pipShadow,
      name: 'Speaker',
    }];
    const pipSec = $('pip-section');
    if (pipSec) pipSec.style.display = '';
    if (typeof renderPipList === 'function') renderPipList();
    // Add podcast video to video timeline track
    const thumbC = document.createElement('canvas');
    thumbC.width = 160; thumbC.height = 90;
    thumbC.getContext('2d').drawImage(createPipVideoEl, 0, 0, 160, 90);
    const vtThumb = thumbC.toDataURL('image/jpeg', 0.6);
    const vtImg = new Image(); vtImg.src = vtThumb;
    videoTimelineItems = [{
      id: nextVideoTimelineId++,
      videoEl: createPipVideoEl,
      videoSrc: createPipVideoSrc,
      videoDuration: createPipVideoEl.duration,
      inPoint: 0, outPoint: createPipVideoEl.duration,
      startTime: 0, duration: currentBuffer.duration,
      imgSrc: vtThumb, imgEl: vtImg,
    }];
    if (typeof renderVideoTimeline === 'function') renderVideoTimeline();
    const bgVidMode = $('bg-video-mode');
    if (bgVidMode) bgVidMode.value = bgVideoMode;
  } else {
    pipItems = [];
    videoTimelineItems = [];
    const pipSec = $('pip-section');
    if (pipSec) pipSec.style.display = 'none';
    if (typeof renderVideoTimeline === 'function') renderVideoTimeline();
  }

  // Transfer language tracks to editor
  editorOriginalBuffer = currentBuffer;
  editorOriginalSubtitles = subtitleItems.map(t => ({ ...t }));
  editorCurrentLang = 'original';
  editorLanguageTracks = languageTracks.filter(t => t.status === 'done').map(t => ({
    lang: t.lang,
    langCode: t.langCode,
    audioBuffer: t.audioBuffer,
    translatedText: t.translatedText,
    subtitleLang: t.subtitleLang || 'original',
  }));
  // Build per-language subtitle texts (split translated text proportionally across scenes)
  for (const track of editorLanguageTracks) {
    const origWords = createScenes.reduce((sum, s) => sum + (s.text || '').split(/\s+/).length, 0);
    const transWords = track.translatedText.split(/\s+/);
    let wordIdx = 0;
    track.subtitleTexts = createScenes.map(s => {
      if (!s.text || s.text.trim() === '') return '';
      const sceneWordCount = Math.max(1, Math.round(((s.text || '').split(/\s+/).length / Math.max(1, origWords)) * transWords.length));
      const portion = transWords.slice(wordIdx, wordIdx + sceneWordCount).join(' ');
      wordIdx += sceneWordCount;
      return portion;
    });
  }
  setupEditorLanguageSelector();

  // Navigate to editor
  cameFromCreate = true;
  btnBackToCreate.style.display = '';
  createPage.classList.remove('visible');
  editorEl.classList.add('visible');
  await refreshWaveform();
  updateAudioControls();
  renderPhotos();
  renderTexts();
  renderSubtitles();
  drawRuler();
  const langInfo = editorLanguageTracks.length > 0 ? ` + ${editorLanguageTracks.length} language(s)` : '';
  const subInfo = subtitleItems.length > 0 ? `, ${subtitleItems.length} subtitles` : '';
  setStatus(`Content created: ${fmt(currentBuffer.duration)} audio, ${photoItems.length} photos${subInfo}${langInfo}. Edit and export!`);
  applyEditorPlanGating();
  loadEditorLibrary();
  // Autosave audio and images
  if (currentBuffer) autosaveAudio('main', currentBuffer);
  if (createScenes) createScenes.forEach((s, i) => { if (s.imgDataUrl) autosaveImage(i, s.imgDataUrl); });
  markDirty();
});

// ── Editor language selector ──
function setupEditorLanguageSelector() {
  const selectorDiv = $('editor-lang-selector');
  const selectEl = $('editor-lang-select');
  if (!selectorDiv || !selectEl) return;

  if (editorLanguageTracks.length === 0) {
    selectorDiv.style.display = 'none';
    // Also hide "Export All Languages" button
    const exportAllBtn = $('export-all-langs');
    if (exportAllBtn) exportAllBtn.style.display = 'none';
    return;
  }

  selectorDiv.style.display = '';
  selectEl.innerHTML = '<option value="original">Original</option>';
  for (const t of editorLanguageTracks) {
    const opt = document.createElement('option');
    opt.value = t.langCode;
    opt.textContent = `${t.lang} (${fmtShort(t.audioBuffer.duration)})`;
    selectEl.appendChild(opt);
  }
  selectEl.value = editorCurrentLang;

  // Show "Export All Languages" button
  const exportAllBtn = $('export-all-langs');
  if (exportAllBtn) exportAllBtn.style.display = '';
}

// Language switch handler
const editorLangSelect = $('editor-lang-select');
if (editorLangSelect) {
  editorLangSelect.addEventListener('change', async () => {
    const langCode = editorLangSelect.value;
    editorCurrentLang = langCode;

    if (langCode === 'original') {
      currentBuffer = editorOriginalBuffer;
      subtitleItems = editorOriginalSubtitles.map(t => ({ ...t }));
    } else {
      const track = editorLanguageTracks.find(t => t.langCode === langCode);
      if (!track) return;
      currentBuffer = track.audioBuffer;
      if (track.subtitleTexts && editorOriginalSubtitles.length > 0) {
        subtitleItems = editorOriginalSubtitles.map((t, i) => ({
          ...t,
          id: nextSubtitleId++,
          text: track.subtitleTexts[i] || t.text,
        }));
      }
    }

    // Refresh subtitle timeline
    subBlockElements.clear();
    subTimelineContainer.querySelectorAll('.sub-block').forEach(el => el.remove());
    await refreshWaveform();
    updateAudioControls();
    renderSubtitles();
    drawRuler();
    setStatus(`Switched to ${langCode === 'original' ? 'original' : editorLanguageTracks.find(t => t.langCode === langCode)?.lang} audio`);
  });
}

// Save project from Create page
btnCreateSaveProject.addEventListener('click', async () => {
  // Temporarily build editor state from create data so save works
  const hadBuffer = currentBuffer;
  const hadPhotos = [...photoItems];
  const hadTexts = [...textItems];
  const hadLangTracks = [...editorLanguageTracks];

  currentBuffer = createAudioBuffer;
  photoItems = [];
  textItems = [];
  // Include language tracks in save
  editorLanguageTracks = languageTracks.filter(t => t.status === 'done').map(t => ({
    lang: t.lang, langCode: t.langCode,
    audioBuffer: t.audioBuffer, translatedText: t.translatedText,
    subtitleLang: t.subtitleLang || 'original',
  }));

  // Build photo items from scenes that have images
  if (createScenes) {
    for (const scene of createScenes) {
      if (!scene.imgDataUrl) continue;
      const img = new Image();
      await new Promise(r => { img.onload = r; img.onerror = r; img.src = scene.imgDataUrl; });
      photoItems.push({
        id: nextPhotoId++, imgSrc: scene.imgDataUrl, imgEl: img,
        startTime: scene.startTime, duration: scene.duration,
        transition: 'fade', transDur: 0.5,
      });
    }
  }

  const showMsg = (msg) => { btnCreateSaveEarly.textContent = msg; setTimeout(() => { btnCreateSaveEarly.textContent = '💾 Save Project'; }, 3000); };
  await saveProjectToFile(createAudioBuffer, showMsg);

  // Restore previous editor state if it existed
  currentBuffer = hadBuffer;
  photoItems = hadPhotos;
  textItems = hadTexts;
  editorLanguageTracks = hadLangTracks;
});

// Early save button (in header) — same logic
btnCreateSaveEarly.addEventListener('click', () => btnCreateSaveProject.click());

// Back to Create from Editor — preserves create wizard state
btnBackToCreate.addEventListener('click', () => {
  // Sync editor photo changes back into createScenes by index order
  if (createScenes) {
    const editorPhotos = [...photoItems].sort((a, b) => a.startTime - b.startTime);
    for (let i = 0; i < createScenes.length; i++) {
      const ep = editorPhotos[i];
      if (ep) {
        createScenes[i].imgDataUrl = ep.imgSrc;
        createScenes[i].startTime = ep.startTime;
        createScenes[i].duration = ep.duration;
        createScenes[i].endTime = ep.startTime + ep.duration;
      }
    }
  }

  // Restore language tracks from editor to create flow
  if (editorLanguageTracks.length > 0 && languageTracks.length === 0) {
    languageTracks = editorLanguageTracks.map(t => ({
      lang: t.lang, langCode: t.langCode,
      audioBuffer: t.audioBuffer, translatedText: t.translatedText,
      subtitleLang: t.subtitleLang || 'none',
      status: 'done',
    }));
    // Re-render language cards
    for (const t of languageTracks) {
      const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === t.langCode);
      if (langInfo) renderLanguageCard(langInfo, 'done', `Done (${fmtShort(t.audioBuffer.duration)})`);
    }
  }

  editorEl.classList.remove('visible');
  createPage.classList.add('visible');

  // Restore all completed steps visibility
  if (createAudioBuffer) {
    // Step 2: Show audio name + restore waveform editor
    const audioName = $('create-audio-name');
    if (audioName && !audioName.textContent) audioName.textContent = 'Audio loaded';
    showCreateAudioEditor();
    // Show early save button
    btnCreateSaveEarly.style.display = '';
  }

  if (createTranscript) {
    // Step 3: Show transcript
    const transcriptOut = $('create-transcript-output');
    if (transcriptOut && !transcriptOut.textContent) {
      transcriptOut.textContent = createTranscript;
    }
  }

  if (createScenes && createScenes.length > 0) {
    // Show storyboard (Step 6)
    $('create-storyboard-step').style.display = '';
    renderStoryboard();

    // Show image generation (Step 7)
    $('create-generate-step').style.display = '';
    renderCreateSceneCards();

    // Show chapter step if podcast mode (Step 5)
    if (createInputMode === 'podcast' && createChapters) {
      $('create-chapter-step').style.display = '';
      renderChapterCards();
    }

    // Steps 8 & 9: Only show if images have been generated
    const hasAnyImages = createScenes.some(s => s.imgDataUrl);
    if (hasAnyImages) {
      $('create-language-step').style.display = '';
      renderPrimaryAudioCard();
      $('create-send-step').style.display = '';
    } else {
      $('create-language-step').style.display = 'none';
      $('create-send-step').style.display = 'none';
    }

    // Show retry button if any failed
    const failedCount = createScenes.filter(s => s.status === 'error').length;
    const btnRetry = $('btn-create-retry-failed');
    if (btnRetry) btnRetry.style.display = failedCount > 0 ? '' : 'none';

    updateCreateButtons();
  }
});
