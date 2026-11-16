# Implementation Plan: as3-coverage

## Overview

Language: TypeScript (strict), as in the design. The plan makes two real AS3 games play: `entity_game` (first milestone, MIT) and `spacer` (headline, GPL-3.0, fetched and never committed). It has 36 top-level tasks in four blocks, each ending in one Checkpoint (Requirement 34.1): Block A shared (Tasks 1 to 10, Checkpoint 1 is Task 11), Block B `entity_game` plays (Tasks 12 to 21, Checkpoint 2 is Task 22), Block C `spacer` plays (Tasks 23 to 31, Checkpoint 3 is Task 32), Block D looks right (Tasks 33 to 35, Checkpoint 4 is Task 36, conditional on budget, Requirement 32). Exactly four tasks are named "Checkpoint". Every other top-level task is one commit with its tests, and its sub-tasks share that commit.

Order, in one paragraph. Block A first admits the two samples (Tasks 1 and 2), then makes the translator output type-check and load (generated Shim names, nullable types, the import-cycle hazard rule with the load-error listener, which `spacer` needs before anything else, Tasks 3 to 5), then adds the Shim utilities, keyboard types and priority dispatch (Tasks 6 and 7), the keyboard path (Task 8), the Stage as a tree (Task 9) and the tick phases, broadcast order and hit test over Stage children (Task 10). Block B resolves inherited members before statics (Task 12), adds the translator rules (Task 13), `Dictionary` (Task 14), `Graphics` (Task 15), `TextField`, `filters` and `MouseEvent` additions (Task 16), the Handwritten_Set mechanism and its reports (Task 17), keyboard entries in the Replay with the Ruffle attempt (Task 18), the translated `Signal` (Task 19), the inspection hook and the `entity_game` Play_Test (Task 20) and the `entity_game` scores (Task 21). Block C adds `super(...)` field arguments (Task 23), scenes and `currentLabel` (Task 24), `Timer` (Task 25), `Rectangle`, `getBounds` and `pixelsOverlap` (Task 26), the `Proxy` rule (Task 27), the gated hand-written `spacer` files (Task 28), the `spacer` end-to-end run and floors (Task 29), the evidence for the "not verified" items (Task 30) and the `spacer` Play_Test (Task 31). Block D draws static text as shapes (Task 33), measures rotated `width` and `height` (Task 34) and records the Overall_Match change and floor (Task 35).

Start of Block A. Requirement 1 is already satisfied on `wip/as3-coverage` (commits `2cf644a` and `f1db0d0`), so no task changes the hygiene test, the slots file or `test/web/publicHost.e2e.test.ts`. Before Task 1 run `npm test -- --run` once and confirm it is green (Requirement 1.3); if it is not, stop and report. If `test/web/publicHost.e2e.test.ts` (rate-limit case) fails under load, rerun it alone and report the duration; do not change it or its timeout (Requirements 1.5, 1.6).

Decisions recorded, not asked again. The design decisions D1 to D20 and the findings F1 to F9 are decided. `Signal` is translated and the fallback of Task 19.3 runs only if the translator route fails its checks. The Handwritten_Set is `KeyObject` and `PhysicEngine` of `spacer`. The three owner decisions that are still pending are not made by any task: the licence of the hand-written `spacer` files (Open_Item O1, Requirement 28.13, gated in Task 28), the upstream URLs and commits of both games (O2, Requirement 28.12) and nothing else. Where a task needs one of them it says STOP.

Tests. Unit tests use Fixture_Classes and never name a sample (Requirements 2.5, 3.7, 9.6, 11.6, 19.6, 21.12, 29.9, 30.8, 37.11). The Correctness Properties of the design are fast-check properties. Following the `breadth` plan, every test in this plan is required: there is no optional test sub-task and no `*` marker. A task that adds a pure function adds that function's test in the same task and is not complete until the test passes. Property tests use `fast-check` with the shared config in `test/property/config.ts`, carry a comment `// Feature: as3-coverage, Property <n>: <title>`, and run at least 100 runs. Generators live in `test/property/gen/`. The design lists 27 properties; Requirement 37.10 adds one property over generated class graphs (named "Property 28" in the comments of Task 5.1, outside the design list). The Signal model property (Requirement 18.7) exists only if the fallback of Task 19.3 is used. Play_Tests and the `spacer` page-load check are e2e tests.

Rules that apply to every task:

- Follow `.kiro/steering/git-workflow.md` and Requirement 35. Work on the existing local branch `wip/as3-coverage`. Before the first commit run `git branch --show-current`; if it prints `main`, stop and ask, and do not create or switch branches. One top-level task is one commit; Checkpoint tasks commit only the Fidelity_Reviewer report and fixes for its findings. Never `git push`, merge, cherry-pick, amend, rebase, reset or force. Never use `git add -A`, `git add .` or `git commit -a`: stage by path only the files the task created or changed, plus `.kiro/specs/as3-coverage/tasks.md` and `tasks.meta.json`. Never commit `tools/`, `node_modules/`, `out/`, `.work/` or `dist/`, the `spacer` SWF, any converted `spacer` output, or any file under `handwritten/spacer/` before the owner decision of Task 28.
- Verification before each commit. V1: `npm run typecheck` and `npx vitest related --run <changed source files>` plus every test file the task added or edited; both must pass. V2: V1 plus `npm run typecheck:template`, and the score floor tests `test/unit/clickgotoReplay.test.ts` and `test/e2e/overallMatch.e2e.test.ts`, required for any task that changes a file under `template/` (`vitest related` cannot see the link). A change under `template/shim/` also commits the regenerated `src/translate/shimMembers.generated.ts` (Requirement 35.7; the hook regenerates it silently, so check `git status` and stage it). The full suite `npm test -- --run` runs only at Checkpoint tasks; a failure it finds is fixed in a new commit that names the task that caused it. Never commit a failing state. Each task names V1 or V2.
- Commit message: first line `Area: what changed, imperative`, at most 72 characters; then a blank line; then why, what, how it was verified, what is not verified, and the task number. Areas: `Unpack`, `Convert`, `Translate`, `Emit`, `Runtime`, `Shim`, `Pipeline`, `Test`, `Spec`, `Steering`, `Build`, `Repo`, `Samples`, `Web`, `MCP`, `Hooks`, `Docs`, `Verify`. A task whose commit changes `src/translate/` uses the area `Translate` and names the other stages it touches. No `Co-Authored-By`, no "Generated with", no emoji, no UTF-8 BOM (pass the message with `git commit -F -`). When an MCP tool, a hook or the Fidelity_Reviewer caught or changed something in the work of the commit, the body says so in one line (Requirement 35.5).
- Floors and scores (Requirements 27.4, 27.5, 31.7): never change the Verify_Tolerance, the Reference_Frames, `src/verify/core/pixelDiff.ts` or any file under `samples/*/reference/` that exists today. Score_Floors only go up and are set in the commit that raises the score. A task that changes the Translator, Shim, Runtime or Convert states, in its commit body, the Overall_Match and Trace_Score of `clickgoto` (Trace_Score 100 at 32 ticks, Overall_Match at its floor) and of every other committed sample before and after. If a floor would drop, fix or revert the change; never lower a floor.
- Flash behaviour (Requirements 36.5, 36.7). A task that adds a Flash behaviour to the Shim or Runtime says in its commit body whether it was read in the Ruffle_Source (pinned commit `4a8d39661ed8aec97afee1504a4e33080da2efd0`, local copy `.work/ruffle-src`) or measured, and adds the behaviour with its evidence to `.kiro/steering/flash-behaviour.md` in the same commit. A behaviour that is neither read nor measured is recorded as an Open_Item in the design's Open_Items table by Task 30; no task edits `requirements.md` or `design.md` before that, so earlier tasks note the Open_Item in the commit body and Task 30 collects them.
- Shim additions beyond `docs/brief.md` go in `template/shim/ADDED_APIS.md` with the Fixture_Class line that needs each (Requirement 4.5). A Named_Limit raised at run time goes through the one sink `namedLimit(id, detail)` (design "Data Models") and is listed in `ADDED_APIS.md` when it comes from a Shim addition.
- Naming (Requirement 28.8): sample folders, display names in reports and UI strings use `entity_game` and `spacer`. The words "Asteroids" and "Breakout" appear in no folder name, report display name or UI string. Class and package names inside converted code stay as they are.
- Stop and ask the user instead of continuing when: a Checkpoint is reached; tests or typecheck cannot pass within the task's scope; a finding contradicts `requirements.md`, `design.md` or `.kiro/steering/tech.md`; a task would need an FFDec XML name marked `UNVERIFIED` in `src/convert/ffdecXml.ts` to be trusted; a New_Dependency seems needed (name, exact version, licence, reason); an owner decision of the Open_Items O1 or O2 is needed; a block will exceed its credit share by more than one third (Requirement 36.4).
- Budget (Requirement 36.3): about 600 credits in total: spec documents 40, Block A 130, Block B 170, Block C 200, Block D 60. Each block starts with a note that restates its share. If a block will exceed its share by more than one third (A 173, B 227, C 267, D 80), stop and report before spending more. Each Checkpoint_Report carries the Credits_Line.
- Checkpoint procedure (Requirements 34.2 to 34.5, 36.1), used by Tasks 11, 22, 32 and 36: (1) run the full suite `npm test -- --run` and note the Warm_Suite_Time (about 150 seconds at most; never raise a timeout, make the slowest new test cheaper instead and record why); (2) hand the review to the `fidelity-reviewer` agent (sub-agent, or the user starts it with `--agent fidelity-reviewer`) and save its report as `.kiro/specs/as3-coverage/reviews/checkpoint-<n>.md`; (3) act on every finding in a new commit before the next task, and name the fixing commit in the report; (4) commit the review file by path with the area `Spec`; (5) STOP and report with: the real output of `git status`, the commits since the last stop (`git log --oneline` from the previous Checkpoint), Overall_Match and Trace_Score of every sample (a sample below 100 names its causes, Requirement 27.8), new Named_Limits, Open_Items, the Warm_Suite_Time and the Credits_Line ("Est. Credits Used"). Wait for the owner.
- Credits and evidence tools: use the `swf-inspector` MCP tools (`swf_summary`, `swf_find_tags`, `swf_class_source`, `fidelity_summary`) for SWF facts and output directories, and the `playwright` MCP for browser checks. The `swf-inspector` tools accept paths inside the repository only, so give them the SWFs at their paths under `.work/games/` (Requirement 28.9).
- Design reading: before coding a task, read the design section named in the task by its heading. The design is long; do not rely on its first part only. Read the section of `.kiro/steering/flash-behaviour.md` that covers the area before changing Flash behaviour.
- Core files (`src/verify/core/`, and the pure translator and runtime modules named in a task) import no `node:*` module, no `playwright`, no `pngjs`, and use no `Date`, `Math.random`, `localeCompare` or `toLocale*`. A task that adds such a file adds it to the purity test list that already exists in `test/unit/` and says so.
- Exact dependency versions only. No New_Dependency is expected.
- No LLM call. No network call by a test or a Pipeline stage. Commands are PowerShell compatible. Test runs use `npm test -- --run` or `npx vitest ... --run`, never watch mode. Never block on a dev server: `npm run dev` is run manually by the user.
- Do not edit `requirements.md`, `design.md` or `.kiro/steering/tech.md` from any task, except where a task names the steering update (Requirement 36.8: `tech.md` and `structure.md` are updated in the commit that adds a command, sample or directory; `flash-behaviour.md` as above). `tasks.meta.json` is written by the task runner; do not create or hand-edit it.

## Tasks

### Block A: shared (about 130 credits; stop and report above 173)

