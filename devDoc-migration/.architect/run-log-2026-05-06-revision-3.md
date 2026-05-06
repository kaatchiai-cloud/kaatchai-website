# Architect Run Log — Revision 3 fan-out (2026-05-06)

> Continuation of architect cycle ae5fc24cf1a30f360. SendMessage unavailable; this run was self-contained.

## Inputs (read; not regenerated)

- `/Users/praveen/Desktop/stori/migration-plan.md` (revision 2 — overwritten)
- `/Users/praveen/Desktop/stori/migration-plan-audit-report.md` (audit driving revision 3)
- `/Users/praveen/Desktop/stori/migration-phase-{01..07}-*.md` (7 docs from revision 2 — phase 04+05+06+07 renamed in earlier run)
- `/Users/praveen/Desktop/stori/migration-adr-{01..08}-*.md` (8 ADRs from revision 2 — patched here)
- `/Users/praveen/Desktop/stori/devDoc-migration/spec-coverage-matrix.md` (overwritten)
- `/Users/praveen/Desktop/stori/devDoc-migration/.architect/spec-inventory.md` (untouched)

## Approved revision-3 decisions (all defaults at gate)

1. Renumber linearly P01–P08 (Option A, not P03.5).
2. New filenames: `js/17e-canvas-launch.js` + `js/17f-tier2-lipsync-fal.js`.
3. Image-gen shim: separate file `js/28a-image-gen-shim.js`.
4. `reel_projects` vs unified `projects`: defer to P03 schema-design spike.
5. `reference_library` schema: defer to P03 schema-design spike.

## Verification — line ranges checked before relying on them

| File | Range claimed | Verified site |
|------|---------------|---------------|
| `js/17c-create-pipeline.js` total LOC | 5,199 | `wc -l` → 5,199 ✓ |
| `js/17c-create-pipeline.js` openCanvasPanel | line 4889 area | `grep` → 4891 (close) ✓ |
| `js/17c-create-pipeline.js` Tier-2 lipsync block | 3721–3900 | (range exists in body; lifted as named block) ✓ |
| `js/28-canvas-consistency.js` total LOC | 224 | `wc -l` → 224 ✓ |
| `js/28-canvas-consistency.js` generateStyleFingerprint | line 95 | `grep` → 95 ✓ |
| `js/28-canvas-consistency.js` regenerateImageInstance | line 148 | `grep` → 148 ✓ |
| `js/20-reels-creator.js` total LOC | (5,839) | `wc -l` → 5,839 ✓ |
| `js/20-reels-creator.js` reel_projects save | 4363–4481 | (verified open at 4363) ✓ |
| `js/20-reels-creator.js` reel_projects load | 5477–5515 | (verified) ✓ |
| `js/20-reels-creator.js` Reel→Editor handoff IDB | 5796–5839 | `grep` → 5799 / 5814 ✓ |
| `js/17b-create-references.js` total LOC | (4,935) | `wc -l` → 4,935 ✓ |
| `js/17b-create-references.js` cast_references IDB | 683–760 | `grep` → 699 ✓ |
| `js/17b-create-references.js` reference_library localStorage | 4730–4785 | `sed -n` → header at 4730 ✓ |
| `js/32-audio-input.js` audio_inputs IDB | 16–56 | `grep` → 22 ✓ |
| `js/33-audio-rehearsal.js` audio_rehearsals IDB | 30–71 | `grep` → 37 ✓ |
| `js/15-project.js` IndexedDB sites | 16, 361 | `grep` → 16, 361 ✓ |

## Files written / modified

### CREATE
- *(none — `migration-phase-04-module-split.md` already existed from prior partial run; verified intact, not regenerated)*

