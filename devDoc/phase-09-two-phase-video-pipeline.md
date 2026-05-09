# Phase 09 — Two-Phase Video Pipeline Canvas (animated mode)

> Slug: `two-phase-video-pipeline` · Depends on: P06 (VID tray) · Files: js/29-canvas-render.js, js/17c-create-pipeline.js, js/27-canvas-state.js

---

## 1 — Goal

Replace the single Launch node (phase-text-only) with a proper two-phase pipeline that shows
distinct, gated cards and per-scene nodes as generation progresses.

### Expected canvas flow

```
idle      →  [IMG] ──▶ [Gen Video Prompts card]     (singleton, centered between IMG and VID columns)

filling   →  [IMG] ──▶ [Prompt Node per scene]      (per-row, prompts streaming in)

ready     →  [IMG] ──▶ [Prompt Node] ──▶ [Generate Videos card]   (singleton)

running   →  [IMG] ──▶ [Prompt Node] ──▶ [VID placeholder per scene]

done      →  [IMG] ──▶ [Prompt Node] ──▶ [VID with video] ──▶ [Final]
```

### Gating rules

| Phase    | Gen Prompts card | Prompt nodes | Gen Videos card | VID nodes | Final node |
|----------|-----------------|--------------|-----------------|-----------|------------|
| idle     | ✅ shown        | ❌ hidden    | ❌ hidden       | ❌ hidden | ❌ hidden  |
| filling  | ❌ removed      | ✅ shown     | ❌ hidden       | ❌ hidden | ❌ hidden  |
| ready    | ❌ removed      | ✅ shown     | ✅ shown        | ❌ hidden | ❌ hidden  |
| running  | ❌ removed      | ✅ shown     | ❌ removed      | ✅ shown  | ❌ hidden  |
| done     | ❌ removed      | ✅ shown     | ❌ removed      | ✅ shown  | ✅ shown   |

---

## 2 — Column layout (no new columns needed)

```
COL_SB=80   COL_IMG=860   COL_LAUNCH=1640   COL_VID=2100   COL_FINAL_ANIM=3180
                               ↑                  ↑
                     Gen Prompts card (idle)   Gen Videos card (ready)
                     Prompt nodes (filling+)   VID nodes (running+)
```

- Gen Prompts card and Prompt nodes share `COL_LAUNCH=1640` — mutually exclusive by phase.
- Gen Videos card and VID nodes share `COL_VID=2100` — mutually exclusive by phase.
- No existing column constants change.

---

## 3 — New constants

Add after existing constants at the top of `js/29-canvas-render.js` (after line 54):

```js
const PROMPT_W   = 360;   // per-scene prompt node width
const PROMPT_H   = 170;   // per-scene prompt node height
const GEN_CARD_W = 220;   // Gen Prompts / Gen Videos singleton card width
const GEN_CARD_H = 110;   // Gen Prompts / Gen Videos singleton card height
```

---

## 4 — New state fields

Add to `freshGraphState()` after `launchEl: null` (line 136):

```js
genPromptsEl:  null,        // Gen Video Prompts card DOM el
genVideosEl:   null,        // Generate Videos card DOM el
promptNodeEls: new Map(),   // scene.id → prompt node DOM el
```

---

## 5 — New function: `buildPromptNode()`

New function after `buildVidNode` (~line 762). Builds the per-scene prompt node shell.

```js
function buildPromptNode() {
  const node = document.createElement('div');
  node.className = 'cg-node cg-node--prompt';
  node.style.width  = PROMPT_W + 'px';
  node.style.height = PROMPT_H + 'px';

  // Left socket (image color — receives curve from IMG node)
  const sockIn = document.createElement('div');
  sockIn.className = 'cg-sock cg-sock--in cg-sock--image';
  node.appendChild(sockIn);

  // Right socket (video color — sends curve to VID node or Gen Videos card)
  const sockOut = document.createElement('div');
  sockOut.className = 'cg-sock cg-sock--out cg-sock--video';
  node.appendChild(sockOut);

  // Header
  const hdr = document.createElement('div');
  hdr.className = 'cg-node-header';
  hdr.innerHTML = '<span class="cg-node-title">Video Prompt</span>';
  node.appendChild(hdr);

  // Body — three prompt rows
  const body = document.createElement('div');
  body.className = 'cg-node-body cg-prompt-body';
  body.innerHTML =
    '<div class="cg-prompt-row"><span class="cg-prompt-label">Camera</span>'    + '<span class="cg-prompt-val cg-prompt-val--empty" data-field="camera">—</span></div>' +
    '<div class="cg-prompt-row"><span class="cg-prompt-label">Motion</span>'    + '<span class="cg-prompt-val cg-prompt-val--empty" data-field="motion">—</span></div>' +
    '<div class="cg-prompt-row"><span class="cg-prompt-label">Environment</span>' + '<span class="cg-prompt-val cg-prompt-val--empty" data-field="env">—</span></div>';
  node.appendChild(body);

  return node;
}
```

---

## 6 — New function: `updatePromptNode(node, scene, vid)`

Updates a prompt node with live prompt values. Call after each `notifyPromptReady`.

