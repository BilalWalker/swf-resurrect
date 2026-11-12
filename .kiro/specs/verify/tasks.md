# Implementation Plan: verify

## Overview

Language: TypeScript (strict), as in the design. The plan builds Verify_Core first (pure modules, with the two required property tests), then the test support, then the edges (PNG, FFDec frames, Timeline_Only_Mode, headless render, Replay with the required clickgoto test), then the Shim gap changes, then the Verify_Stage orchestration and the Pipeline flag, then the floor recording, and ends with one browser checkpoint. No LLM, no UI beyond the static HTML, no hosting.

Required tests (Requirement 13.1), and only these three: the Fidelity_Report determinism property (Task 5.4, Property 14), the pixel diff identity and symmetry properties (Task 2.5, Properties 2 and 3), and the clickgoto Replay test with a floor constant (Task 10.2, raised in Tasks 11.1, 12.3, 12.4 and 15.1 when the score rises). Every other test sub-task is marked `*` and is optional. All implementation tasks are required.

Rules that apply to every task:

- Follow `.kiro/steering/git-workflow.md`. Work on the local branch `wip/verify`. Before the first commit run `git branch --show-current`; if it prints `main`, stop and ask. One top-level task is one commit. Before the commit run `npm run typecheck` and `npm test -- --run`; both must pass. Stage by path only the files the task created or changed, plus `.kiro/specs/verify/tasks.md` and `tasks.meta.json` when it exists. Use the areas `Unpack`, `Convert`, `Emit`, `Runtime`, `Shim`, `Pipeline`, `Test`, `Spec`, `Steering`, `Build`, `Repo`, `Samples`. Never `git push`, never merge, cherry-pick, amend, rebase or reset. Never commit `tools/`, `node_modules/`, `out/`, `.work/` or `dist/`. Never commit generated Reference_Frames, Rendered_Frames or Diff_Images.
- Stop and ask the user instead of continuing when: a checkpoint is reached; tests or typecheck cannot pass within the task's scope; a finding contradicts `requirements.md`, `design.md` or `.kiro/steering/tech.md`; a task would need an FFDec XML name marked `UNVERIFIED` in `src/convert/ffdecXml.ts` to be trusted; or a design "to verify" item (FFDec `-select` syntax, PNG transparency, headless WebGL) turns out different from the design. Do not guess in those cases.
- Before coding a task, read the design section named in the task. The design is long; do not rely on its first part only.
- Files in `src/verify/core/` import no `node:*` module, no `playwright`, no `pngjs`, and use no `Date`, `Math.random`, `localeCompare` or `toLocale*`.
- Exact dependency versions only (no `^`, `~`, ranges or tags). No New_Dependency beyond `playwright` and `pngjs`; do not add `@types/pngjs`. If any other package seems needed, stop and ask with name, exact version, licence and reason.
- Commands are PowerShell compatible. Test runs use `npm test -- --run`, never watch mode. Never block on a dev server.
- Do not modify any file under `samples/*/reference/`.
- Do not edit `requirements.md`, `design.md` or `.kiro/steering/tech.md` from any task.
- `tasks.meta.json` is written by the task runner. Do not create or hand-edit it.
- Property tests use `fast-check` with the shared config in `test/property/config.ts` and carry a comment `// Feature: verify, Property <n>: <title>`.

## Tasks

- [x] 1. Dependencies and pinned tool versions (design section 12, D10)
  - [x] 1.1 Install `playwright` and `pngjs` and download the pinned Chromium
    - The user has pre-approved both packages. Run `npm install --save-exact --save-dev playwright pngjs` so that the latest versions at install time are written without a range operator. Confirm `package.json` shows exact versions for both and that no `@types/pngjs` is added.
    - Run `npx playwright install chromium` once so the Chromium build for that exact `playwright` version exists. The browser lands in the user cache, not in the repo.
    - If the install fails or any other package is pulled in as a direct dependency, stop and ask.
    - Stage `package.json` and `package-lock.json`.
    - _Requirements: 12.1, 12.3, 12.5_

  - [x] 1.2 Add `src/verify/edge/versions.ts` and `src/verify/edge/pngjs.d.ts`
    - Create `versions.ts` exporting `FFDEC_VERSION = '26.4.0'`, `PLAYWRIGHT_VERSION` and `PNGJS_VERSION` as string literals equal to the installed exact versions.
    - Create `pngjs.d.ts` declaring only the members `png.ts` will use (`PNG` class with `width`, `height`, `data`, static `sync.read` and `sync.write`).
    - Run `npm run typecheck`.
    - _Requirements: 9.4, 12.2, 12.3_

  - [ ]* 1.3 Write a unit test for the pinned versions
    - In `test/unit/verifyVersions.test.ts`: `PLAYWRIGHT_VERSION` and `PNGJS_VERSION` equal the `package.json` devDependency strings (no range operator); the `PIXI_VERSION` and `VITE_VERSION` in `src/emit/versions.ts` equal the repo's own `pixi.js` and `vite` pins.
    - _Requirements: 12.3_

