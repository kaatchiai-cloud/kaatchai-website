# Character LoRA System — Design & Implementation Document

**Project:** Stori  
**Date:** 2026-05-09  
**Status:** Planning  

---

## 1. Background & Motivation

### Current state

Characters in Stori films are defined in the brainstorm script and seeded into `createJobState.characters[]`. Visual consistency is achieved today via **face swap** (Replicate `codeplugtech/face-swap`), which:

- Runs only in photorealistic / cinematic mode
- Requires a detectable frontal face in the generated scene image
- Swaps the character's AI-generated representative portrait face into the scene
- Fails silently on profile shots, side angles, and non-frontal poses
- Has no effect in illustrated or animated styles

Product LoRA (fal-ai/flux-lora-fast-training) is already fully built for brand consistency. The same pipeline applies directly to character consistency.

### Why LoRA for characters

| Capability | Face swap | Character LoRA |
|---|---|---|
| Frontal face consistency | ✓ | ✓ |
| Profile / side angle | ✗ Fails | ✓ |
| Full body + clothing | ✗ Face only | ✓ |
| Illustrated / animated styles | ✗ | ✓ |
| Video generation (Kling etc.) | ✓ Post-process | ✗ |
| Cost per scene | Low (Replicate) | Higher (FLUX) |
| Setup time | None | ~15 min training |

### Decision: both paths, automatic routing

- **Character has LoRA trained** → FLUX + trigger word. Face swap skipped.
- **Character has no LoRA** → Gemini + portrait reference. Face swap applied (photorealistic only).
- **Character unassigned** → Gemini + text description only.

The routing is automatic based on what's available. User makes one decision: assign a Library character to each story character, or leave it unassigned.

---

## 2. Architecture Overview

### Where characters come from

```
Brainstorm → finalScript.characters[]
  ↓
window.__storiHandoff.finalScript
  ↓
01-core.js seeds createJobState.characters[]
  each: { id, name, userDescription, locked: false, representativeImageDataUrl: null }
  ↓
Assets section (NEW) — user assigns Library character per story character
  ↓
createJobState.loraAssignments.characters = { storyCharId: libraryCharId }
  ↓
Generation routing reads loraAssignments → FLUX or Gemini + face swap
```

### New system components

```
Library
  ├── Characters tab (NEW)   — create, train, manage character LoRAs
  └── Products tab (existing) — unchanged

Create page
  └── Assets section (NEW)   — assign Library characters/products per story

Generation routing (updated)
  └── _getSceneLoraContext() — replaces _getReadyProjectLora()
      returns all LoRAs active for a scene (characters + products combined)
```

---

## 3. Data Models

### 3.1 Character schema (localStorage: `stori_lora_characters_v1`)

```js
{
  id:             'char_' + Date.now() + Math.random().toString(36).slice(2,7),
  name:           string,          // display name
  description:    string,          // used to generate training images
  photoCount:     number,          // number of training images stored in IDB
  loraStatus:     'idle' | 'training' | 'ready' | 'error',
  loraUrl:        string | null,   // fal.ai LoRA file URL after training
  triggerWord:    string,          // CHAR{id.slice(-6).toUpperCase()}
  trainStarted:   number | null,   // Date.now() timestamp
  trainCompleted: number | null,
  falRequestId:   string | null,   // for polling
  loraError:      string | null,
}
```

### 3.2 IDB keys (same DB as products: `stori_lora_photos`)

| Key pattern | Content |
|---|---|
| `lora_char_{id}_photo_{i}` | Training image data URL (i = 0..11) |
| `lora_char_{id}_preview` | Preview image data URL |

### 3.3 loraAssignments on createJobState (new field)

```js
createJobState.loraAssignments = {
  characters: {
    [storyCharId]: libraryCharId | null
    // e.g. 'char_bs_0_1234': 'char_abc123def'
  },
  narrator:   libraryCharId | null,
  products:   [libraryProductId, ...]   // replaces getSelectedProductIds()
}
```

Added to `createJobState` initial state in `01-core.js`.

---

## 4. Phase 1 — Library Characters Tab

### 4.1 Character creation flow

