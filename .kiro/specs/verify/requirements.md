# Requirements Document

## Introduction

The Pipeline turns an AS3 `.swf` into an Emitted_Project but does not yet measure how faithful that project is. This spec adds a deterministic Verify_Stage that compares the Emitted_Project against two independent references and writes a Fidelity_Report.

- Visual fidelity: reference frames come from FFDec, our frames come from the Emitted_Project rendered headless in Timeline_Only_Mode. Both are compared with a pixel diff.
- Behaviour fidelity: the `trace` output of the translated classes, driven by a recorded input, is compared line by line with a recorded Reference_Trace.

The spec also closes the behaviour gaps that `samples/clickgoto/PROVENANCE.md` lists, so that the `clickgoto` trace matches as far as possible. Every remaining mismatch is reported, and the comparison is never weakened to make it pass.

There is no LLM, no network and no UI beyond one static HTML file. The Pipeline without `--verify` behaves as it does today.

Facts checked in the repository when this spec was written:

- `samples/clickgoto/reference/` holds `output.txt` (the Ruffle trace log), `input.json` (35 entries of `Wait`, `MouseDown` and `MouseUp` with `pos` and `btn`) and `test.toml` (`num_frames = 32`). `samples/tweendemo/` has no `reference/` directory.
- `template/shim/events.ts` already defines `EXIT_FRAME`, `ADDED`, `ADDED_TO_STAGE`, `FRAME_CONSTRUCTED`, `REMOVED`, `REMOVED_FROM_STAGE` and `RENDER`, but `Event` has no `bubbles`, `cancelable` or `eventPhase` field and no `toString()`. Per the translate spec, the Shim dispatches only `ENTER_FRAME`, `EXIT_FRAME` and click.
- `template/shim/trace.ts` exports `trace` and `setTraceSink`. `template/runtime/clock.ts` exports `ManualClock`. `test/support/fakeBackend.ts` exports `FakeBackend`. `Player.update()` runs whole frame steps from a Clock, and `Player.dispatchClick(x, y)` hit tests and delivers a click.
- `template/src/main.ts` always uses `classRegistry` from `src/classes.ts`. No timeline-only boot path exists today.
- `src/pipeline/canonicalJson.ts` exports `canonicalJson(value, rootPath)`, which the Scene_JSON, Translation_Report and Unsupported_Feature_List already use.
- `package.json` has no browser automation, PNG codec or image diff library. `tools/ffdec/` is gitignored and holds FFDec 26.4.0.
- The FFDec frame export `-format frame:png -select <frames> -export frame <dir> <swf>` was verified by hand by the user. It writes `<dir>/<n>.png` at stage size and runs no ActionScript.

## Glossary

