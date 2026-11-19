# Design Document

## Overview

This design makes every run of `npm run pipeline` end in one honest Outcome, recovers obfuscated files on a copy, stubs Flash APIs by a general rule, adds a real `flash.geom.Point`, and draws and clicks `DefineButton` and `DefineButton2` symbols. It records decisions and the reason for each. Terms are those of `requirements.md`. Three blocks, three Checkpoints.

| Block | Delivers | Main new code |
|---|---|---|
| A, the contract | Outcome, Outcome_File, Facts_Reader, Run_Limits, exit codes, cleanup, hostile fixtures, the small fixes of Requirement 25 | `src/outcome/`, `src/facts/`, `src/pipeline/guard.ts`, `src/pipeline/processTree.ts` |
| B, recover | ABC_Name_Scan, recovery on a copy before the one Unpack, Flash_API_Table, stubs, `Point` | `src/recover/`, `src/facts/abcNames.ts`, `src/translate/flashApiTable.ts`, `template/shim/stubs/`, `template/shim/Point.ts` |
| C, buttons | Convert, Scene_JSON 4, Runtime, Shim `SimpleButton`, hover events | `src/convert/buttons.ts`, `template/runtime/button*.ts`, `template/shim/SimpleButton.ts` |

### Decisions at a glance

| Question | Decision | Why |
|---|---|---|
| Where the Outcome is decided | One pure function `decideOutcome` over a `RunRecord`; `runPipeline` only collects the record and calls it once | Testable without Java; one place enforces "no fake success" |
| Numbers in the Outcome | Read from the Translation_Report and the Unsupported list after the type-check gate; dropped placements from a new `stats.placementsDropped` | The `[translate]` console line is computed before the gate and disagrees with the report (redball4: 3/18/35 against 3/12/41) |
| What "translated" means | A Candidate_Class that Emit registered (not omitted) AND whose emitted file parses (not the D5 fallback, marked `parseFailed`) and that is clean, loose, an applied override, or kept with untranslated code (status `unsupported`, not loose). An omitted class, and a class whose translated output does not parse (the D5 fallback), never count; the latter are counted apart in `numbers.unparsedClasses`. (Amended at Task 12.3, owner decision: kept-with-untranslated-code classes now count; `numbers.untranslatedCodeClasses` holds them apart from clean, loose and omitted.) | Matches the brief's counts (3 and 15) |
| Facts without FFDec | Own header and tag-length walk (`src/facts/`), about 150 lines, no tag decoding except the DoABC payload for the ABC_Name_Scan | Needs only tag codes, lengths and the ABC constant pool; FFDec stays the only parser of tag content |
| Obfuscation detection | ABC_Name_Scan: walk the constant pool of the `DoABC` or `DoABC2` bytes (strings, namespaces, namespace sets, multinames) and count multiname names that are not legal identifiers. Before the first FFDec call, in pure code | Requirement 14.1. Measured 0.2 s for the whole 10 MB file including inflate and start-up of Node |
| Recovery order | If obfuscated: rename (`typeNumber`), then deobfuscate (`max`), both on a copy, then Unpack once on the recovered copy. Never Unpack the original first | Requirement 16.1. No double Unpack |
| Recovery failure | Fall back to Unpack of the original only if time remains in the run limit; otherwise refused `time-limit` | Requirement 15.3 |
| Compression | `FWS` and `CWS` fully; `ZWS` header-only (no LZMA decoder in Node, no new dependency) | Node `zlib` has no LZMA; a dependency is not added (Decision U7, decided) |
| Damaged detection | Decode with `zlib.inflateSync` and compare the declared length; walk the tags to an `End` tag | Measured: `truncated.swf` throws `Z_BUF_ERROR` and decodes 16 655 of 35 964 bytes |
| Limits | In-process `RunGuard` with an injectable clock, a registry of child process ids, and tree kill; no supervisor process | The web server already kills the whole tree (a backstop 30 s above the run limit it passes as `--run-limit`, branch `wip/ui`, Task 28); a supervisor would double the machinery. A blocked synchronous stage is Open_Item O1 |
| Windows process tree | `taskkill /PID <pid> /T /F`, moved from `launchChromium.ts` to `src/pipeline/processTree.ts` and used by `spawnFfdec` too | `child.kill()` in `spawnFfdec` ends only the Java process (read in the code) |
| Exit codes | One constant table: converted 0, converted-with-gaps 0, failed 1, usage 2, refused 3 | Requirement 7; `web/server/jobs.ts` reads 0 as success |
| FFDec exit error at Unpack | `refused` `damaged`; the FFDec text goes only to `ffdec-<Reference_Id>.log`. Every error of our own code stays `failed` | Requirement 5.12 and 5.13; D-A2 |
| Stubs | Ship in the Shim; objects returned where Flash returns objects; No_Event_Stubs record `api-stub-no-event:<Class>` | Requirements 17.2, 17.4, 17.7 |
| Buttons | New Scene_JSON symbol type `button`, `formatVersion` 4 written only when a button exists | Goldens of all committed samples stay byte-equal |

## Findings that changed the plan

| # | Finding | Evidence | Effect |
|---|---|---|---|
| F1 | Stage times of the brief's `redball4.swf` on this machine with the old flat limits: unpack 87.7 s, convert 39.9 s, translate 12.3 s, emit and gate 13.4 s, total 153.7 s. With the owner's limits (300 s run, 60 s base, weights) every stage fits its allowance (unpack 88 of 120 s, convert 40 of 60 s). Recovery adds about 34 s and one Unpack of the recovered copy replaces the Unpack of the original, so the expected total is about 190 s. The Unpack time of the recovered copy was not measured (O8) | `npm run pipeline` on `.work/judge-test/redball4.swf`, timestamps per line; `Measure-Command` for rename and deobfuscate | The target is `converted-with-gaps` under the defaults with time to spare (Requirement 6.16). The stage times are reported at Checkpoint 2. The 180 s kill of the web server is below the 300 s default and is the web owner's to align (D-A4, `docs/outcome.md`) |
| F2 | No committed sample holds a button. `unsupported-features.json` of all eleven runs in `.work/after/` has 0 `button` entries, and `swf_summary` of `click_block` and `entity_game` lists no button tag. The only file with buttons is `redball4.swf` (36 `DefineButton2Tag`, no `DefineButtonTag`), which is copyrighted and local. | `swf_summary`, `swf_find_tags`, grep of the reports | Requirement 20.18 compares the committed samples (unchanged) and a generated fixture (D-C7) |
| F3 | `DefineButtonTag` was `UNVERIFIED`. FFDec 26.4.0 accepted a hand-written `DefineButtonTag` item through `-xml2swf` and `-swf2xml` wrote it back as `<item type="DefineButtonTag" actionBytes="" buttonId="900" forceWriteAsLong="false">` with `<characters>` of `BUTTONRECORD`. A v1 record has no `colorTransform`; v2 has one, plus `<actions/>`. | Round trip in `.work/judge-test/design-tmp/` (`b.xml`, `b.swf`, `b2.xml`), `swf_find_tags` on `redball4.swf` for the v2 attributes | Owner decision (Requirement 20.3): this lifts the stop rule; the label is "measured on a generated file" |
| F4 | Ruffle's hit rule for a button is the union of the current visible state child and the hit area. | `avm2_button.rs` at `4a8d396`, `mouse_pick_avm2` | Requirement 20.7 already says so; D-C3 |
| F5 | Our Player dispatches no `mouseOver`, `mouseOut`, `rollOver` or `rollOut`, and the Shim `MouseEvent` has no such constants. | grep of `template/`; `player.ts` has `dispatchMouseMove`, `dispatchMouseDown`, `dispatchMouseUp`, `dispatchClick` only | New work in Block C (D-C4); Requirement 20.10 says so |
| F6 | `-deobfuscate max` alone leaves invalid names. After rename then deobfuscate the class list has `class_N` and `package_N` names. In `redball4`, 27 of 44 Candidate_Classes have an invalid name; in the eleven committed samples 0 of 83. | `swf_list_classes` on `design-tmp/d.swf` and `rd.swf`; name check over `translation-report.json` files | Order is rename, then deobfuscate (D-B3) |
| F7 | Recovery times on this machine: rename 5.1 s, deobfuscate after rename 29.0 s, deobfuscate alone 28.4 s. | `Measure-Command`, three runs | About 34 s for the recovery stage; the weight of the stage is 2 (D-B6) |
| F8 | The Facts_Reader can decode `CWS` with `zlib.inflateSync`. Declared and decoded lengths agree for `redball4` (10 196 790), `clickgoto` (4 944) and `entity_game` (22 225). For `truncated.swf` the declared length is 35 964, the file is 9 000 bytes, and `inflateSync` throws `Z_BUF_ERROR`. | Node 24.18 script over four files | The cut file is detectable from the header and one inflate, without FFDec |
| F9 | FFDec 26.4.0 has `-decrypt`, but it is for HARMAN AIR encryption only. No FFDec option or output was found that names a packed or encrypted web SWF. | `-help`, `-help decrypt` | The `encrypted` Reason_Code has no measured signal (O3) |
| F10 | The web server already kills the whole pipeline process tree on its 180 s limit (`web/server/jobs.ts` uses `killTree` from `web/server/processTree.ts`) (superseded: the web side passes --run-limit, Task 28). | grep | No supervisor process (O1) |
| F11 | `src/pipeline/cli.ts` returns 1 for an Emit refusal (`OUTPUT_DIR_NOT_EMPTY`, `UNSAFE_FORCE_TARGET`) because they are `PipelineError`s caught by the stage loop. Requirement 1.9 says exit 2 and no Outcome_File. | `pipeline.ts`, `REFUSAL_CODES` | These two codes leave the Outcome set and return 2 (D-A9) |
| F12 | `.kiro/steering/tech.md` says Scene_JSON is `formatVersion` 2. The code accepts 2 and 3 and writes 3. | `template/runtime/scene.ts` | Corrected in its own commit (Requirement 25.4) |
| F13 | Ruffle `Point.as` has `copyFrom` and `setTo` besides the members of the older list. | `core/src/avm2/globals/flash/geom/Point.as` at `4a8d396` | Requirement 18.1 now lists them |
| F14 | The Facts class count: `swf_summary` says 224 ABC classes for `redball4`, `swf_list_classes` says 225. | both tools | `abcClassCount` is the number of `.as` files FFDec exports, the same source as `swf_list_classes` (O14) |
| F15 | The ABC constant pool can be walked without FFDec. A parser of the `cpool_info` layout (u30 counts for int, uint, double, string, namespace, namespace set, multiname; multiname kinds `0x07`, `0x0D`, `0x0F`, `0x10`, `0x11`, `0x12`, `0x09`, `0x0E`, `0x1B`, `0x1C`, `0x1D`) ran to the end of the multiname table on 8 files with no unknown kind, and stopped well inside the ABC bytes. Tag 82 (`DoABC2`) has a u32 flags field and a zero-terminated name before the ABC bytes; tag 72 (`DoABC`) has the ABC bytes at once (`mask_reapply` uses tag 72, the other seven tag 82). Multiname names that are not legal identifiers: `redball4` 1 537 of 2 919 (52.6 %); `3_joystick` 0 of 62, `clickgoto` 0 of 97, `click_block` 0 of 21, `entity_game` 0 of 454, `mask_reapply` 0 of 26, `slider_component` 0 of 539, `tweendemo` 0 of 97. The count is the same with an ASCII rule and with a Unicode-letter rule. | `.work/abc-scan/scan.cjs` and `scan2.cjs` (Node, written for this design, not committed) | D-B2. The layout is checked by measurement on real files; the parser written from the layout ran clean, which is the evidence, not a copy of the format document |
| F16 | `FfdecExitError` (code `FFDEC_EXIT`, carries the exit code and the stderr text), `FfdecTimeoutError`, `JavaNotFoundError`, `FfdecNotFoundError`, `NotAs3Error`, `InvalidSwfError`, `MissingExportError`, `XmlVersionError` and `MissingHeaderValueError` already exist in `src/unpack/errors.ts`. | read | D-A2 maps by the existing codes; no new error class is needed for Requirement 5.12 |
| F17 | The `[translate] ok (...)` line is built from `classStatus(c.diagnostics, 0)` before the gate (`src/pipeline/pipeline.ts`, lines 257 to 259). | read | Requirement 25.3 fix (D-A11) |

## Architecture

```mermaid
flowchart TD
    CLI[cli.ts: parse options, install SIGINT handler] --> PRE[precheck: paths]
    PRE -->|exit 2, no Outcome_File| X2((exit 2))
    PRE --> GUARD[RunGuard: clock, limits, child registry]
    GUARD --> FACTS[Facts_Reader: header, inflate, tag walk]
    FACTS -->|not-swf, damaged, as1-2, too-large| REF[refused]
    FACTS --> SCAN[ABC_Name_Scan on the DoABC bytes]
    SCAN -->|obfuscated| REC[recover stage: rename, deobfuscate on a copy]
    SCAN -->|not obfuscated| UNP
    REC -->|both steps ok| UNP[unpack once: the recovered copy]
    REC -->|a step failed, time left| UNPO[unpack once: the original]
    REC -->|a step failed, no time| TL[refused time-limit]
    UNPO --> CONV
    UNP --> CONV[convert]
    CONV --> TR[translate]
    TR --> EMIT[emit]
    EMIT --> GATE[type-check gate]
    GATE --> VER[verify, only with --verify]
    VER --> DEC
    GATE --> DEC[decideOutcome]
    REF --> DEC
    TL --> DEC
    GUARD -->|limit hit| DEC
    DEC --> CLEAN[cleanup plan]
    CLEAN --> WRITE[write outcome.json, print Outcome_Line]
    WRITE --> EXIT[exit code table]
```

`runPipeline` keeps its signature (stages and io injected, returns the exit code). Inside, every stage runs through `guard.runStage(name, fn)`, which records name, result and duration and enforces the allowance. The existing progress lines stay. Unpack runs once per run; no path in the diagram unpacks twice.

### Run record and decision

```mermaid
sequenceDiagram
    participant P as runPipeline
    participant G as RunGuard
    participant D as decideOutcome
    participant W as outcomeFile
    P->>G: runStage(facts)
    G-->>P: Facts or Refusal
    loop each stage
        P->>G: runStage(name, fn)
        G-->>P: result, or TimeLimitError (children killed)
    end
    P->>D: RunRecord(facts, stages, report numbers, gaps, error, limits, recovery)
    D-->>P: Outcome (one of four)
    P->>W: cleanup plan, then write outcome.json (tmp + rename)
    P-->>P: print Done (project outcomes), then Outcome_Line last
```

## Components and Interfaces

### Component map

| Area | Files (new or changed) | Requirements |
|---|---|---|
| Outcome | `src/outcome/outcome.ts` (types, `decideOutcome`), `outcomeFile.ts` (serialise, parse, atomic write), `exitCode.ts` (the one table), `reasons.ts` (sentences, scrub), `gaps.ts` (gap kinds, summary), `classifyError.ts` | 1, 2, 4, 5, 7, 10 |
| Facts | `src/facts/readFacts.ts` (pure over a `Uint8Array`), `swfBody.ts` (decode, damage classifier, tag walk), `abcNames.ts` (ABC_Name_Scan, pure) | 3, 5, 14 |
| Limits | `src/pipeline/guard.ts` (RunGuard), `limits.ts` (option, env, default resolver), `processTree.ts` (spawn registry, `killTree`) | 6, 7, 9 |
| Pipeline | `src/pipeline/pipeline.ts` (uses the above), `cli.ts` (options, signals, `SET.json` message fix), `src/pipeline/cleanup.ts` (pure plan) | 1, 5, 6, 9, 25 |
| Unpack | `src/unpack/spawnFfdec.ts` (register child, tree kill), `src/unpack/errors.ts` (unchanged codes) | 5, 6, 25 |
| Recovery | `src/recover/recover.ts` (edge: two FFDec calls on a copy), `src/recover/detect.ts` (pure: verdict from the scan counts) | 14 to 16 |
| API stubs | `src/translate/flashApiTable.ts`, `scripts/gen-api-stubs.ts`, `template/shim/stubs/*.ts` (generated), `template/shim/Point.ts` | 17, 18 |
| Buttons | `src/convert/buttons.ts`, `ffdecXml.ts`, `readUnpacked.ts`, `convertModel.ts`, `template/runtime/scene.ts`, `template/runtime/buttonModel.ts`, `player.ts`, `loader.ts`, `hitTest.ts`, `template/shim/SimpleButton.ts`, `events.ts` | 20, 21 |
| Tests | `test/support/hostileSwf.ts` (byte builder, includes an ABC constant pool builder), `test/support/buttonSwf.ts` (xml2swf fixture), unit, property and e2e files named in Testing Strategy | all |
| Docs | `docs/outcome.md`, steering updates | 2.8, 6.3, 10 |

