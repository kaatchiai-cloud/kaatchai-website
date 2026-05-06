# Migration Plan Audit Report

Date: 2026-05-06
Scope: critical review of `migration-plan.md` for logical consistency against the current codebase.
Constraint: no edits made to `migration-plan.md` or any implementation files.

## Verdict

The migration plan is directionally strong, but it is not logically consistent enough to execute as-is.

I found 4 material issues in the phase boundaries and exit criteria that can cause false phase completion, hidden scope expansion, or implementation churn:

1. Phase 06 defines "BYOK removal" too narrowly.
2. Phase 04 and Phase 05 are split across code that is still shared.
3. Phase 03 understates the current persistence surface.
4. The mode-lock rule is stated more broadly than the invariant described elsewhere.

I also found 2 secondary issues:

1. Phase 05's own fan-out doc is internally inconsistent on lipsync placement.
2. The plan assumes test and CI infrastructure that does not appear to exist yet in the repo root.

## Method

I reviewed the plan and cross-checked it against the current implementation, with focus on:

- `migration-plan.md`
- `migration-details.md`
- `devDoc-migration/spec-coverage-matrix.md`
- `devDoc-migration/.architect/spec-inventory.md`
- `js/15-project.js`
- `js/17a-create-api.js`
- `js/17b-create-references.js`
- `js/17c-create-pipeline.js`
- `js/20-reels-creator.js`
- `js/21-kling.js`
- `js/24-photopilot.js`
- `js/26-brainstorm.js`
- `js/26b-llm-router.js`
- `js/27-canvas-state.js`
- `js/28-canvas-consistency.js`
- `js/30-lipsync.js`
- `js/32-audio-input.js`
- `js/33-audio-rehearsal.js`
- `index.html`
- `api/kling.js`
- `vercel.json`

## Findings

### 1. Phase 06 BYOK removal is under-scoped

Severity: P1

The plan says Phase 06 is complete when there are zero references to `stori_key_paid`, `stori_key_free`, or direct `generativelanguage.googleapis.com` URLs in `js/`.

That is not equivalent to "web ships against `/v1/*` exclusively" or "hosted keys only."

The current browser key surface is broader:

- Gemini key storage and migration in `js/17a-create-api.js:278-287`, `js/17a-create-api.js:439`
- ElevenLabs key storage in `js/17a-create-api.js:296`, `js/17a-create-api.js:583`
- Kling access and secret keys in `js/17a-create-api.js:820-829`, `js/21-kling.js:12-15`, `index.html:2184-2193`, `index.html:2954-2963`
- OpenAI and Anthropic keys in `js/26b-llm-router.js:45-103` and the gating UI logic in `js/26-brainstorm.js:594-634`
- fal.ai lipsync key in `js/17c-create-pipeline.js:3730-3733`

There are also direct provider calls beyond Gemini:

- OpenAI direct browser fetch in `js/26b-llm-router.js:60-64`
- Anthropic direct browser fetch in `js/26b-llm-router.js:94-103`
- fal.ai direct browser fetches in `js/17c-create-pipeline.js:3735-3774`

Why this matters:

- Phase 06 can pass on paper while the product still violates the hosted-keys objective.
- "Zero Gemini URLs" is not the same as "zero browser-owned provider credentials."
- Security and compliance posture would still be wrong even after the phase is marked complete.

Recommended correction:

- Redefine Phase 06 exit criteria to require zero browser-stored provider secrets and zero direct provider fetches, not just zero Gemini URLs and two legacy key names.
- Explicitly enumerate Gemini, Kling, OpenAI, Anthropic, ElevenLabs, and fal.ai.

### 2. Phase 04 and Phase 05 are not cleanly separable in the current code

Severity: P1

The plan treats Phase 04 as "AutoPilot extraction" and Phase 05 as "secondary pipelines extraction," but current ownership is not split that way.

Shared code still carries Phase-05-class responsibilities inside the AutoPilot path:

- Canvas mount, normalization, and launch wiring live in `js/17c-create-pipeline.js:4889-4923`
- Canvas video-prompt generation still calls Gemini directly in `js/17c-create-pipeline.js:4936-4995`
- Canvas video launch still calls the current animation path in `js/17c-create-pipeline.js:4997-5029`
- Tier-2 lipsync via fal.ai lives in `js/17c-create-pipeline.js:3721-3900`
- Canvas consistency still depends on existing image-generation helpers in `js/28-canvas-consistency.js:95-130` and `js/28-canvas-consistency.js:148-193`

Why this matters:

- Phase 04 cannot truly finish the Animated AutoPilot path without touching code the plan says belongs to Phase 05.
- Phase ownership will be ambiguous in execution.
- Refactors done in P04 can easily force rework in P05 because the shared modules are not dependency-isolated yet.

Recommended correction:

- Either pull the shared Canvas/Lipsync work that is required for Animated AutoPilot into Phase 04, or
- Insert an earlier extraction step whose only job is to split shared modules so P04 and P05 become real boundaries.

### 3. Phase 03 understates the persistence surface

Severity: P2

Phase 03 is framed around replacing `js/15-project.js` save/load and removing IndexedDB writes for new projects.

That is too narrow for the current codebase.

