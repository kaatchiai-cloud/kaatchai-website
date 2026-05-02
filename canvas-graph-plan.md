# Canvas Graph Workflow — Implementation Plan

**Status:** Specification, awaiting Phase 1 build
**Owner:** Stori main pipeline (Copilot + Autopilot)
**Out of scope:** Marketing pipeline (separate project)
**Last revised:** 2026-04-30 (rev 2)

This is a ready-reckoner for implementing agents. Every requirement, gate, and edge case discussed during design is captured here. If anything in the user's actual intent contradicts this document, the user wins — update this file and proceed.

### Revision history
- **rev 1** — initial spec
- **rev 2** — corrected layout: Launch Video Agent and Final Render moved INSIDE the graph (Layer A, zoomable, draggable, vertically centered). Launch button is ephemeral — disappears on click, re-appears only for new ungenerated work. Two distinct stars per node: ⭐ "Use for video gen" (multi-select) and 🎯 "Use for render" (radio). Per-clip video preview happens inline at each video node; right pane shows only full-timeline preview. Style fingerprint is lazy (generated on first regen, not after first grid).

---

## 1. Goal

Replace the current scene-grid + video-grid screens of the **animated-video** flow in Copilot (and the equivalent post-generation editing flow in Autopilot) with a **node-graph canvas editor** that:

- Visualises each storyboard section as a horizontal swimlane band ordered top-to-bottom by `scene.startTime`
- Shows storyboard → image → video → final-render relationships as draggable nodes connected by Bezier curves
- Allows the user to add, edit, regenerate, and select multiple alternate **instances** at every layer (storyboard, image, video) without losing other instances
- Enforces visual consistency between newly regenerated images and previously generated images via reference-image injection
- Persists the entire graph (positions, instances, active flags) to the project file and reconstructs it on load
- Exports / sends-to-editor reading only the user-marked active video instance per section (animated mode never exports still images)

## 2. Non-goals (out of scope for v1)

- Manual edge drawing (curves are auto-derived from data relationships only)
- Multi-user collaboration / real-time sync
- Mobile-first design (canvas is a desktop power-feature; mobile keeps the current grid)
- Replacing the canvas in **illustrated-only** mode (canvas is animated-mode only)
- Replacing the canvas in the **marketing pipeline**
- Undo/redo history (deferred to v2 — autosave on every meaningful action covers basic recovery)
- Touch gestures beyond click/drag (deferred to v2)

## 3. Scope summary

| Surface | Behavior |
|---|---|
| **Copilot animated-video flow** | After image generation completes, current `create-video-step` UI is replaced by canvas. Canvas IS the workspace until export / send-to-editor. |
| **Autopilot animated-video flow** | After full generation completes, simple result grid is shown (current behavior preserved). A new button **"Open in canvas to fine-tune"** launches the canvas, sharing the same component. |
| **Copilot illustrated-only** | Unchanged — current scene grid stays. |
| **Autopilot illustrated-only** | Unchanged. |
| **Marketing pipeline** | Untouched. |

---

## 4. Visual design

### 4.1 Layout philosophy

**Fluid, not rigid.** Soft visual cues create order without locking node positions:

- **Horizontal swimlane bands** — one per storyboard section, full graph-area width, alternating subtle background tints `rgba(255,255,255,0.02)` / `rgba(255,255,255,0.04)`. Each band carries a sticky left-side label `Section N · 0:00–0:08`.
- **Color-tinted node borders** carry node-type identity:
  - Storyboard: `#a78bfa` (purple)
  - Image: `#22d3ee` (cyan)
  - Video: `#f59e0b` (amber)
  - Continuation: `#2dd4bf` (teal)
  - Final render: `#10b981` (emerald)
  - Launch Video Agent: `#ef4444` (rose, prominent)
- **Bezier curves** carry directional flow — left edge = input, right edge = output, regardless of node x/y.
- **Soft auto-layout** — new nodes appear at suggested positions; user can drag freely afterwards. No snapping.
- **🧹 Tidy button** — re-runs auto-layout, animates nodes to suggested positions over 400ms.

### 4.1.1 Two-layer rendering (CRITICAL — zoom isolation)

The canvas has two independent rendering layers:

**Layer A — Node graph (zoomable):**
- Storyboard, Image, Video, Continuation nodes
- Launch Video Agent node (when visible)
- Final Render node (with Export / Send to Editor buttons)
- All Bezier curves between any of the above
- Section band backgrounds + labels
- Wrapped in a single `<div id="canvas-graph-layer">` with `transform: scale(zoom) translate(panX, panY)` applied
- Pan + zoom both apply here

**Layer B — Chrome (NOT zoomable, viewport-fixed):**
- Toolbar (top-right): 🧹 Tidy, zoom −/+, zoom %, Fit
- Right pane (~280px wide): properties pane (node-specific editable fields) and full-timeline preview pane
- Bottom pane (~60px tall): job-level chips (title, scene count, duration, style, BGM, cost, ETA, autosave indicator)
- Constant size regardless of zoom level

This isolation means:
1. Launch Video Agent and Final Render zoom and pan with the graph — they're full graph citizens, draggable, with auto-position-on-Tidy behavior
2. Toolbar, properties pane, and bottom chips don't move when user zooms
3. Width is bounded — chrome occupies fixed columns/strips, graph fills the rest

### 4.1.2 Launch Video Agent — placement and lifecycle

**Position:** inside the graph (Layer A), to the right of all image nodes, **vertically centered** against the full graph content height (sum of all section bands). Auto-positioned on first appearance and on Tidy. User can drag it anywhere; position persists per `job.launchAgentPosition: {x, y}`.

**Visibility lifecycle:**

| Stage | Launch button visible? | Reason |
|---|---|---|
| Before any image is generated | NO | Nothing to animate yet |
| At least one section has an active image instance | YES | Gate logic enables it; button glows when all gates pass |
| User clicks Launch → placeholders spawn for each video | **NO** (button disappears) | Triggered, no longer needed |
| After video gen completes | NO | Button stays gone permanently for this generation cycle |
| User adds a NEW active image after first launch (post-gen edits) | YES (re-appears) | New active image without a video → button returns until that one is animated |
| User regenerates an existing video instance | NO | Single-instance regen uses node-level button, not Launch agent |

So the button is a **stateful trigger that disappears once it's been used and reappears only when there's new ungenerated work** (new active image with no corresponding video instance).

