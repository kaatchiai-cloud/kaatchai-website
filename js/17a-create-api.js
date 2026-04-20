// ══════════════════════════════════════════
//  CREATE CONTENT — API, Keys, Templates
// ══════════════════════════════════════════
const createPage = $('create-page');
const btnCreateContent = $('btn-create-content');
const btnCreateBack = $('btn-create-back');
const createApiKeyPaid = $('create-api-key-paid');
const btnSaveKeyPaid = $('btn-save-key-paid');
const keyStatusPaid = $('key-status-paid');
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
const createImageSize = $('create-image-size');
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
  'special': 'Special',
};

// Special styles use individual image generation (Flash 2.5) instead of grid
const SPECIAL_STYLES = ['sketch', 'minimalist', 'flat-design', 'comic'];

const TEMPLATES = [
  { id: 'blank', name: 'Blank', category: 'all', size: '', style: '', textMode: 'no-text', description: 'Fully customisable', gradient: 'linear-gradient(135deg, #2a2a3e, #1a1a2e)' },
  // Story
  { id: 'bedtime-story', name: 'Bedtime Story', category: 'story', size: '1280x720', style: 'watercolor', textMode: 'no-text', description: 'Soft watercolor scenes for children\'s bedtime tales', gradient: 'linear-gradient(135deg, #667eea, #764ba2)' },
  { id: 'fairy-tale', name: 'Fairy Tale', category: 'story', size: '1280x720', style: 'oil-painting', textMode: 'no-text', description: 'Rich oil painting style for classic fairy tales', gradient: 'linear-gradient(135deg, #f093fb, #f5576c)' },
  { id: 'mythology', name: 'Mythology', category: 'story', size: '1280x720', style: 'ukiyo-e', textMode: 'no-text', description: 'Epic woodblock-print style for mythological narratives', gradient: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
  { id: 'horror', name: 'Horror', category: 'story', size: '1280x720', style: 'gothic', textMode: 'no-text', description: 'Dark gothic visuals for horror and thriller stories', gradient: 'linear-gradient(135deg, #0c0c0c, #434343)' },
  { id: 'sci-fi', name: 'Sci-Fi', category: 'story', size: '1280x720', style: '3d-render', textMode: 'no-text', description: 'Futuristic 3D rendered scenes for science fiction', gradient: 'linear-gradient(135deg, #0f2027, #2c5364)' },
  { id: 'romance', name: 'Romance', category: 'story', size: '1280x720', style: 'pastel', textMode: 'no-text', description: 'Soft pastel art for love stories', gradient: 'linear-gradient(135deg, #ee9ca7, #ffdde1)' },
  { id: 'adventure', name: 'Adventure', category: 'special', size: '1280x720', style: 'comic', textMode: 'no-text', description: 'Bold comic book style for action-packed adventures', gradient: 'linear-gradient(135deg, #f7971e, #ffd200)' },
  { id: 'moral-story', name: 'Moral Story', category: 'story', size: '1280x720', style: 'watercolor', textMode: 'no-text', description: 'Gentle watercolor illustrations for moral lessons', gradient: 'linear-gradient(135deg, #a8edea, #fed6e3)' },
  // Education
  { id: 'explainer', name: 'Explainer', category: 'special', size: '1280x720', style: 'sketch', textMode: 'english-only', description: 'Hand-drawn sketch style for explainer videos', gradient: 'linear-gradient(135deg, #5ee7df, #b490ca)' },
  { id: 'science', name: 'Science', category: 'special', size: '1280x720', style: 'minimalist', textMode: 'english-only', description: 'Minimalist diagrams and visuals for science topics', gradient: 'linear-gradient(135deg, #13547a, #80d0c7)' },
  { id: 'history', name: 'History', category: 'education', size: '1280x720', style: 'vintage', textMode: 'no-text', description: 'Vintage retro photography for historical narratives', gradient: 'linear-gradient(135deg, #c79081, #dfa579)' },
  { id: 'geography', name: 'Geography', category: 'education', size: '1280x720', style: 'photorealistic', textMode: 'english-only', description: 'Photorealistic landscapes and maps for geography', gradient: 'linear-gradient(135deg, #11998e, #38ef7d)' },
  { id: 'math-logic', name: 'Math & Logic', category: 'special', size: '1280x720', style: 'flat-design', textMode: 'english-only', description: 'Clean flat design visuals for math and logic concepts', gradient: 'linear-gradient(135deg, #667eea, #764ba2)' },
  { id: 'language', name: 'Language Learning', category: 'special', size: '1280x720', style: 'comic', textMode: 'english-only', description: 'Fun comic style for language learning content', gradient: 'linear-gradient(135deg, #ffecd2, #fcb69f)' },
  // Social Media
  { id: 'youtube-video', name: 'YouTube Video', category: 'social', size: '1280x720', style: 'cinematic', textMode: 'english-only', description: 'Widescreen cinematic style for YouTube videos', gradient: 'linear-gradient(135deg, #ff0000, #cc0000)' },
  { id: 'instagram-post', name: 'Instagram Post', category: 'social', size: '1080x1080', style: 'photorealistic', textMode: 'no-text', description: 'Square format for Instagram feed posts', gradient: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)' },
  { id: 'facebook-post', name: 'Facebook Post', category: 'social', size: '1200x628', style: 'digital-art', textMode: 'english-only', description: 'Landscape digital art for Facebook posts', gradient: 'linear-gradient(135deg, #1877f2, #42b72a)' },
  { id: 'twitter-banner', name: 'Twitter/X Banner', category: 'special', size: '1500x500', style: 'minimalist', textMode: 'english-only', description: 'Wide banner format for Twitter/X headers', gradient: 'linear-gradient(135deg, #1da1f2, #14171a)' },
  // Marketing
  { id: 'product-demo', name: 'Product Demo', category: 'marketing', size: '1280x720', style: '3d-render', textMode: 'english-only', description: '3D rendered product showcase and demo videos', gradient: 'linear-gradient(135deg, #f12711, #f5af19)' },
  { id: 'brand-story', name: 'Brand Story', category: 'special', size: '1280x720', style: 'flat-design', textMode: 'english-only', description: 'Clean flat design visuals for brand narratives', gradient: 'linear-gradient(135deg, #2c3e50, #3498db)' },
  { id: 'testimonial', name: 'Testimonial', category: 'marketing', size: '1280x720', style: 'photorealistic', textMode: 'no-text', description: 'Professional photorealistic backgrounds for testimonials', gradient: 'linear-gradient(135deg, #bdc3c7, #2c3e50)' },
  { id: 'event-promo', name: 'Event Promo', category: 'marketing', size: '1080x1350', style: 'pop-art', textMode: 'english-only', description: 'Bold pop art promos for events and launches', gradient: 'linear-gradient(135deg, #eb3349, #f45c43)' },
  { id: 'real-estate', name: 'Real Estate', category: 'marketing', size: '1280x720', style: 'photorealistic', textMode: 'english-only', description: 'Photorealistic property showcase visuals', gradient: 'linear-gradient(135deg, #56ab2f, #a8e063)' },
  { id: 'food-restaurant', name: 'Food & Restaurant', category: 'marketing', size: '1080x1080', style: 'photorealistic', textMode: 'no-text', description: 'Mouthwatering photorealistic food visuals', gradient: 'linear-gradient(135deg, #f2994a, #f2c94c)' },
  // Podcast
  { id: 'podcast-interview', name: 'Interview', category: 'special', size: '1280x720', style: 'minimalist', textMode: 'no-text', description: 'Clean minimalist backgrounds for interview podcasts with PiP', gradient: 'linear-gradient(135deg, #4b6cb7, #182848)' },
  { id: 'podcast-solo', name: 'Solo Show', category: 'podcast', size: '1280x720', style: 'digital-art', textMode: 'no-text', description: 'Digital art scenes for solo podcast episodes', gradient: 'linear-gradient(135deg, #6a3093, #a044ff)' },
  { id: 'podcast-truecrime', name: 'True Crime', category: 'podcast', size: '1280x720', style: 'noir', textMode: 'no-text', description: 'Film noir visuals for true crime podcasts', gradient: 'linear-gradient(135deg, #1a1a2e, #e94560)' },
  { id: 'podcast-comedy', name: 'Comedy', category: 'podcast', size: '1280x720', style: 'pop-art', textMode: 'no-text', description: 'Bold pop art style for comedy podcasts', gradient: 'linear-gradient(135deg, #f7971e, #ffd200)' },
  { id: 'podcast-news', name: 'News Recap', category: 'podcast', size: '1280x720', style: 'photorealistic', textMode: 'no-text', description: 'Professional photorealistic backdrops for news', gradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' },
  // Kids
  { id: 'nursery-rhyme', name: 'Nursery Rhyme', category: 'kids', size: '1280x720', style: 'watercolor', textMode: 'no-text', description: 'Playful watercolor scenes for nursery rhymes', gradient: 'linear-gradient(135deg, #ff9a9e, #fad0c4)' },
  { id: 'animal-facts', name: 'Animal Facts', category: 'special', size: '1280x720', style: 'comic', textMode: 'english-only', description: 'Colorful comic illustrations of animals', gradient: 'linear-gradient(135deg, #a1c4fd, #c2e9fb)' },
  { id: 'abc-numbers', name: 'ABC & Numbers', category: 'kids', size: '1080x1080', style: 'pixel-art', textMode: 'english-only', description: 'Fun pixel art visuals for alphabet and counting', gradient: 'linear-gradient(135deg, #fbc2eb, #a6c1ee)' },
  { id: 'cartoon-story', name: 'Cartoon Story', category: 'kids', size: '1280x720', style: 'anime', textMode: 'no-text', description: 'Anime-style cartoon visuals for kids\' stories', gradient: 'linear-gradient(135deg, #43e97b, #38f9d7)' },
  // Spiritual
  { id: 'meditation', name: 'Meditation', category: 'spiritual', size: '1280x720', style: 'pastel', textMode: 'no-text', description: 'Serene pastel scenes for meditation and calm', gradient: 'linear-gradient(135deg, #89f7fe, #66a6ff)' },
  { id: 'prayer', name: 'Prayer & Devotional', category: 'spiritual', size: '1280x720', style: 'oil-painting', textMode: 'no-text', description: 'Classical oil painting for devotional content', gradient: 'linear-gradient(135deg, #f6d365, #fda085)' },
  { id: 'scripture', name: 'Scripture', category: 'spiritual', size: '1280x720', style: 'stained-glass', textMode: 'english-only', description: 'Stained glass art for scripture readings', gradient: 'linear-gradient(135deg, #a18cd1, #fbc2eb)' },
  { id: 'mythology-retelling', name: 'Mythology Retelling', category: 'spiritual', size: '1280x720', style: 'ukiyo-e', textMode: 'no-text', description: 'Woodblock-print style for mythological retellings', gradient: 'linear-gradient(135deg, #ff9966, #ff5e62)' },
  // Music
  { id: 'lyric-video', name: 'Lyric Video', category: 'special', size: '1080x1350', style: 'minimalist', textMode: 'english-only', description: 'Minimalist vertical backgrounds for lyric videos', gradient: 'linear-gradient(135deg, #e1eec3, #f05053)' },
  { id: 'album-visualizer', name: 'Album Visualizer', category: 'music', size: '1280x720', style: 'surrealism', textMode: 'no-text', description: 'Surrealist abstract art for music visualization', gradient: 'linear-gradient(135deg, #7f00ff, #e100ff)' },
  { id: 'music-story', name: 'Music Story', category: 'music', size: '1280x720', style: 'anime', textMode: 'no-text', description: 'Anime-style narrative visuals for music stories', gradient: 'linear-gradient(135deg, #fc5c7d, #6a82fb)' },
];

function renderTemplateGrid(category = 'all') {
  const grid = $('template-grid');
  if (!grid) return;
  const filtered = category === 'all'
    ? TEMPLATES
    : TEMPLATES.filter(t => t.category === category || t.id === 'blank');
  grid.innerHTML = filtered.map(t => `
    <div class="template-card${selectedTemplate === t.id ? ' selected' : ''}" data-tpl="${t.id}" style="background:${t.gradient};">
      <div class="template-card-name">${t.name}</div>
      <div class="template-card-desc">${t.description}</div>
    </div>`).join('');
  grid.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => applyTemplate(card.dataset.tpl));
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
  updateCreateButtons();
  updateStepStates();
}

function setTemplateCategoryFilter(cat) {
  const btns = document.querySelectorAll('.tpl-cat-btn');
  btns.forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  renderTemplateGrid(cat);
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

function getApiKey() { return localStorage.getItem('stori_key_paid') || localStorage.getItem('stori_key_free') || (createApiKeyPaid ? createApiKeyPaid.value.trim() : ''); }
function getCreateGeminiKey() { return getApiKey(); }
function getImageKey() { return getApiKey(); }
// Backward compat stubs
function getFreeKey() { return getApiKey(); }
function getPaidKey() { return getApiKey(); }
function isPaidTier() { return true; }

function flashSave(btn, statusEl) {
  statusEl.textContent = '✓ Saved';
  statusEl.style.color = '#10b981';
  btn.style.background = '#10b981';
  btn.style.color = '#fff';
  btn.textContent = '✓ Saved';
  setTimeout(() => { btn.style.background = ''; btn.style.color = ''; btn.textContent = 'Save'; }, 2000);
}

// Navigation
function updateKeyStatusInline() {
  const inlineEl = $('key-status-inline');
  if (!inlineEl) return;
  const key = getApiKey();
  if (key) {
    inlineEl.textContent = '🔑 Key saved';
    inlineEl.style.color = '#10b981';
  } else {
    inlineEl.textContent = '🔑 No key';
    inlineEl.style.color = '';
  }
}

btnCreateContent.addEventListener('click', () => {
  navigateTo('create');
  const savedKey = getApiKey();
  if (savedKey && createApiKeyPaid) { createApiKeyPaid.value = savedKey; }
  updateKeyStatusInline();
  updateCreateButtons();
  updateStepStates();
  initTemplateUI();
  inferCreateAgentStates();
});
btnCreateBack.addEventListener('click', () => {
  navigateTo('home');
  destroyCreateAudioEditor();
});

// Toggle key input expand/collapse
const btnToggleKey = $('btn-toggle-key-input');
if (btnToggleKey) btnToggleKey.addEventListener('click', () => {
  const expand = $('create-key-expand');
  if (expand) {
    const isHidden = expand.style.display === 'none';
    expand.style.display = isHidden ? 'flex' : 'none';
    expand.classList.toggle('hidden', !isHidden);
  }
});

// Save API key
if (btnSaveKeyPaid) btnSaveKeyPaid.addEventListener('click', () => {
  const key = createApiKeyPaid.value.trim();
  if (!key) { keyStatusPaid.textContent = 'Enter a key'; keyStatusPaid.style.color = '#ef4444'; return; }
  localStorage.setItem('stori_key_paid', key);
  flashSave(btnSaveKeyPaid, keyStatusPaid);
  updateKeyStatusInline();
  updateCreateButtons(); updateStepStates();
});

// Output / subtitle language dropdowns
const createOutputLanguageEl = $('create-output-language');
const createSubtitleLanguageEl = $('create-subtitle-language');
if (createOutputLanguageEl) createOutputLanguageEl.addEventListener('change', updateCreateButtons);
// Text input: re-check button when user types (animated text mode)
const createTtsTextEl = $('create-tts-text');
if (createTtsTextEl) createTtsTextEl.addEventListener('input', updateCreateButtons);

// ── Model Selection ──
function getTextModels() { return ['gemini-2.5-flash']; }
function getTranscriptionModels() { return ['gemini-2.5-flash']; }
function getImageModels() { return ['gemini-2.5-flash-image']; }
function getTTSModels() { return ['gemini-2.5-flash-preview-tts']; }
function getSegmentDuration() { return { min: 5, max: 15 }; }

// ── API Call Wrapper with model fallback ──
async function callGeminiAPI(models, body, apiKey) {
  const modelList = Array.isArray(models) ? models : [models];
  const key = apiKey || getCreateGeminiKey();
  if (!key) throw new Error('No API key configured. Enter your Gemini API key in Step 1.');

  for (const model of modelList) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (resp.ok) { trackCost('textGeneration', 1); return await resp.json(); }
      if (resp.status === 429 || resp.status === 403 || resp.status === 503) continue;
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
  const isTextMode = typeof createInputMode !== 'undefined' && createInputMode === 'text';
  const hasInput = isTextMode ? !!($('create-tts-text')?.value?.trim()) : hasAudio;
  const hasTemplate = !!selectedTemplate;
  // Output language required for animated mode or text mode
  const needsOutputLang = createVideoMode === 'animated' || isTextMode;
  const hasOutputLanguage = !needsOutputLang || !!($('create-output-language')?.value);
  btnCreateTranscribe.disabled = !(hasKey && hasInput && hasTemplate && hasOutputLanguage);
  // Update hint text next to launch button
  const hint = $('create-script-launch-hint');
  if (hint) {
    if (createTranscript) hint.textContent = 'Storyboard generated ✅';
    else if (!hasInput) hint.textContent = isTextMode ? 'Enter text to begin' : 'Import audio to begin';
    else if (!hasTemplate) hint.textContent = 'Select a template to begin';
    else if (needsOutputLang && !hasOutputLanguage) hint.textContent = 'Select output language to begin';
    else if (!hasKey) hint.textContent = 'API key required';
    else hint.textContent = 'Ready — launch to generate storyboard & prompts';
  }
  // Update transcribe button label based on input mode
  if (!createTranscript && btnCreateTranscribe.textContent.indexOf('Retry') === -1) {
    btnCreateTranscribe.textContent = '▶ Script, Storyboard & Prompt Agent';
  }
  const hasPendingLangs = typeof pendingLanguages !== 'undefined' && pendingLanguages.size > 0;
  btnCreateSendEditor.disabled = !createScenes || !createScenes.some(s => s.imgDataUrl) || langGenerating || hasPendingLangs;
  // Update cost hints on buttons
  updateCostHints();
}

// ── Video Mode Selection ──
function setCreateVideoMode(mode) {
  createVideoMode = mode;
  const cardIll = $('create-card-illustrated');
  const cardAni = $('create-card-animated');
  if (cardIll) cardIll.classList.toggle('active', mode === 'illustrated');
  if (cardAni) cardAni.classList.toggle('active', mode === 'animated');
  const section = $('create-kling-provider-section');
  if (section) section.style.display = mode === 'animated' ? '' : 'none';
  // Show/hide language dropdowns — animated mode or text input mode
  const langRow = $('create-language-selection-row');
  const isTextInput = typeof createInputMode !== 'undefined' && createInputMode === 'text';
  if (langRow) langRow.style.display = (mode === 'animated' || isTextInput) ? '' : 'none';
  // Reset language selections when switching away from animated (keep for text mode)
  if (mode !== 'animated' && !isTextInput) {
    if ($('create-output-language')) $('create-output-language').value = '';
    if ($('create-subtitle-language')) $('create-subtitle-language').value = '';
    if (typeof createOutputLanguage !== 'undefined') createOutputLanguage = '';
    if (typeof createSubtitleLanguage !== 'undefined') createSubtitleLanguage = '';
  }
  refreshCreateAgentPanel();
  updateCreateButtons();
  // Image launch always goes to BGM (runs in both modes)
  const imgBtn = $('create-launch-image-btn');
  if (imgBtn) imgBtn.textContent = 'Launch BGM Agent →';
  // BGM launch button is mode-dependent
  const bgmBtn = $('create-launch-bgm-btn');
  if (bgmBtn) {
    bgmBtn.textContent = mode === 'animated' ? 'Launch Animation Agent →' : 'Launch Voiceover Agent →';
    bgmBtn.onclick = () => document.getElementById(mode === 'animated' ? 'create-video-step' : 'create-language-step')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const modeBadge = $('create-agent-mode-badge');
  if (modeBadge) modeBadge.textContent = 'Copilot';
}

function setReelVideoMode(mode) {
  reelVideoMode = mode;
  const cardIll = $('reel-card-illustrated');
  const cardAni = $('reel-card-animated');
  if (cardIll) cardIll.classList.toggle('active', mode === 'illustrated');
  if (cardAni) cardAni.classList.toggle('active', mode === 'animated');
  const section = $('reel-kling-provider-section');
  if (section) section.style.display = mode === 'animated' ? '' : 'none';
  refreshReelAgentPanel();
  const modeBadge = $('reel-agent-mode-badge');
  if (modeBadge) modeBadge.textContent = 'Autopilot';
}

function saveKlingKey(lsKey, inputId, btn) {
  const input = $(inputId);
  if (!input || !input.value.trim()) return;
  localStorage.setItem(lsKey, input.value.trim());
  const orig = btn.textContent;
  btn.textContent = '✓ Saved';
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

// Pre-fill Kling key inputs from localStorage on load
(function initKlingKeyInputs() {
  const klingAk = localStorage.getItem('stori_kling_access_key');
  const klingSk = localStorage.getItem('stori_kling_secret_key');
  ['create', 'reel'].forEach(prefix => {
    const ak = $(`${prefix}-kling-ak`);
    const sk = $(`${prefix}-kling-sk`);
    if (ak && klingAk) ak.value = klingAk;
    if (sk && klingSk) sk.value = klingSk;
  });
})();

function updateCostHints() {
  const sceneCount = createScenes ? createScenes.length : 0;
  const pendingCount = createScenes ? createScenes.filter(s => s.status !== 'done').length : 0;
  // Transcribe button
  if (btnCreateTranscribe && !btnCreateTranscribe.disabled) {
    btnCreateTranscribe.title = `Estimated cost: ~$${estimateCost('transcription', 1)}`;
  }
  // Language generate button
  const langBtn = $('btn-generate-languages');
  if (langBtn) {
    const checked = document.querySelectorAll('#language-checkboxes input:checked');
    if (checked.length > 0) {
      langBtn.title = `Estimated cost: ~$${estimateCost('ttsPerLang', checked.length)} (${checked.length} languages)`;
    }
  }
}

function updateCreateCostEstimate() {
  const el = $('create-cost-estimate');
  if (!el) return;
  const n = typeof createScenes !== 'undefined' && createScenes ? createScenes.length : 0;
  if (n === 0) { el.style.display = 'none'; return; }
  let cost = 0, rem = n;
  while (rem > 0) {
    if (rem >= 4) { cost += 0.134; rem -= Math.min(rem, 9); }
    else { cost += rem * 0.039; rem = 0; }
  }
  el.textContent = `Est. image generation: ~$${cost.toFixed(3)} for ${n} scenes`;
  el.style.display = '';
}

// ══════════════════════════════════════════
//  AGENT PANEL — Create Story (Copilot)
// ══════════════════════════════════════════

const CREATE_AGENTS_ILLUSTRATED = [
  { id: 'storyboard',stepId: 'create-transcribe-step', icon: '🎨', label: 'Storyboard & Prompt Agent' },
  // { id: 'reference', stepId: 'create-references-step', icon: '🔗', label: 'Reference Agent' }, // V2
  { id: 'image',     stepId: 'create-generate-step',   icon: '🖼️', label: 'Image Agent' },
  { id: 'bgm',       stepId: 'create-bgm-step',        icon: '🎵', label: 'BGM Agent' },
  { id: 'voiceover', stepId: 'create-language-step',   icon: '🌐', label: 'Voiceover Agent' },
];

const CREATE_AGENTS_ANIMATED = [
  { id: 'storyboard',stepId: 'create-transcribe-step', icon: '🎬', label: 'Cinematography & Prompt Agent' },
  // { id: 'reference', stepId: 'create-references-step', icon: '🔗', label: 'Reference Agent' }, // V2
  { id: 'image',     stepId: 'create-generate-step',   icon: '🖼️', label: 'Image Agent' },
  { id: 'bgm',       stepId: 'create-bgm-step',        icon: '🎵', label: 'BGM Agent' },
  { id: 'animation', stepId: 'create-video-step',      icon: '✨', label: 'Animation Agent' },
  // voiceover removed — language handled at Input step for animated mode
];

// status: 'waiting' | 'running' | 'done' | 'error'
// detail: short summary string shown below the label
const _createAgentState = {};

function updateCreateAgent(id, status, detail = '') {
  const prev = _createAgentState[id]?.status;
  if (!_createAgentState[id]) _createAgentState[id] = { status: 'waiting', detail: '', subtasks: [] };
  _createAgentState[id].status = status;
  _createAgentState[id].detail = detail;
  _renderCreateAgentPanel();
  _syncAgentStepHeader('create', id, status);
  if (status === 'done') {
    _showCreateLaunchRow(id);
    if (prev === 'running') _scrollToCreateStep(id);
  }
}

function _getCreateAgents() {
  return createVideoMode === 'animated' ? CREATE_AGENTS_ANIMATED : CREATE_AGENTS_ILLUSTRATED;
}

function _renderCreateAgentPanel() {
  const list = $('create-agent-list');
  if (!list) return;
  const agents = _getCreateAgents();
  list.innerHTML = agents.map(a => {
    const s = _createAgentState[a.id] || { status: 'waiting', detail: '', subtasks: [] };
    const subtasks = s.subtasks || [];
    let bodyHtml = '';
    if (subtasks.length > 0) {
      bodyHtml = subtasks.map(t => {
        const icon = t.status === 'done' ? '✅' : t.status === 'warn' ? '⚠️' : t.status === 'running' ? '⏳' : t.status === 'error' ? '❌' : '○';
        return `<div class="agent-subtask ${t.status}"><span class="agent-subtask-icon">${icon}</span><span>${t.label}</span></div>`;
      }).join('');
    } else if (s.detail) {
      bodyHtml = `<div class="agent-row-detail">${s.detail}</div>`;
    }
    return `<div class="agent-row${s.status === 'running' ? ' active' : ''}"
      onclick="document.getElementById('${a.stepId}')?.scrollIntoView({behavior:'smooth',block:'start'})">
      <div class="agent-row-top">
        <span class="agent-row-icon">${a.icon}</span>
        <span class="agent-row-label">${a.label}</span>
        <span class="agent-status-dot ${s.status}"></span>
      </div>
      ${bodyHtml}
    </div>`;
  }).join('');
}

function resetCreateAgentTasks(agentId) {
  if (!_createAgentState[agentId]) _createAgentState[agentId] = { status: 'waiting', detail: '', subtasks: [] };
  _createAgentState[agentId].subtasks = [];
}

function updateCreateAgentTask(agentId, taskId, taskStatus, taskLabel) {
  if (!_createAgentState[agentId]) _createAgentState[agentId] = { status: 'running', detail: '', subtasks: [] };
  const tasks = _createAgentState[agentId].subtasks;
  const existing = tasks.find(t => t.id === taskId);
  if (existing) {
    existing.status = taskStatus;
    if (taskLabel !== undefined) existing.label = taskLabel;
  } else {
    tasks.push({ id: taskId, label: taskLabel || taskId, status: taskStatus });
  }
  if (taskStatus === 'error') {
    _createAgentState[agentId].status = 'error';
  } else if (taskStatus === 'running' && _createAgentState[agentId].status !== 'error') {
    _createAgentState[agentId].status = 'running';
  } else if (tasks.length > 0 && tasks.every(t => t.status === 'done' || t.status === 'warn')) {
    _createAgentState[agentId].status = 'done';
    _showCreateLaunchRow(agentId);
    _scrollToCreateStep(agentId);
  }
  _renderCreateAgentPanel();
  _syncAgentStepHeader('create', agentId, _createAgentState[agentId].status);
}

function _syncAgentStepHeader(pipeline, agentId, status) {
  const agents = pipeline === 'create' ? _getCreateAgents() : _getReelAgents();
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;
  const step = $(agent.stepId);
  if (!step) return;
  const badge = step.querySelector('.agent-step-status-badge');
  const labels = { waiting: 'Waiting', running: 'Running…', done: 'Done', error: 'Error' };
  if (badge) {
    badge.className = `agent-step-status-badge ${status}`;
    badge.textContent = labels[status] || status;
  }
  const header = step.querySelector('.agent-step-header');
  if (header) {
    header.classList.remove('waiting', 'running', 'done', 'error');
    header.classList.add(status);
  }
}

function _showCreateLaunchRow(agentId) {
  const row = $(`create-launch-after-${agentId}`);
  if (row) row.classList.add('visible');
}

function _scrollToCreateStep(agentId) {
  const agent = _getCreateAgents().find(a => a.id === agentId);
  if (!agent) return;
  const step = $(agent.stepId);
  if (step) step.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Call when video mode changes to re-render panel with correct agent names
function refreshCreateAgentPanel() {
  Object.keys(_createAgentState).forEach(k => delete _createAgentState[k]);
  _renderCreateAgentPanel();
  // update storyboard step header name based on mode
  const storyboardHeader = document.querySelector('#create-transcribe-step .agent-step-name');
  if (storyboardHeader) {
    storyboardHeader.textContent = 'Script & Scenes';
  }
  const storyboardIcon = document.querySelector('#create-transcribe-step .agent-step-icon');
  if (storyboardIcon) storyboardIcon.textContent = '2';
}

// ══════════════════════════════════════════
//  AGENT PANEL — Create Reel (Autopilot)
// ══════════════════════════════════════════

// Aurora SVG icons (from Kaatchi reference)
const REEL_AGENT_ICONS = {
  mic:    '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="5" y="1.5" width="4" height="7" rx="2"/><path d="M3 7a4 4 0 0 0 8 0M7 11v1.5M5 12.5h4"/></svg>',
  layers: '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M7 1 L13 4 L7 7 L1 4 Z"/><path d="M1 7 L7 10 L13 7"/><path d="M1 10 L7 13 L13 10"/></svg>',
  film:   '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1.5" y="2" width="11" height="10" rx="1"/><path d="M4 2v10M10 2v10M1.5 5h2.5M10 5h2.5M1.5 9h2.5M10 9h2.5"/></svg>',
  sparkle:'<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1l1.5 4L12.5 6.5 8.5 8 7 12 5.5 8 1.5 6.5 5.5 5 7 1z" fill="currentColor"/></svg>',
  wave:   '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1 7 L3 4 L5 10 L7 3 L9 11 L11 5 L13 7"/></svg>',
  eye:    '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M1 7s2.5-4.5 6-4.5S13 7 13 7s-2.5 4.5-6 4.5S1 7 1 7z"/><circle cx="7" cy="7" r="1.7"/></svg>'
};

const REEL_AGENTS_ILLUSTRATED = [
  { id: 'script',   stepId: 'reel-step-input',    iconSvg: REEL_AGENT_ICONS.mic,    icon: '🎙️', label: 'Script Agent' },
  { id: 'scene',    stepId: 'reel-step-presets',  iconSvg: REEL_AGENT_ICONS.layers, icon: '🎨', label: 'Storyboard Agent' },
  { id: 'image',    stepId: 'reel-step-scenes',   iconSvg: REEL_AGENT_ICONS.film,   icon: '🖼️', label: 'Image Agent' },
  { id: 'bgm',      stepId: 'reel-step-bgm',      iconSvg: REEL_AGENT_ICONS.wave,   icon: '🎵', label: 'BGM Agent' },
  { id: 'preview',  stepId: 'reel-step-editor',   iconSvg: REEL_AGENT_ICONS.eye,    icon: '▶️', label: 'Preview Agent' },
];

const REEL_AGENTS_ANIMATED = [
  { id: 'script',    stepId: 'reel-step-input',    iconSvg: REEL_AGENT_ICONS.mic,     icon: '🎙️', label: 'Script Agent' },
  { id: 'scene',     stepId: 'reel-step-presets',  iconSvg: REEL_AGENT_ICONS.layers,  icon: '🎬', label: 'Cinematography Agent' },
  { id: 'image',     stepId: 'reel-step-scenes',   iconSvg: REEL_AGENT_ICONS.film,    icon: '🖼️', label: 'Image Agent' },
  { id: 'animation', stepId: 'reel-step-scenes',   iconSvg: REEL_AGENT_ICONS.sparkle, icon: '✨', label: 'Animation Agent' },
  { id: 'bgm',       stepId: 'reel-step-bgm',      iconSvg: REEL_AGENT_ICONS.wave,    icon: '🎵', label: 'BGM Agent' },
  { id: 'preview',   stepId: 'reel-step-editor',   iconSvg: REEL_AGENT_ICONS.eye,     icon: '▶️', label: 'Preview Agent' },
];

// Aurora preset-card selection — stores chosen theme preset in a global
// and updates card selected state. Pure visual binding; the value can be
// consumed by generation logic in future passes.
var reelActivePreset = 'blank';
function selectReelPreset(cardEl, preset) {
  reelActivePreset = preset;
  const grid = document.getElementById('reel-preset-grid');
  if (grid) grid.querySelectorAll('.reel-preset-card').forEach(c => c.classList.remove('selected'));
  if (cardEl) cardEl.classList.add('selected');
}

// Render the faux BGM waveform (140 magenta bars) — deterministic per reference
function renderReelBgmFauxWave() {
  const host = document.getElementById('reel-bgm-faux-wave');
  if (!host || host.dataset.rendered === '1') return;
  const BARS = 140;
  const parts = [];
  for (let i = 0; i < BARS; i++) {
    const h = Math.min(40, 6 + (Math.sin(i * 0.3) * 0.5 + 0.5) * 28 + (i * 11) % 8);
    const opacity = 0.5 + (i % 5) / 10;
    parts.push(`<span class="reel-bgm-wave-bar" style="height:${h}px;opacity:${opacity.toFixed(2)};"></span>`);
  }
  host.innerHTML = parts.join('');
  host.dataset.rendered = '1';
}

// Aurora dual-slider wiring — keeps thumb + fill in sync with the hidden <input type=range>
function wireReelVolSlider(inputId, labelId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const track = input.closest('.reel-vol-slider-track');
  if (!track) return;
  const fill = track.querySelector('.reel-vol-slider-fill');
  const thumb = track.querySelector('.reel-vol-slider-thumb');
  const label = document.getElementById(labelId);
  const sync = () => {
    const v = input.value;
    if (fill) fill.style.width = v + '%';
    if (thumb) thumb.style.left = v + '%';
    if (label) label.textContent = v + '%';
  };
  input.addEventListener('input', sync);
  sync();
}

// Bootstrap all Aurora preview affordances once the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  renderReelBgmFauxWave();
  wireReelVolSlider('reel-bgm-volume-slider', 'reel-bgm-vol-label');
  wireReelVolSlider('reel-voice-volume-slider', 'reel-voice-vol-label');
});

const _reelAgentState = {};

function updateReelAgent(id, status, detail = '') {
  if (!_reelAgentState[id]) _reelAgentState[id] = { status: 'waiting', detail: '', subtasks: [] };
  _reelAgentState[id].status = status;
  _reelAgentState[id].detail = detail;
  _renderReelAgentPanel();
  _syncAgentStepHeader('reel', id, status);
}

function resetReelAgentTasks(agentId) {
  if (!_reelAgentState[agentId]) _reelAgentState[agentId] = { status: 'waiting', detail: '', subtasks: [] };
  _reelAgentState[agentId].subtasks = [];
}

function updateReelAgentTask(agentId, taskId, taskStatus, taskLabel) {
  if (!_reelAgentState[agentId]) _reelAgentState[agentId] = { status: 'running', detail: '', subtasks: [] };
  const tasks = _reelAgentState[agentId].subtasks;
  const existing = tasks.find(t => t.id === taskId);
  if (existing) {
    existing.status = taskStatus;
    if (taskLabel !== undefined) existing.label = taskLabel;
  } else {
    tasks.push({ id: taskId, label: taskLabel || taskId, status: taskStatus });
  }
  if (taskStatus === 'error') {
    _reelAgentState[agentId].status = 'error';
  } else if (taskStatus === 'running' && _reelAgentState[agentId].status !== 'error') {
    _reelAgentState[agentId].status = 'running';
  } else if (tasks.length > 0 && tasks.every(t => t.status === 'done' || t.status === 'warn')) {
    _reelAgentState[agentId].status = 'done';
  }
  _renderReelAgentPanel();
  _syncAgentStepHeader('reel', agentId, _reelAgentState[agentId].status);
}

function _getReelAgents() {
  return reelVideoMode === 'animated' ? REEL_AGENTS_ANIMATED : REEL_AGENTS_ILLUSTRATED;
}

function _renderReelAgentPanel() {
  const list = $('reel-agent-list');
  if (!list) return;
  const agents = _getReelAgents();
  list.innerHTML = agents.map(a => {
    const s = _reelAgentState[a.id] || { status: 'waiting', detail: '', subtasks: [] };
    const subtasks = s.subtasks || [];
    // Render subtasks whenever they exist (not only when live) — matches Aurora reference behaviour
    let bodyHtml = '';
    if (subtasks.length > 0) {
      bodyHtml = subtasks.map(t => {
        const icon = t.status === 'done' ? '✓' : t.status === 'warn' ? '!' : t.status === 'error' ? '×' : '';
        return `<div class="agent-subtask ${t.status}"><span class="agent-subtask-icon">${icon}</span><span>${t.label}</span></div>`;
      }).join('');
    } else if ((s.status === 'running' || s.status === 'error') && s.detail) {
      bodyHtml = `<div class="agent-row-detail">${s.detail}</div>`;
    }
    // Prefer Aurora SVG icon if available; fall back to emoji
    const iconHtml = a.iconSvg || a.icon || '';
    return `<div class="agent-row${s.status === 'running' ? ' active' : ''}"
      onclick="document.getElementById('${a.stepId}')?.scrollIntoView({behavior:'smooth',block:'start'})">
      <span class="agent-row-icon">${iconHtml}</span>
      <span class="agent-row-label">${a.label}</span>
      <span class="agent-status-dot ${s.status}"></span>
      ${bodyHtml ? `<div class="agent-row-body">${bodyHtml}</div>` : ''}
    </div>`;
  }).join('');
}

function refreshReelAgentPanel() {
  Object.keys(_reelAgentState).forEach(k => delete _reelAgentState[k]);
  _renderReelAgentPanel();
  const sceneHeader = document.querySelector('#reel-step-presets .agent-step-name');
  if (sceneHeader) sceneHeader.textContent = 'Style & Presets';
  const sceneIcon = document.querySelector('#reel-step-presets .agent-step-icon');
  if (sceneIcon) sceneIcon.textContent = '3';
}

function initAllReelAgentTasks() {
  const isAnimated = reelVideoMode === 'animated';
  const ids = ['scene', 'image', 'bgm', 'preview'];
  if (isAnimated) ids.splice(2, 0, 'animation');
  ids.forEach(id => { _reelAgentState[id] = { status: 'waiting', detail: '', subtasks: [] }; });
  _renderReelAgentPanel();
}

// ══════════════════════════════════════════
//  INFER AGENT STATES FROM RESTORED PROJECT
// ══════════════════════════════════════════

function inferCreateAgentStates() {
  // Reset panel to current mode first
  refreshCreateAgentPanel();

  if (!createScenes || createScenes.length === 0) return;



  // Storyboard & Prompt Agent: done if transcript exists
  if (createTranscript) {
    const sceneCount = createScenes.length;
    updateCreateAgent('storyboard', 'done', `${sceneCount} scenes`);
    const launchSummary = $('create-launch-storyboard-summary');
    if (launchSummary) launchSummary.textContent = `✅ ${sceneCount} scenes identified`;
  }

  // Chapter Agent: done if chapters exist
  if (createChapters && createChapters.length > 0) {
    updateCreateAgent('chapter', 'done', `${createChapters.length} chapters`);
  }

  // Reference Agent: hidden in V1 — re-enable in V2
  // if (createScenes.length > 0) { updateCreateAgent('reference', 'done', 'Ready'); }

  // Image Agent: done/error based on scene statuses
  const doneImgs = createScenes.filter(s => s.imgDataUrl).length;
  const failedImgs = createScenes.filter(s => s.status === 'error').length;
  if (doneImgs > 0) {
    const status = failedImgs > 0 ? 'error' : 'done';
    const detail = failedImgs > 0 ? `${doneImgs} done · ${failedImgs} failed` : `${doneImgs} images`;
    updateCreateAgent('image', status, detail);
    const imgSummary = $('create-launch-image-summary');
    if (imgSummary) imgSummary.textContent = `✅ ${doneImgs} images generated`;
  }

  // BGM Agent: done if a BGM blob URL has been generated (restored from project or generated this session)
  if (typeof createBgmUrl !== 'undefined' && createBgmUrl) {
    updateCreateAgent('bgm', 'done', 'Music ready');
    const bgmStep = $('create-bgm-step');
    if (bgmStep) bgmStep.style.display = '';
    const bgmPlayer = $('create-bgm-player');
    if (bgmPlayer) bgmPlayer.style.display = '';
    const bgmAudio = $('create-bgm-audio');
    if (bgmAudio && !bgmAudio.src) bgmAudio.src = createBgmUrl;
  }

  // Voiceover Agent: done if language tracks exist
  if (typeof languageTracks !== 'undefined' && languageTracks && languageTracks.length > 0) {
    const doneTracks = languageTracks.filter(t => t.status === 'done');
    if (doneTracks.length > 0) {
      updateCreateAgent('voiceover', 'done', `${doneTracks.length} track${doneTracks.length > 1 ? 's' : ''} ready`);
    }
  }

  // Animation Agent: done if any scene has video clips
  if (createVideoMode === 'animated') {
    const animatedCount = createScenes.filter(s => s.videoClips?.length > 0 || s.videoUrl).length;
    if (animatedCount > 0) {
      updateCreateAgent('animation', 'done', `${animatedCount} clips ready`);
      const animSummary = $('create-launch-animation-summary');
      if (animSummary) animSummary.textContent = `✅ ${animatedCount} scenes animated`;
    }
  }
}

function inferReelAgentStates() {
  // Reset panel to current mode first
  refreshReelAgentPanel();

  const scenes = reelPendingScenes || reelScenes;
  if (!scenes || scenes.length === 0) return;

  // Script Agent: done if scenes exist (transcription ran)
  // Storyboard / Cinematography Agent: done if scenes have prompts
  if (scenes.some(s => s.prompt || s.sceneDescription)) {
    updateReelAgent('scene', 'done', 'Descriptions ready');
  }

  // Image Agent: done if any scene has image
  const doneImgs = scenes.filter(s => s.imgDataUrl).length;
  if (doneImgs > 0) {
    const failedImgs = scenes.filter(s => s.status === 'error').length;
    updateReelAgent('image', failedImgs > 0 ? 'error' : 'done', `${doneImgs} images`);
  }

  // Animation Agent: done if any scene has video clips
  if (reelVideoMode === 'animated') {
    const animatedCount = scenes.filter(s => s.videoClips?.length > 0 || s.videoUrl).length;
    if (animatedCount > 0) {
      updateReelAgent('animation', 'done', `${animatedCount} clips ready`);
    }
  }

  // BGM Agent: done if BGM buffer is loaded
  if (reelBgmBuffer) {
    updateReelAgent('bgm', 'done', 'Music ready');
  }

  // Preview Agent: done if editor step is visible
  const editorStep = $('reel-step-editor');
  if (editorStep && !editorStep.classList.contains('hidden')) {
    updateReelAgent('preview', 'done', 'Reel ready');
  }
}

// Init video mode to set button labels correctly
setCreateVideoMode(createVideoMode);
