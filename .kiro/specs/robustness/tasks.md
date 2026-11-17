# Implementation Plan: robustness

## Overview

Language: TypeScript (strict), as in the design. The plan makes every run of `npm run pipeline` end in one honest Outcome, recovers obfuscated files on a copy and then unpacks once, stubs Flash APIs by a general rule, adds a real `flash.geom.Point`, and draws and clicks button symbols. It has 24 top-level tasks in three blocks, each ending in one Checkpoint (Requirement 24.1): Block A, the contract (Tasks 1 to 12, Checkpoint 1 is Task 13); Block B, recover and stub (Tasks 14 to 18, Checkpoint 2 is Task 19); Block C, buttons (Tasks 20 to 23, Checkpoint 3 is Task 24). Exactly three tasks are named "Checkpoint". Every other top-level task is one commit with its tests, and its sub-tasks share that commit.

Order, in one paragraph. Block A builds the pure core first: Outcome types, exit-code table, reasons, gap summary and `decideOutcome` (Task 1), the Outcome_File writer, parser and `docs/outcome.md` (Task 2), the Facts_Reader and the hostile SWF byte builder (Task 3). Three small findings of Requirement 25 follow, each as its own top-level task and its own commit, placed just before the first task that would otherwise touch the same file: the `SET.json` message in `cli.ts` (Task 4, S2), the `[translate]` line label in `pipeline.ts` (Task 5, S3), and the process-tree kill with the child registry in `src/unpack/` (Task 6, S1). Task 7 wires the Outcome into `runPipeline` and the CLI (classifier, Facts stage, numbers from the reports). Task 8 adds the Failure_Log, the Reference_Id, the FFDec log and the exit-2 cases. Task 9 corrects `tech.md` (S4). Task 10 adds Run_Limits, the injectable clock and the guard. Task 11 adds the cleanup plan and the Emit journal. Task 12 adds signal handling, the hostile fixture matrix and the per-sample Outcome tests. Block B adds the Flash_API_Table with generated stubs (Task 14), `Point` (Task 15), the Translator policy lookup, the stub-dependency count and the stall listing (Task 16), the ABC_Name_Scan and the obfuscation verdict (Task 17), and recovery on a copy followed by one Unpack (Task 18). Block C verifies the button XML names and converts buttons into Scene_JSON 4 (Task 20), adds the button state model, `SimpleButton` and drawing (Task 21), adds hover events to Player and Shim (Task 22) and ends with the generated-button end-to-end test and the Outcome count (Task 23).

Start of Block A. Before Task 1 run `npm test -- --run` once and confirm it is green; if it is not, stop and report. The branch is `wip/as3-coverage` (Requirement 24.6): run `git branch --show-current` before the first commit; if it prints `main`, stop and ask. Do not create a branch.

Owner decisions are final. Nothing in this plan is an assumed default and no task waits for a decision.

| Decision | Final value | Tasks that build on it |
|---|---|---|
| U1 | Defaults 20 MiB, 300 s run, 60 s base stage; weights recover 2, unpack 2, convert 1, translate 1, emit 1, gate 1, verify 3. `redball4` is expected to end `converted-with-gaps` under the defaults with time to spare. The web server's 180 s per-job kill is the web owner's to align and `docs/outcome.md` says so | 2.3, 10.1, 10.2, 18.4, 19 |
| U2 | `converted-with-gaps` exits 0; refusal for `nothing-translated` only at 0 translated of more than 0 candidates; no percentage threshold | 1.2, 7.1, 12.2 |
| U3 | Stub classes ship in every Emitted_Project (`template/shim/stubs/`); Emit does not filter or generate them | 14.2 |
| U4 | FFDec non-zero exit at Unpack is `refused damaged`; the FFDec text goes only to `ffdec-<Reference_Id>.log`; every error of our own code stays `failed internal-error` | 7.1, 8.1, 12.2 |
| U5 | A `DefineButtonTag` dump written by FFDec from a generated file lifts the `UNVERIFIED` stop, labelled "measured on a generated file" | 20.1 |
| U6 | Hover events are included in Block C, with the D-C8 fallback if Block C exceeds its share by a third | 22.1, 22.2 |
| U7 | `ZWS` is header facts only; no new dependency | 3.1 |
| U8 | `Point` gets `copyFrom` and `setTo` | 15.1 |
| U9 | No supervisor process (Open_Item O1) | 6.1, 12.1 |

Amendments A1, A3, A4, A5, A7 to A15 are approved and are applied in the tasks below as plain requirements. A2 and A6 are rejected and replaced (U1, and D-B5 with no keep-if-better rule). `requirements.md` and `design.md` are not edited by any task.

Tests. Unit tests use Fixture_Classes, stage fakes and generated records, and never name a sample in `src/` (Requirements 8.7, 11.8). The design lists 25 properties, all fast-check properties. Every test in this plan is required: there is no optional test sub-task and no `*` marker, following the `as3-coverage` plan. A task that adds a pure function adds that function's test in the same task. Property tests use `fast-check` 4.10.2 with the shared config in `test/property/config.ts`, carry a comment `// Feature: robustness, Property <n>: <title>`, and run at least 100 runs. Generators live in `test/property/gen/`. Property-test files are named in the design's Testing Strategy: `outcome`, `facts`, `limits`, `recover`, `apiStubs`, `point`, `button`; a task that adds a property to one of these files creates the file or extends it.

Rules that apply to every task:

- Follow `.kiro/steering/git-workflow.md` and Requirement 24. One top-level task is one commit; Checkpoint tasks commit only the Fidelity_Reviewer report and fixes for its findings. Never `git push`, merge, cherry-pick, amend, rebase, reset or force. Never use `git add -A`, `git add .` or `git commit -a`: stage by path only the files the task created or changed, plus `.kiro/specs/robustness/tasks.md` and `tasks.meta.json`. Never commit `tools/`, `node_modules/`, `out/`, `.work/` or `dist/`. Never commit `redball4.swf`, its renamed or deobfuscated copies, its output, its decompiled source or its class names (Requirement 11.9).
- Verification before each commit. V1: `npm run typecheck` and `npx vitest related --run <changed source files>` plus every test file the task added or edited; both must pass. V2: V1 plus `npm run typecheck:template`, and the score floor tests `test/unit/clickgotoReplay.test.ts` and `test/e2e/overallMatch.e2e.test.ts`, required for any task that changes a file under `template/` (Requirement 17.10). A change under `template/shim/` also commits the regenerated `src/translate/shimMembers.generated.ts` (Requirement 24.10; the hook regenerates it silently, so check `git status` and stage it). The full suite `npm test -- --run` runs only at Checkpoint tasks; a failure it finds is fixed in a new commit that names the task that caused it. Never commit a failing state. Each task names V1 or V2.
- Commit message: first line `Area: what changed, imperative`, at most 72 characters; then a blank line; then why, what, how it was verified, what is not verified, and the task number. Areas: `Unpack`, `Convert`, `Translate`, `Emit`, `Runtime`, `Shim`, `Pipeline`, `Test`, `Spec`, `Steering`, `Build`, `Repo`, `Samples`, `Web`, `MCP`, `Hooks`, `Docs`, `Verify`. A task whose commit changes `src/translate/` uses `Translate` and names the other stages it touches. No `Co-Authored-By`, no "Generated with", no emoji, no UTF-8 BOM (pass the message with `git commit -F -`). When an MCP tool, a hook or the Fidelity_Reviewer caught or changed something in the commit, the body says so in one line (Requirement 24.8).
- Small findings (Requirement 25). Each of S1 to S4 is its own top-level task and its own commit, carries the test the requirement names, and is placed before the first task that touches the same file. If a later task would be the first to touch one of those files and the fix is not yet committed, do the fix task first. S1 is Task 6, S2 is Task 4, S3 is Task 5, S4 is Task 9.
- Floors and scores (Requirement 11): never change the Verify_Tolerance, the Reference_Frames, `src/verify/core/pixelDiff.ts` or any existing file under `samples/*/reference/`. Score_Floors only go up. Never raise a timeout; `PIPELINE_SLOTS` stays 3. A task that changes the Translator, Shim, Runtime or Convert states, in its commit body, the Overall_Match and Trace_Score of every committed sample before and after. If a floor would drop, fix or revert the change.
- Flash behaviour (Requirement 24.12). A task that adds a Flash behaviour to the Shim or Runtime says in its commit body whether it was read in the Ruffle_Source (pinned commit `4a8d39661ed8aec97afee1504a4e33080da2efd0`, local copy `.work/ruffle-src`) or measured, and adds it with its evidence to `.kiro/steering/flash-behaviour.md` in the same commit. A behaviour that is neither is recorded as an Open_Item in the commit body and collected at the next Checkpoint report.
- Shim additions beyond `docs/brief.md` go in `template/shim/ADDED_APIS.md` with the Fixture_Class line that needs each. A Named_Limit raised at run time goes through the existing sink `namedLimit(id, detail)`.
- Scope limits: no file under `web/` or `mcp/` changes (Requirements 10.3, 11.3). No sample and no third-party SWF is added (Requirement 23.1). Hostile_Fixtures are generated in tests under a temporary directory, never downloaded or committed. A test that needs `.work/judge-test/redball4.swf` reads it in place, writes only under `.work/`, and skips with a message when the file is absent (Requirements 8.6, 23.4).
- Stop and ask the user instead of continuing when: a Checkpoint is reached; tests or typecheck cannot pass within the task's scope; a finding contradicts `requirements.md`, `design.md` or `.kiro/steering/tech.md`; a task would need an FFDec XML name marked `UNVERIFIED` in `src/convert/ffdecXml.ts` to be trusted beyond the U5 decision; a New_Dependency seems needed (name, exact version, licence, reason; U7 means no LZMA decoder is added); a block will exceed its credit share by more than one third (Requirement 24.5).
- Budget (Requirement 24.5): about 250 credits in total by the real meter: spec documents 30, Block A 70, Block B 90, Block C 60. Each block starts with a note that restates its share. The stop thresholds are Block A 93, Block B 120, Block C 80 credits by the real meter: if a block will pass its threshold, stop and report before spending more. Each Checkpoint_Report carries the Credits_Line ("Est. Credits Used").
- Checkpoint procedure (Requirements 12, 19, 22, 24.2 to 24.4), used by Tasks 13, 19 and 24: (1) run the full suite `npm test -- --run` and note the Warm_Suite_Time (about 150 seconds; never raise a timeout, make the slowest new test cheaper instead); (2) hand the review to the `fidelity-reviewer` agent (sub-agent, or the user starts it with `--agent fidelity-reviewer`) and save its report as `.kiro/specs/robustness/reviews/checkpoint-<n>.md`; (3) act on every finding in a new commit before the next task and name the fixing commit in the report; (4) commit the review file by path with the area `Spec`; (5) STOP and report and wait for the owner. Every Checkpoint_Report contains (Requirement 24.4): the real output of `git status`; the commits since the last stop (`git log --oneline` from the previous Checkpoint); the per-sample table (below); the result of both Play_Tests (`entity_game` and `spacer`; `spacer` passes or skips with its existing message); the Outcome, reason code and exit code of every Hostile_Fixture; the new Named_Limits; the Open_Items; the Warm_Suite_Time; and the Credits_Line.
- Per-sample table at every Checkpoint (Requirements 4.10, 11.4, 22.2): one row for each committed sample (`clickgoto`, `tweendemo`, `radial`, `gradients`, `acid-color-2`, `mask_reapply`, `click_block`, `3_joystick`, `slider_component`, `entity_game`) and for the fetched samples when present (`static_text`, `spacer`): Overall_Match, Trace_Score, type errors, Outcome (`converted` or `converted-with-gaps`, never `refused` or `failed`). A value lower than at the previous Checkpoint is a finding. Both Play_Tests must keep passing (Requirement 11.5).
- Tools: use the `swf-inspector` tools (`swf_summary`, `swf_find_tags`, `swf_list_classes`, `swf_class_source`, `fidelity_summary`) for SWF facts and the `playwright` MCP for browser checks. The tools accept paths inside the repository, so `redball4.swf` is read at its path under `.work/judge-test/`.
- Design reading: before coding a task, read the design section named in the task by its heading. The design is long; do not rely on its first part only.
- Core files (`src/outcome/` except `outcomeFile.ts` file I/O, `src/facts/`, `src/recover/detect.ts`, `src/pipeline/cleanup.ts`, `src/pipeline/limits.ts`, `src/convert/buttons.ts`, `template/runtime/buttonModel.ts`) are pure: they import no `node:*` module, no `playwright`, and use no `Date`, `Math.random`, `localeCompare` or `toLocale*`. `readFacts` is passed an inflate function by its caller so the zlib call sits in an edge wrapper. A task that adds such a file adds it to the purity test list that already exists in `test/unit/`.
- Exact dependency versions only. No New_Dependency is expected. No LLM call. No network call by a test or a Pipeline stage. Commands are PowerShell compatible. Test runs use `npm test -- --run` or `npx vitest ... --run`, never watch mode. Never block on a dev server.
- Do not edit `requirements.md` or `design.md` from any task. Edit `.kiro/steering/tech.md` and `structure.md` in the commit that adds a command, option or directory (Requirement 10.4), except the formatVersion correction, which is its own commit (Task 9). `tasks.meta.json` is written by the task runner; do not create or hand-edit it.

