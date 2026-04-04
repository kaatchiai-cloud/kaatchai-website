# Marketing Pipeline Workbench — Implementation Plan

## Overview

An internal batch content production tool built into Stori that enables creating 40+ videos/week across multiple languages and channels for Stori's marketing channels. Reuses the existing reel creator's architecture (transcription, image generation, TTS, export) but wraps it in a queue-based execution engine.

**This is an internal tool** — no free/paid tier distinction. All settings are pre-configured with sensible defaults but fully editable per job.

**Primary file:** `js/21-marketing-pipeline.js`
**HTML section:** New `#pipeline-page` div in `index.html`
**Navigation:** New button on landing page: "Marketing Pipeline"

---

## Architecture

### Core Concept

The pipeline is a **job queue**. Each job is a self-contained reel creation task with all inputs pre-configured. Jobs can run in parallel (limited by API rate limits) or sequential. Results open in the existing reel editor.

```
┌─────────────────────────────────────────────────┐
│  PIPELINE WORKBENCH                              │
│                                                  │
│  [API Key: ●●●●●●●●●●●●●●]                     │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  PROJECT: "Week 14 — Tamil + Hindi"         │ │
│  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐   │ │
│  │  │ Job 1 │ │ Job 2 │ │ Job 3 │ │ Job 4 │   │ │
│  │  │Tamil  │ │Tamil  │ │Hindi  │ │Hindi  │   │ │
│  │  │Murugan│ │Sangam │ │Pancha.│ │Vikram │   │ │
│  │  │✅ Done│ │⏳ Run │ │⏳ Wait│ │📝 New │   │ │
│  │  └───────┘ └───────┘ └───────┘ └───────┘   │ │
│  │                                              │ │
│  │  [▶ Run All] [▶ Run Selected] [⏸ Pause]    │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  + Add Job  |  📄 Import CSV  |  💾 Save Project │
└─────────────────────────────────────────────────┘
```

### Data Flow

```
INPUT (3 modes)
├── Text Script → stored as job.script
├── Topic Prompt → AI generates script → stored as job.script
└── CSV Import → creates N jobs, each with topic or script

EXECUTION (per job)
├── Step 1: Script Generation (if topic/long-text input)
│   └── Gemini 2.5 Pro → generate/condense script + auto-detect style
├── Step 2: Scene Breakdown
│   └── Gemini 2.5 Flash → split script into 6-9 scenes with descriptions
├── Step 3: TTS Audio
│   └── Gemini TTS → generate audio from script in target language
├── Step 4: Image Generation
│   └── Grid mode (4+ scenes) or individual ��� generate illustrations
├── Step 5: Assembly
│   └─��� Combine: audio + images + subtitles + transitions + branding
└── Step 6: Export
    └── Canvas + MediaRecorder → MP4/WebM with "Made with Stori" branding

OUTPUT
├── Preview in pipeline (thumbnail + play button)
├── Click to open in reel editor for polish
└── Batch export all completed jobs
```

---

## Job Data Structure

```javascript
// A single pipeline job
{
  id: 'job-1711720000-001',        // unique ID
  status: 'pending',               // pending | generating-script | transcribing | generating-images | generating-audio | assembling | done | error | paused

  // Input (one of these is set based on input mode)
  inputMode: 'topic',              // 'topic' | 'script' | 'csv-row'
  topic: 'Murugan slays Surapadman',  // topic prompt (if inputMode=topic)
  script: '',                      // text script (if inputMode=script, or after topic→script generation)

  // Channel & Language Config (from presets)
  channel: 'stori-india',          // 'stori' | 'stori-india' | 'stori-global'
  language: 'ta',                  // language code
  languageLabel: 'Tamil',

  // Visual Config (from channel presets, but user-editable per job)
  style: 'auto',                   // 'auto' = AI picks based on story content, or any preset name
  autoDetectedStyle: null,         // populated by AI after script generation: {style, reason}
  platform: 'youtube',             // 'instagram' | 'youtube' | 'tiktok'
  transition: 'whip-pan',          // transition preset
  subtitleStyle: 'highlight',      // subtitle style

  // Branding Config (always on for marketing, but toggleable)
  watermark: true,                 // "Made with Stori" corner watermark
  introText: true,                 // "Made with Stori" fade-in intro
  endCard: true,                   // 5-second end card with CTA

  // Generated Data (populated during execution)
  generatedScript: null,           // AI-generated script (if topic mode)
  scenes: [],                      // [{prompt, imgDataUrl, status, startTime, endTime, words}]
  audioBuffer: null,               // decoded AudioBuffer
  audioBase64: null,               // for save/load
  words: [],                       // [{word, start, end}] for subtitles

  // Output
  videoBlob: null,                 // exported video blob
  videoBlobUrl: null,              // blob URL for preview
  thumbnailDataUrl: null,          // first scene as thumbnail
  duration: 0,                     // total duration in seconds

  // Metadata
  cost: 0,                         // estimated API cost
  error: null,                     // error message if failed
  createdAt: Date.now(),
  completedAt: null,
}
```

