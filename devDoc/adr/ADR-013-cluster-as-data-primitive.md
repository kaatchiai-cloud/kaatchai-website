# ADR-013 — Cluster as a Data Primitive

- **Status:** Accepted (2026-05-03)
- **Affected phases:** Movie mode (MM-1 through MM-9, see `canvas-movie-mode-plan.md`)
- **Related:** ADR-014 (runtime-axis layout), ADR-015 (virtual stitch), ADR-016 (editor round-trip), schema migration in `devDoc/movie-mode-migration.md`

## Context

The canvas movie-mode design partitions a movie into **clusters** — contiguous groups of scenes that act as acts, chapters, or segments. The user sketch in conversation:

> Each cluster is a self-contained mini-movie. A user can ship one cluster to the editor as a 30-second cut without touching the rest. Clusters chain top-to-bottom; the final movie = concatenation of all cluster outputs.

Two ways to model this in code:

1. **Implicit (metadata-only)**: clusters are a derived view over scenes — a `chapterId` / `groupingTag` field on each scene, with no first-class cluster object. UI reconstructs cluster boundaries on every render.

2. **Explicit (first-class entity)**: a `clusters[]` array in `createJobState`, each cluster having an `id`, `name`, `color`, `status`, plus per-scene `clusterId` mapping.

Today's data model has flat `createScenes[]` only; podcast mode has a `chapters[]` array but it's not used as a workspace primitive — it just drives storyboard generation.

## Decision

**Clusters are a first-class data primitive.** Add `createJobState.clusters[]` and `scene.clusterId`. Both persist via autosave.

### Schema

```js
createJobState.clusters = [
  {
    id: 'cl_xyz',                     // unique
    name: 'Opening Act',              // user-editable, defaults to "Cluster N"
    color: null,                      // optional band tint (hex or null)
    status: 'idle' | 'generating' | 'ready' | 'shipped',
    editorState: null,                // optional cached editor state for round-trip
    createdAt: '2026-05-03T...'
  }
]

scene.clusterId = 'cl_xyz'
```

Derived (not stored):

- `cluster.startTime` = sum of durations of preceding clusters' scenes
- `cluster.duration` = sum of durations of own scenes
- `cluster.sceneIds` = `createScenes.filter(s => s.clusterId === id).map(s => s.id)`
- Order within cluster = order in `createScenes` array

### Why first-class

1. **Cluster operations need an object to mutate.** Rename, reorder, split, merge, color-change — all want a single entity to address. With derived clusters, every mutation requires re-deriving from scenes, which is expensive at low zoom (50+ scenes) and creates synchronization bugs.

2. **Status / round-trip state lives at cluster level, not scene level.** The "shipped to editor" flag, last-edited timestamp, cached editor state — these are properties of the cluster, not of any single scene.

3. **Cluster-level Send to Editor needs a stable identifier.** When the editor writes back trim points, it needs to know which cluster the edits apply to. A first-class `cluster.id` is the natural carrier.

4. **Empty clusters are valid intermediate states.** A user dragging the last scene out of a cluster shouldn't auto-delete the cluster. Empty clusters (placeholder for future scenes) only work with first-class objects.

## Consequences

### Positive

- Cluster operations (rename, reorder, split, merge) are single-entity mutations, not whole-array reductions
- Cluster-level metadata (color, name, status) has a place to live
- Round-trip from editor has a clear write target
- Empty clusters work as transient states

### Negative

- One more array to keep in sync with scenes (we already have `storyboardInstances`, `imageInstances`, `videoInstances` per scene — clusters add another sibling)
- Migration step required for existing flat-scene projects (see `movie-mode-migration.md`)
- More schema surface area to autosave / restore / library

### Migration

Existing flat-scene projects auto-migrate to a single default cluster on first load:

```js
if (createScenes.length > 0 && !createJobState.clusters) {
  const def = { id: 'cl_default', name: 'Movie', sceneIds: createScenes.map(s => s.id), createdAt: Date.now() };
  createJobState.clusters = [def];
  createScenes.forEach(s => s.clusterId = 'cl_default');
}
```

Schema version bumped to 2; future migrations check the version field. Detail in `movie-mode-migration.md`.

### Out of scope

- Hierarchical clusters (act → chapter → cluster). v1 is flat; nesting can be added later as an `cluster.parentId` field if needed.
- Cross-cluster scene linking (e.g., a flashback scene that "belongs to" cluster 2 but visually lives in cluster 5). v1 is one-cluster-per-scene.

## Alternatives Considered

- **Implicit grouping via `scene.clusterTag`.** Rejected — requires every operation to scan all scenes to compute the cluster object; doesn't scale to bulk operations; no place for cluster-level metadata.
- **Reuse `chapters[]` from podcast mode.** Rejected — chapters are a transcription artifact (timestamp-bounded transcript splits), not a user-editable workspace primitive. Conflating them couples movie mode to podcast mode.
- **Cluster as a virtual computed property on each scene.** Same problems as implicit grouping; fails for empty clusters.