## Tasks

### Block A: the contract (about 70 credits; stop and report above 93)

- [x] 1. Outcome core: types, exit codes, reasons, gaps, `decideOutcome`
  - Commit area: `Pipeline`. Verification V1. Block A starts here: note the Credits_Line at the start and restate the Block A share of about 70 credits. Read the design sections "Decisions at a glance", "Block A: the contract" (D-A1 to D-A11, "Outcome record"), "Data Models" and Properties 1, 5, 6 and 7. New directory `src/outcome/` is pure (except `outcomeFile.ts` in Task 2) and is added to the purity list.
  - [x] 1.1 Add `src/outcome/outcome.ts`, `exitCode.ts`, `reasons.ts` and `gaps.ts`
    - Types `OutcomeCode`, `ReasonCode`, `Facts`, `OutcomeRecord`, `GapKind`, `RecoveryRecord` as in the design. `exitCode.ts` holds the one constant table (converted 0, converted-with-gaps 0, failed 1, usage 2, refused 3) read by tests and documentation. `reasons.ts` holds the sentence templates and `scrub()` (cuts drive and root paths, `at ` stack lines, environment variable names and FFDec stderr text, truncates to 200 characters) and builds the `converted-with-gaps` sentence (N of M classes translated, E type errors, the two highest gap kinds). `gaps.ts` counts the gap kinds of D-A3 (`untranslated-class`, `class-omitted`, `untranslated-code`, `unbound-instance`, `unrecoverable-class`, `type-error`, `dropped-placement`, `flash-api-gap`), never counts `text-metrics`, `filter`, `stroke-style`, `mask`, `morph-shape`, and keeps at most 5 examples. `numbers` is `null` for a refusal before Translate.
    - Tests: `test/unit/outcomeReasons.test.ts` (create): scrub removes a Windows path, a POSIX path, a stack frame, an environment variable name and FFDec stderr text; the 200-character cut; the sentence template, including the recovery prefix and the rule that the gap part is dropped first when the sentence is too long. `test/unit/gaps.test.ts` (create): each counted kind, each non-counted kind, the 5-example cap.
    - _Requirements: 2.2, 2.3, 2.4, 2.7, 4.2, 4.7, 7.2, 16.4_

  - [x] 1.2 Add `decideOutcome(record)` in `src/outcome/outcome.ts`
    - Pure and total. Order: a classified failure (refusal or internal) decides first; else `refused nothing-translated` if and only if candidates M > 0 and translated N = 0 (after recovery); else `converted-with-gaps` if any Gap or type error; else `converted`. `reasonCode` is null if and only if the Outcome is one of the two project outcomes. `converted-with-gaps` exits 0 and there is no percentage threshold (U2; Requirements 4.11, 7.6).
    - Tests: `test/unit/decideOutcome.test.ts` (create): the four outcomes by example; both Requirement 4.12 cases with a Translation_Report fake: M = 0 (timeline-only) is `converted`, exit 0, never `refused`, and M greater than 0 with N = 0 is `refused` `nothing-translated`, exit 3; 3 of 48 translated is `converted-with-gaps`; a damaged input is never `converted`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.3, 4.5, 4.9, 4.11, 4.12_

  - [x] 1.3 Write the property tests of the outcome core
    - **Property 1: One Outcome, decided by the numbers**, **Property 5: Gap summary matches the entries**, **Property 6: Reason sentence is bounded and complete**, **Property 7: Exit code is a function of the outcome**, in `test/property/outcome.property.test.ts` (create). Generators in `test/property/gen/genRunRecord.ts` (create): facts or none, stage list, report numbers with N of M, gap list, type error count, optional classified failure.
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.3, 2.4, 4.1, 4.2, 4.3, 4.7, 4.9, 4.11, 4.12, 7.1, 7.2, 7.5, 16.4**

- [x] 2. Outcome_File: writer, parser, atomic write and `docs/outcome.md`
  - Commit area: `Pipeline` (Docs and Steering named). Verification V1. Read the design D-A8, D-A10, "Data Models" (the `docs/outcome.md` paragraph) and Properties 4 and 14. `outcomeFile.ts` is the edge file of `src/outcome/`; the serialiser and parser are pure functions in it, the write function takes an injected `fs`.
  - [x] 2.1 Add `src/outcome/outcomeFile.ts`
    - Canonical JSON through the existing `src/pipeline/canonicalJson.ts`; `formatVersion` 1; the parser rejects any other version with a message that names the version and accepts `numbers: null`; write to `outcome.json.tmp-<pid>` in the output directory then rename (D-A8); when the directory is not writable the function returns a flag and the caller still prints the Outcome_Line. `stages[].durationMs` is the only time-dependent field (D-A10). The record carries the `obfuscated` and `recovery` objects (null until Block B fills them).
    - Tests: `test/unit/outcomeFile.test.ts` (create): unknown `formatVersion` rejected with the version in the message; a partial write is never visible (rename called after the write); an unwritable directory returns the flag; no absolute path, stack or environment variable appears in a written file (scrub applied to reason, gap examples and stage names).
    - _Requirements: 2.1, 2.7, 2.9, 2.11, 5.8_

  - [x] 2.2 Write the property tests of the file format
    - **Property 4: Outcome_File round trip and canonical bytes**, **Property 14: Determinism of the Outcome_File** (two decisions and writes give equal bytes once `stages[].durationMs` is dropped), in `test/property/outcome.property.test.ts` (extend).
    - **Validates: Requirements 2.1, 2.2, 2.7, 2.9, 2.10, 11.7**

  - [x] 2.3 Add `docs/outcome.md` and its example test
    - The four outcomes, the Reason_Codes with one sentence each, the exit-code table, the Outcome_File fields, one JSON example per outcome, a note that `abcClassCount` is the number of exported `.as` files and differs by one from `swf_summary` on `redball4` (Open_Item O14), a note that `numbers` is null for a refusal before Translate, and the note of Requirement 6.3: the default run limit of 300 s exceeds the 180 s per-job kill of `web/server/options.ts`, which the web owner must align. `test/unit/outcomeDocs.test.ts` (create) extracts each fenced JSON example and compares it with the writer's output for the same record. Update `.kiro/steering/structure.md` (the `src/outcome/` directory and `docs/outcome.md`) in the same commit.
    - _Requirements: 2.8, 6.3, 7.3, 10.1, 10.2, 10.4_