- [x] 1. Samples: admit `entity_game`
  - Commit area: `Samples`. Verification V1. Read Requirement 28 and the "Fetched sample" and "Decisions at a glance" sections of the design. Block A starts here: note the Credits_Line at the start (Requirement 34.4 gives the baseline) and restate the Block A share of about 130 credits.
  - [x] 1.1 Add the SWF, PROVENANCE.md and the MIT text
    - Copy `.work/games/entity/test.swf` to `samples/entity_game/test.swf` after checking its SHA-256 equals `688ffa8e030c567559e65ff515e845d88f6b3c0f5f6fc7360eb1bff2e5c9d0c0` (12607 bytes). Write `samples/entity_game/PROVENANCE.md` with author (Iain Lobb), licence MIT, the SHA-256, the date, the modifications (none), the embedded-fonts section (`no embedded fonts`, as the SWF holds no text tag) and the Licence_Directory pointer. The upstream URL and commit are not known: write them as `pending (owner decision O2)`. Add the MIT licence text under `samples/LICENSES/` (reuse `MIT-Ruffle.txt` only if the licence holder line is not Ruffle's; otherwise add `MIT-EntityAsteroids.txt` with the author's copyright line from the upstream licence, which the owner supplies; if that line is not available, STOP and ask).
    - Use the sample name `entity_game` everywhere; the folder, the report display name and any UI string contain no third-party trademark (Requirement 28.8).
    - _Requirements: 28.1, 28.2, 28.8, 28.11, 28.12_

  - [x] 1.2 Run the provenance and licence checks
    - The hook `shim-table-and-sample-checks` runs the checks on a write under `samples/`; also run `npx vitest --run test/unit/provenance.test.ts`. If `validateProvenance` rejects the word `pending`, extend `test/support/provenance.ts` and `test/unit/provenance.test.ts` so that an explicitly marked pending upstream field is accepted for `entity_game` and `spacer` only while the Open_Item O2 is open, with an example test for a missing field that stays rejected. Extend the committed-samples tests that list sample names (floors, residual causes) only in the tasks that measure them (Task 21).
    - Test: `test/unit/provenance.test.ts` passes for `entity_game`.
    - _Requirements: 28.10, 28.7_

- [x] 2. Samples and Build: `spacer` as a Fetched_Sample
  - Commit area: `Samples` (the script and test are `Build` and `Test`; the message names all). Verification V1. Read the design section "Fetched sample (spacer)". Model the work on `scripts/fetch-static-text.ts` and `src/samples/fetchedSample.ts`, which already take a source argument. Neither the `spacer` SWF nor its output is ever committed (Requirement 35.8).
  - [x] 2.1 Generalise the fetch core and add `scripts/fetch-spacer.ts`
    - Reuse `fetchStaticText(deps, source)` under the name `fetchSample` in `src/samples/fetchedSample.ts` (keep the old name exported if other code imports it, so the `static_text` sample is unchanged). Add `scripts/fetch-spacer.ts` and the npm script `fetch:spacer` (`tsx scripts/fetch-spacer.ts`). Target `.work/samples/spacer/test.swf`. Expected SHA-256 `368926f94eb4de93918df9d06655ea2a4dd0ff28a06df725e61751c92552a50a` (85334 bytes). A path argument (`npm run fetch:spacer -- .work/games/spacer/test.swf`) copies a local file after the hash check. A mismatch writes nothing and exits 1; a download failure exits 2; an unreadable local path exits 3. With no path argument and no download URL (Open_Item O2), the script exits 2 with a message that asks for the path. The `.part` file is renamed only after the check.
    - Tests: `test/unit/fetchedSample.test.ts` (extend): hash match writes once; mismatch writes nothing and returns the mismatch outcome; missing path exits with the distinct code; no argument exits 2 with the message. Add **Property 25: A wrong hash writes nothing** in `test/property/fetchSample.property.test.ts` (create): for any bytes with a different SHA-256 the function returns the mismatch outcome and writes no target file; bytes with the expected hash are written once.
    - _Requirements: 28.3, 28.4, 28.5, 28.12_

  - [x] 2.2 Add `samples/spacer/PROVENANCE.md` and the skip helper
    - `samples/spacer/PROVENANCE.md` states GPL-3.0, the author Zabuzard, the SHA-256, the reason the SWF is not committed, the licence text pointer (`samples/LICENSES/GPL-3.0.txt`, copied unmodified from the FSF text; if the owner has not supplied the licence text source, use the FSF `gpl-3.0.txt` and say so), and the upstream URL and commit as `pending (owner decision O2)`. Add `test/support/fetchedSpacer.ts` (create): `spacerSwfPath()` and `describeIfSpacer` that skip with a message naming `npm run fetch:spacer` when `.work/samples/spacer/test.swf` is absent. Extend the provenance validator for a Fetched_Sample entry (SWF not required to exist) as `static_text` already does.
    - Tests: `test/unit/provenance.test.ts` (example: `spacer` PROVENANCE passes without a SWF; a committed `samples/spacer/*.swf` fails), `test/unit/fetchedSpacer.test.ts` (create: the skip helper reports the skip).
    - _Requirements: 28.3, 28.6, 28.7, 28.11_

  - [x] 2.3 Update the steering status
    - In the same commit update `.kiro/steering/tech.md` (the `fetch:spacer` command) and `.kiro/steering/structure.md` (the two samples, the fetched `spacer`, the `handwritten/SET.json` file as planned) as Requirement 36.8 requires. No other steering text changes.
    - Test: `test/unit/repoHygiene.test.ts` still passes.
    - _Requirements: 36.8_

- [x] 3. Translate: generated Shim names and imports for type-position uses (D1)
  - Commit area: `Translate` (touches the generator script and the Shim index only through reading them). Verification V1. Read the design Block A table row D1 and `scripts/gen-shim-members.ts`. A Shim file edit is not part of this task, so no `shimMembers.generated.ts` commit is needed unless the generator output changes; if it does, commit the regenerated file with this task.
  - [x] 3.1 Generate `SHIM_AS3_NAMES` from the exports of `template/shim/index.ts`
    - Extend `scripts/gen-shim-members.ts` to write the name list into `src/translate/shimMembers.generated.ts` (or the file `shimNames.ts` reads) and make `src/translate/shimNames.ts` read it, so `Stage` and every exported Shim class are importable (Requirement 2.3). Run `npm run gen:shim-members` and stage the regenerated file.
    - Test: `test/unit/shimNames.test.ts` (extend): every export of `template/shim/index.ts` is in `SHIM_AS3_NAMES`; `Stage` is present.
    - _Requirements: 2.3_

  - [x] 3.2 Read type annotations in the import scan
    - In `src/translate/importPlan.ts` count a Shim class named only in a type annotation (variable, field, parameter, return type, `as`/`is` type) as used, and emit one import per name when it is used as a type and in an expression.
    - Test: `test/unit/importPlan.test.ts` (extend) with Fixture_Classes: `var s:Stage` only, `var s:Stage` plus `Stage` expression, a parameter type only, a return type only. Regenerate the goldens that change and record each regenerated golden and why in the commit body.
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 3.3 Write property test for type-position imports
    - **Property 1: Shim classes in type positions are imported once**
    - In `test/property/shimTypeImport.property.test.ts` (create), generator in `test/property/gen/genTypeUse.ts`: for any Fixture_Class that names a Shim class in a type position, an expression, or both, the emitted TypeScript has exactly one import of that name.
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

- [x] 4. Translate: nullable reference types with `strictNullChecks` off (D2)
  - Commit area: `Translate` (also touches `Emit` for the emitted `tsconfig.json`). Verification V1. Read the design D2 row and Requirement 3. Commit body records every regenerated golden and why (Requirement 3.6).
  - [x] 4.1 Emit `T | null` for every reference type
    - In `src/translate/types.ts` and `emitTs.ts` emit `T | null` for classes, interfaces, `Object`, `Array`, `Function` and `String` in variable, field, parameter and return positions; never for `int`, `uint`, `Number` or `Boolean`. The annotation text stays `T | null` whatever the compiler flag (Requirement 3.9).
    - Test: `test/unit/emitTs.test.ts` (extend) with Fixture_Classes covering the four positions and the primitives.
    - _Requirements: 3.1, 3.2, 3.9, 3.7_

  - [x] 4.2 Set `strictNullChecks` to false in the emitted tsconfig and the gate
    - In the emitted `tsconfig.json` (template) and in `src/translate/typeCheckGate.ts` options set `strictNullChecks: false` and keep every other `strict` flag on. Check `npm run typecheck:template`.
    - Test: `test/unit/typeCheckGate.test.ts` (extend): a Fixture_Class that assigns `null` to a class-typed variable and dereferences a class-typed field gives no error; a primitive assigned `null` is not widened by the emitter. `test/unit/emit.test.ts` (extend): the emitted tsconfig holds `strictNullChecks: false` and `strict: true`.
    - _Requirements: 3.3, 3.8_

  - [x] 4.3 Regenerate goldens and check the registry
    - Regenerate the goldens that change (only where a reference type gains `| null`). Run the pipeline on `clickgoto`, `tweendemo`, `radial`, `gradients`, `acid-color-2`, `mask_reapply`, `click_block`, `3_joystick`, `slider_component` and `entity_game` and confirm no class that was omitted only for a null assignment error stays omitted (`translation-report.json`), and that no Overall_Match or Trace_Score changed.
    - Test: `test/unit/translateGolden.test.ts` (extend) passes; a registry test in `test/unit/classOmissions.test.ts` (extend) keeps a class with only a null-assignment error.
    - _Requirements: 3.4, 3.6_

  - [x] 4.4 Write property test for null admission
    - **Property 2: Null admission follows the type kind**
    - In `test/property/nullableTypes.property.test.ts` (create): over generated AS3 types from the primitive set and the reference set, the emitted type text admits `null` if and only if the AS3 type is a reference type.
    - **Validates: Requirements 3.1, 3.2, 3.5**

- [x] 5. Translate, Emit and Runtime: import-cycle hazard rule and load-error listener (D13)
  - Commit area: `Translate` (names Emit and Runtime; the `index.html` change is under `template/`, so verification V2). Read the design section "Module-cycle hazards (new work item D13)" and findings F1 to F3. `spacer` fails at page load (`Class extends value undefined`) and never reaches a frame, so this task comes before every Block C task. The rule is general: no test of 5.1 to 5.3 names a sample.
  - [x] 5.1 Add `src/translate/initHazards.ts` (pure)
    - Input: the value-import graph of the emitted classes, the `extends` edges, and for each import whether any use is in an `extends` clause, a static initialiser or top-level code. A hazard is a class `C` with translated base `S` such that `S` reaches `C` through value imports. The cut is the lexicographically first import of `S` on a shortest path from `S` to `C` whose uses are all inside method bodies or instance field initialisers. If no import can be cut the result carries an `import-cycle` problem with the path. Add the file to the purity test list.
    - Tests: `test/unit/initHazards.test.ts` (create): a two-class cycle, a three-class cycle, a cycle with no cuttable import (problem named, class stays), type-only imports ignored, lexicographic tie-break.
    - Add **Property 28 (Requirement 37.10): Cuttable cycles load in any order** in `test/property/initHazards.property.test.ts` (create): for generated class graphs with at least one hazard with a cuttable import, after the rewrite the modules load in an order-independent bundle check without an import-time error (build a tiny evaluator over the emitted import graph in the test; no browser).
    - _Requirements: 37.2, 37.5, 37.6, 37.10, 37.11_

  - [x] 5.2 Rewrite the cut and fill the all-class registry
    - Rewrite each use of the cut import to `getDefinitionByName('<Qualified.Name>')` and remove the import (Requirement 37.3, 37.9; a field initialiser such as `private var levelScene:* = LevelScene;` is the standard case). Add `getDefinitionByName` to the Shim (`template/shim/utils.ts`) reading a registry that `classes.ts` fills with every emitted class (not only linked ones) before the Player is constructed. Record each rewritten site in the Translation_Report. Do not reorder imports and do not route every cross-class reference through the registry (Requirement 37.6). List the new Shim function in `ADDED_APIS.md`; regenerate and stage `shimMembers.generated.ts`.
    - Tests: `test/unit/importCutRewrite.test.ts` (create) with Fixture_Classes: the emitted file has no import of the cut class and holds `getDefinitionByName`; `test/unit/classesRegistry.test.ts` (extend): `classes.ts` registers non-linked classes; `test/unit/translationReport.test.ts` (extend): the rewritten sites and an `import-cycle` problem are reported.
    - _Requirements: 37.1, 37.3, 37.4, 37.5, 37.9_

  - [x] 5.3 Install the load-error listener in `index.html` and report it in Verify
    - The emitted `index.html` gets a first inline script (before the module script) with an `error` and an `unhandledrejection` listener that sets `window.__swfResurrect = { ready: false, error }` (the Load_Error_Report). In `src/verify/edge/renderFrames.ts` (and the Play_Test driver later) report that error as the reason of the failure instead of a render timeout. A successful `main.ts` still sets `ready` true.
    - Tests: `test/unit/emit.test.ts` (extend): the script is first and holds both listeners; `test/e2e/loadError.e2e.test.ts` (create, uses a `chromium` slot): a generated project with a deliberate import-time throw reports the error text and does not time out; a normal project is unchanged.
    - _Requirements: 37.7, 37.8_

  - [x] 5.4 Measure the `spacer` page load
    - Skip with the fetch message when the `spacer` SWF is absent (Requirement 28.7). Otherwise run `npm run pipeline -- .work/samples/spacer/test.swf .work/as3-spacer/out --force` and load the built page in headless Chromium (use the `playwright` MCP or `test/support`). Record in the commit body whether `Class extends value undefined` is gone and the new first error if any. This is the one test of this block that names `spacer` (Requirement 37.11); the check is `test/e2e/spacerLoad.e2e.test.ts` (create), it asserts `window.__swfResurrect.ready === true` or, when it is false, that `error` is a string, and is skipped when the SWF is absent. If the page still fails for a cause outside Block A, record the cause for Block C and keep the test asserting only that the failure is reported with its reason.
    - _Requirements: 37.1, 37.11, 27.7_