---

## Channel Presets

Pre-configured settings per channel + language. When a user selects a channel and language, all settings auto-populate — but **every setting is editable per job**.

```javascript
const CHANNEL_PRESETS = {
  'stori': {
    label: 'Stori (English)',
    platform: 'youtube',
    languages: ['en'],
    defaultStyle: 'auto',           // AI picks style based on story content
    defaultTransition: 'crossfade',
    subtitleStyle: 'highlight',
    contentType: 'explainer',       // affects script generation prompt
    branding: { watermark: true, introText: true, endCard: true },
  },

  'stori-india': {
    label: 'Stori India',
    platform: 'youtube',
    languages: ['ta', 'hi', 'te', 'ml', 'bn', 'kn', 'mr', 'pa', 'gu'],
    defaultStyle: 'auto',           // AI picks style based on story content
    defaultTransition: 'whip-pan',
    subtitleStyle: 'highlight',
    contentType: 'mythology',       // affects script generation prompt
    branding: { watermark: true, introText: true, endCard: true },
  },

  'stori-global': {
    label: 'Stori Global',
    platform: 'youtube',
    languages: ['id', 'fil', 'ar', 'pt-BR', 'yo'],
    defaultStyle: 'auto',           // AI picks style based on story content
    defaultTransition: 'crossfade',
    subtitleStyle: 'highlight',
    contentType: 'folk-tale',
    branding: { watermark: true, introText: true, endCard: true },
  },
};

// Language metadata — extends existing REEL_LANG_OPTIONS
const PIPELINE_LANGUAGES = {
  'ta': { label: 'Tamil', flag: '🇮🇳', voice: 'ta-IN-Standard-A', geminiVoice: 'Kore', font: 'Catamaran' },
  'hi': { label: 'Hindi', flag: '🇮🇳', voice: 'hi-IN-Standard-A', geminiVoice: 'Kore', font: 'Mukta' },
  'te': { label: 'Telugu', flag: '🇮🇳', voice: 'te-IN-Standard-A', geminiVoice: 'Kore', font: 'Mandali' },
  'ml': { label: 'Malayalam', flag: '🇮🇳', voice: 'ml-IN-Standard-A', geminiVoice: 'Kore', font: 'Manjari' },
  'bn': { label: 'Bengali', flag: '🇮🇳', voice: 'bn-IN-Standard-A', geminiVoice: 'Kore', font: 'Hind Siliguri' },
  'kn': { label: 'Kannada', flag: '🇮🇳', voice: 'kn-IN-Standard-A', geminiVoice: 'Kore', font: 'Noto Sans Kannada' },
  'mr': { label: 'Marathi', flag: '🇮🇳', voice: 'mr-IN-Standard-A', geminiVoice: 'Kore', font: 'Mukta' },
  'pa': { label: 'Punjabi', flag: '🇮🇳', voice: 'pa-IN-Standard-A', geminiVoice: 'Kore', font: 'Mukta Mahee' },
  'gu': { label: 'Gujarati', flag: '🇮🇳', voice: 'gu-IN-Standard-A', geminiVoice: 'Kore', font: 'Mukta Vaani' },
  'en': { label: 'English', flag: '🇺🇸', voice: 'en-US-Standard-D', geminiVoice: 'Kore', font: 'Poppins' },
  'id': { label: 'Indonesian', flag: '🇮🇩', voice: 'id-ID-Standard-A', geminiVoice: 'Kore', font: 'Poppins' },
  'fil': { label: 'Filipino', flag: '🇵🇭', voice: 'fil-PH-Standard-A', geminiVoice: 'Kore', font: 'Poppins' },
  'ar': { label: 'Arabic', flag: '🇸🇦', voice: 'ar-XA-Standard-A', geminiVoice: 'Kore', font: 'Noto Sans Arabic' },
  'pt-BR': { label: 'Portuguese (BR)', flag: '🇧🇷', voice: 'pt-BR-Standard-A', geminiVoice: 'Kore', font: 'Poppins' },
  'yo': { label: 'Yoruba', flag: '🇳🇬', voice: 'yo-NG-Standard-A', geminiVoice: 'Kore', font: 'Poppins' },
};
```

