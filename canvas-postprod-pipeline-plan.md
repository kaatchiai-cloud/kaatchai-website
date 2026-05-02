# Canvas Post-Production Pipeline — extension plan

**Status:** Specification, not yet implemented
**Scope:** Pull BGM, audio, and subtitle steps INTO the canvas as job-level nodes after the per-section video/image columns
**Out of scope (v1):** Marketing pipeline, Photo Pilot
**Last revised:** 2026-05-01

This document corrects the previous flawed model (separate Language and Subtitle nodes for both modes) by aligning to the existing data model.

---

## Ground truth from existing code

### Animated mode — language is upfront, locked, single

- [`js/17c-create-pipeline.js:307-309`](js/17c-create-pipeline.js#L307) — language row is shown UPFRONT in the storyboard step (`langRow.style.display = '' if createVideoMode === 'animated'`)
- [`js/17c-create-pipeline.js:1191`](js/17c-create-pipeline.js#L1191) — translate + TTS happens **before** image generation, using `createOutputLanguage` selected upfront. Once chosen, the single output audio is baked
- [`js/17c-create-pipeline.js:1277`](js/17c-create-pipeline.js#L1277) — subtitles in animated are generated as part of the same upfront pipeline against `createSubtitleLanguage`
- [`js/17c-create-pipeline.js:859`](js/17c-create-pipeline.js#L859) — comment confirms it: `// Multi-Language — illustrated only (animated uses upfront language selection)`
- [`js/17c-create-pipeline.js:860`](js/17c-create-pipeline.js#L860) — `showStep('create-language-step', hasBgm && createVideoMode !== 'animated')` — the post-BGM multi-language step is **never** shown in animated mode

### Illustrated mode — language + subtitle added post-BGM, multiple tracks, bundled

- [`js/17d-create-languages.js:33`](js/17d-create-languages.js#L33) — `let languageTracks = [];` array of `{lang, langCode, audioBuffer, translatedText, voiceName, subtitleLang, status}` — each track binds its own subtitle setting
- [`js/17d-create-languages.js:518, 540`](js/17d-create-languages.js#L518) — pushing new tracks per language with their `subtitleLang` already attached
- [`js/17d-create-languages.js:746`](js/17d-create-languages.js#L746) — handoff to editor: `editorLanguageTracks = languageTracks.filter(t => t.status === 'done').map(t => ({..., subtitleLang: t.subtitleLang, subtitleTexts: ..., ...}))`
- [`js/15-project.js:625-641`](js/15-project.js#L625) — save/load preserves per-track subtitle data
- The post-gen language step ([`js/17c-create-pipeline.js:860`](js/17c-create-pipeline.js#L860)) only fires when `createVideoMode !== 'animated'`

**Conclusion: language and subtitle are not two separate things in illustrated mode — each language track carries its own subtitle setting.** They are persistently bundled in `languageTracks[]`.

### Confirmed user statement

| | Animated | Illustrated |
|---|---|---|
| Audio tracks | exactly 1 (locked at storyboard time) | unlimited, added post-image+BGM |
| Subtitle tracks | unlimited, can be added later | bundled with each language track |
| Add language later? | **No** — the audio is baked into video before image gen | Yes |
| Add subtitles later? | Yes — they're an overlay, not baked | Yes |

---

## Canvas extension shape

### Animated — two job-level post-prod nodes

```
[SB]──[Img]──[Vid]─┐
[SB]──[Img]──[Vid]─┼──→ [🎵 BGM] ──→ [💬 Subtitles] ──→ [🎞 Final]
[SB]──[Img]──[Vid]─┘                       ↑
                              (multi-track, post-render editable;
                               audio is read-only chip showing
                               the upfront-selected language)
```

- **🎵 BGM node** — Lyria 3 / library / skip
- **💬 Subtitles node** — list of subtitle tracks. Each row = one language. 3-state per row: `Off / On (translated) / On (transliterated)`. "+ Add subtitle" adds a new language. Single shared audio chip displayed at top of node, **read-only** (e.g. "Audio: Tamil — locked").
- **No Language node** — the language was decided upfront and cannot be re-added without regenerating the entire video.

### Illustrated — one combined node + BGM

```
[SB]──[Img]──┬──→ [🎵 BGM] ──→ [🎙 Audio + Subtitles] ──→ [🎞 Final]
[SB]──[Img]──┤                       ↑
[SB]──[Img]──┘            (multi-row: each row =
                            one language with its
                            voice + subtitle setting)
```

- **🎵 BGM** — same as animated
- **🎙 Audio + Subtitles node** — the combined node that mirrors the existing `languageTracks[]` shape. Each row:
  - Language picker
  - Voice picker (`Kore` etc.)
  - Subtitle: `Off / On (translated) / On (transliterated)`
  - 🔄 regenerate, status badge (⏳ Translating / ⏳ TTS / ✓ Ready)
  - 🗑 delete row
  - "+ Add language" appends a new row
- The "Original Audio" track is implicit row 0 (read-only). Additional language rows get their own audio + subtitle.

This matches the existing data model exactly — no schema invention.

---

## New node specs (detailed)

### 🎵 BGM node (both modes)

**Body controls:**
- "🎼 Compose with Lyria" button — calls existing `runCreateBgm()`
- "📚 Browse library" button — opens existing library picker
- Mini waveform + ▶ ⏸ + volume slider (reuse `#create-bgm-faux-wave` styling)
- Status badge: ⏳ Composing… / ✓ Ready / ✗ Failed
- "Skip BGM" link (small, secondary)

**Wires to:** existing `createBgmUrl`, `bgmVolume`, `bgmLoop` globals + `runCreateBgm()`.

**Gate (input):** ≥1 🎯 video has `status === 'done'` (animated) or ≥1 🎯 image done (illustrated).

**Gate (output → next):** `createBgmUrl !== null` OR user clicked Skip.

### 💬 Subtitles node (animated only)

**Body controls:**
- Top row: read-only audio chip — "Audio: ${createOutputLanguage} — locked"
- Subtitle tracks list — each row:
  - Language label (e.g. "Tamil")
  - 3-state chip: `Off / On (translated) / On (transliterated)` — corresponds to `createSubtitleSelections[langCode]`
  - 🔄 Regenerate this subtitle
  - 🗑 Remove
- "+ Add subtitle" button — opens language picker, appends new row
- "Apply" button — re-renders preview (or re-exports if final exists)

**Wires to:**
- `createSubtitleSelections` map
- `createGeneratedSubtitles` map (per-lang subtitle text + timings)
- `generateSubtitleTrack(langCode)` — needs extraction from current upfront pipeline (see Phase D below)

**Gate (input):** BGM gate passed.

**Gate (output):** always passes (subtitles optional). Final Render becomes enabled.

### 🎙 Audio + Subtitles node (illustrated only)

**Body controls:**
- Implicit row 0 — "Original Audio" (read-only label, subtitle dropdown still editable)
- Language rows (one per `languageTracks[]` entry beyond row 0):
  - Language picker dropdown (locked once translated)
  - Voice picker — uses `createVoiceSelections[langCode]`
  - Subtitle 3-state: `Off / On (translated) / On (transliterated)`
  - 🔄 Regenerate this track (re-runs translate + TTS)
  - 🗑 Delete (not for row 0)
  - Status badge per row: ⏳ Translating / ⏳ TTS / ✓ Ready
- "+ Add language" — appends a new row, opens language picker

**Wires to:** existing `languageTracks[]` array + `runTranslateTTS()` (or whatever the equivalent is).

**Gate (input):** BGM gate passed.

**Gate (output):** at least row 0 has subtitle resolved (i.e. user has not left every track in `pending`) OR Skip clicked. Trivially true if row 0 + original audio counts.

### 🎞 Final Render node (existing, slightly extended)

Unchanged buttons (📤 Export / ✏️ Editor). Now reads upstream BGM + audio/subtitle state via mirror fields.

---

## Linear gating with explicit "Skip"

Each new node carries one of three states: **Pending** (upstream gate not met), **Active** (ready, user can act), **Done/Skipped**. Visual treatment:

- Pending → 30% opacity, dashed border
- Active → full color, type-color glow
- Done → solid border, ✓ badge top-right
- Skipped → 50% opacity, "Skipped" badge

Skip is per-node and doesn't propagate — user can skip BGM but still set subtitles.

| Gate | Animated | Illustrated |
|---|---|---|
| `bgmEnabled` | ≥1 🎯 video done | ≥1 🎯 image done |
| `bgmReady` | `createBgmUrl !== null` OR skipped | same |
| `audioSubReady` | always true (audio locked, subs optional) | ≥1 language track in `done` state OR Skip |
| `renderEnabled` | `bgmReady && audioSubReady` | same |

The illustrated `audioSubReady` reads `languageTracks.filter(t => t.status === 'done').length > 0 || job.audioSubSkipped`.

Extend `CanvasState.validateGates` to return:

```js
{
  ok, sectionWarnings,
  launchEnabled, launchBlockers,
  bgmEnabled,    bgmBlockers,         // NEW
  audioSubEnabled, audioSubBlockers,  // NEW (animated: subtitles only; illustrated: audio+subs)
  renderEnabled, renderBlockers,      // requires bgm + audioSub gates passed-or-skipped
}
```

---

## Multi-preview implications differ by mode

This is where the two modes really diverge in the preview pane.

### Animated — multi-subtitle preview = same video + audio, different overlays

- One `<canvas>` per selected subtitle track
- **Single shared audio source** (the locked language) plays in one of them, others muted
- Synced timecode, all canvases redraw subtitle overlay at `currentTime`
- Useful for: "compare how this looks with English vs Tamil subtitles"

### Illustrated — multi-language preview = different audio + subtitle bundles

- One `<canvas>` per selected language track
- **Each preview has its own audio** but only one can play at a time → "Primary audio: A / B" toggle, others muted
- Each canvas overlays that track's subtitle (if enabled on that track)
- Useful for: "compare the English voice + English subs vs the Tamil voice + Tamil subs"
- More complex than animated — the audio selector is needed

### Caveat — keep it sane

Cap simultaneous previews at **2** in v1. The audio-toggle pattern works. 3+ would require muting more tracks and the comparison value drops anyway.

### Implementation

- Each preview is a `<canvas>` (not `<video>`) compositing the render-active video clip + the subtitle track for that language at the current time.
- Shared `currentTime` controlled by master seek bar; both canvases redraw on `requestAnimationFrame`.
- Reuse the existing subtitle renderer from `01-core.js` (`renderSubtitle` with `currentTime + words[]`).
- Use `requestVideoFrameCallback` on the source video for tight sync.
- ~10ms/frame budget for 2 canvases is achievable. Throttle to 24fps if 3+.

**This is a real new build** — current preview is single-video. Estimated ~150 lines in `29-canvas-render.js` for the dual-canvas compositor.

---

## What gets pulled into the canvas (DOM changes)

| Existing DOM | Canvas equivalent | Mode |
|---|---|---|
| `#create-launch-after-image` (BGM launch row) | 🎵 BGM node | both |
| `#create-bgm-step` (BGM player) | 🎵 BGM node body | both |
| `#create-launch-after-bgm` ("Launch Animation Agent →" — already vestigial) | n/a | hide |
| `#create-language-step` (post-BGM, illustrated only) | 🎙 Audio+Subtitles node | illustrated |
| (no analog) — animated subtitle re-edit | 💬 Subtitles node | animated |
| `#create-send-step` | 🎞 Final Render | both |

In animated, `create-language-step` was already hidden — no work there. In illustrated, hide it when canvas is mounted. All hidden DOM stays as legacy fallback.

---

## Hot-edit subtitles after final export

Same in both modes (subtitles are an overlay, not baked). The Subtitle/Audio+Sub node shows an "Apply" button that:
- For preview-only: triggers canvas dual-preview re-composite (instant)
- For exported video: re-runs `11-export.js` with new subtitle settings (slow but doesn't re-generate audio/video)

In illustrated mode adding a NEW language post-export means TTS + translation + re-export — also supported by existing pipeline (it's what the editor already does via the language switcher at [`js/17d-create-languages.js:746`](js/17d-create-languages.js#L746)).

---

## Photo timing recalculation when adding a new audio (illustrated only)

**Confirmed: the existing pipeline already handles this. No new math needed for canvas integration.**

When a new TTS audio track is added in illustrated mode, photo durations stretch/shrink within their parent scene proportionally to the translated word count. Verified locations:

### Existing logic (do NOT reimplement)

**1. Per-scene proportional re-scaling** ([`js/17d-create-languages.js:767-796`](js/17d-create-languages.js#L767))
- Allocates new audio duration to each scene proportional to `sceneTransWords[i] / totalTransWords`
- Per photo: `newScene.startTime + offsetInScene * newScene.duration`, `duration: p.duration * (newScene.duration / origSceneDur)`

**2. Soft TTS rate-match before scaling** ([`js/17d-create-languages.js:496-514`](js/17d-create-languages.js#L496))
- If new TTS is ≤15% slower/faster than original, audio is time-stretched via `OfflineAudioContext` to match original
- If `rate > 1.15`, no stretching (avoids voice distortion); photos then re-scale to the natural new length

**3. Subtitle timing scaled the same way** ([`js/17d-create-languages.js:798-810`](js/17d-create-languages.js#L798)) — subtitles ride the new per-scene timeline

**4. Live application on language switch** ([`js/17d-create-languages.js:969-974`](js/17d-create-languages.js#L969)) — editor's language switcher applies `track.photoTimings` to `photoItems`

**5. Persistence** ([`js/15-project.js:693`](js/15-project.js#L693), [`js/15-project.js:1244`](js/15-project.js#L1244)) — `photoTimings` and `subtitleTimings` saved per track

**6. Multi-language export** ([`js/11-export.js:307-308`](js/11-export.js#L307)) — each language exports with its own photo timeline

### Concrete example

Original English audio = 40s, scene 2 has 30 words. Tamil TTS = 50s, scene 2 has 35 words (out of 100 total Tamil words).
- scene 2 new duration = `35/100 * 50 = 17.5s` (vs original 12s)
- a photo originally 4s long inside scene 2 stretches to `4 * (17.5 / 12) = 5.83s`

### Canvas integration implications

- **Audio+Subtitles node "Add language" button** → calls existing `runTranslateTTS` → `languageTracks.push(...)` → at editor handoff the existing photo-timing scaler runs. **Zero new code needed for the timing math.**
- **Canvas dual-preview pane** must read the SELECTED preview track's `photoTimings` to render the right photo at the right time (not the original timings). Important: the dual-preview canvas compositor MUST switch source per track, not just overlay subtitles.
- **Re-export with new language post-final** works for free — `11-export.js` already reads `track.photoTimings` per track.

### One refactor required (added to Phase I)

The existing photo-timing computation depends on editor `photoItems` being populated (it reads `photoItems.map(p => …)` at [`js/17d-create-languages.js:782`](js/17d-create-languages.js#L782)). In canvas-only flow, photoItems may not exist yet when user adds a language (user hasn't clicked Send to Editor yet).

**Fix:** extract the timing computation from the inline pipeline into a pure function:

```js
// New helper exported from 17d
function computePhotoTimings(scenes, track, originalSubtitles) {
  // Per-scene proportional allocation based on sceneTransWords / totalTransWords
  // Returns { photoTimings, subtitleTimings, sceneTimes }
  // Operates on synthetic photoItems built from scenes' render-active images,
  // so it works whether editor is open or canvas is hosting the workflow.
}
```

Then:
- The current inline call at [`js/17d-create-languages.js:782-810`](js/17d-create-languages.js#L782) becomes a thin wrapper that builds photoItems-shaped input and calls `computePhotoTimings`.
- The canvas Audio+Subtitles node calls `computePhotoTimings` directly when a new language row finishes TTS, populating `track.photoTimings` immediately so dual-preview is accurate even before any editor handoff.
- Behaviour is identical for the editor-handoff path (no regression).

**Animated mode is unaffected** — only one audio track, no language additions, no photo-timing recalc needed.

---

## Loose ends specific to this corrected model

1. **Animated subtitle re-add**: needs the existing transcribed-text + translation pipeline to be callable post-export. Currently subtitles are generated at [`js/17c-create-pipeline.js:1277`](js/17c-create-pipeline.js#L1277) inside `runFullCreatePipeline` — needs extraction into a reusable function `generateSubtitleTrack(langCode)` that can be called by the canvas Subtitle node.

2. **Illustrated row 0 (Original Audio)**: cannot be deleted, cannot have its language changed. Subtitle on it CAN be toggled (transcribe in source language).

3. **Persisting Subtitle/Lang node state**: piggyback on existing `editorLanguageTracks` save in [`js/15-project.js:625-641`](js/15-project.js#L625). No schema change needed for tracks. Add `job.bgmSkipped` / `job.audioSubSkipped` flags only.

4. **Animated audio chip**: read-only display in the Subtitle node showing the upfront-selected language. Click → tooltip "Audio language is locked in animated mode. To change, restart the project."

5. **Cross-mode loaded project**: if a project was saved in animated mode then loaded as illustrated (mode switch is impossible currently but theoretically), the single audio track becomes row 0 of the Audio+Sub node.

6. **Storage/perf**: dual-canvas preview compositing — same constraint as before (~10ms/frame for 2 canvases). Add `requestVideoFrameCallback` for source video sync.

7. **BGM step-state legacy code**: `updateStepStates()` in `17c` decides which DOM step is visible. Add a guard: if canvas is mounted, skip step-state visibility logic for BGM/lang/send steps. Otherwise legacy + canvas fight over visibility.

8. **Autopilot path**: currently Autopilot runs BGM/Lang/Sub automatically before showing the result. If user opens canvas afterward, the BGM/Audio+Sub nodes show "✓ Done" already. Free.

9. **Skip-BGM in animated**: if user skips BGM, the exported video has no music. Still works — same as the existing flow where BGM is optional.

10. **Wider canvas**: graph width grows from ~1430 → ~2000px in animated, ~1700px in illustrated. `fitToView` already handles arbitrary bounds; no logic change. For long stories (15+ sections), suggest adding a "Compact pipeline" toolbar toggle in v2 that vertically stacks post-prod nodes.

---

## File-by-file scope

| File | Change | Lines |
|---|---|---|
| `js/27-canvas-state.js` | `job.bgm/audioSub` state; `validateGates` extension with mode-specific gates | ~60 |
| `js/29-canvas-render.js` | BGM node + mode-branched second node (animated: Subtitles only; illustrated: Audio+Subtitles); dual-preview compositor | ~350 |
| `js/15-project.js` | Persist `job.bgmSkipped` / `audioSubSkipped` flags | ~5 |
| `js/17c-create-pipeline.js` | Hide BGM/Lang DOM steps when canvas mounts | ~10 |
| `js/17d-create-languages.js` | Extract `generateSubtitleTrack(langCode)` and `computePhotoTimings(scenes, track, origSubs)` from inline pipeline so canvas can call them directly (no editor handoff required for accurate per-track preview) | ~50 |
| `css/canvas-graph.css` | Styles for BGM + Subtitles/Audio+Subs node + dual-preview grid | ~80 |
| `index.html` | Nothing (mount target exists) | 0 |

**Total: ~555 lines** — about the same envelope as Phase 3.

---

## Element-by-element coverage map

| Element | Action |
|---|---|
| 🎵 BGM node body | Wraps existing `runCreateBgm()` + library picker + Skip |
| 🎵 BGM curves in (animated) | One per 🎯 video (status=done) |
| 🎵 BGM curves in (illustrated) | One per 🎯 image (status=done) |
| 🎵 BGM curve out | Single curve to next post-prod node |
| 💬 Subtitles node (animated) | New canvas-only UI; multi-track list backed by `createSubtitleSelections` + `createGeneratedSubtitles` |
| 💬 Audio chip (animated) | Read-only label showing locked `createOutputLanguage` |
| 🎙 Audio+Subs node (illustrated) | Multi-row UI backed by `languageTracks[]` |
| 🎙 Row 0 (illustrated) | Original audio, undeletable, subtitle togglable |
| 🎙 Add language row | New row → translate + TTS → push to `languageTracks` |
| 🎙 Voice picker | Reads/writes `createVoiceSelections[langCode]` |
| 🎙 Regenerate row | Re-runs translate + TTS for that row |
| 🎞 Final Render | Existing, gate now requires bgm+audioSub ready |
| Final Export | Existing pipeline; reads mirror fields + selected subtitle settings |
| Final Editor | Existing `sendCreateToEditor()`; `editorLanguageTracks` already populated by row state |
| Dual-preview pane (animated) | Two canvases, same video+audio, different subtitle overlays |
| Dual-preview pane (illustrated) | Two canvases, each its own audio+subtitle bundle, primary-audio toggle |
| Subtitle hot-edit | Apply button → re-composite preview OR re-export |
| Persistence | `job.bgmSkipped/audioSubSkipped` added to `createState` save |
| Step-state suppression | When canvas mounted, `updateStepStates` skips BGM/lang/send visibility logic |
| `validateGates` extension | Returns bgmEnabled/audioSubEnabled/renderEnabled with mode-specific blockers |
| Autopilot pre-run | Free — BGM/Lang already done when canvas opens |

---

## Implementation phases

1. **Phase G** — `CanvasState` schema + gates (job state, new gate fields). Tests: gate transitions on each step.
2. **Phase H** — `js/29-canvas-render.js` BGM node + curves + DOM hide of legacy BGM step.
3. **Phase I** — `js/17d-create-languages.js` extract two pure helpers:
   - `generateSubtitleTrack(langCode)` — wraps the inline subtitle gen at line 1277
   - `computePhotoTimings(scenes, track, origSubs)` — extracted from line 768-810; works on synthetic photoItems shape so canvas can call it before editor handoff
4. **Phase J** — Subtitles node (animated mode). Single-preview still in v1.
5. **Phase K** — Audio+Subtitles node (illustrated mode), with row 0 + add/regenerate/delete rows.
6. **Phase L** — Dual-preview compositor in right pane (both modes, mode-aware audio handling).
7. **Phase M** — Hot-edit subtitle re-export + post-export edit flow.
8. **Phase N** — Polish (Skip per node, status animations, persisted positions for new nodes).

Each phase mergeable independently. Suggest implementing G + H + I + J first (animated path) before tackling K (illustrated, which is more complex).

---

## Open questions

- Should the Subtitle node in animated mode also show the locked-audio language as row 0 with its own subtitle, or are subtitles always "additional languages" on top of the audio? Currently the existing pipeline does both — `createSubtitleLanguage` can match `createOutputLanguage` (subtitle matches audio language). Recommend showing audio's own language as the implicit row 0 with subtitle togglable.
- Should "Compose with Lyria" be the only BGM source, or also expose a "Generate from prompt" advanced mode? Current `runCreateBgm` does single-shot Lyria. Recommend: single button + library + skip in v1.
- Final preview pane vs editor preview — should canvas preview re-use the editor's render pipeline (`renderTimelineFrame` + `renderTextOverlays`) for fidelity? Yes — share the renderer so dual-preview matches what export produces.
