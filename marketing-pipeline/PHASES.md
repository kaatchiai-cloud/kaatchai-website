# Marketing Pipeline — Detailed Phase-wise Implementation Plan

## Quick Reference

| Phase | What | New Lines | Dependencies |
|---|---|---|---|
| 1 | Foundation: file, nav, UI shell, API key | ~350 | None |
| 2 | Job creation: 3 input modes, cards, queue | ~400 | Phase 1 |
| 3 | Script gen + auto style (Gemini Pro) | ~250 | Phase 2 |
| 4 | TTS audio generation | ~200 | Phase 3 |
| 5 | Scene breakdown + word timings | ~200 | Phase 4 |
| 6 | Image generation (grid + individual) | ~200 | Phase 5 |
| 7 | Execution engine (parallel + sequential) | ~300 | Phase 6 |
| 8 | Preview + reel editor bridge | ~200 | Phase 7 |
| 9 | Export with branding (watermark, intro, end card) | ~300 | Phase 8 |
| 10 | Project save/load | ~250 | Phase 9 |
| 11 | Build integration + polish | ~100 | Phase 10 |
| **Total** | | **~2,750** | |

---

## Phase 1: Foundation

**Goal:** Pipeline page exists, navigates correctly, API key works, UI shell renders.

### 1.1 Create js/21-marketing-pipeline.js

Empty file with module comment header and global state variables.

```javascript
// ── 21-marketing-pipeline.js ── Marketing Pipeline Workbench (internal tool)

// ═══════════════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════════════

let pipelineJobs = [];                    // all jobs
let pipelineEngine = null;                // PipelineEngine instance
let pipelineApiKey = '';                  // single API key for all jobs
let pipelineCurrentProject = null;        // loaded project metadata
```

### 1.2 Add #pipeline-page to index.html

Insert after `#reel-page` div, before `#editor` div. Full HTML structure:

```html
<div id="pipeline-page">
  <!-- 1.2.1 Header -->
  <div class="pipeline-header">
    <button id="btn-pipeline-back" class="btn-sm">← Back</button>
    <h2 class="text-lg">Marketing Pipeline</h2>
    <div style="margin-left:auto; display:flex; gap:8px;">
      <button id="btn-pipeline-save" class="btn-sm">Save Project</button>
      <button id="btn-pipeline-load" class="btn-sm">Load Project</button>
      <input type="file" id="pipeline-load-input" accept=".json,.pipeline" hidden>
    </div>
  </div>

  <!-- 1.2.2 API Key -->
  <div class="pipeline-step">
    <h3><span class="step-num">1</span> API Key</h3>
    <div class="form-row">
      <input type="password" id="pipeline-api-key" placeholder="Gemini API key" style="width:300px;">
      <button id="btn-pipeline-save-key" class="primary btn-xs">Save</button>
      <span id="pipeline-key-status" class="text-xs text-muted"></span>
    </div>
    <p class="text-xs text-muted">Single key used for all jobs. Get one from
      <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com</a></p>
  </div>

  <!-- 1.2.3 Add Content (Phase 2 fills this) -->
  <div class="pipeline-step" id="pipeline-add-section">
    <h3><span class="step-num">2</span> Add Content</h3>
    <div id="pipeline-add-controls"></div>
  </div>

  <!-- 1.2.4 Job Queue (Phase 2 fills this) -->
  <div class="pipeline-step" id="pipeline-queue-section">
    <h3><span class="step-num">3</span> Content Queue</h3>
    <div id="pipeline-controls"></div>
    <div id="pipeline-progress" class="create-progress hidden">
      <div class="bar-bg"><div class="bar-fill" id="pipeline-progress-bar"></div></div>
      <div class="label" id="pipeline-progress-label"></div>
    </div>
    <div id="pipeline-job-grid" class="pipeline-grid"></div>
  </div>

  <!-- 1.2.5 Export (Phase 9 fills this) -->
  <div class="pipeline-step hidden" id="pipeline-export-section">
    <h3><span class="step-num">4</span> Export</h3>
    <div id="pipeline-export-controls"></div>
  </div>
</div>
```

### 1.3 Add landing page button

In `index.html`, inside the `.landing-hero` flex container, after the existing buttons:

```html
<button id="btn-pipeline" class="btn-lg" style="background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;">
  Marketing Pipeline
</button>
```

### 1.4 Update navigation (js/01-core.js)

**In `navigateTo()` function (~line 281):**

Add to the "hide all" section:
```javascript
const pipelinePage = $('pipeline-page');
if (pipelinePage) pipelinePage.classList.remove('visible');
```

Add new view case:
```javascript
} else if (view === 'pipeline') {
  const pipelinePage = $('pipeline-page');
  if (pipelinePage) pipelinePage.classList.add('visible');
}
```

### 1.5 Wire navigation buttons (js/18-navigation.js or js/21-marketing-pipeline.js)

```javascript
// Landing page → pipeline
$('btn-pipeline')?.addEventListener('click', () => navigateTo('pipeline'));

// Pipeline back → home
$('btn-pipeline-back')?.addEventListener('click', () => navigateTo('home'));
```

### 1.6 API key handling

```javascript
// Load saved key on init
pipelineApiKey = localStorage.getItem('stori_key_paid') || '';
if (pipelineApiKey) {
  $('pipeline-api-key').value = '●'.repeat(20);
  $('pipeline-key-status').textContent = 'Saved';
}

// Save key button
$('btn-pipeline-save-key')?.addEventListener('click', () => {
  const key = $('pipeline-api-key').value.trim();
  if (!key || key.startsWith('●')) return;
  localStorage.setItem('stori_key_paid', key);
  pipelineApiKey = key;
  $('pipeline-api-key').value = '●'.repeat(20);
  $('pipeline-key-status').textContent = 'Saved';
});
```

**Note:** Reuses the same `stori_key_paid` localStorage key as the reel creator — single API key across the app.

### 1.7 Add CSS for pipeline (css/styles.css)

```css
/* Pipeline page */
#pipeline-page { display:none; padding:20px; max-width:1200px; margin:0 auto; }
#pipeline-page.visible { display:block; }

.pipeline-header {
  display:flex; align-items:center; gap:12px;
  margin-bottom:20px; padding-bottom:12px;
  border-bottom:1px solid var(--border);
}

.pipeline-step {
  background:var(--bg-card); border-radius:var(--radius-lg);
  padding:16px 20px; margin-bottom:16px;
}

.pipeline-grid {
  display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));
  gap:12px; margin-top:12px;
}
```

### 1.8 Verification

- [ ] Click "Marketing Pipeline" on landing → pipeline page shows
- [ ] Click "← Back" → returns to landing
- [ ] Browser back/forward works (hash routing)
- [ ] API key saves to localStorage and persists on reload
- [ ] API key field shows dots after save
- [ ] API key shared with reel creator (same localStorage key)

---

## Phase 2: Job Creation (3 Input Modes)

**Goal:** User can create jobs via topic prompt, text script, or CSV import. Jobs appear as cards in the queue.

### 2.1 Channel presets & language config

Define in `js/21-marketing-pipeline.js`:

```javascript
const CHANNEL_PRESETS = {
  'stori': {
    label: 'Stori (English)',
    platform: 'youtube',
    languages: ['en'],
    defaultTransition: 'crossfade',
    subtitleStyle: 'highlight',
    contentType: 'explainer',
  },
  'stori-india': {
    label: 'Stori India',
    platform: 'youtube',
    languages: ['ta', 'hi', 'te', 'ml', 'bn', 'kn', 'mr', 'pa', 'gu'],
    defaultTransition: 'whip-pan',
    subtitleStyle: 'highlight',
    contentType: 'mythology',
  },
  'stori-global': {
    label: 'Stori Global',
    platform: 'youtube',
    languages: ['id', 'fil', 'ar', 'pt-BR', 'yo'],
    defaultTransition: 'crossfade',
    subtitleStyle: 'highlight',
    contentType: 'folk-tale',
  },
};

const PIPELINE_LANGUAGES = {
  'ta':    { label: 'Tamil',          flag: '🇮🇳', ttsVoice: 'ta-IN-Standard-A' },
  'hi':    { label: 'Hindi',          flag: '🇮🇳', ttsVoice: 'hi-IN-Standard-A' },
  'te':    { label: 'Telugu',         flag: '🇮🇳', ttsVoice: 'te-IN-Standard-A' },
  'ml':    { label: 'Malayalam',      flag: '🇮🇳', ttsVoice: 'ml-IN-Standard-A' },
  'bn':    { label: 'Bengali',        flag: '🇮🇳', ttsVoice: 'bn-IN-Standard-A' },
  'kn':    { label: 'Kannada',        flag: '🇮🇳', ttsVoice: 'kn-IN-Standard-A' },
  'mr':    { label: 'Marathi',        flag: '🇮🇳', ttsVoice: 'mr-IN-Standard-A' },
  'pa':    { label: 'Punjabi',        flag: '🇮🇳', ttsVoice: 'pa-IN-Standard-A' },
  'gu':    { label: 'Gujarati',       flag: '🇮🇳', ttsVoice: 'gu-IN-Standard-A' },
  'en':    { label: 'English',        flag: '🇺🇸', ttsVoice: 'en-US-Standard-D' },
  'id':    { label: 'Indonesian',     flag: '🇮🇩', ttsVoice: 'id-ID-Standard-A' },
  'fil':   { label: 'Filipino',       flag: '🇵🇭', ttsVoice: 'fil-PH-Standard-A' },
  'ar':    { label: 'Arabic',         flag: '🇸🇦', ttsVoice: 'ar-XA-Standard-A' },
  'pt-BR': { label: 'Portuguese (BR)',flag: '🇧🇷', ttsVoice: 'pt-BR-Standard-A' },
  'yo':    { label: 'Yoruba',         flag: '🇳🇬', ttsVoice: 'yo-NG-Standard-A' },
};
```

