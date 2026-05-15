# LoRA Studio -- Implementation Plan

## 1. Overview

### What We Are Building

Replace the current two-tab LoRA system (Products tab + Characters tab inside the Library page) with a unified "LoRA Studio." The current system lives in `js/34-lora-library.js` (1410 lines), exposes `window.LoraLibrary`, and uses two separate localStorage keys (`stori_lora_products_v1`, `stori_lora_characters_v1`) plus a single IndexedDB store (`stori_lora_photos`).

The new LoRA Studio provides one entry point and four distinct paths based on user intent:

- **Path A** -- Product (direct photo upload, fast training)
- **Path B** -- Character: Talking Head (4-5 photos, AI generates 18 training images)
- **Path C1** -- Scene Character: Real Person (18 real photos across 3 outfits)
- **Path C2** -- Scene Character: AI-Generated (1-2 references + text, AI generates 18 training images)

Each path shares a common post-training flow: 3 preview images, two-tier fine-tuning with explicit Apply button, and lock/unlock/retrain mechanics.

### Why

The current system has no guided upload (users guess what photos to provide), no fine-tuning (no way to adjust LoRA strength or style after training), no concept of scene vs talking-head compatibility, and characters are trained with AI-generated images from Gemini Flash (low quality, 512x512). The new system uses Gemini Pro 3x3 identity-transfer grids at 2K resolution, cropped to 1024x1024 cells, with outfit-aware captions -- matching the DOE trial pipeline that proved successful.

### Entry Points

1. **Library page** -- `#btn-library-nav` link in the main nav. Currently opens `#library-page`. Will now open the LoRA Studio.
2. **Settings page** -- Add a "LoRA Studio" link in settings (future, not MVP).
3. **Assets section** -- Character/product assign buttons already reference `window.LoraLibrary`. These continue to work via the same public API, with expanded compatibility metadata.

---

## 2. Architecture

### 2.1 File Changes

| File | Action | Scope |
|------|--------|-------|
| `js/34-lora-library.js` | Major rewrite | New data model, 4 path flows, training, fine-tuning, lock/unlock, migration |
| `index.html` | Replace sections | Lines 2897-2932 (library-page) and 5909-5944 (char-create-modal) |
| `css/styles.css` | Replace/extend | Lines 7813-8117 (library + char-create styles) |
| `assets/lora-refs/` | New directory | 6 cropped reference images for upload slots |

### 2.2 Storage Model

#### Current (to be replaced)

```
localStorage:
  stori_lora_products_v1    -> JSON array of product objects
  stori_lora_characters_v1  -> JSON array of character objects
  stori_fal_api_key         -> string

IndexedDB (stori_lora_photos / photos store):
  lora_{productId}_photo_{idx}    -> data URL
  lora_{productId}_preview        -> data URL
  lora_char_{charId}_photo_{idx}  -> data URL
  lora_char_{charId}_preview      -> data URL
```

#### New Unified Model

```
localStorage:
  stori_lora_items_v2       -> JSON array of LoRA item objects
  stori_fal_api_key         -> string (unchanged)

IndexedDB (stori_lora_photos / photos store, version bumped to 2):
  lora_v2_{id}_photo_{idx}      -> data URL (input photos)
  lora_v2_{id}_train_{idx}      -> data URL (generated training images, paths B/C2)
  lora_v2_{id}_preview_{idx}    -> data URL (3 preview images, idx 0-2)
  lora_v2_{id}_ref_{idx}        -> data URL (reference images for side-by-side display)
  lora_v2_{id}_voice_sample     -> data URL (voice audio sample, cloned voices only)
```

#### LoRA Item Schema

```javascript
{
  id: string,                    // 'lora_' + Date.now().toString(36) + random
  type: 'product' | 'talking-head' | 'scene-real' | 'scene-ai',
  name: string,
  description: string,           // user text description
  trainerType: 'flux-portrait' | 'qwen' | 'flux-fast',
  trainerEndpoint: string,       // exact fal endpoint used
  inferenceEndpoint: string,     // matching inference endpoint
  
  // Photo tracking
  photoCount: number,            // input photos uploaded by user
  trainImageCount: number,       // training images (= photoCount for A/C1, generated for B/C2)
  
  // Training state
  loraStatus: 'idle' | 'generating' | 'reviewing' | 'training' | 'ready' | 'error',
  loraUrl: string | null,
  configUrl: string | null,
  triggerWord: string,
  trainSteps: number,
  trainStarted: number | null,   // Date.now() timestamp
  trainCompleted: number | null,
  falRequestId: string | null,
  loraError: string | null,
  
  // Fine-tuning params
  tuningParams: {
    lora_scale: number,          // 0.5-1.2, default 0.9
    guidance_scale: number,      // 2-8, default depends on trainer
    seed: number,                // random int
    refineEnabled: boolean,      // Tier 2 photoreal enhance
  },
  
  // Lock state
  locked: boolean,               // true = prevent accidental edits
  
  // Compatibility
  compatibleWith: string[],      // ['scene', 'talking-head'] or ['product']
  
  // Scene-real specific
  outfitLabels: string[],        // 3 outfit descriptions for C1
  
  // Scene-ai specific
  aiReferenceDesc: string,       // text description for C2
  
  // Retrain history
  archivedVersions: Array<{
    loraUrl: string,
    configUrl: string,
    trainCompleted: number,
    tuningParams: object,
    triggerWord: string,
  }>,
  
  // Preview generation tracking
  previewPrompts: string[],      // 3 prompts used for previews
  previewGenerated: boolean,
  
  // Progress tracking for UI
  progressPhase: string | null,  // descriptive phase name for B/C2
  progressPct: number,           // 0-100
  
  // Voice profile (optional, characters only — not applicable to products)
  voiceProfile: {
    source: 'cloned' | 'library' | null, // how voice was added
    elevenlabsVoiceId: string | null,     // ElevenLabs voice_id (opaque string)
    voiceName: string | null,             // display name ("Alex's Voice" or "Aria")
    sampleDurationSec: number | null,     // duration of uploaded sample (cloned only)
    languageDefault: string | null,       // ISO code: 'en', 'es', etc.
    consentVerifiedAt: number | null,     // Date.now() timestamp (cloned only)
    clonedAt: number | null,             // Date.now() timestamp (cloned only)
  } | null,
}
```

### 2.3 Public API (window.LoraStudio)

The module will continue to expose a global object for cross-module access, renamed from `window.LoraLibrary` to `window.LoraStudio`. A compatibility shim `window.LoraLibrary` will forward all calls for backward compat during transition.

```javascript
window.LoraStudio = {
  // Navigation
  openStudio(),
  closeStudio(),
  
  // Data access (read)
  getItems(),
  getItemById(id),
  getItemsByType(type),
  getProducts(),               // compat alias for getItemsByType('product')
  getCharacters(),             // compat alias for talking-head + scene-real + scene-ai
  getCharacterById(id),        // compat wrapper
  
  // Selection (for create pipeline)
  getSelectedProductIds(),
  setSelectedProductIds(ids),
  
  // Training
  trainItem(id),
  
  // Rendering
  renderStudio(),
  renderAssetsSection(),
  renderStep4Products(),
  
  // Blocking
  isLoraBlocking(),
  updateLaunchImageButton(),
  
  // Pickers
  openCharacterPicker(anchorEl, onSelect, allowNone),
  openProductPicker(),
  
  // Keys
  getFalKey(),
};
```

### 2.4 Backward Compatibility with `_getSceneLoraContext()`

The function at `js/17c-create-pipeline.js:2690` reads from `window.LoraLibrary.getProducts()`, `window.LoraLibrary.getCharacterById()`, etc. The new module must expose these same functions with identical return shapes. The `loraStatus`, `loraUrl`, and `triggerWord` fields on the returned objects must remain at the top level.

---

## 3. UI Flow

### 3.1 LoRA Studio Landing (replaces `#library-page`)

```html
<div id="lora-studio-page" style="display:none;">
  <div class="studio-header">
    <h2 class="studio-title">LoRA Studio</h2>
    <p class="text-sm text-muted">Train custom LoRAs for products and characters.</p>
  </div>
  
  <!-- API key row (moved from products tab to top-level) -->
  <div class="lora-key-row" id="studio-key-row">
    <span class="text-xs text-muted">fal.ai key</span>
    <input type="password" id="studio-fal-key-input" placeholder="fal_..." 
           class="lora-key-input" autocomplete="off" data-form-type="other">
    <button id="btn-studio-save-key" class="btn-xs primary">Save</button>
    <span id="studio-key-status" class="text-xs text-muted"></span>
    <a href="https://fal.ai/dashboard/keys" target="_blank" 
       class="text-xs link-accent">Get key</a>
  </div>
  
  <!-- Filter tabs -->
  <div class="studio-filter-tabs">
    <button class="studio-filter active" data-filter="all">All</button>
    <button class="studio-filter" data-filter="product">Products</button>
    <button class="studio-filter" data-filter="talking-head">Talking Head</button>
    <button class="studio-filter" data-filter="scene-real">Scene (Real)</button>
    <button class="studio-filter" data-filter="scene-ai">Scene (AI)</button>
  </div>
  
  <!-- LoRA cards grid -->
  <div id="studio-items-grid" class="studio-items-grid"></div>
  
  <!-- New LoRA button -->
  <button id="btn-new-lora" class="btn-sm primary">+ New LoRA</button>
</div>
```

When user clicks **+ New LoRA**, a path-selection modal appears.

### 3.2 Path Selection Modal

```html
<div id="lora-path-modal" class="lora-path-modal hidden">
  <div class="lora-path-panel">
    <h3 class="lora-path-title">What are you training?</h3>
    <div class="lora-path-grid">
      <button class="lora-path-card" data-path="product">
        <span class="lora-path-icon">📦</span>
        <span class="lora-path-label">Product</span>
        <span class="lora-path-desc">5-15 photos of a physical product</span>
        <span class="lora-path-time">~10 min</span>
      </button>
      <button class="lora-path-card" data-path="talking-head">
        <span class="lora-path-icon">🗣</span>
        <span class="lora-path-label">Character: Talking Head</span>
        <span class="lora-path-desc">4-5 photos, AI generates training set</span>
        <span class="lora-path-time">~30-45 min</span>
      </button>
      <button class="lora-path-card" data-path="scene-real">
        <span class="lora-path-icon">🎬</span>
        <span class="lora-path-label">Scene Character: Real Photos</span>
        <span class="lora-path-desc">18 photos across 3 outfits. Most versatile.</span>
        <span class="lora-path-time">~30-45 min</span>
      </button>
      <button class="lora-path-card" data-path="scene-ai">
        <span class="lora-path-icon">✨</span>
        <span class="lora-path-label">Scene Character: AI-Generated</span>
        <span class="lora-path-desc">1-2 reference images + description</span>
        <span class="lora-path-time">~30-45 min</span>
      </button>
    </div>
    <button id="btn-path-close" class="lora-card-del">x</button>
  </div>
</div>
```

### 3.3 Path A -- Product Input Modal

```html
<div id="lora-input-modal" class="lora-input-modal hidden">
  <div class="lora-input-panel">
    <div class="lora-input-header">
      <h3 id="lora-input-title">Product LoRA</h3>
      <button id="btn-input-close" class="lora-card-del">x</button>
    </div>
    
    <!-- Name field -->
    <div class="lora-input-field">
      <label class="text-xs text-muted">Name</label>
      <input type="text" id="lora-input-name" class="lora-name-input" 
             placeholder="e.g. Blue Ceramic Mug">
    </div>
    
    <!-- Guided upload area (path-specific, rendered by JS) -->
    <div id="lora-upload-area"></div>
    
    <!-- Quality check results -->
    <div id="lora-quality-results" class="hidden"></div>
    
    <!-- Review grid (for paths B/C2 after AI generation) -->
    <div id="lora-review-section" class="hidden">
      <div class="lora-review-header">
        <span class="text-sm"><strong>Training Images</strong></span>
        <span id="lora-review-count" class="text-xs text-muted"></span>
      </div>
      <div id="lora-review-grid" class="lora-review-grid"></div>
    </div>
    
    <!-- Action buttons -->
    <div id="lora-input-actions" class="lora-input-actions"></div>
  </div>
</div>
```

