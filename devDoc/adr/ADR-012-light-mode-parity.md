# ADR-012 — Light-mode parity guarantee

- **Status:** Accepted (2026-05-01) — new in revision 1
- **Affected phases:** P01, P02, P03, P04, P05, P06, P07, P08 (every phase)

## Context

Stori ships with two first-class theme variants: `aurora.dark` (default) and `aurora.light`. Aurora light is fully defined in `css/themes.css:27–81` and works today across Landing, Copilot (`#create-page`), and Autopilot. The user has explicitly directed (2026-05-01): "we should use aurora theme. have it in plan. **both dark and light**."

Without this ADR, the natural development pattern is "design in dark, light gets fixed if/when issues are reported." That pattern produces a class of bugs:

- **Contrast failures.** A cyan accent that pops against `--lp-bg: #050814` (Aurora dark) washes out against `--lp-bg: #eef2f7` (Aurora light).
- **`color-mix` misalignment.** `color-mix(in oklch, var(--sock-video) 60%, var(--border))` calibrated against dark `--border` (rgba(255,255,255,0.08)) produces an invisible border on light `--border` (rgba(10,30,60,0.10)). The recipe needs per-theme tuning.
- **Glass translucency drift.** `--lp-card` is `rgba(255,255,255,0.035)` in dark (3.5% white tint) and `rgba(255,255,255,0.85)` in light (85% white). The "glass" effect inverts in feel — what reads as subtle frosted overlay in dark reads as nearly-opaque card in light.
- **Saturation issues.** Socket palette colors that are mid-saturation against a near-black background may be too light against a near-white background.
- **Status dot legibility.** A teal/mint dot against `--lp-card` dark glass is fine; against `--lp-card` light (near-white) it may be too faint unless the value is shifted darker.
- **Marquee fill (`color-mix(in oklch, var(--accent) 12%, transparent)`).** The 12% tint against `--lp-bg` dark and against `--lp-bg` light produce visually different rectangles — both should be visible but tuned.

If any of these slip into production light mode, users see a broken theme. If we ship "fix light later" we accumulate technical debt that has to be retrofitted across multiple files.

The redesign cannot regress `aurora.light`. Aurora light works today; the canvas redesign must keep it working.

## Decision

### 1 — "Both themes" is a gate at every acceptance step

Every phase's acceptance criteria includes an explicit "verify in BOTH `aurora.dark` AND `aurora.light`" bullet. Engineering does not consider a phase "done" until both themes are visually validated.

Phase docs encode this as:
- A specific bullet in the acceptance section ("Verify in both themes per ADR-12").
- A test step in the manual test plan that toggles theme.
- Explicit per-theme expected outcomes in the test table when colors differ between themes.

### 2 — Hazard list and mitigation patterns

The following are pre-known hazards and the patterns that address them:

| Hazard | Mitigation |
|---|---|
| Cyan accent washes out on light bg | Aurora's light `--lp-accent: oklch(50% 0.16 220)` is deeper than dark's `oklch(80% 0.14 200)`. Token-swap handles this for free if rules use `--accent` (= `--lp-accent`) and not bare hex. |
| `color-mix` recipes invisible on one theme | Verify per-theme; if the recipe doesn't carry over, add a `html[data-theme="light"]` override with a tuned percentage (e.g. light `.has-vids` border = `color-mix(... 80%, var(--border))` instead of 60%). |
| `--lp-card` glass inverts feel | `--lp-card` dark = subtle white tint on dark bg; light = nearly-opaque white. Both produce "card" feel but different mood. Acceptable; no fix needed. |
| Socket palette saturation off on one theme | P01 token table provides separate dark and light values per `--sock-*`. |
| Dot-grid invisible on light bg | `--cg-grid-dot` light value is darker (`rgba(10,22,40,0.08)`) than dark (`rgba(255,255,255,0.06)`). Token is theme-aware. |
| Marquee fill too faint on light | `color-mix(... 12%, transparent)` against light's `--accent` (deeper cyan) is more saturated than dark — should be more visible, not less. Verify; tune if not. |
| Status dot teal on white card | If `--sock-audio` light value (`#1ea895`) is too pale, shift darker; verify against actual `--lp-card` light. |
| Backdrop-filter blur muddy on light | If light `--lp-card` (rgba 255,255,255,0.85) + 14px blur reads muddy, reduce blur radius for light via theme-scoped `--cg-pill-blur` override. |

