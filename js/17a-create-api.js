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
const btnCreateSaveTop = $('btn-create-save-top');
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

  // Style soft-lock guard (R23): if any cast/product is locked AND this
  // template would change the visual style, confirm before proceeding.
  const styleLocked = !!(window.createJobState && window.createJobState.styleLocked);
  const newStyle = (tpl.style && STYLE_PRESETS[tpl.style]) ? tpl.style : '';
  const styleWouldChange = styleLocked && newStyle && newStyle !== createStylePreset;
  if (styleWouldChange && typeof window.castConfirmStyleChange === 'function') {
    const lockedCount = window.castLockedCount ? window.castLockedCount() : 0;
    if (lockedCount > 0) {
      const fromStyle = createStylePreset || 'no preset';
      const toStyle = newStyle;
      const ok = window.confirm(
        'Switching template will change visual style from "' + fromStyle + '" to "' + toStyle + '". '
        + lockedCount + ' locked item(s) were generated in the old style. Continue and mark them for regen?'
      );
      if (!ok) {
        // Re-highlight the previously selected template card (revert UI)
        const grid = $('template-grid');
        if (grid) grid.querySelectorAll('.template-card').forEach(c => {
          c.classList.toggle('selected', c.dataset.tpl === selectedTemplate);
        });
        return;
      }
      window.castConfirmStyleChange();
    }
  }

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

function getElevenLabsKey() {
  return localStorage.getItem('stori_elevenlabs_key') || '';
}

// Send an AudioBuffer to ElevenLabs Scribe for sample-accurate per-word timestamps.
// Returns [{word, start, end}] or null on failure / missing key.
async function alignWordsWithScribe(audioBuffer, langCode) {
  const key = getElevenLabsKey();
  if (!key) return null;
  try {
    const wavBlob = audioBufferToWavBlob(audioBuffer);
    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');
    formData.append('model_id', 'scribe_v1');
    formData.append('timestamps_granularity', 'word');
    formData.append('tag_audio_events', 'false');
    formData.append('diarize', 'false');
    if (langCode && langCode !== 'original') formData.append('language_code', langCode);
    const resp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': key },
      body: formData,
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn('[Scribe] ElevenLabs error', resp.status, errText.slice(0, 200));
      return null;
    }
    const data = await resp.json();
    const words = (data.words || [])
      .filter(w => w && w.type === 'word' && typeof w.start === 'number' && typeof w.end === 'number')
      .map(w => ({ word: w.text, start: w.start, end: w.end }));
    return words.length ? words : null;
  } catch (e) {
    console.warn('[Scribe] alignment failed:', e.message);
    return null;
  }
}

// Gemini fallback: transcribe audio into segments then distribute words uniformly.
// Returns [{word, start, end}] or null.
async function alignWordsWithGemini(audioBuffer, key) {
  try {
    const dur = audioBuffer.duration;
    const wavBlob = audioBufferToWavBlob(audioBuffer);
    const b64 = await blobToBase64(wavBlob);
    const body = {
      contents: [{ parts: [
        { inlineData: { mimeType: 'audio/wav', data: b64.split(',')[1] } },
        { text: `Audio duration: ${dur.toFixed(2)}s. Transcribe and break into 6-9 segments at natural sentence/pause boundaries. Segments must be contiguous (first startTime=0, last endTime=${dur.toFixed(2)}, no gaps). Return ONLY a JSON array:\n[{"startTime":0.0,"endTime":8.0,"text":"words here"}]` },
      ]}],
      generationConfig: { response_mime_type: 'application/json' },
    };
    const data = await callGeminiAPI(['gemini-2.5-flash'], body, key);
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    let segs = typeof parseGeminiJson === 'function' ? parseGeminiJson(raw) : JSON.parse(raw);
    if (!Array.isArray(segs) || !segs.length) return null;
    segs = segs
      .filter(s => typeof s.startTime === 'number' && typeof s.endTime === 'number' && s.endTime > s.startTime && s.text)
      .sort((a, b) => a.startTime - b.startTime)
      .map(s => ({ startTime: Math.max(0, s.startTime), endTime: Math.min(dur, s.endTime), text: s.text.trim() }));
    const words = [];
    for (const s of segs) {
      const wds = s.text.split(/\s+/).filter(Boolean);
      if (!wds.length) continue;
      const dpw = Math.max(0.05, (s.endTime - s.startTime) / wds.length);
      wds.forEach((w, i) => words.push({ word: w, start: s.startTime + i * dpw, end: s.startTime + (i + 1) * dpw }));
    }
    return words.length ? words : null;
  } catch (e) {
    console.warn('[Scribe] Gemini fallback failed:', e.message);
    return null;
  }
}