- [x] 3. Facts: the pure Facts_Reader and the hostile SWF byte builder
  - Commit area: `Pipeline` (Test named). Verification V1. Read the design section "Facts_Reader" (the layout and the six-step table) and Properties 8, 9 and 10 (10 is proven in Task 7.3). New directory `src/facts/` is pure and added to the purity list. The zlib decode is passed in as a function so that `readFacts` itself imports no `node:*` module; the edge caller supplies `inflateSync` with `maxOutputLength`.
  - [x] 3.1 Add `src/facts/swfBody.ts` and `src/facts/readFacts.ts`
    - `readFacts(bytes, limits, inflate): FactsResult` as in the design table: signature check (`not-swf`), declared length above 128 MiB (`too-large`), `CWS` inflate (`Z_BUF_ERROR` or short result is `damaged`), decoded length plus 8 against the declared length (`damaged`), RECT, frame rate (8.8 fixed point), frame count, tag walk by length, an `End` tag required (`damaged`), `scriptVersion` from tag codes 72 and 82 (as3) and 12 and 59 (as1-2). `as1-2` is refused `actionscript-1-2`. Unknown tag codes are walked and ignored. The result keeps the decoded `body` and the byte ranges of tags 72 and 82, so the ABC_Name_Scan (Task 17) does not decode twice. `facts.source` lists which facts came from the header and which from FFDec; `abcClassCount` is null here and filled in Task 7.2. `ZWS` returns header-only facts (stage, rate, frame count and `scriptVersion` are null or `unknown`; U7, no LZMA decoder).
    - Add `test/support/hostileSwf.ts` (create): a byte builder for headers, RECT, tags, `End`, optional zlib, cut and byte-flip helpers. It builds files without FFDec and from byte strings; a helper that cuts a committed sample reads it from `samples/` (Requirement 5.9).
    - Tests: `test/unit/readFacts.test.ts` (create): one example per step of the design table, tag codes 12, 69, 72 and 82, a `FileAttributes` AS3 flag with no `DoABC` tag (timeline-only, converts), a `ZWS` header, the `CWS` length mismatch, the 128 MiB cap.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 5.1, 5.2, 5.3, 8.1_

  - [x] 3.2 Write the property tests of the Facts_Reader
    - **Property 8: Facts round trip over generated headers** and **Property 9: Arbitrary bytes never throw**, in `test/property/facts.property.test.ts` (create). Generators in `test/property/gen/genSwfHeader.ts` (create): signature in `FWS`, `CWS`; version 1 to 50; stage rectangle; frame rate; frame count; a valid tag list ending in `End`.
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.8, 3.9**

- [x] 4. Pipeline: fix the `SET.json` read-error message (S2)
  - Commit area: `Pipeline`. Verification V1. This is the first task that touches `src/pipeline/cli.ts`, so the fix is its own commit (Requirement 25.2). Read `src/pipeline/cli.ts` and the design table "Small findings fixed with the file" (S2) first.
  - [x] 4.1 Print the exception text and test the path
    - In `src/pipeline/cli.ts` the message of the `handwritten/SET.json` read error is a double-quoted string, so `${...}` prints literally. Print the exception text. The error is a usage-class error: exit 2, one `error [pipeline]: <text>` line.
    - Tests: `test/unit/pipelineCli.test.ts` (extend or create): an unreadable `SET.json` prints the exception text, contains no literal `${`, and returns 2.
    - _Requirements: 5.6, 25.2, 25.5_

- [x] 5. Pipeline: label the `[translate]` console line (S3)
  - Commit area: `Pipeline`. Verification V1. First task that touches that line in `src/pipeline/pipeline.ts`; own commit (Requirement 25.3). Read the design finding F17 and S3.
  - [x] 5.1 Label the pre-gate count and update the tests that match the old text
    - Keep the line and its prefix, and label the counts as taken before the gate: `[translate] ok (N classes before type check: ...)`. The numbers after the gate stay in the Translation_Report. The web server reads only `^Done: ` and `^error [stage]: ` lines, so no file under `web/` changes. Update the existing tests that match the old text in this commit.
    - Tests: `test/unit/pipelineLines.test.ts` (create or extend): the exact text of the line, and that the `[unpack] ok` and `[typecheck]` lines are unchanged.
    - _Requirements: 2.6, 25.3, 25.5_

- [x] 6. Unpack and Pipeline: child registry and process-tree kill (S1)
  - Commit area: `Unpack` (Pipeline and Verify named). Verification V1. First task that touches `src/unpack/`; own commit (Requirement 25.1). Read the design "Limits and process tree", finding F10, S1 and Open_Item O1. `src/pipeline/processTree.ts` is new; the `taskkill` code moves from `src/verify/edge/launchChromium.ts`, which then imports it. No timeout is raised.
  - [x] 6.1 Add `src/pipeline/processTree.ts`
    - `killTree(pid)`: Windows `taskkill /PID <pid> /T /F` without a shell; elsewhere `process.kill(-pid, 'SIGKILL')` for a detached child, else `child.kill('SIGKILL')`. A registry with `track(child)` and `killAll()` that kills only live pids.
    - _Requirements: 6.6, 6.15_

  - [x] 6.2 Register every child and kill the tree on a timeout
    - `spawnFfdec` registers its Java process and calls `killTree` on its timeout (today `child.kill()` ends only Java). The Chromium launcher and the Replay child (`replay.ts`) register too, so a limit in Verify kills Chromium. A blocked synchronous stage cannot be interrupted (Open_Item O1, U9: no supervisor process); the commit body states this and gives the longest synchronous stretch measured on `redball4` (convert 39.9 s) when the file is present.
    - _Requirements: 6.6, 6.15, 7.7, 25.1_

  - [x] 6.3 Test the registry and the real kill path
    - `test/unit/processTree.test.ts` (create): the registry tracks and kills only live pids. `test/e2e/killTree.e2e.test.ts` (create): spawn a real short `node` process that sleeps and has a grandchild, through `spawnFfdec`'s own timeout path with a fake jar command; after the timeout check by `process.kill(pid, 0)` that both are gone; Windows and POSIX branches.
    - _Requirements: 6.14, 6.15, 25.5_

- [x] 7. Pipeline: Outcome wiring, classifier, Facts stage and numbers from the reports
  - Commit area: `Pipeline` (Unpack and Test named). Verification V1. Read the design "Architecture", "Run record and decision", D-A1, D-A2, D-A3, D-A9, findings F11, F16 and F17, and the existing `src/pipeline/{cli,pipeline,errors}.ts` and `src/unpack/{unpack,spawnFfdec,errors,swfSniff}.ts`. `runPipeline` keeps its signature (stages and io injected, returns the exit code). Every existing progress line stays, because `web/server/jobs.ts` reads `^Done: ` and `^error [stage]: `; no file under `web/` changes.
  - [x] 7.1 Add `src/outcome/classifyError.ts` and wire `decideOutcome` into `runPipeline`
    - Error to Outcome by the table of D-A2, keyed on the error `code` and the stage: `INVALID_SWF` refused `not-swf`; `NOT_AS3` refused `actionscript-1-2`; `FFDEC_TIMEOUT` refused `time-limit`; `FFDEC_EXIT` thrown by the Unpack stage refused `damaged` (reason "the file could not be read", no FFDec text; the text goes to `ffdec-<Reference_Id>.log` in Task 8.1); `JAVA_NOT_FOUND` and `FFDEC_NOT_FOUND` failed (reason says a required component is missing, no tool name); `MISSING_EXPORT`, `XML_VERSION`, `MISSING_HEADER_VALUE`, every error of our own code (`TypeError`, a bug in Translate) and every non-Error value `failed internal-error`, never `damaged`. The classifier checks the error class and the stage, never the message text. An `FFDEC_EXIT` thrown by a recovery step is not an Outcome (Task 18.2). `runPipeline` collects the `RunRecord` and calls `decideOutcome` once; it prints `Done: <dir>` only for the two project outcomes, then the Outcome_Line as the last line of standard output, then returns the exit code of the table.
    - Tests: `test/unit/classifyError.test.ts` (create): every code of the table, a non-Error thrown value, an error with an unknown code, an `FFDEC_EXIT` at Unpack against a `TypeError` at Unpack.
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 2.5, 2.6, 4.4, 5.12, 5.13, 7.1_

  - [x] 7.2 Run the Facts_Reader first, take numbers from the reports, fill `abcClassCount`
    - Add a `facts` stage that reads the file (size check first: above the size limit is `too-large` before any FFDec process; the limit is wired in Task 10.1, a constant stands in until then) and refuses `not-swf`, `damaged`, `actionscript-1-2` and `too-large` with no FFDec process started. After the type-check gate, `numbers` is read from the Translation_Report and the Unsupported_Feature_List and never from the `[translate]` console line (on `redball4` the line said 3/18/35 against 3/12/41 in the report); `droppedPlacements` comes from a new `stats.placementsDropped` that Convert returns (D-A3; no change to `unsupported-features.json` or any golden). `abcClassCount` is the number of `.as` files under `scripts/` after Unpack (A7).
    - Tests: `test/unit/pipelineFacts.test.ts` (create) with stage fakes: each refusal starts no FFDec fake; the Outcome numbers equal the report, not the console line; `droppedPlacements` equals the stat; `abcClassCount` equals the exported file count.
    - _Requirements: 2.3, 3.1, 3.4, 3.5, 3.6, 3.10, 4.8, 6.4_

  - [x] 7.3 Write the property tests of classification and cuts
    - **Property 3: Error classification keeps FFDec and our own errors apart** (an `FfdecExitError` at Unpack gives `refused damaged` with none of its stderr text in the Outcome_File, the Outcome_Line or the reason; every other error gives `failed internal-error`; no `failed` Outcome has the reason code `damaged`) in `test/property/outcome.property.test.ts` (extend), and **Property 10: A cut SWF is never converted** (any cut length 0 to length minus 1 of a generated and of a committed SWF with stage fakes: `refused`, `not-swf` below 8 bytes and `damaged` otherwise) in `test/property/facts.property.test.ts` (extend).
    - **Validates: Requirements 4.5, 5.1, 5.2, 5.3, 5.4, 5.10, 5.12, 5.13**

