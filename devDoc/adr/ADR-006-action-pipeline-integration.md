# ADR-006 — Action pipeline integration (canonical handlers)

- **Status:** Accepted (2026-05-01)
- **Affected phases:** P05 (introduces `imgActions.addVariation`), P06 (introduces `vidActions.addVariation`), P07 (consolidates the rest), P08 (smoke test)

## Context

The redesign introduces two UIs that act on the same underlying instances:
- **Right-click context menu** (P07) — type-appropriate items per node.
- **Floating selection toolbar** (P07) — same items as the menu, mirrored.

Both UIs need to call the same action implementations. The architect prompt names the actions:
- `regenImage`
- `addVariation` (image)
- `deleteImage`
- `downloadImage`
- `addVideoVariation`
- (implicitly: deleteVideo, downloadVideo, regenVideo, deleteSB, addStoryboardVariant)

A grep of the live codebase reveals only partial coverage:

| Architect-named handler | Exists today | Notes |
|---|---|---|
| `regenImage` | NO | only `window.regenerateScene(idx)` exists at `js/17c-create-pipeline.js:2814` — accepts a scene index, regenerates image (and likely video) for that scene |
| `addVariation` (image) | NO (by name) | state-level `CanvasState.addImageInstance(scene, sbId, opts)` exists at `js/27-canvas-state.js:276`; no pipeline-level wrapper |
| `deleteImage` | partial | `doDeleteImage(scene, sb, img)` exists at `js/29-canvas-render.js:1956` — file-internal closure |
| `downloadImage` | YES | `doDownloadImage(img)` at `js/29-canvas-render.js:2015` — file-internal closure |
| `addVideoVariation` | NO | state-level `CanvasState.addVideoInstance(scene, sourceImgId, opts)` exists at `js/27-canvas-state.js:315`; no pipeline-level wrapper |
| `deleteVideo` | partial | `doDeleteVideo(scene, vidId)` at `js/29-canvas-render.js:1962` — file-internal closure |
| `deleteSB` | partial | `doDeleteSB(scene, sbId)` at `js/29-canvas-render.js:1950` — file-internal closure |
| `addStoryboardVariant` | partial | state-level `CanvasState.addStoryboardInstance(scene, opts)` at `js/27-canvas-state.js:245`; no pipeline wrapper |

Two issues:
1. **Naming divergence.** Architect's `regenImage` and `addVideoVariation` don't exist by name. Either rename or wrap.
2. **Closure scoping.** The `do*` handlers are file-internal in `js/29-canvas-render.js`; they aren't on `window`. Both UIs (menu + toolbar) need to reach them somehow.

## Decision

### 1 — Canonical handler namespaces on `window`

Five namespaces:
- `window.imgActions = { regen, addVariation, download, delete }`
- `window.vidActions = { regen, addVariation, download, delete }`
- `window.sbActions = { addVariant, delete }`
- `window.bgmActions = { regen, skip, setSource, setVolume }`
- `window.finalActions = { render, setResolution, setFps }`

Every menu item and every toolbar button calls `window.{type}Actions.{action}(...)`. Steppers (P07) also call setter handlers in these namespaces (e.g. `vidActions.setDuration`).

### 2 — Wrappers, not duplicates

Each canonical handler **wraps** an existing implementation; it does not duplicate logic:

- `imgActions.regen` → wraps `window.regenerateScene(sceneIdx)` (`js/17c-create-pipeline.js:2814`)
- `imgActions.addVariation` (introduced in P05) → wraps `CanvasState.addImageInstance` + existing image-gen pipeline call site (TBD per P05 verify)
- `imgActions.download` → wraps `doDownloadImage` (`js/29-canvas-render.js:2015`)
- `imgActions.delete` → wraps `doDeleteImage` (`js/29-canvas-render.js:1956`) with `confirm()` + cannot-delete-last guard
- `vidActions.regen` → wraps `window.regenerateScene` if it handles video by mode, OR a video-specific regen path (verify in P07)
- `vidActions.addVariation` (introduced in P06) → wraps `CanvasState.addVideoInstance` + existing video-gen pipeline call site (TBD per P06 verify)
- `vidActions.download` → new (no existing handler) — wraps the same download pattern as `doDownloadImage` extended for video URLs
- `vidActions.delete` → wraps `doDeleteVideo` (`js/29-canvas-render.js:1962`) with confirm
- `sbActions.addVariant` → wraps `CanvasState.addStoryboardInstance` (`js/27-canvas-state.js:245`)
- `sbActions.delete` → wraps `doDeleteSB` (`js/29-canvas-render.js:1950`) with confirm
- `bgmActions.*` and `finalActions.*` → P07 implements; underlying setters already exist or are scene-level fields

