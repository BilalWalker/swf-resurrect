# Implementation Plan: translate

## Overview

Language: TypeScript (strict), as in the design. The plan runs in this order: the TypeScript dependency decision (D1, approved by the user, installed in Task 1.2), fixtures, Shim additions, the pure Transpiler (lexer, scanner, rewrite, emit, syntax-check injection), the three required property tests, planning and report, the type-check gate, Emitter and Pipeline wiring, the switch from handwritten to translated classes, end-to-end conversion of both samples, a browser checkpoint, and the steering update. No UI, LLM, verification or hosting.

Rules that apply to every task:

- Follow `.kiro/steering/git-workflow.md`. One top-level task is one commit. Before the commit run `npm run typecheck` and `npm test -- --run`; both must pass. Stage by path only the files the task created or changed, plus `.kiro/specs/translate/tasks.md` and `tasks.meta.json`. Use the areas `Unpack`, `Convert`, `Emit`, `Runtime`, `Shim`, `Pipeline`, `Test`, `Spec`, `Steering`, `Build`, `Repo`, `Samples`. Never `git push`, never amend, never commit `tools/`, `node_modules/`, `out/`, `.work/` or `dist/`.
- Stop and ask the user instead of continuing when: a checkpoint is reached; tests or typecheck cannot pass within the task's scope; a finding contradicts `requirements.md`, `design.md` or `.kiro/steering/tech.md`; or a task would need an FFDec XML name marked `UNVERIFIED` in `src/convert/ffdecXml.ts` to be trusted. Do not trust such a name.
- Before coding a task, read the design section named in the task (the design is long; do not rely on its first part only). The design's "Component index for task execution" maps components T1 to T16 to headings.
- Files in `src/translate/` other than `tsSyntaxCheck.ts`, `typeCheckGate.ts` and `translateStage.ts` import no `node:*` module and no `typescript-js`, and use no `Date`, `Math.random` or `localeCompare`.
- No regular expressions run over AS3 source lines in the Transpiler. The lexer and scanner drive everything.
- Exact dependency versions only (no `^`, `~`, ranges or tags). Commands are PowerShell compatible. Test runs use `npm test -- --run`, never watch mode. Never block on a dev server or `vite preview`.
- Do not edit `requirements.md`, `design.md` or `.kiro/steering/tech.md` from any task except the Steering task (Task 19).
- `tasks.meta.json` is written by the task runner. Do not create or hand-edit it; stage it with the commit when it exists.

## Tasks

- [x] 1. TypeScript dependency decision D1 (design T1)
  - [x] 1.1 Record that decision D1 is approved by the user
    - The user has approved D1: TypeScript 7.0.2 has no in-process `createProgram`, so the devDependency is exactly `"typescript-js": "npm:typescript@6.0.3"` (the last JS-based release). Only `src/translate/tsSyntaxCheck.ts` and `src/translate/typeCheckGate.ts` will import it; the repo's `typescript` stays 7.0.2.
    - This is not a stop-and-ask. Do not wait for anything and do not install here; the install happens in Task 1.2. Continue straight to Task 1.2.
    - _Requirements: 4.6_

  - [x] 1.2 Install `typescript-js` and add `tsSyntaxCheck`
    - Run `npm install --save-exact --save-dev "typescript-js@npm:typescript@6.0.3"`. Confirm `package.json` has the exact alias and no range operator.
    - Create `src/translate/tsSyntaxCheck.ts` exporting `tsSyntaxCheck: SyntaxCheck` that wraps `ts.transpileModule` (reportDiagnostics, no file system) and returns syntax errors as `{ line, message }`. Define the `SyntaxCheck` type in a small type-only `src/translate/types.ts` (with `Diagnostic`, `DiagnosticKind`, `LineSpan`, `ClassInfo`, `TranslateOptions`, `TranslateResult` from the design) so pure files can import it.
    - Confirm `import ts from 'typescript-js'` typechecks under the repo's `tsc` 7.0.2 (`npm run typecheck`). If it does not, stop and ask.
    - _Requirements: 1.5_