For **Path A (Product)**, `#lora-upload-area` renders:

```html
<div class="product-upload-zone">
  <div class="upload-refs-row">
    <!-- Reference thumbnails from assets/lora-refs/ -->
    <img src="assets/lora-refs/product_ref_1.jpg" class="upload-ref-thumb" alt="Example">
    <img src="assets/lora-refs/product_ref_2.jpg" class="upload-ref-thumb" alt="Example">
    <img src="assets/lora-refs/product_ref_3.jpg" class="upload-ref-thumb" alt="Example">
  </div>
  <p class="text-2xs text-muted">Upload 5-15 photos. Different angles, backgrounds, lighting.</p>
  <div class="product-photo-grid" id="product-photo-grid"></div>
  <label class="btn-sm upload-btn">
    Upload Photos
    <input type="file" id="product-file-input" accept="image/*" multiple hidden>
  </label>
  <p class="text-2xs text-muted" id="product-photo-count">0/15 photos</p>
</div>
```

### 3.4 Path B -- Talking Head Input

`#lora-upload-area` renders 5 guided upload slots with side-by-side reference crops:

```html
<div class="guided-upload-grid">
  <p class="text-xs text-muted">Upload 4 mandatory + 1 optional photo.</p>
  <p class="text-2xs text-muted disclaimer">Quality of videos generated depends on 
     the quality of photos uploaded.</p>
  
  <!-- Slot 1: Front face (mandatory) -->
  <div class="guided-slot" data-slot="0" data-required="true">
    <div class="guided-ref">
      <img src="assets/lora-refs/front_face.jpg" alt="Front face example">
      <span class="text-2xs">Front face</span>
    </div>
    <div class="guided-upload" id="guided-slot-0">
      <label class="guided-upload-btn">
        <span>+</span>
        <input type="file" accept="image/*" data-slot-input="0" hidden>
      </label>
    </div>
    <div class="guided-quality" id="guided-quality-0"></div>
  </div>
  
  <!-- Slot 2: Left profile (mandatory) -->
  <div class="guided-slot" data-slot="1" data-required="true">
    <div class="guided-ref">
      <img src="assets/lora-refs/left_profile.jpg" alt="Left profile example">
      <span class="text-2xs">Left profile</span>
    </div>
    <div class="guided-upload" id="guided-slot-1"></div>
    <div class="guided-quality" id="guided-quality-1"></div>
  </div>
  
  <!-- Slot 3: Right profile (mandatory) -->
  <div class="guided-slot" data-slot="2" data-required="true">
    <div class="guided-ref">
      <img src="assets/lora-refs/right_profile.jpg" alt="Right profile example">
      <span class="text-2xs">Right profile</span>
    </div>
    <div class="guided-upload" id="guided-slot-2"></div>
    <div class="guided-quality" id="guided-quality-2"></div>
  </div>
  
  <!-- Slot 4: Top half waist-up (mandatory) -->
  <div class="guided-slot" data-slot="3" data-required="true">
    <div class="guided-ref">
      <img src="assets/lora-refs/waist_up.jpg" alt="Waist-up example">
      <span class="text-2xs">Top half (waist-up)</span>
    </div>
    <div class="guided-upload" id="guided-slot-3"></div>
    <div class="guided-quality" id="guided-quality-3"></div>
  </div>
  
  <!-- Slot 5: Full body (optional) -->
  <div class="guided-slot guided-slot--optional" data-slot="4" data-required="false">
    <div class="guided-ref">
      <img src="assets/lora-refs/full_body.jpg" alt="Full body example">
      <span class="text-2xs">Full body (optional)</span>
    </div>
    <div class="guided-upload" id="guided-slot-4"></div>
    <div class="guided-quality" id="guided-quality-4"></div>
    <p class="text-2xs text-muted guided-skip-note">
      If skipped, lower body proportions will be AI-generated.
    </p>
  </div>
</div>
```

### 3.5 Path C1 -- Scene Character: Real Photos

`#lora-upload-area` renders 3 outfit groups, each with 6 upload slots:

```html
<div class="outfit-upload-groups">
  <p class="text-xs text-muted">Upload 18 photos: 6 per outfit, 3 different outfits.</p>
  <p class="text-2xs text-muted warning-note">Use 3 genuinely different outfits. 
     Same outfit = outfit baked into identity.</p>
  
  <!-- Outfit 1 -->
  <div class="outfit-group" data-outfit="0">
    <div class="outfit-label-row">
      <span class="text-sm outfit-label">Outfit 1</span>
      <input type="text" class="outfit-desc-input" data-outfit-desc="0" 
             placeholder="e.g. White button-up shirt, black trousers">
    </div>
    <div class="outfit-slots-grid">
      <!-- 6 slots: front face, left profile, right profile, 3/4 angle, top half, full body -->
      <div class="guided-slot" data-outfit-slot="0-0">
        <div class="guided-ref"><img src="assets/lora-refs/front_face.jpg"><span class="text-2xs">Front</span></div>
        <div class="guided-upload" id="outfit-slot-0-0"></div>
      </div>
      <!-- ... 5 more slots per outfit -->
    </div>
  </div>
  <!-- Outfit 2, Outfit 3 same structure -->
</div>
```

### 3.6 Path C2 -- Scene Character: AI-Generated

```html
<div class="ai-char-input">
  <div class="lora-input-field">
    <label class="text-xs text-muted">Reference Image(s)</label>
    <p class="text-2xs text-muted">Upload 1-2 reference images (concept art, sketch, existing character).</p>
    <div class="ai-ref-upload-row">
      <label class="guided-upload-btn">
        + <input type="file" id="ai-ref-input" accept="image/*" multiple hidden>
      </label>
      <div id="ai-ref-thumbs" class="ai-ref-thumbs"></div>
    </div>
  </div>
  <div class="lora-input-field">
    <label class="text-xs text-muted">Character Description</label>
    <textarea id="ai-char-desc" class="char-desc-textarea" rows="3"
              placeholder="e.g. 30-year-old woman, curly red hair, green eyes, freckles..."></textarea>
  </div>
  <button id="btn-ai-generate-training" class="btn-sm primary">
    Generate 18 Training Images
  </button>
</div>
```

### 3.7 Training Progress UI + Background Training

Training runs in the background. The user is **never locked to a progress screen**. Three layers of status visibility ensure the user always knows what's happening:

#### Layer 1: Training Progress Modal (detail view)

Shown when user clicks "Train LoRA" or clicks the topbar indicator. Contains circular progress ring, 5-phase step indicator, time estimate, and a "Continue Working" dismiss button. This is informational only — dismissing it does NOT cancel training.

```html
<div id="lora-training-modal" class="lora-training-modal hidden">
  <!-- Circular progress ring + percentage -->
  <!-- 5-phase step indicator -->
  <!-- Time estimate -->
  <p class="text-xs text-muted">Training runs in the background — you can continue working and come back anytime.</p>
  <p class="text-2xs text-faint mono">Training cannot be stopped once started</p>
  <button id="btn-training-continue" class="btn-sm primary">Continue Working</button>
</div>
```

**Why no Cancel button:** fal.ai does not respect cancel requests on training jobs. Once submitted, the job runs to completion. Showing a fake Cancel button would be dishonest. Instead, we clearly state the constraint and give the user a positive action ("Continue Working").

#### Layer 2: Topbar Training Indicator (persistent, global)

A small pill in the topbar visible on **every screen in the app** (Studio, Editor, Copilot, etc.). Shows the LoRA name, percentage, and a mini progress bar. Clicking it reopens the training progress modal.

```html
<!-- Injected into .topbar when any item has loraStatus === 'training' -->
<div id="topbar-training-pill" class="topbar-training-pill hidden">
  <span class="topbar-training-dot pulse"></span>
  <span class="topbar-training-label mono text-2xs">{name} — {pct}%</span>
  <div class="topbar-training-bar"><div class="topbar-training-fill" style="width:{pct}%"></div></div>
</div>
```

Implementation:
- On every `_pollUntilDone` tick, update the pill's label and progress bar width.
- When `loraStatus` transitions from `'training'` to `'ready'` or `'error'`, hide the pill.
- The pill is rendered by `_renderTopbarTrainingIndicator()`, called from both `renderStudio()` and from the global poll callback.
- Multiple concurrent trainings: show the most recent one; clicking opens a list if > 1.

#### Layer 3: Studio Card (grid view)

The card in `#studio-items-grid` shows `"Training... 67%"` with a progress bar (already defined in Section 3.8). This is what users see when browsing the Studio after dismissing the modal.

#### Training Completion Notification

When training finishes while the user is on another screen:

```javascript
function _onTrainingComplete(item) {
  // 1. Update item in storage
  item.loraStatus = 'ready';
  saveItem(item);
  
  // 2. Hide topbar indicator
  _renderTopbarTrainingIndicator();
  
  // 3. Show toast notification
  _showToast({
    title: `${item.name} — LoRA Ready`,
    body: 'Training complete. Generating preview images...',
    icon: '✓',
    duration: 8000,
    onClick: () => _openItemDetail(item.id),
  });
  
  // 4. Trigger preview generation
  _generatePreviews(item.id);
}
```

Toast UI: A small notification card that slides in from the bottom-right, auto-dismisses after 8 seconds, and is clickable to navigate to the item's detail view.

#### Training Error Handling

When training fails:

```javascript
function _onTrainingError(item, errorMsg) {
  item.loraStatus = 'error';
  item.loraError = errorMsg;
  saveItem(item);
  
  _showToast({
    title: `${item.name} — Training Failed`,
    body: errorMsg || 'An unexpected error occurred.',
    icon: '✗',
    type: 'error',
    duration: 0,  // persistent until dismissed
    onClick: () => _openItemDetail(item.id),
  });
}
```

Error state in the card and detail view shows a red badge with the error message and a "Retry Training" button. Retry resubmits the same training data to fal — it does NOT reopen the upload flow.

### 3.7a Upload Slot Interactions (remove/replace)

All upload screens must support removing or replacing uploaded photos:

**Product photos (Path A):** Each photo thumbnail shows a hover ✕ button (top-left) to remove the photo. Removing decrements the photo count and removes from IDB.

**Guided slots (Paths B, C1):** Each filled slot shows a hover ↻ replace button (top-right) that opens the file picker for that slot. The new photo replaces the old one in IDB and re-runs quality checks.

**Reference images (Path C2):** Each uploaded reference thumbnail shows a hover ✕ button to remove it.

**Quality check blocking:** If any mandatory slot fails quality checks (blur, resolution, face), the primary action button ("Generate Training Images" or "Train LoRA") is **disabled** with a warning message indicating which slots need attention. The user must fix all quality failures before proceeding.

### 3.7b Voice Integration (optional, characters only)

Voice is an **optional, separable slot** on character LoRA items (Paths B, C1, C2). Products (Path A) do not have voice. Voice and visual identity are independent — a character can exist without voice, voice can be added/removed/replaced at any time without retraining the LoRA.

**Mocks:** `mock-lora-12-voice-upload.html`, `mock-lora-13-voice-library.html`