**Disabled state** with tooltip when any gate fails:
- "Section N has multiple active storyboards — pick one"
- "Section N has no active image instance — star at least one image"
- "All sections must have at least one active storyboard"

When gates pass, button glows. Click → confirm `"Generate N videos? (one per active image across all sections)"` → triggers `animateScenes()` over each `(scene, activeImage)` pair, creating one video instance per pair. Button disappears immediately on click; placeholder video nodes spawn in its place (rightward of each source image).

### 4.1.3 Final Render — placement and lifecycle

**Position:** inside the graph (Layer A), to the right of all video nodes, **vertically centered** against full graph content height. Auto-positioned on first appearance and on Tidy. User can drag it anywhere; position persists per `job.finalRenderPosition: {x, y}`.

**Visibility:** always visible once at least one video instance exists. Stays in place permanently. Curves run from each section's render-active video instance into Final Render.

**Contents:**
- Two buttons: **📤 Export** and **✏️ Send to Editor**
- Disabled with tooltip when any gate fails:
  - "Section N has no video — generate one first"
  - "Section N has multiple videos — pick one with the star"
- Click Export → triggers existing export pipeline (`11-export.js`) reading mirror fields
- Click Send to Editor → handoff to editor reading mirror fields
- Animated mode: only video clips exported; image-only sections without video block export

### 4.1.4 Curve flow (graph-internal, no cross-layer math)

Because Launch Video Agent and Final Render live inside Layer A, all curves are simple in-graph Bezier curves — no chrome-overlay pull-lines, no cross-layer math. Three relationship sets:

1. **Pre-launch:** every active image instance has a curve flowing right into Launch Video Agent.
2. **During / post-launch:** Launch button disappears. Each placeholder/loaded video node gets a curve from its **source image** (the `sourceImageInstanceId` it was spawned from).
3. **Post-video:** every render-active video instance has a curve flowing right into Final Render.

All curves zoom and pan with the graph automatically.

### 4.1.5 Layout zones

```
┌──────────────────────────────────────────────────────────┬──────────────────┐
│  Toolbar: 🧹 Tidy  | Zoom −  100%  +  | Fit  (chrome)    │  Properties pane │
├──────────────────────────────────────────────────────────┤  (chrome,        │
│                                                          │   node-specific) │
│   GRAPH LAYER (Layer A — zoomable + pannable)            │                  │
│                                                          │   ─────          │
│   Section 1 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░             │                  │
│   [SB]──[Img ⭐]──[Vid 🎯]─┐                              │  Full-timeline   │
│                            │                              │  preview pane    │
│   Section 2 ░░░░░░░░░░░░░░░│░░░░░░░░░░░░░░░             │  (chrome,        │
│   [SB]──[Img ⭐]──[Vid 🎯]─┼─┐                            │   toggleable)    │
│                            │ │                            │                  │
│   Section 3 ░░░░░░░░░░░░░░░│░│░░░░░░░░░░░░░             │                  │
│   [SB]──[Img ⭐]──[Vid 🎯]─┘ │                            │                  │
│                              │  ┌────────┐                │                  │
│                              ├─▶│ 📤 Final│              │                  │
│                              │  │ Render │               │                  │
│                              │  │────────│               │                  │
│                              │  │ Export │               │                  │
│                              │  │ Editor │               │                  │
│                              │  └────────┘               │                  │
│                                                           │                  │
│   (Launch Video Agent: shown here when active images      │                  │
│    exist with no video yet; disappears after click)       │                  │
│                                                           │                  │
├──────────────────────────────────────────────────────────┼──────────────────┤
│  Bottom pane: Job · 12 scenes · 1m 30s · style · BGM · cost · ETA          │
└──────────────────────────────────────────────────────────────────────────────┘
   Layer A (zoomable, contains all nodes incl. Launch + Final)
                                                ↑                ↑
                                                chrome boundary  Layer B chrome
```

Width math: chrome right column = 280px fixed; chrome bottom strip = 60px fixed. Graph layer fills viewport minus those strips.

### 4.1.6 What scales with zoom

| Element | Layer | Scales with zoom? |
|---|---|---|
| Storyboard / Image / Video / Continuation nodes | A | YES |
| Launch Video Agent button (when visible) | A | YES |
| Final Render node + Export / Send buttons | A | YES |
| Bezier curves between any nodes | A | YES |
| Section band backgrounds + labels | A | YES |
| Properties pane | B | NO |
| Full-timeline preview pane | B | NO |
| Bottom job-level chips | B | NO |
| Toolbar (Tidy, zoom controls) | B | NO |

### 4.2 Section bands (the only constraint)

A node belongs to exactly **one** section, determined by which horizontal band its **center** sits inside. Drop a node onto Section 2's band → it's reassigned to Section 2. Bands gently glow when a node hovers over them mid-drag. This is the **only** snap-like behavior; semantically meaningful, not visual.

Bands grow vertically with content — a section with 3 image instances and 2 video instances takes more vertical space than a section with 1 of each.

### 4.3 Auto-arrange rules (initial positions only)

When a node is created (or **🧹 Tidy** is clicked):

1. Sections sorted top-to-bottom by `startTime`.
2. Within a section band:
   - Storyboard instances stacked vertically, leftmost x.
   - Image instances stacked vertically, x = storyboard.right + 200px. Each image is connected to its parent storyboard.
   - Video instances stacked vertically, x = image.right + 200px. Each video is connected to its source image (`sourceImageInstanceId`).
   - Continuation clips chain rightward from their parent video, x = parent.right + 160px (smaller spacing because continuation nodes are smaller).
3. **Launch Video Agent** node — fixed sticky position, top-right canvas corner. Curves run from every active image instance into it.
4. **Final Render** node — fixed sticky position, bottom-right canvas corner. Curves run from every active video instance into it.

After initial arrangement, user may drag any node anywhere; positions persist per `node.canvasPosition = {x, y}`.

### 4.4 Color and motion semantics

| State | Border | Curve color | Effect |
|---|---|---|---|
| Pending | dashed grey-700 | grey | none |
| Generating | type-color, 2px solid | type-color, animated dashes | pulsing dot top-right |
| Polling Kling | amber 2px | amber, animated dashes | rotating spinner |
| Done | type-color, 1px solid | type-color, solid | none |
| Error | rose 2px | rose | shake on entry, retry button |
| Inactive (instance) | type-color, dimmed 40% | dimmed 40% | greyed thumbnail |
| Active (instance) | type-color + ⭐ glow | type-color, full opacity | ⭐ badge top-right |
| Section not finalized | section band background tinted rose 5% | n/a | warning chip on band label |