- [x] 2. Core: constants, frame sampling, sanitising, pixel diff (design D6, D7, sections 1, 2)
  - [x] 2.1 Implement `constants.ts`, `frameSample.ts` and `sanitize.ts`
    - Create `src/verify/core/constants.ts` with `FORMAT_VERSION`, `DEFAULT_FRAME_COUNT`, `AA_TOLERANCE`, `DIFF_MARK`, `MAX_LCS_CELLS`, `MAX_DETAIL_CHARS` as in the design, and `KNOWN_BEHAVIOUR_GAPS: readonly string[] = []` (empty while Goto_Extra_Cycle is in place; Task 12.7 adds `'goto-extra-cycle'` only if it reverts G7).
    - Create `frameSample.ts` with `selectFrames(frameCount, requested?)` using the integer formula of design section 1 (K raised to 2 when F >= 2; `[1]` when F is 1).
    - Create `sanitize.ts` with `sanitizeDetail(text)`: first line only, absolute Windows (`X:\...`) and POSIX paths replaced by `<path>`, at most 200 characters.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 9.4_

  - [ ]* 2.2 Write property test for the frame sample
    - In `test/property/frameSample.property.test.ts`.
    - **Property 1: Frame sample is well formed and deterministic**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

  - [ ]* 2.3 Write property test for detail sanitising
    - In `test/property/sanitize.property.test.ts`.
    - **Property 17: Detail text carries no absolute path**
    - **Validates: Requirements 9.4**

  - [x] 2.4 Implement `pixelDiff.ts`
    - Create `src/verify/core/pixelDiff.ts` as in design section 2: `RgbaImage`, `flattenOnto`, `compareImages` (max-channel distance, `strict`, edge rule with 3x3 neighbourhood in either image, `size-mismatch` error value), `buildDiffImage`, `roundedHundredths` (integer half-up, clamp to 9999 when any pixel differs and to 0 when all differ), `meanHundredths`.
    - Run `npm run typecheck`.
    - _Requirements: 4.1, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 2.5 Write the required pixel diff identity and symmetry property tests
    - Create `test/property/gen/genImage.ts` (RGBA images 1x1 to 24x24 with any alpha; near-identical pairs with bounded channel perturbation; independent random pairs).
    - Create `test/property/pixelDiff.property.test.ts` with both properties. This test is required.
    - **Property 2: Pixel diff identity**
    - **Property 3: Pixel diff symmetry**
    - **Validates: Requirements 4.2, 4.3, 13.3**

  - [ ]* 2.6 Write property tests for tolerance, range, size mismatch and diff image
    - In `test/property/pixelDiffMore.property.test.ts`, one test per property.
    - **Property 4: Tolerance contract and totals**
    - **Property 5: Match percentage range and rounding** (compare with a BigInt reference)
    - **Property 6: Size mismatch is an error value**
    - **Property 7: Diff image follows the marking rule**
    - **Validates: Requirements 4.1, 4.4, 4.5, 4.6, 4.7, 4.8**

- [x] 3. Core: trace formatting and comparison (design section 7)
  - [x] 3.1 Implement `traceFormat.ts` and `traceCompare.ts`
    - Create `src/verify/core/traceFormat.ts` with `formatTraceCall(args)` (`args.map(String).join(' ')`) and `splitTraceLines(text)` (split on `\n`, remove one trailing `\r` per line, drop the final empty element).
    - Create `traceCompare.ts` with `compareTraces`: common prefix and suffix trimmed, LCS table as `Uint32Array`, fixed backtrack rule (`L[i+1][j] >= L[i][j+1]` means missing), `too-large` above `MAX_LCS_CELLS`, `traceScore` through `roundedHundredths` with the same clamp, `firstDivergence`.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.9_

  - [ ]* 3.2 Write property test for conservation and LCS
    - In `test/property/traceCompare.property.test.ts`, with generators in `test/property/gen/genTrace.ts` (small alphabet, optional trailing `\r`) and a brute-force LCS in the test.
    - **Property 8: Trace comparison conserves lines and matches a reference LCS**
    - **Validates: Requirements 7.1, 7.2, 7.4, 7.7**

  - [ ]* 3.3 Write property test for identical traces
    - In `test/property/traceIdentity.property.test.ts`.
    - **Property 9: Identical traces compare perfectly**
    - **Validates: Requirements 7.5, 7.6**

  - [ ]* 3.4 Write property test for one inserted or dropped line
    - In `test/property/traceEdit.property.test.ts`.
    - **Property 10: One inserted or dropped line costs one entry**
    - **Validates: Requirements 7.3**

- [x] 4. Core: replay planning and SVG bounds (design section 6, click timing table)
  - [x] 4.1 Implement `replayPlan.ts` and `svgBounds.ts`
    - Create `src/verify/core/replayPlan.ts`: `parseNumFrames(tomlText)` for the key `num_frames`, `planReplay(inputJson, numFrames)` with Input_Groups (a group ends at and includes `Wait`), Click pairing, `unsupported-input` (treated as `Wait`), `unpaired-mouse-event`, `unused-input`, tick count rule. Group k belongs to tick k; a Click takes effect in the tick of its `MouseUp`.
    - Create `svgBounds.ts`: shape bounds from the SVG `width`/`height` in `px`, shifted by the shape origin, as `test/unit/clickOracle.test.ts` does today (read that file first and keep the same result).
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [ ]* 4.2 Write property test for click pairing
    - In `test/property/replayPlanPairing.property.test.ts`, generator in `test/property/gen/genReferenceInput.ts`.
    - **Property 11: Click pairing and accounting**
    - **Validates: Requirements 6.4, 6.5, 6.6**

  - [ ]* 4.3 Write property test for click ticks
    - In `test/property/replayPlanTicks.property.test.ts`.
    - **Property 12: Click ticks and tick count**
    - **Validates: Requirements 6.3, 6.7, 6.9**

  - [ ]* 4.4 Write unit tests for the real clickgoto plan and SVG bounds
    - In `test/unit/replayPlan.test.ts`: `samples/clickgoto/reference/input.json` with `num_frames = 32` gives 21 groups, 32 ticks, no problems, clicks at ticks 3, 7, 12, 14, 20 at the positions in the design table. Also `svgBounds` on a fixture SVG.
    - _Requirements: 6.7, 6.10_

