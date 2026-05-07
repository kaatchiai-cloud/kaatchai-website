# Canvas Movie Mode — Design Document

## Vision

Transform the canvas from a node graph for generating images/videos into a **movie-making space** where:

- A movie is composed of **clusters** (acts / chapters / segments)
- Each cluster contains a linear sequence of **scenes**
- Each scene is the existing SB → IMG → VID node row
- The X-axis of the canvas represents **movie runtime** — clusters are positioned by their cumulative start time and sized by their duration
- The canvas becomes a **screenplay editor**: scenes can be moved between clusters, reordered, inserted, deleted, duplicated, split, merged
- Each cluster can be sent independently to the **timeline editor** for BGM/subtitles/export, just like the existing global "Send to Editor"

---

## Layout

```
   MOVIE RUNTIME (ruler) →
   0:00         0:30          1:15          2:00          3:30
    ├────────────┼─────────────┼─────────────┼─────────────┤

    CLUSTER 1               CLUSTER 2               CLUSTER 3
    "Opening"               "Rising"                 "Climax"
   ┌────────────────┐      ┌────────────────┐      ┌────────────────┐
   │ Scene 1        │      │ Scene 3        │      │ Scene 6        │
   │ ─SB-IMG-VID    │      │ ─SB-IMG-VID    │      │ ─SB-IMG-VID    │
   │ Scene 2        │      │ Scene 4        │      │ Scene 7        │
   │ ─SB-IMG-VID    │      │ Scene 5        │      │ Scene 8        │
   │                │      │                │      │                │
   │ [Cluster       │      │ [Cluster       │      │ [Cluster       │
   │  Output]       │      │  Output]       │      │  Output]       │
   │  → Editor      │      │  → Editor      │      │  → Editor      │
   └────────────────┘      └────────────────┘      └────────────────┘
                                    │
                                    ↓
                          ┌────────────────────┐
                          │ FINAL MOVIE        │
                          │ → Editor           │
                          └────────────────────┘
```

### Axis meaning

- **X-axis = movie runtime.** Cluster X position = cumulative duration of preceding clusters. Cluster horizontal span on the runtime ruler = cluster's own duration.
- **Y-axis = no time meaning.** Scenes stack vertically inside a cluster purely for layout. Internal SB → IMG → VID flow stays left-to-right within the scene row.

### Cluster layout strategy

**Decision: Option A — fixed inner layout, runtime band underneath.**

Cluster body uses a consistent compact shape (3 columns: SB, IMG, VID at fixed widths). The cluster's runtime span is shown as a translucent rail underneath the cluster on the ruler — wider rail = longer cluster — but the cluster's working area stays uniform. This keeps short-duration clusters from looking cramped and long-duration clusters from looking sparse.

Hovering or selecting a cluster highlights its span on the ruler.

### Runtime ruler