- [x] 8. Pipeline: Failure_Log, Reference_Id, FFDec log and the exit-2 cases
  - Commit area: `Pipeline`. Verification V1. Read the design D-A6, D-A9 and finding F11.
  - [x] 8.1 Failure_Log, Reference_Id and `ffdec-<Reference_Id>.log`
    - A caught internal error writes the stack to `failure-<Reference_Id>.log` and prints `error [pipeline]: internal error, reference <id>`; no stack on standard output or standard error. `Reference_Id` is the first 8 hex digits of `sha256(inputSha256 + "\n" + stage + "\n" + errorName + "\n" + errorMessage)` (D-A6). An `FFDEC_EXIT` at Unpack writes the FFDec message to `ffdec-<Reference_Id>.log` (error name `FfdecExitError`) and nothing of it enters the Outcome_File, the Outcome_Line or the reason.
    - Tests: `test/unit/pipelineFailure.test.ts` (create): the same failure gives the same Reference_Id, a different stage gives a different one; the stack appears only in the Failure_Log; the FFDec text appears only in the FFDec log; an own `TypeError` at Unpack is `failed` and writes a Failure_Log, not an FFDec log.
    - _Requirements: 5.5, 5.7, 5.12, 5.13_

  - [x] 8.2 Exit-2 cases and the unwritable directory
    - The two Emit refusals (`OUTPUT_DIR_NOT_EMPTY`, `UNSAFE_FORCE_TARGET`) leave `REFUSAL_CODES` handling and return 2 with one `error [pipeline]:` line and no Outcome_File (D-A9, finding F11); usage and path errors stay outside the Outcome set. If the Outcome_File cannot be written the Outcome_Line is still printed and the exit code is the Outcome's.
    - Tests: `test/unit/pipelineCli.test.ts` (extend): the exit-2 cases write no Outcome_File and print one line; the unwritable-directory case still prints the Outcome_Line last.
    - _Requirements: 1.9, 5.8_

  - [x] 8.3 Write the property test of the run
    - **Property 2: A fault at any stage still ends in one valid Outcome** (a stage fake throws any error class including non-Error values at any stage, with generated facts: exit code in the table, `outcome.json` parses, `facts` present when the Facts_Reader ran, the Outcome_Line is the last line, stack text only in the Failure_Log), in `test/property/outcome.property.test.ts` (extend). The stage list includes `recover` as a stage name (the stage itself arrives in Task 18).
    - **Validates: Requirements 1.6, 1.7, 1.8, 2.5, 3.6, 5.5, 5.7**

- [x] 9. Steering: correct `tech.md` Scene_JSON formatVersion (S4)
  - Commit area: `Steering`. Verification V1 (no code changes; run `npm run typecheck`). First task that touches `.kiro/steering/tech.md`; own commit (Requirement 25.4). Read the design finding F12 and S4.
  - [x] 9.1 State the formatVersion the code writes
    - Replace "Scene_JSON is formatVersion 2" by the version the code writes today (3; the reader accepts 2 and 3) and note that version 4 arrives with buttons in Block C. Nothing else in `tech.md` changes in this commit. There is no machine test; the commit body names the files read (`template/runtime/scene.ts`).
    - _Requirements: 10.4, 25.4_

- [x] 10. Pipeline: Run_Limits, injectable clock and the guard
  - Commit area: `Pipeline` (Unpack and Verify named). Verification V1. Read the design "Limits and process tree", D-A4, D-A5, D-A7, findings F1 and F10, and Properties 11 and 12. `src/pipeline/limits.ts` is pure (resolver). No timeout of any existing test or stage is raised.
  - [x] 10.1 Add `src/pipeline/limits.ts` and the CLI options
    - `resolveLimits({ options, env })`: option beats variable beats default; a value that is not a positive integer is a usage error (exit 2, Requirement 6.8). Options `--max-size <MiB>`, `--run-limit <seconds>`, `--stage-limit <seconds>`; variables `SWF_RESURRECT_MAX_SIZE_MIB`, `SWF_RESURRECT_RUN_LIMIT_S`, `SWF_RESURRECT_STAGE_LIMIT_S`. Defaults (U1): 20 MiB (equal to `web/server/upload.ts`), 300 s per run, 60 s base per stage; the weights are recover 2, unpack 2, convert 1, translate 1, emit 1, gate 1, verify 3. The reasons for each default go into `docs/outcome.md`, with the note that the 300 s default exceeds the web server's 180 s kill. The Facts stage of Task 7.2 now reads the size limit from here.
    - Tests: `test/unit/limits.test.ts` (create): precedence, a non-integer value, a zero, the weight table including `recover` 2.
    - _Requirements: 6.1, 6.2, 6.3, 6.8, 6.13_

  - [x] 10.2 Add the clock, `RunGuard` and `runStage`
    - `src/pipeline/guard.ts`: `Clock { now, setTimeout, clearTimeout }` with a real implementation and a fake for tests; `guard.runStage(name, fn)` records name, result and duration, checks the run deadline before starting, races the stage with an allowance timer (base times weight, D-A4), and on a limit calls `guard.killAll()` (the registry of Task 6), abandons the stage promise, and returns a `time-limit` refusal whose reason names the stage and the limit that applied (D-A5). The wait for a `PIPELINE_SLOTS` slot is a test-side wait and never enters the clock (Requirement 6.10). The recovery steps run inside the `recover` stage and count towards the run limit and the stage limit of `recover`, not of `unpack`. Verify receives the registry through the existing `launchChromium` call. `main` ends with `process.exit(code)` after flushing standard output so an abandoned stage does not keep the loop alive.
    - Tests: `test/unit/guard.test.ts` (create) with the fake clock: allowance exceeded, run limit exceeded, a stage that finishes in time, the written `limits` equal the resolved ones, the `recover` allowance is 120 s by default.
    - _Requirements: 6.5, 6.9, 6.10, 6.11, 6.13_

  - [x] 10.3 Write the property tests of the limits, and update the steering
    - **Property 11: Limit resolution** and **Property 12: Time limit if and only if a duration exceeds its allowance** (fake clock, generated durations over all seven stages including `recover`, stage limit, weights and run limit: `refused time-limit` if and only if a stage duration exceeds its weighted allowance or the sum exceeds the run limit; the reason names the stage and the limit), in `test/property/limits.property.test.ts` (create). Update `.kiro/steering/tech.md` (the three options, the three variables, the Outcome_File) and `structure.md` (`src/facts/`, `src/pipeline/guard.ts`, `src/pipeline/processTree.ts`) in this commit.
    - **Validates: Requirements 6.1, 6.5, 6.8, 6.10, 6.12, 6.13, 10.4**

- [x] 11. Pipeline and Emit: cleanup plan and the Emit write journal
  - Commit area: `Pipeline` (Emit named). Verification V1. Read the design "Cleanup plan", D-A5 and Open_Item O6 (Emit was not read in the design: read `src/emit/emit.ts` first). `src/pipeline/cleanup.ts` is pure and added to the purity list.
  - [x] 11.1 Add `src/pipeline/cleanup.ts` and the Emit `onWrite` callback
    - `planCleanup({ preExisting, writtenByRun, keep })` returns `writtenByRun \ preExisting` minus the Outcome_File, the reports, the Failure_Log and `ffdec-<Reference_Id>.log`. `preExisting` is the listing of the output directory taken after the precheck and before the first write. Emit gets an optional `onWrite(path)` callback so the pipeline keeps a journal when Emit throws part-way. On `refused` and `failed` the work directory (which holds the recovery copy) is removed unless `--keep-work` or `--work-dir` was given (Requirement 9.1). An output directory refused before the run (the two Emit refusals, exit 2) is left untouched.
    - Tests: `test/unit/cleanup.test.ts` (create): a foreign file stays; the Outcome_File, reports and logs stay; the journal covers an Emit that throws on the third file; `--keep-work` keeps the work directory.
    - _Requirements: 4.6, 6.7, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 11.2 Write the property test of the cleanup plan
    - **Property 13: Cleanup removes only what the run wrote**, in `test/property/limits.property.test.ts` (extend): for any pre-existing set and any set written by the run, the plan is a subset of `written \ preExisting`, contains none of the protected files, and leaves every pre-existing file.
    - **Validates: Requirements 4.6, 6.7, 9.2, 9.3**

