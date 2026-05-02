# Storypilot Extended Modes — Brand / Product Mode

> **Mode key:** `brand-product`
> **Pipeline:** Always Copilot — brand/product videos require per-scene control for product placement, visual precision, and brand consistency regardless of duration.

---

## 1. Mode Identity

**What it is.** A script coach for product demos, brand promos, launch videos, and commercial storytelling. The AI acts as a brand strategist + copywriter, helping the user develop a script that is both emotionally resonant and commercially purposeful — not just visually interesting.

**Who it's for.** Founders launching a product, in-house brand teams creating video content, marketers producing social ads, freelancers writing video scripts for clients.

**What makes it distinct from generic Autopilot/Copilot modes.**
- Extracts a `brand`, `product`, and `core_claim` early in the conversation — the AI can't write a good brand script without knowing what problem the product solves and for whom.
- Maintains a "messaging hierarchy" across the conversation: Primary message (what you want them to feel) → Secondary messages (what you want them to know) → CTA (what you want them to do).
- The finalise output includes `proof_points[]` — specific product differentiators or supporting claims — that the pipeline can translate into supporting scenes.
- The system prompt instructs the AI to gently push back if the user's stated claim is vague ("the best quality") and ask for something concrete ("5x faster than X").

---

## 2. Mode Routing

**Entry point:** Hero card on the brainstorm selector screen, labeled `🏷 Brand / Product` with tagline "Precision video for your brand".

**Pipeline:** Always Copilot — no Q2 length question is shown. Clicking this card skips the wizard entirely and enters the chat screen directly. `brainstormState.mode = 'brand-product'` and `brainstormState.pipeline = 'copilot'` are set immediately on card click.

**Why Q2 is skipped:** Duration is irrelevant to the pipeline decision for brand content. A 30-second brand ad and a 3-minute brand film both require Copilot's per-scene control. The AI will negotiate appropriate duration during conversation.

**Wizard context injected into system prompt** (appended as hidden context before first API call):

```
[User context: video type = brand/product. Pipeline: Copilot. Skip re-asking these.]
```

---

## 3. System Prompt

See `05-system-prompts.md` §1 for the verbatim prompt. Summary of key behaviours:

**Required early extractions (first 1–3 exchanges):**
- Brand/company name (or "generic product" if no brand)
- Product name and one-line description
- Core claim: the single most important thing about the product (must be specific and concrete)
- Target audience: who this video is FOR, not just who watches it
- Emotional tone: aspirational / practical / urgent / warm / playful

**AI conversation arc:**
1. Opens by asking for brand + product + the ONE thing they want the viewer to walk away knowing.
2. Proposes a narrative structure based on the core claim: Feature-led (show what it does) / Problem-led (dramatise the pain it solves) / Transformation (before → after) / Social proof (real person story). Recommends one; user can override.
3. Builds the script by narrative role, not by scene number: Hook scene → Problem/Context → Product reveal → Proof point(s) → CTA. Gets approval at the narrative role level, not every scene.
4. Weaves the core claim into at least two different moments in the script (not just the CTA).
5. At the end, confirms the messaging hierarchy is intact: does the final cut still lead with the primary message?

**Brand voice guardrail:**
- If user has stated a brand voice (e.g. "professional and warm"), the AI explicitly acknowledges and mirrors it in any copy suggestions.
- If the user writes vague superlative claims ("the best", "revolutionary"), the AI asks "what makes it the best? Is there a specific proof point we can use?" — once, not on every turn.

---

## 4. Finalise Output Schema

```json
{
  "title":       "string — script working title",
  "brand":       "string — brand / company name",
  "product":     "string — product name",
  "core_claim":  "string — the single most important thing about the product",
  "audience":    "string — target audience description",
  "tone":        "string — emotional / brand tone",
  "narrative_structure": "feature-led | problem-led | transformation | social-proof",
  "estDuration": "string — e.g. '45s', '1:30', '2:00'",
  "hook":        "string — opening line / first 3 seconds",
  "proof_points": [
    "string — specific differentiator or supporting claim",
    "string"
  ],
  "scenes": [
    {
      "n":         1,
      "role":      "hook | problem | reveal | proof | cta",
      "timeRange": "0–3s",
      "visual":    "string — scene visual description",
      "voice":     "string — VO / on-screen text"
    }
  ],
  "cta": "string — final call to action (spoken or on-screen)"
}
```