- **Verify_Stage**: The Pipeline stage that runs after Emit and the Type_Check_Gate when `--verify` is given, and produces the Fidelity_Report and the Fidelity_HTML.
- **Verify_Core**: The pure modules of the Verify_Stage (frame selection, pixel diff metric, trace comparison, report building and serialisation). They perform no file, process, network, clock, randomness or locale-dependent call.
- **Verify_Edge**: The modules that do I/O for the Verify_Stage (FFDec process, headless browser, PNG read and write, file writes).
- **Emitted_Project**: The Vite + TypeScript + PixiJS project written by the Emit stage.
- **Scene_JSON**: The canonical scene file the Convert stage writes into the Emitted_Project.
- **Translation_Report**: The `translation-report.json` file of the translate spec, with one entry and one Class_Status per class.
- **Reference_Frame**: A PNG that FFDec exports for one frame number of the original SWF.
- **Rendered_Frame**: A PNG that the Headless_Renderer captures from the Emitted_Project for the same frame number.
- **Headless_Renderer**: The headless Chromium instance, driven by a pinned browser automation tool, that loads the built Emitted_Project and captures the stage canvas.
- **Timeline_Only_Mode**: A boot mode of the Emitted_Project in which no class registry is used, so every clip is a plain `MovieClip`, no frame script and no listener runs, the root is placed on frame N, and nested clips are advanced as a script-free player would.
- **Frame_Sample**: The ordered list of frame numbers (1-based) that the Verify_Stage compares for one SWF.
- **Frame_Match**: For one frame, the pixel diff result `{ frame, matchPercent, differingPixels, totalPixels }` where `matchPercent` is `100 * (totalPixels - differingPixels) / totalPixels`.
- **Overall_Match**: The mean of the Frame_Match `matchPercent` values over the Frame_Sample, computed in a fixed order.
- **Diff_Image**: A PNG of the same size as the two compared frames that marks the differing pixels.
- **Anti_Aliasing_Tolerance**: The per-pixel colour distance threshold and the rule for edge pixels below which two pixels count as equal, fixed by the design and recorded in the Fidelity_Report.
- **Reference_Trace**: `samples/<name>/reference/output.txt`, the Ruffle `trace()` log of the original SWF.
- **Reference_Input**: `samples/<name>/reference/input.json`, an ordered array of entries. Entry types are `Wait`, `MouseDown` and `MouseUp`, with `pos` `[x, y]` in stage pixels and `btn`. A `Wait` entry ends the input for the current frame. `MouseDown` and `MouseUp` entries consume no frame; they are applied in the current frame and processing continues until the next `Wait`.
- **Input_Group**: The entries of the Reference_Input up to and including the next `Wait` entry, or, for the last group, up to the end of the array. Input_Groups are numbered from 0, and Input_Group k belongs to Replay tick k.
- **Replay_Tick**: One step of the Replay, numbered from 0. Tick 0 is the construction tick (Player construction, initial events and frame-1 scripts, with no clock advance and no `Player.update()`). Each tick k >= 1 advances the ManualClock by one frame interval and runs one `Player.update()`.
- **Replay**: Running the Reference_Input against the translated classes with the FakeBackend and a ManualClock, one Input_Group per Replay_Tick, capturing every `trace` call through `setTraceSink`.
- **Goto_Extra_Cycle**: The extra cycle the Shim runs after a `gotoAndStop` or `gotoAndPlay` call made outside the frame step's own phases: `frameConstructed` to every clip children-first, a drain of the queued frame scripts, then `exitFrame` to every clip children-first.
- **Click**: A `MouseDown` entry followed by the next `MouseUp` entry at the same position, with no other `MouseDown` or `MouseUp` entry between them, whether both lie in the same Input_Group or in different ones. The Click is delivered to the Player as one click at that position when the `MouseUp` entry is applied.
- **Trace_Line**: One line of the Reference_Trace or of the captured trace, split on `\n` after removing a trailing `\r`.
- **Trace_Comparison**: The line-by-line comparison of the captured trace with the Reference_Trace, giving `matched`, `missing` and `extra` counts and the First_Divergence.
- **First_Divergence**: The lowest 1-based Trace_Line index at which the captured trace and the Reference_Trace differ, with both lines.
- **Trace_Score**: `100 * matched / max(referenceLineCount, capturedLineCount)`, or 100 when both traces are empty.
- **Flash_Event_Text**: The string form of an Event in Flash format, `[Event type="<type>" bubbles=<bool> cancelable=<bool> eventPhase=<number>]`.
- **Fidelity_Report**: The file `fidelity-report.json` in the output directory next to `translation-report.json`.
- **Fidelity_HTML**: The static file `fidelity-report.html` in the output directory.
- **Pipeline**: The command-line tool (`npm run pipeline`) that runs Unpack, Convert, Translate and Emit.
- **Shim**: The Flash API layer in `template/shim/`.
- **FFDec**: The JPEXS Free Flash Decompiler command line, run only as a separate process.
- **Approved_Dependency**: One of the two npm packages the user has pre-approved for this spec: `playwright` (Apache-2.0) and `pngjs` (MIT).
- **New_Dependency**: Any npm package not in `package.json` today other than an Approved_Dependency.

## Requirements

### Requirement 1: Frame sampling

**User Story:** As a developer, I want a fixed, repeatable choice of frames per SWF, so that two runs compare the same frames.

