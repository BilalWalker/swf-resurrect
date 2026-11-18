# Requirements Document

## Introduction

Judges of the hackathon may upload their own `.swf`. Whatever file a stranger gives SWF_Resurrect, the run must end in a clear, honest and useful result: never a crash, a hang, a raw stack trace or a fake success. This spec makes that true in three blocks, each ending in a Checkpoint:

- **Block A, the contract:** every run ends in exactly one Outcome, written to an Outcome_File and printed as the last line; Facts are read before the long stages; limits, exit codes and hostile fixtures. Checkpoint 1.
- **Block B, recover:** obfuscated files are deobfuscated on a copy and translated; Flash classes the Shim lacks get a stub policy, with `flash.geom.Point` implemented for real. Checkpoint 2.
- **Block C, buttons:** `DefineButton` and `DefineButton2` symbols are drawn and clickable. Checkpoint 3, final.

The source of this spec is `.claude/robustness-brief.md`. The web server and UI (`web/`) and the MCP servers (`mcp/`) are not part of this spec; the web server will read the Outcome_File.

### Evidence re-checked while writing this spec

The brief's measurements were re-checked against `.work/judge-test/` (logs and `out/`), the `swf-inspector` tools and the code. Everything below is a fact of this machine on the day of writing, not a promise.

| Brief claim | Re-check | Verdict |
|---|---|---|
| `empty.swf`, `text.swf`: exit 1, `error [unpack]: ... is not a valid SWF file` | Logs agree. The code is `INVALID_SWF` (`src/unpack/errors.ts`) and `cli.ts` returns 1. | Holds |
| `truncated.swf` (9000 bytes of a real SWF): exit 0, `translate ok (0 classes)`, `Done` | Log agrees. `swf_summary`: version 17, ZLIB, AS3 yes, 1 root frame, **no SymbolClass tag**, 27 classes in the ABC. `swf_list_classes`: the same 27 classes (they are the `fl.controls.Slider` family, so the file looks like a cut of the committed `slider_component`; not proven). FFDec reads the cut file without an error. | Holds, with an addition: the ABC is intact and FFDec decompiles 27 classes, but with no SymbolClass tag the Translator sees 0 candidate classes. The damage is invisible to the stages; only the header length or the compressed stream can show it. |
| `redball4.swf`: 17 classes, 0 translated, every one "does not parse", 27 more omitted as `missing-source`, every button placement dropped | `redball4.log`: `translate ok (17 classes: 0 clean, 0 loose, 17 unsupported)`, `typecheck 17 errors`, `Done`. `out/redball4/translation-report.json`: 17 classes, 27 omitted. `unsupported-features.json`: 78 `button` entries, 27 `class-omitted`, 27 `untranslated-class`, 17 `untranslated-code`. `swf_summary`: 36 `DefineButton2Tag`, no `DefineButtonTag`. | Holds. Addition: the ABC holds 225 classes (`swf_list_classes`; `swf_summary` says 224), and the Translator saw only 17 + 27 = 44. The other 180 or so (Box2D `b2*` classes, `Playtomic.*`) are not reachable from linked symbols. The "N of M" of the Outcome therefore needs a defined M (Requirement 4.8). |
| After `-renameInvalidIdentifiers typeNumber`: 48 classes seen, 3 translated | `redball4r.log`: `48 classes: 0 clean, 4 loose, 44 unsupported`. `translation-report.json`: 48 classes, 3 loose, 45 unsupported, 4 omitted. | Holds for the report (3). The console line says 4 loose and 44 unsupported: see the next row. |
| After `-deobfuscate max`: 56 classes seen, 15 translated (3 clean, 12 loose), 41 unsupported | `translation-report.json`: 56 classes, 3 clean, 12 loose, 41 unsupported, 20 omitted. `redball4d.log` prints `3 clean, 18 loose, 35 unsupported`. | Holds for the report. **The console line and the report disagree**: the `[translate]` line is computed before the type-check gate (`classStatus(c.diagnostics, 0)` in `src/pipeline/pipeline.ts`), the report after it. The Outcome must take its numbers from the report. |
| 442 `§§push/§§pop` lines remain in 19 classes; unresolved `Point` 53, `URLRequest` 8, ... | Not re-measured: the numbers need the decompiled sources of the deobfuscated file, which this spec does not regenerate. The log of `redball4d` shows 543 type errors in `out/redball4d`. | Unverified; Block B measures them again |
| `ffdec-cli -renameInvalidIdentifiers typeNumber` (5 s, 1416 identifiers), `-deobfuscate max` (20 s) | The two output SWFs exist (`redball4-renamed.swf`, `redball4-deob.swf`); the command lines and timings are not recorded in any log. | Unverified; Requirement 16.2 requires the exact options to be read from the installed FFDec help |
| AS1/AS2 file "(no DoABC tag)" | `src/unpack/unpack.ts` already throws `NotAs3Error` (code `NOT_AS3`) after the first FFDec call, from the `actionScript3` flag of the `FileAttributesTag`, not from the absence of `DoABCTag`. | The brief's premise (no AS1/AS2 handling) is partly wrong: AS1/AS2 is refused today as `failed` exit 1 after the 60 s-limited `-swf2xml` dump, not before it. A SWF without `FileAttributesTag` is also reported as not AS3. |

Further facts from the code that shape the requirements:

- `src/pipeline/cli.ts` returns 2 for usage and path errors, and `runPipeline` returns 1 for any stage failure and 0 otherwise. A project with 0 of 17 classes translated returns 0.
- `web/server/jobs.ts` reads exit code 0 as success and anything else as failed, reads stdout lines with `^Done: ` and `^error [stage]: `, and has its own limits: 20 MiB upload (`web/server/upload.ts`) and 180 s per job (`web/server/options.ts`, enforced by killing the process tree). The web server is outside this spec and must keep working. The 180 s kill is not owned by this spec; the run default of this spec (300 s) exceeds it, so the web owner must align it (Requirement 6.3).
- Measured on this machine on the day of writing, for the brief's `redball4.swf` with the previous flat limits (150 s run, 60 s stage): unpack 87.7 s, convert 39.9 s, translate 12.3 s, emit and gate 13.4 s, total 153.7 s, so the previous defaults refused it. Recovery steps: rename 5.1 s, deobfuscate 29.0 s. These numbers justify Requirement 6.2.
- Existing limits: FFDec 60 s per call (`unpack.ts`), 120 s for the Reference_Frames (`ffdecFrames.ts`), 60 s for the Replay (`replay.ts`), 10 s for the render wait (`renderFrames.ts`). `PIPELINE_SLOTS` (`test/support/slots.ts`) is a test-side limit of 3.
- `src/pipeline/cli.ts` has a defect on the `handwritten/SET.json` read error path: the message is a double-quoted string, so `${...}` is printed literally. Requirement 5.6 covers it.
- `src/convert/ffdecXml.ts` marks `DefineButtonTag` as `UNVERIFIED`; `DefineButton2Tag` is verified on FFDec 26.4.0 (attribute `buttonId`). The owner has decided that an FFDec dump of a generated file lifts the stop rule of `git-workflow.md` for this name, with the label "measured on a generated file" (Requirement 20.3).
- No committed sample holds a button; the only file with buttons is the copyrighted `redball4.swf` (Requirement 20.18).
- The Shim has no `Point`, `SimpleButton`, `SharedObject`, `URLRequest`, `navigateToURL`, `Loader`, `LocalConnection` or `Security`. It has `Rectangle` and `Sprite.buttonMode` (stored only).

## Glossary