#### Voice section in character creation modals

All three character input modals (Talking Head, Scene Real, Scene AI) include an optional "Voice" section below the photo/description inputs and above the primary action button. Two states:

**Empty state:** Shows label "VOICE" with "OPTIONAL" badge, brief explanation, and two buttons:
- "Upload / Record" → opens voice upload modal (mock-12)
- "Pick from Library" → opens voice library picker (mock-13)

**Filled state:** Shows voice icon, voice name, metadata (duration, language, source), "✓ CLONED" or "LIBRARY" badge, and Replace/Remove buttons.

#### Voice Upload / Record Modal (mock-12)

Opened from "Upload / Record" button. Modal with two mode tabs:

**Upload File tab (default):**
- Drag-and-drop / file picker for audio (MP3, WAV, M4A, OGG)
- After upload: waveform visualization, play button, file info (name, size, duration)
- Duration quality check: green ✓ if 30-120s, amber warning if <30s or >120s
- Quality tips panel (clear speech, natural voice, single speaker, longer = better)
- Consent checkbox: "I confirm I have permission to clone this voice and the speaker has given their consent." (required by ElevenLabs IVC policy)
- "Clone Voice" button → calls ElevenLabs IVC API

**Record Voice tab:**
- Microphone permission request
- Record button with live waveform and timer
- Stop → shows recorded audio with same playback/duration UI as upload
- Same consent checkbox and Clone button

**ElevenLabs IVC API call:**
```javascript
// POST https://api.elevenlabs.io/v1/voices/add
const formData = new FormData();
formData.append('name', `${characterName}_voice`);
formData.append('files', audioFile);
formData.append('remove_background_noise', 'true');

const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
  method: 'POST',
  headers: { 'xi-api-key': elevenLabsApiKey },
  body: formData,
});
const { voice_id } = await response.json();
// Store voice_id in item.voiceProfile.elevenlabsVoiceId
```

**After cloning (~30s):** Modal shows success state with voice_id stored. Voice section in parent modal updates to filled state.

#### Voice Library Picker (mock-13)

Opened from "Pick from Library" button. Modal with:
- Search bar
- Filter chips: language (All, English, Spanish, French, Hindi) + gender (Female, Male)
- Scrollable list of pre-made voice cards, each showing: avatar, name, language tags, gender tag, description, play preview button, radio-style select indicator
- Selected voice highlighted with violet border
- "Use [voice name] for this character" button

The voice library shows two categories of voices:

**1. Cloned voices from other LoRA characters:** Any character that already has a `voiceProfile` with `source: 'cloned'` appears in the library. This lets users reuse a cloned voice across multiple characters without re-cloning. The `elevenlabsVoiceId` is shared — the voice is stored once in ElevenLabs, referenced by multiple LoRA items.

**2. ElevenLabs built-in / curated voices:** Pre-existing voices from ElevenLabs' voice library (Aria, Marcus, Sofia, etc.). No cloning needed — the voice_id is stored directly on the character's `voiceProfile` with `source: 'library'`.

The library does NOT show Gemini voices (those are only used as narrator fallbacks in the TTS pipeline via `castResolveVoiceForSpeaker()`).

**Population logic:**
```javascript
function _getVoiceLibraryEntries() {
  const entries = [];
  
  // 1. Cloned voices from LoRA characters
  const items = getItems().filter(i => i.voiceProfile?.source === 'cloned' && i.voiceProfile.elevenlabsVoiceId);
  const seenVoiceIds = new Set();
  for (const item of items) {
    if (!seenVoiceIds.has(item.voiceProfile.elevenlabsVoiceId)) {
      seenVoiceIds.add(item.voiceProfile.elevenlabsVoiceId);
      entries.push({
        type: 'cloned',
        voiceId: item.voiceProfile.elevenlabsVoiceId,
        name: item.voiceProfile.voiceName,
        language: item.voiceProfile.languageDefault,
        duration: item.voiceProfile.sampleDurationSec,
        sourceCharacter: item.name,
      });
    }
  }
  
  // 2. ElevenLabs built-in voices (curated list)
  // These are hardcoded voice_ids from ElevenLabs' public library
  for (const preset of ELEVENLABS_PRESET_VOICES) {
    entries.push({ type: 'library', ...preset });
  }
  
  return entries;
}
```

**Important:** The voice library is NOT a standalone page. It is always opened in the context of a specific character — from the "Pick from Library" button inside the character creation/edit modal. The selected voice is immediately attached to that character.

#### Voice at generation time (character clips)

When generating talking-head or scene clips that have a character with a LoRA:
1. If the character's LoRA has `voiceProfile.elevenlabsVoiceId` set → auto-apply that voice via the existing ElevenLabs TTS pipeline (`generateTTSElevenLabs()` in `js/17a-create-api.js:841`). The voice_id is passed directly — no extra lookup needed.
2. If no voice is set → fall through to the existing voice resolution chain (`castResolveVoiceForSpeaker()` in `js/17b-create-references.js:3153`) which picks from the Gemini/ElevenLabs catalog.

#### Lip-sync integration (uses existing MediaPipe pipeline)

**Critical:** Lip-sync uses the existing MediaPipe Face Landmarker system in `js/30-lipsync.js`, NOT fal.ai lip-sync endpoints. The pipeline already works end-to-end:

1. **Face detection:** `detectFacesInImage()` / `detectFacesInClip()` using `@mediapipe/tasks-vision@0.10.18` with 478-point FaceMesh, VIDEO + IMAGE modes.
2. **Mouth sprites:** `castGenerateMouthSpritesForCharacter()` (`js/17c-create-pipeline.js:3660`) generates 3 mouth variants (closed/half/open) via Gemini 768x768.
3. **Overlay compositing:** `buildOverlayInstructions()` + `composeMouthSprite()` map audio amplitude to mouth states per frame.
4. **Export rendering:** `js/11-export.js:216-248` composites mouth sprites onto video frames during export.

**Two lip-sync tiers (already implemented):**
- **Tier 1 (Stori Sync):** MediaPipe face detection → sprite selection per frame → canvas compositing. Free, runs client-side.
- **Tier 2 (Kling):** `fal-ai/kling-video/lipsync/audio-to-video` (~$0.014/sec). Higher quality but paid. Auto-fallback to Tier 1 on failure (`js/17c-create-pipeline.js:4016-4191`).

No new lip-sync code is needed for LoRA Studio. The existing pipeline automatically works with any ElevenLabs voice_id — the only integration point is that `voiceProfile.elevenlabsVoiceId` feeds into `generateTTSElevenLabs()` which produces the audio that the lip-sync system consumes.

#### Narrator voice picker (separate from character voice)

**Gap identified:** The narrator (voice-only or with talking-head portrait) currently has NO voice picker UI. The narrator's voice is resolved via fallback logic in `castResolveVoiceForSpeaker()` (`js/17b-create-references.js:3153-3179`), which defaults to Gemini "Kore" voice. There is no way for users to assign a cloned ElevenLabs voice to the narrator.

**Solution:** Add a **Narrator Voice Picker** to the video generation flow (in the create pipeline, NOT in LoRA Studio). This picker appears when:
- A narrator is added to the video (voice-only or talking-head mode)
- User defines voice for the narrator during cast/character setup

The narrator voice picker shows the same voice catalog as the LoRA character library picker:
1. **Cloned voices from LoRA characters** — voices the user has already cloned
2. **ElevenLabs built-in voices** — curated presets (Aria, Marcus, etc.)
3. **Gemini voices** — the 8 hardcoded voices already in the catalog (`js/17b-create-references.js:823-836`)

**Key difference from character voice:** The narrator voice picker is used during video generation setup, NOT during LoRA training. It does NOT create a new voice clone — it selects from existing voices. The selected voice_id is stored on the narrator's cast entry, not on a LoRA item.

**Implementation location:** `js/17b-create-references.js`, in the narrator creation flow (around line 2847-2861). Add a voice selection step that populates the narrator's voice property before TTS generation.

```javascript
// Narrator voice selection (new)
// When user adds a narrator, show voice picker overlay
function _openNarratorVoicePicker(narratorCastEntry, onSelect) {
  // Reuse the same voice library UI as LoRA character picker
  // but opened in narrator context (not character context)
  // Include all 3 voice sources: cloned, ElevenLabs presets, Gemini voices
  const voices = _getFullVoiceCatalog(); // includes Gemini voices unlike character picker
  _renderVoicePickerOverlay(voices, selectedVoiceId => {
    narratorCastEntry.voice = selectedVoiceId;
    onSelect(selectedVoiceId);
  });
}
```

**Where this lives in the flow:**
- NOT in LoRA Studio (narrator is not a LoRA item)
- In the create pipeline's character/cast setup (`js/17b-create-references.js`)
- Triggered when user taps "Add Narrator" or edits narrator settings
- The voice strip UI for narrator (currently missing per `js/17b-create-references.js:1163`) needs to be added

#### Voice data flow

```
voiceProfile.source === 'cloned':
  User uploads audio → ElevenLabs IVC → voice_id stored
  Audio sample stored in IDB: lora_v2_{id}_voice_sample

voiceProfile.source === 'library':
  User picks from library → voice_id stored directly
  No audio sample stored (library voices are ElevenLabs-hosted)
```

#### ElevenLabs API key

Stored alongside the fal.ai API key in the BYOK credential store:
```
localStorage: stori_elevenlabs_api_key -> string
```

Prompted on first voice action if not set. Same pattern as fal.ai key entry.

#### Scaling constraint

ElevenLabs Pro plan caps at **160 voice clones** per account. This is the first hard ceiling on Stori's talking-head user count. Surfaced in Open Questions (§15).

### 3.8 Fine-Tuning Panel (shared across all paths, shown after training completes)

```html
<div id="lora-tuning-panel" class="lora-tuning-panel hidden">
  <h4 class="text-sm">Fine-tune</h4>
  
  <!-- 3 preview images -->
  <div class="tuning-preview-row" id="tuning-previews">
    <div class="tuning-preview" id="tuning-preview-0"></div>
    <div class="tuning-preview" id="tuning-preview-1"></div>
    <div class="tuning-preview" id="tuning-preview-2"></div>
  </div>
  
  <!-- Tier 1: Free sliders -->
  <div class="tuning-tier1">
    <div class="tuning-slider-row">
      <label class="text-xs">Identity strength</label>
      <input type="range" id="slider-lora-scale" min="0.5" max="1.2" step="0.05" value="0.9">
      <span id="val-lora-scale" class="text-xs">0.9</span>
    </div>
    <div class="tuning-slider-row">
      <label class="text-xs">Realism</label>
      <input type="range" id="slider-guidance" min="2" max="8" step="0.5" value="2.5">
      <span id="val-guidance" class="text-xs">2.5</span>
    </div>
    <button id="btn-shuffle-seed" class="btn-xs">Shuffle variations</button>
  </div>
  
  <!-- Tier 2: Refine toggle -->
  <div class="tuning-tier2">
    <label class="tuning-toggle-row">
      <input type="checkbox" id="toggle-refine">
      <span class="text-xs">Photoreal enhance</span>
      <span class="text-2xs text-muted">(~$0.04/image, FLUX.2 refine pass)</span>
    </label>
  </div>
  
  <!-- Apply button -->
  <button id="btn-tuning-apply" class="btn-sm primary">Apply &amp; Regenerate Previews</button>
  
  <!-- Lock/Unlock -->
  <div class="tuning-lock-row">
    <button id="btn-lora-lock" class="btn-xs">Lock</button>
    <button id="btn-lora-retrain" class="btn-xs">Retrain</button>
  </div>
</div>
```