#### Acceptance Criteria

1. WHEN the Verify_Stage selects frames for a SWF with F frames, THE Verify_Core SHALL return a Frame_Sample that is strictly increasing, holds only integers from 1 to F, and contains frame 1 and frame F.
2. WHERE no frame count is given, THE Verify_Core SHALL select min(F, 8) frames spaced as evenly as integer rounding allows.
3. WHERE a frame count K is given, THE Verify_Core SHALL select min(F, K) frames by the same rule.
4. IF F is 1, THEN THE Verify_Core SHALL return the Frame_Sample `[1]`.
5. FOR ALL F >= 1, calling the frame selection twice with the same F and K SHALL return equal lists (determinism property).

### Requirement 2: Reference frames from FFDec

**User Story:** As a developer, I want reference images that come from outside our own renderer, so that the comparison is independent.

#### Acceptance Criteria

1. WHEN the Verify_Stage needs Reference_Frames, THE Verify_Edge SHALL run FFDec as a separate process with `-format frame:png`, `-select` listing the Frame_Sample, and `-export frame`, into a work directory, and SHALL link no FFDec code.
2. WHEN FFDec exits with code 0, THE Verify_Edge SHALL read `<dir>/<n>.png` for each frame number n in the Frame_Sample.
3. IF FFDec exits with a non-zero code, or a PNG for a frame number in the Frame_Sample is missing, THEN THE Verify_Stage SHALL record a `reference-unavailable` entry naming each affected frame in the Fidelity_Report, SHALL leave those frames out of the Overall_Match, and SHALL still write the Fidelity_Report.
4. THE Verify_Edge SHALL strip ANSI colour codes from FFDec output before parsing it.
5. WHEN a Reference_Frame has a different width or height than the stage size in the Scene_JSON, THE Verify_Stage SHALL record a `size-mismatch` entry for that frame and SHALL leave the frame out of the Overall_Match.

### Requirement 3: Rendered frames in Timeline_Only_Mode

**User Story:** As a developer, I want our frames rendered from the built project without any script influence, so that visual differences come from the timeline and shapes, not from game code.

#### Acceptance Criteria

1. THE Emitted_Project SHALL support Timeline_Only_Mode, selected by a query parameter on the page URL that carries the target frame number.
2. WHILE the Emitted_Project runs in Timeline_Only_Mode, THE Emitted_Project SHALL use no class registry, run no frame script and call no `ENTER_FRAME` listener of translated code.
3. WHEN the Emitted_Project runs in Timeline_Only_Mode with target frame N, THE Emitted_Project SHALL place the root on frame N and SHALL set each nested clip to the frame that a script-free player shows at that root frame, advancing each nested clip by one frame per root frame step and looping at its last frame.
4. WHEN the Emitted_Project in Timeline_Only_Mode has drawn frame N, THE Emitted_Project SHALL set a page-visible ready flag that the Headless_Renderer waits for.
5. WHEN the Verify_Edge renders the Frame_Sample, THE Headless_Renderer SHALL load the built Emitted_Project once per frame number, capture only the stage canvas at stage size with device pixel ratio 1, and write one Rendered_Frame PNG per frame.
6. IF the Emitted_Project does not set the ready flag within 10 seconds, or the page reports an error, THEN THE Verify_Stage SHALL record a `render-failed` entry naming the frame and the error text, SHALL leave that frame out of the Overall_Match, and SHALL continue with the next frame.
7. WHEN `--verify` is not given, THE Emitted_Project SHALL boot exactly as it does today, and THE Pipeline output SHALL be byte-identical to the output of the Pipeline before this spec.

### Requirement 4: Pixel diff metric

**User Story:** As a developer, I want one well-defined similarity number per frame, so that fidelity can be compared across runs and samples.

#### Acceptance Criteria

