# Stori Theme Tokens — Inventory (Phase 1 Task 0)

**Purpose:** Source of truth for `css/themes.css`. Every CSS variable below gets a light-mode counterpart in `aurora.light`; the three dark-mode palettes (`film.dark`, `reel.dark`, `aurora.dark`) map section-identity accents on top of the same key set.

**Codebase snapshot:**
- `css/styles.css` — 4462 lines, 302 hardcoded color occurrences, 993 `var(--…)` references
- `index.html` lines 17–1338 — in-HTML `<style>` block (all landing + token definitions)
- No other CSS files exist.

---

## 1. Existing token families (two) — verbatim from codebase

### Family A — Editor palette (legacy purple)
Declared in **`css/styles.css:1-37`** as `:root`. Used globally but effectively overridden on `#create-page` and `#reel-page` (see Family B).

| Variable | Current (dark) | Role | Light target (`aurora.light`) |
|---|---|---|---|
| `--bg-primary` | `#0f0f13` | Page bg | `#eef2f7` |
| `--bg-secondary` | `#12121a` | Panel bg | `#e3e9f1` |
| `--bg-card` | `#1a1a23` | Card bg | `#f6f8fb` |
| `--bg-elevated` | `#1e1e28` | Popover bg | `#ffffff` |
| `--bg-input` | `#12121a` | Form input bg | `#ffffff` |
| `--border` | `#2a2a3a` | Default border | `rgba(10,22,40,0.12)` |
| `--border-hover` | `#3a3a4c` | Hover border | `rgba(10,22,40,0.24)` |
| `--border-active` | `rgba(124,58,237,0.5)` | Focus ring | `color-mix(in oklch, var(--accent) 50%, transparent)` |
| `--accent` | `#7c3aed` (purple) | Primary action | `oklch(50% .16 220)` |
| `--accent-hover` | `#6d28d9` | Primary hover | `color-mix(in oklch, var(--accent) 80%, black)` |
| `--accent-glow` | `rgba(124,58,237,0.25)` | Primary glow | `rgba(20,90,170,0.18)` |
| `--accent-soft` | `rgba(124,58,237,0.12)` | Primary tint | `rgba(20,90,170,0.08)` |
| `--red` | `#ef4444` | Error | `#c03c3c` (slightly darker for AA on light) |
| `--red-soft` | `rgba(239,68,68,0.15)` | Error tint | `rgba(192,60,60,0.10)` |
| `--green` | `#22c55e` | Success | `#1a9a48` |
| `--green-soft` | `rgba(34,197,94,0.15)` | Success tint | `rgba(26,154,72,0.10)` |
| `--amber` | `#f59e0b` | Warning | `#b87300` |
| `--amber-soft` | `rgba(245,158,11,0.15)` | Warning tint | `rgba(184,115,0,0.10)` |
| `--cyan` | `#06b6d4` | Info | `#1189a1` |
| `--cyan-soft` | `rgba(6,182,212,0.15)` | Info tint | `rgba(17,137,161,0.10)` |
| `--text-primary` | `#e8e8f0` | Headings/body | `#0a1628` |
| `--text-secondary` | `#9898b4` | De-emphasized | `rgba(10,22,40,0.65)` |
| `--text-muted` | `#7a7a9a` | Meta/labels | `rgba(10,22,40,0.5)` |

Non-color tokens (unchanged across themes): `--radius-sm: 6px`, `--radius: 8px`, `--radius-lg: 8px` (overridden to 18px on `#create-page` and `#reel-page`), `--text-2xs` through `--text-2xl`.

### Family B — Aurora palette (`--lp-*`)
Declared in **`index.html:22-50`** as `:root`. This is the ACTUAL palette that Landing, Copilot, and Autopilot render in (Family A is re-mapped onto these on `#create-page` and `#reel-page` — see §2).