### 2.2 Add Content UI (populate #pipeline-add-controls)

```html
<!-- Row 1: Channel + Language + Style + Platform -->
<div class="form-row mb-md" id="pipeline-preset-row">
  <label class="form-label">Channel:
    <select id="pipeline-channel">
      <option value="stori">Stori (English)</option>
      <option value="stori-india" selected>Stori India</option>
      <option value="stori-global">Stori Global</option>
    </select>
  </label>

  <label class="form-label">Language:
    <select id="pipeline-language"></select>
  </label>

  <label class="form-label">Style:
    <select id="pipeline-style">
      <option value="auto" selected>Auto (AI picks)</option>
      <!-- 20 style options populated from STYLE_PRESETS -->
    </select>
  </label>

  <label class="form-label">Platform:
    <select id="pipeline-platform">
      <option value="youtube" selected>YouTube</option>
      <option value="instagram">Instagram</option>
      <option value="tiktok">TikTok</option>
    </select>
  </label>

  <label class="form-label">Transition:
    <select id="pipeline-transition">
      <option value="quick-cut">Quick Cut</option>
      <option value="whip-pan" selected>Whip Pan</option>
      <option value="zoom-in">Zoom In</option>
      <option value="crossfade">Crossfade</option>
      <option value="flash">Flash</option>
    </select>
  </label>
</div>

<!-- Row 2: Input mode toggle -->
<div class="input-mode-toggle mb-md">
  <button class="mode-btn active" data-mode="topic">Topic / Long Text</button>
  <button class="mode-btn" data-mode="script">Text Script</button>
  <button class="mode-btn" data-mode="csv">CSV Import</button>
</div>

<!-- Topic/Long Text input -->
<div id="pipeline-topic-section">
  <textarea id="pipeline-topic" rows="3" class="w-full"
    placeholder="Short topic: 'Murugan slays Surapadman'&#10;Or paste long text: article, book chapter, any reference material...&#10;AI condenses to ~60 seconds and picks the best visual style."></textarea>
  <div class="form-row mt-sm">
    <button id="btn-pipeline-add-topic" class="primary btn-md">+ Add Job</button>
    <span class="text-xs text-muted">Gemini 2.5 Pro generates script + detects style</span>
  </div>
</div>

<!-- Text Script input -->
<div id="pipeline-script-section" style="display:none;">
  <textarea id="pipeline-script" rows="5" class="w-full"
    placeholder="Paste your complete script here. Should be ~150-180 words for 60 seconds.&#10;AI will break it into scenes and detect the best visual style."></textarea>
  <div class="form-row mt-sm">
    <button id="btn-pipeline-add-script" class="primary btn-md">+ Add Job</button>
  </div>
</div>

<!-- CSV Import -->
<div id="pipeline-csv-section" style="display:none;">
  <div class="form-row">
    <button id="btn-pipeline-csv-import" class="btn-md">Import CSV</button>
    <button id="btn-pipeline-csv-template" class="btn-sm">Download Template</button>
    <input type="file" id="pipeline-csv-input" accept=".csv,.tsv,.txt" hidden>
  </div>
  <p class="text-xs text-muted mt-sm">
    CSV columns: channel, language, topic (required) | style, platform, transition, script (optional)
  </p>
</div>

<!-- Branding toggles -->
<div class="form-row mt-md" id="pipeline-branding-row">
  <span class="text-xs text-secondary">Branding:</span>
  <label class="text-xs"><input type="checkbox" id="pipeline-watermark" checked> Watermark</label>
  <label class="text-xs"><input type="checkbox" id="pipeline-intro-text" checked> Intro text</label>
  <label class="text-xs"><input type="checkbox" id="pipeline-end-card" checked> End card</label>
</div>
```

### 2.3 Channel → Language cascade

When channel changes, populate language dropdown with that channel's languages:

```javascript
function updatePipelineLanguages() {
  const channel = $('pipeline-channel').value;
  const preset = CHANNEL_PRESETS[channel];
  const langSelect = $('pipeline-language');
  langSelect.innerHTML = '';
  for (const code of preset.languages) {
    const lang = PIPELINE_LANGUAGES[code];
    if (!lang) continue;
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = `${lang.flag} ${lang.label}`;
    langSelect.appendChild(opt);
  }
  // Also update transition default
  $('pipeline-transition').value = preset.defaultTransition;
}

$('pipeline-channel').addEventListener('change', updatePipelineLanguages);
updatePipelineLanguages(); // init
```

### 2.4 Populate style dropdown from STYLE_PRESETS

```javascript
function populatePipelineStyles() {
  const sel = $('pipeline-style');
  // Keep "Auto" as first option
  for (const [key, desc] of Object.entries(STYLE_PRESETS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    sel.appendChild(opt);
  }
}
populatePipelineStyles();
```

### 2.5 Input mode toggle

```javascript
document.querySelectorAll('#pipeline-add-controls .mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#pipeline-add-controls .mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode;
    $('pipeline-topic-section').style.display = mode === 'topic' ? '' : 'none';
    $('pipeline-script-section').style.display = mode === 'script' ? '' : 'none';
    $('pipeline-csv-section').style.display = mode === 'csv' ? '' : 'none';
  });
});
```

### 2.6 Job data structure

```javascript
function createPipelineJob(overrides = {}) {
  const channel = $('pipeline-channel').value;
  const preset = CHANNEL_PRESETS[channel];
  return {
    id: 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    status: 'pending',

    // Input
    inputMode: 'topic',        // 'topic' | 'script'
    topic: '',                 // topic or long text
    script: '',                // ready-to-use script

    // Config (from UI, user-editable per job)
    channel: channel,
    language: $('pipeline-language').value,
    languageLabel: PIPELINE_LANGUAGES[$('pipeline-language').value]?.label || '',
    style: $('pipeline-style').value,         // 'auto' or specific preset
    platform: $('pipeline-platform').value,
    transition: $('pipeline-transition').value,
    subtitleStyle: preset.subtitleStyle,
    contentType: preset.contentType,

    // Branding
    watermark: $('pipeline-watermark').checked,
    introText: $('pipeline-intro-text').checked,
    endCard: $('pipeline-end-card').checked,

    // Generated data (filled during execution)
    autoDetectedStyle: null,   // { name, reason } from Pro
    generatedScript: null,     // scenes array from Pro
    scenes: [],                // [{prompt, imgDataUrl, status, startTime, endTime, text, words}]
    audioBuffer: null,
    audioBase64: null,
    words: [],                 // [{word, start, end}]

    // Output
    thumbnailDataUrl: null,
    duration: 0,
    cost: 0,
    error: null,
    createdAt: Date.now(),
    completedAt: null,

    ...overrides,
  };
}
```

### 2.7 Add Job handlers

**Topic/Long Text:**
```javascript
$('btn-pipeline-add-topic')?.addEventListener('click', () => {
  const topic = $('pipeline-topic').value.trim();
  if (!topic) return;
  const job = createPipelineJob({ inputMode: 'topic', topic });
  pipelineJobs.push(job);
  renderPipelineJobCard(job);
  updatePipelineQueueStatus();
  $('pipeline-topic').value = '';
});
```