```
User clicks "+ Add Character"
  ↓
Creation form
  • Name (required)
  • Description: appearance, age, style e.g. "40s woman, short silver hair,
    weathered face, detective coat, sharp eyes"
  ↓
[Generate Training Images]
  ↓
Gemini Flash generates 12 images in parallel (see prompts below)
  Progress shown as images arrive
  ↓
Review grid
  • User removes bad images (click to reject)
  • "Retake" button per image
  • "Upload my own photos" alternative (file picker, same flow)
  • Minimum 8 images required to proceed
  ↓
[Train LoRA]  — blocks with elapsed timer, same poll loop as products
  triggerWord = CHAR{id.slice(-6).toUpperCase()}
  endpoint    = fal-ai/flux-lora-fast-training
  ↓
Training completes (~15 min)
  ↓
Preview generated in background:
  "{triggerWord} portrait, neutral expression, looking at camera, cinematic lighting"
  ↓
Character card in Library — status: Ready ✓
```

### 4.2 Training image prompts (12 images, run in parallel)

```
1.  portrait, {desc}, looking directly at camera, neutral expression,
    white studio background, sharp focus
2.  portrait, {desc}, slight smile, looking at camera,
    soft natural window lighting, white background
3.  portrait, {desc}, serious expression, side lighting, white background
4.  portrait, {desc}, 3/4 angle, looking slightly off-camera, warm lighting
5.  portrait, {desc}, profile view, neutral expression, clean white background
6.  portrait, {desc}, looking slightly downward, contemplative mood,
    natural light
7.  portrait, {desc}, candid laugh, outdoor soft diffused light
8.  portrait, {desc}, close-up face, dramatic Rembrandt lighting,
    slightly different angle
9.  full body, {desc}, standing, neutral relaxed pose, studio background
10. full body, {desc}, casual pose, arms at sides, neutral expression
11. portrait, {desc}, professional headshot style, front-facing, neutral
12. portrait, {desc}, looking slightly upward, moody directional light
```

Where `{desc}` is the user's description string.  
All 12 generated via Gemini Flash (cheap, fast). Stored in IDB as `lora_char_{id}_photo_{0..11}`.

### 4.3 Character card UI (Library grid)

Mirrors product card layout:

```
┌──────────────────────────────┐
│  [preview image]             │
│                              │
│  Detective Sarah             │
│  40s woman, silver hair...   │
│                              │
│  12 training images          │
│  ● LoRA Ready                │
│                              │
│  [Edit]  [Delete]            │
└──────────────────────────────┘
```

Status variants: idle (grey) / training (amber + elapsed) / ready (green) / error (red).

### 4.4 New public API on `window.LoraLibrary`

```js
// Added alongside existing API:
getCharacters()                       // → character[] from localStorage
getCharacterById(id)                  // → single character | null
saveCharacter(char)                   // upsert to localStorage
deleteCharacter(id)                   // remove + IDB cleanup
trainCharacterLora(id)                // mirrors trainProductLora()
generateCharacterTrainingImages(id)   // generates 12 images, stores IDB
renderCharactersTab()                 // re-renders #library-char-grid
openCharacterPicker(storyCharId, onSelect)  // dropdown for asset assignment
```

### 4.5 Files changed — Phase 1

| File | Changes |
|---|---|
| `js/34-lora-library.js` | New character constants (`CHARACTERS_KEY`, IDB key prefix); character CRUD; `generateCharacterTrainingImages()`; `trainCharacterLora()` (reuses `_pollUntilDone` pattern); `renderCharactersTab()`; `openCharacterPicker()`; extend `window.LoraLibrary` exports |
| `index.html` | Populate `#library-char-grid` container with "+ Add Character" button; add character creation form/modal HTML |
| `css/styles.css` | Character card styles (reuse `.lora-product-card` pattern); training image review grid (`.char-review-grid`, `.char-review-thumb`); creation form styles |

---

## 5. Phase 2 — Assets Section on Create Page

### 5.1 Position in create flow

```
Step 1   Input (audio / text)
Step 2   Transcription / storyboard
         ↓  [storyboard generated]
─────────────────────────────────────────
Assets   Character + Narrator + Product      ← NEW, appears here
         assignment before image generation
─────────────────────────────────────────
Step 4   Visual References (environments,
         character portraits — unchanged)
         Launch Image Agent
```

The Assets section is rendered inside the `create-launch-after-storyboard` area, above the launch button. It appears only after storyboard is generated.

The existing `#step4-products-section` in Step 4 is hidden — products move to Assets.