| Variable | Current (dark) | Role | Light target (`aurora.light`) |
|---|---|---|---|
| `--lp-bg` | `#050814` | Page bg | `#eef2f7` |
| `--lp-bg2` | `#0a0f20` | Panel bg | `#e3e9f1` |
| `--lp-card` | `rgba(255,255,255,0.035)` | Glass card | `rgba(10,22,40,0.04)` |
| `--lp-card-bdr` | `rgba(255,255,255,0.08)` | Card border | `rgba(10,22,40,0.10)` |
| `--lp-card-bdr-h` | `rgba(120,220,255,0.40)` | Card border hover | `rgba(20,110,180,0.45)` |
| `--lp-text` | `#eef4ff` | Primary text | `#0a1628` |
| `--lp-dim` | `rgba(238,244,255,0.65)` | Secondary text | `rgba(10,22,40,0.65)` |
| `--lp-faint` | `rgba(238,244,255,0.5)` | Muted text | `rgba(10,22,40,0.5)` |
| `--lp-accent` | `oklch(80% 0.14 200)` (cyan) | Primary accent | `oklch(50% .16 220)` (deeper cyan for AA) |
| `--lp-accent2` | `oklch(72% 0.19 340)` (magenta) | Secondary accent | `oklch(55% .18 340)` |
| `--lp-glow` | `rgba(120,220,255,0.22)` | Accent glow | `rgba(20,90,170,0.18)` |
| `--lp-bdr` | `rgba(255,255,255,0.08)` | Generic border | `rgba(10,22,40,0.10)` |
| `--lp-bdr-h` | `rgba(120,220,255,0.40)` | Border hover | `rgba(20,110,180,0.45)` |

**Legacy aliases** (index.html:37-45 — keep JS working, duplicate same values):
`--lp-primary`, `--lp-surf`, `--lp-op`, `--lp-muted`, `--lp-pc`, `--lp-bdr-p`, `--lp-bg-low`, `--lp-bg-card`.
These MUST also be overridden in light mode — they are referenced by `js/landing-*` code. Map them to the same light values as their modern equivalents:
- `--lp-primary` → same as `--lp-accent`
- `--lp-surf` → same as `--lp-text`
- `--lp-op` → same as `--lp-bg`
- `--lp-muted` → same as `--lp-dim`
- `--lp-pc` → same as `--lp-accent`
- `--lp-bdr-p` → `rgba(20,110,180,0.22)` (glow-weight)
- `--lp-bg-low` → same as `--lp-bg2`
- `--lp-bg-card` → same as `--lp-card`

### Font tokens (unchanged — not theme-dependent)
`--lp-font-display: 'Space Grotesk'`, `--lp-font-ui: 'Geist'`, `--lp-font-mono: 'Geist Mono'`

---

## 2. Section-by-section token usage

### Landing (`.lp-*` — index.html:17-1338)
Uses ONLY Family B (`--lp-*`) — pure Aurora. Zero Family A references.

Light-mode override path: `[data-theme="light"][data-section="landing"]` → overrides the `--lp-*` block in `:root`.

### Copilot (`#create-page` — css/styles.css:404-449, 2088-2890, 2893-4032)
Declares its own Family A → Family B re-mapping at **line 404-418**:
```css
#create-page {
  --accent:       var(--lp-accent);
  --accent-hover: color-mix(in oklch, var(--lp-accent) 80%, white);
  --accent-glow:  var(--lp-glow);
  --accent2:      var(--lp-accent2);
  --bg-primary:   var(--lp-bg);
  --bg-card:      var(--lp-card);
  --bg-elevated:  color-mix(in oklch, var(--lp-bg) 55%, transparent);
  --bg-input:     var(--lp-bg2);
  --border:       var(--lp-card-bdr);
  --border-hover: var(--lp-card-bdr-h);
  --text-primary:   var(--lp-text);
  --text-secondary: var(--lp-dim);
  --text-muted:     var(--lp-faint);
}
```

**Implication:** When we override `--lp-*` in light mode, Copilot automatically inherits light — no separate `#create-page` light override needed. This is a big win.

**Copilot-specific stray hardcodes** (must be tokenized in Phase 1):
| Location | Current | Replace with |
|---|---|---|
| Video mode card (illustrated) `css/styles.css:493-509` | `#a078ff`, `#b899ff`, `rgba(160,120,255,*)` | Reference `--lp-accent2` via `color-mix` |
| Video mode card (animated) `css/styles.css:510-525` | `#6ec6d8`, `rgba(100,200,255,0.08)` | Reference `--lp-accent` via `color-mix` |
| Agent row active bg `css/styles.css:3000-3057` | `rgba(160,120,255,*)` | `color-mix(in oklch, var(--lp-accent) N%, transparent)` |
| Emoji reel glass `css/styles.css:3099-3244` | `rgba(255,255,255,0.03-0.15)` | `var(--lp-card)` / `var(--lp-card-bdr)` |
| Scene card borders `css/styles.css:3467-3540` | `rgba(255,255,255,0.08)` | `var(--lp-card-bdr)` |

