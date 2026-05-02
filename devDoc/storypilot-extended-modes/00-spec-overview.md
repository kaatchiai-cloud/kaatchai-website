# Storypilot Extended Modes — Spec Overview

> **Subdirectory:** `devDoc/storypilot-extended-modes/`
> **Status:** Planning — pre-build
> **Parent plan:** `/Users/praveen/Desktop/stori/storypilot-plan.md` (baseline Storypilot v1)
> **Does NOT touch:** `devDoc/` root files (canvas-graph redesign lives there — separate product area)

---

## What this spec covers

Storypilot v1 ships two AI modes tied to the **pipeline destination**: Autopilot (short reel) and Copilot (long-form video). Both use the same wizard-to-chat-to-finalise flow; the mode choice determines which system prompt runs and which pipeline receives the finished script.

This spec defines **two new purpose-built modes** that are NOT downstream pipeline aliases — they are distinct creative briefs with their own conversation shape, finalise output schema, and handoff target:

| Mode | What it is | Primary user | Handoff target |
|---|---|---|---|
| **Brand / Product** | Script coach for product demos, brand promos, and launch videos. Balances storytelling with commercial objectives — messaging hierarchy, product benefits, brand voice. | Brand teams, founders, marketers | **Always Copilot** — brand/product videos require per-scene control for product placement, visual precision, and brand consistency regardless of duration |
| **Film / Narrative** | Script coach for short films, documentaries, narrative projects, and creative works. Structures dramatic arcs, characters, dialogue lines, and scene mood. | Independent creators, filmmakers, students | **Always Copilot** — film projects require per-scene control for character consistency, composition, and emotional beats regardless of duration |

**Quick / Social** (existing v1 mode) remains unchanged: duration-based routing — short → Autopilot, medium/long → Copilot.

### Why two separate modes instead of expanding the existing wizard prompts

1. **Different conversation shape.** Brand/Product mode must extract a core value proposition, a product claim, and a CTA hierarchy early in the conversation — the AI needs to function as a brand strategist, not just a creative writer. Film/Narrative mode needs to establish characters, dramatic premise, and emotional arc — fundamentally different cognitive work.

2. **Different finalise output schema.** Brand/Product produces a structured brief with `brand`, `product`, `hook`, `proof_points[]`, and `cta_hierarchy` alongside scenes. Film/Narrative produces `characters[]`, `acts[]` (3-act or 5-act), and `scene` entries with `dialogue` lines.

3. **Different downstream handoff text.** The plain-text VO fed to the pipeline differs: Brand/Product is ad-copy voice — punchy, claim-first. Film/Narrative is storytelling voice — narration + dialogue interleaved.

4. **Mode clarity for users.** Presenting "Brand / product video" as a wizard chip (as in v1) and then running the generic Copilot system prompt produces mediocre results. A purpose-built mode produces dramatically better output.

---

## Selector screen hierarchy

The brainstorm selector screen (`#bs-selector`) is redesigned from a chip-based wizard into a **three-card mode selector with deliberate visual hierarchy**:

```
┌────────────────────────────────────────────────────────────┐
│  ┌──────────────────────┐   ┌──────────────────────────┐  │
│  │   Brand / Product    │   │          Film            │  │
│  │  "Precision video    │   │  "Prototype your story   │  │
│  │   for your brand"    │   │   before you shoot"      │  │
│  │  → Always Copilot    │   │  → Always Copilot        │  │
│  └──────────────────────┘   └──────────────────────────┘  │
│                                                            │
│         Quick Script  →  "Just have an idea?"             │
│         (smaller secondary link / card below the heroes)  │
└────────────────────────────────────────────────────────────┘
```

**Why this hierarchy:**
- Brand/Product and Film are the product's differentiators — they should lead the page and signal what this tool is for.
- Quick/Social is accessible but not the hero — casual users can reach it, but it doesn't define the product's identity.
- A professional user arriving at the brainstorm screen sees two clear, purposeful options immediately. They don't have to look past "social media clip" to find their mode.

