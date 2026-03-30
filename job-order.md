# Plan: Job Queue for Reel Creator (Segments + Variations)

## Context

The current reel creator uses shared global state (`reelAudioBuffer`, `reelScenes`, `reelWords`, etc.) for all segments and variations. This causes cascading bugs when multiple audio inputs are used. The marketing pipeline (`marketing-pipeline/index.html`) already has a proven job queue pattern where each content piece is an independent job object.

This plan adopts that pattern: "Add Segment" creates a fully independent job (own audio, transcription, images). "Add Variation" creates a lightweight job that reuses images from its parent but generates new TTS + translated subtitles. Jobs run sequentially.

## What Changes vs What Stays

**UNCHANGED:**
- `reelGenerateSceneImage()` — untouched, used for single scene regen within a job
- `reelRunImageGeneration()` — untouched, called per job
- `generateGridImage()`, `cropGridCells()`, `browserUpscale()` — untouched
- `drawReelSceneFrame()` — untouched
- `renderAllReelPreviews()` — untouched (reads from `window._reelMultiResults`)
- `exportSingleReel()` — untouched
- `renderReelSubtitle()` — untouched
- All CSS, HTML structure — untouched
- `index.html` — untouched
- All other JS files — untouched

**CHANGED (only `js/20-reels-creator.js`):**
- New `reelJobs[]` array and job lifecycle functions
- "Add Segment" handler → creates a new job
- "Add Variation" handler → creates a lightweight job linked to parent
- "Generate Reel" → runs all pending jobs sequentially
- Section 3.5 and 4 render from `reelJobs` instead of globals
- `reelBuildVariationsAndPreview()` simplified — no more variation expansion loop

## Job Object Structure

```javascript
{
  id: number,
  status: 'pending' | 'transcribing' | 'generating-images' | 'done' | 'error',
  type: 'segment' | 'variation',
  parentId: null | number,         // for variations: id of parent segment job

  // Input
  audioBuffer: AudioBuffer,
  audioName: string,
  segStart: number,                // start time in original audio
  segEnd: number,                  // end time in original audio

  // Settings (copied from presets at job creation time)
  platform: string,
  style: string,
  transition: string,
  subtitleStyle: string,
  subColor: string,
  subOutline: string,
  subBackdrop: string,
  subSize: number,
  subPosition: string,

  // Variation settings
  audioLang: 'original' | langCode,
  subtitleLang: 'original' | langCode,

  // Generated (filled by pipeline)
  scenes: [],                      // [{startTime, endTime, prompt, imgDataUrl, ...}]
  words: [],                       // [{word, start, end}]
  error: null,
}
```

## Flow

### Add Segment
1. User selects region in waveform, clicks "Add Segment"
2. Creates new job: `{ type: 'segment', audioBuffer: extractRegion(...), status: 'pending', ...presetValues }`
3. Job card appears in section 3 showing segment info

### Add Variation
1. User clicks "Add Variation" on a specific segment job
2. Creates new job: `{ type: 'variation', parentId: thatSegmentJob.id, audioLang: 'en', subtitleLang: 'ta', status: 'pending' }`
3. Variation job card appears nested under its parent segment
4. Each segment can have multiple variations (e.g., Segment 1 → English+Tamil, English+Hindi, Tamil+Tamil)
5. "Add Variation" button appears on each segment card — clicking it adds a variation to THAT segment

### Generate Reel
1. Clicks "Generate Reel"
2. Runs each pending segment job sequentially:
   - Transcribe audio → `job.words`, `job.scenes`
   - Generate images (grid) → `job.scenes[].imgDataUrl`
   - Update job status to 'done'
3. Then runs each pending variation job:
   - Copy `scenes` (with images) from parent job
   - Translate subtitles → `job.words`
   - Generate TTS if audio language differs → `job.audioBuffer`
   - Update job status to 'done'
4. Build `window._reelMultiResults` from all done jobs
5. Show sections 3.5 and 4