- [x] 2. Add EventWatcher fixtures (design T9, R9)
  - [x] 2.1 Copy `EventWatcher.as` into both fixture directories unedited
    - Copy the bytes of `.work/ffdec-capture/scripts/EventWatcher.as` to `test/fixtures/clickgoto/scripts/EventWatcher.as` and `test/fixtures/tweendemo/scripts/EventWatcher.as` with `Copy-Item` (byte copy, CRLF kept). Do not open and re-save them.
    - Confirm with `Get-FileHash` that both copies equal the source and that `.gitattributes` has `test/fixtures/** -text`. If the `.work/` copy is missing, regenerate it with the same two FFDec invocations as in `vertical-slice` Task 2.1 and compare the other three scripts to the existing fixtures first.
    - Check that the fixture line numbers cited by the design hold (`EventWatcher.as:17` `trace`, `:23` to `:29` the Event constants, `MainTimeline.as:36` `getChildAt`, `:51` `Shape`). If any differs, note the real numbers for Task 3.2 and tell the user.
    - _Requirements: 4.1, 5.5, 5.7, 5.8_

- [x] 3. Shim additions and ADDED_APIS.md (design T2, section 8)
  - [x] 3.1 Add the Event constants, `getChildAt`, `Shape` and `trace`
    - In `template/shim/events.ts` add `EXIT_FRAME`, `ADDED`, `ADDED_TO_STAGE`, `FRAME_CONSTRUCTED`, `REMOVED`, `REMOVED_FROM_STAGE`, `RENDER` with the distinct string values from the design.
    - In `template/shim/Sprite.ts` add `getChildAt(index)` (returns the child, throws `RangeError` when out of range).
    - Create `template/shim/Shape.ts` (`class Shape extends DisplayObject { readonly graphics: object = {} }`) and `template/shim/trace.ts` (`trace(...args)` writing to `console.log` by default, `setTraceSink(fn | null)`).
    - Export `Shape`, `trace` and `setTraceSink` from `template/shim/index.ts`. Run `npm run typecheck:template`.
    - _Requirements: 5.1, 5.3_

  - [x] 3.2 Make `ShapeObject` extend `Shape` and write `ADDED_APIS.md`
    - In `template/runtime/stageTree.ts` change `ShapeObject` to extend `Shape`.
    - Create `template/shim/ADDED_APIS.md`: a table `| API | Needed by |` with one row per added API (`Event.EXIT_FRAME`, `Event.ADDED`, `Event.ADDED_TO_STAGE`, `Event.FRAME_CONSTRUCTED`, `Event.REMOVED`, `Event.REMOVED_FROM_STAGE`, `Event.RENDER`, `trace`, `getChildAt`, `Shape`), each citing the class file and line from Task 2.1 that uses it. Rows for `setTraceSink` and the EXIT_FRAME pass (`_exitFrame`) say they support `trace` and `EXIT_FRAME`. No row for an API that was not added.
    - Run `npm run typecheck:template`.
    - _Requirements: 5.1, 5.4_

  - [ ]* 3.3 Write unit tests for the Shim additions
    - In `test/unit/shimAdditions.test.ts`: all `Event` constants pairwise distinct; `getChildAt` in and out of range; `trace` default and replaced sink; a listener for `ADDED` and the other undispatched events is accepted and called 0 times; every `ADDED_APIS.md` row names an export and the cited fixture line contains the API token.
    - _Requirements: 5.1, 5.3, 5.4_

- [x] 4. EXIT_FRAME pass (design T3, decision D8)
  - [x] 4.1 Add `_exitFrame` and call it after `root._step()`
    - In `template/shim/MovieClip.ts` and `template/shim/internal.ts` add `exitFrame(mc)`: snapshot every MovieClip under the root in pre-order, dispatch `EXIT_FRAME` once to each that is still attached, playing or stopped. A clip created by an `EXIT_FRAME` listener is not notified that tick.
    - In `template/runtime/player.ts` call `exitFrame(root)` once per whole frame step, after `root._step()` returns. Clicks and `gotoAnd*` do not dispatch it.
    - Run `npm run typecheck:template` and the existing stepping and MovieClip tests.
    - _Requirements: 5.1, 5.2_

  - [ ]* 4.2 Write unit tests for EXIT_FRAME
    - In `test/unit/exitFrame.test.ts`: `EXIT_FRAME` reaches every clip once per tick, after all frame scripts of that tick, for playing and stopped clips; a clip added during `EXIT_FRAME` is not notified that tick; no `EXIT_FRAME` on click or `gotoAnd*`.
    - _Requirements: 5.2_

