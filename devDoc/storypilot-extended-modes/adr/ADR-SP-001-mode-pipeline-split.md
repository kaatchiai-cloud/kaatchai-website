# ADR-SP-001 — Script Mode vs Pipeline Destination: Two Separate Fields

**Status:** Accepted  
**Date:** 2026-05-02  
**Phases affected:** All extended modes phases (P1–P8)

---

## Context

Storypilot v1 uses a single `brainstormState.mode` field that simultaneously determines (a) which system prompt to run (the creative brief type) and (b) which pipeline to send the finished script to. In v1, the two concepts are always the same: `'autopilot'` means "run the short-reel system prompt AND hand off to Autopilot"; `'copilot'` means "run the long-form system prompt AND hand off to Copilot".

With extended modes, this coupling breaks. `brand-product` and `film-narrative` are creative mode types with their own system prompts and finalise schemas, but their pipeline destination is always Copilot — it is not a user choice. The creative brief type and the pipeline destination are now independent concepts.

**Key product decisions driving this ADR:**

- **Brand/Product always routes to Copilot.** Brand videos require per-scene control for product placement, visual precision, and brand consistency regardless of video duration. A 30-second brand ad and a 3-minute brand film both need Copilot. Q2 (length) is skipped entirely for this mode.
- **Film always routes to Copilot.** Film projects require per-scene control for character consistency, composition, and emotional beat management regardless of duration. Q2 is skipped for this mode too.
- **Quick/Social remains duration-based.** Short → Autopilot, medium/long → Copilot — unchanged from v1.

---

## Decision

**Split `mode` and `pipeline` into two separate fields on `brainstormState`.**

| Field | What it controls | Values |
|---|---|---|
| `brainstormState.mode` | Which system prompt runs; which finalise schema is produced; which render branch executes; which VO formatter branch runs; which markdown template is used | `'social'` \| `'tutorial'` \| `'brand-product'` \| `'film-narrative'` |
| `brainstormState.pipeline` | Which pipeline receives the script; what the Send-to button says; which handoff target is used | `'autopilot'` \| `'copilot'` |

`mode` is set from:
- The hero card clicked (`brand-product` or `film-narrative`) — set directly in `_confirmMode()`
- The wizard Q1 chip for Quick mode (`social` or `tutorial`) — set via `_confirmWizard()`

`pipeline` is set from:
- Always `'copilot'` for Brand/Product and Film — set in `_confirmMode()`
- Wizard recommendation or user's manual override for Quick mode — set in `_confirmWizard()`

---

## Consequences

**Positive:**
- `_updateSendToButton()` and `_sendToPipeline()` are cleanly separated from system prompt logic — they only care about `pipeline`, not `mode`.
- The finalise schema is determined by `mode`, not pipeline — a Brand/Product script always produces the full brand schema (with `core_claim`, `proof_points`, etc.) regardless of how the session was initiated.
- The plain-text VO formatter always uses the `mode` branch, which produces the correct VO shape for that creative type.
- Brand/Product and Film routing is deterministic and requires no Q2 question — simpler UX, clearer positioning.

**Negative:**
- One new field to persist in localStorage (`pipeline`). Backwards compat handled by defaulting `pipeline = mode` on restore if the field is missing.
- `_confirmWizard()` must be updated to set both fields separately rather than one combined field.
- Every call site that previously read `brainstormState.mode` to determine the pipeline must now read `brainstormState.pipeline` instead. Audit required (see affected code locations below).

---

## Options considered

### Option A (chosen) — Two fields: `mode` + `pipeline`
Explicitly models the fact that creative-brief type and pipeline destination are independent concerns. Clean, auditable, backwards compatible.

### Option B — Keep single field; change values to compound keys
Example: `mode = 'brand-product/copilot'`. Rejected: compounds two concerns into one string; splitting it at every call site is error-prone; renders the field semantically ambiguous.

### Option C — Keep single `mode` field; derive pipeline from a lookup table
Example: `PIPELINE_FOR_MODE = { 'brand-product': 'copilot', 'film-narrative': 'copilot', 'social': ... }`. Rejected for Quick mode: the pipeline is NOT always deterministic from the Quick mode type — user can override Autopilot ↔ Copilot via the Switch button. A lookup table cannot encode the user's manual switch for Quick mode. Valid for Brand/Film (pipeline is fixed), but the inconsistency makes it worse overall than Option A.

---

## Affected code locations

| Location | What changes |
|---|---|
| `brainstormState` object literal | Add `pipeline: null` field |
| `_loadSession()` | Default `pipeline = mode` if missing in saved state (v1 backwards compat) |
| `_confirmMode(mode, pipeline)` | New function — sets both `mode` and `pipeline` directly for hero card clicks |
| `_confirmWizard(pipelineTarget)` | Updated — sets `brainstormState.mode = wizardAnswers.type` AND `brainstormState.pipeline = pipelineTarget` |
| `_updateModeTag(mode)` | Reads `mode` — no change needed to logic, but must handle new keys |
| `_updateSendToButton(target)` | Must read `brainstormState.pipeline` (or the argument passed from `pipeline` field) — not `mode` |
| `_sendToPipeline()` | Must read `brainstormState.pipeline`, not `brainstormState.mode` |
| `_sendMessage()` / `_renderGreeting()` | Must read `brainstormState.mode` for system prompt lookup — verify |
| `_finaliseScript()` | Must read `brainstormState.mode` for finalise prompt lookup — verify |
| `formatScriptToPlainText()` | Dispatches by schema shape (field detection), not by `mode` — no change needed |
| `renderScriptMarkdown()` | Reads `brainstormState.mode` for footer label — no change needed |