**Q2 (length) is skipped for Brand/Product and Film** — clicking either hero card enters the chat directly (with a brief asset-awareness pre-step if the user has defined assets; otherwise straight to chat). The pipeline is already determined (always Copilot), so the length question is unnecessary. The AI will determine appropriate duration during conversation.

**Q2 remains for Quick/Social** — clicking the Quick card shows the existing length chip row (short/medium/long), which determines the Autopilot vs Copilot recommendation as in v1.

---

## Relationship to v1

These modes **extend, not replace, v1**. The full v1 architecture (wizard, chat, finalise, router, handoff, localStorage TTL, model picker, provider lock) is reused unchanged. The delta is:

- Selector screen redesigned to three-card hierarchy (Brand/Product + Film as heroes; Quick as secondary)
- Two new `SYSTEM_PROMPTS` entries in `26-brainstorm.js`
- Two new `FINALISE_PROMPTS` entries in `26-brainstorm.js`
- Two new `_formatPlainText*` logic branches in `formatScriptToPlainText()`
- Two new render branches in `renderFinalScript()` and `renderScriptMarkdown()`
- Brand/Product and Film modes bypass Q2 entirely and hard-route to Copilot
- Quick/Social retains full Q1+Q2 wizard behaviour
- No new files required — all changes in `js/26-brainstorm.js` and `index.html`

---

## Artifacts in this subdirectory

| File | Contents |
|---|---|
| `00-spec-overview.md` | This file — scope, relationship to v1, artifact index |
| `01-brand-product-mode.md` | Full spec for Brand/Product mode |
| `02-film-narrative-mode.md` | Full spec for Film/Narrative mode |
| `03-wizard-and-routing-changes.md` | Diff to wizard Q1 chips, recommendation logic, and mode → pipeline routing table |
| `04-schema-reference.md` | Complete JSON output schemas for both new modes (alongside v1 schemas for reference) |
| `05-system-prompts.md` | Verbatim system prompts and finalise prompts for both modes |
| `06-phase-breakdown.md` | Implementation phases, effort estimates, acceptance criteria |
| `adr/` | Architecture Decision Records for cross-cutting decisions |

---

## Constraints inherited from v1 (non-negotiable)

- All new CSS under `#brainstorm-page` scope only. No global style changes.
- All new JS inside `js/26-brainstorm.js` only. No new files.
- Aurora design tokens only (`--lp-*`). No new hard-coded colors.
- Light and dark theme parity — both tested on all new UI elements.
- `callChatLLM()` router is reused unchanged. Mode selection is purely a system-prompt swap.
- Provider lock, TTL persistence, 15-message cap, 3-exchange finalise gate — all inherited.
- Auto-download `.md` on Send click — inherited and extended to new schemas.
- `window.__storiHandoff` handoff pattern — inherited.

---

## Open design questions (to resolve before build)

1. ~~**Mode selector placement.**~~ **RESOLVED:** Three-card hierarchy on the selector screen — Brand/Product and Film as hero cards, Quick as secondary link below. See Selector screen hierarchy section above.

2. ~~**Brand/Product → pipeline split.**~~ **RESOLVED:** Brand/Product always routes to Copilot. Brand videos require per-scene control for product placement, visual precision, and brand consistency regardless of duration. Q2 length question is skipped entirely.

3. **Film/Narrative scene count.** Copilot's current finalise prompt doesn't cap scenes. Film mode may generate 15–25 scenes for a short film. Does the finalise output become very long? Should we cap at 12 scenes and note "expand in Copilot's editor"?

4. **Dialogue in the plain-text VO.** Film/Narrative scenes have `dialogue` lines attributed to characters. The TTS pipeline can only narrate one voice. Should `formatScriptToPlainText()` for film mode interleave dialogue as narrated lines ("Character A says: ...") or strip them to pure narration?

5. **Brand/Product "claim verification" guardrail.** Brand scripts can produce superlative claims ("the world's best", "proven to..."). Should the system prompt explicitly instruct the AI not to write unverifiable claims? Or leave it to user judgment?