- [x] 12. Pipeline and Test: signals, hostile fixtures and the sample Outcomes
  - Commit area: `Pipeline` (Test named). Verification V1. Read the design D-A7, "Error Handling" and Requirement 8.
  - [x] 12.1 Handle `SIGINT` and `SIGBREAK`
    - `main` installs handlers that call `guard.abort('signal')`, kill the registered children, write a `failed` Outcome_File with the reason `run stopped by signal`, and exit 1. On Windows `SIGTERM` is not deliverable to a handler, so a kill by the web server is not catchable (Open_Item O5; read the Node documentation page before this task and record the result in the commit body). No supervisor process (U9).
    - Tests: `test/e2e/signal.e2e.test.ts` (create): spawn the real CLI on a stage fake that sleeps, send `SIGINT` (Windows: `SIGBREAK` where `SIGINT` cannot be sent to a child), check exit 1, an Outcome_File with the reason, and that no child process remains.
    - _Requirements: 6.6, 7.4_

  - [x] 12.2 Add the Hostile_Fixture matrix
    - `test/e2e/hostileFixtures.e2e.test.ts` (create), using `test/support/hostileSwf.ts`: an empty file, a text file, a valid signature and no body, a cut file, a damaged compressed stream (one byte changed in a `CWS` stream), an AS1/AS2 file (the fake spawner must not be called), an AS3 `FileAttributes` with no `DoABC` tag, a file above a lowered size limit, `encrypted` with a fake FFDec result (Open_Item O3: no real encrypted file was measured and no FFDec signal is known), `time-limit` with the fake clock, a fake FFDec that exits with an error at Unpack (`refused damaged`, FFDec text only in `ffdec-<Reference_Id>.log`, exit 3), a fake of our own `TypeError` at Unpack (`failed`, exit 1, never `damaged`), a timeline-only SWF with 0 Candidate_Classes (`converted`, exit 0, never `refused`), and a SWF with at least 1 Candidate_Class and 0 translated (`refused nothing-translated`, exit 3). Each row asserts Outcome, reason code, exit code, the Outcome_Line as the last line, and that no FFDec process started for the Facts refusals. The measurements of Requirement 8.4 (AS1/AS2, encrypted or packed, over the size limit, very long conversion) are written into the commit body, and any that needs an unavailable file is named as an Open_Item.
    - _Requirements: 3.4, 3.5, 4.5, 4.12, 5.1, 5.2, 5.3, 5.9, 5.12, 5.13, 6.4, 6.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.7_

  - [x] 12.3 Check the committed samples and the local files
    - `test/e2e/sampleOutcomes.e2e.test.ts` (create): over the Shared_Run_Cache runs, each committed sample ends `converted` or `converted-with-gaps` and its `outcome.json` parses (Requirement 4.10). `test/e2e/localFiles.e2e.test.ts` (create): for each of `empty.swf`, `text.swf`, `truncated.swf` and `redball4.swf` that is present under `.work/judge-test/`, run the CLI and record Outcome, reason code and exit code (`truncated.swf` must be `refused damaged`, Requirement 5.11); every case skips with a message when its file is absent; the test writes only under `.work/` and quotes no class name. `redball4.swf` gets the numbers only. Check that no `.work` or fixture path is tracked (`git status`).
    - _Requirements: 4.10, 5.11, 8.6, 11.9, 23.4_

- [ ] 13. Checkpoint 1: Block A done
  - STOP. Follow the Checkpoint procedure of the rules. Block A covers Requirements 1 to 11, 12 and the small findings S1 to S4.
  - Run the full suite `npm test -- --run`, hand the review to the `fidelity-reviewer` agent, commit its report as `.kiro/specs/robustness/reviews/checkpoint-1.md`, and act on its findings in a new commit before reporting.
  - The report holds the items of the Checkpoint procedure (real `git status`, commits since the start, per-sample table, both Play_Tests, Outcome of every Hostile_Fixture, new Named_Limits, Open_Items, Warm_Suite_Time, Credits_Line against the Block A share of about 70 and the threshold of 93). It also states (Requirement 12.2): the Outcome, reason code and exit code of `empty.swf`, `text.swf`, `truncated.swf` and `redball4.swf` where present (the last as numbers only); the longest synchronous stretch measured (Open_Item O1); the four small findings with the commit of each; and the stage times of `redball4.swf` under the default limits when present, as the first reading of Requirement 6.16.
  - _Requirements: 12.1, 12.2, 12.3, 24.1 to 24.4_

### Block B: recover and stub (about 90 credits; stop and report above 120)

- [ ] 14. Translate and Shim: the Flash_API_Table and generated stubs
  - Commit area: `Translate` (names Shim and Build; template changes, so verification V2). Block B starts here: restate the Block B share of about 90 credits; Requirement 13.1 allows the start only after Checkpoint 1 is accepted. Read the design section "Flash_API_Table and stubs" (the policy rule, the policy table, "Mechanism", "Shipping") and Properties 19 and 20. Run the Flash behaviour rule of the Overview for any stub whose return value or event behaviour is a Flash claim.
  - [ ] 14.1 Add `src/translate/flashApiTable.ts`
    - Entries `{ qualified, policy: 'stub' | 'real' | 'gap', reason, canStall?, members? }` with `MemberSig` as in the design, where `neutral` is a primitive neutral value or `{ stubObject: '<Class>' }` for a member that returns an object in Flash; `policyOf(qualified, member?)` is total and returns `absent` for an unknown class. Policy per the design table: `stub` for `Sound`, `SoundChannel`, `SoundTransform`, `SoundMixer`, `URLRequest`, `navigateToURL`, `URLLoader`, `URLVariables`, `LocalConnection`, `Security`, `ExternalInterface`, `Loader`, `SharedObject`; `real` for `flash.geom.Point`; `gap` for `ByteArray`, `BitmapData` and `Bitmap` data calls, `XML`, `XMLList`, `Matrix`, `ColorTransform`, `ApplicationDomain`, `getDefinitionByName`, `Capabilities`, `NetConnection`, `NetStream`, `Video`, `Socket`, `XMLSocket`, `FileReference`, `Camera`, `Microphone`, `Context3D`, each with its reason. `canStall: true` (No_Event_Stub) on `Sound`, `SoundChannel`, `URLLoader`, `Loader` and `LocalConnection`. Members of a `stub` class that are not in its entry are `absent` and stay visible gaps. No game or sample name in the table.
    - Tests: `test/unit/flashApiTable.test.ts` (create): each class has a policy and a reason; an unknown class is `absent`; a member not in a stub entry is `absent`; each No_Event class has `canStall`.
    - _Requirements: 17.1, 17.5, 17.6, 17.7, 17.13_

  - [ ] 14.2 Add `scripts/gen-api-stubs.ts`, `stubCall` and the generated stubs
    - `npm run gen:api-stubs` writes `template/shim/stubs/<Class>.ts` from the `stub` entries, each member body `stubCall('<Class>.<member>', neutral)`. `stubCall` records one Named_Limit `api-stub:<Class>.<member>` the first time (a `Set`), and returns the neutral value typed by the signature (0, empty string, false, null, empty array); a `{ stubObject }` neutral returns a lazily created non-null singleton per owner object, built through the stub class itself, so `Sound.play()` returns a `SoundChannel` stub and `SoundChannel.soundTransform` is non-null; a constructor records `api-stub:<Class>.constructor`; none throws and none has an effect outside the page. Every class marked `canStall` also records `api-stub-no-event:<Class>` once, at its first use, with the text that the class dispatches no completion event. `Loader` and `URLLoader` never dispatch `complete`, `ioError` or `progress`; `Sound` and `SoundChannel` never dispatch `soundComplete`; `SharedObject.getLocal` returns an object whose `data` lives in memory for the life of the page, no browser storage; `ExternalInterface.available` is false. The stubs ship in the Shim (U3, A9): export all from `template/shim/index.ts`; Emit does not generate or filter them. Run `npm run gen:shim-members` and stage the regenerated table; list every stub in `ADDED_APIS.md` with the Fixture_Class line that needs it; the generated files are committed with the table; add the `gen:api-stubs` command to `.kiro/steering/tech.md` common commands in this commit.
    - Tests: `test/unit/apiStubs.test.ts` (create): each class's behaviours above, non-null returned objects, no event dispatched; `test/unit/shimNames.test.ts` (extend): every stub class is in `SHIM_AS3_NAMES`.
    - _Requirements: 17.2, 17.3, 17.4, 17.7, 17.8, 17.10, 17.12_

  - [ ] 14.3 Write the property tests of the table and stubs
    - **Property 19: Table lookup and stub generation** (a stub class is generated if and only if its policy is `stub`; `gap`, `real` and `absent` pairs never produce a stub; every member of every `stub` entry exists in the Shim_Member_Table) and **Property 20: A stub records once, returns a typed value, and flags the stalls** (any stub member, 1 or more calls: exactly one `api-stub:` entry, the neutral value each time, a non-null stub object where Flash returns an object, no throw; a `canStall` class records exactly one `api-stub-no-event:<Class>` entry and dispatches no event), in `test/property/apiStubs.property.test.ts` (create). Add a Fixture_Class translation test in `test/unit/apiStubsTranslate.test.ts` (create): a class calling a stub member type-checks and the first call records one Named_Limit.
    - **Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.11**

- [ ] 15. Shim: `flash.geom.Point`
  - Commit area: `Shim`. Verification V2. Read the design section "Point" (the formula table) and Properties 21 and 22. The formulas were read in Ruffle `core/src/avm2/globals/flash/geom/Point.as` at the pinned commit; say so in the commit body and add them to `flash-behaviour.md`.
  - [ ] 15.1 Add `template/shim/Point.ts`
    - Members `x`, `y`, constructor `(x = 0, y = 0)`, `length`, `add`, `subtract`, `clone`, `equals`, `normalize(thickness)` (length 0 leaves the point unchanged), `offset`, static `distance`, `interpolate` (`b.x - (b.x - a.x) * f`, so `f = 1` gives `a`), `polar`, `copyFrom`, `setTo` (U8) and `toString` (`(x=1, y=2)`). Export from `index.ts`; the Flash_API_Table entry is `real` with no members and no stub class exists; regenerate and stage the member table; list in `ADDED_APIS.md`.
    - Tests: `test/unit/point.test.ts` (create): examples for every member, `toString`, `normalize` on the origin.
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.10_

  - [ ] 15.2 Write the property tests of `Point`
    - **Property 21: Point algebra** (`a.add(b).subtract(b)` equals `a`; `distance` symmetric; `interpolate(a, b, f)` on the segment with `f = 1` giving `a` and `f = 0` giving `b`) and **Property 22: Point.normalize** (length after `normalize(t)` equals `t` within 1e-9 relative error; the origin unchanged), in `test/property/point.property.test.ts` (create), with finite doubles and a model built from the Ruffle formulas.
    - **Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.7, 18.8, 18.9**