### 3 — Closure exposure

P07 exposes the closure-scoped `do*` handlers via `window.CanvasGraph._actions` (or an equivalent internal namespace, underscore-prefixed to signal "internal, not stable API"). Canonical handlers call them through that namespace.

Alternative: refactor `do*` to be module-internal but accessible via the existing `window.CanvasGraph` object. Engineer's choice in P07; document the chosen approach.

### 4 — Idempotent registration

Each phase that registers actions uses the idempotent pattern:

```js
window.imgActions = window.imgActions || {};
window.imgActions.addVariation = async (scene, sbId, opts) => { ... };
```

P05 registers `imgActions.addVariation`. P06 registers `vidActions.addVariation`. P07 fills in everything else. Order doesn't matter as long as all handlers exist before menu/toolbar buttons fire.

### 5 — Async contract

All "regen" and "addVariation" handlers return Promises. Menu/toolbar UI shows a loading state while the promise pends. On rejection, error toast is shown; partial state is cleaned up (e.g. if `addVideoInstance` succeeded but generation failed, call `deleteVideoInstance` to roll back).

### 6 — Naming reconciliation

The architect-named `regenImage` becomes `imgActions.regen`. The architect-named `addVideoVariation` becomes `vidActions.addVariation`. Phase docs explicitly call out the rename so engineers don't grep for the architect names.

## Rationale

- **One source of truth per action.** Two UIs, one handler — no drift.
- **Wrapping > replacing.** The existing `do*` handlers and `regenerateScene` already do real work; rewriting them risks regressions.
- **Window namespaces are accessible.** Both menu and toolbar can attach `onclick=imgActions.delete(...)` without circular-import concerns.
- **Idempotent registration** lets phases ship in any order (P05 / P06 / P07) without tripping over each other.
- **Async by default** matches the pipeline reality (image/video generation is multi-second).

## Alternatives considered

1. **Replace `do*` and `regenerateScene` with new APIs.** Rejected: high risk; existing UIs (Properties pane, Run pipeline) call them; broken changes propagate.
2. **Have menu and toolbar each implement the action directly.** Rejected: drift guaranteed; fixed in one UI but not the other.
3. **Single big `dispatch(action, ...args)` table.** Rejected: less discoverable; harder to type-check; namespace approach is more idiomatic.
4. **Use an event bus (`document.dispatchEvent`).** Rejected: overkill; loose coupling we don't need; harder to debug the call chain.

## Consequences

### Positive
- Single canonical handler per action.
- Both UIs identical in behavior.
- Clean wrapper pattern; existing implementations preserved.
- Idempotent registration → phase order is flexible.
- Easy to mock/stub for tests (replace `window.imgActions.delete` with a stub).

### Negative
- `window.*Actions` is a global; risks collisions with unrelated code. Mitigated by namespacing under `imgActions / vidActions / sbActions / bgmActions / finalActions`.
- Engineers need to find the canonical handler before adding new UI; risk is they re-implement instead. Mitigated by phase docs citing this ADR.
- The `_actions` underscore-prefix on `window.CanvasGraph._actions` is a soft convention; nothing prevents external code from depending on it. Acceptable for v1.
- Async error handling burden: every caller must `try/catch`. Mitigated by toast/error utility being a single function reused.

## References

- Architect prompt ADR-6 (this ADR's source)
- `js/29-canvas-render.js:1942` (`doAddImageInstance`), `:1950` (`doDeleteSB`), `:1956` (`doDeleteImage`), `:1962` (`doDeleteVideo`), `:2015` (`doDownloadImage`)
- `js/17c-create-pipeline.js:2814` (`window.regenerateScene`)
- `js/27-canvas-state.js:245` (`addStoryboardInstance`), `:276` (`addImageInstance`), `:315` (`addVideoInstance`)
- P05 (introduces `imgActions.addVariation`)
- P06 (introduces `vidActions.addVariation`)
- P07 (consolidates all)
- ADR-7 (backwards compat — handlers respect legacy mirror direction)