**Text Script:**
```javascript
$('btn-pipeline-add-script')?.addEventListener('click', () => {
  const script = $('pipeline-script').value.trim();
  if (!script) return;
  const job = createPipelineJob({ inputMode: 'script', script });
  pipelineJobs.push(job);
  renderPipelineJobCard(job);
  updatePipelineQueueStatus();
  $('pipeline-script').value = '';
});
```

**CSV Import:**
```javascript
$('btn-pipeline-csv-import')?.addEventListener('click', () => $('pipeline-csv-input').click());

$('pipeline-csv-input')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCSV(text);
  for (const row of rows) {
    const job = csvRowToJob(row);
    pipelineJobs.push(job);
    renderPipelineJobCard(job);
  }
  updatePipelineQueueStatus();
  e.target.value = '';
});
```

### 2.8 CSV parser

```javascript
function parseCSV(csvText) {
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => row[h] = (values[i] || '').trim());
    return row;
  }).filter(row => row.topic || row.script); // must have content
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

function csvRowToJob(row) {
  const channelKey = row.channel || 'stori-india';
  const preset = CHANNEL_PRESETS[channelKey] || CHANNEL_PRESETS['stori-india'];
  const lang = row.language || preset.languages[0];
  return createPipelineJob({
    inputMode: row.script ? 'script' : 'topic',
    topic: row.topic || '',
    script: row.script || '',
    channel: channelKey,
    language: lang,
    languageLabel: PIPELINE_LANGUAGES[lang]?.label || lang,
    style: row.style || 'auto',
    platform: row.platform || preset.platform,
    transition: row.transition || preset.defaultTransition,
    contentType: preset.contentType,
  });
}
```

### 2.9 CSV template download

```javascript
$('btn-pipeline-csv-template')?.addEventListener('click', () => {
  const csv = `channel,language,topic,style,platform,transition
stori-india,ta,Murugan slays Surapadman,auto,youtube,whip-pan
stori-india,ta,Kannagi's anklet — Silappatikaram,auto,youtube,whip-pan
stori-india,hi,Vikram aur Betaal — The first question,auto,youtube,whip-pan
stori-india,hi,Panchatantra — The monkey and the crocodile,auto,youtube,crossfade
stori,en,How volcanoes form — explained in 60 seconds,auto,youtube,crossfade`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'pipeline-template.csv'; a.click();
  URL.revokeObjectURL(url);
});
```

### 2.10 Job card rendering

```javascript
function renderPipelineJobCard(job) {
  const grid = $('pipeline-job-grid');
  const card = document.createElement('div');
  card.className = 'pipeline-job-card';
  card.dataset.jobId = job.id;
  card.dataset.status = job.status;

  const langInfo = PIPELINE_LANGUAGES[job.language] || {};
  const truncTopic = (job.topic || job.script || '').slice(0, 80);

  card.innerHTML = `
    <div class="pipeline-job-header">
      <input type="checkbox" class="pipeline-job-select">
      <span class="pipeline-job-lang">${langInfo.flag || ''} ${job.languageLabel}</span>
      <span class="pipeline-job-channel text-xs text-muted">${CHANNEL_PRESETS[job.channel]?.label || job.channel}</span>
      <span class="pipeline-job-status">${statusIcon(job.status)}</span>
      <button class="pipeline-job-delete btn-xs" title="Remove">✕</button>
    </div>
    <div class="pipeline-job-body">
      <p class="pipeline-job-topic text-sm">${escHtml(truncTopic)}${truncTopic.length < (job.topic||job.script||'').length ? '...' : ''}</p>
      <div class="pipeline-job-result" style="display:none;">
        <img class="pipeline-job-thumb">
        <div class="pipeline-job-stats text-xs text-muted"></div>
        <div class="pipeline-job-style-info text-xs text-muted"></div>
      </div>
      <div class="pipeline-job-error text-xs" style="display:none;color:var(--red);"></div>
    </div>
    <div class="pipeline-job-actions">
      <button class="btn-pipeline-job-run btn-xs primary">Run</button>
      <button class="btn-pipeline-job-edit btn-xs" style="display:none;">Edit in Reel</button>
      <button class="btn-pipeline-job-export btn-xs" style="display:none;">Export</button>
    </div>
    <div class="pipeline-job-progress" style="display:none;">
      <div class="bar-bg"><div class="bar-fill"></div></div>
      <span class="text-2xs text-muted"></span>
    </div>
  `;

  // Wire delete button
  card.querySelector('.pipeline-job-delete').addEventListener('click', () => {
    pipelineJobs = pipelineJobs.filter(j => j.id !== job.id);
    card.remove();
    updatePipelineQueueStatus();
  });

  // Wire individual run button (wired in Phase 7)
  // Wire edit button (wired in Phase 8)
  // Wire export button (wired in Phase 9)

  grid.appendChild(card);
}

function statusIcon(status) {
  const map = {
    'pending': '<span style="color:var(--text-muted)">Pending</span>',
    'generating-script': '<span style="color:var(--cyan)">Writing script...</span>',
    'generating-audio': '<span style="color:var(--cyan)">Generating audio...</span>',
    'transcribing': '<span style="color:var(--cyan)">Breaking into scenes...</span>',
    'generating-images': '<span style="color:var(--cyan)">Generating images...</span>',
    'assembling': '<span style="color:var(--cyan)">Assembling...</span>',
    'done': '<span style="color:var(--green)">Done</span>',
    'error': '<span style="color:var(--red)">Error</span>',
    'paused': '<span style="color:var(--amber)">Paused</span>',
  };
  return map[status] || status;
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
```

### 2.11 Queue status display

```javascript
function updatePipelineQueueStatus() {
  const total = pipelineJobs.length;
  const done = pipelineJobs.filter(j => j.status === 'done').length;
  const pending = pipelineJobs.filter(j => j.status === 'pending').length;
  const running = pipelineJobs.filter(j => !['pending','done','error','paused'].includes(j.status)).length;
  const estCost = total * 0.17; // rough estimate
  const el = $('pipeline-queue-status');
  if (el) el.textContent = `${total} jobs (${done} done, ${running} running, ${pending} pending) | ~$${estCost.toFixed(2)} est.`;

  // Show/hide export section
  const exportSection = $('pipeline-export-section');
  if (exportSection) exportSection.classList.toggle('hidden', done === 0);
}
```

### 2.12 Job card CSS

```css
.pipeline-job-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pipeline-job-card[data-status="done"] { border-color: var(--green); }
.pipeline-job-card[data-status="error"] { border-color: var(--red); }
.pipeline-job-card[data-status*="generating"],
.pipeline-job-card[data-status="transcribing"],
.pipeline-job-card[data-status="assembling"] { border-color: var(--cyan); }

.pipeline-job-header {
  display: flex; align-items: center; gap: 6px; font-size: var(--text-xs);
}
.pipeline-job-header .pipeline-job-delete {
  margin-left: auto; background: none; border: none;
  color: var(--text-muted); cursor: pointer;
}
.pipeline-job-topic {
  margin: 0; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.pipeline-job-actions { display: flex; gap: 6px; }
.pipeline-job-progress .bar-bg { height: 4px; }
```

### 2.13 Verification

- [ ] Channel dropdown → language dropdown cascades correctly
- [ ] Style dropdown shows "Auto (AI picks)" + all 20 styles
- [ ] Input mode toggle switches between topic/script/csv sections
- [ ] Add topic job → card appears in grid
- [ ] Add script job → card appears in grid
- [ ] CSV import → multiple cards appear
- [ ] CSV template downloads correctly
- [ ] Delete button removes card and updates queue status
- [ ] Queue status shows correct counts
- [ ] Branding checkboxes toggle independently
- [ ] All settings editable before adding job

---

## Phase 3: Script Generation + Auto Style Detection (Gemini 2.5 Pro)

**Goal:** Topic/long text → full script in target language + auto-detected visual style. Uses Gemini 2.5 Pro.

### 3.1 Script generation function

```javascript
async function pipelineGenerateScript(job) {
  const lang = PIPELINE_LANGUAGES[job.language];
  const input = job.topic;
  const isLongText = input.length > 500;

  const styleList = Object.keys(STYLE_PRESETS).join(', ');

  const prompt = `You are a master storyteller creating content for a YouTube channel.

INPUT:
"""
${input}
"""

LANGUAGE: ${lang.label} (${job.language})
CONTENT TYPE: ${job.contentType}

${isLongText
  ? 'The input is a long reference text. Condense it into the most compelling 60-second narrative, preserving the dramatic arc and key visual moments. Be ruthless — cut everything that does not serve the story.'
  : 'The input is a story topic. Create an original, vivid narration script for this topic.'}

