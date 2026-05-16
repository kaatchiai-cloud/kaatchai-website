# Phase 07 — Web Cutover (delete BYOK + dollar-cost UI; ship versioned API only)

> **Rev-5 changes (2026-05-16):** Provider count 6 → 7 BYOK + 1 keyless (Jina Reader); expanded key-prefix + URL + function grep patterns; added `js/21-kling.js`, `js/34-lora-library.js`, `js/28-canvas-consistency.js` to file list; marketing-pipeline exclusion note with different key names; Brainstorm dollar-cost UI additions (`bs-cost-tag`, `_updateMeta`, `_getProviderPricing`, model price tags); JSZip CDN loader (`_loadJSZip`) added to function deletion grep; ElevenLabs voice catalog replacement verified. Source: `migration-plan-audit-rev5-merged.md` C2, C3, M1, S5, S8, S9.

> **Status:** ready-to-execute after Phase 06 exits. **Audience:** solo founder + 1–2 engineers. **Duration:** S (2–3 working weeks).
> **Goal in one line:** strip the legacy client of all direct AI calls and BYOK code; web ships against `/v1/*` exclusively, with the dollar-cost UI removed.
> **Source:** `/Users/praveen/Desktop/stori/migrations/migration-plan.md` Part 2 row 06; coverage matrix rows 9, 10; [OVERRIDES] O7, O13, O15.

---

## 1. Scope

### In scope
1. **Fresh grep before any deletion** — re-verify the actual reference counts across **all 7 BYOK provider key surfaces + 1 keyless provider (Jina Reader)** (audit 2026-05-06 caught that the original count missed five of them; rev-5 audit added Replicate + Jina Reader). The fresh grep at phase doc authoring time returned:

   | # | Provider | Key prefix(es) | URL pattern |
   |---|---|---|---|
   | 1 | Gemini | `stori_key_paid`, `stori_key_free` | `generativelanguage.googleapis.com` |
   | 2 | Kling | `stori_kling_access_key`, `stori_kling_secret_key` | Kling endpoints |
   | 3 | ElevenLabs | `stori_elevenlabs_key` | `api.elevenlabs.io` |
   | 4 | OpenAI | `stori_openai_key` | `api.openai.com` |
   | 5 | Anthropic | `stori_anthropic_key` | `api.anthropic.com` |
   | 6 | fal.ai | `stori_fal_api_key` | `fal.run`, `queue.fal.run` |
   | 7 | Replicate | `stori_replicate_api_key` | `api.replicate.com` |
   | 8 | Jina Reader | _(keyless)_ | `r.jina.ai` |

   Verified call sites for the original six providers (pre-rev-5):
   - Gemini: `js/15-project.js`, `js/24-photopilot.js`, `js/17a-create-api.js`, `js/20-reels-creator.js`, `js/28-canvas-consistency.js`, `js/21-kling.js`, `js/17c-create-pipeline.js`, `js/17d-create-languages.js`, `js/34-lora-library.js`
   - Kling: `js/21-kling.js:13–15`, `js/17a-create-api.js:822–823`
   - ElevenLabs: `js/17a-create-api.js:296, 583, 636, 810`, `js/34-lora-library.js:2443`
   - OpenAI: `js/26b-llm-router.js:46, 60–64`
   - Anthropic: `js/26b-llm-router.js:78, 94–103`
   - fal.ai: `js/17c-create-pipeline.js:3728–3900`, `js/34-lora-library.js:15, 310, 375, 385, 393, 501, 3164`
   - Replicate: `js/28-canvas-consistency.js:146, 170, 188`, `js/34-lora-library.js:1751–1753`
   - Jina Reader: `js/26-brainstorm.js:637` (keyless — `_pcExtract()`)

   The earlier "36 refs / 19 fetch sites / 4 files" figures from `migration-original-spec.md` were doubly stale — they cited only the Gemini surface and predate the 14 newer JS files. **Re-run all provider greps at phase kickoff** and itemize remaining references. By the time this phase starts, Phases 05 + 06 should have driven Gemini, Kling, ElevenLabs, fal.ai, Replicate counts to ~0 in pipeline files; OpenAI + Anthropic in `26b-llm-router.js` are P06 Brainstorm extraction territory; Jina Reader is replaced by `/v1/brainstorm/extract-url` in P06.

   > **⚠ Grep-gate scope (rev-4 pass-2 callout; rev-5 expanded):** All grep gates in this phase target **`js/` and root `index.html` ONLY** — NOT `marketing-pipeline/`. The `marketing-pipeline/index.html:5150` site (and any BYOK keys it holds) is **explicitly out of scope** per the P03 carve-out (2026-05-06): the marketing-pipeline page is a separate marketing site with its own deployment lifecycle and stays local. If you run a recursive grep from repo root (`grep -rn ... .`) and find hits in `marketing-pipeline/`, **those are expected and don't fail the gate**. Use `grep -rn '<pattern>' js/ index.html` (explicit paths) to verify the gate.
   >
   > **Marketing-pipeline key names differ from the main app (rev-5 finding S9):** `marketing-pipeline/` uses `stori_kling_key` (vs main app's `stori_kling_access_key`/`stori_kling_secret_key`), `stori_fal_key` (vs main app's `stori_fal_api_key`), and `stori_kling_provider` (provider selector state). It also shares `stori_openai_key`, `stori_elevenlabs_key`, `stori_key_paid` with the main app. These marketing-pipeline-only key names do **not** appear in `js/` or root `index.html`, so P07's grep gates will not find them — but it's important to know they exist if you grep from repo root. `marketing-pipeline/` is excluded — it is a separate deployment with its own BYOK flow, not in scope for this migration.

