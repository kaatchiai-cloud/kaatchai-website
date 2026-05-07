# Stori Cost Estimator — Implementation Plan

**Target file:** `mocks/cost-estimator.html` (new, single self-contained HTML — no build step, no backend)

**Reference mockup:** `mocks/cost-estimator-mock.html` (already in repo — defines the exact visual layout and copy)

This document is the build spec. Implementation must match it exactly. After build, every line item in §11 must be verified twice.

---

## 1. File structure

Single `mocks/cost-estimator.html`, vanilla HTML/CSS/JS, no dependencies. Sections in DOM order:

1. Topbar (title, Save/Reset/Export/Import buttons, last-saved timestamp)
2. Markup composition banner (MOR · Margin · Extra %, Base share auto, multiplier auto)
3. Credit-rate banner (1 credit = $X, presets)
4. Grand-total card (USD chain + per-flow breakdown)
5. Section 1 — Global Pricing Catalog (8 categories, base price only + right-end summary column)
6. Section 2 — Flows (7 flows, each with branches/providers/regen/variants)
7. Footer legend

---

## 2. Data model (single source of truth in `state` object, JSON-serializable)

```js
state = {
  meta: { savedAt: ISO, version: 1 },
  markup: { mor: 5, margin: 20, extra: 5 },        // percentages (sum < 100)
  creditRate: 0.01,                                 // USD per credit
  catalog: {
    text:    [{ id:"txt-1", provider:"Gemini",  model:"gemini-2.5-flash",         baseIn:0.075, baseOut:0.300, notes:"default" }, ...],
    image:   [{ id:"img-1", provider:"Gemini",  model:"gemini-3-pro-image-preview", base:0.134, unit:"grid 3×3", notes:"9 scenes" }, ...],
    video:   [{ id:"vid-1", ... base:0.014, unit:"sec" }, ...],
    tts:     [{ id:"tts-1", ... base:0.003, unit:"segment" }, ...],
    stt:     [{ id:"stt-1", ... }, ...],
    lipsync: [{ id:"lip-1", ... base:0,     unit:"free"   }, { id:"lip-2", ... base:0.014, unit:"sec" }],
    bgm:     [{ id:"bgm-1", ... base:0.050, unit:"clip"   }],
    vision:  [{ id:"vis-1", ... base:0.002, unit:"image"  }],
  },
  flows: {
    autopilot:    { branches:{...}, providers:{...}, regen:{...} },
    copilot:      { branches:{...}, providers:{...}, regen:{...} },
    brandProduct: { branches:{...}, providers:{...}, regen:{...} },
    filmNarr:     { branches:{...}, providers:{...}, regen:{...} },
    reels:        { branches:{...}, providers:{...}, regen:{...} },
    photopilot:   { branches:{...}, providers:{...}, regen:{...} },
    canvasRegen:  { branches:{...}, providers:{...}, regen:{...} },
  }
}
```

`state` persists to `localStorage["stori_cost_model_v1"]`. Auto-saves on every input change (debounced 300ms). Export = JSON download. Import = file upload → parse → validate shape → replace state → recompute.