- **SWF_Resurrect**: The tool of this repository.
- **Pipeline**: The command (`npm run pipeline`) that runs Unpack, Convert, Translate and Emit, and the Verify_Stage with `--verify`.
- **Pipeline_CLI**: `src/pipeline/cli.ts`, the entry point of the Pipeline.
- **Translator**: The deterministic AS3-to-TypeScript stage of the Pipeline (`src/translate/`).
- **Shim**: The small Flash API layer in `template/shim/` copied into every Emitted_Project.
- **Shim_Member_Table**: The generated file `src/translate/shimMembers.generated.ts` (`npm run gen:shim-members`).
- **Runtime**: The timeline player and PixiJS backend in `template/runtime/`.
- **Player**: The Runtime object that owns the clock, the display tree and input dispatch.
- **Emitted_Project**: The Vite + TypeScript + PixiJS project written by Emit.
- **Scene_JSON**: The per-project scene description written by Convert.
- **Named_Limit**: An entry of the Unsupported_Feature_List or of `visual.knownVisualLimits` that names a feature that is not drawn, not translated or only approximated.
- **Unsupported_Feature_List**: `unsupported-features.json` next to the Emitted_Project.
- **Translation_Report**: `translation-report.json` next to the Emitted_Project.
- **Fidelity_Report**: `fidelity-report.json` (and its HTML form) written by the Verify_Stage.
- **Verify_Stage**: The Pipeline stage that compares the Emitted_Project with the original.
- **Overall_Match**: The mean `matchPercent` over the compared frames, as defined by the verify spec.
- **Trace_Score**: `100 * matched / max(referenceLineCount, capturedLineCount)`, as defined by the verify spec.
- **Score_Floor**: The committed lowest acceptable Overall_Match or Trace_Score of a sample. Floors only go up.
- **Play_Test**: The headless end-to-end test of one game that sends an Input_Script to the Emitted_Project and asserts observable state (as3-coverage Requirement 25). The two Play_Tests are `entity_game` and `spacer`.
- **Fixture_Class**: A hand-made AS3 class used by a test of the Translator or Shim, independent of any sample.
- **Fetched_Sample**: A sample whose SWF is downloaded or copied into `.work/` by a script and never committed.
- **Shared_Run_Cache**: The existing cache that lets e2e tests reuse one Pipeline run per sample.
- **Browser_Limit**: The existing limit of 3 concurrent headless Chromium instances (`PIPELINE_SLOTS`).
- **Warm_Suite_Time**: The wall-clock time of `npm test -- --run` with the Shared_Run_Cache warm.
- **Checkpoint**: A task named "Checkpoint" in `tasks.md`.
- **Fidelity_Reviewer**: The read-only custom agent `fidelity-reviewer`.
- **Checkpoint_Report**: The message that stops the work at a Checkpoint (Requirement 24).
- **Credits_Line**: The "Est. Credits Used" line of a Checkpoint_Report.
- **Open_Item**: A behaviour or number that is neither measured nor read, recorded in the design with the reason.
- **Outcome**: The single final result of one run. Its code is one of `converted`, `converted-with-gaps`, `refused` and `failed`.
- **Outcome_File**: `outcome.json` in the output directory: the machine-readable record of the Outcome (Requirement 2).
- **Outcome_Line**: The last line the Pipeline_CLI prints, starting with `Outcome: ` and the Outcome code (Requirement 2.5).
- **Reason_Code**: A stable lowercase kebab-case identifier inside an Outcome: for `refused` one of `not-swf`, `damaged`, `actionscript-1-2`, `encrypted`, `too-large`, `time-limit`, `nothing-translated`, and for `failed` `internal-error`.
- **Reference_Id**: A short identifier (8 lowercase hexadecimal characters) of a `failed` run, printed in the Outcome_Line and written to the Outcome_File and to the Failure_Log.
- **Failure_Log**: A file in the output directory (`failure-<Reference_Id>.log`) that holds the stack trace of a `failed` run.
- **Facts**: The values read from the SWF header and tag list before any long stage: SWF version, compression, ActionScript version, size in bytes, root frame count, frame rate, stage size, and the number of ABC classes, which is filled after Unpack (Requirement 3).
- **Facts_Reader**: The component that determines the Facts.
- **Candidate_Class**: A class that Translate attempts to turn into TypeScript: a class linked to a symbol, a class in the emit closure of such a class, or the document class.
- **Gap**: A Candidate_Class that is untranslated, omitted or unsupported, a type error of the Emitted_Project, or a placement that Convert drops (Requirement 4.2).
- **Run_Limits**: The configurable limits of a run: maximum input size, wall-clock time per run, and a base wall-clock time per stage that is multiplied by a Stage_Weight (Requirement 6).
- **Stage_Weight**: The integer by which the base stage limit is multiplied for one stage: recover 2, unpack 2, convert 1, translate 1, emit 1, gate 1, verify 3.
- **ABC_Name_Scan**: The cheap check that reads the string and multiname tables of the ABC constant pool of the input, without FFDec and without decompiling, and counts names that are not legal AS3 identifiers (Requirement 14).
- **Hostile_Fixture**: A small generated SWF or byte string, built by a test, that triggers one refusal or failure path.
- **Obfuscation_Signal**: One of the following in a SWF: an identifier that is not a legal AS3 identifier (such as one that contains `§`), or a `§§push` or `§§pop` token in the decompiled source (Requirement 14).
- **Recovery_Copy**: A copy of the input SWF, in the work directory, that FFDec has rewritten with its rename and deobfuscate steps. The input file is never changed. When the file is obfuscated, the Recovery_Copy is made before the first Unpack and is the file that Unpack, Convert and Translate read.
- **Recovered_Count**: The number of Candidate_Classes translated from the Recovery_Copy.
- **No_Event_Stub**: An API_Stub of a class that in Flash dispatches a completion or progress event (for example `Loader`, `URLLoader`, `Sound`) and that the stub never dispatches, so that a game waiting for the event waits forever.
- **Unrecoverable_Class**: A Candidate_Class of an obfuscated SWF that is still untranslated after recovery because its decompiled source is garbage (for example it still holds `§§push` or `§§pop`).
- **API_Stub**: A Shim class or member that does nothing harmful, lets the translated class type-check and run, and records a Named_Limit on first use (Requirement 17).
- **Flash_API_Table**: The table in the Translator that lists the Flash class and member names the Shim lacks and that may be stubbed, with their policy (Requirement 17).
- **Stub_Policy**: One of `stub` (an API_Stub is generated), `real` (a real Shim implementation) and `gap` (never stubbed; a visible Gap).
- **Button_Symbol**: A `DefineButtonTag` or `DefineButton2Tag` character.
- **Button_State**: One of the four states of a Button_Symbol: up, over, down and hit.
- **Hit_Area**: The shapes of a Button_Symbol's hit state; they define where the button reacts to the pointer and are never drawn.

## Requirements

### Requirement 1: Every run ends in exactly one Outcome

**User Story:** As a user who gives SWF_Resurrect a file I did not make, I want one clear final result, so that I always know what I got.

#### Acceptance Criteria

1. WHEN a run of the Pipeline_CLI ends after the arguments were accepted, THE Pipeline_CLI SHALL produce exactly one Outcome whose code is `converted`, `converted-with-gaps`, `refused` or `failed`.
2. THE Pipeline_CLI SHALL assign `converted` WHEN the project exists, no Gap exists, and the type-check gate reports 0 errors.
3. THE Pipeline_CLI SHALL assign `converted-with-gaps` WHEN a project exists and at least one Gap exists, and the rule of Requirement 4 does not apply.
4. THE Pipeline_CLI SHALL assign `refused` WHEN the input is not processed into a usable project for a reason that belongs to the input or to a limit (Requirement 4 and Requirement 6), and the Outcome SHALL carry one Reason_Code.
5. THE Pipeline_CLI SHALL assign `failed` WHEN an internal error is caught that is not a refusal.
6. IF an error that no stage handles reaches the top of the Pipeline_CLI, THEN THE Pipeline_CLI SHALL catch it, assign `failed`, and write the Outcome_File.
7. THE Pipeline_CLI SHALL write the Outcome_File before the process ends, in every case of Acceptance Criteria 1 to 6 for which the output directory can be written.
8. FOR ALL Hostile_Fixtures and Pipeline stage fakes that throw at any stage, the run SHALL produce one Outcome and the Outcome_File SHALL parse as valid JSON (property test over the stage at which an error is injected).
9. THE existing exit-2 cases (a usage error, an unreadable input path, an unwritable output directory, an output directory that is not empty without `--force`) SHALL stay outside the Outcome set, SHALL write no Outcome_File, and SHALL print one `error [pipeline]:` line.

### Requirement 2: Outcome_File and Outcome_Line

**User Story:** As the author of the web server, I want one documented file that holds the result of a run, so that the UI can show it without parsing log lines.

#### Acceptance Criteria