2. **BYOK key deletion** — broaden from "two legacy Gemini key names" to **all browser-stored provider secrets (7 BYOK keys)**:
   - Remove every `localStorage.getItem|setItem` of: `stori_key_paid`, `stori_key_free`, `stori_kling_access_key`, `stori_kling_secret_key`, `stori_elevenlabs_key`, `stori_openai_key`, `stori_anthropic_key`, `stori_fal_api_key`, `stori_replicate_api_key`.
   - **Jina Reader (`r.jina.ai`) is keyless** — no client-stored key to delete; the `_pcExtract()` function and its direct `fetch('https://r.jina.ai/...')` call are deleted as part of the direct AI fetch sweep (item 4).
   - **(rev-4) Delete the full key-getter + callGeminiAPI + trackCost suite from `js/17a-create-api.js`:**
     - `callGeminiAPI()` definition (the wrapper P05/P06 replaced with `callApi('/v1/...')` at every call site).
     - `getCreateGeminiKey()` (verified at `js/17a-create-api.js:288`).
     - `getPPApiKey()` (PhotoPilot key-getter).
     - `getReelApiKey()` (reel-creator key-getter).
     - `getFreeKey()` (verified at `js/17a-create-api.js:291`).
     - `getPaidKey()` (verified at `js/17a-create-api.js:292`).
     - `getReelFreeKey()` and `getReelPaidKey()` (reel-specific free/paid getters).
     - **`trackCost()`** — **53 call sites across 9 files** (rev-4 pass-2 audit, 2026-05-06 — `grep -rE "\\btrackCost\\b" js/` returns 53 lines). Per-file breakdown: `js/17a-create-api.js` (~3 sites at `:472, 730, 785` plus the function definition), `js/17b-create-references.js` (1), `js/17c-create-pipeline.js` (~13), `js/17d-create-languages.js` (2), `js/20-reels-creator.js` (~21), `js/24-photopilot.js` (5), `js/26b-llm-router.js`, `js/01-core.js`, `js/33-audio-rehearsal.js` (1). **Sweep ALL call sites** — leaving any behind will throw `ReferenceError` at runtime once the definition is deleted. The dollar-cost UI removal at item 3 makes `trackCost` an orphan; delete the entire mechanism. **Re-grep at phase kickoff** (`grep -rln "trackCost" js/`) since the count drifts as the codebase evolves.
   - Remove the BYOK input fields from `index.html` for all 7 BYOK providers (the "API key" `<input>` elements + their containing settings panels — there are multiple panels per `index.html:2184–2193, 2954–2963` and elsewhere). Jina Reader has no BYOK input (keyless).