- [x] 6. Shim: error classes, `getQualifiedClassName` and `getTimer`
  - Commit area: `Shim` (Runtime for the clock read). Verification V2. Read Requirement 12 and the design Data Models. These are needed by Task 9 (`ArgumentError`) and by Task 19 (`Signal`).
  - [x] 6.1 Add error classes and `getQualifiedClassName`
    - Export `ArgumentError` and `IllegalOperationError` as subclasses of `Error` whose `name` equals the class name, and `getQualifiedClassName(value)` returning the registered class name of an instance and of a class object from the registry, never `constructor.name`; an unregistered class returns the JavaScript function name. Add the three names to `ADDED_APIS.md`; regenerate and stage the member table.
    - Tests: `test/unit/errorsShim.test.ts` (create). **Property 12: Qualified class names come from the registry**, in `test/property/qualifiedName.property.test.ts` (create): for any registered class name, an instance and the class return the registered name; an unregistered class returns the function name.
    - **Validates: Requirements 12.1, 12.2, 12.3**

  - [x] 6.2 Add `getTimer()` on the Player clock
    - Export `getTimer()` returning `floor(clock.now() - startTime)` with the start time read when the Player is constructed; never `Date.now()`. Read from the Player clock through a shim-internal accessor so the Shim does not import the runtime.
    - Tests: `test/unit/getTimer.test.ts` (create): a manual clock advanced by 1000 ms grows `getTimer()` by 1000. **Property 13: getTimer sums the clock**, in `test/property/getTimer.property.test.ts` (create): for any sequence of advances `getTimer()` is non-decreasing and equals the truncated sum.
    - **Validates: Requirements 12.4, 12.5, 12.6**

- [x] 7. Shim: `KeyboardEvent`, `Keyboard` and five-argument `addEventListener` (D3, D5)
  - Commit area: `Shim`. Verification V2. Read Requirements 4 and 6, the design rows D3 and D5, and `.kiro/steering/flash-behaviour.md`. The equal-priority order was read in Ruffle `core/src/avm2/events.rs` (design D5); say so in the commit body and add it to `flash-behaviour.md`.
  - [x] 7.1 Add `KeyboardEvent` and `Keyboard`
    - `KeyboardEvent` extends the Shim `Event` with `KEY_DOWN` `"keyDown"`, `KEY_UP` `"keyUp"` and a numeric `keyCode`. `Keyboard` exports `UP` 38, `DOWN` 40, `LEFT` 37, `RIGHT` 39, `ENTER` 13, `ESCAPE` 27, `SPACE` 32; the design records that the values come from the `flash.ui.Keyboard` documentation (Requirement 4.6). The Translator resolves `KeyboardEvent` to the Shim class and never the DOM global (the Shim import shadows it). Regenerate and stage the member table; list both in `ADDED_APIS.md` with the line that needs them.
    - Tests: `test/unit/keyboardShim.test.ts` (create): constants; `test/unit/shimNames.test.ts` (extend) and a translation example with a Fixture_Class using `KeyboardEvent.KEY_DOWN` that imports the Shim class.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 7.2 Extend `addEventListener` and `removeEventListener`
    - `addEventListener(type, listener, useCapture=false, priority=0, useWeakReference=false)`; `removeEventListener(type, listener, useCapture=false)`. Dispatch order: descending `priority`, insertion order within one priority; a listener already present at any priority is ignored (Ruffle `events.rs`). `useCapture` and `useWeakReference` are ignored and recorded as Named_Limits in `ADDED_APIS.md` and through the sink.
    - Test: `test/unit/eventPriority.test.ts` (create). **Property 5: Listener order follows priority**, in `test/property/listenerPriority.property.test.ts` (create): for any sequence of calls with random priorities and duplicates, distinct listeners are called in descending priority and insertion order within a priority, and a listener added twice is called once.
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**

  - [x] 7.3 Check the table and the floors
    - Confirm `src/translate/shimMembers.generated.ts` is regenerated and staged, and the existing samples' Overall_Match and Trace_Score are unchanged (V2 floor tests).
    - _Requirements: 4.4, 35.7_

- [x] 8. Runtime: key mapping, key dispatch and browser wiring (D4)
  - Commit area: `Runtime` (the iframe focus line is `Web`). Verification V2. Read the design section "Keyboard path" and Requirement 5. Tests that run the Player use the FakeBackend and a manual clock (Requirement 5.9).
  - [x] 8.1 Add `template/runtime/keyMap.ts` (pure)
    - `flashKeyCode({ code, keyCode }): number | null` reads `event.code` first (`KeyA`..`KeyZ` to 65..90, `Digit0`..`Digit9` to 48..57, arrows 37 to 40, `Enter` 13, `Escape` 27, `Space` 32), then `keyCode` when `code` is unknown, else null. `preventsDefault(code)` is true for 37 to 40 and 32. Add it to the purity list.
    - Tests: `test/unit/keyMap.test.ts` (create): one example per code of 13, 27, 32, 37, 38, 39, 40, 65, 67, 68, 83, 87, 88, 90 (Requirement 5.8). **Property 3: Key mapping is total and consistent**, in `test/property/keyMap.property.test.ts` (create): never throws, returns a number or null, each of the 14 required codes is reachable from some `code`, `preventsDefault` true exactly for 37 to 40 and 32.
    - **Validates: Requirements 5.5, 5.8**

  - [x] 8.2 Add `Player.dispatchKey(type, code)`
    - Dispatches a `KeyboardEvent` (bubbling) at `Stage.focus` when it is a display object on the stage, otherwise at the Stage_Object; each browser repeat is a further `KEY_DOWN`; calls `syncAll()` afterwards like the pointer methods. This is the one dispatch function the browser listener, the Replay runner and the Play_Tests use (Requirement 24.2). `Stage.focus` exists as a settable member in Task 9.2; add the minimal `focus` field here if Task 9 has not run (it has not, so add the field and let Task 9.2 own the rest).
    - Test: `test/unit/playerKeys.test.ts` (create). **Property 4: Key events reach the right target**, in `test/property/playerKeys.property.test.ts` (create): for any key code, focus state (null, on stage, off stage) and repeat count, each dispatch delivers one event of the requested type to the focus object when on stage and to the Stage otherwise, and the Stage listener sees it by bubbling.
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.6, 5.9**

  - [x] 8.3 Wire the browser and the iframe
    - In `template/src/main.ts` register `keydown` and `keyup` on `window`, map with `flashKeyCode`, call `preventDefault` when `preventsDefault` holds, call `window.focus()` on `pointerdown`. In `web/client/src/result.ts` call `iframe.focus()` on `load` and when the user clicks the frame (the project runs in `sandbox="allow-scripts"`).
    - Tests: `test/unit/emit.test.ts` (extend): the emitted `main.ts` holds the listeners; a unit test of the web result module (`test/web/` jsdom or the existing pattern) checks the focus call. Check the iframe focus once by hand with the `playwright` MCP and report the result (Requirement 5.7); it is a report, not a code change, unless it fails.
    - _Requirements: 5.1, 5.2, 5.5, 5.7_

  - [x] 8.4 Measure browser key codes against Flash
    - `test/e2e/keyCodes.e2e.test.ts` (create, uses a `chromium` slot): press each of the 14 required keys with Playwright in headless Chromium and check that `keyCode` and `flashKeyCode` equal the table values (Requirement 5.10). Record that this proves a US layout only (Open_Item O7).
    - _Requirements: 5.10_

- [x] 9. Shim and Runtime: the Stage as a tree and its members (D6)
  - Commit area: `Shim` (Runtime named). Verification V2. Read the design section "Stage as a real tree" (all of it) and Requirements 7 and 8. The Stage stays a non-DisplayObject that delegates to shared container functions in `Sprite.ts`; it does not extend `DisplayObjectContainer`.
  - [x] 9.1 Add container behaviour to `Stage`
    - `stage._children[0]` is the root. `addChild`, `removeChild`, `getChildAt`, `getChildByName`, `numChildren` share the container code. `removeChild` of a non-child throws `ArgumentError` and leaves the list unchanged. `announceAdded` and `announceRemoved` treat a parent chain that ends at the Stage as on stage (`_onStage()` is true when the chain reaches a Stage), and dispatch `ADDED`, `ADDED_TO_STAGE`, `REMOVED`, `REMOVED_FROM_STAGE`. A linked-class symbol instantiated by script and added to the Stage binds its named children before its constructor body (reuse `installScriptConstruction`).
    - Tests: `test/unit/stageTree.test.ts` (create). **Property 6: Stage children obey container laws**, in `test/property/stageTree.property.test.ts` (create): for any sequence of `addChild`, `removeChild` and `getChildAt`, the root stays at index 0, a removal of a non-child throws `ArgumentError` and leaves the list unchanged, and the FakeBackend node order equals the child order.
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.7**

  - [x] 9.2 Add Stage members
    - `mouseX`/`mouseY` from the last pointer position (`getPointerPosition()`), `frameRate` from `Scene_JSON.stage.frameRate`, settable `scaleMode` (stored, no effect, a Named_Limit in `ADDED_APIS.md` and through the sink), `StageScaleMode` (`NO_SCALE`, `SHOW_ALL`, `EXACT_FIT`, `NO_BORDER`), settable `focus` defaulting to null and accepting any object including the Stage itself. Regenerate and stage the member table.
    - Tests: `test/unit/stageMembers.test.ts` (create): defaults, `focus = stage` does not throw, `scaleMode` stored. **Property 9: frameRate comes from the scene**, in `test/property/stageFrameRate.property.test.ts` (create): for any positive frame rate in a generated Scene_JSON `Stage.frameRate` equals it; an example row each for 30 and 60.
    - **Validates: Requirements 8.1 to 8.7**

  - [x] 9.3 Add `stageNode`, `syncAll` and `reconcile` over the Stage
    - `Player.stageNode` is a backend container holding the root node and the Stage children; `rootNode` stays for `timelineOnly` and tests. `syncAll` walks from the Stage; `reconcile` takes a `ParentNode`; `main.ts` adds `stageNode` to the Pixi stage. A Stage child is drawn above the root in index order.
    - Tests: `test/unit/stageNodes.test.ts` (create) on the FakeBackend: a child added to the Stage appears above the root and disappears on removal; existing sample floors unchanged (V2).
    - _Requirements: 7.4_