### 3.8 LoRA Card (in the studio grid)

```html
<div class="studio-card" data-item-id="{id}">
  <div class="studio-card-head">
    <span class="studio-card-badge studio-card-badge--{type}">{TYPE_LABEL}</span>
    <span class="studio-card-name">{name}</span>
    {locked ? '<span class="studio-lock-icon">🔒</span>' : ''}
    <button class="studio-card-menu" data-menu-item="{id}">...</button>
  </div>
  <div class="studio-card-preview">
    <!-- Show first preview image or photo thumbnail -->
    <img src="{previewDataUrl}" alt="">
  </div>
  <div class="studio-card-status">
    <!-- status badge: idle | generating | reviewing | training | ready | error -->
  </div>
  <div class="studio-card-compat">
    <!-- compatibility pills: "Scene" "Talking Head" or "Product" -->
  </div>
</div>
```

---

## 4. Phase Breakdown

### Phase 1: Data Model + Migration (est. 2 hours)

**Goal:** New storage schema is in place; existing data migrated seamlessly.

1. Define `ITEMS_KEY = 'stori_lora_items_v2'` and all IDB key patterns.
2. Implement `getItems()`, `saveItems()`, `getItemById()`, `saveItem()`, `deleteItem()`.
3. Implement `_migrateV1ToV2()`:
   - Read `stori_lora_products_v1`. For each product, create a v2 item with `type: 'product'`, `trainerType: 'flux-fast'`, copy all fields, set `compatibleWith: ['product']`, set default `tuningParams`.
   - Remap IDB keys: `lora_{productId}_photo_{idx}` -> `lora_v2_{id}_photo_{idx}`, `lora_{productId}_preview` -> `lora_v2_{id}_preview_0`.
   - Read `stori_lora_characters_v1`. For each character, create v2 item with `type: 'talking-head'`, `trainerType: 'flux-fast'` (matching current behavior), `compatibleWith: ['talking-head']`.
   - Remap IDB keys: `lora_char_{charId}_photo_{idx}` -> `lora_v2_{id}_photo_{idx}`, `lora_char_{charId}_preview` -> `lora_v2_{id}_preview_0`.
   - After successful migration, write a sentinel `stori_lora_migrated_v2 = 'true'` to localStorage.
   - On subsequent loads, skip migration if sentinel exists.
4. Implement backward-compat shim `window.LoraLibrary` that delegates to `window.LoraStudio`.
5. Verify `_getSceneLoraContext()` in `js/17c-create-pipeline.js` still works with the shim.

**Dependencies:** None. This is the foundation.

**Entry criteria:** Current system works.
**Exit criteria:** All existing LoRAs survive a page reload with the new code. `_getSceneLoraContext()` returns identical results. Old localStorage keys are read once, new keys written.

### Phase 2: Studio Landing Page + Card Grid (est. 3 hours)

**Goal:** Replace the two-tab Library page with the unified LoRA Studio grid.

1. Replace `#library-page` HTML block (index.html lines 2897-2932) with `#lora-studio-page` structure.
2. Remove `#char-create-modal` HTML block (index.html lines 5909-5944).
3. Implement `openStudio()` and `closeStudio()` navigation functions, reusing the existing pattern (hide drop-zone, show studio page, show back buttons).
4. Implement `renderStudio()`:
   - Read all items via `getItems()`.
   - Apply filter (all / product / talking-head / scene-real / scene-ai).
   - Build card HTML for each item via `_buildStudioCardHTML(item)`.
   - Wire card click -> open detail/tuning panel.
   - Wire menu button -> delete/retrain options.
5. Implement filter tab switching (same pattern as current `switchLibraryTab()`).
6. Wire `#btn-new-lora` -> open path selection modal.
7. Update CSS: new `.studio-*` class rules.

**Dependencies:** Phase 1 (data model).

### Phase 3: Path Selection + Input Modals (est. 4 hours)

**Goal:** Four path-specific input flows with guided upload.

1. Implement path selection modal show/hide logic.
2. Implement `_openInputModal(path)` that configures `#lora-input-modal` for the selected path:
   - Creates a new LoRA item in the data store with the right type.
   - Renders the path-specific upload area.
3. **Path A upload handler:**
   - Standard multi-file input. Store photos in IDB as `lora_v2_{id}_photo_{idx}`.
   - Run quality checks on each photo (see Section 7).
   - Show photo grid with thumbnails and quality badges.
   - Enable "Train LoRA" button when 5-15 photos pass quality checks.
4. **Path B upload handler:**
   - 5 guided slots with reference images.
   - Run quality checks per slot (resolution >= 1024px, face detected for slots 0-2).
   - Store in IDB as `lora_v2_{id}_photo_{idx}` (idx 0-4).
   - "Generate Training Images" button -> calls grid generation pipeline (Phase 5).
5. **Path C1 upload handler:**
   - 3 outfit groups x 6 slots = 18 total.
   - Outfit description text inputs stored in `outfitLabels[]`.
   - Quality checks per slot.
   - Enable "Train LoRA" when all 18 slots filled and pass checks.
6. **Path C2 input handler:**
   - 1-2 reference image upload + text description.
   - "Generate Training Images" button -> calls grid generation pipeline (Phase 5).
7. Implement modal close with data cleanup (delete empty items with no name/photos).

**Dependencies:** Phase 2 (studio page exists).

### Phase 4: Training Flow (est. 3 hours)

**Goal:** Submit training jobs to the correct fal endpoint and poll until done.

1. Implement `trainItem(id)`:
   - Determine trainer endpoint from item type:
     - `product` -> `fal-ai/flux-lora-fast-training`, steps 1500
     - `talking-head` -> `fal-ai/flux-lora-portrait-trainer`, steps 2000
     - `scene-real` -> `fal-ai/flux-lora-portrait-trainer`, steps 2000
     - `scene-ai` -> `fal-ai/qwen-image-trainer`, steps 2000
   - Generate trigger word: `LORA${id.slice(-6).toUpperCase()}`
   - Collect training images from IDB:
     - For paths A and C1: use `lora_v2_{id}_photo_{idx}` directly.
     - For paths B and C2: use `lora_v2_{id}_train_{idx}` (AI-generated images).
   - Build training ZIP in browser using JSZip:
     - For each image: `cell_{idx:02}.png` + `cell_{idx:02}.txt` (caption)
     - Upload ZIP to fal via data URL or blob URL.
   - Submit to the correct endpoint with schema-specific params:
     - FLUX portrait: `{ images_data_url, trigger_phrase, steps, create_masks: true }`
     - Qwen: `{ image_data_url, trigger_phrase, steps, learning_rate: 5e-4 }`
     - FLUX fast: `{ images_data_url, trigger_word, steps }`
   - Store `falRequestId`, set `loraStatus: 'training'`.
2. Implement `_pollUntilDone(id, requestId)`:
   - Reuse existing pattern from current code.
   - Add progress phase updates for paths B/C2:
     - `progressPhase: 'Preparing training images...'` (0-5%)
     - `progressPhase: 'Learning facial features...'` (5-30%)
     - `progressPhase: 'Learning body proportions...'` (30-60%)
     - `progressPhase: 'Refining identity details...'` (60-90%)
     - `progressPhase: 'Final quality checks...'` (90-100%)
   - On completion: extract `loraUrl` from response (handle both `diffusers_lora_file.url` and `lora_file.url`).
   - Store `configUrl` if present.
   - Set `loraStatus: 'ready'`, trigger preview generation.
3. Implement `_resumePendingTraining()`:
   - On page load, find all items with `loraStatus === 'training'` and `falRequestId`.
   - Resume polling for each.
4. Caption generation for training data:
   - For paths A/C1: `"{trigger}, {description}"` (simple).
   - For paths B/C2: `"{trigger}, {outfit_short_label}, {pose_lighting_description}"` (outfit-aware captions matching the DOE captions.py format).

**Dependencies:** Phase 3 (input modal collects photos).

### Phase 5: Training Image Generation Pipeline (est. 4 hours)

**Goal:** For paths B and C2, generate 18 training images via Gemini Pro 3x3 grids.

1. Implement `_generateTrainingGrids(itemId)`:
   - Set `loraStatus: 'generating'`, `progressPhase: 'Preparing training images...'`.
   - Get Gemini key via `getCreateGeminiKey()`.
   - For 3 outfit themes (`formal`, `smart_casual`, `casual`):
     a. Build grid prompt using the same template as `grid_prompt.py`:
        - 2048x2048 canvas, 3x3 grid, 9 cell descriptions with pixel coordinates.
        - Character appearance block from user's description.
        - Outfit-specific clothing description.
     b. Attach user's uploaded photos as inline reference images (identity transfer).
     c. Append identity-transfer instruction to prompt.
     d. Call Gemini Pro (`gemini-3-pro-image-preview`) via existing `generateGridImage()` or direct fetch.
     e. Upscale 2x using `createUpscaleAndCrop()` (existing function at line 2913).
     f. Crop 9 cells with 2% edge trim.
     g. Resize each cell to 1024x1024 via canvas.
     h. Store cells in IDB as `lora_v2_{id}_train_{gridIdx * 9 + cellIdx}`.
   - Total: 3 grids x 9 cells = 27 images. Keep best 18 (or all 27 if quality is fine).
   - Set `trainImageCount`, `loraStatus: 'reviewing'`.
   - Show review grid for user to reject bad images.
2. Implement `_buildGridPromptForItem(item, outfitKey)`:
   - Mirror the Python `grid_prompt.py` template.
   - Use `item.description` as the character appearance block.
   - 9 cell descriptions: same as `CELL_DESCRIPTIONS` in `grid_prompt.py`.
3. Implement `_buildOutfitDescription(outfitKey)`:
   - 3 default outfit themes (user can override for C2).
   - For path B: generate outfit descriptions based on what user is wearing in uploaded photos, or use defaults.
4. Review grid UI:
   - Display all generated training images in a grid.
   - Each image has a reject button (X overlay on hover).
   - Rejecting removes from IDB and decrements `trainImageCount`.
   - "Train LoRA" button enabled when `trainImageCount >= 18`.
   - If too many rejected, show "Regenerate" button.

**Dependencies:** Phase 3 (upload modal), Phase 4 (training can consume the generated images).

### Phase 6: Preview Generation + Fine-Tuning (est. 3 hours)

**Goal:** Generate 3 preview images after training; implement two-tier fine-tuning with Apply button.

1. Implement `_generatePreviews(itemId)`:
   - 3 scene-specific prompts depending on item type:
     - **Product:** `"{trigger} product photo, clean white background"`, `"{trigger} product, wooden surface, warm lighting"`, `"{trigger} product, lifestyle setting, soft bokeh"`
     - **Talking-head:** `"{trigger}, casual outdoor portrait, park bench, golden hour"`, `"{trigger}, formal office portrait, seated, soft lighting"`, `"{trigger}, smart-casual, cafe setting, walking"`
     - **Scene-real / Scene-ai:** Same 3 prompts as talking-head but with full identity anchors (age, ethnicity, outfit description per DOE `generate_image.py` pattern).
   - For each prompt:
     a. Call inference endpoint (FLUX or Qwen depending on `trainerType`).
     b. Use current `tuningParams` (lora_scale, guidance_scale, seed).
     c. If `refineEnabled`, run FLUX.2 refine pass after inference.
     d. Store result in IDB as `lora_v2_{id}_preview_{idx}`.
   - Set `previewGenerated: true`.
