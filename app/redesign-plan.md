# Stori Mobile App — Redesign Plan

> Source: design discussions and HTML mockups (`home-mobile-mockup.html`, `reel-mobile-mockup.html`, `canvas-mobile-mockup.html`, `editor-mobile-mockup.html`).

---

## 1. Goals & Scope

**Primary goal**
Replace the current 9-step "Create Content" wizard with three focused entry points (PhotoPilot, AutoPilot, Brainstorm) and integrate Canvas + a mode-aware Editor, while keeping Record Podcast as-is. Add a universal Voice/Video Quick Capture that routes content to any pipeline. All inputs auto-save to a cloud project; long-form (Copilot) work nudges users to the desktop web app.

### In scope

- Home screen redesign (gradient wordmark, 3 entry cards, Brainstorm hero, Quick Capture, Recent Projects)
- AutoPilot (Reel page) — mode-locked accordion stepper (Illustrated 5 agents / Animated 6 agents)
- Canvas (mobile card/accordion UI replacing the web's node graph)
- Mode-aware Editor (Illustrated: Photos + Motion / Animated: Clips, no Motion)
- Brainstorm chat — multi-mode (social/tutorial/brand-product/film-narrative) with autopilot ↔ copilot routing
- PhotoPilot (photo → reel pipeline)
- Quick Capture (voice/camera → transcript → routing screen)
- Cloud tab (saved projects, Copilot desktop nudges)
- Aurora theme (deep navy bg + radial glows + violet primary + Poppins)
- Cloud auto-save abstraction (background for video, upfront for text/voice)

### Out of scope (this redesign)

- Record Podcast (kept as-is)
- Copilot execution on mobile (cloud save + desktop handoff only)
- Credits/billing (BYOK retained per project memory)
- Web app changes

---

## 2. Architecture & Data

| Area | Approach |
|---|---|
| **Project model** | Every entry point creates a cloud project on first input. Schema mirrors web's `CanvasState` (`storyboardInstances`, `imageInstances`, `videoInstances`, active flags 🎯 ⭐) |
| **Mode lock** | `videoMode: 'illustrated' \| 'animated'` set on Reel step 1, immutable after Launch Agents |
| **Routing wizard** | Reused for: Brainstorm completion + Quick Capture transcript → autopilot/copilot/desktop decision based on type + duration |
| **Audio retention** | Original audio + transcript both saved. AutoPilot uses audio as voiceover (skips TTS); Copilot saves both for desktop |
| **Credentials** | Single resolution abstraction; BYOK now, swap-ready for credits later |

---

## 3. Screen Inventory

| # | Screen | State | Pattern |
|---|---|---|---|
| 1 | Home | New | Gradient wordmark + 3 entry cards + Brainstorm hero + Quick Capture + Recent + bottom nav |
| 2 | Brainstorm Chat | New | Material chat, mode picker, completion → routing |
| 3 | Brainstorm Completion / Routing | New | Transcript card + 3 options (Reel / Cloud / Brainstorm) |
| 4 | AutoPilot Reel | Replace Create | Accordion: Mode → Input → Style → Scenes → (Animation) → BGM → Preview → Export |
| 5 | Canvas | New | Scene cards, 3 tabs (Storyboard/Images/Videos), bottom Reel/Editor/Export |
| 6 | Editor (mode-aware) | Refactor | Material AppBar + preview + tabs (Clips OR Photos / Transitions / Text / Subtitles / Audio / PiP / Lang) |
| 7 | PhotoPilot | New | Upload → AI segments → reel preview → export |
| 8 | Quick Capture (Voice/Camera) | New | Recording UI → transcribe → routing screen |
| 9 | Cloud / Saved Projects | New | List of cloud projects, "Open on desktop" nudges for Copilot |
| 10 | Profile / Settings | Existing | Keys, theme, account |

Mockups completed (HTML): Home, Reel, Canvas, Editor.

---

## 4. Phased Plan

### Phase 0 — Foundations (1 sprint)

- Aurora theme tokens in `core/theme/colors.dart` (violet `#8b5cf6` accent + aurora bg radials)
- Poppins font integration
- Shared widgets: `AuroraScaffold` (background gradients), `ModeIndicator`, `StoriAppBar`, `BottomActionBar`
- Cloud project model + auto-save service (text/voice upfront, video background)
- Routing wizard shared component (used by Brainstorm + Quick Capture)
- Delete `lib/screens/create/` (9-step wizard) — keep any referenced widgets that remain useful

### Phase 1 — Home + Quick Capture (1 sprint)

- Home screen with gradient wordmark, settings only at top-right
- 3 entry cards (PhotoPilot, AutoPilot, Record), Brainstorm hero, Quick Capture, Recent Projects
- Voice + Camera capture screens (record → upload → Whisper/Gemini transcribe)
- Routing overlay screen (3 options)
- Bottom nav with Cloud tab placeholder

### Phase 2 — AutoPilot Reel (2 sprints)

- Accordion stepper screen
- Step 1: Mode card with lock-after-launch
- Step 2: Input (Text / Audio / Video tabs) — accepts handoff from Brainstorm/Quick Capture
- Step 3: Style & Presets + Launch Agents
- Step 4: Scenes (Illustrated: image grid; Animated: image + video grids)
- Step 5: Animation Agent (Animated only — Kling/Veo3 progress)
- Steps 6–7/8: BGM, Preview, Export
- Live agent progress + retry/pause controls
- Pipeline summary chip strip below AppBar

### Phase 3 — Canvas (1 sprint)

- Scene cards (collapsible accordion)
- 3 tabs per card: Storyboard / Images / Videos
- Active flags (🎯 radio + ⭐ multi-select) with same invariants as web
- Add variation, regenerate, edit prompt actions
- Validation gates (`sectionWarnings`, `launchBlockers`)
- Bottom: Back to Reel / Send to Editor / Export

### Phase 4 — Mode-Aware Editor (2 sprints)

- Material AppBar with read-only mode pill
- Preview canvas + transport bar
- Tab bar (mode-aware: Clips OR Photos)
- Clips tab (Animated): video clip cards with source-image reference, Trim/Re-render
- Photos tab (Illustrated): photo strip with duration + Ken Burns (Motion tab adjacent)
- Transitions / Text / Subtitles / Audio / PiP / Language panes
- Fixed bottom Export Reel
- FFmpeg export pipeline

### Phase 5 — Brainstorm + Copilot Save (1 sprint)

- Brainstorm chat screen (4 modes: social / tutorial / brand-product / film-narrative)
- Wizard auto-classifies → AutoPilot vs Copilot
- Completion screen:
  - Copilot-bound → "saved, open on desktop"
  - AutoPilot film/product → 2-option screen (continue desktop / continue mobile)
- Copilot save format → cloud (audio + transcript + chat history + classification)

### Phase 6 — PhotoPilot (1 sprint)

- Photo picker (multi-select)
- AI scene segmentation (Gemini)
- Auto-storyboard + Ken Burns
- Same Preview/Export as AutoPilot Illustrated mode (reuses pipeline)

### Phase 7 — Cloud Tab + Polish (1 sprint)

- Cloud projects list (filtered by type: AutoPilot / Copilot / Brainstorm)
- "Open on desktop" badge + send-link action for Copilot projects
- Recent projects integration with home screen
- Push notifications (optional) for cloud handoffs
- Performance pass + error states + offline messaging

---

## 5. Engineering Risks & Decisions Needed

| Risk | Decision needed |
|---|---|
| Kling/Veo3 polling times (3+ min/clip) | Background isolate vs foreground polling? |
| FFmpeg on mobile for Animated mode export | iOS framework size + Android NDK build |
| Audio retention storage | Cloud bucket choice + retention policy |
| Routing classification accuracy | Heuristic vs Gemini-classified? |
| BYOK key storage | Secure storage adapter + per-key encryption |
| Cloud-to-desktop handoff | Project URL scheme + auth across web/mobile |

---

## 6. Suggested Total Effort

**~10 sprints (≈5 months)** with 2 mobile engineers + 1 backend engineer for cloud project APIs.

---

## 7. Reference Files

- Mockups: `home-mobile-mockup.html`, `reel-mobile-mockup.html`, `canvas-mobile-mockup.html`, `editor-mobile-mockup.html`
- Current Flutter app: `lib/`
- Existing wizard to delete: `lib/screens/create/`
- Web canvas state model (to mirror): `js/27-canvas-state.js`
- Web brainstorm wizard (to port routing logic): `js/26-brainstorm.js`
- Web AutoPilot reel pipeline (reference): `js/20-reels-creator.js`