- [x] 10. Runtime: tick phases, broadcast order and hit test over Stage children (D6)
  - Commit area: `Runtime`. Verification V2 (this is the task that can move an existing floor). Read the design "Player tick" diagram, the Stage tree section (Tops, Phases, Broadcast, Guard, Hit test) and the findings F4, Open_Items O3 and O11. Registration order was read in the Ruffle_Source (`core/src/avm2.rs` `register_broadcast_listener`, `broadcast_event`; `core/src/frame_lifecycle.rs`; `core/src/display_object/stage.rs`); say so in the commit body and add the rule to `flash-behaviour.md`.
  - [x] 10.1 Add `runtime/broadcast.ts` and generalise the step to tops
    - `tops = [root, ...stage._children.slice(1)]` snapshotted per frame step. `Sprite._step` becomes `stepTops(tops)` in `shim/internal.ts` (`_step()` stays as `stepTops([this])`). Phases: A advance (post-order per top), B broadcast `enterFrame`, C flush adds and broadcast `frameConstructed`, D frame scripts (root top first), E broadcast `exitFrame`; timers run after the frame loop. `EventDispatcher.addEventListener` registers an object in an ordered list for those three types on first registration; delivery walks the list, skips objects with no listener and prunes them; only `DisplayObject` instances and the Stage take part. `ENTER_FRAME` is dispatched to the Stage once per tick.
    - Tests: `test/unit/broadcast.test.ts` (create). **Property 7: Broadcast events follow registration order**, in `test/property/broadcastOrder.property.test.ts` (create): for any generated tree under the root and the Stage with listeners registered in a random order, each of the three events is delivered once per frame step to each registered listener, in the order of first registration.
    - **Validates: Requirements 7.5, 7.8, 7.9**

  - [x] 10.2 Hit-test Stage children
    - One hit view per top; tops are tried from the highest index down, root last. `resolveHitTarget` takes a `rootClip` argument so that only the root clip is never a target; a Stage child can be a target. Follow the rule in `.kiro/steering/flash-behaviour.md`.
    - Tests: `test/unit/hitTestStage.test.ts` (create). **Property 8: Hit target over Stage children**, in `test/property/hitTargetStage.property.test.ts` (create): for any set of hits across the root subtree and Stage children, the target is the topmost interactive object, a Stage child can be the target, the root clip never is, and the Stage is the target when nothing else qualifies.
    - **Validates: Requirements 7.6**

  - [x] 10.3 Guard the existing floors
    - Run `test/unit/clickgotoReplay.test.ts`, `test/e2e/overallMatch.e2e.test.ts` and the Trace_Score tests. State the Overall_Match and Trace_Score of every existing sample before and after in the commit body (Requirement 7.11). If registration order lowers any of them, keep post-order for objects under the root and apply registration order among the Stage and Stage children only (Requirement 7.10), and name the fallback in the commit body and at Checkpoint 1. Never lower a floor.
    - _Requirements: 7.10, 7.11_

- [x] 11. Checkpoint 1: Block A done
  - STOP. Follow the Checkpoint procedure of the rules. Block A shares: Requirements 2 to 8, 12 (errors and `getTimer`), 28 (both sample admissions), 37 and the Stage tasks.
  - Run the full suite `npm test -- --run`. Hand the review to the `fidelity-reviewer` agent and commit its report as `.kiro/specs/as3-coverage/reviews/checkpoint-1.md`. Act on its findings in a new commit before reporting.
  - The report also states: the Overall_Match and Trace_Score of every committed sample before and after Block A (existing samples must be unchanged, Requirement 7.11), whether the registration-order fallback of Task 10.3 was needed, the result of the `spacer` page-load check of Task 5.4 (or its skip), the Chromium key-code measurement of Task 8.4 and the iframe focus check of Task 8.3, the Open_Items touched (O3, O4, O7, O10 with the `publicHost` duration if it failed), and the Credits_Line against the Block A share of about 130.
  - _Requirements: 34.1 to 34.5, 36.1, 1.3, 1.5, 1.6_

### Block B: `entity_game` plays (about 170 credits; stop and report above 227)

- [x] 12. Translate: inherited instance members resolve before a same-named static (D7)
  - Commit area: `Translate`. Verification V1. Block B starts here: restate the Block B share of about 170 credits. Read the design row D7, Requirement 9 and the breadth spec's resolution order (`memberTables.ts`). The scope order (instance `this` scope before the class static scope) was read in the Ruffle_Source `core/src/avm2/scope.rs` (`ScopeChain::find`); that `this` sits above the class scope is AVM2 convention, not read: Open_Item O4, confirmed in practice by the `entity_game` Play_Test.
  - [x] 12.1 Change the member lookup order in `memberTables.ts`
    - In an instance context the lookup is two passes: every instance member along the chain (translated classes, then the Shim chain), then the statics. A bare identifier in a static method resolves to a static as today. Every earlier outcome of the breadth order that this does not cover stays (Requirement 9.3). No class or sample name appears in `src/`.
    - Tests: `test/unit/memberTables.test.ts` (extend) with Fixture_Classes: inherited `stage` plus own static `stage` in an instance method resolves to `this.stage`; the same name in a static method resolves to the static; an own instance member still wins over an inherited one.
    - _Requirements: 9.1, 9.2, 9.3, 9.6_

  - [x] 12.2 Write property test for the lookup order
    - **Property 10: Inherited instance members win over statics**
    - In `test/property/memberOrder.property.test.ts` (create): for any class names, member names and `extends` depth with a static and an inherited instance member of the same name, `S.name = name` in an instance method emits `S.name = this.name`; in a static method it resolves to the static.
    - **Validates: Requirements 9.1, 9.2, 9.5**

  - [x] 12.3 Record the evidence
    - Add the scope-order rule with its evidence (the Ruffle file and the Open_Item for `this`) to `.kiro/steering/flash-behaviour.md`. State the existing samples' scores before and after.
    - _Requirements: 9.4, 36.5, 36.7_

- [x] 13. Translate: `Vector.<T>(x)`, `is Array`, `is Class`, `delete` and reported constructs (D8)
  - Commit area: `Translate`. Verification V1. Read the design rows D8 and D9 and Requirements 10 and 11.
  - [x] 13.1 Translate the constructs
    - `Vector.<T>(x)` becomes `Array.from(x)`; for `int` and `uint` each element goes through the existing int and uint coercion. `is Array` becomes `Array.isArray(x)`; `x is Class` becomes `typeof x === "function"`; `delete obj[key]` on an object becomes a JavaScript `delete`. A statement containing `Vector.<T>(x)` is never commented out.
    - Tests: `test/unit/rewrite.test.ts` (extend) with Fixture_Classes for each construct, including `int`/`uint` and a non-integer `T`.
    - _Requirements: 10.1, 10.2, 10.3, 11.3, 11.6_

  - [x] 13.2 Write property test for the vector copy
    - **Property 11: Vector conversion copies**
    - In `test/property/vectorCopy.property.test.ts` (create): for any array `x`, the emitted copy for a non-integer `T` has the same length and elements and is a different object; for `int` and `uint` every element is coerced.
    - **Validates: Requirements 10.1, 10.2, 10.4**

  - [x] 13.3 Name every commented-out construct in the Translation_Report
    - When the Translator comments out a statement or declaration, the Translation_Report names the construct, the class and the line; `delete` (not translatable case), `is Array`, a `Dictionary` index, `Class` as a type, `flash_proxy` and a `this` read before `super` are named by that word. A construct that cannot be translated keeps its class in the Unsupported_Feature_List as today.
    - Tests: `test/unit/translationReport.test.ts` (extend) with Fixture_Classes per construct word.
    - _Requirements: 11.1, 11.2, 11.5, 11.6_

- [x] 14. Shim and Translate: `Dictionary` with identity keys (D10)
  - Commit area: `Shim` (Translate named). Verification V2. Read the design row D10 and Requirement 13. A JS `Proxy` cannot work (`d[fn]` stringifies `fn` before any trap), so the translator rewrites typed receivers.
  - [x] 14.1 Add the Shim `Dictionary`
    - A class over `Map`: identity for objects and functions, value for strings and numbers; the `weakKeys` constructor argument is ignored and recorded as a Named_Limit in `ADDED_APIS.md`. Regenerate and stage the member table.
    - Tests: `test/unit/dictionary.test.ts` (create): two different function keys are two entries; string and number keys by value.
    - _Requirements: 13.1, 13.3, 13.4_

  - [x] 14.2 Rewrite index syntax on a typed receiver
    - When the receiver's declared type is `Dictionary` (a field from the member table, a parameter or a local), `d[k]`, `d[k] = v`, `k in d` and `delete d[k]` become `get`, `set`, `has` and `delete` calls. When the type cannot be decided the index syntax is left and the site is named in the Translation_Report.
    - Tests: `test/unit/dictionaryRewrite.test.ts` (create) with Fixture_Classes for field, parameter, local and the undecidable case.
    - _Requirements: 11.4, 13.2, 13.6_

  - [x] 14.3 Write property test for the identity model
    - **Property 14: Dictionary agrees with an identity model**
    - In `test/property/dictionaryModel.property.test.ts` (create), model-based: over sequences of set, get, has and delete with keys from functions, objects, strings and numbers, `Dictionary` agrees with a list of pairs compared by `Object.is`.
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.5, 13.6**

- [x] 15. Shim and Runtime: `Graphics` on `Sprite` and `Shape` (D11)
  - Commit area: `Shim` (Runtime named). Verification V2. Read the design section "Graphics" and Requirement 14.
  - [x] 15.1 Record primitives in the Shim `Graphics`
    - `Sprite.graphics` and `Shape.graphics` return one `Graphics` that records `lineStyle(thickness, color)`, `beginFill(color)`, `endFill()`, `drawCircle`, `moveTo`, `lineTo`, `clear()` and expands `drawPath(commands, data, winding)` into `moveTo`/`lineTo` at record time (command 1 and 2, two values each). An unknown command skips its data and calls `namedLimit('drawPath-command')` once per project; extra `lineStyle` arguments are ignored with `namedLimit('lineStyle-args')`. Export `GraphicsPathWinding`. A `version` counter increments on each call. Regenerate and stage the member table; list additions and limits in `ADDED_APIS.md`.
    - Tests: `test/unit/graphicsShim.test.ts` (create): each call records; `drawPath` expansion and the unknown command; `clear()` discards.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.9, 14.12_

  - [x] 15.2 Add `runtime/graphicsPlan.ts` and the backend hooks
    - Pure plan from the primitive list to `GfxDraw` operations (`circle`, `polyline`, fill, stroke), applying a pending fill at the end of the list (Requirement 14.6) and keeping a stroke-only `drawPath` open (14.5). `RenderBackend.setGraphics(node, ops | null)`: the FakeBackend stores the ops; the Pixi backend keeps a lazily created `Graphics` at index 0 of the container node and offsets child indices by one, so graphics draw below children, and strokes live in local space so they scale with the object. `NodeRegistry` compares `version` per node each `syncAll` and pushes only changed graphics. Add `graphicsPlan.ts` to the purity list.
    - Tests: `test/unit/graphicsPlan.test.ts` (create); `test/unit/pixiBackend.test.ts` or the existing backend e2e (extend): one Chromium check that graphics draw below a child and that a scaled sprite scales its line thickness.
    - _Requirements: 14.5, 14.6, 14.7, 14.8, 14.10, 14.13_

  - [x] 15.3 Write property test for the plan replay
    - **Property 15: Graphics plan replays what was issued**
    - In `test/property/graphicsPlan.property.test.ts` (create): for any sequence of `lineStyle`, `beginFill`, `endFill`, `drawCircle`, `moveTo`, `lineTo`, `drawPath` and `clear`, the draw operations on the FakeBackend equal the plan computed from the issued calls, `drawPath` consumes two values per command and unknown commands are skipped.
    - **Validates: Requirements 14.1, 14.3, 14.9, 14.11**