### Autopilot (`#reel-page` — css/styles.css:1670-2087, 2088-2890)
Same re-mapping pattern at **line 1672-1698** (identical block to `#create-page` above, minus `--lp-accent-create`).

Same implication: overriding `--lp-*` in light mode auto-themes Autopilot.

**Autopilot-specific stray hardcodes:**
| Location | Current | Replace with |
|---|---|---|
| BGM magenta waveform `css/styles.css:2544-2619` | magenta-ish rgba | Keep as `--lp-accent2` variations |
| Preview phone-frame bg `css/styles.css:2620-2690` | `rgba(0,0,0,0.25-0.5)` | Keep — phone frame is intentionally dark regardless of theme (video content) |
| rc-* control row bg `css/styles.css:2691-2830` | `rgba(255,255,255,0.03-0.08)` | `var(--lp-card)` |
| Reel segment card `css/styles.css:2281-2331` | `rgba(255,255,255,0.04)` | `var(--lp-card)` |

### Editor (`#editor`, timeline, preview — css/styles.css:801-1670 mostly)
Uses ONLY Family A (`--bg-*`, `--accent`, `--text-*`, etc.). Never references `--lp-*`.

**This is the critical audit zone** — the editor has the most hardcoded colors. Subsections:

| Subsection | Lines | Key hardcodes to tokenize |
|---|---|---|
| Two-column layout | 805-861 | `rgba(255,255,255,0.02-0.1)` → `var(--border)` / `var(--bg-card)` |
| Silence removal | 877-913 | `rgba(239,68,68,*)` → `var(--red-soft)` |
| Playhead | 914-920 | `#a855f7` (purple) → `var(--accent)` |
| Photo timeline | 933-999 | `rgba(124,58,237,*)`, `rgba(168,85,247,*)` → `var(--accent-soft)`, `var(--accent-glow)` |
| Time ruler | 1000-1007 | `rgba(255,255,255,0.1-0.3)` → `var(--border)`, `var(--text-muted)` |
| Photo properties | 1008-1030 | `rgba(124,58,237,0.3)` → `var(--accent-glow)` |
| Reference cards | 1031-1088 | `rgba(255,255,255,0.03-0.08)` → `var(--border)` |
| Library slots | 1089-1099 | Same |
| Video timeline | 1100-1166 | `rgba(139,92,246,0.3-0.85)` → `var(--accent-soft)`, `var(--accent-glow)` (NOTE: `139,92,246` is a different purple than `124,58,237` — should unify) |
| Preview | 1167-1190 | `#000`, `rgba(0,0,0,*)` → keep hardcoded (video letterbox is always black) |
| Export settings | 1191-1208 | `rgba(255,255,255,0.03-0.12)` → tokens |
| Inline preview | 1209-1236 | Same |
| Text timeline | 1237-1293 | `rgba(6,182,212,*)` → `var(--cyan-soft)`, `var(--cyan)` |
| Text properties | 1303-1338 | Same cyan set |
| Zoom controls | 1339-1363 | `rgba(255,255,255,0.06-0.1)` → tokens |
| Export progress | 1364-1373 | Same |
| Bottom action bar | 1374-1383 | Same |
| Project gallery | 1390-1435 | `rgba(255,255,255,0.04-0.12)` → tokens |
| Chapter cards | 1436-1475 | Same |
| Subtitle timeline | 1539-1611 | `rgba(6,182,212,*)` → cyan tokens |
| Multi-language | 1612-1628 | `rgba(124,58,237,*)` → accent tokens |
| Background music | 1645-1669 | Magenta-ish — leave as `var(--lp-accent2)` reference |

**Editor dark mode keeps Family A values** (existing behavior). **Editor light mode** uses the `aurora.light` values mapped above.

### Global (pre-section — css/styles.css:54-251, index.html `<style>` first ~50 lines)
Loading indicators, top bar, generic components, buttons, inputs, utilities.

Mostly tokenized already. Remaining hardcodes:
- `.progress-bar` (line 58-70): `rgba(124,58,237,*)` → `var(--accent)` family
- `.spinner` (line 71-96): same
- `body { background: #050814 }` in `index.html:53` — this is the HARDCODED body background that produces the light-mode FOUC problem. **Must become `background: var(--lp-bg)`** with matching `color: var(--lp-text)`.
- Scrollbar styles in `index.html:61-64`: hardcoded `#050814`, `rgba(255,255,255,0.08)` → token.