### Preview (seamless integration — zero changes to rendering code)
- Each done job becomes one entry in `_reelMultiResults` with the EXACT same object shape
- `renderAllReelPreviews()` renders all — works as-is, no modifications
- Per-reel controls (transition, duration, motion, subtitle style, color, outline, backdrop, size, position) work as-is
- Per-reel playback (play, pause, stop, seek, resume from seek) works as-is
- Per-reel export button works as-is
- Section 3.5 scene cards (regenerate, download, reference image, multi-select) work as-is
- The job queue only changes HOW `_reelMultiResults` gets populated — not how it's consumed

### Open in Editor (seamless — no changes to editor transfer code)
- `openReelInFullEditor()` reads from `reelAudioBuffer`, `reelScenes`, `reelWords` + `_reelMultiResults[activeReelPreview]`
- Before calling it, the job queue sets these globals from the selected job's data — same bridge pattern
- Per-reel "Export" button in section 4 → `exportSingleReel()` — works as-is
- "Open in Full Editor" at bottom → `openReelInFullEditor()` — works as-is
- Multi-reel editor tabs (`renderEditorReelTabs`) — works as-is since `_reelMultiResults` has all jobs

### Section 3.5 (scene cards — no changes to rendering)
- `renderReelSceneGrid(scenes)` takes a flat array of scenes with `segmentIndex` — works as-is
- For multi-segment: collect scenes from all done segment jobs, each with their `segmentIndex` set to `job.id`
- Scene cards grouped by reel (per-reel containers) — works as-is
- Regenerate, download, reference image, multi-select — all work as-is
- The only change: WHERE the scenes come from (from `reelJobs` instead of `reelPendingScenes`)

### Section 4 (preview — no changes to rendering)
- `renderAllReelPreviews()` reads `window._reelMultiResults` — works as-is
- Each job (segment + its variations) maps to one entry in `_reelMultiResults`
- Canvas, playback, seek, controls, export — all work as-is
- Job queue just feeds the same data structure these functions expect

## Implementation Steps

### Step 1: Add job state and helpers (~20 lines)

After existing globals (around line 77):

```javascript
let reelJobs = [];
let nextReelJobId = 1;

function createReelJob(overrides) {
  return {
    id: nextReelJobId++,
    status: 'pending',
    type: 'segment',
    parentId: null,
    audioBuffer: null,
    audioName: '',
    segStart: 0, segEnd: 0,
    platform: reelPlatform,
    style: reelStyleEl ? reelStyleEl.value : 'cinematic',
    transition: reelTransition,
    subtitleStyle: reelSubtitleStyle,
    subColor: reelSubColor, subOutline: reelSubOutline,
    subBackdrop: reelSubBackdrop, subSize: reelSubSize, subPosition: reelSubPosition,
    audioLang: 'original',
    subtitleLang: 'original',
    scenes: [],
    words: [],
    error: null,
    ...overrides,
  };
}
```

### Step 2: Modify "Add Segment" handler (~5 lines changed)

Current: pushes to `reelSegments[]`
New: creates a job and pushes to `reelJobs[]`

```javascript
if (btnAddAudioSeg) btnAddAudioSeg.addEventListener('click', () => {
  if (!reelAudioRegion || !reelAudioBuffer) return;
  const start = reelAudioRegion.start;
  const end = reelAudioRegion.end;
  if (end - start < 1) return;
  if (reelAudioWavesurfer) reelAudioWavesurfer.pause();
  reelOriginalAudioBuffer = reelAudioBuffer;
  const segAudio = extractRegion(reelOriginalAudioBuffer, start, end);
  reelJobs.push(createReelJob({ audioBuffer: segAudio, segStart: start, segEnd: end }));
  renderReelJobCards();
  showReelPresets();
});
```

### Step 3: Modify "Add Variation" handler (~10 lines changed)

Each segment card has its own "+ Variation" button that creates a variation job linked to THAT segment:

```javascript
varBtn.addEventListener('click', () => {
  reelJobs.push(createReelJob({
    type: 'variation',
    parentId: segmentJob.id,
    audioBuffer: segmentJob.audioBuffer,
    audioLang: 'original',
    subtitleLang: 'original',
  }));
  renderReelJobCards();
});
```

Each segment can have unlimited variations. Variations are rendered nested under their parent segment card.

### Step 4: Add `renderReelJobCards()` function (~30 lines)

Renders job cards in section 3 presets area. Each card shows:
- Segment: audio range, status badge, remove button, "+ Add Variation" button
- Variation (nested): parent reference, language selectors, remove button