- [ ] 16. Shim and Runtime: `InteractiveObject`, `TextField`, `filters` and `MouseEvent` additions (D11)
  - Commit area: `Shim` (Runtime named). Verification V2. Read the design section "TextField and filters" and Requirements 15, 16 and 17.
  - [~] 16.1 Add `InteractiveObject` and the minimal `TextField`
    - `InteractiveObject` sits between `DisplayObject` and `DisplayObjectContainer` and takes `mouseEnabled`. `TextField extends InteractiveObject` with `text`, `textColor`, `selectable`, `width`, `height`, `textWidth`; defaults `text` empty, `textColor` 0x000000, `width` 100, `height` 100, `selectable` true. The `width` setter sets the box and never `scaleX`. `textWidth` is computed in the `text` setter with an injected measure function `(text, font) => number`, so it is valid at once. A TextField is a hit target (an interactive leaf) and a pointer event on it bubbles. The Translation_Report names `htmlText`, `autoSize`, `defaultTextFormat` and `multiline` as not provided. Regenerate and stage the member table.
    - Tests: `test/unit/textField.test.ts` (create) with a fixed-width measure. **Property 16: textWidth grows with the text**, in `test/property/textWidth.property.test.ts` (create): for any two strings where one is a prefix of the other, `textWidth` of the longer is at least that of the shorter under the fixed-width function.
    - **Validates: Requirements 15.1 to 15.4, 15.7 to 15.10**

  - [~] 16.2 Draw the text in the runtime
    - `RenderBackend.setText(node, { text, color, width, height } | null)`; Pixi uses a `Text` child, one line, no wrap, `12px "Times New Roman"`, in `textColor`; the page measure uses canvas `measureText`. Record the Named_Limit `device-font-metrics` (device-font metrics differ and `textWidth` is measured in the browser).
    - Tests: `test/unit/textBackend.test.ts` (create) on the FakeBackend; one Chromium check that a created TextField shows in a screenshot (use an existing e2e file pattern).
    - _Requirements: 15.5, 15.6_

  - [~] 16.3 Add `filters` and `GlowFilter`
    - `DisplayObject.filters` copies on set and on get. `GlowFilter(color, alpha, blurX, blurY, strength)` stores its five values with same-named properties. Setting a non-empty list calls `namedLimit('filter-not-drawn:GlowFilter')` unless the Runtime draws that class. Regenerate and stage the member table.
    - Tests: `test/unit/filters.test.ts` (create). **Property 17: filters are copied**, in `test/property/filtersCopy.property.test.ts` (create): for any array assigned to `filters` the getter returns an equal array that is not the same object, and changing the returned array does not change the stored list.
    - **Validates: Requirements 16.1 to 16.5**

  - [~] 16.4 Add `MouseEvent.MOUSE_WHEEL` and `delta`
    - `MOUSE_WHEEL` is `"mouseWheel"`, `delta` defaults to 0. If the Player does not dispatch the wheel event, record `wheel-not-dispatched` as a Named_Limit; if it does, set `delta` from the browser wheel direction and record which measurement fixed the sign.
    - Tests: `test/unit/mouseEventShim.test.ts` (extend).
    - _Requirements: 17.1, 17.2, 17.3_

- [ ] 17. Pipeline and Verify: the Handwritten_Set and its report entries (Requirement 33)
  - Commit area: `Pipeline` (Verify and Test named). Verification V1. Read the design section "Hand-written classes in the reports" and the breadth handwritten rule in `structure.md`. The committed `handwritten/SET.json` starts empty (`[]`) here: the `spacer` entries are added by Task 28 only together with their files, so that the "every listed entry has a file" test holds on a clean checkout (Requirement 28.13).
  - [~] 17.1 Add `handwritten/SET.json` and its reader
    - A list of `{ sample, className, reason }` read by generic code; no class or sample name appears in `src/`. A `.ts` override is looked up by the sample (parent folder of the SWF) and the class name (a packaged override path `a/b/Cls.ts` is class `a.b.Cls`).
    - Tests: `test/unit/handwrittenSet.test.ts` (create): a schema check, the packaged-path rule, and a consistency test: every `.ts` file under `handwritten/` is listed and every listed entry has a file (passes on the empty set).
    - _Requirements: 33.8, 33.9_

  - [~] 17.2 Report hand-written classes
    - After the overrides load, an override in the set is listed in the Translation_Report with its reason and the translated class of the same name is marked replaced; an override not in the set gives the problem `handwritten-not-in-set`, a CLI warning, and a failing test on the committed samples. The Fidelity_Report gets `handwritten: [{ className, reason }]` next to `behaviour`, and the HTML shows it. No licence is claimed for hand-written `spacer` files (Requirement 33.10). The existing rule (an override of a class that is not linked and not in the emit closure is ignored with a warning) stays unchanged.
    - Also fix the CLI list of overrides (`handwrittenClasses` in `src/pipeline/cli.ts`) to recognise packaged overrides so they are not reported as missing; this is needed only if Task 19.3 runs, but is cheap and covered by a test here (Requirement 18.6).
    - Tests: `test/unit/report.test.ts` and `test/unit/pipelineCli.test.ts` (extend): listed with reason, replaced class marked, `handwritten-not-in-set` for an unlisted override, a packaged override not reported as missing.
    - _Requirements: 33.3, 33.4, 33.5, 33.6, 18.6_

  - [~] 17.3 Write property test and the committed-sample test
    - **Property 27: Overrides outside the set are reported**
    - In `test/property/handwrittenReport.property.test.ts` (create): for any generated set of overrides and any generated `SET.json`, the pipeline warns for exactly the overrides that are not listed and lists the others with their reason. Add `test/e2e/handwrittenSamples.test.ts` (create): over the committed samples' shared runs, every Hand_Written_Class in a Fidelity_Report is a member of the set (Requirement 33.7).
    - **Validates: Requirements 33.3, 33.4, 33.5, 33.7**

- [ ] 18. Verify: key entries in the Replay and the Ruffle recorder attempt (Requirements 24, 26)
  - Commit area: `Verify`. Verification V1. Read the design section "Input_Script extension". Ruffle's key entry format was read in `tests/input-format/src/format.rs` and `tests/framework/src/runner/automation.rs`: `{"type":"KeyDown","key":{"Char":"a"}}` or `{"type":"KeyDown","key":"ArrowUp"}`; a key is a name, not a code; the injector sends one entry and no repeat.
  - [~] 18.1 Plan key entries
    - `src/verify/core/replayPlan.ts` classifies `KeyDown` and `KeyUp` and adds `keys: PlannedKey[]` (`tick`, `kind`, `keyCode`, `index`). The pure table `automatedKeyToFlashCode`: `Char(c)` letters and digits to ASCII upper case, `ArrowUp` 38, `ArrowDown` 40, `ArrowLeft` 37, `ArrowRight` 39, `Enter` 13, `Escape` 27, `Space` 32; anything else is `unsupported-input` as today. `planToEntries(plan)` serialises canonical entries (lower-case `Char`). Existing mouse planning and `clickgoto` ticks are unchanged.
    - Tests: `test/unit/replayPlan.test.ts` (extend): the real `clickgoto` plan is unchanged (21 groups, 32 ticks, no problems); key entries; an unsupported entry type. **Property 24: Input_Script keys round trip and keep order**, in `test/property/replayKeys.property.test.ts` (create), generator in `test/property/gen/genReferenceInput.ts` (extend): parse, plan and serialise gives an equal entry list, each key entry takes the tick of its group, and order inside a group is preserved.
    - **Validates: Requirements 24.1, 24.6, 24.7, 24.8**

  - [~] 18.2 Run key entries in the Replay
    - `src/verify/edge/replayRunner.ts` calls `player.dispatchKey` after that tick's update, using the same function as the browser wiring. `clickgoto` keeps Trace_Score 100 at 32 ticks (CC condition: state it in the commit body).
    - Tests: `test/unit/replayRunner.test.ts` (extend) with a Fixture_Class that records key events; `test/unit/clickgotoReplay.test.ts` unchanged and green.
    - _Requirements: 24.2, 24.5_

  - [~] 18.3 Teach the recorder keys and try Ruffle on `entity_game`
    - The Ruffle recorder writes `KeyDown` and `KeyUp` entries into `input.json` in the format above (the format is read in the Ruffle_Source; record the file names in the commit body). Build `test/support/playScript.ts` (create) as the one Input_Script builder for a game: the same script is the recorder input and the Play_Test input (Requirement 26.6); add the `entity_game` script (start click, hold a direction, fire) and a unit test that the committed `samples/entity_game/reference/input.json` equals the builder output. Then try Ruffle on `entity_game` headlessly (the optional `@ruffle-rs/ruffle` in Playwright, Open_Item O9): record whether it ran and what trace it produced; the game calls no `trace()` (F8), so the expected result is an empty trace. Commit only our own script and the options file under `samples/entity_game/reference/`; commit no `output.txt` that is empty unless an empty file is what the verify spec expects (check `samples/*/reference/` conventions first; if unsure, STOP and ask). State at Checkpoint 2 whether Ruffle ran the game headlessly (Requirement 26.4).
    - Tests: `test/unit/playScript.test.ts` (create).
    - _Requirements: 24.3, 24.4, 26.1, 26.3, 26.4, 26.6_

  - [~] 18.4 Report an empty Reference_Trace as not compared
    - For a game whose Reference_Trace is empty the Verify_Stage reports behaviour `not-compared` with the reason `empty-reference-trace` (existing breadth rule). Confirm this on `entity_game` and add a report test; no Trace_Score floor is set for it (Requirement 26.2, 26.3).
    - Tests: `test/e2e/traceScore.e2e.test.ts` (extend) or a report unit test with the `entity_game` shared run.
    - _Requirements: 26.2, 26.3_

- [ ] 19. Translate and Pipeline: the translated `Signal` (D9)
  - Commit area: `Translate` (Pipeline named for 19.3). Verification V1. Read the design row D9 and Requirement 18. `Signal`, `SignalBinding` and `SignalBindingList` are translated from the decompiled source (`swf_class_source` on `.work/games/entity/test.swf` or the committed SWF); no Hand_Written_Class replaces them unless 19.3 runs. The sample names in this task's checks are allowed because the checks are sample runs, not rule tests.
  - [~] 19.1 Translate and type-check the three classes
    - Run the pipeline on `samples/entity_game/test.swf` and confirm `org.osflash.signals.Signal`, `SignalBinding` and `SignalBindingList` are in the registry and have no type error from the gate. Fix missing general rules in the Translator (never a class-named rule). Record the Translation_Report entries.
    - Tests: `test/e2e/entityTranslate.e2e.test.ts` (create): the three classes are registered, no `untranslated-class`, no failed class at load.
    - _Requirements: 18.1_

  - [~] 19.2 Check the behaviour of the translated `Signal`
    - Unit tests that load the emitted `Signal` module in Node (the pipeline output of 19.1, shared run cache): a listener added twice keeps one binding (18.2); `dispatch` with arguments that do not match `valueClasses` throws `ArgumentError` (18.3); listeners are called in the order of the decompiled `SignalBindingList`, confirmed by reading that source (18.4). Record the confirmed order in the commit body.
    - Tests: `test/e2e/entitySignal.e2e.test.ts` (create).
    - _Requirements: 18.2, 18.3, 18.4_

  - [~] 19.3 Fallback, only if 19.1 or 19.2 fails
    - If the translator route cannot make the `Signal` classes load and pass the checks of 19.2, write `handwritten/entity_game/org/osflash/signals/Signal.ts`, add the entry to `handwritten/SET.json` with a reason, rely on the packaged-override fix of Task 17.2, and add **Signal model property** (Requirement 18.7) in `test/property/signalModel.property.test.ts` (create): over sequences of `add`, `addOnce`, `remove` and `dispatch` over a pool of listeners the emitted `Signal` agrees with a list model with prepend on add. If 19.1 and 19.2 pass, this sub-task does nothing: mark it done with the note "not needed" in the commit body, and add no property test.
    - _Requirements: 18.5, 18.6, 18.7_

- [ ] 20. Test and Runtime: inspection hook, `?play=1` and the `entity_game` Play_Test
  - Commit area: `Test` (Runtime and Emit named). Verification V2. Read the design section "Play_Tests" and Requirement 25. The Play_Test runs on the manual clock in both layers: 900 steps at 30 fps (30 seconds) for `entity_game`; wall time is used only to wait for the page to load.
  - [~] 20.1 Add the inspection hook
    - `template/runtime/inspect.ts`: `Player.inspect()` returns plain copies (`tick`, `find(className)`, `stageChildren()` giving `{ className, name, x, y, rotation, visible, frame, label, children }`, `timers()` giving `{ delay, running, currentCount }`), with no setter. Document it in the file header and list it in `structure.md`.
    - Tests: `test/unit/inspect.test.ts` (create): the result is a copy; changing it changes no game state.
    - _Requirements: 25.4_

  - [~] 20.2 Add the `?play=1` driver
    - With `?play=1`, `main.ts` creates a `ManualClock`, skips the `requestAnimationFrame` loop and installs `window.__swfPlay = { step, key, inspect, errors }`; `step(n)` advances `frameIntervalMs` and updates n times and renders every 60 steps. `onCaughtError` collects into `errors`. Add `PlayDriver { step(n), key(type, code), inspect() }` with a Node implementation (Player + FakeBackend + ManualClock) and a Chromium implementation in `test/support/playDriver.ts` (create).
    - Tests: `test/unit/playDriver.test.ts` (create); `test/unit/emit.test.ts` (extend).
    - _Requirements: 25.7_

  - [~] 20.3 Write the `entity_game` scenario for the Node layer
    - `test/support/playScenarios.ts` (create): one function over `PlayDriver` asserting, from observable state: the start click begins the game; holding a direction key changes the ship's position and rotation; the fire key increases the number of bullet display objects; a bullet that overlaps a rock destroys or splits that rock; no error during 30 seconds of play (900 steps). Failures report the state that was reached (Requirement 25.8). The Node layer test is `test/e2e/entityPlay.node.test.ts` (create). If the game does not reach a needed state, fix the general Shim, Runtime or Translator cause (never a sample-named rule) in this task or stop and report.
    - _Requirements: 25.1, 25.3, 25.4, 25.5, 25.8_

  - [~] 20.4 Run the same scenario in headless Chromium
    - `test/e2e/entityPlay.chromium.test.ts` (create) takes a `chromium` slot (limit 3, Browser_Limit), reuses the Shared_Run_Cache output of `entity_game`, loads `?play=1`, runs the same scenario and the same assertions, and also asserts that the page reported no error and that the type-check gate reported no failed class at load (`translation-report.json`). Take one screenshot with the `playwright` MCP and look at it; the Play_Test does not score it (Open_Item O6).
    - _Requirements: 25.1, 25.3, 25.5, 25.7_