```js
function updatePromptNode(node, scene, vid) {
  if (!node || !vid) return;

  const fields = [
    { key: 'camera', value: vid.cameraPrompt },
    { key: 'motion', value: vid.motionPrompt },
    { key: 'env',    value: vid.environmentPrompt },
  ];

  fields.forEach(({ key, value }) => {
    const el = node.querySelector('[data-field="' + key + '"]');
    if (!el) return;
    if (value) {
      el.textContent = value.length > 60 ? value.slice(0, 57) + '…' : value;
      el.title = value;
      el.classList.remove('cg-prompt-val--empty');
    } else {
      el.textContent = '—';
      el.removeAttribute('title');
      el.classList.add('cg-prompt-val--empty');
    }
  });

  // Spinner on header when filling
  const hdr = node.querySelector('.cg-node-header');
  if (hdr) {
    const isFilling = g.videoPhase === 'filling';
    const allFilled = fields.every(f => f.value);
    if (isFilling && !allFilled) {
      hdr.classList.add('cg-prompt-hdr--filling');
    } else {
      hdr.classList.remove('cg-prompt-hdr--filling');
    }
  }
}
```

---

## 7 — New function: `renderGenPromptsCard()`

Appears only in `idle` phase. Replaces the idle/filling body of the old `renderLaunchNode`.

```js
function renderGenPromptsCard() {
  // Remove if not idle
  if (g.videoPhase !== 'idle') {
    if (g.genPromptsEl && g.genPromptsEl.parentNode) {
      g.genPromptsEl.parentNode.removeChild(g.genPromptsEl);
    }
    g.genPromptsEl = null;
    g.nodeEls.delete('cg-gen-prompts');
    return;
  }

  if (!g.genPromptsEl || !g.genPromptsEl.isConnected) {
    const node = buildSimpleNode('cg-node--launch', 'image', '⚡ Video Agent', {
      w: GEN_CARD_W,
      h: GEN_CARD_H,
      hasIn:  true,   // ← FIX: was false in old renderLaunchNode
      hasOut: false,
      bodyHtml:
        '<div class="cg-launch-body">' +
        '<button type="button" class="cg-launch-btn cg-launch-btn--prompts">✨ Gen Video Prompts</button>' +
        '</div>',
    });
    node.dataset.id   = 'cg-gen-prompts';
    node.dataset.type = 'gen-prompts';
    g.graphLayerEl.appendChild(node);
    g.nodeEls.set('cg-gen-prompts', { el: node, type: 'gen-prompts' });
    g.genPromptsEl = node;

    // Wire button
    const btn = node.querySelector('.cg-launch-btn--prompts');
    if (btn) {
      btn.addEventListener('click', () => {
        if (typeof window.cgFillVideoPrompts === 'function') window.cgFillVideoPrompts();
      });
    }
  }

  const midY = g.chromeMidY || TOP_PAD;
  placeNode(g.genPromptsEl, COL_LAUNCH, midY - GEN_CARD_H / 2);
}
```

---

## 8 — New function: `renderGenVideosCard()`

Appears only in `ready` phase.

```js
function renderGenVideosCard() {
  // Remove if not ready
  if (g.videoPhase !== 'ready') {
    if (g.genVideosEl && g.genVideosEl.parentNode) {
      g.genVideosEl.parentNode.removeChild(g.genVideosEl);
    }
    g.genVideosEl = null;
    g.nodeEls.delete('cg-gen-videos');
    return;
  }

  if (!g.genVideosEl || !g.genVideosEl.isConnected) {
    const node = buildSimpleNode('cg-node--launch', 'video', '🎬 Videos', {
      w: GEN_CARD_W,
      h: GEN_CARD_H,
      hasIn:  true,
      hasOut: false,
      bodyHtml:
        '<div class="cg-launch-body">' +
        '<button type="button" class="cg-launch-btn cg-launch-btn--videos">🚀 Generate Videos</button>' +
        '</div>',
    });
    node.dataset.id   = 'cg-gen-videos';
    node.dataset.type = 'gen-videos';
    g.graphLayerEl.appendChild(node);
    g.nodeEls.set('cg-gen-videos', { el: node, type: 'gen-videos' });
    g.genVideosEl = node;

    // Wire button
    const btn = node.querySelector('.cg-launch-btn--videos');
    if (btn) {
      btn.addEventListener('click', () => {
        if (typeof window.cgLaunchVideoAgent === 'function') window.cgLaunchVideoAgent();
      });
    }
  }

  const midY = g.chromeMidY || TOP_PAD;
  placeNode(g.genVideosEl, COL_VID, midY - GEN_CARD_H / 2);
}
```

---

## 9 — New function: `renderPromptNodes()`

Appears in `filling`, `ready`, `running`, `done` phases (hidden in `idle`).

```js
function renderPromptNodes() {
  const phase = g.videoPhase || 'idle';

  // Remove all prompt nodes when idle
  if (phase === 'idle') {
    g.promptNodeEls.forEach((el) => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    g.promptNodeEls.clear();
    return;
  }

  const activeSceneIds = new Set();

  (g.sortedScenes || []).forEach((scene) => {
    const nodeId = 'prompt-' + scene.id;
    activeSceneIds.add(nodeId);

    // Get the render-active vid instance for this scene
    const activeSb = (scene.storyboardInstances || []).find(s => s.isActive)
                  || (scene.storyboardInstances || [])[0];
    const activeImg = activeSb && ((activeSb.imageInstances || []).find(i => i.isRenderActive)
                   || (activeSb.imageInstances || [])[0]);
    const list = (scene.videoInstances || []).filter(v =>
      activeImg ? v.sourceImageInstanceId === activeImg.id : true
    );
    const vid = list.find(v => v.isRenderActive) || list[0];

    let el = g.promptNodeEls.get(nodeId);
    if (!el || !el.isConnected) {
      el = buildPromptNode();
      el.dataset.id   = nodeId;
      el.dataset.type = 'prompt';
      g.graphLayerEl.appendChild(el);
      g.promptNodeEls.set(nodeId, el);
      g.nodeEls.set(nodeId, { el, type: 'prompt' });
    }

    updatePromptNode(el, scene, vid);
    placeNode(el, COL_LAUNCH, scene._innerTop ?? TOP_PAD);
  });

  // Prune stale prompt nodes (scene deleted)
  g.promptNodeEls.forEach((el, nodeId) => {
    if (!activeSceneIds.has(nodeId)) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      g.promptNodeEls.delete(nodeId);
      g.nodeEls.delete(nodeId);
    }
  });
}
```

