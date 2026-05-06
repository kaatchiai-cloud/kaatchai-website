# Migration Plan Second-Pass Audit Report

Date: 2026-05-06
Plan under review: `migration-plan.md` (revision 3)
Reviewer: Codex

## Verdict

Revision 3 fixed most of the first-pass structural issues. The remaining problems are narrower, but there are still a few places where the plan's stated phase boundary does not match the live code path closely enough to be implementation-safe.

I found 3 issues worth correcting before treating this plan as execution-ready.

## Findings

### 1. [P1] P05 still excludes an active part of the Animated AutoPilot path

**Plan location**
- `migration-plan.md:41`
- `migration-plan.md:120`

**Why this is a problem**

P05 says Animated mode ships inside the AutoPilot extraction phase, but it also says P05 does **not** touch the P04-split `js/17e-canvas-launch.js`. That is not consistent with the current runtime path.

Today, Animated AutoPilot launches straight into the canvas workspace from `launchImageAgent()` in `js/17c-create-pipeline.js:4851-4860`. From there, `js/29-canvas-render.js:1993-2003` wires the Animated flow through:

- `window.cgFillVideoPrompts()`
- `window.cgLaunchVideoAgent()`

Those functions currently live in `js/17c-create-pipeline.js:4976-5024`, and P04 explicitly plans to move them into `js/17e-canvas-launch.js`. They are not passive UI helpers:

- `_callGeminiForVideoPrompts()` in `js/17c-create-pipeline.js:4936-4974` makes a direct Gemini call.
- `cgLaunchVideoAgent()` calls `animateScenes(...)`, which runs the actual Animated generation path.
- `js/21-kling.js:35-252` still contains the live Kling submit/poll flow and a direct Gemini continuation-prompt call.

As written, P05 can declare "Animated mode shipped second" while still leaving part of the active Animated AutoPilot path in a phase it explicitly excludes.

**Recommended plan fix**

Pick one of these and make it explicit:

1. Keep Animated AutoPilot fully inside P05, and let P05 touch `js/17e-canvas-launch.js` plus the `js/21-kling.js` API-only cutover checks.
2. Narrow P05's milestone to Illustrated-only, and move the Animated canvas-launch cutover into P06.

Either way, the P05 exit criteria should verify API-only behavior for the full Animated path, not just `17a/17b/17c/17d/20`.

### 2. [P2] P03 still overstates its storage cutover scope

**Plan location**
- `migration-plan.md:39`
- `migration-plan.md:90-101`

**Why this is a problem**

Revision 3 correctly expanded the IndexedDB-backed project-state surface, but the row-03 goal still says P03 will replace **every IndexedDB / localStorage write site with cloud storage**. That is broader than the real code surface and broader than the later phases' stated responsibilities.

Current localStorage writes include several categories that are not part of the 10-table project-state cutover:

- theme preference: `js/01-core.js:543`
- create autosave: `js/17c-create-pipeline.js:1090-1104`
- agent panel preference: `js/17c-create-pipeline.js:5171-5180`
- reel autosave: `js/20-reels-creator.js:156-180`
- brainstorm session cache: `js/26-brainstorm.js:916-936`
- provider secrets / BYOK: `js/17a-create-api.js:280-284,439,574,583`, `js/20-reels-creator.js:247-254`, `js/24-photopilot.js:2356`

The plan itself already defers some of that surface:

- P07 is where browser-stored provider secrets are deleted.
- No later phase says theme or UI-only preferences move to cloud storage.

There is also a verification mismatch inside P03 itself: the exit criteria claim "every `indexedDB.open(...)` call site replaced," but the grep list omits the live handoff path in `index.html:4782-4800`, where `indexedDB.open('stori_db', 1)` still exists at `index.html:4787`.

So the actual contract is narrower than "every localStorage write site," and the verification text is narrower than "every IndexedDB call site."

**Recommended plan fix**

Rewrite P03 around the real persistence boundary, for example:

- migrate all **project-state and project-adjacent persistence** needed for create/reel/reference/audio round-trip
- replace all known IndexedDB-backed state stores
- explicitly carve out local-only UI preferences and later-phase BYOK deletion

Also add `index.html` to the row-03 verification list if the plan keeps the "every IndexedDB call site" wording.

### 3. [P2] P04 names the wrong integration point for the split

**Plan location**
- `migration-plan.md:40`
- `migration-plan.md:114`

**Why this is a problem**

P04 says the split requires updating `build.js`'s `MAIN_FILES` list. The current repo does not have a `MAIN_FILES` list in `build.js`.

The actual build/load contract is:

- `build.js:69-91` scans static `<script src="js/...">` tags from `index.html`
- `build.js:82-90` also scans the dynamic loader's `var scripts = [...]`
- `index.html:4713-4719` contains the eager script tags
- `index.html:4731-4745` contains the deferred loader list

That means the real split work is not "update `build.js` list"; it is "update the script references in `index.html` so both dev-time loading and build-time bundling see the new files."

This matters because the new files proposed in P04 are split across both loading modes:

- `js/17e-canvas-launch.js` and `js/17f-tier2-lipsync-fal.js` would need to land in the deferred loader list.
- `js/28a-image-gen-shim.js` may also need eager loading if `js/28-canvas-consistency.js` stays eager.

As written, the plan points engineers at the wrong mechanical change surface.

**Recommended plan fix**

Replace the `build.js MAIN_FILES` language with the real contract:

- update `index.html` eager `<script>` tags and deferred `var scripts = [...]` loader list
- confirm `build.js` still auto-discovers the new files from `index.html`
- rebuild `dist/index.html` and smoke-test both dev and bundled flows

## Residual Risks

These are not full logical blockers, but they are still worth carrying into execution planning:

- P06 parallelism is a little less clean than the summary text suggests. `js/32-audio-input.js:1127-1129` calls `window.persistPerSceneAudio(...)`, which is implemented in `js/33-audio-rehearsal.js:107-129`. Input parsing and audio rehearsal should be treated as one ownership slice, not two independent threads.
- P05's API-only verification language should explicitly cover `js/21-kling.js` if Animated mode remains in scope for that phase. Otherwise the phase can miss a still-live provider path.

## Bottom Line

Revision 3 is substantially better than the previous cut, and the earlier big blockers were addressed. The remaining work is mostly about tightening the written contract so the team does not enter implementation with one mental model while the live browser flow is still doing something slightly different.

I would resolve the P05 Animated-path boundary first, then tighten P03's storage wording, then correct the P04 loader/build integration notes.