1. WHEN two RGBA images of equal width and height are compared, THE Verify_Core SHALL return a Frame_Match whose `totalPixels` is width times height and whose `differingPixels` counts the pixels that differ by more than the Anti_Aliasing_Tolerance.
2. FOR ALL images A, the Frame_Match of A against A SHALL have `matchPercent` equal to 100 and `differingPixels` equal to 0 (identity property).
3. FOR ALL pairs of images A and B of equal size, the `matchPercent` of A against B SHALL equal the `matchPercent` of B against A (symmetry property).
4. FOR ALL pairs of images of equal size, `matchPercent` SHALL be between 0 and 100 inclusive (range property).
5. IF the two images differ in width or height, THEN THE Verify_Core SHALL return an error value naming both sizes and SHALL NOT return a Frame_Match.
6. WHEN the Verify_Core builds a Diff_Image, THE Verify_Core SHALL produce an image of the compared size in which every pixel counted as differing is marked in a fixed colour and every other pixel is shown at reduced brightness from the Reference_Frame.
7. THE Verify_Core SHALL compute `matchPercent` with integer pixel counts and one division, and SHALL round it to 2 decimal places by a fixed rule, so that the value is identical on every platform.
8. THE Fidelity_Report SHALL record the Anti_Aliasing_Tolerance values used.

### Requirement 5: Visual fidelity for every sample

**User Story:** As a user of the tool, I want a per-frame and overall match for each converted SWF, so that I can see how close the output is.

#### Acceptance Criteria

1. WHEN `--verify` is given and the Emit stage has succeeded, THE Verify_Stage SHALL compare the Rendered_Frame with the Reference_Frame for each frame in the Frame_Sample that has both.
2. THE Verify_Stage SHALL write for each compared frame the Reference_Frame, the Rendered_Frame and the Diff_Image as PNG files under `verify/frames/` in the output directory, named by frame number.
3. THE Fidelity_Report SHALL list, for each frame in the Frame_Sample in ascending order, either its Frame_Match with the three image paths relative to the output directory, or the reason it was not compared.
4. THE Fidelity_Report SHALL record the Overall_Match over the compared frames, the number of compared frames, and the number of frames not compared.
5. IF no frame of the Frame_Sample could be compared, THEN THE Fidelity_Report SHALL record the Overall_Match as `null` and SHALL NOT record 0.
6. WHERE the Scene_JSON or the Unsupported_Feature_List names a feature that the render path does not draw (for example colour offsets), THE Fidelity_Report SHALL list those entries in a `knownVisualLimits` list, so that a low match has a visible cause.
7. THE Verify_Stage SHALL run the visual comparison for every sample, including a sample with no Reference_Trace.

### Requirement 6: Behaviour replay

**User Story:** As a developer, I want the translated classes driven by the recorded input, so that their trace output can be compared with Ruffle's.

#### Acceptance Criteria