- [x] 5. Core: known limits, report, HTML (design sections 9, 10 and Data Models)
  - [x] 5.1 Implement `limits.ts`
    - Create `src/verify/core/limits.ts` with `knownVisualLimits(scene, unsupported)`: `colour-offset`, `skewed-matrix` (using `decomposeMatrix` from `template/runtime/stageTree.ts`) and `unsupported-feature` entries, de-duplicated by `(kind, id, message)` and sorted.
    - _Requirements: 5.6_

  - [x] 5.2 Implement `report.ts`
    - Create `src/verify/core/report.ts`: the types of the Data Models section, `buildFidelityReport`, `compareProblems`, `serialiseFidelityReport` (via `canonicalJson(report, 'fidelityReport')`). Total ordering as in design section 9. `FidelityInputs` has `knownBehaviourGaps` (from `KNOWN_BEHAVIOUR_GAPS`); the builder sorts it by code unit, removes duplicates and writes `behaviour.knownBehaviourGaps` for both `compared` and `not-compared` behaviour parts, so the field is always present. `overallMatch` is `null` when no frame is compared. Every part that did not run carries `status: 'not-compared'` and a reason. No timestamp, path or duration anywhere.
    - _Requirements: 5.3, 5.4, 5.5, 7.8, 9.1, 9.2, 9.4, 9.5, 9.6, 9.8_

  - [x] 5.3 Implement `html.ts`
    - Create `src/verify/core/html.ts`: `escapeHtml` and `renderFidelityHtml(report)` with the sections and the pass or fail text of design section 10. No script, no external resource, relative image paths, `alt` text `Frame N reference | rendered | pixel difference`, numbers via `toFixed(2)`. When `knownBehaviourGaps` is not empty, the behaviour section lists each gap code (escaped); when empty, it prints nothing for it.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [x] 5.4 Write the required report determinism property test
    - Create `test/property/gen/genReportInputs.ts` (frame outcomes in any order with compared, `reference-unavailable`, `size-mismatch` and `render-failed`; limits; compared and not-compared behaviour with random missing and extra lists; problems of every kind; random class statuses).
    - Create `test/property/fidelityDeterminism.property.test.ts`: build the report twice from the same inputs, serialise both, compare the text byte for byte. This test is required.
    - **Property 14: Report serialisation is deterministic**
    - **Validates: Requirements 9.1, 9.3, 13.3**

  - [ ]* 5.5 Write property test for the report round trip
    - In `test/property/fidelityRoundTrip.property.test.ts`.
    - **Property 15: Report round trip**
    - **Validates: Requirements 9.7**

  - [ ]* 5.6 Write property test for ordering and completeness
    - In `test/property/fidelityOrdering.property.test.ts` (permute `frames`, `problems`, `limits`).
    - **Property 16: Report is total, ordered and complete**
    - **Validates: Requirements 5.3, 5.4, 5.5, 9.6, 9.8**

  - [ ]* 5.7 Write property test for HTML content
    - In `test/property/fidelityHtmlContent.property.test.ts`.
    - **Property 18: HTML contains the required content and no active or remote content**
    - **Validates: Requirements 10.2, 10.3, 10.4, 10.5**

  - [ ]* 5.8 Write property test for HTML escaping
    - In `test/property/fidelityHtmlEscape.property.test.ts`.
    - **Property 19: HTML escapes report text**
    - **Validates: Requirements 10.6**

  - [ ]* 5.9 Write property test for HTML determinism
    - In `test/property/fidelityHtmlDeterminism.property.test.ts`.
    - **Property 20: HTML rendering is deterministic**
    - **Validates: Requirements 10.8**

  - [ ]* 5.10 Write purity and limits unit tests
    - In `test/unit/verifyCorePurity.test.ts`: grep every `src/verify/core/*.ts` for `node:`, `Date`, `Math.random`, `localeCompare`, `toLocale`, `playwright`, `pngjs` and expect no hit. In `test/unit/limits.test.ts`: colour offset, skewed matrix and unsupported-feature entries on a small scene.
    - _Requirements: 5.6, 11.8_

- [x] 6. Test support: FakeBackend move and fixture project emitter (design D9, section 13)
  - [x] 6.1 Move `FakeBackend` to `src/verify/edge/fakeBackend.ts`
    - Use `smart_relocate` (or `git mv` plus import fix) to move the class. Replace `test/support/fakeBackend.ts` with `export * from '../../src/verify/edge/fakeBackend';` so every existing test import still works.
    - Run `npm run typecheck` and the existing tests that use `FakeBackend`.
    - _Requirements: 6.2_

  - [x] 6.2 Add `test/support/emitFixtureProject.ts`
    - Read `test/fixtures/<sample>/` as `test/support/fixtureClasses.ts` does, run `convertModel` and `planTranslate`, write the SVGs, and call the real `emit()` with `templateDir = <repo>/template` into a temp directory under `.work/`. Return `{ projectDir, scene, dispose }`. No Java.
    - _Requirements: 6.2, 6.11_

  - [ ]* 6.3 Write a unit test for the fixture emitter
    - In `test/unit/emitFixtureProject.test.ts`: for `clickgoto` the project has `src/classes.ts`, `runtime/player.ts`, `shim/index.ts` and `assets/` SVGs; `dispose` removes the directory.
    - _Requirements: 6.2_