- [x] 5. Lexer (design T4, section 1.1)
  - [x] 5.1 Implement `tokenizer.ts`
    - Create `src/translate/tokenizer.ts`: a character-level scanner, no regular expressions on source text. `Token` is `{ kind, text, start, end, line, endLine }` with kind `id | num | str | regex | punct | comment | bad`. Keep comment tokens. Longest-match punctuation including `>>>=`, `...`, `.<`, `::`, `..`, `===`, `!==`. Regex-versus-division by the previous significant token. Unterminated string becomes a `bad` token to end of line; unterminated block comment a `bad` token to end of file. Normalise `\r\n` to `\n` before lexing.
    - _Requirements: 1.1, 1.3, 1.4_

  - [ ]* 5.2 Write unit tests for the lexer
    - Regex versus division, `Vector.<int>`, strings, unterminated string and comment, line and end-line numbers of multi-line comments, CRLF input.
    - _Requirements: 1.1, 1.4_

- [x] 6. Statement scanner and line accounting (design T5, sections 1.2 and 1.3)
  - [x] 6.1 Implement `scanner.ts` and `emitTs.ts`
    - Create `src/translate/scanner.ts`: brace-aware scan at file, class-body and statement level as in the design table. Track `()`, `[]`, `{}` depth so `;` and `}` inside nested groups never end a node. Unsupported nodes for `try` (with `catch`/`finally`), `switch`, `with`, `delete`, `namespace`, `use`, `include`, `default xml`, nested `function`, labels, E4X markers. A compound statement with an unsupported header is one node. Compound bodies are always emitted in braces. An unclosed `{` makes its construct unsupported to end of file. Every node records `startLine` and `endLine`.
    - Create `src/translate/emitTs.ts`: assemble output text with LF endings and one trailing newline, `LineSpan[]` (`translated`, `structural`, `dropped`, `comment`, `unsupported`) and `Diagnostic[]`. An unsupported span emits one `// AS3: <line>` comment per source line (trailing whitespace trimmed; `\r`, U+2028, U+2029 escaped) and exactly one `unsupported-construct` Diagnostic at the span's first line. Diagnostics are sorted by (line, kind, message) in UTF-16 code unit order. Blank or whitespace-only input returns empty text and no Diagnostics.
    - _Requirements: 1.3, 1.4, 1.6, 3.5_

  - [ ]* 6.2 Write unit tests for the scanner
    - Brace and paren depth, `;` in nested groups, `try/catch/finally` as one span, unbraced bodies get braces, unclosed brace, two statements on one line, multi-line block comment kept whole.
    - _Requirements: 1.3, 1.4, 3.5_