### Modals (css/styles.css:4090-4446)
Confirm modal, Publish modal, Upgrade modal. Use `rgba(0,0,0,0.72)` backdrop — keep (backdrop is always dark; that's fine even in light mode for modal focus).

Modal body bg: `var(--bg-card, #1a1a2e)` — already tokenized with fallback; light mode auto-inherits.

---

## 3. Hardcoded colors that are INTENTIONALLY not themed

These stay hardcoded across all themes — they are visual-media concerns, not UI chrome:
- `#000`, `rgba(0,0,0,*)` on preview letterbox, video frames, phone-frame bezel — video content always sits on black regardless of theme
- macOS traffic-light dots (`#ff5f57`, `#febc2e`, `#28c840`) in landing "window chrome" decorations
- Brand color swatches in style-preset thumbnails (`#001d3d`, `#003566`, `#ffd60a`, etc. — these represent AI art style palettes, not UI)
- Modal backdrops (`rgba(0,0,0,0.72)`)

---

## 4. Hardcoded colors that MUST be tokenized in Phase 1

Consolidated action list — applied inside `css/themes.css` via `[data-theme="light"]` overrides without deleting existing dark values:

1. **Re-point every `--lp-*` variable** to `aurora.light` values via `[data-theme="light"] :root { --lp-bg: #eef2f7; … }` — covers Landing, Copilot, Autopilot automatically through the existing re-mapping.
2. **Re-point every Family-A variable** (`--bg-*`, `--border*`, `--accent*`, `--text-*`, `--red/green/amber/cyan`) via `[data-theme="light"] :root { --bg-primary: #eef2f7; … }` — covers Editor.
3. **Body/html hardcodes in `index.html:53,69`** — replace literal `#050814` with `var(--lp-bg)`, literal `#eef4ff` with `var(--lp-text)` so the body respects the theme.
4. **Scrollbar hardcodes in `index.html:61-64`** — replace with tokens.
5. **Editor section hardcodes** per the table in §2 (Editor). These are additive CSS changes — replace `rgba(255,255,255,0.08)` with `var(--border)` style. No rule deletion; just swap the right-hand-side.

---

## 5. Token keys for `css/themes.css`

After the overrides above, `css/themes.css` defines exactly **two blocks** for light:

```css
/* Universal light override — applies to all sections */
html[data-theme="light"] {
  /* Family B — Aurora palette (drives Landing, Copilot, Autopilot) */
  --lp-bg:         #eef2f7;
  --lp-bg2:        #e3e9f1;
  --lp-card:       rgba(10,22,40,0.04);
  --lp-card-bdr:   rgba(10,22,40,0.10);
  --lp-card-bdr-h: rgba(20,110,180,0.45);
  --lp-text:       #0a1628;
  --lp-dim:        rgba(10,22,40,0.65);
  --lp-faint:      rgba(10,22,40,0.5);
  --lp-accent:     oklch(50% .16 220);
  --lp-accent2:    oklch(55% .18 340);
  --lp-glow:       rgba(20,90,170,0.18);
  --lp-bdr:        rgba(10,22,40,0.10);
  --lp-bdr-h:      rgba(20,110,180,0.45);
  /* legacy aliases — same values as modern equivalents */
  --lp-primary:    oklch(50% .16 220);
  --lp-surf:       #0a1628;
  --lp-op:         #eef2f7;
  --lp-muted:      rgba(10,22,40,0.65);
  --lp-pc:         oklch(50% .16 220);
  --lp-bdr-p:      rgba(20,110,180,0.22);
  --lp-bg-low:     #e3e9f1;
  --lp-bg-card:    rgba(10,22,40,0.04);

  /* Family A — Editor palette (drives Editor) */
  --bg-primary:   #eef2f7;
  --bg-secondary: #e3e9f1;
  --bg-card:      #f6f8fb;
  --bg-elevated:  #ffffff;
  --bg-input:     #ffffff;
  --border:       rgba(10,22,40,0.12);
  --border-hover: rgba(10,22,40,0.24);
  --border-active: rgba(20,90,170,0.50);
  --accent:       oklch(50% .16 220);
  --accent-hover: color-mix(in oklch, oklch(50% .16 220) 80%, black);
  --accent-glow:  rgba(20,90,170,0.18);
  --accent-soft:  rgba(20,90,170,0.08);
  --red:          #c03c3c;
  --red-soft:     rgba(192,60,60,0.10);
  --green:        #1a9a48;
  --green-soft:   rgba(26,154,72,0.10);
  --amber:        #b87300;
  --amber-soft:   rgba(184,115,0,0.10);
  --cyan:         #1189a1;
  --cyan-soft:    rgba(17,137,161,0.10);
  --text-primary:   #0a1628;
  --text-secondary: rgba(10,22,40,0.65);
  --text-muted:     rgba(10,22,40,0.5);
}

/* Light-mode body fix (overrides hardcoded index.html:53 if that line is tokenized) */
html[data-theme="light"], html[data-theme="light"] body {
  background: var(--lp-bg);
  color: var(--lp-text);
}
```

Phase-2/3 additions (NOT in Phase 1): `film.dark`, `reel.dark`, `aurora.dark` section-accent overrides via `html[data-theme="dark"][data-section="landing|copilot"]` etc. Phase 1 leaves dark-mode values exactly as they are today.

---

## 6. Gotchas flagged for Phase 1 implementation

1. **Two purple values exist** — Editor uses both `#7c3aed` (rgb 124,58,237) and `#8b5cf6` (rgb 139,92,246) for the "purple accent" across different subsections. Light mode collapses both to `oklch(50% .16 220)` via the `--accent` family. Verify visually that no subsection looks wrong after unification.

2. **`index.html:53` hardcoded body bg** is the single biggest FOUC risk. The inline FOUC script sets `data-theme` on `<html>` before stylesheets load, but the `<style>` block in the same `<head>` assigns `#050814` directly to body. Fix: change `html, body { background: #050814; color: #eef4ff; }` to `html, body { background: var(--lp-bg); color: var(--lp-text); }` **inside that same style block** (not a separate `themes.css` override — the inline block is the first rule the browser sees after `:root`).

3. **`#create-page` and `#reel-page` re-map tokens.** Because these blocks re-assign `--bg-primary: var(--lp-bg)` etc., Family A overrides in light mode will be SHADOWED for Copilot/Autopilot. That's correct behavior — we want Copilot/Autopilot to follow the `--lp-*` family, not Family A. Editor is the only section still reading raw Family A.

4. **`#reel-emoji-reel`** (copilot side, css/styles.css:3099-3244) — complex glass panel with many `rgba(255,255,255,0.03-0.15)` values. Replace with `var(--lp-card)` / `var(--lp-card-bdr)` so it auto-themes. Verify the blink animation still looks right on light.

5. **Gradient text** in `.lp-h1 em` (index.html:198-202) uses `oklch(80% 0.14 200)` + `oklch(72% 0.19 340)` directly. In light mode these would wash out. Replace with `var(--lp-accent)` and `var(--lp-accent2)` so they darken on light.

6. **Video mode cards** (styles.css:493-525) have baked-in `#a078ff` / `#6ec6d8` values with their own "illustrated" and "animated" identities. These are meaningful brand-ish colors — keep hardcoded, but add a `[data-theme="light"]` override block just for those two cards shifting to darker equivalents.

7. **Editor preview letterbox, timeline waveform, and phone-frame preview** — intentionally stay dark-on-light (they represent media content, not chrome). No changes.

---

## 7. Verification after Phase 1

After `css/themes.css` lands and `data-theme="light"` is active on `<html>`:

- Zero `rgba(255,255,255,*)` values on interactive chrome (that's light-on-dark; if it survives to light mode it's invisible). Grep confirms all such values have been replaced by tokens OR are in dark-only sections (modal backdrop, preview letterbox).
- Zero `#0f0f13` / `#050814` / `#eef4ff` literals on body, panels, cards. Confirm via grep that these hardcodes now come via `var(--lp-bg)` / `var(--lp-text)` / `var(--bg-primary)`.
- Contrast check (Chrome DevTools → Rendering → Emulate CSS > prefers-contrast: more) on: hero title, nav links, scene card titles, agent names, timeline clips, ruler tick labels, export step cost chip, BGM slider labels.
- Theme toggle flips instantly in all four sections (Landing, Copilot, Autopilot, Editor). No stale dark tints anywhere.

---

**End of inventory.** Ready to write `css/themes.css` from §5.