// Full alignment pipeline: Scribe → Gemini → null.
// null means caller should use its own local fallback (even distribution).
async function alignWords(audioBuffer, langCode, geminiKey) {
  let words = await alignWordsWithScribe(audioBuffer, langCode);
  if (!words) words = await alignWordsWithGemini(audioBuffer, geminiKey);
  return words;
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
  // Cast gate: if user has defined characters/locations, all must be locked before storyboard launch
  const castReady = (typeof window.castAllLocked === 'function') ? window.castAllLocked() : true;
  btnCreateTranscribe.disabled = !(hasKey && hasInput && hasTemplate && hasOutputLanguage && castReady);
  // Update hint text next to launch button
  const hint = $('create-script-launch-hint');
  if (hint) {
    if (createTranscript) hint.textContent = 'Storyboard generated ✅';
    else if (!hasInput) hint.textContent = isTextMode ? 'Enter text to begin' : 'Import audio to begin';
    else if (!hasTemplate) hint.textContent = 'Select a template to begin';
    else if (needsOutputLang && !hasOutputLanguage) hint.textContent = 'Select output language to begin';
    else if (!hasKey) hint.textContent = 'API key required';
    else if (!castReady) hint.textContent = 'Lock all characters/locations to continue';
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
  // Update SELECTED/SWITCH badge text on video mode cards
  document.querySelectorAll('#create-page .video-mode-card').forEach(card => {
    const badge = card.querySelector('.video-mode-badge');
    if (badge) badge.textContent = card.classList.contains('active') ? 'SELECTED' : 'SWITCH';
  });
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

function saveElevenLabsKey(inputId, btn) {
  const input = $(inputId);
  if (!input || !input.value.trim() || input.value.startsWith('●')) return;
  localStorage.setItem('stori_elevenlabs_key', input.value.trim());
  input.value = '●'.repeat(20);
  const statusId = inputId.replace('-key', '-status');
  const statusEl = $(statusId);
  if (statusEl) statusEl.textContent = '✓ Saved';
  const orig = btn.textContent;
  btn.textContent = '✓';
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

// Pre-fill ElevenLabs key inputs from localStorage on load
(function initElevenLabsKeyInputs() {
  const el = getElevenLabsKey();
  if (!el) return;
  ['create-elevenlabs-key', 'reel-elevenlabs-key'].forEach(id => {
    const inp = $(id);
    if (inp) inp.value = '●'.repeat(20);
  });
  ['create-elevenlabs-status', 'reel-elevenlabs-status'].forEach(id => {
    const el2 = $(id);
    if (el2) el2.textContent = '✓ Saved';
  });
})();

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

const CREATE_AGENT_ICONS = {
  storyboard: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  image: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  bgm: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  voiceover: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h4M18 12h4M12 2v4M12 18v4"/></svg>',
  animation: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5,3 19,12 5,21"/></svg>',
};

// `sock` maps each agent step to a P01 socket-color token (--sock-*) so the
// status dot tints to the data type produced by that step (per ADR-1).
//   storyboard → script (yellow)   image → image (orange)
//   bgm        → audio (teal/mint) animation → video (purple)
//   voiceover  → audio (teal/mint, same family as bgm)
// `col` is the canvas column key consumed by jumpToCanvasColumn() in 17c.
const CREATE_AGENTS_ILLUSTRATED = [
  { id: 'storyboard', stepId: 'create-transcribe-step', iconKey: 'storyboard', label: 'Storyboard Agent', sock: 'script', col: 'sb' },
  { id: 'image',      stepId: 'create-generate-step',   iconKey: 'image',      label: 'Image Agent',      sock: 'image',  col: 'img' },
  { id: 'bgm',        stepId: 'create-bgm-step',        iconKey: 'bgm',        label: 'BGM Agent',        sock: 'audio',  col: 'bgm' },
  { id: 'voiceover',  stepId: 'create-language-step',   iconKey: 'voiceover',  label: 'Voiceover Agent',  sock: 'audio',  col: 'sub' },
];

const CREATE_AGENTS_ANIMATED = [
  { id: 'storyboard', stepId: 'create-transcribe-step', iconKey: 'storyboard', label: 'Cinematography Agent', sock: 'script', col: 'sb' },
  { id: 'image',      stepId: 'create-generate-step',   iconKey: 'image',      label: 'Image Agent',          sock: 'image',  col: 'img' },
  { id: 'bgm',        stepId: 'create-bgm-step',        iconKey: 'bgm',        label: 'BGM Agent',            sock: 'audio',  col: 'bgm' },
  { id: 'animation',  stepId: 'create-video-step',      iconKey: 'animation',  label: 'Animation Agent',      sock: 'video',  col: 'vid' },
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
    const iconHtml = CREATE_AGENT_ICONS[a.iconKey] || a.icon;
    const isError = s.status === 'error';

    let bodyHtml = '';
    if (subtasks.length > 0) {
      bodyHtml = subtasks.map(t => {
        const icon = t.status === 'done' ? '✓' : t.status === 'warn' ? '!' : t.status === 'running' ? '⋯' : t.status === 'error' ? '✕' : '';
        return `<div class="agent-subtask ${t.status}"><span class="agent-subtask-icon">${icon}</span><span>${t.label}</span></div>`;
      }).join('');
    } else if ((s.status === 'running' || s.status === 'error') && s.detail) {
      bodyHtml = `<div class="agent-row-detail">${s.detail}</div>`;
    }

    return `<div class="agent-row${s.status === 'running' ? ' active' : ''}${isError ? ' error-clickable' : ''}"
      data-agent-id="${a.id}" data-sock="${a.sock || ''}" data-col="${a.col || ''}"
      onclick="onCreateAgentRowClick(event, '${a.id}', '${a.stepId}', ${isError}, '${a.col || ''}')"
      title="${isError ? 'Click to jump to error and retry' : ''}">
      <span class="agent-row-icon">${iconHtml}</span>
      <span class="agent-row-label">${a.label}</span>
      <span class="agent-status-dot ${s.status}" data-sock="${a.sock || ''}"></span>
      ${bodyHtml ? `<div class="agent-row-body">${bodyHtml}</div>` : ''}
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
  // Add step-level class for visual state
  if (step.classList.contains('reel-step') || step.classList.contains('create-step')) {
    step.classList.remove('step-done', 'step-running', 'step-error');
    if (status === 'done') step.classList.add('step-done');
    else if (status === 'running') step.classList.add('step-running');
    else if (status === 'error') step.classList.add('step-error');
  }
  // Autopilot: auto-scroll agent panel to the running agent row
  if (pipeline === 'reel' && status === 'running') {
    const panel = $('reel-agent-panel');
    const row = panel && panel.querySelector('.agent-row.active');
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  // Update mobile progress bar
  if (pipeline === 'reel') _updateReelMobileProgress();
}

// ── Mobile progress bar for Autopilot pipeline ──
function _updateReelMobileProgress() {
  const bar = $('reel-mobile-progress');
  if (!bar) return;
  const agents = _getReelAgents();
  bar.innerHTML = agents.map(a => {
    const s = _reelAgentState[a.id] || { status: 'waiting' };
    return `<div class="reel-mobile-progress-step ${s.status}"></div>`;
  }).join('');
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

// Render the faux BGM waveform for Create Story (140 bars, gradient via CSS var)
function renderCreateBgmFauxWave() {
  const host = document.getElementById('create-bgm-faux-wave');
  if (!host || host.dataset.rendered === '1') return;
  const BARS = 140;
  const parts = [];
  for (let i = 0; i < BARS; i++) {
    const h = Math.min(40, 6 + (Math.sin(i * 0.3) * 0.5 + 0.5) * 28 + (i * 11) % 8);
    const opacity = 0.5 + (i % 5) / 10;
    parts.push(`<span class="create-bgm-wave-bar" style="height:${h}px;--wave-opacity:${opacity.toFixed(2)};"></span>`);
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

// Wire a CtrlRow <input type=range> to its <span> label (shows live value
// with optional unit suffix) and keeps the track filled from left to thumb.
function wireAurSlider(inputId, labelId, suffix) {
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId);
  if (!input || !label) return;
  const sync = () => {
    label.textContent = input.value + (suffix || '');
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const pct = ((parseFloat(input.value) - min) / (max - min)) * 100;
    input.style.setProperty('--slider-pct', pct.toFixed(1) + '%');
  };
  input.addEventListener('input', sync);
  sync(); // Set initial fill on page load
}

// Bootstrap all Aurora preview affordances. Use readyState check because
// when all JS is inlined into one file, DOMContentLoaded may have already
// fired by the time this code runs.
function _initAuroraReelBits() {
  // BGM step — waveform + volume slider (unrelated to Preview & Edit)
  renderReelBgmFauxWave();
  wireReelVolSlider('reel-bgm-volume-slider', 'reel-bgm-vol-label');

  // Phone frame preview mirror — copies the first reel canvas (rendered by
  // renderAllReelPreviews into reel-previews-container) into the phone screen.
  // Also wires the phone transport play button, hides waiting placeholder,
  // and applies slider fill to rc-* range inputs after the container populates.
  (function initPhonePreviewMirror() {
    const phoneScreen  = document.getElementById('reel-phone-screen');
    if (!phoneScreen) return;
    const placeholder  = phoneScreen.querySelector('.reel-phone-placeholder');
    const phonePlayBtn = document.querySelector('.reel-phone-play');
    const phoneTimeEl  = document.querySelector('.reel-phone-time');
    const waiting      = document.querySelector('#reel-page .reel-ctrl-waiting');

    let mirrorCvs = null;
    let mirrorRAF = null;
    let activeSrc = null;

    function applySliderFill(root) {
      root.querySelectorAll('input[type=range]').forEach(el => {
        const min = parseFloat(el.min) || 0;
        const max = parseFloat(el.max) || 100;
        const pct = ((parseFloat(el.value) - min) / (max - min)) * 100;
        el.style.setProperty('--slider-pct', pct.toFixed(1) + '%');
        el.addEventListener('input', () => {
          const p = ((parseFloat(el.value) - min) / (max - min)) * 100;
          el.style.setProperty('--slider-pct', p.toFixed(1) + '%');
        });
      });
    }

    function startMirror(src) {
      if (activeSrc === src) return;
      activeSrc = src;
      if (placeholder) placeholder.style.display = 'none';
      if (waiting)     waiting.style.display      = 'none';

      if (!mirrorCvs) {
        mirrorCvs = document.createElement('canvas');
        mirrorCvs.style.cssText = 'width:100%;height:100%;display:block;position:absolute;inset:0;';
        phoneScreen.style.position = 'relative';
        phoneScreen.appendChild(mirrorCvs);
      }

      if (mirrorRAF) { cancelAnimationFrame(mirrorRAF); }
      (function loop() {
        if (src.width > 0 && src.height > 0) {
          if (mirrorCvs.width !== src.width || mirrorCvs.height !== src.height) {
            mirrorCvs.width  = src.width;
            mirrorCvs.height = src.height;
          }
          mirrorCvs.getContext('2d').drawImage(src, 0, 0);
        }
        // Sync time display + play button icon
        if (phoneTimeEl) {
          const mpTime = document.querySelector('.reel-mp-time[data-ri="0"]');
          if (mpTime && mpTime.textContent) phoneTimeEl.textContent = mpTime.textContent;
        }
        if (phonePlayBtn) {
          const mpPlay = document.querySelector('.reel-mp-play[data-ri="0"]');
          if (mpPlay) phonePlayBtn.textContent = mpPlay.textContent;
        }
        mirrorRAF = requestAnimationFrame(loop);
      })();
    }

    // Watch reel-previews-container for the first canvas (added by renderAllReelPreviews)
    const container = document.getElementById('reel-previews-container');
    if (container) {
      const obs = new MutationObserver(() => {
        const first = container.querySelector('.reel-thumb-canvas[data-ri="0"]');
        if (first) {
          startMirror(first);
          // Apply Aurora slider fill to all rc-* range inputs now that they exist
          const ctrlCol = container.querySelector('.rp-ctrl-col');
          if (ctrlCol) applySliderFill(ctrlCol);
          // Wire rc-frame select → show/hide sub-control rows
          // (renderAllReelPreviews does not wire this — gap in the original code)
          const frameEl = container.querySelector('.rc-frame[data-ri="0"]');
          if (frameEl) {
            const textTpls = ['bottom-strip', 'top-bar', 'corner-tag'];
            const syncFrameRows = () => {
              const v = frameEl.value;
              const tplRow = container.querySelector('.rc-frame-tpl-row[data-ri="0"]');
              const pngRow = container.querySelector('.rc-frame-png-row[data-ri="0"]');
              if (tplRow) tplRow.style.display = textTpls.includes(v) ? 'inline-flex' : 'none';
              if (pngRow) pngRow.style.display  = (v === 'custom-png') ? 'inline-flex' : 'none';
              // Wire upload button to file input (one-time, guard with dataset flag)
              const uploadBtn = container.querySelector('.rc-frame-upload[data-ri="0"]');
              const fileInput = document.getElementById('reel-frame-input');
              if (uploadBtn && fileInput && !uploadBtn.dataset.wired) {
                uploadBtn.dataset.wired = '1';
                uploadBtn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', (e) => {
                  if (e.target.files[0]) uploadBtn.textContent = '🖼 ' + e.target.files[0].name.slice(0, 14);
                });
              }
            };
            frameEl.addEventListener('change', syncFrameRows);
            syncFrameRows(); // set initial state
          }
        }
      });
      obs.observe(container, { childList: true, subtree: true });
    }

    // Phone play button → delegate to first reel's play button
    if (phonePlayBtn) {
      phonePlayBtn.addEventListener('click', () => {
        const mpPlay = document.querySelector('.reel-mp-play[data-ri="0"]');
        if (mpPlay) mpPlay.click();
      });
    }
  })();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initAuroraReelBits);
} else {
  _initAuroraReelBits();
}
// Defence in depth: if #reel-step-bgm is later un-hidden by the pipeline,
// re-run the waveform render so it shows even if it wasn't in the DOM
// at init time.
(function observeReelBgmReveal() {
  if (typeof MutationObserver !== 'function') return;
  const hook = () => {
    const el = document.getElementById('reel-step-bgm');
    if (!el) { setTimeout(hook, 200); return; }
    const obs = new MutationObserver(() => {
      if (!el.classList.contains('hidden')) renderReelBgmFauxWave();
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  };
  hook();
})();

// Same defence for Create Story BGM wave
(function observeCreateBgmReveal() {
  if (typeof MutationObserver !== 'function') return;
  const hook = () => {
    const el = document.getElementById('create-bgm-faux-wave');
    if (!el) { setTimeout(hook, 200); return; }
    renderCreateBgmFauxWave();
    const obs = new MutationObserver(() => renderCreateBgmFauxWave());
    obs.observe(el.parentElement || el, { attributes: true, attributeFilter: ['class'] });
  };
  hook();
})();

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
    const isErr = s.status === 'error';
    return `<div class="agent-row${s.status === 'running' ? ' active' : ''}${isErr ? ' error-clickable' : ''}"
      onclick="scrollToAgentStep('${a.stepId}', ${isErr})"
      title="${isErr ? 'Click to jump to error and retry' : ''}">
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

// ── Cast (Characters & Locations) AI helpers ──────────────────────────────────

const CAST_STYLE_PREFIX = {
  cinematic: 'Cinematic film aesthetic, dramatic three-point lighting, shallow depth of field',
  photorealistic: 'Photorealistic, natural lighting, lifelike skin and textures',
  watercolor: 'Soft watercolor illustration, flowing brushstrokes, paper texture',
  anime: 'Anime style, expressive features, clean line art, vibrant cel shading',
  'oil-painting': 'Oil painting, rich impasto, classical composition',
  'digital-art': 'Polished digital art, clean shading, vibrant colors',
  minimalist: 'Minimalist illustration, flat shapes, limited palette',
  comic: 'Comic book style, bold ink outlines, halftone shading',
  'pixel-art': 'Pixel art, 16-bit aesthetic, dithered shading',
  '3d-render': 'High-quality 3D render, soft global illumination, realistic materials',
  sketch: 'Pencil sketch, hatched shading, paper grain',
  vintage: 'Vintage film aesthetic, faded color palette, soft grain',
  'flat-design': 'Flat design illustration, geometric shapes, bold colors',
  gothic: 'Gothic illustration, moody lighting, ornate detail',
  pastel: 'Pastel art, soft chalky textures, gentle gradients',
  'ukiyo-e': 'Ukiyo-e woodblock print, flat color regions, calligraphic linework',
  'stained-glass': 'Stained glass design, jeweled colors, dark leading',
  'pop-art': 'Pop art, halftone dots, saturated primary colors',
  noir: 'Film noir, high-contrast black and white, hard shadows',
  surrealism: 'Surrealist composition, dreamlike juxtaposition',
};

function castStylePrefix() {
  const preset = (typeof createStylePreset === 'string' && createStylePreset) || '';
  if (preset === 'custom' || !preset) {
    const custom = (typeof createStylePrompt === 'string' && createStylePrompt.trim()) || '';
    return custom || 'Highly detailed visual style';
  }
  return CAST_STYLE_PREFIX[preset] || ('Style preset: ' + preset);
}

// Generate canonical appearance sheet. Uploaded image (if any) is attached for likeness.
async function generateAppearanceSheet(item, type, geminiKey) {
  const stylePrefix = castStylePrefix();
  const isChar = type === 'character' || type === 'presenter';
  const isLoc = type === 'location' || type === 'setting';
  const isProduct = type === 'product';
  let promptText;
  if (isProduct) {
    promptText = `Write a detailed canonical hero-shot description for a product so an AI image generator can produce visually consistent product images across many scenes.

Product name: ${item.name}
User description: "${item.userDescription || '(none provided)'}"
Visual style: ${stylePrefix}
${item.uploadedImageDataUrl ? '(Reference image attached — match the form factor and brand presentation shown.)' : ''}

Return ONLY valid JSON (no markdown):
{
  "appearance": "Detailed visual description (3-5 sentences): form factor, materials, colors, surface finish, distinguishing features, any visible logos/badges, packaging if relevant. Hero-shot composition: clean neutral background, soft lighting, centered.",
  "distinctiveTraits": ["3-5 specific visual anchors that must appear in every image of this product"],
  "ageRange": "",
  "build": ""
}`;
  } else if (isChar) {
    promptText = `You are a casting director. Write a detailed canonical appearance sheet for a character so an AI image generator can produce visually consistent images across many scenes.

Character name: ${item.name}
User description: "${item.userDescription || '(none provided)'}"
Visual style: ${stylePrefix}
${item.uploadedImageDataUrl ? '(Reference image attached — match the likeness shown.)' : ''}

Return ONLY valid JSON (no markdown):
{
  "appearance": "Detailed visual description (3-5 sentences): age, height, build, face shape, hair (color/length/style), eyes, distinctive features, clothing (specific items, colors, fabrics), accessories",
  "distinctiveTraits": ["3-5 specific visual anchors that must appear in every image"],
  "ageRange": "X-Y",
  "build": "..."
}`;
  } else {
    promptText = `Write a detailed canonical appearance sheet for a location so an AI image generator can produce visually consistent images across many scenes.

Location name: ${item.name}
User description: "${item.userDescription || '(none provided)'}"
Visual style: ${stylePrefix}
${item.uploadedImageDataUrl ? '(Reference image attached — match the look shown.)' : ''}

Return ONLY valid JSON (no markdown):
{
  "appearance": "Detailed visual description (3-5 sentences): setting type, time of day, lighting, mood, key visual elements, materials, colors",
  "distinctiveTraits": ["3-5 specific visual anchors that must appear in every image of this location"],
  "ageRange": "",
  "build": ""
}`;
  }

  const parts = [{ text: promptText }];
  if (item.uploadedImageDataUrl) {
    const m = item.uploadedImageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
  }
  const data = await callGeminiAPI(['gemini-2.5-flash'], { contents: [{ parts }] }, geminiKey);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (e) {
    // Fallback: use raw user description as appearance
    return {
      appearance: item.userDescription || item.name,
      distinctiveTraits: [],
      ageRange: '',
      build: '',
    };
  }
  return {
    appearance: typeof parsed.appearance === 'string' ? parsed.appearance : (item.userDescription || ''),
    distinctiveTraits: Array.isArray(parsed.distinctiveTraits) ? parsed.distinctiveTraits.slice(0, 5) : [],
    ageRange: parsed.ageRange || '',
    build: parsed.build || '',
  };
}

// Generate representative image. Path A = no upload (text-only). Path B = with upload (likeness anchor).
async function generateRepresentativeImage(item, type, geminiKey) {
  const stylePrefix = castStylePrefix();
  const isChar = type === 'character' || type === 'presenter';
  const isProduct = type === 'product';
  let subject;
  if (isProduct) {
    subject = 'Hero product shot, centered on a clean neutral background, soft three-point studio lighting, eye-level. No people in frame.';
  } else if (isChar) {
    subject = 'Full-body character portrait, subject centered, plain neutral background, eye-level shot, full body visible.';
  } else {
    subject = 'Establishing shot of the location, no people, neutral overcast lighting if outdoors, eye-level angle.';
  }
  let prompt;
  let opts;
  if (item.uploadedImageDataUrl) {
    const m = item.uploadedImageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    let refLabel;
    if (isProduct) refLabel = 'Reference image: match this product\'s form factor, materials, and brand presentation in the rendered image.';
    else if (isChar) refLabel = 'Reference image: match this person\'s face, build, and likeness in the rendered image.';
    else refLabel = 'Reference image: match the look and feel of this location in the rendered image.';
    const refParts = m ? [
      { inlineData: { mimeType: m[1], data: m[2] } },
      { text: refLabel }
    ] : [];
    prompt = `${stylePrefix}. ${item.appearanceSheet || item.userDescription || item.name}. ${subject} Match the reference image. Re-render in the target style.`;
    opts = { width: 768, height: 1024, refParts };
  } else {
    prompt = `${stylePrefix}. ${item.appearanceSheet || item.userDescription || item.name}. ${subject}`;
    opts = { width: 768, height: 1024 };
  }
  if (typeof generateImageGeminiFlash === 'function') {
    return await generateImageGeminiFlash(prompt, geminiKey, opts);
  }
  throw new Error('generateImageGeminiFlash not available');
}

// Vision auto-caption: when user uploads image but leaves description blank, fill it in.
async function autoCaptionFromImage(imgDataUrl, type, geminiKey) {
  const m = imgDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!m) return '';
  const promptText = type === 'character'
    ? 'Describe this person concisely for an AI image generator: age, build, hair color/style, distinctive features, clothing. 1-2 sentences. Output only the description, no preamble.'
    : 'Describe this location concisely for an AI image generator: setting type, lighting, mood, key visual elements. 1-2 sentences. Output only the description, no preamble.';
  try {
    const data = await callGeminiAPI(['gemini-2.5-flash'], {
      contents: [{ parts: [
        { inlineData: { mimeType: m[1], data: m[2] } },
        { text: promptText }
      ]}]
    }, geminiKey);
    return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  } catch (e) {
    console.warn('[autoCaptionFromImage] failed:', e.message);
    return '';
  }
}

// Detect references from script text — mode-aware extraction.
// videoType: 'film' | 'brand'. Returns:
//   film  → { characters: [{name, description}], locations: [{name, description}] }
//   brand → { product: {name, description}, presenter: {name, description} | null,
//             setting: {name, description} | null }
async function detectRefsFromScript(scriptText, videoType, geminiKey) {
  if (!geminiKey) throw new Error('Gemini API key required');
  if (!scriptText || !scriptText.trim()) throw new Error('No script text to analyze');
  let promptText;
  if (videoType === 'film') {
    promptText = `Read this script and identify recurring characters and locations worth defining as references for visual consistency in an AI-generated video.

Script:
"""
${scriptText.slice(0, 8000)}
"""

Return ONLY valid JSON (no markdown, no preamble):
{
  "characters": [
    {"name": "Character Name", "description": "1-2 sentence visual description: age, build, clothing, distinctive features (inferred from script)"}
  ],
  "locations": [
    {"name": "Location Name", "description": "1-2 sentence visual description: setting type, atmosphere, key visual elements"}
  ]
}

RULES:
- Only include items that appear in 2+ scenes/segments OR are clearly central to the story.
- Cap: 6 items combined (characters + locations).
- For unnamed characters who recur (e.g. "the bartender"), assign a useful name.
- If the script has no recurring characters or locations, return empty arrays.
- Return ONLY the JSON object.`;
  } else if (videoType === 'brand') {
    promptText = `Read this brand/product video script and identify the product being featured, plus the on-screen presenter (if any) and the setting (if any).

Script:
"""
${scriptText.slice(0, 8000)}
"""

Return ONLY valid JSON (no markdown, no preamble):
{
  "product": {"name": "Product Name", "description": "1-2 sentence visual description of the product (color, form, materials, distinguishing features)"},
  "presenter": {"name": "Presenter Name or 'Presenter'", "description": "1-2 sentence visual description"} or null,
  "setting": {"name": "Setting Name", "description": "1-2 sentence visual description"} or null
}

RULES:
- product is required. If no clear product, infer the brand/service as the product.
- presenter is optional — only include if a person is on camera demonstrating, narrating, or modeling the product.
- setting is optional — only include if a specific location is established (studio, kitchen, gym, etc.).
- Return ONLY the JSON object.`;
  } else {
    return null;
  }
  const data = await callGeminiAPI(['gemini-2.5-flash'], { contents: [{ parts: [{ text: promptText }] }] }, geminiKey);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error('Could not parse Gemini response as JSON');
  }
}

// Read the current script text from whichever input mode is active.
function readCurrentScriptText() {
  // Text mode — direct textarea
  const ta = $('create-tts-text');
  if (ta && ta.value && ta.value.trim()) return ta.value.trim();
  // Audio/podcast mode — transcribed text on createTranscript
  if (typeof createTranscript === 'string' && createTranscript.trim()) return createTranscript.trim();
  // Audio with structured segments — concatenate segment text
  if (typeof createScenes !== 'undefined' && Array.isArray(createScenes) && createScenes.length > 0) {
    const segs = createScenes.map(s => s.text || '').filter(Boolean).join(' ');
    if (segs.trim()) return segs.trim();
  }
  return '';
}

// AI rewrite — smooth raw bracket tokens into the prose naturally.
// User has already mutated the prose structurally (added/removed [Name] tokens).
// This call asks Gemini to weave them in / smooth removals so the prose reads well.
//   prose: the current scene prose (may contain raw [Name] tokens awkwardly placed)
//   contextRefs: array of { name, description } for all locked refs that ARE
//                referenced in the prose
//   geminiKey
// Returns the rewritten prose. No REMOVE_FAILED — removal already happened
// structurally; this call just polishes the language around it.
async function rewriteSceneSmoothBrackets(prose, contextRefs, geminiKey) {
  if (!geminiKey) throw new Error('Gemini API key required');
  const refsBlock = (contextRefs || []).length > 0
    ? 'References in this scene:\n' + contextRefs.map(r => `- [${r.name}] — ${r.description || r.name}`).join('\n') + '\n\n'
    : '';
  const prompt = `Scene prose (may contain awkwardly-placed [Name] tokens that need smoothing):
"""
${prose}
"""

${refsBlock}Rewrite the scene so each [Name] token is woven in naturally — describe their presence, action, or interaction with the existing scene. Keep the same length, mood, camera direction, and pacing. Use the exact bracket names that appear above (do not introduce new bracket names, do not strip existing ones). Do NOT redescribe physical traits — the image generator already has the reference images.

Return ONLY the rewritten prose. No commentary, no markdown, no quotation marks around the result.`;
  const data = await callGeminiAPI(['gemini-2.5-flash'], { contents: [{ parts: [{ text: prompt }] }] }, geminiKey);
  const out = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  return out.replace(/^["']|["']$/g, '').trim();
}

// Expose to other modules
window.generateAppearanceSheet = generateAppearanceSheet;
window.generateRepresentativeImage = generateRepresentativeImage;
window.autoCaptionFromImage = autoCaptionFromImage;
window.castStylePrefix = castStylePrefix;
window.detectRefsFromScript = detectRefsFromScript;
window.readCurrentScriptText = readCurrentScriptText;
window.rewriteSceneSmoothBrackets = rewriteSceneSmoothBrackets;