### 4.5 Pan / zoom / drag

- **Pan**: hold `Space + click-drag` OR middle-mouse-drag.
- **Zoom**: scroll wheel; clamp 0.25× – 2.0×; zooms toward cursor position.
- **Drag node**: click-drag a node by its header bar (not body), so clicks inside textareas etc. don't move it.
- **Marquee select**: shift+drag on empty canvas to select multiple nodes (deferred to v2 if too complex; v1 = click one node at a time).

### 4.6 Visual mock (reference)

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  Section 1 · 0:00–0:08
    [SB 1.A ⭐]──[Img 1.A.1 ⭐]──[Vid 1.A.1 ⭐]──[cont1]──[cont2]
                                                                          ╲
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╲░░
  Section 2 · 0:08–0:18                                                    ╲
    [SB 2.A ⭐]──[Img 2.A.1 ⭐]──[Vid 2.A.1]                                ╲
              ╲─[Img 2.A.2]    ╲─[Vid 2.A.2 ⭐]                            [Final
    [SB 2.B]                                                                Render]
                                                                            ▼
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  📤 Export
  Section 3 · 0:18–0:25                                                       ✏️ Editor
    [SB 3.A ⭐]──[Img 3.A.1 ⭐]──▶ [Launch Video Agent]
              ╲─[Img 3.A.2 ⭐]──╱     (top-right, sticky)
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

---

## 5. Data model

### 5.1 Schema (add to existing scene shape)

```js
// Existing flat scene fields (kept for back-compat; mirrored from active instance)
scene = {
  // … existing fields: id, startTime, endTime, duration, text, prompt, status …
  // Mirrored from active instances for backward consumers
  imgDataUrl,            // === storyboardInstances[active].imageInstances[active].imgDataUrl
  videoUrl,              // === videoInstances[active].clips[0].url
  videoClips,            // === videoInstances[active].clips

  // NEW — canvas graph state
  storyboardInstances: [
    {
      id,                              // stable id, "sb-<scene.id>-<n>"
      prompt,                          // editable; defaults to scene.prompt at creation
      refImageDataUrl,                 // optional per-instance reference
      isActive,                        // RADIO within section — exactly one true
      canvasPosition: { x, y },
      createdAt,
      imageInstances: [
        {
          id,                          // stable id, "img-<scene.id>-<n>"
          parentStoryboardId,
          style,                       // string preset; defaults to job.stylePreset (inherited)
          styleOverridden,             // bool — true only if user opened "advanced" toggle
          imgDataUrl,
          status,                      // 'pending' | 'generating' | 'done' | 'error'
          error,
          isActive,                    // MULTI-SELECT within section
          canvasPosition: { x, y },
          generationContext: {         // captured at gen time, for reproducibility
            siblingRefIds: [],         // image instance ids used as visual refs
            styleFingerprint,          // text descriptor (Option 3)
            modelUsed,                 // 'gemini-3-pro-image-preview' | 'gemini-2.5-flash-image' | …
          },
          createdAt,
        }
      ]
    }
  ],
  videoInstances: [
    {
      id,                              // "vid-<scene.id>-<n>"
      sourceImageInstanceId,           // id of the image instance used as i2v input
      motionPrompt,                    // editable; defaults to imageInstance.prompt + " Smooth cinematic motion…"
      duration,                        // editable; defaults to scene.duration
      clips: [{ url, clipDuration }],  // first clip + Kling continuation clips
      status,                          // 'pending' | 'submitted' | 'polling' | 'done' | 'error'
      error,
      taskId,                          // Kling task id (for resume)
      isActive,                        // RADIO within section — exactly one true
      canvasPosition: { x, y },
      createdAt,
    }
  ]
}
```

### 5.2 Node-position storage

Each node's `canvasPosition: { x, y }` lives on the instance itself (storyboard, image, video). The Launch Video Agent and Final Render nodes are **sticky** and don't carry position (always anchored to corners).

Continuation clips are **not separate nodes in the data model** — they're items inside `videoInstances[].clips`. The renderer draws them as visual children of their parent video node, positioned automatically rightward; their positions are not user-editable.

### 5.3 Active-flag invariants — TWO STAR LAYERS PER NODE

There are two separate selection concepts:

| Star | Meaning | Selection rule | Affects |
|---|---|---|---|
| ⭐ "Use for video gen" | Tells Launch Video Agent which images to animate | Multi-select per section (any number can be on) | Video generation only |
| 🎯 "Use for render" | Tells Final Render which instance to export | Radio per section (exactly one) | Export / send-to-editor only |

Saving the project saves ALL instances regardless of star state. Reopening reconstructs every instance on the canvas. Stars only gate downstream actions; they don't filter what's persisted.

**Layer-by-layer rules:**

1. **Storyboard:** exactly one `isActive: true` per section (radio, single-select). Active SB defines which prompt + reference image is canonical for the section. If user activates a sibling, previous auto-deactivates.

2. **Image — ⭐ "Use for video gen":** multi-select per section (any number, including zero). Active set tells Launch Video Agent which images to animate. Required for Launch gate: at least one ⭐ across active images of all sections.

3. **Image — 🎯 "Use for render"** (illustrated mode only): radio per section, exactly one. Required for Final Render gate in illustrated mode.

4. **Video — 🎯 "Use for render":** radio per section, exactly one. Required for Final Render gate in animated mode. If a section has multiple video instances, user must explicitly pick one before export enables.

In animated mode, the image 🎯 render-star is hidden (irrelevant — videos export, not images). In illustrated mode, the video layer doesn't exist, so only image 🎯 matters.

Violations either cannot occur (UI prevents) or are auto-corrected on load (renderer normalizes — picks first as active if multiple, or first existing if none).

### 5.4 Migration from old projects

When loading a project with the old flat shape (no `storyboardInstances`):