**Catalog persistence (explicit):** the entire `state.catalog` object is part of the saved state. Every catalog edit persists — base price, provider name, model name, unit label, notes, AND row additions/deletions. Stable row IDs (txt-N, img-N, …) survive across reloads so per-flow provider dropdowns keep their references. When a row is deleted, any flow provider dropdown still pointing at it falls back to the first remaining row in that category and that fallback is itself persisted (so you don't see a phantom selection).

---

## 3. Math (single helper file, no surprises)

```js
function markupMultiplier(s) {
  const sumPct = (s.markup.mor + s.markup.margin + s.markup.extra);
  if (sumPct >= 100) return Infinity;          // UI flags as error
  return 1 / (1 - sumPct / 100);
}

function actualUsd(baseUsd, s)  { return baseUsd * markupMultiplier(s); }
function actualCr (baseUsd, s)  { return actualUsd(baseUsd, s) / s.creditRate; }
function billedCr (baseUsd, s)  { return Math.ceil(actualCr(baseUsd, s)); }    // PER ITEM, always ceil
```

**Rule (critical):** `billedCr` is computed PER-ITEM. A flow's billed total = `Σ billedCr(per-call)` — NOT `ceil(Σ actualCr)`. The "every individual call rounds up" requirement is enforced at the call level, before summation.

**Token-based items (text LLM):** treat input and output as separate items. `baseUsdForCall = (inputTokens/1e6)*baseIn + (outputTokens/1e6)*baseOut`, then run through the same chain. (For per-1M-tokens display in the catalog, just plug 1.0 as the multiplier — that's what the right-end summary column shows.)

---

## 4. Section-by-section spec

### 4.1 Topbar
- Title `Stori Cost Estimator`
- Subtitle: version + dirty/clean status (e.g. `● Unsaved changes` red, or `✓ All changes saved` muted)
- Buttons (right-aligned): `Export JSON`, `Import JSON`, **`Save`** (primary, red dot when dirty), `Reset to defaults`
- `Last saved: YYYY-MM-DD HH:mm` updates after every Save click
- Cmd/Ctrl+S = Save shortcut
- `beforeunload` listener prompts user to confirm leave when there are unsaved changes (browser-native dialog)

### 4.2 Markup composition banner (pink/magenta)
- `Actual cost = Base + MOR + Margin + Extra (= 100%)`
- Three numeric inputs: MOR (default 5), Margin (default 20), Extra (default 5)
- Live derived chips:
  - `Base share: NN %` (green chip; `100 - sum`)
  - `multiplier base→actual = × X.XXXX`
- If `sum >= 100`: red error message, all downstream actual/credit fields show `—`
- Worked example line: `e.g. base $0.134 ⇒ actual $0.1914 ⇒ at $0.01/cr ⇒ 19.14 actual cr ⇒ 20 billed cr`
  - Recomputes live from current markup + rate

### 4.3 Credit-rate banner (gold)
- `1 credit = $ [0.01]` editable
- Preset buttons: $0.001 / $0.005 / $0.01 / $0.05
- Help text: "credits derive from ACTUAL cost (after MOR + margin + extra), not base · always rounds UP per item"

### 4.4 Grand total
- Big line: `base $ X.XXX ⇒ X.XXXX · actual NNN.N → MMMM cr`
- Caption: `base × <multiplier> = actual · sum of per-item rounded credits`
- Breakdown grid (3 cols): per-flow per-variant rows, each showing `base $X · ⇒ $Y · actual N.N → M cr`
  - 14 rows total (the 14 named variants in §6 + flow-internal variants from Reels and Photopilot)

### 4.5 Section 1 — Global Pricing Catalog
8 sub-sections (one per category). Each is a table.

**Text/Chat LLM table columns:**
`ID | Provider | Model | base $/M in | base $/M out | Notes | cost / 1M tokens (base $ · actual $ · credit) | 🗑`

The right-end summary cell shows: `in base $X.XX ⇒ $Y.YY → N cr · out base $X.XX ⇒ $Y.YY → M cr`

**Other 7 tables (Image, Video, TTS, STT, Lip sync, BGM, Vision) columns:**
`ID | Provider | Model | base $/unit | Unit | Notes | cost / 1 unit (base $ · actual $ · credit) | 🗑`

The right-end summary cell shows: `base $X.XX ⇒ $Y.YY → N cr`

`+ add row` link in each h3 appends a new editable row. Trash icon removes a row. Each catalog category has a stable ID prefix (txt-N, img-N, …) — when a row is added the next free integer is assigned.

### 4.6 Section 2 — Flows (7 cards)
Each flow card has, in this order:
1. **Header** — name, descriptor pill, flow total `base $X ⇒ $Y · actual N → M cr`
2. **Description** — 1-line of what the flow is
3. **Branches grid** — multiple `.bx` panels (varies per flow; see §6)
4. **Per-call provider selectors** — one dropdown per call type the flow uses (Storyboard / Continuation / Translation / Vision / Image / Video / STT / TTS / Lip sync / BGM, as applicable)
5. **Regen panel** — orange dashed; per-call regen knobs
6. **Variant cards** — one card per (entry × render) variant, with breakdown grouped by branch

---

## 5. Catalog default seed (12 base rows)

Match the mockup exactly (including the bug-fixed `vid-2`):

| Cat | id | provider | model | base $ | unit | notes |
|-----|-----|----------|-------|--------|------|-------|
| text | txt-1 | Gemini | gemini-2.5-flash | 0.075 in / 0.300 out | per M | default |
| text | txt-2 | OpenAI | gpt-4o | 2.50 / 10.00 | per M | optional |
| text | txt-3 | Anthropic | claude-sonnet-4-20250514 | 3.00 / 15.00 | per M | optional |
| text | txt-4 | Gemini | gemini-2.0-flash | 0.075 / 0.300 | per M | continuation |
| image | img-1 | Gemini | gemini-3-pro-image-preview | 0.134 | grid 3×3 | 9 scenes |
| image | img-2 | Gemini | gemini-3.1-flash-image-preview | 0.101 | grid 3×3 | fallback 1 |
| image | img-3 | Gemini | gemini-2.5-flash-image | 0.039 | image | single / fallback 2 |
| image | img-4 | Google | imagen-4.0-fast-generate-001 | 1.000 | image | legacy |
| video | vid-1 | Kling Official | kling-v2-5-turbo | 0.014 | sec | 5s/10s clips |
| video | vid-2 | Kling Runware | kling proxy | 0.012 | sec | alt route |
| video | vid-3 | Google | veo3-fast | 0.500 | sec | planned |
| tts | tts-1 | Gemini | gemini-2.5-flash-preview-tts | 0.003 | segment | generative |
| tts | tts-2 | ElevenLabs | eleven_monolingual_v1 | 0.30 | 1M chars | paid voices |
| stt | stt-1 | Gemini | gemini-2.5-flash | 0.003 | audio file | token-based |
| stt | stt-2 | ElevenLabs | scribe_v1 | 0.40 | hour | word align |
| lipsync | lip-1 | MediaPipe | face_landmarker.task | 0 | free | Tier 1 local |
| lipsync | lip-2 | Kling/fal.ai | kling-video/lipsync | 0.014 | sec | Tier 2 |
| bgm | bgm-1 | Google Lyria | lyria-3-clip-preview | 0.050 | clip | up to 5 ref imgs |
| vision | vis-1 | Gemini | gemini-2.5-flash | 0.002 | image | char/env desc |

---

## 6. Flow specs — every input field, every variant

### 6.1 Autopilot (4 variants)
**Branches panels:**
- *Content size:* duration (60s), avg scene duration (5s), scene count (auto = duration/avg), scenes >12s (0)
- *Cast:* # chars (2), auto-describe per char (1), gender inference per char (0), Bible pages per char (1), voice samples per char (1)
- *Environments:* # envs (1), auto-describe per env (1)
- *Dialogue:* # dialogue scenes (6), avg speakers/dialogue scene (2), speaker visible % (80), dialogue-detection LLM (✓)
- *Languages:* # langs (1), subtitle translation (✗), # subtitle segs (0), full audio dub (✗), avg TTS chars/segment (120)
- *Image gen:* mode (grid 3×3), avg fallback attempts (1.1), Bible-as-ref (✓)
- *Video / Animated only:* provider (Kling Official), continuation prompts (0), lipsync tier (Tier 1)
- *Audio / BGM:* BGM (✓), Lyria ref images (3), BGM regens (0)
- *Brainstorm session* (used only by viaBS variants): chat tokens in (12000), out (6000), finalise in/out (2000/8000), narrator-screen needed (✗), provider (txt-1)

**Per-call providers:** Storyboard (txt-1), Continuation (txt-4), Translation (txt-1), Vision describe (vis-1), Image (img-1), Video (vid-1), STT (stt-1), TTS (tts-1), Lip sync (lip-1), BGM (bgm-1)

**Regen:** chat regens/turn (0.2), storyboard re-runs (1), Bible re-runs (0), image regens/scene (0.5), video regens/scene (0.2), TTS regens/segment (0.3), lipsync regens (0.1), BGM regens (0)

**Variants:**
1. Standalone · Illustrated — pipeline body only (no chat, no Kling, no lipsync-Tier-2, no continuation)
2. Standalone · Animated — adds Kling I2V + lipsync (per tier choice) + BGM
3. Via Brainstorm · Illustrated — adds chat + finalise on top of #1
4. Via Brainstorm · Animated — adds chat + finalise on top of #2

### 6.2 Copilot (4 variants)
Same structure, defaults scaled to 180s / 36 scenes / 4 chars / 3 envs / 20 dialogue / speakers 2.5 / visible 70% / 2 langs / subs ✓ / dub ✓ / Bible 1 page each / voice samples 2 / chat 40k+20k / finalise 6k+12k / continuation prompts 2.

### 6.3 Brand-Product (4 variants — viaBS·Animated is the default highlight)
- 30s / 6 scenes / 2 chars (1 product persona + narrator) / 2 envs / 3 dialogue (speakers 1.5, 100% visible)
- 3 langs, full dub ✓
- Voice samples 3, Bible pages 2 each
- Chat 20k+10k, finalise 3k+9k
- Narrator-screen LLM call ✓ (extra finalise-style call)
- TTS provider default = ElevenLabs (tts-2)
- Lipsync default = Tier 2 (lip-2)
- Lyria refs 5

### 6.4 Film-Narrative (4 variants)
- 90s / 15 scenes (avg 6s) / 2 continuation prompts / 4 chars / 4 envs / 10 dialogue (speakers 2.5, visible 80%)
- 2 langs, subs ✓, dub ✗
- Voice samples 3, Bible pages 2 each
- Podcast chapters auto-split (3) — each chapter = +1 storyboard text call
- Chat 30k+15k, finalise 5k+10k
- Narrator persona LLM ✓
- Chat provider txt-3 (Claude Sonnet)
- TTS = ElevenLabs, lipsync = Tier 2, BGM ✓

### 6.5 Reels (4 variants)
- duration 20s, scene count 4
- Variations matrix: # audio langs (2) × # subtitle langs (3) × # platforms (3) = 18 (auto-derived)
- Per-variation: cinematography agent ✓, scene-script gen ✓, new TTS only when audio-lang differs ✓
- Subtitle quadratic: # subtitle segments/reel (8) × # variations
- Image mode (grid), fallback 1.1, re-use images across variations ✓
- TTS chars/segment 100, BGM ✗
- Variants:
  1. Audio-in · Illustrated
  2. Audio-in · Animated
  3. Text-in · Illustrated (no STT)
  4. Video-in · subs only (no image gen, no TTS)

### 6.6 Photopilot (4 variants)
- # photos 8, # segments 8, mode (audio)
- Auto-script per photo (vision) ✓
- Smart suggestions vision ✓, vision calls per segment 1
- TTS segments 1, chars/segment 600
- Variants:
  1. Manual script · no effects
  2. Auto-script · no effects
  3. Manual script · with effects
  4. Auto-script · with smart effects

### 6.7 Canvas Regen (3 variants)
- # scenes touched 6, regens per scene 1, sibling refs/regen (≤3)
- Image regen mode single, fallback 1.2
- Re-Kling per scene 0.5, re-lipsync per dialogue scene 0.5
- Vision validation pass (✗), vision calls per pass 6
- Variants: light illustrated, light animated, heavy animated

---

## 7. Per-variant calculation formulas (exhaustive, line-by-line)

For each variant, the breakdown shows line items in groups. Each line item contributes:
- a count (call count or seconds)
- a unit base $ (looked up from selected provider in catalog)
- → per-call base $ = lineBaseTotal / count
- → per-call billed cr = `Math.ceil(perCallBase × multiplier / rate)`
- → line billed cr = perCallBilled × count

### 7.1 Common helpers
```js
function lineCost(state, count, perCallBase) {
  const perCallActual = perCallBase * markupMultiplier(state);
  const perCallActCr  = perCallActual / state.creditRate;
  const perCallBilled = Math.ceil(perCallActCr);                   // critical: per CALL ceil
  return {
    count,
    baseTotal:    count * perCallBase,
    actualTotal:  count * perCallActual,
    actCrTotal:   count * perCallActCr,
    billedTotal:  count * perCallBilled,
    perCallBase, perCallActual, perCallActCr, perCallBilled,
  };
}
```

### 7.2 Autopilot · Standalone · Illustrated — exact line items
| Line | Count formula | Per-call base $ | Provider |
|------|--------------|------------------|----------|
| Vision describe (chars + envs) | (chars × autoDescribeChar) + (envs × autoDescribeEnv) | catalog.vision[provVision].base | vis-1 |
| Visual Bible pages | chars × biblePagesPerChar | catalog.image[provImage].base (grid model) | img-1 |
| Storyboard | 1 + storyboardReruns | tokens-derived; default treat as 5k in / 3k out → ((5000/1e6)*baseIn + (3000/1e6)*baseOut) | txt-1 |
| Scene image grids | ceil(sceneCount / 9) | catalog.image[provImage].base | img-1 |
| Image regens | sceneCount × imageRegensPerScene | per-grid base / 9 (since regen typically per-scene single) | img-3 single by default? — see §7.6 |
| Image fallback attempts | sceneGrids × (fallbackAttempts − 1) | same as grid base | img-1 |
| Dialogue detection | 1 if dialogueDetection else 0 | text-tokens (~3k in / 1k out) | txt-1 |
| TTS calls | dialogueScenes × avgSpeakers + (sceneCount − dialogueScenes) | catalog.tts[provTts].base per segment | tts-1 |
| TTS regens | (above count) × ttsRegensPerSegment | same | tts-1 |
| STT (voice-in) | 1 if voiceInput else 0 | catalog.stt[provStt].base | stt-1 |

### 7.3 Autopilot · Standalone · Animated
Above PLUS:
| Line | Count | Per-call base $ |
|------|-------|------------------|
| Kling I2V seconds | totalDuration | catalog.video[provVideo].base (per sec) |
| Continuation prompts | scenesGT12 | text-tokens (~2k in / 500 out) — uses txt-4 |
| Video regens | totalDuration × videoRegensPerScene/sceneCount | base per sec |
| Lipsync Tier 2 | dialogueScenes × visiblePct/100 × avgSceneDuration | catalog.lipsync[lip-2].base per sec |
| Lipsync regens | above × lipsyncRegens | same |
| BGM | (1 if bgmOn else 0) + bgmRegens | catalog.bgm[provBgm].base |

### 7.4 Autopilot · Via Brainstorm · Illustrated
Above (illustrated body) PLUS:
| Line | Count | Per-call base $ |
|------|-------|------------------|
| Chat session | 1 (treat whole session as one item with summed in+out tokens) | (chatIn/1e6)*baseIn + (chatOut/1e6)*baseOut |
| Chat regens | chatTurnsApprox × chatRegensPerTurn (turns ≈ chatOut / 200) | per-turn averaged base |
| Finalise | 1 + finaliseReruns | (finIn/1e6)*baseIn + (finOut/1e6)*baseOut |
| Narrator-screen LLM | 1 if narrator else 0 | extra finalise-style call (~2k in / 4k out) |

### 7.5 Autopilot · Via Brainstorm · Animated
Combine 7.3 + 7.4.

### 7.6 Single-vs-grid image regen rule
Image regens fire **per scene**, not per grid. So per-call base $ for regen = catalog row chosen for `Image regen` (often `img-3` Gemini 2.5 Flash single, $0.039). Bible-as-ref toggle does not change cost — just attaches existing images as inlineData, no extra call.

### 7.7 Subtitle translation quadratic (Copilot, Reels, Film-Narrative)
Lines added when subtitle translation toggled ON:
| Line | Count |
|------|-------|
| Subtitle translation calls | sceneCount × (langs − 1) (one per subtitle segment per non-source lang) |
For Reels, replace with `subtitleSegsPerReel × (subLangs − 1) × audioLangs × platforms`.

### 7.8 Full audio dub (Copilot, Brand-Product, Film-Narrative)
| Line | Count |
|------|-------|
| Translation per language | langs − 1 |
| Per-language TTS | sceneCount × (langs − 1) |

### 7.9 Voice sample previews (Cast)
Cast-ref voice sampling fires when user clicks "Preview voice" — counted as `chars × voiceSamplesPerChar` TTS calls (or ElevenLabs sample fetches).

### 7.10 Reels variants
- `audioVariants = audioLangs`, `subVariants = subtitleLangs`, `platVariants = platforms`
- `totalVariations = audioLangs × subtitleLangs × platforms`
- Per variation: cinematography agent (1 text call), scene script (1 text call)
- TTS: only when audio lang differs from source → `(audioLangs − 1) × scenes × platforms` (re-used across subtitle dimensions because subtitle change doesn't re-record audio)
- Translation: `subtitleLangs − 1` per variation

### 7.11 Photopilot variants
- Auto-script: `photos` Gemini-vision text calls
- Effects: `segments × visionCallsPerSegment` Gemini-vision calls
- TTS: `ttsSegments` calls

### 7.12 Canvas Regen variants
- Image regens: `scenesTouched × regensPerScene` calls (single mode)
- Video re-render: `scenesTouched × reKlingPerScene × avgSceneDuration` seconds
- Lipsync re-do: `dialogueRegens × avgSceneDuration` seconds
- Optional vision validation: `visionCallsPerPass`

---

## 8. Display formatting rules

| Field | Format | Example |
|-------|--------|---------|
| Base $ | `base $X.XXXX` (4 dp for ≤ $1, 3 dp for ≥ $1) | `base $0.0030` |
| Actual $ | `⇒ $X.XXXX` pink (`#ff7eb6`), 4 dp | `⇒ $0.0043` |
| Actual cr | `· N.NN` muted gold (`#8b7a4a`), 2 dp | `· 0.43` |
| Billed cr | `→ N cr` bright gold bold (`#ffd166`), integer | `→ 1 cr` |
| Multiplier | `× X.XXXX` 4 dp | `× 1.4286` |
| Big totals | 14px font for `.cr-rounded.big` and `.actual-usd.big` | — |

Round-half-up not needed — only `Math.ceil` for billed credits.

---

## 9. Persistence + I/O

### 9.1 Two-tier save model
- **Auto-save (live, debounced 300ms):** every keystroke / dropdown change writes to `localStorage["stori_cost_model_v1_draft"]`. This is the working draft — keeps you safe from browser crashes / accidental closes.
- **Explicit Save button (committed):** copies the draft into `localStorage["stori_cost_model_v1"]` (the canonical store) and stamps `meta.savedAt`. The topbar shows "Last saved: …" and a `dirty: true|false` indicator next to it.
- On load: reads canonical store first; if a newer draft exists, prompts "You have unsaved changes from <time>. Restore? [Restore draft] [Discard draft]".
- **Everything in `state` persists** — markup percentages, credit rate, full catalog (including added/deleted rows + edits to base price, provider, model, unit, notes), every flow's branch inputs, every flow's per-call provider selections, every flow's regen knobs.
- **Reset**: clears both draft and canonical, reloads defaults, re-renders. Confirms with a `confirm()` dialog first.
- **Export JSON**: `Blob` → `URL.createObjectURL` → `<a download="stori-cost-model-YYYY-MM-DD.json">`. Exported file is the entire canonical `state` (catalog + flows + markup + rate). If draft is dirty, prompts "Save before export? [Save & export] [Export draft] [Cancel]".
- **Import JSON**: file input → `FileReader` → `JSON.parse` → version check → assign to state → render → mark dirty (user must click Save to commit).
- Updated-timestamp shown in topbar; refreshed on every Save click.
- **Catalog mutations (add row / delete row / inline edit) all flow through the same `state` mutation + render + auto-save-draft pipeline as flow inputs** — there is no special path that skips persistence.

### 9.2 Close / unload prompt
- Maintain a `state.dirty` boolean: set to `true` on any mutation, set to `false` on Save click.
- Wire `window.addEventListener('beforeunload', e => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } })`. Browsers show their native "Leave site? Changes you made may not be saved." dialog — user clicks **Leave** (data still safe in draft) or **Cancel** (stays on page so they can hit Save).
- If user clicks **Leave** without saving, the draft auto-restore on next load (§9.1) catches it.
- The topbar Save button gets a subtle red dot (`Save •`) when dirty, plain when clean — visual nudge to save before closing.

### 9.3 Save button behaviors
- Click Save → flush draft to canonical → set `dirty=false` → flash "Saved ✓" toast for 2s → update timestamp.
- Keyboard shortcut `Cmd/Ctrl+S` triggers Save and prevents browser default save-page dialog.
- If `dirty=false` and user clicks Save, no-op but still flashes "Already saved ✓".

---

## 10. Render strategy

- Single `render()` function recomputes all derived values from `state` and writes them to the DOM via `data-out="..."` attributes (e.g. `<span data-out="autopilot.standaloneIllus.total.actual">`).
- Inputs use `data-bind="..."` (e.g. `<input data-bind="markup.mor">`) — a `bindAll()` pass attaches `change`/`input` listeners that update state and call `render()`.
- **Catalog rows are also `data-bind`-driven**: each editable cell binds to `catalog.<cat>[<id>].<field>` (e.g. `data-bind="catalog.image.img-1.base"`). Add-row mutates `state.catalog.<cat>` and re-renders the table; delete-row removes from the array, re-renders, and re-binds dropdowns.
- No framework. ~600 lines of JS, all in one `<script>` at file end.

---

## 11. Verification checklist (run TWICE after build)

### Pass A — Math correctness (compute by hand, compare to UI)

| # | Scenario | Expected base | Expected actual | Expected billed cr |
|---|----------|---------------|-----------------|---------------------|
| 1 | Default markup (5/20/5), rate $0.01, multiplier | — | — | × 1.4286 |
| 2 | 1 image grid img-1 (single call) | $0.134 | $0.1914 | 20 |
| 3 | 1 sec Kling I2V vid-1 | $0.014 | $0.0200 | 2 |
| 4 | 60 sec Kling = 60 × $0.014 | $0.840 | $1.2000 | 60 × 2 = 120 |
| 5 | 1 TTS Gemini segment | $0.003 | $0.0043 | 1 |
| 6 | 12 TTS segments (12 calls) | $0.036 | $0.0514 | 12 × 1 = 12 |
| 7 | Visual Bible 2 pages img-1 | $0.268 | $0.3829 | 2 × 20 = 40 |
| 8 | Vision describe vis-1 single | $0.002 | $0.0029 | 1 |
| 9 | 3 vision calls vis-1 | $0.006 | $0.0086 | 3 |
| 10 | Lipsync 24 sec lip-2 | $0.336 | $0.4800 | 24 × 2 = 48 |
| 11 | BGM Lyria 1 clip | $0.050 | $0.0714 | 8 |
| 12 | Text 5k in / 3k out @ Gemini = 5e3/1e6×0.075 + 3e3/1e6×0.300 | $0.001275 | $0.001821 | 1 |
| 13 | Text 12k in / 6k out @ Gemini chat session | $0.0027 | $0.003857 | 1 (single call lump) |
| 14 | Markup at 0/0/0 → multiplier 1.0, actual = base | check banner shows ×1.0000 | — | — |
| 15 | Markup at 50/0/0 → multiplier 2.0 | × 2.0000 | base $0.134 → $0.268 | 27 |
| 16 | Markup at 30/30/30 → 90% → multiplier 10.0 | × 10.0000 | $0.134 → $1.34 | 134 |
| 17 | Markup at 100 sum → flagged red, all actual cells `—` | error banner | `—` | `—` |
| 18 | Rate $0.001 (cheaper credit) → credits 10× higher | — | $0.1914 | 192 |
| 19 | Rate $0.05 → credits 5× lower | — | $0.1914 | 4 |
| 20 | Reels 18 variations: cinematography 18 + scene-script 18 = 36 text calls | sum check | sum check | 36 × 1 = 36 (assuming each rounds to 1) |
| 21 | Edit catalog: img-1 base $0.134 → $0.200, reload page | $0.200 still shown | $0.2857 | 29 |
| 22 | Catalog edit propagates: change vid-1 base $0.014 → $0.020, every Animated variant total updates within 300ms | — | — | — |
| 23 | Add new row in TTS catalog (tts-3, base $0.10), assign to Autopilot TTS dropdown, reload | tts-3 still in catalog, still selected | $0.1429 | 15 |
| 24 | Delete row tts-2 while it's selected by Brand-Product TTS dropdown — Brand-Product falls back to tts-1, fallback persists across reload | — | — | — |
| 25 | Edit text-LLM txt-1 baseIn 0.075 → 0.150, reload → every Brainstorm-session line that uses Gemini for input doubles | base 2× | actual 2× | billed roughly 2× (modulo per-call ceil) |

### Pass B — UI / requirements completeness

- [ ] Top markup banner present, three % inputs editable, base share auto-derived, multiplier auto-shown, error state at sum≥100
- [ ] Credit-rate banner present, 4 preset buttons functional
- [ ] Grand-total card shows `base $ ⇒ $ · actual N → M cr` chain in big font
- [ ] Grand-total breakdown lists every (flow × variant) with full chain
- [ ] Section 1: 8 catalog tables, base $ only in editable columns, right-end summary column shows base + actual + credit
- [ ] Text/Chat LLM right-end column shows in/out separately
- [ ] All catalog rows have stable IDs (txt-N, img-N etc.)
- [ ] Trash icon removes a row; `+ add row` appends
- [ ] Section 2: 7 flow cards present in this order — Autopilot, Copilot, Brand-Product, Film-Narrative, Reels, Photopilot, Canvas Regen
- [ ] Each flow card has: header with total chain, description, branches grid, providers panel, regen panel, variant cards
- [ ] Each variant card shows base/actual/actCr/billCr in header AND in every breakdown line AND in subtotal
- [ ] Per-call provider dropdowns scoped per flow (different flows can pick different providers)
- [ ] Branches-cast panel exists for Autopilot/Copilot/Brand/Film with: # chars, auto-describe, gender inference, Bible pages, voice samples
- [ ] Branches-environments panel for the same flows
- [ ] Branches-dialogue panel: # dialogue scenes, speakers, visible%, dialogue detection
- [ ] Branches-languages panel: # langs, subtitle translation, # subtitle segs, full dub, chars/segment
- [ ] Branches-image-gen panel: mode, fallback attempts, Bible-as-ref
- [ ] Branches-video panel: provider, continuation prompts, lipsync tier
- [ ] Branches-audio panel: BGM, ref images, regens
- [ ] Branches-brainstorm panel for viaBS variants: chat tokens, finalise tokens, narrator-screen, provider
- [ ] Reels has variations matrix panel: audio langs × subtitle langs × platforms = total auto
- [ ] Photopilot has auto-script + smart-effects branches
- [ ] Canvas Regen has scenes-touched, regens-per-scene, sibling-refs panels
- [ ] Regen panel for every flow with relevant knobs (chat / storyboard / Bible / image / video / TTS / lipsync / BGM / translation re-runs)
- [ ] Save / Reset / Export / Import buttons functional
- [ ] localStorage persistence verified — reload page, all values restored
- [ ] Export downloads `.json`; Import restores from a previously-exported file
- [ ] Last-saved timestamp updates on save
- [ ] Worked example in markup banner recomputes when markup or rate changes
- [ ] **Catalog persistence — base $ edits survive reload** (edit img-1 base, refresh, value still there)
- [ ] **Catalog persistence — provider/model/unit/notes text edits survive reload**
- [ ] **Catalog persistence — added rows survive reload** (add tts-3, refresh, still present in dropdowns)
- [ ] **Catalog persistence — deleted rows stay deleted across reload**
- [ ] **Catalog edits ripple immediately**: changing img-1 base instantly updates Section 1 right-end summary cell AND every flow line that references img-1 AND grand total
- [ ] **Per-flow provider selections persist**: change Autopilot TTS dropdown to tts-2, reload, still tts-2
- [ ] **Markup percentages persist**, credit rate persists
- [ ] **Reset button** wipes localStorage and restores ALL defaults (markup, rate, full catalog, all flow inputs)
- [ ] **Exported JSON contains the full state** (catalog + flows + markup + rate); importing the same file restores byte-for-byte equivalent state
- [ ] If a flow's selected provider row is deleted, the dropdown gracefully falls back to the first row in that category and the fallback selection itself persists
- [ ] **Save button behaviors:**
  - [ ] Save click: flushes draft to canonical, updates timestamp, flashes "Saved ✓" toast
  - [ ] Save button shows red dot (`Save •`) when state is dirty, plain when clean
  - [ ] Topbar status reads "● Unsaved changes" or "✓ All changes saved" correspondingly
  - [ ] Cmd/Ctrl+S triggers Save and suppresses browser save-page dialog
  - [ ] Clicking Save when clean is a safe no-op, shows "Already saved ✓"
- [ ] **Close prompt behaviors:**
  - [ ] Closing tab / navigating away while dirty → browser shows native "Leave site? Changes you made may not be saved" dialog
  - [ ] Closing tab while clean → no prompt, navigates away silently
  - [ ] If user closes without saving, draft is preserved in `localStorage["stori_cost_model_v1_draft"]`
  - [ ] On next load, if draft is newer than canonical, prompts "Restore unsaved changes from <time>? [Restore draft] [Discard draft]"
- [ ] **Reset confirmation:** clicking Reset shows a `confirm()` before wiping

### Pass C — Cross-checks (do these LAST)

- [ ] Sum of grand-total breakdown billed credits = grand-total billed credits (line-by-line ≥ summed flow totals because of per-call ceiling, never <)
- [ ] Each flow header total = sum of its variant totals divided by variant count? No — flow header = sum of all variants for the flow (informational); breakdown groups stay per-variant
- [ ] No flow has missing branch panel that's relevant to its calls
- [ ] No catalog row referenced by a provider dropdown is missing
- [ ] Setting markup to 0/0/0 makes every "actual $" cell equal "base $" exactly (sanity check)
- [ ] Setting rate to a value where every actual $ < rate makes every billed cr = 1 per call (per-item ceil)
- [ ] All file links in this plan resolve (catalog rows, flow names match implementation)

---

## 12. Build order (do not deviate)

1. Skeleton HTML with all sections (no JS yet) — copy structure from `mocks/cost-estimator-mock.html`, but use `data-bind`/`data-out` attributes everywhere instead of hardcoded numbers
2. CSS (copy from mock; verified working)
3. JS: `state` object + defaults
4. JS: `markupMultiplier`, `actualUsd`, `actualCr`, `billedCr`, `lineCost` helpers
5. JS: `renderCatalog()` — fills Section 1 tables and right-end summary cells
6. JS: `renderFlow(flowId)` — for each flow, fills branches, providers, regen, variants, breakdown lines, subtotal
7. JS: `renderGrand()` — fills grand-total card and breakdown
8. JS: `bindAll()` — attach input listeners that mutate state then call `render()`
9. JS: localStorage save/load on init and on change
10. JS: Export/Import handlers
11. Wire add-row / delete-row / preset buttons
12. Run **Verification Pass A** — fix any math discrepancies
13. Run **Verification Pass B** — fix any missing UI element
14. Run **Verification Pass C** — fix any cross-check failure
15. Run Pass A + B + C **a second time** end-to-end. Only ship if both passes are clean.

---

## 13. Files touched

- **Created:** `mocks/cost-estimator.html` (the working tool)
- **Created:** `/Users/praveen/Desktop/stori/cost-estimator-plan.md` (this plan)
- **Reference, not modified:** `mocks/cost-estimator-mock.html`

No other files in the repo are touched. No backend, no build step, no dist sync.
