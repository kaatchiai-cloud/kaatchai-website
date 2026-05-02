# ADR-SP-003 — Dialogue Attribution Format in Film/Narrative VO Plain Text

**Status:** Accepted  
**Date:** 2026-05-02  
**Phases affected:** P4, P5

---

## Context

Film/Narrative mode produces scenes that contain both `narration` (VO narration text) and `dialogue` (lines attributed to specific characters). When this script is fed to the TTS pipeline via the plain-text handoff, the TTS engine narrates a single voice — it cannot do multi-character voice synthesis.

The plain-text VO must:
1. Be fully speakable (no structural markup the TTS would literally read out)
2. Preserve the story structure so the user understands what is being narrated
3. Not lose the dialogue content

---

## Decision

**Format dialogue as attributed narration**: `"Character: line"` with a colon separator.

Example input (from JSON):
```json
{
  "narration": "The morning is quiet. She hasn't slept.",
  "dialogue": [
    { "character": "Anna", "line": "I'm not ready." },
    { "character": "Marcus", "line": "Nobody ever is." }
  ]
}
```

Output in plain-text VO:
```
The morning is quiet. She hasn't slept.

Anna: I'm not ready.

Marcus: Nobody ever is.
```

The TTS narrates: *"The morning is quiet. She hasn't slept. Anna: I'm not ready. Marcus: Nobody ever is."* — readable and speakable as attributed narration.

---

## Consequences

**Positive:**
- No information is lost — character names are preserved as spoken attribution, common in radio drama, audiobook, and documentary narration conventions.
- TTS output is coherent: "Anna: I'm not ready" sounds like narrated attribution, not broken markup.
- The `## 📋 Voiceover script` block in the `.md` download is also readable as a narration script — a human voice actor could read it line by line.

**Negative:**
- TTS pronunciation of character names depends on the name. Common English names ("Anna", "Marcus") narrate cleanly. Unusual names may be mispronounced. This is acceptable — film/narrative users can edit the VO text before launching.
- If the user's final film has professional voice actors doing per-character voices, this plain-text format is just a reference script, not the production audio. That is fine — the TTS output is a first-pass animation, not a final delivery.

---

## Alternatives considered

### Option A (chosen) — `Character: line` attribution
Natural, speakable, standard for narrated dialogue.

### Option B — Strip dialogue entirely, narration only
Loses character voices from the TTS output. For a film, dialogue is often the most important scene element — stripping it produces incoherent audio that doesn't match the visual. Rejected.

### Option C — Interleave with stage direction format (`[ANNA]`, `[MARCUS]`)
```
[ANNA] I'm not ready.
[MARCUS] Nobody ever is.
```
The TTS would literally read "open bracket ANNA close bracket I'm not ready" — spoken artefacts. Rejected.

### Option D — Use a em dash for dialogue (`— "I'm not ready."`)
Loses character attribution. Unattributed dialogue is confusing in a multi-character story. Rejected.

---

## Implementation

In `formatScriptToPlainText()`, film-narrative branch:

```js
if (Array.isArray(s.scenes)) {
  s.scenes.forEach(sc => {
    if (sc.narration) lines.push(sc.narration);
    if (Array.isArray(sc.dialogue)) {
      sc.dialogue.forEach(dl => {
        if (dl.line) lines.push(`${dl.character}: ${dl.line}`);
      });
    }
  });
}
return lines.join('\n\n');
```

The double-newline separator creates paragraph breaks that the TTS pipeline uses for natural pausing between narration blocks.