```js
function migrateScene(s) {
  if (s.storyboardInstances) return s; // already migrated
  const sbId = `sb-${s.id}-0`;
  const imgId = `img-${s.id}-0`;
  s.storyboardInstances = [{
    id: sbId,
    prompt: s.prompt,
    refImageDataUrl: s.refImageDataUrl,
    isActive: true,
    canvasPosition: null,                 // null = use auto-layout
    imageInstances: s.imgDataUrl ? [{
      id: imgId,
      parentStoryboardId: sbId,
      style: createStylePreset || '',
      styleOverridden: false,
      imgDataUrl: s.imgDataUrl,
      status: 'done',
      isActive: true,
      canvasPosition: null,
      generationContext: { siblingRefIds: [], styleFingerprint: null, modelUsed: 'unknown' },
    }] : [],
  }];
  s.videoInstances = (s.videoUrl || s.videoClips?.length) ? [{
    id: `vid-${s.id}-0`,
    sourceImageInstanceId: imgId,
    motionPrompt: (s.prompt || '') + ' Smooth cinematic motion, high quality, consistent style.',
    duration: s.duration,
    clips: s.videoClips || [{ url: s.videoUrl, clipDuration: s.duration }],
    status: 'done',
    isActive: true,
    canvasPosition: null,
  }] : [];
  return s;
}
```

Migration is non-destructive — old fields remain on the scene object, kept in sync via mirror writes (see §5.5).

### 5.5 Mirror writes (back-compat)

Existing code (export, editor, save) reads `scene.imgDataUrl` / `scene.videoUrl` / `scene.videoClips`. The canvas keeps these fields in sync with the **render-active** (🎯) instance, NOT the video-gen-active (⭐) instances:

```js
function syncMirrorFields(scene, mode) {
  const sb = scene.storyboardInstances.find(s => s.isActive);
  // imgDataUrl: in illustrated mode, mirror the 🎯 render-active image
  //             in animated mode, set null (videos export, not images)
  const renderImg = sb?.imageInstances.find(i => i.isRenderActive);
  scene.imgDataUrl = (mode === 'illustrated') ? (renderImg?.imgDataUrl || null) : null;

  // videoUrl / videoClips: mirror the 🎯 render-active video
  const renderVid = scene.videoInstances.find(v => v.isRenderActive);
  scene.videoUrl = renderVid?.clips[0]?.url || null;
  scene.videoClips = renderVid?.clips || null;

  // Active SB prompt is the canonical scene prompt
  scene.prompt = sb?.prompt || scene.prompt;
}
```

Multi-active (⭐) for video-gen never writes to mirror fields — it's purely a Launch trigger filter. Render-active (🎯) is the single source of truth for export/editor.

---

## 6. Node controls (full inventory)

### 6.1 Storyboard node

- **Header (drag handle)**: type icon, title `Section N · Storyboard A`, ⭐ active toggle (radio)
- **Body**:
  - Prompt textarea, autosaves on blur, debounced 500ms
  - 📎 Reference image upload + thumb + ✕ remove
  - ➕ Add image instance — creates child image; inherits prompt + style; status `pending`; user clicks Regenerate to trigger gen
- **Footer**: 🗑️ Delete (only enabled if section has >1 storyboard instance)

### 6.2 Image node

- **Header (drag handle)**: type icon, title `Img A.1`, ⭐ "Use for video gen" toggle (multi-select)
- **Body**:
  - Thumbnail (click → preview modal, full-screen)
  - Style chip: read-only, displays job-level style by default. Click ⚙️ to open "Advanced — override style for this instance" disclosure → reveals a style picker. When `styleOverridden: true`, a small ⚠️ icon shows on the node and ref injection still pulls siblings (consistency cushion).
  - 🔗 "Style-matched to N refs" badge — appears when ref injection used; clickable to show which sibling images were used
- **Actions**:
  - 🔄 Regenerate — same prompt + style + sibling refs, new seed
  - 📥 Download
  - ➕ Add image instance — creates sibling within same storyboard, inherits prompt + style, status `pending`
- **Footer**: 🗑️ Delete (enabled if storyboard has >1 image)
- **Status**: badge bottom-left (`✓ Done` / `⏳ Generating…` / `✗ Error — retry`)

### 6.3 Video node

- **Header (drag handle)**: title `Vid A.1`, ⭐ "Use for render" toggle (radio)
- **Body**:
  - Inline `<video>` with `muted playsinline preload="metadata"`
  - ▶ ⏸ ⏹ + seek slider + time display
  - Motion prompt textarea (per-instance, editable)
  - Duration input (per-instance, seconds, defaults to source scene duration)
- **Actions**:
  - 🔄 Re-animate this branch — regenerates first clip + continuation chain for this instance only
- **Footer**: 🗑️ Delete (enabled if section has >1 video instance, but never deletes the only active one without confirm)
- **Status**: badge

### 6.4 Continuation clip (visual child of parent video)

Read-only mini-card. NOT a separate data model entry — drawn as a sub-node of the parent video.

- Thumbnail (extracted last frame of previous clip)
- Duration label
- ▶ play (loops in-place)
- No regenerate, no delete (entire continuation chain is part of parent video instance; re-animate parent to redo)

### 6.5 Launch Video Agent node (in-graph, vertically centered, ephemeral)

- Big rose-bordered button: **🎬 Launch Video Agent**
- Lives **inside the graph (Layer A)**, vertically centered against full graph content height, x-positioned to the right of all image nodes
- Draggable like any node; position persists per `job.launchAgentPosition`
- **Visibility:** appears whenever there is at least one active ⭐ image with NO corresponding video instance yet. Disappears immediately on click. Re-appears if user adds a new ⭐ image post-generation.
- **Curves:** every ⭐ image instance has a curve flowing into this button
- **Disabled state** with tooltip when gates fail:
  - "Section N has multiple active storyboards — pick one"
  - "Section N has no ⭐ image instance — star at least one image to animate"
  - "All sections must have at least one active storyboard"
- **Enabled state:** button glows. Click → confirm `"Generate N videos? (one per ⭐ image across all sections)"`
- **On click:** button hides immediately. For each ⭐ image, a new `videoInstance` is created with `status: 'pending'` and a placeholder video node spawns to the right of its source image. Curves redirect from images to placeholders. `animateScenes()` runs across the pool, filling placeholders as Kling completes.
- **In-progress:** placeholders show their per-instance progress (submitted → polling → done/error). No global counter on the (now-hidden) Launch button — progress is visible per-node.

### 6.6 Final Render node (in-graph, vertically centered, persistent)