- [ ] 16. Translate: policy lookup, `flash-api-gap` problems, stub-dependency count and the stall listing
  - Commit area: `Translate` (Pipeline and Verify named). Verification V1. Read the design D-A3 and the end of "Flash_API_Table and stubs" ("Shipping"). General rule only; no sample name.
  - [ ] 16.1 Report gaps by policy
    - When a translated class uses a Flash class or member that is neither in the Shim nor in the table, or whose policy is `gap`, the Translation_Report names the class and member as a `flash-api-gap` problem, no stub is generated, and the type error stays visible (Requirement 17.5). The Outcome's `gaps` count `flash-api-gap`.
    - Tests: `test/unit/flashApiGap.test.ts` (create) with Fixture_Classes: a `gap` class, an unknown class, a member missing from a stub entry.
    - _Requirements: 17.5, 17.13_

  - [ ] 16.2 Count stub-dependent classes and list the stubs that can stall
    - A pure scan of each translated class's resolved Shim imports against the table's `stub` set gives the count of classes whose type check depends on a stub; it goes into the Outcome_File. The Fidelity_Report lists the `api-stub:` and `api-stub-no-event:` limits that the Replay observed and states which of the listed stubs can stall a game (`canStall` in the table). Update `docs/outcome.md` and its example test for the new field.
    - Tests: `test/unit/stubDependents.test.ts` (create); `test/unit/report.test.ts` (extend): the Fidelity_Report lists observed `api-stub:` and `api-stub-no-event:` limits and marks the stalling stubs.
    - _Requirements: 17.7, 17.9_

- [ ] 17. Facts and Recover: the ABC_Name_Scan and the obfuscation verdict
  - Commit area: `Pipeline` (Test named). Verification V1. Read D-B2, finding F6, finding F15, Open_Item O15 and Properties 15 and 16. Before coding read the AVM2 overview chapter on the constant pool and compare it with the layout in D-B2 (O15), and record the result in the commit body. `src/facts/abcNames.ts` and `src/recover/detect.ts` are pure and added to the purity list.
  - [ ] 17.1 Add `src/facts/abcNames.ts` and extend the byte builder
    - `scanAbcNames(bytes)`: from the ranges that `readFacts` kept, take the ABC bytes of every `DoABC` (tag 72: the whole payload) and `DoABC2` (tag 82: skip a u32 flags field and a zero-terminated name) tag, walk the `cpool_info` as D-B2 lists (ints, uints, doubles, strings, namespaces, namespace sets, multinames of every kind), collect the strings used as multiname names, and count those that do not match `^[\p{L}_$][\p{L}\p{N}_$]*$` (flag `u`). Namespace names and literal strings are not counted. An unknown multiname kind, a read past the end, or no ABC tag gives `{ obfuscated: false }` with the counts read so far and never throws. Extend `test/support/hostileSwf.ts` with a constant-pool builder that places a known number of valid and invalid multiname names, literal strings and dotted namespace names.
    - Tests: `test/unit/abcNames.test.ts` (create): each multiname kind, a tag 72 and a tag 82 payload, a truncated pool, no ABC tag, the real counts of F15 on the committed samples (0 invalid names; the samples are cut from `samples/`) and on `redball4.swf` when present (numbers only, skips otherwise).
    - _Requirements: 14.1, 14.4, 14.5, 14.7_

  - [ ] 17.2 Add `src/recover/detect.ts` and record the verdict
    - Verdict from the scan counts: `obfuscated` when `invalidNames / namesScanned >= 0.20` and `invalidNames >= 5` (D-B2; the threshold sits between 0 of 21 to 539 names in the committed samples and 1 537 of 2 919 on the local file; the numbers go in the commit body, not class names). The pipeline calls the scan and the verdict after the Facts stage and before the first FFDec call, and writes `obfuscated: { detected, namesScanned, invalidNames, sourceSignals: null }` to the Outcome_File. The 20 % and the floor of 5 are chosen, not measured against a population (Open_Item O2). Update `docs/outcome.md` and its example test.
    - Tests: `test/unit/obfuscationDetect.test.ts` (create): the 20 % boundary, the floor of 5, a committed-sample-like set gives not obfuscated, a small file with one odd name gives not obfuscated.
    - _Requirements: 14.2, 14.3, 14.5, 14.7_

  - [ ] 17.3 Write the property tests of the scan and the verdict
    - **Property 15: Obfuscation verdict over names** and **Property 16: ABC_Name_Scan reads what a constant pool holds, and never throws** (generated pools wrapped as tag 72 and tag 82 payloads; the scan returns the number of multiname names and invalid names the generator placed and ignores namespace names and literal strings; any byte string and any truncation gives a result without throwing and `obfuscated: false` when the pool cannot be read to the end of the multiname table), in `test/property/recover.property.test.ts` (create) and `test/property/facts.property.test.ts` (extend). Generators in `test/property/gen/genAbcPool.ts` (create).
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6**

- [ ] 18. Pipeline: recovery on a copy, then one Unpack
  - Commit area: `Pipeline` (Unpack named). Verification V1. Read D-B1, D-B3 to D-B7, the findings F6 and F7, the `RecoveryRecord` type and Properties 17 and 18. Before coding read the options from the installed FFDec: `java -jar tools/ffdec/ffdec-cli.jar -help renameInvalidIdentifiers` and `-help deobfuscate` (26.4.0), and record them and the FFDec version in the commit body. The options are `-renameInvalidIdentifiers typeNumber <in> <out>` then `-deobfuscate max <in> <out>`; `randomWord` is rejected because its names may differ between runs. There is no keep-if-better rule and no baseline (D-B5; A6 is rejected).
  - [ ] 18.1 Add `src/recover/recover.ts` (edge) and the copy chain
    - The chain lives in `<work>/recovery/`: `in.swf` (byte copy of the input), `renamed.swf`, `recovered.swf`. Each FFDec call keeps its existing 60 s per-call limit and runs through `spawnFfdec`, so its process is registered and its tree is killed on a timeout. `args.swfPath` is untouched and Verify keeps reading the original, so Overall_Match compares with the original (Requirement 15.2). If the copy cannot be made, record `recovery.skipped = 'copy-failed'` and go on as 18.2 says.
    - Tests: `test/unit/recoverChain.test.ts` (create) with a fake FFDec spawner that records its calls and arguments: the order is rename on the copy, then deobfuscate on the renamed file; the input SHA-256 is identical before and after (Requirement 15.4); the copy-failed case.
    - _Requirements: 15.1, 15.2, 15.4, 16.1, 16.2, 16.3_

  - [ ] 18.2 Wire the order: scan, recover stage, one Unpack, fallback
    - In `runPipeline` (stage `recover`, weight 2, run through `guard.runStage`): if the verdict of Task 17.2 is not obfuscated, no copy and no recovery call are made (Requirement 16.9) and Unpack runs once on the original; if it is obfuscated, the recover stage runs and then Unpack runs once, on `recovered.swf`, followed by Convert and Translate on that output. Unpack never runs on the original before the two steps. If a step fails (an FFDec error or timeout, or the copy cannot be made), an `FFDEC_EXIT` in a recovery step is not an Outcome: the pipeline records `recovery.fallback`, and unpacks the original once only if the remaining run time is at least the unpack allowance (2 times the stage base, 120 s by default); otherwise the Outcome is `refused time-limit`. Under no path are there two Unpack calls.
    - Tests: `test/unit/recoverOrder.test.ts` (create) with fake spawner and fake clock: not obfuscated gives one Unpack on the input and no rename or deobfuscate call; obfuscated gives rename, deobfuscate, one Unpack on the recovered copy; a failed rename or deobfuscate with enough time gives one Unpack on the original and `fallback` true; the same with too little time gives `refused time-limit`.
    - _Requirements: 6.10, 15.3, 16.1, 16.3, 16.5, 16.9_

  - [ ] 18.3 `RecoveryRecord`, Unrecoverable_Class and the Named_Limit
    - The Outcome_File gets the `recovery` object (`attempted`, `skipped`, `failedStep`, `fallback`, `renamedIdentifiers` counted by running the pure scan on the renamed copy and subtracting `invalidNames`, `deobfuscated`, `candidateClasses`, `recoveredClasses`, `unrecoverableClasses`) and the reason sentence `obfuscated: names renamed, N of M classes recovered`; the sentence says the result was recovered and never claims it improved anything. After Unpack of the recovered copy, each Candidate_Class that still holds `Â§Â§push` or `Â§Â§pop` is an `unrecoverable-class` entry in the Unsupported_Feature_List with the message that the decompiled source is not readable after deobfuscation; the count goes to `recovery.unrecoverableClasses` and to `obfuscated.sourceSignals`. A translated recovered copy records the Named_Limit `obfuscation-recovered`. Update `docs/outcome.md` and its example test.
    - Tests: `test/unit/recoverRecord.test.ts` (create): the record fields, the skip and failed-step values, the unrecoverable entry, the Named_Limit, the sentence for a recovered run.
    - _Requirements: 13.2, 13.3, 14.5, 16.4, 16.5, 16.7, 16.8_

  - [ ] 18.4 Write the property tests and measure the local file
    - **Property 17: Recovery order, one Unpack, and fallback** (fake FFDec whose rename, deobfuscate and unpack calls each succeed or fail, any remaining time: not obfuscated gives no rename or deobfuscate call and one Unpack on the input; obfuscated gives rename on the copy, deobfuscate on the renamed copy, one Unpack on the recovered copy; a failed step gives one Unpack on the original with `fallback` true if the remaining time is at least the unpack allowance, else `refused time-limit`; never two Unpack calls) and **Property 18: Recovery is deterministic and leaves the input alone** (a fake FFDec that renames by a fixed rule: byte-equal translated files and an equal renamed-names list across two runs, input SHA-256 unchanged, Verify receives the input path), in `test/property/recover.property.test.ts` (extend). If `redball4.swf` is present, a test that skips otherwise runs the Pipeline with the default limits and records, as numbers only and without a class name: the Outcome, the wall-clock time of every stage, the share of the 300 s run limit used, the Candidate_Classes, translated, clean, loose, unsupported, omitted, type errors, `Â§Â§push` and `Â§Â§pop` lines left, and the unresolved names of the brief (`Point`, `URLRequest`, `navigateToURL`, `Security`, `Loader`, `LocalConnection`) (Requirements 6.16, 16.10; Open_Items O7, O8, O13). It also hashes the recovered file of two real FFDec runs (Open_Item O7). The expected Outcome under the defaults is `converted-with-gaps` (U1); if it is not, the commit body says so and Checkpoint 2 reports it as a finding. Record the numbers in the commit body for Checkpoint 2.
    - **Validates: Requirements 6.16, 15.1, 15.3, 15.4, 16.1, 16.3, 16.5, 16.6, 16.10**

