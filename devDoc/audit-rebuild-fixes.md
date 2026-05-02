**Protocol for implementation:** ONE GATE only — user reviews & approves this plan, then the auditor agent implements ALL fixes autonomously in a single pass. No manual intervention mid-cycle. **No commits are made.**

**Per-fix automated verification (runs on every fix):**
1. Read old region; confirm old_string matches byte-for-byte
2. Apply Edit
3. Read new region; confirm new_string landed
4. git diff + git diff --stat (pasted into report; must match expected)
5. Scope check (no forbidden line ranges touched)
6. Fix-specific grep checks
7. Report ✅ verified if clean; HALT if any check fails

**Changes remain unstaged in the working tree.** After the cycle finishes, the user reviews `git diff`, runs the post-impl smoke tests, and stages/commits manually.

**Post-implementation smoke-tests** (flagged per-fix as [post-impl smoke tests]) are aggregated into the final report and run by the user after the full cycle. If any fails, discard that fix with `git checkout -- <file>`.

---

## Part 1 — Verification of input findings

| # | Original claim | Verdict | Revised severity |
|---|---------------|---------|-----------------|
| 1 | Layout stacks vertically (bug report #1 + #3) | ✅ Real — `runLayout` sets `bandH` with `BAND_PAD*2 + max(SB_H, imgTrayH, vidTrayH)` and increments `curY` per scene, so each scene's SB/IMG/VID are at the same Y (`innerTop`) but different scenes stack **vertically** as intended. However the user sees everything in a narrow left column because **CSS sets `cg-node--sb`, `cg-node--img`, `cg-node--vid` widths to `300px`** (css:213–215, css:273–276) which overrides the JS `node.style.width = NODE_W + 'px'` (520px). The inline style never wins because the CSS rule has higher specificity (`#create-canvas-step .cg-node--sb { width: 300px }`). All three card types collapse to 300px, and their column constants (COL_SB=80, COL_IMG=480) still work — but at 300px each card nearly fills the screen before the next column, and the layout looks like a cramped single-column stack. Root cause: CSS `width:300px` rules conflict with the JS `NODE_W=520` constant. | P0 |
| 2 | Overlapping nodes — BGM/Sub/Final/Launch jumbled at same Y | ✅ Real — `renderBgmNode`, `renderSubtitleNode`, `renderFinalNode` all fall back to `{ x: COL_BGM_ANIM, y: TOP_PAD }` (line 980), `{ x: COL_SUB_ANIM, y: TOP_PAD }` (line 1030), `{ x: COL_FINAL_ANIM, y: TOP_PAD }` (line 1062) when their `window.create*Position` global is null AND `runLayout` computed a `midY`. The bug: `runLayout` only assigns those positions when the global is null/absent AND the `midY` branch runs, but the chrome render functions use their own fallback `y: TOP_PAD` instead of `midY`. If the global was never null-checked before the render function was called (i.e. first mount with no saved positions), `runLayout` sets the globals correctly. But on `renderAll` calls that happen after `runLayout` was already called on a prior `refresh()`, the globals are already set — this path is fine. The core overlap issue is caused by all three chrome nodes being placed at the same `TOP_PAD` Y value via the fallback, which only occurs if `runLayout` didn't run or `midY` was zero. Verified: the fallback `{ x: COL_BGM_ANIM, y: TOP_PAD }` is wrong — it should use the computed `midY`, but `midY` is local to `runLayout` and not stored on `g`. | P1 |
| 3 | Zoom stops working after some time | ✅ Real — `attachEvents` registers `mouseover` and `mouseout` handlers on `g.wrapperEl` **directly** (lines 1707, 1715) without saving references to `g.onMouseOver`/`g.onMouseOut`. `detachEvents` (lines 1799–1812) removes only the named handlers stored on `g`. These two anonymous hover-dim handlers are never removed on unmount. On remount they are registered again. After N remounts there are N overlapping `mouseover`/`mouseout` listeners; each triggers `redrawCurves()`. The `redrawCurves` cost escalates quadratically; after ~3–4 remounts the wheel handler fires `handleZoom` → `applyTransform` → `cgUpdateSelToolbar` but the many concurrent `redrawCurves` calls queued by the stale listeners make the UI appear frozen/unresponsive. | P1 |
| 4 | Tons of empty whitespace right side | ✅ Real — caused by the same CSS width issue as finding #1 plus the `cg-right-pane` (280px) taking up permanent right-side space even when not collapsed (`cg-right-pane` has no `hidden` attribute by default). At NODE_W=520 cards the viewport would naturally be used. At actual-rendered 300px cards with a 280px right pane and 232px left agent panel the usable canvas is squeezed to ~`viewport - 512px`. | P1 (downstream of Fix A) |
| 5 | SB tabs A/B/+ missing when only 1 SB | ❌ False positive — `updateSBNode` line 473 always renders tabs: `sbs.map(...)` produces one tab even for a single SB, plus the `+` button. When `sbs.length === 1` the tab strip has `[A][+]`. This is correct per spec ("one tab per storyboardInstance"). Not a bug. |  — |
| 6 | Selection toolbar doesn't follow card on drag | ✅ Real — `cgUpdateSelToolbar` at line 2013 positions using `r.x + r.w / 2`, and `r.w` is `NODE_W` (520). But the card DOM has `width:300px` from CSS. `nodeRect` returns `w: NODE_W` (520) which disagrees with actual render width. Toolbar appears offset to the right by ~110px during drag. Root cause same as Fix A. Resolving Fix A also resolves toolbar alignment. | P1 (downstream of Fix A) |
| 7 | IMG variant tray + thumb strip — does it render | ✅ Real but conditional — it renders only when `sb.imageInstances.length >= 1`. The tray shows even with 0 images (ensureImgVariantTray calls even when `activeImg` is undefined via the `else` branch at line 1107). However the `pointer-events: none` on `.cg-variant-tray` (css:369) prevents click-through to the thumbs. The thumb strip itself has `pointer-events: auto` (css:394) so thumbs are still clickable. Not a blocking miss. | P3 (already fine) |
| 8 | Hover dim causes redrawCurves on every mouseover event | ✅ Real — the guard `if (g.hoveredNodeId !== nodeEl.dataset.id)` at line 1710 only short-circuits if entering the same node. Every entry to a new node fires `redrawCurves()` synchronously. This is by design but stacks with the leak in finding #3. On first mount it is P3; on remount it becomes P1. | P3 on fresh mount, P1 on remount (addressed by Fix C) |

---

## Part 2 — Second-pass findings

| # | File:line | Class | Excerpt | Severity | Verified? |
|---|-----------|-------|---------|----------|-----------|
| S1 | `css/canvas-graph.css:213–215` | Type/shape mismatch | `cg-node--sb { width: 300px }` overrides JS `NODE_W=520` inline style | P0 | yes |
| S2 | `css/canvas-graph.css:273–276` | Same | `cg-node--img, cg-node--vid { width: 300px }` | P0 | yes |
| S3 | `js/29-canvas-render.js:980` | Wrong fallback Y | BGM fallback `y: TOP_PAD` should use `midY` (stored on `g`) | P1 | yes |
| S4 | `js/29-canvas-render.js:1030` | Wrong fallback Y | Sub fallback `y: TOP_PAD` should use `midY` | P1 | yes |
| S5 | `js/29-canvas-render.js:1062` | Wrong fallback Y | Final fallback `y: TOP_PAD` should use `midY` | P1 | yes |
| S6 | `js/29-canvas-render.js:942` | Wrong fallback Y | Launch fallback `y: TOP_PAD` should use `midY` | P1 | yes |
| S7 | `js/29-canvas-render.js:1707–1723` | Resource leak | `mouseover`/`mouseout` hover handlers attached with no stored ref, never removed in `detachEvents` | P1 | yes |
| S8 | `js/29-canvas-render.js:265–266` | Missing state field | `runLayout` computes `midY` as a local variable but chrome render fallbacks need it; `g` has no `chromeMidY` field | P1 | yes |

---

## Part 3 — Surgical Fix Summary

| Step | Fix | File(s) | Lines touched | Risk |
|------|-----|---------|---------------|------|
| 1 | **Fix A** — Remove CSS width overrides on SB/IMG/VID nodes (let JS `NODE_W` inline style win) | `css/canvas-graph.css` | 213–215, 273–276 | Low — only removes hard-coded 300px overrides; JS already sets width correctly |
| 2 | **Fix B** — Store `midY` on `g` in `runLayout`; update chrome render fallback Y values to use `g.chromeMidY` | `js/29-canvas-render.js` | 90–156 (state init), 331–358 (runLayout chrome block), 942, 980, 1030, 1062 | Low — only adds one state field and threads it to 4 fallback literals |
| 3 | **Fix C** — Store hover handler refs on `g`; remove them in `detachEvents` | `js/29-canvas-render.js` | 90–156 (state init), 1706–1723 (attach), 1799–1812 (detach) | Low — pure listener lifecycle plumbing; no behavioral change on first mount |

---

## Part 4 — Exact Edits

---

#### Fix A — Remove CSS width overrides that squash NODE_W cards to 300px

**Fix A.1 — Remove SB node width override**

**old_string** (verbatim from `css/canvas-graph.css` lines 211–215):
```
/* ════ SECTION 5 — SB node specifics ═══════════════════════════════════ */

#create-canvas-step .cg-node--sb {
  width: 300px;
}
```

**new_string:**
```
/* ════ SECTION 5 — SB node specifics ═══════════════════════════════════ */

/* Width is set by JS via node.style.width = NODE_W + 'px' (520px).
   Do NOT add a CSS width here — it would override the inline style
   and collapse all cards to a fixed width regardless of NODE_W. */
```

#### Scope — must NOT touch
- All lines before 211 (Sections 1–4) — unchanged.
- All lines after 215 (textarea.cg-prompt onwards) — unchanged.
- No JS files touched.

---

**Fix A.2 — Remove IMG/VID node width override**

**old_string** (verbatim from `css/canvas-graph.css` lines 273–276):
```
#create-canvas-step .cg-node--img,
#create-canvas-step .cg-node--vid {
  width: 300px;
}
```

**new_string:**
```
/* IMG and VID node widths: set by JS via node.style.width = NODE_W + 'px'.
   No CSS width override here — same reason as cg-node--sb above. */
```

#### Scope — must NOT touch
- Lines 211–272 (Section 5 content) — unchanged.
- Lines 277+ (img/vid preview rules) — unchanged.
- No JS files touched.

#### Checkpoint A

**[automated]**
```bash
git diff -- css/canvas-graph.css
# Expect: two hunks — one removing width:300px from .cg-node--sb block,
#         one removing width:300px from .cg-node--img/.cg-node--vid block;
#         both replaced with comment lines.

git diff --stat -- css/canvas-graph.css
# Expect: 1 file changed, ~6 insertions(+), ~6 deletions(-)
```
Re-read lines 211–277 of `css/canvas-graph.css` and confirm:
- The string `width: 300px` no longer appears in lines 211–277.
- The section-5 comment banner is intact.
- The `.cg-img-preview` rule at (original) line 278 is untouched.

Grep checks:
- pattern `width: 300px` in `css/canvas-graph.css` → expect **zero** matches
- pattern `cg-node--sb` in `css/canvas-graph.css` → expect ≥ 1 match (the comment line we added)
- pattern `NODE_W` in `js/29-canvas-render.js` → expect ≥ 5 matches (unchanged)

**[post-impl smoke tests]**
1. Open the app in canvas mode with ≥ 1 scene (illustrated mode).
2. Each SB card should render at approximately 520px wide, not 300px.
3. IMG card should appear at approximately x=480 (right of SB, not overlapping).
4. Canvas should show a horizontal left-to-right flow: SB → IMG gap visible.
5. Right-side whitespace should be gone or greatly reduced vs before.

---

#### Fix B — Store chromeMidY on g so chrome render fallbacks use a sane Y

**Fix B.1 — Add `chromeMidY` field to freshGraphState**

**old_string** (verbatim from `js/29-canvas-render.js` lines 108–112):
```
    zoom: 1.0,
    panX: 0,
    panY: 0,
    graphW: 0,
    graphH: 0,
```

**new_string:**
```
    zoom: 1.0,
    panX: 0,
    panY: 0,
    graphW: 0,
    graphH: 0,
    chromeMidY: 0,          // Y centre for chrome nodes (Launch/BGM/Sub/Final); set by runLayout
```

#### Scope — must NOT touch
- Lines 88–107 (freshGraphState fields above zoom) — unchanged.
- Lines 113+ (selectedId onwards) — unchanged.
- CSS file untouched.

---

**Fix B.2 — Write chromeMidY in runLayout and remove mode-inconsistent BGM fallback**

**old_string** (verbatim from `js/29-canvas-render.js` lines 331–358):
```
  g.graphH = Math.max(curY + 80, 600);

  // Chrome node positions
  const midY = Math.max(TOP_PAD + 40, g.graphH / 2 - 60);

  // Launch (animated only): between IMG and VID
  if (g.mode === 'animated') {
    if (!window.createLaunchAgentPosition) {
      window.createLaunchAgentPosition = { x: COL_LAUNCH, y: midY - LAUNCH_H / 2 };
    }
  }

  const colBgm = (g.mode === 'animated') ? COL_BGM_ANIM : COL_BGM_ILL;
  if (!window.createBgmNodePosition) {
    window.createBgmNodePosition = { x: colBgm, y: midY - BGM_H / 2 };
  }

  const colSub = (g.mode === 'animated') ? COL_SUB_ANIM : COL_SUB_ILL;
  if (!window.createSubNodePosition) {
    window.createSubNodePosition = { x: colSub, y: midY - SUB_H / 2 };
  }

  const colFinal = (g.mode === 'animated') ? COL_FINAL_ANIM : COL_FINAL_ILL;
  if (!window.createFinalRenderPosition) {
    window.createFinalRenderPosition = { x: colFinal, y: midY - FINAL_H / 2 };
  }

  g.graphW = colFinal + FINAL_W + 80;
```

**new_string:**
```
  g.graphH = Math.max(curY + 80, 600);

  // Chrome node positions
  const midY = Math.max(TOP_PAD + 40, g.graphH / 2 - 60);
  g.chromeMidY = midY;      // stored so render fallbacks can use it

  // Launch (animated only): between IMG and VID
  if (g.mode === 'animated') {
    if (!window.createLaunchAgentPosition) {
      window.createLaunchAgentPosition = { x: COL_LAUNCH, y: midY - LAUNCH_H / 2 };
    }
  }

  const colBgm = (g.mode === 'animated') ? COL_BGM_ANIM : COL_BGM_ILL;
  if (!window.createBgmNodePosition) {
    window.createBgmNodePosition = { x: colBgm, y: midY - BGM_H / 2 };
  }

  const colSub = (g.mode === 'animated') ? COL_SUB_ANIM : COL_SUB_ILL;
  if (!window.createSubNodePosition) {
    window.createSubNodePosition = { x: colSub, y: midY - SUB_H / 2 };
  }

  const colFinal = (g.mode === 'animated') ? COL_FINAL_ANIM : COL_FINAL_ILL;
  if (!window.createFinalRenderPosition) {
    window.createFinalRenderPosition = { x: colFinal, y: midY - FINAL_H / 2 };
  }

  g.graphW = colFinal + FINAL_W + 80;
```

#### Scope — must NOT touch
- Lines 265–330 (scene-band loop) — unchanged.
- Lines 359+ (tidyLayout) — unchanged.

---

**Fix B.3 — Fix Launch render fallback Y**

**old_string** (verbatim from `js/29-canvas-render.js` line 942):
```
  const pos = window.createLaunchAgentPosition || { x: COL_LAUNCH, y: TOP_PAD };
```

**new_string:**
```
  const pos = window.createLaunchAgentPosition || { x: COL_LAUNCH, y: (g.chromeMidY || TOP_PAD) - LAUNCH_H / 2 };
```

#### Scope — must NOT touch
- Lines 918–941 (buildSimpleNode call and nodeEls registration) — unchanged.
- Lines 943+ (placeNode call) — unchanged.

---

**Fix B.4 — Fix BGM render fallback Y**

**old_string** (verbatim from `js/29-canvas-render.js` line 980):
```
  const pos = window.createBgmNodePosition || { x: COL_BGM_ANIM, y: TOP_PAD };
```

**new_string:**
```
  const colBgmFb = (g.mode === 'animated') ? COL_BGM_ANIM : COL_BGM_ILL;
  const pos = window.createBgmNodePosition || { x: colBgmFb, y: (g.chromeMidY || TOP_PAD) - BGM_H / 2 };
```

#### Scope — must NOT touch
- Lines 946–979 (bgmSkipped guard and buildSimpleNode) — unchanged.
- Lines 981+ (placeNode call) — unchanged.

---

**Fix B.5 — Fix Sub render fallback Y**

**old_string** (verbatim from `js/29-canvas-render.js` line 1030):
```
  const pos = window.createSubNodePosition || { x: COL_SUB_ANIM, y: TOP_PAD };
```

**new_string:**
```
  const colSubFb = (g.mode === 'animated') ? COL_SUB_ANIM : COL_SUB_ILL;
  const pos = window.createSubNodePosition || { x: colSubFb, y: (g.chromeMidY || TOP_PAD) - SUB_H / 2 };
```

#### Scope — must NOT touch
- Lines 993–1029 (audioSubSkipped guard and buildSimpleNode) — unchanged.
- Lines 1031+ (placeNode call) — unchanged.

---

**Fix B.6 — Fix Final render fallback Y**

**old_string** (verbatim from `js/29-canvas-render.js` line 1062):
```
  const pos = window.createFinalRenderPosition || { x: COL_FINAL_ANIM, y: TOP_PAD };
```

**new_string:**
```
  const colFinalFb = (g.mode === 'animated') ? COL_FINAL_ANIM : COL_FINAL_ILL;
  const pos = window.createFinalRenderPosition || { x: colFinalFb, y: (g.chromeMidY || TOP_PAD) - FINAL_H / 2 };
```

#### Scope — must NOT touch
- Lines 1038–1061 (buildSimpleNode call and nodeEls registration) — unchanged.
- Lines 1063+ (placeNode call) — unchanged.

#### Checkpoint B

**[automated]**
```bash
git diff -- js/29-canvas-render.js
# Expect: 6 hunks:
#   B.1: +1 line in freshGraphState (chromeMidY: 0)
#   B.2: +1 line in runLayout (g.chromeMidY = midY)
#   B.3: 1 line changed — Launch fallback y
#   B.4: 1 line changed to 2 lines — BGM fallback (colBgmFb + pos)
#   B.5: 1 line changed to 2 lines — Sub fallback
#   B.6: 1 line changed to 2 lines — Final fallback

git diff --stat -- js/29-canvas-render.js
# Expect: 1 file changed, ~8 insertions(+), ~4 deletions(-)
```
Re-read:
- Line ~112 of `js/29-canvas-render.js`: confirm `chromeMidY: 0` is present in freshGraphState.
- Line ~334 of `js/29-canvas-render.js`: confirm `g.chromeMidY = midY;` is present after `const midY = ...`.
- Lines ~942, ~980–981, ~1030–1031, ~1062–1063: confirm none of the 4 fallbacks use `y: TOP_PAD` literally.

Grep checks:
- pattern `y: TOP_PAD` in `js/29-canvas-render.js` → expect **zero** matches
- pattern `chromeMidY` in `js/29-canvas-render.js` → expect **≥ 6** matches (state init + runLayout write + 4 fallback reads)

**[post-impl smoke tests]**
1. Open canvas in illustrated mode with 3 scenes. BGM node should appear vertically centred relative to the scene band column, not pinned to y=40.
2. Open canvas in animated mode. Launch node, BGM, Sub, and Final should all appear at a sensible mid-canvas Y, not all stacked at the very top.
3. Refresh page — chrome nodes should snap to the same Y as on initial mount (positions saved via triggerSave round-trip).

---

#### Fix C — Store hover-dim listeners in g and remove them in detachEvents

**Fix C.1 — Add fields to freshGraphState for hover listener refs**

**old_string** (verbatim from `js/29-canvas-render.js` lines 148–150):
```
    onContextMenu: null,
    onDblClick: null,
```

**new_string:**
```
    onContextMenu: null,
    onDblClick: null,
    onMouseOver: null,
    onMouseOut: null,
```

#### Scope — must NOT touch
- Lines 88–147 (all other freshGraphState fields) — unchanged.
- Lines 151+ (contextMenuEl onwards) — unchanged.

---

**Fix C.2 — Capture hover listener refs on g.onMouseOver / g.onMouseOut**

**old_string** (verbatim from `js/29-canvas-render.js` lines 1706–1723):
```
  // Hover dim
  g.wrapperEl.addEventListener('mouseover', function (e) {
    const nodeEl = e.target.closest('.cg-node');
    if (!nodeEl) return;
    if (g.hoveredNodeId !== nodeEl.dataset.id) {
      g.hoveredNodeId = nodeEl.dataset.id;
      redrawCurves();
    }
  });
  g.wrapperEl.addEventListener('mouseout', function (e) {
    const nodeEl = e.target.closest('.cg-node');
    if (!nodeEl) return;
    const r = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.cg-node');
    if (!r) {
      g.hoveredNodeId = null;
      redrawCurves();
    }
  });
```

**new_string:**
```
  // Hover dim — stored on g so detachEvents can clean them up on unmount
  g.onMouseOver = function (e) {
    const nodeEl = e.target.closest('.cg-node');
    if (!nodeEl) return;
    if (g.hoveredNodeId !== nodeEl.dataset.id) {
      g.hoveredNodeId = nodeEl.dataset.id;
      redrawCurves();
    }
  };
  g.wrapperEl.addEventListener('mouseover', g.onMouseOver);
  g.onMouseOut = function (e) {
    const nodeEl = e.target.closest('.cg-node');
    if (!nodeEl) return;
    const r = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.cg-node');
    if (!r) {
      g.hoveredNodeId = null;
      redrawCurves();
    }
  };
  g.wrapperEl.addEventListener('mouseout', g.onMouseOut);
```

#### Scope — must NOT touch
- Lines 1699–1705 (dblClick listener) — unchanged.
- Lines 1724+ (textarea input listener) — unchanged.

---

**Fix C.3 — Remove hover listeners in detachEvents**

**old_string** (verbatim from `js/29-canvas-render.js` lines 1802–1806):
```
  if (g.wrapperEl) {
    if (g.onWheel) g.wrapperEl.removeEventListener('wheel', g.onWheel);
    if (g.onMouseDown) g.wrapperEl.removeEventListener('mousedown', g.onMouseDown);
    if (g.onClick) g.wrapperEl.removeEventListener('click', g.onClick);
    if (g.onContextMenu) g.wrapperEl.removeEventListener('contextmenu', g.onContextMenu);
    if (g.onDblClick) g.wrapperEl.removeEventListener('dblclick', g.onDblClick);
  }
```

**new_string:**
```
  if (g.wrapperEl) {
    if (g.onWheel) g.wrapperEl.removeEventListener('wheel', g.onWheel);
    if (g.onMouseDown) g.wrapperEl.removeEventListener('mousedown', g.onMouseDown);
    if (g.onClick) g.wrapperEl.removeEventListener('click', g.onClick);
    if (g.onContextMenu) g.wrapperEl.removeEventListener('contextmenu', g.onContextMenu);
    if (g.onDblClick) g.wrapperEl.removeEventListener('dblclick', g.onDblClick);
    if (g.onMouseOver) g.wrapperEl.removeEventListener('mouseover', g.onMouseOver);
    if (g.onMouseOut) g.wrapperEl.removeEventListener('mouseout', g.onMouseOut);
  }
```

#### Scope — must NOT touch
- Lines 1799–1801 (detachEvents null-check) — unchanged.
- Lines 1808–1812 (window/document removeEventListeners) — unchanged.

#### Checkpoint C

**[automated]**
```bash
git diff -- js/29-canvas-render.js
# Expect: 3 hunks:
#   C.1: +2 lines in freshGraphState (onMouseOver: null, onMouseOut: null)
#   C.2: ~17 lines changed — anonymous functions replaced with named refs stored on g
#   C.3: +2 lines in detachEvents (removeEventListener for onMouseOver, onMouseOut)

git diff --stat -- js/29-canvas-render.js
# Expect: 1 file changed, ~10 insertions(+), ~6 deletions(-)
```
Re-read:
- freshGraphState block: confirm `onMouseOver: null` and `onMouseOut: null` present.
- Hover dim block (around original line 1706): confirm `g.onMouseOver = function...` and `g.onMouseOut = function...` with addEventListener calls using the stored refs.
- detachEvents block: confirm `g.wrapperEl.removeEventListener('mouseover', g.onMouseOver)` and `g.wrapperEl.removeEventListener('mouseout', g.onMouseOut)` are present.

Grep checks:
- pattern `addEventListener\('mouseover'` in `js/29-canvas-render.js` → expect **1** match
- pattern `addEventListener\('mouseout'` in `js/29-canvas-render.js` → expect **1** match
- pattern `removeEventListener\('mouseover'` in `js/29-canvas-render.js` → expect **1** match
- pattern `removeEventListener\('mouseout'` in `js/29-canvas-render.js` → expect **1** match

**[post-impl smoke tests]**
1. Open canvas. Unmount and remount the canvas (navigate away from canvas mode and back) 3 times.
2. After 3 remounts, hover over a node — it should highlight exactly once, not 3× as fast or flickering.
3. Scroll the canvas with the wheel. Zoom should respond immediately and not appear sluggish/frozen.
4. Check browser DevTools → Event Listeners on `.cg-wrapper` element after 3 remounts — expect exactly 1 `mouseover` and 1 `mouseout` listener (not 3).

---

## Part 5 — Deferred

| # | Bug | Why deferred |
|---|-----|-------------|
| D1 | **COL_IMG gap vs COL_SB**: at COL_SB=80 + NODE_W=520 = 600, COL_IMG=480 means the IMG column starts 120px BEFORE the SB column ends — cards will overlap horizontally once Fix A widens them to 520px. The constants need to be widened: COL_IMG should be at least COL_SB + NODE_W + gap (e.g. 80 + 520 + 60 = 660). Same for COL_VID (1080 vs COL_IMG=480 + 520 = 1000, only 80px gap — passable but tight). COL_LAUNCH (880) sits between COL_IMG+NODE_W (1000) — also overlapping. | Non-trivial constant arithmetic that ripples through all column constants, `panToColumn`, `fitToView`, and requires a visual QA pass. Too many unknowns to fix surgically without seeing the live layout post-Fix-A. **User must verify column widths after Fix A lands and then adjust the `COL_*` constants in Section 1 of `js/29-canvas-render.js` manually.** |
| D2 | **`--sock-*` dark theme tokens defined only in `index.html`** (lines 68–72) but not as overrides in `css/themes.css` `html[data-theme="dark"]` block. The `html[data-theme="light"]` block in `css/themes.css` does define its own `--sock-*` at lines 85–89 with lighter hex values. This means if the dark root ever loses its `:root` scope (e.g. SSR, hydration flash), curves fall back to undefined. Also ADR-12 parity requires both themes defined in the same file for auditability. | Requires touching `css/themes.css` which is a read-only foundation file (per the audit scope statement). Must be a separate deliberate change after confirming impact. |
| D3 | **`COL_BGM_ILL` / `COL_SUB_ILL` / `COL_FINAL_ILL` column spacing in illustrated mode**: COL_BGM_ILL=880, COL_SUB_ILL=1160, COL_FINAL_ILL=1440 — all three singletons use 280px-wide chrome nodes (BGM_W=280, SUB_W=280, FINAL_W=280). At 880 start, 880+280=1160 exactly touches COL_SUB_ILL — zero gap between BGM right edge and Sub left edge. The nodes will visually abut in illustrated mode. | Column constant adjustment — same family as D1. Defer until D1 is fixed and constants reviewed holistically. |
| D4 | **Selection toolbar Y position uses `r.y - 16`** (line 2014) but spec says "72px above the selected card's top edge". 16px is far too close; at NODE_W=520 the toolbar would overlap the card header. The correct formula is `r.y - 72`. | Simple to fix as a line change, but the correct offset also depends on the toolbar's own rendered height at the current zoom level, which varies. A hardcoded 72px offset is in the spec but the user should verify the visual at multiple zoom levels. Deferring to not block the P0/P1 fixes. |
| D5 | **Hover-dim `mouseover`/`mouseout` fires `redrawCurves()` synchronously on every node entry** — no `requestAnimationFrame` throttle. With many scenes this can cause jank on rapid mouse movement across nodes. | Performance enhancement, not a correctness bug. P3. Defer to a polish pass. |
| D6 | **Agent panel collapsed-sibling selector** `css/canvas-graph.css:613–614` uses `[data-collapsed="1"] ~ * #create-canvas-step` which requires the canvas step to be a deeply nested descendant of a sibling. The actual DOM relationship may not satisfy this selector (depends on HTML structure). If the selector doesn't match, the `padding-left: 56px` override never fires and collapsed panel still shows 232px left offset. | Requires reading the live DOM structure at runtime — cannot be verified statically. Deferred for user to verify by toggling panel collapse. |

---

## Part 6 — Already verified safe

| Item | Finding | Why it's already safe |
|------|---------|----------------------|
| SB tabs single-SB | Finding #5 | `updateSBNode` always renders at least `[A][+]` tabs regardless of SB count |
| Zoom clamp range | Spec requires [0.25, 2.5]; `handleZoom` line 1304 clamps `Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, g.zoom * factor))` — correct | Already guarded |
| runLayout version migration | `ensureLayoutVersion` wipes stale positions when `_layoutVersion !== 8` — correct per ADR-3 | Already guarded |
| cursorMode default | `cgChromeMount` line 2144 initializes `cursorMode: 'pan'` — regression from old renderer is fixed | Already correct |
| Curve auto-theming | `getSockColor` uses `getComputedStyle(tokenSource())` so curves re-read tokens on theme toggle | Already correct |
| context menu outside-click cleanup | `cgCloseContextMenu` removes the listener via stored `_closeOnOutside` ref | Already correct |
| `redrawCurves` called twice in `mount` | `mount` calls `renderAll()` (which calls `redrawCurves`) and then `redrawCurves()` directly — double curve draw on mount, but harmless (just redundant work, not a bug) | Harmless redundancy |
| Chrome rAF cleanup | `cgChromeUnmount` calls `cancelAnimationFrame(g.cgChrome.rafId)` — telemetry loop is properly cleaned up | Already guarded |
| `detachEvents` missing hover handlers before Fix C | This IS the Fix C bug; all other event listeners in `detachEvents` are correctly stored and removed | Resolved by Fix C |

---

## Part 7 — Implementation Sequence

1. **Fix A.1** — Remove `cg-node--sb { width: 300px }` from `css/canvas-graph.css`
2. **Fix A.2** — Remove `cg-node--img, cg-node--vid { width: 300px }` from `css/canvas-graph.css`
3. **Fix B.1** — Add `chromeMidY: 0` to `freshGraphState` in `js/29-canvas-render.js`
4. **Fix B.2** — Write `g.chromeMidY = midY` in `runLayout` in `js/29-canvas-render.js`
5. **Fix B.3** — Fix Launch render fallback Y in `js/29-canvas-render.js`
6. **Fix B.4** — Fix BGM render fallback Y in `js/29-canvas-render.js`
7. **Fix B.5** — Fix Sub render fallback Y in `js/29-canvas-render.js`
8. **Fix B.6** — Fix Final render fallback Y in `js/29-canvas-render.js`
9. **Fix C.1** — Add `onMouseOver/onMouseOut: null` to `freshGraphState` in `js/29-canvas-render.js`
10. **Fix C.2** — Capture hover listener refs on `g` in `attachEvents` in `js/29-canvas-render.js`
11. **Fix C.3** — Remove hover listeners in `detachEvents` in `js/29-canvas-render.js`

Fixes A, B, C are independent (A touches only CSS; B and C touch JS in disjoint regions). Within B, sub-fixes B.1–B.6 are applied in order (B.1 adds the field that B.2–B.6 read). Within C, sub-fixes C.1–C.3 are applied in order (C.1 adds fields that C.2 writes, C.3 reads).

**Per-fix execution contract (verified-fix skill runs autonomously; NO commits):**
1. Read target region; confirm old_string matches verbatim.
2. Apply Edit.
3. Read edited region; confirm new_string landed.
4. Run git diff + git diff --stat; include in report.
5. Run fix-specific Grep checks.
6. Check scope adherence against forbidden regions.
7. If all 6 checks pass → report ✅ verified and move on. If any fail → HALT.

**Changes are left unstaged in the working tree.** The auditor never runs `git add` or `git commit`. The user commits manually after reviewing the final report.

**No per-fix manual gate.** Smoke tests are aggregated into the final report and run by the user after the full cycle completes.

**If any automated check fails mid-cycle:**
- verified-fix halts and reports the failure.
- Already-applied fixes remain modified in the working tree (no commits were made).
- User decides: discard everything (`git checkout -- .`), discard selective fixes, or keep and fix manually.

---

### Critical post-implementation action required (Deferred D1)

After the 3 automated fixes land, **manually verify column overlap in the live canvas** and adjust the `COL_*` constants in `js/29-canvas-render.js` Section 1 (lines 49–59) if cards overlap. Recommended minimum values at NODE_W=520:

| Constant | Current | Minimum safe (NODE_W=520, gap=60) |
|----------|---------|----------------------------------|
| `COL_SB` | 80 | 80 (ok — left edge) |
| `COL_IMG` | 480 | **660** (80 + 520 + 60) |
| `COL_LAUNCH` | 880 | **1240** (660 + 520 + 60) |
| `COL_VID` | 1080 | **1440** (1240 + 200 + 200 — Launch is 200px wide) |
| `COL_BGM_ANIM` | 1480 | **2020** (1440 + 520 + 60) |
| `COL_BGM_ILL` | 880 | **660** (same as COL_IMG + 520 + 60; BGM is 280px wide so 660+520+60=1240 for BGM_ILL) |

These are ballpark guidance — the user should visually tune after Fix A lands.