- Permanent fixed strip at the top of the canvas viewport (like a video editor's timeline)
- Pans/zooms with the canvas content horizontally
- Shows timecodes: `0:00, 0:30, 1:00, 1:30, ...`
- Cluster bands sit on the ruler as translucent rectangles
- Optional playhead line that sweeps left-to-right during preview playback

---

## Screenplay Editing

The canvas is not just a viewer — it's the editor. Scenes are first-class draggable units.

### Scene as the atomic unit

A scene = `{ SB-N, IMG-N, VID-N, all variants, references, durations }`. When dragged, the whole row moves together — image variants, video variants, prompt edits, references, transitions, timing all stay attached. SB / IMG / VID nodes don't drag independently across clusters.

**UI**: each scene row gets a **scene handle** — a draggable header strip on the left edge of the row. Grab the handle, the whole row lifts.

### Drop targets

When dragging a scene, three valid drops:

- **Onto another scene row** in any cluster → insert above/below (depending on which half of the target row the cursor is on)
- **Into an empty area inside a cluster** → append to that cluster
- **Onto the gap between two clusters** → create a new cluster between them

Invalid drops (with red feedback): outside any cluster, onto the ruler, onto chrome nodes (Cluster Output, Final Movie).

### Live preview while dragging

- Other scenes slide out of the way (CSS transitions on `top`)
- Targeted cluster gets a highlight ring
- Runtime ruler updates in real-time — moving a 30s scene from Cluster 2 to Cluster 1 makes Cluster 1 wider on the ruler, Cluster 2 narrower, instantly

### Scene operations

- **Insert blank scene** — `+ Add scene` button at the bottom of each cluster. Creates an empty SB → empty IMG → empty VID row.
- **Delete scene** — right-click → Delete, or selection toolbar Delete. Confirms first.
- **Duplicate scene** — right-click → Duplicate. Clones SB prompt, IMG variants, VID prompts. New scene gets a fresh id, all instance ids re-rolled.
- **Split scene** — cut a long scene into two at a chosen point. Useful when a scene is doing too much.
- **Merge scenes** — select 2+ adjacent scenes, merge into one. Storyboard prompts concatenated, durations summed, first scene's image kept (with warning).
- **Reorder within cluster** — same drag mechanism, short distance. Re-arranges sceneIds within the cluster.

### Cluster operations

- **Rename cluster** (double-click header)
- **Reorder cluster** (drag cluster header L↔R)
- **Split cluster at scene N** → creates two clusters
- **Merge clusters** (drag one cluster header onto another)
- **Add empty cluster** (between any two existing clusters or at the ends)
- **Delete cluster** (deletes its scenes — confirm)

### Multi-select for bulk moves

Shift-click scene handles or marquee-select scene handles → drag multiple scenes at once. Existing marquee infrastructure can be reused; constrain selection to scene handles for this mode.

### Undo / redo

**Critical for editing.** Every structural mutation (move, insert, delete, split, merge, rename) pushes onto an undo stack. Cmd-Z / Cmd-Shift-Z. Without this, screenplay editing is too risky — one bad drag wipes work.

Implementation: JSON.stringify scene + cluster state on each mutation, capped at e.g. 50 entries.

### Scene-aware inspector

Right panel today inspects single nodes (SB, IMG, VID individually). Add a new mode: when a scene's **handle** is selected (not a child node), show a "Scene" panel with:

- Title
- Duration
- Cluster assignment
- Transition in/out
- Notes / screenplay text
- Characters / environments referenced

### Optional: Script view

A toggle at the top: **Canvas | Script**. Script view shows the same scenes as a Fountain-style screenplay text:

```
=== CLUSTER 1: Opening ===

INT. KITCHEN - DAY                                  Scene 1 [0:00-0:08]
A worn coffee table. Steam rising from a mug.
Camera: slow dolly-in.

INT. HALLWAY - DAY                                  Scene 2 [0:08-0:16]
Footsteps echo. Door opens.
Camera: tracking shot.

=== CLUSTER 2: Rising ===
...
```

Edits in script view (rename, reorder paragraphs, split with `===` markers) sync back to the canvas.

---

## Per-Cluster Editor Send

Each cluster has its own `→ Editor` button. Not just the global Final Movie.

### Flow

```
Canvas (cluster) →  [→ Editor]  →  Timeline editor (existing)
                                   - BGM picker
                                   - Subtitle controls
                                   - Voiceover languages
                                   - Export
```

The cluster's `→ Editor` button hands the editor that cluster's scene list (videos + images + durations + per-scene prompts/timings). The editor then runs its **existing** BGM / subtitle / language / export workflow on that subset.

### Decision: scoped-by-filter, NOT scoped-by-rebuild

BGM and subtitles are **not** in canvas — they're added inside the editor by the user, after the cluster lands there. The cluster arrives clean (just video clips + scene metadata). BGM and subtitles are picked fresh in the editor for that cluster.

This means we do **not** need to slice `audioBuffer`, re-zero subtitles, or split BGM. The editor receives:

- Ordered list of scenes (`videoUrl`, `imgDataUrl`, `duration`, `prompt`, `transition`)
- Cluster id + name (for breadcrumb / label)
- 0-based timeline (cluster scenes start at 0:00 in the editor)

Implementation is essentially a scoped version of `openReelInFullEditor` ([js/20-reels-creator.js:5148](js/20-reels-creator.js#L5148)). That function already takes a scene list and populates `videoTimelineItems` / `photoItems`. Pass the cluster's filtered scene list instead of all reel scenes:

```js
function sendClusterToEditor(clusterId) {
  const clusterScenes = createScenes.filter(s => s.clusterId === clusterId);
  window.openClusterInEditor(clusterScenes, clusterId);
}
```

### Editor mode breadcrumb

A breadcrumb in the editor header: `Movie ▸ Cluster 2: Rising`. A `← Back to canvas` button returns without exporting.

### Round-trip — YES

Edits made in the editor write back to the cluster's scenes:

- Trim points (`scene.editorIn`, `scene.editorOut`)
- Transitions (`scene.transitionIn`, `scene.transitionOut`)
- Per-scene durations adjusted in the editor
- Per-scene volume

BGM and subtitles do **NOT** round-trip — they are editor-only artifacts on the cluster's timeline. If the user reopens the cluster in the editor, BGM/subtitles are picked fresh again (or persisted on the cluster object as `cluster.editorState` for convenience).

The canvas is the source of truth for **structure** (which scene where, in which cluster). The editor is the source of truth for **fine-cuts** within a scene/cluster.

### Status gating

Each cluster has `status: 'idle' | 'generating' | 'ready' | 'shipped'`. The cluster's `→ Editor` button only enables when all its scenes have `videoUrl`. Today the global Send button doesn't gate; per-cluster makes the gating natural and visible.

### Skipped: per-scene → editor

Skipped per decision. Adds noise; cluster is the right granularity.

---

## Cluster Chrome Node

Each cluster has **one** chrome node — the **Cluster Output** node — that consolidates Launch, Stitch, and → Editor:

```
   ┌─────────────────────────┐
   │  CLUSTER 2 OUTPUT       │
   │  ───────────────────    │
   │  ▶ [virtual preview]    │  ← plays scene videos in sequence
   │     0:30 / 0:45         │
   │                         │
   │  Status: 5/5 ready      │
   │                         │
   │  [ → Editor ]           │  ← scoped editor send
   │  [ ↓ Download ]         │  ← triggers server concat at this point
   └─────────────────────────┘
```

Multi-state, similar to the existing two-phase Launch node:

- `idle` — scenes have images but no video prompts yet → show "Generate Video Prompts" button
- `filling` — Gemini is filling structured prompts → spinner
- `ready` — all scene prompts ready → show "Launch Cluster Videos" button
- `running` — Kling is generating → progress text
- `done` — all videos ready → show preview + `→ Editor` + `↓ Download` buttons

This replaces the current global Launch + Final pair when clusters exist. Globally at the end:

- **Final Movie node** — concatenates all cluster outputs, has its own `→ Editor` for the full movie

---

## Stitching Strategy

### Decision: Option D — virtual stitching (no actual file mid-flow)

The cluster never gets a single combined video file during canvas work. Its "stitched output" is a list of URLs in order. The editor receives this list and concatenates at **export time** using its existing pipeline (`videoTimelineItems` already supports this for reels).

### Why no mid-flow stitch

If the cluster were stitched into one file, the editor would just have to *un*-stitch back into clips to align subtitles per scene. So the stitch step would be wasted work.

### Virtual preview

The Cluster Output node shows a faux preview that plays scene videos in sequence — swap `<video>` src as each ends, preload the next, optional crossfade to hide gaps. To the user it looks like one continuous video.

### Real concat — only at download

When the user clicks `↓ Download cluster`, **that's** when server-side ffmpeg concat is triggered. Pay the cost only when there's an actual artifact to ship.

### Browser limits — practical ceilings

| Browser | Practical Blob limit | Hard limit |
|---|---|---|
| Chrome | ~2 GB safely, 4 GB risky | 4 GB |
| Safari | ~1.5 GB safely | ~2 GB |
| Firefox | ~2 GB safely | ~4 GB |

A 1080p mp4 at typical Kling output (~4 Mbps) = ~30 MB per minute:

- 5 min movie → 150 MB → fine anywhere
- 15 min → 450 MB → fine
- 30 min → 900 MB → fine, getting heavy
- 60 min → 1.8 GB → risky on Safari, fine on Chrome
- 2 hr → 3.6 GB → fails on Safari, risky on Chrome

### Where it actually breaks during export

- **MediaRecorder**: holds the entire growing blob in RAM. Realistic ceiling: 30–45 minutes at 1080p.
- **ffmpeg.wasm**: needs all input files in WASM virtual filesystem before concat. Each input must fit in WASM's ~2 GB memory. Concat-without-reencode is fast and low-memory.
- **Streaming to disk** (`WritableStream` via File System Access API): no RAM ceiling. Chrome/Edge full support today; Safari/Firefox fall back to RAM.

### Recommendation

- **Per-cluster**: no stitching, URL list → editor → editor exports cluster. Always client-side. Always fits.
- **Global Final**: same approach for short movies (< 30 min). For longer movies, route through server-side concat (new `/api/concat` endpoint) — user sees a "Preparing your movie..." spinner; backend ffmpeg stitches and uploads; editor receives a single CDN URL.

Most users will never hit the long-movie path because they'll work cluster-by-cluster — that's the whole point of the cluster model.

### Approach comparison

| Approach | Best for | Browser handles? |
|---|---|---|
| URL list to editor | Per-cluster sends, short global movies | Yes, no size pressure during canvas work |
| Editor exports via MediaRecorder | < 30 min total | Yes, RAM-bound |
| Editor exports via ffmpeg.wasm | < 60 min, needs re-encoding | Yes if scenes fit individually |
| Server-side concat | > 30 min, polished output | Always |
| Streaming export to disk (Chrome) | Any size, Chrome/Edge only | Yes, no ceiling |

**Start simple**: URL list + editor's existing export. Add server-side concat as a fallback only if real-world usage shows long-movie pain.

---

## Data Model Changes

### Scene

Add: `scene.clusterId: string`

### New `clusters[]` array

```js
{
  id: string,
  name: string,
  color?: string,            // optional band tint
  status: 'idle' | 'generating' | 'ready' | 'shipped',
  editorState?: object,      // optional cached editor state for round-trip convenience
}
```

`sceneIds` for a cluster derive from `createScenes.filter(s => s.clusterId === id)`. Order within cluster = order in `createScenes` array (with the array sorted by cluster, then by intra-cluster order).

### Derived fields (not stored)

- `cluster.startTime` = sum of durations of all scenes in preceding clusters
- `cluster.duration` = sum of durations of all its own scenes
- `cluster.x` = `startTime * pixelsPerSecond`
- `cluster.width` = `duration * pixelsPerSecond`

### Undo stack

```js
{
  history: [{ scenes: <snapshot>, clusters: <snapshot> }, ...],   // capped at 50
  pointer: number,
}
```

---

## Renderer Changes

### Layout

`doLayout()` becomes cluster-aware:

1. Group scenes by `clusterId`
2. Compute each cluster's X (cumulative duration so far × pxPerSec) and width (duration × pxPerSec)
3. For each cluster, lay out scenes vertically as today, but starting at cluster's X
4. Render cluster band (semi-transparent rectangle on graph layer) underneath the scene rows
5. Render runtime ruler at the top of the viewport

### Drag

New mode: **scene-handle drag**.

- Existing node drag = per-node X/Y (unchanged)
- Scene drag = lift a whole row, find drop slot, splice into target cluster's sceneIds, re-layout
- Closer to a Trello / Linear card drag than to a graph node drag

### Right pane

- Existing modes (SB / IMG / VID inspectors) preserved
- New mode: scene-mode inspector when a scene handle is selected

### Inter-cluster curves

Derived:

- Last scene of cluster N → first scene of cluster N+1 (subtle dotted curve)
- Cluster N Output → Cluster N+1 Output (chrome chain)
- Last cluster Output → Final Movie

---

## Phased Build Plan

Each phase is independently shippable.

### Phase 1 — Data model + cluster layout (no editing yet)

- Add `scene.clusterId`, `clusters[]` to data model
- Migration: existing flat scenes → single default cluster
- `doLayout()` cluster-aware
- Runtime ruler at top of viewport
- Cluster bands rendered as translucent rectangles
- Scenes still drag individually as today; no cross-cluster moves yet
- **Outcome**: user sees the movie space visually but can't edit structure yet

### Phase 2 — Scene handle + same-cluster reorder

- Scene handle UI (draggable header on each row)
- Drag a scene's handle, reorder within its cluster only
- CSS transitions for smooth row reflow
- Scene-aware right panel inspector
- **Outcome**: user can rearrange scenes within a cluster

### Phase 3 — Cross-cluster drag

- Drop into other clusters
- Drop into gaps between clusters (creates a new cluster)
- Live ruler updates while dragging
- Highlight ring on target cluster
- **Outcome**: full screenplay restructuring

### Phase 4 — Scene operations

- Insert blank scene
- Delete scene
- Duplicate scene
- Split scene at a point
- Merge adjacent scenes
- **Outcome**: full scene CRUD

### Phase 5 — Cluster operations

- Rename cluster (double-click header)
- Reorder cluster (drag header L↔R)
- Split cluster at scene N
- Merge clusters (drag one onto another)
- Add empty cluster (in gaps or at ends)
- Delete cluster (with confirmation)
- **Outcome**: full cluster CRUD

### Phase 6 — Per-cluster Cluster Output node + → Editor

- Replace global Launch + Final with per-cluster Cluster Output nodes
- Multi-state node (idle / filling / ready / running / done)
- Per-cluster `→ Editor` button — scoped scene list to existing editor
- Round-trip: editor edits write back to cluster scenes (trims, transitions, durations, volume)
- Final Movie node at the end for whole-movie export
- **Outcome**: per-cluster shippable workflow

### Phase 7 — Undo/redo

- Snapshot stack on every structural mutation
- Cmd-Z / Cmd-Shift-Z keybinds
- 50-entry cap with FIFO eviction
- **Outcome**: safe to do aggressive screenplay editing

### Phase 8 — (Optional) Script view

- Canvas / Script toggle at top
- Fountain-style read view of clusters + scenes
- Edits in script view sync to canvas (rename, reorder, split with `===`)
- **Outcome**: power-user screenplay-text workflow

### Phase 9 — (Optional) Server-side concat

- New `/api/concat` endpoint — receives URL list, runs ffmpeg concat demuxer, returns single mp4 URL
- Trigger only on `↓ Download cluster` or `↓ Download movie`
- Long-movie fallback for > 30 min global Final
- **Outcome**: production-grade exports for long projects

---

## Open Items (resolved)

- ✅ Round-trip from editor to canvas — **YES**
- ✅ Per-scene → editor — **SKIPPED**
- ✅ Editor scoping — **filtered scene list, no audio/subtitle slicing** (BGM/subs picked fresh in editor)
- ✅ Stitching strategy — **virtual stitching, real concat only at download**
- ✅ Cluster width on runtime axis — **Option A: fixed inner layout, runtime band underneath**
- ✅ Runtime ruler — **permanent fixed strip at top of canvas viewport**

## Open Items (still to decide)

- **Clustering source for podcast mode**: existing podcast `chapters` data should auto-populate clusters on first load. Confirm.
- **Default cluster for new audio/text mode projects**: single "All scenes" cluster, user splits manually? Or AI-suggested clusters from script content?
- **Cluster colors / theming**: each cluster gets a band tint? User-editable or auto-assigned? Aurora palette only?
- **Multi-language voiceovers in scoped editor**: all languages travel with cluster, or only primary?
- **Scene-handle drag at low zoom**: at 25% zoom the handle is tiny. UX: increase handle hit area, or zoom-snap on grab?

---

## Non-goals

- Replacing the existing editor for BGM/subtitle/language — those stay editor-only
- Per-scene `→ Editor` send — cluster is the granularity
- Real-time collaborative editing
- Mobile/touch interaction for screenplay editing (desktop-first)

---

## Characters & Locations Panel

A persistent panel below the existing left agent panel, present in both **timeline (create page)** and **canvas** views. Same panel component, same data, different feature levels by surface.

### Surface-based feature gating

| Surface | Read | Edit | Filter | Add | Delete |
|---|---|---|---|---|---|
| **Timeline (create page)** | ✅ | ❌ disabled | ❌ disabled | ❌ disabled | ❌ disabled |
| **Canvas** | ✅ | ✅ | ✅ | ✅ | ✅ (with confirm) |

In the timeline view, the panel is read-only — characters and their reference images appear as informational thumbnails so users see what's defined, but cannot edit, regenerate, filter, or add. All interactive controls are disabled (greyed buttons, no chip filtering, no edit modal). Clicking a disabled control shows a hint: *"Open canvas to edit characters."*

In canvas, full editing is enabled.

### Placement

Below the existing left agent panel (`#create-agent-panel`), inside the same collapsible-panel infrastructure. Sub-tabs at the top of the new panel — count varies by `createJobState.videoType`:

- **Brand mode**: `[ Product | Cast | Locations ]` — three tabs; Product tab shows the single product card, Cast tab shows characters + presenter, Locations tab shows locations + setting
- **Film mode**: `[ Characters | Locations ]` — two tabs (default in this doc's diagrams)
- **Narration mode**: panel hidden entirely (no entities to show)

Example for film mode:

```
┌──────────────────────────┐
│ AGENT PANEL              │  ← existing
│ (steps, statuses, etc.)  │
├──────────────────────────┤
│ [ Characters | Locations ]│  ← new panel header tabs
├──────────────────────────┤
│ ┌────┐                   │
│ │img │ Maya         🔒   │
│ └────┘ 8 yrs · Cinematic │
│        Appears in 7/12   │
│        [👁] [✏]          │  ← disabled in timeline, enabled in canvas
├──────────────────────────┤
│ ┌────┐                   │
│ │img │ Detective Joe 🔒  │
│ └────┘ 47 yrs · Cinematic│
│        Appears in 4/12   │
│        [👁] [✏]          │
└──────────────────────────┘
```

Locations tab uses the same row template (image, name, scenes-it-appears-in count, filter + edit buttons).

### Per-character row contents

- Reference image (~48×48 thumbnail, the locked representative image)
- Name + style + age range
- Scene count: derived live from `createScenes.filter(s => s.refCharacters.includes(charId)).length`
- **👁 Filter** button (canvas only) — toggles filter mode
- **✏ Edit** button (canvas only) — opens character edit modal
- 🔒 / 🔓 lock indicator

### Edit modal (canvas only)

Inline overlay (not the right pane) showing reference image, lock state, style, scene count, full appearance text, distinctive traits list, clickable scene-appearance list (clicking a scene number pans the canvas to that node), regenerate image / new ref / unlock buttons.

Unlocking a character shows a confirmation: *"Unlocking Maya will require regenerating any scene that references her. 7 scenes will be marked as needing regen. Continue?"*

### Add character mid-project (canvas only)

`+ Add` button on panel header. Reuses the upfront character setup flow. **Constraint:** characters added after storyboard generation cannot retroactively appear in already-generated scenes — they're only available for new scenes or for scenes the user explicitly assigns them to via chip + AI-rewrite. The new row gets a tooltip: *"Added 2025-05-03. Available for new scenes or manual assignment."*

### Character ordering

Sorted by scene appearance count, descending (most-prominent first). No manual drag-to-reorder for v1.

### Persistence

Character data lives in project state (`createJobState.characters`, `createJobState.locations`) and persists with autosave. Available across page reloads.

---

## Filter by Character (Canvas Only)

Filter mode that hides or dims canvas nodes whose scene doesn't feature a chosen character. Disabled in timeline view.

### Activation paths

1. **Characters panel** — click 👁 on a character row
2. **Right inspector** — when an SB / IMG / VID node is selected, character chips on its scene are clickable → "Filter to this character"
3. **Cursor-mode chrome strip** — new filter dropdown next to the cursor mode picker

### Multi-character filter via shift-click

- Click 👁 on Maya → `Filtering: Maya · 7 scenes`
- **Shift-click** 👁 on Joe → `Filtering: Maya AND Joe · 2 scenes`
- Shift-click 👁 on Maya again → removes Maya, `Filtering: Joe · 4 scenes`
- Plain click 👁 → resets to single-character filter
- Cmd/Ctrl-click → equivalent to shift-click (Mac/Win parity)
- Right-click 👁 → "Filter only this" (clears existing filter, sets just this character)

The chip's `AND | OR` toggle switches between intersection and union; shift-click only adds/removes characters in the set.

### Filter chip UI

Fixed-position at top of canvas viewport (below runtime ruler when present):

```
┌──────────────────────────────────────────────────┐
│ 🔎 Filtering: Maya AND Joe  ·  2/12 scenes  [✕]  │
└──────────────────────────────────────────────────┘
```

Click ✕ or hit Esc to clear.

### Visual mode

**Hybrid: dim by default, compact-view toggle.**

- **Default**: non-matching scenes dim to opacity 0.15. Layout preserved. Curves to/from dimmed nodes also dim.
- **Compact view toggle**: non-matching scenes hidden entirely; remaining scenes pack tighter; runtime ruler updates to show only kept scenes' total duration.

Default to dim — preserves the user's mental model of scene positions. Compact is for power filtering when noise is intolerable.

### Filter behavior with operations

- **Selection survives filter changes** — selected scenes stay selected even when filtered out (subtle highlight indicates "selected but dimmed").
- **Edits react live** — adding Maya to a scene un-dims it; removing Maya re-dims it. Same for AI rewrite.
- **Drag works on dimmed nodes** — moving a dimmed scene into a cluster that brings it into the filter set un-dims it on drop.
- **Cluster with zero matches** shows an empty band with note: *"No scenes match filter."*
- **Deleting a character that's the active filter** auto-clears the filter.

### Filter persistence

Session-only, not saved with project. Filters are exploration tools, not project state. Stored in `g.characterFilter`, cleared on canvas unmount.

### Movie mode (clusters): filter is global

When canvas movie-mode lands with clusters, the filter is **global across all clusters and all nodes**. Filtering by Maya hides/dims:

- Every Maya-less scene in every cluster
- Every IMG and VID node downstream of those scenes
- Cluster Output nodes whose cluster contains zero Maya scenes
- Curves between dimmed nodes

The filter chip shows total matching count across the whole movie: *"Filtering: Maya · 7 / 47 scenes across 6 clusters."*

The Final Movie node always stays visible (it represents the assembled output regardless of filter state).

This makes character continuity inspection across the entire movie a single click — particularly powerful for screenplay work where you want to see "every scene featuring my protagonist" across acts.

**Picked up when movie-mode is built.** For the pre-movie-mode canvas, filter operates on the flat scene list.

---

## Future Considerations

These are not committed scope. They're recorded so they're not forgotten, and so the phased build above doesn't pretend the work is finished when it isn't. Triage when ready to build.

### Workflow gaps

- **Empty cluster state** — what does an empty cluster show? Just a `+ Add scene` button? Auto-deleted if last scene drags out?
- **First-scene / last-scene transitions** — first scene of the movie has no transition-in, last has no transition-out. UI must hide those fields.
- **Cluster-boundary transitions** — does the transition between Cluster 1's last scene and Cluster 2's first scene live on the scene or on the cluster? (Probably on the scene.)
- **Locked clusters** — once shipped to editor and rendered, lock the cluster to prevent accidental edits invalidating the export. Lock icon, "Unlock to edit" gesture.
- **Stale-export indicator** — if a cluster has been sent to editor and you then change a scene inside it, the editor's existing export is now stale. Need a "🔄 Re-send" indicator on the cluster.
- **Per-scene image/video re-gen invalidates downstream** — re-generating a video changes the cluster's stitched output. Cluster status should reset from `shipped` → `ready`.

### Movie-level metadata

- **Movie title** — beyond project name. Shown on Final Movie node + editor breadcrumb.
- **Aspect ratio per cluster vs per movie** — today aspect ratio is per-scene (`scene.aspect`). For a movie it should usually be uniform. Lock at movie level? Allow per-cluster (e.g. an inset 9:16 reel inside a 16:9 movie)?
- **Logline / synopsis / genre** — fed into Gemini prompts as context for prompt-fill, scene generation, cluster-naming suggestions.
- **Movie target duration** — soft cap that shows on the ruler ("you're at 2:47 / target 3:00") to help screenplay pacing.
- **Movie-level negative prompt / style preset** — applies to all scene generations unless overridden per-scene.

### Screenplay quality-of-life

- **Scene labels / slug lines** — `INT. KITCHEN - DAY` style headers on each scene, editable, surfaced in script view.
- **Scene notes / director's notes** — non-prompt freeform text on each scene. Doesn't go to AI.
- **Color-coded scenes** — by character, location, mood. Quick visual scanning at low zoom.
- **Beat markers** on the ruler — user-draggable flags ("Inciting incident", "Midpoint", "Climax") for screenplay structure tracking.
- **Page count estimation** — Hollywood convention: 1 minute ≈ 1 page. Show alongside runtime.

### Generation orchestration

- **Per-cluster batch limits** — Kling rate limits. If a cluster has 12 scenes, do they all submit at once or staggered? UI: "Generating 3 of 12 in parallel."
- **Pause / resume / cancel** per cluster — already partially exists for the global flow, needs cluster scoping.
- **Cost preview** — "Generating Cluster 2 will use ~$1.20 in Kling credits." Before launch.
- **Retry-failed scoped to cluster** — today retry is global.
- **Generation queue across clusters** — if user clicks Launch on three clusters, queue them sequentially or parallel?

### Collaboration / sharing

- **Cluster as exportable unit** — export a cluster as JSON (scenes + prompts + assets) for hand-off to another project / collaborator.
- **Cluster as importable unit** — paste/drag a cluster JSON into the canvas.
- **Movie templates** — save a cluster structure (no content) as a template: "Three-act structure", "5-cluster YouTube essay", "TikTok hook + body + CTA".
- **Read-only sharing** — share a movie URL where viewer can play through but not edit.

### Visualization at scale

- **Movie minimap** (the existing stub button) — actually relevant once clusters exist. Shows cluster bands as colored blocks, viewport rectangle, click to teleport.
- **Cluster collapse** — collapse a cluster to a single tile showing total duration + thumbnail. Useful when working on Cluster 5 of 8 and not wanting to see the rest.
- **Time-zoom slider** — separate from canvas zoom. Compress runtime axis (lots of clusters fit on screen) vs. stretch (one cluster fills viewport).
- **"Fit movie to viewport" / "Fit cluster to viewport"** chrome buttons — already exist in spirit (`fitToView`, `panToColumn`). Extend to clusters.
- **Scene heatmap overlay** — mode toggle that paints scenes by status (red = error, yellow = pending, green = done) for at-a-glance health check.

### Audio & timing inside canvas

The committed scope keeps BGM/subtitles editor-only. But the canvas should still be timing-aware:

- **Per-scene voiceover length preview** — if a scene has a voiceover/transcript segment, show its waveform/duration on the SB node so user sees if the visual matches the audio length.
- **Audio-driven cluster suggestion** — for podcasts, AI splits the audio into clusters by topic shift; the canvas just adopts those splits.
- **Scene duration from audio** vs **manual override** — today `scene.duration` comes from transcription. With clusters, user might want to override per-scene without breaking transcription alignment.

### AI-assisted authoring

- **AI cluster naming** — given the scenes in a cluster, Gemini suggests a name ("The Discovery", "Confrontation").
- **AI cluster boundaries** — given a flat list of scenes, Gemini proposes natural cluster splits (act breaks).
- **AI continuity check** — flag scenes where character appearance or environment doesn't match adjacent scenes.
- **AI script-to-clusters** — paste a script, AI generates the cluster structure with placeholder scenes.
- **AI shot variation** — "give me 3 alternative camera angles for this scene" generates 3 IMG variants automatically.

### Integration with existing systems

- **Brainstorm panel integration** — the existing `26-brainstorm.js` could write directly into a cluster as a starting structure.
- **Photopilot / Reels handoff** — current Reel canvas (`20-reels-creator.js`) and the create canvas would share the cluster engine; reels become single-cluster movies.
- **Existing characters / environments references** — already exist in `17b-create-references.js`. Should be cluster-scoped or movie-scoped? (Movie-scoped probably; characters persist across clusters.)
- **Project autosave granularity** — cluster-level save points so undo can revert to "before this cluster was edited."

### Persistence & versioning

- **Cluster history** — per-cluster snapshot list. "Revert this cluster to yesterday's version" without affecting other clusters.
- **Branch / fork a cluster** — duplicate a cluster as an alternative take, both versions live until user picks one.
- **Cloud sync** — current state is localStorage. Cluster sizes encourage real cloud projects.

### Accessibility & input

- **Keyboard navigation for screenplay editing** — Tab/arrows to traverse scenes, Enter to edit, Cmd-↑/↓ to move scenes between clusters without dragging.
- **Touch / pen support** — Wacom/iPad use cases. Drag handle needs larger hit area than mouse.
- **Screen-reader narration** — scene roles (`role="listitem"`), cluster grouping (`role="region"`), runtime ruler (`role="slider"` with valuenow).

### Performance considerations

- **Virtualization** — at 30+ scenes, only render visible ones (cull off-screen rows). Existing canvas doesn't do this; clusters make scale a real concern.
- **Lazy thumbnail loading** — IMG node thumbnails only load when in viewport.
- **Debounced re-layout on drag** — don't reflow every pixel of drag, only on cross-cluster boundary or drop.
- **Web Worker for layout math** — once clusters > 100 scenes, layout calc on main thread janks pan/zoom.

### Telemetry / debugging

- **Per-cluster status panel** — "Cluster 2 took 4 min to generate, 1 retry, $0.80 cost."
- **Generation trace** — log of API calls per cluster, expandable for debugging.
- **Layout debug overlay** (dev only) — show cluster X/width, scene Y, ruler ticks.

### Edge cases the committed scope skips

- **Zero-scene cluster** — auto-collapse or auto-delete?
- **Single-cluster movie** — does the runtime ruler still appear? Does Final Movie node still appear (redundant with cluster's own → Editor)?
- **All scenes have zero duration** — typing/loading state. Don't divide by zero on layout.
- **Cluster duration changes mid-drag** — user is dragging a scene from C1 to C2. C2 widens on ruler in real time. What if widening pushes C3 off-screen?
- **Drop a scene from C1 onto C1's own scene** — no-op or reorder? (Reorder.)
- **Duplicate scene from C1 — does the duplicate land in C1 or somewhere else?** (Same cluster, immediately after original.)
- **Renaming a cluster while round-trip is in progress** — does editor's breadcrumb update live?

### Documentation deltas needed

- **ADRs** — at minimum: cluster as data primitive, runtime-axis layout decision, virtual-stitch strategy, round-trip contract (what fields editor writes back).
- **Schema migration plan** — existing projects have flat scenes. Auto-wrap in single default cluster on load.
- **API contract for `/api/concat`** if/when Phase 9 ships.