- [x] 7. Rewrites and Shim name lists (design T6, sections 1.4, 1.5 and 2)
  - [x] 7.1 Implement `rewrite.ts`
    - Create `src/translate/rewrite.ts`: token-level edits copying source text between tokens. `int(x)` to `(x | 0)` and `uint(x)` to `(x >>> 0)` with the precedence wrapping rule; `is`/`instanceof` to `instanceof` (primitive right-hand types make the statement unsupported); `as`; bare `name(` to `this.name(` for `shimMembers` and own non-static methods (includes bare `addFrameScript`); `<chain>.parent.<member>` to `(<chain>.parent as any).<member>` with one `loose-type` per access; `Vector.<T>` to `T[]`; the type mapping (`int`/`uint`/`Number` to `number`, `String`, `Boolean`, `*` and `Object` to `any` with no Diagnostic for `Object`, `Array` to `any[]`, `void`); `for each` to `for (const x of y)`; loose-type Diagnostics for missing or `*` annotations and rest parameters; return type `*` to `void` when no `return <expr>` in the method's own body.
    - Output of declarations as in the design table (package unwrapped, imports collapsed to one `../shim` import sorted by code unit plus `./Sibling` imports, metadata dropped, `internal` as no modifier, fields with AS3 defaults or `declare`, `const` to `readonly`, getters and setters, accessor-type mismatch with one `loose-type`).
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.4, 3.6_

  - [x] 7.2 Implement `shimNames.ts`
    - Create `src/translate/shimNames.ts` exporting `SHIM_AS3_NAMES` (`Event`, `EventDispatcher`, `MouseEvent`, `DisplayObject`, `DisplayObjectContainer`, `Sprite`, `MovieClip`, `Shape`, `trace`) and `SHIM_MOVIECLIP_MEMBERS` as in the design. Pure file, no imports from the Shim.
    - _Requirements: 2.2, 2.7_

  - [ ]* 7.3 Write the shimNames drift test
    - In `test/unit/shimNames.test.ts`: import `template/shim/index.ts` and assert every name in `SHIM_AS3_NAMES` is an export and every member of `SHIM_MOVIECLIP_MEMBERS` exists on `MovieClip.prototype`.
    - _Requirements: 2.2, 2.7, 5.1_

- [x] 8. Translate entry points, constructors and binding (design T7, sections 1.6 and 1.7)
  - [x] 8.1 Implement `translateCore` with constructor fixes and method binding
    - Create `src/translate/translate.ts` with `translateCore(source, options)` wiring tokenizer, scanner, rewrite and emitTs. Constructors: `super(args)` first (arguments unchanged), then `this.m = this.m.bind(this);` for each value-referenced non-static, non-accessor method in declaration order, then the other statements in original relative order; insert `super();` when an `extends` class has none; synthesise a constructor when binds or `super()` are needed and none exists.
    - Verify design risk R3 on the fixtures: `public declare x: T;` and the `bind` line are accepted by `tsc` 6.0.3 (syntax check) and by Vite/Vitest transforms. If `declare` fails in any tool, use `x!: T` and tell the user.
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 8.2 Implement `translate` with the injected syntax check
    - Add `translate(source, options)` to `translate.ts`: run `translateCore`, then `options.syntaxCheck(text)`. On any error replace the result with the fallback of decision D5 (whole file as `// AS3:` comments, one `unsupported-construct` Diagnostic on line 1 saying the output does not parse and quoting the first parser message, one `unsupported` span). Blank input returns empty text and skips the check.
    - _Requirements: 1.1, 1.2, 1.5, 1.6_

- [x] 9. Transpiler property tests and golden tests (design T8, T9)
  - [x] 9.1 Write the AS3 generators
    - Create `test/property/gen/genAs3.ts`: `genProgram` (package, imports, metadata, class with fields, accessors and methods; statements drawn from supported and unsupported forms, blank lines, line and block comments, mixed `\n`/`\r\n`; a unique marker per statement; records marker, first line and unsupported flag) and `genSoup` (token soup with unbalanced braces, unterminated strings and comments, U+2028/2029). Use the shared config from `test/property/config.ts`.
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 3.5_

  - [x] 9.2 Write property test for determinism
    - Create `test/property/translateDeterminism.test.ts`, tagged `// Feature: translate, Property 1: Translation is deterministic`. Also compare the CRLF and LF forms of the same text.
    - **Property 1: Translation is deterministic**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 9.3 Write property test for line accounting
    - Create `test/property/translateLineAccounting.test.ts`, tagged `// Feature: translate, Property 2: Every source line is accounted for`. Check (a) each marker appears exactly once in the output, (b) one `unsupported-construct` Diagnostic per unsupported statement at its first line and none other, (c) every non-blank line lies inside a returned `LineSpan` within `1..N`, (d) each non-blank line of an `unsupported` span appears as a `// AS3: ` comment in order.
    - **Property 2: Every source line is accounted for**
    - **Validates: Requirements 1.3, 1.4, 3.5**

  - [x] 9.4 Write property test for parse-or-report
    - Create `test/property/translateParse.test.ts`, tagged `// Feature: translate, Property 3: Output parses or the failure is reported`. Parse independently with `ts.transpileModule` from `typescript-js` in the test (not through `tsSyntaxCheck`). For grammar inputs also assert `translateCore` output already parses; blank input gives empty text.
    - **Property 3: Output parses or the failure is reported**
    - **Validates: Requirements 1.5, 1.6, 3.5**

  - [ ]* 9.5 Write golden tests for the four fixture classes
    - Translate `EventWatcher`, `LeftButton`, `RightButton`, `MainTimeline` from `test/fixtures/clickgoto/scripts/` and compare with checked-in expected `.ts` files under `test/fixtures/translate/` and the expected Diagnostics (`MainTimeline` loose-type count, no `unsupported-construct`). Include the constructor, binding (`add` then `remove` listener leaves zero) and override-binding cases.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 3.1, 3.2, 3.3, 3.4, 5.9_

  - [ ]* 9.6 Write the purity guard test
    - In `test/unit/translatePurity.test.ts`: grep `tokenizer`, `scanner`, `rewrite`, `emitTs`, `translate`, `shimNames`, `planTranslate`, `report` for `node:*`, `typescript-js`, `Date`, `Math.random`, `localeCompare`.
    - _Requirements: 1.1_