2. Implement fine-tuning panel rendering:
   - Load 3 preview images from IDB, display in `#tuning-previews`.
   - Set slider values from `tuningParams`.
   - Wire slider change events (update display value, but do NOT regenerate yet).
   - Wire "Shuffle variations" -> set `tuningParams.seed` to `Math.floor(Math.random() * 2**31)`.
   - Wire "Photoreal enhance" toggle -> set `tuningParams.refineEnabled`.
   - **Apply button** -> save tuningParams to item, call `_generatePreviews(itemId)` again.
   - Each Apply = 3 inference calls. Cost: ~$0.06 (Qwen) or ~$0.03 (FLUX). If refine enabled, +$0.12.
3. Implement `_runFlux2Refine(dataUrl, prompt, item)`:
   - Upload image to fal via data URL.
   - Call `fal-ai/flux-2/lora/edit` with:
     ```javascript
     {
       prompt: refinedPrompt,   // "Natural editorial photograph, soft natural skin tones..."
       image_urls: [uploadedUrl],
       loras: [],               // no custom LoRA in refine pass
       num_inference_steps: 40,
       guidance_scale: 2.5,
       seed: item.tuningParams.seed,
       output_format: 'jpeg',
       image_size: { width: 720, height: 1280 }
     }
     ```
   - Prompt style: "Natural editorial photograph, soft natural skin tones, real photography aesthetic, fujifilm color science, professional candid photography." NO "visible pores", "imperfections", "blemishes" (these cause freckling per DOE iter 2.6).

**Dependencies:** Phase 4 (training produces loraUrl).

### Phase 7: Lock/Unlock/Retrain (est. 1.5 hours)

**Goal:** State transitions for locked items and retrain flow.

1. **Lock:** Set `item.locked = true`. UI: card shows lock icon, sliders disabled, delete/retrain buttons hidden, only "Unlock" button visible.
2. **Unlock:** Set `item.locked = false`. Requires confirmation dialog.
3. **Retrain:**
   - Confirmation dialog: "This will archive the current LoRA and start fresh. You can go back to the archived version."
   - Push current state to `archivedVersions[]`:
     ```javascript
     {
       loraUrl: item.loraUrl,
       configUrl: item.configUrl,
       trainCompleted: item.trainCompleted,
       tuningParams: { ...item.tuningParams },
       triggerWord: item.triggerWord,
     }
     ```
   - Reset: `loraStatus: 'idle'`, `loraUrl: null`, `configUrl: null`, `previewGenerated: false`.
   - Clear IDB preview keys.
   - Re-open input modal for the same path type, pre-populated with existing photos.
4. **Restore archived version:**
   - In the card menu, show "Previous versions" if `archivedVersions.length > 0`.
   - Clicking an archived version restores its loraUrl, configUrl, tuningParams, triggerWord.
   - Sets `loraStatus: 'ready'`.
   - Triggers preview regeneration with restored params.

**Dependencies:** Phase 6 (tuning panel exists).

### Phase 8: Assets Section + Compatibility (est. 2 hours)

**Goal:** Update the Assets section in the create pipeline to work with new item types and compatibility badges.

1. Update `renderAssetsSection()`:
   - Character pickers now show compatibility info.
   - If user tries to assign a `talking-head` LoRA to a scene video, show warning: "This LoRA is optimized for talking-head videos. For scene videos, train a Scene Character LoRA."
   - `scene-real` and `scene-ai` items are compatible with both scene and talking-head.
   - `product` items are compatible with product showcase videos only.
2. Update character picker dropdown:
   - Show compatibility pills next to each character.
   - Group by type: "Scene Characters" section, "Talking Head Characters" section.
3. Update `isLoraBlocking()` and `updateLaunchImageButton()`:
   - Same logic, reading from `getItems()` instead of separate getProducts/getCharacters.
4. Update `_getSceneLoraContext()` in `js/17c-create-pipeline.js`:
   - No changes needed if backward-compat shim works.
   - But verify: items now have `trainerType` which determines inference endpoint. The function currently always uses `fal-ai/flux-lora`. Must now check `item.inferenceEndpoint` and use the correct one.
   - For Qwen-trained LoRAs: inference via `fal-ai/qwen-image`.
   - For FLUX-trained LoRAs: inference via `fal-ai/flux-lora`.

**Dependencies:** Phase 2 (studio exists), Phase 1 (data model).

### Phase 9: CSS + Polish (est. 2 hours)

**Goal:** Complete styling for all new UI elements.

1. Replace CSS lines 7813-8117 with new `.studio-*` rules.
2. New CSS classes needed (see Section below).
3. Responsive adjustments for mobile.
4. Dark/light theme compliance (all colors use CSS variables already defined).

**Dependencies:** All previous phases.

### Phase 10: Reference Image Assets (est. 1 hour)

**Goal:** Crop reference images from DOE sample grids and place in `assets/lora-refs/`.

See Section 14 for exact crop coordinates and filenames.

**Dependencies:** None (can be done in parallel).

### Phase 11: Voice Integration (est. 5 hours)

**Goal:** Add optional voice cloning / library selection to character LoRA items, and narrator voice picker.

1. **ElevenLabs API key entry:** Add `stori_elevenlabs_api_key` to BYOK credential store. Prompt on first voice action if not set. Same UI pattern as fal.ai key entry.
2. **Voice section in character input modals (Paths B, C1, C2):**
   - Add voice section HTML below photo inputs, above action button.
   - Empty state: "Upload / Record" and "Pick from Library" buttons.
   - Filled state: voice name, metadata, ✓ CLONED / LIBRARY badge, Replace/Remove buttons.
   - Wired to open voice upload modal or voice library picker.
3. **Voice upload/record modal:**
   - Upload tab: file picker for audio (MP3, WAV, M4A, OGG), waveform viz, duration check, quality tips, consent checkbox.
   - Record tab: microphone MediaRecorder API, live waveform, timer, stop → same playback UI.
   - Clone button → ElevenLabs IVC `POST /v1/voices/add`. Store returned `voice_id` in `item.voiceProfile`.
   - Store audio sample in IDB as `lora_v2_{id}_voice_sample`.
4. **Voice library picker (shows actual stored voices):**
   - **Cloned voices section:** Aggregate all LoRA characters that have `voiceProfile.source === 'cloned'`. De-duplicate by `elevenlabsVoiceId`. Show source character name, duration, language.
   - **ElevenLabs preset section:** Curated list of ElevenLabs built-in voices (pre-configured voice_ids).
   - Search + filter (language, gender).
   - Play preview via ElevenLabs TTS preview endpoint.
   - Select → store voice_id in `item.voiceProfile` with `source: 'library'`.
5. **Voice in card detail:** Character cards show voice status row in metadata. "Add Voice" / "Replace Voice" / "Remove Voice" actions.
6. **Voice at generation time (character):** When generating clips with a LoRA character, check `item.voiceProfile`. If `elevenlabsVoiceId` is set, pass it to `generateTTSElevenLabs()` (existing function in `js/17a-create-api.js:841`). The resulting audio feeds into the existing MediaPipe lip-sync pipeline automatically — no new lip-sync code needed.
7. **Narrator voice picker (new UI in create pipeline):**
   - Add voice picker overlay to narrator creation flow in `js/17b-create-references.js` (around line 2847-2861).
   - Shows 3 voice sources: cloned voices from LoRA characters, ElevenLabs presets, Gemini voices (the 8 hardcoded voices at line 823-836).
   - Unlike the LoRA character library picker, this INCLUDES Gemini voices (since narrator currently defaults to Gemini Kore).
   - Selected voice_id stored on the narrator's cast entry, NOT on a LoRA item.
   - Add voice strip UI for narrator (currently missing per line 1163 — voice strip only renders for characters, not narrator).
   - Update `castResolveVoiceForSpeaker()` (line 3153-3179) to check the narrator's voice property before falling back to Gemini Kore.
8. **Lip-sync integration note:** No new lip-sync code needed. The existing MediaPipe pipeline (`js/30-lipsync.js`) works with any audio source. The two-tier system (Tier 1: MediaPipe sprite overlay, Tier 2: Kling fal.ai with auto-fallback) continues to work as-is. The only integration point is that `voiceProfile.elevenlabsVoiceId` feeds into `generateTTSElevenLabs()` → audio → lip-sync pipeline.

**Dependencies:** Phase 3 (input modals exist), Phase 1 (data model has voiceProfile field).

**Critical files for Phase 11:**
- `js/34-lora-library.js` — voice section in LoRA input modals, voice library picker
- `js/17b-create-references.js` — narrator voice picker, voice strip UI for narrator, `castResolveVoiceForSpeaker()` update
- `js/17a-create-api.js` — ElevenLabs IVC clone call (new), TTS call (existing, no change needed)
- `js/30-lipsync.js` — no changes needed (existing pipeline works)
- `js/17c-create-pipeline.js` — no changes needed (existing lip-sync prep works)
- `js/11-export.js` — no changes needed (existing lip-sync compositing works)

---

## 5. Constants and Configuration