---

## 10 — Replace `renderLaunchNode()` with `renderPipelineCards()`

Delete the existing `renderLaunchNode` function and replace with:

```js
function renderPipelineCards() {
  if (g.mode !== 'animated') {
    // Clean up all pipeline DOM in illustrated mode
    [g.genPromptsEl, g.genVideosEl].forEach(el => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    g.genPromptsEl = null;
    g.genVideosEl  = null;
    g.nodeEls.delete('cg-gen-prompts');
    g.nodeEls.delete('cg-gen-videos');
    g.promptNodeEls.forEach(el => { if (el && el.parentNode) el.parentNode.removeChild(el); });
    g.promptNodeEls.clear();
    return;
  }

  renderGenPromptsCard();
  renderPromptNodes();
  renderGenVideosCard();
}
```

**Three callsites of `renderLaunchNode` to update:**

1. `renderAll()` (~line 1461) — replace `renderLaunchNode()` with `renderPipelineCards()`.

2. `notifyVideoReady()` (line 3408) — replace `renderLaunchNode()` with `renderAll()`.
   Rationale: `notifyVideoReady` fires after each video completes; calling `renderAll()` ensures
   VID nodes are updated (not just pipeline cards). The existing direct `updateVidNode` call on
   lines 3403–3406 can be kept as an optimisation but `renderAll()` is the safety net.

3. `setVideoPhase()` (line 3417) — replace `renderLaunchNode()` with `renderAll()`.
   Rationale: phase transitions (idle→filling→ready→running→done) gate VID node creation in
   `renderNodes()`. Calling only `renderPipelineCards()` would update the singleton cards but
   never create or prune VID placeholder nodes. `renderAll()` fixes this.

---

## 11 — Gate VID nodes by phase in `renderNodes()`

In the `if (g.mode === 'animated')` block inside `renderNodes()` (line ~1435), wrap the VID node
block in a phase check:

```js
if (g.mode === 'animated') {
  const vidsVisible = g.videoPhase === 'running' || g.videoPhase === 'done';
  if (vidsVisible) {
    const list = (scene.videoInstances || []).filter(v => v.sourceImageInstanceId === activeImg.id);
    const renderVid = list.find(v => v.isRenderActive) || list[0];
    if (renderVid) {
      const vidNode = ensureNode(renderVid.id, 'vid', () => buildVidNode());
      const vpos = renderVid.canvasPosition || { x: COL_VID, y: scene._innerTop ?? TOP_PAD };
      placeNode(vidNode, vpos.x, vpos.y);
      updateVidNode(vidNode, scene, sceneIdx, activeSb, activeImg, renderVid);
    }
    ensureVidVariantTray(scene, sceneIdx, activeSb, activeImg);
  } else {
    // Prune any stale VID nodes from a previous run
    (scene.videoInstances || []).forEach(v => {
      const existing = g.nodeEls.get(v.id);
      if (existing) {
        if (existing.el && existing.el.parentNode) existing.el.parentNode.removeChild(existing.el);
        g.nodeEls.delete(v.id);
      }
    });
  }
}
```

---

## 12 — Gate Final node by phase in `renderFinalNode()`

In `renderFinalNode()`, add a phase check at the top for animated mode:

```js
function renderFinalNode() {
  // In animated mode the Final node only appears once all videos are done
  if (g.mode === 'animated' && g.videoPhase !== 'done') {
    if (g.finalEl && g.finalEl.parentNode) g.finalEl.parentNode.removeChild(g.finalEl);
    g.finalEl = null;
    g.nodeEls.delete('cg-final');
    return;
  }
  // ... existing renderFinalNode body unchanged ...
}
```

---

## 13 — Extend `nodeRect()` for new node IDs

`nodeRect` (line 1479) is the lookup used by `drawCurve` to get node positions. It only knows about
`'cg-launch'`, `'cg-narrator-setup'`, `'cg-bible'`, `'cg-final'`, and instance IDs (sb/img/vid).
Without new cases, every curve to/from `'cg-gen-prompts'`, `'cg-gen-videos'`, or `'prompt-*'` will
return null and be silently skipped (line 1557: `if (!a || !b) return`). **No curves will draw.**

Add these cases to `nodeRect` immediately before the `findInstance(id)` fallback (~line 1499):

```js
if (id === 'cg-gen-prompts' && g.genPromptsEl) {
  const midY = g.chromeMidY || TOP_PAD;
  return { x: COL_LAUNCH, y: midY - GEN_CARD_H / 2, w: GEN_CARD_W, h: GEN_CARD_H };
}
if (id === 'cg-gen-videos' && g.genVideosEl) {
  const midY = g.chromeMidY || TOP_PAD;
  return { x: COL_VID, y: midY - GEN_CARD_H / 2, w: GEN_CARD_W, h: GEN_CARD_H };
}
if (id && id.startsWith('prompt-')) {
  const scene = (g.sortedScenes || []).find(s => ('prompt-' + s.id) === id);
  if (scene) return { x: COL_LAUNCH, y: scene._innerTop ?? TOP_PAD, w: PROMPT_W, h: PROMPT_H };
}
```