3. **Dollar-cost UI removal**:
   - Remove every dollar-figure cost display in the client (the cost-estimator pieces inside `js/17a-create-api.js` and any companion code).
   - **(rev-5) Brainstorm session cost display** — additional dollar-cost UI not covered by prior revisions:
     - `bs-cost-tag` element in `index.html:4248` (Brainstorm session cost display `~$X.XXX used`).
     - `_updateMeta()` cost logic in `js/26-brainstorm.js:1435–1450`.
     - `_getProviderPricing()` in `js/26-brainstorm.js` (hardcoded per-token pricing: `{ gemini: { in: 0.000000075, out: 0.000000300 }, openai: { in: 0.000000005, out: 0.000000015 }, anthropic: { in: 0.000000003, out: 0.000000015 } }`).
     - Model price tags (`$0.10`, `$0.30`, `$0.50`) in Brainstorm model picker UI in `index.html`.
   - **Production UI shows no cost info between this phase and the future credits workstream.** Confirmed acceptable by the user. The cost-estimator working files in the repo root (`cost-estimator.html`, `cost-estimator-mock.html`, `cost-estimator-plan.md`) are **left in place untouched** — they are not loaded by the production site, just exist as scratch artifacts (override O15).
4. **Direct AI fetch deletion sweep** — every remaining direct `fetch('https://generativelanguage.googleapis.com/...')`, direct Kling URL, direct `api.replicate.com` call, and direct `r.jina.ai` call replaced or removed. Also delete fal.ai LoRA helper functions (`_falRunSync`, `_falSubmit`, `_falPollStatus`, `_falFetchResult`) and the Replicate face-swap suite (`_getReplicateKey`, `_replicateFaceSwap`, `applyFaceSwapToSceneImage`) and the Jina Reader function (`_pcExtract`). Anything that's a now-dead code path (e.g., a fallback that triggered when no API key was set) is deleted entirely, not commented out.
5. **`updateUserSection()` already removed in Phase 02** — re-confirm it's still gone via grep. The line in the auth stub at `js/15-project.js:1391` that read `localStorage.getItem('stori_key_paid')` to display "✓ Set" is part of the Phase 02 deletion, but the grep above shows `15-project.js` still has BYOK refs — so there are other read sites. Phase 07 cleans them up.
6. **Production feature-flag flip** — finalize ADR-04's tooling choice (Supabase config table recommended). Set up a `feature_flags` table or its equivalent. Flip the production "v1 backend" flag from "shadow" to "primary". The web build configured to read flags at boot.
7. **Sentry events grouped** — add Sentry tags `release: <git-sha>`, `feature: <name>`, `error_class: <client|server|network|provider>`. Group rules in Sentry dashboard.
8. **Error budget defined** — written down in `infra/sentry/error-budget.md`: e.g., < 0.5% of `/v1/*` requests return 5xx over a rolling 7-day window. Crossing the budget triggers an error-budget-exceeded process documented in Phase 08's runbook.
9. **Rollback drill** — practice reverting the production release via Vercel revert + feature-flag flip in < 10 minutes. Document in `infra/cloud-run/runbooks/rollback.md`. The drill is on a no-impact change (e.g., revert a footer text change).
10. **ADR-04 finalized** (drafted in Phase 05). Locks down: branch protection on main, CI requirements, feature-flag tooling vendor, Cloud Run revision traffic-split tooling, web cutover policy.
11. **ADR-08 written** — Sentry SDK setup, error grouping conventions, log aggregation, dashboards (web + Cloud Run only — no Flutter SDK in this cycle).