TASK 1 — SCRIPT:
Write the narration script entirely in ${lang.label}. NOT in English (unless the language IS English).

Requirements:
- Duration: exactly 60 seconds when read aloud (~150-180 words, adjust for ${lang.label} speech rate)
- 6-9 natural scene breaks. Each scene = one illustration.
- Pure narration. No dialogue tags, no "narrator says", no stage directions.
- Vivid, visual language that paints pictures. Each scene should be a distinct visual moment.
- Cultural authenticity. Use proper names, places, terms from the tradition.
- Emotional arc: opening hook → rising tension → climax → resolution.

TASK 2 — VISUAL STYLE:
Based on the story's emotional tone, cultural context, and visual requirements, pick the single best art style from:
[${styleList}]

Consider: What would make a viewer stop scrolling? What fits the culture and emotion?

OUTPUT — Return ONLY valid JSON, no markdown:
{
  "scenes": [
    {
      "sceneText": "Narration text for this scene in ${lang.label}",
      "sceneDescription": "Visual description in ENGLISH for image generation: specific subject, composition, mood, colors, lighting, camera angle"
    }
  ],
  "style": {
    "name": "style-name-from-list",
    "reason": "One sentence explaining why this style fits"
  }
}`;

  const result = await callGeminiAPI(['gemini-2.5-pro'], {
    contents: [{ parts: [{ text: prompt }] }],
  }, pipelineApiKey);

  const text = result.candidates[0].content.parts[0].text;
  const parsed = parseGeminiJson(text);

  // Validate
  if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length < 3) {
    throw new Error('Script generation returned invalid scenes');
  }
  if (!parsed.style || !parsed.style.name) {
    parsed.style = { name: 'cinematic', reason: 'Default fallback' };
  }
  // Validate style name exists in STYLE_PRESETS
  if (!STYLE_PRESETS[parsed.style.name]) {
    parsed.style.name = 'cinematic';
  }

  return parsed;
}
```

### 3.2 Script generation for text script input

When `inputMode === 'script'`, the user already has a script. But we still need:
- Scene breakdown (split script into scenes with visual descriptions)
- Style auto-detection

```javascript
async function pipelineBreakScript(job) {
  const lang = PIPELINE_LANGUAGES[job.language];
  const styleList = Object.keys(STYLE_PRESETS).join(', ');

  const prompt = `You are a visual director breaking a narration script into illustrated scenes.

SCRIPT (in ${lang.label}):
"""
${job.script}
"""

TASK 1 — SCENE BREAKDOWN:
Split this script into 6-9 scenes at natural visual break points.
Each scene should be a distinct visual moment worth illustrating.

TASK 2 — VISUAL STYLE:
Pick the best art style from: [${styleList}]

OUTPUT — Return ONLY valid JSON:
{
  "scenes": [
    {
      "sceneText": "The exact text from the script for this scene",
      "sceneDescription": "Visual description in ENGLISH for image generation"
    }
  ],
  "style": {
    "name": "style-name",
    "reason": "Why this style fits"
  }
}`;

  const result = await callGeminiAPI(['gemini-2.5-pro'], {
    contents: [{ parts: [{ text: prompt }] }],
  }, pipelineApiKey);

  const text = result.candidates[0].content.parts[0].text;
  return parseGeminiJson(text);
}
```

### 3.3 Cost tracking

```javascript
// Add to COST_ESTIMATES in 01-core.js (or track locally)
const PIPELINE_COSTS = {
  scriptGenPro: 0.015,    // Gemini 2.5 Pro per call
  tts: 0.01,              // TTS per script
  sceneBreakdown: 0.001,  // Flash for scene timing
  gridGen: 0.134,         // Grid image generation
  individualImg: 0.039,   // Per image
};
```

### 3.4 Verification

- [ ] Topic "Murugan slays Surapadman" + Tamil → returns 6-9 scenes in Tamil with English scene descriptions
- [ ] Long text (500+ words) → condensed to ~7 scenes
- [ ] Style auto-detected and returned with reasoning
- [ ] Invalid style name falls back to cinematic
- [ ] Script input mode → scenes broken down correctly
- [ ] API error → throws with meaningful message
- [ ] Cost tracked per call

---

## Phase 4: TTS Audio Generation

**Goal:** Generate spoken audio from script text in the target language.

### 4.1 TTS function for pipeline

Reuse `generateTTSGemini()` from `17c-create-pipeline.js` but handle long scripts by chunking.

```javascript
async function pipelineGenerateTTS(job) {
  // Combine all scene texts into full script
  const fullScript = job.scenes.map(s => s.sceneText).join(' ');

  // Gemini TTS has input length limits — chunk if needed
  const maxChunkBytes = 3000;
  const chunks = chunkTextForTTS(fullScript, maxChunkBytes, job.language);

  const voiceName = 'Kore'; // Gemini TTS voice (supports all languages)
  const audioBuffers = [];

  for (const chunk of chunks) {
    const { base64, mimeType } = await generateTTSGemini(chunk, voiceName, pipelineApiKey);
    const { audioBuffer } = await decodeBase64Audio(base64, mimeType);
    audioBuffers.push(audioBuffer);
  }

  // Concatenate if multiple chunks
  if (audioBuffers.length === 1) {
    job.audioBuffer = audioBuffers[0];
  } else {
    job.audioBuffer = concatenateAudioBuffers(audioBuffers);
  }

  job.duration = job.audioBuffer.duration;
  trackCost('ttsPerLang', 1);
}

function chunkTextForTTS(text, maxBytes, language) {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return [text];

  // Split by sentences
  const sentences = text.split(/(?<=[.!?।\n])\s*/).filter(s => s.trim());
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    const test = current ? current + ' ' + sentence : sentence;
    if (encoder.encode(test).length > maxBytes && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = test;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function concatenateAudioBuffers(buffers) {
  const ctx = ensureAudioCtx();
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
  const sampleRate = buffers[0].sampleRate;
  const channels = buffers[0].numberOfChannels;
  const output = ctx.createBuffer(channels, totalLength, sampleRate);

  let offset = 0;
  for (const buf of buffers) {
    for (let ch = 0; ch < channels; ch++) {
      output.getChannelData(ch).set(buf.getChannelData(ch), offset);
    }
    offset += buf.length;
  }
  return output;
}
```

### 4.2 Verification

- [ ] Short script (150 words) → single TTS call, returns AudioBuffer
- [ ] Long script (500+ words) → chunked, concatenated correctly
- [ ] Tamil text → Tamil audio (verify by playback)
- [ ] Hindi text → Hindi audio
- [ ] English text → English audio
- [ ] Duration matches expected ~60 seconds
- [ ] AudioBuffer stored on job correctly

---

## Phase 5: Scene Breakdown + Word Timings

**Goal:** Distribute timing across scenes based on audio duration. Generate word-level timings for subtitles.

### 5.1 Scene timing distribution

After TTS generates audio, we know the exact duration. Now distribute it proportionally across scenes.

```javascript
function pipelineDistributeSceneTimings(job) {
  const scenes = job.scenes;
  const totalDur = job.audioBuffer.duration;

  // Calculate proportional duration based on text length
  const totalChars = scenes.reduce((sum, s) => sum + (s.sceneText || '').length, 0);
  let elapsed = 0;

  for (let i = 0; i < scenes.length; i++) {
    const charRatio = (scenes[i].sceneText || '').length / totalChars;
    let dur = charRatio * totalDur;
    dur = Math.max(2, Math.min(15, dur)); // 2s minimum, 15s maximum

    scenes[i].startTime = elapsed;
    scenes[i].endTime = elapsed + dur;
    scenes[i].duration = dur;
    elapsed += dur;
  }

  // Adjust last scene to fill remaining time exactly
  scenes[scenes.length - 1].endTime = totalDur;
  scenes[scenes.length - 1].duration = totalDur - scenes[scenes.length - 1].startTime;

  // Generate word-level timings per scene for subtitles
  for (const scene of scenes) {
    scene.words = generateWordTimings(scene.sceneText, scene.startTime, scene.duration);
  }

  // Flatten words for reel editor compatibility
  job.words = scenes.flatMap(s => s.words);
}

function generateWordTimings(text, startTime, duration) {
  if (!text) return [];
  const words = text.split(/\s+/).filter(w => w);
  if (words.length === 0) return [];

  const durPerWord = duration / words.length;
  return words.map((word, i) => ({
    word,
    start: startTime + i * durPerWord,
    end: startTime + (i + 1) * durPerWord,
  }));
}
```

### 5.2 Set scene status to pending for image generation