- [x] 10. Planning and emit closure (design T10, section 3)
  - [x] 10.1 Implement `planTranslate` and `translateStage`
    - Create `src/translate/planTranslate.ts` (pure): `ScriptSource`, `TranslatedClass`, `TranslateArtifact`, `planTranslate(sources, scene, syntaxCheck)`. Sibling set is all file stems; translate sources sorted by class name; emit closure starts from Scene_JSON linked class names that have a translated class and adds `extendsName` repeatedly; return emitted classes sorted by name.
    - Create `src/translate/translateStage.ts` (IO): read every `.as` under `unpacked.scriptsDir` (sorted by path), call `planTranslate`. Throw `ScriptsDirError` for a missing directory and `DuplicateClassError` for duplicate class names (both extend `PipelineError`, stage `translate`). Never read `samples/*/original-source/`.
    - _Requirements: 4.1, 4.3_

  - [x]* 10.2 Write unit tests for planning
    - Closure (base added, chain of two, unlinked non-base class skipped), duplicate class error, missing scripts directory error, `EventWatcher` emitted for the clickgoto fixtures.
    - _Requirements: 4.1, 4.3_

- [x] 11. Type_Check_Gate (design T11, section 5)
  - [x] 11.1 Implement `typeCheckGate.ts`
    - Create `src/translate/typeCheckGate.ts`: `typeCheckProject({ files, repoRoot })` with `ts.createProgram` from `typescript-js` and a custom `CompilerHost` that serves a virtual root `<repoRoot>/__gate__/` from the `files` map and delegates other paths to `ts.sys`, so `pixi.js` resolves from `<repoRoot>/node_modules`. Options come from the emitted `tsconfig.json` with `noEmit: true`; roots are `.ts` files under the tsconfig `include` directories. Errors sorted by (file, line, column, code, message); messages have `V/` and `repoRoot` replaced by `<out>` and `<repo>`. Add `TypeCheckGateError` (stage `pipeline`) for internal failures. No `npm install`, no child process.
    - _Requirements: 4.6_

  - [ ]* 11.2 Write unit tests for the gate
    - A clean in-memory project gives 0 errors; an injected error in `src/LeftButton.ts` is attributed to that file and one in `runtime/player.ts` to another file; `pixi.js` resolves; messages contain no absolute path; `node_modules/pixi.js/package.json` version equals `PIXI_VERSION`.
    - _Requirements: 4.6, 4.7_