---

## Three Input Modes

### 1. Topic Prompt / Long Text

User types a short topic ("Murugan slays Surapadman") OR pastes a long text (Wikipedia article, book chapter, any reference material). Both go through the same flow:

1. Sends to **Gemini 2.5 Pro** — generates/condenses into a 1-minute script + auto-detects visual style
2. Receives: full script in the target language + recommended art style with reasoning
3. Proceeds to scene breakdown → TTS → images → export

**Why Gemini 2.5 Pro (not Flash) for this step:**
- Script quality IS content quality — this is the step that determines whether the video is good or forgettable
- Condensing long text into 60 seconds requires high-judgment decisions about what to keep/cut
- Cultural nuance in Tamil/Hindi/Telugu mythology requires stronger reasoning
- Cost difference: ~$3/month at full scale — irrelevant

```javascript
async function generateScriptFromInput(input, language, contentType) {
  const prompt = buildScriptPrompt(input, language, contentType);
  // Use Pro for creative writing — the only step that uses Pro
  const result = await callGeminiAPI(['gemini-2.5-pro'], {
    contents: [{ parts: [{ text: prompt }] }]
  }, apiKey);
  return parseGeminiJson(result.candidates[0].content.parts[0].text);
  // Returns: { scenes: [...], style: { name, reason } }
}
```

**Script generation prompt — handles both short topic and long text:**
```
You are a storyteller creating content for a YouTube channel about {contentType}.

INPUT:
"{input}"

If the input is a short topic (1-2 sentences): Research the subject and create an original script.
If the input is a long text (article, chapter, reference material): Condense into the most
compelling 60-second narrative, preserving the dramatic arc and key visual moments.

TASK 1 — SCRIPT:
Write a {language} script that fits within 60 seconds when read aloud (~150-180 words).

Requirements:
- Write ENTIRELY in {language} (not English, unless language IS English)
- Vivid, descriptive narration that paints visual scenes
- 6-9 natural scene breaks (each scene = one illustration)
- No dialogue tags — pure narration
- Cultural authenticity — use proper names, places, terms from the tradition
- Emotional arc — beginning, tension, resolution
- Keep it to 60 seconds. Ruthlessly cut anything that doesn't serve the story.

TASK 2 — VISUAL STYLE:
Based on the story's content, emotional tone, and cultural context, recommend the best
visual art style from this list:
[watercolor, cinematic, anime, oil-painting, digital-art, minimalist, photorealistic,
 comic, pixel-art, 3d-render, sketch, vintage, flat-design, gothic, pastel, ukiyo-e,
 stained-glass, pop-art, noir, surrealism]

Consider:
- Cultural context (Indian mythology may suit watercolor or oil-painting)
- Emotional tone (epic battle → cinematic; gentle folk tale → watercolor or pastel)
- Visual distinctiveness (each video should feel unique, not templated)
- Audience appeal (what would make a viewer stop scrolling?)

Output as JSON:
{
  "scenes": [
    {
      "sceneText": "The narration text for this scene in {language}",
      "sceneDescription": "Visual description in English for image generation:
                           subject, composition, mood, colors, lighting"
    },
    ...
  ],
  "style": {
    "name": "cinematic",
    "reason": "Epic battle between Murugan and Surapadman demands dramatic lighting
               and dynamic composition"
  }
}
```

**The auto-detected style flows through the pipeline:**
1. Pro returns `{ scenes, style }` in one call
2. `job.autoDetectedStyle = style` — stored for display
3. If `job.style === 'auto'`, uses `style.name` for image generation
4. If user overrode style to a specific preset, uses that instead
5. Job card shows: "Style: cinematic (AI: epic battle demands dramatic lighting)"

### 2. Text Script

User pastes a full script. The pipeline:
1. Sends to Gemini for scene breakdown (reuses existing reel transcription logic)
2. Generates TTS audio from the script
3. Generates images from scene descriptions
4. Assembles and exports

```javascript
// Reuse from 20-reels-creator.js — the text mode flow
// Input: job.script (string)
// Step 1: Generate TTS → audioBuffer
// Step 2: Transcribe/segment the script → scenes with timing
// Step 3: Generate images per scene
// Step 4: Assemble
```

### 3. CSV Import

User uploads a CSV file. Each row becomes a job.

**CSV format:**
```csv
channel,language,topic,style,platform
stori-india,ta,Murugan slays Surapadman,auto,youtube
stori-india,ta,Kannagi's anklet — Silappatikaram,auto,youtube
stori-india,hi,Vikram aur Betaal — The first question,auto,youtube
stori-india,hi,Panchatantra — The monkey and the crocodile,auto,youtube
stori,en,How volcanoes form — explained in 60 seconds,auto,youtube
stori-india,ta,"[long text pasted here — entire article about Thirukkural]",auto,youtube
```