```javascript
function pipelinePrepareScenes(job) {
  for (const scene of job.scenes) {
    scene.prompt = scene.sceneDescription;   // use English description for image gen
    scene.imgDataUrl = null;
    scene.status = 'pending';
    scene._img = null;
  }
}
```

### 5.3 Verification

- [ ] 7 scenes with 60s audio → each scene gets ~8.5s
- [ ] Longer text scenes get proportionally more time
- [ ] No scene shorter than 2s or longer than 15s
- [ ] Last scene ends exactly at audio duration
- [ ] Word timings cover full scene duration without gaps
- [ ] job.words is flat array compatible with reel editor

---

## Phase 6: Image Generation

**Goal:** Generate illustrations for all scenes. Routes to grid mode (4+ scenes) or individual (1-3 scenes).

### 6.1 Image generation wrapper

```javascript
async function pipelineGenerateImages(job, updateFn) {
  const scenes = job.scenes;
  const pendingScenes = scenes.filter(s => s.status === 'pending');
  if (pendingScenes.length === 0) return;

  // Determine effective style
  const styleName = job.style === 'auto' ? (job.autoDetectedStyle?.name || 'cinematic') : job.style;
  const stylePrompt = STYLE_PRESETS[styleName] || STYLE_PRESETS['cinematic'];

  if (pendingScenes.length >= 4) {
    // Grid mode — reuse existing generateGridImage()
    await pipelineGridGenerate(job, pendingScenes, stylePrompt, updateFn);
  } else {
    // Individual mode
    for (let i = 0; i < pendingScenes.length; i++) {
      const scene = pendingScenes[i];
      scene.status = 'generating';
      if (updateFn) updateFn(job, i, pendingScenes.length);

      const prompt = `Style: ${stylePrompt}. Scene: ${scene.prompt}. Do NOT include any text, words, or letters in the image.`;
      const platform = REEL_PLATFORMS[job.platform];
      const { dataUrl } = await generateImageGeminiFlash(prompt, pipelineApiKey, {
        width: platform.width,
        height: platform.height,
      });
      scene.imgDataUrl = dataUrl;
      scene.status = 'done';
      trackCost('imageGenFast', 1);
    }
  }
}
```

### 6.2 Grid generation wrapper

```javascript
async function pipelineGridGenerate(job, pendingScenes, stylePrompt, updateFn) {
  if (updateFn) updateFn(job, 0, pendingScenes.length, 'Generating grid...');

  const prompts = pendingScenes.map(s => s.prompt);
  const gridDataUrl = await generateGridImage(prompts, pipelineApiKey, stylePrompt);

  if (!gridDataUrl) {
    // Fallback to individual if grid fails
    for (let i = 0; i < pendingScenes.length; i++) {
      pendingScenes[i].status = 'generating';
      if (updateFn) updateFn(job, i, pendingScenes.length);
      const prompt = `Style: ${stylePrompt}. Scene: ${pendingScenes[i].prompt}. Do NOT include any text, words, or letters.`;
      const platform = REEL_PLATFORMS[job.platform];
      const { dataUrl } = await generateImageGeminiFlash(prompt, pipelineApiKey, {
        width: platform.width, height: platform.height,
      });
      pendingScenes[i].imgDataUrl = dataUrl;
      pendingScenes[i].status = 'done';
      trackCost('imageGenFast', 1);
    }
    return;
  }

  // Crop grid cells
  const rows = 3, cols = 3;
  const cells = await cropGridCells(gridDataUrl, rows, cols, pendingScenes.length);
  const platform = REEL_PLATFORMS[job.platform];

  for (let i = 0; i < pendingScenes.length; i++) {
    // Upscale each cell to platform dimensions
    pendingScenes[i].imgDataUrl = await browserUpscale(cells[i], platform.width, platform.height);
    pendingScenes[i].status = 'done';
    if (updateFn) updateFn(job, i + 1, pendingScenes.length);
  }

  trackCost('gridGen2K', 1);
}
```

### 6.3 Verification

- [ ] 7 scenes → grid mode triggers, single API call
- [ ] 3 scenes → individual mode, 3 API calls
- [ ] Grid failure → falls back to individual
- [ ] All scenes get imgDataUrl after generation
- [ ] Images are correct aspect ratio for platform (1080x1920 for YouTube/Instagram)
- [ ] Style applied correctly (check visual output)
- [ ] Cost tracked correctly (grid vs individual)
- [ ] Progress callback fires for UI updates

---

## Phase 7: Execution Engine

**Goal:** Run jobs in parallel or sequential with pause/resume, error handling, retry, and progress tracking.

### 7.1 Pipeline controls UI

Add to `#pipeline-controls`:

```html
<div class="form-row" id="pipeline-controls">
  <button id="btn-pipeline-run-all" class="primary btn-md">Run All</button>
  <button id="btn-pipeline-run-selected" class="btn-sm">Run Selected</button>
  <button id="btn-pipeline-pause" class="btn-sm" style="display:none;">Pause</button>
  <button id="btn-pipeline-resume" class="btn-sm primary" style="display:none;">Resume</button>

  <label class="text-xs" style="margin-left:12px;">
    <input type="radio" name="pipeline-mode" value="parallel" checked> Parallel (3 at a time)
  </label>
  <label class="text-xs">
    <input type="radio" name="pipeline-mode" value="sequential"> Sequential
  </label>

  <span id="pipeline-queue-status" class="text-xs text-muted" style="margin-left:auto;"></span>
</div>
```

### 7.2 PipelineEngine class

```javascript
class PipelineEngine {
  constructor() {
    this.maxParallel = 3;
    this.running = new Set();
    this.paused = false;
    this.mode = 'parallel';
  }

  async runJobs(jobs) {
    this.paused = false;
    showPipelineProgress(true);

    if (this.mode === 'sequential') {
      for (const job of jobs) {
        if (this.paused) break;
        await this.executeJob(job);
      }
    } else {
      await this.runParallel(jobs);
    }

    showPipelineProgress(false);
    updatePipelineQueueStatus();
  }

  async runParallel(jobs) {
    const queue = [...jobs];
    const executing = new Set();

    const runNext = async () => {
      while (!this.paused && queue.length > 0 && executing.size < this.maxParallel) {
        const job = queue.shift();
        const p = this.executeJob(job).finally(() => {
          executing.delete(p);
          if (!this.paused) runNext(); // fill slot
        });
        executing.add(p);
        await sleep(500); // stagger API calls
      }
    };

    await runNext();
    // Wait for all in-flight to finish
    while (executing.size > 0) {
      await Promise.race([...executing]);
    }
  }

  async executeJob(job) {
    this.running.add(job.id);
    try {
      // Step 1: Script generation (Gemini 2.5 Pro)
      if (job.inputMode === 'topic' && !job.generatedScript) {
        job.status = 'generating-script';
        updateJobCard(job);
        const result = await pipelineGenerateScript(job);
        job.generatedScript = result.scenes;
        job.scenes = result.scenes;
        job.autoDetectedStyle = result.style;
        if (job.style === 'auto') job.style = result.style.name;
        trackCost('textGeneration', 1); // Pro cost tracked separately
      } else if (job.inputMode === 'script' && !job.generatedScript) {
        job.status = 'generating-script';
        updateJobCard(job);
        const result = await pipelineBreakScript(job);
        job.generatedScript = result.scenes;
        job.scenes = result.scenes;
        job.autoDetectedStyle = result.style;
        if (job.style === 'auto') job.style = result.style.name;
      }

      if (this.paused) { job.status = 'paused'; updateJobCard(job); return; }

      // Step 2: TTS audio
      job.status = 'generating-audio';
      updateJobCard(job);
      await pipelineGenerateTTS(job);

      if (this.paused) { job.status = 'paused'; updateJobCard(job); return; }

      // Step 3: Scene timing + word timings
      job.status = 'transcribing';
      updateJobCard(job);
      pipelineDistributeSceneTimings(job);
      pipelinePrepareScenes(job);

      if (this.paused) { job.status = 'paused'; updateJobCard(job); return; }

      // Step 4: Image generation
      job.status = 'generating-images';
      updateJobCard(job);
      await pipelineGenerateImages(job, (j, current, total, msg) => {
        updateJobProgress(j, current / total, msg || `Image ${current}/${total}`);
      });

      // Step 5: Assembly
      job.status = 'assembling';
      updateJobCard(job);
      job.thumbnailDataUrl = job.scenes.find(s => s.imgDataUrl)?.imgDataUrl || null;
      job.cost = calculatePipelineJobCost(job);

      // Done
      job.status = 'done';
      job.completedAt = Date.now();
      updateJobCard(job);

    } catch (err) {
      job.status = 'error';
      job.error = err.message || String(err);
      updateJobCard(job);
      console.error(`Pipeline job ${job.id} failed:`, err);
    } finally {
      this.running.delete(job.id);
      updatePipelineProgress();
      updatePipelineQueueStatus();
    }
  }

  pause() {
    this.paused = true;
    // Mark running jobs as paused
    for (const job of pipelineJobs) {
      if (!['pending','done','error'].includes(job.status)) {
        job.status = 'paused';
        updateJobCard(job);
      }
    }
  }

  resume() {
    this.paused = false;
    const pausedJobs = pipelineJobs.filter(j => j.status === 'paused');
    // Reset paused to pending
    for (const j of pausedJobs) { j.status = 'pending'; updateJobCard(j); }
    this.runJobs(pausedJobs);
  }
}
```