### Step 5: Modify "Generate Reel" handler (~40 lines changed)

```javascript
// Run segment jobs first
for (const job of reelJobs.filter(j => j.type === 'segment' && j.status === 'pending')) {
  job.status = 'transcribing';
  renderReelJobCards();
  // Transcribe → job.words, job.scenes
  // Generate images → job.scenes[].imgDataUrl
  job.status = 'done';
  renderReelJobCards();
}

// Run variation jobs
for (const job of reelJobs.filter(j => j.type === 'variation' && j.status === 'pending')) {
  const parent = reelJobs.find(j => j.id === job.parentId);
  if (!parent || parent.status !== 'done') continue;
  job.scenes = parent.scenes.map(s => ({ ...s }));
  // Translate subtitles if needed
  // Generate TTS if needed
  job.status = 'done';
  renderReelJobCards();
}

// Build _reelMultiResults from all done jobs
window._reelMultiResults = reelJobs.filter(j => j.status === 'done').map(j => ({
  audioBuffer: j.audioBuffer,
  scenes: j.scenes,
  words: j.words,
  settings: { subtitleStyle: j.subtitleStyle, transition: j.transition, ... },
  audioLangLabel: REEL_LANG_OPTIONS[j.audioLang],
  subtitleLangLabel: REEL_LANG_OPTIONS[j.subtitleLang],
  segmentIndex: j.id,
}));
```

### Step 6: Update save/load (~10 lines changed)

Save: serialize `reelJobs` instead of `reelSegments` + `reelVariationRows` + `multiResults`
Load: deserialize back to `reelJobs`, rebuild `_reelMultiResults`

## What Gets Removed

- `reelSegments[]` — replaced by `reelJobs.filter(j => j.type === 'segment')`
- `reelVariationRows[]` — replaced by `reelJobs.filter(j => j.type === 'variation')`
- `reelPerSegmentVariations{}` — no longer needed
- `window._reelMultiSegResults` — no longer needed
- `reelBuildVariationsAndPreview()` — replaced by direct job iteration in Generate handler
- `renderVariationRows()` — replaced by `renderReelJobCards()`
- `renderReelPresetSegments()` — replaced by `renderReelJobCards()`

## Files Modified

| File | Change |
|------|--------|
| `js/20-reels-creator.js` | Add job state, modify segment/variation/generate handlers, add renderReelJobCards |

**Only 1 file modified. No other files touched.**

## Implementation Rules (STRICT)

1. Only 1 file is touched: `js/20-reels-creator.js`
2. NO changes to ANY other file.
3. DO NOT edit, delete, or modify any function not listed in "What Gets Removed."
4. Functions listed below must remain BYTE-IDENTICAL:
   - `reelGenerateSceneImage()`, `reelRunImageGeneration()`, `reelRegenerateScene()`, `reelRegenerateSelected()`
   - `drawReelSceneFrame()`, `reelUpscaleAndCrop()`
   - `renderAllReelPreviews()`, `buildControlsHtml()`, `exportSingleReel()`, `openReelInFullEditor()`
   - `renderReelSceneGrid()`, `reelUpdateSceneCardImage()`, `reelUpdateSceneCardStatus()`
   - `renderReelFrame()`, `renderReelScenes()`, `selectReelPreview()`, `saveActiveReelSettings()`
   - `renderEditorReelTabs()`, all playback event handlers
5. No cleanup, refactoring, renaming, or lint fixes to untouched code.
6. Output format for `window._reelMultiResults` must remain identical.
7. Test after EACH step. If anything breaks, revert and find different approach.

## Verification Checklist

- [ ] Single audio → add segment → generate → grid images + preview works
- [ ] Two audios → add segment each → generate → both reels independent
- [ ] Add 2 variations to segment 1 (Tamil sub, Hindi sub) → generate → both reuse segment 1's images
- [ ] Add 1 variation to segment 2 → generate → reuses segment 2's images, not segment 1's
- [ ] Single scene regenerate still works
- [ ] Multi-select regenerate still works
- [ ] Preview playback: transitions, motion, subtitles all work
- [ ] Seek works
- [ ] Export works
- [ ] Save → all jobs serialized
- [ ] Load → all jobs restored, sections populated