**Column notes:**
- `topic` — short topic OR long text (quoted if contains commas). AI handles both.
- `style` — `auto` (AI picks) or any preset name to override (e.g., `watercolor`, `cinematic`)
- All columns except `channel`, `language`, `topic` are optional — defaults from channel preset

**Optional columns (use channel preset defaults if omitted):**
- `script` — full script text (if provided, skips topic→script generation, but style auto-detection still runs)
- `style` — `auto` or specific preset name
- `platform` — overrides channel default
- `transition` — overrides channel default

```javascript
function parseCSV(csvText) {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseCSVLine(line); // handle quoted commas
    const row = {};
    headers.forEach((h, i) => row[h] = values[i]?.trim() || '');
    return row;
  });
}

function csvRowToJob(row) {
  const channel = CHANNEL_PRESETS[row.channel] || CHANNEL_PRESETS['stori-india'];
  return {
    id: generateJobId(),
    status: 'pending',
    inputMode: row.script ? 'script' : 'topic',
    topic: row.topic || '',
    script: row.script || '',
    channel: row.channel,
    language: row.language,
    languageLabel: PIPELINE_LANGUAGES[row.language]?.label || row.language,
    style: row.style || 'auto',              // 'auto' = AI picks based on story content
    platform: row.platform || channel.platform,
    transition: row.transition || channel.defaultTransition,
    subtitleStyle: channel.subtitleStyle,
    watermark: channel.branding.watermark,
    introText: channel.branding.introText,
    endCard: channel.branding.endCard,
    // ... rest defaults
  };
}
```

---

## Execution Engine

### Parallel Execution

The engine runs N jobs concurrently, limited by API rate constraints.

```javascript
const PIPELINE_CONFIG = {
  maxParallel: 3,          // max concurrent jobs (API rate limit safe)
  retryAttempts: 2,        // retry failed jobs
  retryDelay: 5000,        // ms between retries
  pauseBetweenJobs: 1000,  // ms cooldown between starting new jobs
};

class PipelineEngine {
  constructor() {
    this.jobs = [];           // all jobs
    this.running = new Set(); // currently executing job IDs
    this.paused = false;
    this.mode = 'parallel';   // 'parallel' | 'sequential'
  }

  async runAll() {
    const pending = this.jobs.filter(j => j.status === 'pending');
    if (this.mode === 'sequential') {
      for (const job of pending) {
        if (this.paused) break;
        await this.executeJob(job);
      }
    } else {
      // Parallel with concurrency limit
      await this.runParallel(pending, PIPELINE_CONFIG.maxParallel);
    }
  }

  async runParallel(jobs, limit) {
    const queue = [...jobs];
    const executing = [];

    while (queue.length > 0 || executing.length > 0) {
      if (this.paused) break;

      while (executing.length < limit && queue.length > 0) {
        const job = queue.shift();
        const promise = this.executeJob(job).then(() => {
          executing.splice(executing.indexOf(promise), 1);
        });
        executing.push(promise);
        await sleep(PIPELINE_CONFIG.pauseBetweenJobs);
      }

      if (executing.length > 0) {
        await Promise.race(executing);
      }
    }
  }

  async executeJob(job) {
    this.running.add(job.id);
    try {
      // Step 1: Generate script + auto-detect style (if topic/long-text mode)
      // Uses Gemini 2.5 Pro — the only step that uses Pro
      if (job.inputMode === 'topic' && !job.generatedScript) {
        job.status = 'generating-script';
        this.updateUI(job);
        const result = await generateScriptFromInput(job.topic, job.language, ...);
        job.generatedScript = result.scenes;
        job.scenes = result.scenes;
        job.autoDetectedStyle = result.style;
        // Apply auto-detected style if user hasn't overridden
        if (job.style === 'auto') {
          job.style = result.style.name;
        }
      }

      // Step 2: Generate TTS audio from script
      job.status = 'generating-audio';
      this.updateUI(job);
      job.audioBuffer = await generateTTSFromScript(job.script, job.language);

      // Step 3: Scene breakdown
      job.status = 'transcribing';
      this.updateUI(job);
      job.scenes = await breakScriptIntoScenes(job.script, job.audioBuffer, job.language);
      job.words = extractWordsFromScenes(job.scenes);

      // Step 4: Generate images
      job.status = 'generating-images';
      this.updateUI(job);
      await generateImagesForJob(job);  // reuses grid/individual logic

      // Step 5: Assembly (thumbnail + preview data)
      job.status = 'assembling';
      this.updateUI(job);
      job.thumbnailDataUrl = job.scenes[0]?.imgDataUrl || null;
      job.duration = job.audioBuffer.duration;

      // Step 6: Done
      job.status = 'done';
      job.completedAt = Date.now();
      job.cost = calculateJobCost(job);
      this.updateUI(job);

    } catch (err) {
      job.status = 'error';
      job.error = err.message;
      this.updateUI(job);
    } finally {
      this.running.delete(job.id);
    }
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; this.runAll(); }
}
```