- Box containing two buttons: **📤 Export** and **✏️ Send to Editor**
- Lives **inside the graph (Layer A)**, vertically centered against full graph content height, x-positioned to the right of all video nodes
- Draggable; position persists per `job.finalRenderPosition`
- **Visibility:** appears as soon as the first video instance is created (placeholder or done). Stays visible permanently.
- **Curves:** every 🎯 render-active video instance has a curve flowing into this node
- **Disabled state** with tooltip when gates fail:
  - "Section N has no video — generate one first"
  - "Section N has multiple videos — pick one with 🎯 to render"
- **Enabled state:** both buttons glow
- Click → triggers existing export / editor handoff using `scene.videoUrl` / `scene.videoClips` (mirror fields)
- Animated mode: only video clips exported; sections without a 🎯 video block export with the gate tooltip. Image-only sections are **not** exported as stills — animated mode requires a video per section.

---

## 7. Properties pane and preview pane

### 7.1 Right pane — Preview (chrome, full-timeline only)

Per-clip preview happens **inline at each video node** (every video card has its own `<video>` with ▶ ⏸ ⏹ + seek). Per-image preview happens via clicking the image thumbnail → existing full-screen modal. The right pane is **not** used for selected-node preview.

The right pane only shows the **full-timeline preview**: concatenated playback of all sections' 🎯 render-active video clips + narration audio + BGM.

| State | Behavior |
|---|---|
| Default | Empty state with a **▶ Preview full video** button |
| Click button | Renders concatenated timeline; plays in-pane with ▶ ⏸ ⏹ + seek + time |
| Gate failed | Empty state shows tooltip: "Pick one 🎯 video per section to preview" |

Only one video plays at a time across the entire app. When user clicks ▶ on any node's video, all other playing videos auto-pause (no audio chaos).

### 7.2 Right pane — Properties (below preview)

Node-specific editable fields:

| Node type | Properties shown |
|---|---|
| Storyboard | Prompt (full editor), reference image, created at, instance count in section |
| Image | Prompt (read-only, shows parent storyboard prompt), style + override toggle, model used, sibling refs (with thumbs), styleFingerprint (read-only collapsed) |
| Video | Motion prompt (full editor), duration, source image (with thumb + click to select), clip list with per-clip thumbs, Kling task id (debug, collapsed) |

### 7.3 Bottom pane — Job-level properties

Always visible, read-only summary chips:

- Job title
- Total scenes / total active videos
- Estimated total duration
- Style preset (job-level default)
- BGM track (with mini player)
- Total cost so far
- Generation ETA (when in-progress)
- 🧹 Tidy button
- 💾 Auto-save indicator

---

## 8. Validation gates

| Gate | Condition | Effect when failed |
|---|---|---|
| **Section finalized** | Exactly one active storyboard per section | Section band background tinted rose 5%, warning chip "Pick one storyboard for this section" |
| **Storyboard has image** | Active storyboard has ≥1 image instance (any status) | Storyboard node shows orange dot + "No image — click ➕ to add" |
| **Has ⭐ image for video gen** | At least one ⭐ image across all sections | Launch button disabled, tooltip "Star at least one image to animate" |
| **All ⭐ images done before launch** | Every ⭐ image has `status: 'done'` | Launch button disabled, tooltip lists generating/error images |
| **Section has video (animated mode)** | Section has ≥1 video instance with `status: 'done'` | Final Render disabled, tooltip "Generate video for Section N first" |
| **Section has 🎯 video (animated mode)** | Section has exactly one 🎯 video instance | Final Render disabled, tooltip "Pick one video with 🎯 for Section N" |
| **Section has 🎯 image (illustrated mode)** | Section has exactly one 🎯 image instance | Final Render disabled, tooltip "Pick one image with 🎯 for Section N" |

Gates re-evaluate on every active-flag change, instance add/delete, and status change. Gate state propagates to Launch Video Agent (visibility + enable) and Final Render (enable). Section-level warnings show on the band itself.

---

## 9. Consistency strategy (image regeneration)

### 9.1 Problem

Original images generated via 3×3 grid (`gemini-3-pro-image-preview`) share one inference context → consistent style, palette, character look. New image instances generated alone via `gemini-2.5-flash-image` drift visually.

### 9.2 Hybrid solution (Option 1 + Option 3)

**Option 1 — Sibling reference injection** (primary):

When generating a new image instance:

1. Pick up to 3 sibling images from the same job:
   - 1 from same section (other instance, if exists) — closest match
   - 1 from adjacent section (i±1) — temporal neighbor
   - 1 random from other sections — broad style anchor
   - Plus character refs if user uploaded any (max 4 total parts)
2. Build multimodal request:
   ```js
   const parts = [
     ...siblingRefs.map(ref => ({ inlineData: { mimeType: 'image/png', data: ref.imgB64 } })),
     ...characterRefs,
     { text: `Generate a new image that EXACTLY matches the visual style, color palette, line weight, character appearance, lighting, and mood of the reference images above. The new image must look like it belongs in the same series.

STYLE GUIDE: ${styleFingerprint || stylePrompt}

SCENE: ${prompt}

STRICT: ${noTextSuffix}` }
   ];
   ```
3. Call existing `generateImageGeminiFlash(prompt, key, { refParts, … })` — already supports refParts.
4. Store the chosen sibling IDs in `imageInstance.generationContext.siblingRefIds` for traceability.

**Option 3 — Style fingerprint** (complement):

After the first grid generation completes, run a one-shot Gemini text call:

```js
const fingerprintPrompt = `Describe the visual style of these images in 200 words. Cover: color palette (with hex codes), line weight, rendering technique, character appearance, lighting, mood. Be specific so another artist could replicate the style.`;
// Call with up to 4 done images as refs
job.styleFingerprint = response.text;
```

Stored on the **job** (not per-image). Used as `STYLE GUIDE` text in every regeneration request, even when sibling refs are present (they reinforce each other).

### 9.3 Edge cases

- **First image of first section** — no siblings exist yet → use `stylePrompt` text only. Acceptable seed image.
- **All siblings failed** — fall back to `stylePrompt` text only.
- **User toggled "Override style" advanced** — siblings still injected (consistency cushion); style guide swapped to user's chosen style.
- **User uploaded character refs (refCharacters)** — added on top of sibling refs, capped at 4 total parts.
- **styleFingerprint generation failed** — silently fall back to `stylePrompt`; log warning, do not block.

### 9.4 Honest limits

- Faces still drift slightly (Gemini Flash 2.5 with refs is not as tight as Pro grid co-gen).
- For pixel-perfect character continuity, user should upload character refs via the existing `refCharacters` UI in Copilot.
- This is the best achievable inside Gemini's API surface; no IP-Adapter / LoRA available.