- [x] 12. Translation_Report and canonicalJson reuse (design T12, sections 6 and 10 D10)
  - [x] 12.1 Extract and reuse `canonicalJson`
    - Move the canonical JSON writer from `src/pipeline/unsupported.ts` into a shared `src/pipeline/canonicalJson.ts` (sorted keys, two-space indent, `\n`, one trailing newline) and make `unsupported.ts` use it with unchanged output. Existing tests must pass unchanged.
    - _Requirements: 4.4_

  - [x] 12.2 Implement `report.ts` and add `untranslated-code`
    - Add `'untranslated-code'` to `UnsupportedKind` in `src/convert/model.ts` (and any exhaustive switch over it).
    - Create `src/translate/report.ts` (pure): `classStatus`, `buildReport`, `serialiseReport` (via `canonicalJson`), `untranslatedCodeEntries` (one entry per `unsupported-construct` Diagnostic of every emitted, non-overridden class, class in `tag`, line in `message`). Type errors in `src/<Class>.ts` go on that class and raise its status to `unsupported`; other files go to `otherErrors`; `typeCheck` is `'ran'` or `'skipped'`; overridden classes list no Diagnostics; `as3Line` is a convenience and `null` for generated lines.
    - _Requirements: 4.4, 4.5, 4.6, 4.7_

  - [ ]* 12.3 Write unit tests for the report
    - `classStatus` truth table, type errors raise status, two builds byte-identical, `otherErrors` collects non-class files, `untranslatedCodeEntries` per Diagnostic, overridden entry, `untranslated-class` for a linked class with no source.
    - _Requirements: 4.4, 4.5, 4.7_

- [x] 13. Emitter, classes.ts and overrides (design T13, section 4)
  - [x] 13.1 Change `planEmit` and `emit` to take translated classes
    - Extend `EmitOptions` and `EmitInput` with `translated` and keep `handwritten` meaning the Override_Directory. `planEmit` writes `src/<Class>.ts` for every emitted translated class and for every override whose class is linked or in the closure (override text wins). An override for any other name is ignored and listed in `warnings`. Implement `buildClassesTs(scene, classNames)` registering exactly the Scene_JSON-linked names that are available, sorted by code unit (`LeftButton`, `MainTimeline`, `RightButton` for the samples; `EventWatcher` emitted but not registered). An empty Override_Directory copies 0 files. `package.json` generation unchanged.
    - _Requirements: 4.2, 4.3, 5.5_

  - [ ]* 13.2 Write unit tests for the Emitter changes
    - `buildClassesTs` for the clickgoto scene lists exactly the three names; override wins over translated; override for an unrelated name ignored with a warning; two `planEmit` runs identical; 0 files copied for an empty Override_Directory.
    - _Requirements: 4.2, 4.3, 5.5_

- [x] 14. Pipeline wiring and report writing (design T14, section 7)
  - [x] 14.1 Add translate and typeCheck stages to `runPipeline`
    - In `src/pipeline/errors.ts` add stage `'translate'`. In `src/pipeline/pipeline.ts` add `translate` and `typeCheck` to `PipelineStages` and run unpack, convert, translate, emit, typeCheck in order. Print `[translate] ok (<n> classes: <c> clean, <l> loose, <u> unsupported)`, `[typecheck] ok (0 errors)` or on stderr `[typecheck] <n> errors: <file> (<count>), ...`. Type errors do not change the exit code. Build the report and write `translation-report.json` next to `unsupported-features.json` under the same rule (after success, and after a failure once Convert completed; on the output-directory refusals it goes to stderr). If emit failed the report has `typeCheck: 'skipped'`. The unsupported list is Converter entries plus `untranslatedCodeEntries` plus `untranslated-class` entries for linked classes with no translated class and no override; `untranslatedClasses` takes the set of available names.
    - _Requirements: 4.4, 4.5, 4.6, 4.7_

  - [x] 14.2 Wire the real stages in `cli.ts`
    - Wire `translate: translateStage` and `typeCheck` (read the written files into a map and call `typeCheckProject` with `repoRoot` as the repository root). `--handwritten` and the default `handwritten/<sample>/` lookup unchanged. Pass override class names as `handwrittenClasses`.
    - _Requirements: 4.1, 4.2, 4.6_

  - [ ]* 14.3 Update and extend the pipeline unit tests
    - In `test/unit/pipeline.test.ts` add stub `translate` and `typeCheck` stages; cover stage order, skipped later stages on failure, report written with the output, `typeCheck: 'skipped'` after an emit failure, report to stderr on the refusal paths, and unchanged exit code on type errors.
    - _Requirements: 4.4, 4.7_