1. THE Outcome_File SHALL be named `outcome.json`, SHALL sit directly in the output directory, and SHALL be canonical JSON written with the existing canonical writer (`src/pipeline/canonicalJson.ts`) so that equal content gives equal bytes.
2. THE Outcome_File SHALL hold: `formatVersion` (the integer 1), `outcome` (the code), `reasonCode` (a Reason_Code, or null for `converted` and `converted-with-gaps`), `reason` (one sentence in plain language, at most 200 characters, with no path, no stack trace and no tool name), `facts` (Requirement 3.2), `numbers` (Acceptance Criterion 3), `gaps` (Acceptance Criterion 4), `limits` (the Run_Limits that applied), `stages` (one entry per stage that started, with its name, its result `ok`, `error` or `skipped`, and its duration in milliseconds) and `referenceId` (null unless the outcome is `failed`).
3. THE `numbers` object SHALL hold `candidateClasses`, `translatedClasses`, `cleanClasses`, `looseClasses`, `untranslatedCodeClasses`, `unparsedClasses`, `unsupportedClasses`, `omittedClasses`, `typeErrors`, `droppedPlacements` and `namedLimits`, each a non-negative integer, taken from the Translation_Report and the Unsupported_Feature_List after the type-check gate and never from the `[translate]` console line; WHEN a run ends as `refused` before Translate, no report exists and `numbers` SHALL be null. (Amended at Task 12.3, owner decision: `untranslatedCodeClasses` is the registered classes kept with untranslated code; `cleanClasses + looseClasses + untranslatedCodeClasses + unparsedClasses` plus the omitted candidates equals `candidateClasses`; `unparsedClasses` is the registered classes whose translated output does not parse (the D5 fallback) and they never count as translated (`omittedClasses` also counts an omitted linked class that is not a candidate), `translatedClasses` is the first three, and `unsupportedClasses` is every candidate whose report status is `unsupported`, registered or omitted, so it overlaps the others.)
4. THE `gaps` array SHALL hold one entry per Gap kind that occurs, with the kind, the count and up to 5 examples, and SHALL be empty for `converted`.
5. THE Pipeline_CLI SHALL print the Outcome_Line as the last line of standard output, in the form `Outcome: <outcome> <reasonCode or -> <reason>`, and SHALL print nothing after it.
6. THE Pipeline_CLI SHALL keep every line that existed before this spec (`[unpack] ok`, `[typecheck] ...`, `error [stage]: ...`, `warn [stage]: ...`), because the web server reads them, and SHALL print `Done: <dir>` only for `converted` and `converted-with-gaps`, before the Outcome_Line.
7. THE Outcome_File SHALL NOT contain an absolute path of the machine that ran it, a stack trace, a username or an environment variable.
8. THE design SHALL document the format of the Outcome_File in a file under `docs/` and SHALL give a JSON example for each of the four outcomes.
9. THE parser of the Outcome_File SHALL reject a file whose `formatVersion` it does not know, with a message that names the version.
10. FOR ALL generated Outcome records, writing the record to the Outcome_File and reading it back SHALL give an equal record (round-trip property).
11. THE Outcome_File SHALL be written to a temporary name in the output directory and renamed into place, so that a reader never sees a partial file.
12. THE tests of this requirement SHALL use stage fakes and Hostile_Fixtures and SHALL NOT use a copyrighted file.

### Requirement 3: Facts first

**User Story:** As a user who gave an unsuitable file, I want to hear that in seconds, so that I do not wait for a stage that cannot succeed.

#### Acceptance Criteria

1. THE Facts_Reader SHALL read the Facts before any FFDec process starts, from the file header and tag stream, without FFDec.
2. THE Facts SHALL hold: the three-byte signature (`FWS`, `CWS` or `ZWS`), the SWF version, the compression (`none`, `zlib` or `lzma`), the size in bytes, the declared uncompressed length, the stage size, the frame rate, the declared root frame count, and a `scriptVersion` of `as3`, `as1-2` or `unknown`.
3. THE Facts_Reader SHALL set `scriptVersion` to `as3` WHEN the file holds a `DoABC` or `DoABC2` tag, to `as1-2` WHEN the file holds a `DoAction` or `DoInitAction` tag and no `DoABC` tag, and to `unknown` otherwise.
4. WHEN the Facts_Reader returns `as1-2`, THE Pipeline_CLI SHALL end the run as `refused` with `actionscript-1-2` within 5 seconds, with no FFDec process started, and the reason SHALL say that only ActionScript 3 files are supported.
5. WHEN the first bytes are not a SWF signature or the file is empty, THE Pipeline_CLI SHALL end the run as `refused` with `not-swf`, with no FFDec process started.
6. THE Facts SHALL be part of the Outcome_File for every Outcome that is reached after the Facts_Reader ran, including `refused` and `failed`.
7. FOR a `ZWS` (LZMA) file, THE Facts_Reader SHALL return header-only Facts (signature, version, compression, size and declared length; stage size, frame rate, root frame count and `scriptVersion` null or `unknown`) and SHALL add no decompression dependency; the design SHALL record the header layout, read from the SWF file format specification or measured with a generated file, and SHALL record the missing LZMA decode as an Open_Item.
8. FOR ALL generated headers with a valid signature, a version from 1 to 50 and a body, THE Facts_Reader SHALL return the signature, version, compression and declared length that were written (round-trip property over generated headers).
9. FOR ALL byte strings that do not start with `FWS`, `CWS` or `ZWS`, THE Facts_Reader SHALL return `not-swf` and SHALL NOT throw (property test over arbitrary bytes).
10. THE number of ABC classes SHALL be added to the Facts after Unpack as the number of `.as` files that FFDec exports (the same source as the `swf_list_classes` tool), and the Outcome_File SHALL state which Facts came from the header and which from FFDec.

### Requirement 4: The rule between converted-with-gaps and refused, and no fake success

**User Story:** As a user, I want the tool to say "refused" when nothing usable came out, so that "Done" never hides a failure.

#### Acceptance Criteria