### Block A: the contract

| # | Decision | Reason | Rejected alternative |
|---|---|---|---|
| D-A1 | `decideOutcome(record): Outcome` is pure and total. The record holds facts (or null), the stage list, a `failure` (a classified error or null), the report numbers (or null), the gap list, the limits and the recovery object. | Requirement 1.8 and Property 1 need a function to test over generated records. | Deciding in the `catch` and `finally` blocks of `runPipeline` |
| D-A2 | Error to Outcome by a table keyed on the error `code` (`classifyError.ts`): `INVALID_SWF` refused `not-swf`; `NOT_AS3` refused `actionscript-1-2`; `FFDEC_TIMEOUT` refused `time-limit`; **`FFDEC_EXIT` thrown by the Unpack stage refused `damaged`** (reason "the file could not be read"; the FFDec stderr text goes only to `ffdec-<Reference_Id>.log`, Requirement 5.12); `JAVA_NOT_FOUND` and `FFDEC_NOT_FOUND` failed (reason says a required component is missing, no tool name); `MISSING_EXPORT`, `XML_VERSION`, `MISSING_HEADER_VALUE` and every other error, including any thrown by our own code (`TypeError`, a bug in Translate, a non-Error value), failed `internal-error`. An `FFDEC_EXIT` thrown by a recovery step is not an Outcome: it is a recovery failure (D-B4). | Requirement 5.12 and 5.13: an FFDec exit is the only error that says the input is unreadable; our own errors must never be called `damaged`. The classifier checks `instanceof FfdecExitError` and the stage name, never the message text | `instanceof` chains in the stage loop; matching on message text |
| D-A3 | Gap kinds counted: `untranslated-class`, `class-omitted`, `untranslated-code`, `unbound-instance`, `unrecoverable-class`, type errors of the gate, and `stats.placementsDropped`. Not counted: `text-metrics`, `filter`, `stroke-style`, `mask`, `morph-shape`. | Requirement 4.2. `placement dropped` is only a message prefix today, so Convert returns the number in `stats`. | A flag `dropped: true` on entries (changes every golden) |
| D-A4 | Stage allowance is `stageLimit × weight`: recover 2, unpack 3 (2 until Task 32, amended by D-E3: allowances 120, 180, 60, 60, 60, 60 and 180 s, 720 s in all, each below the 300 s run limit, which stays the tighter bound), convert 1, translate 1, emit 1, gate 1, verify 3. The run limit is checked at every stage start and by one run timer. Defaults: 20 MiB, 300 s run, 60 s base. `docs/outcome.md` states that the web side passes its run limit (default 300 s) as `--run-limit` and keeps its own kill 30 s above it as a backstop (branch `wip/ui`, merged separately; it was a 180 s kill before, superseded by Task 28); this spec changes nothing under `web/`. | Unpack and recovery each run two FFDec calls of up to 60 s; Verify holds Reference_Frames (120 s), Replay (60 s) and render waits. A flat limit would cut stages shorter than their own per-call limits. The recover weight is an amendment (A1). | A flat limit |
| D-A5 | On a limit: `guard.killAll()` (taskkill tree for every registered pid), the stage promise is abandoned, the Outcome is `refused` `time-limit` with the stage name and the limit in the reason, the cleanup plan runs, and `main` ends with `process.exit(code)` after flushing stdout. | An abandoned async stage must not keep the event loop alive. | Waiting for the stage to settle |
| D-A6 | `Reference_Id` is the first 8 hex digits of `sha256(inputSha256 + "\n" + stage + "\n" + errorName + "\n" + errorMessage)`. The Failure_Log holds the full stack. `ffdec-<Reference_Id>.log` holds the FFDec text of a `damaged` refusal from an FFDec exit; the same id derivation applies with the error name `FfdecExitError`. | Requirement 5.7: derived from the run, reproducible, not clock-only. | Random bytes |
| D-A7 | `main` installs `SIGINT` (and `SIGBREAK` on Windows) handlers that call `guard.abort('signal')`, write a `failed` Outcome with reason `run stopped by signal`, and exit 1. | Requirement 7.4. On Windows Node cannot deliver `SIGTERM` to a handler, so the web server's kill is not catchable (O5). | Handling `SIGTERM` only |
| D-A8 | `outcome.json` is written to `outcome.json.tmp-<pid>` in the output directory, then renamed. If the directory is not writable the Outcome_Line is still printed (Requirement 5.8). | Atomic reader view (Requirement 2.11). | In-place write |
| D-A9 | Emit refusals (`OUTPUT_DIR_NOT_EMPTY`, `UNSAFE_FORCE_TARGET`) return 2 with one `error [pipeline]:` line and no Outcome_File. | Requirement 1.9; F11. | Keep exit 1 |
| D-A10 | `stages[].durationMs` is the only time-dependent field. The determinism test drops it by name (Requirement 11.7). | | |
| D-A11 | Small findings of Requirement 25, each in its own commit with the test the requirement names (table below). | Requirement 25 | A separate cleanup task |

#### Small findings fixed with the file (Requirement 25)

| # | Finding | Fix | Test | Commit when |
|---|---|---|---|---|
| S1 | `spawnFfdec` calls `child.kill()` on a timeout, which ends the Java process only (read in `src/unpack/spawnFfdec.ts`). | Register the child with the guard registry and call `killTree(pid)` on timeout. `killTree` moves to `src/pipeline/processTree.ts` | Process test of Requirement 6.14 and 6.15: a spawned `node` child with a grandchild is gone by pid | The task that first changes `src/unpack/` |
| S2 | In `cli.ts` the message of the `handwritten/SET.json` read error is a double-quoted string, so `${...}` is printed literally (stated in the requirements; `cli.ts` is read again when the task starts). | Print the exception text. The error is a usage-class error, exit 2, `error [pipeline]: <text>` | Unit test with an unreadable `SET.json` | The task that first changes `cli.ts` |
| S3 | The `[translate] ok (...)` line counts statuses before the type-check gate (F17), so it disagrees with the Translation_Report. | Keep the line in place, bracket text included (`[translate] ok (N classes: a clean, b loose, c unsupported)`), and print directly after it one indented line, `  counts taken before the type check; final counts are in translation-report.json`. The numbers after the gate are in the Outcome_File and the report. Amended at Checkpoint 1, owner decision: the first version put `before type check` inside the brackets, on the claim that the web server reads only `^Done: ` and `^error [stage]: `. That claim was wrong: `web/server/stageLines.ts` also parses the `[stage] ok (...)` detail with an anchored pattern for the translate counts, and `test/web/server.e2e.test.ts` failed (Task 5, 1a656b3). The indented line matches no pattern there and is read as `log`. `web/` is not changed. | Unit test of the line text; the existing tests that match the old text are updated in the same commit | The task that first changes that line |
| S4 | `tech.md` says Scene_JSON `formatVersion` 2. | State 3 today and 4 with buttons, and add the new options and the Outcome_File (Requirement 10.4) | A read of the file in the commit review (not machine-tested) | The task that first changes `tech.md` |

#### Facts_Reader

Pure function `readFacts(bytes, limits): FactsResult` where the result is `{ ok: true, facts, body }` or `{ ok: false, reasonCode, facts | null }`. `body` is the decoded SWF body, kept so the ABC_Name_Scan does not decode twice. No file or process access; the caller reads the file.

SWF layout used (confirmed on the four files of F8): bytes 0 to 2 signature, byte 3 version, bytes 4 to 7 uint32 little-endian length of the whole file after decompression (header included), then for `FWS` the body, for `CWS` a zlib stream of the body, for `ZWS` a uint32 compressed length, 5 bytes of LZMA properties and the LZMA stream. The body starts with the frame RECT (5 bits of `Nbits`, then four signed fields of `Nbits` bits, padded to a byte), a uint16 frame rate in 8.8 fixed point, a uint16 frame count, then tag records. A tag record header is a uint16 little-endian: tag code in the upper 10 bits, short length in the lower 6; length 63 means a uint32 length follows.

| Step | Rule | Outcome on failure |
|---|---|---|
| 1 | Fewer than 8 bytes, or a signature other than `FWS`, `CWS`, `ZWS` | refused `not-swf` |
| 2 | File size above `maxSize` | refused `too-large` (checked by the caller before reading the whole file) |
| 3 | `FWS`: body is the rest. `CWS`: `inflateSync(rest, { maxOutputLength: min(declared, MAX_UNCOMPRESSED) })`. `ZWS`: stop here with header-only facts | `Z_BUF_ERROR` or a short result: refused `damaged`. Declared length above `MAX_UNCOMPRESSED` (128 MiB, chosen, not measured): refused `too-large` |
| 4 | Decoded length plus 8 differs from the declared length | refused `damaged` |
| 5 | Parse RECT, rate, count; walk tag records by length; collect tag codes and the byte ranges of tags 72 and 82; require an `End` tag (code 0) at the end | a record that runs past the body, or no `End`: refused `damaged` |
| 6 | `scriptVersion`: `as3` if tag 72 (`DoABC`) or 82 (`DoABC2`) exists; else `as1-2` if tag 12 (`DoAction`) or 59 (`DoInitAction`) exists; else `unknown` | `as1-2` is refused `actionscript-1-2` |

`unknown` goes on to Unpack. A SWF whose `FileAttributes` say AS1 or AS2 stops at Unpack through the existing `NotAs3Error`, which maps to refused `actionscript-1-2` (D-A2). Tag codes were taken from the format specification and FFDec's class ids; a hostile fixture test (Requirement 8.1) covers codes 12, 69, 72 and 82. Unknown tag codes (the `UnknownTag` that `redball4` carries) are walked by length and ignored.

The result separates header facts from FFDec facts (Requirement 3.10): `facts.source` is `{ header: [...], ffdec: ['abcClassCount'] }`. `abcClassCount` is added after Unpack as the number of `.as` files under `scripts/` (F14).

#### Outcome record

```ts
type OutcomeCode = 'converted' | 'converted-with-gaps' | 'refused' | 'failed';
type ReasonCode =
  | 'not-swf' | 'damaged' | 'actionscript-1-2' | 'encrypted' | 'too-large'
  | 'time-limit' | 'nothing-translated' | 'internal-error';

interface Facts {
  signature: 'FWS' | 'CWS' | 'ZWS';
  version: number;
  compression: 'none' | 'zlib' | 'lzma';
  sizeBytes: number;
  declaredLength: number;
  stage: { width: number; height: number } | null;      // null for ZWS
  frameRate: number | null;
  declaredFrames: number | null;
  scriptVersion: 'as3' | 'as1-2' | 'unknown';
  abcClassCount: number | null;                         // after Unpack
  source: { header: string[]; ffdec: string[] };
}

interface OutcomeRecord {
  formatVersion: 1;
  outcome: OutcomeCode;
  reasonCode: ReasonCode | null;                        // null for the two project outcomes
  reason: string;                                       // at most 200 characters, scrubbed
  facts: Facts | null;                                  // null only if the Facts_Reader did not run
  numbers: {
    candidateClasses: number; translatedClasses: number; cleanClasses: number;
    looseClasses: number; untranslatedCodeClasses: number; unparsedClasses: number; unsupportedClasses: number; omittedClasses: number;
    typeErrors: number; droppedPlacements: number; namedLimits: number;
  } | null;                                             // null before Translate ran
  gaps: Array<{ kind: GapKind; count: number; examples: string[] }>;  // examples at most 5
  limits: { maxSizeMiB: number; runLimitS: number; stageLimitS: number; stageWeights: Record<string, number> };
  stages: Array<{ name: StageName; result: 'ok' | 'error' | 'skipped'; durationMs: number }>;
  obfuscated: { detected: boolean; namesScanned: number; invalidNames: number;
                sourceSignals: number | null } | null;  // sourceSignals after Unpack of a recovered file
  recovery: RecoveryRecord | null;
  referenceId: string | null;                           // 8 hex, only for failed
}
```

`numbers` is `null` for a refusal before Translate (Requirement 2.3). `reason` is built from templates in `reasons.ts`; every value that enters a template passes `scrub()`, which cuts anything that looks like a drive or root path, a stack frame (`at ` lines), an environment variable name or FFDec stderr text, and truncates to 200 characters.

`converted-with-gaps` reason (Requirement 4.7): `<N> of <M> classes translated, <E> type errors; most gaps: <kind> (<n>), <kind> (<n>)`. For a recovered run the sentence is prefixed `obfuscated: names renamed, N of M classes recovered; ` and the sum is cut to 200 characters by dropping the gap part first (Requirement 16.4).

#### Limits and process tree

| Item | Design |
|---|---|
| Resolver | `resolveLimits({ options, env })`: option beats variable beats default; a value that is not a positive integer is a usage error (exit 2). Defaults: 20 MiB, 300 s run, 60 s stage base. The size default equals `web/server/upload.ts` |
| Weights | recover 2, unpack 2, convert 1, translate 1, emit 1, gate 1, verify 3 (Requirement 6.2 plus the recover stage, A1) |
| Clock | `interface Clock { now(): number; setTimeout(fn, ms): Handle; clearTimeout(h): void }`; the real one wraps `performance.now` and `setTimeout`; tests pass a fake |
| `runStage` | Starts the stage, records the start time, races it with an allowance timer, checks the run deadline before starting, records `{name, result, durationMs}` |
| Registry | `spawnFfdec` and the Chromium launcher call `registry.track(child)`; `killAll()` calls `killTree` for every tracked pid still alive. The Replay child (`replay.ts`) is tracked the same way. Recovery steps use `spawnFfdec` and so are tracked |
| `killTree(pid)` | Windows: `taskkill /PID <pid> /T /F` without a shell (the code in `launchChromium.ts`, moved and exported). Elsewhere: `process.kill(-pid, 'SIGKILL')` for a detached child, else `child.kill('SIGKILL')` |
| Verify | `verifyStage` receives the guard's registry through the existing `launchChromium` call so Chromium is killed on a limit |
| Per-call bound | Amended at Checkpoint 1, owner decision: each FFDec call is bounded by the remaining stage allowance, not a fixed 60 s. Cause: unpack.ts gave both calls a fixed 	imeoutMs of 60 s, so redball4 ended `refused time-limit` at 60065 ms inside a 120 s allowance. UnpackInput.allowanceMs carries the allowance from 
unPipeline; each call gets what is left, and the timeout names the limit (120 s stage limit). The guard timer stays the outer bound. Open: Reference_Frames in Verify keeps its fixed 120 s (fdecFrames.ts), inside the 180 s verify allowance, so it is not cut early |
| Wait time | Time spent waiting for a `PIPELINE_SLOTS` slot is a test-side wait and never enters the pipeline's clock |
| Time for redball4 | Expected under the defaults: recover 34 s of 120 s, unpack about 88 s of 120 s, convert 40 s of 60 s, translate 12 s, emit and gate 13 s: about 190 s of 300 s. The recovered Unpack time is not measured (O8). The Checkpoint 2 report gives the measured stage times and the share of the run limit |