- [ ] 21. Verify: `entity_game` scores and Named_Limits (Requirements 26, 27, 33)
  - Commit area: `Verify`. Verification V1. Read Requirements 27 and 33.1 and 33.2 and the design finding F9: the Reference_Frame of `entity_game` is blank because the SWF has one root frame and draws by code.
  - [~] 21.1 Measure Overall_Match and set the floor
    - Run `npm run pipeline -- samples/entity_game/test.swf <outdir> --force --verify`. Record the Overall_Match on at least one frame (Requirement 27.1; the SWF has one frame, so one frame is what exists: state this) and set the Score_Floor equal to the measured value rounded down to two decimals in `test/e2e/overallMatch.e2e.test.ts` (extend with `entity_game`). Add the `entity_game` entry to the residual-causes handling: any region below 100 is attributed to a Named_Limit, a fixed defect or an Open_Item (Requirement 27.6). Record the Open_Item O6 (code-drawn shapes are not compared) in the Fidelity_Report as a named limit.
    - _Requirements: 27.1, 27.4, 27.5, 27.6, 27.8_

  - [~] 21.2 Record the Named_Limits in the reports
    - Named_Limits raised while running (`drawPath-command`, `lineStyle-args`, `filter-not-drawn:*`, `wheel-not-dispatched`, `useCapture-ignored`, `scaleMode-no-effect`, `device-font-metrics`) flow through the sink into the Fidelity_Report `behaviour.namedLimits`; limits known without running come from the scene and translation facts. A sample below 100 lists the limits that explain it.
    - Tests: `test/unit/report.test.ts` (extend) with a sink fixture; `test/e2e/entityReport.e2e.test.ts` (create): the `entity_game` report lists what the Play_Test run raised.
    - _Requirements: 33.1, 33.2_

- [~] 22. Checkpoint 2: `entity_game` plays
  - STOP. Follow the Checkpoint procedure of the rules. Block B shares: Requirements 9 to 11, 13 to 18, 24 to 26 (entity part), 27 (entity part), 33.
  - Run the full suite `npm test -- --run`. The `entity_game` Play_Test must pass in both layers (Requirement 34.6) and the game must be playable. Hand the review to the `fidelity-reviewer` agent, commit its report as `.kiro/specs/as3-coverage/reviews/checkpoint-2.md`, and act on its findings in a new commit before reporting.
  - The report also states: whether Ruffle ran `entity_game` headlessly (Requirement 26.4) and the Trace_Score reason `empty-reference-trace`, whether the `Signal` fallback was used, whether the `Game.stage` rule (Open_Item O4) was confirmed by the Play_Test, and the Credits_Line against the Block B share of about 170.
  - _Requirements: 34.1 to 34.6, 36.1_

### Block C: `spacer` plays (about 200 credits; stop and report above 267)

- [ ] 23. Translate: `this.field` in `super(...)` arguments (D14)
  - Commit area: `Translate`. Verification V1. Block C starts here: restate the Block C share of about 200 credits. Read the design row D14 and Requirement 19. The rule is general; no test names a sample.
  - [~] 23.1 Hoist initialised fields used in `super(...)`
    - When an AS3 constructor reads `this.<field>` or a bare instance field name in the arguments of `super(...)` and the field has an initialiser, evaluate the initialiser into a local before `super(...)`, pass the local, and assign the field from the same local after `super(...)` returns. A field with no initialiser passes the default value of its type and records a Named_Limit when the body assigns it before use. Each rewritten site is named in the Translation_Report.
    - Tests: `test/unit/superArgs.test.ts` (create) with Fixture_Classes: initialised field, no-initialiser field, a field assigned in the body before use, a bare field name.
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.6_

  - [~] 23.2 Write property test for field identity
    - **Property 18: Fields passed to super are the same object**
    - In `test/property/superArgs.property.test.ts` (create): for any field initialiser kind a class whose constructor passes that field to `super(...)` constructs without `ReferenceError`, and the argument the base received is strictly equal to the field afterwards.
    - **Validates: Requirements 19.1, 19.2, 19.5**

- [ ] 24. Convert and Shim: scenes and `currentLabel` (D17)
  - Commit area: `Convert` (Shim and Runtime named). Verification V2. Read the design section "Scenes" and Requirement 21. Scene_JSON becomes `formatVersion` 3 (the reader accepts 2 and 3); goldens are regenerated and the commit records each one and why. `currentLabel` returns the nearest label, `gotoAndStop` is scene-relative as read in Ruffle `core/src/avm2/globals/flash/display/movie_clip.rs`; say so in the commit body and in `flash-behaviour.md`.
  - [~] 24.1 Write scenes in Convert
    - Read `DefineSceneAndFrameLabelDataTag` (`sceneOffsets` 0-based, `sceneNames`) into `SpriteSymbol.scenes?: Array<{ name, firstFrame }>` on the root, 1-based; write one scene at frame 1 when the tag is absent; the writer writes `formatVersion` 3 and documents it. Use `FFDEC_XML` names as observed in the dump; if a name is `UNVERIFIED`, STOP and ask.
    - Tests: `test/unit/convertScenes.test.ts` (create) on a dump excerpt with offsets 0 and 1; a SWF without the tag gives one scene.
    - _Requirements: 21.6, 21.7_

  - [~] 24.2 Read versions 2 and 3 and test the round trip
    - The reader accepts versions 2 and 3; a version 2 file reads as one scene at frame 1. Regenerate the goldens.
    - Tests: **Property 20: Scene goto and scene round trip** (the round-trip half), in `test/property/sceneRoundTrip.property.test.ts` (create): for any scene list, writing to Scene_JSON and reading back gives an equal list; a version 2 file reads as one scene at frame 1.
    - **Validates: Requirements 21.6, 21.7, 21.11**

  - [~] 24.3 Add `currentLabel`, scene-relative `currentFrame` and scene `goto`
    - `MovieClip.currentLabel` returns the nearest label at or before `currentFrame`, else null (Ruffle `get_current_label`). `currentFrame` is scene-relative (`frame - firstFrame + 1`); a single scene at frame 1 gives the old value. `gotoAndStop(frame, scene?)` and `gotoAndPlay(frame, scene?)`: a number is added to the start of the named scene or of the current scene when none is named; a label is global; an unknown scene throws `ArgumentError`. Regenerate and stage the member table so a bare `currentLabel` resolves to `this.currentLabel`.
    - Tests: `test/unit/currentLabel.test.ts` (create) with generated timelines. **Property 19: currentLabel is the nearest label**, in `test/property/currentLabel.property.test.ts` (create). **Property 20: Scene goto and scene round trip** (the goto half), in `test/property/sceneGoto.property.test.ts` (create): in-range `gotoAndStop(frame, scene)` lands on `firstFrame + frame - 1`; a number without a scene is relative to the current scene; an unknown scene throws `ArgumentError`.
    - **Validates: Requirements 21.1 to 21.5, 21.8, 21.9, 21.10, 21.12**

- [ ] 25. Shim and Runtime: `Timer`, `TimerEvent` and the Player clock (D18)
  - Commit area: `Shim` (Runtime named). Verification V2. Read the design section "Timer" (the table of Ruffle behaviours and the state model). Read in the Ruffle_Source: `core/src/timer.rs`, `core/src/avm2/globals/flash/utils/Timer.as`, `core/src/player.rs`; add the rules to `flash-behaviour.md`.
  - [~] 25.1 Add the Shim `Timer` and `TimerEvent`
    - `Timer(delay, repeatCount = 0)` with `start()`, `stop()`, `reset()`, `delay`, `repeatCount`, `currentCount`, `running`; `TimerEvent.TIMER` `"timer"` and `TIMER_COMPLETE` `"timerComplete"`. A bad delay (negative, not a number, infinite) throws `RangeError`. A delay below 10 ms is scheduled at 10 ms and reads back unchanged. `start()` schedules a full interval; `start()` when `currentCount >= repeatCount > 0` fires once and then completes; `running` is already false when `TIMER_COMPLETE` is dispatched. Regenerate and stage the member table.
    - Tests: `test/unit/timer.test.ts` (create): each rule above, at frame rates 30 and 60 on the manual clock.
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.9, 22.11, 22.13_

  - [~] 25.2 Fire timers from the Player clock
    - `runtime/timers.ts`: due timers fire after the frame steps of a tick, at `clock.now()`, only when the due time is strictly less than the current time, at most 10 firings per update; a timer keeps firing when its owner is off the display list. Add the file to the purity list if pure.
    - Tests: `test/unit/timerPlayer.test.ts` (create): firing after the frame update, off-list owner, the cap of 10.
    - _Requirements: 22.7, 22.8, 22.10_

  - [~] 25.3 Write property test for the timer model
    - **Property 21: Timer agrees with the model**
    - In `test/property/timerModel.property.test.ts` (create), model-based with `TimerModel` `{ running, count, repeat, interval, due, now }`: for any sequence of `start`, `stop`, `reset` and clock advances at frame rates 30 and 60, `running`, `currentCount` and the counts of `TIMER` and `TIMER_COMPLETE` events equal those of the model, including the 10 ms floor and the cap.
    - **Validates: Requirements 22.1, 22.3, 22.4, 22.5, 22.6, 22.8, 22.10, 22.12, 22.13**

- [ ] 26. Shim and Runtime: `Rectangle`, `getBounds` and `pixelsOverlap` (D16, D19, D20)
  - Commit area: `Shim` (Runtime named). Verification V2. Read the design section "Collision helper". `getBounds` of an empty clip returns the zero rectangle (Ruffle `get_dobj_bounds` returns `Rectangle::ZERO` for invalid bounds, read in `core/src/avm2/globals/flash/display/display_object.rs`); a target space other than the object is the AABB of the transformed AABB. The Shim does not get `Matrix`, `hitTestObject`, `transform.concatenatedMatrix`, `BitmapData`, `ColorTransform` or `BlendMode` (Requirement 23.10).
  - [~] 26.1 Add `Rectangle`
    - `x`, `y`, `width`, `height`, `left`, `top`, `right`, `bottom`, `intersection(rect)`, `offset(dx, dy)`, `intersects(rect)`. Non-overlapping rectangles give the rectangle at (0, 0) with width 0 and height 0. Setting `x` keeps `width`; setting `left` changes `width` so `right` stays. Regenerate and stage the member table.
    - Tests: `test/unit/rectangle.test.ts` (create). **Property 23: Rectangle algebra**, in `test/property/rectangle.property.test.ts` (create): `intersection` is commutative, lies inside both operands when non-empty, has an area at most the smaller operand's and is the zero rectangle when disjoint; `offset(dx, dy)` then `offset(-dx, -dy)` restores the rectangle.
    - **Validates: Requirements 23.5, 23.6, 23.7, 23.8, 23.9**

  - [~] 26.2 Add `contentBounds` and `DisplayObject.getBounds(targetSpace)`
    - One internal `contentBounds(obj, space)` behind `getBounds`, `pixelsOverlap` and Block D. Empty content returns the Ruffle value (the zero rectangle) and the case is recorded; `LoadedScene` keeps the parsed `ShapeJson` per symbol and `ShapeObject` exposes it. List `getBounds` in `ADDED_APIS.md`.
    - Tests: `test/unit/getBounds.test.ts` (create): an empty clip, a shape, a rotated clip, a target space other than self.
    - _Requirements: 23.10, 23.11_

  - [~] 26.3 Add `runtime/overlap.ts` (`pixelsOverlap`)
    - `pixelsOverlap(a, b)` samples pixel centres in the intersection of the two stage-space `contentBounds` and returns true on the first centre inside both shapes (contours flattened and transformed by the concatenated transform, with the fill rule of the path); it ignores the `visible` flag of the two objects (Ruffle `core/src/bitmap/operations.rs` and `core/src/display_object.rs` `render_base`, design Open_Item O5). It depends on no Flash type. Record the Named_Limit `collision-coverage-mask` (coverage-mask method; antialiased edge pixels are not counted). Add the file to the purity list.
    - Tests: `test/unit/overlap.test.ts` (create). **Property 22: pixelsOverlap is symmetric and bounded**, in `test/property/overlap.property.test.ts` (create) with generated shapes: symmetric, false when the stage-space bounds are disjoint, true when a pixel centre lies inside both.
    - **Validates: Requirements 23.2, 23.3, 23.4**

  - [~] 26.4 Check the hitbox symbols of `spacer`
    - Skip when the SWF is absent. Check the `spacer` hitbox symbols (`mc_FlyHitbox` and the others the decompiled `PhysicEngine` uses) for invisible children and for fills with partial alpha (Open_Items O5 and O8, Requirement 23.12); read the Ruffle_Source for whether invisible children are skipped when drawing a source, or record the Open_Item. Put the result in the commit body; Task 30 collects it.
    - _Requirements: 23.12_