- [x] 7. Edge: PNG codec and FFDec reference frames (design section 3, D10)
  - [x] 7.1 Implement `png.ts`
    - Create `src/verify/edge/png.ts`: `decodePng(buffer): RgbaImage` and `encodePng(image): Buffer` over `pngjs` sync API.
    - _Requirements: 2.2, 5.2_

  - [x] 7.2 Implement `ffdecFrames.ts` and check the "to verify" items against the real jar
    - Create `exportReferenceFrames({ swfPath, jarPath, frames, workDir, spawner? })` as in design section 3: `-format frame:png -select <comma list> -export frame <workDir> <swf>` through `spawnFfdec`, timeout 120 s, per-frame `reference-unavailable` for a non-zero exit or a missing PNG, `size-mismatch` against the stage size.
    - Verify by hand with `tools/ffdec` on `samples/clickgoto/test.swf` into a directory under `.work/`: the comma-separated `-select` syntax works and the files are named `<n>.png` for 1-based frame numbers. **If either differs from the design, stop and ask the user before continuing.**
    - Check whether the FFDec PNG has transparent pixels. Flattening onto the stage background handles both cases, so this does not change the code, but state the finding in the commit message. If the PNG is not stage size, stop and ask.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 7.3 Write unit tests for `ffdecFrames` with a fake spawner
    - In `test/unit/ffdecFrames.test.ts`: argument vector, ANSI stripped output, non-zero exit gives `reference-unavailable` for every frame, one missing PNG affects only that frame, size mismatch.
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

- [x] 8. Template: Timeline_Only_Mode (design section 4, D11)
  - [x] 8.1 Add `template/src/timelineOnly.ts` and the `main.ts` branch
    - Create `parseTimelineOnly(search)` (pure) and `runTimelineOnly(loaded, backend, frame)` with the `window.__swfResurrect` outcome as in design section 4: `Application` at resolution 1 with `preserveDrawingBuffer`, `Player` with an empty `classRegistry` and a `ManualClock`, `frame - 1` calls of `clock.advance` and `update()`, check `player.root.currentFrame`, render once, store `toDataURL('image/png')`.
    - In `template/src/main.ts` add the single branch after `loadScene` and make the existing `boot().catch` set `window.__swfResurrect = { ready: false, error }` when the parameter was present. A page without the parameter must boot exactly as before.
    - Run `npm run typecheck:template` and `npm run typecheck`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7_

  - [ ]* 8.2 Write unit tests for Timeline_Only_Mode
    - In `test/unit/timelineOnly.test.ts`: `parseTimelineOnly` for absent, valid, zero, negative and non-numeric values; a Player with an empty registry and `FakeBackend` stepped N-1 times on the clickgoto scene shows the expected root frame (1, 2, 3) and produces no trace output.
    - _Requirements: 3.2, 3.3_

- [x] 9. Edge: build the project and render frames in headless Chromium (design section 5, D3 to D5)
  - [x] 9.1 Implement `buildProject.ts`
    - Create `buildProject(projectDir)`: copy the project (no `node_modules`, no `dist`) into `mkdtemp(<repo>/.work/verify-)`, run `build` from the repo's `vite` with `configFile: false`, `base: './'`, `logLevel: 'silent'`, return `{ distDir, dispose }`. Cleanup with `rm` and `force`, also on failure.
    - _Requirements: 3.5, 12.5_

  - [x] 9.2 Implement `renderFrames.ts` and check headless WebGL
    - Create `renderFrames(distDir, frames, stage)` as in design section 5: one Chromium launch with `closing` in `finally`, a context at the stage size with `deviceScaleFactor: 1`, one page per frame, `page.route('http://verify.local/**')` serving files from `distDir` with a path check and a small MIME map, wait up to 10 s for `window.__swfResurrect`, decode the PNG data URL, `render-failed` with `sanitizeDetail` on error or timeout, launch failure gives `render-failed` for every frame.
    - Check by hand on a staging build of the clickgoto fixture project that headless Chromium provides WebGL for PixiJS and that the captured canvas has stage size. **If WebGL is not available or the size differs, stop and ask the user before changing launch arguments or anything else.**
    - _Requirements: 3.5, 3.6, 11.5_

  - [ ]* 9.3 Write an integration test for build and render
    - In `test/e2e/renderFrames.test.ts` (skipped when Chromium is not installed): emit the clickgoto fixture project, build it, render frames 1 to 3, expect three stage-size images and no `render-failed`.
    - _Requirements: 3.5_

- [x] 10. Edge: Replay and the required clickgoto Replay test (design section 6)
  - [x] 10.1 Implement `replay.ts` and `replayRunner.ts`
    - Create `src/verify/edge/replayRunner.ts` (entry point for `node --import tsx`, arguments `<projectDir> <planJson> <resultJson>`) and `replay.ts` (spawns it with `process.execPath`, `shell: false`, cwd = repo root, 60 s timeout, reads the result file). The runner imports the project's `runtime/player.ts`, `runtime/clock.ts`, `runtime/loader.ts`, `shim/trace.ts`, `shim/internal.ts`, `src/classes.ts`; fills `shapeBounds` with `svgBounds`; installs the trace sink before `new Player`; runs tick 0 as construction plus one `exitFrame(root)` (no clock advance, no `update()`), then applies Input_Group 0; ticks 1 and up are `clock.advance` by one frame interval plus one `update()`, then that tick's Input_Group; for clickgoto that is 32 ticks (0 to 31) and 31 frame steps; dispatches clicks of the tick; `setTraceSink(null)` in `finally`; writes `{ lines, ticksRun, error }`.
    - Verify that `tsx` resolves the emitted `'../shim'` imports. If it does not, use the fallback in the design (`vite` `createServer` with `ssrLoadModule`, no new dependency) and mention it in the commit message.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.11, 6.12, 6.13, 6.15_

  - [x] 10.2 Write the required clickgoto Replay test
    - Create `test/unit/clickgotoReplay.test.ts`. Use `emitFixtureProject` for `clickgoto` and the real `replay.ts` with `samples/clickgoto/reference/{output.txt,input.json,test.toml}`. Assert: 21 groups, 32 ticks (tick 0 is construction with `exitFrame(root)`, 31 frame steps), clicks planned at ticks 3, 7, 12, 14, 20; the captured `///(LeftButton clicked` lines are in ticks 3, 12, 20 and `///(RightButton clicked` in ticks 7, 14; two Replays give equal lines; the `reference/` files are byte-unchanged (hash before and after); `traceScore >= TRACE_SCORE_FLOOR`.
    - Measure the current score, then set `TRACE_SCORE_FLOOR` in the test to that measured value (not a guess). This test is required.
    - If a click lands on the wrong button or tick, stop and ask: the design predicted the ticks from `output.txt`.
    - _Requirements: 6.10, 6.13, 6.14, 13.1, 13.5_

