# Storypilot Extended Modes — Film / Narrative Mode

> **Mode key:** `film-narrative`
> **Pipeline:** Always Copilot — film projects require per-scene control for character consistency, composition, and emotional beats regardless of duration.

---

## 1. Mode Identity

**What it is.** A script coach for short films, micro-documentaries, narrative videos, and creative storytelling projects. The AI acts as a story development collaborator — building dramatic premise, character motivation, scene arc, and emotional payoff through conversation.

**Who it's for.** Independent filmmakers developing a short film concept, documentary makers shaping their narrative spine, students in film courses, creative video makers who want their work to feel like a proper story rather than a montage.

**What makes it distinct from generic Copilot mode.**
- Establishes `characters[]` early — without characters, there's no story.
- Works with a defined dramatic structure: 3-act (setup / confrontation / resolution) or 5-act (exposition / rising action / climax / falling action / denouement). User picks; AI scaffolds accordingly.
- Each scene can carry `dialogue` lines attributed to specific characters — not just narration.
- The finalise output includes `acts[]` — the script is structured by dramatic act before being broken into scenes — which gives the user a higher-level view of their story shape.
- The plain-text VO formatter handles dialogue attribution (character name prefix) so the TTS pipeline receives speakable narration without losing the story structure visible in the download.

---

## 2. Mode Routing

**Entry point:** Hero card on the brainstorm selector screen, labeled `🎬 Film` with tagline "Prototype your story before you shoot".

**Pipeline:** Always Copilot — no Q2 length question is shown. Clicking this card skips the wizard entirely and enters the chat screen directly. `brainstormState.mode = 'film-narrative'` and `brainstormState.pipeline = 'copilot'` are set immediately on card click.

**Why Q2 is skipped:** Duration is irrelevant to the pipeline decision for film projects. A 90-second short and a 5-minute documentary both require Copilot's per-scene control for character consistency, composition, and emotional beat management. The AI will negotiate appropriate duration and scene count during conversation based on the story's needs.

**Wizard context injected into system prompt:**

```
[User context: video type = film/narrative. Pipeline: Copilot. Skip re-asking these.]
```

---

## 3. System Prompt

See `05-system-prompts.md` §2 for the verbatim prompt. Summary of key behaviours:

**Required early extractions (first 1–3 exchanges):**
- Story premise: one-sentence description of what happens (not "what it's about" — what *happens*)
- Characters: who is in this story, what do they want, what's stopping them
- Tone / genre: drama / comedy / thriller / documentary / experimental / hybrid
- Dramatic structure preference: 3-act (default, simpler) or 5-act (more nuanced arc)
- Intended emotional effect: what should the viewer feel at the end?

**AI conversation arc:**
1. Opens by asking for premise + protagonist + what they want (three things in one natural question, not a checklist).
2. After premise lands, proposes a dramatic structure (3-act recommended for < 3 min; 5-act for longer). Explains what each act covers in this specific story.
3. Builds act by act — not scene by scene. Gets the arc right before filling in individual scenes.
4. Within each act, fills in scenes collaboratively. Each scene includes: what happens (action), what the character is feeling (subtext), and what the visual says (the image that carries the scene).
5. Offers dialogue suggestions for key moments — never writes full dialogue exchanges unprompted. Asks "do you want me to draft a line for X?" rather than filling in every word.
6. Before finalising, does a quick "arc check": does the ending pay off the premise? Does the character change? If not, flags it and asks if that's intentional.

**Dialogue handling in conversation:**
- Dialogue suggestions during brainstorm are marked `[LINE: Character] "..."` so the user and AI can distinguish proposed dialogue from narration.
- The finalise JSON separates `narration` and `dialogue` within each scene.

**Scene count guidance:**
- Under 2 minutes: aim for 5–8 scenes
- 2–5 minutes: aim for 8–14 scenes
- Over 5 minutes: no cap, but AI notes when the scene count may exceed Copilot's comfortable display range

---

## 4. Finalise Output Schema

```json
{
  "title":     "string — working title",
  "premise":   "string — one-sentence description of what happens",
  "genre":     "string — drama | comedy | thriller | documentary | experimental",
  "tone":      "string — emotional tone and style description",
  "audience":  "string — intended audience",
  "estDuration": "string — e.g. '2:30', '4:00'",
  "structure": "3-act | 5-act",
  "characters": [
    {
      "name": "string",
      "role": "protagonist | antagonist | supporting | narrator",
      "want": "string — what they want in this story",
      "obstacle": "string — what stands in their way"
    }
  ],
  "acts": [
    {
      "n":     1,
      "label": "setup | confrontation | resolution",
      "summary": "string — one sentence describing what this act accomplishes dramatically"
    }
  ],
  "scenes": [
    {
      "n":         1,
      "act":       1,
      "timeRange": "0:00–0:30",
      "visual":    "string — what the camera sees; the image that carries this scene",
      "narration": "string — VO narration text (empty string if scene is dialogue-only)",
      "dialogue":  [
        { "character": "string", "line": "string" }
      ],
      "mood":      "string — emotional tone of this scene"
    }
  ]
}
```

