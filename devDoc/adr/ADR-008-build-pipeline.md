# ADR-008 — Build pipeline (inline `canvas-graph.css`)

- **Status:** Accepted (2026-05-01)
- **Affected phases:** P01 (defines tokens that need to ship inline), P04 (heavy CSS additions), P08 (executes the migration)

## Context

`canvas-graph.css` (1362 lines today) is currently loaded as a separate `<link>` in `index.html:23`:

```html
<link rel="stylesheet" href="css/canvas-graph.css?v=2">
```

The `?v=2` query string is a manual cache-bust — every time `canvas-graph.css` changes, someone must remember to bump `v=`. If they forget, users on a stale CDN cache get the old CSS, which can break theme/layout in subtle ways (sockets misaligned, curves wrong color).

The build pipeline at `build.js:14–120` already inlines two stylesheets into `dist/index.html`:
- `css/styles.css` (block at `build.js:14–19`)
- `css/themes.css` (block at `build.js:24–30`)

Inline order in `dist/index.html`:
1. `styles.css` content (Family A dark)
2. Existing inline `<style>` block in `<head>` (Family B Aurora dark tokens + landing CSS)
3. `themes.css` content (light theme overrides — loaded LAST to win specificity per `build.js:25` comment)

`canvas-graph.css` is NOT in this pipeline. It is fetched as a separate stylesheet on every page load, with the manual cache-bust hazard.

The redesign adds substantial CSS to `canvas-graph.css` (P02 floating chrome, P04 node shell + sockets, P05 IMG tray + thumbs, P06 VID tray, P07 menu + toolbar + steppers, P08 marquee + Properties pane). Each phase that ships will need to bump `?v=` again. Not bumping = stale CSS in production.

## Decision

**Inline `canvas-graph.css` into `dist/index.html` via `build.js`** in P08 (closing-phase migration).

### 1 — Insertion point

Inline `canvas-graph.css` BETWEEN `styles.css` and `themes.css`. Rationale:
- `styles.css` defines Family A defaults.
- `canvas-graph.css` adds canvas-specific rules that may reference Family A and Family B tokens.
- `themes.css` is the LAST CSS loaded so its `html[data-theme="light"]` overrides win specificity.
- Keeping `themes.css` last preserves the existing override contract.

Final inline order:
1. `styles.css` (Family A)
2. (existing inline `<style>` block — Family B dark tokens + landing CSS)
3. **`canvas-graph.css` (NEW)**
4. `themes.css` (light overrides)

### 2 — Source vs dist

- **Source `index.html`** keeps the `<link rel="stylesheet" href="css/canvas-graph.css?v=2">` tag for dev-mode (developers edit CSS and reload without rebuilding).
- **`build.js`** strips the link tag from `dist/index.html` AND inserts the inline `<style>` block in its place.

### 3 — Cache-bust query removal

After migration, `?v=` is no longer needed on `canvas-graph.css` because:
- In dev-mode, the source path doesn't change; browsers cache reasonably; force-reload (Cmd-Shift-R) bypasses cache.
- In production (`dist/index.html`), the CSS is inlined → cache key is the HTML file. CDN must invalidate `index.html` cache on each deploy (which it must do anyway for any HTML/JS update).

The build can also strip `?v=2` from the source path during link-replacement to avoid confusion. Net effect: no manual cache-bust ever.

### 4 — `build.js` regex

The replacement regex must match:
```
<link rel="stylesheet" href="css/canvas-graph.css?v=2">
```
or any future `?v=N` value or no query at all. Pattern:
```
/\s*<link\s+rel="stylesheet"\s+href="css\/canvas-graph\.css(?:\?v=[^"]+)?"\s*\/?>/
```
Matches the existing tag with or without query. Replaces with the inline block.

### 5 — Per-phase implications

- P02 / P04 / P05 / P06 / P07 ship CSS additions to `canvas-graph.css`. They DO NOT need to think about `?v=` because P08 will inline.
- P02–P07 phases that ship before P08 land DO still need `?v=` bumps (because `dist/` still has the link tag). Engineer should bump `?v=2` to `?v=3` on each pre-P08 ship to avoid stale CSS in production.
- P08 lands the build pipeline change AND the final `?v=` removal in source.

## Rationale

- **Cache-bust hazards are real.** `?v=` is a discipline-based safeguard; discipline fails. Inlining is the engineering safeguard.
- **`styles.css` and `themes.css` already inline.** Same pattern; consistency.
- **Order matters.** `themes.css` last preserves light override behavior.
- **Single HTTP request.** Inlining canvas-graph.css removes a fetch on first paint. Minor perf benefit, secondary to cache-safety.
- **Source still loads via `<link>`.** Dev-mode UX unchanged.

## Alternatives considered

1. **Keep separate `<link>` and bump `?v=` per ship.** Rejected: discipline-based; will break in production.
2. **Auto-version the file (use a hash of contents).** Acceptable but more build complexity than inlining; requires a hashing pass + filename rewrite. Inlining is simpler.
3. **Move canvas-graph.css contents into styles.css.** Rejected: violates module boundaries; canvas-graph.css is logically a separate concern (canvas-only rules).
4. **Inline before `styles.css` (top of head).** Rejected: would require canvas rules to win specificity against `styles.css`, which we don't want — canvas rules should layer on top.
5. **Inline AFTER `themes.css`.** Rejected: canvas rules would override theme-light values; wrong direction.

## Consequences

### Positive
- No more `?v=` discipline requirement for canvas-graph.css.
- Cache-safe by construction.
- Consistent with existing inline pipeline.
- One fewer HTTP request on first paint.

### Negative
- `dist/index.html` size grows by ~40KB (canvas-graph.css inline). Acceptable; HTML compresses well.
- Source `index.html` and `dist/index.html` diverge more (already true for `styles.css`/`themes.css`; this just continues the pattern).
- Engineers updating CSS in dev-mode need to remember to run `node build.js` before deploying. Already true; this doesn't add new burden.
- If `build.js` regex doesn't match (e.g. someone manually changes the link tag spelling), the inline insertion is silently skipped. Mitigated by build script logging the inlined files (already does — `build.js:120`); P08 verifies.

## References

- `build.js:14–19` (styles.css inline pattern)
- `build.js:24–30` (themes.css inline pattern)
- `build.js:120` (success log)
- `index.html:22` (styles.css link), `:23` (canvas-graph.css link), themes link in head
- P01 (defines `--cg-*` and `--sock-*` tokens that need to ship inline)
- P08 (executes the migration)