### Reused Functions from Existing Codebase

| Function | Source File | What it does in pipeline |
|---|---|---|
| `callGeminiAPI()` | `17a-create-api.js` | All API calls (script gen, transcription, TTS) |
| `generateImageGeminiFlash()` | `17c-create-pipeline.js` | Individual image generation |
| `generateGridImage()` | `17c-create-pipeline.js` | Grid image generation (4+ scenes) |
| `cropGridCells()` | `17c-create-pipeline.js` | Extract cells from grid |
| `browserUpscale()` | `17c-create-pipeline.js` | Upscale cropped cells |
| `decodeBase64Audio()` | `17c-create-pipeline.js` | Decode TTS response to AudioBuffer |
| `parseGeminiJson()` | `17c-create-pipeline.js` | Parse JSON from Gemini markdown response |
| `clampSegments()` | `20-reels-creator.js` | Ensure 6-9 scenes |
| `trackCost()` | `01-core.js` | Cost tracking |
| `STYLE_PRESETS` | `17a-create-api.js` | All 20 style definitions |
| `REEL_TRANSITIONS` | `01-core.js` | Transition definitions |
| `REEL_PLATFORMS` | `01-core.js` | Platform dimensions |

### Model Assignment Per Step

| Pipeline step | Model | Cost/call | Why this model |
|---|---|---|---|
| **Script generation + style detection** | **Gemini 2.5 Pro** | ~$0.01-$0.02 | Creative writing, cultural nuance, condensation judgment, style reasoning |
| Scene breakdown (script → timed scenes) | Gemini 2.5 Flash | ~$0.001 | Mechanical splitting task |
| TTS audio | Gemini 2.5 Flash TTS | ~$0.003-$0.02 | Only TTS option |
| Image generation (grid) | Gemini 3 Pro Image | ~$0.134/grid | Already using this in reel creator |
| Image generation (individual) | Gemini 2.5 Flash Image | ~$0.039/img | Already using this in reel creator |

**Only script generation uses Pro.** Everything else uses Flash. Monthly cost increase for Pro: ~$3-4/month at full scale.

### New Functions (pipeline-specific)

| Function | Purpose |
|---|---|
| `generateScriptFromInput()` | Topic OR long text → script + auto-detected style via **Gemini 2.5 Pro** |
| `buildScriptPrompt()` | Constructs the prompt — handles both short topic and long text input |
| `generateTTSFromScript()` | Script → AudioBuffer via Gemini TTS (handles chunking for long scripts) |
| `breakScriptIntoScenes()` | Script + audio → timed scenes with visual descriptions |
| `generateImagesForJob()` | Wrapper: routes to grid or individual, applies auto-detected or user-chosen style |
| `parseCSV()` | CSV text → array of row objects |
| `csvRowToJob()` | CSV row → pipeline job with channel preset defaults |
| `PipelineEngine.runAll()` | Execute all pending jobs |
| `PipelineEngine.runParallel()` | Parallel execution with concurrency limit |
| `exportJobToReel()` | Package job data into format the reel editor expects |
| `savePipelineProject()` | Save all jobs + state to IndexedDB |
| `loadPipelineProject()` | Restore from IndexedDB |

---

## UI Layout

### Page Structure