---

## 14 — Update `pruneStaleNodes()` for new node IDs

`pruneStaleNodes` (line 988) maintains a hardcoded valid set. Any ID in `g.nodeEls` not in the set
is removed from the DOM and from `g.nodeEls`. Because `renderNodes()` (which calls `pruneStaleNodes`)
runs BEFORE `renderPipelineCards()` in `renderAll()`, the sequence every render cycle would be:

1. `renderPipelineCards()` creates `'cg-gen-prompts'` / prompt nodes, adds to `g.nodeEls`
2. Next `renderAll()` → `renderNodes()` → `pruneStaleNodes()` deletes them (not in valid set)
3. `renderPipelineCards()` re-creates them, wires **another** click listener
4. Repeat → DOM thrash + accumulating duplicate click handlers

Replace the static `valid` set construction in `pruneStaleNodes` with phase-aware logic:

```js
function pruneStaleNodes() {
  const phase = g.videoPhase || 'idle';
  // Chrome singletons (cg-launch is gone — replaced by gen-prompts/gen-videos)
  const valid = new Set(['cg-bgm', 'cg-sub', 'cg-final',
                         'cg-narrator-setup', 'cg-bible']);

  // Pipeline cards — only valid when their phase is active
  if (phase === 'idle')  valid.add('cg-gen-prompts');
  if (phase === 'ready') valid.add('cg-gen-videos');

  // Prompt nodes — valid in all non-idle phases
  if (phase !== 'idle') {
    (g.scenes || []).forEach(scene => valid.add('prompt-' + scene.id));
  }

  // Per-scene instance nodes (sb, img, vid — existing logic unchanged)
  (g.scenes || []).forEach(scene => {
    (scene.storyboardInstances || []).forEach(sb => {
      if (sb.isActive) valid.add(sb.id);
      (sb.imageInstances || []).forEach(im => {
        if (sb.isActive && im.isRenderActive) valid.add(im.id);
      });
    });
    if (g.mode === 'animated') {
      const activeSb = (scene.storyboardInstances || []).find(s => s.isActive);
      const activeImg = activeSb && (activeSb.imageInstances || []).find(i => i.isRenderActive);
      if (activeImg) {
        const list = (scene.videoInstances || []).filter(v => v.sourceImageInstanceId === activeImg.id);
        const ra = list.find(v => v.isRenderActive) || list[0];
        if (ra) valid.add(ra.id);
      }
    }
  });

  const toRemove = [];
  g.nodeEls.forEach((entry, id) => { if (!valid.has(id)) toRemove.push(id); });
  toRemove.forEach(id => {
    const entry = g.nodeEls.get(id);
    if (entry && entry.el && entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    g.nodeEls.delete(id);
  });
}
```

Note: `'cg-launch'` is removed from the valid set — that node no longer exists.

---

## 15 — Rewrite animated curves in `redrawCurves()`

Replace the `if (g.mode === 'animated')` block (lines 1587–1599) with:

```js
if (g.mode === 'animated') {
  const phase = g.videoPhase || 'idle';

  if (phase === 'idle') {
    // All generated images → Gen Prompts card (no isActive/star gate — user said "all images connect")
    if (g.genPromptsEl && activeImg.status === 'done') {
      drawCurve(activeImg.id, 'cg-gen-prompts', 'image', 'done');
    }

  } else {
    // filling / ready / running / done:
    // IMG → Prompt Node (per scene)
    const promptNodeId = 'prompt-' + scene.id;
    if (g.promptNodeEls.has(promptNodeId)) {
      drawCurve(activeImg.id, promptNodeId, 'image', activeImg.status);
    }

    if (phase === 'ready') {
      // Prompt Node → Gen Videos card
      if (g.genVideosEl && g.promptNodeEls.has(promptNodeId)) {
        drawCurve(promptNodeId, 'cg-gen-videos', 'video', 'done');
      }
    }

    if (phase === 'running' || phase === 'done') {
      // Prompt Node → VID
      const list = (scene.videoInstances || []).filter(v => v.sourceImageInstanceId === activeImg.id);
      const renderVid = list.find(v => v.isRenderActive) || list[0];
      if (renderVid) {
        drawCurve(promptNodeId, renderVid.id, 'video', renderVid.status);
        if (phase === 'done') {
          // VID → Final
          drawCurve(renderVid.id, 'cg-final', 'final', renderVid.status);
        }
      }
    }
  }
}
```

---

## 16 — Add `notifyPromptReady(sceneIdx)` to public API

Add after `notifyVideoReady` (~line 3412). Use `g.scenes[sceneIdx]` (not `g.sortedScenes`) to
match the index that comes from `createScenes.indexOf(scene)` in `cgFillVideoPrompts` — the two
arrays are the same reference; `g.sortedScenes` may be in a different order.

```js
function notifyPromptReady(sceneIdx) {
  if (!g) return;
  const scene = (g.scenes || [])[sceneIdx];   // ← g.scenes, NOT g.sortedScenes
  if (!scene) return;

  // Get the render-active vid instance
  const activeSb = (scene.storyboardInstances || []).find(s => s.isActive)
                || (scene.storyboardInstances || [])[0];
  const activeImg = activeSb && ((activeSb.imageInstances || []).find(i => i.isRenderActive)
                 || (activeSb.imageInstances || [])[0]);
  const list = (scene.videoInstances || []).filter(v =>
    activeImg ? v.sourceImageInstanceId === activeImg.id : true
  );
  const vid = list.find(v => v.isRenderActive) || list[0];

  const el = g.promptNodeEls.get('prompt-' + scene.id);
  if (el) updatePromptNode(el, scene, vid);

  redrawCurves(); // curves update as each prompt fills
}
```