#### Cleanup plan

`planCleanup({ preExisting, writtenByRun, keep })` is pure and returns the set to delete: `writtenByRun \ preExisting`, minus the Outcome_File, the reports, the Failure_Log and `ffdec-<Reference_Id>.log`. `preExisting` is the listing of the output directory taken after the precheck and before the first write. `writtenByRun` is Emit's file list plus the report files. If Emit throws part-way it has no complete list; Emit gets an optional `onWrite(path)` callback so the pipeline keeps a journal (O6). The work directory (which holds the recovery copy) is removed on `refused` and `failed` unless `--keep-work` or `--work-dir`.

### Block B: recover and stub

| # | Decision | Reason | Rejected alternative |
|---|---|---|---|
| D-B1 | (Replaced.) Recovery runs before the only Unpack. The ABC_Name_Scan (D-B2) decides from the input bytes; if obfuscated, the recover stage makes the copy, renames and deobfuscates, and Unpack runs once on the recovered copy. The original is unpacked only after a recovery failure with time remaining (D-B5). | Requirements 15.3 and 16.1. No double Unpack: the 88 s Unpack is paid once | Unpack the original first, detect from names and sources (the old D-B1), then Unpack again |
| D-B2 | **ABC_Name_Scan** (`src/facts/abcNames.ts`, pure over a `Uint8Array`). Input: the ABC bytes of every `DoABC` (tag 72: the whole payload) and `DoABC2` (tag 82: skip a u32 flags field and a zero-terminated name) tag. Walk the `cpool_info` in order: `int_count` s32 values (u30 count, entries 1 to count-1), `uint_count` u32 values, `double_count` 8-byte values, `string_count` strings (u30 byte length then UTF-8 bytes), `namespace_count` entries (kind byte, u30 name), `ns_set_count` sets (u30 size then that many u30), `multiname_count` entries (kind byte then the data of the kind: `0x07` and `0x0D` two u30 (namespace, name); `0x0F` and `0x10` one u30 (name); `0x11` and `0x12` none; `0x09` and `0x0E` two u30 (name, namespace set); `0x1B` and `0x1C` one u30 (namespace set); `0x1D` two u30 and a list (name, count, `count` type indexes)). Entry 0 of each table is implicit. A multiname name index points into the string table; the scan collects the strings of the multiname names (non-empty) and counts those that do not match the identifier rule `^[\p{L}_$][\p{L}\p{N}_$]*$` (Unicode, flag `u`). Namespace names (package paths, which hold dots) and literal strings are not counted. Verdict: `obfuscated` when `invalidNames / namesScanned >= 0.20` and `invalidNames >= 5`. An unknown multiname kind, a read past the end, or no ABC tag gives `{ obfuscated: false }` with the counts read so far (Requirement 14.4); the damage is Requirement 5's business. | F15: measured on eight real files: 0 of 21 to 539 names in the seven committed files, 1 537 of 2 919 (52.6 %) in the brief's file. 20 % sits far from both; the floor of 5 stops a tiny file with one odd name. The layout is measured, not guessed. | Count in decompiled source (needs FFDec and a second Unpack); scan all strings (literal strings with spaces would count) |
| D-B3 | Commands, read from `java -jar tools/ffdec/ffdec-cli.jar -help renameInvalidIdentifiers` and `-help deobfuscate` (FFDec 26.4.0): `-renameInvalidIdentifiers (typeNumber\|randomWord) <infile> <outfile>`, then `-deobfuscate <level> <infile> <outfile>` with level `traps/2/max` or `deadcode/1`. Used: `typeNumber` and `max`, in that order. `randomWord` is rejected: its names may not be the same on every run (not measured). | Requirement 16.2; F6. Same input gave same names across the two runs measured (O7) | `randomWord`; `-deobfuscate` alone |
| D-B4 | The recover stage works in `<work>/recovery/`: `in.swf` (byte copy of the input), `renamed.swf`, `recovered.swf`. Unpack then reads `recovered.swf`. `args.swfPath` is untouched and Verify reads it (Requirement 15.2). Each of the two FFDec calls has the existing 60 s per-call limit. If a call exits with an error or times out, or the copy cannot be made, the stage ends with `recovery.fallback` and the run goes on as D-B5 says. An `FFDEC_EXIT` here never becomes the Outcome | Requirement 15 and 16.3 | In-place rewrite |
| D-B5 | Fallback: when recovery fails, Unpack the original once, but only if the remaining run time is at least the allowance of unpack (2 × the stage base = 120 s by default); otherwise the Outcome is `refused` `time-limit`. The `recovery` object records `attempted: true`, `fallback: true` and which step failed. There is no keep-if-better rule and no baseline: the recovered file is translated and the Outcome says that it was recovered, not that it improved anything (Requirement 16.5). | Requirement 15.3. A comparison would need a second Unpack, Convert and Translate | Compare with a proxy baseline (the old D-B5); skip recovery when time is short (the old D-B6) |
| D-B6 | The recover stage has Stage_Weight 2, allowance 120 s by default. Measured need: about 34 s (rename 5.1 s, deobfuscate 29.0 s, F7), so the allowance is 3.5 times the measured time, the same weight as unpack (two FFDec calls, each limited to 60 s). It counts in the run limit as its own stage and not inside unpack. | The owner's decision to count recovery as its own stage; same shape as unpack. This amends Requirements 6.2 and 6.10 (A1) | Weight 1 (60 s allowance, 1.8 times the measured time: thin on a slower machine) |
| D-B7 | Unrecoverable classes: after Unpack of the recovered copy, a Candidate_Class whose source still holds `§§push` or `§§pop`. Each is an `unrecoverable-class` entry. The count goes to `recovery.unrecoverableClasses` and `obfuscated.sourceSignals`. | Requirement 16.7. This count stays after Unpack because it needs the decompiled source | Silent omission |

`RecoveryRecord` (Data Models) holds `attempted`, `renamedIdentifiers`, `deobfuscated`, `candidateClasses`, `recoveredClasses`, `unrecoverableClasses` and `fallback`, as Requirement 16.4 lists, plus `skipped` for `not-obfuscated` and `copy-failed`. It has no `kept` and no baseline.

#### Flash_API_Table and stubs

Table entry: `{ qualified: 'flash.media.Sound', policy: 'stub' | 'real' | 'gap', reason: string, members?: MemberSig[] }`. `MemberSig` is `{ name, kind: 'method' | 'getter' | 'setter' | 'field' | 'constructor', static, params: [name, type, default?][], returns, neutral }`. `neutral` is a primitive neutral value (0, empty string, false, null for a nullable primitive-free case, empty array) **or** `{ stubObject: '<Class>' }` for a member that returns an object in Flash. Lookup `policyOf(qualified, member?)` is total: unknown class gives `absent`.

Rule for the policy, applied when adding an entry:
- `stub` when the effect leaves the page (sound output, network, navigation, storage, host calls) and either no return value feeds a computation or the missing result leaves the game visibly waiting, not silently wrong.
- `real` when a small pure class has exact semantics (`Point`).
- `gap` when the return value feeds computation or the class is out of scope.

| Policy | Classes | What the game sees | Can stall a game |
|---|---|---|---|
| `stub` | `Sound`, `SoundChannel`, `SoundTransform`, `SoundMixer` | Silent. `Sound.play()` returns a `SoundChannel` stub object (non-null, Requirement 17.4); `SoundChannel` holds a `SoundTransform` stub. `length` and `position` are 0. `soundComplete` is never dispatched | Yes (No_Event_Stub): a game that waits for `soundComplete` stays waiting. `Sound` and `SoundChannel` |
| `stub` | `URLRequest` (stores `url`, `method`, `data`), `navigateToURL` (no-op), `URLVariables`, `LocalConnection`, `Security`, `ExternalInterface` (`available` false, `call` returns null) | No network, no navigation. `Security.allowDomain` is a no-op | `LocalConnection` (messages never arrive). The others dispatch no event in Flash either |
| `stub` | `URLLoader` | `load` does nothing; `data` is null; `complete`, `ioError` and `progress` are never dispatched | Yes (No_Event_Stub): a loader-gated screen stays visibly waiting |
| `stub` | `Loader` | `load` does nothing; `content` is null; `contentLoaderInfo` is a non-null stub object whose events never fire | Yes (No_Event_Stub): a preloader that waits for `complete` waits forever |
| `stub` | `SharedObject` | `getLocal` returns a non-null object whose `data` is an in-memory `Object` for the life of the page; `flush` returns the empty string; no browser storage | No |
| `real` | `flash.geom.Point` | As Flash | No |
| `gap` | `ByteArray`, `BitmapData` and `Bitmap` data calls, `XML` and `XMLList` (E4X), `Matrix`, `ColorTransform`, `ApplicationDomain`, `getDefinitionByName`, `Capabilities`, `NetConnection`, `NetStream`, `Video`, `Socket`, `XMLSocket`, `FileReference`, `Camera`, `Microphone`, `Context3D` | Not stubbed. The unresolved name stays a visible type error and the Translation_Report names class and member as `flash-api-gap` | Not applicable |

Why `gap`: a neutral value would be silently wrong (bytes, geometry, parsed XML, pixels, reflection results, a device value), or the class is in the out-of-scope list of `product.md`. Members of a `stub` class that are not in its table entry are `absent` and stay visible gaps (Requirement 17.5).

Mechanism (Requirement 17.12): the table is the single source. `scripts/gen-api-stubs.ts` (`npm run gen:api-stubs`) writes `template/shim/stubs/<Class>.ts` from the entries, each member body being `stubCall('<Class>.<member>', neutral)`. `stubCall` adds one Named_Limit `api-stub:<Class>.<member>` the first time (a `Set` in the helper) and returns the neutral value typed by the signature. A `{ stubObject }` neutral returns a lazily created singleton per owner object, constructed through the stub class itself (so `Sound.play().soundTransform` is also non-null). A constructor records `api-stub:<Class>.constructor`. A class in the No_Event column also records `api-stub-no-event:<Class>` at its first use (first constructor or first member call, once per run), with the text that the class dispatches no completion event. `npm run gen:shim-members` then sees the stub classes like any Shim class, so the existing implicit-`this`, import and member-table logic needs no new path. The generated files are committed with the table change and the regenerated `shimMembers.generated.ts`.

Rejected: one generic `Proxy` stub class (no member types, so the type errors the stub exists to remove remain); a hand-written Shim class per stub (duplicates the table).

Shipping (Requirement 17.2, decided): stub classes sit in `template/shim/stubs/` and are exported from `index.ts`, so they ship in every Emitted_Project and Vite drops unused ones. Emit does not generate or filter stubs. The count of "classes whose type check depends on a stub" (Requirement 17.9) is a pure scan of each translated class's resolved Shim imports against the table's `stub` set, written to `numbers` through `namedLimits` and to the Outcome; the Fidelity_Report lists the `api-stub:` and `api-stub-no-event:` limits that the Replay observed, and states which listed stubs can stall a game (the last column above, as data in the table: `canStall: true`).

#### Point

`template/shim/Point.ts`, formulas from Ruffle `core/src/avm2/globals/flash/geom/Point.as` at `4a8d396` (fetched and read in this design):

| Member | Rule |
|---|---|
| constructor `(x = 0, y = 0)` | stores both |
| `length` | `Math.sqrt(x*x + y*y)` |
| `toString()` | `"(x=" + x + ", y=" + y + ")"` |
| `add(v)`, `subtract(v)`, `clone()`, `equals(p)` | new `Point` of the sums, differences, copy; `equals` is `==` on both fields |
| `normalize(t)` | `len = length`; only when `len > 0`: scale by `t / len`; length 0 leaves the point unchanged |
| `offset(dx, dy)` | adds in place |
| `distance(a, b)` | `b.subtract(a).length` |
| `interpolate(a, b, f)` | `new Point(b.x - (b.x - a.x) * f, b.y - (b.y - a.y) * f)`, so `f = 1` gives `a` and `f = 0` gives `b` |
| `polar(len, angle)` | `new Point(len * cos(angle), len * sin(angle))` |
| `copyFrom(p)`, `setTo(x, y)` | in-place assignment |

The Flash_API_Table entry is `real` with no members (the Shim class is the source). `ADDED_APIS.md` lists it with the fixture line.

### Block C: buttons

#### Convert

The FFDec dump names, verified for v2 on `redball4.swf` and for v1 on the generated round trip (F3):

| Tag | Attributes | Children |
|---|---|---|
| `DefineButton2Tag` | `buttonId`, `trackAsMenu`, `reserved`, `forceWriteAsLong` | `<characters>` of `BUTTONRECORD`, `<actions/>` |
| `DefineButtonTag` | `buttonId`, `actionBytes`, `forceWriteAsLong` | `<characters>` of `BUTTONRECORD` |
| `BUTTONRECORD` | `buttonStateUp`, `buttonStateOver`, `buttonStateDown`, `buttonStateHitTest`, `characterId`, `placeDepth`, `buttonHasBlendMode`, `buttonHasFilterList`, `reserved` | `placeMatrix` (a `MATRIX`, twips), `colorTransform` (v2 only, `CXFORMWITHALPHA`) |

`buttons.ts` (pure) turns the records into `{ up, over, down, hit }`, each a `DisplayListEntry[]`: a record joins every state whose flag is true; entries are ordered by `placeDepth`; two records at one depth in one state keep the later one (Named_Limit `button-duplicate-depth`); `name` is empty. Records with `buttonHasBlendMode` or `buttonHasFilterList` are drawn without them and record `button-record-effects`. Button actions (`<actions>`, `actionBytes`) are AVM1 and ignored with a Named_Limit `button-avm1-actions`. `DefineButtonSound` and `DefineButtonCxform` tags are not read (Named_Limit `button-sound`). The code comment and commit body label the `DefineButtonTag` names "measured on a generated file" (Requirement 20.3).

Scene_JSON: new symbol `{ type: 'button', className?, trackAsMenu, states: { up, over, down, hit } }`. `formatVersion` is 4 when the scene holds a button symbol and 3 otherwise; the reader accepts 2, 3 and 4. All committed goldens keep their bytes. `unsupported-features.json` stops listing `button` entries for placements the Runtime now draws; `placementsDropped` falls with them.

#### Runtime and Shim

Read in Ruffle `core/src/display_object/avm2_button.rs` and `core/src/player.rs` at `4a8d396`:

| Behaviour | Source rule |
|---|---|
| State change table | `RollOver` to Over, `RollOut` to Up, `Press` to Down, `Release` to Over, `ReleaseOutside` to Up, `MouseUpInside` to Up, `DragOut` to Over, `DragOver` to Down. Other events do nothing |
| Drawn child | only the child of the current state is parented to the button; the hit area is never a child |
| Pick | the button is hit when the current state child is hit, or `hit_area.hit_test_shape` hits; requires `visible` and `mouse_enabled` |
| Disabled | `filter_clip_event` ignores every event except key presses when `enabled` is false and when `visible` is false |
| Release outside the pressed object | `ReleaseOutside` is sent to the pressed object, then the object now under the pointer gets `RollOver` immediately |
| While the mouse is down | AVM2 movies still send `RollOut` and `RollOver` to the old and new hovered objects, and `DragOut` or `DragOver` to the pressed one |

Decisions:

| # | Decision | Reason |
|---|---|---|
| D-C1 | `SimpleButton` (Shim) extends `InteractiveObject` and holds four state display objects. The loader builds each state as an unparented container of the entries; the button's render list holds the current one. | Matches `Avm2Button`; hit state never enters the render list |
| D-C2 | `buttonModel.ts` is a pure table: `step(state, event) -> state`, the Ruffle table above, plus `hitRegion(button, state)`. The Player calls it; the Player holds no button logic. | Properties 24 and 25 test the table and the integration against a (pressed, hovered) model |
| D-C3 | Hit region = shapes of the current state container union shapes of the hit container, each through the placement transform. With no hit records the hit container is empty, so the shapes of the current state serve (Requirement 20.8). | F4 |
| D-C4 | The Player gains hover tracking: on a pointer move it compares the new Hit_Target with the previous one and dispatches `mouseOut` and `rollOut` at the old, `mouseOver` and `rollOver` at the new, before `mouseMove` handlers run. The Shim `MouseEvent` gains `MOUSE_OVER`, `MOUSE_OUT`, `ROLL_OVER`, `ROLL_OUT`. `mouseOver` and `mouseOut` bubble; `rollOver` and `rollOut` do not. While a button is down the same events fire (AVM2 rule above). | F5. The bubbling split follows Flash documentation, not read in Ruffle (O9) |
| D-C5 | The Hit_Target for any pointer event inside a button is the button itself (`mouseChildren` is false for buttons). | `mouse_pick_avm2` returns `Hit(self)` for a hit inside a state |
| D-C6 | `enabled = false`: no mouse event, and the drawn state returns to Up. | Requirement 20.12. Ruffle only ignores events; whether it resets the state is unread (O10) |
| D-C7 | Fixtures: `test/support/buttonSwf.ts` writes an XML skeleton with shapes, one `DefineButtonTag` and one `DefineButton2Tag`, and runs `-xml2swf`. The generated file is the fixture for the e2e test; unit and property tests use generated Scene_JSON and the FakeBackend. | F2, F3. Nothing copyrighted is committed |
| D-C8 | If the Block C budget (stop threshold 80 credits) is exceeded by a third, deliver up state, hit area and click only. Over and down become Named_Limits `button-state:over`, `button-state:down`, `button-hit-area` (Requirement 20.13). | D-C4 is the largest part of the over state |
| D-C9 | The button behaviour added to the Runtime is recorded in `.kiro/steering/flash-behaviour.md` in the commit that adds it, with its label (read, measured or Open_Item) (Requirement 20.20). | Requirement 20.20 |

Player events for a button: `dispatchClick` is unchanged (press and release on the same Pressed_Target). `buttonMode` and `useHandCursor` stay stored only.

### Block D: several class names for one character id (D-D1, Requirement 26.1 to 26.3)

Evidence. Ruffle at `4a8d396` (`core/src/display_object/movie_clip.rs`, `preload_symbol_class` lines 4261 to 4280 and the load loop 4347 to 4435), read, not measured against a running Ruffle: every SymbolClass pair is kept in tag order and none is de-duplicated; each class is linked to its symbol (`set_class_symbol`, line 4363); the LAST pair for an id sets the class that instantiates the character (`set_avm2_class`, line 4375); an id with no character (id 0) sets the root class only if none is set yet (lines 4400 to 4417); ExportAssets pairs are not used for AS3 classes. FFDec 26.4.0, measured on the generated fixture of task 25.1 (`test/support/symbolClassSwf.ts`) and on two local files: `symbols.csv` is the pairs of every SymbolClassTag and ExportAssetsTag item concatenated in FILE TAG ORDER (repeats kept, not de-duplicated, unmarked), so it is not "the SymbolClass pairs, then the export pairs", and no prefix of it is the class list. The generated fixture has the tags ExportAssets, SymbolClass, ExportAssets, SymbolClass and its csv has the same four blocks in that order; both local files also have the order ExportAssets, SymbolClass, ExportAssets, SymbolClass (checkpoint 4 review, first measurement of the order: a first reading of task 25 had "two blocks" and was wrong). One local file has 333 lines, 174 distinct, 174 SymbolClass pairs and no id with two names (its repeats come from ExportAssets duplicates; it has 2 ExportAssetsTag items with 159 pairs, every one also a SymbolClass pair); the other has 312 lines, 303 distinct, 105 ids with two names, 199 SymbolClass pairs and 113 ExportAssets pairs of which 104 are not SymbolClass pairs. The first reading of D-D1a (first N lines) dropped 13 class pairs on the first file and 111 class pairs (keeping 104 export-only pairs) on the second; the scene output happened to be right for both: scene.json and translation-report.json are byte-identical before and after the fix (cause not analysed further).

| # | Decision | Reason |
|---|---|---|
| D-D1a | `readUnpacked` takes the class links from the dump, not from `symbols.csv`: `parseStructure` returns the (id, name) pairs of the SymbolClassTag items in tag order (`symbolClassPairs`, names exactly as dumped), and `readUnpacked` validates each name (Qualified_Name) and uses that list as `TagsModel.symbolClasses`. Class sources are still read from the scripts directory. `symbolClassPairs(csvEntries, dumpPairs)` in `src/convert/classLinks.ts` returns the dump pairs, or every csv entry when a model carries none (a hand-built `TagsModel`). | Measured order of the csv: both tag types in file tag order, so a prefix is wrong (see the evidence of D-D1). The dump keeps the tags apart. With no SymbolClassTag the list is empty. |
| D-D1b | ExportAssets names are not links and no warning or Named_Limit is added. | Ruffle ignores them for AS3 classes, so nothing the Flash movie does with a class is lost; a name that exists only as an export has no class source to translate. |
| D-D1c | `buildClassLinks()` (`src/convert/classLinks.ts`, pure, never throws) gives one link per id: `primary` is the last pair in tag order (the first for id 0), `aliases` are the other distinct names in first-seen order. Identical pairs count once. | Ruffle's `set_avm2_class` order and root-class rule. |
| D-D1d | `className` of a sprite or button symbol is the primary; `classAliases?: string[]` holds the aliases. The writer emits it only when it is not empty, the readers of 2, 3 and 4 accept it, and `formatVersion` is unchanged (3, or 4 with a button). Every committed golden keeps its bytes. | A new optional field, no version bump (the rule for `className`). |
| D-D1e | Consumers use `symbolClassNames(symbol)` (`template/runtime/scene.ts`: `className` then aliases): the Emit registry (`linkedClassNames`) and the omission list (`linkedSymbols`), the child-name table of the translator (`childNamesByClass`) and its emit closure, the untranslated-class count of the Pipeline, and the Player's constructor-to-symbol map. The unbound-instance check accepts an instance name declared by any linked class of the symbol. | Every name stays linked: each alias class is registered under its own name, is translated like any linked class, and builds the same symbol. |
| D-D1f | Run time: the Player instantiates a placement with the primary class (unchanged). `new Alias()` from script finds the symbol through the map and builds the same children, because each registered constructor of a name of the symbol maps to its id. Whether an alias class extends the primary or is separate does not matter: the lookup walks the prototype chain from `new.target`, so the nearest registered constructor decides. A button symbol's aliases are registered and translated, but only its primary class is used when the Player builds a button (no script construction exists for buttons). | Keeps the Player simple and unchanged for symbols without aliases. |
### Block D: input-broken errors end `refused damaged` (D-D2, Requirement 26.4 and 26.5)

Rule. `refused damaged` is for an error that says the SWF's own data is inconsistent: the file describes something that cannot exist (a placement of a character nobody defines, a sprite that places itself, a timeline that moves an empty depth). The test is "the input is inconsistent", not "Convert threw". An error that can come from a bug of ours (our parser or validator rejecting what FFDec wrote), from FFDec's output being incomplete, from a name we cannot write to disk, or from the environment, stays `failed internal-error`, because a refusal would blame the user's file for our fault. `classifyError` keys on `code` and the stage, never on message text (D-A2 is unchanged). The `damaged` reason sentence is the existing one in `src/outcome/reasons.ts` ("the file could not be read"); no new Reason_Code, no input text in the reason. Every error that is not in the table, a plain `Error` and a non-error value end `failed internal-error`.

Every `throw` under `src/convert`, `src/unpack`, `src/facts`, `src/pipeline` and `src/recover` was read. `src/facts` throws nothing to the pipeline (`PastEnd` in `abcNames.ts` is caught inside the scan). `src/pipeline` throws `SceneParseError` (`canonicalJson.ts`, a value we built is not finite or not JSON: ours) and the run guard's `TIME_LIMIT` and `RUN_ABORTED`.

| # | Error class | Code | Throw site | Outcome | Reason code | Why |
|---|---|---|---|---|---|---|
| D-D2a | `MalformedFrameDataError` | `MALFORMED_FRAME_DATA` | `resolveTimeline.ts` `bad()` (line 111: place without character, move at an empty depth, move with a character at an empty depth, bad depth or id); `resolveTimeline.ts` line 122 (more than 65535 `ShowFrame` ops); `convertModel.ts` `malformed()` (line 52: duplicate or reserved sprite id, duplicate shape asset, a character id defined twice) | `refused` | `damaged` | The tag stream contradicts itself: a timeline operation names a depth or character the stream has not made, or two definitions share an id. Doubtful part: the id, depth, header and matrix checks of `validateModel` (`convertModel.ts` lines 57 to 117) run on the model our own parser built, so a parser bug would be reported as a damaged file; and Flash tolerates a move at an empty depth, so a file that plays may be refused. Both are accepted because the values come straight from the FFDec dump and an inconsistency there is the file's. |
| D-D2b | `UnknownSymbolError` | `UNKNOWN_SYMBOL` | `convertModel.ts` line 363, after unsupported characters were dropped from the timeline | `refused` | `damaged` | A placement names a character id that no shape, text, sprite, button or known unsupported tag defines. Doubtful: a character tag that our parser does not recognise and does not list as unsupported gives the same error; the Unsupported_Feature_List is the guard against that, and a new gap found later is a fix to the parser. |
| D-D2c | `SymbolCycleError` | `SYMBOL_CYCLE` | `convertModel.ts` line 398 (DFS over sprite and button placement edges) | `refused` | `damaged` | A sprite that contains itself, directly or through other sprites, has no finite display list. Flash's authoring tool cannot produce it; only a hand-built or corrupt SWF has one. The edges are placements read from the file, not edges we invent. |
| D-D2d | `FfdecExitError` | `FFDEC_EXIT` | `src/unpack/spawnFfdec.ts` line 66, FFDec exit status not 0 | `refused` at stage `unpack`; `failed` at any other stage | `damaged` / `internal-error` | Already so (D-A2, Requirement 5.12). FFDec refusing to read the file is the file's fault only at Unpack. |
| D-D2e | `ShapeExportError` | `SHAPE_EXPORT` | `convertModel.ts` lines 180 and 182 (`addShape`: no `<id>.svg` for a declared shape, or an empty file) | `failed` | `internal-error` | The dump declares the shape and FFDec exited 0 but wrote nothing. That is FFDec skipping a shape it cannot export, or a valid empty shape that our `addShape` rejects; neither is shown to be the file's fault. Doubtful: a corrupt shape record also gives this. |
| D-D2f | `MalformedSvgError` | `MALFORMED_SVG` | `readUnpacked.ts` line 74 (`XMLValidator` rejects a file of `shapes/`) | `failed` | `internal-error` | The text is FFDec's own output, not the SWF's data. A bad SVG is an FFDec fault (for example a character it did not escape) or a limit of our check. |
| D-D2g | `MissingExportError` | `MISSING_EXPORT` | `unpack.ts` line 134 (`shapes`, `structure.xml`, `scripts`, `symbolClass/symbols.csv` or `texts` absent after FFDec exited 0); `readUnpacked.ts` line 63 (declared shapes, no `shapes/` directory) | `failed` | `internal-error` | FFDec's output directory lacks a file we expect after a clean exit. `unpack.ts` marks `shapes` and `scripts` as always required, so a valid SWF with no shape or no class can reach it; that is our expectation, not a broken input. A truly unreadable file already stops at `FFDEC_EXIT`. |
| D-D2h | `InvalidClassNameError` | `INVALID_CLASS_NAME` | `qualifiedName.ts` `parseQualifiedName` (empty name or a segment that is empty, `.`, `..`, has a control character or one of `/ \ : * ? " < > |`), called from `symbolsCsv.ts` at Unpack and Convert and from `planEmit.ts` and `classPaths.ts` at Emit; `readUnpacked.ts` line 44 (script path leaves `scripts/`) | `failed` | `internal-error` | The SWF's name is legal for the player (ABC names are arbitrary strings, and an obfuscated file uses them) but we cannot write it as a file name. The limit is ours. The path-escape guard is a security check on a name from the file; it stops the run, and the owner may later choose a refusal for it. Doubtful, see below. |
| D-D2i | `XmlVersionError`, `MissingHeaderValueError` | `XML_VERSION`, `MISSING_HEADER_VALUE` | `ffdecXml.ts` lines 357, 377, 393 | `failed` | `internal-error` | The dump is FFDec's; a version or header we do not read means our reader does not match this FFDec. |
| D-D2j | `FfdecNotFoundError`, `JavaNotFoundError` | `FFDEC_NOT_FOUND`, `JAVA_NOT_FOUND` | `unpack.ts` line 98; `spawnFfdec.ts` line 59 (ENOENT) | `failed` | `internal-error` (reason: a required component is missing) | Environment. Already so. |
| D-D2k | `InvalidSwfError`, `NotAs3Error`, `FfdecTimeoutError` | `INVALID_SWF`, `NOT_AS3`, `FFDEC_TIMEOUT` | `swfSniff.ts`, `unpack.ts` line 104, `spawnFfdec.ts` line 46 | `refused` | `not-swf`, `actionscript-1-2`, `time-limit` | Already so. Unchanged. |
| D-D2l | run guard errors | `TIME_LIMIT`, `RUN_ABORTED` | `src/pipeline/guard.ts` (`TimeLimitError`, `RunAbortedError`) | `refused` `time-limit`; `failed` `internal-error` (run stopped) | | Already so. Unchanged. |
| D-D2m | plain `Error` of `pathData.ts` | none | `pathData.ts` lines 22, 51, 52, 61, 69 | `failed` | `internal-error` | `svgToShape.ts` line 419 catches it around one path and skips that path; any that escapes is our reader failing on FFDec's SVG. |
| D-D2n | anything else: `SceneParseError`, a plain `Error`, a value that is not an `Error`, an unknown code | none or unknown | any | `failed` | `internal-error` | Not in the table. |

New rows are three: D-D2a, D-D2b and D-D2c. The other rows record the decision to leave a class as it is, so the table is complete. The table is exported as data by `classifyError.ts` in task 26.2 (one entry per code with the outcome kind, the reason code and, for `FFDEC_EXIT`, the stage that makes it a refusal); this task writes no code.

Doubtful rows, for the owner. D-D2a (our validator may reject what Flash plays), D-D2b (an unrecognised character tag), D-D2e and D-D2f (FFDec output faults, which a file with a corrupt shape would also produce), D-D2h (an obfuscated name we cannot emit: a `failed` run for a file that is not damaged). Each is a one-line change in the table if the owner decides the other way.

### Block D: embedded SWF detection (D-D3a, Requirement 26.6)