### 5.2 HTML structure

```html
<div id="create-assets-step" style="display:none">
  <div class="create-section-title">Assets</div>
  <div class="create-section-sub">
    Assign Library characters and products for consistent generation.
  </div>

  <!-- Characters — shown if createJobState.characters.length > 0 -->
  <div id="assets-characters-section" class="hidden">
    <div class="assets-subsection-label">Characters</div>
    <div id="assets-character-list">
      <!-- one row per story character, rendered by renderAssetsSection() -->
    </div>
  </div>

  <!-- Narrator — shown if narrator exists + onScreenStyle === 'talking-head' -->
  <div id="assets-narrator-section" class="hidden">
    <div class="assets-subsection-label">Narrator</div>
    <div id="assets-narrator-slot"></div>
  </div>

  <!-- Products — shown if brand/product mode -->
  <div id="assets-products-section" class="hidden">
    <div class="assets-subsection-label">Products</div>
    <div id="assets-product-list"></div>
  </div>
</div>
```

### 5.3 Per-row rendering

Each row shows story character name, Library assignment dropdown, and generation path badge:

```
Story character         Library assignment          Generation path
────────────────────────────────────────────────────────────────────
Detective Sarah    [ Sarah K. (LoRA ✓)    ▼ ]   ● LoRA → FLUX
The Villain        [ Unassigned           ▼ ]   ○ Gemini + face swap
Narrator (Alex)    [ Assign from Library  ▼ ]   ○ Gemini only

GlowSerum Pro      [ GlowSerum (LoRA ✓)   ▼ ]   ● LoRA → FLUX
```

Generation path badge logic:

| Assignment state | Badge |
|---|---|
| Library character, `loraStatus === 'ready'` | ● green "LoRA → FLUX" |
| Library character, `loraStatus === 'training'` | ⏳ amber "Training... [blocks]" |
| No assignment, photorealistic mode | ○ grey "Gemini + face swap" |
| No assignment, other mode | ○ grey "Gemini only" |

### 5.4 When Assets section appears

After storyboard is generated, `renderAssetsSection()` is called:

```js
function renderAssetsSection() {
  const hasChars    = (createJobState.characters || []).length > 0;
  const hasNarrator = createJobState.narrator?.onScreenStyle === 'talking-head';
  const hasBrand    = createJobState.videoType === 'brand';

  // show/hide sub-sections
  toggle('#assets-characters-section', hasChars);
  toggle('#assets-narrator-section',   hasNarrator);
  toggle('#assets-products-section',   hasBrand);

  // show parent only if at least one section visible
  const anyVisible = hasChars || hasNarrator || hasBrand;
  toggle('#create-assets-step', anyVisible);
}
```

### 5.5 Assignment persistence

Assignments written to `createJobState.loraAssignments` on every picker selection. Auto-saved with the rest of `createJobState` via existing auto-save mechanism.

On page reload, `renderAssetsSection()` reads existing assignments and pre-selects the correct Library items in each dropdown.

### 5.6 Files changed — Phase 2

| File | Changes |
|---|---|
| `index.html` | Add `#create-assets-step` HTML above launch button; hide `#step4-products-section` |
| `js/01-core.js` | Add `loraAssignments: { characters: {}, narrator: null, products: [] }` to `createJobState` initial state |
| `js/34-lora-library.js` | Add `renderAssetsSection()`; add `openCharacterPicker(storyCharId, onSelect)`; add `renderAssetsProducts()` (replaces `renderStep4Products()`); update `isLoraBlocking()` and `updateLaunchImageButton()` to read from `loraAssignments` |
| `css/styles.css` | `.create-assets-step`, `.assets-subsection-label`, `.assets-row`, `.assets-status-badge` (green / amber / grey variants) |

---

## 6. Phase 3 — Generation Routing Update

### 6.1 New helper: `_getSceneLoraContext(scene)` — in `17c-create-pipeline.js`

Replaces `_getReadyProjectLora()`. Returns all active LoRAs for a scene.