1. WHERE `samples/<name>/reference/output.txt` and `samples/<name>/reference/input.json` both exist, THE Verify_Stage SHALL run a Replay for that sample.
2. WHEN the Replay runs, THE Verify_Edge SHALL load the Scene_JSON and the translated classes registered in `src/classes.ts`, construct the Player with the FakeBackend and a ManualClock, and capture every `trace` call through `setTraceSink`, restoring the default sink afterwards.
3. WHEN the Replay runs tick 0, THE Replay SHALL construct the Player (running the initial events and the frame-1 scripts) without advancing the ManualClock and without calling `Player.update()`, and SHALL then apply the entries of Input_Group 0 in array order. WHEN the Replay runs a tick k with k >= 1, THE Replay SHALL advance the ManualClock by exactly one frame interval, run one `Player.update()`, and then apply the entries of Input_Group k in array order. A `Wait` entry ends its group, and `MouseDown` and `MouseUp` entries consume no tick of their own.
4. WHEN the Replay applies a `MouseUp` entry whose nearest preceding `MouseDown` or `MouseUp` entry is a `MouseDown` entry at the same position, in the same Input_Group or an earlier one, THE Replay SHALL deliver one Click at that position to the Player at that moment.
5. IF a `MouseDown` entry is not followed by a `MouseUp` entry at the same position before the next `MouseDown` entry or the end of the Reference_Input, or a `MouseUp` entry has no preceding unmatched `MouseDown` entry at the same position, THEN THE Replay SHALL record the entry as `unpaired-mouse-event` and SHALL deliver no click for it.
6. IF a Reference_Input entry has a type other than `Wait`, `MouseDown` or `MouseUp`, or a `btn` other than `Left`, THEN THE Replay SHALL record an `unsupported-input` entry naming the index and SHALL treat the entry as `Wait`.
7. THE Replay SHALL run exactly as many ticks, counting tick 0, as `test.toml` `num_frames` says WHERE `test.toml` exists (so ticks 0 to num_frames - 1, with num_frames - 1 frame steps), and otherwise as many ticks as the Reference_Input has Input_Groups.
8. WHEN the Reference_Input has no entries left before the Replay has run the required number of ticks, THE Replay SHALL run each remaining tick k >= 1 as a plain tick with a clock advance and `Player.update()` and no input.
9. IF the Reference_Input has more Input_Groups than the required number of ticks, THEN THE Replay SHALL ignore the surplus entries and SHALL record an `unused-input` entry naming the index of the first ignored entry.
10. THE design SHALL confirm the tick index k (Input_Group k, applied after that tick's frame step) on which each click takes effect against the click lines in `samples/clickgoto/reference/output.txt` (the first click trace is at line 67), consistent with the tick model of criterion 3, and SHALL state the result before the Replay is implemented.
11. THE design SHALL state how the Replay loads the emitted translated classes in Node without adding a dependency, using the approach of `test/support/fixtureClasses.ts` or a stated alternative.
12. THE Replay SHALL load the emitted translated classes in Node using only built-in modules and the packages already in `package.json` or listed as Approved_Dependency.
13. THE Replay SHALL use no real clock and no randomness, so that two Replays of the same project give equal captured traces.
14. THE Verify_Stage SHALL NOT modify any file under `samples/*/reference/`.
15. IF the Replay throws an error, THEN THE Verify_Stage SHALL record the error text and the tick index in the Fidelity_Report, SHALL keep the trace captured up to that point for the Trace_Comparison, and SHALL still write the Fidelity_Report.

### Requirement 7: Trace comparison

**User Story:** As a developer, I want to see exactly where our trace differs from Ruffle's, so that nothing is hidden behind a summary number.

#### Acceptance Criteria

1. WHEN the Replay has finished, THE Verify_Core SHALL compare the captured trace with the Reference_Trace line by line and SHALL return the `matched`, `missing` and `extra` counts, the Trace_Score and the First_Divergence.
2. THE Verify_Core SHALL count a Trace_Line as `matched` only WHEN the captured Trace_Line and the Reference_Trace line are byte-equal after removing one trailing `\r` from each, with no other normalisation.
3. THE Verify_Core SHALL compute the `matched`, `missing` and `extra` counts from a longest common subsequence alignment of the two line lists, so that one inserted or dropped line does not turn every later line into a mismatch.
4. THE Fidelity_Report SHALL list every `missing` line (in the Reference_Trace, not in the captured trace) with its 1-based Reference_Trace line number, and every `extra` line with its 1-based captured trace line number, in ascending order, without a limit on the count.
5. IF the captured trace is identical to the Reference_Trace, THEN THE Fidelity_Report SHALL record `missing` and `extra` as empty lists and the First_Divergence as `null`.
6. FOR ALL line lists A, comparing A with A SHALL give `matched` equal to the length of A, empty `missing` and `extra` lists, Trace_Score 100 and First_Divergence `null` (identity property).
7. FOR ALL line lists A and B, `matched + missing.length` SHALL equal the length of A and `matched + extra.length` SHALL equal the length of B, where A is the Reference_Trace and B is the captured trace (conservation property).
8. WHERE a sample has no Reference_Trace, THE Fidelity_Report SHALL record the behaviour comparison as `not-compared` with the reason `no-reference-trace` and SHALL NOT record a Trace_Score.
9. THE Verify_Stage SHALL apply the comparison rules of this requirement unchanged to every sample, and no sample, line or event type SHALL be excluded from the comparison to raise the Trace_Score.

### Requirement 8: Close the known behaviour gaps

**User Story:** As a developer, I want the Shim to behave like Flash on the points the reference trace shows, so that the clickgoto trace matches as far as possible.

#### Acceptance Criteria

1. THE Shim `Event` SHALL expose `bubbles`, `cancelable` and `eventPhase`, and its `toString()` SHALL return the Flash_Event_Text of the event.
2. THE Shim SHALL set `bubbles` to true for `added`, `removed` and click events and to false for every other event type, `cancelable` to false for every event type the Shim dispatches, and `eventPhase` to 2 (at target) for events dispatched on their own target.
3. WHEN the Player creates the root clip, THE Player SHALL give the root the instance name `root1`.
4. WHEN a display object is added to a parent, THE Shim SHALL dispatch `added` on that object, and, WHEN the parent is on the stage, SHALL then dispatch `addedToStage` on that object, in the order the Flash player uses and the Reference_Trace shows.
5. WHEN a frame step runs, THE Shim SHALL dispatch `frameConstructed` to each MovieClip on the stage after its display list for that frame is built and before its frame scripts run, in the order the Reference_Trace shows.
6. WHEN a frame step runs, THE Shim SHALL dispatch `enterFrame`, `frameConstructed` and `exitFrame` to each MovieClip on the stage in the per-frame order the Reference_Trace shows, and SHALL dispatch `exitFrame` children-first (children before their parent), as the Reference_Trace shows.
7. WHEN the Replay of `clickgoto` has finished, THE Verify_Stage SHALL report the achieved Trace_Score, and THE final summary of the implementing task SHALL state that score and the count of remaining `missing` and `extra` lines.
8. IF a Trace_Line still differs after the changes of this requirement, THEN THE Fidelity_Report SHALL list it as `missing` or `extra` as in Requirement 7, and THE Shim SHALL NOT special-case any Reference_Trace content to remove the difference.
9. THE Shim SHALL leave all existing behaviour covered by existing tests unchanged, including the Click_Oracle rows of the translate spec, with exactly two exceptions: the one existing expectation in `test/unit/exitFrame.test.ts`, which SHALL be changed to the children-first `exitFrame` order of criterion 6, and the existing expectation that `gotoAndStop` and `gotoAndPlay` dispatch no `EXIT_FRAME`, which SHALL be changed as criterion 11 requires. No other existing expectation SHALL change.
10. THE Shim SHALL list every API added by this requirement in `template/shim/ADDED_APIS.md` with its name and the fixture line that needs it.
11. WHEN a script calls `gotoAndStop` or `gotoAndPlay` outside the frame step's own phases (for example inside a click handler), THE Shim SHALL run one Goto_Extra_Cycle after the call returns, as the Reference_Trace shows at lines 68 to 80 of `samples/clickgoto/reference/output.txt`, and SHALL run it even WHEN the target frame equals the current frame (lines 79 to 84).
12. IF the change of criterion 11 does not raise the clickgoto Trace_Score, or breaks an existing behaviour test that cannot be fixed within the task, THEN THE implementer SHALL revert that task's changes, THE Fidelity_Report SHALL list the gap in a `knownBehaviourGaps` list with the entry `goto-extra-cycle`, and THE final summary of the implementing task SHALL say that the change was reverted and why.

### Requirement 9: Fidelity_Report serialisation

**User Story:** As a developer, I want the report to be a stable machine-readable file, so that two runs can be diffed and tests can read it.

#### Acceptance Criteria

1. THE Verify_Core SHALL build the Fidelity_Report as a plain data object from the Frame_Matches, the Trace_Comparison, the recorded entries and the Translation_Report, with no I/O.
2. THE Verify_Stage SHALL write `fidelity-report.json` in the output directory, serialised with `canonicalJson`.
3. WHEN the Verify_Stage runs twice on the same inputs, THE Verify_Stage SHALL write byte-identical `fidelity-report.json` files (determinism property).
4. THE Fidelity_Report SHALL contain no timestamp, absolute path, host name, process id, duration or browser build string that varies between runs; versions of tools SHALL be recorded only as the pinned strings from the project.
5. THE Fidelity_Report SHALL contain a `formatVersion` field, the sample name, the stage size, the Frame_Sample, the visual result of Requirement 5, the behaviour result of Requirement 7, and the class names and Class_Statuses copied from the Translation_Report.
6. THE Fidelity_Report SHALL record `not-compared` for any part that did not run, with the reason, so that no part is absent without a stated reason.
7. FOR ALL valid Fidelity_Report objects, parsing the output of the serialiser with `JSON.parse` and serialising again SHALL produce byte-identical text (round-trip property).
8. THE Fidelity_Report SHALL list its image paths and its problem entries in a total order defined by frame number and then by kind.

### Requirement 10: Static HTML report

**User Story:** As a reviewer, I want to open one HTML file and see the result, so that I do not need a server or a UI.

#### Acceptance Criteria

1. THE Verify_Stage SHALL write `fidelity-report.html` in the output directory, next to `fidelity-report.json`, derived only from the Fidelity_Report data.
2. THE Fidelity_HTML SHALL show for each compared frame the Reference_Frame, the Rendered_Frame and the Diff_Image side by side, with the frame number and the `matchPercent`.
3. THE Fidelity_HTML SHALL show the Overall_Match, the Trace_Score, the First_Divergence, and the lists of `missing` and `extra` lines.
4. THE Fidelity_HTML SHALL show the class names and Class_Statuses from the Translation_Report and every `not-compared`, `reference-unavailable`, `size-mismatch`, `render-failed`, `unsupported-input` and `unpaired-mouse-event` entry.
5. THE Fidelity_HTML SHALL load images by relative path, contain no script, request no network resource, and open correctly from the `file:` scheme.
6. THE Fidelity_HTML SHALL escape all text taken from the Fidelity_Report so that trace lines containing `<`, `>`, `&` or quotes show as text.
7. THE Fidelity_HTML SHALL give each image an `alt` text naming the frame and the image kind, and SHALL show pass or fail state with text as well as colour.
8. WHEN the Verify_Stage runs twice on the same inputs, THE Verify_Stage SHALL write byte-identical `fidelity-report.html` files.

### Requirement 11: Pipeline integration and failure handling

**User Story:** As a user, I want verify to be opt-in and never to break a conversion, so that the Pipeline stays usable.

#### Acceptance Criteria

1. WHERE the flag `--verify` is given, THE Pipeline SHALL run the Verify_Stage after Emit and the Type_Check_Gate and before it returns its exit code.
2. WHEN `--verify` is not given, THE Pipeline SHALL run no Verify_Stage code, start no browser and no FFDec frame export, and write neither `fidelity-report.json`, `fidelity-report.html` nor `verify/`.
3. WHERE the flag `--verify-frames <n>` is given with an integer n >= 1, THE Pipeline SHALL use n as K in Requirement 1.
4. IF `--verify-frames` is given without `--verify`, or with a value that is not an integer >= 1, THEN THE Pipeline SHALL print a usage error and exit with code 2.
5. IF the headless browser cannot be started, THEN THE Verify_Stage SHALL record every frame as `render-failed` with the start error, SHALL still run the Replay, and SHALL still write the Fidelity_Report and the Fidelity_HTML.
6. WHEN the Verify_Stage has finished, THE Pipeline SHALL print one summary line with the Overall_Match and the Trace_Score (or `not-compared`) and the paths of the two report files.
7. THE Pipeline exit code SHALL stay as it is today for a given conversion outcome, and a low match percentage or a trace mismatch SHALL NOT change it. IF the Verify_Stage itself fails to write the Fidelity_Report, THEN THE Pipeline SHALL print an error and exit with a non-zero code.
8. THE Verify_Core files SHALL import no `node:*` module and no browser automation or PNG library, and SHALL NOT use `Date`, `Math.random` or `localeCompare`.

### Requirement 12: Dependencies and constraints

**User Story:** As the project owner, I want no new dependency added without my approval, so that the dependency list stays under my control.

#### Acceptance Criteria

1. THE implementer SHALL add `playwright` (Apache-2.0, the exact latest version at install time) and `pngjs` (MIT, exact version) to `package.json` without asking for further approval, and SHALL add no other New_Dependency without stopping first, naming the package, the exact version, the licence and the reason, and waiting for explicit user approval.
2. THE design SHALL name the choice for each of three needs: the headless renderer (`playwright` with its pinned Chromium build, an Approved_Dependency), the PNG decode and encode (`pngjs`, an Approved_Dependency), and the pixel diff (written by hand in the Verify_Core, with no diff library), and SHALL state for each that no further New_Dependency is required.
3. WHEN an Approved_Dependency or an approved New_Dependency is installed, THE implementer SHALL install it as an exact version with no range operator, and SHALL pin the Chromium build or download version that the Headless_Renderer uses.
4. THE Verify_Stage SHALL run FFDec only as a separate process and SHALL NOT bundle or import FFDec code.
5. THE Verify_Stage SHALL make zero LLM calls and zero network calls other than the Chromium download for `playwright`, which the user has approved.
6. THE implementation SHALL follow the current `.kiro/steering/git-workflow.md`: all commits go on the current branch `wip/verify` and never on `main`, one commit per top-level task, `npm run typecheck` and `npm test -- --run` passing before each commit, files staged by path, no `git push`, no merge, no cherry-pick, no amend.
7. THE implementation SHALL keep `tools/`, `out/`, `.work/` and `dist/` uncommitted, and SHALL NOT commit generated Reference_Frames, Rendered_Frames or Diff_Images.
8. IF a finding contradicts this document, `design.md` or `.kiro/steering/tech.md`, THEN THE implementer SHALL stop and ask the user before continuing.

### Requirement 13: Test classification

**User Story:** As the project owner, I want to know which tests are mandatory, so that the task plan stays focused.

#### Acceptance Criteria

1. THE task plan SHALL mark as required exactly three tests: the Fidelity_Report determinism property of Requirement 9.3, the pixel diff metric properties of Requirement 4.2 and 4.3 (identity and symmetry), and the clickgoto Replay test of criterion 5.
2. THE task plan SHALL mark every other test task as optional, including the properties of Requirements 1.5, 4.4, 7.6, 7.7 and 9.7, unit tests and the end-to-end tests.
3. THE required pixel diff test SHALL use generated images, and THE required determinism test SHALL build the Fidelity_Report twice from the same generated inputs and compare the serialised text byte for byte.
4. THE task plan SHALL mark the implementation tasks that those three tests exercise as required, and SHALL NOT make the success of an optional test a condition for a commit.
5. THE clickgoto Replay test SHALL run the Replay of Requirement 6 on `samples/clickgoto` and SHALL assert that the Trace_Score is at least a floor constant recorded in the test, where the floor equals the Trace_Score achieved at the end of this spec, so that later changes cannot silently lower it.
6. WHEN the Trace_Score of the clickgoto Replay rises in later work, THE implementer SHALL raise the floor constant in the same commit, and SHALL NOT lower it.

### Requirement 14: Browser checkpoint

**User Story:** As the project owner, I want one point where I look at the real report, so that I can judge it before the work is called done.

#### Acceptance Criteria

1. THE task plan SHALL contain exactly one task named "Checkpoint: browser review of fidelity-report.html", placed after the Verify_Stage, the Pipeline flag and the Shim changes of Requirement 8 are done.
2. WHEN the checkpoint is reached, THE implementer SHALL run the Pipeline with `--verify` on `samples/clickgoto/test.swf` and on `samples/tweendemo/test.swf`, SHALL give the user the two paths of `fidelity-report.html`, and SHALL stop.
3. THE implementer SHALL state at the checkpoint, for each sample, the Overall_Match, the Trace_Score or `not-compared`, the number of `missing` and `extra` trace lines, and the list of frames not compared with reasons.
4. WHEN the checkpoint is reached, THE implementer SHALL NOT continue to later tasks until the user answers.