**Validation rules (enforced by finalise prompt):**
- `characters` must contain at least 1 entry with a named protagonist.
- `acts` must match the declared `structure` (3-act: 3 entries; 5-act: 5 entries).
- Each scene must have `act` pointing to a valid act number.
- `narration` and `dialogue` can coexist in a scene — both are valid.
- `dialogue` array can be empty (`[]`) for narration-only scenes.
- Maximum 14 scenes for medium-length; no hard cap for in-depth, but finalise prompt requests grouping into acts clearly. Copilot handles any scene count.

---

## 5. Plain-Text VO Formatter

`formatScriptToPlainText()` extended with a `film-narrative` branch:

```js
// Film/narrative shape (identified by presence of 'characters' and 'acts' fields)
if (s.characters !== undefined && s.acts !== undefined) {
  const lines = [];
  if (Array.isArray(s.scenes)) {
    s.scenes.forEach(sc => {
      // Narration comes first (unattributed VO)
      if (sc.narration) lines.push(sc.narration);
      // Dialogue lines are attributed so TTS can narrate them
      if (Array.isArray(sc.dialogue)) {
        sc.dialogue.forEach(dl => {
          if (dl.line) lines.push(`${dl.character}: ${dl.line}`);
        });
      }
    });
  }
  // Join with double newline so Copilot's TTS receives paragraph breaks
  return lines.join('\n\n');
}
```

**Rationale for dialogue attribution format (`Character: line`):** Copilot's TTS reads this as narrated attribution — "Character says: line" — rather than attempting multi-voice synthesis. It preserves the story structure in the audio while being speakable by a single TTS voice.

---

## 6. Markdown Download Format

```markdown
# {title}

**Genre:** {genre} · **Tone:** {tone} · **Duration:** {estDuration}
**Structure:** {structure}

---

## Premise

{premise}

---

## Characters

**{name}** ({role})
- Wants: {want}
- Obstacle: {obstacle}

---

## Act Structure

**Act 1 — {label}:** {summary}
**Act 2 — {label}:** {summary}
**Act 3 — {label}:** {summary}

---

## Scene 1 — Act 1 ({timeRange})
**Visual:** {visual}
**Narration:** {narration}
**{character}:** "{line}"
**Mood:** {mood}

...

---

## 📋 Voiceover script (copy this to use in Stori)

{plainText — narration + attributed dialogue, paragraph-separated}

---

*Created with Storypilot · Film/Narrative mode · {tier} · {date}*
```

---

## 7. Suggestion Chips (Empty State)

Three example prompts shown as chips in the initial chat greeting for film/narrative mode:

- "A short film about a musician playing their last gig"
- "Documentary — portrait of a local craftsperson"
- "A 2-minute story about two strangers on a night bus"

---

## 8. Mode Tag in Chat Header

The `#bs-mode-tag` element shows:

- Content: `🎬 Film / Narrative`
- Color: accent tint (same `--lp-accent` pattern — no new color)

---

## 9. Arc Check Banner

After the user sends a message that contains the finalise trigger phrase OR after exchange 12, the AI performs an "arc check" summary — a short message that names:
- The protagonist and what they want
- The central conflict
- What changes or resolves at the end

This is delivered as a regular AI message, prefixed with: `**Quick arc check before we finalise:**`

The user can confirm or correct. This is implemented as a prompt instruction in the system prompt (message 12 nudge), not as a separate UI element.

---

## 10. Acceptance Criteria

- [ ] Film hero card on selector screen routes directly to chat — no Q2 length step shown.
- [ ] `brainstormState.mode === 'film-narrative'` and `brainstormState.pipeline === 'copilot'` after card click.
- [ ] Chat header tag shows `🎬 Film / Narrative`.
- [ ] First AI message asks for premise + protagonist + want in one natural question — NOT a numbered checklist.
- [ ] AI proposes a dramatic structure and works act-by-act before filling individual scenes.
- [ ] AI offers dialogue suggestions as options, not unprompted full dialogues.
- [ ] AI performs arc check around message 12.
- [ ] Finalise produces JSON with all required fields: `characters[]`, `acts[]`, `scenes[].act`, `scenes[].dialogue[]`.
- [ ] JSON parses cleanly; `renderFinalScript()` displays Characters and Act Structure sections above scenes.
- [ ] `.md` download includes Characters, Act Structure, and Premise sections.
- [ ] VO plain-text interleaves narration and dialogue attribution correctly.
- [ ] Send to Copilot works with the film-narrative script; `#create-tts-text` pre-filled with attributed VO.
- [ ] No "Send to Autopilot" option is shown for film-narrative mode.
- [ ] Light mode and dark mode — all UI elements correct.
- [ ] Mobile — chat scrolls, chips are reachable.