**Validation rules (enforced by finalise prompt):**
- `core_claim` must not be empty and must not contain superlatives without qualification.
- `proof_points` must contain at least 1 item and at most 4.
- At least one scene must have `role === "proof"`.
- At least one scene must have `role === "cta"` (or `cta` field covers this).
- No scene cap — Copilot handles any scene count. `estDuration` can be "0:30" to "5:00". The AI negotiates duration during conversation based on content needs.

---

## 5. Plain-Text VO Formatter

`formatScriptToPlainText()` extended with a `brand-product` branch:

```js
// Brand/product shape (identified by presence of 'core_claim' field)
if (s.core_claim !== undefined) {
  const lines = [];
  if (s.hook) lines.push(s.hook);
  if (Array.isArray(s.scenes)) {
    s.scenes.forEach(sc => {
      if (sc.voice) lines.push(sc.voice);
    });
  }
  if (s.cta) lines.push(s.cta);
  return lines.join(' ');    // single flowing paragraph for TTS, same as autopilot shape
}
```

The proof_points are NOT included in the VO text — they appear in the `.md` download as metadata, not as spoken lines. Individual scene `voice` fields carry the proof points in their proper narrative context.

---

## 6. Markdown Download Format

The `.md` download for brand/product mode adds a **Brand Brief** header block before the scenes:

```markdown
# {title}

**Brand:** {brand} · **Product:** {product}
**Audience:** {audience} · **Tone:** {tone} · **Duration:** {estDuration}

---

## Brand Brief

**Core claim:** {core_claim}

**Proof points:**
- {proof_points[0]}
- {proof_points[1]}

**Narrative structure:** {narrative_structure}

---

## Hook (0–3s)
**Visual:** {hook visual}
**Voice:** {hook voice}

## Scene 1 — {role} ({timeRange})
**Visual:** {visual}
**Voice:** {voice}

...

## Call to Action
**Voice:** {cta}

---

## 📋 Voiceover script (copy this to use in Stori)

{plainText}

---

*Created with Storypilot · Brand/Product mode · {tier} · {date}*
```

---

## 7. Suggestion Chips (Empty State)

Three example prompts shown as chips in the initial chat greeting for brand/product mode:

- "Launch video for a new skincare product"
- "30-second brand ad for a SaaS tool"
- "Product demo for an app — before/after style"

---

## 8. Mode Tag in Chat Header

The `#bs-mode-tag` element (visible in the chat header) shows:

- Content: `🏷 Brand / Product`
- Color: accent tint (same `--lp-accent` pattern as other tags — no new color)

---

## 9. Acceptance Criteria

- [ ] Brand/Product hero card on selector screen routes directly to chat — no Q2 length step shown.
- [ ] `brainstormState.mode === 'brand-product'` and `brainstormState.pipeline === 'copilot'` after card click.
- [ ] Chat header tag shows `🏷 Brand / Product`.
- [ ] First AI message does NOT output a full script. It asks for brand + product + core claim naturally.
- [ ] AI pushes back (once) if a vague superlative claim is given.
- [ ] AI proposes a narrative structure and confirms before building.
- [ ] Finalise produces JSON with all required fields (`brand`, `product`, `core_claim`, `proof_points`, `narrative_structure`, `scenes[].role`).
- [ ] JSON parses cleanly; `renderFinalScript()` displays the Brand Brief block above the scenes.
- [ ] `.md` download includes the Brand Brief section.
- [ ] VO plain-text is clean prose without proof_point metadata artifacts.
- [ ] Send to Copilot works with the brand-product script.
- [ ] No "Send to Autopilot" option is shown for brand-product mode.
- [ ] Light mode and dark mode — all UI elements correct.
- [ ] Mobile — chat scrolls, chips are reachable.