- [x] 11. Shim: Event text and root name (design section 8, G1 and G2)
  - [x] 11.1 Add `bubbles`, `cancelable`, `eventPhase`, `Event.toString()` and `root1`
    - In `template/shim/events.ts` give `Event` the fields and defaults of Requirement 8.2 (optional constructor overrides) and `toString()` returning `[Event type="<type>" bubbles=<bool> cancelable=<bool> eventPhase=<n>]`. `MouseEvent` inherits it.
    - In `template/runtime/player.ts` set `root.name = 'root1'` right after the root is created and before any event.
    - Run `npm run typecheck:template`, `npm run typecheck`, the full tests, and the Replay test. If the trace score rose, raise `TRACE_SCORE_FLOOR` in the same commit; never lower it. Existing tests stay green, including the Click_Oracle rows.
    - _Requirements: 8.1, 8.2, 8.3, 8.8, 8.9, 13.6_

  - [ ]* 11.2 Write property test for the event text
    - In `test/property/eventText.property.test.ts`.
    - **Property 13: Event text has the Flash format**
    - **Validates: Requirements 8.1**

  - [x] 11.3 Add the Task 11 rows to `template/shim/ADDED_APIS.md`
    - Add rows for `Event.bubbles`, `Event.cancelable`, `Event.eventPhase` and `Event.toString`, each with the fixture line that needs it (`EventWatcher.as:17`). Do not list an API that was not added.
    - _Requirements: 8.10_

  - [ ]* 11.4 Write unit tests for the root name and event defaults
    - In `test/unit/eventDefaults.test.ts`: `added`, `removed`, click bubble, other types do not; `cancelable` false; root `name === 'root1'` before the first event; a loose clip outside a Player keeps its own name.
    - _Requirements: 8.2, 8.3_