```html
<div id="pipeline-page" style="display:none;">

  <!-- Header -->
  <div class="pipeline-header">
    <button id="btn-pipeline-back">← Back</button>
    <h2>Marketing Pipeline</h2>
    <button id="btn-pipeline-save">💾 Save Project</button>
    <button id="btn-pipeline-load">📂 Load Project</button>
  </div>

  <!-- API Key (single, shared across all jobs) -->
  <div class="pipeline-step">
    <h3><span class="step-num">1</span> API Key</h3>
    <input type="password" id="pipeline-api-key" placeholder="Gemini API key">
    <button id="btn-pipeline-save-key">Save</button>
    <span id="pipeline-key-status"></span>
  </div>

  <!-- Add Jobs Section -->
  <div class="pipeline-step">
    <h3><span class="step-num">2</span> Add Content</h3>

    <!-- Quick Add: single job -->
    <div class="pipeline-add-row">
      <select id="pipeline-channel">
        <option value="stori">Stori (English)</option>
        <option value="stori-india">Stori India</option>
        <option value="stori-global">Stori Global</option>
      </select>

      <select id="pipeline-language">
        <!-- populated based on channel selection -->
      </select>

      <select id="pipeline-input-mode">
        <option value="topic">Topic Prompt</option>
        <option value="script">Text Script</option>
      </select>

      <select id="pipeline-style">
        <option value="auto" selected>Auto (AI picks)</option>
        <!-- + all 20 styles from STYLE_PRESETS as overrides -->
      </select>
    </div>

    <!-- Topic / Long Text input -->
    <div id="pipeline-topic-input">
      <textarea id="pipeline-topic" rows="2"
                placeholder="Short topic: 'Murugan slays Surapadman'&#10;Or paste long text: article, book chapter, reference material..."></textarea>
      <button id="btn-pipeline-add-job">+ Add Job</button>
      <span class="text-xs text-muted">Short topic or long text — AI condenses to 1 minute</span>
    </div>

    <!-- Script input -->
    <div id="pipeline-script-input" style="display:none;">
      <textarea id="pipeline-script" rows="4"
                placeholder="Paste your script here..."></textarea>
      <button id="btn-pipeline-add-script-job">+ Add Job</button>
    </div>

    <!-- CSV Import -->
    <div class="pipeline-csv-row">
      <button id="btn-pipeline-csv">📄 Import CSV</button>
      <button id="btn-pipeline-csv-template">📋 Download Template</button>
      <input type="file" id="pipeline-csv-input" accept=".csv" hidden>
    </div>
  </div>

  <!-- Job Queue -->
  <div class="pipeline-step">
    <h3><span class="step-num">3</span> Content Queue</h3>

    <!-- Controls -->
    <div class="pipeline-controls">
      <button id="btn-pipeline-run-all" class="primary">▶ Run All</button>
      <button id="btn-pipeline-run-selected">▶ Run Selected</button>
      <button id="btn-pipeline-pause">⏸ Pause</button>

      <label>
        <input type="radio" name="pipeline-mode" value="parallel" checked> Parallel
      </label>
      <label>
        <input type="radio" name="pipeline-mode" value="sequential"> Sequential
      </label>

      <span id="pipeline-queue-status">0 jobs | $0.00 est.</span>
    </div>

    <!-- Progress -->
    <div id="pipeline-progress" style="display:none;">
      <div class="bar-bg"><div class="bar-fill" id="pipeline-progress-bar"></div></div>
      <span id="pipeline-progress-label">0/0 complete</span>
    </div>

    <!-- Job Grid -->
    <div id="pipeline-job-grid" class="pipeline-grid">
      <!-- Job cards rendered here dynamically -->
    </div>
  </div>

  <!-- Batch Export -->
  <div class="pipeline-step" id="pipeline-export-step" style="display:none;">
    <h3><span class="step-num">4</span> Export</h3>
    <button id="btn-pipeline-export-all" class="primary">⬇ Export All Completed</button>
    <button id="btn-pipeline-export-selected">⬇ Export Selected</button>
    <span id="pipeline-export-status"></span>
  </div>

</div>
```

### Job Card (rendered per job)

```html
<div class="pipeline-job-card" data-job-id="job-xxx" data-status="done">
  <div class="pipeline-job-header">
    <input type="checkbox" class="pipeline-job-select">
    <span class="pipeline-job-lang">🇮🇳 Tamil</span>
    <span class="pipeline-job-channel">Stori India</span>
    <span class="pipeline-job-status">✅ Done</span>
    <button class="pipeline-job-delete">✕</button>
  </div>

  <div class="pipeline-job-body">
    <!-- Before execution: shows topic/script preview -->
    <p class="pipeline-job-topic">Murugan slays Surapadman</p>

    <!-- After execution: shows thumbnail + stats + auto-detected style -->
    <div class="pipeline-job-result" style="display:none;">
      <img class="pipeline-job-thumb" src="data:...">
      <div class="pipeline-job-stats">
        <span>8 scenes</span>
        <span>62s</span>
        <span>$0.16</span>
      </div>
      <div class="pipeline-job-style">
        <span class="style-badge">cinematic</span>
        <span class="text-xs text-muted">AI: epic battle demands dramatic lighting</span>
      </div>
    </div>
  </div>

  <div class="pipeline-job-actions">
    <button class="btn-pipeline-job-run">▶ Run</button>
    <button class="btn-pipeline-job-edit" style="display:none;">✏️ Edit in Reel Editor</button>
    <button class="btn-pipeline-job-export" style="display:none;">⬇ Export</button>
    <button class="btn-pipeline-job-preview" style="display:none;">👁 Preview</button>
  </div>
</div>
```