D-D3a. The Facts walk (`parseBody`) collects the byte ranges of top-level DefineBinaryData tags (code 87) next to the DoABC ranges, with no second walk. `detectEmbeddedSwfs(body, binaryRanges)` in `src/facts/embeddedSwf.ts` (pure) reads each tag as characterId u16, reserved u32, data. It reports `{ characterId, signature, version, sizeBytes, declaredLength, offset }` when the data has at least 8 bytes, starts with `FWS`, `CWS` or `ZWS` and the version byte is 1 to 60 (a chosen bound, not measured; real files use 1 to about 50). Since a detected tag always has a version and a declared length, both fields are plain numbers, not nullable. `readFacts` returns the list as `embeddedSwfs` on its ok result; an outer `ZWS` file has no readable body and gives an empty list. The `Facts` record in the Outcome is not changed in this task: 27.2 decides the count and size fields it holds. Only top-level tags are scanned, because the walk does not enter sprites; a DefineBinaryData inside a sprite is not valid SWF placement for a loader anyway, and the local file holds its one tag at top level. The inner data is not inflated or checked beyond its header.
D-D3b. The Outcome of a wrapper (Requirement 26.7). Gap kind embedded-swf is in COUNTED_GAP_KINDS and the GapKind union, so a wrapper never ends plain converted (decideOutcome counts it with any other gap). summariseGaps takes extras.embeddedSwfs { count, examples }: the gap count is the number of embedded SWFs, the examples are built by embeddedSwfExample (id 46: CWS v10, 7349081 bytes; no class names, no paths). The pipeline passes the Facts stage's list into summariseGaps and a summariseEmbeddedSwfs summary into the RunRecord (embeddedSwfs, optional). The Outcome_File gets an optional top-level embeddedSwfs: { count, totalBytes, largestBytes }, written only when count > 0, so every existing golden and docs example is unchanged; formatVersion stays 1, the parser ignores unknown fields and reads files without it. Sentence (convertedWithGapsReason): [recovery prefix]the file is a wrapper around another SWF that was not converted (N embedded, X MiB); <N> of <M> classes translated, <E> type errors[; most gaps: ...] with X = totalBytes/1 048 576 to one decimal. The embedded-swf kind is left out of most gaps. Over 200 characters, cut in this order: the gap part, the size in the wrapper statement, the whole wrapper statement; the recovery prefix and class counts are never cut (Property 6 holds). 27.3 may add inner (or innerConverted) to embeddedSwfs and drop the gap when the inner file is converted; an old reader ignores it.

D-D3c. Extraction of the embedded SWF (Requirement 26.8): measured, not implemented. Measured on the local wrapper (8549223 bytes, one DefineBinaryData tag of 7349081 bytes, signature CWS, AS3). Reading the inner bytes from the decoded body (offset and size of D-D3a) costs 24 ms for the outer Facts and 39 ms for the inner Facts, with no FFDec call. The inner file reads as AS3, stage 720 by 480, and itself holds one embedded CWS of 3210249 bytes, so nesting is real and the depth limit of 1 leaves that one as a gap.

| Run (default limits unless stated) | Outcome | Candidates | Translated | Type errors | Dropped placements | unpack / convert / translate / emit (s) | Wall (s) |
|---|---|---|---|---|---|---|---|
| Outer file | converted-with-gaps | 26 | 22 | 40 | 10 | 17 / 8 / 2 / 19 | 56 |
| Inner file, default limits, first run (loaded machine) | refused time-limit (emit, 60 s stage limit) | 276 (translate ok) | none | none | none | 104 / 54 / 14 / 60 (stopped) | 249 |
| Inner file, default limits, checkpoint 4 reviewer run (idle machine) | converted-with-gaps | 276 | 192 | 496 | not recorded | not recorded | 144 |
| Inner file, `--stage-limit 180 --run-limit 900` | converted-with-gaps | 276 | 192 | 496 | 26 | 113 / 32 / 11 / 30 | 194 |

Decision: nothing is extracted. The 249 s 
efused time-limit of the first row was measured on a loaded machine and did not reproduce: the checkpoint 4 reviewer ran the inner file under the default limits and it ended converted-with-gaps in 144 s (276 candidates, 192 translated, 496 type errors), about half the run limit. So the claim that the default budget does not fit is withdrawn; the run time of the inner file is 144 to 249 s of the 300 s limit depending on machine load, which leaves a thin margin. The grounds that remain: the project has 496 type errors; the time sits between half and four fifths of the run limit; the inner file holds one more embedded CWS of 3210249 bytes, so one level of nesting is already reached; and extraction code is not built. The input is converted, and the embedded SWF is the embedded-swf gap with its count and size, which is the honest result of D-D3b. Requirement 26.8 records the rule to apply if extraction is added: the largest embedded FWS or CWS SWF that is at least 50 percent of the input size and reads as AS3, one level deep, written to the run work directory (so the cleanup of the work directory removes it), run through the same stages inside the same Run_Limits, with `embeddedSwfs.converted` and an `inner` object (signature, version, sizeBytes, scriptVersion) in the Outcome_File, a reason sentence that says the inner file was converted, and the numbers of the inner file. A refusal or failure of the inner file would end the run with that Outcome and keep the wrapper gap.

### Block E: classes considered (D-E1, Requirement 27.1 to 27.4)

D-E1. Owner's rule: no run presents a small candidate set as the whole file. `numbers.consideredClasses` is the Candidate_Class count (equal to `candidateClasses`), `numbers.totalClasses` is `facts.abcClassCount` (the `.as` files FFDec exported; null when Facts has none) and `numbers.notConsideredClasses = max(0, totalClasses - consideredClasses)`, or null when the total is null. The clamp exists because a candidate with no `.as` file (a linked class with no source) is in the first number and not in the second. `numbersOf(report, dropped, stubs, totalClasses)` takes the total as its fourth parameter. The Outcome_File gets the three fields with formatVersion still 1; `parseOutcome` reads a file without them as one with `consideredClasses = candidateClasses` and no total.