### Explicitly out of scope (defer to later phases)
- **Production launch readiness (real production canary, on-call runbook, public status page, mock incident drill)** → Phase 08.
- **Mobile / Flutter** → future mobile cycle.
- **Credits / billing UI** → out-of-cycle.
- **IndexedDB code path deletion in `js/15-project.js`** — the IDB-only-fallback code is dead-on-arrival in production (zero customers per O13, no migration needed) but kept for the founder's local dogfood projects. Phase 07 deletes it ONLY if it has dependent dead code paths (e.g., fallback when offline). If IDB is a clean optional path, leave it as a "local-only" mode or delete entirely — pick at kickoff.
- **`marketing-pipeline/` directory and `marketing-pipeline/index.html`** — explicitly out of scope per the P03 carve-out (2026-05-06). The marketing-pipeline page is a separate marketing site with its own deployment lifecycle. **All grep gates in this phase target `js/` and root `index.html` ONLY** (see §1 callout). Any BYOK keys / direct provider URLs / IndexedDB calls in `marketing-pipeline/` are NOT counted toward the exit grep — they remain as-is. `marketing-pipeline/` uses different key names (`stori_kling_key`, `stori_fal_key`, `stori_kling_provider`) that do not appear in the main app. If a future workstream decides to migrate the marketing site, that's a separate scope.

---

## 2. Goal & exit criteria

| # | Exit criterion | How verified |
|---|----------------|--------------|
| 1 | **Zero browser-stored provider secrets.** `grep -rnE "stori_key_paid|stori_key_free|stori_kling_access_key|stori_kling_secret_key|stori_elevenlabs_key|stori_openai_key|stori_anthropic_key|stori_fal_api_key|stori_replicate_api_key" js/ index.html` returns 0 hits. | grep |
| 2 | **Zero direct provider fetches.** `grep -rnE "generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|api\.elevenlabs\.io|fal\.run|queue\.fal\.run|api\.replicate\.com|r\.jina\.ai" js/ index.html` returns 0 hits. | grep |
| 3 | `grep -rnE "getCreateGeminiKey|getPPApiKey|getReelApiKey|getFreeKey|getPaidKey|getReelFreeKey|getReelPaidKey|callGeminiAPI|trackCost|_getReplicateKey|_replicateFaceSwap|applyFaceSwapToSceneImage|_loadJSZip|_falRunSync|_falSubmit|_falPollStatus|_falFetchResult|_pcExtract" js/ index.html` returns 0 hits. | grep |
| 4 | BYOK input fields for all 7 BYOK providers (Gemini, Kling, ElevenLabs, OpenAI, Anthropic, fal.ai, Replicate) removed from `index.html`. | DOM inspection + grep on `<input>` ids. |
| 5 | Dollar-cost UI gone from production rendering. | Manual visual check on every screen. |
| 6 | Web shipped to production behind `feature: v1_backend = primary`. | Sentry shows `release` tag matches the deployed sha. |
| 7 | Sentry events grouped by `error_class` + `feature`; dashboard renders. | Sentry UI screenshot. |
| 8 | Error budget written down at `infra/sentry/error-budget.md`. | PR review. |
| 9 | Rollback drill executed; runbook checked in; revert took < 10 min. | Drill log. |
| 10 | ADR-04 finalized, ADR-08 written. | Files exist. |

---

## 3. Architecture

```
                         (no architectural changes — just code deletion)

Browser              ────────────►   Vercel + Cloud Run (already wired in P05+P06)
  index.html (BYOK UI gone)
  js/* (no direct AI fetches)
  feature_flags read at boot from /v1/flags (or a build-time constant)

Production deploy:
  Vercel deploys the static web (index.html + js/*) on every main merge
  Cloud Run revisions ship per ADR-04 canary policy (5/50/100, decided here)
```

**Why this shape:** Phase 07 is pure deletion + production polish. No new endpoints. The architecture diagram at this point matches Phase 06's; the only addition is the feature-flag read path.

---

## 4. Technology selection