- [x] 12. Shim: lifecycle events and per-frame order (design section 8, G3 to G6, G5b)
  - [x] 12.1 Record the user's decisions on the event order (no stop, no approval needed)
    - The user has answered the open design items. Do not ask again and do not stop. Write the three decisions into the commit message of Task 12.3 (and cite them in the code comments where they apply): (a) `exitFrame` is children-first, and the one pre-order expectation in `test/unit/exitFrame.test.ts` (`['root', 'a', 'b']`) changes to children-first (`['b', 'a', 'root']`), because `reference/output.txt` lines 13 to 15 and 29 to 31 show children first (Requirement 8.9); (b) Replay tick 0 is construction plus one `exitFrame(root)` with no clock advance and no `Player.update()`, as the Replay_Tick definition and Requirement 6.3 say; (c) G7 (Goto_Extra_Cycle) is in scope and is implemented in Task 12.7.
    - This sub-task edits no file by itself and has nothing to run. Tasks 12.2 to 12.7 do not wait on any answer.
    - _Requirements: 6.3, 8.6, 8.9, 8.11, 12.8_

  - [x] 12.2 Dispatch `added`, `addedToStage` and real bubbling (G3, G6 dispatch part)
    - In `template/shim/DisplayObject.ts`, `Sprite.ts`, `internal.ts`: `addChild` dispatches `added` on the child, then `addedToStage` on the child and its descendants when the parent chain ends at a root marked `_isStageRoot` (set by the Player). `dispatchEvent` delivers at the target (`eventPhase` 2) and, when `bubbles`, walks `_parent` delivering to each ancestor with `eventPhase` 3 and `currentTarget` set; `target` stays the origin. `Player.dispatchClick` calls it once instead of walking the parents by hand. `removeChild` dispatches `removed` (then `removedFromStage` when on stage); `detachChild` no longer calls the public `removeChild`.
    - Run all tests and the Replay test; raise the floor if the score rose.
    - _Requirements: 8.2, 8.4, 8.9, 8.10, 13.6_

  - [x] 12.3 Implement the five-phase frame step, the initial build and children-first `exitFrame` (G4, G5, G5b)
    - Change `MovieClip._step()` into the phases A to D of the design table over a snapshot of the clips that existed before the tick, and `internal.exitFrame` to children-first order. `Player.createClip` stops draining scripts; after the whole tree is built the Player runs `added` plus `addedToStage` post-order (at the target only), `frameConstructed` post-order, then frame-1 scripts root first. `frameConstructed` is also dispatched in phase C of each tick.
    - Update the single expectation in `test/unit/exitFrame.test.ts` to children-first (decision recorded in Task 12.1; Requirement 8.9). Put decisions (a) to (c) of Task 12.1 in the commit message. Keep every other existing test unchanged.
    - Run all tests and the Replay test; raise the floor if the score rose.
    - _Requirements: 8.5, 8.6, 8.8, 8.9, 13.6_

  - [x] 12.4 Dispatch timeline `removed` and `added` on backward moves and gotos (G6 timeline part)
    - In `template/shim/MovieClip.ts`: a backward frame change (wrap or goto to an earlier frame) removes each non-retained timeline child with `removed` in phase A (and `removedFromStage` when on stage) and adds the new ones in phase C. A forward same-depth, different-symbol replacement stays silent and atomic. A script `gotoAndStop` or `gotoAndPlay` that moves backward does the same at once. Retained means same depth and same symbol, as `_renderFrame` already tests. Forward removal without replacement and forward addition at a new depth follow Flash and are marked **inferred** in the code comment.
    - Run all tests and the Replay test; raise the floor if the score rose. G7 is implemented in Task 12.7, not here.
    - _Requirements: 8.4, 8.6, 8.8, 8.9, 13.6_

  - [x] 12.7 Implement Goto_Extra_Cycle (G7; design section 8, "G7: Goto_Extra_Cycle")
    - Read design section 8 G7 in full first, and lines 67 to 88 and 284 to 310 of `samples/clickgoto/reference/output.txt`. Do the work as its own change set touching only Shim and Player files plus tests, so it can be undone alone.
    - Before editing, run the clickgoto Replay test and record the Trace_Score and the `matched` count (after Tasks 12.2 to 12.4).
    - Add the optional `cycle?: ClipCycle` member (`readonly busy: boolean`, `runGotoCycle(): void`) to `ConstructionContext` in `template/shim/internal.ts`, and add `internal.frameConstructed` (post-order over a snapshot of the MovieClips under the root, delivered to those still attached). In `MovieClip.goto`: with no `cycle` or `cycle.busy`, today's code (enqueue and drain); otherwise enqueue only when the frame changed, do not drain, and call `cycle.runGotoCycle()` after `_renderFrame()`. The cycle also runs when the target frame equals the current frame.
    - In `template/runtime/player.ts` supply `cycle`: a `busy` counter incremented in the constructor body, in `update()` (all phases and the `exitFrame` pass) and in `runGotoCycle()`, each decremented in `finally`; `dispatchClick` does not increment it. `runGotoCycle()` runs `frameConstructed(root)`, then `scripts.drain()`, then `exitFrame(root)`; no `enterFrame`, no clip advances.
    - Update only the expectation Requirement 8.9 names for `gotoAnd*` and `EXIT_FRAME` if a test asserts it (the design found none). Click_Oracle rows (`test/unit/clickOracle.test.ts`) and every other existing test stay green and unchanged.
    - Revert rule (Requirement 8.12): after the change, run the full tests and the Replay test. If the Trace_Score is not higher than the value recorded before, or an existing behaviour test breaks and cannot be fixed without changing an expectation other than the ones Requirement 8.9 names, undo this task's own uncommitted edits in the Shim and Player (no `reset`, `amend` or force), keep the new G7 tests but mark them skipped with a reason, add `'goto-extra-cycle'` to `KNOWN_BEHAVIOUR_GAPS` in `src/verify/core/constants.ts`, and say in the final summary that G7 was reverted and why. This is not a stop point. Never special-case Reference_Trace content.
    - If G7 is kept, `KNOWN_BEHAVIOUR_GAPS` stays empty and the Replay test asserts the cycle lines (`frameConstructed`, frame script, `exitFrame`, then the Container lines) at the click ticks 3, 7, 12, 14 and 20, so the constant cannot claim "no gap" while the cycle is missing. If kept, raise `TRACE_SCORE_FLOOR` in `test/unit/clickgotoReplay.test.ts` to the new measured value in the same commit; never lower it.
    - Add rows to `template/shim/ADDED_APIS.md` for `ConstructionContext.cycle` / `ClipCycle` and `internal.frameConstructed`, with the fixture lines that need them (`LeftButton.as` `this.gotoAndStop(2)` and `this.parent.r_button.gotoAndStop(1)`; use the real line numbers, which count blank lines). If reverted, add no rows. Add a note that `gotoAnd*` now runs an extra cycle outside the frame step.
    - State in the commit message the Trace_Score and `matched` count before and after, and whether G7 was kept or reverted.
    - _Requirements: 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 13.6_

  - [ ]* 12.8 Write unit tests for Goto_Extra_Cycle
    - In `test/unit/gotoExtraCycle.test.ts`: with a Player, a goto from `dispatchClick` runs `frameConstructed` (children first), the queued frame script, then `exitFrame` (children first), with no `enterFrame`; a goto to the current frame runs the cycle without a script; two sequential gotos run two cycles in order; a goto inside a frame step phase, inside a frame script or inside a cycle starts no cycle; a throwing listener leaves the Player usable (`busy` restored); a clip built without a Player keeps today's behaviour (no extra events). If Task 12.7 was reverted, mark these tests skipped with the reason.
    - _Requirements: 8.11_

  - [x] 12.5 Add the remaining rows to `template/shim/ADDED_APIS.md`
    - Add rows for `DisplayObject` bubbling `dispatchEvent`, `_isStageRoot` (`EventWatcher.as:25`), the `added`/`removed` dispatch (`EventWatcher.as:24`, `:27`) and the `frameConstructed` phase (`EventWatcher.as:26`), each with the fixture line that needs it.
    - _Requirements: 8.10_

  - [ ]* 12.6 Write unit tests for the event order
    - In `test/unit/shimEventOrder.test.ts`: an event log on a two-level scene for each phase (A advance and removal, B `enterFrame` children first, C `added` then `frameConstructed`, D frame scripts root first, E `exitFrame` children first); `added`/`addedToStage` for attached and loose parents; backward versus forward timeline moves; bubbling with `eventPhase` 3.
    - _Requirements: 8.4, 8.5, 8.6_