### 9.5 UI signal

On image nodes, a small badge appears: `🔗 Style-matched to 3 refs`. Click expands to show which sibling thumbs were used. When user toggles override-style, badge changes to `⚠️ Off-style override`.

---

## 10. Animation logic (Kling integration)

### 10.1 Trigger paths

1. **Launch Video Agent button** (bulk):
   - Iterates over all sections
   - For each section, finds active image instances
   - For each active image, creates a new video instance:
     ```js
     videoInstances.push({
       id: `vid-${scene.id}-${n}`,
       sourceImageInstanceId: img.id,
       motionPrompt: img.prompt + ' Smooth cinematic motion…',
       duration: scene.duration,
       clips: [],
       status: 'pending',
       isActive: false,  // user picks active after gen
     });
     ```
   - Calls `animateScenes(syntheticScenes, onProgress, geminiKey)` where `syntheticScenes` is built from each video instance, mapping `imgDataUrl` from the source image
   - On completion, if a section has exactly one new video → auto-mark active (matches "if only one instance, auto-select" rule). Otherwise leaves active flag unset for user to pick.

2. **Re-animate single video instance** (per-node):
   - Sets `videoInstance.status = 'submitted'`, clears `clips`
   - Builds a synthetic scene `{ imgDataUrl: img.imgDataUrl, prompt: motionPrompt, duration }`
   - Calls `_animateSingleScene(syntheticScene, 0, 1, onProgress, geminiKey)` (existing function in `21-kling.js`)
   - On completion, copies `syntheticScene.videoClips` into `videoInstance.clips`

### 10.2 Concurrency

Reuses `animateScenes`'s existing `CONCURRENCY = 5` worker pool. For bulk launch, total parallel scenes = sum of (active images per section across all sections). The pool keeps Kling rate-limit risk low.

### 10.3 Continuation chain

`_animateSingleScene` already builds continuation clips for scenes >5s using `buildClipPlan`. The canvas renders each entry in `videoInstance.clips` as a connected sub-node rightward of the parent. No data-model change needed.

### 10.4 Error handling

Per-instance failures don't block siblings. Failed video instance shows `✗ Error — retry` with tooltip carrying the error message. User clicks 🔄 Re-animate to retry that one only.

---

## 11. Persistence

### 11.1 What's saved

Project save (`15-project.js`) extends `createState.scenes[]` to include:
- `storyboardInstances` (with full child trees and `canvasPosition`)
- `videoInstances` (with `clips`, `taskId`, `canvasPosition`)
- `styleFingerprint` (job-level)

Image data and video clip data already serialized to base64 in existing save logic — extend the existing `videoClipsData` pattern to all instance clips.

### 11.2 Save triggers

Debounced 1500ms save on:
- Node drag end (position change)
- Prompt edit blur
- Active-flag toggle
- Instance add / delete
- Generation completion (image / video / continuation)
- Style override toggle

Manual save trigger from the standard project save button.

### 11.3 Load triggers

On project load:
1. Read `createState.scenes[]`.
2. For each scene, run `migrateScene()` (idempotent).
3. Decode base64 image / video data back into blob URLs.
4. Normalize active flags (enforce invariants from §5.3).
5. Sync mirror fields.
6. If any scene has `storyboardInstances`, render canvas. Otherwise render legacy grid.

### 11.4 Storage size considerations

Multiple instances multiply storage. Mitigation:
- Preview thumbs only stored at full res for **active** image instances; inactive instances stored at 512px max-edge.
- Continuation clip blobs stored once per video instance.
- Warning toast at 80% browser quota; hard limit guard at 95%.

---

## 12. Phase breakdown

Each phase is independently mergeable. Phases 2+ require Phase 1 approval.

### Phase 1 — Static visual mock (1 file)

**File:** `canvas-preview.html` (new, root-level, throwaway)

**Goals:**
- Validate the look and feel before touching real code
- Hardcoded fake data: 3 sections, mixed instance counts (sec1 = 1 SB / 1 img / 1 vid, sec2 = 2 SB / 3 img / 2 vid, sec3 = 1 SB / 2 img / 0 vid)
- Pan / zoom / drag working
- All node types rendered with all controls (non-functional)
- Bezier curves with status colors
- Section bands with labels
- Right pane (preview + properties)
- Bottom pane (job-level)
- 🧹 Tidy button working
- Validation gates visible (e.g., Sec3 has no videos → Final Render disabled with tooltip)

**Non-goals:**
- No API calls, no real save, no integration
- No keyboard shortcuts (just click + drag + scroll)

**Acceptance:** user runs the file in a browser, plays with it, approves the look. Iterate until approved before Phase 2.

### Phase 2 — Schema + migration

**Files to modify:**
- `js/15-project.js` — add `storyboardInstances` / `videoInstances` to `createState.scenes` save, decode on load, run `migrateScene` on every loaded scene
- `js/17a-create-api.js` — add canvas-related declarations (e.g., `let canvasPositions = {}` if needed at module scope; otherwise positions live on instance objects)

**Files to add:**
- `js/27-canvas-state.js` — new module owning `migrateScene`, `syncMirrorFields`, `validateGates`, instance creation helpers (createStoryboardInstance, createImageInstance, createVideoInstance, deleteInstance), active-flag toggle logic
- `js/28-canvas-consistency.js` — sibling ref picker, style fingerprint generator, `regenerateImageInstance` wrapper around `generateImageGeminiFlash`

**Tests:**
- Unit-load an old project save → verify migration produces valid graph
- Save → reload → verify positions and active flags survive
- Toggle active flags → verify mirror fields update + invariants hold

**Acceptance:** all old projects open without errors; saving + loading is round-trip safe.

### Phase 3 — Wire Copilot (and visual polish)

**IMPORTANT:** the Phase 1 `canvas-preview.html` mock is a layout-validation prototype, NOT the visual target. Final UI must match Stori's Aurora theme polish level. Mock-grade visuals are unacceptable for ship.

**Phase 3 polish checklist (must all pass before merge):**