Expose on the public API object at the bottom of the file (~line 3649):
```js
notifyPromptReady,
```

---

## 17 — `cgFillVideoPrompts` — notify canvas per scene

In `js/17c-create-pipeline.js`, inside `cgFillVideoPrompts`, after storing prompts on `vid` for
each scene, add:

```js
if (typeof CanvasGraph !== 'undefined' && CanvasGraph.notifyPromptReady) {
  CanvasGraph.notifyPromptReady(createScenes.indexOf(scene));
}
```

Note: `sceneIdx` does not exist in this closure — the loop variable is `scene`, so we compute the
index via `createScenes.indexOf(scene)`. Do NOT write `sceneIdx`.

---

## 18 — `cgLaunchVideoAgent` — fix clips bridge bug

In `js/17c-create-pipeline.js`, inside `cgLaunchVideoAgent`, after `await animateScenes([scene], ...)`,
before `CanvasState.syncMirrorFields(...)`:

```js
// animateScenes writes to scene.videoClips (flat). Bridge to vid.clips so syncMirrorFields reads them.
if (Array.isArray(scene.videoClips) && scene.videoClips.length && vid) {
  vid.clips = scene.videoClips.map(c => ({
    url:          c.url,
    clipDuration: c.clipDuration || c.duration || 0,
  }));
  vid.status = 'done';
}
if (typeof CanvasState !== 'undefined') CanvasState.syncMirrorFields(scene, createVideoMode);
```

---

## 19 — `cgLaunchVideoAgent` — ensure videoInstance exists per scene

Before the `animateScenes` call, guard against scenes with no videoInstance yet:

```js
if (!vid && typeof CanvasState !== 'undefined' && activeSb) {
  const srcImg = (activeSb.imageInstances || []).find(i => i.isRenderActive)
              || (activeSb.imageInstances || [])[0];
  vid = CanvasState.addVideoInstance(scene, srcImg?.id, {});
  vid.isRenderActive = true;
}
```

---

## 20 — `syncMirrorFields` — defensive fallback (js/27-canvas-state.js)

In `syncMirrorFields`, animated mode path, after the `vid.clips[0]?.url` read:

```js
// If vid.clips empty but flat videoClips populated (legacy bridge), fall back to flat
if (!scene.videoUrl && !vid?.clips?.length && Array.isArray(scene.videoClips) && scene.videoClips[0]?.url) {
  scene.videoUrl = scene.videoClips[0].url;
}
```

---

## 21 — CSS additions (css/canvas-graph.css)

```css
/* Prompt node body */
.cg-prompt-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
}

.cg-prompt-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 11px;
  line-height: 1.4;
}

.cg-prompt-label {
  flex: 0 0 74px;
  color: var(--lp-faint);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding-top: 1px;
}

.cg-prompt-val {
  flex: 1;
  color: var(--lp-text);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cg-prompt-val--empty {
  color: var(--lp-faint);
}

/* Filling spinner on prompt node header */
.cg-prompt-hdr--filling::after {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--lp-faint);
  border-top-color: var(--lp-accent);
  border-radius: 50%;
  animation: cg-spin 0.7s linear infinite;
  margin-left: 8px;
  vertical-align: middle;
}
```

---

## 22 — Phase initialization on mount

After `runLayout()` inside `mount()`, infer the correct starting phase from existing data so
returning to a project with videos shows the right canvas state:

```js
// Infer videoPhase from existing scene data (runs once on mount)
if (g.mode === 'animated') {
  const allDone    = (g.scenes || []).every(s => s.videoUrl);
  const someDone   = (g.scenes || []).some(s => s.videoUrl);
  const allPrompts = (g.scenes || []).every(s =>
    (s.videoInstances || []).some(v => v.cameraPrompt)
  );
  g.videoPhase = allDone ? 'done' : someDone ? 'running' : allPrompts ? 'ready' : 'idle';
}
```

Without this, a project with completed videos would open at phase=idle and show the
Gen Prompts card with no VID nodes — even though all generation is already done.

---

## 23 — Execution order

1. Constants + state fields (§3, §4)
2. `buildPromptNode` (§5)
3. `updatePromptNode` (§6)
4. `renderGenPromptsCard` (§7)
5. `renderGenVideosCard` (§8)
6. `renderPromptNodes` (§9)
7. `renderPipelineCards` + update all 3 callsites of `renderLaunchNode` (§10)
8. Gate VID nodes in `renderNodes` (§11)
9. Gate Final node in `renderFinalNode` (§12)
10. Extend `nodeRect` for new node IDs (§13) ← curves won't draw without this
11. Update `pruneStaleNodes` (§14) ← nodes deleted each frame without this
12. Rewrite animated curves in `redrawCurves` (§15)
13. `notifyPromptReady` public API (§16)
14. CSS additions (§21)
15. Phase initialization on mount (§22)
16. Pipeline: `cgFillVideoPrompts` notify with `createScenes.indexOf(scene)` (§17)
17. Pipeline: clips bridge fix in `cgLaunchVideoAgent` (§18)
18. Pipeline: ensure videoInstance exists (§19)
19. `syncMirrorFields` fallback (§20)
20. `node build.js`

---