- [x] 13. Edge: Verify_Stage orchestration (design Verify_Stage sequence, sections 9 and 11)
  - [x] 13.1 Implement `verifyStage.ts`
    - Create `src/verify/edge/verifyStage.ts` exporting `verifyStage(req: VerifyRequest): Promise<VerifySummary>`. Steps: `selectFrames` from the root `frameCount`; `exportReferenceFrames`; `buildProject` and `renderFrames`; `compareImages` per frame with the stage background; write Reference, Rendered and Diff PNGs under `<out>/verify/frames/<NNNN>-{reference,rendered,diff}.png`; read `reference/output.txt`, `input.json`, `test.toml` if present (missing output gives `no-reference-trace`, missing input gives `no-reference-input`, bad JSON gives `invalid-input-json`); `planReplay` and `replay`; `compareTraces` (`trace-too-large` and `replay-failed` as not-compared reasons); `knownVisualLimits`; `buildFidelityReport`, `renderFidelityHtml`; write `fidelity-report.json` and `fidelity-report.html`. Every failure of FFDec, the browser or the Replay is a recorded entry; only a failed write throws. Use `sanitizeDetail` for every free-text detail and the pinned strings from `versions.ts`. Never touch `samples/*/reference/`.
    - Temporary directories are removed in `finally`.
    - _Requirements: 2.3, 3.6, 5.1, 5.2, 5.7, 6.1, 6.14, 6.15, 7.8, 9.2, 10.1, 11.5, 12.4_

  - [ ]* 13.2 Write unit tests for the orchestration with stubs
    - In `test/unit/verifyStage.test.ts` with injected fakes for FFDec, renderer and replay: all frames failing still writes both reports; no `output.txt` gives `no-reference-trace` and no Trace_Score; a failed render for one frame leaves the others compared; a second run gives byte-identical JSON and HTML; reference files untouched.
    - _Requirements: 5.5, 7.8, 9.3, 10.8, 11.5_

- [x] 14. Pipeline: `--verify` and `--verify-frames` (design section 11)
  - [x] 14.1 Add the flags, the stage hook and lazy loading
    - In `src/pipeline/cli.ts`: parse `--verify` (boolean) and `--verify-frames <n>` (validated with `/^[1-9][0-9]*$/`; without `--verify` or with a bad value return exit code 2 with the usage text); options are built conditionally so absent flags leave no key; `USAGE` lists both flags; wire `verify: async (req) => (await import('../verify/edge/verifyStage')).verifyStage(req)`.
    - In `src/pipeline/pipeline.ts`: add `VerifyRequest`, `VerifySummary`, `PipelineStages.verify?`, `PipelineArgs.verify?`. Run the stage after the type-check gate in the same `try` only when `args.verify` is set. Derive `sampleName` and `referenceDir` from the SWF directory. Print `[verify] overall match <n>%, trace score <n>% -> <json>, <html>` (`not-compared` in place of a missing number). A low score does not change the exit code; an exception prints `error [verify]: ...`, exits 1, and the Translation_Report is still written.
    - Without `--verify` no verify module, `playwright` or `pngjs` is loaded and no `fidelity-report.*` or `verify/` is written.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.7_

  - [ ]* 14.2 Write unit tests for the CLI and pipeline wiring
    - Extend `test/unit/cli.test.ts` (use `toEqual` as there) for both flags and the exit code 2 cases. In `test/unit/pipelineVerify.test.ts` with a stub stage: not called without the flag, called after the gate with it, summary line, exit code unchanged by a low score, write failure gives exit 1 with the Translation_Report still written.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.7_

- [x] 15. Floor recording and end-to-end check (Requirements 8.7, 13.5, 13.6)
  - [x] 15.1 Measure the final clickgoto Trace_Score and record the floor
    - With all Shim changes in place, run the clickgoto Replay test and measure the Trace_Score and the counts of `missing` and `extra` lines. Set `TRACE_SCORE_FLOOR` in `test/unit/clickgotoReplay.test.ts` to the measured value; never lower it from the value last committed. The design gives no measured ceiling: the old 86 percent estimate assumed G7 out of scope and no longer applies. A higher score is expected with G1 to G7, but it is unmeasured; do not compare against a predicted number.
    - State in the commit message and in the final summary the achieved Trace_Score, the remaining `missing` and `extra` counts, and whether G7 (Task 12.7) was kept or reverted (and, if reverted, that `goto-extra-cycle` is in `KNOWN_BEHAVIOUR_GAPS` and appears in the report).
    - _Requirements: 8.7, 8.8, 13.5, 13.6_

  - [ ]* 15.2 Write the optional end-to-end test
    - In `test/e2e/verify.test.ts` (skipped when Java, `tools/ffdec` or Chromium is missing): run the Pipeline with `--verify` on `samples/clickgoto/test.swf` and `samples/tweendemo/test.swf`; both report files exist; `tweendemo` behaviour is `not-compared` with `no-reference-trace`; a second run gives byte-identical reports; every frame is compared or has a reason.
    - _Requirements: 5.7, 7.8, 9.3, 10.8_