### Status Icons & Colors

```
📝 pending       — gray card border
🔄 generating-script — blue pulse
🎙️ generating-audio  — blue pulse
📖 transcribing      — blue pulse
🖼️ generating-images — blue pulse (with progress %)
🎬 assembling        — blue pulse
✅ done              — green border
❌ error             — red border
⏸ paused            — amber border
```

---

## "Open in Reel Editor" Bridge

When user clicks "Edit in Reel Editor" on a completed job, the pipeline packages the job's data into the format the reel editor expects.

```javascript
function openJobInReelEditor(job) {
  // Navigate to reel page
  showPage('reel-page');

  // Set reel input mode to text
  setReelInputMode('text');

  // Set the script
  document.getElementById('reel-text-input').value = job.script;

  // Set presets
  document.getElementById('reel-style').value = job.style;
  document.getElementById('reel-platform').value = job.platform;
  document.getElementById('reel-transition').value = job.transition;

  // Load pre-generated data
  reelAudioBuffer = job.audioBuffer;
  reelScenes = job.scenes;
  reelWords = job.words;

  // Build the multi-results structure
  window._reelMultiResults = [{
    audioBuffer: job.audioBuffer,
    audioLang: job.language,
    subtitleLang: job.language,
    scenes: job.scenes,
    words: job.words,
    settings: {
      subtitleStyle: job.subtitleStyle,
      transition: job.transition,
    }
  }];

  // Jump to step 4 (preview & edit)
  // Show the preview
  renderAllReelPreviews();
}
```

---

## Project Save/Load

### Save Format

Pipeline projects are saved to IndexedDB (same mechanism as existing projects in `15-project.js`).

```javascript
{
  type: 'pipeline-project',
  name: 'Week 14 — Tamil + Hindi',
  createdAt: Date.now(),
  updatedAt: Date.now(),

  // Jobs (without large binary data — audio stored as base64)
  jobs: [
    {
      ...jobData,
      audioBase64: base64EncodedWav,  // AudioBuffer → base64
      scenes: scenes.map(s => ({
        ...s,
        imgDataUrl: s.imgDataUrl,     // keep data URLs
        _img: undefined,              // strip cached Image objects
      })),
      videoBlob: undefined,           // don't save export — too large
    },
    ...
  ],

  // Project-level metadata
  apiKeyHash: hashApiKey(apiKey),     // for verification, not storage
  totalCost: jobs.reduce((sum, j) => sum + j.cost, 0),
}
```

### IndexedDB Store

```javascript
// Extend existing project store in 15-project.js
// Add 'pipeline-projects' object store
const PIPELINE_STORE = 'pipeline-projects';

async function savePipelineProject(project) {
  const db = await openStoriDB();
  const tx = db.transaction(PIPELINE_STORE, 'readwrite');
  await tx.objectStore(PIPELINE_STORE).put(project);
}

async function loadPipelineProject(id) {
  const db = await openStoriDB();
  const tx = db.transaction(PIPELINE_STORE, 'readonly');
  return tx.objectStore(PIPELINE_STORE).get(id);
}

async function listPipelineProjects() {
  const db = await openStoriDB();
  const tx = db.transaction(PIPELINE_STORE, 'readonly');
  return tx.objectStore(PIPELINE_STORE).getAll();
}
```

---

## Export Pipeline

### Single Job Export

Reuses `exportSingleReel()` from `20-reels-creator.js` with branding additions.

```javascript
async function exportPipelineJob(job) {
  // Load job data into reel state
  const scenes = job.scenes;
  const audioBuffer = job.audioBuffer;
  const words = job.words;
  const platform = REEL_PLATFORMS[job.platform];

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = platform.width;
  canvas.height = platform.height;
  const ctx = canvas.getContext('2d');

  // Frame rendering loop (30 FPS)
  // For each frame:
  //   1. Draw scene image (with transition/motion)
  //   2. Draw subtitles
  //   3. Draw watermark (if job.watermark)
  //   4. Draw intro text (if job.introText && time < 2.5s)

  // After main content: render end card (if job.endCard)
  //   5 seconds of end card with Stori branding + CTA

  // Encode via MediaRecorder
  // Return Blob
}
```

### Batch Export

