# Movie Mode — Schema Migration Plan

> Companion to `canvas-movie-mode-plan.md`. Specifies how existing flat-scene
> projects auto-migrate to the cluster schema when movie mode ships.

## Trigger

Migration runs **once per project**, on the first load after movie-mode code lands. Idempotent — running it twice does nothing.

## Schema version

Add `createJobState.schemaVersion: 2` after migration. Future migrations increment and check this field.

```js
const SCHEMA_VERSION_CLUSTERS = 2;
```

Pre-clusters projects either don't have this field (legacy) or have `schemaVersion: 1`.

## Migration code

```js
function migrateToClusters(createJobState, createScenes) {
  const v = createJobState.schemaVersion || 1;
  if (v >= SCHEMA_VERSION_CLUSTERS) return false;  // already migrated

  // No scenes — nothing to migrate, just stamp the version
  if (!Array.isArray(createScenes) || createScenes.length === 0) {
    createJobState.schemaVersion = SCHEMA_VERSION_CLUSTERS;
    return true;
  }

  // No clusters yet — wrap all scenes in a single default cluster
  if (!Array.isArray(createJobState.clusters) || createJobState.clusters.length === 0) {
    const defaultCluster = {
      id: 'cl_default_' + Date.now().toString(36),
      name: 'Movie',
      color: null,
      status: 'idle',
      editorState: null,
      createdAt: new Date().toISOString(),
    };
    createJobState.clusters = [defaultCluster];
    createScenes.forEach(s => { s.clusterId = defaultCluster.id; });
  } else {
    // Defensive: if clusters already exist but scenes lack clusterId, assign to first cluster
    const firstClusterId = createJobState.clusters[0].id;
    createScenes.forEach(s => {
      if (!s.clusterId) s.clusterId = firstClusterId;
    });
  }

  // Podcast-mode special case: existing chapters[] auto-populates clusters
  // when the podcast project hasn't been touched in cluster mode yet.
  if (Array.isArray(createJobState.chapters) && createJobState.chapters.length > 0
      && createJobState.clusters.length === 1
      && createJobState.clusters[0].name === 'Movie') {
    // User had a podcast project; lift chapters → clusters
    const newClusters = createJobState.chapters.map(ch => ({
      id: 'cl_ch_' + ch.id,
      name: ch.title || ('Chapter ' + ch.id),
      color: null,
      status: 'idle',
      editorState: null,
      createdAt: new Date().toISOString(),
    }));
    createJobState.clusters = newClusters;
    // Map scenes to clusters via existing chapterId
    createScenes.forEach(s => {
      const cluster = newClusters.find(c => c.id === 'cl_ch_' + s.chapterId);
      s.clusterId = cluster ? cluster.id : newClusters[0].id;
    });
  }

  createJobState.schemaVersion = SCHEMA_VERSION_CLUSTERS;
  return true;
}
```

## When to run

Two entry points:

1. **On `restoreAutoSaveIfAvailable` consumer** in 17b's `_castRestoreFromAutosave` (after rehydrating createJobState from localStorage):
   ```js
   // After applying state to createJobState
   if (typeof migrateToClusters === 'function') {
     migrateToClusters(window.createJobState, window.createScenes);
   }
   ```

2. **After storyboard generation** in 17c (where `createScenes` is populated for the first time on a fresh project):
   ```js
   createScenes = segments.map(...);  // existing code
   migrateToClusters(window.createJobState, createScenes);  // new
   ```

3. **After project load from any other path** (e.g., `loadProject` from `15-project.js`):
   - Hook into the existing project-load completion callback
   - Run migration before any cluster-aware code reads from state

## Persistence

After migration, `autoSaveCreateState` writes:
- `createJobState.schemaVersion`
- `createJobState.clusters[]`
- Each scene's `clusterId` field (already in scene serialization)

Existing autosave restore consumer reads these without further code changes — they just become standard fields.

## Rollback

If movie mode ships with bugs and we need to revert:

1. **Code rollback**: revert the cluster code commits. Clusters in localStorage harmless — old code ignores `clusters[]` and `clusterId`.
2. **Data rollback** (if needed): a one-time downgrade script that strips `clusterId` from scenes and removes `clusters[]` from createJobState. Set `schemaVersion = 1`. Only run if the cluster data itself is corrupting downstream.

## Test cases

| Scenario | Expected |
|---|---|
| Empty project, no scenes | `schemaVersion = 2`, `clusters = []`, no error |
| 1-scene project | 1 default cluster; scene has `clusterId` |
| 50-scene project | 1 default cluster with 50 scenes; load < 100ms |
| Podcast project with 5 chapters | 5 clusters (one per chapter); scenes mapped via chapterId |
| Already-migrated project (`schemaVersion: 2`) | No-op, returns false |
| Project with manual clusters but missing schemaVersion | Stamps version, fills missing clusterIds |
| Project where scenes are an empty array | No-op except version stamp |

## Edge cases

- **Scene has `chapterId` but no matching chapter**: assigns to first cluster (default).
- **Two clusters with the same id from a corrupt file**: first-write-wins via Map dedup before commit.
- **clusterId references a nonexistent cluster**: scene reassigned to first cluster on next render; warning logged.
- **Library entries**: not migrated (library is project-independent; entities have no `clusterId` until instantiated into a project).

## Out of scope for v1 migration

- **Auto-detecting natural cluster boundaries** in non-podcast projects (e.g., AI suggests "looks like 3 acts here"). v1 puts everything in one default cluster; user manually splits.
- **Migrating old-style image/video grids that were never cluster-aware** (e.g., legacy Reel projects). They use a different state shape entirely.

## Implementation checklist

- [ ] `migrateToClusters` function in a new `js/27b-cluster-migration.js` (or appended to 27-canvas-state.js)
- [ ] Called from `_castRestoreFromAutosave` (17b)
- [ ] Called after storyboard generation (17c)
- [ ] Called after project load (`15-project.js`)
- [ ] `schemaVersion` field written by `autoSaveCreateState`
- [ ] Smoke test: load old project → reload → verify migration ran once and stuck
- [ ] Smoke test: load podcast project → verify chapters → clusters mapping
- [ ] Smoke test: rollback by reverting code + load → verify old code ignores extra fields