- [x] 15. Fixture-class helper, oracle switch and tweendemo test (design T15, sections 9 and 10)
  - [x] 15.1 Implement the fixture-class test helper
    - Create `test/support/fixtureClasses.ts` with `loadFixtureClasses(sample)`: read `test/fixtures/<sample>/scripts/*.as`, call `planTranslate` with the real `tsSyntaxCheck`, write each class to a unique `mkdtemp` directory under `.work/fixture-classes/`, import each with `pathToFileURL`, return `{ classes, results, dispose }`. `dispose` removes the directory. Silence `trace` with `setTraceSink(() => {})` and restore it afterwards. Verify design risk R2 (Vitest importing an absolute `.ts` under `.work/`); if it fails use the virtual-module plugin fallback in `vitest.config.ts` with the same helper API.
    - _Requirements: 5.7, 5.8_

  - [x] 15.2 Switch the click oracle to Fixture_Classes
    - In `test/unit/clickOracle.test.ts` replace the `handwritten/...` imports with `loadFixtureClasses('clickgoto')`; the `classRegistry` is `{ LeftButton, MainTimeline, RightButton }`. Keep every Expected_State row, position and assertion exactly as it is (no row added, removed or changed). The test imports nothing under `handwritten/`.
    - _Requirements: 5.7_

  - [x] 15.3 Write the tweendemo test with the 31-tick MainTimeline check
    - Create `test/unit/tweendemoClasses.test.ts`: convert `test/fixtures/tweendemo` as `tweendemoConvert.test.ts` does, load Fixture_Classes, build a `Player` with the fake backend and `ManualClock`. After the first Tick `l_button` and `r_button` are on `currentFrame` 1 and stopped. Then the root `MainTimeline` is still playing after 29 Ticks, stopped after 30, and still stopped after 31. Import nothing under `handwritten/`.
    - _Requirements: 5.2, 5.8_

- [x] 16. Remove the handwritten classes
  - [x] 16.1 Delete `LeftButton.ts` and `RightButton.ts` and the handwritten typecheck
    - Delete `handwritten/clickgoto/LeftButton.ts` and `handwritten/clickgoto/RightButton.ts` (keep `.gitkeep`). Remove the `typecheck:handwritten` script from `package.json` and delete `tsconfig.handwritten.json`. Remove any remaining reference (docs in `src/`, aliases only used for handwritten files). Confirm `grep` finds no import of `handwritten/` in `test/`.
    - Run `npm run typecheck` and `npm test -- --run`; both must pass.
    - _Requirements: 5.5, 5.7_

  - [x] 16.2 Write the no-Java fixture project type-check test
    - Create `test/unit/fixtureProjectTypecheck.test.ts`. For each of `clickgoto` and `tweendemo`: read the fixture scripts under `test/fixtures/<sample>/scripts/` and translate them with `planTranslate` and the real `tsSyntaxCheck`; convert the fixture to its Scene_JSON as `tweendemoConvert.test.ts` does; run `planEmit` with the real `template/` files and that Scene_JSON; run `typeCheckProject` (with `repoRoot` as the repository root) on the resulting file map. Expect 0 errors for both samples. No Java, no FFDec, no child process, no network.
    - Matches the "Fixture project" row of the design's Testing Strategy.
    - _Requirements: 4.6, 5.6, 5.8_

- [ ] 17. End-to-end conversion of both samples
  - [-] 17.1 Convert both samples and verify the gate and the build
    - Run `npm run pipeline -- samples/clickgoto/test.swf out/clickgoto --force` and `npm run pipeline -- samples/tweendemo/test.swf out/tweendemo --force`. Confirm for each: exit 0; `src/` holds `EventWatcher.ts`, `LeftButton.ts`, `MainTimeline.ts`, `RightButton.ts`; `src/classes.ts` registers exactly `LeftButton`, `MainTimeline`, `RightButton`; 0 files copied from `handwritten/`; `[typecheck] ok (0 errors)`; `translation-report.json` lists the four classes each `clean` or `loose` and none `unsupported`, with empty `typeErrors` and `otherErrors`.
    - In each `out/<sample>` run `npm install`, `npm run typecheck` and `npm run build`; `npm run build` must exit 0. Fix the Transpiler, Emitter or Shim within scope if anything fails; if the cause is outside this spec, stop and ask.
    - Run the pipeline twice per sample and compare the output trees, including `translation-report.json`, byte for byte.
    - _Requirements: 4.4, 5.5, 5.6, 5.8, 5.9_

  - [ ]* 17.2 Extend the e2e smoke test
    - In `test/e2e/pipeline.e2e.test.ts` assert for every sample: the four class files exist, `src/classes.ts` registers exactly three names, `translation-report.json` has four classes with none `unsupported` and empty `typeErrors` and `otherErrors`, `npm run build` exits 0, and two runs are byte-identical. Keep the existing missing-dependency failure behaviour.
    - _Requirements: 4.4, 5.5, 5.6, 5.8, 5.9_