## 24 — What does NOT change

- `CanvasState.addVideoInstance`, `migrateScene` — untouched
- SB / IMG node rendering — untouched
- BGM / Subtitle / NarratorSetup / Bible nodes — untouched
- Right-pane Properties panel — untouched
- `animateScenes` in `js/21-kling.js` — untouched
- Illustrated mode — untouched (all new code is gated by `g.mode === 'animated'`)

---

## 25 — Acceptance criteria

- [ ] Canvas in animated mode, phase=idle: Gen Video Prompts card shown at COL_LAUNCH centered; ⭐ images draw curves to it; no VID nodes; no Final node.
- [ ] Click Gen Video Prompts: card disappears; per-scene Prompt nodes appear at COL_LAUNCH per row; prompts fill in one by one; `notifyPromptReady` updates each node live.
- [ ] After all prompts filled, phase=ready: Prompt nodes stable; Generate Videos card appears at COL_VID centered; curves from each Prompt node to card.
- [ ] Click Generate Videos: Gen Videos card disappears; VID placeholder nodes appear at COL_VID per row; curves from Prompt Node → VID.
- [ ] Each VID node fills as Kling returns a URL; `notifyVideoReady` updates node.
- [ ] Phase=done: all VID nodes filled; Final node appears; VID→Final curves drawn.
- [ ] Illustrated mode: unchanged — none of the new nodes appear.
- [ ] `node build.js` succeeds with no errors.

---

## 26 — GAP: Singleton Preview Player (image + audio stitch) — NOT YET IMPLEMENTED

> **Status: planned, not built.** This section documents a requirement that was in the product intent but never captured in any prior plan doc. Must be implemented before the pipeline is considered complete.

### Requirement

Before the user hits **Gen Video Prompts** (animated mode) or **Final render** (illustrated mode), there must be **one single preview player** on the canvas that stitches all scenes together and plays them as a continuous video — each scene's image plays with its Ken Burns motion for the scene duration, with narration audio (`scene._audioUrl`) running in sync. The player shows a scene strip so the user can see and scrub across all scenes at once.

This is a **singleton node** — not per-scene. All IMG nodes connect into it; it connects out to the Gen Prompts card (animated) or Final (illustrated).

### Canvas flow

```
animated idle:   [IMG 1] ──┐
                 [IMG 2] ──▶ [◀▶ Preview Player] ──▶ [Gen Video Prompts card]
                 [IMG 3] ──┘

illustrated:     [IMG 1] ──┐
                 [IMG 2] ──▶ [◀▶ Preview Player] ──▶ [Final]
                 [IMG 3] ──┘
```

The Preview Player node sits at `COL_PREV`, vertically centered across all scene rows (like Gen Prompts card). All per-scene IMG nodes draw a curve into its single in-socket.

---

## 27 — Column layout update (new COL_PREV)

A new constant `COL_PREV` must be added and all downstream columns shifted right to make room.

**Current layout:**
```
COL_IMG=860  →  COL_LAUNCH=1640  →  COL_VID=2100  →  COL_FINAL_ANIM=3180
                                                       COL_FINAL_ILL=1940
```

**New layout (preview player at 1640, downstream shifted +580):**
```
COL_IMG=860  →  COL_PREV=1640  →  COL_LAUNCH=2220  →  COL_VID=2700  →  COL_FINAL_ANIM=3780
                                                        COL_FINAL_ILL=2520
```

Preview player node width = `PREV_W = 480` (same as NODE_W, wide enough for a clear 16:9 canvas).
Preview player node height = auto (16:9 canvas + scene strip + controls ≈ 400px).

The player is a **singleton** — vertically centered at `g.chromeMidY` like the Gen Prompts card.

**Files to update when shifting columns:**
- `js/29-canvas-render.js` — all `COL_LAUNCH`, `COL_VID`, `COL_FINAL_ANIM`, `COL_FINAL_ILL` constants and usages.
- No API or pipeline files reference column positions.

---

## 28 — New state field: previewEl

Add to `freshGraphState()` alongside `genPromptsEl`:

```js
previewEl: null,   // singleton Preview Player node DOM el
```

---

## 29 — New function: `buildPreviewPlayer()`

Builds the singleton preview player shell. Contains:
- A `<canvas>` element (`data-role="prev-canvas"`) where the current scene's Ken Burns renders
- A scene strip (`data-role="prev-strip"`) — one colored segment per scene, clickable to jump
- Play/pause button, global progress bar spanning total duration, time counter
- In-socket (image) receiving curves from all IMG nodes; out-socket (image) sending to Gen Prompts / Final

```js
function buildPreviewPlayer() {
  const node = el('div', 'cg-node cg-node--preview cg-drag-handle');
  node.style.width = PREV_W + 'px';

  node.appendChild(el('span', 'cg-sock cg-sock--in cg-sock--image'));
  node.appendChild(el('span', 'cg-sock cg-sock--out cg-sock--image'));

  const head = el('div', 'cg-node-head');
  head.innerHTML =
    '<span class="cg-head-dot" style="background:var(--sock-image)"></span>' +
    '<span class="cg-node-title">Preview</span>' +
    '<span class="cg-prev-meta" data-role="prev-meta">0 scenes · 0s</span>';
  node.appendChild(head);

  const body = el('div', 'cg-node-body cg-prev-body');
  body.innerHTML =
    // 16:9 canvas area
    '<div class="cg-prev-canvas-wrap">' +
      '<canvas class="cg-prev-canvas" data-role="prev-canvas"></canvas>' +
      '<div class="cg-prev-canvas-empty" data-role="prev-empty">No images yet</div>' +
    '</div>' +
    // Scene strip — one pill per scene
    '<div class="cg-prev-strip" data-role="prev-strip"></div>' +
    // Controls row
    '<div class="cg-prev-controls">' +
      '<button type="button" class="cg-prev-play" data-role="prev-play" title="Play all scenes">▶</button>' +
      '<div class="cg-prev-track" data-role="prev-track">' +
        '<div class="cg-prev-fill" data-role="prev-fill"></div>' +
        '<div class="cg-prev-thumb" data-role="prev-thumb"></div>' +
      '</div>' +
      '<span class="cg-prev-time" data-role="prev-time">0:00 / 0:00</span>' +
    '</div>';
  node.appendChild(body);

  return node;
}
```