```javascript
async function exportAllCompleted() {
  const completed = engine.jobs.filter(j => j.status === 'done');
  for (let i = 0; i < completed.length; i++) {
    updateExportProgress(i, completed.length);
    const blob = await exportPipelineJob(completed[i]);

    // Auto-download with descriptive filename
    const lang = completed[i].languageLabel.toLowerCase();
    const topic = completed[i].topic.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
    const filename = `${completed[i].channel}-${lang}-${topic}.mp4`;
    downloadBlob(blob, filename);

    // Small delay between exports to avoid browser freezing
    await sleep(500);
  }
}
```

---

## Implementation Steps

### Step 1: Create the file structure
- Create `js/21-marketing-pipeline.js`
- Add `#pipeline-page` section to `index.html`
- Add "Marketing Pipeline" button to landing page
- Add navigation handler in `18-navigation.js`
- Add CSS for pipeline components to `css/styles.css`

### Step 2: Channel presets & language config
- Define `CHANNEL_PRESETS` and `PIPELINE_LANGUAGES`
- Wire up channel → language dropdown cascade
- Wire up language → style/transition defaults

### Step 3: Job creation (3 input modes)
- Topic prompt → single job creation
- Script text → single job creation
- CSV import → batch job creation with parsing
- Job card rendering

### Step 4: Script generation + auto style detection (Gemini 2.5 Pro)
- Implement `generateScriptFromInput()` — handles short topic AND long text
- Single Pro call returns both script (6-9 scenes) and style recommendation
- Handle Gemini response parsing (JSON with scenes + style)
- Store generated script, auto-detected style, and style reasoning in job
- If user set style to 'auto', apply detected style; if user chose specific style, keep user's choice

### Step 5: Execution engine
- Implement `PipelineEngine` class
- Parallel execution with concurrency limit
- Sequential execution mode
- Pause/resume
- Error handling and retry
- Progress tracking per-job and overall

### Step 6: Scene breakdown & TTS
- Adapt existing reel text-mode logic for script → scenes
- Implement `generateTTSFromScript()` with chunking for long scripts
- Duration calculation and word timing

### Step 7: Image generation with auto-detected or user-chosen style
- Wire to existing `generateGridImage()` / `generateImageGeminiFlash()`
- Apply `job.style` (either auto-detected from Pro or user override) to STYLE_PRESETS lookup
- Per-job progress tracking

### Step 8: "Open in Reel Editor" bridge
- Package job data into reel editor format
- Navigate to reel page with pre-loaded data
- Ensure bidirectional — edits in reel editor can be saved back

### Step 9: Export with branding
- Implement watermark rendering in export loop
- Implement intro text fade-in/out
- Implement end card (5-second branded segment)
- Batch export with auto-naming

### Step 10: Project save/load
- Extend IndexedDB schema for pipeline projects
- Save: serialize all jobs with audio as base64 + images as data URLs
- Load: restore full state, decode audio buffers
- Project list in UI

### Step 11: Build integration
- Add `21-marketing-pipeline.js` to `build.js` deferred scripts list
- Test production build
- Verify all functions accessible across module boundaries

---

## Estimated File Sizes

| File | Estimated Lines | Notes |
|---|---|---|
| `js/21-marketing-pipeline.js` | ~1,500-2,000 | Main pipeline logic, execution engine, UI handlers |
| HTML additions to `index.html` | ~150 | Pipeline page section |
| CSS additions to `styles.css` | ~200 | Pipeline-specific styles |
| **Total new code** | **~1,850-2,350** | |

Most of the heavy lifting (API calls, image generation, TTS, export) is reused from existing modules. The pipeline is primarily orchestration + UI.

---

## Cost Per Job (Estimated)

| Step | Model | Cost | Notes |
|---|---|---|---|
| Script generation + style detection | **Gemini 2.5 Pro** | $0.01-$0.02 | One call does both — the only Pro usage |
| TTS audio | Gemini Flash TTS | $0.003-$0.02 | Depends on script length + language |
| Scene breakdown | Gemini Flash | $0.001 | Mechanical splitting |
| Image generation (grid, 6-9 scenes) | Gemini 3 Pro Image | $0.134 | Single grid API call |
| Image generation (individual, 1-3 scenes) | Gemini Flash Image | $0.039-$0.117 | Per-image |
| **Total per job** | | **$0.15-$0.18** | Grid mode (typical) |

**Weekly cost at full scale (Phase 2):**
- 44 videos/week × $0.17/video = **$7.48/week = $32.40/month**
- Of which Pro script generation = ~$0.88/week = $3.80/month
- Everything else = ~$6.60/week = $28.60/month