- [ ] **Initial fit-to-view:** on canvas mount, the entire graph (all sections + Launch/Final nodes) MUST fit within the viewport. Compute total content bounds (min/max x and y across all nodes including Launch and Final), apply zoom = min(viewport_w / content_w, viewport_h / content_h, 1) with 40px padding on all sides, then center pan. Phase 1 mock fails this — initial render shows partial graph requiring user to zoom out / Fit. NOT acceptable in production.
- [ ] **Horizontal node gaps:** minimum 80px column gap between layers (SB → Image, Image → Video, Video → Continuation, etc.). Phase 1 mock used 60px which feels cramped. Vertical gaps within a column also need at least 24px between sibling instances. Curves must clear node edges with breathing room — never appear to touch or pass through node bodies.
- [ ] **Theme integration:** every color sourced from `css/aurora-base.css` CSS variables (`--accent-primary`, `--accent-glow`, `--bg-panel`, etc.). No raw hex.
- [ ] **Glassmorphism nodes:** frosted backgrounds with `backdrop-filter: blur()`, soft inner glows, layered shadows matching existing Aurora panel styling
- [ ] **Real thumbnails:** image nodes show actual `imgDataUrl` images with rounded corners, lazy-load + fade-in
- [ ] **Real video players:** custom controls matching Stori's existing player styling (not bare HTML5)
- [ ] **Curves:** SVG paths with gradient strokes (source-color → target-color), subtle drop shadows, anti-aliased
- [ ] **Curve draw-in animation:** stroke-dasharray length transition when a new curve appears (not instant)
- [ ] **Typography:** consistent scale — section labels 11px caps, node titles 13px medium, body 12px, chips 10px. Numerals tabular for time/duration/cost.
- [ ] **Spacing:** 8/12/16px padding grid; consistent border-radius scale (4/6/10/14)
- [ ] **Easing:** spring-like cubic-bezier on hover/select/drag, not linear/ease
- [ ] **Drag effect:** node lifts with shadow + ~1deg rotation; settles with bounce on drop
- [ ] **Star micro-animation:** scale + glow pulse on toggle
- [ ] **Selected node:** animated outline (slow pulse), not static ring
- [ ] **Tidy:** staggered animation (30ms × index delay) when nodes return to suggested positions
- [ ] **Status states:** skeleton shimmer while generating; smooth ramp-in when complete; clear error states with retry button
- [ ] **Section bands:** subtle radial-gradient accent at band-label end; not flat tints
- [ ] **Launch button "ready" state:** ambient particle / glow effect matching agent feel in current copilot
- [ ] **Light mode support:** all components work in Stori's light theme
- [ ] **Keyboard shortcuts:** Tab/Enter/Delete/F + arrow-key node nudge with focus rings
- [ ] **ARIA labels** on every interactive element; live region announcements for status changes
- [ ] **Performance:** virtualization for 30+ scenes; RAF-batched curve redraws; lazy `<video>` metadata

The mock is allowed to look "primitive." The shipped canvas must NOT.

**Files to modify:**

**Files to modify:**
- `js/17c-create-pipeline.js`:
  - After `runImageGeneration` completes (line ~2967), if `createVideoMode === 'animated'`, hide the existing video grid step and mount the canvas via `mountCanvas('create-canvas-step', createScenes)`.
  - Replace `regenerateScene(idx)` calls with canvas-driven instance regen (the existing function still works; canvas calls into it for back-compat).
  - Replace the `btn-create-regen-all-videos` handler with the canvas's Launch Video Agent flow.
- `index.html`:
  - Add `<div id="create-canvas-step" class="hidden"></div>` between video step and BGM step
  - Include `<script src="js/27-canvas-state.js"></script>`, `<script src="js/28-canvas-consistency.js"></script>`, `<script src="js/29-canvas-render.js"></script>`
- `css/aurora-base.css` (or new `css/canvas-graph.css`):
  - Node type styles
  - Swimlane band backgrounds
  - Pan/zoom transform
  - Right + bottom panes

**Files to add:**
- `js/29-canvas-render.js` — the canvas component itself: pan/zoom, node DOM, bezier SVG, drag handlers, properties pane, preview pane, Tidy button, gate evaluation, mountCanvas / unmountCanvas API

**Acceptance:** in Copilot animated mode, finishing image gen reveals the canvas with all generated images as nodes; user can add/regenerate instances, launch video gen, and reach Final Render. Old grid kept hidden but functional as fallback if canvas fails to mount (try/catch).

### Phase 4 — Wire Autopilot

**Files to modify:**
- `js/20-reels-creator.js`:
  - After Autopilot completes the full one-click pipeline and shows results, add a button **🎨 Open in canvas to fine-tune**
  - Button click: convert reel scenes to the same `storyboardInstances` / `videoInstances` shape (run migration), mount the canvas via the shared component
  - Same export path — canvas's Final Render reads back into reel scene state

**Files to add:** none (component shared from Phase 3)

**Acceptance:** Autopilot's hands-off UX is preserved (canvas is opt-in). Clicking the button takes user into canvas with all generated images / videos pre-populated; same gates and flows as Copilot.

### Phase 5 — Export integration & polish

**Files to modify:**
- `js/11-export.js`:
  - When animated mode: read each scene's `videoInstances.find(v => v.isActive)`. Use its clips array. If no active video for any scene, throw with a friendly error pointing to the canvas Final Render gate.
  - Block export if any scene fails the gate (matches §6.6).
- `js/15-project.js`:
  - Optimization: store inactive image instances at 512px max-edge instead of full res
  - Add storage-quota check before saving large projects

**Polish work:**
- Keyboard shortcuts: `Delete` deletes selected node (with confirm), `R` regenerates, `S` opens style override, `1` `2` `3` jump to sections, `F` fits canvas to all nodes, `Esc` deselects
- Loading skeleton when canvas mounts during long generations
- Onboarding tooltip the first time canvas opens

**Acceptance:** end-to-end — generate, fine-tune in canvas, export → final video matches user's active selections.

---

## 13. File-by-file change index

| File | Phase | Change |
|---|---|---|
| `canvas-preview.html` | 1 | NEW — static mockup |
| `canvas-graph-plan.md` | 0 | NEW — this file |
| `js/15-project.js` | 2 | Save/load schema extension + migration call |
| `js/17a-create-api.js` | 2 | Module-scope canvas vars if needed |
| `js/17c-create-pipeline.js` | 3 | Mount canvas after image gen; route old fns through canvas |
| `js/20-reels-creator.js` | 4 | Add "Open in canvas" button + mount |
| `js/11-export.js` | 5 | Read active video instances; gate enforcement |
| `js/27-canvas-state.js` | 2 | NEW — schema, migration, mirror, validation, instance CRUD |
| `js/28-canvas-consistency.js` | 2 | NEW — sibling ref picker, style fingerprint, regenerate wrapper |
| `js/29-canvas-render.js` | 3 | NEW — canvas component (pan/zoom/drag/render/curves/panes) |
| `css/canvas-graph.css` | 3 | NEW — all canvas styling |
| `index.html` | 3 | Add `<div id="create-canvas-step">` + script tags + CSS link |