```javascript
// ── Storage keys ──
const ITEMS_KEY         = 'stori_lora_items_v2';
const FAL_KEY_LS        = 'stori_fal_api_key';
const MIGRATED_KEY      = 'stori_lora_migrated_v2';
const IDB_DB_NAME       = 'stori_lora_photos';
const IDB_STORE_NAME    = 'photos';
const IDB_VERSION       = 2;

// ── Photo constraints ──
const PRODUCT_MIN_PHOTOS     = 5;
const PRODUCT_MAX_PHOTOS     = 15;
const TH_MANDATORY_PHOTOS    = 4;   // front, left profile, right profile, waist-up
const TH_OPTIONAL_PHOTOS     = 1;   // full body
const TH_MAX_PHOTOS          = 5;
const SCENE_REAL_PHOTOS      = 18;  // 6 per outfit x 3 outfits
const SCENE_AI_MAX_REFS      = 2;
const MIN_TRAINING_IMAGES    = 18;

// ── Quality thresholds ──
const MIN_RESOLUTION_PRODUCT = 768;
const MIN_RESOLUTION_CHAR    = 1024;
const BLUR_LAPLACIAN_THRESH  = 100;  // Laplacian variance threshold

// ── Training config ──
const PRODUCT_TRAIN_STEPS    = 1500;
const CHAR_TRAIN_STEPS       = 2000;
const POLL_MS                = 15000;
const TRAIN_TIMEOUT_MS       = 45 * 60 * 1000;  // 45 min

// ── Trainer endpoints ──
const TRAINERS = {
  'flux-portrait': {
    endpoint: 'fal-ai/flux-lora-portrait-trainer',
    inference: 'fal-ai/flux-lora',
    costPerStep: 0.0024,
    minStepsBilled: 1000,
    paramKey: 'images_data_url',       // plural
    triggerKey: 'trigger_phrase',
    resultLoraKey: 'diffusers_lora_file',
    extraParams: { create_masks: true },
  },
  'qwen': {
    endpoint: 'fal-ai/qwen-image-trainer',
    inference: 'fal-ai/qwen-image',
    costPerStep: 0.002,
    minStepsBilled: 250,
    paramKey: 'image_data_url',        // singular
    triggerKey: 'trigger_phrase',
    resultLoraKey: 'lora_file',
    extraParams: { learning_rate: 5e-4 },
  },
  'flux-fast': {
    endpoint: 'fal-ai/flux-lora-fast-training',
    inference: 'fal-ai/flux-lora',
    costPerStep: null,                 // bundled pricing
    minStepsBilled: null,
    paramKey: 'images_data_url',       // plural
    triggerKey: 'trigger_word',        // different key name
    resultLoraKey: 'diffusers_lora_file',
    extraParams: {},
  },
};

// ── Fine-tuning defaults ──
const DEFAULT_TUNING = {
  lora_scale: 0.9,
  guidance_scale_qwen: 2.5,
  guidance_scale_flux: 3.5,
  seed: Math.floor(Math.random() * 2147483647),
  refineEnabled: false,
};

// ── Inference image size ──
const INFERENCE_IMAGE_SIZE_QWEN = 'portrait_16_9';     // ~768x1344
const INFERENCE_IMAGE_SIZE_FLUX = 'landscape_16_9';     // depends on use

// ── FLUX.2 refine endpoint ──
const FLUX2_REFINE_ENDPOINT = 'fal-ai/flux-2/lora/edit';
const FLUX2_REFINE_STEPS    = 40;
const FLUX2_REFINE_GUIDANCE = 2.5;

// ── Gemini grid generation ──
const GRID_MODEL_CHAIN = [
  { id: 'gemini-3-pro-image-preview',     usesImageConfig: true,  costUsd: 0.134 },
  { id: 'gemini-3.1-flash-image-preview', usesImageConfig: true,  costUsd: 0.101 },
  { id: 'gemini-2.5-flash-image',         usesImageConfig: false, costUsd: 0.039 },
];
const GRID_CANVAS_SIZE   = 2048;
const GRID_CELL_COUNT    = 9;
const GRID_TRIM_PCT      = 0.02;
const TRAINING_CELL_SIZE = 1024;

// ── Outfit themes (for grid generation) ──
const OUTFIT_THEMES = {
  formal:       { shortLabel: 'white button-up shirt black trousers',   desc: 'a crisp white button-up shirt...' },
  smart_casual: { shortLabel: 'navy polo and beige chinos',            desc: 'a navy blue polo shirt...' },
  casual:       { shortLabel: 'light gray sweater dark jeans',          desc: 'a light gray crewneck sweater...' },
};

// ── Grid cell descriptions (9 cells) ──
const GRID_CELL_DESCRIPTIONS = [
  'Front-facing portrait, neutral expression, soft studio lighting, plain white background',
  '3/4 angle portrait (face turned slightly right), slight natural smile, soft window light',
  'Left profile view, neutral expression, side rim lighting, white background',
  'Close-up face (head+shoulders), looking slightly off-camera, dramatic Rembrandt lighting, dark bg',
  'Full body standing, arms relaxed, neutral expression, even studio lighting, light gray bg',
  '3/4 angle portrait (face turned slightly left), contemplative, soft diffused natural light',
  'Candid genuine laugh, head slightly tilted, outdoor soft overcast daylight, blurred greenery bg',
  'Professional headshot, front-facing, neutral pleasant expression, even soft lighting',
  'Looking slightly upward, contemplative, moody directional light from upper-right, dark bg',
];

// ── Preview scene prompts ──
const PREVIEW_PROMPTS = {
  product: [
    '{trigger} product photo, clean white background, professional photography, sharp focus',
    '{trigger} product, rustic wooden surface, warm soft lighting, lifestyle setting',
    '{trigger} product, minimalist shelf, bright natural window light, modern interior',
  ],
  'talking-head': [
    '{trigger}, {identity}, casual outdoor portrait, park bench, golden-hour sunlight, photorealistic',
    '{trigger}, {identity}, formal office portrait, seated at desk, soft even lighting, photorealistic',
    '{trigger}, {identity}, smart-casual, cafe interior, walking, natural candid moment, photorealistic',
  ],
  scene: [
    '{trigger}, {identity}, standing in a modern kitchen holding a coffee mug, soft morning window light, photorealistic',
    '{trigger}, {identity}, sitting on a park bench in autumn, warm golden-hour sunlight, photorealistic',
    '{trigger}, {identity}, at an office desk smiling warmly, soft professional lighting, photorealistic',
  ],
};

// ── ElevenLabs preset voices (voice library) ──
const ELEVENLABS_PRESET_VOICES = [
  // Curated subset of ElevenLabs' public voice library
  // voice_ids populated from ElevenLabs API during implementation
  { voiceId: null, name: 'Aria',   language: 'en', gender: 'female', desc: 'Warm, conversational' },
  { voiceId: null, name: 'Marcus', language: 'en', gender: 'male',   desc: 'Deep, authoritative' },
  { voiceId: null, name: 'Sofia',  language: 'es', gender: 'female', desc: 'Bilingual ES/EN' },
  { voiceId: null, name: 'Raj',    language: 'hi', gender: 'male',   desc: 'Bilingual HI/EN' },
  { voiceId: null, name: 'Claire', language: 'fr', gender: 'female', desc: 'Bilingual FR/EN' },
  { voiceId: null, name: 'James',  language: 'en', gender: 'male',   desc: 'Professional, clear' },
];

// ── Refine prompt template (Tier 2) ──
const REFINE_PROMPT_TEMPLATE = 
  'Natural editorial photograph, soft natural skin tones, real photography aesthetic, ' +
  '{sceneDesc}, fujifilm color science, professional candid photography';

// ── Progress phases (user-visible labels) ──
const PROGRESS_PHASES = [
  { pct: 0,  label: 'Preparing training images...' },
  { pct: 5,  label: 'Learning facial features...' },
  { pct: 30, label: 'Learning body proportions...' },
  { pct: 60, label: 'Refining identity details...' },
  { pct: 90, label: 'Final quality checks...' },
];
```

---

## 6. API Integration -- Exact Schemas

### 6.1 FLUX Portrait Trainer

**Submit:**
```
POST https://queue.fal.run/fal-ai/flux-lora-portrait-trainer
Authorization: Key {falKey}
Content-Type: application/json

{
  "input": {
    "images_data_url": "<uploaded zip URL or array of data URLs>",
    "trigger_phrase": "LORA_XXXXXX",
    "steps": 2000,
    "create_masks": true
  }
}
```

**Response:** `{ "request_id": "..." }`

**Poll:** `GET https://queue.fal.run/fal-ai/flux-lora-portrait-trainer/requests/{requestId}/status`

**Result:** `GET https://queue.fal.run/fal-ai/flux-lora-portrait-trainer/requests/{requestId}`
```json
{
  "diffusers_lora_file": { "url": "https://...", "content_type": "...", "file_name": "..." },
  "config_file": { "url": "https://...", "content_type": "...", "file_name": "..." }
}
```

**Inference:** `POST https://fal.run/fal-ai/flux-lora`
```json
{
  "prompt": "...",
  "loras": [{ "path": "<loraUrl>", "scale": 0.9 }],
  "image_size": "landscape_16_9",
  "num_images": 1,
  "output_format": "jpeg"
}
```

### 6.2 Qwen Image Trainer

**Submit:**
```
POST https://queue.fal.run/fal-ai/qwen-image-trainer
Authorization: Key {falKey}
Content-Type: application/json

{
  "input": {
    "image_data_url": "<uploaded zip URL>",
    "trigger_phrase": "LORA_XXXXXX",
    "steps": 2000,
    "learning_rate": 0.0005
  }
}
```

NOTE: `image_data_url` (singular), NOT `images_data_url`.

**Result:**
```json
{
  "lora_file": { "url": "https://..." },
  "config_file": { "url": "https://..." }
}
```

NOTE: `lora_file` (not `diffusers_lora_file`).

**Inference:** `POST https://fal.run/fal-ai/qwen-image`
```json
{
  "prompt": "...",
  "loras": [{ "path": "<loraUrl>", "scale": 0.9 }],
  "image_size": "portrait_16_9",
  "num_inference_steps": 30,
  "guidance_scale": 2.5,
  "num_images": 1,
  "seed": 42,
  "output_format": "jpeg"
}
```

### 6.3 FLUX Fast Trainer (products)

**Submit:**
```
POST https://queue.fal.run/fal-ai/flux-lora-fast-training
Authorization: Key {falKey}
Content-Type: application/json

{
  "input": {
    "images_data_url": "<array of data URLs or zip URL>",
    "trigger_word": "LORA_XXXXXX",
    "steps": 1500
  }
}
```

NOTE: `trigger_word` (not `trigger_phrase`).

**Result:** `{ "diffusers_lora_file": { "url": "..." } }` or `{ "lora_file": { "url": "..." } }`
(check both keys).

### 6.4 FLUX.2 Refine (Tier 2)

```
POST https://fal.run/fal-ai/flux-2/lora/edit
Authorization: Key {falKey}
Content-Type: application/json

{
  "prompt": "Natural editorial photograph, soft natural skin tones...",
  "image_urls": ["<uploaded image URL>"],
  "loras": [],
  "num_inference_steps": 40,
  "guidance_scale": 2.5,
  "num_images": 1,
  "seed": 42,
  "output_format": "jpeg",
  "image_size": { "width": 720, "height": 1280 }
}
```

**Response:** `{ "images": [{ "url": "https://...", "width": 720, "height": 1280 }] }`

### 6.5 Gemini Pro Grid Generation

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent
x-goog-api-key: {geminiKey}
Content-Type: application/json