```js
function _getSceneLoraContext(scene) {
  if (!window.LoraLibrary) return { loras: [], hasLora: false };
  const a = createJobState.loraAssignments || {};

  const loras = [];

  // 1. Product LoRAs
  (a.products || []).forEach(pid => {
    const p = window.LoraLibrary.getProducts().find(x => x.id === pid);
    if (p?.loraStatus === 'ready' && p.loraUrl)
      loras.push({ path: p.loraUrl, scale: 0.9, triggerWord: p.triggerWord });
  });

  // 2. Character LoRAs for this scene's characters
  (scene.refCharacters || []).forEach(storyCharId => {
    const libCharId = a.characters?.[storyCharId];
    if (!libCharId) return;
    const c = window.LoraLibrary.getCharacterById(libCharId);
    if (c?.loraStatus === 'ready' && c.loraUrl)
      loras.push({ path: c.loraUrl, scale: 1.0, triggerWord: c.triggerWord });
  });

  // 3. Narrator LoRA — talking-head scenes only
  if (scene.frontRole === 'narrator' && a.narrator) {
    const c = window.LoraLibrary.getCharacterById(a.narrator);
    if (c?.loraStatus === 'ready' && c.loraUrl)
      loras.push({ path: c.loraUrl, scale: 1.0, triggerWord: c.triggerWord });
  }

  return { loras, hasLora: loras.length > 0 };
}
```

### 6.2 `generateImageFalFluxLora()` — multi-LoRA support

**Current signature:**
```js
generateImageFalFluxLora(prompt, loraUrl, falKey, { width, height })
```

**New signature:**
```js
generateImageFalFluxLora(prompt, loras, falKey, { width, height })
// loras: [{ path: string, scale: number }]
// backward-compatible: if loras is a string, wrap as [{ path: loras, scale: 0.9 }]
```

POST body change:
```js
// Before
loras: [{ path: loraUrl, scale: 0.9 }]

// After
loras: (typeof loras === 'string'
  ? [{ path: loras, scale: 0.9 }]
  : loras
).map(l => ({ path: l.path, scale: l.scale }))
```

### 6.3 `generateSceneImage()` routing update — `17c-create-pipeline.js`

Replace the current LoRA branch (lines ~4375–4380):

```js
// Before
const _readyLora = _getReadyProjectLora();
if (_readyLora) { ... }

// After
const { loras, hasLora } = _getSceneLoraContext(scene);
if (hasLora) {
  const triggerWords = loras.map(l => l.triggerWord).filter(Boolean).join(' ');
  const _loraPrompt  = triggerWords
    ? `${triggerWords} ${effectivePrompt}`
    : effectivePrompt;
  imgDataUrl = await generateImageFalFluxLora(
    _loraPrompt,
    loras,
    window.LoraLibrary.getFalKey(),
    { width, height }
  );
}
if (!imgDataUrl) {
  // existing Gemini fallback chain — unchanged
}
```

### 6.4 `applyFaceSwapToSceneImage()` — skip LoRA characters — `28-canvas-consistency.js`

After the existing `locked && representativeImageDataUrl` filter, add:

```js
.filter(c => {
  const libCharId = createJobState.loraAssignments?.characters?.[c.id];
  if (!libCharId) return true;  // no assignment → apply face swap
  const lc = window.LoraLibrary.getCharacterById(libCharId);
  return !(lc?.loraStatus === 'ready');  // LoRA ready → skip face swap
})
```

### 6.5 `regenerateImageInstance()` — `28-canvas-consistency.js`

Replace the current inline LoRA lookup block with the same `_getSceneLoraContext(scene)` call and identical routing logic as `generateSceneImage()`.

### 6.6 Files changed — Phase 3

| File | Changes |
|---|---|
| `js/17c-create-pipeline.js` | Replace `_getReadyProjectLora()` with `_getSceneLoraContext()`; update `generateImageFalFluxLora()` for multi-LoRA array; update routing in `generateSceneImage()` |
| `js/28-canvas-consistency.js` | Face swap skip logic in `applyFaceSwapToSceneImage()`; replace LoRA lookup in `regenerateImageInstance()` |

---

## 7. Phase 4 — Blocking Logic Update

### 7.1 Updated `isLoraBlocking()` — `34-lora-library.js`

Checks all three assignment types:

```js
function isLoraBlocking() {
  const a = createJobState.loraAssignments || {};

  // Products
  const productBlocking = (a.products || []).some(id => {
    const p = window.LoraLibrary.getProducts().find(x => x.id === id);
    return p && p.loraStatus !== 'ready';
  });

  // Characters
  const charBlocking = Object.values(a.characters || {}).some(libId => {
    const c = window.LoraLibrary.getCharacterById(libId);
    return c && c.loraStatus !== 'ready';
  });

  // Narrator
  const narratorBlocking = a.narrator
    ? (c => c && c.loraStatus !== 'ready')(window.LoraLibrary.getCharacterById(a.narrator))
    : false;

  return productBlocking || charBlocking || narratorBlocking;
}
```

### 7.2 Updated `updateLaunchImageButton()` notice text

Collects names of all pending items (characters + products) and lists them:

```
⏳ Waiting for LoRA training: Detective Sarah, GlowSerum Pro
   Image generation is blocked until training completes.
```

---

## 8. Generation path reference

Full routing logic per scene at generation time:

```
for each scene:
  collect loras via _getSceneLoraContext(scene)
    └── product LoRAs from loraAssignments.products
    └── character LoRAs from loraAssignments.characters × scene.refCharacters
    └── narrator LoRA from loraAssignments.narrator (if talking-head scene)

  if loras.length > 0
    → prepend all trigger words to prompt
    → FLUX (fal-ai/flux-lora) with loras array
    → skip face swap

  else if scene has character portraits (representativeImageDataUrl)
       && photorealistic / cinematic mode
    → Gemini Flash + portrait images as refParts
    → face swap post-process (Replicate)

  else
    → Gemini Flash + text description only
```

### Coverage by mode and configuration

| Mode | Characters | Products | Generation path |
|---|---|---|---|
| Film | LoRA assigned | — | FLUX + char LoRA |
| Film | Portrait only | — | Gemini + face swap (photorealistic) |
| Film | Unassigned | — | Gemini text only |
| Film | LoRA assigned | — | FLUX + char LoRA |
| Brand | LoRA assigned | LoRA assigned | FLUX + char + product LoRA |
| Brand | LoRA assigned | No LoRA | FLUX + char LoRA |
| Brand | No char LoRA | LoRA assigned | FLUX + product LoRA |
| Brand | No char LoRA | No LoRA | Gemini text only |
| Film narrator (talking head) | LoRA assigned | — | FLUX + narrator LoRA |
| Film narrator (voice only) | — | — | TTS only, no image |

---

## 9. Complete file change summary

| File | Phases | Summary of changes |
|---|---|---|
| `js/34-lora-library.js` | 1, 2, 4 | Character schema + CRUD; `generateCharacterTrainingImages()`; `trainCharacterLora()`; `renderCharactersTab()`; `openCharacterPicker()`; `renderAssetsSection()`; updated `isLoraBlocking()` and `updateLaunchImageButton()`; extended `window.LoraLibrary` exports |
| `js/01-core.js` | 2 | Add `loraAssignments` to `createJobState` initial state |
| `js/17c-create-pipeline.js` | 3 | `_getSceneLoraContext()`; multi-LoRA `generateImageFalFluxLora()`; routing update in `generateSceneImage()` |
| `js/28-canvas-consistency.js` | 3 | Face swap skip logic; `regenerateImageInstance()` routing |
| `index.html` | 1, 2 | Library Characters tab HTML; `#create-assets-step` section; hide old `#step4-products-section` |
| `css/styles.css` | 1, 2 | Character card styles; training image review grid; assets section + row styles |

---

## 10. Build order

```
Phase 1  Library Characters tab
          └── data model + CRUD
          └── generateCharacterTrainingImages()
          └── trainCharacterLora()
          └── renderCharactersTab() + card UI
          └── CSS

Phase 2  Assets section on create page
          └── createJobState.loraAssignments
          └── renderAssetsSection()
          └── openCharacterPicker() dropdown
          └── blocking logic update
          └── HTML + CSS

Phase 3  Generation routing
          └── _getSceneLoraContext()
          └── multi-LoRA generateImageFalFluxLora()
          └── generateSceneImage() routing
          └── applyFaceSwapToSceneImage() skip logic
          └── regenerateImageInstance() routing

Phase 4  QA pass
          └── film mode: no assignment → Gemini + face swap
          └── film mode: LoRA assigned → FLUX, face swap skipped
          └── brand mode: product + character LoRA combined
          └── narrator talking-head: LoRA routed correctly
          └── blocking: training in progress blocks launch button
          └── blocking: completes → button unlocks + toast
```