---

## 14. Testing checklist

### 14.1 Migration

- [ ] Load a v1 project (flat shape, no instances) → canvas opens with one instance per layer per scene
- [ ] Load a project saved by canvas → graph reconstructs identically (positions, active flags)
- [ ] Load a project mid-generation (some scenes pending) → renders correctly; resume works

### 14.2 Layout

- [ ] Sections ordered top-to-bottom by `startTime`
- [ ] Bands resize to fit content
- [ ] Drag node into another band → reassigned to new section
- [ ] Tidy button restores auto-layout with smooth animation
- [ ] Pan/zoom feels smooth at 60fps with 50+ nodes

### 14.3 Storyboard layer

- [ ] Add new SB instance → inherits prompt + ref from active sibling
- [ ] Activate one SB → siblings auto-deactivate (radio)
- [ ] Section with multiple active SBs (impossible via UI, but if loaded as such) auto-corrects on render
- [ ] Delete only-SB blocked; delete one of many works

### 14.4 Image layer

- [ ] Regenerate image with siblings → request includes 1-3 sibling refs + style fingerprint
- [ ] First image of first section (no siblings) → request uses stylePrompt only
- [ ] "Override style" toggle → siblings still injected; style guide swapped
- [ ] Add image instance → inherits storyboard prompt + job style
- [ ] Multi-select images for video gen — multiple ⭐ allowed
- [ ] 🔗 ref badge displays correct sibling count

### 14.5 Video layer

- [ ] Launch Video Agent disabled until all sections have ≥1 active image
- [ ] Click Launch → one video per active image; concurrency 5; per-instance progress
- [ ] Single new video in section → auto-active
- [ ] Multiple new videos in section → no auto-active; user must pick
- [ ] Re-animate single video → only that video's clips replaced; siblings untouched
- [ ] Continuation chain renders rightward connected; sub-nodes are read-only

### 14.6 Final Render

- [ ] Disabled when any section has no active video
- [ ] Disabled with helpful tooltip when section has video but multiple active (impossible via UI)
- [ ] Export uses mirror fields and produces video matching selected branches
- [ ] Send to Editor populates editor with active videos

### 14.7 Persistence

- [ ] Save → reload → all positions, active flags, instance trees restored
- [ ] Storage quota warning at 80%
- [ ] Inactive image instances downsampled to 512px in storage
- [ ] Multiple browser tabs editing same project → last-write-wins (acceptable v1)

### 14.8 Autopilot

- [ ] Autopilot finishes → simple grid still shown (back-compat)
- [ ] "Open in canvas" button mounts canvas with autopilot data
- [ ] Canvas changes feed back into autopilot's export path

### 14.9 Edge cases

- [ ] Very long story (30 scenes) → canvas paginates / virtualizes nodes (defer to v2 if perf okay without)
- [ ] Section with 0 image instances (user deleted all) → SB node shows "No image" hint; Launch button gated
- [ ] Network failure during regen → error state, retry works
- [ ] Kling rate-limit → existing 30s backoff in `21-kling.js` keeps working; canvas shows "Rate limited, waiting…"

---

## 15. Open issues / future work

1. **Undo/redo** — not in v1. Workaround: autosave gives last-known-good state.
2. **Marquee multi-select** — not in v1; click-one-node-at-a-time only.
3. **Manual edge drawing** — not in v1; data-driven edges only.
4. **Canvas in marketing pipeline** — out of scope; could be ported in a separate effort.
5. **Mobile / touch support** — out of scope; mobile keeps the current grid.
6. **Keyboard accessibility (full)** — basic shortcuts in Phase 5; full a11y deferred.
7. **Real-time collaboration** — not planned; project file is single-user.
8. **Per-clip continuation editing** — continuation clips are bundled with parent video. If users need to redo just clip 3 of 4, they re-animate the whole video. Could decompose in v2.
9. **Style-fingerprint cost** — one extra Gemini text call per job. Cache aggressively; regenerate only if user changes style preset job-wide.
10. **Memory pressure with many video clips** — long stories with many alternates may hit browser RAM limits when all `<video>` elements load metadata. Mitigation: lazy-load video metadata only when node is in viewport; v1 may ship without and revisit if reports come in.

---

## 16. Glossary

- **Section** — a storyboard segment of the narration, defined by `startTime` / `endTime`. One section per band on the canvas.
- **Storyboard instance** — one variation of the visual idea for a section (prompt + ref). One active per section (radio).
- **Image instance** — one rendered image for a storyboard. Multiple can be active per section (multi-select for video gen).
- **Video instance** — one Kling-animated clip (+ continuations) sourced from one image. One active per section (radio).
- **Active** — the user-marked "to-use" instance. Different selection rules per layer (radio vs multi-select).
- **Mirror fields** — flat scene fields (`imgDataUrl`, `videoUrl`, `videoClips`) kept in sync with active instances for back-compat with export and editor.
- **Sibling refs** — already-generated image instances injected as visual references during regeneration to preserve consistency.
- **Style fingerprint** — Gemini-generated 200-word descriptor of the original grid's visual style, reused as text guide in subsequent regenerations.
- **Gate** — a validation rule that disables a downstream action until satisfied (e.g., Launch Video Agent gate, Final Render gate).
- **Tidy** — re-runs the auto-layout algorithm and animates nodes back into suggested positions.
- **Band** — a horizontal swimlane for one section. The only section-assignment constraint in the canvas.

---

## 17. Sign-off checklist (before Phase 1)

- [ ] User has read this document
- [ ] User confirms scope (Copilot + Autopilot, not Marketing pipeline)
- [ ] User confirms node-control inventory (§6) matches existing Copilot UI
- [ ] User confirms consistency strategy (§9) is acceptable — including the honest limits
- [ ] User confirms autopilot UX as "simple grid + Open in canvas button" (not auto-takeover)
- [ ] User approves the phase plan and acceptance criteria
- [ ] Agent assigned to Phase 1 builds `canvas-preview.html` and pauses for visual approval