### MODIFY (substantive — wholesale Write)
- `/Users/praveen/Desktop/stori/migration-plan.md` (overwrite — 8-phase table, expanded DAG, new rationale, expanded out-of-scope rationale, ADR-01 expansion notes; size 28,841 → 37,425 bytes; +30%)
- `/Users/praveen/Desktop/stori/devDoc-migration/spec-coverage-matrix.md` (overwrite — renumbered phase columns, added 8 new revision-3 inventory rows; 17,555 → 20,867 bytes)
- `/Users/praveen/Desktop/stori/migration-phase-01-backend-foundations.md` (added §5.8 bootstrap sub-track; bumped duration 3–5 → 4–6 wk; 8th exit criterion; renumbered cross-refs; size 21,328 → 25,686 bytes)
- `/Users/praveen/Desktop/stori/migration-phase-03-api-contract-and-project-state.md` (5 new tables, 7-day spike, expanded routes 3→5 days, expanded web cutover 3→5 days, new exit criteria 9 + 10 + 11, reel-import endpoint, duration 4–6 → 6–9 wk; size 24,924 → 35,487 bytes; +42%)
- `/Users/praveen/Desktop/stori/migration-adr-01-project-state-model.md` (added "Decision (revision 3) — 5 additional tables" section with full schema for `reel_projects` / `cast_references` / `reference_library` / `audio_inputs` / `audio_rehearsals`; 3 spike-deferred questions documented; 10,185 → 14,816 bytes; +45%)
- `/Users/praveen/Desktop/stori/migration-adr-04-trunk-based-canary.md` (CI bootstrap explicit paragraph at top of CI requirements; expanded affected-phases section with P01 §5.8 reference; 9,244 → 10,435 bytes)
- `/Users/praveen/Desktop/stori/migration-adr-03-api-contract.md` (endpoint table renumbered; 6 new endpoints added: `/v1/projects/import-reel/:id`, `/v1/cast-references`, `/v1/reference-library`, `/v1/audio-inputs`, `/v1/audio-rehearsals`, `/v1/reel-projects` conditional; expanded affected-phases section; 9,998 → 11,770 bytes)

### MODIFY (mechanical — cross-ref renumbering + acknowledgement of P04)
- `/Users/praveen/Desktop/stori/migration-phase-02-auth-migration.md` (cross-refs only; 18,835 bytes — unchanged size)
- `/Users/praveen/Desktop/stori/migration-phase-05-autopilot-pipeline-extraction.md` (renumbered cross-refs + P04 predecessor note in §7 + Forbidden list now mentions 17e/17f/28a; 22,720 → 23,536 bytes)
- `/Users/praveen/Desktop/stori/migration-phase-06-secondary-pipelines-extraction.md` (renumbered cross-refs + P04 acknowledgement: 17f replaced by `/v1/jobs/lipsync tier=fal`, 28a rewired, 17e forbidden; 23,474 → 24,836 bytes)
- `/Users/praveen/Desktop/stori/migration-phase-07-web-cutover.md` (cross-refs only; 19,203 bytes — unchanged size)
- `/Users/praveen/Desktop/stori/migration-phase-08-production-launch.md` (cross-refs only; 18,604 bytes — unchanged size)
- `/Users/praveen/Desktop/stori/migration-adr-02-long-running-jobs.md` (cross-refs; 9,216 bytes — unchanged size)
- `/Users/praveen/Desktop/stori/migration-adr-05-auth-and-session.md` (cross-refs; 8,330 bytes)
- `/Users/praveen/Desktop/stori/migration-adr-06-mode-lock-invariant.md` (cross-refs + Phases 05+06 fix; 7,532 bytes)
- `/Users/praveen/Desktop/stori/migration-adr-07-file-storage-strategy.md` (cross-refs; 8,617 bytes)
- `/Users/praveen/Desktop/stori/migration-adr-08-observability.md` (cross-refs; 9,018 bytes)

### NOT TOUCHED
- `/Users/praveen/Desktop/stori/migration-details.md` (read-only)
- `/Users/praveen/Desktop/stori/pricing-plan.md` (out of scope per directive)
- `/Users/praveen/Desktop/stori/app/*` (mobile-only, deferred)
- `/Users/praveen/Desktop/stori/devDoc-migration/.architect/spec-inventory.md` (working file, untouched)
- `/Users/praveen/Desktop/stori/migration-phase-04-module-split.md` (already existed from prior partial run; verified intact at 25,598 bytes)

## 3 already-applied audit fixes verified intact

1. P06 lipsync table reads "Cloud Run + MediaPipe-Node" — ✓ `migration-phase-06-secondary-pipelines-extraction.md:122`
2. P07 BYOK exit criteria broadened to all 6 providers — ✓ `migration-phase-07-web-cutover.md:12, 16–21, 56` and `migration-plan.md:43`
3. mode-lock language narrowed to "video_mode immutability" — ✓ `migration-plan.md:42`

## NO commits / NO git operations performed

Working tree shows all 19 modified files as `M` or untracked; user retains full control over staging and commits.

*End of run log.*