Project-adjacent persistence also exists in:

- Gallery/project store in `js/15-project.js:8-130`
- Reel save/load and gallery save in `js/20-reels-creator.js:4363-4481`, `js/20-reels-creator.js:5477-5515`
- Reel pipeline handoff via IndexedDB in `js/20-reels-creator.js:5796-5839` and `index.html:4782-4800`
- Cast/reference image storage in `js/17b-create-references.js:683-760`
- Cross-project reference library in `js/17b-create-references.js:4730-4785`
- Audio-input state storage in `js/32-audio-input.js:16-56`
- Audio-rehearsal per-line storage in `js/33-audio-rehearsal.js:30-71`

Why this matters:

- "No remaining IndexedDB writes for new projects" is not achievable by only replacing the `js/15-project.js` path.
- The plan currently mixes authoritative project persistence and local cache persistence without naming the difference.
- The team can finish P03 and still have substantial project-related state persisting locally in ways that complicate support and mobile parity.

Recommended correction:

- Split Phase 03 persistence into two categories:
  - authoritative project storage
  - allowed local caches and temporary artifacts
- Explicitly decide which IndexedDB/localStorage uses are allowed to survive as caches and which must migrate.

### 4. The mode-lock rule is overstated in the phase table

Severity: P2

The Phase 05 row in `migration-plan.md` says:

> mode-lock invariant enforced server-side (any mutation attempt after launch returns 409)

That is broader than the invariant described in ADR-06.

ADR-06 says:

- only `video_mode` becomes immutable after launch
- post-launch instance edits remain allowed
- audio, BGM, storyboard/image iteration, and similar edits are still valid

Evidence:

- `migration-adr-06-mode-lock-invariant.md:40-56`
- Canvas instance mutation helpers still exist in `js/27-canvas-state.js:241-401`
- Audio-driven post-launch operations still exist in `js/33-audio-rehearsal.js:647-704`

I also did not find a clear current client-side hard lock on video-mode selection:

- mode cards are still directly clickable from `index.html:2163-2173` and `index.html:2933-2943`
- switching logic is still open in `js/17a-create-api.js:519-569`

Why this matters:

- If implemented literally, the phase-table wording would block legitimate post-launch edits.
- If implemented per ADR-06, the phase-table wording is inaccurate and will mislead execution and tests.
- The claim that "the web client today enforces this in JS" is not obvious in the main mode-switching path and needs more careful validation before being relied on.

Recommended correction:

- Rewrite the phase-table and phase-doc wording so the lock is explicitly about `video_mode`, not all mutations.
- Add a separate rule for "wrong mode for job" where needed, rather than using one blanket 409 concept for everything.

## Secondary Issues

### 5. Phase 05 fan-out doc is internally inconsistent on lipsync

Severity: P2

Inside `migration-phase-05-secondary-pipelines-extraction.md`:

- Section 1 says lipsync is server-side via MediaPipe-Node: `migration-phase-05-secondary-pipelines-extraction.md:21`
- Technology selection later says MediaPipe should stay client-side: `migration-phase-05-secondary-pipelines-extraction.md:122`

This is already a doc-level contradiction before execution starts.

Why this matters:

- Engineers can implement opposite architectures while both believing they are following the plan.
- Cost, deployment, cold-start, and mobile consequences differ significantly between the two options.

Recommended correction:

- Resolve the lipsync hosting decision once and restate it consistently across the phase index, phase doc, and ADRs.

### 6. Test and CI commitments assume infrastructure that is not visible in the repo root

Severity: P3

The plan repeatedly assumes `lint`, `typecheck`, `test`, Playwright, CI wiring, and server runtimes, but I did not find an existing root Node package manifest or test harness while reviewing the repo root.

Supporting evidence:

- `vercel.json` is still minimal: `vercel.json:1-7`
- The current build is a plain HTML bundler script in `build.js:1-123`
- I did not find a root `package.json`, lockfile, or obvious existing test runner configuration during the repo scan

Why this matters:

- P01 and P02 schedule estimates are optimistic if they assume test/CI scaffolding already exists.
- This is more of a planning realism problem than a logical contradiction, but it will affect sequencing and duration immediately.

Recommended correction:

- Make test/bootstrap work explicit in P01 instead of treating it as near-zero setup.

## Suggested Plan Corrections

If the plan is revised, these are the highest-value edits:

1. Expand P06 exit criteria from "legacy Gemini keys removed" to "no browser-owned provider secrets and no direct provider fetches remain."
2. Rework the P04/P05 boundary around actual module ownership, especially `js/17c-create-pipeline.js`, `js/28-canvas-consistency.js`, and the current lipsync flows.
3. Clarify P03 by separating authoritative cloud persistence from local cache persistence.
4. Tighten mode-lock language everywhere so it means "`video_mode` immutable after launch," not "all mutations forbidden."
5. Resolve the lipsync hosting choice consistently across the fan-out docs.

## Bottom Line

The core migration direction still makes sense.

The main problem is not the destination; it is that some phase boundaries and acceptance tests do not line up with the real code ownership and persistence model. If those are not corrected before execution, the team is likely to mark phases complete while major hosted-key, storage, or shared-module work still remains.