- [x] 16. Checkpoint: browser review of fidelity-report.html
  - Run `npm run pipeline -- samples/clickgoto/test.swf out/clickgoto --verify --force` and `npm run pipeline -- samples/tweendemo/test.swf out/tweendemo --verify --force`.
  - Give the user the two paths of `fidelity-report.html`. For each sample state: the Overall_Match, the Trace_Score or `not-compared`, the number of `missing` and `extra` trace lines, and the list of frames not compared with their reasons.
  - Then stop and wait for the user's answer. Do not continue to any later task.
  - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 17. Convert and backend: shape origin applied twice (design sections 4, 5 and D11)
  - [x] 17.1 Confirm the double shift with a failing test
    - FFDec shape SVGs wrap the paths in `<g transform="matrix(1,0,0,1,tx,ty)">`, and the paths inside are already in shape-origin coordinates. Pixi 8.22 `Graphics.svg()` ignores that group transform, and `pixiBackend.ts` `createShape` then shifts by `-origin` again, so every shape is drawn one origin up-left; `loadShape` bounds carry the same error. Write a test that fails today: the `Graphics.svg` local bounds of the clickgoto sample's `1.svg` start near -42, not near 0.5. Keep it as a regression test after the fix (adjust the expectation to the fixed behaviour).
    - Read `FINDINGS.md` task 2.3 and state in the commit message what it got wrong.
    - _Requirements: 3.1, 4.1_

  - [x] 17.2 Remove the dependence on the renderer honouring the wrapper
    - Prefer flattening the wrapper in Convert (strip the transform from the emitted SVG, keep the origin in Scene_JSON for bounds) and stop shifting in `pixiBackend.ts`; `loadShape` bounds must follow. The result must not depend on whether the renderer honours the wrapper. Keep the existing Click_Oracle rows and every other test green; update only an expectation that encodes the double shift, and name it in the commit message.
    - Report whether any sample SVG has other transforms (nested `g`, `gradientTransform`, `transform` on paths) that Pixi would also ignore, and list them.
    - Update design.md where it describes shape origin handling.
    - _Requirements: 3.1, 4.1, 5.6_

  - [x] 17.3 Re-measure and record an Overall_Match floor
    - Run `--verify --force` on clickgoto and tweendemo, record both Overall_Match values and the per-frame values in the commit message, and add a floor test for Overall_Match like `TRACE_SCORE_FLOOR` (a constant set to the measured value, never lowered). If the value is not about 100 percent, list what differs per frame (read the Diff_Images) and do not tune the tolerance.
    - _Requirements: 4.1, 13.5_

- [ ] 18. Shim: children advance first (design section 8, G5)
  - [~] 18.1 Advance order in `MovieClip._step` phase A
    - Phase A advances clips root-first (pre-order). The Reference_Trace shows children advance first: `output.txt` line 175 has `root1` still on frame 2 when `l_button`'s `removed` bubbles. Change the loop to post-order (children first). The user tried this and measured Trace_Score 100 with all tests passing.
    - Update design section 8 (G5): children advance first, and note that Ruffle walks siblings in reverse render order and that our samples do not exercise sibling order.
    - Raise `TRACE_SCORE_FLOOR` in `test/unit/clickgotoReplay.test.ts` to the measured value (never lower). Add a unit test for the frame label of a bubbled `removed` (the parent still reports its old frame while a child's `removed` bubbles).
    - _Requirements: 8.4, 8.8, 13.6_

- [ ] 19. Emit and report: build output and design alignment
  - [~] 19.1 Emitted project build includes `assets/`
    - `vite build` of an emitted project leaves `assets/` out of `dist`. Fix it in the emit template so the user's own `npm run build` works (for example by serving `assets/` as the Vite `publicDir` or moving the files), remove the `assets/` copy workaround in `src/verify/edge/buildProject.ts`, and add a test that builds an emitted fixture project and finds `assets/scene.json` in `dist`. Keep the dev server working.
    - _Requirements: 3.5, 12.5_

  - [~] 19.2 Align `html.ts` and design.md
    - `html.ts` must print `none` for an empty known-behaviour-gaps list (as design section 10 says) for compared and not-compared behaviour; add a test for it. Update design.md so `FidelityInputs` lists the `tools` field.
    - _Requirements: 10.1, 10.3, 9.2_

- [~] 20. Checkpoint: both samples after the fixes
  - Run `npm run pipeline -- samples/clickgoto/test.swf out/clickgoto --verify --force` and `npm run pipeline -- samples/tweendemo/test.swf out/tweendemo --verify --force`. Report both samples' Overall_Match and Trace_Score (or `not-compared`) and the paths of the two `fidelity-report.html`. Then stop and wait for the user.
  - _Requirements: 14.1, 14.2, 14.3, 14.4_
## Notes

- Tasks marked with `*` are optional. The three required tests are Tasks 2.5, 5.4 and 10.2; their implementation tasks are required.
- The Replay floor (Task 10.2) starts at the measured value, is raised in the same commit by any Shim task (including Task 12.7) that raises the score, and is recorded finally in Task 15.1.
- Stop-and-ask points are only: Task 7.2 (FFDec `-select` syntax, file names, frame size, if they differ from the design), Task 9.2 (headless WebGL, if it differs), Task 10.2 (click ticks, if they differ from the design), the checkpoint Task 16, and the stop conditions of `.kiro/steering/git-workflow.md`. Task 12.1 records user decisions and does not stop. A G7 revert (Task 12.7) is handled by its own revert rule and does not stop.
- Task 12.7 (Goto_Extra_Cycle) is required. Task 12.8 is its optional unit test.
- Browser checkpoint is Task 16, the only checkpoint, and the last task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1", "3.1", "4.1", "5.1", "6.1", "7.1", "8.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "3.4", "4.2", "4.3", "4.4", "5.2", "6.2", "7.2", "8.2", "9.1"] },
    { "id": 4, "tasks": ["2.5", "2.6", "5.3", "5.4", "6.3", "7.3", "9.2", "10.1"] },
    { "id": 5, "tasks": ["5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "9.3", "10.2"] },
    { "id": 6, "tasks": ["11.1"] },
    { "id": 7, "tasks": ["11.2", "11.3", "11.4"] },
    { "id": 8, "tasks": ["12.1"] },
    { "id": 9, "tasks": ["12.2"] },
    { "id": 10, "tasks": ["12.3"] },
    { "id": 11, "tasks": ["12.4"] },
    { "id": 12, "tasks": ["12.7"] },
    { "id": 13, "tasks": ["12.5", "12.6", "12.8", "13.1"] },
    { "id": 14, "tasks": ["13.2", "14.1"] },
    { "id": 15, "tasks": ["14.2"] },
    { "id": 16, "tasks": ["15.1", "15.2"] }
  ]
}
```