### 7.3 UI update functions

```javascript
function updateJobCard(job) {
  const card = document.querySelector(`.pipeline-job-card[data-job-id="${job.id}"]`);
  if (!card) return;

  card.dataset.status = job.status;
  card.querySelector('.pipeline-job-status').innerHTML = statusIcon(job.status);

  // Show/hide sections based on status
  const resultEl = card.querySelector('.pipeline-job-result');
  const errorEl = card.querySelector('.pipeline-job-error');
  const editBtn = card.querySelector('.btn-pipeline-job-edit');
  const exportBtn = card.querySelector('.btn-pipeline-job-export');
  const runBtn = card.querySelector('.btn-pipeline-job-run');
  const progressEl = card.querySelector('.pipeline-job-progress');

  if (job.status === 'done') {
    resultEl.style.display = '';
    const thumb = card.querySelector('.pipeline-job-thumb');
    if (job.thumbnailDataUrl) thumb.src = job.thumbnailDataUrl;
    card.querySelector('.pipeline-job-stats').textContent =
      `${job.scenes.length} scenes | ${Math.round(job.duration)}s | $${job.cost.toFixed(3)}`;
    if (job.autoDetectedStyle) {
      card.querySelector('.pipeline-job-style-info').textContent =
        `Style: ${job.autoDetectedStyle.name} — ${job.autoDetectedStyle.reason}`;
    }
    editBtn.style.display = '';
    exportBtn.style.display = '';
    runBtn.style.display = 'none';
    progressEl.style.display = 'none';
  } else if (job.status === 'error') {
    errorEl.style.display = '';
    errorEl.textContent = job.error || 'Unknown error';
    runBtn.textContent = 'Retry';
    runBtn.style.display = '';
    progressEl.style.display = 'none';
  } else if (['generating-script','generating-audio','transcribing','generating-images','assembling'].includes(job.status)) {
    progressEl.style.display = '';
    runBtn.style.display = 'none';
  }
}

function updateJobProgress(job, fraction, label) {
  const card = document.querySelector(`.pipeline-job-card[data-job-id="${job.id}"]`);
  if (!card) return;
  const bar = card.querySelector('.pipeline-job-progress .bar-fill');
  const text = card.querySelector('.pipeline-job-progress span');
  if (bar) bar.style.width = (fraction * 100).toFixed(1) + '%';
  if (text) text.textContent = label || '';
}

function updatePipelineProgress() {
  const total = pipelineJobs.length;
  const done = pipelineJobs.filter(j => j.status === 'done').length;
  const bar = $('pipeline-progress-bar');
  const label = $('pipeline-progress-label');
  if (bar) bar.style.width = total > 0 ? ((done / total) * 100).toFixed(1) + '%' : '0%';
  if (label) label.textContent = `${done}/${total} complete`;
}

function showPipelineProgress(show) {
  $('pipeline-progress')?.classList.toggle('hidden', !show);
  $('btn-pipeline-pause').style.display = show ? '' : 'none';
  $('btn-pipeline-resume').style.display = 'none';
}
```

### 7.4 Wire control buttons

```javascript
// Initialize engine
pipelineEngine = new PipelineEngine();

$('btn-pipeline-run-all')?.addEventListener('click', () => {
  pipelineEngine.mode = document.querySelector('input[name="pipeline-mode"]:checked')?.value || 'parallel';
  const pending = pipelineJobs.filter(j => j.status === 'pending' || j.status === 'error');
  if (pending.length === 0) return;
  // Reset errored jobs to pending
  pending.forEach(j => { if (j.status === 'error') { j.status = 'pending'; j.error = null; } });
  pipelineEngine.runJobs(pending);
});

$('btn-pipeline-run-selected')?.addEventListener('click', () => {
  pipelineEngine.mode = document.querySelector('input[name="pipeline-mode"]:checked')?.value || 'parallel';
  const selected = getSelectedJobs().filter(j => j.status === 'pending' || j.status === 'error');
  if (selected.length === 0) return;
  selected.forEach(j => { if (j.status === 'error') { j.status = 'pending'; j.error = null; } });
  pipelineEngine.runJobs(selected);
});

$('btn-pipeline-pause')?.addEventListener('click', () => {
  pipelineEngine.pause();
  $('btn-pipeline-pause').style.display = 'none';
  $('btn-pipeline-resume').style.display = '';
});

$('btn-pipeline-resume')?.addEventListener('click', () => {
  $('btn-pipeline-resume').style.display = 'none';
  $('btn-pipeline-pause').style.display = '';
  pipelineEngine.resume();
});

// Wire individual run buttons (event delegation)
$('pipeline-job-grid')?.addEventListener('click', (e) => {
  const runBtn = e.target.closest('.btn-pipeline-job-run');
  if (!runBtn) return;
  const card = runBtn.closest('.pipeline-job-card');
  const jobId = card?.dataset.jobId;
  const job = pipelineJobs.find(j => j.id === jobId);
  if (!job) return;
  if (job.status === 'error') { job.status = 'pending'; job.error = null; }
  pipelineEngine.mode = 'sequential';
  pipelineEngine.runJobs([job]);
});

function getSelectedJobs() {
  const ids = [];
  document.querySelectorAll('.pipeline-job-select:checked').forEach(cb => {
    const card = cb.closest('.pipeline-job-card');
    if (card) ids.push(card.dataset.jobId);
  });
  return pipelineJobs.filter(j => ids.includes(j.id));
}
```

### 7.5 Cost calculation

```javascript
function calculatePipelineJobCost(job) {
  let cost = 0;
  // Script generation (Pro)
  if (job.inputMode === 'topic' || job.inputMode === 'script') cost += 0.015;
  // TTS
  cost += 0.01;
  // Images
  if (job.scenes.length >= 4) {
    cost += 0.134; // grid
  } else {
    cost += job.scenes.length * 0.039;
  }
  return cost;
}
```

### 7.6 Verification

- [ ] "Run All" with 5 pending jobs → 3 run in parallel, 2 wait
- [ ] Sequential mode → jobs run one at a time
- [ ] Pause → all running jobs stop and show "Paused"
- [ ] Resume → paused jobs continue from where they stopped
- [ ] Error in one job → doesn't stop other jobs
- [ ] "Retry" button on failed job → reruns it
- [ ] "Run Selected" → only checked jobs run
- [ ] Individual "Run" button → runs single job
- [ ] Progress bar updates per job and overall
- [ ] Job cards transition through all status states
- [ ] Cost calculated and displayed per job

---

## Phase 8: Preview + Reel Editor Bridge

**Goal:** Preview completed jobs. "Edit in Reel" opens the job in the existing reel editor with all data pre-loaded.

### 8.1 Preview (inline thumbnail + play)

Completed jobs show a thumbnail from the first scene. Clicking "Preview" could play audio with scene images cycling — but for MVP, just show the thumbnail and scene count.

The real preview happens in the reel editor.

### 8.2 Open in Reel Editor