| Concern | Choice | Rationale | Alternatives |
|---------|--------|-----------|--------------|
| Feature-flag store | **Supabase config table** (or `feature_flags` table) | Recommended in ADR-04 — cheapest, no extra vendor, SQL-queryable. | LaunchDarkly, ConfigCat: extra cost; not justified for solo founder. |
| Flag read pattern | **Read once at app boot via `/v1/flags`**; cache for the session | Simple; no live update needed (flags flip ≤ daily in this cycle). | Server-Sent Events: overkill. |
| Sentry release tagging | **Auto-tag from `VERCEL_GIT_COMMIT_SHA` + Cloud Run revision label** | Built-in. | Manual tagging: error-prone. |
| Rollback mechanism | **Vercel revert button** for static web; **Cloud Run revision traffic flip** for backend | Both vendor-native; practiced in Phase 05 canary drill (rehearsal). | Manual `git revert` + redeploy: too slow. |
| Error budget tracking | **Manual quarterly review** for now; automate in Phase 08 if budget gets crossed often | Solo-founder pragmatism. | Datadog SLOs: too much vendor. |

---

## 5. Work breakdown

### 5.1 Fresh grep + itemize deletion targets (0.5 day)
- [ ] At phase kickoff (NOT at this doc's authoring time), run:
  ```bash
  grep -rnE "stori_key_paid|stori_key_free|stori_kling_access_key|stori_kling_secret_key|stori_elevenlabs_key|stori_openai_key|stori_anthropic_key|stori_fal_api_key|stori_replicate_api_key" js/ index.html
  grep -rnE "generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|api\.elevenlabs\.io|fal\.run|queue\.fal\.run|api\.replicate\.com|r\.jina\.ai" js/ index.html
  grep -rnE "getCreateGeminiKey|getPPApiKey|getReelApiKey|getFreeKey|getPaidKey|getReelFreeKey|getReelPaidKey|callGeminiAPI|trackCost|_getReplicateKey|_replicateFaceSwap|applyFaceSwapToSceneImage|_loadJSZip|_falRunSync|_falSubmit|_falPollStatus|_falFetchResult|_pcExtract" js/ index.html
  grep -rn "createDollarCost\|estimateCost\|costInDollars\|bs-cost-tag\|_updateMeta\|_getProviderPricing" js/ index.html  # dollar-cost UI helpers (rev-5 expanded)
  ```
- [ ] Itemize the actual line numbers in a temporary `phase-06-deletion-list.md` (working file, not committed long-term).
- [ ] Cross-check against fresh-grep numbers in `migration-plan.md` Part 4 P07 paragraph. If divergent (e.g., Phase 06 left some stragglers), fix in Phase 06 first or expand scope here.

### 5.2 BYOK deletion sweep (1.5 days — rev-4 expanded)
- [ ] For each file in the grep output:
  - Delete the `localStorage.getItem|setItem('stori_key_paid'|'stori_key_free'|'stori_kling_access_key'|'stori_kling_secret_key'|'stori_elevenlabs_key'|'stori_openai_key'|'stori_anthropic_key'|'stori_fal_api_key'|'stori_replicate_api_key', ...)` call sites.
  - Delete adjacent dead branches that fired only when a key was set/unset.
- [ ] **(rev-4) `js/17a-create-api.js` — delete the full key-getter + callGeminiAPI + trackCost suite:**
  - `callGeminiAPI()` definition (now an orphan — P05/P06 replaced every call site with `callApi('/v1/...')`).
  - `getCreateGeminiKey()` (verified at `:288`).
  - `getPPApiKey()`.
  - `getReelApiKey()`.
  - `getFreeKey()` (verified at `:291`).
  - `getPaidKey()` (verified at `:292`).
  - `getReelFreeKey()` + `getReelPaidKey()`.
  - `trackCost()` — sweep **all 53 call sites across 9 files** (rev-4 pass-2 audit) AND the function definition. The 3 sites at `:472, :730, :785` are just `js/17a-create-api.js`; the bulk live in `17c` (~13), `20-reels-creator.js` (~21), `24-photopilot.js` (5), and the rest scattered. (Cost UI removal at §5.3 makes the column orphan.)
- [ ] **(rev-4) `js/21-kling.js` — confirm P05 already deleted `generateKlingJWT()` + the two `stori_kling_*` reads at `:13–14`.** If anything remains, sweep here. **(rev-5)** Also confirm the Gemini continuation-prompt call at `:356` is replaced (P05/P06 territory).
- [ ] In `index.html`: remove BYOK `<input>` element(s) + their settings-panel container. Search for "API key" / "Gemini key" / `id="api-key"` etc.
- [ ] Run the app locally — verify no console errors, no broken references.

### 5.3 Dollar-cost UI removal (0.5 day)
- [ ] Identify dollar-cost display elements in `js/17a-create-api.js` (and anywhere else `$` symbol or "estimated cost" appears in user-facing strings).
- [ ] **(rev-5) Brainstorm dollar-cost UI** — delete:
  - `bs-cost-tag` element in `index.html:4248` (Brainstorm session cost display).
  - `_updateMeta()` cost logic in `js/26-brainstorm.js:1435–1450`.
  - `_getProviderPricing()` in `js/26-brainstorm.js` (hardcoded per-token pricing).
  - Model price tags (`$0.10`, `$0.30`, `$0.50`) in Brainstorm model picker UI in `index.html`.
- [ ] Delete them.
- [ ] For any `id="cost-estimate"` / `id="cost-display"` / `id="bs-cost-tag"` element, remove from `index.html`.
- [ ] **Do not touch** `cost-estimator.html` / `cost-estimator-plan.md` / `cost-estimator-mock.html` in repo root — those are scratch files outside the production bundle.

### 5.4 Direct AI fetch sweep (1 day)
- [ ] For each remaining `fetch('https://generativelanguage.googleapis.com/...')` after Phases 05+06, decide: (a) replace with `callApi(...)` if the call is still needed, (b) delete if it was a fallback for the now-removed BYOK case. Default: delete.
- [ ] For direct Kling URL calls in `js/21-kling.js` (likely already replaced by P05) — re-confirm zero remaining.
- [ ] **(rev-5)** For `js/21-kling.js:356` — Gemini continuation-prompt call inside Kling module (added by rev-5 audit finding S13). Must be replaced with `callApi('/v1/gemini/generate-content')` or deleted.
- [ ] **(rev-5)** For `js/34-lora-library.js` — fal.ai direct calls (`_falRunSync`, `_falSubmit`, `_falPollStatus`, `_falFetchResult`), ElevenLabs voice cloning, Gemini appearance extraction — all replaced by P06's `/v1/lora/*` endpoints. Re-confirm zero remaining.
- [ ] **(rev-5)** For `js/28-canvas-consistency.js` — Replicate face-swap calls (`_getReplicateKey`, `_replicateFaceSwap`, `applyFaceSwapToSceneImage`) — replaced by P06's `/v1/canvas/face-swap`. Re-confirm zero remaining.
- [ ] **(rev-5)** For `js/26-brainstorm.js:637` — Jina Reader `_pcExtract()` call (`r.jina.ai`). Replaced by P06's `/v1/brainstorm/extract-url`. Re-confirm zero remaining.
- [ ] **(rev-5)** For `js/34-lora-library.js:3998` — `_loadJSZip()` CDN loader (`cdnjs.cloudflare.com/.../jszip.min.js`). Dead code after P06 moves LoRA training server-side. Delete the function and the dynamic CDN `fetch()`.
- [ ] **(rev-5) ElevenLabs voice catalog** — after P07 removes `stori_elevenlabs_key`, the voice catalog fetch at `js/17a-create-api.js:753` (`fetch('https://api.elevenlabs.io/v1/voices')`) must already be replaced by P05/P06's `/v1/audio/voices` endpoint. Verify in exit criteria that `api.elevenlabs.io` grep returns 0 (covers the catalog fetch too).
- [ ] Re-run the grep targets from §5.1 + rev-5 additions — must all be 0.

### 5.5 Feature flag boot (1 day)
- [ ] Author `infra/supabase/migrations/0004_feature_flags.sql` — `feature_flags` table (id PK, name unique, value jsonb, env text, updated_at).
- [ ] `GET /v1/flags` endpoint on Cloud Run — returns the flags for the env.
- [ ] In `js/00-api-client.js` (or a new `js/00-flags.js`): fetch flags at boot, expose as `window.FLAGS`. Cache in sessionStorage.
- [ ] Define the `v1_backend` flag with value `primary`. (Phases 05/06 used internal flags; this is the global production-cutover flag.)

### 5.6 Sentry hardening (1 day)
- [ ] Update Sentry SDK init (web + Cloud Run) to set tags: `release`, `feature`, `error_class`. The `release` tag uses `VERCEL_GIT_COMMIT_SHA` (web) and the Cloud Run revision label (server).
- [ ] In Sentry UI: define alert rules — error rate > 1% over 5 min sends to founder email/Slack. (Real on-call rotation lives in Phase 08.)
- [ ] Author `infra/sentry/error-budget.md`: < 0.5% 5xx rate on `/v1/*` requests over rolling 7 days. Process for breach: pause new feature work, investigate, fix.

### 5.7 Rollback drill (0.5 day)
- [ ] Pick a no-impact change (e.g., update a footer copyright). Deploy to production via the normal flow.
- [ ] Practice reverting via Vercel revert button and feature-flag flip in < 10 min.
- [ ] Document each step in `infra/cloud-run/runbooks/rollback.md` with screenshots.

### 5.8 ADR-04 finalize, ADR-08 write (0.5 day)
- [ ] **ADR-04** finalize the table-row-by-table-row decisions: branch protection rules, CI checks, feature-flag tooling = Supabase config table, Cloud Run canary 5/50/100 with bake-times = answered (e.g., 30 min / 6 h / promote manually), web cutover policy.
- [ ] **ADR-08** write: Sentry web SDK + Cloud Run SDK setup, error grouping by `error_class`, log aggregation via Cloud Run native logging + Vercel native logging, dashboard URLs, alert thresholds.

### 5.9 Production cutover + sign-off (0.5 day)
- [ ] Merge the deletion sweep PR.
- [ ] Vercel auto-deploys to production.
- [ ] Open tracking issue "Phase 07 done" with the 10 exit criteria.

**Estimated total:** ~6 working days; calendar 2–3 weeks because (a) deletions reveal hidden coupling, (b) Sentry tagging tweaks need observation cycles.

---

## 6. Acceptance & test plan

### Smoke checklist
1. Production web loads, no console errors.
2. All grep targets are 0.
3. Sign in, create a project, run AutoPilot Reel, run PhotoPilot, edit Canvas, do voice rehearsal — every flow works through `/v1/*` exclusively.
4. Sentry receives events tagged with the correct release sha.
5. Rollback drill completed; took < 10 min.

### Manual verification (post-impl)
- [ ] **Founder:** dogfood — produce 2 full projects after the cutover. Watch Sentry for any new error class.
- [ ] **Engineer:** confirm no `localStorage` writes for AI keys appear in DevTools after a sign-in + project creation flow.

---

## 7. Dependencies

### Predecessors
- **Phase 06** must exit so all seven secondary pipelines (including LoRA Studio) route through `/v1/*` before deletion.

### Successors
- **Phase 08** (Production Launch + Operational Readiness) takes the production-flagged web from this phase and adds dashboards, runbooks, real canary drill.

### Files this phase touches
- New: `infra/supabase/migrations/0004_feature_flags.sql`, `infra/sentry/error-budget.md`, `infra/cloud-run/runbooks/rollback.md`, ADR-04 (finalize), ADR-08.
- Modified: `js/15-project.js`, `js/24-photopilot.js`, `js/17a-create-api.js`, `js/20-reels-creator.js`, `js/28-canvas-consistency.js`, `js/21-kling.js`, `js/17c-create-pipeline.js`, `js/17d-create-languages.js`, `js/34-lora-library.js`, `js/26-brainstorm.js`, `index.html`.
- Forbidden: `cost-estimator.html`, `cost-estimator-plan.md`, `cost-estimator-mock.html` in repo root — leave alone (they're scratch artifacts; override O15 leaves credits-feature replacement out of scope).
- Forbidden: `migration-original-spec.md`, `app/redesign-plan.md`, `app/*-mobile-mockup*.html` — historical / mobile inputs.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Deletion sweep removes a function that turns out to be referenced by a live code path | M | M | After each file edit, run the app locally; before merging, run the full Playwright E2E suite (auth + AutoPilot + secondaries). |
| Dollar-cost UI removal leaves dangling DOM (e.g., empty container with bad styling) | M | L | Visual check every screen. |
| Feature flag read-at-boot fails (network blip during boot) | L | M | Cache last-known-good flags in localStorage; fall back to compile-time defaults. |
| Sentry misconfigured tags lead to ungrouped errors | L | L | Manually trigger 3 errors of different classes; verify grouping. |
| Rollback drill reveals a non-revertible change (e.g., a destructive DB migration shipped in Phase 03/05/06) | L | H | All migrations have been forward-only per O9. Confirm by audit before drill. If a destructive migration slipped through, halt + write a remediation. |
| Founder's dogfood data is in IndexedDB and gets stranded | L | L | Per O13, no real users; founder's dogfood is reproducible. Either keep IDB code path read-only "local-only" mode, or accept the loss. Decide at §1 IDB note. |
| ADR-04's bake-time decision (5%/50%/100% canary timings) is too aggressive for production traffic | L | M | Phase 08 will validate against real traffic; ADR-04 says "30 min / 6 h / manual" as a starting point, revisit after Phase 08's first real release. |

---

## 9. Open questions

1. **IDB code path in `js/15-project.js`: delete entirely or keep as "local-only" mode?** [non-blocking — pick at §5.2 kickoff; default delete since override O13 says no migration].
2. **Feature flag value source — Supabase config table vs build-time constant for `v1_backend`?** [non-blocking — Supabase table for runtime flips; compile-time fallback for first-load resilience].
3. **Are there any non-web cost-estimator references inside `js/`?** Need a separate grep at kickoff. [non-blocking].
4. **Do we need a "soft-deprecation" 410 Gone for any old endpoint paths?** [non-blocking — no, since there are no v0 endpoints in production. The first version of public API is v1].
5. **Production canary bake-times in ADR-04** — start at 30 min / 6 h / manual or 5 min / 1 h / manual? [non-blocking — start conservative at 30 min / 6 h; tighten with data].

---

## 10. Cross-cutting decisions raised by this phase

| Decision | Phases affected | ADR ref |
|----------|-----------------|---------|
| Trunk-based dev + canary deployment + feature-flag tooling vendor (finalized here) | 01, 07, 08 | **ADR-04** |
| Observability (Sentry SDK, error grouping, alert thresholds, web + Cloud Run only) | 01, 07, 08 | **ADR-08** |
| API contract (consumed; no new contract surface added by this phase) | 03, 05, 06, 07 | **ADR-03** |

---

## 11. Links

- Phase index: `/Users/praveen/Desktop/stori/migrations/migration-plan.md`
- Predecessor: `/Users/praveen/Desktop/stori/migrations/migration-phase-06-secondary-pipelines-extraction.md`
- Successor: `/Users/praveen/Desktop/stori/migrations/migration-phase-08-production-launch.md`
- Source spec: `/Users/praveen/Desktop/stori/migrations/migration-original-spec.md` §Modified Files L177–232 (BYOK + cost rows), §Deleted Code L236–244 (line counts re-verified — see §1 fresh grep). All Stripe/quota rows excluded per O15.
- Fresh grep results (2026-05-05): BYOK keys = 13 refs in 4 files; direct Google API = 21 refs in 6 files. **Re-run at phase kickoff.**
- ADRs: `migration-adr-04-trunk-based-canary.md`, `migration-adr-08-observability.md`

*End of Phase 07 dev doc.*
