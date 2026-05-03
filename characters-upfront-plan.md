# Characters & Locations Upfront — Implementation Plan

> Companion document to `canvas-movie-mode-plan.md`. This doc captures the
> character-definition-before-storyboard feature and its downstream
> integrations across timeline (create page) and canvas. Movie-mode-specific
> behavior (global cluster filter) is referenced but deferred until movie-mode
> is built.

---

## 1. Scope & Requirements (verified twice from conversation)

### Core feature

User defines characters (and later, locations) **before storyboard generation**. Each character receives an AI-generated **canonical appearance sheet** plus a **representative image**. Once locked, the character is the source of truth for visual consistency across all downstream scene generation.

### Confirmed requirements

| # | Requirement | Source |
|---|-------------|--------|
| R1 | User inputs: character count, names, descriptions, images (optional) | "we need to get input, particularly no of character, character names, description and image(optional)" |
| R2 | AI defines appearance + generates representative image | "send this to AI to define appearance of a character and generate a representive image" |
| R3 | Style applied: photorealistic OR cinematic; uploaded image fine-tuned to that style | "if its photorealistic or cinematic either uploaded image can be finetuned and presented" |
| R4 | User can review, change, lock | "user can make changes and lock it" |
| R5 | Happens BEFORE storyboard generation | "this should happen before storyboard is generated" |
| R6 | Style is defined at the input step (project-level), then applied to all characters | "at the input user defines style. this style has to be applied to the character for the next section" |
| R7 | Characters added mid-project cannot retroactively appear in already-generated scenes | "no they cannot be available" |
| R8 | Hard cap: 6 total references combined (characters + locations) | "ok" to "Hard cap on character count?" |
| R9 | Locations follow the same lock flow | "yes" to environments using same lock flow |
| R10 | Future v2: motion/voice metadata per character | "ok" to v2 expansion |
| R11 | Storyboard scene cards show which characters appear in each scene; user can change or rewrite | "after generation we need to show the character in that particular storyboard section. user can change it or rewrite storyboard section" |
| R12 | Approach C for chip add/remove: AI auto-rewrite (default) + manual fallback + `promptDirty` flag + image-gen gate | "approach C is fine" |
| R13 | Storyboard editing lives in the inline scene-card list (timeline), not canvas | "Option A" recommendation accepted |
| R14 | Characters & Locations panel below the existing left agent panel — present in both timeline and canvas | "the character and location panel should be make below the existing left panel for both timeline and canvas" |
| R15 | Timeline view: panel is read-only (all functionalities disabled) | "in timeline all functinalities of the character and location can be disabled for simplicty" |
| R16 | Canvas view: panel is fully interactive | "only in canvas they should be active" |
| R17 | Filter nodes by character (canvas only) | "filter of nodes by specific characters" |
| R18 | Filter multi-select via shift-click | Q2 = "ok" |
| R19 | Filter is global across all clusters/nodes in movie mode (deferred) | "for movie mode this should be global across nodes…we will take this up when we develop movie mode" |
| R20 | Plan must include verification methodologies and smoke tests | "include verification methodologies and smoke test if possible" |
| R21 | New STEP 0 prepended: pick + lock video type (Brand / Film / Narration) before Input | "see, add type of video before input" |
| R22 | Cast section visibility & contents are mode-dependent: brand→product+presenter+setting, film→characters+locations, narration→hidden | "we have two channels for entering story board…how is the film and product is handled there" |
| R23 | Style comes from template, not from brainstorm; soft-locks after first cast/product item lock | "no. i want user to select template. not data from brainstorming" |
| R24 | Existing Step order preserved: Type → Input → Template → Cast → Launch (do NOT swap input and template) | "why are you swapping template pick and input. whats the flow currently? follow that" |
| R25 | Tier model (principal/named-extra/background) deferred — Phase 1+ uses single character tier | "lets not get into complication of identifying unnamed chracters now" |
| R26 | Brainstorm doesn't assign visual style; user picks template on create page | "no. i want user to select template. not data from brainstorming" |

### Verification pass 1 — every requirement maps to a concrete plan section

| Req | Plan section | Implementation file(s) |
|---|---|---|
| R1 | §3 User Flow Step 1, §5 File Changes (index.html input step) | `index.html`, `js/17b-create-references.js` |
| R2 | §3 Step 2, §4 AI Contracts (Appearance Sheet + Representative Image) | `js/17b-create-references.js`, `js/17a-create-api.js` |
| R3 | §4 AI Contracts (style prefix injection), §3 Step 2 path B | `js/17b-create-references.js` |
| R4 | §3 Step 3 Review + Lock | `js/17b-create-references.js` |
| R5 | §6 Storyboard Gate (button disabled until all locked) | `js/17c-create-pipeline.js` |
| R6 | §2 Data Model (`createJobState.style`), §4 Style Prefix Map | `js/17c-create-pipeline.js` |
| R7 | §7 Mid-Project Add Constraint | `js/17b-create-references.js`, `js/29-canvas-render.js` |
| R8 | §3 Cap Enforcement (Add button hidden when count >= 6) | `js/17b-create-references.js` |
| R9 | §3 Locations sub-tab (mirror of characters) | `js/17b-create-references.js` |
| R10 | §13 Future / Out of Scope | — |
| R11 | §6 Storyboard Card Chips + AI Rewrite | `js/17c-create-pipeline.js` |
| R12 | §6 Approach C State Machine, §8 promptDirty flag | `js/17c-create-pipeline.js` |
| R13 | §6 Inline list editing — canvas SB nodes are read-mirror only | `js/17c-create-pipeline.js`, `js/29-canvas-render.js` |
| R14 | §9 Characters & Locations Panel — placement and shared component | `index.html`, `js/29-canvas-render.js`, `js/17b-create-references.js` |
| R15 | §9 Surface Gating Table (timeline = disabled controls) | `js/17b-create-references.js` |
| R16 | §9 Canvas Panel Behavior (filter, edit, add) | `js/29-canvas-render.js` |
| R17 | §10 Filter — activation + visual modes | `js/29-canvas-render.js` |
| R18 | §10 Multi-Select via Shift-Click | `js/29-canvas-render.js` |
| R19 | §10 Movie-Mode Note (deferred section) | — (deferred) |
| R20 | §11 Verification, §12 Smoke Tests | this doc |
| R21 | §3a Step 0 Video Type Lock | `index.html`, `js/17a-create-api.js` |
| R22 | §3a Mode-aware Cast section + §2a Product schema | `js/17b-create-references.js` |
| R23 | §3b Style soft-lock state machine | `js/17a-create-api.js`, `js/17b-create-references.js` |
| R24 | §3 User Flow follows: Type → Input → Template → Cast → Launch | `js/17c-create-pipeline.js` |
| R25 | §13 Future / Out of Scope (tier model deferred) | — |
| R26 | §3b Brainstorm carries no visual style; template owns it | `js/01-core.js` (handoff) |

### Verification pass 2 — re-reading the conversation for missed details

Items I want to explicitly call out so they don't get lost:

- **AI rewrite latency budget**: 0.5–1.5s per call, ~$0.001 each. Acceptable for chip clicks.
- **Description-only ref**: storyboard works (text only); image gen skips visual lock.
- **Image-only ref**: Gemini Vision auto-captions before generating sheet.
- **Lock then unlock**: warning that unlock invalidates downstream scenes referencing this character.
- **Style change after lock**: requires unlock + regen confirmation.
- **REMOVE_FAILED case**: when AI rewrite cannot remove a character without nonsense, fall back to confirmation modal.
- **Manual prose edit adding undefined bracket** (e.g. user types `[Karen]` but Karen isn't a defined character): show alert, do not silently create.
- **Manual prose edit removing bracket**: refCharacters[] auto-updates silently.
- **Filter + character delete**: filter auto-clears if active filter character is deleted.
- **Filter chip persistence**: session-only, not saved with project.
- **Filter rendering**: dim by default (opacity 0.15), compact-view toggle for hide.
- **`+ Add character` button on canvas panel**: enabled mid-project but warns about retroactive constraint.
- **Detect-from-script** (optional v1.5): button that uses Gemini to suggest characters/locations from parsed script.
- **Auto-generate ref image from description** (optional v1.5): per-card button to generate an image when no upload exists.
- **Save to library** (deferred to v2): cross-project ref reuse — schema reserves a `libraryId` field now.
- **0-character flow**: skip the entire feature; storyboard launches as today.
- **Combined cap of 6**: counts characters AND locations together. Enforced by the Add button hiding.
- **Step 0 video type lock** (R21): three options — `brand` / `film` / `narration`. Lock-required before Step 1 becomes interactive. Lock-change triggers cast/product wipe confirmation.
- **Brand mode entities** (R22): product (1, required), presenter (0–1, optional), setting (0–1, optional). Combined cap still 6.
- **Narration mode** (R22): cast section hidden entirely; only script + style + launch shown.
- **Style soft-lock** (R23): style is editable until first cast/product item locks; afterwards, template change requires regen confirmation.
- **Step ordering preserved** (R24): Type → Input mode + body → Template & Output Size → Cast/Product → Launch. Do NOT swap input and template.
- **Tier model deferred** (R25): single character tier in Phase 1+. Tier (principal / named-extra / background) revisited later if cast complexity warrants.

All accounted for in subsequent sections.

---

## 2. Data Model

All new data lives in `createJobState` (project-scoped, persisted via `autoSaveCreateState`).

### `createJobState.style`

Project-level style preset, set in the input step. Drives character image generation and storyboard prompts.

```js
createJobState.style = 'cinematic' | 'photorealistic' | 'animated' | 'custom'
createJobState.customStylePrompt = ''  // when style === 'custom'
```

Note: today `createStylePreset` exists as a global. This refactor moves it to `createJobState.style` for consistency, but the global is kept as a mirror for backward compatibility during migration.

### `createJobState.characters[]`

```js
{
  id: 'char_1',                          // unique within project
  name: 'Maya',                          // user-supplied
  userDescription: '...',                // raw 1-line user input
  uploadedImageDataUrl: null | dataURL,  // optional likeness anchor
  appearanceSheet: '...',                // AI-generated canonical text
  distinctiveTraits: ['...'],            // 3-5 visual anchors from AI
  ageRange: '7-9',                       // AI-extracted
  build: 'small, wiry',                  // AI-extracted
  representativeImageDataUrl: dataURL,   // generated/refined image
  locked: false,
  libraryId: null,                       // future: cross-project reuse
  createdAt: '2025-05-03T...',           // for "added mid-project" tooltip
}
```

### `createJobState.locations[]`

Same shape as characters, with `locationDescription` instead of personality fields. Same lock flow.

```js
{
  id: 'loc_1',
  name: 'Kitchen',
  userDescription: '1970s kitchen with yellow walls',
  uploadedImageDataUrl: null,
  appearanceSheet: '...',
  distinctiveFeatures: ['yellow walls', 'vintage stove'],
  representativeImageDataUrl: dataURL,
  locked: false,
  libraryId: null,
  createdAt: '...',
}
```

### `scene.refCharacters[]` / `scene.refLocation`

Already exists. Now populated automatically by bracket-token parsing of `scene.prompt`.

```js
scene.refCharacters = ['char_1', 'char_2']
scene.refLocation = 'loc_1' | null
```

### `scene.promptDirty` (NEW)

Single source of truth for "chips and prose are out of sync."

```js
scene.promptDirty = false   // default
```

Set to `true` when:
- Bracket tokens in `scene.prompt` don't match `scene.refCharacters` (parser detects mismatch)
- User adds a chip via "bracket only" mode without AI rewrite
- AI rewrite fails or is cancelled mid-flight

Cleared when:
- AI rewrite completes and tokens match
- User manually edits prose to match
- User clicks "Confirm — prose is final" after manual edits

### `scene.bracketTokens[]` (DERIVED, not stored)

Computed at render time from `scene.prompt` via regex `/\[([^\]]+)\]/g`. Compared against `scene.refCharacters` mapped to character names. Used to drive chip display and dirty-flag detection.

### `createJobState.videoType` (NEW — R21)

Project-level video type. One of: `brand` | `film` | `narration`. Drives Cast section visibility and contents.

```js
createJobState.videoType = 'film'
createJobState.videoTypeLocked = true   // user clicked "Lock type"
```

Locked at the start of the project. Changing it post-lock requires confirmation and wipes any locked cast/product data (since they're type-specific).

### `createJobState.product` (NEW — R22, brand mode only)

```js
createJobState.product = {
  id: 'prod_xyz',
  name: 'AcmePhone X',
  userDescription: 'Flagship phone, sleek aluminum body',
  brandColors: ['#1A2B3C', '#FFFFFF'],
  logoDataUrl: null,                  // optional brand logo
  uploadedImageDataUrl: null,         // user-supplied product photo
  appearanceSheet: '...',             // AI-canonicalized hero-shot description
  representativeImageDataUrl: '...',  // AI-rendered hero shot (or refined from upload)
  locked: false,
  createdAt: '...',
  lockedAt: '...',
}
```

**Distinct from a character**: image-gen pipeline phrases the prompt as "featured product, hero shot" instead of "character portrait, match likeness." Bracket parser matches the product's `name` separately from cast.

### `createJobState.presenter` (NEW — R22, brand mode only, optional)

```js
createJobState.presenter = {
  id: 'pres_xyz',
  name: 'Presenter',
  userDescription: 'late 20s, casual styling',
  uploadedImageDataUrl: null,
  appearanceSheet: '...',
  representativeImageDataUrl: '...',
  role: 'presenter' | 'customer' | 'narrator-on-screen',
  locked: false,
  createdAt: '...',
  lockedAt: '...',
}
```

Treated as a character for image-gen purposes (same refPart wiring), but lives outside `createJobState.characters[]` to keep brand-mode entities first-class.

### `createJobState.setting` (NEW — R22, brand mode only, optional)

Same shape as a location, scoped to brand mode.

```js
createJobState.setting = {
  id: 'set_xyz',
  name: 'Studio',
  userDescription: 'White cyclorama, soft three-point lighting',
  uploadedImageDataUrl: null,
  appearanceSheet: '...',
  representativeImageDataUrl: '...',
  locked: false,
  createdAt: '...',
  lockedAt: '...',
}
```

### `createJobState.styleLocked` (NEW — R23)

Tracks the soft-lock state of the visual style.

```js
createJobState.styleLocked = false   // becomes true when first cast/product item locks
```

When `styleLocked = true`, changing template (which would change `createStylePreset`) triggers the regen-confirmation modal.

### Cap accounting (R8 + R22)

Combined cap of 6 across all reference entities:

```js
function castCombinedCount() {
  const t = createJobState.videoType;
  if (t === 'narration') return 0;
  if (t === 'brand') {
    return (createJobState.product ? 1 : 0)
         + (createJobState.presenter ? 1 : 0)
         + (createJobState.setting ? 1 : 0)
         + (createJobState.characters || []).length
         + (createJobState.locations || []).length;
  }
  // film
  return (createJobState.characters || []).length + (createJobState.locations || []).length;
}
```

Brand mode typically uses 3 entities (product + presenter + setting) leaving 3 slots for additional cast / locations. Cap stays at 6.

### Persistence — `autoSaveCreateState` extension

`js/17c-create-pipeline.js:893` saves to localStorage. Add fields:

```js
const state = {
  ...existing,
  style: createJobState.style,
  customStylePrompt: createJobState.customStylePrompt,
  characters: createJobState.characters.map(c => ({
    id, name, userDescription, appearanceSheet, distinctiveTraits,
    ageRange, build, locked, libraryId, createdAt,
    // imgDataUrls: only saved if size budget allows
  })),
  locations: createJobState.locations.map(...),
  // scene fields: promptDirty, refCharacters, refLocation already partial coverage
}
```

**Storage budget concern**: representative images are dataURLs (~50–500KB each). 6 characters + 6 locations = ~3–6MB, near localStorage's 5MB ceiling. **Mitigation**: store images in IndexedDB instead, keyed by character id. Existing autosave keeps text-only character data in localStorage; image dataURLs are written to IDB on lock and read on restore.

---

## 3. User Flow

> **Step ordering (R24)**: Type → Input mode + body → Template & Output Size → Cast/Product → Launch. Step 0 (Type) is new and prepended; everything below preserves the current create-page order.

### Step 0 — Pick + Lock Video Type (NEW — R21)

Three options shown as side-by-side cards:

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ 🎁 Brand /       │ │ 🎬 Film /        │ │ 🎙️ Narration     │
│    Product       │ │    Story         │ │                  │
│                  │ │                  │ │                  │
│ Hero a product,  │ │ Characters,      │ │ Voice-over       │
│ launch, demo,    │ │ plot, scenes —   │ │ essay, explainer │
│ commercial.      │ │ short film/doc.  │ │ — no characters. │
└──────────────────┘ └──────────────────┘ └──────────────────┘

  Selected: Film / Story                       [✓ Lock type]
```

After lock the card collapses:

```
┌─────────────────────────────────────────────────────────┐
│ STEP 0 · 🎬 Film / Story  ✅                [⟲ Change]  │
└─────────────────────────────────────────────────────────┘
```

**Step 1 (Input & Template) stays hidden until Step 0 is locked.**

**Lock-change confirmation**: when user clicks `⟲ Change` after locking cast/product, show modal:

> "Switching type from Film to Brand will discard 2 locked characters and reset cast. Continue?"
> [Cancel] [Yes, switch type]

If continued: wipe `createJobState.characters/locations/product/presenter/setting` (depending on direction). Step 0 unlocks, Step 1 hides.

### Step 1 — Input mode + body (existing)

User selects:
- Input channel: **From Brainstorm** (when handoff is present) / Audio / Podcast / Text
- Provides input: file upload / textarea / podcast audio + optional PiP video

Channel-aware behavior:

| Channel | What lands in the cast section (Step 3) |
|---|---|
| **From Brainstorm** | Cast/product cards pre-fill from `__storiHandoff.finalScript` (when structured data exists) |
| **Text / Audio / Podcast** | Cast section starts empty; "🪄 Detect from script" button activates after script lands |

### Step 2 — Template & Output Size (existing — R24, R23)

Existing UI: size dropdown, style preset dropdown, template grid, text-in-images toggle.

**Style soft-lock state machine (R23)**:

```
┌──────────────────────┐
│ unset (no template)  │
└──────────┬───────────┘
           │ user picks template
           ▼
┌──────────────────────┐
│ chosen, editable     │ ← template can be swapped freely
│ (no cast lock yet)   │
└──────────┬───────────┘
           │ user locks first cast / product item
           ▼
┌──────────────────────┐
│ chosen, soft-locked  │ ← template still swappable, but with warning
│ (createJobState.     │
│  styleLocked = true) │
└──────────┬───────────┘
           │ user picks a different template
           ▼
┌──────────────────────┐
│ confirm modal:       │
│ "Will regenerate N   │
│  locked items.       │
│  [Cancel] [Continue] │
└─────┬─────────┬──────┘
      │ Cancel  │ Continue
      ▼         ▼
   stays    all locked items unlocked,
   locked   each gets `needsRegen = true`,
            new template's style applied
```

> **Style is NEVER set by brainstorm (R23, R26).** Brainstorm captures `tone` (writing/voiceover attribute) but no visual style. The user always picks a template.

### Step 3 — Cast / Product Setup (mode-aware — R22)

Renders below the template grid, before "Launch Script Agent". Visibility and contents depend on `createJobState.videoType`:

**Film type** — shows characters + locations (the original cast setup card):

Renders below the input step, before "Launch Script Agent". Visible only after audio/text is loaded.

```
┌─────────────────────────────────────────────────────────┐
│ 👥 Characters & Locations                               │
│ Define the recurring characters and places in your      │
│ story. Lock them to maintain visual consistency.        │
│                                                         │
│ How many characters? [1] [2] [3] [4] [5] [6]   ← stepper│
│ How many locations?  [0] [1] [2] [3] [4] [5]            │
│                                                         │
│ Combined cap: 6                                         │
└─────────────────────────────────────────────────────────┘
```

Stepper buttons clamp to 0–6 with cross-validation (chars + locs ≤ 6).

After count is set, render N character rows and M location rows:

```
┌─────────────────────────────────────────────────┐
│ Character 1                                     │
│  Name        [____________________________]    │
│  Description [____________________________]    │
│              [____________________________]    │
│  Reference   [📎 Upload photo (optional)   ]   │
└─────────────────────────────────────────────────┘
... (N character rows total)

┌─────────────────────────────────────────────────┐
│ Location 1                                      │
│  Name        [____________________________]    │
│  Description [____________________________]    │
│  Reference   [📎 Upload photo (optional)   ]   │
└─────────────────────────────────────────────────┘
... (M location rows total)

[✨ Generate appearances]  ← disabled until all rows filled
```

The "Generate appearances" button validates: every row has name + description, then proceeds to Step 2.

**Brand type** — shows product (required) + presenter (optional) + setting (optional):

```
┌─────────────────────────────────────────────────────────┐
│ 🎁 Product (required)                                   │
│   Name        [____________________________]           │
│   Description [____________________________]           │
│   Brand color [#1A2B3C  + add]   Logo [📎 Upload]       │
│   Product photo [📎 Upload]                             │
│   [✨ Generate hero shot]   [🔒 Lock product]           │
├─────────────────────────────────────────────────────────┤
│ 👤 Presenter (optional)                       [✕ Remove]│
│   Same shape as a character row                         │
├─────────────────────────────────────────────────────────┤
│ 🏞 Setting (optional)                                    │
│   Same shape as a location row                          │
└─────────────────────────────────────────────────────────┘
```

**Narration type** — Step 3 hidden entirely. Layout becomes:

```
   (Step 1: Input)
   (Step 2: Template & Output Size)
   "No characters or product to define for narration mode."
   [▶ Launch Script Agent — go]
```

### Step 4 — AI generation (parallel)

For each character/location row, run two Gemini calls in parallel (Promise.all across all rows × 2 calls):

- **Call A**: appearance sheet (text-only Gemini)
- **Call B**: representative image (Gemini Flash 2.5 Image / Imagen)

Show a loading spinner per card. Each card resolves independently — fast cards show their result while slow ones still spin.

If Call A fails: retry once, then fall back to using user description verbatim as appearance sheet.
If Call B fails: retry once, then mark the card with "image generation failed — please upload a reference image" and disable lock.

### Step 5 — Review

Each card now shows:

```
┌─────────────────────────────────────────────────┐
│ Character 1: Maya                               │
│  ┌──────────┐                                   │
│  │ [image]  │   8 yrs · Cinematic               │
│  │  240px   │                                   │
│  └──────────┘                                   │
│                                                 │
│  Appearance:                                    │
│  ┌─────────────────────────────────────────────┐│
│  │ 8 years old, shoulder-length curly black   ││
│  │ hair, deep brown eyes, scar above left     ││
│  │ eyebrow, red cotton dress, brass locket…   ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  [📝 Edit text]  [🎨 Regenerate image]          │
│  [📎 Upload new ref]  [🔒 Lock]                 │
└─────────────────────────────────────────────────┘
```

Operations:
- **Edit text** → opens textarea in place; save updates `appearanceSheet`
- **Regenerate image** → re-run Call B with same text (varied seed)
- **Upload new ref** → replace `uploadedImageDataUrl`, re-run Call B with refinement
- **Lock** → freeze. Card collapses to compact locked state.

### Step 6 — All locked → unlock storyboard

The "Launch Script Agent" / "Launch Storyboard Agent" button gates on:

```js
const allLocked = characters.every(c => c.locked) && locations.every(l => l.locked);
const hasZeroRefs = characters.length === 0 && locations.length === 0;
const canLaunch = allLocked || hasZeroRefs;
```

Tooltip when disabled: *"Lock all characters and locations to continue."*

### Step 7 — Storyboard generation (existing flow + cast/product preamble)

Once launched, the storyboard prompt at `js/17c-create-pipeline.js:1046` (and parallel paths at `:1126`, `:1667`, `:1755`, `:1936`) gets a character + location preamble prepended:

```
CHARACTERS in this story:
[Maya] — 8 years old, shoulder-length curly black hair, red cotton dress, brass locket, scar above left eyebrow
[Detective Joe] — late 40s, scruffy beard, trench coat, tired eyes

LOCATIONS:
[Kitchen] — 1970s kitchen, yellow walls, vintage appliances
[Office] — cluttered detective office, neon sign outside window

When a scene features a character or location, refer to them by their bracketed name (e.g. [Maya] enters [Kitchen]). The image generator already has their reference image and will lock visual consistency. Do NOT redescribe their physical traits.

Now, for each segment below…
```

After generation, parse each scene's prompt for `[Name]` tokens and auto-populate `scene.refCharacters[]` and `scene.refLocation`.

### Step 8 — Per-scene chip strip + edits

Each scene card in `create-storyboard-grid` renders character chips for its `refCharacters`. User can:

- Click `+ Add chip` → AI rewrite (default) or "bracket only" (power user)
- Click `×` on chip → AI rewrite to remove
- Manually edit prose → chips re-derived on save

Details in §6 Storyboard Integration.

### Step 9 — Image gen (gated)

When user launches image gen:

```js
const dirtyScenes = createScenes.filter(s => s.promptDirty);
if (dirtyScenes.length > 0) {
  alert(`${dirtyScenes.length} scenes need prose review before generation.`);
  // Highlight dirty scenes in yellow
  return;
}
```

Per-scene generation pulls in `getSceneRefImageParts(scene)` (existing helper at `js/17b-create-references.js:286`) — no change needed; it already maps `scene.refCharacters` to image parts.

---

## 4. AI Contracts

### Appearance Sheet — text-only

Endpoint: `gemini-2.5-flash` via existing API wrapper in `js/17a-create-api.js`.

```js
const STYLE_PREFIX = {
  cinematic: 'Cinematic film aesthetic, dramatic lighting, shallow depth of field',
  photorealistic: 'Photorealistic, natural lighting, lifelike skin and textures',
  animated: 'Stylized 2D animation, clean line art, expressive features',
  custom: createJobState.customStylePrompt || 'Highly detailed visual style',
};

async function generateAppearanceSheet(character, style, geminiKey) {
  const prompt = `You are a casting director. Given a character description and optional reference image, write a detailed canonical appearance sheet that will maintain visual consistency across many AI-generated scene images.

Character name: ${character.name}
User description: "${character.userDescription}"
Visual style: ${style} — ${STYLE_PREFIX[style]}
${character.uploadedImageDataUrl ? '(Reference image attached — match the likeness shown.)' : ''}

Return ONLY valid JSON (no markdown):
{
  "appearance": "Detailed visual description: age, height, build, face shape, hair (color/length/style), eyes, distinctive features, clothing (specific items, colors, fabrics), accessories. 3-5 sentences.",
  "distinctiveTraits": ["3-5 specific visual anchors that must appear in every image"],
  "ageRange": "X-Y",
  "build": "..."
}`;

  const parts = [{ text: prompt }];
  if (character.uploadedImageDataUrl) {
    parts.push({ inline_data: extractInlineData(character.uploadedImageDataUrl) });
  }
  // call Gemini, parse JSON, return
}
```

### Representative Image — image generation

Endpoint: `gemini-2.5-flash-image` (preferred) or `imagen-3` (fallback). Existing wrappers `generateImageGeminiFlash` and `generateImageImagen` in `js/17a-create-api.js`.

**Path A — no upload**:

```js
const prompt = `${STYLE_PREFIX[style]}. Full-body character portrait. ${character.appearanceSheet} Subject centered, plain neutral background, eye-level shot, full body visible.`;
const opts = { width: 768, height: 1024 };  // portrait aspect for character sheet
return await generateImageGeminiFlash(prompt, geminiKey, opts);
```

**Path B — with upload (likeness anchor)**:

```js
const prompt = `${STYLE_PREFIX[style]}. ${character.appearanceSheet} Match the likeness of the reference image — same face structure, features, build. Re-render in the target style.`;
const opts = {
  width: 768, height: 1024,
  refParts: [{ inlineData: extractInlineData(character.uploadedImageDataUrl) }],
};
return await generateImageGeminiFlash(prompt, geminiKey, opts);
```

### Vision Auto-Caption — image-only ref

Trigger: user uploads an image without typing a description. Before saving, prompt Gemini to extract a description from the image.

```js
async function autoCaptionFromImage(imgDataUrl, type, geminiKey) {
  const prompt = type === 'character'
    ? 'Describe the person in this image: age, build, hair, distinctive features, clothing. 1-2 sentences.'
    : 'Describe the location/environment in this image: setting, mood, key visual elements. 1-2 sentences.';
  // call gemini-2.5-flash with image attached, return text
}
```

### AI Rewrite — chip add/remove

Triggered when user adds or removes a chip from a scene card.

**Add operation**:

```js
async function rewriteSceneAddChar(scene, character, geminiKey) {
  const prompt = `Original scene prompt: "${scene.prompt}"

Rewrite this scene to naturally include [${character.name}]'s presence, action, or interaction with existing characters. Keep the same length, mood, camera direction, and pacing. Use bracket names exactly. Do NOT redescribe physical traits — the image generator already has their reference image.

Character to add:
[${character.name}] — ${character.appearanceSheet}

Return ONLY the rewritten prose, no commentary, no markdown.`;
  // call gemini-2.5-flash, return string
}
```

**Remove operation**:

```js
async function rewriteSceneRemoveChar(scene, character, geminiKey) {
  const prompt = `Original scene prompt: "${scene.prompt}"

Rewrite this scene without [${character.name}]. Remove the bracket name and any specific actions tied to them. Keep the same length, mood, and pacing. If the scene becomes nonsensical without them, return EXACTLY: "REMOVE_FAILED: <one-line reason>"

Return ONLY the rewritten prose or the REMOVE_FAILED string, no commentary.`;
}
```

If response starts with `REMOVE_FAILED:`, surface to user via confirmation modal:

> "This character is central to scene 3. Removing will leave the prose nonsensical. Continue anyway? You'll need to manually rewrite the prose."

### Detect From Script — v1.5 optional

```js
async function detectRefsFromScript(transcript, geminiKey) {
  const prompt = `Read this script and identify recurring characters and locations worth defining as references for visual consistency. Return JSON only:
{
  "characters": [{"name": "...", "description": "...", "appearances": N}],
  "locations": [{"name": "...", "description": "...", "appearances": N}]
}

Script:
${transcript}

Only include characters/locations that appear in 2 or more segments. Cap at 6 combined.`;
}
```

---

## 5. File-by-File Changes

### `index.html`

**New sections**:
1. **Character Setup card** in `create-input-step` — count steppers + character/location rows + "Generate appearances" button.
2. **Characters & Locations panel** below `#create-agent-panel` — shared component used in both timeline and canvas surfaces, with `data-surface="timeline"` or `data-surface="canvas"` driving disabled-state styling.
3. **Edit modal** — hidden overlay div for character editing (used canvas-side).

### `js/17b-create-references.js`

Currently 196+ lines handling the post-storyboard refs step. **Substantial rewrite** to own the upfront flow:

- Rename internals: `storyCharacters` → `createJobState.characters`
- Add: `setupCharacterRows(count)`, `renderCharacterRow(char, idx)`, `validateRowsFilled()`
- Add: `generateAppearanceSheet(char, style, key)` — Gemini text call
- Add: `generateRepresentativeImage(char, style, key)` — Gemini image call (paths A and B)
- Add: `autoCaptionFromImage(imgDataUrl, type, key)` — vision fallback
- Add: `lockCharacter(charId)`, `unlockCharacter(charId, reason)` — with downstream invalidation
- Add: `renderRefsPanel(surface)` — surface-aware (timeline = read-only, canvas = full)
- Add: `renderEditModal(charId)` — canvas-side edit overlay
- Keep: existing `buildScenePromptWithRefs`, `getSceneRefImageParts` (unchanged signatures, accept new data shape)
- Mirror back to legacy `storyCharacters` / `storyEnvironments` globals during migration (so legacy code paths continue to work)

### `js/17c-create-pipeline.js`

- **Storyboard prompt injection** — at `:1046`, `:1126`, `:1667`, `:1755`, `:1936`: prepend character/location preamble built from locked refs
- **Bracket parsing** — after storyboard response: parse `scene.prompt` for `[Name]` tokens, auto-populate `scene.refCharacters` and `scene.refLocation`, set `scene.promptDirty = false`
- **Storyboard scene card chip strip** — at the storyboard render path (around `:1818`, `:2000`): add chip strip below prose textarea, `+ Add` dropdown, `×` per chip
- **AI rewrite handlers** — `addCharacterToScene(idx, charId)`, `removeCharacterFromScene(idx, charId)` — call AI rewrite, update prose, clear dirty flag
- **Manual prose edit handler** — on textarea blur/save: re-parse brackets, update `refCharacters`, validate against defined chars (alert if undefined bracket)
- **Image generation gate** — before per-scene gen, check `scene.promptDirty`; show alert and skip dirty scenes
- **Storyboard launch button gate** — disable until `allLocked || hasZeroRefs`
- **autoSaveCreateState** — extend serialized state with `style`, `characters`, `locations`
- **Storage migration** — split image dataURLs into IndexedDB bucket

### `js/17a-create-api.js`

- Add: `STYLE_PREFIX` constant map
- Confirm existing `generateImageGeminiFlash` and `generateImageImagen` accept `refParts` correctly (already do — verified via `getSceneRefImageParts` integration at `:2616`)

### `js/29-canvas-render.js`

- **Render Characters & Locations panel** — mounted below the agent panel when canvas is active (surface = "canvas")
- **Filter state** — add `g.characterFilter = { activeIds: new Set(), mode: 'AND', compactView: false }`
- **Filter activation** — wire 👁 buttons in panel rows, chips in right inspector, cursor-mode dropdown filter option
- **Filter rendering** — in `updateImgNode` / `updateVidNode` / `updateSBNode`: apply `cg-node--dimmed` class based on `isFilteredOut(scene)`
- **Filter chip UI** — fixed-position chip at top of viewport when filter is active
- **Compact view** — when enabled, `doLayout()` skips filtered-out scenes
- **Edit modal handler** — open/close character edit overlay
- **Add character mid-project** — `+ Add` button on panel header opens setup card in canvas overlay

### `js/27-canvas-state.js`

- Confirm `scene.refCharacters` mirroring is preserved (already exists)
- Add (later): `clusterId` field migration for movie mode (deferred)

### `css/styles.css`

- `.character-setup-card` — input step setup card layout
- `.character-row`, `.location-row` — per-ref input rows
- `.char-row-locked`, `.char-row-unlocked` — visual state
- `.refs-panel` — shared panel base
- `.refs-panel[data-surface="timeline"] .ref-action-btn { opacity: 0.4; pointer-events: none; cursor: not-allowed; }` — disabled controls in timeline
- `.refs-panel-row` — per-row layout in panel
- `.scene-card .char-chip-strip` — chips on storyboard scene cards
- `.char-chip` — individual chip
- `.scene-prompt-dirty` — yellow warning state on dirty scenes

### `css/canvas-graph.css`

- `.cg-node--dimmed` — opacity 0.15 for filtered-out nodes
- `#create-canvas-step.compact-filter .cg-node--dimmed` — display: none in compact mode
- `.cg-filter-chip` — filter chip at top of viewport
- `.cg-char-edit-modal` — edit modal overlay

---

## 6. Storyboard Integration (Approach C)

### Chip strip on each scene card

Below the prose textarea on each scene card in `create-storyboard-grid`:

```html
<div class="char-chip-strip" data-scene-idx="3">
  <span class="char-chip" data-char-id="char_1">
    <img src="..." class="char-chip-img" />
    Maya
    <button class="char-chip-x" data-action="remove">×</button>
  </span>
  <span class="char-chip" data-char-id="char_2">...</span>
  <button class="char-chip-add" data-action="open-add-menu">+ Add</button>
</div>
```

`+ Add` opens a small dropdown:

```
┌───────────────────────────────┐
│ ✨ Detective Joe (rewrite)    │  ← AI rewrite (default)
│ ✨ Mom (rewrite)              │
├───────────────────────────────┤
│ ➕ Add as bracket only…       │  ← power-user submenu
└───────────────────────────────┘
```

### State machine for promptDirty

```
INITIAL: promptDirty = false (after storyboard generation)
                                     │
  user clicks chip × ───── AI rewrite ──── success ──── promptDirty stays false
                                                  └─── fail ──── promptDirty = true
  user clicks + ✨ char ─── AI rewrite ──── success ──── promptDirty stays false
                                                  └─── REMOVE_FAILED ── modal
  user clicks + bracket only ─── promptDirty = true (warning shown)
  user edits prose textarea ─── on save: re-parse brackets ─── if mismatch ── promptDirty = true
                                                       └─── if match ──── promptDirty = false
  user clicks "Confirm prose final" ─── promptDirty = false (with bracket re-parse)
```

### Visual indicator on dirty scenes

```css
.scene-card.scene-prompt-dirty {
  border-left: 4px solid var(--lp-warn, #f5a623);
}
.scene-card.scene-prompt-dirty .scene-warning-banner {
  display: flex;
}
```

Banner text: *"⚠ Prose may be inconsistent with chips. [Edit] [Confirm as is]"*

### AI rewrite UX banner

After successful rewrite:

```
✨ AI rewrote this scene to include Joe.    [Undo]    [Edit prose]
```

Auto-dismisses in 8s. `Undo` reverts prose to pre-rewrite snapshot.

### Image gen gate

At launch image gen entry point (e.g. `runImageGeneration` in `17c-create-pipeline.js`):

```js
const dirty = createScenes.filter(s => s.promptDirty);
if (dirty.length > 0) {
  if (!confirm(`${dirty.length} scenes have unresolved prose. Skip them and generate the rest?`)) return;
  scenesToGenerate = createScenes.filter(s => !s.promptDirty);
}
```

---

## 7. Mid-Project Character Add Constraint

Per R7, characters added after lock cannot retroactively appear in already-generated scenes.

### Implementation

```js
function addCharacterMidProject(charData) {
  charData.createdAt = new Date().toISOString();
  charData.locked = false;
  createJobState.characters.push(charData);
  // No automatic scene assignment.
}
```

### UX cues

The new character's row in the panel shows:

```
┌────┐ Detective Joe         🔒  [NEW]
│img │ added 2025-05-03
└────┘ Available for new scenes only.
       Use chips on individual scenes
       to assign manually.
```

When user adds Joe to scene 5 via chip (AI rewrite path), the rewrite succeeds, but scene 5's image is now stale (its prose has Joe but its existing image doesn't). Mark `scene.imgStale = true` and show "🔄 Regen needed" indicator on the scene's image card.

---

## 8. promptDirty Flag — Detailed State Machine

| Action | Pre-state | Effect on prompt | Effect on dirty | Effect on chips |
|---|---|---|---|---|
| AI rewrite (add) succeeds | dirty=any | prose updated | dirty=false | chip added |
| AI rewrite (add) fails | dirty=any | prose unchanged | dirty=true | chip not added, error shown |
| AI rewrite (remove) returns prose | dirty=any | prose updated | dirty=false | chip removed |
| AI rewrite (remove) returns REMOVE_FAILED | dirty=any | prose unchanged (modal shown) | dirty=any | chip not removed |
| Bracket-only add | dirty=any | `[Name]` appended | dirty=true | chip added |
| Manual prose save, brackets match | dirty=any | prose updated | dirty=false | chips re-derived |
| Manual prose save, undefined bracket | dirty=any | prose NOT saved | dirty=any | alert: "Define [X] in Characters first" |
| Manual prose save, missing bracket for refChar | dirty=any | prose updated | dirty=true | refCharacter auto-removed, dirty stays |
| User clicks "Confirm prose final" | dirty=true | re-parse brackets, sync refCharacters | dirty=false | chips re-derived |
| Storyboard regenerated | dirty=any | prose replaced | dirty=false | chips re-derived from new prose |

---

## 9. Characters & Locations Panel

### Placement

Below the existing left agent panel (`#create-agent-panel`). Separate collapsible component sharing the same parent column.

```
┌──────────────────────────────────┐
│ AGENT PANEL                      │  ← #create-agent-panel
│ (existing steps + statuses)      │
├──────────────────────────────────┤
│ REFERENCES                  [▾]  │  ← #create-refs-panel
│ [Characters | Locations]    [+]  │
├──────────────────────────────────┤
│ rows…                            │
└──────────────────────────────────┘
```

### Surface gating

| Action | Timeline | Canvas |
|---|---|---|
| View ref rows | ✅ | ✅ |
| Edit appearance text | ❌ disabled | ✅ |
| Regenerate image | ❌ disabled | ✅ |
| Upload new ref | ❌ disabled | ✅ |
| Lock / unlock | ❌ disabled | ✅ |
| Filter (👁) | ❌ disabled | ✅ |
| Add new character | ❌ disabled | ✅ |
| Delete | ❌ disabled | ✅ |
| Click row to expand | ✅ (read-only details) | ✅ |

Disabled buttons show a tooltip on hover/click: *"Open canvas to edit characters."*

### Render function — surface-aware

```js
function renderRefsPanel(surface) {
  const isCanvas = surface === 'canvas';
  const characters = createJobState.characters || [];
  const locations = createJobState.locations || [];

  const html = characters.map(c => `
    <div class="refs-panel-row" data-id="${c.id}" data-surface="${surface}">
      <img src="${c.representativeImageDataUrl || PLACEHOLDER}" class="refs-panel-thumb" />
      <div class="refs-panel-meta">
        <div class="refs-panel-name">${c.name} ${c.locked ? '🔒' : '🔓'}</div>
        <div class="refs-panel-sub">${c.ageRange || ''} · ${createJobState.style || 'Cinematic'}</div>
        <div class="refs-panel-count">Appears in ${countAppearances(c.id)} / ${createScenes.length} scenes</div>
      </div>
      <div class="refs-panel-actions">
        <button class="ref-action-btn ref-filter-btn" data-action="filter" ${isCanvas ? '' : 'disabled'}>👁</button>
        <button class="ref-action-btn ref-edit-btn" data-action="edit" ${isCanvas ? '' : 'disabled'}>✏</button>
      </div>
    </div>
  `).join('');
  // similar for locations
  panelEl.innerHTML = html;
}
```

### Add character mid-project (canvas only)

`+ Add` button on panel header opens a setup overlay (modal). Same row UI as Step 1 but for a single character. After "Generate appearance" → "Lock", the character joins `createJobState.characters` with `createdAt = now()`.

### Edit modal (canvas only)

```html
<div id="char-edit-modal" class="cg-char-edit-modal hidden">
  <div class="modal-card">
    <header>
      <span class="modal-title">Maya</span>
      <button class="modal-close">×</button>
    </header>
    <div class="modal-body">
      <img class="modal-thumb" />
      <div class="modal-meta">
        <span>🔒 Locked · Cinematic · 7/12 scenes</span>
      </div>
      <textarea class="modal-appearance" rows="6">{appearanceSheet}</textarea>
      <ul class="modal-traits">{distinctiveTraits as list}</ul>
      <div class="modal-appearances">
        Appears in:
        <button class="modal-scene-link" data-scene-idx="0">Scene 1</button>
        <button class="modal-scene-link" data-scene-idx="2">Scene 3</button>
        ...
      </div>
      <div class="modal-actions">
        <button data-action="regen-image">🎨 Regenerate</button>
        <button data-action="upload-new">📎 New ref</button>
        <button data-action="unlock">🔓 Unlock</button>
      </div>
    </div>
  </div>
</div>
```

Clicking a scene link calls `panToColumn(sceneIdx, 'sb')` and closes the modal.

---

## 10. Filter by Character (Canvas Only)

### Activation

1. Click 👁 in panel row → `g.characterFilter.activeIds = new Set([charId])`
2. Shift-click 👁 → toggle character in/out of activeIds
3. Cmd/Ctrl-click → equivalent to shift-click
4. Right-click 👁 → "Filter only this" (clears activeIds, sets to single char)
5. Click character chip in right inspector → activates filter
6. Cursor-mode dropdown → "Filter by character…" submenu

### Filter chip

Fixed-position element at top of canvas viewport (below runtime ruler when present in movie mode):

```html
<div id="cg-filter-chip" class="cg-filter-chip">
  <span>🔎 Filtering: Maya</span>
  <span class="cg-filter-count">7 / 12 scenes</span>
  <button class="cg-filter-mode-toggle">AND</button>
  <button class="cg-filter-clear">✕</button>
</div>
```

Esc key clears filter.

### Visual modes

```js
function isFilteredOut(scene) {
  const f = g.characterFilter;
  if (f.activeIds.size === 0) return false;
  const charsInScene = new Set(scene.refCharacters || []);
  if (f.mode === 'AND') {
    return ![...f.activeIds].every(id => charsInScene.has(id));
  } else {
    return ![...f.activeIds].some(id => charsInScene.has(id));
  }
}
```

In `updateImgNode`/`updateVidNode`/`updateSBNode`:

```js
if (isFilteredOut(scene)) node.classList.add('cg-node--dimmed');
else node.classList.remove('cg-node--dimmed');
```

In `redrawCurves`:

```js
const dimmed = isFilteredOut(srcScene) || isFilteredOut(dstScene);
curveEl.style.opacity = dimmed ? '0.15' : '1';
```

In `doLayout` when `g.characterFilter.compactView`:

```js
const visibleScenes = g.scenes.filter(s => !isFilteredOut(s));
// lay out only visible scenes
```

### Movie-mode (deferred)

When `canvas-movie-mode-plan.md` Phase 1 lands, the filter must operate **globally across all clusters and all node types**. `isFilteredOut` already does this since it operates on `scene` regardless of cluster. The filter chip must show:

```
🔎 Filtering: Maya · 7 / 47 scenes across 6 clusters
```

The Final Movie node always stays visible (independent of filter). Cluster Output nodes whose cluster has 0 matching scenes show as a dimmed band with note: *"No matching scenes in this cluster."*

This is captured in `canvas-movie-mode-plan.md` and will be implemented as part of movie-mode build, not now.

### Selection survives filter

Selected scenes stay selected even when dimmed. Add `.cg-node-selected.cg-node--dimmed` styling: opacity 0.4 (more visible than plain dim) + selection ring still drawn.

### Filter + character delete

When user deletes a character that's in `g.characterFilter.activeIds`:

```js
function deleteCharacter(charId) {
  // ... remove from createJobState.characters
  g.characterFilter.activeIds.delete(charId);
  if (g.characterFilter.activeIds.size === 0) clearFilterChip();
  renderAll();
}
```

---

## 11. Verification Methodology

### Schema invariants (assert at every mutation)

```js
function assertCharacterInvariants() {
  const chars = createJobState.characters || [];
  const ids = chars.map(c => c.id);
  console.assert(new Set(ids).size === ids.length, 'Duplicate character IDs');
  console.assert(chars.length + (createJobState.locations || []).length <= 6, 'Cap exceeded');
  for (const c of chars) {
    console.assert(typeof c.id === 'string' && c.id.startsWith('char_'), 'Bad character id');
    console.assert(typeof c.name === 'string' && c.name.length > 0, 'Empty character name');
    console.assert(typeof c.locked === 'boolean', 'Lock state missing');
    if (c.locked) {
      console.assert(c.appearanceSheet, 'Locked character missing appearance');
      console.assert(c.representativeImageDataUrl, 'Locked character missing image');
    }
  }
}
```

Run on: lock, unlock, add, delete, autosave restore.

### Scene/chip consistency check

```js
function assertSceneChipConsistency(scene) {
  const tokens = (scene.prompt.match(/\[([^\]]+)\]/g) || [])
    .map(t => t.slice(1, -1));
  const refNames = scene.refCharacters
    .map(id => createJobState.characters.find(c => c.id === id)?.name)
    .filter(Boolean);

  const inPromptNotInRefs = tokens.filter(t => !refNames.includes(t));
  const inRefsNotInPrompt = refNames.filter(n => !tokens.includes(n));
  const isConsistent = inPromptNotInRefs.length === 0 && inRefsNotInPrompt.length === 0;

  // Dirty flag should match consistency
  console.assert(scene.promptDirty !== isConsistent, 'Dirty flag inconsistent with prose');
  return isConsistent;
}
```

Run on: AI rewrite complete, manual prose save, autosave restore.

### Surface-gating verification

```js
function assertSurfaceGating() {
  const panel = document.getElementById('create-refs-panel');
  if (!panel) return;
  const surface = panel.dataset.surface;
  const editButtons = panel.querySelectorAll('.ref-action-btn[data-action="edit"]');
  const filterButtons = panel.querySelectorAll('.ref-action-btn[data-action="filter"]');

  if (surface === 'timeline') {
    editButtons.forEach(b => console.assert(b.disabled, 'Edit btn must be disabled in timeline'));
    filterButtons.forEach(b => console.assert(b.disabled, 'Filter btn must be disabled in timeline'));
  } else if (surface === 'canvas') {
    editButtons.forEach(b => console.assert(!b.disabled, 'Edit btn must be enabled in canvas'));
  }
}
```

### AI response sanity

```js
function validateAppearanceSheetResponse(json) {
  const required = ['appearance', 'distinctiveTraits', 'ageRange', 'build'];
  for (const k of required) {
    if (!(k in json)) throw new Error(`Missing field ${k} in appearance sheet`);
  }
  if (typeof json.appearance !== 'string' || json.appearance.length < 30) {
    throw new Error('Appearance description too short');
  }
  if (!Array.isArray(json.distinctiveTraits)) {
    throw new Error('distinctiveTraits must be an array');
  }
}
```

### Storyboard preamble verification

After storyboard generation, confirm the preamble was injected:

```js
function verifyStoryboardPreamble(promptSent) {
  if (createJobState.characters.length > 0) {
    console.assert(promptSent.includes('CHARACTERS'), 'Preamble missing in storyboard request');
    for (const c of createJobState.characters) {
      console.assert(promptSent.includes(`[${c.name}]`), `Char ${c.name} missing from preamble`);
    }
  }
}
```

### Image gen gate verification

Before any per-scene image gen call, assert no dirty scenes are in the queue:

```js
function assertCleanImageGenQueue(scenesToGen) {
  const dirty = scenesToGen.filter(s => s.promptDirty);
  console.assert(dirty.length === 0, `${dirty.length} dirty scenes in image gen queue`);
}
```

---

## 12. Smoke Tests

Each test is an end-to-end scenario, runnable manually. Numbered for tracking.

### ST-01 — Define 3 characters from scratch (happy path)

1. Open create page, upload audio, set style = "Cinematic"
2. Set "How many characters?" = 3, "How many locations?" = 0
3. Fill name + description for each (no images uploaded)
4. Click "✨ Generate appearances"
5. Wait for spinners to resolve
6. **Expect**: 3 cards show appearance sheets + generated images
7. Click "🔒 Lock" on each
8. **Expect**: "Launch Storyboard Agent" button becomes enabled
9. Click "Launch Storyboard Agent"
10. **Expect**: storyboard scenes generated, each with bracket tokens for the relevant characters
11. **Expect**: chip strips render on each scene card matching the bracket tokens
12. **Expect**: `scene.refCharacters` matches chip names for every scene

### ST-02 — Define character with uploaded image (style refinement)

1. Upload audio, set style = "Photorealistic"
2. Add 1 character with name + description + photo upload
3. Click "Generate appearances"
4. **Expect**: appearance sheet describes the uploaded photo's likeness
5. **Expect**: representative image visually matches photo's likeness, rendered in photorealistic style
6. Lock and proceed

### ST-03 — Cap enforcement

1. Try to set characters = 4 and locations = 4 (combined = 8)
2. **Expect**: location stepper clamps to 2 (4 + 2 = 6)
3. Or characters stepper clamps when locations is already 4
4. **Expect**: total never exceeds 6

### ST-04 — Description-only ref (no image)

1. Add 1 character, name + description only, no upload
2. Click "Generate appearances"
3. **Expect**: appearance sheet generated from description
4. **Expect**: representative image generated from appearance sheet (path A)

### ST-05 — Image-only ref (no description)

1. Add 1 character, name only, upload an image, leave description blank
2. **Expect**: validation prevents proceeding to "Generate appearances" — description required
3. (alternate: vision auto-caption fills description before generation — confirm UX)

### ST-06 — AI chip add (default rewrite)

1. After storyboard generation, locate scene 3 which features only Maya
2. Click `+ Add` chip → click "Detective Joe (rewrite)"
3. **Expect**: spinner on scene card for ~1s
4. **Expect**: prose updates, now includes `[Detective Joe]` token
5. **Expect**: chip strip now shows Maya + Joe
6. **Expect**: `scene.refCharacters` = `[char_maya, char_joe]`
7. **Expect**: `scene.promptDirty` = false
8. **Expect**: banner appears: "✨ AI rewrote this scene to include Joe"

### ST-07 — AI chip remove with REMOVE_FAILED

1. Locate a scene where Maya is central (e.g. "Maya hides…")
2. Click `×` on Maya's chip
3. AI returns `REMOVE_FAILED: Maya is the only character in this scene`
4. **Expect**: confirmation modal: "Remove anyway? You'll need to manually rewrite the prose."
5. Click "Cancel"
6. **Expect**: chip not removed, prose unchanged

### ST-08 — Bracket-only add (power user, dirty flag)

1. Click `+ Add` → submenu "Add as bracket only…" → choose Joe
2. **Expect**: prose has `[Joe]` appended at end
3. **Expect**: `scene.promptDirty = true`
4. **Expect**: yellow border on scene card, warning banner shown
5. Try to launch image gen
6. **Expect**: confirmation prompt about dirty scenes
7. Edit prose to weave Joe in naturally
8. Click "Confirm prose final" or save
9. **Expect**: dirty flag clears, yellow border gone

### ST-09 — Manual prose edit removes bracket

1. Open prose textarea on scene that has Maya + Joe
2. Delete `[Joe]` from prose
3. Save (blur or button)
4. **Expect**: chip strip updates — Joe chip disappears
5. **Expect**: `scene.refCharacters` no longer includes Joe
6. **Expect**: `scene.promptDirty = false` (chips and prose now match)

### ST-10 — Manual prose edit adds undefined bracket

1. Edit prose, type `[Karen]` (Karen not defined)
2. Save
3. **Expect**: alert: "[Karen] is not a defined character. Define her in Characters first or remove the bracket."
4. **Expect**: prose change rejected (revert) OR saved with `promptDirty = true` (decide UX)

### ST-11 — Lock/unlock invalidation warning

1. With 3 locked characters and storyboard generated
2. Open canvas, open Maya's edit modal, click "🔓 Unlock"
3. **Expect**: confirmation: "Unlocking Maya will require regenerating any scene that references her. 7 scenes will be marked. Continue?"
4. Click "Continue"
5. **Expect**: 7 scenes get `imgStale = true` indicator on their image cards

### ST-12 — Add character mid-project

1. After storyboard is generated and some images exist, open canvas
2. In refs panel, click `+ Add`
3. Define a new character (Mom)
4. Lock her
5. **Expect**: panel row shows "Available for new scenes only" tooltip
6. **Expect**: existing scenes' chip strips do NOT include Mom automatically
7. Use chip + AI rewrite to add Mom to scene 5
8. **Expect**: scene 5 prose updates, chip added
9. **Expect**: scene 5's image card shows "🔄 Regen needed" indicator

### ST-13 — Filter activation (single char)

1. In canvas, click 👁 next to Maya in refs panel
2. **Expect**: filter chip appears at top: "🔎 Filtering: Maya · 7 / 12 scenes"
3. **Expect**: scenes without Maya dim to opacity 0.15
4. **Expect**: curves between dimmed nodes also dim
5. Click ✕ on filter chip
6. **Expect**: all nodes return to full opacity

### ST-14 — Filter shift-click (AND multi-select)

1. Click 👁 on Maya
2. Shift-click 👁 on Joe
3. **Expect**: chip text: "Filtering: Maya AND Joe · 2 / 12 scenes"
4. **Expect**: only scenes with both characters undimmed
5. Shift-click 👁 on Maya again
6. **Expect**: chip text: "Filtering: Joe · 4 / 12 scenes"

### ST-15 — Filter compact toggle

1. Activate filter on Maya (7 scenes)
2. Click compact-view toggle
3. **Expect**: 5 non-Maya scenes hidden entirely
4. **Expect**: layout reflows; remaining 7 scenes pack tighter
5. Toggle off
6. **Expect**: layout returns, 5 scenes re-appear dimmed

### ST-16 — Filter + character delete auto-clear

1. Filter active on Maya
2. Open Maya's edit modal, click "Delete character"
3. Confirm deletion
4. **Expect**: filter auto-clears, all nodes return to full opacity

### ST-17 — Surface gating: timeline vs canvas

1. On the create page (timeline view, no canvas open), refs panel should render
2. **Expect**: 👁 and ✏ buttons visually disabled
3. Click a disabled button
4. **Expect**: tooltip: "Open canvas to edit characters."
5. Open canvas
6. **Expect**: same panel now shows enabled buttons

### ST-18 — Storyboard launch gate

1. Define 3 characters, lock 2, leave 1 unlocked
2. **Expect**: "Launch Storyboard Agent" button disabled
3. **Expect**: tooltip on hover: "Lock all characters and locations to continue."
4. Lock the third
5. **Expect**: button enables

### ST-19 — Zero characters skip path

1. Set characters = 0, locations = 0
2. **Expect**: "Generate appearances" button hidden or N/A
3. **Expect**: "Launch Storyboard Agent" enabled immediately (no lock gate)
4. Storyboard generates as today (no character preamble)

### ST-20 — Persistence across reload

1. Define 3 characters, lock all, generate storyboard
2. Reload the page
3. **Expect**: characters restored from autosave (text data from localStorage)
4. **Expect**: representative images restored from IndexedDB
5. **Expect**: scene chip strips render correctly from saved `refCharacters`

### ST-21 — Image gen ref forwarding (existing pipeline)

1. Lock Maya with reference image
2. Storyboard scene 1 contains `[Maya] sits at the table`
3. Click "Generate" on scene 1
4. **Expect**: Gemini image API call includes Maya's `representativeImageDataUrl` as a refPart
5. **Expect**: generated image visually matches Maya's locked appearance

### ST-22 — Detect-from-script (v1.5)

1. Upload audio, transcribe
2. Click "🪄 Detect from script"
3. **Expect**: Gemini returns suggested characters/locations
4. **Expect**: rows pre-fill with suggested names + descriptions
5. User reviews, edits, locks

### ST-23 — Video type lock blocks Step 1

1. Open create page
2. Step 0 visible with three type cards
3. **Expect**: Step 1 (Input & Template) hidden or visually disabled
4. Pick Film, click "Lock type"
5. **Expect**: Step 0 collapses to compact locked card; Step 1 reveals
6. **Expect**: `createJobState.videoType === 'film'` and `videoTypeLocked === true`

### ST-24 — Type-change confirmation wipes locked cast

1. Lock type as Film, lock 2 characters
2. Click "⟲ Change" on Step 0
3. Pick Brand, click Lock
4. **Expect**: confirmation modal: "Switching from Film to Brand will discard 2 locked characters. Continue?"
5. Click Continue
6. **Expect**: `createJobState.characters` cleared; cast section now shows brand-mode UI (product/presenter/setting)
7. Click Cancel instead → previous Film state preserved

### ST-25 — Brand mode product flow

1. Lock type as Brand
2. Step 3 shows Product card (required), Presenter (optional, removable), Setting (optional)
3. Fill product name + description, upload product photo, pick brand color
4. Click "Generate hero shot" → spinner → product image appears
5. Click "Lock product" → card collapses to locked state
6. Verify `createJobState.product.locked === true` and `representativeImageDataUrl` populated
7. **Expect**: Storyboard launch button still disabled (presenter/setting not yet decided)
8. Remove presenter (✕), skip setting → launch button enables

### ST-26 — Narration mode hides cast section entirely

1. Lock type as Narration
2. **Expect**: Step 1 (Input) and Step 2 (Template) visible
3. **Expect**: Step 3 (Cast/Product) **not rendered** at all
4. **Expect**: Storyboard launch button enabled (no gate to clear)
5. Refs panel below agent panel hidden (no entities to show)

### ST-27 — Brainstorm structured handoff pre-fills cast

1. In Brainstorm, complete a Film-mode session, defining 2 characters (Maya, Joe) with appearance descriptions
2. Click "Send to Copilot"
3. Land on create page → Step 0 auto-locked to Film (from `__storiHandoff.target` + `finalScript` shape)
4. Step 1 input section pre-filled with `plainText`
5. Step 3 cast section shows 2 character rows pre-filled (name + userDescription) but NOT yet locked
6. User uploads photos, clicks Generate, locks each
7. **Expect**: locked characters carry the brainstorm-supplied descriptions

### ST-28 — Style soft-lock after first cast lock

1. Pick template "Short Film" (style: cinematic)
2. Lock 1 character (Maya)
3. **Expect**: `createJobState.styleLocked = true`
4. **Expect**: template grid still shows other templates as clickable, but with a 🔒 indicator on the current selection

### ST-29 — Template change after style lock triggers regen modal

1. Continuing from ST-28, click a different template ("Anime Story", style: anime)
2. **Expect**: confirmation modal: "Switching template will change visual style from Cinematic to Anime. 1 locked cast member was generated in Cinematic. Continue and regenerate?"
3. Click Continue
4. **Expect**: Maya's row shows "needs regen" badge; her `representativeImageDataUrl` cleared, `appearanceSheet` retained
5. **Expect**: she becomes unlocked (`locked = false`)
6. User clicks "Generate" again → new image in anime style
7. Lock again → `styleLocked = true`

### ST-30 — Detect from script with mode-aware extraction

1. Lock type as Film. Paste a 5-paragraph short story into Text input.
2. Click "🪄 Detect characters/locations from script"
3. **Expect**: Gemini call uses film-mode extraction prompt (asks for characters + locations only)
4. **Expect**: 3 suggested characters + 1 location pre-fill cast section
5. Switch type to Brand (confirmation, wipe), paste a product script
6. **Expect**: detect button now reads "Detect product/presenter from script"; Gemini prompt asks for product + presenter

---

## 13. Phased Build Order

### Phase 1 — Core upfront flow for Film mode (✅ SHIPPED)

Already implemented. Provides the cast setup card (characters + locations), AI generation, lock flow, storyboard preamble, bracket parsing, refs panel read-only on timeline. Works for projects that effectively are Film mode without an explicit type pick.

Smoke tests passing: ST-01, ST-02, ST-04, ST-18, ST-20

### Phase 1.5 — Video Type + Brand mode + Narration mode (NEXT)

- **Step 0**: video type lock UI (Brand / Film / Narration), `createJobState.videoType`, lock-change confirmation
- **Brand mode**: product card UI, presenter card, setting card, schema additions, image-gen hero-shot phrasing
- **Narration mode**: hide cast section entirely, allow direct launch
- **Brainstorm handoff structured pre-fill**: when `__storiHandoff.finalScript.characters` or `.product` exists, seed cast/product cards
- **Cap accounting** updated to include product/presenter/setting
- **Bracket parser** extended to recognize product name
- **Image-gen** branches refPart construction by product vs character
- Smoke tests: ST-23, ST-24, ST-25, ST-26, ST-27

### Phase 1.6 — Style soft-lock + template change confirmation

- `createJobState.styleLocked` flag set on first cast/product lock
- Template change while `styleLocked` triggers regen-confirmation modal
- All locked items get `needsRegen` badge after style change; user re-runs Generate per item or "Regenerate all"
- Smoke tests: ST-28, ST-29

### Phase 1.7 — Detect from script (audio + text)

- "🪄 Detect characters/locations from script" button on Film type cast section
- "🪄 Detect product/presenter from script" button on Brand type cast section
- Triggered after transcription (audio/podcast) or text input typed
- Gemini extraction prompt mode-specific
- User reviews suggestions, edits, locks
- Smoke tests: ST-30

### Phase 2 — Storyboard editing (chips + AI rewrite) — original plan

- Data model: `createJobState.style`, `.characters`, `.locations`
- Step 1 setup card (count + rows)
- Step 2 AI generation (appearance sheet + representative image)
- Step 3 review + lock
- Storyboard launch gate
- Storyboard preamble injection
- Bracket parsing → auto-populate `scene.refCharacters`
- IndexedDB image storage
- Smoke tests ST-01, ST-02, ST-04, ST-18, ST-20

### Phase 2 — Storyboard editing (chips + AI rewrite)

- Chip strip on scene cards
- `+ Add` dropdown with AI rewrite + bracket-only options
- AI rewrite handlers (add/remove)
- Manual prose edit re-parse
- `promptDirty` flag + visual warning + image gen gate
- Smoke tests ST-06, ST-07, ST-08, ST-09, ST-10

### Phase 3 — Refs panel (timeline read-only)

- Panel mounted below agent panel on create page
- Read-only rendering
- Surface gating (`data-surface="timeline"`)
- Smoke test ST-17

### Phase 4 — Refs panel (canvas full)

- Same panel mounted in canvas
- Surface gating (`data-surface="canvas"`)
- Edit modal
- Mid-project add
- Lock/unlock with downstream invalidation
- Smoke tests ST-11, ST-12, ST-17

### Phase 5 — Filter (canvas only)

- Filter state in `g`
- Filter chip UI
- Dim rendering, compact toggle
- Multi-select via shift-click
- Filter auto-clear on character delete
- Smoke tests ST-13, ST-14, ST-15, ST-16

### Phase 6 — v1.5 enhancements (optional)

- Detect-from-script button
- Auto-generate ref image from description
- Library reuse (cross-project)
- Smoke test ST-22

### Phase 7 — Movie-mode integration (deferred to movie-mode build)

- Filter operates globally across all clusters
- Cluster Output nodes show "no matching scenes" when filter excludes all cluster scenes
- Final Movie node always visible

---

## 14. Open Items (decisions still needed)

1. **Image-only ref**: when user uploads image but leaves description blank — auto-caption via Gemini Vision (UX seamless), or block and require description (UX strict)? Defaulting to **auto-caption** in this plan.
2. **Custom style**: when user picks "Custom" style, where does the prompt come from? A textarea in Step 0 input step, mirrored to `createJobState.customStylePrompt`? Or use existing `createStylePrompt` global?
3. **Manual prose with undefined bracket**: reject the save (force user to fix) or save with promptDirty = true (let user fix later)? Defaulting to **reject** in this plan.
4. **Storage approach for representative images**: localStorage (5MB cap, risky) vs IndexedDB (unbounded). Defaulting to **IndexedDB**.
5. **Re-generation cost on unlock**: should unlocking auto-trigger image regen for affected scenes, or just mark them stale? Defaulting to **mark stale, user triggers regen**.
6. **AI rewrite undo window**: 8 seconds of undo banner. Confirm or extend?
7. **Bracket-name collision**: two characters named "Joe" — bracket parser can't disambiguate. Either prevent name collision at lock time, or use IDs in brackets (`[char_2]`) which is uglier. Defaulting to **prevent collision at lock**.

---

## 15. Out of Scope / Future

- Voice/motion metadata per character (R10, deferred to v2)
- Cross-project character library (referenced via `libraryId` field — schema-ready, not implemented)
- Sharing characters between users / collaborative editing
- Style transfer per-scene (overriding project style for a single scene)
- AI continuity check (flag scenes where character appearance drifts)
- Script view (Fountain-style text editor for storyboards) — separate feature
- Per-cluster character-presence rails — covered by `canvas-movie-mode-plan.md`

---

## Appendix A — Existing Code References

| Hook | Path | Purpose |
|---|---|---|
| `buildScenePromptWithRefs` | `js/17b-create-references.js:257` | Builds prompt with refs — keeps signature, accepts new data |
| `getSceneRefImageParts` | `js/17b-create-references.js:286` | Maps refCharacters to image parts — keeps signature |
| `generateImageGeminiFlash` | `js/17a-create-api.js` | Image generation wrapper |
| `generateImageImagen` | `js/17a-create-api.js` | Imagen fallback wrapper |
| Storyboard prompt — segment path | `js/17c-create-pipeline.js:1046` | Where character preamble injects |
| Storyboard prompt — chapter path | `js/17c-create-pipeline.js:1126` | Where character preamble injects |
| Storyboard prompt — podcast path | `js/17c-create-pipeline.js:1667` | Where character preamble injects |
| Storyboard render | `js/17c-create-pipeline.js:1818, :2000` | Where chip strip mounts |
| `autoSaveCreateState` | `js/17c-create-pipeline.js:893` | Where new fields persist |
| `runImageGeneration` | `js/17c-create-pipeline.js` (search) | Where dirty-flag gate lives |
| `g.characterFilter` | `js/29-canvas-render.js` (new field) | Filter state |
| `updateImgNode` etc. | `js/29-canvas-render.js` | Where dim class applies |
| `redrawCurves` | `js/29-canvas-render.js` | Where curve dim applies |
| `panToColumn` | `js/29-canvas-render.js` | Used by edit-modal scene links |