---

## 30 — New function: `updatePreviewPlayer(node)`

Called by `renderPreviewPlayer()` each render cycle. Rebuilds the scene strip and updates metadata. Does NOT touch active playback state.

```js
function updatePreviewPlayer(node) {
  if (!node) return;
  const scenes = g.sortedScenes || [];
  const totalDur = scenes.reduce((s, sc) => s + ((sc.endTime||0)-(sc.startTime||0)), 0);

  // Meta label
  const meta = node.querySelector('[data-role="prev-meta"]');
  if (meta) meta.textContent = scenes.length + ' scene' + (scenes.length!==1?'s':'') + ' · ' + totalDur.toFixed(1) + 's';

  // Scene strip — rebuild only when scene count changes (avoid thrash during playback)
  const strip = node.querySelector('[data-role="prev-strip"]');
  if (strip && strip.children.length !== scenes.length) {
    strip.innerHTML = '';
    scenes.forEach(function(scene, i) {
      const activeSb  = (scene.storyboardInstances||[]).find(s=>s.isActive)||(scene.storyboardInstances||[])[0];
      const activeImg = activeSb && ((activeSb.imageInstances||[]).find(im=>im.isRenderActive)||(activeSb.imageInstances||[])[0]);
      const dur = (scene.endTime||0) - (scene.startTime||0);
      const pct = totalDur > 0 ? (dur / totalDur * 100).toFixed(1) + '%' : (100/scenes.length).toFixed(1) + '%';
      const seg = el('div', 'cg-prev-seg' + (activeImg && activeImg.imgDataUrl ? '' : ' cg-prev-seg--empty'));
      seg.style.width = pct;
      seg.dataset.sceneIdx = i;
      if (activeImg && activeImg.imgDataUrl) {
        seg.style.backgroundImage = 'url("' + activeImg.imgDataUrl + '")';
      }
      seg.title = 'Scene ' + (i+1) + ' · ' + dur.toFixed(1) + 's';
      strip.appendChild(seg);
    });
  }

  // Show/hide empty overlay
  const hasAny = scenes.some(function(sc) {
    const sb = (sc.storyboardInstances||[]).find(s=>s.isActive)||(sc.storyboardInstances||[])[0];
    const img = sb && ((sb.imageInstances||[]).find(i=>i.isRenderActive)||(sb.imageInstances||[])[0]);
    return !!(img && img.imgDataUrl);
  });
  const emptyEl = node.querySelector('[data-role="prev-empty"]');
  if (emptyEl) emptyEl.style.display = hasAny ? 'none' : '';
}
```

---

## 31 — New function: `renderPreviewPlayer()`

Places the singleton at `COL_PREV`, vertically centered.

```js
function renderPreviewPlayer() {
  if (!g.previewEl || !g.previewEl.isConnected) {
    const node = buildPreviewPlayer();
    node.dataset.id   = 'cg-preview';
    node.dataset.type = 'preview';
    g.graphLayerEl.appendChild(node);
    g.nodeEls.set('cg-preview', { el: node, type: 'preview' });
    g.previewEl = node;
  }
  updatePreviewPlayer(g.previewEl);
  const midY = g.chromeMidY || TOP_PAD;
  placeNode(g.previewEl, COL_PREV, midY - PREV_H / 2);
}
```

Call `renderPreviewPlayer()` inside `renderAll()`.

---

## 32 — Playback engine

The click handler in `attachEvents` handles three interactions on the preview player:

**1. Play/pause (`.cg-prev-play`):**

Build a `_cgPreviewState` object on first play:
```js
{
  scenes:    g.sortedScenes,     // snapshot at play time
  segPlan:   [{ sceneIdx, startT, endT, imgEl, kbPath }],  // pre-computed per scene
  totalDur:  number,
  currentT:  0,                  // seconds into total playback
  raf:       null,
  audio:     null,               // Web Audio or HTMLAudio stitched track
}
```

On each RAF tick:
- Find which segment `currentT` falls in
- Compute `t` within that segment (0→1)
- Call `drawKenBurnsFrame(ctx, seg.imgEl, seg.kbPath, t, W, H)`
- Highlight active scene strip segment
- Advance fill bar and time counter

**2. Seek (click on `.cg-prev-track`):**
- Compute ratio from click X, set `_cgPreviewState.currentT = ratio * totalDur`
- If playing, update audio position; if paused, draw the correct frame immediately

**3. Scene strip click (`.cg-prev-seg`):**
- Jump to start of that scene (seek to `scene.startTime`)

**Audio stitching:**
- Since each scene has its own `scene._audioUrl`, use the Web Audio API `AudioContext` to schedule clips in sequence (one `AudioBufferSourceNode` per scene offset by `scene.startTime`). Fall back to sequential `HTMLAudioElement` swaps if Web Audio unavailable.
- Audio is entirely optional — player works visually even with no audio.