```javascript
function openPipelineJobInReelEditor(job) {
  if (job.status !== 'done') return;

  // Navigate to reel page
  navigateTo('reel');

  // Set text mode (pipeline generates from text)
  if (typeof setReelInputMode === 'function') setReelInputMode('text');

  // Set the full script in text input
  const textInput = $('reel-text-input');
  if (textInput) textInput.value = job.scenes.map(s => s.sceneText).join('\n\n');

  // Set presets
  const styleSelect = $('reel-style');
  if (styleSelect) styleSelect.value = job.style;
  const platformSelect = $('reel-platform');
  if (platformSelect) platformSelect.value = job.platform;
  const transSelect = $('reel-transition');
  if (transSelect) transSelect.value = job.transition;

  // Load pre-generated audio
  reelAudioBuffer = job.audioBuffer;

  // Load scenes with images and timings
  reelScenes = job.scenes.map(s => ({
    prompt: s.prompt || s.sceneDescription,
    imgDataUrl: s.imgDataUrl,
    startTime: s.startTime,
    endTime: s.endTime,
    duration: s.duration || (s.endTime - s.startTime),
    text: s.sceneText,
    words: s.words || [],
    status: s.imgDataUrl ? 'done' : 'pending',
    transition: job.transition,
    transDur: REEL_TRANSITIONS[job.transition]?.transDur || 0.3,
    motion: REEL_TRANSITIONS[job.transition]?.motion || 'slow-zoom-in',
    _img: null,
  }));

  // Load word timings
  reelWords = job.words;

  // Build multi-results for reel preview
  window._reelMultiResults = [{
    audioBuffer: job.audioBuffer,
    audioLang: job.language,
    audioLangLabel: job.languageLabel,
    subtitleLang: job.language,
    subtitleLangLabel: job.languageLabel,
    scenes: reelScenes,
    words: reelWords,
    settings: {
      subtitleStyle: job.subtitleStyle,
      transition: job.transition,
      subColor: '#ffffff',
      subOutline: '#000000',
      subBackdrop: 'dark',
      subSize: 4,
      subPosition: 'bottom',
    },
  }];

  activeReelPreview = 0;

  // Show step 4 (preview & edit) — skip steps 1-3
  const stepEditor = $('reel-step-editor');
  if (stepEditor) stepEditor.classList.remove('hidden');

  // Render previews
  if (typeof renderAllReelPreviews === 'function') {
    renderAllReelPreviews();
  }
}
```

### 8.3 Wire "Edit in Reel" button

```javascript
$('pipeline-job-grid')?.addEventListener('click', (e) => {
  const editBtn = e.target.closest('.btn-pipeline-job-edit');
  if (!editBtn) return;
  const card = editBtn.closest('.pipeline-job-card');
  const job = pipelineJobs.find(j => j.id === card?.dataset.jobId);
  if (job) openPipelineJobInReelEditor(job);
});
```

### 8.4 Verification

- [ ] Click "Edit in Reel" → navigates to reel page
- [ ] Reel page shows pre-loaded scenes with images
- [ ] Audio plays correctly
- [ ] Subtitles sync with audio
- [ ] Transitions work between scenes
- [ ] Can adjust subtitle style, color, position in reel editor
- [ ] Can export from reel editor normally
- [ ] Back button returns to pipeline

---

## Phase 9: Export with Branding

**Goal:** Export completed jobs as MP4/WebM with watermark, intro text, and end card baked in.

### 9.1 Export controls UI

Populate `#pipeline-export-controls`:

```html
<div class="form-row">
  <button id="btn-pipeline-export-all" class="primary btn-md">Export All Completed</button>
  <button id="btn-pipeline-export-selected" class="btn-sm">Export Selected</button>
  <span id="pipeline-export-status" class="text-xs text-muted"></span>
</div>
```

### 9.2 Single job export function

Adapts `exportSingleReel()` from `20-reels-creator.js` with branding additions.

```javascript
async function exportPipelineJob(job) {
  const platform = REEL_PLATFORMS[job.platform];
  const canvas = document.createElement('canvas');
  canvas.width = platform.width;
  canvas.height = platform.height;
  const ctx = canvas.getContext('2d');
  const fps = 30;

  // Preload all scene images
  const images = [];
  for (const scene of job.scenes) {
    if (scene.imgDataUrl) {
      const img = new Image();
      img.src = scene.imgDataUrl;
      await new Promise(r => { img.onload = r; img.onerror = r; });
      images.push(img);
      scene._img = img;
    }
  }

  // Setup audio
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const source = audioCtx.createBufferSource();
  source.buffer = job.audioBuffer;
  source.connect(dest);

  // Total duration = audio + end card (5s)
  const endCardDur = job.endCard ? 5 : 0;
  const totalDur = job.audioBuffer.duration + endCardDur;

  // Capture stream
  const stream = canvas.captureStream(fps);
  const combined = new MediaStream([
    ...stream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  // Detect codec
  const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')
    ? 'video/mp4;codecs=avc1,mp4a.40.2'
    : 'video/webm;codecs=vp9,opus';
  const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

  const recorder = new MediaRecorder(combined, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve({ blob, ext });
    };
    recorder.onerror = reject;

    recorder.start();
    source.start();
    const t0 = performance.now();

    const timer = setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;

      // Black background
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, platform.width, platform.height);

      if (elapsed < job.audioBuffer.duration) {
        // ── MAIN CONTENT ──

        // Draw current scene image with transition
        drawReelSceneFrame(ctx, platform.width, platform.height, elapsed, job.scenes);

        // Draw subtitles
        if (job.subtitleStyle !== 'none' && job.words.length > 0) {
          renderReelSubtitle(ctx, platform.width, platform.height, elapsed, job.words, job.subtitleStyle);
        }

        // ── BRANDING: Intro text (first 2.5 seconds) ──
        if (job.introText && elapsed < 2.5) {
          const alpha = elapsed < 0.5 ? elapsed / 0.5  // fade in 0-0.5s
                      : elapsed > 2.0 ? (2.5 - elapsed) / 0.5  // fade out 2.0-2.5s
                      : 1.0;
          ctx.save();
          ctx.globalAlpha = alpha * 0.8;
          ctx.font = '500 28px Poppins, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 6;
          ctx.fillText('Made with Stori', platform.width / 2, platform.height * 0.92);
          ctx.restore();
        }

        // ── BRANDING: Watermark (entire duration) ──
        if (job.watermark) {
          ctx.save();
          ctx.globalAlpha = 0.4;
          ctx.font = '600 20px Poppins, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'right';
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 4;
          ctx.fillText('Stori', platform.width - 24, platform.height - 24);
          ctx.restore();
        }

      } else if (job.endCard && elapsed < totalDur) {
        // ── BRANDING: End card (last 5 seconds) ──
        const cardElapsed = elapsed - job.audioBuffer.duration;
        const fadeIn = Math.min(cardElapsed / 0.5, 1);

        // Blurred last scene as background (or solid gradient)
        ctx.fillStyle = '#0c0c14';
        ctx.fillRect(0, 0, platform.width, platform.height);

        ctx.save();
        ctx.globalAlpha = fadeIn;

        // "Made with Stori" — large
        ctx.font = '700 48px Poppins, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('Made with Stori', platform.width / 2, platform.height * 0.38);

        // Tagline
        ctx.font = '400 24px Poppins, sans-serif';
        ctx.fillStyle = '#b0b0c4';
        ctx.fillText('Record your voice → illustrated video', platform.width / 2, platform.height * 0.46);

        // CTA
        ctx.font = '600 32px Poppins, sans-serif';
        ctx.fillStyle = '#a078ff';
        ctx.fillText('Try free → stori.app', platform.width / 2, platform.height * 0.58);

        ctx.restore();
      }

      // Check if done
      if (elapsed >= totalDur) {
        clearInterval(timer);
        source.stop();
        recorder.stop();
        audioCtx.close();
      }
    }, 1000 / fps);
  });
}
```

### 9.3 Batch export

```javascript
async function exportAllPipelineJobs() {
  const completed = pipelineJobs.filter(j => j.status === 'done');
  if (completed.length === 0) return;

  const statusEl = $('pipeline-export-status');

  for (let i = 0; i < completed.length; i++) {
    const job = completed[i];
    if (statusEl) statusEl.textContent = `Exporting ${i + 1}/${completed.length}: ${job.languageLabel} — ${(job.topic || '').slice(0, 30)}...`;

    const { blob, ext } = await exportPipelineJob(job);

    // Auto-download with descriptive filename
    const lang = job.languageLabel.toLowerCase().replace(/\s+/g, '-');
    const topic = (job.topic || 'video').replace(/[^a-zA-Z0-9\u0B80-\u0BFF\u0900-\u097F]/g, '-').slice(0, 40);
    const filename = `${job.channel}-${lang}-${topic}.${ext}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);

    // Small delay between exports
    await sleep(1000);
  }

  if (statusEl) statusEl.textContent = `Exported ${completed.length} videos.`;
}

// Wire buttons
$('btn-pipeline-export-all')?.addEventListener('click', exportAllPipelineJobs);

$('btn-pipeline-export-selected')?.addEventListener('click', async () => {
  const selected = getSelectedJobs().filter(j => j.status === 'done');
  // Same logic as exportAllPipelineJobs but with selected subset
  // ... (extract to shared function)
});