- [~] 18. Checkpoint - Both samples run in the browser
  - Ensure all tests pass, ask the user if questions arise. Run `npm test -- --run` and `npm run typecheck`, then the two pipeline commands of Task 17.1.
  - Ask the user to start each project manually in their own terminal: in `out/clickgoto` and `out/tweendemo` run `npm run dev` (or `npm run build` then `npx vite preview`). The agent must not start or wait on a dev or preview server.
  - Ask the user to confirm `clickgoto` against every row of the Expected_State table in `samples/clickgoto/PROVENANCE.md`, and `tweendemo` against its `PROVENANCE.md` (both buttons on frame 1 and stopped at start, clicks behave as in clickgoto, the tween plays, the root stops after about 30 frames).
  - Stop and wait for the user's visual confirmation before continuing.

- [ ] 19. Update steering status
  - [~] 19.1 Update `tech.md` and `structure.md` if needed
    - Compare `.kiro/steering/tech.md` and `.kiro/steering/structure.md` with the repository: pipeline now `unpack -> convert -> translate -> emit`, `src/translate/` stage layout, `template/shim/ADDED_APIS.md`, `typescript-js` alias and why, `handwritten/` as an optional override directory, removed `typecheck:handwritten`, confirmed `npm run` scripts from `package.json`. Edit only what is stale; make no change if nothing is. Keep wording tight and do not touch the FFDec facts.
    - _Requirements: 4.2, 5.5_

- [~] 20. Final checkpoint - Ensure all tests pass
  - Run `npm test -- --run` (including the three required property tests), `npm run typecheck` and `npm run typecheck:template`. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Required tests: the three property tests (fast-check): Property 1 (determinism, Task 9.2), Property 2 (line accounting, Task 9.3), Property 3 (parse-or-report, Task 9.4); the click oracle switch (Task 15.2), which keeps an existing test passing after the handwritten classes go; the tweendemo test (Task 15.3); and the fixture project test (Task 16.2). All other tests are optional.
- Decision D1 (`typescript-js` alias) is approved by the user; Task 1.1 records it and does not stop. The install is in Task 1.2. Task 18 is a user-run browser checkpoint and may not be skipped.
- An FFDec XML name marked `UNVERIFIED` in `src/convert/ffdecXml.ts` must not be trusted by any task.
- FFDec is GPLv3 and is only run as a separate process. It is never committed.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "3.2", "5.2", "6.1"] },
    { "id": 2, "tasks": ["3.3", "4.1", "6.2", "7.1", "7.2"] },
    { "id": 3, "tasks": ["4.2", "7.3", "8.1"] },
    { "id": 4, "tasks": ["8.2"] },
    { "id": 5, "tasks": ["9.1", "9.5", "9.6", "10.1", "11.1", "12.1"] },
    { "id": 6, "tasks": ["9.2", "9.3", "9.4", "10.2", "11.2", "12.2", "13.1", "15.1"] },
    { "id": 7, "tasks": ["12.3", "13.2", "14.1", "15.2"] },
    { "id": 8, "tasks": ["14.2", "14.3", "15.3"] },
    { "id": 9, "tasks": ["16.1"] },
    { "id": 10, "tasks": ["16.2"] },
    { "id": 11, "tasks": ["17.1", "17.2"] },
    { "id": 12, "tasks": ["19.1"] }
  ]
}
```