- [ ] 19. Checkpoint 2: Block B done
  - STOP. Follow the Checkpoint procedure of the rules. Block B covers Requirements 13 to 19.
  - Run the full suite `npm test -- --run`, hand the review to the `fidelity-reviewer` agent, commit its report as `.kiro/specs/robustness/reviews/checkpoint-2.md`, and act on its findings in a new commit before reporting. Tasks 14 and 15 changed `template/`, so the score floor tests are part of the full suite and the per-sample table shows every sample unchanged or higher.
  - The report holds the items of the Checkpoint procedure (real `git status`, commits since Checkpoint 1, per-sample table, both Play_Tests, Outcome of every Hostile_Fixture, new Named_Limits, Open_Items, Warm_Suite_Time, Credits_Line against the Block B share of about 90 and the threshold of 120). It also states (Requirement 19.2, 19.3): as numbers only and without a class name, the Outcome of `redball4.swf` when present under the default limits, which is expected to be `converted-with-gaps` (Candidate_Classes, translated, clean, loose, unsupported, omitted, type errors, `Â§Â§push` and `Â§Â§pop` lines left, unresolved Flash names), the wall-clock time of each stage including `recover` and the one Unpack of the recovered copy, and the share of the 300 s run limit used; the Named_Limits added by Block B (`api-stub:`, `api-stub-no-event:`, `obfuscation-recovered`); and the Open_Items of Requirements 16 and 17 (O2, O7, O8, O12, O13, O15).
  - _Requirements: 6.16, 19.1 to 19.4, 24.1 to 24.4_

### Block C: buttons (about 60 credits; stop and report above 80)

- [ ] 20. Convert: button symbols and Scene_JSON 4
  - Commit area: `Convert`. Verification V2 (`template/runtime/scene.ts` changes). Block C starts here: restate the Block C share of about 60 credits. Read the design "Block C: buttons", "Convert" (the XML-name table), D-C7, findings F2, F3 and F12, and Property 23. The U5 decision lifts the `UNVERIFIED` stop for `DefineButtonTag`; any other button XML name beyond the design's table is a stop.
  - [ ] 20.1 Verify the button XML names
    - Use `swf_find_tags` on `redball4.swf` (when present) for `DefineButton2Tag` and its `BUTTONRECORD` attributes, and write the generated round trip (`test/support/buttonSwf.ts`, created here: an XML skeleton with shapes, one `DefineButtonTag` and one `DefineButton2Tag`, run through `-xml2swf` and `-swf2xml`) for `DefineButtonTag`. Update `src/convert/ffdecXml.ts` so `DefineButtonTag` carries the label "measured on a generated file", not `UNVERIFIED` (U5; Open_Item O11).
    - Tests: `test/unit/buttonXml.test.ts` (create): the names and attributes of both tags and the record flags parse from the generated dump.
    - _Requirements: 20.3_

  - [ ] 20.2 Add `src/convert/buttons.ts` and Scene_JSON 4
    - Pure. A record joins every state whose flag is true; entries are ordered by `placeDepth`; two records at one depth in one state keep the later one (Named_Limit `button-duplicate-depth`); records with a blend mode or filter list are drawn without them (`button-record-effects`); button actions (`<actions>`, `actionBytes`) are AVM1 and ignored (`button-avm1-actions`); `DefineButtonSound` and `DefineButtonCxform` are not read (`button-sound`). New symbol `{ type: 'button', className?, trackAsMenu, states: { up, over, down, hit } }`. `formatVersion` is 4 only when the scene holds a button symbol and 3 otherwise; the reader (`template/runtime/scene.ts`) accepts 2, 3 and 4; every committed golden keeps its bytes. Convert returns `stats.placementsDropped` without button placements for delivered states. Update `.kiro/steering/tech.md` (Scene_JSON 3 and 4) and `structure.md` in this commit.
    - Tests: `test/unit/buttons.test.ts` (create): states per flag, depth order, duplicate depth, effects, version 3 without a button and 4 with one, reader accepts 2, 3 and 4; goldens unchanged (`test/unit/translateGolden.test.ts` and the scene goldens still pass).
    - _Requirements: 20.1, 20.2, 20.20, 21.2, 21.3_

  - [ ] 20.3 Write the property test of the conversion
    - **Property 23: Button symbol conversion and scene round trip** (each record in exactly the states whose flags are set; each state ordered by depth with no repeated depth; writing then parsing a scene gives an equal scene; version 3 without a button, 4 with one; reader accepts 2, 3 and 4), in `test/property/button.property.test.ts` (create), generator in `test/property/gen/genButtonRecords.ts` (create).
    - **Validates: Requirements 20.1, 20.2, 21.1, 21.2**

- [ ] 21. Runtime and Shim: the button state model, `SimpleButton`, hit region and drawing
  - Commit area: `Runtime` (Shim named). Verification V2. Read the design Runtime and Shim table (read in Ruffle `avm2_button.rs` and `player.rs` at the pinned commit), D-C1 to D-C3, D-C5, D-C6, D-C9 and Properties 24 and 25. Tests run with the FakeBackend and a manual clock (Requirement 20.15). Add every behaviour with its evidence to `flash-behaviour.md` in this commit: the state-change table, the pick rule, the disabled rule and the release-outside rule (read), and the disabled-button state reset (Open_Item O10, neither read nor measured; read `set_enabled` in `avm2_button.rs` first).
  - [ ] 21.1 Add `template/runtime/buttonModel.ts` (pure)
    - `step(state, event) -> state` with the Ruffle table: RollOver to Over, RollOut to Up, Press to Down, Release to Over, ReleaseOutside to Up, MouseUpInside to Up, DragOut to Over, DragOver to Down; `hitRegion(button, state)` is the shapes of the current state container united with the hit container, each through the placement transform; with no hit records the hit container is empty so the shapes of the current state serve (D-C3, finding F4; A3). Add to the purity list.
    - Tests: `test/unit/buttonModel.test.ts` (create): each row of the table, the hit region with and without hit records.
    - _Requirements: 20.4, 20.5, 20.6, 20.7, 20.8, 20.20_

  - [ ] 21.2 Add `SimpleButton`, loader support and drawing
    - `template/shim/SimpleButton.ts` extends `InteractiveObject` with `upState`, `overState`, `downState`, `hitTestState`, `enabled`, `useHandCursor`; the Translator binds a linked button symbol to its class as for other symbols. The loader builds each state as an unparented container of the entries; only the current state is in the render list and the hit container is never drawn. A pointer event inside a button targets the button itself (`mouseChildren` false, D-C5). `enabled = false` draws the up state and dispatches no mouse event (D-C6). A button inside a rotated, scaled or masked placement uses the same placement transform as other symbols. Regenerate and stage the member table; list in `ADDED_APIS.md`.
    - Tests: `test/unit/simpleButton.test.ts` (create): states, `enabled`, binding; `test/unit/buttonNodes.test.ts` (create) on the FakeBackend: only the current state is drawn, the hit shapes are never drawn, the transform of a rotated placement.
    - _Requirements: 20.2, 20.4, 20.7, 20.9, 20.11, 20.12, 20.19_

  - [ ] 21.3 Write the property tests of hit region and state
    - **Property 24: Button hit region** (a pointer event reaches the button if and only if the point lies inside a shape of the current state container or of the hit container after the placement transform; a point only in a non-current visible state does not) and **Property 25: Button state follows the pointer model** (for any sequence of moves, presses and releases, the drawn state equals the model: Down if pressed on the button and the pointer is on it; Over if the pointer is on it and not pressed, or pressed and the pointer left it; Up otherwise; a disabled button is always Up and receives no mouse event), in `test/property/button.property.test.ts` (extend).
    - **Validates: Requirements 20.4, 20.5, 20.6, 20.7, 20.8, 20.10, 20.12, 20.16, 20.17, 20.19**

