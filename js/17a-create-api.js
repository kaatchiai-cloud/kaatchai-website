// ══════════════════════════════════════════
//  CREATE CONTENT — API, Keys, Templates
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
function getCreateGeminiKey() { return getPaidKey(); }
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
  navigateTo('create');
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
  navigateTo('home');
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
function hasDedicatedPaidKey() { return isPaidTier() && getPaidKey() && getPaidKey() !== getFreeKey(); }
function getTextModels() { return hasDedicatedPaidKey() ? ['gemini-2.5-pro', 'gemini-2.5-flash'] : ['gemini-2.5-flash']; }
function getTranscriptionModels() { return ['gemini-2.5-pro', 'gemini-2.5-flash']; }
function getImageModels() {
  return ['gemini-2.5-flash-image'];
}
function getTTSModels() { return ['gemini-2.5-flash-preview-tts']; }
function getSegmentDuration() {
  return isPaidTier() ? { min: 5, max: 15 } : { min: 12, max: 24 };
}

// ── API Call Wrapper with model fallback ──
async function callGeminiAPI(models, body, apiKey) {
  const modelList = Array.isArray(models) ? models : [models];
  const key = apiKey || getCreateGeminiKey();
  if (!key) throw new Error('No API key configured. Enter a free or paid tier key in Step 1.');

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
  btnCreateTranscribe.disabled = !(hasKey && hasAudio);
  // Update transcribe button label based on input mode
  if (!createTranscript && btnCreateTranscribe.textContent.indexOf('✓') === -1 && btnCreateTranscribe.textContent.indexOf('Retry') === -1) {
    btnCreateTranscribe.textContent = createInputMode === 'text' ? '📝 Generate Storyboard' : '🎤 Transcribe with Gemini';
  }
  btnCreateGenerate.disabled = !createScenes || createScenes.length === 0;
  btnCreateSendEditor.disabled = !createScenes || !createScenes.some(s => s.imgDataUrl) || langGenerating;
  if (keyImageStatus && !getFreeKey()) keyImageStatus.textContent = '';
  // Update cost hints on buttons
  updateCostHints();
}

function updateCostHints() {
  const sceneCount = createScenes ? createScenes.length : 0;
  const pendingCount = createScenes ? createScenes.filter(s => s.status !== 'done').length : 0;
  // Transcribe button
  if (btnCreateTranscribe && !btnCreateTranscribe.disabled) {
    btnCreateTranscribe.title = `Estimated cost: ~$${estimateCost('transcription', 1)}`;
  }
  // Generate images button — grid mode cost estimate
  if (btnCreateGenerate && sceneCount > 0) {
    const gridBatches = pendingCount >= 4 ? Math.ceil(pendingCount / 9) : 0;
    const individualCount = pendingCount >= 4 ? pendingCount % 9 < 4 ? pendingCount % 9 : 0 : pendingCount;
    const gridCost = gridBatches > 0 ? estimateCost('gridGen2K', gridBatches) : 0;
    const indivCost = individualCount > 0 ? estimateCost('imageGenFast', individualCount) : 0;
    const totalCost = (parseFloat(gridCost) + parseFloat(indivCost)).toFixed(3);
    const modeLabel = gridBatches > 0
      ? `${gridBatches} grid batch${gridBatches > 1 ? 'es' : ''}${individualCount > 0 ? ` + ${individualCount} individual` : ''}`
      : `${pendingCount} individual`;
    btnCreateGenerate.title = `Estimated cost: ~$${totalCost} (${modeLabel})`;
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