// Individual export button
$('pipeline-job-grid')?.addEventListener('click', async (e) => {
  const exportBtn = e.target.closest('.btn-pipeline-job-export');
  if (!exportBtn) return;
  const card = exportBtn.closest('.pipeline-job-card');
  const job = pipelineJobs.find(j => j.id === card?.dataset.jobId);
  if (!job || job.status !== 'done') return;
  exportBtn.textContent = 'Exporting...';
  exportBtn.disabled = true;
  try {
    const { blob, ext } = await exportPipelineJob(job);
    const filename = `${job.channel}-${job.languageLabel.toLowerCase()}-${(job.topic||'').slice(0,30)}.${ext}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  } finally {
    exportBtn.textContent = 'Export';
    exportBtn.disabled = false;
  }
});
```

### 9.4 Verification

- [ ] Single job export → downloads MP4/WebM
- [ ] Watermark visible in bottom-right, semi-transparent, entire duration
- [ ] Intro text fades in at 0s, fades out by 2.5s
- [ ] End card appears after audio ends, lasts 5 seconds
- [ ] End card shows "Made with Stori", tagline, and CTA
- [ ] Subtitles render correctly during export
- [ ] Transitions render between scenes
- [ ] Audio syncs with video
- [ ] Batch export → downloads all completed with correct filenames
- [ ] Branding toggles respected (unchecked = not rendered)
- [ ] Export filename includes channel-language-topic

---

## Phase 10: Project Save/Load

**Goal:** Save entire pipeline state (all jobs, settings) to IndexedDB. Load and resume.

### 10.1 Serialize pipeline project

```javascript
async function savePipelineProject() {
  const name = prompt('Project name:', `Pipeline ${new Date().toLocaleDateString()}`);
  if (!name) return;

  const serializedJobs = [];
  for (const job of pipelineJobs) {
    const serialized = { ...job };
    // Serialize AudioBuffer to base64
    if (job.audioBuffer) {
      const blob = audioBufferToWavBlob(job.audioBuffer);
      serialized.audioBase64 = await blobToBase64(blob);
    }
    // Strip non-serializable fields
    delete serialized.audioBuffer;
    delete serialized.videoBlob;
    delete serialized.videoBlobUrl;
    // Strip cached Image objects from scenes
    if (serialized.scenes) {
      serialized.scenes = serialized.scenes.map(s => ({
        ...s,
        _img: undefined,
      }));
    }
    serializedJobs.push(serialized);
  }

  const project = {
    type: 'pipeline-project',
    version: 1,
    name,
    savedAt: new Date().toISOString(),
    jobs: serializedJobs,
  };

  // Save to IndexedDB gallery (reuse existing store)
  const jsonStr = JSON.stringify(project);
  const db = galleryDb || await openGalleryDb();
  const tx = db.transaction(GALLERY_STORE, 'readwrite');
  const meta = {
    id: 'pipeline-' + Date.now(),
    name,
    savedAt: project.savedAt,
    type: 'pipeline-project',
    projectJson: jsonStr,
    photoCount: serializedJobs.length,
    duration: 0,
    thumbnail: serializedJobs.find(j => j.thumbnailDataUrl)?.thumbnailDataUrl || '',
  };
  tx.objectStore(GALLERY_STORE).put(meta);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });

  alert(`Saved: ${name} (${serializedJobs.length} jobs)`);
}
```

### 10.2 Load pipeline project

```javascript
async function loadPipelineProject() {
  // Reuse existing file picker or gallery
  const input = $('pipeline-load-input');
  input.click();
}

$('pipeline-load-input')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  const text = await file.text();
  let project;
  try {
    project = JSON.parse(text);
  } catch (err) {
    alert('Invalid project file');
    return;
  }

  if (project.type !== 'pipeline-project') {
    alert('Not a pipeline project');
    return;
  }

  // Clear current jobs
  pipelineJobs = [];
  $('pipeline-job-grid').innerHTML = '';

  // Restore jobs
  for (const serialized of project.jobs) {
    // Restore AudioBuffer from base64
    if (serialized.audioBase64) {
      const ab = base64ToArrayBuffer(serialized.audioBase64);
      serialized.audioBuffer = await ensureAudioCtx().decodeAudioData(ab);
      delete serialized.audioBase64;
    }
    // Preload scene images
    if (serialized.scenes) {
      for (const scene of serialized.scenes) {
        if (scene.imgDataUrl) {
          scene._img = new Image();
          scene._img.src = scene.imgDataUrl;
        }
      }
    }
    pipelineJobs.push(serialized);
    renderPipelineJobCard(serialized);
  }

  updatePipelineQueueStatus();
  pipelineCurrentProject = project;
});
```

### 10.3 Wire save/load buttons

```javascript
$('btn-pipeline-save')?.addEventListener('click', savePipelineProject);
$('btn-pipeline-load')?.addEventListener('click', loadPipelineProject);
```

### 10.4 Also save as downloadable JSON file

```javascript
// Add "Download Project File" option
async function downloadPipelineProject() {
  // Same serialization as savePipelineProject
  // but download as .json instead of saving to IndexedDB
  const project = { ... };
  const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `pipeline-${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
}
```

### 10.5 Verification

- [ ] Save → stores to IndexedDB, confirms with alert
- [ ] Load from file → restores all jobs with correct status
- [ ] Completed jobs restore with images and audio
- [ ] Pending jobs restore and can be run
- [ ] Audio plays correctly after load (decoded from base64)
- [ ] Scene images display correctly after load
- [ ] Job cards render with correct status after load
- [ ] Large projects (20+ jobs) save/load without crashing

---

## Phase 11: Build Integration + Polish

**Goal:** Production build works. Edge cases handled. UI polish.

### 11.1 Add to index.html script loader

Add `<script src="js/21-marketing-pipeline.js"></script>` to index.html — either as a `<script>` tag or in the `var scripts = [...]` dynamic loader array.

build.js will auto-detect it and include it in `dist/index.html` as deferred (requestIdleCallback).

### 11.2 Run build and verify

```bash
node build.js
# Open dist/index.html in browser
# Verify pipeline page loads and works
```

### 11.3 Edge cases to handle

| Edge case | How to handle |
|---|---|
| No API key → user clicks Run | Show alert: "Set API key first" |
| Empty queue → Run All | No-op, show hint |
| All jobs already done → Run All | Skip, show "All jobs complete" |
| API rate limit (429) | Retry with exponential backoff (reuse existing retry logic) |
| Browser tab backgrounded during export | Timer worker keeps rendering (copy from reel export pattern) |
| Very long text input (10,000+ words) | Pro handles it — context window is large enough |
| Script with no sentence boundaries | Fall back to character-count based splitting |
| TTS returns unexpected duration | Redistribute scene timings to match actual duration |
| Grid image generation fails | Fall back to individual (already handled in Phase 6) |
| Job deleted while running | Check job still exists before updating UI |
| Browser storage full on save | Catch error, show alert |
| Reload page during execution | Jobs lost (expected — save first). Show warning before unload. |

### 11.4 Beforeunload warning

```javascript
window.addEventListener('beforeunload', (e) => {
  const running = pipelineJobs.some(j =>
    ['generating-script','generating-audio','transcribing','generating-images','assembling'].includes(j.status)
  );
  if (running) {
    e.preventDefault();
    e.returnValue = 'Pipeline jobs are still running. Are you sure?';
  }
});
```

### 11.5 Keyboard shortcuts

| Key | Action |
|---|---|
| Enter (in topic textarea) | Add job (if Shift not held) |
| Ctrl+A / Cmd+A | Select all jobs |
| Delete / Backspace | Delete selected jobs |

### 11.6 UI polish

- [ ] Empty state in job grid: "No jobs yet. Add a topic, paste a script, or import a CSV."
- [ ] Loading spinner on Run buttons while executing
- [ ] Disable Run All while jobs are running
- [ ] Smooth scroll to job grid after adding jobs
- [ ] Toast notification when all jobs complete
- [ ] Select all / deselect all checkbox in queue header
- [ ] Job count badge next to "Content Queue" header

### 11.7 Final verification checklist

- [ ] Full flow: Add 3 topic jobs (Tamil, Hindi, English) → Run All parallel → all 3 complete → Export All → 3 MP4 files download
- [ ] CSV import: 10 rows → 10 jobs created → Run All → all complete
- [ ] Auto style: different stories get different styles
- [ ] Edit in Reel: opens correctly, can adjust and re-export
- [ ] Save/Load: save project, reload page, load project, resume
- [ ] Error recovery: one job fails, others continue, retry works
- [ ] Branding: watermark, intro text, end card all render in exported video
- [ ] Production build: `node build.js` succeeds, dist/index.html works
