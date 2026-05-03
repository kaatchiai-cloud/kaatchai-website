# ADR-014 — Editor Round-Trip Contract

- **Status:** Accepted (2026-05-03)
- **Affected phases:** Movie mode MM-6 (per-cluster Send to Editor)
- **Related:** ADR-011 (cluster as data primitive), ADR-013 (virtual stitch)

## Context

The user committed to **round-trip yes** for cluster edits in the editor:

> The canvas is the source of truth for structure (which scene where, in which cluster); the editor is the source of truth for fine-cuts within a scene/cluster. They need to sync.

Open question: **what specifically does the editor write back, and what stays editor-only?** Without an explicit contract, BGM tracks added in the editor might overwrite canvas state on return; or scene reorders made in the canvas might be lost when reopening the editor.

## Decision

A clean **two-way sync with a typed contract**: each field is owned by either canvas (`source-of-truth: canvas`) or editor (`source-of-truth: editor`), and only its owner can mutate it.

### Round-trip from editor → canvas (writes back)

| Field | On scene | Notes |
|---|---|---|
| `editorIn` | trim point in seconds | trimmed-in offset; default 0 |
| `editorOut` | trim point in seconds | trimmed-out offset; default scene.duration |
| `transitionIn` | `'fade' \| 'cut' \| 'dissolve'` | overrides scene.transition for the in-edge |
| `transitionOut` | same enum | for the out-edge |
| `editorVolume` | 0–1 | per-scene audio volume in the editor mix |
| `effectiveDuration` | derived | `editorOut - editorIn`, replaces scene.duration in cluster duration calc |

The canvas reflects edits visually: trim points show as faint vertical lines on the VID node preview; transitions show as small icons between adjacent VID nodes; volume shows as a meter on the VID node header.

### Editor-only (does NOT round-trip)

| Field | Why editor-only |
|---|---|
| BGM track, BGM volume curves | Editor concept; canvas has no BGM lane |
| Subtitle blocks, styling, language | Editor concept; canvas doesn't render subtitles |
| Voiceover language tracks | Editor concept |
| Color grading, LUTs | Editor-applied post-process |
| Export resolution / fps | Editor-time decision |

These live in `cluster.editorState` (opaque blob) so reopening the editor preserves them. Canvas never reads `editorState`.

### Canvas-only (does NOT pass to editor)

| Field | Why canvas-only |
|---|---|
| `scene.refCharacters`, `scene.refEnvironment`, `scene.hasProduct` | Editor doesn't need cast refs — they were used during gen |
| `scene.promptDirty`, `scene.bracketTokens` | Workflow state, not playback state |
| Cluster name, color, status | Workspace metadata |
| `scene.canvasPosition` (X for nodes), `scene.storyboardInstances` | Canvas layout state |

## Consequences

### Positive

- **Contract is explicit.** Each field has one owner; no ambiguity about who wins on merge conflicts.
- **No accidental data loss.** If user edits BGM in editor then re-sends from canvas, BGM is preserved (in `cluster.editorState`).
- **Canvas stays focused on structure.** It doesn't try to render BGM/subtitle UI; that's the editor's job.
- **Editor stays focused on fine-cuts.** It doesn't try to render the cluster graph.

### Negative

- Two surfaces of truth means users have to learn which is which. Mitigation: editor breadcrumb shows `Movie ▸ Cluster 2: Rising`; canvas shows trim/transition icons on VID nodes so canvas users know the editor has touched things.
- `cluster.editorState` is opaque to the canvas, so it can't show, e.g., "this cluster has 3 subtitle languages." We could add summary fields later if needed.

### Round-trip lifecycle

```
1. User clicks → Editor on Cluster 2
   Canvas hands editor:
     - cluster.id
     - cluster.scenes (with videoUrl, duration, transitionIn/Out, editorIn/Out, prompt)
     - cluster.editorState (if cluster was previously edited in editor — restores BGM, subs, etc.)

2. User edits in editor: trims clips, changes transitions, adds BGM.

3. User clicks ← Back to canvas (or → Export)
   Editor writes back to canvas:
     - For each scene: editorIn, editorOut, transitionIn, transitionOut, editorVolume (round-trip fields above)
     - For cluster: cluster.editorState = full editor blob (BGM, subs, languages, color grade)
     - For cluster: cluster.status = 'shipped' if exported, 'in-edit' if just visited

4. User reopens cluster in editor:
   Canvas re-hands cluster.editorState; editor reconstructs full state.
   Round-trip fields are already on the scenes; editor reads them directly.
```

### Stale-export indicator

If the user changes a scene's prose (chip edit, prompt rewrite) AFTER `cluster.status === 'shipped'`, mark cluster as `status: 'shipped-stale'` and show a 🔄 indicator. User must re-send to editor to refresh the export.

### What if canvas changes structure between sends?

User sends Cluster 2 → editor. While editor is open, user goes back to canvas and adds a new scene to Cluster 2. On editor return:

- Editor's writeback applies to scenes that still exist in the cluster (matched by `scene.id`).
- New scene that wasn't in editor has no `editorIn`/`editorOut` etc. — uses defaults.
- Removed scene that editor still references logs a warning; data is dropped.

This is documented in the editor breadcrumb: "Movie ▸ Cluster 2 (3 of 4 scenes — Scene 4 added after open)."

## Alternatives Considered

- **One-way export (no round-trip).** Rejected — user explicitly required round-trip yes.
- **Full bidirectional sync of all fields.** Rejected — leads to ownership conflicts (which surface wins on a transition value?). Typed contract avoids this.
- **Editor as the sole source of truth post-send.** Rejected — destroys the canvas's ability to restructure (drag scene out of cluster after send).

## Implementation notes

- `scene.editorIn`, `scene.editorOut`, `scene.transitionIn`, `scene.transitionOut`, `scene.editorVolume` added to scene schema (defaults: editor-out = scene.duration, others = 0/null/'cut')
- `cluster.editorState` is an opaque object the canvas never touches
- Existing reel editor (`js/20-reels-creator.js`) already takes `videoTimelineItems` — a list of `{ videoEl, videoSrc, inPoint, outPoint, duration, ... }`. Cluster-to-editor handoff reuses this shape; round-trip writes back into our scene fields.