{
  "contents": [{ "parts": [
    { "inlineData": { "mimeType": "image/jpeg", "data": "<base64 ref photo 1>" } },
    { "inlineData": { "mimeType": "image/jpeg", "data": "<base64 ref photo 2>" } },
    { "text": "<grid prompt with identity transfer instruction>" }
  ]}],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": { "aspectRatio": "1:1", "imageSize": "2K" }
  }
}
```

---

## 7. Client-Side Quality Checks

### Resolution Check

```javascript
function _checkResolution(dataUrl, minPx) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const pass = img.naturalWidth >= minPx && img.naturalHeight >= minPx;
      resolve({
        pass,
        width: img.naturalWidth,
        height: img.naturalHeight,
        message: pass ? null : `Image is ${img.naturalWidth}x${img.naturalHeight}. Minimum ${minPx}x${minPx}.`,
      });
    };
    img.onerror = () => resolve({ pass: false, message: 'Failed to load image.' });
    img.src = dataUrl;
  });
}
```

### Blur Detection (Laplacian Variance)

```javascript
function _checkBlur(dataUrl, threshold = 100) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 256; // downscale for speed
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      
      // Convert to grayscale
      const gray = new Float32Array(size * size);
      for (let i = 0; i < size * size; i++) {
        gray[i] = 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2];
      }
      
      // Laplacian kernel convolution
      let sum = 0, count = 0;
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          const lap = -4 * gray[y*size + x]
            + gray[(y-1)*size + x] + gray[(y+1)*size + x]
            + gray[y*size + (x-1)] + gray[y*size + (x+1)];
          sum += lap * lap;
          count++;
        }
      }
      const variance = sum / count;
      const pass = variance >= threshold;
      resolve({
        pass,
        variance: Math.round(variance),
        message: pass ? null : 'Image appears blurry. Use a sharper photo.',
      });
    };
    img.onerror = () => resolve({ pass: false, message: 'Failed to load image.' });
    img.src = dataUrl;
  });
}
```

### Face Detection

The browser `FaceDetector` API (Shape Detection API) is available in Chromium-based browsers. Use with feature detection and graceful fallback:

```javascript
async function _checkFacePresent(dataUrl) {
  if (!('FaceDetector' in window)) {
    // API not available — skip check, warn user to verify manually
    return { pass: true, message: null, skipped: true };
  }
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });
  const detector = new FaceDetector({ maxDetectedFaces: 5, fastMode: true });
  const faces = await detector.detect(img);
  const pass = faces.length >= 1;
  return {
    pass,
    faceCount: faces.length,
    message: pass ? null : 'No face detected. Ensure the photo clearly shows a face.',
  };
}
```

### Combined Quality Check

```javascript
async function runQualityChecks(dataUrl, { minResolution, requireFace }) {
  const results = {};
  results.resolution = await _checkResolution(dataUrl, minResolution);
  results.blur = await _checkBlur(dataUrl);
  if (requireFace) results.face = await _checkFacePresent(dataUrl);
  results.allPassed = Object.values(results).every(r => r.pass !== false);
  return results;
}
```

Quality check config per path:

| Path | minResolution | requireFace | Slots requiring face |
|------|--------------|-------------|---------------------|
| A (Product) | 768 | false | none |
| B (Talking Head) | 1024 | true | slots 0-2 (front, left, right profile) |
| C1 (Scene Real) | 1024 | true | first 3 slots per outfit group |
| C2 (Scene AI) | 768 | false | none (reference images) |

---

## 8. Training Image Generation Pipeline (Paths B and C2)

### Step-by-step for Path B:

1. User uploads 4-5 photos to guided slots.
2. User clicks "Generate Training Images."
3. `loraStatus` -> `'generating'`.
4. For each of 3 outfit themes (`formal`, `smart_casual`, `casual`):
   a. Build grid prompt: 2048x2048, 3x3 grid, 9 cell descriptions.
   b. Prepend user's 4-5 photos as inlineData parts to the Gemini request.
   c. Append identity-transfer instruction:
      ```
      IDENTITY TRANSFER FROM REFERENCE IMAGES:
      The {N} reference image(s) attached above show this EXACT character.
      Generate the SAME PERSON in all 9 panels — match the facial features,
      build, hair length and style, eye shape and color, skin tone, and
      distinguishing marks from the reference images exactly. Only the OUTFIT
      changes — the person remains identical to the reference.
      ```
   d. Call Gemini Pro with model fallback chain (Pro -> 3.1 Flash -> 2.5 Flash).
   e. Receive 2K grid image as base64 data URL.
   f. Upscale 2x via canvas (Lanczos equivalent: `imageSmoothingQuality = 'high'`).
   g. Crop 9 cells with 2% edge trim using existing `cropGridCells()` function.
   h. Resize each cell to 1024x1024.
   i. Store in IDB: `lora_v2_{id}_train_{outfitIdx * 9 + cellIdx}`.
   j. Write outfit-aware caption for each cell: `"{trigger}, {outfitShortLabel}, {poseLightingDesc}"`.
5. Total: 27 training images. Display in review grid.
6. `loraStatus` -> `'reviewing'`.
7. User can reject bad images (click X). Each rejection removes from IDB and decrements count.
8. When user is satisfied (>= 18 images), clicks "Train LoRA."

### Caption generation function:

```javascript
function _buildCaption(triggerWord, outfitShortLabel, cellIdx) {
  return `${triggerWord}, ${outfitShortLabel}, ${GRID_CELL_DESCRIPTIONS[cellIdx]}`;
}
```

### Step-by-step for Path C2:

Same as Path B, except:
- Reference images are 1-2 concept art / sketches (not real photos).
- User provides a text description of the character.
- Grid prompt uses the text description as the character appearance block.
- Reference images are still attached as inlineData for visual anchoring.

---

## 9. Fine-Tuning System

### Tier 1 -- Free (inference parameter changes)

| Control | Maps to | Range | Default | Effect |
|---------|---------|-------|---------|--------|
| "Identity strength" slider | `lora_scale` param in `loras[0].scale` | 0.5 - 1.2 | 0.9 | Higher = more LoRA influence, lower = more base model |
| "Realism" slider | `guidance_scale` param | 2.0 - 8.0 | 2.5 (Qwen) / 3.5 (FLUX) | Higher = more prompt adherence, can reduce naturalness |
| "Shuffle variations" button | `seed` param | random int | random | Different noise seed = different composition |

**Apply flow:**
1. User adjusts one or more controls.
2. User clicks "Apply & Regenerate Previews."
3. Save updated `tuningParams` to the item.
4. Call `_generatePreviews(itemId)` with the new params.
5. 3 inference calls execute (+ 3 refine calls if Tier 2 enabled).
6. New previews replace old ones in IDB and UI.

### Tier 2 -- Photoreal Enhance (~$0.04/image)

- Toggle checkbox: `refineEnabled`.
- When enabled, after each inference call, the output image is passed through FLUX.2 img2img refine.
- Refine prompt template per scene (no character-specific terms -- the input image carries identity):
  ```
  Natural editorial photograph, soft natural skin tones, real photography aesthetic,
  {sceneDescription}, fujifilm color science, professional candid photography
  ```
- NEVER include: "visible pores", "imperfections", "blemishes", "slightly imperfect" (causes freckling artifacts per DOE iteration 2.6 findings).

---

## 10. Lock/Unlock/Retrain Mechanics

### State Machine

```
idle -> generating -> reviewing -> training -> ready
                          |                      |
                          v                      v
                        error                  locked
                          |                      |
                          v                      v
                   (user retries)           (unlock -> ready)
                                                 |
                                                 v
                                            (retrain -> idle)