1. THE Pipeline_CLI SHALL assign `refused` with `nothing-translated` WHEN the number of Candidate_Classes is greater than 0 AND the number of translated Candidate_Classes is 0, after any recovery of Requirement 16 has run.
2. THE Pipeline_CLI SHALL count as a Gap: a Candidate_Class with no translated class, an omitted class (`class-omitted`), an `untranslated-code` entry, a type error of the gate, an `unbound-instance` entry, and a placement that Convert drops (`placement dropped`, which includes buttons until Requirement 20 is done), and SHALL NOT count a Named_Limit that names a stored or approximated feature (`filter`, `text-metrics`, `stroke-style`) as a Gap.
3. WHEN the number of Candidate_Classes is 0 (a pure timeline file) AND the run reaches the end of Emit, THE Pipeline_CLI SHALL assign `converted` (or `converted-with-gaps` if another Gap exists) and SHALL NOT assign `refused`, because a timeline-only file has nothing to translate.
4. THE Pipeline_CLI SHALL print `Done:` and exit as for a project only WHEN the Outcome is `converted` or `converted-with-gaps`.
5. WHEN the input is damaged (Requirement 5), THE Pipeline_CLI SHALL assign `refused` with `damaged` and SHALL NOT assign `converted`.
6. WHEN the Outcome is `refused`, THE Pipeline_CLI SHALL leave in the output directory the Outcome_File and the reports only, and SHALL remove every Emitted_Project file that this run wrote.
7. WHEN the Outcome is `converted-with-gaps`, THE `reason` SHALL state the number of Candidate_Classes translated out of the Candidate_Classes, the number of type errors, and the two Gap kinds with the highest counts.
8. THE number M of a "N of M classes" statement SHALL be the number of Candidate_Classes, and the Outcome_File SHALL also hold the number of ABC classes from the Facts (the exported `.as` count), so that classes outside the emit closure are visible (the brief's file holds 225 exported classes and 44 Candidate_Classes).
9. FOR ALL Translation_Reports with N translated of M Candidate_Classes where M is greater than 0, THE Outcome SHALL be `refused` if and only if N is 0 (property test over generated reports). (Amended at Task 12.3, owner decision: a Candidate_Class is translated when Emit registered it, so it is not omitted and its emitted file parses (a class whose translated output does not parse, the D5 fallback, never counts), and it is clean, loose, an applied override, or kept with untranslated code. An omitted class, whatever the omission reason (`missing-source`, `syntax-error`, `bundler-parse` and the others), never counts. WHEN the count of kept classes with untranslated code is above 0, the `converted-with-gaps` reason SHALL name it, for example `1 of 1 classes translated (1 with untranslated code), 0 type errors`.)
10. THE existing committed samples SHALL each end as `converted` or `converted-with-gaps`, never `refused` or `failed`, and the Checkpoint_Report SHALL list the Outcome of each sample. (Amended at Task 12.3, owner decision: `3_joystick`, whose one candidate class is registered with untranslated code, now ends `converted-with-gaps`, no longer `refused`.)
11. THE refusal threshold is final: THE Pipeline_CLI SHALL refuse for `nothing-translated` only WHEN 0 of more than 0 Candidate_Classes are translated, and a file with 3 of 48 Candidate_Classes translated SHALL be `converted-with-gaps`; no percentage threshold SHALL be applied.
12. THE tests of Acceptance Criteria 1 and 3 SHALL cover, with a Translation_Report fake and with a generated timeline-only SWF, both cases: a SWF with 0 Candidate_Classes ends `converted` with exit 0 and never `refused`, and a SWF with at least 1 Candidate_Class and 0 translated ends `refused` with `nothing-translated` and exit 3. (Amended at Task 12.3, owner decision: "translated" is as defined in Acceptance Criterion 9; a candidate that is omitted or whose translated output does not parse, including the D5 fallback, is not translated.)

### Requirement 5: Damaged input and internal failure

**User Story:** As a user of a cut or broken file, I want to be told it is damaged, so that I do not take a hollow project for a result.

#### Acceptance Criteria

1. WHEN the declared uncompressed length in the header differs from the length of the decoded body plus the 8 header bytes, THE Pipeline_CLI SHALL end the run as `refused` with `damaged`.
2. WHEN the compressed stream of a `CWS` or `ZWS` file ends before the declared length, THE Pipeline_CLI SHALL end the run as `refused` with `damaged`.
3. WHEN the tag stream ends inside a tag or without an `End` tag, THE Pipeline_CLI SHALL end the run as `refused` with `damaged`.
4. WHEN the SWF has an ABC class list but the SymbolClass tag is absent AND the file was found damaged by Acceptance Criteria 1 to 3, THE `reason` SHALL say that the file is cut short and SHALL NOT say that the project has no classes.
5. WHEN an internal error reaches the top of the Pipeline_CLI, THE Pipeline_CLI SHALL write the stack trace to the Failure_Log, SHALL print `error [pipeline]: internal error, reference <Reference_Id>` on standard error, and SHALL NOT print the stack trace on standard output or standard error.
6. THE message of the `SET.json` read error in `src/pipeline/cli.ts` SHALL print the error text of the exception and not the literal characters `${err instanceof Error ? ...}`, and a test SHALL cover that path.
7. THE `Reference_Id` SHALL be 8 lowercase hexadecimal characters derived from the run (not from the system clock alone), SHALL appear in the Outcome_File, the Outcome_Line and the name of the Failure_Log, and the Failure_Log SHALL be the only place that holds the stack trace.
8. IF the Outcome_File cannot be written because the output directory is gone or read-only, THEN THE Pipeline_CLI SHALL print the Outcome_Line anyway and exit with the exit code of the Outcome.
9. THE Hostile_Fixtures for this requirement SHALL be generated by tests from a committed sample SWF (cut at a given length, or with one byte changed in the compressed stream) and from byte strings, and SHALL NOT be downloaded.
10. FOR ALL cut lengths of a valid SWF from 0 to its length minus 1, THE run SHALL end as `refused` and SHALL NOT end as `converted` or `converted-with-gaps` (property test over cut lengths, with stage fakes to keep each case fast).
11. THE brief's `truncated.swf` (9000 bytes) SHALL be re-run after the change, and the Checkpoint_Report SHALL state its Outcome.
12. IF FFDec exits with an error during Unpack (not a timeout and not a missing Java or FFDec installation), THEN THE Pipeline_CLI SHALL end the run as `refused` with `damaged`, SHALL write the FFDec message to a log file in the output directory (`ffdec-<Reference_Id>.log`), and SHALL NOT put the FFDec message, a tool name or a path into the `reason` of the Outcome.
13. IF an error of SWF_Resurrect itself is caught (not an FFDec exit, a limit or an input fault), THEN THE Pipeline_CLI SHALL end the run as `failed`, so that `damaged` is never used for an internal error; a test SHALL cover both cases with a fake FFDec.

### Requirement 6: Run_Limits

**User Story:** As the operator of a public demo, I want a size limit and a time limit on every run, so that one file cannot hold the machine.

#### Acceptance Criteria

1. THE Pipeline_CLI SHALL accept the options `--max-size <MiB>`, `--run-limit <seconds>` and `--stage-limit <seconds>`, and the environment variables `SWF_RESURRECT_MAX_SIZE_MIB`, `SWF_RESURRECT_RUN_LIMIT_S` and `SWF_RESURRECT_STAGE_LIMIT_S`; an option SHALL win over a variable, and a variable over the default.
2. THE defaults SHALL be 20 MiB for the input size, 300 seconds for one run, and a base of 60 seconds for one stage multiplied by the Stage_Weight of the stage (recover 2, unpack 2, convert 1, translate 1, emit 1, gate 1, verify 3), and the design SHALL state why each is chosen.
3. THE default size limit SHALL equal the 20 MiB upload limit of `web/server/upload.ts`; THE 180 s per-job kill of the web server (`web/server/options.ts`) is not owned by this spec, and `docs/outcome.md` SHALL state that the default run limit of 300 s exceeds it and that the web owner must align it.
4. WHEN the input file is larger than the size limit, THE Pipeline_CLI SHALL end the run as `refused` with `too-large` before any FFDec process starts.
5. WHEN a stage (recover, unpack, convert, translate, emit, gate or verify) runs longer than the base stage limit multiplied by its Stage_Weight, or the run longer than the run limit, THE Pipeline_CLI SHALL stop the stage, SHALL end the run as `refused` with `time-limit`, and the `reason` SHALL name the stage and the limit that applied.
6. WHEN a limit stops a run, THE Pipeline_CLI SHALL terminate every child process that the run started (FFDec's Java process and every Chromium process) and their descendants, before it exits.
7. WHEN a limit stops a run, THE Pipeline_CLI SHALL remove the files of the Emitted_Project that the run wrote and SHALL leave the Outcome_File as the only new file, apart from the reports of stages that finished.
8. WHEN an option or variable is not a positive integer, THE Pipeline_CLI SHALL print a usage error and exit 2.
9. THE existing per-call limits (FFDec 60 s, Reference_Frames 120 s, Replay 60 s, render wait 10 s) SHALL stay as they are, and no timeout of any existing test SHALL be raised.
10. THE stage limit (base times Stage_Weight) SHALL apply to the Pipeline stages recover, unpack, convert, translate, emit, gate and verify, and the Recovery_Copy steps (Requirement 16) SHALL run in the recover stage and count towards the run limit and towards the stage limit of recover, and not towards the stage limit of unpack; THE time that a stage spends waiting for a slot of the Browser_Limit in a test SHALL NOT count.
11. THE time source of the limits SHALL be injectable, so that tests use a fake clock and a fake child process and do not wait.
12. FOR ALL sequences of stage durations and limits, THE Outcome SHALL be `refused` with `time-limit` if and only if some stage duration exceeds the base stage limit times its Stage_Weight or their sum exceeds the run limit (property test over generated durations with the fake clock).
13. THE Outcome_File SHALL hold the limits that applied, so that a reader sees which limit stopped the run.
14. THE test that proves that no child process remains SHALL start a real child process (a short `node` process that sleeps) through the same spawn and kill code as the Pipeline_CLI uses, and SHALL check by process identifier that the child and its descendant are gone.
15. THE FFDec spawn code of `src/unpack/` (`spawnFfdec`) SHALL kill the whole process tree of the FFDec Java process on a timeout and not only the direct child, and the test of Acceptance Criterion 14 SHALL cover it.
16. THE default limits SHALL let the brief's `redball4.swf`, when present, end as `converted-with-gaps` with time to spare, and the Checkpoint_Report of Checkpoint 2 SHALL give its time per stage and the share of the run limit used.

### Requirement 7: Exit codes

**User Story:** As the author of a script or of the web server, I want an exit code per outcome class, so that I can branch without parsing text.

#### Acceptance Criteria

1. THE Pipeline_CLI SHALL exit with 0 for `converted` and for `converted-with-gaps`, 1 for `failed`, 2 for a usage or path error (Requirement 1.9), and 3 for `refused`.
2. THE Pipeline_CLI SHALL NOT use another exit code, and the codes SHALL be defined once, in one constant table that the tests and the documentation read.
3. THE design SHALL document the table in the same file as the Outcome_File format (Requirement 2.8).
4. WHEN the process receives `SIGINT` during a run, THE Pipeline_CLI SHALL terminate its children, write an Outcome_File with `failed` and the reason `run stopped by signal`, and exit with 1; `SIGTERM` SHALL get the same handling only where the platform delivers it to the process.
5. THE exit code of a run SHALL be a function of the Outcome only (property test over generated Outcomes).
6. THE exit codes are final: `converted` 0, `converted-with-gaps` 0, `failed` 1, usage or path error 2, `refused` 3; THE Pipeline_CLI SHALL tell `converted-with-gaps` from `converted` by the Outcome_File and the Outcome_Line only.
7. OPEN_ITEM (no supervisor process): THE Pipeline_CLI SHALL run without a supervisor process. WHEN a stage blocks the Node event loop synchronously, a local user sees no output and no Outcome_File exists until the process is killed, and only the web server (which kills the process tree) bounds that case; Ctrl-C is handled on `SIGINT` only where the event loop runs. THE design SHALL record this as an Open_Item.

### Requirement 8: Hostile fixtures and the existing samples

**User Story:** As a maintainer, I want the refusal paths tested with small generated files, so that they keep working without a copyrighted file.

#### Acceptance Criteria

1. THE test suite SHALL hold Hostile_Fixtures, generated in the tests, for: an empty file, a text file, a file with a valid signature and no body, a cut file, a file with a damaged compressed stream, an AS1/AS2 file (a header and tags with a `DoAction` and no `DoABC`), a file with a `FileAttributesTag` that says ActionScript 3 and no `DoABC` tag, a file larger than a lowered size limit, a file for which a fake FFDec exits with an error at Unpack (Requirement 5.12), and a timeline-only file with 0 Candidate_Classes (Requirement 4.12).
2. THE test suite SHALL cover the `encrypted` Reason_Code with a fake FFDec result, and the design SHALL record, as an Open_Item, that no real encrypted SWF was measured and which FFDec output or exit code the Pipeline_CLI takes as the signal.
3. THE test suite SHALL cover `time-limit` with a fake clock and a fake child process (Requirement 6.11), and the real kill path with the process test of Requirement 6.14.
4. THE implementer SHALL measure and record, in the design, the behaviour of the Pipeline on: an AS1/AS2 file, a file with an encrypted or packed body, a file over the size limit, and a file whose conversion runs very long, and a measurement that cannot be made without a file that is not available SHALL be an Open_Item.
5. THE implementer SHALL NOT download a SWF, and SHALL NOT commit a SWF that is not under `samples/` with a `PROVENANCE.md`.
6. THE tests that need `.work/judge-test/redball4.swf` SHALL skip with a message when the file is absent and SHALL report the skip.
7. THE tests SHALL use no sample name in `src/`.

### Requirement 9: Cleanup and no half-written output

**User Story:** As an operator, I want a failed run to leave a tidy output folder, so that the next run or a reader of the folder is not misled.

#### Acceptance Criteria

1. WHEN the Outcome is `refused` or `failed`, THE Pipeline_CLI SHALL delete the work directory that it created, unless `--keep-work` or `--work-dir` was given.
2. WHEN a stage fails after Emit began, THE Pipeline_CLI SHALL remove the project files that the run wrote and SHALL keep only the Outcome_File, the reports and the Failure_Log.
3. THE Pipeline_CLI SHALL NOT delete a file in the output directory that the run did not write.
4. WHEN the output directory is refused before the run begins (Requirement 1.9), THE Pipeline_CLI SHALL leave it untouched, as `REFUSAL_CODES` in `src/pipeline/pipeline.ts` does today.
5. THE tests SHALL use a temporary output directory with a pre-existing foreign file and SHALL check that the foreign file is still there after a refusal.

### Requirement 10: Contract documentation and the reader's view

**User Story:** As the author of the web server, I want the contract documented in one place, so that I can build the reader without reading the Pipeline code.

#### Acceptance Criteria

1. THE repository SHALL hold one document, `docs/outcome.md`, with the four outcomes, the Reason_Codes with one sentence each, the exit-code table, the Outcome_File fields and one example file per outcome.
2. THE examples in the document SHALL be the files that a test writes, and a test SHALL fail WHEN an example differs from what the code writes.
3. THE Pipeline_CLI SHALL NOT change a file under `web/` or `mcp/`.
4. THE `.kiro/steering/tech.md` and `structure.md` files SHALL be updated for the new options (`--max-size`, `--run-limit`, `--stage-limit`), the Outcome_File and the new source directories in the commit that adds them, and `tech.md` SHALL state the Scene_JSON `formatVersion` that the code writes (3 today, 4 with buttons) instead of 2.

### Requirement 11: Existing behaviour is kept

**User Story:** As the owner, I want nothing that works today to get worse, so that the contract does not cost fidelity.

#### Acceptance Criteria

1. THE Score_Floors SHALL only go up, and the tolerance, the Reference_Frames and `src/verify/core/pixelDiff.ts` SHALL NOT change.
2. THE implementer SHALL NOT raise any timeout, and `PIPELINE_SLOTS` SHALL stay 3.
3. THE Pipeline SHALL NOT change a file under `web/` or `mcp/`.
4. THE Checkpoint_Report SHALL give, for each committed sample, Overall_Match, Trace_Score, type errors and Outcome, and a value lower than at the previous Checkpoint SHALL be a finding.
5. BOTH Play_Tests (`entity_game` and `spacer`) SHALL keep passing at every Checkpoint, and `spacer` SHALL skip with its existing message when its Fetched_Sample is absent.
6. THE default suite SHALL stay green, and the Warm_Suite_Time SHALL stay near 150 seconds and be reported at every Checkpoint; a change that makes it slower SHALL be named in the Checkpoint_Report.
7. THE determinism test SHALL keep passing: the same input and the same options SHALL give byte-equal output, and the Outcome_File SHALL not hold a time of day or a duration, except in the field `stages[].durationMs`, which the determinism test SHALL exclude by name.
8. EVERY rule of this spec SHALL be general: no source file under `src/` or `template/` SHALL name a sample, a game or a file name of the judge-test folder.
9. NO copyrighted file and nothing derived from one (`redball4.swf`, its renamed or deobfuscated copies, its output, its decompiled source, its class names) SHALL be committed, and no test fixture, golden or document SHALL quote its class names.

### Requirement 12: Checkpoint 1 (Block A)

**User Story:** As the owner, I want a stop and an independent review after Block A, so that I see the contract before more is spent.

#### Acceptance Criteria

1. WHEN Block A is complete and the full suite is green, THE implementer SHALL hand the review to the Fidelity_Reviewer and SHALL commit its report as `.kiro/specs/robustness/reviews/checkpoint-1.md`.
2. THE Checkpoint_Report of Checkpoint 1 SHALL contain the items of Requirement 24.4 and the Outcome, reason code and exit code of each Hostile_Fixture and of the files of the brief's table that are present (`empty.swf`, `text.swf`, `truncated.swf`, `redball4.swf`), the last as numbers only.
3. THE implementer SHALL stop at Checkpoint 1 and wait for the owner.

### Requirement 13: Block B, scope and order

**User Story:** As the owner, I want recovery work to come after the contract, so that every recovery result is reported under the contract.

#### Acceptance Criteria

1. THE implementer SHALL start Block B only after Checkpoint 1 is accepted.
2. THE Outcome of a recovered run SHALL follow Requirement 4, with the numbers taken after recovery.
3. THE Outcome_File SHALL hold, for a run with recovery, a `recovery` object (Requirement 16.4).

### Requirement 14: Detect obfuscation

**User Story:** As a user of an obfuscated game, I want the tool to notice and try to recover, so that I do not get 0 translated classes for a fixable file.

#### Acceptance Criteria

1. BEFORE the first Unpack, THE Pipeline SHALL run the ABC_Name_Scan on the input: it SHALL read the string and multiname tables of the ABC constant pool, without FFDec and without decompiling, and count the names that are Obfuscation_Signals.
2. THE Pipeline SHALL treat a name as an Obfuscation_Signal WHEN it contains a character that is not allowed in an AS3 identifier, including the character `§` (U+00A7). THE source signal (`§§push` or `§§pop` in the decompiled source) SHALL be counted after Unpack and SHALL serve only for the Unrecoverable_Class count of Requirement 16.7.
3. THE Pipeline SHALL declare the file obfuscated WHEN the share of the names scanned (or of the class names among them) that are Obfuscation_Signals is at least a threshold that the design states, and the threshold SHALL be chosen from the committed samples (0 signals) and the measured counts of the brief's file.
4. THE ABC_Name_Scan SHALL be a pure function over the ABC bytes, SHALL give the same answer on the same input, and SHALL NOT throw on damaged ABC bytes (it SHALL report "not obfuscated" and the damage is reported by Requirement 5).
5. THE Outcome_File SHALL record `obfuscated` true or false and, as separate fields, the number of names scanned and the number of invalid names (counted by the ABC_Name_Scan before Unpack) and the number of source signals (counted after Unpack of a Recovery_Copy, null when no Recovery_Copy was unpacked).
6. FOR ALL generated identifiers, the detector SHALL flag an identifier if and only if it contains a character outside the AS3 identifier alphabet (property test over generated names).
7. THE tests SHALL use generated sources and names and SHALL NOT quote a class name of a copyrighted file.

### Requirement 15: Obfuscation changes the translated source, not the input

**User Story:** As a user, I want my input file untouched, so that the original is never altered by the recovery.

#### Acceptance Criteria

1. THE Pipeline SHALL run the recovery steps only on a Recovery_Copy in the work directory, and the input file SHALL stay byte-equal to its state before the run.
2. THE Verify_Stage SHALL keep using the input file for the Reference_Frames, so that Overall_Match compares with the original and not with the Recovery_Copy.
3. IF a Recovery_Copy cannot be made (FFDec error or time), THEN THE Pipeline SHALL fall back to Unpack of the original only WHEN time remains in the run limit, SHALL say in the Outcome_File that recovery failed and that the original was translated, and otherwise SHALL end the run as `refused` with `time-limit`.
4. THE test of Acceptance Criterion 1 SHALL compare the SHA-256 of the input before and after a run with a fake FFDec.

### Requirement 16: Recover obfuscated files automatically

**User Story:** As a user of an obfuscated game, I want classes with unreadable names recovered, so that more of the game translates.

#### Acceptance Criteria

1. WHEN the ABC_Name_Scan declares the file obfuscated (Requirement 14), THE Pipeline SHALL, BEFORE the first Unpack, make a Recovery_Copy with the FFDec rename step for invalid identifiers (`typeNumber`), SHALL then run the FFDec deobfuscate step (`max`) on that copy, and SHALL run Unpack, Convert and Translate once, on the Recovery_Copy; THE Pipeline SHALL NOT unpack the original of an obfuscated file first.
2. THE exact FFDec command-line options for the two steps SHALL be read from the installed FFDec's own help (`tools/ffdec/ffdec-cli.jar`), and the design SHALL record the options, the FFDec version and the measured time of each step on the brief's file (the brief gives `-renameInvalidIdentifiers typeNumber` and `-deobfuscate max`; they are Open_Items until the design confirms them).
3. THE recovery steps SHALL run in the recover stage under the Run_Limits (Requirement 6) and SHALL NOT raise any existing FFDec timeout; IF a recovery step fails or exceeds its limit, THEN THE Pipeline SHALL apply Requirement 15.3 and SHALL record the failure in the `recovery` object.
4. THE Outcome_File SHALL hold a `recovery` object with: `attempted`, `renamedIdentifiers`, `deobfuscated`, `candidateClasses`, `recoveredClasses` (the Recovered_Count), `unrecoverableClasses`, `fallback` (true when the original was translated after a failed recovery), `skipped` (`not-obfuscated`, `copy-failed` or null) and `failedStep` (`copy`, `rename`, `deobfuscate` or null), and the sentence `obfuscated: names renamed, N of M classes recovered` in `reason`.
5. THE Pipeline SHALL translate the Recovery_Copy and SHALL NOT estimate or measure a baseline of the original; THE Outcome_File and the `reason` SHALL state that the result was recovered, and SHALL NOT claim that recovery improved the result.
6. THE renamed names SHALL be the same on every run of the same input and options: two runs on the same input SHALL give byte-equal translated class files and an equal list of renamed names (determinism test, with a fake FFDec that renames by a fixed rule, and the same test on the real FFDec where the brief's file is present).
7. AFTER Unpack of the Recovery_Copy, THE Pipeline SHALL count the `§§push` and `§§pop` source signals per class and SHALL name each Unrecoverable_Class, with the count, in the Unsupported_Feature_List with the kind `unrecoverable-class` and a message that says that the decompiled source is not readable after deobfuscation, and the Outcome_File SHALL state the count as the source-signal field of Requirement 14.5.
8. THE Pipeline SHALL record a Named_Limit `obfuscation-recovered` WHEN the Recovery_Copy was translated, with the text that class names were rewritten by FFDec and may differ from the original names.
9. THE Pipeline SHALL NOT recover a file that the ABC_Name_Scan does not declare obfuscated, and a run on a committed sample SHALL NOT make a Recovery_Copy.
10. THE implementer SHALL measure, with the brief's file when present, the number of `§§push` and `§§pop` lines that remain after recovery and the unresolved names (`Point`, `URLRequest`, `navigateToURL`, `Security`, `Loader`, `LocalConnection`), and SHALL record the numbers in the Checkpoint_Report of Checkpoint 2 (numbers only).
11. THE tests of recovery SHALL use a fake FFDec and generated sources; a test that uses the brief's file SHALL skip when it is absent.

### Requirement 17: Missing Flash API classes are stubbed by a general rule

**User Story:** As a user of a game that calls a Flash API the Shim lacks, I want the class to still type-check and run, so that a missing menu link does not stop a whole class.

#### Acceptance Criteria

1. THE Translator SHALL read the Flash_API_Table, a table of Flash class names and member names with a Stub_Policy per entry, and SHALL NOT hold a list per game or per file.
2. WHEN a translated class uses a Flash class or member that the Shim lacks and the Flash_API_Table gives it the policy `stub`, THE Shim SHALL already contain the API_Stub (stubs ship in `template/shim/` and are copied with it; the Emit stage SHALL NOT generate or add stubs), so that the class type-checks.
3. WHEN an API_Stub is called or constructed the first time in a run of the Emitted_Project, THE API_Stub SHALL record a Named_Limit named `api-stub:<Class>.<member>` (for a constructor, `<Class>.constructor`) and SHALL do nothing that has an effect outside the page.
4. THE API_Stub SHALL return a value of the member's type that is the neutral value of that type (0, empty string, false, an empty array) and SHALL NOT throw; WHERE the member returns an object in Flash, THE API_Stub SHALL return a non-null stub object of that type (for example `Sound.play()` returns a `SoundChannel` stub), so that translated code that reads the result does not fail on null.
5. WHEN a translated class uses a Flash class or member that is neither in the Shim nor in the Flash_API_Table, THE Translator SHALL leave the Gap visible as today, SHALL name the class and member in the Translation_Report, and SHALL NOT generate a stub.
6. THE Flash_API_Table SHALL give the policy `stub` to sound classes (`Sound`, `SoundChannel`, `SoundTransform`, `SoundMixer`), networking and navigation (`URLRequest`, `URLLoader`, `URLVariables`, `navigateToURL`, `LocalConnection`), `SharedObject` and `Security`, and SHALL give the policy `gap` to any class whose result a game needs to continue, which the design SHALL list by reason.
7. THE stubs of `Loader`, `URLLoader` and every other No_Event_Stub (including `Sound` completion events) SHALL never dispatch a completion event; WHEN a No_Event_Stub is first used, THE stub SHALL record, in addition to the Named_Limit of Acceptance Criterion 3, a Named_Limit `api-stub-no-event:<Class>`, because a preloader that waits for `complete` would wait forever. THE Fidelity_Report SHALL list which stubs used in the run can stall a game this way, and THE design SHALL state which events each stub dispatches and what the game sees for each stubbed class.
8. THE stubs for `SharedObject` SHALL hold data in memory for the life of the page and SHALL NOT write to browser storage.
9. THE Outcome_File SHALL count the classes whose type check depends on an API_Stub, and the Fidelity_Report SHALL list the `api-stub:` Named_Limits that apply.
10. THE Shim additions SHALL be listed in `template/shim/ADDED_APIS.md` with the Fixture_Class line that needs each, the Shim_Member_Table SHALL be regenerated and committed with them, and an addition under `template/` SHALL run the score floor tests `test/unit/clickgotoReplay.test.ts` and `test/e2e/overallMatch.e2e.test.ts`.
11. FOR ALL Fixture_Classes that call a member of a `stub` entry, THE Emitted_Project SHALL type-check and the first call SHALL record exactly one Named_Limit for that member, however many times it is called (property test over call counts).
12. THE design SHALL decide the mechanism inside the Shim (one stub class per Flash class, or one generic stub base) and SHALL state the trade-off.
13. THE tests SHALL use Fixture_Classes and SHALL NOT mention a sample name.

### Requirement 18: flash.geom.Point is a real Shim class

**User Story:** As a developer of a converted project, I want `Point` to behave as in Flash, so that geometry code gives the right numbers and not a stub's neutral values.

#### Acceptance Criteria

1. THE Shim SHALL export `Point` with `x`, `y`, a constructor `(x = 0, y = 0)`, `length`, `add(v)`, `subtract(v)`, `clone()`, `equals(toCompare)`, `normalize(thickness)`, `offset(dx, dy)`, `distance(pt1, pt2)`, `interpolate(pt1, pt2, f)`, `polar(len, angle)`, `copyFrom(sourcePoint)`, `setTo(x, y)` and `toString()`.
2. THE Shim `Point.length` SHALL return `Math.sqrt(x * x + y * y)`.
3. WHEN `normalize(thickness)` is called on a point of length 0, THE Shim SHALL leave the point unchanged.
4. THE values and edge cases of `normalize`, `interpolate` (the weight of `pt1`), `polar` and `toString` (`(x=1, y=2)`) SHALL be read in the Flash documentation of `flash.geom.Point` or in the Ruffle_Source, and the design SHALL name which, and a case that is neither read nor measured SHALL be an Open_Item.
5. THE Shim SHALL provide `Point` in the Flash_API_Table with the policy `real`, and no `Point` stub SHALL exist.
6. THE Shim_Member_Table SHALL be regenerated with the Shim change and committed with it, and the addition SHALL be listed in `template/shim/ADDED_APIS.md`.
7. FOR ALL points, `add` followed by `subtract` of the same point SHALL give the original point (property test).
8. FOR ALL points and all weights from 0 to 1, `interpolate(a, b, f)` SHALL lie on the segment from `a` to `b`, and `distance(a, b)` SHALL equal `distance(b, a)` (property tests).
9. FOR ALL points not at the origin and all positive thicknesses, THE length of `normalize(thickness)` SHALL equal `thickness` within 1e-9 relative error (property test).
10. THE tests SHALL use Fixture_Classes and SHALL NOT mention a sample name.

### Requirement 19: Checkpoint 2 (Block B)

**User Story:** As the owner, I want a stop and an independent review after Block B, so that I see what recovery gives before buttons are built.

#### Acceptance Criteria

1. WHEN Block B is complete and the full suite is green, THE implementer SHALL hand the review to the Fidelity_Reviewer and SHALL commit its report as `.kiro/specs/robustness/reviews/checkpoint-2.md`.
2. THE Checkpoint_Report of Checkpoint 2 SHALL contain, as numbers only, the Outcome of `redball4.swf` when present: Candidate_Classes, translated, clean, loose, unsupported, omitted, type errors, `§§push` and `§§pop` lines left, and unresolved Flash names, and SHALL NOT quote a class name; it SHALL also give the wall-clock time of each stage of that run and the share of the run limit used (Requirement 6.16).
3. THE Checkpoint_Report SHALL give the Named_Limits added by Block B and the Open_Items of Requirements 16 and 17.
4. THE implementer SHALL stop at Checkpoint 2 and wait for the owner.

### Requirement 20: Button symbols are drawn and respond (Block C)

**User Story:** As a player of a converted game, I want its menu buttons to appear and to work, so that the game can be started from its own menu.

#### Acceptance Criteria

1. THE Convert stage SHALL read `DefineButtonTag` and `DefineButton2Tag` characters, with the shapes and placements of each state, and SHALL write each Button_Symbol to Scene_JSON, and the Scene_JSON `formatVersion` SHALL be raised and documented, with the reader accepting the earlier versions.
2. THE Convert stage SHALL stop dropping placements of Button_Symbols and SHALL remove the `button` entries from the Unsupported_Feature_List for the states it handles.
3. THE implementer SHALL verify the FFDec XML names and attributes for `DefineButtonTag` (marked `UNVERIFIED` in `src/convert/ffdecXml.ts`) and for the button record and state flags with the `swf-inspector` tool `swf_find_tags` on a SWF that holds them. For `DefineButtonTag`, an FFDec dump (`-xml2swf` then `-swf2xml`) of a generated file lifts the `UNVERIFIED` stop rule of `git-workflow.md` (owner decision), and the commit and the code comment SHALL label the names "measured on a generated file"; the implementer SHALL NOT stop for the lack of a real file with a `DefineButtonTag`.
4. THE Runtime SHALL draw a Button_Symbol in its up state at rest.
5. WHILE the pointer is over a Button_Symbol and no mouse button is down, THE Runtime SHALL draw its over state; this criterion and Acceptance Criterion 6 belong to the hover work of Acceptance Criterion 10 and fall back as Acceptance Criterion 13 says.
6. WHILE a mouse button is down that was pressed over a Button_Symbol, THE Runtime SHALL draw its down state.
7. THE hit region of a Button_Symbol SHALL be the union of the currently visible state child and the shapes of its hit state (the rule of Ruffle at commit `4a8d396`, `avm2_button.rs`, `mouse_pick_avm2`), SHALL receive the pointer events, and the Hit_Area shapes SHALL NOT be drawn.
8. WHEN a Button_Symbol has no hit state, THE Runtime SHALL use the shapes of its currently visible state child as the hit region (read in the Ruffle_Source or measured; otherwise an Open_Item).
9. WHEN the pointer is pressed and released over the same Button_Symbol, THE Player SHALL dispatch `MouseEvent.CLICK` at the Button_Symbol, which bubbles to its parents, and a listener added by translated code SHALL be called.
10. THE Player and the Shim SHALL gain `mouseOver`, `mouseOut`, `rollOver` and `rollOut` (new work: the Player today dispatches only move, down, up and click), and the Player SHALL dispatch `MOUSE_OVER`, `MOUSE_OUT`, `MOUSE_DOWN` and `MOUSE_UP` for a Button_Symbol under the rules in `.kiro/steering/flash-behaviour.md`, with new rules recorded there as Acceptance Criterion 20 says.
11. THE Shim SHALL export `SimpleButton` with `upState`, `overState`, `downState`, `hitTestState`, `enabled` and `useHandCursor`, so that a class that extends it or reads its states type-checks, and the Translator SHALL bind a linked Button_Symbol to its class as for other symbols.
12. WHEN `enabled` is false, THE Button_Symbol SHALL draw its up state and SHALL NOT dispatch a mouse event.
13. IF the hover events, the over state or the down state cannot be delivered within the budget of Block C (Requirement 24.5), THEN THE implementer SHALL fall back to delivering the up state and the click (Acceptance Criteria 4, 7 and 9), and SHALL name each state not delivered as a Named_Limit (`button-state:over`, `button-state:down`, `button-hit-area`) in the Unsupported_Feature_List and the Fidelity_Report.
14. THE Named_Limits for any button feature not delivered SHALL be listed in the Fidelity_Report whenever a button placement exists.
15. THE tests of the Player SHALL run with the FakeBackend and a manual clock, without a browser, and SHALL use generated Button_Symbols and Fixture_Classes.
16. FOR ALL generated Button_Symbols with a hit state and all generated points, THE button SHALL receive a pointer event at a point if and only if the point lies inside a shape of its currently visible state child or of its hit state, transformed by the placement (property test over generated shapes and points).
17. FOR ALL sequences of pointer moves, presses and releases over a generated Button_Symbol, THE drawn state SHALL equal the state that a model of the four states gives (property test, model-based).
18. NO committed sample holds a Button_Symbol (checked with `swf_summary` and the reports of `.work/after/`); THEREFORE every committed sample SHALL keep its Overall_Match and Trace_Score or gain, and a generated button fixture (generated Scene_JSON and Fixture_Classes) SHALL pass, and the Checkpoint_Report SHALL list both.
19. WHEN a Button_Symbol is part of a rotated, scaled or masked placement, THE Runtime SHALL draw its state with the same placement transform as other symbols.
20. THE behaviour of a button that this spec adds to the Runtime SHALL be read in the Ruffle_Source or measured, SHALL be recorded in `.kiro/steering/flash-behaviour.md` with its evidence in the commit that adds it, and a behaviour that is neither SHALL be an Open_Item.

### Requirement 21: Button conversion count

**User Story:** As a reader of the Outcome, I want the dropped-button count to fall when buttons are drawn, so that the Gap count reflects the work.

#### Acceptance Criteria

1. WHEN Block C is complete, THE Outcome of the brief's file (when present) SHALL NOT count a button placement as a Gap for the states that are delivered, and the Checkpoint_Report SHALL give the count of `button` entries before (78 on the day of writing) and after; this criterion depends on `redball4.swf` and applies only when it is present.
2. THE Unsupported_Feature_List SHALL keep a `button` entry only for a Button_Symbol feature that is not delivered.
3. THE tests SHALL use generated Scene_JSON and Fixture_Classes and SHALL NOT mention a sample name.

### Requirement 22: Checkpoint 3, final (Block C)

**User Story:** As the owner, I want a final stop and review, so that the whole spec is verified before it is accepted.

#### Acceptance Criteria

1. WHEN Block C is complete and the full suite is green, THE implementer SHALL hand the review to the Fidelity_Reviewer and SHALL commit its report as `.kiro/specs/robustness/reviews/checkpoint-3.md`.
2. THE Checkpoint_Report of Checkpoint 3 SHALL give the table of every Hostile_Fixture with Outcome, reason code and exit code, the per-sample table (Overall_Match, Trace_Score, type errors, Outcome), the numbers of `redball4.swf` when present, and the Named_Limits and Open_Items added by this spec.
3. THE implementer SHALL stop at Checkpoint 3, as the final Checkpoint, and wait for the owner.

### Requirement 23: Samples and licences unchanged

**User Story:** As the owner, I want no new licence question, so that the repository stays clean.

#### Acceptance Criteria

1. THE spec SHALL add no sample and no third-party SWF.
2. THE Hostile_Fixtures SHALL be generated at test time from byte strings and from committed samples, and SHALL be written under a temporary directory.
3. THE `PROVENANCE.md` files and the sample licence check hook SHALL pass unchanged.
4. THE tests that use a local copyrighted file (`.work/judge-test/redball4.swf`) SHALL read it in place, SHALL write only under `.work/`, and SHALL NOT copy it, its output or its decompiled source into a tracked path.

### Requirement 24: Checkpoints, review, git and budget

**User Story:** As the owner, I want a stop and an independent review at each Checkpoint and a bounded spend, so that I see the state before more is spent.

#### Acceptance Criteria

1. THE `tasks.md` SHALL hold exactly three tasks named "Checkpoint": Checkpoint 1 after Block A, Checkpoint 2 after Block B and Checkpoint 3 after Block C.
2. WHEN a Fidelity_Reviewer finding exists, THE implementer SHALL act on it before the next task and SHALL name the fixing commit in the Checkpoint_Report.
3. THE implementer SHALL stop at each Checkpoint and wait for the owner.
4. THE Checkpoint_Report SHALL contain: the real output of `git status`, the commits since the last stop, Overall_Match and Trace_Score for every sample in a per-sample table, the result of both Play_Tests (`entity_game` and `spacer`, which SHALL pass or `spacer` skip with its existing message), the Outcome of every sample and Hostile_Fixture, new Named_Limits, Open_Items, the Warm_Suite_Time and the Credits_Line.
5. THE budget SHALL be about 250 credits by the real meter: spec documents 30, Block A 70, Block B 90 and Block C 60, and IF a block will exceed its stop threshold (Block A 93, Block B 120, Block C 80 credits by the real meter), THEN THE implementer SHALL stop and report before spending more.
6. THE implementer SHALL work on the existing `wip/as3-coverage` branch and SHALL NOT create a branch, push, rebase, amend, merge or reset.
7. THE implementer SHALL make one logical change per commit with its tests, with a subject of the form `Area: what changed` of at most 72 characters, and the commit message SHALL carry no attribution line, no emoji and no byte order mark.
8. THE commit body SHALL give the reason, how the change was verified and what is not verified, and SHALL say in one line when an MCP tool, a hook or the Fidelity_Reviewer caught or changed something.
9. THE implementer SHALL stage files by path and SHALL NOT use `git add -A`, `git add .` or `git commit -a`.
10. A change to a file under `template/shim/` SHALL be committed together with the regenerated `src/translate/shimMembers.generated.ts`.
11. THE implementer SHALL NOT commit anything under `tools/`, `node_modules/`, `out/`, `.work/` or `dist/`.
12. WHEN a Flash behaviour is added to the Shim or the Runtime, THE design or the commit body SHALL say whether it was read in the Ruffle_Source (commit `4a8d39661ed8aec97afee1504a4e33080da2efd0`) or measured, and a behaviour that is neither SHALL be an Open_Item.
13. THE implementer SHALL use the `swf-inspector` tools to learn what a SWF holds, and SHALL NOT guess it.

### Requirement 25: Small findings are fixed with the task that touches the file

**User Story:** As the owner, I want known small defects fixed when the work reaches their files, so that no defect waits for a separate task.

#### Acceptance Criteria

1. WHEN a task changes `src/unpack/` (`spawnFfdec`), THE implementer SHALL fix the process-tree kill (Requirement 6.15) in its own commit.
2. WHEN a task changes `src/pipeline/cli.ts`, THE implementer SHALL fix the `handwritten/SET.json` read-error message (Requirement 5.6) in its own commit.
3. WHEN a task changes the `[translate]` console line in `src/pipeline/pipeline.ts`, THE implementer SHALL make the line use the numbers after the type-check gate, or label it as a pre-check count, in its own commit, so that the console line and the Translation_Report no longer disagree. (Amended at Checkpoint 1, owner decision: the label is a separate indented line after the `[translate] ok (...)` line, which keeps its original bracket text, because the web server parses that text.)
4. WHEN a task changes `.kiro/steering/tech.md`, THE implementer SHALL correct the Scene_JSON `formatVersion` statement (Requirement 10.4) in its own commit.
5. EACH fix of this requirement SHALL carry the test named in the requirement that it implements, where that requirement names one.

### Requirement 26: Local-file findings (Block D)

**User Story:** As the owner, I want the faults that five local games showed handled in general, so that no real file ends ailed internal-error for a reason of its input.

#### Acceptance Criteria

1. THE Convert stage SHALL keep every class name of the SymbolClass list linked to its symbol, SHALL count identical (id, name) pairs once, and SHALL NOT throw for any SymbolClass list, including a list with several names for one character id.
2. WHEN a character id has several class names, THE symbol's className SHALL be the name Ruffle instantiates it with (the last pair in tag order; for id 0 the first, the root class) and every other distinct name SHALL be kept in an optional classAliases array of the sprite or button symbol, which THE Scene_JSON writer SHALL emit only when it is not empty and the readers of formatVersion 2, 3 and 4 SHALL accept; WHEN no symbol has an alias, THE Scene_JSON bytes SHALL equal those written before this requirement.
3. THE Emit registry, the translated-class set, and THE Player SHALL treat every alias as a linked class name: each alias class registered under its own name SHALL build the same symbol when the Player or script code instantiates it, and a symbol without aliases SHALL behave as before; THE ExportAssetsTag pairs that FFDec's symbols.csv lists after the SymbolClassTag pairs SHALL NOT be class links.
