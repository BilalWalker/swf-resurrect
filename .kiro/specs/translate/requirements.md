# Requirements Document

## Introduction

The vertical slice translated the `LeftButton` and `RightButton` classes by hand (`handwritten/clickgoto/`). This spec replaces that step with a deterministic ActionScript 3 to TypeScript Transpiler. The Transpiler is a pure function: it takes the text of one FFDec-decompiled `.as` file and returns TypeScript text plus Diagnostics. It handles the subset of AS3 that FFDec emits for the repository samples (`samples/clickgoto` and `samples/tweendemo`), which share the classes `EventWatcher`, `LeftButton`, `RightButton` and `MainTimeline`. Where AS3 is untyped or dynamic the Transpiler emits loose types so the file still compiles. Anything it does not understand is kept as a comment and reported.

The Pipeline gains a Translate step between Convert and Emit. It reads the `.as` files that the Unpacker exported (never `samples/*/original-source/`), writes the translated classes into the Emitted_Project `src/`, runs the Type_Check_Gate on the result, and writes a Translation_Report next to `unsupported-features.json`. The `handwritten/` directory becomes an optional per-class override.

There is no LLM, no network, no UI, no fidelity verification and no hosting in this spec. The LLM repair loop is a later spec. The Shim grows only by what the four sample classes need, and every addition is listed.

Facts checked in the repository when this spec was written:

- `test/fixtures/clickgoto/scripts/` holds `LeftButton.as`, `RightButton.as` and `MainTimeline.as` but not `EventWatcher.as`, although `MainTimeline`, `LeftButton` and `RightButton` extend it. FFDec does export it (`.work/ffdec-capture/scripts/EventWatcher.as`). The tasks add it to the fixtures unedited.
- `test/fixtures/tweendemo/scripts/` exists and holds `LeftButton.as`, `RightButton.as` and `MainTimeline.as`, and also lacks `EventWatcher.as`. The tasks add it there unedited too.
- `MainTimeline.enter_frame_controller` counts ENTER_FRAME events and sets `destroy_me` when the count reaches 30. `exit_frame_controller` then calls `destroy()` and `stop()` on the root. The Shim dispatches ENTER_FRAME on every tick to every MovieClip, including the root, so the count reaches 30 on tick 30. The Shim does not dispatch EXIT_FRAME today, so the `stop()` never runs and the root keeps playing.
- `trace(...)` calls are common in the sample classes. The Shim has no `trace` function today.
- Decompiled constructors call `addFrameScript(...)` before `super()`, carry an `[Embed(...)]` or `[SWF(...)]` metadata line, use the `internal` modifier, return type `*`, and register methods as listeners as `this.clicked` without binding.
- `MainTimeline.as` uses `instanceof` (FFDec's output for AS3 `is`), `for(i = 0; ...)` loops, `from.getChildAt(i)`, `from.numChildren`, `Shape`, `DisplayObjectContainer` and `Event.EXIT_FRAME`. `EventWatcher` also uses `Event.ADDED`, `ADDED_TO_STAGE`, `FRAME_CONSTRUCTED`, `REMOVED`, `REMOVED_FROM_STAGE` and `RENDER`. None of these exist in the Shim today.
- `this.parent.r_button` is not typed: Shim `parent` is `DisplayObjectContainer | null`.

## Glossary

- **Transpiler**: The pure function `translate(source: string, options) -> { text: string, diagnostics: Diagnostic[] }` in `src/translate/`. It performs no file, network, clock or random access.
- **Translate_Stage**: The Pipeline stage that runs the Transpiler over every `.as` file in the Unpacker's exported scripts directory and returns the translated files and the Translation_Report.
- **Source_Line**: One line of the input text of the Transpiler, counted after splitting on `\n` or `\r\n`.
- **Blank_Line**: A Source_Line that is empty or contains only whitespace.
- **Diagnostic**: One record `{ kind, line, message }` where `line` is the 1-based Source_Line and `kind` is `unsupported-construct` or `loose-type`.
- **Unsupported_Construct**: Source text the Transpiler does not understand. It is emitted as a `// AS3:`-prefixed comment and has one Diagnostic of kind `unsupported-construct`.
- **Loose_Type**: A declaration or access emitted as `any` where AS3 gave no usable static type (`*`, no annotation, or a member access on `parent`). It has one Diagnostic of kind `loose-type`.
- **Translated_Class**: The TypeScript file the Translate_Stage emits for one AS3 class, written to the Emitted_Project as `src/<ClassName>.ts`.
- **Translation_Report**: The JSON file `translation-report.json` in the output directory, next to `unsupported-features.json`, with one entry per class.
- **Class_Status**: One of `clean` (no Diagnostics and no type errors), `loose` (one or more `loose-type` Diagnostics, no `unsupported-construct` Diagnostics and no type errors), `unsupported` (one or more `unsupported-construct` Diagnostics or one or more type errors).
- **Type_Check_Gate**: The in-process step that type-checks the Emitted_Project with the TypeScript compiler API, resolving `pixi.js` from this repository's `node_modules`, and groups the errors by file. It runs no `npm install` and no child process.
- **Tick**: One call of the Runtime's frame step, which advances the stage once.
- **Override_Directory**: The optional directory `handwritten/<sample>/` (or the `--handwritten` argument) holding `<ClassName>.ts` files that replace a Translated_Class of the same name.
- **Shim**: The Flash API layer in `template/shim/`, as defined in the `vertical-slice` spec.
- **Pipeline**: The command-line tool of the `vertical-slice` spec, now running Unpack, Convert, Translate and Emit.
- **Click_Oracle**: The existing unit test `test/unit/clickOracle.test.ts` that checks the Expected_State of `clickgoto` after clicks.
- **Fixture_Classes**: The Translated_Classes that the test run produces at test time by running the Transpiler on `test/fixtures/<sample>/scripts/*.as`.
- **Sample_Set**: The two samples `samples/clickgoto/test.swf` and `samples/tweendemo/test.swf`.

## Requirements

### Requirement 1: Pure, deterministic Transpiler with full line accounting

**User Story:** As a developer, I want the Transpiler to be a pure function that never loses source text, so that every translation is repeatable and every gap is visible.

#### Acceptance Criteria

1. THE Transpiler SHALL accept the text of one `.as` file and return TypeScript text and a list of Diagnostics, using no file system, network, clock, randomness or locale-dependent call and making zero LLM calls.
2. WHEN the Transpiler runs twice on the same input text and options, THE Transpiler SHALL return byte-identical TypeScript text and Diagnostics that are equal in the same order, with the same kind, line number and message (determinism property).
3. FOR ALL generated inputs, every non-Blank_Line Source_Line SHALL be either translated into output text or kept in the output as an Unsupported_Construct comment with exactly one Diagnostic carrying that 1-based line number, so that no non-Blank_Line Source_Line is dropped (line-accounting property).
4. IF the Transpiler does not understand a Source_Line, THEN THE Transpiler SHALL keep the original text of that line in a `// AS3:` comment, add one Diagnostic of kind `unsupported-construct` carrying that line number, and continue with the next Source_Line.
5. FOR ALL generated inputs, the TypeScript text returned by the Transpiler SHALL parse with the TypeScript parser with zero syntax errors, or the Transpiler SHALL return a Diagnostic of kind `unsupported-construct` on line 1 stating that the output does not parse (parse-or-report property).
6. IF the input text is empty or contains only Blank_Lines, THEN THE Transpiler SHALL return empty TypeScript text and zero Diagnostics.

### Requirement 2: Syntax and type rewrite of the FFDec subset

**User Story:** As a developer, I want the AS3 syntax FFDec emits rewritten to TypeScript, so that translated classes look like normal code.

#### Acceptance Criteria

1. WHEN the input has a `package` block, THE Transpiler SHALL remove the `package` wrapper, keep the block's contents, and emit no namespace, whether the package name is empty or not.
2. WHEN the input has an `import flash.<package>.<Name>;` or `import flash.<package>.*;` line, THE Transpiler SHALL replace all such lines with one ES module import from `../shim` that lists only the names the class body references and the Shim exports (including non-flash Shim names such as `trace`), sorted by UTF-16 code unit order, and emits no import line if that list is empty.
3. WHEN the input has a metadata line of the form `[Name(...)]` (such as `[Embed(...)]` or `[SWF(...)]`) before a class, THE Transpiler SHALL drop the line and add no Diagnostic.
4. THE Transpiler SHALL translate `class` declarations with `extends`, fields (`var`, `const`, `static`), methods, constructors, getters, setters and the access modifiers `public`, `private`, `protected` and `internal`, where `internal` is emitted as no modifier.
5. THE Transpiler SHALL translate `int(x)` to `(x | 0)`, `uint(x)` to `(x >>> 0)` and the keyword `var` to `var`, and SHALL map the types `int`, `uint` and `Number` to `number`, `String` to `string`, `Boolean` to `boolean`, `*` to `any`, `Object` to `any`, `Array` to `any[]`, `void` to `void`, and `Vector.<T>` to `T[]` with `T` mapped by the same rules, and SHALL emit no Diagnostic for the `Object` mapping.
6. WHEN a method has the return type `*` and its body contains no `return` statement with an expression, THE Transpiler SHALL emit the return type `void` and no Diagnostic.
7. THE Transpiler SHALL translate `for each (var x in y)` to `for (const x of y)`, `a is T` to `a instanceof T`, `a instanceof T` to `a instanceof T`, `a as T` to `a as T`, and `trace(args)` to the call `trace(args)` of the function `trace` that the Shim exports.
8. IF a variable, parameter or field has no type annotation or has the type `*`, THEN THE Transpiler SHALL emit the type `any` and exactly one Diagnostic of kind `loose-type` for that declaration.

### Requirement 3: Flash-specific rewrites

**User Story:** As a developer, I want the decompiler's Flash-specific quirks undone, so that the translated classes run on the Shim without hand edits.

#### Acceptance Criteria

1. WHEN a constructor of a class with an `extends` clause calls `addFrameScript(...)` before `super(...)`, THE Transpiler SHALL emit `super(...)` with its original arguments as the first statement of that constructor and keep every other statement in its original relative order.
2. WHEN a class that has an `extends` clause has a constructor without a `super(...)` call, THE Transpiler SHALL insert `super();` as the first statement of that constructor.
3. WHEN a method is referenced as a value (`this.<method>` not followed by `(`, such as a listener argument or an `addFrameScript` argument), THE Transpiler SHALL emit that method so that `this` inside it refers to the declaring instance regardless of which object invokes it.
4. WHEN a member is accessed on `parent` (for example `this.parent.r_button`), THE Transpiler SHALL emit the access through a cast to `any` and add exactly one `loose-type` Diagnostic per such access.
5. WHEN the input contains a statement kind outside the subset (`try`, `switch`, `with`, `delete`, E4X, `namespace`, `use namespace`, an `include` directive, or a nested function expression), THE Transpiler SHALL replace that statement with an Unsupported_Construct comment inside the enclosing method body, add exactly one Diagnostic per replaced statement, and emit output in which the enclosing method still parses.
6. IF a class body contains an accessor pair where the getter and setter have different types, THEN THE Transpiler SHALL emit both with the getter's type and add exactly one `loose-type` Diagnostic per pair.

### Requirement 4: Translation report, type-check gate and pipeline integration

**User Story:** As a developer, I want the Pipeline to translate, check and report every class, so that failures are visible and the handwritten classes are no longer required.

#### Acceptance Criteria

1. WHEN the Convert stage succeeds, THE Translate_Stage SHALL run the Transpiler on every `.as` file in the scripts directory exported by the Unpacker and SHALL NOT read any file under `samples/*/original-source/`.
2. WHEN the Emitter writes the Emitted_Project, THE Emitter SHALL write each Translated_Class to `src/<ClassName>.ts`, and SHALL write `src/classes.ts` registering every class name that the Scene_JSON links to a symbol, using for each name the Override_Directory file if one exists and otherwise the Translated_Class. WHERE the Override_Directory file of a class is used, THE Pipeline SHALL record in the Translation_Report that the class is overridden.
3. WHEN a class has no Scene_JSON symbol linked to it, THE Pipeline SHALL emit its Translated_Class only if at least one other emitted Translated_Class extends it, so that `EventWatcher` is emitted for the Sample_Set.
4. WHEN the Pipeline finishes after Convert completed, THE Pipeline SHALL write `translation-report.json` in the output directory next to `unsupported-features.json`, containing exactly one entry per emitted class with the class name, the Class_Status, the Diagnostics sorted by line number and then by kind, and the type errors of that class, serialised as canonical JSON that is byte-identical across two runs on the same input.
5. WHEN the Translate_Stage emits a Translated_Class that contains one or more Unsupported_Constructs, THE Pipeline SHALL add to the Unsupported_Feature_List one entry of kind `untranslated-code` per construct, each naming the class and the line number. WHEN a class linked by the Scene_JSON has neither a Translated_Class nor an Override_Directory file, THE Pipeline SHALL add an `untranslated-class` entry naming that class to the Unsupported_Feature_List.
6. WHEN the Emitter has written the Emitted_Project, THE Pipeline SHALL run the Type_Check_Gate on it in-process with the TypeScript compiler API, resolving `pixi.js` from this repository's `node_modules` without running `npm install`, and SHALL attribute each reported error to the file it occurs in, recording errors in `src/<ClassName>.ts` on the entry of that class and errors in any other file in a separate `otherErrors` list of the Translation_Report.
7. IF the Type_Check_Gate reports one or more errors, THEN THE Pipeline SHALL print a summary naming each affected file with its error count, set the Class_Status of each class with at least one error to `unsupported`, and still write the Emitted_Project, `translation-report.json` and `unsupported-features.json`.

### Requirement 5: Shim additions and Sample_Set acceptance

**User Story:** As a developer, I want the sample classes to translate and run unchanged on the Shim, so that the handwritten files can be deleted.

#### Acceptance Criteria

1. THE Shim SHALL be extended only with the APIs that the four sample classes use and that it lacks, being `Event.EXIT_FRAME`, `Event.ADDED`, `Event.ADDED_TO_STAGE`, `Event.FRAME_CONSTRUCTED`, `Event.REMOVED`, `Event.REMOVED_FROM_STAGE`, `Event.RENDER`, `DisplayObjectContainer.getChildAt(index)`, a `Shape` class extending `DisplayObject`, and an exported function `trace(...args)`; each added Event constant SHALL be a distinct string value that differs from every existing Event constant. THE Shim SHALL dispatch only `ENTER_FRAME`, `EXIT_FRAME` and the mouse click event, so that a listener registered for any other added event type is accepted without error and is called 0 times.
2. WHEN a Tick runs, THE Shim SHALL dispatch `Event.EXIT_FRAME` exactly once to every MovieClip on the stage, after the frame scripts of that Tick have run. WHEN the Fixture_Classes of a Sample_Set sample are loaded and 31 Ticks have run, THE root `MainTimeline` SHALL be stopped.
3. THE `trace` function of the Shim SHALL write its arguments to `console.log` by default, and SHALL write to a replaceable sink instead WHEN a test replaces the sink.
4. WHEN the Shim is extended, THE repository SHALL list each added API in `template/shim/ADDED_APIS.md` with its name (including `trace`) and its source of need (the class name and line number that uses it), with one entry per API and no entry for an API that was not added.
5. WHEN the Pipeline converts `samples/clickgoto/test.swf` with an empty or absent Override_Directory, THE Pipeline SHALL emit `LeftButton`, `RightButton`, `EventWatcher` and `MainTimeline` as Translated_Classes, SHALL register exactly `LeftButton`, `RightButton` and `MainTimeline` in `src/classes.ts`, and SHALL emit 0 files copied from `handwritten/`. THE repository SHALL contain neither `handwritten/clickgoto/LeftButton.ts` nor `handwritten/clickgoto/RightButton.ts`, AND `npm run typecheck:handwritten` SHALL either be absent from `package.json` or exit with code 0 when the Override_Directory is empty.
6. WHEN the Pipeline converts `samples/clickgoto/test.swf`, THE Emitted_Project SHALL pass the Type_Check_Gate with 0 errors, AND `npm run build` in the Emitted_Project SHALL exit with code 0.
7. WHEN the Click_Oracle runs against the Fixture_Classes of `clickgoto`, THE Click_Oracle SHALL pass with the same Expected_State rows, with no row added, removed or changed, that it checked against the handwritten classes, and SHALL import no file under `handwritten/`.
8. WHEN the Pipeline converts `samples/tweendemo/test.swf`, THE Emitted_Project SHALL be built from Translated_Classes and SHALL pass the Type_Check_Gate with 0 errors, AND a new tweendemo test using the Fixture_Classes of `test/fixtures/tweendemo/scripts/` SHALL show `l_button` and `r_button` each on `currentFrame` 1 in the stopped state after the first Tick, importing no file under `handwritten/`.
9. WHEN the Pipeline converts a Sample_Set sample, THE Translation_Report SHALL list `EventWatcher`, `LeftButton`, `RightButton` and `MainTimeline` each with a Class_Status of `clean` or `loose`, and SHALL list 0 sample classes as `unsupported`.