```

### Lock:
- `item.locked = true`
- UI: 🔒 icon on card, all controls disabled, only "Unlock" visible.
- Locked items cannot be deleted, retrained, or have their tuning params changed.
- Locked items CAN still be assigned to projects and used for inference.

### Unlock:
- Confirm dialog: "Unlock this LoRA? Editing will be enabled."
- `item.locked = false`

### Retrain:
- Confirm dialog: "Archive current LoRA and start fresh training? The current version will be saved and can be restored."
- Archive current state to `archivedVersions[]`.
- Reset `loraStatus` to `'idle'`, clear `loraUrl`, `configUrl`, `previewGenerated`.
- Clear IDB preview keys for this item.
- Open input modal for the same path type.
- Photos remain in IDB -- user can modify or keep them.

### Restore:
- Card menu -> "Previous versions" (only if `archivedVersions.length > 0`).
- Show list of archived versions with date and params.
- Click to restore: copies archived loraUrl, configUrl, tuningParams, triggerWord back to the item.
- Sets `loraStatus: 'ready'`.
- Regenerates previews with restored params.

---

## 11. Preview Generation

### Preview prompts by type:

**Product (3 prompts):**
```javascript
[
  `${trigger} product photo, clean white background, professional studio photography, sharp focus`,
  `${trigger} product, rustic wooden surface, warm directional lighting, lifestyle setting`,
  `${trigger} product, minimalist white shelf, bright natural window light, modern interior`,
]
```

**Talking Head (3 prompts):**
```javascript
[
  `${trigger}, ${identity}, casual outdoor portrait sitting on a park bench, golden-hour sunlight, photorealistic, sharp focus`,
  `${trigger}, ${identity}, formal office portrait seated at a desk, soft even lighting, photorealistic, sharp focus`,
  `${trigger}, ${identity}, smart-casual cafe interior, walking naturally, candid moment, photorealistic, sharp focus`,
]
```

**Scene Character (3 prompts) -- used for both scene-real and scene-ai:**
```javascript
[
  `${trigger}, ${identity}, standing in a modern kitchen holding a white coffee mug, soft morning window light from the right, photorealistic, natural skin texture, sharp focus`,
  `${trigger}, ${identity}, sitting on a park bench in autumn, warm golden-hour sunlight, photorealistic, natural skin texture, sharp focus`,
  `${trigger}, ${identity}, at an office desk smiling warmly at camera, soft natural office lighting, photorealistic, natural skin texture, sharp focus`,
]
```

The `{identity}` placeholder is replaced with an explicit identity anchor string built from the item's description: e.g., "35-year-old Indian man with short black hair." This is critical per DOE findings -- prompts with only the trigger word often lose identity to base-model priors.

### Inference params for previews:

```javascript
const previewInferenceParams = {
  qwen: {
    num_inference_steps: 30,
    output_format: 'jpeg',
    image_size: 'portrait_16_9',
  },
  flux: {
    num_images: 1,
    output_format: 'jpeg',
    image_size: 'landscape_16_9',
  },
};
```

Plus `loras`, `seed`, `guidance_scale` from `item.tuningParams`.

### Refine prompts (Tier 2):

```javascript
const REFINE_SCENE_DESCS = {
  preview_0: 'a person in a morning kitchen scene, soft natural window light',
  preview_1: 'a person on a park bench in autumn, warm golden-hour sunlight',
  preview_2: 'a person at an office desk, soft professional lighting',
};
```

Full refine prompt: `"Natural editorial photograph, soft natural skin tones, real photography aesthetic, {sceneDesc}, fujifilm color science, professional candid photography"`

---

## 12. LoRA Card Display

### Card badges by type:

| Type | Badge text | Badge color | CSS class |
|------|-----------|-------------|-----------|
| product | Product | `var(--amber)` on `var(--amber-soft)` | `.studio-badge--product` |
| talking-head | Talking Head | `var(--accent)` on `var(--accent-soft)` | `.studio-badge--talking-head` |
| scene-real | Scene (Real) | `var(--green)` on `var(--green-soft)` | `.studio-badge--scene-real` |
| scene-ai | Scene (AI) | `var(--purple, #a78bfa)` on `var(--purple-soft, rgba(167,139,250,0.15))` | `.studio-badge--scene-ai` |

### Compatibility pills:

| Item type | Compatible with | Pill text |
|-----------|----------------|-----------|
| product | ['product'] | "Product videos" |
| talking-head | ['talking-head'] | "Talking-head videos" + note "For scene videos, train a Scene Character LoRA" |
| scene-real | ['scene', 'talking-head'] | "Scene videos" + "Talking-head videos" |
| scene-ai | ['scene', 'talking-head'] | "Scene videos" + "Talking-head videos" + note "AI-generated characters have a stylized look" |

### Status indicators:

| Status | Display | Color |
|--------|---------|-------|
| idle | "Not trained" | `var(--text-muted)` |
| generating | "Generating images... X%" | `var(--accent)` with progress bar |
| reviewing | "Review images" | `var(--accent)` |
| training | "Training... X min elapsed" + progress bar | `var(--amber)` |
| ready | "LoRA Ready" badge + preview thumbnail | `var(--green)` |
| error | "Training failed" with retry option | `var(--red)` |

---

## 13. Migration Plan

### On first load with new code:

```javascript
function _migrateV1ToV2() {
  if (localStorage.getItem(MIGRATED_KEY) === 'true') return;
  
  const newItems = [];
  
  // 1. Migrate products
  const oldProducts = JSON.parse(localStorage.getItem('stori_lora_products_v1') || '[]');
  for (const p of oldProducts) {
    const item = {
      id: p.id,  // preserve original ID for IDB key compat
      type: 'product',
      name: p.name || '',
      description: '',
      trainerType: 'flux-fast',
      trainerEndpoint: 'fal-ai/flux-lora-fast-training',
      inferenceEndpoint: 'fal-ai/flux-lora',
      photoCount: p.photoCount || 0,
      trainImageCount: p.photoCount || 0,
      loraStatus: p.loraStatus || 'idle',
      loraUrl: p.loraUrl || null,
      configUrl: null,
      triggerWord: p.triggerWord || '',
      trainSteps: 1000,
      trainStarted: p.trainStarted || null,
      trainCompleted: p.trainCompleted || null,
      falRequestId: p.falRequestId || null,
      loraError: p.loraError || null,
      tuningParams: { ...DEFAULT_TUNING, guidance_scale: 3.5 },
      locked: false,
      compatibleWith: ['product'],
      outfitLabels: [],
      aiReferenceDesc: '',
      archivedVersions: [],
      previewPrompts: [],
      previewGenerated: !!p.loraUrl,
      progressPhase: null,
      progressPct: 0,
    };
    newItems.push(item);
  }
  
  // 2. Migrate characters
  const oldChars = JSON.parse(localStorage.getItem('stori_lora_characters_v1') || '[]');
  for (const c of oldChars) {
    const item = {
      id: c.id,
      type: 'talking-head',
      name: c.name || '',
      description: c.description || '',
      trainerType: 'flux-fast',  // current chars use flux-lora-fast-training
      trainerEndpoint: 'fal-ai/flux-lora-fast-training',
      inferenceEndpoint: 'fal-ai/flux-lora',
      photoCount: c.photoCount || 0,
      trainImageCount: c.photoCount || 0,
      loraStatus: c.loraStatus || 'idle',
      loraUrl: c.loraUrl || null,
      configUrl: null,
      triggerWord: c.triggerWord || '',
      trainSteps: 1000,
      trainStarted: c.trainStarted || null,
      trainCompleted: c.trainCompleted || null,
      falRequestId: c.falRequestId || null,
      loraError: c.loraError || null,
      tuningParams: { ...DEFAULT_TUNING, guidance_scale: 3.5 },
      locked: false,
      compatibleWith: ['talking-head'],
      outfitLabels: [],
      aiReferenceDesc: '',
      archivedVersions: [],
      previewPrompts: [],
      previewGenerated: !!c.loraUrl,
      progressPhase: null,
      progressPct: 0,
    };
    newItems.push(item);
  }
  
  // 3. Save new items
  localStorage.setItem(ITEMS_KEY, JSON.stringify(newItems));
  
  // 4. Remap IDB keys (async, best-effort)
  _remapIdbKeys(oldProducts, oldChars).then(() => {
    localStorage.setItem(MIGRATED_KEY, 'true');
  });
}

async function _remapIdbKeys(oldProducts, oldChars) {
  for (const p of oldProducts) {
    // Product photos: lora_{id}_photo_{idx} -> lora_v2_{id}_photo_{idx}
    for (let i = 0; i < (p.photoCount || 0); i++) {
      const data = await _idbGet(`lora_${p.id}_photo_${i}`);
      if (data) {
        await _idbSet(`lora_v2_${p.id}_photo_${i}`, data);
        // Do NOT delete old keys yet -- keep as fallback
      }
    }
    // Product preview: lora_{id}_preview -> lora_v2_{id}_preview_0
    const preview = await _idbGet(`lora_${p.id}_preview`);
    if (preview) await _idbSet(`lora_v2_${p.id}_preview_0`, preview);
  }
  
  for (const c of oldChars) {
    // Char photos: lora_char_{id}_photo_{idx} -> lora_v2_{id}_photo_{idx}
    for (let i = 0; i < (c.photoCount || 0); i++) {
      const data = await _idbGet(`lora_char_${c.id}_photo_${i}`);
      if (data) await _idbSet(`lora_v2_${c.id}_photo_${i}`, data);
    }
    // Char preview
    const preview = await _idbGet(`lora_char_${c.id}_preview`);
    if (preview) await _idbSet(`lora_v2_${c.id}_preview_0`, preview);
  }
}
```

### Migration safety:
- Old localStorage keys are NOT deleted until a separate cleanup phase (can add a "Clean up legacy data" button in settings).
- Old IDB keys are NOT deleted -- only new keys are written alongside.
- The `MIGRATED_KEY` sentinel ensures migration runs exactly once.
- If migration fails mid-way, the sentinel is not set, and migration re-runs on next load.

---

## 14. Reference Image Assets

### Source files:
- `/Users/praveen/Desktop/stori-i2v-doe/results/lora_trial/user_sample_grids/user_sample_grid_1.png`
  - Grid layout: 3 rows (formal, smart_casual, casual) x 3 cols (FRONT, 3/4 ANGLE, FULL BODY)
  - Cell display size: 640x640 each
  - Grid includes 220px left label column and 90px top header
- `/Users/praveen/Desktop/stori-i2v-doe/results/lora_trial/user_sample_grids/user_sample_grid_2.png`
  - Grid layout: 3 rows (same outfits) x 3 cols (PROFILE, CLOSE-UP, CANDID LAUGH)
  - Same dimensions

### Crops needed (all from the formal/Outfit 1 row):

| Filename | Source grid | Row | Col | Purpose | Approx pixel region (x, y, w, h) |
|----------|-----------|-----|-----|---------|----------------------------------|
| `front_face.jpg` | grid_1 | 0 | 0 | Front face slot ref | (220, 150, 640, 640) |
| `left_profile.jpg` | grid_2 | 0 | 0 | Left profile slot ref | (220, 150, 640, 640) |
| `right_profile.jpg` | grid_2 | 0 | 0 | Right profile (mirror) | mirror of left_profile |
| `waist_up.jpg` | grid_1 | 0 | 1 | Top-half waist-up ref | (220+640+8, 150, 640, 640) |
| `full_body.jpg` | grid_1 | 0 | 2 | Full body standing ref | (220+2*(640+8), 150, 640, 640) |
| `three_quarter.jpg` | grid_1 | 0 | 1 | 3/4 angle ref (C1 slots) | same as waist_up |

### Product reference images:

| Filename | Source | Purpose |
|----------|--------|---------|
| `product_ref_1.jpg` | `/Users/praveen/Desktop/stori-i2v-doe/source-images/ai/M1.jpg` | Product upload example 1 |
| `product_ref_2.jpg` | `/Users/praveen/Desktop/stori-i2v-doe/source-images/ai/M2.jpg` | Product upload example 2 |
| `product_ref_3.jpg` | `/Users/praveen/Desktop/stori-i2v-doe/source-images/ai/M3.jpg` | Product upload example 3 |

### Dimensions:
- All reference thumbnails should be saved at 200x200 JPEG, quality 85%.
- Store in `/Users/praveen/Desktop/stori/assets/lora-refs/`.

### Implementation:
Crop and resize using a one-time script (Python PIL or browser canvas). The right_profile.jpg can be created by horizontally flipping left_profile.jpg. Alternatively, use a different cell from grid_2 that shows a right-profile view.

---

## 15. Open Questions / Risks

### Open Questions

1. **JSZip dependency:** The browser needs to create ZIP files for training data upload. The current code sends arrays of data URLs to fal (which works for `images_data_url`). But `image_data_url` (Qwen, singular) expects a single URL pointing to a ZIP. Options:
   - A: Include JSZip (~100KB minified) as a script tag.
   - B: Use the Blob + ZIP format manually (complex).
   - C: Upload individual images to fal storage first, then pass URLs.
   - **Recommendation:** Check if fal's JS client supports array-of-data-URLs for Qwen's `image_data_url` the same way it does for FLUX. If not, add JSZip.

2. **Qwen trainer `image_data_url` format:** The Python code uses `fal_client.upload_file(str(zip_path))` which uploads a ZIP and gets a URL. The current JS code passes arrays of data URLs directly. Need to verify if the Qwen endpoint accepts an array or requires a single ZIP URL. If ZIP is required, implement client-side ZIP creation.

3. **FaceDetector API availability:** The Shape Detection API is only available in Chromium browsers with the `#enable-experimental-web-platform-features` flag, or in recent Chrome stable. Firefox and Safari do not support it. The fallback is to skip face detection and show a manual verification note.

4. **Training cost visibility:** Should we show estimated cost before the user clicks "Train LoRA"? The costs are:
   - Product (FLUX fast): varies by step count
   - Talking-head (FLUX portrait): $0.0024/step x 2000 = $4.80
   - Scene (Qwen): $0.002/step x 2000 = $4.00
   - Grid generation: ~$0.40 (3 grids x $0.134)
   - **Recommendation:** Show cost estimate in the training confirmation dialog.

5. **Trainer type selection for new talking-head path:** The requirements say to use `fal-ai/flux-lora-portrait-trainer` for talking-head (Path B) with 2000 steps, but the current code uses `fal-ai/flux-lora-fast-training` with 1000 steps. The DOE findings suggest Qwen may be better for diverse ethnicities. Should the talking-head path use FLUX portrait trainer or Qwen? This needs a decision:
   - FLUX portrait: better for faces, $4.80 for 2000 steps
   - Qwen: better for diverse ethnicity, $4.00 for 2000 steps
   - **Recommendation:** Use FLUX portrait trainer for talking-head (face-optimized), Qwen for scene characters.

6. **Narrator voice picker placement in UI:** The narrator voice picker needs to live in the create pipeline (`js/17b-create-references.js`), not in LoRA Studio. Two options for when to show it:
   - A: Show voice picker when user first adds a narrator (during "Add Narrator" flow).
   - B: Show voice picker as a voice strip on the narrator card in the cast section (lazy — user picks voice only when they want to).
   - **Recommendation:** Option B — match the existing character voice strip pattern. Add a voice strip to the narrator card. Tapping it opens the voice picker with all 3 sources (cloned, ElevenLabs, Gemini).

7. **Shared cloned voice deletion:** If a user clones a voice for Character A, then shares it with Character B via the library, and later deletes Character A — the voice_id in ElevenLabs still exists but the "source character" reference is orphaned. The voice continues to work (ElevenLabs doesn't delete the voice), but the library entry loses its source context. Mitigation: store cloned voice_ids in a separate registry (not just on LoRA items) so they survive character deletion. Alternatively, accept the orphaned reference — the voice still functions.

### Risks

1. **Gemini Pro grid generation reliability:** The grid generation pipeline depends on Gemini Pro producing a valid 3x3 grid. DOE results show this works reliably, but rate limiting (429 errors) may cause user-facing delays. Mitigation: model fallback chain (Pro -> 3.1 Flash -> 2.5 Flash) with retry logic.

2. **Training time variance:** fal.ai training times can vary significantly (10-45 min). The progress phases shown to the user are time-based estimates, not actual progress from fal. If training takes longer than expected, the progress bar may stall at 90%. Mitigation: show "Training is taking longer than expected, please wait..." after timeout threshold.

3. **IndexedDB storage limits:** With 27 training images at 1024x1024 PNG + 3 preview images per item, each LoRA uses ~30-50MB of IDB storage. Browsers typically allow 50MB-1GB per origin. For users with many LoRAs, this could hit limits. Mitigation: convert training images to JPEG before storing (smaller), and implement a cleanup function for old training images after training completes (only keep previews + original photos).

4. **Migration data corruption:** If the user has both old and new code loaded (e.g., cached old JS + new HTML), data could be read/written inconsistently. Mitigation: the `MIGRATED_KEY` sentinel and the fact that new code reads from `stori_lora_items_v2` (which old code never writes to) provides isolation.

5. **`createUpscaleAndCrop` async loading:** The existing function at `js/17c-create-pipeline.js:2913` creates an Image element and waits for onload. For large 2K grid images (~2-4MB as data URLs), this could be slow. Should work fine in modern browsers but test with slow devices.

---

### Critical Files for Implementation
- /Users/praveen/Desktop/stori/js/34-lora-library.js — LoRA Studio rewrite (Phases 1-10)
- /Users/praveen/Desktop/stori/index.html — HTML structure replacement
- /Users/praveen/Desktop/stori/css/styles.css — styling
- /Users/praveen/Desktop/stori/js/17c-create-pipeline.js — _getSceneLoraContext() compat, lip-sync prep (no changes needed)
- /Users/praveen/Desktop/stori/js/17b-create-references.js — narrator voice picker, voice strip UI, castResolveVoiceForSpeaker() update (Phase 11)
- /Users/praveen/Desktop/stori/js/17a-create-api.js — ElevenLabs IVC clone API call (Phase 11), TTS (existing, no change)
- /Users/praveen/Desktop/stori/js/30-lipsync.js — MediaPipe lip-sync (existing, no changes needed)
- /Users/praveen/Desktop/stori/js/11-export.js — lip-sync compositing during export (existing, no changes needed)
- /Users/praveen/Desktop/stori-i2v-doe/runner/lora_trial/captions.py — reference for caption format