**Image pre-loading:**
- On first play, load all `activeImg.imgDataUrl` values into `Image` objects and cache on `_cgPreviewState.segPlan`. Call `_cgStopAudio()` to stop any audio bar that is playing.

---

## 33 — pruneStaleNodes update

Add `'cg-preview'` to the static valid set (singleton, always valid):

```js
const valid = new Set(['cg-bgm', 'cg-sub', 'cg-final',
                       'cg-narrator-setup', 'cg-bible', 'cg-preview']);
```

---

## 34 — nodeRect update

Add a case for `'cg-preview'` before the `findInstance` fallback in `nodeRect()`:

```js
if (id === 'cg-preview' && g.previewEl) {
  const midY = g.chromeMidY || TOP_PAD;
  return { x: COL_PREV, y: midY - PREV_H / 2, w: PREV_W, h: PREV_H };
}
```

---

## 35 — Curves update

In `redrawCurves()`, all IMG nodes draw a curve to `'cg-preview'` (not per-scene prompt nodes or Gen Prompts directly). Preview connects out to the downstream card:

**Animated mode:**
```
idle:     IMG ──▶ cg-preview ──▶ cg-gen-prompts
filling+: IMG ──▶ cg-preview ──▶ prompt-{id}    (per scene)
ready:    IMG ──▶ cg-preview ──▶ prompt-{id} ──▶ cg-gen-videos
running:  IMG ──▶ cg-preview ──▶ prompt-{id} ──▶ VID
done:     IMG ──▶ cg-preview ──▶ prompt-{id} ──▶ VID ──▶ cg-final
```

**Illustrated mode:**
```
IMG ──▶ cg-preview ──▶ cg-final
```

All `IMG → cg-preview` curves use socket type `'image'`. The single in-socket on the preview node visually fans in all scene curves.

---

## 36 — CSS additions for preview player node

```css
#create-canvas-step .cg-node--preview {
  overflow: visible;
}

#create-canvas-step .cg-prev-body {
  padding: 0;
  display: flex;
  flex-direction: column;
}

/* 16:9 canvas area */
#create-canvas-step .cg-prev-canvas-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  background: #050814;
  overflow: hidden;
}
#create-canvas-step .cg-prev-canvas {
  width: 100%; height: 100%;
  display: block;
}
#create-canvas-step .cg-prev-canvas-empty {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted, var(--lp-faint));
  font-size: 12px;
  background: linear-gradient(135deg, var(--lp-bg2, #0c1220) 0%, var(--lp-bg, #050814) 100%);
}

/* Scene strip */
#create-canvas-step .cg-prev-strip {
  display: flex;
  height: 36px;
  gap: 2px;
  padding: 4px 10px;
  background: rgba(0,0,0,0.3);
  border-bottom: 1px solid var(--border, var(--lp-card-bdr));
}
#create-canvas-step .cg-prev-seg {
  flex-shrink: 0;
  border-radius: 3px;
  background-color: var(--lp-card-bdr);
  background-size: cover;
  background-position: center;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s;
  height: 100%;
}
#create-canvas-step .cg-prev-seg:hover,
#create-canvas-step .cg-prev-seg--active { opacity: 1; outline: 2px solid var(--accent, var(--lp-accent)); }
#create-canvas-step .cg-prev-seg--empty  { background-color: var(--lp-faint); opacity: 0.3; }

/* Controls row */
#create-canvas-step .cg-prev-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
}
#create-canvas-step .cg-prev-play {
  flex-shrink: 0;
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--accent, var(--lp-accent));
  border: 0; color: #fff;
  font-size: 11px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
#create-canvas-step .cg-prev-play:hover { opacity: 0.85; }

#create-canvas-step .cg-prev-track {
  flex: 1; height: 5px;
  background: var(--border, var(--lp-card-bdr));
  border-radius: 3px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
}
#create-canvas-step .cg-prev-fill {
  height: 100%;
  width: 0%;
  background: var(--accent, var(--lp-accent));
  border-radius: 3px;
}
#create-canvas-step .cg-prev-time {
  font-size: 10px;
  color: var(--text-muted, var(--lp-faint));
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
#create-canvas-step .cg-prev-meta {
  font-size: 10px;
  color: var(--text-muted, var(--lp-faint));
  margin-left: auto;
}
```

---

## 37 — Acceptance criteria (preview player)

- [ ] One singleton Preview Player node appears at `COL_PREV`, vertically centered, in both animated and illustrated modes.
- [ ] Scene strip shows one thumbnail segment per scene, sized proportionally to scene duration; empty scenes show a grey placeholder.
- [ ] Clicking play stitches all scenes: Ken Burns animation runs on each scene's image in order, transitions to next scene at correct time boundary.
- [ ] Global progress bar and time counter (`0:00 / 0:12`) advance continuously across all scenes.
- [ ] Clicking on the progress bar seeks to that position across the full stitched timeline.
- [ ] Clicking a scene strip segment jumps playback to the start of that scene.
- [ ] Audio plays in sync when `scene._audioUrl` is available; player works visually when audio is absent.
- [ ] Pausing stops both animation and audio; resuming continues from the same position.
- [ ] All IMG nodes draw curves into the single in-socket of the Preview Player.
- [ ] Curves from Preview Player connect to Gen Prompts card (animated idle) or Final (illustrated).
- [ ] Column shift does not break any existing node positions or curve routing.
- [ ] `node build.js` succeeds with no errors.