- [ ] 27. Translate: `flash.utils.Proxy` stays unsupported (Requirement 20)
  - Commit area: `Translate`. Verification V1. Read Requirement 20 and the design row D15.
  - [~] 27.1 Name the unsupported base class
    - A class that extends `flash.utils.Proxy` with no Hand_Written_Class replacing it is named as unsupported and left out of the registry as for any unresolved base. The Translator never binds the name `Proxy` to the JavaScript global, and the Shim has no `Proxy` class. Where a Hand_Written_Class replaces it, the Translation_Report names the class as hand-written.
    - Tests: `test/unit/proxyBase.test.ts` (create) with a Fixture_Class that extends `flash.utils.Proxy`: reported as unsupported, not registered, `Proxy` not bound to the global; with an override present, listed as hand-written.
    - _Requirements: 20.1, 20.2, 20.3, 20.5_

  - [~] 27.2 Check that the Shim has no `Proxy`
    - Extend `test/unit/shimNames.test.ts`: `Proxy` is not an export of `template/shim/index.ts`.
    - _Requirements: 20.5_

- [ ] 28. Handwritten `spacer` files: gated on the licence decision (D15, D16)
  - Commit area: `Samples` (Pipeline named). Verification V1. This task is gated by the owner decision O1 (Requirement 28.13): until the owner decides the licence, nothing under `handwritten/spacer/` is staged or committed, and `handwritten/SET.json` gets no `spacer` entry.
  - [~] 28.1 Write the two files locally, uncommitted
    - Read the decompiled `KeyObject` and `PhysicEngine` with `swf_class_source` on `.work/games/spacer/test.swf`. Write `handwritten/spacer/KeyObject.ts` (about 45 lines, no `Proxy`; reason: `extends flash.utils.Proxy`, the Shim has no `Proxy`, and a stub would ignore `flash_proxy` overrides without saying so; the only override, `getProperty`, is dead code in `spacer`) and `handwritten/spacer/PhysicEngine.ts` (the AS3 class with `areaOfCollision`, lines 174 to 214, replaced by one call to `pixelsOverlap(a, b)`; reason: the Flash route needs `BitmapData.draw`, blend modes and colour transforms, which are out of scope). Do not stage them. Do not add them to `handwritten/SET.json` yet.
    - _Requirements: 20.4, 23.1, 23.2, 33.9_

  - [~] 28.2 STOP and ask the owner for the licence decision (O1)
    - STOP. Report that the two files are adapted from GPL-3.0 source in an MIT repository (`LICENSE` is MIT) and ask the owner to choose: commit them under GPL-3.0 with a `handwritten/spacer/LICENSE` and a header (recommended in the design) and state it in `PROVENANCE.md` and About, or keep them uncommitted and skip the `spacer` Play_Test when `handwritten/spacer/` is absent. Do not continue to 28.3 until the answer is given. Until then the Translation_Report and Fidelity_Report claim no licence for them (Requirement 33.10).
    - _Requirements: 28.13, 33.10_

  - [~] 28.3 Commit the files and the set entries, if the owner approves
    - If the owner approves: add `handwritten/spacer/LICENSE` and the header as decided, add both entries with reasons to `handwritten/SET.json`, update `samples/spacer/PROVENANCE.md` and the Fidelity_Report text for the decided licence, and run `test/unit/handwrittenSet.test.ts` (every `.ts` listed, every entry has a file) and the report tests. If the owner declines, leave the files uncommitted and untracked, add nothing to `SET.json`, and record in the commit body of Task 31 that the `spacer` Play_Test skips with the message that `handwritten/spacer/` is absent (Requirement 25.6, 28.13). In both cases the Translation_Report names each Hand_Written_Class used with its reason and the translated class replaced (Requirement 33.3, 33.4).
    - _Requirements: 28.13, 33.3, 33.4, 33.8, 33.9, 33.10_

- [ ] 29. Verify: `spacer` end to end, the timeout and the floors (Requirement 27)
  - Commit area: `Verify`. Verification V1. Skip every step with the fetch message when the `spacer` SWF is absent (Requirement 28.7). Read the design findings F1, F2 and F9 and Requirement 27.7: the `spacer` render timeout was a page-load failure (`Class extends value undefined`), fixed by Task 5; do not raise a timeout.
  - [~] 29.1 Run the full pipeline on `spacer` and fix the load path
    - Run `npm run pipeline -- .work/samples/spacer/test.swf .work/as3-spacer/out --force --verify` (with `handwritten/spacer/` present locally or committed per Task 28). Confirm `window.__swfResurrect.ready` is true and name the first remaining error otherwise; fix general causes (never a class-named rule). Use the `swf-inspector` `fidelity_summary` tool on the output directory.
    - _Requirements: 27.7, 37.1_

  - [~] 29.2 Explain and record the render timeout
    - Find the cause of the previous render timeout for frames 1 and 2 (design finding F1: the import cycle), record it in the commit body and in the design's evidence index through Task 30, and make sure no timeout was raised (`git diff` shows none). If a different cause remains, find and fix it and record it.
    - _Requirements: 27.7, 36.2_

  - [~] 29.3 Measure Overall_Match and set the floor
    - Measure Overall_Match on at least two frames, one of each scene (root frames 1 and 2, Requirement 27.3). Set the Score_Floor for `spacer` equal to the measured value rounded down to two decimals in `test/e2e/overallMatch.e2e.test.ts` (extend; the test skips when the SWF is absent). Attribute every differing region to a Named_Limit, a fixed defect or an Open_Item (Requirement 27.6); list the Named_Limits "static text not drawn" and "rotated width and height not measured" in the Fidelity_Report of `spacer` while Block D is not done (Requirement 32.4). When FFDec cannot render a Reference_Frame, name the frame and the reason (Requirement 27.2). Do not commit generated Reference_Frames or Diff_Images, and do not commit the `spacer` SWF or output.
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.8, 32.4_

  - [~] 29.4 Try Ruffle on `spacer` and write the input script
    - Add the `spacer` script (Enter, each movement key, shoot, pause) to `test/support/playScript.ts` and a unit test that `samples/spacer/reference/input.json` equals the builder output (our own script, committed; no GPL output). Try Ruffle headlessly on `spacer` once and record whether it ran. `spacer` writes no `trace()` output (F8): the Trace_Score stays `not-compared` with `empty-reference-trace`; the reference trace is not committed (Requirement 26.5 is moot, record the reason in the commit body).
    - _Requirements: 26.1, 26.3, 26.4, 26.5, 26.6_

- [ ] 30. Test and Docs: measure or record the "not verified" items (Requirement 36.6)
  - Commit area: `Test` (Docs and Steering named). Verification V1. Each item below is measured by a test or read from the Ruffle_Source, or recorded as an Open_Item, by Checkpoint 3.
  - [~] 30.1 Measure what can be measured
    - Tests: `test/unit/flashBehaviour.test.ts` (extend) or new files: Stage `enterFrame` order (registration order, covered by Task 10 and cited), `getBounds` of an empty clip (Task 26), Timer granularity (Task 25), the override of a packaged class (Task 17.2); and for `BitmapData.draw` of an invisible source, the read of the Ruffle_Source files named in Task 26.3 and the check of Task 26.4. Each test names its evidence.
    - _Requirements: 36.6, 23.11, 23.12_

  - [~] 30.2 Update `flash-behaviour.md`
    - Add each measured or read behaviour with its evidence: broadcast registration order, Timer floor and cap, nearest-label `currentLabel`, scene-relative `currentFrame` and `goto`, empty `getBounds`, equal-priority listener order, scope order. Check that earlier tasks already added theirs and fill the rest.
    - _Requirements: 36.7_

  - [~] 30.3 Record the Open_Items
    - Collect the Open_Items that no test could settle (O3 pruning of broadcast listeners, O4 `this` scope convention if the Play_Test did not confirm it, O5 invisible children, O7 other keyboard layouts, O8 hitbox alpha, O9 Ruffle headless, O10 the `publicHost` flake) into the Open_Items section of `design.md` with the reason, as the one place in this plan where `design.md` is edited. State the edit in the commit body (area `Docs`).
    - _Requirements: 36.5, 36.6, 1.5_

- [ ] 31. Test: the `spacer` Play_Test
  - Commit area: `Test`. Verification V2. Read the design section "Play_Tests" and Requirement 25.2. The test skips with a message when `.work/samples/spacer/test.swf` or `handwritten/spacer/` is absent (Requirement 25.6, 28.13). It runs on the manual clock: 1800 steps at 60 fps (30 seconds), in both layers.
  - [~] 31.1 Add the `spacer` scenario for the Node layer
    - In `test/support/playScenarios.ts` add one function asserting, from observable state: Enter starts the level; each movement key moves the player and the player stays inside the scene bounds; shooting increases the number of bullet display objects; an enemy that is hit plays its death animation to its last frame and is then removed from the display list; the pause key pauses the game, `Timer` instances do not advance while paused (read through `inspect().timers()`), and resume restores their behaviour as the game's remaining-time code expects; no error during 30 seconds of play. `test/e2e/spacerPlay.node.test.ts` (create). Fix general causes in the Translator, Shim or Runtime when a state is not reached; stop and report if a block share is at risk.
    - _Requirements: 25.2, 25.3, 25.4, 25.6, 25.8_

  - [~] 31.2 Run the same scenario in headless Chromium
    - `test/e2e/spacerPlay.chromium.test.ts` (create): `chromium` slot, Shared_Run_Cache, `?play=1`, same scenario and assertions, no page error, no failed class at load. Take a screenshot with the `playwright` MCP and look at it.
    - _Requirements: 25.2, 25.3, 25.5, 25.7_

- [~] 32. Checkpoint 3: `spacer` plays
  - STOP. Follow the Checkpoint procedure of the rules. Block C shares: Requirements 19 to 23, 25 (spacer), 26 (spacer), 27 (spacer), 36.6.
  - Run the full suite `npm test -- --run`. The `spacer` Play_Test must pass and the game must be playable (Requirement 34.7); if `handwritten/spacer/` is absent by the owner's decision, report the skip and that the acceptance of the game is Requirements 25 and 27 as far as they can run. Hand the review to the `fidelity-reviewer` agent, commit its report as `.kiro/specs/as3-coverage/reviews/checkpoint-3.md`, and act on its findings in a new commit before reporting.
  - The report also states: whether Ruffle ran `spacer` headlessly (Requirement 26.4), the cause of the render timeout, each "not verified" item as measured, read or Open_Item (Requirement 36.6), the owner decision on O1 and O2, and the Credits_Line against the Block C share of about 200.
  - Record the Block D budget decision (Requirement 32.1, 32.2, 34.8): compute the credits spent on Blocks A to C plus the Block D share of 60 against the total of about 600. If the credits left cover Block D, say so and propose to start Task 33. If not, mark Tasks 33 to 36 as skipped in this report and in the commit body, record the amounts and the reason, state that Requirements 29 to 31 are recorded as not started and no test of them is in the default suite (Requirement 32.5), and note that the Named_Limits "static text not drawn" and "rotated width and height not measured" stay listed in the Fidelity_Report of `spacer` (Requirement 32.4). Wait for the owner.
  - _Requirements: 34.1 to 34.5, 34.7, 34.8, 32.1, 32.2, 32.4, 32.5, 36.1, 36.6_