### 3 — Per-theme overrides allowed when needed

If a single value cannot work across themes, define theme-scoped overrides in `themes.css`:

```css
/* themes.css */
html[data-theme="light"] {
  --sock-audio: #1ea895; /* tuned for light */
  --cg-grid-dot: rgba(10,22,40,0.08); /* darker dot for visibility */
}

html[data-theme="light"] #create-canvas-step {
  --cg-pill-blur: 10px; /* less blur to keep glass legible */
}
```

Phases document any per-theme overrides in their "Files touched" and "Acceptance" sections.

### 4 — Visual verification protocol

Engineer's checklist per phase:
1. Implement the phase's CSS/JS changes.
2. Load the canvas in default (dark) theme. Verify all phase acceptance criteria.
3. Toggle to light. Verify all phase acceptance criteria again.
4. Toggle back to dark. Verify nothing regressed.
5. Toggle 5x rapidly to confirm no flicker, no stale tokens, no FOUC.
6. Document any per-theme tuning applied, and any contrast issues found and resolved.

### 5 — No "dark first, light later" drift

Phases CANNOT defer light-mode work to a follow-up phase. Every phase is shipped with both themes verified. The exception is when a hazard is discovered late and requires a tuning commit; even then, the tuning ships with the phase, not a separate "light-mode polish" phase.

### 6 — Acceptance gating

A phase that ships with light-mode contrast failures or invisible elements is **NOT** considered complete by this ADR's standard. Reviewers should reject phase work that fails light-mode verification.

## Rationale

- **User directive is explicit.** "Both dark and light" — not negotiable.
- **Aurora light works today.** The redesign cannot regress it.
- **Hazards are known.** This ADR enumerates them so engineers don't rediscover each one.
- **Phase-level gating is the only way to prevent drift.** A "polish phase at the end" lets bugs accumulate; per-phase verification catches them at the source.
- **Per-theme overrides are cheap.** Aurora's token-swap architecture makes them one-line additions.

## Alternatives considered

1. **Defer light-mode to a single closing phase.** Rejected (explicitly): user directive prohibits; technical debt grows fast.
2. **Light-mode is a "nice to have" / best-effort.** Rejected: same reason.
3. **Audit only at P08 ship time.** Rejected: late detection; expensive fixes; risk of regressions in earlier phases when retrofitting.
4. **Skip light-mode for canvas-only and rely on dark.** Rejected: canvas is a major surface; users in light mode would see a half-themed app.
5. **Auto-generate light-mode values from dark via algorithmic transform.** Rejected: over-engineering; oklch already provides theme-aware perceptual matching for many tokens; targeted overrides are faster to author.

## Consequences

### Positive
- Light mode never regresses.
- Per-phase verification catches contrast issues at the source.
- Hazard list is shared institutional knowledge.
- Aurora's existing light tokens are first-class consumed.

### Negative
- Each phase takes longer to verify (theme toggle + re-test all acceptance steps). Mitigated: theme toggle is a single click; manual test plan already includes both themes.
- Per-theme overrides require thought and visual judgment. Mitigated: hazard list provides the patterns.
- Engineers must learn to "design for both themes" rather than "fix light later." Cultural shift; ADR-12 + phase-doc gates enforce.
- `color-mix` recipes may need per-theme tuning (additional CSS lines). Acceptable; ~5–10 extra lines across the redesign.

## References

- Aurora light tokens: `css/themes.css:27–81`
- Aurora theme inventory: `css/themes-inventory.md` (sections "gotchas" and "verification")
- ADR-1 (Theme tokens — Aurora-first): the foundation this ADR enforces
- ADR-5 (DOM thumb rendering — DOM gives free theming, supporting this ADR)
- All phase docs (P01–P08): each has a per-theme verification gate
- Architect prompt revision 1: "use aurora theme; both dark and light"