- Gap kind `classes-not-considered` (in `COUNTED_GAP_KINDS` and `GapKind`) has `count = notConsideredClasses` and no examples (a local game's class names are never written). `decideOutcome` also tests `notConsideredClasses > 0` itself, so the Outcome is `converted-with-gaps` and never `converted` whatever the gap list holds. The gap is recorded only when `totalClasses > consideredClasses`; a timeline-only file (0 of 0), an equal count and an unknown total give no gap and no clause.
- Sentence: `<T> of <N> classes translated (<N> of <M> classes considered) (<K> with untranslated code), <E> type errors; most gaps: ...`. The clause is present only for a project outcome with `N < M`. The gap part leaves `classes-not-considered` (and `embedded-swf`) out, as the clause and the wrapper statement already say it.
- Drop order over 200 characters (`MAX_REASON_LENGTH`), first to last: the gap part; the wrapper size (`, X MiB`); the `(K with untranslated code)` part; the `, E type errors` part; the wrapper statement. Never cut: the recovery prefix, `<T> of <N> classes translated` and the considered clause (that head is at most about 160 characters for 9-digit numbers, so the final truncation is unreachable in practice). This changes the reading of Requirement 16.4 in one place: a wrapper statement or a recovery prefix can now push the untranslated and type-error parts out of the sentence; both numbers stay in `numbers`. Property 6 checks them in the plain case only (no recovery, no wrapper, no clause).
- Measured, from the existing outputs under `.work/` (considered of total): the twelve samples have N = M (`radial`, `gradients`, `acid-color-2` 0 of 0; `clickgoto` 4, `tweendemo` 4, `mask_reapply` 1, `click_block` 1, `3_joystick` 1, `static_text` 2, `slider_component` 27, `entity_game` 23, `spacer` 24), so no committed sample changes Outcome. Local files: `canabalt` 10 of 172, `giveuprobot` 21 of 266, `earntodie` 100 of 536, `burritobison` 26 of 27, `redball4` 56 of 225, `run2` 291 of 302, the inner SWF of the wrapper 276 of 276; `papaspizzeria` is refused (ActionScript 1 or 2) and has no numbers. Each of the local files was already `converted-with-gaps`.
### Block E: classes named by a string (D-E2, Requirement 27.5 and 27.6)

D-E2. Owner's rule (item 1b): reach the classes no symbol or import names, by one general rule chosen by measurement. Two rules were measured (task 31.1): (a) every exported class is a candidate; (b) a class whose Qualified_Name equals a string literal (or a `+` concatenation of literals; `pkg::Name` read as `pkg.Name`) in the source of a reached class is reached, and the `extends` and import closure continues from it. Rule (b) takes every such literal and not only an argument of `getDefinitionByName`, because in the local files the name reaches the call through a field set before `super()`; a literal that names a class by accident adds that class, which is reported like any candidate.

Measured with `.work/m31/measure.ts` (git-ignored): `runPipeline` with the real stages and the default limits, no `--verify`; only Unpack is cached per file (one real FFDec run per file, not what this task measures). Columns: considered of total, translated, type errors, dropped placements, Translate s, Emit s (Emit runs the type-check gate inside its stage, so the gate figure is in it; the separate gate stage is 0.0 s), size of `src/` in KiB. The first run of each file was cold and ran while nothing else ran; the later runs ran next to the next file's measurement, so seconds vary by tens of percent.

| File | Rule | Considered | Translated | Type errors | Dropped | Translate s | Emit s | src KiB |
|---|---|---|---|---|---|---|---|---|
| canabalt | today | 10 of 172 | 4 | 43 | 0 | 3.5 | 13.4 | 20 |
| canabalt | (b) | 169 of 172 | 58 | 201 | 0 | 1.0 | 5.1 | 207 |
| canabalt | (a) | 172 of 172 | 59 | 203 | 0 | 0.9 | 4.8 | 208 |
| giveuprobot | today | 21 of 266 | 16 | 47 | 0 | 4.1 | 9.9 | 36 |
| giveuprobot | (b) | 263 of 266 | 125 | 334 | 0 | 1.3 | 5.0 | 280 |
| giveuprobot | (a) | 266 of 266 | 127 | 336 | 0 | 1.3 | 5.1 | 282 |
| earntodie | today | 100 of 536 | 53 | 50 | 73 | 20.5 | 8.7 | 107 |
| earntodie | (b) | 101 of 536 | 53 | 50 | 73 | 9.4 | 8.0 | 108 |
| earntodie | (a) | 536 of 536 | 124 | 245 | 73 | 9.6 | 14.7 | 10516 |
| redball4 | today | 56 of 225 | 17 | 438 | 120 | 6.2 | 14.2 | 611 |
| redball4 | (b) | 81 of 225 | 42 | 438 | 120 | 6.9 | 15.1 | 615 |
| redball4 | (a) | 225 of 225 | 93 | 813 | 120 | 6.5 | 17.0 | 2335 |
| burritobison | today | 26 of 27 | 22 | 40 | 10 | 0.7 | 9.8 | 38 |
| burritobison | (b) | 26 of 27 | 22 | 40 | 10 | 0.3 | 4.3 | 38 |
| burritobison | (a) | 27 of 27 | 23 | 40 | 10 | 0.3 | 4.5 | 38 |
| run2 | today | 291 of 302 | 176 | 4404 | 34 | 7.3 | 21.2 | 1461 |
| run2 | (b) | 291 of 302 | 176 | 4404 | 34 | 7.7 | 9.0 | 1461 |
| run2 | (a) | 302 of 302 | 184 | 4413 | 34 | 3.5 | 8.7 | 1470 |

`papaspizzeria` is refused (ActionScript 1 or 2) under every rule and has no numbers. Every run ended `converted-with-gaps` with exit 0, inside the limits: the largest Emit is 21.2 s (cold) of its 60 s allowance, 17.0 s under rule (a) and the largest Translate 20.5 s (cold) of 60 s; the earntodie run under the default limits still needs its Unpack (108.8 s of the 120 s allowance here, D-E3), which neither rule changes.

What rule (b) finds: the main class of each two-frame preloader file (`canabalt`, `giveuprobot`, `earntodie`, 3 of 3). From it the closure adds 159 classes in `canabalt` and 242 in `giveuprobot`, and 25 in `redball4`. In `earntodie` it adds 1: the main class is one of the 47 classes whose source keeps `§§push` and ends in the D5 fallback, which keeps no `extends` or imports, so the closure stops there. That is a translation limit, not a reach rule, and the 435 classes stay in `notConsideredClasses` and in the sentence.

Decision: rule (b). Time does not decide (both fit). The numbers do: over (b), rule (a) adds 3 classes in `canabalt` and `giveuprobot` (1 and 2 translated), and in `earntodie` and `redball4` it adds 435 and 144 classes that no reached code names by literal or import. Those cost 195 and 375 more type errors and 10.2 MiB and 1.7 MiB more source (368 of `earntodie`'s classes are D5 comment files), for classes that only a name built at run time or read from data could create. Rule (b) emits what Ruffle can instantiate from the code: `getDefinitionByName` (Ruffle `core/src/avm2/globals/flash/utils.rs`, `get_definition_by_name`, fetched at `4a8d396` in task 31.1) looks the string up in the caller's application domain with `get_defined_value_handling_vector`, so it finds any class whose DoABC has run (`movie_clip.rs` `run_abc_and_symbol_tags`, lines 4324 to 4440). A class created only from data (an E4X or XML level file, a name read from a server) is missed by (b) and counted as not considered, so the run still says it; rule (a) would emit it, but nothing in the project would create it either unless the registry below holds it, and it would be paid for in every file.

- Code: `src/translate/classNameLiterals.ts` (pure: `stringLiterals`, `namedClasses`, on the tokenizer, comments skipped, literals with an escape ignored) feeds the closure queue of `planTranslate`, whose seventh parameter `seedRule` is `symbols-and-names` by default (`symbols` and `all` are kept for the measurement and the tests). The queue is a set, so a cycle of names ends; the output is sorted by code unit, so the order of the sources does not change it.
- Registry: `planEmitDetailed` registers every emitted class that is not omitted in `classes.ts` with `registerDefinitions` when an emitted class calls `getDefinitionByName(` on a line that is not a `//` comment, or has an import-cycle cut (as before). The `classRegistry` of linked symbols is unchanged. Omission is unchanged: an omitted class has no import and no entry, and `getDefinitionByName` of it throws `#1065` as in Flash.
- Committed samples: D-E1 measured N = M for all twelve, so the closure cannot grow; only `slider_component` and `spacer` call `getDefinitionByName`, and both already register every class through their import-cycle cuts, so no `classes.ts` changes.
- Preloader pattern (task 31.3, Requirement 27.7). The pattern needed two Shim members that were missing: `MovieClip.nextFrame()` (Ruffle `next_frame`, `movie_clip.rs` line 840: to the next frame and stop, at once) and `framesLoaded` (the frame count). `test/unit/preloaderPattern.test.ts` translates a Fixture_Class preloader (stops, waits three ticks, `framesLoaded == totalFrames`, `nextFrame()`, `getDefinitionByName` of a name kept in a field, `new`, `addChild`) and a main class that nothing imports, through `planTranslate`, `planEmitDetailed` and the Player on the FakeBackend with a manual clock: the main class is a child of the root after the third tick and not before, the document class is the root, and `classes.ts` registers the main class. A generated two-frame SWF (`test/support/preloaderSwf.ts`, FFDec `-xml2swf`) holds the id 0 pair in frame 1 and the main-class pair in frame 2; `parseStructure` and `convertModel` give the document class on the root and the main class on its sprite. No Chromium or pipeline end-to-end: the file has no DoABC and there is no AS3 compiler, so `runPipeline` would translate nothing.
- Frame gating, decided (Property 30 as written in the plan is dropped, the number 30 is used for the closure property instead): a lookup on frame 1 of a class linked in frame 2 succeeds here and throws `#1065` in Ruffle. Gating would need the frame of each SymbolClass pair in Scene_JSON (Convert and format change, plus a Player rule) for a case that no known file hits, since the preloaders look up after `nextFrame()`. Behaviour kept; a test records the difference. Open_Item.
- Property 30 (`test/property/reach.property.test.ts`): over generated literal graphs of six classes, the emitted set equals the closure of the graph computed without the planner, in code-unit order; adding a literal never removes a class; planning only the reached classes reaches the same set; reversing the sources changes nothing.

After (task 31.4), fresh `npm run pipeline` runs, default limits, no `--verify`, no cached Unpack, `converted-with-gaps` and exit 0 unless stated. Before = the 31.1 `today` rows (considered of total, translated, type errors, dropped); wall times before were not recorded (the `d-` logs hold no times).

| File | Considered before | Considered after | Translated before | Translated after | Type errors before | Type errors after | Dropped before | Dropped after | Wall s after |
|---|---|---|---|---|---|---|---|---|---|
| canabalt | 10 of 172 | 169 of 172 | 4 | 58 | 43 | 199 | 0 | 0 | 17.1 |
| giveuprobot | 21 of 266 | 263 of 266 | 16 | 125 | 47 | 334 | 0 | 0 | 20.2 |
| earntodie | 100 of 536 | 101 of 536 | 53 | 53 | 50 | 50 | 73 | 73 | 164.8 |
| burritobison | 26 of 27 | 26 of 27 | 22 | 22 | 40 | 40 | 10 | 10 | 16.8 |
| redball4 | 56 of 225 | 81 of 225 | 17 | 42 | 438 | 438 | 120 | 120 | 91.9 |
| run2 | 291 of 302 | 291 of 302 | 176 | 176 | 4404 | 4404 | 34 | 34 | 67.9 |
| papaspizzeria | refused | refused (`actionscript-1-2`, exit 3) | | | | | | | 1.7 |

No run ended `refused time-limit`. `earntodie` took 164.8 s of the 300 s run limit, almost all of it Unpack (D-E3), and ended `converted-with-gaps` with 435 classes not considered (its main class is a D5 fallback file, see above). `canabalt` and `giveuprobot` each leave 3 classes not considered, which no literal or import names.
- The Flash_API_Table still lists `flash.utils.getDefinitionByName` as a gap (`flash-api-gap`), because a name built at run time may still miss; this task does not change the table.

### Block E: Unpack time (D-E3, Requirement 27.9 and 27.10)

D-E3. Owner's item 2: the largest local file (4 MB, 536 classes) took 109 to 124 s of the 120 s Unpack allowance in earlier runs and ended `refused time-limit` on some. Measured (task 32.1) with the command lines the stage ran, by hand, into `.work/review-e/` (git-ignored). Machine: 24 logical cores, 32 GB, Windows, FFDec 26.4.0, Java 17. The machine was not idle: a Rust build (up to 13 cores) and a browser ran next to every measurement, so each row names the processor load just before the call, and the figures move by a factor of 1.5 to 2 with it (one disturbed series, where a second FFDec loop of mine ran as well, gave 256.8 s for an export that took 91 to 100 s later; it is discarded).

| Call on `earntodie.swf` | Wall s (load before) | CPU s | Cores used | Peak memory |
|---|---|---|---|---|
| `-swf2xml` (the dump) | 21.6 (45%), 20.0 (25%) | 34, 35 | 1.6, 1.7 | 1.5 GB |
| `-export script` | 100.5 (66%), 68.0 (25%) | 402, 358 | 4.0, 5.3 | 2.4 GB |
| `-export shape` | 6.9 (41%), 6.9 (36%) | 7, 6 | 1.0, 0.9 | 0.8 GB |
| `-format text:svg -export text` | 3.6 (37%), 3.9 (Block E facts) | 3 | 0.8 | 0.5 GB |
| `-export symbolClass` | 3.1 (32%), 3.3 (36%) | 3, 3 | 0.8 | 0.5 GB |
| old export list `shape,script,symbolClass,text` in one call | 178.3 (36%), 91.0 (29%) | | | |
| new export list `shape,script,text` after the dump (sequential total) | 158.0 (38%), 124.5 (36%) | | | |
| dump and new export at once (wall until both end) | 117.2 (40%), 87.9 (10%) | | | |

The same on `canabalt.swf` (control, 3 MB, 172 classes, quiet machine, load 15 to 31%): dump 3.7 and 3.8 s, old export 4.1 and 4.7 s, sequential dump plus export 7.7 and 7.9 s, at once 5.0 and 4.8 s. `redball4.swf` was not measured again (its Unpack of 87.7 s is in F1).

Where the time goes. The script export decompiles every class and is about two thirds of the work: 68 to 100 s of the 91 to 124 s that the export and the dump take one after the other, and 358 to 402 CPU seconds, so the one JVM already uses 4 to 5 cores (`parallelSpeedUp` is on by default, `parallelSpeedUpThreadCount` 0 means automatic). The dump is one full parse of the file plus the XML of every tag, DoABC bytes included: 20 to 22 s alone, 34 CPU seconds, 1.6 cores. Shapes, texts and the symbol-class csv are 3 to 7 s each.

What the pipeline reads. `shapes/`, `texts/`, `scripts/` and `structure.xml`. `symbolClass/symbols.csv` is read by nobody: the class links come from the dump since the Block D fix (D-D1), and `unpack.ts` only validated the csv. Dropping it from the export list is safe but saves little: 3.1 to 3.3 s alone, and 91.0 against 100 s of the longer export in the same series, which is inside the noise. The check that the class names are valid Qualified_Names stays in Convert, where it reads the dump.

Probes (`java -jar tools/ffdec/ffdec-cli.jar -help`, `-help export`, `-help swf2xml`, `-listconfigs`). `-swf2xml` takes `-external` (as12script, image, definesound out of the XML) and no option that leaves out DoABC bodies. `-export` takes `-selectclass` (export only some classes), `-selectid`, `-onerror`, `-timeout`, `-exportTimeout`, `-exportFileTimeout`, `-stat`, `-config`; nothing lets the dump and the export share one parse, and a second command after `-swf2xml` on one command line does not run (probe on a local file in task 31: no export written). `-selectclass` cannot be used to skip classes: Translate transpiles every exported `.as` file and the closure is known only after it, and splitting the export by package over several JVMs would not help where the single JVM already uses 4 to 5 cores (24 cores here; a smaller host has fewer).

Decision. (1) The dump and the export run at once (two JVMs, `Promise`-wise: the dump is started first, then the export, both registered in the child registry by `spawnFfdec`). The export is the longer call on every file measured, so the stage costs about the export time plus the contention that the dump adds: 117.2 against 158.0 s and 87.9 against 124.5 s on the large file (a saving of 36 to 41 s, 23 to 29 percent), 4.9 against 7.8 s on the control. Memory goes up by the peak of both JVMs (1.5 GB and 2.4 GB measured, about 4 GB; the default heap of each is a quarter of the RAM). (2) `symbolClass` is no longer exported and `UnpackResult.symbolClassPath` is gone (grep: no consumer outside `unpack.ts`; the tests that built an `UnpackResult` lost one line each). (3) The saving does not bring the large file reliably below 90 s: the isolated calls at once took 117.2 s and 87.9 s, and the pipeline's Unpack took 93.2 s on the quiet series and 134 to 170 s under load (below), so the weight is also changed: unpack 3, allowance 180 s (D-A4). The arithmetic: the allowances are 120 (recover), 180 (unpack), 60 (convert), 60 (translate), 60 (emit), 60 (gate) and 180 s (verify), 720 s in all; the sum was already above the 300 s run limit (the run limit is the tighter bound, as `docs/outcome.md` says), and no single allowance exceeds it. A run that spends 180 s in Unpack still has 120 s of the run limit for the other stages, which is what the large file needs after Task 31 (Convert, Translate and Emit took about 28 s together on a quiet machine in the Task 31 run that totalled 164.8 s). Consequence: after a failed recovery step the fallback Unpack needs 180 s of the run limit left (it needed 120 s), checked by `runPipeline` through `stageAllowanceS`; the property test of Property 17 models it with 180 s.

Error order and the kill path. The two calls start together and both get what is left of the stage allowance at that moment, which is all of it (`allowanceMs - (now() - startedAt)`), so the stage as a whole stays inside the allowance; the per-call bound of the earlier fix is unchanged. `spawnFfdec` takes an optional `AbortSignal`: an abort kills the process tree (`killTree`, the same path as the timeout) and rejects with the reason. `unpack` keeps the order of the sequential stage: a failed or timed-out dump is thrown first and aborts the export; then not-AS3 and the XML version check, which also abort the export; an error of the export is thrown last, after the dump was read, so a not-AS3 file never ends `damaged` because its export failed first. A timeout of the stage by the guard kills both children through the registry (`track` in `spawnFfdec`), exactly as one child before. Tests: `test/unit/unpackConcurrent.test.ts` (both calls start before either ends, both get the whole allowance, a failed or timed-out dump aborts the export, an export timeout names the stage limit and is thrown after the dump, and the real spawner kills a child on an abort) and the changed `unpack.test.ts` and `unpackErrors.test.ts`.

Before and after, pipeline runs (`npm run pipeline`, no `--verify`, same machine, load before in brackets). Committed samples: Unpack 3.3 to 7.0 s before and 1.9 to 4.2 s after, and every file of the output except `outcome.json` has the same SHA-256 before and after (clickgoto 88 files, tweendemo 88, radial 81, gradients 81, acid-color-2 84, mask_reapply 83, click_block 88; the rest in the commit body). Local files (Unpack s, load before in brackets). `canabalt.swf`: before 10.9 (93%) and 6.3 (11%), after 3.8 (12%) and 3.8 (7%); 249 output files, none differs. `earntodie.swf`, before (allowance 120 s): 103.0 (9%), then the run ended `converted-with-gaps` in 159.3 s; 117.2 (7%), then the run ended `refused time-limit` in Convert (60.0 s) after 181.8 s. After (allowance 180 s): 93.2 (57%), `converted-with-gaps` in 145.2 s, 721 output files, none differs from the 159.3 s run; then, with the machine at 34 percent from other work, 169.5 (34%, `refused time-limit` in Convert after 238.3 s), 137.1 (34%, `converted-with-gaps`, 223.0 s) and 133.7 (34%, `refused time-limit` in Convert after 200.1 s). So the saving in the pipeline is smaller than in the isolated calls: about 10 s on the quiet pair (103.0 to 93.2 s), and under load Unpack stays at 130 to 170 s, which the old 120 s allowance would have refused and the new 180 s allowance accepts, with 10 to 50 s to spare in the worst series. The limit that then fails is Convert: it took 16 to 21 s on an idle machine and more than its 60 s allowance in three runs under that load. That is not changed here; it is an Open_Item for the owner (Convert weight, or the cost of Convert on a large file), recorded in the commit body.

### Block E: type-error causes (D-E4, Requirement 27.11 to 27.13)

D-E4. Owner's item 3. The tool is `npm run report:type-errors -- <out dir>...` (`scripts/group-type-errors.ts`, I/O only) over the pure `groupTypeErrors` and `typeErrorKey` of `src/translate/typeErrorGroups.ts`. A key is built from the TypeScript code and the quoted names: `TS2304 name <X>` (also TS2552 and TS2663), `TS2339 <OwnerType>.<member>` (also TS2551), `TS2345 to <Type> (<reason>)` and `TS2322` likewise (reason: `private member <p>`, `missing members` or `other`), `TS2306 file is not a module`, and for any other message the code plus the first line with each quoted name replaced by `'#'`. Groups are sorted by total, then by key in code-unit order. Class errors and `otherErrors` of the report are both counted.

Measured (task 33.1) on fresh outputs of the three largest local files under the default limits, no `--verify`, at HEAD f27bd67 (reach rule (b) of D-E2; the 31.4 outputs predate the Unpack change and were not reused, the runs took 23, 30 and 156 s): file A 169 of 172 classes considered and 199 type errors, file B 263 of 266 and 334, file C 101 of 536 and 50 (3 in classes, 47 in `otherErrors`); 583 errors in 104 groups. The ten largest groups, with the count per file (A, B, C), before the fixes of 33.2:

| # | Group | Total | A | B | C | Disposition |
|---|---|---|---|---|---|---|
| 1 | `TS2345` argument to a framework base class `<Entity>`: a private member `_<field>` of the base that the subclass also declares | 100 | 0 | 100 | 0 | Open_Item 1 |
| 2 | `TS2306` a class file is not a module (`src/classes.ts` imports the D5 fallback file of an obfuscated class) | 50 | 0 | 0 | 50 | fixed |
| 3 | `TS2304` name `BitmapData` | 47 | 26 | 21 | 0 | Open_Item 2 |
| 4 | `TS2304` name `Bitmap` | 41 | 36 | 5 | 0 | Open_Item 2 |
| 5 | `TS7015` an `Array` indexed by a string | 39 | 0 | 39 | 0 | Open_Item 3 |
| 6 | `TS2304` name `Matrix` | 14 | 7 | 7 | 0 | Open_Item 2 |
| 7 | `TS2304` name `ColorTransform` | 13 | 3 | 10 | 0 | Open_Item 2 |
| 8 | `TS2304` name `TextFormat` | 12 | 10 | 2 | 0 | Open_Item 4 |
| 9 | `TS2339` `Event.SOUND_COMPLETE` | 11 | 2 | 9 | 0 | fixed |
| 10 | `TS2339` `TextField.defaultTextFormat` | 10 | 10 | 0 | 0 | Open_Item 4 |

Next in size, not in the ten: `Graphics.drawRect` 8 and `Graphics.beginBitmapFill` 2 (Open_Item 5); the `TextField` members `embedFonts`, `multiline`, `wordWrap`, `gridFitType`, `antiAliasType` and `appendText`, 41 in all (Open_Item 4); the `Stage` members `align`, `stageWidth`, `stageHeight`, `displayState`, `quality`, `fullScreenWidth`, `fullScreenHeight`, `showDefaultContextMenu` and `loaderInfo`, 14 in all (Open_Item 6); the members of a `BitmapData` subclass of one file, about 40 (with Open_Item 2); `Event.ACTIVATE` 2, `Event.DEACTIVATE` 2, `Event.COMPLETE` 1 and `Keyboard.TAB` 2 (fixed).

Fixed (task 33.2), each general and small, each with a test:

1. A D5 fallback file (the translated text did not parse) is comments only and exports nothing, but `classes.ts` imported it when its class was linked: `TS2306`, 50 errors in file C. `planEmitDetailed` now leaves a `parseFailed` class that is not overridden out of the registry, as an omitted class is. Its symbol runs as a plain MovieClip, which `classes.ts` already states for a symbol without an entry. 3 lines in `src/emit/planEmit.ts`; test in `test/unit/emitTranslated.test.ts`. No committed sample has such a class. File C now reads 3 type errors, and its gap list leads with `untranslated-code` (48) instead of the 50 type errors, which is the truer reading: those classes are comments.
2. `Event.COMPLETE`, `Event.SOUND_COMPLETE`, `Event.ACTIVATE`, `Event.DEACTIVATE` and `Keyboard.TAB`: constants with the values of the `flash.events.Event` and `flash.ui.Keyboard` documentation (`"complete"`, `"soundComplete"`, `"activate"`, `"deactivate"`, 9). The Shim dispatches none of the four events, so a listener stays silent, the neutral value. 18 errors in files A and B. `template/shim/events.ts` and `Keyboard.ts`; test in `test/unit/keyboardShim.test.ts`; line in `template/shim/ADDED_APIS.md`; evidence label `neither` in `flash-behaviour.md`. The generated member table does not change.

Type errors per file, before and after: file A 199 to 192, file B 334 to 323, file C 50 to 3 (583 to 518). The classes considered and translated are the same in all three.

Open_Items of Block E item 3:

1. A private member with the same name in a base class and its subclass (100 errors, one file). AS3 gives each class its own private namespace; TypeScript rejects a subclass that declares a `private` member named like one of its base. A general fix renames or widens one of the two, touches every reference and needs a rule for the choice: more than 40 lines and a design decision, not done.
2. `BitmapData`, `Bitmap`, `Matrix` and `ColorTransform` (115 errors in the four names, plus the members of a `BitmapData` subclass). They are policy gaps of the Flash_API_Table on purpose (BitmapData manipulation is out of scope, and a neutral Matrix or ColorTransform would be silently wrong). Not changed: it is the owner's scope decision.
3. An `Array` used with string keys (39 errors, one file). AS3 `Array` accepts `a["k"]`; the rewrite would have to know the receiver's type or change it to a map: a design question like the `Dictionary` rule (D10), not done.
4. `TextFormat` and the `TextField` members around it (`defaultTextFormat`, `embedFonts`, `multiline`, `wordWrap`, `gridFitType`, `antiAliasType`, `appendText`; about 63 errors). `TextFormat` is in neither the Shim nor the Flash_API_Table, and the members change layout, which the runtime does not model (text-metrics limit): needs a decision on which become stubs.
5. `Graphics.drawRect` and `beginBitmapFill`: `drawRect` is a drawing command and needs its path in `graphicsPlan` and a pixel check, not a stub.
6. `Stage` members (14 errors): each is player behaviour (size, alignment, display state), not a neutral constant.
7. A bare `root` in a static context (6 errors, one framework class): one game, not chased.

## Data Models

```ts
// Scene_JSON 4 (written only when a button symbol exists)
// Scene_JSON 4 (written only when a button symbol exists)
interface ButtonSymbol {
  type: 'button';
  className?: string;
  trackAsMenu: boolean;
  states: { up: DisplayListEntry[]; over: DisplayListEntry[]; down: DisplayListEntry[]; hit: DisplayListEntry[] };
}

interface RecoveryRecord {
  attempted: boolean;
  skipped: 'copy-failed' | 'not-obfuscated' | null;
  failedStep: 'copy' | 'rename' | 'deobfuscate' | null;
  fallback: boolean;                // the original was translated after a failed recovery
  renamedIdentifiers: number;       // names that differ between the scan of the input and of the renamed copy
  deobfuscated: boolean;
  candidateClasses: number;
  recoveredClasses: number;         // translated from the recovered copy (the Recovered_Count)
  unrecoverableClasses: number;     // after Unpack, from the source signals
}

type GapKind =
  | 'untranslated-class' | 'class-omitted' | 'untranslated-code' | 'unbound-instance'
  | 'unrecoverable-class' | 'type-error' | 'dropped-placement' | 'flash-api-gap';
```

`renamedIdentifiers` is measured by running the ABC_Name_Scan on the renamed copy and subtracting `invalidNames`: the scan is pure and the copy is a SWF, so no FFDec output is parsed.

Exit codes (one constant table, read by tests and by `docs/outcome.md`): `converted` 0, `converted-with-gaps` 0, `failed` 1, usage and path errors 2, `refused` 3.

`docs/outcome.md` holds the four examples, the Reason_Codes, the exit-code table, the note that the `abcClassCount` and `swf_summary` numbers can differ by one (O14), and the note that the web side passes the run limit as `--run-limit` and keeps its own kill 30 s above it (Requirement 6.3; the first version of the note said the web server's 180 s kill was below the 300 s default, superseded by Task 28). A test extracts each fenced JSON example from the document and compares it with the output of the writer for the same record (Requirement 10.2).

New Named_Limits: `api-stub:<Class>.<member>`, `api-stub-no-event:<Class>`, `obfuscation-recovered`, `button-state:over`, `button-state:down`, `button-hit-area`, `button-duplicate-depth`, `button-record-effects`, `button-avm1-actions`, `button-sound`, `flash-api-gap` (report problem kind, not a runtime limit).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Reflection: Requirements 1.1 to 1.3, 1.5 and 4.1 to 4.3, 4.9, 4.11 and 4.12 are one decision property. 1.6 and 1.8 are one fault-injection property. 5.12 and 5.13 are their own classification property, because the same stage fake throws two kinds of error and the Outcomes differ. 3.6 and 3.10 fold into the Outcome properties. 5.1 to 5.4 and 5.10 are one cut-length property. 6.1 and 6.8 are one resolver property. 7.1, 7.2 and 7.5 are one total-mapping property. 14.2 to 14.4 and 14.6 are one detector property and one scan-totality property. 15.3, 16.1 and 16.5 are one recovery-order property (the old keep-if-better property is removed with D-B5). 15.1 and 16.6 stay together. 17.3, 17.4, 17.7 and 17.11 are one stub property. The three `Point` groups stay separate because they need different generators. 20.4 to 20.6 and 20.17 are one state-model property; 20.7, 20.8 and 20.16 are one hit-region property. Requirement 20.1 and 21.x merge with the scene round trip. Requirement 25 gives example tests, not properties.

### Property 1: One Outcome, decided by the numbers

For any run record (facts or none, stage list, report numbers with N translated of M candidates, gap list, type error count, optional classified failure), `decideOutcome` returns exactly one of the four codes. It returns `converted` if and only if there is a project, no gap and 0 type errors; `converted-with-gaps` if there is a project and at least one gap; `refused` with `nothing-translated` if and only if M > 0 and N = 0; never `nothing-translated` when M = 0; and `reasonCode` is null if and only if the outcome is one of the two project outcomes.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2, 4.3, 4.9, 4.11, 4.12**

### Property 2: A fault at any stage still ends in one valid Outcome

For any stage (including the recover stage) at which a stage fake throws (any error class, including non-Error values) and any generated facts, the run returns an exit code from the table, writes an `outcome.json` that parses, carries `facts` whenever the Facts_Reader ran, prints the Outcome_Line as the last line of standard output, and writes the stack text only to the Failure_Log.

**Validates: Requirements 1.6, 1.7, 1.8, 2.5, 3.6, 5.5, 5.7**

### Property 3: Error classification keeps FFDec and our own errors apart

For any error thrown at the Unpack stage, the Outcome is `refused` `damaged` if and only if the error is an `FfdecExitError`; for an `FfdecExitError` the Outcome_File, the Outcome_Line and the `reason` contain no part of its stderr text (the text is in `ffdec-<Reference_Id>.log`); every error that is not an FFDec exit, timeout or missing-tool error, including generated `Error`, `TypeError` and non-Error values, gives `failed` `internal-error`, and no `failed` Outcome has the reason code `damaged`.

**Validates: Requirements 5.12, 5.13**

### Property 4: Outcome_File round trip and canonical bytes

For any generated Outcome record, serialising then parsing gives an equal record, and equal records give equal bytes. A file whose `formatVersion` is not 1 is rejected with a message naming the version. No generated reason, example or gap text that contains a path-like or stack-like string appears unscrubbed in the written file.

**Validates: Requirements 2.1, 2.2, 2.7, 2.9, 2.10**

### Property 5: Gap summary matches the entries

For any list of unsupported entries and report numbers, the `gaps` array has one element per kind that occurs, each with the true count and at most 5 examples, kinds that are Named_Limits only (`text-metrics`, `filter`, `stroke-style`, `mask`, `morph-shape`) never appear, and the array is empty if and only if the Outcome is `converted`.

**Validates: Requirements 2.3, 2.4, 4.2, 4.7**

### Property 6: Reason sentence is bounded and complete

For any numbers and gap summary, the reason of a `converted-with-gaps` outcome is at most 200 characters and contains N, M and the type error count; for a recovered run it also starts with the recovery sentence.

**Validates: Requirements 2.2, 4.7, 16.4**

### Property 7: Exit code is a function of the outcome

For any Outcome, the exit code is 0 for `converted` and `converted-with-gaps`, 1 for `failed`, 3 for `refused`; the table has no other value and equal outcomes give equal codes.

**Validates: Requirements 7.1, 7.2, 7.5**

### Property 8: Facts round trip over generated headers

For any generated SWF header (signature in `FWS`, `CWS`; version 1 to 50; stage rectangle; frame rate; frame count; a valid tag list ending in `End`), `readFacts` returns the signature, version, compression, declared length, stage size, frame rate and frame count that were written, and `scriptVersion` equal to the rule applied to the tag set.

**Validates: Requirements 3.1, 3.2, 3.3, 3.8**

### Property 9: Arbitrary bytes never throw

For any byte string, `readFacts` returns a result and does not throw; if the bytes do not start with `FWS`, `CWS` or `ZWS`, or are shorter than 8 bytes, the reason code is `not-swf`.

**Validates: Requirements 3.5, 3.9**

### Property 10: A cut SWF is never converted

For any valid generated or committed SWF and any cut length from 0 to its length minus 1, the run with stage fakes ends `refused` and never `converted` or `converted-with-gaps`; the reason code is `not-swf` for fewer than 8 bytes and `damaged` otherwise.

**Validates: Requirements 4.5, 5.1, 5.2, 5.3, 5.4, 5.10**

### Property 11: Limit resolution

For any option, environment and default values, the resolved limit is the option when present, else the variable when present, else the default; a value that is not a positive integer yields a usage error and never a limit.

**Validates: Requirements 6.1, 6.8**

### Property 12: Time limit if and only if a duration exceeds its allowance

For any sequence of stage durations (including the recover stage), stage limit, weights and run limit, driven by the fake clock, the run ends `refused` `time-limit` if and only if some stage duration exceeds its weighted allowance or the sum exceeds the run limit; the reason names the stage and the limit that applied, and the written limits equal the resolved limits.

**Validates: Requirements 6.5, 6.10, 6.12, 6.13**

### Property 13: Cleanup removes only what the run wrote

For any pre-existing file set and any set written by the run, the cleanup plan after a refusal or failure is a subset of `written \ preExisting`, contains none of the Outcome_File, reports, Failure_Log or `ffdec-<Reference_Id>.log`, and leaves every pre-existing file.

**Validates: Requirements 4.6, 6.7, 9.2, 9.3**

### Property 14: Determinism of the Outcome_File

For any generated run record, two decisions and writes give equal bytes once `stages[].durationMs` is dropped.

**Validates: Requirements 11.7**

### Property 15: Obfuscation verdict over names

For any generated identifier, the name rule flags it if and only if it has a character outside the identifier alphabet (Unicode letters, digits, `_`, `$`) or starts with a digit. For any list of names, the verdict is deterministic, is `obfuscated` if and only if `invalid / total >= 0.20` and `invalid >= 5`, and is monotone: replacing a valid name by an invalid one never turns `obfuscated` into not obfuscated.

**Validates: Requirements 14.2, 14.3, 14.6**

### Property 16: ABC_Name_Scan reads what a constant pool holds, and never throws

For any generated constant pool (any numbers of ints, uints, doubles, strings, namespaces, namespace sets, and multinames of every kind in the table of D-B2, with names from a generator that mixes valid and invalid identifiers, literal strings that are not used as names, and namespace names with dots), wrapped as a `DoABC` (tag 72) or `DoABC2` (tag 82) payload, the scan returns exactly the number of multiname names and the number of invalid ones that the generator placed, and ignores namespace names and literal strings. For any byte string and any truncation of a valid payload, the scan returns a result, does not throw, and reports `obfuscated: false` when the pool cannot be read to the end of the multiname table.

**Validates: Requirements 14.1, 14.4, 14.5**

### Property 17: Recovery order, one Unpack, and fallback

For any generated run with a fake FFDec whose rename, deobfuscate and unpack calls each succeed or fail, and any remaining time: if the ABC_Name_Scan verdict is not obfuscated, the fake FFDec records no rename and no deobfuscate call and exactly one Unpack call, on the input; if it is obfuscated, the calls are rename on the input copy, then deobfuscate on the renamed copy, then exactly one Unpack, on the recovered copy, and Unpack is never called on the original before the two steps; if a step fails, Unpack is called once on the original if the remaining time is at least the unpack allowance and the run is `refused` `time-limit` otherwise, with `recovery.fallback` true in the first case; in no case are there two Unpack calls.

**Validates: Requirements 15.3, 16.1, 16.3, 16.5, 16.9**

### Property 18: Recovery is deterministic and leaves the input alone

For any generated sources and a fake FFDec that renames by a fixed rule, two runs produce byte-equal translated files and an equal list of renamed names, and the SHA-256 of the input file is the same before and after; the Verify stage receives the input path, not the recovered copy.

**Validates: Requirements 15.1, 15.2, 15.4, 16.6**

### Property 19: Table lookup and stub generation

For any pair (Flash class, member), `policyOf` returns one of `stub`, `real`, `gap`, `absent`. A stub class is generated if and only if the class has policy `stub`; a `gap`, `real` or `absent` pair never produces a stub; and every member of every `stub` entry exists as a member of the generated Shim class in the Shim_Member_Table.

**Validates: Requirements 17.1, 17.2, 17.5, 17.6**

### Property 20: A stub records once, returns a typed value, and flags the stalls

For any stub member and any number of calls from 1 up, the Named_Limit sink holds exactly one `api-stub:<Class>.<member>` entry, every call returns the neutral value of the member's type, a member that returns an object in Flash returns a non-null stub object of that type (with its own members callable), and no call throws; for any class marked as a No_Event_Stub, the sink holds exactly one `api-stub-no-event:<Class>` entry after the first use, and the stub dispatches no event however it is used.

**Validates: Requirements 17.3, 17.4, 17.7, 17.11**

### Property 21: Point algebra

For any finite points `a` and `b`, `a.add(b).subtract(b)` equals `a`; `Point.distance(a, b)` equals `Point.distance(b, a)`; and for any weight `f` from 0 to 1, `Point.interpolate(a, b, f)` lies on the segment from `a` to `b`, with `interpolate(a, b, 1)` equal to `a` and `interpolate(a, b, 0)` equal to `b`.

**Validates: Requirements 18.1, 18.4, 18.7, 18.8**

### Property 22: Point.normalize

For any point not at the origin and any positive thickness, the length after `normalize(thickness)` equals `thickness` within 1e-9 relative error; for the origin the point is unchanged.

**Validates: Requirements 18.1, 18.2, 18.3, 18.9**

### Property 23: Button symbol conversion and scene round trip

For any generated list of `BUTTONRECORD`s, `buttons.ts` puts each record into exactly the states whose flags are set, each state is ordered by depth with no repeated depth, and writing the scene then parsing it gives an equal scene; a scene with no button symbol is written as version 3 and one with a button as version 4, and the reader accepts versions 2, 3 and 4.

**Validates: Requirements 20.1, 20.2, 21.1, 21.2**

### Property 24: Button hit region

For any generated button (states with shapes, placement transform) and any point, a pointer event reaches the button if and only if the point lies inside a shape of the current state container or of the hit container, after the placement transform; with no hit records the current state's shapes alone decide; a point inside only a shape of a non-current visible state does not reach it.

**Validates: Requirements 20.7, 20.8, 20.16, 20.19**

### Property 25: Button state follows the pointer model

For any sequence of pointer moves, presses and releases over a generated button, the drawn state after each step equals the model: Down if the pressed object is the button and the pointer is on it; Over if the pointer is on the button and it is not pressed, or it is pressed and the pointer left it; Up otherwise. A disabled button is always drawn Up and receives no mouse event.

**Validates: Requirements 20.4, 20.5, 20.6, 20.10, 20.12, 20.17**

### Property 29: The sentence states the considered and total counts

For any project Outcome whose numbers have `totalClasses > consideredClasses`, the Outcome is `converted-with-gaps` and the sentence holds `<N> of <M> classes considered` exactly once, with the numbers of `numbers`, in at most 200 characters; when `totalClasses` is null or equals `consideredClasses` the sentence has no such clause.
**Validates: Requirements 27.1, 27.3**
## Error Handling

| Situation | Behaviour |
|---|---|
| Empty file, text file, bytes below 8 | refused `not-swf`, exit 3, no FFDec process |
| `CWS` stream ends early or declared length differs | refused `damaged` |
| Tag stream runs past the body or no `End` tag | refused `damaged` |
| `DoAction` and no `DoABC` | refused `actionscript-1-2` within the Facts step |
| AS1/AS2 flag in `FileAttributes` (found at Unpack) | refused `actionscript-1-2` |
| File above the size limit, or declared length above 128 MiB | refused `too-large`, before FFDec |
| FFDec call, stage or run over its limit | children killed, refused `time-limit`, project files removed |
| FFDec exits non-zero at Unpack | refused `damaged`, reason "the file could not be read"; FFDec text only in `ffdec-<Reference_Id>.log` |
| FFDec exits non-zero or times out in a recovery step | not an Outcome: `recovery.fallback`, Unpack of the original if time remains, else refused `time-limit` |
| Our own error (a bug, `TypeError`, unknown error value) in any stage | failed `internal-error`, never `damaged` |
| Java or FFDec jar missing | failed, reason says a required component is missing, exit 1 |
| Candidate_Classes greater than 0 and none translated (after recovery) | refused `nothing-translated` |
| Candidate_Classes 0 (timeline-only file) and Emit finishes | `converted`, exit 0 |
| Any other thrown error | failed `internal-error`, `error [pipeline]: internal error, reference <id>` on standard error, stack in `failure-<id>.log` |
| `SIGINT` | children killed, failed `run stopped by signal`, exit 1 |
| Output directory not writable for `outcome.json` | Outcome_Line still printed, exit code of the Outcome |
| Recovery copy cannot be made | continue on the original if time remains, `recovery.skipped = 'copy-failed'` |
| Unparsable Outcome_File `formatVersion` in a reader | rejected with a message that names the version |
| `SET.json` unreadable | `error [pipeline]: <exception text>`, exit 2 (the `${...}` defect fixed, S2) |
| Stub class used, member not in the table | a visible type error and a `flash-api-gap` problem |
| Button with blend mode or filters on a record | drawn without them, Named_Limit `button-record-effects` |

## Testing Strategy

Property-based testing applies: the Outcome decision, error classification, Facts_Reader, ABC_Name_Scan, limit model, cleanup plan, recovery order, stub sink, `Point` and the button model are pure and have a large input space. It does not apply to taskkill behaviour, Chromium pixels, FFDec output, or the generated button SWF end to end; those use example tests and one measurement. Library: `fast-check` 4.10.2 (already a dependency). Minimum 100 runs per property, one test per property, tagged `Feature: robustness, Property N: <title>`.

| Layer | What | How |
|---|---|---|
| `test/property/outcome.property.test.ts` | Properties 1 to 7, 14 | Generated run records and fake stages; temp dirs for the writer |
| `test/property/facts.property.test.ts` | Properties 8 to 10, 16 | `test/support/hostileSwf.ts` builds SWF bytes (header, RECT, tags, `End`, optional zlib) and ABC constant pools without FFDec |
| `test/property/limits.property.test.ts` | Properties 11, 12, 13 | Fake clock, fake child, pure cleanup plan |
| `test/property/recover.property.test.ts` | Properties 15, 17, 18 | Generated names and sources; fake FFDec spawner that records its calls and arguments |
| `test/property/apiStubs.property.test.ts` | Properties 19, 20 | Table and generated Shim classes; Named_Limit sink |
| `test/property/point.property.test.ts` | Properties 21, 22 | Finite doubles; a model built from the Ruffle formulas |
| `test/property/button.property.test.ts` | Properties 23 to 25 | Generated Scene_JSON, FakeBackend, manual clock |
| Unit | exit-2 cases write no file; Outcome_Line last and `Done` before it; existing lines kept; the `[translate]` label (S3); `SET.json` message (S2); AS1/AS2 fixture runs with a fake spawner that must not be called; timeline-only SWF ends `converted` exit 0 and a generated file with candidates and no translated class ends `refused` exit 3 (Requirement 4.12); `encrypted` with a fake FFDec result; `too-large` with a lowered limit; input SHA-256 unchanged; the real scan numbers of F15 on the committed samples (0 invalid names) and on `redball4.swf` when present; docs examples equal writer output | Hostile fixtures built in the test |
| Process | `killTree` ends a spawned `node` child and its grandchild (checked with `process.kill(pid, 0)`), through `spawnFfdec`'s own timeout path (S1); `SIGINT` ends a spawned CLI with exit 1 and an Outcome_File | Real processes, Windows and POSIX branches |
| E2E | each committed sample ends `converted` or `converted-with-gaps`; `truncated.swf` (when present) ends `refused damaged`; `redball4.swf` (when present) under the default limits ends `converted-with-gaps` and the test records stage times; the button fixture (xml2swf) draws up, hover, down and fires `click` in Chromium | Shared_Run_Cache; `redball4.swf` tests skip with a message when the file is absent |

Floors and goldens: `template/` changes (Shim, Runtime) run `test/unit/clickgotoReplay.test.ts` and `test/e2e/overallMatch.e2e.test.ts` (Requirement 17.10). Scene version 4 is written only for a scene with a button, so no golden changes. No timeout is raised and `PIPELINE_SLOTS` stays 3.

Flash behaviour added to the Shim or Runtime goes into `.kiro/steering/flash-behaviour.md` with its label in the same commit: button state table, button pick rule, release-outside rule (read), `Point` formulas (read), hover and roll events (O9), disabled button state (O10).

## Decisions for the owner

All decided. Rows U1 and U2 are changed by the owner's decisions; the others are accepted as recommended.

| # | Question | Decision |
|---|---|---|
| U1 | Default limits | 20 MiB, 300 s run, 60 s base stage with weights recover 2, unpack 2, convert 1, translate 1, emit 1, gate 1, verify 3. The target is `redball4` ending `converted-with-gaps` under the defaults with time to spare; the stage times are reported at Checkpoint 2. The web server's 180 s kill was the web owner's to align (superseded: the web side passes --run-limit and keeps its own kill 30 s above it, Task 28); `docs/outcome.md` says so. The earlier finding that the defaults refuse `redball4` (old F1, old A2) is withdrawn |
| U2 | `converted-with-gaps` exit code and the refusal threshold | Exit 0 for both project outcomes; refusal only for 0 translated of more than 0 candidates (Requirements 4.11, 7.6) |
| U3 | Where stubs live | Ship all in `template/shim/stubs/`; Emit does not filter (Requirement 17.2) |
| U4 | FFDec non-zero exit at Unpack | `refused` `damaged`; FFDec text in `ffdec-<Reference_Id>.log` only; our own errors stay `failed` (Requirement 5.12, 5.13; D-A2) |
| U5 | `DefineButtonTag` verified by a generated file | Yes, labelled "measured on a generated file" (Requirement 20.3) |
| U6 | Hover events | Included in Block C; fall back to D-C8 if the budget is exceeded by a third |
| U7 | `ZWS` files | Header only; no decoder dependency (Requirement 3.7) |
| U8 | `Point.copyFrom` and `setTo` | Added (Requirement 18.1) |
| U9 | Supervisor process | None; an Open_Item (O1, Requirement 7.7) |

## Open_Items

Labels: `read` (read in Ruffle at `4a8d396` in this design), `measured` (run on this machine), `ours-only`, `neither`.

| # | Item | Label | Risk | Next |
|---|---|---|---|---|
| O1 | No supervisor process. A synchronous stage (convert, translate, the in-process type check) that blocks the Node event loop cannot be interrupted by the in-process guard. To a local user this looks like a command that prints no new line and does not answer Ctrl-C; no `outcome.json` and no Outcome_Line exist until the process is killed. Only the web server, which kills the process tree at its job limit, bounds the case. The longest synchronous stretch seen is convert at 39.9 s on `redball4`, which ends by itself. | neither | A local run can hang without a result | Measure the longest synchronous stretch in task 1; add a supervisor only if the owner asks (Requirement 7.7) |
| O2 | The 128 MiB uncompressed cap, the 20 % share and the floor of 5 invalid names of the obfuscation verdict are chosen, not measured against a population. The share sits between 0 % (seven committed files) and 52.6 % (one copyrighted file). | measured (two points) | A legitimate large file refused as `too-large`; a lightly obfuscated file not detected | Revisit with real files |
| O3 | The `encrypted` Reason_Code has no measured signal. FFDec `-decrypt` is HARMAN AIR only. A packed or encrypted web SWF was not available. | measured (help text) | `encrypted` is reachable only through the fake FFDec result in tests | Record the first real case; until then a hostile file ends `damaged` or `failed` |
| O4 | `ZWS` files get header facts only; damage, `scriptVersion` and the ABC_Name_Scan are not available, so a `ZWS` file is never recovered. | measured (no LZMA in Node) | A cut `ZWS` file is found only when FFDec fails (mapped to `damaged`); an obfuscated `ZWS` file is translated without recovery | Revisit if a decoder is ever accepted |
| O5 | `SIGTERM` cannot be handled on Windows, so a kill by the web server is not catchable. | neither (Node documentation, not re-read) | No Outcome_File on that path; the web server writes its own failed state | Check the Node documentation page before the task |
| O6 | Emit has no journal of partly written files. | neither (Emit not read in this design) | A failure inside Emit may leave files the cleanup plan does not know | Read `src/emit/emit.ts` in the first Block A task; add `onWrite` |
| O7 | Two runs of rename and deobfuscate on the same input were not compared byte for byte. | neither | Determinism (Requirement 16.6) is asserted with a fake and not with FFDec | The real-FFDec test hashes two runs when `redball4.swf` is present |
| O8 | The Unpack time of the recovered copy of `redball4` is not measured (the expected 88 s is the time of the original). The expected total of about 190 s is the sum of measured stage times of different runs. | neither | The total may differ; the stage weights may need tuning | Measure at Checkpoint 2 and report per stage (Requirement 19.2) |
| O9 | `rollOver` and `rollOut` do not bubble, `mouseOver` and `mouseOut` do. | neither (Flash documentation from memory, Ruffle event bubbling not read) | Listeners on a parent see different events than Flash | Read Ruffle `core/src/display_object/interactive.rs` event dispatch in the first Block C task |
| O10 | Whether Ruffle resets a button to Up when `enabled` is set to false. | neither | A disabled button may draw Over where Flash draws Up | Read `set_enabled` in `avm2_button.rs` |
| O11 | `DefineButtonTag` (v1) attributes were measured on a file FFDec wrote, not on a wild SWF. | measured (generated) | A wild file may carry a field the generated one did not | Accepted by the owner (U5) |
| O12 | Stubs of the No_Event classes never fire their completion events; a game that waits stays waiting (the stub table lists them: `Sound`, `SoundChannel`, `URLLoader`, `Loader`, `LocalConnection`). | ours-only | Visible, listed as `api-stub-no-event:<Class>` and in the Fidelity_Report | Accepted |
| O13 | Whether `-renameInvalidIdentifiers` followed by `-deobfuscate max` removes the `§§push` and `§§pop` residue is not measured. | neither | Block B may translate few classes | Measure with the default limits (Requirement 16.10) |
| O14 | `abcClassCount` as the number of exported `.as` files differs by one from `swf_summary` on `redball4` (225 against 224). | measured | A reader may compare the wrong number | Documented in `docs/outcome.md` |
| O15 | The ABC constant-pool layout was checked by running a parser on eight real files, not read in the AVM2 specification text in this design. Multiname kinds not seen in those files (`0x0D`, `0x0F`, `0x10`, `0x11`, `0x12`, `0x1C`) are coded from the layout and are covered only by the generated pools of Property 16. | measured (8 files) | A wild file with those kinds may disagree | Read the AVM2 overview chapter on the constant pool in the first Block B task and compare |
| O16 | A game that uses a Unicode letter in a legitimate identifier passes the Unicode rule; one that uses a letter that `\p{L}` does not cover would count as invalid. | neither | A false `obfuscated` verdict for a legitimate file | The share threshold and the floor limit the effect |
| O17 | The mapping of `MISSING_EXPORT`, `XML_VERSION` and `MISSING_HEADER_VALUE` to `failed` is a judgement: a damaged file might trigger `MISSING_EXPORT`. | neither | A damaged input reported as `failed` | Review after the first hostile fixtures that reach FFDec |
| O18 | Ruffle skips a SymbolClass pair whose class lookup fails and keeps the earlier pair of that id (`movie_clip.rs` load loop, read by the checkpoint 4 reviewer, not measured), while `buildClassLinks` takes the last name of the id whatever happens to the lookup. | read (reviewer), not measured | Narrow: only an id with two names where the last name is not a defined class; not exercised by a local file | Read the lookup-failure arm at `4a8d396` and, if confirmed, choose the last name that has a class source in `readUnpacked` |

## Proposed requirement amendments

`requirements.md` was not edited by this design pass. The table shows what the current requirements already say and what is still to be amended.

| # | Amendment | Status |
|---|---|---|
| A1 | The stage limit is a base multiplied by a weight per stage. The requirements list unpack 2, verify 3 and others 1; this design adds the stage `recover` with weight 2 (D-B6). Requirements 6.2 and 6.10 still say the recovery steps count inside the stage limit of unpack and need the change | Approved, partly applied (6.2 weights); recover weight pending |
| A2 | (Withdrawn.) The old A2 said `redball4` is refused `time-limit` under the defaults. The owner's limits make the target `converted-with-gaps` (Requirement 6.16) | Rejected, replaced by U1 |
| A3 | The hit region is the current state child plus the hit shapes (Requirements 20.7, 20.8, 20.16) | Approved, applied |
| A4 | The Player and Shim gain `mouseOver`, `mouseOut`, `rollOver`, `rollOut` (Requirement 20.10) | Approved, applied |
| A5 | No committed sample holds a button; the check is "samples keep their scores, the generated fixture passes" (Requirements 20.18, 21.1) | Approved, applied |
| A6 | (Withdrawn.) The old A6 made the baseline a proxy. There is no baseline and no keep rule (Requirement 16.5; D-B5) | Rejected, replaced by D-B5 |
| A7 | `abcClassCount` is filled after Unpack (Requirement 3.10; 4.8) | Approved, applied |
| A8 | `ZWS` is header-only (Requirement 3.7) | Approved, applied |
| A9 | Stubs ship in the Shim (Requirement 17.2) | Approved, applied |
| A10 | `SIGINT` handled; `SIGTERM` only where delivered (Requirement 7.4) | Approved, applied |
| A11 | `numbers` may be null for a refusal before Translate (Requirement 2.3) | Approved, applied |
| A12 | `Point.copyFrom` and `setTo` (Requirement 18.1) | Approved, applied |
| A13 | `.kiro/steering/tech.md` corrected and extended (Requirements 10.4, 25.4; S4) | Approved, applied |
| A14 | The recovery object has `attempted`, `renamedIdentifiers`, `deobfuscated`, `candidateClasses`, `recoveredClasses`, `unrecoverableClasses`, `fallback` (Requirement 16.4). The design adds `skipped` and `failedStep` so that a refused run and a copy failure are visible | New, pending |
| A15 | Requirement 14.5 asks for "the counts of each signal"; the design has one signal before Unpack (invalid names: `namesScanned`, `invalidNames`) and one after (`sourceSignals`), recorded in `obfuscated` | New, pending |

## Evidence index

| Topic | Source |
|---|---|
| FFDec options and levels | `java -jar tools/ffdec/ffdec-cli.jar -help renameInvalidIdentifiers`, `-help deobfuscate`, `-help decrypt` (26.4.0) |
| Recovery timings | `Measure-Command` over `.work/judge-test/redball4.swf`, outputs in `.work/judge-test/design-tmp/` |
| Stage timings | `npm run pipeline` on `redball4.swf`, per-line timestamps |
| Class names after recovery | `swf_list_classes` on `design-tmp/d.swf` and `design-tmp/rd.swf` |
| Facts and cut file | Node script over `truncated.swf`, `redball4.swf`, `clickgoto`, `entity_game`; `swf_summary` |
| ABC constant pool and name counts | `.work/abc-scan/scan.cjs` (ASCII rule) and `scan2.cjs` (Unicode rule), run over `redball4.swf` and the seven committed samples with an ABC tag (`.work/` is not committed) |
| Button XML names | `swf_find_tags` on `redball4.swf`; generated round trip `design-tmp/b.xml`, `b2.xml` |
| Ruffle button behaviour | `core/src/display_object/avm2_button.rs` and `core/src/player.rs` at commit `4a8d39661ed8aec97afee1504a4e33080da2efd0` |
| Ruffle `Point` | `core/src/avm2/globals/flash/geom/Point.as` at the same commit |
| Existing code | `src/pipeline/{cli,pipeline,errors}.ts`, `src/unpack/{unpack,spawnFfdec,errors,swfSniff}.ts`, `src/verify/edge/launchChromium.ts`, `src/convert/{convertModel,ffdecXml}.ts`, `template/runtime/{player,scene}.ts`, `web/server/options.ts` |