### Block D: looks right, only if budget remains (about 60 credits; stop and report above 80)

- [ ] 33. Convert: static edit text is drawn as shapes (D12)
  - Commit area: `Convert`. Verification V2 if anything under `template/` changes, else V1. Start only after Checkpoint 3 is accepted and the budget decision says Block D runs (Requirement 32.1). Block D starts here: restate the Block D share of about 60 credits. Skip every `spacer`-specific step when the SWF is absent. Read the design row D12 and finding F7: Convert treats a `DefineEditTextTag` with `wasStatic="true"` and `readOnly="true"` like `DefineTextTag`; there is no `texts` field in Scene_JSON, no device font and no new runtime concept.
  - [~] 33.1 Measure Overall_Match before Block D
    - Before any other Block D change, measure Overall_Match of `spacer` on the frames of Requirement 27.3 with the same tolerance and Reference_Frames, and record the value and the differing regions in the commit body and in the Checkpoint 4 report (Requirement 31.1).
    - _Requirements: 31.1_

  - [~] 33.2 Export and convert static edit text
    - A placed symbol that contains a Static_Text_Tag has its FFDec text SVG exported, converted with `svgToShapeJson(..., 'text')` (which resolves `<use>` glyph references) and emitted as a shape symbol. A `DropShadowFilter` on a placement is recorded as a Named_Limit (stored, not drawn) and listed by the Fidelity_Report when a differing region lies inside the placement's bounds. The Translator adds no `TextField` binding. A SWF with no Static_Text_Tag produces the same Scene_JSON symbols as before.
    - Tests: `test/unit/convertStaticEditText.test.ts` (create) with a generated dump and SVG; an existing-sample regression (same symbols as before).
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.9_

  - [~] 33.3 Write property test for the shape bounds
    - In `test/property/staticTextBounds.property.test.ts` (create): for generated Static_Text_Tags with generated SVG glyph sets, the emitted shape symbol's bounds equal the bounds of the tag's SVG (Requirement 29.8; this property has no number in the design's list).
    - **Validates: Requirements 29.8**

- [ ] 34. Shim: rotated `width` and `height` (D20)
  - Commit area: `Shim` (Runtime named). Verification V2. Start only if Block D runs. Read the design row D20 and Requirement 30. `width` and `height` are the size of `contentBounds(obj, self)` after the object's own scale and rotation; setting them changes the scale so the getter returns the requested value (read the Ruffle_Source or measure at rotations of 90 and 180 degrees, or record an Open_Item).
  - [~] 34.1 Return Rotated_Bounds from `width` and `height`
    - With `rotation` 0 and no skew the getters return what they returned before. An empty display object follows Requirement 23.11. The setters change the scale as stated above. Regenerate and stage the member table if the Shim surface changes.
    - Tests: `test/unit/rotatedSize.test.ts` (create) with Fixture_Classes: rotation 0 unchanged, 90 degrees swaps, empty object.
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.8_

  - [~] 34.2 Write property test for Rotated_Bounds
    - **Property 26: Rotated bounds contain the corners**
    - In `test/property/rotatedBounds.property.test.ts` (create): for any rectangle and rotation the rotated bounds contain the four rotated corners, a rotation of 90 degrees swaps `width` and `height`, and 360 degrees equals 0 within 1e-6.
    - **Validates: Requirements 30.1, 30.6, 30.7**

- [ ] 35. Verify: Overall_Match after Block D and the floor (Requirement 31)
  - Commit area: `Verify`. Verification V1. Start only if Block D runs. Skip with the fetch message when the `spacer` SWF is absent.
  - [~] 35.1 Measure again and raise the floor
    - Measure Overall_Match of `spacer` again on the same frames, the same tolerance and the same Reference_Frames. If the value is higher than the value of Task 33.1, raise the Score_Floor of `spacer` to it rounded down to two decimals in the same commit; if lower, record the cause and keep the floor of Task 29.3 (Requirement 31.4). The tolerance, Reference_Frames, `pixelDiff.ts` and every other floor stay unchanged.
    - _Requirements: 31.2, 31.3, 31.4, 31.7_

  - [~] 35.2 Attribute the remaining regions
    - Attribute every remaining differing region to a Named_Limit, a fixed defect or an Open_Item (Requirement 31.5) and remove the Named_Limits "static text not drawn" and "rotated width and height not measured" from the `spacer` report only for what Block D now covers. State both values and the regions Block D removed in the commit body.
    - _Requirements: 31.5, 31.6_

- [~] 36. Checkpoint 4: Block D done
  - STOP. This is the final Checkpoint (Requirement 32.3). It exists only if Block D ran; if Checkpoint 3 recorded the skip, mark this task as skipped with the reason and do not run it (Requirement 32.2).
  - Follow the Checkpoint procedure of the rules: run the full suite `npm test -- --run`, hand the review to the `fidelity-reviewer` agent, commit its report as `.kiro/specs/as3-coverage/reviews/checkpoint-4.md`, act on its findings in a new commit, then stop and report. The report also gives the Overall_Match of `spacer` before (Task 33.1) and after (Task 35.1), the regions Block D removed, the Named_Limits that remain, the total credits against about 600 and the Credits_Line.
  - _Requirements: 31.6, 32.3, 34.1 to 34.5, 36.1_

## Notes

- All tests in this plan are required. There are no `*` markers and no optional test tasks, following the `breadth` plan. Each pure function's test is in the sub-task that adds it. The design's 27 Correctness Properties each have one sub-task: Property 1 in 3.3, 2 in 4.4, 3 in 8.1, 4 in 8.2, 5 in 7.2, 6 in 9.1, 7 in 10.1, 8 in 10.2, 9 in 9.2, 10 in 12.2, 11 in 13.2, 12 in 6.1, 13 in 6.2, 14 in 14.3, 15 in 15.3, 16 in 16.1, 17 in 16.3, 18 in 23.2, 19 in 24.3, 20 in 24.2 and 24.3, 21 in 25.3, 22 in 26.3, 23 in 26.1, 24 in 18.1, 25 in 2.1, 26 in 34.2, 27 in 17.3. The extra property of Requirement 37.10 is in 5.1, the static text bounds property of Requirement 29.8 is in 33.3, and the Signal model property is in 19.3 only if the fallback is used.
- Gated and conditional steps: Task 19.3 (only if the translator route fails), Task 28.2 (owner decision O1 on the licence of the hand-written `spacer` files; `handwritten/spacer/*` is not committed before it), the upstream URLs and commits (O2, `pending` in both `PROVENANCE.md` files), and Block D (Tasks 33 to 36, only if the Checkpoint 3 budget decision says so). Tests that need the `spacer` SWF skip with a message when it is absent (Requirement 28.7).
- Checkpoints are Tasks 11, 22, 32 and 36, exactly four (Requirement 34.1). Each stops and waits for the owner.
- Credit shares: spec documents 40, Block A 130, Block B 170, Block C 200, Block D 60, about 600 in total. Each block stops and reports above its share by more than one third.
- The Task Dependency Graph runs one leaf task per wave in the order of this document. One top-level task is one commit and the sub-tasks of a commit share files, so no two leaf tasks run in parallel. Checkpoint tasks and top-level parent tasks are not in the graph.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["2.3"] },
    { "id": 5, "tasks": ["3.1"] },
    { "id": 6, "tasks": ["3.2"] },
    { "id": 7, "tasks": ["3.3"] },
    { "id": 8, "tasks": ["4.1"] },
    { "id": 9, "tasks": ["4.2"] },
    { "id": 10, "tasks": ["4.3"] },
    { "id": 11, "tasks": ["4.4"] },
    { "id": 12, "tasks": ["5.1"] },
    { "id": 13, "tasks": ["5.2"] },
    { "id": 14, "tasks": ["5.3"] },
    { "id": 15, "tasks": ["5.4"] },
    { "id": 16, "tasks": ["6.1"] },
    { "id": 17, "tasks": ["6.2"] },
    { "id": 18, "tasks": ["7.1"] },
    { "id": 19, "tasks": ["7.2"] },
    { "id": 20, "tasks": ["7.3"] },
    { "id": 21, "tasks": ["8.1"] },
    { "id": 22, "tasks": ["8.2"] },
    { "id": 23, "tasks": ["8.3"] },
    { "id": 24, "tasks": ["8.4"] },
    { "id": 25, "tasks": ["9.1"] },
    { "id": 26, "tasks": ["9.2"] },
    { "id": 27, "tasks": ["9.3"] },
    { "id": 28, "tasks": ["10.1"] },
    { "id": 29, "tasks": ["10.2"] },
    { "id": 30, "tasks": ["10.3"] },
    { "id": 31, "tasks": ["12.1"] },
    { "id": 32, "tasks": ["12.2"] },
    { "id": 33, "tasks": ["12.3"] },
    { "id": 34, "tasks": ["13.1"] },
    { "id": 35, "tasks": ["13.2"] },
    { "id": 36, "tasks": ["13.3"] },
    { "id": 37, "tasks": ["14.1"] },
    { "id": 38, "tasks": ["14.2"] },
    { "id": 39, "tasks": ["14.3"] },
    { "id": 40, "tasks": ["15.1"] },
    { "id": 41, "tasks": ["15.2"] },
    { "id": 42, "tasks": ["15.3"] },
    { "id": 43, "tasks": ["16.1"] },
    { "id": 44, "tasks": ["16.2"] },
    { "id": 45, "tasks": ["16.3"] },
    { "id": 46, "tasks": ["16.4"] },
    { "id": 47, "tasks": ["17.1"] },
    { "id": 48, "tasks": ["17.2"] },
    { "id": 49, "tasks": ["17.3"] },
    { "id": 50, "tasks": ["18.1"] },
    { "id": 51, "tasks": ["18.2"] },
    { "id": 52, "tasks": ["18.3"] },
    { "id": 53, "tasks": ["18.4"] },
    { "id": 54, "tasks": ["19.1"] },
    { "id": 55, "tasks": ["19.2"] },
    { "id": 56, "tasks": ["19.3"] },
    { "id": 57, "tasks": ["20.1"] },
    { "id": 58, "tasks": ["20.2"] },
    { "id": 59, "tasks": ["20.3"] },
    { "id": 60, "tasks": ["20.4"] },
    { "id": 61, "tasks": ["21.1"] },
    { "id": 62, "tasks": ["21.2"] },
    { "id": 63, "tasks": ["23.1"] },
    { "id": 64, "tasks": ["23.2"] },
    { "id": 65, "tasks": ["24.1"] },
    { "id": 66, "tasks": ["24.2"] },
    { "id": 67, "tasks": ["24.3"] },
    { "id": 68, "tasks": ["25.1"] },
    { "id": 69, "tasks": ["25.2"] },
    { "id": 70, "tasks": ["25.3"] },
    { "id": 71, "tasks": ["26.1"] },
    { "id": 72, "tasks": ["26.2"] },
    { "id": 73, "tasks": ["26.3"] },
    { "id": 74, "tasks": ["26.4"] },
    { "id": 75, "tasks": ["27.1"] },
    { "id": 76, "tasks": ["27.2"] },
    { "id": 77, "tasks": ["28.1"] },
    { "id": 78, "tasks": ["28.2"] },
    { "id": 79, "tasks": ["28.3"] },
    { "id": 80, "tasks": ["29.1"] },
    { "id": 81, "tasks": ["29.2"] },
    { "id": 82, "tasks": ["29.3"] },
    { "id": 83, "tasks": ["29.4"] },
    { "id": 84, "tasks": ["30.1"] },
    { "id": 85, "tasks": ["30.2"] },
    { "id": 86, "tasks": ["30.3"] },
    { "id": 87, "tasks": ["31.1"] },
    { "id": 88, "tasks": ["31.2"] },
    { "id": 89, "tasks": ["33.1"] },
    { "id": 90, "tasks": ["33.2"] },
    { "id": 91, "tasks": ["33.3"] },
    { "id": 92, "tasks": ["34.1"] },
    { "id": 93, "tasks": ["34.2"] },
    { "id": 94, "tasks": ["35.1"] },
    { "id": 95, "tasks": ["35.2"] }
  ]
}
```
