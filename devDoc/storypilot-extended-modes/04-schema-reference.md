# Storypilot Extended Modes — JSON Schema Reference

> Complete output schemas for all four Storypilot modes, side by side. Use this as the single source of truth when writing finalise prompts, render functions, and markdown templates.

---

## Schema identification logic

`formatScriptToPlainText()`, `renderFinalScript()`, and `renderScriptMarkdown()` all need to detect which schema shape a parsed JSON object is. Use this decision order:

```js
function detectScriptShape(s) {
  if (s.characters !== undefined && s.acts !== undefined)  return 'film-narrative';
  if (s.core_claim !== undefined)                          return 'brand-product';
  if (s.hook !== undefined && s.concept === undefined)     return 'autopilot';
  return 'copilot';   // fallback — has scenes + concept/musicTone
}
```

This detection is field-based (not mode-state-based) so the downloaded `.md` can be re-imported and re-identified correctly in a future "load .md" feature (v2).

---

## Schema 1 — Autopilot (v1, short reel)

**Triggered by:** `mode === 'autopilot'` AND `pipeline === 'autopilot'`  
**Pipeline target:** Autopilot

```json
{
  "title":       "string",
  "tone":        "string",
  "platform":    "string",
  "estDuration": "string — e.g. '45s'",
  "hook":        "string — opening line / first 3 seconds",
  "scenes": [
    {
      "n":         1,
      "timeRange": "0-3s",
      "visual":    "string",
      "voice":     "string"
    }
  ],
  "cta": "string"
}
```

**Constraints:**
- Max 9 scenes
- `estDuration` ≤ 90s
- Every scene has `voice` (spoken / on-screen text)

**Shape identifier:** presence of `hook` + absence of `concept` and `core_claim` and `characters`

---

## Schema 2 — Copilot (v1, long-form)

**Triggered by:** `mode === 'copilot'` AND `pipeline === 'copilot'`  
**Pipeline target:** Copilot

```json
{
  "title":       "string",
  "concept":     "string — one-paragraph description of the video",
  "audience":    "string",
  "tone":        "string",
  "musicTone":   "string",
  "estDuration": "string — e.g. '2:30'",
  "scenes": [
    {
      "n":         1,
      "section":   "intro | body | outro",
      "timeRange": "0:00-0:15",
      "visual":    "string",
      "narration": "string",
      "mood":      "string"
    }
  ]
}
```

**Constraints:**
- No scene cap
- `section` must be one of `intro`, `body`, `outro`

**Shape identifier:** presence of `concept` field

---

## Schema 3 — Brand / Product (extended mode)

**Triggered by:** `mode === 'brand-product'`  
**Pipeline target:** `pipeline` field — either `'autopilot'` or `'copilot'`

```json
{
  "title":       "string",
  "brand":       "string",
  "product":     "string",
  "core_claim":  "string — the single most important product claim",
  "audience":    "string",
  "tone":        "string",
  "narrative_structure": "feature-led | problem-led | transformation | social-proof",
  "estDuration": "string — e.g. '45s', '1:30'",
  "hook":        "string — opening line",
  "proof_points": [
    "string — specific differentiator or supporting claim"
  ],
  "scenes": [
    {
      "n":         1,
      "role":      "hook | problem | reveal | proof | cta",
      "timeRange": "string",
      "visual":    "string",
      "voice":     "string"
    }
  ],
  "cta": "string"
}
```

**Constraints:**
- `proof_points`: min 1, max 4 items
- At least one scene with `role === 'proof'`
- At least one scene with `role === 'cta'` (or `cta` field covers it)
- Autopilot pipeline: max 9 scenes, `estDuration` ≤ 90s
- Copilot pipeline: no scene cap, `estDuration` up to "5:00"

**Shape identifier:** presence of `core_claim` field

---

## Schema 4 — Film / Narrative (extended mode)

**Triggered by:** `mode === 'film-narrative'`  
**Pipeline target:** `pipeline` field — either `'autopilot'` (teaser) or `'copilot'`

```json
{
  "title":       "string",
  "premise":     "string — one sentence describing what happens",
  "genre":       "drama | comedy | thriller | documentary | experimental",
  "tone":        "string",
  "audience":    "string",
  "estDuration": "string — e.g. '2:30'",
  "structure":   "3-act | 5-act",
  "characters": [
    {
      "name":     "string",
      "role":     "protagonist | antagonist | supporting | narrator",
      "want":     "string — what they want in this story",
      "obstacle": "string — what stands in their way"
    }
  ],
  "acts": [
    {
      "n":       1,
      "label":   "setup | rising-action | climax | falling-action | resolution | confrontation",
      "summary": "string — one sentence describing what this act accomplishes"
    }
  ],
  "scenes": [
    {
      "n":         1,
      "act":       1,
      "timeRange": "0:00-0:30",
      "visual":    "string",
      "narration": "string — VO narration (empty string if dialogue-only)",
      "dialogue": [
        { "character": "string", "line": "string" }
      ],
      "mood":      "string"
    }
  ]
}
```

**Constraints:**
- `characters`: min 1 entry; protagonist required
- `acts` count must match `structure`: 3-act → 3 entries; 5-act → 5 entries
- `acts[].label` valid values:
  - 3-act: `setup`, `confrontation`, `resolution`
  - 5-act: `setup`, `rising-action`, `climax`, `falling-action`, `resolution`
- Each `scene.act` must reference a valid act number (1-indexed)
- `dialogue` can be an empty array for narration-only scenes
- Autopilot pipeline (teaser cut): max 9 scenes; acts collapsed to a single "highlight" summary act
- Copilot pipeline: no scene cap

**Shape identifier:** presence of both `characters` and `acts` fields

---

## Plain-Text VO Output Summary

| Schema | VO output format | Separator |
|---|---|---|
| Autopilot | `hook + scenes[].voice + cta` joined | single space |
| Copilot | `scenes[].narration` joined | double newline |
| Brand/Product | `hook + scenes[].voice + cta` joined | single space |
| Film/Narrative | `scenes[].narration` + `Character: line` for each dialogue entry | double newline |

---

## Markdown Footer Line Per Mode

```
*Created with Storypilot · Autopilot mode · {tier} · {date}*
*Created with Storypilot · Long-form mode · {tier} · {date}*
*Created with Storypilot · Brand/Product mode · {tier} · {date}*
*Created with Storypilot · Film/Narrative mode · {tier} · {date}*
```

The `renderScriptMarkdown()` helper maps `brainstormState.mode` to these labels:

```js
const MODE_LABEL = {
  'autopilot':     'Autopilot mode',
  'copilot':       'Long-form mode',
  'brand-product': 'Brand/Product mode',
  'film-narrative':'Film/Narrative mode',
};
```