- [ ] 22. Runtime and Shim: hover and roll events
  - Commit area: `Runtime` (Shim named). Verification V2. Read the design finding F5, D-C4, D-C8 and Open_Item O9. The Player and Shim gain `mouseOver`, `mouseOut`, `rollOver`, `rollOut` (A4, U6); this is new work, not a reuse of existing rules. Before coding, read Ruffle `core/src/display_object/interactive.rs` event dispatch for the bubbling split (O9: `mouseOver` and `mouseOut` bubble, `rollOver` and `rollOut` do not, from Flash documentation, not yet read in Ruffle) and record the result in `flash-behaviour.md`. If the Block C spend is more than a third above its share when this task starts, apply the D-C8 fallback instead: deliver the up state, the hit area and the click only, record `button-state:over`, `button-state:down` and `button-hit-area` as Named_Limits in the Unsupported_Feature_List and the Fidelity_Report whenever a button placement exists, mark 22.1 and 22.2 as "not delivered" in the commit body, and say so at Checkpoint 3.
  - [ ] 22.1 Add the Shim constants and the Player hover tracking
    - `MouseEvent.MOUSE_OVER`, `MOUSE_OUT`, `ROLL_OVER`, `ROLL_OUT`. On a pointer move the Player compares the new Hit_Target with the previous one and dispatches `mouseOut` and `rollOut` at the old and `mouseOver` and `rollOver` at the new, before `mouseMove` handlers run. While a button is down the same events fire, plus drag-out and drag-over for the pressed object (AVM2 rule read in `player.rs`). On release outside the pressed object the pressed object gets `ReleaseOutside` and the object now under the pointer gets `RollOver` at once. Existing samples must keep their Trace_Score and Overall_Match (V2 floor tests). Regenerate and stage the member table.
    - Tests: `test/unit/hoverEvents.test.ts` (create) with the FakeBackend and manual clock: event order, bubbling split, no event when the target is unchanged, release outside.
    - _Requirements: 20.5, 20.6, 20.10, 20.20_

  - [ ] 22.2 Connect the state model to the events and the click
    - The Player feeds `RollOver`, `RollOut`, `Press`, `Release`, `ReleaseOutside`, `DragOut`, `DragOver` into `buttonModel.step` for the button under the pointer and calls `syncAll()` afterwards. A press and release on the same Pressed_Target dispatches `MouseEvent.CLICK` at the button (bubbling to its parents), and a listener added by translated code is called. `buttonMode` and `useHandCursor` stay stored only. The commit body states every committed sample's scores before and after.
    - Tests: `test/unit/playerButtons.test.ts` (create): up at rest, over on hover, down on press, click on release, no click on release elsewhere, disabled button inert.
    - _Requirements: 20.4, 20.5, 20.6, 20.9, 20.10, 20.12, 20.15_

- [ ] 23. Test and Verify: the generated-button end to end and the Outcome count
  - Commit area: `Test` (Verify and Pipeline named). Verification V2. Read the design D-C7, finding F2 and Requirement 21. No committed sample holds a button (A5), so Requirement 20.18 is met by two checks: every committed sample keeps its scores, and the generated button fixture passes.
  - [ ] 23.1 Run the generated button fixture through the pipeline in Chromium
    - `test/e2e/buttonFixture.e2e.test.ts` (create; a `chromium` slot): build the fixture with `test/support/buttonSwf.ts`, run the pipeline, build the project, load it, and check that the up state draws at rest, the over state while hovering, the down state while pressed, and that `click` fires a listener; a hit-area point outside the drawn state also reacts. Take one screenshot with the `playwright` MCP and look at it; it is not scored.
    - _Requirements: 20.4, 20.5, 20.6, 20.7, 20.9, 20.18, 20.19_

  - [ ] 23.2 Remove delivered `button` entries and report the rest
    - The Unsupported_Feature_List keeps a `button` entry only for a feature not delivered; the Fidelity_Report lists the button Named_Limits whenever a button placement exists (Requirement 20.14); the Outcome's `droppedPlacements` falls accordingly. The commit body gives the `button` entry count before (78 on the day of writing, from the local file) and after, as numbers, when `redball4.swf` is present (the check skips otherwise; the number is informational).
    - Tests: `test/unit/buttonReport.test.ts` (create): delivered states leave no `button` entry; an undelivered state leaves its Named_Limit; `test/unit/report.test.ts` (extend): the Fidelity_Report lists them.
    - _Requirements: 20.2, 20.13, 20.14, 21.1, 21.2, 21.3_

  - [ ] 23.3 Guard the existing floors
    - Run `test/unit/clickgotoReplay.test.ts`, `test/e2e/overallMatch.e2e.test.ts` and the Trace_Score tests. State every committed sample's Overall_Match and Trace_Score before and after Block C in the commit body; none may drop (Requirement 11.1). The sample table plus the generated fixture is the Requirement 20.18 check.
    - _Requirements: 11.1, 11.4, 20.18_

- [ ] 24. Checkpoint 3: Block C done, final
  - STOP. This is the final Checkpoint (Requirement 22.3). Follow the Checkpoint procedure of the rules: run the full suite `npm test -- --run`, hand the review to the `fidelity-reviewer` agent, commit its report as `.kiro/specs/robustness/reviews/checkpoint-3.md`, act on its findings in a new commit, then stop and report.
  - The report holds the items of the Checkpoint procedure (real `git status`, commits since Checkpoint 2, per-sample table, both Play_Tests, Outcome, reason code and exit code of every Hostile_Fixture, new Named_Limits, Open_Items, Warm_Suite_Time, Credits_Line). It also states (Requirement 22.2): as numbers only the `redball4.swf` Outcome when present, with the `button` entry count before and after; the Named_Limits and Open_Items added by this spec; whether the hover work was delivered or the D-C8 fallback applied; the table of decisions U1 to U9 and amendments A1, A3 to A5, A7 to A15 with the task that built each; and the total credits against about 250 and the Credits_Line.
  - _Requirements: 22.1, 22.2, 22.3, 24.1 to 24.4_

## Notes

- All tests in this plan are required. There are no `*` markers and no optional test tasks, following the `as3-coverage` plan. Each pure function's test is in the sub-task that adds it. The design's 25 Correctness Properties each have one sub-task: Property 1 in 1.3, 2 in 8.3, 3 in 7.3, 4 in 2.2, 5 in 1.3, 6 in 1.3, 7 in 1.3, 8 in 3.2, 9 in 3.2, 10 in 7.3, 11 in 10.3, 12 in 10.3, 13 in 11.2, 14 in 2.2, 15 in 17.3, 16 in 17.3, 17 in 18.4, 18 in 18.4, 19 in 14.3, 20 in 14.3, 21 in 15.2, 22 in 15.2, 23 in 20.3, 24 in 21.3, 25 in 21.3.
- Small findings S1 to S4 are Tasks 6, 4, 5 and 9, each its own commit, placed before the first task that touches the same file.
- Both Requirement 4.12 cases are tested: a timeline-only file ends `converted` with exit 0 (Tasks 1.2 and 12.2) and a file with candidates and none translated ends `refused nothing-translated` with exit 3 (Tasks 1.2 and 12.2).
- Tests that need `.work/judge-test/redball4.swf` skip with a message when it is absent.
- Checkpoints are Tasks 13, 19 and 24, exactly three (Requirement 24.1). Each stops and waits for the owner.
- Credit shares: spec documents 30, Block A 70, Block B 90, Block C 60, about 250 in total. Each block stops and reports above its threshold by the real meter (A 93, B 120, C 80).
- The Task Dependency Graph runs one leaf task per wave in the order of this document. One top-level task is one commit and the sub-tasks of a commit share files, so no two leaf tasks run in parallel. Checkpoint tasks and top-level parent tasks are not in the graph.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2"] },
    { "id": 5, "tasks": ["2.3"] },
    { "id": 6, "tasks": ["3.1"] },
    { "id": 7, "tasks": ["3.2"] },
    { "id": 8, "tasks": ["4.1"] },
    { "id": 9, "tasks": ["5.1"] },
    { "id": 10, "tasks": ["6.1"] },
    { "id": 11, "tasks": ["6.2"] },
    { "id": 12, "tasks": ["6.3"] },
    { "id": 13, "tasks": ["7.1"] },
    { "id": 14, "tasks": ["7.2"] },
    { "id": 15, "tasks": ["7.3"] },
    { "id": 16, "tasks": ["8.1"] },
    { "id": 17, "tasks": ["8.2"] },
    { "id": 18, "tasks": ["8.3"] },
    { "id": 19, "tasks": ["9.1"] },
    { "id": 20, "tasks": ["10.1"] },
    { "id": 21, "tasks": ["10.2"] },
    { "id": 22, "tasks": ["10.3"] },
    { "id": 23, "tasks": ["11.1"] },
    { "id": 24, "tasks": ["11.2"] },
    { "id": 25, "tasks": ["12.1"] },
    { "id": 26, "tasks": ["12.2"] },
    { "id": 27, "tasks": ["12.3"] },
    { "id": 28, "tasks": ["14.1"] },
    { "id": 29, "tasks": ["14.2"] },
    { "id": 30, "tasks": ["14.3"] },
    { "id": 31, "tasks": ["15.1"] },
    { "id": 32, "tasks": ["15.2"] },
    { "id": 33, "tasks": ["16.1"] },
    { "id": 34, "tasks": ["16.2"] },
    { "id": 35, "tasks": ["17.1"] },
    { "id": 36, "tasks": ["17.2"] },
    { "id": 37, "tasks": ["17.3"] },
    { "id": 38, "tasks": ["18.1"] },
    { "id": 39, "tasks": ["18.2"] },
    { "id": 40, "tasks": ["18.3"] },
    { "id": 41, "tasks": ["18.4"] },
    { "id": 42, "tasks": ["20.1"] },
    { "id": 43, "tasks": ["20.2"] },
    { "id": 44, "tasks": ["20.3"] },
    { "id": 45, "tasks": ["21.1"] },
    { "id": 46, "tasks": ["21.2"] },
    { "id": 47, "tasks": ["21.3"] },
    { "id": 48, "tasks": ["22.1"] },
    { "id": 49, "tasks": ["22.2"] },
    { "id": 50, "tasks": ["23.1"] },
    { "id": 51, "tasks": ["23.2"] },
    { "id": 52, "tasks": ["23.3"] }
  ]
}
```
